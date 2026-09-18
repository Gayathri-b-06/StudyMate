"""Tests for user-scoped long-term memory persistence."""

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.db import crud
from app.db.models import Base, MemoryFactType, Project, Space
from app.tools.memory_tool import get_memory_context
from scripts.migrate_spaces_projects import (
    DEFAULT_PROJECT_ID,
    DEFAULT_PROJECT_NAME,
    DEFAULT_SPACE_ID,
    DEFAULT_SPACE_NAME,
)


def test_user_memory_is_scoped_and_formats_compact_context() -> None:
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as init_db:
        init_db.add(Space(id=DEFAULT_SPACE_ID, name=DEFAULT_SPACE_NAME))
        init_db.flush()
        init_db.add(Project(id=DEFAULT_PROJECT_ID, space_id=DEFAULT_SPACE_ID, name=DEFAULT_PROJECT_NAME))
        init_db.commit()

    db = sessionmaker(bind=engine)()
    crud.save_user_memory(db, "user-a", DEFAULT_PROJECT_ID, MemoryFactType.WEAK_TOPIC, "backpropagation", "Missed 3 of 5 questions.")
    crud.save_user_memory(db, "user-a", DEFAULT_PROJECT_ID, MemoryFactType.STUDIED_TOPIC, "neural networks", "Studied neural networks.")
    crud.save_user_memory(db, "user-b", DEFAULT_PROJECT_ID, MemoryFactType.WEAK_TOPIC, "calculus", "Needs review.")

    assert [item.topic for item in crud.get_user_memory(db, "user-a", DEFAULT_PROJECT_ID)] == ["neural networks", "backpropagation"]
    context = get_memory_context(db, "user-a", DEFAULT_PROJECT_ID)
    assert "backpropagation" in context
    assert "neural networks" in context
    assert "calculus" not in context
