# Photoreal rework: designer decisions

The designer asked (2026-11-24) to rework the game's art photo-realistically, in the style of the boss slam's
ground damage, one group at a time with a before/after page each.

| Group | Decision | Where |
| --- | --- | --- |
| Street props and vehicles | **Approved** (2026-11-25): cars on a real-sedan body, burnt cars without rust, sharp dumpster, pump, rubble, sandbags, both barriers. Not in the game yet: these need the switch to pre-made image files (planned for Epic 9). | `docs/art/photoreal-1/` (page: `compare.html`, source `src/pilot.ts`, renderer `src/relief.ts`) |
| Zombies and survivors | **Approved: take 4 with today's grey see-through outline** (2026-11-25, "the new gray outline version is perfect"). Today's drawings kept with every detail, relit (rounded volumes, cool key light, cloth and skin texture, gloss), the outline left exactly as today, and animated (breathing, weight shift, glow pulses with bloom, Spitter acid drips, chainsaw shake, drifting sheen). Bloaters: glowing veins with travelling pulses on every look (BL4 and BL5 too) and glossy bubbling acid sacs. Walkers, runners and crawlers: new detailed designs (`src/commonz.ts`) with real limb animation. Earlier tries declined: take 1 (rebuilt bodies), take 2 (relit, no animation), take 3 (Meshy-referenced rebuild: lost details, weapons didn't match). Not in the game yet. | `docs/art/photoreal-2/take4-grey.html` (approved), `take4.html`, `outline.html`; source `src/take4.ts` (KEEP_OUTLINE), `src/commonz.ts`; Meshy references in `refs/` |
| Other groups (Behemoth, buildables, FX, icons) | Not started. | |

Related decisions from the same review (in the game): the police barrier looks B1 + B3, the glowing countdown slam
warning with sparks, the R1 + R2 + R3 ground damage, and the P1 boss warning display. See `docs/art/asset-fixes-1/`
and the asset review in `docs/art/asset-review.md`.
