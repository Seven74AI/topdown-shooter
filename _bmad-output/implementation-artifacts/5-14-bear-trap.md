---
baseline_commit: c8d4cd19941e2492805daea15388128d37a0284f
---

# Story 5.14: Bear trap

Status: review

## Story

As a player,
I want a bear trap that grabs a zombie and holds it in place for a few seconds,
so that I can stop a dangerous zombie at a choke point.

(Added by the designer on 2026-11-23 as a second trap type, recognisable at a glance without its name; art drawn in game code: **B-T1**, `docs/epic-5-decisions.md` › "Final art picks, round A", drawing `bearTrap()` / `drawBT1` in `docs/art/epic-5/round-a/code-drawings.html` ~line 853.)

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`) is this story's checklist; every line applies. Quoted in full (paste it into the builder and the reviewer prompt too):
>
> ```
> EPIC 5 BRIEF (from the Epic 4 retro; reviewers: check each line)
> 1. Own worktree + assigned ports only. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current work branch.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo, NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → mirror → Predictor → devThrottle → snapshotWorld).
> 3. FAIRNESS RULE FIRST: write each mechanic's player-visible rule into the ACs before building (e.g. "standing in a Spitter puddle always hurts at N/s", "a mine never kills its owner's teammates unless friendly fire is on", "a Bloater blast is stopped by cars/bus/buildings").
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (step out on the damage tick, stack traps, place mines on spawns, flamethrower through cover, swap to dodge reloads) and list every attempt and its result.
> 5. Projectiles and areas (grenades, spit, flames, blasts, puddles) respect 4.2 cover: car/bus/buildings stop them, barriers/sandbags only stop bodies; server and the client's cosmetic copy agree; rewound (2.12) hits where applicable.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged.
> 7. Spatial code (traps, mines, Brute charges, knockback, new barricades) gets a builder-written fuzz test: random layouts × decay stages × many ticks; no body inside a box, no stall, zombies reach a player, flow fields rebuild only at build start.
> 8. Randomness only from named seed streams; the card shop uses shop:<slot>:<build>; same seed + input log → same snapshotWorld digest.
> 9. Liveness: every sim/replay/integration test asserts something really happened (kills by the new weapon, ≥ 1 explosion, ≥ 1 trap trigger). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks; no per-tick/per-frame allocation (pool projectiles, puddles, particles); every number in balance JSON, no inline literals.
> 11. Bandwidth: projectiles and effects go out as events (spawn + seed), not per-tick state; report added B/s; total ≤ 30 KB/s (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled, and capped (max live particles/puddles in balance JSON). Run ?stress=150 with the new effects active; report headless FPS before/after with load; the 4.10 phone numbers are the floor, not to be lost.
> 13. Readability: every new zombie and object must be recognisable at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet.
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start, on a late Game scene start; client shows server truth (pending until state agrees).
> 15. Balance: start from the 4.10 earnings decision; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 6-wave sim and assert waves ended.
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added p99 ≤ 2 ms total budget.
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently.
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master.
> ```
>
>
> Most relevant here: 2 (trap state is shared sim; a new schema field on buildings and a new zombie-pool field: list every copy), 3/4 (fairness rules F1–F10 below and the Beat-the-rule list), 6 (the hold is per body, on that zombie's own clock), 7 (a held zombie is a body that doesn't move: fuzz for stalls at chokes), 9 (liveness: ≥ 1 catch, ≥ 1 release, ≥ 1 re-arm, ≥ 1 Brute caught), 10 (hold/re-arm timers in ticks; numbers in balance JSON), 11 (state change on snap/release/re-arm only, one local event per snap), 12 (two static frames: open + closed), 13 (readability: open vs closed at a glance), 14 (closed/open from state; pending re-arm under lag).

## Acceptance Criteria

### Gameplay (from `epics.md` › Story 5.14; builds on 5.9's floor buildings)

1. **A new floor building `bear_trap`** (`buildings.json › types`, appended after `med_station`: the type index is on the wire): **price 50, 1 × 1 m footprint, 100 HP, `solid: false`, `stopsBullets: false`**, in the shop/build bar (`forSale`/`inShop` true), counts toward the 6-building cap, 2 m spawn clearance (5.9 DD8). Its stats live in a new `bearTrap` block (`plateRadiusM 0.35, holdS 3, snapDamage 5, wearPerCatch 25, rearmS 1`) — every number in JSON (D1–D6).
2. **Snap.** During a wave, the tick an alive zombie's **centre** comes within `plateRadiusM` of an **armed** trap's centre, the jaws close: that zombie takes `snapDamage` (5) and is **held** for `holdS` (3 s; Brutes `holdS × heavyHoldPct` = 1.5 s, D3). The trap is now *holding*. One zombie per catch.
3. **Held.** A held zombie does not move: no walking, no crowd push, no hard-overlap shove, no knockback (Shotgun, Fire Axe, Bloater push). It is still a body (others crowd round it; players are never blocked by zombie bodies in this game: it simply doesn't yield, corrected 2026-11-23, accepted) and **still attacks**: it bites/swings a player in reach, a Spitter still spits, a Bloater touching a player still swells (D2 "caught by the leg, not stunned").
4. **Release.** After the hold (or when the held zombie dies), the zombie walks on and the trap is **sprung**: closed, harmless, drawn closed. It costs the trap `wearPerCatch` HP (25 → 4 catches); at 0 HP it is removed like a worn spike trap (`building.destroyed`).
5. **Re-arm (D4).** A sprung trap re-arms when **any standing player** keeps their body over its plate circle for `rearmS` (1 s, their own clock, reset on leaving) — in a wave or a build phase, free. Every sprung trap also re-arms by itself at each build start. Players never trigger, get held by, or get hurt by a bear trap.
6. **Credit.** A snap kill (a 5-HP Runner/Walker at low HP) is the trap's and its owner's (`zombie.killed` with `buildingId`, 3.6 M1 rule), like spike-trap kills.

### Fairness rules (brief line 3; player-visible, each one tested)

7. **F1 Floor is floor.** A bear trap never blocks a body, a bullet, spit or a flow field, zombies never target or path round it (5.9 F1: `solid: false` everywhere, `wallVersion` untouched by place/snap/release/re-arm/wear-out).
8. **F2 The plate is drawn.** "Steps on the plate" = the zombie's centre is within 0.35 m of the trap's centre (strict `<`). In a build phase every player sees the plate ring at exactly that radius (shared helper, the `fireRing.test.ts` pattern; 5.16 AC 6 already lists "bear trap plate").
9. **F3 One trap, one zombie, same tick.** An armed trap catches on the first tick a centre is on its plate (no fuse), never two zombies at once; if two arrive the same tick, the lowest pool id (deterministic, D9). A holding or sprung trap catches nothing. Two adjacent traps catch two zombies (one each).
10. **F4 The hold is per body and exact.** `holdS` counted in ticks on the held zombie's own clock (`ticksFor(holdS)`, a Brute `ticksFor(holdS × heavyHoldPct / 100)`), unaffected by being shot, burnt, slowed, or the wave ending/build starting (a build start releases every held zombie and re-arms every trap — no zombie is alive then anyway).
11. **F5 Heavy rule (D3, designer picks before the build).** Recommended: a **Brute is held for half the time (1.5 s)** and the trap wears normally. Bloaters, Spitters, Runners, Crawlers, Walkers: full 3 s. (Alternative B: a Brute breaks the trap on the snap — trap removed, Brute not held, snap damage still dealt.)
12. **F6 Held means held, not harmless.** A held zombie keeps biting/spitting/swelling at what's in reach; walking up to it to shoot point-blank is a risk, never a free kill.
13. **F7 Players are never caught.** Walking over an armed trap does nothing; standing on a sprung one re-arms it after 1 s (only a standing player; downed/out players don't). A player can't re-arm a trap while a zombie is held in it.
14. **F8 No chains or stacking with spike traps.** Bear traps can't overlap other buildings (`footprintBlocked`); a zombie held next to a spike trap takes the spike trap's normal per-body damage only if its body is on the spike trap.
15. **F9 Wear is visible and repairable.** HP bar shows wear (100 → 75 → 50 → 25); fire (4.8) wears it too; mine and Bloater blasts don't (floor, as the spike trap: they only damage walls; corrected 2026-11-23, accepted); repair as any building (3.7: 50 % of 50 = 25 to full).
16. **F10 Hidden tab / late join see the truth.** Open/closed comes from schema state, never only from an event; a tab that slept through a snap shows the closed trap.

### Netcode, perf, readability (brief 11–14)

17. **State, not spam.** One new building schema field `trap: uint8` (0 armed, 1 holding, 2 sprung; written only on change; 0 for every other type) → `syncBuildings` / `BuildingStateView` / `mirrorBuildings`. One new local event `bear_trap.snapped { buildingId, x, y }` (clang sfx + jaw-snap FX). No per-tick bytes. Re-arm progress ring for the local player is drawn from the predicted position (cosmetic); the trap shows armed only when the state says so (pending).
18. **Looks.** Open = B-T1 (code-drawn, ported from `bearTrap()` into `render/city/buildingArt.ts`, one function, both looks); closed = the same trap with jaws shut (two half-rings meeting, teeth interlocked; builder draws, designer reviews the screenshot). Two frames in `atlas_buildings` (`building_bear_trap_open`, `building_bear_trap_closed`), floor depth (5.9), flat shadow; no per-tick redraw (redraw on `version` / state change only).
19. **Readability.** Row in `docs/playtests/milestone-1/readability-sheet.md`: "what is this? (bear trap) does it stop bullets? (no) can you walk on it? (yes, it never catches players) open or closed?".
20. **Build-bar icon:** falls back to world art (open frame) per the 5.16 icon rule (an I1 icon is a later follow-up).

## Beat the rule (reviewer: try each, record the result)

| # | Attempt | Expected |
| --- | --- | --- |
| B1 | Line a 1 m car gap with traps, hold zombies forever | Each holds 3 s, then sprung; re-arm needs a player standing on it 1 s in the gap (risk) |
| B2 | Stand on a sprung trap next to a held zombie to re-arm instantly | Refused while holding (F7); after release, 1 s on the plate |
| B3 | Step on/off the plate to re-arm faster | Clock resets on leaving: exactly 1 s continuous (F7) |
| B4 | Two zombies onto one trap the same tick | One caught (lowest id); the other walks on (F3) |
| B5 | Shotgun/axe knockback a held zombie out of the jaws | Stays put (AC 3) |
| B6 | Catch a Brute, then shoot it point blank | Held 1.5 s; it still swings in reach (F5/F6) |
| B7 | Catch a Bloater next to the team | It still swells/bursts if it touches a player; if nobody's close it just stands (F6) |
| B8 | Trap on a spawn | 2 m clearance refused; at exactly 2 m allowed (fresh spawns may step in: allowed) |
| B9 | Players trigger it / get held / take damage | Never (F7) |
| B10 | Wall a street with a held Brute (wide body) | Others crowd round for ≤ 1.5 s; no stall (fuzz) |
| B11 | Hidden tab across a snap and a build start; `?lag=150&jitter=20` re-arm | Correct open/closed from state; re-arm shows pending until state (F10) |
| B12 | Repair a worn trap; repair a sprung trap to "re-arm" it | Repair restores HP only; re-arm stays a stand-on action |
| B13 | Catch → held zombie dies (burnt) mid-hold | Trap sprung at once, worn 25 |
| B14 | Crafted `building.place` with `bear_trap` in the last build tick / on a spike trap | Normal placement rules (`footprintBlocked`) |

## Tasks / Subtasks

- [x] **T1 Balance (AC 1, D1–D6)** — `config/balanceSchema.ts`: `bearTrapSchema = z.object({ plateRadiusM, holdS, snapDamage, wearPerCatch (int), rearmS }).strict()` with 4.8's whole-tick refines; `buildingTypeSchema.bearTrap` optional; `crossCheckBuildingTypes`: `bearTrap` exclusive with `turret/trap/mine/light/heal`, floor only (`solid: false`), no `upgradesTo`, `plateRadiusM ≤ half footprint`. `zombies.json › brute.trapHoldPct: 50` (`zombieTypeSchema.trapHoldPct` int 1–100, default 100). `buildings.json` appends `bear_trap`. Tests in `config/balance.test.ts`.
- [x] **T2 Sim (AC 2–6, F1–F9)** — new `buildings/bearTrap.ts › updateBearTraps(world)` in `buildingSystem.ts` after `updateTraps` (before `updateMines`), waves only: per armed trap, the lowest-id alive zombie with centre in the plate → `snap` (damage via the spike trap's direct `hp -=` + `killZombie` credit path, `trapState = HOLDING`, `Building.heldZombie = id`, zombie `holdTicks = ticksFor(...)`, emit `bear_trap.snapped`). Per holding trap: release when the held zombie died/freed (check `generation`) or `holdTicks` hit 0 → `SPRUNG`, `damageBuilding(wearPerCatch)`. Per sprung trap: per-trap re-arm clock + player slot (any standing player whose body overlaps the plate circle; continuous). Build start (`resetBurnClocks` site): all traps `ARMED`, clocks 0, zombie `holdTicks` 0.
  - [x] `Building` gets `trapState`, `heldZombie`, `heldGen`, `rearmTicks`, `rearmSlot` (0 for other types); `BuildingState.version` +1 on every trap-state change (renderers + `syncBuildings`); `wallVersion` never.
  - [x] `zombies/zombiePool.ts`: `holdTicks: Uint16Array` (0 on spawn); `zombieAi.ts`: pass 1 a held zombie gets `vx = vy = 0` like the windup branch (but still runs attacks in pass 4); pass 2 skip; pass 3 `resolveOverlaps`: a held zombie is immovable (the other body takes the full push); pass 4 players/buildings push-out: unchanged (it's on floor). `holdTicks--` in pass 4.
  - [x] Knockback: `combat/damage.ts › applyKnockback` (+ melee/explosion/Bloater push) skips `holdTicks > 0`.
  - [x] Tests `buildings/bearTrap.test.ts`: snap at the plate edge (0.349 yes / 0.35 no), 5 damage + kill credit, held 3 s exactly = 60 ticks (and 30 for a Brute), no movement while held under a pushing crowd + shotgun knockback, still bites a player in reach, Spitter still spits, Bloater swells on touch, release → sprung + 25 wear, 4 catches → removed, one zombie per trap, lowest id on ties, two adjacent traps catch two, re-arm 1 s continuous (on/off resets), downed player can't, no re-arm while holding, build start re-arms, players never caught, build phase never catches, fire wears it, mine blast doesn't, `wallVersion` constant.
- [x] **T3 Network (AC 17, F10)** — `RunState.ts buildingFields.trap: t.uint8()`, `syncState.ts › syncBuildings` (write on change), `stateView` `BuildingStateView.trap` + key lists, `net/mirrorBuildings.ts` (copy `trapState`), `snapshotWorld` (new fields), `net/netEvents.ts` next free kind `BEAR_TRAP_SNAPPED` (+ round trip), `eventInterest.ts` local. Tests: `syncState.test.ts`, `NetSimHost.buildings.test.ts`, bandwidth (`buildingBandwidth.test.ts` + 6 bear traps: B/s reported).
- [x] **T4 Client (AC 17–20)** — `buildingArt.ts › drawBearTrap(c, closed)` (port B-T1), `buildingsAtlas.ts` two frames, `BuildingView` frame by `trapState`, plate ring in build phase + placement preview, local re-arm progress ring, `FxView` snap FX + `placeholderSfx` `building_bear_trap_snap`; readability sheet row.
- [x] **T5 Fuzz, sims, perf, browser (brief 7, 9, 15, 16, 18)** — extend `buildings/floor.fuzz.test.ts` with bear traps (incl. in 1 m gaps and next to spike traps): no body in a wall, no stall, zombies reach players, nav only on wall changes; liveness ≥ 1 catch/release/re-arm/Brute catch/wear-out. `fiveWaveSim` test-local list with bear traps (waves ended). `tickCostDowntown` with 24 bear traps (PERF_ASSERT). `?stressbuild=bear` (12 traps) headless FPS before/after. Playwright solo: place, catch, closed look, re-arm by standing; screenshots into `docs/art/5-14/`.
- [x] **T6 Mutations (brief 9)** — "catch by body overlap instead of centre", "hold counted on a shared clock", "held zombie pushed by crowd", "knockback moves a held zombie", "held zombie can't attack", "two zombies per trap", "players trigger", "re-arm while holding", "re-arm clock not reset on leaving", "Brute held full time", "no wear per catch", "wallVersion bumped", "build phase catches" — each must fail a listed test.
- [x] **T7 Gates** — typecheck, lint, test, build on the branch merged with master (after 5.10 lands); Dev Agent Record; Notes for the merge.

## Dev Notes

### Designer decisions (confirmed 2026-11-23: designer "Okay with everything" — every recommended value D1–D12 accepted as written)

| # | Question | Recommended | Alternatives |
| --- | --- | --- | --- |
| D1 | Size and plate | **1 × 1 m** footprint (art ~0.8 m), plate = zombie's centre within **0.35 m** of the trap's centre, ring shown in build phase | 0.5 × 0.5 m (one cell, hard to tap) |
| D2 | What "held" means | **Can't move or be pushed, still attacks/spits/swells at what's in reach** | Fully stunned (no attacks) — stronger, less risky |
| D3 | Brute (heavy) | **Held half as long (1.5 s)**, trap wears normally | B: Brute breaks the trap on the snap (removed, not held) |
| D4 | Re-arm | **Any player stands on the sprung trap for 1 s (free, any phase); all traps re-arm at build start** | A Re-arm button in build phase only (e.g. $10); owner only |
| D5 | Hold time and snap damage | **3 s, 5 damage** on the snap | 4 s / 0 damage; small bleed while held |
| D6 | Price, HP, wear | **$50, 100 HP, 25 HP per catch → 4 catches**, then it breaks; repairable (25) | $60 / 6 catches |
| D7 | Players | **Never caught or hurt**; walk over freely | Players caught too (friendly-fire style) — not recommended |
| D8 | Bloater | **Held the normal 3 s**; if it touches a player while held it still swells and bursts | Bloater counts as heavy (1.5 s) |
| D9 | Two zombies at once | **Catches one** (the lowest id, deterministic) | — |
| D10 | Build phase | **Never catches in a build phase** (like mines) | — |
| D11 | Closed look | **Same B-T1 trap, jaws shut**, drawn by the builder; designer reviews the screenshot | Designer wants a mockup first |
| D12 | Fire / blasts | **Fire wears it; mine and Bloater blasts don't** (as the spike trap; corrected 2026-11-23 from "fire and Bloater blasts", accepted) | Immune to all |

### Current state (read before changing)

- `buildings/trap.ts` (5.9 spike trap): the model — per-alive-zombie loop over a module-level trap list, direct `hp -=` + `killZombie(world, id, owner, type, trapId)` credit, `damageBuilding` wear, `trapCounters` for liveness. `buildings/mine.ts`: trigger on the zombies' NEW positions at the end of `updateZombies` (5.9 review L1) — bear traps need the same second pass so "the tick a centre reaches the plate" is exact.
- `buildings/buildingSystem.ts`: slot order turrets → traps → mines → med stations → light state.
- `buildings/buildings.ts`: `Building` (mutable `type/maxHp`, `solid`), `version` vs `wallVersion`, `damageBuilding`, `footprintBlocked`, `placementError`.
- `zombies/zombieAi.ts`: pass 1 desired velocity (`slowPct`; windup/SWELL branch sets v = 0 and `continue`s — the held branch is the same), pass 2 integrate, pass 3 `resolveOverlaps` (must treat held zombies as immovable), pass 4 attacks/swell/push-outs.
- `zombies/zombiePool.ts`: typed arrays per slot; reset on spawn; `generation` to detect a reused slot.
- `decay/fire.ts › resetBurnClocks` (build start): add `holdTicks` + trap re-arm.
- `combat/damage.ts › applyKnockback`, `combat/explosion.ts`, `zombies/bloater.ts` (blast push, building damage).
- Server `rooms/schema/RunState.ts › buildingFields` (`type, owner, gx, gy, rot, hp`), `syncState.ts › syncBuildings`; client `net/mirrorBuildings.ts`, `render/BuildingView.ts`, `render/city/buildingArt.ts`, `buildingsAtlas.ts`, `render/FxView.ts`.
- 5.10 (on `story-5-10`, in review) adds `stopsBullets`, `inShop`, `light`, `heal` and the med station/floodlight types in the same files; this story is branched from it.

### Copies touched (brief 2)

World (`Building.trapState/heldZombie/rearm*`, zombie `holdTicks`) → schema `BuildingState.trap` → `syncBuildings` → `BuildingStateView` + key lists → `mirrorBuildings` (+ Predictor World: floor, so no movement change) → devThrottle (no new keys) → `snapshotWorld` (all new fields).

### Must be preserved

5.9's spike trap / mine / upgrade rules and fuzz, 5.10's lights/heal, 5.7 Brute windup and gap reach, 5.8 Bloater swell, 3.5 reachability, 0 corrections walking over floor buildings, bandwidth budget.

### Notes for the merge

| Shared file | 5.14 change | Hint |
| --- | --- | --- |
| `buildings.json`, `balanceSchema.ts`, `balance.ts` | `bear_trap` appended, `bearTrap` block, cross-checks | append after 5.10's types (wire index) |
| `zombies.json`, zombie schema | `brute.trapHoldPct` | 5.7 fields nearby |
| `buildings/buildings.ts`, `buildingSystem.ts` | trap state fields, `updateBearTraps` | after `updateTraps` |
| `zombies/zombieAi.ts`, `zombiePool.ts`, `combat/damage.ts` | held branch, immovable in overlaps, no knockback | 5.2–5.8 edits nearby |
| `core/worldSnapshot.ts`, `net/netEvents.ts`, `eventInterest.ts` | fields, one event kind | next free kind number at merge |
| server `RunState.ts`, `syncState.ts`; client `stateView`, `mirrorBuildings.ts` | `trap` field | 5.20/5.22/5.24 (BX) touch building server code after this |
| client `BuildingView.ts`, `buildingArt.ts`, `buildingsAtlas.ts`, `FxView.ts` | two frames, plate ring, snap FX | 5.16 icons follow-up |

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 5.14; › Story 5.16 AC 6 (range rings incl. "bear trap plate"); › BX note (5.20/5.22/5.24 after 5.14).
- `docs/epic-5-decisions.md` › Art feedback round 2, Final art picks round A (B-T1), Build-bar icons.
- `docs/art/epic-5/round-a/code-drawings.html` › `bearTrap()`, `drawBT1`.
- `_bmad-output/implementation-artifacts/5-9-metal-barricade-spike-trap-and-mine.md` (floor buildings, trap/mine, review L1–L4, mutations).

## Dev Agent Record

### Agent Model Used

Claude Code (builder session for Story 5.14, orchestrated by the main session).

### Debug Log References

- Gate (typecheck, lint, test, build) on `story-5-14` (branched from `story-5-10` at c8d4cd1): **265 files passed (1 skipped), 2,205 tests passed (3 skipped)**, build green; load 2.07 → 4.26 during the run (other builders). An earlier gate run caught 4 list-expectation tests (shop list, build bar ×2, url options) that needed the new type / switch: fixed, then this one run green.
- `[bear trap fuzz] 16 layouts: 56 waves started, 40 ended; 229 catches (34 Brutes), 224 releases, 109 stand-on re-arms, 39 worn out, 64 snap kills, 6722 held body-ticks` (~17 s).
- `[tick cost 5.14] Downtown p99 0.824 ms (mean 0.578); + 24 bear traps p99 1.216 ms (mean 0.665); added p99 0.392 ms, mean 0.087 ms; 189 catches; load 0.55` (PERF_ASSERT=1, traps re-armed every tick: worst case).
- `[bear trap bandwidth] 24 traps: 216 catches, 216 releases in 30 s; patches 100 → 179 B/s; per client added 101 / 106 / 101 / 106 B/s (estimate 300 B/s)`; schema: one snap = a 1-field `trap` patch < 12 B, 0 B per tick while holding.
- `[wave sim 5.14] runWaves 6, list smg,bear_trap×3,wood_barricade,bear_trap: 54 buildings placed, 43 catches, 42 releases, 5 snap kills` (4/4 runs ended: 2p/4p seeds 1–2, all reached wave 6; no Brute walked into a bot's trap in these runs — the fuzz covers Brute catches).
- Headless FPS (`?stress=150`, 844 × 390 DPR 2, SwiftShader, load 0.5 → 4): bare 10.4 / 11.0 avg (render 0.84 / 0.77 ms); `&stressbuild=bear` (24 bear traps) 9.6 / 10.0 / 10.2 avg (render 1.93 / 1.78 / 1.82 ms); 5.9's `&stressbuild=traps` (24 spike traps + mines) 10.0 avg (render 1.85 ms) in the same session: the same cost class as 5.9's floor buildings (static sprites + one ring Graphics).

### Completion Notes List

- Story context created 2026-11-23 from the real code on `story-5-10`; designer accepted D1–D12 (recommended values) the same day.
- **Balance (T1):** `bearTrapSchema {plateRadiusM, holdS, snapDamage (int), wearPerCatch (int), rearmS}` (whole ticks), `buildingTypeSchema.bearTrap`, `zombieTypeSchema.trapHoldPct` (int 1–100, default 100; Brute 50). Cross-checks: bearTrap excludes turret/trap/mine/light/heal, floor only, the plate fits in the footprint. `buildings.json` appends `bear_trap` (50, 1 × 1, 100 HP, `solid: false`, plate 0.35, hold 3 s, snap 5, 25 per catch, re-arm 1 s) after 5.10's med station.
- **Sim (T2, `buildings/bearTrap.ts`):** `updateBearTraps` in the buildings slot after the spike traps (hold/release, stand-on re-arm, catch of bodies already on a plate) and `catchOnBearTraps` at the end of `updateZombies` (the 5.9 review L1 rule: a centre reaching the plate is caught that tick). Catch = lowest-id alive, not-held zombie whose centre is strictly within the plate; snap damage (a kill credits the owner + trap id; then sprung and worn at once); `zombies.holdTicks` = `ticksFor(holdS × trapHoldPct / 100)` counted down in pass 4 of `updateZombies` (exactly 60 movement ticks, a Brute 30; the hold starts at the catch, never on a shared pulse). Held: pass 1 zero velocity after `spitterStep` (a Spitter still spits), pass 3 treats it as immovable like a swelling Bloater (two pinned bodies: neither moves), pass 4 keeps it in contact with a player without moving it and skips the building push-out (it still bites / swings / swells), `knockbackShare` = 0 (no knockback, no hit pushback). Release when the hold is used up or the held zombie is dead / its slot reused (generation) → SPRUNG, `damageBuilding(25)` (removed at 0 with `building.destroyed`; `wallVersion` never moves). Re-arm: one standing ("alive") player's body overlapping the plate circle for 20 ticks without a break (another player starts their own count; a downed player or a team wipe never re-arms; never while holding); `resetBearTraps` (called from `resetBurnClocks`, the build-start hook) re-arms every trap and clears every hold. Every state change bumps `buildings.version`. No allocation per tick.
- **Network (T3):** schema `BuildingState.trap` (uint8, on change), `BuildingStateView.trap` + `BUILDING_STATE_FIELDS` (devThrottle copies it), `syncBuildings` writes it on a version change, `mirrorBuildings` copies it (version +1 so renderers redraw; a late join / slept tab sees the right jaws, F10). Event `bear_trap.snapped {buildingId, x, y}` = net kind **39** (next free on this branch), local in `EventInterest`. `snapshotWorld`: `holdTicks` per zombie (building copies carry the new fields).
- **Client (T4):** `drawBearTrap(g, w, h, closed)` ports B-T1 (jaws, 14 teeth, plate with rust and embossed rings, leaf springs, hinge rivets, chain to a stake); closed = both jaws stood up into one bar with meshed teeth. Two atlas frames `building_beartrap_open/closed`; `buildingFrame(type, trapState)` picks the closed one for HOLDING/SPRUNG (BuildingView), the build bar keeps the open one (AC 20). `MineView` draws the plate ring at the sim radius in every build phase, a yellow ring on sprung traps during waves, and my re-arm arc (cosmetic, from my drawn position; the trap shows armed only from state). `FxView` snap ring + `building_bear_trap_snap` sfx (rate-limited). No box shadow (round art: the first screenshots showed a dark square). Readability sheet #39/#40 + key.
- **Dev switch:** `?stress=150&stressbuild=bear` lays 24 bear traps round the survivor (release-safe, Walkers made unkillable like the other stress builds).
- **Tests:** `bearTrap.test.ts` (21: numbers, plate edge 0.349/0.35, catch on the walking tick, one per trap + lowest id, two adjacent traps, holding/sprung catch nothing, players and build phase never catch, snap kill credit + sprung + worn, exact hold walker/Bloater/Brute, hold independent of the world tick and of shots, never moved under crowd + overlap + player body + knockback + pushback, still bites, Spitter spits, Bloater swells, death releases, 4 catches wear out with wallVersion constant, re-arm 1 s continuous with a break, plate edge / downed player / build phase, no re-arm while holding, build start re-arms, fire wears it / mine and Bloater blasts don't, inactive outside build/wave); `bearTrap.fuzz.test.ts`; `bearTrapArt.test.ts` (5: footprint, open ring with 14 teeth vs closed bar, frames, the drawn plate radius catches like the sim, re-arm fill); `balance.test.ts` (bear trap block refusals); `syncState.test.ts` (trap patch on change only); `NetSimHost.buildings.test.ts` (mirror); `buildingBandwidth.test.ts`; `tickCostDowntown.test.ts`; `fiveWaveSim.test.ts` (6 waves); `tools/netsim/barricade.test.ts` (walking over two bear traps at 150 ms RTT ± 20: 0 snaps, 0 corrections); `netEvents.test.ts` round trip.
- **Mutations (brief 9), each applied once and reverted by a script — all 21 caught:** M1 catch by body overlap instead of centre; M2 hold on a shared world-tick clock (survived at first: the catch landed on tick 0 → new test catching at ticks 7 and 13); M3 held zombie pushed by the crowd; M4 knockback moves a held zombie; M5 held zombie can't attack (bite + spit tests); M6 a holding trap catches again; M7 build phase catches; M8 re-arm while holding; M9 re-arm clock never resets (the first version of this mutation was equivalent: replaced); M10 Brute held the full time; M11 no wear per catch; M12 trap state bumps wallVersion; M13 build start doesn't re-arm; M14 snap kill leaves the trap holding; M15 client ignores the closed frame; M16 mirror ignores the jaws; M17 server sync ignores a jaw change; M18 snap does no damage; M19 a downed player re-arms (survived at first: a lone downed player wipes the team, which stops re-arms anyway → test adds a standing teammate); fuzz-only F1 held zombie pushed by the crowd, F2 a holding trap catches again.
- **Beat the rule (builder's own attempts, story table B1–B14):** B1 a row of traps in a choke: each holds 3 s then is sprung; the fuzz's bot p0 walks into the choke to re-arm (109 re-arms, 0 bodies in walls, 0 stalls). B2 re-arm next to a held zombie: refused while holding (test). B3 on/off the plate: the count restarts (test, M9). B4 two zombies at once: lowest id caught, the other walks on (test). B5 knockback a held zombie out: it stays (test, M4). B6 Brute held 1.5 s, still swings (fuzz: 34 Brute catches; hold bound checked every tick). B7 held Bloater touching a player swells (test). B8 spawn clearance: normal placement rules (`placementError`, unchanged). B9 players never caught / hurt (test; netsim 0 corrections). B10 held wide Brute in a gap: no stall in 16 layouts. B11 slept tab / late join: closed/open from schema (mirror test); `?lag` browser run not done (see Not verified). B12 repair restores HP only (repair code unchanged; a sprung trap stays sprung). B13 held zombie dies: sprung + worn at once (test). B14 placement on a spike trap: `footprintBlocked` (unchanged).
- **Decision corrections found while building (main session: please tell the designer):** (1) D12 said "fire and Bloater blasts wear it (as the spike trap)": in the real code Bloater blasts only damage WALL buildings, so spike traps are not worn by them either. Kept "as the spike trap": **fire wears a bear trap; mine and Bloater blasts don't** (tested). (2) AC 3 said players "can't walk through" a held zombie: players are never blocked by zombie bodies in this game (zombies yield to players); a held zombie simply doesn't yield, so bodies overlap while it keeps biting. (3) Event kind 39 may clash with 5.12/5.13 at merge: renumber the later one.
- **Pre-existing test weakness spotted (not changed):** `buildings/floor.fuzz.test.ts` (5.9) passes ONE input object to every bot's `setInput`, so all bots get the last bot's aim; its nav check also flags the legitimate one-tick catch-up after a wall breaks late in a tick (it passes today by luck of its seeds). The new bear-trap fuzz uses one input per bot and the corrected nav check.

### Not verified

- No phone FPS (headless SwiftShader only; numbers above, same cost class as 5.9's floor buildings). The stress scene pauses waves, so the FPS run measured 24 static traps, not snapping ones (the tick-cost test covers the snapping sim).
- No online browser run under `?lag=150&jitter=20` (the dev proxy targets port 2567, shared with other builders); covered by the netsim walk-over test, the mirror test and the schema test. Hidden tab across a build start and a late Game-scene start: not exercised in a browser (state-driven by design).
- The closed look (D11) is the builder's drawing: designer review pending (`docs/art/5-14/5-14-bear-trap-open-closed.png`). Bots don't buy bear traps (`bots.json` untouched).

### Notes for the merge

| Shared file | What 5.14 changes | Merge hint |
| --- | --- | --- |
| `config/balance/buildings.json` | appends `bear_trap` after `med_station` | type index is on the wire: keep balance order = merge order |
| `config/balance/zombies.json`, `balanceSchema.ts` | `brute.trapHoldPct`; `bearTrapSchema`, `buildingTypeSchema.bearTrap`, `zombieTypeSchema.trapHoldPct`, `BearTrapStats` | 5.7 fields nearby |
| `config/balance.ts` | `buildingKind` + exclusivity include `bearTrap`; plate-fits check | 5.10 touched the same function |
| `buildings/buildings.ts` | `Building.trapState/heldZombie/heldGen/rearmTicks/rearmPlayer`, `BEAR_TRAP_STATE`, `BuildingSpec.trapState?` | BX stories (5.20/5.22/5.24) touch placement next |
| `buildings/buildingSystem.ts` | `updateBearTraps` after `updateTraps` | keep order |
| `zombies/zombieAi.ts`, `zombiePool.ts`, `combat/damage.ts` | held branch (pass 1/3/4), `catchOnBearTraps` at the end, `holdTicks`, `knockbackShare` 0 while held | 5.2–5.8 code nearby |
| `decay/fire.ts` | `resetBurnClocks` calls `resetBearTraps` | |
| `core/simEvents.ts`, `net/netEvents.ts` | `bear_trap.snapped`, kind **39** | renumber the later-merged story if taken (never reuse) |
| `net/stateView.ts`, server `RunState.ts`, `syncState.ts`, `eventInterest.ts` | `trap` field; local snap event | any story adding building fields |
| `core/worldSnapshot.ts`, `index.ts` | `holdTicks`; exports | union |
| client `mirrorBuildings.ts`, `BuildingView.ts`, `MineView.ts`, `mineLook.ts`, `buildingArt.ts`, `buildingsAtlas.ts`, `FxView.ts`, `placeholderSfx.ts`, `GameScene.ts`, `urlOptions.ts`, `stressScenario.ts` | closed frame by state, plate/sprung/re-arm rings, snap FX/sfx, `?stressbuild=bear` | 5.16 icons follow-up (bear trap I1 icon later) |
| tests touched for the new type/field: `shop.test.ts`, `buildBar.test.ts`, `buildings.test.ts`, `balance.test.ts` (5.10's append check now expects `bear_trap` last), client fake-building fixtures, `tools/netsim/brute.test.ts` | | |

### File List

- _bmad-output/implementation-artifacts/5-14-bear-trap.md
- _bmad-output/implementation-artifacts/sprint-status.yaml
- apps/client/src/audio/placeholderSfx.ts
- apps/client/src/debug/stressScenario.ts
- apps/client/src/debug/urlOptions.test.ts
- apps/client/src/debug/urlOptions.ts
- apps/client/src/net/mirrorBuildings.ts
- apps/client/src/net/prediction.test.ts
- apps/client/src/render/BuildingView.ts
- apps/client/src/render/FxView.ts
- apps/client/src/render/MineView.ts
- apps/client/src/render/city/bearTrapArt.test.ts
- apps/client/src/render/city/buildingArt.ts
- apps/client/src/render/city/buildingsAtlas.ts
- apps/client/src/render/mineLook.ts
- apps/client/src/scenes/GameScene.ts
- apps/client/src/scenes/buildBar.test.ts
- apps/client/src/sim/NetSimHost.buildings.test.ts
- apps/client/src/sim/NetSimHost.lights.test.ts
- apps/client/src/sim/NetSimHost.repair.test.ts
- apps/client/src/sim/NetSimHost.turret.test.ts
- apps/server/src/net/eventInterest.ts
- apps/server/src/rooms/schema/RunState.ts
- apps/server/src/rooms/schema/syncState.test.ts
- apps/server/src/rooms/schema/syncState.ts
- apps/server/src/run/buildingBandwidth.test.ts
- apps/server/src/run/tickCostDowntown.test.ts
- docs/art/5-14/5-14-bear-trap-open-closed.png
- docs/art/5-14/5-14-build-phase.png
- docs/art/5-14/5-14-caught.png
- docs/art/5-14/5-14-rearm.png
- docs/art/5-14/README.md
- docs/epic-5-decisions.md
- docs/playtests/milestone-1/objects/40_bear_trap_open.png
- docs/playtests/milestone-1/objects/41_bear_trap_closed.png
- docs/playtests/milestone-1/readability-key.md
- docs/playtests/milestone-1/readability-sheet.md
- packages/shared/src/buildings/bearTrap.fuzz.test.ts
- packages/shared/src/buildings/bearTrap.test.ts
- packages/shared/src/buildings/bearTrap.ts
- packages/shared/src/buildings/buildingSystem.ts
- packages/shared/src/buildings/buildings.test.ts
- packages/shared/src/buildings/buildings.ts
- packages/shared/src/combat/damage.ts
- packages/shared/src/config/balance.test.ts
- packages/shared/src/config/balance.ts
- packages/shared/src/config/balance/buildings.json
- packages/shared/src/config/balance/zombies.json
- packages/shared/src/config/balanceSchema.ts
- packages/shared/src/core/simEvents.ts
- packages/shared/src/core/worldSnapshot.ts
- packages/shared/src/decay/fire.ts
- packages/shared/src/economy/fiveWaveSim.test.ts
- packages/shared/src/economy/shop.test.ts
- packages/shared/src/index.ts
- packages/shared/src/net/netEvents.test.ts
- packages/shared/src/net/netEvents.ts
- packages/shared/src/net/stateView.ts
- packages/shared/src/zombies/zombieAi.ts
- packages/shared/src/zombies/zombiePool.ts
- tools/netsim/barricade.test.ts
- tools/netsim/brute.test.ts

### Change Log

- 2026-11-23: Story file created; designer accepted D1–D12 as recommended.
- 2026-11-23: Story 5.14 built (bear trap: balance, shared sim, schema `trap` field + snap event, B-T1 art open/closed, plate/re-arm rings, snap FX/sfx, `?stressbuild=bear`, tests incl. fuzz, bandwidth, tick cost, 6-wave sim, netsim, 21 mutations, screenshots, readability rows). Status → review.
- 2026-11-23: Merged origin/master (3dab0ac: 5.10 on master, 5.17 "why it's red", 5.26 build-bar icons, 5.27 story). One conflict (`GameScene.ts`: 5.17's `blockReasonView.update` + 5.14's re-arm `mineView.update`, both kept). 5.17's generic ghost range rings show `bearTrap.plateRadiusM` with no change (asserted in `bearTrapArt.test.ts`). Gate on the merged tree: typecheck, lint, test (271 files passed, 1 skipped; 2,241 tests passed, 3 skipped), build — green (load 0.56 → 3.56).
