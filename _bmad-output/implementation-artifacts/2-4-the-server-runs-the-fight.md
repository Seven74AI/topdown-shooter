---
baseline_commit: 0a7adfd7ae06067d9222736253f0a54f6928a552
---

# Story 2.4: The server runs the fight

Status: review

## Story

As a player,
I want the server to run one shared fight that all our phones show,
so that we all play the same game.

## Acceptance Criteria

1. **Authority.** In a started run, the room steps the shared World at 20 Hz and is the only writer of game state (architecture boundary 2).
2. **Inputs.** Each client sends one input message per 50 ms step: move vector, aim vector, fire held, swap, `isMouse` and a sequence number. The server applies each player's latest input every tick (see Dev Notes › Input queue for exactly how).
3. **Shared state.** When players move, every phone shows all players moving. The phones read Colyseus schema state: players, HP, loadouts, phase, wave and aliveCount.
4. **Networked host.** When online, the Game scene runs on a networked `SimHost` implementation, with no networking code in scenes. The local host stays for tests, dev and **Practice solo**.
5. **Slow ticks.** A server tick slower than 40 ms is logged at `warn` with `roomId` and the tick time.

## Tasks / Subtasks

- [x] **Task 1: Shared helpers** (AC 1, 3)
  - [x] `player/player.ts`: add `removePlayer(world, id)`. It deletes the player from `players`, `pendingInputs`, `inputs` and `lastAppliedSeq`.
  - [x] `config/balance/player.json` + schema: add `spawnOffsetM: 1.5`.
  - [x] `player/spawn.ts`: `teamSpawnPoint(world, slot, out)` gives the map centre plus `(±1, ±1) × spawnOffsetM` by slot (0: −−, 1: +−, 2: −+, 3: ++).
  - [x] `net/heading.ts`: `quantizeHeading(x, y): number` (0–255, 0 = +x, increasing toward +y) and `headingToRad(h)`. Story 2.5 uses them in the horde format.
  - [x] Tests for all three.
- [x] **Task 2: Net events codec (shared)** (AC 3): `packages/shared/src/net/netEvents.ts` (see Dev Notes › Events on the wire). Round-trip tests for every kind, plus the size of a typical `weapon.fired` (≤ 16 bytes as msgpack tuple fields, estimated by counting).
- [x] **Task 3: RunController (server, no Colyseus imports)** (AC 1, 2): `apps/server/src/run/RunController.ts`, see Dev Notes › RunController. Unit tests in `RunController.test.ts`.
- [x] **Task 4: Schema for the fight** (AC 3)
  - [x] Extend `rooms/schema/RunState.ts` and `shared/net/stateView.ts` (see Dev Notes › Schema).
  - [x] Add `rooms/schema/syncState.ts`: `syncState(state, controller)` copies World → schema once per tick, and only assigns a field when its value changed.
- [x] **Task 5: RunRoom tick loop** (AC 1, 2, 5)
  - [x] On an accepted `run.start` (2.3): `this.controller = new RunController({ balance, seed: randomUint32(), players, pauseWaves: process.env.DEV_NO_WAVES === "1" })`, where `randomUint32` uses `node:crypto`.
  - [x] Then `this.setFixedTimestep(() => this.onTick(), TICK_RATE_HZ)`. The 0.18 fixed timestep catches up at most 5 steps, then drops the backlog.
  - [x] Log `run_started` with `{ roomId, runSeed, players }`.
  - [x] `onTick`:

    ```ts
    const t0 = performance.now();
    const events = controller.tick();
    syncState(state, controller);
    forwardEvents(events);
    // Story 2.5: send horde frames here
    slowTick.observe(performance.now() - t0);
    ```
- [x] **Task 6: Inputs and RTT (server)** (AC 2)
  - [x] `C2S.INPUT_SEND` (guarded by `playerInputSchema` and the 25/s bucket from 2.1) calls `controller.queueInput(playerId, input)`.
  - [x] Every 1 s per client: `client.send(S2C.NET_PINGED, { id, rttMs })` and remember `sentAt`. On `C2S.NET_PONG` with the latest id: `rtt = now − sentAt`, `member.rttMs = ewma(0.25)`, then `controller.setRtt(playerId, rttMs)`. Story 2.7 uses it.
  - [x] Add `netPongSchema` to `messages.ts`.
- [x] **Task 7: Leaving mid-run** (AC 1): `onLeave` during `wave` calls `controller.removePlayer(playerId)` and removes the schema entry. Zombies pick the next-nearest player on the next tick. Reconnect is Epic 8 and "<name> left" is 2.11; here only removal is safe.
- [x] **Task 8: Slow-tick logging** (AC 5): `apps/server/src/run/slowTick.ts`.
  - [x] Above `SLOW_TICK_MS = 40`, log `log.warn({ roomId, tick, tickMs }, "slow_tick")`, at most one line per second; extra slow ticks in that second go into a `count` field.
  - [x] Unit-test it with injected times.
- [x] **Task 9: Room error handler** (AC 1)
  - [x] `RunRoom.onUncaughtException(err, method)` logs `error` with `roomId`, `method` and `tick`. The simulation keeps going (architecture › Error Handling).
  - [x] After 20 tick exceptions in a row, broadcast `S2C.SERVER_SHUTDOWN_STARTED` `{ message: "The game hit an error, sorry" }` and `disconnect()`. Saving a snapshot is Epic 8.
