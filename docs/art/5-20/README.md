# Story 5.20 browser shots (headless Chromium, mobile emulation, dpr 2, solo practice, `?wallet=5000`)

Own server (port 25620) and Vite client (port 5320), not `npm run dev`; both stopped by PID. "Practice solo", then the wood-barricade tile and Place; touches sent with CDP `Input.dispatchTouchEvent`. Each shot exists at 800 × 360 and 568 × 320.

| File | What it shows |
| --- | --- |
| `5-20-undo-holding-*` | Right after a Place (still holding, 5.18's chain ghost in hand): ↶ at the hand-cluster spot, centre (270, 64) from the bottom-right (ux-spec §4; Ready is hidden while holding), ring full. |
| `5-20-undo-draining-*` | 3 s later: the gold ring has drained to ~58 %. |
| `5-20-sold-pop-*` | ↶ pressed: the barricade is gone, "+$40" rises above where it stood (the lift-and-fade is 200 ms, mostly over in the shot), wallet back to $5000. |
| `5-20-undo-bar-*` | After ✕ (hands empty, build bar up, Ready shown and slid): ↶ on Story 5.12's consumable/swap row, left of where 5.12's consumable button goes (empty on master; review M2: placed from 5.12's `layoutRightButtons`, whose L6 branch right-aligns the row at 568 × 320). |
| `5-20-panel-take-back-*` | Tapping my barricade placed this build phase: the 3.7 panel with **Take back +$40** (one row above Upgrade). |
| `5-20-panel-sell-*` | The same building treated as "placed last phase" (dev: this phase's spend zeroed in the solo World and the label tracker): **Sell +$20**; pressing it paid $20. |

Measured (page state; no console or page errors at either size):

| Check | 800 × 360 | 568 × 320 |
| --- | --- | --- |
| Place → wallet / undo shown | 4960 / yes (hand spot 506, 272, 48 px) | 4960 / yes (274, 232) |
| Ring after 3 s | 0.57 | 0.59 |
| ↶ → wallet / buildings / chip | 5000 / 0 / hidden | same |
| "+$40" pop at the building | yes | yes |
| Bar-state ↶ rect | 476, 156 (5.12's row from 536; grid at 536, 224; Ready 276–444) | 352, 92.5 (5.12's L6 row from 412; grid 304, 184; Ready 124–292) |
| Panel label (this phase / older) | Take back +$40 / Sell +$20 | same |
| Sell +$20 → wallet | 4980 | 4980 |

At 568 × 320 the carried barricade landed under the build bar after ✕ (the camera keeps the survivor centred; a 5.21 tap-priority question), so the panel was opened by the same `RepairPanel.tap` a tap there would make.

Online (same server, `?wallet=5000&lag=150&jitter=20`, solo online run): Place + ↶ at once → building gone, wallet 5000; a second building sold 8 times in a row from the host → server log `building_sold` once per building (2 in all), wallet 5000 (refunded once). The armed-undo path (↶ while the place is still pending) and the build → wave edge are covered by `NetSimHost.undo.test.ts` (dev throttle 150 ± 20 ms, 12 + 8 seeds, both edge outcomes reached).

Not verified: a real phone (thumb reach of ↶ at (270, 64), Android haptic), audio (placeholder coins sound not listened to).
