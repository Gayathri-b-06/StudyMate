"""Unit and integration tests for Global Home Dashboard & Analytics (PRD §16 & §17).

Validates:
1. Multi-project aggregation math (unweighted concept mastery, total quizzes, accuracy).
2. Exhaustive project status classification ("Mastered" >= 75%, "In Progress" fallback, "New" 0 attempts, and 7-day inactivity cue).
3. Study streak calculation (today, yesterday, broken gaps, valid event types).
4. Cross-project recommendation ranking calling generate_recommendations().
5. Multi-tenant isolation (user_id data separation).
6. Empty-state resilience (zero spaces/projects returns clean zero-safe schema).
7. FastAPI endpoint GET /analytics/global.
"""

from collections.abc import Generator
from datetime import datetime, timedelta, timezone
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.routes_analytics import router as analytics_router
from app.config import DEFAULT_USER_ID
from app.db import crud
from app.db.models import (
    Base,
    ConceptMastery,
    ConceptMasteryHistory,
    Document,
    MemoryFactType,
    Project,
    QuizAttempt,
    Space,
    StudyLog,
    Thread,
    UserMemory,
)
from app.db.session import get_db
from app.services.analytics_service import _calculate_study_streak, get_global_dashboard_data


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
    app.include_router(analytics_router)

    def override_get_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


@pytest.fixture
def db() -> Generator[Session, None, None]:
    factory = _session_factory()
    session = factory()
    try:
        yield session
    finally:
        session.close()


def test_empty_state(db: Session) -> None:
    """Empty state returns zero-safe stats without exceptions."""
    resp = get_global_dashboard_data(db, user_id=DEFAULT_USER_ID)
    assert resp.stats.total_spaces == 0
    assert resp.stats.total_projects == 0
    assert resp.stats.overall_mastery == 0.0
    assert resp.stats.study_streak_days == 0
    assert resp.stats.total_quizzes_taken == 0
    assert resp.stats.quiz_accuracy_pct == 0
    assert resp.stats.total_topics_studied == 0
    assert resp.active_projects == []
    assert resp.top_recommendation is None
    assert resp.recent_activity == []
    assert resp.last_active_project is None


def test_multi_project_aggregation(db: Session) -> None:
    """Validate cross-project stats aggregation and 75% Mastered threshold."""
    # 1. Create space and projects
    space = Space(id="s1", name="CS Core")
    db.add(space)

    p1 = Project(id="p1", space_id="s1", name="DSA")
    p2 = Project(id="p2", space_id="s1", name="Databases")
    p3 = Project(id="p3", space_id="s1", name="Operating Systems")
    db.add_all([p1, p2, p3])
    db.commit()

    # 2. Add concept masteries:
    # P1: arrays (60.0), recursion (90.0) -> P1 average = 75.0% ("Mastered")
    # P2: sql (60.0) -> P2 average = 60.0% ("In Progress")
    # P3: no concepts -> P3 average = 0.0% ("New")
    cm1 = ConceptMastery(project_id="p1", concept="arrays", score=60.0, attempt_count=1)
    cm2 = ConceptMastery(project_id="p1", concept="recursion", score=90.0, attempt_count=2)
    cm3 = ConceptMastery(project_id="p2", concept="sql", score=60.0, attempt_count=1)
    db.add_all([cm1, cm2, cm3])

    # 3. Add quiz attempts:
    # P1: 8/10 correct
    # P2: 6/10 correct
    qa1 = QuizAttempt(
        user_id=DEFAULT_USER_ID,
        project_id="p1",
        document_id="doc1",
        topic="arrays",
        correct_count=8,
        total_questions=10,
    )
    qa2 = QuizAttempt(
        user_id=DEFAULT_USER_ID,
        project_id="p2",
        document_id="doc2",
        topic="sql",
        correct_count=6,
        total_questions=10,
    )
    db.add_all([qa1, qa2])
    db.commit()

    resp = get_global_dashboard_data(db, user_id=DEFAULT_USER_ID)

    assert resp.stats.total_spaces == 1
    assert resp.stats.total_projects == 3
    # Unweighted average of (60 + 90 + 60) / 3 = 70.0
    assert resp.stats.overall_mastery == 70.0
    assert resp.stats.total_quizzes_taken == 2
    # Accuracy: (8 + 6) / 20 = 70%
    assert resp.stats.quiz_accuracy_pct == 70
    assert resp.stats.total_topics_studied >= 2

    # Verify project statuses
    proj_by_id = {p.id: p for p in resp.active_projects}
    assert proj_by_id["p1"].status == "Mastered"
    assert proj_by_id["p1"].progress_pct == 75.0
    assert proj_by_id["p1"].concept_count == 2
    assert proj_by_id["p1"].needs_attention is False

    assert proj_by_id["p2"].status == "In Progress"
    assert proj_by_id["p2"].progress_pct == 60.0
    assert proj_by_id["p2"].concept_count == 1

    assert proj_by_id["p3"].status == "New"
    assert proj_by_id["p3"].progress_pct == 0.0
    assert proj_by_id["p3"].concept_count == 0
    assert proj_by_id["p3"].needs_attention is False

    # A non-zero mastery score can only be derived from tracked concepts.
    assert all(
        project.progress_pct == 0 or project.concept_count > 0
        for project in resp.active_projects
    )


