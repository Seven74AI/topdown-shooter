# Investigation: cut.test "wave 4 never ends" (Story 8.1 AC 11 flake)

## Hand-off Brief

1. **What happened.** Confirmed: wave 4 stalls because 6–10 leftover Spitters stand off ≤ 6 m from the bots, behind the bots' own wood barricades. Acid ignores barricades but bullets don't, and the networked bots (`tools/bots`) have no cover knowledge, so they fire at the nearest Spitter into the barricade forever. The 8 s cut and the reconnect play no part.
2. **Where the case stands.** Concluded, with high confidence. Reproduced deterministically: a headless sweep of the net150 run with views built like the wire bot's stalls on 10 of 120 seeds, and a single-Spitter unit repro stalls the same way. One live cut.test failure was caught with the extended dump. A bot-only fix (the wire bot learns barricade lines from the room state) gives 0 stalls in 120 headless seeds and 0 failures in about 14 live runs. It is committed on `investigate-cut-stall`.
3. **What's needed next.** Review and merge the bot-only fix. Separately, the designer should decide whether the "a wave always ends" guarantee (Spitter rush, F6) needs to cover more than 5 Spitters left holding behind a barricade; see Side Findings. Not applied.

## Case Info

| Field            | Value |
| ---------------- | ----- |
| Ticket           | Story 8.1 AC 11 flake (cut.test) |
| Date opened      | 2026-11-25 |
| Status           | Concluded |
| System           | Linux container, 4 cores, Node 22, master 99ac898 + this branch |
| Evidence sources | the parent's `cut_test_stuck` line; 45 live cut.test runs (3 parallel loops); headless net150 sweeps (120 seeds × with/without fix, 10-seed World-view control); source |

## Problem Statement

From the parent session: `tools/bots/cut.test.ts` fails about 1 run in 37. The reconnect works, but wave 4 never ends within 150 s. The stuck dump showed 7 zombies of type 3 in states 1 and 3, about 5 m from 4 alive, clustered god-mode bots. "Max payload size exceeded" was also logged in the same run. The parent asked whether this is a game bug (AI, flow field, layout) or a bot bug, and what sent the oversized message.

## Evidence Inventory

| Source | Status | Notes |
| ------ | ------ | ----- |
| Parent's stuck dump (tick 3242) | Available | 7 zombies: all type 3 = `spitter` (`packages/shared/src/zombies/zombieTypes.ts:4`). States 1 = CHASE and 3 = WINDUP (`zombieTypes.ts:7-15`). remaining 7, queued 0. The dump had no buildings. |
| Live loop runs | Available | 45 runs. Before the fix: about 31 runs, 1 stuck (`w2-r5`), dumped with buildings and per-pair line checks. After the fix: about 14 runs, 0 stuck. |
| Headless sweeps | Available | Wire-style view: seeds 1–60 gave 6 stalls, seeds 61–120 gave 4. Wire view plus fix: 0 of 120. World view on the 10 stalled seeds: 0 of 10. |
| Parent's full log for the "Max payload" line | Missing | Needed to confirm which test file emitted it (see H4). |

## Investigation Backlog

| # | Path to Explore | Priority | Status | Notes |
| - | --------------- | -------- | ------ | ----- |
| 1 | Zombie types/states in dump | High | Done | All Spitters |
| 2 | Bot targeting over the wire | High | Done | Nearest only, no cover |
| 3 | Barricades vs bullets/acid | High | Done | Asymmetric (designer 2026-11-23) |
| 4 | Live repro with buildings in dump | High | Done | 1 of about 31 |
| 5 | Headless deterministic repro | High | Done | 10/120 seeds |
| 6 | Max payload source | Medium | Done (likely) | RunRoom.test's deliberate 2 KB frame |
| 7 | Game-side: >5 Spitters holding behind a barricade vs a camping human | Low | Open | Designer call |

## Timeline of Events

| Time | Event | Source | Confidence |
| ---- | ----- | ------ | ---------- |
| 2026-11-23 | Designer rule: barricades stop everyone's bullets. Spitter acid still uses `shotBlockT` alone. | `packages/shared/src/combat/cover.ts:12-14` | Confirmed |
| 2026-11-24 | `bulletBlockT` lands (98f7297, 3b2b08c) | git log -S | Confirmed |
| 2026-11-25 | cut.test added (5536db7). Stuck dump added (13b4095). | git log | Confirmed |
| Wave 4, tick ≈ 3226 | Live run w2-r5: 6 Spitters left. Every bot's nearest one is blocked by p1's barricade. | live dump below | Confirmed |

