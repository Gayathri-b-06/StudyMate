"""Business operations for PDF ingestion and persisted vector stores."""

from __future__ import annotations

import logging
import threading
import time
from pathlib import Path
from typing import Any
from uuid import uuid4

from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from app.db import crud
from app.db.models import Document
from app.db.session import SessionLocal
from app.runtime_paths import get_runtime_data_dir

logger = logging.getLogger(__name__)

_VECTORSTORE_DIR = get_runtime_data_dir() / "vectorstores"
_INDEX_STATUS_RETRY_COUNT = 3
_INDEXING_LOCK = threading.Lock()


def _persist_index_status(
    document_id: str,
    *,
    status: str,
    page_count: int | None = None,
    chunk_count: int | None = None,
    error_message: str | None = None,
) -> float:
    """Save a worker's terminal state with a fresh session and DB-lock retries."""
    started = time.perf_counter()
    for attempt in range(1, _INDEX_STATUS_RETRY_COUNT + 1):
        db = SessionLocal()
        try:
            updated = crud.set_document_index_status(
                db, document_id, status=status, page_count=page_count,
                chunk_count=chunk_count, error_message=error_message,
            )
            if updated is None:
                logger.warning("Document %s disappeared before status %s was recorded", document_id, status)
            return (time.perf_counter() - started) * 1000
        except SQLAlchemyError:
            db.rollback()
            if attempt == _INDEX_STATUS_RETRY_COUNT:
                logger.exception("Could not persist %s status for document %s", status, document_id)
                return (time.perf_counter() - started) * 1000
            logger.warning("Retrying %s status for document %s after DB error (%d/%d)", status, document_id, attempt, _INDEX_STATUS_RETRY_COUNT)
            time.sleep(0.1 * attempt)
        finally:
            db.close()
    return (time.perf_counter() - started) * 1000


class ThreadNotFoundForDocumentError(LookupError):
    """Raised when a document operation references an absent thread."""


class DocumentNotFoundError(LookupError):
    """Raised when a document operation references an absent document."""


def _fast_page_count(content: bytes) -> int:
    """Extract page count from PDF header in <5ms without text extraction or chunking."""
    try:
        import io
        import pypdf
        reader = pypdf.PdfReader(io.BytesIO(content))
        return len(reader.pages)
    except Exception:
        return 0


