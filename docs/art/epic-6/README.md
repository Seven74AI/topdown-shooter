# Epic 6 looks (code-drawn proposals)

`looks.html` is self-contained (open it in a browser). Sections: 1 Ruins (RU1–RU4), 2 Collapse (CO1–CO4),
3 Blackout lighting (BL1–BL4), 4 Behemoth (BH1–BH4 + tells on the map), 5 Special events (EV1–EV5, variants
per card), 6 Evacuation vote (EX1–EX3) and dawn (DW1–DW3). Designer picks: `docs/epic-6-decisions.md`.

The street is the real Downtown map drawn by the game's own code (`apps/client/src/render/city/*`, read-only),
bundled with esbuild. Rebuild after editing `src/`:

    npm ci            # once
    node docs/art/epic-6/src/build.mjs

- `src/cityEntry.ts` — bundle entry: bakes any rectangle of the map at any stage like CityView (base +
  overlay + lightmap multiply + glow add), with an `extra` painter before the light and power on/ruins/off.
- `src/lib.js` — round D helpers (part shading, textures, fire-lab D particles), copied unchanged.
- `src/main1–5.js, main8–9.js` — the new art and the page.
- `ingame/` — screenshots at 1240 and 390 px wide (frozen frames, `?t=` seconds). `?static` = reduced motion.