## Confirmed Findings

### Finding 1: All the stuck zombies are Spitters holding their spot

**Evidence:** parent dump (7/7 `t:3`); live dump w2-r5 (6/6 `t:3`); headless stalls (every leftover `t3`, 10/10 seeds). `spitterStep` holds while some player is in range (6 m) with a clear `shotLineClear` (`packages/shared/src/zombies/spit.ts:118-130`).

**Detail:** States 1 and 3 are CHASE and WINDUP, the Spitter's cooldown/windup cycle. A Spitter cools down "holding its spot as long as some player is in range and sight" (`spit.ts:26`).

### Finding 2: Barricades stop bullets but not acid

**Evidence:** `bulletBlockT` adds the buildings with `stopsBullets` (`packages/shared/src/combat/cover.ts:98-116`), and `wood_barricade` sets `stopsBullets: true` (`config/balance/buildings.json`). The Spitter's line check `shotLineClear` (`cover.ts:124`) uses `shotBlockT` alone. Turrets also skip targets behind barricades (`packages/shared/src/buildings/turret.ts:82`).

### Finding 3: The networked bot fires at the nearest zombie and never strafes

**Evidence:** `tools/bots/botClient.ts` (before this branch) filled only `nearestZombie` from the horde frame. `knowsCover` stayed `false` (the `createBotView` default) and `holdsSpot` / `rushing` were never set. With `knowsCover` false the policy aims at the nearest (`packages/shared/src/bots/botPolicy.ts:201`) and fires whenever it is in range (`botPolicy.ts:211`). The strafe-to-open-a-line rule 2c needs `knowsCover` (`botPolicy.ts:291`).

### Finding 4: Live stuck run — the nearest Spitter for every bot sits behind a barricade

**Evidence:** run w2-r5, extended `cut_test_stuck` dump (wave 4, tick 3226, remaining 6, bots all `ok`, nothing held):

```
players p0 (25,15) p2 (24,14) p3 (25,16) p1 (25,15)       ← clustered
spitter (29,14) hp12: p0 4.3m bullet=0 spit=1, p2 4.7m bullet=0 spit=1, p3 4.5m bullet=0 spit=1, p1 3.9m bullet=0 spit=1   ← everyone's nearest
spitter (28,19) hp8 / (30,14) / (29,19) / (31,14): bullet=0 spit=1 for all four bots
spitter (28,10) s3: bullet=1 spit=1 (5.6–6.4 m) — clear, but not the nearest, so no bot aims at it
buildings: wood_barricade p1 [28,13.5–28.5,15.5] hp200, wood_barricade p3 [28,16.5–28.5,18.5] hp200
```

The barricades are at full HP, because Spitters never bite them. Because the bots stand together, they share the same blocked nearest target, so one blocked Spitter silences all four guns.

### Finding 5: Deterministic headless reproduction; the World-view control does not stall

**Evidence:** `runHeadless` net150 (god mode, from wave 4) with each bot's view reduced to what the wire gives (`tools/bots/wireCover.test.ts › asWireView`):

- Seeds 1–60: 6 stall past 300 s (seeds 3, 12, 16, 18, 51, 60).
- Seeds 61–120: 4 stall (87, 91, 92, 99).
- Every leftover is a Spitter, and the nearest one has `bullet0 spit1`.
- The same 10 seeds with the normal World view (`knowsCover` true, rule 2c strafes) give 0 stalls (wave 4 lasts 38–52 s).
- Single-Spitter unit repro: a bot at (10,10), a barricade between, a Spitter at 5 m. The wire bot never kills it in 60 s; the World-view bot does.

### Finding 6: The stall only happens while the wave's last rush is off

**Evidence:** rush starts at `remaining ≤ lastRushCount` = 5 (`config/balance/waves.json:4`, `packages/shared/src/waves/waveDirector.ts:450`). A rushing Spitter walks in between spits (`spit.ts:126-130`). Every stall had 6–10 remaining: the parent's dump 7, live 6, headless 6–10.

## Deduced Conclusions

### Deduction 1: The cut and the reconnect are not the cause

**Based on:** Findings 4 and 5.

**Reasoning:** The stall reproduces headless with no network, no cut and no reconnect, on 10 of 120 seeds. In the live dump all bots are `ok`, nothing is held, and the cut bot plays (its acks advance; the test checks this before the wave wait).

