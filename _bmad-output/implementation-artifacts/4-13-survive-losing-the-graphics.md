---
baseline_commit: cef3f1e4e8e29acaff939decc0109ba67793b58f
---
# Story 4.13: Survive losing the graphics (bug)

Status: review

<!-- Created by gds-create-story (non-interactive) on 2026-11-23 from epics.md › Story 4.13. -->

## Story

As a player on a phone,
I want the game to come back intact after I switch apps,
so that the street, cars, survivors and zombies don't vanish.

(Bug reported 2026-11-23 by the designer's friend on the deployed build: after switching to another app and coming back, every object — his survivor, the zombies and the cars — disappeared; only the floor was visible. **Designer's correction (same day): it happens every time on Android only (the iPhone is fine), and a page reload or closing/reopening the browser DOES fix it.** So the cause is the WebGL context lost on backgrounding (Android Chrome) and not restored correctly; the Canvas-renderer fallback is not the cause, only a secondary item.)

## Acceptance Criteria

1. **Context restore rebuilds every generated texture.** Given the browser loses and restores the WebGL context (app switch, memory pressure), when the game comes back, then every generated texture — city bake tiles, the character / fx / downtown atlases, the buildings atlas, the fire-particle atlas, the blood-trail mark, and the canvases behind Phaser `Text` objects — is redrawn **from game code** and re-uploaded, and the game looks as before, solo and online (online needs no server message: it is client rendering only).
2. **Robust to the phone's canvas loss.** The rebuild must not rely on the old source canvases still holding pixels (Android Chrome can discard GPU-backed 2D canvas content while backgrounded). Tested by wiping every texture's source canvas before `restoreContext()`; also with a long gap between `loseContext()` and `restoreContext()` and with `document.visibilityState` hidden → visible around it. A 2D canvas `contextrestored` event also triggers the rebuild.
3. **No memory regression.** No extra copies of released canvases are kept; the registry holds only rebuild callbacks (plus the canvases Phaser already references).
4. **Fallback if the context never comes back.** If the context stays lost for a few seconds while the page is visible, a clear overlay says "Graphics were reset — tap to reload" (online: "…your run may be lost: rejoin isn't built yet") and reloads the page on tap. Never a silent floor-only screen.
5. **Canvas fallback (secondary).** Given the browser starts without WebGL (Phaser.AUTO falls back to Canvas), when the game loads, then it still draws and a small dismissible message says "Graphics acceleration is off — fully close and reopen your browser, or try another browser."; the `?debug=1` overlay shows the renderer (WebGL / Canvas) and the stress / network Copy results text includes it.
6. **Evidence.** Unit tests for the registry / rebuild and the renderer detection; a Playwright reproduction (solo dev build, DPR 1) with screenshots in `docs/art/4-13/`: before, after-loss, after-restore, canvas-mode.

## Tasks / Subtasks

- [x] T1 Reproduce (AC 2, 6): Playwright, solo dev build on port 5137; `WEBGL_lose_context` lose/restore; wipe the source canvases to emulate Android; Chromium `--disable-webgl --disable-3d-apis` for Canvas mode; screenshots before the fix.
- [x] T2 Verify Phaser 4.2.1's real behaviour (AC 1, 4): `WebGLRenderer.dispatchContextLost/Restored`, `WebGLTextureWrapper.createResource`, `Core.Events.CONTEXT_LOST`.
- [x] T3 Texture registry (AC 1–3): `render/gfx/textureRegistry.ts` (pure; phases cache → atlas → bake → text; per-entry error isolation; coalesced `requestRebuild`; 2D `contextrestored` listener); unit tests.
- [x] T4 Wire every generated texture (AC 1): `spriteAtlas.ts`, `buildingsAtlas.ts`, `fireFxAtlas.ts` repaint their canvas in place; `CityView` re-bakes on the next update (pattern-tile cache reset); `BloodTrailView` drawn on a canvas instead of `Graphics.generateTexture`; Phaser `Text` objects redrawn.
- [x] T5 Graphics guard (AC 1, 4, 5): `render/gfx/graphicsGuard.ts` — `LOSE_WEBGL` / `RESTORE_WEBGL` listeners, lost-too-long watchdog (visibility-aware), renderer detection; notice store + Preact `GfxNotice`.
- [x] T6 Renderer type in the debug overlay and both Copy results texts (AC 5).
- [x] T7 Playwright evidence after the fix (AC 6) into `docs/art/4-13/`; gate; commit.