def _run_indexing_background(
    document_id: str,
    filename: str,
    content: bytes,
    save_path: str,
    embeddings: Any,
) -> None:
    """Build and save the FAISS index in a worker thread, then update status in DB."""
    t_start = time.perf_counter()
    try:
        _persist_index_status(document_id, status="indexing")
        from app.rag.ingest import load_and_chunk_pdf
        from app.rag.store import build_and_save_index, load_index_metadata, embedding_identifier
        if embeddings is None:
            from app.rag.embeddings import get_embeddings
            embeddings = get_embeddings()

        # Check if this document already has a valid, compatible index on disk
        existing_metadata = load_index_metadata(save_path)
        current_model_id = embedding_identifier(embeddings)
        expected_dim = getattr(embeddings, "embedding_dimension", 384)
        if (
            existing_metadata
            and existing_metadata.get("embedding_identifier") == current_model_id
            and int(existing_metadata.get("embedding_dimension", 0)) == int(expected_dim)
            and (Path(save_path) / "index.faiss").exists()
        ):
            logger.info(
                "Document %s already indexed with model %s (dim=%d); skipping re-indexing",
                document_id,
                current_model_id,
                expected_dim,
            )
            _persist_index_status(
                document_id,
                status="ready",
                page_count=existing_metadata.get("page_count", 0),
                chunk_count=existing_metadata.get("chunk_count", 0),
            )
            return

        # Single-pass parsing and chunking
        t0 = time.perf_counter()
        chunks, metadata = load_and_chunk_pdf(content, filename=filename)
        parse_chunk_ms = (time.perf_counter() - t0) * 1000
        page_count = metadata.get("page_count", 0)
        chunk_count = metadata.get("chunk_count", len(chunks))

        # Release raw PDF bytes to prevent memory buildup on 8 GB RAM
        del content

        # Build & save FAISS and BM25 store (uses batched embeddings)
        t0 = time.perf_counter()
        index_timings = build_and_save_index(
            chunks,
            embeddings,
            save_path,
        )
        index_ms = (time.perf_counter() - t0) * 1000

        # Release chunks from memory
        del chunks

        db_status_ms = _persist_index_status(
            document_id,
            status="ready",
            page_count=page_count,
            chunk_count=chunk_count,
        )
        total_ms = (time.perf_counter() - t_start) * 1000
        stats = getattr(embeddings, "last_stats", None)
        request_count = stats.request_count if stats else 0
        total_latency = stats.total_latency_ms if stats else 0.0
        avg_batch_ms = (total_latency / max(request_count, 1)) if request_count else 0.0

        logger.info(
            "Indexing complete for document %s (%s): extraction_and_chunking_ms=%.1f, "
            "embedding_ms=%.1f, embedding_batches=%d, avg_batch_latency_ms=%.1f, "
            "faiss_build_ms=%.1f, persistence_ms=%.1f, db_status_ms=%.1f, total_ms=%.1f, chunks=%d, pages=%d",
            document_id,
            filename,
            parse_chunk_ms,
            index_timings.get("embedding_ms", 0.0),
            request_count,
            avg_batch_ms,
            index_timings.get("faiss_build_ms", 0.0),
            index_timings.get("faiss_persist_ms", 0.0) + index_timings.get("chunks_persist_ms", 0.0) + index_timings.get("metadata_persist_ms", 0.0),
            db_status_ms,
            total_ms,
            chunk_count,
            page_count,
        )
    except Exception as error:
        logger.exception("Indexing failed for document %s (%s)", document_id, filename)
        # Cleanup must not hide the original indexing error or leave a job pending.
        try:
            from app.rag.store import delete_index
            delete_index(save_path)
        except Exception:
            logger.exception("Could not clean up failed index for document %s", document_id)
        _persist_index_status(document_id, status="error", error_message=str(error)[:1000] or type(error).__name__)


def _run_indexing_serialized(*args) -> None:
    # Multiple uploaded PDFs must not run model inference concurrently on a
    # memory-constrained server. Waiting documents retain their uploaded state.
    with _INDEXING_LOCK:
        _run_indexing_background(*args)


