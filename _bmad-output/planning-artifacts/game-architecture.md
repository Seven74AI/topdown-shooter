---
title: 'Game Architecture'
project: 'topdown-shooter'
date: '2026-11-21'
author: 'Root'
version: '1.0'
stepsCompleted: [1, 2, 3]
status: 'in-progress'

# Source Documents
gdd: '_bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md'
epics: '_bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/epics.md'
brief: '_bmad-output/planning-artifacts/briefs/brief-topdown-shooter-2026-11-21/brief.md'
---

# Game Architecture

## Document Status

This architecture document is being created through the GDS Architecture Workflow.

**Steps Completed:** 3 of 9 (Engine)

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
