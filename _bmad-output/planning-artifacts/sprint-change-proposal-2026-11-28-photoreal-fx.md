# Sprint Change Proposal: photoreal effects (group 5) into the game (2026-11-28)

Mode: batch (headless; run by a cloud session with `gds-correct-course`, then `gds-create-story` for every story it defines; `bmad-build` not used). Scope: **Moderate** (backlog reorganisation: Story 9.6 re-based and cut into 8 stories, 7 of them new; two game-rule changes; planning text only, no code).

Approval: the designer's picks for photoreal group 5 (`docs/art/photoreal-decisions.md` › "FX (photoreal group 5)", final 2026-11-28) and the designer's go for this run (2026-11-28: "Reco" to "the next step is the build story for the effects (Story 9.6) … Should I write it with gds-create-story?", then "And yes use gds create story to create all the stories needed. And maybe a correct course before? As needed."). The recommendations the designer took ("Reco", items 1–10 of the last open questions) are applied as written. Items not yet decided are in §6 with a recommendation; until answered, the stories follow the recommendation and say so.

Inputs: `docs/art/photoreal-decisions.md` (FX group 5), `docs/art/photoreal-5/compare.html` and `src/*.ts` (goal, elements, composition, timeline, perf and findings of every picked look), `.claude/skills/dead-city-model/SKILL.md` §7 and `fx.md`, the 9.13 / 9.14 / 9.15 story files, `epics.md` (Epic 9, Stories 9.4–9.6), the GDD, `game-architecture.md`, and a read of the real client and sim code each look replaces (file maps in the story files).

## 1. Issue summary

- **Trigger.** Story 9.6 ("Effects", backlog) was written on 2026-11-26 as one story: "a proposal page … the designer picks … muzzle flashes, blood, fire, acid, gas, explosions, rain, fog, film grain, flashlight and floodlight light textures use it". The proposal page (photoreal group 5) is now picked in full: **30 looks** in 4 families (MZ-A, SG-G, TR-G, HT-G, BL-G, BT-G, ML-A, CS-A (more blood), BF-G, EX1-G, EX2-A (grey shock ring), GR-R, MO-R, FI-R, FS-A, BX-G, AC-N (blended edge, Q1–Q4 recommendations), GA-M, EV-R, RD-G, PD-G, RN-G, BD-R, SD-A, TH-R (crater 6 m), CL-A, CR-R, P1-G, GD-R, ST-A).
- **What changed against the plan:**
  1. **Size.** About 35 view files and ~9,500 lines of client code are replaced or changed (FxView, ProjectileView, BloodTrailView, ExplosionView, grenadeFx, GrenadeView, MolotovView, molotovFx, FireView, FlameView, BloaterView, AcidView, EventView, EventPickupsView, DustView, CityView rain, PlaceFxView, BossView warnings, bossAtlas, groundDamageArt, BossHud …). That is far too big for one builder (AGENTS.md §4).
  2. **Two game-rule changes the designer asked for:**
     - **MO-R, the molotov cone** (designer 2026-11-28: "our molotov is actually not a cone but a circle … rethink the Molotov shape to a more conic form … grow … 2m … when it land and it grow to 3m or 4m after impact before it start to fade"; numbers: "Recommended. And yes should stop at walls"). The fire zone becomes a teardrop along the throw, growing 2 → 4.5 m in 1.0 s at a 35° half-angle, 0.8 m back, held to 3.4 s, faded by 4 s, damage unchanged, clipped at the first blocker along the throw. **Sim, net and balance change.**
     - **ST-A, status icons** (designer 2026-11-28: "We probably should make some animated status icon for both player and monsters because they could be affected by same statuses"; "Yes, 24 max, ordered by most important zombie. For example we should always display the ones of behemoth"). A new feature: icons above the head (max 3 stacked, in priority order), zombie icons capped at 24 by importance, the Behemoth's and survivors' icons always shown, statuses from the sim.
  3. **Smaller decisions with code effects** (designer "Reco", 2026-11-28): hit direction on `zombie.hit` / `zombie.killed` for the client (display only); the throw crater 6 m (2 × the 3 m reach) drawn with `groundDamageArt.drawGroundDamage` like the slam cracks; BD-R the Behemoth's dust under its body (BossView depth); rain drawn under acid, gas and spit; EV-R the stampede arrow replaces the drifting chevrons (about 6 m long); the RD debris sound on landing; EX2's shock ring grey; BF-G's wreck stays 4 s; CR-R keeps the 0.3 s amber flash with the stun icon; GA-M with GA-A's fog at full strength.
  4. **`?fx=low` gaps** the page found (explosions, the Bloater pool, event vapour, flare smoke, stampede dust, place dust, rain splashes ignore it) and a list of game bugs on the cards (untinted Molotov rag, the Molotov ring popping off, the acid puddle popping off at 35 %, four different blood colours, debris with no shadows, wood puffs for metal barricades, place dust shrinking, `fx_grit_a` as a white speck, the CRASH word hidden under the boss, the slam disc as one 9.1 m full-disc additive quad, the crack decal baked under game resolution).
  5. **Items in 9.6's old text that group 5 did not cover:** fog visuals, film grain, flashlight and floodlight light textures (the page's RN finding: `fx_floodpool_a` is the floodlight pool, not water; not redrawn). They were never on the page, so nothing is picked for them (§6 Q6).
