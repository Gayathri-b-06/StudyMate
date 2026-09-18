"""Shared FastAPI dependency providers for application-composed services."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, cast

from fastapi import Depends, Header, HTTPException, Request, status
from langchain_core.language_models.chat_models import BaseChatModel
from sqlalchemy.orm import Session

from app.db import crud
from app.db.models import Project, User
from app.db.session import get_db
from app.services.auth_service import can_authenticate
from app.services.chat_service import ChatService
from app.services.document_service import DocumentService
from app.services.project_service import ProjectService
from app.services.rag_query_service import RagQueryService
from app.services.space_service import SpaceService
from app.services.thread_service import ThreadService


# ---------------------------------------------------------------------------
# Process-scoped service accessors (from app.state)
# ---------------------------------------------------------------------------


def require_ai_ready(request: Request) -> None:
    ai_status = getattr(request.app.state, "ai_status", "ready")
    if ai_status != "ready":
        detail = (
            "Study tools are still starting. Please try again shortly."
            if ai_status == "loading"
            else "Study tools could not start. Please check the backend logs."
        )
        raise HTTPException(status_code=503, detail=detail, headers={"Retry-After": "5"})


def get_chat_service(request: Request) -> ChatService:
    """Return the process-scoped chat service composed during application startup."""
    require_ai_ready(request)
    return cast(ChatService, request.app.state.chat_service)


def get_document_service(request: Request) -> DocumentService:
    """Return the process-scoped document service composed during application startup."""
    require_ai_ready(request)
    return cast(DocumentService, request.app.state.document_service)


def get_embeddings(request: Request) -> Any:
    """Return the shared embedding provider composed during application startup."""
    require_ai_ready(request)
    return request.app.state.embeddings


def get_llm(request: Request) -> BaseChatModel:
    """Return the shared chat model composed during application startup."""
    require_ai_ready(request)
    return cast(BaseChatModel, request.app.state.llm)


def get_quiz_llm(request: Request) -> BaseChatModel:
    """Return the dedicated quiz model composed during application startup."""
    require_ai_ready(request)
    return cast(BaseChatModel, request.app.state.quiz_llm)


def get_rag_query_service(request: Request) -> RagQueryService:
    """Return the process-scoped RAG debug service composed during application startup."""
    require_ai_ready(request)
    return cast(RagQueryService, request.app.state.rag_query_service)


def get_thread_service(request: Request) -> ThreadService:
    """Return the process-scoped thread lifecycle service."""
    return cast(
        ThreadService,
        getattr(request.app.state, "thread_service", ThreadService()),
    )


def get_space_service(request: Request) -> SpaceService:
    """Return the process-scoped space service."""
    return cast(
        SpaceService,
        getattr(request.app.state, "space_service", SpaceService()),
    )


def get_project_service(request: Request) -> ProjectService:
    """Return the process-scoped project service."""
    return cast(
        ProjectService,
        getattr(request.app.state, "project_service", ProjectService()),
    )


# ---------------------------------------------------------------------------
# ProjectScope — isolation enforcement gate
# ---------------------------------------------------------------------------


@dataclass
class ProjectScope:
    """
    Verified project context for an API request.

    Every endpoint that reads or writes project-scoped data must declare:
        scope: ProjectScope = Depends(get_project_scope)

    The project owner must match the verified session user.
    """

    project_id: str
    project: Project
    user_id: str


def get_current_user(
    authorization: str | None = Header(None, alias="Authorization"),
    db: Session = Depends(get_db),
) -> User:
    """Resolve identity exclusively from an active server-issued Bearer session."""
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Valid authentication is required.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    parts = authorization.split() if authorization else []
    if len(parts) != 2 or parts[0].lower() != "bearer":
        raise unauthorized
    user = crud.get_user_by_token(db, parts[1])
    if user is None or not can_authenticate(user):
        raise unauthorized
    return user



def get_project_scope(
    project_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ProjectScope:
    """
    Dependency that verifies a project exists and returns a ProjectScope.

    The `project_id` comes from a path param or query param on the route.
    Returns HTTP 404 if the project does not exist.
    HTTP 422 is returned automatically by FastAPI if project_id is absent
    (since it has no default value).
    """
    project = crud.verify_project_owner(db, project_id, current_user.id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{project_id}' not found.",
        )
    # Future auth check goes here — no endpoint changes needed when it arrives.
    return ProjectScope(project_id=project_id, project=project, user_id=current_user.id)
