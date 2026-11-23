# Story 5.4: Flamethrower and fire friendly fire

Status: ready-for-dev

## Story

As a player,
I want a Flamethrower that sets the crowd alight,
so that I can hold a choke point, while being careful of my friends.

> **EPIC 5 BRIEF** (§11 of `_bmad-output/implementation-artifacts/epic-4-retro-2026-11-23.md`), quoted in full. It is this story's checklist and every line applies. Builders and reviewers check each line.
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
> Most relevant here: 3 and 4 (friendly fire is a player-visible rule and the obvious griefing tool), 5 (flames through a car), 6 (the flame and the ignite burn on per-body clocks, like 4.8), 9, 10, 11 (a continuous weapon must not turn into 20 events per second per zombie), 12 (flame particles), 14.

## Acceptance Criteria

### Fairness rules (written first, brief line 3; each is a test)

- **FR-A Flames hurt what the cone touches, and only that.** A zombie (or teammate) takes flame damage when its body circle overlaps the cone (from the muzzle, `rangeM` 4 m to the body's edge, `coneDeg` 35° wide), with the same `circleOverlapsSector` test the melee arc uses. The client draws the cone at exactly that reach and angle.
- **FR-B Cars, the bus and buildings stop flames; barriers, sandbags and player barricades don't.** A body is in the flame only if the straight line from the muzzle to its centre crosses no shot blocker (`shotBlockT < 0`, Story 4.2). You cannot flame a zombie or a teammate behind a car. You can flame zombies on the other side of a barricade they are attacking (the choke-point play).
- **FR-C Exposure is per body and cannot be dodged.** Each (body, flamer) pair has its own flame clock that counts the ticks the body spends in that flamer's cone. It is kept while the body is outside and restarts at every build start (4.8 D3/D19). Stepping in and out on any tick saves nothing. A zombie's first pulse lands on its **first** tick in the cone, so the weapon responds at once. A player's first pulse lands one pulse after entering (4.8 rule), so brushing a teammate for a tick does nothing.
- **FR-D Friendly fire: fire and explosions at 50 %, bullets and melee never.** A player's source tagged `fire` or `explosion` that hits a teammate **or the shooter** deals `friendlyFire.pct` (50) % of its damage. `bullet` and `melee` deal 0 to players and never emit `player.damaged`. The rule lives in ONE function in `combat/damage.ts` (`damagePlayerBy`), and every later player-caused fire or explosion goes through it: 5.5 grenades, the 5.9 mine (moved onto it, see Dependencies), 5.12 grenades and molotovs.
- **FR-E Friendly fire can down a teammate.** Friendly fire uses the normal downed rules (Story 2.8): it can down a teammate, it never hurts downed or out players, and god mode is respected. *(Designer decision D1 below. The alternative is "friendly fire never takes a player below 1 HP".)*
- **FR-F Environment fire stays as it is.** The 4.8 car fires are not a player's source: they keep 10 dmg/s to everything (not halved). They are tagged `fire` (for cues) with no source player.
- **FR-G Ignite is honest.** A zombie hit by a flame pulse burns for `igniteS` (3 s) at `igniteDamagePerS` (3/s). A new pulse refreshes the timer (to the full 3 s, never stacking). The burn is per body (its own ignite clock) and is credited to the player whose pulse lit it last. Ignite never spreads to other bodies. Players are never ignited (decision D3).
- **FR-H The fuel rule.** Fuel is `fuelS` (6 s) of held fire, counted in ticks (120). One tick of fire costs 1 tick of fuel, and only while the cone is out (the trigger is held past the dead zone, the player is alive and not swapping or reloading). At 0 fuel the `reloadS` (3.0 s) reload starts on its own, as guns do. A swap cancels a reload in progress (FR5, unchanged). Swapping to dodge a reload restarts it from the beginning when you come back to an empty tank (no partial refill).

### Mechanics

1. **Flamethrower in balance (FR13, FR16).** `weapons.json › flamethrower`: a new weapon kind `"flame"` (`balanceSchema.ts` discriminated union): `damagePerS` 20, `rangeM` 4, `coneDeg` 35, `fuelS` 6, `reloadS` 3.0, `pulseS` 0.25 (zombie pulse: 5 damage), `playerPulseS` 0.5 (friendly-fire pulse: 20 × 0.5 × 50 % = 5), `igniteDamagePerS` 3, `igniteS` 3, `ignitePulseS` 0.5, `hitPushbackM` 0, `screenShake` false, `price` 700, `name` "Flamethrower". The zod schema refines: every pulse is a whole number of ticks, `fuelS × 20` fits in `ammo0/1` (uint16), and `damagePerS × playerPulseS × pct / 100` is a whole number (player HP stays whole). `combat.json` (new, see AC 4) holds the friendly-fire numbers. It is in the fixed-list shop (`shop.json › weapons`) until 5.13 replaces it.
2. **Firing (`combat/flame.ts`, called from `combat/firing.ts › tryFire`).** With the Flamethrower active, the trigger held past the dead zone and fuel > 0, the player "flames" this tick: there is no projectile, no cooldown and no aim assist (the cone is wide, as with melee). The cone points along the raw aim (2.12: online, tested against the rewound zombie view like `swingMelee`, live positions offline). Every zombie in the cone (FR-A, FR-B) advances its (zombie, flamer-slot) clock; at a pulse it takes `damagePerS × pulseS` × the 5.1 level multiplier through `applyZombieDamage(…, "flamethrower", { quiet: true })` (assist credit and kill events as usual, no `zombie.hit` on the wire: AC 6) and is ignited. Pushback 0. `weapon.flame_started` / `weapon.flame_stopped` are emitted on the first and last tick of a burst, not every tick.
3. **Ignite (`flame.ts › updateIgnites`).** `ZombiePool` gains `igniteTicks` (Uint8: ticks left), `igniteClock` (Uint8) and `igniterSlot` (Uint8, 255 = none), all reset in `spawnZombie`. Every tick (combat system, after the weapons) each ignited zombie counts its clock down and takes `igniteDamagePerS × ignitePulseS` (1.5) every `ignitePulseS`, credited to `igniterSlot`'s player (`killZombie(…, killer, "flamethrower")`). The burning flag goes on the wire for free (AC 6). Ignited zombies keep their AI (no panic run) *(D4)*.
4. **Friendly fire (`combat/damage.ts`, FR18).** New `DAMAGE_TAGS = ["zombie", "bullet", "melee", "fire", "explosion"]` (append only: the index goes on the wire) and `damagePlayerBy(world, target, amount, tag, sourcePlayerId, sourceZombieId)`. This is the only way a player loses HP from now on. Zombie bites (`zombieAi.ts › damagePlayer`) and 4.8 car fire (`decay/fire.ts › burnPlayer`) are moved onto it, with unchanged amounts. With a `sourcePlayerId`: tags `bullet` and `melee` → 0 (no event); `fire` / `explosion` → `round(amount × combat.friendlyFire.pct / 100)`, also for the shooter's own body. Then the existing path runs: alive only, god mode, `player.damaged`, `downPlayer` at 0. `combat.json`: `{ "friendlyFire": { "pct": 50, "canDown": true } }`. Flame friendly fire: a teammate in a flamer's cone (FR-A/B) advances that flamer's player clock and takes the 50 % pulse every `playerPulseS`.
5. **`player.damaged` carries its cause.** The event gains `tag: DamageTag` and `sourcePlayerId: string | null` (`sourceZombieId` is kept, −1 = none). Wire (`netEvents.ts`, kind 9): two fields are appended, the tag index and the source player slot (255 = none). `render/fireCue.ts › isFireHit` becomes `tag === "fire"` (car fire and flames). 4.11's burning-player effects and "−N" damage numbers play for `fire`. Friendly hits also show who hurt you: a small "−5" in the source player's ring colour.
6. **Network (brief line 11).** No per-tick flame state:
   - `weapon.flame_started { playerId }` / `weapon.flame_stopped { playerId }` (new kinds 27 and 28). Remote clients draw the cone from the flamer's synced heading while it is on. Lost or late events cannot leave a cone on forever: the client stops it when the flamer's synced `ammo` stops falling for 3 state patches, or when it is not alive.
   - Quiet hits: `zombie.hit` with `quiet: true` is not encoded (`encodeNetEvent` returns null). Economy and assists still see it on the server (it is the same event on the bus). A killing pulse still sends `zombie.killed`.
   - Burning zombies: bit 3 of the horde record's state nibble (`hordeFormat.ts › packTypeState`) is "burning" (0 added bytes). `ZOMBIE_STATE` values must stay ≤ 7; a test enforces it.
   - Fuel: the existing `ammo0/1` (uint16) carry fuel ticks.
   - Report the added B/s (AC 10).
7. **Client.** (a) **Own flame instant (2.7):** the local fire clock (`net/localFire.ts`) predicts flaming from the local fuel count and draws the cone at once. It cosmetically consumes fuel and resyncs to the server's `ammo`. (b) **Remote flames** from the events + heading. (c) **Flame visuals:** a pooled, atlased flame jet (`fx_flame_jet_a…`) plus a capped particle pool, drawn only up to the first shot blocker along each ray (the same `shotBlockT` as the sim: you can see that cars stop it). (d) **Burning zombies:** one pooled flame overlay per burning zombie, nearest first up to `fx.maxBurningZombieFx`. (e) **HUD:** the Flamethrower slot shows a fuel bar instead of a round count, and a reload bar. (f) **Friendly-fire cue:** 4.11's burning effects on the hit teammate, a "−5" in the source's colour, and for the flamer an orange ring flash on the teammate they are hurting (so you notice that *you* are the problem).
8. **Upgrades (5.1).** Flame pulse damage, ignite damage and friendly-fire damage all come from 5.1's `weaponDamage(balance, weapon, level)` (`base × (1 + 0.25 × (level − 1))`). For the Flamethrower, `damage` = `damagePerS` and the pulse is `weaponDamage × pulseS`. The pulse sizes stay whole (schema check per level I–IV, or round per pulse; document which).
9. **Bots.** `bots/botShop.ts` may buy the Flamethrower (append it to the bot buy order only if the 6-wave sim shows it does not wipe teammates. Record the friendly-fire damage dealt by bots). Bots do not hold fire when a teammate is in the cone *(note in "not verified": bot FF avoidance is not a goal)*.
10. **Bandwidth and perf.** Report: one player flaming a crowd vs the SMG on the same crowd (events B/s, patch B/s); 4 flamers; tick p99 with 4 flamers × 150 Walkers (`PERF_ASSERT=1`, record load). Expected: +4 B per burst start/stop, +~60 B/s per flamer for the `ammo` patch, 0 B/s for burning zombies, quiet hits remove ~100–300 `zombie.hit`/s that a naïve version would send.

### Tests (Vitest)

11. Friendly-fire table (FR18, epics AC): bullets 0 %, melee 0 %, fire 50 %, explosions 50 %; shooter's own body 50 %; zombie bites and car fire 100 % with no source player; downed/out players take 0; god mode; FF downs a teammate (`canDown`). This test lives in `combat/damage.test.ts` and later sources add rows to it.
12. Flame: cone edges (inside/outside by angle and reach, body-edge rule); cover (a car between flamer and zombie: no damage; a barrier/sandbags/barricade between: damage); per-body clocks (step-in/out pattern deals exactly exposure/pulse hits; first zombie pulse on the first tick; first player pulse after one pulse); two flamers stack on one zombie (separate clocks, both credited); fuel = 120 ticks then a 3.0 s reload; swap cancels the reload; no fuel used while swapping/reloading/downed; ignite refresh (not stack), 3 s length, credit to the last igniter, kill weapon `flamethrower`; rewound cone online (2.12) vs live offline; same seed + input log → same `snapshotWorld` digest with flamers.
13. Liveness (brief line 9): a seeded sim where one player flames a choke point for a wave: ≥ N kills with weapon `flamethrower`, ≥ 1 ignite kill, ≥ 1 friendly-fire pulse on a teammate placed in the cone; each new test fails under one listed mutation.
14. Network: `netEvents` round trip for the new kinds and the extended `player.damaged`; `encodeNetEvent` drops quiet hits; horde burning bit round trip; NetSimHost mirror shows burning zombies and remote cones; `tools/netsim` under `?lag=150&jitter=20`: client HP = server HP for a teammate in the cone, every FF hit seen once, the remote cone ends when the flamer runs dry even with `flame_stopped` dropped.
15. Fuzz (brief line 7, areas): `combat/flame.fuzz.test.ts`: random Downtown layouts × decay stages 1–3 × flamer positions/aims × 2,000 ticks: no zombie behind a shot blocker is ever damaged by the flame (independent rewrite of the cone + cover check from map data), no body inside a box, zombies still reach a player, no field rebuild outside a build start, no allocation growth.

## Designer decisions to confirm

| # | Decision | Recommended | Numbers / alternative |
|---|---|---|---|
| D1 | Can friendly fire down a teammate? | **Yes** (`combat.json › friendlyFire.canDown: true`) | Alternative: friendly fire stops at 1 HP. GDD: "area weapons need care". |
| D2 | Does the 4.8 car fire become 50 % for players? | **No**: environment fire stays 10/s (not a player's source) | — |
| D3 | Can flames ignite players? | **No**: teammates take only the 50 % cone pulse | Alternative: ignite players at 50 % (+1.5/s for 3 s). Harsh with 4 players. |
| D4 | Do ignited zombies change behaviour? | **No** (keep chasing) | Alternative: panic-run. Needs new AI and breaks choke points. |
| D5 | Zombie pulse size | **0.25 s → 5 damage**, first pulse on the first tick | 0.5 s → 10 feels laggy on 10-HP Walkers. |
| D6 | Fuel use | **1 fuel tick per firing tick, auto reload at 0** (no manual reload, like guns) | — |
| D7 | Flames vs player buildings | **No damage** to barricades/turrets | GDD silent. Lets flame + barricade be the choke-point combo. |
| D8 | Price | **700** (GDD/epics) | Balance frozen until 4.10; no change. |
| D9 | Art pick | One of ~5 Meshy proposals (task T0) | — |

## Beat the rule (reviewers: try each, record the result)

1. **Flame griefing:** stand behind a teammate and hold fire on them. Expected: 10 HP/s (5 every 0.5 s). They go down in ~10 s from full. The flamer sees an orange ring flash on them and the teammate sees the source colour. Check that it is logged per player.
2. **Flame through a car:** a zombie (or teammate) directly behind a parked car, or at the car's corner. Expected: no damage while the muzzle-to-centre line enters the car's box, and the visual stops at the car face.
3. **Flame through a barricade or sandbags:** expected: damage (barricades are not shot blockers). Confirm that this reads as intended in play.
4. **Step out on the pulse:** a teammate wiggles in and out of the cone edge. Expected: total damage = exposure ticks / 10 × 5, with no saving.
5. **Swap to dodge the reload:** empty the tank, swap away, swap back. Expected: the reload restarts at 3.0 s, so there is no fuel gain. Swapping mid-burst keeps the remaining fuel.
6. **Two flamers on one zombie / on one teammate:** expected: damage stacks (separate clocks). A teammate in two cones takes 2 × 5 per 0.5 s. Is that acceptable? Record it.
7. **Self-damage:** aim the cone at your own feet or a wall at point blank. Expected: no self-damage from flames (the cone starts at the muzzle, outside your body). Your own grenade (5.5) is the self-damage case.
8. **Ignite farming:** ignite a crowd and swap to the Pistol. Expected: the ignite still credits you, its kills count as `flamethrower` kills, and the economy pays as usual.
9. **Lag exploit:** at `?lag=300`, flame a teammate who is running away. Rewind applies only to zombies (2.12). Players are tested at their server positions, so you cannot hit a teammate where they were 300 ms ago.
10. **Event loss:** drop `weapon.flame_stopped`. Expected: the remote cone ends within 3 patches.

## Tasks / Subtasks

- [ ] **T0 Art pick first (AC 7):** make ~5 Meshy proposals (`nano-banana-pro`, text to image, the 4.11 style line: strict top-down orthographic, gritty realistic, night, wet asphalt, cool streetlight from the upper left, muted, crisp silhouette, no text) for (a) the survivor holding the Flamethrower (tank on the back, nozzle forward), (b) the flame jet / cone (a 35° spray reaching 4 m, bright core, smoky edge), and (c) a burning zombie. Publish a private proposal page (as 4.11 did) and **wait for the designer's pick**. Save the picks plus prompts in `docs/art/5-4/README.md` with the same table as `docs/art/4-11/README.md`. Sprites come from the picks (cut out, Dead City palette, `fx_flame_jet_a`, `weapon_flamethrower_held_a`, `fx_burning_a…`). Build in the atlases (`render/city/spriteAtlas.ts`, `ATLAS_FX`, ≤ 2048²).
- [ ] **T1 Balance + schema (AC 1, 4):** `flameSchema` in `balanceSchema.ts` (the discriminated union gains `kind: "flame"`), `weapons.json › flamethrower`, new `combat.json` + loader in `config/balance.ts` (and `balance.version`), `shop.json` entry, refines. Tests: `config/balance.test.ts` (refusals: fractional pulse ticks, fuel > uint16, non-whole FF pulse).
  - [ ] `weapons.ts`: `isFlame()`. Every `isGun`/`isMelee` switch gets a `flame` branch (`loadout.ts › createSlot`: ammo = fuel ticks; `firing.ts`; client HUD; `botShop`).
- [ ] **T2 Friendly-fire rule (AC 4, 5, 11):** `DAMAGE_TAGS`, `damagePlayerBy`. Move `zombieAi.ts › damagePlayer` and `decay/fire.ts › burnPlayer` onto it with no behaviour change (the 4.8 tests must stay green untouched). `SimEvent` `player.damaged` + `tag`, `sourcePlayerId`. Netevent fields. `fireCue.isFireHit`. **If 5.9's mine has its own 50 % code, move it onto `damagePlayerBy` here** (a 5.9 test row in the FF table).
  - [ ] Test `damage.test.ts › "friendly-fire table"` (AC 11).
- [ ] **T3 Flame weapon (AC 2, 8, 12):** `combat/flame.ts`: `flameTick(world, p, slot, stats, dirX, dirY, view)` (cone via `circleOverlapsSector` + `shotBlockT` per candidate; zombie clocks `world.flame.zombieClock` Uint8Array(capacity × MAX_PLAYERS); player clocks on `PlayerState.flameClock: Uint8Array(MAX_PLAYERS)`; burst edge tracking `PlayerState.flaming`). `tryFire` branch for `isFlame`: fuel, auto reload, no cooldown. `applyZombieDamage` gains an options arg `{ quiet }`, or reuse 5.2's continuous-melee option if it exists. `resetBurnClocks` (4.8) also zeroes the flame clocks at every build start.
  - [ ] Tests `combat/flame.test.ts`: cone, cover, clocks, stacking, fuel/reload/swap, rewind, upgrades.
- [ ] **T4 Ignite (AC 3):** pool fields, `updateIgnites` in the combat system after the weapons, credit, refresh. Tests in `flame.test.ts`.
- [ ] **T5 Snapshot / sync copies (brief line 2):** World (`flame` clocks, pool ignite fields, `PlayerState.flaming/flameClock`) → `snapshotWorld` (all of them) → schema: nothing new (ammo reused) → `syncState` (fuel through `ammo`) → `stateView` key lists: none → `fakeRoom`: none → mirror (`mirrorZombies` reads the burning bit into a client-only `burning` array; it never feeds the sim) → Predictor: no change (combat is not predicted; flaming does not slow the player) → devThrottle: none. `netEvents.ts` kinds 27/28 + `player.damaged` fields + quiet-hit drop. `hordeFormat.ts` burning bit.
- [ ] **T6 Client (AC 7):** `render/FlameView.ts` (pooled jet + particles; ray clip by `shotBlockT` on the mirror World), `render/ZombieView.ts` burning overlay, the `localFire.ts` flame branch, HUD fuel bar (`scenes/hudModel.ts`, `HudScene.ts`), friendly-fire cue (reuse 4.11's burning cue module and damage numbers), `audio/placeholderSfx.ts` loop `weapon_flamethrower_loop` (start/stop on the events).
- [ ] **T7 Network tests (AC 14):** `netEvents.test.ts`, `hordeFormat.test.ts`, `sim/NetSimHost.flame.test.ts`, `tools/netsim/flame.test.ts` (lag 150/20, hidden tab across a build start, late Game scene start).
- [ ] **T8 Fuzz + liveness + mutations (AC 13, 15):** `combat/flame.fuzz.test.ts`. Record a mutation table like 4.8's (e.g. M1 the cone ignores cover, M2 a shared pulse tick, M3 FF at 100 %, M4 bullets hurt teammates, M5 ignite stacks, M6 no fuel use while flaming, M7 quiet hits on the wire, M8 burning bit dropped).
- [ ] **T9 Bandwidth + perf + phone FPS (AC 10, brief 11/12/16):** `apps/server/src/run/weaponBandwidth.test.ts` (new; pattern of `decayBandwidth.test.ts`), `tickCostDowntown.test.ts` (+4 flamers), `?stress=150` with `?loadout=flamethrower,smg` and the stress bots flaming: headless FPS before/after, load recorded. Flame particles capped by `combat.json › fx.maxFlameParticles` (recommend 96) and `fx.maxBurningZombieFx` (recommend 40).
- [ ] **T10 Readability + docs:** add the flame cone and burning zombie to `docs/playtests/milestone-1/readability-sheet.md` (or the Epic 5 sheet). Run the browser check (Playwright: solo `?loadout=flamethrower,pistol`, online 2 players with a teammate in the cone). Run the gates. Write the merge notes.

## Dev Notes

### Current state (read before changing)

- `combat/firing.ts`: `updatePlayerWeapon` → `updateSwap` → `tryFire`. A gun shot spawns into `world.projectiles`, and melee calls `swingMelee` (instant, rewound with `rewoundView(world, world.tick - rewind)`). There is no continuous weapon yet (5.2's Chainsaw adds one in round B: **read its code first and reuse its continuous/quiet-hit path if it exists**). Reload starts only when the magazine empties (`slot.reloadTicks = ticksFor(stats.reloadS)`), and `updateSwap` cancels it.
- `combat/damage.ts › applyZombieDamage` always emits `zombie.hit`, which feeds `economy.ts` (assist damagers, line 147) and the 2.7 client confirmation.
- Players lose HP in exactly two places today: `zombies/zombieAi.ts › damagePlayer` (bites, Crawler slow) and `decay/fire.ts › burnPlayer` (4.8, `sourceZombieId: -1`). Both emit `player.damaged { playerId, amount, sourceZombieId }`. The client's `fireCue.isFireHit` = `sourceZombieId < 0` (this breaks with any new zombie-less source, hence AC 5).
- `combat/cover.ts › shotBlockT / shotLineClear` (4.2): cars, the bus and map boxes. Barriers, sandbags and barricades are not shot blockers.
- `math/sector.ts › circleOverlapsSector` (melee arc test) is reused for the cone.
- `decay/fire.ts` (4.8) is the model for per-body clocks (`fireTicks` on players, zombies and buildings; `resetBurnClocks` at every build start) and for "no hit event per pulse" (D8).
- Wire: `netEvents.ts` kinds up to 26 (`DECAY_STAGE_CHANGED`). Round A/B stories append theirs: **take the next free numbers at merge time and never reuse one**. `hordeFormat.ts`: typeState = low nibble type, high nibble state.
- Client: `scenes/GameScene.ts` drains events into `FxView.handle` (line ~860) and the fire cue. `ZombieView` per-type `LOOKS` (`satisfies Record<ZombieTypeId, …>`). `net/localFire.ts` is the own-shot clock. `ammo0/1` are `t.uint16`.

### Round C interface contract (identical in 5.4, 5.5, 5.8; whoever lands first creates it)

- `combat/damage.ts` (owner **5.4**): `DAMAGE_TAGS` (append only), `type DamageTag`, `damagePlayerBy(world, target, amount, tag, sourcePlayerId: string | null, sourceZombieId = -1): number` (returns the HP actually taken), and `applyZombieDamage(…, opts?: { quiet?: boolean })`.
- `combat/explosion.ts` (owner **5.5**): `EXPLOSION_KINDS` (append only: `"grenade"`, then 5.8 `"bloater"`; 5.9's mine joins as `"mine"`), `explode(world, spec: ExplosionSpec)`, where `ExplosionSpec = { x, y, radiusM, zombieDamage, playerDamage, buildingDamage, pushM, kind, sourcePlayerId, weapon }`. It is cover-checked per body and emits one `explosion.happened`. Players go through `damagePlayerBy(tag "explosion")`.
- `player.damaged` = `{ playerId, amount, sourceZombieId, tag, sourcePlayerId }`.
- `combat.json` (owner **5.4**): `friendlyFire`, `fx` caps. 5.5 adds `explosion` and 5.8 adds `bloater` fx caps.

### Copies touched (brief line 2)

World (flame clocks, ignite pool fields, player flaming/flameClock) → schema (none; `ammo` reused) → `syncState` (none new) → `stateView` key lists (none) → mirror (`mirrorZombies`: burning bit to a client-only array) → Predictor (none) → devThrottle (none) → `snapshotWorld` (flame clocks, ignite fields, player flame fields). Events: `netEvents.ts`.

### Must be preserved

All 4.8 fire behaviour and its mutations (car fire 10/s, per-body clocks, build-start reset). The 2.7/2.12 hit metrics for guns. The economy assist rules. Bullets and melee stay harmless to players. `SYSTEM_ORDER` unchanged. Balance frozen except the new entries.

### Dependencies

- **4.8** (done): fire zones, burn clocks, `resetBurnClocks`, `fireCue`.
- **4.11** (branch `story-4-11`, in progress): burning-player effects (flames, embers, smoke, orange screen-edge glow, "−5" damage numbers driven by `player.damaged`). **Reuse them for flame and friendly-fire hits.** If 4.11 is not merged yet, merge it first or stub the cue behind `isFireHit`.
- **5.1** (round B): `combat/weapons.ts › weaponDamage(balance, weapon, level)` and `slot.level`. Use it, not a copy (the `flame` kind must be accepted by it).
- **5.2** (round B): the Chainsaw's continuous melee. Its story sends a `zombie.hit` per zombie per chainsaw tick (≤ 1.5 KB/s budget, its D5), so **no quiet-hit path exists yet**: 5.4 adds `applyZombieDamage(…, { quiet })`. Offer it to the Chainsaw in the merge notes and leave the Chainsaw's behaviour unchanged here.
- **5.3** (round A): the pellet weapon sets the "several hits per shot" precedent in `firing.ts`. Keep both branches readable.
- **5.6** (round A): Spitter acid deals zombie-caused area damage to players, so its call site moves to `damagePlayerBy(tag "zombie")`.
- **5.9** (round A): the mine's "players in range take 50 %" must use `damagePlayerBy` (move it here if 5.9 wrote its own).
- **5.5, 5.8** (round C, parallel): see the interface contract. Land 5.4's `damage.ts` first (a small first commit) so 5.5/5.8 can build on it.

### Phone FPS plan

One jet sprite per active flamer (additive), plus a shared particle pool (`fx.maxFlameParticles` 96, emitted at ≤ 30/s per flamer, frame-rate independent), plus one overlay per burning zombie up to `fx.maxBurningZombieFx` 40 (nearest the camera first). All frames live in `ATLAS_FX`. There is no per-frame allocation (pooled Phaser 4 `Image`s; check `node_modules/phaser/types` before using `ParticleEmitter` config fields, since Phaser 4's API differs from 3). Measure `?stress=150` with 4 flaming stress bots, before and after.

### Notes for the merge

- `combat/damage.ts`: new exports; `applyZombieDamage` gains a trailing options arg (call sites unchanged).
- `combat/firing.ts`: a `flame` branch in `tryFire`, and burst edge events.
- `config/balanceSchema.ts`: the weapon union gains `flame`, and there is a new `combatSchema`. `balance.ts` loads `combat.json`.
- `core/simEvents.ts`: `player.damaged` gets 2 fields (every literal in tests needs them, or make them optional with defaults `zombie`/null); 2 new event types.
- `net/netEvents.ts`: kinds 27/28 (renumber at merge if A/B took them), plus `player.damaged` fields; `hordeFormat.ts` burning bit.
- `zombies/zombiePool.ts`: 3 new arrays (reset in `spawnZombie`); `zombieAi.ts › damagePlayer` delegates; `decay/fire.ts › burnPlayer` delegates and `resetBurnClocks` zeroes the flame clocks.
- Client: `fireCue.ts` (`isFireHit` by tag), `localFire.ts`, `ZombieView.ts`, new `FlameView.ts`, HUD.

### References

- `_bmad-output/planning-artifacts/epics.md` › Epic 5 intro, Story 5.4; FR13, FR16, FR18.
- GDD (`planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md`) › Weapons table (Flamethrower row), "Friendly fire" line, Balance intent.
- Architecture (`planning-artifacts/game-architecture.md`) › Networking (events; projectiles are not entities), Entity Patterns (pools), `combat/` folder ("damage, friendly fire").
- Story files 4.2 (cover), 2.12 (rewind), 2.7 (local fire clock), 4.8 (fire, D3/D8/D16/D19), `docs/art/4-11/README.md` (art-pick format), HANDOFF.md §3/§4.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
