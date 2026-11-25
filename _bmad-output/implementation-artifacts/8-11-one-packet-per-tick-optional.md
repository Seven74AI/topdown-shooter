# Story 8.11: One packet per tick (optional)

Status: ready-for-dev

<!-- Network pass story 5 of 5, optional (designer 2026-11-24). Story file 2026-11-24 from the real code on master da82847; decisions pending (docs/network-pass-decisions.md). -->

## Story

As a player on mobile data,
I want each server tick to arrive as one packet,
so that less of my data and battery goes on packet overhead.

> **NETWORK PASS BRIEF** (`docs/network-pass-brief.md`): paste it verbatim into the builder and reviewer prompts. Most relevant here: 2 (the input message's copies), 3/4, 5 (no sim change), 11 (Colyseus internals: check 0.18.29 in node_modules), 13/14 (before/after, lossy line), 17, **18 (the binary input is validated as strictly as the zod schema)**, **19 (versioned input format)**, 20 (bots and the harness send the same binary input).

## Acceptance Criteria

### Fairness / player-visible rule (brief 3; each is a test)

- **F1 "Nothing about play changes."** Same inputs in → same World out: the replay digest tests, every sim, netsim and bot test pass unchanged (only byte and write counts move).
- **F2 "A cheater can't sneak more through the smaller input."** The binary input is checked exactly like today's schema (seq integer ≥ 0, sticks in [-1, 1], booleans, `viewTick` −1…2³¹, nothing extra): a malformed or over-long input is refused and counted like a refused schema message today, and the 25/s input bucket is unchanged.
- **F3 "Every patch is one tick."** Each state patch carries exactly the changes of one tick (never 0 or 2), so the phone's clock and delay (Story 8.9) are fed one clean sample per tick.

### Behaviour

1. **Patch from the tick.** `this.patchRate = null` (`RunRoom.ts:276`; `PATCH_RATE_MS` 50 removed) and `onTick` calls `this.broadcastPatch()` itself after `syncState`, events and horde (Colyseus 0.18 supports a manual patch: `Room.d.ts:182-187, 774`); outside the stepping phases (lobby, results; a frozen room from 8.1) the room still patches on changes at ≤ 20 Hz (a small `clock.setInterval` that patches only when not ticking), so lobby Ready flags and Results still arrive. `slow_patch` timing is kept (`broadcastPatch` override, `RunRoom.ts:820-827`).
2. **One write per tick.** The tick's horde frame, `sim.events_flushed` and the patch leave the server as **one TCP write** per client (decision 8.11 D2: socket cork/uncork around the per-tick sends, recommended; or Colyseus's `afterNextPatch` grouping if it gives one write); message boundaries and types on the wire are unchanged (the phone's decoder doesn't change).
3. **Compact binary input.** `input.send` becomes a binary message of **≈ 14 B** (seq u32, move/aim as int8 × 127 or int16, flag bits fire/swap/consumable/isMouse, `viewTick` i32 hundredths) instead of the ~116 B msgpack map with names and float64 sticks (`packages/shared/src/net/input.ts`). Encoded and decoded by shared functions (`encodeInput`/`decodeInput`) used by `NetSimHost`, the bots, the hits harness and the server; the server validates the decoded values against the same rules as `playerInputSchema` (F2). Stick quantisation is applied on the client **before** prediction, so the predicted and server moves use identical values (no new prediction error). Format versioned with 8.10's `NET_PROTOCOL_VERSION` (bump it).
4. **Numbers (the `epics.md` ACs).** 4 bots through the lossy-line proxy (8.8 `lagLine`, which counts writes/segments per direction), wave 4–5:
   - down writes per phone **≤ 25/s** (before 44–49/s);
   - input upload **≤ 0.6 KB/s** payload (before 2.1–2.5 KB/s);
   - patches per second = ticks per second (± 1 %), each patch's tick = previous + 1 during a wave (F3);
   - nothing else changes: the same test suite green, horde/event bytes unchanged within ± 2 %.
5. **Estimated wire saving** (record, not asserted): ≈ 1.5–2 KB/s less down on the 4G wire from ~23 fewer segments/s × ~78 B overhead (audit §3.6, H4; Cloudflare may coalesce some already).

## Tasks / Subtasks

