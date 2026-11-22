# Handoff: topdown-shooter

Session handoff, updated 2026-11-21 (end of the second long session). **The project is on GitHub** (`Seven74AI/topdown-shooter`, branch `master`). Start a new Claude Code session with that repository selected and paste the **"Prompt for the new session"** block at the bottom.

## 1. The project in one paragraph

A 2D top-down **online co-op zombie horde shooter for 2–4 friends, played in a phone browser from a shared link** (no install). A run is 10 waves (~20–25 min): the district decays from a normal evening to total collapse (5 decay stages that change gameplay). Between waves there is a 30 s build phase with a personal-wallet roguelike shop. Wave 10 has a boss (the Behemoth), then an extract-or-stay vote; staying starts endless mode. Unlocks carry over between runs. Art direction: **"Dead City"** (gritty, realistic, rainy city at night). A passion project for the designer and their friend group, built with AI agents using the **BMAD method**.

## 2. Where we are

| Phase | Status | Where |
| --- | --- | --- |
| Brief, GDD, Architecture, Epics (10 epics, 101 stories) | ✅ | `_bmad-output/planning-artifacts/` |
| Implementation readiness + fixes | ✅ READY | `implementation-readiness-report-2026-11-21.md` |
| **Epic 1, core combat on one phone** | ✅ code done and reviewed (1.1–1.11 done); two **human** steps open (see §5) | story files `_bmad-output/implementation-artifacts/1-*.md` |
| **Epic 2, online co-op** | 🔨 in progress. 2.1 ✅ and 2.3 ✅. 2.2 (deploy): code and review fixes done, **waiting for the VPS go-live**. 2.4 (server runs the fight): code done and reviewed, **4 open review items**. 2.5–2.11 ready-for-dev | `2-*.md`, `sprint-status.yaml` |
| Epics 3–10 | backlog (stories written at the start of each epic, from the real code) | `epics.md` |

`_bmad-output/implementation-artifacts/sprint-status.yaml` is the source of truth for story status.

**What the game does today** (play it: GitHub Pages link in §5, or `npm run dev`):
- Solo (offline): twin-stick touch controls with aim assist, WASD + mouse on desktop; Pistol, SMG, Hunting Rifle, Machete (2 slots + swap button); Walkers in growing waves (N × 40, 150 alive cap, last 5 marked and rushing); health, Game over, Restart.
- Debug: `?debug=1` overlay (FPS, tick ms), `?stress=150` phone benchmark, `?loadout=a,b`, `?tune=1` live control tuning, dev-only cheats (⚙ / backtick).
- Online (needs the game server: `npm run dev` locally, or the VPS once live): Create game → 4-letter code + share link `/j/<code>` → friends join → Ready → Start → the server runs the fight at 20 Hz and every phone shows all players. **Zombies are not drawn online yet** (horde stream = Story 2.5); no prediction yet (2.6).

## 3. How we work (keep doing this)

- **BMAD loop per story:** `gds-create-story` (rich story file from the real code) → build → **independent review by a fresh agent** → fix every finding → mark done → push to `master`. Review findings and fixes are recorded in each story file ("Senior Developer Review (AI)").
- **Parallel agents** (the designer asked for this; up to 10 at once): builders run in their own git worktrees (`isolation: "worktree"`) on branches `story-x-y`, push, and the main session merges into the work branch, resolves conflicts, runs `npm run typecheck && npm run lint && npm test && npm run build`, browser-checks with Playwright, dispatches a reviewer, fixes, then pushes to `master`. Pick parallel work by file overlap (stories touching different files run together; dependent stories wait).
- **Pushing:** the designer allowed pushing to `master` ("you can push"). Work happens on the session's `claude/...` branch; reviewed work is fast-forwarded to `master`.
- `.claude/worktrees/` is gitignored (agent worktrees live there).
- Verify in a real browser (Playwright + preinstalled Chromium) for anything visual; say plainly what wasn't verified.

**Lessons the reviews keep finding (tell builders up front):** simulation timers count ticks (no float seconds); fire cooldown rule in `combat/firing.ts`; no per-frame / per-tick allocation; edge flags (swap/consumable) fire once per input seq and `LocalSimHost` latches them; Phaser 4 ≠ Phaser 3 (verify in `node_modules/phaser/types`; e.g. `setTint` + `setTintMode`); Phaser reuses scene objects on restart (reset state in `create`, pass restart data); tests of one mechanic pass `systems: { waves: () => {} }`; Colyseus: never pass zod to `onMessage` (use `this.net.guard`), join refusals are `ServerError(526, reason)`, use `bootTestServer()`; exact version pins (`.npmrc save-exact`); no gameplay numbers inline (balance JSON).

## 4. Key decisions (details in the docs and decision logs)