- [x] **Task 10: SimHost contract** (AC 4). See Dev Notes › SimHost changes.
  - [x] Extend `apps/client/src/sim/SimHost.ts` with `localPlayerId` and `online`.
  - [x] `LocalSimHost` sets `localPlayerId = LOCAL_PLAYER_ID` and `online = false`.
- [x] **Task 11: NetSimHost** (AC 2, 3, 4): `apps/client/src/sim/NetSimHost.ts`, plus `apps/client/src/net/{serverClock.ts, snapshots.ts, eventQueue.ts}`. See Dev Notes › NetSimHost.
- [x] **Task 12: GameScene uses any host** (AC 3, 4)
  - [x] `GameScene.create(data)` takes `{ mode: "solo" } | { mode: "online", session: NetSession }`. It builds the matching host. Only solo calls `addPlayer`.
  - [x] Every `LOCAL_PLAYER_ID` use becomes `host.localPlayerId`.
  - [x] Player rendering becomes a `Map<playerId, PlayerView>` that adds and removes views as `world.players` changes. Rings, colors and names are Story 2.9; here remote players use the same placeholder.
  - [x] Online game over: if the local player dies, show the existing Game over with **Back to start**, which leaves the room. Story 2.8 replaces death with downed and revive.
  - [x] The 2.3 "Starting…" placeholder now starts `Game` in online mode.
- [x] **Task 13: Tests**: see Dev Notes › Testing.

## Dev Notes

### Scope and prerequisites

- **Epic 1 must be finished first** (Stories 1.8–1.11): this story touches `GameScene`, `HudScene`, `LocalSimHost.stats` (1.11), `HudButtons` (1.8) and melee (1.9). Read their records.
- Builds on 2.1–2.3: `RunRoom`, `messages.ts`, `messageGuard`, the lobby, `NetSession`/`connection.ts`, and `p0`–`p3` ids.
- Out of scope:
  - zombies on the client: the horde stream is 2.5, so until then zombies are simulated but invisible (use `DEV_NO_WAVES=1` for manual tests);
  - prediction of the local player (2.6);
  - cosmetic projectiles and hit rules (2.7);
  - downed and revive (2.8).
- The 2.4 client is deliberately simple: everyone, including you, is drawn about 100 ms behind the server. Story 2.6 adds prediction.

### Input queue (decided here; Story 2.6 depends on it)

The AC says "applies the latest input per player each tick". Applying only the newest arrival is not enough: 4G jitter delivers two inputs in one tick and none in the next. The skipped one is a step of movement the client predicted but the server never ran, which shows as rubber-banding. So:

- `queueInput(id, input)` keeps a small ring per player (capacity `INPUT_QUEUE_MAX = 6`, 300 ms). Inputs whose `seq` is ≤ the last queued seq are ignored (duplicate or late). On overflow the oldest is dropped and counted.
- Each tick, per player, the controller does one of two things:
  - **Has input:** take the oldest queued input, `setInput(world, id, input)`, and set `ackSeq = input.seq`.
  - **Starved:** `setInput(world, id, held)`, where `held = { ...last, moveX: 0, moveY: 0, swap: false, consumable: false }` keeps the **same seq**. The player holds still and keeps aim and fire. `ackSeq` doesn't change.
- Why "hold still": the server's movement for acked inputs then equals the client's prediction exactly, because a starved tick adds no movement. Story 2.6 replays inputs `seq > ackSeq` from the server position and gets no error.
- The shared `applyInputs` already makes edge flags fire once per seq (Story 1.2 review fix), so a held input can never swap twice.
- Every input with a new seq counts as "the latest input". The server applies one per tick, in order, which is how it applies each player's latest input every tick (AC 2).

### RunController

```ts
export class RunController {
  readonly world: World;
  constructor(opts: { balance: Balance; seed: number; players: { playerId: string; slot: number }[]; pauseWaves?: boolean });
  queueInput(playerId: string, input: PlayerInput): void;
  setRtt(playerId: string, rttMs: number): void;   // stored; used by Story 2.7
  ackSeq(playerId: string): number;
  removePlayer(playerId: string): void;
  /** One fixed step. Returns this tick's events (a reused array, valid until the next tick). */
  tick(): readonly SimEvent[];
}
```

- It owns `createWorld(...)`, one `addPlayer` per slot at `teamSpawnPoint`, the per-player input rings, and an event buffer filled by `world.events.subscribe`. Swap buffers, as in `LocalSimHost.drainEvents`.
- `pauseWaves` sets `world.waves.paused` (the dev cheat flag from Story 1.7).
- No allocation per tick: the input rings are preallocated arrays of input objects, copied into.
- `apps/server/src/run/` holds the run logic. `RunController` is the seed of the architecture's `runStateMachine`; Epic 3 adds Build and phases there. Keep Colyseus out of it, so it is unit-testable and reusable by `tools/bots` (2.10) and headless replay.

### Schema (final field names; 2.8 adds the status fields)

