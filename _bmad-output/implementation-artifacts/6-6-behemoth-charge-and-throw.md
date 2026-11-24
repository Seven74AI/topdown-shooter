# Story 6.6: Behemoth charge and throw

Status: drafted (ready-for-dev once the designer confirms docs/epic-6-decisions.md › Story decisions to confirm)

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
5. **Throw** (`boss/throw.ts`, kind THROW): picked when slam and charge were not, its cooldown is 0 and a standing player's centre is **more than 8 m** from the boss (or more than `unreachableMinM` 4.5 m when the boss's field cannot reach that player: 6.5 T3, D5). The farthest such player's position at the start is the landing spot (fixed). The **source** (visual only, D7): the nearest 6.2 rubble pile or burnt car (a `decay.fireSlots` record, burning or out) whose box is within `sourceRangeM` 6 m of the boss's body edge, else the road; sent as `src` (0 road, 1 rubble, 2 burnt car) + `srcX, srcY`. Lift 1.0 s = 20 ticks (boss stands, arms raised with the chunk), then the attack record moves to `FLIGHT` for 0.8 s = 16 ticks while the boss is in `RECOVER` (0.6 s) and then its gap; **a new attack cannot start until the impact** (6.5 F5: one attack at a time). At impact (`hitTick` = start + 36): every standing player with centre within 2.75 m takes 35 (`"boss"`, through cover), every zombie centre within 3 m takes `zombieDamage` 35 (killer null), `boss.thrown_impact { attackId, x, y }` (crater decal + dust + shake within 8 m). No change to `world.obstacles`, `world.buildings` or the nav grids (F8, asserted by a version check in the test). Cooldown 6 s from the release (an explicit exception to 6.5's "cooldown starts at the hit tick": a throw's hit tick is its impact, 0.8 s after the release).
6. **Pick order** (`behemoth.ts › pickBossAttack`, completes 6.5's stub): when `state === WALK`, `gapTicks === 0` and no attack record is live: (1) slam if its cooldown is 0 and any standing player is within 4 m; (2) charge if its cooldown is 0, the target is 5–12 m away and the lane is ≥ 4 m; (3) throw if its cooldown is 0 and a player qualifies (AC 5); (4) otherwise walk (and try again next tick). Initial cooldowns at arrival: charge 2 s, throw 3 s (slam 0).
7. **Network.** The boss schema (6.5) gains the lane/landing fields of the current attack: `atkDirX i8, atkDirY i8` (unit × 127, like the knock fields), `atkLen u16` (cm), `atkCrash bool`, `atkSrc u8, atkSrcX f32, atkSrcY f32` — so a late or woken client draws the running telegraph. New events (next free numbers at merge): `boss.crashed`, `boss.thrown_impact`; `boss.telegraph` carries the charge/throw fields (round-trip tests). All global.
8. **Client.**
    - Charge lane (`BossTelegraphView`): hatched red rectangle 4.8 m wide from the boss to `lenM + 2 m` (its body front), white arrows along it, fill grows from the boss by progress (start-tick keyed, 6.5 `telegraphProgress`), during the rush the lane stays fully filled until the stop, then fades 0.3 s. **CRASH** mark: an amber bar across the lane end + the word "CRASH" (amber = an event you can use: the stun is your window; colour rule brief 24).
    - Throw: hatched 3 m ring at the landing spot + a white inner ring shrinking from 3 m to 0 over lift + flight; the chunk drawn lifted over the boss's head during the lift (pose `throw`), then flying in an arc (cosmetic, 0.8 s) from the boss to the spot; crater decal at impact (pool shared with 6.5's crack decals, `caps.maxDecals` 8). The throw ring is under the target, so it is always on that player's screen. Lane, CRASH mark, rings, chunk and crater draw above the darkness with `aboveDarkness(obj, ABOVE_DARK.telegraph)` (6.3's `render/darkness/aboveDark.ts`; the chunk and crater too, so a blackout throw is readable).
    - Stun: pose `stun` (head lolling, dust ring), a "CRASH!" banner 1.2 s for everyone, the boss bar flashes amber while stunned.
    - Sounds: `boss_charge_scrape` (telegraph), `boss_charge_rush`, `boss_crash`, `boss_throw_lift`, `boss_throw_impact` (`placeholderSfx.ts`).
