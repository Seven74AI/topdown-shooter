---
baseline_commit: 8e226d1610ad352b988ed99eaddd29b28d4f268e
---
# Story 7.8: Survivor parts in game code

Status: in-progress

(Created 2026-11-24 after the Epic 7 readiness check, `_bmad-output/planning-artifacts/implementation-readiness-report-2026-11-24-epic-7.md`, and its fixes, `sprint-change-proposal-2026-11-24-epic-7-readiness.md`. Source design: `docs/ideas/customization/proposal.md` D1–D7, O1–O6; prototype `docs/ideas/customization/avatar-editor.html`. FR89.)

## Story

As a player,
I want my survivor to be built from parts I can swap,
so that customization is possible without new image files.

> **Brief.** Epic 7 has no brief of its own yet. These lines of the EPIC 6 BRIEF (`docs/epic-6-brief.md`) apply as written; reviewers check each one: **1** (own cloud session, branch `story-7-8`, assigned ports, one full gate at the end), **9** (every new test is mutated once and the result listed), **10** (no per-frame allocation; look numbers in data, no inline literals for colours or mute factors), **12** (atlas frames ≤ 2048², `category_name_variant`), **13** (readability: a part must never look like a gameplay signal), **18** (say plainly what was not verified), **19** ("Notes for the merge" per shared file; fresh-agent re-review of every medium/high fix), **20** (every code-drawn texture goes through `addGeneratedTexture`; `tools/checks/noUnregisteredTextures.test.ts` stays green).
>
> **Scope:** client art (`apps/client/src/render/city/`), a new catalogue in `packages/shared`, a pick page in `docs/art/7-8/`, tests. **No** room, schema, message, server or database change; **0 B/s**. The look code, the join and per-player textures are Story 7.9; the editor screen is 7.10. In this story the game still draws only the default look, which must be exactly today's survivor.

## Acceptance Criteria

