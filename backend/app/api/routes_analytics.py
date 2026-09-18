"""Global Analytics and Home Dashboard API endpoints (PRD §16 & §17)."""

from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.db.session import get_db
from app.db.models import User
from app.schemas.analytics import GlobalDashboardResponse
from app.services.analytics_service import get_global_dashboard_data

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/global", response_model=GlobalDashboardResponse)
def get_global_dashboard(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    full: bool = False,
) -> GlobalDashboardResponse:
    """Return unified account-level metrics, active projects, recommendations, and analytics."""
    return get_global_dashboard_data(db, user_id=current_user.id, full=full)
