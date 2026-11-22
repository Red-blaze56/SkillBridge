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

Sign-up is invite-only, so create your own account with an invite link:

```bash
pnpm admin invite you@example.com
```

Open the printed link and choose a password.

## Scripts

| Command | Does |
|---|---|
| `pnpm dev` | Runs the API and web app, reloading on changes |
| `pnpm lint` | ESLint over the whole repo |
| `pnpm typecheck` | TypeScript in every package |
| `pnpm test` | Every test, with Vitest. The sign-in tests need MongoDB running (`docker compose up -d mongo`) |
| `pnpm build` | Builds the web app |
| `pnpm check` | Lint, typecheck, test and build. CI runs these on every pull request |
| `pnpm admin invite <email>` | Prints a link that lets that person create an account (works once, valid 7 days) |
| `pnpm admin reset <email>` | Prints a link that lets that person choose a new password (works once, valid 1 hour) |

## How changes get in

- `main` changes only through pull requests that pass CI and are reviewed.
- One task per branch, named `feat/<task>`, branched from the latest `main`.
- Every pull request fills in the checklist in `.github/pull_request_template.md`.

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
  `ownedBy(collection, userId)` in `apps/api/src/db/owned.ts`. It limits every query to one
  user and blocks updates that would change a document's owner.
