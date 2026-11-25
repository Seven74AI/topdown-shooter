# Story 9.11: Photoreal things you build

Status: done

## Story

As a player,
I want the things I build to look real and alive,
so that my base feels premium and readable.

Recorded after the fact (2026-11-25): the work ran outside the story flow, in the designer's asset session (branch `claude/dazzling-meitner-zhu5p0`), with every look picked by the designer on proposal pages. Decisions: `docs/art/photoreal-decisions.md`. Proposal and approval pages: `docs/art/photoreal-3/compare.html` (traps, lights, med station, barricade rounds 1–4, forts).

## Acceptance Criteria (as built)

1. **Relit traps, lights and med station.** The spike trap, mine, bear trap (open / closed), floodlights (FL1, FL5) and med station use the approved relit look (rounded volumes, cool key light, wood grain, brushed steel, rust, cloth, gloss), from their code drawings. Animated: floodlights flicker, the med cross beats (double pulse), the mine's LED blinks, glints run over steel (a capped shared pool, culled to the camera).
2. **Standing barricades.** Wood, reinforced and metal barricades are drawn standing (raised camera, heights × 0.6, the picture's own cast shadow), never turned: the rotation picks the picture (rot 0 front outside, rot 2 front inside with braces and junk, rot 1 / 3 side view with the braces east / west). Two variants each, fixed by the spot (the same on every client), built from random scavenged parts (wood), steel-faced with razor wire (reinforced) or welded plates (metal). They sort above the bodies (depth 10.45–10.6). No game shadow or top-down cracks on them (wear = tint + bar).
3. **Corners.** Where a front line and a side line meet, a corner piece fills the free square (post and stubs, the front line's look), visual only; it wears like its walls.
4. **No stalls.** The relit pictures are baked in a Web Worker (OffscreenCanvas; main-thread sliced fallback where there is none), across four sheets (props/traps, wood, reinforced, metal) so a landing picture re-uploads only its sheet. The plain drawings show until then. Graphics restore: kept pictures are CPU-backed with a sentinel pixel; re-baked only if wiped. Worker timeout, idle close, frozen-tab deadline.
5. **Dev check.** `?stress=5&stressbuild=fort` lays a closed fort round the player.

## Dev Agent Record

- Files: `apps/client/src/render/city/relight.ts`, `barricadeArt.ts`, `buildingsFrames.ts`, `buildingsAtlas.ts`, `buildingsBakeWorker.ts`; `apps/client/src/render/buildingFx.ts`, `wallCorners.ts`, `BuildingView.ts`, `barricadeLook.ts`; `apps/client/src/debug/stressScenario.ts` (`placeStressFort`). Tests: `standingWalls.test.ts`, `wallCorners.test.ts`, `buildingFx.test.ts`, `buildingsBake.raster.test.ts`, `tools/checks/buildingsBakeWiring.test.ts`.
- Reviews: the main session's fresh-agent review (no high) and three narrow re-reviews (`docs/reviews/asset-art-review-2026-11-25.md`); landed on master (02e7d8c, then ad9388f).
- Not in this story: the police barricade (a street prop, Story 9.14); the take-4 characters (Story 9.13).
