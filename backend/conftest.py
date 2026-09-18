"""
conftest.py
===========
Root pytest configuration for the StudyMate backend.

Adds the `backend/` directory to sys.path so that `from app.db.crud import ...`
works in tests without requiring an editable install.
"""
import sys
import os

# Ensure `backend/` is on the path so `app.*` imports resolve correctly.
sys.path.insert(0, os.path.dirname(__file__))

# This is an interactive/manual RAG smoke script, despite its historic
# ``test_`` filename.  It constructs an embedding model at import time and
# requires external provider credentials, so collecting it makes the regular
# deterministic test suite depend on network/model availability.
collect_ignore = ["tests/test_rag_manual.py"]
