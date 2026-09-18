"""FastAPI endpoints for thread-scoped PDF documents."""

from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user, get_document_service
from app.db import crud
from app.db.models import User
from app.db.session import get_db
from app.rag.exceptions import PDFIngestError
from app.schemas.document import DocumentResponse, DocumentStatusResponse, DocumentUploadResponse
from app.services.document_service import DocumentNotFoundError, DocumentService, ThreadNotFoundForDocumentError

router = APIRouter(tags=["documents"])


def _serialize(document) -> DocumentResponse:
    return DocumentResponse(
        id=document.id,
        thread_id=document.thread_id,
        filename=document.filename,
        vectorstore_path=document.vectorstore_path,
        page_count=document.page_count,
        chunk_count=document.chunk_count,
        index_status=getattr(document, "index_status", "ready"),
        index_error=getattr(document, "index_error", None),
        uploaded_at=document.uploaded_at,
    )


@router.post(
    "/threads/{thread_id}/documents/upload",
    response_model=DocumentUploadResponse,
    status_code=status.HTTP_202_ACCEPTED,
    openapi_extra={
        "requestBody": {
            "content": {
                "multipart/form-data": {
                    "schema": {
                        "type": "object",
                        "required": ["files"],
                        "properties": {
                            "files": {
                                "type": "array",
                                "items": {"type": "string", "format": "binary"},
                            }
                        },
                    }
                }
            }
        }
    },
)
async def upload_documents(
    thread_id: str,
    service: Annotated[DocumentService, Depends(get_document_service)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    files: list[UploadFile] = File(...),
) -> DocumentUploadResponse:
    """Ingest one or more PDF uploads. Returns 202 immediately; poll /documents/{id}/status for completion."""
    if not crud.verify_thread_owner(db, thread_id, current_user.id):
        raise HTTPException(status_code=404, detail="Thread not found.")
    if any(
        file.content_type not in {"application/pdf", "application/x-pdf"}
        and not (file.filename or "").lower().endswith(".pdf")
        for file in files
    ):
        raise HTTPException(status_code=415, detail="Only PDF uploads are supported.")
    payloads = [(file.filename or "document.pdf", await file.read()) for file in files]
    try:
        documents = service.upload(db, thread_id, payloads)
    except ThreadNotFoundForDocumentError as error:
        raise HTTPException(status_code=404, detail="Thread not found.") from error
    except PDFIngestError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    return DocumentUploadResponse(documents=[_serialize(document) for document in documents])


@router.get("/documents/{document_id}/status", response_model=DocumentStatusResponse)
def get_document_status(
    document_id: str,
    service: Annotated[DocumentService, Depends(get_document_service)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> DocumentStatusResponse:
    """Poll the async indexing status of a document."""
    if not crud.verify_document_owner(db, document_id, current_user.id):
        raise HTTPException(status_code=404, detail="Document not found.")
    try:
        doc = service.get_status(db, document_id)
    except DocumentNotFoundError as error:
        raise HTTPException(status_code=404, detail="Document not found.") from error
    return DocumentStatusResponse(
        id=doc.id,
        index_status=getattr(doc, "index_status", "ready"),
        page_count=doc.page_count,
        chunk_count=doc.chunk_count,
        index_error=getattr(doc, "index_error", None),
    )


@router.get("/threads/{thread_id}/documents", response_model=list[DocumentResponse])
def list_documents(thread_id: str, service: Annotated[DocumentService, Depends(get_document_service)], db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]) -> list[DocumentResponse]:
    """List documents uploaded to an existing thread."""
    if not crud.verify_thread_owner(db, thread_id, current_user.id):
        raise HTTPException(status_code=404, detail="Thread not found.")
    try:
        return [_serialize(document) for document in service.list_for_thread(db, thread_id)]
    except ThreadNotFoundForDocumentError as error:
        raise HTTPException(status_code=404, detail="Thread not found.") from error


@router.get("/projects/{project_id}/documents", response_model=list[DocumentResponse])
def list_project_documents(project_id: str, db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]) -> list[DocumentResponse]:
    """List sources for a project; conversation selection does not affect this."""
    if not crud.verify_project_owner(db, project_id, current_user.id):
        raise HTTPException(status_code=404, detail="Project not found.")
    return [_serialize(document) for document in crud.list_documents_for_project(db, project_id)]


@router.post("/projects/{project_id}/documents/upload", response_model=DocumentUploadResponse, status_code=status.HTTP_202_ACCEPTED)
async def upload_project_documents(
    project_id: str,
    service: Annotated[DocumentService, Depends(get_document_service)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    files: list[UploadFile] = File(...),
) -> DocumentUploadResponse:
    """Upload project sources without requiring a selected chat thread.

    The existing document storage is retained; a project-owned conversation is
    used only as the backing record when the project has no conversation yet.
    """
    if not crud.verify_project_owner(db, project_id, current_user.id):
        raise HTTPException(status_code=404, detail="Project not found.")
    if any(file.content_type not in {"application/pdf", "application/x-pdf"} and not (file.filename or "").lower().endswith(".pdf") for file in files):
        raise HTTPException(status_code=415, detail="Only PDF uploads are supported.")
    threads = crud.list_threads(db, project_id, limit=1)
    backing_thread = threads[0] if threads else crud.create_thread(db, thread_id=str(uuid4()), title="Project sources", project_id=project_id)
    payloads = [(file.filename or "document.pdf", await file.read()) for file in files]
    documents = service.upload(db, backing_thread.id, payloads)
    return DocumentUploadResponse(documents=[_serialize(document) for document in documents])


@router.delete("/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(document_id: str, service: Annotated[DocumentService, Depends(get_document_service)], db: Annotated[Session, Depends(get_db)], current_user: Annotated[User, Depends(get_current_user)]) -> None:
    """Delete one document and its persisted FAISS index."""
    if not crud.verify_document_owner(db, document_id, current_user.id):
        raise HTTPException(status_code=404, detail="Document not found.")
    try:
        service.delete(db, document_id)
    except DocumentNotFoundError as error:
        raise HTTPException(status_code=404, detail="Document not found.") from error
