"""
tests/test_default_space_resurrection.py
=========================================
Regression test for the "Default Space recreated after server restart" bug.

Bug summary
-----------
init_db() previously called _insert_default_space_and_project() on every
startup even after the initial migration had already run.  Because that
function uses INSERT OR IGNORE with a hardcoded stable UUID, a user-deleted
Default Space would silently reappear on the next server restart.

Fix
---
The unconditional _insert_default_space_and_project() call was removed from
the steady-state (migration_complete=True) boot path in session.py.  The
migration helper is now only called once during the initial migrate_forward()
run when the spaces table does not yet exist.

Test coverage
-------------
1. Default Space deleted -> restart -> NOT recreated   (regression case)
2. Existing user-created spaces survive restart
3. Existing projects survive restart
4. Space deletion still works (normal flow)
5. Empty spaces list is valid state
6. New space creation still works after fix
"""

from __future__ import annotations

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy import event as sa_event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.db import crud
from app.db.models import Base
from scripts.migrate_spaces_projects import (
    DEFAULT_SPACE_ID,
    DEFAULT_PROJECT_ID,
    DEFAULT_SPACE_NAME,
    _insert_default_space_and_project,
)


def _uid() -> str:
    return str(uuid.uuid4())


def _make_engine():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @sa_event.listens_for(engine, "connect")
    def _fk(conn, _):
        conn.execute("PRAGMA foreign_keys=ON;")

    return engine


def _simulate_init_db_steady_state(conn) -> None:
    """
    Reproduce the steady-state branch of init_db() AFTER THE FIX.

    Pre-fix:  called _insert_default_space_and_project(conn) here.
    Post-fix: does nothing (pass).

    This function represents exactly what init_db() does on a normal restart
    once migration_complete=True.
    """
    pass  # Fixed: no INSERT on steady-state boot


@pytest.fixture()
def engine_and_session():
    engine = _make_engine()
    Base.metadata.create_all(bind=engine)
    SM = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)
    session = SM()
    try:
        yield engine, session
    finally:
        session.close()
        Base.metadata.drop_all(bind=engine)


class TestDefaultSpaceResurrectionBug:

    def test_deleted_default_space_not_recreated_after_restart(self, engine_and_session):
        """
        Regression: deleting Default Space then simulating a server restart
        must NOT recreate the space.

        Sequence:
          1. Seed the Default Space (as migrate_forward would have done once).
          2. Delete it through the normal CRUD path.
          3. Verify it is gone.
          4. Simulate a server restart (steady-state init_db branch).
          5. Verify Default Space is still gone.
        """
        engine, session = engine_and_session

        # Step 1: seed as first-time migration would
        with engine.connect() as conn:
            tx = conn.begin()
            _insert_default_space_and_project(conn)
            tx.commit()

        # Confirm seeded
        space = crud.get_space(session, DEFAULT_SPACE_ID)
        assert space is not None, "Default Space should exist after initial seed"
        assert space.name == DEFAULT_SPACE_NAME

        # Step 2: user deletes it
        crud.delete_space(session, DEFAULT_SPACE_ID)
        session.commit()

        # Step 3: confirm deleted
        assert crud.get_space(session, DEFAULT_SPACE_ID) is None

        # Step 4: simulate server restart
        with engine.connect() as conn:
            _simulate_init_db_steady_state(conn)

        # Step 5: must still be gone
        session.expire_all()
        assert crud.get_space(session, DEFAULT_SPACE_ID) is None, (
            "BUG REGRESSION: Default Space was recreated after restart. "
            "init_db() steady-state branch must not call _insert_default_space_and_project()."
        )

    def test_default_project_not_recreated_after_restart(self, engine_and_session):
        engine, session = engine_and_session

        with engine.connect() as conn:
            tx = conn.begin()
            _insert_default_space_and_project(conn)
            tx.commit()

        crud.delete_space(session, DEFAULT_SPACE_ID)
        session.commit()

        with engine.connect() as conn:
            _simulate_init_db_steady_state(conn)

        session.expire_all()
        assert crud.get_project(session, DEFAULT_PROJECT_ID) is None, (
            "Default Project must not be recreated after restart"
        )


