# Story 2.6: Instant feel for my own survivor

Status: ready-for-dev

## Story

As a player,
I want my own movement and aim to respond instantly even with 150 ms of lag,
so that the game feels good on 4G.

## Acceptance Criteria

1. **Prediction.** When I move or aim, the client applies my input immediately to a predicted copy of my survivor, using the shared movement code.
2. **Reconciliation.** When a server snapshot of my player arrives, the client replays my unacknowledged inputs (by sequence number) from the server state. Small errors are smoothed, large ones snap.
3. **Adaptive delay.** Remote players and zombies are rendered with an interpolation delay that adapts between 100 and 150 ms from measured jitter.
4. **Feel.** With a simulated 150 ms latency and 20 ms jitter (dev network throttle), moving in a circle for 30 s shows no visible rubber-banding on my survivor.

## Tasks / Subtasks

- [ ] **Task 1: Prediction systems (shared)** (AC 1)
  - [ ] In `core/systems.ts`, export `PREDICTION_SYSTEMS: Systems = { ...NO_SYSTEMS, input: applyInputs, player: updatePlayers }`. `NO_SYSTEMS` comes from 2.4. Movement is the only predicted gameplay (ADR-01).
  - [ ] Test: a World with `PREDICTION_SYSTEMS` and one player, fed N inputs, ends exactly where the full `DEFAULT_SYSTEMS` World puts that player (no zombies, waves paused): positions are equal with `toBe`, not `toBeCloseTo`.
- [ ] **Task 2: Predictor (client)** (AC 1, 2): `apps/client/src/net/prediction.ts`, a `Predictor` class that is Phaser-free and SDK-free, so `tools/netsim` can import it. See Dev Notes › Predictor.
- [ ] **Task 3: NetSimHost uses it** (AC 1, 2)
  - [ ] Each 50 ms step, the input that is sent (2.4) also goes to `predictor.applyLocal(input)`.
  - [ ] Each new snapshot that carries the local player goes to `predictor.reconcile(ackSeq, x, y, status)`.
  - [ ] Each frame, the mirror's local player gets `x = prevX = predictor.renderX(alpha, frameDtS)` (the same for y), plus the facing from the predictor.
  - [ ] The camera follows this, so it is smooth too. Remote players and zombies keep the interpolated path.
- [ ] **Task 4: Adaptive delay (client)** (AC 3): `apps/client/src/net/adaptiveDelay.ts`, used by the render tick for players, horde and events (2.4/2.5 all share one render tick). See Dev Notes › Adaptive delay.
- [ ] **Task 5: Dev network throttle (client)** (AC 4)
  - [ ] `apps/client/src/net/devThrottle.ts`, enabled by `?lag=<rttMs>&jitter=<ms>` (parse it in the URL-options module from Story 1.12, `debug/urlOptions.ts`, if it exists; else add the parser there).
  - [ ] Available in release builds too, so Story 2.10 can use it on phones. It only hurts the device that enables it.
  - [ ] See Dev Notes › Throttle.
- [ ] **Task 6: Network harness test** (AC 2, 4): `tools/netsim/predictionCircle.test.ts`. See Dev Notes › Harness. This is the automated proof of AC 4.
- [ ] **Task 7: Manual check** (AC 4)
  - [ ] Run `npm run dev` with two tabs; in one of them open `?lag=150&jitter=20` and walk circles for 30 s.
  - [ ] Optionally run the server with `COLYSEUS_LATENCY=150`, a built-in 0.18 round-trip delay for the whole server without jitter, to compare.
  - [ ] Record what you saw, the overlay's correction stats (Task 8) and the harness numbers in the Completion Notes.
- [ ] **Task 8: Stats**
  - [ ] `predictor.stats`: `corrections` (count of errors above 1 mm), `snaps`, `maxErrorM` over the last 10 s, `unackedInputs`.
  - [ ] Expose them on `NetSimHost.netStats` for the 2.10 overlay. Until then, log them to the client console once per wave in dev builds.

## Dev Notes

### Scope and prerequisites

