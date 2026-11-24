---
stepsCompleted: [step-01-document-discovery, step-02-gdd-analysis, step-03-epic-coverage-validation, step-04-ux-alignment, step-05-epic-quality-review, step-06-final-assessment]
scope: Epic 6 only (Stories 6.1–6.12)
documentsIncluded:
  gdd: gdds/gdd-topdown-shooter-2026-11-21/gdd.md
  architecture: game-architecture.md
  epics: epics.md (› Epic 6)
  ux: docs/ideas/building-ux/ux-spec.md (Epic 5 building UX; no Epic 6 UX spec)
  stories:
    - implementation-artifacts/6-1-the-full-10-wave-curve.md
    - implementation-artifacts/6-2-ruins.md
    - implementation-artifacts/6-3-blackout-lighting.md
    - implementation-artifacts/6-4-collapse.md
    - implementation-artifacts/6-5-the-behemoth-arrives.md
    - implementation-artifacts/6-6-behemoth-charge-and-throw.md
    - implementation-artifacts/6-7-enrage-and-the-end-of-the-behemoth.md
    - implementation-artifacts/6-8-special-events-car-alarm-and-stampede.md
    - implementation-artifacts/6-9-gas-leak-and-supply-drop.md
    - implementation-artifacts/6-10-power-failure-and-survivor.md
    - implementation-artifacts/6-11-evacuation-vote.md
    - implementation-artifacts/6-12-endless-mode.md
  supporting:
    - docs/epic-6-brief.md
    - docs/epic-6-decisions.md
    - docs/epic-5-decisions.md (Alignment answers; 2026-11-24 lines)
    - docs/ideas/epic-6/proposal.md
---

# Implementation Readiness Assessment Report: Epic 6

**Date:** 2026-11-24
**Project:** topdown-shooter
**Scope:** Epic 6 "The full run: decay, boss, events, endless" only. The run was unattended, so Continue was chosen at every menu.

## Document Inventory

| Type | File | Notes |
| --- | --- | --- |
| GDD | `gdds/gdd-topdown-shooter-2026-11-21/gdd.md` | Already updated for D1–D7: always 2 events, endless capped at 600, Floodlight 6 m in blackout |
| Architecture | `game-architecture.md` | Blackout Lighting (§4), run state machine with EvacVote, `shared/src/boss`, `shared/src/events`, system order |
| Epics | `epics.md` › Epic 6 (Stories 6.1–6.12, revised 2026-11-23) | FRs covered (header): FR28, FR29, FR31, FR33–FR43, FR53, FR57, FR62–FR64, FR66–FR68, FR84 (plus FR87, which 6.3 and 6.4 cite) |
| Story files | `implementation-artifacts/6-1 … 6-12` (12 files, drafted 2026-11-24) | Status "drafted", waiting for the designer to confirm the story decisions |
| Brief | `docs/epic-6-brief.md` | 28 lines, pasted into every story |
| Decisions | `docs/epic-6-decisions.md` | 108 story decisions to confirm, build rounds, look picks |
| Design source | `docs/ideas/epic-6/proposal.md` | Numbers for `boss.json`, `events.json`, `waves.json` and `decay.json` |
| UX | `docs/ideas/building-ux/ux-spec.md` | Epic 5 building UX. No Epic 6 UX spec exists; the stories and the look picks carry the UI rules |

**Duplicates:** none. **Missing:** no Epic 6 UX spec (see UX Alignment).

## GDD Analysis (Epic 6 slice)

The FR lines in `epics.md` › Requirements Inventory were read against the GDD for this epic's FRs. They match the GDD after the D1–D7 updates. One wording gap remains: the GDD and FR63 say "wave 10 lit only by fires and floodlights", while the proposal (§4), Epic Story 6.3/6.4 and the stories also light it with flashlights and muzzle flashes. The stories follow the proposal (see note L1).

Functional requirements in scope: FR28, FR29, FR31, FR33, FR34, FR35, FR36, FR37, FR38, FR39, FR40, FR41, FR42, FR43, FR53, FR57, FR62, FR63, FR64, FR66, FR67, FR68, FR84 and FR87 (24 in total). The non-functional limits that apply come in through brief lines 11, 12, 16 and 25: 30 KB/s per phone, the Mi 11i FPS floor, at most 2 ms added to server p99 for Epic 6, and a flat 20-wave endless run.

