"""Who is calling. This service sits behind SkillBridge's API, which signs students in.

SkillBridge's API calls it with two headers:
  Authorization: Bearer <SERVICE_TOKEN>   proves the call comes from SkillBridge's API
  X-User-Id: <SkillBridge user id>       says which signed-in student it is for
Nothing else can call it: browsers never hold the token.
"""
import hmac
import re
from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.database.session import get_db

DBSession = Annotated[AsyncSession, Depends(get_db)]

_USER_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")


@dataclass(frozen=True)
class Caller:
    """The SkillBridge student a request is made for."""

    id: str


async def get_current_user(
    authorization: Annotated[str | None, Header()] = None,
    x_user_id: Annotated[str | None, Header()] = None,
) -> Caller:
    scheme, _, token = (authorization or "").partition(" ")
    # compare_digest takes the same time however much of the token matches.
    if scheme != "Bearer" or not hmac.compare_digest(token.encode(), settings.service_token.encode()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Unknown caller")
    if not x_user_id or not _USER_ID.fullmatch(x_user_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Missing or invalid X-User-Id header")
    return Caller(id=x_user_id)


CurrentUser = Annotated[Caller, Depends(get_current_user)]
