# Story 7.10: Survivor editor

Status: done

<!-- Story file 2026-11-25 from the real code on master 7385b47. Customization story 3 of 5 (7.8 done → 7.9 → 7.10 ∥ 7.11 → 7.12). Prototype: docs/ideas/customization/avatar-editor.html. Decisions to confirm: docs/epic-7-story-decisions-looks.md › 7.10. -->

## Story

As a player,
I want to make my survivor in under 30 seconds,
so that customizing is fun, not a chore.

> **Brief.** Epic 7 has no brief of its own yet. EPIC 6 BRIEF lines that apply (`docs/epic-6-brief.md`), reviewers check each: **1** (own cloud session, branch `story-7-10`, assigned ports, one full gate), **3/4** (rules below are tests; beat them), **9** (mutate each new test once), **10** (no per-frame allocation in the preview loop; look numbers from `cosmetics.json`, no inline colour literals), **13** (a look must never look like a gameplay signal: 7.8 checked the parts, this story adds no part), **17** (server: `this.net.guard` for a new room message, D3), **18** (say what was not verified: real phones, iOS colour picker), **19**, **20** (the editor's canvases are DOM canvases, not Phaser textures: they need no `addGeneratedTexture`, but they must redraw after a page `visibilitychange` because Android can empty them), **29**, **31** (the editor at 568 × 320, 640 × 360, 800 × 360 with insets 44/21), **32**. NETWORK PASS BRIEF **18** (the server checks every saved look: owned parts only).
>
> **Scope:** a Preact screen (the Survivor tab of 7.3's Progress hub, and from my own lobby card), its previews drawn from Story 7.8's part code, Random, Done → saved to `progress.look` through the account HTTP API and cached on the device. **No** new part, no shop view for items (they are never sold, D3), no milestone rules (7.11), no loot (7.12).

## Acceptance Criteria

1. **Entry points.** The Progress hub (Story 7.3) gets its **Survivor** tab here (7.3 builds the hub with Unlocks only; this story adds the tab, the same way 7.5 adds Training). In the lobby, tapping **my own** slot card (Story 7.9's card) opens the same editor; other players' cards do nothing (O4).
2. **Layout.** Tabs **Top / Head / Hair / Pack / Skin** (no Accent tab: the accent colour picker, labelled "Hat & bag colour", sits in the Head and Pack tabs, under the tiles), a grid of part tiles for the open tab, a **big preview** of my survivor turning slowly (D6; drag turns it), and a **game-size preview**: 35 CSS px per metre on wet asphalt, my slot ring, 3 walkers and 2 default teammates around, under the night colours. Arrangement per the designer's pick (see "Needs a look?"); every button ≥ 44 CSS px (`ui/sizes.ts` `MIN_BUTTON_CSS_PX`), text ≥ 14 px; fits 568 × 320 without scrolling the previews out of view.
3. **Instant previews.** Picking a part or a colour updates both previews in the same frame. Colours: a free picker per colour (D1: the phone's own picker plus 12 quick swatches); the **Top** tab shows the chosen top colour and its night-muted in-game swatch side by side (`nightMute` from `survivorLook.ts`); the big preview shows the in-game colours (D2).
4. **No colour warning.** Any colour is accepted with no warning, also one close to a slot ring colour or Runner red (O6). Test: the 4 slot colours and `#8b1a1a` save without a message.
5. **Locked parts.** A **milestone** part shows its tile with a lock and the line from `milestones.json` (`howTo`, e.g. "Extract from Downtown once"); a **loot** part shows only a dark silhouette of the part and "Found during waves"; neither shows a price or a buy button; tapping one shows its line and changes nothing. There is **no shop view** for items (D3). Tiles are drawn from Story 7.8's part functions, zoomed on the slot (one cached data URL per part and colour, the `weaponIconUrl` pattern).
6. **Owned = what the server says.** Owned parts come from my progress (starter parts, plus `cosmetics` once Story 7.11 adds it) via 7.9's `ownedParts()`; the client never unlocks anything itself.
7. **Random.** Random picks one **owned** part per slot (each owned part equally likely, "none" included where the slot has it) and three random colours (uniform RGB), and updates both previews. Test: 500 Randoms never pick a locked part.
8. **Done saves to the server.** Done sends the look code (7.9's `encodeLook`) to the account HTTP API (`PUT /api/progress/look`, `apps/server/src/app.ts` beside 7.1's routes; exact path follows 7.1's API at build time). The server decodes it with the account's owned set (7.9's `decodeLook`), stores the **canonical** code in `progress.look` (null when it equals the default look) and returns it; the client caches that code on the device (`localStorage`, try/catch, key `topdown.look`) and uses it from my next join (and, with D3, at once in the lobby). A save with unowned or unknown parts stores them as the default parts and returns the stored code (the editor shows what was stored).
9. **Save failure (D4).** If the server can't be reached or answers an error, the look is still cached on the device and used for my next join (the server checks it there, 7.9), the editor closes with "Saved on this phone. It will sync next time." and the client retries the save once when the game next starts (start screen) with a session; a stored server look newer than the device's (the device copy is older than the last server answer) wins.
10. **Back without Done** discards the changes (D7) with no question.
11. **Rate limit.** The look route accepts at most **10 saves per minute per account** (then `429`, client text "Too many saves, try again in a minute"); the body is ≤ 256 bytes (else `413`).
12. **30-second check.** The designer's playtest times a first-time player from opening the editor to Done (target **< 30 s**); the result goes in `docs/playtests/` (a line in the next playtest note, e.g. `docs/playtests/epic-7-customization.md`).
13. **Tests**, each mutated once: tab → tiles per slot; locked tile text per milestone / loot; Random never picks locked; save request body = encoded look; server route: canonical store, unowned → default, null for the default look, 401 without a session, 429 after 10, 413 on a big body; device cache try/catch (storage throws → still works); previews redraw on `visibilitychange`; layout test at 568 × 320 / 640 × 360 / 800 × 360.

## Fairness / player-visible rules (each is a test)

- **E1 "What you see is what your friends see."** The game-size preview draws with the same `resolveLook` + part functions + night colours as the game (Story 7.9), at stage 1. Test: preview pixels at 35 px/m = the 7.9 body bake for the same look at stage 1.
- **E2 "Locked means locked, and never for sale."** No locked part can be worn, saved or bought; no tile shows a price. Test: a crafted `PUT` with `head:riot` (not owned) stores `head:cap`; the editor DOM contains no price or Supplies text.
- **E3 "Random only gives you what you have."** (AC 7.)
- **E4 "Done means saved — or tells you it isn't."** The editor never says "Saved" unless the server stored it; on failure it says the look is on this phone only (AC 9). Test: fake API failure → the failure line, the cache has the look, a retry on next start.
- **E5 "Any colour."** (AC 4.)

## Tasks / Subtasks

- [x] **T0 Look pick** (AC 2, 5) — before T3: code-drawn layout proposals for the editor (2–3 arrangements at 568 × 320 and 800 × 360, built from the real part functions, the prototype `avatar-editor.html` as a start), the locked milestone tile and the loot silhouette tile; the designer picks; record in `docs/epic-7-decisions.md` › Survivor editor (7.10).
- [x] **T1 Milestone text data** (AC 5) — `packages/shared/src/config/milestones.json` + `milestones.ts` (zod, strict): `m1`–`m10`, each `{ id, howTo, rule: { kind, n? } }` with the table in Dev Notes. Story 7.11 reads `rule`; this story reads `howTo`. (If 7.11 starts first it creates this file with the same table; the second story only reads it.)
- [x] **T2 Server route** (AC 8, 11, E2)
  - [x] `apps/server/src/meta/look.ts`: `saveLook(accountId, body)` → decode with `ownedParts(progress.cosmetics?)`, canonical code, null for the default, via 7.1's progress repository (`apps/server/src/db`).
  - [x] Route in `apps/server/src/app.ts` on 7.1's session middleware; per-account limiter (10/min, the `roomCreateLimiter` pattern); body cap 256 B.
  - [x] Tests (7.1's route-test pattern): canonical store, unowned → default, default → null, 401, 429, 413.
- [x] **T3 Editor screen** (AC 1–7, 10, E1, E3, E5)
  - [x] `apps/client/src/ui/SurvivorEditor.tsx` (+ `survivorEditorStore.ts`, pure state: open tab, draft look, owned set, `random(rng)`, `pick(slot, id)`, `setColour(k, hex)`) and CSS in `overlay.css`.
  - [x] Previews: `apps/client/src/render/editorPreview.ts` draws on DOM canvases with 7.8's `drawSurvivor` (no gun art: the plain gun bar) / 7.9's `drawSurvivorBody`; the big preview turns with one `requestAnimationFrame` loop only while the editor is open (no allocation per frame: reuse the resolved look until the draft changes), drag to turn; the game-size preview is drawn once per change (asphalt colour, ring in `SLOT_COLOR_CSS[mySlot]`, 3 walkers with `drawZombie`, 2 default survivors). Redraw both on `visibilitychange` → visible.
  - [x] Tiles: `partTileUrl(slot, id, colours, state)` (owned / milestone-locked / loot-silhouette), cached by key, drawn with the part function zoomed on the slot (7.8's round-2/3 64 px tile framing).
  - [x] Colour picker (D1): `<input type="color">` + 12 swatches (`cosmetics.json › look.swatches`, new optional key, not gameplay); "Hat & bag colour" in Head and Pack.
  - [x] Entry: the hub's Survivor tab (7.3's hub component — check its file name at build time) and the lobby's own card (`LobbyScreen.tsx`, 7.9's card).
- [x] **T4 Save, cache, sync** (AC 8, 9, E4)
  - [x] `apps/client/src/net/progressApi.ts` (7.1's client API module, check name at build time): `saveLook(code)`; device cache `topdown.look` with `{ code, savedAt, server: boolean }` (try/catch); on start, a cached `server: false` look is sent once.
  - [x] Join uses the cached/server look (7.9's `options()` source order: server copy, then cache).
- [x] **T5 Lobby live update (D3)** — if D3 is accepted
  - [x] `C2S.LOBBY_SET_LOOK` (`lobby.set_look`, `{ look: string ≤ 96 }`), `RunRoom` handler under `this.net.guard`: lobby phase only, decode with the member's owned set, set `PlayerState.look`; at most 2 per second per client (it shares the ~10/s non-input bucket). Mid-run it is ignored (the look changes from the next run).
  - [x] Tests: lobby → state changes; build/wave → ignored; unowned → default.
- [x] **T6 Gate**: tests, layout test, browser check at 568 × 320 / 800 × 360 (headless Chromium, dpr 2), full gate on the branch merged with master, "Notes for the merge", "Not verified".

## Dev Notes

### What exists today (read before changing)

- **Part code (7.8):** `apps/client/src/render/city/survivorParts.ts` part functions (`drawArms`, `drawTop`, `drawPack`, `drawSkin`, `drawHair`, `drawHead`, `partColour`, `PART_COLOURS`); `spriteArt.ts:216` `drawSurvivor(c, r, heldGun?, back?, look, layers)`; `survivorLook.ts` `resolveLook(look, stage)`, `nightMute(hex)`, `stageDim`; `survivorLayers.ts` `drawLayerStill` (the propeller at a fixed angle for still pictures — use it in tiles and the game-size preview if not animating; the big preview may spin it with `layerSpinAngle`).
- **Catalogue (7.8):** `packages/shared/src/config/cosmetics.ts` `COSMETICS.parts` (51), `cosmeticPart`, `STARTER_PARTS`, `DEFAULT_LOOK`; each part's `colour` input (`none | top | hair | accent`) tells the editor which picker affects it (show "Hat & bag colour" only matters for `accent` parts; show it anyway in Head/Pack, D1).
- **Look code (7.9):** `encodeLook`, `decodeLook(code, owned)`, `ownedParts(cosmetics?)`, `survivorPortraitUrl(code)`, `drawSurvivorBody`.
- **DOM pictures:** `weaponArt.ts:2073` `weaponIconUrl` (DOM canvas → cached data URL; `typeof document` guard).
- **Screens:** `apps/client/src/ui/uiState.ts` `UiScreen` (start, lobby, playing, results; 7.3 adds the Progress hub); `App.tsx` mounts screens; `StartScreen.tsx` (name, Create, Join, Practice solo — 7.3 adds "Progress", 7.6 adds "Save my progress" / "Log in"); `LobbyScreen.tsx:64` slot cards (7.9 adds the survivor drawing); `ui/sizes.ts` minimums; `overlay.css`.
- **Prototype:** `docs/ideas/customization/avatar-editor.html` (close-up card with Random, tabs, a game-size street with slot dots). It still has the old 6-slot / 55-part lists; the real catalogue is `cosmetics.json`.
- **Server:** `apps/server/src/app.ts` holds the HTTP app (7.1 adds the account HTTP API and its session middleware there); rate limiter pattern `roomCreateLimiter` (`apps/server/src/net/rateLimit.ts`, used at `RunRoom.ts:259`).

### Milestone texts (`milestones.json`, shared with 7.11)

| id | howTo (editor line) | rule (7.11) | item |
| --- | --- | --- | --- |
| m1 | Survive wave 5 | `wave_cleared`, n 5 | Firefighter helmet |
| m2 | Extract from Downtown once | `extracted`, district downtown | Riot helmet |
| m3 | Kill the Behemoth | `boss_killed` | Gas mask |
| m4 | Reach endless wave 15 | `wave_cleared`, n 15 (7.11 D2) | Hockey mask |
| m5 | Revive 25 teammates | `lifetime_revives`, n 25 | Headband |
| m6 | Kill 1,000 zombies | `lifetime_kills`, n 1000 | Camo coat |
| m7 | Build 100 barricades | `lifetime_barricades`, n 100 | Plank bundle |
| m8 | Extract with all 4 players standing | `extracted_all_four` | Laurel wreath |
| m9 | Play 20 runs | `lifetime_runs`, n 20 | Welding mask |
| m10 | Reach wave 10 without going down | `wave10_never_downed` | Golf bag |

Items come from `cosmetics.json` (`unlock: milestone:mN`); the table's item column is for reading only.

### Saving rules

- The server stores what it decoded, never the raw body (7.9 L2). `null` = default (so 7.6's merge can tell "never customised": the account's look is kept unless it is the default).
- Two devices: last Done wins (each save replaces the column). A phone with an older cached look than the server's uses the server's at the next start (7.1's session response carries it).
- No look history, no undo beyond Back (D7).

### Check at build time

- Story 7.3's Progress hub (component name, tab API) and 7.1's API module / session middleware / route naming: follow them; the paths in this file are placeholders for those names.
- Story 7.6 (login, merge): the merge's look rule ("the account's look kept unless it is the default") is 7.6's code; if 7.6 is already on master, check it treats `null` as default.
- Story 7.9's lobby card layout (the designer's pick): the editor opens from it.
- `RunRoom.ts` (D3 handler): 8.1's join takeover and 7.1's account on the member.

### Architecture compliance

- Menus are Preact overlays (architecture › UI); game-size preview is a DOM canvas, not a Phaser scene (no second Phaser game).
- Database only through `apps/server/src/db` repositories; account HTTP API in `app.ts` (architecture › Accounts: "look" is one of its calls).
- No gameplay numbers; `look.swatches` is a look value in `cosmetics.json` (not in `Balance`).

### Files

- New: `apps/client/src/ui/SurvivorEditor.tsx`, `apps/client/src/ui/survivorEditorStore.ts` (+ test), `apps/client/src/render/editorPreview.ts` (+ test), `apps/client/src/render/city/partTiles.ts` (+ test), `packages/shared/src/config/milestones.json` + `milestones.ts` (+ test, unless 7.11 made them), `apps/server/src/meta/look.ts` (+ test), `docs/art/7-10/` (T0 proposals).
- Changed: `apps/server/src/app.ts` (route), 7.1's progress repository (write `look`), 7.3's Progress hub (tab), `apps/client/src/ui/LobbyScreen.tsx` (own card opens the editor), `apps/client/src/ui/uiState.ts` (editor screen / overlay state), `apps/client/src/ui/App.tsx`, `overlay.css`, `packages/shared/src/config/cosmetics.json` + `cosmetics.ts` (`look.swatches`), `packages/shared/src/index.ts`; with D3: `packages/shared/src/net/messages.ts` (`C2S.LOBBY_SET_LOOK`), `apps/server/src/rooms/RunRoom.ts`, `apps/client/src/net/lobbyStore.ts`.

## Test plan

| Area | Test | Mutation that must fail it |
| --- | --- | --- |
| Store | tab → owned/locked tiles per slot; pick updates the draft | show milestone parts as owned → locked-tile test fails |
| Random | 500 Randoms: only owned parts, colours valid | draw from all parts → test fails |
| Tiles | milestone tile text = `howTo`; loot tile has no part colours (silhouette) and "Found during waves"; no price text anywhere | draw loot tiles in colour → silhouette test fails |
| Previews | game-size preview = 7.9 bake (E1); redraw on `visibilitychange`; no allocation per animation frame (spy) | allocate the resolved look per frame → spy fails |
| Route | canonical store; unowned → default; default → null; 401 / 429 / 413 | store the raw body → canonical test fails |
| Cache | storage throws → editor still saves; failure → "Saved on this phone…" + retry at start | say "Saved" on failure → E4 test fails |
| Lobby (D3) | lobby set_look updates state; ignored in build/wave | allow in wave → test fails |
| Layout | 568 × 320, 640 × 360, 800 × 360, insets 44/21: no overlaps, buttons ≥ 44 px | — |

## Beat the rule (reviewers: start here, then go further)

1. **Cheating:** `PUT` a look with milestone / loot parts, a 10 kB body, `v1|` junk, another account's id in the body (the route takes the account only from the session) → stored canonical, owned parts only, or refused (413 / 401).
2. **Farming:** none to farm (looks are free); hammer Done 100 times → 429 after 10 per minute, no database write storm.
3. **Losing progress:** Done while offline → the look survives a reload (cache) and syncs at the next start; Back after changes → the old look stays (no silent save); a save that fails then succeeds later never overwrites a newer server look from another phone (timestamp rule, AC 9).
4. **Two devices:** edit on phone A, Done; open on phone B with an old cache → B shows A's look after its session loads; edit both offline, then sync → last successful Done wins, and nothing is half-saved.
5. **Offline / no account yet:** a brand-new guest before 7.1's session answered → the editor still opens with starter parts and the default look; Done caches and syncs later.
6. **In the lobby (D3):** spam `lobby.set_look` → limited, never refused into a kick; change the look the instant the host taps Start → the run uses the look in state at the start tick (one of the two, never a mix).
7. **Readability:** make a survivor that matches the wet asphalt and a zombie's clothes → allowed (O6); the ring still finds you in the game-size preview at 568 × 320.

## Notes for the merge

- `app.ts`: one route next to 7.1's account routes; uses 7.1's session middleware.
- 7.3's Progress hub: one new tab entry ("Survivor").
- `LobbyScreen.tsx`: my own card becomes a button (7.9's card markup); Story 7.7's district picker is on the same screen.
- `milestones.json`: shared with 7.11 (same table in both story files); whichever lands second only reads it.
- With D3: `messages.ts` one C2S kind, `RunRoom.ts` one guarded handler (8.1 and 7.9 are the neighbours).

## Decisions to confirm

Already decided (not asked again): any colour, no warning (O6); entry from the start screen's Survivor (the hub tab) and my own lobby card (O4); no price, never sold (D3); locked milestone shows how to get it, loot only a silhouette (epics AC); tabs Top / Head / Hair / Pack / Skin (7.8 picks).

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.10 D1 | The colour picker | **The phone's own colour picker plus a row of 12 quick colours** (the phone's picker only) |
| 7.10 D2 | Colours on the big preview | **Night colours (what your friends will see), with the chosen colour as a small swatch next to it** (daylight colours big; night only in the small game-size preview) |
| 7.10 D3 | Changing your look while waiting in the lobby | **Your card and survivor change for everyone at once (before Start); never during a run** (only from your next join, as the epic's text says) |
| 7.10 D4 | Done when the server can't be reached | **Kept on this phone, used at once, synced automatically next time; the editor says so** (stay in the editor until the save works) |
| 7.10 D5 | What Random changes | **Everything, skin tone included** (keep my skin tone) |
| 7.10 D6 | The big preview | **Turns slowly by itself (one turn every 6 s), drag to turn it yourself** (still; drag only) |
| 7.10 D7 | Back without Done | **Throws the changes away, no question** (asks "Keep changes?") |

## Needs a look?

**Yes:** the **editor screen layout** (where tabs, tiles, the big preview, the game-size preview, the colour pickers, Random and Done sit, at 568 × 320 and 800 × 360), the **locked milestone tile** (lock + "how to get it" line) and the **loot silhouette tile**. 2–3 code-drawn layouts from the real part functions (T0), designer picks before T3. The parts themselves are already picked (7.8).

## Dependencies

- **Needs on master:** Story **7.9** (look code, `look` column, `drawSurvivorBody`, the lobby card); Story **7.1** (account HTTP API, session); Story **7.3** (Progress hub to add the tab to — if 7.3 is late, the editor can open from a temporary start-screen "Survivor" button and move into the hub when 7.3 lands).
- **Parallel with 7.11** (file overlap: only `milestones.json`, created by whichever starts first).
- **Other writer's stories:** 7.3 (hub), 7.6 (merge keeps the account's look unless default — `null` means default here), 7.1 (session, the guest-token identity flag: a copied token can also change the look — cosmetic, accept).

## References

- `_bmad-output/planning-artifacts/epics.md` › Story 7.10, FR89; `sprint-change-proposal-2026-11-24-survivor-parts.md` (tabs, no shop view); `sprint-change-proposal-2026-11-24-epic-7-readiness.md` (Q7 tabs added by their stories, Q10 the 30 s check)
- `docs/ideas/customization/proposal.md` § 2 (D3, D6), § 4, § 10 (O4, O6); `docs/ideas/customization/avatar-editor.html`; `docs/epic-7-decisions.md` › Survivor parts (7.8)
- `_bmad-output/implementation-artifacts/7-8-survivor-parts-in-game-code.md`, `7-9-my-look-in-the-game.md`
- `_bmad-output/planning-artifacts/game-architecture.md` › Accounts (account HTTP API: look), UI

## Dev Agent Record

### Agent Model Used

Claude (builder child session of the overnight orchestrator), skill `gds-dev-story`.

### Debug Log References

- Gate: see "Gate" below (filled after the master merge).

### Gate

Gate (2026-11-25): branch story-7-10 at merge commit b79f6083 (origin/master db0beb7f merged in, no conflicts): typecheck ✓, lint ✓, test ✓ (479 files passed / 3 skipped; 4355 tests passed / 23 skipped), build ✓; load average during the test run ≈ 2.8–3.0 (1-min 2.97 at the end, 0.20 before).

- Gate after the review fixes (2026-11-25): story-7-10 at f3e3bb45 (fix round, on the landing merge b2ff3330 with origin/master 7fdf9b86): typecheck ✓, lint ✓, test ✓ (490 files passed / 3 skipped; 4450 tests passed / 23 skipped), build ✓; load ≈ 2.9–3.6 during the tests.

- Gate after landing merge 2 (2026-11-25): story-7-10 at 59befe1e (origin/master c00713d3 merged, 7.6 accounts): typecheck ✓, lint ✓, test ✓ (497 files passed / 4 skipped; 4561 tests passed / 31 skipped), build ✓; load ≈ 2.3–3.2.

### Task → test (R1: "file > test name")

- **T0** — no test (a look pick): the designer's ED1 + LK2 + LS1 (7-UI-5) is the layout; recorded in `docs/epic-7-decisions.md` › Survivor editor (7.10). Built screens: `docs/art/epic-7/built/7-10-head-tab.png`, `7-10-locked-milestone.png`, `7-10-loot-silhouette.png`, `7-10-random-done.png` (568 × 320, dpr 2).
- **T1** — `packages/shared/src/config/milestones.json` + `milestones.ts` + `milestones.test.ts` **copied exactly from `origin/story-7-12` (commit 84829540 / 97e016a0, the merged 7.7+7.11+7.12 builder)**, not a second copy; the index export line is the same line as 7.12's. Tests: `packages/shared/src/config/milestones.test.ts > ten milestones m1…m10, each unlocking exactly one catalogue part`; the editor reads `howTo`: `apps/client/src/ui/survivorEditorStore.test.ts > milestone tile line = milestones.json howTo for each of m1–m10; loot line = 'Found during waves'; never a price`.
- **T2** `meta/look.ts` — `apps/server/src/meta/look.test.ts > an owned look is stored as its canonical code and answered; one look_saved log line; the next session carries it`; `> saveLook (unit) > the owned set comes from the row (7.11's cosmetics), never from the request`; `> a failing repository → 503 save_unavailable`.
- **T2** route (limits, body cap) — `apps/server/src/meta/look.test.ts > 429 after 10 saves a minute per account (another account is not affected); no database write past the limit`; `> 413 on a body over 256 bytes (a 10 kB look, a padded body), checked before the account is looked up; nothing stored`; `> 401 without a session (no cookie, a bad cookie, an unknown token); an account id in the body is refused (400), never used`; `> 403 for a foreign Origin when origins are set (CSRF)`; wiring `tools/checks/survivorEditorWiring.test.ts > server: the look route is on the router and the lobby message under net.guard`.
- **T2** tests (canonical, unowned → default, default → null) — `apps/server/src/meta/look.test.ts > E2: a crafted save with head:riot (milestone) and head:prop / pack:golf (loot, milestone) stores the default parts and answers what was stored`; `> the default look (or junk that decodes to it) is stored as null`; `> AC 4: the four slot colours and Runner red save unchanged`.
- **T3** store — `apps/client/src/ui/survivorEditorStore.test.ts > each tab lists its catalogue parts: starter parts owned, milestone parts locked with their howTo, loot parts as silhouettes`; `> an owned part is worn at once; a locked one shows its line and changes nothing`; `> AC 4, E5: any colour is accepted with no warning`; `> D7: Back = the opened look is kept`; `> 500 Randoms never pick a locked part; every owned part (skin and 'none' included) comes up; colours are valid #rrggbb`; `> AC 6: owned = starter parts + the server's cosmetics (7.11)`.
- **T3** previews — `apps/client/src/render/editorPreview.raster.test.ts > the game-size preview draws me exactly as the game's body bake (gun frame + drawSurvivorBody, stage 1) at 35 px/m × dpr` (E1); `> my slot ring is drawn around me in my slot colour`; `> setLook resolves the look once; 120 frames resolve nothing more and turn one full turn in 6 s` (no per-frame allocation, D2 night colours, D6); `> redraws when the page becomes visible again, not when it hides; unsubscribes` (brief 20); wiring `tools/checks/survivorEditorWiring.test.ts > previews: one rAF loop while open, the game-size picture per change, redraw on visibilitychange`.
- **T3** tiles — `apps/client/src/render/editorPreview.raster.test.ts > LS1: a loot tile is a flat silhouette — every drawn pixel is the one silhouette colour, no part colour survives`; `> LK2: a milestone tile is the item darkened`; `> one cached picture per part, look and state; a loot tile ignores my colours`.
- **T3** colour picker (D1) — `apps/client/src/ui/survivorEditorStore.test.ts > five tabs Top / Head / Hair / Pack / Skin; Hat & bag colour in Head and Pack only; Top shows the top picker` (12 swatches); layout `tools/checks/editorDomLayout.test.ts > 568×320, head tab (laurel tapped): …buttons ≥ 44 px…` (picker and swatches ≥ 44 px).
- **T3** entry points (AC 1, O4) — `tools/checks/survivorEditorWiring.test.ts > App renders the editor; the hub's Survivor tab and MY lobby card open it (AC 1, O4)`; `apps/client/src/ui/hubModel.test.ts > U1: the header line; one tab (Unlocks) in a bar built for three` (now Unlocks + Survivor).
- **T3** layout (R9) — `tools/checks/editorDomLayout.test.ts > {568×320, 640×360, 800×360, 844×390} × {top, head, hair, pack, skin} tab: inside the safe area, no overlaps, previews on screen, buttons ≥ 44 px, text ≥ 14 px, no prices` (20 cases, insets 44/21).
- **T4** save + cache — `apps/client/src/net/lookSave.test.ts > AC 13: the save request body is the encoded look, POSTed to /api/account/look with the cookie`; `> stored → the server's canonical code becomes this phone's copy and the hub's progress`; `> E4: the server can't be reached → never 'saved': kept on this phone as pending, used for the next join`; `> AC 11: 429 → 'too many saves' and nothing kept`; `> storage throws (private mode) → Done still saves …; nothing throws`; `tools/checks/editorDomLayout.test.ts > E4 / AC 9: Done with the server unreachable → 'Saved on this phone…', the look kept as pending; then the editor closes by itself`.
- **T4** retry at start + newer server look wins — `apps/client/src/net/lookSave.test.ts > a pending look is sent once when the server still has its base; then it is synced`; `> another phone saved since (server look ≠ base) → the server's newer look wins, nothing is sent`; `> a session answer while pending: kept if the server still has the base, replaced if it moved`; `> no session / a failed progress read / a failed send → stays pending for the next start`; `> the start screen retries once per page load`.
- **T4** join uses the look — `apps/client/src/net/lookSave.test.ts > E4: …used for the next join` (joinAccount carries the pending look); 7.9's `apps/client/src/net/deviceLook.test.ts > joinAccount: the look a join carries` still green; wiring `tools/checks/survivorEditorWiring.test.ts > the start screen retries a pending look once (AC 9); the device copy follows server answers; joins use it`.
- **T5** — `apps/server/src/rooms/RunRoom.look.test.ts > Story 7.10 D3 > in the lobby: the new look is canonical on the room state, the member and the other player's copy`; `> unowned parts become the default parts (the same rule as the join)`; `> build or wave: ignored (the run keeps the look it started with)`; `> spam: 20 looks at once → at most 2 per second applied, no kick, the client stays joined`.
- **T6** — the Gate line above; browser check at 568 × 320 / 640 × 360 / 800 × 360 / 844 × 390 by `tools/checks/editorDomLayout.test.ts` (headless Chromium) + the four dpr-2 screenshots.

Mutations (brief 9, each new test mutated once; each FAILED its test): Random from all parts; milestone parts shown owned; a locked tap wears the part; loot tile drawn in colour; resolve per frame; preview "me" drawn in another colour (E1); preview at 40 px/m; redraw when hidden; route stores the raw body; route owns riot/golf/camo; no per-account limit; no 413 check; default stored as the code (not null); "saved" on a failed save; sync ignores the base; a session answer clobbers a pending look; `lobby.set_look` allowed in a wave; no 2/s limit; unowned part kept in the lobby; editor line "Saved" on offline (DOM E4); 32 px swatches (DOM layout).

Bandwidth (brief 8): `lobby.set_look` is lobby-only, ≤ 2/s, ≤ ~110 B; 0 B/s during a run. Perf: the editor's rAF loop runs only while the editor is open (no game running); per frame it draws one survivor from a look resolved once per change.

### Completion Notes List

- Story context created 2026-11-25 from master 7385b47: comprehensive developer guide, status ready-for-dev.
- Built 2026-11-25 on `story-7-10` (from master 99ac898f). Every story decision D1–D7 and build choice B1–B14 is recorded in `docs/epic-7-story-decisions-looks.md` › 7.10 build-time choices, all **auto-accepted (designer: follow the GDS recommendation)**.
- No migration: `progress.look` (7.9's 0002) is the column written.
- The look is validated on the server against the owned set read from the LOCKED progress row inside the save transaction (`db/boundedTx.ts` `boundedTransaction`, `progressRepo.saveLook`); the raw body never reaches the database. `ownedFor(row)` already reads 7.11's `cosmetics` field when the row carries it.
- AC 12 (the designer's 30-second playtest): not run; a pending line is in `docs/playtests/epic-7-customization.md`.

### Notes for the merge

- `packages/shared/src/config/milestones.{json,ts,test.ts}`: byte-identical copies of `origin/story-7-12`'s files; the `index.ts` export is the same line as 7.12's (appended at the end of the file here, mid-file there): keep ONE line when 7.12 lands.
- `apps/server/src/app.ts`: `accountLook` added to `createRouter` and `look: { progress, ipLimiter, accountLimiter }` to `createAccountRoutes` (next to 7.3's `unlock`). `tools/checks/progressHubWiring.test.ts` accepts the extra route.
- `apps/server/src/auth/accountRoutes.ts`: one new endpoint after 7.3's unlock route.
- `apps/server/src/db/progressRepo.ts`: `saveLook` added to the interface and the repo (a `boundedTransaction`). **7.11:** when `cosmetics` joins `progressColumns`/`Progress`, `meta/look.ts › ownedFor` uses it with no change; also feed the account's cosmetics into the room's join decode AND `RunRoom.onSetLook` (both use `ownedParts()` = starter only today).
- `apps/server/src/run/lobby.ts`: `Member.look` is no longer `readonly` (D3 replaces it in the lobby).
- `apps/server/src/rooms/RunRoom.ts`: one guarded handler `onSetLook` next to `onSetReady`, one `onMessage` line. 7.7's `lobby.district` (on story-7-12) is a neighbour: keep both.
- `packages/shared/src/net/messages.ts`: `C2S.LOBBY_SET_LOOK` + `lobbySetLookSchema` (and `index.ts` export next to `lobbySetReadySchema`; 7.7 adds `lobbyDistrictSchema` there too).
- `packages/shared/src/net/account.ts`: `ACCOUNT_LOOK_PATH`, `LOOK_SAVE_MAX_BODY_BYTES`, `lookSaveRequestSchema`, `lookSaveResponseSchema` appended (7.12's branch REMOVES 7.3's unlock exports from `index.ts` in its diff — that is 7.12's stale base, not a conflict with this story: keep master's exports plus these).
- `packages/shared/src/config/cosmetics.{json,ts}`: optional `look.swatches` (12 colours); looks only, no balance version bump.
- `apps/client/src/net/deviceLook.ts`: a synced copy is still the plain code (7.9's format); a pending Done is a small JSON object under the same key. `set()` keeps a pending copy while the server still has its base.
- `apps/client/src/net/account.ts › joinAccount`: the join now carries `looks.get()` after the server copy is applied (a pending Done wins).
- `apps/client/src/net/progressStore.ts`: `accept()` also updates the device look copy when the answer carries `look`.
- `apps/client/src/ui/hubModel.ts`: `HUB_TABS` = Unlocks, Survivor (7.5 inserts Training between them: "Unlocks · Training · Survivor"); the Survivor tab opens the editor (`SURVIVOR_TAB_ID`).
- `apps/client/src/ui/LobbyScreen.tsx`: my own card gets `role="button"` + click/Enter → editor (7.7's district picker is on the same screen, untouched).
- `apps/client/src/render/PlayerView.ts`: the ring constants moved to `render/playerRing.ts` (same values).
- `apps/client/src/ui/overlay.css`: `.se-*` block + `.lobby-card--edit` appended at the end.

### Not verified

- Real phones (Android Chrome, iOS Safari): the native `<input type="color">` picker (iOS shows its own sheet), touch drag on the big preview, the canvas redraw after a real Android background/foreground, the 30-second check (AC 12).
- The look route behind Caddy/Cloudflare on the VPS (only the local server and PGlite here); PostgreSQL 18 runs of `saveLook` (`realPostgres.test.ts` is skipped without a database).
- Two real phones on one account (beat the rule 4) — covered by unit tests of the base rule only.
- The hub's Survivor tab next to 7.5's Training tab (7.5 not on master).

### File List

- New: `apps/server/src/meta/look.ts`, `apps/server/src/meta/look.test.ts`, `apps/client/src/ui/SurvivorEditor.tsx`, `apps/client/src/ui/survivorEditorStore.ts`, `apps/client/src/ui/survivorEditorStore.test.ts`, `apps/client/src/render/editorPreview.ts`, `apps/client/src/render/editorPreview.raster.test.ts`, `apps/client/src/render/city/partTiles.ts`, `apps/client/src/render/playerRing.ts`, `apps/client/src/net/lookSave.ts`, `apps/client/src/net/lookSave.test.ts`, `packages/shared/src/config/milestones.json`, `packages/shared/src/config/milestones.ts`, `packages/shared/src/config/milestones.test.ts` (copied from story-7-12), `tools/checks/editorDomLayout.test.ts`, `tools/checks/survivorEditorWiring.test.ts`, `docs/playtests/epic-7-customization.md`, `docs/art/epic-7/built/7-10-head-tab.png`, `7-10-locked-milestone.png`, `7-10-loot-silhouette.png`, `7-10-random-done.png`.
- Changed: `apps/server/src/app.ts`, `apps/server/src/auth/accountRoutes.ts`, `apps/server/src/db/progressRepo.ts`, `apps/server/src/net/limits.ts`, `apps/server/src/net/rateLimit.ts`, `apps/server/src/test/bootTestServer.ts`, `apps/server/src/rooms/RunRoom.ts`, `apps/server/src/rooms/RunRoom.look.test.ts`, `apps/server/src/run/lobby.ts`, `apps/client/src/net/account.ts`, `apps/client/src/net/deviceLook.ts`, `apps/client/src/net/lobbyStore.ts`, `apps/client/src/net/progressStore.ts`, `apps/client/src/render/PlayerView.ts`, `apps/client/src/render/city/palette.ts`, `apps/client/src/ui/App.tsx`, `apps/client/src/ui/LobbyScreen.tsx`, `apps/client/src/ui/ProgressScreen.tsx`, `apps/client/src/ui/StartScreen.tsx`, `apps/client/src/ui/hubModel.ts`, `apps/client/src/ui/hubModel.test.ts`, `apps/client/src/ui/uiState.ts`, `apps/client/src/ui/overlay.css`, `packages/shared/src/config/cosmetics.json`, `packages/shared/src/config/cosmetics.ts`, `packages/shared/src/index.ts`, `packages/shared/src/net/account.ts`, `packages/shared/src/net/messages.ts`, `tools/checks/progressHubWiring.test.ts`, `docs/epic-7-decisions.md`, `docs/epic-7-story-decisions-looks.md`, `_bmad-output/implementation-artifacts/sprint-status.yaml`, this story file.

## Senior Developer Review (AI)

Reviewer: fresh reviewer session, 2026-11-25. Type: LIGHT review (one checker) of the editor + full beat-the-rule on the look-save path (`meta/look.ts`, `auth/accountRoutes.ts › accountLook`, `progressRepo.saveLook`, `RunRoom.onSetLook`). Tree: `story-7-10` @ 233f099c.

**Merge with current master (7fdf9b8) — CONFLICTS, not resolved here:** `git merge origin/master` conflicts in 11 files against Story 7.4+7.5 (Training route): `apps/server/src/app.ts` (5 hunks), `apps/server/src/auth/accountRoutes.ts` (5), `apps/server/src/db/progressRepo.ts`, `apps/server/src/net/rateLimit.ts`, `packages/shared/src/net/account.ts`, `apps/client/src/net/account.ts` (2), `apps/client/src/ui/{LobbyScreen.tsx, ProgressScreen.tsx, hubModel.ts, hubModel.test.ts, overlay.css}` (+ `tools/checks/progressHubWiring.test.ts`, regex). All look keep-both (accountLook beside accountTraining; hub tabs "Unlocks · Training · Survivor"), but they are interleaved code, so per HANDOFF §3 they go back to the builder: merge master, re-gate. The review below is of the pushed branch (on master db0beb7f).

**Verdict: APPROVED (no high, no medium)** — land after the builder's master merge + gate.

### Findings

| # | Sev | Where | Scenario | Minimal fix |
| --- | --- | --- | --- | --- |
| L1 | low | `apps/server/src/rooms/RunRoom.ts:798` | `run.start` creates the controller but `state.phase` stays `"lobby"` until the first tick's `syncState`; a `lobby.set_look` arriving in that ≤ 50 ms window is applied (probe: set_look sent AFTER Start → the run started with it). The look is whole and canonical and lands in the same patch as phase "build", so "one of the two, never a mix" holds — but the rule "lobby phase only" is really "until the first tick". | Also return when `this.controller !== null`. |
| L2 | low | `apps/client/src/net/lookSave.ts:61` | B3's "newer server look wins" is compared on the client, non-atomically: (a) ABA — phone B pending with base X; phone A saves Y then X again → B's pending overwrites A's latest Done; (b) another phone saving between B's session read and B's POST is overwritten. Cosmetic only; accepted by "last Done wins", but AC 9's promise is not strict. | Send `base` in the POST and compare it inside `saveLook`'s locked transaction (mismatch → answer the server look, client marks synced). |
| L3 | low (visual) | `apps/client/src/ui/overlay.css:2350` (`.se-sw__chip`) | Chosen / In game chips on Head/Pack (default accent `#1f2326`) and any dark colour are invisible on the dark header (screens `7-10-head-tab.png`, `7-10-loot-silhouette.png` look like empty boxes; the LF5 sheet shows filled chips). | A 1–2 px light border (or the sheet's inset frame) on the chip. |
| L4 | nit | `apps/client/src/net/lookSave.ts:47` | Any non-429 failure becomes a pending look retried at every start, also a deterministic 400/413 (unreachable with the editor's own encoder). | Keep pending only for status 0 / 401 / 5xx. |
| L5 | nit | `apps/server/src/rooms/RunRoom.look.test.ts:259` | Test title says "20 looks at once", the test sends 8. | Rename or send 20. |
| I1 | info | `progressRepo.ts progressColumns`, `RunRoom.onSetLook`/`onAuth` | Owned set = starter only until 7.11 adds `cosmetics` to `progressColumns` AND feeds the account's items into the room's join + `onSetLook` decode; otherwise earned items are stripped in the lobby. Already in "Notes for the merge"; 7.11's reviewer should check it. | — |

### Beat the rule (run on a local server, port 2771, PGlite; curl + a probe room test, deleted after)

| Attack | Result |
| --- | --- |
| POST /account/look without cookie | 401 `no_account` ✓ |
| Milestone + loot parts (`top:camo head:riot pack:golf`, `head:prop`) | 200, stored canonical with default parts (all-default → `null`) ✓ |
| `accountId` in body / extra keys / `__proto__` key / string body | 400 `invalid_body` (strict schema) ✓ |
| Junk `v1|||__proto__:x|constructor:y|c:zz`, unicode/emoji/full-width | 200, stored default (`null`); never the raw text ✓ |
| Body 259–261 B, `é`×125 (250 B / 125 chars), whitespace-padded JSON | 413 `too_large` (byte count, not char count) ✓ |
| 3 kB / 10 kB body; chunked without length | 413 / 411 from the HTTP guard before the route ✓ |
| `é`-escaped body (≤ 256 B on the wire) | 200 default ✓ |
| 12 saves in a minute | 10 × 200 then 429 (400s don't count) ✓ |
| DB slow/down on Done → pending → retry | server re-decodes against the locked row at every send, so a retry can never store an unowned part; a timed-out-but-committed save is reconciled (server look ≠ base → synced to it) ✓; newer server look wins except ABA/window (L2) |
| Two phones at once | each save is one row-locked replace; last Done wins, nothing half-saved ✓ |
| `lobby.set_look` unowned (camo/prop/golf) | default parts on state ✓ |
| `lobby.set_look` oversize (500 chars), object, extra key | dropped by `net.guard`, no kick ✓ |
| `lobby.set_look` in build/wave, in results | ignored ✓; applied again after lobby return ✓ |
| `lobby.set_look` right after Start | applied before the first tick (L1), whole look ✓ |
| Spam 3/s for 3 s | 6/9 applied (2 per rolling second), no kick ✓ |
| Identity: a look in a slot ring colour | allowed (O6); ring stays slot colour in previews and game (ring drawn from slot, not look) ✓ |
| Texture cost per remote `set_look` | one 256 px portrait + `toDataURL` per new code, ≤ 2/s per player; portrait cache capped at 16, tile cache capped (LRU) ✓ |
| Offline Done | pending on the phone, used at the next join, one retry per page load (tests) ✓ |

### Visual (light)

Screens at 568 × 320 dpr 2 match ED1 (preview column left with Chosen / In game, big turning preview, game-size preview with 3 walkers + 2 teammates; tabs; tiles; colour row; Random + Done bottom-right), LK2 (darkened item + lock, "Gas mask: Kill the Behemoth" = milestones.json m3 `howTo`), LS1 (flat silhouette with "?", "Found during waves"); Random result shows owned parts only; ring = slot colour (blue, B8). `editorDomLayout.test.ts` (20 sizes × tabs) green. Only L3 differs from the sheet.

### Checks run

- `npm ci`; `npm run typecheck` ✓.
- Touched tests: `meta/look.test.ts`, `RunRoom.look.test.ts`, `survivorEditorStore.test.ts`, `lookSave.test.ts`, `editorPreview.raster.test.ts`, `milestones.test.ts`, `survivorEditorWiring.test.ts`, `editorDomLayout.test.ts`, `hubModel.test.ts`, `progressHubWiring.test.ts`: 10 files, 103 tests ✓.
- Mutations (each reverted): `ownedFor` adds `head:riot` → 2 look tests fail ✓; `onSetLook` without the phase check → "build or wave: ignored" fails ✓; `syncPendingLook` ignores the base → "server's newer look wins" fails ✓; no 413 body check → the 413 test fails ✓.
- Not verified: real phones; PostgreSQL 18 (PGlite only); the merged tree with master 7fdf9b8 (conflicts).

### Review fix round (builder, 2026-11-25; checked by the main session under the re-review cap)

| # | Fix | Test (file > test name) |
| --- | --- | --- |
| L1 | `RunRoom.onSetLook` also returns while `this.starting` (7.4/7.5's async progress read after `run.start`) or once `this.controller` exists (before the first tick flips the phase). | `apps/server/src/rooms/RunRoom.look.test.ts > review L1: a look sent right after Start (same tick, before the phase changes) is ignored` (mutation: drop the guard → fails) |
| L2 | `POST /account/look` takes an optional `base` (≤ 96, nullable); the start-up retry sends the base it was edited from and `meta/look.ts` compares it with the LOCKED row inside `progressRepo.saveLook` (`KEEP_LOOK` → nothing written, answer `{ ok, look: <stored>, stale: true }`); the client then takes the server's look. An editor Done sends no base (last Done wins). Closes the "another phone saved between the session read and the send" window; the pure ABA case (X → Y → X on another phone) still lets the pending X-based look through, since the content is back at its base — accepted (cosmetic; a version column would need a migration). | `apps/server/src/meta/look.test.ts > review L2 (two phones): a save with a base is stored only while the account still has that base…`; `apps/client/src/net/lookSave.test.ts > review L2: the server answers stale … → its look wins`; `> a pending look is sent once when the server still has its base` (base travels) (mutations: server ignores base / client drops base → fail) |
| L3 | `.se-sw__chip`: 2 px light frame + dark keyline, so a dark colour (the default hat & bag) shows. | visual: `docs/art/epic-7/built/7-10-*.png` regenerated |
| L4 | Only retryable failures (0, 401, 408, 5xx) are kept as pending; a deterministic refusal (400, 403, 413) → "Couldn't save this look", nothing kept; a pending look the server refuses for good is dropped at the start retry. | `apps/client/src/net/lookSave.test.ts > review L4: a deterministic refusal (400, 403, 413) is never kept for a retry…`; `> review L4: a pending look the server refuses for good (400) is dropped` (mutation: everything retryable → fails) |
| L5 | Test title "8 looks at once". | — |

Landing merge: origin/master 7fdf9b86 (7.4 + 7.5 Training) merged at b2ff3330, 12 conflicted files all keep-both: `app.ts` / `accountRoutes.ts` (accountLook beside accountTraining, routes `health, accountSession, accountUnlock, accountTraining, accountLook`), `progressRepo.ts` (saveLook + train), `rateLimit.ts`, shared + client `net/account.ts`, `LobbyScreen.tsx` (startButton import + openSurvivor), `ProgressScreen.tsx` (the tab click: Survivor opens the editor, others `setTab`), `hubModel.ts` (`HUB_TABS` = Unlocks · Training · Survivor) + `hubModel.test.ts` + `unlocksTraining.test.ts` (first two tabs), `overlay.css` (both blocks; the shared closing brace restored), `progressHubWiring.test.ts` regex. L1 had to cover 7.5's new async start (`starting`).

Landing merge 2 (origin/master c00713d+, Story 7.6 accounts): 9 conflicted files, all keep-both — account routes `health, accountSession, accountUnlock, accountTraining, accountUpgrade, accountLogin, accountRecover, accountLogout, accountLook`; `limits.ts` / `bootTestServer.ts` (7.6's `resetAccountLimiters()` + the look limiters); `RunRoom.ts` (7.6's async onJoin + `TICKET_ROW_CHECK_MS` beside `MAX_LOBBY_LOOKS_PER_S` / `onSetLook`); `App.tsx` (AccountScreen + SurvivorEditor); `uiState.ts` (account + survivor screens); client `net/account.ts` (7.6's actions + `saveLookCall`). Also: 7.6's `adopt()` (login / reset / logout) now calls `deviceLook.markSynced(progress.look)` so a look pending for the OLD account never carries over to the new one (`accountUpgradeWiring` regex accepts it); `accountModel.inRoom` handles the `survivor` screen (in a room when opened from the lobby); master's `overlay.css` had an unclosed `.ac-note--warn {` (from the 7.4 / 7.6 landing) that swallowed every later rule — closed here (the editor DOM test caught it).
