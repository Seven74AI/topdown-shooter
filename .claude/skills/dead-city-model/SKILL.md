---
name: dead-city-model
description: 'Design and draw a game model (character, boss, zombie, prop, buildable) in code for topdown-shooter, in the Dead City photoreal style, as ONE coherent model, and take it to a designer pick. Use when asked to create, redraw, rework, "photoreal" or propose looks for any model or art group, or to add detail to an existing one.'
---

# Dead City model creation

Rules for making a model for this game. They come from the designer unless noted, with the date and their words
where we have them. When the designer gives a new rule about models, add it here (edit the rule in place; don't
append a superseding note). Decisions per art group live in `docs/art/photoreal-decisions.md`; the style summary
is `docs/art/visual-direction.md`.

## 1. The model is ONE thing (designer 2026-11-26)

> "Rethink the whole thing together. Do not just superpose things. Each element has to be thought of, and done
> while keeping the other elements in head. The goal is to have a coherent model at the end, that follows our
> style and creation method."

Before drawing anything, write the model's **design brief** (in the source file's header and on the proposal
page):

1. **One driving idea**: a single sentence that explains the body and everything on it. For example, the
   Behemoth: *"a body that grew too fast for its skin"*.
2. **Derive every element from it**, and say for each one why it is there and where it sits *because of*
   the others. No element may be placed at random, and no layer may simply be added on top of the drawing.
   Ask, for every element: what made it, why there, what does it touch, does it agree with the light, the
   clothes, the pose and the look's identity?
   - Anatomy first (masses, grooves), then what follows from it: damage where the stretch or impact is, veins
     in the grooves feeding that damage, clothes torn where the body burst out, dirt and debris where the
     body hits things, blood only where something went in.
   - **One kind of damage**, not three (the Behemoth's random cracks, generic wounds and veins became one
     system: splits fed by veins).
   - **One glow system**: every glowing part of a model shares one source and one rhythm (veins, splits and
     eyes pulse on the same heartbeat). Identity glows of another meaning keep their own colour and do not
     join the beat (BH3's green pustules = infection).
   - Things worn or fused (clothes, armour, shields, plates) **cover** what is under them. Veins, splits and
     glow never sit on cloth, armour or a shield ("How can veins be on a shield?", 2026-11-26). Draw body
     detail under the clothes, in the body's own drawing, per part, so it also moves with the limbs.
3. **Per variant (look)**: the same anatomy, and each look's identity explains its own differences (BH1 the
   lab prototype: a split stapled shut; BH2 the site worker: concrete dust; BH3 overgrowth: tumours grew out
   of the splits; BH4 riot cop: flesh swells round the fused armour and tears at its rims).
4. **Check the whole at the end**: all looks, calm and enraged/active, every pose, frozen and animated.
   Hunt for inconsistencies and weird placement before showing it (the designer asks "double check for any
   inconsistencies or weird placement/shape").

## 2. Style: Dead City photoreal

- Gritty, realistic 2D, strictly **top-down** for sprites (barricades are the exception: standing, from a
  raised camera, heights × 0.6). Real proportions and real-world references. "Premium AAA", "photorealistic,
  like the ground damage", "not cartoonesque". Rejected: stickers, flat neon, cartoony cracks, rust on a fresh
  burn, shapes that don't match the real thing.
- **One key light from the upper left** (`palette.ts › LIGHT_DIR`), cool tint (0.93, 0.98, 1.06), dark
  ambient ~0.14, soft shadow down-right. Every hand-drawn highlight agrees with it.
- **Never flat fills**: weave on cloth, aggregate on concrete, mottle on skin, gloss on dark plastic, metal and
  glass.
- **Colour meanings in play**: red = danger (boss danger and zombies; menus may use red freely); amber = an
  event you can use; yellow-green = gas / acid / infection; white = pick-ups and people. Muted palette
  (`palette.ts`).
- Characters keep **today's grey see-through outline** exactly ("perfect"; don't "fix" it).

## 3. Creation method

- **Art is game code** (Canvas 2D), never pre-made images. Meshy (api.meshy.ai) only for references, credits
  are low.
- **Keep the chosen design, raise the rendering.** Keep today's silhouette, look identities and details;
  never rebuild bodies from generic shapes (zombie takes 1 and 3 were declined for losing details). A
  rethink re-organises the detail into one model; it doesn't throw the design away.
- Things that **stay unchanged** unless the designer says otherwise: frame size, poses and pose geometry,
  outline / "outline + eyes" frames, warnings and tells, tints, hit flash, windups, collision.
- **Proposal page** under `docs/art/<group>/`: a "Now" column next to the takes, on the same night street,
  every look and every pose, calm and active, animation toggle. **Stills, no videos.** Publish it (Artifact)
  and give the link. Build the page with esbuild from a `src/` folder that imports the game's art code.