## Epic Coverage Validation

### Coverage Matrix

| FR | Story (AC) | Status |
| --- | --- | --- |
| FR28 wave sizes, 150 / 110 cap | 6.1 F1, 6.5 AC 4, 6.12 F1 | ✓ |
| FR29 W7–10 mix, 2 fixed Brutes | 6.1 F2, F3 | ✓ |
| FR31 player-count scaling, boss HP | 6.1 F1, 6.5 F10 | ✓ |
| FR33 Behemoth body and arrival | 6.5 F1, F10, AC 3 | ✓ |
| FR34 slam / charge / throw, crash stun | 6.5 F2, F8, AC 10; 6.6 F1–F8 | ✓ |
| FR35 enrage | 6.7 F1–F4 | ✓ |
| FR36 death calls the helicopter | 6.7 F7, AC 5; 6.11 F6 | ✓ |
| FR37 2 events per run, waves 3–8, not 5, not back-to-back | 6.8 F2, F3, F9 | ✓ |
| FR38 car alarm | 6.8 F4, F5, AC 7 | ✓ |
| FR39 gas leak | 6.9 G1–G4 | ✓ |
| FR40 supply drop | 6.9 G5–G8 | ✓ |
| FR41 stampede | 6.8 F6–F8, AC 9–10 | ✓ |
| FR42 power failure | 6.10 P1–P3 | ✓ |
| FR43 survivor | 6.10 S1–S5 | ✓ |
| FR53 rubble blocks building; the charge destroys buildings | 6.2 F3; 6.6 F6 | ✓ |
| FR57 gas-leak hazard | 6.9 G1–G2 (cited after the fix) | ✓ |
| FR62 Ruins | 6.2 F1–F7 | ✓ |
| FR63 Collapse, fog 10 m | 6.4 F1–F3 | ✓ |
| FR64 blackout lighting | 6.3 F1–F9 | ✓ |
| FR66 vote | 6.11 F1–F4 | ✓ |
| FR67 Extract / Stay | 6.11 F7, AC 9–11 | ✓ |
| FR68 endless | 6.12 F1–F7 | ✓ |
| FR84 boss telegraphs and audio | 6.5 AC 10, 13, 14; 6.6 AC 8 (cited after the fix) | ✓ |
| FR87 darkness and fog can't be turned off | 6.3 F6; 6.4 F5 | ✓ |

### Epic ACs that a story decision changes

Every Epic 6 AC in `epics.md` appears in its story. These stories change an epic AC through a decision that waits for the designer:

| Story | Epic AC | Story text | Decision |
| --- | --- | --- | --- |
| 6.2 | rubble refuses placement with "Can't build here" | "Blocked by rubble" (the 5.17 reason line) | 6.2 D5 |
| 6.3 | unlit ground at 10 % light | 20 % (power failure) / 10 % (wave 9) / 5 % (wave 10 and endless) | 6.3 D1 (look pick) |
| 6.4 | only the local player's own beam sees through the fog; hard 10 m edge | any standing teammate's beam; shown within 9 m, fading out by 10 m | 6.4 D2, D1 |
| 6.4 | (silent) | aim assist never locks a zombie the fog hides | 6.4 D4 (brief 26) |
| 6.5 | "the street edge farthest from the team" | one of the 4 main street ends | 6.5 D2 |
| 6.6 | crash on car, bus, building, rubble, map edge | also pumps, low walls, dumpster, sandbags, police barriers | 6.6 D1 |
| 6.6 | throw at players beyond 8 m | also beyond 4.5 m when the boss can't walk to that player | 6.6 D5 |
| 6.8 | "when a player shoots it" | a player's bullet only (no turrets, melee, flames, blasts) | 6.8 D2 |
| 6.9 | "any player can shoot the tank" | a player's bullet only | 6.9 D2 |
| 6.11 | "majority wins" | Stay needs more than half of the whole team; silent players count as Extract | 6.11 D1 |
| 6.11 | ends when "everyone has voted" | 1 s after the last vote | 6.11 D3 |
| 6.12 | (silent on even waves) | even endless waves are half dark; odd waves use wave 9's mix, even waves wave 10's | 6.12 D3, D5 |

