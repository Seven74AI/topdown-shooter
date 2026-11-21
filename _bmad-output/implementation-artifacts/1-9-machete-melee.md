---
baseline_commit: 571d788ec757ba992d7f044930280dee002214ef
---
# Story 1.9: Machete melee

Status: review

## Story

As a player,
I want to swing a Machete that hits every zombie in front of me,
so that I can fight up close in the crowd.

## Acceptance Criteria

1. **Swing (FR14).** With the Machete added to the dev loadout picker and active (12 damage, 2.5 swings/s, 1.8 m reach, 110° arc), aiming past the dead zone swings it automatically and instantly damages every zombie whose body overlaps the arc in the aim direction. A placeholder swing effect and sound play; there is no magazine or reload.
2. **Hit feedback (FR19).** Each zombie hit flashes and is pushed back.
3. **Tests.** Vitest covers arc angle, reach (measured to the zombie's edge), multi-hit and rate.

## Tasks / Subtasks

- [x] **Task 1: Melee in `combat`** (AC 1, 2) — `combat/melee.ts`; `firing.ts` branches on `weapon.kind`: `"melee"` → `swingMelee(...)` instead of spawning a projectile. Same cooldown rule (`cooldownS += 1 / rateHz`), no ammo, no reload, swap rules from 1.8 unchanged. Damage through `applyZombieDamage` (1.5) so flash, pushback and kill events are shared. Emit `melee.swung { playerId, weapon, x, y, dirX, dirY, arcDeg, rangeM }`
- [x] **Task 2: Sector–circle overlap** (AC 1, 3) — `math/sector.ts`: `circleOverlapsSector(cx, cy, r, ox, oy, dirX, dirY, reachM, halfArcCos, halfArcSin): boolean` (see Dev Notes › Overlap test)
- [x] **Task 3: Tests** (AC 3) — `combat/melee.test.ts` and `math/sector.test.ts`: zombie center at 1.8 m + its radius − 0.01 → hit, + 0.01 → miss (reach to the edge); a zombie centered at 56° → hit, centered at 60° but with its body crossing the 55° edge → hit, clearly outside → miss; behind the player → miss; 8 zombies in the arc → all 8 take 12 damage from one swing; 2.5 swings/s → 5 swings in 2 s (40 ticks); no ammo change; aim below the dead zone → no swing
- [x] **Task 4: Client feedback** (AC 1) — on `melee.swung`: a 120 ms translucent arc wedge (pooled `Graphics` redrawn only on the swing, then hidden) and a placeholder `weapon_machete_swing` whoosh in `placeholderSfx.ts`; hits reuse the flash from 1.5. HUD slot shows `—` instead of a magazine
- [x] **Task 5: Picker** — confirm the Machete appears in the 1.8 dev loadout picker automatically (it lists balance weapons)

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

claude-opus-5-5 (Claude Opus 5.5), via gds-dev-story

### Debug Log References

- Red: `sector.test.ts` failed to import (no `math/sector.ts`), 10 of 13 `melee.test.ts` tests failed (no swing: `tryFire` returned false for melee). Green after the implementation; full suite 204/204.
- No browser check in this pass: the dev loadout picker (1.8) is being built in parallel, so the Machete can't be selected in the running game yet. The swing arc and whoosh are verified by typecheck/build only; check them once 1.8 lands (Story 1.12 playtests the feel).

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **Implemented:**
  - **Shared:**
    - `math/sector.ts` `circleOverlapsSector()`: exact circle-vs-sector test per Dev Notes (reach to the edge, center within ±θ, or touching one of the two edge segments via `segmentCircleT`, or containing the origin). Takes cos θ / sin θ, so a swing computes trig once and each candidate costs no trig and no allocation.
    - `combat/melee.ts` `swingMelee()`: emits `melee.swung`, queries the zombie grid within reach + `maxZombieRadius(balance)` into the shared `zombieCandidates` buffer, skips dead zombies, and damages every overlapping zombie through `applyZombieDamage` (flash, pushback, kill events shared with guns).
    - `combat/firing.ts`: `tryFire` branches on `isMelee(stats)` after the fire/aim/cooldown checks: swing along the raw aim, `cooldownS += 1 / rateHz`, return true. Same cooldown rule as guns (2.5/s exact: 25 swings in 10 s), no ammo, no reload, swap rules unchanged.
    - `core/simEvents.ts`: `melee.swung { playerId, weapon, x, y, dirX, dirY, arcDeg, rangeM }`.
    - `index.ts` exports `swingMelee`, `circleOverlapsSector`.
  - **Client:**
    - `FxView`: on `melee.swung`, a translucent wedge (pooled `Graphics`, redrawn only on the swing) that fades out over 120 ms and is then hidden; plays `weapon_machete_swing` for the local player. Hits reuse the 1.5 flash via `zombie.hit`.
    - `placeholderSfx`: `weapon_machete_swing`, a 120 ms noise whoosh through a rising band-pass.
- **Decisions:**
  - The swing origin is the player's center (not the muzzle): reach 1.8 m is measured from the center to the zombie's edge, as the tests in Task 3 describe.
  - Pushback direction is radial (player → zombie center), not the aim direction, so zombies at the arc's sides are pushed outward, away from the player. Falls back to the aim direction for a zombie centered on the player. Magnitude is the Machete's `hitPushbackM` (0.25 m, already in `weapons.json`; unchanged).
  - Melee is not aim-assisted and ignores cover, per the brief and Dev Notes.
- **Task 4 HUD:** no `HudScene.ts` change needed (and it's off-limits in this pass): `GameScene` already sets `hudModel.ammo = -1` for non-gun weapons and the HUD renders `—`.
- **Task 5 Picker:** not verifiable here (1.8 picker built in parallel). The Machete is a balance weapon (`weapons.json`), so a picker listing `weaponIds(balance)` includes it automatically.
- **Tests:** 204 passing (+21): `sector.test.ts` 8 (reach ±0.01 to the edge, 56°, 60° body crossing the 55° edge on both sides, clearly outside, behind, origin inside, reach at the edge-segment end, rotated direction), `melee.test.ts` 13 (balance values, `melee.swung` payload and no projectile, reach ±0.01 through `step()`, arc edges/outside/behind, 8 zombies all hit for 12 with radial pushback and kills, exact 12 damage, 5 swings in 2 s, 25 swings in 10 s, no saved-up swings after idling, no ammo/reload, fire=false → no swing, touch swings along the raw stick direction, swap from Pistol to Machete).
- **Verification:** typecheck 0 errors, lint 0 problems, `npm test` 204/204, build ok.

### File List

- `packages/shared/src/math/sector.ts` (new)
- `packages/shared/src/math/sector.test.ts` (new)
- `packages/shared/src/combat/melee.ts` (new)
- `packages/shared/src/combat/melee.test.ts` (new)
- `packages/shared/src/combat/firing.ts` (modified: melee branch)
- `packages/shared/src/core/simEvents.ts` (modified: `melee.swung`)
- `packages/shared/src/index.ts` (modified: exports)
- `apps/client/src/render/FxView.ts` (modified: swing arc + sound)
- `apps/client/src/audio/placeholderSfx.ts` (modified: `weapon_machete_swing`)
- `_bmad-output/implementation-artifacts/1-9-machete-melee.md` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-11-21: Story 1.9 implemented: Machete melee (instant 110° / 1.8 m arc hit via exact sector–circle test, 2.5 swings/s with the shared cooldown rule, damage/flash/pushback through `applyZombieDamage`), `melee.swung` event, swing wedge effect and whoosh placeholder. 204 tests passing.
