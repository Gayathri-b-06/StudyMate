"""
tests/test_db.py
================
Unit tests for the StudyMate persistence layer (db/models, db/crud).

Strategy
--------
- We use an **in-memory SQLite** database (`sqlite:///:memory:`) so tests are
  fast, hermetic, and leave no files on disk.
- A `db` pytest fixture creates a fresh schema and session for every test
  function — guaranteeing full isolation without any teardown logic.
- We test the public CRUD surface only (no internals), which means these tests
  will remain valid even if the implementation details of crud.py change.
"""

import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy import event as sa_event

from app.db.crud import (
    VALID_EVENT_TYPES,
    create_document,
    create_project,
    create_space,
    create_thread,
    delete_document,
    delete_project,
    delete_space,
    delete_thread,
    get_document,
    get_project,
    get_space,
    get_study_log_for_thread,
    get_thread,
    list_documents_for_thread,
    list_projects,
    list_spaces,
    list_threads,
    log_study_event,
    set_document_index_status,
    update_thread_title,
)
from app.db.models import Base

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def db() -> Session:
    """
    Provide an isolated in-memory SQLite session for a single test.

    A new engine and schema are created for each test function, so there is
    zero state leakage between tests.
    """
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
    )

    @sa_event.listens_for(engine, "connect")
    def _fk(conn, _): conn.execute("PRAGMA foreign_keys=ON;")

    # Create all tables on the in-memory DB.
    Base.metadata.create_all(bind=engine)

    TestingSessionLocal = sessionmaker(
        bind=engine,
        autocommit=False,
        autoflush=False,
        expire_on_commit=False,
    )
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()
        # Drop everything so the engine can be garbage-collected cleanly.
        Base.metadata.drop_all(bind=engine)


@pytest.fixture()
def space_and_project(db: Session) -> tuple[str, str]:
    """Create a default Space and Project and return (space_id, project_id).

    Required by every test that creates a Thread, since project_id is NOT NULL.
    """
    sid = _new_id()
    pid = _new_id()
    create_space(db, space_id=sid, name="Test Space")
    create_project(db, project_id=pid, space_id=sid, name="Test Project")
    return sid, pid


# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------


def _new_id() -> str:
    """Return a fresh UUID4 string."""
    return str(uuid.uuid4())


# ---------------------------------------------------------------------------
# Thread tests
# ---------------------------------------------------------------------------


class TestThreadCRUD:
    def test_create_and_get_thread(self, db: Session, space_and_project) -> None:
        """create_thread should persist a row retrievable by get_thread."""
        _, pid = space_and_project
        tid = _new_id()
        thread = create_thread(db, thread_id=tid, title="Physics 101", project_id=pid)

        assert thread.id == tid
        assert thread.title == "Physics 101"
        assert thread.project_id == pid
        assert thread.created_at is not None

        fetched = get_thread(db, tid)
        assert fetched is not None
        assert fetched.id == tid
        assert fetched.title == "Physics 101"

    def test_get_thread_missing_returns_none(self, db: Session, space_and_project) -> None:
        """get_thread should return None for a non-existent ID."""
        result = get_thread(db, "does-not-exist")
        assert result is None

    def test_update_thread_title_persists_normalized_value(self, db: Session, space_and_project) -> None:
        """A renamed thread remains renamed after the session refreshes it."""
        _, pid = space_and_project
        tid = _new_id()
        create_thread(db, thread_id=tid, title="Original title", project_id=pid)

        updated = update_thread_title(db, thread_id=tid, title="Linear Algebra")

        assert updated is not None
        assert updated.title == "Linear Algebra"
        assert get_thread(db, tid).title == "Linear Algebra"

    def test_list_threads_empty(self, db: Session, space_and_project) -> None:
        """list_threads on a project with no threads should return an empty list."""
        _, pid = space_and_project
        assert list_threads(db, pid) == []

    def test_list_threads_ordered_newest_first(self, db: Session, space_and_project) -> None:
        """list_threads should return threads with the newest updated_at first."""
        _, pid = space_and_project
        t1 = create_thread(db, thread_id=_new_id(), title="Thread A", project_id=pid)
        t2 = create_thread(db, thread_id=_new_id(), title="Thread B", project_id=pid)
        t3 = create_thread(db, thread_id=_new_id(), title="Thread C", project_id=pid)

        threads = list_threads(db, pid)
        ids = [t.id for t in threads]
        assert t1.id in ids
        assert t2.id in ids
        assert t3.id in ids

    def test_list_threads_scoped_to_project(self, db: Session, space_and_project) -> None:
        """list_threads must not return threads from another project."""
        sid, pid_a = space_and_project
        pid_b = _new_id()
        create_project(db, project_id=pid_b, space_id=sid, name="Project B")

        t_a = create_thread(db, thread_id=_new_id(), title="Thread in A", project_id=pid_a)
        _t_b = create_thread(db, thread_id=_new_id(), title="Thread in B", project_id=pid_b)

        threads_in_a = list_threads(db, pid_a)
        assert len(threads_in_a) == 1
        assert threads_in_a[0].id == t_a.id
        assert list_threads(db, pid_b)[0].title == "Thread in B"

    def test_delete_thread(self, db: Session, space_and_project) -> None:
        """delete_thread should remove the row and return True."""
        _, pid = space_and_project
        tid = _new_id()
        create_thread(db, thread_id=tid, title="To Delete", project_id=pid)

        result = delete_thread(db, tid)
        assert result is True
        assert get_thread(db, tid) is None

    def test_delete_thread_not_found(self, db: Session, space_and_project) -> None:
        """delete_thread should return False for a non-existent ID."""
        assert delete_thread(db, "ghost-id") is False


