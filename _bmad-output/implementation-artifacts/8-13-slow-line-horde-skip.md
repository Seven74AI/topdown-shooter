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

All on this cloud container (4 cores, load 0.0–0.3 during the runs, one run at a time), branch `story-8-13` on master `d8ffaee`. **Bots and the model only: no real phone, no real 4G (parked).** Server: `PORT=4167 ALLOW_TEST_SCENARIOS=1 node --import tsx apps/server/src/index.ts`; each row: `npm run bots -- --url http://localhost:4167 --count 4 --scenario net150 --until-wave 4 --hold-fire 45 --lag 150 --jitter 20 --loss 1 --stall S --kbps K` (the 8.10 T8 method, wave 4, ~70 s each). "Before" = the same build with `BOTS_NO_ACK=1` (D4: the server then behaves as on master); the 8.10 T8 column is the 8.10 story's table. Longest wait = `bots_line.maxDownQueueMs` (the capped queue, beyond the one-way delay); skips and the server's own wait reading from `horde_stats` (`lineSkipped`, `maxLineWaitMs`).

### Capped line (AC 4, 5, 8)

| Cap | Stall | Longest wait: 8.10 T8 | Before (no ack) | **After** | Horde frames skipped (4 phones) | Decode errors | Horde KB/s per phone before → after | RTT (bots) before → after |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 64 kbit/s | 0.2 s | 4,720 ms | 8,155 ms | **674 ms** | 1,480 of 5,700 (26 %) | 0 | 4.2 → 3.4 | 985 → 178 ms |
| 64 kbit/s | 0.4 s | 4,680 ms | 7,909 ms | **774 ms** | 1,142 of 5,716 (20 %) | 0 | 3.5 → 3.7 | 191 → 227 ms |
| 64 kbit/s | 1 s | 1,883 ms | 8,150 ms | **383 ms** | 32 of 6,920 (0.5 %) | 0 | 3.7 → 2.3 | 470 → 327 ms |
| 128 kbit/s | 0.2 s | 158 ms | 191 ms | **192 ms** | **0** | 0 | 4.0 → 4.6 | 165 → 166 ms |
| 128 kbit/s | 0.4 s | 159 ms | — | **191 ms** | **0** | 0 | → 4.1 | → 189 ms |
| 128 kbit/s | 1 s | 159 ms | — | **191 ms** | **0** | 0 | → 4.8 | → 267 ms |
| no cap, lossy (1 % × 0.2 s) | 0.2 s | — | — | 0 | **0** | 0 | → 4.6 | → 159 ms |
| clean (localhost) | — | — | — | 0 | **0** (before 0) | 0 | 3.8 → 6.0 | 1 → 1 ms |

