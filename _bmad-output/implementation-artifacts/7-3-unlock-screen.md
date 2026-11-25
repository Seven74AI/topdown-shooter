# Story 7.3: Unlock screen

Status: done

<!-- Epic 7 progression story 3 of 7. Story file 2026-11-24 (gds-create-story, non-interactive) from the real code on master 7385b47. Designer decisions D4 (starter pool + Fire Axe + Revive kit), D5 (free order, "Good next pick", no tree), D8 (unlocks can't be turned off) are rules here. -->

## Story

As a player,
I want to spend Supplies to unlock new weapons, buildings, gear and consumables,
so that my options grow over time.

> **Brief.** EPIC 6 BRIEF lines **1, 3, 4, 9, 10** (prices and item lists in `progression.json`, never in code), **17, 18, 19, 29, 31** (the hub is a menu, not HUD: check it at 568 × 320 and 800 × 360 anyway, with the existing menu overlay sizes in `ui/sizes.ts`), **32**.

> **Scope:** the unlock list in `progression.json`, an unlock route on the account API, the start-screen **Progress** hub (Supplies total + the **Unlocks** tab). **Not here:** what unlocks change in the run (7.4), the Training tab (7.5), the Survivor tab (7.10, other writer), account buttons in the hub header (7.6).

## Acceptance Criteria

### Fairness / player-visible rules (each is a test)

- **U1 "Unlocks add options, not power."** The header says "Unlocks add cards to your shop, not power". Nothing on this screen changes a number in a run (7.4 only changes which cards and tiles I see).
- **U2 "Any order, no tree."** Every locked item can be bought whenever I have its price (D5).
- **U3 "I never pay twice, and never by accident."** A double tap, two phones at once, or a retry never charges twice; an item already unlocked can't be bought again; with too few Supplies nothing changes and I see "Not enough Supplies · need 60 more".
- **U4 "A new player starts with 13 items."** A new account's pool = the starter pool (FR79, D4): Pistol, Machete, Fire Axe, Shotgun, SMG, Hunting Rifle, Body armor I, Running shoes, Revive kit, Wood barricade, Auto-turret, Medkit, Grenades.
- **U5 "What I see is what the server has."** The Supplies total and the unlocked marks come from the server; after an unlock they show the server's answer, never a local guess.

### Behaviour

1. **Unlock list** (`progression.json › unlocks`, 14 entries, 3,120 Supplies in all): `{ id, category: "weapon" | "building" | "gear" | "consumable", price, items: [item ids], line }`.
   - Weapons: `assault_rifle` 200, `chainsaw` 300, `gas_torch` 350, `flamethrower` 400, `grenade_launcher` 500.
   - Buildings: `spike_trap` 100, `bear_trap` 100, `mine` 100, `floodlight` 120, `barricade_upgrades` 150 (items `reinforced_barricade`, `metal_barricade`: the two upgrade tiers, one unlock), `med_station` 300.
   - Gear: `tactical_flashlight` 100, `body_armor_2` 250.
   - Consumables: `molotovs` 150.
   - A test: every item in `weapons.json`, `gear.json`, `buildings.json › types` and `consumables.json` is in exactly one of `starterPool` (7.1) or one unlock's `items` (the pistol is starter; a new item added to balance JSON without a place fails the test).
2. **Pool helper** (`packages/shared/src/meta/pool.ts`): `poolOf(progression, unlockIds) → Set<itemId>` (starter ∪ items of each unlock); `unlockMask(progression, unlockIds) → number` (bit i = unlock i in file order, ≤ 32 entries: a test) for 7.4; `goodNextPick(progression, unlockIds) → unlockId | null`.
3. **"Good next pick"** (D5): count what I own per category **including the starter pool** (weapons 6, buildings 2, gear 3, consumables 2 for a new player); among categories with something still locked, take the one with the fewest owned; ties broken by the cheapest locked item in them, then by list order (decision 7.3 D1). For a new player: Spike trap (100). Shown as a small "Good next pick" tag on that row.
4. **Progress data on the client.** `POST /account/session` (7.1) also returns `progress: { supplies, lifetimeSupplies, unlocks: string[] }` (7.5 adds `training`, 7.7 `districts`).
5. **Unlock route** `POST /account/unlock` `{ unlockId, requestId }` (cookie identifies the account; `requestId` a client UUID per tap). One transaction: `UPDATE progress SET supplies = supplies - price, unlocks = unlocks || [id] WHERE account_id = $1 AND supplies >= price AND NOT unlocks ? id`; 0 rows → re-read and answer `already_unlocked` or `not_enough` (with `need`); success → `{ ok, progress }`. Unknown id → 400. A repeated `requestId` within 10 min returns the first answer (in-memory map, capped). Rate limit 20 unlock calls per account per minute (no one taps faster). Log `unlocked {accountId, unlockId, price, suppliesAfter}`.
6. **Progress hub** (Preact overlay `apps/client/src/ui/ProgressScreen.tsx`, screen kind `"progress"` in `uiState.ts`). Opened by a **Progress** button on the start screen (`StartScreen.tsx`, next to Create / Join / Practice) and in the lobby (decision 7.3 D2; never during a run). Header: "Supplies **1,240**" and "Unlocks add cards to your shop, not power". Tabs row with one tab, **Unlocks** (7.5 adds Training, 7.10 Survivor: tab bar built for 3). Back button returns to where it was opened.
7. **Unlocks tab**: four sections (Weapons · Buildings · Gear · Consumables). Each row: icon (reuse the existing shop card / build-bar icon drawings; a placeholder silhouette where none exists), name, the one plain line (`line`), and either "Unlocked" (starter and bought items alike, starter tagged "Starter") or the price and an **Unlock** button. One tap on Unlock turns it into "Confirm 300" for 3 s (decision 7.3 D3); the second tap sends the request; the button shows a spinner and ignores taps until the answer. "Not enough Supplies · need 60 more" shows on the row.
8. **No network**: the hub opens with the last known progress (cached in `localStorage`, try/catch) marked "Offline · can't unlock now"; Unlock buttons disabled.

## Tasks / Subtasks

- [x] **T1 Data** (AC 1–3): `progression.json › unlocks` (with the proposed `line` texts below), zod schema, `meta/pool.ts`, completeness test, good-next-pick tests.
- [x] **T2 Server** (AC 4, 5; U3, U5): `progressRepo.unlock` (conditional update), route in `app.ts`, request-id map, limiter, logs; session response gains `progress`.
- [x] **T3 Client** (AC 6–8): `ui/ProgressScreen.tsx` (+ CSS in `overlay.css`), `uiState` kind, `net/account.ts` `unlock()`, StartScreen + LobbyScreen buttons, offline cache.
- [x] **T4 Look** (after the designer's pick, see "Needs a look?"): hub layout at 568 × 320 / 800 × 360, row layout, tags.
- [x] **T5 Tests + gate + hand-back.**

### Proposed one-line texts (designer may edit; builder checks each against the item's real effect in balance JSON)

| Item | Line |
| --- | --- |
| Assault Rifle | Fast-firing rifle, good at any range |
| Chainsaw | Close-range shredder for crowds |
| Gas torch | Short, wide cone of fire |
| Flamethrower | Long, narrow jet of burning fuel |
| Grenade Launcher | Lobs explosive rounds over cover |
| Spike trap | Hurts every zombie that walks over it |
| Bear trap | Catches a zombie and holds it |
| Mine | Blows up under the first zombie |
| Floodlight | Lights up a corner in the dark |
| Barricade upgrades | Make wood barricades reinforced, then metal |
| Med station | Heals survivors standing next to it |
| Tactical flashlight | Wider, longer light in the dark |
| Body armor II | +50 max HP (Body armor I gives +25) |
| Molotovs | Throw fire that burns for a few seconds |

## Dev Notes

### Current state (read before changing)

- **No unlock code anywhere** ("unlock" appears only as UI wording in `ui/shopStore.ts`). The Epic 7 seam is `cardPool` (`economy/shopCards.ts:150-158`), used by 7.4, not here.
- **Item ids** (balance JSON): weapons `pistol, smg, hunting_rifle, machete, shotgun, assault_rifle, fire_axe, chainsaw, grenade_launcher, flamethrower, gas_torch`; gear `body_armor_1, body_armor_2, running_shoes, revive_kit, tactical_flashlight`; buildings `wood_barricade, auto_turret, reinforced_barricade (forSale false), metal_barricade (forSale false), spike_trap, mine, floodlight, med_station, bear_trap`; consumables `medkit, grenades, molotovs`. The barricade ladder (`upgradesTo`, `forSale: false`) is validated in `config/balance.ts:159-199` and run by `buildings/upgrade.ts:59` (`upgradeBuilding`).
- **Unlock prices vs run prices:** Supplies prices (this list) are separate from run-money prices (`weapons.json › price`, e.g. Fire Axe 300, Chainsaw 600). Don't mix them.
- **Start screen** (`ui/StartScreen.tsx`, 171 lines): name field, Create game (`:123`), Join (`:147`), Refresh on error (`:155`), Practice solo (`:161-168`). `App.tsx` renders every screen; each hides itself by `uiStore` kind (`uiState.ts:8-24`). Lobby: `ui/LobbyScreen.tsx` (code, invite, 4 slots, Ready/Start/Leave).
- **Menu styles:** `ui/overlay.css`, `ui/sizes.ts` (tap sizes from Epic 5's shop and build bar).
- **Account API** from 7.1 (`apps/server/src/auth/`, `POST /account/session`, cookie `tdg`, repositories in `src/db/`).

### What must keep working

The start screen's Create / Join / Practice flow and share-link focus (`StartScreen.tsx:56-59`); the lobby; screens hiding themselves; `menuInput` keyboard/gamepad navigation in menus (`input/menuInput.ts`) for the new buttons.

### Testing

- Data: completeness test (AC 1); total 3,120; mask fits 32 bits; `goodNextPick` for a new player = `spike_trap`; after buying all buildings → the next category by the rule; everything bought → null.
- Server (PGlite): unlock with enough → supplies down, id added, one log line; not enough → `not_enough { need }`, row unchanged; already unlocked → `already_unlocked`, unchanged; same `requestId` twice → one charge; **two concurrent requests for different items** with Supplies for only one → exactly one succeeds; unknown id → 400; no cookie → 401; foreign Origin → 403.
- Client: Confirm step (first tap doesn't send; times out after 3 s); spinner blocks a third tap; offline cache view with disabled buttons; hub opens from start screen and lobby and Back returns there.
- Liveness: the concurrent test asserts one success **and** one `not_enough` (not two failures).
- Mutations: drop `supplies >= price` → the not-enough test fails; drop `NOT unlocks ? id` → the already-unlocked test fails.

### Beat the rule (reviewer start list)

1. **Cheating:** POST an unlock with a negative or string price (price comes from the server's file, never the body); unknown id; a bought id twice; edit the cached progress in `localStorage` (only display; the next session call overwrites it).
2. **Farming:** none here (no Supplies are made).
3. **Losing progress:** network drops after the server committed → the next session call shows the item unlocked; the client retried with the same `requestId` → no second charge.
4. **Two devices:** phone and tablet on the same account (7.6) unlock different items at once with Supplies for one → one wins, the other sees "Not enough".
5. **Offline:** hub opens, can't unlock, says so.
6. **Mid-run:** the hub isn't reachable in a run; unlocking in the lobby counts for the run about to start (7.4 reads progress at Start).

### Notes for the merge

- `progression.json`: 7.2 adds `supplies`, 7.5 `training`, 7.7 `districts` — separate top-level keys.
- `StartScreen.tsx`: 7.6 adds the account row ("Save my progress" / "Log in" / username + "Log out"); 7.1 prefills the name.
- `ProgressScreen.tsx` tab bar: 7.5 adds **Training**, **7.10** (other writer) adds **Survivor**; the header gets 7.6's account buttons. Keep the tab list data-driven (an array of `{ id, label, component }`).
- `auth/` routes: 7.5 adds `/account/training`, 7.6 `/account/upgrade|login|recover|logout`, 7.10 a look route.

### Dependencies

7.1 (account API, progress row, `progression.json`), 7.2 (Supplies to spend; can be built in parallel, see the build order). Needed by: 7.4 (pool and mask), 7.5 (hub and tab bar), 7.6 (hub header), **7.10** (other writer: Survivor tab in this hub).

### Decisions to confirm (recommended first, alternative after)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.3 D1 | "Good next pick" for a new player, with ties | **Count starter items too; ties go to the cheapest item: a new player's tip is the Spike trap (100)** (count only bought items: every category ties at 0, the tip becomes the cheapest item overall, also the Spike trap, then wanders between categories) |
| 7.3 D2 | Where the Progress button is | **Start screen and lobby** (spend between runs without leaving your friends) (start screen only) |
| 7.3 D3 | Guarding against a mis-tap (unlocks can't be undone) | **Tap Unlock, then "Confirm 300" within 3 s** (one tap buys) |
| 7.3 D4 | The one-line texts | **As proposed in the table above** (the designer rewrites any) |

### Needs a look?

**Yes: the Progress hub and its Unlocks tab** (readiness U2): hub frame at 568 × 320 and 800 × 360 (Supplies total, header line, tab bar for 3 tabs, Back), the item row (icon, name, line, price / Unlocked / Starter, Unlock → Confirm → spinner), the "Good next pick" tag, the "Not enough · need 60 more" state, the offline banner, and placeholder icons for items with no drawing yet (Assault Rifle, Chainsaw, Gas torch, Flamethrower, Grenade Launcher, Molotovs, Body armor II, Tactical flashlight: reuse their shop-card drawings if the designer prefers). The designer picks from code-drawn proposals before this story is built.

### References

- `epics.md` › Story 7.3; FR79; GDD › Player Progression (starter pool, unlock list); `docs/ideas/epic-7/proposal.md` § 0 D4, D5, D8, § 2, § 6; readiness report U2, Q7.

## Dev Agent Record

### Agent Model Used

Claude (builder cloud session, gds-dev-story), 2026-11-25 overnight autonomous run.

### Gate

**Gate (landing, merged with master incl. 7.9):** commit `38e7c834` = story-7-3 + master `1da29b92` (7.1, 7.2, 7.9, 8.1, 8.10 landed): typecheck && lint && test && build green — 470 files passed (3 skipped), **4,274 tests passed (23 skipped)**, build OK, 8 min 6 s, load 1.6 → 3.7 (4 cores).

**Gate (after the review fixes):** commit `fed5cc51`, 4,140 tests passed (20 skipped), 457 files, 7 min 48 s, load 0.4 → 4.5 — see Review fixes.

**Gate (before review):** commit `b9511c0b` on `story-7-3` = story-7-1 `e1f97a39` (with 8.1) + story-7-2 `9b9cb3ef` (review fixes) + master `8248be06` merged; `npm run typecheck && npm run lint && npm test && npm run build` green — **457 test files passed (2 skipped: realPostgres without TEST_DATABASE_URL, noCheatsInRelease before dist), 4,125 tests passed (13 skipped)**, build OK; 7 min 47 s; load 0.8 at start, 4.7 at the end (4 cores). Includes the real-browser hub test (12 cases) and 7.2's.

Earlier gate (superseded): `fcaad5a0` (story-7-2 at `7401f6dc`), 455 files / 4,098 tests green, 7 min 26 s, load 1.6 → 4.8.

### Tasks → tests (R1)

- **T1 Data** — `packages/shared/src/meta/pool.test.ts` > "has the 14 story entries at the story prices, 3,120 Supplies in all", "completeness: every balance item is in exactly one of starterPool or one unlock's items", "each unlock's category is the balance file its items are in", "the plain lines that quote a number match the balance (D4 texts vs real effects)", "the schema refuses an item in two places, a duplicate unlock, a non-positive price, > 32 unlocks", "U4: a new account's pool is the 13 starter items", "adds every item of each bought unlock, ignores unknown ids", "the mask: bit i = unlock i in file order, fits 32 bits, unsigned", "counts the starter pool: weapons 6, buildings 2, gear 3, consumables 2", "a new player's pick is the Spike trap (100)", "ties on the count go to the cheapest locked item, then list order", "after all buildings, the next category by the rule; everything bought → null"; `packages/shared/src/config/progression.test.ts` > "refuses duplicates, bad ids, extra keys and an empty pool".
- **T2 Server** — `apps/server/src/auth/unlockRoute.test.ts` > "enough Supplies → Supplies down by the FILE price, the id added, one `unlocked` log line, the server's progress answered", "the session reply carries the same progress (AC 4, U5)", "U3: not enough → not_enough with `need`, the row unchanged", "U3: already unlocked → already_unlocked, nothing charged (a second tap with a new requestId)", "U3: the same requestId twice (a retry, and a double-submit at once) → one charge, the first answer both times", "brief 18 liveness: two concurrent buys of DIFFERENT items with Supplies for one → exactly one ok AND one not_enough", "two devices on one account (same cookie) buying the same item at once → one ok, one already_unlocked, one charge", "beat the rule: a price in the body, an extra accountId, an unknown id, a bad requestId → 400; nothing charged", "no cookie, a malformed cookie or a cookie of no account → 401", "20 calls per account per minute, then 429 (and nothing more is bought)", "the database down → 503, never a fake ok", "a foreign or missing Origin → 403 before anything else", RequestMemo > "returns the first answer within the TTL, forgets after it, holds at most `cap`", "an unknown id is refused before any database call". Mutations run: dropping `supplies >= price` fails "U3: not enough…" and "brief 18 liveness…"; dropping `NOT unlocks ? id` fails "U3: already unlocked…" and "20 calls per account…".
- **T3 Client** — `apps/client/src/ui/hubModel.test.ts` > "U1: the header line; one tab (Unlocks) in a bar built for three", "four sections in order; 13 starter rows (Unlocked · Starter) + 14 unlock rows", "U2: every locked item I can afford is 'buy' (any order); too dear is 'short' with how many more", "locked first (cheapest first, list order on ties), then bought, then starter", "AC 3: the Good next pick tag is on the Spike trap for a new player, on one row only", "U5: Supplies come from the given (server) progress; '–' before any is known", "the first tap doesn't send; it shows 'Confirm 100 · Tap again · 3 s'", "the second tap within 3 s sends once with a fresh request id; then a spinner and every tap is ignored", "a fine time sweep (1 ms): the confirm step sends before 3,000 ms and times out at 3,000 ms exactly", "a tap on another row moves the confirm there (nothing sent)", "AC 8: offline, taps do nothing and the button is disabled", "answers: ok/not_enough/already show the SERVER's progress; a stale answer is ignored; failures say so"; `apps/client/src/net/progressStore.test.ts` > "refresh shows the server's progress and caches it", "AC 8: no network → the cached copy, marked offline (source 'cache'); nothing cached → none", "beat the rule: an edited or broken cache is only shown if it parses, and the next server answer overwrites it", "storage that throws (private mode) never breaks the hub", "an unlock answer (accept) wins over a refresh still in flight; markOffline keeps the numbers", "a session server older than 7.3 (no `progress` field) → offline view, ticket flow untouched", unlockItem > "posts { unlockId, requestId } same-origin…", "4xx/5xx, a malformed reply, no network → failed…", "the default path is <origin>/api/account/unlock…"; R2 wiring: `tools/checks/progressHubWiring.test.ts` > "App renders the hub; the start screen and the lobby open it (D2)…", "the hub refreshes from the server on open…Back returns to `back`", "a tap goes through tapUnlock; the answer through answerUnlock; the SERVER's progress is shown (U5)", "the server registers /account/unlock with the account limiter, the IP limiter, the request memo and the progress repo".
- **T4 Look** (PH1, Lumen LF5) — `apps/client/src/ui/hubModel.test.ts` > "568×320 / 640×360 / 800×360 / 844×390: inside the safe area, no overlaps, every tap target ≥ 44 px", "a fine width sweep (1 px, 568 → 1400) keeps every rule; the frame is centred and capped at 760", "text ≥ 11 px everywhere; the button is 44 px"; `tools/checks/hubLayoutCss.test.ts` > "frame, header, tabs, list, rows and button use the model's numbers", "R9: no font size below 11 px in the .ph* rules…". Browser check (Chromium, Playwright, insets 44/21 emulated by padding): no overlap, nothing outside the safe area, no button < 44 px, no text < 11 px at all four sizes; 2 whole rows at 568 × 320, 3 at the others. Screenshots: `docs/art/epic-7/built/7-3-hub.png` (568 × 320, dpr 2, Confirm 300 on the Chainsaw) and `docs/art/epic-7/built/7-3-hub-states.png` (Good next pick, Unlocking… spinner, offline with Not enough, 800 × 360).
- **T4 (real browser, R9)** — `tools/checks/hubDomLayout.test.ts` > "568×320 … 844×390, new player, 340 / worst: 0 Supplies, pick on Grenade Launcher (need 500 more) / worst: 7-digit total, pick on Tactical flashlight: inside the safe area and the row columns, text ≥ 11 px, buttons ≥ 44 px" (12 cases; failed on the tag overflow at 568 before the `flex-wrap` fix).
- **T2 on real PostgreSQL** — `apps/server/src/db/realPostgres.test.ts` > "Story 7.3: unlocks on real PostgreSQL" > "brief 18: two different items at once with Supplies for one → exactly one unlocked + one not_enough, ×10", "the same item ×10 at once → one unlocked, nine already_unlocked, charged once", "a bank and an unlock at once both land (Supplies add up exactly)", "the 7.2 M1 bound: a row locked 3 s → the unlock fails inside 2 s and never commits later". Run here on a local PostgreSQL **16** (`TEST_DATABASE_URL`, port 2735): 10 / 10 green with 7.2's six; dropping `NOT unlocks ? id` fails "the same item ×10". Skipped in the gate (no `TEST_DATABASE_URL`).
- **T5** — the gate above; hand-back sent to @parent.

### Completion Notes List

- Story file written 2026-11-24 (gds-create-story, non-interactive) from master 7385b47; decisions 7.3 D1–D4 accepted 2026-11-25 ("Okay, for all").
- Built on story-7-1 + story-7-2 (7.2 merged cleanly: Supplies to spend come from 7.2's banking). Build-time choices 7.3 B1–B16 in `docs/epic-7-decisions.md` (auto-accepted overnight).
- Browser run (dev server 2731, Vite 5731): new account + 340 Supplies → Chainsaw Confirm → Spike trap bought → header 240 (server's answer) → Back to the start screen → API blocked → hub opens offline with 240 and Unlock off; lobby Progress → Back → lobby with the same code; Esc = Back.
- No migration (7.1's `progress.unlocks`), no balance version bump, no netEvents kind, no readability item, no new state field (nothing in the World changes: brief 2 copies untouched).
- Text check (R8): numbers in this file and the brief are unchanged by the build.

### Notes for the merge

- **Merge order:** 7.1 (+8.1) and 7.2 are inside this branch. Master 8.10 conflicted with 7.1/8.1 in `connection.ts` (options keep `ticket` AND `netProtocolVersion`), `messages.ts` (`JoinRefusal` = … `seat_kept` | `update_required`), `NetSimHost.ts` (8.1's `rebaseAfterGap` block kept), `tools/bots/run.ts` (flags `cut-*` + `kbps`), `sprint-status.yaml`, `docs/perf/network-pass-2026-11.md` (both sections); and four 7.1/8.1/7.2 test files needed `netProtocolVersion` in their join options (commit `fcaad5a0`). If the main session merges 7.1 onto master itself, the same fixes apply there.
- `packages/shared/src/config/progression.json`: new top-level keys `unlocks` and `starterLines` (7.2 owns `supplies`; 7.5 adds `training`, 7.7 `districts`).
- `packages/shared/src/net/account.ts`: the saved session reply is no longer strict and gains optional `progress` (B1). **Deploy 7.1 and 7.3 together**, or a 7.1-only tab open across the deploy plays unsaved until reloaded. 7.5/7.7 extend `progressViewSchema` (not strict).
- `apps/server/src/auth/accountRoutes.ts` returns `{ accountSession, accountUnlock }`; `app.ts` registers both. 7.5 (`/account/training`), 7.6, 7.10 add routes beside them; `GuestSessionDeps.progress` gives the session reply its progress.
- `apps/server/src/db/progressRepo.ts`: new `unlock()` beside 7.2's `addSupplies`. **No migration** here (7.9's `look` migration takes the next free number freely).
- `net/limits.ts`, `net/rateLimit.ts`, `test/bootTestServer.ts`: new unlock limiters (reset per test).
- `apps/client/src/ui/StartScreen.tsx`: Practice solo + Progress now in one `.menu__row` (7.6 adds its account row elsewhere). `LobbyScreen.tsx`: Progress + Leave in one `.lobby__row` (SC3 lobby restyle later keeps a Progress button).
- `ui/uiState.ts`: screen kind `progress { back }` + `openProgress`. `ui/hubModel.ts › HUB_TABS`: 7.5 appends Training, 7.10 Survivor; the hub header has room right of Supplies for 7.6's account buttons.
- `render/city/buildIcons.ts`: one function appended (`buildingIconUrl`); the asset session also edits this file.
- `overlay.css`: new `.ph*` block at the end and `.menu__row`.

### Not verified

- Real phones (Mi 11i, iOS Safari), the keyboard/gamepad path beyond Tab + Esc, and the VPS. Parallel purchases were run on a real PostgreSQL **16** (not 18): `transaction_timeout` (≥ 17) was therefore not exercised; the lock/statement bound was.
- `?lag` / lossy line and a hidden-tab sleep while the hub is open (the hub is an HTTP menu, not the run; an unlock answer after a sleep is still the server's).
- The 8 s cut / reconnect while in the hub from the lobby (the room stays joined; not exercised).
- The designer has not seen the built hub; the Training / Survivor tabs are not drawn (B12).

### File List

- packages/shared/src/config/progression.json, progression.ts, progression.test.ts; packages/shared/src/meta/pool.ts, pool.test.ts; packages/shared/src/net/account.ts; packages/shared/src/index.ts
- apps/server/src/auth/unlock.ts, unlockRoute.test.ts, accountRoutes.ts, guestSession.ts; apps/server/src/db/progressRepo.ts; apps/server/src/net/limits.ts, rateLimit.ts; apps/server/src/test/bootTestServer.ts; apps/server/src/app.ts
- tools/checks/hubDomLayout.test.ts; apps/server/src/db/realPostgres.test.ts (7.3 block)
- apps/client/src/ui/ProgressScreen.tsx, hubModel.ts, hubModel.test.ts, uiState.ts, App.tsx, StartScreen.tsx, LobbyScreen.tsx, overlay.css; apps/client/src/net/progressStore.ts, progressStore.test.ts, account.ts; apps/client/src/render/city/buildIcons.ts
- tools/checks/hubLayoutCss.test.ts, progressHubWiring.test.ts
- docs/art/epic-7/built/7-3-hub.png, 7-3-hub-states.png; docs/epic-7-decisions.md; _bmad-output/implementation-artifacts/sprint-status.yaml
- merge fixes: apps/client/src/net/connection.ts, apps/client/src/sim/NetSimHost.ts, packages/shared/src/net/messages.ts, tools/bots/run.ts, docs/perf/network-pass-2026-11.md, apps/server/src/auth/accountRoutes.test.ts, apps/server/src/rooms/RunRoom.account.test.ts, RunRoom.reconnect.test.ts, RunRoom.rewards.test.ts

## Senior Developer Review (AI)

**Reviewer:** fresh reviewer session (gds-code-review, three layers + beat the rule), 2026-11-25. **Branch:** `review-7-3` = `origin/story-7-3` d52caffb + `origin/master` (merge: already up to date, no conflicts). Reviewed 7.3's own commits 4e2e4e21 + d52caffb (7.1 / 8.1 / 7.2 code not reviewed). `npm ci` + `npm run typecheck` green; only probed / mutated tests run (no full gate, as instructed).

**Verdict: CHANGES REQUESTED (3 medium, 7 low, 2 nit).** The money core holds on **real PostgreSQL 16 with true parallel transactions**: no double charge, never below 0, one success + not_enough under concurrency, no deadlock with 7.2 banking. The mediums are a slow-DB "told failed but charged" path, a hub that says "try again" but can't, and an untested account-scoped memo (info-leak guard).

### Findings

| ID | Sev | Where | Scenario | Minimal fix |
| --- | --- | --- | --- | --- |
| F1 | **Medium** | `apps/server/src/db/progressRepo.ts:82` (tx) with `db/timeout.ts:24`, `auth/unlock.ts` `run()` | DB slower than `DB_TIMEOUT_MS` (2 s): `withDbTimeout` rejects → **503 `save_unavailable`**, client shows "Couldn't reach the save server" + offline, but the abandoned transaction keeps waiting and **commits the charge**. Probe P7 on real PG: row lock held 2.5 s by another session → reply 503, then row = `{supplies: 0, unlocks: ["chainsaw"]}` (was 300). Not a double charge (a retry answers `already_unlocked`), but the player is told it failed while paying, and the hub keeps the old Supplies (brief 20 "honestly", U5). | First statement in the unlock transaction: `SET LOCAL lock_timeout = '1500ms'` + `SET LOCAL statement_timeout = '1500ms'` (below the 2 s app timeout) so PostgreSQL aborts before the app gives up; plus F2's refresh after a failure. Test: hold `FOR UPDATE` 2.5 s from a second connection, assert 503 **and** the row unchanged. |
| F2 | **Medium** | `apps/client/src/ui/ProgressScreen.tsx:99`, `ui/hubModel.ts:229` | After a 5xx / timeout the row note says "Couldn't reach the save server · **try again**", but `markOffline()` disables every Unlock button and nothing refreshes again until Back + reopen. Browser check (568×320, stubbed 503): offline banner on, all `.ph-btn` disabled. With F1 the shown Supplies are also stale. | `else if (r.offline) { progressStore.markOffline(); void progressStore.refresh(); }` (a good refresh brings the server truth and re-enables Unlock); wiring test for it (see F7). |
| F3 | **Medium** (test gap on brief 19) | `apps/server/src/auth/unlock.ts:110` | Mutation M1 `key = input.requestId` (memo not keyed by account) **passes all 14 route tests**. Behaviour today is right (probe P6: account B replaying A's requestId gets its own purchase), but a regression would hand A's answer (Supplies, unlock list) to anyone replaying A's requestId: an info leak, and B's purchase silently not made. | Test: accounts A and B, same `requestId`; B's answer has B's progress and B is charged. |
| F4 | Low | `auth/unlock.ts:96` | IP limiter untested: mutation M2 (`if (false)`) passes. Live probe P9: 60 calls / min / IP → 401 each, then 429 ×3, `unlock_rate_limited {ip}` logged **once** (works). | Route test: 61 calls from one `x-real-ip` without a cookie → last is 429, one log line. |
| F5 | Low | `auth/unlock.ts:120` | Forgetting a failed answer is untested: mutation M4 (never delete) passes; a regression would replay one 503 to every retry with that id for 10 min. | Test: DB fails once (spy), retry with the same `requestId` succeeds. |
| F6 | Low | `packages/shared/src/meta/pool.ts:78` | The category tie-break by cheapest price is untested: mutation M7 (drop `cand.price < best.price ||`) passes, because in every test case the cheaper category also has the lower list index (spike_trap #5 vs molotovs #13). | One case with a synthetic progression where price order and list order disagree. |
| F7 | Low (R2) | `ui/ProgressScreen.tsx:99` | `markOffline()` wiring: mutation M14 (delete the line) passes the wiring and model tests. | Add the line to `tools/checks/progressHubWiring.test.ts`. |
| F8 | Low | `apps/client/src/ui/overlay.css:1799` `.ph-name` | `nowrap` with no overflow / ellipsis on the name text: a 30-char name ("Reinforced metal barricade kit") at 568×320 pushes the "Good next pick" tag under the Unlock button (tag right 430 px > action left 406 px). All current names fit at the four sizes (0 overflows, 0 text < 11 px, 27 rows). | Wrap the name text in a span with `overflow: hidden; text-overflow: ellipsis; min-width: 0`. |
| F9 | Low | `auth/accountRoutes.ts:65`, `auth/unlock.ts:94` | A bad body (400 `invalid_body`) and an unknown id (400 `unknown_unlock`) are answered before the IP limiter and never logged (brief 15: "guarded, rate-limited and logged"). No DB work, no data leaked (catalogue is public), so harmless today. | Check `ipLimiter` first in the route (before body parse). |
| F10 | Low (doc) | `packages/shared/src/net/account.ts:44`, Notes for the merge | B1's "deploy 7.1 and 7.3 together" is **correct** (7.1's strict saved schema rejects `progress`; 7.1 isn't deployed yet), but it lives only in this story file. Also the `saved:false` branch and the `account` sub-object are still `.strict()`: a later field there breaks open tabs the same way. | Copy the deploy rule to HANDOFF / the deploy checklist; note the remaining strict parts for 7.5 / 7.6. |
| F11 | Nit | dev overlay | The dev-only "Dev cheats" ⚙ button sits on top of the hub header at 568×320 (x≈458–500, y≈16–56), in the gap kept for 7.6's account buttons. Dev builds only. | Check when 7.6 fills the header. |
| F12 | Nit (look) | `overlay.css` `.ph*` vs `docs/art/epic-7/lumen/hub.jpg` | Built hub matches PH1's structure (back key, Supplies, rule line, tab bar, one list, Confirm / spinner / Not enough / Starter / Good next pick). Deviations: names and buttons in a wide sans instead of the sheet's condensed face, so 2 whole rows show at 568×320 (sheet ≈3); "Not enough · need N" sits under the line on the left (sheet: under the price, right) and makes the row taller; only one tab drawn (B12, accepted). | Designer look pass; no code change required for 7.3. |

### Beat the rule (every attempt)

| # | Attempt | Result |
| --- | --- | --- |
| 1 | No cookie / forged cookie (random 32-hex) / malformed cookie | 401, nothing charged (P8 + existing test) |
| 2 | `deviceToken` or `accountId` in the body (B6 cookie-only) | 400 strict schema (existing test); cookie is the only identity |
| 3 | Price in the body (−500) / string id / non-UUID requestId / bad JSON | 400, nothing charged |
| 4 | Starter item (`pistol`) / id not in progression.json | 400 `unknown_unlock`, before any DB call |
| 5 | Negative price from data | impossible: schema `int().positive()`, repo throws on `price <= 0` |
| 6 | 3 different items, Supplies for one, parallel, **real PG**, 30 rounds | always exactly 1 ok + 2 not_enough, balance ≥ 0 (P1) |
| 7 | Forced overlap: row locked by a 3rd session while 2 buys queue (pg_stat_activity: **2 waiting on Lock**), then released | 1 ok + 1 not_enough, supplies 0 (P2: EvalPlanQual re-check holds) |
| 8 | Same item ×10 in parallel, fresh requestIds | 1 ok + 9 already_unlocked, one charge (P3) |
| 9 | Same requestId double-submit at once | one DB run, same answer (existing test) |
| 10 | requestId replay after memo loss (= restart / 10 min TTL / 10k cap overflow) | `already_unlocked`, **not charged twice** (P5) — the DB condition is the real guard |
| 11 | Account B replays account A's requestId | B gets its own purchase (P6); untested (F3) |
| 12 | 7.2 bank (`FOR UPDATE`) and unlock on one account at the same instant, real PG, 20 rounds | lifetime always 300; ok ⇒ {0, [chainsaw]}, else {300, []}; no deadlock (P4) |
| 13 | 21 calls / min / account | 429 (existing test; mutation M3 caught) |
| 14 | 61+ calls / min / IP, no cookie | 60 × 401 then 429; `unlock_rate_limited {ip}` logged once (P9); untested (F4) |
| 15 | DB unreachable (dead port) | unlock 503 `save_unavailable`; session `saved:false` (P10); nothing charged |
| 16 | DB slower than 2 s | **503 but charged afterwards** (P7 → F1) |
| 17 | 503 in the hub (browser, stub) | offline banner, every button off, "try again" impossible (F2); Esc closes the hub |
| 18 | unlockMask at the 33rd unlock | schema `.max(32)` refuses `progression.json` at load (server won't boot; tested); bit 31 kept unsigned (`>>> 0`, M6 caught). 14 used: 18 left before 7.4's mask needs widening |
| 19 | Good next pick: new player / after Spike trap | `spike_trap` / `molotovs` (consumables 2 is the fewest) — matches D1 |
| 20 | Hub at 568×320, 640×360, 800×360, 844×390 (browser) | no name overflow, no text < 11 px, 27 rows; long-name probe → F8 |
| 21 | Edited localStorage cache | display only; next session reply overwrites (existing test) |
| 22 | Session reply now non-strict (B1) | deploy-together note correct (F10) |

Probe code (temporary, not committed): a Vitest file booting the real server on `openPostgres` against a local PostgreSQL 16 (`apt` had no `postgresql` package; the image ships `/usr/lib/postgresql/16`), with raw `pg` sessions holding row locks; Playwright + Vite dev server with stubbed `/api/account/session` and `/api/account/unlock`.

### Mutations (one per new test file, each reverted)

| # | Mutation | Result |
| --- | --- | --- |
| M1 | memo key `requestId` only (`unlock.ts:110`) | **survived** (F3) |
| M2 | IP limiter off (`unlock.ts:96`) | **survived** (F4) |
| M3 | account limiter off | caught: "20 calls per account per minute…" |
| M4 | failed answers kept in the memo (`unlock.ts:120`) | **survived** (F5) |
| M5 | session reply's progress altered (`guestSession.ts`) | caught: "the session reply carries the same progress" |
| M6 | `unlockMask` without `>>> 0` | caught: "the mask: … unsigned" |
| M7 | Good next pick price tie-break dropped | **survived** (F6) |
| M8 | `progression.ts` "one place per item" refine off | caught: "the schema refuses an item in two places…" |
| M9 | `tapUnlock` ignores offline | caught: "AC 8: offline, taps do nothing…" |
| M10 | confirm window `<` → `<=` | caught: "a fine time sweep (1 ms)…" |
| M11 | `progressStore.accept` doesn't cache | caught: 2 progressStore tests |
| M12 | `.ph-tab` width 128 → 120 | caught: hubLayoutCss "frame, header, tabs…" |
| M13 | ProgressScreen drops `progressStore.accept` | caught: progressHubWiring "…the SERVER's progress is shown" |
| M14 | ProgressScreen drops `markOffline()` | **survived** (F7) |

The builder's own mutations (drop `supplies >= price`, drop `NOT unlocks ? id`) are recorded in Tasks → tests; not re-run.

### R1 / R6

- **R1:** every [x] task has "file > test name" beside it; the tests named under T2–T4 exist under those names (checked in `unlockRoute.test.ts`, `pool.test.ts`, `hubModel.test.ts`, `progressStore.test.ts`, `progressHubWiring.test.ts`, `hubLayoutCss.test.ts`). OK.
- **R6:** Gate line present (fcaad5a0, 7.1 e1f97a39 + 7.2 7401f6dc + master f67154d7, 455 files / 4,098 tests, load 1.6 → 4.8). OK. "Not verified" honestly lists PGlite-only concurrency, now covered by this review on PostgreSQL 16.


### Review fixes (builder, 2026-11-25)

Fixes on `story-7-3` after merging origin/story-7-2 `fac177da` (7.2 re-review 1: `db/boundedTx.ts`), story-7-1 `e1f97a39`, master `8248be06`. **Gate:** commit `fed5cc51`: typecheck && lint && test && build green — 457 files passed (2 skipped), **4,140 tests passed (20 skipped)**, build OK, 7 min 48 s, load 0.4 → 4.5 (4 cores).

| ID | Fix | Test (file > name) | Mutation |
| --- | --- | --- | --- |
| F1 | `progressRepo.unlock` runs in 7.2's `boundedTransaction` (same helper as the bank) | `apps/server/src/db/realPostgres.test.ts` > "review F1 (route level): DB slower than 2 s — row locked 2.5 s by another session → 503 AND the row unchanged afterwards", "the 7.2 M1 bound: a row locked 3 s → the unlock fails inside 2 s and never commits later" (run on local PostgreSQL 16: 17 / 17 green with 7.2's) | plain `withDbTimeout` + transaction → both fail |
| F2 | After a failed unlock: `markOffline()` then `void progressStore.refresh()` | `tools/checks/progressHubWiring.test.ts` > "a tap goes through tapUnlock…" (new regex); `apps/client/src/net/progressStore.test.ts` > "review F2: after a failed unlock (markOffline), the refresh that follows brings the server back (Unlock usable again)" | delete the refresh → wiring fails |
| F3 | (test) | `apps/server/src/auth/unlockRoute.test.ts` > "review F3: accounts A and B sending the SAME requestId → B gets its own answer (its progress) and is charged" | memo key = requestId → fails |
| F4 | (test) | `unlockRoute.test.ts` > "review F4 + F9: 60 calls per IP per minute (no cookie → 401), then 429 — before the body is read — and one log line" | IP limiter off → fails |
| F5 | (test) | `unlockRoute.test.ts` > "review F5: a failed answer is forgotten — the database fails once, the retry with the SAME requestId succeeds" | never delete → fails |
| F6 | (test) | `packages/shared/src/meta/pool.test.ts` > "review F6: a count tie goes to the CHEAPER category even when its unlock comes later in the list" | drop `cand.price < best.price ||` → fails |
| F7 | (wiring) | as F2 | — |
| F8 | `.ph-name__text` span: `min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis` | `tools/checks/hubDomLayout.test.ts` > "568×320 … review F8: a 42-char name on the Good next pick row…" (30 characters already fit since B15's wrap, so the case uses 42) | rule removed → fails at 568 |
| F9 | Route: per-IP limit first (`unlockIpAllowed`), before the body is parsed; a bad body / unknown id logs `unlock_refused {ip, reason}` once per IP and reason per minute. Unparsable JSON is still refused by the Colyseus router before the handler (no database work) | `unlockRoute.test.ts` > "review F4 + F9…", "review F9: a bad body and an unknown id are logged (once per IP and reason), never silently dropped" | — |
| F10 | `saved:false` branch and `account` sub-object no longer strict; deploy rule copied to `docs/deploy.md` › Database › Unlocks and `docs/hermes-go-live.md` › First Epic 7 deploy (HANDOFF left to the main session) | `progressStore.test.ts` > "review F10: …an unknown field at the top, in `account`, in `progress` or in the saved:false reply is dropped, never a rejection" | — |
| F11 | `body:has(.menu.ph) .dev-gear { display: none }` (CSS only, no clash with 7.9's DevCheats.tsx change) | `hubDomLayout.test.ts` (every case asserts no visible dev gear) | rule changed → all cases fail |
| F12 | **Left for the designer:** the condensed face (≈3 rows at 568 × 320) is a font choice; "Not enough Supplies · need N more" (U3's exact text) doesn't fit the 144 px action column under the price | — | — |

F1, F2, F9 → narrow re-review.

### Re-review (narrow) 1 (AI, 2026-11-25)

Scope: the fix commit `a6987298` and F1's merge resolution in `fed5cc51` (unlock in `boundedTransaction`), on `rereview-7-3` = `story-7-3` 9bdbe687 + master. 7.1 / 7.2 / 8.1 code not reviewed except where F1's path runs through it. Real **PostgreSQL 16.15** scratch cluster (port 5791), route-level probes through the real HTTP server (`bootTestServer` on the Postgres pool). Probes and raw output: `_bmad-output/implementation-artifacts/7-3-review-probes/rereview1-*.txt`.

**Verdict: changes requested — 1 medium (in F1's path, but the code is shared 7.1/7.2 code), 1 low, 1 nit.** F1–F11 do what they say; the money invariant held in every attempt.

#### Findings

| ID | Sev | Finding | Evidence / fix direction |
| --- | --- | --- | --- |
| RR-M1 | medium | **A PostgreSQL backend killed mid-transaction crashes the whole game server.** `pg-pool` removes its `error` listener while a client is checked out (`pg-pool/index.js:344`); `db.transaction()` (Drizzle → `pool.connect()`, used by `boundedTransaction`, so the unlock AND the 7.2 bank) holds such a client; when its backend dies (postgres container restart / OOM / `pg_terminate_backend` / failover) the client emits `error` with no listener → `uncaughtException` → Colyseus' `registerGracefulShutdown` shuts every room down and exits. The transaction itself rejects correctly (503, nothing committed). Not introduced by the fixes (7.1 `db/client.ts` only guards idle clients) but it breaks P3 ("database down → play goes on") the first time the DB restarts during a bank or purchase. | Probe `rereview1-kill-crash.probe.ts.txt`: `boundedTransaction` with `pg_sleep(1)`, backend terminated at 300 ms → `tx rejected: db probe: error; uncaught=["Connection terminated unexpectedly"]`; the route probe (backend waiting on the row lock, terminated) ends the vitest worker with `process.exit unexpectedly called with "1"`. Fix: in `openPostgres`, `pool.on("connect", (c) => c.on("error", (e) => log.error({ op: "pool_client", err: e.message }, "db_error")))` (a listener that stays while checked out); add the probe as a real-PG test. Owner: whichever branch lands first (7.1 `db/client.ts`); must be in before the first Epic 7 deploy. |
| RR-L1 | low | **The client gives up (3 s, `ACCOUNT_TIMEOUT_MS`) before the route's worst case (~2 s account lookup + 2 s checkout + 1.8 s budget).** With the pool busy, the purchase can commit after the phone shows "Couldn't unlock"; F2's refresh then fetches the pre-commit row and shows it as *server* truth (Unlock enabled, old balance, item not owned). No double charge: a second tap gets `already_unlocked` + the true progress, and reopening the hub fixes it. | Route probe: 5 plain 1.9 s queries hold the pool, row lock released at 3.3 s → `200 ok=true in 3278 ms`, charged once (route consistent); a session call at 3.0 s (= F2's refresh) answered `{"supplies":1000,"unlocks":[]}` while the unlock committed `900, ["mine"]` 270 ms later. Fix direction (pick one): client unlock timeout > the route's bound (e.g. 7 s, separate from the session's 3 s), or the route answers 503 when its own elapsed time passes ~2.8 s *before* COMMIT (in `boundedTransaction` via a deadline option). |
| RR-N1 | nit | **F8's test doesn't guard the ellipsis.** Removing only `overflow: hidden; text-overflow: ellipsis` (keeping `min-width`/`max-width`) leaves all 16 hub cases green, though the 42-char name then paints 63 px into the action column at 568 × 320 (ink right 425 px vs column 362 px). The test measures boxes (`getBoundingClientRect`), and the span's box stays inside. The fix itself works (with it: `scrollWidth 307 > clientWidth 244`, `overflow hidden`, `text-overflow ellipsis`). | Add `e.scrollWidth <= e.clientWidth || getComputedStyle(e).textOverflow === "ellipsis" && overflow hidden` (or ink right = left + scrollWidth ≤ column right unless clipped) for `.ph-name__text`. |

#### Exploit attempts (all on real PostgreSQL 16 through the HTTP route unless noted)

| Attempt | Result |
| --- | --- |
| Row locked 1.4 s | 200 ok in 1,359 ms, charged once — consistent |
| Row locked 1.79 / 1.81 / 2.5 / 5.5 s | 503 in ~1,505 ms each (lock/statement timeout 1.5 s), row unchanged after the lock released + 1.5 s — consistent |
| Same `requestId` retried after each 503 (then once more) | first retry 200 ok (failed answer forgotten, F5), second retry = memo answer; supplies 900 every time — never double-charged |
| Pool saturated by 5 banks on locked rows (held 1.3 / 1.9 / 1.95 s) + row lock 2.3 / 1.4 / 1.45 s | 200 ok in 2,187 / 1,486 / 1,487 ms, charged once (the bank holders give up at 1.5 s themselves) — consistent |
| Pool held by 5 plain `pg_sleep(1.9–1.95)` + row lock to 3.3 / 3.6 / 4.0 s | 200 ok in 3,278 ms charged / 503 in 3,377 ms unchanged / 503 in 3,426 ms unchanged — route consistent, **but all > the client's 3 s abort → RR-L1** |
| Slow UPDATE (1.6 s trigger) | 503 in 1,503 ms (statement_timeout), unchanged |
| Lock 1.2 s + 0.7 s trigger (sum > 1.8 s budget) | 503 in 1,504 ms (one statement: statement_timeout), unchanged |
| Backend terminated while waiting on the lock / during the UPDATE | transaction rejects, nothing committed — **but the process dies → RR-M1** |
| F2: can it loop? | No: `refresh()` never calls `markOffline()` or itself; one session call per failed unlock (each failed unlock already counted by the 20/min account limit). A failed refresh leaves `source: cache` (Unlock disabled) until the hub reopens. |
| F2: refresh while a purchase is in flight | No clobber: there is no optimistic state (U5), only one purchase can be `sending`, and `accept()` bumps `seq` so a refresh that started earlier and returns later is dropped. Only RR-L1's stale-read-after-abort remains. |
| F9: one bad client vs four friends on one Wi-Fi | Possible by design: 60 calls/min per IP now include bad bodies, so a looping client can 429 the others' unlocks (text "rate limited", play unaffected) for ≤ 1 min. Brief 15 asks for the limit before any work; accepted, no finding. |
| F9: log flood | Bounded: ≤ 1 line per IP (/64 for IPv6) per reason per minute (`unlock_rate_limited`, `unlock_refused` × 2) + 1 per account; `X-Real-IP` is overwritten by Caddy from `Cf-Connecting-Ip` (no spoofed-key growth). |
| F10: an old 7.1-only tab vs a 7.3 server | Still loses its ticket: 7.1's own schema is `.strict()` at the top (checked on origin/story-7-1), so `progress` makes it reject → unsaved play until reload. F10 only helps 7.3+ clients; the protection is the deploy-together rule (7.1 is not on master yet, so no such tab exists if followed). No finding. |

#### Mutations (each applied once, test run, reverted)

| Mutation | Test | Result |
| --- | --- | --- |
| F1: unlock back on `withDbTimeout` + plain transaction (no in-DB bounds) | realPostgres "review F1 (route level)…" | killed |
| F1: lock + statement timeout 9 s and budget 99 s | same | killed |
| F1: only `lock_timeout` 9 s | same | survived — expected (statement_timeout bounds the lock wait too; redundancy, not a gap) |
| F1: route turns a DB failure into a 200 | same | killed |
| F2: `refresh()` ignores the server after `markOffline` | progressStore.test.ts | killed (2) |
| F2/F7: drop `void progressStore.refresh()` | progressHubWiring.test.ts | killed |
| F3: memo key = `requestId` only | unlockRoute "review F3…" | killed |
| F4/F9: IP limit moved after the body parse | unlockRoute "review F4 + F9…" | killed |
| F4: rate-limit log not gated | same | killed |
| F9: refused calls not logged | unlockRoute "review F9…" | killed |
| F9: refused gate keyed per IP only (not per reason) | same | killed |
| F5: a failed answer stays in the memo | unlockRoute "review F5…" | killed |
| F6: tie broken by list order only | pool.test "review F6…" | killed |
| F6: in-category cheapest ignored | same | killed |
| F10: `saved:false` branch strict again | progressStore "review F10…" | killed |
| F10: `account` strict again | same | killed |
| F8: drop `overflow: hidden; text-overflow: ellipsis` | hubDomLayout (16) | **survived → RR-N1** |
| F8: drop `min-width: 0` | same | survived (the parent's `min-width: 0` + `max-width: 100%` suffice; harmless) |
| F11: gear rule targets nothing | hubDomLayout | killed (16) |

**Checks run:** `npm ci`; `npm run typecheck` green; touched tests (`progressStore`, `unlockRoute`, `pool`, `hubDomLayout`, `progressHubWiring`) 5 files / 62 tests green; `realPostgres.test.ts` on PostgreSQL 16: 17 / 17 green. No full gate (narrow re-review).

### Re-review 1 fixes (builder, 2026-11-25)

Typecheck + lint + touched tests (no full gate, as asked); tree = fed5cc51 + these fixes.

| ID | Fix | Test (file > name) | Mutation |
| --- | --- | --- | --- |
| RR-M1 | Not touched here: 7.1's `db/client.ts`, fixed by 7.1 before landing (main session) | — | — |
| RR-L1 | `unlockItem` gets its own client timeout `UNLOCK_TIMEOUT_MS` = 7 s (`net/unlockTiming.ts`; the session call keeps 3 s); after a failed unlock the hub refreshes only once 7 s have passed since the send (`refreshAfterFailureMs`), so it never reads the pre-commit row | `apps/client/src/net/progressStore.test.ts` > "UNLOCK_TIMEOUT_MS ≥ 7 s, the session stays 3 s", "a slow answer at 6.5 s is still taken (it would have been dropped at 3 s); the call gives up only at 7 s"; `apps/client/src/ui/hubModel.test.ts` > "never sooner than UNLOCK_TIMEOUT_MS after the send (1 ms sweep), at once after it"; `tools/checks/progressHubWiring.test.ts` (sentAt + delayed refresh) | timeout 3000 → 3 tests fail |
| RR-N1 | `hubDomLayout` measures the text (ink): an element whose `scrollWidth > clientWidth` must have `overflow: hidden` + `text-overflow: ellipsis`, else its ink right (left + scrollWidth) must stay inside the column | `tools/checks/hubDomLayout.test.ts` > "568×320, review F8: a 42-char name…" | dropping only `overflow`/`text-overflow` from `.ph-name__text` → fails |

## Change Log

- 2026-11-24: story file created (ready-for-dev).
- 2026-11-25: built (overnight, auto-accepted B1–B14); gate green on fcaad5a0; status review.
- 2026-11-25: Senior Developer Review (AI): changes requested (F1–F3 medium, F4–F10 low, F11–F12 nit).
- 2026-11-25: review fixes F1–F11 (F12 left for the designer); merged story-7-2 fac177da (boundedTx); gate green on fed5cc51.
- 2026-11-25: narrow re-review 1: F1–F11 hold; RR-M1 (7.1 db/client.ts, 7.1's to fix), RR-L1, RR-N1.
- 2026-11-25: batch landing came back with real conflicts against 7.9: merged master 1da29b92; one `progress` object (Supplies, unlocks, look) from one read (B17); lobby Progress button in 7.9's SC3 header (B18); 7.9's look tests updated to the merged reply; gate green on 38e7c834.
- 2026-11-25: re-review 1 fixes RR-L1 (unlock client timeout 7 s, delayed refresh) and RR-N1 (text-width check).
- 2026-11-25 (earlier): merged story-7-2's review fixes (8c702472); B15 real-browser hub layout test (tag wraps under long names), B16 purchase bounded like the bank (7.2 M1) + real-PostgreSQL unlock tests; re-gated.
