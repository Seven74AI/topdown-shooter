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
- **Bodies under an effect are the game's current pictures** (designer 2026-11-28: "why it's showing the old
  zombies?"). The plain `atlas_characters` / `boss_atlas` frames are only the game's first-second fallback. Pages
  draw the relit characters (Story 9.13) and the relit Behemoth (9.15) through `docs/art/photoreal-5/src/relit.ts`:
  the game's own bake, run on the page as the asset gallery runs it. When a story changes how a model looks in play,
  the proposal pages that show it as context switch to the new picture.
  - **Draw a model's own play layers with it.** Since Story 9.15 the Behemoth's body is baked without eyes; the
    eyes are a separate additive layer. A body drawn without that layer has an empty face (designer 2026-11-28:
    "his head is bug"). `relit.ts › relitBoss` adds the eyes the way `BossView` places them. Compare a context body
    with the game's view before showing it.

## FX 5. Picks, round 2 (designer 2026-11-28)

- Kept: MZ-A, SG-G, TR-G, HT-G, BL-G, BT-G, CS-A, BF-G, EX1-G, EX2-A, FS-A, BX-G, RD-G, PD-G, RN-G, SD-A, CL-A, P1-G.
- New versions: ML-M, GR-R, MO-R, FI-R, AC-R, GA-M, EV-R, BD-R, TH-R, CR-R + ST (status icons), GD-R. The
  designer's words are in `docs/art/photoreal-decisions.md`.
- Lessons:
  - **Dust comes from where the force meets the ground** ("the dust come from the ground"), not from the hands in
    the air.
  - **One kind of mark per kind of damage.** The slam cracks and the crater were drawn by different code and read
    as two styles ("why slam cracks and craters are so different?").
  - **A mix (`-M`) keeps the picked take whole** and lays the other take's named part over it ("just superpose the
    A fog to G").

## FX 6. A revised take must change the design, not only the rendering (designer 2026-11-28)

> "I'm pretty sure you didn't follow our skills on how to create models and animation. Because how is it possible
> ACR ressemble exactly the other AC?"

AC-R kept AC-G's composition (a splat inside a glowing circle) and only re-shaded the pixels. When the designer says a
look is "not photoreal" or asks for a rethink:

1. **Start again from the goal**, with the game's numbers.
2. **Study the real thing first.** What does it look like in the world, and why (what made it, how it behaves over
   time)? Write down 3–5 observed traits before drawing.
3. **Derive the elements from those traits.** Each element has one job toward the goal.
4. **Don't reuse the earlier takes' shapes, textures or layout.** Put the new take beside them and check at game
   size that it reads as a different design. If it could be mistaken for an earlier take, it isn't done.
5. **Say in the note what is different in design** (shape, composition, motion), not only in rendering.

