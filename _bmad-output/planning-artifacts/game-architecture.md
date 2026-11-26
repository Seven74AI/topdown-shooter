---
title: 'Game Architecture'
project: 'topdown-shooter'
date: '2026-11-21'
author: 'Root'
version: '1.0'
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8, 9]
engine: 'Phaser 4.2 + Colyseus 0.18'
platform: 'Mobile web (iOS Safari 16+, Android Chrome 10+), desktop web'
status: 'complete'

# Source Documents
gdd: '_bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md'
epics: '_bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/epics.md'
brief: '_bmad-output/planning-artifacts/briefs/brief-topdown-shooter-2026-11-21/brief.md'
---

# Game Architecture

## Executive Summary

A server-authoritative online co-op horde shooter for phone browsers. A Phaser 4 client and a Colyseus 0.18 Node.js server share one engine-free TypeScript simulation package (the game rules), running at 20 Hz on the server with local-player prediction on phones. A custom binary horde stream keeps 150 zombies within ~24 KB/s per phone (Story 8.10's delta stream: ≤ 16 KB/s budget, ~8 KB/s typical). PostgreSQL stores accounts, progression and saved runs; everything runs in Docker Compose on the designer's existing European VPS behind a Cloudflare Tunnel (HTTPS/WSS terminates at the edge; Caddy serves plain HTTP).

**Key decisions:** server authority + client prediction (ADR-01) · custom horde stream (ADR-02) · shared simulation package (ADR-03) · single PostgreSQL on the VPS (ADR-04) · Tiled or generated maps with decay layers (ADR-05) · city generator in shared code (ADR-06, Random city, Epic 11) · flow-field pathfinding.

**Structure:** domain-organized monorepo (client, server, shared) covering 15 core systems; 4 novel patterns and the standard patterns below keep AI agents consistent.

**Ready for:** epic and story creation, then implementation of Epic 1.

---
## Project Context

### Game Overview

**topdown-shooter (working title)** — a 2D top-down online co-op horde shooter for 2–4 friends, played in a phone browser from a shared link. A 10-wave run takes a hand-made district from a normal evening to total collapse (5 decay stages that change gameplay), with a 30 s build phase between waves, a boss at wave 10, an extract-or-stay vote, endless mode, and account-level meta-progression.

### Technical Scope

**Platform:** mobile web browsers (Safari iOS 16+, Chrome Android 10+), landscape only; desktop browsers as a bonus. No native app.
**Genre:** shooter (twin-stick, horde) with roguelike run structure and tower-defense building.
**Project Level:** high complexity (real-time networked horde simulation), small team (one developer with AI agents).

### Core Systems

| System | Complexity | GDD Reference |
| --- | --- | --- |
| Authoritative game server (simulation of players, 150 zombies, projectiles, buildings) | high | Multiplayer Considerations, Performance Requirements |
| Network sync of the horde to phones (~30 KB/s per client, 150 ms latency) | high | Technical Specifications |
| Client prediction for own movement/aim + server-confirmed hits | high | Multiplayer Considerations (Fairness and feel) |
| Rendering: 2D canvas/WebGL with 150 animated zombies, lighting, blackout, rain/fog | high | Art Style, Performance Requirements |
| Touch twin-stick input + desktop fallback | medium | Controls and Input |
| Zombie AI and crowd movement (chase, flank, keep distance, attack buildings) | medium | Enemy Design and AI |
| Wave director, spawn points, player-count scaling, events, boss | medium | Enemy Wave Design |
| District + decay stage engine (map changes per stage, fire zones, rubble) | medium | Level Progression |
| Build phase, placement grid, buildings | medium | Buildings and Defenses |
| Economy, wallets, roguelike shop (6 cards from unlocked pool, floor, reroll) | medium | Item and Upgrade System, Economy |
| Lobby (share link + code), guest play, host migration | medium | Multiplayer Considerations |
| Run persistence: reconnect (2 min), save & resume (7 days, any account from the run: Epic 8 D11, superseding "host required"), join mid-run | high | Run Structure, Multiplayer Considerations |
| Accounts and meta-progression (Supplies, unlocks, Training) | low–medium | Player Progression |
| Seeded randomness for reproducible runs | low | Run Structure |
| Audio: decay ambience, adaptive music, positional cues | low–medium | Audio and Music |

### Technical Requirements

- 60 FPS target, never below 30, on 2021 mid-range phones, worst case 150 zombies in one view during a blackout wave.
- Under 300 MB tab memory on iPhone 12; first load under 10 s on 4G with under 15 MB download; music streamed.
- Playable on 4G at 150 ms latency; at most ~30 KB/s down per phone; fewer than 1 in 20 apparent hits reversed.
- 20-minute run under 15% battery.
- Quality settings for rain, fog, shake, grain, glow, gore; blackout darkness not optional.

### Complexity Drivers

**High complexity:** server-authoritative horde simulation and bandwidth-limited sync of 150 entities to phones; responsive feel under latency; mobile-browser rendering budget with full-screen lighting; persistent run state for reconnect, resume and mid-run joins.

**Novel concepts:** a decay stage engine that mutates map collision, cover, hazards and lighting mid-run; blackout waves as a lighting gameplay mode; roguelike card shop per player inside a shared co-op run.

### Technical Risks

1. Horde sync bandwidth and smoothness on 4G (Milestone 1 must prove it).
2. Phone rendering performance and battery with lighting effects.
3. Safari memory limits and tab kills.
4. Save/resume and reconnect correctness (state ownership on the server).
5. Touch controls feel, especially melee under twin-stick.

## Engine & Framework

### Selected Stack

| Layer | Choice | Version (verified 2026-11-21) |
| --- | --- | --- |
| Client game framework | **Phaser** (WebGL renderer, Canvas fallback) | 4.2.1 |
| Multiplayer server framework | **Colyseus** (Node.js) | 0.18.12 |
| State serialization | **@colyseus/schema** (delta-encoded binary state) | 5.0.x |
| Language | **TypeScript** (client, server, shared code) | 6.0.x (7.0 native compiler released 2026-11; typescript-eslint supports < 6.1, so 6.0 is pinned until tooling catches up) |
| Client build / dev server | **Vite** | 8.3.x |

Exact versions are pinned in the lockfile at project initialization; the table records the versions current when this decision was made.

**Rationale:**
- Phaser is built for browser games: rendering, touch input, audio, loader, cameras, tweens and lighting come out of the box, the runtime fits the 15 MB first-load budget, and its large documentation corpus reduces AI-agent mistakes.
- Colyseus provides rooms with join codes (share link), built-in reconnection (2-minute rule), and delta-encoded state sync; at 150 zombies × 20 updates/s the estimated payload (~20 KB/s) fits the 30 KB/s target. If profiling in Milestone 1 shows otherwise, zombie positions move to a custom compact binary message (see Networking decisions).
- One language end to end lets the **game simulation rules live in a shared package** executed by the server (authority) and by the client (prediction of the local player), so both always agree.

**Rejected:** PixiJS 8 (rendering only; input, audio, scenes and loading would be hand-built); Godot 4 web export (30–40 MB download and iOS Safari issues break the platform targets); a fully custom WebSocket server (re-implements rooms and reconnection).

### Project Initialization

The project is a TypeScript monorepo with npm workspaces, scaffolded by hand rather than from a template, so that client, server and shared simulation code share one toolchain:

```bash
mkdir -p apps/client apps/server packages/shared
npm init -y && npm pkg set workspaces[0]="apps/*" workspaces[1]="packages/*"
npm i -w apps/client phaser @colyseus/sdk preact && npm i -D -w apps/client vite typescript
npm i -w apps/server colyseus @colyseus/schema && npm i -D -w apps/server typescript tsx
```

Official starters were considered for reference only: `npm create @phaserjs/game@latest` (client) and `npm create colyseus-app@latest` (server).

### Engine-Provided Architecture

| Component | Solution | Notes |
| --- | --- | --- |
| Rendering | Phaser WebGL renderer, sprite batching, cameras | Canvas fallback; lighting via Phaser lights/filters or render textures |
| Input | Phaser input manager (multi-touch pointers, keyboard, mouse) | Twin-stick joysticks built on top |
| Audio | Phaser Web Audio sound manager | Streaming music handled by the loader |
| Scene management | Phaser Scenes (Boot, Preload, Menu/Lobby, Game, UI overlay) | |
| Asset loading | Phaser Loader (atlases, audio, JSON) | Texture atlases to keep draw calls low |
| Physics | **Not used on the client for gameplay** | Collision and movement live in the shared simulation, run by the server |
| Rooms, matchmaking by code, reconnection | Colyseus rooms, `allowReconnection` | |
| State sync | Colyseus schema delta patches | Custom messages for high-frequency horde data if needed |
| Build | Vite (client), tsc/tsx (server) | |

### Remaining Architectural Decisions

- Server tick rate, client update rate, interpolation and local-player prediction model
- Horde data encoding (schema vs custom compact message) and interest management
- Simulation structure (entity data layout for 150 zombies, spatial grid for collision and separation)
- Hit validation and lag compensation model
- Map/district data format and the decay stage system
- Lighting and blackout rendering approach on mobile
- Run persistence store (save & resume 7 days, reconnect state), accounts and meta-progression storage
- Hosting and deployment (game server, database, static client)
- Seeded randomness, configuration/balance data format
- Testing strategy (headless simulation tests, bots), logging and telemetry

### Development Environment: AI Tooling

- **Context7 MCP** (upstash/context7, `@upstash/context7-mcp` 4.7.x): lets AI agents fetch current Phaser 4, Colyseus 0.18 and Vite documentation instead of relying on training data. Install for Claude Code: `claude mcp add context7 -- npx -y @upstash/context7-mcp`.
- No Phaser-specific MCP is listed in the knowledge base; none adopted.

## Architectural Decisions

### Decision Summary

| Category | Decision | Version (verified 2026-11-21) | Rationale |
| --- | --- | --- | --- |
| Network model | Server-authoritative simulation at **20 Hz**; local player predicted on the client; remote entities interpolated ~100 ms behind | Colyseus 0.18 | One source of truth for a 150-zombie horde; instant feel for your own character (user choice) |
| Horde sync | **Custom compact binary horde stream** from day one, interest-managed per client; Colyseus schema for everything else | @colyseus/schema 5.0 | The horde is the bandwidth risk; optimize it first (user choice) |
| Hit validation | Server simulates all projectiles and melee; shots spawn at the shooter's position advanced by half their round-trip time (capped at 150 ms); the server rewinds zombies to what the shooter saw (≤ 12 ticks / 600 ms, Story 8.9 T10 on top of Story 8.8's 500 ms; was ≤ 6 ticks / 300 ms in Story 2.12), with spread keyed to the input seq; boss hits are not rewound (they use the player's newest server position) | — | Runners made reversed hits obvious (11–20 % at 150 ms); rewind brings them to 0.3–1.8 % |
| Simulation structure | Shared, engine-free TypeScript simulation package; data-oriented entity storage (struct-of-arrays for zombies and projectiles); uniform spatial hash grid (2 m cells) | TypeScript 6.0 | Same rules on server and client prediction; fast enough for 150+ zombies on one core |
| Run state machine | Explicit server-side state machine: Lobby → Build → Wave → EvacVote → (Endless loop ↔ EvacVote) → Results; Paused (saved) as a side state | — | Clear phase ownership; save points only in calm phases: Build and the evacuation vote (E8-S12, Story 8.4–8.6) |
| Persistence | **Single PostgreSQL** for accounts, meta-progression and saved runs | PostgreSQL 18 · pg 8.23 · Drizzle ORM 0.45 | One reliable store; user choice. 18 chosen over the brand-new 19.0 for maturity |
| Saved runs | **Autosave** snapshot (JSON, versioned, includes every PRNG state) at each Build phase start and last tick for crash recovery; **Save and quit**, a server stop or everyone leaving in a Build phase makes it resumable for 7 days by any account that was in the run (Epic 8 D10–D13) | — | Matches GDD; snapshots only at calm points |
| Reconnect | Colyseus `allowReconnection` 120 s; player slot, wallet and gear held in room state; seat identity is one `seatKey()` (`guest:` / `acct:`, `apps/server/src/run/lobby.ts`); close codes 4020 seat kept, 4021 taken over, 4022 removed, 4023 run saved (`packages/shared/src/net/reconnect.ts`) | Colyseus 0.18 | GDD 2-minute rule |
| Accounts | Guest = random 32-byte device token, kept in a 1-year HttpOnly cookie and a `localStorage` copy (Epic 7 D9), stored hashed → server session; account HTTP API in `apps/server/src/app.ts` (session, upgrade, login, recovery, unlock, training, look); the client gets a short-lived session ticket from it and sends the ticket in the Colyseus join options; upgrade to username + password (Argon2id hashed) | @node-rs/argon2 2.2 | No signup before first play (GDD); no email service needed |
| Hosting | User's existing **Linux VPS in Europe** (6 vCPU, 12 GB RAM, ~30 GB free); Docker Compose: Caddy (plain HTTP on 127.0.0.1:8080 + static client, behind the Cloudflare Tunnel that terminates HTTPS/WSS) · game server · PostgreSQL; game at https://hordes.sevend.io; Hermes deploys (`docs/deploy.md`) | Caddy 2.11 · Node.js 26 LTS | Already owned, close to all players, ample capacity (user choice) |
| Maps | Districts authored in **Tiled** (JSON export) **or generated in shared code from a city seed (Random city, ADR-06, Epic 11)**; both produce the same `DistrictMap` (collision, cover, spawns, hazards, events, decay groups with `pick N`); one layer group per decay stage, toggled by the decay system; map anchors (boss entries, evac pad, event spots) are map data in the `events` layer, not balance names | Tiled map format | Hand-made maps with data-driven decay; generated cities reuse the same engine |
| Lighting | Darkness texture (a half-resolution canvas registered through `addGeneratedTexture`, not a RenderTexture: Story 6.3 DD1) with lights cut out (flashlights, floodlights, fires, muzzle flashes); lit only when needed | Phaser 4 | Proven in the Lamplight probe; cheap when off |
| Balance data | All tunable numbers (weapons, zombies, buildings, waves, economy, decay timings) in typed JSON config in the shared package; `progression.json` (Supplies, unlock prices, Training) and `cosmetics.json` (survivor parts, no gameplay numbers); per-district overrides in `districts.json` (Epic 11: spawn bands, pathing budget; global caps stay) join in Epic 7 | — | Rebalance without code changes; server and client read the same values |
| Randomness | Seeded PRNG per run (run seed + named sub-streams: decay, events, spawns, combat, loot (Story 7.12), shop per player; `city` for the Random city seed, overridden by a city code the host types) | — | Reproducible runs for testing |
| UI | In-combat HUD drawn by Phaser; menus (lobby, shop, unlocks, evac vote) as HTML overlays built with **Preact** | Preact 11.2 | Readable, responsive menus on phones; small runtime |
| Asset loading | Boot (tiny; its loader fetches the street props atlas image) → Preload (SFX, map data; the art atlases are generated in code at load, except the street props and vehicles, which ship as one pre-rendered atlas image since Story 9.14: `render/city/streetProps.webp`, rendered offline from the approved code by `npm run art:street-props`; characters stay code-baked, Story 9.13) → Game; music streamed after start; texture atlases | Phaser Loader | 15 MB / 10 s first-load target |
| Audio | Three buses: music, SFX, ambience; positional volume/pan for zombie cues | Phaser Web Audio | GDD audio direction, settings |
| Testing | Vitest for shared simulation (headless, deterministic with seeds); bot clients for load tests | Vitest 5.1 |
| Pathfinding | **Flow fields** on a 0.5 m grid toward players, rebuilt when buildings or decay change; Runners use a flanking field | — | Zombies must route around cars, bus, rubble and barricades on a changing map |
| Client SDK | @colyseus/sdk (replaces the old `colyseus.js` package) | 0.18.10 |
| Validation / logging / lint | zod · pino · ESLint + typescript-eslint | 4.6 · 10.4 · 10.15 + 8.73 | Simulation is testable without a browser |

### State Management

**Server:** each game is a Colyseus room owning one `Run`: the run state machine plus the shared simulation `World`. The room is the only writer. Colyseus schema holds low-frequency, structured state (players, wallets, loadouts, buildings, phase, timers, decay stage, votes). High-frequency horde data is *not* in schema.

**Client:** Phaser scenes read state only. Local input is applied immediately to a predicted copy of the local player using the shared movement code, then reconciled with server snapshots. Remote players and zombies are rendered from an interpolation buffer ~100 ms behind.

### Networking

- **Tick:** server simulation fixed step 50 ms (20 Hz); projectile collision uses swept segment-vs-circle tests so 60 m/s bullets cannot tunnel.
- **Client input:** sampled and sent once per 50 ms simulation step (20/s): move vector, aim vector, fire held, swap, consumable, `isMouse` flag; each tagged with a sequence number for reconciliation. Prediction runs the same fixed step; rendering interpolates between predicted steps.
- **Time and determinism:** build, vote, downed and event timers count ticks inside the World; the Colyseus clock only drives `step()`. Joins, disconnects and reconnects enter the simulation as input events.
- **Lag compensation (built in Story 2.12):** the server keeps 14 rows (≈ 700 ms) of zombie and Behemoth position history and rewinds them to what the shooter saw (≤ 12 ticks / 600 ms (Story 8.9 T10, for its 250 ms lossy-line delay); 500 ms in Story 8.8; 300 ms in Story 2.12); spread is keyed to the input seq so client and server agree. Boss hits are not rewound (Epic 6 proposal §1.5). **Network pass (2026-11-24, `docs/perf/network-audit-2026-11.md`):** Story 8.8 raised the window to 500 ms (built; TCP stalls on 4G push shots past 300 ms; zombies are the only rewound targets, so nobody is treated unfairly); Story 8.9 lets the render delay adapt 100–250 ms with time-stretch catch-up and a clock that never runs backwards.
- **Horde stream:** per tick, per client, a binary message containing zombies inside that client's view plus a 4 m margin. Record: id (u16, pool slot with a generation bit), x and y (u16, 1 cm precision, map origin at 0,0, clamped), heading (u8), type+state (u8) = **8 bytes**; zombies outside the view are omitted. Worst case 150 in view × 8 B × 20 Hz ≈ **24 KB/s** + 6 B header per message. Total budget per client: horde ≤ 24 KB/s + schema patches and events ≤ 6 KB/s = 30 KB/s. **Story 8.10 (Network pass)** changes the record stream to a delta against the previous frame sent to that client (safe on ordered WebSocket: no acks), heading derived on the client, zombies > 8 m refreshed at 10 Hz, a full frame on join / after a skip / every second: ≈ 6.5–9 KB/s at ~118 in view (audit replay) instead of 18.6. **As built (Story 8.10, wire format `NET_PROTOCOL_VERSION` 2, checked at join → `update_required`):** keyframe = 7 B header + 8 B records; delta = 9 B header + new (8 B) + changed (slot, mask, 1-byte TINY / 2-byte SMALL / 4-byte FULL move, heading only when the phone's own derivation is > 4 steps off, typeState on change) + left (slot); decoded per connection from the join (`RunInbox`). Every zombie is refreshed every tick (the 10 Hz far rule is built but off: decision 8.10 B7, it stuttered on the clean line). Measured: 8.2 KB/s on the audit replay, 11.0 KB/s with 150 near and moving, 13.5 KB/s worst 1 s with the stampede's 180 in one view; **horde budget now ≤ 16 KB/s** (worst case + 20 %).
- **One packet per tick (Story 8.11, Network pass):** the state patch comes from the tick, not from Colyseus's 50 ms interval: `RunRoom.onTick` = one step, then `broadcastPatch()` (`patchRate` is the 50 ms interval only in the lobby before the first run; `null` once the fixed timestep runs, which keeps running after Results and Back to lobby, so idle phases — Results, lobby after a run, an 8.1 frozen room — still patch on change at 20 Hz). Each patch carries exactly one tick (a catch-up step patches after each step). `autoBatchMessages` (Colyseus 0.18.29) corks each socket for the timestep's callback, so the tick's horde frame, events, ping and patch (in that order) leave as **one TCP write** per client (measured with 4 bots: 46–47 → 20.1–20.3 down writes/s per phone; input 2.3 → 0.31 KB/s). The input is a **14-byte binary message** (`BYTES.INPUT`: format byte, seq u32, 4 sticks int8 × 127, flag bits, viewTick + 1 u32; `encodeInput`/`decodeInput` in `packages/shared/src/net/input.ts`) instead of the ~116 B msgpack `input.send`: decoded on the server exactly as strictly as `playerInputSchema` (anything else is dropped and counted as `invalid`; the 25/s input bucket is unchanged) and quantised on the phone before prediction, so the predicted and the server's moves use the same values. Wire format `NET_PROTOCOL_VERSION` 3 (checked at join → `update_required`).
- **Backpressure:** if a client's socket `bufferedAmount` exceeds 64 KB, horde frames for that client are skipped (never queued) until it drains.
- **Interpolation delay:** adaptive 100–250 ms from measured lateness (Story 8.9; was 100–150 ms from jitter): a render clock at 0.9–1.1× that never runs backwards, on a slewed, monotonic server clock.
- **Other entities:** projectiles are not synced as entities; they are cosmetic on clients, spawned from `weapon.fired` events. The Behemoth, hazard zones, mines, the Survivor NPC, the supply crate and `aliveCount` live in Colyseus schema.
- **Events:** deaths, explosions, hits, telegraphs and decay transitions as reliable discrete messages so effects play exactly once.

