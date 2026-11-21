---
baseline_commit: 65ef0b70de773083d970bc829182c13b947b17a4
---

# Story 1.3: Move with a floating stick

Status: done

## Story

As a player,
I want to move my survivor with a joystick that appears under my left thumb,
so that controls feel natural on any phone size.

## Acceptance Criteria

1. **Floating stick.** In landscape on a touch device, touching anywhere on the left half of the screen makes a move stick appear centered where the thumb landed; it disappears when the thumb lifts.
2. **Dead zone and speed.** Below 10% of the stick radius the survivor does not move; from 10% to 100% speed scales linearly up to 4.5 m/s (from balance) in the stick's direction.
3. **Map edges.** On a placeholder street of 48 × 32 m with solid edges, the survivor (radius 0.4 m) stops at an edge and cannot leave the map.
4. **Camera (FR55).** The camera follows the survivor and shows about 24 × 13.5 m of the map, clamped to the map edges.
5. **Multi-touch.** Touches on the left half never trigger anything on the right half; each pointer is tracked separately.

## Tasks / Subtasks

- [x] **Task 1: Player balance** (AC 2, 3)
  - [x] `config/balance/player.json`: `{ "maxHp": 100, "speedMps": 4.5, "radiusM": 0.4, "swapS": 0.3 }` (`swapS` is used by Story 1.8; add it now so the schema is complete)
  - [x] `config/balance/controls.json`: `{ "moveDeadZone": 0.1, "aimDeadZone": 0.3, "aimAssistDeg": 8 }` (Stories 1.5 and 1.6 read the last two; Story 1.12 tunes all three)
  - [x] Extend `balanceSchema.ts`, `loadBalance()` (and the version hash input) with `player` and `controls`; tests for a bad value in each
- [x] **Task 2: Placeholder map** (AC 3)
  - [x] `packages/shared/src/map/placeholderMap.ts`: `export const PLACEHOLDER_MAP: DistrictBounds = { widthM: 48, heightM: 32 }` and `type DistrictBounds`. The World gets `world.map: DistrictBounds` from `createWorld({ ..., map? })` (default `PLACEHOLDER_MAP`). Story 4.1 replaces it with the Tiled Downtown map
- [x] **Task 3: Player state and movement (shared)** (AC 2, 3)
  - [x] `player/player.ts`: `PlayerState` and `addPlayer(world, id, x, y)` (see Dev Notes › Player state). `world.players: Map<string, PlayerState>`
  - [x] `player/movement.ts`: `updatePlayers(world, dtS)`, registered as the `player` system in `core/systems.ts` (see Dev Notes › Movement)
  - [x] `player/movement.test.ts`: full stick → 4.5 m/s; half stick (0.5) → speed per the linear formula; 0.05 → no movement; diagonal vector longer than 1 is clamped; edges stop the survivor at `radius` from the edge on all 4 sides; `prevX/prevY` equal the position before the tick
- [x] **Task 4: Stick math (client, pure)** (AC 1, 2, 5)
  - [x] `apps/client/src/input/stick.ts`: `stickVector(originX, originY, x, y, radiusPx, deadZone)` → `{ x, y, magnitude }` (see Dev Notes › Stick math); pure functions, no Phaser
  - [x] `apps/client/src/input/stick.test.ts`: dead zone → 0; edge → 1; beyond radius → clamped 1; linear rescale between; direction preserved
- [x] **Task 5: Touch controls (client)** (AC 1, 5)
  - [x] `apps/client/src/input/TouchSticks.ts`: tracks pointers by `pointer.id`; a pointer that goes **down** on the left half owns the move stick until it goes **up**, even if it slides into the right half; the right half is reserved for the aim stick (Story 1.5) and is ignored for now. Call `this.input.addPointer(2)` so 3 touches work (Phaser 4 starts with 1 touch pointer + mouse)
  - [x] Draws the stick base (radius `STICK_RADIUS_CSS_PX` = 60 × dpr, 25% white, 2 px ring) and knob (radius 24 × dpr) in the HUD scene; hidden when not touching
  - [x] Produces the move part of `PlayerInput` (`moveX`, `moveY`) each frame; `GameScene` passes the full input to `host.setLocalInput()`
