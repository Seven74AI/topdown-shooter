---
baseline_commit: fe6b6bbd5dee8f6627756610342f73ee4d0d5a4c
---

# Story 1.8: Two weapon slots, SMG and Hunting Rifle

Status: review

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

- [x] **Task 1: Two slots and swapping (shared)** (AC 1, 2) — extend `combat/loadout.ts` (Story 1.5): `setLoadout(world, playerId, [a, b | null])` (used by the picker; fills magazines); on `input.swap` with a second slot and `swapLeftS == 0`: `swapLeftS = balance.player.swapS` (0.3), emit `weapon.swap_started`; while `swapLeftS > 0` no firing; when it reaches 0 → `active = 1 - active`, emit `weapon.swapped { playerId, active, weapon }`. Swapping away **cancels** a reload in progress; coming back to an empty magazine restarts the full reload. Ammo is kept per slot. Swap is ignored with an empty second slot or during a swap. Tests for each rule, timing in ticks (0.3 s = 6 ticks)
- [x] **Task 2: SMG and Hunting Rifle data** (AC 3, 4) — already in `weapons.json` from Story 1.2; check the values against the AC; tests: SMG fires 12 shots in 1 s (with `cooldownS +=` the 12/s rate is exact over 20 ticks), Hunting Rifle pierces exactly 5 zombies standing in a line and the 6th is untouched, each pierced zombie takes 35 (one shot kills 5 Walkers)
- [x] **Task 3: Screen shake (client)** (AC 4) — on `weapon.fired` for a weapon with `screenShake: true` and the local player: `camera.shake(80 ms, small intensity)`. Respect a `settings.screenShake` flag (default on) in `apps/client/src/settings/settings.ts` (localStorage, try/catch, defaults if storage fails); Story 10.1 builds the Settings screen on top
- [x] **Task 4: Dev loadout picker (client)** (AC 1) — `apps/client/src/debug/LoadoutPicker.tsx`: shown before the run starts (and on Restart), lists `Object.keys(balance.weapons)` as tappable chips (so Machete appears automatically in 1.9), two choices required, **Start** button. Shown only in development builds (`import.meta.env.DEV`); a release build starts with Pistol + nothing. Story 3.3 moves it to the dev cheats
- [x] **Task 5: Swap button and button-first touch routing (client)** (AC 2, 6) — see Dev Notes › Buttons and touch routing
- [x] **Task 6: HUD weapons panel** (AC 5) — bottom-right above the swap button: two slot cards (weapon name, magazine `23 / 40` or `—`), the active one highlighted; a thin progress bar while swapping or reloading
- [x] **Task 7: Verify** — scripts pass; headless touch test: a tap on the swap button swaps after ~0.3 s and no aim stick appears; a drag that starts next to the button spawns the aim stick

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

claude-opus-5-5 (Claude Opus 5.5), via gds-dev-story

### Debug Log References

- Swap tests first assumed 6 ticks from the tap; a swap is the tap tick plus 6 ticks (0.3 s). After returning to an empty magazine, the full 20-tick reload starts on the swap's last tick and that tick counts (reads 19).
- Browser check (Vite dev server, 844×390, touch via CDP):
  - The dev picker lists PISTOL / SMG / HUNTING RIFLE / MACHETE, and the world doesn't step until Start is pressed.
  - With SMG + Hunting Rifle picked, a touch on the ⇄ button shows "▶ SMG Swapping" with a yellow bar, and **no aim stick appears**.
  - 0.3 s later the HUD reads "▶ HUNTING RIFLE 5 / 5" with "SMG 40 / 40" above it.
  - No console errors.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **Implemented:**
  - **Shared:**
    - `setLoadout()`.
    - The swap in `combat/firing.ts` (`updateSwap`). A swap tap with a second weapon starts a `balance.player.swapS` swap, and neither weapon fires during it. Swapping away cancels a reload. When the swap ends on an empty magazine, a full reload starts. Taps during a swap, or with one weapon, are ignored.
    - Ammo is kept per slot.
    - Events `weapon.swap_started` and `weapon.swapped`.
  - **Client:**
    - **Touch routing:** pure `routePointer()` decides button / move / aim, with 4 px tolerance. `HudButtons` is a registry plus pointer ownership: a pointer that starts on a button never reaches the sticks.
    - **Swap button:** 64 px ⇄, inside the safe area, visible only with a second weapon. Swap is edge-triggered through `hudModel.swapPressed`, which `LocalSimHost` latches.
    - **Layout:** `safeArea()` reads the insets through a CSS `env()` probe. HUD health, wave text, weapon panel and swap button all respect the insets. The weapon panel shows the active slot and the other slot, with a reload or swap progress bar.
    - **Screen shake:** heavy weapons shake the camera (`screenShake` in balance). It honours `settings.screenShake`, stored in localStorage with try/catch and defaults.
    - **Dev picker:** `LoadoutPicker` (Preact, dev builds only) picks two weapons from balance, and the run waits until Start.
    - **Sizes:** `ui/sizes.ts` holds the 44 px / 14 px minimums.
