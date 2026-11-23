# Story 5.7: The first Brute

Status: ready-for-dev

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

- [ ] **T0 Art pick (first; brief 13).** ~5 Meshy proposals (`nano-banana-pro`, 4.11's shared style line; top-down, at in-game scale next to a Walker for size): **BR1** hulking riot-cop zombie with a cracked vest, **BR2** huge construction worker in a torn hi-vis jacket, **BR3** shirtless butcher with a stained apron, **BR4** bouncer in a burst black suit, **BR5** firefighter zombie in heavy turnout gear. For the pick, each also gets its WINDUP pose sketch. One private proposal page; the designer picks; record in `docs/art/5-7/README.md` (+ images). Nothing drawn before the pick. (AC 8)
- [ ] **T1 Balance + schema** (AC 1, 2, 3)
  - [ ] `balanceSchema.ts › zombieTypeSchema`: `buildingDamageMult` (≥ 1, default 1), `knockbackTakenPct` (int 0–100, default 100 — **shared with 5.2: add once**), `hitKnockbackM` (≥ 0, default 0), `knockbackS` (> 0, default 0.2), `windupS` (≥ 0 ≤ 5, default 0 — **reuse Round A 5.6's Spitter windup field if it exists**), `swingReachM` (≥ 0, default 0), `wideBody` (bool, default false).
  - [ ] `waves.json › fixed` + `fixedAtFraction` (schema in `wavesSchema`); `balance.ts › crossCheck`: fixed types exist and are in `ZOMBIE_TYPES`; fixed count ≤ smallest wave size; the radius check becomes: non-wide types ≤ `MAX_PATHING_ZOMBIE_RADIUS_M` (0.35), wide types ≤ `MAX_PATHING_ZOMBIE_RADIUS_M + nav.wideInflateM` (D1); `spawnClearM` > jitter + the largest radius (2 > 1 + 0.6 ✓).
  - [ ] `zombieTypes.ts › ZOMBIE_TYPES` append `"brute"`; `ZOMBIE_STATE.WINDUP` (reuse 5.6's).
  - [ ] Tests `config/balance.test.ts` (+ `brute matches the GDD`, `fixed counts validated`, `a wide body over the wide limit is refused`).
- [ ] **T2 Wide-body pathing** (AC 5; D1)
  - [ ] `zombies/flowField.ts`: `PathingState.wide: NavGrid` = a second `createNavGrid` whose solids (map boxes, active cover) and rasterized buildings are grown by `inflateM` = `max(wide radius) − MAX_PATHING_ZOMBIE_RADIUS_M` (0.25 m), so the existing clearance rule (body ≤ 0.35 m) holds for the Brute; the building ids stay on the grown cells (a Brute blocked by a barricade attacks it). `setNavWalls`/`setNavFires` write both grids (fires grown by the wide radius); `rasterizeBuildings` re-rasterizes both on `buildings.version`.
  - [ ] `FlowField wideChase` on `wide`, advanced only while a `wideBody` zombie is alive, sharing `rebuildCellsPerTick` round-robin with chase/flank (the 3.8 pattern; `flowFieldMaxAgeTicks` covers 3 fields). No extra cells per tick.
  - [ ] `zombieAi.ts`: a `wideBody` type steers by `wideChase` (and checks LOS with its own radius, already per type).
  - [ ] `snapshotPathing` includes the wide grid/field hashes.
  - [ ] Tests `flowField.test.ts` (+ `wide grid closes a 1.0 m gap the chase grid keeps open`, `wide field idles without a Brute`, `walls rebuilt only at build starts on both grids`), `zombieAi.pathing.test.ts` (+ `a Brute routes around a barricade gap it doesn't fit and breaks the barricade when that is the only way`).
- [ ] **T3 Brute AI, damage, knockback** (AC 5, 6; F1–F5)
  - [ ] `zombieAi.ts`: WINDUP state per zombie (`pool.state`, a new `pool.windupTicks: Uint8Array` or 5.6's): enter on contact with a standing player when `attackCooldownTicks === 0` and `windupS > 0`; stand still while winding up; at 0 → `swingHits(contact + swingReachM)` → `damagePlayer` + `knockPlayer`; then `attackCooldownTicks = ticksFor(attackIntervalS)`. Types without `windupS` keep today's instant hit (unchanged code path).
  - [ ] Building hits: `damageBuilding(world, b, stats.damage * stats.buildingDamageMult)`.
  - [ ] `player/knockback.ts` (new, shared): `knockPlayer(p, fromX, fromY, stats)` sets `knockTicks`, `knockDx/Dy` (int8 quantised); not for downed/out; `movePlayers` applies it (AC 6), stopping at boxes (push-out) and fire edges.
  - [ ] Weapon/turret knockback on the Brute: `knockbackTakenPct` in `applyZombieDamage`'s pushback and in 5.3's `applyKnockback` (5.2 adds it there too: whoever merges first).
  - [ ] `resolveOverlaps`: split each overlap by body area (`r_j² / (r_i² + r_j²)` to i), equal radii → ½ as today (no change for existing types; test it).
  - [ ] Tests `zombies/brute.test.ts` (new): `stats and reward`, `windup 10 ticks then the hit`, `stepping out during the windup dodges it`, `hit = 35 damage + 1.5 m knockback away from the Brute in 4 ticks`, `knockback stops at a barricade, car, bus, building, turret, map edge` (every approach angle 0–345° step 15°), `knockback stops at a fire edge`, `no knockback when the hit downs`, `105 damage to a building per hit (wood 2 hits, turret 3 hits)`, `axe moves a Brute 0.3 m, pistol pushback 20 %`, `overlap: a Walker moves the Brute 25 %`, `per-body windup: two Brutes on two players are independent`.
- [ ] **T4 Waves + mini-boss event** (AC 3, 4; F6)
  - [ ] `waves/waveDirector.ts › beginWave`: `fixed` counts into `typeTarget` (taken off Walkers, then the largest share); `waveZombieType` holds fixed types until `fixedAtFraction × size` have spawned, then serves them first; `world.waves.brutesSpawned` counter (reset per run, in `snapshotWorld`); emit `zombie.brute_spawned`.
  - [ ] `core/simEvents.ts` + `net/netEvents.ts` (encode/decode; zombie net id), `eventInterest.ts`: sent to everyone (it is a team cue).
  - [ ] Client: `GameScene` (banner on `first`, roar on each), `audio/placeholderSfx.ts` (`zombie_brute_roar`), `render/ZombieView.ts › LOOKS.brute` (depth above Walkers, cue roar), `render/city/spriteArt.ts › drawZombie` + `CHAR_EXTENT_R.brute` + WINDUP frame, `spriteAtlas.ts` frames (atlas ≤ 2048²: `atlasLayout.test.ts`).
  - [ ] Tests `waveDirector.test.ts` (+ `wave 5 has exactly one Brute at 1–4 players`, `it spawns after 25 % of the wave`, `spawns stream only: same seed → same Brute spawn point`), `GameScene`-free tests for the banner rule (hudModel / toast queue), `NetSimHost` (+ `brute_spawned decoded; banner once per run`).
- [ ] **T5 Prediction copy** (AC 6, 7; brief 2, 14)
  - [ ] Schema `knockTicks/knockDx/knockDy`, `syncState` (on change), `resetRunFields`, stateView key list, `fakeRoom`, devThrottle (key list), `NetSimHost` mirror (client World player), `Predictor.reconcile(ackSeq, x, y, status, slowTicks, slowPct, knockTicks, knockDx, knockDy)`; the Predictor's World has the map, buildings (`mirrorBuildings`) and fires (`syncDecay`), so the stop rules match.
  - [ ] Tests `net/prediction.test.ts` (+ `knockback predicted after the ack: 0 corrections in the open, against a barricade, at a fire edge`), `tools/netsim/brute.test.ts` (new: `?lag=150&jitter=20`, a Brute hits the bot player 5×: client position = server at every ack, no snap ≥ 1 m from a knockback, corrections recorded), `syncState.test.ts` (+ `knock fields synced and reset`), `NetSimHost` hidden-tab test across the wave-5 build start (`window.__game.loop.sleep()/wake()` in the browser check; Vitest: apply a state that jumped across the Brute spawn).
- [ ] **T6 Fuzz, reachability, bandwidth, perf, sims** (brief 7, 9, 11, 15, 16)
  - [ ] `zombies/downtown.fuzz.test.ts` (extend): random barricade/turret layouts × every decay stage and variant mask (incl. 4.8 fires; 5.9 metal barricades/spikes/mines if merged) × ≥ 3,000 ticks with Brutes in the mix and bots standing next to cover: **no Brute centre inside a (grown or real) box**, **no player inside a box or a fire after a knockback**, **no stall: every Brute reaches a player or a building it attacks**, **wide/chase fields rebuild walls only at build starts**; liveness: ≥ 1 knockback per layout, ≥ 1 Brute building hit, ≥ 1 Brute kill.
  - [ ] Reachability: a lone Brute from every spawn point × every stage reaches the team start (the 4.5 reachability pattern), with the wide field.
  - [ ] Bandwidth: one Brute in view adds one 8 B horde record at 20 Hz = **160 B/s** per phone (as one more Walker); `brute_spawned` ~20 B per spawn; knock fields ~3 B per hit. Assert in a bandwidth test (`decayBandwidth.test.ts` pattern) and report.
  - [ ] Tick cost (`tickCostFlowField.test.ts` + case, `PERF_ASSERT=1`): 150 zombies incl. 2 Brutes, 3 fields: added p99 recorded with load (≤ the 2 ms Epic budget).
  - [ ] 6-wave sim (`economy/fiveWaveSim.test.ts`, 6 waves once 5.8 lands; else `runWaves` override 5): assert waves ended, a Brute spawned in wave 5, was killed, and its 25 reward (+ assists) was paid (brief 9, 15).
- [ ] **T7 Gates.** Mutations (e.g. windup skipped → dodge test; knockback without push-out → fuzz; fire stop removed → fire test; `buildingDamageMult` ignored → building test; Brute on the chase grid → reachability/fuzz; `first` always true → banner test) and which tests failed. Browser check (Playwright): solo `?wavemix=brute` and the real wave 5 (`?wallet=` + build Ready ×4), online two tabs with `?lag=150&jitter=20`: banner once, roar, windup visible, knockback slides, stops at a barricade. `typecheck && lint && test && build`. Merge notes.

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

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
