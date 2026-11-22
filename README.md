# SkillBridge

Major Project, College. A multi-agent AI career-readiness platform: a student uploads a
resume and picks a target role, and agents check their readiness, plan what to learn,
run mock interviews and match them with jobs.

This is the clean starting skeleton. Every feature arrives as a small, reviewed pull
request with tests.

## Layout

| Path | What it is |
|---|---|
| `apps/api` | Express 5 API in TypeScript. Node runs it directly, with no build step |
| `apps/web` | React + Vite frontend |
| `packages/shared` | Zod schemas shared by the API, web app and workers |
| `packages/resume` | Resume PDF parser: hidden-text screening, sections, passages |
| `packages/roles` | Target roles and their weighted skills |
| `packages/analysis` | The skill evidence agent (LangGraph + Gemini) and the readiness score |
| `packages/db` | MongoDB helpers (`ownedBy`, `createMongo`) and collections the API and workers share |
| `packages/queue` | RabbitMQ jobs: confirmed publishing, retries with growing delays, dead-letter queues |
| `packages/jobs` | Job matching: readers for 8 public job-board APIs, fresher filters, skill extraction, match scores, and the checked company list |
| `packages/roadmap` | Learning plans: a curated, link-checked catalogue of free resources and the rule-based planner |
| `workers/evidence` | Runs skill gap analyses from the queue (see `workers/README.md`) |
| `workers/jobs` | Refreshes the job postings from the company boards every 6 hours |
| `services/interview` | Mock-interview service (FastAPI + its own Postgres + Gemini), copied with its history from the AI Interview Simulator. Only SkillBridge's API can call it (see its README) |
| `compose.yaml` | MongoDB (single-node replica set), RabbitMQ, and the interview service with its Postgres |
| `compose.prod.yaml`, `deploy/` | Production on one server: Nginx in front, the API and workers in one image, nothing else exposed |

## Prerequisites

