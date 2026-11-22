import asyncio

import pytest

from app.interview import llm


def test_a_missing_api_key_is_a_clear_message_not_a_crash(monkeypatch):
    monkeypatch.setattr(llm.settings, "llm_api_key", "")
    with pytest.raises(llm.LLMUnavailable, match="GEMINI_API_KEY"):
        asyncio.run(llm._chat([{"role": "user", "content": "hi"}], {"name": "turn", "schema": {}}))
