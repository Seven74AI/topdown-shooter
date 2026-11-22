# Hermes → Claude handoff: VPS go-live done (2026-11-22)

Hermes deployed `master` (`95d271177a9b`) to the VPS and verified it. **Story 2.2 go-live is complete.** The Docker stack has actually been live since ~16 h earlier (`012d1c4`); today's work was a "later release" deploy bringing it up to `95d2711` (Epic 3 code).

## What Hermes did

1. Pulled `master` to `95d2711`.
2. Found the first-time go-live already done: Docker Compose stack `topdown` live, old systemd units (`topdown-shooter.service`, `topdown-server.service`) disabled + inactive, ports 8080/2567 held by docker-proxy.
3. `deploy/deploy.sh` → `==> deployed 95d271177a9b`; `deploy/deploy-history.log` now has `95d271177a9b ok`.
4. Verified every deploy.md step-6 check (all green).

## Verified (all green)

- `/api/health` 200 `{"ok":true,"rooms":0,...}`
- Headers: `no-cache`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`; no `Server` of ours
- Hashed asset `index-Bgu-YjSQ.js` → `public, max-age=31536000, immutable`
- `/j/ABCD` 200 · `/assets/nope.js` 404 · `/api` 404
- Origin check: evil origin → 403, good origin → 101 (`ws_origin_refused` logged)
- `compose ps`: server (healthy) + web, both Up
- Docker 29.5.2 · Compose v5.1.4 · 17 G free on `/`
- Memory: server 59 MiB / 768 MiB, web 17 MiB / 128 MiB

## Doc fix in this push

`docs/deploy.md` step 6: the evil-origin WebSocket check returned **404** as written, because curl negotiates HTTP/2 with Cloudflare and the `Upgrade: websocket` header is ignored over h2 (h2 upgrades via extended CONNECT, RFC 8441). Added `--http1.1` + a comment. The origin check itself was always correct (`beforeUpgrade` in `apps/server/src/app.ts`). Verified direct-to-Caddy (403) and through the tunnel with `--http1.1` (403).

## Flag (not fixed): static-site fallback never prepared

deploy.md step 2 (frozen static site + drop-in repointing `topdown-shooter.service`) was never done on this VPS. The doc's one-line "revert to static site" (`systemctl enable --now topdown-shooter.service`) would therefore serve nothing — the unit's `ExecStart` still points at the container Caddyfile (proxies to `server:2567`, serves `/srv/client`; neither exists on the host). `deploy/rollback.sh` IS the working recovery path (known-good images `012d1c4` and `95d2711`), so this only matters if the stack cannot come up at all. Preparing the fallback needs `/etc` + `systemctl` writes; Hermes offered, needs explicit designer OK.

## What this unblocks for Claude

1. **Story 2.2 done** — mark it; drop open item 1 from `HANDOFF.md` §5 and §7.3's "needs the VPS live first".
2. **deploy.md step 7 (GitHub Pages retirement):** delete the `pages` / `deploy-pages` CI jobs, repoint the Epic 1 playtest links at `https://hordes.sevend.io`, designer disables Pages in GitHub settings.
3. **4-phone 4G test (2.10) + Milestone 1 playtest (4.10)** can now run on the live VPS.

## Ops facts

- cloudflared runs as a **direct process** (`/usr/local/bin/cloudflared tunnel --no-autoupdate run --token …`), NOT a systemd unit — `systemctl cat cloudflared` is empty. Dashboard-managed (token) tunnel; ingress `hordes.sevend.io` → `http://localhost:8080`.
- Old systemd units are disabled + inactive; the Docker stack replaced them.
- VPS checkout left on `master` at `95d2711`.

## Suggested skills for Claude

- `bmad-method` (gds loop) — Epic 4 story work
- `code-review` — fresh-agent review of every story
- `github` — Pages retirement / CI job removal (deploy.md step 7)
