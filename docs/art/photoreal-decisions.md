# Photoreal rework: designer decisions

The designer asked (2026-11-24) to rework the game's art photo-realistically, in the style of the boss slam's
ground damage, one group at a time with a before/after page each.

| Group | Decision | Where |
| --- | --- | --- |
| Street props and vehicles | **Approved** (2026-11-25): cars on a real-sedan body, burnt cars without rust, sharp dumpster, pump, rubble, sandbags, both barriers. **In the game since Story 9.14**: pre-rendered offline from the approved code into one image atlas (`npm run art:street-props`); the sawhorse police lines stand with the approved police set (drums at the line ends), the concrete barrier stays flat; rubble boxes keep the Ruins art (see the story's B-codes). | `docs/art/photoreal-1/` (page: `compare.html`, source `src/pilot.ts`, renderer `src/relief.ts`) |
| Zombies and survivors | **Approved: take 4 with today's grey see-through outline** (2026-11-25, "the new gray outline version is perfect"). Today's drawings kept with every detail, relit (rounded volumes, cool key light, cloth and skin texture, gloss), the outline left exactly as today, and animated (breathing, weight shift, glow pulses with bloom, Spitter acid drips, chainsaw shake, drifting sheen). Bloaters: glowing veins with travelling pulses on every look (BL4 and BL5 too) and glossy bubbling acid sacs. Walkers, runners and crawlers: new detailed designs (`src/commonz.ts`) with real limb animation. Earlier tries declined: take 1 (rebuilt bodies), take 2 (relit, no animation), take 3 (Meshy-referenced rebuild: lost details, weapons didn't match). **In the game since Story 9.13** (worker bake, capped animation: see the story's B-codes). | `docs/art/photoreal-2/take4-grey.html` (approved), `take4.html`, `outline.html`; source `src/take4.ts` (KEEP_OUTLINE), `src/commonz.ts`; Meshy references in `refs/` |
| Behemoth (group 4) | **Picked: take C, G2 A, G3 E2, G4 A** (designer 2026-11-26, "Take C / G2 A / G3 E2 / G4 A"); the action plan "ok" (2026-11-26). **In the game: Story 9.15** (`_bmad-output/implementation-artifacts/9-15-photoreal-behemoth-in-game.md`: relit in a worker, the look in play only; charge / throw poses by progress (half-way frames at k 0.25 / 0.28); enraged frames with the vein glow pulsing as one layer; eyes as their own layer; breath, sheen, dust as planned). The page's "Now" column keeps the pre-9.15 drawing (`src/behemothNow.ts`). take C (one model); G2 A = show the charge and throw poses during their warnings; G3 E2 = enraged body frames with the glow pulsing on the 1.2 s heartbeat in the game; G4 A = idle breathing and sheen like the zombies. Plus the two game bug fixes (walk frames at phases 0.25 / 0.75; death-frame colours). The designer had not yet looked at the page ("I didn't look anything yet"); the action plan (per-action timing, dust puffs, stun/death dimming) was then "ok"-ed. History: The designer picked take B + V2/V3 mix ("The mix"), then asked to "rethink the whole thing together … do not just superpose things … a coherent model". **Take C, one model**, drawn on the page next to the previous pick: one idea, *a body that grew too fast for its skin*: muscle masses of the hunched back; the skin **splits** where it stretches most (shoulder tops, flanks, biceps), replacing the random cracks and generic wounds; **veins** in the grooves from the neck base to the splits and down the arms; enraged, veins and splits glow from the same blood on **one 1.2 s heartbeat** from the neck, eyes on the same beat; clothes torn where the body burst out (strain creases), covering veins and splits; concrete in the front of the shoulders and grit in the knuckles (it rams walls), blood only at the rebar; BH1 a split stapled shut, BH2 concrete dust, BH3 tumours from the splits (green pustules off the beat), BH4 flesh swelling round the armour, torn at the rims. Silhouette, size, poses, outline frames and warnings unchanged. **Actions and animation decomposed** (designer 2026-11-26, "decorticate actions and animation"): page section "Actions and animation, decomposed". Game bugs found: the two walk frames are the same picture (baked at phases 0 / 0.5, where the swing is zero: the boss never walks; take C bakes 0.25 / 0.75); the death frames have a black head and spine (the dead skin colour was made as rgb(), which the kit's shade() can't read; fixed in take C); the charge and throw poses are baked but never shown (their warnings hold a walk frame); the body is never baked enraged (only the outline frame in the dark gets red eyes); no idle animation in the game. Fixed in take C: arm veins flickered between walk steps (now fixed to the arm), enraged eyes dimmed to 35 % between beats (floor now 75 %). **Action plan proposed** (designer 2026-11-26, "the goal should be determined before we animate each part … decide what each part has to do and how we coordinate them all together"): page section "Action plan": per action (walk, slam, charge + stun, throw, roar, death) its goal, real duration, a dope sheet (pose, torso, eyes, glow, clothes, dust, game FX) and composed key moments; five coordination rules (tells first, one clock, release together, weak = dim, secondary follows). Nothing animated yet. **Waiting for the designer's pick** (take C or the previous pick, with changes) and on the game-side questions (walk fix, charge/throw poses, enraged frames, idle animation). Rules now in the `dead-city-model` skill. Before the rethink: take B's veins checked against the Bloaters' (no colour clash), V2 / V3 / mix options, veins kept off the riot shield and clothes. | `docs/art/photoreal-4/compare.html`; take C source `src/behemoth5.ts` (header brief), page `src/boss4.ts` (`markerPulse`) |
| Other groups (buildables, FX, icons) | Not started. | |

Related decisions from the same review (in the game): the police barrier looks B1 + B3, the glowing countdown slam
warning with sparks, the R1 + R2 + R3 ground damage, and the P1 boss warning display. See `docs/art/asset-fixes-1/`
and the asset review in `docs/art/asset-review.md`.

## Things you build (photoreal group 3), 2026-11-25

- The 7 non-barricade buildables (bear traps, mine, spike trap, floodlights, med station) and their animations: approved ("All OK"). Page: `docs/art/photoreal-3/compare.html`.
- Barricades: drawn STANDING, from a raised camera (heights × 0.6), not flat from above (flat read as benches). Approved on the wood wall ("Perfect"):
  - four pictures per barricade, one per rotation: front inside (braces, props, junk), front outside (same wall mirrored, clean, rubble at the foot), side with braces east / west (braces always inside);
  - a corner piece fills the empty square where two lines meet (post + stubs over both walls), so corners close;
  - pieces run edge to edge (no holes), each placed piece is a random variant built from scavenged parts, tilted and overlapping (not "too well arranged");
  - frame 2 × 1 m (footprint unchanged), shadows cast from the real silhouette, one light direction.
- Same system for reinforced, metal and police (police corner = traffic drum): approved ("pretty cool"), with the sandbags removed from the metal barricade.
- References: Meshy images in `docs/art/photoreal-3/refs/`.

### In the game (2026-11-25, designer: "go", "use the simplest rules")

- Step 1: traps, floodlights and med station relit at atlas build (`render/city/relight.ts`), animated by `render/buildingFx.ts` (lamp flicker, med cross heartbeat, mine LED blink, steel glints) in `BuildingView`.
- Step 2: wood / reinforced / metal barricades stand (`render/city/barricadeArt.ts`, frames in `buildingsAtlas.ts`): the rotation picks the picture (rot 0 outside, rot 2 inside, rot 1 / 3 side with the braces east / west), 2 variants fixed by the spot, sorted above the bodies by height on screen (`barricadeLook.ts › standDepth`). The picture carries its own shadow (no game shadow, no top-down cracks: wear = tint + bar).
- Step 3: corner pieces appear automatically in the free square where a front line and a side line meet (`render/wallCorners.ts › findCorners`, a pooled sprite per corner in `BuildingView`), in the front line's look; visual only (no collision change).
- The relit pictures are baked progressively (`pumpBuildingsAtlas`): the plain drawings show for the first second or two, then the relit ones replace them, so the game's start isn't blocked.
- Dev check: `?stress=5&stressbuild=fort` lays a closed fort round the player.
- The police barricade is a street prop baked into the city's ground: it gets the standing look with the street props' rollout (Epic 9), not here. Done in Story 9.14.

### Bodies behind walls (2026-11-25)

- Designer pick **C, silhouette** (of six options on `docs/art/occlusion/compare.html`): the hidden part of a body behind a standing wall shows through it as a soft shape, red for zombies, blue for survivors, alpha 0.5 ± 0.08 pulsing. In the game: `render/wallSilhouette.ts` (pure: who is behind which wall) and `render/WallSilhouetteView.ts` (pooled fill-tinted copies of the body sprites on a layer just above the walls, masked by copies of the wall pictures, so it only shows where a wall covers; hidden and unmasked when nobody is behind a wall).
- Readability sheet updated: pictures 9, 18–21, 37–40 retaken; new 63 (a closed fort).
- Zombie silhouette colour: **red** stays (designer 2026-11-25, after `docs/art/occlusion/colours.html`): "red shouldn't be only for bosses: it's the colour usually used to show danger, so it works for zombie silhouettes". Rule update: red = danger in play (boss danger and zombies), not boss-only. Survivors keep their slot colours.

## FX (photoreal group 5), 2026-11-26

- Group pick: **A, FX** (designer 2026-11-26, picked "A: FX (Recommended)" over B, icons). Covers muzzle flashes,
  hits, blood, melee arcs and sparks, building feedback rings, explosions, fire, the flamethrower, the Molotov, the
  Bloater burst, acid, gas, event smoke, dust, rain. Size from the code: about 55 baked FX pictures (atlas_fx,
  atlas_blastfx, atlas_firefx, atlas_throwfx, event smoke / vapour / dust) plus about 10 effects drawn as flat shapes
  in `FxView.ts` (muzzle flash, hit flash, blood splat, death puff, debris puff, swing arc, shotgun cone, chainsaw
  sparks, repair / upgrade / sell / snap rings).
- **The Behemoth's warning art is IN group 5** (designer 2026-11-26: "In. I'm curious to see how they would look
  like. So add them too."): slam countdown disc, throw ring, charge lane, CRASH mark, P1 warning display, ground damage.
  Every take keeps what each warning tells, its size and its timing.
- Proposal page: `docs/art/photoreal-5/compare.html` (Artifact https://claude.ai/artifact/NNKM2WsZNgH1WCxZ2QTwjV;
  source `src/`, build `node docs/art/photoreal-5/src/build.mjs`). 29 element cards in 4 families, each with Now (the
  game's own paint code through `textureShim.ts`, or the view's numbers for shapes), takes A (and B where a real
  choice exists), stills at the key moments, game size, an action plan, and a decomposition drawer (textures, frames
  and diffs, part inspector, peak sprites, performance):
  - gunfire: MZ (A/B), SG, TR, HT, BL (A/B), BT, ML, CS, BF;
  - fire: EX1, EX2, GR, MO, FI, FS, BX (A/B);
  - matter: AC (A/B), GA, EV, RD, PD, RN (A/B), BD;
  - warnings: SD, TH, CL, CR, P1, GD (each A/B).
- Game findings written on the cards (for the build story):
  - muzzle flash in normal blend, lighting nothing; SMG / rifle / turret reuse the pistol size;
  - four different blood colours, one close to the warning red; one splat size for every zombie;
  - `?fx=low` misses explosions, the Bloater pool, event vapour, flare smoke, stampede dust and place dust;
  - the acid puddle pops off at 35 %; its highlight rotates with the sprite;
  - the Molotov rag flame is untinted (white); its ring pops off while the flames fade;
  - debris and chunks have no shadows;
  - destroyed metal and police barricades throw wood puffs;
  - place dust shrinks as it spreads;
  - `fx_grit_a` reads as a white speck;
  - the CRASH word is hidden under the boss, and the amber mark fades 0.3 s after the stop although the stun lasts 2 s;
  - the slam disc is one 9.1 m full-disc additive quad;
  - the crack decal is baked below game resolution (28 px/m);
  - `fx_floodpool_a` is the floodlight light pool, not water.
- Overlaps:
  - `fx_dust_a` is shared with Story 9.15's `bossDust.ts`: redrawing it restyles the boss dust;
  - BX's gas cloud follows GA's pick;
  - blood here, dismemberment stays in Story 9.5.
- **Waiting for the designer's codes** and the open questions on the page:
  - MZ-A vs MZ-B (how much light a shot throws);
  - BL-A vs BL-B (glossy pool vs matte spatter), AC-A vs AC-B (puddle glow), RN-A vs RN-B (wet street);
  - new mark pools (hit drops, splinters, gun smoke);
  - EX1's amber edge ring and EX2's white shock ring (colour meanings);
  - CRASH: amber for the whole 2 s stun, drawn above the body;
  - TH-B: the chunk's shadow as the clock;
  - HT-A: a direction on `zombie.hit`.