- The designer **picks by code** (take letter, option code). Never infer a pick; ask. A pick plus changes is
  recorded in `docs/art/photoreal-decisions.md` with their words and date, then built as a story.
- Draw with the game's kit (`render/city/bruteArt.ts › artKit`: `part`, `blobPath`, `drawLimb`, `fist`,
  textures), in metres around the body, facing +x, `r` = body radius. Relight with the characters' in-game
  relight (`render/city/charRelight.ts`), supersampled ×2.

## 4. Drawing for the relight (lessons, 2026-11-26)

The relight turns colour regions into volumes and colour edges into creases. So:

- **No hard-edged specks.** Every small hard-edged dot gets its own crease ring and reads as a dotted mark
  (grit on fists looked like lettering). Dust and grime are soft radial patches, low contrast.
- **No fine parallel lines** (striations): once relit they look like crumpled paper.
- **Grooves and seams soft** (a dark groove at -0.42 shade read as a second outline; use about -0.26, thin).
- Don't bake strong highlights that the relight will light again: suggest the form with soft colour steps.
- **Size detail for the game scale** (~35–36 px per metre; the 4 m Behemoth is ~144 px across): nothing
  under ~1 px there. Few, large marks beat many small ones (twelve small splits read as a rash; four large
  ones read as wounds). Teeth only when the mouth is open.
- Emissive detection (`charRelight.ts`): only saturated, bright pixels glow (acid h 80–135, flame h < 45 or
  > 330, pilot h 190–240). A wound that must not glow is dark and desaturated when calm.
- Page-side glow made from a **marker colour** (pure magenta `#ff00ff`, replaced before the relight) needs a
  dead zone: cloth stains tint faintly toward magenta and showed as round ghost glows. Convert thin
  anti-aliased marker lines fully, or they show pink.
- Things a later layer must not paint on: draw source-atop inside a clip of the part's own shape (torso
  lumps, limb ellipses), before the clothes.

## 5. Animation: goal first, then each part, then one timeline (designer 2026-11-26)

> "The goal should be determined before we animate each part. So we can then decide what each part has to do and
> how we coordinate them all together." · "They should work taken apart, but we should also check that they
> compose correctly with the other elements."

Plan every action BEFORE animating anything, as a proposal on the page (the Behemoth's: section "Action plan",
code in `docs/art/photoreal-4/src/boss4.ts › PLAN`, `actionPlan`), and get the designer's go:

1. **List the model's actions from the game** (states and frames, see section 6 step 1), with their **real
   durations** from the balance JSON (the Behemoth: slam warning 1.2 s + recover 0.8 s, charge warning 1.0 s,
   rush ≤ 1 s, stun 2 s, throw lift 1.0 s + flight 0.8 s, roar 1.5 s, collapse 1.5 s, a step every 0.65 m).
2. **Write each action's goal**: what the player must read or feel, in one sentence ("Get out of the ring NOW:
   power builds through the warning, then everything is released at once on the hit").
3. **Give every part a job that serves that goal**: pose/frames, torso (breath, swell), eyes, glow, clothes,
   dust/debris, and the game's own warning FX. A part with nothing to do is told to stay still.
4. **Put all parts on one timeline** (a dope sheet: one lane per part, bars in seconds, accents on key moments,
   new things marked). Coordination rules that held for the Behemoth (reuse them):
   - **Tells first**: during a warning the pose carries the read; eyes and glow only build toward the hit,
     never pulse against the countdown.
   - **One clock**: steps, breath and heartbeat share one rhythm (the breath rides the steps; the enraged beat
     lands on every 3rd footfall).
   - **Release together**: at a release (hit, crash, throw, roar) everything peaks in the same ~0.15 s (glow,
     eyes, dust, game FX), then settles.
   - **Weak = dim**: helpless states turn glow and eyes down; death puts them out first.
   - **Secondary follows**: dust, falling grit and settling come after their cause.