def test_inactivity_cue_and_exhaustive_status(db: Session) -> None:
    """Verify that projects with progress < 75% are In Progress, with needs_attention for > 7d inactivity."""
    now = datetime.now(timezone.utc)
    space = Space(id="s1", name="Prep")
    db.add(space)

    # Active project (studied today)
    p_active = Project(id="p_active", space_id="s1", name="Active Project", updated_at=now)
    # Inactive project (studied 10 days ago)
    p_inactive = Project(
        id="p_inactive",
        space_id="s1",
        name="Inactive Project",
        updated_at=now - timedelta(days=10),
    )
    db.add_all([p_active, p_inactive])

    cm_act = ConceptMastery(project_id="p_active", concept="graphs", score=50.0, attempt_count=1)
    cm_inact = ConceptMastery(project_id="p_inactive", concept="trees", score=60.0, attempt_count=1)
    db.add_all([cm_act, cm_inact])

    # Quiz attempt 10 days ago for p_inactive
    qa_old = QuizAttempt(
        user_id=DEFAULT_USER_ID,
        project_id="p_inactive",
        document_id="doc_old",
        topic="trees",
        correct_count=6,
        total_questions=10,
        created_at=now - timedelta(days=10),
    )
    qa_new = QuizAttempt(
        user_id=DEFAULT_USER_ID,
        project_id="p_active",
        document_id="doc_new",
        topic="graphs",
        correct_count=5,
        total_questions=10,
        created_at=now,
    )
    db.add_all([qa_old, qa_new])
    db.commit()

    resp = get_global_dashboard_data(db, user_id=DEFAULT_USER_ID)
    proj_map = {p.id: p for p in resp.active_projects}

    assert proj_map["p_active"].status == "In Progress"
    assert proj_map["p_active"].needs_attention is False

    assert proj_map["p_inactive"].status == "In Progress"
    assert proj_map["p_inactive"].needs_attention is True


