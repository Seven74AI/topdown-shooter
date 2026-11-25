---
baseline_commit: c9726a53
---

# Story 8.11: One packet per tick (optional)

Status: done

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

- [x] **T1 Before numbers** (brief 13): `lagLine` write/segment counters (add them if 8.8 didn't: count `write` calls and bytes per direction per second); bots on clean + lossy line; record down writes/s, up KB/s, patches/s, the patch-tick histogram (0/1/2 ticks per patch).
- [x] **T2 Patch from the tick** (AC 1, F3): `RunRoom.ts` `patchRate = null`, `broadcastPatch()` at the end of `onTick` (after `forwardEvents` and `sendHorde`, so the patch is last — or first, see D3), the lobby/results/frozen patch interval; check in `node_modules/@colyseus/core/build/Room.mjs` that a manual `broadcastPatch` with `patchRate = null` still sends the full state to new joiners and still flushes `afterNextPatch` messages; keep `slowPatches` timing.
- [x] **T3 One write** (AC 2): per client, cork the `ws` socket's underlying TCP socket (`client.ref._socket.cork()` / `uncork()` on `process.nextTick`, or the documented equivalent in `node_modules/ws`) around horde + events + patch; verify with `lagLine` that one tick = one segment burst (writes/s ≈ 20 + pings). If cork is not reachable cleanly, decision D2's alternative.
- [x] **T4 Binary input** (AC 3, F2): `packages/shared/src/net/input.ts` `encodeInput(input, out)` / `decodeInput(bytes, out)` (preallocated, no allocation per input), a `BYTES.INPUT` message type next to `BYTES.HORDE_FRAME`; server `RunRoom.onMessage(BYTES.INPUT, …)` through the same guard path as today (`this.net.guard` with the "input" bucket and `onInputRateDropped`; `apps/server/src/net/messageGuard.ts` needs a bytes variant), then `onInput`; client `NetSimHost.stepInputs` (`room.send(C2S.INPUT_SEND, buf)` at line ~722) → `room.sendBytes`; the dev throttle's outgoing queue copies the bytes (it copies the input object today: `Outgoing.input`); `tools/bots/botClient.ts:349`; `tools/netsim/hitsSim.ts` (encode → decode on the up link so the harness sees the quantised values). Remove `C2S.INPUT_SEND` and `playerInputSchema` from the wire path only when nothing else uses them (keep the type `PlayerInput`).
- [x] **T5 Tests** (F1–F3): round-trip encode/decode for random inputs (quantised values equal on both sides), boundary values (−1, 1, −1 viewTick, 2³¹), malformed (short, long, NaN-free by construction, out-of-range int8 impossible) refused and counted; prediction-vs-server error unchanged in `tools/netsim/predictionCircle.test.ts`; patch carries one tick (a server test watching patch ticks during a wave); lobby Ready still patches; replay digests unchanged.
- [x] **T6 After numbers + docs + gate + hand-back**: `docs/perf/network-pass-2026-11.md` § 8.11; `game-architecture.md` (patch from the tick; binary input); HANDOFF §4 netcode line.

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

Autonomous builder (gds-dev-story), 2026-11-25, branch `story-8-11` from master `c9726a5`.

### Debug Log References

- Colyseus 0.18.29 (`node_modules/@colyseus/core/build/Room.mjs`): `autoBatchMessages` wraps each `setFixedTimestep` callback in `batchMessages` (a cork window: `sendClientRaw` corks each client's socket on its first send, `#closeWindow` uncorks in a `finally`); the schema serializer's patches and `sendBytes`/`send` all go through `sendClientRaw`. `patchRate = null` with no simulation interval starts Colyseus's own `clock.tick()` interval (it would double-tick the clock the fixed timestep reads), so it is set right after `setFixedTimestep`. The timestep is never cleared, so it patches the lobby after a run and Results too. Byte messages arrive on `onMessageBytes` handlers (`_$b<type>`) as a Buffer subarray.
- An in-process lag line cannot see the corking (its reads run after the server's whole tick and coalesce 3 writes into 1 chunk: the first version of `onePacket.test.ts` passed with `autoBatchMessages` off). The test counts the server sockets' `_write`/`_writev` calls instead; the measurements use the separate-process server + line.
- netsim: with the quantised harness, `hits.test.ts` 20 Runners kiting clean read 5/436 (1.15 %, bound 1 %) and `smooth.test.ts` F4 Runners 2/218 (0.92 %, bound 0.5 %). 30 seeds (scratch script): float 41/4268 = 0.96 % and 23/2117 = 1.09 %, quantised 35/4266 = 0.82 % and 18/2124 = 0.85 %; aim normalisation alone identical to the original. → B3.

### Completion Notes List

- Story file written 2026-11-24 by the story writer (gds-create-story, non-interactive) from master da82847; decisions 8.11 D1–D4 accepted 2026-11-24 (recommended values: build it, cork, horde → events → patch, int8 sticks).
- **T1** before numbers: `tools/bots/wireMeter.ts` (bytes by kind, patches, ticks-per-patch histogram, input bytes) in `bot_wave.wire`; `tools/bots/run.ts` `bots_line_wave` (writes and wire bytes per phone per wave from the lag line). Measured on `c9726a5`'s server (table below).
- **T2** (AC 1, F3): `RunRoom.onTick` = `step()` (the old tick body) + `broadcastPatch()` in a `finally`; `LOBBY_PATCH_RATE_MS` 50 until the first run, `patchRate = null` after `setFixedTimestep`; `slow_patch` timing kept (`broadcastPatch` override). Tests: `apps/server/src/rooms/RunRoom.patch.test.ts > during a wave every patch is exactly one tick after the last (server and phone), after that tick's horde frame` (mutation: patch twice → fails), `… > outside the stepping phases (Results → Back to lobby) a Ready tap still reaches the other phone within 150 ms`; the 8.1 frozen room's `resumeIn` 3-2-1 patches: `apps/server/src/rooms/RunRoom.reconnect.test.ts > solo drop mid-wave: … back → 3-2-1 → ticking again` (green).
- **T3** (AC 2, D2/D3): `this.autoBatchMessages = true` (B1). Test: `tools/bots/onePacket.test.ts > mid-wave: ≤ 25 down writes per phone per s, one tick per patch, 16 B per input` (mutation: `autoBatchMessages = false` → 47.5 writes/s, fails).
- **T4** (AC 3, F2): `packages/shared/src/net/input.ts` `encodeInput`/`decodeInput`/`quantizeInput` (14 B, B5), `BYTES.INPUT` = 2, `NET_PROTOCOL_VERSION` 3, `C2S.INPUT_SEND` removed (B6); server `onMessageBytes(BYTES.INPUT, net.guard(bytesParser(decodeInput, …), …, "input", onInputRateDropped))` (`apps/server/src/net/messageGuard.ts › bytesParser`; rate-dropped bytes decoded for seq + edges); `NetSimHost.stepInputs` encodes, decodes back into `sendBuf` (prediction and fire clock use the quantised values), `room.sendBytes`; `NetRoomLike.sendBytes`; `DevThrottle.sendBytes` (pooled 14-byte copies, same ordered queue as `send`); `FakeRoom.sendBytes`/`inputsSent()`; bots `encodeInput` + `sendBytes`; `tools/netsim/hitsSim.ts` normalises the aim (as the phone's InputRouter) and quantises through the codec (`quantizeInput` option, default on; B3). Epic 6 check (brief 22): the vote, crate and lever messages are their own C2S messages (unchanged); no edge flag beyond swap/consumable rides the input.
- **T5** tests: `packages/shared/src/net/input.test.ts > Story 8.11 binary input …` (round trip of 5000 random inputs + quantise idempotent; boundaries ±1, viewTick −1/0/2³¹, seq 0/2³²−1; encoder clamps; refusals: every length 0–32 but 14, format byte, −128 per stick, flag bits 4–7, viewTick u32 > 2³¹+1; 20 000-case fuzz: never throws, every accepted decode passes `playerInputSchema` and re-encodes to the same bytes; Buffer-subarray offsets); `apps/server/src/net/messageGuard.test.ts > Story 8.11 (F2): the binary input through bytesParser …`; `apps/server/src/rooms/RunRoom.test.ts > drops an invalid binary input and keeps the client connected (Story 8.11 F2)` (short, long, −128, extra flag, old msgpack type → `invalid` ×4 counted + `unknown_type`), `> closes only the client that sends a message over 1 KB` (now a 2 KB binary input); `apps/client/src/net/devThrottle.test.ts > holds outgoing sends half the lag, copied at send time (Story 8.11 …)`; `apps/client/src/sim/NetSimHost.test.ts > NetSimHost: Story 8.11 binary input … > sends 14-byte BYTES.INPUT frames and predicts with exactly the quantised values the server decodes` (wiring, brief 26: deleting the decode-back fails it); prediction error unchanged: `tools/netsim/predictionCircle.test.ts` green unchanged; version refusal: `apps/server/src/rooms/RunRoom.test.ts > Story 8.10 (F5, brief 19): a client with another wire format is refused at join as update_required …` (now refuses v2); replay digests: `packages/shared/src/replay/**` green unchanged.
- **T6**: `docs/perf/network-pass-2026-11.md § 8.11`, `game-architecture.md` (one packet per tick, binary input, naming row), HANDOFF §4 netcode line and the 8.10 B6 note (B2), `docs/network-pass-decisions.md` 8.11 B1–B8.
- **F1**: no simulation code changed; every unit test, replay digest, netsim, netaudit and bot test green; the only test changes are the input's transport (bytes instead of `input.send`), one exact stick value now asserted at its 1/127 step (`NetSimHost.consumables.test.ts`), and the two clean-line netsim rows' paired control (B3).

**Measurements** (4 bots, net150, waves 4–5, `--lag 150 --jitter 20` (+ `--loss 1`), load 0.1–0.8; full table `docs/perf/network-pass-2026-11.md § 8.11`):

| Metric | Line | Before (`c9726a5`) | After | Target |
| --- | --- | --- | --- | --- |
| Down writes per phone per s | clean | 46.0–46.5 | **20.1–20.3** | ≤ 25 ✓ |
| | lossy | 47.0 | **20.2–20.3** | ≤ 25 ✓ |
| Input upload payload KB/s | clean / lossy | 2.28–2.38 | **0.31** | ≤ 0.6 ✓ |
| Patches per s / ticks per patch | clean | 19.87–19.94 / 0–2 (5–12 two-tick patches per wave) | **20.0 / exactly 1** | 20 / 1 ✓ |
| | lossy | 19.88–19.92 / 0–2 (6–9) | **20.0 / exactly 1** | ✓ |
| Horde stream (deterministic audit replay) | — | 8.2 KB/s | **8.2 KB/s**, 0 mismatches | ± 2 % ✓ (B8) |
| Server tick avg / max | — | 1.26–1.30 / 3.1–8.7 ms | 0.87–1.02 / 2.5–5.2 ms | ≤ +0.1 ms ✓ |
| Estimated 4G wire saving | — | — | down ≈ 2.0 KB/s (26 segments/s × ~78 B), up −2.0 KB/s payload | estimate (H4) |

**Decisions logged (auto-accepted, autonomous build; `docs/network-pass-decisions.md`):** 8.11 B1 (Colyseus `autoBatchMessages` = the cork), B2 (8.10 B6's RTT skip stays owed: not in this story), B3 (netsim clean-line rows: float-input paired control + 1 shot), B4 (no extra patch timer: the timestep patches idle phases), B5 (14-byte layout), B6 (old `input.send` removed), B7 (catch-up: one patch per step, one write per callback), B8 (± 2 % shown deterministically; write-count method).

**PR #19 review (APPROVED, 1 low + 4 nits; main session checks the fixes):** L — the ping was stamped before the corked step and patch (≈ 1–5 ms RTT bias): the timer now only marks it due and `onTick` sends it after the patch (`RunRoom.patch.test.ts > PR #19 review L: the 1/s ping is sent and stamped after the step and the patch …`; mutation ping-before-step fails); nit — the patch's own try/catch logs `patch_failed` and never hides the step error (`… > PR #19 review nit: a patch error is logged on its own …`); nit — rate-dropped binary input carries its swap (`… > a binary input the 25/s bucket dropped still carries its swap …`; mutation raw bytes fails); nit — hits/smooth test titles match B3; B9 mouse aim accepted.

**Not verified:** real phones, real 4G, iOS Safari, Cloudflare's own coalescing (the wire saving is an estimate); the per-segment radio overhead (~78 B) is the audit's number, not measured here.

**Gate:** see the Change Log line of the hand-back (gate:fast on the branch head; the PR's CI `gate` is the full gate).

### File List

- `apps/server/src/rooms/RunRoom.ts` (patch from the tick, `autoBatchMessages`, binary input handler)
- `apps/server/src/net/messageGuard.ts` (`bytesParser`), `apps/server/src/net/limits.ts` (comment), `apps/server/src/run/RunController.ts` (comment)
- `apps/server/src/test/sendInput.ts` (new: test helper)
- `apps/server/src/rooms/RunRoom.patch.test.ts` (new), `RunRoom.test.ts`, `RunRoom.fight.test.ts`, `RunRoom.reconnect.test.ts`, `RunRoom.downed.test.ts`, `RunRoom.buildings.test.ts`, `RunRoom.account.test.ts`, `apps/server/src/net/messageGuard.test.ts`
- `packages/shared/src/net/input.ts`, `input.test.ts`, `messages.ts`, `messages.test.ts`, `packages/shared/src/index.ts`
- `apps/client/src/sim/NetSimHost.ts`, `apps/client/src/net/session.ts`, `apps/client/src/net/devThrottle.ts`, `apps/client/src/net/fakeRoom.ts`
- `apps/client/src/sim/NetSimHost.test.ts`, `NetSimHost.consumables.test.ts`, `NetSimHost.economy.test.ts`, `NetSimHost.reconnect.test.ts`, `apps/client/src/net/devThrottle.test.ts`, `apps/client/src/input/menuInput.test.ts`
- `tools/bots/botClient.ts`, `tools/bots/run.ts`, `tools/bots/wireMeter.ts` (new), `tools/bots/onePacket.test.ts` (new)
- `tools/netsim/hitsSim.ts`, `tools/netsim/hits.test.ts`, `tools/netsim/smooth.test.ts`
- `docs/perf/network-pass-2026-11.md`, `docs/network-pass-decisions.md`, `_bmad-output/planning-artifacts/game-architecture.md`, `HANDOFF.md`, this story file, `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-11-24: story file created (ready-for-dev, decisions pending).
- 2026-11-25: built (autonomous, gds-dev-story): patch from the tick, one write per tick, 14-byte binary input (`NET_PROTOCOL_VERSION` 3); before/after measured; decisions 8.11 B1–B8 auto-accepted; status → review.
- 2026-11-25: PR #19 review fixes (L ping stamp after the patch; patch error logged alone; rate-drop swap test; test titles; B9).
- 2026-11-25: PR #19 CI fix: `saveResume.test.ts` holds the bots' Ready in the save build (B10: a test race the prompter patch exposed).
