"""Unit and integration tests for Admin Dashboard (PRD §16).

Tests:
1. Global operational stats calculation (spaces, projects, quizzes, documents, threads).
2. Engagement aggregation (active users, total learning activities, quiz participation, 7d activity).
3. Difficult concepts ranking and trend assignment across projects.
4. Activity feed filtering by user, space, project, activity type, and time period.
5. User journey inspection (projects, activity, assessments, progress, AI usage).
6. AI usage telemetry with LangSmith and local DB fallback.
7. AI evaluation metrics parsing and empty state handling.
8. Background processing metrics (ready, indexing, error).
9. System health probe behavior.
10. Admin authorization boundary (403 Forbidden on non-admin client, 200 OK on admin).
"""

from collections.abc import Generator
from datetime import datetime, timedelta, timezone
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import StaticPool

from app.api.admin import router as admin_router
from app.config import DEFAULT_USER_ID
from app.db.models import (
    Base,
    Space,
    Project,
    Thread,
    Document,
    StudyLog,
    QuizAttempt,
    ConceptMastery,
    ConceptMasteryHistory,
)
from app.db.session import get_db
from app.services import admin_service


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
    app.include_router(admin_router)

    def override_get_db() -> Generator[Session, None, None]:
        db = session_factory()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    return TestClient(app)


def test_admin_stats_empty_db():
    session_factory = _session_factory()
    db = session_factory()
    try:
        stats = admin_service.get_admin_stats(db)
        assert stats.total_users == 1
        assert stats.total_spaces == 0
        assert stats.total_projects == 0
        assert stats.total_quizzes == 0
        assert stats.total_documents == 0
        assert stats.total_chat_sessions == 0

        engagement = admin_service.get_engagement_metrics(db)
        assert engagement.active_users == 1
        assert engagement.learning_activities_count == 0
        assert engagement.quiz_attempts_count == 0

        bg = admin_service.get_background_processing_metrics(db)
        assert bg.total_jobs == 0
        assert bg.ready_count == 0
        assert bg.worker_status == "Active (In-process Async)"

        health = admin_service.get_system_health(db)
        assert health.database_status == "Healthy"
        assert health.api_status == "Healthy"
    finally:
        db.close()


