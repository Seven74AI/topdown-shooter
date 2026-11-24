# Sprint change proposal: survivor parts (Story 7.8 picks)

Date 2026-11-24 · Mode: batch · Approved: designer (the main session's plan, "approved by me") · Scope: **minor** (direct edits, no replan).

## 1. Issue summary

Story 7.8 put the survivor parts in game code after three rounds of designer picks (`docs/art/7-8/parts.html`, `round-2.html`, `round-3.html`; picks in `docs/epic-7-decisions.md` › Survivor parts (7.8)). The picks changed what the planning documents promised: the designer dropped the accent slot, dropped or replaced 15 parts, redrew the default cap and moved five milestone items. Separately, the designer decided that the propeller cap's propeller **spins**, as the first animated part and the pattern for later ones. The story ACs, `epics.md` (Stories 7.8–7.12, FR89) and the customization proposal still described the pre-pick plan (55 parts, 6 slots, a pixel-identical default).

## 2. Impact analysis

| Area | Impact |
| --- | --- |
| Epic 7 | Same stories, same order. 7.8 grows by one small feature (animated layers); 7.9–7.12 get updated part lists and one rule each. |
| Story 7.8 | AC 2–4 rewritten; new AC 9 (animated layers) and task T8; built and tested on `story-7-8`. |
| Story 7.9 | Look code without `acc` (5 slots + 3 colours); ownership via `STARTER_PARTS` until 7.11; attaches animated layers with `PlayerView.setAnimatedLayer`. |
| Story 7.10 | Tabs Top / Head / Hair / Pack / Skin; "no shop view for items" line (the designer asked; D3 already says never sold). |
| Story 7.11 | Milestone items: M5 headband, M7 planks, M8 laurel, M9 welding mask, M10 golf bag (M1–M4, M6 unchanged). |
| Story 7.12 | The 10 loot items listed. |
| GDD, architecture, UX | No change: the GDD names no counts (line 249 stays true); the architecture's `cosmetics.json` line stays true; no UX spec covers the editor yet. |
| Epic 6 / master code | The default survivor's cap is the designer's new drawing (every other pixel of every survivor frame is unchanged; frame names and sizes unchanged). `PlayerView` gains an optional animated layer (unused unless `?devlayer=propeller` in a dev build until 7.9). No new atlas frame; one new generated texture (`survivorlayer_propeller_a`), registered through `addGeneratedTexture`. |
| Readability sheet | Item 49 (survivor looks are not gear); 6.3 and 6.5 use 46–48. |

## 3. Recommended approach

**Direct adjustment.** The work is built; only the documents lag. Effort: small (documents only, plus the propeller layer already built in 7.8). Risk: low; the one runtime change (the default cap) is the designer's choice and is pinned by a raster digest test. Timeline: none.

## 4. Detailed changes

### Story 7.8 (`_bmad-output/implementation-artifacts/7-8-survivor-parts-in-game-code.md`)

- AC 2. OLD: six part functions incl. accent. NEW: five slots (top, headgear, hair, backpack, skin), no accent; the accent colour stays for hats and bags.
- AC 3. OLD: the default look is pixel-identical to today's survivor. NEW: today's body, only the cap redrawn (designer's round-3 pick B); frame names and sizes unchanged.
- AC 4. OLD: 55 parts, 35/10/10, slot `acc`. NEW: 51 parts, 31/10/10, slots `top | head | hair | pack | skin`, optional `animated`; milestone mapping M1 fire, M2 riot, M3 gas, M4 hockey, M5 headband, M6 camo, M7 planks, M8 laurel, M9 welding mask, M10 golf bag.
- AC 8: counts 31/10/10.
- NEW AC 9 + T8: a part may declare an animated layer; its own pooled sprite on top of the survivor, texture through `addGeneratedTexture` (redraw callback), no per-frame allocation, spin speed in `cosmetics.json`; the propeller first (2 turns per second); tested.

Rationale: the designer's picks and the propeller decision (`docs/epic-7-decisions.md`).

### `epics.md`

- **FR89**: adds "51 parts in 5 slots … 31 starter, 10 milestone, 10 loot" and the pick record.
- **Story 7.8**: split into five part functions; default = today's body with the new cap; 51 parts; new Given/When/Then for animated layers.
- **Story 7.9**: look code `v1|top:…|head:…|hair:…|pack:…|skin:N|c:…` (no `acc`); ownership = `STARTER_PARTS` until 7.11; animated layers baked out and shown as the pooled sprite.
- **Story 7.10**: tabs Top / Head / Hair / Pack / Skin; "there is no shop view for items: they are never sold (D3); editor tiles are drawn from the part code".
- **Story 7.11**: the M1–M10 items by name.
- **Story 7.12**: the 10 loot items by name.

### `docs/ideas/customization/proposal.md`

- §3 and §6 get a "Superseded" note: counts, the accent slot and the M5/M7–M10 items (and the loot list) are replaced by the 7.8 picks; the 40 px² rule and the milestones themselves stand.

### `docs/epic-7-decisions.md`

- "Survivor parts (7.8)" (rounds 1–3, final catalogue) and "The propeller spins" (the animated-layer rule).

## 5. Implementation handoff

- **Scope: minor.** Applied on branch `story-7-8` by the Story 7.8 developer session.
- **Main session:** gate the branch merged with master and push it to master (no fresh-agent review: designer's call).
- **Story 7.9 builder:** read AC "animated layer" in 7.8 and use `resolveLook`, `STARTER_PARTS`, `drawSurvivor(…, layers = false)` and `PlayerView.setAnimatedLayer`; the open question on stage dim (7.8 › Open questions 1) still applies.
- **Success criteria:** the story files and `epics.md` match `cosmetics.json` (51 parts, 5 slots, the milestone and loot lists); the propeller spins in a dev run (`?devlayer=propeller`); the full gate is green.
