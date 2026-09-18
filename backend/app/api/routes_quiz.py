from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from langchain_core.language_models.chat_models import BaseChatModel
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_embeddings, get_quiz_llm
from app.db import crud
from app.db.models import User
from app.db.session import get_db
from app.schemas.quiz import (
    OpenEndedGradeRequest,
    OpenEndedGradeResponse,
    QuizGenerateRequest,
    QuizGenerateResponse,
)
from app.tools.memory_tool import record_weak_topic
from app.tools.quiz_generator_tool import (
    QuizGenerationError,
    generate_quiz,
    grade_open_ended_response,
)

router = APIRouter(prefix="/quiz", tags=["quiz"])


@router.post("/generate", response_model=QuizGenerateResponse)
def generate_quiz_endpoint(
    payload: QuizGenerateRequest,
    llm: Annotated[BaseChatModel, Depends(get_quiz_llm)],
    embeddings: Annotated[Any, Depends(get_embeddings)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> QuizGenerateResponse:
    """Generate a quiz directly for a selected uploaded document."""
    if not crud.verify_document_owner(db, payload.document_id, current_user.id):
        raise HTTPException(status_code=404, detail="Document does not exist.")
    try:
        return generate_quiz(
            llm,
            payload.document_id,
            payload.topic,
            payload.num_questions,
            payload.difficulty,
            question_type=payload.question_type,
            embeddings=embeddings,
            db=db,
        )
    except QuizGenerationError as error:
        status_code = (
            status.HTTP_404_NOT_FOUND
            if "does not exist" in str(error)
            else status.HTTP_422_UNPROCESSABLE_CONTENT
        )
        raise HTTPException(status_code=status_code, detail=str(error)) from error


@router.post("/grade-open-ended", response_model=OpenEndedGradeResponse)
def grade_open_ended_endpoint(
    payload: OpenEndedGradeRequest,
    llm: Annotated[BaseChatModel, Depends(get_quiz_llm)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> OpenEndedGradeResponse:
    """Evaluate an open-ended quiz response against its encrypted rubric and update mastery."""
    project = crud.verify_project_owner(db, payload.project_id, current_user.id)
    if project is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project '{payload.project_id}' not found.",
        )

    try:
        score, evaluation = grade_open_ended_response(
            llm,
            question=payload.question,
            user_answer=payload.user_answer,
            grading_token=payload.grading_token,
        )
    except QuizGenerationError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Grading evaluation could not be completed: {error}",
        ) from error
    except ValueError as error:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(error),
        ) from error

    # Atomic concept mastery UPSERT using EMA formula (α=0.4)
    crud.upsert_concept_mastery(
        db,
        project_id=project.id,
        topic=payload.topic,
        session_pct=score,
    )

    # Log quiz attempt
    crud.create_quiz_attempt(
        db,
        user_id=current_user.id,
        project_id=project.id,
        document_id=payload.document_id,
        topic=payload.topic,
        correct_count=1 if score >= 60.0 else 0,
        total_questions=1,
    )

    # Record weak topic if performance is below 60%
    if score < 60.0:
        record_weak_topic(
            db,
            current_user.id,
            project.id,
            payload.topic,
            f"scored {score}% on open-ended question about {payload.topic}",
            payload.document_id,
            reason="quiz_score",
        )

    return OpenEndedGradeResponse(
        score=score,
        evaluation=evaluation,
        topic=payload.topic,
    )
