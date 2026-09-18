"""Project-scoped flashcard learning-status retrieval for the AI Tutor."""

from collections import Counter
from langchain.tools import tool
from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool

from app.db import crud
from app.db.session import SessionLocal


def create_flashcard_status_tool() -> BaseTool:
    @tool
    def get_flashcard_learning_status(status: str, config: RunnableConfig) -> dict:
        """Retrieve this project's flashcards by status: still_learning, need_review, or known."""
        thread_id = config.get("configurable", {}).get("thread_id", "")
        db = SessionLocal()
        try:
            thread = crud.get_thread(db, thread_id)
            if thread is None:
                return {"status": status, "cards": 0, "topics": []}
            project = crud.get_project(db, thread.project_id)
            if project is None:
                return {"status": status, "cards": 0, "topics": []}
            rows = crud.list_flashcard_reviews(
                db, user_id=project.user_id, project_id=project.id, learning_status=status
            )
            topics = Counter((row.topic or "Untitled topic").strip() for row in rows)
            return {
                "status": status,
                "cards": len(rows),
                "topics": [{"topic": topic, "cards": count} for topic, count in topics.most_common()],
                "flashcards": [{"question": row.front, "answer": row.back, "topic": row.topic} for row in rows[:12]],
            }
        finally:
            db.close()

    return get_flashcard_learning_status
