# Network pass: designer decisions

Written 2026-11-24 from the five story files of the Network pass (`_bmad-output/implementation-artifacts/8-8-*.md`, `8-9-*.md`, `8-1-*.md`, `8-10-*.md`, `8-11-*.md`; brief `docs/network-pass-brief.md`; audit `docs/perf/network-audit-2026-11.md`). Built right after Epic 6 and before Epic 7 (designer 2026-11-24).

Each line is the story writer's **recommended value** (first, in bold), with the alternative after it. **"ok" accepts all 29.** Change any line by its code (e.g. "8.9 D1: 200 ms"). The Epic 8 decisions D1–D15 (`docs/ideas/epic-8/decisions.md`, accepted 2026-11-24) are already rules in Story 8.1 and are not asked again. No story in the pass needs a new look; the only new screens are the "reconnecting" ones (plain text in the existing overlay style).

**Status: accepted.** Designer 2026-11-24: "I'm okay with everything" — all 29 recommended values (first, in bold) accepted.

## The ones worth a look (how the game feels)

| Code | What it changes in play | Recommended (alternative) |
| --- | --- | --- |
| 8.1 D1 | You switch apps, take a call or ride into a tunnel and your phone goes quiet but hasn't fully dropped | **After 3 s your survivor vanishes safely (like a drop) and comes back next to a teammate** (today: it stands still and gets eaten for 12–15 s until the server gives up) |
| 8.1 D3 | You come back in the middle of a wave, next to a teammate | **2 s where you can't be hurt and can't shoot, shown blinking** (no protection: you may land in a crowd) |
| 8.1 D4 | Your phone was gone for more than 2 minutes | **It waits on "Your seat is kept, you'll rejoin at the next build phase" and rejoins by itself** with all your stuff (back to the start screen; rejoin with the link at a build phase) |
| 8.9 D1 | On a bad line the game draws others a little further behind so they don't freeze | **Up to 250 ms behind, only while the line is bad** (clean lines stay at today's 100–150 ms) (200 ms: a bit snappier, about a third of 4G hiccups still freeze) |
| 8.9 D5 | Right after a hiccup the server holds a few of your moves in a queue | **Your survivor runs at 90 % speed for about 2 s while it empties** (no move or shot is lost) (today: after 2 s the server skips every second move; you may jump back a little and a shot may vanish) |
| 8.10 D1 | Zombies more than 8 m from you (about two-thirds of the screen away) | **Updated 10×/s instead of 20×/s; they glide between updates** (anything that can reach you within 2 s stays at 20×/s) (all at 20×/s: the stream is 8.9 instead of 6.5 KB/s) — **superseded overnight by 8.10 B7** (all at 20×/s; B7 re-checked and confirmed in Story 8.13) |

Also worth a glance: **8.8 D1** the server may look back 500 ms for your shots (measured: Runner hits "taken back" on a bad line 7.6 % → 2.0 %); **8.1 D5** opening the game again on the same phone (or a second tab) takes your seat over instead of being refused; **8.11 D1** the optional fifth story is built last only if there is time.

