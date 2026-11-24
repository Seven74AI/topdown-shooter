# Story 6.7: Enrage and the end of the Behemoth

Status: ready-for-dev

## Story

As a team,
I want the Behemoth to get angrier when it's hurt, and its death to call the helicopter,
so that the last half of the fight is the hardest.

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
> Most relevant here: **21e (enrage never shortens a telegraph)**, 21f (the roar is not an attack; one thing at a time still holds), **22 (the cap returns to 150 the tick it dies; enrage Crawlers respect 110)**, 3/4 (fairness rules, beat them), 7 (Crawler drops never inside a box or on a player: fuzz), 8 (no new randomness: drop spot and timing are deterministic), 9 (enraged, ≥ 1 Crawler dropped, killed, 150 paid to everyone), 10 (× 0.7 applied in ticks, rounded once, numbers in `boss.json`), 14 (hidden tab across the roar and the death), 15 (kill pay in balance JSON), 28 (the death hands the run back to the wave flow; 6.11 adds the vote).

## Acceptance Criteria

### Fairness rules (player-visible; brief lines 3 and 21; each is tested)

- **F1 "The roar warns you, it doesn't hurt you."** The first tick its HP is **≤ 50 %** (`enrage.atHpFrac` 0.5) **and** it is walking (not in a telegraph, rush, stun or recovery), it roars for **1.5 s** (`enrage.roarS`, 30 ticks), standing still (free damage). At the roar's start every standing player within **5 m** of its centre (`enrage.roarRadiusM`) is pushed **1.5 m** straight away from it (`enrage.roarPushM`, over 0.2 s through the knockback: stops at cover and fire edges), with **no damage**. Banner "ENRAGED", the bar turns red, its eyes turn red. It enrages once per Behemoth.
- **F2 "The warning never gets shorter."** After the roar every telegraph keeps its exact length: slam 24 ticks, charge 20 ticks, throw lift 20 + flight 16 ticks (test against 6.5/6.6 values, enraged vs not).
- **F3 "Only its pace changes."** Enraged: walk speed **× 1.3** (1.3 → 1.69 m/s), every cooldown and every gap **× 0.7**, rounded to whole ticks once: gaps 39 / 31 / 25 / 21 ticks (1.96 / 1.54 / 1.26 / 1.05 s for 1–4 players), cooldowns slam 56 ticks (2.8 s), charge 98 (4.9 s), throw 84 (4.2 s). Recoveries, stun, damage, radii and lane sizes don't change.
- **F4 "Crawlers drop off its back, never on top of you."** While enraged, a Crawler appears every **8 / 6 / 5 / 4 s** (1–4 players, `enrage.crawlerEveryS`), first one 1 s after the roar ends, at the point **2.4 m behind its centre** (opposite its facing). A drop is skipped (the timer restarts) when that point's Crawler body would overlap a map box, a building or the map edge, when a standing player's centre is within **1.5 m** of it, or when **110** zombies are alive (brief 22). Drops stop the tick it dies.
- **F5 "A dead boss never hurts you."** On the tick it dies, its current attack is cancelled: a telegraph that has not resolved never hits, a rush stops, a thrown chunk in flight never lands (no damage, no crater), and its body stops blocking players and zombies.
- **F6 "Everyone gets paid."** The tick it dies every player in the run — standing, downed or out — earns **150** (`boss.killPay`, money reason `"boss"`), once.
- **F7 "The wave still has to be won."** Its death does not end wave 10: the remaining wave zombies (enrage Crawlers included) must still be cleared, the last-5 rush applies, and only then does the wave end (6.5 F11). The alive cap returns to **150** on the same tick (queued zombies spawn again).

### Behaviour

