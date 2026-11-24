---
baseline_commit: 8e226d1610ad352b988ed99eaddd29b28d4f268e
---
# Story 7.8: Survivor parts in game code

Status: done

(Created 2026-11-24 after the Epic 7 readiness check, `_bmad-output/planning-artifacts/implementation-readiness-report-2026-11-24-epic-7.md`, and its fixes, `sprint-change-proposal-2026-11-24-epic-7-readiness.md`. Source design: `docs/ideas/customization/proposal.md` D1–D7, O1–O6; prototype `docs/ideas/customization/avatar-editor.html`. FR89.)

## Story

As a player,
I want my survivor to be built from parts I can swap,
so that customization is possible without new image files.

> **Brief.** Epic 7 has no brief of its own yet. These lines of the EPIC 6 BRIEF (`docs/epic-6-brief.md`) apply as written; reviewers check each one: **1** (own cloud session, branch `story-7-8`, assigned ports, one full gate at the end), **9** (every new test is mutated once and the result listed), **10** (no per-frame allocation; look numbers in data, no inline literals for colours or mute factors), **12** (atlas frames ≤ 2048², `category_name_variant`), **13** (readability: a part must never look like a gameplay signal), **18** (say plainly what was not verified), **19** ("Notes for the merge" per shared file; fresh-agent re-review of every medium/high fix), **20** (every code-drawn texture goes through `addGeneratedTexture`; `tools/checks/noUnregisteredTextures.test.ts` stays green).
>
> **Scope:** client art (`apps/client/src/render/city/`), a new catalogue in `packages/shared`, a pick page in `docs/art/7-8/`, tests. **No** room, schema, message, server or database change; **0 B/s**. The look code, the join and per-player textures are Story 7.9; the editor screen is 7.10. In this story the game still draws only the default look: today's survivor with the designer's new cap (AC 3).

## Acceptance Criteria

