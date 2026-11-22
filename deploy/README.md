# Deploying SkillBridge

Everything runs on one Linux server with Docker, from this repository:

```
 student ──HTTPS──► [Cloudflare Tunnel] ──► web (Nginx: the web app, /api → api)
                                                  │
                     api (Express) ◄──────────────┘
                       │  ├──► mongo         (no published port)
                       │  ├──► rabbitmq      (no published port) ◄── evidence-worker, jobs-worker
                       │  └──► interview     (no published port) ──► interview-db
```

- `deploy/node.Dockerfile` builds one image for the API and both workers. Node 24 runs the
  TypeScript directly, so there is no build step; dependencies are the locked ones.
- `deploy/web.Dockerfile` builds the web app and serves it with Nginx
  (`deploy/nginx/default.conf.template`):
  - `/api` is proxied to the API
  - the upload limit is 11 MB, and API requests may take up to 100 s (interview answers)
  - gzip, and long caching for hashed assets
  - a strict Content-Security-Policy and the usual security headers.
- `compose.prod.yaml` layers on `compose.yaml`:
  - only Nginx publishes a port
  - MongoDB, RabbitMQ, Postgres and the interview service are reachable only on Docker's network
  - every service restarts by itself
  - the API runs with `NODE_ENV=production` (HTTPS-only cookies) and trusts exactly one proxy.
- `compose.tunnel.yaml` (optional) adds HTTPS through a Cloudflare Tunnel and closes Nginx's port.

MongoDB runs without a password because nothing outside Docker can reach it. If you ever
publish its port, turn on authentication first.

## First deploy

1. A server with Docker (Compose v2.24 or newer) and at least **4 GB of RAM**. Mongo,
   RabbitMQ, Postgres, the Python interview service, the API and two workers together use
   about 2 GB.
2. Clone the repository, then `cp deploy/.env.prod.example deploy/.env.prod` and fill it in.
   The file explains each value; generate the secrets as it shows.
3. Start everything:
   ```bash
   docker compose -p skillbridge -f compose.yaml -f compose.prod.yaml --env-file deploy/.env.prod up -d --build
   ```
   With HTTPS through Cloudflare (see below), add `-f compose.tunnel.yaml` after `compose.prod.yaml`.
4. Create your own account. This prints a single-use invite link for `APP_ORIGIN`:
   ```bash
   docker compose -p skillbridge exec api node apps/api/src/admin.ts invite you@example.com
   ```
5. Open the link, choose a password, upload a resume, run a readiness check.
   - Job postings appear a few minutes after the first start, when the jobs worker has read the company boards.
   - The boards are read again every 6 hours.

Every later command uses the same `-p skillbridge -f compose.yaml -f compose.prod.yaml
[-f compose.tunnel.yaml] --env-file deploy/.env.prod`. Below, `dc` stands for all of that.

## HTTPS

Session cookies are HTTPS-only in production, so students must reach the site over HTTPS.
Browsers make one exception: plain `http://localhost` works for testing.

**Cloudflare Tunnel (recommended, free):** the server needs no open ports and no certificate.
1. Put a domain on Cloudflare (free plan).
2. In Zero Trust → Networks → Tunnels, create a tunnel. Copy its token into `TUNNEL_TOKEN`.
3. Add a public hostname (e.g. `skillbridge.example.com`) pointing to `http://web:80`.
4. Set `APP_ORIGIN=https://skillbridge.example.com`.
5. Start with `-f compose.tunnel.yaml` added.

Nginx then trusts Cloudflare's `CF-Connecting-IP` for the visitor's address. That is safe
only because the tunnel is the only way in, which is why this file closes Nginx's port.

**Without Cloudflare:** put any TLS proxy you trust in front of Nginx's port, such as Caddy
on the host or a cloud load balancer. Make it set `X-Forwarded-For`, and change
`CLIENT_IP` in `compose.prod.yaml` to `$$http_x_forwarded_for`. Otherwise every student
appears to come from the proxy, and the sign-in limit (20 tries per address in 15 minutes)
applies to everyone at once.

## Running it

- **Logs:** `dc logs -f api evidence-worker jobs-worker`.
- **Update:**
  ```bash
  git pull
  dc up -d --build
  ```
  Data lives in the `mongo-data` and `interview-data` volumes, which survive rebuilds.
- **Backups:**
  ```bash
  dc exec -T mongo mongodump --archive --gzip --db skillbridge > skillbridge-$(date +%F).gz
  dc exec -T interview-db pg_dump -U interview interview | gzip > interview-$(date +%F).sql.gz
  ```
  To restore, run `mongorestore --archive --gzip` the same way. Keep copies off the server.
- **Reset a password:** `dc exec api node apps/api/src/admin.ts reset you@example.com`.
- **Re-check the company boards** (they change over time):
  `pnpm --filter @skillbridge/jobs check-companies` on a development machine, then commit
  `packages/jobs/data/companies.json` and deploy.

## Gemini limits

A free Gemini key allows about 20 requests a day per model, and a readiness check uses 2–4.
When the day's quota is used up, analyses fail at once with a message saying so. Mock
interviews are limited the same way. For more than a handful of students a day, turn on
billing for the key; Flash models cost a fraction of a cent per analysis.

## Where to host

All need Docker on Linux. Prices and free tiers change; check them before you sign up.

| Option | Cost | Notes |
|---|---|---|
| Oracle Cloud "Always Free" Ampere VM | Free | Up to 4 ARM cores and 24 GB RAM, plenty. Every image used here has an arm64 build. Sign-up needs a card, and free capacity is sometimes unavailable in a region. |
| A small VPS (Hetzner, DigitalOcean, etc.) with 4 GB RAM | About $5–25 a month | The simplest. The GitHub Student Developer Pack has included hosting credit (e.g. DigitalOcean); check what it offers now. |
| Azure for Students | Free credit | No card needed with a student email. A B2s VM (2 cores, 4 GB) fits; watch the credit. |

A 1 GB "free tier" VM (e.g. AWS t2.micro, Google e2-micro) is too small for this stack.
