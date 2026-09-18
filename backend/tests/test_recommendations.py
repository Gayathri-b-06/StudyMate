"""Unit and integration tests for Study Recommendations engine (PRD §10).

Validates:
1. Targeted regression test: score >= 75 with 'requires_attention' resolves to P1 (never P4 or fall-through).
2. P2: Critical Mastery Gap (score < 50).
3. P3: Plateauing developing concept (50 <= score < 75, stable/weak topic).
4. P4: Improving/mastered with specific gaps ((score >= 75 or improving) and trend != 'requires_attention' and weak_topic).
5. P5: Unassessed weak topic.
6. Intentional fall-through: mid-range score with insufficient data and no weak topic produces no recommendation.
7. Ranking, sorting (priority ASC, score ASC, recency DESC), and top-3 capping.
8. Multi-project data isolation.
9. FastAPI endpoint GET /projects/{project_id}/recommendations.
"""

from collections.abc import Generator
from datetime import datetime, timezone
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.projects import router as projects_router
from app.config import DEFAULT_USER_ID
from app.db import crud
from app.db.models import (
    Base,
    ConceptMastery,
    ConceptMasteryHistory,
    MemoryFactType,
    Project,
    Space,
    UserMemory,
)
from app.db.session import get_db
from app.services.project_service import ProjectNotFoundError
from app.services.recommendations_service import generate_recommendations


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

    def override_get_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def _create_space_and_project(db: Session, project_id: str, space_id: str = "space-1") -> Project:
    existing_space = db.query(Space).filter(Space.id == space_id).first()
    if not existing_space:
        space = Space(id=space_id, name="Test Space")
        db.add(space)
        db.flush()
    project = Project(id=project_id, space_id=space_id, name=f"Project {project_id}")
    db.add(project)
    db.commit()
    return project


def _seed_concept(
    db: Session,
    project_id: str,
    concept: str,
    current_score: float,
    history_scores: list[float] | None = None,
) -> ConceptMastery:
    row = ConceptMastery(
        project_id=project_id,
        concept=concept,
        score=current_score,
        attempt_count=len(history_scores) if history_scores else 1,
        updated_at=datetime.now(timezone.utc),
    )
    db.add(row)
    db.flush()
    if history_scores:
        for s in history_scores:
            h = ConceptMasteryHistory(
                project_id=project_id,
                concept=concept,
                score=s,
                recorded_at=datetime.now(timezone.utc),
            )
            db.add(h)
        db.flush()
    db.commit()
    return row


def _seed_weak_topic(
    db: Session,
    project_id: str,
    topic: str,
    detail: str = "Missed questions on this topic",
    user_id: str = DEFAULT_USER_ID,
) -> UserMemory:
    fact = UserMemory(
        user_id=user_id,
        project_id=project_id,
        fact_type=MemoryFactType.WEAK_TOPIC,
        topic=topic,
        detail=detail,
        reason="quiz_score",
        created_at=datetime.now(timezone.utc),
    )
    db.add(fact)
    db.commit()
    return fact


# ---------------------------------------------------------------------------
# 1. Targeted Regression Test for Score >= 75 and 'requires_attention'
# ---------------------------------------------------------------------------


def test_regression_high_score_declining_concept_resolves_to_p1_without_weak_topic():
    """Concept with score 80 and trend 'requires_attention' (declining from 95 to 80)

    without a weak-topic entry MUST resolve to P1 (critical decline), NEVER fall through.
    """
    factory = _session_factory()
    with factory() as db:
        _create_space_and_project(db, "proj-reg-1")
        # History showing steep decline: [95.0, 92.0, 80.0] -> delta = 80 - 93.5 = -13.5 -> requires_attention
        _seed_concept(db, "proj-reg-1", "Recursion", 80.0, [95.0, 92.0, 80.0])

        recs = generate_recommendations(db, "proj-reg-1")
        assert len(recs) == 1, "Must produce exactly 1 recommendation (not fall through)"
        rec = recs[0]
        assert rec.concept == "Recursion"
        assert rec.priority == 1
        assert rec.urgency == "critical"
        assert rec.trend == "requires_attention"
        assert "Understanding was strong" in rec.gap_description
        assert "regressing" in rec.gap_description
        assert "arrest the decline" in rec.action_recommendation
        assert "Understanding has improved" not in rec.gap_description


def test_regression_high_score_declining_concept_resolves_to_p1_with_weak_topic():
    """Concept with score 80 and trend 'requires_attention' WITH an active weak-topic entry

    MUST resolve to P1, and NEVER match P4 ("Understanding has improved").
    """
    factory = _session_factory()
    with factory() as db:
        _create_space_and_project(db, "proj-reg-2")
        _seed_concept(db, "proj-reg-2", "Recursion", 80.0, [95.0, 92.0, 80.0])
        _seed_weak_topic(db, "proj-reg-2", "Recursion", "Struggled with base cases")

        recs = generate_recommendations(db, "proj-reg-2")
        assert len(recs) == 1
        rec = recs[0]
        assert rec.concept == "Recursion"
        assert rec.priority == 1
        assert rec.urgency == "critical"
        assert "Understanding has improved" not in rec.gap_description
        assert "regressing" in rec.gap_description


