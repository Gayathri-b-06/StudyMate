"""FastAPI endpoints for StudyMate conversation threads."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependencies import ProjectScope, get_chat_service, get_current_user, get_project_scope, get_thread_service
from app.db import crud
from app.db.models import User
from app.db.session import get_db
from app.schemas.study_log import StudyLogResponse
from app.schemas.thread import ThreadChatMessage, ThreadRenameRequest, ThreadResponse
from app.services.chat_service import ChatService
from app.services.thread_service import ThreadNotFoundError, ThreadService

router = APIRouter(prefix="/threads", tags=["threads"])


def _thread_response(thread) -> ThreadResponse:
    return ThreadResponse(id=thread.id, title=thread.title, created_at=thread.created_at, updated_at=thread.updated_at)


@router.patch("/{thread_id}", response_model=ThreadResponse)
def rename_thread(
    thread_id: str,
    payload: ThreadRenameRequest,
    thread_service: Annotated[ThreadService, Depends(get_thread_service)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> ThreadResponse:
    """Persist a manually selected title for an existing conversation."""
    try:
        if not crud.verify_thread_owner(db, thread_id, current_user.id):
            raise ThreadNotFoundError(thread_id)
        thread = thread_service.rename_thread(db, thread_id, payload.title)
    except ThreadNotFoundError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found."
        ) from error
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(error)
        ) from error

    return _thread_response(thread)


@router.get("", response_model=list[ThreadResponse])
def list_threads(
    scope: Annotated[ProjectScope, Depends(get_project_scope)],
    thread_service: Annotated[ThreadService, Depends(get_thread_service)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[ThreadResponse]:
    """List conversation threads for a project ordered by most recent update.

    The `project_id` query parameter is REQUIRED — HTTP 422 is returned if
    absent. There is no unscoped fallback endpoint.
    """
    return [_thread_response(t) for t in thread_service.list_threads(db, scope.project_id)]


@router.get("/{thread_id}/messages", response_model=list[ThreadChatMessage], response_model_exclude_none=True)
def get_thread_messages(

    thread_id: str,
    chat_service: Annotated[ChatService, Depends(get_chat_service)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[ThreadChatMessage]:
    """Return chronological conversation history reconstructed from LangGraph state for an existing thread."""
    if crud.verify_thread_owner(db, thread_id, current_user.id) is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found."
        )
    return chat_service.get_thread_history(thread_id)


@router.get("/{thread_id}/study-log", response_model=list[StudyLogResponse])
def get_study_log(
    thread_id: str,
    thread_service: Annotated[ThreadService, Depends(get_thread_service)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[StudyLogResponse]:
    """Return study activity for one existing thread."""
    try:
        if not crud.verify_thread_owner(db, thread_id, current_user.id):
            raise ThreadNotFoundError(thread_id)
        entries = thread_service.study_log(db, thread_id)
    except ThreadNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.") from error
    return [StudyLogResponse(id=entry.id, thread_id=entry.thread_id, document_id=entry.document_id, event_type=entry.event_type, topic=entry.topic, created_at=entry.created_at) for entry in entries]


@router.delete("/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_thread(
    thread_id: str,
    thread_service: Annotated[ThreadService, Depends(get_thread_service)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    """Delete a thread and its owned vector stores, retaining checkpoints."""
    try:
        if not crud.verify_thread_owner(db, thread_id, current_user.id):
            raise ThreadNotFoundError(thread_id)
        thread_service.delete_thread(db, thread_id)
    except ThreadNotFoundError as error:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found.") from error
