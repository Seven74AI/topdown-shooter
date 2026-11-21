# Story 2.5: Horde stream

Status: ready-for-dev

## Story

As a player,
I want to see the whole horde move smoothly on my phone over 4G,
so that big hordes work online.

## Acceptance Criteria

1. **Frame.** Every tick, the server sends each client one binary message. It has a header `[tick u32][count u16]` and 8-byte records `[id u16][x u16][y u16][heading u8][typeState u8]`. It holds the zombies inside that client's view plus a 4 m margin, found with the spatial grid.
2. **Ids.** When a zombie dies, its pool slot is held 1 s before reuse and carries a generation bit, so a new zombie never interpolates from a dead one.
3. **Client.** When horde messages arrive, the client keeps at least the last 3 snapshots and renders zombies about 100 ms behind, with interpolation. A zombie missing from 3 consecutive snapshots is removed from view. Deaths come as reliable `zombie.killed` events, so each death plays exactly once.
4. **Backpressure.** For a client whose socket `bufferedAmount` exceeds 64 KB, a horde frame that is due is skipped (never queued) until the buffer drains.
5. **Tests.** Vitest round-trip tests cover quantization (1 cm), clamping, generation bits and empty frames. A test with 150 zombies in view measures ≤ 24 KB/s per client at 20 Hz.

## Tasks / Subtasks

- [ ] **Task 1: Format (shared)** (AC 1, 2, 5): `packages/shared/src/net/hordeFormat.ts`. See Dev Notes › Binary layout. It is pure: no Colyseus, no DOM.
- [ ] **Task 2: Pool support (shared)** (AC 2)
  - [ ] The slot hold (`ZOMBIE_SLOT_HOLD_TICKS = 20`) and the `generation: Uint8Array` that grows on reuse **already exist** (Story 1.4, `zombies/zombiePool.ts`). Don't re-implement them.
  - [ ] Add `heading: Uint8Array(capacity)` to `ZombiePool`. The simulation never reads or writes it: only the client mirror writes it. Document that in the field comment, and that `snapshotWorld` ignores it.
  - [ ] Add a test in `hordeFormat.test.ts` that `ZOMBIE_POOL_CAPACITY <= 256`, because the slot must fit 8 bits.
- [ ] **Task 3: Rectangle query (shared)** (AC 1): `core/spatialGrid.ts` gets `queryRect(grid, x, y, minX, minY, maxX, maxY, out): number`. It reads the same cell lists as `queryRadius` and returns ids inside the rectangle (point test). Tests: inside, outside, on the edge, a rectangle partly outside the map, `out` full.
- [ ] **Task 4: Interest rectangle (shared)** (AC 1): `net/interest.ts`, `viewRect(map, px, py, marginM, out)`. See Dev Notes › Interest. Tests: player in the middle, near each wall, and a map smaller than the view.
- [ ] **Task 5: Encoder (server)** (AC 1, 4): `apps/server/src/net/hordeEncoder.ts`, called from `RunRoom.onTick` after `syncState`. See Dev Notes › Encoder.
- [ ] **Task 6: Decoder and buffer (client)** (AC 3): `apps/client/src/net/hordeDecoder.ts` and `net/hordeBuffer.ts`. NetSimHost registers `room.onMessage(BYTES.HORDE_FRAME, (b: Uint8Array) => …)`. See Dev Notes › Client side.
- [ ] **Task 7: Mirror write and rendering (client)** (AC 3)
  - [ ] Each frame, NetSimHost samples the buffer at the same render tick as players (2.4) and writes the visible zombies into the mirror world's `zombies` pool, with `apps/client/src/net/mirrorZombies.ts`.
  - [ ] `ZombieView`:
    - when `host.online`, use the streamed heading (`headingToRad(z.heading[id])`) instead of the angle from movement;
    - re-initialize a slot's image when its **generation** changes, not only when it reappears after a gap;
    - keep local mode unchanged.
