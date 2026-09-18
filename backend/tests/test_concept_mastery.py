"""Unit and integration tests for Concept Mastery tracking and project isolation."""

from collections.abc import Generator
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.projects import router as projects_router
from app.api.routes_progress import router as progress_router
from app.config import DEFAULT_USER_ID
from app.db import crud
from app.db.models import Base, ConceptMastery, ConceptMasteryHistory, Project, Space
from app.db.session import get_db


def _session_factory() -> sessionmaker[Session]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    return sessionmaker(bind=engine, expire_on_commit=False)


def _client(session_factory: sessionmaker[Session]) -> TestClient:
    app = FastAPI()
    app.include_router(projects_router)
    app.include_router(progress_router)

    def override_get_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def _create_test_space_and_project(db: Session, project_id: str = "proj-1", space_id: str = "space-1") -> Project:
    space = Space(id=space_id, name="Test Space")
    db.add(space)
    db.flush()
    project = Project(id=project_id, space_id=space_id, name="Test Project")
    db.add(project)
    db.commit()
    return project


def test_ema_neutral_prior():
    """First attempt uses neutral prior 50.0 and alpha 0.4: 0.4*75 + 0.6*50 = 60.0"""
    SessionLocal = _session_factory()
    with SessionLocal() as db:
        _create_test_space_and_project(db, "p1")
        row = crud.upsert_concept_mastery(
            db, project_id="p1", topic="Recursion", session_pct=75.0
        )
        assert row.concept == "recursion"
        assert row.score == 60.0
        assert row.attempt_count == 1

        history = db.query(ConceptMasteryHistory).filter_by(project_id="p1", concept="recursion").all()
        assert len(history) == 1
        assert history[0].score == 60.0


def test_ema_multiple_attempts_sequence():
    """Worked example:
    Start: 50
    Att 1 (75%): 0.4*75 + 0.6*50 = 60.0
    Att 2 (100%): 0.4*100 + 0.6*60 = 76.0
    Att 3 (25%): 0.4*25 + 0.6*76 = 55.6
    """
    SessionLocal = _session_factory()
    with SessionLocal() as db:
        _create_test_space_and_project(db, "p1")
        
        crud.upsert_concept_mastery(db, project_id="p1", topic="Recursion", session_pct=75.0)
        crud.upsert_concept_mastery(db, project_id="p1", topic="  recursion  ", session_pct=100.0)
        row3 = crud.upsert_concept_mastery(db, project_id="p1", topic="RECURSION", session_pct=25.0)

        assert row3.concept == "recursion"
        assert row3.score == 55.6
        assert row3.attempt_count == 3

        history = db.query(ConceptMasteryHistory).filter_by(project_id="p1", concept="recursion").order_by(ConceptMasteryHistory.id.asc()).all()
        assert len(history) == 3
        assert [h.score for h in history] == [60.0, 76.0, 55.6]


def test_ema_clamp_bounds():
    """Score stays clamped to [0.0, 100.0] even with extreme values."""
    SessionLocal = _session_factory()
    with SessionLocal() as db:
        _create_test_space_and_project(db, "p1")
        row_high = crud.upsert_concept_mastery(db, project_id="p1", topic="top", session_pct=200.0)
        assert row_high.score <= 100.0

        row_low = crud.upsert_concept_mastery(db, project_id="p1", topic="low", session_pct=-50.0)
        assert row_low.score >= 0.0


def test_isolation_same_concept_two_projects():
    """Mastery for same topic name across two projects is completely isolated."""
    SessionLocal = _session_factory()
    with SessionLocal() as db:
        _create_test_space_and_project(db, "proj-a", "space-a")
        _create_test_space_and_project(db, "proj-b", "space-b")

        crud.upsert_concept_mastery(db, project_id="proj-a", topic="Algorithms", session_pct=100.0)
        crud.upsert_concept_mastery(db, project_id="proj-b", topic="Algorithms", session_pct=0.0)

        mastery_a = crud.get_concept_mastery(db, "proj-a")
        mastery_b = crud.get_concept_mastery(db, "proj-b")

        assert len(mastery_a) == 1
        assert len(mastery_b) == 1
        assert mastery_a[0].score == 70.0  # 0.4*100 + 0.6*50
        assert mastery_b[0].score == 30.0  # 0.4*0 + 0.6*50
        assert mastery_a[0].score != mastery_b[0].score


def test_quiz_result_api_updates_mastery():
    """Submitting POST /progress/quiz-result updates mastery and can be retrieved via GET /projects/{id}/mastery."""
    session_factory = _session_factory()
    with session_factory() as db:
        _create_test_space_and_project(db, "proj-api", "space-api")

    client = _client(session_factory)
    payload = {
        "project_id": "proj-api",
        "document_id": "doc-1",
        "topic": "Binary Search",
        "results": [
            {"question": "Q1", "correct": True},
            {"question": "Q2", "correct": True},
            {"question": "Q3", "correct": True},
            {"question": "Q4", "correct": False},
        ],
    }

    resp = client.post("/progress/quiz-result", json=payload)
    assert resp.status_code == 204

    # Fetch mastery
    get_resp = client.get("/projects/proj-api/mastery")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["project_id"] == "proj-api"
    assert len(data["concepts"]) == 1
    assert data["concepts"][0]["concept"] == "binary search"
    assert data["concepts"][0]["score"] == 60.0  # 3/4 = 75%, 0.4*75 + 0.6*50 = 60.0
    assert data["concepts"][0]["attempt_count"] == 1


def test_mastery_history_api():
    """Verify GET /projects/{id}/mastery/history returns chronological score series."""
    session_factory = _session_factory()
    with session_factory() as db:
        _create_test_space_and_project(db, "proj-hist", "space-hist")

    client = _client(session_factory)
    # Quiz attempt 1
    client.post("/progress/quiz-result", json={
        "project_id": "proj-hist",
        "document_id": "doc-1",
        "topic": "Neural Networks",
        "results": [{"question": "Q1", "correct": True}],
    })
    # Quiz attempt 2
    client.post("/progress/quiz-result", json={
        "project_id": "proj-hist",
        "document_id": "doc-1",
        "topic": "Neural Networks",
        "results": [{"question": "Q2", "correct": True}],
    })

    resp = client.get("/projects/proj-hist/mastery/history")
    assert resp.status_code == 200
    data = resp.json()
    assert data["project_id"] == "proj-hist"
    assert len(data["series"]) == 1
    series = data["series"][0]
    assert series["concept"] == "neural networks"
    assert len(series["points"]) == 2
    assert series["points"][0]["score"] == 70.0
    assert series["points"][1]["score"] == 82.0
    assert "recorded_at" in series["points"][0]
