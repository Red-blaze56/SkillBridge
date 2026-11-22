"""Cursor (keyset) pagination for the interview list.

A cursor remembers the last row of the previous page as (created_at, id). The next
page is "rows older than that", which stays correct even when new interviews are
created while someone is paging. (Offset paging would shift and repeat rows.)

The cursor is opaque to clients: URL-safe base64 of a small JSON document. It is not
signed on purpose: the list query is always scoped to the signed-in user, so a forged
cursor can only move around that user's own rows.
"""

import base64
import json
from datetime import datetime
from uuid import UUID


class InvalidCursor(ValueError):
    """The cursor string is not one we produced (or it was damaged in transit)."""


def encode_cursor(created_at: datetime, row_id: UUID) -> str:
    raw = json.dumps({"t": created_at.isoformat(), "i": str(row_id)}, separators=(",", ":"))
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    try:
        padded = cursor + "=" * (-len(cursor) % 4)
        data = json.loads(base64.urlsafe_b64decode(padded))
        created_at = datetime.fromisoformat(data["t"])
        row_id = UUID(data["i"])
    except (ValueError, KeyError, TypeError) as exc:  # binascii.Error and JSONDecodeError are ValueErrors
        raise InvalidCursor("Invalid cursor") from exc
    if created_at.tzinfo is None:  # our timestamps are always timezone-aware
        raise InvalidCursor("Invalid cursor")
    return created_at, row_id