- **Design:** 4 pillars (Horde chaos, Build your stand, A city that falls, Better together). Twin-stick, landscape, auto-fire while aiming, 8° aim assist (only when the raw aim would miss).
- **Tech:** Phaser 4.2 · Colyseus 0.18 (`@colyseus/core` + `ws-transport` + `schema` 5; client `@colyseus/sdk`) · TypeScript 6.0 · Vite 8 · Preact · npm workspaces (`apps/client`, `apps/server`, `packages/shared`). Server-authoritative 20 Hz, shared engine-free simulation.
- **Hermes = deploy and report only.** On 2026-11-21 Hermes built its own version of Story 2.2 in parallel; the designer chose the reviewed version from this repo, and Hermes's commit was dropped from `master`. From now on, stories are built here and Hermes only deploys (`docs/deploy.md`) and reports results. Hermes already made Story 2.1 live: `topdown-server.service` on :2567, with Caddy routing `/api`.
- **Hosting:** the designer's VPS (also runs the **Hermes** agent). Game at **https://hordes.sevend.io**. Docker Compose (Docker is installed). HTTPS/WSS by the existing **Cloudflare Tunnel** `sevend-io-stream` → 127.0.0.1:8080; Caddy plain HTTP behind it. The cloud session **cannot reach the VPS**: go-live steps run on the VPS (Hermes).
- **Epic 2 designer decisions (2026-11-21):** downed countdown pauses while being revived; in-run menu pauses solo, online keeps running.
- **GitHub Pages:** kept TEMPORARILY in CI (`pages` / `deploy-pages` jobs) because the Epic 1 playtest links point there; remove once the VPS is verified (docs/deploy.md step 7).

## 5. Open items for the designer (human steps)

1. **VPS go-live (Story 2.2, Task 9):** give Hermes the message in §6. Then report the results; Story 2.2 is marked done after that.
2. **Epic 1 controls playtest (Story 1.12):** designer + ≥ 2 friends, form in `docs/playtests/epic-1-controls.md`. Links: `https://seven74ai.github.io/topdown-shooter/?loadout=pistol,machete&tune=1` and `...?loadout=smg,hunting_rifle&tune=1`.
3. **Speed test (Story 1.11):** done on iPhone 15 Pro (target met) and Honor 10 (58 FPS avg, rare hitches; 2018 phone). Still nice to have: a 2020–2021 mid-range Android (Pixel 5 / Galaxy A52). Results in `docs/perf/epic-1-stress.md`.
4. Working title still "topdown-shooter". Order of future districts later.

## 6. Message for Hermes (VPS go-live, after `master` has the Story 2.2 review fixes)

> Please don't implement stories; only deploy and report. On the VPS, read `docs/deploy.md` (the "What runs there right now" part includes what you found), do First-time setup step 2 (back up and freeze the current site) **before** pulling, then `git fetch && git checkout master && git pull --ff-only` in `/root/topdown-shooter`, and follow the doc from the top (it backs up the current setup first, replaces the old `topdown-shooter.service` static site with the Docker Compose stack via `deploy/deploy.sh`, and lists the checks: `https://hordes.sevend.io/api/health` 200, cache headers, `/j/ABCD` 200, a foreign-origin WebSocket refused with 403, two browsers creating and joining a game). If anything fails, use the rollback in the doc. Report every check's result back.

## 7. Next steps for the new session

1. Read `sprint-status.yaml` and the open story files: **2.4**, whose "Senior Developer Review (AI)" section has 4 unticked items. The input-backlog drain matters most, before 2.6. Fix them, then mark 2.4 done. **2.2** has its review fixes merged and waits for the VPS.
2. First small fix: `apps/server/src/test/bootTestServer.ts` uses fixed ports (2600 + pool id), which collide when parallel agents run tests at the same time. Use random free ports.
3. Continue Epic 2 with parallel agents: **2.5 horde stream** (zombies drawn online) next; 2.6 prediction, 2.7 server-confirmed hits, 2.8 downed/revive, 2.9 rings + teammate arrows, 2.11 in-run menu can partly run in parallel (check file overlap; each story file has integration notes). 2.10 is the designer's 4-phone 4G test.
4. After the VPS is live: point the playtest links at hordes.sevend.io and remove the temporary Pages CI jobs.

## 8. How the designer likes to work

- Plain English, short messages. They often answer "ok", "C" or a letter. Treat a bare "ok" as acceptance of all proposals in the previous message, and say so.
- **Facilitative mode:** propose concrete designs **with numbers** and a recommendation; they keep or change.
- They love **playable visual prototypes** over text descriptions.
- Not deeply technical: explain technical choices by their effect on the game.
- They want progress, not ceremony; keep BMAD steps moving; parallelize with agents.

## 9. Environment gotchas

- BMAD v6.12.4 (modules bmm + gds v0.7.2) is installed in the repo (`_bmad/`, `.claude/skills/`). The skills load only when the repo is the working directory.
- The cloud container intercepts TLS: Docker image builds that run `npm ci` fail locally (environment limit; CI builds them fine).
- Visual references (style labs, decay prototype) are linked in the brief folder; `style-lab-r3.html` has canvas code for the Dead City look.

---

## Prompt for the new session

> I'm continuing my game project topdown-shooter. Read `HANDOFF.md` at the repo root and follow it. Epic 1 is done (two human steps open), Epic 2 is in progress. Next: finish Story 2.4's review fixes, then continue Epic 2 (2.5 horde stream next) with parallel agents in worktrees, reviewing every story with a fresh agent before pushing to master. Keep working in facilitative mode as described in the handoff.
