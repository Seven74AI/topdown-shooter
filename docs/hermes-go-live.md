# Hermes: VPS go-live (Story 2.2)

For **Hermes**, on the VPS. Written 2026-11-22. The full reference, with every command, is `docs/deploy.md`. This page tells you what to do, in what order, what not to touch, and what to report.

## Your role

**Deploy and report only.** Do not implement stories, write code or edit tracked files in the repo. The rest of `HANDOFF.md` is for the coding sessions. If something in the repo looks wrong, report it; don't fix it.

## What you are deploying

- `master` of `Seven74AI/topdown-shooter`, at `e7e7008` or newer. CI is green on it, including the `docker` job that builds both images and runs the stack.
- It replaces today's setup with a Docker Compose stack:
  - **Today:** Caddy from `topdown-shooter.service` serves the static client on 127.0.0.1:8080, and `topdown-server.service` runs the game server on :2567.
  - **After:** two containers. `web` (Caddy) on **127.0.0.1:8080**, where the Cloudflare Tunnel `sevend-io-stream` already points. `server` (the game server) is reachable only through `web`.
- The Cloudflare Tunnel config does **not** change.
- This is the first real-internet run of the whole game: online co-op, the build phase, the shop, barricades and the five-wave run.

## ⚠️ If you already ran `git pull` on master

The live Caddy reads `/root/topdown-shooter/deploy/Caddyfile` when it starts. After the pull, that file is the **container** config, so if the old Caddy restarts now (crash, `systemctl restart`, reboot), the site serves nothing.

The site still works as long as nothing restarts. Do **step 2 below right away**: it gives the old unit its own frozen Caddyfile. Don't restart `topdown-shooter.service` before step 2 is done.

Step 2 copies `apps/client/dist` as the fallback site. That folder holds the last client that was *built*, which is still the old one: a pull does not rebuild it. So the copy is still the site that is live now.

## Steps

Run as root. Follow `docs/deploy.md` › **First-time setup**, steps 1 to 6, exactly as written. In short:

1. **Record and back up** the current units and the cloudflared config (deploy.md step 1). Keep the output for the report.
2. **Prepare the static fallback while the old site still runs** (deploy.md step 2):
   - a frozen copy of the site in `/var/lib/topdown/static`;
   - `/etc/topdown/Caddyfile.static`;
   - a systemd drop-in that points `topdown-shooter.service` at that Caddyfile. Copy the binary path and flags from the old `ExecStart=` line; only `--config` changes.
   - Then restart that unit once and check that both `http://127.0.0.1:8080/` and `https://hordes.sevend.io/` give 200. **If this fails, stop and report.**
3. **Check Docker:** `docker version --format '{{.Server.Version}}'` must be **28.0 or newer**, `docker compose version` must be v2, and there must be at least ~2 GB free on `/`. **If Docker is older than 28, stop and report**: the designer upgrades it first. This matters for security, because only Docker 28+ keeps a port published on 127.0.0.1 truly local.
4. **Update the checkout:** `cd /root/topdown-shooter && git fetch && git checkout master && git pull --ff-only`.
5. **Switch over:**
   ```sh
   systemctl disable --now topdown-shooter.service topdown-server.service
   ss -ltnp | grep -E ':(8080|2567) ' || echo "8080 and 2567 are free"
   deploy/deploy.sh
   ```
   - The first build takes a few minutes and ends with `==> deployed <sha>`.
   - If it ends with `!!` lines instead, run the **one-line revert** in deploy.md › *If anything fails* (back to the static site) and report.
6. **Verify:** run every check in deploy.md step 6 and note each result. In short, expect:
   - `/api/health` → 200 `{"ok":true,...}`
   - `/` → `Cache-Control: no-cache`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, and no `Server` header of ours
   - a hashed `/assets/index-*.js` → `public, max-age=31536000, immutable`
   - `/j/ABCD` → 200, `/assets/nope.js` → 404, `/api` → 404
   - the WebSocket upgrade with `Origin: https://evil.example` → **403**
   - `docker compose -f deploy/docker-compose.yml ps` → `server` (healthy) and `web`, both Up

   The two-browser check (Create game in one, join from the other) is the designer's: tell them the site is ready for it.

**Known trap:** if the site answers **502 through the tunnel** while `curl http://127.0.0.1:8080/api/health` works on the VPS, cloudflared is probably using IPv6 (`::1`). Back up the tunnel config, then change its service URL to `http://127.0.0.1:8080` (see the end of deploy.md step 6). This is the only tunnel change allowed.

## Don't

- Don't touch anything that isn't ours: Hermes's own containers and images, other services, other ports.
- Never publish port 8080 on a public interface, and don't change `WEB_BIND`.
- Never run `docker system prune` or `docker image prune` without `--filter label=org.topdown.app=topdown`. Ask the designer before running `docker builder prune` (the cache is shared).
- Don't set `ALLOW_TEST_SCENARIOS=1` or any `DEV_*` variable. The server runs with `NODE_ENV=production`, which ignores the dev switches anyway, but keep the environment clean. The 4-phone test day turns `ALLOW_TEST_SCENARIOS` on separately.
- Don't edit tracked files on the VPS. After deploy, the checkout sits on a **detached HEAD**; that is expected.
- Don't touch GitHub Pages or CI (deploy.md step 7 is for the developer and the designer).

## If anything fails

- **The stack worked before and a new deploy failed:** `deploy/rollback.sh`.
- **The stack never came up (first deploy):** the one-line revert in deploy.md › *If anything fails*. It prints `static site: 200`.
- In both cases, report what failed with:
  - `GIT_SHA=none docker compose -f deploy/docker-compose.yml logs --tail=200 server web`
  - `tail deploy/deploy-history.log`
  - `docker inspect topdown-server-1 --format '{{.State.OOMKilled}}'`

## Report back

Send the designer (who passes it to the coding session):

```
Go-live report (Story 2.2)
- Deployed sha: <from "==> deployed <sha>">
- Docker version: <x>   Compose: <x>   Free disk before/after: <x>/<x>
- Step 1 backups: done / where (paste systemctl cat topdown-shooter.service and the tunnel ingress for hordes.sevend.io)
- Step 2 fallback: drop-in content + restart check results (127.0.0.1 and hordes.sevend.io codes)
- Step 6 checks: health / headers / asset cache / j/ABCD / nope.js / api / evil-origin WS / compose ps → each result
- Memory: docker stats --no-stream topdown-server-1 topdown-web-1
- Anything unexpected, anything you changed outside these steps (e.g. tunnel URL), rollbacks done
```

## Every later release (after go-live)

After a merge to `master` with CI green: `cd /root/topdown-shooter && deploy/deploy.sh`. A deploy ends any game in progress, so ask the designer for a quiet moment first. Report the sha.
