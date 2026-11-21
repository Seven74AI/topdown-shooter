# Deploying to the VPS

Story 2.2. The game (client and game server) runs on the designer's VPS at **https://hordes.sevend.io/**, as a Docker Compose stack. These steps are written for whoever runs them **on the VPS**: Hermes or the designer. The cloud dev containers cannot reach the VPS, so a deploy is never run from CI.

## How it fits together

```
phone ──HTTPS/WSS──▶ Cloudflare edge (certificate, automatic)
                         │  Cloudflare Tunnel "sevend-io-stream" (cloudflared on the VPS)
                         ▼
               127.0.0.1:8080  web    (Caddy 2.11, plain HTTP)  ── /          client build (deploy/Caddyfile)
                                                                └─ /api/*  ─▶ server:2567
                               server (Node 26, Colyseus)          game server, not published to the host
```

- **HTTPS and WSS end at Cloudflare.** Caddy is plain HTTP on 127.0.0.1:8080 (`auto_https off`): no inbound ports and no ACME on the VPS. The tunnel already sends `hordes.sevend.io` to `http://localhost:8080`, so its config does not change.
  - This differs from the AC's "Caddy terminates HTTPS with automatic certificates". The player sees the same thing: HTTPS/WSS only, with automatic certificates.
- **`/api` is the game server**, on the same origin (no CORS). Caddy strips `/api`. Matchmaking is `/api/matchmake/*`, the WebSocket is `wss://hordes.sevend.io/api/<processId>/<roomId>`, and the health check is `/api/health`.
- **Real player IPs.** Caddy copies Cloudflare's `Cf-Connecting-Ip` into `X-Real-IP`, which the server uses for the room-creation limit (10 per IP per minute). That is safe only because port 8080 is bound to 127.0.0.1, where only cloudflared reaches it. **Never publish 8080 on a public interface.**
- **Origin check.** The server refuses WebSocket upgrades whose `Origin` is not `PUBLIC_ORIGIN` (`https://hordes.sevend.io`, set in `deploy/docker-compose.yml`).
- **Caching.** `index.html` and other unhashed files get `Cache-Control: no-cache`. The hashed files under `/assets/` get `public, max-age=31536000, immutable`. A missing asset is a 404, never `index.html`. Share links `/j/<code>` load the app.
- **Shutdown.** `docker compose stop` or a redeploy sends SIGTERM. Each room tells its players "Server restarting" and closes with code 4001, and the client shows "Server restarting. Try again in a moment." with **Back to start**. Rooms are not saved yet (autosave is Epic 8), so a redeploy ends the runs in progress.
- **Images** are tagged `topdown-server:<sha>` and `topdown-web:<sha>` (12-character git sha). `deploy.sh` keeps the newest 5 of each.
- **Logs** are JSON lines on stdout, rotated by Docker (`json-file`, 10 MB × 5 per container).

Files: `deploy/docker-compose.yml`, `deploy/server.Dockerfile` (targets `server` and `web`), `deploy/Caddyfile`, `deploy/deploy.sh`, `deploy/rollback.sh`, `.dockerignore`.

## What ran before (Story 1.1)