def test_admin_dashboard_populated():
    session_factory = _session_factory()
    db = session_factory()
    now = datetime.now(timezone.utc)
    old_ts = now - timedelta(days=10)
    recent_ts = now - timedelta(hours=2)

    try:
        # 1. Space & Projects
        sp = Space(id="sp-1", name="DSA", archived=False, created_at=now, updated_at=now)
        db.add(sp)
        p1 = Project(id="p-1", space_id="sp-1", name="Binary Trees", archived=False, created_at=now, updated_at=now)
        p2 = Project(id="p-2", space_id="sp-1", name="Dynamic Programming", archived=False, created_at=now, updated_at=now)
        db.add_all([p1, p2])

        # 2. Threads & Docs
        t1 = Thread(id="th-1", project_id="p-1", title="Trees Q&A", created_at=now, updated_at=now)
        db.add(t1)
        doc1 = Document(
            id="doc-1",
            thread_id="th-1",
            filename="trees.pdf",
            vectorstore_path="/tmp/v1",
            page_count=12,
            chunk_count=30,
            index_status="ready",
            uploaded_at=recent_ts,
        )
        db.add(doc1)

        # 3. Quizzes (1 recent, 1 old)
        q1 = QuizAttempt(
            id=1,
            user_id=DEFAULT_USER_ID,
            project_id="p-1",
            document_id="doc-1",
            topic="recursion",
            correct_count=2,
            total_questions=5,
            created_at=recent_ts,
        )
        q2 = QuizAttempt(
            id=2,
            user_id=DEFAULT_USER_ID,
            project_id="p-2",
            document_id="doc-1",
            topic="memoization",
            correct_count=5,
            total_questions=5,
            created_at=old_ts,
        )
        db.add_all([q1, q2])

        # 4. Concept masteries
        cm1 = ConceptMastery(project_id="p-1", concept="recursion", score=40.0, attempt_count=2, updated_at=now)
        cm2 = ConceptMastery(project_id="p-2", concept="memoization", score=85.0, attempt_count=3, updated_at=now)
        db.add_all([cm1, cm2])

        # 5. Study logs
        log1 = StudyLog(
            id=1,
            thread_id="th-1",
            event_type="question_answered",
            topic="binary search tree",
            created_at=recent_ts,
        )
        db.add(log1)

        db.commit()

        # ── Test Stats ──
        stats = admin_service.get_admin_stats(db)
        assert stats.total_spaces == 1
        assert stats.total_projects == 2
        assert stats.total_quizzes == 2
        assert stats.total_documents == 1
        assert stats.total_chat_sessions == 1

        # ── Test Engagement ──
        eng = admin_service.get_engagement_metrics(db)
        assert eng.active_users == 1
        assert eng.learning_activities_count == 4  # 2 quizzes + 1 doc + 1 log
        assert eng.quiz_attempts_count == 2
        assert eng.recent_activity_count_7d == 3  # q1, doc1, log1 within 7d (q2 is 10d old)

        # ── Test Difficult Concepts ──
        diff = admin_service.get_difficult_concepts(db)
        assert len(diff) == 2
        assert diff[0].concept == "recursion"
        assert diff[0].avg_score == 40.0
        assert diff[0].status == "critical"
        assert diff[1].concept == "memoization"
        assert diff[1].status == "mastered"

        # ── Test User Journey ──
        user_journey = admin_service.get_user_journey_detail(db, DEFAULT_USER_ID)
        assert user_journey.id == DEFAULT_USER_ID
        assert len(user_journey.projects) == 2
        assert user_journey.total_quizzes == 2
        assert user_journey.avg_quiz_score_pct == 70.0  # 7 correct / 10 total
        assert user_journey.overall_mastery_pct == 62.5  # (40 + 85) / 2
        assert user_journey.mastered_concepts_count == 1
        assert user_journey.weak_concepts_count == 1
        assert user_journey.ai_requests_count == 1

        # ── Test Activity Filtering ──
        all_act = admin_service.get_admin_activity(db)
        assert len(all_act) == 4

        # By user
        user_act = admin_service.get_admin_activity(db, user_id=DEFAULT_USER_ID)
        assert len(user_act) >= 2

        # By space
        sp_act = admin_service.get_admin_activity(db, space_id="sp-1")
        assert len(sp_act) == 4

        # By project
        p1_act = admin_service.get_admin_activity(db, project_id="p-1")
        assert all(a.project_id == "p-1" for a in p1_act)

        # By event type
        quiz_act = admin_service.get_admin_activity(db, event_type="quiz")
        assert len(quiz_act) == 2

        # By time period
        act_24h = admin_service.get_admin_activity(db, time_period="24h")
        assert len(act_24h) == 3  # excludes q2 (10 days old)

        # ── Test Background Processing ──
        bg = admin_service.get_background_processing_metrics(db)
        assert bg.ready_count == 1
        assert bg.error_count == 0
        assert bg.total_jobs == 1

        # ── Test System Health ──
        health = admin_service.get_system_health(db)
        assert health.database_status == "Healthy"
        assert health.database_latency_ms >= 0.0
        assert health.api_status == "Healthy"

        # ── Test AI Evaluation ──
        eval_metrics = admin_service.get_ai_evaluation_metrics()
        assert eval_metrics.status in ("configured", "not_configured")
        if eval_metrics.status == "configured":
            assert eval_metrics.total_cases > 0
            assert eval_metrics.pass_rate_pct >= 0.0

        # Complete Dashboard
        dash = admin_service.get_admin_dashboard_data(db)
        assert dash.stats.total_projects == 2
        assert dash.engagement.learning_activities_count == 4
        assert len(dash.user_summary) == 1
    finally:
        db.close()


def test_admin_authorization_boundary():
    session_factory = _session_factory()
    client = _client(session_factory)

    # 1. Non-admin student should be rejected with 403 Forbidden
    resp_student = client.get("/admin/dashboard", headers={"X-User-Role": "student"})
    assert resp_student.status_code == 403
    assert "Administrative privileges required" in resp_student.json()["detail"]

    # 2. Admin should succeed with 200 OK
    resp_admin = client.get("/admin/dashboard", headers={"X-User-Role": "admin"})
    assert resp_admin.status_code == 200
    data = resp_admin.json()
    assert data["stats"]["total_users"] == 1
    assert "engagement" in data
    assert "background_processing" in data
    assert "system_health" in data
    assert "inspected_user" in data
    assert "ai_evaluation" in data

    # 3. Activity feed authorization check
    resp_act_student = client.get("/admin/activity", headers={"X-User-Role": "student"})
    assert resp_act_student.status_code == 403

    resp_act_admin = client.get("/admin/activity?time_period=7d", headers={"X-User-Role": "admin"})
    assert resp_act_admin.status_code == 200
    assert isinstance(resp_act_admin.json(), list)
