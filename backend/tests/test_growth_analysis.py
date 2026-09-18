"""Unit and integration tests for Growth Analysis trend computation and project isolation."""

from collections.abc import Generator
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.projects import router as projects_router
from app.api.routes_progress import router as progress_router
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


def _create_test_space_and_project(db: Session, project_id: str, space_id: str = "space-1") -> Project:
    space = Space(id=space_id, name="Test Space")
    db.add(space)
    db.flush()
    project = Project(id=project_id, space_id=space_id, name=f"Project {project_id}")
    db.add(project)
    db.commit()
    return project


# ---------------------------------------------------------------------------
# Unit tests: compute_growth_trend rules & boundaries
# ---------------------------------------------------------------------------

def test_insufficient_data_for_fewer_than_3_snapshots():
    """Concepts with 0, 1, or 2 snapshots must return 'insufficient_data' and None delta."""
    assert crud.compute_growth_trend([]) == ("insufficient_data", None)
    assert crud.compute_growth_trend([50.0]) == ("insufficient_data", None)
    assert crud.compute_growth_trend([50.0, 75.0]) == ("insufficient_data", None)


def test_k3_asymmetric_tradeoff():
    """At k=3, baseline is S1 (1 point) and recent is mean(S2, S3) (2 points)."""
    # Baseline = 50.0, Recent = (70.0 + 80.0) / 2 = 75.0 -> Delta = +25.0 -> improving
    trend, delta = crud.compute_growth_trend([50.0, 70.0, 80.0])
    assert trend == "improving"
    assert delta == 25.0

    # Baseline = 80.0, Recent = (50.0 + 40.0) / 2 = 45.0 -> Delta = -35.0 -> requires_attention
    trend, delta = crud.compute_growth_trend([80.0, 50.0, 40.0])
    assert trend == "requires_attention"
    assert delta == -35.0


def test_k4_symmetric_windows_and_classifications():
    """At k >= 4, baseline is mean(S_k-3, S_k-2) and recent is mean(S_k-1, S_k)."""
    # Baseline = (50+50)/2 = 50.0, Recent = (70+70)/2 = 70.0 -> Delta = +20.0
    trend, delta = crud.compute_growth_trend([50.0, 50.0, 70.0, 70.0])
    assert trend == "improving"
    assert delta == 20.0

    # Baseline = (70+70)/2 = 70.0, Recent = (50+50)/2 = 50.0 -> Delta = -20.0
    trend, delta = crud.compute_growth_trend([70.0, 70.0, 50.0, 50.0])
    assert trend == "requires_attention"
    assert delta == -20.0

    # Baseline = (60+62)/2 = 61.0, Recent = (61+63)/2 = 62.0 -> Delta = +1.0
    trend, delta = crud.compute_growth_trend([60.0, 62.0, 61.0, 63.0])
    assert trend == "stable"
    assert delta == 1.0


def test_threshold_exact_boundaries():
    """Test exact threshold boundaries: +5.0 (improving), -5.0 (requires_attention), +4.99 and -4.99 (stable)."""
    # Baseline = 50.0, Recent = 55.0 -> Delta exactly +5.0 (must be 'improving')
    trend, delta = crud.compute_growth_trend([50.0, 50.0, 55.0, 55.0])
    assert delta == 5.0
    assert trend == "improving"

    # Baseline = 50.0, Recent = 45.0 -> Delta exactly -5.0 (must be 'requires_attention')
    trend, delta = crud.compute_growth_trend([50.0, 50.0, 45.0, 45.0])
    assert delta == -5.0
    assert trend == "requires_attention"

    # Baseline = 50.0, Recent = 54.99 -> Delta +4.99 (must be 'stable')
    trend, delta = crud.compute_growth_trend([50.0, 50.0, 54.99, 54.99])
    assert delta == 4.99
    assert trend == "stable"

    # Baseline = 50.0, Recent = 45.01 -> Delta -4.99 (must be 'stable')
    trend, delta = crud.compute_growth_trend([50.0, 50.0, 45.01, 45.01])
    assert delta == -4.99
    assert trend == "stable"


def test_floating_point_rounding_robustness():
    """Floating point artifacts near 5.0 are rounded cleanly before threshold comparison."""
    # 55.00000000000001 - 50.0 -> rounds to 5.0 -> 'improving'
    trend, delta = crud.compute_growth_trend([50.0, 50.0, 55.00000000000001, 55.00000000000001])
    assert delta == 5.0
    assert trend == "improving"


# ---------------------------------------------------------------------------
# Integration tests: Batched history fetch & Project Isolation
# ---------------------------------------------------------------------------

def test_get_concept_mastery_history_batch():
    """Ensure batch history fetch returns correctly grouped scores across multiple concepts."""
    SessionLocal = _session_factory()
    with SessionLocal() as db:
        _create_test_space_and_project(db, "proj-batch")
        # Add history records
        db.add_all([
            ConceptMasteryHistory(project_id="proj-batch", concept="c1", score=50.0),
            ConceptMasteryHistory(project_id="proj-batch", concept="c1", score=60.0),
            ConceptMasteryHistory(project_id="proj-batch", concept="c2", score=80.0),
        ])
        db.commit()

        batch = crud.get_concept_mastery_history_batch(db, "proj-batch", ["c1", "c2", "c3"])
        assert batch["c1"] == [50.0, 60.0]
        assert batch["c2"] == [80.0]
        assert batch["c3"] == []


def test_project_isolation_growth_trend():
    """Concept 'recursion' has declining trend in Project A and improving trend in Project B."""
    SessionLocal = _session_factory()
    with SessionLocal() as db:
        _create_test_space_and_project(db, "proj-a", "space-a")
        _create_test_space_and_project(db, "proj-b", "space-b")

        # Project A: 4 declining snapshots [70, 70, 50, 50]
        db.add(ConceptMastery(project_id="proj-a", concept="recursion", score=50.0, attempt_count=4))
        for s in [70.0, 70.0, 50.0, 50.0]:
            db.add(ConceptMasteryHistory(project_id="proj-a", concept="recursion", score=s))

        # Project B: 4 improving snapshots [50, 50, 75, 75]
        db.add(ConceptMastery(project_id="proj-b", concept="recursion", score=75.0, attempt_count=4))
        for s in [50.0, 50.0, 75.0, 75.0]:
            db.add(ConceptMasteryHistory(project_id="proj-b", concept="recursion", score=s))

        db.commit()

    client = _client(SessionLocal)

    resp_a = client.get("/projects/proj-a/mastery")
    assert resp_a.status_code == 200
    data_a = resp_a.json()
    assert len(data_a["concepts"]) == 1
    assert data_a["concepts"][0]["concept"] == "recursion"
    assert data_a["concepts"][0]["trend"] == "requires_attention"
    assert data_a["concepts"][0]["trend_delta"] == -20.0
    assert data_a["concepts"][0]["snapshot_count"] == 4

    resp_b = client.get("/projects/proj-b/mastery")
    assert resp_b.status_code == 200
    data_b = resp_b.json()
    assert len(data_b["concepts"]) == 1
    assert data_b["concepts"][0]["concept"] == "recursion"
    assert data_b["concepts"][0]["trend"] == "improving"
    assert data_b["concepts"][0]["trend_delta"] == 25.0
    assert data_b["concepts"][0]["snapshot_count"] == 4