### Data Persistence

- **PostgreSQL tables (initial):** `accounts` (id, username, password hash, recovery code hash, guest token hash, display name, created), `progress` (account id, supplies, lifetime supplies, unlocks, training levels, districts; `look` from Story 7.9; `cosmetics`, `stats` from Story 7.11), `saved_runs` + `saved_run_players` (Story 8.4); also `device_tokens` (Story 7.6, `0003_accounts_devices`) and `run_rewards` (Story 7.2, one row per player per run). Migrations so far: `0000_init` … `0005_saved_runs` in `apps/server/drizzle/`. Planned: `progress.settings` (Story 10.1), `problem_reports` (Story 10.6: id, account id nullable, created, note, payload JSON; kept 30 days), `run_results` + `run_result_players` (Story 10.7). Each story's migration adds only its own columns.
- **Migration order rule (Epic 7 retro E7-A3):** Drizzle applies a migration only if its journal `when` (`apps/server/drizzle/meta/_journal.json`) is newer than the last applied one, so an entry with an older `when` than the last one already applied is **skipped silently**. When two stories add a migration in parallel, **the second to land regenerates its migration on top of master** (delete its own SQL + snapshot + journal entry, merge master, `npm run db:generate`); never rename or renumber a file by hand. `apps/server/src/db/migrationJournal.test.ts` fails CI unless the journal's `idx` are 0…n−1, its `tag`s match the `.sql` files in order (one entry per file), and its `when` values strictly increase.
- **Migrations:** Drizzle Kit, versioned in the repo.
- **What is not persisted:** live wave state; a run can only be saved and resumed from a calm phase: a Build phase or the evacuation vote (E8-S12). The save format is `packages/shared/src/save/` (`SAVE_SCHEMA_VERSION`, currently 1, with a migration step per bump and a coverage test; E8-S1).

