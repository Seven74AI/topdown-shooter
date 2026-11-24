# Network audit, November 2026

Read-only audit of how game data travels from the server to each phone, measured with the bots, compared with what other studios publish, and turned into a ranked list of improvements. No game code was changed. Branch `network-audit`; measurement scripts in `tools/netaudit/` (not game code, not part of the test suite).

Date: 2026-11-24 · build: `master` at `8f81792` (end of Epic 5) · machine: 4-core cloud container, load < 1, server + bots + a delay proxy on localhost.

---

## In plain English (for the designer)

- **Data use is fine today.** In heavy late waves (Spitters, Bloaters, a Brute, the 150 cap reached) each phone averaged **6–11 KB/s** (KB/s = how much data arrives per second; the budget is 30). The busiest single second was **12–27 KB/s**. The worst case, all 150 zombies on one screen, works out at about **25 KB/s**. That passes. It fails only if Epic 6's stampede (up to 180 alive) and the rest of the horde are all on one screen at once.
- **Hits are fine on a clean 150 ms line**: 0–0.2 % of hits are reversed (target < 5 %).
- **Hits are not fine on a realistic 4G line that loses a few packets** (a "packet" is one small piece of data; on a poor 4G signal 1–2 in 100 may get lost and have to be sent again. That rate is the test's assumption; your 4-phone test will show the real one). With 1 % packet loss, **7.6 % of hits on kiting Runners are reversed**. At 2 % loss it is **11.9 %**, and longer hiccups give 6–13 % on everything. The cause: after each hiccup the player's shots arrive "too old" for the server's 300 ms rewind. Allowing a 500 ms rewind brought the Runner numbers (7.6 % and 11.9 %) down to **2.0 % and 1.3 %** in a one-off test. The longer hiccups weren't re-tested.
- **Hiccups also show on screen.** On a lossy line, about 1 in 100 updates comes 240–290 ms after the previous one instead of 50 ms. The game only keeps 150 ms in hand, so zombies and teammates freeze for a moment and then jump.
- **A dropped phone is out for the run.** There is no reconnect yet (planned as Story 8.1 in Epic 8), and the server gives up on a silent phone after about 6–9 s. A short 4G dead spot, or locking the phone on iPhone, can therefore end someone's night. That is the biggest risk for NFR9 ("reach wave 10 without a game-caused disconnect").
- **Switching away from WebSocket isn't worth it yet.** WebSocket is the connection the game uses today; it always delivers everything in order, so one lost packet holds up everything behind it. The newer kind (WebTransport) can skip a lost packet, but:
  - Safari only gained it in March 2026.
  - Its "skip lost packets" mode reportedly doesn't work on iPhone.
  - Colyseus (our server library) marks its support as experimental.
  - No source shows that our Cloudflare Tunnel (how the server is reached) can carry it.

  Fixing how we *handle* hiccups gets most of the benefit.

**My recommendation:** a short **Network pass of 4 stories (+ 1 optional) right after Epic 6, before Epic 7**, put at the front of Epic 8 "Real-life resilience" (it's already the bad-connection epic), with **Story 8.1 (reconnect) pulled forward into it**. Order: (1) shots count on a lossy line (500 ms rewind + a "lossy" test switch), (2) smooth through hiccups, (3) reconnect (8.1), (4) half-size horde stream, and optionally (5) fewer packets per tick. Then your 4-phone 4G test (Story 2.10) as the check. Details and numbers in §6–§7.

---

## 1. Verdict against the targets

| Target | Today on a clean 150 ms ± 10 ms line | Today with 4G-like loss (1–2 %) | Verdict |
|---|---|---|---|
| **NFR4** ≤ ~30 KB/s per phone, 150 alive | 5.8–10.9 KB/s wave average, 11.7–23.2 KB/s busiest second (server; 27.1 on the bot side); worst case 150 in view ≈ 25.5 KB/s payload (computed, §3.4) | wave 5: 9.8–10.9 KB/s average, busiest second 20.9–23.2 vs 11.7–14.9 on the clean run (server). Part of that is a bigger crowd in view (54 vs 32 per frame), part is late data arriving in bursts | **Met, thin margin.** Epic 6's stampede (≤ 180 alive, story 6.8) can push the worst case to ~30 KB/s |
| **Epic 6 brief 11** horde ≤ 24 KB/s, total ≤ 30 | horde 4.2–9.1 KB/s measured; worst case 23.6 KB/s at 150 in view | — | **Met at 150; fails from 153 in view** (180 in view = 28.2 KB/s horde) |
| **NFR5** < 1 in 20 apparent hits reversed at 150 ms | 0.0–0.2 % (harness, 150 Walkers standing / kiting, 20 Runners kiting) | 1.6–3.5 % Walkers; **7.6 % / 11.9 % kiting Runners at 1 % / 2 % loss; 6.3–12.7 % with 400 ms stalls** | **Met on clean lines, fails on lossy 4G** (§3.5) |
| **NFR3** no visible disagreement at ≤ 150 ms | frame gaps p99 66–68 ms, max 98–115 ms; under the 100–150 ms render delay | p99 239–248 ms, max 261–293 ms; 7–10 % of horde frames arrive bunched | **At risk**: freeze-then-jump every few seconds on a lossy line (§3.3) |
| **NFR9** 4-player run to wave 10, no game-caused disconnect | no reconnect; the transport terminates a socket after 2 missed pings 3 s apart | a 6–9 s 4G dead spot or an iOS app switch ends that player's run | **High risk** until reconnect exists (§4, F9) |

---

## 2. How the data flows today (code trace)

Server, every 50 ms (`setFixedTimestep`, 20 Hz, up to 5 catch-up steps: `apps/server/src/rooms/RunRoom.ts:718`):

1. **Step the World**, then **`syncState`** copies it into the Colyseus schema, assigning a field only when its value changed (`apps/server/src/rooms/schema/syncState.ts:12-38`). The schema (`apps/server/src/rooms/schema/RunState.ts`) holds the run (phase, tick, wave, decay…), 4 players × 41 fields (position float32, ammo, reload ticks, wallet, knockback…), and the placed buildings. Every client receives every player's fields: there is no per-client view (`StateView`), which is fine with 4 players (patch ≈ 55–66 B).
2. **Sim events** go out as one reliable `sim.events_flushed` message per tick that has events (`RunRoom.ts:915`). Each event is a msgpack tuple (`packages/shared/src/net/netEvents.ts:10-19`). Turret, mine, spit, acid and Bloater effects are **local**: they go only to clients whose view contains them (`apps/server/src/net/eventInterest.ts:18-45`). Everything else goes to everyone.
3. **Horde frame** (`apps/server/src/net/hordeEncoder.ts`), one per client per tick: header 6 B + **8 B per zombie** (net id, x/y in cm as u16, heading u8, type + state + burning u8) for every zombie inside the client's view (24 × 13.5 m) **+ 4 m margin**, plus every rusher (`packages/shared/src/net/hordeFormat.ts:1-34`). It is a full snapshot each tick, not a delta. A frame is **skipped**, never queued, when the socket holds > 64 KB unsent (`hordeFormat.ts:32`, `hordeEncoder.ts:136-146`).
4. **State patch**: Colyseus sends it on its own **50 ms timer** (`RunRoom.ts:152,273`). That timer is not the tick loop, so a patch can carry 0 or 2 ticks of change. The client clock is built from patch arrivals, so this adds noise (§4, F6).
5. **Ping**: 1/s `net.pinged`; the server's RTT is an EWMA of pongs (`RunRoom.ts:938-960`).

Client (Phaser, `apps/client/src/sim/NetSimHost.ts`):

- **Input**: one `input.send` per 50 ms step, seq + 1. It is a msgpack map with 10 named keys, ~116 B (sticks as float64). There's no redundancy, since TCP is relied on (`NetSimHost.ts:662-699`, `packages/shared/src/net/input.ts:7-31`).
- **Server input queue**: one input applied per tick. The ring holds 6 (300 ms). A backlog over 2 lasting 40 ticks (2 s) drains by skipping every 2nd tick. A starved tick holds still and pauses the weapon (`apps/server/src/run/RunController.ts:66-77, 254-263, 500-535`).
- **Prediction**: replay of unacked inputs on every patch. Errors < 1 m smooth out (τ 0.1 s); ≥ 1 m (2.5 m on a new knockback) snaps; 64-input history (`apps/client/src/net/prediction.ts:226-317`, `netConfig.ts:7-18`).
- **Everything else is drawn on one render timeline**, `renderTick = serverTickEstimate − delay`:
  - **The delay adapts between 100 and 150 ms**: 100 + 2 × jitter, where jitter is an EWMA of the patch *gap* deviation, moving at ≤ 20 ms/s (`apps/client/src/net/adaptiveDelay.ts:30-62`, `netConfig.ts:24-33`).
  - **The server-tick estimate** is the *minimum* arrival offset over a 2 s window, not slewed (`apps/client/src/net/serverClock.ts:4-57`).
  - **Events wait until the timeline reaches them**, so a kill and its zombie line up (`apps/client/src/net/eventQueue.ts`, `hordeBuffer.ts:162-182`).
  - **Past the newest frame nothing is extrapolated**: everything holds (`snapshots.ts:244-274`, `hordeBuffer.ts:191-247`).
- **Rewind (2.12)**: the shot carries `viewTick`, and the server tests it against zombie positions at most **6 ticks / 300 ms** old (`apps/server/src/net/limits.ts:41`, `packages/shared/src/config/constants.ts:52-58`, `RunController.ts:64`).
- **Message guard**: input bucket 25/s, other messages 10/s, ghosts 5/s. Excess is dropped silently (`apps/server/src/net/limits.ts`).
- **`?lag=&jitter=` dev throttle**: delays both directions by lag/2 ± jitter/2, in order. It models **no loss, no head-of-line stall and no bandwidth limit**, and holds a 128-message queue (`apps/client/src/net/devThrottle.ts:123-318`).
- **Reconnect: none in the game.**
  - **Server:** no `onDrop`/`allowReconnection` (`RunRoom.ts:378-386`).
  - **Client SDK:** retries for up to ~56 s in vain, then the start screen.
  - **Client watchdog:** none for "no data for N s".
  - **Transport:** Colyseus terminates a socket that misses **2 pings at a 3 s interval** (`node_modules/@colyseus/ws-transport/build/WebSocketTransport.mjs:53-54, 161-171`, not overridden in `apps/server/src/app.ts:34`).

---

## 3. Measurements

### 3.1 Method

- **Server**: `PORT=4067 ALLOW_TEST_SCENARIOS=1 DEV_WAVE_MIX=walker,walker,runner,crawler,spitter,bloater DEV_DECAY_STAGES=3,3,3,3,3,3`.
  - `net150` starts at wave 4 (160 zombies, god mode). Wave 5 adds its fixed Brute.
  - The mix forces Spitters and Bloaters.
  - Decay stage 3 adds car fires and rain.
- **4G line**: `tools/netaudit/lagProxy.ts`, a TCP proxy that adds 75 ms ± 10 ms each way **without reordering** (like real TCP). With `--stall-prob 0.01 --stall-ms 200` it models 1 % packet loss as a head-of-line stall: that chunk and everything behind it waits 200 ms, about one retransmit. It also reads the server→phone WebSocket frames and splits bytes by stream.
- **Players**: `npm run bots -- --url http://localhost:416x --count 4 --scenario net150 --until-wave 5 --hold-fire 25|45`.
- **Bandwidth** is WebSocket payload, KB = 1024 B, like the game's own meter. TLS/TCP/IP overhead comes on top (§3.6).
- **Hits**: `tools/netaudit/runHits.ts` over `hitsLossSim.ts`, a copy of the Story 2.7/2.12 harness with an added loss model. It runs the real server `RunController` and the real client Predictor and fire clock; Pistol, 60 s × 3 seeds per row.
- **Horde encodings**: `tools/netaudit/hordeEncodings.ts`. The real `RunController` and `HordeEncoder` run on Downtown with 150 late-mix zombies kept alive (refilled on a ring) and 4 survivors walking circles; it compares encodings on that real movement.

### 3.2 Bandwidth per phone (bots, 4 players, 150 ms + 20 ms jitter)

| Run | Wave | Peak alive | Zombies per frame (avg) | Down avg KB/s (server `net_stats`) | Busiest second | Horde KB/s | Up KB/s | Tick avg / max ms |
|---|---|---|---|---|---|---|---|---|
| 1 hold fire 25 s | 4 | 141 | 26–38 | 5.8–7.8 | 13.0–16.1 | 4.2–6.1 | 2.3 | 0.89 / 3.1 |
| 1 | 5 (Brute) | 135 | 29–31 | 6.4–6.8 | 15.2–15.7 | 4.6–5.0 | 2.1 | 0.82 / 4.9 |
| 2 hold fire 45 s | 4 | 118 | 34 | 6.8–7.3 | 13.8–18.7 | 5.2–5.7 | 2.3 | 0.72 / 3.5 |
| 2 | 5 | 150 | 32 | 6.4–7.1 | 11.7–14.9 | 4.8–5.4 | 2.3 | 0.75 / 4.4 |
| 3 hold fire 45 s + 1 % loss | 4 | 150 | 43 (mean) | 8.3–8.9 | 17.1–19.9 | 6.6–7.2 | 2.4 | 0.79 / 4.0 |
| 3 + 1 % loss | 5 | 150 | 54 | **9.8–10.9** | **20.9–23.2** (bot side 27.1) | 8.1–9.1 | 2.4 | 0.83 / 5.4 |

No horde frame was skipped (`framesSkipped 0`), and there were no slow ticks or slow patches. Server cost is ~0.8 ms of the 50 ms budget. The bots spread out more than real players, so frames held only 26–57 zombies. The worst case below is computed rather than measured.

### 3.3 What a phone receives, by stream (proxy, run 1 whole connection; runs 2–3 similar)

| Stream | Messages/s | Avg bytes/message | Note |
|---|---|---|---|
| Horde frame (`ROOM_DATA_BYTES` 1) | 19.8–19.9 | 225–271 (run 3 whole connection: 363–405; wave 5 alone 413–467 per server `horde_stats`) | 6 + 8 × zombies in view |
| State patch (`ROOM_STATE_PATCH`) | 19.7–19.8 | 55 (run 3: 66) | player x/y/heading/ackSeq/ammo/reload ticks, `tick`, buildings HP |
| `sim.events_flushed` | 5–8.5 | 70–81 | shots, hits, kills, money |
| `net.pinged` | 1 | 27 | |
| **All down** | **≈ 46–49 messages/s → 44–49 TCP writes/s** | | each message is its own write (TCP_NODELAY: `node_modules/ws/lib/websocket.js:269`) |
| Up (`input.send` + pongs) | 21 writes/s | ~116 B per input | 2.1–2.5 KB/s |

Arrival timing of horde frames at the phone:

| Line | Gap p50 | p95 | p99 | Max | Frames arriving < 5 ms after the previous |
|---|---|---|---|---|---|
| 150 ms ± 10 ms, no loss (runs 1–2) | 50 ms | 62–64 ms | 66–68 ms | 98–115 ms | 0.2–0.8 % |
| + 1 % loss as 200 ms stalls (run 3) | 49 ms | 65 ms | **239–248 ms** | **261–293 ms** | **7.2–10.1 %** |

The render delay is 100–150 ms (§2). On the lossy line every stall above ~150 ms therefore runs past the newest frame. Teammates and zombies hold still, then jump when the burst lands. A stall hit about every 2 s (45–62 stalls per ~111 s connection).

### 3.4 Worst case and the horde encoding alternatives

**Worst case today:** 150 zombies in one view = 6 + 8 × 150 = 1,206 B × 20/s = **23.6 KB/s horde**. Add ~1.3 KB/s of patches and ~0.5–1 KB/s of events and the payload is ≈ **25.5 KB/s** (NFR4 ✔, brief ✔ at 150). The Epic 6 stampede (story 6.8: "total ≤ 180") with 180 in view = **28.2 KB/s horde**, ≈ 30.5 KB/s total (brief ✘, NFR4 slightly over). Story 6.8 assumes most stampede Runners are off screen; this is the case where they are not.

**Alternatives on real movement** (`hordeEncodings.ts`, 600 ticks, 118 in view on average, 94 % of them moving every tick, 543 spawns — pessimistic: a crowd chasing walking survivors):

| Encoding | KB/s at 118 in view | Bytes per zombie per tick | ≈ at 150 in view |
|---|---|---|---|
| A. Today (full 8 B record each tick) | **18.6** | 8.0 | 23.6 |
| B. Delta vs the previous frame sent (new = 8 B; moved = slot + mask + int8 dx/dy; changed heading/state + 1 B; unchanged = 0; left = 1 B) | 10.6 (−43 %) | 4.5 | ~13.4 |
| C. B, heading derived on the phone from movement | **8.9 (−52 %)** | 3.8 | ~11.3 |
| D. C + zombies > 8 m from me updated at 10 Hz | **6.5 (−65 %)** | 2.7 | ~8.2 |
| E. Today's format at 10 Hz for everyone | 9.3 (−50 %) | — | 11.8 (but everyone, near too, at half rate) |

Because WebSocket is reliable and ordered, "the previous frame sent" is always the one the phone has. A delta needs **no acks**, unlike UDP games [1][4]. It needs a full keyframe only on join, after a skipped frame, and (as a safety net) every ~1 s, which costs about +5 %.

### 3.5 Reversed hits with and without packet loss (NFR5)

`runHits.ts`, 150 ms ± 10 ms RTT, Pistol, 3 × 60 s. "Over cap" = the share of the server's shots whose view was older than the 300 ms rewind limit.

| Case | Line | Apparent hits | Reversed | Predicted shots that never fired on the server | Shots over the rewind cap |
|---|---|---|---|---|---|
| 150 Walkers, standing | clean | 459 | **0.0 %** | 0 | 0 % |
| | 1 % × 200 ms | 451 | 1.6 % | 8 | 38 % |
| | 2 % × 200 ms | 450 | 1.8 % | 13 | 66 % |
| | 1 % × 400 ms | 458 | **6.3 %** | 22 (92 inputs overflowed the queue) | 47 % |
| 150 Walkers, kiting | clean | 457 | 0.2 % | 0 | 0 % |
| | 1 % × 200 ms | 439 | 2.3 % | 8 | 39 % |
| | 2 % × 200 ms | 427 | 3.5 % | 7 | 62 % |
| | 1 % × 400 ms | 452 | **10.0 %** | 26 | 45 % |
| 20 Runners, kiting | clean | 446 | 0.2 % | 0 | 0 % |
| | 1 % × 200 ms | 410 | **7.6 %** | 8 | 50 % |
| | 2 % × 200 ms | 404 | **11.9 %** | 7 | 73 % |
| | 1 % × 400 ms | 432 | **12.7 %** | 25 | 64 % |

**One-off confirmation** (temporary local edit, reverted at once, never committed: `REWIND_MAX_TICKS` 6 → 10 and `REWIND_CAP_MS` 300 → 500):

| Case | Line | Reversed at 300 ms rewind | Reversed at 500 ms rewind |
|---|---|---|---|
| 150 Walkers, kiting | 1 % × 200 ms | 2.3 % | 1.8 % |
| | 2 % × 200 ms | 3.5 % | 2.1 % |
| 20 Runners, kiting | 1 % × 200 ms | **7.6 %** | **2.0 %** |
| | 2 % × 200 ms | **11.9 %** | **1.3 %** |

Raising only `REWIND_CAP_MS` changed nothing, because `REWIND_CAP_TICKS = min(REWIND_MAX_TICKS, …)` (`RunController.ts:64`). Both constants have to move together.

### 3.6 Wire overhead (deduced, not measured)

Payload numbers leave out the per-message cost on the real path:
- WebSocket header: 2–4 B.
- TLS 1.3 record: ~22 B.
- TCP/IPv4 with timestamps: ~52 B per segment, when each message is its own segment.

That adds ≈ 78 B per message. At ~48 down messages/s that is up to **~3.7 KB/s down** and, with 21 inputs/s, ~1.6 KB/s up, plus ACKs. Cloudflare re-terminates TLS at its edge and may coalesce some of this, so the real figure is lower. It can only be measured on a phone (the 2.10 doc already says 5–15 %).

---

## 4. Findings

Evidence grades: **Confirmed** (observed in code or measurement), **Deduced** (follows from confirmed facts), **Hypothesized** (plausible; says what would confirm it).

**F1. Packet loss breaks NFR5 through the rewind cap. (Confirmed)**
- **The chain:** a TCP stall holds every later input.
  - **Backlog:** the server applies one input per tick, so a 200 ms stall leaves ~4 extra inputs queued.
  - **Lag:** that queue adds ~200 ms of input lag.
  - **Slow drain:** draining only starts after 2 s and skips every 2nd tick (`RunController.ts:66-77`).
- **Result:** until the queue drains, every shot's view is RTT/2 + queue + render delay ≈ 75 + 200 + 140 ms old. That is past the 300 ms rewind limit, so the server tests the shot against zombies that have moved on.
- **Evidence:** §3.5, where 38–73 % of shots were over the cap. Fast targets suffer most (Runners at 4 m/s).
- **Fix check:** a 500 ms window cuts Runner reversals by 4–9× (confirmed by the one-off run).
- **Why a longer window is safe here:** the 300 ms cap is "the rewind an honest 300 ms-ping player gets" (`limits.ts:35-40`). Elsewhere a rewind cap protects the player being shot [14]. Here the targets are zombies, so there is no victim.

**F2. Some predicted shots never happen on the server. (Confirmed)**
- **How:** inputs skipped by the backlog drain, or overflowing the 6-input ring on stalls > 300 ms, get only a "dry" weapon tick (`RunController.ts:500-535`).
- **Size:** 7–26 of 459 shots (1.5–5.7 %) in §3.5.
- **Effect:** this is a second source of reversed hits that the longer rewind does not fix.

**F3. The render delay ceiling (150 ms) is below a single TCP retransmit on 4G. (Confirmed)**
- **The gap:** on a lossy line, p99 frame gaps are 240–250 ms (§3.3).
- **Practice elsewhere:** ~3 send intervals survive one lost packet [3][11]. That is UDP practice, where a loss is just a missing update, and our 150 ms ceiling already equals 3 intervals at 20 Hz. Over TCP a loss is a retransmit stall instead (~1 RTT or more), which these sources don't size; our measurement (240–290 ms gaps) does. Adaptive schemes size the buffer from measured lateness and stretch time by 0.85–1.1× instead of jumping [12].
- **Ours, two flaws:**
  - The jitter estimate uses *gaps*, so it doesn't see a slowly growing queue (bufferbloat) (`adaptiveDelay.ts:42-47`), and one gap counts as at most 100 ms of jitter (`JITTER_SAMPLE_CAP_MS`, `netConfig.ts:33`), so even a 300 ms stall barely raises it.
  - The delay creeps at only 20 ms/s.

**F4. Freeze-then-jump after a stall. (Confirmed in code; visible effect deduced)**
- **In code:** nothing extrapolates or time-stretches. When the burst lands, all frames apply at once and the newest wins (`snapshots.ts:244-274`, `hordeBuffer.ts:191-247`).
- **Margin zombies:** `HORDE_MISSING_LIMIT = 3` counts frames, not time. In a burst, 3 frames can arrive in one task, so a zombie at the view margin can blink out early (`hordeFormat.ts:28`).

**F5. The server clock estimate jumps when latency rises. (Confirmed in code)**
- **Why:** the minimum offset over 2 s is used raw (`serverClock.ts:40-51`).
- **When:** after a lasting latency rise (bufferbloat, a cell handover), the old minimum leaves the window.
- **Effect:**
  - `renderTick` steps backward in one frame, so teammates and zombies rewind visibly.
  - The `viewTick` sent with shots jumps too.
- **Practice elsewhere:** adjust in small steps and never move time backward [12][27].

**F6. The patch timer is separate from the tick. (Confirmed)**
- **Setup:** `patchRate = 50` runs its own interval (`RunRoom.ts:152,273`) next to the fixed-timestep tick (`RunRoom.ts:718`).
- **Effect:** patches carry 0 or 2 ticks now and then. The clock (F5) and jitter estimate (F3) are fed from patch arrivals, so this adds noise.
- **Cost of the three-stream design:** each tick makes 3 separate socket writes (horde, events, patch), ≈ 48 segments/s down (§3.3, §3.6).

**F7. The horde stream sends a full snapshot every tick. (Confirmed)**
- **The waste:** 94 % of zombies in view move every tick, but only by a few cm. A delta against the previous frame sent halves the bytes. A priority rule (far zombies at 10 Hz) cuts about two-thirds (§3.4).
- **Practice elsewhere:** delta against the last acked state [1][4]; send far or unimportant objects less often via priority/accumulators [2][4][26].
- **Our advantage:** over TCP, "acked" is simply "sent".

**F8. Epic 6 adds load near the edge. (Deduced from the story files)**
- **Behemoth (6.5):** ≲ 0.8 KB/s, offset by fewer zombies (110).
- **Car alarm / stampede (6.8):** up to 180 alive, 30 Runners in a pack. If the pack and the horde are on one screen, the horde stream alone is 28.2 KB/s, over the brief's 24 KB/s.
- **Events:** `boss.hit` ≤ 400 B/s.
- **6.10 survivor NPC:** ~0.2 KB/s.
- **6.3 / 6.4 / 6.11 / 6.12:** negligible.

**F9. NFR9 is exposed to ordinary 4G dead spots. (Confirmed in code; real-world effect from research)**
- **Server side:**
  - No reconnect (`RunRoom.ts:378-386`; Story 8.1 is in backlog).
  - The transport terminates after 2 missed pings at 3 s, i.e. ≈ 6–9 s of silence (`WebSocketTransport.mjs:53-54,161-171`).
- **Client side:** no "no data for N s" watchdog, so the player sees nothing while the SDK retries in vain for up to ~56 s.
- **iOS Safari bugs:**
  - After > 10 s in the background, Safari's new WebSockets can hang in CONNECTING until the page reloads (WebKit bug 308073, open) [20].
  - Safari may not fire `onclose` when the network drops (WebKit bug 247943).
- **LTE radio wake-up:** waking from idle costs ~260 ms [21]. That doesn't matter mid-run (20 Hz traffic keeps the radio awake) but does after a lobby or a resume.

**F10. The dev throttle can't show any of this. (Confirmed)**
- **What `?lag=&jitter=` lacks:** loss, stalls and bandwidth limits. A phone tester on Wi-Fi with `?lag=150&jitter=20` sees a better line than real 4G.
- **The bots:** no throttle option at all. This audit had to add a proxy.

**F11. Small waste. (Confirmed)**
- **Input size:** each input is a 116 B msgpack map with key names (≈ 64 B of names) and float64 sticks. A positional binary input is ≈ 14 B.
- **Up traffic:** 2.3 KB/s up today. Not an NFR, but 21 extra packets/s on the radio.
- **Event decoding:** one object per event on the phone (`netEvents.ts:290-315`).
- **Buildings mirror:** O(B²) per frame (`apps/client/src/net/mirrorBuildings.ts:13-62`). Fine today, watch with many buildings.

**F12. Backpressure threshold too high to matter. (Hypothesized)**
- **The threshold:** 64 KB of unsent bytes is ~2.5 s of traffic at 25 KB/s.
- **Why it rarely fires:** `bufferedAmount` only grows once the kernel send buffer is full, so short stalls never trigger the skip.
- **Consequence:** after a stall, stale horde frames are still delivered and decoded, only to be dropped as old. That makes the burst bigger.
- **Would confirm:** a phone capture or a proxy run with a bandwidth cap, logging `framesSkipped` against the stall length.

**Hypotheses considered**

| # | Hypothesis | Status | Resolution |
|---|---|---|---|
| H1 | Raising `REWIND_CAP_MS` alone fixes F1 | **Refuted** | No change; `REWIND_MAX_TICKS` also caps it (`RunController.ts:64`) |
| H2 | Raising both to 500 ms / 10 ticks fixes most of F1 | **Confirmed** | Runners 7.6 → 2.0 %, 11.9 → 1.3 % (§3.5) |
| H3 | A faster backlog drain cuts the rest (F2) | Open | Would confirm: `hitsLossSim` with `INPUT_DRAIN_AFTER_TICKS` 40 → 10. The Story 2.4 review warned that draining too early causes starve → drain → starve, so measure both |
| H4 | Merging the 3 writes per tick into one saves ~1.5–2 KB/s on 4G | Open | Would confirm: a phone packet capture, or a proxy counting segments with TLS |
| H5 | Bots understate the in-view crowd | Confirmed | 26–57 per frame vs 118 in the encoding run; the worst case is computed |

---

## 5. Research: what other games and engines do

Run with `bmad-deep-recon` (technical, standard preset, 3 parallel researchers, normal validation; load-bearing claims spot-checked, several against the installed source code). Sources in the appendix; confidence per claim.

**State sync and bandwidth**
- **Delta against the last acknowledged state is standard.** Fiedler's cube demo starts at 17.4 Mbps uncompressed and targets 256 kbps; with only changed objects sent, steady state is ≈ 15 kbps. An unchanged object costs 1 bit, a small relative move ~26 bits, and indices are relative (~5.5 bits) [1]. The Tribes "ghost manager" keeps a per-object dirty mask, never resends lost data, and after a loss re-sends only the *latest* values [4]. (high; old but still the reference pattern)
- **Priority and bandwidth budgets.** Fiedler's priority accumulator: every object's priority adds up each frame, and the packet is filled highest-first within a byte budget [2]. Tribes and Halo Reach fill each packet by priority within a per-connection budget [4][29]. Unreal scales priority by distance and time since the last send [26]. This is the textbook way to send far zombies less often. (high for Fiedler and Tribes; low–medium for Halo Reach, a secondary summary)
- **Colyseus costs.** About 1 B + refId per changed object and 1 B + value per changed field. The docs' example of 60 moving entities costs 9.4 KB/s quantized vs 14.1 KB/s float32 [5]. RefIds are never reused (headers grow past 128 / 256 instances) [5]. `StateView` makes the server encode per client and is "not optimized for large datasets yet" [6][7]. No per-client patch rate is documented [5]. **This confirms the 2.5 decision to keep the horde out of the schema.** (high)
- **Compression.** permessage-deflate is off by default in Colyseus. `ws` warns of significant CPU and memory cost (memory fragmentation on Linux) and skips messages < 1 KB by default [9][10]. Most of our messages are < 1 KB, and quantized binary compresses poorly (an inference; no measurement found). (medium)

**Timing**
- **20 Hz is a defensible tick.** Apex Legends runs 20 Hz servers. Its developers say 60 Hz would cost 3× the bandwidth to win ~2 frames of delay [13]. Photon lists 30 Hz as typical on mobile [30]. (high / medium)
- **Interpolation buffer.** Source's default is 100 ms at 20 updates/s (2 intervals). An interp ratio of 3 survives 1 lost packet, 4 survives 2 [11]. Fiedler found ~3× the send interval plus jitter margin best at 2–5 % loss [3]. Unity Netcode adapts the buffer from RTT, jitter and arrival rate: defaults 2 ticks × 1.25, playback speed 0.85–1.1× to drain or refill, ~10 % of the error corrected per frame, time never runs backward [12]. (high; Valve medium, page fetch refused)
- **Input buffering.** Overwatch runs the client ~RTT/2 + 1 frame ahead and resends all unacked inputs in each packet. When the server starves it repeats the last input and has the client speed up ~5 % until the buffer refills [15]. Unity's defaults: inputs arrive 2 ticks early, 2 redundant inputs per packet, prediction speed 0.9–1.1× [12]. Margin ≈ 3 standard deviations of jitter [27]. (medium / high)
- **Lag compensation limits.** Source keeps 1 s of history (`sv_maxunlag`) [11]. Valorant caps the rewind (value unpublished) so a 500 ms player can't kill after the target reaches cover [14]. Overwatch reportedly stops predicting hit impacts above ~220 ms RTT [15]. The cap exists to protect the *target* [14]; favour-the-shooter accepts some unfairness to the target in exchange [16]. No published rate of reversed hits was found to compare with NFR5. (high / medium)

**Transport and mobile networks**
- **TCP head-of-line blocking.**
  - **How it works:** one lost segment holds every later message until its retransmit [25].
  - **Numbers:** no rigorous public measurement at 1–2 % loss and 100–150 ms RTT was found. Blogs quote 100–300 ms spikes (low confidence). This audit's proxy models it explicitly instead.
- **WebTransport.** Shipped in **Safari 26.4 (March 2026)**; caniuse lists Chrome 97+, Firefox 114+, Safari/iOS 26.4+, Chrome Android [17][18] (high). But:
  - **iOS datagrams missing:** an open WebKit report says `datagrams` is undefined on iOS 26.6, with flow-control stalls on 26.6.1 (single reporter, **unverified**) [19].
  - **Colyseus support is experimental:** `@colyseus/h3-transport` "hasn't been battle tested" [8]. The installed `@colyseus/core` 0.18.29 also calls it experimental (`node_modules/@colyseus/core/src/Room.ts:289-321`). Its `@unreliable` fields stop updating on WebSocket clients [8].
  - **Cloudflare:** no source found shows that Cloudflare Tunnel carries WebTransport to an origin. The Tunnel's QUIC is only connector-to-edge [23] (low confidence: absence of evidence).
- **WebRTC DataChannels.** Unreliable modes work in iOS Safari since 11 [19]. A server such as geckos.io needs an open UDP port range on the VPS [24]: real ops cost for us (Cloudflare Tunnel only). (medium)
- **4G behaviour.**
  - **Typical numbers:** median LTE RTT ~40 ms, delay variation ~14 ms [22]. Handovers cause latency peaks (R&S 2024 measurement, same publisher as [22]). VoIP targets are ≤ 1 % loss and < 30 ms jitter [28].
  - **Radio wake-up:** RRC idle → connected costs ~260 ms; the radio stays up ~11.6 s after the last packet [21].
  - **iOS Safari:** the background WebSocket bugs in F9 [20]; `onclose` not firing on a network drop (WebKit bug 247943, per its Bugzilla page and Apple's developer forums).
  - (low–medium for the numbers; high that the Safari bug report exists)

**What this means for us** (cross-dimension): the biggest problems are not bytes; they are what happens *around a lost packet*. TCP turns a lost packet into a 200–300 ms stall plus a burst. Today our rewind, render delay and input queue are each sized for a clean line (300 ms, 150 ms, 300 ms). Industry practice sizes them for one lost packet, adapts smoothly, and never jumps time. Changing transport would remove the stall, but on iPhone that path isn't reliable in late 2026 and it doesn't fit our hosting. Bytes are a second priority: today's margin is enough for Epic 6 at 150 alive, not at 180 on one screen. A delta horde stream is the cheap, well-known fix.

---

## 6. Ranked improvements

Effort: **S** ≈ half a builder session, **M** ≈ one session, **L** ≈ 1–2 sessions. Ranked by how much they move NFR3/4/5/9 per unit of effort; #2 is an enabler (no NFR effect of its own) ranked high because #1, #3, #5 and #6 can't be checked without it.

| # | What it is (plain English) | Expected effect (numbers) | Effort | Risk | Files |
|---|---|---|---|---|---|
| **1** | **Longer rewind for shots at zombies**: the server may look up to 500 ms back (today 300 ms; ~600 ms if #3 ships without #5, see #3), so a shot still counts after a 4G hiccup. Zombies are the only targets, so nobody is treated unfairly. | Reversed hits on kiting Runners at 1 % / 2 % loss: **7.6 → 2.0 %, 11.9 → 1.3 %** (measured, §3.5). Memory: 4 more history rows (256 × 4 floats). | **S** | Low. A cheater could shoot at a half-second-old view; in PvE that only helps their team, and it's already logged (2.12). Re-run `tickCostRewind`. | `apps/server/src/net/limits.ts` (`REWIND_CAP_MS`), `packages/shared/src/config/constants.ts` (`REWIND_MAX_TICKS`), `combat/rewind.ts` tests, `tools/netsim` 2.12 tests |
| **2** | **"Lossy line" test switch**: `?lag=150&jitter=20&loss=1` in the dev throttle, the same option for the bots, and the loss model in the hits harness, so phone testers on Wi-Fi and agents see real 4G hiccups. Keep `tools/netaudit/lagProxy.ts` as the bots' line. | Makes 1, 3, 4 and 6 testable. The 2.10 test becomes honest for Wi-Fi phones. | **S** | None (dev only). | `apps/client/src/net/devThrottle.ts`, `netConfig.ts`, `tools/bots/*`, `tools/netsim/hitsSim.ts` (merge `hitsLossSim.ts` back) |
| **3** | **Smooth through hiccups**: wait up to ~250 ms instead of 150 when the line is bad, and judge "bad" by how *late* frames are, not by gaps. After a stall, play a little faster (up to 1.1×) to catch up instead of jumping. Move the clock in small steps (never backwards). Drop margin zombies after 150 ms, not after 3 frames. | Lossy line: most 200–300 ms stalls hidden (p99 gap 240–250 ms < 250 ms delay); no backward rewinds. Cost: +0–100 ms delay **only** while the line is bad (clean lines stay at 100–150). | **M** | Medium. Feel change; `viewTick` (2.12) comes from the same timeline, so a longer delay makes shots older: 75 ms one-way + ~200 ms queue after a stall + 250 ms delay ≈ 525 ms, over #1's 500 ms. Either #5 shrinks the queue first, or #1 goes to ~600 ms (12 ticks). The 500 ms test (§3.5) ran with today's 100–150 ms delay; re-run `hitsLossSim` with both changes. | `apps/client/src/net/adaptiveDelay.ts`, `serverClock.ts`, `netConfig.ts`, `hordeBuffer.ts`, `snapshots.ts`, `apps/client/src/sim/NetSimHost.ts` |
| **4** | **Reconnect (Story 8.1, pulled forward) + a "reconnecting…" watchdog**: hold a dropped player's seat for 120 s. The phone notices "no data for 3 s" and says so. On iPhone, if a reconnect hangs after the app was in the background, reload into the seat (WebKit bug). Raise the transport's ping tolerance a bit (e.g. 3 s × 4 ≈ 12–15 s). | NFR9: a 6–9 s dead spot or an app switch no longer ends a player's run. | **L** (8.1's ACs + watchdog + Safari resume) | Medium: seat state, a downed player counts as out, bots for tests. | `apps/server/src/rooms/RunRoom.ts` (`onDrop`/`allowReconnection`), `apps/server/src/app.ts` (`pingMaxRetries`), `apps/client/src/net/session.ts`, `lobbyStore.ts`, `main.ts` |
| **5** | **Gentler backlog recovery after a stall**: instead of skipping inputs after 2 s, let the phone run its own steps slightly slower for a moment (Overwatch/Unity: 0.9–1.1× [12][15]), so the server's extra queue empties without dropping anyone's moves or shots. A shorter skip delay is **not** the answer: the Story 2.4 review sim found 0.5 s added ~35 % more starved ticks (`RunController.ts:70-74`); at most try ~1 s alongside. | Aims at the 1.5–5.7 % "shot predicted but never fired" (F2) and the extra ~200 ms input lag after a hiccup. Size to be measured with #2 (H3). | **M** | Medium: client timing change; measure starved ticks and reversed hits together. | `apps/server/src/run/RunController.ts` (`INPUT_DRAIN_*`), maybe `NetSimHost.ts` |
| **6** | **Half-size horde stream**: send only what changed since the last frame (TCP guarantees the phone has it), let the phone work out heading from movement, and refresh far zombies (> 8 m) 10×/s instead of 20×/s. Full frame on join, after a skipped frame and once a second. | Measured on real movement: **18.6 → 10.6 KB/s** (delta) → **8.9 KB/s** (+ heading on the phone) → **6.5 KB/s** (+ far at 10 Hz). Worst case 150 in view **23.6 → ~8–11 KB/s**; the stampede's 180 in view fits easily. | **M** | Medium: a decoder bug shows wrong positions; the 1 s keyframe bounds it; round-trip and fuzz tests; bots decode it too. | `packages/shared/src/net/hordeFormat.ts`, `apps/server/src/net/hordeEncoder.ts`, `apps/client/src/net/hordeDecoder.ts`, `hordeBuffer.ts`, `devThrottle.ts` (`THROTTLE_BYTES_MAX`), `tools/bots/botClient.ts` |
| **7** | **One packet per tick**: send the state patch from the tick itself (not its own timer), and write horde + events + patch together. | Down segments ~48 → ~21/s; ≈ 1.5–2 KB/s less on the 4G wire (estimate, H4); patches carry exactly one tick (less clock noise, helps #3). | **S–M** | Low–medium: Colyseus internals (`patchRate = null` + `broadcastPatch()` in `onTick`; socket cork) need a check on 0.18.29. | `apps/server/src/rooms/RunRoom.ts` |
| **8** | **Smaller input message**: positional binary instead of a named map. | Up 2.3 → ~0.5 KB/s payload. | **S** | Low; the guard must validate the binary form. | `packages/shared/src/net/input.ts`, `messages.ts`, `apps/client/src/sim/NetSimHost.ts`, `apps/server/src/rooms/RunRoom.ts`, `messageGuard.ts` |
| **9** | **Measure the horde backpressure first** (64 KB today): log `framesSkipped` against stall length with a bandwidth-capped proxy. Only if frames really pile up, add a check that also sees the kernel's buffer (a lower `bufferedAmount` threshold alone may not help, F12). | Unknown until measured (F12 is a hypothesis). | **S** | None (measurement). | `packages/shared/src/net/hordeFormat.ts`, `tools/netaudit/lagProxy.ts` |

**Not recommended now** (with the reason):
- **WebTransport / WebRTC.** iOS datagrams are reported broken, Colyseus support is experimental, and no source shows Cloudflare Tunnel carries it [8][19][23]. Re-check in mid-2027 (staleness map).
- **permessage-deflate.** It costs CPU and memory for little gain on small binary frames [9][10].
- **A higher tick or send rate.** 3× the bytes for ~2 frames [13].
- **`StateView` for the 4 players.** Patches are 55–66 B. It only pays off for many entities, and Colyseus itself warns about large sets [6][7].

---

## 7. What to turn into stories, and where

**Recommendation: a Network pass of 4 stories (+ 1 optional) right after Epic 6 and before Epic 7, filed at the front of Epic 8 "Real-life resilience"** (that epic is already about bad connections, and its 8.1 reconnect is item #4). Epic 10 is too late: NFR9 is due from Epic 6 on (`epics.md:308`), and the Epic 6 stampede eats the bandwidth margin.

| Story | Contains | Why this order |
|---|---|---|
| **N1 "My shots count on a bad 4G line"** | #1 + #2 | Biggest NFR5 win, small, server-only, plus the test switch everything else needs |
| **N2 "Smooth through hiccups"** | #3 + #5 | Client-only (#5's time-stretch is client-side); can run in parallel with N1 (different files). Uses N1's test switch; re-checks the rewind window with the new delay (#3 note) |
| **8.1 "Reconnect within 2 minutes" (pulled forward, ACs extended)** | #4 | NFR9; large; after N1/N2 so its tests can use the lossy line |
| **N3 "Half-size horde stream"** | #6 (+ the #9 measurement) | Frees bandwidth for Epic 6's stampede and later art; after N2 (both touch `hordeBuffer.ts`) |
| **N4 "One packet per tick"** (optional) | #7 + #8 | Polish, wire overhead; any time after N1 |

Then **your 4-phone 4G test (2.10)** as the check, with Wi-Fi phones using `&loss=1`.

**If you'd rather not wait for Epic 6 to finish:** N1 is small and touches only the rewind constants and test tools. It could run next to Epic 6 round 2 if a pre-check confirms that the 6.5–6.7 Behemoth stories don't change `combat/rewind.ts`. Otherwise keep it after Epic 6.

**For Epic 6 builders now (no story needed):** story 6.8's bandwidth test should assert the worst case "stampede + horde in one view" against the brief's 24 KB/s. Today it would read ~28 KB/s at 180 in view (F8), so 6.8 either caps "alive in view" or waits for N3.

---

## 8. Not verified, and how to reproduce

- **Not measured:**
  - real phones and real 4G;
  - true packet loss (the proxy models loss as ordered stalls, which is TCP-like but not TCP);
  - TLS/TCP overhead (§3.6 is an estimate);
  - FPS impact;
  - iOS Safari background behaviour (research only).
- **Bots versus real players:** the bots spread out more than real players; the 150-in-view worst case is computed.
- **The one-off rewind experiment** edited two constants locally and reverted them right away (`git status` clean apart from `tools/netaudit/`). Nothing of it is on this branch.

Reproduce (own ports; stop processes by PID):

```bash
cd apps/server && PORT=4067 ALLOW_TEST_SCENARIOS=1 DEV_WAVE_MIX=walker,walker,runner,crawler,spitter,bloater DEV_DECAY_STAGES=3,3,3,3,3,3 node --import tsx src/index.ts
```

```bash
node --import tsx tools/netaudit/lagProxy.ts --listen 4167 --target 4067 --rtt 150 --jitter 20 --out proxy.json
```

```bash
npm run bots -- --url http://localhost:4167 --count 4 --scenario net150 --until-wave 5 --hold-fire 45
```

```bash
npx tsx tools/netaudit/runHits.ts 60 3
```

```bash
npx tsx tools/netaudit/hordeEncodings.ts 600
```

Add `--stall-prob 0.01 --stall-ms 200` to the proxy for the 1 % loss line. Stop the proxy with SIGTERM (it writes its report then).

---

## Appendix A: Sources

Accessed 2026-11-24. Confidence per source as used above. Local code citations (`path:line`) are primary and not listed.

| # | Supports | Publisher | Date | Confidence |
|---|---|---|---|---|
| 1 | Delta vs last acked snapshot; bit costs; 17.4 Mbps start | [Gaffer On Games, Snapshot Compression](https://gafferongames.com/post/snapshot_compression/) | 2015-01 | high (old, still the reference) |
| 2 | Priority accumulator, byte budget | [Gaffer On Games, State Synchronization](https://gafferongames.com/post/state_synchronization/) | 2015-01 | high |
| 3 | Buffer ≈ 3× send interval at 2–5 % loss | [Gaffer On Games, Snapshot Interpolation](https://gafferongames.com/post/snapshot_interpolation/) | 2014-11 | high |
| 4 | Tribes ghost manager: masks, priorities, resend latest only | [Frohnmayer & Gift, Tribes networking model](http://gamedevs.org/uploads/tribes-networking-model.pdf) | ~1999 | high (old) |
| 5 | Colyseus patch byte costs, refIds, no per-client rate | [Colyseus docs, state optimization](https://docs.colyseus.io/state/optimization) | current (0.18) | high |
| 6 | StateView per-client encode | [Colyseus docs, StateView](https://docs.colyseus.io/state/view) | current | high |
| 7 | 0.16 StateView, "not optimized for large datasets" | [Colyseus blog, 0.16](https://colyseus.io/blog/colyseus-016-is-here/) | 2025-02 | high |
| 8 | h3-transport experimental; unreliable fields stop on WS | [Colyseus docs, WebTransport](https://docs.colyseus.io/server/transport/webtransport) | current | high (also in installed `@colyseus/core` source) |
| 9 | WS transport defaults (deflate off, ping 3 s) | [Colyseus docs, ws transport](https://docs.colyseus.io/server/transport/ws) | current | high (also installed source) |
| 10 | permessage-deflate CPU/memory warning, 1 KB threshold | [ws README](https://unpkg.com/ws@8.18.2/README.md) | current | medium |
| 11 | Source: 100 ms interp, ratio 3 survives 1 loss; sv_maxunlag 1 s | [Valve Developer Wiki, Source Multiplayer Networking](https://developer.valvesoftware.com/wiki/Source_Multiplayer_Networking) | long-standing | medium (fetch refused; search extracts) |
| 12 | Adaptive interpolation and command slack defaults | [Unity Netcode for Entities, ClientTickRate](https://docs.unity3d.com/Packages/com.unity.netcode@1.4/api/Unity.NetCode.ClientTickRate.html) | 2024–25 | high |
| 13 | Apex 20 Hz; 60 Hz = 3× bandwidth for ~2 frames | [EA, Apex servers and netcode deep dive](https://www.ea.com/games/apex-legends/news/servers-netcode-developer-deep-dive) | 2021-04 | high |
| 14 | Valorant buffers, rewind cap exists, peeker's advantage | [Riot, Peeking into Valorant's netcode](https://www.riotgames.com/en/news/peeking-valorants-netcode) | 2020-07 | high |
| 15 | Overwatch input redundancy, starvation speed-up, 220 ms cutoff | [Edgegap, Overwatch netcode summary of Ford GDC 2017](https://edgegap.com/blog/game-backend-deep-dive-overwatch-2016-netcode-architecture-rollback) | 2026 | medium (secondary) |
| 16 | Favour-the-shooter rationale | [Gabriel Gambetta, Lag compensation](https://www.gabrielgambetta.com/lag-compensation.html) | undated | high |
| 17 | Safari 26.4 ships WebTransport | [WebKit, Safari 26.4 features](https://webkit.org/blog/17862/webkit-features-for-safari-26-4/) | 2026-03 | high |
| 18 | Browser support table | [caniuse, WebTransport](https://caniuse.com/webtransport) | live | high |
| 19 | iOS 26.6 datagrams undefined (WebKit 322201), DataChannels on iOS, Safari onclose (247943) | [GitHub, djosh34/t3-optimizations #2](https://github.com/djosh34/t3-optimizations/issues/2) | 2026-11 | medium (unverified bug claims) |
| 20 | iOS Safari WebSocket stuck after > 10 s background | [WebKit Bugzilla 308073](https://bugs.webkit.org/show_bug.cgi?id=308073) | 2026-02 | high (report exists) / medium (generality) |
| 21 | LTE RRC promotion ~260 ms, tail ~11.6 s | [Huang et al., MobiSys 2012](https://www.cs.sjtu.edu.cn/~xue-gt/wireless/Paper/Energy%20efficiency%20of%20cellular%20network%20and%20smartphone/A%20Close%20Examination%20of%20Performance%20and%20Power.pdf) | 2012 | medium (old) |
| 22 | LTE median RTT ~40 ms, PDV ~14 ms; handover peaks | [Rohde & Schwarz, LTE field campaign](https://www.rohde-schwarz.com/cac/_256032.html) | 2022 / 2024 | low–medium |
| 23 | Cloudflare Tunnel QUIC is connector-to-edge only | [Cloudflare blog, Tunnels over QUIC](https://blog.cloudflare.com/getting-cloudflare-tunnels-to-connect-to-the-cloudflare-network-with-quic/) | various | low (on proxying) |
| 24 | geckos.io needs an open UDP port range | [geckos.io](https://github.com/geckosio/geckos.io) | various | medium |
| 25 | TCP head-of-line blocking for games | [Gaffer On Games, UDP vs TCP](https://gafferongames.com/post/udp_vs_tcp/) | 2008 | medium (old pattern) |
| 26 | Unreal net priority by distance / time since sent | [Epic, Actor priority](https://dev.epicgames.com/documentation/en-us/unreal-engine/actor-priority-in-unreal-engine) | current | medium |
| 27 | Timing margin ≈ 3σ jitter; asymmetric correction | [GameDev.net, command frames and tick sync (hplus0603)](https://gamedev.net/forums/topic/696756-command-frames-and-tick-synchronization/?page=1) | 2018-05 | medium |
| 28 | VoIP over LTE targets: ≤ 1 % loss, < 30 ms jitter | [arXiv 2009.12580](https://arxiv.org/pdf/2009.12580.pdf) | 2020 | low–medium |
| 29 | Halo Reach fills packets by priority (Aldridge, GDC 2011) | [Edgegap, Halo Reach netcode summary](https://edgegap.com/blog/game-backend-deep-dive-halo-reach-netcode-host-migration) | undated | low–medium (secondary) |
| 30 | 30 Hz typical tick on mobile | [Photon Quantum](https://www.photonengine.com/quantum) | undated | medium (search extract) |

## Appendix B: Staleness map (re-check dates)

| Claim | Class | Re-check by |
|---|---|---|
| Safari/iOS WebTransport datagrams broken [19] | browser support | **2027-01** (fastest-ageing; re-check on each iOS 26.x/27 release) |
| Colyseus h3-transport "experimental" [8] | version | 2027-01 |
| Cloudflare Tunnel doesn't carry WebTransport [23] | platform | 2027-05 |
| WebKit 308073 open [20] | bug status | 2027-01 |
| Colyseus schema byte costs [5] | version | on any Colyseus upgrade |
| Interpolation / priority / delta patterns [1–4][11–14] | pattern | 2028 |

Earliest re-check: **January 2027**, for the iPhone transport question. A `bmad-deep-recon` Refresh on this topic handles it.
