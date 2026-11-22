from fastapi import FastAPI
from sqlalchemy import text

from app.auth.dependencies import DBSession
from app.interview.router import interview_router

# No CORS and no sign-in routes: browsers never call this service directly.
# SkillBridge's API signs students in and calls it with the service token.
app = FastAPI(
    title="SkillBridge interview service",
    version="1.0.0",
)

app.include_router(interview_router)


@app.get("/health", tags=["ops"])
async def health(db: DBSession):
    """Checks its dependencies rather than just returning 200 — a health check
    that cannot fail tells your load balancer nothing."""
    await db.execute(text("SELECT 1"))
    return {"status": "ok"}