5. **Show the composed key moments**: at each key time, the model with every element as planned at that moment
   (frame + glow level + eye level), so the composition is checked, not only the parts. Note what the
   composition shows (a pose that hides another part's job, two moments that end on the same picture).
6. **Play the plan** on the page (designer 2026-11-26: "it would be cool to be able to see action playing, not
   only frames"): an action player that runs each action in real time exactly as planned (the frames the game
   shows, breath, eyes, glow beats, dust, and a rough sketch of the game's own warning FX), calm / active, every
   look, speeds 1× ½× ¼×, at **game size** (~36 px/m) and zoomed. The Behemoth's: `boss4.ts › actionPlayer`,
   `planAt` (the plan as a function of time: the same function is the build's spec).
7. Only then animate in the game, and check each part **alone** (section 6) **and composed** (the player).

Base rules for motion:

- Subtle and continuous: breathing 1–3 % scale, weight shift, glow pulses with bloom, pulses travelling along
  lines, a sheen drifting over glossy parts. Limb motion via crossfaded frame loops (or swapped frames where the
  game swaps).
- One rhythm per model (the Behemoth: one beat every 1.2 s, enraged only, locked to the steps; the eyes on the
  same beat).
- In-game caps apply (`maxCharacterAnim` 12, sheen 6, Bloater FX 6, drips 8; `?fx=low` halves them);
  additive layers are never tinted by the hit flash; deterministic (no `Math.random`).

## 6. Decompose actions and animation (designer 2026-11-26)

> "Decorticate actions and animation, to verify that each element composing the whole model is behaving
> correctly."

Do this for every model before it is picked, on its proposal page (the Behemoth's: `docs/art/photoreal-4`,
section "Actions and animation, decomposed", code in `src/boss4.ts › decomposed`):

1. **Start from the game, not the page.** Read the model's frame list (e.g. `bossAtlas.ts › POSE_FRAMES`) and
   the view that picks frames (e.g. `BossView.ts`). For every frame write *when it shows*. Flag frames that are
   baked but never shown, and states that hold an unexpected frame (the Behemoth's charge and throw warnings
   held a walk frame; its charge and throw poses were never seen).
2. **Check the active state exists in the game.** A look's "enraged" / "windup" / "swell" variant drawn on the
   page may never be baked (the Behemoth's body was only ever baked calm). Say so before designing for it.
3. **Compare page animation with game animation.** The page may animate more than the game (breathing, sheen,
   glow pulse) or blend what the game swaps. Show what the game really does.
4. **Diff consecutive frames** (walk A vs B, and so on) and mark every pixel that changes: only the moving part
   and what is on it may change. Identical frames are a bug: a swing of `sin(phase)` baked at phases 0 and 0.5
   is zero both times (the Behemoth never walked); bake at 0.25 / 0.75.
5. **Element inspector**: draw each element alone in flat cyan, the rest greyed, in every frame and every look
   (a `setHighlight(element)` switch in the drawing). Check each element: sits where the brief says, moves with
   its part, is covered by what lies on it, never floats, never lands on clothes or armour.
6. **Rhythm step by step**: lay out the glow / pulse cycle in steps with its values (the Behemoth: 8 steps of
   0.15 s, eye brightness per step).
7. Write the findings on the page (game bugs found, fixed in the take, checked and fine) and in the decisions
   doc; ask the designer about game-side changes (they change what the game shows).

Lessons:

- **Detail on a moving part lives in that part's own frame.** Points are made once from the seed in the bone's
  coordinates (along 0–1, across in metres) and mapped onto each pose. Detail regrown from each pose's
  geometry changes shape between frames and flickers at every step (`behemoth5.ts › limbVein`).
- **Check derived colours.** The kit's `shade()` reads only `#rrggbb` but returns `rgb()`: shading a shaded
  colour gives black (every Behemoth death frame had a black head and spine). Convert back to hex.
- **The active state reads at least as strongly as the calm one** at every moment of its pulse (the enraged
  eyes dropped to 35 % between beats, dimmer than calm; the floor is now 75 %).
- In a pose where one part covers another (the raised slam arms over the torso), the covered detail may vanish;
  check the pose's tell still reads.

## 7. Into the game

- Characters: baked in a Web Worker at load (Story 9.13): plain drawing first, relit frames replace it; sheets
  ≤ 2048², one upload per frame, 4 ms a frame; no blank frames. Static art: pre-rendered atlas (Story 9.14).
- Every code texture through `addGeneratedTexture`; every `ensure…()` builder covered by the gallery.
- Performance: within 2 FPS and +1 ms p95 of master at `?stress=150`; no per-frame allocation; no canvas
  mask filters (≈25 % FPS).
- Verify in a real browser (Playwright, preinstalled Chromium); say what wasn't verified.

## 8. Checklist before showing a take

- [ ] Brief written: one idea, each element's reason and place.
- [ ] Nothing on clothes/armour that belongs to skin; nothing floating; nothing duplicated by another system.
- [ ] One light; one glow system and rhythm; colours keep their meanings.
- [ ] Frame, poses, outline frames, warnings unchanged.
- [ ] All looks × calm/active × every pose checked at 2×, frozen and animated; no console errors.
- [ ] Action plan approved before animating (section 5): goals, each part's job, one timeline, composed moments.
- [ ] Actions and animation decomposed (section 6): game frames and when they show, consecutive-frame diffs,
      element inspector, rhythm steps; findings written on the page.
- [ ] Reads at game scale (look at it small).
- [ ] Page published, decisions doc updated, the designer asked for a code.
