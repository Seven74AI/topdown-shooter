# Story 2.4: The server runs the fight

Status: ready-for-dev

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

- [ ] **Task 1: Shared helpers** (AC 1, 3)
  - [ ] `player/player.ts`: add `removePlayer(world, id)`. It deletes the player from `players`, `pendingInputs`, `inputs` and `lastAppliedSeq`.
  - [ ] `config/balance/player.json` + schema: add `spawnOffsetM: 1.5`.
  - [ ] `player/spawn.ts`: `teamSpawnPoint(world, slot, out)` gives the map centre plus `(±1, ±1) × spawnOffsetM` by slot (0: −−, 1: +−, 2: −+, 3: ++).
  - [ ] `net/heading.ts`: `quantizeHeading(x, y): number` (0–255, 0 = +x, increasing toward +y) and `headingToRad(h)`. Story 2.5 uses them in the horde format.
  - [ ] Tests for all three.
- [ ] **Task 2: Net events codec (shared)** (AC 3): `packages/shared/src/net/netEvents.ts` (see Dev Notes › Events on the wire). Round-trip tests for every kind, plus the size of a typical `weapon.fired` (≤ 16 bytes as msgpack tuple fields, estimated by counting).
- [ ] **Task 3: RunController (server, no Colyseus imports)** (AC 1, 2): `apps/server/src/run/RunController.ts`, see Dev Notes › RunController. Unit tests in `RunController.test.ts`.
- [ ] **Task 4: Schema for the fight** (AC 3)
  - [ ] Extend `rooms/schema/RunState.ts` and `shared/net/stateView.ts` (see Dev Notes › Schema).
  - [ ] Add `rooms/schema/syncState.ts`: `syncState(state, controller)` copies World → schema once per tick, and only assigns a field when its value changed.
- [ ] **Task 5: RunRoom tick loop** (AC 1, 2, 5)
  - [ ] On an accepted `run.start` (2.3): `this.controller = new RunController({ balance, seed: randomUint32(), players, pauseWaves: process.env.DEV_NO_WAVES === "1" })`, where `randomUint32` uses `node:crypto`.
  - [ ] Then `this.setFixedTimestep(() => this.onTick(), TICK_RATE_HZ)`. The 0.18 fixed timestep catches up at most 5 steps, then drops the backlog.
  - [ ] Log `run_started` with `{ roomId, runSeed, players }`.
  - [ ] `onTick`:

    ```ts
    const t0 = performance.now();
    const events = controller.tick();
    syncState(state, controller);
    forwardEvents(events);
    // Story 2.5: send horde frames here
    slowTick.observe(performance.now() - t0);
    ```
- [ ] **Task 6: Inputs and RTT (server)** (AC 2)
  - [ ] `C2S.INPUT_SEND` (guarded by `playerInputSchema` and the 25/s bucket from 2.1) calls `controller.queueInput(playerId, input)`.
  - [ ] Every 1 s per client: `client.send(S2C.NET_PINGED, { id, rttMs })` and remember `sentAt`. On `C2S.NET_PONG` with the latest id: `rtt = now − sentAt`, `member.rttMs = ewma(0.25)`, then `controller.setRtt(playerId, rttMs)`. Story 2.7 uses it.
  - [ ] Add `netPongSchema` to `messages.ts`.
- [ ] **Task 7: Leaving mid-run** (AC 1): `onLeave` during `wave` calls `controller.removePlayer(playerId)` and removes the schema entry. Zombies pick the next-nearest player on the next tick. Reconnect is Epic 8 and "<name> left" is 2.11; here only removal is safe.
- [ ] **Task 8: Slow-tick logging** (AC 5): `apps/server/src/run/slowTick.ts`.
  - [ ] Above `SLOW_TICK_MS = 40`, log `log.warn({ roomId, tick, tickMs }, "slow_tick")`, at most one line per second; extra slow ticks in that second go into a `count` field.
  - [ ] Unit-test it with injected times.
- [ ] **Task 9: Room error handler** (AC 1)
  - [ ] `RunRoom.onUncaughtException(err, method)` logs `error` with `roomId`, `method` and `tick`. The simulation keeps going (architecture › Error Handling).
  - [ ] After 20 tick exceptions in a row, broadcast `S2C.SERVER_SHUTDOWN_STARTED` `{ message: "The game hit an error, sorry" }` and `disconnect()`. Saving a snapshot is Epic 8.
- [ ] **Task 10: SimHost contract** (AC 4). See Dev Notes › SimHost changes.
  - [ ] Extend `apps/client/src/sim/SimHost.ts` with `localPlayerId` and `online`.
  - [ ] `LocalSimHost` sets `localPlayerId = LOCAL_PLAYER_ID` and `online = false`.
- [ ] **Task 11: NetSimHost** (AC 2, 3, 4): `apps/client/src/sim/NetSimHost.ts`, plus `apps/client/src/net/{serverClock.ts, snapshots.ts, eventQueue.ts}`. See Dev Notes › NetSimHost.
- [ ] **Task 12: GameScene uses any host** (AC 3, 4)
  - [ ] `GameScene.create(data)` takes `{ mode: "solo" } | { mode: "online", session: NetSession }`. It builds the matching host. Only solo calls `addPlayer`.
  - [ ] Every `LOCAL_PLAYER_ID` use becomes `host.localPlayerId`.
  - [ ] Player rendering becomes a `Map<playerId, PlayerView>` that adds and removes views as `world.players` changes. Rings, colors and names are Story 2.9; here remote players use the same placeholder.
  - [ ] Online game over: if the local player dies, show the existing Game over with **Back to start**, which leaves the room. Story 2.8 replaces death with downed and revive.
  - [ ] The 2.3 "Starting…" placeholder now starts `Game` in online mode.
- [ ] **Task 13: Tests**: see Dev Notes › Testing.

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

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
