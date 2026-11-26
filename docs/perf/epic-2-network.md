# Epic 2 network test: 4 phones, 150 Walkers (NFR3, NFR4, NFR5)

Story 2.10. This note records whether online co-op with a big horde works on phones over mobile data: Milestone 1's first goal. The phone test is run by the designer and three friends. The local bot baseline below was measured by the dev agent before it.

> **Refreshed 2026-11-26 for the Network pass (Stories 8.8–8.11, 8.1).** The test steps are unchanged. What changed is the netcode under them and the numbers to expect. Read the next section first. The "Local bot baseline (2026-11-22)" further down is the **before** picture and is kept as it was measured. (Epic 8 retro E8-A5, readiness N-1.)

## Network pass update (2026-11-26)

Sources: `docs/perf/network-pass-2026-11.md` (one section per story), the story files `8-8-*`, `8-9-*`, `8-10-*`, `8-11-*` and `8-1-*` in `_bmad-output/implementation-artifacts/`, and the smokes `docs/perf/network-pass-smoke-2026-11-25.md` and `network-pass-smoke-8-1-2026-11-25.md`. **Every number here is from the bots, the netsim harness or headless Chrome. None is from a real phone or real 4G.**

### What changed since the 2026-11-22 baseline

| Story | Change | Measured (before → after) |
| --- | --- | --- |
| 8.8 | Rewind window 300 → 500 ms. A lossy line in the dev throttle (`&loss=1`), the bots (`--loss 1`) and the harness | 20 Runners kiting, 1 % × 200 ms stalls: reversed 7.6 → 2.0 %; 2 %: 11.9 → 1.3 %. Clean line 0.2 % both |
| 8.9 | Smooth through hiccups: render delay 100 ms on a clean line, up to the 250 ms cap on a lossy one; paced input steps; **rewind 500 → 600 ms** (`REWIND_CAP_MS` 600, `REWIND_MAX_TICKS` 12, 8.8 D1's fallback) | Freezes per 30 s on 1 % rows: 6–6.9 → 0.9–1.2. Predicted shots that never fired: 1.3–2.6 % → 0 %. At 600 ms: Runners 1 % 0.7 %, 2 % 1.4 %; 150 Walkers 0.3 % / 1.1 %; 0 % of shots over the cap |
| 8.1 | Reconnect within 2 minutes: the survivor is held, and the seat comes back with HP, wallet and weapons | Back about 0.05 s (clean) / 0.3 s (lossy) after an 8 s cut. The phone shows "reconnecting" after 3.1 s |
| 8.10 | Horde stream as per-client keyframes + deltas (`NET_PROTOCOL_VERSION` 2). As shipped every zombie stays at 20 Hz (B7) | Audit replay 18.6 → 8.2 KB/s; stampede (180 in one view) 28.2 → 13.5 KB/s worst second. Bots, horde per phone 8.6–12.6 → 2.6–5.5 KB/s as shipped. New horde budget ≤ 16 KB/s |
| 8.11 | One packet per tick; a 14-byte binary input (`NET_PROTOCOL_VERSION` 3) | Down writes per phone 46 → 20 per s. Input upload 2.3 → 0.31 KB/s. Exactly one tick per patch. Server tick avg 1.26–1.30 → 0.87–1.02 ms |
| 8.13 | Slow-line horde skip: the input carries a 2-byte tick ack (16 B, `NET_PROTOCOL_VERSION` 4); the server skips a phone's horde frames while they wait > 300 ms in the line, then sends a keyframe | Bots, 64 kbit/s with 0.2 / 0.4 / 1 s stalls: longest wait ≈ 8 s → 674 / 774 / 383 ms, 0 decode errors. 128 kbit/s and clean: 0 skips. Encoder replay unchanged (8.9 KB/s on master and after) |

### What this means for the 4-phone test

- **Everyone on the same build.** The wire format is at protocol 4 (Story 8.13). A phone with an older cached page is refused at join (`update_required`); reload it.
- **Expect much lower numbers than the targets.** On the bots (8.11 runs, waves 4–5, 150 alive), the download per phone adds up to about 6–8 KB/s: horde 4.0–5.8, patches 1.3–1.5, events 0.4–0.7 KB/s (NFR4 target ≤ 30). The numbers-box examples in the table below (`down 21.4`, `up 2.3`) are from before the Network pass. On a lossy line `delay` sits near 250 ms; on a clean one near 100 ms.
- **Optional lossy line for a Wi-Fi phone:** `?debug=1&lag=150&jitter=20&loss=1` is the Network pass line (150 ms ± 20 ms, 1 % of messages stall 200 ms both ways). Write down which phones used it.
- **A short drop no longer ends the run for that phone.** If a phone loses signal, it shows "reconnecting" and should come back with the same survivor within 2 minutes. Write down any drop and whether it came back.
- **Still owed before this test (Epic 8 retro):** the copy-chain audit (E8-A2). 8.10 B6 (64 kbit/s lines queued frames for seconds) is closed by Story 8.13: on such a line a phone now sees the horde at ~15 Hz with a keyframe after each gap instead of seconds late. The debug overlay's horde keyframe count rises on such a phone; that is expected.

### Check: does `REVERSED_HIT_SLACK_MS` = 300 still fit the 600 ms rewind? (readiness N-1)

**Finding: yes. No code change is needed.** Read on 2026-11-26 against `apps/client/src/debug/reversedHits.ts`, `apps/client/src/sim/NetSimHost.ts:985–988`, `tools/netsim/hitsSim.ts:301`, `apps/server/src/net/limits.ts:55`, `apps/server/src/run/RunController.ts:83–96` and `packages/shared/src/config/constants.ts:58`.

- **The two numbers do different jobs.** The rewind cap (`REWIND_CAP_MS` 600 → `REWIND_CAP_TICKS` 12) sets how old a view the server will test a shot against. `REVERSED_HIT_SLACK_MS` is the client's **counter** window: after my bullet crosses a drawn zombie, the counter waits until RTT + render delay + 300 ms for the server's `zombie.hit`; if none comes, it counts a reversed hit. The harness uses the same window (2 × one-way + delay + 300).
- **Rewinding further does not make the answer come later.** The server reads its history when it processes the input. The wait for the answer is RTT + the input queue (settles at 2 inputs = 100 ms, `INPUT_QUEUE_TARGET`; at most 6 = 300 ms, `INPUT_QUEUE_MAX`) + up to one tick (50 ms). Since 8.11 the hit leaves in that tick's packet. A shot whose view is older than the cap is tested against a later picture and may miss. That is a real reversal, and counting it is the counter's job.
- **Margin.** Beyond RTT the window gives render delay + 300 ms: **400 ms** on a clean line (delay 100) and **550 ms** on a lossy one (delay at the 250 ms cap). The normal need is about 150 ms (100 ms queue + one tick). A full queue plus one 200 ms stall on the way back is about 550 ms, exactly the lossy margin.
- **What happens past the margin:** an answer that arrives later still counts as reversed. So the counter can only **over**-count. That is the safe direction for NFR5: a phone reading under 5 % is under 5 %. It happens with stalls above about 400 ms (the "1 % × 400 ms (record)" harness rows, which are not an AC), or when the RTT jumps faster than `session.rttMs` follows.
- **Evidence:** with the 600 ms window the harness reads 0.2 % on the clean line and 0.3–1.4 % on the 1–2 % × 200 ms rows, with 0 % of shots over the cap (8.9 T10). If the 300 ms slack were too short, late confirmations would show up as reversals in exactly those rows.
- **Watch on the phones:** if a phone reads ≥ 5 % reversed while its ping p95 is far above its average, check the over-count first (RTT spike, long stall) before calling it a netcode miss.

## How to run the 4-phone test

You need 4 phones (mobile data, Wi-Fi off), about 15 minutes, and Hermes for two small deploy steps.

**Before (Hermes):** deploy the same version with the test switch on (see [docs/deploy.md](../deploy.md) for `deploy.sh`; no file is edited on the VPS):

```bash
cd /root/topdown-shooter && ALLOW_TEST_SCENARIOS=1 deploy/deploy.sh <ref>
docker compose -f deploy/docker-compose.yml logs server | grep server_started | tail -1   # must show "allowTestScenarios":true
```

This lets the host start the fixed test. Without it the game runs a normal wave 1, and the host's numbers box says `scenario net150 refused by the server`.

**The test:**

1. **Host:** open `https://hordes.sevend.io/?debug=1&scenario=net150`, type a name, tap **Create game**, and send the share link to the others.
2. **Friends:** open the share link, then add `?debug=1` at the end, for example `https://hordes.sevend.io/j/ABCD?debug=1`. This shows the numbers box (a three-finger tap on the game also shows or hides it). Type a name and join.
   - A phone that can't use mobile data: stay on Wi-Fi and add `&lag=150&jitter=20` as well (`...?debug=1&lag=150&jitter=20`). It fakes a 4G delay. Add `&loss=1` for the Network pass's lossy line (2026-11-26 update). Write down which phones did this.
3. Everyone taps **Ready**. The host taps **Start**.
4. Check that the numbers box (top right, under ☰) starts with **TEST SCENARIO net150**. The wave banner says **Wave 4**: 160 Walkers, and nobody can die (god mode).
5. Play the wave to the end. Shoot, move around, stay together or split up: play the way you normally would. Keep the phone screen on and the game in front.
6. When "Wave 4 cleared" shows, a **Network results** box opens on each phone. Tap **Copy results** and paste the text into a chat with yourself (or straight into this file). If Copy fails, take a screenshot of the box. **Then leave: ☰ → Leave game.** Wave 5 starts 5 s later, and its report would replace an uncopied one.
7. Ask each player, and write down the answer word for word: **"Did you ever see something that didn't match what your friends saw?"** (a zombie that died on one screen but not another, a friend in a different place, a hit that didn't count).

**After (Hermes):** deploy again without the switch, and check it is off:

```bash
cd /root/topdown-shooter && deploy/deploy.sh <ref>
docker compose -f deploy/docker-compose.yml logs server | grep server_started | tail -1   # must show "allowTestScenarios":false
```

**What to read off the numbers box during the wave** (optional; the Copy results text has everything). The example values are from before the Network pass; see the 2026-11-26 update for what to expect now:

| Line | What it means | Good |
|---|---|---|
| `ping 142 ms · delay 140 ms · jitter 18 ms` | round trip to the server; how far behind others are drawn; how uneven the network is | ping under ~200 ms |
| `down 21.4 KB/s (avg 20.8, peak 26.1) · up 2.3 KB/s` | data received in the last second (wave average, busiest second); data sent | **avg ≤ 30** |
| `horde 20/s · corrections 0 · snaps 0` | zombie updates per second (20 is all of them); how often my own position was fixed by the server, and how often it jumped | horde ~20, snaps 0 |
| `hits 212 · reversed 4 (1.9%)` | my bullets that looked like hits; how many the server said missed | **reversed under 5 %** |
| `FPS 58 (min 41)` | smoothness | as high as possible |

**What to report:** for each phone, the pasted Copy results text (it ends with a ready-made table row: replace `(device)` with the phone model and `(4G / Wi-Fi + …)` with the network), the phone model, and the answer to the question. Then fill in the Results table and "What players saw" below.

## Method

| | |
|---|---|
| Build sha | (fill in: the deployed `GIT_SHA`, shown in the server's `server_started` log line) |
| Date | (fill in) |
| Scenario | `net150`: the host's `?scenario=net150`; the server (with `ALLOW_TEST_SCENARIOS=1`) starts at wave 4 (4 × 40 = 160 Walkers, so the 150-alive cap is reached) with god mode on. Pistols, real spawns, real AI, real hits. |
| Network per phone | (fill in per phone: 4G / 5G / Wi-Fi + `?lag=150&jitter=20`) |
| Throttle used | (fill in: none, or which phones used `?lag=150&jitter=20`) |

**What is measured, and how.**

- **Bandwidth** is WebSocket message payload, in KB/s where **KB = 1024 bytes**. WebSocket framing, TCP/IP and TLS overhead are **not** included (on 4G that adds roughly 5–15 %). The client counts every message its socket receives (`net/netMeter.ts`, a listener on the SDK's socket) and every frame it sends (a wrapper around `room.connection.send`), in 1-second buckets. The server counts the same bytes on its side (`net_stats`: a wrapper around each client's `raw()`, which every message, horde frame, state patch and the full state go through, and the socket's `message` event for what it receives). The two agree within 0.1 KB/s on the average.
- **avg** is from `wave.started` to `wave.ended`. **peak** is the busiest whole second of the wave. The receiving side sees a burstier peak than the sending side when delivery bunches up (bots on the busy test machine: 32.8 KB/s received vs 25.6 KB/s sent in the same second), so the average is the number for NFR4.
- **Ping** is the server's round-trip time for this phone (one `net.pinged` a second); the summary gives its average and 95th percentile over the wave.
- **Reversed hits** (Story 2.7): my own bullet crossed a zombie on my screen, and the server did not confirm a hit on that zombie by me within RTT + render delay + 300 ms (`REVERSED_HIT_SLACK_MS`). Only my gun shots count. The server rewinds shots up to 600 ms since Story 8.9; the 300 ms slack still fits that (see the check in the 2026-11-26 update). A late answer counts as reversed, so this number can only read high.
- **FPS** is the Story 1.11 measurement over the wave (average, and 1000 / the longest frame).
- The wave summary is measured only while the numbers box is on when the wave starts (`?debug=1`, or the three-finger tap before the wave), like the Story 1.11 numbers.
- `effectiveType (estimate)` in the report is the browser's own guess from measured speed (Chrome on Android; desktop Chrome says `4g` even on localhost). Write the real network in the table.

## Targets

| | Target | Source |
|---|---|---|
| NFR3 | The players report no visible disagreement. | "What players saw" |
| NFR4 | Each phone's **average download ≤ 30 KB/s** over the wave. | `avg down` |
| NFR5 | **Reversed hits below 1 in 20 (< 5 %)** of apparent hits. | `reversed / apparent` |
| NFR1 | FPS recorded (the target, 60 avg / never below 30, is checked in Epic 10). | `FPS avg / min` |

## Results (phones)

| device | browser | network | avg / peak down KB/s | up KB/s | avg / p95 ping ms | reversed / apparent hits | FPS avg / min | snaps |
|---|---|---|---|---|---|---|---|---|
| (phone 1, host) | | | | | | | | |
| (phone 2) | | | | | | | | |
| (phone 3) | | | | | | | | |
| (phone 4) | | | | | | | | |

## Server

From the server log on the test day (`cd /root/topdown-shooter && docker compose -f deploy/docker-compose.yml logs server | grep -E 'net_stats|tick_stats|horde_stats|slow_tick|slow_patch'`). Every line is per wave, written at `wave.ended`.

| | wave 4 |
|---|---|
| tick ms avg / max (`tick_stats`) | |
| slow ticks / slow patches | |
| peak zombies alive | |
| `net_stats` per player: avgOutKBps / peakOutKBps / hordeKBps / rttMs | |
| `horde_stats` per player: framesSent / framesSkipped / avgBytes | |

`hordeKBps` is the part of the download that is the horde stream; the rest (avgOutKBps − hordeKBps) is state patches and events. Use it to say which stream is responsible if a phone is over 30 KB/s.

## What players saw

(Write each player's answer word for word.)

- Phone 1:
- Phone 2:
- Phone 3:
- Phone 4:

## Decisions

(Designer + dev, after the test. Story 2.10 Task 11.)

- Reversed hits ≥ 5 % on any phone, or players saw disagreements → follow-up story (`gds-correct-course`, appended to `epics.md` and `sprint-status.yaml`). *(2026-11-26: the rewind hit testing this line first proposed is built: 300 ms in Story 2.12, 500 ms in 8.8, 600 ms in 8.9. Look at the phone's ping p95 and stalls first: see the `REVERSED_HIT_SLACK_MS` check above, and 8.10 B6 for very slow lines.)*
- Average download above 30 KB/s → record which stream is responsible (`hordeKBps` vs the rest, from `net_stats`) and open a follow-up the same way.
- Decision: (fill in)

## Local bot baseline (dev agent, 2026-11-22)

> **Before the Network pass.** Kept as measured. For the numbers after Stories 8.8–8.11, see the 2026-11-26 update at the top and `docs/perf/network-pass-2026-11.md`. Bots, 150 alive, after (8.11 runs): horde 4.0–5.8 KB/s per phone (was 10.3–11.7 here), patches 1.3–1.5, events 0.4–0.7, so about 6–8 KB/s down in all (was 12–13).

Measured before the phone test, on the dev agent's cloud container: a 2-CPU Linux VM shared with other agents' builds, the game server (`PORT=4067`, `ALLOW_TEST_SCENARIOS=1`), the bots and a headless Chrome all on the same machine, over localhost. **No 4G, no real phone.** Build: branch `story-2-10` (commit with this file).

Bots: `npm run bots` (Story 2.10, `tools/bots`): headless SDK clients that use the shared bot policy (move to the team centre, aim at the nearest zombie and fire within range, revive downed teammates, tap Ready), decode the real horde stream and count payload bytes with the same counter as the overlay.

### 4 bots, `net150`, wave 4

`npm run bots -- --url http://localhost:4067 --count 4 --scenario net150 --until-wave 4 --hold-fire 25`

`--hold-fire 25` keeps the bots from shooting for the first 25 s of the wave, so the horde reaches the 150-alive cap and crowds them (the worst case for bandwidth). Without it the bots kill faster than the director spawns.

| run | wave length | peak zombies alive | avg zombies per horde frame | down avg KB/s per client (server / bot) | down peak KB/s (server) | of which horde KB/s | up KB/s | tick ms avg / max | slow ticks | patch ms avg / max |
|---|---|---|---|---|---|---|---|---|---|---|
| hold fire 25 s (worst case) | 56.7 s | **150** | 65–68 | **12.0–12.5** / 12.0–12.5 | 20.6–22.5 | 10.3–10.8 | 2.1 | 0.50 / 6.9 | 0 | 0.24 / 9.3 |
| bots fire at once | 40.6 s | 105 | 35 | 7.0–7.3 / 7.2 (mean) | 12.7–13.0 | 5.5–5.8 | 1.9 | 0.43 / 8.3 | 0 | 0.17 / 3.5 |

A normal run (no scenario, 4 bots, waves 1–3, no god mode): no bot went down; wave 1 19 s, 3.0–3.3 KB/s; wave 2 24 s, 4.4–4.5 KB/s; wave 3 32 s, 5.4–5.7 KB/s; tick 0.30–0.35 ms avg, ≤ 4.4 ms max.

### local, bots, no 4G (browser host + 3 bots, Task 8)

A headless Chrome (800 × 450, `?debug=1&scenario=net150`) created the room; `npm run bots -- --room <CODE> --count 3 --until-wave 4 --hold-fire 25` filled it; the browser player held fire for 25 s too, then aimed with the mouse at the nearest drawn zombie and held the button. Numbers are from the browser's **Copy results**.

| device | browser | network | avg / peak down KB/s | up KB/s | avg / p95 ping ms | reversed / apparent hits | FPS avg / min | snaps |
|---|---|---|---|---|---|---|---|---|
| cloud VM (local, bots, no 4G) | HeadlessChrome 153, Linux | localhost, no throttle | 13.0 / 26.3 | 1.8 | 47 / 71 | 13 / 73 (17.8 %) * | 35.2 / 3.6 | 0 |
| cloud VM (local, bots, no 4G) | HeadlessChrome 153, Linux | localhost + `?lag=150&jitter=20` | 13.0 / 24.7 | 1.8 | 221 / 255 | 10 / 77 (13.0 %) * | 36.6 / 4.4 | 0 |

Server for those two runs: peak zombies alive 150 both times; `net_stats` avgOutKBps 12.9–13.2 for all four players (horde 11.4–11.7), peakOutKBps 24.7–25.6; tick avg 0.85 / 0.48 ms, max 147.6 / 90.3 ms, one slow tick each (the machine was shared with other builds), patch max ≤ 19.6 ms; `horde_stats` framesSkipped 0. The overlay at the crowd's peak (147 alive, 118 in view) read `down 24.6 KB/s`.

\* **Not a valid NFR5 reading.** Software-rendered headless Chrome on the shared 2-CPU machine ran at ~36 FPS with single frames up to 280 ms (min FPS 3.6–4.4), and the ping without a throttle was 47 ms on localhost: the page itself was late. Long frames send several inputs at once, which is the stall case where a few predicted shots never fire on the server (Story 2.7 harness: 5 / 136 reversed for the SMG after a 400 ms stall). The small sample (73–77 hits) adds to it. For the netcode alone, the Story 2.7 harness (`tools/netsim`, 60 FPS, real server code, simulated 150 ms RTT ± 10 ms) now also runs a 150-Walker crowd: **standing 0 / 76 reversed (0.0 %), kiting a 10 m circle 4 / 76 (5.3 %)** (20 Walkers: standing 0 %, kiting 1.4 % at 150 ms and 7.9 % at 300 ms RTT). Kiting is the case where rewind hit testing (the architecture's upgrade path) would help. Only real phones answer NFR5. *(2026-11-26: rewind hit testing is built (Story 2.12, then 600 ms in 8.8/8.9); the harness now reads 0.2 % clean and 0.3–1.4 % on the lossy rows.)*

### What the baseline says, and what only phones can measure

- **NFR4 (≤ 30 KB/s average down): met with room to spare locally.** The worst case (150 alive, the team crowded) averaged 12–13 KB/s per client over the wave, with the busiest second at 21–26 KB/s. The horde stream is ~90 % of it. Phones will see the same payload for the same crowd; a team that splits up gets more zombies in some views, but each view is capped by the screen size (the 2.5 design budget: ~24 KB/s for 150 in view).
- **Server cost is small:** 0.4–0.9 ms per tick on average (budget 50 ms), no slow ticks except one on the busy shared machine.
- **Phones only:** real 4G round-trip times and jitter; packet loss and its bursts; FPS on real phones (NFR1); reversed hits with real thumbs and aim assist at phone frame rates (NFR5); and whether the players see the same thing (NFR3).