- **64 kbit/s: every row ≤ 1,000 ms (AC 4)**, 0 decode errors. Before is worse than 8.10's T8 (≈ 8 s): the no-ack build queues until the cap's 64 KB pause (8 s of that line) and that pause kicked in 1–7 times per run; the 64 KB socket rule still never skipped a frame (B6's finding, unchanged). The cost of the fix is detail: on the 0.2 and 0.4 s rows a fifth to a quarter of the horde frames are skipped (the phone sees the horde at ~15 Hz with a keyframe after each gap) instead of seeing it 8 s late.
- **The server's own reading** (`maxLineWaitMs`, ack-based) peaked at 505–1,016 ms per phone on the 64 kbit/s rows and at 109–1,023 ms on the 128 kbit/s rows: the high 128 kbit/s readings are single late acks after 1 s stalls, filtered by the confirm rule (D2), so 0 skips.
- **Horde KB/s per phone (AC 5)** moves with what the bots happen to see (zombies in view 30–85 between runs); per 100 zombies in view it is the same before and after: clean 7.2 → 7.1, 128 kbit/s 7.3 → 7.3 KB/s. The encoder's own numbers are unchanged because no frame changes without an ack (the next table).
- **Keyframes after a skip match the world (AC 4):** pinned in the model test (below): the phone's positions after every keyframe that follows a skip are within 0.5 cm (the cm grid) of the world at that tick, at 64 kbit/s with 0.2 / 0.4 / 1 s stalls. The bots decode every frame with 0 errors (`hordeDecodeErrors`).
- **B7 holds (AC 8):** both the 64 and 128 kbit/s rows meet their targets with the far rule off (every zombie at 20 Hz); `HORDE_NEAR_M` stays `Infinity`. Confirmed in `docs/network-pass-decisions.md`.

### Encoder bandwidth (AC 5)

| Case | 8.10 as shipped | master `d8ffaee` today | After (this branch) |
| --- | --- | --- | --- |
| Audit replay, `npx tsx tools/netaudit/hordeEncodings.ts 600` | 8.2 KB/s | 8.9 KB/s (0 mismatches) | **8.9 KB/s** (0 mismatches, keyframes 1.0/s) |
| Stampede, 180 in one view (`eventBandwidth.test.ts`, bound ≤ 15 KB/s) | 13.5 KB/s | passes | **passes** (unchanged test) |

The replay moved 8.2 → 8.9 KB/s on master between 8.10 and today (stories merged since: same 8.9 with and without this branch); this story adds 0 %: a phone that sends no ack (the replay, the harness, an old flow) gets exactly the 8.10 stream.

### Model test (`apps/server/src/net/hordeLineSkip.test.ts`, seeded)

130 zombies in 10 s rushes (1.2 × the 64 kbit/s line), 120 s per row: control without acks queues > 1.5 s; with the skip ≤ 1,000 ms on the 0.2 / 0.4 s rows and ≤ 1,100 ms on the 1 s row (its worst moment is a 1 s down stall followed by a 1 s up stall: 2 s with no new ack; the bot row reads 383 ms); 128 kbit/s and uncapped with 0.2 / 0.4 / 1 s stalls: 0 skips. Mutations: `HORDE_LINE_CONFIRM_MS = 0` fails the 128 kbit/s test (a stall's late ack skips); `HORDE_LINE_TREND_MAX = 0` fails the 64 kbit/s test (> 1,000 ms); removing any wiring line fails `tools/checks/hordeLineAckWiring.test.ts`.

### 8.8 / 8.9 numbers (AC 7)

The hits harness (`tools/netsim/hitsSim.ts`) and `smoothRun` drive the room without an ack, so the line skip never runs there: reversed hits and freezes are the same code path as master. Their tests pass unchanged (`npm run test:slow`, below).

## Dev Agent Record

### Agent Model Used

Builder session (cloud), 2026-11-26.

### Completion Notes List

- Decisions D1–D4 auto-accepted (designer 2026-11-26: follow recommendations); logged in `docs/network-pass-decisions.md`.
- **`NET_PROTOCOL_VERSION` 3 → 4** (the input gained bytes: an old tab is refused at join with "A new version is out. Please reload."). This story took 4: 12.2 / Epic 11 take 5 if they need one.
- The first build (no trend, no confirm) failed its own model test: a stall's single late ack skipped 8 frames at 128 kbit/s (→ the confirm rule, plus the gap rule for overlapping up + down stalls), and on a filling line the reading lagged by its own wait + the round trip (→ the trend). Both are pinned by mutations (Measurements › Model test).
- Existing tests changed only where the wire format or the stats object changed, not in what they check: `input.test.ts` (16 bytes, flag bit 4 is now the ack; fuzz re-encodes with the ack), `RunRoom.test.ts` (the "unknown flag bit" sample is 0x20, since 0x10 is the ack), `hordeEncoder.test.ts` (the 64 KB skip test's `toEqual` lists the two new stats fields at 0), `tools/bots/onePacket.test.ts` (title / comment: 18 B per input; it already used `INPUT_BYTES`). `smooth.test.ts`, the hits harness and the 8.10 fuzz decode are unchanged.
- Not verified: real phones, real 4G, iOS (parked); a browser tab on the capped line (the phone's ack is one line in `NetSimHost`, pinned by `tools/checks/hordeLineAckWiring.test.ts` and the client unit tests; the bots exercise the server end to end). The cap is the `lagLine.ts` model of a slow line; a real bottleneck's buffer may be larger or smaller (it does not matter to this rule: it reads the wait, not the socket).
- Gate: `npm run gate:fast` green (typecheck, lint, 4,912 unit tests, release check); `npm run test:slow` green (73 files, 740 tests: netsim, bots, fuzz, DOM).
- Bot horde KB/s move with what the bots see (± 30 % run to run, 8.11 B8); the encoder replay is the deterministic check (unchanged).

### File List

- `packages/shared/src/net/input.ts`, `input.test.ts`, `messages.ts`, `hordeFormat.ts`, `packages/shared/src/index.ts`
- `apps/server/src/net/hordeEncoder.ts`, `apps/server/src/net/hordeLineSkip.test.ts` (new), `apps/server/src/rooms/RunRoom.ts`
- `apps/client/src/sim/NetSimHost.ts`
- `tools/bots/botClient.ts`, `tools/bots/run.ts`
- docs: this file, `docs/perf/network-pass-2026-11.md`, `docs/perf/epic-2-network.md`, `docs/network-pass-decisions.md`, `docs/epic-8-story-decisions.md`, `_bmad-output/implementation-artifacts/deferred-work.md`, `sprint-status.yaml`

## Change Log

- 2026-11-26: story file created (gds-create-story) and built (gds-dev-story) in the builder session; status review.
