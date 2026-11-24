# Story 5.23 browser shots (headless Chromium, solo practice, `?wallet=5000`)

Own Vite client (port 5323), not `npm run dev`. Touch: mobile emulation, dpr 2, taps sent with CDP `Input.dispatchTouchEvent`, at 800 × 360 and 568 × 320. Mouse + keys: desktop 1280 × 720, dpr 1, Playwright mouse and keyboard.

| File | What it shows |
| --- | --- |
| `5-23-pick-pop-*` | A wood barricade just picked from the bar (the pop is 120 ms; headless frames are 60–100 ms, so the still is at ~1.0). |
| `5-23-placed-dust-tab-*` | 70 ms after Place: the barricade with its blue owner corner tab (L on the min corner) and owner dot, dust round it; the chain's next ghost pinned below. |
| `5-23-resting-ghost-*` | 5.18 Q1: the chain's next spot was blocked (a mine on it), so the ghost went back to carry and sits **faded white** on the barricade just built (no red, no hatch, no culprit outline); the reason line reads the label "Wood barricade · $40". |
| `5-23-owner-dots-*` | Hand empty, 3 s later: tabs gone, every building keeps its owner dot (build phase). |
| `5-23-mouse-follow-1280x720` | Picked with `1`, then the mouse moved: the ghost's centre sits on the cursor (snapped). |
| `5-23-mouse-click-placed-1280x720` | A left click placed it; the chain's next ghost holds its spot until the mouse moves. |
| `5-23-esc-menu-1280x720` | Esc while holding put the building away; the second Esc opened the in-run menu. |

Measured (page state; no console or page errors in any run):

| Check | 800 × 360 | 568 × 320 | 1280 × 720 (mouse) |
| --- | --- | --- | --- |
| Pick pop, ghost scale per frame after the tile tap | 1 → 0.8 → 0.982 → 1 | same | — |
| After Place: buildings / tabs / live dust / chain pinned | 1 / 1 / 8 / yes | same | — |
| Blocked chain: pinned / resting / error / reason line | no / yes / blocked / "Wood barricade · $40" | same | — |
| 3.3 s later: tabs / dust | 0 / 0 | 0 / 0 | — |
| `1` with the mouse resting → carried (not following) | — | — | yes (following: false) |
| Mouse moved → following, cursor to ghost centre | — | — | following, 0.26 m (≤ the 0.35 m lattice bound) |
| `R` / wheel down / wheel up: rot | — | — | 3 → 0 → 1 → 0 |
| Left click: built / still holding / chain spot held | — | — | 1 / yes / yes |
| `Space`: built | — | — | 2 in total |
| Right click: holding | — | — | no (put away) |
| `2` → turret in hand; `2` again | — | — | held → put away |
| Esc while holding → put away, menu closed; Esc again | — | — | put away, closed → menu open |
| Ctrl+Z, `M` (no-op hooks until 5.20 / 5.21) | — | — | no error |

Not verified: a real phone (haptics need Android Chrome and a user gesture; headless has no `navigator.vibrate` effect to observe), the sounds by ear (Web Audio placeholders run, unit-tested with a fake context), a teammate's placement online (the event path is shared and unit-tested; NetSimHost's `ageS` on `building.placed` is tested), AZERTY / QWERTZ in a real browser (the layout table is unit-tested with the `code` / `key` pairs those layouts send).