- Builds on 2.4's input queue. **Read its "Input queue" decision first.** The server applies one input per tick in seq order, and a starved tick holds still with the same seq. That is what makes replay exact.
- Also builds on 2.4's `ackSeq` in schema, the 50 ms input accumulator with its 64-entry history, the server clock and the render tick; and on 2.5's horde buffer, which uses the same render tick.
- Out of scope:
  - predicting shots: muzzle flash, sound and own cosmetic projectile come instantly from local input in 2.7, but the predictor doesn't simulate combat;
  - predicting zombies;
  - collision with buildings and cover: buildings arrive in 3.4 and cover in 4.2. When they arrive, the predictor World needs the same collision data, and the architecture says prediction applies decay to its own map (ADR-05 › Decay). Note this for Stories 3.4, 4.2 and 4.5.

### Predictor

```ts
export class Predictor {
  constructor(balance: Balance, map: DistrictMap, playerId: string);
  /** First snapshot: create the predicted player at the server position. */
  init(x: number, y: number): void;
  /** One local fixed step: record the input and step the prediction World. */
  applyLocal(input: PlayerInput): void;
  /** Server truth for my player at `ackSeq`; replays newer inputs. Ignores acks older than the last one seen. */
  reconcile(ackSeq: number, x: number, y: number, status: PlayerStatus): void;
  /** Smoothed position to draw this frame. */
  renderX(alpha: number): number; renderY(alpha: number): number;
  /** Decays the visual offset; call once per frame. */
  frame(frameDtS: number): void;
  readonly facingX: number; readonly facingY: number;
  readonly stats: PredictionStats;
}
```

- **The prediction World** is `createWorld({ balance, seed: 0, map, systems: PREDICTION_SYSTEMS })` with only my player. `step()` runs exactly the shared movement code the server runs (AC 1). Movement uses only `+ − × ÷`, `sqrt`, `min` and `max` (Story 1.3), so it gives the same bits in every JavaScript engine.
- **History:** a ring of 64 inputs, copied into preallocated objects, with no allocation per step. `reconcile` drops entries with `seq ≤ ackSeq`.
- **Reconcile:**
  1. Remember the position drawn this frame: `D = lerp(prev, cur, alpha) + offset`.
  2. Set my player's `x`, `y`, `prevX`, `prevY` and `status` to the server values.
  3. Replay each remaining input with `setInput` + `step`.
  4. The new drawn position is `P`. The error is `e = D − P`:
     - |e| < `IGNORE_M` (1 mm, the float32 rounding of schema `x`/`y`): `offset` is unchanged.
     - |e| ≥ `SNAP_M` (1.0 m): `offset = 0` (snap), `stats.snaps++`.
     - otherwise: `offset = e` (keep drawing where we were, then decay toward the truth), `stats.corrections++`.
- **Offset decay:** `offset *= Math.exp(−frameDtS / SMOOTH_TAU_S)` with `SMOOTH_TAU_S = 0.1`. Constants live in `apps/client/src/net/netConfig.ts`: they are netcode feel, not gameplay balance.
- If the ack is more than 64 inputs behind (a stall of over 3 s), replay isn't possible. Snap to the server position and clear the history.
- Facing comes from the predicted player, which follows my latest aim immediately (AC 1). It is never reconciled.
- When the status is not `"alive"` (dead now, `downed`/`out` from 2.8), `updatePlayers` doesn't move the player, so prediction stops by itself.

### Adaptive delay

- Track snapshot arrival gaps: `jitterMs = ewma(|gapMs − 50|, α = 0.1)`, using the arrival times **after** the throttle.
- `targetMs = clamp(100 + 2 × jitterMs, 100, 150)`. At 20 ms jitter this gives 140 ms.
- Slew the actual delay toward the target at no more than 20 ms per second, so the render tick never jumps and nothing teleports.
- The render tick is `serverClock.estimateTick(now) − delayMs / 50` (fractional).
- The horde buffer holds 8 snapshots (2.5) and the player snapshot ring 16 (2.4): both cover 150 ms plus jitter.
- Expose `delayMs` and `jitterMs` on `netStats` (2.10 overlay).

