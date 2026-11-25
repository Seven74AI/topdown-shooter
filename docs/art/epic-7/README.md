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

## Premium round 1 (Results + "Run rewards", 2026-11-25)

Designer: "layout and ordering of things is OK, but the DESIGN is not — too simple. I want something that feels like a
premium AAA game." Same RW1 layout and row order; three premium renderings. The picked one becomes the style for the
other Epic 7 screens.

`premium-rewards.html` is self-contained (~0.9 MB, Oswald 500/600/700 embedded). Everything is Canvas 2D: the dawn
backdrop is the real Downtown bake graded to DW1 sunrise / DW2 blue hour; items are the real `drawSurvivor` parts relit
(key light upper-left, rim, glint, cast shadow down-right); the launcher is the real weapon icon. Each direction shows the
full Extract screen (568 × 320 with safe edges hatched, 800 × 360), the item reveal (8.4 s loop + four key frames), the
status states (Saving…, Couldn't save, Not saved, Practice, teammate's find, Collector) and its reusable pieces.
`?static` / reduced motion stops all motion; the panel scrolls with wheel or drag.

| Code | Direction | What's different | Captures |
| --- | --- | --- | --- |
| **PR1** (recommended) | Tactical HUD · steel + amber | P1's language (approved boss warning) on real material: smoked gunmetal-glass plates (brushed, scratched, bevelled), neon line frames with bloom, corner brackets, hazard stripes, triangle field; items land like the boss signals in reverse (tick ring lighting clockwise with a white-hot head + sparks drifting in, ending exactly on the landing flash; silhouette → lit, sweep, glow pulse, flicker-in tag); white-hot core in the gold counter; marching chevrons in the header. | `premium/pr1-*.jpg`, `premium/pr1-reveal.webm` |
| PR2 | Field case · machined metal | Heavy and physical: brushed gunmetal frames with hex screws, chipped enamel, recessed faces; players on stamped steel dog tags with slot-colour enamel; Supplies on a mechanical odometer; items revealed by an iris shutter in a machined well with an amber enamel ring. | `premium/pr2-*.jpg`, `premium/pr2-reveal.webm` |
| PR3 | Cinematic glass · dawn light | Frosted glass over the blurred dawn (depth of field) with sun rays, light-catching edges, drifting sheen, gold bloom; items rise on a lit glass pedestal under a light shaft with a flare streak and motes. | `premium/pr3-*.jpg`, `premium/pr3-reveal.webm` |

**Why PR1:** it is the look already approved (P1), carried to the whole UI with material depth; thin lines on dark
plates stay readable at 568 × 320; cheapest at runtime. It could borrow PR2's odometer and PR3's light sweep.

Reusable kit (`premium-src/kit.js`, shared by all three): tileable fbm / brushed / grain / scratch textures rendered
once; `chamfer`, `brackets`, `hazard`, `triField`; `neon` (additive bloom + crisp line), `castShadow`, `bevel`,
`innerShade`, `keyWash`, `bloom`, `sweep`; Oswald `text` with glow / emboss / engrave and gold / steel fills; the
Supplies `crate`, bag and status glyphs; `itemArt` (any 7.8 part relit, plus its silhouette for reveals); `dawn`
backdrops. `content.js` holds the layout, the fixed row order and the reveal timeline; `pr1.js`–`pr3.js` are the themes.

Rebuild and recapture (Chromium and ffmpeg preinstalled):

    node docs/art/epic-7/premium-src/build.mjs
    node docs/art/epic-7/premium-src/shots.cjs --frames=<scratch dir>   # JPEGs + reveal WebMs (frames at exact times)

Performance note (Mi 11i): plates, textures, backdrops and item close-ups are baked once; per frame only digits, one
sweep band, a few glow strokes and the scroll offset change (~60 fps with several animated frames on this page).
Not drawn: "Lost in the city" (DW2 behind the card) uses the same screen with the blue-hour backdrop shown on the
800 × 360 frame; District 2 thumbnail is a cooled crop of Downtown (no District 2 map yet).

### Round 1b: three more, outside the box (same page, same captures layout)

The designer asked for three bolder, genuinely different concepts. Same content and row order, same colour rule.

