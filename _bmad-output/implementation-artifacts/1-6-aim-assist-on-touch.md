# Story 1.6: Aim assist on touch

Status: ready-for-dev

## Story

As a player on a phone,
I want my shots to bend slightly toward the nearest zombie,
so that aiming with a thumb feels reliable in a crowd.

## Acceptance Criteria

1. **Assist (FR4).** With touch aiming, when a shot is fired and a zombie within the weapon's range is within 8° of the aim direction, the shot direction is turned toward the nearest such zombie (by distance), by at most 8°.
2. **No target.** With no zombie within 8° of the aim direction, the shot flies exactly along the aim direction (plus the weapon's normal spread).
3. **Mouse.** With mouse aiming (`isMouse` in the input), no aim assist is applied.
4. **Tests.** Vitest covers the 8° limit, nearest-target choice, range limit and the mouse exception.

## Tasks / Subtasks

- [ ] **Task 1: `combat/aimAssist.ts`** (AC 1, 2) — `assistAim(world, ox, oy, dirX, dirY, rangeM, out: { x: number; y: number }): number` writes the assisted unit direction into `out` and returns the target zombie id or `-1` (see Dev Notes › Algorithm)
- [ ] **Task 2: Hook into firing** (AC 1–3) — in `combat/firing.ts` from Story 1.5, at the "1.6 inserts aim assist here" point: if `!input.isMouse` → `assistAim(...)`; spread is applied **after** assist. Melee (1.9) does not use aim assist
- [ ] **Task 3: Tests** (AC 4) — `combat/aimAssist.test.ts`: zombie at 7.9° → shot points exactly at it; at 8.1° → unchanged; two zombies inside the cone → the nearer by distance wins even if it is at a wider angle; a zombie inside the cone but beyond `rangeM` (+ its radius) → ignored; `isMouse: true` through the full `step()` path → direction unchanged (use `spreadDeg: 0` test balance); dead zombies ignored; zero candidates → returns `-1` and leaves the direction
- [ ] **Task 4: Debug view (optional, dev only)** — when the collision view exists (Story 1.11), draw the 8° cone. Not required now

## Dev Notes

### Algorithm

```
cosLimit = cos(aimAssistDeg)          // from balance.controls; compute once per call (cheap) or cache by value
best = -1; bestD2 = +inf
for each zombie id from spatialGrid.queryRadius(ox, oy, rangeM + maxZombieRadius):
   vx = zx - ox; vy = zy - oy; d2 = vx*vx + vy*vy
   if d2 > (rangeM + r)^2 or d2 < 1e-6: continue
   d = sqrt(d2); cosA = (vx*dirX + vy*dirY) / d
   if cosA >= cosLimit and d2 < bestD2: best = id; bestD2 = d2
if best >= 0: out = (vx_best, vy_best) / d_best     // the target is inside 8°, so turning straight at it is "at most 8°"
else: out = dir
```

- The angle test uses the zombie's **center**. "Within the weapon's range" uses range + zombie radius so a zombie whose edge is in range counts.
- Only `cos()` of a constant is needed; all per-zombie math is dot products and one `sqrt`.
- `aimAssistDeg` (8) is in `balance.controls` (added in Story 1.3). Story 10.1 later adds a player setting to turn assist off; that will set `isMouse`-like behaviour through a separate input flag, not by changing balance. Don't build the setting now.
- Story 2.7 applies this on the server with server zombie positions: keep the function pure over the World (no client state).

### Scope

- Builds on 1.5 (`firing.ts`, projectile spawn, `PlayerInput.isMouse`) and 1.4 (`spatialGrid`). Read the earlier records and real code.
- `isMouse` stays `false` until Story 1.10 sets it; test the exception through the input path anyway.

### Project Structure Notes

New: `packages/shared/src/combat/{aimAssist.ts, aimAssist.test.ts}`. Modified: `combat/firing.ts` (+ test), `index.ts`.

### References

- [Source: epics.md#Story 1.6: Aim assist on touch]
- [Source: gdd.md#Controls and Input] (8°, off on desktop mouse aim)
- Server applies assist: [Source: epics.md#Story 2.7], [game-architecture.md#Communication Patterns] ("aim assist applied here from server positions")

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