## 8.8 My shots count on a bad 4G line

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 8.8 D1 | How far back the server may look for a shot | **500 ms** (measured: Runners 7.6 → 2.0 %, 11.9 → 1.3 %); 8.9 may raise it to 600 ms if its longer render delay needs it (600 ms now, before 8.9 measures) |
| 8.8 D2 | What one "lost packet" costs in the test switch | **A 200 ms stall** (about one 4G resend); `&stall=400` for the worse case (400 ms as the default) |
| 8.8 D3 | The Behemoth with the longer window | **Same 500 ms as zombies** (600 ms since 8.9 B8, same count) (it's a target; players are never the victim) (keep the boss at 300 ms) |
| 8.8 D4 | Who can turn on `&loss` | **Anyone, release builds too, like `?lag`** (it only hurts the phone that turns it on; your Wi-Fi testers need it on hordes.sevend.io) (dev builds only) |
| 8.8 D5 | The bots' bad line | **Built into `npm run bots` (`--lag --jitter --loss`), stalls both ways** (keep the separate proxy command, one direction) |
| 8.8 B1 | A barricade that broke (0 HP, mid-wave) less than 500 ms before a rewound shot | **The shot passes where it stood** (cover is tested as it is now; only zombies benefit, for the team; it already existed at 300 ms) — **auto-accepted overnight (designer: follow the GDS recommendation)**, 2026-11-25, Story 8.8 review R4 | Strict: remember each barricade's break tick and block rewound shots older than it |

## 8.9 Smooth through hiccups

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 8.9 D1 | The most the game may draw others behind on a bad line | **250 ms** (hides the measured 240–290 ms hiccups; only while the line is bad) (200 ms) |
| 8.9 D2 | How fast the picture may catch up or slow down | **0.9×–1.1×** (a 10 % change is hard to see) (0.8×–1.25×: recovers twice as fast, zombies visibly speed up after a hiccup) |
| 8.9 D3 | How long the extra delay stays after the line clears | **5 s calm, then it eases back down** (no pumping up and down on a train) (ease down at once: snappier between hiccups, more freezes on the next one) |
| 8.9 D4 | A zombie at the edge of your screen that stops being sent | **Removed after 150 ms of missing time** (250 ms: never blinks, a zombie that really left lingers a little) |
| 8.9 D5 | After a hiccup, how your own survivor helps the server catch up | **90 % speed for about 2 s** (server only: skips every second input after 2 s) |
| 8.9 D6 | How the phone knows the backlog size | **The server sends it** (one small number per player, ≈ 0.1 KB/s) (the phone guesses: no bytes, a wrong guess slows you for nothing) |
| 8.9 D7 | What the phone's clock listens to | **State updates and zombie frames** (twice the samples) (state updates only, as today) |

**Built 2026-11-25 (builder decisions, auto-accepted overnight: designer, follow the GDS recommendation; details and numbers in the story file and `docs/perf/network-pass-2026-11.md` § 8.9):**

| Code | Decision | As built (alternative) |
| --- | --- | --- |
| 8.9 B1 | Delay target | **max(p95 lateness + 50 ms, the last late sample's need held 5 s), 100–250 ms** (the story's "100 + p95 + 50": a clean line would sit at 150–170 ms) |
| 8.9 B2 | How fast the extra delay eases down after the 5 s calm | **5 ms/s** (250 → 100 ms in 30 s; 1.0 freezes/30 s) (20 ms/s: back in 7.5 s, 2.1 freezes/30 s) |
| 8.9 B3 | When a zombie frame is overdue | **Slow the picture to 0.9× at once, up to 25 ms past the 250 ms cap** (3.0 → 1.0 freezes/30 s; max 261 ms) (hard 250 ms cap: almost every stall freezes one frame) |
| 8.9 B4 | Which clock the render clock counts | **The page's ms clock (`now`)** (Phaser's frame delta: misses hidden-tab gaps if Phaser caps it) |
| 8.9 B5 | The backlog number the server sends | **Queue depth when the tick started (what the server's drain reads)** (after the tick took one: one lower, races the 2 s skip) |
| 8.9 B6 | When my survivor slows | **Exactly D5: 3 reports over 2 → 90 % until a report says 2** (two "smarter" variants measured no better) |
| 8.9 B7 | Starved ticks (AC 6 said "no worse ± 10 %") | **Accepted: +41–61 % on the lossy line (D5 as built: 0 server skips, 0 lost shots), bounded by `smooth.test.ts` ≤ 1.7 × a never-slowing client** (main session 2026-11-25, retro default A7; designer may revisit D5: e.g. slow only after ~1 s of backlog) |
| 8.9 B8 | Rewind window with 8.9's 250 ms lossy-line delay | **600 ms / 12 ticks (8.8 D1's fallback)**: at 500 ms 16–33 % of kiting shots were over the cap; at 600 ms 0 %, reversed Runners 0.7 % / 1.4 % (1 % / 2 % loss) (500 ms: reversed 1.8 % / 4.2 %, shots over the cap clamped) |
| 8.9 B9 | How often the picture may still freeze on a 1 % lossy line | **At most 1.2 freezes per 30 s on every 1 % row** (measured 1.2 / 0.9 / 0.9; before 6–6.9) (main session 2026-11-25, retro default A7) (tune until every row ≤ 1) |

