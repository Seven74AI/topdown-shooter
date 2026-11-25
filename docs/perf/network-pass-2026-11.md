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