- **Already done, not included:** the gas slow vs protection bug (`zombies/bloater.ts › gasPlayer`), fixed in PR #46.

## 2. Impact analysis

### Checklist (`checklist.md`)

| Item | Status | Finding |
|---|---|---|
| 1.1 trigger | [x] | Group 5 picks complete (decisions doc, 2026-11-28). Story 9.6 (backlog). |
| 1.2 problem | [x] | New requirement from the designer (MO-R, ST) + scope far larger than one story. |
| 1.3 evidence | [x] | 30 picked looks with numbers, perf and findings on the page; ~35 client files; sim/net touch points read (below). |
| 2.1 current epic | [x] | Epic 9 can complete as planned once 9.6 is cut into 8 stories. |
| 2.2 epic changes | [x] | 9.6 re-based (the foundation); 9.16–9.22 added. |
| 2.3 future epics | [x] | Epic 10: 10.3 (real phones) and 10.8 (balance pass) should know the molotov change; no AC change. Epic 11: none. Its readiness note says "free net-event kinds start at 76"; this change reserves 85–103 for Epic 9, so Epic 11 keeps 76–84 and 104–129 (§4.4 CC-B2). |
| 2.4 obsolete / new epics | [N/A] | None. |
| 2.5 order | [x] | 9.6 first (foundation), then 6 stories in parallel; 9.18's sim part and 9.22's status model may start before 9.6 lands. |
| 3.1 PRD / GDD | [!] | GDD: the Molotov line (consumables), the friendly-fire line (unchanged), and a status-icon line in Art Style › readability rules. Applied (§4.2). |
| 3.2 architecture | [!] | Asset loading row: FX ship as pre-rendered atlases too (pending §6 Q1, recommended); Events row: `molotov.ignited` carries the throw direction and the clipped reach. Applied (§4.3). |
| 3.3 UX | [!] | Status icons are a new in-world UI element (above the head, ≤ 3, timers). No HUD layout change. Recorded in the GDD readability rules; the game UX spec has no in-world icon section to update. |
| 3.4 other | [x] | Balance JSON (`consumables.json`, `controls.json fx`) → `balance.version` changes (old tabs get `balance_mismatch`; golden world digests re-pin, the 9.13 B28 rule). Tests: the 5.12 molotov tests move to the teardrop. Gallery, readability sheet, perf notes. CI unchanged. |
| 4.1 direct adjustment | Viable | Re-base 9.6, add 7 stories in Epic 9. Effort high (8 builder sessions), risk medium (MO-R sim change; perf of ~30 new looks). |
| 4.2 rollback | Not viable | Nothing built to roll back. |
| 4.3 MVP review | Not needed | Epic 9 is alongside v1; no scope cut asked. |

### Epic and story impact