**Conclusion:** The flake belongs to cut.test only because cut.test is the bot test that runs wave 4 with barricades, Spitters and wire bots. The live rate (≈ 1/31, the builder's 1/37) is lower than headless (≈ 8 %) because jitter and loss move the bots around. Any `tools/bots` net150 run can stall the same way.

### Deduction 2: This is a bot bug, not a game bug in the AI or flow field

**Based on:** Findings 1–3 and 5.

**Reasoning:** Spitter AI, flow field and spawns behave as specified: hold a spot within 6 m, spit over barricades by rule. The World-view bot clears the same seeds. The difference is the view.

**Conclusion:** `tools/bots` cannot see cover. That was harmless before 2026-11-23 and became a deadlock once bot-built barricades started stopping bullets.

## Hypothesized Paths

### Hypothesis 1: Bots stop hunting or shooting after a cut (from the parent's brief)

**Status:** Refuted

**Theory:** The cut leaves the bot (or all bots) passive.

**Supporting indicators:** The stall follows the cut.

**Would confirm:** A stall needs the cut.

**Would refute:** A stall without any cut.

**Resolution:** Refuted by the headless stalls (no network at all) and by the live dump: bots `ok`, inputs applied, all four aiming at a blocked Spitter.

### Hypothesis 2: Zombie AI or flow-field stuck state (a type that won't path to clustered players)

**Status:** Refuted

**Theory:** The zombies are wedged and cannot reach the players.

**Supporting indicators:** They stay about 5 m away.

**Would confirm:** Zombies out of range or without a line, not moving.

**Would refute:** Zombies holding by rule (in range, clear spit line).

**Resolution:** Every stuck Spitter has `spit=1` within 6 m, which is the rule-based hold (Finding 1). The World view clears the same seeds.

### Hypothesis 3: Bot's blind fire at the nearest, through bot-placed barricades (Spitter standoff)

**Status:** Confirmed

**Theory:** Findings 2 and 3 together.

**Supporting indicators:** All leftovers are Spitters, and each bot's nearest is blocked.

**Would confirm:** A dump with the blocking barricade, a deterministic repro, and a fix that removes it.

**Would refute:** A stuck dump where some bot's nearest zombie has a clear bullet line.

**Resolution:** Refutation pass: I checked every stuck dump for a bot whose nearest zombie is clear and found none (live w2-r5, 10 headless seeds). Confirmed by the live dump, the headless repro and the fix (0/120 headless).

### Hypothesis 4: The "Max payload size exceeded" line comes from a bot after the reconnect

**Status:** Refuted for cut.test (likely the deliberate oversize test)

**Theory:** A bot or the cut line sends a frame over 1 KB (`MAX_CLIENT_MESSAGE_BYTES`, `apps/server/src/net/limits.ts:7`; `maxPayload`, `apps/server/src/app.ts:70`).

**Supporting indicators:** It was logged in the same run.

**Would confirm:** The line appears in standalone cut.test runs, or a bot drops with code 1009.

**Would refute:** It never appears standalone, and another test emits it on purpose.

**Resolution:**
- Standalone cut.test logs contain it 0 times in 45 runs.
- Every bot message is small (`tools/bots/botClient.ts` `room.send` calls: inputs, ready, shop, place, pong, vote).
- Both lines are byte-ordered (`tools/netaudit/cutLine.ts` Gate queue, `tools/netaudit/lagLine.ts` `OrderedDelay`), so neither can corrupt a frame length.
- `apps/server/src/rooms/RunRoom.test.ts` "closes only the client that sends a message over 1 KB" sends a 2 KB pad on purpose. Run alone, it prints this exact line (`Receiver.haveLength … getPayloadLength16`: a 16-bit length, which fits a 2 KB frame).
- In the stuck dumps all bots are `ok`, so no bot was dropped.

Conclusion: noise from a full-suite run, harmless to cut.test. To confirm 100 %, check that the parent's run included `RunRoom.test.ts`.

## Missing Evidence

| Gap | Impact | How to Obtain |
| --- | ------ | ------------- |
| The parent's full test output around "Max payload" | Would move H4 from likely to confirmed | Check whether the run was the whole suite, which includes RunRoom.test.ts |

## Source Code Trace

| Element | Detail |
| ------- | ------ |
| Error origin | `tools/bots/botClient.ts` `step()`: the view had `knowsCover` false, so `botInput` aimed at the nearest and fired into the barricade (`packages/shared/src/bots/botPolicy.ts:201,211`) |
| Trigger | The net150 wave 4 has Spitters in the mix. Bots place 2 wood barricades each within 2.5–4 m of themselves in the build (`config/balance/bots.json`). |
| Condition | More than 5 wave zombies left (no rush) and all of them are Spitters. Each bot's nearest is within 6 m of some player with a clear acid line, but behind a bullet-stopping barricade. |
| Related files | `packages/shared/src/zombies/spit.ts:118-130`, `packages/shared/src/combat/cover.ts:98-126`, `packages/shared/src/waves/waveDirector.ts:450`, `packages/shared/src/buildings/turret.ts:82` |

## Conclusion

**Confidence:** High. The root cause is confirmed, the stall reproduces deterministically (headless seeds 3, 12, 16, 18, 51, 60, 87, 91, 92, 99), and the fix removes it.

The stall is a stand-off. Spitters spit over the bots' own barricades and hold their spot, while `tools/bots` bots fire at the nearest zombie into those barricades and never strafe, because they have no cover knowledge. It is a bot bug, made reachable by the 2026-11-23 rule that barricades stop bullets. The cut and reconnect are not involved. The "Max payload" line is unrelated, most likely from RunRoom.test's deliberate 2 KB frame.

## Recommended Next Steps

### Fix direction (bot-only, applied on `investigate-cut-stall`)

- `tools/bots/wireCover.ts` (new):
  - `bulletBoxes` builds the footprints of the bullet-stopping buildings from the room state (`buildingStats` + `footprint`).
  - `wireLineClear` is `bulletBlockT`'s building tier.
  - `fillWireShot` fills `view.shotZombie` (the nearest zombie in range with a clear line; any, for a launcher) and sets `knowsCover`.
- `tools/bots/botClient.ts` `step()` calls these before `botInput`. The shared policy then aims at a clear zombie when one exists, and otherwise uses rule 2c (strafe 90°, side flipping every 64 inputs) to open a line. This is the same behaviour the headless sims already have.
- Map walls and cars are not modelled. They block acid too (`shotLineClear`), so no Spitter stands off behind one.
- `packages/shared/src/bots/headlessRun.ts` gets an optional `viewHook` (test tooling), so a wire bot can be replayed headless.
- `tools/bots/cut.test.ts`: the stuck dump now also lists the buildings and, per zombie and player, the distance plus `bullet` / `spit` line clarity.
- Tests: `tools/bots/wireCover.test.ts` covers the line check, the single-Spitter stand-off (stalls without the fix, kills with it) and net150 seed 3 headless (wave 4 stuck past 300 s without, ends with).

Results: 120 headless seeds with the fix give 0 stalls (wave 4 lasts 36.6–64.9 s, median 41.4 s, against 43 s without). Live runs after the fix: 0 failures in about 14.

### Game-side (designer decision, NOT applied)

`spit.ts:126-128` says "the wave always ends" thanks to the rush, but the rush only starts at ≤ 5 left. A human who camps behind their own barricade with 6+ Spitters holding on the other side, and does not move, also deadlocks: neither turrets nor bullets reach the Spitters. Humans can step aside, so this is a design question, not a defect. Options if wanted:

- start the Spitter rush on "all remaining are holding Spitters";
- or let a Spitter whose target is behind a barricade from it walk on after N spits.

### Diagnostic

None needed for the root cause. If the cut.test flake recurs, the extended dump shows at once whether it is this mechanism: look for a bot whose nearest zombie has `bullet=0 spit=1`.

## Reproduction Plan

1. **Deterministic, unit:** `npx vitest run tools/bots/wireCover.test.ts`. The "without cover" halves are the repro (a single Spitter at 5 m behind a barricade survives 60 s; net150 seed 3 wave 4 runs past 300 s).
2. **Headless sweep:** `runHeadless({ seed, players: 4, god: true, setup: (w) => applyTestScenario(w, "net150"), viewHook: asWireView-without-fix })` over seeds 1–120. About 8 % stall (the seed list above).
3. **Live:** loop `npx vitest run tools/bots/cut.test.ts` (3 in parallel on 4 cores). Before the fix: 1 stuck in about 31 runs, with an extended dump.

## Side Findings

- (Confirmed) `tools/bots` also never sets `holdsSpot` / `rushing`, so rule 2b (close in on a Spitter just out of range) and rule 4 (hunt the marked last rushers) are dead over the wire (`botPolicy.ts:284,309`). They were not needed for this stall: the pistol's 9 m and the SMG's 8.5 m outrange the Spitter's 6 m. A wire bot facing a rusher it cannot reach would still idle. Low priority; not checked whether the horde frame carries the type (it streams the state nibble per Story 5.6).
- (Confirmed) Turrets skip targets behind barricades (`turret.ts:82`), so the bots' auto turrets cannot break the stand-off either.
