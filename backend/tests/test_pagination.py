import base64
import json
from datetime import datetime, timezone
from uuid import UUID, uuid4

import pytest

from app.interview.pagination import InvalidCursor, decode_cursor, encode_cursor


def _b64(obj) -> str:
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")


def test_roundtrip_keeps_exact_timestamp_and_id():
    created = datetime(2026, 10, 28, 14, 22, 5, 123456, tzinfo=timezone.utc)
    row_id = uuid4()
    assert decode_cursor(encode_cursor(created, row_id)) == (created, row_id)


def test_roundtrip_keeps_a_non_utc_offset():
    from datetime import timedelta

    created = datetime(2026, 1, 2, 3, 4, 5, 6, tzinfo=timezone(timedelta(hours=5, minutes=30)))
    decoded, _ = decode_cursor(encode_cursor(created, uuid4()))
    assert decoded == created and decoded.utcoffset() == created.utcoffset()


def test_cursor_is_url_safe_without_padding():
    cursor = encode_cursor(datetime.now(timezone.utc), uuid4())
    assert not set(cursor) & set("=+/ ")


@pytest.mark.parametrize(
    "bad",
    [
        "not-base64!!",
        "",
        "e30",  # {} : valid JSON, missing keys
        _b64([1, 2]),  # JSON list, not an object
        _b64("a string"),
        _b64({"t": "2026-10-28T10:00:00+00:00"}),  # no id
        _b64({"t": "garbage", "i": str(uuid4())}),  # bad timestamp
        _b64({"t": "2026-10-28T10:00:00+00:00", "i": "not-a-uuid"}),
        _b64({"t": 123, "i": str(uuid4())}),  # wrong type
        _b64({"t": "2026-10-28T10:00:00", "i": str(uuid4())}),  # naive timestamp
    ],
)
def test_garbage_cursors_are_rejected(bad):
    with pytest.raises(InvalidCursor):
        decode_cursor(bad)


def test_decoded_id_is_a_uuid():
    _, row_id = decode_cursor(encode_cursor(datetime.now(timezone.utc), uuid4()))
    assert isinstance(row_id, UUID)