- [x] **Task 6: World view and camera (client)** (AC 3, 4)
  - [x] `GameScene` creates the World with one player `"local"` at the map center; replaces the `tick N` text from Story 1.2
  - [x] Draw the placeholder street: dark asphalt rectangle 48 × 32 m, a 1 m grid of faint lines every 4 m (helps judge speed), lighter 0.5 m border
  - [x] `apps/client/src/render/PlayerView.ts`: survivor = circle radius 0.4 m (light grey) + a short facing tick; position = `lerp(prev, cur, host.alpha)`
  - [x] Camera: world units are meters; `camera.setZoom(pixelsPerMeter)` with `pixelsPerMeter = max(canvasWidth / 24, canvasHeight / 13.5)` (see Dev Notes › Camera); `camera.setBounds(0, 0, 48, 32)`; center on the interpolated survivor each frame (`centerOn`, not `startFollow`, so it uses the interpolated position); recompute zoom on resize
  - [x] `apps/client/src/scenes/HudScene.ts`: launched by `GameScene` (`this.scene.launch("Hud")`), no camera zoom, holds the stick drawings. Later stories add the health bar, wave text, buttons
- [x] **Task 7: Verify** — all scripts pass; headless browser (touch emulation, landscape 844×390) shows the street and survivor; a scripted touch-drag on the left half moves the survivor and the stick appears where the touch started. Real-phone feel is checked in Story 1.12

## Dev Notes

### Scope

- In scope: player state, movement + map-edge clamp, move stick, camera, HUD scene, the placeholder street.
- Out of scope: aim stick and firing (1.5), keyboard (1.10), health bar (1.4), cover/collision objects (4.2), Tiled map (4.1).
- Builds on Story 1.2: `createWorld`, `step`, `SYSTEM_ORDER`, `setInput`, `PlayerInput`, `SimHost.alpha`, `LocalSimHost`, `GameScene`. Read `1-2-shared-simulation-core.md` (Dev Agent Record and File List) and the actual code before starting; follow the names it really used if they differ from this file.

### Player state

```ts
// packages/shared/src/player/player.ts
export type PlayerStatus = "alive" | "dead"; // Story 2.8 adds "downed" | "out"
export interface PlayerState {
  id: string;
  x: number; y: number;          // meters, map origin top-left (0,0), +y down (same as screen)
  prevX: number; prevY: number;  // position at the start of the current tick (for interpolation)
  facingX: number; facingY: number; // unit vector; starts (1, 0)
  hp: number; maxHp: number;
  radiusM: number;
  status: PlayerStatus;
}
```

- Plain object, created by a factory that reads `balance.player` (no inline numbers).
- Coordinates: +y down so world and screen agree; record it in a comment in `placeholderMap.ts`. The horde stream (2.5) quantizes from origin (0,0).

### Movement

```
for each alive player p with input i:
  p.prevX = p.x; p.prevY = p.y
  len = hypot(i.moveX, i.moveY); if len > 1 → scale to 1   // input was normalized + dead-zoned on the client
  p.x += i.moveX * speedMps * dtS; p.y += i.moveY * speedMps * dtS
  clamp x to [r, widthM - r], y to [r, heightM - r]
  if i.aimX/aimY non-zero → facing = normalize(aim) else if moving → facing = normalize(move)
```

- **Prediction safety:** this code runs on the server and (Epic 2) in the client's prediction. Use only `+ - * /`, `Math.hypot`/`Math.sqrt`, `Math.min/max`. **No `Math.sin/cos/atan2`** here: their last bits can differ between V8 (server) and JavaScriptCore (iPhone), which would make prediction drift.
- The dead zone is applied on the client (stick math); the simulation trusts only that the vector length is ≤ 1 (clamped defensively). Story 2.1 validates the range with zod.

### Stick math

```
dx = x - originX; dy = y - originY; d = hypot(dx, dy); m = min(d / radiusPx, 1)
if m < deadZone → { x: 0, y: 0, magnitude: 0 }
scaled = (m - deadZone) / (1 - deadZone)       // 10% → 0, 100% → 1, linear (AC 2)
→ { x: dx / d * scaled, y: dy / d * scaled, magnitude: scaled }
```

