"""Tests for open-ended assessment generation, AES token encryption, and grading."""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from langchain_core.messages import AIMessage
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.api.dependencies import get_quiz_llm
from app.db import crud
from app.db.models import Base
from app.db.session import get_db
from app.main import app
from app.schemas.quiz import OpenEndedGradeEvaluation
from app.tools.quiz_generator_tool import (
    QuizGenerationError,
    compute_open_ended_score,
    decrypt_grading_payload,
    encrypt_grading_payload,
    grade_open_ended_response,
)


def test_compute_open_ended_score_rules():
    """Verify deterministic scoring rules from qualitative evaluations."""
    # 1. Full coverage, excellent, direct
    eval_perfect = OpenEndedGradeEvaluation(
        understanding="excellent",
        accuracy="high",
        relevance="direct",
        key_concepts_covered=["concept a", "concept b"],
        missing_concepts=[],
        feedback="Flawless explanation.",
    )
    score_perfect = compute_open_ended_score(eval_perfect)
    assert score_perfect == 100.0

    # 2. Irrelevant answer must strictly score 0.0 regardless of other fields
    eval_irrelevant = OpenEndedGradeEvaluation(
        understanding="excellent",
        accuracy="high",
        relevance="irrelevant",
        key_concepts_covered=["unrelated fact"],
        missing_concepts=["real concept"],
        feedback="Completely off-topic.",
    )
    assert compute_open_ended_score(eval_irrelevant) == 0.0

    # 3. Partial coverage (1 covered, 1 missing -> R=0.5), moderate accuracy (0.75), good understanding (0.85), direct
    # raw = 100 * (0.50 * 0.5 + 0.30 * 0.75 + 0.20 * 0.85) * 1.0 = 100 * (0.25 + 0.225 + 0.17) = 64.5
    eval_partial = OpenEndedGradeEvaluation(
        understanding="good",
        accuracy="moderate",
        relevance="direct",
        key_concepts_covered=["co-adaptation"],
        missing_concepts=["test time scaling"],
        feedback="Good start, but missed test-time scaling.",
    )
    score_partial = compute_open_ended_score(eval_partial)
    assert score_partial == 64.5

    # 4. Tangential penalty (relevance=tangential -> 0.6 multiplier)
    eval_tangential = OpenEndedGradeEvaluation(
        understanding="good",
        accuracy="high",
        relevance="tangential",
        key_concepts_covered=["ensemble idea"],
        missing_concepts=["dropout mechanism"],
        feedback="Mentions ensembles but doesn't explain dropout directly.",
    )
    # raw = 100 * (0.50 * 0.5 + 0.30 * 1.0 + 0.20 * 0.85) * 0.6 = 100 * (0.25 + 0.30 + 0.17) * 0.6 = 72.0 * 0.6 = 43.2
    score_tangential = compute_open_ended_score(eval_tangential)
    assert score_tangential == 43.2


def test_fernet_aes_encryption_and_tamper_detection():
    """Verify AES encryption provides confidentiality and tamper detection."""
    payload = {
        "model_answer": "Dropout randomly sets unit activations to zero with probability p.",
        "rubric_points": ["random deactivation", "thins network", "prevents co-adaptation"],
    }
    token = encrypt_grading_payload(payload)
    assert isinstance(token, str)
    # Confidentiality: plaintext model answer is not visible in raw token
    assert "Dropout" not in token
    assert "co-adaptation" not in token

    # Successful decryption
    decrypted = decrypt_grading_payload(token)
    assert decrypted["model_answer"] == payload["model_answer"]
    assert decrypted["rubric_points"] == payload["rubric_points"]

    # Tampered token must raise ValueError
    tampered = token[:-4] + "AAAA"
    with pytest.raises(ValueError, match="Invalid or tampered"):
        decrypt_grading_payload(tampered)


def test_grade_open_ended_response_retry_and_failure():
    """Verify grading handles malformed LLM outputs with retry and safe permanent failure."""
    llm = MagicMock()
    # First response invalid JSON, second valid
    valid_json = (
        '{"understanding": "good", "accuracy": "high", "relevance": "direct",'
        '"key_concepts_covered": ["random deactivation"], "missing_concepts": [],'
        '"feedback": "Good answer."}'
    )
    llm.invoke.side_effect = [
        AIMessage(content="Sorry, I cannot answer as JSON."),
        AIMessage(content=valid_json),
    ]

    token = encrypt_grading_payload({"model_answer": "...", "rubric_points": ["..."]})
    score, evaluation = grade_open_ended_response(
        llm,
        question="Explain dropout.",
        user_answer="It randomly turns off units.",
        grading_token=token,
    )

    assert llm.invoke.call_count == 2
    assert evaluation.understanding == "good"
    assert score > 0.0

    # Permanent failure raises QuizGenerationError
    llm.invoke.side_effect = [
        AIMessage(content="Bad 1"),
        AIMessage(content="Bad 2"),
    ]
    with pytest.raises(QuizGenerationError, match="Failed to evaluate"):
        grade_open_ended_response(
            llm,
            question="Explain dropout.",
            user_answer="...",
            grading_token=token,
        )


def test_grade_open_ended_endpoint_mastery_integration():
    """Verify /quiz/grade-open-ended endpoint updates EMA concept mastery atomically."""
    from sqlalchemy.pool import StaticPool
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    TestingSessionLocal = sessionmaker(bind=engine)
    db = TestingSessionLocal()

    space = crud.create_space(db, space_id="space-test", name="Space Test")
    project = crud.create_project(db, project_id="proj-test", space_id=space.id, name="ML Project")
    thread = crud.create_thread(db, thread_id="th-test", title="Quiz Thread", project_id=project.id)
    doc = crud.create_document(
        db,
        document_id="doc-test",
        thread_id=thread.id,
        filename="paper.pdf",
        vectorstore_path="path",
    )

    fake_eval_json = (
        '{"understanding": "excellent", "accuracy": "high", "relevance": "direct",'
        '"key_concepts_covered": ["concept 1", "concept 2"], "missing_concepts": [],'
        '"feedback": "Great work!"}'
    )
    mock_llm = MagicMock()
    mock_llm.invoke.return_value = AIMessage(content=fake_eval_json)

    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_quiz_llm] = lambda: mock_llm

    client = TestClient(app)
    token = encrypt_grading_payload({"model_answer": "Ideal answer", "rubric_points": ["concept 1", "concept 2"]})

    try:
        res = client.post(
            "/quiz/grade-open-ended",
            json={
                "project_id": project.id,
                "document_id": doc.id,
                "topic": "Dropout",
                "question": "What is dropout?",
                "user_answer": "It randomly deactivates neurons during training.",
                "grading_token": token,
            },
        )
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["score"] == 100.0
        assert data["evaluation"]["understanding"] == "excellent"

        # Check concept mastery was updated via EMA (0.4 * 100 + 0.6 * 50 = 70.0)
        masteries = crud.get_concept_mastery(db, project.id)
        assert len(masteries) == 1
        assert masteries[0].concept == "dropout"
        assert masteries[0].score == 70.0
        assert masteries[0].attempt_count == 1
    finally:
        app.dependency_overrides.clear()
        db.close()