1. **Art pick first.** Before any part is ported, the designer picks the part looks from a code-drawing page `docs/art/7-8/parts.html` (built from `docs/ideas/customization/avatar-editor.html`; published as an artifact like earlier art picks). The page shows every part big **and** at game size (35 px per metre, 0.4 m body radius, on wet asphalt, slot ring, a few zombies), each with its night-muted colour. Every part passes the "no gameplay signal" check: no armor plates, red-cross bags, shoulder lights, zombie skin or Runner shirts (proposal § 4.4). The picks are recorded in `docs/epic-7-decisions.md` › "Survivor parts (7.8)".
2. **Parts split.** `drawSurvivor` in `apps/client/src/render/city/spriteArt.ts` is drawn from one function per slot: top (arms + body), headgear, hair, backpack, skin (head) — **five slots, no accent** (designer, round 2; the accent picker colour stays as the colour of hats and bags). Draw order: weapon back piece → held gun → arms → backpack → top body → head (skin) → hair → headgear. The held gun stays its own layer under the arms (Story 5.3), and a weapon's back piece still replaces the backpack (Story 5.4, FT1's tanks). *(Changed 2026-11-24 by the survivor-parts course correction.)*
3. **Default look = today's body, only the cap redrawn.** With the default look (top `jacket` in `CHAR.jacket`, headgear `cap` in `CHAR.cap` with `hidesHair`, hair `short` hidden under the cap, backpack `backpack`, skin preset 1 = `CHAR.survivorSkin`), every survivor atlas frame (`survivor_body_a`, each `survivor_<weapon>_a`, `survivor_chainsaw_b`) is pixel-identical to today's `drawSurvivor` **except the cap**, which is the designer's new drawing (round 3, B); the frame names and sizes don't change (raster test, AC 8). *(Changed 2026-11-24: the designer chose to redraw the cap and make it the default.)*
4. **Catalogue.** `packages/shared/src/config/cosmetics.json` (zod-validated, loaded like the balance files but **not** part of `Balance` and not in the balance version) lists **51 parts: 31 starter, 10 milestone, 10 loot** (`docs/epic-7-decisions.md` › Survivor parts (7.8) › Final catalogue). Each has `id` (lowercase, ≤ 8 characters, unique per slot), `slot` (`top | head | hair | pack | skin`), `name`, `colour` (`none | top | hair | accent`), `unlock` (`starter | milestone:m1 … milestone:m10 | loot`), for headgear `hidesHair`, and optionally `animated` (an animated layer, see AC 9). Skin parts carry their preset colour. Milestones: M1 fire, M2 riot, M3 gas, M4 hockey, M5 headband, M6 camo, M7 planks, M8 laurel, M9 welding mask, M10 golf bag. No gameplay numbers. *(Changed 2026-11-24: counts, slots and milestone items from the designer's picks.)*
5. **Night mute.** A pure function turns a chosen colour into its in-game colour (darker and slightly desaturated, factors in `cosmetics.json` › `look.nightMute`) plus a per-stage dim (`look.stageDim[1..5]`, stage 1 = no extra dim). The default look's colours are the `CHAR` constants, which are already muted (D5), so they are not muted again. Today nothing dims survivors per decay stage; this story only provides the stage input (Story 7.9 decides when to redraw). The pick page shows chosen and in-game colour side by side.
6. **Every part shows at game size.** Drawn at 35 px per metre (`r` = 14 px), each non-"none" part changes at least **40 px²** of colour, or the outline, compared with the same look with that slot at "none" (raster test). Slots without "none" (top, hair, skin) compare each part with the slot's default; hair is tested with headgear `none`.
7. **Starter-only unlock data is enough for 7.9.** A shared helper lists the starter part ids per slot (7.9 uses it until 7.11 adds owned items) and the default look.
8. **Tests.** Raster tests for AC 3 and AC 6 use a real 2D canvas in Node (see Dev Notes › Raster tests); catalogue tests check the counts (31/10/10, per-slot numbers in `docs/epic-7-decisions.md` › Final catalogue; the Dev Notes table below is the pre-pick plan), unique ids, the M1–M10 mapping and zod rejection of a gameplay field; mute tests check the default is untouched, a chosen colour gets darker and less saturated, and stage 1 adds no dim. Each new test is mutated once (brief 9).
9. **Animated layers (designer 2026-11-24: the propeller spins).** A part may declare an animated layer (`animated: { layer, spinRevPerS }`, one part per layer). The baked body leaves the layer out; the game draws it as its own small sprite on top of the survivor: its texture through `addGeneratedTexture` with a redraw callback, pooled sprites (no per-frame allocation), placed on the head and turned every frame at `spinRevPerS` from `cosmetics.json`. The propeller cap's propeller is the first (2 turns per second). Still pictures draw the layer in at a fixed angle. Tests: spin speed from the catalogue, pose turns with the body, pool limits, repaint after a lost context; dev check `?devlayer=propeller` (dev builds). Later animated items follow the same pattern (Story 7.9 attaches the layer from each player's look).

## Tasks / Subtasks

- [x] **T1 Pick page** (AC 1)
  - [x] Build `docs/art/7-8/parts.html` from `avatar-editor.html`: one card per part (big + game size + night-muted swatch), grouped by slot; starter, milestone and loot marked; a "gameplay signal?" note on the candidates listed in Dev Notes.
  - [x] Publish it for the designer; wait for the picks; record them in `docs/epic-7-decisions.md`. T2–T4 can start on the prototype's shapes meanwhile; T5 ports the picked shapes.
- [x] **T2 Catalogue** (AC 4, 7)
  - [x] `packages/shared/src/config/cosmetics.json` + `cosmetics.ts` (zod schema, typed `Cosmetics`, `STARTER_PARTS`, `DEFAULT_LOOK`), exported from `packages/shared/src/index.ts`.
  - [x] Tests `cosmetics.test.ts`.
- [x] **T3 Night mute** (AC 5)
  - [x] `apps/client/src/render/city/survivorLook.ts`: `ResolvedLook` (part ids + final colours), `resolveLook(look, stage)`, `nightMute(hex)`, `stageDim(hex, stage)`. Pure, no Phaser.
  - [x] Tests `survivorLook.test.ts`.
- [x] **T4 Split `drawSurvivor`** (AC 2, 3)
  - [x] New `apps/client/src/render/city/survivorParts.ts`: `drawTop`, `drawHead`, `drawHair`, `drawPack`, `drawAccent`, `drawSkin`, each `(c, r, partId, colour)`; the default parts reproduce today's shapes exactly.
  - [x] `drawSurvivor(c, r, heldGun?, back?, look = DEFAULT_RESOLVED_LOOK)`: same first four parameters, so `spriteAtlas.ts` needs no change.
  - [x] Copy today's `drawSurvivor` into the test as `legacyDrawSurvivor` (frozen reference).