| Code | Concept | Reveal moment | Captures |
| --- | --- | --- | --- |
| **PR4** (favourite) | Evac cockpit: team on the helicopter's MFD (bezel, push buttons, black glass, sun glare), rewards on the see-through HUD combiner with the dawn city falling away and banking behind it | Supplies ledger fills segmented gauges; each item is locked on by a closing target-designator box ("LOCK") and painted in by a scan line | `premium/pr4-*.jpg`, `premium/pr4-reveal.webm` |
| PR5 | Case closed: cork evidence board raked by dawn light through blinds; typed index card with slot-colour map pins; "EXTRACTED" rubber stamp | Supplies inked by a numbering stamp, Rookie ×2 stamped; items are polaroids that develop and get pinned with a brass thumbtack | `premium/pr5-*.jpg`, `premium/pr5-reveal.webm` |
| PR6 | After-action report: fictional war-news broadcast over a live drone feed; glossy gold / navy lower-third bars, LIVE + channel bugs, scrolling ticker | 3D gold numerals with a glint, Rookie bar wipes in, each item flips in as a picture-in-picture card | `premium/pr6-*.jpg`, `premium/pr6-reveal.webm` |

Hooks added for these (`content.js`): `T.adjust(L)` lets a theme move/shrink the panels (bezels, ticker); `T.live(...)`
draws a moving backdrop under a transparent base layer (PR4's city, PR6's drone feed); `T.shadow: false` for dark ink on paper.
Image captures total 6.8 MB for six directions (section shots at JPEG 52); each reveal WebM ≤ 1.8 MB.

## Premium round 2a: the evac cockpit (`premium-rewards-cockpit.html`, optional backdrop study)

Designer on round 1b: "The cockpit idea is good, but we don't really see it… all the elements inside the box, and even
the box, are still very simple." Round 2 develops only the evac cockpit, in three lights. Layout and row order stay as
approved; the cockpit frames them and every readable line and button stays inside the 568 × 320 safe area (gauges,
lamps, switches, pillars and the glove sit in the margins as decoration).

| Code | Variant | Captures |
| --- | --- | --- |
| **PC1** (favourite) | Day-break, warm: the sun breaks the horizon, golden light, dust on the canopy, flare | `premium/pc1-hero-1136x640.jpg`, `-hero-1600x900.jpg`, `-reveal-at-2.9s.jpg`, `-section.jpg`, `-reveal.webm` |
| PC2 | Rain + condensation: overcast dawn, beads refracting the light, drops running down, fogged edges | `premium/pc2-*` |
| PC3 | Blue hour, instrument lighting: last stars, the city burning below, amber floodlit panel (fits DW2 / endless) | `premium/pc3-*` |

What changed vs PR4:
- The world is a perspective ground plane (the real Downtown bake, repeated, mip-mapped, with fires and smoke) under
  a dawn sky and horizon, with low clouds and haze; it banks, climbs and moves forward, with slight vibration.
- Canopy bow, corner pillars and a centre post; the pilot's glove on the collective and the out-of-focus helmet edge;
  a rotor-blade shadow sweeps across everything.
- A painted, worn instrument panel (Dzus fasteners, stencils) with live gauges: an attitude indicator that tilts with
  the bank, an altimeter that climbs, torque, a blinking master caution, toggle switches.
- MFD set into the panel: thick bezel, screws, rubber push buttons with legends, pixel grid, scanlines, glare.
- HUD combiner: a tilted glass plate on a frame and mount arms, with green coating reflections, amber projection
  with a double image, and heading-tape ticks.
- Elements with material: Back to lobby and Save my progress are backlit rubber keys in screwed housings (legend
  wear, LED); Wear it is an illuminated push-button; Supplies is a 7-segment LED counter; Rookie ×2 is a stamped,
  riveted placard; items are relit with a port of `photoreal-2/src/relight.ts` (52–58 px) inside targeting reticles
  that rotate and lock on, painted in by a scan line.

Hero captures are the phone frames at deviceScaleFactor 2 without the safe-edge hatching; the page also shows the
568 × 320 frame at 2× (rendered at 2× resolution). Rebuild: `node docs/art/epic-7/premium-src/build.mjs` (writes both
pages); captures: `node docs/art/epic-7/premium-src/shots.cjs PC1 --page=premium-rewards-cockpit.html --frames=<scratch>`.

