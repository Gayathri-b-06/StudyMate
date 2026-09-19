"""FastAPI application composition for StudyMate."""

from __future__ import annotations

import logging
import threading
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path
from dotenv import load_dotenv

# Ensure .env is loaded before any LangChain/LangGraph modules are imported
_BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(_BACKEND_DIR / ".env", override=True)

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.agent.checkpointer import close_checkpointer, create_checkpointer
from app.agent.graph import create_graph
from app.agent.llm import create_llm, create_quiz_llm
from app.api.dependencies import get_current_user
from app.api.chat import router as chat_router
from app.api.documents import router as document_router
from app.api.projects import router as projects_router
from app.api.rag import router as rag_router
from app.api.routes_analytics import router as analytics_router
from app.api.routes_flashcards import router as flashcard_router
from app.api.routes_quiz import router as quiz_router
from app.api.routes_planner import router as planner_router
from app.api.routes_progress import router as progress_router
from app.api.admin import router as admin_router
from app.api.auth import router as auth_router
from app.api.spaces import router as spaces_router
from app.api.threads import router as thread_router
from app.db.session import SessionLocal, init_db
from app.rag.embeddings import get_embeddings
from app.services.chat_service import ChatService
from app.services.document_service import DocumentService
from app.services.project_service import ProjectService
from app.services.rag_query_service import RagQueryService
from app.services.space_service import SpaceService
from app.services.thread_service import ThreadService
from app.tools.flashcard_tool import create_flashcard_tool
from app.tools.quiz_generator_tool import create_quiz_tool
from app.tools.rag_tool import create_rag_tool
from app.tools.study_planner_tool import create_study_planner_tool
from app.tools.flashcard_status_tool import create_flashcard_status_tool
from scripts.migrate_spaces_projects import DEFAULT_PROJECT_ID

logger = logging.getLogger(__name__)

# Explicit origins are required when credentials are permitted. Keep the
# Vite development hosts alongside the deployed Vercel frontend.
ALLOWED_CORS_ORIGINS = (
    "https://study-mate-one-liard.vercel.app",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
)


def _get_ai_initialization_lock(app: FastAPI) -> threading.Lock:
    """Return the one process-wide lock that guards heavyweight AI startup."""
    lock = getattr(app.state, "ai_initialization_lock", None)
    if lock is None:
        lock = threading.Lock()
        app.state.ai_initialization_lock = lock
    return lock


def initialize_ai_services(app: FastAPI, checkpointer) -> None:
    """Compose heavyweight AI services on first study-tool request only.

    Local embedding and reranker weights are intentionally not loaded during
    web-process startup.  This keeps the HTTP server within small deployment
    memory limits until a user actually invokes a RAG-backed feature.
    """
    try:
        logger.info("Initializing StudyMate AI services on demand (models are not pre-warmed).")
        embeddings = get_embeddings()
        logger.info(
            "Embeddings initialized: model=%s (dim=%d, batch_size=%d)",
            getattr(embeddings, "model_name", "unknown"),
            getattr(embeddings, "embedding_dimension", 0),
            getattr(embeddings, "batch_size", 0),
        )
        llm = create_llm()
        quiz_llm = create_quiz_llm()
        app.state.embeddings = embeddings
        app.state.llm = llm
        app.state.quiz_llm = quiz_llm
        app.state.document_service = DocumentService(embeddings)
        recovery_db = SessionLocal()
        try:
            app.state.document_service.recover_interrupted_indexing(recovery_db)
            app.state.document_service.rebuild_or_invalidate_incompatible_indexes(recovery_db)
        finally:
            recovery_db.close()
        app.state.rag_query_service = RagQueryService(embeddings, llm)
        app.state.thread_service = ThreadService()
        app.state.space_service = SpaceService()
        app.state.project_service = ProjectService()
        rag_tool = create_rag_tool(embeddings)
        quiz_tool = create_quiz_tool(quiz_llm, embeddings)
        flashcard_tool = create_flashcard_tool(quiz_llm, embeddings)
        planner_tool = create_study_planner_tool(quiz_llm)
        flashcard_status_tool = create_flashcard_status_tool()
        app.state.checkpointer = checkpointer
        tools = [rag_tool, quiz_tool, flashcard_tool, planner_tool, flashcard_status_tool]
        app.state.chat_service = ChatService(
            create_graph(llm=llm, checkpointer=checkpointer, tools=tools),
            tools=tools,
        )

        # The cross-encoder stays lazy too: it is loaded only by the first
        # retrieval that asks for reranking, then reused by its singleton cache.
        app.state.ai_status = "ready"
        logger.info("StudyMate AI services ready; embedding/reranker indexes load on demand.")
    except Exception:
        app.state.ai_status = "error"
        logger.exception("AI initialization failed; authentication remains available")


def ensure_ai_services(app: FastAPI) -> None:
    """Initialize expensive AI dependencies exactly once when a study tool needs them."""
    if getattr(app.state, "ai_status", "cold") == "ready":
        return
    with _get_ai_initialization_lock(app):
        if getattr(app.state, "ai_status", "cold") == "ready":
            return
        if getattr(app.state, "ai_status", "cold") == "error":
            raise RuntimeError("StudyMate AI services could not be initialized; see backend logs.")
        app.state.ai_status = "initializing"
        initialize_ai_services(app, app.state.checkpointer)
        if app.state.ai_status != "ready":
            raise RuntimeError("StudyMate AI services could not be initialized; see backend logs.")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Make account routes available as soon as the database is ready."""
    init_db()
    checkpointer = create_checkpointer()
    app.state.checkpointer = checkpointer
    app.state.ai_status = "cold"
    logger.info("StudyMate started with AI services cold; models and indexes load on first AI request.")
    try:
        yield
    finally:
        close_checkpointer(checkpointer)


def create_app() -> FastAPI:
    """Create the StudyMate FastAPI application."""
    app = FastAPI(title="StudyMate API", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(ALLOWED_CORS_ORIGINS),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    # Login/signup are public; /me and logout explicitly require a session.
    app.include_router(auth_router)
    protected = APIRouter(dependencies=[Depends(get_current_user)])
    protected.include_router(spaces_router)
    protected.include_router(projects_router)
    protected.include_router(chat_router)
    protected.include_router(document_router)
    protected.include_router(rag_router)
    protected.include_router(quiz_router)
    protected.include_router(flashcard_router)
    protected.include_router(planner_router)
    protected.include_router(progress_router)
    protected.include_router(thread_router)
    protected.include_router(analytics_router)
    protected.include_router(admin_router)
    app.include_router(protected)
    return app


app = create_app()
