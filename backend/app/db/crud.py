"""
db/crud.py
==========
CRUD (Create / Read / Update / Delete) operations for StudyMate.

Design principles
-----------------
1. **Pure functions**: every function takes an explicit `db: Session` argument.
   No module-level session singletons. This makes unit-testing trivial —
   pass in an in-memory session, no patching required.

2. **No business logic**: these functions only translate between Python objects
   and database rows. Validation, UUID generation, and path construction
   happen in the layer above (API routes or agent tools).

3. **Typed signatures**: every parameter and return value is annotated so that
   mypy / pyright can catch contract violations at the call site.

4. **Explicit commits**: callers are responsible for transaction boundaries in
   complex flows; simple helpers commit immediately for convenience.

5. **Isolation by default**: every function that touches project-scoped data
   requires an explicit `project_id` parameter. There is no unscoped list
   function exposed to the API layer — see `list_all_threads_unscoped` below.
"""

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import DEFAULT_USER_ID
from app.db.models import (
    ConceptMastery,
    ConceptMasteryHistory,
    Document,
    FlashcardReview,
    MemoryFactType,
    Project,
    QuizAttempt,
    Space,
    StudyLog,
    Thread,
    TopicsCache,
    User,
    UserMemory,
    UserSession,
)


def upsert_flashcard_review(db: Session, *, user_id: str, project_id: str, document_id: str | None, front: str, back: str | None, topic: str | None, learning_status: str) -> FlashcardReview:
    """Persist a student's latest status for a project flashcard."""
    row = db.query(FlashcardReview).filter_by(user_id=user_id, project_id=project_id, document_id=document_id, front=front).first()
    if row is None:
        row = FlashcardReview(user_id=user_id, project_id=project_id, document_id=document_id, front=front, back=back, topic=topic, learning_status=learning_status)
        db.add(row)
    else:
        row.back, row.topic, row.learning_status = back, topic, learning_status
    db.commit()
    db.refresh(row)
    return row


def list_flashcard_reviews(db: Session, *, user_id: str, project_id: str, learning_status: str) -> list[FlashcardReview]:
    return db.query(FlashcardReview).filter_by(user_id=user_id, project_id=project_id, learning_status=learning_status).order_by(FlashcardReview.updated_at.desc()).all()

# ---------------------------------------------------------------------------
# Spaces
# ---------------------------------------------------------------------------

def get_user_by_token(db: Session, token: str) -> Optional[User]:
    """Return the user for an active session token."""
    session = db.get(UserSession, token)
    return session.user if session is not None else None


