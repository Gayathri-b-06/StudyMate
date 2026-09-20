"""SQLite checkpoint infrastructure for LangGraph conversation state."""

from __future__ import annotations

import sqlite3
from pathlib import Path

from langgraph.checkpoint.sqlite import SqliteSaver
from app.runtime_paths import get_runtime_data_dir

DEFAULT_CHECKPOINT_DATABASE_PATH = get_runtime_data_dir() / "langgraph_checkpoints.db"


def create_checkpointer(
    database_path: str | Path = DEFAULT_CHECKPOINT_DATABASE_PATH,
) -> SqliteSaver:
    """Create and initialize a SQLite-backed LangGraph checkpointer.

    The checkpoint database is intentionally separate from StudyMate's ORM
    database so LangGraph-owned state remains isolated from application data.
    """
    connection = sqlite3.connect(database_path, check_same_thread=False)
    checkpointer = SqliteSaver(connection)
    checkpointer.setup()
    return checkpointer


def close_checkpointer(checkpointer: SqliteSaver) -> None:
    """Close the SQLite connection owned by a LangGraph checkpointer."""
    checkpointer.conn.close()
