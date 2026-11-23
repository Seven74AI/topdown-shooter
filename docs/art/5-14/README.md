# Story 5.14 art (bear trap)

All art is game code (designer's Epic 5 art method): `apps/client/src/render/city/buildingArt.ts ›
drawBearTrap(g, w, h, closed)`, ported from the designer's pick **B-T1** (`docs/art/epic-5/round-a/code-drawings.html ›
bearTrap()` / `drawBT1`) and drawn once into the buildings atlas (`atlas_buildings`, 96 px per metre, `addGeneratedTexture`).

| Atlas frame | Use | Footprint |
| --- | --- | --- |
| `building_beartrap_open` | armed: round steel jaws lying flat, 7 teeth each pointing in, round pressure plate, a leaf spring each side, a chain to a stake (the build-bar tile too, until an I1 icon) | 1 × 1 m (trap ≈ 0.8 m) |
| `building_beartrap_closed` | holding or sprung (D11): the same trap with both jaws stood up on the hinge line — from above one raised steel bar with the teeth meshed in a zigzag, springs relaxed, the plate half hidden | 1 × 1 m |

In game: the plate ring (0.35 m, the sim radius) in every build phase; during a wave a yellow ring on a
sprung trap (stand here 1 s to re-arm) and a yellow arc round it that fills while my survivor stands on it.
A snap shows a small white ring pulled in and a metallic double clack. No box shadow (round art).

Screenshots (Playwright headless Chromium, solo dev build `?solo&wallet=3000`, 844 × 390 at DPR 2, 2026-11-23):

- `5-14-build-phase.png` — 6 bear traps round the survivor in a build phase, plate rings drawn; the build bar shows the $50 tile.
- `5-14-caught.png` — wave 1: a Walker held in the top trap (closed frame), the others open.
- `5-14-rearm.png` — my survivor on a sprung trap (yellow re-arm arc), another sprung trap with its yellow ring and 75/100 HP bar (one catch).
- `5-14-bear-trap-open-closed.png` — the two atlas frames side by side at 3× (for the designer's D11 review of the closed look).
- Readability sheet pictures: `docs/playtests/milestone-1/objects/40_bear_trap_open.png`, `41_bear_trap_closed.png`.