def create_space(
    db: Session,
    *,
    space_id: str,
    name: str,
    user_id: str = DEFAULT_USER_ID,
    description: str | None = None,
) -> Space:
    """Insert a new Space row and return the persisted object."""
    if db.get(User, user_id) is None and user_id == DEFAULT_USER_ID:
        from app.services.auth_service import seed_default_user
        seed_default_user(db)
    space = Space(
        id=space_id,
        user_id=user_id,
        name=name,
        description=description,
        archived=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(space)
    db.commit()
    db.refresh(space)
    return space


def get_space(db: Session, space_id: str) -> Optional[Space]:
    """Fetch a single Space by its primary key. Returns None if not found."""
    return db.get(Space, space_id)


def list_spaces(
    db: Session,
    *,
    user_id: Optional[str] = None,
    include_archived: bool = False,
) -> list[Space]:
    """Return Spaces ordered by name. Filters by user_id if provided."""
    query = db.query(Space)
    if user_id is not None:
        query = query.filter(Space.user_id == user_id)
    if not include_archived:
        query = query.filter(Space.archived.is_(False))
    return query.order_by(Space.name).all()


def update_space(
    db: Session,
    *,
    space_id: str,
    name: str | None = None,
    description: str | None = None,
    archived: bool | None = None,
) -> Optional[Space]:
    """Update Space fields. Returns None if the space does not exist."""
    space = db.get(Space, space_id)
    if space is None:
        return None
    if name is not None:
        space.name = name
    if description is not None:
        space.description = description
    if archived is not None:
        space.archived = archived
    space.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(space)
    return space


def delete_space(db: Session, space_id: str) -> bool:
    """Delete a Space. DB cascade removes its Projects → Threads → Documents.
    Returns True if deleted, False if not found."""
    space = db.get(Space, space_id)
    if space is None:
        return False
    db.delete(space)
    db.commit()
    return True


def verify_space_owner(db: Session, space_id: str, user_id: str) -> Optional[Space]:
    """Verify Space exists and belongs to user_id."""
    space = db.get(Space, space_id)
    if space is None or space.user_id != user_id:
        return None
    return space


# ---------------------------------------------------------------------------
# Projects
# ---------------------------------------------------------------------------


def create_project(
    db: Session,
    *,
    project_id: str,
    space_id: str,
    user_id: str = DEFAULT_USER_ID,
    name: str,
    description: str | None = None,
) -> Project:
    """Insert a new Project row. Does NOT auto-create a Thread (service layer does that)."""
    if db.get(User, user_id) is None and user_id == DEFAULT_USER_ID:
        from app.services.auth_service import seed_default_user
        seed_default_user(db)
    project = Project(
        id=project_id,
        space_id=space_id,
        user_id=user_id,
        name=name,
        description=description,
        archived=False,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


def get_project(db: Session, project_id: str) -> Optional[Project]:
    """Fetch a single Project by its primary key. Returns None if not found."""
    return db.get(Project, project_id)


def list_projects(
    db: Session,
    space_id: str,
    *,
    user_id: Optional[str] = None,
    include_archived: bool = False,
) -> list[Project]:
    """Return Projects in a Space ordered by creation date (newest first)."""
    query = db.query(Project).filter(Project.space_id == space_id)
    if user_id is not None:
        query = query.filter(Project.user_id == user_id)
    if not include_archived:
        query = query.filter(Project.archived.is_(False))
    return query.order_by(Project.created_at.desc()).all()


def verify_project_owner(db: Session, project_id: str, user_id: str) -> Optional[Project]:
    """Verify Project exists and belongs to user_id."""
    project = db.get(Project, project_id)
    if project is None or project.user_id != user_id:
        return None
    return project


def verify_thread_owner(db: Session, thread_id: str, user_id: str) -> Optional[Thread]:
    """Verify Thread exists and its parent Project belongs to user_id."""
    thread = db.get(Thread, thread_id)
    if thread is None or thread.project is None:
        return None
    if thread.project.user_id != user_id:
        return None
    return thread


def verify_document_owner(db: Session, document_id: str, user_id: str) -> Optional[Document]:
    """Verify Document exists and its lineage belongs to user_id."""
    doc = db.get(Document, document_id)
    if doc is None or doc.thread is None or doc.thread.project is None:
        return None
    if doc.thread.project.user_id != user_id:
        return None
    return doc


def update_project(
    db: Session,
    *,
    project_id: str,
    name: str | None = None,
    description: str | None = None,
    archived: bool | None = None,
) -> Optional[Project]:
    """Update Project fields. Returns None if the project does not exist."""
    project = db.get(Project, project_id)
    if project is None:
        return None
    if name is not None:
        project.name = name
    if description is not None:
        project.description = description
    if archived is not None:
        project.archived = archived
    project.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(project)
    return project


def delete_project(db: Session, project_id: str) -> bool:
    """Delete a Project. DB cascade removes its Threads → Documents → StudyLog.
    Returns True if deleted, False if not found.
    NOTE: FAISS disk cleanup must be handled by the service layer before calling this."""
    project = db.get(Project, project_id)
    if project is None:
        return False
    db.delete(project)
    db.commit()
    return True


# ---------------------------------------------------------------------------
# Threads
# ---------------------------------------------------------------------------


def create_thread(db: Session, *, thread_id: str, title: str, project_id: str) -> Thread:
    """
    Insert a new Thread row and return the persisted object.

    Parameters
    ----------
    db         : Active SQLAlchemy session.
    thread_id  : Pre-generated UUID string (caller's responsibility).
    title      : Human-readable label for the thread.
    project_id : ID of the parent Project (must already exist).

    Returns
    -------
    The newly created Thread ORM object (already committed).
    """
    thread = Thread(
        id=thread_id,
        title=title,
        project_id=project_id,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


def get_thread(db: Session, thread_id: str) -> Optional[Thread]:
    """
    Fetch a single Thread by its primary key.

    Returns None if no thread with that ID exists, so callers can decide
    whether to raise a 404 or handle the absence differently.
    """
    return db.get(Thread, thread_id)


def update_thread_title(db: Session, *, thread_id: str, title: str) -> Optional[Thread]:
    """Update a thread title and return the persisted thread, if it exists."""
    thread = db.get(Thread, thread_id)
    if thread is None:
        return None
    thread.title = title
    db.commit()
    db.refresh(thread)
    return thread


def list_threads(db: Session, project_id: str, *, limit: int = 100, offset: int = 0) -> list[Thread]:
    """
    Return threads belonging to a specific Project, ordered by most recent update.

    Parameters
    ----------
    project_id : Required — filter to this project only (isolation enforced).
    limit      : Maximum number of rows to return (default 100).
    offset     : Number of rows to skip — useful for pagination.
    """
    return (
        db.query(Thread)
        .filter(Thread.project_id == project_id)
        .order_by(Thread.updated_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def list_all_threads_unscoped(db: Session, *, limit: int = 100, offset: int = 0) -> list[Thread]:
    """
    Internal-only. Returns threads WITHOUT project scoping.

    NOT CONNECTED TO ANY API ROUTE.
    Reserved for a future admin dashboard endpoint once auth (owner_id
    verification) exists. Do not call from route handlers — doing so would
    violate the isolation guarantee this entire feature exists to provide.
    """
    return (
        db.query(Thread)
        .order_by(Thread.updated_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


def touch_thread(db: Session, thread_id: str) -> Optional[Thread]:
    """Bump updated_at of an existing thread to the current UTC time.

    Called after each successful chat message so that active threads
    sort to the top of list_threads (ordered by updated_at DESC).

    Returns the refreshed Thread, or None if the thread was not found.
    """
    thread = db.get(Thread, thread_id)
    if thread is None:
        return None
    thread.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(thread)
    return thread


def delete_thread(db: Session, thread_id: str) -> bool:
    """
    Delete a thread by ID. Returns True if a row was deleted, False if not found.

    Because we defined `ondelete="CASCADE"` on the FKs in models.py, the
    database automatically removes all associated documents and study_log rows.
    """
    thread = db.get(Thread, thread_id)
    if thread is None:
        return False
    db.delete(thread)
    db.commit()
    return True


# ---------------------------------------------------------------------------
# Documents
# ---------------------------------------------------------------------------


def create_document(
    db: Session,
    *,
    document_id: str,
    thread_id: str,
    filename: str,
    vectorstore_path: str,
    page_count: int = 0,
    chunk_count: int = 0,
) -> Document:
    """
    Insert a new Document row linked to an existing thread.

    Parameters
    ----------
    db               : Active SQLAlchemy session.
    document_id      : Pre-generated UUID string.
    thread_id        : ID of the parent thread (must already exist).
    filename         : Original filename as uploaded.
    vectorstore_path : Filesystem path to the FAISS index directory.
    page_count       : Number of pages in the source PDF.
    chunk_count      : Number of text chunks ingested into the vector store.

    Returns
    -------
    The newly created Document ORM object (already committed).
    """
    document = Document(
        id=document_id,
        thread_id=thread_id,
        filename=filename,
        vectorstore_path=vectorstore_path,
        page_count=page_count,
        chunk_count=chunk_count,
        index_status="uploaded",
        uploaded_at=datetime.now(timezone.utc),
    )
    db.add(document)
    db.commit()
    db.refresh(document)
    return document


def get_document(db: Session, document_id: str) -> Optional[Document]:
    """Fetch a single Document by its primary key. Returns None if not found."""
    return db.get(Document, document_id)


def list_documents_for_thread(db: Session, thread_id: str) -> list[Document]:
    """
    Return all documents belonging to a given thread, newest-first.

    Useful for the document sidebar and for loading vector stores when the
    agent needs to retrieve context from all uploaded files in a thread.
    """
    return (
        db.query(Document)
        .filter(Document.thread_id == thread_id)
        .order_by(Document.uploaded_at.desc())
        .all()
    )


def list_documents_for_project(db: Session, project_id: str) -> list[Document]:
    """Return all project documents regardless of the conversation that uploaded them."""
    return (
        db.query(Document)
        .join(Thread, Document.thread_id == Thread.id)
        .filter(Thread.project_id == project_id)
        .order_by(Document.uploaded_at.desc())
        .all()
    )


def delete_document(db: Session, document_id: str) -> bool:
    """
    Delete a document by ID. Returns True if deleted, False if not found.

    Note: this only removes the DB row. The caller is responsible for also
    removing the FAISS index files from disk (via vectorstore_path).
    """
    document = db.get(Document, document_id)
    if document is None:
        return False
    db.delete(document)
    db.commit()
    return True


def set_document_index_status(
    db: Session,
    document_id: str,
    *,
    status: str,
    page_count: int | None = None,
    chunk_count: int | None = None,
    error_message: str | None = None,
) -> Optional[Document]:
    """Update the async indexing status (and optionally page/chunk counts) of a document."""
    document = db.get(Document, document_id)
    if document is None:
        return None
    document.index_status = status
    if page_count is not None:
        document.page_count = page_count
    if chunk_count is not None:
        document.chunk_count = chunk_count
    document.index_error = error_message if status == "error" else None
    db.commit()
    db.refresh(document)
    return document


# ---------------------------------------------------------------------------
# Study Log
# ---------------------------------------------------------------------------

# Allowed event types — enforced here so that any module importing crud.py
# can reference this set rather than hard-coding magic strings.
VALID_EVENT_TYPES: frozenset[str] = frozenset(
    {
        "question_answered",
        "quiz_generated",
        "flashcards_generated",
        "study_plan_generated",
        "web_search_used",
    }
)


def log_study_event(
    db: Session,
    *,
    thread_id: str,
    event_type: str,
    document_id: Optional[str] = None,
    topic: Optional[str] = None,
) -> StudyLog:
    """
    Append one event to the study log for a thread.

    Parameters
    ----------
    db          : Active SQLAlchemy session.
    thread_id   : Thread in which the event occurred.
    event_type  : One of VALID_EVENT_TYPES (validated here; raises ValueError
                  if the caller passes an unknown type).
    document_id : Optional — the document that was the source of the event.
    topic       : Optional short description (e.g. 'Newton's laws').

    Returns
    -------
    The newly created StudyLog ORM object (already committed).

    Raises
    ------
    ValueError : If event_type is not in VALID_EVENT_TYPES.
    """
    if event_type not in VALID_EVENT_TYPES:
        raise ValueError(
            f"Unknown event_type {event_type!r}. "
            f"Must be one of: {sorted(VALID_EVENT_TYPES)}"
        )

    entry = StudyLog(
        thread_id=thread_id,
        document_id=document_id,
        event_type=event_type,
        topic=topic,
        created_at=datetime.now(timezone.utc),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


def get_study_log_for_thread(
    db: Session,
    thread_id: str,
    *,
    limit: int = 200,
    offset: int = 0,
) -> list[StudyLog]:
    """
    Return study-log entries for a thread ordered by time (newest first).

    Parameters
    ----------
    thread_id : Filter to this thread only.
    limit     : Maximum rows to return.
    offset    : Rows to skip (pagination).
    """
    return (
        db.query(StudyLog)
        .filter(StudyLog.thread_id == thread_id)
        .order_by(StudyLog.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


# ---------------------------------------------------------------------------
# Topics Cache
# ---------------------------------------------------------------------------


def get_topics_cache(db: Session, document_id: str) -> TopicsCache | None:
    return db.get(TopicsCache, document_id)


def save_topics_cache(db: Session, document_id: str, topics_json: str) -> TopicsCache:
    cached = db.get(TopicsCache, document_id)
    if cached is None:
        cached = TopicsCache(document_id=document_id, topics_json=topics_json)
        db.add(cached)
    else:
        cached.topics_json = topics_json
    db.commit()
    db.refresh(cached)
    return cached


# ---------------------------------------------------------------------------
# User Memory  (project-scoped)
# ---------------------------------------------------------------------------


def save_user_memory(
    db: Session,
    user_id: str,
    project_id: str,
    fact_type: MemoryFactType | str,
    topic: str | None,
    detail: str,
    document_id: str | None = None,
    reason: str = "quiz_score",
) -> UserMemory:
    """Persist or update (upsert) a project-scoped memory fact to prevent duplicate rows per topic."""
    fact = MemoryFactType(fact_type)
    clean_topic = topic.strip() if topic else None

    existing: UserMemory | None = None
    if clean_topic:
        existing = (
            db.query(UserMemory)
            .filter(
                UserMemory.user_id == user_id,
                UserMemory.project_id == project_id,
                UserMemory.fact_type == fact,
                func.lower(UserMemory.topic) == clean_topic.lower(),
            )
            .first()
        )

    if existing is not None:
        existing.detail = detail[:500]
        existing.reason = reason
        if document_id:
            existing.document_id = document_id
        existing.created_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(existing)
        return existing

    memory = UserMemory(
        user_id=user_id,
        project_id=project_id,
        fact_type=fact,
        topic=clean_topic,
        reason=reason,
        detail=detail[:500],
        document_id=document_id,
    )
    db.add(memory)
    db.commit()
    db.refresh(memory)
    return memory


def get_user_memory(
    db: Session,
    user_id: str,
    project_id: str,
    limit: int = 20,
    fact_type: MemoryFactType | str | None = None,
) -> list[UserMemory]:
    """Return recent project-scoped structured facts for one user, optionally by type."""
    query = db.query(UserMemory).filter(
        UserMemory.user_id == user_id,
        UserMemory.project_id == project_id,
    )
    if fact_type is not None:
        query = query.filter(UserMemory.fact_type == MemoryFactType(fact_type))
    return query.order_by(UserMemory.created_at.desc()).limit(limit).all()


# ---------------------------------------------------------------------------
# Quiz Attempts  (project-scoped)
# ---------------------------------------------------------------------------


def create_quiz_attempt(
    db: Session,
    *,
    user_id: str,
    project_id: str,
    document_id: str,
    topic: str,
    correct_count: int,
    total_questions: int,
) -> QuizAttempt:
    """Persist one completed quiz score as a project-scoped factual activity record."""
    attempt = QuizAttempt(
        user_id=user_id,
        project_id=project_id,
        document_id=document_id,
        topic=topic,
        correct_count=correct_count,
        total_questions=total_questions,
        created_at=datetime.now(timezone.utc),
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return attempt


def get_quiz_attempts(
    db: Session,
    user_id: str,
    project_id: str,
    limit: int = 20,
) -> list[QuizAttempt]:
    """Return a user's recorded quiz attempts for a specific project, newest first."""
    return (
        db.query(QuizAttempt)
        .filter(
            QuizAttempt.user_id == user_id,
            QuizAttempt.project_id == project_id,
        )
        .order_by(QuizAttempt.created_at.desc())
        .limit(limit)
        .all()
    )


# ---------------------------------------------------------------------------
# Concept Mastery
# ---------------------------------------------------------------------------

#: EMA smoothing factor — see ConceptMastery docstring for the full formula.
_MASTERY_ALPHA: float = 0.4
#: Neutral prior score assigned to a concept with no prior attempts.
_MASTERY_INITIAL: float = 50.0


def _normalize_concept(topic: str) -> str:
    """Return the canonical form of a topic string used as the mastery key.

    Normalisation: strip leading/trailing whitespace, then lower-case.
    Example: '  Gradient Descent ' → 'gradient descent'
    This is intentionally minimal — no stemming or fuzzy deduplication —
    because Growth Analysis and Recommendations will both key off this same
    string, so any change here must be coordinated with those tasks.
    """
    return topic.strip().lower()


def upsert_concept_mastery(
    db: Session,
    *,
    project_id: str,
    topic: str,
    session_pct: float,
) -> ConceptMastery:
    """Apply one quiz session result to a concept's EMA mastery score.

    Algorithm
    ---------
    EMA with α = 0.4 (``_MASTERY_ALPHA``):

        new_score = α × session_pct + (1 − α) × old_score

    For a brand-new concept, old_score starts at ``_MASTERY_INITIAL`` (50).
    The result is clamped to [0, 100] and stored with two-decimal precision.

    Atomicity
    ---------
    The read-modify-write is executed inside a single DB transaction.
    ``db.begin_nested()`` (SAVEPOINT) is used so a concurrent submission
    cannot read the same stale old_score.  The caller's outer transaction
    is committed by the route handler as normal.

    Side-effect
    -----------
    Also appends one row to ``concept_mastery_history`` for Growth Analysis.
    """
    concept = _normalize_concept(topic)
    now = datetime.now(timezone.utc)

    with db.begin_nested():  # SAVEPOINT — atomic read-modify-write
        row = (
            db.query(ConceptMastery)
            .filter(
                ConceptMastery.project_id == project_id,
                ConceptMastery.concept == concept,
            )
            .with_for_update()   # row-level lock for the duration of the SAVEPOINT
            .first()
        )

        if row is None:
            old_score = _MASTERY_INITIAL
            new_score = round(
                _MASTERY_ALPHA * session_pct + (1.0 - _MASTERY_ALPHA) * old_score, 2
            )
            new_score = max(0.0, min(100.0, new_score))
            row = ConceptMastery(
                project_id=project_id,
                concept=concept,
                score=new_score,
                attempt_count=1,
                updated_at=now,
            )
            db.add(row)
        else:
            old_score = row.score
            new_score = round(
                _MASTERY_ALPHA * session_pct + (1.0 - _MASTERY_ALPHA) * old_score, 2
            )
            new_score = max(0.0, min(100.0, new_score))
            row.score = new_score
            row.attempt_count = (row.attempt_count or 0) + 1
            row.updated_at = now

        # Append snapshot to history (append-only, never updated)
        db.add(
            ConceptMasteryHistory(
                project_id=project_id,
                concept=concept,
                score=new_score,
                recorded_at=now,
            )
        )

    db.commit()
    db.refresh(row)
    return row


def get_concept_mastery(
    db: Session,
    project_id: str,
) -> list[ConceptMastery]:
    """Return all concept mastery rows for a project, sorted by score descending."""
    return (
        db.query(ConceptMastery)
        .filter(ConceptMastery.project_id == project_id)
        .order_by(ConceptMastery.score.desc())
        .all()
    )


# ---------------------------------------------------------------------------
# Growth Analysis
# ---------------------------------------------------------------------------

_GROWTH_THRESHOLD: float = 5.0  # Percentage points delta to qualify as improving or declining


def compute_growth_trend(scores: list[float]) -> tuple[str, float | None]:
    """Classify the growth trend of a concept based on its chronological score history.

    Parameters
    ----------
    scores : list[float]
        Chronological list of EMA snapshot scores (oldest to newest) from
        ``concept_mastery_history``.

    Returns
    -------
    tuple[str, float | None]
        A tuple of (trend_label, rounded_delta).
        Possible labels:
          - 'insufficient_data' : len(scores) < 3 (delta is None)
          - 'improving'         : delta >= +5.0
          - 'requires_attention': delta <= -5.0
          - 'stable'            : -5.0 < delta < +5.0

    Design & Tradeoff Notes
    -----------------------
    1. Minimum data requirement (k=3 tradeoff):
       At exactly 3 snapshots, the baseline window is a single point (scores[0]),
       while the recent window averages two points ((scores[1] + scores[2]) / 2.0).
       This asymmetric comparison is an intentional tradeoff: waiting for 4 quizzes
       would delay actionable growth guidance too long for students. At k >= 4,
       both windows become symmetric 2-point averages.
    2. Floating-point rounding:
       delta is rounded to 2 decimal places prior to threshold comparison to avoid
       float-precision jitter around boundaries (e.g. 4.9999999 vs 5.0).
    """
    k = len(scores)
    if k < 3:
        return "insufficient_data", None

    w_recent = (scores[-1] + scores[-2]) / 2.0

    if k == 3:
        w_baseline = scores[-3]
    else:
        w_baseline = (scores[-3] + scores[-4]) / 2.0

    delta = round(w_recent - w_baseline, 2)

    if delta >= _GROWTH_THRESHOLD:
        return "improving", delta
    elif delta <= -_GROWTH_THRESHOLD:
        return "requires_attention", delta
    else:
        return "stable", delta


def get_concept_mastery_history_batch(
    db: Session,
    project_id: str,
    concepts: list[str],
) -> dict[str, list[float]]:
    """Batch-fetch all history snapshot scores for multiple concepts in one single SQL query.

    Returns a dict mapping normalized concept string to chronological list of scores.
    """
    if not concepts:
        return {}

    rows = (
        db.query(ConceptMasteryHistory.concept, ConceptMasteryHistory.score)
        .filter(
            ConceptMasteryHistory.project_id == project_id,
            ConceptMasteryHistory.concept.in_(concepts),
        )
        .order_by(ConceptMasteryHistory.recorded_at.asc())
        .all()
    )

    history_map: dict[str, list[float]] = {c: [] for c in concepts}
    for concept_name, score in rows:
        if concept_name in history_map:
            history_map[concept_name].append(score)

    return history_map


def get_project_mastery_history(
    db: Session,
    project_id: str,
    concept: str | None = None,
) -> list[dict]:
    """Fetch chronological mastery history snapshots for concepts in a project.

    Returns a list of dicts suitable for building ConceptGrowthSeries.
    """
    query = db.query(
        ConceptMasteryHistory.concept,
        ConceptMasteryHistory.score,
        ConceptMasteryHistory.recorded_at,
    ).filter(ConceptMasteryHistory.project_id == project_id)

    if concept:
        query = query.filter(ConceptMasteryHistory.concept == concept.lower().strip())

    rows = query.order_by(ConceptMasteryHistory.concept.asc(), ConceptMasteryHistory.recorded_at.asc()).all()

    # Also fetch current mastery to know latest scores
    current_rows = get_concept_mastery(db, project_id)
    current_map = {r.concept: r.score for r in current_rows}

    # Group points by concept
    concept_points: dict[str, list[dict]] = {}
    for c_name, score, recorded_at in rows:
        if c_name not in concept_points:
            concept_points[c_name] = []
        concept_points[c_name].append({"score": round(score, 1), "recorded_at": recorded_at})

    # Include any concepts that have current mastery even if no history rows exist yet
    if not concept:
        for c_name in current_map:
            if c_name not in concept_points:
                concept_points[c_name] = []

    series = []
    for c_name, points in concept_points.items():
        scores = [p["score"] for p in points]
        trend_label, delta = compute_growth_trend(scores)
        cur_score = current_map.get(c_name, scores[-1] if scores else 0.0)
        series.append({
            "concept": c_name,
            "current_score": round(cur_score, 1),
            "trend": trend_label,
            "trend_delta": delta,
            "points": points,
        })

    # Sort series by current_score descending
    series.sort(key=lambda s: s["current_score"], reverse=True)
    return series
