# Story 7.10: Survivor editor

Status: ready-for-dev

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

- [ ] **T0 Look pick** (AC 2, 5) — before T3: code-drawn layout proposals for the editor (2–3 arrangements at 568 × 320 and 800 × 360, built from the real part functions, the prototype `avatar-editor.html` as a start), the locked milestone tile and the loot silhouette tile; the designer picks; record in `docs/epic-7-decisions.md` › Survivor editor (7.10).
- [ ] **T1 Milestone text data** (AC 5) — `packages/shared/src/config/milestones.json` + `milestones.ts` (zod, strict): `m1`–`m10`, each `{ id, howTo, rule: { kind, n? } }` with the table in Dev Notes. Story 7.11 reads `rule`; this story reads `howTo`. (If 7.11 starts first it creates this file with the same table; the second story only reads it.)
- [ ] **T2 Server route** (AC 8, 11, E2)
  - [ ] `apps/server/src/meta/look.ts`: `saveLook(accountId, body)` → decode with `ownedParts(progress.cosmetics?)`, canonical code, null for the default, via 7.1's progress repository (`apps/server/src/db`).
  - [ ] Route in `apps/server/src/app.ts` on 7.1's session middleware; per-account limiter (10/min, the `roomCreateLimiter` pattern); body cap 256 B.
  - [ ] Tests (7.1's route-test pattern): canonical store, unowned → default, default → null, 401, 429, 413.
- [ ] **T3 Editor screen** (AC 1–7, 10, E1, E3, E5)
  - [ ] `apps/client/src/ui/SurvivorEditor.tsx` (+ `survivorEditorStore.ts`, pure state: open tab, draft look, owned set, `random(rng)`, `pick(slot, id)`, `setColour(k, hex)`) and CSS in `overlay.css`.
  - [ ] Previews: `apps/client/src/render/editorPreview.ts` draws on DOM canvases with 7.8's `drawSurvivor` (no gun art: the plain gun bar) / 7.9's `drawSurvivorBody`; the big preview turns with one `requestAnimationFrame` loop only while the editor is open (no allocation per frame: reuse the resolved look until the draft changes), drag to turn; the game-size preview is drawn once per change (asphalt colour, ring in `SLOT_COLOR_CSS[mySlot]`, 3 walkers with `drawZombie`, 2 default survivors). Redraw both on `visibilitychange` → visible.
  - [ ] Tiles: `partTileUrl(slot, id, colours, state)` (owned / milestone-locked / loot-silhouette), cached by key, drawn with the part function zoomed on the slot (7.8's round-2/3 64 px tile framing).
  - [ ] Colour picker (D1): `<input type="color">` + 12 swatches (`cosmetics.json › look.swatches`, new optional key, not gameplay); "Hat & bag colour" in Head and Pack.
  - [ ] Controller (Story 12.2, FR96): focus moves over the 12 swatches (the native `<input type="color">` stays touch-only); the tabs and part tiles join the focus order; the preview's auto-turn covers drag-to-turn.
  - [ ] Entry: the hub's Survivor tab (7.3's hub component — check its file name at build time) and the lobby's own card (`LobbyScreen.tsx`, 7.9's card).
- [ ] **T4 Save, cache, sync** (AC 8, 9, E4)
  - [ ] `apps/client/src/net/progressApi.ts` (7.1's client API module, check name at build time): `saveLook(code)`; device cache `topdown.look` with `{ code, savedAt, server: boolean }` (try/catch); on start, a cached `server: false` look is sent once.
  - [ ] Join uses the cached/server look (7.9's `options()` source order: server copy, then cache).
- [ ] **T5 Lobby live update (D3)** — if D3 is accepted
  - [ ] `C2S.LOBBY_SET_LOOK` (`lobby.set_look`, `{ look: string ≤ 96 }`), `RunRoom` handler under `this.net.guard`: lobby phase only, decode with the member's owned set, set `PlayerState.look`; at most 2 per second per client (it shares the ~10/s non-input bucket). Mid-run it is ignored (the look changes from the next run).
  - [ ] Tests: lobby → state changes; build/wave → ignored; unowned → default.
- [ ] **T6 Gate**: tests, layout test, browser check at 568 × 320 / 800 × 360 (headless Chromium, dpr 2), full gate on the branch merged with master, "Notes for the merge", "Not verified".

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

### Debug Log References

### Completion Notes List

- Story context created 2026-11-25 from master 7385b47: comprehensive developer guide, status ready-for-dev.

### File List