# ---------------------------------------------------------------------------
# 2. Priority Tiers (P2, P3, P4, P5)
# ---------------------------------------------------------------------------


def test_p2_critical_mastery_gap():
    """Concept with score < 50 and trend != 'requires_attention' fires P2."""
    factory = _session_factory()
    with factory() as db:
        _create_space_and_project(db, "proj-p2")
        _seed_concept(db, "proj-p2", "Dynamic Programming", 35.0, [30.0, 32.0, 35.0])

        recs = generate_recommendations(db, "proj-p2")
        assert len(recs) == 1
        rec = recs[0]
        assert rec.concept == "Dynamic Programming"
        assert rec.priority == 2
        assert rec.urgency == "critical"
        assert rec.score == 35.0
        assert "Mastery score is low at 35%" in rec.gap_description
        assert "foundational grasp" in rec.action_recommendation


def test_p3_plateauing_concept():
    """Concept with 50 <= score < 75 and trend == 'stable' fires P3 with plateau wording."""
    factory = _session_factory()
    with factory() as db:
        _create_space_and_project(db, "proj-p3")
        # [60.0, 60.0, 60.0, 61.0] -> stable
        _seed_concept(db, "proj-p3", "Binary Trees", 60.0, [60.0, 60.0, 60.0, 61.0])

        recs = generate_recommendations(db, "proj-p3")
        assert len(recs) == 1
        rec = recs[0]
        assert rec.concept == "Binary Trees"
        assert rec.priority == 3
        assert rec.urgency == "moderate"
        assert "plateaued" in rec.gap_description
        assert "75% mastery threshold" in rec.action_recommendation
        assert rec.snapshot_count == 4


def test_p3_weak_topic_without_stable_trend_branches_diagnosis_accurately():
    """Live scenario: concept with score 54%, trend 'insufficient_data' (2 snapshots),

    and weak-topic flag MUST NOT claim it 'has plateaued'. Instead, diagnosis must state
    recent quiz results flagged it as a weak area.
    """
    factory = _session_factory()
    with factory() as db:
        _create_space_and_project(db, "proj-p3-weak")
        # 2 snapshots -> insufficient_data
        _seed_concept(db, "proj-p3-weak", "Regression", 54.0, [60.0, 50.0])
        _seed_weak_topic(db, "proj-p3-weak", "Regression", "Struggled with loss function")

        recs = generate_recommendations(db, "proj-p3-weak")
        assert len(recs) == 1
        rec = recs[0]
        assert rec.concept == "Regression"
        assert rec.priority == 3
        assert rec.urgency == "moderate"
        assert rec.snapshot_count == 2, "Snapshot count must reflect the 2 recorded history rows"
        assert rec.trend == "insufficient_data"
        # Must NOT claim plateaued
        assert "plateaued" not in rec.gap_description
        # Must accurately claim weak area flagged by quiz/study results
        assert "flagged this as a weak area" in rec.gap_description
        assert "Struggled with loss function" in rec.reason


def test_p4_improving_with_specific_mistakes_prd_example():
    """PRD §10 Example: Concept with high score or improving trend + weak topic log."""
    factory = _session_factory()
    with factory() as db:
        _create_space_and_project(db, "proj-p4")
        # [50.0, 60.0, 78.0, 82.0] -> improving, score >= 75
        _seed_concept(db, "proj-p4", "Concept C", 82.0, [50.0, 60.0, 78.0, 82.0])
        _seed_weak_topic(db, "proj-p4", "Concept C", "application-based questions remain difficult")

        recs = generate_recommendations(db, "proj-p4")
        assert len(recs) == 1
        rec = recs[0]
        assert rec.concept == "Concept C"
        assert rec.priority == 4
        assert rec.urgency == "low"
        assert "Understanding has improved (82%)" in rec.gap_description
        assert "application-based questions remain difficult" in rec.reason


def test_p5_unassessed_weak_topic():
    """Weak topic fact in memory with no concept mastery record fires P5."""
    factory = _session_factory()
    with factory() as db:
        _create_space_and_project(db, "proj-p5")
        _seed_weak_topic(db, "proj-p5", "Graph Theory", "Missed quiz questions on Dijkstra")

        recs = generate_recommendations(db, "proj-p5")
        assert len(recs) == 1
        rec = recs[0]
        assert rec.concept == "Graph Theory"
        assert rec.priority == 5
        assert rec.urgency == "low"
        assert rec.score is None
        assert rec.trend is None
        assert "Take an initial diagnostic quiz" in rec.action_recommendation


# ---------------------------------------------------------------------------
# 3. Intentional Fall-Through
# ---------------------------------------------------------------------------


