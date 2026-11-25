---
baseline_commit: 1fade84
---

# Story 7.9: My look in the game

Status: review

<!-- Story file 2026-11-25 from the real code on master 7385b47 (Epic 6 rounds 1–2 merged, 6.8–6.12 and the Network pass still to land). Customization story 2 of 5 (7.8 done → 7.9 → 7.10 ∥ 7.11 → 7.12). Decisions to confirm: docs/epic-7-story-decisions-looks.md › 7.9. -->

## Story

As a player,
I want my friends to see the survivor I made,
so that I can find myself and they can recognise me.

> **Brief.** Epic 7 has no brief of its own yet. These lines of the EPIC 6 BRIEF (`docs/epic-6-brief.md`) apply as written; reviewers check each one: **1** (own cloud session, branch `story-7-9`, assigned ports, one full gate at the end), **2** (every copy of the new state field: RunState → stateView key lists → fakeRoom → devThrottle StateCopy → mirror/NetSimHost → bots), **3/4** (fairness rules below are tests; reviewers beat them), **9** (every new test mutated once), **10** (no per-frame allocation; textures baked at join / at a build start, never per frame), **11** (bandwidth: report the added bytes), **12** (phone FPS, `?stress=150` before/after), **14** (lag, hidden tab, late Game scene start, reconnect), **17** (Colyseus: no zod in `onMessage`; join refusals `ServerError(526)` only), **18** (say what was not verified), **19** ("Notes for the merge"), **20** (every texture through `addGeneratedTexture`, repaint after a lost context), **29** (hand-back), **31** (lobby card at 568 × 320 / 640 × 360), **32** (read decision lines newer than this file). From the NETWORK PASS BRIEF (`docs/network-pass-brief.md`): **18** (the server stays the truth: a modified client can only spoil its own look, never another player's run) and **21** (a drop is not a leave: the held seat keeps its look).
>
> **Scope:** the look code (shared), the `look` column (server, 7.1's database), the join option and its server check, one string on the room state, per-player survivor textures in the game, the survivor drawing on the lobby card, the propeller (and any later animated layer) from each player's look. **No** editor (7.10), no owned items (7.11), no loot (7.12). Until 7.10 ships, every player has the default look unless a dev switch sets one.

## Acceptance Criteria

1. **Migration.** This story's Drizzle migration adds `progress.look` (text, nullable; null = the default look) and nothing else. Story 7.1's repositories in `apps/server/src/db` read it with the progress row; 7.1's session response (the account HTTP API, `apps/server/src/app.ts`) returns it to the client as part of progress. Story 7.10 writes it.
2. **Look code.** `packages/shared/src/cosmetics/lookCode.ts` turns a `SurvivorLook` (7.8, `cosmetics.ts`) into a code and back: `v1|top:<id>|head:<id>|hair:<id>|pack:<id>|skin:<id>|c:<top>,<hair>,<accent>` (colours `rrggbb`, lowercase, no `#`). Five slots, **no `acc`** (7.8: the accent slot was dropped; the third colour is the colour of hats and bags). Every code it writes is ≤ **96** characters (`LOOK_CODE_MAX` in `cosmetics.ts`), and the longest legal look (every slot's longest id) is tested against it.
3. **Decoding never fails.** `decodeLook(code, owned)` returns a full `SurvivorLook` for **any** input (undefined, a number, 10 kB of junk, `v2|…`, missing fields, unknown ids, `#`-colours, uppercase): each slot and each colour is read on its own; a missing, unknown or not-owned part becomes that slot's default part (`DEFAULT_LOOK`), a bad colour becomes that colour's default; the rest of the look is kept. It also returns how many fields it replaced (for one log line, AC 5).
4. **Owned = starter, until 7.11.** `owned` is a set of `slot:id` keys (ids are unique per slot only: `head:none` and `pack:none` both exist). This story builds it from `STARTER_PARTS` (`cosmetics.ts`); Story 7.11 adds the account's `cosmetics` to the same set. One function, `ownedParts(cosmetics?: readonly string[])`, so 7.11 changes only its input.
5. **The join carries the look; a look never stops a join.** The client sends `look` in its join options (`apps/client/src/net/connection.ts` `options()`), taken from the progress the client got from 7.1's session (server copy first, then the device cache, then nothing). `joinOptionsSchema` (`packages/shared/src/net/messages.ts:148`, `.strict()`) accepts `look` as **`z.unknown().optional()`** so no look value can fail the schema; `RunRoom.checkAuth` decodes it with the account's `owned` set and puts the canonical code on `RunAuth`. A join with a missing, junk or unowned look joins with the default parts in the bad slots; it is never refused for its look (test: 12 bad looks, 12 joins accepted). The options size cap (`MAX_CLIENT_MESSAGE_BYTES`) still applies to the whole options object as today. One `look_replaced { fields }` info line when any field was replaced (no look text in logs).
6. **One string on the room state, set once.** `PlayerState` (`apps/server/src/rooms/schema/RunState.ts:19`) gets `look: t.string()` (the canonical code), set in `RunRoom.join` with `name`; nothing writes it per tick (`syncState` does not touch it), `resetRunFields` keeps it (like `name`) when the room goes back to the lobby, and a held seat (Story 8.1) keeps it. Every copy is listed and updated: `PlayerStateView` + `PLAYER_STATE_FIELDS` (`packages/shared/src/net/stateView.ts:9`, `:189`), `fakeRoom`, devThrottle `StateCopy`, bots (`tools/bots/botClient.ts` sends no look → default). Measured cost: ≤ 100 B per player once at join, **0 B/s** per tick (bandwidth test).
7. **Per-player survivor texture.** The Game scene draws each player's body **once** into a per-player canvas texture through `addGeneratedTexture` (key `survivorlook_<playerId>`, ≤ 4 per run, frames `pack` and `nopack`), from `resolveLook(decodeLook(state.look), stage)` and Story 7.8's part functions with `layers = false`. The held gun is **its own image under the body**, from new gun-only atlas frames (decision 7.9 D2; see Dev Notes › Gun under the body); a weapon with a back piece (the flamethrower's tanks, Story 5.4) shows the `nopack` body. The downed and slowed tints, the blackout depth (6.3 `setAboveDark`) and visibility apply to body and gun together; the downed view uses the same body.
8. **Same picture for the default look.** With the default look, a survivor on screen is the same picture as today's atlas frame for every weapon (raster test in Node: gun frame then body frame composed = 7.8's `drawSurvivor` frame, ≤ 2 per channel per pixel for alpha-blended edges; frame size and anchor unchanged).
9. **Cost.** Baking all 4 bodies (2 frames each) takes ≤ ~2 ms total on the Xiaomi Mi 11i, the low-end floor (measured headless with a 4× CPU throttle as the stand-in and listed under "Not verified" for the real phone). No texture is created, removed or repainted per frame; a repaint happens only when a player's look or the decay stage changes (D1), never during a wave.
10. **Animated layers from the look.** A part with an animated layer (7.8 rule; the propeller cap first) is baked without the layer, and `PlayerView.setAnimatedLayer(pool, layer)` (`apps/client/src/render/PlayerView.ts:89`) shows its pooled sprite on top, chosen from the player's look (`cosmeticPart("head", id).animated`), so a later animated part needs no new code path. `?devlayer=propeller` (dev builds) still forces it on everyone.
11. **Slot colour stays the team signal.** The slot ring, the name, the edge arrows and the revive ring keep the slot colour (Story 2.9); nothing in the look changes them (test: a look whose colours equal each slot colour leaves the ring colour unchanged).
12. **Lobby card.** In the lobby (`apps/client/src/ui/LobbyScreen.tsx:64`) each filled slot shows that player's survivor as a close-up drawing (a cached data-URL `<img>`, `survivorPortraitUrl(code)` in the `weaponIconUrl` pattern, `weaponArt.ts:2073`), next to the slot dot and name; identical looks are allowed with no warning (O3). The card's layout is the designer's pick (see "Needs a look?"). It passes the HUD layout test at 568 × 320 and 640 × 360 (brief 31).
13. **Practice solo.** The offline practice run (`LocalSimHost`) draws my own look from the device's progress cache (decision 7.9 D4); nothing is sent anywhere.
14. **FPS.** With `?stress=150&devlooks=4` (new dev switch: 3 extra standing survivors with random starter looks next to mine, views only, dev builds), headless FPS stays within **2 FPS** of the latest recorded `?stress=150` baseline in `docs/perf/` (today `docs/perf/epic-6-blackout.md:21`, 12.4 FPS headless; re-measure the "before" on the master you branched from, same load) and meets NFR1. Results go to `docs/perf/epic-7-looks.md`.
15. **Tests**, each mutated once (brief 9): look code round trip for every catalogue part and random colours; the 96-character bound; decode of junk / old / unowned / mixed codes; `ownedParts` keys; join never refused for a look (server room test with `bootTestServer()`); look survives a lobby return and a held seat; 0 B/s per tick; per-player texture baked once, repainted on a stage change (D1) and after a simulated context loss; default-look raster identity (AC 8); the animated layer comes from the look; ring colour unchanged by any look.

## Fairness / player-visible rules (each is a test)

- **L1 "A look can't break the game."** Any look code from any client joins, with default parts where it is bad (AC 3, 5). Test: fuzz 1,000 random strings (incl. 10 kB, unicode, `v1|` prefixes) through `checkAuth`: every one accepted, every result re-encodes to ≤ 96 characters.
- **L2 "You can only wear what you own."** A part the account doesn't own (milestone or loot before 7.11; anything not in `owned` after it) is shown as the default part to everyone, the wearer included (the client draws `state.look`, never its own cached code, for its own survivor online). Test: join with `head:riot` → `state.look` has `head:cap`; the wearer's own view uses `state.look`.
- **L3 "Your ring is your colour, your clothes are yours."** No look changes the slot ring, name, edge arrows or revive ring colour (AC 11). Test as in AC 11.
- **L4 "Looks cost nothing in the fight."** The look is sent once; nothing about it is sent per tick, and nothing is drawn per frame except the existing sprites (AC 6, 9). Test: bandwidth test over 200 ticks shows the same bytes per tick with 4 custom looks as with 4 default looks; a frame-loop spy shows no texture call per frame.
- **L5 "Cosmetic only."** A look changes nothing in the simulation: same seed + input log → same `snapshotWorld` digest with any looks (the World never sees the look). Test: one replay with 4 different looks = the golden digest.
- **L6 "Everyone sees the same survivor."** Two clients in one room draw the same resolved colours for each player (resolve runs on `state.look` and the room's decay stage only). Test: two `NetSimHost`s on one fake room → equal resolved looks per player.

## Tasks / Subtasks

- [x] **T1 Look code (shared)** (AC 2–4, L1)
  - [x] `packages/shared/src/cosmetics/lookCode.ts`: `encodeLook(look)`, `decodeLook(input, owned) → { look, replaced }`, `ownedParts(cosmetics?)`, `LOOK_CODE_MAX = 96` (in `config/cosmetics.ts`), `partKey(slot, id)`. Pure, no allocation concerns (runs at join / bake only). Export from `packages/shared/src/index.ts` next to the 7.8 cosmetics block.
  - [x] `lookCode.test.ts`: round trip for all 51 parts, random colours, longest-id bound, junk fuzz, unowned replaced, per-slot fallback, `head:none` vs `pack:none`.
- [x] **T2 Database and session** (AC 1) — waits for Story 7.1 on master
  - [x] Drizzle schema: `look` text nullable on `progress`; `npm run db:migrate` migration file; the 7.1 progress repository returns it; the 7.1 session/progress response includes `look` (null → the client uses `DEFAULT_LOOK`).
  - [x] Repository test (7.1's DB test pattern): null by default, a stored code reads back unchanged.
- [x] **T3 Join and room state** (AC 5, 6, L1, L2)
  - [x] `messages.ts`: `look: z.unknown().optional()` in `joinOptionsSchema` (comment: "never refuses a join: decoded in checkAuth").
  - [x] `RunRoom.checkAuth` (`RunRoom.ts:240`): decode with the account's `owned` (7.1 puts the account on `RunAuth`; until 7.11 `ownedParts()`), add `look` (canonical code) to `RunAuth`; `RunRoom.join` (`:327`) sets `PlayerState.look` with `name` (`:344`).
  - [x] Schema field + every copy (brief 2): `RunState.ts`, `stateView.ts` (`PlayerStateView.look`, `PLAYER_STATE_FIELDS.look`), `fakeRoom.ts`, `devThrottle.ts` StateCopy, `resetRunFields` keeps it (`syncState.ts:217`), the 8.1 held seat / remembered seat keep it (check at build time).
  - [x] Room tests: a bad look joins; an unowned part is replaced; look survives `lobby.return`; bandwidth per tick unchanged.
- [x] **T4 Gun under the body** (AC 7, 8) — decision 7.9 D2
  - [x] `spriteAtlas.ts`: gun-only frames `survivorgun_<weapon>_a` for each `WEAPON_ART` weapon (with `WEAPON_BACK_ART` drawn first for the flamethrower), `survivorgun_plain_a` (today's `CHAR.gun` bar) and `survivorgun_chainsaw_b` (running chain); `survivorGunFrameFor(weapon, running)` beside `survivorFrameFor` (`:53`). Same frame size as `survivor_body_a` and same centre, so gun and body line up with one position and rotation. Keep the existing `survivor_*` frames (7.8's digest pin); note them as unused in the game for a later cleanup.
  - [x] `spriteArt.ts`: a `drawSurvivorBody(c, r, look, withPack)` that draws what `drawSurvivor` draws after the gun (arms → pack → top → skin → hair → headgear, `layers = false`), with the same line-state sequence.
  - [x] Raster test (`@napi-rs/canvas`, 7.8 pattern): for every survivor frame, gun frame + body frame composed ≈ the 7.8 frame (AC 8).
- [x] **T5 Per-player textures and PlayerView** (AC 7, 9–11, L3, L4)
  - [x] `apps/client/src/render/SurvivorLookTextures.ts`: one canvas per player id (2 frames side by side), registered once through `addGeneratedTexture` with a paint callback that reads the player's current resolved look (so a lost context repaints the current look); `setLook(playerId, code, stage)` repaints only when the code or stage changed (`tex.refresh()`); on scene `create` remove leftover `survivorlook_*` textures and unregister them (the `DarknessView.ts:136` / `:209` pattern: Phaser keeps textures across a scene restart); `dispose` on scene shutdown.
  - [x] `PlayerView.ts`: a second image for the gun (depth just under the body), both turned and placed together, both tinted (downed / slowed / `BODY_TINT`), both moved by `setAboveDark`; `setBody(textureKey, withPack)` switches the body frame only when the weapon's back piece changes (a swap or a buy), never per frame. The ring keeps `SLOT_COLORS` (AC 11).
  - [x] `GameScene.ts` `syncPlayerView` (`:240`): on a new view, `setLook` from `host.playerInfo(id).look` and the animated layer from the look (AC 10); on `decay.stage_changed` (build start) repaint (D1). `PlayerInfo` gains `look` (`SimHost.ts:163`; `NetSimHost.playerInfo` `:343` reads `state.players.get(id).look`; `LocalSimHost.playerInfo` `:330` returns the device's look, AC 13).
  - [x] `?devlooks=N` in `apps/client/src/debug/urlOptions.ts` (dev builds; + test) for AC 14.
- [x] **T6 Lobby card** (AC 12) — after the designer's pick
  - [x] `survivorPortraitUrl(code)` (cached by code, `typeof document` guard) in `render/city/` next to the part code; `lobbyStore.ts:36` rows carry `look`; `LobbyScreen.tsx` shows the portrait per the picked layout; HUD/menu layout test at 568 × 320 and 640 × 360.
- [x] **T7 Perf and gate** (AC 9, 14)
  - [x] Bake timing (4 bodies) headless with and without a 4× CPU throttle; `?stress=150` before/after with `&devlooks=4`; load recorded; `docs/perf/epic-7-looks.md`.
  - [x] Full gate on the branch merged with current master; "Notes for the merge"; "Not verified".

## Dev Notes

### What exists today (read before changing)

- **Catalogue and look (7.8, done):** `packages/shared/src/config/cosmetics.ts` — `COSMETIC_SLOTS` (top, head, hair, pack, skin), `SurvivorLook` (one id per slot + `colours {top, hair, accent}` as `#rrggbb`), `DEFAULT_LOOK`, `STARTER_PARTS` (per slot, catalogue order), `cosmeticPart(slot, id)`, part ids `^[a-z0-9]{1,8}$`, skin ids `"1"`–`"8"`. 51 parts (`cosmetics.json`). Milestone/loot parts carry `unlock: "milestone:mN" | "loot"`.
- **Resolve (7.8):** `apps/client/src/render/city/survivorLook.ts` `resolveLook(look, stage)` — unknown ids fall back to default parts, picker colours equal to the default colour are not muted (so the default look stays the `CHAR` colours), others get `nightMute` then `stageDim` (stage 1 = identity). Called at bake time only.
- **Drawing (7.8):** `spriteArt.ts:216` `drawSurvivor(c, r, heldGun?, back?, look = DEFAULT_RESOLVED_LOOK, layers = true)`. Order: back piece → held gun (or the plain `CHAR.gun` bar) → arms → pack (skipped when `back`) → top → skin → hair (unless `hidesHair`) → headgear. Part functions in `survivorParts.ts` (`drawArms`, `drawTop`, `drawPack`, `drawSkin`, `drawHair`, `drawHead(…, withLayers)`, `partColour`).
- **Survivor frames today (one atlas for everyone):** `spriteAtlas.ts:32` `SURVIVOR_FRAME` (`survivor_body_a`), `:49` `SURVIVOR_WEAPON_FRAMES` (one `survivor_<weapon>_a` per `WEAPON_ART` weapon: shotgun, assault_rifle, fire_axe, chainsaw, grenade_launcher, flamethrower, gas_torch), `:51` `SURVIVOR_CHAINSAW_RUNNING`; `:53` `survivorFrameFor(weapon, running)`; frame side `ceil(2 × CHAR_EXTENT_R.survivor × CHAR_R_PX)` (`:167`, `CHAR_R_PX = 34`); drawn in `drawCharacterFrame` (`:224–231`). SMG, Hunting Rifle, Machete and Pistol have no held art: they use `survivor_body_a` with the plain gun bar.
- **PlayerView:** `apps/client/src/render/PlayerView.ts` — one body image from `ATLAS_CHARACTERS` (`:76`), frame switched only on a swap or buy (`:160–163`), tints `BODY_TINT` / `DOWNED_TINT` / `SLOWED_TINT` (`:171`), ring by `SLOT_COLORS[slot]` (`:134–137`), friendly-fire ring flash (`:141–148`), 6.3 `setAboveDark` (`:119`), 7.8 `setAnimatedLayer` (`:89`) with `SurvivorLayerPool` (`render/SurvivorLayerPool.ts`, 4 pooled sprites per layer).
- **GameScene:** `syncPlayerView` (`GameScene.ts:240`) makes a view per player, sets the slot from `host.playerInfo(id).slot`, and (7.8) the dev layer from `?devlayer`.
- **Join:** `RunRoom.onAuth` (`RunRoom.ts:229`) → `checkAuth` (`:240`: size check, `joinOptionsSchema.safeParse`, balance and map version, create rate limit) → `RunAuth { name, ip, guestTokenHash }` (`:262`); `join` (`:327`, lobby only, `already_joined` on a repeated guest token `:332` — **Story 8.1 changes this to a takeover**) creates `PlayerState({ slot, name, ready })` (`:344`). `joinOptionsSchema` is `.strict()` (`messages.ts:148–173`): a new key must be added there or every join fails as `invalid_options`.
- **Client join:** `connection.ts:39` `options(intent, name)` builds `{ intent, name, balanceVersion, mapVersion, guestToken }`. Story 7.1 adds its session ticket here; this story adds `look`.
- **Lobby UI:** `LobbyScreen.tsx:64–78` — per slot: dot, name, Host / You tags, Ready. Rows from `lobbyStore.ts:36` (`playerId, slot, name, ready`).
- **Textures:** `addGeneratedTexture(scene, key, canvas, paint, addFrames?)` (`render/city/canvasTexture.ts`) returns null when the key exists (so a restarted scene must clear its own leftovers first, as `DarknessView.ts:136` does); `textureRegistry.unregister(key)`. `tools/checks/noUnregisteredTextures.test.ts` fails on any other texture creation.
- **DOM pictures:** `weaponArt.ts:2073` `weaponIconUrl` draws into a DOM canvas once and caches a data URL (the pattern for the lobby portrait).

### Gun under the body (decision 7.9 D2)

The 7.8 frames bake the held gun into each survivor frame. Per-player looks would need every weapon pose per player (9 frames × 4 players = 36 bakes, est. 5–8 ms on the Mi 11i, over AC 9's budget). Recommended: split the picture into **a gun image (shared atlas, no look) under a per-player body image** (2 bakes per player: with and without the backpack; est. ~1–2 ms for 4). Arms are drawn over the gun today, so the split keeps the draw order exactly; only alpha-blended edges can differ by a rounding step (AC 8's tolerance). The alternative (D2 B) keeps the 7.8 frames' layout per player and costs the bake time above.

### Stage dim (decision 7.9 D1)

7.8 built `stageDim` (`cosmetics.json › look.stageDim = [1, 0.96, 0.92, 0.88, 0.84]`) and left "when to redraw" to this story (7.8 › Open questions 1). Recommended: repaint the 4 bodies when `decay.stage_changed` arrives (it fires at a build start, Story 4.5), so the survivors darken a little with the city; stage 1 is unchanged. Because the bodies are per-player now, the default look dims too (today's atlas survivor never dims). The gun image doesn't dim (as today). Alternative: no stage dim (pass stage 1 always).

### Look code details

- Encode in fixed slot order; decode tolerant (fields in any order, the first of a duplicate wins, unknown keys ignored). A non-string input, or a string longer than `LOOK_CODE_MAX × 4`, decodes straight to the default look (no regex on 10 kB of junk).
- Colours: `c:` has exactly three `[0-9a-f]{6}` values; each bad one → that colour's default (`DEFAULT_LOOK.colours`). Stored with `#` in `SurvivorLook` (7.8's schema), without it in the code.
- `owned`: `Set<string>` of `slot:id`. `ownedParts()` = every starter part; 7.11: `ownedParts(progress.cosmetics)` adds those keys. The default look's parts are always owned (7.8's cross check guarantees they are starters).
- Logging: never log the look text (it's player-chosen); log only `{ fields: replacedCount }`.

### What the server trusts

The server never trusts the look beyond "these parts exist and you own them": it re-encodes the decoded look, and `state.look` is that canonical code. Own survivor online is drawn from `state.look` too (L2), so a modified client that sends `head:riot` sees the cap like everyone else. Until Story 7.1 exists, there is no account: this story waits for 7.1 (T2, T3). If the builder starts T1/T4/T5 earlier, they need no database.

### Check at build time (Epic 6 rounds 2–3 and the Network pass land first)

- `RunRoom.join` / `onAuth`: Story 8.1 turns `already_joined` into a takeover and adds `heldPlayers`, `rememberedSeats`; Story 7.1 adds the account / session ticket to `RunAuth`. The look must ride with the seat in each of those paths (a takeover keeps the seat's look, the new connection's look is ignored mid-run).
- `RunState.ts`, `stateView.ts` key lists, `fakeRoom.ts`, `devThrottle.ts`: 6.8–6.12 (event records, `vote`, `ending`) and 8.1 (`heldUntilTick`, `frozen`) add fields; add `look` beside them.
- `PlayerView.ts`: Story 8.1 D3 (2 s blinking protection) may add alpha handling; the gun image must blink with the body.
- `GameScene.ts` `syncPlayerView`: 6.9 (survivor NPC), 6.11 (vote/dawn) may touch the player loop.
- `LobbyScreen.tsx`: Story 7.7 adds the host's district picker; 7.3/7.6 add Progress / login entry on the start screen (not the lobby).
- `docs/perf/`: use the newest `?stress=150` baseline on master at build time.

### Architecture compliance

- `packages/shared` stays engine-free (ADR-03): the look code is pure TypeScript; drawing stays in `apps/client/src/render/`.
- Database only through `apps/server/src/db` repositories (architecture › Persistence); the migration adds only `look` (architecture: "`look` from Story 7.9").
- `cosmetics.json` is not in `Balance` (7.8): a new part must not force "Please refresh"; the look code doesn't need a version bump when parts are added (unknown ids fall back).

### Files

- New: `packages/shared/src/cosmetics/lookCode.ts` (+ test), `apps/client/src/render/SurvivorLookTextures.ts` (+ test), `apps/client/src/render/city/survivorPortrait.ts` (+ test), the 7.9 migration under `apps/server/src/db/` (7.1's folder), `docs/perf/epic-7-looks.md`.
- New (R2): `apps/client/src/scenes/lookWiring.test.ts`
- Changed: `packages/shared/src/config/cosmetics.ts` (`LOOK_CODE_MAX`), `packages/shared/src/index.ts`, `packages/shared/src/net/messages.ts`, `packages/shared/src/net/stateView.ts`, `apps/server/src/rooms/RunRoom.ts`, `apps/server/src/rooms/schema/RunState.ts`, `apps/server/src/rooms/schema/syncState.ts` (`resetRunFields` comment/keep), 7.1's progress repository and session response, `apps/client/src/net/connection.ts`, `fakeRoom.ts`, `devThrottle.ts`, `lobbyStore.ts`, `apps/client/src/ui/LobbyScreen.tsx` (+ `overlay.css`), `apps/client/src/render/PlayerView.ts`, `apps/client/src/render/city/spriteAtlas.ts`, `apps/client/src/render/city/spriteArt.ts`, `apps/client/src/scenes/GameScene.ts`, `apps/client/src/sim/SimHost.ts`, `NetSimHost.ts`, `LocalSimHost.ts`, `apps/client/src/debug/urlOptions.ts`, `tools/bots/botClient.ts` (no look: fine, check it still joins).

## Test plan

| Area | Test | Mutation that must fail it |
| --- | --- | --- |
| Look code | round trip all 51 parts × random colours; ≤ 96 chars | drop the length cap in encode → long-id test fails |
| Decode | 1,000 junk strings → full looks; per-slot fallback; `head:none` vs `pack:none` | decode whole code to default on any bad field → per-slot test fails |
| Ownership | `head:riot` not owned → `head:cap` | skip the owned check → test fails |
| Join | 12 bad looks all join (`bootTestServer()`); `look_replaced` logged without the text | make `look` `z.string().max(96)` in the schema → 10 kB look refused, test fails |
| State | look kept on `lobby.return` and on a held seat; 0 B/s per tick with 4 looks | write `look` in `syncState` each tick → bandwidth test fails |
| Textures | baked once per player; repaint on stage change only; repaint after context loss | repaint every frame → frame-loop spy fails; forget the leftover cleanup → scene-restart test fails |
| Raster | gun + body ≈ 7.8 frame for every weapon (AC 8) | draw the pack under the gun → flamethrower frame fails |
| View | body and gun share tint, depth, visibility, rotation; ring colour unchanged by any look | tint body only → downed test fails |
| Layer | propeller cap in the look → layer sprite on; other headgear → off | ignore the look, only `?devlayer` → test fails |
| Replay | 4 looks → golden digest | — (liveness: assert 10 waves played) |
| Perf | `?stress=150&devlooks=4` FPS before/after, bake ms | — |

## Beat the rule (reviewers: start here, then go further)

1. **Cheating:** send a look with `head:riot` / `pack:golf` without owning them; send `head:RIOT`, `head:riot ` (space), `head:riot|head:cap`, a 95-char code with a 9-char id, `v1|…` with 40 fields, a JSON object instead of a string → all must join with only owned parts shown. Change your own client to draw your cached look: only your own screen changes (L2: does the real client draw `state.look` for itself?).
2. **Hiding:** pick colours equal to the night street (`#1a1c1f`) or a zombie's skin, or the Runner shirt red: allowed (O6); check the ring, name and arrows still make you findable at 568 × 320 in blackout (6.3).
3. **Crashing others:** a look that makes `resolveLook` throw or `drawSurvivorBody` loop (e.g. every slot unknown) → the room and every phone keep running.
4. **Farming / bandwidth:** rejoin 50 times in the lobby with different looks → the room's bytes stay bounded (one string per join), no texture leak on the clients (count `survivorlook_*` textures: ≤ 4).
5. **Losing progress:** a player with a stored look joins after a database hiccup (7.1's fallback) → default look, never a refused join; their stored look is not overwritten by the join (this story never writes `look`).
6. **Two devices:** the same account on two phones in one room (if 7.1/8.1 allow it) → each seat shows the look its own join sent; after 8.1's takeover the seat keeps its look.
7. **Offline:** practice solo with no network and no cache → default look, no error; with storage blocked (private mode) → default look.
8. **Lifecycle:** hidden tab across a build start where the stage changes → the woken tab repaints once (not 5 times); Android app switch (context loss) → bodies come back with the right looks, not the default.

## Notes for the merge

- `messages.ts` `joinOptionsSchema`: one optional key `look` (unknown). Story 7.1 adds its session ticket in the same object: keep both.
- `RunState.ts` / `stateView.ts` / `fakeRoom.ts` / `devThrottle.ts`: one `PlayerState.look` string next to `name`.
- `RunRoom.ts`: `checkAuth` decodes the look; `join` sets it. Story 8.1's takeover path and 7.1's account load are the neighbours.
- `PlayerView.ts`: gains a gun image and `setBody`; 7.8's `setAnimatedLayer` unchanged; the atlas body frame is no longer used by `PlayerView`.
- `spriteAtlas.ts`: new `survivorgun_*` frames (check `atlasLayout.test.ts` and the ≤ 2048² limit); the old `survivor_*` frames stay (7.8's digest pin).
- For **7.10**: `encodeLook`/`decodeLook`/`ownedParts`, `survivorPortraitUrl` and `drawSurvivorBody` are ready for the editor; the editor saves a canonical code.
- For **7.11**: pass the account's `cosmetics` to `ownedParts()` in `checkAuth`; nothing else here changes.
- For **7.12**: a found loot part is owned only from the next join (the look is checked at join).

## Decisions to confirm

Already decided (not asked again): identical looks allowed (O3); any colour, no warning (O6); a bad part becomes the default and a look never stops a join (epics AC); 5 slots, no accent (7.8 picks); the propeller spins as a pooled sprite (7.8).

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.9 D1 | Survivors darken a little as the city falls | **Yes: redrawn at each build start, from ×1 (evening) to ×0.84 lightness (collapse), the default look too** (no: survivors keep the same brightness all night, as today) |
| 7.9 D2 | How the gun is put on a custom survivor | **The gun is its own picture under the body (2 small pictures per player, ~1–2 ms at the start)**; looks the same (every weapon pose drawn per player: ~5–8 ms at the start of a run) |
| 7.9 D3 | The survivor on the lobby card | **A close-up drawing (about 3× game size) left of the name on each slot card** (a smaller head-and-shoulders drawing only) — exact layout picked from drawings |
| 7.9 D4 | My look in Practice solo | **My own look (from this phone's saved progress)** (the default survivor in practice) |

## Needs a look?

**Yes, one thing:** the **lobby slot card with the survivor drawing** (where the drawing sits, how big, with Host / You / Ready tags, at 568 × 320 and 800 × 360). Proposals drawn in code from the real part functions (2–3 layouts), designer picks before T6. The in-game survivors need no new look (the parts were picked in 7.8; D1 only darkens them slightly).

## Dependencies

- **Needs on master:** Story **7.1** (database, Drizzle migrations, account on `RunAuth`, session/progress response) — T2/T3; Story 7.8 (done). Network pass **8.1** (join takeover, held seats) should be on master first (its `RunRoom.join` rewrite).
- **Other writer's stories:** 7.1 storage/identity is what the look is saved with (7.1's open flag: with the guest token as identity, a copied token also carries the look — harmless, cosmetic); 7.6's merge keeps the account's look unless it is the default (7.10 writes that rule's look side).
- **Unblocks:** 7.10 (editor saves a code this story reads), 7.11 (extends `ownedParts`), 7.12 (loot parts become wearable at the next join).

## References

- `_bmad-output/planning-artifacts/epics.md` › Story 7.9, FR89; `sprint-change-proposal-2026-11-24-survivor-parts.md` (no `acc`, `STARTER_PARTS`, `setAnimatedLayer`); `sprint-change-proposal-2026-11-24-epic-7-readiness.md` (Q2: 7.9 owns the `look` column)
- `docs/ideas/customization/proposal.md` § 4 (readability), § 7 (how the look travels, how it is drawn); `docs/epic-7-decisions.md` › Survivor parts (7.8), The propeller spins
- `_bmad-output/implementation-artifacts/7-8-survivor-parts-in-game-code.md` (Notes for later stories, Open questions 1)
- `_bmad-output/planning-artifacts/game-architecture.md` › Accounts, PostgreSQL tables, Assets
- `docs/epic-6-brief.md`; `docs/network-pass-brief.md` lines 18, 21; `_bmad-output/implementation-artifacts/8-1-reconnect-within-2-minutes.md` (AC 6 takeover, held seats)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Implementation Plan / decisions made while building

- **Early start (brief line 29):** T1, T4, T5 built before 7.1 / 8.1 reach master; **T2 (database), T3 (join and room state) and T6 (lobby card, SC3 line-up cards + DP2) are held** until the main session says 7.1 and 8.1 are on master. Until T3, `NetSimHost.playerInfo(id).look` reads `state.players.get(id).look` through a cast and finds nothing ("" = the default look); `LocalSimHost` takes the device look as a constructor option (`look`), not wired to 7.1's progress cache yet (T3).
- **Repaint trigger (D1):** instead of listening for `decay.stage_changed`, `GameScene.syncLook` passes `world.decay.stage` to `SurvivorLookTextures.setLook` every frame; it is two compares when nothing changed and one repaint when the stage moved. Same result as the event (the stage only changes at a build start), but a tab that slept across several build starts repaints once (beat the rule 8), and a late Game scene start gets the right stage without a missed event.
- **"No look sent"** (`undefined`, `null`, `""`) decodes to the default look with `replaced: 0` (bots and old tabs: no `look_replaced` log noise); any other bad input counts its replaced fields (a non-string / over-long / other-version input = all 8).
- **Client decode uses every catalogue part** (`catalogueParts()`): the server already checked ownership; the client only falls back for ids its catalogue doesn't know. Practice (`LocalSimHost`) checks against `ownedParts()` like a join.
- **`?devlooks=N`** = N survivors in all (mine + N − 1 extras, AC 14's "devlooks=4 → 3 extra"), 1–4, fixed-seed random starter looks, views only.
- Build-time choices B1–B10 are listed (code, value, alternative) in `docs/epic-7-story-decisions-looks.md` › "7.9 build-time choices", all auto-accepted overnight (designer: follow the GDS recommendation).
- **PlayerView** keeps the 7.8 one-piece atlas path until `setBodyTexture` is called (GameScene always calls it), so 7.8's tests and any view without a look still draw.

### Tests per checked task (retro R1: file > test name)

- T1 lookCode.ts → `packages/shared/src/cosmetics/lookCode.test.ts` > "round-trips every one of the 51 parts with random colours", "the longest legal look … fits in 96 characters", "refuses to write a code over the bound", "fuzz: 1,000 random strings …", "reads each slot on its own …", "each colour on its own …", "fields in any order …", "head:none and pack:none are different parts", "ownedParts() is exactly the 31 starter parts", "a part not owned is drawn as the default part …", "catalogueParts() is every one of the 51 parts …"
- T1 lookCode.test.ts → itself (mutation pass: per-slot fallback, owned check, length cap — all killed)
- T4 spriteAtlas.ts gun frames → `apps/client/src/render/city/survivorGunSplit.raster.test.ts` > "one gun frame per held-art weapon, the plain bar and the running chainsaw, all survivor-sized"
- T4 spriteArt.ts `drawSurvivorBody` → same file > "the gun frame alone shows no body, and the body alone no gun (the split is real)"; 7.8's `survivorParts.raster.test.ts` > "AC 3: … is today's survivor …" (still green, the digest pin unchanged)
- T4 raster test → same file > "%s: gun + default body = the one-piece frame" (9 frames, ≤ 2 per channel)
- T5 SurvivorLookTextures.ts → `apps/client/src/render/SurvivorLookTextures.test.ts` > "bakes each player's body once …", "L4: the same code and stage every frame does nothing …", "D1: a new decay stage repaints once, darker …", "brief 20: a lost context repaints the CURRENT look …", "a restarted scene drops the previous run's leftover bodies first", "beat the rule 4: 50 rejoins …", "beat the rule 3: …", "L6: the same code and stage draw the same pixels on two phones"
- T5 PlayerView.ts → same file > "body from the player's texture, gun from the shared atlas just under it …", "the flamethrower's tanks …", "downed / slowed tints, out and the blackout depth …", "L4: no frame or texture call per frame …", "L3: no look changes the ring colour …", "without a look texture (7.8 path) …", "AC 10: a look with the propeller cap …"
- T5 GameScene hookup (R2 wiring) → `apps/client/src/scenes/lookWiring.test.ts` (each of the 5 hookup lines; deleting the leave line fails it) + `SurvivorLookTextures.test.ts` > "sets the body texture, follows the stage, and takes the layer from the look (once per code)"; LocalSimHost look → `apps/client/src/sim/LocalSimHost.look.test.ts` (3 tests); `apps/client/src/sim/playerInfo.test.ts` (look "")
- T2 migration / repository → `apps/server/src/db/look.db.test.ts` > "the 7.9 migration adds the nullable look column to progress and nothing else", "runs forward on 7.1's schema with rows in it: the rows stay, their look is null", "the repository returns null by default and a stored code unchanged"; `db.test.ts` (repository shape incl. `look: null`)
- T2 session response → `apps/server/src/auth/lookSession.test.ts` > "a new guest: progress.look is null", "a stored look comes back as saved; junk in the column comes back canonical", "beat the rule 5: a progress read that fails keeps the session saved with the default look"
- T3 join option / checkAuth / state → `apps/server/src/rooms/RunRoom.look.test.ts` > "1,000 random looks … all accepted, each canonical ≤ 96 characters" (L1), "logs look_replaced with the count only …", "12 bad looks: 12 joins accepted …", "L2: an unowned part … is the default part on the room state …", "no look (bots, old tabs) joins with the default look", "kept through a run and a lobby return …", "NP 21: a takeover keeps the seat's look …", "NP 21: a remembered seat (hold ran out) comes back with its own look", "L4: 0 B/s per tick …"
- T3 client join path → `apps/client/src/net/deviceLook.test.ts` (6 tests: server copy first and kept, null clears, save server down → device copy, blocked storage), `apps/client/src/net/connection.account.test.ts` > "Story 7.9 (AC 5, R2): every join path carries my look …"; `NetSimHost` reads `state.look` → `apps/client/src/sim/playerInfo.test.ts`; L5 → `apps/client/src/sim/LocalSimHost.look.test.ts` > "same seed and inputs → the same World digest with any look"
- T6 lobby → `apps/client/src/ui/lobbyLayout.test.ts` (R9: 568×320, 640×360, 800×360, 844×390 × insets 44/21 and 0), `apps/client/src/render/city/survivorPortrait.test.ts` (3 tests), `apps/client/src/ui/lobbyWiring.test.ts` (R2: 4 tests), `apps/client/src/net/lobbyStore.test.ts` (rows carry `look`); screenshots at the four sizes, host and guest (Playwright, 3 real players joined through the real server)
- T7 → `docs/perf/epic-7-looks.md`; repaint budget → `SurvivorLookTextures.test.ts` > "AC 9: a build start repaints at most one existing body per frame …", `lookWiring.test.ts` > "the per-frame repaint budget is reset once per frame …"
- T5 `?devlooks=N` → `apps/client/src/debug/urlOptions.test.ts` > "Story 7.9: ?devlooks=N (dev builds only) …"; `SurvivorLookTextures.test.ts` > "beat the rule 4" uses `devLookCodes`

### Gate (retro R6)

- **Final (fc10619, = story-7-9 merged with origin/master 02e7d8c + origin/story-7-1 7519791): `npm run typecheck && npm run lint && npm test && npm run build` GREEN — 446 files, 4015 passed, 3 skipped, 0 failed; build OK. Load 0.4 at the start, 4.5 at the end (1-min average; only this builder in the container).** Two earlier full runs on the same merge: run 1 failed 7.1's `tools/checks/accountWiring.test.ts` (it expected `sessionTicket()` in the join paths: updated to `joinAccount()`, fix fc10619); run 2 failed 8.1's `tools/bots/cut.test.ts` once at load 4.8 (passed in run 1, alone 2/2 and in run 3: timing under load, not 7.9 code — reported for 8.1).
- Early part (46d60e3): typecheck + lint clean; touched tests (render, sim, debug, scenes, tools/checks, shared cosmetics/config) 1360 passed / 0 failed, load 0.22. Full gate: not yet (at the end, after T2/T3/T6/T7 and a master merge).

### Completion Notes List

- 2026-11-25 early part (T1, T4, T5): look code + 15 tests (round trip all 51 parts, 94/96-char bound, 1,000-string fuzz, per-slot / per-colour fallback, `head:none` vs `pack:none`, ownership); gun-only atlas frames `survivorgun_*` + `drawSurvivorGun` / `drawSurvivorBody` split of `drawSurvivor` (raster: gun + body composed = the one-piece frame, ≤ 2 per channel, every weapon); `SurvivorLookTextures` (bake once, repaint on look / stage change only, lost-context repaint of the current look, leftover cleanup, ≤ players on screen); PlayerView gun image under the body (shared tint / visibility / depth / rotation, nopack body for the flamethrower); animated layer from the look; `?devlooks=N`. Mutation pass: 11 mutations, all killed (the "pack always on" mutation first survived my raster test because the reference shares the body function: killed by 7.8's frozen AC 3 test, and a direct nopack pixel check was added).

- Story context created 2026-11-25 from master 7385b47: comprehensive developer guide, status ready-for-dev.

### File List

- New: `packages/shared/src/cosmetics/lookCode.ts`, `packages/shared/src/cosmetics/lookCode.test.ts`, `apps/client/src/render/SurvivorLookTextures.ts`, `apps/client/src/render/SurvivorLookTextures.test.ts`, `apps/client/src/render/devLooks.ts`, `apps/client/src/render/city/survivorGunSplit.raster.test.ts`, `apps/client/src/sim/LocalSimHost.look.test.ts`
- Changed: `packages/shared/src/config/cosmetics.ts` (`LOOK_CODE_MAX`), `packages/shared/src/index.ts`, `apps/client/src/render/city/spriteArt.ts`, `apps/client/src/render/city/spriteAtlas.ts`, `apps/client/src/render/PlayerView.ts`, `apps/client/src/render/darkness/fakeScene.testkit.ts` (stroke colour, `getTextureKeys`), `apps/client/src/scenes/GameScene.ts`, `apps/client/src/sim/SimHost.ts`, `apps/client/src/sim/NetSimHost.ts`, `apps/client/src/sim/LocalSimHost.ts`, `apps/client/src/sim/playerInfo.test.ts`, `apps/client/src/debug/urlOptions.ts`, `apps/client/src/debug/urlOptions.test.ts`, `_bmad-output/implementation-artifacts/sprint-status.yaml`

### Review fixes (review-7-9 @ ddd2440, CHANGES REQUESTED)

- ✅ M1 [Medium] the gun now blinks with the body in 8.1's spawn protection (`PlayerView.ts` `this.gun.setAlpha(blink)`) → `SurvivorLookTextures.test.ts` > "downed / slowed tints, out and the blackout depth apply to body and gun together" (alpha case added; mutant killed).
- ✅ M4 [Medium] L2 + L6 online → `apps/client/src/sim/playerInfo.test.ts` > "L2: the wearer's own view and a teammate's both read the server's code", "L6: two phones in one room resolve the same look for each player" (mutant `info.look = ""` killed).
- ✅ L1 a lobby row with a real code → `lobbyStore.test.ts` > "copies players in slot order as plain data" (mutant `look: ""` killed).
- ✅ L2 the gun frames the game uses → `survivorGunSplit.raster.test.ts` > "atlas frame %s + default body = the one-piece frame" (painted by the atlas's `drawCharacterFrame`, now exported for tests; mutant without `WEAPON_BACK_ART` killed).
- ✅ L3 the fuzz says what it does: > 1 KB options are refused by the options cap (asserted, counted), the rest accepted; accepted + capped = 1,000.
- ✅ L4 bandwidth: 4 players, 200 ticks (build phase: a wave would hold 4 idle bots, 8.1), a client listener on every player's `look` sees 0 changes, bytes per tick within 5 % of the default-look run (mutant "look rewritten every 40 ticks" killed: 20 changes).
- ✅ L5 the dev ⚙ is not drawn on the lobby (`DevCheats.tsx`) → `lobbyWiring.test.ts` > "review L5 …".
- ✅ L6 Start's second line is a short hint ("Waiting for Ready" / "Need 1 player", `START_HINT_SHORT`, full text as label/title) → `lobbyStore.test.ts`, `lobbyWiring.test.ts` > "review L6 …"; screenshots 568×320 and 800×360: fits.
- ✅ L7 bakes: one per frame for new bodies too (a survivor shows the default atlas picture until its turn), and online none before `decaySynced` → `SurvivorLookTextures.test.ts` > "AC 9: … all 4 are done after 4 frames" (new bodies 1/frame), `lookWiring.test.ts` > "review L7 …"; B8 text corrected in `docs/perf/epic-7-looks.md` and the decisions doc.
- ✅ L8 deploy order: Notes for the merge + `docs/deploy.md` › Deploy ("Server first, never the client alone").
- ✅ M2 (at landing, master c26d1bc): `netProtocolVersion: NET_PROTOCOL_VERSION` in `RunRoom.look.test.ts` `opts()` (the only 7.9 test that joins a room).
- ✅ M3 (at landing): `0001_look` SQL + snapshot + journal entry dropped, master merged (7.2's `0001_run_rewards`), `drizzle-kit generate --name look` → `0002_look.sql` (`ALTER TABLE "progress" ADD COLUMN "look" text;`, `when` 1795599721941 > 7.2's 1795586996317, `prevId` = 7.2's snapshot `cd82bd88…`) → `look.db.test.ts` > "review M3: the look migration's journal `when` is newer than every earlier one", "runs forward on the schema before it (7.1 + 7.2 …): … the look column exists" (forward run from a DB with 0000 + 0001 applied and rows in it; mutant "old `when`" fails both).
- Merge with master: 7.1's re-review N-R3 made seat recovery reuse a recent ticket (`recoveryTicket`); `rejoinGame` now uses `recoveryAccount()` = that ticket + this device's look copy (no session call per retry; mid-run the server keeps the seat's own look anyway), and `joinAccount()` stores its ticket for that reuse. `accountWiring.test.ts` checks both paths.

### Notes for the merge (per shared file)

- `packages/shared/src/net/messages.ts` `joinOptionsSchema`: one optional key `look: z.unknown()`, after 7.1's `ticket`. A NEW client against an OLD server (the schema is `.strict()`) would be `invalid_options`: **deploy the server first or together** (review L8; `docs/deploy.md` › Deploy says so). No protocol bump: old tabs on the new server are fine.
- `packages/shared/src/net/account.ts`: the saved variant gains an OPTIONAL `progress: { look }` (strict inside); the client copes with a server that sends none.
- `packages/shared/src/net/stateView.ts` / `apps/server/src/rooms/schema/RunState.ts` / `apps/client/src/net/fakeRoom.ts`: `look` appended LAST, after 8.1's `heldUntilTick` / `protectTicks` (8.9's `inputQueued` before them). `devThrottle.ts` copies it through `PLAYER_STATE_FIELDS` (no line there). `syncState.ts`: comment only (`resetRunFields` keeps `look` like `name`). World / mirror / Predictor / snapshotWorld / bots: untouched on purpose (L5: the World never sees the look; bots send none → the default look).
- `apps/server/src/rooms/RunRoom.ts`: `checkAuth` decodes the look after 7.1's ticket check (M1: ticket bound to the guest token); `RunAuth.look`, `Member.look` (`run/lobby.ts`), `RememberedSeat.look` (next to 8.1's `buildIdx`); `join` / `restoreRemembered` pass it to `new PlayerState`; a takeover keeps the member's look (spread). `authLog` is now exported (tests). **7.11:** pass the account's `cosmetics` to `ownedParts()` in `checkAuth` — checkAuth is sync and DB-free, so 7.11 needs the owned items on the ticket or an async load: decide there.
- `apps/server/src/auth/guestSession.ts` / `app.ts`: `GuestSessionDeps.progress?` (app.ts passes `progressRepo(database)`); the read runs inside 7.1's one 2 s deadline (L3).
- `apps/server/src/db/schema.ts` + `drizzle/0002_look.sql` + `meta/0002_snapshot.json` + `_journal.json`: generated by `drizzle-kit generate --name look` on top of 7.2's `0001_run_rewards` (review M3). A later story's migration goes on top (0003_…) and must be GENERATED after merging master (Drizzle applies only a migration whose journal `when` is newer than the last applied one: a renamed old file is skipped silently).
- `apps/client/src/net/connection.ts`: `options(intent, name, { ticket, look })` + 8.10's `netProtocolVersion`; create / join use `joinAccount()`, `rejoinGame` uses `recoveryAccount()` (7.1 N-R3's reused ticket + the device look); `sessionTicket` / `recoveryTicket` are still exported; `watchLobby` also listens to `look` (7.10 D3).
- `apps/client/src/ui/LobbyScreen.tsx` + `overlay.css`: the lobby is rewritten (SC3); every old `.lobby*` rule is gone except `.lobby__dot` (ResultsScreen uses it). **7.7:** the district panel (`.lobby__district`, `L.district`) is the place for the picker (DP2): make it a button with the chevron and the sheet; the layout test already reserves ≥ 120 px. Lumen tokens are scoped under `.lobby` (`--lumen-*`): a later story that adds shared Lumen tokens should hoist them.
- `apps/client/src/render/PlayerView.ts`: a gun image under the body and `setBodyTexture`; 8.1's D3 blinking: if it sets body alpha, set the gun's too.
- `apps/client/src/render/city/spriteAtlas.ts`: 9 new `survivorgun_*` frames (the atlas still passes `atlasLayout.test.ts`); the old `survivor_*` frames stay (7.8's digest pin) but the game no longer shows them (cleanup later).
- `apps/client/src/render/darkness/fakeScene.testkit.ts`: `strokeColor` and `getTextureKeys` added (additive).
- `apps/client/src/scenes/GameScene.ts`: `syncLook` / `layerPoolOf` / `lookTextures` / `devLooks` fields, one line each in `syncPlayerView`, `dropPlayerView`, `syncPlayerViews`, create, shutdown, and `look: deviceLook.get()` in the solo `LocalSimHost`.
- For **7.10**: `encodeLook` / `decodeLook` / `catalogueParts`, `survivorPortraitUrl`, `drawSurvivorBody`, `deviceLook` (write the device copy when saving) are ready; the lobby redraws on a `look` change.
- For **7.12**: a found loot part is owned only from the next join.

### Not verified

- Real phones: the Xiaomi Mi 11i bake time and build-start repaint (the 4× throttled headless bake is 9.1 ms, over AC 9's ~2 ms; mitigations in `docs/perf/epic-7-looks.md`), `?stress=150&devlooks=4` on the phone, iOS Safari (the lobby's condensed font falls back to system fonts: no web font is loaded).
- An Android app switch (canvas wipe / context loss) on a real phone: covered by the registry test only.
- `?lag=150&jitter=20&loss=1`, a hidden tab across a build start and a reconnect on a real line: the look is set once at join and the repaint compares the stage each frame, so none of them can change it; tested in rooms (takeover, remembered seat) but not by hand under the lag switch.
- The VPS: migration `0001_look` on the production PostgreSQL 18 (Hermes's deploy runs `db:migrate`); tested forward on PGlite with 7.1's schema and rows.
- The lobby on a phone with a real notch (insets read from `env(safe-area-inset-*)`): tested by the layout function and desktop screenshots only.


## Senior Developer Review (AI)

**Reviewer:** fresh reviewer session, 2026-11-25 (gds-code-review, three layers: blind hunter, edge-case hunter, acceptance auditor + beat-the-rule probes). **Tree:** `review-7-9` = `story-7-9` b907077 merged with `origin/master` (8.10 f67154d). Merge conflicts (resolved as the union in the merge commit, both sides kept): `packages/shared/src/net/messages.ts` (`JoinRefusal`: `seat_kept` + `update_required`), `tools/bots/run.ts` (FLAGS: cut-* + kbps), `apps/client/src/net/connection.ts` (`options()`: ticket/look + `netProtocolVersion`), `apps/client/src/sim/NetSimHost.ts` (8.10 moved `receiveHorde` into the constructor callback; 8.1's `rebaseAfterGap` kept), `sprint-status.yaml`, `docs/perf/network-pass-2026-11.md`. 7.9's own code = commits 46d60e3, eccab8a, 5b50780, 7858c23, fc10619. Checks run: typecheck (green), the 16 touched test files, 25 mutations, live join probes against a real server, Playwright lobby at 568×320 / 800×360 with 4 players, FPS row re-run. Full gate not run (rules).

**Verdict: CHANGES REQUESTED** — 4 Medium (1 real bug, 1 merge break, 1 merge hazard, 1 test gap on L2/L6), 8 Low. The rule core holds: no unowned part, junk or oversized code got through; the look is set once and kept by takeover / remembered seat / lobby return; ring colour untouched; 0 B per tick.

### Findings

| ID | Sev | Where | Scenario | Minimal fix |
| --- | --- | --- | --- | --- |
| M1 | Medium | `apps/client/src/render/PlayerView.ts:241-246` | 8.1's spawn-protection blink (on this branch via story-7-1) sets `body.setAlpha(blink)` and the layer's alpha, **not the new gun image**. After every mid-wave return the body fades to 0.37 while the gun stays solid and shows through the translucent body. Probe: `protectTicks: 30`, t = 100 ms → body alpha 0.367, gun alpha 1. Breaks AC 7 "tints … and visibility apply to body and gun together". | `this.gun.setAlpha(blink);` next to the body; add the alpha case to "downed / slowed tints, out and the blackout depth apply to body and gun together". |
| M2 | Medium (merge) | `apps/server/src/rooms/RunRoom.look.test.ts:31-38` | On master (8.10: join options need `netProtocolVersion`) the test's `opts()` has none → **9/9 tests fail** with `balance_mismatch`. Adding `netProtocolVersion: NET_PROTOCOL_VERSION` makes all 9 pass (checked). The gate line (fc10619, master 02e7d8c) predates 8.10. Same break, not 7.9's code, for whoever merges them: 7.1's `RunRoom.account.test.ts`, 8.1's `RunRoom.reconnect.test.ts`, `auth/accountRoutes.test.ts` (35 failures together on this merge). | Add the field to `opts()`; re-gate on current master. |
| M3 | Medium (merge hazard) | `apps/server/drizzle/0001_look.sql`, `meta/0001_snapshot.json`, `meta/_journal.json` | `story-7-2` also has `0001_run_rewards` (idx 1, same `0001_snapshot.json` name, both `prevId` 067eb126…). Drizzle 0.45.4 applies a migration only if its journal `when` is **newer than the last applied** (`node_modules/drizzle-orm/pg-core/dialect.js:62`). 7.9's `when` 1795586686338 < 7.2's 1795586996317: if 7.2 lands/deploys first and 7.9 is just renamed `0002_look` keeping its `when`, production **silently skips it** → no `progress.look` column → `progressRepo.get` (selects `look`) fails on every read. | Whichever merges second: drop its own 0001 SQL + snapshot + journal entry, merge the other, re-run `npm run db:generate` (→ `0002_*`, fresh `when`, `prevId` = the other's 0001 snapshot id, snapshot with both tables); point `look.db.test.ts` at 0002 and add a forward run on a DB that already applied the other 0001. |
| M4 | Medium (test gap) | `apps/client/src/sim/NetSimHost.ts:387`, `apps/client/src/sim/playerInfo.test.ts` | L2's "the wearer's own view uses `state.look`" and L6's "two `NetSimHost`s on one fake room" are untested: mutant `this.info.look = ""` (every player drawn default online) **survives** all tests. L6 is only "same code + stage → same pixels". | `fakePlayer(slot, { look: X })` → `playerInfo(id).look === X` for the local player and a teammate; two hosts on one fake room → equal `resolveLook` per player. |
| L1 | Low | `apps/client/src/net/lobbyStore.test.ts` | Story claims "rows carry `look`" but every row uses `look: ""`; mutant `look: ''` in `lobbyStore.ts:` row builder survives. | One row with a real code. |
| L2 | Low | `apps/client/src/render/city/spriteAtlas.ts:245-252`, `survivorGunSplit.raster.test.ts` | The raster test draws its own gun frames, not the atlas's: mutant dropping `WEAPON_BACK_ART[weapon]` from the atlas gun frame (flamethrower tanks gone in game) survives. | Draw the gun frames through `characterSpecs()` + the atlas frame painter (or assert tank pixels in the atlas's flamethrower gun frame). |
| L3 | Low | `RunRoom.look.test.ts:50-74` | "1,000 random looks (10 kB …) are all accepted": the > 1 KB cases are skipped (`continue`). Live: a 900-char look → `invalid_options`, 10 kB → `Payload Too Large`. Harmless (real clients cap at 96 via `deviceLook` and the session schema) but AC 5 / L1 "never refused" isn't literal. | Rename the test / say in AC 5 that the 1 KB options cap applies; count skipped cases. |
| L4 | Low | `RunRoom.look.test.ts:178-198` | L4 measures 2 players, ~20 ticks, 15 % tolerance (spec: 4 looks, 200 ticks). A look rewritten every few ticks could hide in 15 %. (Full-string per-tick rewrite was killed.) | 4 players, 200 ticks, or assert no `look` change in the per-tick patches. |
| L5 | Low (dev only) | `apps/client/src/debug/DevCheats.css:2-7` vs `lobbyLayout.ts:74` | The dev ⚙ (fixed, right 68 px, top 14 px) sits on LEAVE: 800×360 gear 688–732 × 14–58 over leave 700–792 × 8–56; same at 568×320 (screenshots). Taps on LEAVE's left part open cheats. | Hide the gear while the lobby shows, or keep `leave` clear of it. |
| L6 | Low | `LobbyScreen.tsx` (B9 hint) | The host's hint inside Start is cut: "Waiting for everyon…" at 568×320, "Waiting for everyone to be Rea…" at 800×360. | Shorter text ("Waiting for Ready") or allow 2 lines. |
| L7 | Low | `SurvivorLookTextures.ts:61-100`, `docs/perf/epic-7-looks.md` (B8) | The doc says the first bake is "in the Game scene's start … before the first frame of play"; the code bakes in the first `update()` (via `syncPlayerView`). A reload / new scene mid-wave (8.1 return) bakes 4 bodies in one frame mid-wave, and online may bake at stage 1 then repaint at the real stage when the first decay patch lands (4 more, 1/frame). | Skip `setLook` until `decaySynced` (or pre-bake in `create` from the host's players); correct the doc sentence. |
| L8 | Low (deploy) | `packages/shared/src/net/messages.ts` (`look`) | New client + old server: the strict schema refuses `look` → `invalid_options`, not "Please reload" (brief 16). The change is additive (old tabs on the new server are fine). | Deploy the VPS server before (or with) the client; note it in the merge notes. No protocol bump needed. |

**B8 (bake 9.1 ms at 4× vs AC 9's ~2 ms):** the mitigation is acceptable. Steady state costs nothing (no texture call per frame, mutation-checked), a build start costs ≤ ~2.3 ms per frame for 4 frames (4× throttle), and the phone itself is unmeasured. Keep the lazy `nopack` bake as the next cut. AC 9 stays partly met (designer-accepted B8), plus L7's mid-wave case.

**R1 / R6:** R1 ok (tests per task, file > test name). R6: the gate line is real but stale after 8.10 (M2).

### Beat the rule (attempts and results)

| # | Attempt | Result |
| --- | --- | --- |
| 1 | Live join, `head:riot` (milestone) + `pack:golf` (loot) | Joined; `state.look` = `head:cap`, `pack:backpack`, rest kept ✔ |
| 2 | Unicode (`cаp` Cyrillic a, 😀 hair, `ÉÉÉÉÉÉ` colour) | Joined; those fields default ✔ |
| 3 | `__proto__:x`, `constructor:y`, `head:constructor`, `top:__proto__` | Joined, full default look; no prototype access (keys checked against the slot list, ids against the owned set) ✔ |
| 4 | Duplicate `head:cap|head:riot` | First wins (`cap`) ✔ |
| 5 | Object `{head:"riot"}`, array, `null`, number | Joined, default look ✔ |
| 6 | 900-char / 10 kB look | Refused by the 1 KB options cap (`invalid_options` / 413) — L3 |
| 7 | Hide who I am: colours = a teammate's / slot colours | Allowed (O3); ring, name, edge arrows stay the slot colour (L3 test, screenshot card 3) ✔. No alpha in colours; `none` parts are starter parts. Very dark colours in the blackout: the ring and name sit above the dark ✔ |
| 8 | Change look mid-run by takeover (8.1) / remembered seat | Seat's look kept, new connection's ignored (tests; mutants M3/M4 killed) ✔ |
| 9 | Change look by a lobby rejoin | New look taken (lobby only; intended) ✔ |
| 10 | Guest / unsaved seat | Device copy sent, checked against starter parts ✔ |
| 11 | DB down (B5) | `checkAuth` needs no DB (starter set); session read failure keeps the session saved, default look (test, M5 killed) ✔. For 7.11: fail closed to starter parts |
| 12 | Tampered session response (Playwright route sets `progress.look` with unowned parts) | Lobby and game show the server-stripped look, own card too ✔ |
| 13 | Texture spam: 50 rejoins, scene restart, 4 players | ≤ players on screen; leftovers dropped at create; disposed at shutdown ✔ (headless: 4 `survivorlook_` with devlooks=4, 1 without) |
| 14 | Android context loss | Registry repaints the CURRENT look/stage (M8 killed); lobby portrait is a data URL (unaffected) ✔ |
| 15 | Gun under body vs aim / reload / melee / flamer / downed / blackout | Same position + rotation every frame; frames by weapon + chainsaw running; nopack for back pieces; tint / visibility / depth shared ✔ — **but not the 8.1 blink alpha (M1)** |
| 16 | Propeller layer | Set only when the code changes; pooled; no per-frame allocation in `syncViewLook` / `DevLooks.update` ✔ |
| 17 | Stage dim (B1) | Decay stage changes only in `decayMutate` (build start); 2 compares per frame; 1 repaint per frame budget ✔ (L7 for the first-patch case) |
| 18 | FPS `?stress=150&devlooks=4` re-run (844×390 DPR 2, 12 s, load 0.7–1.2) | stress=150: 18.6 / 18.3; devlooks=4: 18.3 / 19.0 → mean 18.45 vs 18.65 (−0.2), within 2 FPS ✔ |
| 19 | SC3 lobby 568×320, 4 players, 16-char W/M names, unicode name, ⚙ | Matches SC3/DP2 (cards, rings, white "You" tag ✔, Host tag); names ellipsised; ⚙ over LEAVE (L5); Start hint cut (L6). Screenshots: `review-7-9/lobby-568-host.png`, `lobby-568-guest.png`, `lobby-800-host.png` |
| 20 | Migration on 7.1's schema with rows | Forward test green (PGlite); collision with 7.2 → M3 |
| 21 | New client vs old server | `invalid_options` (L8) |

### Mutations (25; one source change each, matching test run, reverted)

Killed (22): lookCode owned check dropped; checkAuth accepts riot/golf; takeover uses the new connection's look; remembered seat drops look; session read failure throws; session look not canonicalised; repaint budget not spent; lost context repaints the first look; `remove` keeps the texture; gun above body; gun tint not shared; layer ignores look; solo look ignores ownership; server copy not kept on device; device look length cap off; lobby return wipes look; look rewritten every tick; lobby card overlaps buttons; portrait cache keyed wrong; "You" tag accent; migration `NOT NULL DEFAULT ''`; joins send only the ticket (accountWiring + connection.account).
**Survived (3):** NetSimHost `info.look = ""` (M4); lobby rows `look: ''` (L1); atlas gun frame without the back piece (L2).

### Re-review (narrow) 1

Scope: only the fix commit 64e57a0 (`b907077..origin/story-7-9`). The merge items M2 (netProtocolVersion) and M3 (migration renumber) are left for landing and not reported. Typecheck passes; the 7 touched test files pass (75 tests).

**Verdict: APPROVE with 1 Low and 1 nit** (no Medium or higher left). The fixes are correct; the Low is a pooled-sprite leak in the same blink path as M1.

**Findings**

- **[Low] RR1: the pooled propeller keeps a faded alpha (M1 not quite finished).** `PlayerView.update` sets the layer's alpha only when `protectBlinkAlpha` changes. `SurvivorLayerPool.release` only hides the sprite (`setVisible(false)`); it does not reset its alpha. Repro, a scratch test using the fakeScene testkit:
  1. View A wears the propeller and blinks (`protectTicks: 30`, layer alpha 0.367).
  2. A is destroyed (the player leaves while protected).
  3. View B gets the same pooled sprite. B is unprotected, so `shownBlink` stays 1 and the alpha is never written.
  4. Result: B's propeller stays at alpha 0.367 while its body is at 1.

  Fix idea: reset alpha (and tint) in `release`/`acquire`, or apply `shownBlink` in `setAnimatedLayer`. The other paths are fine:
  - The downed/slowed tint and visibility go to body, gun and layer together (a new body texture resets `shownStatus`).
  - Out hides all three.
  - The blackout depth moves all three.
  - The gun's alpha is set even while hidden (atlas fallback), so it is right when it shows.
  - PlayerView has no other alpha or tint path, such as a hit flash.
- **[nit] RR2: the L6 test counts characters, not pixels.** `lobbyStore.test` checks `length ≤ 17`. Measured in Chromium at `500 11px system-ui`: "Waiting for Ready" is 93.0 px and "Need 1 player" is 71.0 px. The Start button is ≥ 112 px (`mainW` floor) minus its 4 px border, so the text fits at 568 and 800, even with notch insets. The check is right in practice, but a pixel check would be safer.

**What I tried to break (L7, one bake per frame)**

- **4 players join at once:** bodies bake on frames 1–4, in the Map's insertion order. Until then each shows the default atlas frame with the gun hidden, and the layer waits with the body.
- **Build start in the same frame:** a build start's repaints share the budget, so the worst case is 8 frames.
- **Wrong person's look:** not possible. Entries are keyed by playerId, a queued body has no entry, and `syncViewLook` returns before `setBodyTexture`.
- **Flicker:** none. Once a view has its key it keeps it, and a spent budget on an existing entry returns the old key.
- **Leaving while queued:** no entry and no texture, so `remove` is a no-op and nothing leaks.
- **Context loss while queued:** only registered (baked) bodies are repainted; queued ones register later at their current look.
- **Allocation:** the null path allocates nothing.
- **`decaySynced` never arriving:** this gate is only for `NetSimHost`. Practice solo and `?solo` (LocalSimHost, starter look) bake at once. Online, a stage change makes `decaySynced` false for a tick, which only delays a bake: the old texture stays.
- **L5:** the ⚙ comes back after leaving the lobby. The `uiStore.subscribe` sets `inLobby` from `sc.kind` each time the screen changes.

**Mutations: 10, all caught**

| Mutation | Caught by |
|---|---|
| M1: remove `gun.setAlpha(blink)` | SurvivorLookTextures.test |
| L7: remove `return null` on a spent budget | SurvivorLookTextures.test |
| L7: remove the `decaySynced` gate | lookWiring.test |
| L5: `!inLobby` → `true` | lobbyWiring.test |
| L6: the button shows `startHint` | lobbyWiring.test |
| L6: longer short-hint text | lobbyStore.test |
| L2: atlas plain gun painted at 0.9 r | raster test |
| L1: snapshot drops `look` | lobbyStore.test |
| M4: NetSimHost `info.look = ""` | playerInfo.test, 2 tests |
| L4: server toggles `player.look` every tick | RunRoom.look.test, 2 tests |

The L3 fuzz was not mutated: it is a rename plus count assertions.

**Fixes after re-review 1 (no further re-review, main session):**

- ✅ RR1 [Low] `SurvivorLayerPool.release` resets alpha 1 and tint white; `PlayerView.setAnimatedLayer` applies the current blink alpha and re-tints at the next update → `SurvivorLookTextures.test.ts` > "re-review RR1: a propeller handed back by a blinking (or downed) wearer is clean for the next one" (both mutants killed: no reset in the pool; no blink alpha on acquire).
- ✅ RR2 [nit] the short Start hints are measured in px at the hint font (`@napi-rs/canvas`, 500 11 px): "Waiting for Ready" 87 px ≤ 100 → `lobbyStore.test.ts`.
