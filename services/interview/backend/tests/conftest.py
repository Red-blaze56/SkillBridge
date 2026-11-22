"""Settings are read when `app` is imported, so give tests safe values first.
Nothing here connects to a database or to Gemini."""
import os

os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://test:test@127.0.0.1:1/test")
os.environ.setdefault("SERVICE_TOKEN", "test-service-token-0123456789abcdef")
os.environ.setdefault("LLM_API_KEY", "")