- [x] **T5 Port the picked parts** (AC 1, 2, 6): all 55, built only from the existing helpers (`circle`, `ell`, `rrect`, `shade`, `outline`).
- [x] **T6 Raster tests** (AC 3, 6, 8)
  - [x] Add `@napi-rs/canvas` as a root devDependency, pinned to **1.1.0** (released 2026-10-30; 1.2.0 is under two weeks old). Tests only; never imported by app code.
  - [x] `survivorParts.raster.test.ts`: AC 3 identity for every survivor frame; AC 6 per-part area at `r` = 14 px.
- [x] **T8 Animated layer: the propeller spins** (AC 9, designer 2026-11-24)
  - [x] `cosmetics.json` `animated` field + schema; `survivorLayers.ts` (drawing, pose, spin); `SurvivorLayerPool.ts` (texture through `addGeneratedTexture`, 4 pooled sprites); `PlayerView.setAnimatedLayer`; `?devlayer=propeller`.
  - [x] Tests `survivorLayers.test.ts` (+ catalogue and URL tests), each mutated once.
- [x] **T7 Gate and notes**: typecheck, lint, test, build on the branch merged with current master; "Notes for the merge"; list what was not verified.

## Dev Notes

### What exists today (read before changing)

- `apps/client/src/render/city/spriteArt.ts:211` `drawSurvivor(c, r, heldGun?, back?)`. Shapes and colours (all `CHAR`, lines 74–90):
  - back piece (`back`, Story 5.4) drawn first and **replaces** the backpack;
  - held gun (`heldGun`, Story 5.3) or the plain `CHAR.gun` bar;
  - arms: two `CHAR.jacket` strokes, width `0.3 r`, round caps;
  - backpack: `rrect(-0.98 r, -0.48 r, 0.5 r, 0.96 r, 0.15 r)` in `CHAR.pack`;
  - body: `ell(-0.05 r, 0, 0.52 r, 0.9 r)` in `CHAR.jacket`, outlined;
  - head: `circle(0.12 r, 0, 0.4 r)` in `CHAR.survivorSkin`, outlined;
  - cap: `ell(0.02 r, 0, 0.36 r, 0.4 r)` + brim half-ellipse at `0.38 r`, in `CHAR.cap`. No hair is drawn (the cap covers it), so the default headgear `cap` has `hidesHair: true`.
- Line state matters for pixel identity: `lineJoin = "round"`, outline width `max(1, 0.08 r)`, and the arm stroke changes `strokeStyle`, `lineCap` and `lineWidth` and then sets them back. Keep the exact sequence.
- Callers: only `spriteAtlas.ts:201–205` (atlas frames at `CHAR_R_PX` = 34, frame size `2 × CHAR_EXTENT_R.survivor × r`). `PlayerView.ts` only tints the atlas frame (downed, slowed). Nothing else draws a survivor.
- Existing canvas tests use **recording stand-ins** (`recordCanvas.ts`, `probeCanvas.ts`, `weaponArt.test.ts`); there is no rasterizer in the repo, so AC 3 and AC 6 need T6.

### Default look and slot counts (from `avatar-editor.html`, lines 145–171)

| Slot | Starter | Milestone | Loot | Default |
| --- | --- | --- | --- | --- |
| top (colour: top) | jacket, hoodie, coat, track, puffer | leather (m5), camo (m6) | floral, robe | jacket, colour `CHAR.jacket` |
| head | none, cap, capb, beanie, hood, bandana, bike, hard | fire (m1), riot (m2), gas (m3), hockey (m4) | cone, chef, pot, party, bunny | cap |
| hair (colour: hair) | short, buzz, tied, curly, bald | – | – | short |
| pack | backpack, duffel, frame, sling, none | guitar (m9), ammo (m10) | teddy, cooler | backpack |
| acc (colour: accent) | none, scarf, stripes, patch | harness (m7), team (m8) | cape | none |
| skin | 8 presets, preset 1 = `CHAR.survivorSkin` | – | – | preset 1 |
| **Total** | **35** | **10** | **10** | |

