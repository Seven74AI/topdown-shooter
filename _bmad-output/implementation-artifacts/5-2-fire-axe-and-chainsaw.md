# Story 5.2: Fire Axe and Chainsaw

Status: ready-for-dev

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

- [ ] **T0 Art pick (first; brief 13).** ~5 Meshy proposals per weapon (`nano-banana-pro`, the 4.11 shared style line: strict top-down orthographic, gritty realistic, night, wet asphalt, cool streetlight from the upper left, muted, crisp silhouette, no text), shown **in a survivor's hands seen from above** at the in-game size: Fire Axe **A1** red fire-department axe, **A2** worn wooden haft + rusty head, **A3** yellow-handled pick-head axe, **A4** taped haft with blood, **A5** long two-handed felling axe; Chainsaw **C1** orange classic, **C2** yellow/black, **C3** rusty with a missing guard, **C4** red with a long bar, **C5** compact grey electric. Plus 3 swing-effect sketches (axe arc smear; chainsaw spark spray). One private proposal page; the designer picks; record in `docs/art/5-2/README.md` (+ images). (AC 7)
- [ ] **T1 Balance + schema** (AC 1)
  - [ ] `balanceSchema.ts › meleeSchema`: `wielderSlowPct: z.number().int().min(0).max(90).default(0)` (integer for prediction, like `biteSlowPct`). `common.knockbackM` already exists (default 0; unused until now). `zombieTypeSchema`: `knockbackTakenPct: int 0–100, default 100` (5.7 sets the Brute's 20; add it here if 5.7 isn't merged — whoever is first).
  - [ ] `weapons.json` + `shop.json` entries (AC 1). `config/balance.test.ts` (+ `fire axe and chainsaw match the GDD table`).
- [ ] **T2 Swept knockback** (AC 2; F2, F3) — **reuse Round A 5.3's `combat/damage.ts › applyKnockback(world, zid, dirX, dirY, distM)`** (5.3 T4: moves the body along the direction, stopping at first contact with any map solid or solid building, boxes grown by the zombie radius, clamped to the map; allocation-free). Do not add a second helper.
  - [ ] Verify 5.3's helper against a 1.5 m push (3× its 0.5 m case): it must stop at the first face along the whole segment (a swept test, not an end-point push-out). If 5.3 used end-point push-out or fixed sub-steps sized for 0.5 m, make it a true segment sweep (or sub-steps ≤ `zombies.json › knockback.stepM` 0.2 m, < half the thinnest wall) and re-run 5.3's knockback fuzz.
  - [ ] Inside `applyKnockback`: `distM × knockbackTakenPct / 100` of the zombie's type (D3; the Brute's 20 % from 5.7). Apply the same factor to `hitPushbackM` in `applyZombieDamage`.
  - [ ] `combat/melee.ts › swingMelee`: after `applyZombieDamage` (pushback = `hitPushbackM`), if `stats.knockbackM > 0` and the zombie is still alive → `applyKnockback(world, id, px, py, stats.knockbackM)`. Each zombie at most once per swing (one loop pass per swing: already true; test it). With a rewound `view` (2.12), the direction is the rewound one, the move applies to the present zombie (existing pattern).
  - [ ] Tests `combat/knockback.test.ts` (5.3's file: extend): `axe knocks back exactly 1.5 m in the open`, `axe stops at a wood barricade face and never crosses it` (both rotations, approach angles 0–90° step 5°), `stops at a car, the bus, a building box, a turret, the map edge`, `a Brute moves 20 %` (type override if 5.7 isn't merged), `one push per zombie per swing`, `killed zombies are not moved`, `rewound swing pushes the present zombie`.
