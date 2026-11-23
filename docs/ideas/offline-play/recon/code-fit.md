# Code fit notes (read 2026-11-23, master at branch point)

Project context, not research evidence (research firewall): this file shapes *what to ask* and judges fit; it is not cited as a source in `research.md`'s findings.

## What the code already gives us

- **The simulation is engine-free and already runs in the browser.** `packages/shared/src/core/world.ts`: `createWorld` / `setInput` / `step` with a fixed 20 Hz step, no Node or Phaser imports. `LocalSimHost` (`apps/client/src/sim/LocalSimHost.ts`) runs it in the page for solo play today.
- **Measured phone cost of the simulation (solo, 150 zombies, `?stress=150`, `docs/perf/epic-1-stress.md`):** iPhone 15 Pro 0.56 ms avg / 2.0 ms max per tick; Honor 10 (2018) 0.91 / 2.5 ms. Budget per tick: 50 ms.
- **Measured server cost with 4 players** (`docs/perf/epic-2-network.md`): 0.3–0.9 ms avg per tick on a Xeon, with rewind, interest and horde encoding. Rough guess for a host phone running 4 players: 2–5 ms per tick, i.e. under 10 % of the tick budget, on top of its own rendering. (Estimate; must be measured on the Honor 10.)
- **The server's game loop is mostly portable.** `apps/server/src/run/RunController.ts` (490 lines) imports only `@topdown/shared` and `../net/limits`, `../net/spreadCancel` (both engine-free). Colyseus-bound pieces: `RunRoom.ts` (827 lines: lobby, message guard, pings, broadcast, patch timing), `rooms/schema/*` (Colyseus schema state + `syncState`), `net/hordeEncoder.ts` (one import of `ClientState` from `@colyseus/core`), `run/lobby.ts` (`node:crypto` `createHash` for guest tokens).
- **The client hides the transport behind a small interface.** `apps/client/src/net/session.ts` `NetRoomLike` = `state: RunStateView`, `send(type, msg)`, `onMessage(type, cb)` (string types for JSON messages, number types for binary frames such as `BYTES.HORDE_FRAME`), `onStateChange`, `leave()`. `fakeRoom.ts` already implements it for tests. Only `net/connection.ts` and `net/serverNotice.ts` import `@colyseus/sdk`.
- **Bandwidth per guest:** ~3–6 KB/s typical, 13 KB/s average and ~25 KB/s peak with 150 zombies in view (`docs/perf/epic-2-network.md`). For a host sending to 3 guests: ≤ 75 KB/s peak, ~0.6 Mbit/s. Tiny for Wi-Fi; large for Bluetooth LE (see research).

## What a "phone hosts" mode would need

1. A browser `HostRoom` that does `RunRoom`'s job without Colyseus: RunController + lobby + per-guest message guard + pings + event interest + horde encoder, sending over a data channel. (Port, not rewrite: most logic is plain TS.)
2. State sync without Colyseus schema: send the `RunStateView` as compact deltas (or full snapshots at 20 Hz — 4 players + ≤ ~100 buildings is small), behind the same `NetRoomLike` so `NetSimHost`, prediction, rewind and the HUD don't change.
3. The host's own player: a "loopback" `NetRoomLike` with zero latency (simplest; the host plays through the same NetSimHost path) or a direct LocalSimHost-like view of the authoritative World (better feel for the host, more code).
4. A `DataChannelRoom implements NetRoomLike` on guests (JSON for string types, binary for number types).
5. Lobby UI: "Host offline game" / "Join offline game" with QR pairing; the game files cached for offline (service worker).
6. Guest-token hashing: `node:crypto` → Web Crypto `crypto.subtle.digest` or skip (no strangers on a campsite hotspot).

## Risks seen in the code

- Two code paths for hosting (Colyseus server + browser HostRoom) can drift: every Epic 5+ message added to `RunRoom` must also be added to `HostRoom`. Mitigation: extract the room logic into a transport-agnostic `RoomCore` in `packages/shared` (or `packages/host`) used by both.
- Rewind (Story 2.12) and adaptive delay assume RTTs of 50–300 ms; on local Wi-Fi RTT is ~5–30 ms, so they just work better.
- Host phone screen lock / app switch = everyone's game freezes (see research on background throttling).
