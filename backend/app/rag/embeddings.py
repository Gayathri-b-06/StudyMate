"""Embedding providers for StudyMate RAG pipeline.

Supports:
1. Local SentenceTransformers (preferred & default for CPU-only 8 GB RAM machines):
   - Model: configurable via EMBEDDING_MODEL (default: BAAI/bge-small-en-v1.5)
   - Strict CPU execution (device="cpu")
   - Process-level singleton loading (loaded once at startup)
   - Batched chunk encoding with configurable EMBEDDING_BATCH_SIZE (default: 32)
   - L2 normalized embeddings (normalize_embeddings=True) under torch.inference_mode()
   - Shared across document indexing and query retrieval
2. NVIDIA Hosted Embeddings (optional remote fallback if EMBEDDING_PROVIDER="nvidia").
"""

from __future__ import annotations

from dataclasses import dataclass, field
from functools import lru_cache
import logging
import math
import os
import threading
import time
from typing import Any, Iterable

from langchain_core.embeddings import Embeddings
import requests

logger = logging.getLogger(__name__)

# Defaults for local SentenceTransformer
DEFAULT_LOCAL_MODEL = "BAAI/bge-small-en-v1.5"
DEFAULT_LOCAL_BATCH_SIZE = 32

# Defaults for remote NVIDIA fallback
NVIDIA_EMBEDDING_MODEL = "nvidia/llama-nemotron-embed-1b-v2"
NVIDIA_EMBEDDING_ENDPOINT = "https://integrate.api.nvidia.com/v1/embeddings"
NVIDIA_EMBEDDING_DIMENSION = 2048
_TRANSIENT_STATUS_CODES = {408, 429, 500, 502, 503, 504}

# Global singleton storage for local SentenceTransformer model
_LOCAL_MODEL_LOCK = threading.Lock()
_LOCAL_MODEL_INSTANCE: Any = None
_LOCAL_MODEL_LOAD_TIME_MS: float = 0.0
_LOCAL_MODEL_NAME: str | None = None


class EmbeddingAPIError(RuntimeError):
    """User-safe error returned by the embedding provider."""


@dataclass
class EmbeddingStats:
    """Per-call timing for index-job performance logs."""

    request_count: int = 0
    total_latency_ms: float = 0.0
    batch_latencies_ms: list[float] = field(default_factory=list)


def _load_local_sentence_transformer(model_name: str) -> tuple[Any, float]:
    """Load SentenceTransformer strictly on CPU once with timing."""
    import torch
    from sentence_transformers import SentenceTransformer

    # Optimize PyTorch CPU thread count to match physical/logical cores
    try:
        torch.set_num_threads(os.cpu_count() or 4)
    except Exception:
        pass

    started = time.perf_counter()
    logger.info("Initializing local SentenceTransformer model %s on CPU...", model_name)
    try:
        # First attempt local cache only to prevent slow HF Hub remote network calls
        model = SentenceTransformer(model_name, device="cpu", local_files_only=True)
    except Exception as local_err:
        logger.info("Local cache lookup for %s had notice (%s); trying standard load", model_name, local_err)
        model = SentenceTransformer(model_name, device="cpu")

    elapsed_ms = (time.perf_counter() - started) * 1000
    logger.info("Loaded local SentenceTransformer model %s on CPU in %.1f ms", model_name, elapsed_ms)
    return model, elapsed_ms


def get_local_sentence_transformer_model(model_name: str | None = None) -> Any:
    """Thread-safe singleton accessor for the local SentenceTransformer model."""
    global _LOCAL_MODEL_INSTANCE, _LOCAL_MODEL_LOAD_TIME_MS, _LOCAL_MODEL_NAME
    target_model = model_name or os.getenv("EMBEDDING_MODEL", DEFAULT_LOCAL_MODEL)

    if _LOCAL_MODEL_INSTANCE is not None and _LOCAL_MODEL_NAME == target_model:
        return _LOCAL_MODEL_INSTANCE

    with _LOCAL_MODEL_LOCK:
        if _LOCAL_MODEL_INSTANCE is not None and _LOCAL_MODEL_NAME == target_model:
            return _LOCAL_MODEL_INSTANCE
        model, load_ms = _load_local_sentence_transformer(target_model)
        _LOCAL_MODEL_INSTANCE = model
        _LOCAL_MODEL_LOAD_TIME_MS = load_ms
        _LOCAL_MODEL_NAME = target_model
        return _LOCAL_MODEL_INSTANCE


def get_local_model_load_time_ms() -> float:
    """Return the time taken to load the local model into memory at startup."""
    return _LOCAL_MODEL_LOAD_TIME_MS


