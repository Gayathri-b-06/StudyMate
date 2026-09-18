"""
scripts/migrate_spaces_projects.py
===================================
Forward and backward migration for the Space → Project hierarchy.

Adds `spaces` and `projects` tables, adds `project_id` FK columns to
`threads`, `user_memories`, and `quiz_attempts`, then backfills all
existing rows into a default Space/Project.

The entire forward migration is wrapped in a SINGLE DATABASE TRANSACTION.
If any step fails, SQLAlchemy automatically rolls back the whole transaction
and raises the exception — leaving the DB unchanged (SQLite WAL guarantees
this). On the next startup attempt the migration runs again from scratch.

Idempotency
-----------
The default Space and Project are inserted with INSERT OR IGNORE using stable
hardcoded UUIDs. Re-running on an already-migrated DB is always a no-op.

Usage
-----
Called automatically from `init_db()` in session.py when the `spaces` table
is absent. Can also be run as a standalone script:

    python -m scripts.migrate_spaces_projects --forward
    python -m scripts.migrate_spaces_projects --backward   # manual rollback only

Known limitation — SQLite NOT NULL
-----------------------------------
SQLite does not support ALTER COLUMN … SET NOT NULL after the fact.
The NOT NULL constraint is enforced by:
  1. The ORM model (nullable=False on project_id columns)
  2. The _validate_no_nulls() step inside this migration (raises if any NULL found)
  3. The startup validation in init_db() which re-checks every boot
"""

from __future__ import annotations

import argparse
import logging
from pathlib import Path

from sqlalchemy import Connection, text

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Stable default UUIDs — never change these once deployed.
# Using deterministic UUIDs means INSERT OR IGNORE gives us idempotency.
# ---------------------------------------------------------------------------
DEFAULT_SPACE_ID = "00000000-0000-0000-0000-000000000001"
DEFAULT_PROJECT_ID = "00000000-0000-0000-0000-000000000002"
DEFAULT_SPACE_NAME = "Default Space"
DEFAULT_PROJECT_NAME = "Default Project"


# ---------------------------------------------------------------------------
# Forward migration helpers (each runs within the same transaction)
# ---------------------------------------------------------------------------

def _create_spaces_table(conn: Connection) -> None:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS spaces (
            id          TEXT    NOT NULL PRIMARY KEY,
            name        TEXT    NOT NULL,
            description TEXT,
            archived    INTEGER NOT NULL DEFAULT 0,
            created_at  DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at  DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )
    """))
    logger.info("Migration: spaces table created (or already exists).")


def _create_projects_table(conn: Connection) -> None:
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS projects (
            id          TEXT    NOT NULL PRIMARY KEY,
            space_id    TEXT    NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
            name        TEXT    NOT NULL,
            description TEXT,
            archived    INTEGER NOT NULL DEFAULT 0,
            created_at  DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            updated_at  DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
        )
    """))
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_projects_space_id ON projects(space_id)"
    ))
    logger.info("Migration: projects table created (or already exists).")


def _add_project_id_columns(conn: Connection) -> None:
    """Add nullable project_id columns to existing tables (SQLite allows this)."""
    for table in ("threads", "user_memories", "quiz_attempts"):
        existing = {
            row[1]
            for row in conn.execute(text(f"PRAGMA table_info({table})")).fetchall()
        }
        if "project_id" not in existing:
            conn.execute(text(
                f"ALTER TABLE {table} ADD COLUMN project_id TEXT "
                f"REFERENCES projects(id) ON DELETE CASCADE"
            ))
            logger.info("Migration: added project_id column to %s.", table)
        else:
            logger.info("Migration: project_id already exists on %s — skipped.", table)


def _insert_default_space_and_project(conn: Connection) -> None:
    conn.execute(text("""
        INSERT OR IGNORE INTO spaces (id, name, description, archived)
        VALUES (:id, :name, :desc, 0)
    """), {"id": DEFAULT_SPACE_ID, "name": DEFAULT_SPACE_NAME, "desc": None})

    conn.execute(text("""
        INSERT OR IGNORE INTO projects (id, space_id, name, description, archived)
        VALUES (:id, :space_id, :name, :desc, 0)
    """), {
        "id": DEFAULT_PROJECT_ID,
        "space_id": DEFAULT_SPACE_ID,
        "name": DEFAULT_PROJECT_NAME,
        "desc": "Auto-created during Space/Project migration. Rename as needed.",
    })
    logger.info(
        "Migration: default Space (%s) and Project (%s) ensured.",
        DEFAULT_SPACE_ID, DEFAULT_PROJECT_ID,
    )


def _backfill_project_id(conn: Connection) -> None:
    """Set project_id = DEFAULT_PROJECT_ID on all rows that don't have one."""
    for table in ("threads", "user_memories", "quiz_attempts"):
        result = conn.execute(text(
            f"UPDATE {table} SET project_id = :pid WHERE project_id IS NULL"
        ), {"pid": DEFAULT_PROJECT_ID})
        logger.info(
            "Migration: backfilled %d rows in %s.", result.rowcount, table
        )


