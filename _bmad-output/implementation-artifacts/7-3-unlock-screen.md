# Story 7.3: Unlock screen

Status: review

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

**Gate:** commit `b9511c0b` on `story-7-3` = story-7-1 `e1f97a39` (with 8.1) + story-7-2 `9b9cb3ef` (review fixes) + master `8248be06` merged; `npm run typecheck && npm run lint && npm test && npm run build` green — **457 test files passed (2 skipped: realPostgres without TEST_DATABASE_URL, noCheatsInRelease before dist), 4,125 tests passed (13 skipped)**, build OK; 7 min 47 s; load 0.8 at start, 4.7 at the end (4 cores). Includes the real-browser hub test (12 cases) and 7.2's.

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

## Change Log

- 2026-11-24: story file created (ready-for-dev).
- 2026-11-25: built (overnight, auto-accepted B1–B14); gate green on fcaad5a0; status review.
- 2026-11-25: merged story-7-2's review fixes (8c702472); B15 real-browser hub layout test (tag wraps under long names), B16 purchase bounded like the bank (7.2 M1) + real-PostgreSQL unlock tests; re-gated.
