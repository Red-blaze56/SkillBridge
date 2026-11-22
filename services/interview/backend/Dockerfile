# Built by the repo-root compose.yaml, with services/interview as the build context.
FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.11.17 /uv /uvx /bin/

# Run as an ordinary user, not root.
RUN useradd --system --create-home --uid 10001 app \
 && mkdir -p /app/backend \
 && chown -R app /app
USER app
WORKDIR /app/backend

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_NO_CACHE=1 \
    UV_PYTHON_DOWNLOADS=never \
    PYTHONUNBUFFERED=1 \
    PATH="/app/backend/.venv/bin:$PATH"

# Dependencies first, so a code change doesn't reinstall them.
COPY --chown=app backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --locked --no-dev --no-install-project

COPY --chown=app backend/ ./
COPY --chown=app data/ /app/data/
RUN uv sync --locked --no-dev

EXPOSE 8000
HEALTHCHECK --interval=10s --timeout=5s --start-period=30s --retries=5 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4)"]

# Bring the database up to date, reload the reference bank (safe to repeat), then serve.
CMD ["sh", "-c", "alembic upgrade head && python scripts/seed_references.py && exec uvicorn app.main:app --host 0.0.0.0 --port 8000"]