def _validate_no_nulls(conn: Connection) -> None:
    """Raise if any project_id column is still NULL — migration must be complete."""
    for table in ("threads", "user_memories", "quiz_attempts"):
        row = conn.execute(
            text(f"SELECT COUNT(*) FROM {table} WHERE project_id IS NULL")
        ).fetchone()
        null_count = row[0] if row else 0
        if null_count > 0:
            raise RuntimeError(
                f"Migration validation failed: {null_count} row(s) in '{table}' "
                f"still have NULL project_id after backfill. "
                "The migration transaction will roll back."
            )
    logger.info("Migration: validation passed — no NULL project_id rows.")


def _create_threads_project_index(conn: Connection) -> None:
    conn.execute(text(
        "CREATE INDEX IF NOT EXISTS ix_threads_project_id ON threads(project_id)"
    ))


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

def migrate_forward(conn: Connection) -> None:
    """
    Run the full forward migration in a single transaction.

    Steps:
      1  CREATE TABLE spaces
      2  CREATE TABLE projects
      3  ADD COLUMN project_id to threads, user_memories, quiz_attempts
      4  INSERT default Space and Project (idempotent via INSERT OR IGNORE)
      5  UPDATE rows with NULL project_id → DEFAULT_PROJECT_ID
      6  Validate: assert zero NULL project_id rows
      7  Create index on threads.project_id
    """
    # Enable FK support for this connection (SQLite requires this per connection)
    try:
        conn.connection.dbapi_connection.cursor().execute("PRAGMA foreign_keys = ON;")
    except Exception:
        pass

    tx = conn.begin_nested() if conn.in_transaction() else conn.begin()
    with tx:
        _create_spaces_table(conn)
        _create_projects_table(conn)
        _add_project_id_columns(conn)
        _insert_default_space_and_project(conn)
        _backfill_project_id(conn)
        _validate_no_nulls(conn)
        _create_threads_project_index(conn)

    if conn.in_transaction() and not conn.in_nested_transaction():
        conn.commit()

    logger.info("Migration: forward migration completed successfully.")


def migrate_backward(conn: Connection) -> None:
    """
    Manual rollback. Removes project_id columns and drops spaces/projects tables.

    SQLite does not support DROP COLUMN directly (before 3.35.0). We recreate
    affected tables without the project_id column via the rename-recreate pattern.
    This is a destructive operation — run only with a backup in hand.
    """
    try:
        conn.connection.dbapi_connection.cursor().execute("PRAGMA foreign_keys = OFF;")
    except Exception:
        pass

    tx = conn.begin_nested() if conn.in_transaction() else conn.begin()
    with tx:
        # threads: recreate without project_id
        conn.execute(text("ALTER TABLE threads RENAME TO _threads_old"))
        conn.execute(text("""
            CREATE TABLE threads (
                id         TEXT     NOT NULL PRIMARY KEY,
                title      TEXT     NOT NULL,
                created_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                updated_at DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
        """))
        conn.execute(text(
            "INSERT INTO threads SELECT id, title, created_at, updated_at FROM _threads_old"
        ))
        conn.execute(text("DROP TABLE _threads_old"))

        # user_memories: recreate without project_id
        conn.execute(text("ALTER TABLE user_memories RENAME TO _memories_old"))
        conn.execute(text("""
            CREATE TABLE user_memories (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     TEXT    NOT NULL,
                fact_type   TEXT    NOT NULL,
                topic       TEXT,
                reason      TEXT    NOT NULL DEFAULT 'quiz_score',
                detail      TEXT    NOT NULL,
                document_id TEXT    REFERENCES documents(id) ON DELETE SET NULL,
                created_at  DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
        """))
        conn.execute(text(
            "INSERT INTO user_memories SELECT id, user_id, fact_type, topic, reason, detail, document_id, created_at FROM _memories_old"
        ))
        conn.execute(text("DROP TABLE _memories_old"))

        # quiz_attempts: recreate without project_id
        conn.execute(text("ALTER TABLE quiz_attempts RENAME TO _quiz_old"))
        conn.execute(text("""
            CREATE TABLE quiz_attempts (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id         TEXT    NOT NULL,
                document_id     TEXT    NOT NULL,
                topic           TEXT    NOT NULL,
                correct_count   INTEGER NOT NULL,
                total_questions INTEGER NOT NULL,
                created_at      DATETIME NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
            )
        """))
        conn.execute(text(
            "INSERT INTO quiz_attempts SELECT id, user_id, document_id, topic, correct_count, total_questions, created_at FROM _quiz_old"
        ))
        conn.execute(text("DROP TABLE _quiz_old"))

        conn.execute(text("DROP TABLE IF EXISTS projects"))
        conn.execute(text("DROP TABLE IF EXISTS spaces"))

    if conn.in_transaction() and not conn.in_nested_transaction():
        conn.commit()

    try:
        conn.connection.dbapi_connection.cursor().execute("PRAGMA foreign_keys = ON;")
    except Exception:
        pass
    logger.info("Migration: backward rollback completed.")


# ---------------------------------------------------------------------------
# Standalone CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

    from app.db.session import engine

    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")

    parser = argparse.ArgumentParser(description="StudyMate Space/Project migration")
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--forward", action="store_true", help="Apply the migration")
    group.add_argument("--backward", action="store_true", help="Roll back the migration")
    args = parser.parse_args()

    with engine.connect() as connection:
        if args.forward:
            migrate_forward(connection)
        else:
            migrate_backward(connection)
