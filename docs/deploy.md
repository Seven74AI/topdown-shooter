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
- **`/api` is the game server**, on the same origin (no CORS). Caddy strips `/api`. Matchmaking is `/api/matchmake/*`, the WebSocket is `wss://hordes.sevend.io/api/<processId>/<roomId>`, and the health check is `/api/health`. `/api` without the slash is a 404. Request bodies on `/api` over 8 KB get 413 from Caddy.
- **Real player IPs.** Caddy overwrites `X-Real-IP` with Cloudflare's `Cf-Connecting-Ip`, and the server uses it for the room-creation limit (10 per IP per minute; IPv6 counts per /64, an IPv4-mapped IPv6 as its IPv4).
  - That trust rests **entirely on the 127.0.0.1 binding**: only cloudflared (and other processes on the VPS) can reach port 8080. **Never publish 8080 on a public interface.**
  - It needs **Docker Engine 28 or newer**. Older Docker could let other machines on the same network segment reach a port published on 127.0.0.1, and they could then send any `Cf-Connecting-Ip`.
  - Accepted: a local process on the VPS (Hermes, for example) can reach 127.0.0.1:8080 directly and set any `Cf-Connecting-Ip`, so it can bypass the per-IP limit. It is a trusted machine.
- **Origin check.** The server refuses WebSocket upgrades whose `Origin` is not `PUBLIC_ORIGIN` (`https://hordes.sevend.io`, set in `deploy/docker-compose.yml`).
- **Caching.** `index.html` and other unhashed files get `Cache-Control: no-cache`. The hashed files under `/assets/` get `public, max-age=31536000, immutable`. A missing asset is a 404, never `index.html`. Share links `/j/<code>` load the app.
- **Headers.** Every response, errors included, has `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` and `X-Frame-Options: DENY`, and no `Server` or `Via` header.
- **Shutdown.** `docker compose stop` or a redeploy sends SIGTERM. Each room tells its players "Server restarting" and closes with code 4001, and the client shows "Server restarting. Try again in a moment." with **Back to start**. Rooms are not saved yet (autosave is Epic 8), so a redeploy ends the runs in progress.
- **Images** are tagged `topdown-server:<sha>` and `topdown-web:<sha>` (12-character git sha) and labelled `org.topdown.app=topdown`. `deploy.sh` keeps the newest 5 of each, never removes the current or the previous known-good one, and prunes **only** images with that label. Other images on the VPS (Hermes) are never touched.
- **Containers are locked down**:
  - both: read-only root filesystem (tmpfs for `/tmp`, and Caddy's `/data` and `/config`), `cap_drop: ALL`, `no-new-privileges`;
  - server: runs as `node`, `mem_limit: 768m`, `pids_limit: 256`;
  - web: runs as `nobody`, `mem_limit: 128m`, `pids_limit: 128`.
  - The limits are first guesses for a small VPS shared with Hermes; they are tunable in `deploy/docker-compose.yml`. An OOM kill shows as `oom_killed=true` in a failed deploy's output, or in `docker inspect topdown-server-1 --format '{{.State.OOMKilled}}'`.
- **`GIT_SHA` is required.** The compose file refuses to run without it, so a hand-typed `docker compose up -d` can never build and start an untagged image. `deploy.sh` sets it, and after each successful deploy writes `deploy/.env` (`GIT_SHA=<sha>`, not in git), so the plain `docker compose -f deploy/docker-compose.yml ps|logs|down` commands below work and refer to the deployed version.
- **Logs** are JSON lines on stdout, rotated by Docker (`json-file`, 10 MB × 5 per container).

Files: `deploy/docker-compose.yml`, `deploy/server.Dockerfile` (targets `server` and `web`), `deploy/Caddyfile`, `deploy/deploy.sh`, `deploy/rollback.sh`, `.dockerignore`.

## What ran before (Story 1.1)

Before this story, the static client was served by Caddy from the systemd unit `topdown-shooter.service`. It used the old one-block `deploy/Caddyfile` (`:8080 { bind 127.0.0.1; root * /root/topdown-shooter/apps/client/dist; encode gzip; file_server }`) and the repo checkout at `/root/topdown-shooter`. It holds port 8080, so it must be stopped before the stack starts.

**What runs there right now (checked by Hermes on the VPS, 2026-11-21):**
- `/etc/systemd/system/topdown-shooter.service` runs `/usr/local/bin/caddy run --config /root/topdown-shooter/deploy/Caddyfile` with `Restart=on-failure`. It is the live Caddy on 127.0.0.1:8080.
- Since Story 2.1, the game server also runs, as `topdown-server.service` on :2567. The live Caddy sends `/api/*` to it with `handle_path` (prefix stripped, WebSockets passed through) and serves `apps/client/dist` for everything else. That is commit `9e993a0`'s Caddyfile.
- **Live-site risk:** the VPS checkout *is* `/root/topdown-shooter`, and the live Caddy reads `deploy/Caddyfile` from it at start. After a `git pull` of a master that has the container Caddyfile, a restart of that Caddy (crash, `systemctl restart`, reboot) would load the container config and serve nothing. So do step 2 (which gives the old unit its own frozen Caddyfile) **before** pulling, or right after, and finish the go-live soon after.

It stays installed, disabled, as the fallback. Step 2 below prepares it **before** anything changes, so that a failed go-live can be reverted with one command (see [If anything fails](#if-anything-fails)).

The VPS also hosts the Hermes agent. Only touch our service, port 8080, and the `topdown` containers and images.

## First-time setup (once)

Run as root on the VPS. Paste the output of steps 1, 2 and 6 into the story's Completion Notes.

1. **Record and back up the current setup**:

   ```sh
   systemctl cat topdown-shooter.service
   systemctl cat topdown-shooter.service > /root/topdown-shooter.service.bak
   systemctl status topdown-shooter.service --no-pager
   # cloudflared tunnel config for sevend-io-stream: the ingress for hordes.sevend.io
   systemctl cat cloudflared 2>/dev/null; ls /etc/cloudflared ~/.cloudflared 2>/dev/null
   cat /etc/cloudflared/config.yml 2>/dev/null || cat ~/.cloudflared/config.yml 2>/dev/null
   [ -d /etc/cloudflared ] && cp -a /etc/cloudflared /root/cloudflared-etc.bak
   [ -d ~/.cloudflared ] && cp -a ~/.cloudflared /root/cloudflared-home.bak
   ```

   If the tunnel is managed in the Cloudflare dashboard (a token-based tunnel), there is no local `config.yml`. Note the public hostname `hordes.sevend.io` → `http://localhost:8080` from the dashboard (Zero Trust → Networks → Tunnels → `sevend-io-stream`). Nothing in this story changes the tunnel; the backup is only a precaution.

2. **Prepare the static fallback, while the old site still runs.** The repo's `deploy/Caddyfile` is now the container's config (it proxies to `server:2567` and serves `/srv/client`), so the old unit **cannot use it any more**. Give the unit its own frozen copy of today's static site and its own Caddyfile:

   ```sh
   # A frozen copy of the site the old unit serves now, independent of the checkout.
   mkdir -p /var/lib/topdown && cp -a /root/topdown-shooter/apps/client/dist /var/lib/topdown/static
   mkdir -p /etc/topdown && cat > /etc/topdown/Caddyfile.static <<'EOF'
   :8080 {
   	bind 127.0.0.1
   	root * /var/lib/topdown/static
   	encode gzip
   	try_files {path} /index.html
   	file_server
   }
   EOF
   caddy validate --config /etc/topdown/Caddyfile.static --adapter caddyfile   # "Valid configuration"
   ```

   Then point the unit at it with a drop-in. The empty `ExecStart=` line is required: it clears the original command, and systemd refuses a second `ExecStart` for a normal service. Copy the binary path and the flags from the backup's `ExecStart=` line (step 1); only the `--config` path changes. If the old line is `/usr/bin/caddy run --config /root/topdown-shooter/deploy/Caddyfile --adapter caddyfile`, the drop-in is:

   ```sh
   grep '^ExecStart=' /root/topdown-shooter.service.bak          # the old line
   mkdir -p /etc/systemd/system/topdown-shooter.service.d
   cat > /etc/systemd/system/topdown-shooter.service.d/static-fallback.conf <<'EOF'
   [Service]
   ExecStart=
   ExecStart=/usr/bin/caddy run --config /etc/topdown/Caddyfile.static --adapter caddyfile
   EOF
   systemctl daemon-reload
   systemctl cat topdown-shooter.service | tail -4                 # shows the drop-in
   ```

   Prove the fallback works by restarting the old unit on it. The site is the same, served from the frozen copy:

   ```sh
   systemctl restart topdown-shooter.service
   systemctl is-active topdown-shooter.service                   # active
   curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:8080/         # 200
   curl -sS -o /dev/null -w '%{http_code}\n' https://hordes.sevend.io/      # 200
   ```

   If this step fails, stop here: remove the drop-in (`rm /etc/systemd/system/topdown-shooter.service.d/static-fallback.conf && systemctl daemon-reload && systemctl restart topdown-shooter.service`) and report.

3. **Check Docker**:

   ```sh
   docker version --format '{{.Server.Version}}'   # must be 28.0 or newer (127.0.0.1 port binding, see above)
   docker compose version                          # Compose v2 (the `docker compose` plugin)
   df -h /                                         # ~23 GB free; the first build uses ~1.5 GB
   ```

   If Docker is older than 28, stop and ask the designer to upgrade it first.

4. **Update the checkout**:

   ```sh
   cd /root/topdown-shooter && git fetch && git checkout master && git pull --ff-only
   ```

5. **Switch over**: stop and disable the old static service, which holds port 8080, and the Story 2.1 game server unit, which holds :2567 (the stack runs its own server container), then deploy.

   ```sh
   systemctl disable --now topdown-shooter.service topdown-server.service
   ss -ltnp | grep -E ':(8080|2567) ' || echo "8080 and 2567 are free"
   deploy/deploy.sh
   ```

   The first build takes a few minutes: it pulls `node:26.13.1-alpine3.24` and `caddy:2.11.9-alpine`, runs `npm ci` and builds the client. It ends with `==> deployed <sha>`. If it ends with `!!` lines instead, run the one-command revert in [If anything fails](#if-anything-fails).

6. **Verify**:

   ```sh
   curl -sS https://hordes.sevend.io/api/health                    # 200 {"ok":true,"rooms":0,...}
   curl -sS -D - -o /dev/null https://hordes.sevend.io/ | grep -iE 'cache-control|x-frame|x-content|referrer|^server'
   #   Cache-Control: no-cache, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy: ...
   #   (a Server: cloudflare header is Cloudflare's own, not ours)
   A=$(curl -s https://hordes.sevend.io/ | grep -o '/assets/index-[^"]*\.js' | head -1)
   curl -sS -D - -o /dev/null "https://hordes.sevend.io$A" | grep -i cache-control  # public, max-age=31536000, immutable
   curl -sS -o /dev/null -w '%{http_code}\n' https://hordes.sevend.io/j/ABCD          # 200 (the app)
   curl -sS -o /dev/null -w '%{http_code}\n' https://hordes.sevend.io/assets/nope.js  # 404
   curl -sS -o /dev/null -w '%{http_code}\n' https://hordes.sevend.io/api             # 404
   # Origin check: a WebSocket upgrade from another origin is refused with 403.
   # --http1.1 is required: Cloudflare negotiates HTTP/2 by default, and over h2 the
   # `Upgrade: websocket` header is ignored (h2 upgrades via extended CONNECT, RFC 8441),
   # so the request would reach the server as a plain GET and 404 instead.
   curl --http1.1 -sS -o /dev/null -w '%{http_code}\n' -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
     -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' \
     -H 'Origin: https://evil.example' https://hordes.sevend.io/api/x   # 403
   docker compose -f deploy/docker-compose.yml ps                      # server (healthy) and web, both Up
   ```

   Then, in two browsers (one of them a phone on 4G): open https://hordes.sevend.io/, **Create game** in one, and join it from the other by code or link. If `cache-control` is missing from a Cloudflare response, compare with the same request on the VPS at `http://127.0.0.1:8080/...`.

7. **Retire GitHub Pages** once the steps above pass. Until the VPS is verified, CI keeps publishing to Pages (the `pages` and `deploy-pages` jobs in `.github/workflows/ci.yml`), because the Epic 1 playtest links point there. After go-live, the developer deletes those two jobs and points the playtest links at hordes.sevend.io; then the designer disables Pages in GitHub → `Seven74AI/topdown-shooter` → Settings → Pages (Source: "None").

If cloudflared reaches `localhost:8080` over IPv6 (`::1`) and the site answers 502 through the tunnel while `curl http://127.0.0.1:8080/api/health` works on the VPS, change the tunnel's service URL to `http://127.0.0.1:8080`. Docker publishes the port on 127.0.0.1 only. (Back up the tunnel config first, as in step 1.)

## Deploy (every release)

After a merge to `master` with CI green (both the `check` and `docker` jobs):

```sh
cd /root/topdown-shooter && deploy/deploy.sh
```

`deploy.sh [git-ref]` (default `origin/master`) does the following:

1. Runs `git fetch origin`.
2. Checks out the ref as a **detached HEAD**. The checkout no longer sits on `master`; that is expected.
3. Builds the two images for that sha. If both images already exist, it skips the build. If the build fails, the running stack is untouched.
4. Story 7.1: makes sure `deploy/.env` holds `POSTGRES_PASSWORD` and `SESSION_SECRET` (generated once, never overwritten), starts `postgres` (`up -d --wait`) and applies the database migrations in a one-off server container (`db/migrateCli.ts`). If that fails, it records `failed` and stops: the running server is untouched.
5. Runs `docker compose up -d`. This restarts the server, and its rooms get "Server restarting".
6. Waits up to 30 s for `http://127.0.0.1:8080/api/health`, and checks that the server container runs this sha's image.
7. Appends `<time> <sha> ok` (or `failed`) to `deploy/deploy-history.log` (not in git). Only `ok` deploys count as known good.
8. On success: sets `GIT_SHA=<sha>` in `deploy/.env` (other lines kept), and prunes our images older than the newest 5.

It prints `==> deployed <sha>`. A deploy ends every run in progress, so pick a moment when nobody is playing.

Deploy a branch or sha instead: `deploy/deploy.sh origin/some-branch` or `deploy/deploy.sh 1a2b3c4d5e6f`.

**When a deploy fails**, `deploy.sh` does **not** roll back by itself, so the broken state can be looked at. It prints `docker compose ps`, the server container's state (exit code, restarts, OOM, health) and the last 100 log lines of both containers, then the exact command to go back, and exits 1:

```
!! last known-good deploy: 1a2b3c4d5e6f. To go back to it, run:
!!   deploy/rollback.sh 1a2b3c4d5e6f
```

Run that command right away: after a failed `up`, the site is usually down (Caddy waits for a healthy server). On the very first deploy there is no known-good version yet; then the message points to the static-site revert below.

## Database: first start, migrations, backups, restore test (Story 7.1)

Progress (guest accounts, later Supplies and unlocks) lives in **PostgreSQL 18** (`postgres` service, image `postgres:18.6-alpine3.24`), on the named volume **`topdown_pgdata`**. It is never published to the host; only the server and `docker compose exec` reach it.

- **Secrets** (`deploy/.env`, mode 600, not in git): `POSTGRES_PASSWORD` (hex) and `SESSION_SECRET` (hex, signs the 10-minute join tickets). `deploy.sh` generates both on its first run and keeps them. **Back up `deploy/.env` with the dumps' off-VPS copy settings**: without `POSTGRES_PASSWORD` the server can't log in to the existing volume (a restore into a new volume still works). Changing `SESSION_SECRET` only logs everyone out of their current ticket (a fresh one is fetched before each join): harmless.
- **First start:** the first `deploy/deploy.sh` after Epic 7 creates the volume, starts postgres, applies migration `0000_init` (tables `accounts`, `progress`), then starts the server. Without `DATABASE_URL` or `SESSION_SECRET` the server refuses to start (`database_url_missing` / `session_secret_missing` in its log).
- **Migrations** (`apps/server/drizzle/`, made with `npm run db:generate`, committed; never edit a committed one) run in `deploy.sh` before `up -d`. Running them twice is a no-op. Forward only: a rollback to an older sha keeps the newer schema (each Epic 7 migration only adds, or relaxes: Story 7.6 copies `accounts.guest_token_hash` into `device_tokens` and makes it nullable instead of dropping it, so a rollback to a 7.1–7.3 build still finds the guests made before 7.6 — guests made after it get a new guest on such a build; a later migration drops the column). A rollback to a sha from before Story 7.1 has no `postgres` service: `up -d --remove-orphans` stops the container; the volume stays and the next deploy picks it up again.
- **If the database is down** while the server runs, players still create, join and play; runs are "not saved" (Story 7.1 P3). The server logs `db_error {op}` at error level. `docker compose -f deploy/docker-compose.yml ps postgres` / `logs postgres`.
- **Supplies that could not be saved (Story 7.2):** a run's bank that fails twice logs `supplies_bank_failed {runId, accountId, ending, record, …}` at error level (the player saw "Couldn't save this run"). The server reports a bank only once its transaction has really committed or rolled back (`db/boundedTx.ts`: lock/statement timeouts 1.5 s, a 1.8 s budget checked before COMMIT, `transaction_timeout` on PostgreSQL ≥ 17, a 3 s client timeout per query and TCP keepalive for a dead line). One case remains: a COMMIT that landed but whose reply was lost while the database then became unreachable is reported as failed although paid — hence the check below. **Before granting a run by hand, check it was not banked:** `docker compose -f deploy/docker-compose.yml exec -T postgres psql -U topdown -d topdown -c "SELECT supplies, created_at FROM run_rewards WHERE run_id = '<runId>' AND account_id = '<accountId>'"` — a row means it was paid. To grant, insert that row and add the Supplies in ONE transaction (`BEGIN; INSERT INTO run_rewards (run_id, account_id, supplies, breakdown) VALUES ('<runId>', '<accountId>', <n>, '{"hand": true}'); UPDATE progress SET supplies = supplies + <n>, lifetime_supplies = lifetime_supplies + <n> WHERE account_id = '<accountId>'; COMMIT;`): the primary key makes a second grant fail.
- **Unlocks (Story 7.3) — deploy 7.1 and 7.3 in the same release.** 7.3 adds `progress` to the `/account/session` reply. A browser tab still running a 7.1-only client (strict reply schema) rejects that reply, joins without a ticket and plays **unsaved** until the page is reloaded. 7.1 is not deployed yet, so ship the first Epic 7 deploy from a master that already has 7.3; from 7.3 on the reply schema ignores unknown fields, so later additions (7.5, 7.6, 7.7) are safe. Purchases log `unlocked {accountId, unlockId, price, suppliesAfter}`; refused calls `unlock_rate_limited {ip}` / `unlock_refused {ip, reason}`. To check one by hand: `SELECT supplies, unlocks FROM progress WHERE account_id = '<id>'`.
- **Accounts (Story 7.6).** Migration `*_accounts_devices` adds `device_tokens` (one row per phone: the SHA-256 of its guest token → its account) filled from `accounts.guest_token_hash` (kept nullable and unused for one release, for a rollback), and adds `accounts.username_lower` (unique), `merged_into`, `save_nudged`. It only copies rows (no data is lost) and runs in the normal migration step. Passwords and recovery codes are Argon2id hashes (`@node-rs/argon2`, a native module: `npm ci` in the Alpine image installs its prebuilt `linux-*-musl` binary from the lockfile — no compiler, no new secret). No new env var. Logs: `account_upgraded {accountId}`, `login_ok {accountId, merged}`, `login_failed {ip}`, `recover_ok`, `recover_failed {ip}`, `account_merged {guestId, accountId, refunded, refunds}`, `logout {accountId, guestId}`, `login_rate_limited {ip}` — never a password, code, token or hash. A guest merged into an account keeps its `accounts` row with `merged_into` set and its `run_rewards` rows (history); its progress row is gone (moved into the account's). A late bank of such a guest pays the account: before a hand grant for a `supplies_bank_failed` line whose `accountId` is a merged guest, check `run_rewards` for that guest id (the row keeps the seat's id) and add the Supplies to the account named in `merged_into`. A forgotten password with a lost recovery code can't be reset (no email, D10); support can only confirm the username exists.
- **Nightly backup** (`deploy/backup.sh`, NFR13): `pg_dump -Fc` into `/root/backups/topdown/YYYY-MM-DD.dump`, deletes local dumps older than 14 days, copies the new one **off the VPS to a Cloudflare R2 bucket** (decision 7.1 D7) with `rclone`, and prunes remote copies older than 14 days. One-time setup (Hermes):
  1. `apt-get install -y rclone`, then `rclone config` → a remote named `r2` of type S3, provider Cloudflare, with an R2 API token limited to one bucket (e.g. `topdown-backups`, created in the Cloudflare dashboard → R2).
  2. `printf 'BACKUP_REMOTE=r2:topdown-backups\n' > deploy/backup.env && chmod 600 deploy/backup.env` (not in git).
  3. Run it once by hand: `deploy/backup.sh` → `==> backup YYYY-MM-DD done`; `rclone ls r2:topdown-backups` lists the dump.
  4. Cron (`crontab -e`, as root), 03:30 Europe/Paris:
     ```
     CRON_TZ=Europe/Paris
     30 3 * * * /root/topdown-shooter/deploy/backup.sh >> /root/backups/topdown/backup.log 2>&1
     ```
     (If the VPS cron ignores `CRON_TZ`, write the UTC time instead: 02:30 UTC in winter.) Exit code 2 = dump made but no off-VPS copy (no `BACKUP_REMOTE` or no rclone).
- **Restore test** (`deploy/restore.sh [dump]`, default the newest dump): restores into a scratch database `topdown_restore_test` inside the running container, prints the row counts of `accounts`, `progress` and the migrations next to the live counts, then drops the scratch database. The live database is never touched. Run it once after setting up backups and record the result here:

  | Date | Dump | accounts / progress (restored vs live) | Result |
  | --- | --- | --- | --- |
  | _(Hermes fills in after the first Epic 7 deploy)_ | | | |

- **Real restore** (disaster only, with the designer's OK; everyone loses progress made after the dump): stop the server (`docker compose -f deploy/docker-compose.yml stop server`), then
  ```sh
  docker compose -f deploy/docker-compose.yml exec -T postgres psql -U topdown -d postgres -c "DROP DATABASE topdown" -c "CREATE DATABASE topdown"
  docker compose -f deploy/docker-compose.yml exec -T postgres pg_restore -U topdown -d topdown --no-owner --exit-on-error < /root/backups/topdown/YYYY-MM-DD.dump
  deploy/deploy.sh "$(awk 'END { print $2 }' deploy/deploy-history.log)"
  ```
- **Dev on a phone over the LAN (review N3):** the guest cookie is `__Host-tdg` (`Secure`), and browsers store a Secure cookie only on `https://` or `http://localhost`. On a phone opening `http://<LAN-IP>:5173` the cookie is never stored, so only the `localStorage` half of P2 can be tried there (the account still works through `deviceToken`); try the cookie half on `localhost` or on the real HTTPS site.
- **Local Postgres** (any machine with Docker, optional; dev and tests use the embedded PGlite in `apps/server/.data/pglite` when `DATABASE_URL` is unset): `GIT_SHA=none POSTGRES_PASSWORD=dev SESSION_SECRET=dev docker compose -f deploy/docker-compose.yml up -d postgres` does not publish a port; add a `ports: ["127.0.0.1:5432:5432"]` override file locally if you want to connect from the host, then `DATABASE_URL=postgres://topdown:dev@127.0.0.1:5432/topdown npm run db:migrate`.

## Rollback

```sh
deploy/rollback.sh            # the newest known-good deploy that is not the current one
deploy/rollback.sh <sha>      # a specific sha, e.g. from the history log or `git log --oneline origin/master`
```

Known good means an `ok` line in `deploy/deploy-history.log`. Current means the newest line, `ok` or `failed`. So with history `A ok`, `B ok`, `C failed`, a rollback goes to B. With `A ok`, `B ok`, it goes to A. Failed shas are never chosen.

It runs `deploy.sh <sha>`. If that sha's images are still on disk (the newest 5 and the previous known-good are kept), nothing is rebuilt and the switch takes seconds.

## Logs, status and health

```sh
cd /root/topdown-shooter
docker compose -f deploy/docker-compose.yml ps
docker compose -f deploy/docker-compose.yml logs -f server        # game server (pino JSON lines)
docker compose -f deploy/docker-compose.yml logs -f web           # Caddy
curl -sS http://127.0.0.1:8080/api/health                         # on the VPS
curl -sS https://hordes.sevend.io/api/health                      # through the tunnel
cat deploy/deploy-history.log                                     # what was deployed when, ok or failed
docker stats --no-stream topdown-server-1 topdown-web-1            # memory against the limits
```

These need `deploy/.env`, which the first successful deploy writes. Before that, prefix them with `GIT_SHA=none`.

Useful log messages: `server_started` (with `gitSha` and `allowedOrigins`), `room_create_rate_limited` (with `ip`), `ws_origin_refused` (with `origin` and `ip`), `room_shutdown`, `client_message_rejected`.

Stop the stack: `docker compose -f deploy/docker-compose.yml down`. Rooms get "Server restarting" first. Images stay on disk.

Disk: `docker system df`. `deploy.sh` keeps 5 image tags of each. If space runs low, `docker builder prune -f` clears the build cache. That cache is shared with anything else that builds images on the VPS, so check with the designer first. Never run `docker image prune` or `docker system prune` without `--filter label=org.topdown.app=topdown`.

## If anything fails

**Back to the previous version of the stack**: `deploy/rollback.sh` (see [Rollback](#rollback)).

**Back to the old static site** (single-player only, as in Story 1.1), when the stack cannot come up at all. This needs step 2 of the first-time setup, which prepared the unit. One command:

```sh
GIT_SHA=none docker compose -f /root/topdown-shooter/deploy/docker-compose.yml down --timeout 20; systemctl enable --now topdown-shooter.service && sleep 1 && curl -sS -o /dev/null -w 'static site: %{http_code}\n' http://127.0.0.1:8080/
```

It stops our containers (freeing port 8080) and starts the old unit on `/etc/topdown/Caddyfile.static` with the frozen copy in `/var/lib/topdown/static`. It prints `static site: 200`. It does not depend on the checkout, `npm` or Docker images. Then report what failed, with `GIT_SHA=none docker compose -f deploy/docker-compose.yml logs --tail=200 server web` (if the containers still exist) and `tail deploy/deploy-history.log`.

To try the stack again later: `systemctl disable --now topdown-shooter.service`, then `deploy/deploy.sh`.

## Local check of the stack (any machine with Docker)

```sh
docker build -f deploy/server.Dockerfile --target server -t topdown-server:local .
docker build -f deploy/server.Dockerfile --target web -t topdown-web:local .
GIT_SHA=local WEB_BIND=127.0.0.1:18080 docker compose -p topdown-local -f deploy/docker-compose.yml up -d --no-build
curl -sS http://127.0.0.1:18080/api/health
GIT_SHA=local docker compose -p topdown-local -f deploy/docker-compose.yml down
```

`PUBLIC_ORIGIN` stays `https://hordes.sevend.io`, so a browser on `http://127.0.0.1:18080` cannot open the room WebSocket. Set `PUBLIC_ORIGIN=http://127.0.0.1:18080` for that, or use `npm run dev`. The CI job `docker` builds both targets, validates the Caddyfile and runs this stack on every push, checking `/api/health`, `/` and `/j/ABCD`.
