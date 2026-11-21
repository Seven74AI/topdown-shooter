# Story 1.9: Machete melee

Status: ready-for-dev

## Story

As a player,
I want to swing a Machete that hits every zombie in front of me,
so that I can fight up close in the crowd.

## Acceptance Criteria

1. **Swing (FR14).** With the Machete added to the dev loadout picker and active (12 damage, 2.5 swings/s, 1.8 m reach, 110° arc), aiming past the dead zone swings it automatically and instantly damages every zombie whose body overlaps the arc in the aim direction. A placeholder swing effect and sound play; there is no magazine or reload.
2. **Hit feedback (FR19).** Each zombie hit flashes and is pushed back.
3. **Tests.** Vitest covers arc angle, reach (measured to the zombie's edge), multi-hit and rate.

## Tasks / Subtasks

- [ ] **Task 1: Melee in `combat`** (AC 1, 2) — `combat/melee.ts`; `firing.ts` branches on `weapon.kind`: `"melee"` → `swingMelee(...)` instead of spawning a projectile. Same cooldown rule (`cooldownS += 1 / rateHz`), no ammo, no reload, swap rules from 1.8 unchanged. Damage through `applyZombieDamage` (1.5) so flash, pushback and kill events are shared. Emit `melee.swung { playerId, weapon, x, y, dirX, dirY, arcDeg, rangeM }`
- [ ] **Task 2: Sector–circle overlap** (AC 1, 3) — `math/sector.ts`: `circleOverlapsSector(cx, cy, r, ox, oy, dirX, dirY, reachM, halfArcCos, halfArcSin): boolean` (see Dev Notes › Overlap test)
- [ ] **Task 3: Tests** (AC 3) — `combat/melee.test.ts` and `math/sector.test.ts`: zombie center at 1.8 m + its radius − 0.01 → hit, + 0.01 → miss (reach to the edge); a zombie centered at 56° → hit, centered at 60° but with its body crossing the 55° edge → hit, clearly outside → miss; behind the player → miss; 8 zombies in the arc → all 8 take 12 damage from one swing; 2.5 swings/s → 5 swings in 2 s (40 ticks); no ammo change; aim below the dead zone → no swing
- [ ] **Task 4: Client feedback** (AC 1) — on `melee.swung`: a 120 ms translucent arc wedge (pooled `Graphics` redrawn only on the swing, then hidden) and a placeholder `weapon_machete_swing` whoosh in `placeholderSfx.ts`; hits reuse the flash from 1.5. HUD slot shows `—` instead of a magazine
- [ ] **Task 5: Picker** — confirm the Machete appears in the 1.8 dev loadout picker automatically (it lists balance weapons)

## Dev Notes

### Overlap test

A circle (zombie body, radius r) overlaps the sector (origin o, direction d, reach R, half-angle θ = arcDeg / 2) if:

1. `|c − o| ≤ R + r` (reach measured to the zombie's edge, AC 3), and
2. either the center is inside the angular range: `dot(c − o, d) ≥ |c − o| · cos θ`, or the circle touches one of the two edge segments from o of length R at angles ±θ (`segmentCircleT` from `math/sweep.ts` (1.5) returns ≥ 0), or the circle contains o.

- Precompute the two edge directions with `cos θ`, `sin θ` once per swing (`rotate(d, ±θ)`), not per zombie.
- Candidates come from `spatialGrid.queryRadius(ox, oy, R + maxZombieRadius)`.
- Melee hits are instant (GDD) and ignore cover (Story 4.2 states "melee ignores cover in v1").

### Feel

- Melee under twin-stick is the GDD's open risk; Story 1.12 playtests it. Keep reach, arc, rate and pushback all in balance so tuning needs no code change.
- The Machete's `hitPushbackM` can be larger than guns' (e.g. 0.25) to sell the hit; it's a balance value, note it.

### Scope and prerequisites

- Builds on 1.5 (`firing`, `applyZombieDamage`, `sweep`), 1.8 (slots, swap, picker). Read their records and code.
- Out of scope: Fire Axe knockback and Chainsaw continuous damage (5.2), gore (9.5).

### Project Structure Notes

New: `packages/shared/src/combat/{melee.ts, melee.test.ts}`, `packages/shared/src/math/{sector.ts, sector.test.ts}`.
Modified: `combat/firing.ts`, `core/simEvents.ts` (`melee.swung`), `weapons.json` (machete `hitPushbackM` if tuned), `FxView.ts`, `placeholderSfx.ts`, `HudScene.ts`.

### References

- [Source: epics.md#Story 1.9: Machete melee]
- [Source: gdd.md#Weapon Systems] (Machete 12 / 2.5/s / 1.8 m / 110°), [#Aiming and Combat Mechanics] (melee instant), [#Controls and Input] (open risk)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
