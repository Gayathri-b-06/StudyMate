"""HTTP contracts for concept mastery data."""

from datetime import datetime
from pydantic import BaseModel


from typing import Literal

GrowthTrend = Literal["improving", "stable", "requires_attention", "insufficient_data"]


class ConceptMasteryItem(BaseModel):
    """Mastery score and growth trend for one concept within a project."""

    concept: str
    """Normalized concept name (lowercased, stripped)."""

    score: float
    """Current EMA mastery score, 0.0–100.0."""

    attempt_count: int
    """Number of quiz sessions that have contributed to this score."""

    updated_at: datetime
    """UTC timestamp of the last mastery update."""

    trend: GrowthTrend
    """Growth trend classification based on historical score progression."""

    trend_delta: float | None = None
    """Score delta between recent and baseline windows (rounded to 2 decimal places)."""

    snapshot_count: int = 0
    """Number of history snapshots available for this concept."""



class ProjectMasteryResponse(BaseModel):
    """All concept mastery scores for a project."""

    project_id: str
    concepts: list[ConceptMasteryItem]
    """Sorted by score descending (highest mastery first)."""


class ConceptMasteryPoint(BaseModel):
    """A single historical snapshot of concept mastery score."""

    score: float
    recorded_at: datetime


class ConceptGrowthSeries(BaseModel):
    """Chronological mastery score history and growth trend for one concept."""

    concept: str
    current_score: float
    trend: GrowthTrend
    trend_delta: float | None = None
    points: list[ConceptMasteryPoint]


class ProjectMasteryHistoryResponse(BaseModel):
    """Historical time-series of concept mastery for a project."""

    project_id: str
    series: list[ConceptGrowthSeries]
