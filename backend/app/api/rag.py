"""FastAPI endpoint for validating the existing RAG pipeline."""

from typing import Annotated
from pathlib import Path
from sqlalchemy.orm import Session

from fastapi import APIRouter, Depends, HTTPException, status

from app.api.dependencies import get_current_user, get_rag_query_service
from app.db.models import Document, Project, Thread, User
from app.db.session import get_db
from app.rag.exceptions import DocumentNotIndexedError
from app.schemas.rag import RagQueryRequest, RagQueryResponse
from app.services.rag_query_service import NoRelevantChunksError, RagQueryService

router = APIRouter(prefix="/rag", tags=["rag"])


@router.post("/query", response_model=RagQueryResponse)
def query_rag(
    payload: RagQueryRequest,
    service: Annotated[RagQueryService, Depends(get_rag_query_service)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> RagQueryResponse:
    """Return a grounded answer and retrieval metadata for an existing index."""
    requested_path = Path(payload.index_path).resolve()
    documents = (
        db.query(Document).join(Document.thread).join(Thread.project)
        .filter(Project.user_id == current_user.id).all()
    )
    document = next((doc for doc in documents if Path(doc.vectorstore_path).resolve() == requested_path), None)
    if document is None:
        raise HTTPException(status_code=404, detail="Document index not found.")
    try:
        return service.query(payload.model_copy(update={"index_path": document.vectorstore_path}))
    except DocumentNotIndexedError as error:
        status_code = (
            status.HTTP_404_NOT_FOUND
            if "No index exists" in str(error)
            else status.HTTP_422_UNPROCESSABLE_ENTITY
        )
        raise HTTPException(status_code=status_code, detail=str(error)) from error
    except NoRelevantChunksError as error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(error)
        ) from error
