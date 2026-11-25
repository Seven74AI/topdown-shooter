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

## Survivor editor (7.10)

- **Layout:** the designer's pick **ED1 + LK2 + LS1** (decision 7-UI-5, `docs/art/epic-7/lumen/editor.jpg`): preview column left (Back, Chosen / In game swatches, big turning preview, game-size preview), tabs Top / Head / Hair / Pack / Skin, tiles relit at tile size, LK2 locked milestone = darkened item with a lock in the middle and its line in the info row when tapped, LS1 loot = flat dark silhouette with "?", the colour row, Random + Done always in the bottom-right corner. T0 needed no new proposals (auto-accepted, 7.10 T0). As built: `docs/art/epic-7/built/7-10-*.png`.
- **Story decisions D1–D7 and build choices B1–B14:** `docs/epic-7-story-decisions-looks.md` › 7.10 build-time choices.

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
| 7.1 B12 | Re-review N-R3: seat recovery (8.1 `SeatRecovery`, a retry every ~3 s) fetched a ticket on every attempt (≈ 20 calls/min per phone: two recovering phones on one Wi-Fi hit the 30/min/IP limit) | **Seat recovery (`rejoinGame`) reuses the last ticket while it is < 9 min old (tickets live 10 min: > 60 s margin); Create / Join still fetch a fresh one** (raise the per-IP limit) |

## Story 7.2 build-time choices (auto-accepted overnight (designer: follow the GDS recommendation), 2026-11-25)

Practice solo (the offline run on the phone) **earns nothing** — no Supplies, no milestone items (7.11), no loot bag (7.12) — and Results says "Practice runs don't earn rewards" (decision 7.2 D1, accepted 2026-11-25). A one-player online game earns in full (S7). 7.11 and 7.12 follow this rule.