- [ ] **Task 8: Deaths exactly once** (AC 3)
  - [ ] A decoded `zombie.killed` event (2.4 event queue, delivered at render tick) marks that net id dead in the buffer.
  - [ ] The mirror drops it at once, FxView plays the death, and later frames that still carry that net id (sent before the server freed the slot) are ignored.
  - [ ] The client never removes a zombie on its own except by the missing-3 rule, which only hides zombies that left the view.
- [ ] **Task 9: Stats** (AC 4, 5)
  - [ ] The encoder counts `framesSent`, `framesSkipped` and `bytesSent` per client.
  - [ ] On `wave.ended`, log `info` `horde_stats` with `{ roomId, wave, playerId, framesSent, framesSkipped, avgBytes }`. No per-zombie or per-frame logging.
  - [ ] NetSimHost counts frames received and decode errors, for the 2.10 overlay.
- [ ] **Task 10: Tests**: see Dev Notes › Testing.

## Dev Notes

### Scope and prerequisites

- Builds on 2.4:
  - `RunController`, `RunRoom.onTick`;
  - `NetSimHost` with its mirror world, server clock, render tick and event queue;
  - `netEvents.ts`, which already sends zombie ids as **net ids** (`slot | generation << 8`), matching this format.
- Read `zombies/zombiePool.ts` (`generation`, `freedAtTick`, `aliveIds`), `core/spatialGrid.ts` and `render/ZombieView.ts`.
- Out of scope: the adaptive 100–150 ms delay (2.6; this story uses the fixed 2-tick delay from 2.4), cosmetic projectiles and hits (2.7), and the bandwidth overlay (2.10).

### Binary layout (ADR-02; final)

| Offset | Size | Field | Notes |
| --- | --- | --- | --- |
| 0 | u32 LE | tick | `world.tick` after the step |
| 4 | u16 LE | count | number of records |
| 6 + 8i | u16 LE | id | bits 0–7: pool slot; bits 8–15: generation (`zombieNetId(slot, gen)`) |
| +2 | u16 LE | x | `round(x × 100)` cm, clamped to 0…65535 (map origin top-left, from `map/placeholderMap.ts`) |
| +4 | u16 LE | y | same |
| +6 | u8 | heading | `quantizeHeading(dx, dy)` from 2.4: 0 = +x, increasing toward +y (clockwise on screen) |
| +7 | u8 | typeState | low nibble: index in `ZOMBIE_TYPES` (append-only); high nibble: `ZOMBIE_STATE` value |

```ts
export const HORDE_HEADER_BYTES = 6;
export const HORDE_RECORD_BYTES = 8;
export const POS_SCALE = 100;              // already named in the architecture
export const MAX_POS_CM = 0xffff;          // 655.35 m
export const HORDE_MISSING_LIMIT = 3;      // AC 3
export const HORDE_VIEW_MARGIN_M = 4;      // AC 1
export const HORDE_BACKPRESSURE_BYTES = 64 * 1024; // AC 4
export function writeHordeHeader(view: DataView, tick: number, count: number): void;
export function writeHordeRecord(view: DataView, i: number, netId: number, x: number, y: number, heading: number, typeState: number): void;
export function readHordeFrame(view: DataView, sink: HordeSink): boolean; // false if the length ≠ 6 + 8 × count
```

- Little-endian everywhere (`DataView` with `littleEndian = true`).
- The message type is the numeric `BYTES.HORDE_FRAME = 1` (decided in 2.1). It costs 1 byte on the wire instead of a string: the frame is `[protocol byte][type byte][payload]`.
- A type or state that doesn't fit 4 bits is a programmer error, so throw. `ZOMBIE_TYPES` has 1 entry today and the bestiary has 6.
- **Empty frames are still sent** (6 bytes): they let the client count misses and keep its server clock fed.

### Interest