The designer then corrected the goal ("find the design for the interface… make a new version of the whole interface,
not just the cockpit"), so the cockpit stays only as an optional backdrop study; round 2 proper is below.

## Premium round 2: the interface design language (`premium-rewards-2.html`, captures in `premium-2/`)

The designer: the boxes and every element in them are "still very simple, not premium AAA"; the goal is the design of
the **interface** that every Epic 7 screen reuses. Three new directions, each shown as a component sheet (at 2×) and
composed into Results + Run rewards (same content and row order; items now land as rarity cards, each card one tap
target with "Wear it" inside), with a calm, blurred dawn backdrop.

| Code | Direction | AAA reference | What makes it premium | Captures |
| --- | --- | --- | --- | --- |
| **PI1** (favourite) | Lumen | Destiny 2 + Halo Infinite post-game: thin precise frames, one gold accent, rarity cards with a header band and the item lit on a gradient | Glass faces in bevelled steel frames, gold diamond inlays and end caps, light gold display numerals, white-hot rarity edges; restraint | `premium-2/pi1-components.jpg`, `-results-568.jpg`, `-results-800.jpg`, `-reveal-at-2.9s.jpg`, `-section.jpg`, `-reveal.webm` |
| PI2 | Field Ops | The Division 2 + CoD MW debrief: matte charcoal, amber-orange signal colour, cut corners, segmented bars, dense micro-typography | A quiet technical layer on every surface (grid, circuit traces, rivets, serials), segmented fills, bracketed actions, hazard micro-stripes | `premium-2/pi2-*` |
| PI3 | Arena | Apex Legends + Halo Infinite reward screen: chunky skewed shapes, thick metal frames, italic gold numerals, bold rarity cards | Brushed frames with bright bevels, rivets and an accent stripe, 3D buttons with a lip that presses, skewed metallic badge, biggest glow | `premium-2/pi3-*` |

Component set (one system, three skins, `premium-src/pi.js`):
- **Panel:** contact shadow, outer frame, edge highlight, inner bevel, recessed face with texture, header band (caption, title, serial), divider with end caps, inlays.
- **Buttons:** primary / secondary / tertiary, each normal / pressed / disabled.
- **List rows:** normal / hover / selected ("YOU").
- **Item card:** rarity framing (gold = new item, white = found, steel = collector, slot colour = a teammate's find), the item relit at 50–84 px on a lit floor, sweep, burst with sparks, pulse.
- **Small pieces:** tags; the Rookie ×2 badge; counters with tabular display numerals; fill bars with a white-hot head; scroll indicator; modal frame.

Reveal: the bars fill one by one, the counter ticks, the badge stamps on, then the cards land one by one with a sweep, a white-hot edge burst and sparks, and the panel auto-scrolls.
Captures: `node docs/art/epic-7/premium-src/shots.cjs PI1 --page=premium-rewards-2.html --out=docs/art/epic-7/premium-2/ --frames=<scratch>`.

## Premium round 3: Lumen colour themes (`premium-rewards-3.html`, captures in `premium-3/`)

The designer chose **Lumen** (PI1) as the Epic 7 interface language and asked for other colour themes. The
construction, components, layout and motion are identical; only the palette changes (`lumenSkin(P)` in
`premium-src/pi.js`). Each theme is shown on DW1 dawn (568 × 320) and DW2 blue hour (800 × 360).

| Code | Theme | Mood | Colour-rule check |
| --- | --- | --- | --- |
| LG0 | Gold (reference) | Warm, triumphant, loot-coded | Close to amber (= event you can use) and to the orange slot; slot colour only appears as a dot or bar |
| **LC1** (favourite) | Ice cyan | Cool, clean, high-tech; strongest contrast on the warm dawn | Near the blue slot: teammate cards keep the slot-blue frame, dot and name; new items use a lighter, greener cyan; Supplies are no longer amber |
| LP2 | Platinum | Quiet luxury: white-silver chrome, champagne only on new items | White = pick-ups and people: silver chrome lowers the pop of names, so new items get a warm champagne frame |
| LT3 | Teal + brass | Crafted, instrument-like | Teal sits between the green slot and gas yellow-green; it stays blue-leaning and never fills large areas; new items are brass |
| LR4 | Crimson + steel (added after the designer allowed red on menu screens) | Bold war-room debrief, strongest on blue hour | Red = boss danger now applies to play only; players may still read red as danger. New items are crimson; white text on the crimson button. Still images only (no video, per the designer) |
| LF5 | Field Ops palette (PI2 colours on Lumen shapes) | Grounded, tactical: matte charcoal, gunmetal frames, amber-orange light, white numerals | Amber-orange is close to the orange player slot and to amber = an event you can use; the slot shows only as a bar or dot, so an orange-slot teammate reads less distinctly. Still images only |

Files per theme: `premium-3/<code>-components.jpg` (sheet at 2×), `-results-568.jpg`, `-results-800.jpg`,
`-reveal-at-2.9s.jpg`, `-section.jpg` (half size), `-reveal.webm` (about 1.5 MB). The PI3 label overflow (the
chevron past the button edge) was fixed in the shared button code in round 2.

## Lumen screens: the chosen style (LF5) on the other 8 Epic 7 screens (`lumen-screens.html`, sheets in `lumen/`)

The designer picked **LF5** (Lumen construction with the PI2 Field Ops palette) as the Epic 7 UI style. This page applies
it to the eight other screens with the round-1 approved layouts and row orders, plus Results with the slot fix. Still
images only; each sheet `lumen/<id>.jpg` shows that screen's frames at deviceScaleFactor 2 (568 × 320, 800 × 360 where
the layout changes, and the states).

| Sheet | Item | States shown |
| --- | --- | --- |
| `lumen/hub.jpg` | PH1 hub + Unlocks | Confirm (pressed, 3 s), Not enough + how many more, Unlocked / Starter, placeholder silhouette, Good next pick, Unlocking… |
| `lumen/training.jpg` | TR1 Training (TL1 line on Results) | Train, Confirm (pressed), Maxed, 5 pips as Lumen fill bars |
| `lumen/shop.jpg` | BT2 borrowed strip | Selected card (Buy for…), two borrowed cards (Mo, Kit) |
| `lumen/accounts.jpg` | AC2 accounts | Start (guest), Save my progress (focus), Log in (error), Forgot password (disabled Next), recovery code, log out |
| `lumen/lobby.jpg` | DP2 district picker | Host, teammate ("host picks"), host's sheet (selected / locked / Random city), 800 |
| `lumen/slots.jpg` | SC1 slot card | Host, You, Ready, Not ready, Open (rows at 2×) |
| `lumen/editor.jpg` | ED1 + LK2 + LS1 editor | Head tab with a locked milestone tapped (info row), loot silhouette "?", selected tile, colour row, Random + Done |
| `lumen/loot.jpg` | LB2 + OA2 + BF2 (in play) | Bag in the street, off screen (OA2 with 20 s ring), blackout, finder and teammate lines (BF2) |
| `lumen/results.jpg` | Results + Run rewards (LF5) | Extract, endless, teammate's find: with the slot chip |

**Slot fix (LF5 tension):** every player is now shown with a filled **slot chip**: the slot colour, a dark keyline and
the player number in white. It appears in Results rows, tags, item cards, lobby rows and the "Bag found!" line, so the
orange slot (#ff8a1f) never sits orange-on-orange next to the amber-orange accent.

**Changes to the approved layouts, and why:**
- **Results items:** shown as rarity cards (from round 2) instead of one line per item. Each card is one tap target with "Wear it" inside.
- **Shop (BT2):** the cards are redrawn in Lumen to show the strip in context. The shop itself is the 5.13 screen, and only the strip is Epic 7.
- **Lobby (SC1):** "Ready" is a white check, not green. The green slot (Kit) is a player colour, so green "Ready" would read as that player.
- **Accounts:** errors are red. The designer allowed red in menus, and it keeps errors distinct from the orange accent.
- **Loot bag, arrow and line (in play):** built with Lumen plates in neutral steel and white, without the orange accent, so the in-play rule (white = pick-ups) holds.
- **Training at 568 × 320:** the line under each boost name is shortened (11.5 px, cut with "…" where needed) so the pips and Now / Next fit, as in round 1.

## Loot bag round 2 (Story 7.12, 2026-11-25)

Round 1 (LB1–LB3 sacks) was not picked: "a better item, more related to the game, or a better bag". `loot-bag-2.html`
(self-contained, ~0.8 MB, Canvas 2D) draws six real objects with the photoreal relief renderer
(`loot-bag-2-src/vendor/relief.ts` = `docs/art/photoreal-1/src/relief.ts` from `claude/dazzling-meitner-zhu5p0`), each 4× close,
at game size on the real Downtown bake in rain (stage 3) and in the 5 % blackout with survivors and zombies, and next to
S2 sandbags + the 6.9 supply crate (game code, read-only). Same pick-up signal on all: soft white ground ring + white
up-left rim light + one glint. Rebuild: `node docs/art/epic-7/loot-bag-2-src/build.mjs`, then
`node docs/art/epic-7/loot-bag-2-src/shots.cjs` (JPEGs in `loot-bag-2/`).

| # | Item (story) | Codes | Recommended | Why |
| --- | --- | --- | --- | --- |
| 10 | Surprise loot object, round 2 (7.12) | LB4 dead hiker's backpack · LB5 tactical go-bag duffel · LB6 lockable field case · LB7 trauma bag · LB8 police evidence bag (item visible) · LB9 delivery rider's thermal backpack | **LB4** (LB9 second) | The zombie's own belongings: strongest story, unique silhouette (pack + rolled mat), blue-grey apart from olive cover and the green crate. LB9 has the best night read (reflective panel). LB6 too close to the crate/cover, LB7 promises healing, LB8 spoils the surprise. |
