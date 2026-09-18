"""Pydantic schemas for the Global Home Dashboard and Analytics layer (PRD §16 & §17)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class GlobalDashboardStats(BaseModel):
    total_spaces: int = Field(..., description="Total non-archived spaces owned by the user")
    total_projects: int = Field(..., description="Total non-archived projects across all spaces")
    overall_mastery: float = Field(..., description="Unweighted arithmetic mean of all tracked concept EMA scores")
    study_streak_days: int = Field(..., description="Current consecutive study streak in calendar days")
    total_quizzes_taken: int = Field(..., description="Total completed quiz attempts across all projects")
    quiz_accuracy_pct: int = Field(..., description="Overall quiz accuracy percentage across all completed attempts")
    total_topics_studied: int = Field(..., description="Count of distinct topics assessed or recorded in study memory")


class ProjectSummaryItem(BaseModel):
    id: str = Field(..., description="Project UUID")
    name: str = Field(..., description="Project human-readable title")
    space_id: str = Field(..., description="Parent space UUID")
    space_name: str = Field(..., description="Parent space name")
    progress_pct: float = Field(..., description="Average concept mastery score for this project (0.0 if unassessed)")
    concept_count: int = Field(0, description="Number of tracked concept mastery rows in this project")
    document_count: int = Field(..., description="Total documents ingested in this project")
    thread_count: int = Field(..., description="Total chat threads in this project")
    last_studied: Optional[datetime] = Field(None, description="Most recent study activity timestamp")
    status: str = Field(..., description="'Mastered' (>=75%), 'In Progress' (<75%), or 'New' (0 attempts)")
    needs_attention: bool = Field(
        False,
        description="True if 'In Progress' project has been inactive for > 7 days",
    )


class GlobalRecommendationItem(BaseModel):
    concept: str = Field(..., description="Normalized concept name")
    priority: int = Field(..., description="Priority tier 1-5 (1 highest urgency)")
    urgency: str = Field(..., description="Severity level ('critical' | 'moderate' | 'low')")
    score: Optional[float] = Field(None, description="Current EMA mastery score")
    trend: Optional[str] = Field(None, description="Growth trend ('improving' | 'stable' | 'requires_attention')")
    trend_delta: Optional[float] = Field(None, description="Percentage change in recent quiz sessions")
    gap_description: str = Field(..., description="Diagnostic assessment of the gap")
    action_recommendation: str = Field(..., description="Prescribed learning action")
    reason: str = Field(..., description="Trigger criteria explanation")
    project_id: str = Field(..., description="Target project UUID")
    project_name: str = Field(..., description="Target project name")
    space_name: str = Field(..., description="Parent space name")


class ActivityFeedItem(BaseModel):
    id: str = Field(..., description="Unique event identifier")
    event_type: str = Field(..., description="Machine-readable event type")
    title: str = Field(..., description="Human-readable event title")
    description: str = Field(..., description="Event details or score snippet")
    timestamp: datetime = Field(..., description="Event timestamp")
    project_id: str = Field(..., description="Associated project UUID")
    project_name: str = Field(..., description="Associated project name")


class DifficultConceptItem(BaseModel):
    concept: str = Field(..., description="Normalized concept name")
    mastery_score: float = Field(..., description="Current EMA mastery percentage (0-100)")
    project_id: str = Field(..., description="Target project UUID")
    project_name: str = Field(..., description="Target project name")
    space_name: str = Field(..., description="Parent space name")
    attempt_count: int = Field(0, description="Total quiz questions or reviews evaluated for this concept")


class GlobalDashboardResponse(BaseModel):
    stats: GlobalDashboardStats
    active_projects: list[ProjectSummaryItem]
    top_recommendation: Optional[GlobalRecommendationItem] = None
    recommendations: list[GlobalRecommendationItem] = Field(default_factory=list)
    recent_activity: list[ActivityFeedItem]
    last_active_project: Optional[ProjectSummaryItem] = None
    difficult_concepts: list[DifficultConceptItem] = Field(default_factory=list)
