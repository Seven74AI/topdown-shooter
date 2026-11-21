# Story 2.9: Player rings and teammate arrows

Status: ready-for-dev

## Story

As a player,
I want to see who is who and where my teammates are when they're off screen,
so that we can stick together.

## Acceptance Criteria

1. **Rings and names (NFR11).** Each player is drawn with a colored ground ring by slot (blue, orange, green, purple) and their name above them.
2. **Teammate arrows.** When a teammate is outside my camera view, an arrow in their color at the screen edge points toward them. It shows a downed icon if they are down.
3. **Downed pulse.** A downed teammate's marker pulses, whether they are on or off screen, so the revive opportunity is obvious.

## Tasks / Subtasks

- [ ] **Task 1: Ring** (AC 1)
  - [ ] `render/PlayerView.ts` gets a slot color (`SLOT_COLORS` from `render/playerColors.ts`, Story 2.3) and a ground ring: a stroked circle of radius `radiusM + 0.15` m, line width 0.08 m, alpha 0.9, depth just below the body and above the street and blood.
  - [ ] The ring is created once and only moved per frame (no Graphics redraw).
  - [ ] Solo mode uses slot 0 (blue).
  - [ ] `PlayerView` gets a `setSlot(slot)` method; `GameScene` calls it when a view is created from the 2.4 player map.
- [ ] **Task 2: Names** (AC 1)
  - [ ] Draw names in **HudScene screen space**, converting world to screen with `hudModel.camX/camY/camZoom` (the same conversion the rush arrows use), so they stay crisp at every zoom.
  - [ ] Style: white, bold, ≥ 14 CSS px × dpr, with a 3 px dark stroke for contrast on the rainy night look. Centred 0.9 m above the player's centre.
  - [ ] Hide the local player's own name; show a ring only.
  - [ ] Use one `Text` per slot, created once. `setText` only when the name changes (Epic 1 lesson: no per-frame string building).
  - [ ] Out players have no name (they're not on the map).
- [ ] **Task 3: Teammate data for the HUD** (AC 2, 3)
  - [ ] `scenes/hudModel.ts` gains:
    - `teammates: Float32Array(MAX_PLAYERS × 2)` (world x, y);
    - `teammateSlot: Int8Array(MAX_PLAYERS)`;
    - `teammateFlags: Uint8Array(MAX_PLAYERS)` (bit 0 downed, bit 1 out);
    - `teammateCount`;
    - `teammateNames: string[]`, written only on change.
  - [ ] `GameScene` fills it every frame from `host.world.players`, excluding the local player. Players are interpolated or predicted already.
  - [ ] Reset it in `create()` (Story 1.7 lesson: Phaser reuses the scene object on restart).
- [ ] **Task 4: Teammate edge arrows** (AC 2, 3)
  - [ ] In `HudScene`, reuse the pure `edgeArrow()` from `render/edgeArrow.ts` (Story 1.7, written for this reuse) to place one arrow per off-screen teammate.
  - [ ] Look: the same triangle shape as the rush arrows but 1.3× bigger, filled with the slot color, with a 2 px white outline.
  - [ ] Use a larger margin than the rush arrows (`ARROW_MARGIN + 12` px) so the two kinds don't overlap at the same edge spot.
  - [ ] Downed: a small white "+" cross icon drawn just inside the arrow, toward the screen centre.
  - [ ] Out: no arrow.
  - [ ] Arrows are rescaled on resize and DPR change, like the rush arrows (Story 1.7 review fix).
- [ ] **Task 5: Pulse** (AC 3)
  - [ ] `render/pulse.ts`: `pulseScale(timeMs)` returns `1 + 0.25 × (0.5 + 0.5 × sin(2π × timeMs / 800))`, and `pulseAlpha(timeMs)` returns 0.6–1.0 in phase with it.
  - [ ] Apply them every frame to a downed teammate's ring (on screen) and arrow (off screen), and to my own ring while I'm downed.
  - [ ] Use `scene.time.now`. No tweens are created per frame.
- [ ] **Task 6: Pure helper and tests** (AC 2, 3)
  - [ ] `render/teammateMarkers.ts`: `teammateMarkers(model, screenW, screenH, margin, out)` returns, per teammate, `{ visible: boolean; x; y; angle; slot; downed }` (out is preallocated). The world-to-screen formula is `(wx − camX) × camZoom` (see `HudScene` rush arrows).
  - [ ] Tests:
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
- A teammate far beyond the map edge can't happen (players are clamped). A downed teammate behind the HUD buttons (bottom corners): the arrow still draws above the buttons; that is accepted.
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

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