- [ ] **T3 Chainsaw + speed penalty** (AC 3, 4, 5; F4, F5, F6)
  - [ ] No new timer: the chainsaw is a melee weapon with `rateHz 10` (the cooldown rule fires it every 2nd tick exactly; verify with a test, not by reasoning).
  - [ ] `player/slow.ts`: `wielderSlowPct(balance, p, input)` (active slot's weapon `wielderSlowPct` if alive, `loadout.swapTicks === 0`, `input.fire`, aim length ≥ the `MIN_AIM` used in `tryFire`) and `playerSpeed(base, p, wieldPct)` = `base × (100 − slowPct) × (100 − wieldPct) / 10000` (integers, + − × ÷ only, same expression on both sides).
  - [ ] `player/movement.ts › movePlayers`: passes it. The Predictor's World has only its player: it needs the real active weapon → T5.
  - [ ] Tests `player/slow.test.ts` (+ `chainsaw slows to 3.6 m/s only while attacking`, `no slow while swapping / downed / aim released / chainsaw not in hand`, `stacks with a Crawler bite to 2.52 m/s`), `combat/melee.test.ts` (+ `chainsaw ticks 10 times in 20 ticks`, `60 damage per second per zombie in the arc at level I`, `axe and chainsaw arcs: inside / on the edge / outside`, `chainsaw is continuous: a zombie walking in is hit on the next chainsaw tick`).
- [ ] **T4 Client** (AC 2, 3, 7)
  - [ ] `scenes/GameScene.ts`: screen shake also on my own `melee.swung` of a `screenShake` weapon (today only `weapon.fired`); online from the local swing (`NetSimHost.localSwung`), never twice.
  - [ ] `render/FxView.ts`: axe swing look (wider, heavier) and chainsaw spark spray, both pooled with a fixed cap (no allocation per swing); `audio/placeholderSfx.ts`: `weapon_axe_swing`, `weapon_chainsaw_rev` (looped while active, stopped after 150 ms without a chainsaw swing).
  - [ ] Survivor in-hand weapon from the T0 picks (`render/PlayerView.ts` + `render/city/spriteArt.ts` / `spriteAtlas.ts` frames, `category_name_variant`, in the existing ≤ 2048² characters atlas; check `atlasLayout.test.ts`).
  - [ ] Readability sheet: add the axe and chainsaw (`docs/playtests/milestone-1/readability-sheet.md` + key) as new rows.
- [ ] **T5 Prediction copy** (AC 5; brief 2)
  - [ ] `apps/client/src/net/prediction.ts`: `Predictor.step(input, wield)` (or a `setWield(weapon, swapping)` before each step) fed from `LocalFire`'s per-seq active weapon and swap state; replayed inputs on reconcile use the same per-seq values (store them in the ring next to the input copy: preallocated fields, no allocation).
  - [ ] Tests `net/prediction.test.ts` (+ `chainsaw slow predicted: 0 corrections over 200 ticks attacking`), `tools/netsim` (+ `chainsaw.test.ts`: `?lag=150&jitter=20`, corrections from the chainsaw ≤ the baseline's, client position = server position at ack).
- [ ] **T6 Fuzz, bandwidth, perf, liveness** (brief 7, 9, 11, 16)
  - [ ] Extend 5.3's `combat/knockback.fuzz.test.ts` (or the block in `zombies/downtown.fuzz.test.ts`): random barricade/turret layouts × every decay stage (and the 4.8 fires) × ≥ 2,000 ticks with 4 axe bots swinging at crowds next to cover: **no zombie centre inside any box after any tick, no zombie on the far side of a barricade it started in front of within the knocked tick** (track side-of-face per hit), **no stall (zombies still reach a player)**, **flow fields rebuilt only at build starts** (count rebuild starts outside `startBuild` = 0), ≥ 100 knockbacks really happened and ≥ 20 ended against a face (liveness).
  - [ ] `apps/server/src/run/` bandwidth test (pattern `turretBandwidth.test.ts`): 1 chainsaw player in a crowd of 6 for 10 s → bytes/s of `melee.swung` + `zombie.hit` to one other client; assert ≤ 1,500 B/s and report the number.
  - [ ] `tickCost.test.ts` (+ case, behind `PERF_ASSERT=1`): 4 chainsaws in 150 zombies; added p99 recorded with the machine load.
  - [ ] Sim: a bot loadout `fire_axe,chainsaw` in the 6-wave sim: waves ended, kills by each weapon ≥ 1.
- [ ] **T7 Gates.** Mutations listed (knockback not swept → fuzz fails; slow without `fire` check → slow test; chainsaw rate 20 → tick test; arc in radians mismatch → arc test; Predictor ignoring wield → netsim). Browser check (Playwright): `?loadout=fire_axe,chainsaw`, solo and online with `?lag=150&jitter=20`: knockback against a barricade, chainsaw slow, shake setting off/on. `typecheck && lint && test && build`. Merge notes.

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

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
