# Epic 7: designer decisions

Progression and unlocks, decided 2026-11-24 (designer "ok" after revising D1, D3 and D6): **`docs/ideas/epic-7/proposal.md` § 0** (D1–D12). Applied to `epics.md` (Stories 7.1–7.7, FR78/79/81) and the GDD by `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-24.md`. Prototype: claude.ai/artifact/LFskPyGc9Ji9ziyD8iaQVd (`docs/ideas/epic-7/progression-sim.html`).

Short version:
- Unlocking everything is **not** the goal (designer: "not everybody wants to play with every weapon"). Earnings and Training costs stay as in the GDD; target = first wanted weapon in ≈ 3 runs, a few favourites in ≈ 10.
- Rookie lift × 2 until 300 lifetime Supplies; a wave counts for everyone still in the run (downed/out too), but only the waves a player was in (late joiners and players who left don't get the others; Epic 8 note).
- Starter pool gains Fire Axe and Revive kit (fixes the new player's frozen 6-card shop).
- Free unlock order with a "Good next pick"; unlocks can't be turned off.
- Borrowed card: 1 of 6 cards from a teammate's unlocks you lack.
- Training applies in full, never scaled to the team.
- Guest token also in a 1-year HttpOnly cookie (Safari 7-day storage wipe); recovery code, no email; guest progress merges on login.
- Host can pick a district if anyone in the lobby has it.

## Survivor parts (7.8)

Pick page round 1: claude.ai/artifact/3nHH149x7jJhYBfFeqi7Ym (`docs/art/7-8/parts.html`). Designer's picks 2026-11-24, as given (night mute **lightness × 0.62, saturation × 0.8** accepted):

| Slot | Keep | Redraw (designer's note) | Drop |
| --- | --- | --- | --- |
| Top | hoodie, track, puffer (jacket = default, not picked) | coat, leather, robe ("not recognizable"); camo ("improve the camo"); floral ("flowers are not visible at all") | – |
| Head | beanie, hood, bike (A), hockey (**B**, no red scratch), cone, chef, pot, bunny | cap, capb, fire, riot, gas ("not recognizable") | bandana ("we can not see it"), hard, party |
| Hair | short, tied, curly, bald | buzz ("same as short; if it can't be told apart, drop it") | – |
| Pack | backpack, duffel, teddy | frame ("do better"), guitar ("not recognizable") | sling, ammo, cooler |
| Accent | – | cape ("not very good") | scarf, stripes, patch, harness, team |
| Skin | presets 3–8 (1 = default and 2 not picked: kept) | – | – |

Follow-up answers (designer, 2026-11-24):
- **Cap:** redraw it and **change the default look** to the redrawn cap. AC 3 becomes: every survivor frame is pixel-identical to today's except the cap (the raster test compares today's survivor without its cap against the new default without its headgear, and the new cap is its own reviewed drawing).
- **Dropped parts:** offer replacements in round 2 so the catalogue keeps **35 starter / 10 milestone / 10 loot**, including new items for **M7** (100 barricades), **M8** (extract with all 4 alive) and **M10** (wave 10 without going down).
- **Accent slot:** keep it, with new bolder candidates that read at 14 px, plus the redrawn cape.

Round 2 page: claude.ai/artifact/LVWByCqRkA3vF5DLrHaK9j (`docs/art/7-8/round-2.html`). Designer's picks 2026-11-24:

| Slot | Picked | Redraw again (designer's note) | Dropped / not picked |
| --- | --- | --- | --- |
| Top | camo **A** (bold woodland), floral **A** (big white hibiscus) | – | coat, leather, robe |
| Head | fire **A** (black, long back brim, brass badge), riot **B** (visor down), gas **A** (filter in front); new: headphones, bucket hat, wide-brim hat (starter), viking helmet, propeller cap (loot) | cap, capb; viking: "the horns are weirdly placed, why are they pointing in front?" | trapper |
| Hair | all three buzz cuts kept: stubble, flat top, mohawk ("we can keep the three") | – | – |
| Pack | guitar **B** ("improve the position, it's weirdly positioned on the player"); new: school backpack (starter), golf bag (M10), cat in the backpack, potted plant (loot) | – | frame, crate, mat; skateboard ("could be a good idea, but the placement and the perspective are wrong") |
| Accent | – | – | cape and every accent candidate |

Follow-up answers (designer, 2026-11-24):
- **Accent slot removed.** The look has 5 slots: top, head, hair, pack, skin. The accent picker colour stays as the colour of hats and bags (caps, beanie, headphones, bucket, wide-brim, propeller, school backpack). Story 7.9's look code drops `acc`.
- **Counts:** round 3 offers candidates for **M5, M7, M8** in any slot. Starters stay at what was picked (AC 4 changes to the real counts).
- **Animated parts** (designer's idea: a spinning propeller): not in 7.8; open question for Story 7.9 (an extra small sprite rotated each frame, no new texture per frame), through a course correction.
- **Lean on kept headgear:** round 3 shows each kept round-1 headgear with and without the lean.

Round 3 page: claude.ai/artifact/Rw1Uys1tS9NB6d824JvJr9 (`docs/art/7-8/round-3.html`). Designer's picks 2026-11-24: cap **B** (light logo badge; the **new default**), viking **B** (short thick horns straight out); lean on kept headgear: beanie **B**, bike **B**, chef **B**, pot **B** (with the lean), hood, cone and bunny **A** (as in round 1); milestones: headband with long tails (**M5**), plank bundle (**M7**), laurel wreath (**M8**), welding mask (flipped up) moved to **M9** (designer: "planks M7, mask M9"). Dropped: backwards cap, guitar case, letterman jacket, flag.

### Final catalogue (7.8): 51 parts in 5 slots, 31 starter / 10 milestone / 10 loot

| Slot | Starter | Milestone | Loot |
| --- | --- | --- | --- |
| Top (top colour) | jacket (default), hoodie, track, puffer | camo (M6) | floral |
| Head | none, cap (default, new drawing), beanie, hood, bike, headphones, bucket, wide-brim | fire (M1), riot (M2), gas (M3), hockey (M4), headband (M5), laurel (M8), welding mask (M9) | cone, chef, pot, bunny, viking, propeller |
| Hair (hair colour) | short (default), stubble, flat top, mohawk, tied, curly, bald | – | – |
| Pack | backpack (default), duffel, school backpack, none | planks (M7), golf bag (M10) | teddy, cat, plant |
| Skin | 8 presets (1 = default) | – | – |

Changes to Story 7.8's ACs, from these picks (for the story's next update and the reviewers): **AC 2** five slots (no accent); **AC 3** the default cap is the new drawing, every other pixel of every survivor frame stays identical; **AC 4** 51 parts, 31 / 10 / 10, slot `acc` gone; **AC 6** unchanged (each part ≥ 40 px² or a new outline at 14 px). The accent picker colour stays, as the colour of hats and bags.

### The propeller spins (designer, 2026-11-24)

The propeller cap's propeller **spins**. It is the first animated piece of equipment and the test case for animated equipment; built in Story 7.8.

- **Rule (for every later animated item):** a part may declare an **animated layer** in `cosmetics.json` (`animated: { layer, spinRevPerS }`, one part per layer). The baked body leaves the layer out; the game draws it as **its own small sprite on top of the survivor**: one texture per layer through `addGeneratedTexture` (with a redraw callback), **pooled** sprites (4 per layer), placed on the head and turned every frame with **no per-frame allocation**. Still pictures (editor tiles, Results, pick pages) draw the layer in at a fixed angle.
- Propeller: 2 turns per second (`cosmetics.json`), texture `survivorlayer_propeller_a`. Dev check: `?devlayer=propeller` (dev builds) puts it on every survivor until Story 7.9 draws per-player looks.
- Applied to the stories by `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-24-survivor-parts.md`.

## Epic 7 UI look (designer, 2026-11-25)

| Code | Decision | Picked |
| --- | --- | --- |
| 7-UI-1 | First Epic 7 UI proposals (RW/PH/BT/TR/AC/DP/SC/ED/LB, `docs/art/epic-7/looks.html`) | **Layout and ordering OK; design "too simple, not premium AAA"** → iterate one group (Results + Run rewards) first, then apply to every Epic 7 screen |
| 7-UI-2 | Premium rounds: PR1–PR6 (`premium-rewards.html`), cockpit PC1–PC3 (`premium-rewards-cockpit.html`, backdrop study only), interface languages PI1–PI3 (`premium-rewards-2.html`) | **PI1 Lumen** (Destiny 2 / Halo Infinite post-game reference: bevelled-steel frames around glass, one accent colour, display numerals, rarity cards with white-hot edges); new items land as 2–3 rarity cards (whole card = tap target). Colour theme being explored next (gold = current reference) |
| 7-UI-3 | Colour rule in menus | **Red is allowed in menu/Results/hub screens** (designer: "it seems strange to avoid red in the interface just because we use it for boss danger"). The rule "red = boss danger only" keeps applying to what the player sees during play (world + in-game HUD signals) |
| 7-UI-4 | Lumen colour theme (LG0 gold, LC1 ice cyan, LP2 platinum, LT3 teal + brass, LR4 crimson, LF5 Field Ops palette; `premium-rewards-3.html`) | **LF5: Lumen construction with the PI2 Field Ops palette** (matte charcoal faces, dark gunmetal frames, amber-orange accent, white numerals). Mitigate the orange player slot vs the orange accent. Next: apply Lumen-LF5 to the other 8 Epic 7 screens with the round-1 layouts |
| 7-UI-5 | Layout per Epic 7 screen (round 1 options, `docs/art/epic-7/looks.html`), drawn in Lumen LF5 | **Designer picks:** RW1 Results, PH1 hub, **BT1** borrowed tag on the tape, TR1 training, **TL3** one "Training" column on Results, **AC1** header button + scrolling form, DP2 district line + sheet, **SC3** line-up cards, ED1 editor, LK2 locked tile, LS1 loot silhouette. **Loot bag:** not picked — "find a better item, more related to the game, or a better bag" → the next session proposes 3 game-related options and takes the recommended one (overnight autonomous run). OA2/BF2 not picked → recommended · Lumen sheets redrawn to BT1/AC1/SC3/TL3 (overnight, 2026-11-25; `docs/art/epic-7/lumen/`, picks in `lumen/picks/`) |
| 7-UI-6 | Loot drop object (7.12) — round 2 photoreal options LB4–LB9 (`docs/art/epic-7/loot-bag-2.html`, branch `epic-7-loot-bag-look` → master) | **Designer picks LB4 hiker's backpack, LB5 tactical go-bag, LB6 lockable field case, LB7 trauma bag, LB8 police evidence bag** (not LB9). Built as **one random variant per drop** (like the Brute/Behemoth looks; `decay`-style named seed stream, never the same twice in a row). Same pick-up signal on all: soft white ground ring + white rim light + one glint. Known trade-offs the designer accepted: LB6 is a hard box (keep it visibly smaller than the supply crate, no green), LB7's white cross may suggest healing (keep the white ground ring + "Bag found!" line), LB8 shows the real item inside the plastic (the surprise is the reveal of WHO gets it) |

## Story 7.1 build-time choices (auto-accepted overnight (designer: follow the GDS recommendation), 2026-11-25)

| Code | Decision | Picked (alternative) |
| --- | --- | --- |
| 7.1 B1 | Migration numbering | **Drizzle Kit's own numbering: the story's "migration 0001" is `apps/server/drizzle/0000_init.sql`** (rename to 0001 by hand: fights the tool on every later migration) |
| 7.1 B2 | Extra safety in the first migration | **`username` UNIQUE (nullable, for 7.6) and a CHECK that `supplies` / `lifetime_supplies` never go below 0** (brief 18) (leave both to 7.2 / 7.6: a later migration on a table with rows) |
| 7.1 B3 | A malformed or oversized `deviceToken` (or an extra field such as `accountId`) in `POST /account/session` | **400 `invalid_body`** (the real client only sends a valid token; on any non-200 it joins without a ticket) (ignore the bad field and treat the device as new) |
| 7.1 B4 | PostgreSQL image | **`postgres:18.6-alpine3.24`** (2026-11-11: the newest 18.x at least two weeks old, same Alpine as the Node image) (18.7 of 2026-11-21: too new for the two-week rule) |
| 7.1 B5 | Off-VPS backup copy (D7 = Cloudflare R2) | **`rclone` to an R2 remote named in `deploy/backup.env` (`BACKUP_REMOTE`), 14 days kept on both sides; cron 03:30 `CRON_TZ=Europe/Paris`; exit 2 when no off-VPS copy was made** (aws-cli s3 to R2) |
| 7.1 B6 | Where the dev database lives | **`apps/server/.data/pglite` (gitignored, `PGLITE_DIR` overrides); a game server created without a database (tests, tools) gets a lazy in-memory PGlite opened only on first use**, so the ~1 s PGlite start costs nothing in room tests (always open one: +1 s per test file) |
| 7.1 B7 | A device over the new-guest limit (D6) or with the database down | **Still gets its (kept or new) token in the cookie and the response, `saved: false`, no ticket**: its identity stays stable and it gets an account on a later call (no cookie until saved: a new token every call) |
| 7.1 B8 | Which seat a rejoining phone owns (8.1 asked to change only `seatKey`) | **`seatKey` = `acct:<id>` with a valid ticket, else `guest:<hash>`, AND a seat also matches by the same guest token (`sameSeat` in `run/lobby.ts`)**: a phone whose second join has no ticket (save server down meanwhile) or a new one still finds its own seat and can never sit twice; the token is what resolves to the account anyway (7.1 D5). A seat that joined unsaved takes the account of a later valid ticket from the same token (the account key only: a phone that rejoins without a ticket while the save server is down gets "run started", its seat is held as 8.1 says) |
| 7.1 B9 | How the static `onAuth` gets the ticket key (Colyseus passes it the client's options only) | **A small per-process `auth/roomAccounts.ts` set by `createGameServer`** (one game server per process; tests boot them one after the other) (verify in `onJoin` from room options: the ticket would reach the room unchecked) |
| 7.1 B10 | Review L5: the guest cookie name | **`__Host-tdg` with `Path=/`, Secure, no Domain** (the browser refuses a copy planted by a sibling `*.sevend.io` page; the cookie now also rides on static file requests, ~50 bytes). No `tdg` cookies exist in production yet, so no migration read (keep `tdg` + `Path=/api` and accept the sibling-subdomain risk) |
| 7.1 B11 | Review L4: per-IP limit on every `/account/session` call | **30 per minute per IP (`ipKey`), checked before any database work; over it → `saved:false`; each rate-limit warning logged once per IP per minute** (no limit beyond the 20 new guests/hour) |
