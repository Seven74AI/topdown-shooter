# Story 5.27 browser shots (headless Chromium, mobile emulation, solo practice)

Taken with `node docs/art/5-27/shots.cjs docs/art/5-27` against the client dev server on its own port (5427,
stopped by PID). `?solo&zdmg=0&shopall=1&wallet=<n>`, dpr 2.

| File | What it shows |
| --- | --- |
| `5-27-affordable-{800x360,568x320}-dpr2.png` | `?wallet=5000`: all six shop buildings with their I1 icons (barricade, turret, spikes, mine, **floodlight FL1**, **med station MS10**), full opacity. |
| `5-27-short-{800x360,568x320}-dpr2.png` | `?wallet=100`: turret ($250) and med station ($400) at 40 % with red prices; the floodlight at exactly $100 stays lit. |
| `5-27-closeup-*.png` | The bar alone (bottom-right 270 × 150 CSS px) from the same pages. |

State read from the HUD: every visible tile icon is `hud_build:icon_build_<name>_a` at 96 × 72 canvas px. No page errors.
The bear trap is not in these shots: its building type arrives with Story 5.14 (the icon is baked and mapped; see `icons.html`
for the designer's rendering of it in the bar).
