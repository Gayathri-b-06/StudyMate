"""Document-grounded quiz generation backed by StudyMate's existing retriever."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
from pathlib import Path
from typing import Any, Literal

from cryptography.fernet import Fernet
from langchain.tools import tool
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.config import DEFAULT_USER_ID
from app.db import crud
from app.db.session import SessionLocal
from app.rag.retriever import RetrievedChunk, retrieve
from app.schemas.quiz import (
    OpenEndedGradeEvaluation,
    QuizGenerateResponse,
    QuizQuestion,
)
from app.tools.memory_tool import record_studied_topic

_SECRET_KEY = os.getenv("STUDYMATE_SECRET_KEY", "studymate_quiz_grading_secret_key_v1")
_FERNET_KEY = base64.urlsafe_b64encode(hashlib.sha256(_SECRET_KEY.encode()).digest())
_FERNET = Fernet(_FERNET_KEY)


def encrypt_grading_payload(payload: dict[str, Any]) -> str:
    """Encrypt model answer and rubric into a tamper-proof, confidential token using AES-128-CBC + HMAC-SHA256."""
    raw = json.dumps(payload).encode("utf-8")
    return _FERNET.encrypt(raw).decode("utf-8")


def decrypt_grading_payload(token: str) -> dict[str, Any]:
    """Decrypt and verify grading token, raising ValueError if invalid or tampered."""
    try:
        raw = _FERNET.decrypt(token.encode("utf-8"))
        return json.loads(raw.decode("utf-8"))
    except Exception as exc:
        raise ValueError("Invalid or tampered grading token.") from exc


def compute_open_ended_score(evaluation: OpenEndedGradeEvaluation) -> float:
    """Derive deterministic numeric session_score [0.0, 100.0] from qualitative evaluation."""
    covered = len(evaluation.key_concepts_covered)
    missing = len(evaluation.missing_concepts)
    total_concepts = max(1, covered + missing)
    concept_ratio = covered / total_concepts

    understanding_weights = {
        "excellent": 1.0,
        "good": 0.85,
        "partial": 0.50,
        "poor": 0.15,
    }
    accuracy_weights = {
        "high": 1.0,
        "moderate": 0.75,
        "low": 0.40,
        "incorrect": 0.0,
    }
    relevance_multipliers = {
        "direct": 1.0,
        "tangential": 0.60,
        "irrelevant": 0.0,
    }

    w_u = understanding_weights.get(evaluation.understanding, 0.50)
    w_a = accuracy_weights.get(evaluation.accuracy, 0.50)
    m_r = relevance_multipliers.get(evaluation.relevance, 1.0)

    if m_r == 0.0:
        return 0.0

    raw = 100.0 * (0.50 * concept_ratio + 0.30 * w_a + 0.20 * w_u) * m_r
    return round(max(0.0, min(100.0, raw)), 1)


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


def _clean_json_payload(payload: str) -> str:
    cleaned = payload.strip()
    json_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if json_match:
        return json_match.group(1).strip()
    brace_match = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", cleaned)
    if brace_match:
        return brace_match.group(1).strip()
    return cleaned


def _validate_quiz_json(
    payload: str,
    *,
    document_id: str,
    topic: str,
    difficulty: str,
) -> QuizGenerateResponse:
    """Parse the model JSON and enforce request-owned metadata and answer secrecy."""
    cleaned = _clean_json_payload(payload)

    try:
        data = json.loads(cleaned)
    except Exception as err:
        raise ValueError(f"Invalid JSON payload: {err}") from err

    if isinstance(data, list):
        raw_questions = data
    elif isinstance(data, dict):
        raw_questions = data.get("questions") or data.get("quiz") or []
    else:
        raw_questions = []

    if not isinstance(raw_questions, list) or not raw_questions:
        raise ValueError("Generated quiz must contain at least one question.")

    processed_questions: list[QuizQuestion] = []
    for item in raw_questions:
        q_type = item.get("question_type", "mcq")
        q_text = item.get("question") or item.get("prompt") or item.get("question_text") or ""
        if not q_text:
            continue
        if q_type == "open_ended":
            model_answer = item.get("model_answer") or item.get("explanation") or item.get("answer") or ""
            rubric_points = item.get("rubric_points") or item.get("key_concepts") or item.get("rubric") or []
            if isinstance(rubric_points, str):
                rubric_points = [rubric_points]
            if not rubric_points and model_answer:
                rubric_points = [model_answer[:100]]

            grading_token = item.get("grading_token")
            if not grading_token:
                grading_token = encrypt_grading_payload({
                    "model_answer": model_answer,
                    "rubric_points": rubric_points,
                    "explanation": item.get("explanation", ""),
                    "source_citation": item.get("source_citation"),
                })

            processed_questions.append(
                QuizQuestion(
                    question=q_text,
                    question_type="open_ended",
                    options=None,
                    correct_index=None,
                    explanation=None,
                    source_citation=item.get("source_citation"),
                    grading_token=grading_token,
                )
            )
        else:
            options = item.get("options") or []
            correct_index = item.get("correct_index", 0)
            if not isinstance(options, list) or len(options) < 2:
                raise ValueError("MCQ questions must have at least 2 options.")
            if correct_index is None or correct_index >= len(options):
                raise ValueError("A generated quiz question has an invalid correct_index.")
            processed_questions.append(
                QuizQuestion(
                    question=item["question"],
                    question_type="mcq",
                    options=options,
                    correct_index=correct_index,
                    explanation=item.get("explanation", ""),
                    source_citation=item.get("source_citation"),
                    grading_token=None,
                )
            )

    return QuizGenerateResponse(
        type="tool_result",
        tool="quiz",
        document_id=document_id,
        topic=topic,
        difficulty=difficulty,
        questions=processed_questions,
    )


def generate_quiz(
    llm: BaseChatModel,
    document_id: str,
    topic: str,
    num_questions: int = 10,
    difficulty: Literal["easy", "medium", "hard"] = "medium",
    question_type: Literal["mcq", "open_ended", "mixed"] = "mcq",
    *,
    embeddings: Any,
    db: Session,
) -> QuizGenerateResponse:
    """Generate one grounded quiz (MCQ, open-ended, or mixed)."""
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

    if question_type == "open_ended":
        required_shape = {
            "type": "tool_result",
            "tool": "quiz",
            "document_id": document_id,
            "topic": topic,
            "difficulty": difficulty,
            "questions": [
                {
                    "question_type": "open_ended",
                    "question": "...",
                    "model_answer": "...",
                    "rubric_points": ["key concept 1", "key concept 2"],
                    "explanation": "...",
                    "source_citation": "filename.pdf, page 14",
                }
            ],
        }
        type_rules = (
            "Generate OPEN-ENDED conceptual questions testing deep understanding, reasoning, and synthesis.\n"
            "For each question, provide:\n"
            "- 'question_type': 'open_ended'\n"
            "- 'question': Thought-provoking conceptual question\n"
            "- 'model_answer': A comprehensive, ideal answer grounded in the source text\n"
            "- 'rubric_points': A list of 2-4 essential key concepts that a correct student answer MUST address\n"
            "- 'explanation': Brief conceptual explanation\n"
            "- 'source_citation': Exact filename and page from context"
        )
    elif question_type == "mixed":
        required_shape = {
            "type": "tool_result",
            "tool": "quiz",
            "document_id": document_id,
            "topic": topic,
            "difficulty": difficulty,
            "questions": [
                {
                    "question_type": "mcq",
                    "question": "...",
                    "options": ["...", "...", "...", "..."],
                    "correct_index": 0,
                    "explanation": "...",
                    "source_citation": "filename.pdf, page 14",
                },
                {
                    "question_type": "open_ended",
                    "question": "...",
                    "model_answer": "...",
                    "rubric_points": ["key concept 1", "key concept 2"],
                    "explanation": "...",
                    "source_citation": "filename.pdf, page 14",
                },
            ],
        }
        type_rules = (
            "Generate a MIXED quiz: approximately half multiple-choice questions ('mcq') and half open-ended questions ('open_ended').\n"
            "For 'mcq': provide options (list of 4) and zero-based correct_index.\n"
            "For 'open_ended': provide question, model_answer, rubric_points (list of 2-4 key concepts), and explanation."
        )
    else:
        required_shape = {
            "type": "tool_result",
            "tool": "quiz",
            "document_id": document_id,
            "topic": topic,
            "difficulty": difficulty,
            "questions": [
                {
                    "question_type": "mcq",
                    "question": "...",
                    "options": ["...", "...", "...", "..."],
                    "correct_index": 0,
                    "explanation": "...",
                    "source_citation": "filename.pdf, page 14",
                }
            ],
        }
        type_rules = (
            "Generate MULTIPLE-CHOICE conceptual questions.\n"
            "Write 4 answer options: 1 correct, 3 plausible distractors reflecting common misconceptions.\n"
            "Set question_type to 'mcq', provide zero-based correct_index, explanation, and source_citation."
        )

    system = SystemMessage(
        content=(
            "You are generating conceptual comprehension questions for a study quiz.\n"
            "You will be given chunks of source material (with page/source references).\n\n"
            "RULES:\n"
            "1. Test understanding of the underlying CONCEPT, not recall of exact wording.\n"
            "2. Strip out incidental details and focus on core principles.\n"
            "3. Questions must be grounded in the provided document context.\n"
            f"{type_rules}\n\n"
            "Never use outside knowledge. Return ONLY valid JSON, with no markdown fences or prose."
        )
    )
    prompt = HumanMessage(
        content=(
            f"Create exactly {num_questions} {difficulty} questions ({question_type}) about {topic!r} from this document.\n"
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


def grade_open_ended_response(
    llm: BaseChatModel,
    *,
    question: str,
    user_answer: str,
    grading_token: str,
) -> tuple[float, OpenEndedGradeEvaluation]:
    """Grade a student's open-ended answer against the encrypted rubric."""
    try:
        rubric_data = decrypt_grading_payload(grading_token)
    except ValueError as err:
        raise QuizGenerationError("Invalid or corrupted grading token.") from err

    model_answer = rubric_data.get("model_answer", "")
    rubric_points = rubric_data.get("rubric_points", [])

    system = SystemMessage(
        content=(
            "You are an expert educational evaluator evaluating a student's answer to an open-ended question.\n"
            "Evaluate the response objectively based on understanding, accuracy, relevance, key concepts covered, "
            "and missing concepts compared against the model answer and rubric.\n\n"
            "Return ONLY a JSON object with this exact schema:\n"
            "{\n"
            '  "understanding": "excellent" | "good" | "partial" | "poor",\n'
            '  "accuracy": "high" | "moderate" | "low" | "incorrect",\n'
            '  "relevance": "direct" | "tangential" | "irrelevant",\n'
            '  "key_concepts_covered": ["concept 1", ...],\n'
            '  "missing_concepts": ["concept 2", ...],\n'
            '  "feedback": "Educational explanation explaining clearly what the student understood and what was missing or incorrect."\n'
            "}\n"
            "No markdown fences, no extra keys."
        )
    )
    prompt = HumanMessage(
        content=(
            f"Question:\n{question}\n\n"
            f"Model Answer:\n{model_answer}\n\n"
            f"Rubric / Key Points to look for:\n{json.dumps(rubric_points)}\n\n"
            f"Student's Answer:\n{user_answer}"
        )
    )

    raw = _response_content(llm.invoke([system, prompt]))
    try:
        eval_result = OpenEndedGradeEvaluation.model_validate_json(raw)
    except (ValidationError, ValueError, json.JSONDecodeError):
        retry = HumanMessage(
            content="Your previous response was not valid JSON matching the schema. Return ONLY valid JSON with understanding, accuracy, relevance, key_concepts_covered, missing_concepts, and feedback."
        )
        try:
            raw_retry = _response_content(llm.invoke([system, prompt, retry]))
            eval_result = OpenEndedGradeEvaluation.model_validate_json(raw_retry)
        except Exception as exc:
            raise QuizGenerationError("Failed to evaluate open-ended response with LLM.") from exc

    score = compute_open_ended_score(eval_result)
    return score, eval_result


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
