# Story 2.9: Player rings and teammate arrows

Status: done

## Story

As a player,
I want to see who is who and where my teammates are when they're off screen,
so that we can stick together.

## Acceptance Criteria

1. **Rings and names (NFR11).** Each player is drawn with a colored ground ring by slot (blue, orange, green, purple) and their name above them.
2. **Teammate arrows.** When a teammate is outside my camera view, an arrow in their color at the screen edge points toward them. It shows a downed icon if they are down.
3. **Downed pulse.** A downed teammate's marker pulses, whether they are on or off screen, so the revive opportunity is obvious.

## Tasks / Subtasks

- [x] **Task 1: Ring** (AC 1)
  - [x] `render/PlayerView.ts` gets a slot color (`SLOT_COLORS` from `render/playerColors.ts`, Story 2.3) and a ground ring: a stroked circle of radius `radiusM + 0.15` m, line width 0.08 m, alpha 0.9, depth just below the body and above the street and blood.
  - [x] The ring is created once and only moved per frame (no Graphics redraw).
  - [x] Solo mode uses slot 0 (blue).
  - [x] `PlayerView` gets a `setSlot(slot)` method; `GameScene` calls it when a view is created from the 2.4 player map.
- [x] **Task 2: Names** (AC 1)
  - [x] Draw names in **HudScene screen space**, converting world to screen with `hudModel.camX/camY/camZoom` (the same conversion the rush arrows use), so they stay crisp at every zoom.
  - [x] Style: white, bold, ≥ 14 CSS px × dpr, with a 3 px dark stroke for contrast on the rainy night look. Centred 0.9 m above the player's centre.
  - [x] Hide the local player's own name; show a ring only.
  - [x] Use one `Text` per slot, created once. `setText` only when the name changes (Epic 1 lesson: no per-frame string building).
  - [x] Out players have no name (they're not on the map).
- [x] **Task 3: Teammate data for the HUD** (AC 2, 3)
  - [x] `scenes/hudModel.ts` gains:
    - `teammates: Float32Array(MAX_PLAYERS × 2)` (world x, y);
    - `teammateSlot: Int8Array(MAX_PLAYERS)`;
    - `teammateFlags: Uint8Array(MAX_PLAYERS)` (bit 0 downed, bit 1 out);
    - `teammateCount`;
    - `teammateNames: string[]`, written only on change.
  - [x] `GameScene` fills it every frame from `host.world.players`, excluding the local player. Players are interpolated or predicted already.
  - [x] Reset it in `create()` (Story 1.7 lesson: Phaser reuses the scene object on restart).
- [x] **Task 4: Teammate edge arrows** (AC 2, 3)
  - [x] In `HudScene`, reuse the pure `edgeArrow()` from `render/edgeArrow.ts` (Story 1.7, written for this reuse) to place one arrow per off-screen teammate.
  - [x] Look: the same triangle shape as the rush arrows but 1.3× bigger, filled with the slot color, with a 2 px white outline.
  - [x] Use a larger margin than the rush arrows (`ARROW_MARGIN + 12` px) so the two kinds don't overlap at the same edge spot.
  - [x] Downed: a small white "+" cross icon drawn just inside the arrow, toward the screen centre.
  - [x] Out: no arrow.
  - [x] Arrows are rescaled on resize and DPR change, like the rush arrows (Story 1.7 review fix).
- [x] **Task 5: Pulse** (AC 3)
  - [x] `render/pulse.ts`: `pulseScale(timeMs)` returns `1 + 0.25 × (0.5 + 0.5 × sin(2π × timeMs / 800))`, and `pulseAlpha(timeMs)` returns 0.6–1.0 in phase with it.
  - [x] Apply them every frame to a downed teammate's ring (on screen) and arrow (off screen), and to my own ring while I'm downed.
  - [x] Use `scene.time.now`. No tweens are created per frame.
- [x] **Task 6: Pure helper and tests** (AC 2, 3)
  - [x] `render/teammateMarkers.ts`: `teammateMarkers(model, screenW, screenH, margin, out)` returns, per teammate, `{ visible: boolean; x; y; angle; slot; downed }` (out is preallocated). The world-to-screen formula is `(wx − camX) × camZoom` (see `HudScene` rush arrows).
  - [x] Tests:
    - an on-screen teammate gets no arrow;
    - a teammate to the right gets an arrow on the right edge pointing at 0 rad;
    - a downed flag is carried through;
    - an out teammate is skipped;
    - 3 teammates give 3 markers in slot order;
    - `pulseScale` stays between 1 and 1.25.

## Dev Notes

### Scope and prerequisites

- Builds on:
  - 2.3: `SLOT_COLORS`, slots;
  - 2.4: a `PlayerView` per player, schema names in the mirror world, `host.localPlayerId`;
  - 2.8: statuses `downed`/`out` and `DownedView`'s revive ring and countdown.
- Reuses Story 1.7's `edgeArrow` and the camera rectangle published in `hudModel` (`camX`, `camY`, `camZoom`, computed after `centerOn` with the map clamp: Story 1.7 review fix).
- Names and slots are presentation data, so they stay **out of the shared `PlayerState`**. Add `playerInfo(id): { slot: number; name: string }` to `SimHost`:
  - `NetSimHost` answers from the schema copy it keeps (2.4);
  - `LocalSimHost` returns `{ slot: 0, name: "" }`.
- Out of scope:
  - pings and their icons on edge arrows (8.7, which will reuse these arrows);
  - final art for the rings (9.3/9.7);
  - colour-blind options (Epic 10 settings).

### Readability (NFR11)

- The four colours were chosen in 2.3 to differ from each other and from the green-grey zombies. Check them on the placeholder street on a phone, in the 2.10 playtest, and note any complaint.
- The ring sits under the body: in a crowd it is the part that stays visible between zombies. That is why it is a ring, not a body tint.
- Names and arrows in screen space keep their size at every zoom. On a 20:9 phone the view is 24 × 11.09 m (Story 1.3).

### Edge cases

- A teammate exactly on the screen edge: `edgeArrow` returns false (on screen), so the name shows instead. This is covered by a 1.7 test; keep it.
- A teammate far beyond the map edge can't happen (players are clamped). A downed teammate behind the HUD buttons (bottom corners): the arrow draws under the buttons (it is created before them); that is accepted.
- When I am out and spectating, my camera follows the spectate target (2.8). Arrows then point to the other teammates, and the target's name shows normally.

### Project Structure Notes

- New: `apps/client/src/render/{teammateMarkers.ts, teammateMarkers.test.ts, pulse.ts, pulse.test.ts}`
- Modified:
  - `apps/client/src/{render/PlayerView.ts, scenes/GameScene.ts, scenes/HudScene.ts, scenes/hudModel.ts, sim/SimHost.ts (+ playerInfo), sim/LocalSimHost.ts, sim/NetSimHost.ts, render/DownedView.ts (pulse hook)}`
- No shared or server change is expected.

### References

- [Source: epics.md#Story 2.9: Player rings and teammate arrows]
- [Source: gdd.md#Arena and Level Design] / FR55 (colored ground ring per player, edge arrows for off-screen teammates), NFR11
- [Source: 1-7-growing-waves-of-walkers.md] (`edgeArrow` reuse, camera rectangle, resize and restart fixes)
- Phaser 4 notes from Epic 1: tint with `setTint()` + `setTintMode()` (1.4/1.5); a stroked `Arc` is fine for rings: `scene.add.circle(x, y, r).setStrokeStyle(w, color, alpha)` with no fill.

## Dev Agent Record

### Agent Model Used

claude-opus-5-5 (builder agent, worktree `story-2-9`)

### Debug Log References

- Phaser 4 `Triangle`: the points are drawn minus the display origin, which defaults to half the bounding box (`geom.right − geom.left` …), not the point (0, 0). The 1.7 rush-arrow triangle (`a,0 / −0.6a,±0.7a`) was therefore drawn up to ~1.4a up-left of its position and rotated about the wrong pivot. Teammate arrows and the rush arrows now use `.setDisplayOrigin(0, 0)` so they are centred on their edge point and rotate about it.
- Browser check: pages of several Playwright contexts in one Chromium stall `requestAnimationFrame` in the background pages; each player got its own Chromium instance (`--disable-renderer-backgrounding` etc.), and `wait_for_function` uses `polling=200`.
- Base merge: the 2.8 merge failed typecheck (devThrottle key lists, `"dead"` in two tests); merged `claude/epic-2-continue` (e017eb9, the coordinator's fix) as instructed instead of fixing those lines here.

### Completion Notes List

- **Host data (Task 3):** `SimHost.playerInfo(id): PlayerInfo { slot; name }` (presentation data, not in `PlayerState`). `LocalSimHost` returns a frozen `{ slot: 0, name: "" }`; `NetSimHost` answers from `room.state.players` with one reused object (slot from the id via `playerSlotOf` until the schema has the player, 0 for unknown ids). The `NetSimHost.ts` change is that method plus one field.
- **Ring (AC 1, Task 1):** `PlayerView` gets a stroked `Arc` (no fill) of radius `radiusM + 0.15`, width 0.08 m, alpha 0.9, depth 8.5 (above street 0, blood 1, zombies 5, FX 7, shots 8; below the 2.8 revive ring 9 and the body 10, so the revive progress stays readable over a pulsing ring). Created once, moved per frame. `setSlot(slot)` sets the stroke colour from `SLOT_COLORS` (called once when `GameScene` creates the view, from `host.playerInfo(id).slot`; solo = 0, blue). Hidden with the body when out.
- **Names (AC 1, Task 2):** in HudScene screen space, one `Text` per slot created once (bold white, 14 CSS px × dpr, 3 px × dpr dark stroke, origin centre), placed at `(wx − camX) × camZoom`, `NAME_LIFT_M` = 0.9 m above the centre. `setText` only when the slot's name changes; font size and stroke rescale on resize. The local player is never in the teammate list, so no own name. Out players have no tag. A downed teammate's tag is lifted above the 2.8 countdown when the two would overlap (countdown lift moved from `GameScene` to `hudModel.COUNTDOWN_LIFT_M` so both scenes share it).
- **HUD model (Task 3):** `teammates` (Float32 x/y), `teammateSlot` (Int8), `teammateFlags` (Uint8, `TEAMMATE_DOWNED` = 1, `TEAMMATE_OUT` = 2), `teammateCount`, `teammateNames` (indexed **by slot**, assigned only on change). `GameScene.updateTeammates` fills it every frame with a module-level-style bound callback (no allocation) from the drawn `PlayerView` positions (interpolated/predicted), excluding `localPlayerId`; empty once `teamWiped` (Results are up). The whole model is reset in `create()` (existing `Object.assign(createHudModel())`), the HUD's shown names in `init()`.
- **Arrows (AC 2, Task 4):** pure `render/teammateMarkers.ts` (`teammateMarkers(model, w, h, margin, out)` → count; one marker per non-out teammate in slot order with `visible` = arrow shown, `x, y, angle` from `edgeArrow`, `slot`, `downed`, plus the teammate's screen `sx, sy` for the tag). HudScene: one triangle per slot, rush shape × 1.3, slot-colour fill, 2 px × dpr white outline, margin `ARROW_MARGIN + 12` px × dpr; a white "+" (one Graphics per slot, drawn once around its origin) 20 CSS px inside the arrow toward the screen centre when downed; out → nothing. Arrow and cross scale = `dpr() / arrowDpr` (× pulse) set every frame, so resize/DPR changes rescale them.
- **Pulse (AC 3, Task 5):** `render/pulse.ts` `pulseScale` (1–1.25, 800 ms) and `pulseAlpha` (0.6–1.0, in phase) of `scene.time.now`; applied to a downed player's ring in `PlayerView.update` (teammates on screen and my own ring while I'm downed) and to a downed teammate's arrow and cross. No tweens.
- **Tests (Task 6):** `teammateMarkers.test.ts` (6: on screen → no arrow + screen pos; right → right edge at 0 rad; downed carried; out skipped; 3 teammates → 3 markers in slot order with left/below angles; solo → 0), `pulse.test.ts` (2: bounds over 3 periods; peak/trough/phase), `sim/playerInfo.test.ts` (2: NetSimHost from schema, id fallback, unknown id; LocalSimHost slot 0 / ""). `npm test` 676 passed, 3 skipped; `npm run typecheck`, `npm run lint`, `npm run build` pass.
- **Browser check (Python Playwright + Chromium, 844×390 at DPR 2, server PORT=3567, Vite 6073 via a temporary merged config with an `/api` proxy, deleted afterwards):**
  - Solo `/?solo&loadout=pistol,smg`: blue ring under the survivor, no name, no arrows (`solo-blue-ring.png`).
  - Online, 3 players (Ana host p0, Bo p1, Cy p2, each in its own Chromium): rings blue/orange/green on every page (stroke colours read back `3d8bff`/`ff8a1f`/`34c759`), names over the two teammates and never over yourself (`online-start-{ana,bo,cy}.png`). Bo held D ~3.6 s, Cy S 0.6 s: on Ana's page Bo's tag hides and an orange arrow sits on the right edge at 0 rad (`online-arrow-ana.png`); on Bo's page blue and green arrows on the left edge point back (`online-arrow-bo.png`).
  - Downed: in Ana's page only, Bo's and Cy's `status` in her client-side schema copy were set to "downed" (the server doesn't rewrite an unchanged field), driving the real mirror → HUD path: Bo's off-screen arrow gets the "+" and pulses (scale 1.0 → 1.13 → 1.22, alpha 0.6 → 0.81 → 0.95 over the samples), Cy's ring pulses on screen with the same values and his tag moves above the "14 s" countdown (`online-downed-pulse-{1,2}.png`, `online-downed-zoom.png`). After a resize to 740×360 the arrows re-place on the new edges (`online-resized-ana.png`). In an earlier run without the damage tweak, Ana really went down: her own ring pulsed (scale 1.003 → 1.026), and after the real team wipe the teammate list emptied (no names/arrows under Results). No page errors.
  - **Test setup:** Walker damage was set to 0.001 locally (server and client, so the balance versions matched) so nobody died during the walk-off; reverted before the commit.
- **Not verified:** a teammate really downed by the server *while off screen* (the off-screen downed arrow was driven by the client-side schema poke above; the mirror path is the same, and real downed/own-ring pulse was seen); an actual devicePixelRatio change at runtime (rescale is by `dpr() / arrowDpr` each frame, only a size change was tested); the rush arrows after the display-origin fix in a browser (no rushers during the check); the spectate camera case; real phones / 20:9 / readability on the street (2.10 playtest).
- **Deviations:** `teammateMarkers` returns a count and its markers also carry `sx, sy` (needed for the name tags); `teammateNames` is indexed by slot. `DownedView.ts` is unchanged: the pulse lives on the slot ring in `PlayerView` (the revive ring keeps its progress drawing, drawn above the pulsing ring). The 1.7 rush arrows got the same `setDisplayOrigin(0, 0)` fix (one call) because they share the shape and the edge layout. Found, not fixed: the GameScene rush chevrons (`add.triangle` with negative points) have the same origin offset (drawn ~0.28 m left, 0.17 m up of the intended spot).

### File List

- `apps/client/src/render/teammateMarkers.ts`, `render/teammateMarkers.test.ts`, `render/pulse.ts`, `render/pulse.test.ts`, `sim/playerInfo.test.ts` (new)
- `apps/client/src/render/PlayerView.ts`, `scenes/GameScene.ts`, `scenes/HudScene.ts`, `scenes/hudModel.ts`, `sim/SimHost.ts`, `sim/LocalSimHost.ts`, `sim/NetSimHost.ts` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Senior Developer Review (AI)

- **Date:** 2026-11-22 · **Reviewer:** independent review agent (fresh context; full suite, touched tests 5×, three-page browser check incl. walk-off, resize, a teammate closing their tab, two solo restarts). **Outcome:** every AC met, no high or medium findings. The display-origin fix for Phaser 4 Triangles confirmed against the 4.2.1 renderer source.
- [x] [Low] Rush chevrons above rushing zombies drawn ~0.28 m left / 0.17 m up (same Triangle origin, pre-existing): `.setDisplayOrigin(0, 0)`.
- [x] [Low] The downed "+" touched the arrow at the pulse peak: its inset now scales with the pulse.
- [x] [Low] `teammateCount` could stay stale while the local player is missing: reset before the check.
- [x] [Low] Dev Notes said arrows draw above the HUD buttons; they draw under them. Note corrected.
- Noted: teammates standing close together stack their arrows (8.7 reuses these arrows; spread them then); `getBounds()` of origin-(0,0) Triangles disagrees with what is drawn (harmless: not interactive).

## Change Log

- 2026-11-22: Review fixes (chevron origin, cross inset, teammate count reset, note). Story done.

- 2026-11-22: Story 2.9 implemented: slot-coloured ground rings, teammate name tags in screen space, edge arrows for off-screen teammates with a downed "+", pulsing downed ring/arrow, `SimHost.playerInfo`. Rush arrows centred on their edge point (display origin fix). 676 tests passing.
