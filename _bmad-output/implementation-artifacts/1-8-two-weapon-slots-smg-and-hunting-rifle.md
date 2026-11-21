---
baseline_commit: fe6b6bbd5dee8f6627756610342f73ee4d0d5a4c
---

# Story 1.8: Two weapon slots, SMG and Hunting Rifle

Status: ready-for-dev

## Story

As a player,
I want to carry two weapons and swap between them, including an SMG and a Hunting Rifle,
so that I can pick a role and react to the situation.

## Acceptance Criteria

1. **Dev loadout picker (FR12).** At the start of a run in Epic 1, a dev loadout picker (temporary until the shop exists) lets me choose any 2 of the weapons that exist so far (Pistol, SMG, Hunting Rifle; later stories add theirs) for my two slots.
2. **Swap (FR5).** With two weapons equipped, tapping the swap button near my right thumb makes the other weapon active after 0.3 s, during which neither fires.
3. **SMG.** The SMG (4 damage, 12 shots/s, 8.5 m, 8° spread, magazine 40, reload 1.6 s) behaves per the weapon table.
4. **Hunting Rifle (FR16, FR19).** A Hunting Rifle shot (35 damage, 1.2 shots/s, 17 m, magazine 5, reload 2.5 s) that crosses a line of zombies damages up to 5 of them in order, then stops. Each shot gives a short screen shake.
5. **HUD.** The HUD shows both slots, the active weapon and its magazine count.
6. **Buttons vs sticks (readiness fix U1/U4).** A touch that starts on the swap button, or on any later HUD button (consumable, ping, menu, Shop, Ready), presses the button and never spawns a move or aim stick; a touch that starts outside every button spawns a stick as usual. Every button is at least 44 × 44 px and HUD text at least 14 px (at devicePixelRatio 1), placed inside the safe areas.

## Tasks / Subtasks

- [ ] **Task 1: Two slots and swapping (shared)** (AC 1, 2) — extend `combat/loadout.ts` (Story 1.5): `setLoadout(world, playerId, [a, b | null])` (used by the picker; fills magazines); on `input.swap` with a second slot and `swapLeftS == 0`: `swapLeftS = balance.player.swapS` (0.3), emit `weapon.swap_started`; while `swapLeftS > 0` no firing; when it reaches 0 → `active = 1 - active`, emit `weapon.swapped { playerId, active, weapon }`. Swapping away **cancels** a reload in progress; coming back to an empty magazine restarts the full reload. Ammo is kept per slot. Swap is ignored with an empty second slot or during a swap. Tests for each rule, timing in ticks (0.3 s = 6 ticks)
- [ ] **Task 2: SMG and Hunting Rifle data** (AC 3, 4) — already in `weapons.json` from Story 1.2; check the values against the AC; tests: SMG fires 12 shots in 1 s (with `cooldownS +=` the 12/s rate is exact over 20 ticks), Hunting Rifle pierces exactly 5 zombies standing in a line and the 6th is untouched, each pierced zombie takes 35 (one shot kills 5 Walkers)
- [ ] **Task 3: Screen shake (client)** (AC 4) — on `weapon.fired` for a weapon with `screenShake: true` and the local player: `camera.shake(80 ms, small intensity)`. Respect a `settings.screenShake` flag (default on) in `apps/client/src/settings/settings.ts` (localStorage, try/catch, defaults if storage fails); Story 10.1 builds the Settings screen on top
- [ ] **Task 4: Dev loadout picker (client)** (AC 1) — `apps/client/src/debug/LoadoutPicker.tsx`: shown before the run starts (and on Restart), lists `Object.keys(balance.weapons)` as tappable chips (so Machete appears automatically in 1.9), two choices required, **Start** button. Shown only in development builds (`import.meta.env.DEV`); a release build starts with Pistol + nothing. Story 3.3 moves it to the dev cheats
- [ ] **Task 5: Swap button and button-first touch routing (client)** (AC 2, 6) — see Dev Notes › Buttons and touch routing
- [ ] **Task 6: HUD weapons panel** (AC 5) — bottom-right above the swap button: two slot cards (weapon name, magazine `23 / 40` or `—`), the active one highlighted; a thin progress bar while swapping or reloading
- [ ] **Task 7: Verify** — scripts pass; headless touch test: a tap on the swap button swaps after ~0.3 s and no aim stick appears; a drag that starts next to the button spawns the aim stick

## Dev Notes

### Buttons and touch routing

- Create `apps/client/src/input/HudButtons.ts`: a registry of HUD buttons (`id`, screen rect in canvas pixels, `onPress`). `TouchSticks` asks it first on every `pointerdown`: if the point is inside a button's rect (with a 4 px tolerance), the button owns that pointer until `pointerup` and **no stick is created**. Only then do the half-screen rules from 1.3/1.5 apply.
- One routing place for all later buttons (consumable 5.12, ping 8.7, menu 2.11, Shop/Ready 3.1/3.3). Write a unit test for the routing logic as a pure function (`routePointer(x, y, buttons, screenW) → "button:<id>" | "move" | "aim"`).
- Sizes: `MIN_BUTTON_CSS_PX = 44` and `MIN_TEXT_CSS_PX = 14` in `apps/client/src/ui/sizes.ts`; multiply by `dpr()` in canvas space. Swap button: 64 × 64 CSS px, bottom-right, above where the right thumb usually rests (inset 24 px + safe area from the right and 120 px from the bottom).
- **Safe areas:** read `env(safe-area-inset-*)` once via a hidden CSS probe element (`padding: env(safe-area-inset-left) …` then `getComputedStyle`), re-read on resize, and expose `safeArea()` from `display.ts`. Phaser can't read CSS env vars directly.
- Swap sends `swap: true` in exactly one input sample (edge-triggered, Story 1.2 input contract).

### Rules

- Two slots in any combination (GDD: two melee is allowed). Role comes only from what is carried.
- The GDD swap time is 0.3 s → `balance.player.swapS` (added in 1.3).
- Hunting Rifle range 17 m is longer than the 12 m screen edge on purpose (GDD): no clamping to the view.

### Scope and prerequisites

- Builds on 1.5 (`loadout`, `firing`, projectile pierce list) and 1.3/1.5 (`TouchSticks`). Read their records and code.
- Out of scope: Machete (1.9), keyboard Q swap (1.10), shop (3.3), upgrade levels (5.1).

### Project Structure Notes

New: `apps/client/src/input/{HudButtons.ts, routePointer.ts, routePointer.test.ts}`, `apps/client/src/debug/LoadoutPicker.tsx`, `apps/client/src/settings/settings.ts`, `apps/client/src/ui/sizes.ts`.
Modified: `combat/loadout.ts`, `combat/firing.ts` (+ tests), `core/simEvents.ts` (`weapon.swap_started`, `weapon.swapped`), `display.ts` (`safeArea()`), `TouchSticks.ts`, `HudScene.ts`, `GameScene.ts`, `FxView.ts`.

### References

- [Source: epics.md#Story 1.8: Two weapon slots, SMG and Hunting Rifle] (includes the readiness-fix AC)
- [Source: gdd.md#Weapon Systems] (table, two slots), [#Controls and Input] (swap 0.3 s)
- Readiness fixes U1, U4: [Source: _bmad-output/planning-artifacts/implementation-readiness-report-2026-11-21.md#Resolutions]
- Settings in localStorage: [Source: game-architecture.md#Configuration]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
