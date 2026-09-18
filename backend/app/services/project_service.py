"""Application service for Project lifecycle management."""

from __future__ import annotations

from uuid import uuid4

from sqlalchemy.orm import Session

from app.config import DEFAULT_USER_ID
from app.db import crud
from app.db.models import Project, Thread

DEFAULT_THREAD_TITLE = "New Chat"


class ProjectNotFoundError(LookupError):
    """Raised when a requested Project does not exist."""


class SpaceNotFoundForProjectError(LookupError):
    """Raised when a project operation references an absent Space."""


class ProjectService:
    """Create, list, rename, archive, and delete Projects with user isolation.

    Key behaviour: creating a Project auto-creates one default Thread so the
    user is immediately dropped into a working conversation context (Fix 6).
    """

    def create_project(
        self,
        db: Session,
        *,
        space_id: str,
        name: str,
        user_id: str = DEFAULT_USER_ID,
        description: str | None = None,
    ) -> tuple[Project, Thread]:
        """
        Create a Project and its default Thread in a single operation.
        Verifies that space_id exists and is owned by user_id if supplied.
        """
        space = crud.get_space(db, space_id)
        if space is None or (user_id is not None and space.user_id != user_id):
            raise SpaceNotFoundForProjectError(f"Space {space_id!r} does not exist.")

        normalized = " ".join(name.split())
        if not normalized:
            raise ValueError("Project name must contain non-whitespace characters.")

        project = crud.create_project(
            db,
            project_id=str(uuid4()),
            space_id=space_id,
            user_id=space.user_id,
            name=normalized,
            description=description,
        )

        # Auto-create the default conversation thread (Fix 6)
        default_thread = crud.create_thread(
            db,
            thread_id=str(uuid4()),
            title=DEFAULT_THREAD_TITLE,
            project_id=project.id,
        )

        return project, default_thread

    def get_project(self, db: Session, project_id: str, user_id: str | None = None) -> Project:
        """Return an existing Project or raise ProjectNotFoundError if not found or unauthorized."""
        project = crud.get_project(db, project_id)
        if project is None or (user_id is not None and project.user_id != user_id):
            raise ProjectNotFoundError(f"Project {project_id!r} does not exist.")
        return project

    def list_projects(
        self,
        db: Session,
        space_id: str,
        *,
        user_id: str | None = None,
        include_archived: bool = False,
    ) -> list[Project]:
        """Return Projects in a Space ordered by creation date (newest first)."""
        space = crud.get_space(db, space_id)
        if space is None or (user_id is not None and space.user_id != user_id):
            raise SpaceNotFoundForProjectError(f"Space {space_id!r} does not exist.")
        return crud.list_projects(db, space_id, user_id=user_id, include_archived=include_archived)

    def rename_project(
        self, db: Session, project_id: str, name: str, user_id: str | None = None
    ) -> Project:
        """Persist a new name for an existing Project."""
        normalized = " ".join(name.split())
        if not normalized:
            raise ValueError("Project name must contain non-whitespace characters.")
        project = self.get_project(db, project_id, user_id=user_id)
        updated = crud.update_project(db, project_id=project.id, name=normalized)
        if updated is None:
            raise ProjectNotFoundError(f"Project {project_id!r} does not exist.")
        return updated

    def archive_project(
        self, db: Session, project_id: str, *, user_id: str | None = None, archived: bool = True
    ) -> Project:
        """Toggle the archived flag on a Project."""
        project = self.get_project(db, project_id, user_id=user_id)
        updated = crud.update_project(db, project_id=project.id, archived=archived)
        if updated is None:
            raise ProjectNotFoundError(f"Project {project_id!r} does not exist.")
        return updated

    def delete_project(self, db: Session, project_id: str, user_id: str | None = None) -> None:
        """Delete a Project and clean up all owned FAISS index files from disk."""
        project = self.get_project(db, project_id, user_id=user_id)

        from app.rag.store import delete_index

        for thread in crud.list_threads(db, project.id):
            for document in crud.list_documents_for_thread(db, thread.id):
                delete_index(document.vectorstore_path)

        crud.delete_project(db, project.id)
