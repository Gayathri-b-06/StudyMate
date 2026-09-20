"""
db/session.py
=============
Database engine and session management for StudyMate.

Public surface
--------------
- `engine`    : The SQLAlchemy engine (created once at import time).
- `init_db()` : Creates all tables if they don't already exist.
- `get_db()`  : FastAPI-compatible dependency that yields a Session and
                guarantees it is closed on teardown.

Portability note
----------------
The only thing that changes when moving from SQLite → Postgres is the value
of `DATABASE_URL`.  Everything else in this file — and in crud.py — stays
identical because we use the SQLAlchemy abstraction layer throughout.

SQLite-specific tweaks
----------------------
- `connect_args={"check_same_thread": False}` is required for SQLite because
  FastAPI uses a thread pool; without this flag SQLite raises an error when a
  connection created in one thread is used in another.
- This flag has no effect on other DB backends and is safe to leave in.
"""

from pathlib import Path
import os
from collections.abc import Generator

from sqlalchemy import create_engine, event, text
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Base
from app.runtime_paths import get_runtime_data_dir

# ---------------------------------------------------------------------------
# Connection URL
# ---------------------------------------------------------------------------
# Default: SQLite file at backend/chatbot.db (one directory above this package).
# Override by setting the DATABASE_URL environment variable before startup.
# Example Postgres override:
#   export DATABASE_URL="postgresql+psycopg2://user:pass@localhost:5432/studymate"
# ---------------------------------------------------------------------------



BASE_DIR = get_runtime_data_dir()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    f"sqlite:///{BASE_DIR / 'chatbot.db'}"
)

# ---------------------------------------------------------------------------
# Engine
# ---------------------------------------------------------------------------

_connect_args: dict = {}
if DATABASE_URL.startswith("sqlite"):
    # Needed so FastAPI's thread-pool workers can share connections safely.
    _connect_args["check_same_thread"] = False

engine: Engine = create_engine(
    DATABASE_URL,
    connect_args=_connect_args,
    # echo=True would log every SQL statement — useful during development,
    # but disabled by default to avoid noise in production.
    echo=False,
)


# ---------------------------------------------------------------------------
# Enable WAL mode for SQLite (no-op for other backends)
# This dramatically improves concurrent read performance and prevents
# "database is locked" errors during overlapping requests.
# ---------------------------------------------------------------------------

@event.listens_for(engine, "connect")
def _set_sqlite_pragma(dbapi_connection, connection_record) -> None:  # type: ignore[type-arg]
    """Enable Write-Ahead Logging on every new SQLite connection."""
    if DATABASE_URL.startswith("sqlite"):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL;")
        cursor.execute("PRAGMA foreign_keys=ON;")
        cursor.close()


# ---------------------------------------------------------------------------
# Session factory
# ---------------------------------------------------------------------------

SessionLocal: sessionmaker[Session] = sessionmaker(
    bind=engine,
    autocommit=False,  # We control transactions explicitly
    autoflush=False,   # Flush only when we commit — avoids partial-write surprises
    expire_on_commit=False,  # Keep objects usable after commit without a re-query
)


# ---------------------------------------------------------------------------
# Public helpers
# ---------------------------------------------------------------------------

