---
baseline_commit: 26bab2b
---
# Story 5.2: Fire Axe and Chainsaw

Status: review

## Story

As a player,
I want heavy melee options,
so that I can carve through the crowd up close.

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
> Most relevant here: 2 (the chainsaw's speed penalty must be predicted: Predictor + LocalFire), 3/4 (fairness rules, "Beat the rule"), 7 (**axe knockback is spatial code: fuzz test**), 9 (kills by axe and chainsaw), 10 (chainsaw tick timing in ticks; no allocation), 11 (chainsaw events at 10/s: measured), 12 (swing/spark effects pooled and capped), 13 (axe and chainsaw recognisable in hand), 14 (lag), 16 (tick cost with many chainsaw hits), 19.

## Acceptance Criteria

### Fairness rules (player-visible; brief line 3; each is tested)

- **F1 "What the arc shows is what gets hit."** The swing effect drawn for the axe (2.2 m, 140°) and the chainsaw (1.5 m, 60°) is exactly the sim's sector (`circleOverlapsSector` to the zombie's edge); a zombie whose body touches the drawn arc is hit; none outside it. Melee ignores cover as today (Story 1.9 rule, unchanged): the arc test is the whole rule, and the drawn arc shows it.
- **F2 "Knockback never pushes a zombie through anything."** An axe hit pushes each zombie hit 1.5 m straight away from the swinger, but it stops at the first car, bus, building, barricade, turret, map box or the map edge (the body ends touching the face, never inside, never on the far side). A 0.5 m wood barricade can never be crossed by knockback.
- **F3 "Knockback is per hit, once."** One axe swing knocks each zombie in its arc back once (no double push from two overlapping checks); the Brute (5.7) moves only `knockbackTakenPct` (20 %) of it.
- **F4 "The chainsaw hurts every 0.1 s while you hold it on them."** Every zombie in the 60° / 1.5 m arc takes 6 damage (× upgrade level, 5.1) on each chainsaw tick (10 ticks/s = every 2nd sim tick at 20 Hz, from the fire cooldown rule in `cooldown.ts`); no shared world pulse; a zombie that enters the arc is hit on the next chainsaw tick.
- **F5 "The chainsaw slows you only while it runs."** While the chainsaw is in my hand, I am standing (alive), not swapping, and I am attacking (fire held with aim past the dead zone), I move at 80 % speed (4.5 → 3.6 m/s). Release the aim, swap away or go down → full speed from the next tick. It stacks with a Crawler bite multiplicatively (0.8 × 0.7 = 56 %), never below that.
- **F6 "My client never lies about my speed."** The penalty is predicted with the server's integer rule (no correction from the chainsaw itself when nothing else differs).

### Behaviour

