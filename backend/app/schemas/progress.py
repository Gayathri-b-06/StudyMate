"""Client-reported local quiz and flashcard session outcomes."""
from typing import Literal
from pydantic import BaseModel, Field

class QuizQuestionResult(BaseModel):
    question: str
    correct: bool

class QuizResultReport(BaseModel):
    project_id: str
    document_id: str
    topic: str
    results: list[QuizQuestionResult] = Field(min_length=1)

class FlashcardStatusResult(BaseModel):
    front: str
    back: str | None = None
    status: Literal["known", "still_learning", "need_review"]

class FlashcardResultReport(BaseModel):
    project_id: str
    document_id: str
    topic: str
    cards: list[FlashcardStatusResult]