Milestones (proposal § 6): m1 survive wave 5, m2 first Downtown extraction, m3 kill the Behemoth, m4 endless wave 15, m5 25 revives, m6 1,000 kills, m7 100 barricades, m8 extract with all 4 alive, m9 20 runs, m10 wave 10 without going down. The rules are Story 7.11's; this story only stores `milestone:mN`.

Keep ids ≤ 8 characters: Story 7.9's look code (`v1|top:…|head:…|hair:…|pack:…|acc:…|skin:N|c:rrggbb,rrggbb,rrggbb`) must fit 96 characters.

### Gameplay-signal candidates for the pick (AC 1)

Ask the designer to check these: **riot**, **bike** and **hard** helmets (could read as armor, FR48), **stripes** (reflective strips might read as a flashlight glint in blackout), **ammo** rig (could read as gear), **gas** mask (could read as Bloater-gas immunity), any **red** item on the top (Runner shirts are dark red, Story 3.8).

### Night mute (AC 5)

- `CHAR` colours are hand-darkened for the night because characters are drawn above the lightmap (D5). A chosen colour has to be darkened the same way so that "neon pink" becomes "neon pink at night".
- Recommended start: in HSL, lightness × 0.62 and saturation × 0.8 (`look.nightMute`), tuned on the pick page until a picked colour sits next to the `CHAR` set. `look.stageDim` = `[1, 0.96, 0.92, 0.88, 0.84]` (multiplies lightness; stage 1 = 1). These are look values, not gameplay numbers, so they live in `cosmetics.json`, not in balance.
- Default parts store their in-game colour (`CHAR`) and skip `nightMute`, so AC 3 holds exactly. `stageDim` at stage 1 is the identity.

### Raster tests (AC 3, 6)

- `@napi-rs/canvas` 1.1.0 gives a real Canvas 2D in Node with prebuilt binaries (no system libraries), so it runs in CI (`.github/workflows/ci.yml`: `npm ci`, `npm test`, Node from `.nvmrc` = 26). Cast its context to `CanvasRenderingContext2D` in the test only.
- AC 3: for each survivor frame, draw with `legacyDrawSurvivor` and with the new `drawSurvivor` on two same-size canvases and compare `getImageData` byte for byte (exactly 0 differing bytes).
- AC 6: count pixels whose RGBA differs by more than 8 in any channel between the look with the part and the look with that slot at "none" (or the default); pass if ≥ 40, or if the alpha outline (set of pixels with alpha > 0) changed.
- If `@napi-rs/canvas` fails to install in CI, stop and say so; don't switch to a recording mock for these two ACs (it can't count pixels).

### Architecture compliance

- `packages/shared` stays engine-free: the catalogue and zod schema only, no drawing (ADR-03). Drawing stays in `apps/client/src/render/city/*` (architecture § Assets).
- No new texture in the game: the atlas frames keep their names and sizes, so `noUnregisteredTextures.test.ts` and `atlasLayout.test.ts` must stay green unchanged. The pick page is a doc and has its own canvases.
- Balance files load into one versioned `Balance`; `cosmetics.json` sits next to them in `config/`, not in `config/balance/`, so it doesn't bump the balance version (a new hat must not force "Please refresh").

### Files

- New: `packages/shared/src/config/cosmetics.json`, `packages/shared/src/config/cosmetics.ts`, `cosmetics.test.ts`; `apps/client/src/render/city/survivorParts.ts`, `survivorLook.ts`, `survivorLook.test.ts`, `survivorParts.raster.test.ts`; `docs/art/7-8/parts.html`, `docs/art/7-8/README.md`.
- Changed: `apps/client/src/render/city/spriteArt.ts` (`drawSurvivor` delegates to the parts); `packages/shared/src/index.ts` (exports); root `package.json` (+ devDependency); `docs/epic-7-decisions.md` (picks).
- Not changed: `spriteAtlas.ts`, `PlayerView.ts`, any server, room, schema or database code.

### Notes for later stories

- **7.9** encodes and decodes the look code, checks ownership with `STARTER_PARTS`, adds the `look` column, and draws per-player canvas textures (≤ 4 per run, through `addGeneratedTexture`); it decides when stage dim redraws them.
- **7.10** reuses `survivorParts.ts` and `survivorLook.ts` for the editor previews.
- **7.11** turns `milestone:mN` into rules and adds owned items.

### References

