---
stepsCompleted: [step-01-document-discovery, step-02-gdd-analysis, step-03-epic-coverage-validation, step-04-ux-alignment, step-05-epic-quality-review, step-06-final-assessment]
scope: Epic 11 (random city, backlog) against Epic 12 (extraction cinematic, done) as built, plus Epic 10 changes that touch Epic 11
date: 2026-11-27
master: 40dcf520
---

# Implementation readiness: Epic 11 against Epic 12 as built

**Date:** 2026-11-27 · **Project:** topdown-shooter · **Master:** `40dcf520` (CI green, no open PRs, no other session changed anything since the Epic 10 session ended)

## 1. Scope and documents

This check covers only Epic 11 against Epic 12 as built. It is not a whole-project check.

| Document | Used |
| --- | --- |
| `planning-artifacts/epics.md` › Epic 11 (lines 3765–3966), Epic 12 (3968–4060), epic list (429–435), FR list | yes |
| Story files `implementation-artifacts/12-1…12-4-*.md` (ACs, B/D codes, reviews, close-outs) | yes |
| Code touched by Epic 12: `buildings/pathOpen.ts`, `run/extract.ts`, `render/cameraDirector.ts`, `render/heliPose.ts`, `scenes/GameScene.ts`, `config/balance/waves.json`, `net/messages.ts` | yes |
| GDD `gdds/gdd-topdown-shooter-2026-11-21/gdd.md` (random city §, FR58/FR67 wording) and its `decision-log.md` (Q8, X2, X11) | yes |
| `game-architecture.md` (ADR-05, ADR-06, decay rules, horde stream) | yes |
| Epic 10 story files 10.2, 10.3, 10.7 and 10.12 (where they touch maps, stats or cheats) | yes |
| UX | no separate UX doc for these epics (step 4: not applicable) |

No duplicate documents were found.

## 2. What Epic 12 now requires of every map

What Epic 12 built, and what any map must provide for it:

