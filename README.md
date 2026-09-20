# StudyMate

StudyMate is a PDF-grounded AI study companion built with React, FastAPI and LangGraph. Organize learning into **Spaces → Projects**, chat with source citations, generate quizzes and flashcards, create study plans, and track mastery, growth and recommendations. The desktop interface uses sage backgrounds, cream cards and forest-green navigation.

The top-level pages are **Home, Spaces, Global Analytics and Admin**. Each project contains Overview, AI Tutor, Documents, Quiz, Flashcards, Analytics and Study Plan.

See [architecture and decisions](PROJECT_ARCHITECTURE.md), including the authentication boundary and remaining deployment requirements.

## Local setup

Use Python 3.12 and Node.js **20.19+ or 22.12+** (the installed Vite 8 engine requirement). Keep enough disk space and memory for PyTorch, FAISS and two CPU transformer models. The initial model download needs network access; cached embedding/reranking inference runs locally. Answer generation still needs Groq network access.

From the repository root, in PowerShell:

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

On macOS/Linux use `source .venv/bin/activate` and `cp .env.example .env` instead. Edit `backend/.env` before starting. Never put backend keys in frontend environment variables.

Required for the AI services:

- `GROQ_API_KEY`: chat and document-answer generation.
- `GROQ_MODEL`: chat model identifier; the current local setup uses `openai/gpt-oss-20b`. Choose a model available to your Groq account.
- `GROQ_QUIZ_API_KEY`: required by the dedicated study-tool client. You can supply the same Groq key, but this variable must be set explicitly.
- `GROQ_QUIZ_MODEL`: optional; falls back to `GROQ_MODEL`.

Local retrieval defaults (no NVIDIA key needed):

- `EMBEDDING_PROVIDER=local`.
- `EMBEDDING_MODEL=BAAI/bge-small-en-v1.5`.
- `EMBEDDING_BATCH_SIZE=32`.
- `RERANKER_MODEL=BAAI/bge-reranker-base`.

Additional configuration:

- `STUDYMATE_SECRET_KEY`: set a private, random value for quiz-grading signatures. The code has an insecure development fallback; do not use that fallback for a deployment. Generate a value with `python -c "import secrets; print(secrets.token_hex(32))"` and store it only in your local environment/secret manager.
- `DATABASE_URL`: optional. The default resolves to `backend/chatbot.db` regardless of the shell directory. Leave it unset for ordinary local use. LangGraph independently stores conversation checkpoints in `backend/langgraph_checkpoints.db`.
- `LANGCHAIN_TRACING_V2`, `LANGCHAIN_API_KEY`, `LANGCHAIN_PROJECT`: optional LangSmith integration; these are the names read by the Admin telemetry adapter. Leave tracing disabled unless wanted. Tracing can send conversation/document content to that service.
- `GROQ_GENERATOR_API_KEY`, `GROQ_JUDGE_API_KEY`: optional evaluation-only keys; each falls back to `GROQ_API_KEY`.

The optional legacy hosted embedding implementation remains in the source for compatibility/testing. It is **not** the default or a setup requirement. Changing embedding models invalidates index compatibility: startup rebuilds from recoverable chunks or asks for a PDF re-upload when recovery is impossible.

Start the backend from `backend/`:

