# SkillBridge

**A multi-agent AI career readiness platform.** Upload your resume, pick a target role, and SkillBridge tells you how job-ready you are, what to learn next, and which jobs you already fit.

> Major Project, College

---

## What it does

1. **Upload a PDF resume.** The text is extracted from every page.
2. **AI resume analysis.** Google Gemini turns the text into structured data: skills, projects, experience, education and certifications.
3. **Readiness score (0–100).** A deterministic formula compares your evidence against the skills your target role needs, so the same resume always gets the same score.
4. **Three AI agents run in parallel** (LangGraph):

| Agent | What you get | Powered by |
|---|---|---|
| **Skill Gap Analyzer** | Each gap ranked by severity, current vs. target level, why it matters, concrete actions, time estimate, and quick wins for this week | Gemini |
| **Job Finder** | Real job openings ranked by how much of each job's skill list your resume proves, with salary, matched and missing skills, and a link to apply | Adzuna job board (sample jobs if no key) |
| **Learning Roadmap** | A practical 7-day study plan targeting your biggest gaps | Gemini |

**Supported target roles:** Full Stack Developer, Backend Developer, Frontend Developer, AI Engineer.

---

## Architecture

```
┌──────────────── Browser ────────────────┐
│ React 19 + TypeScript (Vite, :5173)     │
│ Pages: Overview · Resume & role ·       │
│ Assessment · AI agents · Skill gaps ·   │
│ Job finder · Learning roadmap           │
└──────────────────┬──────────────────────┘
                   │ /api  (Vite proxy in development)
┌──────────────────▼──────────────────────┐
│ Express 5 API (Node + TypeScript, :5000)│
│ routes → middleware → controllers →     │
│ services → models                       │
└───┬───────────────┬──────────────┬──────┘
    │               │              │
 MongoDB      Google Gemini    Adzuna jobs API
```

### Processing pipeline

```
PDF ─► text (pdf.js) ─► AI extraction (Gemini) ─► readiness score (formula) ─► 3 agents in parallel
```

### Agent workflow (LangGraph)

```
            ┌─► Skill Gap Analyzer ─┐
   START ───┼─► Job Finder ─────────┼──► END
            └─► Learning Roadmap ───┘
```

All three agents read the same assessment and resume analysis, and each writes only its own result, so they run at the same time. A full run takes about as long as the slowest agent (around 10–15 seconds), not the sum of all three. If one agent fails, the others still return their results and the run is saved as `partial`.

---

## Tech stack

| Area | Technology |
|---|---|
| Frontend | React 19, React Router 7, TypeScript, Vite 8, lucide-react |
| Backend | Node.js, Express 5, TypeScript (tsx) |
| Database | MongoDB with Mongoose |
| AI | Google Gemini (`@google/genai`), LangGraph (`@langchain/langgraph`) |
| Jobs | Adzuna search API |
| Security | bcrypt password hashing, JWT auth, helmet, CORS, Zod validation |
| Files | multer (PDF upload, 5 MB max), pdf.js (text extraction) |

---

## Getting started

### Prerequisites