class LocalSentenceTransformerEmbeddings(Embeddings):
    """Fast, local CPU embedding generator using Sentence Transformers.

    Complies with the LangChain Embeddings protocol (embed_documents, embed_query)
    and uses batched inference, L2 normalization, and torch.inference_mode().
    """

    def __init__(
        self,
        *,
        model_name: str | None = None,
        batch_size: int | None = None,
        model: Any = None,
    ) -> None:
        if model_name is not None:
            self.model_name = model_name
        elif model is not None and hasattr(model, "model_name"):
            self.model_name = str(model.model_name)
        else:
            self.model_name = os.getenv("EMBEDDING_MODEL", DEFAULT_LOCAL_MODEL)
        self.device = "cpu"
        self.batch_size = max(
            1,
            batch_size if batch_size is not None
            else int(os.getenv("EMBEDDING_BATCH_SIZE", str(DEFAULT_LOCAL_BATCH_SIZE)))
        )
        self._stats_lock = threading.Lock()
        self._last_stats = EmbeddingStats()

        if model is not None:
            self._model = model
        else:
            self._model = get_local_sentence_transformer_model(self.model_name)

        # Obtain dimension safely
        if hasattr(self._model, "get_embedding_dimension"):
            self.embedding_dimension = int(self._model.get_embedding_dimension())
        elif hasattr(self._model, "get_sentence_embedding_dimension"):
            self.embedding_dimension = int(self._model.get_sentence_embedding_dimension())
        else:
            self.embedding_dimension = 384

    @property
    def last_stats(self) -> EmbeddingStats:
        with self._stats_lock:
            return EmbeddingStats(
                self._last_stats.request_count,
                self._last_stats.total_latency_ms,
                list(self._last_stats.batch_latencies_ms),
            )

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """Encode document chunks in batches on CPU under torch.inference_mode()."""
        cleaned = [str(text).replace("\x00", "") for text in texts]
        if not cleaned:
            return []

        import torch

        started = time.perf_counter()
        stats = EmbeddingStats()

        # Batch encode using SentenceTransformer's internal batching under inference_mode
        with torch.inference_mode():
            numpy_embeddings = self._model.encode(
                cleaned,
                batch_size=self.batch_size,
                normalize_embeddings=True,
                show_progress_bar=False,
                convert_to_numpy=True,
            )

        total_ms = (time.perf_counter() - started) * 1000
        batch_count = max(1, math.ceil(len(cleaned) / self.batch_size))
        avg_batch_ms = total_ms / batch_count

        stats.request_count = batch_count
        stats.total_latency_ms = total_ms
        stats.batch_latencies_ms = [avg_batch_ms] * batch_count

        with self._stats_lock:
            self._last_stats = stats

        logger.info(
            "Local SentenceTransformer: encoded %d texts in %d batches (batch_size=%d) in %.1f ms (%.2f ms/chunk)",
            len(cleaned), batch_count, self.batch_size, total_ms, total_ms / len(cleaned),
        )
        return numpy_embeddings.tolist()

    def embed_query(self, text: str) -> list[float]:
        """Encode a user query on CPU using the same model and normalization."""
        cleaned = str(text).replace("\x00", "")
        if not cleaned:
            return [0.0] * self.embedding_dimension

        import torch

        started = time.perf_counter()
        with torch.inference_mode():
            result = self._model.encode(
                cleaned,
                normalize_embeddings=True,
                show_progress_bar=False,
                convert_to_numpy=True,
            )

        elapsed_ms = (time.perf_counter() - started) * 1000
        with self._stats_lock:
            self._last_stats = EmbeddingStats(request_count=1, total_latency_ms=elapsed_ms, batch_latencies_ms=[elapsed_ms])

        if hasattr(result, "ndim") and result.ndim > 1:
            return result[0].tolist()
        return result.tolist()

    def __call__(self, text: str) -> list[float]:
        return self.embed_query(text)


