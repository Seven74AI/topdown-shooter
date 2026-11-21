---
baseline_commit: 71921fbce2e6505ce326589c96eab8fc354d7ad6
---

# Story 1.5: Aim and shoot the Pistol

Status: review

## Story

As a player,
I want to aim with my right thumb and have my Pistol fire automatically,
so that I can fight the horde with two thumbs and no fire button.

## Acceptance Criteria

1. **Aim stick (FR3).** A touch on the right half spawns an aim stick. Past 30% of its radius the survivor faces that direction and the Pistol fires automatically at 3 shots/s while held. Below 30% the survivor aims but does not fire.
2. **Projectiles (FR14, FR15).** The Pistol (5 damage, 9 m range, magazine 12, reload 1.0 s, from `weapons.json`) fires a visible projectile at 60 m/s with a fixed spread and no recoil climb, which disappears at 9 m. Hits use swept segment-vs-circle tests so a projectile can't pass through a zombie between ticks.
3. **Auto reload (FR6).** When the magazine is empty and I keep aiming, the Pistol reloads automatically in 1.0 s with a visible reload indicator, then resumes firing. Reserve ammo is unlimited.
4. **Hit feedback (FR19).** A hit makes the Walker flash and pushes it back slightly. At 0 HP it plays a placeholder death and blood splat, and `zombie.killed` is emitted. A placeholder fire sound plays per shot and a reload sound plays on reload.

## Tasks / Subtasks

- [x] **Task 1: Loadout state (shared)** (AC 1, 3) — `packages/shared/src/combat/loadout.ts`: per player `loadout = { slots: [WeaponSlot, WeaponSlot | null], active: 0 | 1, swapLeftS: number }`, `WeaponSlot = { weapon: WeaponId, ammo: number, reloadLeftS: number, cooldownS: number }`. `addPlayer` gives `[pistol, null]` with a full magazine. `WeaponId` = keys of `balance.weapons` (typed from the schema). Story 1.8 adds the second slot and swapping
- [x] **Task 2: Firing (shared)** (AC 1, 2, 3) — `combat/firing.ts`, part of the `combat` system (see Dev Notes › Firing rules)
- [x] **Task 3: Projectile pool + swept hits (shared)** (AC 2) — `combat/projectilePool.ts` and `math/sweep.ts` (see Dev Notes › Projectiles, › Swept collision). Tests: a 60 m/s bullet aimed at a Walker 5 m away hits it although it moves 3 m per tick; a bullet passing beside a zombie at a distance > radius misses; range ends at exactly 9 m (the segment is cut at the remaining range); pierce 1 stops at the first hit; segment starting inside a zombie hits it
- [x] **Task 4: Damage and pushback (shared)** (AC 4) — `combat/damage.ts`: `applyZombieDamage(world, id, amount, source)` → `hp -= amount`; emit `zombie.hit { zombieId, x, y, dirX, dirY, damage, weapon }`; push the zombie by `hitPushbackM` (0.15) along the hit direction (clamped to map bounds); at `hp ≤ 0` call `kill()` (emits `zombie.killed` with killer and weapon). Tests: 2 Pistol hits kill a Walker (10 HP / 5), pushback distance, killer id
- [x] **Task 5: Aim stick (client)** (AC 1) — extend `TouchSticks` from 1.3: a pointer going down on the right half owns the aim stick until it lifts; `aimDeadZone` (0.3) from `balance.controls`. Below the dead zone: `aimX/aimY` = the raw direction (facing only), `fire = false`; past it: `fire = true`. Same drawing as the move stick
- [x] **Task 6: Projectile and effects rendering (client)** (AC 2, 4) — `render/ProjectileView.ts`, `render/FxView.ts` (see Dev Notes › Client feedback)
- [x] **Task 7: Placeholder sounds (client)** (AC 4) — `apps/client/src/audio/placeholderSfx.ts` (see Dev Notes › Sounds)
- [x] **Task 8: HUD** (AC 3) — magazine count `12 / 12` bottom-right; during reload, a ring or bar filling over `reloadS` and the text `Reloading`
- [x] **Task 9: Verify** — scripts pass; headless browser with touch emulation: holding the right stick past 30% fires 3 shots/s, the 13th shot waits ~1 s; Walkers die after 2 hits