- **Notes:**
  - Release builds skip the picker and start with the Pistol (Story 3.3 moves the picker into the dev cheats).
  - The Machete already appears in the picker; Story 1.9 (in progress in parallel) makes it swing.
- **Tests:** 191 passing (+21): swap and slots 7, routePointer 4, HudButtons 2, settings 2, plus existing suites.
- **Verification:** typecheck 0 errors, lint 0 problems, `npm test` 191/191, build ok.

### File List

- `packages/shared/src/combat/loadout.ts` (modified: `setLoadout`)
- `packages/shared/src/combat/firing.ts` (modified: swap)
- `packages/shared/src/combat/swap.test.ts` (new)
- `packages/shared/src/core/simEvents.ts` (modified)
- `packages/shared/src/index.ts` (modified)
- `apps/client/src/input/routePointer.ts` (new)
- `apps/client/src/input/routePointer.test.ts` (new)
- `apps/client/src/input/HudButtons.ts` (new)
- `apps/client/src/input/HudButtons.test.ts` (new)
- `apps/client/src/settings/settings.ts` (new)
- `apps/client/src/settings/settings.test.ts` (new)
- `apps/client/src/ui/sizes.ts` (new)
- `apps/client/src/ui/uiState.ts` (modified: picker screen, `startRun` request with args)
- `apps/client/src/ui/App.tsx` (modified)
- `apps/client/src/ui/overlay.css` (modified)
- `apps/client/src/debug/LoadoutPicker.tsx` (new)
- `apps/client/src/display.ts` (modified: `safeArea()`)
- `apps/client/src/scenes/hudModel.ts` (modified)
- `apps/client/src/scenes/HudScene.ts` (modified: buttons first, swap button, safe areas, two-slot panel)
- `apps/client/src/scenes/GameScene.ts` (modified: picker flow, swap edge, screen shake, other-slot HUD)
- `_bmad-output/implementation-artifacts/1-8-two-weapon-slots-smg-and-hunting-rifle.md` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Senior Developer Review (AI)

- **Date:** 2026-11-21 · **Reviewer:** independent review agent (fresh context; tests, build and sim experiments in a throwaway worktree) · **Outcome:** Approved, no high findings. 1 medium test gap and 6 low findings.
- Confirmed:
  - **Swap:** timing is right, no firing during a swap, and the edge flag fires once per seq.
  - **Cooldown:** swapping can't be used to fire faster.
  - **Touch routing:** a pointer held by a button never reaches the sticks.
  - **Safe areas:** the CSS px → canvas px conversion is right.
  - **Picker:** stripped from release (no "Dev loadout" in `dist`); the world doesn't step before Start.
  - **Screen shake:** local player only and only for heavy weapons; the setting is honoured.
  - **Restart:** no stale HUD state.
- [x] [Low] A swap finished after the player died. Fixed: the swap is cancelled when the player isn't alive. Test added.
- [x] [Low] The reload after swapping to an empty magazine was 1 tick short. Fixed: it now counts from the next tick, like any reload. Test updated (20).
- [x] [Low] The weapon not in hand had a frozen cooldown. Fixed: it keeps cooling down. Test added.
- [x] [Low] The swap progress bar never filled. Fixed: `(total − left + 1) / total`.
- [ ] [Med] The HudScene pointer handlers have no tests. Planned fix: extract them into a pure touch-routing helper with tests. Deferred until Story 1.10 (keyboard/mouse, being built in parallel and editing the same handlers) is merged.
- [ ] [Low] Per-frame `find` closure in `HudButtons.setVisible`, and `safeArea()` (`getComputedStyle`) on every HUD redraw. Planned fix: cache the insets on create/resize and use an indexed loop. Deferred with the item above (same files).
- [Low, accepted] The weapon panel is a highlighted text line plus a grey line rather than "cards", which is fine for dev art (Story 9.7 does the UI art). The Machete was listed in the picker before it could swing; Story 1.9 is now merged.

## Change Log

- 2026-11-21: Addressed code review findings - 4 low items resolved; HUD test helper and safe-area caching deferred until Story 1.10 is merged. 214 tests passing.
- 2026-11-21: Story 1.8 implemented: two slots with a 0.3 s swap, SMG and Hunting Rifle, dev loadout picker, swap button with button-first touch routing, safe areas, two-slot weapon panel, screen shake. 191 tests passing.
