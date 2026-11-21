---
title: 'Game Architecture'
project: 'topdown-shooter'
date: '2026-11-21'
author: 'Root'
version: '1.0'
stepsCompleted: [1, 2, 3, 4, 5]
status: 'in-progress'

# Source Documents
gdd: '_bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md'
epics: '_bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/epics.md'
brief: '_bmad-output/planning-artifacts/briefs/brief-topdown-shooter-2026-11-21/brief.md'
---

# Game Architecture

## Document Status

This architecture document is being created through the GDS Architecture Workflow.

**Steps Completed:** 5 of 9 (Cross-cutting)

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
| Run persistence: reconnect (2 min), save & resume (7 days, host required), join mid-run | high | Run Structure, Multiplayer Considerations |
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
| Language | **TypeScript** (client, server, shared code) | 7.0.x |
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
npm i -w apps/client phaser colyseus.js && npm i -D -w apps/client vite typescript
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
| Hit validation | Server simulates all projectiles and melee; shots spawn at the shooter's position advanced by half their round-trip time (capped at 150 ms); no full rewind in v1 | — | Zombies are slow (≤ 4 m/s); simple compensation meets "< 1 in 20 hits reversed" |
| Simulation structure | Shared, engine-free TypeScript simulation package; data-oriented entity storage (struct-of-arrays for zombies and projectiles); uniform spatial hash grid (2 m cells) | TypeScript 7.0 | Same rules on server and client prediction; fast enough for 150+ zombies on one core |
| Run state machine | Explicit server-side state machine: Lobby → Build → Wave → EvacVote → (Endless loop ↔ EvacVote) → Results; Paused (saved) as a side state | — | Clear phase ownership; save points only in Build |
| Persistence | **Single PostgreSQL** for accounts, meta-progression and saved runs | PostgreSQL 18 · pg 8.23 · Drizzle ORM 0.45 | One reliable store; user choice. 18 chosen over the brand-new 19.0 for maturity |
| Saved runs | Run snapshot (JSON, versioned) written at each Build phase; kept 7 days; resumable only with the host | — | Matches GDD; snapshots only at calm points |
| Reconnect | Colyseus `allowReconnection` 120 s; player slot, wallet and gear held in room state | Colyseus 0.18 | GDD 2-minute rule |
| Accounts | Guest = random device token in localStorage → server session; upgrade to username + password (Argon2id hashed) | @node-rs/argon2 2.2 | No signup before first play (GDD); no email service needed |
| Hosting | User's existing **Linux VPS in Europe** (6 vCPU, 12 GB RAM, ~30 GB free); Docker Compose: Caddy (HTTPS + static client) · game server · PostgreSQL; subdomain on the user's domain | Caddy 2.11 · Node.js 26 LTS | Already owned, close to all players, ample capacity (user choice) |
| Maps | Districts authored in **Tiled** (JSON export); one layer group per decay stage, toggled by the decay system; collision and cover as object layers | Tiled map format | Hand-made maps with data-driven decay |
| Lighting | Darkness render texture with lights cut out (flashlights, floodlights, fires, muzzle flashes); lit only when needed | Phaser 4 | Proven in the Lamplight probe; cheap when off |
| Balance data | All tunable numbers (weapons, zombies, buildings, waves, economy, decay timings) in typed JSON config in the shared package | — | Rebalance without code changes; server and client read the same values |
| Randomness | Seeded PRNG per run (run seed + named sub-streams: events, decay, shop per player) | — | Reproducible runs for testing |
| UI | In-combat HUD drawn by Phaser; menus (lobby, shop, unlocks, evac vote) as HTML overlays built with **Preact** | Preact 11.2 | Readable, responsive menus on phones; small runtime |
| Asset loading | Boot (tiny) → Preload (district atlas, sprites, SFX) → Game; music streamed after start; texture atlases | Phaser Loader | 15 MB / 10 s first-load target |
| Audio | Three buses: music, SFX, ambience; positional volume/pan for zombie cues | Phaser Web Audio | GDD audio direction, settings |
| Testing | Vitest for shared simulation (headless, deterministic with seeds); bot clients for load tests | Vitest 5.1 | Simulation is testable without a browser |

### State Management

**Server:** each game is a Colyseus room owning one `Run`: the run state machine plus the shared simulation `World`. The room is the only writer. Colyseus schema holds low-frequency, structured state (players, wallets, loadouts, buildings, phase, timers, decay stage, votes). High-frequency horde data is *not* in schema.

**Client:** Phaser scenes read state only. Local input is applied immediately to a predicted copy of the local player using the shared movement code, then reconciled with server snapshots. Remote players and zombies are rendered from an interpolation buffer ~100 ms behind.

### Networking

- **Tick:** server simulation fixed step 50 ms (20 Hz); projectile collision uses swept segment-vs-circle tests so 60 m/s bullets cannot tunnel.
- **Client input:** sent every client frame, throttled to 30 msgs/s: move vector, aim vector, fire held, swap, consumable, ping; each tagged with a sequence number for reconciliation.
- **Horde stream:** per tick, per client, a binary message containing zombies inside that client's view plus a 4 m margin. Record: id (u16), x and y (u16, 1 cm precision), heading (u8), type+state (u8) ≈ 7 bytes; zombies outside the view are omitted. Worst case 150 in view × 7 B × 20 Hz ≈ 21 KB/s, inside the 30 KB/s target.
- **Events:** deaths, explosions, hits, telegraphs and decay transitions as reliable discrete messages so effects play exactly once.

### Data Persistence

- **PostgreSQL tables (initial):** `accounts` (id, username, password hash, guest token, created), `progress` (account id, supplies, unlocks, training levels, districts), `saved_runs` (id, host account id, district, seed, snapshot JSON, schema version, created, expires).
- **Migrations:** Drizzle Kit, versioned in the repo.
- **What is not persisted:** live wave state; a run can only be saved and resumed from a Build phase.

### Asset Management

Texture atlases per district and per character set; audio sprites for SFX; ambience loops and music streamed. Placeholder/AI art in the same atlas layout as final art so Epic 9 swaps files without code changes.

### Architecture Decision Records

- **ADR-01 Server authority + client prediction.** Chosen over lockstep (fragile with mobile networks, hard mid-run joins) and client authority (screens drift). Cost: prediction/reconciliation code for the local player.
- **ADR-02 Custom horde stream.** Chosen over pure schema sync to control the biggest bandwidth risk from day one. Cost: a hand-written encoder/decoder with tests.
- **ADR-03 Shared simulation package.** One implementation of movement, combat and collision used by the server (authority), the client (prediction) and tests. Rule: no Phaser or Colyseus imports inside it.
- **ADR-04 Single PostgreSQL on the existing VPS.** Simplicity over scale; backups by nightly dump.
- **ADR-05 Tiled maps with decay layers.** Decay is data, not code paths per district, so new districts need no new code.

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
| Player settings | client localStorage (try/catch), synced to the account when logged in | volumes, quality, gore toggle, aim assist |
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
- **Collision and grid view:** draws hitboxes, spatial grid and spawn points.
- **Headless replay:** re-run a simulation from a seed and an input log in tests.

**Activation:** development builds: `?debug=1` in the URL or a three-finger tap; release builds: overlay only via Settings.
