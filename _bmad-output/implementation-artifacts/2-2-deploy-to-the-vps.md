# Story 2.2: Deploy to the VPS

Status: ready-for-dev

<!-- Split story: the dev agent writes and tests the files in the repo; the deploy itself runs ON the VPS (by Hermes or the designer), because the cloud dev container cannot reach the VPS. -->

## Story

As the designer,
I want the game running on my server under my subdomain with HTTPS,
so that my friends and I can test online co-op on real phones over 4G.

## Acceptance Criteria

1. **Stack.** `deploy/docker-compose.yml`, `deploy/Caddyfile` and `deploy/server.Dockerfile` start a stack on the VPS. It serves the client build and the game server at **https://hordes.sevend.io**, with HTTPS and WSS. `index.html` is served with no-cache, and hashed assets with a long cache.
2. **Origin check.** A WebSocket connection whose `Origin` is not the game's subdomain is refused.
3. **Room creation limit.** When one IP creates more than 10 rooms per minute, further creations are refused with a short message.
4. **Deploy and docs.** After a merge to `master` with CI green, a documented deploy command rebuilds and restarts the stack. `docs/deploy.md` explains setup, deploy and rollback.
5. **Graceful shutdown.** On stop or redeploy, the server shuts down gracefully: rooms are closed with a "Server restarting" message.

## Tasks / Subtasks

- [ ] **Task 1 (dev): Origin check** (AC 2)
  - [ ] In `apps/server/src/app.ts`, give the `WebSocketTransport` a `beforeUpgrade(request, ctx)`. It returns `new Response("Forbidden", { status: 403 })` unless `originAllowed(ctx.headers.get("origin"), allowedOrigins)`.
  - [ ] `allowedOrigins` comes from env `PUBLIC_ORIGIN` (comma-separated, e.g. `https://hordes.sevend.io`).
  - [ ] Unset (dev): allow all and log `warn` "origin_check_disabled" once at start.
  - [ ] Set: a missing `Origin` is refused too. Browsers always send it; Node bots must set it.
  - [ ] Put the pure function in `apps/server/src/net/origin.ts` with tests: exact match, a trailing slash, another scheme, another port, `null`/missing, and a case difference in the host.
- [ ] **Task 2 (dev): Creation rate limit** (AC 3)
  - [ ] `apps/server/src/net/rateLimit.ts`: a sliding-window limiter keyed by IP (10 per 60 s, server clock, old entries pruned on each call). Unit-tested with an injected clock.
  - [ ] In `RunRoom.onAuth`, when `options.intent === "create"`: if `!createLimiter.allow(ctx.ip ?? "unknown")`, throw `new ServerError(526, "rate_limited")`. The client already maps it, in `joinErrors.ts` from 2.1.
  - [ ] Log `warn` `room_create_rate_limited` with the IP. Hashing or masking the IP is not needed for a friends-only game; keep the full IP.
- [ ] **Task 3 (dev): Real client IP behind the tunnel** (AC 3)
  - [ ] Colyseus resolves `ctx.ip` from `X-Real-IP`, then `X-Forwarded-For`, then `X-Client-IP`, then the socket.
  - [ ] Behind Cloudflare Tunnel → Caddy, the socket peer is cloudflared. The Caddyfile therefore sets `header_up X-Real-IP {http.request.header.Cf-Connecting-Ip}`.
  - [ ] This is safe because Caddy only listens on 127.0.0.1, where only cloudflared can reach it.
  - [ ] Add an integration test: a request with `X-Real-IP: 1.2.3.4` makes 11 creates; the 11th is refused, and another IP is still allowed.
- [ ] **Task 4 (dev): Graceful shutdown** (AC 5)
  - [ ] Override `RunRoom.onBeforeShutdown()`: broadcast `S2C.SERVER_SHUTDOWN_STARTED` `{ message: "Server restarting" }`, then `this.disconnect(CloseCode.SERVER_SHUTDOWN)` (4001).
  - [ ] Client: on that message, or on a leave with code 4001, show a dialog "Server restarting. Try again in a moment." with **Back to start**.
  - [ ] Saving rooms on shutdown is Epic 8 (autosave), not this story.
  - [ ] Test: call `server.gracefullyShutdown(false)` with a connected test client. The client receives the message, and its leave code is 4001.
- [ ] **Task 5 (dev): Container files** (AC 1). Write `deploy/server.Dockerfile`, `deploy/docker-compose.yml`, the new `deploy/Caddyfile` and the root `.dockerignore`. See Dev Notes › Stack.
- [ ] **Task 6 (dev): Deploy script** (AC 4)
  - [ ] `deploy/deploy.sh [git-ref]`, with `set -euo pipefail`, run on the VPS from the repo checkout:
    - `git fetch origin`;
    - check out the ref (default `origin/master`) as a detached HEAD and record `GIT_SHA`;
    - `docker compose -f deploy/docker-compose.yml build`;
    - `GIT_SHA=… docker compose … up -d`;
    - wait up to 30 s for `curl -fsS http://127.0.0.1:8080/api/health`;
    - print the sha.
  - [ ] Images are tagged `topdown-server:<sha>` and `topdown-web:<sha>`. A rollback is `deploy/deploy.sh <previous-sha>`.
  - [ ] Keep the last 5 image tags (`docker image prune` with a filter, or a small loop), so the 23 GB disk doesn't fill.
