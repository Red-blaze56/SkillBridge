from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.exc import IntegrityError

from app.auth.dependencies import CurrentUser, DBSession
from app.auth.schemas import TokenPair, UserCreate, UserOut
from app.auth.service import (
    authenticate,
    claim_refresh_token,
    create_user,
    get_refresh_row,
    get_user_by_email,
    issue_refresh_token,
    revoke_all_refresh,
    revoke_refresh,
)
from app.core.config import settings
from app.core.security import create_access_token
from app.database.models import RoleEnum, User

auth_router = APIRouter(prefix="/auth", tags=["auth"])

REFRESH_COOKIE = "refresh_token"
REFRESH_PATH = "/auth"


def _set_refresh_cookie(response: Response, raw: str) -> None:
    response.set_cookie(
        key=REFRESH_COOKIE,
        value=raw,
        httponly=True,                                   # JS can never read it
        secure=settings.cookie_secure,                   # HTTPS-only in prod
        samesite=settings.cookie_samesite,
        path=REFRESH_PATH,                               # only sent to /auth/*
        max_age=settings.refresh_token_ttl_days * 24 * 60 * 60,
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(key=REFRESH_COOKIE, path=REFRESH_PATH)


def _attach_session(response: Response, raw: str) -> None:
    """On a successful token response: set the refresh cookie + no-store. Works via the
    injected Response because success means no exception (headers set on it are kept)."""
    _set_refresh_cookie(response, raw)
    response.headers["Cache-Control"] = "no-store"


def _check_origin(request: Request) -> None:
    """CSRF defense on the cookie endpoints: reject a cross-site Origin. Trailing slashes
    are normalised so a stray '/' in FRONTEND_URL doesn't 403 every request."""
    origin = request.headers.get("origin")
    if origin is not None and origin.rstrip("/") != settings.frontend_url.rstrip("/"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Bad origin")


@auth_router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(payload: UserCreate, db: DBSession):
    if await get_user_by_email(db, payload.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    try:
        return await create_user(db, email=payload.email, password=payload.password, role=RoleEnum.USER)
    except IntegrityError:
        # Lost the race to a concurrent signup with the same email — the unique
        # constraint is the real guard; the check above is just the friendly path.
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")


@auth_router.post("/login", response_model=TokenPair)
async def login(form: Annotated[OAuth2PasswordRequestForm, Depends()], response: Response, db: DBSession):
    user = await authenticate(db, email=form.username, password=form.password)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    raw = await issue_refresh_token(db, user.id)
    _attach_session(response, raw)
    return TokenPair(access_token=create_access_token(user.id))


@auth_router.post("/refresh", response_model=TokenPair)
async def refresh(request: Request, response: Response, db: DBSession):
    _check_origin(request)
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing refresh token")
    # Atomic claim — prevents two concurrent refreshes from both minting a token.
    outcome, user_id = await claim_refresh_token(db, raw)
    if outcome == "reuse" and user_id is not None:
        # An already-rotated token replayed → revoke every session and clear the dead
        # cookie. This path returns an explicit JSONResponse because a Set-Cookie set on
        # the injected Response is dropped once we send a non-2xx via raise.
        await revoke_all_refresh(db, user_id)
        resp = JSONResponse({"detail": "Refresh token reuse detected"}, status_code=status.HTTP_401_UNAUTHORIZED)
        _clear_refresh_cookie(resp)
        return resp
    if outcome != "ok" or user_id is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired refresh token")
    user = await db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User inactive")
    new_raw = await issue_refresh_token(db, user_id)
    _attach_session(response, new_raw)
    return TokenPair(access_token=create_access_token(user_id))


@auth_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(request: Request, response: Response, db: DBSession):
    _check_origin(request)
    raw = request.cookies.get(REFRESH_COOKIE)
    if raw is not None:
        row = await get_refresh_row(db, raw)
        if row is not None and row.revoked_at is None:
            await revoke_refresh(db, row)
    _clear_refresh_cookie(response)


@auth_router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(user: CurrentUser, response: Response, db: DBSession):
    await revoke_all_refresh(db, user.id)
    _clear_refresh_cookie(response)


@auth_router.get("/me", response_model=UserOut)
async def me(user: CurrentUser):
    return user