- **Story 9.6** keeps its key `9-6-effects` and becomes the **effects foundation**: the FX atlas pipeline, the loader and fallback, the shared FX kit, the single `?fx=low` source, the perf harness the other stories measure with. No visible change in the game on its own.
- **New stories (Epic 9, after 9.15):**
  - **9.16** Photoreal gunfire, hits and blood (MZ-A, SG-G, TR-G, HT-G, BL-G, BT-G, ML-A, CS-A, BF-G).
  - **9.17** Photoreal explosions, thrown rounds and fire (EX1-G, EX2-A, GR-R, FI-R, FS-A; the bottle's flight part of MO).
  - **9.18** The Molotov cone (MO-R: **sim / net / balance change** + its look).
  - **9.19** Photoreal acid, Bloater burst and gas (AC-N, BX-G, GA-M).
  - **9.20** Photoreal event smoke, dust and rain (EV-R, RD-G, PD-G, RN-G).
  - **9.21** Photoreal Behemoth warnings and ground damage (SD-A, TH-R, CL-A, CR-R, P1-G, GD-R, BD-R).
  - **9.22** Status icons (ST-A: new feature, statuses from the sim).
- **9.4** (zombie attack and death animations) and **9.5** (gore): unchanged ACs. 9.5's blood decal cap (300) now applies to 9.16's BL-G pools; 9.5 builds dismemberment on 9.16's blood. Note added to 9.5.
- **9.15** (done): BD-R changes its dust depth and pictures (in 9.21); GD-R replaces its crater; 9.15's timing (`BOSS_DUST`, `bossAnim`) is kept.

### Technical impact (what the code read found)

- **Sim / net / balance (9.18):** `consumables.json › molotovs` + `balanceSchema.ts` (cone fields replace `radiusM` for the molotov), `hazards/molotov.ts` (per-zone direction and clipped reach, teardrop hit test in ticks), `combat/grenades.ts › landConsumable` (the throw direction is known: `target.x0/y0 → x/y`), `net/netEvents.ts` `molotov.ignited` (kind 40 keeps its number; direction u8 and clipped reach appended), `decay/fire.ts` (unchanged call), `bots/botPolicy.ts` (aim the cone at the pack), the 5.12 tests (`combat/consumables.test.ts` M-A…M-D, `consumables.fuzz.test.ts`, `netEvents.test.ts`), whole-run sims.
- **Hit direction (9.16):** `zombie.hit` already carries `dirX/dirY` on the wire (`netEvents.ts:167-177`, quantised heading); a damage kill is always emitted right after its `zombie.hit` in the same tick (`combat/damage.ts:102-107`). So the client gets the kill direction without a wire change (§4.4 B-code); `zombie.killed` gains an optional heading only if the builder's probe finds a case where the hit is not delivered (interest filtering).
- **Statuses (9.22):** survivors' statuses are on the wire (`stateView.ts`: status, downedTicksLeft, slowTicks/slowPct, protectTicks); the boss stun is boss state; zombie burning is the horde stream's burning bit; zombie bear-trap hold and spike slow are not on the wire and are derived on the client (`bear_trap.snapped` + `holdS`; the zombie over a spike trap's footprint) or, if the probe shows that is wrong, carried by new net kinds from 9.22's range.
- **Render:** rain (`CityView RAIN_DEPTH 11.8`) is above every hazard, the darkness and every above-dark slot today; it moves under the hazards (9.20). The boss dust is drawn at `BODY_DEPTH + 0.01` (6.21) and moves under the body (9.21). Boss decals turn by `attackId × 2.39996`, which turns relit light; GD-R draws them unrotated.
- **Perf:** the page's measured peaks per look are carried into each story. Each story holds `?stress=150` within 2 FPS and +1 ms p95 of master at 1× and 4× CPU, plus its own scene (9.6 builds the shared harness).

## 3. Recommended approach

**Direct adjustment.** Re-base 9.6 as the foundation and add 7 stories cut by real file overlap, so up to 3–4 builders run at once (AGENTS.md §4) with only trivial merges (keep-both lists in `controls.json`, one-line hooks in `GameScene.ts`).

- **Order:** 9.6 first. 9.18's sim part (T1–T5) and 9.22's status model (T1–T2) can start at the same time as 9.6, because they don't need the atlas pipeline. After 9.6 lands: 9.16, 9.17, 9.21 (round 1), then 9.19, 9.20 and the view parts of 9.18 / 9.22 as builders free up. Any order works for merging; the overlaps are listed in each story's "Notes for the merge".
- **Reviews:** full three-layer `gds-code-review` for 9.18 (game rule, net) and 9.22 (statuses from the sim); light review (one checker) for 9.6, 9.16, 9.17, 9.19, 9.20, 9.21 (mostly visual), each with a real-browser check.
- **Effort:** 8 builder sessions; 9.18 and 9.22 are the riskiest. **Risk:** medium (perf of many additive looks; MO-R balance). **Timeline:** Epic 9 grows by 7 stories; v1 (Epic 10) is not blocked by them.

## 4. Detailed change proposals (applied in this commit)

### 4.1 epics.md

**Epic 9 intro, OLD:** "Gameplay unchanged: no change to simulation, balance numbers (except new `controls.fx` caps), net messages, collision or the world digest."
**NEW:** "Gameplay unchanged: no change to simulation, balance numbers (except new `controls.fx` caps), net messages, collision or the world digest, **except where the designer asks for a rule change on a proposal page: the Molotov cone (Story 9.18, group 5 MO-R) and status icons from the sim (Story 9.22, ST-A).**"
Rationale: the two designer-asked rule changes.

**Story 9.6, OLD:** the "proposal page … pick" AC, the "muzzle flashes, blood, fire, acid, gas, explosions, rain, fog, film grain, flashlight and floodlight light textures use it" AC, the pools / settings AC, the stress AC.
**NEW:** "Story 9.6: Effects foundation" with ACs for the pick (done), the FX atlas pipeline, loader and fallback, the shared kit, one `?fx=low` source, the perf harness, and the split into 9.16–9.22; fog, film grain, flashlight and floodlight textures stay as today (not on the group-5 page; §6 Q6). Full text in epics.md.
Rationale: the picks are complete; the work is cut by file overlap.

**New stories 9.16–9.22** added after 9.15 in Epic 9's story list, each with its ACs (epics.md). **9.5** gets a one-line note: "Blood is built in 9.16 (BL-G, one blood palette); 9.5's decal cap applies to 9.16's pools."

### 4.2 GDD (`gdds/gdd-topdown-shooter-2026-11-21/gdd.md`)

**Item and Upgrade System › Consumables, OLD:** "Molotovs ×2 (fire zone 3 m for 4 s, 8 dmg/s) 100. … a molotov's fire needs a clear line from the zone centre (like acid)."
**NEW:** "Molotovs ×2 (a cone of fire along the throw: 2 m at impact growing to 4.5 m in 1 s, 35° half-angle, 0.8 m behind the impact, for 4 s, 8 dmg/s; stopped by the first wall, car or building along the throw) 100. … a molotov's fire needs a clear line from the impact point (like acid). *(Changed 2026-11-28, photoreal group 5 MO-R, Story 9.18; was a 3 m circle.)*"
Impact on MVP: none; area per throw 58 % of the old circle, damage along a zombie lane about the same (5.3 m vs 6 m of fire crossed).

**Art Style › Readability rules, NEW bullet:** "**Status icons:** a body under a status the player can act on shows it as a small icon above its head (at most 3, danger first: downed, burning, acid, slowed, stunned, trapped, protected, healing), with a ring that drains over the time left. Survivors' and the Behemoth's icons always show; zombie icons are capped at 24 by importance (Behemoth > Brute / Bloater / Spitter > Runner > Walker / Crawler, then nearest), 12 with low effects. *(Added 2026-11-28, photoreal group 5 ST-A, Story 9.22.)*"

### 4.3 Architecture (`game-architecture.md`)

- **Asset loading row:** add "Effects (photoreal group 5, Story 9.6) ship as pre-rendered atlases per family (`render/fx/atlas/<family>.webp` + JSON + drift hash, `npm run art:fx`), loaded in the background after Boot; until a family's atlas has landed, that run draws today's code-drawn effects." (Pending §6 Q1, applied as recommended.)
- **Events bullet:** add "`molotov.ignited` carries the throw direction (u8) and the zone's clipped forward reach (cm) since Story 9.18, so the client draws the exact teardrop the sim burns."

### 4.4 B-codes decided here (tell the builders and reviewers)

- **CC-B1 Kill direction without a wire change.** `zombie.hit` already carries the hit direction; a kill by damage follows its hit in the same tick. The client keeps the last hit direction per zombie slot (typed array, reset on spawn) and uses it for the kill; quiet chainsaw kills use the swing direction; other kills (traps, fire, bloater, decay, cheats) fall back to BL-A's seeded turn. The designer's "added to `zombie.hit` / `zombie.killed`" is met for the client. If 9.16's probe finds a kill whose hit was filtered out (`apps/server/src/net/eventInterest.ts:89-96`), `zombie.killed` gains an optional heading byte at index 7 (kind 1 unchanged).
- **CC-B2 Net kind ranges** (free: 85–129; 76–84 left for Epic 11): 9.6 85–86, 9.16 87–89, 9.17 90–91, 9.18 92–93, 9.19 94–95, 9.20 96–97, 9.21 98–99, 9.22 100–103. Most stories need none; a range is a reservation, not a request.
- **CC-B3 Readability-sheet numbers** (master's last is 152): 9.6 153–155, 9.16 156–165, 9.17 166–173, 9.18 174–177, 9.19 178–183, 9.20 184–191, 9.21 192–201, 9.22 202–209.
- **CC-B4 Atlas families** (one per story, so no two stories edit one atlas): `gunfire` (9.16), `fire` (9.17), `molotov` (9.18), `matter` (9.19), `ambient` (9.20), `boss` (9.21), `status` (9.22). Discovered by glob: no shared list to edit.

### 4.5 sprint-status.yaml

`9-6-effects: ready-for-dev` (re-based); new keys `9-16-photoreal-gunfire-hits-and-blood`, `9-17-photoreal-explosions-thrown-rounds-and-fire`, `9-18-molotov-cone`, `9-19-photoreal-acid-bloater-burst-and-gas`, `9-20-photoreal-event-smoke-dust-and-rain`, `9-21-photoreal-boss-warnings-and-ground-damage`, `9-22-status-icons`, all `ready-for-dev`; header comment records this change.

## 5. Implementation handoff

- **Scope: Moderate.** Backlog reorganisation; routed to the main session (story loop owner) and builders.
- **Main session:** start 9.6, 9.18 (sim part first) and 9.22 (model first) builders, each in its own cloud session with its story file + this proposal + `docs/art/photoreal-decisions.md`; then the rest by overlap. Ask the designer §6.
- **Builders:** follow each story's tasks, B-codes and "Notes for the merge"; `gate:fast` + touched slow tests; PR per story.
- **Success criteria:** every picked look in the game as approved (stills beside `compare.html`); MO-R's teardrop is exactly where it burns (sim tests at 0.01 m); status icons from the sim with the caps; `?stress=150` within budget per story; master CI green after each merge.

## 6. Open questions for the designer (stories follow the recommendation until answered)

- **Q1 How the new effect pictures get into the game.** A *(recommended)*: drawn once offline from the approved page code and shipped as image files (like the street props in 9.14): the looks are exactly the page's, no bake at load; about +3–5 MB on first load (inside the 15 MB budget), downloaded in the background, today's effects show until it lands. B: drawn at load on the phone (like the characters, 9.13): no extra download, but about 1–3 s of background baking per run start and some page code (blur filters) must be rewritten, so small differences from the approved stills.
- **Q2 Status icons in the dark.** A *(recommended)*: a zombie's icons show only when the zombie itself is visible (in a blackout or fog an unseen zombie gives nothing away); survivors' and the Behemoth's icons always show, above the darkness. B: every icon above the darkness (shows where hidden zombies are).
- **Q3 Today's status cues next to the icons.** A *(recommended)*: keep them all for now (downed / slowed tints, the protection blink, burning flames, the HUD glows, the boss bar's amber flash); revisit at a playtest. B: drop the SLOWED tint (the icon replaces it).
- **Q4 The Molotov aim marker.** Today it is a 3 m circle at the landing spot. A *(recommended)*: it shows the full-size teardrop (4.5 m, 35°) pointing along the throw, in today's marker line, cut at the first wall. B: keep the circle (it would show a zone that no longer exists).
- **Q5 Gas cloud in a blackout (GA-M).** Today a ring is copied above the darkness. A *(recommended)*: the copy is GA-G's rolling rim at the hazard ghost strength (no ring). B: keep a faint ring for the copy.
- **Q6 Fog, film grain, flashlight and floodlight light textures** (in 9.6's old text, never on the group-5 page). A *(recommended)*: they stay as today; if wanted, a later proposal page (lights + fog + grain). The hidden film-grain setting stays hidden. B: add a page now.
- **Q7 Rain under the hazards.** Drawing rain under the acid puddles (depth 1.55) means under the street's bodies too. A *(recommended)*: rain at street level, under every body and effect (seen from above, it reads as the street getting wet); stills for your look in 9.20. B: rain under the hazards but over the bodies (two rain layers, more cost).

## 7. Files changed (this commit, docs only)

- `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-28-photoreal-fx.md` (this file)
- `_bmad-output/planning-artifacts/epics.md` (Epic 9 intro; 9.5 note; 9.6 re-based; 9.16–9.22 added)
- `_bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md` (Molotov line, status icons rule)
- `_bmad-output/planning-artifacts/game-architecture.md` (asset loading row, events bullet)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/9-6-effects.md` and `9-16` … `9-22` story files

## 8. Story validation (`gds-create-story › checklist.md`, 2026-11-28)

Each of the 8 story files was checked against the checklist's disaster list:
- every file the story touches is named with its current state and line numbers, from a full read of the code (three read-only code maps plus the sim / net files read directly);
- what must be preserved is stated (fallback looks, sim numbers, timings, fog / blackout rules, 9.15's timings, BurnView);
- shared files have an owner (FireView pool mode: 9.17 / 9.18; CityView fire ring 9.17, rain 9.20; `drawThrowMarker` 9.18; `fx_dust_a` left as is by 9.20);
- the tests assert something happened (9.18's lane sim, 9.22's run);
- numbers are copied from the page's `goalFirst`, perf and findings.

Fixes made during the check:
- 9.18 now lists every reader of the Molotov `radiusM` that must move to the cone;
- 9.19's and 9.17's source-file names were corrected to the files that hold the picked looks;
- the wording of 9.20's rain depth was made precise (below 1.5, above the street).