## Dev Notes

### Scope and prerequisites

- Builds on 1.2–1.4: World, `combat` system slot, `PlayerInput.fire/aimX/aimY`, `world.zombies` pool, `spatialGrid`, `kill()`, `HudScene`, `TouchSticks`. Read the earlier story records and the real code first.
- Out of scope: aim assist (1.6), second weapon and swapping (1.8), melee (1.9), mouse (1.10), friendly fire (5.4). Projectiles never hit players in Epic 1.

### Firing rules (per alive player, per tick)

```
slot = loadout.slots[active]
slot.cooldownS = max(0, slot.cooldownS - dt)
if slot.reloadLeftS > 0: slot.reloadLeftS -= dt; if ≤ 0 → ammo = magazine, emit weapon.reloaded; (cannot fire this tick)
else if input.fire and slot.cooldownS == 0 and ammo > 0:
   dir = normalize(aimX, aimY)                    // 1.6 inserts aim assist here
   dir = rotate(dir, spread)                      // spread = rng.range(-spreadDeg/2, +spreadDeg/2)
   spawn projectile at player center + dir * (playerRadius + 0.1)
   ammo -= 1; slot.cooldownS += 1 / rateHz        // += keeps the exact rate at 20 Hz ticks (3/s → one shot per 6.67 ticks)
   emit weapon.fired { playerId, weapon, x, y, dirX, dirY }
   if ammo == 0: slot.reloadLeftS = reloadS; emit weapon.reload_started { playerId, weapon, reloadS }
```

- **Rate accuracy:** with `cooldownS += 1/rate` (not `= 1/rate`), several shots can't happen per tick for the Pistol, but over time the average is exactly 3/s. For rates above 20/s (none in Epic 1; SMG is 12/s) allow at most one shot per tick and note it.
- Reload starts automatically when the magazine empties (GDD: "automatic when the magazine is empty"), even if the player stops aiming. No manual reload in v1.
- Spread uses `world.rng` (seeded) and needs one `cos/sin` pair to rotate; that is fine because shots are decided only by the server in Epic 2 (client shots are cosmetic). Precompute nothing per weapon; rotation by a small angle is cheap.
- `rangeM`, `rateHz`, `magazine`, `reloadS`, `damage`, `spreadDeg`, `projectileSpeedMps`, `pierce`, `hitPushbackM` all come from `balance.weapons[id]` (Story 1.2 schema).

### Projectiles

- SoA pool in `world.projectiles`, capacity `PROJECTILE_POOL_CAPACITY = 512` (constants): `x, y, prevX, prevY, dirX, dirY, speed, rangeLeftM, damage, pierceLeft, weapon (Uint8 index), owner (Uint8 player index or slot)`, plus a per-projectile list of already-hit zombie ids (`Int32Array(capacity * MAX_PIERCE)`, `MAX_PIERCE = 5`) so a piercing round never hits the same zombie twice.
- Projectiles move in the `combat` system **before** zombies move (system order: combat → zombies). Each tick: `step = min(speed * dt, rangeLeftM)`; test the segment `p → p + dir * step`; apply hits in order of distance along the segment until `pierceLeft` reaches 0; advance; `rangeLeftM -= step`; free at 0 or when it leaves the map.
- Free projectiles do not need hold ticks (they are not streamed; Epic 2 clients draw them cosmetically from `weapon.fired`).

### Swept collision

`math/sweep.ts`: `segmentCircleT(ax, ay, bx, by, cx, cy, r): number` returns the first t in [0, 1] where the segment touches the circle, or `-1`. Solve `|a + t(b−a) − c|² = r²` (quadratic); if a is inside the circle return 0. Candidates come from the spatial grid: query cells along the segment's bounding box expanded by the largest zombie radius (a 3 m step crosses ≤ 3 cells). Collect `(t, id)` for candidates, sort the few hits by t (insertion sort on a small preallocated buffer), apply in order.

