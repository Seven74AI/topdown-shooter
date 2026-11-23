# Story 5.17: Why it's red

Status: done

(Building UX rework BX-3. Design: `docs/ideas/building-ux/ux-spec.md` §7 (7.1 ghost, 7.2 reason + culprit, 7.3 accessibility) and §15 (designer: **B · Carry + drag**), `draft-stories.md` › BX-3, feel: `prototype.html` / claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR. Spine-wins rule: where the spec and the prototype disagree, the spec wins. Builds on Story 5.15 (`stepPlacement`, the hand cluster, the hint line 6 px above ✕) and 5.16 (build bar, `pickRefusalText`, toasts).)

## Story

As a player,
I want to know why I can't build somewhere and what's in the way,
so that I fix it in one move.

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
> Most relevant here: **2** (one new shared function, `blockReason`, used by the client only; the server keeps `footprintBlocked` / `placementError` and its refusal codes unchanged; no World/schema/mirror/Predictor change), **3/4** (fairness ACs 1, 9–11 and "Beat the rule"), **7** (the `blockReason ⇔ footprintBlocked` fuzz over random layouts × decay stages × map edges), **9** (liveness: every cause really comes up in the fuzz; mutations), **10** (the reason, culprit and rings are redrawn on change only, nothing allocated per frame; the hold time in `controls.json`), **14** (online the explanation is of this device's World: teammates and zombies are interpolated, the server may still refuse — unchanged 5.15 rule), **17** (Phaser 4 Graphics), **20** (no new texture: hatch, ✕, outlines, circles and rings are Graphics). Lines 5, 6, 8, 11–13, 15–16 have nothing to act on (client-only presentation, no new object, no sim change, 0 B/s added).

## Acceptance Criteria

1. **Shared `blockReason` (client-used).** `packages/shared/src/buildings/buildings.ts` gains `blockReason(world, ownerId, box, exceptId = 0, out?) → BlockReason | null` next to `footprintBlocked`. It runs the same tests as `footprintBlocked` and returns the **first** cause in this order with its culprit: **off map** → **spawn clearance** (index of the spawn point) → **map solid / cover** (index into `world.obstacles.solids`) → **another building** (its id) → **me** (my id) → **a teammate** (their id) → **a zombie** (its slot id). `exceptId` (a building id, 0 = none) leaves that building out (for 5.24's move). No allocation (one module scratch `out` by default). `footprintBlocked` stays the server's check and is **not changed**.
2. **Fairness: the explanation never disagrees with the server (F1).** A fuzz test proves `blockReason(w, o, box) !== null ⇔ footprintBlocked(w, box)` over random Downtown layouts (every legal decay variant mask, stages 1–3, 1–4 players incl. downed/out, random buildings and zombies) and random footprints of every buyable type and rot **across the map and up to 3 m past every edge** (5.15: off-map indices are real and negative); the cause is the first test that holds in the AC 1 order (checked against an independent re-statement of each test) and the culprit really overlaps. `exceptId` = the same answer as `footprintBlocked` on the World without that building.
3. **The reason line** (5.15's hint line, 6 px above ✕, 18 px, black stroke) shows, for the held ghost, the first reason in this order: **"Building limit reached (6)"** (cap), **"Need $X (you have $Y)"** (money; 5.16's text), then the spot: **"Off the street"**, **"Too close to a zombie spawn (2 m)"** (from `buildings.spawnClearM`), **"Blocked by the bus / a car / the sandbags / the police barrier / a wall …"** (a name table for the Downtown objects; cover by kind; unknown names → "a wall"), **"Overlaps a building"**, **"You're standing there"**, **"Bo is standing there"** (the teammate's display name; "A teammate is standing there" while the name is unknown), **"A zombie is in the way"**. Valid: "Wood barricade · $40" (white), as today. The server's refusal codes and its toasts (`placeRefusalText`) do not change.
4. **The culprit is outlined red in the world** (0.06 m, `#e53935`): the map box (solid/cover), the building, the spawn's 2 m circle (dashed), my ring / the teammate's ring (a red circle round the body as drawn), the zombie (a red circle round it); **off map**: the map's edge rectangle. Only the shown reason's culprit; nothing outlined while valid.
5. **Spawn no-build circles.** While I hold anything, every spawn's `spawnClearM` circle is drawn faint (red 12 % fill, dashed edge). Drawn once per map into one Graphics (the camera culls what's out of view), shown/hidden with holding.
6. **Colour-blind safe ghost (ux-spec §7.1, §7.3).** A blocked ghost gets a **45° hatch** (white 25 %, 0.25 m spacing, clipped to the box) and a **✕ glyph** (0.4 m, centred, capped to the box) on top of the red; a valid ghost has neither. **Place** turns grey with a red ring but still sends (5.15; the server judges).
7. **Range rings from balance (generic).** The ghost draws a ring at every radius its type's balance blocks declare: any nested block field named `rangeM` or ending in `RadiusM` / `radiusM` (today: turret `rangeM` 8 m; mine `triggerRadiusM` 1 m + `blastRadiusM` 2.5 m, 5.9's colours kept). After 5.10 / 5.14 merge, the med station's `heal.radiusM`, the floodlight's `light.radiusM` and a bear-trap radius get rings with **no UI change** (read generically; their data is not added here). Rings are dimmed (half alpha) while blocked.
8. **No flicker (hold).** The look goes back to valid only after **`controls.build.reasonHoldMs` = 250 ms of continuous clear** (review L1: every blocked frame restarts the clock, so a one-frame clear never flashes green, even after a long red) — reason line, red ghost + hatch + ✕, Place's colour, culprit outline. A new reason or culprit replaces the shown one at once; a culprit that dies or leaves during the hold loses its outline (review L4). The hold is presentation only: Place always sends the spot shown (5.15 AC 10).
9. **Fairness: walking past isn't a way round the check.** The hold never makes a blocked ghost look valid: blocked → red at once (the frame it becomes blocked); only blocked → valid waits.
10. **Fairness: same World.** The reason is computed from the World this device sees, in the same frame as `placementError` (same box); the reason line never says "valid" while `placementError` says blocked and vice versa (except during the 250 ms hold of AC 8, which only keeps red longer).
11. **Holding ends** under 5.15's rules; the spawn circles, culprit outline and held reason vanish with it (and reset for the next hold).
12. **Numbers (brief 10).** `controls.json › build.reasonHoldMs: 250` (zod, 0..2000, default so older fixtures load). Hatch/✕/outline sizes and colours are layout constants next to 5.15's ghost constants. No allocation per frame: the reason text is rebuilt only when its key (error, cause, culprit, wallet) changes; the culprit Graphics is redrawn only when the culprit or its position changes (> 1 cm); the spawn layer once per map.
13. **Tests:** `blockReason.test.ts` (fuzz AC 2, exceptId fuzz, off-map-and-spawn → off map, me before teammate, out players); `blockText.test.ts` (every text, name table, unknown name, teammate name, money/cap first); `placement.test.ts` (+ reason hold: 250 ms, blocked at once, reason→reason at once, reset on a new hold; `stepPlacement` writes the held reason/valid into the HUD); `rangeRings.test.ts` (turret 8, mine 1 / 2.5, a fake `heal.radiusM` / `light.radiusM` block, `projectileRangeM` not a ring); `ghostHatch.test.ts` (hatch segments clipped to the box, ✕ size cap); `balance.test.ts` › reasonHoldMs default/bounds; a browser check at **800 × 360 and 568 × 320**: reason text per cause, culprit outline, spawn circles, hatch + ✕, the 250 ms hold. Screenshots in `docs/art/5-17/`.

## Beat the rule (reviewer: try each, record the result)

| # | Attempt | Expected result |
| --- | --- | --- |
| B1 | A spot off the map **and** on a spawn circle | "Off the street" (first cause wins, AC 1 order; unit test) |
| B2 | A spot on a spawn circle and a car | "Too close to a zombie spawn (2 m)" |
| B3 | Walk the ghost past a teammate | Red at once with "Bo is standing there"; back to green 250 ms after Bo has left the box (continuous clear), no flicker |
| B4 | Find a spot the line says is fine but the server refuses (or the other way round) | None in the fuzz (60,000 boxes incl. map edges); online, only interpolated bodies can differ (5.15 L7, accepted) |
| B5 | Press Place during the 250 ms hold after the spot became valid | Sends (presentation only); the server accepts it |
| B6 | Colour-blind: tell blocked from valid without colour | Hatch + ✕ on the ghost, "Place" grey with a ring, the reason text |
| B7 | At 6/6 or short of money, on a blocked spot | The cap / money reason first (placementError's order) |
| B8 | A ghost over my own building | "Overlaps a building" + that building outlined |
| B9 | Hold a ghost and look for spawns | Faint red circles at every spawn (all decay stages: the server keeps every stage's spawns clear) |

## Tasks / Subtasks

- [x] **T1 Shared `blockReason` (AC 1, 2).** `buildings.ts`: `BlockCause`, `BlockReason`, `createBlockReason`, `blockReason(world, ownerId, box, exceptId = 0, out?)`; export from `index.ts`. Fuzz test `blockReason.test.ts`.
- [x] **T2 Texts (AC 3).** New `apps/client/src/scenes/blockText.ts`: `SOLID_NAMES` (Downtown collision names), `COVER_WORDS` (by kind), `blockText(world, reason, nameOf, clearM)`; tests.
- [x] **T3 Hold + step (AC 8–10).** `placement.ts`: `ReasonHold` (pure, ms clock); `Placement` keeps `reason` (truth) and the shown state (`shownError`, `shown` reason copy); `stepPlacement` computes `blockReason` when `error === "blocked"`, applies the hold, writes `m.placementValid` / `m.placementHint` from the shown state (text from `f.hintText`). `PlacementFrame` gains `nowMs`, `hintText`. `controls.json` / schema `reasonHoldMs`.
- [x] **T4 World drawing (AC 4–7).** `BuildingView.drawPreview`: shown validity, hatch + ✕ (`ghostHatch.ts` pure segments), generic rings (`rangeRings.ts`). New `render/BlockReasonView.ts`: spawn circle layer (once per map), culprit outline (redraw on change).
- [x] **T5 GameScene wiring.** `nowMs = this.time.now`, `hintText` with a cached string per key; `BlockReasonView` created/updated/destroyed with the other views.
- [x] **T6 Tests + browser check (AC 13).**
- [x] **T7 Gate + record.** `npm run typecheck && npm run lint && npm test && npm run build`; Dev Agent Record; status `review`.

## Dev Notes

### Decisions (taken here, recommended values; the ux-spec already decided everything else)

- **D1 Money and cap come first in the reason line**, before the spot (ux-spec §7.2 order 1–2 and `placementError`'s own order), with 5.16's texts ("Need $250 (you have $180)", "Building limit reached (6)"). The 5.16 bar normally stops these at the pick; they still show if money changes while holding.
- **D2 The hold covers the whole blocked look** (reason, red + hatch + ✕, Place grey, culprit), not just the text: a green ghost with a red reason would contradict itself. It only ever delays "valid", never "blocked" (fairness AC 9), and Place always sends.
- **D3 Name table** (Downtown): `city_bus`/`bus_hull` → "the bus", `gas_pump_a/b` → "a petrol pump", `parking_wall` → "a wall", `dumpster_alley_3` → "a dumpster", every building box (`nw_corner_shop`, `sw_diner`, `gas_kiosk`, …) → "a wall"; cover by kind: car → "a car", bus → "the bus", barrier → "the police barrier", sandbags → "the sandbags"; any other name → "a wall". Unknown maps work (fallback).
- **D4 Off map culprit = the map's edge rectangle** (the spec: "ghost edge past the map edge"); the camera shows the near part.
- **D5 Zombie culprit = a red circle** round the zombie (radius = the check's `maxZombieRadius`), at the World position (≤ 1 tick from the drawn sprite); tinting the sprite would touch `ZombieView`'s per-type tints (not worth the risk here).
- **D6 Range ring rule** = any field of a nested balance block named `rangeM` or ending in `RadiusM`/`radiusM`; mine trigger/blast keep 5.9's colours, every other ring is white 60 %. `projectileRangeM` is not a ring (where bullets die, not where the turret aims). Bear trap: 5.14 isn't written; if it has a `plateRadiusM`-style field it gets a ring, else its plate is the footprint (already drawn).
- **D7 Spawn circles of every decay stage** (the server's rule since 4.3 review M), not only open ones: a circle you can't build in must be drawn.
- **D9 Nameless teammate** (a late join before its info arrives): "A teammate is standing there" (found in the browser check).
- **D8 The hold uses the scene clock (ms)**, not ticks: presentation only, like 5.16's toasts (brief 10's tick rule is for the simulation).

### Current state (read before changing)

- `shared/buildings/buildings.ts`: `footprintBlocked(world, box)` (off map → every spawn's `spawnClearM` circle → `obstacles.solids` → buildings → non-out players → alive zombies at `maxZombieRadius`), `placementError` (player → phase → type → integer → cap `limit` → `money` → `blocked`).
- `shared/map/obstacles.ts`: `solids` = walls (named collision boxes + `block` mutations) then active cover (`CoverObject` with `kind`), deduplicated (the bus).
- `client/scenes/placement.ts`: `Placement.check` (→ `error`), `stepPlacement` (cancel → hold input → ✕ → Place → ⟳ → carry → check → HUD fields). HUD reads `placementValid` (Place colour, hint colour) and `placementHint`.
- `client/render/BuildingView.ts › drawPreview`: lattice, fill + outline by `p.error`, art ghost, mine rings (`mineRingRadii`); redraw on a key (gx, gy, rot, valid, type).
- `client/scenes/buildBar.ts › pickRefusalText` (5.16).
- `client/render/PlayerView.ts`: slot ring; positions `view.x/y` (drawn).

### Copies touched (brief line 2)

None of the sim copies. `blockReason` is a new shared function read only by the client; World, schema, syncState, state views, mirror, Predictor, devThrottle, snapshotWorld, server: unchanged. `controls.json` gains one client-read number (`balance.version` changes with the JSON; client and server ship the same file).

### Must be preserved

5.15's hold, carry and `stepPlacement` order (Place = the spot shown last frame), the hand cluster and hint placement, 5.16's build bar and toasts, placement refusals and toasts (3.4), mine ring preview (5.9; now through the generic rings), the ghost art (4.11), every existing test.

### References

- `docs/ideas/building-ux/ux-spec.md` §7, §15; `draft-stories.md` BX-3; `epics.md` › Story 5.17; story files 5-15, 5-16, 5-9 (mine rings), 4-3 (spawn clearance).

## Notes for the merge (brief line 19)

- `packages/shared/src/buildings/buildings.ts` + `index.ts`: new `blockReason`, `BlockReason`, `BlockCause`, `createBlockReason`; `footprintBlocked` / `placementError` untouched. **If 5.10 adds a check to `footprintBlocked`, add the same cause to `blockReason`** (the fuzz test fails otherwise — that's its job). 5.10's `not_for_sale` PlaceError reaches the line through `placeRefusalText` (add its case there).
- `controls.json` / `balanceSchema.ts › buildControlsSchema`: `reasonHoldMs` added (5.18–5.19 add theirs).
- `render/BuildingView.ts`: rings now come from `rangeRings(stats)` (5.10's med-station/floodlight rings appear in the ghost automatically; 5.10's own placed-building rings are separate).
- `scenes/placement.ts`: `PlacementFrame` gains `nowMs` and `hintText`; `Placement` gains `reason`, `shownError`, `shownReason`.

## Senior Developer Review (AI)

**Reviewer:** fresh agent dispatched by the main session, 2026-11-23. **Outcome:** no high, no medium; the `blockReason ⇔ footprintBlocked` rule held against every attack; the zombie screenshot is correct. Lows fixed on `story-5-17` (no re-review needed, main session).

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| L1 | Low | The hold counted from when the reason appeared, so after a long red a one-frame clear flashed green. | Decision (main session): every blocked frame restarts the clock (`shownSinceMs` = the last blocked frame); valid needs 250 ms of continuous clear, red stays instant. AC 8 / B3 updated; the "long red" test now asserts no green after one clear frame and green exactly 250 ms after the last blocked frame. |
| L2 | Low | `sameAsShown` had no test for a culprit change while still blocked ("ignore playerId" / "ignore culprit" mutants survived). | Tests: teammate p1 → p2, teammate → zombie, zombie A → zombie B: hint, `shownReason`, `shownSinceMs` and `shownVersion` change on that frame. Both mutants killed. |
| L3 | Low | The GameScene hint cache key lacked the teammate's name (a name arriving later never updated the line). | The key includes `ownerName(playerId)` for the teammate cause. |
| L4 | Low | A zombie that died / a teammate that left or went out during the hold kept a stale outline. | `BlockReasonView` hides the culprit unless the zombie is alive (`zombieAlive`: its alive-list slot points back at it, pure + tested) or the teammate is still present and not out. |
| L5 | Low | `ghostHatch.ts` comment said "left edge" where the code uses the right edge; the 64-segment buffer wasn't pinned. | Comment fixed; `HATCH_MAX_SEGMENTS` / `HATCH_SPACING_M` moved to `ghostHatch.ts`; a test pins the largest footprint in balance (whole hatch, nothing cut off). |
| + | Test | Surviving mutants M9 (start keeps the shown state), M10 (explain's exceptId), M12 (spawn text literal), M17 (dashed circle minimum). | Tests: `start()` without `cancel()` resets the shown state; a building under the ghost is the reason; the spawn text follows `spawnClearM` (3 m override); a 0.1 m circle gets 8 slots / 4 dashes. |

Gate after the fixes on the tree merged with master (`a312abc`, includes `4258175`): `npm run typecheck && npm run lint && npm test && npm run build` → exit 0; **257 files passed / 1 skipped, 2,107 tests passed / 3 skipped**; build OK. Load 0.7 at the start, 3.6 at the end (4-core container, this builder alone). Master's map change (a `building` flag on wall boxes for lobbed rounds) leaves `solids`, the names and `footprintBlocked` unchanged.

Mutations after the fixes, one each, all **killed**: sameAsShown ignores playerId; ignores culprit (index/id); start keeps shown; explain passes exceptId 1; hold from first appearance; spawn "2 m" literal; dashed minimum 2; `zombieAlive` without the back-check; hatch buffer 12.

## Dev Agent Record

### Agent Model Used

Claude (builder cloud session, 2026-11-23). Baseline: master `d526464` (5.15 + 5.16 merged).

### Debug Log References

- Browser check (`require('playwright')`, headless Chromium, `isMobile`, `hasTouch`, dpr 2; Vite on its own port 5417, stopped by PID; solo practice `?wallet=5000`): at 800 × 360 and 568 × 320 each cause was set up by teleporting the survivor / adding a culprit in the solo World. HUD state read from the scene: spawn → "Too close to a zombie spawn (2 m)", off map → "Off the street", bus → "Blocked by the bus", car → "Blocked by a car", own turret → "Overlaps a building", teammate → first run "` is standing there`" (a test teammate with no name: fixed, D9) then "A teammate is standing there", zombie → "A zombie is in the way". Shots in `docs/art/5-17/` (README lists them).
- Hold: teammate on the ghost for two frames then off → red look stayed **267 ms / 283 ms** (≥ 250). (Built first with the hold counted from when the reason appeared: a long red went valid on the first valid frame; review L1 changed it to 250 ms of continuous clear.)
- Consistency: every frame for 1.5–4 s with a pinned and with a walking zombie, `placement.shownError`, `hudModel.placementValid`, the ghost's colour bit and the culprit's visibility agreed (0 mismatches in 246 frames). An early zombie screenshot showed a green ghost under a red reason while the zombie walked off; the per-frame check found no mismatch, so that was the capture landing on a transition (re-shot with the zombie pinned).
- Culprit redraws: fixed culprits redraw once per change (`redraws` +1 per scenario); a walking zombie / teammate redraws when it moves > 1 cm (Graphics clear + a few lines; no objects created).
- No console or page errors.

### Completion Notes List

- **Shared** (`buildings.ts`): `blockReason(world, ownerId, box, exceptId = 0, out?)` returns the first cause (off map → spawn → solid/cover → building → me → teammate → zombie) with its culprit (spawn/solid index, building/zombie id, player id) into a reused object; `footprintBlocked` / `placementError` untouched. Exported with `BlockReason`, `BlockCause`, `createBlockReason`.
- **Client texts** (`scenes/blockText.ts`): Downtown name table (bus, petrol pumps, dumpster, walls), cover words by kind, "a wall" fallback; `placementHintText` (cap, money with 5.16's texts, then the spot). The GameScene caches the line by (error, cause, culprit, wallet, type).
- **Hold** (`scenes/placement.ts`): `Placement.explain` after `check` computes the reason on the same box and keeps the shown error/reason ≥ `controls.build.reasonHoldMs` (250) before valid; a new reason shows at once; cancel/start reset it. `stepPlacement` fills the HUD from the shown state; `PlacementFrame` gains `nowMs`, `hintText`.
- **World drawing**: `BuildingView` draws the held look (hatch 0.25 m / white 25 %, ✕ 0.4 m capped to the box), rings from `rangeRings(stats)` (generic `rangeM` / `*RadiusM` / `radiusM`; mine colours kept; dimmed while blocked). New `BlockReasonView`: spawn circles once per map (shown while holding), culprit outline redrawn on change. `dashes.ts`: dashed circle. All Graphics; no texture (brief 20), `noUnregisteredTextures` passes.
- **Balance**: `controls.json › build.reasonHoldMs: 250` (zod 0..2000, default).
- **Copies (brief 2)**: no sim copy touched; no message/schema/server change; 0 B/s.
- **Tests**: `blockReason.test.ts` (4: 60,000-box fuzz over 40 layouts incl. 3 m past every edge with order + culprit checks and per-cause liveness > 50 each; exceptId fuzz vs the World without the building; off-map-and-spawn → off map; me/teammate/out); `blockText.test.ts` (4); `placement.test.ts` (+4: hold 249/250 ms, reason→reason restarts, blocked at once, long red, reset on cancel/start, off-map reason); `rangeRings.test.ts` (3), `ghostHatch.test.ts` (3), `dashes.test.ts` (1), `balance.test.ts` (+1).
- **Mutations (brief 9)**, one per new test, all **killed** (13): blockReason skips spawns; exceptId ignored; an out owner still blocks; sandbags word; money not before the spot; no hold; hold clock not restarted on a new reason; cancel keeps the shown reason; `projectileRangeM` drawn as a ring; hatch spacing × 1.1; ✕ not capped; dashed circle drawn solid; `reasonHoldMs` unbounded.
- **Full gate** on `story-5-17` (master `d526464` + this story): `npm run typecheck && npm run lint && npm test && npm run build` → exit 0; **257 files passed / 1 skipped, 2,089 tests passed / 3 skipped**; build OK. Load average 0.8 at the start, 3.4 at the end (4-core container, this builder alone).
- **Not verified**: a real phone; online play (no game server: teammate names come from `playerInfo` as for the repair panel; the solo test teammate had no name); `?lag=150&jitter=20` (the reason is of this device's World, so interpolated teammates/zombies can differ from the server, as 5.15 L7); the "me" cause in the browser (never reachable at the default carry gap; unit-tested); the `BuildingView` / `BlockReasonView` wiring has no unit test (Phaser) — covered by the browser per-frame consistency check only; a decay-stage-2/3 World in the browser (cover words checked in the unit test at stage 3); 5.10's rings (generic reader unit-tested with fake `heal` / `light` blocks).

### File List

- `_bmad-output/implementation-artifacts/5-17-why-it-s-red.md` (new), `sprint-status.yaml`
- `packages/shared/src/buildings/buildings.ts`, `blockReason.test.ts` (new); `packages/shared/src/index.ts`
- `packages/shared/src/config/balance/controls.json`, `balanceSchema.ts`, `balance.test.ts`
- `apps/client/src/scenes/placement.ts`, `placement.test.ts`, `blockText.ts` (new), `blockText.test.ts` (new), `GameScene.ts`
- `apps/client/src/render/BuildingView.ts`, `BlockReasonView.ts` (new), `rangeRings.ts` (new) + test, `ghostHatch.ts` (new) + test, `dashes.ts` (new) + test
- `docs/art/5-17/README.md` + 16 screenshots (new)

### Change Log

- 2026-11-23: Story written (gds-create-story) from the code on master `d526464`. Status → in-progress.
- 2026-11-23: Built (gds-dev-story): shared `blockReason` + fuzz, reason line, culprit outlines, spawn circles, hatch + ✕, generic range rings, 250 ms hold. Status → review.
- 2026-11-23: Review lows L1–L5 + four surviving mutants fixed; merged master; status → done.
