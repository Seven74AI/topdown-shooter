# Story 8.10: Half-size horde stream

Status: review

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

- [x] **T1 Before numbers** (brief 13): on master `d8d44d0` (a clean worktree): `hordeEncodings.ts 600` 18.6 KB/s (A, 6-B header; 18.7 with the new 7-B key header), bots clean + lossy, 8.9's `smoothRun.ts 60 3`, encoder cost; loads in the table. — `tools/netaudit/hordeEncodings.ts` (A column), `tools/netsim/smoothRun.ts`
- [x] **T2 Format** (AC 1–4, 6; brief 19) — `packages/shared/src/net/hordeFormat.ts` (table: keyframe 7 B header, delta 9 B header + new / changed / left; masks TINY/SMALL/FULL/HEADING/TYPE_STATE/FAR), `packages/shared/src/net/hordeStream.ts` (`HordeStreamDecoder`, preallocated, 256 slots), `NET_PROTOCOL_VERSION` 2 + `joinOptionsSchema.netProtocolVersion` (`messages.ts`). Tests: `packages/shared/src/net/hordeFormat.test.ts > horde frame format > round-trips 1/150/256 records`, `> an empty keyframe is exactly 7 bytes (Story 8.10)`, `> rejects a wrong length and calls nothing`; `apps/server/src/net/hordeStream.test.ts > Story 8.10: the delta horde stream > brief 19 fuzz: random bytes, truncated frames, bit flips and a dropped frame never throw, are counted, never apply, and the next keyframe heals within 1 s`
- [x] **T3 Encoder** (AC 1, 3, 4) — `apps/server/src/net/hordeEncoder.ts` (`HordeClientState` per client object, `encodeFor`, `forceKey`, `send` marks `needsKey` on a skip; no allocation per tick). `RunRoom.sendHorde` unchanged (the encoder keeps the per-client state: decision B5). Tests: `apps/server/src/net/hordeStream.test.ts > … > keyframes: the first frame, after a skipped frame (backpressure), every 20 ticks, staggered between clients; a reconnect (a new client object) starts with a keyframe`, `> forceKey (Story 8.1 hook): the next frame to that client is a keyframe`; `apps/server/src/net/hordeEncoder.test.ts > HordeEncoder > skips (never queues) frames while the socket holds more than 64 KB`, `> one tick for 4 clients and 150 zombies costs well under 1 ms`; `tools/checks/hordeStreamWiring.test.ts > Story 8.10: the horde stream is wired and allocation-free > no allocation in the encoder's per-tick path or the decoder's decode path`
- [x] **T4 Client** (AC 5) — `apps/client/src/net/session.ts` (`RunInbox.hordeStream` decodes from the join; `onHorde(sink: HordeSink)`), `apps/client/src/net/hordeDecoder.ts` (the buffer's sink: `framesReceived`, `staleFrames`, `decodeErrors` + `keyframes` from the stream), `NetSimHost.ts` (`onHorde(this.hordeStats)`). A delta whose base is not held is refused (`brokenChain`, counted in `decodeErrors`) until the next keyframe. Tests: `apps/client/src/sim/NetSimHost.test.ts > NetSimHost > horde stream (Story 2.5) > Story 8.10 (D4): frames before the Game scene are decoded in the background; the first delta after it starts draws the full set (no wait for a keyframe)`, `> Story 8.10: a woken tab's burst (key + 40 deltas at once, in order) decodes without an error; a delta whose base was never held is refused and counted`; `tools/checks/hordeStreamWiring.test.ts > … > RunInbox decodes every horde frame with its stream decoder from the join (D4), into the scene's sink`, `> NetSimHost hands the session its HordeDecoder (the buffer's sink, built on the session's stream decoder)`
- [x] **T5 Buffer** (AC 3) — `apps/client/src/net/hordeBuffer.ts`: per-record refresh tick; far zombies lerped between their own refreshes (A's pose → the first later snapshot refreshed after it, B or the one after); 8.9's `dropMissing` / `firstMissTick` untouched (the decoder hands full frames, so "missing" still means out of the set). Tests: `tools/netsim/hordeGlide.test.ts > Story 8.10: far zombies glide (10 Hz on the wire, smooth on screen) > a far Walker (11 m away, refreshed every 2nd tick) moves at its own speed every 10 ms: no stand-still-then-jump; same as at 20 Hz`, `> brief 27 oscillation: a zombie walking back and forth across the 8 m boundary (every near↔far switch, keyframes) never blinks and never jumps`; 8.9's `smooth.test.ts`, `adaptiveDelay.test.ts`, `bossTelegraph.test.ts`, `hordeBuffer.test.ts` green unchanged
- [x] **T6 Every copy** (brief 2, 20) — `tools/bots/botClient.ts` (the same `HordeStreamDecoder`, sends `NET_PROTOCOL_VERSION`, wave stats `hordeKBps` / `keyframesPerS` / `hordeDecodeErrors`), `apps/client/src/net/netConfig.ts` `THROTTLE_BYTES_MAX = HORDE_MAX_FRAME_BYTES` (2055; a delta is always smaller than its keyframe, else the keyframe is sent), `tools/netaudit/hordeEncodings.ts` (runs the real encoder → decoder and checks every tick), `tools/netsim/hitsSim.ts` (the harness now draws the horde through the real encoder → stream decoder → `HordeDecoder` → `HordeBuffer`, B2), `apps/client/src/net/connection.ts` (join option), every server test's join options. `lagProxy.ts` counts bytes by message type: unchanged. Tests: `tools/checks/hordeStreamWiring.test.ts > … > the bots and the netsim harness use the same stream decoder (brief 20)`; `apps/server/src/run/eventBandwidth.test.ts > Special events bandwidth (Story 6.8, brief 11) > Story 8.10 (closes 6.8 B1): …` (asserts the worst frame ≤ `HORDE_MAX_FRAME_BYTES`); `apps/server/src/net/hordeStream.test.ts > … > brief 7: the frame never exceeds the throttle's pooled buffer (a keyframe of 256)`
- [x] **T7 Tests** (F1–F5) — `apps/server/src/net/hordeStream.test.ts > … > F1/F2/F4 round trip: 2,000 ticks of a real run (150 alive, 4 players walking, kills, slot reuse, burning, state changes): every tick equals today's full frame (refreshed ≤ 1 cm, far ones = their last refresh, ≤ 1 tick old), type/state/burning exact, heading within tolerance`; `> F1 the 8 m rule: a zombie 7.9 m from the view centre is refreshed every tick, one at 8.1 m every 2nd tick (by slot parity); a rusher far off is in every frame`; `> F1 a Runner sprinting in from 8.1 m is refreshed every tick from its first tick inside 8 m`; `> F4 a standing zombie that turns (a Spitter aiming) turns on the phone: its heading byte is sent only then`; F5 `apps/server/src/rooms/RunRoom.test.ts > RunRoom > Story 8.10 (F5, brief 19): a client with another wire format, or a pre-8.10 tab without one, is refused at join as update_required; the right one joins` + `apps/client/src/net/joinErrors.test.ts > joinErrorText > knows which text needs the Refresh button`; the 6.8 test `apps/server/src/run/eventBandwidth.test.ts > Special events bandwidth (Story 6.8, brief 11) > Story 8.10 (closes 6.8 B1): the stampede, 150 + 30 Runners in one view: the real stream's worst 1 s ≤ 15 KB/s (was 28.2), decoded in full every tick`; live room `apps/server/src/rooms/RunRoom.fight.test.ts > RunRoom fight (Story 2.4) > sends every client a horde frame per tick with the zombies in its view, and logs horde_stats on wave.ended` (keyframe first, deltas decoded, `keyframes` logged); clean line `tools/netsim/hits.test.ts > Story 8.8: lossy line … > 20 Runners kiting / 150 Walkers kiting: clean line … the all-20 Hz control`; overlay `apps/client/src/debug/hordeStreamText.test.ts > Story 8.10 (AC 9): the overlay's horde stream line > reads \`key 1.0/s · err 0\`` + `tools/checks/hordeStreamWiring.test.ts > … > the ?debug=1 overlay prints \`key N/s · err N\` (AC 9)`
- [x] **T8 Backpressure measurement** (AC 8) — `tools/netaudit/lagLine.ts` `kbps` (serialised server→client queue that pauses the server socket above 64 KB), `npm run bots -- --kbps`; table below. Tests: `tools/netaudit/lagLine.test.ts > lagLine (Story 8.8: …) > Story 8.10 (T8): --kbps caps the server→client rate, in order, and pushes back on the server's socket`; `tools/bots/lineArgs.test.ts > bots --lag/--jitter/--loss/--stall (Story 8.8) > reads the lossy line (default stall 200 ms)`
- [x] **T9 After numbers + docs + gate + hand-back** — `docs/perf/network-pass-2026-11.md` § 8.10, `game-architecture.md` horde-stream line, `docs/network-pass-brief.md` line 8 (horde ≤ 16 KB/s), `docs/epic-6-decisions.md` 6.8 B1 closed, `HANDOFF.md` §2, `docs/network-pass-decisions.md` 8.10 B1–B6

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
8. 180 in view + Behemoth + 4 players firing: the frame never exceeds 2,054 B (throttle pool; as built 2,055 B = the 7 + 8 × 256 keyframe, `THROTTLE_BYTES_MAX = HORDE_MAX_FRAME_BYTES`), and is a keyframe when the delta isn't smaller.
9. Mutate: disable keyframes → the "corrupted frame heals within 1 s" test fails; refresh far at 20 Hz → the byte assertion at 150 alive (≤ 10 KB/s) still passes but the 8 m test fails; break heading derivation → F4 test fails.

### Measurements (brief 13) — filled in (Story 8.10 build, 2026-11-25)

Before = master `d8d44d0` in a clean worktree, after = `story-8-10`; same seeds, same lines, same machine (4 cores). Loads (1-min): replay/encoder 0.6–0.9, bots before 3.2–3.4 (the full test run was going; bots measure bytes), bots after 0.4–1.1, smoothRun 0.2–1.1.

| Case | Before | After | Target |
| --- | --- | --- | --- |
| Audit replay `hordeEncodings.ts 600`, ~118 in view (KB/s) | 18.6 (A; 18.7 with the 7-B key header) | **6.7**, 0 mismatches vs the full frame over 600 ticks, keyframes 1.0/s | ≤ 10 (model 6.5) |
| 150 in one view (`hordeEncoder.test.ts`, 150 Walkers packed round the player: all near, all moving) | 24.2 (23.6 computed) | **11.6** (11,835 B/s) | record |
| Replay with every zombie 2–9 m away (`ZOMBIES=150 RING=2,9`, 127 in view / `ZOMBIES=180`, 135 in view) | 19.9 / 21.2 | 8.3 / 9.0 | record |
| 180 in one view, the stampede (`eventBandwidth.test.ts`, worst 1 s window of the real stream) | 28.2 (28.3: 1,447 B × 20) | **13.4** worst 1 s (avg 12.1), 14 keyframes in 14 s, 0 errors | ≤ 15 |
| Bots, 4 × net150 `--hold-fire 45`, waves 4–5, clean line, horde KB/s per phone (server `net_stats.hordeKBps`) | 9.2–11.0 | **3.4–4.3** | ≈ half |
| Bots, same, lossy line `--lag 150 --jitter 20 --loss 1` | 8.6–12.6 | **3.6–5.2** | record |
| Bots, total down per phone (avg, clean / lossy) | 11.7–11.8 / 11.1–13.4 | 5.6–5.9 / 5.8–6.9 | — |
| Keyframes per client per s (bots) | 20 (every frame full) | 1.0–1.3 (key every 20 ticks + "delta not smaller" on near-empty frames) | ≈ 1 |
| Decode errors (bots, clean / lossy; harness) | 0 / 0 | 0 / 0; harness 0 | 0 |
| `framesSkipped` (bots) | 0 | 0 | — |
| Encoder per tick, 4 clients × 150 zombies (`hordeEncoder.test.ts`, 3 runs each) | mean 0.055–0.062 ms, p99 0.154–0.199 | mean 0.120–0.126 ms, p99 0.206–0.276 | ≤ +0.3 ms p99 (✓ +0.12 at most) |
| 8.9 freezes /30 s (`smoothRun.ts 60 3`), 1 % rows: standing / kiting / runners | 1.2 / 0.9 / 0.9 | 1.2 / 0.7 / 0.7 (all-20 Hz control: 1.0 / 0.9 / 0.7) | no new freezes |
| 8.9 freezes, 2 % rows | 0.2 / 0.3 / 1.2 | 0.7 / 0.5 / 1.2 (control 0.7 / 0.5 / 1.2) | — |
| 8.9 step row (1 % + 150 ms step) | 1.0 | 2.2 (control 2.2) | — |
| Reversed hits, clean 20 Runners kiting (`smoothRun`, harness) | 0.2 % | 0.9 % (control 0.9 %; B2) | ≤ 0.5 % → B2 |
| `framesSkipped` vs stall length, capped line | (F12: hypothesis) | table below | table |

**Freezes and blinks.** Every after row is within ±0.2 freezes/30 s of its all-20 Hz control (`HORDE_NEAR_M=Infinity`, same harness), in both directions (1 % standing 1.2 vs 1.0, 1 % kiting 0.7 vs 0.9, the rest equal): the 10 Hz far rule adds no freeze, and every 1 % row stays within 8.9 B9's ≤ 1.2. The before → after differences are the harness change (B2: the real buffer draws a different set, so the bots-in-harness shoot differently and the seeded stalls land elsewhere). No blinks: `hordeGlide.test.ts` sweeps 1 ms of render time across 20 s of near↔far oscillation with 0 missing samples, ≤ 1.12 cm from the all-20 Hz picture.

**Backpressure (AC 8, T8; `npm run bots -- --count 4 --scenario net150 --until-wave 4 --hold-fire 45 --lag 150 --jitter 20 --loss 1 --stall S --kbps K`, the cap per connection, server→client):**

| Cap | Stall (1 % of chunks, both ways) | `framesSkipped` (server, 4 phones) | Longest wait in the capped queue | Server socket paused | Horde KB/s per phone | RTT (bots) | Decode errors |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 128 kbit/s | 0.2 s | 0 of 4 × 1,528 | 158 ms | 0 | 3.8 | 162 ms | 0 |
| 128 kbit/s | 0.4 s | 0 of 4 × 2,028 | 159 ms | 0 | 2.7 | 194 ms | 0 |
| 128 kbit/s | 1 s | 0 of 4 × 2,090 | 159 ms | 0 | 2.2 | 373 ms | 0 |
| 64 kbit/s | 0.2 s | 0 of 4 × 1,907 | 4,720 ms | 0 | 3.4 | 161 ms | 0 |
| 64 kbit/s | 0.4 s | 0 of 4 × 1,854 | 4,680 ms | 0 | 3.6 | 195 ms | 0 |
| 64 kbit/s | 1 s | 0 of 4 × 1,974 | 1,883 ms | 0 | 2.6 | 339 ms | 0 |

Wave 4 each, load 0.2–0.7 (two runs at a time). At 128 kbit/s (16 KB/s) the stream fits with room to spare: nothing waits more than 0.16 s for the wire. At 64 kbit/s (8 KB/s, about the whole game's average of 5.3–5.5 KB/s down) bursts queue up to 4.7 s in the line while the server's socket never holds 64 KB (the cap's queue paused it 0 times): the skip rule cannot see a queue that sits in the network, so F12 is confirmed for very slow lines and `HORDE_BACKPRESSURE_BYTES` stays 64 KB (B6; a fix needs a latency signal — follow-up). Keyframes above 1/s (up to 4.3/s for one bot) are near-empty views, where a 7-byte keyframe is smaller than a 9-byte delta. The 0.4 s and 1 s runs used the 0.2 s runs' server processes (the same branch build; my stop script missed them), so their server counters are the 2nd and 3rd waves in those logs.

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

### Notes for the merge (brief 12) — as built

- **`apps/server/src/rooms/RunRoom.ts` (8.1 shares it):** three small separate lines only. (1) `checkNetProtocol(version)` — one exported function above the class, called once in `checkAuth` (onAuth) right before the `balanceVersion` check; 8.1's onAuth/onJoin changes merge around that one line. (2) the `NET_PROTOCOL_VERSION` import. (3) `horde_stats` logs `keyframes` and `startWaveStats`/the wave-end reset zero it. `sendHorde`, `onJoin`, `onLeave` and every 8.1 hold/reconnect path are untouched: the per-client delta state lives in the encoder, keyed by the Colyseus client object (B5). **8.1 ↔ 8.10 wire-up ("the first frame after a reconnect is a keyframe"):** automatic if 8.1's reconnect hands the room a NEW client object (Colyseus `allowReconnection` resolves with the new client); if 8.1 keeps the old object, call `this.horde?.forceKey(client)` on reconnect. Either way a reconnecting client (`ClientState.RECONNECTING`) is skipped by `send` (not JOINED), which sets `needsKey`, so its first frame after it is JOINED again is a keyframe — tested in `apps/server/src/net/hordeStream.test.ts > … > keyframes: … a reconnect (a new client object) starts with a keyframe` and `> forceKey (Story 8.1 hook)`. Whoever lands second adds the room-level test "first frame after reconnect is a keyframe" in `RunRoom.*.test.ts` (8.1's reconnect helper).
- **`apps/client/src/net/session.ts` (8.1 shares it):** only `RunInbox` changed (`hordeStream` field, `onHorde(sink: HordeSink)`, `receiveHorde`, `reset()` resets the decoder) and `NetSession.onHorde` / `get hordeStream`. If 8.1 keeps the same `RunInbox` across a reconnect, nothing is needed: the new connection's first frame is a keyframe and a keyframe always replaces the baseline (a delta from before can't chain: its base tick is checked). If 8.1 makes a new inbox, it gets a new decoder.
- **`apps/client/src/sim/NetSimHost.ts` (8.1's watchdog/freeze overlay):** the horde hookup moved from `onHorde((b) => this.receiveHorde(b))` to `onHorde(this.hordeStats)` (`HordeDecoder` built in the constructor; its `onFrame` callback does 8.9's `sampleClock`). `receiveHorde` is gone.
- **`apps/client/src/net/connection.ts` / `tools/bots/botClient.ts`:** the join options gain `netProtocolVersion: NET_PROTOCOL_VERSION`. Every server and netsim test's join options were updated too (23 test files: one line + one import each) — any test 8.1 adds needs the same line, or it is refused as `update_required`.
- **`apps/client/src/net/joinErrors.ts`:** `update_required` → "A new version is out. Please reload." with the Refresh button (`needsRefresh`).
- **`tools/netaudit/lagLine.ts` (8.1 adds `cut`):** 8.10 adds the `kbps` option (a separate branch in `OrderedDelay.enqueue` and the down `data` handler) and two stats fields; `tools/bots/lineArgs.ts` + `run.ts` gain `--kbps`.
- **`tools/netsim/hitsSim.ts`:** the harness's horde is now the real stream (B2). `Down.zombies` is replaced by `Down.horde` (bytes); anything 8.1 adds to `Down` merges beside it.
- **8.11 (later, one packet per tick):** `HordeEncoder.encodeFor(world, state, px, py)` returns the frame bytes without sending, so 8.11 can batch it; `send` is a thin wrapper.

### Not verified

- Real phones, real 4G, iOS Safari (brief 23): the decoder and the glide are unit/harness-tested only.
- The live two-tab smoke (brief 34, `tools/netaudit/smoke2tab.cjs`) was not re-run on this branch: the browser client was exercised through `NetSimHost` tests and the netsim harness, not a real tab.
- A real deploy with an old tab open: the refusal is tested with `bootTestServer()` and the client text with `joinErrors.test.ts`; the Refresh button's look was not checked.
- Backpressure on a real slow line: the capped line is a model (a serialising queue in front of the server's socket); the kernel's own buffers on a real server are larger, so the "0 skips" finding there is if anything optimistic (B6).
- Very long runs (endless, 6.12): the per-client state is fixed-size (256 slots), not soak-tested beyond 2,000 ticks.

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

Claude (builder session for Story 8.10, gds-dev-story), 2026-11-25 overnight.

### Gate

GATE_LINE

### Debug Log References

- Before numbers: master `d8d44d0` in a scratch worktree (bots, `smoothRun.ts`, encoder cost). The first "before" bot run was discarded (its lossy bots loaded the half-edited shared format from the working tree); re-run from the worktree.
- The heading tolerance was swept 2 / 4 / 6 / 8 / 11 / 16 / never on the replay and a 150-walker jam (B1).
- The clean-line reversed-hit change in the harness was traced to the pending-kill draw (B2): hiding a killed zombie at arrival instead gives 0/446.

### Completion Notes List

- Story file written 2026-11-24 by the story writer (gds-create-story, non-interactive) from master da82847; decisions 8.10 D1–D5 accepted 2026-11-24.
- Built 2026-11-25 overnight (FULL AUTONOMOUS RUN; designer asleep). D1–D5 as accepted. New decisions B1–B6 in `docs/network-pass-decisions.md`, each **auto-accepted overnight (designer: follow the GDS recommendation)**: B1 heading byte when > 4 steps off (alt 2 steps / never while moving); B2 harness on the real stream, clean bound ≤ 1 % with the all-20 Hz control (alt keep the idealised harness); B3 a 1-byte TINY move record (alt int8 only: over the 15 KB/s AC); B4 keyframes/new records start "near" (alt far bitmap in keys); B5 per-client state in the encoder keyed by the client object (alt RunRoom join/leave lines); B6 `HORDE_BACKPRESSURE_BYTES` unchanged (alt 16 KB: no effect measured).
- AC 7 numbers met: replay 6.7 KB/s (≤ 10), stampede 13.4 KB/s (≤ 15), bots about 40 % of before; budget ≤ 16 KB/s written to the brief (line 8) and `game-architecture.md`; 6.8 B1 closed in `docs/epic-6-decisions.md`.
- Brief 2 copy list: hordeFormat ✓ → hordeEncoder ✓ → hordeDecoder ✓ (+ `hordeStream.ts`, `RunInbox`) → hordeBuffer ✓ → devThrottle `THROTTLE_BYTES_MAX` ✓ (= `HORDE_MAX_FRAME_BYTES` 2055) → botClient ✓ → `hordeEncodings.ts` ✓; also `hitsSim.ts`, `smoothRun.ts`. Epic 6 (brief 22): no new zombie state since 6.8 (`STAMPEDE` fits the 3 bits; `MAX_WIRE_ZOMBIE_STATE` test green); the survivor NPC is not a horde record; endless caps unchanged and the per-client state is fixed-size.
- Cosmetic copies of far positions (story "What must be preserved"): turret shots, aim assist and fog read the mirror World the buffer fills; far zombies there are interpolated between 10 Hz refreshes (≤ 50 ms older pose at a refresh boundary, ≤ 1.12 cm from the all-20 Hz picture in `hordeGlide.test.ts`). Accepted as drawing-only (the server's rules use its own World).
- Brief 6 mutations run: (1) the buffer lerps tick by tick instead of between own refreshes → both `hordeGlide.test.ts` tests fail; (2) the decoder bumps every slot's refresh tick (ignores far) → glide + `hordeStream.test.ts` round trip/8 m tests fail (4 failed); (3) the early "delta already no smaller" check used 8 B per change → `F4 standing turn` test failed (fixed: exact size).

### File List

- packages/shared/src/net/hordeFormat.ts, packages/shared/src/net/hordeStream.ts (new), packages/shared/src/net/messages.ts, packages/shared/src/index.ts, packages/shared/src/net/hordeFormat.test.ts
- apps/server/src/net/hordeEncoder.ts, apps/server/src/net/hordeEncoder.test.ts, apps/server/src/net/hordeStream.test.ts (new), apps/server/src/rooms/RunRoom.ts, apps/server/src/run/eventBandwidth.test.ts, apps/server/src/rooms/RunRoom.test.ts, apps/server/src/rooms/RunRoom.fight.test.ts, join options in apps/server/src/rooms/RunRoom.*.test.ts, apps/server/src/net/edge.test.ts, apps/server/src/ops/shutdown.test.ts
- apps/client/src/net/session.ts, apps/client/src/net/hordeDecoder.ts, apps/client/src/net/hordeBuffer.ts, apps/client/src/net/connection.ts, apps/client/src/net/joinErrors.ts, apps/client/src/net/joinErrors.test.ts, apps/client/src/net/netConfig.ts, apps/client/src/sim/NetSimHost.ts, apps/client/src/sim/NetSimHost.test.ts, apps/client/src/debug/PerfOverlay.ts, apps/client/src/debug/perfStats.ts, apps/client/src/debug/hordeStreamText.test.ts (new), apps/client/src/debug/netSummary.test.ts
- tools/bots/botClient.ts, tools/bots/run.ts, tools/bots/lineArgs.ts, tools/bots/lineArgs.test.ts, tools/netaudit/hordeEncodings.ts, tools/netaudit/lagLine.ts, tools/netaudit/lagLine.test.ts, tools/netsim/hitsSim.ts, tools/netsim/smoothRun.ts, tools/netsim/hits.test.ts, tools/netsim/vote.test.ts, tools/netsim/hordeGlide.test.ts (new), tools/checks/hordeStreamWiring.test.ts (new)
- docs/network-pass-decisions.md, docs/network-pass-brief.md (line 8), docs/perf/network-pass-2026-11.md, docs/epic-6-decisions.md, _bmad-output/planning-artifacts/game-architecture.md, HANDOFF.md, _bmad-output/implementation-artifacts/sprint-status.yaml

## Change Log

- 2026-11-24: story file created (ready-for-dev, decisions pending).
- 2026-11-25: built overnight (delta horde stream v2, B1–B6 auto-accepted), status review.
