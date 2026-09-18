"""HTTP contracts for uploaded StudyMate documents."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class DocumentResponse(BaseModel):
    """Persisted document metadata returned by document endpoints."""

    id: str
    thread_id: str
    filename: str
    vectorstore_path: str
    page_count: int
    chunk_count: int
    index_status: str  # 'uploaded' | 'indexing' | 'ready' | 'error'
    index_error: str | None = None
    uploaded_at: datetime


class DocumentUploadResponse(BaseModel):
    """Documents successfully submitted for ingestion (may still be indexing)."""

    documents: list[DocumentResponse]


class DocumentStatusResponse(BaseModel):
    """Lightweight polling response for async indexing state."""

    id: str
    index_status: Literal["uploaded", "indexing", "ready", "error"]
    page_count: int
    chunk_count: int
    index_error: str | None = None
