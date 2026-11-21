---
baseline_commit: a6d6b123cbc23e07c8c28dac13d992d6f6ab333a
---
# Story 2.2: Deploy to the VPS

Status: review

<!-- Split story: the dev agent writes and tests the files in the repo; the deploy itself runs ON the VPS (by Hermes or the designer), because the cloud dev container cannot reach the VPS. -->

## Story

As the designer,
I want the game running on my server under my subdomain with HTTPS,
so that my friends and I can test online co-op on real phones over 4G.


> **Designer decisions (2026-11-21):** Docker is installed on the VPS (use Docker Compose; the systemd fallback is not needed). HTTPS/WSS stays on the Cloudflare Tunnel's edge certificates; Caddy is plain HTTP on 127.0.0.1:8080 behind it. The downed countdown pauses during a revive (Story 2.8). The in-run menu pauses solo practice; online it keeps running (Story 2.11).

## Acceptance Criteria

1. **Stack.** `deploy/docker-compose.yml`, `deploy/Caddyfile` and `deploy/server.Dockerfile` start a stack on the VPS. It serves the client build and the game server at **https://hordes.sevend.io**, with HTTPS and WSS. `index.html` is served with no-cache, and hashed assets with a long cache.
2. **Origin check.** A WebSocket connection whose `Origin` is not the game's subdomain is refused.
3. **Room creation limit.** When one IP creates more than 10 rooms per minute, further creations are refused with a short message.
4. **Deploy and docs.** After a merge to `master` with CI green, a documented deploy command rebuilds and restarts the stack. `docs/deploy.md` explains setup, deploy and rollback.
5. **Graceful shutdown.** On stop or redeploy, the server shuts down gracefully: rooms are closed with a "Server restarting" message.

## Tasks / Subtasks

- [x] **Task 1 (dev): Origin check** (AC 2)
  - [x] In `apps/server/src/app.ts`, give the `WebSocketTransport` a `beforeUpgrade(request, ctx)`. It returns `new Response("Forbidden", { status: 403 })` unless `originAllowed(ctx.headers.get("origin"), allowedOrigins)`.
  - [x] `allowedOrigins` comes from env `PUBLIC_ORIGIN` (comma-separated, e.g. `https://hordes.sevend.io`).
  - [x] Unset (dev): allow all and log `warn` "origin_check_disabled" once at start.
  - [x] Set: a missing `Origin` is refused too. Browsers always send it; Node bots must set it.
  - [x] Put the pure function in `apps/server/src/net/origin.ts` with tests: exact match, a trailing slash, another scheme, another port, `null`/missing, and a case difference in the host.
- [x] **Task 2 (dev): Creation rate limit** (AC 3)
  - [x] `apps/server/src/net/rateLimit.ts`: a sliding-window limiter keyed by IP (10 per 60 s, server clock, old entries pruned on each call). Unit-tested with an injected clock.
  - [x] In `RunRoom.onAuth`, when `options.intent === "create"`: if `!createLimiter.allow(ctx.ip ?? "unknown")`, throw `new ServerError(526, "rate_limited")`. The client already maps it, in `joinErrors.ts` from 2.1.
  - [x] Log `warn` `room_create_rate_limited` with the IP. Hashing or masking the IP is not needed for a friends-only game; keep the full IP.
- [x] **Task 3 (dev): Real client IP behind the tunnel** (AC 3)
  - [x] Colyseus resolves `ctx.ip` from `X-Real-IP`, then `X-Forwarded-For`, then `X-Client-IP`, then the socket.
  - [x] Behind Cloudflare Tunnel → Caddy, the socket peer is cloudflared. The Caddyfile therefore sets `header_up X-Real-IP {http.request.header.Cf-Connecting-Ip}`.
  - [x] This is safe because Caddy only listens on 127.0.0.1, where only cloudflared can reach it.
  - [x] Add an integration test: a request with `X-Real-IP: 1.2.3.4` makes 11 creates; the 11th is refused, and another IP is still allowed.
- [x] **Task 4 (dev): Graceful shutdown** (AC 5)
  - [x] Override `RunRoom.onBeforeShutdown()`: broadcast `S2C.SERVER_SHUTDOWN_STARTED` `{ message: "Server restarting" }`, then `this.disconnect(CloseCode.SERVER_SHUTDOWN)` (4001).
  - [x] Client: on that message, or on a leave with code 4001, show a dialog "Server restarting. Try again in a moment." with **Back to start**.
  - [x] Saving rooms on shutdown is Epic 8 (autosave), not this story.
  - [x] Test: call `server.gracefullyShutdown(false)` with a connected test client. The client receives the message, and its leave code is 4001.
