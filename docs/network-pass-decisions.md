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
| 8.10 D1 | Zombies more than 8 m from you (about two-thirds of the screen away) | **Updated 10×/s instead of 20×/s; they glide between updates** (anything that can reach you within 2 s stays at 20×/s) (all at 20×/s: the stream is 8.9 instead of 6.5 KB/s) |

Also worth a glance: **8.8 D1** the server may look back 500 ms for your shots (measured: Runner hits "taken back" on a bad line 7.6 % → 2.0 %); **8.1 D5** opening the game again on the same phone (or a second tab) takes your seat over instead of being refused; **8.11 D1** the optional fifth story is built last only if there is time.

## 8.8 My shots count on a bad 4G line

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 8.8 D1 | How far back the server may look for a shot | **500 ms** (measured: Runners 7.6 → 2.0 %, 11.9 → 1.3 %); 8.9 may raise it to 600 ms if its longer render delay needs it (600 ms now, before 8.9 measures) |
| 8.8 D2 | What one "lost packet" costs in the test switch | **A 200 ms stall** (about one 4G resend); `&stall=400` for the worse case (400 ms as the default) |
| 8.8 D3 | The Behemoth with the longer window | **Same 500 ms as zombies** (600 ms since 8.9 B8, same count) (it's a target; players are never the victim) (keep the boss at 300 ms) |
| 8.8 D4 | Who can turn on `&loss` | **Anyone, release builds too, like `?lag`** (it only hurts the phone that turns it on; your Wi-Fi testers need it on hordes.sevend.io) (dev builds only) |
| 8.8 D5 | The bots' bad line | **Built into `npm run bots` (`--lag --jitter --loss`), stalls both ways** (keep the separate proxy command, one direction) |

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
| 8.10 D1 | Zombies farther than 8 m updated 10×/s | **Yes** (no: all at 20×/s, 8.9 instead of 6.5 KB/s) |
| 8.10 D2 | How often a full picture repairs any mistake | **Once a second** (+5 % data) (every 2 s) |
| 8.10 D3 | Zombie facing | **Worked out on the phone from movement; sent only when a standing zombie turns** (always sent: +1.7 KB/s) |
| 8.10 D4 | Zombie frames that arrive before the game screen is up | **Decoded in the background from the join** (wait for the next full picture: up to 1 s without zombies after a late start or a reload) |
| 8.10 D5 | A phone with an old version after a deploy | **Refused at join: "A new version is out. Please reload."** (no check) |

8.10 also closes Epic 6 decision **6.8 B1** (stampede 28.2 KB/s accepted "until Story 8.10"): its target is ≤ 15 KB/s with 180 zombies in one view.

## 8.11 One packet per tick (optional)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 8.11 D1 | Build this optional story now | **Yes, last in the pass, if time allows** (skip until Epic 10 polish) |
| 8.11 D2 | How the tick's three messages become one packet | **Hold the socket for one tick and send once** (one new combined message: needs a new decoder on the phone) |
| 8.11 D3 | Order inside the packet | **Zombies, events, then the state update** (state update first) |
| 8.11 D4 | Stick precision on the wire | **1/127 steps** (finer than a thumb; the phone predicts with the same value) (1/32767: +4 B per input) |

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
