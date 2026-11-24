# Handoff: topdown-shooter

Session handoff, updated 2026-11-24 (end of the seventh session: **Epic 5 done** — round D (5.10 Floodlight + med station, 5.11 Gear, 5.12 Consumables), 5.13 card shop, 5.14 Bear trap, building UX 5.15–5.24 (5.22 folded into 5.21, 5.25 into 5.23), 5.26–5.27 build-bar icons, 5.28 early weapon card art, start money 200, solo Behemoth HP × 0.4; retro accepted (`epic-5-retro-2026-11-24.md`, actions A1–A10). Epic 6 story files written and merged into 3 build rounds; Epic 7 and Epic 8 decided. Next: **Epic 6**, with builders in CLOUD SESSIONS). **The project is on GitHub** (`Seven74AI/topdown-shooter`, branch `master`). Start a new Claude Code session with that repository selected and paste the **"Prompt for the new session"** block at the bottom.

## 1. The project in one paragraph

A 2D top-down **online co-op zombie horde shooter for 2–4 friends, played in a phone browser from a shared link** (no install). A run is 10 waves (~20–25 min): the district decays from a normal evening to total collapse (5 decay stages that change gameplay). Between waves there is a 30 s build phase with a personal-wallet roguelike shop. Wave 10 has a boss (the Behemoth), then an extract-or-stay vote; staying starts endless mode. Unlocks carry over between runs. Art direction: **"Dead City"** (gritty, realistic, rainy city at night). A passion project for the designer and their friend group, built with AI agents using the **BMAD method**.

## 2. Where we are

| Phase | Status | Where |
| --- | --- | --- |
| Brief, GDD, Architecture, Epics (10 epics, 101 stories) | ✅ | `_bmad-output/planning-artifacts/` |
| Implementation readiness + fixes | ✅ READY | `implementation-readiness-report-2026-11-21.md` |
| **Epic 1, core combat on one phone** | ✅ code done and reviewed (1.1–1.11 done); two **human** steps open (see §5) | story files `_bmad-output/implementation-artifacts/1-*.md` |
| **Epic 2, online co-op** | ✅ coding done and reviewed: 2.1, 2.3–2.9, 2.11, **2.12 rewound hit testing** (added: Runners made reversed hits obvious). 2.2 ✅ **live at https://hordes.sevend.io** (Hermes, 2026-11-22: `docs/hermes-go-live-report-2026-11-22.md`); 2.10 dev parts done, **the 4-phone 4G test is the designer's**. Retro: `epic-2-retro-2026-11-22.md` | `2-*.md` |
| **Epic 3, build phase, shop, economy** | ✅ 3.1–3.10 done (each reviewed by a fresh agent, big fixes re-reviewed). Retro accepted: `epic-3-retro-2026-11-22.md` (§11 = **EPIC 4 BRIEF**) | `3-*.md` |
| **Epic 4, Downtown and city decay (Milestone 1)** | ✅ 4.1–4.9, 4.11 readability pass, 4.12 all 4.11 objects in game code (particle fire D), 4.13 Android graphics-loss fix. **4.10 playtest parked** (designer: "way later"; plan ready in `docs/playtests/milestone-1.md`). Retro: `epic-4-retro-2026-11-23.md` (§11 = **EPIC 5 BRIEF**, line 20 added) | `4-*.md` |
| **Epic 5, full arsenal and bestiary** | ✅ **done** (5.1–5.28; 5.22 is in 5.21, 5.25 is in 5.23). Retro accepted: `epic-5-retro-2026-11-24.md` (actions A1–A10). Decisions: `docs/epic-5-decisions.md`. Alignment check: `docs/alignment/alignment-check-2026-11-23.md` | `5-*.md` |
| **Epic 6** | **Round 1 done 2026-11-24** (session 8): 6.1 10-wave run, 6.3 blackout lighting, 6.5 the Behemoth arrives — each fresh-reviewed, medium/high fixes re-reviewed, on master `a52c7b9`. Build-time decisions 6.3 B1–B3, 6.5 B1–B3 at the end of `docs/epic-6-decisions.md`. Rounds — R1: 6.1, 6.3, 6.5 ✅ · R2: 6.2+6.4, 6.6+6.7, 6.8 · R3: 6.9+6.10, 6.11+6.12. Brief: `docs/epic-6-brief.md` (give it to every builder). Decisions + look picks: `docs/epic-6-decisions.md` | `6-*.md` |
| Epics 7–10 | backlog. Epic 7 decided (`docs/epic-7-decisions.md`, ideas `docs/ideas/epic-7/`); Epic 8 decided (`docs/ideas/epic-8/decisions.md`); change proposals `sprint-change-proposal-2026-11-2*.md` | `epics.md` |

