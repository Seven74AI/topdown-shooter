---
baseline_commit: b84caa3501de1e548dae55180d51f0155e2b0add
---

# Story 5.5: Grenade Launcher

Status: review

## Story

As a player,
I want a Grenade Launcher that lobs explosive rounds,
so that I can blow apart packed crowds at a distance.

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
> Most relevant here: 3 and 4 (self-damage and blasting teammates, grenades over cars, blasts at spawns), 5 (the round's path and the blast respect 4.2 cover), 6 (one blast = one hit per body, nothing to dodge on a tick), 7 (knockback is spatial: fuzz), 9 ("≥ 1 explosion"), 10 (pooled rounds), 11 (the round and blast go out as events: launch + landing tick, no per-tick round state), 12 (explosion particles, scorch decals).

## Acceptance Criteria

### Fairness rules (written first, brief line 3; each is a test)

- **FR-A The round lands where you aimed, at most 12 m away and never closer than `minLobM`.** The landing point is the aim point. With the mouse it is the cursor. On touch it comes from the aim stick's deflection (decision D1). It is clamped to [`minLobM` 3, `lobRangeM` 12] m from the muzzle. The client draws a landing marker (a ring of the exact blast radius) at that point while the Grenade Launcher is aimed, so you see where it will land and how big the blast is before firing.
- **FR-B Cars, the bus and buildings stop the round; barriers, sandbags and barricades don't.** The round flies a straight ground track from the muzzle to the landing point. If that track enters a shot blocker (`shotBlockT ≥ 0`, Story 4.2), the round explodes at the blocker's face (the entry point pulled back by `faceBackoffM` 0.05 m). The visual arc is cosmetic: it never "jumps" a car. *(Decision D2: the brief says cover stops projectiles. The alternative, lobbing over cars, is listed.)* Zombies in flight are not hit: the round flies over them.
- **FR-C The blast hits what it can see.** A body is hit when its circle overlaps the blast circle (`d < blastRadiusM + bodyR`, the 4.8 "touches the ring = hit" rule) **and** the line from the blast centre to the body's centre crosses no shot blocker. A car between you and the blast protects you. Barricades and sandbags do not.
- **FR-D Friendly fire 50 %, the shooter included (Story 5.4 rule).** Players in the blast (teammates and the shooter) take `round(damage × 50 %)` = 20 through `damagePlayerBy(tag "explosion")`. A blast can down a player (5.4 D1). Downed and out players are unharmed.
- **FR-E One blast = one hit per body.** Each body is hit at most once per explosion (no per-tick area), so there is nothing to dodge on a pulse. The explosion happens on the server's landing tick. Everyone sees it from the `explosion.happened` event; clients never decide hits.
- **FR-F No rewind for blasts.** The blast hits the zombies where they are on the server's landing tick (the round took ≥ 0.25 s to fly, and an area this large does not need 2.12). The client's landing marker and the explosion appear at the server's position.

### Mechanics

1. **Balance (FR13, FR14).** `weapons.json › grenade_launcher`: a new weapon kind `"launcher"` (`balanceSchema.ts`): `damage` 40, `rateHz` 0.8, `lobRangeM` 12, `minLobM` 3, `lobSpeedMps` 20 (so 12 m takes 0.6 s; flight = `max(minFlightS 0.25, distance / speed)` rounded to ticks), `blastRadiusM` 2, `blastPushM` 0.6 (zombies pushed straight out from the centre; 5.7's Brute knockback factor applies), `magazine` 4, `reloadS` 3.0, `spreadDeg` 0, `hitPushbackM` 0, `screenShake` true, `price` 800, `name` "Grenade Launcher". `combat.json › explosion` (5.4's file): `maxLiveRounds` 32 (pool capacity), `faceBackoffM` 0.05, `fx.maxExplosionParticles` 96, `fx.maxScorchDecals` 16. Add it to the fixed-list shop until 5.13.
2. **Firing (`combat/firing.ts › tryFire` launcher branch → `combat/grenades.ts`).** The cooldown rule is the shared one (`cooldown.ts`), like guns. There is no aim assist and no spread. The aim distance comes from the input (AC 4). It spawns one round into a new pooled `world.grenades` (struct-of-arrays, capacity `maxLiveRounds`, like `projectilePool.ts`): origin, landing point (already clipped by FR-B on the server at launch), `landTick`, owner, weapon level. It emits `grenade.launched { playerId, grenadeId, x, y, tx, ty, landTick }` and the normal `weapon.fired` (the muzzle flash and screen shake use the existing path, `screenShake: true`). Ammo and reload are the gun rules unchanged.
3. **Landing (`grenades.ts › updateGrenades`, in the combat system after projectiles).** At `landTick` the round calls `explode(world, spec)` (below) and is freed. A round whose owner left keeps flying and explodes (credit: null). A wipe or Results clears the pool. No allocation.
4. **Aim distance on the wire.** `PlayerInput.aimX/aimY` (zod: each in [−1, 1], length ≤ 1) already allow a length < 1. The client encodes the aim distance as the aim vector's length **only while the Grenade Launcher is active**: length = clamp(distance / `lobRangeM`, `minLobM` / `lobRangeM`, 1). Mouse: the cursor distance. Touch: the deflection past the fire dead zone maps linearly to [minLob, 12 m] (D1). Every other weapon keeps unit vectors, and the server normalises the direction as it does today (`tryFire` divides by `aimLen`), so nothing else changes. The prediction (movement only) is unaffected. The 2.12 seq spread is not used (spread 0).
5. **The explosion (`combat/explosion.ts`, shared with 5.8, 5.9 and 5.12).** `explode(world, spec)`: one `queryRadius` on the zombie grid. For each live zombie: the FR-C overlap and the `shotLineClear(centre → zombie)` check, then `applyZombieDamage(world, id, zombieDamage, dirOut, pushM × knockbackFactor, sourcePlayerId, weapon, 0, { quiet: !kills })`. The push is 5.3's swept `applyKnockback` (stops at the first face: car, bus, building, barricade, turret, map box, map edge; 5.2 D2) with 5.7's Brute factor, never a raw position change. The fuzz checks no body ends up inside a box (AC 9). For each player: the same checks, then `damagePlayerBy(…, "explosion", sourcePlayerId)`. For each building in range: `buildingDamage` (grenades: **0**, decision D4). Then one `explosion.happened { kind, x, y, radiusM, sourcePlayerId }`. Each body is hit at most once (FR-E). Damage uses 5.1's `weaponDamage(balance, "grenade_launcher", level)` (the round stores its level at launch: an upgrade bought later doesn't change a round in flight; that cannot happen in a wave anyway).
6. **Network (brief line 11).** New event kinds (next free numbers): `GRENADE_LAUNCHED` `[k, slot, grenadeId u8, x cm, y cm, tx cm, ty cm, landTick − tick (u8)]` and `EXPLOSION_HAPPENED` `[k, kindIdx, x cm, y cm, radius cm, srcSlot]`. Blast hits on zombies that do not kill are quiet (5.4: not on the wire; the explosion event is the visual). Kills send `zombie.killed` as usual. Player hits send `player.damaged` (tag explosion, source slot). There is **no** grenade state in the schema. The client flies the cosmetic round from the event and hides it when `explosion.happened` for that grenade arrives, or at `landTick` + 10 ticks if the event is lost (pending until the server agrees: the explosion visual waits for the event).
7. **Client.** (a) Landing marker while aiming (pooled ring at `blastRadiusM`, exact radius; clipped to the cover face like the sim so you see when a car will stop it). (b) Cosmetic round: a pooled sprite on a parabola from muzzle to landing point (arc height `fx.lobArcM` 1.5 m, drawn as scale + shadow offset), timed to `landTick` in server ticks (`serverClock`). (c) **Own shot instant (2.7):** your own launch draws immediately from the local fire clock, aimed at the locally computed landing point. The server's `grenade.launched` replaces it (snapped if the server's clipped point differs). (d) Explosion: flash + shockwave ring at the exact radius + capped debris/smoke particles + a scorch decal that fades by the end of the wave (pool `fx.maxScorchDecals`). Screen shake for everyone within `fx.shakeWithinM` 6 m of the blast (settings toggle respected). Placeholder sounds `weapon_grenade_launch`, `fx_explosion`. (e) HUD: the round count (4) and reload bar as for guns.
8. **Bots.** The bot policy may use the Grenade Launcher (aim distance = its target's distance). Log bots' self- and friendly damage in the 6-wave sim. This is not evidence of difficulty (brief line 15).
9. **Fuzz (brief line 7, explosions).** `combat/explosion.fuzz.test.ts`: random Downtown layouts × decay stages 1–3 × random blast points (including right at car faces, inside the bus's shadow, on spawn jitter segments, next to barricades) × crowds. Checks: (i) every hit body passes an independent rewrite of FR-C (overlap and line of sight, written from the map data); (ii) no body behind a shot blocker is hit; (iii) no zombie ends inside a box or a building after the push and the next zombie pass; (iv) zombies still reach a player; (v) no flow-field rebuild outside a build start; (vi) each body is hit at most once per blast. Grenade tracks: (vii) no round ever explodes past the first shot blocker on its track.
10. **Bandwidth and perf.** Report: one player firing the Grenade Launcher into a crowd, and 4 players. Expected per shot: `weapon.fired` (existing) + `grenade.launched` ~14 B + `explosion.happened` ~10 B + kills, so ≈ 20–40 B/s per launcher at 0.8 shots/s. Tick p99 with 4 launchers × 150 Walkers (`PERF_ASSERT=1`, load recorded). One blast costs one grid query (≈ 2.4 m radius) plus ≤ 14 box tests per candidate.

### Tests (Vitest)

11. `combat/grenades.test.ts`: landing at the aim point, clamped at 12 m and at `minLobM` 3 m; flight ticks; cover stops the track at the car face (also the bus and map boxes), barriers/sandbags/barricades don't; rounds fly over zombies; 4 rounds then a 3.0 s reload; rate 0.8/s exact over 25 shots; owner leaves mid-flight; pool full → no round and no ammo spent (or document the choice); same seed + input log → same digest.
12. `combat/explosion.test.ts`: overlap edge (inside/outside by 1 mm, every zombie radius, player radius); line of sight behind a car → no hit; zombie 40 / player 20 (shooter and teammate) / buildings 0; downed/out unharmed; god mode; pushback direction and the Brute factor (5.7); upgrade levels I–IV; one hit per body per blast; kill credit and assists (blast kills credit the shooter; an assist from an earlier hit pays per 3.2).
13. Friendly-fire table (5.4's `damage.test.ts`): the explosion row (50 %) runs through a real grenade.
14. Liveness (brief 9): a seeded sim where a player shells a crowd for a wave: ≥ 1 explosion, ≥ N kills with weapon `grenade_launcher`, ≥ 1 self-hit when firing at a car 2 m away; each new test fails under one mutation (M1 cover ignored for the track, M2 cover ignored for the blast, M3 FF 100 %, M4 shooter exempt, M5 blast hits twice, M6 no `minLobM` clamp, M7 explosion event dropped, M8 aim length ignored).
15. Network: `netEvents` round trip for both kinds; NetSimHost: the cosmetic round lands at the server's point and tick; `tools/netsim/grenade.test.ts` under `?lag=150&jitter=20`: the explosion is shown once per server explosion, client HP = server HP after self-hits, no round stuck on screen when the event is dropped; hidden tab across a build start (the pool is cleared at the build start, no ghost blasts); late Game scene start.
16. Fuzz (AC 9).

## Designer decisions to confirm

| # | Decision | Recommended | Numbers / alternative |
|---|---|---|---|
| D1 | Touch aim distance | **Aim-stick deflection past the fire dead zone → 3–12 m**, with the landing ring shown | Alternative: always 12 m (or the first zombie on the aim line). Mouse: cursor distance. |
| D2 | Do rounds lob over cars? | **No**: cars/bus/buildings stop the round at their face (brief line 5) | Alternative: lob over everything (closer to "lobbed", harder to read). |
| D3 | Minimum lob distance | **`minLobM` 3 m** (the blast is 2 m + 0.4 m body, so aiming at your feet doesn't blow you up) | A car 1 m in front still explodes the round there: 20 to you. |
| D4 | Do grenades damage player buildings? | **No** (`buildingDamage` 0) | GDD silent. Alternative: 40 to buildings. |
| D5 | Blast knockback on zombies | **0.6 m** outward (Brute × 0.2 via 5.7) | GDD silent; 0 = no push. |
| D6 | Blast knockback on players | **None** | — |
| D7 | Flight speed | **20 m/s** (12 m = 0.6 s), min 0.25 s | Slower reads better but leads targets less. |
| D8 | Price / stats | **800, 40 dmg, 2 m, 4 rounds, 3.0 s** (GDD) | Balance frozen. |
| D9 | Art pick | One of ~5 Meshy proposals (task T0) | — |

## Beat the rule (reviewers: try each, record the result)

1. **Grenade through/over a car:** aim at a zombie behind a car. Expected: the round explodes at the near face, and the zombie behind the car is safe (blast line of sight). Aim past the car's corner: the track is a straight line, so check the visual marker agrees.
2. **Hide behind a car from your own blast:** expected: safe when the centre-to-centre line crosses the car.
3. **Blast through sandbags/barricades:** expected: it hits (they only stop bodies). Is that readable? Add it to the readability sheet.
4. **Point-blank self-damage:** aim at your own feet. Expected: the round lands at 3 m and you are unharmed (2 m + 0.4 m < 3 m). Aim at a car 1 m away: you take 20. Repeat until downed. Expected: you can down yourself, and the downed rules apply.
5. **Teammate griefing:** shell a teammate. Expected: 20 per blast, at most 0.8 blasts/s, so 16 HP/s worst case. They can down. Logged.
6. **Blasts at spawns:** fire into a spawn point as zombies appear (`waves.spawnMinPlayerDistanceM` 6 m keeps players off). Expected: allowed and fair (a spawn is part of the street). Record kills per blast at a spawn vs in the open, so the designer can decide whether spawn camping is too strong.
7. **Swap to dodge the reload:** as for guns (swap cancels the reload; it restarts when you return with an empty magazine).
8. **Lag:** at `?lag=300`, fire at a Runner. The blast lands where the server's Runner is at the landing tick. Is it seen as fair? Record reversed "visual hits".
9. **Event loss / hidden tab:** drop `explosion.happened`, then sleep the tab across a build start. Expected: no ghost round, and no double explosion on wake.
10. **Chain with Bloaters (5.8):** a blast that kills Bloaters triggers their blasts on the next tick (5.8 owns this). Check the grenade's credit carries over (5.8 D-rule).

## Tasks / Subtasks

- [x] **T0 Art pick first:** *(skipped by instruction: the designer already picked round C in code — GL1 base, GL2/GL3 as III/IV looks, EX1 fireball, EX2 shockwave for the mine; `docs/epic-5-decisions.md` › Round C looks)* ~5 Meshy proposals (`nano-banana-pro`, the 4.11 style line) for (a) the survivor holding the Grenade Launcher (stubby drum launcher), (b) the grenade round in flight (with its shadow), (c) the explosion (flash, fire ball, debris ring, smoke) and its scorch decal on wet asphalt. Publish a private proposal page and **wait for the designer's pick**. Record the picks + prompts in `docs/art/5-5/README.md` (the 4.11 format). Frames: `weapon_launcher_held_a`, `fx_grenade_round_a`, `fx_explosion_a…`, `fx_scorch_a…` in `ATLAS_FX`.
- [x] **T1 Balance + schema (AC 1):** the `launcher` kind in the weapon union, `isLauncher()`, `combat.json › explosion` (+ fx caps), `shop.json`. Tests `balance.test.ts` (refusals: `minLobM ≥ lobRangeM`, pool > 255).
- [x] **T2 Explosion module (AC 5, 12):** `combat/explosion.ts` per the interface contract; `EXPLOSION_KINDS = ["grenade"]` (5.8 appends `bloater`; 5.9's mine moves onto it as `mine`). `SimEvent` `explosion.happened`.
- [x] **T3 Grenade pool + firing (AC 2, 3, 4, 11):** `combat/grenades.ts` (`createGrenadePool`, `launchGrenade`, `updateGrenades`, `clipTrack` via `shotBlockT`); the `firing.ts` launcher branch; `world.grenades` in `core/world.ts`; clear on wipe/Results/build start.
- [x] **T4 Input aim length (AC 4):** `apps/client/src/input/InputRouter.ts` (the mouse distance from `KeyboardMouse.aimAt` before normalising; touch deflection from `TouchSticks.aimVector`), only with the launcher active (the router needs the active weapon kind: pass it in `build()`). Tests `selectSource.test.ts` / `stick.test.ts` rows.
- [x] **T5 Copies (brief 2):** World (`grenades`) → schema (none) → `syncState` (none) → key lists (none) → mirror (`NetSimHost` keeps a cosmetic grenade list from events) → Predictor (none) → devThrottle (none) → `snapshotWorld` (`grenades` pool). `netEvents.ts` 2 kinds.
- [x] **T6 Client (AC 7):** `render/GrenadeView.ts` (pooled rounds, landing marker), `render/ExplosionView.ts` (shared with 5.8 and later mines: flash, ring, particles, scorch pool), `GameScene` event wiring + proximity shake, `localFire.ts` launcher branch, sounds.
- [x] **T7 Tests (AC 11–15):** files as listed; NetSimHost `NetSimHost.grenade.test.ts`; `tools/netsim/grenade.test.ts`.
- [x] **T8 Fuzz (AC 9, 16):** `combat/explosion.fuzz.test.ts` with an independent line-of-sight rewrite.
- [x] **T9 Bandwidth + perf + phone FPS (AC 10):** extend `apps/server/src/run/weaponBandwidth.test.ts` (5.4's) and `tickCostDowntown.test.ts`; `?stress=150` with stress bots firing launchers (explosions every ~0.3 s on screen): headless FPS before/after, load recorded.
- [x] **T10 Readability + browser + gates + merge notes:** add the round, the landing marker and the explosion to the readability sheet. Playwright: solo `?loadout=grenade_launcher,pistol` (mouse distance, car face stop, self-hit at a car), online 2 players under lag.

## Dev Notes

### Current state (read before changing)

- `combat/firing.ts › tryFire`: guns normalise `input.aimX/aimY` (`aimLen`) and spawn into `world.projectiles` (`projectilePool.ts`, which sweeps and hits zombies every tick). A grenade must **not** go into that pool: it would hit zombies in flight. Write a separate small pool with the same SoA/free-list pattern.
- Cover: `combat/cover.ts › shotBlockT(world, x0, y0, x1, y1)` gives the entry t of the first shot blocker (cars, bus, map boxes), and `shotLineClear` gives line of sight. Both are used by the server, `cosmeticProjectiles.ts` (client) and turrets, so the grenade track and the blast must use exactly these.
- `combat/damage.ts › applyZombieDamage(world, id, amount, dirX, dirY, pushbackM, killerId, weapon, buildingId)` clamps pushback to the map. Building push-out happens in the zombie system (3.4). 5.3/5.7 add knockback rules (`knockbackM`; the Brute's 20 % factor): use theirs.
- Inputs: `net/input.ts` zod schema `aimX/aimY ∈ [−1, 1]`, "stick vectors with length ≤ 1". `KeyboardMouse.aimAt` normalises today and `TouchSticks.aimVector` returns a unit vector with `fire` past the dead zone.
- Events: `netEvents.ts` (kinds up to 26 plus rounds A/B and 5.4's 27/28: take the next free numbers at merge time), `EventInterest` (server: turret events are local). Explosions are global (reliable to everyone): they are rare and every player must agree.
- Client: `GameScene` shakes the camera on `weapon.fired` of my own weapon if `screenShake` (line ~871); `FxView` has pooled arcs; `serverClock.ts` maps server ticks to local time.

### Round C interface contract (identical in 5.4, 5.5, 5.8)

- `combat/damage.ts` (owner 5.4): `DAMAGE_TAGS`, `damagePlayerBy(world, target, amount, tag, sourcePlayerId, sourceZombieId = -1)`, `applyZombieDamage(…, opts?: { quiet?: boolean })`.
- `combat/explosion.ts` (owner **5.5**): `EXPLOSION_KINDS` (append only), `ExplosionSpec = { x, y, radiusM, zombieDamage, playerDamage, buildingDamage, pushM, kind, sourcePlayerId, weapon }`, `explode(world, spec): number` (bodies hit). It is cover-checked per body, each body is hit at most once, and it emits one `explosion.happened`. `playerDamage` is the base amount: `damagePlayerBy` applies friendly fire only when `sourcePlayerId` is set (so a Bloater's 30 is not halved).
- `player.damaged` = `{ playerId, amount, sourceZombieId, tag, sourcePlayerId }`.
- `combat.json` (owner 5.4): `friendlyFire`; 5.5 adds `explosion`; 5.8 adds `bloater` fx caps.
- If 5.5 starts before 5.4 lands: build on a stub `damagePlayerBy` with this exact signature and take 5.4's at merge.

### Copies touched (brief 2)

World `grenades` (SoA pool) → `snapshotWorld` (`grenades`) → schema/syncState/key lists/fakeRoom/devThrottle: none → mirror: a cosmetic list in `NetSimHost` fed by events → Predictor: none. Events: `netEvents.ts`.

### Must be preserved

Guns' unit aim (aim assist, spread, 2.12 seq spread). Projectile pool behaviour. The 4.2 cover tests. The economy assist rules. Bullets/melee harmless to players. `SYSTEM_ORDER`. Balance frozen except the new entries.

### Dependencies

- **5.4** (round C): the friendly-fire rule, `damagePlayerBy`, quiet hits, `combat.json`. **Required.**
- **5.1** (round B): `weaponDamage(balance, weapon, level)`. **5.3** (round A): `applyKnockback` (swept, stops at faces; reused by 5.2's axe). **5.7** (round B): the Brute knockback factor (20 %).
- **5.9** (round A): if the mine wrote its own blast, move it onto `explode()` (kind `mine`, its 80 damage / 2.5 m / FF 50 % unchanged) in this story, with a test row.
- **5.8** (round C): uses `explode()` and appends `bloater`; it owns chain explosions.
- **5.12** (later): hand grenades and molotovs will reuse `grenades.ts` (lob) and `explode()`. Keep the API weapon-agnostic.
- **4.2** (cover), **2.7** (local fire clock), **4.11** (burning cues and damage numbers: reuse the "−N" numbers for blast hits).

### Phone FPS plan

One flash `Image` + one ring `Graphics` per explosion (pooled, ≤ 8 live), debris/smoke from a shared particle pool (`fx.maxExplosionParticles` 96), scorch decals pooled (`fx.maxScorchDecals` 16, the oldest is reused), rounds pooled (≤ `maxLiveRounds`). Everything is atlased in `ATLAS_FX`. Measure `?stress=150` with explosions on screen.

### Notes for the merge

- `combat/explosion.ts`, `combat/grenades.ts`: new.
- `combat/firing.ts`: a `launcher` branch in `tryFire`.
- `config/balanceSchema.ts`: the weapon union gains `launcher`, plus a `combat.explosion` block.
- `core/world.ts`: `grenades` (every hand-written World literal in tests may need it, or build through `createWorld`).
- `core/simEvents.ts`: `grenade.launched`, `explosion.happened`. `net/netEvents.ts`: 2 kinds.
- Client: `input/InputRouter.ts` (aim length for the launcher only), new views, `GameScene` wiring.

### References

- `planning-artifacts/epics.md` › Epic 5, Story 5.5; FR13, FR14, FR18.
- GDD › Weapons table (Grenade Launcher row: "also hurts the shooter at 50 %"), Aiming ("grenades lobbed"), Friendly fire line, Feel (screen shake).
- Architecture › Networking ("projectiles are not entities… events: deaths, explosions…"), Entity Patterns (pools).
- Story files 4.2, 2.7, 2.12, 4.8 (fairness model), 5.4 (this round), `docs/art/4-11/README.md`.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), `gds-dev-story`, worktree `.claude/worktrees/story-5-5` (branch `story-5-5`), ports client 5557 / server 4557 (no game server was needed: online was checked headless through the netsim harness).

### Debug Log References

- Gate (load avg 7.5 at the end, shared box with other builders): `npm run typecheck && npm run lint && npm test && npm run build` green — 238 files / 1879 tests passed (3 skipped), build ok. `uptime`: 18:12:46 up 3:07, load average 7.54, 7.43, 6.17. Then +2 balance refusal tests (26/26 in `balance.test.ts`), typecheck/lint re-run green.
- One full-suite run under load 9+ had `spitBandwidth.test.ts` time out; it passes alone and passed in the gate (load-related, pre-existing test).
- Bandwidth (`weaponBandwidth.test.ts`, 150-zombie crowd, 30 s, per client, no interest filter): 1 launcher 0.63 shots/s, `weapon.fired` 7 B/s + `grenade.launched`/`explosion.happened` 19 B/s = **25.5 B/s per launcher** (estimate 20–40), zombie.hit 0 B/s (quiet blast hits); all events 353 B/s incl. ~17 kills/s. 4 launchers: 102 B/s for fire+lob, 1,044 B/s all events (kills dominate). Far under 30 KB/s.
- Tick cost (`tickCostDowntown.test.ts`, `PERF_ASSERT=1`, 4 launchers × 150 Walkers on Downtown, load 0.29): Pistols p99 0.654 ms, Grenade Launchers p99 0.553 ms → added p99 −0.10 ms (within noise; ≤ 2 ms budget).
- Headless FPS `?stress=150` (844×390 DPR 2, 20 s each, load 8.9–10.3 — other builders running; numbers are noise-dominated): before (Pistol) 4.6 / 7.1 fps; after (`?stressfire=1&loadout=grenade_launcher`, blasts on screen, max 80 live particles ≤ the 96 cap) 5.7 / 6.5 fps. No measurable loss; the 4.10 phone numbers were not re-measured (no phone here).
- Six-wave bot sim (2 and 4 bots, test-only list with the launcher, start money 800): every run ended (3 wiped in W3, one 4p run held out 6 waves); 779 blasts, 54 player hits, **self damage 216, friendly damage 846** (bots fire at the nearest zombie regardless of teammates: logged, not difficulty evidence).
- Fuzz (`explosion.fuzz.test.ts`): A) 24 Downtown layouts × stages 1–3 × 25 blasts (face 116, shadow 134, spawn 121, barricade 111, open 118): 2,824 bodies checked "must hit" and 3,290 "must not" against an independent 2 mm-sampled LOS (30 ambiguous within tolerance), 1,061 bodies in range behind cover, 323 lob tracks (141 stopped by cover) — all pass. B) 8 layouts × 1,200 ticks, 3 launcher players, real waves: 726 rounds, 723 blasts, 338 GL kills; no body in a box after combat or the zombie pass, zombies reach players in every tough layout, 0 stray nav rebuilds.
- Mutation testing (each mutation run against the 5 new test files): M1 track ignores cover — killed (grenades, explosion liveness, fuzz, netsim); M2 blast ignores cover — killed (explosion, fuzz); M3 FF 100 % — killed (explosion, netsim); M4 shooter exempt — killed (explosion, fuzz, netsim); M5 blast hits twice — killed (explosion, fuzz); M6 no minLobM clamp — killed (grenades, fuzz); M7 explosion event dropped — killed (grenades, explosion, netsim); M8 aim length ignored — killed (grenades, explosion, netsim). Also: the M8 guard "other weapons keep unit aim" is a row in `lobAim.test.ts`.
- Browser (Playwright headless Chromium, solo dev build `?loadout=grenade_launcher,pistol`, script in the session scratchpad, written with the Write tool): mouse distance → landing ring at the aim point (cursor 8.4 m from the centre → ring at 7.9 m from the muzzle); car `street_car_west`: ring pulled back to its face − 0.05 m and amber, round burst there, **self-hit 600 → 580 (20)** at 2 m; EX1 fireball; a Walker on a mine → EX2 shockwave; explosions counted once per burst; no page errors. Screenshots `docs/art/epic-5/round-c/ingame/5-5-*.png` (landing ring, round in flight, fireball ×2, car-face ring + blast, mine shockwave ×2). The flash lasts 0.1 s and headless runs at ~5–10 fps, so the blast/flight pictures were frame-stepped: the loop sleeps, the view replays the burst at its own point and steps 60 fps to the shown age (the in-flight picture stretches the cosmetic flight round the clock); the code paths are the game's.

### Completion Notes List

- **Sim (shared, engine-free):** new weapon kind `launcher` (`balanceSchema.ts`, refines: minLob < range, rangeM = lobRangeM, flight ≤ 255 ticks, spread 0) and `weapons.json › grenade_launcher` (GDD numbers, price 800), in the fixed shop list. New `combat.json` (`friendlyFire` 50 %/canDown — 5.4's block, built here as the contract stub — and `explosion`: pool 32, face backoff 0.05 m, fx caps). `hasMagazine()`/`isLauncher()`: the gun ammo/reload rules now cover launchers (firing, swap reload, loadout, client fire clock, HUD).
- `combat/grenades.ts`: SoA pool `world.grenades`, `lobTarget` (FR-A clamp 3–12 m from the muzzle via the aim length; FR-B track from the body centre, stopped at the first shot blocker minus the backoff — shared by sim, client marker, own-shot copy, bots), `launchGrenade` (full pool → nothing spent, documented), `updateGrenades` (bursts at `landTick` after the projectiles; a round of a player who left bursts with no credit and the FF share applied). Cleared at build start and Results. `grenade.launched` + `explosion.happened` events only (no schema state).
- `combat/explosion.ts` (5.9's `explode()` extended, not duplicated): spec API (`ExplosionSpec` per the round C contract + `buildingId`, `quiet`, `grenadeId`), `EXPLOSION_KINDS = ["grenade", "mine"]`, cover-checked overlap per body, one hit per body (own scratch buffer kept), players through `damagePlayerBy(tag "explosion")`, swept 0.6 m push via 5.3's `applyKnockback` (Brute 20 %), optional building damage (for 5.8), one `explosion.happened`, counters (incl. self/friendly damage). The 5.9 mine now calls it with kind `mine` (80 damage, players 40 through the FF rule; a balance cross-check ties `mine.playerShare` to `friendlyFire.pct`); all 5.9 mine tests pass unchanged except the one direct `explode` call moved to the spec API.
- `combat/damage.ts`: `DAMAGE_TAGS` + `damagePlayerBy` **stub with 5.4's exact signature** (take 5.4's at merge).
- Network: kinds 35 `GRENADE_LAUNCHED` `[k, slot, id, x, y, tx, ty, flightTicks]`, 36 `EXPLOSION_HAPPENED` `[k, kind, x, y, r, srcSlot, grenadeId]` (launch tuple + seq at index 8 since the review); the decoder rebuilds the absolute landing tick from the flush tick (`NetEventContext.tick`). Explosions are global events (not interest-filtered).
- Client: aim length for the launcher only (`input/lobAim.ts`; mouse = cursor distance from the muzzle, touch D1 = deflection past the fire dead zone → 3–12 m); `GrenadeView` (pooled rounds on the 1.5 m arc with shadow, the landing ring at the exact blast radius from `lobTarget`, amber when cover stops it); `grenadeFx.ts` (pure: `GrenadeFlights` — own instant copy adopted/snapped by the server echo, hidden by its explosion or `lostEventTicks` after landing, cleared at build start; `BlastParticles` ring pool capped at 96; `Explosions` + scorch pool 16); `ExplosionView` (EX1 fireball and EX2 shockwave+debris from round C, flash/glow/edge ring at the exact radius, scorch fading by the build start); `blastFxAtlas.ts` registered through `addGeneratedTexture`. The 5.9 mine's old tween blast in `FxView` is replaced by EX2 from `explosion.happened`; every blast shakes within `fx.shakeWithinM` (settings toggle) and plays `fx_explosion` / `building_mine_blast`; `weapon_grenade_launch` sound. NetSimHost: own launch instant (2.7), `ageS` on new events (woken tab: no stale blast), predicted ammo for launchers. GL1 held + icon, GL2 icon at level III, GL3 at IV (`WEAPON_TOP_TIER_ICON`).
- Bots: `botPolicy`/`botClient` lob to the target's distance. `?stressfire` with the launcher lobs at the nearest zombie and keeps its crowd.
- Readability sheet: entries 30–33 (after 5.8’s 27–29) (round + ring, the amber ring at a car, EX1, EX2).

#### Beat the rule (builder attempts)

1. Grenade through/over a car — the track stops at the near face (tests + browser: ring and blast at face − 0.05 m); a zombie behind the car is safe (FR-C test, fuzz).
2. Hiding behind a car from your own blast — safe when the centre line crosses it (explosion test "car shields player").
3. Blast through sandbags/barricades — hits (tests); readability sheet line 32 says so.
4. Point-blank self-damage — aiming at your feet lands 3 m out (2 m + 0.4 m < 3 m + muzzle: unharmed); a car 2 m away: 20 each time (liveness sim, netsim, browser); repeated → downed (test "a blast can down a player").
5. Teammate griefing — 20 per blast, ≤ 0.8/s (16 HP/s); logged in the bot sim (friendly 846 over 4 runs).
6. Spawn camping — allowed (fuzz includes blast points on spawn jitter segments; no special rule). Kills per blast at spawns vs open not separately measured (left for the designer's playtest).
7. Swap to dodge the reload — gun rules unchanged (swap cancels the reload; it restarts on return with an empty magazine): same code path (`hasMagazine`).
8. Lag — no rewind for blasts (FR-F); netsim at 150 ms: the blast is drawn at the server's point once, HP = server HP. "Reversed visual hits" against Runners at 300 ms not measured.
9. Event loss / hidden tab — netsim + NetSimHost tests: dropped explosions leave no round on screen; a tab asleep across a build start wakes with no round and no blast.
10. Bloater chains — 5.8's; `explosion.happened` carries the source and `explode` takes a `sourcePlayerId` for the credit hand-down.

#### Notes for the merge (shared files)

- `packages/shared/src/combat/damage.ts`: **take 5.4's** `DAMAGE_TAGS` / `damagePlayerBy` (my stub has the same signature; it emits `player.damaged` without `tag`/`sourcePlayerId` and maps tag explosion → `sourceZombieId` −2). 5.4's quiet `applyZombieDamage(…, { quiet })` can replace my use of `applyZombieDamageQuiet` in `explode`.
- `packages/shared/src/config/balance/combat.json`, `balanceSchema.ts › combatSchema`, `balance.ts` (loader + BUNDLED): **keep 5.5's** (on the work branch since the 5.8 merge); 5.4 merges its `friendlyFire` (same shape) and fx caps INTO it later, not a second file/loader. The cross-check "mine.playerShare = friendlyFire.pct / 100" is mine. Every hand-built balance object in tests needs `combat` (I added it to 7 test files).
- `balanceSchema.ts`: the weapon union gains `launcher` (5.4 adds `flame`): keep both. `combat/weapons.ts`: `hasMagazine` must also include 5.4's fuel weapon if it reloads like a gun.
- `net/netEvents.ts`: 33/34 are 5.8's (Bloater swell/burst), 35/36 are mine (renumbered at the 5.8 merge); 5.4 takes the next free (37+).
- `core/simEvents.ts`: `grenade.launched`, `explosion.happened` (5.8 adds its own; `EXPLOSION_KINDS` append-only: 5.8 appends `bloater` after `mine`).
- `combat/explosion.ts`: ONE API, `explode(world, spec)`. The 5.8 merge folded 5.8's trailing `BlastExtra` (building damage, push) into the spec (wall buildings only, 5.8's rule) and moved the Bloater call and its tests onto it: kind `bloater`, `friendlyFire: false` (full 30 to every player even when a player popped it, designer decision; the popper keeps the credit via `sourcePlayerId`), `announce: false` (its own `bloater.burst` is the visual). Grenades and mines keep `friendlyFire: true` (halved). Tests for both cases in `explosion.test.ts`.
- `combat/firing.ts`: launcher branch before aim assist; `hasMagazine` in swap/reload. `core/world.ts`: `grenades`. `core/worldSnapshot.ts`: `grenades`. `run/runStateMachine.ts`: `clearGrenades` at build start and Results. `index.ts`: new exports.
- `bots/botPolicy.ts` (`BotSelf` gains `lobRangeM`, `minLobM`, `muzzleM`), `tools/bots/botClient.ts`.
- Client: `scenes/GameScene.ts` (views, marker, router lob arg, explosion shake/sound replacing the mine shake), `sim/NetSimHost.ts` (own launch, `ageS`, ctx tick, launcher ammo), `render/FxView.ts` (mine blast removed), `render/city/weaponArt.ts` (GL1–3, `WEAPON_TOP_TIER_ICON`; 5.4 adds flamethrower art to `WEAPON_ART`), `render/weaponLook.ts`, `audio/placeholderSfx.ts`, `input/InputRouter.ts` + `TouchSticks.ts` (`deflection`), `net/localFire.ts`, `debug/stressScenario.ts`.
- Server tests: `weaponBandwidth.test.ts` (measure gained a `firing` count and lob bytes), `tickCostDowntown.test.ts`.

#### Not verified

- No real phone; headless FPS on a loaded box (load 9–10) is noise-dominated; the 4.10 phone floor was not re-measured.
- Online with 2 real browser clients under `?lag=150&jitter=20` and a real game server was **not** run; online behaviour is covered by the netsim harness (real server controller + real wire codec) and the NetSimHost tests (fake room). Touch aim distance (D1) is unit-tested only (no touch device).
- Late Game scene start tested in the netsim harness only; reversed "visual hits" at `?lag=300` and spawn-camping kill rates not measured.
- Sounds are placeholders (synthesized) and not listened to.
- Meshy art step skipped by instruction; GL2/GL3 icons only (held art is GL1 at every level).

### File List

New:
- `packages/shared/src/combat/grenades.ts`, `grenades.test.ts`, `explosion.test.ts`, `explosion.fuzz.test.ts`
- `packages/shared/src/config/balance/combat.json`
- `apps/client/src/input/lobAim.ts`, `lobAim.test.ts`
- `apps/client/src/render/grenadeFx.ts`, `grenadeFx.test.ts`, `GrenadeView.ts`, `ExplosionView.ts`, `render/city/blastFxAtlas.ts`
- `apps/client/src/sim/NetSimHost.grenade.test.ts`
- `tools/netsim/grenade.test.ts`
- `docs/art/epic-5/round-c/ingame/5-5-landing-ring.png`, `5-5-round-in-flight.png`, `5-5-fireball.png`, `5-5-fireball-late.png`, `5-5-car-face-ring.png`, `5-5-car-face-blast.png`, `5-5-mine-shockwave.png`, `5-5-mine-shockwave-late.png`
- `docs/playtests/milestone-1/objects/31_grenade_round.png`, `32_landing_ring_car.png`, `33_explosion_fireball.png`, `34_explosion_shockwave.png`

Modified:
- `packages/shared/src/combat/explosion.ts`, `damage.ts`, `firing.ts`, `loadout.ts`, `weapons.ts`
- `packages/shared/src/buildings/mine.ts`, `mine.test.ts`
- `packages/shared/src/config/balanceSchema.ts`, `balance.ts`, `balance.test.ts`, `balance/weapons.json`, `balance/shop.json`
- `packages/shared/src/core/simEvents.ts`, `world.ts`, `worldSnapshot.ts`
- `packages/shared/src/net/netEvents.ts`, `netEvents.test.ts`
- `packages/shared/src/run/runStateMachine.ts`, `bots/botPolicy.ts`, `index.ts`
- `packages/shared/src/economy/fiveWaveSim.test.ts`, `economy/shop.test.ts`, `combat/aimAssist.test.ts`, `combat/firing.test.ts`, `combat/melee.test.ts`, `combat/swap.test.ts`, `waves/spawnPoints.test.ts`, `waves/waveDirector.test.ts`, `zombies/zombieAi.test.ts`
- `apps/client/src/scenes/GameScene.ts`, `sim/NetSimHost.ts`, `net/localFire.ts`, `input/InputRouter.ts`, `input/TouchSticks.ts`, `input/TouchSticks.test.ts`, `render/FxView.ts`, `render/mineBlast.ts`, `render/weaponLook.ts`, `render/city/weaponArt.ts`, `render/city/atlasLayout.test.ts`, `audio/placeholderSfx.ts`, `debug/stressScenario.ts`, `ui/shopStore.test.ts`
- `apps/server/src/run/weaponBandwidth.test.ts`, `tickCostDowntown.test.ts`
- `tools/bots/botClient.ts`
- `docs/playtests/milestone-1/readability-sheet.md`, `readability-key.md`
- `_bmad-output/implementation-artifacts/5-5-grenade-launcher.md`

### Review fixes (2026-11-23)

Merged the work branch at `3cfb501` first (5.4 flamethrowers with its `damagePlayerBy` and the merged `combat.json`; 5.8's queue fix). Flame code untouched.

- **M1 `explode()` re-entrant:** every call captures its spec into locals at entry; the zombie and building target buffers are stacks (each call takes the slice after its caller's: `targetTop` / `buildingTop`, restored in `finally`); the player pass reads a preallocated frame per depth (`MAX_BLAST_DEPTH` 8, deeper throws); a target killed by a nested blast is skipped by the outer one (its hit was the nested blast's); `blastResult` is written at the end (the outermost when nested). Test: a nested blast run mid-pass with the outer's own spec object refilled (other centre, other credit) — 8 + 5 tanky Walkers each hit exactly once, `zombie.hit` credits p0 / p1, each player damaged once by its own blast, both explosion events with their own centre and credit.
- **L1 own round timing / echo matching:** `grenade.launched` carries the shot's 16-bit input seq (wire index 8); `GrenadeFlights` adopts only the local copy with the same seq (an orphan copy of a shot the server never fired times out instead of stealing the next echo) and re-times its landing to `echo start + flightTicks` in render time — the moment the explosion event is drawn — so it no longer lies on the ground ~0.34 s at `?lag=150` or vanishes at ~300 ms RTT. (This is the render-tick clock the explosion uses, equivalent to mapping the server `landTick` through the client's clock.) Tests for both.
- **L2:** ownerless blasts (a round whose owner left) use the quiet path too (5.4's `applyZombieDamageQuiet` takes a null killer). Test.
- Coordinator additions: the dead `damagePlayerByExplosion` is deleted (and its export): `damagePlayerBy` is the only player-damage entry point. The self / friendly damage counters now count only blasts where friendly fire applies (a Bloater popped by a player, `friendlyFire: false`, is neither); test rows for both cases (mutation "count by source" killed).
- Mutation check of the new tests: R1 shared target slice, R2 spec read live (credit), R3 player pass on the wrong frame, L2 loud ownerless hits, L1a echo ignores seq, L1b landing not re-timed — all killed.

### Change Log

- 2026-11-23: Review fixes M1, L1, L2 (see "Review fixes (2026-11-23)"), after merging the work branch at 3cfb501.

- 2026-11-23: Merged the work branch with Story 5.8 (Bloaters): one `explode(world, spec)` API (5.8's options folded in; `friendlyFire` and `announce` spec fields), my events renumbered to 35/36 after 5.8's 33/34, readability entries renumbered 30–33; gate re-run green.

- 2026-11-23: Story 5.5 built (Grenade Launcher: launcher weapon kind, lobbed round pool, shared cover-checked `explode()` with the 5.9 mine moved onto it, events 33/34, client rounds/landing ring/EX1+EX2 explosions, bots, tests incl. fuzz/netsim/mutations). Status → review.