## 8.1 Reconnect within 2 minutes

Already decided (Epic 8 D1–D5): 120 s hold; vanishes safely, downed = out for the wave; everything held exactly; seat remembered all run; world freezes while nobody is connected.

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 8.1 D1 | A phone that goes quiet without dropping | **After 3 s with no input the survivor vanishes safely like a drop** (stands still and gets eaten until the server gives up 12–15 s later) |
| 8.1 D2 | What you see while reconnecting | **The picture freezes and dims, "Connection lost, reconnecting… 1:43" and a Leave button** (a small banner on top of the last picture) |
| 8.1 D3 | Coming back in the middle of a wave | **2 s protection (can't be hurt, can't shoot), blinking**, next to a teammate (none) |
| 8.1 D4 | After the 2 minutes ran out | **The phone waits and rejoins by itself at the next build phase** (start screen + rejoin by link) |
| 8.1 D5 | The same phone (or a second tab) joins while its seat is held or still open | **The newest connection takes the seat** (refused "already playing", as today) |
| 8.1 D6 | Who gets the "reload into your seat" rescue for hung reconnects | **Any browser after > 10 s in the background** (iPhone Safari only) |
| 8.1 D7 | A drop in the lobby or on Results | **Same as Leave, as today** (rejoin by the link) (held 120 s too) |
| 8.1 D8 | How long the server waits for a silent socket | **12–15 s** (3 s × 4 pings; with D1 the survivor is already safe after 3 s) (9–12 s) |