### Asset Management

Texture atlases per district and per character set; audio sprites for SFX; ambience loops and music streamed. Art is drawn in game code (`render/city/*`) into atlases with `category_name_variant` frames, each registered through `addGeneratedTexture` (Story 4.13: Android wipes canvases in the background); AI/vector images are references only. Epic 9 is a photoreal pass without hiring (designer 2026-11-26, `sprint-change-proposal-2026-11-26-epic-9-photoreal.md`): each art group is picked on a proposal page and built one of two ways, **worker relight** (the code drawing relit at load in a Web Worker: `render/city/relight.ts`, `*BakeWorker.ts`, main-thread sliced fallback with a 6 ms slice, kept cache, re-bake after a graphics restore; for animated or per-player art, with `controls.fx` caps) or **pre-rendered atlas** (rendered offline from the approved code into a lossless WebP + frame JSON + drift hash, like `npm run art:street-props`; for static art, each ≤ 2 MB, code drawing as fallback). Budgets per group: atlases ≤ 2048², first load < 15 MB, `?stress=150` within 2 FPS / +1 ms p95 of master. Sound stays code/procedural or licensed/free. *(Updated by the photoreal pass, `docs/art/photoreal-decisions.md`: 9.11 and 9.13 relight the code drawings at load in a Web Worker. Since 9.14 the street props and vehicles ship as one pre-rendered image atlas, `render/city/streetProps.webp`, rendered offline from the approved code; see Asset loading. When the image is late or fails, the code drawings are the fallback.)*

