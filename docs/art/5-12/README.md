# Story 5.12 browser check (800 × 360 CSS px, phone landscape, headless Chromium)

All art is game code (Canvas 2D through `addGeneratedTexture`, atlased), ported from the designer's round D picks in
`docs/art/epic-5/round-d/looks.html`:

- **Consumable icons: CI4** (realistic painted objects) — the GR6 painter family of Story 5.11
  (`render/city/itemIcons.ts`, drawings `medkit`, `grenades`, `molotovs`; `{ tag: false }`), baked by
  `render/city/consumableIcons.ts` into the atlas `hud_consumable` (120 px frames = 40 CSS px at dpr 3;
  `icon_consumable_medkit_a`, `_grenade_a`, `_molotov_a`). The DOM shop uses the same bake as a data URL.
- **Hand grenade: all three kept** — HG1 pineapple (base), HG2 smooth M67, HG3 can-shaped; **molotov: all three kept** —
  MB1 wine bottle, MB2 beer bottle, MB3 flask, each with its rag. `render/city/throwArt.ts` → atlas `atlas_throwfx`
  (`fx_handgrenade_a|b|c`, `fx_molotov_a|b|c`). The look of a throw is `throwVariant(landing point)` (shared, whole
  centimetres: every client and solo draw the same; cosmetic only, no simulation stream drawn). The rag burns with a
  pooled 4.12 flame sprite in flight.
- **Molotov ground fire = the 4.12 fire-lab D particle fire** (`FireView` in a new pool mode: no car-shaped spawn
  areas, the MB spread looks — MB1 even pool, MB2 forward splash along the throw, MB3 joining puddles), ring flames
  and a thin ring line at EXACTLY the 3 m damage edge, soft flickering ground light, fading over the last 0.6 s.
  Budget in `consumables.json › fx` (particle share, smoke share, ring spacing, and caps over all live zones).
- **Grenade blast = EX2 shockwave + debris** (round C; `explosion.happened` kind `hand_grenade` → `blastLookFor` = shockwave).

Solo shots: dev build, `?solo=1&wallet=1000`, dpr 2 (the slot set directly in the solo World for the molotov and
medkit shots). Online shots: own server (`DEV_STARTING_WALLET=1000`, `ALLOW_SOLO_START=1`) and Vite on private
ports, `?lag=150&jitter=20&wallet=1000`, dpr 1.

| File | What it shows |
| --- | --- |
| `5-12-shop-consumables-800x360.png` | The shop's always-available Consumables section: Medkit ×1 $60, Grenades ×3 $80, Molotovs ×2 $100 (CI4 icons). |
| `5-12-shop-bought-full-800x360.png` | After buying grenades: Grenades ×3 reads "Full" (disabled: a refill at full is `already_full`); Medkit and Molotovs note "Replaces Grenades ×3". |
| `5-12-hud-build-greyed-800x360.png` | Build phase with the build bar (before the follow-up, one weapon: no swap): the consumable button above the grid; grenades greyed (waves only, D3). |
| `5-12-build-buttons-568x320.png`, `-800x360`, `-1024x768` | Main-session decision: in a build phase the consumable button (medkit, usable at 40 HP) and swap sit in a row above the build bar's top-left edge; E there healed 40 → 90 at every size. |
| `5-12-hud-wave-ring-800x360.png` | Wave: the button (grenade, 3) and the throw's landing ring — the exact 2.5 m blast — at the mouse distance. |
| `5-12-grenade-flight-800x360.png` | Aimed onto the bus: the round lands at the bus's near face (PR #5 lob rule: it flies over cars/bus, a roof aim lands at the near face) and bursts (EX2, ring at 2.5 m). |
| `5-12-grenade-blast-800x360.png` | The blast's dust ring and debris a moment later. |
| `5-12-molotov-flight-800x360.png` | A molotov bottle in flight (its rag burning) with the warm landing ring (3 m). |
| `5-12-molotov-fire-800x360.png`, `-late-` | The molotov fire: flames packed at the 3 m ring, the inside burning, smoke and embers; 2.5 s later still burning. |
| `5-12-hud-medkit-full-800x360.png` | Medkit at full HP: greyed (not used, AC 4). |
| `5-12-hud-medkit-800x360.png` | Medkit at 30 HP: usable (E healed 50). |
| `5-12-online-lag150-pending-800x360.png` | Online, `?lag=150&jitter=20`, 5 E presses 40 ms apart: one grenade in the air, the button dimmed (pending) until the state's count dropped. |
| `5-12-online-lag150-800x360.png` | The same run after the game loop slept 3 s and woke: slot and count still the server's (grenades 2). |

Measured in the same runs:

- Online, `?lag=150&jitter=20`: 5 taps in 200 ms → **1** `consumable.used`, **1** throw; the state's count 3 → 2; the
  HUD count never showed less than the state (0 frames below). After the loop slept 3 s and woke: still grenades 2.
  Not verified: a sleep across a build start (the run was mid-wave), a late Game scene start.
- `?stress=150` headless (preview build, dpr 1, 15 s of rAF after a 6 s warm-up; **medians of 5 interleaved rounds**,
  load 3.0–4.2 on 4 cores — the browser itself; single runs vary ±5 %), with the review budget (8 zones ≤ −30 %,
  1–2 zones ≤ −10 %) and the final `consumables.json › fx` (particle share 0.25, smoke 0.1, ring flames every 1.2 m,
  caps over all zones 80 particles / 64 ring flames, ground light only while 1 zone burns; the ring line is now a
  pooled baked image — a Phaser Graphics circle was re-tessellated every frame and cost ~3 fps on its own):

  | Case | fps (median) | vs baseline |
  | --- | --- | --- |
  | `?stress=150` | 39.6 | — |
  | `&stressbuild=molotov:1` | 35.7 | −10 % |
  | `&stressbuild=molotov:2` | 36.6 | −8 % |
  | `&stressbuild=molotov` (8 zones) | 30.4 | −23 % |
  | `&fx=low` | 40.7 | — |
  | `&fx=low&stressbuild=molotov` (8 zones) | 30.7 | −25 % |

  Even near-zero particles cost ~−8 % for 2 zones (the rings, the 8 minimum ring flames per zone, the per-zone
  update): that is the floor of this look in headless software GL. Real phones not measured.
