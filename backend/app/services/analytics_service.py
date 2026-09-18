"""Analytics application service providing account-wide aggregations (PRD §16 & §17).

Aggregates stats, active projects, streak days, cross-project recommendations,
and recent activity in a single optimized database session.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import DEFAULT_USER_ID
from app.db import crud
from app.db.models import (
    ConceptMastery,
    Document,
    MemoryFactType,
    Project,
    QuizAttempt,
    Space,
    StudyLog,
    Thread,
    UserMemory,
)
from app.schemas.analytics import (
    ActivityFeedItem,
    DifficultConceptItem,
    GlobalDashboardResponse,
    GlobalDashboardStats,
    GlobalRecommendationItem,
    ProjectSummaryItem,
)
from app.services.recommendations_service import generate_recommendations


def get_global_dashboard_data(
    db: Session,
    user_id: str = DEFAULT_USER_ID,
    full: bool = False,
) -> GlobalDashboardResponse:
    """Return unified account-level metrics, active projects, and top recommendation."""
    now = datetime.now(timezone.utc)

    # 1. Fetch user's non-archived spaces and projects
    space_query = db.query(Space).filter(Space.archived == False, Space.user_id == user_id)  # noqa: E712
    spaces = space_query.all()
    space_map = {s.id: s for s in spaces}
    space_ids = list(space_map.keys())

    if not space_ids:
        # Zero-state: user has no active spaces
        empty_stats = GlobalDashboardStats(
            total_spaces=0,
            total_projects=0,
            overall_mastery=0.0,
            study_streak_days=0,
            total_quizzes_taken=0,
            quiz_accuracy_pct=0,
            total_topics_studied=0,
        )
        return GlobalDashboardResponse(
            stats=empty_stats,
            active_projects=[],
            top_recommendation=None,
            recent_activity=[],
            last_active_project=None,
        )

    projects = (
        db.query(Project)
        .filter(Project.space_id.in_(space_ids), Project.archived == False)  # noqa: E712
        .all()
    )
    project_map = {p.id: p for p in projects}
    project_ids = list(project_map.keys())

    if not project_ids:
        # User has space(s) but 0 projects
        empty_stats = GlobalDashboardStats(
            total_spaces=len(spaces),
            total_projects=0,
            overall_mastery=0.0,
            study_streak_days=0,
            total_quizzes_taken=0,
            quiz_accuracy_pct=0,
            total_topics_studied=0,
        )
        return GlobalDashboardResponse(
            stats=empty_stats,
            active_projects=[],
            top_recommendation=None,
            recent_activity=[],
            last_active_project=None,
        )

    # 2. Fetch all concept masteries across user's active projects
    all_concept_masteries = (
        db.query(ConceptMastery)
        .filter(ConceptMastery.project_id.in_(project_ids))
        .all()
    )
    masteries_by_project: dict[str, list[ConceptMastery]] = {pid: [] for pid in project_ids}
    for cm in all_concept_masteries:
        masteries_by_project[cm.project_id].append(cm)

    # Overall mastery: unweighted arithmetic average of all tracked concepts
    if all_concept_masteries:
        overall_mastery = round(
            sum(float(cm.score) for cm in all_concept_masteries) / len(all_concept_masteries),
            1,
        )
    else:
        overall_mastery = 0.0

    # 3. Fetch quiz attempts across user's active projects
    all_quiz_attempts = (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.user_id == user_id,
            QuizAttempt.project_id.in_(project_ids),
        )
        .order_by(QuizAttempt.created_at.desc())
        .all()
    )
    attempts_by_project: dict[str, list[QuizAttempt]] = {pid: [] for pid in project_ids}
    for qa in all_quiz_attempts:
        attempts_by_project[qa.project_id].append(qa)

    total_quizzes = len(all_quiz_attempts)
    total_questions = sum(qa.total_questions or 0 for qa in all_quiz_attempts)
    total_correct = sum(qa.correct_count or 0 for qa in all_quiz_attempts)
    quiz_accuracy = (
        round((total_correct / total_questions) * 100) if total_questions > 0 else 0
    )

    # 4. Count distinct topics studied (from quiz attempts & studied_topic memories)
    studied_memories = (
        db.query(UserMemory)
        .filter(
            UserMemory.user_id == user_id,
            UserMemory.project_id.in_(project_ids),
            UserMemory.fact_type == MemoryFactType.STUDIED_TOPIC,
        )
        .all()
    )
    distinct_topics: set[str] = set()
    for qa in all_quiz_attempts:
        norm = (qa.topic or "").strip().lower()
        if norm:
            distinct_topics.add(norm)
    for mem in studied_memories:
        norm = (mem.topic or "").strip().lower()
        if norm:
            distinct_topics.add(norm)
    for cm in all_concept_masteries:
        norm = (cm.concept or "").strip().lower()
        if norm:
            distinct_topics.add(norm)

    total_topics_studied = len(distinct_topics)

    # 5. Document and Thread counts per project
    doc_counts_query = (
        db.query(Thread.project_id, func.count(Document.id))
        .join(Document, Document.thread_id == Thread.id)
        .filter(Thread.project_id.in_(project_ids))
        .group_by(Thread.project_id)
        .all()
    )
    doc_count_map = {pid: count for pid, count in doc_counts_query}

    thread_counts_query = (
        db.query(Thread.project_id, func.count(Thread.id))
        .filter(Thread.project_id.in_(project_ids))
        .group_by(Thread.project_id)
        .all()
    )
    thread_count_map = {pid: count for pid, count in thread_counts_query}

    # 6. Study logs for streak and activity (filtering by verified VALID_EVENT_TYPES)
    study_logs = (
        db.query(StudyLog, Thread.project_id)
        .join(Thread, Thread.id == StudyLog.thread_id)
        .filter(
            Thread.project_id.in_(project_ids),
            StudyLog.event_type.in_(crud.VALID_EVENT_TYPES),
        )
        .order_by(StudyLog.created_at.desc())
        .all()
    )

    # Documents timestamps for activity / streak
    recent_docs = (
        db.query(Document, Thread.project_id)
        .join(Thread, Thread.id == Document.thread_id)
        .filter(Thread.project_id.in_(project_ids))
        .order_by(Document.uploaded_at.desc())
        .limit(20)
        .all()
    )

    # 7. Calculate study streak (consecutive calendar days ending today or yesterday)
    active_timestamps: list[datetime] = []
    for qa in all_quiz_attempts:
        if qa.created_at:
            active_timestamps.append(qa.created_at)
    for log_entry, _pid in study_logs:
        if log_entry.created_at:
            active_timestamps.append(log_entry.created_at)
    for doc_entry, _pid in recent_docs:
        if doc_entry.uploaded_at:
            active_timestamps.append(doc_entry.uploaded_at)

    streak_days = _calculate_study_streak(active_timestamps, now)

    # 8. Build Project Summary items
    project_items: list[ProjectSummaryItem] = []
    for p in projects:
        proj_masteries = masteries_by_project.get(p.id, [])
        proj_attempts = attempts_by_project.get(p.id, [])
        space_name = space_map[p.space_id].name if p.space_id in space_map else "Unknown Space"

        # Project-level progress %: mean of concept masteries
        if proj_masteries:
            progress_pct = round(
                sum(float(cm.score) for cm in proj_masteries) / len(proj_masteries),
                1,
            )
        else:
            progress_pct = 0.0

        # Last studied timestamp
        proj_timestamps: list[datetime] = []
        if p.updated_at:
            proj_timestamps.append(p.updated_at if p.updated_at.tzinfo else p.updated_at.replace(tzinfo=timezone.utc))
        for qa in proj_attempts:
            if qa.created_at:
                proj_timestamps.append(qa.created_at if qa.created_at.tzinfo else qa.created_at.replace(tzinfo=timezone.utc))
        for log_entry, pid in study_logs:
            if pid == p.id and log_entry.created_at:
                proj_timestamps.append(log_entry.created_at if log_entry.created_at.tzinfo else log_entry.created_at.replace(tzinfo=timezone.utc))

        last_studied = max(proj_timestamps) if proj_timestamps else p.created_at


        # Status:
        # - "New": 0 attempts and 0 tracked concepts
        # - "Mastered": tracked concepts and progress >= 75%
        # - "In Progress": fallback for all other projects with tracked concepts
        if len(proj_attempts) == 0 and len(proj_masteries) == 0:
            status = "New"
            needs_attention = False
        elif progress_pct >= 75.0:
            status = "Mastered"
            needs_attention = False
        else:
            status = "In Progress"
            # Inactivity cue: inactive for > 7 days
            if last_studied:
                dt = last_studied if last_studied.tzinfo else last_studied.replace(tzinfo=timezone.utc)
                needs_attention = (now - dt).total_seconds() > (7 * 86400)
            else:
                needs_attention = True

        project_items.append(
            ProjectSummaryItem(
                id=p.id,
                name=p.name,
                space_id=p.space_id,
                space_name=space_name,
                progress_pct=progress_pct,
                concept_count=len(proj_masteries),
                document_count=doc_count_map.get(p.id, 0),
                thread_count=thread_count_map.get(p.id, 0),
                last_studied=last_studied,
                status=status,
                needs_attention=needs_attention,
            )
        )

    # Sort projects: active/recently studied first
    def _proj_sort_key(pi: ProjectSummaryItem) -> float:
        if pi.last_studied:
            dt = pi.last_studied if pi.last_studied.tzinfo else pi.last_studied.replace(tzinfo=timezone.utc)
            return -dt.timestamp()
        return 0.0

    project_items.sort(key=_proj_sort_key)
    last_active_project = project_items[0] if project_items else None

    # 9. Cross-Project "Recommended Next" via generate_recommendations()
    all_recommendations: list[tuple[GlobalRecommendationItem, float]] = []
    for p in projects:
        space_name = space_map[p.space_id].name if p.space_id in space_map else "Unknown Space"
        try:
            recs = generate_recommendations(db, p.id, user_id=user_id, limit=3)
            p_ts = (
                p.updated_at.timestamp()
                if p.updated_at
                else (p.created_at.timestamp() if p.created_at else 0.0)
            )
            for r in recs:
                g_item = GlobalRecommendationItem(
                    concept=r.concept,
                    priority=r.priority,
                    urgency=r.urgency,
                    score=r.score,
                    trend=r.trend,
                    trend_delta=r.trend_delta,
                    gap_description=r.gap_description,
                    action_recommendation=r.action_recommendation,
                    reason=r.reason,
                    project_id=p.id,
                    project_name=p.name,
                    space_name=space_name,
                )
                all_recommendations.append((g_item, p_ts))
        except Exception:
            continue

    # Rank recommendations using the EXACT same sort key as recommendations_service:
    # 1. priority (1 to 5 ascending)
    # 2. score (lowest score first; None treated as 999.0)
    # 3. project timestamp descending (-ts)
    def _rec_sort_key(entry: tuple[GlobalRecommendationItem, float]):
        item, ts = entry
        score_val = item.score if item.score is not None else 999.0
        return (item.priority, score_val, -ts)

    all_recommendations.sort(key=_rec_sort_key)
    top_recommendation = all_recommendations[0][0] if all_recommendations else None

    # 10. Unified Recent Activity Feed (top 10 events across all projects)
    activity_entries: list[ActivityFeedItem] = []

    for qa in all_quiz_attempts[:15]:
        p = project_map.get(qa.project_id)
        if p and qa.created_at:
            pct = (
                round((qa.correct_count / qa.total_questions) * 100)
                if qa.total_questions
                else 0
            )
            activity_entries.append(
                ActivityFeedItem(
                    id=f"quiz-{qa.id}",
                    event_type="quiz_completed",
                    title=f"Completed quiz on {qa.topic}",
                    description=f"Scored {pct}% ({qa.correct_count}/{qa.total_questions})",
                    timestamp=qa.created_at,
                    project_id=p.id,
                    project_name=p.name,
                )
            )

    for doc, pid in recent_docs[:15]:
        p = project_map.get(pid)
        if p and doc.uploaded_at:
            activity_entries.append(
                ActivityFeedItem(
                    id=f"doc-{doc.id}",
                    event_type="document_uploaded",
                    title=f"Uploaded {doc.filename}",
                    description=f"{doc.page_count} pages ingested for study",
                    timestamp=doc.uploaded_at,
                    project_id=p.id,
                    project_name=p.name,
                )
            )

    for log_entry, pid in study_logs[:20]:
        p = project_map.get(pid)
        if p and log_entry.created_at:
            topic_str = f" on {log_entry.topic}" if log_entry.topic else ""
            if log_entry.event_type == "question_answered":
                title = f"Studied with AI Tutor{topic_str}"
                desc = "Reviewed material and asked questions"
            elif log_entry.event_type == "flashcards_generated":
                title = f"Generated Flashcard Deck{topic_str}"
                desc = "Created active recall cards"
            elif log_entry.event_type == "study_plan_generated":
                title = f"Generated Study Schedule{topic_str}"
                desc = "Created customized study plan"
            else:
                title = f"Learning Session{topic_str}"
                desc = log_entry.event_type.replace("_", " ").title()

            activity_entries.append(
                ActivityFeedItem(
                    id=f"log-{log_entry.id}",
                    event_type=log_entry.event_type,
                    title=title,
                    description=desc,
                    timestamp=log_entry.created_at,
                    project_id=p.id,
                    project_name=p.name,
                )
            )

    # Sort activities newest first
    def _act_sort_key(act: ActivityFeedItem) -> float:
        dt = act.timestamp if act.timestamp.tzinfo else act.timestamp.replace(tzinfo=timezone.utc)
        return -dt.timestamp()

    activity_entries.sort(key=_act_sort_key)

    if full:
        recent_activity = activity_entries[:40]
        recommendations = [r[0] for r in all_recommendations[:25]]
        
        # Calculate platform-wide most difficult concepts (lowest mastery score first)
        difficult_concepts: list[DifficultConceptItem] = []
        for cm in all_concept_masteries:
            p = project_map.get(cm.project_id)
            if not p:
                continue
            space_name = space_map[p.space_id].name if p.space_id in space_map else "Unknown Space"
            difficult_concepts.append(
                DifficultConceptItem(
                    concept=cm.concept,
                    mastery_score=round(float(cm.score), 1),
                    project_id=p.id,
                    project_name=p.name,
                    space_name=space_name,
                    attempt_count=cm.attempt_count if hasattr(cm, "attempt_count") else 0,
                )
            )
        difficult_concepts.sort(key=lambda item: (item.mastery_score, item.concept))
        difficult_concepts = difficult_concepts[:10]
    else:
        recent_activity = activity_entries[:4]
        recommendations = [r[0] for r in all_recommendations[:2]]
        difficult_concepts = []

    stats = GlobalDashboardStats(
        total_spaces=len(spaces),
        total_projects=len(projects),
        overall_mastery=overall_mastery,
        study_streak_days=streak_days,
        total_quizzes_taken=total_quizzes,
        quiz_accuracy_pct=quiz_accuracy,
        total_topics_studied=total_topics_studied,
    )

    return GlobalDashboardResponse(
        stats=stats,
        active_projects=project_items,
        top_recommendation=top_recommendation,
        recommendations=recommendations,
        recent_activity=recent_activity,
        last_active_project=last_active_project,
        difficult_concepts=difficult_concepts,
    )


def _calculate_study_streak(timestamps: list[datetime], now: datetime) -> int:
    """Calculate current consecutive calendar days of study activity."""
    if not timestamps:
        return 0

    today = now.date()
    yesterday = today - timedelta(days=1)

    # Normalize all timestamps to unique UTC calendar dates
    unique_dates = sorted(
        {ts.astimezone(timezone.utc).date() if ts.tzinfo else ts.date() for ts in timestamps},
        reverse=True,
    )

    if not unique_dates:
        return 0

    most_recent = unique_dates[0]
    if most_recent != today and most_recent != yesterday:
        # Streak broken
        return 0

    streak = 0
    expected_date = most_recent
    for d in unique_dates:
        if d == expected_date:
            streak += 1
            expected_date = expected_date - timedelta(days=1)
        elif d < expected_date:
            # Gap in calendar days
            break

    return streak
