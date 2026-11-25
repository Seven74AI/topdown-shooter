# Network pass 2026-11: before/after measurements

One section per story (network pass brief line 13: same line, same seeds, same load; "before" on the master the story branched from). Audit: [`network-audit-2026-11.md`](network-audit-2026-11.md).

## 8.8 My shots count on a bad 4G line

Branched from master `c57c1cc`. Change: rewind window 300 → 500 ms (`REWIND_MAX_TICKS` 6 → 10, `REWIND_CAP_MS` 300 → 500, 12 history rows for zombies and the Behemoth); the lossy line in the dev throttle (`?lag=150&jitter=20&loss=1`), the bots (`npm run bots -- --lag 150 --jitter 20 --loss 1`) and the harness (`Options.loss`).

### Reversed hits (harness)

`npx tsx tools/netaudit/runHits.ts 60 3`: 150 ms ± 10 ms, Pistol, seeds 1–3 × 60 s, the real server `RunController` + client Predictor / fire clock / `ServerClock` / `AdaptiveDelay` (`tools/netsim/hitsSim.ts`; the audit's copy `hitsLossSim.ts` is merged back and deleted). Before on master `c57c1cc` (identical to the audit's table), after on `story-8-8`. Load 0.1–0.6 (4 cores) for both. "Over cap" = shots whose asked view was older than the server's cap (6 ticks before, 10 after).

| Case | Line | Before reversed | After reversed | Over cap before → after | Server / local shots before → after |
| --- | --- | --- | --- | --- | --- |
| 20 Runners kiting | clean | 0.2 % (1/446) | 0.2 % (1/446) | 0 → 0 % | 459/459 → 459/459 |
| | 1 % × 200 ms | **7.6 %** (31/410) | **2.0 %** (8/406) | 50 → 0 % | 451 → 453 / 459 |
| | 2 % × 200 ms | **11.9 %** (48/404) | **1.3 %** (5/398) | 73.3 → 0 % | 452 → 447 / 459 |
| | 1 % × 400 ms (record) | 12.7 % | 7.2 % | 64.3 → 4.7 % | 434 → 432 / 459 |
| 150 Walkers kiting | clean | 0.2 % | 0.2 % | 0 → 0 % | 459 → 459 |
| | 1 % × 200 ms | 2.3 % | 1.8 % | 38.6 → 0 % | 451 → 447 |
| | 2 % × 200 ms | 3.5 % | 2.1 % | 61.7 → 0 % | 452 → 446 |
| | 1 % × 400 ms (record) | 10.0 % | 12.6 % | 45.1 → 3.8 % | 433 → 429 |
| 150 Walkers standing | clean | 0.0 % | 0.0 % | 0 → 0 % | 459 → 459 |
| | 1 % × 200 ms | 1.6 % | 2.2 % | 38.2 → 0 % | 451 → 446 |
| | 2 % × 200 ms | 1.8 % | 2.0 % | 65.5 → 0 % | 446 → 449 |
| | 1 % × 400 ms (record) | 6.3 % | 8.9 % | 47.2 → 2.8 % | 437 → 429 |

Asserted in `tools/netsim/hits.test.ts › Story 8.8: lossy line` (Runners and 150 Walkers kiting: clean ≤ 0.5 %, 1 % and 2 % × 200 ms < 5 %, stalls > 0 both ways, apparent hits > 300, < 5 % of shots over the cap). Stalls injected per 3 × 60 s row: 29–42 up / 28–42 down at 1 %, 61–67 / 67–70 at 2 %.

**1 % × 400 ms, 10 more seeds (4–13), cap 6 vs cap 10 on the same branch:** Runners kiting 10.4 → 6.7 %; 150 Walkers kiting 10.3 → 11.7 %; 150 Walkers standing 6.5 → 7.2 %. With 400 ms stalls the input queue overflows (92–106 overflow drops per row) and some shots ask for more than 500 ms anyway; in a dense Walker crowd the longer window costs about 1 pp there. Not an AC (recorded only); Story 8.9's queue work (input backlog, catch-up) is where those rows move. "Predicted shots that never fired on the server" (local − server shots: 6–30 per 459) also stays Story 8.9's number.

