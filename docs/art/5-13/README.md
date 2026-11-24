# Story 5.13 browser check: the roguelike card shop

Look: **C3 "police evidence tag"** (designer pick, E5D 5.13), drawn in CSS (the shop is Preact DOM): a cream
evidence card (`#ece3c8`, faint dot grain), a striped rarity tape across the top (common white, rare blue, epic
red-amber), the card number (`#01`–`#06`) and its category (`WPN` / `GEAR`) on the tape, a peeled bottom-right corner,
black ink. Icons: the weapons' side-view art (`weaponIconUrl`) and the 5.11 gear icons (`gearIconUrl`); the SMG,
Hunting Rifle and Machete have no side-view art yet (4.11 sprites only), so they show a black inline-SVG weapon
pictogram (no canvas: nothing to redraw after a context loss). Sizes: `ui/sizes.ts › CARD_MIN_W/H_CSS_PX` (96 × 112),
3 × 2 grid left, always-available list right (upgrades, consumables, repair and barricade hints; scrolls).

Solo shots: dev build (Vite on a private port), `?solo=1&wallet=1000&shopcards=grenade_launcher,smg,body_armor_2`,
dpr 2; the shop opened through the build bar's Shop flag (`hudModel.shopPressed`). Online shots: own server
(`PORT=2613 ALLOW_SOLO_START=1 DEV_STARTING_WALLET=1000 DEV_SHOP_CARDS=smg,body_armor_1 DEV_NO_WAVES=1`) and two pages
(host + guest) with `?lag=150&jitter=20&wallet=1000`, dpr 1.

| File | What it shows |
| --- | --- |
| `5-13-shop-800x360.png`, `-568x320`, `-1024x768` | The shop at three sizes: 6 cards (≥ 1 weapon, ≥ 1 gear), Reroll $20 in the head row, Close top-right. Card sizes measured: 142 × 148 (800 × 360), 97 × 128 (568 × 320), 155 × 166 (1024 × 768); no page scroll, the grid never scrolls. |
| `5-13-shop-selected-800x360.png` | First tap: the Hunting Rifle card lifts, gold edge, "Buy $350" on the card (D8). |
| `5-13-shop-sold-800x360.png` | Second tap bought it: "SOLD" (greyed), wallet 1000 → 650, "Bought Hunting Rifle", its upgrade row appears; the Grenade Launcher reads "Too dear" (dimmed price). |
| `5-13-shop-rerolled-800x360.png` | Reroll: 6 new cards (sold slot replaced too), wallet 650 → 630. |
| `5-13-online-lag150-buying-800x360.png` | Online under lag: a card bought → "Buying…", every card disabled until the server's offer shows it sold (~440 ms). |
| `5-13-online-lag150-rerolling-800x360.png` | Two Reroll taps 40 ms apart → "Rerolling…", one `shop.reroll` charged (800 → 780; the server log has one `shop_rerolled`, rev 1). |
| `5-13-online-lag150-800x360.png`, `5-13-online-guest-800x360.png` | Host after the reroll; the guest's own cards, unchanged by the host's buy and reroll (F1). |

Measured in the same runs: host and guest got different offers at the build start (own streams); after
`window.__game.loop.sleep()` / `wake()` the stored offer was unchanged (build 0, rev 1). **Not verified in the
browser:** a hidden tab sleeping across a build start, and a late Game scene start (both need a wave to end; covered by
`RunRoom.shop.test.ts` "the next build start sends each player a new offer" and `NetSimHost.shop.test.ts` "late
subscribe shows the latest offer"). Headless Chromium only; no phone.
