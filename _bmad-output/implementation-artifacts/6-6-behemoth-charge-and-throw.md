# Story 6.6: Behemoth charge and throw

Status: review

## Story

As a team,
I want the Behemoth to charge through our defenses and throw wrecks at us,
so that we have to keep moving, and can bait it into a wall.

> **EPIC 6 BRIEF** (`docs/epic-6-brief.md`), pasted verbatim. Every line applies; reviewers check each one.
>
> ```
> EPIC 6 BRIEF (from the Epic 4 retro's EPIC 5 BRIEF + Epic 6 specifics; reviewers: check each line)
> 1. Builders run in their own CLOUD SESSION (branch story-6-x, one container each; HANDOFF §3 Session 6 rules). Never `npm run dev` with fixed ports; assigned ports only; stop processes by PID. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current master. While building run only the touched areas' tests; ONE full gate at the end.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo (LocalSimHost), NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → fakeRoom → mirror → Predictor → devThrottle → snapshotWorld). Boss, events, vote and light state are server truth; the client only draws.
> 3. FAIRNESS RULE FIRST: each mechanic's player-visible rule is written in the story ACs before building, and each rule is a test.
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (the story's "Beat the rule" list is the start, not the end) and list every attempt and its result.
> 5. Cover: bullets stop at map cover (cars, bus, buildings, pumps, parking wall, dumpster), at every barricade tier and at Ruins rubble. Lobbed rounds (launcher, hand grenade, molotov) fly over everything except real buildings (`building: true`); rubble is NOT `building: true`. Spit, flames, blasts, acid, gas and fire zones: cars, the bus, buildings and rubble stop or shield them (clear line from the centre). Sandbags, police barriers, turrets and floor buildings (traps, mines) stop bodies only. Melee is stopped by barricades, shot-blocking map cover and rubble. Behemoth slam and throw IGNORE cover ("the drawn zone is the promise"); the gas-leak blast uses the normal blast line of sight. Server and the client's cosmetic copy agree; rewound (2.12) hits for players' shots only.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged. Boss hits resolve once, on the tick the telegraph ends.
> 7. Spatial code (rubble, breaches, the Behemoth body and charge, shoves, the survivor NPC, the helicopter pad, crate spots) gets a builder-written fuzz test: random layouts × every stage × variant × many ticks; no body inside a box, no stall, zombies and the boss reach a player, flow fields rebuild only at build start (the boss field is its own, on its own clock).
> 8. Randomness only from named seed streams (`decay` for variants/looks, `events` for event schedule/spots/weapons, `spawns`, `combat`); same seed + input log → same snapshotWorld digest, including boss and event state.
> 9. Liveness: every sim/replay/integration test asserts something really happened (all 10 waves played, the boss spawned/attacked/crashed/died, each event triggered, a vote resolved, ≥ 1 endless wave). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks (1.2 s = 24 ticks); no per-tick/per-frame allocation (pool stamps, decals, markers, particles); every number in balance JSON (`waves.json`, `decay.json`, `boss.json`, `events.json`, …), no inline literals.
> 11. Bandwidth: telegraphs, event starts/ends and effects go out as reliable events (kind + start tick + fixed zone), not per-tick state; one boss record in the room state; report added B/s; total ≤ 30 KB/s per phone (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled and capped (max live decals/particles in balance JSON). The reference low-end phone is the Xiaomi Mi 11i (designer 2026-11-24; the Honor 10 is not a test phone). Run ?stress=150 with the story's effects active; report headless FPS before/after with load; the latest recorded ?stress=150 baseline in docs/perf/ is the floor.
> 13. Readability: every new object must read at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet (`docs/playtests/milestone-1/readability-sheet.md`).
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start AND across a boss telegraph / event start / vote, on a late Game scene start and a reconnect; client shows server truth (pending until state agrees).
> 15. Balance: earnings stay as built until the Epic 5 balance pass settles them; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 10-wave sim and assert all waves ended. Solo is "allowed, not tuned" and scales × 0.4 (Behemoth HP too).
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added server p99 ≤ 2 ms total budget for Epic 6 (boss field + events + vote).
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently (votes and pings are inputs to budget for).
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix, ?seed, the decay-stage cheat, new: force blackout, start at wave N, force event X, spawn Behemoth), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master. Each story goes to master as soon as its review (and re-reviews) is clean.
> 20. Every texture drawn in code is created through addGeneratedTexture with a redraw callback (Android Chrome wipes canvases while the app is in the background); test that it redraws after a simulated context loss (`tools/checks/noUnregisteredTextures.test.ts` must stay green). That includes the darkness texture, light stamps, boss atlas, decals, markers and dawn.
>
> EPIC 6 SPECIFICS
> 21. BOSS FAIRNESS (each is a test): (a) every danger zone (slam centre, charge lane + stop point, throw landing spot) is fixed when its telegraph starts; (b) the client draws the telegraph's progress from the server's start tick, never from when the message arrived, and the fill always ends on the hit; (c) edge grace 0.25 m: a hit lands only when the player's centre is 0.25 m inside the drawn edge; (d) boss hits use the player's newest server position, no rewind; (e) telegraph lengths never shorten (enrage, endless, player count); (f) one boss attack at a time, then recovery, then the per-player-count gap; (g) a downed player is never targeted or hit again.
> 22. CAP 110 WHILE THE BEHEMOTH LIVES: at most 110 zombies alive while it is alive (D6), back to 150 the tick it dies; the boss itself does not count; enrage Crawlers respect the cap; the stampede's +30 over-cap allowance is counted against the cap that applies.
> 23. EVENT FAIRNESS: every event announces itself (banner + sound + map marker above the darkness) before it can hurt anyone; the schedule comes only from the `events` stream (2 different events, 2 different waves of 3–8, never 5, never back-to-back); a lever (shoot the armed car, shoot the gas tank after 3 s) works the same for every player and credits whoever pulled it; only standing players take the crate or lead the survivor; the gas blast hurts every player in range in full (as Bloaters) and is shielded by the normal blast line of sight.
> 24. BLACKOUT READABILITY: darkness and fog vision can't be turned off (FR87); quality settings only change their look. Always above the darkness: teammates with rings, zombie eyes within 14 m (or the fog edge), the boss's outline and eyes, every boss telegraph, event markers, the crate, the survivor and the safe point, pings. Colour rule: red = boss danger only, amber = an event you can use, yellow-green = gas, white = pick-ups and people. No hot beam core, no lens flare; rain sparkles inside beams. Check at 568 × 320 and 800 × 360.
> 25. ENDLESS PERFORMANCE: nothing grows without a cap over 20+ endless waves (alive 150 / 110, wave size 600, Brutes ≤ 6 alive, decals, craters, markers, event records, kill logs); a 20-wave endless sim records server tick p99 and memory and asserts they stay flat; FPS recorded with blackout + fog + Behemoth + 150 zombies (`docs/perf/epic-6-blackout.md`).
> 26. LIGHT IS SERVER TRUTH: the light state (stage, blackout flag, power out, flicker seeds, build-phase half darkness) is part of the world and replays; a client that joins or wakes mid-wave draws the same darkness as everyone else; fog hides zombies only on the local screen, never in the sim (aim assist and turrets keep their own rules; aim assist never locks a target your screen hides).
> 27. DO NOT TOUCH EPIC 5 WORK IN PROGRESS: 5.13 card shop and 5.20–5.25 building UX are being built in other sessions (shop, build bar, carry/drag UI); Epic 6 changes there go through their balance flags (`inShop`) or a "Notes for the merge" line, not edits to their UI.
> 28. ONE RUN FLOW: the run phase machine (lobby → build → wave → … → vote → extract/endless → results) has one owner per change (6.1 removes the 6-wave ending, 6.11 adds the vote, 6.12 adds endless); every phase change is a tested transition, and Results always show (no stuck run).
> ```
>
> Most relevant here: **21 (fixed lane and landing spot, start-tick fill, 0.25 m grace, newest position, never shortened, one attack at a time, downed safe)**, 5 (throw ignores cover; the charge stops at map cover, smashes player buildings), 6 (a charge hits a player once; a throw resolves once at impact), **7 (the charge is the biggest spatial move in the game: lane sweep + fuzz)**, 9 (≥ 1 charge hit, ≥ 1 crash, ≥ 1 throw hit, ≥ 1 building smashed), 10 (12 m/s = 0.6 m per tick; every number in `boss.json`), 11 (lane and landing go out once, in the telegraph event), 12 (crater decals pooled), 14 (lag: shove predicted through the knock fields), 24 (CRASH mark amber, danger red + hatching).

## Acceptance Criteria

### Fairness rules (player-visible; brief lines 3 and 21; each is tested)

