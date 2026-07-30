"""HTTP contracts for StudyMate conversation-thread management."""

from datetime import datetime
from pydantic import BaseModel, Field

from app.schemas.chat import DocumentCitation


class ThreadRenameRequest(BaseModel):
    """User-selected replacement title for a conversation thread."""

    title: str = Field(min_length=1, max_length=200)


class ThreadResponse(BaseModel):
    """Serialized StudyMate conversation thread."""

    id: str
    title: str
    created_at: datetime
    updated_at: datetime


class ThreadChatMessage(BaseModel):
    """Single message in a thread's conversation history."""

    role: str = Field(description="Message role ('user' or 'assistant').")
    content: str = Field(description="Text content of the message.")
    sources: list[DocumentCitation] = Field(
        default_factory=list,
        description="Optional list of source document citations if retrieval was used.",
    )