### Coverage Statistics

- Epic 6 FRs in scope: 24
- FRs covered by at least one story AC: 24 (100 %)
- Epic ACs missing from a story: 0

## UX Alignment Assessment

### UX Document Status

No Epic 6 UX spec exists. The UI the epic needs (boss bar, telegraphs, edge markers, event pins, vote overlay, dawn, "Lost in the city") is specified inside the stories and the designer's look picks, and every story checks it at 568 × 320 and 800 × 360 (brief 24). The building UX spec (`docs/ideas/building-ux/ux-spec.md`) has room for the Floodlight tile that 6.3 turns on (7 types of 8 tiles), so 6.3's `inShop` flip needs no UI edit (brief 27).

### Alignment Issues

None blocking. The architecture says the darkness is a "render texture". 6.3 DD1 uses a registered 2D canvas instead, because `noUnregisteredTextures.test.ts` forbids RenderTexture (Story 4.13). This is a deliberate, documented deviation (note L2).

### Warnings

The HUD boss bar (6.5) and the vote overlay (6.11) must keep their distance from 5.20's undo chip and the ping button. Both stories say so; check this at review.

## Epic Quality Review

### Epic structure

| Check | Result |
| --- | --- |
| Player value | ✓ Every story gives the team something they can play or see. 6.3 is an enabler: it ships every `lightPctByWave` entry as 0, so in a normal run its only visible change is the Floodlight and Tactical flashlight in the shop. The force-blackout switches show the rest (note L3). |
| Independence / forward dependencies | ✓ Nothing blocks. Each later hook has a working fallback: 6.5 `pickBossAttack` stub and DEAD-only death until 6.6/6.7; `aboveDarkness` shim until 6.3; `waves.maxAlive` until 6.5's `maxAliveNow`; dev switches (`?bosswave`, `DEV_DECAY_STAGES`, `?startwave`) until 6.1. |
| Testable ACs | ✓ Fairness rules come first in all 12 stories (named F, or G/P/S in 6.9/6.10), and each rule is a test with edge values (4.24 / 4.26 m, 2.14 / 2.16 m, 2.99 / 3.01 m …). |
| Sizing | ~ 6.3, 6.5 and 6.8 are large but hold together. 6.5 is the largest (12 tasks); the plan already gives it a fresh-agent review and a re-review of every medium or high fix (note L4). |
| Brief verbatim | ✓ All 12 stories quote `docs/epic-6-brief.md` lines 1–28 character for character (checked by diff). |
| Required sections | ✓ Every story has Fairness rules, Beat the rule, Copies touched, Notes for the merge, Designer decisions with recommended values, a Suggested build round, and art from the picks through `addGeneratedTexture` (6.1 and 6.12 add no art, and say so). |
| Placeholders | ✓ No `{{`, TODO or TBD. |
| Decisions table | ✓ 108 rows; each matches its story's numbered list (codes and recommended values). |
| Code references | ✓ 40 checked by grep, for example `waveSize`/`waveMixOf`/`applyFixedCounts`/`fixedAtFraction`, `devDecayStages.ts`, `applyTestScenario`/`NET150_START_WAVE`, `lightState.ts` ("No blackout flag yet"), `addGeneratedTexture`, `noUnregisteredTextures.test.ts`, the `SYSTEM_ORDER` boss/specialEvents slots, `NET_EVENT_KIND` 41 = `BEAR_TRAP_SNAPPED`, `MONEY_REASONS`, `EXPLOSION_KINDS`, `STREAM_NAMES`, `ZOMBIE_STATE` 0–5, `knockPlayer`/`stepKnock`, `segmentBoxEntryT`, `segmentCircleT`, `circleInFire`, `boxOrFireBlocked`, `SOLID_NAMES`, `DECAY_ACTIONS`/`SPAWN_KINDS`/`MAX_DECAY_VARIANTS` 32, `NIGHT_BY_STAGE` (spillK 0.6 / 0.45), `bruteLookIndex`/`announceSpawn`, `MAX_PATHING_ZOMBIE_RADIUS_M` 0.35, `rebuildCellsPerTick` 2048, `gas_leak_zone` 31–37 × 2–9.5, Crawler reward 3, `readyRequest.ts`, `estimateTick`, `spectateTarget`, `collectStanding`, `rearmPlayer`, `resultHeldOut`. **One was missing:** `flowCostAt` (6.6), now fixed. |