| Code | Decision | Picked (alternative) |
| --- | --- | --- |
| 7.2 B1 | Where the "was I there" counters are counted | **`packages/shared/src/meta/runRecord.ts`: waves and Behemoths in the economy system's `wave.ended` / `boss.killed` handler (beside the wave money), the wave a wipe falls in from `checkTeamWipe`** (the economy runs after `endRun` has already set phase "results", so "was the wipe during a wave" is read where the wipe happens) (add the phase to the `team.wiped` event: a wire/event change) |
| 7.2 B2 | Which Behemoths are "endless" | **One killed while `waves.number > runWaves`** (`boss.killed.number` is the boss count, not the wave) |
| 7.2 B3 | Where the vote's Supplies line sits | **Between the chips and the buttons (above the buttons), in EX1's column**, so the button rects of the ONE HUD layout test never move (under the buttons: the buttons move up and the HUD layout baseline changes) |
| 7.2 B4 | How a quitter's bank reaches the start screen (D4, "no extra request") | **New C2S `run.leave` sent right before a consented Leave mid-run: the server banks at once (`quit`) and answers `run.rewards` while the socket is open; the phone keeps it in localStorage and leaves after the answer or 1.5 s** (the screen moves on at once) (add the last bank to 7.1's account-session reply: its strict schema would make an older tab drop its ticket and play unsaved) |
| 7.2 B5 | A Leave, then the remembered seat (8.1 F8) comes back in a build phase | **It plays on, but its run is already banked: one row per run, the rest of the run is not paid** (brief 18) (bank the leaver only at the run end: breaks S3 "banks at once") |
| 7.2 B6 | Everyone gone (8.1 `run_abandoned`) | **Every remembered seat banks `quit` at that moment** (nothing banked, like a crash) |
| 7.2 B7 | `run_ended` and the per-player Supplies (AC 8) | **`run_ended` gains `runId`; the per-player `supplies` / `rookie` / `status` are logged as `run_supplies {runId, …}` once every bank settled** (the database answers after `run_ended`; the tick never waits) (hold `run_ended` until banking) |
| 7.2 B8 | Where the client keeps `run.rewards` (T5) | **`net/rewardsStore.ts`, matched to the Results table by run seed** (either arrival order; a late message of an earlier run never shows) (a `rewards` field on the uiState results screen, reset per run) |
| 7.2 B9 | The breakdown's form | **RW1's rows (label, bar, +amount; zero lines hidden except Waves), the rookie badge, "TOTAL" + crate + the account's Supplies** as drawn in the picked RW1 sheet (AC 5's one-line "Waves 9 × 10 = 90 · Behemoth +50 · …" text) |
| 7.2 B10 | Teammate view | **Each phone shows only its own rewards; the team table shows everyone.** The "Mo found" teammate card in the RW1 sheet is 7.12's (show teammates' Supplies too) |
| 7.2 B11 | Extra `run.rewards` fields | **`runId`, `seed`, `waveCount`, `endlessWaveCount`; the schema passes unknown fields through** so 7.4 / 7.6 / 7.7 / 7.11 / 7.12 append without breaking older tabs (AC 5's fields only) |
| 7.2 B12 | "Not saved" / "Couldn't save" panels | **The status line only, no Supplies estimate** (the rookie line needs the saved lifetime) (an estimate marked "not saved") |
| 7.2 B13 | An account with no progress row at bank time | **Created empty inside the bank transaction** (fail the bank) |
| 7.2 B14 | A Leave (or a run) that earned 0 | **Still one `run_rewards` row of 0 (banked once for that run); no start-screen line** (no row) |
| 7.2 B16 | Review M1: how a bank is kept from committing after its caller gave up | **`SET LOCAL lock_timeout` and `statement_timeout` 1500 ms in the bank transaction, plus `transaction_timeout` 1800 ms on PostgreSQL ≥ 17 (production 18); every `supplies_bank_failed` line and `docs/deploy.md` say "check `run_rewards` before a hand grant"** (a two-phase "pending" row: more code and states for the same guarantee) |
| 7.2 B17 | Review L2 / R9: a real-browser layout test | **`tools/checks/resultsDomLayout.test.ts`: Chromium via Playwright (NODE_PATH) and Vite in-process, at the four R9 sizes, short names and the worst case; skipped (never failed) where no browser is installed** (model-only layout test: missed the wide-name and 7-digit overflows) |
| 7.2 B18 (amended after re-review 1, RR-L1) | Rewards of an earlier run (a late message, same dev seed) | **New `S2C run.started {runId}` to everyone at Start and to a seat that attaches during the run or on its Results (before any `run.rewards`); the phone accepts `run.rewards` only for that run id; seed matching stays as the second guard.** First version (store cleared at run start, ids marked stale) missed a message that arrived late (alternative: the run id in the room state: a schema field on every phone) |
| 7.2 B19 | Re-review RR-M1: a bank delayed past 2 s outside PostgreSQL's own timeouts (the pool checkout) | **The bank is never raced against a timer: `db/boundedTx.ts › boundedTransaction` awaits the transaction's own outcome, bounded by the pool checkout (2 s), lock/statement timeouts (1.5 s), `transaction_timeout` (PG ≥ 17) and a pre-COMMIT budget check (1.8 s, every version); a retry starts only after a definite rollback. The panel stays "Saving…" meanwhile (worst case ≈ 10 s per attempt, corrected after re-review 2: COMMIT is not cut by `statement_timeout`; an unanswered COMMIT and its ROLLBACK are settled by the 3 s client query timeout each; normally a few ms). Exported for 7.3 / 7.5 / 7.7 / 7.11 / 7.12 money transactions** (a "pending" row confirmed in a second transaction) |
| 7.2 B20 | Re-review 2 (RR2-M1, RR2-L1, N-RR2-2): a lost connection; a half-open line; a slow Leave answer | **the client `error` handler on every checked-out pool client and TCP keepalive are Story 7.1's fix in `db/client.ts` (main session, 2026-11-25: 7.1 adds them before it lands; 7.2 keeps the real-PG test, auto-skipped until then); 7.2 adds `query_timeout` 3 s for the game (0 for migrations); a lost COMMIT reply with the database unreachable can still read "failed" while paid (documented; the retry's duplicate key or the hand-grant check covers it); the Leave waits 2.5 s for its answer and keeps it for the start screen even after joining a new run** (no client timeout: "Saving…" could last forever on a dead line) |
| 7.2 B15 | Panel labels | **Kicker "Run report" (not "Evac report": a wipe has no evac), endless rows "Endless 5×20" / "Endless boss"** (short enough for the 236 px card at 568 × 320) |

