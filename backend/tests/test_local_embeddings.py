"""Unit and lifecycle tests for StudyMate's Local SentenceTransformer embedding pipeline."""

from __future__ import annotations

import math
from unittest.mock import MagicMock, patch
import numpy as np
import pytest
from langchain_core.documents import Document

from app.rag.embeddings import (
    DEFAULT_LOCAL_MODEL,
    DEFAULT_LOCAL_BATCH_SIZE,
    LocalSentenceTransformerEmbeddings,
    get_embeddings,
)
from app.rag.exceptions import VectorStoreLoadError
from app.rag.store import build_and_save_index, load_index, embedding_identifier


class FakeModel:
    """Fast deterministic fake SentenceTransformer model for hermetic tests."""

    def __init__(self, dimension: int = 384, model_name: str = "BAAI/bge-small-en-v1.5"):
        self.dimension = dimension
        self.model_name = model_name
        self.encode_calls = []

    def get_embedding_dimension(self) -> int:
        return self.dimension

    def encode(
        self,
        sentences,
        batch_size=32,
        normalize_embeddings=True,
        show_progress_bar=False,
        convert_to_numpy=True,
    ):
        self.encode_calls.append({
            "sentences": sentences,
            "batch_size": batch_size,
            "normalize_embeddings": normalize_embeddings,
        })
        if isinstance(sentences, str):
            vec = np.ones(self.dimension, dtype=np.float32)
            if normalize_embeddings:
                norm = np.linalg.norm(vec)
                vec = vec / (norm if norm > 0 else 1.0)
            return vec

        results = []
        for i, _ in enumerate(sentences):
            vec = np.full(self.dimension, float(i + 1), dtype=np.float32)
            if normalize_embeddings:
                norm = np.linalg.norm(vec)
                vec = vec / (norm if norm > 0 else 1.0)
            results.append(vec)
        return np.array(results)


def test_local_embeddings_default_configuration():
    """Verify default model name, batch size, and CPU device configuration."""
    fake_model = FakeModel()
    client = LocalSentenceTransformerEmbeddings(model=fake_model)

    assert client.model_name == DEFAULT_LOCAL_MODEL
    assert client.batch_size == DEFAULT_LOCAL_BATCH_SIZE
    assert client.device == "cpu"
    assert client.embedding_dimension == 384


def test_local_embeddings_configurable_batch_size():
    """Verify custom batch_size parameter is respected during document encoding."""
    fake_model = FakeModel()
    client = LocalSentenceTransformerEmbeddings(batch_size=16, model=fake_model)

    assert client.batch_size == 16
    texts = [f"Text chunk {i}" for i in range(40)]
    vectors = client.embed_documents(texts)

    assert len(vectors) == 40
    assert len(fake_model.encode_calls) == 1
    assert fake_model.encode_calls[0]["batch_size"] == 16
    assert client.last_stats.request_count == math.ceil(40 / 16)


def test_local_embeddings_strict_cpu_no_cuda():
    """Ensure execution is strictly CPU and does not rely on or require CUDA."""
    fake_model = FakeModel()
    client = LocalSentenceTransformerEmbeddings(model=fake_model)

    assert client.device == "cpu"
    vec = client.embed_query("cpu test query")
    assert len(vec) == 384


def test_normalization_consistency_for_docs_and_queries():
    """Vectors must have unit norm for cosine similarity / inner product compatibility."""
    fake_model = FakeModel()
    client = LocalSentenceTransformerEmbeddings(model=fake_model)

    doc_vectors = client.embed_documents(["document passage one", "document passage two"])
    query_vector = client.embed_query("search query")

    for v in doc_vectors:
        norm = np.linalg.norm(v)
        assert pytest.approx(norm, rel=1e-4) == 1.0

    query_norm = np.linalg.norm(query_vector)
    assert pytest.approx(query_norm, rel=1e-4) == 1.0


def test_faiss_index_build_load_and_dimension_validation(tmp_path):
    """Test full cycle: FAISS index build, persist, load, and dimension validation."""
    fake_model = FakeModel(dimension=384, model_name="BAAI/bge-small-en-v1.5")
    embeddings = LocalSentenceTransformerEmbeddings(model=fake_model)

    chunks = [
        Document(page_content="Artificial intelligence in healthcare", metadata={"source": "paper.pdf", "page": 1}),
        Document(page_content="Deep learning algorithms for diagnosis", metadata={"source": "paper.pdf", "page": 2}),
    ]
    save_dir = str(tmp_path / "faiss_test")

    timings = build_and_save_index(chunks, embeddings, save_dir)
    assert timings["embedding_dimension"] == 384
    assert timings["embedding_ms"] >= 0

    # Load with identical model
    loaded_index = load_index(save_dir, embeddings)
    assert loaded_index is not None
    assert loaded_index.index.d == 384

    # Loading with a mismatched model dimension must raise VectorStoreLoadError
    incompatible_model = FakeModel(dimension=768, model_name="different-model")
    incompatible_embeddings = LocalSentenceTransformerEmbeddings(model=incompatible_model)
    with pytest.raises(VectorStoreLoadError):
        load_index(save_dir, incompatible_embeddings)


def test_singleton_get_embeddings():
    """Verify get_embeddings returns a cached singleton instance."""
    with patch("app.rag.embeddings._load_local_sentence_transformer", return_value=(FakeModel(), 5.0)):
        get_embeddings.cache_clear()
        emb1 = get_embeddings()
        emb2 = get_embeddings()
        assert emb1 is emb2
        get_embeddings.cache_clear()


def test_avoid_duplicate_indexing_when_valid_index_exists(tmp_path):
    """If a valid index with current model already exists, _run_indexing_background skips re-indexing."""
    from app.services.document_service import _run_indexing_background

    fake_model = FakeModel(dimension=384, model_name="BAAI/bge-small-en-v1.5")
    embeddings = LocalSentenceTransformerEmbeddings(model=fake_model)

    save_dir = str(tmp_path / "doc_test")
    chunks = [Document(page_content="Initial content", metadata={"source": "doc.pdf", "page": 0})]
    build_and_save_index(chunks, embeddings, save_dir)

    encode_calls_before = len(fake_model.encode_calls)

    with patch("app.services.document_service._persist_index_status") as mock_status:
        _run_indexing_background(
            document_id="doc-123",
            filename="doc.pdf",
            content=b"%PDF-1.4 test bytes",
            save_path=save_dir,
            embeddings=embeddings,
        )

        # No new encode calls should have been made
        assert len(fake_model.encode_calls) == encode_calls_before
        mock_status.assert_called_with("doc-123", status="ready", page_count=1, chunk_count=1)
