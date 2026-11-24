# Story 5.19: Thumb drag to nudge and pin

Status: review

(Building UX rework BX-5. Design: `docs/ideas/building-ux/ux-spec.md` §4 (sizes: item chip 160 × 32, reason line above it), §5 (drag start > 8 px, gain 1.0, 0.1 m snap hysteresis), §6.2 Drag / pin, §6.3 (chain jump "toward the side the last drag went"), §15 (designer: **B · Carry + drag**, **no camera lead**), `draft-stories.md` › BX-5, feel: `prototype.html` › B · Carry + drag (`dragBy`, the chip) / claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR. Spine-wins rule: where the spec and the prototype disagree, the spec wins. Builds on 5.15 (`stepPlacement`, carry, hand cluster, the claimed right-half pointer), 5.16 (build bar), 5.17 (reason line, 250 ms hold, culprit) and 5.18 (chain, pending, `pendingFlow.ts › runPendingFrame`, the minimal pin). **Client-only: no message, schema or server change.**

Main-session / designer decisions for this story (2026-11-23): **(a)** 5.19 builds the **"item in hand" chip** the ux-spec describes (160 × 32 CSS px, the reason line sits above it; it shows the held item, its price and the pin state) — no earlier story built it. **(b)** 5.19's pin **replaces 5.18's temporary "back to carry after a 2 m walk" rule** (5.18 D3 / Notes for the merge); the "leaves the view" rule stays (it is the spec's). 5.18's tests are updated. **(c)** 5.18's Q1 polish (the chain ghost back in hand sitting red on the just-placed barricade) stays for **Story 5.23**.)

## Story

As a player,
I want to nudge the ghost with my right thumb without covering it,
so that the last half-metre is easy.

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
> 20. (added 2026-11-23, Story 4.13) Every texture drawn in code is created through addGeneratedTexture with a redraw callback (Android Chrome wipes canvases while the app is in the background); test that it redraws after a simulated context loss.
> ```
>
> Most relevant here: **2** (no sim copy is touched: the drag moves the client's ghost; the request is the unchanged `building.place` judged by the unchanged `placementError`), **3/4** (fairness ACs 9–11 and "Beat the rule"), **9** (mutate each new test once), **10** (no allocation per frame: the drag tracker and the chip text are reused/cached; `dragGain` and `dragStartPx` in `controls.json`), **17** (Phaser 4: `Text.setScale`, `Graphics.strokeRoundedRect` checked in `node_modules/phaser/types`), **20** (no new texture: the chip is Graphics + Text). Lines 5–8, 11–16 have nothing to act on (client-only input/HUD, no new object, effect, message or sim change; 0 B/s added).

## Acceptance Criteria

1. **Drag starts the pin.** While I'm holding a building, a touch on the **right half** that **didn't start on a HUD button** and has travelled **more than `controls.build.dragStartPx` = 8 CSS px** from where it went down **pins** the ghost. A mouse press that misses the HUD buttons does the same (desktop; BX-11 adds the absolute cursor). A touch that started on a button (Place, ⟳, ✕, the chip, a build-bar tile that just started the hold) never drags.
2. **Relative, gain 1.0, no jump.** From the moment the threshold is crossed, the ghost moves by the finger's movement × **`controls.build.dragGain` = 1.0** in world metres (finger canvas px ÷ the camera's px per metre): at gain 1.0 the ghost follows the finger 1:1 on screen, **offset from it, never jumping under it**; the first 8 px are a dead zone and do not move it.
3. **Snap with hysteresis.** The dragged ghost keeps a continuous position; its min corner is snapped to the 0.5 m lattice with **0.1 m hysteresis** (`snapHysteresisM`, the same `snapAxis` as the carry): a finger resting on a lattice boundary never makes the ghost jitter.
4. **The left stick keeps working.** The move stick moves my survivor while the right thumb drags (walk and nudge at once); the input sent while holding stays `holdBuildingInput` (movement kept, **no aim, no fire**: a right-half drag never aims or shoots).
5. **Pinned = stays in the world.** A pinned ghost stays put while I walk (no 2 m walk-away rule any more: decision (b)); ⟳ turns it 90° around its own centre and keeps it pinned (5.18). It goes back to carry when (i) I tap the chip's **"↩ carry"**, or (ii) its centre leaves the camera view shrunk by 1 m (`PIN_VIEW_INSET_M`), or (iii) the chain jump is blocked (5.18, unchanged).
6. **Clamped to the view.** A drag never takes the ghost's centre closer than **1 m** to the view's edges; the snapped spot is kept inside too, so a drag never triggers the view rule of AC 5 (ii) by itself.
7. **The item chip** (decision (a); ux-spec §4): while holding, a **160 × 32 CSS px** chip (≥ 14 px text) right-aligned **16 px** inside the right safe-area edge, just above ✕, with the **reason line above it**. Carrying: **"{name} · ${price} · ×{n} left"** (n = how many more the **shown** wallet and the cap allow: `min(cap − owned − pending, ⌊shownWallet / price⌋)`, ≥ 0) with a faint white border. Pinned: **"↩ carry · {name}"** with an **orange border**; tapping it carries the ghost again. Long text shrinks to fit the chip (never overflows). On a short screen where the stack (✕ → chip → reason line) would reach the ☰ button, the chip moves **left of ✕ on ✕'s row** (12 px gap) and the reason line keeps its 5.17 spot above ✕ (D7).
8. **Chain direction follows the drag** (ux-spec §6.3): after a Place, the next ghost jumps (5.18) **toward the side the last drag went** along the jump axis; with no drag in this hold, or a last drag square to that axis, the right of my facing (5.18's default).
9. **Fairness — dragging changes nothing the server judges.** The spot sent is the spot shown (5.15 AC 10: Place sends the spot drawn in the last frame, before this frame's drag/carry); the server's `placementError` is unchanged; the drag can't move a ghost anywhere the carry couldn't already reach that the server would accept (off-map / spawn circle / wall / teammate / bus ghosts are red with 5.17's reason and are refused by the server if Place is pressed anyway).
10. **Fairness — no camera lead** (designer, §15 #4): the camera stays on my survivor; dragging never pans the view or reveals more of the map.
11. **Fairness — the right thumb can't shoot.** In a build phase while holding, no right-half touch reaches the aim stick (5.15), so a drag can't fire or aim, and nothing spawns or swaps; HUD buttons keep winning over the drag.
12. **Numbers (brief 10).** `controls.json › build`: **`dragGain` 1.0** (zod 0.25–3) and **`dragStartPx` 8** (int 2–40, CSS px), with defaults so older fixtures load. `chainUnpinWalkM` is **removed** (decision (b)). `?tune=1` exposes both as "Build drag gain" and "Build drag start (px)" (as the stick radius today).
13. **Tests:** `thumbDrag.test.ts` (threshold in CSS px × dpr, no motion before it, deltas counted from the crossing, a button-owned pointer never drags, a second pointer ignored, release); `placement.test.ts` (relative drag pins and moves by delta × gain / px-per-m, snap hysteresis on a resting finger, view clamp keeps the snapped centre inside, chip unpin, no walk-away unpin any more (5.18 test updated), chain toward the last drag side and the facing default, drag + walk at once, ⟳ while pinned after a drag); `handCluster.test.ts` (chip 160 × 32 at the right edge 16 px above ✕ with the reason line above it at 800 × 360; the short-screen row at 568 × 320; nothing overlaps ☰, Place, ⟳, ✕); `chipText` cache test; `balance.test.ts` (defaults/bounds; `chainUnpinWalkM` gone); `tuning.test.ts` (the two knobs reach `controls.build`). Browser check (Playwright + preinstalled Chromium, CDP touch) at 800 × 360 and 568 × 320: a drag > 8 px pins and moves the ghost by the finger delta (never under the finger), snap hysteresis, the chip ("↩ carry", tap → carry), the move stick works during a drag, a right-half tap on a button isn't a drag. Screenshots in `docs/art/5-19/`.

## Beat the rule (reviewer: try each, record the result)

| # | Attempt | Expected result |
| --- | --- | --- |
| B1 | Drag the ghost onto a spawn's 2 m circle / onto the bus / past the map edge | Red with 5.17's reason; Place sends anyway and the server refuses (`blocked`); nothing charged |
| B2 | Drag the ghost far away to build outside the view | Clamped 1 m inside the view; it never leaves the screen by dragging |
| B3 | Drag while pressing Place in the same frame | Place sends the spot shown last frame; the drag moves the chain's next ghost |
| B4 | Drag on the right half to shoot zombies during a build | Nothing fires or aims (`holdBuildingInput`); no zombies in a build anyway |
| B5 | Tap Place / ⟳ / ✕ / the chip and slide the finger | The button is pressed once; no drag, the ghost doesn't move |
| B6 | Pin, then walk across the map | The ghost stays until its centre leaves the view (1 m inset), then it's carried again |
| B7 | Rest the finger on a lattice boundary and tremble ±0.05 m | The ghost doesn't flicker between two spots (0.1 m hysteresis) |
| B8 | Drag with two fingers on the right half | Only the first claimed pointer drags; the second does nothing |
| B9 | Under `?lag=150`, drag and place fast | The spot sent = the spot shown at the press (pending box there) |

## Tasks / Subtasks

- [x] **T1 Numbers.** `controls.json` + `buildControlsSchema`: `dragGain`, `dragStartPx` (after `barQuietMs`); remove `chainUnpinWalkM`; `balance.test.ts`.
- [x] **T2 `input/thumbDrag.ts`** (Phaser-free): one claimed pointer, threshold in canvas px, accumulated deltas since the crossing (`take`), `started` edge; tests.
- [x] **T3 Placement drag + pin** (`placement.ts`): `drag(dxM, dyM, view)` (pin, continuous position, gain, view clamp, snap hysteresis), last-drag side, `chainOffset` side preference, walk-away rule removed; `PlacementHud` gains `dragDxPx`, `dragDyPx`, `chipPressed`, `placementPinned`; `PlacementFrame` gains `pxPerM`; tests (5.18's walk test updated).
- [x] **T4 Chip layout** (`handCluster.ts`, `sizes.ts`): chip rect + reason anchor above it, short-screen row; tests.
- [x] **T5 HUD + scene wiring**: HudScene's claimed pointer → `ThumbDrag` → model; chip Graphics + Text + HudButton; GameScene `placementChip` text cache (`chipText.ts`), px per metre, the drag start px; tests.
- [x] **T6 `?tune=1`** knobs; `tuning.test.ts`.
- [x] **T7 Browser check** (own Vite port, solo `?wallet=5000`, CDP touch) at 800 × 360 and 568 × 320; screenshots `docs/art/5-19/`.
- [x] **T8 Gate + mutations + record.**

## Dev Notes

### Decisions (taken here, recommended values; the ux-spec already decided everything else)

- **D1 The drag counts from the threshold crossing** (prototype `dragBy`: `lx` reset at the crossing). The first 8 px are a dead zone that tells a tap from a drag; counting them would make the ghost jump 8 px at the crossing.
- **D2 A mouse press-drag pins too** (it reuses 5.15's claimed pointer). Harmless and testable on desktop; BX-11 (5.25, optional) adds the absolute cursor-follow.
- **D3 The view clamp works on the continuous centre, then the snapped index is stepped inward** (at most a few steps) if rounding put the snapped centre outside the 1 m inset — otherwise a drag to the edge would unpin itself on the next frame by AC 5 (ii).
- **D4 The dragged ghost keeps a continuous centre** (`dragCx/dragCy`), reset to the snapped centre whenever it is pinned anew (drag start, chain jump, ⟳ around the centre); the min corner is snapped from it with `snapAxis` + hysteresis (the carry's code path).
- **D5 `chainUnpinWalkM` is removed** (decision (b)), not set to 0: the schema is `.strict()` and no fixture lists it; one less dead knob.
- **D6 Last drag side**: the sign of the most recent non-zero drag delta on each axis, kept for the whole hold (also across chain jumps, so a wall keeps growing the way I nudged it). `chainOffset` takes it as a preference for the jump axis's sign; 0 → the right of my facing (5.18). Square footprints keep 5.18's axis choice (nearest to the right of facing).
- **D7 Chip position**: ✕'s top + **8 px** gap → chip (32 px) → **6 px** → the reason line (spec: chip bottom 250, reason ≈ 280; with ✕'s top at 220 that is 30 px of air, and it would push the reason line into ☰ even at 360 px tall). If the reason line's top would come within **4 px** of ☰'s bottom (`MENU_BUTTON_INSET + MENU_BUTTON + insets.top`), the chip goes left of ✕ on ✕'s row (right edge 12 px left of ✕'s left edge, centred on ✕) and the reason line stays where 5.17 put it. 800 × 360 → stacked; 568 × 320 → row (`handCluster.test.ts`).
- **D8 Chip text** = `{name} · ${price} · ×{n} left` / `↩ carry · {name}` (prototype; the ux-spec's example "Turret · $250 · ×1 left"); 14 px bold, shrunk with `setScale` to the inner width (8 px padding each side) only when the text changes. Built in GameScene from a key (type, price, n, pinned) so no string is made per frame.
- **D9 Number names**: the AC's `buildDragGain` / `buildDragStartPx` live in the `build` block as `dragGain` / `dragStartPx` (`controls.build.dragGain`), next to 5.15–5.18's numbers.
- **D10 Drag delta → metres** with the main camera's zoom (canvas px per metre: `pixelsPerMeter`); the HUD scene is unzoomed canvas px, so gain 1.0 = 1:1 on screen.

### Current state (read before changing)

- `client/scenes/placement.ts`: `Placement` (carry; ⟳; `pinned` set by `chain`; `carry` returns early when pinned unless the 2 m walk rule unpins; `outsideView`; `chain` uses `chainOffset(…facing…)`), `stepPlacement` (cancel rules → hold input → ✕ → Place (gate, send, chain) → view unpin → ⟳ → carry → check → explain → HUD).
- `client/scenes/HudScene.ts`: while `placementActive`, a left-half touch goes to the sticks; anything else that misses the buttons is stored in `placePointer` and does nothing (5.15: "BX-5 drags with it"). Hand cluster: `layoutHandCluster` (Place, ⟳, ✕, hint anchor above ✕), `drawPlacement` (on change only).
- `client/scenes/GameScene.ts`: `updatePlacement` fills `placeFrame` (view rect from `cameras.main.worldView`) and calls `stepPlacement`; `shownWallet()`; `this.pending` (5.18).
- `client/debug/tuning.ts`: knobs → `withOverrides` paths.

### Copies touched (brief line 2)

None of the sim copies. `controls.json` gains two client-read numbers and loses one (`balance.version` changes with the JSON; client and server ship the same file).

### Must be preserved

5.15's carry, hold input, the claimed right half, Place = the spot shown last frame; 5.16's bar; 5.17's reason, hold, culprit (the reason line moves up above the chip but keeps its text/colour logic); 5.18's chain, pending, Place gate, view rule, ⟳ around the centre; every existing test (5.18's walk-away test is rewritten to the new rule).

### References

- `docs/ideas/building-ux/ux-spec.md` §4, §5, §6.2, §6.3, §15; `draft-stories.md` BX-5; `prototype.html` (`dragBy`, chip); `epics.md` › Story 5.19; story files 5-15 (D2), 5-17 (L5), 5-18 (D3, Notes for the merge).

## Notes for the merge (brief line 19)

- `controls.json` / `balanceSchema.ts › buildControlsSchema`: `dragGain`, `dragStartPx` added after `barQuietMs`; `chainUnpinWalkM` removed (default object updated).
- `scenes/placement.ts`: `PlacementHud` gains `dragDxPx`, `dragDyPx`, `dragged`, `chipPressed`, `placementPinned`; `PlacementFrame` gains `pxPerM`; `Placement` gains `drag()`, `lastDragX/Y`; `chainOffset` gains an optional side preference. **5.20 (undo) / 5.22 (move)**: a picked-up building starts pinned (`Placement.pinAt`-style) and reuses `drag()`.
- `scenes/handCluster.ts`: `HandLayout` gains `chip` (rect) and `chipRow` (short-screen layout); the hint anchor now sits above the chip. **5.20**'s undo chip ↶ (270, 64) doesn't collide with either chip spot.
- `scenes/hudModel.ts`: `placementChip`, `placementPinned`, `dragDxPx`, `dragDyPx`, `dragged`, `chipPressed`, `dragStartPx`.
- `scenes/HudScene.ts`: 5.15's `placePointer` is replaced by `ThumbDrag` (`drag.pointerId`); the chip is HudButton `placeChip` (visible only while holding).
- **5.23**: still owns 5.18 Q1 (the chain ghost back in hand red on the last box).

## Dev Agent Record

### Agent Model Used

Claude (builder cloud session, gds-create-story → gds-dev-story).

### Debug Log References

- Touched-area tests while building: `balance.test.ts`, `thumbDrag.test.ts`, `placement.test.ts`, `handCluster.test.ts`, `chipText.test.ts`, `tuning.test.ts`, then `apps/client/src/{debug,scenes,input,sim}` + `packages/shared/src/config` (53 files, 436 tests).
- **Full gate (once, at the end):** `npm run typecheck && npm run lint && npm test && npm run build` → exit 0; **274 test files passed, 1 skipped; 2278 tests passed, 3 skipped**; build OK. Load average 1.0 at the start, 3.4 at the end (4-core container, this builder alone).
- Browser: own Vite on port 5319 (stopped by PID), headless Chromium with mobile emulation and CDP touch; script in the session scratchpad; numbers in `docs/art/5-19/README.md`. The first run started the 568 × 320 drag on the chip itself (row layout) — a test-position mistake, not a bug: the chip took the touch as a button press and nothing dragged, as AC 1 says. Moved the drag start above it.

### Completion Notes List

- **Drag** (`input/thumbDrag.ts`): HudScene's claimed pointer (5.15) goes to `ThumbDrag`; past `dragStartPx` × dpr it is a drag and its movement since the crossing piles up into `hudModel.dragDxPx/Py` + `dragged` (no jump, D1). One thumb drags; buttons always win (they claim the pointer first).
- **Pin + nudge** (`Placement.drag`): pins where the ghost is shown, keeps a continuous centre (D4), moves it by delta ÷ camera zoom × `dragGain`, clamps the centre 1 m inside the view and steps the snapped spot back in after rounding (D3), snaps with the carry's 0.1 m hysteresis. `stepPlacement` order: cancel rules → hold input → ✕ → Place (spot from the last frame) → **chip unpins** → view unpin → ⟳ → carry → **drag** → check → explain → HUD (`placementPinned`).
- **Decision (b)**: the 2 m walk-away rule and `controls.build.chainUnpinWalkM` are removed; 5.18's test rewritten (walk 8 m: still pinned; the view rule still unpins).
- **Chain toward the last drag** (`chainOffset(…, sideX, sideY)`, `Placement.lastDragX/Y`, reset per hold).
- **Item chip** (decision (a)): `handCluster.ts` chip rect (stacked above ✕ with the reason line above it; short-screen row left of ✕ when the reason line would reach ☰, D7), HudScene panel + text (shrunk to fit, redrawn on change only) + HudButton `placeChip`; GameScene builds the text through `ChipText` (cached) with `chipLeft` (cap − owned − pending, shown wallet ÷ price).
- **Numbers**: `controls.build.dragGain` 1.0, `dragStartPx` 8 (zod bounds + defaults); `?tune=1` knobs "Build drag gain", "Build drag start (px)".
- **Mutations (brief 9)**, one per new test area, all **17 killed**: drag counted from the touch-down; threshold inclusive; gain ignored; drag snap without hysteresis; no step back inside the view; no view clamp; chip doesn't unpin; chain ignores the drag side; drag applied without the flag; pinned ghost carried while walking; new hold keeps the drag side; no short-screen chip row; chip ignores the top inset; chip text ignores pinned; `chipLeft` ignores pending; tuning drops the gain override; `dragStartPx` not an int.
- **Brief lines**: 2 — no sim copy touched (World, schema, syncState, state views, mirror, Predictor, devThrottle, snapshotWorld, server unchanged); 10 — no allocation per frame (one `ThumbDrag`, one scratch `{dx, dy}`, the chip string cached by key, layout written into reused objects); 17 — Phaser 4 `Graphics.fillRoundedRect/strokeRoundedRect`, `Text.setScale` / `width` (unscaled) used as in the existing HUD; 20 — no new texture. 0 B/s added.
- **Not verified**: a real phone (thumb size, Android back-swipe at the right edge, the row chip's position at 568 px under a real thumb); online under `?lag=150` in the browser (client-only; the spot sent is unit-tested and 5.18's pending path is unchanged); a desktop mouse press-drag in a real browser (same code path as touch).
- **For the designer (open question)**: on short screens (≤ ~355 px tall) the ux-spec's stack "chip above ✕, reason line above the chip" reaches ☰, so the chip moves left of ✕ (D7). It then sits close to the screen centre on a 568 px-wide phone, in the area a thumb drags from (a drag that starts on the chip is a chip tap). Alternative if the designer prefers: a narrower chip (e.g. 120 px, name only) on short screens.

### File List

- `_bmad-output/implementation-artifacts/5-19-thumb-drag-to-nudge-and-pin.md` (new), `sprint-status.yaml`
- `packages/shared/src/config/balance/controls.json`, `balanceSchema.ts`, `balance.test.ts`
- `apps/client/src/input/thumbDrag.ts` (new), `thumbDrag.test.ts` (new)
- `apps/client/src/scenes/placement.ts`, `placement.test.ts`, `handCluster.ts`, `handCluster.test.ts`, `chipText.ts` (new), `chipText.test.ts` (new), `hudModel.ts`, `HudScene.ts`, `GameScene.ts`
- `apps/client/src/sim/NetSimHost.chain.test.ts` (the `PlacementHud` literal gains the new fields)
- `apps/client/src/ui/sizes.ts`
- `apps/client/src/debug/tuning.ts`, `tuning.test.ts`
- `docs/art/5-19/` (10 screenshots + README)

### Change Log

- 2026-11-24: Story file created (gds-create-story) and built (gds-dev-story): thumb drag, pin, chip, chain toward the drag, walk-away rule removed; gate green; browser check at 800 × 360 and 568 × 320. Status → review.
