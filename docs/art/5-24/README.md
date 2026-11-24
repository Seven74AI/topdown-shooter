# Story 5.24 browser shots (headless Chromium, two clients, `?lag=150&jitter=20`)

Own server (port 25624, `ALLOW_SOLO_START=1 DEV_STARTING_WALLET=5000`) and Vite client (port 5324, a git-excluded local config with the `/api` proxy), not `npm run dev`; both stopped by PID. Ana (host, blue, dpr 1) creates the room, Bo (orange, dpr 2) joins; both at 800 × 360, `?lag=150&jitter=20&wallet=5000`. Ana's hand is driven through the Game scene (`startPlacement`) and keys (D / A / S walk, Esc puts away, Space places); Bo's view is read from the page (`teammateGhosts.live(0)`, the view's glide, the HUD model's label) and the WebSocket frames Bo's page received.

| File | What it shows |
| --- | --- |
| `5-24-sender-holding-800x360` | Ana's own screen holding an auto-turret (green: valid, her hand cluster, chip). |
| `5-24-teammate-ghost-800x360` | Bo's screen at the same moment: Ana's ghost as a **blue dashed outline** at 50 % with "**Ana · Auto-turret**" above it in her colour; never red / green. |
| `5-24-teammate-ghost-moving-800x360` | Bo's screen after Ana walked with it: the outline followed. |
| `5-24-after-cancel-800x360` | Ana pressed Esc (put away): the ghost is gone on Bo's screen. |
| `5-24-placed-then-chain-ghost-800x360` | Ana placed a wood barricade (Space): Bo sees the building and, because 5.18's chain keeps the item in Ana's hand, her next ghost beside it ("Ana · Wood barricade"; here partly under Bo's Ready button). |
| `5-24-after-place-800x360` | Ana put the chained item away: the barricade stands, no ghost. |
| `5-24-wave-no-ghost-800x360` | Ana held a mine when both pressed Ready: in the wave Bo shows no ghost. |

Measured (no page errors or console errors in any run; second run numbers, the first run agreed):

| Check | Result |
| --- | --- |
| Pick → visible on Bo | 482–637 ms (150 ± 20 ms lag one way plus headless frame pacing) |
| Ana walking (7 s window, ~1.2 s of it moving before she reached the bus) | 17 `building.ghost` sent, 17 relays reached Bo, 24 B each: 408 B = **58 B/s** average (≈ 96 B/s while moving: 4 Hz × 24 B); Bo's whole download in the build phase 836 B/s |
| Glide | Bo's drawn outline moved in eased steps (largest 1.2 m per 50 ms sample at headless frame rates), settling on each relayed spot |
| Holding still 3 s | 6 sent / 5 relays (keepalive 2 Hz); still visible |
| Esc (put away) → hidden on Bo | 379–532 ms |
| Place (Space) | building on both (1 / 1); the chained ghost relayed; put away → hidden 375 ms |
| Phase change (both Ready with Ana holding) | Bo: phase wave, no live ghost, label hidden; 3 s of wave: **0 relays, 0 sent** |
| Disconnect (Ana's tab closed while holding) | hidden on Bo after 179–198 ms (`player.left`) |
| A silent sender (Ana's sends stubbed out while holding: a frozen tab) | hidden on Bo after 958–963 ms (1 s timeout) |

Not verified: a real phone; 4 players (the integration test relays to 2 others; the bandwidth test computes 3 senders); headless frame rates (~10–25 fps) make the glide look steppier than on a device.
