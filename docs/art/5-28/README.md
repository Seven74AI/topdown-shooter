# Story 5.28 browser check: early weapon card art

The 5.13 card shop with the designer's picks for the three Epic 1 weapons (`docs/epic-5-decisions.md` › Early weapon
card art): **S1** compact stamped-steel SMG, **H1** walnut bolt-action Hunting Rifle with scope, **M1** classic
black-handle Machete, ported from `docs/art/5-13/early-weapons.html` › `EARLY` into `weaponArt.ts` (`WEAPON_ICON_ART`,
icon only). The generic `KindGlyph` pictogram is gone.

Solo shots: dev build (Vite on port 5428), `?solo&zdmg=0&wallet=1000&shopcards=smg,hunting_rifle,machete`, headless
Chromium, mobile emulation, dpr 2; the shop opened through `hudModel.shopPressed`. Script: `shots.cjs`.

| File | What it shows |
| --- | --- |
| `5-28-shop-800x360-dpr2.png` | Cards #01–#03 SMG, Hunting Rifle, Machete with their side-view art; Fire Axe and two gear cards for comparison. Cards 142 × 148. |
| `5-28-shop-568x320-dpr2.png` | Same at the smallest size (cards 97 × 128), Assault Rifle beside them. |

Measured in the same runs: every card's art is an `<img>` (weapons 192 × 88 = 96 × 44 at dpr 2, gear 96 × 96), no
pictogram, no page errors. **Not verified:** a real phone; the upgrade list rows for these weapons (the same
`weaponIconUrl`, now with art) were not shot.
