"""FastAPI router for Project CRUD operations."""

from __future__ import annotations

from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import ProjectService, get_current_user, get_project_service
from app.db.models import Project, User
from app.db.session import get_db
from app.schemas.mastery import (
    ConceptMasteryItem,
    ProjectMasteryResponse,
    ProjectMasteryHistoryResponse,
)
from app.schemas.recommendations import ProjectRecommendationsResponse
from app.services.project_service import (
    ProjectNotFoundError,
    SpaceNotFoundForProjectError,
)

router = APIRouter(tags=["projects"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Human-readable project name")
    description: str | None = Field(None, max_length=500)


class ProjectPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    archived: bool | None = None


class ProjectResponse(BaseModel):
    id: str
    space_id: str
    name: str
    description: str | None
    archived: bool
    created_at: str
    updated_at: str

    @classmethod
    def from_orm(cls, project: Project) -> "ProjectResponse":
        return cls(
            id=project.id,
            space_id=project.space_id,
            name=project.name,
            description=project.description,
            archived=project.archived,
            created_at=project.created_at.isoformat(),
            updated_at=project.updated_at.isoformat(),
        )


class ProjectCreateResponse(ProjectResponse):
    """Extended response for POST /projects — includes the auto-created default thread ID."""
    default_thread_id: str


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post(
    "/spaces/{space_id}/projects",
    response_model=ProjectCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    space_id: str,
    body: ProjectCreate,
    db: Session = Depends(get_db),
    svc: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_user),
) -> ProjectCreateResponse:
    """Create a Project inside a Space. Auto-creates one default Thread (so the user
    is immediately in a conversation context — never dropped into an empty shell)."""
    try:
        project, default_thread = svc.create_project(
            db, space_id=space_id, name=body.name, description=body.description, user_id=current_user.id
        )
    except SpaceNotFoundForProjectError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    return ProjectCreateResponse(
        id=project.id,
        space_id=project.space_id,
        name=project.name,
        description=project.description,
        archived=project.archived,
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
        default_thread_id=default_thread.id,
    )


@router.get("/spaces/{space_id}/projects", response_model=list[ProjectResponse])
def list_projects(
    space_id: str,
    include_archived: bool = False,
    db: Session = Depends(get_db),
    svc: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_user),
) -> list[ProjectResponse]:
    """List Projects in a Space (newest first, archived excluded by default)."""
    projects = svc.list_projects(db, space_id, user_id=current_user.id, include_archived=include_archived)
    return [ProjectResponse.from_orm(p) for p in projects]


@router.get("/projects/{project_id}", response_model=ProjectResponse)
def get_project(
    project_id: str,
    db: Session = Depends(get_db),
    svc: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_user),
) -> ProjectResponse:
    """Fetch a single Project by ID."""
    try:
        project = svc.get_project(db, project_id, user_id=current_user.id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return ProjectResponse.from_orm(project)


@router.patch("/projects/{project_id}", response_model=ProjectResponse)
def update_project(
    project_id: str,
    body: ProjectPatch,
    db: Session = Depends(get_db),
    svc: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_user),
) -> ProjectResponse:
    """Rename, update description, or archive/unarchive a Project."""
    from app.db import crud

    project = crud.verify_project_owner(db, project_id, current_user.id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Project '{project_id}' not found.")

    update_kwargs: dict = {}
    if body.name is not None:
        update_kwargs["name"] = " ".join(body.name.split())
    if body.description is not None:
        update_kwargs["description"] = body.description
    if body.archived is not None:
        update_kwargs["archived"] = body.archived

    if update_kwargs:
        project = crud.update_project(db, project_id=project_id, **update_kwargs)

    return ProjectResponse.from_orm(project)


@router.delete("/projects/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: str,
    db: Session = Depends(get_db),
    svc: ProjectService = Depends(get_project_service),
    current_user: User = Depends(get_current_user),
) -> None:
    """Delete a Project, its Threads, Documents, and all FAISS index files from disk."""
    try:
        svc.delete_project(db, project_id, user_id=current_user.id)
    except ProjectNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


@router.get("/projects/{project_id}/mastery", response_model=ProjectMasteryResponse)
def get_project_mastery(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectMasteryResponse:
    """Return all concept mastery scores for a project, sorted by score descending."""
    from app.db import crud

    project = crud.verify_project_owner(db, project_id, current_user.id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Project '{project_id}' not found.")
    rows = crud.get_concept_mastery(db, project_id)
    concepts = [row.concept for row in rows]
    history_map = crud.get_concept_mastery_history_batch(db, project_id, concepts)

    items: list[ConceptMasteryItem] = []
    for row in rows:
        scores = history_map.get(row.concept, [])
        trend_label, delta = crud.compute_growth_trend(scores)
        items.append(
            ConceptMasteryItem(
                concept=row.concept,
                score=row.score,
                attempt_count=row.attempt_count,
                updated_at=row.updated_at,
                trend=trend_label,
                trend_delta=delta,
                snapshot_count=len(scores),
            )
        )

    return ProjectMasteryResponse(
        project_id=project_id,
        concepts=items,
    )


@router.get("/projects/{project_id}/recommendations", response_model=ProjectRecommendationsResponse)
def get_project_recommendations(
    project_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectRecommendationsResponse:
    """Return prioritized, explainable study recommendations for a project (PRD §10)."""
    from app.services.recommendations_service import generate_recommendations

    try:
        if not crud.verify_project_owner(db, project_id, current_user.id):
            raise ProjectNotFoundError(project_id)
        items = generate_recommendations(db, project_id, user_id=current_user.id)
    except ProjectNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found.",
        )

    return ProjectRecommendationsResponse(
        project_id=project_id,
        recommendations=items,
    )


@router.get("/projects/{project_id}/mastery/history", response_model=ProjectMasteryHistoryResponse)
def get_project_mastery_history(
    project_id: str,
    concept: str | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ProjectMasteryHistoryResponse:
    """Return historical time-series score snapshots for concepts in a project."""
    from app.db import crud

    project = crud.verify_project_owner(db, project_id, current_user.id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found.",
        )

    series_data = crud.get_project_mastery_history(db, project_id, concept=concept)
    return ProjectMasteryHistoryResponse(
        project_id=project_id,
        series=series_data,
    )