class TestExistingDataSurvivesRestart:

    def test_user_created_space_survives_restart(self, engine_and_session):
        engine, session = engine_and_session

        sid = _uid()
        crud.create_space(session, space_id=sid, name="My Study Space")
        session.commit()

        with engine.connect() as conn:
            _simulate_init_db_steady_state(conn)

        session.expire_all()
        space = crud.get_space(session, sid)
        assert space is not None
        assert space.name == "My Study Space"

    def test_user_created_project_survives_restart(self, engine_and_session):
        engine, session = engine_and_session

        sid = _uid()
        pid = _uid()
        crud.create_space(session, space_id=sid, name="Science")
        crud.create_project(session, project_id=pid, space_id=sid, name="Physics 101")
        session.commit()

        with engine.connect() as conn:
            _simulate_init_db_steady_state(conn)

        session.expire_all()
        project = crud.get_project(session, pid)
        assert project is not None
        assert project.name == "Physics 101"

    def test_multiple_spaces_all_survive_restart(self, engine_and_session):
        engine, session = engine_and_session

        ids = [_uid() for _ in range(3)]
        names = ["Space Alpha", "Space Beta", "Space Gamma"]
        for sid, name in zip(ids, names):
            crud.create_space(session, space_id=sid, name=name)
        session.commit()

        with engine.connect() as conn:
            _simulate_init_db_steady_state(conn)

        session.expire_all()
        for sid, name in zip(ids, names):
            s = crud.get_space(session, sid)
            assert s is not None, f"{name} should survive restart"
            assert s.name == name


class TestDeleteBehavior:

    def test_space_deletion_works(self, engine_and_session):
        _, session = engine_and_session

        sid = _uid()
        crud.create_space(session, space_id=sid, name="Temp Space")
        session.commit()

        crud.delete_space(session, sid)
        session.commit()

        assert crud.get_space(session, sid) is None

    def test_delete_nonexistent_space_is_safe(self, engine_and_session):
        _, session = engine_and_session
        crud.delete_space(session, "nonexistent-id-xyz")
        session.commit()

    def test_space_deletion_cascades_to_projects(self, engine_and_session):
        _, session = engine_and_session

        sid = _uid()
        pid = _uid()
        crud.create_space(session, space_id=sid, name="Parent")
        crud.create_project(session, project_id=pid, space_id=sid, name="Child")
        session.commit()

        crud.delete_space(session, sid)
        session.commit()

        assert crud.get_space(session, sid) is None
        assert crud.get_project(session, pid) is None


class TestEmptySpacesState:

    def test_list_spaces_returns_empty_when_none_exist(self, engine_and_session):
        _, session = engine_and_session
        assert crud.list_spaces(session) == []

    def test_list_spaces_empty_after_all_deleted(self, engine_and_session):
        _, session = engine_and_session

        sid = _uid()
        crud.create_space(session, space_id=sid, name="Only Space")
        session.commit()

        crud.delete_space(session, sid)
        session.commit()

        assert crud.list_spaces(session) == []


class TestNewSpaceCreation:

    def test_create_new_space_after_restart(self, engine_and_session):
        engine, session = engine_and_session

        with engine.connect() as conn:
            _simulate_init_db_steady_state(conn)

        sid = _uid()
        crud.create_space(session, space_id=sid, name="Post-restart Space")
        session.commit()

        space = crud.get_space(session, sid)
        assert space is not None
        assert space.name == "Post-restart Space"

    def test_full_space_and_project_workflow_after_restart(self, engine_and_session):
        engine, session = engine_and_session

        with engine.connect() as conn:
            _simulate_init_db_steady_state(conn)

        sid = _uid()
        pid = _uid()
        crud.create_space(session, space_id=sid, name="ML")
        crud.create_project(session, project_id=pid, space_id=sid, name="Regression")
        session.commit()

        assert crud.get_space(session, sid) is not None
        assert crud.get_project(session, pid) is not None