### Cross-story API and number checks

The names checked by grep across all 12 files: `world.lights`, `refreshBlackout` (one writer in every story), `isBlackout`, `darknessAlpha`, `aboveDarkness` / `ABOVE_DARK` (every slot used: boss, eyes, marker, pickup, sparkle, teammate, telegraph; all are defined in 6.3), `decay.json › blackout` keys (`lightPctByWave`, `powerFailureLightPct`, `endlessLightPct`, `halfDarkInBuild`), `world.boss`, `BOSS_STATE`, `maxAliveNow`, `isBossWave(balance, wave, endless)`, `boss.json` blocks, `boss.killed`, `world.special`, `EVENT_KINDS`, `scheduleEndlessEvent`, `eventHoldsWave`, `specialShotTarget`, `rubblePiles`, `isEvacWave`, `run.endless`, `runWaves`, `knockPlayerBy`, `applyBossDamage`, `resetBoss`, `MONEY_REASONS`. Any mismatches are listed below and fixed.

Numbers checked against the proposal and the look picks, all in agreement: darkness 20 / 10 / 5 %; half dark ≈ 52 % light; cap 110 ↔ 150; slam 1.2 s / 4.5 m / 40; charge 1.0 s / 10 m at 12 m/s / 4.8 m lane / 30; throw 1.0 + 0.8 s / 3 m / 35; grace 0.25 m; gaps 2.8 / 2.2 / 1.8 / 1.5 s, enraged 39 / 31 / 25 / 21 ticks; Crawlers every 8 / 6 / 5 / 4 s; endless 600 at wave 15, +6 % HP per wave from 16, Behemoth +25 % each; 2 events in waves 3–8, never 5, never back-to-back (7 allowed pairs); stampede 12 / 18 / 24 / 30 Runners, +30 over the cap; Floodlight 6 m; solo × 0.4.

### 🔴 Critical Violations

None.

### 🟠 Major Issues (all fixed)

- **R1 The build rounds disagree.** 10 stories had a "Suggested build round" different from the table in `docs/epic-6-decisions.md`: 6.5 said round 2 (table: 1); 6.6 said 3 (table: 2); 6.7 and 6.11 said 4 (table: 3); 6.8, 6.9 and 6.10 had labels like "events-1/2"; 6.12 said "last". The parallel partners named in 6.1, 6.4, 6.5, 6.6, 6.9 and 6.10 were wrong too (for example, 6.5 "not in parallel with 6.3").
- **R2 A boss.json key has two names.** 6.5 reads `stun.damageMult`, but 6.6 defines `charge.stunDamageMult`.
- **R3 6.5's decision references point to the wrong decisions** (8 places). The body push is D1, not D5; the entry rule is D2, not D4; the damage sources are D4, not D8; turrets are D6, not D8; the knockback is DD5, not D6; batching is DD9, not D9.
- **R4 Even endless waves contradict each other.** 6.12 D6 allows a power failure on even endless waves, but 6.10's gate ("not already a blackout wave") excluded them, because a half-dark wave has `blackoutPct` > 0. 6.4 assumed even endless waves draw no darkness and used its ring path. 6.12 never set `blackoutPct` for even waves and gave no rule order against `powerFailure`.
- **R5 Endless Brutes don't fit 6.1's fixed list.** 6.1 sized `MAX_FIXED_PER_WAVE` at "8 for endless Brutes" and required 6.12 to "reuse `fixedAtList`". 6.12 places 12–22 Brutes per wave by formula.
- **R6 Two owners for the stampede cap.** 6.5 said 6.8 adds its +30 allowance *inside* `maxAliveNow`; 6.8 adds it beside `maxAliveNow`. Done 6.5's way, normal spawns could fill to 140 or 180 (brief 22).

### 🟡 Minor Concerns

