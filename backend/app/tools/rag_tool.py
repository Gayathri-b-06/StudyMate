"""Tool wrapper that exposes the existing StudyMate RAG retriever to LangGraph."""

from collections.abc import Callable
from pathlib import Path
from typing import TYPE_CHECKING, Any
import logging

from langchain.tools import tool
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool

logger = logging.getLogger(__name__)

from app.db import crud
from app.db.session import SessionLocal
from app.rag.exceptions import DocumentNotIndexedError
from app.rag.retriever import retrieve

if TYPE_CHECKING:
    from app.rag.retriever import RetrievedChunk

VectorstorePathResolver = Callable[[str], list[str]]


def get_vectorstore_paths_for_thread(thread_id: str) -> list[str]:
    """Return project-level sources for the active conversation's project."""
    db = SessionLocal()
    try:
        thread = crud.get_thread(db, thread_id)
        if thread is None:
            return []
        return [
            document.vectorstore_path
            for document in crud.list_documents_for_project(db, thread.project_id)
        ]
    finally:
        db.close()


def _format_context(chunks: list["RetrievedChunk"], max_total_chars: int = 6000) -> str:
    """Format retrieved chunks with stable source citations for the model.

    ``max_total_chars`` caps the total context length so large PDFs cannot
    push requests over Groq's free-tier token limit.
    """
    if not chunks:
        return (
            "No relevant uploaded-document context was found. State this clearly "
            "and do not invent document-based facts."
        )

    sections = []
    total_chars = 0
    for number, chunk in enumerate(chunks, start=1):
        source_name = Path(chunk.source).name if chunk.source else "document"
        page = f", page {chunk.page + 1}" if chunk.page is not None else ""
        # Truncate individual chunks to avoid a single monster chunk blowing the limit
        content = chunk.content[:1500] if len(chunk.content) > 1500 else chunk.content
        entry = f"[SOURCE:{number}] {source_name}{page}\n{content}"
        if total_chars + len(entry) > max_total_chars:
            break
        sections.append(entry)
        total_chars += len(entry)
    return "Retrieved uploaded-document context:\n\n" + "\n\n".join(sections)


def _build_citation_artifacts(chunks: list["RetrievedChunk"]) -> list[dict[str, Any]]:
    """Build source-ID metadata; response services deduplicate selected pages."""
    citations: list[dict[str, Any]] = []

    for citation_id, chunk in enumerate(chunks, start=1):
        doc_name = Path(chunk.source).name if chunk.source else "document"
        page_num = chunk.page + 1 if chunk.page is not None else None
        citations.append(
            {"citation_id": citation_id, "document": doc_name, "page": page_num}
        )
    return citations


def create_rag_tool(
    embeddings: Any,
    *,
    vectorstore_path_resolver: VectorstorePathResolver = get_vectorstore_paths_for_thread,
) -> BaseTool:
    """Create a tool that retrieves context from all documents in the active project.

    LangChain injects invocation configuration, keeping ``thread_id`` out of
    the model-visible tool schema.
    """

    @tool(response_format="content_and_artifact")
    def search_uploaded_documents(query: str, config: RunnableConfig) -> tuple[str, dict[str, Any]]:
        """Search the current project's uploaded PDF documents for facts needed to answer a study question."""
        logger.info(
            "ToolNode executing search_uploaded_documents with query=%r", query
        )
        thread_id = config.get("configurable", {}).get("thread_id")
        if not isinstance(thread_id, str) or not thread_id:
            logger.warning("No thread_id available for document retrieval.")
            return "No conversation identity is available for document retrieval.", {
                "status": "no_identity",
                "query": query,
            }

        paths = vectorstore_path_resolver(thread_id)
        if not paths:
            logger.info("AI Tutor retrieval: thread_id=%s source=project_documents results=0 fallback=no_documents", thread_id)
            return "No uploaded documents are available in this project.", {
                "status": "no_documents",
                "query": query,
            }

        chunks: list[Any] = []

        def _retrieve_one(path: str) -> list[Any]:
            try:
                return retrieve(
                    query,
                    path,
                    embeddings,
                    use_hybrid_search=True,
                    k=8,           # reduced from 15 to save tokens
                    rerank_top_k=4, # reduced from 6 to save tokens
                    min_relevance_score=0.15,  # PRD §7 calibrated threshold to prevent hallucination
                )
            except DocumentNotIndexedError:
                return []

        if len(paths) == 1:
            chunks.extend(_retrieve_one(paths[0]))
        else:
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(paths), 4)) as executor:
                for path_results in executor.map(_retrieve_one, paths):
                    chunks.extend(path_results)

        if not chunks:
            # A strict relevance threshold is useful for precision, but it must not
            # turn a valid project library into a silent empty answer.  Retry once
            # with the best available chunks and let the grounded synthesizer state
            # when the passages still do not answer the question.
            logger.info(
                "AI Tutor retrieval: no chunks at calibrated threshold; retrying project sources with fallback threshold"
            )

            def _retrieve_fallback(path: str) -> list[Any]:
                try:
                    return retrieve(
                        query,
                        path,
                        embeddings,
                        use_hybrid_search=True,
                        k=4,
                        rerank_top_k=2,
                        min_relevance_score=0.0,
                    )
                except DocumentNotIndexedError:
                    return []

            if len(paths) == 1:
                chunks.extend(_retrieve_fallback(paths[0]))
            else:
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor(max_workers=min(len(paths), 4)) as executor:
                    for path_results in executor.map(_retrieve_fallback, paths):
                        chunks.extend(path_results)

        if not chunks:
            logger.info(
                "ToolNode search_uploaded_documents: no chunks met relevance threshold 0.15 for query=%r",
                query,
            )
            return (
                "The uploaded documents do not contain sufficient evidence to answer this question reliably.",
                {
                    "status": "insufficient_evidence",
                    "query": query,
                    "confidence": 0.0,
                    "chunks": 0,
                },
            )

        chunks.sort(key=lambda chunk: chunk.relevance_score or 0.0, reverse=True)
        top_score = float(chunks[0].relevance_score or 0.0)
        context = _format_context(chunks)
        logger.info(
            "AI Tutor retrieval: thread_id=%s source=project_documents paths=%d results=%d",
            thread_id, len(paths), len(chunks),
        )
        logger.info(
            "ToolNode completed search_uploaded_documents: retrieved_chunks=%d, top_score=%.4f",
            len(chunks),
            top_score,
        )
        return context, {
            "status": "evidence_found",
            "query": query,
            "confidence": top_score,
            "chunks": len(chunks),
        }

    return search_uploaded_documents