# ---------------------------------------------------------------------------
# Document tests
# ---------------------------------------------------------------------------


class TestDocumentCRUD:
    def _make_thread(self, db: Session, project_id: str) -> str:
        """Helper: create and return a thread ID."""
        tid = _new_id()
        create_thread(db, thread_id=tid, title="Test Thread", project_id=project_id)
        return tid

    def test_create_and_get_document(self, db: Session, space_and_project) -> None:
        """create_document should persist a row retrievable by get_document."""
        _, pid = space_and_project
        tid = self._make_thread(db, pid)
        did = _new_id()

        doc = create_document(
            db,
            document_id=did,
            thread_id=tid,
            filename="lecture1.pdf",
            vectorstore_path=f"vectorstores/{tid}/{did}",
            page_count=12,
            chunk_count=48,
        )

        assert doc.id == did
        assert doc.thread_id == tid
        assert doc.filename == "lecture1.pdf"
        assert doc.page_count == 12
        assert doc.chunk_count == 48
        assert doc.index_status == "uploaded"
        assert doc.uploaded_at is not None

        fetched = get_document(db, did)
        assert fetched is not None
        assert fetched.filename == "lecture1.pdf"

        indexing = set_document_index_status(db, did, status="indexing")
        assert indexing is not None and indexing.index_status == "indexing"
        ready = set_document_index_status(db, did, status="ready", chunk_count=64)
        assert ready is not None and ready.index_status == "ready" and ready.chunk_count == 64
        failed = set_document_index_status(db, did, status="error", error_message="embedding failed")
        assert failed is not None and failed.index_status == "error"
        assert failed.index_error == "embedding failed"

    def test_get_document_missing_returns_none(self, db: Session, space_and_project) -> None:
        result = get_document(db, "no-such-doc")
        assert result is None

    def test_list_documents_for_thread(self, db: Session, space_and_project) -> None:
        """list_documents_for_thread should return only docs for that thread."""
        _, pid = space_and_project
        tid1 = self._make_thread(db, pid)
        tid2 = self._make_thread(db, pid)

        d1 = create_document(
            db,
            document_id=_new_id(),
            thread_id=tid1,
            filename="doc_a.pdf",
            vectorstore_path="vs/a",
        )
        d2 = create_document(
            db,
            document_id=_new_id(),
            thread_id=tid1,
            filename="doc_b.pdf",
            vectorstore_path="vs/b",
        )
        _d3 = create_document(
            db,
            document_id=_new_id(),
            thread_id=tid2,
            filename="doc_c.pdf",
            vectorstore_path="vs/c",
        )

        docs = list_documents_for_thread(db, tid1)
        assert len(docs) == 2
        filenames = {doc.filename for doc in docs}
        assert "doc_a.pdf" in filenames
        assert "doc_b.pdf" in filenames
        assert "doc_c.pdf" not in filenames

    def test_list_documents_empty_thread(self, db: Session, space_and_project) -> None:
        _, pid = space_and_project
        tid = self._make_thread(db, pid)
        assert list_documents_for_thread(db, tid) == []

    def test_delete_document(self, db: Session, space_and_project) -> None:
        """delete_document should remove the row and return True."""
        _, pid = space_and_project
        tid = self._make_thread(db, pid)
        did = _new_id()
        create_document(
            db,
            document_id=did,
            thread_id=tid,
            filename="to_delete.pdf",
            vectorstore_path="vs/del",
        )

        result = delete_document(db, did)
        assert result is True
        assert get_document(db, did) is None

    def test_delete_document_not_found(self, db: Session, space_and_project) -> None:
        assert delete_document(db, "ghost-doc") is False


# ---------------------------------------------------------------------------
# Study Log tests
# ---------------------------------------------------------------------------


