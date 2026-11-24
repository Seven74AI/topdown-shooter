# Story 5.21 + 5.22 browser shots (headless Chromium, mobile emulation, dpr 2)

Own server (port 25621, `ALLOW_SOLO_START=1 DEV_STARTING_WALLET=5000`) and Vite client (port 5321, a local config with the `/api` proxy), not `npm run dev`; both stopped by PID. Touches sent with CDP `Input.dispatchTouchEvent`. Solo shots at 800 × 360 and 568 × 320 (`?wallet=5000`); online shots at 800 × 360 with two clients (`?wallet=5000&lag=150&jitter=20`).

| File | What it shows |
| --- | --- |
| `5-21-bar-mine-*` | Tapping my barricade: the action bar (78 × 56, 8 apart, right-aligned at 16, centre 112 up): ✥ Move · Upgrade $50 · Repair **full HP** (dimmed) · Take back +$40 · ✕; info "Wood barricade · Yours · HP 200/200" + the next tier. Ready, the build bar and 5.12's row are hidden (D3). |
| `5-21-move-held-*` | ✥ Move, then a right-thumb drag of 2 m: the ghost (green, valid) at the new spot, the old spot **dashed** (teal; it still stands), Place reads **MOVE**, reason line "Move Wood barricade · free", chip "↩ carry · Wood barricade". (↶ is 5.20's undo of the Place a few seconds earlier.) |
| `5-21-moved-*` | MOVE pressed: the barricade stands at the new spot; wallet unchanged ($4960). |
| `5-21-long-press-ring-*` | A press held on my building: the teal ring fills round the finger (from 150 ms). For this shot only the threshold was stretched in the page (headless runs at a few fps and would pick up before the shot); the real 450 ms pick-up is in the run log below. |
| `5-21-bar-teammate-*` | A teammate's building (dev: the solo World's building handed to "p1", named Bo): Repair $20 and ✕ only, "Only Bo can move, upgrade or sell it". |
| `5-21-bar-teammate-reason-*` | The tallest text block: a teammate's building and a refusal line ("Not enough money", wallet $5). At 568 × 320 the lines are 14 px and wrap 24 px right of the screen centre; the block's top is 30 px below ☰. |
| `5-21-under-ready-before-*` / `5-21-under-ready-bar-*` | My barricade moved (shared rule) under Ready, then a tap on Ready over it: the action bar opens, Ready is **not** pressed (D8, 5.20's open question). |
| `5-21-online-move-pending-800x360` | Online at 150 ± 20 ms, right after MOVE: the dashed pending box with its spinner at the new spot; the building still at the old one. |
| `5-21-online-teammate-800x360` | Online, Bo taps Ana's building: Repair and ✕ only, "Only Ana can move, upgrade or sell it". |

Measured (page state; no console or page errors in any run):

| Check | 800 × 360 | 568 × 320 |
| --- | --- | --- |
| Tap my building → bar | open, Move shown, Ready hidden | same |
| ✥ Move → hand | holding, `moveId` 1 | same |
| Drag 2 m + MOVE → building | gx 51 → 54, wallet 4960 → 4960 | same |
| Long-press (real 450 ms) → hand; ✕ → put back | holding; building unchanged, nothing sent | same |
| Ring at ~320 ms | 0.72 | 0.67 |
| Tap on Ready over a building | bar open, `readyOn` false | same |
| Tallest text block (reason top / info left) | 143.5 / 500 | 90 / 305.5 (☰ bottom 60; centre 284) |

Online (two clients, `?lag=150&jitter=20`): Ana's move → pending box at once, both clients showed the building at the new spot with HP kept, wallet unchanged, no pending box left; Bo's crafted `building.move` of Ana's building → refused (nothing moved); 12 crafted moves from Ana at once → 10 applied (spot only, wallet unchanged), 2 dropped by the guard (`client_message_rejected rate`).

Not verified: a real phone (thumb reach, the long-press feel), Android haptic (none added), audio (no move sound added: Story 5.23 owns placement feel).
