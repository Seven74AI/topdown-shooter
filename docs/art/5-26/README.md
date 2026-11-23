# Story 5.26 browser shots (headless Chromium, mobile emulation, solo practice)

Taken with `node docs/art/5-26/shots.cjs docs/art/5-26` against the client dev server on its own port (5426,
stopped by PID). `?solo&zdmg=0&wallet=<n>`. The game renders at most at dpr 2 (`MAX_DPR`); a dpr 3 page
renders at 2 and the browser scales the canvas, as for all the art.

| File | What it shows |
| --- | --- |
| `5-26-affordable-{800x360,568x320}-dpr{2,3}.png` | `?wallet=5000`: the four tiles with their own icons: wood barricade I1, auto-turret T1 sentry gun, spike trap I1, mine M1; all at full opacity, yellow prices, "0/6". |
| `5-26-short-{800x360,568x320}-dpr{2,3}.png` | `?wallet=100`: the turret tile at 40 % with a red `$250` (its icon dims with it); the others full. |
| `5-26-cap-800x360-dpr2.png`, `5-26-cap-568x320-dpr3.png` | Six mines placed (`?wallet=5000`): "6/6" in red, every building tile at 40 %. |
| `5-26-closeup-short-dpr2.png`, `5-26-closeup-affordable-568x320-dpr3.png` | 2× nearest-neighbour crops of the bar from the shots above (icons only, for the reviewer). |

State read from the HUD in each shot: every visible tile icon is `hud_build:icon_build_<name>_a` at 96 × 72
canvas px (48 × 36 CSS px × dpr 2, 1:1 with the 96 × 72 bake), alpha 1 or 0.4 as above. No page errors.