1. **An `evac_pad` event spot.** Story 12.1 builds its main walkable region from the pad (`pathOpen.ts:225-237`), and the 12.2 walk, the helicopter and the camera all use the pad (`run/extract.ts:82-95`). Both functions fall back silently when the pad is missing, and they fall back to different points: `pathOpen` uses the first team start, `extract` uses the map centre.
2. **No map-level pocket.** A decay stage clears player walls that seal a pocket only where "the map alone still joins it" (12.1 H1 / H1-a). Downtown has 0 vertices outside the main region at every stage and every legal mask (12.1 L3, `verticesOutsideMainRegion`).
3. **Every walkable spot within walking time of the pad.** The walk lasts at most `evac.walkTimeoutS` 8 s at `player.speedMps` 4.5. After that, anyone still walking is boarded with a fade through black. The fade is meant as a safety net only (12.2 AC 8).
4. **Spawn points from which the fly-out horde can reach the pad.** 150 Walkers at 30/s, round-robin over the open spawn points (`extract.ts:323-341`), Walker speed 1.2 m/s, for 8 s (designer 2026-11-27, PR #38).
5. **A helicopter flight east.** The flight runs from the pad to 6 m past the east edge (`heliPose.ts:96`). The white fade is full when the helicopter crosses the east edge, and never later than the end of the 8 s fly-out (12.3 F1, `cameraDirector.ts:375-407`).
6. **No refund for decay losses**, through the single path `applyDecayStage` → `destroyBlockedBuildings` (12.4). Generic decay inherits this rule with no new code.

The 12.3 camera director has no hard-coded Downtown numbers in play. It reads `world.map.widthM/heightM` and the pad from the map (`GameScene.ts:2551-2555`). The 48 / 32 / 24 / 16 values in `createDirectorInputs` (`cameraDirector.ts:134-137`) are only defaults that get overwritten. The horde stream's u16 cm coordinates reach 655 m. **So nothing in Epic 12 breaks outright on a 70 × 70 m city.** The problems are distances and budgets that Epic 11's ACs don't set yet.

## 3. Findings

Severity: **High** = an Epic 11 story built as written would ship a broken or routine-failing ending. **Medium** = an AC gap a builder would likely miss, or a feel risk. **Low** = a stale note or a doc gap.

### F1 (High): the 8 s walk cannot cover a 70 × 70 m city

- **Evidence:** `waves.json › evac.walkTimeoutS` 8, `player.json › speedMps` 4.5. At most about 36 m of walking, minus the 3 m pad radius, so about 39 m of path in all. Downtown's pad is at (24, 15.9) (`buildDowntown.ts:314`): its farthest corner is about 29 m away in a straight line. A 70 × 70 m city with the pad "near the middle" (11.2 area C) has corners about 49 m away in a straight line, and more along the streets. Story 12.2 AC 8 calls the cut "a safety net".
- **Gap:** no Epic 11 AC limits the distance from the pad to the farthest walkable spot, and none adapts the walk.
- **Effect in the game:** in a random city, survivors far from the pad would often get the black fade instead of the walk.
- **Proposed fix:** designer choice **D1** (§5).

### F2 (High): the city-building time budget can't include check A on every phone

- **Evidence:** Story 11.1 sets ≤ 150 ms on the phone and ≤ 20 ms on the server, "retries included". Story 11.2's check A runs "at every stage × every legal variant mask", which is up to 5 × 32 = 160 floods. The 12.1 bench (`12-1…md:158-159`) measured one 140 × 140 flood at 0.43 ms at 1× and 1.9 ms at 4×. That is about 70 ms per try on the server and about 300 ms on a phone, before checks B–F, and up to 20 tries.
- **Gap:** the ACs assume that every client runs the whole generator including the checks, because a retry changes the result.
- **Proposed fix:** designer choice **D2** (§5). Recommended: the server runs the checks and sends the seed it accepted; phones only build that one city (11.7's code already stores the accepted seed).

### F3 (Medium): check A must use the 12.1 test itself, and 11.3's "dead end" rubble breaks it

- **Evidence:** the 12.1 H1 stage clearing works only where the map alone joins a spot to the pad (`decaySystem.ts › clearStageSeals`, `pathOpen.ts › stageCutWall`). 12.1's X3 lesson: two grids that disagree about a gap cause bugs. Story 11.3 stage 4: "rubble closes 1 of 3 candidate side streets **or dead ends** wall to wall". If rubble closes a dead end at its mouth, the floor behind it is sealed.
- **Gap:** 11.2's check A doesn't name the function or the clearance. The 11.3 rubble rule would fail check A in every city that uses the dead-end option.
- **Proposed fix (technical, no designer choice):** 11.2 check A becomes "`verticesOutsideMainRegion(world) === 0` (`pathOpen` grid, 0.4 m player clearance, anchored at the `evac_pad`) at every stage × every `gameplayDecayMasks` mask". In 11.3, rubble in a dead end sits at its closed end or fills it to the end, and anything left inside is buried (6.2's rules), never a free pocket behind the rubble.

### F4 (Medium): exactly one evac pad, with room to land, is not checked

- **Evidence:** `extract.ts:82-95` and `pathOpen.ts:225-237` fall back silently to different points when there is no `evac_pad`. Story 11.2 asks only for "an `evac_pad` point inside area C" and that it sits in the main region.
- **Gap:** nothing requires exactly one pad, a pad radius clear of solids and cover at every stage, or a test that rejects a city without a pad.
- **Proposed fix (technical):** add to 11.2's anchor check: exactly one `evac_pad`; the 3 m `evac.padRadiusM` circle is free of solids and cover at every stage × mask (area C already keeps decay away); a city with 0 or 2 pads is rejected (unit test).

### F5 (Medium): 11.5's whole-run sim stops before the new ending

- **Evidence:** 11.5's last AC says "a full 10-wave bot run reaches the Behemoth and the evacuation vote". It was written before 12.2 added the `extract` phase. AGENTS.md §3: "expect whole-run sims to break when a new mechanic lands in the run's ending".
- **Proposed fix (technical):** the run also finishes the extraction: every survivor boards, `run.lifted`, ending `extracted`, Results. The share of cut walks is recorded per seed, with a pass line set by D1. Run on the 8 seeds.

### F6 (Medium): the fly-out horde may never reach the frame in a big city

- **Evidence:** 150 Walkers at 1.2 m/s cover about 10 m in the 8 s fly-out, and they spawn round-robin from every open spawn point (`extract.ts:323-341`). Downtown's edges are about 16–24 m from the pad. In a 70 × 70 m city they are about 35 m away. 11.5 adds inner points 15–35 m from the group from stage 2, but the round-robin also uses every edge point.
- **Effect in the game:** the "over the horde" shot the designer raised to 150 (PR #38) would show a thin crowd far from the helicopter.
- **Proposed fix:** designer choice **D3** (§5).

### F7 (Medium): the 12.1 check's cost on a 70 × 70 m city has no budget

- **Evidence:** 12.1 measured 1.93–1.97 ms per placement at 4× on a 140 × 140 grid and wrote "recorded, not a target" (`12-1…md:159-161`). The decay re-check at a build start on Downtown (100 walls) took a median of 8.5–12.5 ms and a max of 20 ms at 4× (`12-1…md:190, 199`). The 70 × 70 m grid has 3.2× the cells. 11.5 only measures the flow fields.
- **Proposed fix (technical):** add to 11.5: measure on a 70 × 70 m city at 4× CPU the per-placement check (target < 3 ms), the client ghost drag (cached, no frame over budget) and the build-start re-check with 100 walls (median < 30 ms, max < 50 ms = one 20 Hz tick), with machine load, behind `PERF_ASSERT=1`.

### F8 (Low): protocol and save-version numbers are stale

- **Evidence:** `net/messages.ts:182` `NET_PROTOCOL_VERSION = 6` (10.12). The 12.2 story notes say "Epic 11 takes 6" (`12-2…md:171`). epics.md's Epic 11 readiness note (b) says "4 since Story 8.13", and note (a) says `SAVE_SCHEMA_VERSION` "1 today", but it is 2 (`runSave.ts:20`).
- **Proposed fix:** Epic 11 takes **protocol 7**, or the next free number when it lands. The save version goes 2 → 3. Fix both notes. Free net-event kinds start after the highest used (75 today).

### F9 (Low): run stats would treat every random city as its own district

- **Evidence:** 11.7 records `random:<code>` in run stats. 10.7's `run_results.district` is text and `npm run stats` groups by it (`10-7…md:36`).
- **Proposed fix (technical, no migration):** keep `random:<code>` in the column. `npm run stats` groups everything starting with `random:` as one "Random city" row and can list the codes under it. 11.7 adds a stats test.

### F10 (Low): the 10.12 "Restart with seed" cheat is undefined for a typed city code

- **Evidence:** 10.12 Q1 made "Restart with seed" restart the room's run online. 11.7 takes `citySeed` from the run seed's `city` stream, or from a code the host typed. A restart with a new run seed would silently swap the city the host typed.
- **Proposed fix:** designer choice **D4** (§5).

### F11 (Low): the camera and white-fade timing was checked only on Downtown

- **Evidence:** 12.3's timeline and stills are Downtown only (white full 5.7 s after lift-off). `flyOutDxM = max(9, widthM − padX + 6)`: on 70 m with the pad at x = 35 the flight is 41 m long, so the white comes at about 7 s. If the pad sits west of about x = 29, the helicopter doesn't cross the east edge within 8 s: the white lands on the last tick and Results come with no held white.
- **Proposed fix (technical):** 11.2: the pad's x keeps the east-edge crossing at least 1 s before the fly-out ends (a test over the 1,000 seeds). 11.6's designer stills add the extraction (walk, lift-off, white) for its 3 seeds.

### F12 (Low): decay losses in a city nobody has learned (12.4 and 11.3)

- **Evidence:** 12.4 removed the refund ("bad luck", designer 2026-11-25). Downtown players learn which alleys collapse. In a random city the 1-of-3 rubble streets and the burning cars are unknown each run. There is no conflict in code: generic rules use the same no-refund path.
- **Proposed fix:** designer choice **D5** (§5). Also (technical) 11.5's sim logs the money lost to decay per run for 10.8.

### F13 (Low): epics.md's epic list puts Epic 11's FRs under Epic 12

- **Evidence:** `epics.md:429-435`. The "FRs covered: FR32 (Random city spawns), FR65, FR69, FR90–FR94" line sits under the Epic 12 summary, whose heading is `###` while the other epics use `##`.
- **Proposed fix:** move the line under Epic 11 and make the Epic 12 heading `##`.

### F14 (Low): Epic 10's performance passes cover Downtown only

- **Evidence:** 10.2 (frame-rate scene) and 10.3 (texture estimate peak 98.5 MB) were measured on Downtown. A 70 × 70 m ground bake covers 3.2× the area (11.6 keeps the 2048² chunk rule).
- **Proposed fix (technical):** 11.6 re-runs the 10.2 wave-9 stress row and the 10.3 texture row on one generated city and records both next to Downtown's.

### Checked, no finding

- 12.1's buffers grow with the map (`pathOpen.ts:100-120`): no fixed Downtown size.
- 12.2's walk field, boarding, protection, the empty-room fix (H1) and saves never in `extract` are all map-independent.
- 12.4: one decay path, so 11.3's generic rules inherit no refund and the "Lost to the collapse / fire" toasts.
- FR58 and FR67 are already reworded in epics.md, and the architecture decay rule is updated (`game-architecture.md:461`). The GDD's random-city paragraph has nothing that contradicts Epic 12.
- 10.12 admin cheats: cheated runs are left out of the stats, and the decay-stage jump uses the same path (12.1 stage re-check included).

## 4. Summary and recommendations

**Overall status: NEEDS WORK (planning only).** Epic 11 is still buildable on top of Epic 12, and no Epic 12 code has to change. Two highs (F1 walk distance, F2 time budget) need a designer decision before 11.1/11.2 story files are written. The mediums and lows are AC wording that the change proposal adds to epics.md.

Next steps:

1. The designer picks D1–D5 (§5).
2. Apply the change proposal to epics.md (Epic 11 ACs, the readiness note, the epic-list fix) and add the cross-reference lines to the 12.2 story file and to ADR-06.
3. Epic 11 stays backlog (post-v1). When it starts, `gds-create-story` reads this report.

## 5. Designer choices

These are listed in the change proposal `sprint-change-proposal-2026-11-27-epic-11-vs-12.md` with options and numbers.
