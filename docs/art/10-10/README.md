# Story 10.10 — hybrid Build button (BU-1 = B): browser stills

Real game (dev client, solo practice), Playwright + the preinstalled Chromium, dpr 2, phone touch emulation, no videos.
Script: `stills.cjs` (run a dev client on port 5310 first; see its header). Compare with the BU-1 option stills in
`../build-ui/` (`build-ui-B-<568|844>-<closed|open>.png`, `build-ui-today-<568|844>.png`).

| State | 568 × 320 | 844 × 390 | How it was staged |
| --- | --- | --- | --- |
| Closed: quick tile + Build (count badge) + Shop chip | `10-10-568-closed.png` | `10-10-844-closed.png` | `?solo=1&wallet=400&unlocks=all` |
| Open: 3 × 3 panel, Close on Build's spot | `10-10-568-open.png` | `10-10-844-open.png` | as closed, then a tap on Build |
| Short of money (open; 40 % + red price, the agreed 5.16 exception) | `10-10-568-money.png` | `10-10-844-money.png` | `?wallet=60`, Build tapped |
| At the cap: closed (6/6 badge, dimmed quick tile, ↶ above the quick tile) | `10-10-568-cap.png` | `10-10-844-cap.png` | six wood barricades placed with `1` + Space |
| At the cap: open (every tile at 40 %) | `10-10-568-cap-open.png` | `10-10-844-cap-open.png` | then a tap on Build |
| ≤ 2 types (BU-3): the 2 tiles in the corner, Shop chip, no Build, no panel | `10-10-568-short.png` | `10-10-844-short.png` | `?unlocks=starter` (a new account) |

Measured hit rects (CSS px) match B's mock exactly: at 568 × 320 Build 496,248 · quick 432,248 · Shop chip 500,188 (48) ·
panel cells 368…552 × 120…304; at 844 × 390 Build 772,318 · panel 644…828 × 190…374.
