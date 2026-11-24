# Sprint Change Proposal: Random city (2026-11-24)

Workflow: `gds-correct-course`, batch mode. Scope: **Moderate** (a new epic of 7 stories, FR and architecture additions, 2 small notes on Epic 6 stories not yet built; planning text only, no code). Source: forge session `_bmad-output/forge/random-map-generator/` (`forged-idea.md` HARDENED, `.memlog.md`, `forge-report.html`). Designer answers in this session (2026-11-24): **Q1 generic rules for stages 4–5 and the Epic 6 anchors** · **Q2 post-v1** · **Q3 the city code brings back the layout only**. Status: **awaiting the designer's approval**.

## 1. Issue summary

The designer wants a second map option next to the fixed Downtown: **Random city**, a new city generated from rules on every run. The forge session settled the design (decisions in `forged-idea.md`, not reopened here):

- The street plan, block sizes and building footprints are all generated. No hand-made blocks.
- Size is 70 × 70 m.
- The output is a normal `DistrictMap`, built in shared code from a seed, so there is no map download.
- Decay comes from generic rules plus landmark recipes. The first recipe is the gas station.
- Spawns are a mix: stage 1 from the city edges, and from stage 2 also near the group (15–35 m away, never within 6 m).
- Every city must pass checks A–G, or it is rejected and regenerated.
- The host picks Downtown or Random city in the lobby. Results shows a city code.
- Random city is open from the start, and the District 2 rule is unchanged.

Comparing the idea with the project files turned up **one real gap**, which the designer settled in this session (Q1). Epic 6, now in progress, adds Downtown-only map content that the forged idea did not cover:

| Epic 6 content | Where it lives today |
|---|---|
| Stage 4 rubble and wall breaches | 6.2, in `buildDowntown.ts` decay objects |
| Stage 5 looks | 6.4 |
| Four street ends at least 4 m wide for the Behemoth | 6.5, `boss.json › entryPoints` = Downtown object names |
| Event spots and stampede lanes | 6.8, the map's `events` layer |
| Crate and survivor spots | 6.9 and 6.10 |
| Helicopter pad | 6.11, `waves.json › evac.padX/padY` = Downtown (24, 15.9) |

The forged generic decay rules cover only stages 2–3. **Q1 answer:** generic rules for stage 4 too. Rubble closes 1 of 3 candidate side streets or dead ends, and 2 building walls become breaches (spawns). Stage 5 uses Downtown's global fog and blackout. The generator places every Epic 6 anchor, and a new **anchor check** (named, not lettered, so it isn't confused with the dropped check H) proves they exist and can be reached.

Other facts checked in the code:

- **Client art is keyed to Downtown.**
  - `dressing.ts › dressingFor(mapName)` returns `DOWNTOWN_DRESSING`, which is keyed by object name (heights, car colours, shop lights, the flicker lamp).
  - `drawCity.ts` looks up `d.canopy` and `bus_glass` by name.
  - Any other map gets `EMPTY_DRESSING` (shadows and roofs only).
- **Tuning is for 48 × 32 m.**
  - `zombies.json › pathing.rebuildCellsPerTick` 2048: Downtown's 6,144 cells refresh in 3 ticks, but 70 × 70 m (19,600 cells) would take 10 ticks, or 20 while a Runner is alive.
  - `waves.json › maxAlive` 150 and `boss.json › aliveCap` 110 are global.
- **The engine has room.** The horde stream allows maps up to 655 m (u16 at 1 cm), and `MAX_DECAY_VARIANTS` is 32 bits per map, which the generator must respect.
- **The run seed** (Story 4.4, `streams.ts`) has no `city` stream yet. The server picks the seed (`devRunSeed.ts`), and `RunController` defaults to `DOWNTOWN_MAP`.

## 2. Impact analysis

