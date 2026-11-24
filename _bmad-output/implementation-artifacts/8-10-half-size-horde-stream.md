# Story 8.10: Half-size horde stream

Status: ready-for-dev

<!-- Network pass story 4 of 5 (designer 2026-11-24). Story file 2026-11-24 from the real code on master da82847; decisions pending (docs/network-pass-decisions.md). Closes Epic 6 decision 6.8 B1 ("accept the stampede's 28.2 KB/s until Story 8.10"). -->

## Story

As a player on mobile data,
I want the zombie stream to use half the data,
so that big hordes, the stampede and the boss all fit on 4G.

> **NETWORK PASS BRIEF** (`docs/network-pass-brief.md`): paste it verbatim into the builder and reviewer prompts. Most relevant here: **2 (the wire-format copy list)**, 3/4, 5 (no sim change), 6 (frames really decoded, keyframes really sent), 7 (no per-tick/per-frame allocation in encoder or decoder), 8 (horde budget), 9 (late scene start, hidden tab, reconnect), 13/14 (before/after on the clean and lossy lines), 17, **19 (versioned format, round-trip and fuzz tests, bad frames dropped and counted)**, **20 (bots, throttle and harness use the same decoder)**, 22 (6.8 stampede is in the stream).

## Acceptance Criteria

### Fairness / player-visible rule (brief 3; each is a test)

