# Hordes home-screen icon: proposals (Story 10.5, decision 10.5-Q1)

Four options drawn in code (`icons.js`, Canvas 2D, no Phaser), following `.claude/skills/dead-city-model/SKILL.md`.
Each one is a full-bleed 512 px square (opaque, as iOS requires), with its subject inside the central 80 % circle so
the Android maskable crop keeps it. **Stills only.**

| Code | One idea | What it shows |
| --- | --- | --- |
| **IC1** (recommended) | The one light you stand in | The default survivor (blue jacket, cap, pack, rifle) seen from above in a streetlight pool on wet asphalt, rifle aimed at the top right. The lamp is up-left (the game's `LIGHT_DIR`), so the amber rim is on the up-left edges and the shadow falls down-right. A worn lane marking shows where the pool reaches. |
| **IC2** | You are the last light; they close in | Seven zombies close in on the edge of the only light, with more behind them in the dark. The survivor is one amber dot. The light comes from the centre, so their rims face inward and their shadows fall outward. |
| **IC3** | The game's own badge | Lumen LF5: a bevelled gunmetal plate, a charcoal glass face, an amber H inside a crosshair ring. No scene. |
| **IC4** | It sees you first | The Behemoth's head and hunched shoulders from above, facing you, in shadow (a faint cold sky rim only). Its enraged eyes (`BH_EYE_ENRAGED_RGB`, red = boss danger) are the only light: they light the brow and throw a red pool on the ground ahead. The shoulder splits are dark (take C's one kind of damage). |

## Stills (`stills/`)

- `comparison.png`: all four at 60 pt on two phone home screens (dark and light wallpaper), DPR 2, "Hordes" under
  each icon; rows: iOS rounded square, Android circle (maskable), Android squircle (maskable), next to three neutral
  system-style apps, and in the dock.
- `sheet-IC1.png` … `sheet-IC4.png` (DPR 1, so 60 px is 60 real pixels): the 512 px icon; 180 px and 60 px on a dark
  and a light home screen (iOS, maskable circle, squircle, unmasked, 32 px favicon); the maskable guide (the part
  outside the dashed 80 % circle is cut) and the crops at 180 px.
- `icon-IC1.png` … `icon-IC4.png`: the 512 px icons alone.

## Re-render

`NODE_PATH=$(npm root -g) node docs/art/icon/render.mjs` (uses the preinstalled Chromium through Playwright; opens
`index.html`, which draws every still, and writes them to `stills/`). Deterministic: seeded noise, no `Math.random`.

After the pick, Story 10.5 T2 ports the picked option to `tools/art/icons/drawIcon.ts` (node canvas) and bakes
`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon-180.png` and `favicon-32.png`.
