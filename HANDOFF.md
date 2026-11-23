# Handoff: topdown-shooter

Session handoff, updated 2026-11-23 (end of the sixth session: Epic 4 retro; Stories 4.11–4.13 (readability, all art in game code with particle fire D, Android graphics-loss fix); Epic 5 rounds A–C built, reviewed and on `master`: 5.1–5.9 (upgrades, Axe/Chainsaw, Shotgun/AR, Flamethrower + Gas torch, Grenade Launcher, Spitters, Brute, Bloaters + 6-wave run, metal barricade/traps/mine); solo online runs; solo `?wallet` in release; idea sessions folded in (customization 7.8–7.12, building UX 5.15–5.25, Epic 6 revised). Next: round D (5.10–5.12) + building UX 5.15–5.19 in parallel, using CLOUD SESSIONS for builders). **The project is on GitHub** (`Seven74AI/topdown-shooter`, branch `master`). Start a new Claude Code session with that repository selected and paste the **"Prompt for the new session"** block at the bottom.

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
| **Epic 5, full arsenal and bestiary** | ✅ round A (5.3, 5.6, 5.9), B (5.1, 5.2, 5.7), C (5.4, 5.5, 5.8) + solo online runs + solo `?wallet`. Open: round D 5.10–5.12, round E 5.13, 5.14 Bear trap, building UX rework 5.15–5.25. **All designer decisions: `docs/epic-5-decisions.md`** | `5-*.md` |
| Epics 6–10 | backlog. **Epic 6 stories revised** from the Epic 6 idea session (`docs/ideas/epic-6/`); **Epic 7 gained customization 7.8–7.12** (`docs/ideas/customization/`) | `epics.md` |

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

1. **Releases:** after a reviewed push to `master`, ask Hermes to run `deploy/deploy.sh` (`docs/hermes-go-live.md` › Every later release). **Deploy now** (end of session 6: rounds A–C, 4.12, 4.13). Test links: `https://hordes.sevend.io/?loadout=flamethrower,gas_torch`, `?loadout=grenade_launcher,chainsaw`, `?loadout=fire_axe,shotgun:4`, `?wavemix=bloater`, `?wallet=5000` (solo).
2. **Android check of Story 4.13:** after the deploy, a friend with Android switches apps several times (solo and online) with `?debug=1` and reports the renderer line, phone model and Chrome version.
3. **Human playtests parked** (4.10 Milestone 1, which folds in 1.11 phone speed, 1.12 controls, 2.10 4-phone 4G): "way later"; plan and forms ready in `docs/playtests/milestone-1.md` and `docs/perf/milestone-1.md`.
4. **Name:** working title still "topdown-shooter"; a name idea session prompt exists (branch `claude/idea-name` if run).
5. **Balance watch:** solo is hard since Spitters/Brute/Bloaters (bot sims: solo 2/4 runs held out); the Epic 5 balance pass comes after round E (bots never dodge, so bot survival isn't difficulty evidence).

## 6. Message for Hermes (VPS go-live, after `master` has the Story 2.2 review fixes)

**Give Hermes `docs/hermes-go-live.md`** (written 2026-11-22: steps, don'ts, report template). The short message below is the older summary.

> Please don't implement stories; only deploy and report. On the VPS, read `docs/deploy.md` (the "What runs there right now" part includes what you found), do First-time setup step 2 (back up and freeze the current site) **before** pulling, then `git fetch && git checkout master && git pull --ff-only` in `/root/topdown-shooter`, and follow the doc from the top (it backs up the current setup first, replaces the old `topdown-shooter.service` static site with the Docker Compose stack via `deploy/deploy.sh`, and lists the checks: `https://hordes.sevend.io/api/health` 200, cache headers, `/j/ABCD` 200, a foreign-origin WebSocket refused with 403, two browsers creating and joining a game). If anything fails, use the rollback in the doc. Report every check's result back.

## 7. Next steps for the new session

1. **Round D looks:** code-drawn proposals (like rounds A–C) for 5.10 Floodlight + med station, 5.11 Gear icons, 5.12 Consumables; designer picks. Floodlight: 4 m light, **6 m in blackout** (Epic 6 D5).
2. **Build round D (5.10, 5.11, 5.12) in cloud sessions, in parallel with building UX 5.15–5.19** (client-only; design: `docs/ideas/building-ux/ux-spec.md`, designer picked "B · Carry + drag"). Then 5.20–5.25 (5.20, 5.22, 5.24 after 5.10 and 5.14).
3. **5.14 Bear trap** (B-T1 look): write the story file with `gds-create-story`, build.
4. **Round E: 5.13 Roguelike card shop** (needs every item; card-frame look pick first).
5. **Epic 5 balance pass + retro** (`gds-retrospective`), then **Epic 6** from its revised stories (Behemoth prototype claude.ai/artifact/16PKRmcKLyK4qfoG9ghASM).
6. Known leftovers: `epic-4-retro-2026-11-23.md` §6 and each story file's accepted lows; dead `allowSoloStart` config (a suggested task exists).

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

> I'm continuing my game project topdown-shooter. Read `HANDOFF.md` at the repo root and follow it, using the BMAD skills it names, and `docs/epic-5-decisions.md` for my design decisions. Epics 1–4 are done (4.10 playtest parked) and Epic 5 rounds A–C are on master. Next: show me code-drawn look proposals for round D (5.10 Floodlight + med station, 5.11 Gear, 5.12 Consumables) so I can pick, then build round D and the building-UX stories 5.15–5.19 in parallel — each builder in its own cloud session (separate container), at most 2 heavy jobs in this one, only non-overlapping stories in parallel, one full gate per builder, and push each story to master as soon as its fresh-agent review (and re-review of medium/high fixes) is clean. Keep working in facilitative mode as described in the handoff.
