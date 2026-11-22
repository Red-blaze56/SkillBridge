# Interview service

SkillBridge's mock-interview agent. It came from the standalone AI Interview Simulator
(its history is in this repo's `git log`).

**The backend owns the flow, the AI owns the words.** The database grounds the
interview: it keeps the state, picks topics, sets difficulty, and anchors grading
against a curated reference bank. The LLM (Gemini) phrases each question and grades
each answer. Each turn the interviewer decides whether to go deeper, correct and
re-ask, switch topic or wrap up. The state machine in `app/interview/probe.py`
keeps that decision within bounds. A final report lists strengths, weaknesses and
suggestions.

## How it fits into SkillBridge

```
Browser ─► SkillBridge API (/api/interviews/*) ─► interview service ─► Postgres
             signs the student in                 Authorization: Bearer <SERVICE_TOKEN>
                                                  X-User-Id: <SkillBridge user id>
```

- Browsers never call this service. It has no sign-in or CORS of its own and only
  accepts calls carrying the shared service token (`app/auth/dependencies.py`).
- It owns its data in its own Postgres database: interviews, messages and the
  reference bank.
- Docker Compose (repo root) builds it, runs the migrations, seeds the reference bank
  and starts it. See the root README.

## Layout

| Path | What it is |
|---|---|
| `backend/app/interview/` | The engine: `probe.py` (state machine), `bank.py` (reference bank), `llm.py` (prompts), `service.py`, `router.py` |
| `backend/alembic/` | Database migrations |
| `backend/scripts/seed_references.py` | Loads `data/common-backend-knowledge-base.txt` into the reference bank. Safe to rerun |
| `backend/scripts/fake_candidate.py` | A bot that plays a candidate through a whole interview, for testing |
| `data/` | Reference-bank source files. Only `common-backend-knowledge-base.txt` is loaded so far |

## Tests

From `backend/`:

```bash
uv sync
uv run pytest
```