```ts
PlayerState {
  slot: t.uint8(), name: t.string(), ready: t.boolean(),        // 2.1/2.3
  x: t.float32(), y: t.float32(), heading: t.uint8(),            // position, facing (quantizeHeading)
  hp: t.uint16(), maxHp: t.uint16(), status: t.string(),         // "alive" | "dead" (2.8: "downed" | "out")
  ackSeq: t.uint32(),                                            // last input seq applied (2.6)
  active: t.uint8(), weapon0: t.string(), weapon1: t.string(),   // "" = empty slot
  ammo0: t.uint16(), ammo1: t.uint16(),
  reloadTicks0: t.uint16(), reloadTicks1: t.uint16(), swapTicks: t.uint8(),
}
RunState { phase, hostSlot, players: t.map(PlayerState),          // 2.1/2.3
  tick: t.uint32(), wave: t.uint16(), remaining: t.uint16(), aliveCount: t.uint16() }
```

- `x`/`y` are float32 (≈ 2 µm at 48 m, invisible). `hp` rounds with `Math.ceil`, so a player at 0.4 HP still shows 1.
- Patches go out every 50 ms (`patchRate = 50`, set in 2.1), right after the tick. A patch always carries `tick` together with the players' `x`, `y` and `ackSeq` from that same tick: snapshots and acks stay consistent.
- Budget: 4 players moving at 20 Hz is about 1–2 KB/s of patches, inside the 6 KB/s for schema plus events (architecture › Networking). Story 2.10 measures it.

### Events on the wire

