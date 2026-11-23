# Story 5.18 browser shots (headless Chromium, mobile emulation 800 × 360, dpr 2, ONLINE, `?lag=150&jitter=20`)

Own game server (port 2618, `DEV_STARTING_WALLET`) and Vite client (port 5218) — not `npm run dev`. Name "Bo", Create game → Ready → Start, then the wood-barricade tile and real touch taps on Place (92, 92 px from the bottom-right corner).

| File | What it shows |
| --- | --- |
| `5-18-wall-pending.png` | $5000, three Places ~0.25 s apart: two barricades already built end to end (wall heading south: the survivor faced east), the 3rd still a **pending box** (white dashed outline + spinner tick at its corner). HUD already shows **$4880** (pending prices off). The chain's 4th spot left the view, so the ghost went back to carry and is red ("Overlaps a building"). |
| `5-18-wall-built.png` | 0.5 s later: the 6 m wall (3 barricades), no pending box, $4880 = the server's wallet. |
| `5-18-wall-end.png` | The same 1.5 s later (nothing changed). |
| `5-18-ten-taps.png` | $100, 10 taps on Place 100 ms apart: after the 2nd the hand emptied with **"Not enough money for another"**; one barricade built, one still pending; the build bar counts **2/6** and dims the tiles at the shown **$20** (5.16 L2 fixed). Later taps landed on the build bar (a refused pick, nothing sent). |
| `5-18-ten-end.png` | Final: 2 barricades, $20. |

Measured (page state each sample): wall run — 3 `building_placed`, wallet 5000 → 4880 (charged once each), the shown wallet never below 4880, at most 2 boxes pending at once. Ten-tap run — the server log has **2 `building_placed`, 0 `building_refused`**, wallet 100 → 20, the shown wallet never below 20. No console or page errors in either run.
