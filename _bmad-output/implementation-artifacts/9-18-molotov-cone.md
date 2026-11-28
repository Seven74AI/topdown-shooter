# Story 9.18: The Molotov cone

Status: ready-for-dev

<!-- Written 2026-11-28 with gds-create-story from the real code (sim, net, client) and the approved group-5 card MO-R
     (docs/art/photoreal-5/src/fire-r2.ts › MO_R, sdCone, and fire-gmo.ts). Correct-course:
     sprint-change-proposal-2026-11-28-photoreal-fx.md. A GAME RULE CHANGE: full three-layer review. -->

## Story

As a player throwing a Molotov,
I want the fire to run forward along my throw as a cone that grows and stops at walls,
so that it feels real and I can aim it down a zombie lane.

## Designer decisions — the source of truth

- MO-R (designer 2026-11-28): "I like MOG, the fire and the cone, but our molotov is actually not a cone but a circle.
  Maybe we could rethink the Molotov shape to a more conic form, it would be more realistic, also we could make the fire
  grow for a bit, like 2m cone (I'm throwing random number) when it land and it grow to 3m or 4m after impact before it
  start to fade". This changes the game's zone shape.
- Numbers (round 3): "**Recommended. And yes should stop at walls**": 2 → 4.5 m in 1.0 s, 35° half-angle, back 0.8 m,
  hold to 3.4 s, fade by 4 s, damage unchanged; the cone is clipped at the first blocker along the throw.
- Measured on the card: full cone 16.4 m² (58 % of the 3 m circle's 28.3 m²); area × time 62 m²·s (55 % of 113); a
  zombie walking down the throw line crosses 5.3 m of fire (6 m today), one crossing the widest part 4.3 m (6 m); a zombie
  off to the side or behind is no longer hit; standing just behind the impact is now safe beyond the back.
- **Proposal Q4 (open, recommendation followed):** the aim marker shows the full-size teardrop along the throw, cut at
  the first blocker, in today's marker line.

## Acceptance Criteria

### Sim / balance (shared package): a game change

1. **Balance.** `consumables.json › molotovs`: `radiusM: 3` is replaced by `cone: { reachStartM: 2, reachEndM: 4.5,
   growS: 1, halfAngleDeg: 35, backM: 0.8 }` (`durationS` 4, `damagePerS` 8, `pulseS` 0.5 unchanged). `balanceSchema.ts`:
   a `molotov` needs `cone` (ranges: reach 0.5–8, growS 0–3, halfAngle 5–80, back 0.1–3, start ≤ end) and no longer needs
   `radiusM`; grenades unchanged (the throwable refine at :1257 split by kind). `balance.version` changes: re-pin the golden
   world digests and say which. **Every reader of a Molotov's `radiusM` moves to the cone** (grep `radiusM` across
   `packages/shared` and `apps`): today `render/molotovFx.ts:86` / `:94`, `render/MolotovView.ts:55 / :65 / :77`,
   `render/darkness/darknessPlan.ts:318`, `GrenadeView.drawThrowMarker` (:178, its `radiusM` argument from the throw
   stats), the bots' cluster radius, `debug/stressScenario.ts`, the HUD / shop text if it prints the radius.
2. **Shape.** The teardrop is MO-R's `sdCone` exactly (the page's "uneven capsule": back circle r0 = backM at the impact,
   front circle r1 = r0 + d·sin(half) at d = (reachEnd − backM) / (1 + sin(half)) ahead, i.e. d 2.35 m, r1 2.15 m at
   full size), in the zone's frame (x along the throw from the impact). It **grows self-similarly from the impact**:
   scale k(age) = (reachStart + (reachEnd − reachStart) · easeOut(age / growS)) / reachEnd with
   `easeOut(x) = 1 − (1 − clamp01(x))³` (the page's `kit.ts:156`), age in ticks × `TICK_DT_S`; a body of radius r burns
   when `sdCone(p / k) · k < r` (strict, like M-A today). Precompute the shape constants once; no allocation.
3. **Direction.** The throw direction is fixed at landing: `combat/grenades.ts › landConsumable` (:288-297) knows the
   throw's start and target (`target.x0, y0 → x, y`); `igniteMolotov(world, item, x, y, owner, dirX, dirY)` stores the
   unit direction per slot (pre-allocated `Float32Array`s in `MolotovZones`). A zero-length throw can't happen (minThrowM
   2) but falls back to (1, 0).