### Throttle

- It wraps the `NetRoomLike` from 2.4, so NetSimHost doesn't know it exists:
  - **Outgoing** `send` is delayed by `lag/2 ± jitter/2`.
  - **Incoming** snapshots, horde frames and event batches are copied when they arrive (snapshots are already copied into the ring by 2.4; horde bytes go into a small pool of `Uint8Array(2054)` buffers) and handed on at their due time.
- **Order is preserved** (TCP never reorders): `due = max(lastDue, now + lag/2 + uniform(−jitter/2, jitter/2))`.
- `Math.random` is fine here: this is client code, not `packages/shared`.
- Drive it from the game loop, through `NetSimHost.update`. No `setTimeout` per message: that would allocate and fire while the tab is hidden.

### Harness (`tools/netsim/predictionCircle.test.ts`)

- Imports `RunController` from `apps/server/src/run/RunController.ts` and `Predictor` from `apps/client/src/net/prediction.ts`. Both are free of Colyseus, SDK and Phaser by design (2.4, and this story). `vitest.config.ts` already includes `tools/**/*.test.ts`.
- Virtual time in ms with a seeded jitter source:
  - the server ticks every 50 ms at a random phase offset;
  - the client steps every 50 ms, renders every 16.67 ms, and sends a circle input `moveX = cos(ωt)`, `moveY = sin(ωt)` (one lap per 4 s);
  - one-way delay is 75 ± 10 ms in both directions, ordered;
  - the server's per-tick snapshot is `{ tick, x, y, ackSeq }` from the controller, rounded to float32 with `Math.fround`, as the schema does.
- Run for 30 s (600 ticks) with `pauseWaves`. Assert:
  - `stats.snaps === 0`;
  - `maxErrorM < 0.01`;
  - between frames, the drawn local position never moves more than `speedMps × frameDt × 1.5`, so there is no visible jump backward or forward.
- Second case: 150 ms with 40 ms jitter. Assert there are no snaps and that the corrections stay below 0.05 m.
- Optional third case (documents why the queue exists): if it stays cheap, have the harness feed the controller only the newest arrival each tick, which you can do on the harness side by discarding older arrivals before `queueInput`. The errors become visible (> 0.1 m). Don't add a production option to `RunController` just for this.

### Previous story intelligence

- 2.4 already caps catch-up at 5 steps and drops the backlog after a hidden tab. While hidden, nothing is sent, so the server starves and holds still. On return, the client predicts from its last state and the first snapshot pulls it back to the truth, as a snap if the gap is over 1 m. That is the expected behaviour: note it.
- The mirror's `prevX = x` trick from 2.4 stays for remote players and zombies. Only the local player uses the predictor output.

### Project Structure Notes

- New:
  - `apps/client/src/net/{prediction.ts, prediction.test.ts, adaptiveDelay.ts, adaptiveDelay.test.ts, devThrottle.ts, devThrottle.test.ts, netConfig.ts}`
  - `tools/netsim/predictionCircle.test.ts`
- Modified:
  - `packages/shared/src/core/systems.ts` (`PREDICTION_SYSTEMS`), `index.ts`
  - `apps/client/src/sim/NetSimHost.ts`, `apps/client/src/net/session.ts` (throttle wrap), `debug/urlOptions.ts`
  - `tsconfig.tools.json`, if the harness needs the client and server sources included for typecheck
- `tools/` tests may import from `apps/*`. Apps must never import from each other.

### References

- [Source: epics.md#Story 2.6: Instant feel for my own survivor]
- [Source: game-architecture.md#Networking] (prediction with shared movement code, reconcile by seq, adaptive 100–150 ms), [#ADR-01], [#State Management › Client]
- [Source: 2-4-the-server-runs-the-fight.md#Input queue], [#NetSimHost]
- Determinism of movement: [Source: packages/shared/src/player/movement.ts] (no sin/cos/atan2)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
