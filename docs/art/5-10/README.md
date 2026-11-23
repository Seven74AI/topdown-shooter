# Story 5.10 art (floodlight, med station)

All art is game code (designer's Epic 5 art method; no Meshy step): Canvas 2D drawings in
`apps/client/src/render/city/propArt.ts`, drawn once into the buildings atlas (`atlas_buildings`,
96 px per metre, registered through `addGeneratedTexture`). Picks: `docs/epic-5-decisions.md` ›
Round D looks; reference drawings: `docs/art/epic-5/round-d/looks.html`.

| Atlas frame | Function | Use | Footprint |
| --- | --- | --- | --- |
| `prop_floodlight_a` | `drawFloodlightFL1` | **FL1 tripod work light** — the floodlight's base look (ported from looks.html `drawFL1`) | 1 × 1 m |
| `prop_floodlight_b` | `drawFloodlightFL5` | FL5 stadium lamp on sandbags — the upgrade/skin look (drawn, not used yet) | 1 × 1 m |
| `prop_medstation_a` | `drawMedStation` | **MS10** — the designer's pick (round D iteration 2): hard med cases stacked on a blue-grey crate with a glowing green-cross LED panel (ported from looks.html `drawMS10`); the game adds a small pooled ADD glow on the panel (`MedStationView`) | 1 × 1 m |
| `fx_floodpool_a` (FX atlas) | `spriteAtlas.ts` | the floodlight's light pool: the FL1 card's flat warm disc, drawn 2 × the 4 m radius, ADD-blended, strength `NightLight.floodA` per stage | 8 m across |

The med station's ring is drawn at exactly the 2 m heal radius in the MS10 card's style (a crisp line
on the edge, a soft band inside, a faint wash: `render/medRing.ts`, one Graphics); the heal cue is a
small green "+" by the survivor (`PlayerView.healCue`).

Screenshots (Playwright headless Chromium, solo dev build `?shopall=1`, 844 × 390 at DPR 2):

- `5-10-stage1.png`, `5-10-stage2.png`, `5-10-stage3.png` — 3 floodlights (one damaged: HP bar) and 2 med stations at decay stages 1–3 (two pools drawn: the third lamp shares a pool, D4 merge).
- `5-10-closeup.png` — a floodlight with its pool, a med station with its ring, the survivor healing inside it (green "+").
- `5-10-online-lag.png` — online, `?lag=150&jitter=20`, during a wave next to a med station.
- Readability sheet pictures: `docs/playtests/milestone-1/objects/38_floodlight.png`, `39_med_station.png`.
