# Epic 2 network test: 4 phones, 150 Walkers (NFR3, NFR4, NFR5)

Story 2.10. This note records whether online co-op with a big horde works on phones over mobile data: Milestone 1's first goal. The phone test is run by the designer and three friends. The local bot baseline below was measured by the dev agent before it.

## How to run the 4-phone test

You need 4 phones (mobile data, Wi-Fi off), about 15 minutes, and Hermes for two small deploy steps.

**Before (Hermes):** in `deploy/docker-compose.yml`, uncomment `ALLOW_TEST_SCENARIOS: "1"` and redeploy. This lets the host start the fixed test. Without it the game runs a normal wave 1, and the overlay says `scenario net150 refused by the server`.

**The test:**

1. **Host:** open `https://hordes.sevend.io/?debug=1&scenario=net150`, type a name, tap **Create game**, and send the share link to the others.
2. **Friends:** open the share link, then add `?debug=1` at the end, for example `https://hordes.sevend.io/j/ABCD?debug=1`. This shows the numbers box. Type a name and join.
   - A phone that can't use mobile data: stay on Wi-Fi and add `&lag=150&jitter=20` as well (`...?debug=1&lag=150&jitter=20`). It fakes a 4G delay. Write down which phones did this.
3. Everyone taps **Ready**. The host taps **Start**.
4. Check that the numbers box (top right, under ☰) starts with **TEST SCENARIO net150**. The wave banner says **Wave 4**: 160 Walkers, and nobody can die (god mode).
5. Play the wave to the end. Shoot, move around, stay together or split up: play the way you normally would. Keep the phone screen on and the game in front.
6. When "Wave 4 cleared" shows, a **Network results** box opens on each phone. Tap **Copy results** and paste the text into a chat with yourself (or straight into this file). If Copy fails, take a screenshot of the box.
7. Ask each player, and write down the answer word for word: **"Did you ever see something that didn't match what your friends saw?"** (a zombie that died on one screen but not another, a friend in a different place, a hit that didn't count).

**After (Hermes):** comment `ALLOW_TEST_SCENARIOS` out again and redeploy.

**What to read off the numbers box during the wave** (optional; the Copy results text has everything):

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
- **Reversed hits** (Story 2.7): my own bullet crossed a zombie on my screen, and the server did not confirm a hit on that zombie by me within RTT + render delay + 300 ms. Only my gun shots count.
- **FPS** is the Story 1.11 measurement over the wave (average, and 1000 / the longest frame).

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

From the server log on the test day (`docker compose logs server | grep -E 'net_stats|tick_stats|horde_stats|slow_tick|slow_patch'`). Every line is per wave, written at `wave.ended`.

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

- Reversed hits ≥ 5 % on any phone, or players saw disagreements → follow-up story "Rewind hit testing (300 ms zombie history)" (`gds-correct-course`, appended to `epics.md` and `sprint-status.yaml`).
- Average download above 30 KB/s → record which stream is responsible (`hordeKBps` vs the rest, from `net_stats`) and open a follow-up the same way.
- Decision: (fill in)

## Local bot baseline (dev agent, 2026-11-22)

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

\* **Not a valid NFR5 reading.** Software-rendered headless Chrome on the shared 2-CPU machine ran at ~36 FPS with single frames up to 280 ms (min FPS 3.6–4.4), and the ping without a throttle was 47 ms on localhost: the page itself was late. Long frames send several inputs at once, which is the stall case where a few predicted shots never fire on the server (Story 2.7 harness: 5 / 136 reversed for the SMG after a 400 ms stall). The small sample (73–77 hits) adds to it. For the netcode alone, the Story 2.7 harness (`tools/netsim`, 60 FPS, real server code, simulated 150 ms RTT ± 10 ms) now also runs a 150-Walker crowd: **standing 0 / 76 reversed (0.0 %), kiting a 10 m circle 4 / 76 (5.3 %)** (20 Walkers: standing 0 %, kiting 1.4 % at 150 ms and 7.9 % at 300 ms RTT). Kiting is the case where rewind hit testing (the architecture's upgrade path) would help. Only real phones answer NFR5.

### What the baseline says, and what only phones can measure

- **NFR4 (≤ 30 KB/s average down): met with room to spare locally.** The worst case (150 alive, the team crowded) averaged 12–13 KB/s per client over the wave, with the busiest second at 21–26 KB/s. The horde stream is ~90 % of it. Phones will see the same payload for the same crowd; a team that splits up gets more zombies in some views, but each view is capped by the screen size (the 2.5 design budget: ~24 KB/s for 150 in view).
- **Server cost is small:** 0.4–0.9 ms per tick on average (budget 50 ms), no slow ticks except one on the busy shared machine.
- **Phones only:** real 4G round-trip times and jitter; packet loss and its bursts; FPS on real phones (NFR1); reversed hits with real thumbs and aim assist at phone frame rates (NFR5); and whether the players see the same thing (NFR3).