### Architecture Decision Records

- **ADR-01 Server authority + client prediction.** Chosen over lockstep (fragile with mobile networks, hard mid-run joins) and client authority (screens drift). Cost: prediction/reconciliation code for the local player.
- **ADR-02 Custom horde stream.** Chosen over pure schema sync to control the biggest bandwidth risk from day one. Cost: a hand-written encoder/decoder with tests.
- **ADR-03 Shared simulation package.** One implementation of movement, combat and collision used by the server (authority), the client (prediction) and tests. Rule: no Phaser or Colyseus imports inside it.
- **ADR-04 Single PostgreSQL on the existing VPS.** Simplicity over scale; backups by nightly dump.
- **ADR-05 Tiled or generated maps with decay layers.** Decay is data (mutation groups with `pick N`), not code paths per district, so neither a new district nor a generated city needs new decay code.
- **ADR-06 City generator in shared code (Random city, Epic 11; `sprint-change-proposal-2026-11-24-random-city.md`).** `packages/shared/src/map/gen/` turns `(citySeed, generatorVersion)` into a `DistrictMap`; the server sends the pair and every client builds the same map. Chosen over sending a generated map from the server (a download per join, harder replays) and over hand-made block assemblies (rejected in the forge). Rules: no randomness outside the `city` PRNG; the join checks the generator version and the map digest (mismatch → "Please refresh"); every city passes checks A–G and the anchor check, or is regenerated; saved runs store `citySeed` + `generatorVersion`, and a save from an older generator version can't be resumed (Saved games shows "This city is from an older version" with Delete only; designer 2026-11-25); the generator uses only integer/fixed-point maths or shared lookup tables (no transcendental `Math.*`, which engines may round differently), checked by lint and a cross-browser digest fixture. Cost: generator code and checks that must hold for every seed.

## Cross-cutting Concerns

These patterns apply to ALL systems and must be followed by every implementation.

### Error Handling

**Strategy:** Result objects for expected failures; exceptions only for programmer errors; one global handler per process.

- **Expected failures** (invalid purchase, placement blocked, join refused, save failed) return a typed `Result<T, E>`; never throw for them.
- **Programmer errors** (broken invariants) throw; the room's global handler logs them at `error`, keeps the run alive if possible, and, if the simulation is corrupted, saves the last Build snapshot and closes the room with a player-facing message.
- **Client input is untrusted:** every message from a client is validated (schema-checked with zod) before it touches the simulation; invalid messages are dropped and logged at `warn`.
- **Player-facing errors** are short, plain and actionable: "Connection lost, reconnecting…", "Not enough money", "Can't build here". Never a stack trace.
- **The simulation never pauses for an error.** A failed system logs and skips its work for that tick.

