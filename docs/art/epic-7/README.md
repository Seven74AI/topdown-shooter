# Epic 7 looks (code-drawn proposals)

`looks.html` is self-contained (open it in a browser; ~0.9 MB). Every screen is drawn at real phone size in CSS px:
568 × 320 (iPhone, its 44 / 21 px safe edges hatched) and 800 × 360 (Android). Each phone frame is an iframe styled
by the game's own `apps/client/src/ui/overlay.css` (safe-area `env()` replaced by the device's insets); survivors,
weapon / gear / consumable / build-bar icons and the street are the **game's own drawing code** (`drawSurvivor` +
Story 7.8 parts, the shop icon painters, the Downtown bake), bundled read-only with esbuild. No external images.
Most frames can be tapped (hub tabs, Unlock → Confirm → spinner, Train, the whole editor, Results tabs).
`?static` stops the animations (bag glints, rain, turning preview).

Rebuild after editing `src/`, then refresh the screenshots:

    npm ci                                   # once
    node docs/art/epic-7/src/build.mjs       # writes looks.html
    node docs/art/epic-7/src/shots.cjs       # one PNG per item in shots/ (deviceScaleFactor 2, preinstalled Chromium)

- `src/gameEntry.ts` — bundle entry (real game art: survivor, icons, Downtown render).
- `src/page.html` — page shell; `src/main0.js` core (phone frames, tiles, portraits, picks), `main1` Results
  rewards, `main2` hub + Training, `main3` borrowed tag, `main4` accounts, `main5` lobby (district + slot card),
  `main6` editor + locked tiles, `main7` loot bag, `main9` page end.
- `shots/` — `rw.png`, `ph.png`, `bt.png`, `tr.png`, `ac.png`, `dp.png`, `sc.png`, `ed.png`, `lb.png`.

## Pick table

| # | Item (story) | Codes | Recommended | Why |
| --- | --- | --- | --- | --- |
| 1 | Results "Run rewards" panel (7.2 + 7.4, 7.6, 7.7, 7.11, 7.12) | RW1 two columns · RW2 one column with Team / Rewards switch · RW3 paper slip | **RW1** | Team table and buttons stay where players know them; rewards get their own scrolling column in the fixed row order. States (Saving…, Couldn't save, Not saved, Practice, teammate view, Collector) drawn for each. |
| 2 | Progress hub + Unlocks tab, placeholder icons (7.3; tabs for 7.5, 7.10) | PH1 tabs on top + list (silhouette placeholder) · PH2 side rail + card grid (dashed box) · PH3 category chips (letter stamp) | **PH1** | Every item's one plain line stays visible; tab bar built for Unlocks · Training · Survivor; grey silhouettes read as "an item" without pretending to be final art. |
| 3 | "Borrowed from …" card tag (7.4) | BT1 on the tape · BT2 "● From Mo" strip at the foot · BT3 luggage tag | **BT2** | 14 px words on every phone, slot-colour dot, card keeps its size, never covers tape or picture. |
| 4 | Training tab + Results Training line (7.5) | TR1 rows with 5 pips · TR2 2 × 2 cards · TR3 level ladder; TL1 text line · TL2 mini pips · TL3 one column | **TR1 + TL1** | Same row shape as Unlocks, "Now / Next" in words; TL1 is the story's line and readable at 568 × 320. |
| 5 | Account screens (7.6) | AC1 header button, form scrolls · AC2 side-by-side fields · AC3 one field at a time | **AC2** | The keyboard leaves a short, wide strip: fields side by side keep every field and the button visible while typing. Start row under the name field, as the story says. |
| 6 | Lobby district picker (7.7) | DP1 card row · DP2 one "District" line + sheet · DP3 in the invite column | **DP2** | One 44 px line is all the lobby can spare above four slots at 568 × 320; the sheet holds big pictures, lock text and Random city later. |
| 7 | Lobby slot card with the survivor (7.9) | SC1 close-up left of the name · SC2 head in the slot circle · SC3 line-up cards | **SC1** | Whole survivor recognisable at 40 px with its ring; rows stay one line so everything fits. |
| 8 | Survivor editor + locked milestone tile + loot silhouette tile (7.10) | ED1 preview left · ED2 tabs rail · ED3 big stage; LK1 line under tile · LK2 lock in the middle; LS1 flat silhouette · LS2 ghost + glint | **ED1 + LK2 + LS1** | Preview and two rows of tiles side by side at 568 × 320, Done always in one corner; even grid; loot stays a surprise. |
| 9 | Surprise loot bag, off-screen arrow, "Bag found!" (7.12) | LB1 burlap + star · LB2 dark sack + white edge glow · LB3 tag + sparkles; OA1 chevron · OA2 badge with 20 s ring; BF1 plain · BF2 bag icon + name in slot colour | **LB2 + OA2 + BF2** | Dark cloth can't be read as sandbags/cover and the white edge pops in rain and the 5 % blackout; the badge shows time left; finder's name in their colour. |

## Notes for the builders (found while drawing)

- **Lobby at 568 × 320:** today it stacks into one scrolling column (`@media (min-width: 600px)` only makes two
  columns on bigger phones). All DP / SC proposals make it two columns at 568 too, and move **Leave** to the invite
  column to make room.
- **Shop at 568 × 320:** today's 5.13 cards already cut the stat line on the small phone (existing behaviour, not
  changed here); BT2 uses that line for "● From Mo" and shows the stat in the selected-card message.
- **Hub list order:** locked items first in each section (cheapest first), then what you have — a proposal, easy to drop.
- **Not drawn / simplified:** the account row in the hub header is shown only in the hub frames (PH1–3), and the
  Results "Save my progress" nudge only inside the rewards panel (item 1); "Leave the game first" refusal not drawn;
  District 2 thumbnail is a darkened mirror of Downtown (no District 2 map exists); SC1 portraits are about 1× game
  size (40 px box) and SC3's about 2.4× — a full 3× close-up (7.9 D3) does not fit four one-line slot rows at 568 × 320.