- SimEvents as JSON-like objects are too big: 48 `weapon.fired`/s with SMGs would cost about 4 KB/s. `netEvents.ts` therefore encodes each forwarded event as a short tuple `[kind, …fields]`:
  - `kind` is a small int from `NET_EVENT_KIND`;
  - players are sent as their slot;
  - zombies as the **net id** `slot | generation << 8` (decided with Story 2.5's horde id);
  - weapons as `weaponIds(balance)` indices;
  - positions as integer centimetres;
  - directions as `quantizeHeading`;
  - damage as integer tenths.
- `encodeNetEvent(e, ctx)` returns a tuple or `null` for events that aren't forwarded, such as `test.ping`. `decodeNetEvent(t, ctx)` rebuilds a `SimEvent`:
  - `playerId` becomes `"p" + slot`;
  - `zombieId` becomes the **pool slot** (`netId & 0xff`), which is the index the client mirror uses;
  - the tuple keeps the full net id for Story 2.7.
- Forwarded now: every current `SimEvent` except `test.ping`. Each later story that adds an event adds its kind here, with a round-trip test.
- One message per tick that has events: `S2C.SIM_EVENTS_FLUSHED` with `{ tick, events: tuple[] }`, using `broadcast`. Order is preserved, because Colyseus sends reliably over one socket.

### SimHost changes

```ts
export interface SimHost {
  // unchanged: update(frameDtS), alpha, world, setLocalInput(input), drainEvents(), dispose()
  /** Id of the player this device controls ("local" solo, "p0"–"p3" online). */
  readonly localPlayerId: string;
  /** True for the networked host: renderers may use it to pick data sources (e.g. Story 2.5 heading). */
  readonly online: boolean;
}
```

Scenes keep reading `host.world` the same way. Networking lives only in `NetSimHost` and `apps/client/src/net/`.

### NetSimHost

- **Mirror world:** `createWorld({ balance, seed: 0, systems: NO_SYSTEMS })` (all no-ops; export `NO_SYSTEMS` from shared `core/systems.ts`). It is never stepped by the scene. NetSimHost writes into it every frame:
  - Players: added and removed with `addPlayer` and `removePlayer` as the schema's `players` map changes.
  - Position: `x`, `y`, facing from the **interpolated** snapshot, with `prevX = x` and `prevY = y`, so any `alpha` draws the same point.
  - From the latest state (not interpolated): `hp`, `maxHp`, `status` and the loadout (slots, ammo, `reloadTicks`, `swapTicks`, active). The HUD keeps working unchanged.
  - `world.waves.number` / `remaining` from the latest state.
  - Zombies stay empty until 2.5, projectiles until 2.7.
- **Inputs:** a 50 ms accumulator, the same as `LocalSimHost`:
  - latch edge flags until a step consumes them;
  - `seq` goes +1 per step;
  - `room.send(C2S.INPUT_SEND, input)` once per step;
  - push each input into a 64-entry history ring, which 2.6 replays.
  - At most 5 steps per frame. After a hidden tab, drop the backlog as `LocalSimHost` does: never burst 100 inputs into the 25/s limit.
- **Snapshots** (`net/snapshots.ts`):
  - On `room.onStateChange`, copy `tick` and, per player, `x`, `y`, `heading` into a preallocated ring of 16 snapshots. Never keep references to schema objects.
  - **Render tick** = `serverClock.estimateTick(now) − delayTicks`, with `delayTicks = 2` (100 ms). Story 2.6 makes it adaptive.
  - Interpolate between the two snapshots around the render tick. Before the first one, hold the oldest; with no newer one, hold the newest (no extrapolation).
- **Server clock** (`net/serverClock.ts`):
  - Each snapshot gives a sample `offsetMs = arrivalMs − tick × 50`.
  - Keep the minimum over a 2 s sliding window: the least-delayed packet is the best estimate.
  - `estimateTick(now) = (now − offsetMs) / 50`.
  - Unit-test it with jittered arrivals.
- **Events** (`net/eventQueue.ts`):
  - Decode each tuple batch into SimEvents tagged with their tick.
  - `drainEvents()` returns events whose tick ≤ the render tick, so a death plays when the drawn zombie reaches that point, not 100 ms early.
  - Story 2.7 adds instant local cosmetic events in front of this queue.
- **RTT:** answer `net.pinged` immediately with `net.pong`, and keep `rttMs` for the overlay (2.10).
- **Testability:**
  - NetSimHost depends on a small `NetRoomLike` interface (`send`, `onMessage`, `onStateChange`, `state`, `leave`), never on the SDK `Room` class directly. Unit tests pass a fake.
  - `NetSession` (`apps/client/src/net/session.ts`) wraps the real SDK room and holds `playerId` and `slot` from `run.joined`.

### Testing

- **RunController** (Vitest, fixed seed, `pauseWaves: true` or `systems` overrides where mechanics need isolating; Epic 1 lesson):
  - Two players with queued inputs move exactly like a reference `createWorld` fed the same inputs in the same ticks: compare with `snapshotWorld`.
  - Starvation: no movement, `ackSeq` unchanged, aim kept.
  - Two inputs in one tick are applied over the next two ticks.
  - Old or duplicate seqs are ignored.
  - Overflow drops the oldest.
  - A swap held for 3 starved ticks swaps once.
  - `removePlayer` mid-wave doesn't throw, and zombies retarget.
- **Codec:** every kind round-trips; zombie net ids keep their generation.
- **syncState:** schema values equal World values after ticks; an unchanged value isn't reassigned (spy, or check the schema change count via `encoder.encode()` length when nothing changes, about 0).
- **Integration** (`RunRoom.test.ts`): two SDK clients join and start; p0 sends 20 inputs `moveX: 1`; within about 1.2 s both clients' `state.players.get("p0").x` grows by about 4.5 m (±0.3); `ackSeq` reaches 20; `wave` and `aliveCount` appear in state.
- **NetSimHost** (fake room): one input per 50 ms with increasing seq; a swap tap reaches exactly one sent input; interpolation halfway between ticks 10 and 11 gives the midpoint; events for tick 12 are not drained while the render tick is 11.
- Manual: two browser tabs, create and join, start in dev, both see both survivors moving.

### Project Structure Notes

- New:
  - `packages/shared/src/player/spawn.ts`, `net/{heading.ts, netEvents.ts}` + tests
  - `apps/server/src/run/{RunController.ts, RunController.test.ts, slowTick.ts, slowTick.test.ts}`, `apps/server/src/rooms/schema/syncState.ts` + test
  - `apps/client/src/sim/NetSimHost.ts` + test, `apps/client/src/net/{session.ts, serverClock.ts, snapshots.ts, eventQueue.ts}` + tests
- Modified:
  - `packages/shared/src/{player/player.ts, core/systems.ts (NO_SYSTEMS), config/balance/player.json, config/balanceSchema.ts, net/messages.ts, net/stateView.ts, index.ts}`
  - `apps/server/src/rooms/{RunRoom.ts, schema/RunState.ts}`
  - `apps/client/src/{sim/SimHost.ts, sim/LocalSimHost.ts, scenes/GameScene.ts, render/FxView.ts (local id from host), ui/*}`

### References

- [Source: epics.md#Story 2.4: The server runs the fight]
- [Source: game-architecture.md#Networking] (20 Hz, input per step with seq, timers in ticks, events reliable), [#State Management], [#Architectural Boundaries] (1, 2, 3, 6), [#Error Handling] (one handler per room), [#Logging] (slow tick > 40 ms at warn)
- [Source: game-architecture.md#Development Environment] (Epic 1 local mode → networked host without changing scenes)
- Epic 1 lessons: timers in ticks (1.4 review), edge flags once per seq (1.2 review), no per-tick allocation (1.4/1.7 reviews), `systems` overrides in tests (1.7)

## Dev Agent Record

### Agent Model Used

claude-opus-5-5 via gds-dev-story

### Debug Log References

- Checked in `@colyseus/core` 0.18.29 (`Room.mjs`): `setFixedTimestep(step, tickRate)` runs at most 5 catch-up steps per real frame and then sets the accumulator to 0 (drops the backlog). When `onUncaughtException` is defined, the step callback, `clock.setInterval`/`setTimeout`, `onMessage` handlers and the lifecycle hooks are wrapped in try/catch; `onJoin`/`onCreate`/`onLeave` are wrapped with rethrow, so a `ServerError` refusal still reaches the matchmaker. It is also reported to the handler, which ignores a `ServerError` cause (join refusals are already logged as `join_refused`).
- Patches go out on their own `patchRate` interval, never inside the synchronous `onTick`, so every patch carries `tick` together with `x`, `y`, `ackSeq` from that same tick.
- The SDK's `room.send` encodes with msgpackr synchronously, so NetSimHost reuses one input object for every send (the fake room `structuredClone`s to keep the same guarantee in tests).
- `Room<unknown, RunStateView>` from the SDK is assignable to `NetRoomLike` once `onMessage` is generic (`onMessage<T>(type, cb: (m: T) => void)`).
- In the existing 2.3 test "gives 4 players slots 0-3", `toEqual({ slot, name, ready })` failed because `PlayerState` now has the fight fields: changed to `toMatchObject`. Also the `run_started` log assertion now includes `runSeed`.
- Playwright: Chromium's "GPU stall due to ReadPixels" WebGL console warnings come from `page.screenshot` (headless GL), not from the game.

### Completion Notes List

- **AC 1 (authority):** `RunRoom.onStart` sets `phase = "wave"` and calls `startRun()`: `new RunController({ balance: serverBalance, seed: randomUint32() (node:crypto), players: members in join order, pauseWaves: DEV_NO_WAVES === "1" })`, one `syncState` so the spawn positions arrive in the same patch as `phase`, then `setFixedTimestep(() => this.onTick(), TICK_RATE_HZ)` and a 1 s ping interval. `run_started` logs `{ roomId, runSeed, players }`. `onTick` = `controller.tick()` → `syncState` → `forwardEvents` → (2.5 horde frames here) → `slowTicks.observe`. The room is the only writer; clients only send inputs and pongs.
- **AC 2 (inputs):** `C2S.INPUT_SEND` (guarded, 25/s bucket) → `controller.queueInput(playerId, input)`. `RunController` implements the Dev Notes input queue exactly: a preallocated ring of `INPUT_QUEUE_MAX = 6` per player; `seq ≤ last queued` ignored (counted as `stale`); overflow drops the oldest (counted as `overflow`); each tick one queued input is applied (`ackSeq = seq`), or, when starved, the held input `{ ...last, moveX: 0, moveY: 0, swap: false, consumable: false }` with the same seq (aim and fire kept). One mutable input object per player is handed to `setInput`; no allocation per tick (players iterated from an array, not a Map iterator).
- **AC 3 (shared state):** `PlayerState` and `RunState` have the final fields from Dev Notes › Schema (`x`/`y` float32, `heading` uint8, `hp`/`maxHp` uint16, `status`, `ackSeq` uint32, loadout fields; `tick`, `wave`, `remaining`, `aliveCount`). `syncState` assigns a field only when it changed (x/y compared after `Math.fround`, hp with `Math.ceil`), using a module-level `forEach` callback (no closure per tick). `stateView.ts` mirrors all of it, and the compile-time drift check still passes. Events: `shared/net/netEvents.ts` tuples (players as slot, zombies as net id `slot | generation << 8`, weapons as `weaponIds` index, cm, `quantizeHeading`, tenths, reload in ms; melee arc/range come back from the weapon's balance); one `sim.events_flushed { tick, events }` broadcast per tick with events. A typical `weapon.fired` is 6 fields = 12 bytes as msgpack (test counts the bytes).
- **AC 4 (networked host):** `SimHost` gained `localPlayerId` and `online` (`LocalSimHost`: `"local"`, false). `NetSimHost` (no SDK import; depends on `NetRoomLike`) keeps a mirror World built with the new shared `NO_SYSTEMS` and never stepped; each frame it adds/removes players from the schema map, writes interpolated `x`/`y`/facing (`prevX = x`, `alpha = 0`), and HP/status/loadout/waves from the latest state. Inputs: 50 ms accumulator, latched edges, seq + 1 per step, one `input.send` per step, a 64-entry history ring, at most 5 steps per frame then the backlog is dropped. `net/snapshots.ts` (16-snapshot ring, copies only), `net/serverClock.ts` (min offset over 2 s), render tick = estimate − 2 ticks, `net/eventQueue.ts` (drain when tick ≤ render tick, capped at 2048), `net.pinged` answered at once with `net.pong`. `GameScene.create` takes `{ mode: "solo", seed? } | { mode: "online", session }`, builds the matching host, only solo calls `addPlayer`; every `LOCAL_PLAYER_ID` use is `host.localPlayerId`; players render through `Map<playerId, PlayerView>` added/removed as `world.players` changes. Online game over (local `player.died`, or status `dead` in the mirror) shows Game over with **Back to start**, which leaves the room. Practice solo, `?solo`, `?loadout`, `?tune`, `?stress`, `?debug` take the unchanged solo path (online ignores `?tune`/`?loadout`/`?stress` and the dev loadout picker).
- **AC 5 (slow ticks):** `run/slowTick.ts` `SlowTickWatch`: a tick over `SLOW_TICK_MS = 40` logs `warn { roomId, tick, tickMs, count }` at most once per second; `count` = slow ticks since the last line, this one included. Also keeps `ticks`, `totalMs`, `maxMs` (used by the measurement test).
- **Task 6 (RTT):** every 1 s each client gets `net.pinged { id, rttMs }` (one id per round, its own EWMA); a `net.pong` with the latest id (once per client) gives `rtt = now − sentAt`, `member.rttMs` = EWMA 0.25 (first sample taken as is), then `controller.setRtt(playerId, rttMs)`. `netPongSchema` is in `messages.ts`, guarded through `this.net.guard` (shared 10/s bucket). Pings start with the run, so the lobby never gets an unhandled message type.
- **Task 7 (leaving mid-run):** `onLeave` also calls `controller.removePlayer(playerId)` (shared `removePlayer` deletes `players`, `pendingInputs`, `inputs`, `lastAppliedSeq`); the schema entry was already removed by 2.3. Zombies retarget on the next tick (unit test).
- **Task 9 (error handler):** `RunRoom.onUncaughtException(err, method)` logs `error { roomId, err, method, tick }` as `room_exception` and the room keeps running; after `MAX_TICK_ERRORS_IN_A_ROW = 20` failed ticks (a good tick resets the count) it logs `room_closed_after_tick_errors`, broadcasts `server.shutdown_started { message: "The game hit an error, sorry" }` and `disconnect()`s.
- **Measured server tick (4 players, 150 Walkers):**
  - Headless (`apps/server/src/run/tickCost.test.ts`: `RunController.tick` + `syncState` + event encoding + one schema patch encode per tick; 4 players circling and firing, god mode, horde topped up to 150 before every tick; 100 warm-up + 600 measured ticks): **mean 0.12–0.13 ms, p99 0.30–0.43 ms, max 0.52–0.72 ms** over 3 runs; patch ≈ 87 B per tick for 4 moving players (≈ 1.7 KB/s, inside the 6 KB/s budget). The test asserts mean < 5 ms and p99 < 40 ms.
  - Live room (`RunRoom.fight.test.ts`: 4 SDK clients joined and started, 150 Walkers spawned into the room's World, 40 inputs each at 20/s, firing): **mean 0.36 ms, max 1.8 ms** per `onTick` (including `broadcast`).
  - No `slow_tick` line appeared in the dev server log during the browser checks.
- **Browser check (Playwright, chromium, two contexts at 844×390, `npm run dev`, waves on):** host "Ana" creates (`/j/KQSP`), friend "Bo" opens the link, enters a name, both Ready, host Start → both pages run `Game` in `online` mode with `localPlayerId` p0 / p1 and 2 player views; both survivors are drawn (screenshot) at the team spawn (22.5, 14.5) and (25.5, 14.5). Host holds D for 1 s → the friend sees p0 go from x 22.5 to 27.45 (same value on the host); friend holds S for 0.8 s → the host sees p1 go from y 14.5 to 18.1. Both fire while sweeping the mouse for 20 s: both clients received identical event streams (83 `weapon.fired`, 12 `zombie.hit`, 2 `zombie.killed`, 20 `player.damaged`, 1 `wave.started`, 6 reloads, 2 `player.died`), HUD "Wave 1 · Zombies 40", RTT 5 ms; both died to the wave and saw "Game over / Wave reached: 1 / Back to start". Walkers are simulated on the server but **not drawn** (horde stream is Story 2.5, as the story scopes); their hits, kills (blood splats) and damage do show. Second run: A clicks Back to start → start screen at `/`, server logs `player_left` (4000 consented), B's mirror drops p0 and keeps running; A then plays Practice solo (picker, Pistol+SMG, D for 1 s moves 4.5 m, `mode: "solo"`, `localPlayerId: "local"`); `/?solo&loadout=pistol,smg` goes straight to a solo `Game` with that loadout. No page errors. Servers stopped afterwards.
- **Tests:** 438 passing (435 in `npm test` + the 3 release-cheat checks with `REQUIRE_DIST=1` after `npm run build`), 69 files. 56 new: shared `spawn`/`removePlayer` 2, `heading` 3, `netEvents` 6; server `RunController` 10, `slowTick` 3, `syncState` 3, `tickCost` 1, `RunRoom.fight` 8 (two clients see p0 move 4.5 m ± 0.3 with `ackSeq` 20, `wave`/`aliveCount`/loadout in state; events forwarded as tuples; ping → pong → RTT in member and controller; leave mid-run; 20 tick exceptions → shutdown message and disconnect; a good tick resets the count; live tick measurement; every tick observed); client `serverClock` 3, `snapshots` + `eventQueue` 6, `NetSimHost` 11 (one input per 50 ms with increasing seq; a swap tap in exactly one input; no burst after a hidden tab; 64-entry history; midpoint halfway between ticks 10 and 11; latest-state HP/loadout/waves; players added/removed; tick-12 events not drained at render tick 11; pong; dispose). The server room files ran 3 times in a row without a flake. `npm run typecheck`, `npm run lint`, `npm run build` (main chunk 1,564 kB, `connection` chunk 181 kB; still no SDK in the main chunk) pass.
- **Deviations / decisions:**
  - The integration tests live in a new `RunRoom.fight.test.ts` (not appended to `RunRoom.test.ts`) to keep clear of the concurrent Story 2.3 review edits; it boots its own test server per worker like the other file.
  - `RunController` takes an optional `systems` override (tests) and exposes `rttMs`, `queued`, `drops` getters for tests and the 2.10 overlay.
  - `NetSession` takes a `leave` callback: `main.ts` builds it on `phase === "wave"` from `lobbyStore.current()` + `lobbyStore.joinedInfo()` with `leaveRoom` (= `lobbyStore.leave()` + reset the URL), and passes it in the `startOnline` request (`UiRequests.startOnline(session)`). `NetSimHost.dispose()` (Game scene shutdown) unsubscribes and calls `session.leave()`, so leaving the scene always leaves the room. New `UiRequests.leaveRun(error?)` is handled by the online Game scene (`scene.start("Boot", { error })`); `main.ts`'s `onLost` calls it so a dropped connection mid-run returns to the start screen with "Can't reach the server". `BootScene.create` takes `{ error? }` for that.
  - The `"starting"` `UiScreen` and the "Starting…" placeholder were removed, as 2.3 suggested.
  - `NetSimHost.update` is also the place where the mirror is written each frame; its `stats` (same `SimStepStats` shape as `LocalSimHost`) count input steps and time spent applying state, so the perf overlay keeps working online.
  - Added shared `lerpHeading` (short-way heading interpolation) next to `quantizeHeading`/`headingToRad`; `headingToRad` accepts fractional headings. `createLoadout` is now exported from shared.
  - `apps/client/src/net/fakeRoom.ts` is a test helper (fake `NetRoomLike` and plain room state); `lobbyStore.test.ts` uses its `fakePlayer` because `PlayerStateView` grew.
  - `Member.rttMs` (mutable) added to `run/lobby.ts`; it is never in schema or logs.
- **Notes for later stories:**
  - **2.5:** `RunRoom.onTick` has the "send horde frames here" line after `forwardEvents`; zombies are in `controller.world.zombies`. `netEvents` already sends zombie ids as net ids (`slot | generation << 8`) and decodes `zombieId` to the pool slot; the full net id stays in tuple index 1 of `ZOMBIE_KILLED`/`ZOMBIE_HIT` (`PLAYER_DAMAGED` index 3 is the source zombie's net id, −1 for none). NetSimHost: register `BYTES.HORDE_FRAME` in the constructor next to the other handlers (and remove it in `dispose`); sample at `host.renderTick`; write into `world.zombies` (empty now) after `applyState`. `quantizeHeading`/`headingToRad`/`lerpHeading` are in shared. The live-room tick measurement test (`RunRoom.fight.test.ts`) can grow a horde-frame encode.
  - **2.6:** the input queue is as specified (one input per tick, starved = hold still with the same seq), and `ackSeq` is in schema. `NetSimHost.history` is the 64-entry ring (`historyHead`/`historyCount` are private: expose an iterator for the predictor), `sentSeq` is the last seq, `RENDER_DELAY_TICKS = 2` is the constant to replace with the adaptive delay, and `SnapshotRing.sample`/`ServerClock.estimateTick` are fractional. The local player is currently drawn from the interpolated snapshot like everyone else. `NO_SYSTEMS` is exported for `PREDICTION_SYSTEMS`. `RunController` has no Colyseus/SDK import (usable from `tools/`).
  - **2.7:** `RunController.setRtt`/`rttMs` store the EWMA; `NetSimHost.drainEvents` = event queue drained at the render tick (put local cosmetic events in front). `FxView` already takes the local id from the host.
  - **2.8:** remove `player.died`/`"dead"` from `netEvents` (`PLAYER_DIED` kind), `syncState` (status), `NetSimHost` and the `GameScene` online game-over path (`showGameOver`, `GameOver.tsx` "Back to start", `UiRequests.leaveRun`). `onPhase` in `main.ts` only starts the scene on `"wave"`; a return to lobby will need the Game scene stopped without `NetSimHost.dispose()` leaving the room (today dispose always leaves).
  - **2.10:** `NetSimHost.rttMs`, `EventQueue.dropped`, `RunController.drops()`/`queued()`, `SlowTickWatch.meanMs/maxMs` are ready for the overlay; `tickCost.test.ts` reports patch bytes per tick.

### File List

- `packages/shared/src/player/player.ts` (modified: `removePlayer`)
- `packages/shared/src/player/spawn.ts` (new)
- `packages/shared/src/player/spawn.test.ts` (new)
- `packages/shared/src/net/heading.ts` (new)
- `packages/shared/src/net/heading.test.ts` (new)
- `packages/shared/src/net/netEvents.ts` (new)
- `packages/shared/src/net/netEvents.test.ts` (new)
- `packages/shared/src/net/messages.ts` (modified: `netPongSchema`, `NetPinged`)
- `packages/shared/src/net/stateView.ts` (modified)
- `packages/shared/src/core/systems.ts` (modified: `NO_SYSTEMS`)
- `packages/shared/src/config/balance/player.json` (modified: `spawnOffsetM`)
- `packages/shared/src/config/balanceSchema.ts` (modified)
- `packages/shared/src/index.ts` (modified)
- `apps/server/src/run/RunController.ts` (new)
- `apps/server/src/run/RunController.test.ts` (new)
- `apps/server/src/run/slowTick.ts` (new)
- `apps/server/src/run/slowTick.test.ts` (new)
- `apps/server/src/run/tickCost.test.ts` (new)
- `apps/server/src/run/lobby.ts` (modified: `Member.rttMs`)
- `apps/server/src/rooms/RunRoom.ts` (modified)
- `apps/server/src/rooms/RunRoom.test.ts` (modified: two assertions for the new fields/log)
- `apps/server/src/rooms/RunRoom.fight.test.ts` (new)
- `apps/server/src/rooms/schema/RunState.ts` (modified)
- `apps/server/src/rooms/schema/syncState.ts` (new)
- `apps/server/src/rooms/schema/syncState.test.ts` (new)
- `apps/client/src/sim/SimHost.ts` (modified)
- `apps/client/src/sim/LocalSimHost.ts` (modified)
- `apps/client/src/sim/NetSimHost.ts` (new)
- `apps/client/src/sim/NetSimHost.test.ts` (new)
- `apps/client/src/net/session.ts` (new)
- `apps/client/src/net/serverClock.ts` (new)
- `apps/client/src/net/serverClock.test.ts` (new)
- `apps/client/src/net/snapshots.ts` (new)
- `apps/client/src/net/snapshots.test.ts` (new: also covers `eventQueue`)
- `apps/client/src/net/eventQueue.ts` (new)
- `apps/client/src/net/fakeRoom.ts` (new, test helper)
- `apps/client/src/net/lobbyStore.test.ts` (modified: fixtures for the grown view)
- `apps/client/src/scenes/GameScene.ts` (modified)
- `apps/client/src/scenes/BootScene.ts` (modified)
- `apps/client/src/main.ts` (modified)
- `apps/client/src/ui/uiState.ts` (modified)
- `apps/client/src/ui/GameOver.tsx` (modified)
- `apps/client/src/ui/LobbyScreen.tsx` (modified: "Starting…" placeholder removed)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Senior Developer Review (AI)

- **Date:** 2026-11-21 · **Reviewer:** independent review agent (fresh context; full suite on the merged tip, the fight and NetSimHost tests run ~30 times, probe tests on RunController) · **Outcome:** no high findings. 2 medium and 4 low findings. **Story stays in `review` until the open items are fixed** (next session).
- [ ] **[Med] OPEN: the input backlog never drains after a stall** (`run/RunController.ts`).
  - The server takes exactly one input per tick and the client sends one per tick, so a 300 ms stall leaves 6 queued inputs (300 ms of extra lag) for the rest of the run.
  - From then on, any jitter overflows the queue and drops the oldest input. That loses movement (breaking Story 2.6's prediction invariant) and can lose swap/consumable edges.
  - **Fix:**
    - While the queue stays above a small target (≈ 2) for N ticks, apply two inputs in one tick, or skip the oldest and carry its edge flags forward. Report it so 2.6 can reconcile.
    - On overflow, OR the dropped input's `swap`/`consumable` into the next one.
    - Add a regression test: stall 6 ticks → backlog back to ≤ 2 within a few seconds.
- [x] [Med] A tick-error shutdown showed "Server restarting" instead of the error. Fix: `lobbyStore` keeps the `server.shutdown_started` text, and `main.ts` shows it (for example "The game hit an error, sorry"), falling back to "Server restarting". Test added.
- [x] [Low] Flaky fight test (`tick > 20`; ackSeq can reach 20 at exactly tick 20) now asserts `≥ 20`.
- [ ] [Low] OPEN: RTT is never measured above ~1 s, because only a pong for the latest ping id counts. Fix: keep the send times of the last few ping ids. Needed by Story 2.7.
- [ ] [Low] OPEN: events that arrive before `GameScene.create` builds the NetSimHost are lost; a guest whose tab is in the background at Start loses `wave.started` and others. Fix: register the event and ping handlers in lobbyStore/NetSession when the run starts, buffer them, and hand them over.
- [ ] [Low] OPEN: the slow-tick timing leaves out patch encoding, which runs on its own interval. Revisit with Story 2.5 (horde growth).
- Also seen: one `bootTestServer` timeout. Test servers use fixed ports (2600 + pool id) and collide when two test runs share the machine, as happens with parallel agents. Fix: random free ports in `bootTestServer`.
- Confirmed fine:
  - `setFixedTimestep` catch-up (at most 5 steps) with no double-counted time;
  - dispose clears every interval;
  - the input guard: bucket 25/s, at most 6 queued per player, stale/duplicate/out-of-order seqs dropped;
  - `syncState` writes only changed fields with no per-tick allocation, and event tuples round-trip;
  - `drainEvents` reuses its array, the mirror World is never stepped, and dispose always leaves;
  - the session lifecycle (back to start, connection lost, restart);
  - offline play is unchanged;
  - the merge with the 2.2/2.3 changes.

## Change Log

- 2026-11-21: Merged with Stories 2.2/2.3 fixes; review findings recorded, 2 fixed (shutdown text, flaky test), 4 open for the next session. 479 tests passing.

- 2026-11-21: Story 2.4 implemented: the room runs the shared World at 20 Hz (`RunController`, no Colyseus inside) with the per-player input queue (one input per tick, starved = hold still with the same seq), syncs players/HP/loadouts/phase/wave/aliveCount to schema only on change, forwards sim events as compact tuples, measures RTT with `net.pinged`/`net.pong`, removes leavers from the World, logs slow ticks (> 40 ms) and room exceptions, and closes after 20 failed ticks in a row. The client plays online through `NetSimHost` (mirror World, snapshot interpolation 100 ms behind, server clock, event queue at the render tick) behind the unchanged `SimHost` interface; `GameScene` draws every player and offers Back to start on an online game over. Server tick with 4 players and 150 Walkers: 0.12 ms mean, 0.4 ms p99. 438 tests passing.
