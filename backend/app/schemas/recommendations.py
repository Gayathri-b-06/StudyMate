"""Pydantic models for project-level study recommendations (PRD §10)."""

from __future__ import annotations

from typing import Literal
from pydantic import BaseModel, Field


class RecommendationItem(BaseModel):
    """A single actionable study recommendation for a concept or topic."""

    concept: str = Field(description="The concept or topic name.")
    priority: int = Field(ge=1, le=5, description="Priority tier from 1 (highest urgency) to 5.")
    urgency: Literal["critical", "moderate", "low"] = Field(
        description="Urgency label for visual UI badge mapping."
    )
    score: float | None = Field(
        default=None,
        description="Current estimated Concept Mastery score if tracked, else None.",
    )
    trend: str | None = Field(
        default=None,
        description="Growth Analysis directional trend ('improving', 'stable', 'requires_attention', 'insufficient_data').",
    )
    trend_delta: float | None = Field(
        default=None,
        description="Growth Analysis numerical change (percentage points) between windows.",
    )
    snapshot_count: int | None = Field(
        default=None,
        description="Number of quiz evaluation snapshots recorded for this concept.",
    )
    attempt_count: int | None = Field(
        default=None,
        description="Number of quiz attempts recorded for this concept.",
    )
    gap_description: str = Field(
        description="Specific diagnostic statement explaining the learning gap."
    )
    action_recommendation: str = Field(
        description="Concrete recommended next action (e.g. review material, take quiz)."
    )
    reason: str = Field(
        description="Explainability trace documenting the exact metrics that triggered this recommendation."
    )


class ProjectRecommendationsResponse(BaseModel):
    """Response model for GET /projects/{project_id}/recommendations."""

    project_id: str
    recommendations: list[RecommendationItem]