```ts
// packages/shared/src/core/result.ts
export type Result<T, E extends string = string> =
  | { ok: true; value: T }
  | { ok: false; error: E };

// usage in the shop system
export function buyItem(wallet: Wallet, item: ShopItem): Result<Wallet, "insufficient_funds" | "not_unlocked"> {
  if (!item.unlocked) return { ok: false, error: "not_unlocked" };
  if (wallet.currency < item.price) return { ok: false, error: "insufficient_funds" };
  return { ok: true, value: { ...wallet, currency: wallet.currency - item.price } };
}
```

### Logging

**Format:** structured JSON on the server (pino 10.x); console on the client in development.
**Destination:** server logs to stdout (collected by Docker, rotated); client keeps a ring buffer of the last 200 log lines and attaches it when a player taps **Report a problem**, which posts it to the server.

**Log levels:**
- `error` — something broke (exception, failed save, corrupted state)
- `warn` — unexpected but handled (invalid client message, reconnect timeout, slow tick > 40 ms)
- `info` — milestones (room created, run started, wave started/ended, decay stage, evac result, save/resume)
- `debug` — diagnostics, off in production
- **Never log inside per-zombie or per-projectile loops.** Hot paths aggregate counters and report once per wave.

Every server log line carries `roomId`, and when relevant `runSeed`, `wave`, `playerId`.

```ts
log.info({ roomId, runSeed, wave: 5, alive: 142 }, "wave_started");
log.warn({ roomId, playerId, reason: "invalid_aim_vector" }, "client_message_rejected");
```

### Configuration

