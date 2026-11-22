# Agent workers

One folder per worker. Each is its own pnpm package that consumes one RabbitMQ queue,
validates every message with a schema from `@skillbridge/shared`, saves its result,
and only then acknowledges the message.

Planned, each in its own pull request with tests:

| Folder | Worker |
|---|---|
| `parser/` | Reads a resume PDF, screens out hidden text, splits it into passages |
| `evidence/` | Evidence Analyst: finds which passages prove which skill. **Built**: `pnpm worker` |
| `planner/` | Builds the learning roadmap from catalogue resources |
| `interviewer/` | Runs mock interviews and records weak topics |
| `job-scout/` | Fetches postings from company job boards and matches them |
