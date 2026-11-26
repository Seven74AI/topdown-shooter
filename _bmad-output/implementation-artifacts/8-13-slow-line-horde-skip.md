# Story 8.13: Slow-line horde skip

Status: review

<!-- Created with gds-create-story (builder session, 2026-11-26) from epics.md Story 8.13, the 8.10 story file (B6, B7, T8 table), docs/network-pass-decisions.md, docs/epic-8-story-decisions.md (E8-A9), docs/perf/epic-2-network.md and the real code. Ultimate context engine analysis completed - comprehensive developer guide created. -->

## Story

As a player on a very slow mobile line,
I want to see where the horde is now, not where it was seconds ago,
so that a bad signal costs me detail, not my life.

## Acceptance Criteria

1. **Latency signal.** The server has a per-phone latency signal: the round trip of something the phone already answers, or a new tiny ack if none fits; a new message bumps `NET_PROTOCOL_VERSION` with the usual "please reload" path (`update_required`).
2. **Skip.** When the estimated age of the horde frames queued for that phone passes a threshold (a named constant, recorded with its measured reason), the server skips the stale horde frames for that phone and sends a keyframe once the line catches up — the same keyframe path as 8.10's join / skip / once-a-second rule.
3. **Only horde frames.** State patches and events are never dropped.
4. **64 kbit/s.** On the 8.10 capped-line measurement (`npm run bots -- --kbps`, 4 bot phones, wave 4, stalls of 0.2, 0.4 and 1 s at 64 and 128 kbit/s; the 8.10 T8 method) the longest wait of a horde frame in the capped queue is **≤ 1,000 ms** in every 64 kbit/s row (8.10: 4,720 / 4,680 / 1,883 ms), with **0 decode errors**, and after each keyframe the phone's zombie positions match a full frame within **1 cm**.
5. **128 kbit/s and clean.** `framesSkipped` stays **0** and the horde stream stays within **+5 %** of the 8.10 numbers (8.2 KB/s on the audit replay, ≤ 13.5 KB/s with the stampede's 180 in one view).
6. **Records.** The before / after table is recorded here and in `docs/perf/network-pass-2026-11.md` § 8.10; `deferred-work.md`'s 8.10 B6 line is closed.
7. **No regression.** The existing net tests (hits harness, `smooth.test.ts`, `hordeEncoder.test.ts`, the 8.10 fuzz decode) pass unchanged; the lossy-line numbers of 8.8 / 8.9 (reversed hits < 5 %, ≤ 1 visible freeze per 30 s) do not get worse.
8. **8.10 B7 re-check** (retro E8-A9, designer "ok" 2026-11-26). With the far rule off (every zombie at 20 Hz), the 64 and 128 kbit/s rows are measured: if both meet their targets, B7 is confirmed in `docs/network-pass-decisions.md`; if not, this story's skip is the first lever and `HORDE_NEAR_M` is tried only after it, with both sets of numbers in the table.

**Real-phone checks are PARKED** (designer 2026-11-25, HANDOFF §5.2): everything here is measured on netsim and bots, on this cloud container. No real phone, no real 4G.

## Decisions (auto-accepted: designer 2026-11-26 "follow recommendations")

| # | Question | Pick | Alternatives |
| --- | --- | --- | --- |
| D1 | The latency signal (AC 1) | **A 2-byte tick ack in the binary input**: every input (20/s) carries the low 16 bits of the newest server tick the phone has received (a patch's `tick` or a horde frame's). The server times each NEW ack against when it wrote that tick. Input 14 → 16 bytes (+40 B/s up), `INPUT_FORMAT` 1 → 2, **`NET_PROTOCOL_VERSION` 3 → 4** (old tabs get "A new version is out. Please reload."). Not part of `PlayerInput`: the simulation never sees it. **auto-accepted (designer 2026-11-26: follow recommendations)** | (a) the existing `net.pinged` / `net.pong` round trip: no protocol change, but 1 per second, and a 1 s stall on the ping in either direction reads as a 1 s queue: at 1 % loss it would skip on every 128 kbit/s row (AC 5 says 0); (b) the input's `viewTick`: it is the phone's render tick, which follows the phone's smoothed clock (2 s minimum window, slews at 10 %), so it hides a queue for tens of seconds |
| D2 | The rule (AC 2) | **age = ack arrival − that tick's send time; base = the lowest age of the last 10 s (the line's own round trip); wait = age − base; projected = wait + trend × age** (the trend: how fast the wait grew per ms of send time over ≥ 200 ms of acked ticks, clamped 0–2: we learn a frame's wait only when it lands, so a filling line reads late). **Skip while projected > `HORDE_LINE_SKIP_MS` = 300 ms**, confirmed by acks ≥ `HORDE_LINE_CONFIRM_MS` = 100 ms apart with no gap over 200 ms between them; **resume (keyframe) once the measured wait < `HORDE_LINE_RESUME_MS` = 100 ms**; no ack for `HORDE_LINE_SIGNAL_STALE_MS` = 2 s (hidden tab) ends the skip. Only a NEW, newer ack is a sample, so stalls do not read as a queue (the newest frame of a released burst is fresh; the newest input of an upstream burst carries a fresh ack). **auto-accepted (designer 2026-11-26: follow recommendations)** | 250 / 200 ms (measured no better in the model: the worst rows are set by 1 s stalls hiding the line, not by the limit); no trend (64 kbit/s queue reached 1,049 ms in the model before the skip caught it); no confirm (a single late ack from overlapping up + down stalls skipped 8 frames at 128 kbit/s) |
| D3 | Where it lives | **In the horde encoder's per-phone state** (`HordeClientState`, keyed by the client object like 8.10 B5): `HordeEncoder.ack(client, ackLow, nowMs)` from `RunRoom.onInput` (and the rate-dropped input path); `prepare(world, nowMs)` stamps each tick's send time (one write per tick since 8.11). A reconnect (new client object) or `resetHordeStream` (8.1's attach) starts the line measurement again. **auto-accepted (designer 2026-11-26: follow recommendations)** | a separate per-member tracker in `RunRoom` (more join/leave lines in a file 8.1/8.2 share) |
| D4 | The before row | **Measured on this branch with `BOTS_NO_ACK=1`** (bots send no ack: the server behaves as 8.10/8.11 did, same build, same minute), next to each 64 kbit/s row; the 8.10 T8 numbers are kept beside it. **auto-accepted (designer 2026-11-26: follow recommendations)** | a master worktree (another `npm ci` and server; master's 8.11 one-packet write is in both anyway) |

## Tasks / Subtasks

- [x] **T1 Wire format** (AC 1) — `packages/shared/src/net/input.ts`: `INPUT_BYTES` 16, `INPUT_FORMAT` 2, flag 16 = ack present, bytes 14–15 the ack's low 16 bits (0 without the flag, else refused), `encodeInput(input, out, ackTick = -1)`, `decodeInputAck`, `ackTickFrom(low, nowTick)`; `messages.ts` `NET_PROTOCOL_VERSION` 4. Tests: `packages/shared/src/net/input.test.ts > Story 8.11 binary input … > Story 8.13: the tick ack (bytes 14–15) > round-trips the low 16 bits; …`, `> ackTickFrom: the newest tick ≤ now …`, plus the updated refusal and fuzz cases.
- [x] **T2 Server rule** (AC 2, 3) — `apps/server/src/net/hordeEncoder.ts` (`ack`, `prepare(world, nowMs)`, `send` skips while `lineSlow`; `HordeStats.lineSkipped`, `maxLineWaitMs`), constants in `packages/shared/src/net/hordeFormat.ts` (`HORDE_LINE_*`), `apps/server/src/rooms/RunRoom.ts` (`inputParser` keeps the ack, `onInput` / `onInputRateDropped` call `horde.ack`, `horde_stats` logs `lineSkipped`, `maxLineWaitMs`). Tests: `apps/server/src/net/hordeLineSkip.test.ts` (below).
- [x] **T3 Phone + bots** (AC 1) — `apps/client/src/sim/NetSimHost.ts` sends `max(snapshots.latestTick, horde.latestTick)`; `tools/bots/botClient.ts` sends `max(state.tick, newest horde frame tick)`; `BOTS_NO_ACK=1` = the control (D4), documented in `tools/bots/run.ts`.
- [x] **T4 Model test** (AC 2–5) — `apps/server/src/net/hordeLineSkip.test.ts`: an in-process copy of the `lagLine.ts` rules (serialised cap, ordered one-way delay with jitter, head-of-line stalls both ways), 130 zombies in 10 s rushes (≈ 1.2 × a 64 kbit/s line), one chunk per tick (frame + 80 B patch). Pins: 64 kbit/s waits bounded with 0 decode errors and the phone within 1 cm of the world after every keyframe that follows a skip (control without acks queues > 1.5 s); 128 kbit/s and uncapped lines with 0.2 / 0.4 / 1 s stalls: 0 skips; an upstream burst is no queue; a steady late ack skips after the confirm time; stale signal; reset.
- [x] **T5 Measurement** (AC 4, 5, 8) — the bot table below, `docs/perf/network-pass-2026-11.md` § 8.10 (8.13 rows).
- [x] **T6 Docs** (AC 6, 8) — `docs/network-pass-decisions.md` (8.13 D1–D4, B7 re-check), `deferred-work.md` (8.10 B6 closed), `docs/perf/epic-2-network.md` (network pass update line), `docs/epic-8-story-decisions.md` (8.10 B7 row: re-checked).
- [x] **T7 Gate** — `npm run gate:fast`, `test:slow` for netsim/bots; PR CI.

## Dev Notes

### What the code did before (read in full)

- `HordeEncoder.send` (8.10) skipped a frame only when the client was not JOINED or `ref.bufferedAmount > HORDE_BACKPRESSURE_BYTES` (64 KB). On a 64 kbit/s line the queue sits in the network (`lagLine.ts`'s capped queue pauses the server socket only above 64 KB = 8 s of that line), so the socket never filled: 0 skips, frames waited 4.7 s (8.10 T8, F12, B6).
- 8.10 keyframes: `needsKey` after any skip; the next frame is a keyframe (full set, slot order); deltas chain on `HordeClientState`. This story reuses that path: a line skip sets `needsKey` exactly like a socket skip.
- 8.11: one write per tick per client (horde frame, events, ping, patch; `autoBatchMessages`), so a tick's send time is one stamp for all of it, and the patch carries `state.tick`: the phone has a received tick to ack even while horde frames are skipped (that is how the skip ends).
- Ping/pong (Story 2.4, `RunRoom.ping` / `onPong`): 1 Hz, EWMA, shared ids — unchanged (D1 alt a).
- Input (8.11): 14-byte binary `BYTES.INPUT`, `bytesParser(decodeInput, …)` through the guard's input bucket (25/s) — unchanged apart from the 2 bytes.

### Must be preserved

- Never queue a horde frame (8.10 AC 4); a skip → keyframe; the per-client state fixed-size (no growth over endless waves): the new per-phone state is 2 × 10 + 2 × 16 numbers, made once with the client state; `ack` and `send` allocate nothing.
- Patches and events: the encoder never touches them (AC 3).
- 8.1 hooks: `resetHordeStream` also forgets the line measurement; a reconnect is a new client object (new state).
- The harness (`tools/netsim/hitsSim.ts`) sends no ack → no line skip there: its numbers cannot move from this story (AC 7).

### Notes for the merge

- **`packages/shared/src/net/input.ts` / `messages.ts`:** `INPUT_BYTES` 16, `INPUT_FORMAT` 2, `NET_PROTOCOL_VERSION` **4** (this story takes 4: 12.2 or Epic 11, if they need a bump, take 5). Anything that builds an input with `new Uint8Array(14)` must use `INPUT_BYTES`.
- **`apps/server/src/rooms/RunRoom.ts`:** three small spots: the `inputParser` field (keeps the ack), the first lines of `onInput`, `onInputRateDropped`; `horde_stats` gains two fields; the two stat resets gain two lines.
- **`apps/client/src/sim/NetSimHost.ts`:** one line in the input send (`encodeInput(buf, this.sendBytes, ack)`). No other `apps/client/src/net/*` file changed.
- **`apps/server/src/net/hordeEncoder.ts`:** `prepare(world, nowMs?)` (default `performance.now()`), new `ack`; `send` gets one more skip reason.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.13]
- [Source: _bmad-output/implementation-artifacts/8-10-half-size-horde-stream.md#Backpressure (T8 table), B6, B7, Notes for the merge]
- [Source: docs/network-pass-decisions.md#8.10 B6, B7; 8.11 B2]
- [Source: docs/epic-8-story-decisions.md#Designer review 2026-11-26 (retro E8-A9)]
- [Source: tools/netaudit/lagLine.ts (the capped line), apps/client/src/net/serverClock.ts (why viewTick hides a queue)]

## Measurements

MEASUREMENTS_PLACEHOLDER

## Dev Agent Record

### Agent Model Used

Builder session (cloud), 2026-11-26.

### Completion Notes List

COMPLETION_PLACEHOLDER

### File List

- `packages/shared/src/net/input.ts`, `input.test.ts`, `messages.ts`, `hordeFormat.ts`, `packages/shared/src/index.ts`
- `apps/server/src/net/hordeEncoder.ts`, `apps/server/src/net/hordeLineSkip.test.ts` (new), `apps/server/src/rooms/RunRoom.ts`
- `apps/client/src/sim/NetSimHost.ts`
- `tools/bots/botClient.ts`, `tools/bots/run.ts`
- docs: this file, `docs/perf/network-pass-2026-11.md`, `docs/perf/epic-2-network.md`, `docs/network-pass-decisions.md`, `docs/epic-8-story-decisions.md`, `_bmad-output/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`

## Change Log

- 2026-11-26: story file created (gds-create-story) and built (gds-dev-story) in the builder session; status review.
