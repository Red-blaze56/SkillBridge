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
| `workers/` | One folder per agent worker (none yet, see `workers/README.md`) |
| `compose.yaml` | MongoDB (single-node replica set) and RabbitMQ for local development |

## Prerequisites

- **Node.js 24.** With fnm: `fnm install 24`. The repo's `.node-version` selects it.
- **pnpm** ([install it](https://pnpm.io/installation)). It switches itself to the version
  pinned in `package.json`.
- **Docker Desktop**, for MongoDB and RabbitMQ.

## Run it locally

```bash
pnpm install
docker compose up -d
```

Copy `apps/api/.env.example` to `apps/api/.env`, then:

```bash
pnpm dev
```

The web app is at http://localhost:5173 and the API at http://localhost:4000/api/health.

## Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Runs the API and web app, reloading on changes |
| `pnpm lint` | ESLint over the whole repo |
| `pnpm typecheck` | TypeScript in every package |
| `pnpm test` | Every test, with Vitest |
| `pnpm build` | Builds the web app |
| `pnpm check` | All four checks above. CI runs them on every pull request |

## How changes get in

- `main` changes only through pull requests that pass CI and are reviewed.
- One task per branch, named `feat/<task>`, branched from the latest `main`.
- Every pull request fills in the checklist in `.github/pull_request_template.md`.

## Two rules the code already enforces

- **Sign-in.** Every `/api` route except `/api/health` needs a signed-in user. Locally that's
  a fixed test user (`devAuth`). Until Firebase sign-in lands, the API refuses to start
  unless `NODE_ENV` is `development`.
- **Personal data.** Code reaches a collection that holds personal data only through
  `ownedBy(collection, userId)` in `apps/api/src/db/owned.ts`. It limits every query to one
  user and blocks updates that would change a document's owner.