## Story 7.3 build-time choices (auto-accepted overnight (designer: follow the GDS recommendation), 2026-11-25)

Story decisions 7.3 D1–D4 were accepted with the progress file ("Okay, for all", 2026-11-25). The choices below were made while building; each is "auto-accepted overnight (designer: follow the GDS recommendation)".

| Code | Decision | Picked (alternative) |
| --- | --- | --- |
| 7.3 B1 | How `/account/session` carries `progress` (AC 4) | **An optional `progress` field (null when the read failed); the saved reply is no longer `.strict()`** so 7.5/7.7 can add fields without breaking open tabs. A 7.1-only tab open across a deploy that adds `progress` rejects the reply and plays unsaved until reloaded: deploy 7.1 and 7.3 together (a separate `GET /account/progress` route: one more call per hub open) |
| 7.3 B2 | The one-line text of the 13 starter rows (the sheet shows "Pistol · Your sidearm: never runs dry") | **`progression.json › starterLines` (one line per starter item, a test ties the quoted numbers to the balance)** (no line under starter items) |
| 7.3 B3 | A locked item I can't afford | **Price + "Not enough Supplies · need N more" on the row, no Unlock button** (as drawn in the PH1 sheet) (an Unlock button that answers "not enough") |
| 7.3 B4 | Taps while one purchase is in flight | **Every Unlock button is off until the answer** (only that row's button) |
| 7.3 B5 | Extra limit on `/account/unlock` (brief 15) | **60 calls / min per IP before any database work, plus the story's 20 / min per account; both → 429** (the account limit only: a flood would reach the database first) |
| 7.3 B6 | What identifies the buyer | **The `__Host-tdg` cookie only** (the hub calls `/account/session` on open, which rewrites the cookie from the localStorage copy) (also accept `deviceToken` in the body) |
| 7.3 B7 | "Good next pick" counting (D1) | **Items in the pool per category (Barricade upgrades counts its 2 tiers); the chosen category's cheapest locked unlock, list order on ties** (count unlock entries) |
| 7.3 B8 | Row order in a section | **Locked (cheapest first), then bought, then starter** (the Lumen README proposal) (file order) |
| 7.3 B9 | Where the Progress buttons sit | **Start screen: one row with Practice solo; lobby: one row with Leave** (a button of its own below them: the start screen already scrolls at 568 × 320) |
| 7.3 B10 | Icons | **The shop's weapon / gear / consumable drawings and the build-bar building icons (new `buildingIconUrl`), as DOM images; the grey silhouette only for Barricade upgrades** (silhouettes for the 8 items the story listed: they all have drawings since 5.26–5.28) |
| 7.3 B11 | Offline banner | **Appended to the rule line: "Unlocks add cards… · Offline · can't unlock now"** (a banner row of its own: one list row less at 568 × 320) |
| 7.3 B12 | Tabs drawn | **Only Unlocks; the bar is sized for three (128 px slots) and the tab list is data (`HUB_TABS`)** (draw Training / Survivor greyed out until 7.5 / 7.10) |
| 7.3 B13 | Keyboard | **Esc = Back** (Back button only) |
| 7.3 B14 | No migration, no balance version bump | **`progress.unlocks` exists since 7.1's 0000_init; `progression.json` is not part of `balanceVersion`** (a new migration: nothing to add) |
| 7.3 B15 | Real-browser layout test (R9; the 7.2 B17 pattern) | **`tools/checks/hubDomLayout.test.ts`: Chromium + Vite in-process at the four R9 sizes, the new player and two worst cases (Good next pick on "Grenade Launcher" with "need 500 more", a 7-digit total with the pick on "Tactical flashlight"); it caught the tag running into the action column at 568 px → the tag wraps under a long name** (model-only test) |
| 7.3 B16 | The 7.2 review M1 rule for purchases (review F1) | **`progressRepo.unlock` runs in 7.2's `boundedTransaction` (`db/boundedTx.ts`, after 7.2's re-review RR-M1), exactly like the bank: a purchase never commits after the route answered 503**; real-PostgreSQL tests added to `realPostgres.test.ts` (opt-in `TEST_DATABASE_URL`) (rely on the conditional update alone: a late commit would only show as "unlocked" on the next refresh) |
| 7.3 B17 | Merging with 7.9 (both add `progress` to the session reply) | **One optional `progress` object `{ supplies, lifetimeSupplies, unlocks, look }` from ONE repository read inside 7.1's 2 s deadline; a failed read gives `progress: null`, so the phone keeps its own look copy** (7.9 alone sent `{ look: null }` on a failed read, which cleared the device copy) (keep `{ look: null }` on failure: a database hiccup would wipe the phone's look) |
| 7.3 B18 | The lobby's Progress button after 7.9's SC3 layout | **In the header, left of Leave (`lobbyLayout.progress`, 104 px; the district line narrows to ≥ 125 px at 568 × 320 with insets), in 7.9's layout test** (on the bottom button row: no room beside Copy / Share / Ready / Start at 568) |

