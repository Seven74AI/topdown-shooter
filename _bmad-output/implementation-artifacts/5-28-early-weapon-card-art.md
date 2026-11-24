# Story 5.28: Early weapon card art

Status: review

(Added 2026-11-24: designer picks in `docs/epic-5-decisions.md` › "Early weapon card art"; page claude.ai/artifact/7MPKNLcAPBgPjiATVK4Cok, code `docs/art/5-13/early-weapons.html` › `EARLY`. Follows Story 5.13, the card shop.)

## Story

As a player,
I want the SMG, Hunting Rifle and Machete cards to show the weapon like every other card,
so that the shop reads as one set.

> EPIC 5 BRIEF applies; most relevant: **20** (textures through `addGeneratedTexture`: these icons are DOM `<img>` data URLs, no Phaser texture, so nothing new to register), **9** (mutate each new test once), **18** (say what was not verified). Client art + `ShopScreen.tsx` only: no message, schema, server or shared change; 0 B/s.

## Acceptance Criteria

1. `smgS1`, `rifleH1`, `macheteM1` (with their helpers `rod`, `bladeEdge`, `hole`, `scope`) are ported into `render/city/weaponArt.ts` as `drawSmg`, `drawHuntingRifle`, `drawMachete`: same shapes, colours and proportions, built only from the existing helpers; `ICON_Y` 0.44 / 0.5 / 0.5.
2. Icon view only: the survivor still holds the plain gun for these weapons (no new `survivor_<weapon>_a` frame).
3. The 5.13 card shop shows them; the `KindGlyph` pictogram is removed (every shop weapon and gear item has art).
4. Tests: every weapon in the card catalog has side-view art; the three are icon-only; each icon draws and leaves the context balanced. Each new test mutated once.
5. Screenshots of the card shop with the three cards at 800 × 360 and 568 × 320 in `docs/art/5-28/`.

## Tasks / Subtasks

- [x] **T1 Port** the three drawings + 4 helpers into `weaponArt.ts` (TS types only; two `as const` tuple lists); `WEAPON_ICON_ART` map, `hasWeaponIcon`, `ICON_Y` entries; `weaponIconUrl` draws from either map. (AC 1–2)
- [x] **T2 Shop**: `ShopScreen.tsx` drops `KindGlyph`. (AC 3)
- [x] **T3 Tests** `render/city/weaponArt.test.ts` (3 tests, recording-context mock). (AC 4)
- [x] **T4 Shots** `docs/art/5-28/shots.cjs`, `README.md`, 2 PNGs; gate. (AC 5)

## Dev Notes

- **Deviation from the build note "into `WEAPON_ART`"**: `WEAPON_ART` keys also build the survivor's held frames (`spriteAtlas.ts › SURVIVOR_WEAPON_FRAMES`), so an icon-only entry there would have drawn the survivor with no gun for these weapons. The three go into a separate `WEAPON_ICON_ART` (`(c, size)`, the tier-icon form) instead; `spriteAtlas.ts` untouched.
- **Variants not ported** (S2/S3, H2/H3, M2/M3): the 5.1 rule makes a weapon's second look its III–IV look, but the designer did not say which variant is the III look (or IV), and wrote "can go … or wait for skins". Left for a designer pick; the drawings stay in `early-weapons.html`.
- `overlay.css › .shop-card__glyph*` is now unused; left in place because Story 5.21+5.22 is editing the overlay styles in parallel (two rules to delete later).
- The upgrade list rows (`weaponIconUrl(u.weapon, u.level)`) now also show art for these weapons, at every level (no tier look yet).

### Notes for the merge

- Touches only `weaponArt.ts`, its new test, `ShopScreen.tsx` (Card + removed `KindGlyph`), docs and tracking.

## Dev Agent Record

### Completion Notes

- Gate (one full run, `npm run typecheck && npm run lint && npm test && npm run build`): green: 306 test files, 2546 tests (3 skipped), build OK. A first run stopped at typecheck (implicit `any` on the ported path lambdas, a closure-narrowed `o.shade`, `fillP` taking a gradient): typed, `fillP` widened to `string | CanvasGradient`; no drawing change.
- Mutations (each caught, file restored): M1 drop `machete` from `WEAPON_ICON_ART` → catalog test + icon-only test fail; M2 add `smg` to `WEAPON_ART` → icon-only test fails; M3 drop `drawMachete`'s final `restore` → balance test fails.
- Shots: both sizes, 3 early cards with `<img>` art, no pictogram, no page errors.

### File List

- `apps/client/src/render/city/weaponArt.ts` (modified)
- `apps/client/src/render/city/weaponArt.test.ts` (new)
- `apps/client/src/ui/ShopScreen.tsx` (modified)
- `docs/art/5-28/` (new: `shots.cjs`, `README.md`, 2 PNGs)
- `_bmad-output/implementation-artifacts/5-28-early-weapon-card-art.md`, `sprint-status.yaml`, `_bmad-output/planning-artifacts/epics.md`
