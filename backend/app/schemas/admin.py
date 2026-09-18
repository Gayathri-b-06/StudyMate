"""Pydantic schemas for the Admin Dashboard (PRD §16)."""

from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class AdminStats(BaseModel):
    total_users: int = Field(0, description="Registered users across every role")
    total_spaces: int = Field(..., description="Total non-archived spaces")
    total_projects: int = Field(..., description="Total non-archived projects")
    total_quizzes: int = Field(..., description="Total completed quiz attempts")
    total_documents: int = Field(..., description="Total ingested source documents")
    total_chat_sessions: int = Field(..., description="Total chat conversation threads")


class EngagementMetrics(BaseModel):
    active_users: int = Field(0, description="Users with recent recorded activity")
    learning_activities_count: int = Field(..., description="Total activities across logs, quizzes, and docs")
    quiz_attempts_count: int = Field(..., description="Total formative quiz attempts")
    recent_activity_count_7d: int = Field(..., description="Activity events logged in the last 7 days")
    study_streak_days: int = Field(..., description="Current study streak in consecutive calendar days")


class DifficultConceptItem(BaseModel):
    concept: str = Field(..., description="Normalized concept name")
    avg_score: float = Field(..., description="Unweighted arithmetic mean of EMA mastery across projects")
    projects_count: int = Field(..., description="Number of distinct projects studying this concept")
    attempts_count: int = Field(..., description="Total quiz attempts across all projects")
    status: str = Field(..., description="'critical' (<50%), 'attention' (50-74%), or 'mastered' (>=75%)")
    trend: str = Field(..., description="'improving' | 'stable' | 'requires_attention'")


class AdminActivityItem(BaseModel):
    id: str = Field(..., description="Unique event activity identifier")
    event_type: str = Field(..., description="Activity kind (quiz, document, chat, flashcards, etc.)")
    title: str = Field(..., description="Human-readable event title")
    description: str = Field(..., description="Contextual event summary")
    timestamp: datetime = Field(..., description="Occurrence timestamp")
    user_id: str = Field(..., description="Acting user ID")
    user_name: str = Field(..., description="Acting user display name")
    project_id: Optional[str] = Field(None, description="Associated project UUID")
    project_name: Optional[str] = Field(None, description="Associated project name")
    space_id: Optional[str] = Field(None, description="Associated space UUID")
    space_name: Optional[str] = Field(None, description="Associated space name")


class AiTraceItem(BaseModel):
    id: str = Field(..., description="Run / trace UUID")
    name: str = Field(..., description="Name of the LLM call or chain")
    run_type: str = Field(..., description="Kind of execution: llm, chain, tool")
    status: str = Field(..., description="Execution status: success or error")
    latency_ms: float = Field(..., description="Execution latency in milliseconds")
    total_tokens: int = Field(..., description="Total tokens consumed (prompt + completion)")
    timestamp: Optional[datetime] = Field(None, description="Start timestamp of the run")


class AiUsageMetric(BaseModel):
    total_requests: int = Field(..., description="Total logged LLM completions / graph runs")
    avg_latency_ms: float = Field(..., description="Average latency across LLM calls in milliseconds")
    total_tokens: int = Field(..., description="Cumulative token count across LLM calls")
    avg_tokens_per_request: float = Field(..., description="Average tokens per request")
    error_rate_pct: float = Field(..., description="Percentage of failing requests")
    source: str = Field(..., description="Data source indicator: 'langsmith' or 'local_fallback'")


class AiEvaluationMetrics(BaseModel):
    status: str = Field(..., description="'configured' or 'not_configured'")
    dataset_name: Optional[str] = Field(None, description="Name of benchmark evaluation dataset")
    total_cases: int = Field(0, description="Total benchmark evaluation cases evaluated")
    passed_cases: int = Field(0, description="Total evaluation cases passing threshold")
    pass_rate_pct: float = Field(0.0, description="Pass rate percentage across evaluation cases")
    faithfulness_score: Optional[float] = Field(None, description="Groundedness / Faithfulness score [0.0 - 1.0]")
    answer_relevancy_score: Optional[float] = Field(None, description="Answer relevancy score [0.0 - 1.0]")
    context_precision_score: Optional[float] = Field(None, description="Context precision score [0.0 - 1.0]")
    context_recall_score: Optional[float] = Field(None, description="Context recall score [0.0 - 1.0]")
    evaluation_timestamp: Optional[datetime] = Field(None, description="Timestamp of evaluation run")
    description: str = Field(..., description="Evaluation description or configuration status explanation")