## Story 7.6 build-time choices (auto-accepted overnight (designer: follow the GDS recommendation), 2026-11-25)

Story decisions 7.6 D1–D6 were accepted with the progress file ("Okay, for all", 2026-11-25). The choices below were made while building; each is "auto-accepted (designer: follow the GDS recommendation)".

| Code | Decision | Picked (alternative) |
| --- | --- | --- |
| 7.6 B1 | The device's token at a login / reset (the 7.1 ticket is bound to the token hash, M1) | **A FRESH token: the old device row (and every row of the merged guest) is deleted, a new row points at the account, the cookie and `localStorage` get the new token, the client drops its cached ticket.** A copied guest key or an old ticket (bound to the old token) can never reach the account; since review L1 a join also re-checks the ticket's device row (at the reservation AND again when the socket arrives, re-review RR2), so an old ticket (after a log in, a reset or a log out) seats unsaved and never renames the account (re-point the same token row, the story's text: an old 10-min ticket of the retired guest would still seat as the guest) |
| 7.6 B2 | `run_rewards` of a merged guest | **Stay under the guest id (history; the (run, seat account) guard unchanged); a later bank of that guest (a run it left before the login ends) locks the guest's `accounts` row (FOR NO KEY UPDATE, against the merge's FOR UPDATE) and pays the account in `merged_into`** (re-point the rows: a primary-key clash when a guest seat and the account's seat banked one run, and a weaker once-only guard) |
| 7.6 B3 (amended after review M1) | Brief 19 "per account" limit on login / recover vs 7.6 D6 (only the per-IP limit) | **10 WRONG answers / minute per lower-cased username from any address (names that don't exist count the same); over it, only an address that already failed for that name is refused, a clean address is still evaluated, so the owner can never be locked out; a right answer never counts; re-review RR1: the address key is an IPv6 /56 (a /48 holds only 256 of them), IPv4 as usual. Accepted trade-off: each clean address still gets its evaluated guesses (5/min per-IP limit), so distributed guessing scales with the attacker's /56s.** First version counted every attempt and refused everyone (review M1: 2 addresses × 5 guesses locked the owner out) (D6's rejected alternative was a 10-minute lock after 20 tries; per IP only would ignore brief 19) |
| 7.6 B4 | Limits on upgrade / logout | **30 / min per IP before any work, 10 / min per account (upgrade) or device (logout)** (the 7.3 B5 pattern) |
| 7.6 B5 | The guest's progress row after the merge | **Deleted (its values live in the account's row); `merged_into` marks the guest** (zeroed: one more state that could be read as a real empty guest) |
| 7.6 B6 | Logging out a guest | **Refused (409 `not_logged_in`); Log out is shown only for a full account** (allowed: the guest's progress would be orphaned) |
| 7.6 B7 | Where merge refunds go | **Supplies only, never lifetime Supplies** (lifetime = earned in runs; the rookie lift reads it) |
| 7.6 B8 | Training costs for the D2 refund before 7.5 lands; the nudge threshold | **`progression.json › training { maxLevel: 5, costPerLevel: 50 }` (D6 / GDD 50 × level; 7.5 extends this object) and `account { saveNudgeSupplies: 200 }`; `progression.json` is not in `balanceVersion` (7.3 B14): no bump** (inline numbers) |
| 7.6 B9 | Migration number | **Drizzle Kit's own number on this tree, tag `*_accounts_devices` (the story's "0003"); generated in two passes (add, then drop) folded into ONE migration with the `INSERT … SELECT` data copy, because drizzle-kit asks rename-or-create on a TTY; regenerated last against master** (hand-written SQL + snapshot) |
| 7.6 B10 | Username columns | **`username` as typed (shown) + `username_lower` (unique, the login key)** (lower-case only: "Mo_42" would show as "mo_42") |
| 7.6 B11 | Recovery-code card and log-out confirm backdrop | **The card on the dark menu backdrop (the start screen isn't drawn under it)** (start screen dimmed underneath as in the AC1 sheet: a second live form under a modal) |
| 7.6 B12 | How the server knows "in a room" (AC 9) | **Each `RunRoom` registers a reader of its members' token hashes (connected or held, 8.1); a remembered seat whose hold ran out does not block** (client-side check only) |
| 7.6 B13 | When `save_nudged` is set | **When the bank that carries `nudge: true` commits (in the same transaction); a reconnect on Results gets that message again** (when the phone reports it shown: a client report) |
| 7.6 B14 | Results nudge look | **Last row of the Run rewards card: "Keep these Supplies on any phone:" + an outline "Save my progress" button (Back to lobby stays the one filled button)** (a filled button) |
| 7.6 B15 | Forgot password with a too-short new password | **400 `bad_password` before the code is checked (the answer says nothing about the code; the attempt still counts)** (check the code first) |
| 7.6 B16 (amended after review N2) | `device_tokens.last_seen_at` | **Set when the row is made and refreshed when the phone uses it, at most once a day (one write per device per day); `docs/deploy.md` has the cleanup SQL for full accounts' rows unused > 400 days, never a guest's** (a write per call; or never refreshed: no cleanup possible) |
| 7.6 B17 | Save my progress reported as failed | **The credentials update runs in 7.2's `boundedTransaction` (never commits after the route answered 503: the player would never see the code)** (`withDbTimeout`: a late commit with a code nobody saw) |
| 7.6 B18 (review L6, designer call auto-accepted; the designer may override) | Save my progress answers "That name is taken" (a username exists; usernames are NOT shown to other players, brief 28) | **Keep the answer (Save needs it) at 10 name checks / minute per address** (no answer: Save can't say why it failed) |
| 7.6 B19 (review L7, designer call auto-accepted; the designer may override) | Logging in on a phone whose guest has progress silently moves that progress into the account (D11) | **The Log in form shows one line first: "This phone's guest progress will be added to that account."** (no warning) |
| 7.6 B20 (review L2) | The join refusal for a device in the middle of a log in / reset / log out | **The existing `rate_limited` reason (the phone shows "Too many games created, try again in a minute"); only a hand-made double action can hit it (the account forms are off in a room)** (a new refusal reason: a wire change for every client) |
| 7.6 B21 (review L1; re-review RR3 noted) | The 7.1 / 7.2 room tests that sign tickets for made-up accounts with no device rows | **`createGameServer({ checkTicketRows: false })` in those test files only (7.1's RunRoom.account, 7.2's RunRoom.rewards, 7.4+7.5's RunRoom.progress) (default true everywhere else; the row check has its own tests)** (give every made-up account a device row: rewrites two reviewed test files) |
| 7.6 B22 (review N1) | Common passwords | **`packages/shared/src/config/commonPasswords.json` (103 of the most common 8+ character passwords, compared ignoring case), refused on Save and on a reset with "That password is too common: pick another one"; the form's Save / Next stay off for them** (none) |
| 7.6 B23 (review ops item) | `accounts.guest_token_hash` | **Kept, nullable and unused, for one release (a rollback to a 7.1–7.3 build still finds the guests made before 7.6); dropped by a later migration** (dropped now: a rollback would leave every player unsaved) |
| 7.6 B24 (review M2 follow-up) | A login that verified the OLD password and commits after a reset | **Refused: the login transaction re-checks, under the account-row lock, that the verified password hash is still current (else "Wrong username or password")** (the thief's in-flight login would survive the reset) |
| 7.6 B25 (re-review RR3, RR4: accepted) | The ticket row check's P3 fallback can be triggered by keeping the database pool busy > 1 s (an old ticket then seats for ≤ 10 min, banks only); `NameFailureLimiter` / `SlidingWindowLimiter` prune every name on each call (bounded by the window; several ms per call only with hundreds of thousands of live names) | **Accepted as they are (impact: earnings flow to the account; event-loop cost far from today's load); prune-at-most-once-a-second when these limiters are next touched** (fix now) |

## Story 7.4+7.5 build-time choices (auto-accepted (designer: follow the GDS recommendation), 2026-11-25)

Story decisions 7.4 D1–D5 and 7.5 D1–D5 were accepted with the progress file ("Okay, for all", 2026-11-25). The choices below were made while building the merged story (branch `story-7-4-5`); each is "auto-accepted (designer: follow the GDS recommendation)".

| Code | Decision | Picked (alternative) |
| --- | --- | --- |
| 7.4 B1 | One start-data type for 7.4 and 7.5 | **`PlayerInit { unlocks?, training? }` as `addPlayer`'s 5th argument; the room's `RunPlayerInit` (`meta/runStart.ts`) fills it; absent = every unlock and Training 0 (tests, bots, sims)** (two separate option objects) |
| 7.4 B2 | Where the borrow draw sits when dev cards are forced (`DEV_SHOP_CARDS`) | **The first draw after the forced cards** (no borrow when forced cards fill the offer); the lender is the lowest present slot whose pool has the card (decision 7.4 D5) (always draw 0: a forced card would cancel the borrow) |
| 7.4 B3 | Where `lenderName` comes from | **Each slot's lobby name at run start (`RunRoom.runNames`), sent in `shop.offered`; the World only holds the slot** (the live member list: empty once the lender left) |
| 7.4 B4 | BT1 on the done 5.13 card (brief 13) | **The tape row becomes the lender's tag — slot badge (player colour) + "FROM MO" on amber — and the card gets an amber outline; aria "Borrowed from Mo". BT1's side note "1 card of 6 can come from a teammate's unlocks…" is not drawn** (the side column's existing rows keep their place) (redraw the shop in Lumen: a rewrite of a done screen) |
| 7.4 B5 | Decision 7.4 D2 with 5.9's "only its builder upgrades" | **The owner (the only payer) needs Barricade upgrades; `not_unlocked` after `not_upgradable`; the 5.21 action bar hides Upgrade for them** (let a teammate with the unlock pay: a new 5.9 rule) |
| 7.4 B6 | The run-start read | **One parallel read after Start (2 s each, a second guard at 2.05 s); members, phase, host and Ready are checked again afterwards; a member who joined during the read starts with the starter pool; "Starting…" is client-side for 2.5 s (no wire field)** (a `starting` schema field) |
| 7.4 B7 | `run.rewards › lockedUsed` | **`{ unlockId, name, price }` (the name of the unlock's first item, the price from progression.json), the LAST one used; shown in group 3 whatever the bank status (not in practice)** (supply drop only; saved runs only) |
| 7.4 B8 | Room tests of the 5.9–5.13 rules (floodlight, med station, Armor II card, upgrades) | **They set `DEV_UNLOCKS=all` (a guest now plays the starter pool, D3)**; the unlock rules have their own room test (`RunRoom.progress.test.ts`) (give each test an account with every unlock) |
| 7.4 B9 | `?stress` | **Keeps every unlock** (its build scenarios place traps and lights) (the cached pool) |
| 7.4 B10 | Replays (brief 5, 8) | **`InputLog.inits` (optional): each slot's start data; absent = the defaults** (no change: a replay of a Training run would drift) |
| 7.4 B11 | Review L6: a second borrowed card bought in the same build (a paid reroll after buying the first) | **Allowed: at most ONE borrowed card per offer (the letter of D7); each reroll costs reroll money and redraws the borrowed slot from the build-start snapshot** — auto-accepted (designer: follow the GDS recommendation); the designer may override (alternative: one borrowed purchase per build) |
| 7.5 B1 | How Training joins the version check (D3) | **`balanceVersion` hashes the balance files plus `progression.json › training`: one bump, `bbdd6c4d` → `760b0734`** (a separate training version in the join options) |
| 7.5 B2 | `/account/training` answers | **`maxed` when the level asked is above 5 or the boost is at 5; `already_trained` when the level is not current + 1; `not_enough {need}`; separate limiters with the unlock's numbers (20/min/account, 60/min/IP, before any database work); the 7.3 request memo (generic now)** (share the unlock limiters: one tap budget for both) |
| 7.5 B3 | `progress.training` in the session reply | **Always all four boosts, clamped 0..5 (unknown keys dropped)** (the raw jsonb) |
| 7.5 B4 | Results Training (TL3, AC 9 text) | **One "Train" column: "10/20" (MAX at 20/20) over four small bars; the story's "Training · HP 3 · Damage 2 · Money 5 · Reload 0" is the cell's label / tooltip** (the text line in each row: does not fit 568 px) |
| 7.5 B5 | Training row at 568 × 320 (TR1) | **The Unlocks row shape: five pips in the icon column, name, "Now: …", "Next: … · ▣ 200"; the boost's line is the name's tooltip** (a fourth text line: rows grow past 56 px) |
| 7.5 B6 | Dev start money | **`DEV_STARTING_WALLET` / `?wallet` set the exact start money (Training's start money is ignored then)** (add Training on top) |
| 7.5 B7 | A launcher round whose owner is held or gone when it lands | **Training 0 (the owner is not in `world.players`)** (keep the owner's level on the round: one more pool field) |
| 7.5 B8 | Migration | **None: `progress.training` jsonb exists since 7.1's `0000_init`** |


### 7-UI-3 amended (designer, 2026-11-25)

After a 6-colour comparison (`docs/art/occlusion/colours.html`), zombie wall silhouettes stay **red**. Designer: "Red is better, red shouldn't be only for bosses. I mean that the color usually used to show danger. So it works for zombie silhouette." The in-play colour rule becomes **red = danger** (boss danger and zombies), not boss-only. Menu screens keep 7-UI-3 (red allowed).