- **Node.js 24.** With fnm: `fnm install 24`. The repo's `.node-version` selects it.
- **pnpm** ([install it](https://pnpm.io/installation)). It switches itself to the version
  pinned in `package.json`.
- **Docker Desktop**, for MongoDB, RabbitMQ and the interview service.
- A **Gemini API key** for skill analyses and mock interviews ([get one](https://aistudio.google.com/apikey)).

## Run it locally

1. Copy `.env.example` to `.env` (repo root). Put in your Gemini key and generate an
   `INTERVIEW_SERVICE_TOKEN` (the command is in the file).
2. Copy `apps/api/.env.example` to `apps/api/.env`.
3. Install and start the services. The first `docker compose up` builds the interview
   service:

```bash
pnpm install
docker compose up -d
```

Then, in three terminals:

```bash
pnpm dev
pnpm worker
pnpm jobs-worker
```

The web app is at http://localhost:5173 and the API at http://localhost:4000/api/health.
`pnpm worker` runs the evidence worker; without it, analyses stay queued. `pnpm jobs-worker`
fills the job postings for matching (the first refresh takes a few minutes).

Sign-up is invite-only, so create your own account with an invite link:

```bash
pnpm admin invite you@example.com
```

Open the printed link and choose a password.

## Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Runs the API and web app, reloading on changes |
| `pnpm worker` | Runs the evidence worker, which does the skill gap analyses |
| `pnpm jobs-worker` | Runs the jobs worker, which refreshes job postings from the company boards |
| `pnpm --filter @skillbridge/roadmap check-links` | Checks every learning resource link (exits 1 if one is broken) |
| `pnpm --filter @skillbridge/jobs check-companies` | Re-checks every company board and rewrites `packages/jobs/data/companies.json` |
| `pnpm lint` | ESLint over the whole repo |
| `pnpm typecheck` | TypeScript in every package |
| `pnpm test` | Every test, with Vitest. Needs MongoDB and RabbitMQ running (`docker compose up -d mongo rabbitmq`) |
| `pnpm build` | Builds the web app |
| `pnpm check` | Lint, typecheck, test and build. CI runs these on every pull request |
| `pnpm admin invite <email>` | Prints a link that lets that person create an account (works once, valid 7 days) |
| `pnpm admin reset <email>` | Prints a link that lets that person choose a new password (works once, valid 1 hour) |

## Deploying

One server with Docker runs everything behind Nginx: see [`deploy/README.md`](deploy/README.md).
In short, fill in `deploy/.env.prod` from its example, then:

```bash
docker compose -p skillbridge -f compose.yaml -f compose.prod.yaml --env-file deploy/.env.prod up -d --build
```

## How changes get in

- For now one person integrates, committing to `main` only after `pnpm check` passes;
  CI runs the same checks on every push.
- Teammates work on a branch named `feat/<task>`, from the latest `main`, and open a pull
  request that passes CI, fills in `.github/pull_request_template.md`, and is reviewed
  before it is merged.
- One task per commit or pull request, with tests for what it changes.

## Two rules the code already enforces

- **Sign-in.** Every `/api` route except `/api/health` and `/api/auth/*` needs a signed-in
  user. SkillBridge has its own email-and-password sign-in, in `apps/api/src/auth/`:
  - passwords hashed with scrypt
  - sessions stored only as hashes and sent in an httpOnly cookie
  - the same error for a wrong email or a wrong password
  - a lock after 5 failed attempts
  - requests that change data must come from the app's own origin

  Accounts are created only through single-use invite links.
- **Personal data.** Code reaches a collection that holds personal data only through
  `ownedBy(collection, userId)` in `packages/db/src/owned.ts`. It limits every query to one
  user and blocks updates that would change a document's owner. Workers use it too: the
  evidence worker reads a resume only as the student who owns the analysis.

## Skill gap analysis

1. `GET /api/roles` lists the target roles and their skills, weighted 3 (core), 2 or 1.
2. `POST /api/analyses` with `{ resumeId, roleId }` saves a queued analysis and puts an
   `analyze` job on RabbitMQ (202). The same resume, role, prompt and model reuse the
   earlier result (200). Each student can start `ANALYSES_PER_DAY` (10) a day.
3. `workers/evidence` claims the job and asks Gemini to cite resume evidence for every
   skill: 3 = job or internship, 2 = project, 1 = only listed, 0 = absent. Code checks
   that every quote is really in the resume and caps the level by section (a skills list
   can't prove more than 1). Code, not the AI, computes the score:
   `readiness = 100 × Σ weight × (level / 3) / Σ weight`.
4. `GET /api/analyses/:id` until `status` is `done` (the score, evidence and gaps) or
   `failed` (an `error` to show). If Gemini is busy, the job is retried after 5 s, 30 s
   and 5 min first.

Deleting a resume deletes its analyses.

## Learning roadmap

`GET /api/analyses/:id/roadmap` turns a finished analysis's gaps into an ordered plan, in
code: the gaps' order (core skills first), except that a foundation that is also a gap
comes before what builds on it (JavaScript before React, Python before machine learning).
Each step has an objective, a project to do, what on the resume shows it is done, the hours
(14, 10 or 6 per level for core, important and nice-to-have skills) and resources from
`packages/roadmap/src/catalogue.ts`, a curated list of free resources. Plans refer to
resources by id, so a plan can't contain a made-up link; `check-links` re-checks them all.
The Readiness page shows the plan under the gaps, with steps a student can tick.

## Job matching

1. `workers/jobs` reads the public job-board APIs of the companies in
   `packages/jobs/data/companies.json` every 6 hours: Greenhouse, Lever, Ashby, Workable,
   SmartRecruiters, Recruitee, Breezy and Teamtailor. No scraping, no logins. Each board is
   a RabbitMQ `fetch-board` job, so a failing board is retried on its own.
2. It keeps developer jobs a fresher can apply for: a developer, SDE or intern title, in
   India or remote, asking for at most a year of experience, posted in the last 45 days.
   For each it stores the skills the ad names and the target roles it suits.
3. `GET /api/jobs/matches` scores those jobs against the student's newest finished
   analysis: `match = Σ weight × min(level, 2) ÷ 2 ÷ Σ weight` over the skills the ad names,
   so a skill used in a project is enough for a fresher job. Each match lists the skills
   the resume shows, only lists, and lacks. `?where=india|remote`, `?roleId=`,
   `?analysisId=` and `?limit=` narrow it down.

The board readers, the fresher filters, the experience parser and the first company lists
come from the jobscout tool on the `feat/jobapplier` branch (by ayoszdeep), ported to
TypeScript.