class BackgroundProcessingMetrics(BaseModel):
    pipeline_name: str = Field("Document Ingestion & FAISS Indexing", description="Active pipeline name")
    indexing_count: int = Field(0, description="Active or pending indexing jobs")
    ready_count: int = Field(..., description="Successfully indexed document jobs")
    error_count: int = Field(0, description="Failed document indexing jobs")
    total_jobs: int = Field(..., description="Total background processing jobs tracked")
    worker_status: str = Field(..., description="Execution status: 'Active (In-process Async)'")
    queue_notes: str = Field(
        "Dedicated worker queue (e.g. Celery/Redis) not configured; using threadpool worker.",
        description="Operational context for queue architecture",
    )


class SystemHealthMetrics(BaseModel):
    api_status: str = Field(..., description="'Healthy' or 'Degraded'")
    api_latency_ms: float = Field(..., description="Internal API ping latency")
    database_status: str = Field(..., description="'Healthy' or 'Unhealthy'")
    database_engine: str = Field("SQLite 3 / SQLAlchemy 2.0", description="Database dialect")
    database_latency_ms: float = Field(..., description="DB query roundtrip latency in milliseconds")
    langsmith_status: str = Field(..., description="'Connected' or 'Degraded (Local fallback active)'")
    background_worker_status: str = Field(..., description="'Healthy' or 'Degraded'")
    checked_at: datetime = Field(..., description="Timestamp of health probe execution")


class UserJourneyProjectItem(BaseModel):
    id: str = Field(..., description="Project UUID")
    name: str = Field(..., description="Project title")
    space_name: str = Field(..., description="Owning space name")
    progress_pct: float = Field(..., description="Concept mastery score percentage")
    status: str = Field(..., description="'Mastered' | 'In Progress' | 'New'")


class UserJourneyDetail(BaseModel):
    id: str = Field(..., description="User unique ID")
    name: str = Field(..., description="Full user display name")
    email: str = Field(..., description="User email address")
    role: str = Field("admin", description="Platform role: 'admin' | 'student'")
    projects: list[UserJourneyProjectItem] = Field(default_factory=list, description="User active projects")
    recent_activities: list[AdminActivityItem] = Field(default_factory=list, description="Recent events for this user")
    total_quizzes: int = Field(..., description="Total completed quizzes by this user")
    avg_quiz_score_pct: float = Field(..., description="Average score across completed quizzes")
    overall_mastery_pct: float = Field(..., description="Arithmetic mean of user concept mastery")
    mastered_concepts_count: int = Field(..., description="Concepts at >= 75% mastery")
    weak_concepts_count: int = Field(..., description="Concepts at < 75% mastery needing attention")
    ai_requests_count: int = Field(..., description="Total AI tutor questions/calls from this user")
    last_active: Optional[datetime] = Field(None, description="Timestamp of most recent activity")


class UserSummaryItem(BaseModel):
    id: str = Field(..., description="User unique ID")
    name: str = Field(..., description="User full display name")
    email: str = Field(..., description="User email address")
    role: str = Field("admin", description="Platform role: 'admin' | 'student'")
    spaces_count: int = Field(..., description="Total spaces owned")
    projects_count: int = Field(..., description="Total projects owned")
    quizzes_count: int = Field(..., description="Total completed quizzes")
    last_active: Optional[datetime] = Field(None, description="Timestamp of most recent activity")


class AdminDashboardResponse(BaseModel):
    stats: AdminStats
    engagement: EngagementMetrics
    difficult_concepts: list[DifficultConceptItem]
    ai_usage: AiUsageMetric
    ai_evaluation: AiEvaluationMetrics
    background_processing: BackgroundProcessingMetrics
    system_health: SystemHealthMetrics
    user_summary: list[UserSummaryItem]
    inspected_user: UserJourneyDetail
    recent_ai_traces: list[AiTraceItem]
    recent_activity: list[AdminActivityItem]