- [Source: _bmad-output/planning-artifacts/epics.md › Story 7.8, FR89]
- [Source: docs/ideas/customization/proposal.md § 2–4, § 6, § 7 "How it is drawn", § 9]
- [Source: docs/ideas/customization/avatar-editor.html lines 145–171 (part lists)]
- [Source: apps/client/src/render/city/spriteArt.ts lines 74–90, 207–263]
- [Source: apps/client/src/render/city/spriteAtlas.ts lines 24–54, 142–145, 201–205]
- [Source: _bmad-output/planning-artifacts/game-architecture.md › Assets, Balance data, ADR-03]
- [Source: docs/epic-6-brief.md lines 1, 9, 10, 12, 13, 18, 19, 20]
- [Source: _bmad-output/implementation-artifacts/5-28-early-weapon-card-art.md (art-pick pattern, `WEAPON_ART` vs icon-only art)]

## Open questions (for the designer, non-blocking)

1. **Stage dim:** should survivors get darker at later decay stages (proposal § 4.2 says yes; nothing does it today)? The story provides the numbers with stage 1 unchanged; Story 7.9 applies them. Recommended: yes, with the defaults above.
2. **Gameplay-signal candidates:** keep, redraw or drop each one in the list above (asked on the pick page).

## Dev Agent Record

### Agent Model Used

### Debug Log References

- Mutation checks (brief 9), one per new test, all killed: M1 item made loot (3 failed); part schema not `.strict()` (gameplay field accepted, 1 failed); duplicate-id check off (1); `STARTER_PARTS` includes milestones (1); no night mute (1); default colours muted again (2); stage dim off by one (4); mute keeps saturation (1); arms leave a round line cap (AC 3, 9 frames failed); backpack drawn under the flamethrower tanks (AC 3, 1 frame failed). Earlier: head radius 0.4 → 0.41 r failed 9 of 9 frames (≈ 590 bytes each).
- Mutation checks after the port (raster tests): headphone cups not drawn → killed (AC 6); cap logo shade changed → killed (digest pin; AC 3 alone could not see it, so the pin was added); hair drawn under every headgear → killed (10 failed); default backpack outlined → killed (9 frames); flat top draws nothing → **survived** AC 6, so the pairwise "told apart" test was added → killed (flattop vs bald); camo sleeves in the top colour → **survived** (a sleeve colour change is not something the size rules can see; accepted, the contact sheet shows it).
- Local Node is 22.23 (`.nvmrc` says 26); `@napi-rs/canvas` 1.1.0 installed from prebuilt binaries and ran under 22.

### Completion Notes List