- [ ] **T1 Before numbers** (brief 13): `lagLine` write/segment counters (add them if 8.8 didn't: count `write` calls and bytes per direction per second); bots on clean + lossy line; record down writes/s, up KB/s, patches/s, the patch-tick histogram (0/1/2 ticks per patch).
- [ ] **T2 Patch from the tick** (AC 1, F3): `RunRoom.ts` `patchRate = null`, `broadcastPatch()` at the end of `onTick` (after `forwardEvents` and `sendHorde`, so the patch is last — or first, see D3), the lobby/results/frozen patch interval; check in `node_modules/@colyseus/core/build/Room.mjs` that a manual `broadcastPatch` with `patchRate = null` still sends the full state to new joiners and still flushes `afterNextPatch` messages; keep `slowPatches` timing.
- [ ] **T3 One write** (AC 2): per client, cork the `ws` socket's underlying TCP socket (`client.ref._socket.cork()` / `uncork()` on `process.nextTick`, or the documented equivalent in `node_modules/ws`) around horde + events + patch; verify with `lagLine` that one tick = one segment burst (writes/s ≈ 20 + pings). If cork is not reachable cleanly, decision D2's alternative.
- [ ] **T4 Binary input** (AC 3, F2): `packages/shared/src/net/input.ts` `encodeInput(input, out)` / `decodeInput(bytes, out)` (preallocated, no allocation per input), a `BYTES.INPUT` message type next to `BYTES.HORDE_FRAME`; server `RunRoom.onMessage(BYTES.INPUT, …)` through the same guard path as today (`this.net.guard` with the "input" bucket and `onInputRateDropped`; `apps/server/src/net/messageGuard.ts` needs a bytes variant), then `onInput`; client `NetSimHost.stepInputs` (`room.send(C2S.INPUT_SEND, buf)` at line ~722) → `room.sendBytes`; the dev throttle's outgoing queue copies the bytes (it copies the input object today: `Outgoing.input`); `tools/bots/botClient.ts:349`; `tools/netsim/hitsSim.ts` (encode → decode on the up link so the harness sees the quantised values). Remove `C2S.INPUT_SEND` and `playerInputSchema` from the wire path only when nothing else uses them (keep the type `PlayerInput`).
- [ ] **T5 Tests** (F1–F3): round-trip encode/decode for random inputs (quantised values equal on both sides), boundary values (−1, 1, −1 viewTick, 2³¹), malformed (short, long, NaN-free by construction, out-of-range int8 impossible) refused and counted; prediction-vs-server error unchanged in `tools/netsim/predictionCircle.test.ts`; patch carries one tick (a server test watching patch ticks during a wave); lobby Ready still patches; replay digests unchanged.
- [ ] **T6 After numbers + docs + gate + hand-back**: `docs/perf/network-pass-2026-11.md` § 8.11; `game-architecture.md` (patch from the tick; binary input); HANDOFF §4 netcode line.

## Dev Notes

### Current state (read before changing)

- **Three writes per tick per client** (audit §3.3, F6): the horde frame (`sendHorde`, in `onTick`), `sim.events_flushed` (`forwardEvents`, in `onTick`, `RunRoom.ts:929-955`) and the patch on Colyseus's own 50 ms interval (`this.patchRate = PATCH_RATE_MS`, `RunRoom.ts:155,276`), not tied to the fixed-timestep tick (`setFixedTimestep`, `RunRoom.ts:736`), so a patch carries 0 or 2 ticks now and then. Each message is its own TCP write (`ws` sets `TCP_NODELAY`: `node_modules/ws/lib/websocket.js:269`). Measured: ≈ 46–49 down messages/s → 44–49 writes/s; up 21 writes/s.
- **`broadcastPatch` override** (`RunRoom.ts:820-827`) times the patch for `slow_patch` logs. Colyseus 0.18.29 `Room.d.ts`: `patchRate: number | null` (`:187`), `broadcastPatch(): boolean` (`:774`), `afterNextPatch` broadcasts flushed right after the patch (`_flushAfterPatchBroadcasts`).
- **Input today** (`packages/shared/src/net/input.ts:7-31`): zod `playerInputSchema` (strict object: seq, moveX/Y, aimX/Y, fire, swap, consumable, isMouse, viewTick in hundredths), msgpack-encoded by the SDK as a map with key names (~64 B of names) and float64 sticks ≈ 116 B. Server: `this.net.guard(playerInputSchema, …, "input", onInputRateDropped)` (`RunRoom.ts:281-283`); guard buckets in `apps/server/src/net/limits.ts` / `messageGuard.ts` (input 25/s, other 10/s, ghosts 5/s; excess dropped silently). `RunController.queueInput` copies the fields (`validAim` clamps).
- **Client send** `NetSimHost.stepInputs` (`NetSimHost.ts:701-738`) reuses one `sendBuf` ("encoded synchronously: the buffer can be reused").
- **Ping** 1/s `net.pinged` and the pong: unchanged (they're 1 write each per second).

### What must be preserved

- Message types and order the phone sees (horde, events, patch) and every decoder; the 2.4 early-event buffering; the 2.5 "skip, never queue" horde rule.
- The input rules: one input per tick applied, seq + 1 only (2.12 re-review M-A), resync after 20 refused, latched edge flags (EPIC 6 brief 30), weapon debt.
- Lobby and Results still update promptly (Ready flags, names, host, Back to lobby).
- 8.1's frozen room: no ticks, but the `frozen`/`resumeIn` fields must still reach phones (the idle patch interval of AC 1).

### Decisions to confirm (designer: "ok" or by code; recommended value first)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 8.11 D1 | Build this optional story now | **Yes, last in the pass, if 8.8–8.10 left time; it's small and makes 8.9's clock cleaner** (skip until Epic 10 polish: the game is within budget without it) |
| 8.11 D2 | How the tick's three messages become one packet | **Hold the socket for one tick and send once (cork)** — nothing about the messages changes (pack them into one new combined message: needs a new decoder on the phone) |
| 8.11 D3 | Order inside the packet | **Horde, events, then patch** (as today within a tick) (patch first) |
| 8.11 D4 | How exact your stick is on the wire | **1/127 steps (int8)** — far finer than a thumb, and the phone predicts with the same value (1/32767, int16: +4 B per input) |

### Beat the rule (reviewer start list; brief 4)

1. Send a 13-byte or 15-byte input, a stick value of −128, a seq that wraps u32: refused or clamped exactly like the schema? Counted?
2. Send binary inputs faster than 25/s: the bucket still drops them silently; no speed-up.
3. Mixed old/new client (stale tab): refused at join by the bumped `NET_PROTOCOL_VERSION`.
4. Does a manual patch ever carry 2 ticks (a catch-up step: `setFixedTimestep` runs up to 5 steps in one callback)? If so, patch after each step (F3) or document the catch-up exception.
5. Lobby with `patchRate = null`: does a Ready tap still reach the others within 100 ms?
6. Cork never uncorked (an exception mid-tick): does the socket stall? (`try/finally` around the tick's sends.)
7. Mutate: patch twice per tick → the one-tick test fails; skip validation of `viewTick` → F2 test fails.

### Measurements (brief 13) — fill in

| Metric (4 bots, wave 4–5) | Line | Before | After target |
| --- | --- | --- | --- |
| Down writes per phone per s | clean | 44–49 | ≤ 25 |
| | lossy | record | ≤ 25 |
| Input upload payload KB/s | clean | 2.1–2.5 | ≤ 0.6 |
| Patches per s / ticks per patch | clean | ~19.7 / 0–2 | 20 / exactly 1 |
| Horde + events KB/s | clean | record | ± 2 % |
| Server tick p99 | — | record | ≤ +0.1 ms |
| Estimated 4G wire saving (down) | — | — | ≈ 1.5–2 KB/s (estimate, H4) |

### Files (expected)

- `apps/server/src/rooms/RunRoom.ts`, `apps/server/src/net/messageGuard.ts` (+ test), `apps/server/src/net/limits.ts` (unchanged buckets)
- `packages/shared/src/net/input.ts` (+ test), `packages/shared/src/net/messages.ts` (`BYTES.INPUT`, `NET_PROTOCOL_VERSION` bump), `packages/shared/src/index.ts`
- `apps/client/src/sim/NetSimHost.ts` (send), `apps/client/src/net/devThrottle.ts` (outgoing bytes), `apps/client/src/net/fakeRoom.ts`
- `tools/bots/botClient.ts`, `tools/netsim/hitsSim.ts`, `tools/netaudit/lagLine.ts` (write counters)

### Epic 6: check at build time (brief 22)

- New C2S messages from 6.8–6.12 (lever shots are inputs; the vote may be a message): they stay as they are (only `input.send` changes); if the vote rides the input (an edge flag), add its bit to the binary form and latch it (EPIC 6 brief 30).
- New phases (vote, endless) must step and patch like waves; the idle patch interval covers non-ticking phases.

### Notes for the merge (brief 12)

- `RunRoom.ts`: last in the pass: on top of 8.1 (hold, freeze gate in `onTick`) and 8.10 (per-client horde state in `sendHorde`).
- `NetSimHost.ts`: `stepInputs` (8.9 pacing, 8.1 send gate) → only the `room.send` line changes.

### Dependencies

Any time after 8.8; best after 8.1 and 8.10 (same `RunRoom.ts` regions). Optional: the Network pass is complete without it.

### Suggested build round

Round 3 (alone). Effort S–M. Light-to-full review: the input validation part gets the full "beat the rule".

### References

- `docs/perf/network-audit-2026-11.md` §2 (steps 4–5), §3.3 (streams, writes), §3.6 (wire overhead), F6, F11, H4, §6 #7, #8
- `_bmad-output/planning-artifacts/epics.md` › Story 8.11; Story 2.4 (input queue, guard), Story 2.12 (seq rule)
- `docs/network-pass-brief.md`, `docs/network-pass-decisions.md`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Story file written 2026-11-24 by the story writer (gds-create-story, non-interactive) from master da82847; decisions 8.11 D1–D4 pending.

### File List

## Change Log

- 2026-11-24: story file created (ready-for-dev, decisions pending).