def init_db() -> None:
    """
    Create all tables and run any pending schema migrations.

    Sequence on every startup:
      1. CREATE TABLE IF NOT EXISTS for all ORM-defined tables (new installs).
      2. Legacy column patch: add `updated_at` to `threads` if absent.
      3. Space/Project migration: if the `spaces` table is absent, run the
         full forward migration (single transaction — see migrate_spaces_projects.py).
      4. NOT NULL validation: assert no NULL project_id rows remain in
         threads, user_memories, or quiz_attempts. If any are found, raise
         RuntimeError so the process exits rather than serving broken data.

    On migration failure the transaction rolls back automatically and this
    function re-raises the exception — FastAPI's lifespan handler will catch
    it and the process will exit, leaving the DB unchanged.
    """
    from scripts.migrate_spaces_projects import (
        migrate_forward,
        _validate_no_nulls,
    )

    Base.metadata.create_all(bind=engine)

    # Only legacy records need an inert ownership placeholder. Fresh installs
    # do not provision a default account or any administrator.
    needs_legacy_owner = False
    if DATABASE_URL.startswith("sqlite"):
        with engine.connect() as connection:
            thread_columns = {row["name"] for row in connection.execute(text("PRAGMA table_info(threads)")).mappings()}
            needs_legacy_owner = "project_id" not in thread_columns
            for table in ("spaces", "projects"):
                columns = {row["name"] for row in connection.execute(text(f"PRAGMA table_info({table})")).mappings()}
                clause = "WHERE user_id IS NULL OR user_id = 'default_user'" if "user_id" in columns else ""
                if connection.execute(text(f"SELECT COUNT(*) FROM {table} {clause}")).scalar():
                    needs_legacy_owner = True
    if needs_legacy_owner:
        from app.services.auth_service import seed_default_user
        with SessionLocal() as seed_session:
            seed_default_user(seed_session)

    if DATABASE_URL.startswith("sqlite"):
        with engine.connect() as connection:
            # --- legacy: add updated_at if missing ---
            columns = {
                row["name"]
                for row in connection.execute(text("PRAGMA table_info(threads)")).mappings()
            }
            if "updated_at" not in columns:
                tx = connection.begin_nested() if connection.in_transaction() else connection.begin()
                with tx:
                    connection.execute(text("ALTER TABLE threads ADD COLUMN updated_at DATETIME"))
                    connection.execute(text(
                        "UPDATE threads SET updated_at = created_at WHERE updated_at IS NULL"
                    ))
                if connection.in_transaction() and not connection.in_nested_transaction():
                    connection.commit()

            # --- Space/Project migration (idempotent) ---
            tables = {
                row[0]
                for row in connection.execute(
                    text("SELECT name FROM sqlite_master WHERE type='table'")
                ).fetchall()
            }
            thread_cols_now = {
                row["name"]
                for row in connection.execute(text("PRAGMA table_info(threads)")).mappings()
            }
            migration_complete = "spaces" in tables and "project_id" in thread_cols_now
            if not migration_complete:
                migrate_forward(connection)
                # Refresh after migration so we pick up newly-added columns
                thread_cols_now = {
                    row["name"]
                    for row in connection.execute(text("PRAGMA table_info(threads)")).mappings()
                }
            else:
                # Migration already applied on a prior boot — nothing to insert.
                # The database is the source of truth; do NOT recreate any rows
                # the user may have deleted (e.g. Default Space).
                pass

            # --- NOT NULL validation on every boot ---
            # Guard: only run if threads table has the project_id column.
            if "project_id" in thread_cols_now:
                _validate_no_nulls(connection)

            document_columns = {row["name"] for row in connection.execute(text("PRAGMA table_info(documents)")).mappings()}
            if "index_error" not in document_columns:
                tx = connection.begin_nested() if connection.in_transaction() else connection.begin()
                with tx:
                    connection.execute(text("ALTER TABLE documents ADD COLUMN index_error TEXT"))
                if connection.in_transaction() and not connection.in_nested_transaction():
                    connection.commit()

            # --- Multi-user data isolation: space.user_id & project.user_id ---
            space_columns = {row["name"] for row in connection.execute(text("PRAGMA table_info(spaces)")).mappings()}
            if "user_id" not in space_columns:
                tx = connection.begin_nested() if connection.in_transaction() else connection.begin()
                with tx:
                    connection.execute(text("ALTER TABLE spaces ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE"))
                    connection.execute(text("UPDATE spaces SET user_id = 'default_user' WHERE user_id IS NULL"))
                    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_spaces_user_id ON spaces(user_id)"))
                if connection.in_transaction() and not connection.in_nested_transaction():
                    connection.commit()

            project_columns = {row["name"] for row in connection.execute(text("PRAGMA table_info(projects)")).mappings()}
            if "user_id" not in project_columns:
                tx = connection.begin_nested() if connection.in_transaction() else connection.begin()
                with tx:
                    connection.execute(text("ALTER TABLE projects ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE"))
                    connection.execute(text("UPDATE projects SET user_id = 'default_user' WHERE user_id IS NULL"))
                    connection.execute(text("CREATE INDEX IF NOT EXISTS ix_projects_user_id ON projects(user_id)"))
                if connection.in_transaction() and not connection.in_nested_transaction():
                    connection.commit()

def get_db() -> Generator[Session, None, None]:
    """
    FastAPI dependency that yields a database session for one request.

    Usage
    -----
    ```python
    @router.get("/threads")
    def list_threads(db: Session = Depends(get_db)):
        return crud.list_threads(db)
    ```

    The session is always closed in the `finally` block, even if the
    route handler raises an exception, preventing connection leaks.
    """
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