- [ ] **Task 7 (dev): CI** (AC 4)
  - [ ] In `.github/workflows/ci.yml`, add a job `docker` (`needs: check`) that runs `docker build -f deploy/server.Dockerfile --target server .` and the same with `--target web`. It builds only and pushes nothing.
  - [ ] **Remove the GitHub Pages upload and deploy** (`upload-pages-artifact` step and the `deploy` job) and the `BASE_PATH` env. Pages cannot run the game server, and the epic says the VPS replaces the Pages link.
  - [ ] Keep `BASE_PATH` support in `vite.config.ts` (harmless).
  - [ ] Mention in `docs/deploy.md` that the Pages site can be disabled in the repo settings (designer).
- [ ] **Task 8 (dev): `docs/deploy.md`** (AC 4): the current setup (see Dev Notes › What already runs on the VPS), first-time setup, deploy, rollback, logs (`docker compose logs -f server`), health URL, and the human checklist from Task 9.
- [ ] **Task 9 (human, on the VPS: Hermes or the designer): Go live** (AC 1, 4). The cloud container has no access to the VPS, so this task is done there. Follow `docs/deploy.md`:
  - [ ] Record the current setup: `systemctl cat topdown-shooter.service`, and the cloudflared tunnel config for `sevend-io-stream`.
  - [ ] Check Docker: `docker compose version`. If Docker is missing, **ask the designer** before installing it (see Dev Notes › Fallback).
  - [ ] `cd /root/topdown-shooter && git fetch && git checkout master && git pull --ff-only`.
  - [ ] Stop and disable the old static service: `systemctl disable --now topdown-shooter.service`. It holds port 8080.
  - [ ] Run `deploy/deploy.sh`.
  - [ ] Verify:
    - https://hordes.sevend.io/ loads;
    - https://hordes.sevend.io/api/health returns 200;
    - two browsers can create and join a room;
    - `curl -I https://hordes.sevend.io/` shows `Cache-Control: no-cache`;
    - an `/assets/*.js` file shows `max-age=31536000, immutable`.
  - [ ] Paste the results into the Completion Notes.
  - [ ] If anything fails: `docker compose down`, then `systemctl enable --now topdown-shooter.service` brings back the static site.

## Dev Notes

### What already runs on the VPS (build on it, don't replace it blindly)

- https://hordes.sevend.io is live (Story 1.1). Cloudflare Tunnel `sevend-io-stream` sends `hordes.sevend.io` to `http://localhost:8080`.
- Port 8080 is served by Caddy, started by systemd `topdown-shooter.service`, with the repo's `deploy/Caddyfile`:

  ```
  :8080 { bind 127.0.0.1; root * /root/topdown-shooter/apps/client/dist; encode gzip; file_server }
  ```

  The repo is checked out at `/root/topdown-shooter`.
- **HTTPS and WSS are terminated by Cloudflare at the edge** (edge certificate, automatic), not by Caddy. Keep it that way: no inbound ports, and no ACME on the VPS.
  - Caddy stays plain HTTP on 127.0.0.1:8080, so `auto_https off`.
  - This is a variance from the AC's "Caddy terminates HTTPS with automatic certificates": the user-visible result is the same (HTTPS/WSS only, automatic certificates). Record the variance.
  - Cloudflare proxies WebSockets through tunnels by default.
- The VPS also hosts the Hermes agent: only touch our service, port 8080 and our containers.

### Stack

- **Routing (decided in 2.1):** the browser talks to the game server at `/api` on the same origin. The SDK URL is `https://hordes.sevend.io/api`: matchmaking at `/api/matchmake/*`, WebSocket at `wss://…/api/<processId>/<roomId>`. Caddy strips `/api` and proxies to `server:2567`. No CORS is needed.
- `deploy/Caddyfile`:

  ```caddyfile
  {
  	admin off
  	auto_https off
  }
  :8080 {
  	handle_path /api/* {
  		reverse_proxy server:2567 {
  			header_up X-Real-IP {http.request.header.Cf-Connecting-Ip}
  		}
  	}
  	encode zstd gzip
  	handle /assets/* {
  		root * /srv/client
  		header Cache-Control "public, max-age=31536000, immutable"
  		file_server
  	}
  	handle {
  		root * /srv/client
  		header Cache-Control "no-cache"
  		try_files {path} /index.html
  		file_server
  	}
  }
  ```

  - `try_files … /index.html` makes share links `/j/<code>` load the app.
  - Vite puts hashed files under `/assets/`. A missing asset must return 404. It must never fall back to `index.html` with an immutable cache header, which would break the next deploy for that phone. That is why assets have their own `handle`, without `try_files`.
  - There is a trap for later: files in `apps/client/public/assets/` (planned atlases and audio) are copied to `/assets/` **without** a hash, so they would get the immutable cache too. The folder is empty today. Add a comment in the Caddyfile saying that unhashed public files must live outside `/assets/` (for example `/static/`), or be imported so Vite hashes them.
  - Verify the Caddyfile with `docker run --rm -v $PWD/deploy/Caddyfile:/etc/caddy/Caddyfile caddy:2.11-alpine caddy validate --config /etc/caddy/Caddyfile` where Docker is available. Otherwise review it carefully: the cloud container may not have Docker.
