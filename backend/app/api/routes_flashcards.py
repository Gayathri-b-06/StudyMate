"""Direct API access to the document-grounded flashcard generator."""

from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from langchain_core.language_models.chat_models import BaseChatModel
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_embeddings, get_quiz_llm
from app.db import crud
from app.db.models import User
from app.db.session import get_db
from app.schemas.flashcard import FlashcardGenerateRequest, FlashcardGenerateResponse
from app.tools.flashcard_tool import FlashcardGenerationError, generate_flashcards

router = APIRouter(prefix="/flashcards", tags=["flashcards"])


@router.post("/generate", response_model=FlashcardGenerateResponse)
def generate_flashcards_endpoint(
    payload: FlashcardGenerateRequest,
    llm: Annotated[BaseChatModel, Depends(get_quiz_llm)],
    embeddings: Annotated[Any, Depends(get_embeddings)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> FlashcardGenerateResponse:
    """Generate flashcards directly for a selected uploaded document."""
    if not crud.verify_document_owner(db, payload.document_id, current_user.id):
        raise HTTPException(status_code=404, detail="Document does not exist.")
    try:
        return generate_flashcards(
            llm,
            payload.document_id,
            payload.topic,
            payload.num_cards,
            embeddings=embeddings,
            db=db,
        )
    except FlashcardGenerationError as error:
        status_code = (
            status.HTTP_404_NOT_FOUND
            if "does not exist" in str(error)
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        raise HTTPException(status_code=status_code, detail=str(error)) from error
