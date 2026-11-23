# Story 5.7: The first Brute

Status: done

## Story

As a team,
I want a Brute to show up in wave 5 as a mini-boss,
so that we learn to focus fire and protect our buildings.

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`), pasted verbatim. Every line applies; reviewers check each one.
>
> ```
> EPIC 5 BRIEF (from the Epic 4 retro; reviewers: check each line)
> 1. Own worktree + assigned ports only. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current work branch.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo, NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → mirror → Predictor → devThrottle → snapshotWorld).
> 3. FAIRNESS RULE FIRST: write each mechanic's player-visible rule into the ACs before building (e.g. "standing in a Spitter puddle always hurts at N/s", "a mine never kills its owner's teammates unless friendly fire is on", "a Bloater blast is stopped by cars/bus/buildings").
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (step out on the damage tick, stack traps, place mines on spawns, flamethrower through cover, swap to dodge reloads) and list every attempt and its result.
> 5. Projectiles and areas (grenades, spit, flames, blasts, puddles) respect 4.2 cover: car/bus/buildings stop them, barriers/sandbags only stop bodies; server and the client's cosmetic copy agree; rewound (2.12) hits where applicable.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged.
> 7. Spatial code (traps, mines, Brute charges, knockback, new barricades) gets a builder-written fuzz test: random layouts × decay stages × many ticks; no body inside a box, no stall, zombies reach a player, flow fields rebuild only at build start.
> 8. Randomness only from named seed streams; the card shop uses shop:<slot>:<build>; same seed + input log → same snapshotWorld digest.
> 9. Liveness: every sim/replay/integration test asserts something really happened (kills by the new weapon, ≥ 1 explosion, ≥ 1 trap trigger). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks; no per-tick/per-frame allocation (pool projectiles, puddles, particles); every number in balance JSON, no inline literals.
> 11. Bandwidth: projectiles and effects go out as events (spawn + seed), not per-tick state; report added B/s; total ≤ 30 KB/s (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled, and capped (max live particles/puddles in balance JSON). Run ?stress=150 with the new effects active; report headless FPS before/after with load; the 4.10 phone numbers are the floor, not to be lost.
> 13. Readability: every new zombie and object must be recognisable at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet.
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start, on a late Game scene start; client shows server truth (pending until state agrees).
> 15. Balance: start from the 4.10 earnings decision; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 6-wave sim and assert waves ended.
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added p99 ≤ 2 ms total budget.
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently.
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master.
> ```
>
>
> Most relevant here: 2 (player knockback is predicted: every copy), 3/4 (fairness rules, "Beat the rule"), 6 (the Brute's swing is per body), **7 (Brute knockback on players and the Brute's wide body vs cover/barricades: fuzz test)**, 8 (Brute spawns from the `spawns` stream only), 9 (≥ 1 Brute spawned, hit a player, hit a building, killed), 10 (ticks; numbers in `zombies.json` / `waves.json`), 11 (one more horde record; banner as an event), 12 (Brute frames in the characters atlas), 13 (recognisable at a glance: wide silhouette), 14 (knockback under lag, hidden tab across the wave-5 build start), 16 (third flow field inside the existing budget), 19.

## Acceptance Criteria

### Fairness rules (player-visible; brief line 3; each is tested)

- **F1 "You always see the Brute's hit coming."** Before every hit on a player the Brute stops and winds up for `windupS` **0.5 s** (raised arms, streamed as `ZOMBIE_STATE.WINDUP`); the hit lands only on a standing player whose body is within `contact + swingReachM` (**0.3 m**) of the Brute **at the end of its own windup** (its own clock, never a shared tick). Step away during the windup → no damage, no knockback.
- **F2 "A Brute's hit pushes you 1.5 m straight away from it — never into or through anything."** The knockback (`hitKnockbackM` 1.5 m over `knockbackS` 0.2 s = 4 ticks) slides you with the normal player collision: it stops at cars, the bus, buildings, barricades, turrets, map boxes and the map edge, and it **stops at the edge of a burning 4.8 fire zone** (never pushes you into fire). You cannot steer during those 4 ticks; you can still aim and shoot.
- **F3 "A downed player is never pushed."** If the hit downs you (35 ≥ HP), no knockback.
- **F4 "Your weapons barely move a Brute."** Every pushback and knockback from player weapons and turrets moves a Brute only `knockbackTakenPct` **20 %** (axe 1.5 → 0.3 m, shotgun 0.5 → 0.1 m); crowds push it less than a Walker (overlap is split by body area).
- **F5 "A Brute hurts buildings 3× as much."** 35 × 3 = **105** per hit on a building (wood barricade 200 HP: 2 hits; metal 600: 6 hits; turret 300: 3 hits), at its attack interval; no windup on buildings (it is not dodgeable anyway). It attacks a building only when that building blocks its path (the 3.5 rule).
- **F6 "A Brute never appears on top of you."** It spawns at a spawn point by the 4.3 rules (≥ `spawnMinPlayerDistanceM` + jitter from every standing player), never inside a box, and the first one of the run is announced by a roar + a "Brute!" banner the moment it spawns.
- **F7 "Its body is what you shoot."** Its hit radius for bullets, pellets and melee is its body radius **0.6 m** (the drawn silhouette fits the body: the 4.9 `CHAR_EXTENT_R` rule).
- **F9 "No hiding in a gap the Brute can't enter" (designer, review M1: "long reach into gaps").** A standing player in a slot narrower than the Brute (the 1 m gaps between the parked cars, parking wall ↔ parked_car_1, curb car ↔ se_offices, street_car_west ↔ curb car) is swung at from the slot's mouth with a reach of `gapReachM` **1.8 m** (centre to centre) instead of contact + 0.3 m: the same 0.5 s windup, dodged by stepping beyond 1.8 m (deeper into a long slot, ~2.25 m), never through a wall, car or barricade (the swing needs `meleeLineClear`), knockback as usual. In the open (a player pressed against a car) the reach stays contact + 0.3 m. Every swing lands only closer than its reach minus `swingToleranceM` (1 cm): a body exactly 0.3 m out (a step, or the axe's 0.3 m knock during the windup) is always missed.
- **F8 "Same Brute for everyone."** HP, damage and speed never change with waves or player count (FR27); only how many appear (`waves.json`).

### Behaviour

1. **Balance (FR25).** `zombies.json › types.brute`: `hp 120`, `speedMps 1.0`, `damage 35`, `attackIntervalS 1.5`, `radiusM 0.6`, `reward 25`, `buildingDamageMult 3`, `knockbackTakenPct 20`, `hitKnockbackM 1.5`, `knockbackS 0.2`, `windupS 0.5`, `swingReachM 0.3`, `wideBody true`. New schema fields with defaults that keep every other type unchanged (`buildingDamageMult 1`, `knockbackTakenPct 100`, `hitKnockbackM 0`, `windupS 0`, `wideBody false`).
2. **Type index.** `ZOMBIE_TYPES` appends `"brute"` (append-only: after Round A's `spitter`, and after `bloater` if 5.8 merged first). The horde wire nibble still fits (≤ 15 types).
3. **Waves (FR29).** `waves.json › fixed`: per-wave exact counts not scaled by player count, e.g. `[{}, {}, {}, {}, { "brute": 1 }, { "brute": 1 }]` (wave 5 = first Brute; wave 6 when 5.8 makes the run 6 waves). They are part of the wave size (taken off the mix's share, Walkers first), and the first fixed zombie spawns when `fixedAtFraction` **0.25** of the wave has spawned (not in the opening burst). Later waves (Epic 6) only add entries. `loadBalance` checks `fixed` names known `ZOMBIE_TYPES` and that fixed counts ≤ the smallest wave size (solo × 0.4).
4. **Mini-boss moment.** On every Brute spawn: `zombie.brute_spawned { zombieId, x, y, first }` (shared event, sent to all); `first` = the first Brute of this run (`world.waves.brutesSpawned === 0` before it; in `snapshotWorld`). Client: roar SFX (panned by position) on every spawn; banner "Brute!" (the HudScene banner, `stackBanner`) on `first` only. Placeholder roar in `placeholderSfx.ts` (`zombie_brute_roar`).
5. **AI.** The Brute chases like a Walker (no flanking), but with its wide body it follows the **wide chase field** (D1). On contact with a standing player it enters WINDUP (0.5 s, stands still, keeps facing), then resolves F1/F2/F3; then its attack interval (1.5 s) runs. On a blocking building it hits it for 105 per interval (F5). It never enters a fire zone voluntarily (fire nav cost on the wide grid too).
6. **Player knockback (shared, predicted).** `PlayerState` gains `knockTicks` (ticks left), `knockDx`, `knockDy` (int8: the unit direction × 127, so server and Predictor read the same numbers). `movePlayers`: while `knockTicks > 0` the move is `(knockDx, knockDy)` normalised (sqrt, no trig) × `hitKnockbackM / knockbackTicks` per tick instead of the input move, through `pushOutOfBuildings`, and stopped before entering a burning fire circle (`circleInFire`); `knockTicks` counts down like `slowTicksLeft` (applied seqs only on the server).
7. **Network.** Schema `PlayerState.knockTicks` (uint8), `knockDx`, `knockDy` (int8); `syncState`, `resetRunFields`, `PlayerStateView` + `PLAYER_STATE_FIELDS`, `fakeRoom`; `Predictor.reconcile(...)` rebases them with the position (the 3.9 slow pattern: the knock set on tick T moves ticks T+1…T+4 on both sides). Brute position/state go in the existing horde stream.
8. **Look (T0 pick).** A wide, heavy silhouette (GDD readability: "Brute wide"), its own frames `zombie_brute_<variant>` in the characters atlas, a WINDUP pose (arms raised / chest swelling) readable at a glance, a heavier hit flash; added to the readability sheet (brief 13).
9. **Tests:** stats; F1–F8 each; wave 5 has exactly 1 Brute at every player count; spawn timing; banner `first` only once per run; knockback vs every obstacle kind and fire; prediction agreement under lag; wide-field reachability; fuzz; bandwidth; tick cost; 6-wave sim liveness (Brute spawned, killed, reward paid).

## Tasks / Subtasks

- [x] ~~**T0 Art pick (first; brief 13).**~~ Skipped on the coordinator's instruction: the designer's round-B decision (`docs/epic-5-decisions.md`) already picked the looks: all five code drawings BR1–BR5 as random variants, ported in `render/city/bruteArt.ts` (no Meshy, no `docs/art/5-7/README.md`). ~5 Meshy proposals (`nano-banana-pro`, 4.11's shared style line; top-down, at in-game scale next to a Walker for size): **BR1** hulking riot-cop zombie with a cracked vest, **BR2** huge construction worker in a torn hi-vis jacket, **BR3** shirtless butcher with a stained apron, **BR4** bouncer in a burst black suit, **BR5** firefighter zombie in heavy turnout gear. For the pick, each also gets its WINDUP pose sketch. One private proposal page; the designer picks; record in `docs/art/5-7/README.md` (+ images). Nothing drawn before the pick. (AC 8)
- [x] **T1 Balance + schema** (AC 1, 2, 3)
  - [x] `balanceSchema.ts › zombieTypeSchema`: `buildingDamageMult` (≥ 1, default 1), `knockbackTakenPct` (int 0–100, default 100 — **shared with 5.2: add once**), `hitKnockbackM` (≥ 0, default 0), `knockbackS` (> 0, default 0.2), `windupS` (≥ 0 ≤ 5, default 0 — **reuse Round A 5.6's Spitter windup field if it exists**), `swingReachM` (≥ 0, default 0), `wideBody` (bool, default false).
  - [x] `waves.json › fixed` + `fixedAtFraction` (schema in `wavesSchema`); `balance.ts › crossCheck`: fixed types exist and are in `ZOMBIE_TYPES`; fixed count ≤ smallest wave size; the radius check becomes: non-wide types ≤ `MAX_PATHING_ZOMBIE_RADIUS_M` (0.35), wide types ≤ `MAX_PATHING_ZOMBIE_RADIUS_M + nav.wideInflateM` (D1); `spawnClearM` > jitter + the largest radius (2 > 1 + 0.6 ✓).
  - [x] `zombieTypes.ts › ZOMBIE_TYPES` append `"brute"`; `ZOMBIE_STATE.WINDUP` (reuse 5.6's).
  - [x] Tests `config/balance.test.ts` (+ `brute matches the GDD`, `fixed counts validated`, `a wide body over the wide limit is refused`).
- [x] **T2 Wide-body pathing** (AC 5; D1)
  - [x] `zombies/flowField.ts`: `PathingState.wide: NavGrid` = a second `createNavGrid` whose solids (map boxes, active cover) and rasterized buildings are grown by `inflateM` = `max(wide radius) − MAX_PATHING_ZOMBIE_RADIUS_M` (0.25 m), so the existing clearance rule (body ≤ 0.35 m) holds for the Brute; the building ids stay on the grown cells (a Brute blocked by a barricade attacks it). `setNavWalls`/`setNavFires` write both grids (fires grown by the wide radius); `rasterizeBuildings` re-rasterizes both on `buildings.version`.
  - [x] `FlowField wideChase` on `wide`, advanced only while a `wideBody` zombie is alive, sharing `rebuildCellsPerTick` round-robin with chase/flank (the 3.8 pattern; `flowFieldMaxAgeTicks` covers 3 fields). No extra cells per tick.
  - [x] `zombieAi.ts`: a `wideBody` type steers by `wideChase` (and checks LOS with its own radius, already per type).
  - [x] `snapshotPathing` includes the wide grid/field hashes.
  - [x] Tests `flowField.test.ts` (+ `wide grid closes a 1.0 m gap the chase grid keeps open`, `wide field idles without a Brute`, `walls rebuilt only at build starts on both grids`), `zombieAi.pathing.test.ts` (+ `a Brute routes around a barricade gap it doesn't fit and breaks the barricade when that is the only way`).
- [x] **T3 Brute AI, damage, knockback** (AC 5, 6; F1–F5)
  - [x] `zombieAi.ts`: WINDUP state per zombie (`pool.state`, a new `pool.windupTicks: Uint8Array` or 5.6's): enter on contact with a standing player when `attackCooldownTicks === 0` and `windupS > 0`; stand still while winding up; at 0 → `swingHits(contact + swingReachM)` → `damagePlayer` + `knockPlayer`; then `attackCooldownTicks = ticksFor(attackIntervalS)`. Types without `windupS` keep today's instant hit (unchanged code path).
  - [x] Building hits: `damageBuilding(world, b, stats.damage * stats.buildingDamageMult)`.
  - [x] `player/knockback.ts` (new, shared): `knockPlayer(p, fromX, fromY, stats)` sets `knockTicks`, `knockDx/Dy` (int8 quantised); not for downed/out; `movePlayers` applies it (AC 6), stopping at boxes (push-out) and fire edges.
  - [x] Weapon/turret knockback on the Brute: `knockbackTakenPct` in `applyZombieDamage`'s pushback and in 5.3's `applyKnockback` (5.2 adds it there too: whoever merges first).
  - [x] `resolveOverlaps`: split each overlap by body area (`r_j² / (r_i² + r_j²)` to i), equal radii → ½ as today (no change for existing types; test it).
  - [x] Tests `zombies/brute.test.ts` (new): `stats and reward`, `windup 10 ticks then the hit`, `stepping out during the windup dodges it`, `hit = 35 damage + 1.5 m knockback away from the Brute in 4 ticks`, `knockback stops at a barricade, car, bus, building, turret, map edge` (every approach angle 0–345° step 15°), `knockback stops at a fire edge`, `no knockback when the hit downs`, `105 damage to a building per hit (wood 2 hits, turret 3 hits)`, `axe moves a Brute 0.3 m, pistol pushback 20 %`, `overlap: a Walker moves the Brute 25 %`, `per-body windup: two Brutes on two players are independent`.
- [x] **T4 Waves + mini-boss event** (AC 3, 4; F6)
  - [x] `waves/waveDirector.ts › beginWave`: `fixed` counts into `typeTarget` (taken off Walkers, then the largest share); `waveZombieType` holds fixed types until `fixedAtFraction × size` have spawned, then serves them first; `world.waves.brutesSpawned` counter (reset per run, in `snapshotWorld`); emit `zombie.brute_spawned`.
  - [x] `core/simEvents.ts` + `net/netEvents.ts` (encode/decode; zombie net id), `eventInterest.ts`: sent to everyone (it is a team cue).
  - [x] Client: `GameScene` (banner on `first`, roar on each), `audio/placeholderSfx.ts` (`zombie_brute_roar`), `render/ZombieView.ts › LOOKS.brute` (depth above Walkers, cue roar), `render/city/spriteArt.ts › drawZombie` + `CHAR_EXTENT_R.brute` + WINDUP frame, `spriteAtlas.ts` frames (atlas ≤ 2048²: `atlasLayout.test.ts`).
  - [x] Tests `waveDirector.test.ts` (+ `wave 5 has exactly one Brute at 1–4 players`, `it spawns after 25 % of the wave`, `spawns stream only: same seed → same Brute spawn point`), `GameScene`-free tests for the banner rule (hudModel / toast queue), `NetSimHost` (+ `brute_spawned decoded; banner once per run`).
- [x] **T5 Prediction copy** (AC 6, 7; brief 2, 14)
  - [x] Schema `knockTicks/knockDx/knockDy`, `syncState` (on change), `resetRunFields`, stateView key list, `fakeRoom`, devThrottle (key list), `NetSimHost` mirror (client World player), `Predictor.reconcile(ackSeq, x, y, status, slowTicks, slowPct, knockTicks, knockDx, knockDy)`; the Predictor's World has the map, buildings (`mirrorBuildings`) and fires (`syncDecay`), so the stop rules match.
  - [x] Tests `net/prediction.test.ts` (+ `knockback predicted after the ack: 0 corrections in the open, against a barricade, at a fire edge`), `tools/netsim/brute.test.ts` (new: `?lag=150&jitter=20`, a Brute hits the bot player 5×: client position = server at every ack, no snap ≥ 1 m from a knockback, corrections recorded), `syncState.test.ts` (+ `knock fields synced and reset`), `NetSimHost` hidden-tab test across the wave-5 build start (`window.__game.loop.sleep()/wake()` in the browser check; Vitest: apply a state that jumped across the Brute spawn).
- [x] **T6 Fuzz, reachability, bandwidth, perf, sims** (brief 7, 9, 11, 15, 16)
  - [x] `zombies/downtown.fuzz.test.ts` (extend): random barricade/turret layouts × every decay stage and variant mask (incl. 4.8 fires; 5.9 metal barricades/spikes/mines if merged) × ≥ 3,000 ticks with Brutes in the mix and bots standing next to cover: **no Brute centre inside a (grown or real) box**, **no player inside a box or a fire after a knockback**, **no stall: every Brute reaches a player or a building it attacks**, **wide/chase fields rebuild walls only at build starts**; liveness: ≥ 1 knockback per layout, ≥ 1 Brute building hit, ≥ 1 Brute kill.
  - [x] Reachability: a lone Brute from every spawn point × every stage reaches the team start (the 4.5 reachability pattern), with the wide field.
  - [x] Bandwidth: one Brute in view adds one 8 B horde record at 20 Hz = **160 B/s** per phone (as one more Walker); `brute_spawned` ~20 B per spawn; knock fields ~3 B per hit. Assert in a bandwidth test (`decayBandwidth.test.ts` pattern) and report.
  - [x] Tick cost (`tickCostFlowField.test.ts` + case, `PERF_ASSERT=1`): 150 zombies incl. 2 Brutes, 3 fields: added p99 recorded with load (≤ the 2 ms Epic budget).
  - [x] 6-wave sim (`economy/fiveWaveSim.test.ts`, 6 waves once 5.8 lands; else `runWaves` override 5): assert waves ended, a Brute spawned in wave 5, was killed, and its 25 reward (+ assists) was paid (brief 9, 15).
- [x] **T7 Gates.** Mutations (e.g. windup skipped → dodge test; knockback without push-out → fuzz; fire stop removed → fire test; `buildingDamageMult` ignored → building test; Brute on the chase grid → reachability/fuzz; `first` always true → banner test) and which tests failed. Browser check (Playwright): solo `?wavemix=brute` and the real wave 5 (`?wallet=` + build Ready ×4), online two tabs with `?lag=150&jitter=20`: banner once, roar, windup visible, knockback slides, stops at a barricade. `typecheck && lint && test && build`. Merge notes.

## Dev Notes

### Designer decisions to confirm (made non-interactively; recommended values)

1. **Brute body radius 0.6 m** (1.2 m wide, ~1.7× a Walker; GDD "Brute wide"), needing the wide-body pathing (D1). Alternative: 0.35 m body drawn larger (rejected: bullets would miss what you see, F7). Recommended: 0.6.
2. **Windup telegraph 0.5 s before each hit on a player, dodgeable by stepping 0.3 m out** (GDD "every special attack has a readable warning", FR84). Alternative: no windup. Recommended: 0.5 s.
3. **Attack interval 1.5 s** (with the 0.5 s windup: one hit per ~2 s ≈ 17.5 dmg/s on a player who stays). Alternative: 1.0 s (the general zombie rule). Recommended: 1.5 s.
4. **Player knockback 1.5 m over 0.2 s, no steering, can still shoot; stops at cover and at fire edges.** Recommended: yes.
5. **Exactly 1 Brute in wave 5 at every player count** (not scaled), 1 in wave 6; spawns after 25 % of the wave. Recommended: 1 / 1 / 25 %.
6. **"Brute!" banner only for the first Brute of a run; roar for every Brute.** Recommended: yes.
7. **Brutes take 20 % of all pushback/knockback, and crowd overlap splits by body area** (a Walker moves it 25 %). Recommended: yes.
8. **Brute art**: BR1–BR5 (T0); recommended starting point **BR2** (hi-vis construction worker: the hi-vis reads at night without an outline aid).

### Decisions (developer guidance)

- **D1 Wide-body pathing by grown boxes.** The loader refuses radii > 0.35 m today because the flow field's clearance rule (`MAX_PATHING_ZOMBIE_RADIUS_M`, flowField.ts header "Clearance (3.5 review H1)") assumes a body fits a free cell diagonal. Instead of a new clearance rule, a second NavGrid with every solid and building grown by 0.25 m makes a 0.6 m body behave like a 0.35 m one on it. Same Dijkstra, same budget (round-robin; the field idles without a Brute: 1–2 per wave). Push-out and collision still use the true radius against the true boxes (no change in `collision.ts`).
- **D2 Windup per body** (brief 6): its own `windupTicks`, never a world pulse; the resolve checks distance at that tick.
- **D3 Knockback direction as int8 components**, not a heading (movement code may not use sin/cos: prediction rule in `movement.ts`).
- **D4 The hit and the knock happen in the zombie system of tick T**; `movePlayers` of T+1…T+4 slides the player (same ordering as the Crawler slow, Story 3.9).
- **D5 Fixed counts are part of the wave** (the wave size and "remaining" stay as today; the last-5 rush may include the Brute: allowed).
- **D6 Kill credit** as any zombie (25, assists 50 %, turret kills pay the owner 50 %).

### Current state (read before changing)

- `zombies/zombieTypes.ts`: `ZOMBIE_TYPES = ["walker", "crawler", "runner"]` (+ Round A `spitter`), `ZOMBIE_STATE { FREE, CHASE, RUSH }` (+ 5.6's windup), `maxZombieRadius` (cached; query margins grow with the Brute: fine).
- `zombies/zombieAi.ts › updateZombies`: pass 1 velocities (LOS via `segmentHitsBuildings`/`segmentHitsFire`, chase/flank fields via `steerByField`), separation, apply, `resolveOverlaps` (½ each), pass 4 contact + attack (`damagePlayer` instant, `damageBuilding(world, b, stats.damage)`), push-out.
- `config/balance.ts › crossCheck`: radius ≤ 0.35 m, `spawnClearM` > jitter + radius, mix types ∈ `ZOMBIE_TYPES`.
- `waves/waveDirector.ts`: `waveSize`, `waveMixOf`, `waveTypeCounts` (exact shares), `waveZombieType` (furthest behind its share), `spawnWaveZombie` (`streams.spawns`, `pickSpawnPoint`, `jitteredSpawn` with the type's radius).
- `zombies/flowField.ts`: one NavGrid, `chase` + `flank` fields, `setNavWalls` at decay changes (build start), `setNavFires`, `rasterizeBuildings` on `buildings.version`.
- `player/movement.ts › movePlayers` (shared with the Predictor), `player/slow.ts` (the integer-on-the-wire pattern to copy), `Predictor.reconcile(ackSeq, x, y, status, slowTicks, slowPct)`.
- Client: `ZombieView.LOOKS` is `satisfies Record<ZombieTypeId, …>` (a new type is a type error until added); `spriteArt.drawZombie`, `CHAR_EXTENT_R`; `HudScene` banners (`stackBanner` in `GameScene`); `shriekCue.ts` is the Runner's cue pattern.

### Must be preserved

Walker/Runner/Crawler/(Spitter) behaviour bit-for-bit (equal radii overlap split; no windup for types without `windupS`); 3.5 attack-the-blocking-building rule; 3.8 flank budget; 4.3 spawn rules; 4.5 reachability; 4.8 fire rules; 2.12 rewind (per-type radius); prediction = server.

### Copies touched (brief 2)

World (`PlayerState.knockTicks/knockDx/knockDy`, `pool.windupTicks` if not 5.6's, `waves.brutesSpawned`, `pathing.wide` + `wideChase`) → schema (`knockTicks`, `knockDx`, `knockDy`) → `syncState` (+ reset) → `PlayerStateView` / `PLAYER_STATE_FIELDS` → `fakeRoom` → devThrottle (key list) → mirror (`NetSimHost` player copy; zombies via the horde stream with the new type index and WINDUP state) → Predictor (`reconcile` + the knock in `movePlayers`) → `snapshotWorld` (knock fields, windup ticks, `brutesSpawned`, wide pathing hashes).

### Beat the rule (for the reviewer; brief 4)

1. Stand in a 0.9–1.1 m gap between two barricades: does the Brute get stuck, clip through, or break one? (It must route or break, never clip or stall.)
2. Kite the Brute in circles at 4.5 m/s: can it ever land a hit (it shouldn't if you keep moving; that's the skill)? Can you stand still and dodge every windup by stepping 0.3 m on the last tick (allowed; check it's exactly the rule).
3. Get knocked toward a car, bus, building, barricade, turret, the map edge and a burning car: ever inside a box, inside a fire, or through a barricade?
4. Get knocked with `?lag=150&jitter=20`: rubber-band or snap?
5. Cage the Brute's spawn with barricades (the 4.3 penning question, HANDOFF §7.2): how long does it take it to break out (105 per hit)?
6. Axe/shotgun the Brute into a corner repeatedly: more than 20 %?
7. Hide behind a turret line: the Brute's 3× building damage should make it fall; measure turret survival time.
8. A downed player next to the Brute: pushed? hit again? (Neither.)
9. Hidden tab during the wave-5 build start, wake after the Brute spawned: banner shown late? Twice? (Once, or skipped if the event was before the wake: decide and test.)
10. Solo × 0.4 wave 5 (80 zombies): still exactly 1 Brute.

### Bandwidth (brief 11)

+160 B/s per Brute in view (one horde record), +~20 B per Brute spawn event, +~3 B per knockback (schema patch). Total stays far under 30 KB/s (horde ≤ 24 KB/s unchanged: the Brute replaces one Walker in the count).

### Phone FPS (brief 12)

New: Brute frames (normal + windup, 2–3 variants) in the characters atlas (bigger frame: `2 × 0.6 × CHAR_EXTENT_R × CHAR_R_PX`; check ≤ 2048²), no new effect pools (hit flash and banner exist). Server: the third flow field shares the existing cell budget (no extra per-tick cells). Run `?stress=150` with `?wavemix=walker,brute` before/after; report headless FPS + server tick p99 with load.

### Dependencies

- **Round A 5.6 (Spitters)**: introduces a windup state and probably `windupS` + a per-zombie windup clock + the `spitter` type index. Reuse them (do not add a second windup mechanism); append `brute` after `spitter`.
- **Round A 5.9 (metal barricade 600 HP, spike trap, mine)**: Brute × 3 = 105 per hit vs metal (6 hits); spike traps slow it (40 %) and damage it (4/s); a mine (80) doesn't kill it (120 HP). Include them in the fuzz if merged. Mines and spikes are not blocking: the wide grid ignores them.
- **Round A 5.3 (Shotgun)**: `combat/damage.ts › applyKnockback` (swept); pellet knockback 0.5 m → 0.1 m on a Brute via `knockbackTakenPct` inside it. Its box test grows boxes by the zombie's radius: confirm it reads the per-type radius (0.6 for the Brute).
- **5.2 (Fire Axe, parallel)**: uses 5.3's `applyKnockback`; `knockbackTakenPct` is added once by whichever of 5.2/5.7 merges first. Axe → 0.3 m on a Brute.
- **5.1 (upgrades, parallel)**: no overlap; Hunting Rifle IV (61.25) kills a Brute in 2 shots (5.1 test).
- **5.8 (Bloaters, later)**: sets `runWaves` 6 → the wave-6 Brute entry becomes live.

### Notes for the merge (brief 19)

- `zombieTypes.ts › ZOMBIE_TYPES`: append-only; resolve conflicts by order of merge (`spitter`, then whichever of `brute`/`bloater` lands first). The wire carries the index: never reorder.
- `balanceSchema.ts › zombieTypeSchema`: 5.6 adds spit fields + windup, 5.2 adds `knockbackTakenPct`, this story adds the rest: one strict object, defaults for all.
- `zombieAi.ts`: 5.6 adds the Spitter's keep-distance + spit branch in the same passes; keep each type's branch behind its balance flags; the windup state machine is shared.
- `flowField.ts`: 5.9 may rasterize new building kinds (metal barricade = a building; spike trap = not blocking): the wide grid must use the same rasterize rules + growth.
- `waves.json` / `waveDirector.ts`: 5.6 adds `spitter` weights to `mix[3+]`; `fixed` is a new key beside `mix`.
- Schema / stateView / fakeRoom / `Predictor.reconcile`: 5.2 adds nothing to schema; Round A may add fields: append all.
- `GameScene.ts` / `ZombieView.ts` / `spriteArt.ts` / `placeholderSfx.ts`: Round A adds Spitter art and sounds in the same tables: append.

### References

- `epics.md` › Epic 5 intro (temporary run grows to 6 waves), Story 5.7; FR25, FR26, FR27, FR29, FR84.
- GDD › Enemy Design and AI (Brute row, telegraphs, introduction order W5), Buildings (Brutes 3×), Difficulty Curve (wave 5 spike), Readability rules ("Brute wide"), Zombie cues (Brute roar).
- `game-architecture.md` › Zombie Pathfinding (flow fields), Entity Patterns (SoA pool).
- Story files 3.5 (flow field, attack the blocking building), 3.8 (flank field budget), 3.9 (slow prediction), 4.3 (spawns), 4.5 (reachability), 4.8 (fire, `circleInFire`), 4.9 (`CHAR_EXTENT_R`).

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (`claude-opus-5-5`), builder in worktree `.claude/worktrees/story-5-7` (branch `story-5-7`), method `gds-dev-story`, 2026-11-23. Ports: Vite 5577 (temporary `vite.story57.config.ts`, deleted), server 4577 (stopped by PID).

### Debug Log References

- **The wide grid, first version (whole-cell growth + the 3.5 pinch rule) was too strict:** a 1.5 m gap became a closed one-cell lane, so a Brute from `alley_3_mouth` at stage 2 never got past the dumpster (1.5 m left for a 1.2 m body). Fix (D1 refined): on the wide grid every box is grown by a whole cell, so every free cell centre is ≥ 0.75 m from every real box and so is every orthogonal step between two free cells → the wide grid has **no pinches** (a one-cell lane is a 1.5 m gap, which the Brute fits); diagonals still need their vertex free. Tested (`flowField.test › closes a 1.0 m gap, keeps 1.5 m open`; mutant "wide grid with pinches" killed).
- **Spawn jitter:** the 3 m alley mouths cannot hold a 1.2 m body jittered ±1 m (the map tests grow each spawn area by the largest radius). New rule `spawnJitterFor(r) = spawnJitterM − max(0, r − 0.35)` (0.75 m for the Brute): jitter + radius never exceeds a Walker's 1.35 m. One draw from `spawns` as before (the type is now chosen first; it draws nothing). The map/panic/obstacle tests check every type's own area.
- **Cornered players:** on the wide grid a player pressed against a box stands in a grown wall cell (never entered) → no field (fuzz seeds 2, 13). `seedAround`: the field starts from the nearest free ring of cells round such a player (up to 6 cells, never across a map solid — the first version seeded the far side of the parking wall). A player in a slot narrower than the Brute (1 m between bus and car) is seeded from the slot's mouths: the Brute waits there.
- A Brute body standing in a grown wall cell steers from the best reached cell next to it (`flowNearestReachedCell`).
- **Overlap pairs:** a Walker's overlap query (2 × 0.35 + margin) misses a Brute 0.9 m away; pairs are now handled by the bigger body (equal bodies: the lower id, unchanged), so Walker-only crowds are bit-for-bit as before.
- **Crowd jams in the reach tests:** with a Brute per spawn, 70 bodies no longer fit in the 3 m circle the 4.5/4.7/4.8 reachability tests use; those tests now remove a zombie once it reached the team. In 4.8's fire test a 1.0 m/s Brute once shoved a 0.7 m/s Crawler into the street_west fire (seed 12, 1 of 95); the test now spawns Brutes in a second batch (it checks pathing, not crowd shoves). Noted below as Beat-the-rule 11.
- Net event kind: 31 was taken by 5.1 (`WEAPON_UPGRADED`) → `BRUTE_SPAWNED: 32`.
- Browser check: the Vite dep optimizer cached the stashed (pre-5.7) shared package after the FPS "before" run (Brutes silently became Walkers in `?wavemix`); restarted Vite with `--force` before the "after" numbers.
- The shared scratchpad holds other builders' files (a `record.md` of 5.1 almost went into this story); my scratch files are under `scratchpad/s57/` and the named scripts `brute_check.mjs`, `fps.mjs`, `mutate.py`.

### Completion Notes List

**What was built (all simulation in `packages/shared`)**

- **Balance:** `zombies.json › types.brute { hp 120, speedMps 1.0, damage 35, attackIntervalS 1.5, radiusM 0.6, reward 25, buildingDamageMult 3, knockbackTakenPct 20, hitKnockbackM 1.5, knockbackS 0.2, windupS 0.5, swingReachM 0.3, wideBody true }`, `pathing.wideInflateM 0.25`; `waves.json › fixed [{},{},{},{},{brute:1},{brute:1}]`, `fixedAtFraction 0.25`. Schema defaults keep every other type unchanged (`knockbackTakenPct` is 5.2's field, defined once after the merge). `crossCheck`: per-type radius limit (0.35 m, or 0.35 + `wideInflateM` for `wideBody`), fixed counts name known `ZOMBIE_TYPES` and fit the smallest (solo) wave.
- **Type index 4** `brute` (append-only). Windup reuses 5.6's `ZOMBIE_STATE.WINDUP / RUSH_WINDUP` and the per-zombie `spitTicks` clock (Brutes have no spit) — no second mechanism.
- **Wide-body pathing (D1):** `PathingState.wide` (NavGrid with `inflateM`: map solids, active cover, wall buildings and the map edge grown by a whole cell; fires grown by 0.6 m) + `wideChase` field; it joins the round-robin only while a wide body lives (`activeFields` 1–3, `tick % active`; chase + flank alone is exactly 3.8's even/odd split); `flowSharedMaxAgeTicks` = 2 × max(2, active) × P (6P with three fields). `setNavWalls/setNavFires` write both grids (`applyDecayStage`), `rasterizeBuildings` grows buildings on the wide grid (ids stay on the grown cells: a blocked Brute attacks the barricade), `decayFinish` rebuilds the wide field only if a Brute lives. `snapshotPathing` covers the wide grid and field.
- **AI (`zombieAi.ts`):** a windup type touching a standing player with its attack ready stands still for `windupS` (10 ticks, its own clock), then `resolveSwing`: the nearest standing player strictly closer than contact + `swingReachM` takes 35 and the knockback (not when the hit downs); the attack interval runs either way. Building hits × `buildingDamageMult` (no windup on buildings). Types without `windupS` keep the instant bite (unchanged path). Overlap split by body area (`r_j²/(r_i²+r_j²)`).
- **Knockback (`player/knockback.ts`, new):** `knockPlayer` sets `knockTicks` (4), `knockDx/Dy` (unit × 127, int8) and `knockStepMm` (375); `stepKnock` in `movePlayers` (shared with the Predictor) slides 0.375 m per applied seq through `pushOutOfBuildings` (cars, bus, buildings, barricades, turrets, map boxes, edge) and ends the knock instead of entering a burning fire; no steering while knocked (aim still follows input); a downed body's knock is cleared. *Deviation:* a fourth field `knockStepMm` (uint16) carries the per-tick distance (the story listed three); it keeps the step per hitting type without a type lookup in movement.
- **Weapons/turrets on a Brute (F4):** 5.2's `knockbackShare` (`knockbackTakenPct`/100) in `applyKnockback` and the pushback (my copy was dropped at the merge in favour of 5.2's identical helper).
- **Waves (F6, AC 3):** `applyFixedCounts` folds fixed zombies into `typeTarget` (Walkers give the slot first, then the largest share); `waveZombieType` holds them until `fixedAt = round(size × 0.25)` spawns, then serves them first; `brutesSpawned` counts per run; `announceSpawn` (wave director, dev ring, dev "in view") emits `zombie.brute_spawned { zombieId, x, y, first }`.
- **Wire:** `NET_EVENT_KIND.BRUTE_SPAWNED 32` (10 B), global in `EventInterest` (team cue); schema `knockTicks uint8, knockDx int8, knockDy int8, knockStepMm uint16` → `syncState` (on change) + `resetRunFields` → `PlayerStateView`/`PLAYER_STATE_FIELDS` (devThrottle key list follows) → `fakeRoom` → `NetSimHost` mirror copy → `Predictor.reconcile(…, knockTicks, knockDx, knockDy, knockStepMm)`; the reconcile that first shows a knock smooths up to `PREDICTION_KNOCK_SNAP_M` 2.5 m instead of snapping (`stats.knockSlides`). Brute position/state: the existing horde record (type nibble 4, WINDUP in the state nibble).
- **Client:** `render/city/bruteArt.ts` (new): the five round-B looks BR1 riot cop, BR2 hi-vis worker, BR3 butcher, BR4 bodybuilder, BR5 prisoner, ported from `docs/art/epic-5/round-b/looks.html`, idle + windup pose each, **arms always under the clothes/torso (the designer's fix)**; atlas frames `zombie_brute_{a..e}` + `zombie_brute_windup_{a..e}` (102 px, `CHAR_EXTENT_R.brute` 1.5). Look per Brute = `bruteLookIndex(runSeed, netId)` from the named stream `look:brute:<netId>` (same on every client, nothing on the wire). `ZombieView`: depth 5.8, windup frame (no Spitter gurgle for it), heavier hit flash (160 ms). `GameScene` + `render/bruteCue.ts`: roar (`zombie_brute_roar`, panned, clamped) on every spawn, "Brute!" banner on `first`; a woken tab's backlog (`ageS` from NetSimHost) roars nothing after 1 s and shows no banner after 3 s.
- **Acid fix (5.6 re-review, designer):** `circleInAcid` also requires the body → puddle-centre segment not to enter a shot blocker more than 2 cm before the centre; barricades/sandbags/turrets/traps don't block. Logged in the 5.6 story's change log.

**Fairness rules → tests**

| Rule | Tests (`packages/shared/src/zombies/brute.test.ts` unless named) |
| --- | --- |
| F1 windup 0.5 s, dodge by 0.3 m | "touch → WINDUP 10 ticks, then 35", "exactly 0.3 m dodges, 0.29 m does not", "walking away always dodges; standing still never does", "per body: two Brutes 3 ticks apart"; Walker instant bite unchanged |
| F2 1.5 m, never into/through | open ground 24 angles (0.375 m × 4, straight, no steering, control back); car, bus, building, parking_wall, wood barricade, turret × 24 angles; map edge × 4; fire edge × 2 fires × 24 angles; fuzz; `prediction.test` (open, barricade, fire) |
| F3 downed never pushed | "the hit that downs knocks nothing; never knocked later" |
| F4 weapons barely move it | "axe 1.5 → 0.3, shotgun 0.5 → 0.1, pushback × 0.2", "overlap split by area (25 %), Walkers ½" |
| F5 105 per building hit | wood: 105 then destroyed by the 2nd; turret: 105, 105, destroyed by the 3rd, one interval apart; "open way round → barricade untouched" |
| F6 never on top of you | `waveDirector.test` (spawn ≥ 6 m, narrowed jitter, `spawns` stream only, banner `first` once); map tests (every type's jitter area clear) |
| F7 body = hitbox | "bullet hits at 0.59 m, misses at 0.61 m" |
| F8 same Brute for everyone | `waveDirector.test` "exactly one Brute in waves 5 and 6 at 1–4 players" (+ wave size unchanged); stats from balance only |

Also: `flowField.test` (+5: 1.0 m closed / 1.5 m open, growth + ids, idles without a Brute / shares ticks / 6P bound, walls only at decay changes on both grids, snapshot), `zombieAi.pathing.test` (+2: round the end of a line with a 1 m gap; breaks a barricade when the gap is the only way, never clips), `balance.test` (+3), `netEvents.test`, `syncState.test`, `hordeEncoder.test`, `eventInterest.test`, `atlasLayout.test`, `bruteCue.test` (new), `NetSimHost.brute.test` (new: decoded, banner once, hidden tab across the spawn, knock fields mirrored), `tools/netsim/brute.test.ts` (new), `zombies/brute.fuzz.test.ts` (new), `acid.test` (+1 with 7 cases), `fiveWaveSim.test` (+1: six waves).

**Fuzz (brief 7)** — `brute.fuzz.test.ts`: 16 layouts (stages 1–3, variant masks, players pressed against cover or next to a fire, 4–18 wood/metal barricades and turrets, 2–3 Brutes + 20 Walkers/Crawlers, the team kills one crowd zombie per player per second) × 3,000 ticks, one stage change mid-run: no Brute or player inside a box, nobody knocked into fire, no stall, walls only at the stage change; **1,481 knockbacks, 4,878 knock ticks stopped short by something, 21 Brute building hits, 35/38 Brutes hit a player** (the rest reached within 3 m with a clear line). Reachability: a lone Brute from every open spawn × stages 1–3 × every 4th variant mask reaches the team (all reached). The Downtown fuzz now jitters each type by its own rule (Brutes are among its random types; still green).

**Sims (brief 9, 15)** — six waves (`runWaves` 6 override), 2 and 4 bots, seeds 1–3: all 6 runs held out; every run: Brutes spawned in waves 5 and 6, both killed, kill pay 49–74 per run (25 + assists; turret kills pay the owner half).

**Netsim (brief 14)** — `?lag=150&jitter=20` (75 ± 10 ms each way), Brute next to the bot player, barricade behind: 10 hits in 20 s, **0 snaps, exactly 1 smoothed correction per knock (its reveal), drawn = server after** (3 seeds); control (knock ignored): 39 corrections.

**Bandwidth (brief 11)** — one Brute in view = one more 8 B horde record = **+160 B/s** per phone (test); `brute_spawned` **10 B** per spawn (global); a knock's schema patch **11 B** at the hit (+ the countdown, ~1 B/tick for 3 ticks). Nothing per tick otherwise. Total far under 30 KB/s; horde ≤ 24 KB/s unchanged (the Brute takes a Walker's slot in the wave count).

**Tick cost (brief 16, `PERF_ASSERT=1`, 4 cores, load 6.9–8.3)** — 98 Walkers + 50 Runners + 2 Brutes, 24 buildings (4 firing turrets): chase + flank p99 1.588 ms → + wide field **1.156 ms** (added −0.43 ms: noise, the third field shares the existing cell budget, no extra cells per tick); max age chase/flank/wide 15 ticks (bound 6P = 18). Under heavier load (12–17) the older tick-cost tests time out at 5 s; the work branch's 30 s test timeout (merged) fixes that.

**Phone FPS (brief 12)** — headless Chromium SwiftShader, 844 × 390 DPR 2, rAF over 20 s after 5 s. Before (base, `?stress=150`): 7.3 / 5.7 fps (load 7.4). After: `?stress=150` 7.0; with 15 Brutes (`?wavemix=walker×9,brute`) 7.9; with 75 Brutes (`walker,brute`) 8.2 (worst second 6–7; load 7.8–8.3). No measurable loss (noise-level numbers on a busy box). Brute frames are 10 atlas frames (102 px) in the characters atlas, no new pools.

**Mutations (brief 9; each once, `scratchpad/mutate.py`)** — 23 mutants, **22 killed:** windup skipped; reach not strict; knock without push-out; fire stop removed; `buildingDamageMult` ignored; Brute on the chase grid; `first` always true; `knockbackTakenPct` ignored; overlap split ½; fixed Brute at the wave start; no fixed counts; wide grid with pinches; no seed round a cornered player; wide field never advances; predictor ignores the knock; reveal snaps; syncState drops `knockDy`; late banner kept; acid ignores cover; acid face tolerance 0 (survived first — the test had no centre inside the wall; added two cases, then killed); wide radius limit unchecked. **Survived (equivalent):** "knock on a downing hit" in `damagePlayer` — `knockPlayer` itself refuses a non-standing player (and `movePlayers` clears a downed body's knock).

**Beat the rule (brief 4) — my attempts**

1. Stand in a 0.9–1.1 m gap between barricades: the Brute walks round when there is a way round, else breaks a barricade (2 hits), never clips (tests). A 1.5 m gap is passable for it (alley 3 + dumpster). **Holds.**
2. Kite at 4.5 m/s: never hit (1 m/s Brute). Standing still and stepping exactly 0.3 m on the last windup tick: dodged; 0.29 m: hit (test). **Holds — exactly the rule.**
3. Knocked toward car, bus, building, thin wall, barricade, turret, map edge, burning car: never inside, never through, never into fire (24 angles each + fuzz). The knock slides along a face (normal player collision). **Holds.**
4. Knock under `?lag=150&jitter=20`: no snap; one smoothed slide per hit (netsim). **Holds.**
5. Cage the Brute's spawn: barricades must stay 2 m clear of spawns (4.3); a closed ring round the team costs 2 hits per wood barricade, 6 per metal. Not timed in a browser.
6. Axe/shotgun it into a corner: 0.3 / 0.1 m per hit, swept, stops at boxes (test). **Holds.**
7. Hide behind a turret line: a turret falls in 3 hits = 3 s of contact (test); turrets shoot back (120 HP).
8. Downed next to the Brute: not pushed, not hit again (test). **Holds.**
9. Hidden tab across the Brute spawn: decided **once, or skipped if stale** — no roar after 1 s, no banner after 3 s; `first` is true on exactly one event per run (test). **Holds.**
10. Solo wave 5 (80): exactly 1 Brute, the 21st spawn (test). **Holds.**
11. *Found:* a player in a slot narrower than 1.2 m was out of the Brute's reach (it waited at the mouth). **Fixed by the designer's rule F9** (long reach into gaps, review M1); only a player more than 1.8 m deep in a long slot is safe.
12. *Found:* a Brute shoves slower zombies ahead of it (it takes only ~25 % of an overlap); once it pushed a Crawler into a fire (fire test seed 12). Emergent, harmless.

### Review fixes (2026-11-23)

Merged `claude/gracious-turing-0db3j6` first (5.2 with its review fixes and the melee line-of-sight rule, 4.12 fixes, 4.13's texture registry: the Brute frames live in the characters atlas, no texture of their own).

- **M1 (designer: long reach into gaps) → F9.** `flowField.ts › wideGapRing(world, x, y)`: rings to the nearest free wide-grid cell from a player (0: own cell free; 1: pressed against a box; ≥ 2: in a slot narrower than the Brute, the field seeded from its mouth), never across a map solid. `zombieAi.ts › swingReachFor`: `gapReachM` (1.8 m, `zombies.json`) when the ring is ≥ 2, else contact + `swingReachM`; the windup also starts from the mouth (attack ready, inside the gap reach, clear line); `resolveSwing` needs `meleeLineClear` (no hits through walls, cars, barricades). Measured: a player 0.5 m / 1 m deep in each of the five Downtown slots is hit from the mouth (the knock then pushes them ~1.5 m deeper, out of reach); 2.25 m deep in the 4.5 m slots: never hit in 40 s. Tests: `brute.test.ts › long reach into gaps` (five slots × two depths with clear-line check; long slot safe; the parking wall between → miss, the mouth → hit; a player pressed against a car in the open keeps the short reach). Fuzz tightened: a Brute counts only by landing a hit (player or building); excuses only "every player > `gapReachM` + ½ cell diagonal from every free wide cell" or "another Brute that is landing hits holds it off within 1.3 m" (seed 2: two Brutes round one cornered player). 16 layouts: 1,517 knockbacks, 36/38 Brutes hit a player, the other two hit buildings or were held off.
- **L1:** `swingToleranceM` 0.01 (balance): hit iff closer than reach − 1 cm. The axe's 0.3 m knock during the windup now always makes it miss, a 0.25 m one never (24 angles each, test); the step-out test: 0.3 / 0.292 m dodge, 0.285 / 0.2 m are hit.
- **L2:** `RunController` counts `knockTicks` down for skipped seqs like `tickSlow` (test with weapon debt + overflow; mutant killed).
- **L3:** `applyDecayStage` drops the wide field (`sourceTick` −1, rebuild restarted) when it rewrites the walls, so the next Brute after a build start never steers by an old-stage field (walks straight ≤ 3P ticks until a fresh one swaps in). Test in `flowField.test.ts`; mutant killed.
- **L4:** `pathing.wideSeedRings` (6), `pathing.wideSteerRings` (2) and `spit.acidFaceToleranceM` (0.02) moved to `zombies.json` (schema defaults).
- **L5:** `brute.ts` look names fixed (BR3 bloated butcher, BR4 bodybuilder, BR5 prisoner).
- **Mutations of the new tests:** gap reach ignored, gap reach in the open too, swing ignores the line (survived first; killed after the parking-wall test was added), `seedAround` early return, tolerance ignored, L3 invalidation removed, seed rings 1, L2 count removed: all killed.

### Gate

After the review fixes, on the branch merged with `claude/gracious-turing-0db3j6` again: `npm run typecheck && npm run lint && npm test -- --testTimeout=30000 && npm run build` green — **229 test files passed, 1 skipped; 1,811 tests passed, 3 skipped** (`spitter.test` updated for the new `acidFaceToleranceM` default). `uptime` during the run: load 1.2 → 4.3 (4 cores). (First build: 227 files / 1,760 tests at load 6.7–9.5.)

### Not verified

- **Phones:** only headless SwiftShader FPS on a box at load 7–8 (noise-level numbers). The 4.10 phone floor must be rechecked with `?stress=150&wavemix=walker,brute`.
- **Online two-tab browser check under `?lag=150&jitter=20` was not run** (time; the box was at load 8–17). Covered instead by `tools/netsim/brute.test.ts` (real RunController + Predictor), `NetSimHost.brute.test.ts` (decode, banner once, hidden tab across the spawn) and `prediction.test.ts`. The solo browser check (dev cheat spawn) ran: banner "Brute!", roar call, windup frame, a hit knocking the survivor 1.5 m, lineup of looks.
- The real wave 5 in a browser (`?wallet=` + Ready ×4) was not played; the sims cover it (waves 5/6 each spawned exactly one Brute that was killed).
- Sound only as code (placeholder roar); not listened to.
- Beat-the-rule 5 (time to break out of a caged spawn) not measured.

### File List

New:
- `packages/shared/src/player/knockback.ts`, `packages/shared/src/zombies/brute.ts`
- `packages/shared/src/zombies/brute.test.ts`, `packages/shared/src/zombies/brute.fuzz.test.ts`
- `apps/client/src/render/city/bruteArt.ts`, `apps/client/src/render/bruteCue.ts`, `apps/client/src/render/bruteCue.test.ts`, `apps/client/src/sim/NetSimHost.brute.test.ts`
- `tools/netsim/brute.test.ts`
- `docs/art/epic-5/round-b/ingame/5-7-banner.png`, `5-7-windup.png`, `5-7-knockback.png`, `5-7-looks.png`, `5-7-looks-sheet.png`
- `docs/playtests/milestone-1/objects/27_brute.png`

Modified:
- `packages/shared/src/config/balance/zombies.json`, `config/balance/waves.json`, `config/balanceSchema.ts`, `config/balance.ts`, `config/balance.test.ts`
- `packages/shared/src/zombies/zombieTypes.ts`, `zombies/zombieAi.ts`, `zombies/flowField.ts`, `zombies/spawnRing.ts`, `zombies/spit.ts`, `zombies/flowField.test.ts`, `zombies/zombieAi.pathing.test.ts`, `zombies/downtown.fuzz.test.ts`
- `packages/shared/src/map/collisionCells.ts`, `map/downtown.test.ts`, `map/obstacles.test.ts`
- `packages/shared/src/decay/applyDecayStage.ts`, `decay/decaySystem.ts`, `decay/decay.test.ts`, `decay/fire.test.ts`, `decay/panic.test.ts`
- `packages/shared/src/player/player.ts`, `player/movement.ts`, `player/slow.test.ts`
- `packages/shared/src/waves/waveDirector.ts`, `waves/waveDirector.test.ts`
- `packages/shared/src/core/world.ts`, `core/simEvents.ts`, `net/netEvents.ts`, `net/netEvents.test.ts`, `net/stateView.ts`, `index.ts`
- `packages/shared/src/combat/damage.ts` (merge: 5.2's helper kept), `bots/headlessRun.ts`, `economy/fiveWaveSim.test.ts`, `hazards/acid.test.ts`
- `apps/server/src/rooms/schema/RunState.ts`, `rooms/schema/syncState.ts`, `rooms/schema/syncState.test.ts`, `net/eventInterest.test.ts`, `net/hordeEncoder.test.ts`, `run/tickCostFlowField.test.ts`
- `apps/client/src/net/prediction.ts`, `net/prediction.test.ts`, `net/netConfig.ts`, `net/fakeRoom.ts`, `sim/NetSimHost.ts`
- `apps/client/src/render/ZombieView.ts`, `render/city/spriteArt.ts`, `render/city/spriteAtlas.ts`, `render/city/atlasLayout.test.ts`, `scenes/GameScene.ts`, `audio/placeholderSfx.ts`, `debug/stressScenario.ts`
- `docs/playtests/milestone-1/readability-sheet.md`, `readability-key.md`
- `_bmad-output/implementation-artifacts/5-6-spitters.md` (change log: acid vs cover), this story file

### Notes for the merge (brief 19)

- `zombieTypes.ts › ZOMBIE_TYPES`: `brute` = 4 (after `spitter`). 5.8's `bloater` goes after it unless it lands first; the wire carries the index: never reorder; the client's `bruteLookIndex` / `ZombieView` key on the type name, tests count index 4 in a few places (`hordeEncoder.test`, fuzz `zombieTypeIndex("brute")`).
- `net/netEvents.ts`: `BRUTE_SPAWNED: 32` (27–28 = 5.9, 29–30 = 5.6, 31 = 5.1). Renumber if taken; never reuse.
- `balanceSchema.ts › zombieTypeSchema`: one strict object; `knockbackTakenPct` is 5.2's (defined once); 5.7 adds `buildingDamageMult, hitKnockbackM, knockbackS, windupS, swingReachM, wideBody`; `pathingSchema.wideInflateM`; `wavesSchema.fixed, fixedAtFraction`.
- `combat/damage.ts`: 5.2's `knockbackShare` / `hurt` are the single place (my duplicate was dropped at the merge).
- `zombieAi.ts`: windup state machine shared with 5.6 (`isWindupState`); the melee windup is gated on `stats.windupS > 0` (Spitters' top-level `windupS` is 0: their spit windup lives in `spit.windupS`). Overlap pairs are now handled by the bigger body. `steerByField` takes the nav grid.
- `flowField.ts`: `PathingState` gained `wide, wideChase, wideActive, activeFields`; `NavGrid.inflateM`; a future building kind must go through `rasterizeBuildings` (growth applies automatically); 5.9-style floor stays out of both grids.
- `player/movement.ts` (shared with 5.2's chainsaw slow): the knock is stepped after `tickSlow`, before the input move, applied seqs only.
- Schema / `PlayerStateView` / `fakeRoom` / `syncState`: appended `knockTicks, knockDx, knockDy, knockStepMm`; `Predictor.reconcile` gained four trailing params (callers: NetSimHost, netsim tests).
- `waves.json`: `fixed` beside `mix` (5.6 and 5.8 add mix weights). When 5.8 sets `runWaves` 6, the wave-6 Brute goes live (the six-wave sim already covers it).
- `spriteArt.ts` (`CHAR_EXTENT_R.survivor` is 5.2's 2.7; `brute` 1.5), `spriteAtlas.ts`, `ZombieView.ts`, `GameScene.ts`, `placeholderSfx.ts`: appended entries.
- Readability sheet: the Brute is item 26 (`27_brute.png`) after 5.2's 24–25.
- Map tests (`downtown.test`, `obstacles.test`, `panic.test`) now check each type's spawn area with `spawnJitterFor`.

## Change Log

- 2026-11-23: Review fixes (M1 → F9 long reach into gaps, L1 swing tolerance, L2 skipped-seq knock count, L3 wide field dropped at decay changes, L4 constants to balance, L5 look names); merged the work branch again. Status → review.
- 2026-11-23: Story 5.7 built (Brute: balance, wide-body pathing, windup, knockback with prediction, fixed wave counts, spawn event/banner/roar, five code looks with the arms-under-clothes fix, tests, fuzz, reachability, six-wave sim, netsim, bandwidth, tick cost, FPS, mutations). Also the 5.6 acid-vs-cover fix. Merged `claude/gracious-turing-0db3j6` (5.1, 5.2, 4.12, 4.13). Status → review.

### Re-review of the fixes (2026-11-23, fresh agent)

No high or medium findings at ce420b7; fixes correct. Whole-map scan (0.1 m steps, stages 0–3, two variant masks): the 1.8 m gap reach applies only inside the 1 m slots (7 with all variants, incl. bus↔street_car_east and curb_car_west_s↔police_line_lot), only once the player's centre is on the mouth line; never in the open, next to a single box, behind barricades, at the map edge or to downed players; line of sight via `meleeLineClear`; the knock pushes the player deeper. The middle of a 4.5 m slot stays out of reach (designer's "dodge by stepping deeper"). 1 cm rule deterministic; L2/L3 correct; balance values schema-checked. Gate green (1,813 tests). Lows **accepted** (test gaps only): ring-2 band untested (zombieAi.ts:390); no test of a player stepping deeper during the wind-up (reach 2.3 m mutant survives, zombieAi.ts:408); dropping `meleeLineClear` from `gapSwing` survives (zombieAi.ts:319; code is right); `wideGapRing` line check untested (harmless). Status: done once on master.
