"""Only SkillBridge's API, holding the service token, may call this service."""
import asyncio

import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.auth.dependencies import Caller, get_current_user
from app.core.config import Settings, settings
from app.main import app

GOOD = f"Bearer {settings.service_token}"


def caller(authorization: str | None, user_id: str | None) -> Caller:
    return asyncio.run(get_current_user(authorization=authorization, x_user_id=user_id))


def test_accepts_the_service_token_and_a_user_id():
    assert caller(GOOD, "665f1c2ab3d4e5f6a7b8c9d0") == Caller(id="665f1c2ab3d4e5f6a7b8c9d0")


@pytest.mark.parametrize("authorization", [
    None,
    "",
    "Bearer wrong-token",
    f"Basic {settings.service_token}",
    f"Bearer {settings.service_token}x",
])
def test_rejects_any_other_caller(authorization):
    with pytest.raises(HTTPException) as err:
        caller(authorization, "665f1c2ab3d4e5f6a7b8c9d0")
    assert err.value.status_code == 401


@pytest.mark.parametrize("user_id", [None, "", "../admin", "a" * 65, "user id with spaces"])
def test_needs_a_plain_user_id(user_id):
    with pytest.raises(HTTPException) as err:
        caller(GOOD, user_id)
    assert err.value.status_code == 400


def test_routes_refuse_requests_without_the_token():
    client = TestClient(app)
    assert client.get("/interviews").status_code == 401
    assert client.post("/interviews", json={}).status_code == 401


def test_has_no_sign_in_routes_of_its_own():
    client = TestClient(app)
    assert client.post("/auth/login", data={"username": "a", "password": "b"}).status_code == 404
    assert client.post("/auth/register", json={}).status_code == 404


def test_refuses_to_start_with_a_short_service_token():
    with pytest.raises(ValidationError):
        Settings(_env_file=None, database_url="postgresql+asyncpg://x@y/z", service_token="too-short")
