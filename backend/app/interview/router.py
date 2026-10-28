from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, status

from app.auth.dependencies import CurrentUser, DBSession
from app.interview import service
from app.interview.pagination import InvalidCursor, decode_cursor
from app.interview.schemas import (
    AnswerIn,
    AnswerResponse,
    InterviewCreate,
    InterviewListItem,
    InterviewListPage,
    InterviewOut,
)
from app.interview.dependencies import OwnedInterview

interview_router = APIRouter(prefix="/interviews", tags=["interview"])

@interview_router.get("", response_model=InterviewListPage, status_code=status.HTTP_200_OK)
async def listing_interviews(
    user: CurrentUser,
    db: DBSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: str | None = None,
):
    try:
        decoded = decode_cursor(cursor) if cursor else None
    except InvalidCursor:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid cursor")
    rows, next_cursor = await service.list_interviews(db, user_id=user.id, limit=limit, cursor=decoded)
    return InterviewListPage(
        items=[InterviewListItem.model_validate(row) for row in rows],
        next_cursor=next_cursor,
    )

@interview_router.post("", response_model = InterviewOut, status_code = status.HTTP_201_CREATED)
async def create_interview(payload: InterviewCreate, user:CurrentUser, db:DBSession):
    return await service.create_interview(db, user_id=user.id, payload=payload)

@interview_router.get("/{interview_id}", response_model = InterviewOut)
async def get_interview(interview: OwnedInterview):
    return interview 

@interview_router.post("/{interview_id}/answer", response_model=AnswerResponse)
async def submit_answer(payload: AnswerIn, interview: OwnedInterview, db: DBSession):
    full, evaluation, should_finish = await service.submit_answer(db, interview=interview, content=payload.content)
    return AnswerResponse(
        interview=InterviewOut.model_validate(full),
        evaluation=evaluation,
        should_finish=should_finish
    )

@interview_router.post("/{interview_id}/finish", response_model=InterviewOut)
async def final_report(db: DBSession, interview: OwnedInterview):
    return await service.finish_interview(db, interview=interview)