Before this story, the static client was served by Caddy from the systemd unit `topdown-shooter.service`. It used the old one-block `deploy/Caddyfile` (`:8080 { bind 127.0.0.1; root * /root/topdown-shooter/apps/client/dist; encode gzip; file_server }`) and the repo checkout at `/root/topdown-shooter`. It holds port 8080, so it must be stopped before the stack starts. It stays installed, disabled, as the fallback (see [If anything fails](#if-anything-fails)). Its unit file is not in the repo. Record it in step 1 below.

The VPS also hosts the Hermes agent. Only touch our service, port 8080, and the `topdown` containers and images.

## First-time setup (once)

Run as root on the VPS.

1. **Record the current setup** (paste the output into the story's Completion Notes):

   ```sh
   systemctl cat topdown-shooter.service
   systemctl status topdown-shooter.service --no-pager
   # cloudflared tunnel config for sevend-io-stream: the ingress for hordes.sevend.io
   systemctl cat cloudflared 2>/dev/null; ls /etc/cloudflared ~/.cloudflared 2>/dev/null
   cat /etc/cloudflared/config.yml 2>/dev/null || cat ~/.cloudflared/config.yml 2>/dev/null
   ```

   If the tunnel is managed in the Cloudflare dashboard (a token-based tunnel), there is no local `config.yml`. Note the public hostname `hordes.sevend.io` → `http://localhost:8080` from the dashboard (Zero Trust → Networks → Tunnels → `sevend-io-stream`).

2. **Check Docker** (the designer confirmed it is installed):

   ```sh
   docker compose version      # needs Compose v2 (the `docker compose` plugin)
   df -h /                     # ~23 GB free; the first build uses ~1.5 GB
   ```

3. **Update the checkout**:

   ```sh
   cd /root/topdown-shooter && git fetch && git checkout master && git pull --ff-only
   ```

4. **Stop and disable the old static service**, which holds port 8080:

   ```sh
   systemctl disable --now topdown-shooter.service
   ss -ltnp | grep ':8080' || echo "8080 is free"
   ```

5. **Deploy**:

   ```sh
   deploy/deploy.sh
   ```

   The first build takes a few minutes: it pulls `node:26-alpine` and `caddy:2.11-alpine`, runs `npm ci` and builds the client. It ends with `==> deployed <sha>`.

6. **Verify** (paste the results into the story's Completion Notes):

   ```sh
   curl -sS https://hordes.sevend.io/api/health                    # 200 {"ok":true,"rooms":0,...}
   curl -sSI https://hordes.sevend.io/ | grep -i cache-control      # Cache-Control: no-cache
   A=$(curl -s https://hordes.sevend.io/ | grep -o '/assets/index-[^"]*\.js' | head -1)
   curl -sSI "https://hordes.sevend.io$A" | grep -i cache-control  # public, max-age=31536000, immutable
   curl -sSI https://hordes.sevend.io/j/ABCD | head -1             # HTTP/2 200 (the app)
   curl -sS -o /dev/null -w '%{http_code}\n' https://hordes.sevend.io/assets/nope.js   # 404
   # Origin check: a WebSocket upgrade from another origin is refused with 403
   curl -sS -o /dev/null -w '%{http_code}\n' -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
     -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
     -H 'Origin: https://evil.example' https://hordes.sevend.io/api/x   # 403
   ```

   Then, in two browsers (one of them a phone on 4G): open https://hordes.sevend.io/, **Create game** in one, and check that the lobby shows a code. Joining by code or link arrives with Story 2.3. Until then, check that both browsers can create a room. Cloudflare may answer the curl `HEAD` requests with its own headers. If `cache-control` is missing there, use `curl -sS -D - -o /dev/null <url>` (a GET).

7. **Disable GitHub Pages** (the designer, in the browser): the CI no longer publishes it. In GitHub → `Seven74AI/topdown-shooter` → Settings → Pages, set Source to "None" or unpublish the site, so the old https://seven74ai.github.io/topdown-shooter/ link stops serving a stale build.

If cloudflared reaches `localhost:8080` over IPv6 (`::1`) and the site answers 502 through the tunnel while `curl http://127.0.0.1:8080/api/health` works on the VPS, change the tunnel's service URL to `http://127.0.0.1:8080`. Docker publishes the port on 127.0.0.1 only.

## Deploy (every release)

After a merge to `master` with CI green (both the `check` and `docker` jobs):

```sh
cd /root/topdown-shooter && deploy/deploy.sh
```

`deploy.sh [git-ref]` (default `origin/master`) does the following:

1. Runs `git fetch origin`.
2. Checks out the ref as a **detached HEAD**. The checkout no longer sits on `master`; that is expected.
3. Builds the two images for that sha. If both images already exist, it skips the build.
4. Runs `docker compose up -d`. This restarts the server, and its rooms get "Server restarting".
5. Waits up to 30 s for `http://127.0.0.1:8080/api/health`.
6. Appends the sha to `deploy/deploy-history.log` (not in git).
7. Prunes images older than the newest 5.

It prints `==> deployed <sha>`. A deploy ends every run in progress, so pick a moment when nobody is playing.

Deploy a branch or sha instead: `deploy/deploy.sh origin/some-branch` or `deploy/deploy.sh 1a2b3c4d5e6f`.

## Rollback

```sh
deploy/rollback.sh            # back to the deploy before the current one (from deploy/deploy-history.log)
deploy/rollback.sh <sha>      # a specific sha, e.g. from `git log --oneline origin/master` or the history log
```

It runs `deploy.sh <sha>`. If that sha's images are among the 5 kept, nothing is rebuilt and the switch takes seconds. `deploy/deploy.sh <previous-sha>` does the same thing.

## Logs, status and health

```sh
cd /root/topdown-shooter
docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs -f server        # game server (pino JSON lines)
docker compose -f deploy/docker-compose.yml logs -f web           # Caddy
curl -sS http://127.0.0.1:8080/api/health                         # on the VPS
curl -sS https://hordes.sevend.io/api/health                      # through the tunnel
cat deploy/deploy-history.log                                     # what was deployed when
```

Useful log messages: `server_started` (with `gitSha` and `allowedOrigins`), `room_create_rate_limited` (with `ip`), `ws_origin_refused` (with `origin` and `ip`), `room_shutdown`, `client_message_rejected`.

Stop the stack: `docker compose -f deploy/docker-compose.yml down`. Rooms get "Server restarting" first. Images stay on disk.

Disk: `docker system df`. `deploy.sh` keeps 5 image tags of each. The build cache can be cleared with `docker builder prune -f` if space runs low.

## If anything fails

Bring back the old static site (single-player only, as in Story 1.1):

```sh
cd /root/topdown-shooter
docker compose -f deploy/docker-compose.yml down
git checkout master && npm ci && npm run build   # the old service serves apps/client/dist
systemctl enable --now topdown-shooter.service
```

The old unit runs `caddy` with `deploy/Caddyfile`. That file is now the container's Caddyfile: it proxies to `server:2567` and serves `/srv/client`, so the old unit **cannot use it as-is**. Point the unit at a copy of the old one-block Caddyfile:

```sh
mkdir -p /etc/topdown && cat > /etc/topdown/Caddyfile.static <<'EOF'
:8080 {
	bind 127.0.0.1
	root * /root/topdown-shooter/apps/client/dist
	encode gzip
	file_server
}
EOF
systemctl edit topdown-shooter.service   # override ExecStart to use /etc/topdown/Caddyfile.static
```

The override only needs the `ExecStart` line with the new path; copy the rest of the line from `systemctl cat topdown-shooter.service` (step 1). Then report what failed, with `docker compose -f deploy/docker-compose.yml logs --tail=200 server web`.

## Local check of the stack (any machine with Docker)

```sh
docker build -f deploy/server.Dockerfile --target server -t topdown-server:local .
docker build -f deploy/server.Dockerfile --target web -t topdown-web:local .
GIT_SHA=local WEB_BIND=127.0.0.1:18080 docker compose -p topdown-local -f deploy/docker-compose.yml up -d --no-build
curl -sS http://127.0.0.1:18080/api/health
GIT_SHA=local docker compose -p topdown-local -f deploy/docker-compose.yml down
```

`PUBLIC_ORIGIN` stays `https://hordes.sevend.io`, so a browser on `http://127.0.0.1:18080` cannot open the room WebSocket. Set `PUBLIC_ORIGIN=http://127.0.0.1:18080` for that, or use `npm run dev`. The CI job `docker` builds both targets and validates the Caddyfile on every push.
