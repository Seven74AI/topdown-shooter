# Photoreal rework: designer decisions

The designer asked (2026-11-24) to rework the game's art photo-realistically, in the style of the boss slam's
ground damage, one group at a time with a before/after page each.

| Group | Decision | Where |
| --- | --- | --- |
| Street props and vehicles | **Approved** (2026-11-25): cars on a real-sedan body, burnt cars without rust, sharp dumpster, pump, rubble, sandbags, both barriers. Not in the game yet: these need the switch to pre-made image files (planned for Epic 9). | `docs/art/photoreal-1/` (page: `compare.html`, source `src/pilot.ts`, renderer `src/relief.ts`) |
| Zombies and survivors | **Keep the current art** (2026-11-25). Take 1 (bodies rebuilt from parts) and take 2 (today's drawings relit) were both declined: "We'll keep what we currently have." Do not redo the characters unless the designer asks again. | `docs/art/photoreal-2/` (kept for reference) |
| Other groups (Behemoth, buildables, FX, icons) | Not started. | |

Related decisions from the same review (in the game): the police barrier looks B1 + B3, the glowing countdown slam
warning with sparks, the R1 + R2 + R3 ground damage, and the P1 boss warning display. See `docs/art/asset-fixes-1/`
and the asset review in `docs/art/asset-review.md`.
