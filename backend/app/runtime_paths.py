"""Filesystem locations that must survive an application restart.

Set ``STUDYMATE_DATA_DIR`` to a mounted persistent volume in production.
When it is unset, local development retains the historical ``backend/``
locations so existing databases and indexes continue to work.
"""

from __future__ import annotations

import os
from pathlib import Path


_BACKEND_DIR = Path(__file__).resolve().parents[1]


def get_runtime_data_dir() -> Path:
    """Return the writable directory for databases and generated indexes."""
    configured_directory = os.getenv("STUDYMATE_DATA_DIR")
    data_dir = Path(configured_directory).expanduser() if configured_directory else _BACKEND_DIR
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir.resolve()

