# Handoff: topdown-shooter

Session handoff, updated 2026-11-22 (end of the third session: Epic 2 coding done). **The project is on GitHub** (`Seven74AI/topdown-shooter`, branch `master`). Start a new Claude Code session with that repository selected and paste the **"Prompt for the new session"** block at the bottom.

## 1. The project in one paragraph

A 2D top-down **online co-op zombie horde shooter for 2–4 friends, played in a phone browser from a shared link** (no install). A run is 10 waves (~20–25 min): the district decays from a normal evening to total collapse (5 decay stages that change gameplay). Between waves there is a 30 s build phase with a personal-wallet roguelike shop. Wave 10 has a boss (the Behemoth), then an extract-or-stay vote; staying starts endless mode. Unlocks carry over between runs. Art direction: **"Dead City"** (gritty, realistic, rainy city at night). A passion project for the designer and their friend group, built with AI agents using the **BMAD method**.

## 2. Where we are

| Phase | Status | Where |
| --- | --- | --- |
| Brief, GDD, Architecture, Epics (10 epics, 101 stories) | ✅ | `_bmad-output/planning-artifacts/` |
| Implementation readiness + fixes | ✅ READY | `implementation-readiness-report-2026-11-21.md` |
| **Epic 1, core combat on one phone** | ✅ code done and reviewed (1.1–1.11 done); two **human** steps open (see §5) | story files `_bmad-output/implementation-artifacts/1-*.md` |
| **Epic 2, online co-op** | 🔨 coding done: 2.1, 2.3–2.9, 2.11 ✅ (each reviewed by a fresh agent, fixes in the story files). 2.2 (deploy) **waits for the VPS go-live**. 2.10: dev parts (overlay, counters, bots, results doc) built in this session's last step (check its status); **the 4-phone 4G test itself is the designer's** | `2-*.md`, `sprint-status.yaml` |
| Epics 3–10 | backlog (stories written at the start of each epic, from the real code) | `epics.md` |

`_bmad-output/implementation-artifacts/sprint-status.yaml` is the source of truth for story status.

**What the game does today** (play it: GitHub Pages link in §5, or `npm run dev`):
- Solo (offline): twin-stick touch controls with aim assist, WASD + mouse on desktop; Pistol, SMG, Hunting Rifle, Machete (2 slots + swap button); Walkers in growing waves (N × 40, 150 alive cap, last 5 marked and rushing); health, Game over, Restart.
- Debug: `?debug=1` overlay (FPS, tick ms), `?stress=150` phone benchmark, `?loadout=a,b`, `?tune=1` live control tuning, dev-only cheats (⚙ / backtick).
- Online (needs the game server: `npm run dev` locally, or the VPS once live): Create game → 4-letter code + share link `/j/<code>` → friends join → Ready → Start → the server runs the fight at 20 Hz.
  - Zombies streamed in binary (2.5, ~24 KB/s per phone with 150 in view); own survivor predicted, others 100–150 ms behind (2.6); own shots instant, hits decided by the server (2.7); downed / revive / out / team wipe → Results → Back to lobby in the same room (2.8); slot-coloured rings, names, teammate edge arrows (2.9); ☰ / Esc in-run menu, Leave (2.11; pauses solo only).
  - `?lag=<rttMs>&jitter=<ms>` simulates a bad connection (dev throttle, release builds too).

## 3. How we work (keep doing this)

- **BMAD loop per story:** `gds-create-story` (rich story file from the real code) → build → **independent review by a fresh agent** → fix every finding → mark done → push to `master`. Review findings and fixes are recorded in each story file ("Senior Developer Review (AI)").
- **Parallel agents** (the designer asked for this; up to 10 at once): builders run in their own git worktrees (`isolation: "worktree"`) on branches `story-x-y`, push, and the main session merges into the work branch, resolves conflicts, runs `npm run typecheck && npm run lint && npm test && npm run build`, browser-checks with Playwright, dispatches a reviewer, fixes, then pushes to `master`. Pick parallel work by file overlap (stories touching different files run together; dependent stories wait).
- **Pushing:** the designer allowed pushing to `master` ("you can push"). Work happens on the session's `claude/...` branch; reviewed work is fast-forwarded to `master`.
- `.claude/worktrees/` is gitignored (agent worktrees live there).
- Verify in a real browser (Playwright + preinstalled Chromium) for anything visual; say plainly what wasn't verified.

**Session 3 notes:** the Agent tool's `isolation: "worktree"` is denied here, so create worktrees by hand (`git worktree add -b story-x-y .claude/worktrees/story-x-y claude/epic-2-continue`) and tell each builder its path; give each agent its own server/Vite ports (temporary Vite config merging `apps/client/vite.config.ts` with a `/api` proxy). Check `git status` before committing a merge (an unstaged fix slipped out once). Python Playwright + Chromium are preinstalled; `window.__game.loop.sleep()/wake()` simulates a hidden tab.

**Lessons the reviews keep finding (tell builders up front):** simulation timers count ticks (no float seconds); fire cooldown rule in `combat/firing.ts`; no per-frame / per-tick allocation; edge flags (swap/consumable) fire once per input seq and `LocalSimHost` latches them; Phaser 4 ≠ Phaser 3 (verify in `node_modules/phaser/types`; e.g. `setTint` + `setTintMode`); Phaser reuses scene objects on restart (reset state in `create`, pass restart data); tests of one mechanic pass `systems: { waves: () => {} }`; Colyseus: never pass zod to `onMessage` (use `this.net.guard`), join refusals are `ServerError(526, reason)`, use `bootTestServer()`; exact version pins (`.npmrc save-exact`); no gameplay numbers inline (balance JSON).