def test_streak_calculation() -> None:
    """Verify consecutive vs broken day calculations."""
    now = datetime(2026, 9, 17, 12, 0, tzinfo=timezone.utc)

    # Today + Yesterday -> Streak = 2
    dates = [
        datetime(2026, 9, 17, 10, 0, tzinfo=timezone.utc),
        datetime(2026, 9, 16, 15, 0, tzinfo=timezone.utc),
    ]
    assert _calculate_study_streak(dates, now) == 2

    # Today + Yesterday + 2 days ago -> Streak = 3
    dates_3 = [
        datetime(2026, 9, 17, 10, 0, tzinfo=timezone.utc),
        datetime(2026, 9, 16, 15, 0, tzinfo=timezone.utc),
        datetime(2026, 9, 15, 8, 0, tzinfo=timezone.utc),
    ]
    assert _calculate_study_streak(dates_3, now) == 3

    # Only 2 days ago (gap yesterday and today) -> Streak = 0
    broken_dates = [
        datetime(2026, 9, 15, 10, 0, tzinfo=timezone.utc),
        datetime(2026, 9, 14, 15, 0, tzinfo=timezone.utc),
    ]
    assert _calculate_study_streak(broken_dates, now) == 0


def test_cross_project_recommendation_ranking(db: Session) -> None:
    """Verify that cross-project recommendations call generate_recommendations and rank P1 > P2."""
    space = Space(id="s1", name="Space 1")
    db.add(space)

    p1 = Project(id="p1", space_id="s1", name="Project P1")
    p2 = Project(id="p2", space_id="s1", name="Project P2")
    db.add_all([p1, p2])

    # In P1: concept with score < 50 (P2: Critical Mastery Gap)
    cm_p1 = ConceptMastery(project_id="p1", concept="memory-leaks", score=40.0, attempt_count=1)
    db.add(cm_p1)

    # In P2: concept with trend == 'requires_attention' (P1: Regressing Concept)
    cm_p2 = ConceptMastery(project_id="p2", concept="concurrency", score=80.0, attempt_count=3)
    db.add(cm_p2)
    # Add history snapshots to trigger requires_attention (drop from 95 to 80)
    now = datetime.now(timezone.utc)
    h1 = ConceptMasteryHistory(project_id="p2", concept="concurrency", score=95.0, recorded_at=now - timedelta(days=2))
    h2 = ConceptMasteryHistory(project_id="p2", concept="concurrency", score=90.0, recorded_at=now - timedelta(days=1))
    h3 = ConceptMasteryHistory(project_id="p2", concept="concurrency", score=80.0, recorded_at=now)
    db.add_all([h1, h2, h3])
    db.commit()

    resp = get_global_dashboard_data(db, user_id=DEFAULT_USER_ID)

    assert resp.top_recommendation is not None
    # Concurrency in P2 is P1 (regressing), which outranks memory-leaks in P1 (P2)
    assert resp.top_recommendation.concept == "concurrency"
    assert resp.top_recommendation.priority == 1
    assert resp.top_recommendation.project_id == "p2"


def test_tenant_isolation(db: Session) -> None:
    """Verify that User A never includes User B's quiz attempts or memories."""
    s = Space(id="s-iso", name="Shared Workspace")
    p = Project(id="p-iso", space_id="s-iso", name="Project Shared")
    db.add_all([s, p])

    # User A attempt: 10/10
    qa_a = QuizAttempt(
        user_id="user_a",
        project_id="p-iso",
        document_id="doc_a",
        topic="python",
        correct_count=10,
        total_questions=10,
    )
    # User B attempt: 2/10
    qa_b = QuizAttempt(
        user_id="user_b",
        project_id="p-iso",
        document_id="doc_b",
        topic="python",
        correct_count=2,
        total_questions=10,
    )
    db.add_all([qa_a, qa_b])
    db.commit()

    resp_a = get_global_dashboard_data(db, user_id="user_a")
    assert resp_a.stats.total_quizzes_taken == 1
    assert resp_a.stats.quiz_accuracy_pct == 100

    resp_b = get_global_dashboard_data(db, user_id="user_b")
    assert resp_b.stats.total_quizzes_taken == 1
    assert resp_b.stats.quiz_accuracy_pct == 20