| Type | Where | Example |
| --- | --- | --- |
| Game constants | `packages/shared/src/config/constants.ts` | tick rate 20 Hz, grid cell 2 m |
| Balance values | `packages/shared/src/config/balance/*.json`, typed and validated at load | weapon table, zombie table, wave curve, prices, decay timings |
| Player settings | client localStorage (try/catch), synced to the account when logged in | volumes, quality, gore toggle, aim assist, haptics (Story 10.1; guest merge keeps the account's settings) |
| Environment / deployment | environment variables read once at server start | database URL, public URL, log level |

**Rules:** no gameplay number is written inline in code; systems read balance values through one typed `Balance` object. The server and client load the same balance files; the server sends the balance version on join and refuses mismatched clients ("Please refresh").

### Event System

**Pattern:** a typed, synchronous event bus inside the simulation (`World.events`), drained once per tick.

- **Naming:** `domain.past_tense_verb` in snake case: `zombie.killed`, `player.downed`, `player.revived`, `building.destroyed`, `wave.started`, `decay.stage_changed`, `event.triggered`.
- **Typed payloads:** one TypeScript union `SimEvent`; no string-keyed `any` events.
- **Synchronous:** events emitted during a tick are processed at the end of that tick, in order; no async handlers in the simulation.
- **Network:** the room forwards the subset of events clients need (effects, sounds, UI) as reliable messages; the client re-emits them on a client-side bus for scenes and UI.

```ts
export type SimEvent =
  | { type: "zombie.killed"; zombieId: number; killerId: string | null; x: number; y: number; weapon: WeaponId }
  | { type: "player.downed"; playerId: string }
  | { type: "decay.stage_changed"; stage: DecayStage };

world.events.emit({ type: "zombie.killed", zombieId, killerId, x, y, weapon });
```

### Debug Tools

**Available tools:**
- **Debug overlay:** FPS, ping, bandwidth in/out, zombies alive / in view, tick time. Also in release builds behind Settings → "Show performance", so friends can report lag with numbers.
- **Dev cheats (development builds only, stripped from release):** spawn zombies by type, skip wave, give currency, set decay stage, trigger an event, force blackout, set run seed, god mode.
- **Release-safe switches** (kept in release builds on purpose): `?debug=1` (overlay), `?stress=150` (phone benchmark), `?tune=1` (control tuning), `?loadout=a:3,b:4` (weapons and levels), `?lag=<rttMs>&jitter=<ms>` (bad-connection throttle), `?wallet=` (solo runs only).
- **Collision and grid view:** draws hitboxes, spatial grid and spawn points.
- **Headless replay:** re-run a simulation from a seed and an input log in tests.

**Activation:** `?debug=1` in the URL (development and release builds) or a three-finger tap; release builds also via Settings.

## Project Structure

### Organization Pattern

**Pattern:** monorepo with three workspaces (client, server, shared), organized **by game domain** inside each.

**Rationale:** the shared simulation is the heart of the game and must stay engine-free; domain folders (combat, zombies, waves, decay, economy…) map one-to-one to GDD sections and epics, so an agent implementing a story knows exactly which folder it touches.

### Directory Structure

```
topdown-shooter/
├── apps/
│   ├── client/                         # Phaser 4 + Preact, built by Vite
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── public/assets/              # served as-is (see Game Assets)
│   │   │   ├── atlases/                # (art atlases are generated in code at load: render/city/*; the street props / vehicles atlas is a pre-rendered image bundled from src/render/city/streetProps.webp, Story 9.14; no character PNGs)
│   │   │   ├── maps/                   # downtown.tmj (Tiled export)
│   │   │   ├── audio/{sfx,ambience,music}/
│   │   │   └── ui/
│   │   └── src/
│   │       ├── main.ts                 # boots Phaser + Preact overlay
│   │       ├── scenes/                 # BootScene, PreloadScene, GameScene, HudScene
│   │       ├── net/                    # Colyseus client, horde stream decoder, interpolation, prediction
│   │       ├── input/                  # touch twin-stick, keyboard/mouse, input sampler
│   │       ├── render/                 # zombie/player/building views, lighting & blackout, decay visuals, fx
│   │       ├── audio/                  # buses, ambience per decay stage, adaptive music
│   │       ├── ui/                     # Preact screens: Lobby, Shop, EvacVote, Results, Unlocks, Settings
│   │       ├── settings/               # player settings (localStorage + account sync)
│   │       └── debug/                  # perf overlay, dev cheats (dev builds only), report-a-problem
│   └── server/                         # Colyseus 0.18 on Node.js
│       └── src/
│           ├── index.ts                # HTTP + Colyseus server bootstrap
│           ├── rooms/RunRoom.ts        # one room = one run; owns Run + World
│           ├── rooms/schema/           # Colyseus schema classes (players, buildings, phase, votes)
│           ├── net/                    # horde stream encoder, interest management, input validation (zod)
│           ├── run/                    # run state machine, save/resume, reconnect, join mid-run
│           ├── auth/                   # guest tokens, username/password, sessions
│           ├── db/                     # Drizzle schema, migrations, repositories
│           ├── meta/                   # Supplies, unlocks, training (account progression)
│           └── ops/                    # logging (pino), health check, problem reports
├── packages/
│   └── shared/                         # engine-free game simulation (no Phaser, no Colyseus)
│       └── src/
│           ├── core/                   # World, fixed-step loop, Result, events bus, seeded RNG, spatial grid
│           ├── math/                   # vectors, swept collision, quantization helpers
│           ├── config/
│           │   ├── constants.ts
│           │   └── balance/            # weapons, zombies, buildings, combat, consumables, gear, shop, loot,
│           │                           # waves, economy, decay, events, boss, player, controls, bots (.json); progression.json + cosmetics.json sit one level up in config/
│           ├── player/                 # movement, health, downed/revive, loadout
│           ├── combat/                 # weapons, projectiles, melee arcs, damage, friendly fire
│           ├── zombies/                # zombie storage (SoA), AI behaviors per type, telegraphs
│           ├── boss/                   # Behemoth
│           ├── waves/                  # wave director, spawn points, player-count scaling, endless
│           ├── events/                 # special events (car alarm, gas leak…)
│           ├── buildings/              # placement grid, building behaviors, repairs
│           ├── economy/                # wallets, rewards, shop deck & card draw
│           ├── decay/                  # decay stages, map mutations, hazards, lighting state
│           ├── map/                    # district loading from Tiled data, collision, cover
│           │   └── gen/                # Random city generator: street plan, blocks, recipes, checks A–G + anchors (Epic 11)
│           ├── net/                    # message types and horde record format (shared by encoder/decoder)
│           └── index.ts
├── tools/
│   ├── bots/                           # headless bot clients for load tests
│   └── maps/                           # Tiled project files (.tiled-project, .tmx sources)
├── deploy/
│   ├── docker-compose.yml              # caddy, server, postgres
│   ├── Caddyfile
│   └── server.Dockerfile
├── _bmad/ , _bmad-output/ , docs/      # BMAD method, planning artifacts, project knowledge
├── package.json                        # npm workspaces
├── tsconfig.base.json
└── .github/workflows/                  # CI: typecheck, lint, tests
```

Tests live next to the code they test: `foo.ts` → `foo.test.ts`.

### System Location Mapping

| System | Location | Responsibility |
| --- | --- | --- |
| Simulation loop, World, events, RNG | `packages/shared/src/core` | Fixed 20 Hz step, entity storage, event bus |
| Player movement, health, revive | `packages/shared/src/player` | Used by server (authority) and client (prediction) |
| Weapons, projectiles, melee, damage | `packages/shared/src/combat` | Reads `balance/weapons.json` |
| Zombie AI and crowd separation | `packages/shared/src/zombies` | SoA storage, spatial grid queries |
| Behemoth | `packages/shared/src/boss` | Attacks, telegraphs, enrage |
| Wave director, spawns, scaling | `packages/shared/src/waves` | Wave curve, endless rules |
| Special events | `packages/shared/src/events` | One module per event |
| Buildings | `packages/shared/src/buildings` | Grid placement, turret logic, damage |
| Economy and shop deck | `packages/shared/src/economy` | Wallets, rewards, card draw with floor |
| Decay | `packages/shared/src/decay` | Stage changes, map mutations, hazards, light state |
| District maps | `packages/shared/src/map` + `apps/client/public/assets/maps` | Collision/cover from Tiled data |
| Run state machine, save/resume | `packages/shared/src/run` (state machine), `packages/shared/src/save` (save format), `apps/server/src/run` (rooms, snapshots, reconnect, mid-run join) | Phases, snapshots, reconnect, mid-run join |
| Horde stream | `packages/shared/src/net` (format) · `apps/server/src/net` (encode) · `apps/client/src/net` (decode) | Compact per-client zombie updates |
| Prediction and interpolation | `apps/client/src/net` | Local player prediction, remote buffers |
| Rendering, lighting, blackout | `apps/client/src/render` | Views of simulation state only |
| Touch controls | `apps/client/src/input` | Floating twin-sticks, aim assist input |
| Menus | `apps/client/src/ui` | Preact overlays |
| Accounts and meta-progression | `apps/server/src/auth`, `apps/server/src/meta`, `apps/server/src/db` | PostgreSQL via Drizzle |
| Logging, reports, health | `apps/server/src/ops`, `apps/client/src/debug` | pino, report-a-problem |
| Deployment | `deploy/` | Docker Compose on the VPS |

### Naming Conventions

#### Files
- TypeScript modules: `camelCase.ts` (`waveDirector.ts`, `hordeStream.ts`); files exporting one class or Preact component: `PascalCase.ts(x)` (`RunRoom.ts`, `ShopScreen.tsx`, `GameScene.ts`).
- Tests: `<name>.test.ts` next to the source.
- Balance data files: `lowercase.json` with camelCase keys (`weapons.json` → `{ "pistol": { "damage": 5, "rateHz": 3 } }`).

#### Code Elements
| Element | Convention | Example |
| --- | --- | --- |
| Classes, types, interfaces | PascalCase | `RunRoom`, `ZombieType`, `SimEvent` |
| Functions, methods, variables | camelCase | `spawnWave()`, `aliveCount` |
| Constants | UPPER_SNAKE_CASE | `TICK_RATE_HZ`, `GRID_CELL_M` |
| Enum-like string unions | lowercase strings | `"walker" \| "runner" \| "brute"` |
| IDs in balance data | lowercase snake | `fire_axe`, `auto_turret`, `gas_leak` |
| Events | `domain.past_tense` | `zombie.killed`, `decay.stage_changed` |
| Network messages | `domain.verb` imperative from client, past tense from server (binary messages: numeric `BYTES` types, e.g. the input since Story 8.11) | `shop.buy` / `wave.started` |
| Units | SI suffix where ambiguous | `speedMps`, `rangeM`, `cooldownS`, `durationMs` |

#### Game Assets
- `category_name_variant` in snake case: `zombie_brute_walk`, `weapon_shotgun_fire`, `fx_blood_splat_02`, `amb_breakdown_rain`, `ui_btn_ready`.
- Atlas frames use the same names; animations are `<entity>_<action>` (`walker_attack`).
- Tiled layers: `stage1_evening`, `stage2_panic`, … `stage5_collapse`, plus `collision`, `cover`, `spawns`, `hazards`. The Downtown map is generated by `tools/maps/buildDowntown.ts` (Tiled `.tmx`/`.tmj`) until the designer edits it in Tiled. Random city maps are built by `packages/shared/src/map/gen/` at run start (Epic 11) and never written to files.

### Architectural Boundaries

1. **`packages/shared` imports nothing from Phaser, Colyseus, the DOM or Node APIs.** It is pure TypeScript and runs in browsers, Node and tests.
2. **The server is the only writer of game state.** The client may only predict its own player and must reconcile with the server.
3. **Rendering code never changes simulation state**; it reads state and plays effects from events.
4. **All gameplay numbers come from `config/balance`**; none inline.
5. **The database is only touched from `apps/server/src/db` repositories**, never from rooms or simulation code directly.
6. **Client ↔ server message shapes are defined once** in `packages/shared/src/net` and validated on the server.
7. **Dev cheats live only in `apps/client/src/debug` and a dev-only server handler**, compiled out of release builds.

## Implementation Patterns

These patterns ensure consistent implementation across all AI agents.

### Novel Patterns

#### 1. Decay Stage Engine

**Purpose:** change a district's gameplay (collision, cover, hazards, spawn points, lighting) and visuals stage by stage during a run, with no district-specific code.

**Components:**
- `DecayTimeline` (`shared/decay`): reads `decay.json` (stage per wave, e.g. waves 1–2 → stage 1) and the run seed; decides the random variations once per run (which cars burn, which alley collapses).
- `DistrictMap` (`shared/map`): loaded from the Tiled export; holds per-stage **mutation sets**: objects with a `stage` property and an action `add | remove | ignite | block`.
- `DecaySystem` (`shared/decay`): at the start of each Build phase, if the stage changes, applies the stage's mutations to the World (collision grid, cover, spawn points, hazard zones, light sources) and emits `decay.stage_changed`.
- Client decay visuals (`client/render/city/*`; the old `DecayView`, `StreetView` and `CoverView` are gone): on `decay.stage_changed`, redraw the stage's code-drawn objects, light (`NIGHT_BY_STAGE`), weather and ambience. The client prediction also runs `applyDecayStage` on its own predicted map so local movement collides correctly.

**Data flow:** wave ends → Build phase starts → `DecaySystem.apply(stage)` mutates World → event → server forwards → client swaps visuals and audio.

**Rules:** decay changes happen only at Build phase start (never mid-wave), so players see the new map before fighting in it. Buildings overlapping a newly blocked cell are destroyed, with no refund (Story 12.4, 2026-11-26; was "refunded 50%"), and so is every wall within one player body (0.8 m) of new cover (Story 12.1 AC 6); then the path rule runs again and walls that now seal part of the map are cleared (12.1 H1). Story 12.1: a wall placement or move that would seal a pocket of the walkable map is refused (`buildings/pathOpen.ts`). On resume, stages 1…N are re-applied to the map **without side effects** (no building destruction, no refunds, no events), then the snapshot's buildings are restored.

```ts
// packages/shared/src/decay/decaySystem.ts
export function applyDecayStage(world: World, stage: DecayStage, plan: DecayPlan): void {
  if (world.decay.stage === stage) return;
  for (const m of plan.mutationsFor(stage)) applyMutation(world, m); // add/remove/ignite/block
  world.decay.stage = stage;
  world.events.emit({ type: "decay.stage_changed", stage });
}
```

#### 2. Horde Stream (interest-managed binary sync)

**Purpose:** send up to 150 zombies per client within ~30 KB/s. *(Original design; as built by Story 8.10, the stream is keyframes + deltas with a horde budget ≤ 16 KB/s, and every zombie is refreshed at 20 Hz: see Networking › Horde stream.)*

**Components:** `hordeFormat` (`shared/net`: record layout, quantization), `HordeEncoder` (`server/net`: per-client view culling + encoding each tick), `HordeDecoder` + `InterpolationBuffer` (`client/net`).

**Data flow:** every tick the server, per client, selects zombies within that client's camera rectangle + 4 m (using the spatial grid), writes `[tick u32][count u16]` + records `[id u16][x u16][y u16][heading u8][typeState u8]` (8 bytes), and sends one binary message. Pool ids carry a generation bit and freed slots are held 1 s before reuse, so a new zombie never interpolates from a dead one's position. The client keeps the last 3 snapshots and renders ~100 ms behind; a zombie absent from 3 consecutive snapshots is removed from view; deaths arrive separately as reliable `zombie.killed` events so the death animation plays exactly once.

```ts
// packages/shared/src/net/hordeFormat.ts
export const HORDE_RECORD_BYTES = 8;
export const POS_SCALE = 100; // 1 cm precision, map up to 655 m
export function quantizePos(m: number): number { return Math.round(m * POS_SCALE); }
```

#### 3. Personal Shop in a Shared Run

**Purpose:** each player draws their own 6 cards from their own unlocked pool while sharing one run and one seed.

**Rule:** the shop draw uses a per-player RNG sub-stream derived from `runSeed + playerSlot + buildPhaseIndex` (the stable slot, not the connection id, so reconnects and resumes keep the same stream); offers are sent only to that client (schema `@view()` with a per-client `StateView`, or a direct message if the view API does not fit). Purchases are validated on the server against the stored offer; rerolls advance the player's sub-stream. A mid-run joiner gets their own stream starting at the current Build phase.

#### 4. Blackout Lighting

**Purpose:** darkness as gameplay without per-frame cost when lights are on.

**Rule:** the server owns the light *state* (stage, blackout flag, which light sources exist); the client renders a darkness texture (registered canvas, Story 6.3) only when the flag is on, cutting out cones for flashlights (aim direction), circles for floodlights, fires and muzzle flashes; zombie eyes are drawn above the darkness. Gameplay effects of darkness (e.g. turrets only target lit zombies, if adopted later) read the server light state, never the client render.

### Communication Patterns

**Pattern:** systems inside the simulation communicate through the typed event bus (see Cross-cutting → Event System) and through explicit function calls in a fixed system order; no system holds references to another system's internals.

**System order per tick:** input → player → buildings → combat (projectiles, melee, aim assist applied here from server positions) → zombies AI/movement → boss → waves/spawns → events (special) → economy (rewards from events) → decay timers → event dispatch.

```ts
// packages/shared/src/core/world.ts
export function step(world: World, dt: number): void {
  applyInputs(world); updatePlayers(world, dt); updateBuildings(world, dt);
  updateCombat(world, dt); updateZombies(world, dt); updateBoss(world, dt);
  updateWaves(world, dt); updateSpecialEvents(world, dt); updateEconomy(world);
  updateDecayTimers(world); world.events.flush();
}
```

### Entity Patterns

**Creation:** factories + pools. Zombies and projectiles live in pre-allocated struct-of-arrays pools in the World (no per-spawn object allocation); players and buildings are plain objects created by factory functions reading balance data. Client views use Phaser object pools keyed by entity id.

```ts
const id = world.zombies.spawn("brute", x, y); // returns pool index; reads stats from balance
world.zombies.kill(id, killerId);              // frees the slot, emits zombie.killed
```

### State Patterns

- **Run phases:** explicit state machine (`packages/shared/src/run/runStateMachine.ts`, run by the server); transitions only through named functions (`startWave`, `endWave`, `openEvacVote`…).
- **Zombie behavior:** small per-type state machines stored as a `u8` state in the pool (`chase`, `flank`, `keepDistance`, `windup`, `attack`, `swell`); no behavior trees in v1.
- **Player state:** `alive | downed | out` with timers (`reviveProgressS`, `downedTimeLeftS`).

### Data Patterns

**Access:** one typed `Balance` object loaded and validated (zod) at startup in both server and client, passed into the World; systems read `world.balance.weapons.shotgun.pellets`, never raw JSON.

```ts
const balance = loadBalance(rawJsonFiles); // throws at startup if any value is invalid
const world = createWorld({ balance, seed, district });
```

### Consistency Rules

| Rule | Example |
| --- | --- |
| Simulation code is deterministic for a given seed and inputs | no `Math.random()`, no `Date.now()` in `packages/shared` |
| Simulation timers count ticks (no float seconds); rates in SI units, distances in meters | `ticksFor(1.2)` = 24 ticks; `speedMps * dt` |
| Every client message type has a zod schema in `shared/net` | `inputMessageSchema.parse(msg)` |
| No gameplay number inline | `balance.zombies.walker.hp`, not `10` |
| Each new GDD mechanic gets a unit test in `shared` with a fixed seed | `bloater.test.ts` |
| Client never decides outcomes | client plays `zombie.killed`, never deletes a zombie on its own |


### Zombie Pathfinding

`shared/zombies/flowField.ts`: a flow field on a 0.5 m grid pointing toward the nearest player, rebuilt when buildings are placed or destroyed and when the decay stage changes (at most once per tick, amortized over several ticks for the full map). Runners follow a second field that penalizes cells near other players' facing directions (flanking). A zombie whose next cell is blocked by a building attacks the building. Separation forces still apply on top of the field.

### Run Room Rules

- **Room code:** `onCreate` sets `this.roomId` to a random 4-letter code (no ambiguous letters); the share link is `https://hordes.sevend.io/j/<code>`.
- **Capacity and joins:** `maxClients = 4`; `onAuth` accepts new players only during Lobby and Build phases.
- **Host:** `hostSlot` in schema; when the host leaves or drops, it moves at once to the longest-connected player and never moves back. Host only gates Start, Save and quit and Remove player. Saved runs belong to every account in the run (`saved_run_players`); any of them can resume (Epic 8 D8, D13).
- **Pings:** `ping.send` (rate-limited to 1 per second per player) → broadcast `ping.placed`.
- **Evacuation vote:** 15 s; a majority of the connected, standing players wins; a tie or no counted votes = extract (Story 8.12).

### Client Platform Budgets

- devicePixelRatio capped at 2; texture atlases ≤ 2048 × 2048; darkness texture at half resolution.
- Music via streamed audio; SFX in audio sprites.
- No per-frame allocation in render loops; Phaser object pools for views.
- On `visibilitychange` (tab hidden) the client stops rendering and audio; the server keeps the player for the reconnect window.
- Web app manifest (fullscreen, landscape), `viewport-fit=cover` with safe-area insets, a rotate-your-phone overlay in portrait.
- Gore and dismemberment are client-only effects driven by `zombie.killed` (weapon and damage type); the gore toggle replaces them with blood only.
- The Preact overlay uses `pointer-events: none` except on active screens so touch reaches the joysticks.
- Fog's 10 m vision limit is gameplay, not a quality setting.

### Security and Operations

- **Transport:** HTTPS and WSS only, terminated at the Cloudflare edge (Caddy is plain HTTP on 127.0.0.1 behind the tunnel); WebSocket origin check against the game's subdomain.
- **Accounts:** Argon2id password hashes; guest tokens stored hashed; rate limits on login (5/min per IP) and room creation (10/min per IP).
- **Input hardening:** inbound message size limit of 1 KB (`MAX_CLIENT_MESSAGE_BYTES`; the only binary client message is the 14-byte input since Story 8.11), server-side input rate cap (25/s per client), zod validation.
- **Backups:** nightly `pg_dump` container, 14 days kept, copied off the VPS; restore tested once per milestone.
- **Deploys:** graceful shutdown autosaves every running room's last Build snapshot; Caddy serves `index.html` with no-cache and hashed assets with long cache; CI typechecks, lints, tests and builds the Docker images. *(As built 2026-11-25, `.github/workflows/ci.yml` + `docs/ci.md`: code reaches master only through a PR. CI runs the jobs `static` (typecheck + lint), `release` (build + cheat scan), `test` (4 shards) and `docker` in parallel. The required check is `gate`, which passes only when all four pass. Docs-only changes (`docs/**`, `_bmad/**`, `_bmad-output/**`, `.claude/**`, `*.md`) skip CI and go straight to master. Push runs happen on master only. The ruleset `master gate` blocks force pushes.)*
- **Run stats:** `run_results` (district or `random:<code>`, seed, player count, wave reached, extracted, started, ended, nights played) and `run_result_players` (run id, account id, slot, loadout, waves in) for the success metrics (Story 10.7).

### Development Environment

- Node.js 26 LTS, npm workspaces; scripts: `npm run dev` (client + server with hot reload), `npm test` (Vitest), `npm run lint`, `npm run typecheck`, `npm run build`.
- **Epic 1 local mode:** before networking exists, the client runs the shared World in the browser behind a `SimHost` interface; Epic 2 swaps in the networked host without changing scenes.
- Context7 MCP for current Phaser/Colyseus/Vite documentation.

**Prerequisites:** Node.js 26 LTS, npm, Docker + Docker Compose (for the deploy stack and an optional local PostgreSQL; without `DATABASE_URL` outside production the server uses an in-process PGlite database, which dev and tests use), Tiled 1.11+ for map editing, Git.

**Setup commands:**

```bash
npm install
docker compose -f deploy/docker-compose.yml up -d postgres
npm run db:migrate
npm run dev
claude mcp add context7 -- npx -y @upstash/context7-mcp
```

**First steps:**
1. Scaffold the monorepo (structure above) with lint, typecheck and Vitest wired in CI.
2. Implement the shared World loop, seeded RNG, spatial grid and balance loading with tests.
3. Configure the Context7 MCP.
4. Start Epic 1 in local `SimHost` mode: touch twin-stick, Walkers, three weapons, frame-rate overlay on a real phone.

## Architecture Validation

### Validation Summary

| Check | Result | Notes |
| --- | --- | --- |
| Decision Compatibility | Pass (after fixes) | Timers moved into the World; prediction rate aligned to 20 Hz; client applies decay to its predicted map; RNG keyed on stable slots |
| GDD Coverage | Pass | Evacuation vote rule settled (15 s, majority, tie = extract) |
| Pattern Completeness | Pass | Entity creation, communication, state, errors, data, events defined with examples |
| Epic Mapping | Pass | All 10 epics map to locations; Epic 1 local SimHost added; Epics 8–10 items mapped in Run Room Rules, Budgets, Security and Operations |
| Document Completeness | Pass | Executive summary, dev environment and security/ops added; versions re-checked on npm 2026-11-21 |

### Coverage Report

**Systems covered:** 15/15 from Project Context. **Novel patterns:** 4. **Decisions recorded:** 22 in the summary table plus 5 ADRs.

### Issues Resolved

- Horde record size corrected to 8 bytes (24 KB/s worst case) and a full per-client bandwidth budget added.
- Flow-field pathfinding added (was missing).
- TypeScript pinned to 6.0 (typescript-eslint does not yet support 7.0); client SDK renamed to `@colyseus/sdk`.
- Deterministic tick-based timers; input sampled at the simulation rate; adaptive interpolation; backpressure; id generation bits.
- Private shop offers via schema views; resume applies decay without side effects; autosave vs explicit save separated.
- Host migration, room codes, join rules, pings, aim assist location, cosmetic projectiles and schema entities defined.
- Platform budgets (memory, battery, install, safe areas), security, backups, deploys and run stats added.

### Validation Date

2026-11-21
