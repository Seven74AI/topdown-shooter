# Story 5.11 browser check (800 × 360 CSS px, phone landscape, headless Chromium)

**Gear icons: GR6** (designer pick, round D): the GR4 painted objects on the GR2 embossed steel tag, ported
from `docs/art/epic-5/round-d/looks.html` into `apps/client/src/render/city/itemIcons.ts` (reusable painters:
Story 5.12's CI4 consumables use the same `realPainter`) and baked by `gearIcons.ts` into the atlas `hud_gear`
(96 px frames = 32 CSS px at dpr 3; frames `icon_gear_armor1_a`, `_armor2_a`, `_shoes_a`, `_revivekit_a`,
`_flashlight_a`, through `addGeneratedTexture`). The DOM shop uses the same bake as a data URL.

Solo shots: `?solo=1&wallet=1000`, dpr 2. Online shot: own server (`DEV_STARTING_WALLET=1000`) and Vite on
private ports, `?lag=150&jitter=20&wallet=1000`, dpr 1.

| File | What it shows |
| --- | --- |
| `5-11-shop-800x360.png` | The shop on open (weapons first; the Gear section is below, scroll). |
| `5-11-shop-gear-800x360.png` | The Gear section before buying: Body armor I $150, Body armor II $350, Running shoes $150, Revive kit $150 (no flashlight: `inShop: false`). |
| `5-11-shop-owned-800x360.png` | After buying armor I, shoes and the kit: those three read "Owned" (green border, disabled); armor II still $350 with the note "Replaces Body armor I". |
| `5-11-hud-800x360.png`, `5-11-hud-crop.png` | HUD: `HP 125 / 125` (armor I raised max and current HP by 25) and the three owned icons beside the HP text, in `gear.json` order. |
| `5-11-hud-armor2-crop.png` | After buying armor II: `HP 150 / 150`, the armor II icon replaces armor I's. |
| `5-11-hud-all-dpr3-crop.png` | dpr 3, `?shopall=1`: all four owned icons incl. the tactical flashlight (armor I, shoes, kit, torch), `gear 29`. |
| `5-11-online-hud-lag150-800x360.png` | Online under `?lag=150&jitter=20` after buying shoes and armor I and walking a square for 6 s: HUD from the server's state (gear 5, HP 125/125). |

Measured in the same run (online, `?lag=150&jitter=20`): the tap showed "Buying…", then "Bought Running
shoes"; state `gear 5, hp 125, maxHp 125, wallet 700`; predictor over 6 s of walking with the shoes:
**0 corrections, 0 snaps** (max error 1.4 µm, float32); after `__game.loop.sleep()` for 3 s and wake, the
state, the mirror and the HUD mask all still show gear 5.
