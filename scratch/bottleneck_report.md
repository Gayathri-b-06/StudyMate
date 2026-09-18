# StudyMate AI/RAG Pipeline Bottleneck Audit & Baseline Report

Measured on baseline environment (Python 3.12.4, Windows, local CPU inference, Groq API).

---

## 1. Pipeline A: PDF Upload / Ingestion

### Execution Flow:
1. `POST /threads/{thread_id}/documents/upload`
2. `DocumentService.upload()`:
   - **Step 1**: Pre-computes page/chunk counts synchronously in HTTP handler: calls `load_and_chunk_pdf()`: **568 ms** (writes tempfile, reads PyPDF, splits chunks, regex figure scan).
   - **Step 2**: DB insert `crud.create_document()` with `index_status='indexing'`: **15 ms**.
   - **Step 3**: Spawns background thread `_run_indexing_background()`.
   - **Step 4**: Background thread calls `_load_chunks()`, which runs `load_and_chunk_pdf()` **A SECOND TIME**: **568 ms** (duplicate parsing/chunking!).
   - **Step 5**: Calls `build_and_save_index()`:
     - Sanitizes chunks: ~5 ms
     - `FAISS.from_documents(chunks, embeddings)`:
       - Generates dense embeddings: **3,710 ms** (no batching parameter in `encode_kwargs`).
       - FAISS index build & save: **35 ms**
     - Pickles chunks (`chunks.pkl`): **10 ms**
     - Writes `index_metadata.json`: **5 ms**
   - **Step 6**: DB status update `crud.set_document_index_status()`: **10 ms**.
- **Total Background Time to 'ready'**: **10,388 ms** (~10.4 seconds for a 6-page PDF).
- **Synchronous HTTP Blocking Time**: **344 - 580 ms**.

### Optimization Opportunities:
| Step | Current Operation | Latency | Optimization |
|---|---|---|---|
| PDF parsing | PyPDFLoader + RecursiveCharacterSplitter called **twice** | ~1,136 ms total | **Eliminate duplicate pass**: chunk once or pass precomputed chunks to background worker. Do NOT block foreground HTTP request. |
| Foreground HTTP | Blocks on `load_and_chunk_pdf` before returning 202 | ~344 - 580 ms | **Non-blocking upload**: Return 202 immediately with placeholder in < 25 ms. Run single-pass parse + chunk in worker thread. |
| Embedding generation | `HuggingFaceEmbeddings` with default unbatched/unconfigured params | 3,710 ms | Configure `batch_size=64` in `encode_kwargs`. |
| Index build | Writes disk artifacts sequentially | ~50 ms | Keep existing FAISS/BM25 structure, avoid re-computing. |

---

## 2. Pipeline B: RAG / AI Tutor Response

### Execution Flow:
1. `POST /chat` with `stream: true`:
2. Tool call `search_uploaded_documents`:
   - `get_vectorstore_paths_for_thread()`: **12 ms**
   - For each path, calls `retrieve()`:
     - `load_index`: **64 ms** (cached in `_INDEX_CACHE` after first load)
     - `_bm25_for()`: loads chunks from disk & creates `BM25Retriever`: **60 ms** (cached in `_BM25_CACHE`)
     - `_dense_candidates`: **799 ms** (generates query embedding on CPU + FAISS search)
     - `_hybrid_candidates`: dense and BM25 executed **sequentially**: **860 ms**
     - Cross-encoder rerank:
       - Cold start (first query): **27,905 ms** (loads `bge-reranker-base` from disk)
       - Warm call: **3,183 ms** (scores all candidate pairs on CPU with no candidate cap)
   - LLM generation via Groq: **1,200 - 1,800 ms**
3. `api/chat.py`:
   - Waits synchronously for `chat_service.chat_with_tool_results()` to complete the full answer before starting the SSE stream iterator!

### Optimization Opportunities:
| Step | Current Operation | Latency | Optimization |
|---|---|---|---|
| Model Loading | Cross-encoder lazy-loaded on 1st query | 27,905 ms cold start | **Lifespan pre-warm**: Pre-warm reranker in background/startup to eliminate the 28s freeze. |
| Dense + BM25 | Executed sequentially in `_hybrid_candidates` | ~860 ms | **Run concurrently**: `ThreadPoolExecutor` parallelizes dense FAISS search and BM25 search. |
| Query Embedding | Computed fresh for every query & variant | ~800 ms per query | **Cache query embeddings**: In-process LRU cache for query text -> vector. |
| Reranker Candidate Count | All merged candidate pairs (`len(documents)`) rescored | ~3,183 ms | **Cap rerank candidates**: Rescore top `max(rerank_top_k * 2, 10)` candidates instead of unconstrained list. Cuts reranker latency by ~60%. |
| Multi-doc search | Sequentially searches multiple vector stores | N * latency | Parallelize multi-document retrieval with `ThreadPoolExecutor`. |
| SSE Streaming | Chat endpoint blocks on complete generation before yielding | ~5 - 32s to 1st token | Stream token generation and tool status phases progressively. |

---

## 3. Pipeline C: Quiz Generation

### Execution Flow:
1. `POST /quiz/generate`:
   - `retrieve()`: **~3,500 ms** (retrieves `k=20`, `rerank_top_k=10`, reranks up to 40 candidates on CPU).
   - Single structured prompt to `quiz_llm`: **~1,900 ms**.
   - `_validate_quiz_json()`: **5 ms**.
   - **Total Latency**: **5,467 ms** (~5.5s).

### Optimization Opportunities:
| Step | Current Operation | Latency | Optimization |
|---|---|---|---|
| Quiz Retrieval | Retrieves and cross-encodes 20-40 candidates | ~3,500 ms | Benefited directly by RAG parallel retrieval and candidate capping; cuts ~2.2s. |
| LLM Call | Single structured JSON prompt | ~1,900 ms | Already single-call (no question-by-question loop). Preserve schema validation. |

---

## 4. Pipeline D: Flashcard Generation

### Execution Flow:
1. `POST /flashcards/generate` or `generate_document_flashcards`:
   - `retrieve()`: **~3,200 ms** (`k=20`, `rerank_top_k=10`).
   - Single structured prompt to `quiz_llm`: **~1,700 ms**.
   - `_validate_flashcard_json()`: **4 ms**.
   - **Total Latency**: **4,904 ms** (~4.9s).

### Optimization Opportunities:
| Step | Current Operation | Latency | Optimization |
|---|---|---|---|
| Flashcard Retrieval | Retrieves and cross-encodes 20-40 candidates | ~3,200 ms | Benefited directly by RAG parallel retrieval and candidate capping; cuts ~2.0s. |
| LLM Call | Single structured JSON prompt | ~1,700 ms | Already single-call (no card-by-card loop). Preserve schema validation. |