9. **Tests (Vitest).** Sweep: lane length and crash at the bus, a car, a building wall, rubble, sandbags, the map edge, and no crash in the open (10 m); barricades/turrets in the lane don't shorten it and are destroyed; charge telegraph 20 ticks; rush 0.6 m per tick; grace (2.14 m hit, 2.16 m missed, 0°–345° lanes step 15°); once per charge; shove sideways only, stops at a car; stun 40 ticks and × 1.5 from bullets, melee, flame, explosion, turret; no attack while stunned; throw aims at the farthest > 8 m, landing fixed (target moves 5 m: no hit), impact at start + 36, grace 2.74 / 2.76, through cover, no map change; one attack at a time (a throw in flight blocks a slam); pick order table; downed never hit; replay digest stable.

## Tasks / Subtasks

- [ ] **T0 Art (from the picks; no new pick).** Poses `charge` (head down, arms back), `rush`, `throw` (chunk overhead), `stun` (from the 6.5 atlas, all four looks BH1–BH4); the chunk sprites (concrete/rebar, burnt-car panel, torn asphalt: 3 frames, from `docs/art/epic-6/looks.html` tells and the prototype's chunk polygon) and the crater decal, through `addGeneratedTexture`. The CRASH mark and lane arrows are drawn as in the tells section. (AC 8)
- [ ] **T1 Balance** (AC 1): `charge` and `throw` blocks in `boss.json` + `bossSchema`, `crossCheck`, `config/balance.test.ts`.
- [ ] **T2 Lane sweep + charge** (AC 2, 3; F1–F4, F6): `boss/charge.ts` (`sweepChargeLane`, `resolveRush` per tick, `chargeHitsPlayer` segment-distance test), building smash, zombie trample, shove via `knockPlayerBy` (6.5). Tests `boss/charge.test.ts`.
- [ ] **T3 Stun** (AC 4; F5): `STUN` state in `updateBoss`, the × 1.5 in `applyBossDamage`, `boss.crashed`. Tests in `charge.test.ts` + the 6.5 damage table (× 1.5 rows).
- [ ] **T4 Throw** (AC 5; F7, F8): `boss/throw.ts` (`pickThrowTarget`, `throwSource`, the FLIGHT record, `resolveThrowImpact`), the "unreachable" rule reading 6.5's boss field (`bossChase.front[flowCellAt(bossNav, x, y)] === FLOW_UNREACHED`). Tests `boss/throw.test.ts` (+ `obstacles.version`, `buildings.version` and nav hashes unchanged by a throw).
- [ ] **T5 Pick order** (AC 6; F9): complete `pickBossAttack`; table test `boss/pickOrder.test.ts` (positions × cooldowns → expected kind).
- [ ] **T6 Network + client** (AC 7, 8): schema fields, `syncState`, `BossStateView` / `BOSS_STATE_FIELDS`, `fakeRoom`, devThrottle, mirror, `netEvents` (+ round trips), `BossTelegraphView` lane/throw drawing, chunk flight, crater decals, CRASH mark, stun pose + banner, sounds. Tests: `bossTelegraph.test.ts` (+ lane geometry, CRASH only when `crash`, throw inner ring radius by progress), `NetSimHost.boss.test.ts` (+ a woken tab during the flight draws the ring but no lift).
- [ ] **T7 Fuzz, netsim, perf** (brief 7, 9, 14, 16): `boss/behemoth.fuzz.test.ts` (extend 6.5's): random layouts × stages 3–5 × variants × ≥ 3,000 ticks with charges forced every cooldown: the boss centre never inside a map box (true radius) after a rush, never off the map, players never inside a box after a shove, no stall; liveness ≥ 1 crash, ≥ 1 clean charge, ≥ 1 throw hit, ≥ 1 building smashed. `tools/netsim/boss.test.ts` (extend): `?lag=150&jitter=20`, 10 charges and 10 throws at the bot: hits only inside the grace by the server position; shove predicted (0 corrections ≥ 1 m). Tick cost: a rush tick with 110 zombies + 24 buildings ≤ the 6.5 budget.
- [ ] **T8 Gates.** Mutations (sweep ignores sandbags → crash table; segment test replaced by point test → tunnelling test; hit set not cleared per charge → once-per-charge test; throw aims at the live position → fixed-landing test; throw edits obstacles → F8 test; stun multiplier skipped for explosions → table) and which failed. Browser check: solo `?bosswave=1`, bait a charge into the bus (CRASH mark, stun, amber bar), get thrown at from 9 m and step out; online `?lag=150&jitter=20` two tabs. Screenshots at 568 × 320 and 800 × 360. `typecheck && lint && test && build`. Merge notes.

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
- **DD4 FLIGHT is a field of the attack record, not a boss state**: the boss can be in RECOVER / WALK while the chunk flies, but `pickBossAttack` requires `attack.kind === NONE` (cleared at impact).
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

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