### Client feedback

- `ProjectileView`: pooled short streak (0.6 m line, warm yellow), interpolated with alpha. In local mode it reads `world.projectiles` directly. (In Epic 2 projectiles become cosmetic from `weapon.fired`; keep the view's input as "list of projectiles with prev/cur positions" so it can switch source.)
- `FxView` consumes `host.drainEvents()` once per frame and dispatches: `zombie.hit` → tint the zombie's image white for 80 ms (`setTintFill`, then `clearTint`); `zombie.killed` → hide the zombie (the pool view already does once the slot is free), spawn a dark red blood splat decal (pooled images, fade over 10 s, cap 200) and a 200 ms placeholder death puff; `weapon.fired` → a 50 ms muzzle flash circle.
- **Only one consumer drains events.** Make `FxView` (or a small client-side event dispatcher in `GameScene`) the single place that calls `drainEvents()` and fans out to views, sounds and HUD. This becomes the client-side bus the architecture describes.

### Sounds

- No audio files exist yet. `placeholderSfx.ts` synthesizes short sounds with the Web Audio API (one shared `AudioContext`, resumed on the first touch because iOS blocks audio until a user gesture): `fire_pistol` (40 ms noise burst + 200 Hz click), `reload_start` (two clicks), `reloaded` (one click), `zombie_hit` (very short thud), quiet enough to be layered.
- Throttle: at most one `zombie_hit` per 30 ms. Names follow `weapon_pistol_fire` etc. so Story 9.10 swaps in real files.

### Project Structure Notes

New: `packages/shared/src/combat/{loadout.ts, firing.ts, firing.test.ts, projectilePool.ts, projectilePool.test.ts, damage.ts, damage.test.ts}`, `packages/shared/src/math/{sweep.ts, sweep.test.ts, vec.ts}`, `apps/client/src/render/{ProjectileView.ts, FxView.ts}`, `apps/client/src/audio/placeholderSfx.ts`.
Modified: `core/systems.ts` (`combat`), `core/world.ts`, `core/simEvents.ts` (`zombie.hit`, `weapon.fired`, `weapon.reload_started`, `weapon.reloaded`; `zombie.killed.weapon` becomes `WeaponId`), `player/player.ts` (loadout), `constants.ts`, `index.ts`, `TouchSticks.ts`, `GameScene.ts`, `HudScene.ts`.

### References

- [Source: epics.md#Story 1.5: Aim and shoot the Pistol]
- Pistol stats, feel, projectiles, no recoil: [Source: gdd.md#Weapon Systems], [#Aiming and Combat Mechanics]
- Swept collision, events: [Source: game-architecture.md#Networking], [#Event System]
- Cosmetic projectiles in Epic 2: [Source: game-architecture.md#Networking] ("Other entities")

## Dev Agent Record

### Agent Model Used

claude-opus-5-5 (Claude Opus 5.5), via gds-dev-story

### Debug Log References

- Browser check (Playwright, 844×390, touch via CDP):
  - The aim stick appears on the right half, the HUD counts down (`PISTOL 6 / 12`), and shots fire while the stick is past 30%.
  - Holding the aim steady to the right clears a lane in front of the survivor, and blood splats show where Walkers died.
  - With the aim swept in circles, 40 Walkers closing in from every side still overrun one Pistol. That's expected; balance comes with waves (1.7) and the playtest (1.12).
  - No console errors.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **Implemented:**
  - **Shared:**
    - **Loadout:** `combat/loadout.ts` gives each player `loadout` with a full Pistol and an empty second slot.
    - **Firing:** `combat/firing.ts` is the `combat` system. It rebuilds the zombie grid, then each player fires (cooldown `+= 1/rateHz`, compared with a 1e-6 epsilon), then projectiles move and hit.
    - **Projectiles:** a struct-of-arrays pool with a pierce list. Hits use the swept test in `math/sweep.ts` (`segmentCircleT`), sorted nearest-first along each step.
    - **Damage:** `combat/damage.ts` `applyZombieDamage` emits `zombie.hit`, applies pushback and kills at 0 HP.
    - **Supporting code:** `math/vec.ts`; `core/time.ts` (`ticksFor`); the events `weapon.fired`, `weapon.reload_started`, `weapon.reloaded`, `zombie.hit`; loadouts and projectiles added to `snapshotWorld`.
  - **Client:**
    - **Aim stick:** in `TouchSticks`. Below 5% deflection there is no aim; from 5% to 30% the survivor aims without firing; past 30% it fires.
    - **Views:** `ProjectileView` draws pooled streaks. `FxView` is the one place events are dispatched for effects: it covers the white hit flash (Phaser 4 `setTint` + `TintModes.FILL`), a blood decal ring capped at 200, death puffs and muzzle flashes.
    - **Sounds:** `placeholderSfx` synthesizes them with Web Audio, using deterministic noise. Audio unlocks on the first touch.
    - **HUD:** the weapon name and magazine `12 / 12`, plus `Reloading` with a progress bar.
- **Deviation from Dev Notes (deliberate, review lesson from 1.4):** the reload is an integer tick count (`reloadTicks`), not float seconds, because timers count ticks. The fire cooldown stays a float, because rates like 3/s don't divide the 20 Hz tick; an epsilon guards against rounding. A 12-shot magazine takes ≈ 3.7 s, and the reload takes exactly 20 ticks.
- **Grid rebuild:** `updateCombat` rebuilds the zombie grid at its start, because zombies moved after last tick's rebuild. Hit queries are therefore exact (cost: one counting sort per tick).
- **Tests:** 138 passing (+21): sweep 6, firing/projectiles/damage 12, aim stick 3.
- **Verification:** typecheck 0 errors, lint 0 problems, `npm test` 138/138, build ok.

### File List

- `packages/shared/src/math/vec.ts` (new)
- `packages/shared/src/math/sweep.ts` (new)
- `packages/shared/src/math/sweep.test.ts` (new)
- `packages/shared/src/core/time.ts` (new)
- `packages/shared/src/combat/weapons.ts` (new)
- `packages/shared/src/combat/loadout.ts` (new)
- `packages/shared/src/combat/projectilePool.ts` (new)
- `packages/shared/src/combat/damage.ts` (new)
- `packages/shared/src/combat/firing.ts` (new)
- `packages/shared/src/combat/firing.test.ts` (new)
- `packages/shared/src/player/player.ts` (modified: loadout)
- `packages/shared/src/zombies/zombieAi.ts` (modified: uses core/time)
- `packages/shared/src/core/simEvents.ts` (modified)
- `packages/shared/src/core/world.ts` (modified: projectiles)
- `packages/shared/src/core/systems.ts` (modified: combat system)
- `packages/shared/src/core/worldSnapshot.ts` (modified)
- `packages/shared/src/config/constants.ts` (modified: projectile capacity)
- `packages/shared/src/index.ts` (modified)
- `apps/client/src/input/TouchSticks.ts` (modified: aim stick)
- `apps/client/src/input/TouchSticks.test.ts` (modified)
- `apps/client/src/render/ProjectileView.ts` (new)
- `apps/client/src/render/FxView.ts` (new)
- `apps/client/src/render/ZombieView.ts` (modified: hit flash)
- `apps/client/src/audio/placeholderSfx.ts` (new)
- `apps/client/src/scenes/hudModel.ts` (modified)
- `apps/client/src/scenes/HudScene.ts` (modified: aim stick, weapon panel, audio unlock)
- `apps/client/src/scenes/GameScene.ts` (modified)
- `_bmad-output/implementation-artifacts/1-5-aim-and-shoot-the-pistol.md` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-11-21: Story 1.5 implemented: aim stick with auto-fire, Pistol projectiles with swept hits, auto reload, damage/pushback/kills, hit flash, blood, muzzle flash, placeholder sounds, ammo HUD. 138 tests passing.