4. **Stops at walls.** At ignite, `clipM` = the distance from the impact along the throw to the first shot blocker
   (`shotBlockT(world, x, y, x + dirX·reachEnd, y + dirY·reachEnd)`; walls, cars, the bus, buildings; barricades and
   sandbags don't block, as M-D), stored per slot. A point burns only if its along-throw coordinate is ≤ `clipM`, **and**
   the M-D cover rule from the impact still applies (`molotovZoneAt` :73-92: clear line from the zone's centre, the
   `fireFaceToleranceM` face rule kept). A zone lit against a wall face (centre pulled back `faceBackoffM`) burns its back
   part and almost nothing forward: tested.
5. **Ticks.** The zone's life is `durationTicks` as today (M-C); the growth is a function of `world.tick − startTick`
   (store `startTick` per slot; `areaPool` already keeps the spawn tick: reuse it). Lifetime, the cap
   (`maxLiveMolotovZones` 8, oldest replaced), the per-body fire clock in `decay/fire.ts › updateFires` (M-B: one clock
   over car fires and zones, no double hit) and the build-start clear (`clearMolotovZones`) are unchanged.
6. **`molotovZoneAt`** keeps its signature and slot order (deterministic): the circle overlap becomes the teardrop test
   (AC 2) + the clip (AC 4) + cover (M-D). Callers `decay/fire.ts:99` (players) and :167 (zombies) unchanged. A cheap
   bounding-circle reject first (centre at d/2·k, radius (d/2 + r1)·k + r) so 150 zombies × 8 zones stays cheap.
7. **Net.** `molotov.ignited` (kind **40**, number kept) appends the direction as a u8 heading (`net/heading.ts ›
   quantizeHeading`) at index 6 and `clipM` in cm at index 7; decode reads them when present (older payloads: dir from the
   launch ring fallback, clip = reachEnd). SimEvent type (`core/simEvents.ts:211`) gains `dirX, dirY, clipM`. The client's
   heading-quantised direction is the one the **sim** uses too: quantise at ignite and store the quantised vector, so the
   drawn cone and the burning cone are the same to the bit. Round-trip test in `netEvents.test.ts`.
8. **Saves.** Zones are waves-only and cleared at build start; check `save/runSave.ts` / `restore.ts` for molotov slots
   (if stored, add the new per-slot fields and bump the save schema per its rule; if not, say so).
9. **Bots.** `bots/botPolicy.ts` (Story 5.12's densest-cluster throw, :216, :606): for a Molotov, aim so the cone covers
   the cluster: target = cluster centre − dir · (reach at ~0.5 s ≈ 2.3 m · ½), clamped to the throw range, dir = bot →
   cluster; test that a bot's Molotov burns more of a lined-up pack than a throw at the centre.

### Client

10. **The zone drawn as MO-R** (`render/MolotovView.ts` + `render/molotovFx.ts`; textures from the `molotov` atlas, 9.6).
    Goal: "it lands HERE; the fire runs forward in the throw's direction and grows from a 2 m to a 4.5 m cone in 1 s;
    inside it you burn; and now it's ending". One shape for all: fuel (a puddle where the bottle broke, a fan thrown
    forward that widens with the cone, fingers and drops at the front), flames on the fuel lit by a front running out at
    5 m/s (tall on the puddle and spine, low on the fingers, leaning downwind), the light pool held 0.3 m inside the edge,
    heat on the ground ending exactly on the edge (warmest along the spine, last 0.25 m faded inside), a heat line 0.1 m
    inside the edge brightening on each 0.5 s damage tick (FI-R's quieter style), glass shards and a 0.12 s ignition
    whoosh at the impact, thin soot downwind (may cross the edge); all scaled by the same k(t) from the event's age and
    cut at `clipM`. Fade: thin fuel goes out first over the last 0.6 s (`MOLOTOV_FADE_S`), the zone keeps its size to the
    end. A teardrop scorch stays after (its own mark pool, 8 slots, 30 s or the next build). **No ring and no edge flames**
    (today `FX_MOLOTOV_RING` at 0.55 and Story 5.12's edge flames; the ring popping off at the end is gone with it).
    Peak 69 sprites (54 ADD); `?fx=low` 28 flames, 4 smoke (≈ 40) (today MolotovView forces low: :34).
11. **Direction from the event** (AC 7): `molotovFx.ts` drops the launch-ring guess (`LAUNCH_RING` 64, z.dir from the
    matching launch point) except as the fallback; `MolotovZoneDraw` gains `clipM` and the scale function.
12. **Not FireView's pool mode** any more: MolotovView draws its own pooled sprites. Don't edit `city/FireView.ts` (9.17
    owns it); if 9.17 has landed, delete the dead pool-mode path (`setPool`, `setPoolBudget`, `setPoolSlot`,
    `CarFire.setPool / poolReach`) and its tests in this story; if not, 9.17 deletes it.
13. **Aim marker** (Q4): `GrenadeView › drawThrowMarker` draws the Molotov's full-size teardrop pointing from the thrower
    to the landing spot, cut where the sim would cut it (the client mirror's `shotBlockT`), in today's marker colours
    (`MARKER_OPEN` / `MARKER_BLOCKED`, `MARKER_LINE_M`); hand grenades keep their circle.
14. **Darkness.** The blackout's Molotov light (`darkness/darknessPlan.ts:315-319`, `inp.molotovs` = `molotovView.fires.live`)
    follows the cone: a disc at the cone's centroid with radius ≈ half its length (or the cone's light pool picture): say
    which.
15. **Readability.** "The fire is exactly where it is drawn" (M-A): the client's teardrop and the sim's agree at every
    tick of the growth and at the clip (shared test helper from the shared package, AC 16).

### Tests (every sim test asserts something happened)

16. **Shared:** `combat/consumables.test.ts` › "Molotovs (AC 6; M-A … M-C)" (:404) moved to the teardrop:
    - M-A at 0.01 m steps along and across the edge at ages 0, 0.25, 0.5, 1.0, 3.9 s (stateful sweep, not whole metres):
      in when `sd·k < r`, out otherwise; the back reaches 0.8 m only at full size (0.36 m at landing);
    - growth: reach 2.0 m on the ignite tick, 4.5 m from +20 ticks, ease-out between (checked tick by tick);
    - clip: a car 3 m ahead along the throw → nothing burns past the car's face; a wall to the side → M-D still shields;
    - M-B per-body clock and M-C lifetime / cap unchanged (existing tests green);
    - a scenario sim: 20 Walkers in a lane along the throw, one Molotov → ≥ N burn and some die (assert hits > 0 and
      `molotovStats.kills > 0`), the same pack off to the side → none.
    - `consumables.fuzz.test.ts` (random throws, directions and walls: no NaN, deterministic, zones end on time),
      `netEvents.test.ts` round-trip, `balance.test.ts`, `botPolicy.test.ts` (AC 9).
    - Whole-run sims (`economy/fiveWaveSim.test.ts`, `endlessSim.test.ts`, bot runs) still finish; record the money /
      kill shift from the smaller zone (for 10.8's balance pass), don't tune it.
17. **Client:** `molotovFx.test.ts` (direction and clip from the event; fallback), `NetSimHost.consumables.test.ts`, the
    darkness input test, and a browser check: a solo throw down a street, one at a car, one at a wall; stills of the
    growth (0, 0.25, 0.5, 1.0, 3.5 s) beside the MO-R card; online: two tabs see the same cone.
18. **Perf.** `?stress=150` with 8 live Molotov zones (`debug/stressScenario.ts:384` lights them round the survivor: give
    them directions) within 2 FPS and +1 ms p95 of master at 1× and 4× CPU; the sim's `molotovZoneAt` cost per tick
    with 150 zombies × 8 zones measured (`PERF_ASSERT=1`).

## Tasks / Subtasks

- [ ] T1 Balance + schema (AC 1). *(T1–T5 may start before 9.6 lands.)*
- [ ] T2 `hazards/molotov.ts`: per-slot dir, clip, start tick; `sdCone` + growth in a pure `hazards/molotovCone.ts`
  shared with the client (AC 2–6).
- [ ] T3 `combat/grenades.ts` passes the direction (AC 3).
- [ ] T4 Net (AC 7), saves (AC 8), bots (AC 9).
- [ ] T5 Shared tests (AC 16).
- [ ] T6 `docs/art/photoreal-5/src/atlas/molotov.atlas.ts`; MolotovView / molotovFx (AC 10–12) (after 9.6).
- [ ] T7 Aim marker, darkness (AC 13, 14).
- [ ] T8 Client tests, browser stills, perf, readability sheet 174–177, GDD already updated (check the wording).

## Dev Notes

### The code today (read before touching)

- **`packages/shared/src/hazards/molotov.ts`** (114): `MolotovZones { areas: AreaPool; owner; item; nextId }`;
  `igniteMolotov(world, item, x, y, owner)` :49-62 spawns `AREA_KIND.FIRE` with `s.radiusM` and
  `molotovTicksAt(...).durationTicks`, emits `molotov.ignited {zoneId, item, x, y, playerId}`; `molotovZoneAt(world, x,
  y, r)` :73-92 (strict circle overlap + M-D cover via `shotBlockT`, face tolerance); `ageMolotovZones` :95 (M-C);
  `clearMolotovZones`. Header :1-30 lists the fairness rules M-A…M-D (rewrite M-A for the teardrop). `areaPool.ts`
  (117) is shared with the acid puddles: **don't change its shape test**; the teardrop is molotov-only.
- **`combat/grenades.ts`** (355): `landConsumable` :288-297 (`igniteMolotov(world, item, spec.x, spec.y, …)`); the
  launch event :270-282 carries x/y (start) and tx/ty.
- **`decay/fire.ts`**: players :99 and zombies :167 call `molotovZoneAt` (one per-body fire clock, M-B).
- **`net/netEvents.ts`**: `K.MOLOTOV_IGNITED = 40` (:46); encode :319-321 `[40, zoneId, item, cm x, cm y, playerSlot]`;
  decode :573-574. Heading helper `net/heading.ts:9`.
- **`config/balance/consumables.json`** :21-34 (molotovs: radiusM 3, durationS 4, damagePerS 8, pulseS 0.5, throw 2–8 m
  at 12 m/s); `config/balanceSchema.ts:1229-1259` (consumable schema and refines). `maxLiveMolotovZones` 8.
- **Bots**: `bots/botPolicy.ts:63` (`consumableKind`), :216, :606 (densest cluster in throw range).
- **Stress**: `apps/client/src/debug/stressScenario.ts:384` (`igniteMolotov` round the survivor).
- **Client**: `render/molotovFx.ts` (157: `MolotovFires`, `LAUNCH_RING` 64, `spread = throwVariant`, `MOLOTOV_FADE_S`
  0.6, `envelope`), `render/MolotovView.ts` (97: FireView pool mode, `FX_MOLOTOV_RING` tinted `FIRE_RING_COLOR` at
  `FIRE_RING_ALPHA`, RING_DEPTH 4.34, budget from `consumables.json fx` {particleShare 0.25, smokeShare 0.1,
  edgeSpacingM 1.2, maxParticles 80, maxEdgeFlames 64, maxLights 1}), `render/grenadeFx.ts:70` (`molotov.ignited` →
  `burstAt`, ends the bottle: leave it), `render/GrenadeView.ts › drawThrowMarker` (warm marker when `stats.fire`),
  `sim/NetSimHost.ts:757` (re-emits the event), `darkness/darknessPlan.ts:315-319`. Tests `molotovFx.test.ts`,
  `NetSimHost.consumables.test.ts`, `darkness/darknessView.test.ts`.

### Builder decisions (B-numbers; tell the reviewer)

- **B1 Self-similar growth** (the page's `scaleAt`): the back grows with the cone (0.36 → 0.8 m). If the reviewer or the
  designer prefers a fixed 0.8 m back from landing, it is one constant; the page shows self-similar.
- **B2 Quantised direction in the sim** (AC 7): the sim stores the u8-quantised direction so solo and online agree to
  the bit; error ≤ 0.7°.
- **B3 Clip as a half-plane** along the throw at `clipM`, plus M-D cover: walls to the side are handled by cover, the
  wall ahead by the clip.
- **B4 Bounding-circle reject** before the exact test (AC 6).
- **B5 No new net kind** (kind 40 extended); range 92–93 reserved, unused.
- **B6 GDD** updated by the correct-course (Item and Upgrade System › Consumables); check it matches what you built.

### Guardrails (AGENTS.md §5)

Simulation timers count ticks; no per-tick allocation; no gameplay numbers inline (balance JSON); deterministic (slot
order); Colyseus rules unchanged (no new message); client never changes sim state; `bootTestServer()` for any server
test; own ports; `gate:fast` + `test:slow` (sims, fuzz, bots); every sim test asserts something happened; expect whole-run
sims to shift (5.12 zones are in many runs). Exact version pins.
**Native readiness (AGENTS.md §7):** prefer **no** `NET_PROTOCOL_VERSION` bump (kind 40 gains trailing fields, decoded by
length; `balance.version` already refuses old tabs). If you do bump, NR-3: add the row to `docs/native/protocol-log.md` in
the same PR (7 is reserved by Epic 11: take the next free number and say so).

### Testing

AC 16–18. Use stateful 0.01 m sweeps and oscillation at the edge (AGENTS.md §3), not whole-metre samples.

### Notes for the merge

- **Touches (shared):** `hazards/molotov.ts`, new `hazards/molotovCone.ts`, `combat/grenades.ts`,
  `config/balance/consumables.json`, `config/balanceSchema.ts`, `net/netEvents.ts`, `core/simEvents.ts`, `index.ts`
  (exports), `bots/botPolicy.ts`, maybe `save/*`; tests `combat/consumables*.test.ts`, `net/netEvents.test.ts`,
  `config/balance.test.ts`, `bots/botPolicy.test.ts`, golden digests.
- **Touches (client):** `render/MolotovView.ts`, `render/molotovFx.ts`, `render/GrenadeView.ts` (`drawThrowMarker`
  only), `render/darkness/darknessPlan.ts` (molotov input), `debug/stressScenario.ts:384`, `render/fx/atlas/molotov.*`,
  `docs/art/photoreal-5/src/atlas/molotov.atlas.ts`, client tests, gallery, readability sheet.
- **Overlaps:** 9.17 (GrenadeView flight, FireView pool mode: AC 12); 9.16 / 9.17 edit `controls.json`, this story edits
  `consumables.json` (no conflict) and `balanceSchema.ts` (keep-both); `balance.version` goldens re-pinned by whichever
  lands later (say so).
- **Net kinds:** 92–93 reserved (none used; kind 40 extended). **Readability sheet:** 174–177.

### References

- `docs/art/photoreal-decisions.md` (FX group 5, MO-R and round-3 numbers); `docs/art/photoreal-5/src/fire-r2.ts`
  (`MO_R`, `sdCone`, `scaleAt`, the MO-R look), `fire-gmo.ts`, `kit.ts:156` (`easeOut`); the MO card's findings (what
  the build touches, balance numbers, open points); GDD › Item and Upgrade System; Story 5.12's file (M-A…M-D).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