- The base stays where the thumb landed (floating, not following). If the thumb goes past the radius, the knob is drawn clamped on the ring.
- Pointer coordinates from Phaser are in canvas pixels (device pixels, because of the DPR-capped canvas from Story 1.1). Compute `STICK_RADIUS = 60 * dpr()` in the same space. Left/right half: `pointer.x < this.scale.width / 2`.

### Camera

- GDD: "the camera shows about 24 × 13.5 m"; the Hunting Rifle note says the screen edge is 12 m away, so 24 m wide is the design anchor. `pixelsPerMeter = max(w / 24, h / 13.5)` means the view is never larger than 24 × 13.5 m: a 16:9 screen shows exactly that; a wider phone (19.5:9) shows 24 m wide and ~11 m tall; a 4:3 tablet shows ~18 × 13.5 m. This also bounds the server's per-client view for the horde stream (Story 2.5).
- Put `VIEW_WIDTH_M = 24` and `VIEW_HEIGHT_M = 13.5` in `packages/shared/src/config/constants.ts` (the server needs them in 2.5).
- Phaser camera zoom with meter units works: draw shapes with meter sizes (0.4). Keep HUD in the separate unzoomed `HudScene`.

### Rendering rules

- Rendering never changes simulation state (architecture boundary 3). `PlayerView` reads `world.players`.
- Interpolate between `prev*` and current with `host.alpha` from Story 1.2.
- No per-frame allocation in `update()` (Client Platform Budgets): reuse objects, no `new` or array literals in the frame loop.

### Testing

- Shared movement tests use `createWorld` + `addPlayer` + `setInput` + `step`, and balance from `loadBalance()`.
- Stick math is pure and unit-tested in node. Touch handling is verified in the headless browser with Playwright touch emulation (`hasTouch: true`, `page.touchscreen` or CDP `Input.dispatchTouchEvent` for drags).

### Project Structure Notes

New: `packages/shared/src/config/balance/{player.json, controls.json}`, `packages/shared/src/map/placeholderMap.ts`, `packages/shared/src/player/{player.ts, movement.ts, movement.test.ts}`, `apps/client/src/input/{stick.ts, stick.test.ts, TouchSticks.ts}`, `apps/client/src/render/PlayerView.ts`, `apps/client/src/scenes/HudScene.ts`.
Modified: `balanceSchema.ts`, `balance.ts` (+ test), `core/systems.ts` (`player` system), `core/world.ts` (`players`, `map`), `config/constants.ts`, `index.ts`, `GameScene.ts`, `main.ts` (register `HudScene`).

### References