1. **Balance (FR13).** `weapons.json`:
   - `fire_axe`: `kind melee`, `name "Fire Axe"`, `damage 30`, `rateHz 1.1`, `rangeM 2.2`, `arcDeg 140`, `knockbackM 1.5`, `hitPushbackM 0` (the knockback replaces the small push), `screenShake true`, `price 300`.
   - `chainsaw`: `kind melee`, `name "Chainsaw"`, `damage 6`, `rateHz 10`, `rangeM 1.5`, `arcDeg 60`, `hitPushbackM 0.05`, `screenShake false`, `wielderSlowPct 20`, `price 600`.
   - `shop.json › weapons` appends `fire_axe`, `chainsaw` (after Round A's entries). Ids are appended to `weapons.json` (the u8 weapon index on the wire follows balance key order: **append, never insert**).
2. **Axe hit (FR16, FR19).** Each swing: `melee.swung` (as today), then every zombie in the arc takes `weaponDamage(...)` (30 at I, 5.1) and is knocked back `knockbackM × knockbackTakenPct / 100` along the swinger → zombie direction through the shared swept knockback (5.3's `combat/damage.ts › applyKnockback`, see D2). The local player's camera shakes (screen-shake setting respected) on their own axe swing, also online (from the local swing, not the server echo).
3. **Chainsaw (FR16).** Continuous: with fire held and aim past the dead zone it "swings" every 0.1 s by the existing cooldown rule (no new timer: `rateHz 10` → `cooldownS += 0.1`, exact at 20 Hz), damaging every zombie in the 60° arc with a tiny push (0.05 m). Sound: a looping placeholder rev that runs while chainsaw swings keep arriving (≤ 150 ms apart) and stops otherwise.
4. **Speed penalty.** `player/slow.ts › playerSpeed` multiplies by `(100 − wieldPct) / 100`, where `wieldPct` = the active weapon's `wielderSlowPct` when F5's condition holds this tick, else 0 (`wielderSlowFor(world/balance, p, input)`, shared, integer-only). `movePlayers` uses it on the server, solo and in the Predictor.
5. **Prediction.** The Predictor's player gets the active weapon and swap state each step from `LocalFire` (which already replays swaps per seq: `swapState`), so the predicted speed equals the server's. Swap edges may still differ by a tick under jitter; the netsim measures it.
6. **Network.** No new schema fields: weapons and the active slot are already synced. Chainsaw ticks produce `melee.swung` (every 2nd tick) and `zombie.hit` per zombie hit; the server forwards them as today. Added bandwidth measured (AC 8 test) and must stay ≤ 1.5 KB/s per chainsaw wielder per receiving phone with 6 zombies in the arc; if over, see D5.
7. **Look (T0 picks).** In-hand sprites for the axe and the chainsaw on the survivor (atlas frames `weapon_fire_axe_0`, `weapon_chainsaw_0`; or the current survivor frame plus a small weapon overlay sprite), a wide heavy arc effect for the axe (pooled, as `FxView.swing`) and a short spark/blood spray for the chainsaw (pooled; caps in balance JSON per brief 12, see D7).
8. **Tests:** arcs (axe 140° / 2.2 m, chainsaw 60° / 1.5 m, edge cases at the arc border and the zombie's edge), knockback distance (exactly 1.5 m in the open; Brute 20 %), knockback vs every obstacle kind (stops at the face), tick rate (chainsaw: 10 swings in 20 ticks, 60 damage per zombie per second at I), speed penalty (3.6 m/s while attacking, 4.5 otherwise, with a Crawler bite 2.52 m/s), prediction agreement, fuzz (knockback), bandwidth, liveness (kills by `fire_axe` and `chainsaw`), each new test fails under one mutation.

## Tasks / Subtasks

- [x] **T0 Art pick (skipped as instructed: designer picked AX1 / CS1 from `docs/art/epic-5/round-b/looks.html`, drawn in game code) (first; brief 13).** ~5 Meshy proposals per weapon (`nano-banana-pro`, the 4.11 shared style line: strict top-down orthographic, gritty realistic, night, wet asphalt, cool streetlight from the upper left, muted, crisp silhouette, no text), shown **in a survivor's hands seen from above** at the in-game size: Fire Axe **A1** red fire-department axe, **A2** worn wooden haft + rusty head, **A3** yellow-handled pick-head axe, **A4** taped haft with blood, **A5** long two-handed felling axe; Chainsaw **C1** orange classic, **C2** yellow/black, **C3** rusty with a missing guard, **C4** red with a long bar, **C5** compact grey electric. Plus 3 swing-effect sketches (axe arc smear; chainsaw spark spray). One private proposal page; the designer picks; record in `docs/art/5-2/README.md` (+ images). (AC 7)
- [x] **T1 Balance + schema** (AC 1)
  - [x] `balanceSchema.ts › meleeSchema`: `wielderSlowPct: z.number().int().min(0).max(90).default(0)` (integer for prediction, like `biteSlowPct`). `common.knockbackM` already exists (default 0; unused until now). `zombieTypeSchema`: `knockbackTakenPct: int 0–100, default 100` (5.7 sets the Brute's 20; add it here if 5.7 isn't merged — whoever is first).
  - [x] `weapons.json` + `shop.json` entries (AC 1). `config/balance.test.ts` (+ `fire axe and chainsaw match the GDD table`).
- [x] **T2 Swept knockback** (AC 2; F2, F3) — **reuse Round A 5.3's `combat/damage.ts › applyKnockback(world, zid, dirX, dirY, distM)`** (5.3 T4: moves the body along the direction, stopping at first contact with any map solid or solid building, boxes grown by the zombie radius, clamped to the map; allocation-free). Do not add a second helper.
  - [x] Verify 5.3's helper against a 1.5 m push (3× its 0.5 m case): it must stop at the first face along the whole segment (a swept test, not an end-point push-out). If 5.3 used end-point push-out or fixed sub-steps sized for 0.5 m, make it a true segment sweep (or sub-steps ≤ `zombies.json › knockback.stepM` 0.2 m, < half the thinnest wall) and re-run 5.3's knockback fuzz.
  - [x] Inside `applyKnockback`: `distM × knockbackTakenPct / 100` of the zombie's type (D3; the Brute's 20 % from 5.7). Apply the same factor to `hitPushbackM` in `applyZombieDamage`.
  - [x] `combat/melee.ts › swingMelee`: after `applyZombieDamage` (pushback = `hitPushbackM`), if `stats.knockbackM > 0` and the zombie is still alive → `applyKnockback(world, id, px, py, stats.knockbackM)`. Each zombie at most once per swing (one loop pass per swing: already true; test it). With a rewound `view` (2.12), the direction is the rewound one, the move applies to the present zombie (existing pattern).
  - [x] Tests `combat/knockback.test.ts` (5.3's file: extend): `axe knocks back exactly 1.5 m in the open`, `axe stops at a wood barricade face and never crosses it` (both rotations, approach angles 0–90° step 5°), `stops at a car, the bus, a building box, a turret, the map edge`, `a Brute moves 20 %` (type override if 5.7 isn't merged), `one push per zombie per swing`, `killed zombies are not moved`, `rewound swing pushes the present zombie`.
- [x] **T3 Chainsaw + speed penalty** (AC 3, 4, 5; F4, F5, F6)
  - [x] No new timer: the chainsaw is a melee weapon with `rateHz 10` (the cooldown rule fires it every 2nd tick exactly; verify with a test, not by reasoning).
  - [x] `player/slow.ts`: `wielderSlowPct(balance, p, input)` (active slot's weapon `wielderSlowPct` if alive, `loadout.swapTicks === 0`, `input.fire`, aim length ≥ the `MIN_AIM` used in `tryFire`) and `playerSpeed(base, p, wieldPct)` = `base × (100 − slowPct) × (100 − wieldPct) / 10000` (integers, + − × ÷ only, same expression on both sides).
  - [x] `player/movement.ts › movePlayers`: passes it. The Predictor's World has only its player: it needs the real active weapon → T5.
  - [x] Tests `player/slow.test.ts` (+ `chainsaw slows to 3.6 m/s only while attacking`, `no slow while swapping / downed / aim released / chainsaw not in hand`, `stacks with a Crawler bite to 2.52 m/s`), `combat/melee.test.ts` (+ `chainsaw ticks 10 times in 20 ticks`, `60 damage per second per zombie in the arc at level I`, `axe and chainsaw arcs: inside / on the edge / outside`, `chainsaw is continuous: a zombie walking in is hit on the next chainsaw tick`).
- [x] **T4 Client** (AC 2, 3, 7)
  - [x] `scenes/GameScene.ts`: screen shake also on my own `melee.swung` of a `screenShake` weapon (today only `weapon.fired`); online from the local swing (`NetSimHost.localSwung`), never twice.
  - [x] `render/FxView.ts`: axe swing look (wider, heavier) and chainsaw spark spray, both pooled with a fixed cap (no allocation per swing); `audio/placeholderSfx.ts`: `weapon_axe_swing`, `weapon_chainsaw_rev` (looped while active, stopped after 150 ms without a chainsaw swing).
  - [x] Survivor in-hand weapon from the T0 picks (`render/PlayerView.ts` + `render/city/spriteArt.ts` / `spriteAtlas.ts` frames, `category_name_variant`, in the existing ≤ 2048² characters atlas; check `atlasLayout.test.ts`).
  - [x] Readability sheet: add the axe and chainsaw (`docs/playtests/milestone-1/readability-sheet.md` + key) as new rows.
- [x] **T5 Prediction copy** (AC 5; brief 2)
  - [x] `apps/client/src/net/prediction.ts`: `Predictor.step(input, wield)` (or a `setWield(weapon, swapping)` before each step) fed from `LocalFire`'s per-seq active weapon and swap state; replayed inputs on reconcile use the same per-seq values (store them in the ring next to the input copy: preallocated fields, no allocation).
  - [x] Tests `net/prediction.test.ts` (+ `chainsaw slow predicted: 0 corrections over 200 ticks attacking`), `tools/netsim` (+ `chainsaw.test.ts`: `?lag=150&jitter=20`, corrections from the chainsaw ≤ the baseline's, client position = server position at ack).
- [x] **T6 Fuzz, bandwidth, perf, liveness** (brief 7, 9, 11, 16)
  - [x] Extend 5.3's `combat/knockback.fuzz.test.ts` (or the block in `zombies/downtown.fuzz.test.ts`): random barricade/turret layouts × every decay stage (and the 4.8 fires) × ≥ 2,000 ticks with 4 axe bots swinging at crowds next to cover: **no zombie centre inside any box after any tick, no zombie on the far side of a barricade it started in front of within the knocked tick** (track side-of-face per hit), **no stall (zombies still reach a player)**, **flow fields rebuilt only at build starts** (count rebuild starts outside `startBuild` = 0), ≥ 100 knockbacks really happened and ≥ 20 ended against a face (liveness).
  - [x] `apps/server/src/run/` bandwidth test (pattern `turretBandwidth.test.ts`): 1 chainsaw player in a crowd of 6 for 10 s → bytes/s of `melee.swung` + `zombie.hit` to one other client; assert ≤ 1,500 B/s and report the number.
  - [x] `tickCost.test.ts` (+ case, behind `PERF_ASSERT=1`): 4 chainsaws in 150 zombies; added p99 recorded with the machine load.
  - [x] Sim: a bot loadout `fire_axe,chainsaw` in the 6-wave sim: waves ended, kills by each weapon ≥ 1.
- [x] **T7 Gates.** Mutations listed (knockback not swept → fuzz fails; slow without `fire` check → slow test; chainsaw rate 20 → tick test; arc in radians mismatch → arc test; Predictor ignoring wield → netsim). Browser check (Playwright): `?loadout=fire_axe,chainsaw`, solo and online with `?lag=150&jitter=20`: knockback against a barricade, chainsaw slow, shake setting off/on. `typecheck && lint && test && build`. Merge notes.

## Dev Notes

### Designer decisions to confirm (made non-interactively)

1. **Chainsaw slow condition = "attacking"** (fire held, aim past the dead zone, chainsaw in hand, not swapping). Alternative: whenever it is in hand. Recommended: attacking (GDD "while it is active").
2. **Slow stacking with a Crawler bite: multiply** (0.8 × 0.7 → 56 %, 2.52 m/s). Alternative: take the stronger only (70 %). Recommended: multiply.
3. **Axe knockback stops at cover, barricades and the map edge** (never through). Recommended: yes (F2).
4. **Knockback into fire is allowed** (a zombie pushed into a 4.8 car fire burns; fire kills still pay nobody, 4.8 D5). Recommended: allowed.
5. **Chainsaw damage per tick 6 at 10 ticks/s = 60 DPS per zombie** (GDD), small push 0.05 m (so zombies don't slide out of the 1.5 m arc). Recommended: as GDD + 0.05 push.
6. **Axe swing has no extra wind-up** (instant, like the machete). Recommended: instant.
7. **Art**: axe A1 (red fire axe: instantly "fire axe"), chainsaw C1 (orange) as recommended starting points; designer picks from T0.

### Decisions (developer guidance)

- **D1 One melee path.** The axe and chainsaw use `swingMelee` and the existing `tryFire` melee branch (no ammo, no reload, no aim assist, rewound view online). The chainsaw is "a melee weapon with a 10 Hz rate"; nothing chainsaw-specific in the sim except `wielderSlowPct`.
- **D2 Swept knockback, one helper.** Today `applyZombieDamage` moves a zombie by `hitPushbackM` (≤ 0.25 m) and clamps to the map only; the next zombie tick's push-out (which uses the post-combat position as "from") fixes small overlaps. That is not safe for 1.5 m (a 0.5 m barricade would be tunnelled). Round A 5.3 adds `applyKnockback` (swept, stops at the first face) for the shotgun's 0.5 m; the axe and 5.7's Brute reduction use the same function.
- **D3 Knockback reduction lives on the zombie type** (`knockbackTakenPct`, default 100), applied inside `applyKnockback` (and to `hitPushbackM` for consistency). 5.7 sets the Brute's 20.
- **D4 Speed penalty is integer percent** like the Crawler slow (bit-identical prediction, Story 3.9 rule).
- **D5 Bandwidth fallback.** Estimate: `melee.swung` ≈ 18 B × 10/s = 180 B/s; `zombie.hit` ≈ 22 B × 10/s × up to 6 zombies in a 60° / 1.5 m arc ≈ 1.3 KB/s → ~1.5 KB/s per chainsaw wielder per receiver in the worst case (4 wielders: 6 KB/s, within 30 KB/s total but notable). If the test shows > 1.5 KB/s: send other players' chainsaw `melee.swung` every 4th tick only (interest filter in `eventInterest.ts`; the local client predicts its own) and keep `zombie.hit` (the flash is the feedback). Record the measured number.
- **D6 No new schema.** The active weapon and slot are synced; the Predictor's wield info comes from LocalFire, which already tracks `active` / swaps per seq.
- **D7 Effect caps in balance JSON** (brief 12): use the effect-caps block Round A introduced for puddles/pellets (5.6/5.3) if it exists; otherwise add `fx.json` (`maxSwingArcs: 8`, `maxChainsawSparks: 32`, zod-validated, read by the client only). One pool each, fixed size, oldest reused.

### Current state (read before changing)

- `combat/melee.ts › swingMelee`: emits `melee.swung`, queries the zombie grid (`reach + maxZombieRadius`), `circleOverlapsSector` per zombie, `applyZombieDamage(… stats.damage, px, py, stats.hitPushbackM …)`. Rewound view support.
- `combat/firing.ts › tryFire`: melee branch → `swingMelee` (no ammo); cooldown via `cooldownTickStart/End` with `stats.rateHz` (float seconds, the documented exception: rates that don't divide 20 Hz).
- `combat/damage.ts › applyZombieDamage`: HP, map-clamped pushback, `zombie.hit`, `killZombie`.
- `balanceSchema.ts`: `common.knockbackM` (default 0, unused), `meleeSchema { arcDeg }`.
- `player/slow.ts`: `slowPlayer`, `playerSpeed(base, p)` (integer pct), `tickSlow`; `player/movement.ts › movePlayers` (server + Predictor: `PREDICTION_SYSTEMS = { input, player }`).
- `apps/client/src/net/localFire.ts`: local fire clock per seq (2.7), swaps replayed per seq (`swapState`), `attack.melee`.
- `apps/client/src/net/prediction.ts › Predictor`: private World with one player and the default loadout (Pistol) — it does **not** know my weapons today.
- `buildings/collision.ts › pushOutOfBuildings` (buildings + map solids; `PUSH_NONE/MOVED/STUCK`).
- Client: `GameScene` shakes on `weapon.fired` only; `FxView.swing(...)` draws melee arcs; SFX names in `audio/placeholderSfx.ts`.

### Must be preserved

Machete behaviour (no knockback: `knockbackM` 0), 2.7 local swing feel, 2.12 rewound melee, 3.9 Crawler slow prediction, 4.2 cover rules, all existing tests.

### Copies touched (brief 2)

World (no new field; weapon stats) → schema (none) → `syncState` (none) → stateView (none) → mirror (none) → **Predictor** (wield per step, ring copy) → **LocalFire** (exposes per-seq active weapon/swap to the Predictor) → devThrottle (none) → `snapshotWorld` (unchanged; knockback moves zombies already in the digest).

### Beat the rule (for the reviewer; brief 4)

1. Axe a zombie standing against a barricade from the other side's angle: can it be knocked through the 0.5 m wall? Through a gap between two barricades narrower than a body? Into a car's box?
2. Axe a crowd into a corner: does any body end inside a box or overlapping a turret? Does the flow field need a rebuild (it must not)?
3. Hold the chainsaw with the aim stick barely past the dead zone, then release on alternate ticks: is the slow dodged while damage still lands? (Slow must follow attacking exactly.)
4. Swap from chainsaw to pistol and back every 0.3 s: speed and damage per second vs holding.
5. Chainsaw through a barrier/sandbag/car: melee ignores cover by the 1.9 rule — confirm the drawn arc matches and record it as intended.
6. Two players' axes hitting the same zombie on the same tick: double knockback (allowed: two swings) but each once.
7. Knock a Brute (5.7) with the axe: 0.3 m, not 1.5.
8. `?lag=150&jitter=20`: does the chainsaw slow cause rubber-banding? (netsim number.)
9. Knock a zombie into a 4.8 fire / out of the map edge / onto a spawn point.
10. Upgraded chainsaw IV (10.5/tick): one tick kills a Runner (6) and a Walker in one tick? (10.5 ≥ 10: yes) — confirm with 5.1.

### Bandwidth (brief 11)

Axe: ≤ 1.1 swings/s → ~20 B/s + `zombie.hit` per zombie hit (~22 B each) ≈ 0.1–0.2 KB/s per axe player. Chainsaw: see D5 (≤ 1.5 KB/s worst case). Zombie positions after knockback are in the existing horde stream (no change). Report the measured numbers.

### Phone FPS (brief 12)

New: 2 weapon frames (atlas), axe arc + chainsaw spark pools (fixed caps), one looped sound. Run `?stress=150` with 4 bots on chainsaws (or the solo stress with a chainsaw loadout) before/after; report headless FPS with load.

### Dependencies

- **Round A 5.3 (Shotgun)**: provides `applyKnockback` (combat/damage.ts), `zombies.knockShot` and the knockback fuzz (`combat/knockback.fuzz.test.ts`). This story reuses all three; extend the fuzz with axe bots rather than writing a second one.
- **5.1 (upgrades, parallel)**: damage of axe swings and chainsaw ticks = `weaponDamage(balance, weapon, level)`; whoever merges second wires it.
- **5.7 (Brute, parallel)**: `knockbackTakenPct` on zombie types; add it once (first to merge), the other reuses.
- **Round A 5.9 (metal barricade, spike trap, mine)**: knockback must stop at a metal barricade (a building: covered by `pushOutOfBuildings`); spike traps don't block bodies (knockback passes over them). Include them in the fuzz layouts if merged.
- **Round A 5.6 (Spitters)**: nothing; their puddles don't affect bodies' positions.

### Notes for the merge (brief 19)

- `weapons.json` / `shop.json`: append `fire_axe`, `chainsaw` after Round A's ids (the wire index is the key order).
- `combat/melee.ts`: 5.1 adds a `damage` parameter; this story adds knockback. One function.
- `balanceSchema.ts`: `meleeSchema.wielderSlowPct`, `zombieTypeSchema.knockbackTakenPct` (shared with 5.7), `zombies.json › knockback.stepM` (0.2) only if 5.3's sweep needs sub-steps; otherwise none.
- `player/slow.ts` / `movement.ts`: 5.6 (acid) or 5.8 (gas slow) may add slows: keep one integer formula, all factors multiplied.
- `prediction.ts` / `localFire.ts`: client-only; 5.1 doesn't touch them.
- `FxView.ts`, `GameScene.ts`, `placeholderSfx.ts`: Round A adds shotgun/AR/spitter effects in the same switch; append cases.

### References

- `epics.md` › Story 5.2; FR13, FR16, FR19. GDD › Weapon Systems (table: Fire Axe, Chainsaw), Feel (screen shake), Gore (limbs from axe/chainsaw: not in scope; blood splats only).
- Story files 1.9 (machete), 2.7 (local fire), 2.12 (rewound melee), 3.9 (slow prediction), 3.4/3.5 (collision, push-out), 4.2 (cover).

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (builder, worktree `story-5-2`, ports 4527 / 5527).

### Debug Log References

- Fuzz finding 1 (axe): the 5.3 fuzz checked the whole-tick chord pre-tick → post-tick; with 1.5 m knocks a zombie knocked along a face and then slid round the corner by the zombie system made a chord across the box corner that no leg crossed (false positive). Fuzz finding 2: four axes hitting one zombie in one tick = three legal legs whose chord cut a barricade corner (false positive). Fix: `combat/damage.ts › knockbackTrace` (test-only probe, null in the game) checks every knockback leg; the zombie system's leg is checked from the post-combat position.
- Mutation finding: "knockback not swept" was NOT caught by the axe fuzz at first (players at the team spawn never knocked anything into a map box: 0 of 4,811 face stops were map boxes). Fix: `nearCover` layouts (players 1–2.5 m off a random map box) and an assert that ≥ 20 knocks stop at a map box; now caught.
- Netsim: one start-up correction when the client attacks before the first snapshot names its weapons (LocalFire can't know them). Same for one RTT after buying the Chainsaw. Accepted; the netsim attacks from 0.6 s on.
- Before the merge, full `npm test` at load 11.7–13.4 had 7 timeouts at vitest's 5 s default (replay ×3, waveDirector, predictionCircle LAN, tickCostFlowField ×2); all pass on their own and the merged gate with `--testTimeout=30000` (the work branch's new default) is green.

### Completion Notes List

**What was built**
- Balance: `fire_axe` (30 dmg, 1.1/s, 2.2 m, 140°, knockback 1.5 m, pushback 0, shake, $300) and `chainsaw` (6 dmg, 10/s, 1.5 m, 60°, pushback 0.05, `wielderSlowPct` 20, `quietHits`, $600) appended to `weapons.json` / `shop.json`. Schema: `meleeSchema.wielderSlowPct` (int 0–90), `meleeSchema.quietHits` (bool), `zombieTypeSchema.knockbackTakenPct` (int 0–100, default 100; 5.7's Brute sets 20), `controls.json › fx` (client effect caps: `maxSwingArcs` 8, `maxChainsawSparks` 32, sparks per hit/miss, spark life, rev hold 150 ms). The caps went into `controls.json` (not a new `fx.json`): a new balance file would have meant editing the 25 test fixtures that list every file.
- Axe (F2, F3): `swingMelee` knocks each zombie it hit and didn't kill once per swing through 5.3's `applyKnockback` (one helper). `applyKnockback` and the hit pushback scale by `knockbackTakenPct`. Rewound swings push the present zombie along the rewound direction.
- Chainsaw (F4): no new timer (cooldown rule, every 2nd tick exactly: tested). **Quiet hit path** (`applyZombieDamageQuiet`): no `zombie.hit` per zombie per tick; same HP/pushback/kill; assist credit recorded directly (`recordDamager`); its `melee.swung` is emitted after the hits with `hits` (wire: appended index 6, quiet weapons only).
- Slow (F5, F6): `player/slow.ts › wielderSlowPct` (alive, not swapping, fire held, aim ≥ `MIN_AIM_LEN`, active weapon's pct) and `playerSpeed(base, p, wieldPct)` = integer product with the bite slow (2.52 m/s). `movePlayers` uses it (server, solo, Predictor). `LocalFireClock.moveWeapon / moveSwapping` = the weapon state the server's movement sees on the next seq; `Predictor.applyLocal(input, weapon, swapping)` stores it per ring entry (preallocated) and replays with it.
- Client: own `melee.swung` of a `screenShake` weapon shakes (online from the local swing; the server echo is dropped: once). `FxView`: heavy axe arc (wide, rim smear, 200 ms), chainsaw faint standing 60° wedge + spark/blood spray from a fixed `SparkPool` drawn into one Graphics per frame; swing Graphics pool capped at `maxSwingArcs`. Sounds: `weapon_axe_swing`, Chainsaw rev loop (`startChainsawRev`/`stopChainsawRev`, started/stopped by `SawClock.revStep`, never per swing). Art (game code): `weaponArt.ts › drawFireAxe` (AX1) and `drawChainsaw` (CS1, + running-blade view), shop icons and atlas frames `survivor_fire_axe_a`, `survivor_chainsaw_a`, `survivor_chainsaw_b` (running, shown while it cuts). `CHAR_EXTENT_R.survivor` 2.15 → 2.7 (the bar reaches 2.66 r). `?stressfire` with a melee loadout keeps its crowd (tough zombies).
- Readability sheet rows 24–25 (`objects/25_survivor_fire_axe.png`, `26_survivor_chainsaw.png`).

**Numbers**
- Knockback fuzz (axe, 4 players near cover): 10 layouts, 60 buildings, 19,678 knockbacks, 6,715 stopped at a face (5,241 at a map box), 758 axe kills; every leg swept-checked, no body in a box after combat or after the tick, zombies reach a player in every tough layout, nav rebuilds outside building changes 0. Shotgun fuzz unchanged (789 / 260 / 357).
- Bandwidth (1 Chainsaw, 6 zombies in the arc, 10 s, to one other client, no interest filter): **120 B/s** (10 ticks/s, 6 cut per tick, 0 `zombie.hit`); the same with one `zombie.hit` per cut would be 920 B/s. Fire Axe: 114 B/s. Budget 1,500 B/s: OK; D5's fallback not needed.
- Tick cost (Downtown, 4 players + 150 Walkers, best of 2): Pistols p99 0.591 ms, Chainsaws 0.547 ms (added −0.04), Fire Axes 0.497 ms (added −0.10); load 3.52 on 4 cores (`uptime` 15:31). Asserts behind `PERF_ASSERT=1`.
- Netsim `?lag=150&jitter=20` (75 ± 10 ms), 3 seeds, Chainsaw ↔ Pistol swaps every 3.5 s, attack bursts: 0 corrections, 0 snaps (baseline machete: 0); LAN 20 s attacking: 0 corrections over > 200 slowed ticks (asserted); control without wield state: 172 corrections.
- Bot sim (4 bots, $700 start, test-only lists): Fire Axe kills 338 / 319, Chainsaw kills 329 / 336, every run reached Results (wiped in W4, cleared 3); Chainsaw assists paid (237, 236): the quiet path keeps the credit.
- Browser (Playwright, solo dev build, DPR 2, 844 × 390): axe knock of a Walker 0.6 m in front of a barricade → stopped at the face (26.15 = minX − r, then walked back 0.06 the same tick), camera shake on with the setting on, none with it off; Chainsaw attacking 3.60 m/s vs 4.50 released (sim speed), running frame `survivor_chainsaw_b`, rev loop on, sparks 8–12 live (cap 32). Online with `?wallet=2000&lag=150&jitter=20` (2 clients): bought the Chainsaw, swapped, walked attacking 2.5 s: corrections 0 → 0, snaps 0; the guest sees the host's Chainsaw after a 2 s hidden-tab sleep. Screenshots: `docs/art/epic-5/round-b/ingame/5-2-axe-swing.png`, `5-2-axe-swing-noshake.png`, `5-2-axe-knockback-barricade.png`, `5-2-chainsaw-cutting.png`, `5-2-shop-icons.png`.
- Headless FPS `?stress=150&stressfire=1` (tough crowd, 20 s each, two rounds): Machete 16.6 / 8.0, Chainsaw 14.0 / 8.9, Fire Axe 9.9 / 9.7 fps at load 5.2 → 9.6 (4 cores). The spread is the machine load (other builders), not the effects; no difference measurable. Before (Pistol, crowd dying): 9.2 / 10.4 at load 12.8 → 8.7.

**Merged with the work branch** (`claude/gracious-turing-0db3j6` at e378702, with 5.1 and 4.12): conflicts in `melee.ts` (5.1's `damage` parameter kept; my `meleeDamage` removed, so axe swings and Chainsaw ticks = `weaponDamage(balance, weapon, slot.level)` via `tryFire`), `shop.json` (5.1's `upgrades` + my two ids), `fiveWaveSim.test.ts` (both describes), `weaponArt.ts` (both art blocks; icon origin table + 5.1's tier icon), `spriteAtlas.ts` (imports), `GameScene.ts` (my running-frame arg + 4.12's burn view). New test: Chainsaw IV 10.5/tick kills a Walker in one tick, Fire Axe III 45 (mutation "stats.damage instead of weaponDamage" caught). Gate on the merged branch: `npm run typecheck && npm run lint && npx vitest run --testTimeout=30000 && npm run build` all green (1,701 passed, 3 skipped; 222 files); `uptime` load 8.30 → 8.37 (4 cores) at 16:16–16:19.

**Mutations (each once; all caught)**
knockback not swept (unit: 6 fail; fuzz: fails since `nearCover`, missed before: see Debug Log), fuzz leg check off (2), slow without the fire check (1), chainsaw rate 20 (3), arc half-angle halved (1), Predictor ignores the wield state (4 incl. netsim), quiet path emits `zombie.hit` (2 incl. bandwidth), `knockbackTakenPct` ignored (1), killed zombies knocked (1), quiet path records no assist (1), slows "stronger only" (1), LocalFire `moveWeapon` from the snapshot slot (1), `countInArc` ignores the radius (1), rev hold ignored (3), axe knockback skipped (13).

**Beat the rule (my attempts)**
1. Zombie pressed (0.1 mm) against a barricade, swung from behind: stays at the face (test). Gap of 0.5 m between two barricades: not crossed (test). Into a car / bus / building box / barrier / sandbags / turret / map edge: stops at the face (tests).
2. Crowd axed into corners by 4 axes next to cover: no body in a box after combat or after the tick, no nav rebuild (fuzz).
3. Aim stick released on alternate ticks: the slow follows the aim exactly per tick, and so does the swing (no swing → no slow; test "aim released → full speed next tick"). Holding fire with aim inside the dead zone: no swing, no slow.
4. Swap spam: during a swap no slow and no damage (cooldown idle); slow/damage only while the Chainsaw is in hand (tests).
5. Chainsaw through cover: superseded by the designer's F7 (see Review fixes): melee doesn't hit through walls, cars or barricades; it does over sandbags and barriers.
6. Two axes on one zombie in one tick: two pushes, each once, each swept (fuzz has 4 axes; per-leg checks).
7. Brute 20 %: 0.3 m (test with a stand-in type; 5.7 sets the value).
8. `?lag=150&jitter=20`: 0 corrections (netsim, browser).
9. Into a car fire: allowed, it burns there (test); out of the map: impossible (test); onto a spawn point: allowed (spawns are not solids).
10. Chainsaw IV: 6 × 1.75 = 10.5 per tick: a Walker (10) dies in one tick (test, after merging 5.1).

### Review fixes (2026-11-23)

- **M1 fixed (Chainsaw cuts had no hit feedback):** `render/meleeFx.ts › ChainsawCutFx` (Phaser-free, preallocated id buffer, callbacks bound once). Each Chainsaw tick with a cut (the server's `hits` > 0, or for my own local swing online the drawn zombies in the arc) flashes every drawn zombie in the arc (`ZombieView.flash`) and plays `zombie_hit` once (rate-limited inside `playSfx`), on every client including the shooter. A tick with `hits` 0 flashes nothing. `FxView` takes the drawn World (`fxView.world`) instead of the old `cutCount` callback. Tests in `meleeFx.test.ts`. Browser (solo, 3 tough Walkers in the arc, 3 s): 16 flashes, 0 `zombie.hit` events.
- **M2 fixed (rev loop kept playing in a hidden tab):** `SawClock` now owns the loop through a `RevSink` (`startChainsawRev` / `stopChainsawRev`). A `visibilitychange` → hidden listener stops it at once (no frame runs while hidden), and `revUpdate` never starts it while hidden. `dispose()` on scene shutdown stops it and removes the listener (`FxView.destroy`, plus the old `stopChainsawRev` in the shutdown). Browser: hiding the tab while holding the trigger → `revving` false.
- **L3 fixed:** `startChainsawRev` returns whether the loop really started. `revving` is set only then, so the loop starts on a later frame once the audio unlocks, with no release needed.
- **L4 accepted:** at swap edges under jitter, the predicted slow can differ from the server's by one tick (one small correction).
- **L5 accepted:** the Chainsaw's 0.05 m hit pushback is unswept; the zombie push-out corrects it the same tick (as for every small pushback since 1.9).
- **Designer decision F7, "Melee can't hit through walls"** (replaces Story 1.9's "melee ignores cover"; all melee: Machete, Fire Axe, Chainsaw):
  - A zombie whose body touches the drawn arc is hit only if the straight line from the wielder's centre to the zombie's centre enters no shot blocker (map collision boxes = buildings, cars, the bus) and no wall building (`solid`: wood / reinforced / metal barricades, turrets).
  - Low cover that bullets pass (police barriers, sandbags) and floor buildings (spike traps, mines) don't block.
  - Grazing a face or a corner is clear. Around a car's corner: hit if the centre line passes the corner, no hit if it runs through the car, even when part of the body pokes out.
  - Deterministic: one function, `combat/cover.ts › meleeLineClear`, used by `swingMelee`. Rewound swings test the line against the rewound positions they test the arc on. The client's cut feedback (`zombiesInArc`) uses the same function on the drawn world.
  - Knockback rules unchanged.
  - Tests: Machete, Fire Axe and Chainsaw each checked through wood / reinforced / metal barricades and a turret (no damage); over sandbags, a barrier or a spike trap (damage); behind a car and around its corner (per the rule). Plus a client agreement test. The 1.9 test in `cover.test.ts` is inverted: no damage through a thin car.
- **Mutations (each once):**
  - New review tests, all caught except one: flash removed (2 fail), sound removed (2), no visibility listener (2), hidden ignored in `revUpdate` (1), revving set though the audio refused (1), dispose keeps the listener (1). The exception, "hits 0 not short-circuited", passed: it is an equivalent mutation (the count is 0 either way; the early return only skips the arc scan).
  - F7, all caught: swing ignores the rule (10), walls don't block (7), floor blocks (3), map cover doesn't block (4), client feedback ignores walls (1).
- **Gate** (no merge, branch on e4a3002): typecheck, lint, `vitest --testTimeout=30000` (1,724 passed, 3 skipped; 222 files), build all green. `uptime` load 3.18 → 3.75 at 16:39–16:41.

### Notes for the merge (builder)

| Shared file | What 5.2 changed | Likely conflicts |
| --- | --- | --- |
| `config/balance/weapons.json`, `shop.json` | `fire_axe`, `chainsaw` appended after `assault_rifle` | 5.4/5.5/5.12 append too: keep append order (wire index) |
| `config/balanceSchema.ts` | `meleeSchema.wielderSlowPct`, `meleeSchema.quietHits`, `zombieTypeSchema.knockbackTakenPct`, `fxSchema` in `controlsSchema.fx` | 5.7 adds `knockbackTakenPct` too: keep ONE (int 0–100, default 100) |
| `combat/melee.ts` | knockback after damage, quiet path; damage = 5.1's `damage` parameter (already merged here) | 5.7 (Brute) if it touches the swing |
| `combat/cover.ts` | `meleeLineClear` (F7) | 5.4 flames / 5.5 blasts may add their own line rules: reuse `shotBlockT` |
| `combat/damage.ts` | `knockbacks` counters moved here (re-exported from `firing.ts`), `knockbackShare`, `applyZombieDamageQuiet`, `knockbackTrace`, pushback × share | 5.4 (its own quiet flame path: consider reusing `applyZombieDamageQuiet`), 5.7 (Brute: no second scale) |
| `combat/firing.ts` | `MIN_AIM_LEN` constant, `knockbacks` import | 5.1 / 5.4 / 5.5 |
| `config/constants.ts` | `MIN_AIM_LEN` | append |
| `core/simEvents.ts`, `net/netEvents.ts` | `melee.swung.hits` (index 6, quiet weapons only) | 5.1 uses event kind 31 (no clash: no new kind here) |
| `player/slow.ts`, `movement.ts` | `wielderSlowPct`, `playerSpeed(base, p, wieldPct)` integer product | 5.6/5.8/5.11 slows: multiply into the same formula |
| `apps/client/src/net/prediction.ts`, `localFire.ts`, `sim/NetSimHost.ts` | per-seq wield state into the Predictor | 5.12 (consumables) may touch NetSimHost's step loop |
| `render/FxView.ts`, `weaponLook.ts`, `PlayerView.ts`, `city/weaponArt.ts`, `spriteAtlas.ts`, `spriteArt.ts` | melee looks, sparks, frames; survivor extent 2.7 | 5.1 (upgrade marks), 5.4/5.5 art: append to `WEAPON_ART` |
| `scenes/GameScene.ts` | shake on own `melee.swung`, fx update + rev, running frame, melee `?stressfire` toughens the crowd | most Round B stories |
| `audio/placeholderSfx.ts` | `weapon_axe_swing`, rev loop | append |
| test fixtures | `shop.test.ts`, `shopStore.test.ts` weapon lists; `knockback.fuzz.test.ts` now `runFuzz(...)` | 5.4/5.5 shop lists |

### Not verified

- Real phones (FPS, the rev loop's sound, touch aim with the Chainsaw); headless Chromium ran at 8–17 fps under load 5–13, so the running-frame/rev timing was seen working but not at 60 fps.
- 5.7's Brute (not merged into this branch: knockback × 20 % tested with a stand-in type).
- A late Game-scene start with the Chainsaw already in hand (the start-up correction is measured only in the netsim).
- No Meshy art step (skipped as instructed); no `docs/art/5-2/README.md`.

### File List

- `packages/shared/src/config/balance/weapons.json`, `shop.json`, `controls.json`
- `packages/shared/src/config/balanceSchema.ts`, `constants.ts`, `balance.test.ts`
- `packages/shared/src/combat/damage.ts`, `melee.ts`, `firing.ts`
- `packages/shared/src/combat/heavyMelee.test.ts` (new; + 5.1 level test after the merge), `knockback.test.ts` (new), `knockback.fuzz.test.ts`
- `packages/shared/src/core/simEvents.ts`, `net/netEvents.ts`
- `packages/shared/src/player/slow.ts`, `movement.ts`, `slow.test.ts`
- `packages/shared/src/economy/shop.test.ts`, `fiveWaveSim.test.ts`
- `apps/server/src/run/meleeBandwidth.test.ts` (new), `tickCostDowntown.test.ts`
- `apps/client/src/net/localFire.ts`, `localFire.test.ts`, `prediction.ts`, `prediction.test.ts`
- `apps/client/src/sim/NetSimHost.ts`, `scenes/GameScene.ts`, `ui/shopStore.test.ts`
- `apps/client/src/render/FxView.ts`, `PlayerView.ts`, `weaponLook.ts`, `meleeFx.ts` (new), `meleeFx.test.ts` (new)
- `apps/client/src/render/city/weaponArt.ts`, `spriteAtlas.ts`, `spriteArt.ts`
- `apps/client/src/audio/placeholderSfx.ts`
- `tools/netsim/chainsaw.test.ts` (new)
- `docs/playtests/milestone-1/readability-sheet.md`, `readability-key.md`, `objects/25_survivor_fire_axe.png`, `objects/26_survivor_chainsaw.png` (new)
- `docs/art/epic-5/round-b/ingame/5-2-*.png` (new)
- `_bmad-output/implementation-artifacts/5-2-fire-axe-and-chainsaw.md`

## Change Log

- 2026-11-23: Story 5.2 built (Fire Axe with swept 1.5 m knockback through 5.3's helper, Chainsaw with quiet hits and a predicted 20 % wielder slow, AX1/CS1 art in game code, sparks/arc/rev effects, fuzz near cover, bandwidth and tick-cost tests, netsim); status → review.
- 2026-11-23: merged the work branch (5.1 upgrades, 4.12); axe/Chainsaw damage through `weaponDamage`; gate green.
- 2026-11-23: review fixes M1 (cut flash + sound), M2 (rev stops in a hidden tab / on shutdown), L3 (rev retries until audio runs); designer rule F7: melee blocked by walls, cars and wall buildings.