class NvidiaHostedEmbeddings(Embeddings):
    """Reusable, batched client for NVIDIA's hosted embedding API.

    Kept as an optional fallback if EMBEDDING_PROVIDER="nvidia".
    """

    def __init__(
        self,
        *,
        api_key: str | None = None,
        model: str | None = None,
        endpoint: str = NVIDIA_EMBEDDING_ENDPOINT,
        batch_size: int | None = None,
        timeout_seconds: float | None = None,
        max_retries: int | None = None,
        session: requests.Session | None = None,
        sleep: Any = time.sleep,
    ) -> None:
        self.api_key = api_key if api_key is not None else os.getenv("NVIDIA_API_KEY")
        self.model = model or os.getenv("NVIDIA_EMBEDDING_MODEL", NVIDIA_EMBEDDING_MODEL)
        self.model_name = self.model
        self.embedding_dimension = int(os.getenv("NVIDIA_EMBEDDING_DIMENSION", str(NVIDIA_EMBEDDING_DIMENSION)))
        self.endpoint = endpoint
        self.batch_size = max(1, batch_size if batch_size is not None else int(os.getenv("NVIDIA_EMBED_BATCH_SIZE", "32")))
        self.timeout_seconds = timeout_seconds if timeout_seconds is not None else float(os.getenv("NVIDIA_EMBED_TIMEOUT_SECONDS", "60"))
        self.max_retries = max(0, max_retries if max_retries is not None else int(os.getenv("NVIDIA_EMBED_MAX_RETRIES", "3")))
        self._session = session or requests.Session()
        self._sleep = sleep
        self._stats_lock = threading.Lock()
        self._last_stats = EmbeddingStats()

    @property
    def last_stats(self) -> EmbeddingStats:
        with self._stats_lock:
            return EmbeddingStats(
                self._last_stats.request_count,
                self._last_stats.total_latency_ms,
                list(self._last_stats.batch_latencies_ms),
            )

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return self._embed_many(texts, input_type="passage")

    def embed_query(self, text: str) -> list[float]:
        return self._embed_many([text], input_type="query")[0]

    def __call__(self, text: str) -> list[float]:
        return self.embed_query(text)

    def _embed_many(self, texts: Iterable[str], *, input_type: str) -> list[list[float]]:
        cleaned = [str(text).replace("\x00", "") for text in texts]
        if not cleaned:
            return []
        if not self.api_key:
            raise EmbeddingAPIError("NVIDIA_API_KEY is not configured; document indexing cannot start.")

        stats = EmbeddingStats()
        vectors: list[list[float]] = []
        for start in range(0, len(cleaned), self.batch_size):
            vectors.extend(self._embed_batch_with_fallback(cleaned[start:start + self.batch_size], input_type, stats))
        with self._stats_lock:
            self._last_stats = stats
        logger.info(
            "NVIDIA embeddings: input_type=%s vectors=%d requests=%d batch_size=%d avg_batch_latency_ms=%.1f",
            input_type, len(vectors), stats.request_count, self.batch_size,
            stats.total_latency_ms / max(stats.request_count, 1),
        )
        return vectors

    def _embed_batch_with_fallback(self, batch: list[str], input_type: str, stats: EmbeddingStats) -> list[list[float]]:
        try:
            return self._request_batch(batch, input_type, stats)
        except EmbeddingAPIError as error:
            if len(batch) > 1 and "batch too large" in str(error).lower():
                midpoint = len(batch) // 2
                logger.warning("NVIDIA rejected batch of %d; retrying as %d + %d", len(batch), midpoint, len(batch) - midpoint)
                return self._embed_batch_with_fallback(batch[:midpoint], input_type, stats) + self._embed_batch_with_fallback(batch[midpoint:], input_type, stats)
            raise

    def _request_batch(self, batch: list[str], input_type: str, stats: EmbeddingStats) -> list[list[float]]:
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        payload = {"model": self.model, "input": batch, "input_type": input_type}
        last_error: Exception | None = None
        for attempt in range(self.max_retries + 1):
            started = time.perf_counter()
            try:
                response = self._session.post(self.endpoint, headers=headers, json=payload, timeout=self.timeout_seconds)
                elapsed = (time.perf_counter() - started) * 1000
                stats.request_count += 1
                stats.total_latency_ms += elapsed
                stats.batch_latencies_ms.append(elapsed)
                if response.status_code in _TRANSIENT_STATUS_CODES:
                    last_error = EmbeddingAPIError(f"NVIDIA embedding service returned {response.status_code}: {response.text[:300]}")
                elif response.status_code >= 400:
                    detail = response.text[:500]
                    if response.status_code in {413, 422}:
                        raise EmbeddingAPIError(f"NVIDIA embedding batch too large or invalid: {detail}")
                    raise EmbeddingAPIError(f"NVIDIA embedding request failed ({response.status_code}): {detail}")
                else:
                    try:
                        data = response.json()["data"]
                        ordered = sorted(data, key=lambda item: item.get("index", 0))
                        vectors = [item["embedding"] for item in ordered]
                    except (KeyError, TypeError, ValueError) as error:
                        raise EmbeddingAPIError("NVIDIA embedding response was malformed.") from error
                    if len(vectors) != len(batch) or not all(isinstance(vector, list) and vector for vector in vectors):
                        raise EmbeddingAPIError("NVIDIA embedding response did not contain one vector per input.")
                    dimension = len(vectors[0])
                    if any(len(vector) != dimension for vector in vectors):
                        raise EmbeddingAPIError("NVIDIA embedding response contained inconsistent vector dimensions.")
                    if dimension != self.embedding_dimension:
                        raise EmbeddingAPIError(
                            f"NVIDIA embedding dimension was {dimension}, expected {self.embedding_dimension}. "
                            "Refusing to mix vector dimensions."
                        )
                    return vectors
            except requests.RequestException as error:
                elapsed = (time.perf_counter() - started) * 1000
                stats.request_count += 1
                stats.total_latency_ms += elapsed
                stats.batch_latencies_ms.append(elapsed)
                last_error = EmbeddingAPIError(f"NVIDIA embedding network error: {error}")
            if attempt < self.max_retries:
                delay = min(2 ** attempt, 8)
                logger.warning("Retrying NVIDIA embedding batch after transient failure (%d/%d)", attempt + 1, self.max_retries)
                self._sleep(delay)
        raise last_error or EmbeddingAPIError("NVIDIA embedding request failed.")


@lru_cache(maxsize=1)
def get_embeddings() -> Any:
    """Return process-scoped embeddings client. Defaults to LocalSentenceTransformerEmbeddings."""
    provider = os.getenv("EMBEDDING_PROVIDER", "local").strip().lower()
    if provider == "nvidia":
        return NvidiaHostedEmbeddings()
    return LocalSentenceTransformerEmbeddings()