## 8.10 Half-size horde stream

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 8.10 D1 | Zombies farther than 8 m updated 10×/s | **Yes** (no: all at 20×/s, 8.9 instead of 6.5 KB/s) — **superseded overnight by B7** (all at 20×/s) |
| 8.10 D2 | How often a full picture repairs any mistake | **Once a second** (+5 % data) (every 2 s) |
| 8.10 D3 | Zombie facing | **Worked out on the phone from movement; sent only when a standing zombie turns** (always sent: +1.7 KB/s) |
| 8.10 D4 | Zombie frames that arrive before the game screen is up | **Decoded in the background from the join** (wait for the next full picture: up to 1 s without zombies after a late start or a reload) |
| 8.10 D5 | A phone with an old version after a deploy | **Refused at join: "A new version is out. Please reload."** (no check) |
| 8.10 B1 | When the server sends a zombie's heading byte | **When the phone's own heading (from the cm move) would be more than 4 steps (5.6°) off the server's** — every standing turn (D3) and the few moves the cm rounding bends; 16 % of moving records in the 2,000-tick replay; audit replay 6.7 KB/s, stampede 13.4 KB/s (with D1; 8.2 / 13.5 after B7) — **auto-accepted overnight (designer: follow the GDS recommendation)**, 2026-11-25, Story 8.10 build (2 steps (2.8°): 6.9 / 14.0 KB/s, 36 % of moves carry it; never while moving (D3 literally): −0.3 KB/s, facing up to ~7° off for slow walkers) |
| 8.10 B2 | The hits harness (`tools/netsim/hitsSim.ts`) and the clean-line reversed-hit bound | **The harness draws the horde through the real stream + `HordeBuffer` (brief 20); the 8.8 clean-line bound becomes ≤ 1 % with an all-20 Hz control asserted equal**: 20 Runners kiting reads 0.9 % (4/439; master's idealised harness 0.2 %) with or without 8.10's far rule — the cause is the client's existing rule of drawing a killed zombie until the render tick reaches its kill (Story 2.5), measured by hiding it at arrival instead (0 %) — **auto-accepted overnight (designer: follow the GDS recommendation)**, 2026-11-25, Story 8.10 build (keep the harness's own lerp (bound stays 0.5 %, but the harness never sees 10 Hz far zombies or the real buffer)) |
| 8.10 B3 | A 1-byte move record (TINY: ±8 cm per axis) in the delta, beyond the story's int8/u16 sketch | **Yes**: a walker's 6 cm step fits; stampede worst 1 s 16.2 → 14.0 KB/s and replay 7.9 → 6.9 (both at B1's 2-step alternative; the ≤ 15 KB/s AC needed it) — **auto-accepted overnight (designer: follow the GDS recommendation)**, 2026-11-25, Story 8.10 build (int8 only (over the 15 KB/s stampede AC)) |
| 8.10 B4 | Near/far after a keyframe or a new record | **Starts "near"; a far zombie is re-flagged on the next tick (a 2-byte change record, or folded into its move)** — one format path, ≈ 0.1 KB/s — **auto-accepted overnight (designer: follow the GDS recommendation)**, 2026-11-25, Story 8.10 build (a far-flag bitmap in every keyframe (+ ≤ 32 B per key, one more format path)) |
| 8.10 B5 | Where the per-client encoder state lives | **In the encoder, per Colyseus client object (`WeakMap`)**: a reconnect (8.1: a new client object) starts with a keyframe with no RunRoom line; `HordeEncoder.forceKey(client)` for 8.1 if it reuses the object; nothing to clean up on leave — **auto-accepted overnight (designer: follow the GDS recommendation)**, 2026-11-25, Story 8.10 build (keeps RunRoom out of 8.1's join/leave/hold lines) (create/destroy in `RunRoom` join/leave/reconnect (more lines in 8.1's area)) |
| 8.10 B6 | `HORDE_BACKPRESSURE_BYTES` (64 KB) after the capped-line measurement (AC 8, audit F12) | **Unchanged**: at 64 kbit/s the line queued frames up to 4.7 s while the server's socket never held 64 KB (0 skips); a smaller threshold cannot see a queue that sits in the network/kernel, so lowering it would not help. F12 confirmed for very slow lines; a fix needs a latency signal: **owed to Story 8.11** (RTT-based skip + keyframe while the ping RTT is over ~1 s; review RL2) — **built in Story 8.13** (D1–D4 below: a tick ack, 64 kbit/s waits ≤ 774 ms) — **auto-accepted overnight (designer: follow the GDS recommendation)**, 2026-11-25, Story 8.10 build (lower it to 16 KB (no effect measured: the socket buffer stays near 0)) |
| 8.10 B7 | Far zombies at 10 Hz (D1) after review RM2 | **Off: every zombie refreshed every tick (`HORDE_NEAR_M = Infinity`); the far rule's code path and tests stay (radius `HORDE_FAR_RULE_RADIUS_M` 8 m passed explicitly) for a later story that fixes it.** With D1 on, far zombies stood still then jumped on the CLEAN line in 15–16 % of their between-refresh samples (the frame two ticks ahead is often not there yet: the newest frame leads the render tick by only 1.0–2.0 ticks); brief 17 (clean lines don't pay) + AC 3 (glide). Cost: audit replay 6.7 → 8.2 KB/s (≤ 10 ✓), stampede 13.4 → 13.5 KB/s (≤ 15 ✓). **Confirmed in Story 8.13 (retro E8-A9 re-check):** with every zombie at 20 Hz the 64 kbit/s rows wait ≤ 774 ms and the 128 kbit/s rows skip 0 frames, so the far rule stays off — **auto-accepted overnight (designer: follow the GDS recommendation)**, 2026-11-25, Story 8.10 review (main session) (keep D1 and accept the stutter) |

8.10 also closes Epic 6 decision **6.8 B1** (stampede 28.2 KB/s accepted "until Story 8.10"): its target is ≤ 15 KB/s with 180 zombies in one view.

