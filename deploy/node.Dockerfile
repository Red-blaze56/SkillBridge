# One image for the API and both workers. Node 24 runs the TypeScript directly (type
# stripping), so there is no build step: install production dependencies and go.
#   api:              node apps/api/src/server.ts
#   evidence worker:  node workers/evidence/src/main.ts
#   jobs worker:      node workers/jobs/src/main.ts
FROM node:24-slim

RUN npm install --global pnpm@12.21.0 && npm cache clean --force
WORKDIR /app

COPY . .
# --frozen-lockfile: exactly the versions CI tested, and pnpm's release-age policy still applies.
RUN pnpm install --frozen-lockfile --prod && rm -rf /root/.local/share/pnpm/store /root/.cache

ENV NODE_ENV=production
USER node
EXPOSE 4000
CMD ["node", "apps/api/src/server.ts"]
