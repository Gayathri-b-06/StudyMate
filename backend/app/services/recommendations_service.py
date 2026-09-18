"""Application service for generating explainable study recommendations (PRD §10).

Rule-based recommendation engine consuming:
1. Concept Mastery score (EMA, clamped [0, 100])
2. Growth Analysis directional trend ('improving', 'stable', 'requires_attention', 'insufficient_data')
3. UserMemory weak-topic facts (score < 60% or flashcards marked 'learning')

Strictly mutually exclusive priority tiers:
- P1: Regressing Concept (trend == 'requires_attention', any score)
- P2: Critical Mastery Gap (score < 50.0, trend != 'requires_attention')
- P3: Plateauing Developing Concept (50.0 <= score < 75.0 and (trend == 'stable' or weak_topic))
- P4: Improving/Mastered with Specific Gaps ((score >= 75.0 or trend == 'improving') and trend != 'requires_attention' and weak_topic)
- P5: Unassessed Weak Topic (weak_topic in memory without concept_mastery record)

Intentional non-recommendation: Concepts with 'insufficient_data' and mid-range score (50-74) with no weak-topic
logs intentionally produce no recommendation (waiting for empirical evidence).
"""

from __future__ import annotations

from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.config import DEFAULT_USER_ID
from app.db import crud
from app.db.models import MemoryFactType
from app.schemas.recommendations import RecommendationItem
from app.services.project_service import ProjectNotFoundError