- Story context created 2026-11-24: comprehensive developer guide, status ready-for-dev.
- T1: pick page `docs/art/7-8/parts.html` published (claude.ai/artifact/3nHH149x7jJhYBfFeqi7Ym); picks save to the page's store (`picks/<slot>_<id>`). Default parts drawn as today's survivor (prototype hands, backpack strap, jacket panel dropped for AC 3). Gameplay-signal candidates each have a safer B drawing. Six prototype parts enlarged to pass 40 px²; team patch moved to the shoulder. Waiting for the designer's picks before T5.
- T2: `cosmetics.json` (55 parts, look factors, default look), `cosmetics.ts` (strict zod schema + cross checks, `COSMETICS`, `DEFAULT_LOOK`, `STARTER_PARTS`, `cosmeticPart`), exported from shared. Not in `Balance`, not in the balance version (test).
- T3: `survivorLook.ts`: HSL night mute (L × 0.62, S × 0.8), stage dim (stage 1 returns the same string), `resolveLook` (unknown ids fall back to the default part; picker colours equal to the default colour are not muted), `DEFAULT_RESOLVED_LOOK` = the `CHAR` colours.
- T4: `survivorParts.ts` (`drawArms` + `drawTop` for the top slot, because the backpack sits between arms and body; `drawPack`, `drawAccent`, `drawSkin`, `drawHair`, `drawHead`); `drawSurvivor` gains `look = DEFAULT_RESOLVED_LOOK`, `spriteAtlas.ts` unchanged. AC 3 raster test green for all 9 survivor frames (0 differing bytes).
- **Designer picks, three rounds** (`docs/epic-7-decisions.md` › Survivor parts (7.8); pages `docs/art/7-8/parts.html`, `round-2.html`, `round-3.html`, published claude.ai/artifact/3nHH149x7jJhYBfFeqi7Ym, …/LVWByCqRkA3vF5DLrHaK9j, …/Rw1Uys1tS9NB6d824JvJr9). Outcome: **51 parts in 5 slots, 31 starter / 10 milestone / 10 loot**; the accent slot is dropped (its picker colour stays for hats and bags); the default cap is a new drawing (round 3 B); round-2 rule "top view with a slight lean" (tall headgear shows its front face).
- **AC changes from the designer's decisions** (folded into AC 2–4 and AC 9 above by `sprint-change-proposal-2026-11-24-survivor-parts.md`): AC 1 picks in three rounds; AC 2 five slots, order back piece → gun → arms → pack → top body → head → hair → headgear (no accent); AC 3 every survivor frame is today's body with only the cap redrawn; AC 4 51 parts, 31/10/10, M1 fire, M2 riot, M3 gas, M4 hockey, M5 headband, M6 camo, M7 planks, M8 laurel, M9 welding mask, M10 golf bag; AC 6 unchanged.
- T5: `survivorParts.ts` draws every picked part with `circle`, `ell`, `rrect`, `shade` plus three local compositions (`wall` for the lean, `seg`, `poly`); fixed colours in `PART_COLOURS` (night colours, through `stageDim`, identity at stage 1; `rgba(…)` colours keep their alpha). Two small changes against the pick page so AC 6 holds in the default colours: puffer ridges 0.07 r and shade −0.4 (page: 0.05, −0.32); tied ponytail 0.33 × 0.15 r (page 0.3 × 0.14). Contact sheet of every part from the game code: `docs/art/7-8/ingame/parts-sheet.png` (`npx tsx docs/art/7-8/sheet.ts`).
- T6: raster tests (369): AC 3 for all 9 survivor frames (0 differing bytes against today's body + `drawHead("cap")`, and > 100 bytes against today's cap); a digest pin of the default `survivor_body_a` (the picked cap); AC 6 for the 46 non-baseline parts; every pair of parts in a slot differs ≥ 40 px² or the outline at 14 px (the designer's "buzz is the same as short").
- Readability (brief 13): item 49 in `docs/playtests/milestone-1/readability-sheet.md` + key (four survivors with the most gear-like looks; right answer "nothing, just looks").
- In-game check: solo dev build on port 5478 (stopped by PID), headless Chromium, dpr 2: the atlas frame `survivor_body_a` (184 × 184, unchanged size) shows the new cap; no page errors (`docs/art/7-8/ingame/`, `shots.cjs`).
- T7 gate on `story-7-8` merged with master 603099b (Story 6.3): typecheck 0, lint 0, test 332 files / 3094 passed / 3 skipped (285 s), build OK (the > 1600 kB chunk warning was there before). `@napi-rs/canvas` is not in the client bundle.

- T8 (designer 2026-11-24, the propeller spins): `cosmetics.json` part `prop` declares `animated: { layer: "propeller", spinRevPerS: 2 }` (schema: one part per layer). `survivorLayers.ts` draws the propeller, gives its per-frame pose (anchor turned with the body + spin, written into a reused object) and its still drawing; `drawSurvivor(…, layers = false)` leaves it out of a baked body. `SurvivorLayerPool` draws the texture `survivorlayer_propeller_a` once through `addGeneratedTexture` and makes 4 hidden sprites; `PlayerView.setAnimatedLayer(pool, id)` takes one, moves and turns it in `update`, follows the body's depth, tint and visibility, and gives it back on `destroy`. `GameScene` makes the pool on first use (`?devlayer=propeller`, dev builds). Seen in a dev run: `docs/art/7-8/ingame/7-8-propeller-a.png` / `-b.png` (120 ms apart, the blades turned). Mutations (6): speed not from the catalogue, anchor not turned, not hidden when out, not given back, baked into the body, repaint draws nothing → all killed.
- Merged master d41add5 (Epic 6 round 1: 6.1, 6.3, 6.5); readability item renumbered to **49** (6.5 uses 47–48).
- Gate 2 on `story-7-8` merged with master d41add5: typecheck 0, lint 0, test 348 files / 3223 passed / 3 skipped (279 s), build OK; load average on this 4-CPU container ≤ 0.66 during typecheck/lint, 3.68 (1 min) at the end of the test run. `@napi-rs/canvas` not in the client bundle.

### Notes for the merge

- `packages/shared/src/index.ts`: one new export block (cosmetics), next to devBalance; master's 6.3 exports merged cleanly.
- `apps/client/src/render/city/spriteArt.ts`: `drawSurvivor` gains a 5th parameter `look` (default = the default survivor) and delegates to `survivorParts.ts`; the first four parameters are unchanged, so `spriteAtlas.ts` is untouched. The default survivor's cap changes in game (designer's pick) — every other pixel is today's.
- `package.json` / `package-lock.json`: devDependency `@napi-rs/canvas` 1.1.0 (tests only).
- `docs/playtests/milestone-1/readability-sheet.md` / `readability-key.md`: conflicted with 6.3 (46) and 6.5 (47–48); mine is **49**.
- `docs/epic-7-decisions.md`: new section "Survivor parts (7.8)" at the end.
- For **7.9**: the look code drops `acc` (5 slots + 3 colours); `resolveLook(look, stage)` and `DEFAULT_RESOLVED_LOOK` are ready; open question from the designer: animated parts (a spinning propeller) as an extra small sprite.
- For **7.10**: no shop by design (D3); the editor tiles are drawn from these parts (each round-2/3 card shows a 64 px tile). The designer asked whether a "shop view" is planned; dedicated item art would be a course correction.

