# Asset review

The designer reviews every code-drawn picture on one page and leaves a note on anything to change.

**Review page:** https://claude.ai/artifact/Eznwmb2BbdSoogcXKKN4Ro (private to the designer; share from its Share menu)

## What is on it

Everything `apps/client/src/gallery/collect.ts` draws with the game's own code: every frame of every
`ensure…()` texture set (characters, boss, street props, buildings, FX, HUD icons, survivor layers) and the
shop's HTML pictures (weapon side views per level, gear, consumables, tier plates). The same pictures, without
notes, are at `/gallery.html` in `npm run dev`.

`tools/checks/galleryCoversAllArt.test.ts` fails when a new `ensure…()` texture builder is not called by the
gallery, so new art can't skip the review.

## Keep it up to date (after any art change, and when new art lands)

1. Build the approved photoreal pages first (`node docs/art/photoreal-1/src/build.mjs`,
   `node docs/art/photoreal-3/src/build.mjs`): the export adds their pictures as the "approved"
   sections (looks approved but not in the game yet). The characters' take 4 (`photoreal-2`) is in the game since
   Story 9.13: its relit sheets (`chars_*`) are exported as the game draws them, grouped as `characters_relit`. The page shows only the accepted version of each picture:
   groups replaced by an accepted look are listed in `SUPERSEDED` in `review-page.html` (today: the current
   characters, street props and things you build). Then `npm run gallery:export` — draws everything, writes `tools/gallery/out/assets.json` (not committed) and
   updates `tools/gallery/manifest.json` (committed: a pixel hash and the date each asset was added/changed).
2. Build the animation script for the animated looks: `node docs/art/photoreal-2/src/build-t4lib.mjs`
   (writes `tools/gallery/out/take4-anim.js`; the page plays take 4's animation on those cards).
   Republish the page to the **same URL** with the Artifact tool: `url` = the link above,
   `file_path` = `tools/gallery/review-page.html`, `files` = `{"assets.json": "tools/gallery/out/assets.json",
   "take4-anim.js": "tools/gallery/out/take4-anim.js"}`.
   Read the artifact first if this session has not published it.
3. Commit `tools/gallery/manifest.json`.

The page marks art added after the first export **New**, and art whose pixels changed after the designer
reviewed it **Updated** (the note keeps the hash it was written against).

## Reading the designer's notes

The notes live in the page's database, collection `reviews` (one document per asset: `asset`, `status`
`ok` / `change`, `note`, `hash`, `updatedAt`). Read them with the ArtifactData tool (`action: "list"`,
`collection: "reviews"`, `url`: the link above). New looks still follow the usual rule: draw options in code,
the designer picks, then build.

## Related

Photoreal rework decisions per group (what was approved, what stays as it is): `docs/art/photoreal-decisions.md`.
