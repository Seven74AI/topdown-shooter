# Photoreal rework: designer decisions

The designer asked (2026-11-24) to rework the game's art photo-realistically, in the style of the boss slam's
ground damage, one group at a time with a before/after page each.

| Group | Decision | Where |
| --- | --- | --- |
| Street props and vehicles | **Approved** (2026-11-25): cars on a real-sedan body, burnt cars without rust, sharp dumpster, pump, rubble, sandbags, both barriers. **In the game since Story 9.14**: pre-rendered offline from the approved code into one image atlas (`npm run art:street-props`); the sawhorse police lines stand with the approved police set (drums at the line ends), the concrete barrier stays flat; rubble boxes keep the Ruins art (see the story's B-codes). | `docs/art/photoreal-1/` (page: `compare.html`, source `src/pilot.ts`, renderer `src/relief.ts`) |
| Zombies and survivors | **Approved: take 4 with today's grey see-through outline** (2026-11-25, "the new gray outline version is perfect"). Today's drawings kept with every detail, relit (rounded volumes, cool key light, cloth and skin texture, gloss), the outline left exactly as today, and animated (breathing, weight shift, glow pulses with bloom, Spitter acid drips, chainsaw shake, drifting sheen). Bloaters: glowing veins with travelling pulses on every look (BL4 and BL5 too) and glossy bubbling acid sacs. Walkers, runners and crawlers: new detailed designs (`src/commonz.ts`) with real limb animation. Earlier tries declined: take 1 (rebuilt bodies), take 2 (relit, no animation), take 3 (Meshy-referenced rebuild: lost details, weapons didn't match). **In the game since Story 9.13** (worker bake, capped animation: see the story's B-codes). | `docs/art/photoreal-2/take4-grey.html` (approved), `take4.html`, `outline.html`; source `src/take4.ts` (KEEP_OUTLINE), `src/commonz.ts`; Meshy references in `refs/` |
| Behemoth (group 4) | **In progress** (2026-11-26). Veins: designer picked **V2 + V3** ("V2 + v3", after checking take B's veins against the Bloaters'): organic veins grown like the Bloaters' (thin, wiggly, branching out from the chest), dark traces when calm; enraged they glow red (red = boss danger, distinct from the Bloaters' acid green), a steady ember plus one beat running outward every 1.2 s. Drawn as **take B2** on the page. **The take itself (A, B or B2) is not picked yet.** | `docs/art/photoreal-4/compare.html` (source `src/boss4.ts` › `growVeins`, `src/behemoth4.ts` › `setDetail`, `setOldVeins`) |
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
