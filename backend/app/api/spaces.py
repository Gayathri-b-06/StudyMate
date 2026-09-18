"""FastAPI router for Space CRUD operations."""

from __future__ import annotations

from pydantic import BaseModel, Field

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import SpaceService, get_current_user, get_space_service
from app.db.models import Space, User
from app.db.session import get_db
from app.services.space_service import SpaceNotFoundError

router = APIRouter(prefix="/spaces", tags=["spaces"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class SpaceCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Human-readable space name")
    description: str | None = Field(None, max_length=500)


class SpacePatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=100)
    description: str | None = Field(None, max_length=500)
    archived: bool | None = None


class SpaceResponse(BaseModel):
    id: str
    name: str
    description: str | None
    archived: bool
    created_at: str
    updated_at: str

    @classmethod
    def from_orm(cls, space: Space) -> "SpaceResponse":
        return cls(
            id=space.id,
            name=space.name,
            description=space.description,
            archived=space.archived,
            created_at=space.created_at.isoformat(),
            updated_at=space.updated_at.isoformat(),
        )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@router.post("", response_model=SpaceResponse, status_code=status.HTTP_201_CREATED)
def create_space(
    body: SpaceCreate,
    db: Session = Depends(get_db),
    svc: SpaceService = Depends(get_space_service),
    current_user: User = Depends(get_current_user),
) -> SpaceResponse:
    """Create a new Space."""
    space = svc.create_space(db, name=body.name, description=body.description, user_id=current_user.id)
    return SpaceResponse.from_orm(space)


@router.get("", response_model=list[SpaceResponse])
def list_spaces(
    include_archived: bool = False,
    db: Session = Depends(get_db),
    svc: SpaceService = Depends(get_space_service),
    current_user: User = Depends(get_current_user),
) -> list[SpaceResponse]:
    """List all non-archived Spaces (pass include_archived=true to include archived)."""
    spaces = svc.list_spaces(db, user_id=current_user.id, include_archived=include_archived)
    return [SpaceResponse.from_orm(s) for s in spaces]


@router.get("/{space_id}", response_model=SpaceResponse)
def get_space(
    space_id: str,
    db: Session = Depends(get_db),
    svc: SpaceService = Depends(get_space_service),
    current_user: User = Depends(get_current_user),
) -> SpaceResponse:
    """Fetch a single Space by ID."""
    try:
        space = svc.get_space(db, space_id, user_id=current_user.id)
    except SpaceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
    return SpaceResponse.from_orm(space)


@router.patch("/{space_id}", response_model=SpaceResponse)
def update_space(
    space_id: str,
    body: SpacePatch,
    db: Session = Depends(get_db),
    svc: SpaceService = Depends(get_space_service),
    current_user: User = Depends(get_current_user),
) -> SpaceResponse:
    """Rename, update description, or archive/unarchive a Space."""
    from app.db import crud

    space = crud.verify_space_owner(db, space_id, current_user.id)
    if space is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Space '{space_id}' not found.")

    update_kwargs: dict = {}
    if body.name is not None:
        update_kwargs["name"] = " ".join(body.name.split())
    if body.description is not None:
        update_kwargs["description"] = body.description
    if body.archived is not None:
        update_kwargs["archived"] = body.archived

    if update_kwargs:
        space = crud.update_space(db, space_id=space_id, **update_kwargs)

    return SpaceResponse.from_orm(space)


@router.delete("/{space_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_space(
    space_id: str,
    db: Session = Depends(get_db),
    svc: SpaceService = Depends(get_space_service),
    current_user: User = Depends(get_current_user),
) -> None:
    """Hard-delete a Space and cascade to all its Projects, Threads, and FAISS indexes."""
    try:
        svc.delete_space(db, space_id, user_id=current_user.id)
    except SpaceNotFoundError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