### Tick cost (rewind budget)

See the story file's measurement table (`PERF_ASSERT=1 npx vitest run apps/server/src/run/tickCostRewind.test.ts`, before on master, after on the branch, same load).

### Bots on the lossy line

Liveness only (review N3: the before and after lines differ, so these runs are not a before/after measurement). See the story file (T8): 4 bots, `--scenario net150 --until-wave 5 --hold-fire 45`; before = master's `lagProxy.ts` (server→client stalls only, `--stall-prob 0.01 --stall-ms 200`), after = `--lag 150 --jitter 20 --loss 1` (in-process `lagLine.ts`, both directions).

## 8.9 Smooth through hiccups

**Method.** `npx tsx tools/netsim/smoothRun.ts 60 3`: the netsim harness (`tools/netsim/hitsSim.ts`, the real server `RunController` + the real client `ServerClock`, `AdaptiveDelay`, `StepPacing`, Predictor, fire clock), Pistol, 150 ms RTT ± 10 ms, 3 seeds × 60 s per row, counters from second 2 on. Lossy = TCP loss as head-of-line stalls both ways (`loss: { pct, stallMs }`, the audit's model; 8.8 owns the option). The harness has one down message per tick (20 msg/s), so its stalls are rarer than a real phone's (~46 msg/s, audit §3.3).
**Before:** master `c57c1cc` with the same harness file patched to the old API (`snapshot`/`frame`/`renderTick`, no pacing). **After:** branch `story-8-9`.

**Final table (after the review fixes M1/M2/L2 and T10's 600 ms window, story-8-8 008df68 merged; load 1.1):**

| Case | Line | Freezes /30 s | Frozen frames | Delay p50 | Delay p95 | Back steps (render/est) | Never fired | Starved ticks | Server skips | Reversed |
|---|---|---|---|---|---|---|---|---|---|---|
| 150 walkers, standing | clean | 0 → 0 | 0 → 0 | 118 → 100 | 125 → 100 | 0/0 → 0/0 | 0 % → 0 % | 0 → 0 | 0 → 0 | 0 % → 0 % |
| 150 walkers, standing | 1% x 200 ms | 6 → 1.2 | 278 → 31 | 119 → 250 | 129 → 253 | 0/0 → 0/0 | 1.5 % → 0 % | 55 → 89 | 50 → 0 | 1.6 % → 0 % |
| 150 walkers, standing | 2% x 200 ms | 11 → 0.2 | 505 → 8 | 119 → 250 | 136 → 254 | 1/0 → 0/0 | 2.6 % → 0 % | 86 → 120 | 82 → 0 | 1.8 % → 0 % |
| 150 walkers, kiting | clean | 0 → 0 | 0 → 0 | 118 → 100 | 123 → 100 | 0/0 → 0/0 | 0 % → 0 % | 0 → 0 | 0 → 0 | 0.2 % → 0.2 % |
| 150 walkers, kiting | 1% x 200 ms | 6.9 → 0.9 | 327 → 26 | 119 → 250 | 134 → 253 | 0/0 → 0/0 | 1.5 % → 0 % | 60 → 84 | 54 → 0 | 2.3 % → 0.3 % |
| 150 walkers, kiting | 2% x 200 ms | 11.2 → 0.3 | 523 → 10 | 121 → 250 | 139 → 254 | 0/0 → 0/0 | 1.3 % → 0 % | 84 → 129 | 78 → 0 | 3.5 % → 0.5 % |
| 20 runners, kiting | clean | 0 → 0 | 0 → 0 | 117 → 100 | 123 → 100 | 0/0 → 0/0 | 0 % → 0 % | 1 → 1 | 0 → 0 | 0.2 % → 0.2 % |
| 20 runners, kiting | 1% x 200 ms | 6.6 → 0.9 | 314 → 31 | 118 → 250 | 133 → 254 | 0/0 → 0/0 | 1.5 % → 0 % | 64 → 78 | 57 → 0 | 7.6 % → 1.4 % |
| 20 runners, kiting | 2% x 200 ms | 11.2 → 1.2 | 517 → 34 | 121 → 250 | 140 → 253 | 0/0 → 0/0 | 1.3 % → 0 % | 83 → 128 | 76 → 0 | 11.9 % → 1.7 % |
| 20 runners, kiting | 1% x 200 ms + 150 ms step | 6.9 → 1 | 665 → 38 | 120 → 250 | 134 → 253 | 3/3 → 0/0 | 0.7 % → 0 % | 66 → 94 | 54 → 2 | 36.5 % → 14.7 % |

**First after-table (before the review fixes, 300 ms window): Story 8.8's harness loss (commit df00ed48, cherry-picked; stalls drawn from the shared RNG, as the audit).** Before = c57c1cc + df00ed48 (load 1.1–2.3), after = story-8-9 + df00ed48 (load 1.0).

| Case | Line | Freezes /30 s | Frozen frames | Delay p50 | Delay p95 | Back steps (render/est) | Never fired | Starved ticks | Server skips | Reversed |
|---|---|---|---|---|---|---|---|---|---|---|
| 150 walkers, standing | clean | 0 → 0 | 0 → 0 | 118 → 100 | 125 → 100 | 0/0 → 0/0 | 0 % → 0 % | 0 → 0 | 0 → 0 | 0 % → 0 % |
| 150 walkers, standing | 1% x 200 ms | 6 → 1 | 278 → 34 | 119 → 250 | 129 → 252 | 0/0 → 0/0 | 1.5 % → 0 % | 55 → 87 | 50 → 1 | 1.6 % → 0 % |
| 150 walkers, standing | 2% x 200 ms | 11 → 0.3 | 505 → 9 | 119 → 250 | 136 → 253 | 1/0 → 0/0 | 2.6 % → 0 % | 86 → 119 | 82 → 0 | 1.8 % → 0 % |
| 150 walkers, kiting | clean | 0 → 0 | 0 → 0 | 118 → 100 | 123 → 100 | 0/0 → 0/0 | 0 % → 0 % | 0 → 0 | 0 → 0 | 0.2 % → 0.2 % |
| 150 walkers, kiting | 1% x 200 ms | 6.9 → 1 | 327 → 29 | 119 → 250 | 134 → 252 | 0/0 → 0/0 | 1.5 % → 0 % | 60 → 92 | 54 → 0 | 2.3 % → 5.2 % |
| 150 walkers, kiting | 2% x 200 ms | 11.2 → 0.5 | 523 → 11 | 121 → 250 | 139 → 252 | 0/0 → 0/0 | 1.3 % → 0 % | 84 → 133 | 78 → 0 | 3.5 % → 6.6 % |
| 20 runners, kiting | clean | 0 → 0 | 0 → 0 | 117 → 100 | 123 → 100 | 0/0 → 0/0 | 0 % → 0 % | 1 → 1 | 0 → 0 | 0.2 % → 0.2 % |
| 20 runners, kiting | 1% x 200 ms | 6.6 → 0.9 | 314 → 34 | 118 → 250 | 133 → 252 | 0/0 → 0/0 | 1.5 % → 0 % | 64 → 90 | 57 → 0 | 7.6 % → 18.1 % |
| 20 runners, kiting | 2% x 200 ms | 11.2 → 0.9 | 517 → 31 | 121 → 250 | 140 → 253 | 0/0 → 0/0 | 1.3 % → 0 % | 83 → 130 | 76 → 0 | 11.9 % → 21.5 % |
| 20 runners, kiting | 1% x 200 ms + 150 ms step | 6.9 → 1.2 | 665 → 43 | 120 → 250 | 134 → 252 | 3/3 → 0/0 | 0.7 % → 0 % | 66 → 94 | 54 → 2 | 36.5 % → 37.8 % |

First pass (my local copy of the loss model with its own RNG; same story code): freezes 0.9–1.4 / 30 s at 1 %, starved 81–82 → 104–124: same picture, the RNG only moves which messages stall.

- **Freezes** = episodes of the render tick past the newest frame (others and the horde hold still). Frozen frames fell ~10×: what is left is mostly the first stall after > 10 s of calm (the delay is back at 100 ms there, F4) and a stall right after the eased-down hold.
- **Delay:** clean lines sit at exactly 100 ms (before: 110–125, jitter-driven); lossy lines at 250 ms (cap, D1), up to 260 while a frame is overdue (stall stretch ≤ 25 ms).
- **Never-fired predicted shots** 1.3–2.0 % → 0 %: the client's 0.9× steps empty the backlog, the server's skip rule now almost never fires (0–3 skips vs 69–91).
- **Starved ticks +41–58 % on 8.8's loss (AC "± 10 %" NOT met).** Cause, measured: with the server drain, a post-stall backlog of ~5 inputs sits 2 s as cover for the next stall; the pacing empties it in ~2 s gradually, so the next stall finds less cover (Story 2.4's trade-off). Two variants tried (make up exactly the reported excess; leave one extra) gave 114–131 starved, no better. A starved tick delays one of my moves by a tick; a skipped input (before) loses it.
- **Reversed hits on kiting rows rose** (Runners 7.6 → 18.1 % at 1 %): the shots are 100–150 ms older with the 250 ms delay and today's rewind window is 300 ms. Story 8.8's 500 ms window is the fix; re-measure after 8.8 (T10).
- **Latency step row:** the old clock stepped back 3 times (audit F5); now 0. Its reversed % is a harness artefact (`setRtt` stays at 150 ms after the step).
- **Bandwidth:** `inputQueued` changes 0–10 times/s per player (harness count) at ~2 B per change in a patch the player is already in → ≤ 0.1 KB/s per phone with 4 players.
- **Tuning runs** (1 % × 200 ms, 12 × 60 s, 20 Walkers standing + 20 Runners kiting): ease-down 20 ms/s → 2.1 freezes/30 s, 10 → 1.6, 5 → 1.0 (chosen); p99 instead of p95 for the target: no better; without the overdue slowdown 3.0 (with: 1.0).

### 8.9 T10: rewind window with the 250 ms lossy-line delay (after merging story-8-8 c1c5ef1)

`tools/netsim/hits.test.ts` › Story 8.8 lossy rows (150 ms ± 10, Pistol, kiting, seeds 1–3 × 60 s), load 1.0–1.5:

| Case | Line | 8.8 alone (500 ms, 8.8's numbers) | 8.8 + 8.9 at 500 ms | 8.8 + 8.9 at 600 ms (B8, applied) |
|---|---|---|---|---|
| 20 Runners | 1 % × 200 ms | 2.0 % reversed | 1.8 %, 16.0 % of shots over the 10-tick cap | **0.7 %**, 0 % over the 12-tick cap |
| 20 Runners | 2 % × 200 ms | 1.3 % | 4.2 %, 32.7 % over | **1.4 %**, 0 % over |
| 150 Walkers | 1 % × 200 ms | — | 0.3 %, 17.9 % over | **0.3 %**, 0 % over |
| 150 Walkers | 2 % × 200 ms | — | 0.5 %, 29.4 % over | **1.1 %**, 0 % over |

View offset p95 11.4–11.7 ticks with the 250 ms delay (one-way + queue + delay), so 8.8 D1's fallback (600 ms / 12 ticks, history 14 rows) was applied. Clean rows unchanged (0.2 %). Tick cost (`PERF_ASSERT=1 tickCostRewind.test.ts`, load 1.1): rewind adds mean 0.011 / p99 0.070 ms. `smoothRun.ts 60 3` after the merge (load 1.4): freezes/30 s 0.9–1.2 at 1 %, 0.3–1.2 at 2 %; never fired 0 %; starved 75–98 at 1 % (B7); 0 back steps.

Bots on the lossy line (`npm run bots -- --count 4 --scenario net150 --until-wave 4 --lag 150 --jitter 20 --loss 1`): wave 4 played, 173 kills, 48 stalls up / 106 down, 7.6 KB/s down avg (peak 19.8), 2.2 up, RTT 147–210 ms; 0 `seq_gap_suspect` / `spread_cancel_suspect`.

### 8.9 review fixes (2026-11-25)

- M1/M2: the server estimate catches up forward at ≤ 1.5× (`CLOCK_SLEW_FORWARD_FRACTION` 0.5; back stays 0.9×); horde ring 8 → 16 frames. `adaptiveDelay.test.ts` › "review M1/M2…" (1 ms frames): estimate back within 25 ms of the server after 548 ms (−200 ms fall; was ~1.9 s), 564 ms lossy, 1448 ms for −500 ms (was ~5.2 s); real delay = the old delay + the fall at most, back within the target + 25 ms after 1.9 / 2.0 / 5.2 s (the 1.1× limit, D2: the picture never jumps forward); the render tick at most 5.8 / 8.7 / 11.6 ticks behind the newest frame (ring 16).
- L2: rate held at 1× at the stretch cap while overdue; rate slew ≤ 4/s; `FRAME_OVERDUE_MS` 15 → 10 to keep F1 (2/s with 15 ms: 1.03 freezes/30 s; 4/s with 10 ms: 0.86).
- Re-review RL1: the render clock's max(estimate, measurement) reference was an equivalent mutant once the 50 % catch-up was in, and is removed (numbers unchanged: same tests and bounds pass). RM1 → B9: F1 is ≤ 1.2 freezes per 30 s on every 1 % row.

## 8.1 Reconnect within 2 minutes

Measured 2026-11-25 in the builder's cloud session (4 cores, load 0.1–0.6 during the bot runs). Bots: `npm run bots -- --url http://127.0.0.1:2811 --count 4 [--lag 150 --jitter 20 --loss 1|2] --cut-bot 2 --cut-at 12 --cut-for <S> --until-wave 3`, server `DEV_START_WAVE=3` (the 130 s run: `--scenario net150`, god mode, so the other three survive the 2 minutes). "Back" = the cut bot's link is up and its survivor is in the World again, counted from the end of the cut. The cut line (`tools/netaudit/cutLine.ts`) holds every byte both ways (no close) and sits in front of 8.8's lag line.

| Case | Before (master b0e491a) | After (story-8-1) |
| --- | --- | --- |
| Bot line cut 8 s mid-wave, clean line | out of the run (any drop = leave, `RunRoom.onLeave`; the 2.11 test asserted removal) | back **51 ms** after the cut (token reconnect + guest takeover), HP 100 → 100, wallet 171 → 172 (a kill paid while held), weapons same |
| Bot line cut 8 s, lossy line 1 % (150 ± 10 ms, 200 ms stalls; 138 stalls) | out | back **303 ms** after the cut (guest takeover), HP/wallet/weapons same |
| Bot line cut 8 s, lossy line 2 % (261 stalls) | out | back **302 ms** after the cut, HP 92 → 92, wallet 130 → 133 (turret pay while held, F5) |
| Bot line cut 30 s, clean | out | back **51 ms** after the cut; offline inputs dropped (no `returned via input`) |
| Bot line cut 130 s (net150) | out | hold ran out at 120 s (`player_hold_expired`), 7 × `seat_kept` refusals mid-wave, **restored at the next build phase** 13 s after the cut, wallet 136 → 136, same weapons |
| Automated 8 s cut (4 bots on 8.8's 1 % line, `tools/bots/cut.test.ts`) | — | 6 / 6 green (3 clean-line runs before 8.8 merged, 3 lossy + net150 after) |
| Server: silent socket terminated after | 6–9 s (`pingMaxRetries` 2) | 12–15 s (3 s × 4; config, `TRANSPORT_PING_*` in limits.ts; not timed here) — and the survivor is held after 3 s of no input (D1) |
| Phone shows "reconnecting" after | never (≈ 56 s of silent SDK retries, then the start screen) | **3.1 s** (two-tab smoke: 3075–3133 ms, watchdog 3 s; unit test fires at 3001 ms in a 1 ms sweep); **30 ms** on an `offline` event |
| Teammate sees the grey chip after | — | 3.1–3.4 s (smoke) |
| Server tick with a held player (wave 3, 84 zombies) | tick avg 0.92 ms (8 s cut run), max 6.5 ms | same wave without a hold: 0.88 / 2.2 ms (30 s run). Hold bookkeeping per tick = one loop over ≤ 4 slots + a `heldPlayers.size` check: below the noise (budget ≤ +0.2 ms) |
| Bytes: hold fields | — | 0 B/s while nobody is held (heldUntilTick / protectTicks / frozen / resumeIn change only on a hold, a return, a freeze; protectTicks 40 changes once after a mid-wave return ≈ 40 × 3 B over 2 s) |

Notes:
- A bot cut longer than the 2.12/8.8 checks is quiet-held after 3 s; the takeover joins wait on the cut line and land within ~0.3 s of it ending (one attempt in flight, 10 s attempt timeout).
- Inputs a bot sent in the first 3 s of a cut (before its watchdog fired) arrive late; at most the input ring (6 = 0.3 s of moves) is applied. Phones send a `viewTick`: an input more than 2 s behind the server is dropped (F7); bots send none, so this rule does not cover them.
- Two-tab browser smoke (brief 34): `docs/perf/network-pass-smoke-8-1-2026-11-25.md`.

## 8.10 Half-size horde stream

Branched from master `d8d44d0` (8.8 + 8.9 on it). Change: the horde stream becomes per-client keyframes + deltas (wire format `NET_PROTOCOL_VERSION` 2, refused at join as `update_required` otherwise), heading worked out on the phone (sent only when it would be > 4 steps off, B1), zombies > 8 m from the view centre refreshed every 2nd tick by slot parity and glided between their own refreshes on the phone, a keyframe on the first frame / after a skip / every 20 ticks (staggered) / whenever a delta is not smaller; decoded per connection from the join (`RunInbox`). Full table: the story file (`_bmad-output/implementation-artifacts/8-10-half-size-horde-stream.md` › Measurements).

**Method.** Before = a clean worktree of `d8d44d0`, after = `story-8-10`, same seeds and lines, same machine. Replay: `npx tsx tools/netaudit/hordeEncodings.ts 600` (now runs the real encoder → decoder and checks every tick against the full frame). Stampede: `apps/server/src/run/eventBandwidth.test.ts` (real stream, worst 1 s window). Bots: `npm run bots -- --count 4 --scenario net150 --until-wave 5 --hold-fire 45` (+ `--lag 150 --jitter 20 --loss 1`), horde KB/s from the server's `net_stats.hordeKBps`. Freezes: `npx tsx tools/netsim/smoothRun.ts 60 3` (the harness now draws through the real stream + `HordeBuffer`; `HORDE_NEAR_M=Infinity` = the all-20 Hz control).

| Case | Before | After |
| --- | --- | --- |
| Audit replay, ~118 in view | 18.6 KB/s | **6.7 KB/s** (0 mismatches / 600 ticks, keyframes 1.0/s) |
| 150 near + moving (packed round the player) | 24.2 KB/s | 11.6 KB/s |
| Stampede, 180 in one view (decision 6.8 B1) | 28.2 KB/s | **13.4 KB/s** worst 1 s (avg 12.1) |
| Bots clean, horde per phone (waves 4–5) | 9.2–11.0 KB/s | 3.4–4.3 KB/s |
| Bots lossy, horde per phone | 8.6–12.6 KB/s | 3.6–5.2 KB/s |
| Bots, total down per phone (clean / lossy) | 11.7–11.8 / 11.1–13.4 KB/s | 5.6–5.9 / 5.8–6.9 KB/s |
| Keyframes / decode errors (bots) | 20/s / 0 | 1.0–1.3/s / 0 |
| Encoder, 4 clients × 150 (mean / p99) | 0.055–0.062 / 0.154–0.199 ms | 0.120–0.126 / 0.206–0.276 ms |
| Freezes /30 s, 1 % rows (standing / kiting / runners) | 1.2 / 0.9 / 0.9 | 1.2 / 0.7 / 0.7 (control 1.0 / 0.9 / 0.7) |

New horde budget (brief line 8): the measured worst case 13.4 KB/s + 20 % → **≤ 16 KB/s**. The 10 Hz rule adds no freeze (every row within ±0.2 of its all-20 Hz control) and no blink (`tools/netsim/hordeGlide.test.ts`). Clean 20 Runners kiting reads 0.9 % reversed on the real-buffer harness with or without the far rule (B2). Backpressure on a capped line: see the story file (B6: F12 confirmed for 64 kbit/s, threshold unchanged).

### 8.10 review fix B7: every zombie at 20 Hz (as shipped)

The review (RM2) measured the far rule's stutter on the clean line: between a far zombie's refreshes the buffer needs the frame two ticks past the render tick, and the newest frame leads by only 1.0–2.0 ticks there (p50 1.34), so far zombies stood still then jumped in 15–16 % of their between-refresh samples. Decision 8.10 B7 (supersedes D1): `HORDE_NEAR_M = Infinity`; the far rule's code stays behind `HORDE_FAR_RULE_RADIUS_M` (8 m) for a later story. Re-measured, same seeds and lines (master `02e7d8c` merged, load 0.1–0.5):

| Case | Before | First build (D1 on) | As shipped (B7) |
| --- | --- | --- | --- |
| Audit replay, ~118 in view | 18.6 KB/s | 6.7 | **8.2 KB/s** |
| 150 near + moving | 24.2 | 11.6 | 11.0 |
| Stampede, 180 in one view (worst 1 s) | 28.2 | 13.4 | **13.5 KB/s** |
| Bots clean / lossy, horde per phone | 9.2–11.0 / 8.6–12.6 | 3.4–4.3 / 3.6–5.2 | 4.4–5.5 / 2.6–5.3 KB/s |
| Freezes /30 s, 1 % rows (standing / kiting / runners) | 1.2 / 0.9 / 0.9 | 1.2 / 0.7 / 0.7 | 1.0 / 0.9 / 0.7 |

Horde budget unchanged at ≤ 16 KB/s (13.5 + 20 %). The 64 kbit/s backpressure finding (B6) is owed to Story 8.11.

## 8.11 One packet per tick

Branched from master `c9726a5`. Change: the state patch comes from the tick (`onTick` = one step, then `broadcastPatch`; `patchRate` null once the fixed timestep runs, so Results, the lobby after a run and an 8.1 frozen room still patch on change at 20 Hz from the same timestep); Colyseus 0.18.29's `autoBatchMessages` corks each socket for the timestep's callback, so the tick's horde frame, events, ping and patch leave as one TCP write (decisions D2, D3; B1); the input is a 14-byte binary `BYTES.INPUT` (int8 sticks at 1/127, D4) instead of the ~116 B msgpack `input.send`, validated like the zod schema, quantised on the phone before prediction; `NET_PROTOCOL_VERSION` 3.

**Method.** Same machine, same scenario and lines, load 0.1–0.8 (recorded per run). Before = `c9726a5` server + the branch's measurement-only bot changes (`tools/bots/wireMeter.ts`, per-wave line counters in `run.ts`; no game code), after = `story-8-11`. Server in its own process (`PORT=2611 ALLOW_TEST_SCENARIOS=1 node --import tsx src/index.ts`), `npm run bots -- --url http://localhost:2611 --count 4 --scenario net150 --until-wave 5 --hold-fire 45 --lag 150 --jitter 20` (+ `--loss 1`). Down/up writes = chunks the separate-process lag line read from each socket (TCP_NODELAY on both ends: one per write), per phone (`bots_line_wave`); message bytes by kind, patches and their tick steps from each bot's WebSocket (`bot_wave.wire`, payload bytes). Waves 4–5 (150 alive).

| Metric (4 bots, waves 4–5) | Line | Before | After | Target |
| --- | --- | --- | --- | --- |
| Down writes per phone per s | clean | 46.0 / 46.5 | **20.3 / 20.1** | ≤ 25 ✓ |
| | lossy | 47.0 | **20.3 / 20.2** | ≤ 25 ✓ |
| Down messages per phone per s (unchanged: same messages, fewer writes) | clean | 46.2–48.0 | 47.0–49.6 | — |
| Up writes per phone per s | clean / lossy | 21.3 / 21.3 | 21.3 / 21.3 | — |
| Input upload payload KB/s | clean | 2.28–2.38 | **0.31** | ≤ 0.6 ✓ |
| | lossy | 2.30–2.38 | **0.31** | ≤ 0.6 ✓ |
| Input message on the wire | — | ~116 B msgpack + header | 14 B + 2 B header | ≈ 14 B ✓ |
| Patches per s / ticks per s | clean | 19.87–19.94 / 20.0 | **20.0 / 20.0** | equal (± 1 %) ✓ |
| Ticks per patch (0 / 1 / 2), per wave | clean | 0 / 1641 / 5 · 0 / 1720 / 12 | **0 / 1401 / 0 · 0 / 1556 / 0** | exactly 1 ✓ |
| | lossy | 0 / 1528 / 6 · 0 / 1496 / 9 | **0 / 1874 / 0 · 0 / 1465 / 0** | exactly 1 ✓ |
| Patch bytes per phone KB/s | clean / lossy | 1.40–1.42 / 1.37–1.49 | 1.45–1.46 / 1.31–1.43 | — |
| Horde (bot means) KB/s | clean / lossy | 2.6–4.9 / 4.1–5.0 | 4.3–5.8 / 4.0–5.1 | see below |
| Events KB/s | clean / lossy | 0.38–0.57 / 0.52–0.60 | 0.47–0.65 / 0.42–0.69 | see below |
| Horde stream, audit replay (deterministic, `hordeEncodings.ts 600`) | — | 8.2 KB/s (8.10 as shipped) | **8.2 KB/s**, 0 mismatches | ± 2 % ✓ |
| Server tick avg / max (step only; `tick_stats`) | clean+lossy | 1.26–1.30 / 3.1–8.7 ms | 0.87–1.02 / 2.5–5.2 ms | ≤ +0.1 ms ✓ |
| Patch avg / max (`tick_stats`) | — | 0.09–0.14 / 0.5–3.2 ms | 0.02 / 0.2–0.4 ms | — |
| Horde decode errors (bots) | lossy | 0 | 0 | 0 |
| Lag line stalls injected up / down (lossy run) | lossy | 145 / 301 | 143 / 150 | liveness |

**Horde and event bytes (± 2 %).** The horde encoder, the event encoding and the interest filter are untouched (`git diff c9726a5 -- apps/server/src/net/hordeEncoder.ts packages/shared/src/net/{hordeFormat,hordeStream,netEvents,interest}.ts` is empty) and the deterministic audit replay gives the same 8.2 KB/s with 0 mismatches. The bot runs' horde/event KB/s move by ± 30 % between any two runs on either side (where the bots walk and what they shoot differs run to run; the bots also aim with 1/127 sticks now), so they are recorded, not compared (decision 8.11 B8).

**Tick cost.** The patch moved out of its own interval into the timestep, after the step's timing (`slow_tick` still times the step only; `slow_patch` the patch). Both got cheaper: the corked socket buffers the tick's sends and writes once (avg tick 1.26–1.30 → 0.87–1.02 ms, patch 0.09–0.14 → 0.02 ms). No p99 is logged by the server; avg and max are recorded.

**Estimated 4G wire saving (not asserted, H4).** Down: ≈ 26 fewer segments/s × ~78 B of TCP/IP + radio overhead ≈ **2.0 KB/s** per phone (Cloudflare may already coalesce some). Up: the input payload 2.3 → 0.31 KB/s (**−2.0 KB/s**); up segments stay at ~21/s (one input each, plus the pong). On the lossy line model (a stall per chunk) the down direction sees half the stall events because it has half the chunks; a real line loses per segment too, so fewer, fuller segments also mean fewer retransmit stalls (each now holds one whole tick).

**Tests.** `tools/bots/onePacket.test.ts` (2 bots, real server: ≤ 25 kernel writes per phone per s counted on the server's sockets, every patch one tick, 16 B per input on the wire; fails at 47 writes/s with `autoBatchMessages` off), `apps/server/src/rooms/RunRoom.patch.test.ts` (one tick per patch on the server and the phone, the horde frame before its tick's patch; Ready reaches the other phone < 150 ms after Back to lobby; fails with a double patch per tick), `packages/shared/src/net/input.test.ts` (round trip, boundaries, refusals, 20 000-case fuzz against the zod schema), `apps/server/src/net/messageGuard.test.ts` (bytes parser: `invalid` counted, 25/s bucket unchanged), `apps/server/src/rooms/RunRoom.test.ts` (short, long, −128 stick, extra flag bit and the old msgpack input refused and counted; a 2 KB binary closes only that client), `apps/client/src/sim/NetSimHost.test.ts` (wiring: the predictor sees exactly what was sent; fails without the decode-back).