def test_api_endpoint(db: Session) -> None:
    """GET /analytics/global returns 200 and well-formed payload."""
    factory = _session_factory()
    # Seed one space & project
    with factory() as session:
        s = Space(id="s-test", name="General")
        session.add(s)
        p = Project(id="p-test", space_id="s-test", name="Intro")
        session.add(p)
        session.commit()

    client = _client(factory)
    res = client.get("/analytics/global")
    assert res.status_code == 200
    data = res.json()
    assert "stats" in data
    assert "active_projects" in data
    assert "top_recommendation" in data
    assert "recent_activity" in data
    assert "difficult_concepts" in data
    assert data["difficult_concepts"] == []
    assert data["stats"]["total_projects"] == 1


def test_global_dashboard_full_branching_and_difficult_concepts(db: Session) -> None:
    """Test full=True vs full=False payload branching and DifficultConceptItem sorting."""
    factory = _session_factory()
    with factory() as session:
        s = Space(id="s-branch", name="Computer Science")
        session.add(s)
        p = Project(id="p-branch", space_id="s-branch", name="Algorithms")
        session.add(p)

        # Seed 3 concept masteries with distinct scores
        cm1 = ConceptMastery(
            project_id="p-branch",
            concept="dynamic programming",
            score=32.5,
            attempt_count=6,
        )
        cm2 = ConceptMastery(
            project_id="p-branch",
            concept="graph traversal",
            score=18.0,
            attempt_count=8,
        )
        cm3 = ConceptMastery(
            project_id="p-branch",
            concept="binary search",
            score=88.0,
            attempt_count=3,
        )
        session.add_all([cm1, cm2, cm3])

        # Seed 6 quiz attempts so total activities exceed summary limit of 4
        now = datetime.now(timezone.utc)
        for i in range(6):
            qa = QuizAttempt(
                user_id=DEFAULT_USER_ID,
                project_id="p-branch",
                document_id="doc-test",
                topic=f"topic-{i}",
                correct_count=i,
                total_questions=5,
                created_at=now - timedelta(minutes=i * 10),
            )
            session.add(qa)
        session.commit()

        # 1. Summary call (full=False)
        summary = get_global_dashboard_data(session, user_id=DEFAULT_USER_ID, full=False)
        assert len(summary.recent_activity) <= 4
        assert len(summary.recommendations) <= 2
        assert summary.difficult_concepts == []

        # 2. Deep call (full=True)
        full_res = get_global_dashboard_data(session, user_id=DEFAULT_USER_ID, full=True)
        assert len(full_res.recent_activity) == 6
        assert len(full_res.difficult_concepts) == 3

        # 3. Verify DifficultConceptItem sorting (ascending by mastery score: 18.0 -> 32.5 -> 88.0)
        assert full_res.difficult_concepts[0].concept == "graph traversal"
        assert full_res.difficult_concepts[0].mastery_score == 18.0
        assert full_res.difficult_concepts[0].project_name == "Algorithms"
        assert full_res.difficult_concepts[0].space_name == "Computer Science"

        assert full_res.difficult_concepts[1].concept == "dynamic programming"
        assert full_res.difficult_concepts[1].mastery_score == 32.5

        assert full_res.difficult_concepts[2].concept == "binary search"
        assert full_res.difficult_concepts[2].mastery_score == 88.0

    # 4. Test API endpoint with query param ?full=true vs default
    client = _client(factory)
    resp_default = client.get("/analytics/global")
    assert resp_default.status_code == 200
    data_default = resp_default.json()
    assert data_default["difficult_concepts"] == []
    assert len(data_default["recent_activity"]) <= 4

    resp_full_api = client.get("/analytics/global?full=true")
    assert resp_full_api.status_code == 200
    data_full = resp_full_api.json()
    assert len(data_full["difficult_concepts"]) == 3
    assert data_full["difficult_concepts"][0]["concept"] == "graph traversal"
    assert data_full["difficult_concepts"][0]["mastery_score"] == 18.0
    assert len(data_full["recent_activity"]) == 6
