# Story 5.3: Shotgun and Assault Rifle

Status: ready-for-dev

## Story

As a player,
I want a short-range Shotgun and a mid-long Assault Rifle,
so that I have more ways to fill my role.

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`) is this story's checklist; every line applies. Quoted in full (builders and reviewers: check each line):
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
> Most relevant here: 2 (pellets are shared sim code: server, solo, the cosmetic copy and the netsim harness use ONE pellet-direction function), 3/4 (fairness rules below), 5 (pellets stop at cars/bus/buildings, pass barriers/sandbags; rewound like every player shot), 7 (knockback is spatial: fuzz), 8 (pellet rolls from the `combat` stream offline, from the seq online), 9 (liveness), 10 (pooled projectiles, numbers in `weapons.json`), 11 (one `weapon.fired` per shot, not per pellet), 12 (8 streaks per shot under `?stress`), 14 (`?lag=150&jitter=20`).

## Acceptance Criteria

### Gameplay (from `epics.md` › Story 5.3, GDD › Weapon Systems)

1. **Shotgun stats** (`weapons.json › shotgun`, kind `gun`): 8 pellets × 4 damage, 1.2 shots/s, range 5 m, 30° spread, knockback 0.5 m, magazine 6, reload 2.5 s, price 250, pierce 1 per pellet, 60 m/s (FR13). Every number is in balance JSON (new gun field `pellets`, existing `knockbackM`).
2. **Shotgun fire.** One trigger pull (one shot of the cooldown, one shell of the magazine) spawns **8 pellets**, each a real projectile in `world.projectiles` that flies, is rewound (2.12), is stopped by cover (4.2) and vanishes at 5 m. One `weapon.fired` event per shot (not per pellet).
3. **Knockback once per shot.** A zombie hit by one or more pellets of the same shot is knocked back **0.5 m once** (not 0.5 m per pellet), away from the shooter along the first pellet that hit it. Shotgun pellets have no per-pellet `hitPushbackM` (0), so 8 pellets never push 8 × 0.15 m.
4. **Assault Rifle stats** (`weapons.json › assault_rifle`): 7 damage, 8 shots/s, range 11 m, 4° spread, magazine 30, reload 2.0 s, price 450, pierce 1, 60 m/s, hit pushback 0.15 m (like the other bullets). It behaves per the weapon table through the existing gun path (cooldown rule, reload, swap, aim assist, rewind, cover). One AR bullet kills a Runner (7 ≥ 6 HP), two kill a Walker.
5. **Shop.** Both guns are on sale in the build phase's fixed list (`shop.json › weapons`, Story 3.3 shop; Story 5.13 replaces it with cards), bought, slotted and swapped like the others; `?loadout=shotgun,assault_rifle` works (dev).
6. **Feel.** Each gun has its own placeholder fire sound (`weapon_shotgun_fire`, `weapon_assault_rifle_fire`) and muzzle flash; the Shotgun's pellets read as a short spray of 8 streaks; the HUD slot shows the weapon's name and ammo as today.

### Fairness rules (brief line 3; player-visible, each is tested)

7. **F1 Fan, not luck.** The 8 pellets fill the 30° cone evenly: the cone is cut into 8 equal slices and exactly one pellet flies inside each slice (its place inside the slice is random). So a Walker right in front of the muzzle within 1.5 m always takes all 8 pellets (32 damage); a point-blank shot is never "unlucky".
8. **F2 Range is a hard edge.** A pellet never deals damage beyond 5 m from the muzzle; the AR's bullet never beyond 11 m (projectile range, as today).
9. **F3 Cover.** Pellets and AR bullets stop at a car, the bus or a building (4.2 `shotBlockT`) and pass over barriers, sandbags and player buildings; a zombie behind a car is never hit by a pellet that the car stopped, and the client's cosmetic pellets stop at the same face.
10. **F4 Knockback never pushes a zombie through anything.** A knocked-back zombie stops when its body touches a map solid (car, bus, building, barrier, sandbags) or a player building; it never ends inside a box or on the far side of a barricade, and never leaves the map.
11. **F5 Knockback is once per zombie per shot,** whatever the number of pellets that hit it; two shots (two trigger pulls) knock twice.
12. **F6 What you see is what the server shot.** Online, the shooter's cosmetic pellets fly exactly where the server's pellets fly (same per-pellet directions from the input seq), and other players see the same 8 directions (the event carries the seq).
13. **F7 Reload and swap rules are the gun rules.** Swapping away cancels a reload (FR5, existing); a skipped input spends one shell and no pellets (2.7 dry fire); swapping does not refill a magazine.

### Netcode, perf, readability (brief lines 11–14)

14. **Bandwidth.** Added B/s measured (test) and reported: one `weapon.fired` per shot (+ a 16-bit seq field for pellet weapons only) and the existing `zombie.hit` per pellet hit. Budget: estimate below; total stays ≤ 30 KB/s.
15. **Phone FPS.** Pellet streaks come from the existing pooled `ProjectileView` (no new sprite per pellet); `?stress=150` with the local player firing the Shotgun (dev switch, below) reports headless FPS before/after with machine load; no FPS loss beyond noise.
16. **Lag.** Under `?lag=150&jitter=20` (netsim) the shooter's cosmetic pellet directions equal the server's for every shot; reversed hits (apparent hit, no server hit) stay < 5 % for both guns.
17. **Readability.** The designer picks the guns' look (task 0); both guns are added to `docs/playtests/milestone-1/readability-sheet.md` ("what is the survivor holding?").

## Tasks / Subtasks

- [ ] **T0 Art pick first (AC 6, 17)** — before any client art work (sim work may start in parallel)
  - [ ] 0.1 Generate ~5 Meshy proposals per item (`nano-banana-pro`, text to image, as in `docs/art/4-11/README.md`), shared style line: "strict top-down orthographic, gritty realistic, night, wet asphalt, cool streetlight from the upper left, muted, crisp silhouette, no text". Items: (a) pump-action shotgun seen from above, held by a survivor (for the survivor sprite / HUD icon); (b) assault rifle seen from above; (c) shotgun muzzle blast + pellet spray (8 short bright streaks fanning 30°); (d) AR muzzle flash. Put them on one private proposal Artifact page (like 4.11's).
  - [ ] 0.2 The designer picks (e.g. "SG3, AR2, FX1"); save picks to `docs/art/5-3/` with a `README.md` (file, use, footprint/size, prompt), same table format as `docs/art/4-11/README.md`.
  - [ ] 0.3 Only then draw the code/atlas frames (`render/city/spriteArt.ts`, atlas frames `weapon_shotgun_held`, `weapon_assault_rifle_held`, `fx_shotgun_blast_01…`), ≤ 2048² atlases.
- [ ] **T1 Balance (AC 1, 4, 5)**
  - [ ] 1.1 `config/balanceSchema.ts › gunSchema`: add `pellets: z.number().int().min(1).max(16).default(1)` (doc: Story 5.3, shots per trigger pull); refine: `pellets > 1` ⇒ `hitPushbackM === 0` (knockback is per shot via `knockbackM`). `knockbackM` already exists in `common` (default 0, unused until now).
  - [ ] 1.2 `weapons.json`: **append** `shotgun` then `assault_rifle` at the END (weapon indices go on the wire as `weaponIds(balance)` order; 5.2/5.4/5.5 also append: see merge notes).
  - [ ] 1.3 `shop.json › weapons`: append `"shotgun", "assault_rifle"`.
  - [ ] 1.4 Tests: `config/balance.test.ts` — "shotgun and assault rifle match the GDD table", "pellets defaults to 1 for the old guns", "refuses pellets 0, pellets 17, pellets 8 with hitPushbackM > 0"; `economy/shop.test.ts` — "the fixed shop lists shotgun and assault_rifle with prices 250 / 450".
- [ ] **T2 Pellet directions, one shared function (AC 2, 7, 12)**
  - [ ] 2.1 `combat/spread.ts`: `seqPelletRoll(playerId, seq16, k): number` in [0, 1) (the FNV/murmur hash of `seqSpreadRoll` with the pellet index mixed in; keyed on `seq & 0xffff` so the 16-bit seq on the wire reproduces it) and `pelletDirection(dirX, dirY, spreadDeg, pellets, k, u, out)`: angle = −spread/2 + (k + u) × spread / pellets (stratified fan, F1). Allocation-free.
  - [ ] 2.2 Offline `u` = `world.streams.combat.next()` per pellet (k = 0…7 in order); online (`p.rewindMaxTicks > 0`) `u = seqPelletRoll(p.id, input.seq & 0xffff, k)`. Single-pellet guns keep today's `rotateBySeqSpread` / `combat.range` path untouched (2.12 numbers must not move).
  - [ ] 2.3 Tests `combat/spread.test.ts`: "pellet k always lies in slice k", "same (player, seq, k) → same roll; neighbouring seqs spread", "pellet roll of seq and seq + 65536 are equal (16-bit key)".
- [ ] **T3 Firing (AC 2, 3, 13)** in `combat/firing.ts › tryFire`
  - [ ] 3.1 After aim assist (on the centre aim, as today) loop `k < stats.pellets`: fill `spawn` with the pellet direction, `spawnProjectile` (stop if the pool is full: −1), all pellets share `rewindTicks`, `advanceM`, `owner`, `weaponIndex`. Spend ONE shell, ONE cooldown. Emit ONE `weapon.fired` with the centre direction and (pellet guns) `seq: input.seq & 0xffff`.
  - [ ] 3.2 Per-shot id: `world.combat.nextShotId` (u32 counter, starts at 1; new small `CombatState` on World or a field next to `projectiles`) written to a new pool array `projectiles.shotId: Uint32Array`; turret shots and single-pellet guns get 0 (no knockback).
  - [ ] 3.3 Dry fire (`skippedInputWeaponTick`): one shell, no pellets (unchanged branch: verify it runs before the pellet loop).
  - [ ] 3.4 Tests `combat/shotgun.test.ts` (new): "one pull = 8 pellets, 1 shell, one weapon.fired", "12 shots in 10 s at 1.2/s (cooldown rule), reload 2.5 s after the 6th shell", "point-blank Walker takes 32 (F1) and dies", "a Walker at 4.9 m takes ≤ 3 pellets, none past 5 m (F2)", "same seed → same pellets (combat stream)", "online pellets follow seqPelletRoll", "dry fire spends a shell and spawns nothing", "swap cancels the reload" (F7).
- [ ] **T4 Knockback once per shot, swept (AC 3, 10, 11)**
  - [ ] 4.1 `zombies/zombiePool.ts`: `knockShot: Uint32Array` (last shot id that knocked this slot; 0 on spawn).
  - [ ] 4.2 `combat/damage.ts`: `applyKnockback(world, zid, dirX, dirY, distM)` — moves the body along the unit dir by at most `distM`, stopping at first contact with any map solid (`world.obstacles.solids`) or solid building (boxes grown by the zombie radius; reuse `segmentBoxEntryT` from `combat/cover.ts` / `segmentHitsBox` from `buildings/collision.ts`), clamped to the map. Allocation-free. **Shared with Story 5.2 (Fire Axe 1.5 m) and 5.7 (Brute: 20 % of the distance)**: whoever lands first creates it; the other reuses it (merge notes).
  - [ ] 4.3 In `updateProjectiles`: when a pellet hits zombie `zid` and `shotId > 0 && knockShot[zid] !== shotId` → `applyKnockback(..., stats.knockbackM)` and set `knockShot[zid] = shotId`. Damage still per pellet through `applyZombieDamage` (pushback 0 for pellets).
  - [ ] 4.4 Tests in `combat/shotgun.test.ts`: "8 pellets on one Walker push it 0.5 m, not 4 m (F5)", "two pulls push twice", "a Walker against a barricade face is not pushed into or through it (F4)", "a Walker beside a car stops at the car", "never off the map".
  - [ ] 4.5 **Fuzz** `combat/knockback.fuzz.test.ts` (new; or a block in `zombies/downtown.fuzz.test.ts`): Downtown, random legal decay layouts (every stage 1–3, `legalDecayMasks`) × random barricade/turret layouts (placement-validated) × 2,000 ticks of a solo Shotgun player (god mode) blasting the nearest crowd while waves run. Assert every tick: no zombie centre inside any solid or building box; no zombie crossed a barricade (side-of-box test before/after each knockback); zombies still reach the player (≥ 1 bite per layout); flow fields rebuilt only at build start (`nav.version` changes only on building add/remove). **Liveness:** ≥ 500 knockbacks applied in total, ≥ 20 stopped early by a face, ≥ 100 shotgun kills.
- [ ] **T5 Network (AC 12, 14)**
  - [ ] 5.1 `core/simEvents.ts`: `weapon.fired` gets optional `seq?: number` (pellet guns only).
  - [ ] 5.2 `net/netEvents.ts › WEAPON_FIRED`: append the seq as a 7th tuple field only when present (old events stay 6 fields); decode it back. Round-trip test in `net/netEvents.test.ts`: "weapon.fired with a pellet seq round-trips; without it stays 6 fields".
  - [ ] 5.3 `apps/client/src/net/cosmeticProjectiles.ts › spawn`: for `pellets > 1`, spawn `pellets` cosmetic pellets with `pelletDirection` + `seqPelletRoll(owner, seq, k)` (the same function as the server); my own shots from `NetSimHost` (line ~566, local fire clock) pass my seq; remote shots from the event's seq. Tests `cosmeticProjectiles.test.ts`: "a remote shotgun event spawns 8 pellets with the server's directions", "pellets stop at the mirror's car face".
  - [ ] 5.4 `apps/client/src/net/localFire.ts`: no change in cadence (one attack per pull); verify predicted ammo counts shells (test in `localFire.test.ts`: "a shotgun pull spends one predicted shell").
  - [ ] 5.5 `apps/server/src/net/spreadCancel.ts`: it watches single-roll spread; pass `spreadDeg` 0 for pellet guns (a stratified fan has nothing to cancel), test "shotgun never triggers spread_cancel_suspect".
  - [ ] 5.6 Bandwidth test `apps/server/src/run/weaponBandwidth.test.ts` (new, pattern of `turretBandwidth.test.ts`): 4 players with Shotguns / 4 with ARs firing into a 150-zombie crowd for a wave; report events B/s per client; assert ≤ the estimate × 1.5. **Liveness:** ≥ 50 shotgun kills / AR kills recorded.
  - [ ] 5.7 Netsim `tools/netsim/shotgun.test.ts` (new, harness `tools/netsim/hitsSim.ts`): lag 150/20, kiting Runners, 10 seeds per gun: cosmetic pellet directions == server pellet directions for 100 % of shots; reversed hits < 5 % (Shotgun, AR); hidden tab slept across a build start, then fire: no stale pellets, ammo = server.
- [ ] **T6 Client (AC 6, 15)**
  - [ ] 6.1 `render/ProjectileView.ts`: pellets (weapon with `pellets > 1`) drawn as shorter streaks (looks in T0's pick); same pool, no new objects per pellet.
  - [ ] 6.2 `audio/placeholderSfx.ts`: `weapon_shotgun_fire`, `weapon_assault_rifle_fire` synth placeholders; `render/FxView.ts` plays the sound by weapon (today every gun plays `weapon_pistol_fire`), with a per-weapon map (`satisfies Record<…>` over gun ids is not possible for dynamic ids: map with pistol fallback).
  - [ ] 6.3 Muzzle flash size per weapon (FxView), from T0's pick.
  - [ ] 6.4 Dev switch for perf: `?stressfire=1` makes the `?stress` scenario's player hold fire at the crowd (`debug/stressScenario.ts`, with `?loadout=shotgun` / `assault_rifle`); test in `stressScenario.test.ts`.
- [ ] **T7 Balance check, perf, browser (AC 15, 16, brief 12, 15, 16)**
  - [ ] 7.1 `economy/fiveWaveSim.test.ts` / `tools/sims/fiveWave.ts`: a bot shopping list variant that buys the Shotgun / AR (`bots.json › shoppingList` override in the test, not the JSON), assert the waves ended and ≥ 1 kill per new weapon (liveness). Bot survival is not difficulty evidence.
  - [ ] 7.2 `apps/server/src/run/tickCostDowntown.test.ts`: + 4 Shotgun players into 150 zombies (behind `PERF_ASSERT=1`), record p99 and load.
  - [ ] 7.3 `?stress=150&stressfire=1&loadout=shotgun` headless FPS before/after, with load.
  - [ ] 7.4 Playwright: solo, buy both guns, fire at a crowd, screenshot pellets; online two tabs with `?lag=150&jitter=20`.
  - [ ] 7.5 Mutations (brief 9): list each, the tests it fails (e.g. "knockback per pellet", "pellets ignore cover", "uniform random instead of stratified", "pellet seq not sent", "dry fire spawns pellets", "AR rate 12").
- [ ] **T8 Gates and merge notes**: typecheck, lint, test, build on the branch merged with the work branch; readability sheet rows; "Notes for the merge" filled.

## Dev Notes

### Decisions (non-interactive; designer confirms the player-facing ones below)

- **D1 Pellets are projectiles in the existing pool** (`combat/projectilePool.ts`, `PROJECTILE_POOL_CAPACITY` 512). Worst case 4 Shotguns × 8 pellets × 2 ticks of flight (5 m at 60 m/s = 1.7 ticks) ≈ 64 live; plus 4 ARs ≈ 4 × 8/s × 0.18 s ≈ 6. No capacity change.
- **D2 Stratified fan** (F1): slice k of 8 = 3.75° wide; at 5 m a slice is ~0.33 m, so a Walker (0.7 m wide) at 5 m catches ~2 pellets (8 damage: survives), at 3 m ~3–4 (kills), at ≤ 1.5 m all 8. Damage falls off with distance through geometry alone, no falloff number.
- **D3 Online pellet rolls keyed on the 16-bit seq** so the 7th event field (≤ 3 msgpack bytes) lets remote clients rebuild the exact fan. Offline the `combat` stream (Story 4.4) rolls, so solo replays stay deterministic.
- **D4 Knockback direction = the first hitting pellet's direction** (radial from the muzzle, "blown away from me"). Applied in the same sweep as the damage (present zombie position, like 2.12's pushback).
- **D5 Knockback swept against boxes** (F4). Today's 0.15 m `hitPushbackM` is smaller than a body radius (0.35), so it never tunnels; 0.5 m can push a body centre into a 0.5 m barricade and the zombie system's push-out uses the post-combat position as "from" (`updateZombies` copies `prevX` at its start, after combat). So knockback itself must stop at the face.
- **D6 One `zombie.hit` per pellet hit** (keeps 2.7 confirmations and the hit flash). Measured in 5.6; merge per zombie per tick only if the budget is exceeded.
- **D7 `knockbackM` field:** the existing `common.knockbackM` (default 0) is the per-shot knockback; 5.2 uses the same field for the Fire Axe (1.5 m).
- **D8 Shotgun screen shake:** off (GDD lists only axe, hunting rifle, grenade launcher as heavy) unless the designer wants it (decision below).

### Current state (read before changing)

- `combat/firing.ts › tryFire`: melee branch, dry-fire branch, aim assist (touch only, on the centre aim), single spread roll (`rotateBySeqSpread` online / `streams.combat.range` offline), ONE `spawnProjectile`, `weapon.fired`, reload when empty. `updateProjectiles`: sweep, rewound view, `shotBlockT` cover stop, nearest-first hits, `applyZombieDamage(…, pushback = weaponStats.hitPushbackM)`, pierce.
- `combat/damage.ts › applyZombieDamage`: pushback clamped to the map only (no box test).
- `combat/spread.ts`: the comment already reserves "a multi-pellet weapon would add the pellet index".
- `net/netEvents.ts › WEAPON_FIRED`: `[3, slot, weaponIndex, xcm, ycm, heading]`.
- `apps/client/src/net/cosmeticProjectiles.ts › spawn(owner, weapon, x, y, dirX, dirY)`: one projectile; called from `NetSimHost` for remote `weapon.fired` (line ~415) and for my local shots (line ~566).
- `apps/client/src/render/FxView.ts`: `weapon.fired` → `playSfx("weapon_pistol_fire")` for every gun.
- `config/balanceSchema.ts`: `common.knockbackM` exists, unused (only `balance.test.ts` reads it).
- Shop: `economy/shop.ts › shopWeapons` reads `shop.json › weapons` (fixed list, Story 3.3).

### Copies touched (brief line 2)

World (`projectiles.shotId`, `zombies.knockShot`, shot counter) → schema: none (weapons already synced: `weapon0/1`, `ammo0/1`) → syncState: none → stateView key lists: none → mirror: cosmetic pellets (`CosmeticProjectiles`) → Predictor: none (movement only; firing is never predicted except the local fire clock) → devThrottle: nothing → `snapshotWorld`: add `knockShot` (alive slots) and the shot counter (determinism; `core/worldSnapshot.ts`). Netsim harness `tools/netsim/hitsSim.ts` uses `pelletDirection` too.

### Must be preserved

2.12 reversed-hit numbers for Pistol / SMG / Hunting Rifle (single-pellet path unchanged), 2.7 local fire clock cadence, 4.2 cover rules, 4.4 replay digest, existing `firing.test.ts`, `shotAdvance.test.ts`, `rewind.test.ts`, `cover.test.ts`, the balance freeze for existing numbers (no existing weapon changes).

### Bandwidth estimate (AC 14)

msgpack sizes: `weapon.fired` ≈ 13 B (+ ~3 B seq for pellet guns), `zombie.hit` ≈ 14 B.
- Shotgun into a crowd: 16 + up to 8 × 14 = ~130 B per pull × 1.2/s ≈ **155 B/s per Shotgun player** to every client.
- AR: (13 + 14) × 8/s ≈ **215 B/s per AR player** (less than the SMG's ~325 B/s at 12/s).
- Worst case 4 players all AR: ~0.9 KB/s. Well inside 30 KB/s total (horde ≤ 24).

### Phone FPS plan (AC 15)

No new GameObjects per shot: pellets use `ProjectileView`'s pooled streaks (one per projectile slot, 512). Muzzle FX from the existing FxView pool. Atlas frames for the held guns ≤ 2048² sheet (`category_name_variant`). Measure `?stress=150&stressfire=1&loadout=shotgun` and `…assault_rifle` headless, before/after, with `uptime` load; the 4.10 phone floor (avg ≥ 50, worst second ≥ 30, `docs/perf/milestone-1.md`) must hold when 4.10 runs.

### Beat the rule (for the reviewer; list every attempt and its result)

1. Point-blank "unlucky" shot: fire 1,000 seeds at a Walker 1 m away; any shot < 32 damage? (F1)
2. Knock a zombie through a barricade: stand on one side, zombie touching the other face… and the reverse: zombie touching MY side, shoot it into the barricade: does it clip in, cross, or get stuck so others pile through? (F4)
3. Knockback lock: 4 Shotguns stun-locking a crowd against a wall: do zombies ever reach the players? (liveness, F5)
4. Pellets through a car corner / the bus gap; pellets through sandbags (must pass) and barricades (must pass).
5. Swap to dodge the 2.5 s reload: swap away and back: magazine full? (must not be; F7)
6. Spam fire on skipped inputs / input floods: more pellets than shells? (dry fire)
7. Modified client pre-rotating aim to cancel the pellet fan (F1 makes it pointless: report).
8. Shoot over a teammate: pellets never hurt players (bullets never do).
9. Remote view: does a teammate see the same 8 streaks as the shooter under lag?

### Dependencies on other Epic 5 stories

- **5.1 Weapon upgrades I–IV:** level multiplies per-pellet damage (`base × (1 + 0.25 × (level − 1))`, level IV pellet = 7). Read damage through 5.1's helper if merged first; otherwise `stats.damage` and 5.1 wires the pellet loop.
- **5.2 Fire Axe:** shares `applyKnockback` and `knockbackM` (axe 1.5 m: tunnelling is certain there).
- **5.7 Brute:** knockback × 0.2 lives inside `applyKnockback` (per zombie type field).
- **5.13 Card shop:** replaces `shop.json › weapons`; the two guns then come from the card pool (GDD: Shotgun in the starter pool, AR an unlock; until Epic 7 every pool holds every item).
- **4.11** (other branch, being built): no overlap with weapons; FxView changes there (burning cues) may conflict textually in `FxView.ts`.

### Notes for the merge

| Shared file | What 5.3 changes | Likely conflicts |
| --- | --- | --- |
| `config/balance/weapons.json` | appends `shotgun`, `assault_rifle` | 5.2, 5.4, 5.5 append too: keep every new weapon at the end; the index order is the merge order (server and client ship together) |
| `config/balance/shop.json` | appends two ids | 5.2/5.4/5.5; 5.13 removes the file's role |
| `config/balanceSchema.ts › gunSchema` | `pellets` | 5.4 (fuel/continuous), 5.5 (lob/blast) add gun fields |
| `combat/firing.ts` | pellet loop, shot id, knockback in `updateProjectiles` | 5.1 (damage by level), 5.2/5.4 (melee/continuous branches), 5.5 (lobbed rounds) |
| `combat/damage.ts` | `applyKnockback` | 5.2, 5.4 (friendly-fire tags), 5.7 |
| `zombies/zombiePool.ts` | `knockShot` | 5.4 (ignite timers), 5.6/5.7/5.8 (new per-zombie state) |
| `combat/spread.ts`, `net/netEvents.ts`, `core/simEvents.ts` | pellet roll, seq field | 5.5 (lob events), 5.6 (spit events): new kinds get new numbers, never reuse |
| `core/worldSnapshot.ts` | knockShot, shot counter | every story adding sim state |
| `apps/client/src/render/FxView.ts`, `audio/placeholderSfx.ts` | per-weapon sounds | 4.11, 5.2, 5.4, 5.5, 5.6 |

### Designer decisions to confirm

| # | Decision | Recommended |
| --- | --- | --- |
| DD1 | Pellet pattern | **Stratified fan** (one pellet per 3.75° slice, random inside it): point blank always 32 damage; alternative pure random spread |
| DD2 | Knockback direction | **Along the first pellet that hit** (away from the shooter), 0.5 m once per shot |
| DD3 | Shotgun screen shake | **Off** (GDD heavy list: axe, hunting rifle, grenade launcher); option: a light shake |
| DD4 | Shop prices in the fixed list | **Shotgun 250, Assault Rifle 450** (GDD), both on sale from wave 1's build phase until 5.13 |
| DD5 | Look | **Designer picks from ~5 Meshy proposals** per gun + muzzle FX (T0) |

### References

- `_bmad-output/planning-artifacts/epics.md` › Epic 5 intro, Story 5.3; GDD `gdds/gdd-topdown-shooter-2026-11-21/gdd.md` › Weapon Systems (table, Feel, Aiming), Item and Upgrade System (starter pool, unlocks).
- `game-architecture.md` › projectiles are cosmetic on clients, spawned from `weapon.fired`; `world.balance.weapons.shotgun.pellets` is the architecture's own example.
- Story files 1.5/1.8 (guns), 2.7 (local fire clock, cosmetic projectiles), 2.12 (rewind, seq spread), 4.2 (cover), 4.4 (streams), 4.8 (format, per-body rules).
- `HANDOFF.md` §3 lessons (ticks, cooldown rule in `combat/firing.ts`, no per-tick allocation, Phaser 4, `systems: { waves: () => {} }` in single-mechanic tests).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
