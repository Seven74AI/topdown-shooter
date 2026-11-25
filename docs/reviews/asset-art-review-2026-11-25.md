# Asset / art reviews — 2026-11-25

## Wall silhouettes review

Light review (one checker) of designer pick C "silhouette" (`docs/art/occlusion/compare.html`): branch
`claude/dazzling-meitner-zhu5p0` @ `002eaa7` (= master `c26d1bc` + `873ef5e`; merging current master into it was a
no-op). Reviewed on `review-silhouette`. No code changed.

**Verdict: changes needed before master. One medium perf finding (the Mask filter); the rest are low or nits. The
colour is a designer-confirmation item, not a defect.**

Ran: `npm ci`, `npm run typecheck` (green); `wallSilhouette.test.ts`, `wallSilhouetteWiring.test.ts`,
`noUnregisteredTextures.test.ts`, `hudLayout.test.ts`: 4 files / 55 tests green. No full gate.

### Perf (headless in this container: SwiftShader, so GPU work lands on the CPU; not a phone)

Solo dev build, branch on Vite :5894, master worktree on :2894, `?stressbuild=fort`, 844 × 390 at DPR 2, 10 s warm-up,
then CDP `Emulation.setCPUThrottlingRate 4`, 6 s settle, 12 s rAF count. Load 0.85–2.0 (4 cores).

| configuration | FPS (runs) | frame p95 ms | silhouettes shown (mean / max) | pool |
| --- | --- | --- | --- | --- |
| master, `?stress=20` | 19.0, 18.5 | 66.7 | – | – |
| branch, `?stress=20` | 13.3, 14.1, 13.4, 14.4 | 83–100 | 6–10 / 12 | 11–12 |
| branch, `?stress=20`, `addMask` line removed (experiment) | 19.5, 18.5 | 66.7 | 6–7 / 10 | 12–14 |
| branch, `?stress=20`, `updateWallSilhouettes()` removed | 20.2 | 66.7 | 0 | 0 |
| master, `?stress=150` | 15.5 | 83.3 | – | – |
| branch, `?stress=150` | 11.6 | 100.1 | 36 / 41 | 41 |

Nearly all of the cost (about 5 FPS, −25 %, roughly 20 ms per frame at 4× throttle) is the layer's Mask filter. The
silhouette images and the per-frame bookkeeping cost little by comparison. The stress scene puts walkers inside the
fort, so silhouettes (and the mask) are on almost every frame. The same is true of any real fort fight: a survivor
inside a closed fort stands north of its south wall, so counts as "behind" it. Heap delta not measurable
(`performance.memory` is not exposed headless).

### Findings

**M1 (medium, perf): `apps/client/src/render/WallSilhouetteView.ts:35` (+ `:95–104`).**
`layer.filters.external.addMask(container of wall copies)` renders the wall container to an off-screen target and runs
a full-layer mask pass on every frame someone is behind a wall. Headless at 4× throttle that costs 25 % of the FPS with
20 zombies (18.75 → 13.85 FPS, p95 67 → 83–100 ms), and 25 % at 150. On the Mi 11i that means extra full-screen
fill-rate on every frame of a fort fight (brief line 12: the effect must be cheap and capped). It also runs in a
blackout, where the darkness (11.7) covers the silhouettes completely. A screenshot at `?blackout=5` had 13 silhouettes
"shown" and none visible, so the pass is wasted there.
*Minimal fix:* drop the Mask filter. Clip each silhouette to the wall picture that covers it with `setCrop` (the walls
are near-rectangles; the wood wall's ragged top edge is a few px), or draw the silhouette only below the wall's top
line. Skip the update entirely when the darkness is at blackout strength. Re-measure against the master row above.

**Colour rule (designer-confirmation item, not a defect).** Brief line 24 and decision 7-UI-3 keep red for boss
danger in play. The option C that the designer picked on the comparison page is itself red:
`docs/art/occlusion/src/occ.ts:152` uses `rgba(255,92,72,1)` for zombies and `rgba(96,176,255,1)` for survivors, and
its caption says "red for zombies, blue for survivors". The build matches the pick exactly (0xff5c48 / 0x60b0ff). Ask
the designer to confirm red against the rule. In play the red shapes also sit right next to the walls' red damage-bar
segments (fort screenshot). If they change it, the alternatives are the zombie-eye amber or off-white, or a desaturated
warm grey.

**L1 (low, co-op readability): `apps/client/src/render/wallSilhouette.ts:20`, `WallSilhouetteView.ts:72`.** Every
survivor silhouette is the same blue 0x60b0ff, which is close to slot 0's 0x3d8bff. In co-op, an orange, green or
purple teammate behind a wall reads as "player 1". *Fix:* tint survivor silhouettes with `SLOT_COLORS[slot]` (the
ring colour) and pass the slot through `SilhouetteBody`. The page only showed one survivor, so this is also a designer
check.

**L2 (low, cap): `WallSilhouetteView.ts:59–64`.** The silhouette pool has no cap and never shrinks. It reached 41
images at `?stress=150`, one per body behind a wall. Rule 12 wants pooled *and capped*. *Fix:* a cap (e.g. 24) in
the balance/look JSON, keeping either the bodies nearest the camera centre or simply the first N.

**L3 (low, tests): `tools/checks/wallSilhouetteWiring.test.ts`.** Mutations: removing the `baseY` test (caught),
removing the left-edge overlap test (caught), removing the `updateWallSilhouettes()` call (caught). **Removing
`addMask(...)` passes every test**, and without it the silhouettes would glow over open street too. *Fix:* assert that
the view masks its layer: a source check for `addMask(this.maskWalls)`, or for whatever replaces it after M1.

**N1 (nit, allocation): `apps/client/src/scenes/GameScene.ts:308–329`.** The comment says "no allocation once warm".
In fact the `put` arrow and the `forEachShown` callback are new closures every frame, and `this.silBodies.length = n`
throws away pooled entries, which are allocated again when the count rises. *Fix:* hoist `put` to a field and keep a
separate count instead of truncating.

**N2 (nit, layering).** Silhouettes draw at `ABOVE_STANDING_DEPTH + 0.01` (10.63). That puts them above the walls
and over the selection outline (10.62), and under the heal plus (11), the fog (11.65) and the darkness (11.7). They do
not leak through the darkness or the fog (checked at `?blackout=5`). In a blackout, survivors are drawn in the teammate
slot (11.74), above the walls, so they are never hidden and their silhouettes do nothing; M1's blackout skip covers
this. Drawing over the selection outline costs a little readability when a wall with a body behind it is selected;
consider 10.615.

**Textures / context loss.** No new canvas texture: the silhouettes reuse the atlas frames, and the mask target is a
render target the renderer owns for the filter, not a generated texture, so `addGeneratedTexture` does not apply.
`noUnregisteredTextures` is green. Not verified: how the filter's render target behaves after a real WebGL context
loss (moot if M1 removes it).