1. **Balance (`boss.json`, extends `bossSchema`):** `enrage { atHpFrac 0.5, roarS 1.5, roarRadiusM 5, roarPushM 1.5, roarPushS 0.2, speedMult 1.3, cooldownMult 0.7, gapMult 0.7, crawlerEveryS [8, 6, 5, 4], firstCrawlerS 1.0, crawlerBehindM 2.4, crawlerPlayerClearM 1.5 }`, `killPay 150`, `death { collapseS 1.5 }`. `crossCheck`: `0 < atHpFrac < 1`, mults in (0, 1] for cooldown/gap and ≥ 1 for speed, `crawlerEveryS.length === waves.playerCountScale.length`. `MONEY_REASONS` gains `"boss"` (+ its net encoding).
2. **Enrage** (`boss/enrage.ts`, called from `updateBoss`): in WALK, if `!enraged && hp ≤ maxHp × atHpFrac` → `state = ROAR` for 30 ticks, push standing players within 5 m (`knockPlayerBy`, no damage), emit `boss.enraged { x, y }`; at the end `enraged = true`, `crawlerTicks = ticksFor(firstCrawlerS)`, `gapTicks = round(gapS[n − 1] × 20 × gapMult)`, then WALK. A boss hurt below 50 % during an attack enrages when it next walks (after recovery, before the gap counts down: the roar replaces nothing, it delays the next pick by 1.5 s). The roar counts as "busy" for the one-attack rule (no attack starts during it).
3. **Enraged multipliers.** One function `bossTicks(world, seconds, kind: "cooldown" | "gap" | "speed")` in `boss/telegraph.ts` (6.5) applies `cooldownMult` / `gapMult` when `enraged` (rounded `Math.round` once, at the moment the cooldown/gap is set); telegraph, recovery and stun lengths never call it (F2, enforced by a test that greps the resolvers' tick sources via a table, and by the modifier sweep of 6.5 F6). Walk speed × `speedMult` in the boss's move step.
4. **Crawler drops** (AC F4): `crawlerTicks` counts down while enraged and alive, in every state including STUN (a crash can shake a Crawler loose); at 0: compute the behind point from `facing` (the only trig in the boss system is the facing → point, server-only, not predicted: allowed), check the skip rules with the Crawler's radius (`circleHitsBuilding`, map boxes, edge, players, `aliveCount ≥ maxAliveNow`), then `spawnZombie(world, "crawler", x, y, true)` — **a wave zombie** (D1: it joins `remaining` and pays the normal Crawler reward) — and `announceSpawn` as usual. `crawlerTicks = ticksFor(crawlerEveryS[n − 1])` either way. Emit `boss.crawler_dropped { x, y }` (local event: a thud + dust).
5. **Death** (`boss/death.ts › killBoss(world, killerId, weapon)`, called by `applyBossDamage` at HP ≤ 0, 6.5): `state = DEAD`, `hp = 0`, cancel the live attack (F5: `attack.kind = NONE`, no resolver runs), `stateTicks = 0`; every player in `world.players` earns `killPay` (`earn(world, id, 150, "boss")`); the killer's `kills` +1 (as a zombie kill); emit `boss.killed { killerId, weapon, x, y, number }`. `maxAliveNow` returns `waves.maxAlive` again from this tick (6.5 AC 4). `updateWaves`' cleared rule (6.5 F11) now passes once the remaining wave zombies are gone; until 6.11, that `endWave` follows today's path (Results when `waves.runWaves` is reached).
6. **After death.** The body is not solid (`bodyPushPlayers` skipped for DEAD), takes no damage, is not a target for aim assist or turrets, is excluded from every damage hook (6.5 AC 11 checks `state` alive). `resetBoss` at the next build start returns it to NONE (6.12's next Behemoth starts fresh, `number` kept).
7. **Network.** Boss schema: `enraged` (6.5 already has the field) and `state` DEAD; events (next free numbers at merge): `boss.enraged`, `boss.crawler_dropped` (local), `boss.killed` (global); `money.earned` with reason `"boss"`.
8. **Client.**
    - Roar: pose `roar` (head up, arms out), a shock ring 5 m, camera shake within 12 m (`prefers-reduced-motion`: none), banner **"ENRAGED"** (red) with subtitle "faster, shorter cooldowns, Crawlers off its back", the boss bar fill turns red, the 50 % notch stays gold; its eyes red in the outline/eyes frame (6.5 T0) drawn above the darkness (`aboveDarkness(obj, ABOVE_DARK.boss)`, 6.3).
    - Crawler drop: a short "slough" puff behind it + thud sound.
    - Death: pose sequence collapse (1.5 s, `death.collapseS`), dust, the body stays drawn (non-solid, dark) until the next build start; boss bar empties and fades after 2 s; banner **"EVAC INBOUND"** (amber) with subtitle "+150 to everyone" (and the killer's name if `killerId`); the boss music loop stops; the target skull and edge marker go.
    - Sounds: `boss_roar_enrage`, `boss_crawler_drop`, `boss_death` (`placeholderSfx.ts`).
9. **Supplies (Epic 7 note only).** The GDD's "Behemoth killed +50 Supplies" is meta-currency for Epic 7 (accounts); this story only emits `boss.killed`, which 7.x will count. No Supplies code here.
10. **Tests (Vitest).** Enrage at the first walking tick ≤ 50 % (not during a telegraph; after it); roar 30 ticks, push 1.5 m within 5 m, no damage, nobody outside 5 m moved; once only; F2 table (every telegraph length equal enraged vs not, 1–4 players); F3 numbers exactly (gaps 39/31/25/21, cooldowns 56/98/84, speed 1.69); Crawler interval per player count, first after 20 ticks, skipped on a box / near a player / at 110 alive, counted in `remaining`, rewarded 3; death cancels a pending slam, a rush and a chunk in flight (no damage after the death tick); 150 to every player incl. downed and out, exactly once; cap 110 → 150 on the death tick; the wave ends only when the rest is cleared; the dead body doesn't block; 10-wave sim (or `?bosswave=`) liveness: enraged, ≥ 1 Crawler dropped, killed, `boss.killed` paid.

## Tasks / Subtasks

- [ ] **T0 Art (from the picks; no new pick).** Poses `roar` and `death` (3–4 collapse frames) for all four looks BH1–BH4 in the 6.5 boss atlas; the enraged outline/eyes frame (red eyes); the roar shock ring and Crawler-drop puff as pooled particles (no new texture beyond a soft dust sprite already in `blastFxAtlas.ts` if reusable). All via `addGeneratedTexture`. (AC 8)
- [ ] **T1 Balance** (AC 1): `enrage`, `killPay`, `death` in `boss.json` + schema + `crossCheck`; `MONEY_REASONS` `"boss"` (+ `netEvents` encoding test).
- [ ] **T2 Enrage + multipliers** (AC 2, 3; F1–F3): `boss/enrage.ts`, `bossTicks` in `telegraph.ts`, speed in the move step. Tests `boss/enrage.test.ts`.
- [ ] **T3 Crawler drops** (AC 4; F4): in `enrage.ts`; uses `spawnZombie`, `announceSpawn`, `maxAliveNow`. Tests: interval table, skip rules, wave count, reward via the economy system.
- [ ] **T4 Death** (AC 5, 6; F5–F7): `boss/death.ts › killBoss`, attack cancel, pay, kills, `resetBoss` at build start (`startBuild` in `runStateMachine.ts` calls it next to `clearGrenades`). Tests `boss/death.test.ts` (+ a kill on the hit tick of a slam: the slam does not land — resolve order: damage from combat runs before the boss system in `SYSTEM_ORDER`, so a boss killed in `combat` never resolves; test both orders of a same-tick kill and hit tick).
- [ ] **T5 Network + client** (AC 7, 8): events + round trips, `eventInterest.ts` (crawler drop local), roar/death poses, banners, bar colours, music stop, skull/marker cleared. `NetSimHost.boss.test.ts` (+ a tab hidden across the roar and woken after the death: no "ENRAGED" banner late, "EVAC INBOUND" once — the `ageS` backlog rule of 5.7's banner).
- [ ] **T6 Fuzz, sims** (brief 7, 9): extend `boss/behemoth.fuzz.test.ts` with enraged phases (start enraged in half the seeds): Crawlers never spawn inside a box or within 1.5 m of a player, alive ≤ 110 while the boss lives, no stall; liveness ≥ 1 roar, ≥ 3 drops, ≥ 1 death. 10-wave sim (6.1) or the 6-wave sim with `?bosswave`: the boss died, every player got 150, the wave ended after the rest was cleared, Results reached.
- [ ] **T7 Gates.** Mutations (telegraph through `bossTicks` → F2 test; enrage during an attack → F1 test; pay only standing players → F6 test; attack not cancelled on death → F5 test; cap stays 110 after death → F7 test; drops ignore the cap → F4 test) and which failed. Browser check: solo `?bosswave=1&bosshp=0.2` to see the roar and the death quickly; online two tabs `?lag=150&jitter=20`, one hidden across the death. `typecheck && lint && test && build`. Merge notes.

## Dev Notes

### Designer decisions to confirm (made non-interactively; recommended values)

1. **6.7 D1 — Enrage Crawlers belong to the wave**: they must be killed before the helicopter can come and pay the normal Crawler money (3). Alternative: extras that don't count and vanish when the boss dies. **Recommended: they count.**
2. **6.7 D2 — The roar pushes everyone within 5 m out by 1.5 m, with no damage**, and the Behemoth stands still for 1.5 s (free damage). **Recommended: as proposed.**
3. **6.7 D3 — An attack already started when it dies is cancelled** (no slam, charge or thrown chunk lands after its death). **Recommended: yes.**
4. **6.7 D4 — The 150 goes to every player, including downed and out ones.** Alternative: standing players only. **Recommended: everyone** (it's a team win).
5. **6.7 D5 — The "EVAC INBOUND" banner names who finished it** ("Sam finished it · +150 to everyone") and that player gets +1 kill on Results. **Recommended: yes.**
6. **6.7 D6 — Its body collapses (1.5 s) and stays on the street, not solid, until the build phase.** Alternative: it fades out at once. **Recommended: it stays** (the trophy).
7. **6.7 D7 — Enraged pace:** 30 % faster, cooldowns and gaps 30 % shorter, a Crawler every 8 / 6 / 5 / 4 s (1–4 players). **Recommended: as proposed** (prototype values).
8. **6.7 D8 — The boss music stops when it dies** and the normal wave sound carries on until the wave is cleared. **Recommended: yes.**

### Decisions (developer guidance)

- **DD1 Enrage is checked only in WALK.** "Not mid-attack" (epics AC) means: the roar never interrupts a telegraph, a rush, a stun or a recovery. A boss dropped below 50 % by a crash-stun burst roars right after the stun ends.
- **DD2 Multipliers applied when a timer is set, never per tick** (`Math.round(seconds × TICK_RATE_HZ × mult)`); a cooldown set before the enrage keeps its old length (it was promised already; test).
- **DD3 Kill order in a tick.** `SYSTEM_ORDER`: combat (players' shots) → zombies → boss → waves. A boss killed in `combat` is DEAD before `updateBoss` runs: its hit tick never resolves (F5). A boss killed by a turret (`buildings` slot, before combat) likewise. A Bloater blast processed in the `zombies` slot that kills it: same. So `updateBoss` starts with `if (state === DEAD) return`.
- **DD4 Pay through `earn()`** (the economy's single path, `money.earned` events), reason `"boss"`; not through `payKill` (that is per zombie type and assists).
- **DD5 The drop point uses `Math.cos/sin(facing)`** — server/solo only (the boss system is never predicted); positions are written to the pool like any spawn. Deterministic (no stream draw).
- **DD6 `resetBoss` at build start** keeps `number` and the previous `look` (6.12: never the same look twice in a row, 6.5 D7).

### Current state (read before changing)

- Everything 6.5 and 6.6 add (`boss/behemoth.ts`, `telegraph.ts`, `bossDamage.ts`, `charge.ts`, `throw.ts`, boss schema, views). Read both stories' file lists first.
- `zombies/zombiePool.ts › spawnZombie(world, type, x, y, waveZombie)`, `zombies/brute.ts › announceSpawn`.
- `waves/waveDirector.ts › updateWaves` (`remaining = waveZombiesAlive + queued`: a wave-zombie Crawler extends it automatically), 6.5's `maxAliveNow`.
- `economy/economy.ts › earn(world, playerId, amount, reason)`, `core/simEvents.ts › MONEY_REASONS = ["kill","assist","revive","wave","refund"]`.
- `run/runStateMachine.ts › startBuild` (where per-wave state is cleared: `clearGrenades`, `clearMolotovZones`, `clearBlasts` …: add `resetBoss`), `endWave` (Results at `runWaves` until 6.1/6.11 change it).
- `buildings/collision.ts › circleHitsBuilding`, `circleOverlapsBox`; `player/knockback.ts › knockPlayerBy` (6.5).
- Client: 6.5's `BossView`, boss bar in `HudScene`, `GameScene` banners (`showBanner`, `stackBanner`; 5.7's `ageS` rule for a woken tab), `audio/ambience.ts` boss loop.
- Prototype: `updateBoss` `roar` case and `walk` enrage check, `killBoss`, `spawnCrawler`, `cdMult`, `gapNow`.

### Must be preserved

6.5/6.6 rules (telegraph lengths, grace, one attack at a time); the wave's last-5 rule and wave-clear bonus; Results flow for a wave-10 win until 6.11; Crawler stats and reward unchanged; no money paid twice (one `boss.killed` per Behemoth even when several damage sources hit in the killing tick).

### Copies touched (brief 2)

World (`boss.enraged`, `crawlerTicks`, ROAR/DEAD, `resetBoss`) → schema (`enraged`, `state`) → `syncState` (+ reset) → `BossStateView` → `fakeRoom` → devThrottle → mirror (`NetSimHost`) → Predictor (the roar push rides the knock fields; DEAD body not solid in `movePlayers`) → `snapshotWorld` (enrage fields, crawler clock). `MONEY_REASONS` (+ net encoding) and the economy's reason mapping in the client HUD (money toasts).

### Beat the rule (for the reviewer; brief 4)

1. Stack damage to cross 50 % mid-slam: does it roar mid-telegraph? (No: after.) Does the roar ever overlap an attack? (No.)
2. Stand 4.9 m away at the roar: pushed? (Yes, 1.5 m, no damage.) 5.1 m: no.
3. Compare telegraph lengths before/after enrage with a frame counter: equal?
4. Stand right behind it while enraged: does a Crawler spawn on you? (Skipped within 1.5 m.) Back it against a wall: Crawler inside the wall? (Skipped.)
5. Kill it with a grenade while a throw is in flight: does the chunk land? (No.) Kill it on its slam's hit tick: does the slam land? (No.)
6. Be downed when it dies: paid? (Yes, 150.) Leave and rejoin? (Rejoin happens at a build start: you missed it; fine.)
7. Kill everything else first, then the boss: does the wave end at once with no zombies left? (Yes, the next tick: F7 with nothing remaining.) Leave the enrage Crawlers alive: wave stuck until they die (intended); do they rush (last-5)?
8. Hidden tab across the death: "EVAC INBOUND" once, no late "ENRAGED".
9. At 110 alive while enraged: no drop, the timer restarts; does the 111th ever appear? (Never.)

### Bandwidth (brief 11)

`boss.enraged` and `boss.killed` once per fight (~12–16 B), `boss.crawler_dropped` local ≤ 1 per 4 s (~8 B), `money.earned` × players once; a Crawler is one horde record like any other. Negligible.

### Phone FPS / Perf

Two more poses in the existing boss atlas; the roar ring and drop puff reuse the pooled particle FX; the corpse is the same sprite (no new texture). Server: the enrage check and the drop are O(1) per tick plus one `circleHitsBuilding`.

### Art

`docs/epic-6-decisions.md` › section 4 Behemoth (all four looks, boss bar with the gold 50 % notch, red eyes when enraged); `docs/art/epic-6/looks.html` (`drawBehemothG` `roar` pose; the boss bar in the tells section); prototype `drawBehemoth` (`roar`, `stun`). "ENRAGED" in red (boss danger), "EVAC INBOUND" in amber (something good coming: colour rule). Through `addGeneratedTexture`.

### Dependencies

- **Waits for 6.5 and 6.6** (same files). Build after 6.6 merges.
- **6.11** (vote) listens to the end of wave 10 after `boss.killed`; until it merges, Results show as today. 6.11 should key the helicopter on "wave 10 cleared with the boss DEAD", not on `boss.killed` alone (merge note for 6.11).
- **6.12** reuses `resetBoss`, `number`, the look no-repeat rule and the HP multiplier per endless Behemoth.
- **6.3**: red eyes in the outline frame drawn with `aboveDarkness(obj, ABOVE_DARK.boss)`.
- **Epic 7**: `boss.killed` feeds the +50 Supplies later (no code here).

### Notes for the merge (brief 19)

- `boss/telegraph.ts`: `bossTicks` is the only place multipliers are applied; 6.12's endless HP growth must not touch timers.
- `boss/behemoth.ts`: ROAR and DEAD branches; `updateBoss` returns early on DEAD.
- `core/simEvents.ts › MONEY_REASONS`: append `"boss"` (append-only, index on the wire); 6.10 appends `"event"` (survivor bonus); 6.9's gas-leak kills pay through the normal `"kill"` reason (no new entry): append in merge order.
- `run/runStateMachine.ts › startBuild`: `resetBoss(world)` beside the other clears; 6.11 and 6.12 change `endWave` (no conflict with this line).
- `net/netEvents.ts`: three kinds (next free at merge).
- `GameScene.ts` / `HudScene.ts`: banners + bar colour; `ambience.ts`: stop the boss loop.

### Suggested build round

**Round 3: after 6.6** (`docs/epic-6-decisions.md` › Build rounds). In parallel with **6.9**, **6.10** (events) and **6.11** (it merges after this story; it is written to wait for "wave 10 cleared" and can be built against a dev "boss dead" cheat). Not with 6.5/6.6 (same files).

### References

- `epics.md` › Story 6.7; FR35, FR36.
- `docs/ideas/epic-6/proposal.md` §1.4 (enrage), §1.1 (kill pay 150, `boss.killed` → "Evac inbound"), §1.5 rule 5, §9; designer D6 (cap 110 ↔ 150).
- `docs/ideas/epic-6/party-notes.md` round 3 (two phases, roar, Crawler interval per player count).
- `docs/ideas/epic-6/behemoth-prototype.html` (`roar`, `killBoss`, `spawnCrawler`, `cdMult`, `gapNow`).
- GDD › Enemy Wave Design (enrage), Progression (Supplies +50: Epic 7).
- Story files 6.5, 6.6, 5.7 (`announceSpawn`, banner `ageS` rule), 3.2 (economy `earn`).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
- 2026-11-24: designer accepted every recommended decision ("ok, perfect"); status ready-for-dev.