- [Source: epics.md#Story 1.3: Move with a floating stick]
- Controls: [Source: gdd.md#Controls and Input]; units and camera: [gdd.md#Weapon Systems] ("Units", Hunting Rifle note)
- [Source: game-architecture.md#Client Platform Budgets], [#Architectural Boundaries], [#Networking] (prediction uses shared movement code)
- Story 1.2 interfaces: [Source: _bmad-output/implementation-artifacts/1-2-shared-simulation-core.md]

## Dev Agent Record

### Agent Model Used

claude-opus-5-5 (Claude Opus 5.5), via gds-dev-story

### Debug Log References

- Browser check (Playwright, `vite preview`, 844×390, `hasTouch`, CDP touch events): a drag starting at (150, 250) shows the stick base there with the knob following; the survivor moves and the camera follows; lifting hides the stick. Holding up-left for 9 s brings the survivor to the top-left corner: it stops at the edge and the camera clamps to the map bounds. No console errors.
- The first border drawing (0.5 m band inside the map) made the survivor look like it stood on the wall in the corner; changed to a 0.1 m line at the edge.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **Implemented:**
  - **Shared:** `player.json` (maxHp, speedMps, radiusM, swapS) and `controls.json` (move/aim dead zones, aim-assist angle) with schemas; `PLACEHOLDER_MAP` 48 × 32 m and `world.map`; `PlayerState` + `addPlayer`; `updatePlayers` as the `player` system (prediction-safe math only: no sin/cos/atan2); `VIEW_WIDTH_M`/`VIEW_HEIGHT_M` constants; players and map added to `snapshotWorld`.
  - **Client:** pure `stickVector` (dead zone with linear rescale); `TouchSticks` state (the left-half pointer owns the move stick until it lifts); `HudScene` (unzoomed, adds 2 extra touch pointers, draws base and knob, resets on blur); `GameScene` (street, `PlayerView` interpolated by alpha, camera zoom `max(w/24, h/13.5)` px/m, bounds, `centerOn` the interpolated survivor, a reused input object with no per-frame allocation).
- **Tests:** 88 passing (+22): movement 9, balance +1, stick math 6, TouchSticks 4, camera 2.
- **Verification:** typecheck 0 errors, lint 0 problems, `npm test` 88/88, build ok.
- **Notes:**
  - Mouse clicks on the canvas currently drive the sticks like touches. That helps desktop testing until Story 1.10 separates mouse from touch.
  - `stickDeflection()` is a helper for Story 1.5 (aim without firing).
  - Real-phone feel is checked in Story 1.12.

### File List

- `packages/shared/src/config/balance/player.json` (new)
- `packages/shared/src/config/balance/controls.json` (new)
- `packages/shared/src/config/balanceSchema.ts` (modified)
- `packages/shared/src/config/balance.ts` (modified)
- `packages/shared/src/config/balance.test.ts` (modified)
- `packages/shared/src/config/constants.ts` (modified: view size)
- `packages/shared/src/map/placeholderMap.ts` (new)
- `packages/shared/src/player/player.ts` (new)
- `packages/shared/src/player/movement.ts` (new)
- `packages/shared/src/player/movement.test.ts` (new)
- `packages/shared/src/core/world.ts` (modified: map, players)
- `packages/shared/src/core/systems.ts` (modified: player system)
- `packages/shared/src/core/worldSnapshot.ts` (modified)
- `packages/shared/src/index.ts` (modified)
- `apps/client/src/input/stick.ts` (new)
- `apps/client/src/input/stick.test.ts` (new)
- `apps/client/src/input/TouchSticks.ts` (new)
- `apps/client/src/input/TouchSticks.test.ts` (new)
- `apps/client/src/render/PlayerView.ts` (new)
- `apps/client/src/render/StreetView.ts` (new)
- `apps/client/src/render/camera.ts` (new)
- `apps/client/src/render/camera.test.ts` (new)
- `apps/client/src/scenes/HudScene.ts` (new)
- `apps/client/src/scenes/GameScene.ts` (modified)
- `apps/client/src/main.ts` (modified: registers HudScene, `input.activePointers: 3`)
- `_bmad-output/implementation-artifacts/1-3-move-with-a-floating-stick.md` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Senior Developer Review (AI)

- **Date:** 2026-11-21 · **Reviewer:** independent review agent (fresh context, with its own Playwright multi-touch run at DPR 2) · **Outcome:** Approved with 2 low findings, both addressed
- Confirmed: AC 1–5 in the browser. Specifically:
  - the stick origin uses DPR-correct canvas space;
  - top speed measured ≈ 4.5 m/s;
  - the survivor stops at the corner (0.4, 0.4);
  - the view measures 24 × 11.09 m on a 20:9 phone, 18 × 13.5 m on 4:3 and 13.5 × 13.5 m on 1:1;
  - a right-half touch never affects the move stick;
  - touchcancel and blur reset the stick, and listener counts stay flat across restarts.
- [x] [Low] `HudScene` called `addPointer(2)` on every restart, so touch pointers grew 3 → 5 → 7 … (up to Phaser's cap of 10). Fixed: the game config now sets `input.activePointers: 3` once in `main.ts`, and the per-restart call is gone.
- [x] [Low] Test gap: added tests for `TouchSticks.reset()` (later events from the old pointer are ignored) and for move/up events with no active stick. A Playwright smoke test of the Phaser wiring needs a debug hook to reach the game; it is deferred to Story 1.11, which adds the debug overlay and hooks.

## Change Log

- 2026-11-21: Addressed code review findings - 2 low items resolved. 90 tests passing.
- 2026-11-21: Story 1.3 implemented: player movement and map edges (shared), floating move stick, camera 24 × 13.5 m, HUD scene, placeholder street. 88 tests passing.
