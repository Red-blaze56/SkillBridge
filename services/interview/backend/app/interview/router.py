from typing import Annotated

from fastapi import APIRouter, File, HTTPException, Query, UploadFile, status

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
from app.interview.resume import MAX_BYTES, ResumeParseError, extract_resume_text
from app.interview.llm import extract_resume_agenda

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


@interview_router.post("/parse-resume")
async def parse_resume(user: CurrentUser, file: UploadFile = File(...)):
    """Runs while the user fills the setup form. Returns editable text + an agenda; the
    client submits both with POST /interviews."""
    data = await file.read(MAX_BYTES + 1)              # cap the read; extract_resume_text rejects >MAX_BYTES
    try:
        text = extract_resume_text(data)
    except ResumeParseError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc))
    if text is None:                                   # scanned/empty PDF -> OCR deferred (v2)
        return {"readable": False, "resume_text": "", "focus_topics": []}
    topics = await extract_resume_agenda(text)
    return {"readable": True, "resume_text": text, "focus_topics": topics}