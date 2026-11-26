# Handoff: topdown-shooter

Session handoff, updated 2026-11-25 (end of the ninth session: **Epic 6 DONE** — all stories on master (6.1–6.14 incl. 6.13 wide-body stall fix and 6.14 tidy-up, master `cc26d05`); Network pass story files 8.8/8.9/8.1/8.10/8.11 written + 29 decisions accepted; Epic 7 story files 7.1–7.7 + 7.9–7.12 written + 65 decisions accepted; Epic 7 UI style chosen (**Lumen, LF5 Field Ops palette**) + layout picks. Next: **AUTONOMOUS OVERNIGHT RUN** — Epic 6 retro → Network pass → Epic 7 (→ stretch: rest of Epic 8). **The project is on GitHub** (`Seven74AI/topdown-shooter`, branch `master`). Start a new Claude Code session with that repository selected and paste the **"Prompt for the new session"** block at the bottom.

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
| **Epic 6** | ✅ **DONE 2026-11-25** (sessions 8–9): 6.1, 6.2+6.4, 6.3, 6.5, 6.6+6.7, 6.8, 6.9+6.10, 6.11+6.12, 6.13 wide-body stall fix, 6.14 tidy-up — each fresh-reviewed, every medium/high and behaviour-changing fix re-reviewed, master `cc26d05`. Decisions incl. build-time B-codes (6.2 B1–B3, 6.8 B1–B2, 6.10 B1–B2, 6.11 B1) in `docs/epic-6-decisions.md`. **Retro NOT run yet**: evidence ready on branch `epic-6-retro-prep` (`_bmad-output/implementation-artifacts/epic-6-retro-evidence.md`, snapshot at 23:15 — add 6.8–6.14). Follow-ups left in each story's "Main session close-out" | `6-*.md` |
| **Network pass** (8.8, 8.9, 8.1, 8.10, 8.11) | ✅ **done 2026-11-25** (overnight run). Simulated bad lines only, **not verified on a phone** (2.10 is the designer's). 8.10 B6 (RTT-based horde skip) still has no owner | `8-*.md`, `docs/network-pass-decisions.md` |
| **Epic 7, accounts and meta-progression** | ✅ **done 2026-11-25** (7.1–7.12; Lumen LF5 UI, loot bag LB4–LB8) | `7-*.md`, `docs/epic-7-*.md` |
| **Epic 8, real-life resilience** | ✅ **done 2026-11-25** (8.1–8.11: join mid-run, host role, save/quit/resume, pings, one packet per tick) | `8-*.md`, `docs/epic-8-story-decisions.md` |
| **Epic 9, art and audio** | in progress: photoreal pass 9.11–9.14 ✅ done; **9.1–9.10 need a correct-course** (their direction predates the photoreal pass; readiness 2026-11-26 Q1) | `9-*.md`, `docs/art/photoreal-decisions.md` |
| **Epic 10, performance and polish** | 10.10 Build button ✅ done (layout B, PR #20); 10.1–10.9 backlog, ready (readiness 2026-11-26) | `epics.md` |
| **Epic 11, random city** | backlog, post-v1, ready | `epics.md` |
| Readiness + drift check 2026-11-26 | 17 doc fixes applied; 8 designer questions open | `implementation-readiness-report-2026-11-26.md` |

`_bmad-output/implementation-artifacts/sprint-status.yaml` is the source of truth for story status.

**What the game does today** (play it: **https://hordes.sevend.io**, or `npm run dev`):
- Solo (offline): twin-stick touch controls with aim assist, WASD + mouse on desktop; Pistol, SMG, Hunting Rifle, Machete (2 slots + swap button); Walkers in growing waves (N × 40, 150 alive cap, last 5 marked and rushing); health, Game over, Restart.
- Debug: `?debug=1` overlay (FPS, tick ms), `?stress=150` phone benchmark, `?loadout=a,b`, `?tune=1` live control tuning, dev-only cheats (⚙ / backtick).
- Online (needs the game server: `npm run dev` locally, or the VPS once live): Create game → 4-letter code + share link `/j/<code>` → friends join → Ready → Start → the server runs the fight at 20 Hz.
  - Zombies streamed in binary (2.5, ~24 KB/s per phone with 150 in view; Story 8.10: keyframes + deltas, every zombie at 20 Hz (B7 turned the 10 Hz far rule off: it stuttered): 8.2 KB/s on the audit replay, ≤ 13.5 KB/s with the stampede's 180 in one view; on a 64 kbit/s line frames queue up to 4.7 s with no skip — still owed (RTT-based skip + keyframe, 8.10 B6; not in 8.11's scope: decision 8.11 B2); a pre-8.10 tab is told "A new version is out. Please reload."); own survivor predicted, others 100–150 ms behind (2.6); own shots instant, hits decided by the server (2.7); downed / revive / out / team wipe → Results → Back to lobby in the same room (2.8); slot-coloured rings, names, teammate edge arrows (2.9); ☰ / Esc in-run menu, Leave (2.11; pauses solo only).
  - `?lag=<rttMs>&jitter=<ms>&loss=<pct>` simulates a bad connection (dev throttle, release builds too; Story 8.8 `&loss` = the lossy 4G line, ordered 200 ms stalls, `&stall=<ms>` to change them; bots: `npm run bots -- --lag 150 --jitter 20 --loss 1`).
  - **8.1 reconnect (branch story-8-1, in review):** a dropped phone (or one quiet for 3 s mid-wave: app switch, lock, tunnel) is HELD for 120 s: its survivor vanishes safely (not a target, not hurt, not in the wipe check; downed → out), teammates see "<name> · reconnecting 1:43", and it comes back exactly as held (mid-wave next to a teammate with 2 s blinking protection). A second tab / reload with the same guest token takes the seat over; after 120 s the seat is remembered and rejoins at the next build phase. Nobody connected → the World freezes (3-2-1 on return). The phone shows "Connection lost, reconnecting…" after 3 s with no data (its own watchdog). Dev: `npm run bots -- --cut-bot 2 --cut-at 30 --cut-for 8` cuts one bot's line both ways; `node tools/netaudit/smokeReconnect.cjs` is the two-tab reconnect smoke.
  - 2.12: the server rewinds zombies to what the shooter saw (≤ 6 ticks / 300 ms; Story 8.8: ≤ 10 ticks / 500 ms, lossy 4G Runners 7.6 → 2.0 %; Story 8.9 T10: ≤ 12 ticks / 600 ms for its 250 ms lossy-line delay, Runners 0.7 % / 1.4 %). Reversed hits at 150 ms kiting Runners: 11–20 % → 0.3–1.8 %. Spread is keyed to the input seq (client and server agree); the server accepts only seq + 1 and logs `spread_cancel_suspect` / `seq_gap_suspect` (never kicks).
- **Epic 3 (build phase):** a five-wave run (lobby → build → wave × 5 → "You held out!" results), sized by player count (× 0.4 / 0.6 / 0.8 / 1.0). Build phase with a personal-wallet shop (weapons), kill pay, barricades on a 0.5 m lattice (zombies path around them with flow fields, Runners flank), turrets, repair (ceil HP), Crawlers (slow on bite), Runners. Dev switches: `?wallet=` + server `DEV_STARTING_WALLET` (both needed, else the join is refused as balance mismatch), `?zdmg=`, `?wavemix=`, `DEV_NO_WAVES`, `DEV_NO_REWIND`. Bots: `npm run bots -- --help`; five-wave sim in `tools/sims/fiveWave.ts`.

- **Epic 4 (Downtown, decay, look):** a hand-made 48 × 32 m Downtown (`tools/maps/buildDowntown.ts` generates the Tiled `.tmx`/`.tmj`; once the designer edits in Tiled, the `.tmx` becomes the source and the generator test is retired). Cover: cars, the bus and buildings stop bullets; barriers and sandbags only stop bodies (4.2). 19 spawn points opening by stage, never within 6 m of a player, barricades kept 2 m clear of every spawn (4.3). One run seed with named streams; a recorded input log replays to the same digest (4.4). Decay engine: `applyDecayStage` is the single path (server, solo, mirror, Predictor); at a build start: mutations → destroy buildings on new solids (no refund since 12.4; 12.1: also walls within 0.8 m of new cover) → push out bodies → return downed → rebuild flow fields → banner (4.5). Stages: 1 Evening (curb cars, lit shop fronts, traffic loop), 2 Panic (4 of 6 curb cars move into the road, police lines, dumpster, sirens loop), 3 Breakdown (2 of 3 cars burn: 2 m fire zones, 10 dmg/s, 2 waves, zombies avoid fire; sandbags; heavy rain) (4.6–4.8). Dead City look drawn in code (`apps/client/src/render/city/*`, atlases with `category_name_variant` frames), night darkens per stage (`NIGHT_BY_STAGE`) (4.9). Dev: build-phase-only "Decay stage" cheat; server `DEV_DECAY_STAGES=2,3`; `DEV_ALLOW_RUN_SEED=1` + host `?seed=`.

- **Epic 5 (arsenal and bestiary):** 11 weapons (Pistol, SMG, Hunting Rifle, Machete, Shotgun, Assault Rifle, Fire Axe, Chainsaw, Flamethrower (fuel jet 6 m × 20°), Gas torch (3 m × 60°), Grenade Launcher) with upgrades I–IV (damage only; U1 marks; second looks at III–IV); melee can't hit through barricades/walls; Spitters (acid puddles, blocked by walls), the Brute (one in waves 5–6, wind-up, knockback, 1.8 m reach into narrow gaps, five looks), Bloaters (swell 20 ticks, 30 full-damage blast, chains, gas; five looks); metal barricade ladder (wood → reinforced → metal), spike trap, mine; friendly fire 50 % (Bloater blast full); one `explode(world, spec)` for every blast; the run is **6 waves** until Epic 6. All art is drawn in game code; every generated texture goes through `addGeneratedTexture` (Android redraw, Story 4.13). Dev/test: `?loadout=a:3,b:4` (release-safe, levels), `?wallet=5000` (release: solo only), `?wavemix=spitter|bloater`, `?fx=low`.

## 3. How we work

Moved to **`AGENTS.md`** (2026-11-26): designer preferences, getting changes onto master (PRs, CI gate, docs-only straight to master), the story loop and reviews, parallel builders, code rules and environment gotchas. Claude Code loads it through `CLAUDE.md`.

## 4. Key decisions (details in the docs and decision logs)

- **Epic 5 and later: every designer decision is in `docs/epic-5-decisions.md`** (accepted story values, art method = game code, round A–C art picks, melee can't hit through barricades/walls, Brute 1.8 m gap reach, Bloater blast full damage, acid blocked by walls, solo online runs, solo `?wallet`, offline play dropped, idea sessions scheduled). Read it before writing or building any Epic 5+ story.

- **Design:** 4 pillars (Horde chaos, Build your stand, A city that falls, Better together). Twin-stick, landscape, auto-fire while aiming, 8° aim assist (only when the raw aim would miss).
- **Tech:** Phaser 4.2 · Colyseus 0.18 (`@colyseus/core` + `ws-transport` + `schema` 5; client `@colyseus/sdk`) · TypeScript 6.0 · Vite 8 · Preact · npm workspaces (`apps/client`, `apps/server`, `packages/shared`). Server-authoritative 20 Hz, shared engine-free simulation.
- **Hermes = deploy and report only.** On 2026-11-21 Hermes built its own version of Story 2.2 in parallel; the designer chose the reviewed version from this repo, and Hermes's commit was dropped from `master`. From now on, stories are built here and Hermes only deploys (`docs/deploy.md`) and reports results. Hermes already made Story 2.1 live: `topdown-server.service` on :2567, with Caddy routing `/api`.
- **Hosting:** the designer's VPS (also runs the **Hermes** agent). Game at **https://hordes.sevend.io**. Docker Compose (Docker is installed). HTTPS/WSS by the existing **Cloudflare Tunnel** `sevend-io-stream` → 127.0.0.1:8080; Caddy plain HTTP behind it. The cloud session **cannot reach the VPS**: go-live steps run on the VPS (Hermes).
- **Epic 2 designer decisions (2026-11-21):** downed countdown pauses while being revived; in-run menu pauses solo, online keeps running.
- **2026-11-22:** revive stays 3 s at full zombie damage ("improve yourself"; seeded sims: with the Pistol a revive almost never succeeds, with the SMG ~46 %; all Pistol runs wipe in wave 2 → for the Epic 3 balance pass); a downed player's gun keeps reloading.
- **Reconnect (8.1, decisions 8.1 D1–D8 + Epic 8 D1–D5):** a drop is not a leave (brief 21): held 120 s (Colyseus `allowReconnection`; quiet 3 s = held too), transport pings 3 s × 4; the seat identity is ONE function `seatKey()` in `apps/server/src/run/lobby.ts` (`guest:<hash>` today; Story 7.1 switches it to `acct:<id>`). Close codes 4020 seat kept / 4021 taken over (never 4000 or 4010). Inputs whose view tick is > 2 s old are dropped (made while the line was down, F7).
- **Netcode (2.4–2.7):** the server applies one input per tick; a lasting backlog drains after 2 s (skip every 2nd tick back to 2 queued); starved ticks hold still and pause the player's weapon (Story 8.9: the client slows its steps to 0.9× while the server reports its queue over 2, so the drain rarely skips; render delay 100–250 ms from lateness on a 0.9–1.1× render clock, server clock slewed and monotonic); dropped inputs get a dry weapon tick only against "weapon debt" from earlier starved ticks (no speed-up from input floods). Story 8.11: one TCP write per tick per phone (horde, events, ping, then the state patch; the patch comes from the tick, exactly one tick each), and the input is a 14-byte binary message (1/127 stick steps, validated like the schema; `NET_PROTOCOL_VERSION` 3). Reversed hits (harness): 0 % standing, ~1–3 % kiting at 150 ms, ~8 % kiting at 300 ms → 2.10 decides on the rewind upgrade.
- **Epic 3 decisions (2026-11-22, delegated to the session):** barricades on a 0.5 m lattice anchored by their min corner; the zombie stuck safety net triggers only when push-out is STUCK; Runner flank max 2.5 s; turret kills pay the turret's owner; earnings are 4–19 % below the GDD target and **stay until the 4.10 playtest** (fallback: wave bonus 15 × N); balance frozen until then.
- **Revive zone (designer, 2026-11-22):** `player.reviveRadiusM` 1.2 → **2.0 m** (centre to centre; ~1.2 m between bodies). An exception to the balance freeze. Story 4.9 draws the zone round a downed player.
- **Night, not day-night (designer, 2026-11-22):** a run is one night. Light follows decay: stage 1 dusk → 2 full night → 3 deep night + rain → 4–5 darker/blackout; **dawn on Extract** (Story 6.11). Stages 1–3 are in 4.9's scope.
- **Weather and camera (designer, 2026-11-22):** weather stays tied to decay (light drizzle from stage 1, heavy rain at 3, fog/blackout in Epic 6); varied per-run weather is a possible later special event. **No player zoom** (proposed 80–125 %, declined; the server's horde interest is view + 4 m).
- **Look (designer, 2026-11-22):** look **B "Dead City"** from `briefs/.../downtown-look-study.html` (shadows by height, bevelled roofs, recognisable bus/cars, wet asphalt, streetlight pools, shop glow, rain, vignette), **no outline aid**. Story 4.9 builds it.
- **2.12 trade-off accepted:** spread keyed to the input seq lets the client match the server; known cheats left (holding fire on bad rolls; dropping ~5 bad seqs/s by input floods), both cost fire rate and are logged, not kicked.
- **GitHub Pages retired 2026-11-22** (CI jobs removed, playtest links point at hordes.sevend.io). The designer still switches Pages off in GitHub → Settings → Pages (Source: None).
- **VPS ops (Hermes report):** cloudflared runs as a plain process with a dashboard token (not systemd); the static-site fallback (deploy.md step 2) was never prepared, so `deploy/rollback.sh` is the recovery path; Hermes may prepare the fallback with the designer's OK.

## 5. Open items for the designer (human steps)

1. **Deploy:** ask Hermes to run `deploy/deploy.sh` (`docs/hermes-go-live.md` › Every later release) — master has Epics 5–8, 9.11–9.14 and 10.10, not yet deployed (the deploy must include the DB migrations up to `0005_saved_runs`).
2. **Phone checks (parked by the designer 2026-11-25, "forget the real phone test for now"):** Mi 11i FPS (blackout/fog/Behemoth/events; `docs/perf/epic-6-*.md` phone rows empty), 4.13 app-switch check, 2.10 4-phone 4G test after the Network pass.
3. **Playtest wanted for:** survivor rescue save rate (6.10 B2: kept as B1, judge in play), Behemoth fight feel, stampede crossing at 12 s.
4. **To look at:** the new boss bar height (y 60) and the off-centre wave line on small phones (6.14 review L2); Epic 7 Lumen sheets (claude.ai/artifact/BMwbUGhjVnj3foJAt8iNcB) — layout picks recorded 7-UI-5; loot drop picked (7-UI-6: LB4–LB8 random variants).
5. **Asset-review session:** ✅ done (9.11–9.14 in the game; asset-review page claude.ai/artifact/Eznwmb2BbdSoogcXKKN4Ro, version 12).
6. **Controller support** idea forged (branch `claude/lucid-lamport-r1st1y`, `_bmad-output/forge/controller-support/`) — not planned yet.
7. **Name:** working title still "topdown-shooter".
8. ~~Build button layout~~ done: BU-1 = B, BU-3 = just the tiles (10.10, PR #20).

## 6. Message for Hermes (VPS go-live, after `master` has the Story 2.2 review fixes)

**Give Hermes `docs/hermes-go-live.md`** (written 2026-11-22: steps, don'ts, report template). The short message below is the older summary.

> Please don't implement stories; only deploy and report. On the VPS, read `docs/deploy.md` (the "What runs there right now" part includes what you found), do First-time setup step 2 (back up and freeze the current site) **before** pulling, then `git fetch && git checkout master && git pull --ff-only` in `/root/topdown-shooter`, and follow the doc from the top (it backs up the current setup first, replaces the old `topdown-shooter.service` static site with the Docker Compose stack via `deploy/deploy.sh`, and lists the checks: `https://hordes.sevend.io/api/health` 200, cache headers, `/j/ABCD` 200, a foreign-origin WebSocket refused with 403, two browsers creating and joining a game). If anything fails, use the rollback in the doc. Report every check's result back.

## 7. Next steps for the new session (designer 2026-11-26)

The overnight run (HANDOFF §7 of 2026-11-25: Epic 6 retro → Network pass → Epic 7 → Epic 8) is **done**; morning report: claude.ai/artifact/3PoM94KqvR7PTHoFEjHSUe, log `docs/overnight-run-log-2026-11-25.md`. The designer is back in the loop: ask, don't auto-accept, unless they say otherwise.

1. ✅ Readiness + drift check: `_bmad-output/planning-artifacts/implementation-readiness-report-2026-11-26.md`.
2. Retros for Epic 7 and Epic 8 (`gds-retrospective`, in their own session).
3. Refine what is left, with the designer: `gds-correct-course` for Epic 9 (readiness Q1, blocker), then the readiness questions Q2–Q9 (10.1 first, 10.5 / 10.8 wording, folding 1.11 / 1.12 / 4.10 into 10.2 / 10.9, 8.10 B6 owner), then story files (`gds-create-story`) and builds in file-overlap rounds.
4. Process (`AGENTS.md` §2): PRs with the GitHub Actions `gate` as the merge gate; docs-only changes go straight to master; builders run `gate:fast`; check master's CI after every merge.

## 8–9. Designer preferences and environment gotchas

Moved to `AGENTS.md` §1 and §6.

---

## Prompt for the new session

> I'm continuing my game project topdown-shooter. Read `AGENTS.md` (how we work) and `HANDOFF.md` (where we are) at the repo root and follow them, using the gds-* skills (never bmad-build). The overnight run is done; next steps are in HANDOFF §7. Work with PRs and the CI `gate` (docs-only changes go straight to master). Builders and reviewers run in their own cloud sessions and message back with send_message to @parent; fresh-agent review per story, narrow re-reviews of medium/high fixes (at most 2 rounds). Ask me where a decision is mine.
