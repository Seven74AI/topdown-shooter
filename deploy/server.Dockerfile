# Story 2.2: one multi-stage file, build context = repo root.
#   docker build -f deploy/server.Dockerfile --target server .   -> game server (Node 26 + tsx)
#   docker build -f deploy/server.Dockerfile --target web .      -> Caddy with the client build
# Node 26 matches .nvmrc and CI.

FROM node:26-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY apps/client/package.json apps/client/
COPY apps/server/package.json apps/server/
COPY packages/shared/package.json packages/shared/
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
# Builds the client into apps/client/dist (base "/", served at the site root).
RUN npm run build

FROM caddy:2.11-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/client/dist /srv/client
EXPOSE 8080

FROM node:26-alpine AS server
ENV NODE_ENV=production
WORKDIR /app
# node_modules included; trimming dev dependencies is an Epic 10 concern. Files stay root-owned
# and read-only for the node user.
COPY --from=build /app /app
USER node
EXPOSE 2567
# tsx: the sources use extensionless ESM imports (bundler resolution), which Node's own type
# stripping can't load.
CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]