- The server doesn't know each phone's aspect ratio, so the view is the widest one the camera can show: `VIEW_WIDTH_M × VIEW_HEIGHT_M` (24 × 13.5, `config/constants.ts`).
- The view is centred like the camera: clamped inside the map, so a player near a wall sees farther the other way. With `halfW = 12` and `halfH = 6.75`:

  ```
  cx = mapW > 2·halfW ? clamp(px, halfW, mapW − halfW) : mapW / 2
  cy = mapH > 2·halfH ? clamp(py, halfH, mapH − halfH) : mapH / 2
  ```

  Then grow the rectangle by `HORDE_VIEW_MARGIN_M` on every side. This is the same rule as `GameScene.updateRushMarkers`.
- The view centre is the client's own player. In Story 2.8, an "out" player's view follows the teammate they spectate. Leave a `viewTargetFor(playerId)` hook in the encoder.
- **Always send rushers:** the last-5 rush markers and their edge arrows (Story 1.7) need off-screen rushers. Add every zombie with `state === RUSH` to each frame, even outside the rectangle (at most `lastRushCount` extra, never twice). Later "always visible" types (the Behemoth lives in schema, not here) can use the same rule.

### Encoder

`HordeEncoder` (one per room):

- Holds a reusable `Uint8Array(HORDE_HEADER_BYTES + HORDE_RECORD_BYTES × ZOMBIE_POOL_CAPACITY)` with its `DataView`, an `Int32Array` of query results and a `lastHeading: Uint8Array(capacity)`.
- Per tick:
  1. Run `rebuildGrid(world.zombieGrid, …)` once. Zombies moved after the AI's own rebuild, and the wave director spawned new ones after it.
  2. Compute headings once:
     - from movement `x − prevX`, `y − prevY` when it is longer than 1e-4 m;
     - otherwise keep `lastHeading`;
     - reset `lastHeading` when a slot's generation changed.
  3. For each client:
     - if `(client.ref as WebSocket).bufferedAmount > HORDE_BACKPRESSURE_BYTES`, then `framesSkipped++` and `continue`;
     - otherwise build the view rectangle, `queryRect`, add the rushers, write the records, and call `client.sendBytes(BYTES.HORDE_FRAME, buf.subarray(0, len))`.
- `sendBytes` copies the payload into its own frame (verified in `@colyseus/core` 0.18 `getMessageBytes.raw`), so the scratch buffer can be reused at once.
- Only clients whose player is in the run get frames.
- Measure in a test, then note it: one tick for 4 clients and 150 zombies costs well under 1 ms. The slow-tick log from 2.4 would show it otherwise.

### Client side

- **`hordeDecoder.ts`:**
  - `new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)`. The SDK hands a **subarray view**: never read `bytes.buffer` from offset 0.
  - Validate the length. A bad frame is dropped and counted, never thrown.
  - A frame whose tick is ≤ the newest tick held is dropped (duplicate or out of order).
- **`hordeBuffer.ts`:**
  - A ring of **8** preallocated snapshots, each with `tick`, `count`, `netId: Uint16Array(256)`, `x`, `y` (`Float32Array`, metres), `heading`, `typeState` (`Uint8Array`), plus a per-snapshot `slotIndex: Int16Array(256)` (slot → record index or −1) for O(1) lookups.
  - The AC asks for "at least the last 3". 8 covers the 150 ms delay of Story 2.6 plus jitter.
  - `sample(renderTick, out)` finds snapshot A (tick ≤ renderTick) and B (the next one). For each record in B:
    - same net id in A: lerp x and y by `(renderTick − A.tick) / (B.tick − A.tick)`; take the heading from B, or from A while t < 0.5;
    - only in B: show at B's position. That is what "never interpolates from a dead one" means: a different generation is a different zombie.
    - B missing (render tick past the newest frame): hold A. No extrapolation.
  - **Missing-3 rule:** keep `missCount[slot]` and `lastNetId[slot]`.
    - On each new frame, every slot that was visible and is absent gets `missCount++`; present slots reset to 0.
    - At `HORDE_MISSING_LIMIT` the slot is dropped from view.
    - Until then it is held at its last sampled position. A zombie stepping across the margin edge doesn't flicker.
  - **Dead set:** `markDead(netId)` makes `sample` skip that net id in every snapshot.