```powershell
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Open [API documentation](http://127.0.0.1:8000/docs). Account routes become available before model startup finishes. AI endpoints return 503 while models initialize or if startup fails; inspect the backend terminal for configuration/model errors.

In a second terminal, from the repository root:

```powershell
cd frontend
npm ci
npm run dev
```

Open [StudyMate](http://localhost:5173). Vite proxies `/api/*` to the backend and removes `/api`. No frontend `.env` is required locally. `VITE_API_BASE_URL` is the optional build-time API prefix; keep `/api` when using the same-origin proxy arrangement.

## First run and evaluator data

A fresh database is supported: startup creates tables and performs applicable legacy migrations. Sign up to create a student account, then log in. Fresh installs do not provision a demo account or administrator. Existing default/demo accounts and their old sessions cannot authenticate. Provision administrators only through trusted backend administration of the user record; signup never grants that role.

A fresh clone does **not** require the developer's SQLite database. Create a Space, create a Project, and upload a PDF through Documents. Wait until indexing is ready, then use the study tools. Analytics populate from real interactions; there is no seed of realistic course content or assessment history. Legacy migrations can create Default Space/Default Project to preserve older records; this is not a populated evaluator dataset.

Existing local databases and generated indexes were preserved during cleanup. Do not distribute them as a demo seed: they may contain learner content or session records. If a populated evaluator demo is desired, prepare a separate sanitized dataset explicitly.

## Checks and evaluation

From `frontend/`:

```powershell
npm test
npm run build
```

The build creates `frontend/dist/`, which is ignored. From `backend/`, run pytest against a disposable database, not the database containing your study history. Some integration tests initialize or modify the configured database; external-model/manual tests also require additional resources. A focused example:

```powershell
python -m pytest tests/test_auth_boundary.py tests/test_auth_startup.py tests/test_thread_history_access.py -q -p no:cacheprovider
```

There is no fixed claimed passing-test count: results depend on the selected suite and environment.

The offline RAGAS harness uses a local PDF and its corresponding question/reference dataset:

```powershell
python -m eval.run_eval --hybrid --pdf C:/path/to/course.pdf --dataset C:/path/to/matching_eval_dataset.yaml
```

Use a PDF that matches the dataset; the default `sample.pdf` is not guaranteed to exist in a fresh checkout. The harness writes evaluation CSVs in `backend/eval/`. It evaluates faithfulness, answer relevancy, context precision and context recall, with a separate adversarial path. It makes hosted LLM calls and is not a free, offline unit test. Admin reads saved CSV output rather than running evaluation on every page load.

## Maintenance scripts

Keep schema migrations in `backend/scripts/` as upgrade tooling, not throwaway debugging:

- `migrate_spaces_projects.py`: legacy hierarchy migration and validation.
- `migrate_add_concept_mastery.py`: mastery tables/upgrade support.
- `migrate_add_index_status.py`: legacy document-index status column.
- `migrate_user_memories_reason.py`: historical reason-column backfill and deduplication; makes a backup.
- `cleanup_legacy_weak_memory.py`: deletes old weak-topic facts unsupported by quiz evidence. Retained for old installations, **not** a general cleanup command for current data.

Back up the database before any manual migration. The named calibration/benchmark scripts are absent from this working tree; this pass did not delete them or recreate undocumented tooling.

## Deployment status and requirements

The Vercel frontend is configured to call `https://studymate-rfmo.onrender.com`. Protected endpoints require a valid server-issued session; missing, malformed, revoked or unrecognized Bearer credentials return 401. Only login/signup and API documentation are public; `/auth/me` and logout require authentication. Admin authorization reads the backend user role, never client role headers. The default/demo login fallback is removed. Password hashing still uses salted SHA-256 rather than a password-specific adaptive KDF; harden password storage and supply a private grading-signature key before exposing the API.

### Render production setup

Use `render.yaml` as the Render Blueprint, or mirror its settings in the existing Render service: set the service root directory to `backend`, run `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, and mount a persistent disk at `/var/data`. Set `STUDYMATE_DATA_DIR=/var/data`; it stores `chatbot.db` (accounts and sessions), `langgraph_checkpoints.db`, and `vectorstores/` (uploaded PDF indexes). Without that disk, every Render redeploy/restart can erase users and PDF data, leading to failed login and missing uploads.

Set `GROQ_API_KEY`, `GROQ_QUIZ_API_KEY`, and a private `STUDYMATE_SECRET_KEY` in Render's Environment settings. In Vercel, set `VITE_API_BASE_URL=https://studymate-rfmo.onrender.com` for Production and redeploy after changing it. The backend already allows `https://study-mate-one-liard.vercel.app` through CORS.

After those blockers are addressed, the current architecture calls for:

1. Build the frontend with `npm ci` and `npm run build`; serve `dist/` with SPA route fallback.
2. Run FastAPI without `--reload`, initially as one process, and reverse-proxy `/api/*` to it with the prefix removed. Preserve SSE streaming (disable buffering and allow sufficiently long requests).
3. Terminate HTTPS at the proxy. The code has no general cross-origin CORS configuration, so use a same-origin frontend/API unless you explicitly implement and review CORS.
4. Persist SQLite, LangGraph checkpoints and `backend/vectorstores/`; these cannot live only on an ephemeral filesystem. Provision a model cache and CPU memory. Back up databases consistently, including SQLite WAL state, rather than copying an active database file alone.
5. Configure secrets on the server, not in Git or a frontend bundle. `backend/.env` is loaded with `override=True`, so do not bake a development `.env` into a deployment image.

No Docker, cloud platform, production URL, or automatic deployment is implied by these instructions. PostgreSQL is not a verified drop-in deployment: startup includes SQLite-specific migrations and LangGraph still uses a separate SQLite checkpointer.
