import uuid
from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field

from app.database.models import (
    CandidateLevelEnum,
    CorrectionModeEnum,
    PersonalityTypeEnum,
    ProgrammingLanguageEnum,
    SenderEnum,
    StageEnum,
    StatusEnum,
)

class InterviewCreate(BaseModel):
    programming_language: ProgrammingLanguageEnum
    candidate_level: CandidateLevelEnum
    personality_type: PersonalityTypeEnum
    correction_mode: CorrectionModeEnum = CorrectionModeEnum.GUIDED
    resume_text: str | None = Field(None, max_length=20_000)
    jd_text: str | None = Field(None, max_length=5_000)
    focus_topics: list[Annotated[str, Field(max_length=80)]] = Field(default_factory=list, max_length=8)          

class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    sender: SenderEnum
    content: str
    created_at: datetime

class InterviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: StatusEnum
    stage: StageEnum
    programming_language: ProgrammingLanguageEnum
    candidate_level: CandidateLevelEnum
    current_topic: str | None
    covered_topics: list | None
    report: dict | None = None
    created_at: datetime
    messages: list[MessageOut] = []

class AnswerIn(BaseModel):
    content: str = Field(min_length=1)

class AnswerResponse(BaseModel):
    interview: InterviewOut
    evaluation: dict | None = None
    should_finish: bool

class InterviewListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: StatusEnum
    stage: StageEnum
    programming_language: ProgrammingLanguageEnum
    candidate_level: CandidateLevelEnum
    created_at: datetime

class InterviewListPage(BaseModel):
    items: list[InterviewListItem]
    next_cursor: str | None = None  # pass back as ?cursor= for the next page; None on the last