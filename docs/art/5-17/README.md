# Story 5.17 browser shots (headless Chromium, mobile emulation, dpr 2, solo practice, `?wallet=5000`)

Each shot exists at 800 × 360 and 568 × 320. The survivor and the culprits were placed by a test script (teleport in the solo World; the teammate is a copy of my player record with no name, so it reads "A teammate"; the zombie is spawned and pinned in place).

| File | What it shows |
| --- | --- |
| `5-17-valid-*` | A valid (green) barricade ghost in the open; every spawn's 2 m no-build circle drawn faint (red 12 % fill, dashed edge). |
| `5-17-spawn-*` | "Too close to a zombie spawn (2 m)": hatch + ✕ on the red ghost, the culprit spawn's circle outlined (dashed). |
| `5-17-offmap-*` | "Off the street": the ghost past the north edge (under the HUD), the map edge outlined red. |
| `5-17-bus-*` | "Blocked by the bus" with a turret: the bus box outlined, the turret's 8 m range ring (from `turret.rangeM`) dimmed while blocked. |
| `5-17-car-*` | "Blocked by a car": the car's box outlined. |
| `5-17-building-*` | "Overlaps a building": my turret outlined. |
| `5-17-teammate-*` | "A teammate is standing there" (online it says the name, e.g. "Bo is standing there"): a red circle round the teammate. |
| `5-17-zombie-*` | "A zombie is in the way": a red circle round the zombie. |

Hold (AC 8): a teammate brushing the ghost for two frames (~50 ms headless) kept the red look up **267 ms** (800 × 360) and **283 ms** (568 × 320) before it went back to green. HUD (Place colour, reason), ghost colour and culprit outline agreed on every frame (0 mismatches in 179 frames, a zombie walking round the ghost). No console or page errors.
