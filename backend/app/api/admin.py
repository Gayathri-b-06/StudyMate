"""Admin API router for StudyMate (PRD §16)."""

from typing import Optional
from fastapi import APIRouter, Depends, Header, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.models import User
from app.db.session import get_db
from app.schemas.admin import AdminDashboardResponse, AdminActivityItem
from app.services import admin_service


def verify_admin_authorization(
    current_user: User = Depends(get_current_user),
) -> str:
    """Lightweight authorization boundary for admin routes (PRD §16).
    
    Guarantees student clients or non-admin callers cannot access platform telemetry.
    Can be replaced cleanly by JWT/OAuth2 RBAC middleware once production auth lands.
    """
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Forbidden: Administrative privileges required to access PRD §16 operations.",
        )
    return "admin"


router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(verify_admin_authorization)],
)


@router.get("/dashboard", response_model=AdminDashboardResponse)
def get_admin_dashboard(
    user_id: Optional[str] = Query(None, description="Filter activity by user UUID"),
    space_id: Optional[str] = Query(None, description="Filter activity by space UUID"),
    project_id: Optional[str] = Query(None, description="Filter activity by project UUID"),
    event_type: Optional[str] = Query(None, description="Filter activity by event type"),
    time_period: Optional[str] = Query(None, description="Filter activity by time period ('24h' | '7d' | '30d' | 'all')"),
    db: Session = Depends(get_db),
):
    """Fetches high-level operational metrics, AI telemetry, difficult concepts, and activity."""
    return admin_service.get_admin_dashboard_data(
        db,
        user_id=user_id,
        space_id=space_id,
        project_id=project_id,
        event_type=event_type,
        time_period=time_period,
    )


@router.get("/filter-options")
def get_admin_filter_options(
    user_id: Optional[str] = Query(None, description="Limit spaces and projects to a user UUID"),
    db: Session = Depends(get_db),
):
    """Return live, ownership-scoped options for admin activity filters."""
    return admin_service.get_admin_filter_options(db, user_id=user_id)


@router.get("/activity", response_model=list[AdminActivityItem])
def get_admin_activity_feed(
    user_id: Optional[str] = Query(None, description="Filter by user UUID"),
    space_id: Optional[str] = Query(None, description="Filter by space UUID"),
    project_id: Optional[str] = Query(None, description="Filter by project UUID"),
    event_type: Optional[str] = Query(None, description="Filter by event type"),
    time_period: Optional[str] = Query(None, description="Filter by time period ('24h' | '7d' | '30d' | 'all')"),
    limit: int = Query(50, ge=1, le=100, description="Max activities to return"),
    db: Session = Depends(get_db),
):
    """Returns filtered platform-wide activity feed items."""
    return admin_service.get_admin_activity(
        db,
        user_id=user_id,
        space_id=space_id,
        project_id=project_id,
        event_type=event_type,
        time_period=time_period,
        limit=limit,
    )