- **R7** `isEvacWave` had 2 arguments in 6.11 and 3 in 6.12. Fixed.
- **R8** 6.6 didn't use 6.2's `rubblePiles` accessor ("if 6.2 names them differently…"). Fixed.
- **R9** 6.6 cited `flowCostAt`, which doesn't exist in the code (the real API is `flowCellAt` + `field.front`). Fixed.
- **R10** 6.6 starts the throw cooldown at the release, but 6.5's framework says "cooldown starts at the hit tick". Clarified as an explicit exception.
- **R11** 6.8's `event.ended` outcomes lacked the `"failed"` that 6.10 emits. Fixed.
- **R12** 6.7's merge note expected `"event"` from 6.9 and `"rescue"` from 6.10. In fact only 6.10 appends `"event"`, and 6.9 pays through `"kill"`. Fixed.
- **R13** 6.5 AC 6 uses `pathing.buildingSlowPct 25`, which was missing from the `boss.json` list in AC 1. Fixed.
- **R14** 6.9's perf section names `fx.maxGasParticles` / `maxFlareParticles`, which were missing from its `events.json` block (brief 10/12). Fixed.
- **R15** 6.4 cited "D12", which doesn't exist (flood puddles are D11). Fixed.
- **R16** 6.3's `lightPctByWave` notation `[…, 9: 10, 10: 5]` was ambiguous about index vs wave. Fixed (index = wave − 1).
- **R17** No story cited FR57, and only 6.5 cited FR84. Fixed (6.9 cites FR57, 6.6 cites FR84).
- **R18** 6.5 applies the 110 cap from the 4 s WARNING. D6 and brief 22 say "while it lives". **Needs the designer.**
- **R19** How dark an even endless wave gets after a power failure. The rule now gives 20 % (`powerFailureLightPct`); 6.12 D6's old wording said "pitch black" (5 %). **Needs the designer.**

### Notes (not fixed: outside the story files, or accepted)

- **L1** GDD and FR63 still say wave 10 is "lit only by fires and floodlights". The proposal and the stories add flashlights and muzzle flashes. Update the GDD/FR wording through `gds-correct-course`.
- **L2** The architecture's "darkness render texture" should read "registered canvas texture" (6.3 DD1).
- **L3** 6.3 ships no live blackout in a normal run; 6.4, 6.10 and 6.12 turn it on. Accepted as an enabler that merges safely.
- **L4** 6.5 is the largest story; keep the planned fresh review and re-review.

## Fixes applied

| # | File | Fix |
| --- | --- | --- |
| R1 | 6.1 | Round 1 partners are now 6.2, 6.3, 6.5 (not 6.8); added the `waveDirector.ts` merge note with 6.5 |
| R1 | 6.4 | Round 2 partners are now 6.6 and 6.8 (6.7 removed) |
| R1 | 6.5 | Round 2 → **Round 1** on the dev switch, in parallel with 6.1, 6.2 and 6.3; 6.8 moved to round 2 |
| R1 | 6.6 | Round 3 → **Round 2**, with 6.4 and 6.8 (merge `zombieAi.ts`/`flowField.ts` one after the other) |
| R1 | 6.7 | Round 4 → **Round 3**, with 6.9, 6.10 and 6.11 (6.11 merges after it) |
| R1 | 6.8 | "events-1" → **Round 2**, after 6.5, with 6.4 and 6.6 |
| R1 | 6.9, 6.10 | "events-2" → **Round 3**; partners 6.7 and 6.11; 6.10 also waits for 6.3 and 6.4 (`refreshBlackout`) |
| R1 | 6.11 | Round 4 → **Round 3**, merging after 6.7 |
| R1 | 6.12 | "Last round" → **Round 4, the last** |
| R2 | 6.5 | `stun.damageMult` → `charge.stunDamageMult` |
| R3 | 6.5 | 8 decision references renumbered (D1, D2, D4, D6, DD2, DD5, DD9) |
| R4 | 6.12 | Even endless waves: `blackoutPct` = `endlessLightPct` 5 with `halfDark`; rule order inside `refreshBlackout` written out (power failure wins over even half-dark); D6 wording "pitch black" → "a full blackout" |
| R4 | 6.10 | Gate "not already a **full** blackout wave"; half-dark even endless waves qualify (AC 1, P3) |
| R4 | 6.4 | The fog ring path is only for "no darkness drawn" (dev cheat); even endless waves paint fog into the darkness texture |
| R5 | 6.1 | `MAX_FIXED_PER_WAVE` sized for the `fixed` lists; 6.12's formula Brutes go through the same `fixedServed` counter |
| R6 | 6.5 | Merge note: `maxAliveNow` stays the base cap; 6.8 adds `+ overCap` for stampede Runners only and pauses normal spawns |
| R7 | 6.11 | `isEvacWave(balance, number, run.endless)` (`endless` defaults to false) |
| R8 | 6.6 | DD5 uses 6.2's `rubblePiles(o, out)` |
| R9 | 6.6 | `flowCostAt(...)` → `bossChase.front[flowCellAt(bossNav, x, y)] === FLOW_UNREACHED` |
| R10 | 6.6 | Throw cooldown from the release is marked as an explicit exception to 6.5's rule |
| R11 | 6.8 | `event.ended` outcomes gain `"failed"` |
| R12 | 6.7 | `MONEY_REASONS` note: 6.10 `"event"`; 6.9 pays through `"kill"` |
| R13 | 6.5 | `pathing.buildingSlowPct 25` added to the `boss.json` list |
| R14 | 6.9 | `events.json › fx { maxGasParticles 48, maxFlareParticles 48 }` added |
| R15 | 6.4 | D12 → D11 |
| R16 | 6.3 | `lightPctByWave` written out: index = wave − 1, `[0,0,0,0,0,0,0,0,10,5]` |
| R17 | 6.9, 6.6 | FR57 and FR84 cited in References |