## Dev Notes

### EPIC 5 BRIEF (from the Epic 4 retro, §11 of `epic-4-retro-2026-11-23.md`)

```
EPIC 5 BRIEF (from the Epic 4 retro; reviewers: check each line)
1. Own worktree + assigned ports only. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current work branch.
2. Every mechanic is shared sim code (packages/shared) used by server, solo, NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → mirror → Predictor → devThrottle → snapshotWorld).
3. FAIRNESS RULE FIRST: write each mechanic's player-visible rule into the ACs before building (e.g. "standing in a Spitter puddle always hurts at N/s", "a mine never kills its owner's teammates unless friendly fire is on", "a Bloater blast is stopped by cars/bus/buildings").
4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (step out on the damage tick, stack traps, place mines on spawns, flamethrower through cover, swap to dodge reloads) and list every attempt and its result.
5. Projectiles and areas (grenades, spit, flames, blasts, puddles) respect 4.2 cover: car/bus/buildings stop them, barriers/sandbags only stop bodies; server and the client's cosmetic copy agree; rewound (2.12) hits where applicable.
6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged.
7. Spatial code (traps, mines, Brute charges, knockback, new barricades) gets a builder-written fuzz test: random layouts × decay stages × many ticks; no body inside a box, no stall, zombies reach a player, flow fields rebuild only at build start.
8. Randomness only from named seed streams; the card shop uses shop:<slot>:<build>; same seed + input log → same snapshotWorld digest.
9. Liveness: every sim/replay/integration test asserts something really happened (kills by the new weapon, ≥ 1 explosion, ≥ 1 trap trigger). Reviewers mutate each new test once and list which mutations failed.
10. Timers count ticks; no per-tick/per-frame allocation (pool projectiles, puddles, particles); every number in balance JSON, no inline literals.
11. Bandwidth: projectiles and effects go out as events (spawn + seed), not per-tick state; report added B/s; total ≤ 30 KB/s (horde ≤ 24).
12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled, and capped (max live particles/puddles in balance JSON). Run ?stress=150 with the new effects active; report headless FPS before/after with load; the 4.10 phone numbers are the floor, not to be lost.
13. Readability: every new zombie and object must be recognisable at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet.
14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start, on a late Game scene start; client shows server truth (pending until state agrees).
15. Balance: start from the 4.10 earnings decision; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 6-wave sim and assert waves ended.
16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added p99 ≤ 2 ms total budget.
17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently.
18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master.
```

**How it applies.** Client rendering / lifecycle only: no sim, network, map or balance change, so lines 2, 3 (no mechanic), 5–8, 11, 13, 15, 16 hold by construction (0 B/s added). Applies: **1** (worktree `story-4-13`, ports client 5137 / server 4137), **9** (tests assert real rebuilds happened; mutate once), **10** (no per-frame allocation: the guard does nothing per frame; rebuilds only on a restore), **12** (no FPS change expected: nothing added per frame; the atlases are the same), **14** (hidden → visible around the loss), **17** (Phaser 4.2.1 source checked, below), **18** (no real Android phone here: say so), **19**.

### What Phaser 4.2.1 really does (checked in `node_modules/phaser/src`, T2)

- `WebGLRenderer.dispatchContextLost` sets `contextLost = true`, emits `Phaser.Renderer.Events.LOSE_WEBGL` and calls `event.preventDefault()` (so the browser may restore). Rendering calls return early while lost.
- `dispatchContextRestored` re-inits GL state and calls `createResource()` on every texture / buffer / framebuffer / program / VAO wrapper, then emits `RESTORE_WEBGL`. **It does resume.**
- `WebGLTextureWrapper.createResource` re-uploads from `this.pixels` — for our textures, the **source canvas**. If that canvas is blank (released, or its GPU-backed content discarded by Android Chrome while in the background), the texture comes back transparent → invisible sprites.
- `Phaser.Core.Events.CONTEXT_LOST` ("the renderer halts and cannot resume") is a stale Phaser 3.19 doc: nothing emits it in 4.2.1. So the fix is the **real restore path** with a rebuild, and AC 4's overlay is only a safety net.
- `DynamicTexture` / render targets would come back empty; the client uses none (grep).