`_bmad-output/implementation-artifacts/sprint-status.yaml` is the source of truth for story status.

**What the game does today** (play it: **https://hordes.sevend.io**, or `npm run dev`):
- Solo (offline): twin-stick touch controls with aim assist, WASD + mouse on desktop; Pistol, SMG, Hunting Rifle, Machete (2 slots + swap button); Walkers in growing waves (N × 40, 150 alive cap, last 5 marked and rushing); health, Game over, Restart.
- Debug: `?debug=1` overlay (FPS, tick ms), `?stress=150` phone benchmark, `?loadout=a,b`, `?tune=1` live control tuning, dev-only cheats (⚙ / backtick).
- Online (needs the game server: `npm run dev` locally, or the VPS once live): Create game → 4-letter code + share link `/j/<code>` → friends join → Ready → Start → the server runs the fight at 20 Hz.
  - Zombies streamed in binary (2.5, ~24 KB/s per phone with 150 in view); own survivor predicted, others 100–150 ms behind (2.6); own shots instant, hits decided by the server (2.7); downed / revive / out / team wipe → Results → Back to lobby in the same room (2.8); slot-coloured rings, names, teammate edge arrows (2.9); ☰ / Esc in-run menu, Leave (2.11; pauses solo only).
  - `?lag=<rttMs>&jitter=<ms>` simulates a bad connection (dev throttle, release builds too).
  - 2.12: the server rewinds zombies to what the shooter saw (≤ 6 ticks / 300 ms). Reversed hits at 150 ms kiting Runners: 11–20 % → 0.3–1.8 %. Spread is keyed to the input seq (client and server agree); the server accepts only seq + 1 and logs `spread_cancel_suspect` / `seq_gap_suspect` (never kicks).
- **Epic 3 (build phase):** a five-wave run (lobby → build → wave × 5 → "You held out!" results), sized by player count (× 0.4 / 0.6 / 0.8 / 1.0). Build phase with a personal-wallet shop (weapons), kill pay, barricades on a 0.5 m lattice (zombies path around them with flow fields, Runners flank), turrets, repair (ceil HP), Crawlers (slow on bite), Runners. Dev switches: `?wallet=` + server `DEV_STARTING_WALLET` (both needed, else the join is refused as balance mismatch), `?zdmg=`, `?wavemix=`, `DEV_NO_WAVES`, `DEV_NO_REWIND`. Bots: `npm run bots -- --help`; five-wave sim in `tools/sims/fiveWave.ts`.

- **Epic 4 (Downtown, decay, look):** a hand-made 48 × 32 m Downtown (`tools/maps/buildDowntown.ts` generates the Tiled `.tmx`/`.tmj`; once the designer edits in Tiled, the `.tmx` becomes the source and the generator test is retired). Cover: cars, the bus and buildings stop bullets; barriers and sandbags only stop bodies (4.2). 19 spawn points opening by stage, never within 6 m of a player, barricades kept 2 m clear of every spawn (4.3). One run seed with named streams; a recorded input log replays to the same digest (4.4). Decay engine: `applyDecayStage` is the single path (server, solo, mirror, Predictor); at a build start: mutations → destroy buildings on new solids (50 % refund) → push out bodies → return downed → rebuild flow fields → banner (4.5). Stages: 1 Evening (curb cars, lit shop fronts, traffic loop), 2 Panic (4 of 6 curb cars move into the road, police lines, dumpster, sirens loop), 3 Breakdown (2 of 3 cars burn: 2 m fire zones, 10 dmg/s, 2 waves, zombies avoid fire; sandbags; heavy rain) (4.6–4.8). Dead City look drawn in code (`apps/client/src/render/city/*`, atlases with `category_name_variant` frames), night darkens per stage (`NIGHT_BY_STAGE`) (4.9). Dev: build-phase-only "Decay stage" cheat; server `DEV_DECAY_STAGES=2,3`; `DEV_ALLOW_RUN_SEED=1` + host `?seed=`.

- **Epic 5 (arsenal and bestiary):** 11 weapons (Pistol, SMG, Hunting Rifle, Machete, Shotgun, Assault Rifle, Fire Axe, Chainsaw, Flamethrower (fuel jet 6 m × 20°), Gas torch (3 m × 60°), Grenade Launcher) with upgrades I–IV (damage only; U1 marks; second looks at III–IV); melee can't hit through barricades/walls; Spitters (acid puddles, blocked by walls), the Brute (one in waves 5–6, wind-up, knockback, 1.8 m reach into narrow gaps, five looks), Bloaters (swell 20 ticks, 30 full-damage blast, chains, gas; five looks); metal barricade ladder (wood → reinforced → metal), spike trap, mine; friendly fire 50 % (Bloater blast full); one `explode(world, spec)` for every blast; the run is **6 waves** until Epic 6. All art is drawn in game code; every generated texture goes through `addGeneratedTexture` (Android redraw, Story 4.13). Dev/test: `?loadout=a:3,b:4` (release-safe, levels), `?wallet=5000` (release: solo only), `?wavemix=spitter|bloater`, `?fx=low`.

## 3. How we work (keep doing this)

**Session 8 lessons (keep):**
1. Re-review fixes for real: in 6.5 a low fix (stop pinning a player inside the boss) created a new medium (one survivor could body-block the boss); the re-review caught it. Behaviour-changing fixes, even for lows, go to the re-reviewer with "try to exploit this".
2. When master moves while a builder finishes, tell it to merge master and re-gate, and start the reviewer in parallel on the same merge (point it at the builder's merge commit once pushed).
3. `archive_session` can be refused by the auto-mode classifier on the first try; retry later, it went through.
4. Merging the 10-wave run (6.1) made wave 10 really spawn the boss: whole-run bot sims stalled until bots could fight it. Expect whole-run sims to break when a new mechanic lands in the run's ending.

**Session 7 lessons (keep):**
1. **Every builder and reviewer runs in its own cloud session** (`create_session`, branch `story-x-y`, prompt = story file + `docs/epic-6-brief.md` + `docs/epic-6-decisions.md`). **Tell each to `send_message` to `@parent` when done** — their final chat text does NOT reach this session. Also set a ~15 min `send_later` fallback check; read `list_events` if silent.
2. **Fresh-agent review in a separate cloud session** on the merged tree (story branch merged with current master); every medium/high fix gets a re-review.
3. **Run the full gate before EVERY push to master, docs-only merges included** (a docs merge broke lint once; `docs/art/**` is now ignored by eslint).
4. Archive finished child sessions right away (the designer notices open ones).
5. Merging small neighbouring stories into one builder saved time (5.21+22, 5.23+25); Epic 6 is pre-merged.
6. Retro actions A1–A10 (`epic-5-retro-2026-11-24.md`) apply to Epic 6 builders.

**Session 6 rules (designer, 2026-11-23) — the default from now on:**
1. **Builders run in their own CLOUD SESSIONS** (`create_session` tool, one container each; same repo, branch `story-x-y`; give each the story file, the EPIC 5 BRIEF and docs/epic-5-decisions.md). The main session creates them, waits for their pushed branches, merges, runs the gate, dispatches the fresh-agent review (in a local review worktree or another cloud session) and pushes to `master`. Session 6 ran 3–5 agents in ONE 4-core container: load 8–16, everything 2–3× slower, tests timed out. At most **2 heavy jobs** (builder/reviewer running tests or a browser) in the main container.
2. **Run in parallel only stories that touch different code** (round C's 5.4/5.5/5.8 all hit `explode()`/damage and had to merge one after another). Next good pair: round D + building UX 5.15–5.19 (client-only).
3. **Cheaper checks per story:** while building, run only the tests of touched areas; ONE full gate at the end (and the main session's gate after the merge); browser checks only for visual stories; a re-review looks only at the fix.
4. **Each story goes to `master` as soon as its review (and re-review of medium/high fixes) is clean** — don't wait for the round.
5. Keep: every medium/high fix gets a fresh-agent re-review; designer picks every new look from code-drawn proposals before the build (art method: game code, `docs/epic-5-decisions.md`).

- **BMAD loop per story:** `gds-create-story` (rich story file from the real code) → build → **independent review by a fresh agent** → fix every finding → mark done → push to `master`. Review findings and fixes are recorded in each story file ("Senior Developer Review (AI)").
- **Parallel agents** (superseded by the Session 6 rules above: cloud sessions, ≤ 2 heavy jobs here): builders run in their own git worktrees (`isolation: "worktree"`) on branches `story-x-y`, push, and the main session merges into the work branch, resolves conflicts, runs `npm run typecheck && npm run lint && npm test && npm run build`, browser-checks with Playwright, dispatches a reviewer, fixes, then pushes to `master`. Pick parallel work by file overlap (stories touching different files run together; dependent stories wait).
- **Pushing:** the designer allowed pushing to `master` ("you can push"). Work happens on the session's `claude/...` branch; reviewed work is fast-forwarded to `master`.
- `.claude/worktrees/` is gitignored (agent worktrees live there).
- Verify in a real browser (Playwright + preinstalled Chromium) for anything visual; say plainly what wasn't verified.

**Session 3 notes:** the Agent tool's `isolation: "worktree"` is denied here, so create worktrees by hand (`git worktree add -b story-x-y .claude/worktrees/story-x-y claude/epic-2-continue`) and tell each builder its path; give each agent its own server/Vite ports (temporary Vite config merging `apps/client/vite.config.ts` with a `/api` proxy). Check `git status` before committing a merge (an unstaged fix slipped out once). Python Playwright + Chromium are preinstalled; `window.__game.loop.sleep()/wake()` simulates a hidden tab.

**Session 4 notes:** every builder and reviewer prompt starts with the **EPIC 4 BRIEF** (§11 of `epic-3-retro-2026-11-22.md`). Re-review every fix of a high or medium finding (Epic 3: 3.5 and 2.12 re-reviews each found new bugs). Run at most ~3 builders at once and record machine load with every speed number (timing tests flake on a busy box; tick asserts are behind `PERF_ASSERT=1`). Every sim/replay test must assert that something actually happened (a money sim once ran zero waves unnoticed).

**Session 4 extra notes:** the session server restarted twice; stopped agents resume from their transcripts (SendMessage to the agent id, or automatically). Keep timing asserts behind `PERF_ASSERT=1`. **The per-client message guard allows ~10 non-input messages per second (bucket of 10); a burst beyond it is dropped silently** (that was the `RunRoom.buildings` flake). Builders that touch rendering must read `render/city/*` (StreetView/CoverView/DecayView no longer exist).

**Lessons the reviews keep finding (tell builders up front):** every texture drawn in code goes through `addGeneratedTexture` (Story 4.13: Android Chrome wipes canvases in the background; unregistered textures vanish after an app switch); simulation timers count ticks (no float seconds); fire cooldown rule in `combat/firing.ts`; no per-frame / per-tick allocation; edge flags (swap/consumable) fire once per input seq and `LocalSimHost` latches them; Phaser 4 ≠ Phaser 3 (verify in `node_modules/phaser/types`; e.g. `setTint` + `setTintMode`); Phaser reuses scene objects on restart (reset state in `create`, pass restart data); tests of one mechanic pass `systems: { waves: () => {} }`; Colyseus: never pass zod to `onMessage` (use `this.net.guard`), join refusals are `ServerError(526, reason)`, use `bootTestServer()`; exact version pins (`.npmrc save-exact`); no gameplay numbers inline (balance JSON).

## 4. Key decisions (details in the docs and decision logs)

- **Epic 5 and later: every designer decision is in `docs/epic-5-decisions.md`** (accepted story values, art method = game code, round A–C art picks, melee can't hit through barricades/walls, Brute 1.8 m gap reach, Bloater blast full damage, acid blocked by walls, solo online runs, solo `?wallet`, offline play dropped, idea sessions scheduled). Read it before writing or building any Epic 5+ story.

- **Design:** 4 pillars (Horde chaos, Build your stand, A city that falls, Better together). Twin-stick, landscape, auto-fire while aiming, 8° aim assist (only when the raw aim would miss).
- **Tech:** Phaser 4.2 · Colyseus 0.18 (`@colyseus/core` + `ws-transport` + `schema` 5; client `@colyseus/sdk`) · TypeScript 6.0 · Vite 8 · Preact · npm workspaces (`apps/client`, `apps/server`, `packages/shared`). Server-authoritative 20 Hz, shared engine-free simulation.
- **Hermes = deploy and report only.** On 2026-11-21 Hermes built its own version of Story 2.2 in parallel; the designer chose the reviewed version from this repo, and Hermes's commit was dropped from `master`. From now on, stories are built here and Hermes only deploys (`docs/deploy.md`) and reports results. Hermes already made Story 2.1 live: `topdown-server.service` on :2567, with Caddy routing `/api`.
- **Hosting:** the designer's VPS (also runs the **Hermes** agent). Game at **https://hordes.sevend.io**. Docker Compose (Docker is installed). HTTPS/WSS by the existing **Cloudflare Tunnel** `sevend-io-stream` → 127.0.0.1:8080; Caddy plain HTTP behind it. The cloud session **cannot reach the VPS**: go-live steps run on the VPS (Hermes).
- **Epic 2 designer decisions (2026-11-21):** downed countdown pauses while being revived; in-run menu pauses solo, online keeps running.
- **2026-11-22:** revive stays 3 s at full zombie damage ("improve yourself"; seeded sims: with the Pistol a revive almost never succeeds, with the SMG ~46 %; all Pistol runs wipe in wave 2 → for the Epic 3 balance pass); a downed player's gun keeps reloading.
- **Netcode (2.4–2.7):** the server applies one input per tick; a lasting backlog drains after 2 s (skip every 2nd tick back to 2 queued); starved ticks hold still and pause the player's weapon; dropped inputs get a dry weapon tick only against "weapon debt" from earlier starved ticks (no speed-up from input floods). Reversed hits (harness): 0 % standing, ~1–3 % kiting at 150 ms, ~8 % kiting at 300 ms → 2.10 decides on the rewind upgrade.
- **Epic 3 decisions (2026-11-22, delegated to the session):** barricades on a 0.5 m lattice anchored by their min corner; the zombie stuck safety net triggers only when push-out is STUCK; Runner flank max 2.5 s; turret kills pay the turret's owner; earnings are 4–19 % below the GDD target and **stay until the 4.10 playtest** (fallback: wave bonus 15 × N); balance frozen until then.
- **Revive zone (designer, 2026-11-22):** `player.reviveRadiusM` 1.2 → **2.0 m** (centre to centre; ~1.2 m between bodies). An exception to the balance freeze. Story 4.9 draws the zone round a downed player.
- **Night, not day-night (designer, 2026-11-22):** a run is one night. Light follows decay: stage 1 dusk → 2 full night → 3 deep night + rain → 4–5 darker/blackout; **dawn on Extract** (Story 6.11). Stages 1–3 are in 4.9's scope.
- **Weather and camera (designer, 2026-11-22):** weather stays tied to decay (light drizzle from stage 1, heavy rain at 3, fog/blackout in Epic 6); varied per-run weather is a possible later special event. **No player zoom** (proposed 80–125 %, declined; the server's horde interest is view + 4 m).
- **Look (designer, 2026-11-22):** look **B "Dead City"** from `briefs/.../downtown-look-study.html` (shadows by height, bevelled roofs, recognisable bus/cars, wet asphalt, streetlight pools, shop glow, rain, vignette), **no outline aid**. Story 4.9 builds it.
- **2.12 trade-off accepted:** spread keyed to the input seq lets the client match the server; known cheats left (holding fire on bad rolls; dropping ~5 bad seqs/s by input floods), both cost fire rate and are logged, not kicked.
- **GitHub Pages retired 2026-11-22** (CI jobs removed, playtest links point at hordes.sevend.io). The designer still switches Pages off in GitHub → Settings → Pages (Source: None).
- **VPS ops (Hermes report):** cloudflared runs as a plain process with a dashboard token (not systemd); the static-site fallback (deploy.md step 2) was never prepared, so `deploy/rollback.sh` is the recovery path; Hermes may prepare the fallback with the designer's OK.

## 5. Open items for the designer (human steps)

1. **Deploy:** ask Hermes to run `deploy/deploy.sh` (`docs/hermes-go-live.md` › Every later release) — master has all of Epic 5 (3e566e6 or later), not yet deployed.
2. **Phone checks after the deploy:** Story 4.13 Android app-switch check (`?debug=1`, report renderer line, model, Chrome version); **Xiaomi Mi 11i FPS check** with floodlights (5.10) and molotov fire (5.12) on screen (retro A7). Target phone: Xiaomi Mi 11i.
3. **Balance pass: answered and applied** (designer "ok" 2026-11-24, all of B1–B9; `docs/epic-5-decisions.md` › Epic 5 balance pass). Branch `claude/epic-5-balance` passed the full gate and is merged to master (wallet planner claude.ai/artifact/UQcr75ZrboG6PdYX57z9K5).
4. Decided 2026-11-24: early weapon tier looks (SMG S1→S2→S3, Rifle H2→H1→H3, Machete M2→M1→M3; built) and small-phone action bar A (as built).
5. **Human playtests parked** (4.10 Milestone 1, with 1.11, 1.12, 2.10): "way later"; plans in `docs/playtests/milestone-1.md`, `docs/perf/milestone-1.md`.
6. **Name:** working title still "topdown-shooter".
7. Leftover: dead `.shop-card__glyph*` CSS in `overlay.css` (tiny cleanup).

## 6. Message for Hermes (VPS go-live, after `master` has the Story 2.2 review fixes)

**Give Hermes `docs/hermes-go-live.md`** (written 2026-11-22: steps, don'ts, report template). The short message below is the older summary.

> Please don't implement stories; only deploy and report. On the VPS, read `docs/deploy.md` (the "What runs there right now" part includes what you found), do First-time setup step 2 (back up and freeze the current site) **before** pulling, then `git fetch && git checkout master && git pull --ff-only` in `/root/topdown-shooter`, and follow the doc from the top (it backs up the current setup first, replaces the old `topdown-shooter.service` static site with the Docker Compose stack via `deploy/deploy.sh`, and lists the checks: `https://hordes.sevend.io/api/health` 200, cache headers, `/j/ABCD` 200, a foreign-origin WebSocket refused with 403, two browsers creating and joining a game). If anything fails, use the rollback in the doc. Report every check's result back.

## 7. Next steps for the new session

1. Read `docs/epic-6-brief.md` and `docs/epic-6-decisions.md` (look picks, 110 accepted decisions, merged rounds).
2. Balance pass is merged (B1–B9); Story 6.1's 10-wave sim re-checks its watch items (`docs/epic-5-decisions.md` › Epic 5 balance pass).
3. Story 7.8 (survivor parts, spinning propeller) is on master (designer: no fresh-agent review); stories 7.8–7.12 and FR89 updated by its correct-course (`sprint-change-proposal-2026-11-24-survivor-parts.md`).
4. Epic 6 round 1 (6.1, 6.3, 6.5) is DONE. Next: round 2 (6.2+6.4, 6.6+6.7, 6.8), then round 3 (6.9+6.10, 6.11+6.12). Push each to master once its review is clean. Behemoth prototype: claude.ai/artifact/16PKRmcKLyK4qfoG9ghASM.
4. Any new look → code-drawn proposals first, designer picks.
5. After Epic 6: retro (`gds-retrospective`), then the **Network pass** (designer 2026-11-24, `docs/perf/network-audit-2026-11.md`, `sprint-change-proposal-2026-11-24-network-pass.md`): Stories 8.8 ∥ 8.9 → 8.1 reconnect (pulled forward) → 8.10 → 8.11 (optional), then the 2.10 4-phone test; THEN Epic 7 from `docs/epic-7-decisions.md`.

**Session 5 notes:** the Agent tool's `isolation: "worktree"` was not used; worktrees made by hand under `.claude/worktrees/`. **Don't symlink the whole `node_modules`:** its `@topdown/*` entries are relative links, so a worktree would test against the MAIN checkout's packages (false greens). Make `node_modules` a real directory linking every entry of the main one except `@topdown`, plus absolute `@topdown/{client,server,shared}` links into the worktree, and its own real `.vitest-cache`, `.vite` and `.vite-temp` directories (shared caches give stale modules) (`node_modules` is excluded via `.git/info/exclude`). The main checkout's gate after each merge is the real check. Reviewers can run read-only in the main checkout (they mutate and revert files; don't commit while one runs: check `git status`).

**Session 6 notes:** a helper script made correct worktrees (real `node_modules` dir linking the main one except `@topdown`, absolute `@topdown/*` links, own caches); recreate it if needed (see Session 5 notes). Never use `npm run dev` in a builder (fixed ports 5173/2567 clash); give each agent its own client/server ports and stop processes by PID only (one builder's `pkill` killed others' servers). `vitest.config.ts` has `testTimeout: 30_000` (sims/replays timed out at 5 s under load). `tools/checks/noUnregisteredTextures.test.ts` fails if client code creates a texture outside `addGeneratedTexture`. Meshy (api.meshy.ai) is connected but credits are low (~180 at last check): art is game code; Meshy only for references, if at all.

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

> I'm continuing my game project topdown-shooter. Read `HANDOFF.md` at the repo root and follow it, using the BMAD skills it names, plus `docs/epic-6-brief.md` and `docs/epic-6-decisions.md` for my design decisions. Epics 1–5 are done (4.10 playtest parked). Next: build Epic 6 in its three merged rounds (round 1: 6.1, 6.3, 6.5) — each builder and each reviewer in its own cloud session, builders message back with send_message to @parent, only non-overlapping stories in parallel, one full gate per builder and before every push to master, and push each story to master as soon as its fresh-agent review (and re-review of medium/high fixes) is clean. Show me code-drawn look proposals before building anything with a new look. Keep working in facilitative mode as described in the handoff.
