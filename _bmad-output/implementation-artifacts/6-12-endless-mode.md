# Story 6.12: Endless mode

Status: drafted (ready-for-dev once the designer confirms docs/epic-6-decisions.md › Story decisions to confirm)

## Story

As a team,
I want to keep fighting in the collapsed city after wave 10,
so that we can push our luck for more rewards.

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

Most relevant here: **25 (endless performance: nothing grows without a cap over 20+ waves; a 20-wave endless sim records tick p99 and memory)**, **22 (cap 110 while each endless Behemoth lives)**, 21 (endless Behemoths keep the same telegraphs), 23 (one event per even wave, from the `events` stream), 26 (blackout on odd waves is light state, server truth), 28 (one run flow: vote → endless → vote … → Results, "Lost in the city" on a wipe), 8 (event and look picks from named streams), 9 (the sim proves the endless waves really ran), 10 (every endless number in `waves.json › endless`).

## Acceptance Criteria

### Fairness rules (player-visible; brief line 3; each is tested)

- **F1 "Endless grows by numbers you can count."** Wave N ≥ 11 has `min(N × 40, 600)` zombies at 4 players (wave 11 = 440, wave 15 = 600, wave 16+ = 600), × 0.4 / 0.6 / 0.8 / 1.0 for 1–4 players (solo wave 15+ = 240). Never more than 150 alive (110 while a Behemoth lives).
- **F2 "Past wave 15 zombies get tougher by a fixed step, nothing else does."** From wave 16, every zombie that spawns in wave N has `1 + 0.06 × (N − 15)` times its normal HP (wave 16 = +6 %, wave 20 = +30 %, wave 25 = +60 %). Speed, damage and money per kill never change (FR68, designer D3). The Behemoth uses its own growth (F4), not this one.
- **F3 "One more Brute each wave, never more than 6 at once."** Wave N ≥ 11 has `N − 8` Brutes (wave 11 = 3, wave 14 = 6, wave 20 = 12), not scaled by party size; at most **6 Brutes alive at once** — the next one waits until one dies (6.12 D2). They are spread through the wave (between 25 % and 90 % of it), never in the opening burst.
- **F4 "Every 5th wave brings a Behemoth that is tougher each time, but fights the same."** Waves 15, 20, 25… each have one Behemoth (Story 6.5's arrival at 50 % of the wave) with `6,000 × (1 + 0.25 × k)` HP × the party-size table, k = 1, 2, 3… (wave 15 ×1.25, wave 20 ×1.5, wave 25 ×1.75). Its telegraph lengths, zone sizes, damage and gaps are exactly the wave-10 ones (brief 21e; test). After that wave is cleared, a new evacuation vote opens (Story 6.11).
- **F5 "Odd waves are pitch black, even waves are dark."** The map stays at stage 5 (Collapse) with fog in every wave. Waves 11, 13, 15… are blackout waves at the 5 % pitch darkness (designer pick: every endless blackout = BL3 5 %); even waves are half-dark like a stage-5 build phase (6.12 D3).
- **F6 "Even waves without a Behemoth have one event, announced as always."** Waves 12, 14, 16, 18, 22, 24… each run one special event that fits (Story 6.8's gates and announce rules; brief 23), never the same event as the previous endless event (6.12 D4).
- **F7 "Wiping in endless costs what you earned after wave 10, nothing before."** A team wipe after choosing Stay ends the run with Results **"Lost in the city"**; the run records each player's earnings up to the end of wave 10 and after it, and marks the after-10 part as lost (Supplies use it in Epic 7). Extracting at a later vote keeps everything ("Extracted").

### Behaviour

1. **Balance (`waves.json › endless`, new block):** `maxZombiesPerWave` 600 (at 4 players, before the party-size scale), `hpGrowthFromWave` 15, `hpGrowthPerWave` 0.06 (linear), `brutesFirstWave` 11, `brutesAtFirstWave` 3, `brutesPerWave` 1, `brutesMaxAlive` 6, `bruteFromFraction` 0.25, `bruteToFraction` 0.9, `bossEveryWaves` 5, `bossHpGrowthPerBoss` 0.25, `blackoutOddWaves` true, `evenWaveDarkness` "half", `eventEvenWaves` true, `oddWaveMix` 9, `evenWaveMix` 10 (6.12 D5: the wave whose `mix` entry each endless wave reuses). `waves.json › evac.everyWaves` 5 (Story 6.11's block). Loader: `maxZombiesPerWave` ≤ 65,535 and ≥ wave 10's size; `brutesMaxAlive` ≤ `maxAlive`.
2. **Endless flag.** `world.run.endless` (set by Story 6.11's Stay) switches the rules below on; waves ≤ 10 are never affected.
3. **Size** (`waves/waveDirector.ts › waveSize`): for N > `runWaves` and `run.endless`, `min(N × zombiesPerWave, endless.maxZombiesPerWave)` × scale, rounded. Pure function of (balance, N, players, endless) — `waveSize` gains the `endless` argument (default false: every caller today unchanged).
4. **Mix:** `waveMixOf` returns `mix[oddWaveMix − 1]` for odd endless waves and `mix[evenWaveMix − 1]` for even ones (instead of "the last entry").
5. **HP growth:** `WaveState.hpMult` (a number, 1 by default), set by `beginWave` from F2; `spawnZombie` (`zombies/zombiePool.ts`) sets `pool.hp[id] = stats.hp × world.waves.hpMult` for every zombie spawned during the wave (wave zombies, stampede Runners of 6.8, the Behemoth's enrage Crawlers of 6.7) — one multiply at spawn, nothing per tick. The Behemoth's HP comes from `boss.json` × its own growth (F4), not `hpMult` (6.12 D1). Reset to 1 at run start. In `snapshotWorld` (it is in `world.waves`).
6. **Brutes:** endless waves get their fixed Brute count from F3 (computed, not a list entry), spawn thresholds evenly from `bruteFromFraction` to `bruteToFraction` of the wave by formula (no array that grows: brief 25), and `waveZombieType` skips a Brute while `brutesAlive ≥ brutesMaxAlive` (the next zombie of the mix comes instead; the Brute stays owed and comes when one dies; the wave can't end while one is owed — `remaining` includes it). Brute count per wave keeps growing (6.12 D2); the 600 size bounds it.
7. **Behemoth waves:** a shared `isBossWave(balance, wave, endless)` (Story 6.5 owns it: `boss.bossWaves.includes(wave)`, `[10]`; this story adds `endless && wave % bossEveryWaves === 0`); `bossHpMult = 1 + bossHpGrowthPerBoss × k`, k = `(wave − runWaves) / bossEveryWaves`. Story 6.5's spawn, alive cap 110, telegraphs and kill pay are reused unchanged.
8. **Vote waves:** Story 6.11's `isEvacWave(balance, wave, endless)` adds `endless && wave % evac.everyWaves === 0` (15, 20, 25…). Extract there → Results "Extracted" with the DW2 blue-hour dawn (designer pick: DW2 on an endless extract).
9. **Light (6.3's API, `decay/lightState.ts`):** `refreshBlackout(world)` is the ONLY writer of `world.lights.blackoutPct` (called by 6.3 at `startBuild`/`startWave`); this story adds one rule inside it, read from `decay.json › blackout` (6.3's block): on odd endless waves (11, 13, 15…) the wave's `blackoutPct` = `blackout.endlessLightPct` (5) — new key `blackout.endlessOddWaves: true`; on even endless waves `halfDark` (the half-strength darkness 6.4 uses for stage-5 build phases; 6.12 D3) — new key `blackout.endlessEvenHalfDark: true`. Build phases in endless are half-dark as at stage 5. No new writer, no new wire field (6.3 already sends `RunState.blackoutPct` uint8 and `RunState.halfDark` bool). Stage stays 5 (`stageForWave` already clamps to the last entry).
10. **Events:** at the build start before each even endless wave without a Behemoth, Story 6.8's scheduler draws one event from the `events` stream among those whose gates pass, excluding the previous endless event (6.12 D4), with the same 20–60 % start window, banner, sound and marker. Power failure is allowed in endless (6.12 D6: it makes an even, half-dark wave a full blackout).
11. **Endings and records:** a wipe while `run.endless` → `run.ending = "lost"`, Results "Lost in the city" (sub: "Wave reached N · rewards after wave 10 lost"), DW2 blue hour behind the Results card (no 4 s dawn first: 6.12 D7). `PlayerState.earnedAtEvac` (the `earned` value when the first Stay was chosen) is stored per player; the `run_ended` server log gains `endless`, `endlessWaves` (waves cleared after 10) and per player `earnedBeforeEndless` / `earnedAfter10Lost`. No currency is taken away in the run (money only matters inside the run; Supplies are Epic 7).
12. **HUD:** the top bar shows "Wave 13 · Endless" while `run.endless` (synced as `RunState.endless`, one boolean).
13. **Dev switch:** 6.1's `?startwave=` / `DEV_START_WAVE` with N > 10 starts with `run.endless = true` (dev only), so endless can be tested without 10 waves.
14. **Bots and sims:** `headlessRun` `vote: "stay"` + `stayUntilWave` (vote Stay at each vote until that wave, then Extract). New `economy/endlessSim.test.ts` (T6).

## Tasks / Subtasks

- [ ] **T0 Art.** No new art: Collapse (6.4), blackout at 5 % (6.3), the Behemoth's looks (6.5: endless Behemoths never repeat the previous look — designer pick), DW2 blue hour (6.11). HUD tag text only.
- [ ] **T1 Balance** (AC 1): `balanceSchema.ts` (`endless` strict object with defaults; `evac.everyWaves`); `balance.ts › crossCheck`; tests in `config/balance.test.ts`.
- [ ] **T2 Sizes, mix, HP** (AC 3, 4, 5; F1, F2)
  - [ ] `waveDirector.ts`: `waveSize(balance, n, players, endless = false)`, `waveMixOf(balance, n, endless = false)`, `WaveState.hpMult` + `beginWave` sets it; `spawnZombie` multiplies HP.
  - [ ] Tests `waveDirector.endless.test.ts` (new): sizes for waves 11–30 at 1–4 players (table), mix per odd/even, `hpMult` 1.00 at 15, 1.06 at 16, 1.30 at 20; a spawned Walker in wave 20 has 1.3 × HP; a stampede Runner / enrage Crawler spawned in wave 20 too (when 6.8/6.7 are merged; else a `spawnZombie` unit test); waves ≤ 10 unchanged with `endless` false and true.
- [ ] **T3 Endless Brutes** (AC 6; F3)
  - [ ] `waveDirector.ts`: endless fixed Brute count + formula thresholds; `brutesAlive` counter (kept by spawn/kill of a Brute — `zombieTypeIndex("brute")`, maintained in `zombiePool` or counted on demand only when a Brute is next: no per-tick scan of 150 zombies every tick); the skip-while-6-alive rule; `remaining` includes owed Brutes.
  - [ ] Tests: wave 11 = 3 Brutes, wave 20 = 12; never more than 6 alive (assert every tick of a seeded wave 20); the wave ends only after all 12 spawned and died; solo wave 20 still 12 Brutes; thresholds between 25 % and 90 %.
- [ ] **T4 Behemoth, vote and light rules** (AC 7, 8, 9; F4, F5)
  - [ ] Extend 6.5's `isBossWave` + HP growth, 6.11's `isEvacWave`, and add the odd/even endless rule inside 6.3's `refreshBlackout(world)` (`decay/lightState.ts`; keys in `decay.json › blackout`).
  - [ ] Tests: boss at 15/20/25 only; HP 6,000 × 1.25 / 1.5 / 1.75 × scale; the telegraph lengths/radii at wave 25 equal wave 10's (one table compare); vote after 15 and 20; Stay at 15 → wave 16 build; blackout flag on 11/13/15, half dark on 12/14, build phases half dark.
- [ ] **T5 Events in endless** (AC 10; F6)
  - [ ] Extend 6.8's scheduler: `scheduleEndlessEvent(world, wave)` at the build start (events stream), no repeat of the previous endless event, gates, power failure allowed (D6).
  - [ ] Tests: waves 12, 14, 16, 18, 22 each get exactly one event; 20 and 30 none; never two in a row the same; same seed → same events (digest).
- [ ] **T6 Endings, HUD, sims, performance** (AC 11–14; F7; brief 9, 25)
  - [ ] `runStateMachine.ts`: `endRun` sets `ending "lost"` for a wipe while `run.endless`; `PlayerState.earnedAtEvac` set on the first Stay; schema `RunState.endless`; `syncState` / stateView / `fakeRoom` / devThrottle / `NetSimHost`; `RunRoom` `run_ended` log fields; `uiState.resultsTitle` "Lost in the city"; `ResultsScreen` sub line; HUD tag (`HudScene` top bar text, the `hudModel.ts` string).
  - [ ] Dev switch (AC 13) in 6.1's `devStartWave.ts` + `?startwave`.
  - [ ] `headlessRun`: `vote`, `stayUntilWave`; log `ending`, `endlessWaves`.
  - [ ] `economy/endlessSim.test.ts`: (a) **flow sim:** 4 bots in god mode, seed 1, Stay at every vote until wave 30, then Extract; a test-only system kills every wave zombie each 40 ticks after the queue is empty so waves cycle fast while every real system runs; asserts 20 endless waves played, Behemoths at 15/20/25 (if 6.5 merged), one event on each scheduled even wave (if 6.8 merged), `ending "extracted"` at 30, Brutes ≤ 6 alive every tick, and **flat memory**: pooled structure sizes (zombie pool, decals/craters, event records, telegraph slots, kill logs) the same at wave 30 as at wave 11 (brief 25); (b) **wipe sim:** no god mode, Stay at 10 → eventually `ending "lost"`, Results fields set, `earnedBeforeEndless` + after-10 add up to `earned`.
  - [ ] Perf (`PERF_ASSERT=1`, load < 1): server tick p99 of a wave-20 mix at 150 alive (+6 Brutes) and of a wave-25 Behemoth wave at 110 alive; record both and the heap used at waves 11 and 30 (`process.memoryUsage().heapUsed`, after a GC if exposed) in `docs/perf/epic-6-blackout.md` (shared with 6.3) and the Completion Notes. FPS: the brief-25 run (blackout + fog + Behemoth + 150 zombies) is recorded by 6.3/6.5; this story reruns it at wave 25 (`?startwave=25`).
- [ ] **T7 Gates.** Mutations (size cap removed → wave-20 size test fails; `hpMult` applied per tick or to the Behemoth → HP tests; Brute alive cap off → "≤ 6 alive" fails; boss every 4 → boss-wave test; event repeat allowed → "never two in a row" fails; `ending` stays "wiped" in endless → wipe sim fails) and which tests failed. Browser check: solo `?startwave=11&wallet=5000` (HUD "Wave 11 · Endless", blackout), `?startwave=15` (Behemoth, vote, Extract → DW2 → "Extracted"), a wipe in endless ("Lost in the city" with DW2). Online two tabs with `DEV_START_WAVE=14`. `typecheck && lint && test && build`. Merge notes.

## Dev Notes

### Designer decisions to confirm (made non-interactively; recommended values)

1. **6.12 D1 — Does the endless HP growth also make the Behemoth tougher?** Recommended: **no**; the Behemoth only grows by its own +25 % per endless Behemoth (wave 25: ×1.75, not ×1.75 × 1.6). Alternative: both stack (wave 25 Behemoth ≈ 2.8× the wave-10 one).
2. **6.12 D2 — Brutes in late endless.** Recommended: **keep adding one per wave (wave 20 = 12, wave 30 = 22), but at most 6 alive at once**, as the GDD says. Alternative: stop at 6 per wave.
3. **6.12 D3 — How dark the even endless waves are.** Recommended: **half dark, like a stage-5 build phase** (fog and power out stay; the odd waves are the pitch-black ones). Alternative: every endless wave pitch black, or even waves with only the stage-5 night look.
4. **6.12 D4 — Event variety in endless.** Recommended: **never the same event as the previous endless event**. Alternative: fully random (repeats possible).
5. **6.12 D5 — Which zombie mix endless waves use.** Recommended: **odd (pitch-black) waves use wave 9's mix (fewer Runners in the dark), even waves wave 10's mix.** Alternative: wave 10's mix for every endless wave.
6. **6.12 D6 — Power failure in endless.** Recommended: **allowed on even endless waves** (it turns a half-dark wave pitch black: the only way an even wave goes fully dark). Alternative: keep it to waves 6–8 only (then endless has 5 possible events).
7. **6.12 D7 — The ending after a wipe in endless.** Recommended: **straight to Results "Lost in the city", with the cold blue-hour dawn (DW2) behind the card** (no 4 s wait: you lost). Alternative: 4 s of blue hour first, then Results.

### Decisions (developer guidance)

- **D-A Pure functions of the wave number.** Size, mix, HP multiplier, Brute count/thresholds, boss wave, vote wave, blackout and event waves are all functions of `(balance, wave, endless)` — testable in a table, no state that grows.
- **D-B HP at spawn only.** One multiply in `spawnZombie`; `applyZombieDamage`, fire, traps, mines read `pool.hp` as today. Kill rewards are per type (`zombies.json › reward`), unchanged.
- **D-C Owed Brutes are queued zombies.** A Brute skipped by the alive cap stays in `queued`, so `remaining`, the last-5 rush (the rush counts it) and the wave end stay correct. If the last 5 include an owed Brute it spawns as soon as a Brute dies (or at once if fewer than 6 are alive).
- **D-D Endless reuses every system; it adds none.** If 6.5 or 6.8 is not merged when this story is built, its parts (boss waves, events) are written against their interfaces and tested when they land (list what was not verified).
- **D-E No growing logs.** `RunController` per-player counters are scalars; `headlessRun`'s per-wave log is sim-only. Event, telegraph, decal and crater records are pooled by their stories; the flow sim checks their sizes.

### Current state (read before changing)

- `waves/waveDirector.ts › waveSize` = `max(1, round(N × zombiesPerWave × scale))` (already +40 per wave forever: only the 600 cap is new); `waveMixOf` clamps to the last `mix` entry; `applyFixedCounts` gives no fixed zombies past the `fixed` list (so endless has 0 Brutes today); `waveZombieType`, `spawnWaveZombie`, `beginWave` (counts players, sets size/targets, emits `wave.started`), `updateWaves` (`maxAlive`, last-5 rush).
- `zombies/zombiePool.ts › spawnZombie`: `pool.hp[id] = stats.hp` (the one place HP is set).
- `decay/decayState.ts › stageForWave` clamps to the last `stageByWave` entry (stage 5 for wave 11+): no change.
- `run/runStateMachine.ts`: no endless notion yet; Story 6.11 adds `run.endless`, `isEvacWave`, `ending`.
- Light (Story 6.3, names final): `world.lights` in `decay/lightState.ts`; `refreshBlackout(world)` the only writer of `blackoutPct`; `decay.json › blackout { lightPctByWave, endlessLightPct 5, … }`; wire `RunState.blackoutPct` (uint8), `RunState.halfDark` (bool).
- `core/seedStreams.ts`: streams `decay`, `events`, `spawns`, `combat` (+ shop). Events draw from `events` (6.8).
- `core/systems.ts › SYSTEM_ORDER` has `boss` and `specialEvents` slots (no-ops today; 6.5 and 6.8 fill them).
- `config/balance.ts › crossCheck`: the biggest-wave check uses `runWaves × zombiesPerWave` (extend with `maxZombiesPerWave`).
- `bots/headlessRun.ts › runHeadless` (`maxTicks`, per-wave `waves[]` log), `combat`… sims in `economy/*Sim.test.ts`.
- GDD › Level Progression row "11+", Win/Loss ("If the team is wiped before extracting, it loses the rewards earned after wave 10"), Meta-Progression (Supplies: "Each endless wave +20, kept only if the team extracts").

### Must be preserved

Waves 1–10 bit for bit (`endless` false paths identical; replay digests of existing logs); the wave-10 Behemoth exactly as 6.5–6.7 build it; the vote as 6.11 builds it; 150 / 110 caps; spawn rules; per-type kill pay.

### Copies touched (brief 2)

World (`waves.hpMult`, owed-Brute state, `brutesAlive`, `run.endless` (6.11), `run.ending "lost"`, `PlayerState.earnedAtEvac`, the last endless event id) → schema (`RunState.endless`) → `syncState` (+ reset) → `stateView` (`RUN_STATE_FIELDS`) → `fakeRoom` → mirror (`NetSimHost`: `run.endless`, `ending`) → Predictor: none → devThrottle key list → `snapshotWorld` (waves spread; new player field; the event scheduler's endless state).

### Beat the rule (for the reviewer; brief 4)

1. Farm wave 11–14 forever by never killing the last zombie? (The last-5 rush finds you; is there any way a wave never ends, e.g. an owed Brute that never spawns because 6 never die?)
2. Kill Brutes only one at a time to keep the alive count low: is the owed Brute still delivered?
3. Extract at 15 versus wipe at 16: are the "before / after wave 10" earnings exactly split?
4. Wave 25 Behemoth: same telegraph lengths and grace as wave 10 (measure in ticks)?
5. Solo wave 20 (240 zombies, 12 Brutes, ×1.3 HP): still playable in principle (no type or count bug); solo is "allowed, not tuned".
6. Hidden tab across an endless build start with an event scheduled: the event banner and marker are right on wake.
7. Reconnect / late Game scene start in wave 21: HUD "Endless", the right darkness for an odd wave.
8. Is any event ever scheduled on a Behemoth wave (20, 30) or twice in a row the same?
9. Run 30 endless waves in the flow sim: anything in the World or the server that keeps growing?

### Bandwidth

`RunState.endless` 1 B once; no per-tick additions (HP is not on the wire; Brutes are horde records). Behemoth and events: their stories' budgets.

### Phone FPS / Perf

The worst endless frame is an odd Behemoth wave (pitch blackout + fog + Behemoth + 110 zombies) or an even wave with 150 zombies and an event. FPS budget and the darkness texture are 6.3's; this story reruns the brief-25 FPS case at wave 25 and records the server p99 and heap (T6).

### Art

None new (T0). Uses 6.3 (5 % blackout), 6.4 (Collapse weather rotating per run in endless: designer pick "rotating in endless" — 6.4 owns the rotation rule; this story only passes the wave number), 6.5 (no repeat of the previous Behemoth look), 6.11 (DW2).

### Dependencies

- **Needs 6.11** (the Stay choice, `run.endless`, `isEvacWave`, `ending`). **Needs 6.1** (wave curve, fixed thresholds, dev start wave).
- **Uses 6.5–6.7** (boss waves), **6.8** (scheduler) and 6.9/6.10 (event modules), **6.3/6.4** (blackout rule, half darkness, fog). Build it last (the epic's order: "6.12 last").
- Epic 5: none (no shop or build-bar change).

### Notes for the merge (brief 19)

- `waves.json`: `endless` block is new; `evac.everyWaves` goes into 6.11's `evac` block.
- `waveDirector.ts`: the `endless` argument on `waveSize`/`waveMixOf`: every caller (sims, HUD, tests, `RunRoom` logs) keeps the default.
- `zombiePool.ts › spawnZombie`: one multiply; 6.7's Crawler spawns and 6.8's stampede go through it.
- Boss (`boss.json` / 6.5's module), events (6.8 scheduler), light (`decay/lightState.ts › refreshBlackout`, `decay.json › blackout`, owned by 6.3): this story adds one branch to each; it owns none of them and never writes `blackoutPct` outside `refreshBlackout`.
- `ResultsScreen.tsx` / `uiState.ts`: after 6.11; Epic 7 adds Supplies lines.

### Suggested build round

**Last round** (after 6.11 and after 6.5–6.10 are merged). Nothing in Epic 6 runs in parallel with it except doc/perf work; it touches the shared predicates of four other stories.

### References

- `epics.md` › Story 6.12; FR68. GDD › Level Progression (11+ row), Win/Loss (wipe after Stay), Difficulty scaling (+6 % HP past 15), Meta-Progression (Supplies per endless wave). `docs/ideas/epic-6/proposal.md` §8 and D3; `party-notes.md` Round 10. `docs/epic-6-decisions.md` (BL3 5 % for every endless blackout; CO rotation in endless; Behemoth look never repeats; DW2). Stories 5.7 (fixed Brutes), 6.1, 6.5, 6.8, 6.11.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