1. **Art pick first.** Before any part is ported, the designer picks the part looks from a code-drawing page `docs/art/7-8/parts.html` (built from `docs/ideas/customization/avatar-editor.html`; published as an artifact like earlier art picks). The page shows every part big **and** at game size (35 px per metre, 0.4 m body radius, on wet asphalt, slot ring, a few zombies), each with its night-muted colour. Every part passes the "no gameplay signal" check: no armor plates, red-cross bags, shoulder lights, zombie skin or Runner shirts (proposal § 4.4). The picks are recorded in `docs/epic-7-decisions.md` › "Survivor parts (7.8)".
2. **Parts split.** `drawSurvivor` in `apps/client/src/render/city/spriteArt.ts` is drawn from one function per slot: top (body + arms), headgear, hair, backpack, accent, skin (head). Draw order stays today's: weapon back piece → held gun → arms → backpack → top body → accent → head (skin) → hair → headgear. The held gun stays its own layer under the arms (Story 5.3), and a weapon's back piece still replaces the backpack (Story 5.4, FT1's tanks).
3. **Default look = today's survivor, pixel for pixel.** With the default look (top `jacket` in `CHAR.jacket`, headgear `cap`, hair `short` hidden under the cap, backpack `backpack`, accent `none`, skin preset 1 = `CHAR.survivorSkin`), every survivor atlas frame (`survivor_body_a`, each `survivor_<weapon>_a`, `survivor_chainsaw_b`) is pixel-identical to the frame drawn by today's `drawSurvivor` (raster test, AC 8).
4. **Catalogue.** `packages/shared/src/config/cosmetics.json` (zod-validated, loaded like the balance files but **not** part of `Balance` and not in the balance version) lists **55 parts**: 35 starter, 10 milestone, 10 loot (proposal § 3, § 6). Each has `id` (lowercase, ≤ 8 characters, unique per slot), `slot` (`top | head | hair | pack | acc | skin`), `name`, `colour` (`none | top | hair | accent`, which picker colour it takes), `unlock` (`starter | milestone:m1 … milestone:m10 | loot`), and for headgear `hidesHair`. Skin parts carry their preset colour. No gameplay numbers.
5. **Night mute.** A pure function turns a chosen colour into its in-game colour (darker and slightly desaturated, factors in `cosmetics.json` › `look.nightMute`) plus a per-stage dim (`look.stageDim[1..5]`, stage 1 = no extra dim). The default look's colours are the `CHAR` constants, which are already muted (D5), so they are not muted again. Today nothing dims survivors per decay stage; this story only provides the stage input (Story 7.9 decides when to redraw). The pick page shows chosen and in-game colour side by side.
6. **Every part shows at game size.** Drawn at 35 px per metre (`r` = 14 px), each non-"none" part changes at least **40 px²** of colour, or the outline, compared with the same look with that slot at "none" (raster test). Slots without "none" (top, hair, skin) compare each part with the slot's default; hair is tested with headgear `none`.
7. **Starter-only unlock data is enough for 7.9.** A shared helper lists the starter part ids per slot (7.9 uses it until 7.11 adds owned items) and the default look.
8. **Tests.** Raster tests for AC 3 and AC 6 use a real 2D canvas in Node (see Dev Notes › Raster tests); catalogue tests check the counts (35/10/10, per-slot numbers in Dev Notes), unique ids, the M1–M10 mapping and zod rejection of a gameplay field; mute tests check the default is untouched, a chosen colour gets darker and less saturated, and stage 1 adds no dim. Each new test is mutated once (brief 9).

## Tasks / Subtasks

- [ ] **T1 Pick page** (AC 1)
  - [x] Build `docs/art/7-8/parts.html` from `avatar-editor.html`: one card per part (big + game size + night-muted swatch), grouped by slot; starter, milestone and loot marked; a "gameplay signal?" note on the candidates listed in Dev Notes.
  - [ ] Publish it for the designer; wait for the picks; record them in `docs/epic-7-decisions.md`. T2–T4 can start on the prototype's shapes meanwhile; T5 ports the picked shapes.
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
- [ ] **T5 Port the picked parts** (AC 1, 2, 6): all 55, built only from the existing helpers (`circle`, `ell`, `rrect`, `shade`, `outline`).
- [ ] **T6 Raster tests** (AC 3, 6, 8)
  - [x] Add `@napi-rs/canvas` as a root devDependency, pinned to **1.1.0** (released 2026-10-30; 1.2.0 is under two weeks old). Tests only; never imported by app code.
  - [ ] `survivorParts.raster.test.ts`: AC 3 identity for every survivor frame; AC 6 per-part area at `r` = 14 px.
- [ ] **T7 Gate and notes**: typecheck, lint, test, build on the branch merged with current master; "Notes for the merge"; list what was not verified.

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
- Local Node is 22.23 (`.nvmrc` says 26); `@napi-rs/canvas` 1.1.0 installed from prebuilt binaries and ran under 22.

### Completion Notes List

- Story context created 2026-11-24: comprehensive developer guide, status ready-for-dev.
- T1: pick page `docs/art/7-8/parts.html` published (claude.ai/artifact/3nHH149x7jJhYBfFeqi7Ym); picks save to the page's store (`picks/<slot>_<id>`). Default parts drawn as today's survivor (prototype hands, backpack strap, jacket panel dropped for AC 3). Gameplay-signal candidates each have a safer B drawing. Six prototype parts enlarged to pass 40 px²; team patch moved to the shoulder. Waiting for the designer's picks before T5.
- T2: `cosmetics.json` (55 parts, look factors, default look), `cosmetics.ts` (strict zod schema + cross checks, `COSMETICS`, `DEFAULT_LOOK`, `STARTER_PARTS`, `cosmeticPart`), exported from shared. Not in `Balance`, not in the balance version (test).
- T3: `survivorLook.ts`: HSL night mute (L × 0.62, S × 0.8), stage dim (stage 1 returns the same string), `resolveLook` (unknown ids fall back to the default part; picker colours equal to the default colour are not muted), `DEFAULT_RESOLVED_LOOK` = the `CHAR` colours.
- T4: `survivorParts.ts` (`drawArms` + `drawTop` for the top slot, because the backpack sits between arms and body; `drawPack`, `drawAccent`, `drawSkin`, `drawHair`, `drawHead`); `drawSurvivor` gains `look = DEFAULT_RESOLVED_LOOK`, `spriteAtlas.ts` unchanged. AC 3 raster test green for all 9 survivor frames (0 differing bytes).

### File List

- `docs/art/7-8/parts.html` (new), `docs/art/7-8/README.md` (new)
- `packages/shared/src/config/cosmetics.json`, `cosmetics.ts`, `cosmetics.test.ts` (new)
- `packages/shared/src/index.ts` (exports)
- `apps/client/src/render/city/survivorLook.ts`, `survivorLook.test.ts`, `survivorParts.ts`, `survivorParts.raster.test.ts` (new)
- `apps/client/src/render/city/spriteArt.ts` (`drawSurvivor` delegates to the parts)
- `package.json`, `package-lock.json` (`@napi-rs/canvas` 1.1.0, dev)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (7-8 in-progress)