class DocumentService:
    """Ingest PDFs and coordinate their existing FAISS stores with CRUD records."""

    def __init__(self, embeddings: Any = None) -> None:
        self._embeddings = embeddings

    def upload(
        self,
        db: Session,
        thread_id: str,
        files: list[tuple[str, bytes]],
    ) -> list[Document]:
        """Save document records immediately; kick off FAISS indexing in background threads.

        Returns placeholder Document rows with ``index_status='uploaded'``.
        Callers should poll ``GET /documents/{id}/status`` until ``index_status='ready'``.
        """
        if crud.get_thread(db, thread_id) is None:
            raise ThreadNotFoundForDocumentError(thread_id)

        documents: list[Document] = []

        for filename, content in files:
            document_id = str(uuid4())
            save_path = _VECTORSTORE_DIR / thread_id / document_id

            # Fast page count without parsing or chunking text (< 5ms)
            page_count = _fast_page_count(content)

            # Persist placeholder row immediately so the frontend can show the file
            doc = crud.create_document(
                db,
                document_id=document_id,
                thread_id=thread_id,
                filename=filename,
                vectorstore_path=str(save_path),
                page_count=page_count,
                chunk_count=0,
            )
            documents.append(doc)

            # A non-daemon worker preserves its final DB commit on graceful reload.
            t = threading.Thread(
                target=_run_indexing_serialized,
                args=(
                    document_id,
                    filename,
                    content,
                    str(save_path),
                    self._embeddings,
                ),
                daemon=False,
                name=f"faiss-index-{document_id[:8]}",
            )
            t.start()
            logger.info(
                "Started background indexing thread %s for document %s (%s)",
                t.name,
                document_id,
                filename,
            )

        return documents

    def recover_interrupted_indexing(self, db: Session) -> int:
        """Mark leftover jobs terminal after a prior process was interrupted."""
        stale = db.query(Document).filter(Document.index_status == "indexing").all()
        for document in stale:
            crud.set_document_index_status(
                db, document.id, status="error",
                error_message="Indexing was interrupted by a server restart. Upload the document again.",
            )
        if stale:
            logger.warning("Marked %d interrupted indexing job(s) as error", len(stale))
        return len(stale)

    def rebuild_or_invalidate_incompatible_indexes(self, db: Session) -> dict[str, int]:
        """Verify all existing document indexes; rebuild from chunks.pkl if model or dimension mismatched."""
        from app.rag.store import embedding_identifier, load_index_metadata, load_chunks, build_and_save_index

        expected = embedding_identifier(self._embeddings)
        expected_dim = getattr(self._embeddings, "embedding_dimension", 384)
        rebuilt = 0
        invalidated = 0

        # Check all documents in ready or error status
        documents = db.query(Document).filter(Document.index_status.in_(["ready", "error"])).all()
        for document in documents:
            is_compatible = False
            try:
                metadata = load_index_metadata(document.vectorstore_path)
                faiss_file = Path(document.vectorstore_path) / "index.faiss"
                if (
                    metadata
                    and metadata.get("embedding_identifier") == expected
                    and int(metadata.get("embedding_dimension", 0)) == int(expected_dim)
                    and faiss_file.exists()
                ):
                    is_compatible = True
            except Exception:
                is_compatible = False

            if is_compatible:
                if document.index_status != "ready":
                    crud.set_document_index_status(
                        db, document.id, status="ready",
                        page_count=metadata.get("page_count", 0),
                        chunk_count=metadata.get("chunk_count", 0),
                    )
                    rebuilt += 1
                    logger.info("Restored status='ready' for compatible document %s (%s)", document.id, document.filename)
                continue

            if not is_compatible:
                # Attempt full automatic re-embedding if chunks.pkl is preserved
                chunks = load_chunks(document.vectorstore_path)
                if chunks:
                    try:
                        logger.info(
                            "Rebuilding document %s (%s) with %s (dim=%d) from %d preserved chunks...",
                            document.id, document.filename, expected, expected_dim, len(chunks),
                        )
                        build_and_save_index(chunks, self._embeddings, document.vectorstore_path)
                        crud.set_document_index_status(
                            db, document.id, status="ready", chunk_count=len(chunks),
                        )
                        rebuilt += 1
                        logger.info("Successfully rebuilt index for %s (%s)", document.id, document.filename)
                        continue
                    except Exception as err:
                        logger.warning("Failed to automatically rebuild %s: %s", document.id, err)

                # If chunks cannot be rebuilt, mark as error
                crud.set_document_index_status(
                    db, document.id, status="error",
                    error_message="This document uses a previous embedding model and chunks could not be recovered. Please re-upload.",
                )
                invalidated += 1

        if rebuilt:
            logger.info("Rebuilt %d legacy/mismatched document index(es) with %s", rebuilt, expected)
        if invalidated:
            logger.warning("Marked %d legacy embedding index(es) as error (re-upload needed)", invalidated)
        return {"rebuilt": rebuilt, "invalidated": invalidated}

    def invalidate_incompatible_indexes(self, db: Session) -> int:
        """Backwards-compatible wrapper."""
        res = self.rebuild_or_invalidate_incompatible_indexes(db)
        return res["invalidated"]

    def get_status(self, db: Session, document_id: str) -> Document:
        """Return current document record (for status polling)."""
        doc = crud.get_document(db, document_id)
        if doc is None:
            raise DocumentNotFoundError(document_id)
        return doc

    def list_for_thread(self, db: Session, thread_id: str) -> list[Document]:
        """Return documents for an existing thread."""
        if crud.get_thread(db, thread_id) is None:
            raise ThreadNotFoundForDocumentError(thread_id)
        return crud.list_documents_for_thread(db, thread_id)

    def delete(self, db: Session, document_id: str) -> None:
        """Remove a persisted vector store and its database record."""
        document = crud.get_document(db, document_id)
        if document is None:
            raise DocumentNotFoundError(document_id)
        from app.rag.store import delete_index

        delete_index(document.vectorstore_path)
        crud.delete_document(db, document_id)
