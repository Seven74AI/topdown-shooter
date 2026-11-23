# Story 5.14: Bear trap

Status: ready-for-dev (designer decisions D1–D12 to confirm before coding)

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
3. **Held.** A held zombie does not move: no walking, no crowd push, no hard-overlap shove, no knockback (Shotgun, Fire Axe, Bloater push). It is still a body (others crowd round it, players can't walk through it) and **still attacks**: it bites/swings a player in reach, a Spitter still spits, a Bloater touching a player still swells (D2 "caught by the leg, not stunned").
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
15. **F9 Wear is visible and repairable.** HP bar shows wear (100 → 75 → 50 → 25); fire (4.8) and Bloater blast building damage (5.8) wear it too; a mine blast doesn't (5.9 DD6); repair as any building (3.7: 50 % of 50 = 25 to full).
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

- [ ] **T1 Balance (AC 1, D1–D6)** — `config/balanceSchema.ts`: `bearTrapSchema = z.object({ plateRadiusM, holdS, snapDamage, wearPerCatch (int), rearmS }).strict()` with 4.8's whole-tick refines; `buildingTypeSchema.bearTrap` optional; `crossCheckBuildingTypes`: `bearTrap` exclusive with `turret/trap/mine/light/heal`, floor only (`solid: false`), no `upgradesTo`, `plateRadiusM ≤ half footprint`. `zombies.json › brute.trapHoldPct: 50` (`zombieTypeSchema.trapHoldPct` int 1–100, default 100). `buildings.json` appends `bear_trap`. Tests in `config/balance.test.ts`.
- [ ] **T2 Sim (AC 2–6, F1–F9)** — new `buildings/bearTrap.ts › updateBearTraps(world)` in `buildingSystem.ts` after `updateTraps` (before `updateMines`), waves only: per armed trap, the lowest-id alive zombie with centre in the plate → `snap` (damage via the spike trap's direct `hp -=` + `killZombie` credit path, `trapState = HOLDING`, `Building.heldZombie = id`, zombie `holdTicks = ticksFor(...)`, emit `bear_trap.snapped`). Per holding trap: release when the held zombie died/freed (check `generation`) or `holdTicks` hit 0 → `SPRUNG`, `damageBuilding(wearPerCatch)`. Per sprung trap: per-trap re-arm clock + player slot (any standing player whose body overlaps the plate circle; continuous). Build start (`resetBurnClocks` site): all traps `ARMED`, clocks 0, zombie `holdTicks` 0.
  - [ ] `Building` gets `trapState`, `heldZombie`, `heldGen`, `rearmTicks`, `rearmSlot` (0 for other types); `BuildingState.version` +1 on every trap-state change (renderers + `syncBuildings`); `wallVersion` never.
  - [ ] `zombies/zombiePool.ts`: `holdTicks: Uint16Array` (0 on spawn); `zombieAi.ts`: pass 1 a held zombie gets `vx = vy = 0` like the windup branch (but still runs attacks in pass 4); pass 2 skip; pass 3 `resolveOverlaps`: a held zombie is immovable (the other body takes the full push); pass 4 players/buildings push-out: unchanged (it's on floor). `holdTicks--` in pass 4.
  - [ ] Knockback: `combat/damage.ts › applyKnockback` (+ melee/explosion/Bloater push) skips `holdTicks > 0`.
  - [ ] Tests `buildings/bearTrap.test.ts`: snap at the plate edge (0.349 yes / 0.35 no), 5 damage + kill credit, held 3 s exactly = 60 ticks (and 30 for a Brute), no movement while held under a pushing crowd + shotgun knockback, still bites a player in reach, Spitter still spits, Bloater swells on touch, release → sprung + 25 wear, 4 catches → removed, one zombie per trap, lowest id on ties, two adjacent traps catch two, re-arm 1 s continuous (on/off resets), downed player can't, no re-arm while holding, build start re-arms, players never caught, build phase never catches, fire wears it, mine blast doesn't, `wallVersion` constant.
- [ ] **T3 Network (AC 17, F10)** — `RunState.ts buildingFields.trap: t.uint8()`, `syncState.ts › syncBuildings` (write on change), `stateView` `BuildingStateView.trap` + key lists, `net/mirrorBuildings.ts` (copy `trapState`), `snapshotWorld` (new fields), `net/netEvents.ts` next free kind `BEAR_TRAP_SNAPPED` (+ round trip), `eventInterest.ts` local. Tests: `syncState.test.ts`, `NetSimHost.buildings.test.ts`, bandwidth (`buildingBandwidth.test.ts` + 6 bear traps: B/s reported).
- [ ] **T4 Client (AC 17–20)** — `buildingArt.ts › drawBearTrap(c, closed)` (port B-T1), `buildingsAtlas.ts` two frames, `BuildingView` frame by `trapState`, plate ring in build phase + placement preview, local re-arm progress ring, `FxView` snap FX + `placeholderSfx` `building_bear_trap_snap`; readability sheet row.
- [ ] **T5 Fuzz, sims, perf, browser (brief 7, 9, 15, 16, 18)** — extend `buildings/floor.fuzz.test.ts` with bear traps (incl. in 1 m gaps and next to spike traps): no body in a wall, no stall, zombies reach players, nav only on wall changes; liveness ≥ 1 catch/release/re-arm/Brute catch/wear-out. `fiveWaveSim` test-local list with bear traps (waves ended). `tickCostDowntown` with 24 bear traps (PERF_ASSERT). `?stressbuild=bear` (12 traps) headless FPS before/after. Playwright solo: place, catch, closed look, re-arm by standing; screenshots into `docs/art/5-14/`.
- [ ] **T6 Mutations (brief 9)** — "catch by body overlap instead of centre", "hold counted on a shared clock", "held zombie pushed by crowd", "knockback moves a held zombie", "held zombie can't attack", "two zombies per trap", "players trigger", "re-arm while holding", "re-arm clock not reset on leaving", "Brute held full time", "no wear per catch", "wallVersion bumped", "build phase catches" — each must fail a listed test.
- [ ] **T7 Gates** — typecheck, lint, test, build on the branch merged with master (after 5.10 lands); Dev Agent Record; Notes for the merge.

## Dev Notes

### Designer decisions to confirm (RECOMMENDED values; the build waits for these)

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
| D12 | Fire / blasts | **Fire and Bloater blasts wear it; mine blasts don't** (as the spike trap) | Immune to all |

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

### Debug Log References

### Completion Notes List

- Story context created 2026-11-23 from the real code on `story-5-10`; designer decisions D1–D12 pending.

### File List