| Artifact | Impact |
|---|---|
| **New Epic 11 "Random city"** | 7 stories (§4.1). **Post-v1 (Q2):** built after Epic 10, so Story 7.7's lobby picker and Epic 8's saved runs exist by then. |
| Epic 4 | None to built code. FR32 gains the Random city spawn rule. Story 4.4's streams gain `city` (only when Epic 11 is built). |
| Epic 6 | Built stories unchanged. **Two notes on stories not yet built**, so Epic 11 needs no refactor later: **6.11** stores the pad as a map point (`events` layer `evac_pad`, from 6.8's layer) instead of `waves.json › evac.padX/padY`; **6.2** keeps its rubble/breach rules expressible as `pick N` groups (it already is). The boss entries (`boss.json › entryPoints`, 6.5, done) move to map data in Story 11.2. |
| Epic 7 | **7.7** unchanged in rule. Its lobby picker gains a third card in Story 11.7: Random city, always selectable, never shown as locked. FR81 stays "District 2 unlock". |
| Epic 8 | None now. The run-state rule (any new run state goes into the snapshot; 8.4's round-trip test enforces it) covers the city seed and generator version, which Story 11.7 adds. |
| Epic 9 / 10 | 9.2 polishes Downtown's 5 states. Random city art is drawn by type in 11.6 and polished there. 10.7 run stats: `district` is `downtown` or `random:<code>`. |
| FRs | FR32, FR65, FR69, FR88 amended. **New FR90–FR94** (FR89 is 7.8's). FR81 unchanged. |
| GDD | Level Types, Level Progression (run-to-run variety), Multiplayer (lobby), Development Epics (table + sequence), Out of Scope, Open Items (new players may skip Downtown). |
| Architecture | ADR-05 amended ("Tiled **or generated** maps with decay layers"). **New ADR-06** (the city generator lives in shared code, driven by a seed). Rows for Maps and Randomness amended. Balance: per-district overrides. Project tree: `packages/shared/src/map/gen/`. Join check: generator version + map digest. |
| UX | Lobby picker card, city-code field, and the code on Results. Small, inside existing screens. |
| Code today | None changed. |

## 3. Recommended approach

**Direct adjustment:** add a new epic within the existing plan, placed after v1 (Epic 10) at the designer's choice (Q2). It needs no rollback and no change to the MVP.

- **Why a separate epic:**
  - It touches shared map code, pathing budget, spawns, client art and lobby, which is too much for one story.
  - Building it after Epics 6–10 means the map contract is final (rubble, events, pad, saved runs, lobby picker), so the generator targets one fixed shape.
- **Effort:** about 7 builder sessions. 11.1–11.3 are the heavy ones (generator, checks, decay). 11.4 is medium (recipe). 11.5 is medium (spawns and balance, with sims). 11.6 is medium (art by type). 11.7 is small to medium (lobby and code).
- **Risk: medium–high.**
  - The checks must hold for *every* seed, not one hand-tuned map. 11.2 runs them over 1,000 seeds.
  - The open risks from the forge become ACs with numbers:
    - waves 1–2 density on 70 × 70 with edge-only spawns (11.5 sim against Downtown);
    - pathing at 19,600 cells (11.5 budget);
    - art by type (11.6, with Downtown's look unchanged);
    - new players skipping Downtown (11.7: Downtown stays the default pick).
- **Timeline:** after Epic 10. It does not move Epics 6–10.

## 4. Detailed change proposals

### 4.1 New Epic 11: Random city (post-v1)

**Epic summary:** The host can pick Random city, a new 70 × 70 m city generated from rules on every run (streets, blocks, plain buildings, cars, barriers and a gas station). It decays through all 5 stages by generic rules, always passes checks A–G and the anchor check, and can be replayed or shared by its city code. It is open from the start. **FRs covered:** FR32 (Random city spawns), FR65 (city stream), FR69 (picker), FR90–FR94.

| Story | Content (key ACs) | Size |
|---|---|---|
| **11.1 A new city from a seed** | `packages/shared/src/map/gen/` turns `(citySeed, generatorVersion)` into a 70 × 70 m `DistrictMap` with no randomness except its own `city` PRNG. The street plan is generated from rules (avenue, T, parallel streets, dead end…), with block sizes, building footprints, curb cars and barriers. Check **G**: streets at least 3 m wide. Same inputs give a byte-identical map on server, client and tests. Generation including retries takes ≤ 150 ms on the Mi 11i (≤ 20 ms on the server), with at most 20 tries per seed, then the next seed of the `city` stream. | L |
| **11.2 Every city is fair: checks A–G + anchors** | One `checkCity(map)` runs A–G, each its own test: A never seals off an area, at any stage × every legal variant mask (`legalDecayMasks`); B every spawn reaches the players; C an open start area near the middle, buildable in wave 1, never touched by decay; D no empty 15 × 15 m square without cover; E at least 2 choke points; F no spawn path that traps zombies; G from 11.1. **Anchor check (Q1):** 4 main-street ends at least 4 m clear at every stage (moved from `boss.json › entryPoints` to map data, so Downtown gets its 4 ends as map objects too); `evac_pad` inside area C; crate/survivor/safe spots and stampede lanes on open road, reachable (6.8's tests run on generated maps). A rejected city is regenerated. A 1,000-seed test: 100 % of final maps pass, and the reject rate is reported. | L |
| **11.3 The city falls apart by rules** | Generic decay rules output `pick N` groups that `applyDecayStage` already understands. Stage 2: curb cars into the road, police lines. Stage 3: cars burn. Stage 2+: manholes and windows open as spawns. **Stage 4 (Q1):** rubble closes 1 of 3 candidate side streets or dead ends wall to wall, and 2 building walls become breaches with 6.2's buried/≥ 6 m rules. **Stage 5:** 6.4's global power-out, fog and the run's weather style. All variant bits ≤ 32. Downtown's maps and seeds are unchanged (its tests stay green as they are). | L |
| **11.4 Landmark recipes: the gas station** | A recipe is a rule set that builds a landmark at any valid lot size and position, with its own stage events. The first recipe is the **gas station** (kiosk building, 2–4 pumps, canopy, a `gas_leak` hazard from stage 2), so 6.9's gas leak event runs on Random city unchanged. Every city has exactly 1 gas station in v1 of the feature. Recipes pass the same checks. | M |
| **11.5 Spawns and balance for 70 × 70** | Stage 1 spawns only at the city edges. From stage 2, points spread by the generator also open; a wave uses those 15–35 m from the group, never within 6 m (FR32, FR93). Per-district balance overrides (`districts.json`: spawn bands, pathing budget), with Downtown's values unchanged. `maxAlive` 150 and the boss cap 110 stay (NFR1). A flow-field refresh takes no more ticks than on Downtown, with the tick cost measured (`PERF_ASSERT=1`, load recorded). **Sim, 8 seeds × 10 waves:** in waves 1–2, the time to first contact and the zombies within 15 m of the team are within ± 20 % of Downtown's. If not, the knob is that stage-1 edge spawns use the edge third nearest the team. | M |
| **11.6 Art drawn by type** | `dressing.ts`/`drawCity.ts` draw buildings, cars, barriers, the gas station and decay props **by kind and any size**, with no lookups by object name for Random city. Heights, shop lights and car colours come from the map's own seeded dressing. The ground bake fits NFR2 (chunked if a 70 × 70 m bake exceeds the 2048² atlas rule). Every texture goes through `addGeneratedTexture`. Downtown's look is pixel-identical (screenshot diff at stages 1–5). Show the designer screenshots of 3 seeds × 5 stages first (code-drawn proposal; the designer picks). | M |
| **11.7 Pick Random city, share its code** | Story 7.7's picker gains a **Random city** card, always selectable and never locked; **Downtown stays the default pick**. The server draws `citySeed` from the run seed's `city` stream (or takes the host's code) and sends `{citySeed, generatorVersion}`. A client's join carries its generator version and the map digest; a mismatch is refused with "Please refresh" (like the balance version). Results shows **"City K7QX"** (code = seed + generator version, 4–5 chars, no ambiguous letters). The host types a code in the lobby to rebuild **the same layout only** (Q3): decay picks, events and shop cards come from the new run's seed. A code from an older generator shows "This city is from an older version". Saved runs (8.4) store `citySeed` + `generatorVersion`; the 8.4 round-trip test covers them. Run stats (10.7) record `random:<code>`. | S–M |

Build order: 11.1 → 11.2 → (11.3 ∥ 11.4) → 11.5 → (11.6 ∥ 11.7). 11.6 and 11.7 touch different files.

### 4.2 FR changes (`epics.md` › Requirements Inventory and FR Coverage Map)

```
FR32
OLD: Zombies spawn at district edges (alleys, manholes, broken shop windows); decay opens more spawn points.
NEW: Zombies spawn at district edges (alleys, manholes, broken shop windows); decay opens more spawn points. In Random city, stage 1 spawns only at the city edges and from stage 2 points near the group open too (FR93).
```
```
FR65
OLD: … so a run can be reproduced.
NEW: … so a run can be reproduced. A Random city's layout comes from its own city seed (FR94).
```
```
FR69
OLD: The host picks a district and gets a share link …
NEW: The host picks a district (Downtown or, from Epic 11, Random city) and gets a share link …
```
```
FR88
OLD: … (district, wave reached, …)
NEW: … (district, or `random:<city code>`, wave reached, …)
```
New FRs:
- **FR90:** Random city: each run the host can play a new 70 × 70 m city generated from rules (street plan, blocks, building footprints, curb cars, barriers) and landmark recipes (first: the gas station). It is open from the start with no unlock; FR81's District 2 rule is unchanged.
- **FR91:** Every generated city passes checks A–G (never seals an area at any stage or variant; every spawn reaches the players; an open start area near the middle, buildable in wave 1 and never hit by decay; no empty 15 × 15 m square without cover; at least 2 choke points; no spawn path that traps zombies; streets at least 3 m wide) and the anchor check (4 main-street ends ≥ 4 m clear, the helicopter pad in the start area, event spots and lanes reachable), or it is rejected and regenerated.
- **FR92:** Random city decays by generic rules through all 5 stages (curb cars move into the road, police lines, cars burn, manholes and windows open, rubble closes 1 of 3 candidate side streets, 2 building walls open as breaches; stage 5 power out and fog), plus each landmark recipe's own stage events (gas station: gas leak from stage 2).
- **FR93:** Random city spawns: stage 1 only from the city edges; from stage 2 also from generated points 15–35 m from the group, never within 6 m; fights stay as dense as Downtown's (150 alive cap unchanged).
- **FR94:** Results of a Random city run show a city code; the host can type it in the lobby to play the same layout again (decay picks, events and shop cards stay new); codes from an older generator are refused with a message.

Coverage map: `FR90–FR94: Epic 11 - Random city`. Also `FR32: Epic 4 (Random city spawns: Epic 11)`, `FR69: Epic 2 (Random city card: Epic 11)`.

### 4.3 `epics.md` › Epic List and the new section

- **Order line:** append "→ **11 (Random city, post-v1)**".
- **New summary block:** Epic 11 (text in §4.1).
- **New `## Epic 11: Random city` section** at the end: intro (source, Q1–Q3, dependencies on Epics 6, 7.7, 8.4, 10.7) and Stories 11.1–11.7 in Given/When/Then form (ACs from §4.1).
- **Story 7.7:** a one-line note: "Epic 11 adds a Random city card to this picker (open from the start, not an unlock; this rule is unchanged)."

### 4.4 Notes on Epic 6 story files (not yet built)

- **`6-11-evacuation-vote.md`:** in AC 9 and T-balance, the pad centre comes from the map's `events` layer point `evac_pad` (Downtown: 24, 15.9; added by 6.8's layer), not from `waves.json › evac.padX/padY`. `padRadiusM` stays in balance. `crossCheck` becomes a map test. Reason: Random city places the pad per city.
- **`6-2-ruins.md`:** a note only: keep the collapsed-alley and breach data as `pick N` groups (as written), because Epic 11's generic rules output the same shape.

### 4.5 GDD (`gdds/gdd-topdown-shooter-2026-11-21/gdd.md`)

- **Level Types:** add "**Random city** (Epic 11, post-v1): a new 70 × 70 m city generated from rules each run, open from the start; see FR90–FR94."
- **Level Progression › Run-to-run variety:** add "In Random city the streets, blocks and buildings are new too; its city code replays the layout."
- **Multiplayer › Lobby:** "the host picks a district (Downtown, or Random city from Epic 11) …"
- **Development Epics:** add row 11 "Random city: a new generated city every run (post-v1)", and update the sequence line.
- **Out of Scope:** "districts beyond Downtown (district 2 follows v1; **Random city is planned post-v1 as Epic 11**)".
- **Open Items:** "[NOTE FOR DESIGNER] New players may skip Downtown, the hand-made first city: Downtown is the default pick (Story 11.7); revisit after playtests."

### 4.6 Architecture (`game-architecture.md`)

- **Decision table › Maps:** "Districts authored in **Tiled** (JSON export) **or generated in shared code from a city seed (Random city, ADR-06)**; both produce the same `DistrictMap` (collision, cover, spawns, hazards, events, decay groups)."
- **Decision table › Randomness:** add the `city` stream (city seed for Random city; the host's city code overrides it).
- **ADR-05:** "Tiled **or generated** maps with decay layers. Decay is data (mutation groups with `pick N`), not code paths per district, so neither a new district nor a generated city needs new decay code."
- **New ADR-06: city generator in shared code.**
  - Chosen over sending a generated map from the server (a download per join, harder replays) and over hand-made block assemblies (rejected in the forge).
  - Rules:
    - deterministic from `(citySeed, generatorVersion)`;
    - no randomness outside the `city` PRNG;
    - the server and every client build the same map;
    - the join checks the generator version and the map digest;
    - checks A–G plus the anchor check gate every city.
  - Cost: generator code, plus checks that must hold for every seed.
- **Balance data:** per-district overrides in `districts.json` (spawn bands, pathing budget). Global caps stay.
- **Saved runs:** the snapshot carries `citySeed` + `generatorVersion`.
- **Project tree:** `packages/shared/src/map/gen/` (street plan, blocks, recipes, checks). Also the line "the Downtown map is generated by `tools/maps/buildDowntown.ts` … Random city by `map/gen` at run start".
- **Map anchors:** boss entries and the evac pad are map data (`events` layer), not balance names.

### 4.7 `sprint-status.yaml`

Add after Epic 10:

```yaml
  # Epic 11: Random city (post-v1; sprint-change-proposal-2026-11-24-random-city.md)
  epic-11: backlog
  11-1-a-new-city-from-a-seed: backlog
  11-2-every-city-is-fair-checks-a-g-and-anchors: backlog
  11-3-the-city-falls-apart-by-rules: backlog
  11-4-landmark-recipes-the-gas-station: backlog
  11-5-spawns-and-balance-for-70-by-70: backlog
  11-6-art-drawn-by-type: backlog
  11-7-pick-random-city-share-its-code: backlog
  epic-11-retrospective: optional
```

Plus comments on `6-11-evacuation-vote` ("pad = map point, random-city CCP") and `7-7-district-unlock-rule` ("Epic 11 adds the Random city card").

## 5. Implementation handoff

- **Scope: Moderate.** Backlog reorganisation (new epic) and plan text. No code until after Epic 10.
- **This session (after approval):** apply §4.2–§4.7 to `epics.md`, the GDD, `game-architecture.md`, `sprint-status.yaml` and the two Epic 6 story files. Commit and push to branch `correct-course-random-city` (not master).
- **Main session:** merge `correct-course-random-city` into master **before Story 6.11's builder starts**, so 6.11 builds the pad as map data, and run the full gate (HANDOFF §3: docs-only merges too).
- **When Epic 11 starts (after Epic 10):** run `gds-create-story` for each story from the real code of that time, then follow the usual builder → fresh review → re-review loop. Builders get this proposal and `forged-idea.md`. Any new look gets code-drawn proposals first (11.6).
- **Success criteria:**
  - 1,000 seeds: 100 % of final cities pass A–G and the anchor check, with generation ≤ 150 ms on the Mi 11i;
  - the same city code gives the same map digest on server and client;
  - waves 1–2 density within ± 20 % of Downtown;
  - flow-field refresh no slower than Downtown's;
  - Downtown's maps, seeds and look are unchanged;
  - a full 10-wave Random city bot run reaches the Behemoth and the vote.