- **F1 "The lane is the promise."** When a charge telegraph starts, the server fixes the lane: start = the boss's centre, direction = toward its target's position **at that tick** (no lead), stop point = found by sweeping its 2 m body along the direction against the map's solid boxes and the map edge (D1). The client draws exactly that lane: **4.8 m wide** (`charge.laneWidthM` = body 4 m + a survivor 0.8 m), from the boss to where its body will stop. The lane never changes after the start.
- **F2 "CRASH means crash."** If the sweep ends on hard cover before 10 m, the lane shows a **CRASH** mark at its end and the charge **always** crashes there; if no mark is drawn it **never** crashes. Player buildings never stop it and never change the lane (it smashes them, F6).
- **F3 "Inside the lane gets hit, the edge doesn't."** During the rush a standing player is hit only when their centre is within **2.15 m** of the boss's travel line (the drawn half-width 2.4 m − `edgeGraceM` 0.25 m) and inside the drawn length, tested against the segment the boss moved this tick (no tunnelling at 0.6 m per tick). A player at 2.16 m or more is never hit.
- **F4 "Once per charge, out to the side."** A charge hits each player at most once: **30 damage** and a **2.5 m shove sideways**, away from the lane's centre line (never along it: it never carries you), over 0.2 s through the normal knockback (stops at cover, at the map edge, at a fire edge: Story 5.7 F2).
- **F5 "A crash is your window."** A crash stuns it for **2 s** (`charge.stunS`, 40 ticks) and it takes **× 1.5 damage from every source** meanwhile (designer D1). It cannot attack, turn or move while stunned.
- **F6 "It goes through your stuff, not through the city."** Every player building its body touches during the rush is destroyed (no refund); it never passes through a car, the bus, a building, rubble, sandbags, police barriers, a pump, the dumpster or the map edge.
- **F7 "The throw lands where you stood."** The throw aims at the **farthest standing player more than 8 m away**, at their position **at the telegraph start** (no lead, it never follows you). A **3 m ring** shows there from the start; an inner ring shrinks to the impact. Lift **1.0 s** + flight **0.8 s** = impact 36 ticks after the start. Only players whose centre is **inside 2.75 m** (3 m − 0.25 m) at impact take **35 damage** (no knockback). The throw ignores cover (alignment Q8).
- **F8 "A throw never changes the map."** No collision change, no flow-field rebuild, no building damage; it leaves a crater decal only.
- **F9 "It tells you what's next."** It picks in a fixed order (AC 6); the edge marker shows the coming attack's icon (arrow = charge, rock = throw).
- **F10 "Downed is safe"** (as 6.5 F9): no charge hit, shove or throw damage on a downed or out player.

### Behaviour

1. **Balance (`boss.json`, extends 6.5's `bossSchema`):** `charge { minM 5, maxM 12, minLaneM 4, distM 10, telegraphS 1.0, speedMps 12, laneWidthM 4.8, damage 30, shoveM 2.5, shoveS 0.2, zombieDamage 30, recoverS 1.0, cooldownS 7, initialCooldownS 2, stunS 2, stunDamageMult 1.5, sweepStepM 0.1 }`, `throw { minM 8, unreachableMinM 4.5, liftS 1.0, flightS 0.8, radiusM 3, damage 35, zombieDamage 35, recoverS 0.6, cooldownS 6, initialCooldownS 3, sourceRangeM 6 }`. `crossCheck`: every `*S × 20` is a whole number of ticks; `laneWidthM / 2 − edgeGraceM > 0`; `minLaneM ≤ distM`.
2. **The lane sweep** (`boss/charge.ts › sweepChargeLane(world, x, y, dirX, dirY, out)`): from the centre in `sweepStepM` steps up to `distM`, the first step whose 2 m circle overlaps a box of `world.obstacles.solids` or crosses the map edge ends the lane at the previous step: `lenM`, `crash = true`; reaching `distM` clean: `lenM = 10`, `crash = false`. Player buildings (`world.buildings`) are ignored by the sweep (F2, F6). Allocation-free (writes `out`).
3. **Charge** (`telegraph.ts` kind CHARGE): picked when the gap is over, its cooldown is 0, no one is in slam range (6.5's first branch), the target's centre is **5–12 m** from the boss's centre and the sweep toward it gives `lenM ≥ 4`. Telegraph **1.0 s = 20 ticks** (boss stands, faces the lane, head down): `boss.telegraph { kind: CHARGE, startTick, hitTick, cx, cy, dirX, dirY, lenM, widthM, crash }`. At `hitTick` → `RUSH`: each tick it moves `min(speedMps × dt, lenM − travelled)` = 0.6 m along the lane (no push-out needed: the sweep guarantees a clear path for its body against map boxes); every player building overlapping its body is destroyed (`damageBuilding(world, b, b.hp)`: `building.destroyed`, no refund; mines and traps are destroyed without going off); every zombie overlapping its body takes `zombieDamage` 30 (killer null); every standing player not yet hit this charge whose centre is within `laneWidthM / 2 − edgeGraceM` = 2.15 m of this tick's travel segment takes 30 (`damagePlayerBy(…, "boss", null)`) and is shoved (`knockPlayerBy` with the sideways direction, 2.5 m / 4 ticks). At the stop: `crash` → `STUN` for 40 ticks, emitting `boss.crashed { attackId, x, y }`; else `RECOVER` 1.0 s. Cooldown 7 s from the hit tick. The rush takes `ceil(lenM / 0.6)` ticks (10 m: 17 ticks).
4. **Stun.** While `STUN`: no move, no turn, no attack, no gap countdown; `applyBossDamage` multiplies every source by `stunDamageMult` 1.5 (6.5 AC 11 reads `boss.state === STUN`). After 40 ticks: `gapTicks = gapS[n − 1]` (× 0.7 enraged, 6.7), then WALK.
5. **Throw** (`boss/throw.ts`, kind THROW): picked when slam and charge were not, its cooldown is 0 and a standing player's centre is **more than 8 m** from the boss (or more than `unreachableMinM` 4.5 m when the boss's field cannot reach that player: 6.5 T3, D5). The farthest such player's position at the start is the landing spot (fixed). The **source** (visual only, D7): the nearest 6.2 rubble pile or burnt car (a `decay.fireSlots` record, burning or out) whose box is within `sourceRangeM` 6 m of the boss's body edge, else the road; sent as `src` (0 road, 1 rubble, 2 burnt car) + `srcX, srcY`. Lift 1.0 s = 20 ticks (boss stands, arms raised with the chunk), then the attack record moves to `FLIGHT` for 0.8 s = 16 ticks while the boss stands in `RECOVER`; **its 0.6 s recovery counts from the impact and its gap follows that** (review L4, brief 21f: one attack, then recovery, then gap), and **a new attack cannot start until the impact** (6.5 F5: one attack at a time). At impact (`hitTick` = start + 36): every standing player with centre within 2.75 m takes 35 (`"boss"`, through cover), every zombie centre within 3 m takes `zombieDamage` 35 (killer null), `boss.thrown_impact { attackId, x, y }` (crater decal + dust + shake within 8 m). No change to `world.obstacles`, `world.buildings` or the nav grids (F8, asserted by a version check in the test). Cooldown 6 s from the release (an explicit exception to 6.5's "cooldown starts at the hit tick": a throw's hit tick is its impact, 0.8 s after the release).
6. **Pick order** (`behemoth.ts › pickBossAttack`, completes 6.5's stub): when `state === WALK`, `gapTicks === 0` and no attack record is live: (1) slam if its cooldown is 0 and any standing player is within 4 m; (2) charge if its cooldown is 0, the target is 5–12 m away and the lane is ≥ 4 m; (3) throw if its cooldown is 0 and a player qualifies (AC 5); (4) otherwise walk (and try again next tick). Initial cooldowns at arrival: charge 2 s, throw 3 s (slam 0).
7. **Network.** The boss schema (6.5) gains the lane/landing fields of the current attack: `atkDirX i8, atkDirY i8` (unit × 127, like the knock fields), `atkLen u16` (cm), `atkCrash bool`, `atkSrc u8, atkSrcX f32, atkSrcY f32` — so a late or woken client draws the running telegraph. New events (next free numbers at merge): `boss.crashed`, `boss.thrown_impact`; `boss.telegraph` carries the charge/throw fields (round-trip tests). All global.
8. **Client.**
    - Charge lane (`BossTelegraphView`): hatched red rectangle 4.8 m wide from the boss to `lenM + 2 m` (its body front), white arrows along it, fill grows from the boss by progress (start-tick keyed, 6.5 `telegraphProgress`), during the rush the lane stays fully filled until the stop, then fades 0.3 s. **CRASH** mark: an amber bar across the lane end + the word "CRASH" (amber = an event you can use: the stun is your window; colour rule brief 24).
    - Throw: hatched 3 m ring at the landing spot + a white inner ring shrinking from 3 m to 0 over lift + flight; the chunk drawn lifted over the boss's head during the lift (pose `throw`), then flying in an arc (cosmetic, 0.8 s) from the boss to the spot; crater decal at impact (pool shared with 6.5's crack decals, `caps.maxDecals` 8). The throw ring is under the target, so it is always on that player's screen. Lane, CRASH mark, rings, chunk and crater draw above the darkness with `aboveDarkness(obj, ABOVE_DARK.telegraph)` (6.3's `render/darkness/aboveDark.ts`; the chunk and crater too, so a blackout throw is readable).
    - Stun: pose `stun` (head lolling, dust ring), a "CRASH!" banner 1.2 s for everyone, the boss bar flashes amber while stunned.
    - Sounds: `boss_charge_scrape` (telegraph), `boss_charge_rush`, `boss_crash`, `boss_throw_lift`, `boss_throw_impact` (`placeholderSfx.ts`).