### Current state of the files this story touches

- `apps/client/src/main.ts` — `Phaser.AUTO`, no context handling. Add `installGraphicsGuard(game)`.
- `render/city/canvasTexture.ts` — `addCanvasTexture` (drops the CanvasTexture pixel copy, 4.9 memory fix — keep), `releaseCanvas`.
- `render/city/spriteAtlas.ts` — `build(specs, draw)` makes a canvas per atlas; `register()` adds it once per game (characters, fx, downtown). `downtownAtlas` module cache feeds the city bake. Canvases are kept (not released).
- `render/city/buildingsAtlas.ts`, `fireFxAtlas.ts` — same pattern, canvases kept.
- `render/city/CityView.ts` — per-run bake tiles (`city_static_<id>_<i>`) + `base` caches + light/glow canvases; `showStage` re-bakes; `destroy` removes textures and releases canvases. Must keep: bake once per stage, late-join rule (`synced`), no per-frame work.
- `render/city/drawCity.ts` — module cache `patternTiles` (noise canvases used as patterns in the bake): must be dropped on a rebuild.
- `render/BloodTrailView.ts` — `Graphics.generateTexture("blood_trail")`.
- `debug/PerfOverlay.ts`, `debug/stressScenario.ts › formatStressReport`, `debug/netSummary.ts › formatNetReport` — add the renderer line.
- `ui/App.tsx` — mount the notice.

### Testing

Vitest (node, no DOM): registry order / isolation / coalescing / contextrestored hook; renderer detection; report formatters with the renderer. Browser evidence with Playwright (Node `require('playwright')`, Chromium headless, DPR 1).

### References

- [Source: _bmad-output/planning-artifacts/epics.md › Story 4.13]
- [Source: _bmad-output/implementation-artifacts/epic-4-retro-2026-11-23.md › §11]
- [Source: node_modules/phaser/src/renderer/webgl/WebGLRenderer.js › dispatchContextLost / dispatchContextRestored]
- [Source: node_modules/phaser/src/renderer/webgl/wrappers/WebGLTextureWrapper.js › createResource]
- [Source: _bmad-output/implementation-artifacts/4-12-stage-objects-in-game-code.md] (previous story: atlases in code, fireFxAtlas)

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), gds-create-story + gds-dev-story, non-interactive.

### Debug Log References

- Phaser 4.2.1 (`node_modules/phaser`, version checked): `WebGLRenderer.dispatchContextRestored` re-creates all GL wrappers and emits `RESTORE_WEBGL`; `WebGLTextureWrapper.createResource` re-uploads from `this.pixels` (the source canvas). `Core.Events.CONTEXT_LOST` is defined but never emitted (stale 3.19 doc). → real restore is possible; chosen over the reload overlay, which stays as a safety net.
- Main session's hypothesis "released canvases" checked: on this branch the atlases' canvases are **not** released (only `CityView.destroy` releases its own tiles), so headless Chromium restored fine **without** the fix (`scratchpad` run 0: before = after-restore). The phone difference is the canvas *content*: Android Chrome may discard GPU-backed 2D canvases in the background. Emulated by wiping every texture source canvas before `restoreContext()` → without the fix the screen came back black except the perf text (`docs/art/4-13/after-restore-without-fix.png`; the HUD texts were gone too).
- Why the friend still saw the floor (hypothesis, not verifiable here): the city tile canvases go through `textures.addCanvas` **empty**, whose constructor does a full `getImageData` — Chrome tends to move a canvas read back like that to CPU memory, so the tiles may survive; the atlases are drawn first (GPU) and read back afterwards. Cars are drawn from the downtown atlas into the bake, so a later re-bake from an emptied atlas would also lose the cars.
- Load (`uptime`): 7.75 at the start of the gate run, 5.02 after the build.