## 4. Key decisions (details in the docs and decision logs)

- **Design:** 4 pillars (Horde chaos, Build your stand, A city that falls, Better together). Twin-stick, landscape, auto-fire while aiming, 8° aim assist (only when the raw aim would miss).
- **Tech:** Phaser 4.2 · Colyseus 0.18 (`@colyseus/core` + `ws-transport` + `schema` 5; client `@colyseus/sdk`) · TypeScript 6.0 · Vite 8 · Preact · npm workspaces (`apps/client`, `apps/server`, `packages/shared`). Server-authoritative 20 Hz, shared engine-free simulation.
- **Hermes = deploy and report only.** On 2026-11-21 Hermes built its own version of Story 2.2 in parallel; the designer chose the reviewed version from this repo, and Hermes's commit was dropped from `master`. From now on, stories are built here and Hermes only deploys (`docs/deploy.md`) and reports results. Hermes already made Story 2.1 live: `topdown-server.service` on :2567, with Caddy routing `/api`.
- **Hosting:** the designer's VPS (also runs the **Hermes** agent). Game at **https://hordes.sevend.io**. Docker Compose (Docker is installed). HTTPS/WSS by the existing **Cloudflare Tunnel** `sevend-io-stream` → 127.0.0.1:8080; Caddy plain HTTP behind it. The cloud session **cannot reach the VPS**: go-live steps run on the VPS (Hermes).
- **Epic 2 designer decisions (2026-11-21):** downed countdown pauses while being revived; in-run menu pauses solo, online keeps running.
- **2026-11-22:** revive stays 3 s at full zombie damage ("improve yourself"; seeded sims: with the Pistol a revive almost never succeeds, with the SMG ~46 %; all Pistol runs wipe in wave 2 → for the Epic 3 balance pass); a downed player's gun keeps reloading.
- **Netcode (2.4–2.7):** the server applies one input per tick; a lasting backlog drains after 2 s (skip every 2nd tick back to 2 queued); starved ticks hold still and pause the player's weapon; dropped inputs get a dry weapon tick only against "weapon debt" from earlier starved ticks (no speed-up from input floods). Reversed hits (harness): 0 % standing, ~1–3 % kiting at 150 ms, ~8 % kiting at 300 ms → 2.10 decides on the rewind upgrade.
- **GitHub Pages:** kept TEMPORARILY in CI (`pages` / `deploy-pages` jobs) because the Epic 1 playtest links point there; remove once the VPS is verified (docs/deploy.md step 7).

## 5. Open items for the designer (human steps)

1. **VPS go-live (Story 2.2, Task 9):** give Hermes the message in §6. Then report the results; Story 2.2 is marked done after that.
2. **Epic 1 controls playtest (Story 1.12):** designer + ≥ 2 friends, form in `docs/playtests/epic-1-controls.md`. Links: `https://seven74ai.github.io/topdown-shooter/?loadout=pistol,machete&tune=1` and `...?loadout=smg,hunting_rifle&tune=1`.
3. **Speed test (Story 1.11):** done on iPhone 15 Pro (target met) and Honor 10 (58 FPS avg, rare hitches; 2018 phone). Still nice to have: a 2020–2021 mid-range Android (Pixel 5 / Galaxy A52). Results in `docs/perf/epic-1-stress.md`.
4. Working title still "topdown-shooter". Order of future districts later.

## 6. Message for Hermes (VPS go-live, after `master` has the Story 2.2 review fixes)

> Please don't implement stories; only deploy and report. On the VPS, read `docs/deploy.md` (the "What runs there right now" part includes what you found), do First-time setup step 2 (back up and freeze the current site) **before** pulling, then `git fetch && git checkout master && git pull --ff-only` in `/root/topdown-shooter`, and follow the doc from the top (it backs up the current setup first, replaces the old `topdown-shooter.service` static site with the Docker Compose stack via `deploy/deploy.sh`, and lists the checks: `https://hordes.sevend.io/api/health` 200, cache headers, `/j/ABCD` 200, a foreign-origin WebSocket refused with 403, two browsers creating and joining a game). If anything fails, use the rollback in the doc. Report every check's result back.

## 7. Next steps for the new session

1. **Story 2.10:** if its dev parts are in `review`, have a fresh agent review them, fix, push. Then the designer runs the 4-phone test (how-to in `docs/perf/epic-2-network.md`) and reports numbers; record them; if reversed hits ≥ 1 in 20, create the rewind follow-up story (AC 3).
2. **VPS go-live (2.2):** unchanged, see §5/§6. `master` now also carries all of Epic 2's online play, so the go-live is the first real-internet run.
3. After both: Epic 2 retrospective (`gds-retrospective`), point playtest links at hordes.sevend.io, remove the temporary Pages CI jobs (docs/deploy.md step 7).
4. Then Epic 3 (build phase, shop, economy): write its stories from the real code (`gds-create-story`), same parallel-worktree loop.
5. Small known leftovers (noted in story files): stacked teammate arrows when close together (8.7), return spot has no free-spot search (needed with Epic 4 buildings), "Reviving…" line from the mirror can disagree near 1.2 m, zombie hit flash isn't paused in solo pause.

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

> I'm continuing my game project topdown-shooter. Read `HANDOFF.md` at the repo root and follow it. Epic 1 is done (two human steps open); Epic 2's coding is done (2.2 waits for the VPS, 2.10 for the 4-phone test). Next: finish Story 2.10's dev review, help me run the 4-phone test and the VPS go-live, then the Epic 2 retrospective and Epic 3, with parallel agents in worktrees and a fresh-agent review of every story before pushing to master. Keep working in facilitative mode as described in the handoff.