- `deploy/server.Dockerfile` (multi-stage, build context = repo root):
  - `deps` stage: `node:26-alpine`. Copy `package.json`, `package-lock.json`, `.npmrc` and every workspace `package.json`, then `npm ci`.
  - `build` stage: copy the source, then `npm run build` (client).
  - `web` stage: `caddy:2.11-alpine`. Copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile` and the client `dist` to `/srv/client`.
  - `server` stage: `node:26-alpine`, `ENV NODE_ENV=production`. Copy `/app` from `build` (node_modules included; trimming dev dependencies is an Epic 10 concern). Then `USER node`, `EXPOSE 2567`, `CMD ["node", "--import", "tsx", "apps/server/src/index.ts"]`.
  - tsx is needed because the sources use extensionless ESM imports (bundler resolution), which plain Node type stripping can't load.
- `deploy/docker-compose.yml` (project name `topdown`):
  - `server`:
    - `build: { context: .., dockerfile: deploy/server.Dockerfile, target: server }` and `image: topdown-server:${GIT_SHA:-dev}`;
    - `restart: unless-stopped`, `init: true` (signals reach Node), `stop_grace_period: 20s`;
    - env `PORT=2567`, `PUBLIC_ORIGIN=https://hordes.sevend.io`, `LOG_LEVEL=info`;
    - `expose: ["2567"]`, never published to the host;
    - a healthcheck with `wget -qO- http://127.0.0.1:2567/health`;
    - logging driver `json-file` with `max-size: 10m`, `max-file: 5` (architecture: logs rotated).
  - `web`:
    - the same build with `target: web`, and `image: topdown-web:${GIT_SHA:-dev}`;
    - `ports: ["127.0.0.1:8080:8080"]`, which keeps the tunnel config unchanged;
    - `depends_on: server (service_healthy)`, `restart: unless-stopped`.
  - PostgreSQL joins in Epic 7 (Story 7.1). Don't add it now.
- `.dockerignore`: `node_modules`, `**/dist`, `.git`, `_bmad`, `_bmad-output`, `.claude`, `docs`.

### Fallback (only if the designer refuses Docker on the VPS)

Keep the systemd Caddy and add a `topdown-server.service` that runs `node --import tsx apps/server/src/index.ts` on `127.0.0.1:2567` with `NODE_ENV=production`. The host Caddyfile then proxies `/api` to `127.0.0.1:2567`, with the same headers and `try_files`. Write it into `docs/deploy.md` as plan B. Don't implement both.

### Out of scope

- Postgres and nightly backups (Epic 7).
- Autosave on shutdown (Epic 8).
- A CI job that deploys over SSH: there is no deploy key. Deploys run on the VPS (HANDOFF § 4). A self-hosted runner or a polling timer can come later.
- Disabling Pages in GitHub settings (designer).

### Previous story intelligence

- Story 1.1 deliberately kept Vite `base` at `/` for the VPS and noted that `./` would break `/j/<code>` asset paths. Keep `base: "/"`.
- `.nvmrc` is 26. CI uses `node-version-file`. The Docker images must use Node 26 too.

### Project Structure Notes

- New:
  - `deploy/{docker-compose.yml, server.Dockerfile, deploy.sh}`, `.dockerignore`, `docs/deploy.md`
  - `apps/server/src/net/{origin.ts, origin.test.ts, rateLimit.ts, rateLimit.test.ts}`
  - `apps/client/src/ui/ServerNotice.tsx`, or a case inside an existing dialog
- Modified: `deploy/Caddyfile` (rewritten), `apps/server/src/app.ts`, `apps/server/src/rooms/RunRoom.ts`, `.github/workflows/ci.yml`, `apps/client/src/net/connection.ts`

### References

- [Source: epics.md#Story 2.2: Deploy to the VPS]
- [Source: game-architecture.md#Security and Operations] (Origin check, rate limits, deploys, no-cache index), [#Engine & Framework › Selected Stack] (Caddy 2.11, Node 26), [#Logging] (stdout, rotated)
- [Source: HANDOFF.md#3 Key decisions] (Hosting: tunnel, systemd service, Caddyfile), [#4 Open items] (deploy runs from Hermes)
- [Source: 1-1-project-scaffold-with-a-playable-link.md#Change Log] (VPS static deploy)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Human step: Task 9 runs on the VPS (Hermes or the designer). The dev agent sets the status to `review` with "waiting for VPS deploy" until the designer reports the verification results.

### File List