- [x] **Task 5 (dev): Container files** (AC 1). Write `deploy/server.Dockerfile`, `deploy/docker-compose.yml`, the new `deploy/Caddyfile` and the root `.dockerignore`. See Dev Notes › Stack.
- [x] **Task 6 (dev): Deploy script** (AC 4)
  - [x] `deploy/deploy.sh [git-ref]`, with `set -euo pipefail`, run on the VPS from the repo checkout:
    - `git fetch origin`;
    - check out the ref (default `origin/master`) as a detached HEAD and record `GIT_SHA`;
    - `docker compose -f deploy/docker-compose.yml build`;
    - `GIT_SHA=… docker compose … up -d`;
    - wait up to 30 s for `curl -fsS http://127.0.0.1:8080/api/health`;
    - print the sha.
  - [x] Images are tagged `topdown-server:<sha>` and `topdown-web:<sha>`. A rollback is `deploy/deploy.sh <previous-sha>`.
  - [x] Keep the last 5 image tags (`docker image prune` with a filter, or a small loop), so the 23 GB disk doesn't fill.
- [x] **Task 7 (dev): CI** (AC 4)
  - [x] In `.github/workflows/ci.yml`, add a job `docker` (`needs: check`) that runs `docker build -f deploy/server.Dockerfile --target server .` and the same with `--target web`. It builds only and pushes nothing.
  - [x] **Remove the GitHub Pages upload and deploy** (`upload-pages-artifact` step and the `deploy` job) and the `BASE_PATH` env. Pages cannot run the game server, and the epic says the VPS replaces the Pages link.
  - [x] Keep `BASE_PATH` support in `vite.config.ts` (harmless).
  - [x] Mention in `docs/deploy.md` that the Pages site can be disabled in the repo settings (designer).
- [x] **Task 8 (dev): `docs/deploy.md`** (AC 4): the current setup (see Dev Notes › What already runs on the VPS), first-time setup, deploy, rollback, logs (`docker compose logs -f server`), health URL, and the human checklist from Task 9.
- [ ] **Task 9 (human, on the VPS: Hermes or the designer): Go live** (AC 1, 4). The cloud container has no access to the VPS, so this task is done there. Follow `docs/deploy.md`:
  - [ ] Record the current setup: `systemctl cat topdown-shooter.service`, and the cloudflared tunnel config for `sevend-io-stream`.
  - [ ] Check Docker: `docker compose version` (the designer confirmed Docker is installed on the VPS).
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

claude-opus-5-5 via gds-dev-story

### Debug Log References

- Docker 29.10 / Compose v5.7 were installed in the dev container but the daemon was not running; `dockerd` was started by hand. `docker build` then failed at `npm ci` with `SELF_SIGNED_CERT_IN_CHAIN`, because the sandbox intercepts TLS with its own CA. For local verification only, the images were built from a scratch copy of `deploy/server.Dockerfile` with two extra lines in the `deps` stage (`COPY --from=ca ca-bundle.crt` and `NODE_EXTRA_CA_CERTS`, using `--build-context ca=…`). The committed Dockerfile has no sandbox workaround. On the VPS and in GitHub Actions, `npm ci` reaches the registry directly.
- `caddy validate` (caddy:2.11-alpine): "Valid configuration". `caddy fmt --diff` shows no changes.
- The first stack run showed that a missing `/assets/x.js` returned 404 **with** `immutable`. The asset `handle` now sets the header only on `@exists file`. The 404 has no cache header now.
- In the first browser check, the start screen showed through the 0.72-alpha game-over overlay behind the dialog text. The dialog background is now opaque (inline style, so `overlay.css` stays untouched).
- `beforeUpgrade` gets `ctx.headers` (a `Headers`) and `ctx.ip`. `ctx.ip` resolves `x-real-ip` → `x-forwarded-for` → `x-client-ip` → socket (`@colyseus/core` `Transport.mjs`). `static onAuth` gets the same context from the matchmaking HTTP request, so the `create` limit keys on the HTTP request's `X-Real-IP`.
- In Node, `@colyseus/sdk` `new Client(url, { headers })` sends the headers on both the matchmaking fetch and the WebSocket, so the integration tests drive `Origin` and `X-Real-IP` through the real SDK. `ws` is still not a devDependency.

### Completion Notes List