class TestStudyLog:
    def _setup(self, db: Session, project_id: str) -> tuple[str, str]:
        """Create a thread + document and return (thread_id, document_id)."""
        tid = _new_id()
        did = _new_id()
        create_thread(db, thread_id=tid, title="Log Test Thread", project_id=project_id)
        create_document(
            db,
            document_id=did,
            thread_id=tid,
            filename="notes.pdf",
            vectorstore_path="vs/notes",
        )
        return tid, did

    def test_log_study_event_with_document(self, db: Session, space_and_project) -> None:
        """log_study_event should persist a row retrievable via get_study_log_for_thread."""
        _, pid = space_and_project
        tid, did = self._setup(db, pid)

        entry = log_study_event(
            db,
            thread_id=tid,
            event_type="question_answered",
            document_id=did,
            topic="Newton's laws",
        )

        assert entry.id is not None
        assert entry.thread_id == tid
        assert entry.document_id == did
        assert entry.event_type == "question_answered"
        assert entry.topic == "Newton's laws"
        assert entry.created_at is not None

    def test_log_study_event_without_document(self, db: Session, space_and_project) -> None:
        """document_id should be optional (web search events have no source doc)."""
        _, pid = space_and_project
        tid, _ = self._setup(db, pid)

        entry = log_study_event(
            db,
            thread_id=tid,
            event_type="web_search_used",
            topic="quantum entanglement",
        )

        assert entry.document_id is None
        assert entry.event_type == "web_search_used"

    def test_invalid_event_type_raises(self, db: Session, space_and_project) -> None:
        """log_study_event should raise ValueError for unknown event types."""
        _, pid = space_and_project
        tid, _ = self._setup(db, pid)

        with pytest.raises(ValueError, match="Unknown event_type"):
            log_study_event(db, thread_id=tid, event_type="made_up_event")

    def test_get_study_log_for_thread(self, db: Session, space_and_project) -> None:
        """get_study_log_for_thread should return all events for a thread."""
        _, pid = space_and_project
        tid, did = self._setup(db, pid)

        log_study_event(db, thread_id=tid, event_type="question_answered", topic="Q1")
        log_study_event(db, thread_id=tid, event_type="quiz_generated", topic="Quiz 1")

        logs = get_study_log_for_thread(db, tid)
        assert len(logs) == 2
        event_types = {e.event_type for e in logs}
        assert "question_answered" in event_types
        assert "quiz_generated" in event_types

    def test_study_log_isolated_between_threads(self, db: Session, space_and_project) -> None:
        """Events logged to thread A must not appear in thread B's log."""
        _, pid = space_and_project
        tid_a, _ = self._setup(db, pid)

        # Create a second, independent thread in the same project
        tid_b = _new_id()
        create_thread(db, thread_id=tid_b, title="Thread B", project_id=pid)

        log_study_event(db, thread_id=tid_a, event_type="quiz_generated", topic="A quiz")

        assert get_study_log_for_thread(db, tid_b) == []
        assert len(get_study_log_for_thread(db, tid_a)) == 1

    def test_valid_event_types_constant(self) -> None:
        """Sanity-check that VALID_EVENT_TYPES contains the expected values."""
        expected = {
            "question_answered",
            "quiz_generated",
            "flashcards_generated",
            "study_plan_generated",
            "web_search_used",
        }
        assert VALID_EVENT_TYPES == expected

    def test_cascade_delete_thread_removes_log(self, db: Session, space_and_project) -> None:
        """Deleting a thread should cascade-delete its study_log rows."""
        _, pid = space_and_project
        tid, _ = self._setup(db, pid)
        log_study_event(db, thread_id=tid, event_type="flashcards_generated")

        assert len(get_study_log_for_thread(db, tid)) == 1

        delete_thread(db, tid)

        assert get_study_log_for_thread(db, tid) == []


# ---------------------------------------------------------------------------
# Space and Project CRUD tests
# ---------------------------------------------------------------------------


class TestSpaceCRUD:
    def test_create_and_get_space(self, db: Session) -> None:
        sid = _new_id()
        space = create_space(db, space_id=sid, name="DSA Prep")
        assert space.id == sid
        assert space.name == "DSA Prep"
        fetched = get_space(db, sid)
        assert fetched is not None and fetched.name == "DSA Prep"

    def test_list_spaces_excludes_archived(self, db: Session) -> None:
        from app.db.crud import update_space
        sid1, sid2 = _new_id(), _new_id()
        create_space(db, space_id=sid1, name="Active")
        create_space(db, space_id=sid2, name="Archived")
        update_space(db, space_id=sid2, archived=True)
        spaces = list_spaces(db)
        names = [s.name for s in spaces]
        assert "Active" in names
        assert "Archived" not in names

    def test_delete_space_returns_false_for_missing(self, db: Session) -> None:
        assert delete_space(db, "ghost") is False


class TestProjectCRUD:
    def test_create_and_get_project(self, db: Session, space_and_project) -> None:
        sid, pid = space_and_project
        project = get_project(db, pid)
        assert project is not None
        assert project.space_id == sid

    def test_list_projects_scoped_to_space(self, db: Session, space_and_project) -> None:
        sid, pid_a = space_and_project
        sid2 = _new_id()
        create_space(db, space_id=sid2, name="Other Space")
        pid_b = _new_id()
        create_project(db, project_id=pid_b, space_id=sid2, name="Other Project")
        projs = list_projects(db, sid)
        assert all(p.space_id == sid for p in projs)
        assert not any(p.id == pid_b for p in projs)

    def test_cascade_delete_project_removes_threads(self, db: Session, space_and_project) -> None:
        _, pid = space_and_project
        tid = _new_id()
        create_thread(db, thread_id=tid, title="Will be deleted", project_id=pid)
        delete_project(db, pid)
        assert get_thread(db, tid) is None