def test_intentional_fall_through_insufficient_data_mid_range():
    """Concepts with mid-range score, 'insufficient_data' trend, and NO weak topic

    intentionally produce NO recommendation (no empirical evidence yet).
    """
    factory = _session_factory()
    with factory() as db:
        _create_space_and_project(db, "proj-ft-1")
        # 1 snapshot -> insufficient_data
        _seed_concept(db, "proj-ft-1", "Heaps", 65.0, [65.0])

        recs = generate_recommendations(db, "proj-ft-1")
        assert len(recs) == 0, "Should intentionally produce no recommendation"


def test_intentional_fall_through_mastered_without_mistakes():
    """Concepts with score >= 75, stable/improving trend, and NO weak topic

    intentionally produce NO recommendation (mastered and doing well).
    """
    factory = _session_factory()
    with factory() as db:
        _create_space_and_project(db, "proj-ft-2")
        # [80.0, 85.0, 90.0] -> improving
        _seed_concept(db, "proj-ft-2", "Arrays", 90.0, [80.0, 85.0, 90.0])

        recs = generate_recommendations(db, "proj-ft-2")
        assert len(recs) == 0, "Mastered concept with no weaknesses needs no intervention"


# ---------------------------------------------------------------------------
# 4. Ranking, Tie-Breaking, and Top-3 Capping
# ---------------------------------------------------------------------------


def test_ranking_and_cap_limit_3():
    """Verifies that candidates across all priority tiers are correctly sorted

    by priority ASC, score ASC, and capped at 3.
    """
    factory = _session_factory()
    with factory() as db:
        _create_space_and_project(db, "proj-rank")
        # P1: Declining concept (score 65, requires_attention)
        _seed_concept(db, "proj-rank", "P1_Concept", 65.0, [80.0, 75.0, 65.0])
        # P2: Critical gap A (score 30)
        _seed_concept(db, "proj-rank", "P2_Concept_Low", 30.0, [30.0])
        # P2: Critical gap B (score 45)
        _seed_concept(db, "proj-rank", "P2_Concept_Mid", 45.0, [45.0])
        # P3: Plateau (score 60)
        _seed_concept(db, "proj-rank", "P3_Concept", 60.0, [60.0, 60.0, 60.0, 60.0])
        # P5: Unassessed topic
        _seed_weak_topic(db, "proj-rank", "P5_Unassessed", "Needs review")

        recs = generate_recommendations(db, "proj-rank", limit=3)
        assert len(recs) == 3
        # 1st: P1 (priority 1)
        assert recs[0].concept == "P1_Concept"
        assert recs[0].priority == 1
        # 2nd: P2 with lowest score (30 < 45)
        assert recs[1].concept == "P2_Concept_Low"
        assert recs[1].priority == 2
        # 3rd: P2 with score 45
        assert recs[2].concept == "P2_Concept_Mid"
        assert recs[2].priority == 2


# ---------------------------------------------------------------------------
# 5. Project Isolation
# ---------------------------------------------------------------------------


def test_project_isolation():
    """Recommendations for Project A never leak into Project B."""
    factory = _session_factory()
    with factory() as db:
        _create_space_and_project(db, "proj-iso-a")
        _create_space_and_project(db, "proj-iso-b")

        # Add data only in Project A
        _seed_concept(db, "proj-iso-a", "Algorithms_A", 40.0, [40.0])
        _seed_weak_topic(db, "proj-iso-a", "Algorithms_A", "Slow at sorting")

        # Project A should get 1 recommendation
        recs_a = generate_recommendations(db, "proj-iso-a")
        assert len(recs_a) == 1
        assert recs_a[0].concept == "Algorithms_A"

        # Project B has no concepts or weak topics -> 0 recommendations
        recs_b = generate_recommendations(db, "proj-iso-b")
        assert len(recs_b) == 0


def test_nonexistent_project_raises_not_found():
    """Querying recommendations for an invalid project id raises ProjectNotFoundError."""
    factory = _session_factory()
    with factory() as db:
        with pytest.raises(ProjectNotFoundError):
            generate_recommendations(db, "nonexistent-project-xyz")


# ---------------------------------------------------------------------------
# 6. API Endpoint GET /projects/{project_id}/recommendations
# ---------------------------------------------------------------------------


def test_api_endpoint_recommendations():
    """Integration test for GET /projects/{project_id}/recommendations."""
    factory = _session_factory()
    client = _client(factory)

    with factory() as db:
        _create_space_and_project(db, "proj-api-test")
        _seed_concept(db, "proj-api-test", "API Concept", 42.0, [42.0])

    resp = client.get("/projects/proj-api-test/recommendations")
    assert resp.status_code == 200
    data = resp.json()
    assert data["project_id"] == "proj-api-test"
    assert len(data["recommendations"]) == 1
    rec = data["recommendations"][0]
    assert rec["concept"] == "API Concept"
    assert rec["priority"] == 2
    assert rec["urgency"] == "critical"
    assert "Triggered because" in rec["reason"]


def test_api_endpoint_404_for_unknown_project():
    """GET /projects/{project_id}/recommendations returns 404 for unknown project."""
    factory = _session_factory()
    client = _client(factory)

    resp = client.get("/projects/unknown-proj-999/recommendations")
    assert resp.status_code == 404