- **`mirrorZombies.ts`** writes the visible set into the mirror pool:
  - per slot: `x = prevX`, `type`, `state`, `generation`, `heading`;
  - rebuild `aliveIds`, `alivePos` and `aliveCount`, which `ZombieView` and `GameScene`'s rush markers already read;
  - mark slots not shown with `alivePos = −1` and `state = FREE`.

  No allocation per frame: only reuse the typed arrays.

### Testing

- **`hordeFormat.test.ts`:**
  - round trip of 1, 150 and 256 records;
  - quantization: 12.3449 → 12.34 and 12.3451 → 12.35 (`Math.round`; don't test exact .5 cases, which float rounding makes fragile), and the error is ≤ 0.005 m over 10,000 seeded random positions;
  - clamping: −1 → 0, and 700 m → 65535;
  - generation: `zombieNetId(5, 255)` round-trips, and `zombieNetId(5, 0) !== zombieNetId(5, 1)`;
  - typeState packing for every type and state value;
  - empty frame is exactly 6 bytes;
  - a wrong length is rejected.
- **Encoder test (server, no network; fake clients with `sendBytes` spies and `ref.bufferedAmount`):**
  - Selection: only zombies in the rectangle plus the margin; a rusher far away is included; a zombie 4.1 m outside the view edge is excluded.
  - Backpressure: 70,000 buffered skips the frame, then 0 sends again.
  - **Bandwidth:**
    - Place 150 Walkers inside the view (spawn them with `spawnZombie` in a 10 × 6 m box around the player; `systems: { waves: () => {} }`), step 20 ticks, and sum `2 + payload length` per frame (Colyseus header bytes included).
    - Assert ≤ 24 × 1024 B over 20 frames.
    - Expected: (2 + 6 + 1200) × 20 = 24,160 B/s. Note it in the Completion Notes. KB here means 1024 bytes, matching the architecture's "150 × 8 B × 20 Hz ≈ 24 KB/s".
- **Generation test (end-to-end through encoder → decoder → buffer):**
  - kill the zombie in slot s;
  - step 20 ticks (slot hold);
  - spawn a new zombie, which reuses s with the next generation, far away;
  - the sampled position at a render tick between the two frames is the new zombie's, never a lerp toward the old one.
- **Buffer tests:**
  - lerp at t = 0.5;
  - a zombie missing for 1–2 frames is held, and gone at 3;
  - `markDead` hides it at once, and a later frame with the same net id stays hidden;
  - out-of-order and duplicate frames are ignored;
  - a frame with a bad length is counted as an error.
- **Manual:** two tabs online, a wave of 40 arrives; zombies move smoothly on both tabs, the deaths match, and there is no console error. Throttling the browser network to "Fast 4G" in DevTools still looks smooth.

### Project Structure Notes

- New:
  - `packages/shared/src/net/{hordeFormat.ts, hordeFormat.test.ts, interest.ts, interest.test.ts}`
  - `apps/server/src/net/{hordeEncoder.ts, hordeEncoder.test.ts}`
  - `apps/client/src/net/{hordeDecoder.ts, hordeBuffer.ts, hordeBuffer.test.ts, mirrorZombies.ts}`
- Modified:
  - `packages/shared/src/{zombies/zombiePool.ts (heading), core/spatialGrid.ts (+ test), index.ts}`
  - `apps/server/src/rooms/RunRoom.ts`
  - `apps/client/src/{sim/NetSimHost.ts, render/ZombieView.ts}`

### References

- [Source: epics.md#Story 2.5: Horde stream]
- [Source: game-architecture.md#Horde Stream (interest-managed binary sync)], [#Networking] (8-byte record, 4 m margin, backpressure 64 KB, budget 24 + 6 KB/s), [#ADR-02]
- Slot hold and generation: [Source: 1-4-walkers-chase-and-hurt-the-player.md] (pool), `packages/shared/src/config/constants.ts` (`ZOMBIE_SLOT_HOLD_TICKS`)
- Rush markers needing off-screen positions: [Source: 1-7-growing-waves-of-walkers.md#Rush]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