- **Node.js 22 or newer** (tested with Node 24). Using [fnm](https://github.com/Schniz/fnm): `fnm install 24` then `fnm use 24`.
- **MongoDB**, either installed locally or with Docker (see below).
- **A Gemini API key** (free): https://aistudio.google.com/apikey
- *Optional:* **Adzuna API keys** (free) for live jobs: https://developer.adzuna.com

### 1. Install dependencies

```bash
npm install
cd backend
npm install
cd ..
```

### 2. Start MongoDB

The easiest way is Docker:

```bash
docker run -d --name skillbridge-mongo -p 27017:27017 -v skillbridge-mongo-data:/data/db mongo:8.0
```

After the first time, start it with `docker start skillbridge-mongo`.

### 3. Configure the backend

```bash
cp backend/.env.example backend/.env
```

Then open `backend/.env` and fill in at least `JWT_SECRET` and `GEMINI_API_KEY`. See [Environment variables](#environment-variables) below.

### 4. Run

```bash
npm run dev
```

This starts the backend on http://localhost:5000 and the frontend on **http://localhost:5173**. Open the frontend in your browser.

> **Development mode skips login.** `npm run dev` sets `DISABLE_AUTH=true`, so you are signed in automatically as "Development User". To test real sign-up and login, run the backend and frontend separately (`cd backend && npm run dev`, and `npx vite` in the root).

**Editing while it runs:** frontend changes appear instantly, and backend code changes restart the server automatically. Changes to `backend/.env` need a restart (Ctrl+C, then `npm run dev`).

---

## Environment variables

All variables go in `backend/.env`. Copy them from [`backend/.env.example`](backend/.env.example).

| Variable | Required | Description |
|---|---|---|
| `PORT` | No | API port (default `5000`) |
| `FRONTEND_URL` | No | Allowed CORS origin (default `http://localhost:5173`) |
| `MONGODB_URI` | No | MongoDB connection string (default `mongodb://127.0.0.1:27017/skillbridge`) |
| `JWT_SECRET` | **Yes** | Secret used to sign login tokens |
| `JWT_EXPIRES_IN` | No | Token lifetime (default `7d`) |
| `GEMINI_API_KEY` | **Yes** for AI features | Google Gemini API key |
| `GEMINI_MODEL` | No | Gemini model (default `gemini-2.5-flash`) |
| `ADZUNA_APP_ID` / `ADZUNA_APP_KEY` | No | Adzuna keys for live jobs. Without them, the Job Finder uses built-in sample jobs. |
| `ADZUNA_COUNTRY` | No | Job search country code (default `in` = India) |
| `ADZUNA_LOCATION` | No | Optional city to narrow the job search |

---

## Using the app

1. **Resume & role:** upload your PDF resume and click **Upload & analyze resume**.
2. Choose a target role and click **Calculate readiness**.
3. **Assessment results:** see your score, per-skill breakdown, strengths and recommendations.
4. **AI agents:** click **Run agents**. All three agents run together and their results are saved.
5. Open **Skill gaps**, **Job finder** and **Learning roadmap** to see each agent's full output. These pages show the saved results and do not call the AI again.

---

## How the readiness score works

Each target role has a list of skills with a **weight** (the weights add up to 100) and an **expected level**. For every skill, the resume gets an **evidence level**:

| Level | Meaning |
|---|---|
| 0 | Not mentioned |
| 1 | Only listed under skills |
| 2 | Used in one project or job |
| 3 | Used in two or more projects or jobs |

`skill score = min(weight, evidence ÷ expected × weight)`, and the readiness score is the sum of all skill scores.

| Score | Level |
|---|---|
| 80–100 | Job Ready |
| 60–79 | Moderate |
| 40–59 | Developing |
| 0–39 | Needs Improvement |

Skills are matched as whole words, so "Java" is not counted as JavaScript and "digital" is not counted as Git. The role skill lists live in [`backend/src/config/roleConfig.ts`](backend/src/config/roleConfig.ts).

---

## API reference

All endpoints are under `/api`. Every endpoint except health, signup and login needs an `Authorization: Bearer <token>` header (unless auth is disabled in development).

| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/health` | Server and database status |
| POST | `/api/auth/signup` | Create an account |
| POST | `/api/auth/login` | Log in and receive a token |
| GET | `/api/auth/me` | Current user |
| POST | `/api/resumes/upload` | Upload a PDF (form field `resume`) |
| GET | `/api/resumes` | List your resumes |
| GET | `/api/resumes/:id` | One resume |
| DELETE | `/api/resumes/:id` | Delete a resume |
| POST | `/api/resumes/:id/analyze` | Run the AI analysis (cached after the first run) |
| POST | `/api/resumes/:id/reanalyze` | Force a fresh AI analysis |
| GET | `/api/resumes/:id/analysis` | Analysis status and result |
| POST | `/api/assessment` | Create an assessment: `{ resumeId, targetRole }` |
| GET | `/api/assessment/history` | Your past assessments |
| GET | `/api/assessment/:id` | One assessment |
| POST | `/api/assessment/:id/agents` | Run the three agents in parallel and save the result |
| GET | `/api/assessment/:id/agents` | Latest saved agent results (no AI call) |

---

## Project structure

```
SkillBridge/
├── src/                      # React frontend
│   ├── App.tsx               # All pages and components
│   ├── App.css, index.css    # Styles
│   └── services/             # API client (api.ts) and one file per feature
├── backend/
│   ├── .env.example          # Settings template (copy to .env)
│   └── src/
│       ├── server.ts, app.ts # Startup and Express setup
│       ├── routes/           # URL → controller
│       ├── middleware/       # Auth, database check, file upload, errors
│       ├── controllers/      # HTTP request/response handling
│       ├── services/         # Business logic: PDF, Gemini, scoring, agents, Adzuna
│       ├── models/           # MongoDB schemas
│       ├── validators/       # Zod schemas for input and AI output
│       ├── utils/            # Skill matching helpers
│       ├── types/            # Shared TypeScript types
│       └── config/           # Env, role skills, sample jobs
├── server/dev.mjs            # Starts frontend and backend together
└── vite.config.ts            # Proxies /api to the backend
```

Key files for the agents:
- [`backend/src/services/agentWorkflowService.ts`](backend/src/services/agentWorkflowService.ts): the LangGraph workflow
- [`backend/src/services/agentServices.ts`](backend/src/services/agentServices.ts): the three agents
- [`backend/src/services/adzunaService.ts`](backend/src/services/adzunaService.ts): job board client

---

## Scripts

| Where | Command | What it does |
|---|---|---|
| root | `npm run dev` | Start frontend and backend together (login disabled) |
| root | `npm run build` | Type-check and build the frontend into `dist/` |
| root | `npm run lint` | Lint the frontend with oxlint |
| backend | `npm run dev` | Start only the API, restarting on code changes |
| backend | `npm run build` | Compile the API into `backend/dist/` |
| backend | `npm start` | Run the compiled API |

---

## Troubleshooting

| Problem | Fix |
|---|---|
| "Database is unavailable" | Start MongoDB (`docker start skillbridge-mongo`) and check `MONGODB_URI`. |
| "AI analysis is not configured" | Add `GEMINI_API_KEY` to `backend/.env` and restart. |
| Job Finder shows "sample jobs" | Add `ADZUNA_APP_ID` and `ADZUNA_APP_KEY` to `backend/.env`, restart, and run the agents again. |
| "PDF does not contain readable text" | The PDF is a scanned image. Export it from Word or Google Docs as a text PDF. |
| `EADDRINUSE` / port in use | Another copy is running. Stop it with Ctrl+C. |
| `node` not found after installing with fnm | Add fnm to your shell profile: https://github.com/Schniz/fnm#shell-setup |

---

## Known limitations

- Resume files are stored on the local disk (`backend/uploads/resumes/`).
- AI calls run inside the HTTP request (10–15 seconds) rather than in a background job queue.
- The current resume and assessment are remembered in the browser (`localStorage`).
- There are no automated tests yet.