## 8.11 One packet per tick (optional)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 8.11 D1 | Build this optional story now | **Yes, last in the pass, if time allows** (skip until Epic 10 polish) |
| 8.11 D2 | How the tick's three messages become one packet | **Hold the socket for one tick and send once** (one new combined message: needs a new decoder on the phone) |
| 8.11 D3 | Order inside the packet | **Zombies, events, then the state update** (state update first) |
| 8.11 D4 | Stick precision on the wire | **1/127 steps** (finer than a thumb; the phone predicts with the same value) (1/32767: +4 B per input) |
| 8.11 B1 | How D2's "hold the socket for one tick" is built | **Colyseus 0.18.29's own `autoBatchMessages`** (documented: corks every socket for the timestep's callback via ws-transport `cork`/`uncork`, uncorks in a `finally`, so an exception mid-tick never stalls a socket; the 1/s ping, a clock timer run inside the timestep, rides in the same write) — **auto-accepted (autonomous build: the story's recommendation)**, 2026-11-25, Story 8.11 build (hand-cork `client.ref._socket` around our sends) |
| 8.11 B2 | 8.10 B6's RTT-based horde skip + keyframe on very slow lines ("owed to 8.11") | **Not built here: it is not in 8.11's ACs (one packet per tick); still owed to a later story (Epic 10 polish or a follow-up network story).** One write per tick does not change the 64 kbit/s queueing — **auto-accepted (autonomous build: the story's recommendation)**, 2026-11-25, Story 8.11 build (build it in 8.11) |
| 8.11 B3 | Two clean-line netsim bounds at one-shot noise after the harness sends the 1/127 input (brief 20) | **Paired control: the same 3 seeds with the pre-8.11 float input (`quantizeInput: false`) keeps the old bound; the quantised run may be at most the control + 1 shot** (hits: ≤ 1.2 %; smooth F4 Runners: control ≤ 0.5 %). 3 seeds: hits 5/436 vs 4/439, smooth 2/218 vs 1/220; 30 seeds: quantised is lower (hits 0.82 % vs 0.96 %, smooth 0.85 % vs 1.09 %); aim normalisation alone changes nothing — **auto-accepted (autonomous build: the story's recommendation)**, 2026-11-25, Story 8.11 build (pick other seeds; or leave the harness on float input) |
| 8.11 B4 | The non-stepping patch interval (AC 1) | **No extra timer: the fixed timestep (20 Hz, it keeps running after Results and Back to lobby) patches in every call, stepping or not; the lobby before the first run keeps the 50 ms Colyseus interval.** `patchRate = null` is set right after `setFixedTimestep` (null before it adds Colyseus's own clock interval: two clock ticks per step would slow the World) — **auto-accepted (autonomous build: the story's recommendation)**, 2026-11-25, Story 8.11 build (a separate `clock.setInterval` that patches only when not ticking) |
| 8.11 B5 | The 14-byte layout | **format byte · seq u32 · 4 × int8 sticks · flag bits · viewTick + 1 as u32** (the schema's viewTick upper bound 2³¹ does not fit an i32; seq ≥ 2³² cannot be sent: 6.8 years at 20/s); the encoder clamps sticks to ±1 and NaN to 0 (the phone never sends either); unknown flag bits, a −128 stick, another format byte or any other length are refused and counted as `invalid` — **auto-accepted (autonomous build: the story's recommendation)**, 2026-11-25, Story 8.11 build (13 B without the format byte) |
| 8.11 B6 | The old msgpack `input.send` | **Removed (no handler, `C2S.INPUT_SEND` gone): an old one is an `unknown_type` drop; old tabs are refused at join anyway (`NET_PROTOCOL_VERSION` 3 → `update_required`)** — **auto-accepted (autonomous build: the story's recommendation)**, 2026-11-25, Story 8.11 build (keep both paths) |
| 8.11 B7 | Catch-up steps (beat-the-rule 4: up to 5 steps in one timestep callback) | **Each step patches (F3 holds: one tick per patch); after a hitch the 2–5 patches share the callback's one write** — **auto-accepted (autonomous build: the story's recommendation)**, 2026-11-25, Story 8.11 build (document a catch-up exception) |
| 8.11 B8 | How "horde/event bytes within ± 2 %" is shown | **Deterministically: the encoders are unchanged (empty diff) and the audit replay gives 8.2 KB/s, 0 mismatches, as 8.10 shipped; the bot runs' horde/event KB/s vary ± 30 % run to run on both sides and are recorded only.** Down writes are counted on the separate-process lag line (an in-process line coalesces the server's writes; the test counts the server sockets' kernel writes instead). The server logs no tick p99: avg/max recorded — **auto-accepted (autonomous build: the story's recommendation)**, 2026-11-25, Story 8.11 build |
| 8.11 B9 | Mouse aim on the 1/127 wire (PR #19 review) | **Accepted, no change: the quantised mouse aim is at worst ≈ 0.3° off (≈ 13 cm at 25 m), and the phone predicts and fires with the same value the server uses** — **accepted by the PR #19 review (main session)**, 2026-11-25 (int16 aim: +4 B per input) |
| 8.11 B10 | `tools/bots/saveResume.test.ts` red on PR #19 CI (2 of 3 runs; reproduced locally 5 of 6 at load ≈ 4) | **The test's race, exposed by F3: the patch now leaves in the tick that changed the phase, so the bots' Ready reached the server before the test's poll saw `build` and the build ended (`build_end` autosave, then `save_quit_refused: not_now`); before 8.11 the 0–50 ms patch lag hid it. Fix: the test holds the bots' Ready in the save build (`holdReadyAfterWave = 1`, as `npm run bots --save-quit-at` does). 6 of 6 green at load 8–13.** No game change: a host's Save and quit in a build all players already readied was refused `not_now` before too — **auto-accepted (autonomous build)**, 2026-11-25, PR #19 CI fix |
| 8.13 D1 | The slow-line signal (closes 8.10 B6) | **A 2-byte tick ack in every input: the newest server tick the phone has received.** Input 14 → 18 B (+80 B/s up; re-review M1b-R1 added the phone's 2-byte send time, which times the upload), **`NET_PROTOCOL_VERSION` 4** (old tabs: "A new version is out. Please reload.") — **auto-accepted (designer 2026-11-26: follow recommendations)**, Story 8.13 build (the 1/s ping round trip: a 1 s stall on one ping reads as a queue, it would skip on every 128 kbit/s row; the input's view tick: follows the phone's smoothed clock and hides a queue) |
| 8.13 D2 | When the server skips a slow phone's horde frames | **While its frames wait more than 300 ms in the line (projected to now from how fast the wait grows), for at least 100 ms of acks; a keyframe once the wait is under 100 ms.** Bots, 64 kbit/s: longest wait 674 / 774 / 383 ms (0.2 / 0.4 / 1 s stalls; no ack: ≈ 8 s), a fifth to a quarter of frames skipped on the 0.2–0.4 s rows; 128 kbit/s and clean: 0 skips. Review M1: only the DOWNSTREAM wait counts (the input's own upload wait, from arrival times, is taken off), and while skipping a keyframe still goes out at least once a second (`HORDE_LINE_MAX_GAP_MS`); re-measured 658 / 655 / 609 ms; re-review M1b-R1: the upload is timed from the phone's send time (in the input), not from `seq × 50 ms` (the phone's steps slow and drop): 497 / 475 / 648 ms — **auto-accepted (designer 2026-11-26: follow recommendations)**, Story 8.13 build (250 / 200 ms: no better; without the 100 ms confirm a stall's late ack skips at 128 kbit/s) |
| 8.13 D3 | Where the rule lives | **The horde encoder's per-phone state (like 8.10 B5); a reconnect or 8.1's re-attach starts the measurement again** — **auto-accepted (designer 2026-11-26: follow recommendations)**, Story 8.13 build (a tracker in RunRoom) |
| 8.13 D4 | The "before" row | **The same build with the bots' ack off (`BOTS_NO_ACK=1`), beside 8.10's T8 numbers** — **auto-accepted (designer 2026-11-26: follow recommendations)**, Story 8.13 build (a master worktree) |

## Build rounds

Picked by file overlap (HANDOFF §3: start a story as soon as its real overlap allows; up to 3–4 builders at once; each builder in its own cloud session with the story file, `docs/network-pass-brief.md` and this file).

| Round | Stories (parallel) | Starts when | Overlap and how it's handled |
| --- | --- | --- | --- |
| 1 | **8.8** ∥ **8.9** | Epic 6 and its retro are done | 8.8: rewind constants, dev throttle `&loss`, bots line, harness `loss`. 8.9: render delay, clock, horde buffer, input pacing, one schema field. Only shared file: `tools/netsim/hitsSim.ts` (8.8 adds `loss`, 8.9 adds counters/pacing): **8.8 merges first**, 8.9 merges master before its final measurement. 8.8 keeps its constants out of `netConfig.ts`. |
| 2 | **8.1** ∥ **8.10** | 8.1: once 8.8 is on master (its 8 s cut test runs on 8.8's line). 8.10: once 8.9 is on master (`hordeBuffer.ts`) | Shared: `RunRoom.ts` (8.1 drop/reconnect/join; 8.10 `sendHorde` per-client state, version check), `session.ts` (8.1 reconnect; 8.10 decoder in `RunInbox`), `lagLine.ts` (8.1 `cut`, 8.10 `--kbps`). The one wire-up between them, "the first frame after a reconnect is a keyframe", is done by **whichever lands second** (test named in both files). |
| 3 | **8.11** (optional) | after 8.1 and 8.10 are on master | Same `RunRoom.ts` tick/patch region and the input path; alone. |
| check | Designer's **4-phone 4G test** (Story 2.10 plan, `docs/playtests/milestone-1.md`) | after round 2 (or 3) | Wi-Fi phones use `?lag=150&jitter=20&loss=1`; reports NFR3–5 and a run to wave 10 (NFR9); add the iPhone "lock 30 s mid-wave" and "airplane mode 10 s" checks (8.1). |

Estimated effort: 8.8 S, 8.9 M, 8.1 L, 8.10 M, 8.11 S–M (≈ 4–5 builder sessions, as the change proposal said). Reviews: full fresh review for 8.1 and 8.10 (game rules / everyone's picture), full for 8.9 (feel), light + "beat the rule" on validation for 8.8 and 8.11.

## Open questions for the main session (not designer decisions)

- Epic 6 rounds 2–3 (6.8–6.12) are still landing: each story names its "check at build time" list (new player state for 8.1's hold, new phases, the 6.8 bandwidth test for 8.10).
- A before/after preview link for 8.9's feel change needs a deploy the designer can open (Hermes); without it, 8.9's hand-back says "not verified on a phone".
- 8.1's guest-token takeover (D5) makes the guest token the identity until Story 7.1's accounts: anyone with a copied token could take the seat. Acceptable for a friends' game; flagged for 7.1.

## 8.1 build-time decisions (auto-accepted overnight; designer: follow the GDS recommendation)

Logged by the 8.1 builder 2026-11-25 (brief 31 B-codes). Each: the value built, the alternative.

| Code | Decision | Built (alternative) |
| --- | --- | --- |
| 8.1 B1 | When the quiet counter runs (D1) | **Wave ticks only**: build and vote phases don't count (nothing hurts a standing player there); a tab hidden across a build start is held 3 s into the wave (count every phase: an idle shopper would vanish from the build phase) |
| 8.1 B2 | Close codes for a seat that moved | **4020 seat kept, 4021 taken over** (Colyseus 4010 is MAY_TRY_RECONNECT: the SDK would auto-reconnect a tab that was taken over) |
| 8.1 B3 | Where the grey "reconnecting" chips sit | **Top left, under the money line** (the top right is full of buttons at 568 × 320; the story said "team list", which has no panel today) (top centre under the boss bar: crowds the survivor) |
| 8.1 B4 | Inputs made while the line was down that arrive late | **Dropped when their view tick is > 2 s behind the server** (seq counts, nothing applies, never ends a quiet hold); bots send no view tick, so for them at most the 6-input ring (0.3 s) applies (no server rule) |
| 8.1 B5 | A deliberate Leave mid-run | **Also remembered** (Epic 8 D4 "stops quit-and-rejoin for fresh cash"): back only at a build phase with its own stuff (forget the seat on Leave: a new join later would get late-joiner money, 8.2) |
| 8.1 B6 | A held seat in a full 4-player run blocks a takeover (Colyseus keeps its reserved seat) | **maxClients 8 during a run** (joins that are not one of the run's seats are refused in `join()` anyway); back to 4 in the lobby |
| 8.1 B7 | Pay that loops over present players (wave-clear bonus, boss and survivor-event pay) while held | **Not paid to a held player** (they weren't there); kill, assist, turret and refund pay go to the held wallet (F5) (pay everyone in the seat list) |
| 8.1 B8 | The chip's countdown while the World is frozen | **Counts World ticks** (stops while frozen: only the first one back sees it, during the 3-2-1) (a wall-clock field: a second synced number) |
| 8.1 B9 | A quiet hold that then drops | **Keeps its clock**: 120 s from the first hold, the chip never jumps back (restart the 120 s on the drop: up to 135 s) |
| 8.1 B10 | Spawn protection (D3) and the quick-use slot | **Blocks consumables too** ("can't shoot" read as "can't attack") (medkits allowed) |
| 8.1 B11 | The automated 8 s cut test's run | **The god-mode `net150` scenario on 8.8's 1 % line**: bots on the lossy line lost wave 3 outright in 1 of 3 runs (a wipe, not a reconnect failure; bots are not difficulty evidence) (real damage, flaky) |
| 8.1 B12 | A takeover that lands after the SDK's own token reconnect (both from this phone) | **Adopted** (the server's "newest wins" rule means it holds the seat); a 4021 within 15 s of my own recovery = my own crossed takeovers → take the seat again (close it non-consented: the seat would sit on hold) |
| 8.1 B13 | A watchdog check that comes > 1 s late (scene restart, throttled hidden-tab timer) | **Re-arm, don't fire** (found by the two-tab smoke: a false reconnect after every Game scene restart) |
| 8.1 B15 | Review M1: the mid-wave return as an escape / teleport / invulnerability on demand (a reload or a socket loop) | **Teleport + 2 s protection at most once per player per wave, and only after a hold of ≥ 3 s; any other mid-wave return lands where they vanished, unprotected** (the reviewer's minimal rule; RR2-M2 / RR3-M1: the ≥ 3 s count from the drop or the last input, the 3 s standing body included) (no teleport or protection at all) |
| 8.1 B16 | Re-review RR1-L1: vanishing on a drop dodges a blast (a reload / socket close at the right moment) | **A dropped body stays in the World for 3 s mid-wave (standing still, hittable, a target — like D1's quiet phone), then vanishes into the hold; back within those 3 s = it plays on in place (no teleport, no protection); build / vote phases hold at once** (accept vanish-on-drop and correct B15's "never an invulnerability" text) |
| 8.1 B17 | Re-review RR1-L2: a held seat that never comes back still sizes the wave / Behemoth that starts within its 120 s | **Accepted as is** (bounded by the hold: the count drops when it expires; the intended trade against H3's cheese); no boss HP rescale |
| 8.1 B18 | Re-review RR1-L3: solo (a frozen World: no tick passes while held) never gets the return protection | **The 3-2-1 resume countdown replaces protection** in a frozen World (zombies stood still too) (measure the hold in room ms instead) |
| 8.1 B19 | Re-review RR2-L1: a solo drop (or a re-drop during the 3-2-1) with B16's 3 s standing body | **Accepted: the dropping body counts as present — the World runs its 3 s (the 3-2-1 finishes, the body stands hittable), then freezes** (while frozen, hold a dropping body at once) |
| 8.1 B14 | Seat identity | **One function `seatKey()` = `guest:<hash>`** (`apps/server/src/run/lobby.ts`); Story 7.1 switches it to `acct:<id>` |

## Designer review 2026-11-26 (retro E8-A9)

Designer "ok" 2026-11-26: 8.9 B7, 8.9 B9, 8.1 B15, B16 and B19 are **confirmed as built**. **8.10 B7** (far rule off) is confirmed provisionally and re-checked on Story 8.13's 64 / 128 kbit/s netsim (8.13's skip is the first lever if it fails). Full table: `docs/epic-8-story-decisions.md` › Designer review 2026-11-26.