def generate_recommendations(
    db: Session,
    project_id: str,
    *,
    user_id: str = DEFAULT_USER_ID,
    limit: int = 3,
) -> list[RecommendationItem]:
    """Generate a prioritized, ranked list of explainable study recommendations for a project.

    Parameters
    ----------
    db         : Active database session.
    project_id : Project UUID (must exist; enforces scoping).
    user_id    : User UUID (defaults to DEFAULT_USER_ID).
    limit      : Maximum number of recommendations to return (default 3).

    Returns
    -------
    list[RecommendationItem] ranked by priority tier and lowest mastery score.
    """
    project = crud.get_project(db, project_id)
    if project is None:
        raise ProjectNotFoundError(f"Project '{project_id}' not found.")

    # 1. Fetch current concept mastery rows
    mastery_rows = crud.get_concept_mastery(db, project_id)
    concepts = [row.concept for row in mastery_rows]

    # 2. Batch fetch history for trend computation
    history_map = crud.get_concept_mastery_history_batch(db, project_id, concepts)

    # 3. Fetch project-scoped weak topic memory facts
    memories = crud.get_user_memory(db, user_id, project_id)
    weak_facts = [m for m in memories if m.fact_type == MemoryFactType.WEAK_TOPIC]
    weak_topic_map: dict[str, object] = {}
    for wf in weak_facts:
        norm = (wf.topic or "").strip().lower()
        if norm and norm not in weak_topic_map:
            weak_topic_map[norm] = wf

    candidates: list[tuple[RecommendationItem, datetime]] = []
    processed_concept_keys: set[str] = set()

    # 4. Evaluate tracked concepts
    for row in mastery_rows:
        concept_name = row.concept
        norm_key = concept_name.strip().lower()
        processed_concept_keys.add(norm_key)

        score = float(row.score)
        scores_history = history_map.get(concept_name, [])
        trend, delta = crud.compute_growth_trend(scores_history)
        snapshot_count = len(scores_history)
        attempt_count = row.attempt_count
        weak_fact = weak_topic_map.get(norm_key)
        updated_at = row.updated_at or datetime.now(timezone.utc)

        # ── P1: Regressing Concept (trend == 'requires_attention', regardless of score)
        if trend == "requires_attention":
            delta_val = delta if delta is not None else -5.0
            if score >= 75.0:
                gap = (
                    f"Understanding was strong ({round(score)}%), but is actively "
                    f"regressing (dropped by {abs(delta_val):.1f}% recently)."
                )
            else:
                gap = (
                    f"Understanding of {concept_name} is actively declining "
                    f"(dropped by {abs(delta_val):.1f}% across recent sessions)."
                )
            action = (
                f"Review recent quiz mistakes and complete a targeted practice "
                f"quiz on {concept_name} to arrest the decline."
            )
            reason = (
                f"Triggered because '{concept_name}' has trend 'requires_attention' "
                f"({delta_val:+.1f}%) and mastery score {round(score)}%."
            )
            item = RecommendationItem(
                concept=concept_name,
                priority=1,
                urgency="critical",
                score=score,
                trend=trend,
                trend_delta=delta,
                snapshot_count=snapshot_count,
                attempt_count=attempt_count,
                gap_description=gap,
                action_recommendation=action,
                reason=reason,
            )
            candidates.append((item, updated_at))
            continue

        # ── P2: Critical Mastery Gap (score < 50.0 and trend != 'requires_attention')
        if score < 50.0:
            gap = f"Mastery score is low at {round(score)}%."
            action = (
                f"Review core study material on {concept_name} and complete a "
                f"short assessment to establish foundational grasp."
            )
            reason = (
                f"Triggered because '{concept_name}' has low mastery score "
                f"({round(score)}% < 50%) with trend '{trend}'."
            )
            item = RecommendationItem(
                concept=concept_name,
                priority=2,
                urgency="critical",
                score=score,
                trend=trend,
                trend_delta=delta,
                snapshot_count=snapshot_count,
                attempt_count=attempt_count,
                gap_description=gap,
                action_recommendation=action,
                reason=reason,
            )
            candidates.append((item, updated_at))
            continue

        # ── P3: Developing Concept with Plateau or Specific Weakness (50.0 <= score < 75.0)
        if 50.0 <= score < 75.0 and (trend == "stable" or weak_fact is not None):
            is_stable = trend == "stable"
            has_weak = weak_fact is not None

            if is_stable and has_weak:
                gap = (
                    f"Understanding is developing at {round(score)}% and has plateaued over "
                    f"recent sessions, with specific errors flagged in quiz practice."
                )
                action = (
                    f"Practice application-based questions on {concept_name} to break "
                    f"through the plateau and reach the 75% mastery threshold."
                )
                reason = (
                    f"Triggered because '{concept_name}' is in developing tier ({round(score)}%) "
                    f"with both a stable trend and a logged weak-topic flag."
                )
            elif is_stable:
                gap = (
                    f"Understanding is developing at {round(score)}%, but progress has plateaued "
                    f"over several sessions."
                )
                action = (
                    f"Review harder practice questions on {concept_name} to break through "
                    f"the plateau and reach the 75% mastery threshold."
                )
                reason = (
                    f"Triggered because '{concept_name}' has a stable trend over "
                    f"{snapshot_count} quiz sessions in the developing tier ({round(score)}%)."
                )
            else:
                # Weak-topic branch without confirmed stable trend (e.g. insufficient_data or early progress)
                detail_str = getattr(weak_fact, "detail", "") or "identified as needing practice"
                gap = (
                    f"Understanding is developing at {round(score)}%, but recent quiz results "
                    f"or study sessions flagged this as a weak area needing practice."
                )
                action = (
                    f"Review missed questions on {concept_name} and complete targeted practice "
                    f"to build consistent mastery."
                )
                reason = (
                    f"Triggered because '{concept_name}' is in developing tier ({round(score)}%) "
                    f"with a recent weak-topic flag: '{detail_str}'."
                )

            item = RecommendationItem(
                concept=concept_name,
                priority=3,
                urgency="moderate",
                score=score,
                trend=trend,
                trend_delta=delta,
                snapshot_count=snapshot_count,
                attempt_count=attempt_count,
                gap_description=gap,
                action_recommendation=action,
                reason=reason,
            )
            candidates.append((item, updated_at))
            continue

        # ── P4: Improving/Mastered with Specific Gaps (PRD §10 Example)
        # Condition: (score >= 75 or trend == 'improving') AND trend != 'requires_attention' AND weak_fact is not None
        if (score >= 75.0 or trend == "improving") and trend != "requires_attention" and weak_fact is not None:
            if trend == "improving":
                gap = (
                    f"Understanding has improved ({round(score)}%), but recent "
                    f"quiz attempts revealed specific mistakes."
                )
            else:
                gap = (
                    f"Overall mastery is strong ({round(score)}%), but recent "
                    f"quiz attempts revealed specific mistakes on this topic."
                )
            action = (
                f"Review related material on tricky questions in {concept_name} "
                f"and complete another short assessment."
            )
            detail_str = getattr(weak_fact, "detail", "") or "logged weakness"
            reason = (
                f"Triggered because '{concept_name}' has high/improving mastery "
                f"({round(score)}%, trend '{trend}') accompanied by a weak-topic log: '{detail_str}'."
            )
            item = RecommendationItem(
                concept=concept_name,
                priority=4,
                urgency="low",
                score=score,
                trend=trend,
                trend_delta=delta,
                snapshot_count=snapshot_count,
                attempt_count=attempt_count,
                gap_description=gap,
                action_recommendation=action,
                reason=reason,
            )
            candidates.append((item, updated_at))
            continue

        # Intentional Fall-through:
        # - score >= 75 and trend in ('improving', 'stable') with no weak_fact -> Mastered and thriving.
        # - 50 <= score < 75 and trend == 'insufficient_data' with no weak_fact -> Insufficient evidence.
        # - 50 <= score < 75 and trend == 'improving' with no weak_fact -> Making healthy upward progress.

    # 5. Evaluate unassessed weak topics (P5)
    for norm_key, wf in weak_topic_map.items():
        if norm_key in processed_concept_keys:
            continue
        topic_name = getattr(wf, "topic", "") or norm_key
        detail_text = getattr(wf, "detail", "") or "identified as needing practice"
        created_at = getattr(wf, "created_at", None) or datetime.now(timezone.utc)

        gap = f"Flagged as a weak area in study sessions: '{detail_text}'."
        action = (
            f"Take an initial diagnostic quiz on {topic_name} to assess your "
            f"baseline mastery score."
        )
        reason = (
            f"Triggered by weak-topic memory entry '{detail_text}' without "
            f"an existing concept mastery record."
        )
        item = RecommendationItem(
            concept=topic_name,
            priority=5,
            urgency="low",
            score=None,
            trend=None,
            trend_delta=None,
            gap_description=gap,
            action_recommendation=action,
            reason=reason,
        )
        candidates.append((item, created_at))

    # 6. Rank candidates:
    #   Primary: priority tier (1 to 5 ascending)
    #   Secondary: score ascending (lowest score first; None treated as high to rank after scored items in same tier)
    #   Tertiary: activity date descending (most recent first)
    def _sort_key(entry: tuple[RecommendationItem, datetime]) -> tuple[int, float, float]:
        item, dt = entry
        score_val = item.score if item.score is not None else 999.0
        ts = dt.timestamp() if dt else 0.0
        return (item.priority, score_val, -ts)

    candidates.sort(key=_sort_key)

    # 7. Apply cap
    capped = [entry[0] for entry in candidates[:limit]]
    return capped
