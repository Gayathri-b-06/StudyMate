"""Document-grounded quiz generation backed by StudyMate's existing retriever."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from langchain.tools import tool
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.db import crud
from app.db.session import SessionLocal
from app.rag.retriever import RetrievedChunk, retrieve
from app.schemas.quiz import QuizGenerateResponse
from app.config import DEFAULT_USER_ID
from app.tools.memory_tool import record_studied_topic


class QuizGenerationError(RuntimeError):
    """Raised when a grounded quiz cannot be generated safely."""


def _format_context(chunks: list[RetrievedChunk]) -> str:
    """Format retrieved chunks as bounded, traceable quiz evidence."""
    return "\n\n".join(
        f"[SOURCE:{index}] {Path(chunk.source).name}, page {chunk.page + 1 if chunk.page is not None else 'unknown'}\n{chunk.content}"
        for index, chunk in enumerate(chunks, start=1)
    )


def _response_content(response: Any) -> str:
    """Extract text from a LangChain chat response without provider coupling."""
    content = getattr(response, "content", "")
    if isinstance(content, str):
        return content.strip()
    return str(content).strip()


def _validate_quiz_json(
    payload: str,
    *,
    document_id: str,
    topic: str,
    difficulty: str,
) -> QuizGenerateResponse:
    """Parse the model JSON and enforce request-owned metadata."""
    parsed = QuizGenerateResponse.model_validate_json(payload)
    if (
        parsed.document_id != document_id
        or parsed.topic != topic
        or parsed.difficulty != difficulty
    ):
        raise ValueError("The generated quiz metadata did not match the request.")
    for question in parsed.questions:
        if question.correct_index >= len(question.options):
            raise ValueError("A generated quiz question has an invalid correct_index.")
    return parsed


def generate_quiz(
    llm: BaseChatModel,
    document_id: str,
    topic: str,
    num_questions: int = 10,
    difficulty: Literal["easy", "medium", "hard"] = "medium",
    *,
    embeddings: Any,
    db: Session,
) -> QuizGenerateResponse:
    """Generate one grounded multiple-choice quiz using a single LLM attempt.

    A second LLM request is made only when the first response cannot be parsed
    as the required JSON contract.
    """
    document = crud.get_document(db, document_id)
    if document is None:
        raise QuizGenerationError("The requested document does not exist.")

    chunks = retrieve(
        topic,
        document.vectorstore_path,
        embeddings,
        use_hybrid_search=True,
        use_reranking=True,
        k=max(12, num_questions * 2),
        rerank_top_k=max(6, num_questions),
    )
    if not chunks:
        raise QuizGenerationError("No relevant document content was found for this quiz topic.")

    context = _format_context(chunks)
    required_shape = {
        "type": "tool_result",
        "tool": "quiz",
        "document_id": document_id,
        "topic": topic,
        "difficulty": difficulty,
        "questions": [
            {
                "question": "...",
                "options": ["...", "...", "...", "..."],
                "correct_index": 0,
                "explanation": "...",
            }
        ],
    }
    system = SystemMessage(
        content=(
            "You create multiple-choice quizzes using only the supplied document context. "
            "Never use outside knowledge or invent facts. Return ONLY valid JSON, with no markdown fences or prose. "
            "Every question must have options and a zero-based correct_index."
        )
    )
    prompt = HumanMessage(
        content=(
            f"Create exactly {num_questions} {difficulty} questions about {topic!r} from this document.\n"
            f"Required JSON shape:\n{json.dumps(required_shape)}\n\n"
            f"Document context:\n{context}"
        )
    )
    raw = _response_content(llm.invoke([system, prompt]))
    try:
        result = _validate_quiz_json(
            raw, document_id=document_id, topic=topic, difficulty=difficulty
        )
    except (ValidationError, ValueError) as first_error:
        retry = HumanMessage(
            content=(
                "Your previous response was invalid. Return the corrected response as ONLY valid JSON matching this exact schema and metadata. "
                f"Schema example: {json.dumps(required_shape)}\nPrevious response:\n{raw}"
            )
        )
        try:
            result = _validate_quiz_json(
                _response_content(llm.invoke([system, prompt, retry])),
                document_id=document_id,
                topic=topic,
                difficulty=difficulty,
            )
        except (ValidationError, ValueError) as retry_error:
            raise QuizGenerationError("The quiz model did not return a valid quiz JSON result.") from retry_error

    crud.log_study_event(
        db,
        thread_id=document.thread_id,
        document_id=document.id,
        event_type="quiz_generated",
        topic=topic,
    )
    record_studied_topic(db, DEFAULT_USER_ID, topic, document.id)
    return result


def create_quiz_tool(llm: BaseChatModel, embeddings: Any) -> BaseTool:
    """Create the agent tool; runtime identity selects the active thread's document."""

    @tool(response_format="content_and_artifact")
    def generate_document_quiz(
        topic: str,
        config: RunnableConfig,
        num_questions: int = 10,
        difficulty: Literal["easy", "medium", "hard"] = "medium",
    ) -> tuple[str, dict[str, Any]]:
        """Generate a quiz about an uploaded document topic.

        Use this when the user asks to be quizzed, requests practice questions,
        or asks to generate a quiz from their uploaded material. It uses the
        active conversation's single uploaded document. If several documents
        are uploaded, ask the user to specify one instead of guessing.
        """
        thread_id = config.get("configurable", {}).get("thread_id")
        if not isinstance(thread_id, str) or not thread_id:
            return "I need an active conversation before I can generate a document quiz.", {}

        db = SessionLocal()
        try:
            documents = crud.list_documents_for_thread(db, thread_id)
            if not documents:
                return "No uploaded document is available for a quiz in this conversation.", {}
            if len(documents) != 1:
                names = ", ".join(document.filename for document in documents)
                return f"Please specify which uploaded document to quiz you on: {names}.", {}
            result = generate_quiz(
                llm,
                documents[0].id,
                topic,
                num_questions,
                difficulty,
                embeddings=embeddings,
                db=db,
            )
            return "A document-grounded quiz has been generated.", result.model_dump(mode="json")
        except QuizGenerationError as error:
            return str(error), {}
        finally:
            db.close()

    return generate_document_quiz
