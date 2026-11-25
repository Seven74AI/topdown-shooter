# Story 7.9: My look in the game

Status: ready-for-dev

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

- [ ] **T1 Look code (shared)** (AC 2–4, L1)
  - [ ] `packages/shared/src/cosmetics/lookCode.ts`: `encodeLook(look)`, `decodeLook(input, owned) → { look, replaced }`, `ownedParts(cosmetics?)`, `LOOK_CODE_MAX = 96` (in `config/cosmetics.ts`), `partKey(slot, id)`. Pure, no allocation concerns (runs at join / bake only). Export from `packages/shared/src/index.ts` next to the 7.8 cosmetics block.
  - [ ] `lookCode.test.ts`: round trip for all 51 parts, random colours, longest-id bound, junk fuzz, unowned replaced, per-slot fallback, `head:none` vs `pack:none`.
- [ ] **T2 Database and session** (AC 1) — waits for Story 7.1 on master
  - [ ] Drizzle schema: `look` text nullable on `progress`; `npm run db:migrate` migration file; the 7.1 progress repository returns it; the 7.1 session/progress response includes `look` (null → the client uses `DEFAULT_LOOK`).
  - [ ] Repository test (7.1's DB test pattern): null by default, a stored code reads back unchanged.
- [ ] **T3 Join and room state** (AC 5, 6, L1, L2)
  - [ ] `messages.ts`: `look: z.unknown().optional()` in `joinOptionsSchema` (comment: "never refuses a join: decoded in checkAuth").
  - [ ] `RunRoom.checkAuth` (`RunRoom.ts:240`): decode with the account's `owned` (7.1 puts the account on `RunAuth`; until 7.11 `ownedParts()`), add `look` (canonical code) to `RunAuth`; `RunRoom.join` (`:327`) sets `PlayerState.look` with `name` (`:344`).
  - [ ] Schema field + every copy (brief 2): `RunState.ts`, `stateView.ts` (`PlayerStateView.look`, `PLAYER_STATE_FIELDS.look`), `fakeRoom.ts`, `devThrottle.ts` StateCopy, `resetRunFields` keeps it (`syncState.ts:217`), the 8.1 held seat / remembered seat keep it (check at build time).
  - [ ] Room tests: a bad look joins; an unowned part is replaced; look survives `lobby.return`; bandwidth per tick unchanged.
- [ ] **T4 Gun under the body** (AC 7, 8) — decision 7.9 D2
  - [ ] `spriteAtlas.ts`: gun-only frames `survivorgun_<weapon>_a` for each `WEAPON_ART` weapon (with `WEAPON_BACK_ART` drawn first for the flamethrower), `survivorgun_plain_a` (today's `CHAR.gun` bar) and `survivorgun_chainsaw_b` (running chain); `survivorGunFrameFor(weapon, running)` beside `survivorFrameFor` (`:53`). Same frame size as `survivor_body_a` and same centre, so gun and body line up with one position and rotation. Keep the existing `survivor_*` frames (7.8's digest pin); note them as unused in the game for a later cleanup.
  - [ ] `spriteArt.ts`: a `drawSurvivorBody(c, r, look, withPack)` that draws what `drawSurvivor` draws after the gun (arms → pack → top → skin → hair → headgear, `layers = false`), with the same line-state sequence.
  - [ ] Raster test (`@napi-rs/canvas`, 7.8 pattern): for every survivor frame, gun frame + body frame composed ≈ the 7.8 frame (AC 8).
- [ ] **T5 Per-player textures and PlayerView** (AC 7, 9–11, L3, L4)
  - [ ] `apps/client/src/render/SurvivorLookTextures.ts`: one canvas per player id (2 frames side by side), registered once through `addGeneratedTexture` with a paint callback that reads the player's current resolved look (so a lost context repaints the current look); `setLook(playerId, code, stage)` repaints only when the code or stage changed (`tex.refresh()`); on scene `create` remove leftover `survivorlook_*` textures and unregister them (the `DarknessView.ts:136` / `:209` pattern: Phaser keeps textures across a scene restart); `dispose` on scene shutdown.
  - [ ] `PlayerView.ts`: a second image for the gun (depth just under the body), both turned and placed together, both tinted (downed / slowed / `BODY_TINT`), both moved by `setAboveDark`; `setBody(textureKey, withPack)` switches the body frame only when the weapon's back piece changes (a swap or a buy), never per frame. The ring keeps `SLOT_COLORS` (AC 11).
  - [ ] `GameScene.ts` `syncPlayerView` (`:240`): on a new view, `setLook` from `host.playerInfo(id).look` and the animated layer from the look (AC 10); on `decay.stage_changed` (build start) repaint (D1). `PlayerInfo` gains `look` (`SimHost.ts:163`; `NetSimHost.playerInfo` `:343` reads `state.players.get(id).look`; `LocalSimHost.playerInfo` `:330` returns the device's look, AC 13).
  - [ ] `?devlooks=N` in `apps/client/src/debug/urlOptions.ts` (dev builds; + test) for AC 14.
- [ ] **T6 Lobby card** (AC 12) — after the designer's pick
  - [ ] `survivorPortraitUrl(code)` (cached by code, `typeof document` guard) in `render/city/` next to the part code; `lobbyStore.ts:36` rows carry `look`; `LobbyScreen.tsx` shows the portrait per the picked layout; HUD/menu layout test at 568 × 320 and 640 × 360.
- [ ] **T7 Perf and gate** (AC 9, 14)
  - [ ] Bake timing (4 bodies) headless with and without a 4× CPU throttle; `?stress=150` before/after with `&devlooks=4`; load recorded; `docs/perf/epic-7-looks.md`.
  - [ ] Full gate on the branch merged with current master; "Notes for the merge"; "Not verified".

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

### Completion Notes List

- Story context created 2026-11-25 from master 7385b47: comprehensive developer guide, status ready-for-dev.

### File List