- **Status: review, waiting for VPS deploy.** Tasks 1–8 (the repo part) are done. Task 9 (go live) is a human step on the VPS and is not done: the dev container cannot reach the VPS.
- **AC 2 (Origin):**
  - `net/origin.ts`: `parseAllowedOrigins(env)` and `originAllowed(origin, allowed)`. Origins are compared after URL parsing: scheme, lower-cased host and port, with the default port and a trailing slash normalised.
  - Allowed: the exact origin, a trailing slash, a different host case, and `:443`.
  - Refused: another scheme, another port, look-alike hosts and subdomains, missing, `""`, `"null"`, and malformed values.
  - A bad `PUBLIC_ORIGIN` entry throws at start, so a typo can't silently disable the check.
  - `createGameServer({ allowedOrigins })` gives the `WebSocketTransport` a `beforeUpgrade` that answers 403 `Forbidden` and logs `ws_origin_refused` with origin and IP.
  - An empty list (dev, tests) allows everything and logs `origin_check_disabled` once at start. `index.ts` reads `PUBLIC_ORIGIN`.
- **AC 3 (creation limit):**
  - `net/rateLimit.ts`: `SlidingWindowLimiter` (10 per 60 s, `Date.now` server clock, injected in tests). It prunes expired entries and empty keys on every call, and refused calls are not counted. `roomCreateLimiter` is the process instance; the constants are in `net/limits.ts`.
  - `RunRoom.onAuth` checks the limit only for an otherwise valid `intent: "create"`. Invalid options are refused first and don't count.
  - Over the limit, it throws `ServerError(526, "rate_limited")` and logs `warn room_create_rate_limited { ip }` with the full IP. The client already maps that to "Too many games created, try again in a minute".
  - `bootTestServer` now takes `GameServerOptions`, and its `cleanup()` also resets the limiter, so existing integration files that create many rooms from 127.0.0.1 are unaffected.