### Completion Notes List

- **Texture registry** (`render/gfx/textureRegistry.ts`, pure): key → rebuild callback, phases cache → atlas → bake → text, per-entry error isolation, coalesced `requestRebuild` hooked to each canvas's 2D `contextrestored`, optional `isIntact` probes (`allIntact`). Holds callbacks only (no pixel copies: AC 3).
- **`addGeneratedTexture`** (`canvasTexture.ts`): paints, adds the texture + frames, registers the repaint (reset the canvas to its size, paint again from code, `tex.refresh()`), plus a probe of up to 6 opaque frame-centre pixels (1-px reads). Used by the characters / fx / downtown atlases (`spriteAtlas.ts`, `build` split into `layOut` + `paintFrames`), `atlas_buildings`, `atlas_firefx` and the blood-trail mark (now drawn with 2D ellipses instead of `Graphics.generateTexture`, same look).
- **City bake**: `CityView` registers a `bake` entry → `invalidateBake()` (drops the noise-pattern cache `resetPatternTiles()`, base key, shown key) so the next `update` bakes everything again after the atlases are back; unregistered in `destroy`. Late-join rule unchanged.
- **Phaser `Text`**: a `text` entry calls `updateText()` on every Text in every scene (HUD texts were blank after the emulated loss).
- **Graphics guard** (`render/gfx/graphicsGuard.ts`, installed in `main.ts`): `LOSE_WEBGL` → status + visibility-aware watchdog (`LostWatchdog`, 5 s of *visible* time) → "Graphics were reset — tap to reload." (online: "… Your online run may be lost (rejoining a run isn't built yet).") that reloads on tap; `RESTORE_WEBGL` → `rebuildAll()`, clears that notice. Back to visible with the context alive but a probe failing → `rebuildAll()`. Canvas renderer → dismissible banner (`CANVAS_MODE_TEXT`). Nothing per frame.
- **Renderer line** (`gfxStatus.line()`: "renderer WebGL · context lost N · restored N"): in the `?debug=1` overlay and in both Copy results texts (stress, network).
- **Browser evidence** (Playwright, headless Chromium, 844 × 390 DPR 1, `docs/art/4-13/reproduce-context-loss.cjs`): every run hides the page (`visibilityState` hidden + event), loses the context, **wipes all 51 source canvases**, waits, shows the page, restores. Solo 1.5 s gap: atlas pixel 0 → 255, 8/8 entries rebuilt, screen identical to before (`before.png`, `after-loss.png`, `after-restore.png`). `?stress=60`, 20 s gap: 60 zombies back (`after-restore-gap20s-stress.png`). Online (server 4137 + host-alone run): same (`after-restore-online.png`). Never restored: reload notice after 5 s visible (`never-restored-online.png`). Wipe with the context kept: rebuilt on visible (probe). Canvas mode (`--disable-webgl --disable-3d-apis`): game draws, banner shown, overlay "renderer Canvas" (`canvas-mode.png`; glow tints show white in Canvas — Phaser's Canvas renderer has no tint — hence "may look wrong").
- **Tests**: `textureRegistry.test.ts` (7), `gfxStatus.test.ts` (7), renderer line in `stressScenario.test.ts` / `netSummary.test.ts`. Mutations: removing the phase sort, the coalescing guard, or the "visible time only" rule each failed one test.
- **Gate**: `npm run typecheck && npm run lint && npm test -- --testTimeout=30000 && npm run build` green (1663 passed, 3 skipped; build's >1600 kB chunk warning is the usual Phaser chunk). `git merge-tree` with `claude/gracious-turing-0db3j6`: clean.
- **EPIC 5 BRIEF 12**: no per-frame work, no new sprite; FPS not re-measured (nothing added to the frame). Probe creation does ~6 one-pixel `getImageData` reads per atlas once (Chrome logs a "willReadFrequently" hint).

### Not verified

- **No real phone.** The Android behaviour (context lost on every app switch, canvases emptied) is emulated in headless Chromium; the friend must re-test on the deployed build. Not tested on a real GPU, iPhone Safari or Firefox.
- Whether Chrome fires 2D `contextrestored` for our off-DOM canvases on Android (covered anyway by the WebGL restore and the visible-probe paths).
- The reload notice's tap-to-reload on a phone (tested only that the notice appears).

### Notes for the merge

- `apps/client/src/main.ts` — one `installGraphicsGuard(...)` call after `installPerfProbe`, three imports, `__gfx` in the DEV block.
- `apps/client/src/render/city/spriteAtlas.ts` — `build` split into `layOut` + `paintFrames`; `register(scene, key, specs, draw)` signature changed. **5.2 / 5.7 / 4.12 fixes**: a new atlas or frame keeps working as long as it goes through `register` / `addGeneratedTexture`; any NEW texture made with plain `addCanvasTexture`, `textures.addCanvas`, `generateTexture` or a RenderTexture will NOT come back after an Android app switch — use `addGeneratedTexture` (or register a rebuild).
- `apps/client/src/render/city/canvasTexture.ts` — `addGeneratedTexture` + probe added (old functions unchanged).
- `apps/client/src/render/city/buildingsAtlas.ts` (5.2 Axe/Chainsaw may add frames here), `fireFxAtlas.ts` (4.12 fixes) — only the registration block changed to `addGeneratedTexture`; drawing code untouched.
- `apps/client/src/render/city/CityView.ts` (4.12 fixes) — registry entry in the constructor, `invalidateBake()`, unregister in `destroy`, import line.
- `apps/client/src/render/city/drawCity.ts` — `resetPatternTiles()` export.
- `apps/client/src/render/BloodTrailView.ts` — `makeTexture` drawn on a canvas.
- `apps/client/src/debug/PerfOverlay.ts`, `stressScenario.ts`, `netSummary.ts` (+ tests) — one renderer line each; `renderer?` optional in both env types.
- `apps/client/src/ui/App.tsx`, `overlay.css` — `<GfxNotice />` and two CSS blocks at the end.

### File List

- `_bmad-output/implementation-artifacts/4-13-survive-losing-the-graphics.md` (new)
- `apps/client/src/render/gfx/textureRegistry.ts` (new)
- `apps/client/src/render/gfx/textureRegistry.test.ts` (new)
- `apps/client/src/render/gfx/gfxStatus.ts` (new)
- `apps/client/src/render/gfx/gfxStatus.test.ts` (new)
- `apps/client/src/render/gfx/graphicsGuard.ts` (new)
- `apps/client/src/ui/GfxNotice.tsx` (new)
- `apps/client/src/main.ts`
- `apps/client/src/render/city/canvasTexture.ts`
- `apps/client/src/render/city/spriteAtlas.ts`
- `apps/client/src/render/city/buildingsAtlas.ts`
- `apps/client/src/render/city/fireFxAtlas.ts`
- `apps/client/src/render/city/CityView.ts`
- `apps/client/src/render/city/drawCity.ts`
- `apps/client/src/render/BloodTrailView.ts`
- `apps/client/src/debug/PerfOverlay.ts`
- `apps/client/src/debug/stressScenario.ts`
- `apps/client/src/debug/stressScenario.test.ts`
- `apps/client/src/debug/netSummary.ts`
- `apps/client/src/debug/netSummary.test.ts`
- `apps/client/src/ui/App.tsx`
- `apps/client/src/ui/overlay.css`
- `docs/art/4-13/` (new): `before.png`, `after-loss.png`, `after-restore.png`, `after-restore-without-fix.png`, `after-restore-gap20s-stress.png`, `after-restore-online.png`, `never-restored-online.png`, `canvas-mode.png`, `reproduce-context-loss.cjs`

## Change Log

- 2026-11-23: Story created (gds-create-story); designer's correction (Android only, reload fixes it) folded in.
- 2026-11-23: Implemented — texture registry + rebuild on WebGL restore / 2D canvas restore / emptied-canvas probe; city re-bake; Text redraw; reload notice if never restored; Canvas-mode banner; renderer in debug overlay and Copy results; tests; Playwright evidence. Status → review.