### Not verified

- A real phone (only headless Chromium; the pages and the solo shot were not opened on a device).
- CI on Node 26: everything here ran on Node 22.23; `@napi-rs/canvas` 1.1.0's prebuilt binary and the frame digest pin are only proven on this Linux x64 container. If CI's raster differs, the digest test fails first (update the value from the CI log after looking at the picture).
- `?stress=150` FPS (brief 12): not run; the atlas frames keep their names and sizes and no texture was added, so no FPS change is expected, but it was not measured.
- The look in a networked game: 7.8 draws only the default look in game (7.9 adds per-player looks).
- Picks were read from the designer's chat replies; the pages' stores were empty when checked (the designer pasted text instead).
- No fresh-agent review yet (brief 19): the story goes to code review next.

### File List

- `docs/art/7-8/parts.html`, `round-2.html`, `round-3.html`, `README.md`, `sheet.ts`, `shots.cjs`, `ingame/parts-sheet.png`, `ingame/7-8-solo-800x360-dpr2.png`, `ingame/7-8-atlas-survivor_body_a-x3.png` (new)
- `docs/epic-7-decisions.md` (Survivor parts (7.8) section)
- `docs/playtests/milestone-1/readability-sheet.md`, `readability-key.md` (item 49), `objects/49_survivor_looks.png` (new)
- `packages/shared/src/config/cosmetics.json`, `cosmetics.ts`, `cosmetics.test.ts` (new)
- `packages/shared/src/index.ts` (exports)
- `apps/client/src/render/city/survivorLook.ts`, `survivorLook.test.ts`, `survivorParts.ts`, `survivorParts.raster.test.ts` (new)
- `apps/client/src/render/city/spriteArt.ts` (`drawSurvivor` delegates to the parts)
- `package.json`, `package-lock.json` (`@napi-rs/canvas` 1.1.0, dev)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (7-8 → review)
- `apps/client/src/render/city/survivorLayers.ts`, `apps/client/src/render/SurvivorLayerPool.ts`, `apps/client/src/render/survivorLayers.test.ts` (new); `apps/client/src/render/PlayerView.ts`, `apps/client/src/scenes/GameScene.ts`, `apps/client/src/debug/urlOptions.ts` (+ test) (T8)
- `_bmad-output/planning-artifacts/epics.md` (Stories 7.8–7.12, FR89), `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-24-survivor-parts.md` (new), `docs/ideas/customization/proposal.md` (superseded notes)

## Change Log

- 2026-11-24: Story 7.8 implemented: pick page + three designer rounds, catalogue (51 parts, 5 slots), night mute and stage dim, `drawSurvivor` split into per-slot parts with the picked drawings (new default cap), raster tests (AC 3, AC 6, pairwise), readability item 47; merged master 603099b; full gate green. Status → review.
- 2026-11-24: Survivor-parts course correction: AC 2–4 rewritten to the designer's picks, AC 9 + T8 the spinning propeller (first animated layer); merged master d41add5; readability item 49.