9. **Tests (Vitest).** Sweep: lane length and crash at the bus, a car, a building wall, rubble, sandbags, the map edge, and no crash in the open (10 m); barricades/turrets in the lane don't shorten it and are destroyed; charge telegraph 20 ticks; rush 0.6 m per tick; grace (2.14 m hit, 2.16 m missed, 0°–345° lanes step 15°); once per charge; shove sideways only, stops at a car; stun 40 ticks and × 1.5 from bullets, melee, flame, explosion, turret; no attack while stunned; throw aims at the farthest > 8 m, landing fixed (target moves 5 m: no hit), impact at start + 36, grace 2.74 / 2.76, through cover, no map change; one attack at a time (a throw in flight blocks a slam); pick order table; downed never hit; replay digest stable.

## Tasks / Subtasks

- [x] **T0 Art (from the picks; no new pick).** Poses `charge` (head down, arms back), `rush`, `throw` (chunk overhead), `stun` (from the 6.5 atlas, all four looks BH1–BH4); the chunk sprites (concrete/rebar, burnt-car panel, torn asphalt: 3 frames, from `docs/art/epic-6/looks.html` tells and the prototype's chunk polygon) and the crater decal, through `addGeneratedTexture`. The CRASH mark and lane arrows are drawn as in the tells section. (AC 8)
- [x] **T1 Balance** (AC 1): `charge` and `throw` blocks in `boss.json` + `bossSchema`, `crossCheck`, `config/balance.test.ts`.
- [x] **T2 Lane sweep + charge** (AC 2, 3; F1–F4, F6): `boss/charge.ts` (`sweepChargeLane`, `resolveRush` per tick, `chargeHitsPlayer` segment-distance test), building smash, zombie trample, shove via `knockPlayerBy` (6.5). Tests `boss/charge.test.ts`.
- [x] **T3 Stun** (AC 4; F5): `STUN` state in `updateBoss`, the × 1.5 in `applyBossDamage`, `boss.crashed`. Tests in `charge.test.ts` + the 6.5 damage table (× 1.5 rows).
- [x] **T4 Throw** (AC 5; F7, F8): `boss/throw.ts` (`pickThrowTarget`, `throwSource`, the FLIGHT record, `resolveThrowImpact`), the "unreachable" rule reading 6.5's boss field (`bossChase.front[flowCellAt(bossNav, x, y)] === FLOW_UNREACHED`). Tests `boss/throw.test.ts` (+ `obstacles.version`, `buildings.version` and nav hashes unchanged by a throw).
- [x] **T5 Pick order** (AC 6; F9): complete `pickBossAttack`; table test `boss/pickOrder.test.ts` (positions × cooldowns → expected kind).
- [x] **T6 Network + client** (AC 7, 8): schema fields, `syncState`, `BossStateView` / `BOSS_STATE_FIELDS`, `fakeRoom`, devThrottle, mirror, `netEvents` (+ round trips), `BossTelegraphView` lane/throw drawing, chunk flight, crater decals, CRASH mark, stun pose + banner, sounds. Tests: `bossTelegraph.test.ts` (+ lane geometry, CRASH only when `crash`, throw inner ring radius by progress), `NetSimHost.boss.test.ts` (+ a woken tab during the flight draws the ring but no lift).
- [x] **T7 Fuzz, netsim, perf** (brief 7, 9, 14, 16): `boss/behemoth.fuzz.test.ts` (extend 6.5's): random layouts × stages 3–5 × variants × ≥ 3,000 ticks with charges forced every cooldown: the boss centre never inside a map box (true radius) after a rush, never off the map, players never inside a box after a shove, no stall; liveness ≥ 1 crash, ≥ 1 clean charge, ≥ 1 throw hit, ≥ 1 building smashed. `tools/netsim/boss.test.ts` (extend): `?lag=150&jitter=20`, 10 charges and 10 throws at the bot: hits only inside the grace by the server position; shove predicted (0 corrections ≥ 1 m). Tick cost: a rush tick with 110 zombies + 24 buildings ≤ the 6.5 budget.
- [x] **T8 Gates.** Mutations (sweep ignores sandbags → crash table; segment test replaced by point test → tunnelling test; hit set not cleared per charge → once-per-charge test; throw aims at the live position → fixed-landing test; throw edits obstacles → F8 test; stun multiplier skipped for explosions → table) and which failed. Browser check: solo `?bosswave=1`, bait a charge into the bus (CRASH mark, stun, amber bar), get thrown at from 9 m and step out; online `?lag=150&jitter=20` two tabs. Screenshots at 568 × 320 and 800 × 360. `typecheck && lint && test && build`. Merge notes.

## Dev Notes

### Designer decisions to confirm (made non-interactively; recommended values)

1. **6.6 D1 — What it crashes into.** Anything on the map that stops bodies: cars, the bus, buildings, rubble, gas pumps, low walls, the dumpster, sandbags, police barriers, and the map edge. **Your barricades and turrets never stop it** (it smashes them). Alternative: only shot-stopping cover (cars, bus, buildings, rubble) crashes it; sandbags/barriers stop it without a stun. **Recommended: anything solid on the map crashes it** (one simple rule: "if the lane stops at something, it crashes").
2. **6.6 D2 — A charge destroys every player building it touches**, floor traps and mines included (a mine run over breaks without going off), with no refund. **Recommended: yes.**
3. **6.6 D3 — A charge tramples zombies in its way** (30 damage: small zombies die, no money). **Recommended: yes.**
4. **6.6 D4 — A throw also hurts zombies in its ring** (35 damage, no money). **Recommended: yes** (matches the slam, 6.5 D5).
5. **6.6 D5 — No hiding in alleys.** When you are where it can't walk (a 3 m alley), it may throw at you from 4.5 m instead of 8 m. Alternative: the 8 m minimum always (an alley 5–8 m from it is then safe from everything). **Recommended: 4.5 m when it can't reach you.**
6. **6.6 D6 — A crash is announced**: "CRASH!" banner 1.2 s for everyone, the boss bar flashes amber for the 2 s stun. **Recommended: yes.**
7. **6.6 D7 — What it throws** (looks only): a chunk of the nearest rubble pile or burnt car within 6 m, else it tears up the road. **Recommended: as proposed.**
8. **6.6 D8 — Craters and slam cracks stay until the next build phase** (at most 8 on the map; the oldest goes first). **Recommended: yes.**
9. **6.6 D9 — Charge numbers:** target 5–12 m away, 1.0 s warning, up to 10 m at 12 m/s, 30 damage + 2.5 m shove, 7 s cooldown; **throw numbers:** farthest player beyond 8 m, 1.0 s lift + 0.8 s flight, 3 m ring, 35 damage, 6 s cooldown. **Recommended: the prototype's values** (as tested in `behemoth-prototype.html`).

### Decisions (developer guidance)

- **DD1 The sweep uses `world.obstacles.solids` + the map edge only**, the same list bodies collide with; player buildings are not in it (smashed, F6). With the lane clear by construction, the rush moves the body without push-out (assert in the fuzz).
- **DD2 Sideways direction:** `perp = −(px − cx)·dirY + (py − cy)·dirX`; shove along `(−dirY, dirX) × sign(perp)`, `sign(0) = +1` (deterministic). Use `knockPlayerBy(p, p.x − sx, p.y − sy, shoveM, shoveS)` with a source point on the far side, or add a `knockPlayerDir(p, dx, dy, distM, durS)` variant (no trig either way).
- **DD3 Tunnelling:** test each player's centre against the segment from the boss's previous to its current centre this tick (distance to segment ≤ 2.15 m), plus the "inside drawn length" check.
- **DD4 FLIGHT is a field of the attack record, not a boss state**: the boss stands in RECOVER while the chunk flies (review L4: the recovery ends at impact + `throw.recoverS`, then the gap), and `pickBossAttack` requires no live attack (`attack.live`, cleared at impact).
- **DD5 Burnt cars**: `decay.fireSlots` (every ignite record, burning or out, at its target car's centre) — no new map data. Rubble boxes come from 6.2's accessor `map/obstacles.ts › rubblePiles(o, out)` (the active `rubble_pile_*` and `rubble_alley_*` boxes, allocation-free).
- **DD6 Lane on the wire:** direction as int8 × 127 (the knock pattern), length in cm. The client rebuilds the same rectangle.

### Current state (read before changing)

- Everything 6.5 adds (`boss/*`, `world.boss`, `startBossAttack`, `pickBossAttack` stub, `applyBossDamage`, boss schema, `BossTelegraphView`). Read 6.5's file list first.
- `map/obstacles.ts › ObstacleState.solids` (walls + active cover, rebuilt only at stage changes), `buildings/collision.ts › circleOverlapsBox`, `distanceToBox`.
- `buildings/buildings.ts › damageBuilding(world, b, amount)` (0 HP → `removeBuilding` + `building.destroyed`), `removeBuilding` (lets a bear trap's zombie go).
- `decay/decayState.ts › DecayState.fireSlots / fires`, `FireRecord`.
- `player/knockback.ts` (`knockPlayer`, 6.5's `knockPlayerBy`, `stepKnock`: push-out + fire edge).
- `zombies/flowField.ts › FLOW_UNREACHED`, `flowCellAt` (for the "unreachable" throw rule on the boss field).
- Prototype: `laneStop`, the `rush` case (`hitSet`, sideways shove), `updateThrown`, `drawTele` (lane + CRASH), the chunk flight in the draw loop.

### Must be preserved

6.5's fairness rules (one attack at a time now includes a throw in flight); zombie and Brute behaviour; buildings destroyed by the charge follow the same events/version path as any destruction (flow fields, mirrors, refund rules: none); no map change from a throw.

### Copies touched (brief 2)

World (`boss.attack` lane/landing/source/flight fields, STUN) → schema (`atkDirX/atkDirY/atkLen/atkCrash/atkSrc/atkSrcX/atkSrcY`) → `syncState` (+ reset) → `BossStateView` / `BOSS_STATE_FIELDS` → `fakeRoom` → devThrottle → mirror (`NetSimHost`) → Predictor (nothing new: the shove rides the existing knock fields) → `snapshotWorld` (attack fields, hit set as a bit mask per player slot).

### Beat the rule (for the reviewer; brief 4)

1. Stand 2.2 m from the lane's centre line: hit? (No.) At 2.1 m? (Yes.)
2. Run along the lane in front of the charge at 4.5 m/s: hit? (Yes once if you're still inside when it reaches you; then shoved out sideways, never carried.)
3. Bait it into the bus: always a crash with the mark? Into a barricade line: does it ever stop or crash at a barricade? (Never.)
4. Stand in the drawn lane behind the CRASH bar (the far side of a car): hit? (No: the lane ends at the car.)
5. Get shoved into a car fire: inside the fire? (No: stops at the edge.)
6. Hide behind a building from the throw: shielded? (No: F7.) Keep moving 1 m/s during the lift: hit? (Only if still inside 2.75 m of where you stood.)
7. A throw in flight while you stand next to it: does a slam start before impact? (No.)
8. Stand in a 3 m alley 6 m away: thrown at? (Yes, D5.) 4 m away? (Nothing reaches you: the slam ring is 4.5 m from its centre and you'd be inside it at 4 m: check you are hit by the slam when its centre can get within 4.25 m.)
9. Bait 5 charges into cover: the stun window never overlaps an attack.
10. Hidden tab across a charge: woken mid-rush, the lane drawn and filled; woken after the stop: nothing.
11. A charge through 6 mines and 4 traps: none goes off, all destroyed, no refund.

### Bandwidth (brief 11)

`boss.telegraph` grows to ~30 B for a charge/throw; ≤ 1 attack per ~2 s ≈ 15 B/s; `boss.crashed` / `boss.thrown_impact` ~12 B each; buildings destroyed by a charge use the existing `building.destroyed` (≤ 24 × ~15 B once). Boss schema +~14 B per attack. Negligible (< 50 B/s average).

### Phone FPS / Perf

No new pools beyond 6.5's (decals shared, ≤ 8; one chunk sprite; ≤ 2 telegraph graphics). The lane is one masked hatch quad. Server: the sweep is ≤ 100 steps × |solids| (~60) once per charge start (~6,000 box tests, < 0.1 ms); the rush tick tests ≤ 24 buildings + nearby zombies via the grid.

### Art

`docs/epic-6-decisions.md` › section 4 Behemoth (all four looks; tells as drawn: red + white hatching, dashed edge, hole for the body, **CRASH mark**), `docs/art/epic-6/looks.html` (tells section) and `ingame/tells-*.png`, the prototype's `drawTele` (lane, arrows, CRASH) and chunk polygon. CRASH in amber (colour rule: amber = something you can use). All through `addGeneratedTexture`.

### Dependencies

- **Waits for 6.5** (boss record, telegraph framework, damage helper, schema, views).
- **Reads 6.2's rubble** (as a map solid for the sweep and as a throw source); without 6.2 the sweep still works (rubble absent) and the source falls back to burnt cars / road.
- **6.7** extends the same files (enrage × 0.7 cooldowns/gaps, death clears a live attack): build 6.6 and 6.7 one after the other, not in parallel.

### Notes for the merge (brief 19)

- `boss/behemoth.ts`, `boss/telegraph.ts`, `boss/bossDamage.ts`: 6.5's files; 6.6 adds the CHARGE/THROW branches and STUN; 6.7 adds ROAR and the enraged multipliers. Keep the pick order in one function.
- `boss.json` / `bossSchema`: append `charge`, `throw` (6.7 appends `enrage`, `killPay`).
- Schema / stateView: append the `atk*` lane fields to the `boss` schema.
- `player/knockback.ts`: the sideways variant, if added, beside `knockPlayerBy`.
- `net/netEvents.ts`: two more kinds (next free at merge).
- `BossTelegraphView.ts` / `BossView.ts` / `placeholderSfx.ts`: append.

### Suggested build round

**Round 2** (`docs/epic-6-decisions.md` › Build rounds): right after 6.5 merges, alone on the boss files. In parallel with **6.4** (Collapse) and **6.8** (events framework: both touch `zombieAi.ts`/`flowField.ts`, merge one after the other). Not with 6.7 (same files; round 3).

### References

- `epics.md` › Story 6.6; FR34, FR53, FR84 (charge and throw telegraphs); designer D1 (crash stun only).
- `docs/ideas/epic-6/proposal.md` §1.3 (charge, throw rows), §1.5, §9 (sweep once at telegraph start; throws never change collision).
- `docs/ideas/epic-6/party-notes.md` (throw never changes collision; crash stun as the co-op hook).
- `docs/ideas/epic-6/behemoth-prototype.html` (`laneStop`, `rush`, `updateThrown`, `drawTele`).
- `docs/epic-5-decisions.md` › Alignment Q8 (throw ignores cover).
- Story files 6.5, 5.7 (knockback F2 rules), 3.5 (buildings destroyed → flow field), 4.8 (fires).

## Dev Agent Record

Merged story (designer 2026-11-24): **6.6 + 6.7 "Behemoth charge, throw, enrage and end"**, built and recorded as one story here; `6-7-enrage-and-the-end-of-the-behemoth.md` points to this record.

### Agent Model Used

Claude (claude-code builder session for Stories 6.6 + 6.7, cloud session; branch `story-6-6`).

### Debug Log References

- Full gate: see "Gate" below (branch merged with origin/master `eb3b991`).
- `PERF_ASSERT=1 tickCostBoss` (load 0.90): 6.5's walk/slam case base p99 0.689 ms → 0.541 ms with the boss; **rush ticks** (charges every cooldown, 110 zombies + 24 player buildings re-placed as smashed) p99 **0.796 ms** over 142 rush ticks / 9 charges vs 0.982 ms base (added ≤ 0: the charge sweep runs once per telegraph start; a rush tick tests ≤ 24 buildings and the zombie grid round its 0.6 m step).
- `bossBandwidth`: record ≤ 181 B/s, events 356 B/s (incl. `boss.thrown_impact`, the telegraph's 6 extra fields), total **≤ 538 B/s per client** (6.5: 557 B/s; the story estimate was < 50 B/s on top).
- Boss run sim (real 10-wave run, 4 god-mode bots, seeds 1–3): arrived 3/3, died 3/3, **52 throws, 3 roars, 27 Crawlers dropped, 3 killed, 150 × 4 paid in 3/3 runs**. The bots never stood 5–12 m in a clear lane, so 0 charges there; the charge liveness is the fuzz's (below).
- Fuzz (`boss/behemoth.fuzz.test.ts`, new block): 18 Downtown layouts × stages 1–3 × variant masks × 3,000 ticks, traps and mines added, slam parked so it charges and throws every cooldown, half the layouts start at 40 % HP (enraged), every third killed at t 2,000. Every tick: boss never in a map box (true radius) or off the map, no player in a box, ≤ 110 alive while it lives, every Crawler drop clear of boxes and > 1.5 m from standing players, no boss damage/attack after its death, boss grid walls unchanged; no 30 s without an attack. Liveness asserted: crashes, clean charges, charge hits, throw hits, buildings smashed, ≥ 9 roars, ≥ 3 drops, deaths. 6.5's own fuzz block now also accepts RUSH/STUN/ROAR and counts charge/throw hits as "reached".
- Netsim (`tools/netsim/boss.test.ts`, new block, `?lag=150&jitter=20` = 75 ± 10 ms each way, real `RunController` + client `Predictor`): **12 charges (6 hit / 6 missed), 12 throws (3 hit / 9 missed)**, every one decided by the newest server position (a charge hit only inside the 2.15 m band, and always when the boss passed the bot inside it; a throw hit exactly when the server centre was inside 2.75 m at the impact); **prediction snaps 0, 6 knock slides** (see Completion Notes: charge slide limit).
- Mutations (brief 9 / 6.6 T8 / 6.7 T7), each applied, the target test file run, reverted (script in the session scratchpad):
  - sweep ignores sandbags → `charge.test.ts` 1 failed (the solids table);
  - segment test → point test → **survived**: the body-reach rule (below) covers the same band — a point within 2.15 m of a 0.6 m segment is always within 2.4 m (body + survivor) of its end, so the overlap rule hits it the same tick. Kept both (belt and braces); the grace sweep fails when the body-reach rule is removed;
  - hit set not cleared per charge → 1 failed (new "next charge hits again");
  - throw aims at the live position → `throw.test.ts` 2 failed;
  - throw edits obstacles → 1 failed (F8);
  - stun multiplier skipped for explosions → 1 failed (× 1.5 table);
  - downed hit by the charge (`status === "out"` only) → **survived**: `damagePlayerBy` and `knockPlayerDir` refuse a non-alive player too (enforced twice, as 6.5's slam);
  - throw grace removed → 1 failed; a chunk in flight not blocking (live cleared at release) → 5 failed;
  - telegraph through `bossTicks` → `enrage.test.ts` F2 failed; enrage during an attack → F1 "never mid-attack" failed;
  - pay only standing players → `death.test.ts` F6 failed; attack not cancelled on death → F5 failed; cap stays 110 after death → 2 failed;
  - drops ignore the cap → F4 failed; drops ignore the 1.5 m clearance → F4 failed;
  - body-reach in the lane removed → the 2.14/2.16 m grace sweep failed.
- Browser check (headless Chromium, Vite on port 5791, stopped by PID; solo `?solo=1&bosswave=1`, scenes set up through the page's own `@topdown/shared` module): charge telegraph into the bus with the CRASH mark, the rush, the stun (amber bar flashing, amber "CRASH!" 1.2 s, survivor shoved sideways), throw lift / flight / crater, roar ("ENRAGED" red, bar red), a Crawler off its back, death ("EVAC INBOUND / +150 to everyone" amber, the bar empty and fading, the collapsed dark body staying). At 800 × 360, 568 × 320, and 800 × 360 `?blackout=5` (lane, CRASH mark and throw ring above the darkness, the boss outline + eyes over the lane). Screenshots: `docs/art/6-6/` (DPR 2, palette-quantised). Found and fixed while checking: the lane (above the darkness) covered the boss's own body — the body is redrawn above its lane/ring in the light (in the dark the outline frame is already above); the ENRAGED subtitle ran off a 800 px screen — banners are now short lines with a word-wrap guard.

### Completion Notes List

- **Shared sim (6.6 AC 1–6, 6.7 AC 1–6).** `boss.json` gains `charge`, `throw`, `enrage`, `killPay`, `death` (strict schema, `crossCheckBoss`: lane half-width > grace, `minLaneM ≤ distM`, `unreachableMinM ≤ minM`, one Crawler interval per player count; every `*S` whole ticks). New modules: `boss/charge.ts` (`sweepChargeLane` over `world.obstacles.solids` + the map edge — the generic solids list, so 6.2's rubble crashes it with no change; `rushStep`, `chargeHitsPoint`, building smash, zombie trample, sideways shove), `boss/throw.ts` (`pickThrowTarget`, `bossCantReach` (D5), `throwSource` (D7: `rubble*`-named solids or a lit/burned-out fire slot, else road), `releaseThrow`, `updateThrowFlight`), `boss/enrage.ts` (`checkEnrage`, `updateRoar`, `crawlerDropSpot`, `updateCrawlerDrops`), `boss/death.ts` (`killBoss`). `telegraph.ts`: `telegraphTicks` for all three kinds (throw = lift + flight: `hitTick` is the impact), `windupTicks`, `recoverTicks`, **`bossTicks`** (the only place the enraged × 0.7 applies, rounded once when a cooldown/gap is set), RUSH / STUN branches, `attack.live` (DD4: a chunk in flight blocks every other attack and the roar). `behemoth.ts`: the full pick order (slam → charge → throw → walk), initial cooldowns at arrival, the roar check first in WALK, enraged walk × 1.3. `bossDamage.ts`: × 1.5 in STUN; the death moved to `death.ts`. `mine.ts`: a rushing boss never sets a mine off (D2). `player/knockback.ts`: `knockPlayerDir` (DD2, sideways). `MONEY_REASONS` + `"boss"`.
- **Found while building (fairness, 6.6 F3):** with the body push-out (D1), a survivor 2.14 m from the line was pushed aside by the body a tick BEFORE this tick's travel segment came within 2.15 m of them — so they escaped a hit the drawn lane promised (the 15°-step grace sweep caught it). Rule added: a standing survivor the body overlaps while their centre is inside the 2.15 m band and the drawn length is hit at that moment (`bodyReachesInLane`). The rule as drawn is unchanged; the edge still never hits (2.16 m: pushed aside, no damage).
- **Lane geometry:** the drawn lane runs from the body's back at the start to its front at the stop (`lenM + 2 × radius`), 4.8 m wide; hits need the centre inside it less the 0.25 m grace at both ends. On the wire the stop point is sent exactly (`endX/endY` f32 in the event and schema) instead of the story's int8 direction + cm length (an int8 direction is up to 8 cm off at 10 m; +6 B per attack).
- **Throw source on the wire:** `src` (0 road, 1 rubble, 2 burnt car) + `srcX/srcY`; the chunk's look only.
- **6.7 behaviour:** roar only from WALK with no live attack (DD1), push 1.5 m within 5 m via the knockback, no damage, once; Crawlers every 8/6/5/4 s from 1 s after the roar in every state but DEAD, wave zombies (D1: in `remaining`, pay 3), skipped on a box/building/edge/standing player ≤ 1.5 m/110 alive; death cancels the live attack (telegraph, rush, chunk in flight), pays 150 to every player through `earn` (`"boss"`), emits `boss.killed { killerId, weapon, x, y, number }`; the cap is 150 again that tick (DEAD is not `bossActive`); the wave still has to be cleared (F7); the body stays (not solid) until the build start (6.5's reset in the boss system). Killer +1 kill: `RunController` (online Results) and `GameScene` (solo).
- **Network:** boss schema + `atkEndX, atkEndY, atkCrash, atkSrc, atkSrcX, atkSrcY` (stateView key list, fakeRoom, devThrottle via the key list, mirror). Events 50–54: `boss.crashed`, `boss.thrown_impact`, `boss.enraged`, `boss.crawler_dropped` (local at its spot), `boss.killed`; `boss.telegraph` carries the lane/landing/source fields. NetSimHost stamps `ageS` on the new events (a woken tab plays no late CRASH!/ENRAGED/sounds; EVAC INBOUND still shows once per Behemoth).
- **Predictor (6.6 brief 14 "shove predicted"):** the charge shove (2.5 m) plus the body's sideways push-out (up to 2.4 m) can put the server 3 m from the prediction by the time the client sees the knock; the 5.7 slide limit (2.5 m, sized for the Brute) snapped it. A knock with the charge's step (625 mm/tick) now slides in up to `PREDICTION_CHARGE_SNAP_M` 6 m, and while a seen knock is still sliding (`knockTicks > 0`) the running-offset limit is the knock's (it was 1 m, so a 0.15 m correction on top of a decaying 2 m slide snapped). Netsim: 0 snaps, 6 slides. Brute knocks keep 2.5 m.
- **Client:** `BossView` — the lane (baked hatched strip with arrows, cropped to the lane's length, red fill from the start tick, full through the rush, fading 0.3 s after the stop tick `chargeStopTick`), the CRASH mark (amber bar + word, at the stop's front), the throw ring (hatched disc without the body hole) + shrinking white inner ring + the chunk on a cosmetic arc (3 looks), craters in the shared decal pool (max 8, cleared at build start), the body redrawn above its own lane in the light, transient rings (roar 5 m, Crawler puff, crash dust), the collapse (3 frames over 1.5 s, dark tint, no eyes). `bossTelegraph.ts` pure helpers (tested): `chargeLaneLook`, `chargeStopTick`, `chargeLaneProgress`, `throwInnerRadius`, `throwChunkAt`, `deathFrameIndex`. `bossAtlas.ts`: 3 `dead_*` frames per look (4 × 16 frames ≤ 2048²), FX frames for 3 chunks, the crater, the CRASH mark; new textures `boss_tele_ring`, `boss_tele_lane` — all through `addGeneratedTexture`. `BossHud`: bar flashes amber while stunned, empties and fades over 2 s after the death. Banners: colour + duration on `hudModel` (`bannerColor`, `bannerShowMs`), word-wrap guard. Sounds: 8 placeholders. Rush sound on the state change.
- **No new look:** every drawing follows the picked tells (red + white hatching, dashed edge, CRASH mark in amber, skull, gold-notch bar, red when enraged); the collapse frames and chunks are built from the BH1–BH4 art and the prototype's chunk polygon. No designer question raised.
- **zombieAi.ts / flowField.ts untouched** (6.8 builds on them freely).
- **Edge marker (F9):** shows the attack's icon during its telegraph (6.5's marker; arrow = charge, rock = throw). Cooldowns aren't synced, so the client does not predict the *next* pick before it starts; `nextBossAttack` (shared, unused by the client yet) is there if the designer wants an earlier hint.

#### Gate

Full gate on `story-6-6` at `f46e0cb` (merged with origin/master `eb3b991`, after `npm ci`): `npm run typecheck` 0 errors, `npm run lint` clean, `npm test` **352 files / 3,309 tests passed** (3 skipped, 1 file skipped as before), `npm run build` OK. Load (`uptime`, 4 cores): 1.37 at the start, 1.50 when the tests started, 2.76 at the end. (The first two gate runs after the merge stopped at typecheck — test-file type errors — and at lint; both fixed, nothing else changed.)

#### Not verified

- Real phones (Mi 11i) and their FPS with the lane / ring / chunk (no device; headless only, not measured against `?stress=150` here: the new objects are 1 lane image + 2 graphics, 1 ring image + 1 graphics, 1 chunk, ≤ 8 decals shared with 6.5).
- An online two-tab browser run under `?lag=150&jitter=20` (no server run in a browser): covered by `tools/netsim/boss.test.ts` (charges, throws, predicted shove) and `NetSimHost.boss.test.ts` (late scene / woken tab mid-rush, after the stop, during the flight, across the roar and the death).
- A real hidden tab in a browser across a rush or the death (unit-tested only).
- Sounds by ear (placeholders; headless has no audio); the camera shake on the crash/impact/roar (code path only).
- A crash into 6.2's rubble in the browser (6.2 not on master; the sweep reads the generic solids list — unit-tested with a `rubble_*` box) and the rubble chunk look at a real pile.
- Bots never charge-baited in the 10-wave sim (0 charges there; charges are covered by the fuzz and unit tests).

#### Notes for the merge (brief 19)

- `boss/*` (6.5's files): `telegraph.ts` (kinds, `bossTicks`, `attack.live`, RUSH/STUN), `behemoth.ts` (pick order, roar check, initial cooldowns, enraged speed), `bossDamage.ts` (× 1.5, death moved out), `bossState.ts` (attack fields `crash/src/srcX/srcY/live/travelled/hitMask`, `crawlerTicks`, `BOSS_THROW_SRC`; snapshot includes them). New `charge.ts`, `throw.ts`, `enrage.ts`, `death.ts`. **6.11/6.12:** key the helicopter on "wave 10 cleared with the boss DEAD"; `resetBoss` keeps `number`; endless HP growth must not touch timers (`bossTicks` is the only multiplier).
- `config/balance/boss.json` / `balanceSchema.ts` / `balance.ts`: `charge`, `throw`, `enrage`, `killPay`, `death` appended; cross-checks appended.
- `core/simEvents.ts`: `MONEY_REASONS` + `"boss"` (index 5; **6.10 appends `"event"` after it**); five boss events; `boss.telegraph` gained `endX, endY, crash, src, srcX, srcY` (required fields).
- `net/netEvents.ts`: kinds **50–54** (`BOSS_CRASHED … BOSS_KILLED`); **6.8–6.11 take 55+** (renumber at merge if 6.8 took 50+ first — never reuse).
- `net/stateView.ts` / server `RunState.ts` / `syncState.ts` / client `fakeRoom.ts` / `mirrorBoss.ts`: six `atk*` fields appended to the boss record.
- `apps/server/src/net/eventInterest.ts`: `boss.crawler_dropped` local; the rest global.
- `apps/server/src/run/RunController.ts`: `boss.killed` +1 kill for the finisher (before the zombie-kill line).
- `player/knockback.ts`: `knockPlayerDir` beside `knockPlayerBy`. `buildings/mine.ts`: one line (no trigger by a rushing boss).
- `apps/client/src/net/prediction.ts` + `netConfig.ts`: `PREDICTION_CHARGE_SNAP_M` and the "keep the knock's limit while it slides" rule (affects the Brute's knock too: its running-offset limit is 2.5 m while `knockTicks > 0`).
- `NetSimHost.ts`: `ageS` for the five new events (one `else if` list).
- `GameScene.ts` / `HudScene.ts` / `hudModel.ts` / `BossHud.ts`: boss event list, `showBanner(text, color, ms)`, `bannerColor` / `bannerShowMs` / `bossStunned` / `bossBarAlpha` appended; the banner text gets `setWordWrapWidth(92 %)`. 6.8–6.11 can use the coloured banner (amber for events).
- `render/BossView.ts`, `bossTelegraph.ts`, `bossCue.ts`, `city/bossAtlas.ts` (frame indices `outline` 14 / `outlineEnraged` 15 now), `city/behemothArt.ts` (`dead` pose), `audio/placeholderSfx.ts` (8 keys).
- `bots/headlessRun.ts`: `earnedBy.boss`. `economy/tenWaveSim.test.ts` sums it and asserts 150 × 4. `waves/waveDirector.test.ts` (6.1's wave-10 rush test) sets `bossWaves = []`.
- 6.5 tests that assume a walking-only boss use `slamOnly(world)` (`boss/testBoss.ts`).
- (new) `docs/perf/epic-6-boss.md` (review M1)
- `docs/playtests/milestone-1/readability-sheet.md`: items **60–64** (the main session's split: 49 is 7.8's, 6.2+6.4 use 50–59, 6.6+6.7 use 60–69).
- **6.2:** rubble boxes named `rubble_*` in `obstacles.solids` crash the charge (no code here needed) and are the throw's "rubble" source by name prefix.

### File List

- `_bmad-output/implementation-artifacts/6-6-behemoth-charge-and-throw.md`
- `_bmad-output/implementation-artifacts/6-7-enrage-and-the-end-of-the-behemoth.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/client/src/audio/placeholderSfx.ts`
- `apps/client/src/net/fakeRoom.ts`
- `apps/client/src/net/mirrorBoss.ts`
- `apps/client/src/net/netConfig.ts`
- `apps/client/src/net/prediction.ts`
- `apps/client/src/render/BossView.ts`
- `apps/client/src/render/bossCue.test.ts`
- `apps/client/src/render/bossCue.ts`
- `apps/client/src/render/bossTelegraph.test.ts`
- `apps/client/src/render/bossTelegraph.ts`
- `apps/client/src/render/city/atlasLayout.test.ts`
- `apps/client/src/render/city/behemothArt.ts`
- `apps/client/src/render/city/bossAtlas.ts`
- `apps/client/src/scenes/BossHud.ts`
- `apps/client/src/scenes/GameScene.ts`
- `apps/client/src/scenes/HudScene.ts`
- `apps/client/src/scenes/hudModel.ts`
- `apps/client/src/sim/NetSimHost.boss.test.ts`
- `apps/client/src/sim/NetSimHost.ts`
- `apps/server/src/net/eventInterest.ts`
- `apps/server/src/rooms/schema/RunState.ts`
- `apps/server/src/rooms/schema/syncState.test.ts`
- `apps/server/src/rooms/schema/syncState.ts`
- `apps/server/src/run/RunController.ts`
- `apps/server/src/run/RunController.test.ts` (review L3)
- `apps/server/src/run/tickCostBoss.test.ts`
- (new) `docs/art/6-6/6-6-568x320-charge-telegraph.png`
- (new) `docs/art/6-6/6-6-568x320-crash-stun.png`
- (new) `docs/art/6-6/6-6-568x320-death.png`
- (new) `docs/art/6-6/6-6-568x320-throw-flight.png`
- (new) `docs/art/6-6/6-6-800x360-blackout5-charge-telegraph.png`
- (new) `docs/art/6-6/6-6-800x360-blackout5-corpse.png`
- (new) `docs/art/6-6/6-6-800x360-blackout5-throw-flight.png`
- (new) `docs/art/6-6/6-6-800x360-charge-telegraph.png`
- (new) `docs/art/6-6/6-6-800x360-corpse.png`
- (new) `docs/art/6-6/6-6-800x360-crash-stun.png`
- (new) `docs/art/6-6/6-6-800x360-death.png`
- (new) `docs/art/6-6/6-6-800x360-roar.png`
- (new) `docs/art/6-6/6-6-800x360-throw-crater.png`
- (new) `docs/art/6-6/6-6-800x360-throw-flight.png`
- (new) `docs/art/6-6/6-6-800x360-throw-lift.png`
- `docs/playtests/milestone-1/readability-sheet.md`
- `packages/shared/src/boss/behemoth.fuzz.test.ts`
- `packages/shared/src/boss/behemoth.test.ts`
- `packages/shared/src/boss/behemoth.ts`
- `packages/shared/src/boss/bossDamage.ts`
- `packages/shared/src/boss/bossPathing.test.ts`
- `packages/shared/src/boss/bossRunSim.test.ts`
- `packages/shared/src/boss/bossState.ts`
- (new) `packages/shared/src/boss/charge.test.ts`
- (new) `packages/shared/src/boss/charge.ts`
- (new) `packages/shared/src/boss/death.test.ts`
- (new) `packages/shared/src/boss/death.ts`
- (new) `packages/shared/src/boss/enrage.test.ts`
- (new) `packages/shared/src/boss/enrage.ts`
- `packages/shared/src/boss/telegraph.ts`
- `packages/shared/src/boss/testBoss.ts`
- (new) `packages/shared/src/boss/throw.test.ts`
- (new) `packages/shared/src/boss/throw.ts`
- `packages/shared/src/bots/headlessRun.ts`
- `packages/shared/src/buildings/mine.ts`
- `packages/shared/src/config/balance.test.ts`
- `packages/shared/src/config/balance.ts`
- `packages/shared/src/config/balance/boss.json`
- `packages/shared/src/config/balanceSchema.ts`
- `packages/shared/src/core/simEvents.ts`
- `packages/shared/src/economy/tenWaveSim.test.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/net/netEvents.test.ts`
- `packages/shared/src/net/netEvents.ts`
- `packages/shared/src/net/stateView.ts`
- `packages/shared/src/player/knockback.ts`
- `packages/shared/src/waves/waveDirector.test.ts`
- `tools/netsim/boss.test.ts`

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
- 2026-11-24: designer accepted every recommended decision ("ok, perfect"); status ready-for-dev.
- 2026-11-24: review fixes M1, L1–L4, N1, N2 (see Review fixes).
- 2026-11-24: merged with 6.7 (designer); built as one story (gds-dev-story, builder session `story-6-6`): charge, throw, stun, enrage, Crawler drops, death and pay; network, prediction, client drawing and HUD; fuzz, netsim, run sim, tick cost, mutations, browser check; merged master `eb3b991`; status → review.

## Senior Developer Review (AI)

Fresh-agent review (cloud session, branch `review-6-6`), 2026-11-24. **Reviewed commit `194d1d8`** (story-6-6 merged with master `eb3b991`), diff `eb3b991...194d1d8`. Method: gds-code-review layers (Blind Hunter, Edge Case Hunter, Acceptance Auditor) done inline, plus beat-the-rule exploit tests and mutations. No code was changed; the scratch exploit tests were deleted.

**Outcome: Approve with low findings.** No high findings. One medium, a process gap (brief 12). I found no exploit of brief 21 (a)–(g) or line 22.

### Gate (brief 1, 16)

`npm ci`, then `npm run typecheck && npm run lint && npm test && npm run build` at `194d1d8`: all green. Tests: **352 files / 3,309 passed** (3 skipped, 1 file skipped as before). Build OK. Load (`uptime`, 4 cores): **0.26 at the start → 2.99 at the end**. PERF_ASSERT was not re-run; the builder recorded load 0.90 (rush p99 0.796 ms).

### Findings

| # | Sev | Title | Where | Failure scenario | Suggested fix |
| --- | --- | --- | --- | --- | --- |
| M1 | medium (process) | Brief 12 `?stress=150` FPS before/after not measured | Dev Agent Record › Not verified | The lane strip, throw ring, chunk and shared decals were never run against the latest `docs/perf/` `?stress=150` floor. A phone regression from the lane's masked hatch above the darkness would go unseen until Mi 11i testing. | Run `?stress=150&bosswave=1` headless with a charge telegraph and a throw live. Record FPS before/after with load in `docs/perf/`. |
| L1 | low | Once-per-charge is skipped for a player without a slot | `packages/shared/src/boss/charge.ts:136-138` | `bossSlotOf` returns −1 for a player with no flame slot (more than 4 players, a dev room, or a slot claim that failed), so `bit = 0` and the mask check is skipped. **Reproduced:** a slot-less survivor held in the lane took **16 hits in one charge**. Not reachable with the room's 4-player cap. | `if (slot < 0) return;` (a player the boss can't track is never hit), or a cross-check `MAX_PLAYERS ≤ 31` plus a per-attack id list. |
| L2 | low | The Predictor tells a charge knock apart only by its step size; 20 Hz is a literal | `apps/client/src/net/prediction.ts:258-262` | `knockStepMm === round(shoveM·1000 / round(shoveS·20))`. Today: slam 500, Brute and roar 375, charge 625, so no clash. A balance edit (for example slam `pushM` 2.5) would quietly give that knock the 6 m slide limit. The literal `20` breaks brief 10 (use `ticksFor`). **Not exploitable:** the larger limit is client-side visual smoothing only. The server takes inputs, not positions, so a speed hack or teleport gains nothing. The Brute path is unchanged for new knocks (2.5 m); only its running total is now 2.5 m (was 1 m) for the 4 knock ticks, which is visual and acceptable. | Use `ticksFor(c.shoveS)`. Add a `crossCheckBoss` rule that the charge step differs from every other knock step, or send a knock-kind bit. |
| L3 | low | Four test gaps (mutations survived) | `enrage.test.ts`, `NetSimHost.boss.test.ts`, `RunController`, `bossState.ts:294` | See "Mutations" below: M19 roar hp drop, M21 crash `ageS`, M22 killer +1 kill, M24 `crawlerTicks` in the snapshot. Each survived, so a regression there would not be caught. | Assert `hp` unchanged after the roar. Assert that a woken tab after a crash plays no late CRASH!. Add a RunController test for `boss.killed` +1 kill (D5). Add a test that changing `crawlerTicks` changes the snapshot digest. |
| L4 | low (design note) | A throw's recovery and part of its gap run during the flight | `telegraph.ts:224-229`, `behemoth.ts` pick | The lift ends, then RECOVER 0.6 s, then the gap, all while the chunk flies 0.8 s. After the impact the next telegraph can start after gap − 0.2 s (enraged, 4 players: 1.05 → 0.85 s). Allowed by AC 5 and DD4, but brief 21(f) reads "attack, then recovery, then gap". Never two hits at once (`attack.live` blocks), and the next attack still has its full telegraph. | Ask the designer to confirm the AC 5 reading, or start the gap at the impact. |
| N1 | nit | Iterator allocation per WALK tick | `throw.ts:45` (`for … of world.players.values()`) | `pickThrowTarget` runs every WALK tick with the throw cooldown at 0. Same pattern as 6.5's `behemoth.ts:54/221`. | `forEach` with a module callback, as `rushStep` does. |
| N2 | nit | A zombie that slides under the body between rush ticks is never trampled | `charge.ts:210-215` | The "new overlap" test skips any zombie already inside the previous step's circle, including one that walked in sideways since (B1: zombies walk under it). This loses 30 trample damage; no fairness impact. | Keep a per-charge hit bit per zombie, or accept. |

### Beat the rule (brief 4): attempts and results

The story's list (each confirmed by a test that a mutation proved live):

1. 2.2 m off the line: no hit. 2.1 m: hit (grace sweep 0°–345°; M1 and M2 killed it).
2. Running ahead of the rush: hit once, shoved sideways, never carried (M17 killed it).
3. Baited into the bus: always a crash with the mark. Barricade line: never stops it, smashed (solids table; M16 killed it).
4. Behind the CRASH bar (far side of the bus): never hit (test "beyond the lane's end").
5. Shoved into a car fire: stops at the edge (knockback 5.7 F2, shove tested at a barricade face).
6. Behind a building from the throw: not shielded. Walking 1 m/s during the lift: hit only inside 2.75 m (M4 and M18 killed it).
7. Chunk in flight with a survivor in its face: no slam until the impact (M8 killed it).
8. Alley 6 m away: thrown at (M3 killed it).
9. Five baited crashes: the stun never overlaps an attack (only WALK picks; fuzz).
10. Hidden tab across a charge: covered by `NetSimHost.boss.test.ts` woken mid-rush and after the stop. A late CRASH! is not asserted (L3, M21).
11. Charge through mines and traps: none goes off, all destroyed, no refund (M15 killed it).

Mine (scratch tests, deleted):

- **X1 `bodyReachesInLane` outside the drawn lane?** 400 random lanes × 3 survivors anywhere in ±2.8 m × −1…12 m. Every hit had its pre-tick centre inside |perp| ≤ 2.15 m and inside the drawn length less the grace; never two hits per charge; many hits and many misses. **Not beaten.**
- **X1b hit twice / hit downed:** no for every slotted player (mask). Downed and out are refused in `hitPlayer`, `damagePlayerBy` and `knockPlayerDir`. **Beaten only without a slot (L1).**
- **X2 slot-less player:** 16 hits in one charge (L1).
- **X3 killed mid-rush:** the rush stops where it is, no later hits, cap 110 → 150 the same tick, 150 to both players. **Holds.**
- **X4 killed while the chunk flies:** no impact, no damage. **Holds.**
- **X5 Crawler drops at 109 alive for 400 ticks:** reached exactly 110, never more. **Holds** (brief 22).
- **X6 enraged charge telegraph:** same 20 ticks. **Holds** (21e; enrage.test F2 covers every kind).
- **X7 squeezed between the crashing boss and the bus face** (5 offsets): hit once, ends outside the body (4.2–4.6 m from its centre) and outside every box. **Holds.**
- **Predictor 6 m slide as a cheat:** not possible; the server is authoritative and the predictor only smooths the drawn offset (L2).

### Brief 21 / 22 (each checked)

- (a) The lane (`planCharge` and the sweep at the start), the stop point and the throw spot are all fixed in `startBossAttack`. `rushStep` moves from the fixed start, never accumulated. Holds.
- (b) `chargeLaneProgress` and `throwInnerRadius` are keyed on the server start/hit ticks. The ring reaches 0 at the impact; the lane is full at the hit and through the rush. The lane and ring are cleared on DEAD. Holds.
- (c) Grace of 0.25 m on lane width, both lane ends and the throw ring. Holds (X1, M1, M2, M4).
- (d) The newest server position; no rewind in charge.ts or throw.ts. Holds.
- (e) `telegraphTicks`, `windupTicks`, `recoverTicks` and the stun never call `bossTicks`. Holds (M5 killed).
- (f) `attack.live` blocks every pick and the roar until the impact or stop. Recovery, then gap (see L4 for the throw).
- (g) Every resolver, the throw pick and the charge target check `status === "alive"`. Holds.
- 22: `maxAliveNow` is 110 for WARNING…ROAR and 150 from DEAD on the same tick. Drops are capped at `aliveCap` and are wave zombies in `remaining` (M6 and M20 killed; X3, X5). The stampede +30 belongs to 6.8 (not merged; n/a).

### Acceptance and decisions audit

- 6.6 F1–F10 and AC 1–9: met. Wire change: the exact stop point (`atkEndX/Y` f32) replaces the int8 direction + cm length (documented; more exact, +6 B). Accepted.
- 6.7 F1–F7 and AC 1–8: met. AC 3's `"speed"` kind was not added to `bossTicks`; speed is multiplied in `walk` instead. That is fine, because telegraphs still never scale.
- D1–D9 (6.6): met. The CRASH mark is amber (colour rule). D5 reads the boss field (`bossCantReach`).
- D1–D8 (6.7): met. D4 pays every player in `world.players`; a player who has left the room is not paid, which is right.
- 6.5 B1–B3: unchanged. Zombies still walk under the body. The throw is B3's answer.
- Charge vs map solids is generic (`world.obstacles.solids`), so 6.2's rubble crashes it with no code. The throw's rubble look depends on the `rubble_*` names that 6.2's story uses; check this at the 6.2 merge.

### Brief lines 1–32

1 ✓ (gate green, git clean). 2 ✓ (copies listed: schema, syncState, stateView, fakeRoom, mirror, snapshot; Predictor knock limit). 3 ✓. 4 ✓ (above). 5 ✓ (slam and throw ignore cover; the charge stops at solids). 6 ✓ (resolve once; per-body hit mask). 7 ✓ (fuzz extended with liveness). 8 ✓ (no new RNG; digest test through charge, throw, roar, drops and death; L3 for `crawlerTicks`). 9 ✓ (24 mutations here, 20 killed). 10 ✓ apart from L2's literal 20. 11 ✓ (events, not per-tick state; ≤ 538 B/s boss total reported). 12 ✗ (M1: no `?stress=150` FPS). Atlas 4 × 16 frames ≤ 2048². 13 ✓ (readability items 60–64). 14 partial (netsim `?lag=150&jitter=20`; hidden tab unit-tested only, no browser). 15 ✓ (10-wave sim, 150 × 4). 16 ✓ (builder p99 at load 0.90). 17 ✓. 18 ✓ (`?bosswave`; not-verified list given). 19 ✓ (Notes for the merge). 20 ✓ (new textures through `addGeneratedTexture`; `noUnregisteredTextures` green). 21 ✓. 22 ✓. 23 n/a. 24 ✓ (lane, ring, chunk and crater above the darkness; screenshots at 568 and 800). 25 ✓ (craters ≤ 8; drops capped). 26 n/a. 27 ✓ (banner extended via hooks). 28 ✓ (death does not end the wave). 29 ✓. 30 n/a (no new edge input). 31 ✓ (no new pressable HUD; the banner wraps). 32 ✓ (decision log through 6.5 B1–B3 read; merged-tree commit reviewed).

### Mutations (brief 9; one per new test area, each reverted)

Killed (good): M1 charge grace removed · M2 `bodyReachesInLane` perp check removed · M3 D5 off · M4 throw grace removed · M5 `bossTicks` ignores enrage · M6 drops ignore the 110 cap · M7 pay only standing · M8 death leaves the attack live · M9 drawn lane `lenM + R` · M10 rush body push-out skipped · M11 `PREDICTION_CHARGE_SNAP_M` 2.5 (netsim) · M12 running-total limit back to snapM (netsim) · M13 `atkCrash` not synced · M14 stun × 1.5 off · M15 rush sets off mines · M16 sweep ignores the map edge · M17 hit mask ignored · M18 throw at the nearest · M20 drops not wave zombies · M23 rubble prefix wrong.

Survived (bad, see L3): M19 roar takes 10 hp directly (the tests only look for damage events) · M21 `boss.crashed` dropped from NetSimHost's `ageS` list · M22 RunController killer +1 kill removed (all `apps/server/src` tests pass) · M24 `crawlerTicks` dropped from `snapshotBoss` (the digest test compares two equal runs).

### Not verified by this review

Real phones, browser FPS, sound by ear, a real hidden tab, and an online two-tab run (same as the builder's list).

### Review fixes (builder, 2026-11-24)

All findings fixed on `story-6-6`. **Behaviour changes: L1, L2, L4** (and N2, trample only); for the re-reviewer.

| # | Fix | Behaviour change? | Test (mutation proof) |
| --- | --- | --- | --- |
| M1 | `?stress=150` headless FPS before (master `eb3b991`) / after, with the boss walking, charging back to back and throwing back to back, plus probes: `docs/perf/epic-6-boss.md`. Charges / throws cost −4 % / −8 % when they kill nothing (17.7 / 16.9 vs 18.4 fps); the ~20 % seen with kills on is the 528 zombie deaths per 20 s the forced attacks cause in the packed stress crowd (probes rule out the lane/ring drawing, sounds and the sim: 0.5 ms steps). | no | — |
| L1 | `charge.ts › hitPlayer`: a survivor without a slot gets a hit-mask bit after the `MAX_PLAYERS` slot bits, by its order in the World (`CHARGE_HIT_BITS` 31); past 31 it is never hit (the safe side). `crossCheckBoss`: `MAX_PLAYERS ≤ 31`. | yes (slot-less survivors: once per charge instead of every tick) | `charge.test.ts` "review L1: a survivor without a player slot … at most once per charge" (the old `bit = 0` path fails it: 1 failed) |
| L2 | `knockback.ts › knockStepMmOf` / `chargeKnockStepMm` (uses `ticksFor`, no literal 20); the Predictor calls it. `crossCheckBoss`: the charge shove's mm per tick must differ from the slam push, the roar push and every zombie type's knockback. | yes (only if balance changes: a clashing step is now refused at load) | `config/balance.test.ts`: slam `pushM` 2.5 (625 mm/tick) is refused (removing the rule fails it) |
| L3 | Four asserts: M19 the roar leaves every player's hp and the boss's hp unchanged; M21 a woken tab after a crash plays no late CRASH!/sound (`NetSimHost.boss.test.ts`); M22 `RunController` gives the finisher +1 kill, a killer-less death none (`RunController.test.ts`); M24 two worlds differing only in `crawlerTicks` have different digests (`death.test.ts`). | no | each of the four mutations now fails its test |
| L4 | `telegraph.ts`: a throw's RECOVER lasts until **impact + `throw.recoverS`** (the boss stands while the chunk flies), then the gap; `attack.live` still blocks. Story AC 5 and DD4 updated to say so. | yes (after a throw the next attack is up to 0.8 s later) | `throw.test.ts` "review L4 (brief 21f): … never before impact + recovery + gap (1–4 players, enraged or not)" + "recovers 0.6 s from the IMPACT" (the old timing fails both) |
| N1 | `pickThrowTarget`: a module callback through `players.forEach` (no iterator per WALK tick). | no | existing throw tests |
| N2 | Trample once per zombie per charge by a per-slot mark (`boss.trampleId` = attack id, `trampleGen` = the slot's generation; snapshotted, reset with the boss) against the swept capsule, so a zombie that walks in under the body between two steps is trampled too. Cheap: two typed arrays of 256. | yes (more zombies trampled; still once each) | `charge.test.ts` "review N2: a zombie that walks in under the body between two rush steps is trampled too — once per charge" (ignoring the mark fails 2 tests) |
