from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from app.api.dependencies import get_current_user, get_quiz_llm
from app.db import crud
from app.db.models import User
from app.db.session import get_db
from sqlalchemy.orm import Session
from app.schemas.planner import StudyPlanRequest, StudyPlanResponse
from app.tools.study_planner_tool import StudyPlanGenerationError, generate_study_plan

router = APIRouter(prefix="/planner", tags=["planner"])
@router.post("/generate", response_model=StudyPlanResponse)
def generate_plan(
    payload: StudyPlanRequest,
    llm: Annotated[object, Depends(get_quiz_llm)],
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> StudyPlanResponse:
    if not crud.verify_document_owner(db, payload.document_id, current_user.id):
        raise HTTPException(status_code=404, detail="Document does not exist.")
    try: return generate_study_plan(llm, payload.document_id, payload.topics, payload.num_days, payload.exam_date)
    except StudyPlanGenerationError as error: raise HTTPException(status_code=422, detail=str(error)) from error
