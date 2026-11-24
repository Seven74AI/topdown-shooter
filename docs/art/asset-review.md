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

1. `npm run gallery:export` — draws everything, writes `tools/gallery/out/assets.json` (not committed) and
   updates `tools/gallery/manifest.json` (committed: a pixel hash and the date each asset was added/changed).
2. Republish the page to the **same URL** with the Artifact tool: `url` = the link above,
   `file_path` = `tools/gallery/review-page.html`, `files` = `{"assets.json": "tools/gallery/out/assets.json"}`.
   Read the artifact first if this session has not published it.
3. Commit `tools/gallery/manifest.json`.

The page marks art added after the first export **New**, and art whose pixels changed after the designer
reviewed it **Updated** (the note keeps the hash it was written against).

## Reading the designer's notes

The notes live in the page's database, collection `reviews` (one document per asset: `asset`, `status`
`ok` / `change`, `note`, `hash`, `updatedAt`). Read them with the ArtifactData tool (`action: "list"`,
`collection: "reviews"`, `url`: the link above). New looks still follow the usual rule: draw options in code,
the designer picks, then build.