- **AC 5 (shutdown):**
  - `RunRoom.onBeforeShutdown()` broadcasts `S2C.SERVER_SHUTDOWN_STARTED { message: "Server restarting" }`, logs `room_shutdown`, then calls `disconnect(CloseCode.SERVER_SHUTDOWN)` (4001).
  - Client: `lobbyStore.attach` now reports why a room was lost. `lostReason(code, sawShutdownMessage)` in `net/serverNotice.ts` returns `server_restarting` after the message or on code 4001, and `connection_lost` otherwise.
  - `main.ts` shows the start screen with `ServerNotice` over it: "Server restarting. Try again in a moment." with **Back to start**.
  - The close code 4001 is a local constant (equality with the SDK's `CloseCode.SERVER_SHUTDOWN` is tested), so the SDK stays out of the main chunk. Main chunk: 1,549 kB, as before.
- **AC 1 (stack):**
  - `deploy/server.Dockerfile` has the `deps`, `build`, `web` (caddy:2.11-alpine + dist) and `server` (node:26-alpine, `NODE_ENV=production`, `USER node`, `node --import tsx apps/server/src/index.ts`) stages.
  - `deploy/docker-compose.yml` uses project `topdown`.
    - `server`: `init`, `stop_grace_period: 20s`, `expose` only, a wget healthcheck, `PUBLIC_ORIGIN` and `GIT_SHA` env.
    - `web`: `127.0.0.1:8080:8080`, `depends_on` the healthy server.
    - Both services: json-file 10m × 5.
    - Two optional env overrides for local checks only: `WEB_BIND` (default `127.0.0.1:8080`) and `PUBLIC_ORIGIN` (default `https://hordes.sevend.io`).
  - `deploy/Caddyfile` is as specified. Additions: the comment about the unhashed `public/assets` trap, and `immutable` only on existing files. `.dockerignore` is as specified, plus `deploy/deploy-history.log`.
  - **Variance (recorded):** HTTPS/WSS terminate at Cloudflare's edge (tunnel `sevend-io-stream`), not in Caddy (`auto_https off`, plain HTTP on 127.0.0.1:8080). The player sees the same result.
- **AC 4 (deploy):**
  - `deploy/deploy.sh [git-ref]`, default `origin/master`:
    - Runs `set -euo pipefail` and wraps everything in `main()`, because bash reads scripts lazily and the checkout can replace the file.
    - Fetches, resolves the ref to a 12-char sha and checks it out detached.
    - Skips the build when both `topdown-*:<sha>` images exist, then runs `compose build` / `up -d --remove-orphans`.
    - Waits up to 30 s for `/api/health`, then appends to `deploy/deploy-history.log` (gitignored).
    - Keeps the newest 5 tags of each image and prunes dangling images.
  - `deploy/rollback.sh [sha]`: with no argument, it deploys the newest history entry that differs from the current sha. It runs a temp copy of `deploy.sh` with `REPO_DIR` set.
  - `docs/deploy.md` covers the architecture, what ran before, first-time setup, deploy, rollback, logs and health, the fallback, and a local check.
  - CI: the new `docker` job (`needs: check`) builds both targets and runs `caddy validate`, and pushes nothing. The `upload-pages-artifact` step, the Pages `deploy` job and `BASE_PATH` are removed. `vite.config.ts` keeps `BASE_PATH` support. The README's "Playable link" now points to hordes.sevend.io and `docs/deploy.md`.
- **Verified locally:**
  - **Tests:** `npm run typecheck`, `npm run lint`, `npm test` (366 passed, 3 skipped as before without `REQUIRE_DIST`), `npm run build`, and the release-cheat check with `REQUIRE_DIST=1`: all pass. 33 new tests:
    - `origin` 11 and `rateLimit` 6;
    - `net/edge.test.ts` integration 7: 403 for another origin, 403 for no origin, the game origin passes, a full SDK create+connect with the game origin, an SDK on another origin fails to connect, 11 creates with `X-Real-IP: 1.2.3.4` where the 11th gets `rate_limited` while `5.6.7.8` is still allowed, and invalid creates are not counted;
    - `ops/shutdown.test.ts` 1: `server.gracefullyShutdown(false)` with a connected SDK client delivers the message and leave code 4001;
    - client `serverNotice` 4 and `lobbyLost` 4.
  - **Docker images:** both targets built (server 647 MB, web 94 MB), with the scratch CA line as noted in the Debug Log.
  - **Compose stack on 127.0.0.1:18080 (project `topdown-smoke`):**
    - Healthchecks and status:
      - `server` was healthy before `web` started.
      - `/api/health` returned 200 `{"ok":true,...}`.
      - With the server stopped, `/api/health` returned 502.
    - Caching and routing:
      - `/` returned `Cache-Control: no-cache`.
      - `/assets/index-*.js` returned `public, max-age=31536000, immutable`, zstd-encoded.
      - `/assets/missing.js` returned 404 with no cache header.
      - `/j/ABCD` returned 200 with `index.html` and no-cache.
    - SDK create through Caddy:
      - Good origin: room created.
      - Another origin: refused.
      - No origin: refused, and the server logged `ws_origin_refused` with the `Cf-Connecting-Ip` value as `ip`.
    - Rate limit: 11 creates with `Cf-Connecting-Ip: 1.2.3.4` and a different forged `X-Real-IP` each time. The 11th was refused with `526 rate_limited`, which shows that Caddy overwrites a client's `X-Real-IP`. The server logged `room_create_rate_limited {"ip":"1.2.3.4"}`. IP `5.6.7.8` was still allowed.
    - Raw WebSocket upgrade with `Origin: https://evil.example` through Caddy: 403.
    - `docker compose stop server` with a connected client: the client got `{"message":"Server restarting"}` and leave code 4001, and the server logged `room_shutdown` (SIGTERM reaches Node through `init`).
    - Browser (Playwright + Chrome, 844×390, `PUBLIC_ORIGIN=http://127.0.0.1:18080`): `/j/ABCD` loaded the app → Create game → lobby with code and "Ana (host)" → `compose stop server` → dialog "Server restarting. Try again in a moment." → Back to start → start screen. No page errors.
  - **`deploy.sh` / `rollback.sh`** in a throwaway clone with a local bare "origin", using pre-tagged images because the sandbox build needs the CA line. Results:
    - Deploying sha A, then `origin/master` (B), checked out detached each time, skipped the build, brought the stack up and passed health.
    - `rollback.sh` with no argument went back to A.
    - The history log is correct.
    - `KEEP_IMAGES=2` pruning removed older tags and kept the current one.
- **Not verified here:**
  - Anything on the VPS or through Cloudflare (Task 9).
  - The compose `build` step running the unmodified Dockerfile end to end (blocked only by the sandbox CA; the same stages built with the CA line).
  - The CI `docker` job on GitHub.
  - Two real phones on 4G.
- **Human steps for Hermes (Task 9, also in `docs/deploy.md` › First-time setup), as root on the VPS:**
  1. Record the current setup: `systemctl cat topdown-shooter.service`, and the `sevend-io-stream` ingress for `hordes.sevend.io` from `/etc/cloudflared/config.yml`, `~/.cloudflared/config.yml` or the Cloudflare dashboard.
  2. `docker compose version` and `df -h /`.
  3. `cd /root/topdown-shooter && git fetch && git checkout master && git pull --ff-only`.
  4. `systemctl disable --now topdown-shooter.service`, then `ss -ltnp | grep :8080` must show nothing.
  5. `deploy/deploy.sh`. The first build takes a few minutes and ends with `==> deployed <sha>`.
  6. Verify:
     - `curl -sS https://hordes.sevend.io/api/health` returns 200;
     - `curl -sSI https://hordes.sevend.io/` shows `no-cache`;
     - an `/assets/index-*.js` file shows `max-age=31536000, immutable`;
     - `/j/ABCD` returns 200;
     - a WebSocket upgrade with `Origin: https://evil.example` returns 403 (the exact curl is in the doc);
     - two browsers (one on 4G) can each create a room. Joining arrives with Story 2.3.
  7. Paste the results here.
  8. If the tunnel answers 502 while `curl http://127.0.0.1:8080/api/health` works on the VPS, set the tunnel service to `http://127.0.0.1:8080` (IPv6 `localhost`).
  9. If anything fails, run `docker compose -f deploy/docker-compose.yml down` and bring back the static site. **Note:** the old unit's `deploy/Caddyfile` is now the container config, so the doc gives a copy of the old one-block Caddyfile and a `systemctl edit` override.
  10. The designer disables GitHub Pages in the repo settings.
- **Deviations / decisions:**
  - The client's lost-room handling lives in `net/lobbyStore.ts` and the new `net/serverNotice.ts`, not in `net/connection.ts` (that file has no room listeners).
  - The dialog is a separate overlay (`ui/ServerNotice.tsx`) driven by its own small store, not a new `UiScreen` kind, which keeps `uiState.ts` untouched for Story 2.3.
  - `apps/server/package.json` gained a `start` script (`node --import tsx src/index.ts`).
  - The server logs `gitSha` in `server_started`.
  - Added `deploy/rollback.sh` and `deploy/deploy-history.log` (gitignored), so a rollback doesn't require digging for the previous sha.
  - The README's "Playable link" section was updated, because the Pages link is no longer published.

### File List

- `.dockerignore` (new)
- `.github/workflows/ci.yml` (modified)
- `.gitignore` (modified)
- `README.md` (modified)
- `deploy/Caddyfile` (rewritten)
- `deploy/server.Dockerfile` (new)
- `deploy/docker-compose.yml` (new)
- `deploy/deploy.sh` (new)
- `deploy/rollback.sh` (new)
- `docs/deploy.md` (new)
- `apps/server/package.json` (modified)
- `apps/server/src/app.ts` (modified)
- `apps/server/src/index.ts` (modified)
- `apps/server/src/net/limits.ts` (modified)
- `apps/server/src/net/origin.ts` (new)
- `apps/server/src/net/origin.test.ts` (new)
- `apps/server/src/net/rateLimit.ts` (new)
- `apps/server/src/net/rateLimit.test.ts` (new)
- `apps/server/src/net/edge.test.ts` (new)
- `apps/server/src/ops/shutdown.test.ts` (new)
- `apps/server/src/rooms/RunRoom.ts` (modified)
- `apps/server/src/test/bootTestServer.ts` (modified)
- `apps/client/src/main.ts` (modified)
- `apps/client/src/net/lobbyStore.ts` (modified)
- `apps/client/src/net/lobbyLost.test.ts` (new)
- `apps/client/src/net/serverNotice.ts` (new)
- `apps/client/src/net/serverNotice.test.ts` (new)
- `apps/client/src/ui/App.tsx` (modified)
- `apps/client/src/ui/ServerNotice.tsx` (new)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-11-21: Story 2.2 repo part implemented. Changes:
  - Origin check, per-IP room creation limit (`X-Real-IP` from `Cf-Connecting-Ip`), graceful shutdown with "Server restarting" and the client dialog.
  - Docker Compose stack (Caddy + Node 26) behind the Cloudflare Tunnel, `deploy.sh` / `rollback.sh`, `docs/deploy.md`.
  - CI: `docker` build job added, GitHub Pages deploy removed.
  - Status `review`, waiting for the VPS deploy (Task 9, human).
