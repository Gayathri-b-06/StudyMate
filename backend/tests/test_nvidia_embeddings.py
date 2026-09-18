"""Hermetic coverage for StudyMate's hosted NVIDIA embedding backend."""

from __future__ import annotations

from dataclasses import dataclass

import pytest
from langchain_core.documents import Document

from app.rag.embeddings import EmbeddingAPIError, NvidiaHostedEmbeddings
from app.rag.store import build_and_save_index, load_index
from app.rag.exceptions import VectorStoreLoadError


@dataclass
class FakeResponse:
    status_code: int
    payload: dict | None = None
    text: str = "error"

    def json(self):
        if self.payload is None:
            raise ValueError("not JSON")
        return self.payload


class FakeSession:
    def __init__(self, responses):
        self.responses = list(responses)
        self.calls = []

    def post(self, endpoint, **kwargs):
        self.calls.append((endpoint, kwargs))
        return self.responses.pop(0)


def embedding_response(count, dimension=2048):
    return FakeResponse(200, {"data": [
        {"index": index, "embedding": [float(index + 1)] * dimension}
        for index in range(count)
    ]})


def test_document_embeddings_are_batched_as_passages():
    session = FakeSession([embedding_response(2), embedding_response(2), embedding_response(1)])
    client = NvidiaHostedEmbeddings(api_key="test", batch_size=2, session=session)

    vectors = client.embed_documents(["one", "two", "three", "four", "five"])

    assert len(vectors) == 5
    assert len(session.calls) == 3  # Never one API request per chunk.
    assert [call[1]["json"]["input"] for call in session.calls] == [["one", "two"], ["three", "four"], ["five"]]
    assert all(call[1]["json"]["input_type"] == "passage" for call in session.calls)
    assert all(call[0] == "https://integrate.api.nvidia.com/v1/embeddings" for call in session.calls)


def test_query_embeddings_use_query_input_type():
    session = FakeSession([embedding_response(1)])
    client = NvidiaHostedEmbeddings(api_key="test", session=session)

    assert len(client.embed_query("what is RRF?")) == 2048
    assert session.calls[0][1]["json"]["input_type"] == "query"


def test_transient_failure_retries_with_bounded_backoff():
    session = FakeSession([FakeResponse(429), FakeResponse(503), embedding_response(2)])
    delays = []
    client = NvidiaHostedEmbeddings(api_key="test", batch_size=2, max_retries=2, session=session, sleep=delays.append)

    assert len(client.embed_documents(["one", "two"])) == 2
    assert len(session.calls) == 3
    assert delays == [1, 2]


def test_permanent_failure_is_not_retried():
    session = FakeSession([FakeResponse(401, text="invalid key")])
    client = NvidiaHostedEmbeddings(api_key="bad", session=session, max_retries=3, sleep=lambda _: None)

    with pytest.raises(EmbeddingAPIError, match="401"):
        client.embed_documents(["one"])
    assert len(session.calls) == 1


class TinyEmbeddings:
    def __init__(self, model_name, dimension):
        self.model_name = model_name
        self.dimension = dimension

    def embed_documents(self, texts):
        return [[float(index + 1)] * self.dimension for index, _ in enumerate(texts)]

    def embed_query(self, text):
        return [1.0] * self.dimension


def test_faiss_uses_one_embedding_pass_and_rejects_mixed_models(tmp_path):
    current = TinyEmbeddings("nvidia/llama-nemotron-embed-1b-v2", 2048)
    path = str(tmp_path / "index")
    timings = build_and_save_index([Document(page_content="alpha"), Document(page_content="beta")], current, path)

    assert timings["embedding_dimension"] == 2048
    assert load_index(path, current).index.d == 2048
    with pytest.raises(VectorStoreLoadError, match="do not match"):
        load_index(path, TinyEmbeddings("BAAI/bge-small-en-v1.5", 384))