- **F1 "Every zombie that can bite me is where the server says, every tick."** Zombies within **8 m** of my survivor (or of the teammate I spectate when out) are refreshed every tick (20 Hz) exactly as today; only zombies farther away are refreshed every 2nd tick (decision 8.10 D1). Every zombie in view stays on screen (EPIC 6 decision 6.8 B1: "never hide a zombie that can bite").
- **F2 "What I see is what a full frame would show."** After decoding, every zombie's position is within **1 cm** of what today's full frame would give for the same tick (refreshed zombies) or of its last refresh (far zombies between refreshes), its type, state and burning bit exact; a decoding mistake can never last longer than **1 s** (full keyframe at least once a second).
- **F3 "Rush markers and edge arrows still work."** Every rusher (last-5 rule) is in every frame's set as today, near or far.
- **F4 "Facing looks right."** A moving zombie faces where it moves (heading worked out on the phone); a zombie that stands still keeps its last facing, and a standing zombie that turns (a Spitter aiming, a Brute wind-up, the Behemoth's telegraphs use their own events) still turns on screen (heading sent only then: decision 8.10 D3).
- **F5 "A stale tab is told to reload, not shown garbage."** A client with the old format is refused at join with "A new version is out. Please reload." (`update_required`).

### Behaviour

1. **Delta frames.** Per client the encoder keeps the set of zombies (by net id = slot + generation) and the positions/states it last **sent** to that client (safe on ordered WebSocket: the phone always has the previous frame; no acks, audit §3.4). Each tick a frame carries, after the header (tick u32, kind/flags u8, counts):
   - **new** zombies (net id not in the previous set, or a new generation in the slot): a full 8 B record (today's layout);
   - **changed** zombies: slot (u8) + change mask (u8) + `dx, dy` as int8 cm when the move fits ±1.27 m, else full u16 x/y; + heading u8 only when it changed while standing (F4) ; + typeState u8 only when it changed;
   - **unchanged** zombies: nothing;
   - **left** (out of view, dead, slot reused): slot (u8).
   The exact byte layout is the builder's (document it in `hordeFormat.ts` like today's table); the audit's measured model (`tools/netaudit/hordeEncodings.ts`, encodings B–D) is the reference.
2. **Heading on the phone.** The decoder derives heading from each zombie's move between its last two refreshes (`quantizeHeading`, `HEADING_MIN_MOVE_M` as the server uses today, `hordeEncoder.ts:24`), kept when it doesn't move; the server sends a heading byte only for a standing zombie whose heading changed (F4).
3. **Far zombies at 10 Hz.** Zombies farther than **8 m** from the view centre (`viewTargetFor`) are refreshed on alternate ticks by slot parity (half of them each tick, so frame sizes stay even); between refreshes they are "unchanged" in the frame; the phone interpolates them between their own refresh ticks (the buffer keeps a per-slot last-refresh tick), not tick by tick, so they glide instead of stepping.
4. **Keyframes.** A full frame (every zombie in the set as a full record; flag in the header) on: the first frame to a client (join, **reconnect** from Story 8.1, a late Game scene start), after any skipped frame for that client (backpressure), when the delta would not be smaller than the keyframe, and every **20 ticks (1 s)** per client, staggered by client so they don't all land on the same tick (decision 8.10 D2).
5. **Decoding lives with the connection, not the scene.** The stateful decoder runs in `RunInbox` (`apps/client/src/net/session.ts`) from the join, so frames that arrive before the Game scene starts (today dropped and counted in `earlyHordeDropped`) still update the baseline; the scene's `onHorde` sink receives fully decoded frames (decision 8.10 D4). The dev throttle holds and delivers raw bytes in order (it already keeps order), so it is unaffected apart from the max frame size.
6. **Version.** `NET_PROTOCOL_VERSION` (shared constant) in the join options, checked in `onAuth` next to `balanceVersion` / `mapVersion`; mismatch → `ServerError(526, "update_required")`, client text F5 (`joinErrors.ts`).
7. **Numbers (the `epics.md` ACs).**
   - Audit replay (`tools/netaudit/hordeEncodings.ts` reworked to run the REAL new encoder; 600 ticks, 150 alive, ~118 in view): horde stream **≤ 10 KB/s** per phone (before 18.6 KB/s; model D: 6.5).
   - Worst case **180 in one view** (stampede, Story 6.8): **≤ 15 KB/s** (before 28.2 KB/s, over the 24 KB/s budget); the 6.8 bandwidth test's "Story 8.10 owes this" bound (≤ 28.5 KB/s) is tightened to **≤ 15 KB/s** and the note removed; `docs/epic-6-decisions.md` › 6.8 B1 gets "closed by Story 8.10 (measured X KB/s)".
   - Bots, 4 players, wave 4–5 (`--scenario net150 --hold-fire 45`), clean and lossy line: horde KB/s per phone before/after (before 4.2–9.1); keyframes ≈ 1/s per client; `framesSkipped` recorded.
   - The brief's horde budget becomes the new measured worst case + 20 % margin (record the number in `docs/network-pass-brief.md` line 8 and `game-architecture.md`).
8. **Backpressure measurement (audit #9, F12).** With a bandwidth-capped line (8.8's `lagLine` gains `--kbps`), log `framesSkipped` against stall length (0.2, 0.4, 1 s stalls at 64 and 128 kbit/s) and record the table in the story; change `HORDE_BACKPRESSURE_BYTES` (64 KB) only if stale frames really pile up (and then: skip → keyframe, AC 4).
9. **Overlay.** `?debug=1` `horde N/s` still counts frames; add `· key 1.0/s · err 0` (keyframes received, decode errors).

## Tasks / Subtasks

- [ ] **T1 Before numbers** (brief 13): `npx tsx tools/netaudit/hordeEncodings.ts 600` on master (encoding A = today: 18.6 KB/s at ~118); bots clean + lossy (8.8 line); the worst-case 150/180-in-view computation; record load.
- [ ] **T2 Format** (AC 1–4, 6; brief 19): in `packages/shared/src/net/hordeFormat.ts` the new frame kinds (key / delta), writer helpers and a **stateful, preallocated** `HordeStreamDecoder` (per connection: `lastNetId`, `x`, `y`, `heading`, `typeState`, `lastRefreshTick` per slot, 256 slots) that reads a frame and calls the existing `HordeSink` (`begin/record/end`) with **full** records (so `hordeBuffer.ts` keeps its API). Invalid frame → returns false, counts, keeps the baseline, and the next keyframe heals it. `NET_PROTOCOL_VERSION` constant + join schema field (`packages/shared/src/net/messages.ts` `joinOptions`).
- [ ] **T3 Encoder** (AC 1, 3, 4): `apps/server/src/net/hordeEncoder.ts` keeps `prepare(world)` (grid, headings, rushers) and gains per-client state (`HordeClientState`: last-sent arrays per slot, ticks since keyframe, `needsKey`); `send()` marks `needsKey` on a skip; `RunRoom.sendHorde` (`RunRoom.ts:841-855`) creates/destroys per-client state on join/leave/(8.1) reconnect and passes the view centre for the 8 m rule. Preallocated, zero allocation per tick (assert with a heap-delta test like the existing encoder tests if they do; at least no `new` in `send`).
- [ ] **T4 Client** (AC 5): `RunInbox.receiveHorde` decodes with the stream decoder from the join; `onHorde` hands decoded frames (or the sink receives the decoder's `HordeSink` calls directly); `HordeDecoder` (`apps/client/src/net/hordeDecoder.ts`) keeps `framesReceived`, `decodeErrors`, `staleFrames` and adds `keyframes`. **Stale-frame drop** (`hordeDecoder.ts:27`: tick ≤ latest held → dropped) must not break the chain: duplicates can't happen on an ordered socket, so a stale delta means the stream is broken → count it and wait for the next keyframe (don't apply).
- [ ] **T5 Buffer** (AC 3; coordinate with 8.9): `apps/client/src/net/hordeBuffer.ts` interpolates far zombies between their own refresh ticks (per-slot `lastRefreshTick` from the decoder); keep 8.9's missing-by-time rule; a "left" record is an explicit removal (the missing rule stays as the safety net for keyframe gaps).
- [ ] **T6 Every copy** (brief 2, 20): `tools/bots/botClient.ts:226` (`readHordeFrame` → the stream decoder; bots also send `NET_PROTOCOL_VERSION`); `apps/client/src/net/devThrottle.ts` / `netConfig.ts` `THROTTLE_BYTES_MAX` (2054 = the keyframe max: still the max if AC 4's "delta not smaller → keyframe" rule holds; assert it); `tools/netaudit/lagProxy.ts` stream report (it counts horde bytes by message type: still fine); `tools/netaudit/hordeEncodings.ts` measures the real encoder (keep A–E as a comparison or reduce to before/after); `tools/netsim/*` that read horde frames (grep `readHordeFrame`).
- [ ] **T7 Tests** (F1–F5; brief 6, 19): round-trip (`hordeFormat.test.ts`): encoder → decoder over a long real replay (`RunController` on Downtown, 150 alive, 4 players walking, 2,000 ticks, spawns/kills/slot reuse/burning/state changes) equals today's full frame per tick within 1 cm (far zombies: equal at their refresh ticks); fuzz: random bytes, truncated frames, a dropped frame mid-stream → no throw, errors counted, healed by the next keyframe; keyframe at join / after skip / every 20 ticks; the 8 m rule (a zombie at 7.9 m every tick, at 8.1 m every 2nd); rushers always present; F4 standing-turn heading; version refusal (`bootTestServer()`); a late Game scene start and a hidden-tab wake decode correctly; the 6.8 bandwidth test tightened.
- [ ] **T8 Backpressure measurement** (AC 8): `lagLine` `--kbps`; table in the story.
- [ ] **T9 After numbers + docs + gate + hand-back**: `docs/perf/network-pass-2026-11.md` § 8.10; `game-architecture.md` horde-stream line (budget, format); `docs/network-pass-brief.md` line 8 budget; `docs/epic-6-decisions.md` 6.8 B1 closed; HANDOFF §2 "Zombies streamed in binary (2.5, ~24 KB/s…)" → the new number.

## Dev Notes

### Current state (read before changing)

- **Format today** (`packages/shared/src/net/hordeFormat.ts`, 131 lines): header 6 B (tick u32, count u16) + 8 B per zombie (net id u16 = slot | generation << 8, x/y u16 cm from the map origin, heading u8, typeState u8 = type nibble | state 3 bits | burning bit). Empty frames (6 B) are sent too (the client counts misses with them). `HORDE_MAX_RECORDS` 256, `HORDE_VIEW_MARGIN_M` 4, `HORDE_BACKPRESSURE_BYTES` 64 KB, `HORDE_MISSING_LIMIT` 3 (8.9 turns it into ticks). `readHordeFrame` reads without allocating.
- **Encoder** (`apps/server/src/net/hordeEncoder.ts`, 155 lines): one per room; `prepare(world)` rebuilds the zombie grid, derives headings from `prevX/prevY` movement (`HEADING_MIN_MOVE_M` 1e-4), lists rushers; `encode(world, px, py)` = `queryRect` of the view + margin + every rusher; `send()` skips a client that isn't `ClientState.JOINED` or whose `bufferedAmount` > 64 KB (counts `framesSkipped`), else `sendBytes(BYTES.HORDE_FRAME, frame)` (Colyseus copies the payload). Stats → `horde_stats` log per wave.
- **Room** (`RunRoom.ts:841-855` `sendHorde`): `horde.prepare(world)` once, then per client the view target (`viewTargetFor`: own survivor or the spectated teammate when out).
- **Client**: `RunInbox` (`session.ts:242,420`) listens from the join and **drops frames until the Game scene's `onHorde`** (`earlyHordeDropped`); `NetSimHost.ts:312` → `HordeDecoder.receive` (`hordeDecoder.ts`: validates length, drops tick ≤ latest as stale, `readHordeFrame` into `HordeBuffer`). `HordeBuffer` (`hordeBuffer.ts`, 280 lines): ring of frames, `sample(renderTick)` interpolates per slot between the two frames around the render tick, holds past the newest, missing-3 rule, `markDead` on kill events, pending kills.
- **Bots** decode with `readHordeFrame` directly (`tools/bots/botClient.ts:226`).
- **Dev throttle** holds binary frames in pooled `THROTTLE_BYTES_MAX` (2054 B = 6 + 8 × 256) buffers, in order.
- **Measured** (audit §3.2–3.4): horde 4.2–9.1 KB/s with bots (26–57 per frame: bots spread out), 18.6 KB/s on the replay at ~118 in view, 23.6 KB/s computed at 150 in view, 28.2 KB/s at 180 (stampede). Delta B 10.6, C (no heading) 8.9, D (far at 10 Hz) 6.5 KB/s; keyframe every ~1 s ≈ +5 %.
- **Why no acks:** WebSocket is reliable and ordered; "the previous frame sent" is always the one the phone has, unless the server skipped it (then `needsKey`). The only places a frame can vanish on the phone side are the early-drop in `RunInbox` (moved: AC 5) and the stale-tick drop (T4).

### What must be preserved

- Interest rule (view + 4 m margin + every rusher), the JOINED gate, "skip, never queue" backpressure.
- `HordeSink` API and `HordeBuffer` behaviour for near zombies (20 Hz interpolation), kills hiding zombies at once (`markDead`), events lining up with their zombie.
- Story 2.10 overlay counts (`horde N/s`), `horde_stats` log fields (add `keyframes`, keep the others).
- Solo: no stream (LocalSimHost draws the World directly).
- Simulation: no change (brief 5). Turrets, aim assist and fog (EPIC 6 brief 26) read the mirror World the buffer fills: far zombies at 10 Hz only affect drawing, never server rules (the server's aim/turret logic uses its own World). Check client-side cosmetic copies that use far zombie positions (cosmetic turret shots, `cosmeticProjectiles.ts`): accept 50 ms older far positions or note it.

### Decisions to confirm (designer: "ok" or by code; recommended value first)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 8.10 D1 | Zombies far from you (> 8 m) updated 10×/s instead of 20×/s | **Yes, beyond 8 m** (they glide between updates; anything that can reach you in under 2 s is still 20×/s) (no: all at 20×/s, the stream is 8.9 instead of 6.5 KB/s) |
| 8.10 D2 | How often a full picture is sent to repair any mistake | **Once a second** (+5 % data) (every 2 s: −2.5 % data, a mistake can last 2 s) |
| 8.10 D3 | Zombie facing | **Worked out on the phone from movement; sent only when a standing zombie turns** (always sent: +1.7 KB/s) |
| 8.10 D4 | Frames that arrive before the game screen is up | **Decoded in the background from the moment you join** (wait for the next full picture: up to 1 s without zombies after a late start or a reload) |
| 8.10 D5 | A phone with an old version after a deploy | **Refused at join: "A new version is out. Please reload."** (no check: an old tab would draw zombies in wrong places) |

### Beat the rule (reviewer start list; brief 4)

1. A Runner at 8.1 m sprinting at you at 4 m/s: it crosses into 8 m within 25 ms; is it refreshed every tick from the first tick inside? (Rule uses this tick's distance.) Does it ever lag > 50 ms behind the server on screen beyond today's delay?
2. Slot reuse within one tick (a zombie dies, a new one spawns in the slot): new generation → full record, no position blend from the dead one.
3. Spectating (out): the 8 m centre is the spectated teammate, same as the view.
4. Skip a frame on purpose (fake `bufferedAmount`): next frame is a keyframe; the phone never applies a delta to the wrong base.
5. A hidden tab for 10 s, then wake: throttle full-queue early delivery and the SDK backlog arrive in order: decoded correctly, no errors.
6. Reconnect (8.1): first frame is a keyframe; the decoder baseline is reset on the new connection (reload = new decoder).
7. A malicious server is out of scope; a corrupted frame (bit flip in a test): counted, healed by the next keyframe, no crash, no zombie stuck forever (the missing-by-time rule removes leftovers).
8. 180 in view + Behemoth + 4 players firing: the frame never exceeds 2,054 B (throttle pool), and is a keyframe when the delta isn't smaller.
9. Mutate: disable keyframes → the "corrupted frame heals within 1 s" test fails; refresh far at 20 Hz → the byte assertion at 150 alive (≤ 10 KB/s) still passes but the 8 m test fails; break heading derivation → F4 test fails.

### Measurements (brief 13) — fill in

| Case | Before | After target |
| --- | --- | --- |
| Audit replay, ~118 in view (KB/s) | 18.6 | ≤ 10 (model 6.5) |
| 150 in one view, worst case (KB/s, computed/replayed) | 23.6 | record (≈ 8–11) |
| 180 in one view (stampede) (KB/s) | 28.2 | ≤ 15 |
| Bots, wave 4–5, clean line, horde KB/s per phone | 4.2–6.1 | record (≈ half) |
| Bots, lossy line, horde KB/s per phone | 6.6–9.1 | record |
| Keyframes per client per s | 20 (every frame is full) | ≈ 1 |
| Decode errors (bots, clean/lossy) | 0 | 0 |
| Server tick p99 (encoder with per-client state) | record (`tickCost` 4 players + 150) | ≤ +0.3 ms |
| `framesSkipped` vs stall length, capped line | (F12: hypothesis) | table |

### Files (expected)

- `packages/shared/src/net/hordeFormat.ts` (+ test), `packages/shared/src/net/messages.ts` (join option), `packages/shared/src/index.ts`
- `apps/server/src/net/hordeEncoder.ts` (+ test), `apps/server/src/rooms/RunRoom.ts` (`sendHorde`, per-client state, `onAuth` version check), the 6.8 bandwidth test (path: check at build time, likely `apps/server/src/run/*Bandwidth.test.ts`)
- `apps/client/src/net/session.ts` (`RunInbox`), `hordeDecoder.ts`, `hordeBuffer.ts` (+ tests), `joinErrors.ts`, `connection.ts` (join option), `netConfig.ts` (`THROTTLE_BYTES_MAX` comment), `apps/client/src/debug/*` (overlay)
- `tools/bots/botClient.ts`, `tools/netaudit/hordeEncodings.ts`, `tools/netaudit/lagLine.ts` (`--kbps`)
- docs: `docs/perf/network-pass-2026-11.md`, `game-architecture.md`, `docs/network-pass-brief.md` (line 8), `docs/epic-6-decisions.md` (6.8 B1 closed), `HANDOFF.md`

### Epic 6: check at build time (brief 22)

- **6.8 stampede:** its Runners are horde records; its bandwidth test exists once 6.8 is on master (bound ≤ 28.5 KB/s with the "Story 8.10 owes this" note per 6.8 B1): tighten to ≤ 15 KB/s and remove the note. If 6.8 added a zombie state (e.g. "stampeding") check it fits the 3-bit state (`MAX_WIRE_ZOMBIE_STATE` 7).
- **6.9–6.10:** the survivor NPC and any new moving entity: are they horde records, schema fields or events? Only horde records change format here.
- **6.12 endless:** caps unchanged (150 / 110 alive); the encoder's per-client state is fixed-size (no growth over endless waves; EPIC 6 brief 25).

### Notes for the merge (brief 12)

- `hordeBuffer.ts`: after 8.9 (missing-by-time) — merge 8.9 first.
- `RunRoom.ts`: 8.1 adds hold/reconnect: a reconnected client needs `needsKey = true` (whichever of 8.1/8.10 lands second wires it; test: "first frame after reconnect is a keyframe"). 8.11 later writes horde + events + patch in one go: keep `sendHorde` a function that *returns* the bytes per client (or takes a writer), so 8.11 can batch it.
- `session.ts`: 8.1 changes the reconnect handling in the same file (different class/methods).

### Dependencies

After 8.9 (`hordeBuffer.ts`). Can run in parallel with 8.1 (see Build rounds) with the RunRoom/session merge notes above. Uses 8.8's line for the lossy measurement.

### Suggested build round

Round 2, in parallel with 8.1. Effort M (≈ one builder session). Full fresh review (a decoder bug shows wrong positions to everyone).

### References

- `docs/perf/network-audit-2026-11.md` §2 (horde frame), §3.2–3.4 (bytes, encodings table), F7, F8, F12, §5 State sync and bandwidth (delta vs last acked, priority), §6 #6, #9
- `_bmad-output/planning-artifacts/epics.md` › Story 8.10; Story 2.5 (`2-5-horde-stream.md`); `docs/epic-6-decisions.md` › 6.8 B1; Story 6.8 file › Bandwidth
- `docs/network-pass-brief.md`, `docs/network-pass-decisions.md`

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Story file written 2026-11-24 by the story writer (gds-create-story, non-interactive) from master da82847; decisions 8.10 D1–D5 pending.

### File List

## Change Log

- 2026-11-24: story file created (ready-for-dev, decisions pending).
