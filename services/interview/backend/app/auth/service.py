import uuid
from datetime import datetime, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, hash_refresh_token, new_refresh_token, refresh_expiry, verify_password
from app.database.models import User, RoleEnum, RefreshToken


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    return await db.scalar(select(User).where(User.email == email.strip().lower()))


async def create_user(db: AsyncSession, *, email: str, password: str, role: RoleEnum = RoleEnum.USER) -> User:
    user = User(
        email=email.strip().lower(),
        hashed_password=hash_password(password),
        role=role,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return user


async def authenticate(db: AsyncSession, *, email: str, password: str) -> User | None:
    user = await get_user_by_email(db, email)
    if not user:
        hash_password(password)   # hash anyway → no timing oracle for "does this email exist?"
        return None
    if not verify_password(password, user.hashed_password):
        return None
    if not user.is_active:
        return None
    return user


# --- refresh tokens ----------------------------------------------------------

async def issue_refresh_token(db: AsyncSession, user_id: uuid.UUID) -> str:
    """Create a refresh-token row; return the RAW token (only its hash is stored)."""
    raw, token_hash = new_refresh_token()
    db.add(RefreshToken(user_id=user_id, token_hash=token_hash, expires_at=refresh_expiry()))
    await db.commit()
    return raw


async def claim_refresh_token(db: AsyncSession, raw_token: str) -> tuple[str, uuid.UUID | None]:
    """Atomically consume (rotate) a refresh token. A single UPDATE claims it only if it
    is still active, so two concurrent refreshes cannot both mint a token. Returns:
      ("ok", user_id)    -> was active, now revoked; issue a new token
      ("reuse", user_id) -> exists but was already revoked -> replay / theft
      ("invalid", None)  -> not found, or found-but-expired
    """
    token_hash = hash_refresh_token(raw_token)
    now = datetime.now(timezone.utc)
    result = await db.execute(
        update(RefreshToken)
        .where(RefreshToken.token_hash == token_hash, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
        .returning(RefreshToken.user_id, RefreshToken.expires_at)
    )
    claimed = result.first()
    await db.commit()
    if claimed is not None:
        user_id, expires_at = claimed
        return ("invalid", None) if expires_at <= now else ("ok", user_id)
    # 0 rows claimed: either not found, or already revoked (reuse).
    existing = await db.scalar(select(RefreshToken.user_id).where(RefreshToken.token_hash == token_hash))
    return ("invalid", None) if existing is None else ("reuse", existing)


async def get_refresh_row(db: AsyncSession, raw_token: str) -> RefreshToken | None:
    return await db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_refresh_token(raw_token))
    )


async def revoke_refresh(db: AsyncSession, row: RefreshToken) -> None:
    row.revoked_at = datetime.now(timezone.utc)
    await db.commit()


async def revoke_all_refresh(db: AsyncSession, user_id: uuid.UUID) -> None:
    """Revoke every active refresh token for a user (reuse detection / logout-all)."""
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=datetime.now(timezone.utc))
    )
    await db.commit()
