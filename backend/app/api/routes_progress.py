from typing import Annotated, Any
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.api.dependencies import ProjectScope, get_current_user, get_project_scope
from app.db import crud
from app.db.models import User
from app.db.session import get_db
from app.schemas.progress import FlashcardResultReport, QuizResultReport
from app.tools.memory_tool import get_study_progress, record_weak_topic

router = APIRouter(prefix="/learning", tags=["learning"])


@router.get("", response_model=dict[str, Any])
def get_user_study_progress(
    scope: Annotated[ProjectScope, Depends(get_project_scope)],
    db: Annotated[Session, Depends(get_db)],
) -> dict[str, Any]:
    """Return factual study records for the current user in this project.

    The `project_id` query parameter is REQUIRED — HTTP 422 if absent.
    """
    return get_study_progress(db, scope.user_id, scope.project_id)


@router.post("/quiz-result", status_code=204)
def report_quiz_result(
    payload: QuizResultReport,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    """Record a completed quiz attempt and update concept mastery. `project_id` is required in the request body."""
    scope = _verify_project(db, payload.project_id, current_user.id)
    total_questions = len(payload.results)
    correct_count = sum(item.correct for item in payload.results)
    crud.create_quiz_attempt(
        db,
        user_id=current_user.id,
        project_id=scope.project_id,
        document_id=payload.document_id,
        topic=payload.topic,
        correct_count=correct_count,
        total_questions=total_questions,
    )
    # Update concept mastery using EMA (α=0.4) — synchronous, atomic UPSERT
    session_pct = (correct_count / total_questions) * 100.0 if total_questions else 0.0
    crud.upsert_concept_mastery(
        db,
        project_id=scope.project_id,
        topic=payload.topic,
        session_pct=session_pct,
    )
    if correct_count / total_questions < 0.6:
        record_weak_topic(
            db,
            current_user.id,
            scope.project_id,
            payload.topic,
            f"scored {correct_count}/{total_questions} on {payload.topic}",
            payload.document_id,
            reason="quiz_score",
        )


@router.post("/flashcard-result", status_code=204)
def report_flashcard_result(
    payload: FlashcardResultReport,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    """Record a flashcard review session. `project_id` is required in the request body."""
    scope = _verify_project(db, payload.project_id, current_user.id)
    for card in payload.cards:
        crud.upsert_flashcard_review(
            db,
            user_id=current_user.id,
            project_id=scope.project_id,
            document_id=payload.document_id,
            front=card.front,
            back=card.back,
            topic=payload.topic,
            learning_status=card.status,
        )
    learning_count = sum(item.status == "still_learning" for item in payload.cards)
    if learning_count:
        record_weak_topic(
            db,
            current_user.id,
            scope.project_id,
            payload.topic,
            f"marked {learning_count} cards as still learning on {payload.topic}",
            payload.document_id,
            reason="flashcard_review",
        )


def _verify_project(db: Session, project_id: str, user_id: str) -> ProjectScope:
    """Inline project verification for POST endpoints where project_id is in the body."""
    from app.db.models import Project as ProjectModel
    project = crud.verify_project_owner(db, project_id, user_id)
    if project is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Project '{project_id}' not found.")
    return ProjectScope(project_id=project_id, project=project, user_id=user_id)