No recommended value changed meaning. No row of `docs/epic-6-decisions.md` needed a change: its codes, values and build rounds were already right, and the stories now match it. No game code was touched.

## Needs the designer

1. **6.5 (R18):** Does the 110 alive cap start with the 4 s "Something big is coming" warning, or when the Behemoth walks in? The story text applies it from the warning, which thins the horde before the fight. The literal reading of D6 / brief 22 ("while it lives") would start it at the arrival.
2. **6.10 D7 / 6.12 D6 (R19):** How dark an even endless wave gets after a power failure: 20 % moonlit (the power-failure level; the story's current rule) or 5 % pitch (every other endless blackout)?
3. The 108 story decisions in `docs/epic-6-decisions.md` are still waiting for "ok". Once they are confirmed, the epic-AC changes in the table above (6.2, 6.3, 6.4, 6.5, 6.6, 6.8, 6.9, 6.11, 6.12) should be written into `epics.md` through `gds-correct-course`, together with L1 and L2.

## Summary and Recommendations

### Overall Readiness Status

**READY WITH NOTES.** After the fixes, all 12 stories agree on names, numbers, ownership and build rounds; they cover every Epic 6 FR; and each has fairness rules that are also tests. Round 1 (6.1, 6.2, 6.3, 6.5) can start once the designer confirms the decisions. The two open questions don't block round 1: R18 is a one-line `maxAliveNow` condition in 6.5, and R19 matters only in 6.12 (round 4).

### Critical Issues Requiring Immediate Action

None.

### Recommended Next Steps

1. Get the designer's "ok" (or changes) on `docs/epic-6-decisions.md`, plus answers to R18 and R19.
2. Run `gds-correct-course` to bring `epics.md` (the decision-driven AC changes), FR63/GDD (L1) and the architecture's lighting line (L2) in line with the stories.
3. Land 6.3's `render/darkness/aboveDark.ts` first in round 1, as 6.3 and the decisions table say, so that 6.5–6.11 use the real slots.
4. Keep the boss stories' extra review step (fresh agent for 6.5, 6.6 and 6.7; re-review of every medium or high fix).

### Final Note

This assessment found **23 issues**: 0 critical, 6 major (all fixed), 13 minor (11 fixed, 2 for the designer) and 4 notes (outside the story files or accepted). Requirement coverage is complete: 24/24 Epic 6 FRs, and every Epic 6 AC is reflected in its story.

_Assessed 2026-11-24 by the implementation readiness workflow (Game Producer / Scrum Master role), scoped to Epic 6._
