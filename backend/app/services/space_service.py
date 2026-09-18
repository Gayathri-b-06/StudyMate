"""Application service for Space lifecycle management."""

from __future__ import annotations

from uuid import uuid4

from sqlalchemy.orm import Session

from app.config import DEFAULT_USER_ID
from app.db import crud
from app.db.models import Space


class SpaceNotFoundError(LookupError):
    """Raised when a requested Space does not exist."""


class SpaceService:
    """Create, list, rename, archive, and delete Spaces with user isolation."""

    def create_space(
        self,
        db: Session,
        *,
        name: str,
        user_id: str = DEFAULT_USER_ID,
        description: str | None = None,
    ) -> Space:
        """Create and persist a new Space owned by user_id."""
        name = " ".join(name.split())
        if not name:
            raise ValueError("Space name must contain non-whitespace characters.")
        return crud.create_space(
            db, space_id=str(uuid4()), name=name, user_id=user_id, description=description
        )

    def get_space(self, db: Session, space_id: str, user_id: str | None = None) -> Space:
        """Return an existing Space or raise SpaceNotFoundError if not found or unauthorized."""
        space = crud.get_space(db, space_id)
        if space is None or (user_id is not None and space.user_id != user_id):
            raise SpaceNotFoundError(f"Space {space_id!r} does not exist.")
        return space

    def list_spaces(
        self,
        db: Session,
        *,
        user_id: str | None = None,
        include_archived: bool = False,
    ) -> list[Space]:
        """Return Spaces owned by user_id."""
        return crud.list_spaces(db, user_id=user_id, include_archived=include_archived)

    def rename_space(self, db: Session, space_id: str, name: str, user_id: str | None = None) -> Space:
        """Persist a new name for an existing Space owned by user_id."""
        normalized = " ".join(name.split())
        if not normalized:
            raise ValueError("Space name must contain non-whitespace characters.")
        space = self.get_space(db, space_id, user_id=user_id)
        updated = crud.update_space(db, space_id=space.id, name=normalized)
        if updated is None:
            raise SpaceNotFoundError(f"Space {space_id!r} does not exist.")
        return updated

    def archive_space(
        self, db: Session, space_id: str, *, user_id: str | None = None, archived: bool = True
    ) -> Space:
        """Toggle the archived flag on a Space owned by user_id."""
        space = self.get_space(db, space_id, user_id=user_id)
        updated = crud.update_space(db, space_id=space.id, archived=archived)
        if updated is None:
            raise SpaceNotFoundError(f"Space {space_id!r} does not exist.")
        return updated

    def delete_space(self, db: Session, space_id: str, user_id: str | None = None) -> None:
        """Hard-delete a Space and all its Projects/Threads/Documents (DB cascade)."""
        space = self.get_space(db, space_id, user_id=user_id)

        # Clean up all FAISS indexes for every project in this space
        from app.rag.store import delete_index

        for project in crud.list_projects(db, space.id, include_archived=True):
            for thread in crud.list_threads(db, project.id):
                for document in crud.list_documents_for_thread(db, thread.id):
                    delete_index(document.vectorstore_path)

        crud.delete_space(db, space.id)

