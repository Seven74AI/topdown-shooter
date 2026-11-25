# Visual direction (from the designer's asset review, 2026-11-24/25)

A summary for any session designing new art or UI (for example the Epic 7 UI, which the designer found
"too simple, I want something that feels like a premium AAA game").

## 1. The quality bar, in the designer's words

- "something that feels like a premium AAA game"
- "photorealistic, like the ground damage"; "there is detail, it's not cartoonesque"
- "take some inspiration from real cars" (real-world references, real proportions)
- "maybe some details could be turned into animation"
- Method stays **game code** (Canvas 2D), never pre-made images; the designer picks every new look from
  code-drawn proposals before it goes in the game.

## 2. Liked and rejected

**Liked**
- Boss slam ground damage, R1 + R2 + R3 combined (noise height field, tapering straight cracks, dust rays,
  gravel): `docs/art/asset-fixes-1/looks-2.html`; in game: `apps/client/src/render/city/groundDamageArt.ts`.
- Glowing slam warning "S1 glow + sparks + countdown": in game, `apps/client/src/render/BossView.ts`,
  `bossAtlas.ts`.
- Boss warning display **P1** ("just perfect"): red-on-black sci-fi HUD (chamfered neon frames, corner
  brackets, hazard stripes, faint triangle field, skull-in-box glyphs, Oswald caps, flicker). Proposal:
  `docs/art/asset-fixes-1/looks-5.html`; in game: `apps/client/src/render/city/hudWarnArt.ts`,
  `apps/client/src/scenes/BossHud.ts`. The designer's references were red/magenta WARNING / DANGER panels.
- Photoreal street props and vehicles (approved): `docs/art/photoreal-1/compare.html`.
- Characters **take 4** ("now we are talking"): today's drawings kept with every detail, rendered with the
  photoreal look and animated: `docs/art/photoreal-2/take4.html`.

**Rejected**
- Flat neon icon sets ("not bad, still not it"); anything that "looks like stickers".
- Cartoony cracks; rust on a freshly burnt car; shapes that don't match the real thing.
- Characters rebuilt from generic shapes that lose the chosen designs (takes 1 and 3). Lesson: keep the
  designs and every detail, raise the rendering.

## 3. Techniques to reuse

- **Light:** one key light from the upper left (`palette.ts › LIGHT_DIR`), a slightly cool tint
  (0.93, 0.98, 1.06), dark ambient (~0.14), strong contrast, a soft cast shadow down-right.
- **Materials:** the relief renderer `docs/art/photoreal-1/src/relief.ts` (shape layers blurred into volumes,
  engraved seams, noise detail, per-pixel normals, Phong highlight, 3× supersampling, edge occlusion; tint /
  ambient / key / slope options). For UI: bevelled or engraved plates, brushed metal, worn enamel, scratches,
  chipped edges, grime in the crevices.
- **Gloss and glow:** highlights on dark plastic, metal and glass; emissive parts drawn additively with a
  blurred bloom; P1's `neon()` (draw with a wide shadow blur, then crisp on top).
- **Texture:** never flat fills. `docs/art/asset-fixes-1/src/lib.ts` (`fbm`, `rng`, `asphalt`, `night`);
  weave on cloth, aggregate on concrete, mottling on skin.
- **Type:** Oswald 600/700 is bundled in the game (`@fontsource/oswald` 5.3.0, imported in
  `apps/client/src/main.ts`); condensed caps, slight letter-spacing.
- **Colour:** the muted Dead City palette (`apps/client/src/render/city/palette.ts`); red is reserved for boss
  danger. P1 HUD: line `#ff3b30`, accent `#ff6a5a`, panel fill `rgba(40,4,4,0.72)`.
- **Motion:** subtle and continuous. Idle breathing (1–3 % scale), weight shift, glow pulses, pulses
  travelling along lines (Bloater veins), a light sheen drifting over glossy parts, flicker, countdown ticks
  lighting in sequence; crossfaded 10-frame loops for limb animation (`docs/art/photoreal-2/src/take4.ts`,
  `commonz.ts`).

## 4. Where it lives

- Branch `claude/dazzling-meitner-zhu5p0` (Seven74AI/topdown-shooter).
- `docs/art/asset-review.md` (the review page process), `docs/art/photoreal-decisions.md` (decisions per group),
  `docs/art/asset-fixes-1/` (rounds 1–5), `docs/art/photoreal-1/` and `docs/art/photoreal-2/` (pilots, takes 1–4).

**Suggestion for UI:** start from P1's language (the one the designer called perfect) and add material depth:
bevelled, worn plates; glass-like panels with a sheen; emissive edges with bloom and a gentle pulse; Oswald caps.
