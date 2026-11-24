# Story 5.19 browser shots (headless Chromium, mobile emulation, dpr 2, solo practice, `?wallet=5000`)

Own Vite client (port 5319), not `npm run dev`. "Practice solo", then the wood-barricade tile; touches sent with CDP `Input.dispatchTouchEvent` (real multi-touch). Each shot exists at 800 × 360 and 568 × 320.

| File | What it shows |
| --- | --- |
| `5-19-carry-*` | Holding a wood barricade, carried: the chip reads "Wood barricade · $40 · ×6 left" (faint border). 800 × 360: the chip sits right-aligned above ✕ with the reason line above it; 568 × 320: the short-screen layout, the chip left of ✕ on its row (D7). |
| `5-19-pinned-dragging-*` | After a right-thumb drag of 3 m right and 1 m down: the ghost is pinned, the chip reads "↩ carry · Wood barricade" (orange border). |
| `5-19-pinned-chip-*` | The survivor walked 5 m with the left stick while the right thumb kept dragging: the pinned ghost stayed put (moved only by the drag); here the survivor walked onto it, so it is red ("You're standing there"). |
| `5-19-chip-tapped-carry-*` | After a tap on the chip: carried again ahead of the survivor. |
| `5-19-edge-clamp-*` | A long drag toward the top-right corner: the ghost stops 1 m inside the view and stays pinned. |

Measured (page state, both sizes; no console or page errors):

| Check | 800 × 360 | 568 × 320 |
| --- | --- | --- |
| 5 px of finger travel | not pinned, ghost unmoved | same |
| Crossing 8 px | pinned, ghost unmoved (no jump) | same |
| Finger moved 3 m × 1 m after the crossing (screen px) | ghost moved (100, 33.3) px for a finger (100, 33.3) px: 3 m × 1 m, 1:1 | (71.1, 23.7) for (71.1, 23.7) |
| Finger to ghost centre after the drag | 92 px (never under the finger) | 79 px |
| Fire / aim during the drag | false / (0, 0) | same |
| Finger trembling ±0.05 m, 30 samples | 1 lattice spot | 1 lattice spot |
| Left stick + right drag at once | survivor moved 5.6 m, ghost moved only by the drag (0.5 m), still pinned | 5.1 m, 0.5 m, pinned |
| Tap on the chip | unpinned, chip back to "· $40 · ×6 left" | same |
| Tap on ⟳ sliding 40 px | ⟳ pressed once (rot 3 → 0), not pinned (no drag) | same |
| Long drag to the corner | pinned, centre 1.10 m inside the right edge, 1.15 m below the top | 1.08 m, 1.00 m |

Not verified: a real phone (finger size, Android back-swipe near the right edge); online under `?lag=150` (the drag is client-only and the spot sent is unit-tested; 5.18's pending path is unchanged); the mouse press-drag in a real desktop browser (unit path shared with touch).
