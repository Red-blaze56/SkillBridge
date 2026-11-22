# The web app, built with Vite and served by Nginx, which also proxies /api to the API.
FROM node:24-slim AS build
RUN npm install --global pnpm@12.21.0
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @skillbridge/web build

FROM nginx:1.27-alpine
# The official image fills in ${…} environment variables in templates at start-up
# (CLIENT_IP, FORWARDED_PROTO) and leaves Nginx's own $variables alone.
COPY deploy/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
