# Dead City model creation: effects (FX) and warnings

An addition to `SKILL.md` in this folder, for effects and the boss's warnings (photoreal group 5). It is kept in its
own file so it merges cleanly with Story 9.15's `SKILL.md` (PR #34). Everything in `SKILL.md` still applies. Read
"model" as "effect" and "pose" as "moment".

## FX 1. Picks (designer 2026-11-26)

- Group 5 = **FX** (picked "A: FX (Recommended)" over icons).
- **The Behemoth's warning art is in group 5** ("In. I'm curious to see how they would look like. So add them
  too."): slam countdown disc, throw ring, charge lane, CRASH mark, P1 warning display, ground damage.
- Picks: **take A for the cards up to the car fire** ("All A version. Blood A too."; later: "I didn't validate model
  after the car fire"). FS, BX, the matter family and the warnings are not reviewed yet. Two changes:
  - CS-A gets more blood ("id like more blood");
  - fire on cars is rethought ("The fire cant be a circle if the car is a rectangle. Circle may represent the heat.
    But flames in a perfect circle look weird"): FI-A is declined and FI-B is proposed.
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

## FX 4. Goal first, per effect (designer 2026-11-26)

> "Just to be sure, did you really follow model and fix skill? Because it look like you didn't follow the concept of
> picking a goal: 'show player a car is burning + zone where they get damaged.' And then think of elements needed, and
> then how they compose with each other to attend the goal."

SKILL.md section 5 (goal first) applies to every effect, before any drawing. The group's shared idea (FX 2) is not a
goal; each effect needs its own. Write these on the card's brief, in this order:

1. **Goal:** what the player must read, in one sentence, from the game's rule. For example: "this car is burning" +
   "inside this circle you get hurt (2 m, 10/s in 0.5 s pulses)".
2. **Elements, each with one job toward the goal.** Name the read each element serves. An element with no job is
   cut.
3. **Composition:**
   - where each element may and may not appear (flames only on the fuel; the circle only from heat);
   - the brightness order;
   - one clock (flicker, damage tick);
   - what may cross the edge (smoke) and what may not (bright flame).
4. Only then draw. Check the composed result against the goal at game size.

Lessons:
- **A take that swaps pictures on today's emitter is not a rethink.** It inherits today's geometry and its mistakes.
  FI-A kept Story 4.11's ring of edge flames: flames in a perfect circle round a rectangular car.
- **Separate the read from the thing.**
  - A zone the game computes as a circle can be shown by a quality that really is round (heat on the ground, a light
    pool, a line).
  - The visible source keeps the real object's shape (the car, the pool).
- **Additive light saturates.** Many overlapping added flames clip to lemon yellow, which reads green next to orange.
  Use fewer, fainter flames where they stack, and darken the base under them (burnt-out cabin soot) so the added
  light reads amber.
- **A pick covers only what the designer looked at.** "All A" covered the cards up to the car fire, where the
  designer stopped reading ("I didn't validate model after the car fire"). When a reply could cover a whole page, ask
  how far it goes before recording it for every card.

