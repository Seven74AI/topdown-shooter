# Dead City model creation: effects (FX) and warnings

An addition to `SKILL.md` in this folder, for effects and the boss's warnings (photoreal group 5). It is kept in its
own file so it merges cleanly with Story 9.15's `SKILL.md` (PR #34). Everything in `SKILL.md` still applies. Read
"model" as "effect" and "pose" as "moment".

## FX 1. Picks (designer 2026-11-26)

- Group 5 = **FX** (picked "A: FX (Recommended)" over icons).
- **The Behemoth's warning art is in group 5** ("In. I'm curious to see how they would look like. So add them
  too."): slam countdown disc, throw ring, charge lane, CRASH mark, P1 warning display, ground damage.
- Decisions per element live in `docs/art/photoreal-decisions.md` › "FX (photoreal group 5)".

## FX 2. One idea for the whole family (applies SKILL.md section 1 to a group of effects)

**"Every effect is light or matter, and the street keeps the mark."**

- **Light** (muzzle flash, fire, blast flash, sparks, acid glow, warnings) is emitted:
  - added on top (ADD);
  - a white-hot core that cools to its colour by temperature;
  - a short light pool on the ground and on bodies nearby;
  - gone first.
- **Matter** (blood, bile, bits, chunks, smoke, dust, gas, acid, rain):
  - lit by the street's one key light from the upper left (cool tint);
  - solid bits cast a soft shadow down-right;
  - thrown away from its cause, falls and settles;
  - only acid and infection glow (yellow-green), never blood or smoke.
- **The mark** (scorch, blood, puddle, crater, cracks, wet patch) is what stays: matte, darker than the street, on the
  game's own lifetimes.
- **One clock per event:**
  - light peaks first (0–0.05 s);
  - matter flies (to ~0.4 s);
  - smoke and dust rise after;
  - the mark stays.
- **Colours keep their meaning:**
  - red = danger (warnings, zombies);
  - amber = your window (CRASH) and events;
  - yellow-green = acid / gas / infection;
  - blood is dark red-brown, never the warning red;
  - flame is amber-orange, kept apart from the warning red.
- **Warnings: readability first.** A take keeps what the warning tells, its size in metres, its timing and its colour.
  Check it at game size.

## FX 3. Method for an effects page

- **The "Now" column is the game's own paint code.**
  - `docs/art/photoreal-5/src/build.mjs` swaps `render/city/canvasTexture.ts` for a page shim (`textureShim.ts`).
  - The game's `ensure…()` builders, given a fake scene, then paint onto plain canvases, and the page cuts the frames
    out.
  - Shapes the views draw on the fly (FxView arcs, Graphics) are redrawn from the view code with the same numbers.
- **A look works like the game:** `bake()` makes its textures once, then `draw(t)` only composes sprites (position,
  scale, rotation, alpha, ADD).
  - No canvas or gradient is made while playing.
  - The sprite count per event and the texture memory are measured on the page against `controls.json › fx` and
    `?fx=low`.
- **Each element card holds:**
  - the brief;
  - how the game uses it now (files, numbers);
  - Now and the takes on the same night street, zoomed and at game size (36 px/m), playing, with stills at the key
    moments;
  - the action plan (lanes: light, core, matter, smoke, mark, game);
  - a decomposition drawer: textures, the frames the game shows and when, consecutive-frame diffs (identical frames
    flagged), the part inspector, peak sprites, performance.
- **Picks by code:** `${element}-A` / `-B` (MZ-A, EX1-B, SD-A …).
