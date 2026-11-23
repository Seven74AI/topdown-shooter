# Story 5.15: Carry the ghost and keep moving

Status: done

(Building UX rework BX-1. Design: `docs/ideas/building-ux/ux-spec.md` (designer decisions §15: **B · Carry + drag**), `draft-stories.md` › BX-1, feel: `prototype.html` / claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR. Spine-wins rule: where the spec and the prototype disagree, the spec wins.)

## Story

As a player,
I want to keep walking while I hold a building,
so that I can put it exactly where I'm standing instead of freezing and tapping.

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
> Most relevant here: **2** (nothing new is simulated: the server judges with the unchanged `placementError`; the input sent while holding is ordinary movement, so the Predictor/mirror path is today's), **3/4** (fairness ACs 9–11 and "Beat the rule"), **10** (the carry runs every frame: no allocation, numbers in `controls.json`), **14** (place while running under `?lag=150&jitter=20`: the spot sent is the spot drawn), **17** (Phaser 4 Graphics/Text APIs), **20** (no new textures: the lock badge and buttons are Graphics + Text, not generated textures). Lines 5–9, 11–13, 15–16 have nothing to act on (client-only presentation, no new object, no sim change, 0 B/s added).

## Acceptance Criteria

1. **Keep moving.** **Given** a build phase, **when** I hold a building (placement started from the shop, as today), **then** the left stick (touch) / WASD (keys) still moves my survivor: the input sent each step is normal movement, **not** `neutralizeInput`. A move stick held when holding starts keeps steering (only the aim stick and the mouse button are released).
2. **No firing while holding.** While holding, the input sent has `aim = (0, 0)` and `fire = false` on every step (touch and mouse). My survivor faces the way it walks (the sim's facing falls back to the move direction when the aim is zero). A right-half touch that misses the hand buttons starts **no** aim stick and does nothing yet (reserved for BX-5's drag). The swap button and the ammo line are hidden while holding (they sit under the hand cluster). Swap/consumable edge flags are untouched (still once per input seq).
3. **Carry offset.** Not pinned (BX-5 adds pinning), the ghost's **near edge sits `controls.build.carryGapM` = 1.0 m** beyond my body along my **carry facing**: `centre = me + facing × (r_body + gap + half the footprint's extent along facing)`, `r_body = balance.player.radiusM` (0.4), extent along a unit facing `(fx, fy)` = `|fx|·W + |fy|·H` (W × H = the footprint at the current rot). Results at the defaults, facing straight: barricade across the path **1.65 m**, turret **1.9 m**, spike trap (2 × 2) **2.4 m**, mine **1.65 m**. `me` = my survivor as last drawn (the predicted position online; review M1: the per-frame step runs before the input is sent, so the ghost trails the drawn body by at most one frame, ≈ 7 cm at 60 fps, under the 0.5 m snap).
4. **Carry facing** = my last move direction on this device (stick or keys past the dead zone); when I stop, the last facing stays. At the start of holding it is the survivor's facing.
5. **Snap with hysteresis.** The ghost's min corner snaps to the 0.5 m lattice (`BUILD_GRID_M`); each axis keeps its lattice index until the continuous corner is more than **`controls.build.snapHysteresisM` = 0.1 m** past the half-cell boundary (no jitter on a boundary while walking). A new type, a rotation or the start of holding snaps fresh (no hysteresis). Indices are **not** clamped (review L4): past the map edge they go negative, the ghost shows there (red, off the map) and Place sends nothing the uint8 wire can't carry (it toasts "Can't build here").
6. **Auto-rotate.** A non-square footprint turns so its long side lies **across** my facing: facing north/south → rot 0/2, east/west → rot 1/3, and the **barricade's struts are on my side** (struts point rot 0 north, 1 east, 2 south, 3 west, `barricadeLook.ts`): facing north → rot 2, south → 0, east → 3, west → 1. It switches axis only when the facing passes a 45° diagonal by more than **`controls.build.autoRotateHysteresisDeg` = 10°** (i.e. N/S ↔ E/W at 55° / 35° from the x axis). Square footprints (turret, spike trap, mine) never turn on their own.
7. **⟳ locks the rotation.** **When** I press ⟳, **then** the ghost turns 90° clockwise (rot + 1) and auto-rotate is **off for this held item**; the ⟳ button shows a padlock badge (🔒, drawn in Graphics). The carry offset is recomputed for the new footprint (the near edge stays 1 m from my body). A new hold starts unlocked.
8. **Hand cluster.** ⟳ ✓ ✕ in the bottom centre are replaced by the hand cluster at the bottom-right safe-area corner (centres measured from the right and from the bottom, CSS px × `dpr()`): **Place** 76 px circle at (92, 92), **⟳** 60 px at (190, 80), **✕** 48 px at (80, 196) (ux-spec §4). Place is **green** when the shared check passes, **grey with a red ring** when it doesn't (it still sends: the server judges). The hint line (white "Wood barricade · $40" / red refusal) is right-aligned 16 px from the right inset (D3 for its height). **Ready** (with Shop beside it, until BX-2) is centred **40 px left** of the screen centre. Every target ≥ 48 px and ≥ 12 px apart.
9. **Fairness: the server decides (F1).** Walking doesn't change what is accepted: the request goes through the unchanged `host.placeBuilding` → `building.place {type, gx, gy, rot}` → `placementError` (solo: the same function). The client's green/red is a prediction (same function on the World this device sees).
10. **Fairness: the spot sent is the spot shown.** **Place** sends the gx/gy/rot drawn in the last frame (the press is handled **before** this frame's carry update), even while running at full speed and under `?lag=150&jitter=20`. Place ends holding (BX-4 adds the chain).
11. **Fairness: my body never blocks my ghost.** At the default gap, the snapped ghost never overlaps my own body circle, whatever the facing (worst snap shift 0.35 m per axis < the 1.0 m gap). A teammate, zombie, spawn circle, map solid or map edge still makes it red (`placementError`'s `blocked`; BX-3 says why).
12. **Holding ends** on ✕, the phase leaving the build, a new wave number, the menu opening, the shop opening, me being downed/out, or game over (today's `canPlace` rules, unchanged). Nothing is charged for an unplaced ghost.
13. **Numbers in JSON (brief 10).** `controls.json` gains `build: { carryGapM: 1.0, snapHysteresisM: 0.1, autoRotateHysteresisDeg: 10 }` (zod: strict, with defaults so older fixtures load). No per-frame allocation in the carry path.
14. **Tests:** `placement.test.ts` — carry centre per type and facing (barricade 1.65, turret 1.9, spike trap 2.4, mine 1.65; diagonal facing), facing kept at rest, the rotation hysteresis (34°/36°/54°/56°), struts on the builder's side, the snap hysteresis (0.09 m vs 0.11 m past a boundary), ⟳ locks, own-body fuzz (random facings/positions never overlap me), confirm returns the shown spot; `balance.test.ts` › controls.build defaults and bounds; `holdInput` (aim/fire cleared, move kept); a browser check at **800 × 360**: the survivor walks while holding (position changes, ghost follows), screenshots in `docs/art/5-15/`.

## Beat the rule (reviewer: try each, record the result)

| # | Attempt | Expected result |
| --- | --- | --- |
| B1 | Carry a ghost onto a teammate | Red; Place sends, the server refuses `blocked` (toast) |
| B2 | Carry onto a spawn's 2 m circle | Red; refused `blocked` |
| B3 | Carry off the map edge / into a building's wall corner | Red (box past the edge or overlapping a solid); refused |
| B4 | Run at full speed under `?lag=150&jitter=20` and press Place | The building appears exactly where the ghost was drawn at the press (or is refused there): the sent gx/gy = the drawn one |
| B5 | Hold the right thumb on the screen while holding to keep firing | No fire, no aim (aim stick never starts; `fire` false every step) |
| B6 | Start holding while the aim stick is pressed (firing) | Aim stick released at once; no shot after the hold starts |
| B7 | Walk to wiggle the ghost across a lattice line | No jitter: it moves only after 0.1 m past the boundary |
| B8 | Stand still and turn on the spot by tapping the stick | Ghost turns with the facing (auto-rotate with 10° hysteresis); never overlaps me |
| B9 | Swap weapons/use a consumable while holding to dodge something | Same as today (edges once per seq); nothing to dodge in a build |
| B10 | Hold a building across the build → wave change / menu / shop / downed | Holding ends; nothing charged |
| B11 | Place while my server body lags behind my predicted body | Facing = move direction, so the ghost is always ahead; a lagging server body is farther from it, never inside |

## Tasks / Subtasks

- [x] **T1 Balance (AC 13).** `balanceSchema.ts › controlsSchema`: `build: z.object({ carryGapM: 0..4, snapHysteresisM: 0..0.24, autoRotateHysteresisDeg: 0..44 }).strict().default({...})`; `controls.json` gains the block; `balance.test.ts` case.
- [x] **T2 Carry in `scenes/placement.ts` (AC 3–7, 11).** `Placement.start(balance, type, x, y, facingX, facingY, wave)` (reads `balance.controls.build` and `balance.player.radiusM` once into fields); new `carry(x, y, moveX, moveY)` (facing update, auto-rotate with hysteresis, centre, snap with hysteresis); `rotate()` = rot + 1, `locked = true`, fresh snap, recompute from the last position; `confirm()` returns the current (shown) spot; drop the finger-anchored `moveTo` (BX-5 brings a relative drag instead). Pure helpers exported for tests: `carryCentre`, `autoRot`, `snapAxis`. No allocation.
- [x] **T3 Input while holding (AC 1, 2).** `input/menuInput.ts › holdBuildingInput(out)` clears aim + fire only. `TouchSticks.releaseAim()` + `InputRouter.releaseAim()` (aim stick + mouse button). `GameScene.startPlacement` calls `releaseAim()` instead of `releaseAll()`; `updatePlacement` calls `holdBuildingInput` instead of `neutralizeInput`, handles Place before `carry`, feeds `carry` the drawn position (`playerViews.get(me)`) and `input_.moveX/moveY`.
- [x] **T4 HUD (AC 2, 7, 8).** `HudScene`: pointer routing while holding (left-half touch → the move stick as usual; right-half touch / mouse that misses a button → claimed, nothing); no `hudPointerReset` when holding starts (release the aim stick only); hand cluster layout (circles, Place colour by validity, 🔒 badge on ⟳ from `hudModel.placementLocked`), hint line right-aligned; swap + ammo hidden while holding; Ready pair 40 px left of centre. `hudModel`: drop `placeTap*`, add `placementLocked`. `ui/sizes.ts`: the cluster sizes/positions.
- [x] **T5 Tests + browser check (AC 14).** Unit tests above; Playwright at 800 × 360 (solo, `?wallet=5000`, open the shop, buy a barricade, hold a key/stick, survivor position changes, ghost follows); screenshots `docs/art/5-15/`.
- [x] **T6 Gate + record.** `npm run typecheck && npm run lint && npm test && npm run build`; Dev Agent Record; status `review`.

## Dev Notes

### Decisions (taken here, recommended values; the ux-spec already decided everything else)

- **D1 Carry facing comes from this device's move input**, not the synced facing: instant on the predicted survivor, no wait for the server, and identical to the sim's facing while holding (aim is zero, so the sim faces the move direction). At rest the last facing stays (spec §6.1).
- **D2 The right half does nothing while holding in this story.** Today a tap moves the ghost under the finger; the spec forbids "ghost under the finger" and BX-5 (5.19) adds the relative drag. Until then, precision comes from walking + the 0.5 m snap. Mouse: the same (WASD carries; the absolute cursor-follow is BX-11, 5.25, optional).
- **D3 Hint line height:** right-aligned 16 px from the right, its bottom **6 CSS px above ✕'s top edge** (review L5; was a fixed 250 px from the bottom, which met ☰/⚙ on a 320 px-tall phone). BX-2/BX-4 put the item chip there and move the line above it.
- **D4 Swap button and ammo line hidden while holding** (they would sit under Place/✕; the weapon can't fire while holding anyway).
- **D5 Place label:** the word "Place" (18 px) in the 76 px circle; ⟳ and ✕ keep their glyphs.
- **D6 Survivor speed while holding: unchanged** (no carry slow; the spec has none).

### Current state (read before changing)

- `apps/client/src/scenes/placement.ts`: `Placement` (Story 3.4): `start` puts the ghost `PREVIEW_AHEAD_M` = 2 m ahead, `moveTo` centres it on a tap and snaps (`cornerForCentre`), `rotate` turns around the anchor, `confirm` ends + returns the one reused request object, `check` runs `placementError` on the device's World. Preserve: `check`, `confirm` (reused object), `cancel`, `wave`, `placeRefusalText`, the 0–255 clamp.
- `GameScene.ts`: `startPlacement` (shop calls it via `uiStore`), `canPlace`, `updatePlacement` (cancel rules, taps, ⟳ ✓ ✕, `neutralizeInput`), `updateRepair` (taps off while placing), `readyButton`/`shopButton` hidden while placing; `buildingView.update(world, placement)` draws the ghost each frame from gx/gy/rot/error (redraw on key change only).
- `HudScene.ts`: `PLACE_IDS` buttons laid out bottom centre (`layoutPlacementButtons`), `drawPlacement` shows/hides and calls `hudPointerReset` when placing starts; pointer `down` swallows every non-button pointer while placing (moves the ghost); swap button at (right 24, bottom 120, 64 px); ammo text at margin 24.
- `input/InputRouter.ts`, `TouchSticks.ts`: left-half touch = move stick, right-half = aim stick (fire past the dead zone); `releaseAll` drops keys, mouse and both sticks.
- `shared/player/movement.ts`: facing = aim if non-zero, else move.
- `render/barricadeLook.ts`: struts point rot 0 north, 1 east, 2 south, 3 west.

### Copies touched (brief line 2)

None. World, schema, syncState, state views, NetSimHost mirror, Predictor, devThrottle, snapshotWorld: unchanged. The only shared change is the `controls.json` block + its zod schema (read by the client only). `balance.version` changes with the JSON (client and server ship the same file).

### Must be preserved

Placement refusals and toasts (3.4), the repair panel and world taps (3.7), the upgrade button (5.9), Ready/Shop behaviour (3.1/3.3), mine ring preview (5.9), the ghost art (4.11), menu/shop neutral input, edge flags once per seq, every existing test.

### References

- `docs/ideas/building-ux/ux-spec.md` §3–§7, §9, §13, §15; `draft-stories.md` BX-1; `epics.md` › Story 5.15; story files 3-4 (placement), 3-7 (taps), 4-11 (ghost art); HANDOFF §3 lessons.

## Notes for the merge (brief line 19)

- `packages/shared/src/config/balance/controls.json` + `balanceSchema.ts › controlsSchema`: new `build` block (5.16–5.19 add their numbers here: drag gain, long-press, pending timeout).
- `scenes/placement.ts`: `moveTo`/`anchorX/Y`/`PREVIEW_AHEAD_M` are gone; `carry()` is the per-frame entry. BX-5 adds `pinned` + a relative `drag(dx, dy)`.
- `scenes/hudModel.ts`: `placeTap*` removed, `placementLocked` added.
- `HudScene.ts`: the hand cluster lives at the bottom-right; Ready/Shop moved 40 px left. 5.10–5.12 (round D) touch `HudScene`'s gear/consumable rows: expect small conflicts near the swap button (5.12's consumable button sits 64 px left of swap and must also hide while holding).

## Senior Developer Review (AI)

**Reviewer:** fresh agent dispatched by the main session, 2026-11-23. **Outcome:** changes requested (0 high, 1 medium, 6 low); all fixed on `story-5-15` except L7 (accepted).

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| M1 | Medium | The GameScene wiring for AC 1 / AC 10 was untested: moving `carryPlacement` ahead of the Place handling (Place would send this frame's spot) or swapping `holdBuildingInput` for `neutralizeInput` (survivor freezes) survived every test. | The whole frame is one pure function, `stepPlacement(placement, hud, input, world, frame)` in `scenes/placement.ts` (cancel rules → hold input → ✕ → Place = the spot shown last frame → ⟳ → carry → check → HUD fields). `GameScene.updatePlacement` fills one reused frame object and calls it; `carryPlacement` is gone. Tests: "holding keeps my move… drops aim and fire", "Place sends the spot drawn last frame, before this frame's carry moves it", "⟳ locks, ✕ sends nothing, off-map Place toasts, cancel rules". Mutations now killed: carry before Place, neutral input instead of hold, carry removed. Trade-off: the carry uses the survivor as last drawn (≤ 1 frame behind, ≈ 7 cm at 60 fps; AC 3 updated). |
| L2 | Low | The facing-kept-at-rest test was weak (a reset-to-east mutation passed). | The test now starts facing east, walks north, stops, and asserts facing (0, −1) and the same spot. Reset-to-east mutation killed. |
| L3 | Low | The right safe-area inset was never really tested. | `handCluster.test.ts` asserts the exact x/y of all three buttons and the hint with insets right 24 / bottom 16 at dpr 2. Ignore-the-inset mutation killed. |
| L4 | Low | At the map edge `clampIndex` pulled the ghost back onto my own body (breaks AC 11). | No clamp: the indices stay real (negative off the map), the ghost is drawn past the edge and the shared check says `blocked`. `Placement.onWire()`; `confirm()` returns null for an off-wire spot and `stepPlacement` toasts "Can't build here" instead of sending (a negative index would wrap to 255 on the uint8 wire). `BuildingView`'s ghost redraw key offsets negative indices. The own-body fuzz now puts a quarter of its 4,000 steps against the map edges; a "clamp at 0" mutation is killed. |
| L5 | Low | On 568 × 320 the hint line (fixed 250 px up) overlapped ☰ / ⚙. | The hint's bottom is anchored 6 px above ✕'s top edge (`HAND_HINT_GAP_CSS_PX`). Test at 568 × 320, 800 × 360 and 1024 × 768: the hint's top stays ≥ 4 px below the menu buttons and above the hand buttons. Browser shot `docs/art/5-15/5-15-holding-568x320.png`. |
| L6 | Low | `5-15-walking-holding.png` seemed to show a red ghost with a white hint and a green Place. | Not a bug: the ghost is the small **green** palisade; the large thin **red rectangle** is map art (the petrol station forecourt with two pumps), still there after the building is put away (new shot `5-15-after-put-away.png`). Re-shot and explained in `docs/art/5-15/README.md`. |
| L7 | Low (accepted) | The server judges `building.place` before the queued inputs are applied, so after a fast reversal under big lag the server's (older) body could block a green ghost (reviewer: 12/12 accepted in practice). | **Accepted, not fixed** (main session). Note for **Story 5.18** (chain + pending under lag): the pending box should treat such a refusal like any other (shake, toast, price shown back), and its playtest under `?lag=150&jitter=20` should try a sharp reversal right before Place. |

Mutation list after the fixes (one line each, touched tests): carry before Place, neutral input instead of hold, carry removed, facing reset to east, right inset ignored, clamp at the edge, off-wire spot sent: all **killed**. "Place sends `{...req, gx: p.gx}`" survives but is an equivalent mutant (`p.gx` still equals the request's gx at that point).

Gate after the fixes (one full run on `story-5-15`): `npm run typecheck && npm run lint && npm test && npm run build` → exit 0; **251 files passed / 1 skipped, 2,032 tests passed / 3 skipped**; build OK. Load average 1.0 at the start, 4.0 at the end (4-core container, this builder alone). Browser re-check at 800 × 360 and 568 × 320 (headless Chromium, CDP touch): walk while holding, ⟳ lock, Place, put away; no console errors.

**Re-review (fresh agent, 2026-11-23) of `6d2b4f9`:** no high or medium; every fix holds; the full gate passes. Four lows (tests and docs), fixed:

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| R2-L1 | Low | The hold input wasn't asserted on the ✕ / Place frame (moving `holdBuildingInput` below those branches survived). | The Place-frame and ✕-frame tests assert `fire === false`, `aimX/aimY === 0` and the move kept on that frame's input. |
| R2-L2 | Low | The north-edge case never called `onWire()` / `confirm()` (an "onWire checks only gx" mutant survived). | The north-edge turret (gx on the wire, gy negative) asserts `onWire()` false and `confirm()` null. |
| R2-L3 | Low | ⟳-before-carry order untested. | Facing east (rot 3), ⟳ on the frame the move turns north → rot 0 (3 + 1, locked), not north's auto-rot 2 turned once (3). |
| R2-L4 | Low | Completion Notes and the Change Log (Q1) still said the hint sits 250 px up. | Both updated: 6 px above ✕ (L5); Q1's "stays where it is" marked as replaced by L5. |

Touched tests only (test/doc change, no full gate per the main session): `placement.test.ts`, `handCluster.test.ts`, `menuInput.test.ts`. Mutants checked: hold input moved below the ✕/Place branches, `onWire` checking only gx, carry before ⟳ — all killed. Status → **done**.

## Dev Agent Record

### Agent Model Used

Claude (builder cloud session, 2026-11-23). Baseline commit `4c30563`.

### Debug Log References

- Browser check: `/tmp` Playwright script (solo practice, `?wallet=5000`, 800 × 360, `isMobile`, dpr 2, CDP touch on the left half). Output: at the start of holding the survivor stood at (24, 16), ghost (51, 30) rot 3; with the move stick pushed up-right the survivor walked (25.97, 13.38) → (29.75, 8.34) in 1.25 s while the ghost followed every frame ((54, 22) → (62, 11), valid); a right-half touch during the walk left `fire = false`, `aimX = 0` while `moveX/moveY = 0.6/-0.8` kept going; ⟳ → rot 0, locked; Place → 1 building, wallet 5000 → 4960; carried onto that barricade → `blocked`, Place grey with a red ring. No console errors.

### Completion Notes List

- **Carry** (`scenes/placement.ts`): `carry(x, y, moveX, moveY)` once per frame; centre = me + facing × (0.4 + 1.0 + support of the footprint along the facing), per-axis snap with 0.1 m hysteresis (`snapAxis`), auto-rotate with the 45° ± 10° axis switch and struts on the builder's side (`autoRot`), ⟳ = rot + 1 and lock. The finger-anchored `moveTo` / `PREVIEW_AHEAD_M` are gone (BX-5 adds a relative drag). No allocation per frame.
- **Input while holding**: `holdBuildingInput` keeps the move and clears aim + fire (swap/consumable edges and the seq untouched); `InputRouter.releaseAim` / `TouchSticks.releaseAim` at the start of holding (the move stick keeps steering). `GameScene.updatePlacement` handles ✕ / Place / ⟳ before the input is sent; Place sends the gx/gy/rot drawn last frame; the new `carryPlacement` runs after `syncPlayerViews` and before `buildingView.update`, so the ghost is placed from the survivor as drawn this frame and the next Place sends exactly that.
- **HUD**: round hand cluster bottom right from `layoutHandCluster` (Place 76 px at (92, 92), ⟳ 60 at (190, 80), ✕ 48 at (80, 196)); Place green / grey + red ring; padlock badge drawn in Graphics (no texture); hint line right-aligned at 16 px, its bottom 6 px above ✕ (review L5; first built at 250 px up, D3); weapon lines (alpha 0) and the swap button hidden while holding (D4); left-half touches start the move stick while holding, right-half touches / mouse presses that miss the buttons are claimed and do nothing; Ready + Shop 40 px left of centre.
- **Balance**: `controls.json › build { carryGapM 1.0, snapHysteresisM 0.1, autoRotateHysteresisDeg 10 }`, zod with defaults (older fixtures load) and bounds (hysteresis < half a cell, < 45°).
- **Copies (brief 2)**: none touched. No message, schema, server, Predictor or mirror change; the request is the unchanged `building.place`. 0 B/s added.
- **Tests**: `placement.test.ts` (12: carry distances 1.65 / 1.9 / 2.4 / 1.65 m and diagonal, start, walking + facing at rest, struts N→2 S→0 E→3 W→1, rotate hysteresis 34/36/54/56°, snap hysteresis 0.09 vs 0.11 m, ⟳ lock, 4,000-step own-body fuzz, 0–255 clamp, Place = shown spot, shared check incl. a teammate); `menuInput.test.ts` (+3: hold input, `releaseAim` keeps the move stick, online sends normal movement with fresh seqs); `handCluster.test.ts` (2: positions, ≥ 48 px, ≥ 12 px apart, no overlap, insets × dpr 1–3); `balance.test.ts` (+1: controls.build defaults/bounds).
- **Mutations (brief 9)**: 7 one-line mutations, all killed: no snap hysteresis, no rotate hysteresis, struts away from me, ⟳ doesn't lock, no carry gap, holding keeps fire, `releaseAim` keeps the aim stick.
- **Full gate** on `story-5-15` (master `4c30563` + this story): `npm run typecheck && npm run lint && npm test && npm run build` → exit 0; **251 files passed / 1 skipped, 2,027 tests passed / 3 skipped**; build OK. Load average 1.4 at the start, 3.4 at the end (4-core container, this builder alone).
- **Not verified**: a real phone (only headless Chromium with CDP touch); online play under `?lag=150&jitter=20` (no game server started in this session: the sent spot = the drawn spot is shown by code order and the unit test, not by a lagged run); a tab slept across a build start while holding (the existing `canPlace`/wave-number cancel is unchanged); mouse + WASD in the browser (unit-tested input path only); 4:3 tablet layout; safe-area insets on a notched phone (unit-tested maths only).

### File List

- `_bmad-output/implementation-artifacts/5-15-carry-the-ghost-and-keep-moving.md` (new)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/shared/src/config/balance/controls.json`
- `packages/shared/src/config/balanceSchema.ts`
- `packages/shared/src/config/balance.test.ts`
- `apps/client/src/scenes/placement.ts`
- `apps/client/src/scenes/placement.test.ts`
- `apps/client/src/scenes/handCluster.ts` (new)
- `apps/client/src/scenes/handCluster.test.ts` (new)
- `apps/client/src/scenes/GameScene.ts`
- `apps/client/src/scenes/HudScene.ts`
- `apps/client/src/scenes/hudModel.ts`
- `apps/client/src/input/menuInput.ts`
- `apps/client/src/input/menuInput.test.ts`
- `apps/client/src/input/InputRouter.ts`
- `apps/client/src/input/TouchSticks.ts`
- `apps/client/src/ui/sizes.ts`
- `apps/client/src/render/BuildingView.ts` (review L4: ghost redraw key with negative indices)
- `docs/art/5-15/README.md`, `5-15-walking-holding.png`, `5-15-locked.png`, `5-15-blocked.png`, `5-15-after-put-away.png`, `5-15-holding-568x320.png` (new)

### Change Log

- 2026-11-23: Story written (gds-create-story) and built (gds-dev-story): carry + keep moving, hand cluster, controls.build numbers. Status → review.
- 2026-11-23: Re-review lows R2-L1–L4 fixed (tests and docs); status → done.
- 2026-11-23: Review fixes M1, L2–L6 (L7 accepted); status stays review.
- 2026-11-23: Open questions settled (designer: "go with your recommendation"). Q1: the reason line stays where it is (right side, 250 px up) — *replaced by review L5: it now sits 6 px above ✕, which also clears ☰/⚙ on a 320 px-tall phone* — and the readability check over busy city art goes on the phone playtest list; 5.16/5.18 move it above the item chip anyway. Q2: Ready keeps the 40 px left shift now (no effect while holding; it matters once 5.16's build bar shares the corner). Q3: whichever of 5.12 and 5.15 merges second makes 5.12's consumable button hide while holding, like the swap button (`HudScene.drawWeapon`'s `hidden` flag); the reviewer checks it after the merge.
