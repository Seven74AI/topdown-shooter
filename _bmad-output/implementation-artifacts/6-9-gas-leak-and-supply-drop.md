# Story 6.9: Gas leak and supply drop

Status: review

## Story

As a team,
I want a gas tank that explodes and a supply crate worth fighting for,
so that we have to choose between risk and reward.

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

Most relevant here: 2 (the crate and the tank live in the event record: every copy), 3/4 (fairness rules, "Beat the rule"), **5 (the gas blast uses the normal blast line of sight: cars, the bus, buildings, pumps and rubble shield it)**, 6 (one blast, one hit per body; the crate's 1 s claim is per player), 8 (`events` stream only: spot, weapon), 9 (a real boom, a real pick-up in the sims), 10 (ticks, `events.json`), 11 (events, not per-tick state), 12 (vapour, flare smoke and the EX1 fireball at 6 m pooled and capped), 14 (a mid-wave weapon change under lag; hidden tab across the boom), **23 (event fairness: the tank lever, full friendly fire, standing players only)**, 24 (crate and markers above the darkness; yellow-green = gas, white = pick-ups), 27 (no shop/card UI touched: the crate's warning is a HUD prompt).

## Acceptance Criteria

### Fairness rules (player-visible; brief lines 3 and 23; each is tested)

- **G1 "The ring is the blast."** From the moment the leak starts, a **6 m** dashed yellow-green ring is drawn round the tank with a countdown arc. When it blows, exactly the bodies whose circle overlaps that 6 m circle **and** that have a clear blast line from the tank (Story 5.5's `explode` rule: cars, the bus, map boxes — the gas pumps — buildings and rubble shield; barricades, sandbags, barriers, turrets don't) are hit. Outside the ring, or behind a car, nothing.
- **G2 "Everyone in it takes the full 60."** Every standing player hit takes **60**, whoever set it off (no friendly-fire discount: the Bloater rule, 5.8 D1). Downed and out players are unharmed (the `explode` rule). Zombies hit die (every type).
- **G3 "Anyone can light it, but not at once."** For the first **3 s** of the **10 s** hiss, bullets pass the tank; after that, the first player bullet that reaches the tank sets it off on that tick (the 6.8 shot hook: turrets, melee, flames and blasts don't). Kills credit whoever set it off; a leak that blows by itself credits nobody.
- **G4 "The timer is honest."** The countdown arc ends exactly on the blast tick (drawn from the server's `eventPhaseTick`, not message arrival); an early shot is announced by the same blast on every phone.
- **G5 "The crate tells you what's inside before anyone runs."** From the flare (5 s before the crate lands) every player sees a white marker at the landing spot with the weapon's icon and name at level II, and an edge arrow when it is off screen.
- **G6 "Only a standing player takes it, and only by standing on it."** The crate is taken by the first **standing** player whose centre stays within **0.8 m** of the crate's centre for **1 s** without a break; stepping off, being downed or another player taking over resets that player's progress (a white fill ring shows it). Downed and out players can't take it; nothing can take it before it has landed.
- **G7 "You know what you lose."** If both your slots are full, a warning "Replaces your <weapon> <level>" shows for the whole 1 s before the crate is taken; stepping off cancels. A player who already carries the crate's weapon at level II or higher can't take it (the ring doesn't fill, "You already have it"), so a teammate can.
- **G8 "It waits for you."** The crate stays until the wave ends (it vanishes at the build start, untaken = lost); zombies ignore it.

### Behaviour

1. **Gas leak module (`events/gasLeak.ts`, FR39, D7).** Gate (`fits`): the `gas_leak_zone` hazard is active at the wave's stage (`minStage` 2). The tank is at the centre of `gas_leak_zone` (**34.0, 5.75 m**, between the two pumps) — `events.json › gasLeak.tankAt: "zone_centre"`; its hit circle `tankRadiusM` **0.6 m**. Phases: `hiss` (`hissS` **10 s**; shootable after `armDelayS` **3 s**), then `boom` (one tick) → the event ends. The blast is one `explode(world, spec)` with `x, y` = tank, `radiusM` **6**, `zombieDamage` = `killDamage` **10,000** (every type dies, the Brute's 120 too), `playerDamage` **60**, `friendlyFire: false`, `buildingDamage` **150**, `pushM` 0, `kind: "gas_leak"` (appended to `EXPLOSION_KINDS`), `sourcePlayerId` = the shooter or null, `weapon: GAS_LEAK_WEAPON` ("gas_leak", credited on kills), `announce: true` (the client draws round C's EX1 fireball scaled to 6 m). No fire left behind.
2. **Holds the wave.** `holdsWave` is true during `hiss` (6.8 F8 pattern): a wave whose last zombie dies mid-hiss ends right after the boom.
3. **Tank shot (G3).** `specialShotTarget(world)` (6.8) returns the tank circle during `hiss` after `armDelayS`; the 6.8 hook in `updateProjectiles` tests the step's segment against it (`segmentCircleT`, the bullet stops there) and calls `gasLeakShot(world, ownerId)`. Before 3 s the tank is not a target (bullets pass over it: it is a floor cap).
4. **Supply drop module (`events/supplyDrop.ts`, FR40, D7).** Gate: at least one `crate` spot (6.8's `DistrictMap.eventSpots`) open at the stage. At trigger, pick (stream `events`) among open spots at least `minFromTeamM` **12 m** from the team centre whose 1 m circle is free of boxes, buildings and fire (`boxOrFireBlocked` + buildings); the weapon (stream `events`, equal chances) from `events.json › supplyDrop.weapons` = `["flamethrower", "gas_torch", "grenade_launcher", "chainsaw", "assault_rifle"]`, level `level` **2**. Phases: `flare` (`flareS` **5 s**: green smoke at the spot, the marker already shows the weapon, G5) → `landed` (takeable) → `taken` or `wave_end`.
5. **Taking it (G6, G7).** Per tick in `landed`: the claim belongs to one player (`claimSlot`, `claimTicks`); the current claimant keeps it while standing within `takeRadiusM` **0.8 m**; otherwise the first standing player in range (players in slot order) starts at 1; at `ticksFor(takeS)` (**20 ticks**) → `giveCrateWeapon(world, playerId, weapon, level)` (new, `economy/shop.ts` beside `buyWeapon`): empty second slot → there (the active slot stays: swap to use it); already carrying it at level I → that slot becomes level II with a full magazine; both full → the **active** slot is replaced by a new slot (`createSlot`, level II, full magazine; reload/swap cancelled). Not allowed (G7): carrying it at ≥ II. Emits `event.phase_changed { phase: taken, playerId }` and `weapon.crate_taken { playerId, weapon, slot, level }`; no money moves.
6. **Wire.** The 6.8 event record carries `eventX/eventY` (the tank or the spot) and `eventPhaseTick`; this story appends `crateWeapon` (uint8 weapon index, 255 none), `crateClaimSlot` (uint8, 255 none) and `crateClaimTicks` (uint8) to the schema (on change only), `RUN_STATE_FIELDS`, `RunStateView`, `fakeRoom`, devThrottle, and mirrors them into the client World's `special.active`. The player's new weapon arrives through the existing `weapon0/1`, `level0/1`, `ammo0/1` fields; the client's local fire clock (`NetSimHost.predictAmmo` / the fire clock) must restart its count for a slot whose weapon changed mid-wave (today weapons only change in build phases: test it).
7. **Client.** `render/EventView.ts` (6.8's) gains: GL1 — the tank (two steel caps, red/yellow), a yellow-green vapour cloud pouring from the fill cap (pooled particles), the dashed 6 m ring, a countdown arc, label "GAS LEAK" then "GAS LEAK · shoot to blow it" after 3 s, a yellow-green flame pin; the blast is `ExplosionView`'s EX1 at 6 m (check its particle cap `combat.json › explosion.fx.maxExplosionParticles` 96 still reads at that size, else a `gas_leak` scale entry). SD2 + SD3 — a green smoke flare at the spot (pooled), the crate (olive military case strapped to a wooden pallet) dropping on a small chute over the last 1.2 s of the flare (shadow shrinking), the white gun pin + label "FLAMETHROWER · II" (weapon name + roman level from `romanLevel`), a white fill ring while someone stands on it (pins, ring and arc in slot `ABOVE_DARK.marker`, crate + fill ring in `ABOVE_DARK.pickup`, 6.3's `aboveDarkness`), the HUD prompt for G7 (in `HudScene`, the existing toast/prompt line, not the shop or the build bar). Banners: "GAS LEAK · get out of the ring", "SUPPLY DROP". Sounds: `event_gas_hiss` (loop, positional), the existing blast sound, `event_flare_pop`, `event_crate_land`, `event_crate_taken`.
8. **Bots.** `bots/botPolicy.ts`: bots leave the 6 m ring during `hiss` (so sims don't wipe to it); the bot nearest a landed crate walks to it if its loadout allows (liveness for the sim).

## Tasks / Subtasks

- [x] **T0 Art (picks fixed; no new pick).** `docs/epic-6-decisions.md` › section 5: **GL1** vapour cloud + dashed 6 m ring + countdown arc (GL3 propane tank kept as an idea only); **supply drop = SD2 green smoke with the SD3 crate strapped to a pallet**; the marker shows the weapon (D7). Port from `docs/art/epic-6/looks.html` (`makeGasCard`, `makeSupplyCard`, `SD_STY`, `IC.flame`, `IC.gun`; combine SD2's smoke colour `70,190,90` and military case with SD3's pallet and straps) into `render/city/eventArt.ts` and `render/EventView.ts`, every texture through `addGeneratedTexture` (brief 20). Weapon icons on the pin reuse the shop/weapon icons (`render/weaponLook.ts` / existing icon atlas). Colour rule: yellow-green `#dfe878` for gas, white `#e8e6e0` for the crate. Add tank and crate to the readability sheet (brief 13): "does the crate stop bullets?" — no (it's a pick-up).
- [x] **T1 Balance** (AC 1, 4): `events.json › gasLeak` and `supplyDrop` (below) + schema + cross-checks (weapons exist in `weapons.json`, level ≤ `shop.upgrades.maxLevel`, `armDelayS < hissS`).
- [x] **T2 Gas leak** (AC 1–3; G1–G4): `events/gasLeak.ts`, `EXPLOSION_KINDS` + `"gas_leak"` (append-only: the wire index), `GAS_LEAK_WEAPON`, the tank target in `specialShotTarget`. Tests `events/gasLeak.test.ts`: G1 ring edge (a body just inside hit, just outside not; behind a pump, the bus, a car and the kiosk: not hit; behind a barricade/sandbags: hit), G2 (60 to each of 4 players when one shot it; downed unharmed; Brute dies; buildings take 150), G3 (a bullet at 2.95 s passes, at 3.0 s blows it; turret/melee/flame/grenade don't; credit to the shooter, none on the timer), G4 (blast tick = start + 200 ticks without a shot), holds the wave, one blast only (two shots same tick).
- [x] **T3 Supply drop** (AC 4–6; G5–G8): `events/supplyDrop.ts`, `giveCrateWeapon` in `economy/shop.ts`. Tests `events/supplyDrop.test.ts`: spot ≥ 12 m from the team centre and box/fire/building-free at every stage × mask; weapon from the stream (all five seen over seeds); not takeable during the flare; 1 s = 20 ticks; break → reset; claimant downed → reset; two players on it → the first keeps it; G7 rules (empty slot, level I → II, replace active with the warning, ≥ II refused); vanishes at the build start; no money change.
- [x] **T4 Wire + client** (AC 6, 7): schema fields, `syncState`, views, `fakeRoom`, devThrottle, `NetSimHost` mirror + the fire-clock restart on a mid-wave weapon change (test in `fireClock` / `NetSimHost` tests), `EventView`/`eventArt`, `HudScene` prompt, `GameScene` banners and sounds, `ExplosionView` 6 m entry. Tests: round trips, `syncState.test.ts`, `eventMarkers.test.ts` (+ crate/tank), atlas size.
- [x] **T5 Sims, fuzz, bandwidth, perf** (brief 7, 9, 11, 12): extend the 6.8 fuzz with a forced gas leak and supply drop (no body inside a box after the blast, no stall); 10-wave sim over 8 seeds with `DEV_EVENTS`-style forcing: ≥ 1 boom with ≥ 1 zombie killed, ≥ 1 crate taken by a bot; bandwidth; `?stress=150` with a forced boom (EX1 at 6 m) headless FPS before/after with load.
- [x] **T6 Gates.** Mutations (e.g. `friendlyFire: true` → G2 test; LOS skipped → G1 pump test; arm delay 0 → G3; claim not reset on a step-off → G6; downed may claim → G6; crate persists into the build → G8) and which tests failed. Browser check: solo `?events=gas_leak@3` and `?events=supply_drop@3`, online two tabs `?lag=150&jitter=20`: ring + arc agree on both phones, shooting the tank after 3 s blows it everywhere at once, the crate's weapon visible from the flare, the pick-up swaps the HUD weapon without a wrong ammo count, a woken tab sees the crate. Full gate. Merge notes.

`events.json` additions (starting values):

```json
"gasLeak": { "hissS": 10, "armDelayS": 3, "radiusM": 6, "playerDamage": 60, "killDamage": 10000, "buildingDamage": 150, "tankAt": "zone_centre", "tankRadiusM": 0.6 },
"supplyDrop": { "flareS": 5, "minFromTeamM": 12, "takeRadiusM": 0.8, "takeS": 1, "level": 2, "weapons": ["flamethrower", "gas_torch", "grenade_launcher", "chainsaw", "assault_rifle"] },
"fx": { "maxGasParticles": 48, "maxFlareParticles": 48 },
"banners": { "gas_leak": "GAS LEAK · get out of the ring", "supply_drop": "SUPPLY DROP" }
```

## Dev Notes

### Designer decisions to confirm (made non-interactively; recommended values)

- **6.9 D1 ★ Where the gas tank sits.** Recommended: **on the forecourt between the two pumps** (the middle of the gas-station zone); the 6 m ring then covers the pumps and the road edge, the pumps themselves shield whoever crouches behind them. Alternative: the drawing's spot near the kiosk (38.6, 10.2 m), which reaches further into the road.
- **6.9 D2 ★ What can set the tank off early.** Recommended: **a player's bullet only** (same as the car alarm). Alternative: grenades, molotovs and Bloater blasts too (chain reactions; harder to control).
- **6.9 D3 Brutes in the blast.** Recommended: **every zombie inside dies, Brutes too.** Alternative: Brutes take 150 and survive.
- **6.9 D4 ★ Who gets paid for the kills.** Recommended: **whoever shot the tank gets the normal kill pay for every zombie it kills; if it blew by itself, nobody gets paid.** Alternative: the kill pay is split among the whole team.
- **6.9 D5 No fire afterwards.** Recommended: **the blast leaves only a scorch mark.** Alternative: a 3 m fire for 10 s.
- **6.9 D6 ★ When the crate shows its weapon.** Recommended: **already at the flare, 5 s before it lands** (more time for the team to decide who runs). Alternative: only when it lands.
- **6.9 D7 Which weapon.** Recommended: **equal chance among Flamethrower, Gas torch, Grenade Launcher, Chainsaw, Assault Rifle**, at level II.
- **6.9 D8 ★ Where the crate goes when your slots are full.** Recommended: **it replaces your active weapon**, with a "Replaces your SMG III" warning during the 1 s (step off to cancel). Alternative: it always replaces your second slot.
- **6.9 D9 Into the empty slot, you keep holding what you hold.** Recommended: **the new weapon goes into the empty slot and you swap to it yourself.** Alternative: you switch to it at once.
- **6.9 D10 You already have that weapon.** Recommended: **level I → it becomes level II; level II or more → you can't take it (a teammate can).**
- **6.9 D11 Taking it.** Recommended: **stand within 0.8 m of it for 1 s; stepping off restarts; the first one on it keeps the claim.**
- **6.9 D12 Spots.** Recommended: **10 fixed crate spots on open road (map data from 6.8), at least 12 m from the team, picked at random.**

### Decisions (developer guidance)

- **DD1 One `explode` call** (5.5 owner): no new blast code; `friendlyFire: false` gives the full 60 to every player (5.8 D1 path) while `sourcePlayerId` keeps the credit.
- **DD2 Kill damage, not a kill flag:** `killDamage` 10,000 from `events.json` through the normal damage path, so kills, rewards and `zombie.killed` work unchanged (no inline literal).
- **DD3 The tank is not a blocker:** it is not in `world.obstacles` (no nav or shot-list change); only the 6.8 hook sees it.
- **DD4 `giveCrateWeapon` is not a purchase:** no wallet, no `not_build` check, no `already_owned` refusal for level I (it upgrades). Upgrade levels are slot-owned (5.1): replacing a slot loses that slot's upgrades (the warning says the level).
- **DD5 Claim like the bear trap re-arm** (5.14: `rearmPlayer`/`rearmTicks`), but standing players only and per crate.

### Current state (read before changing)

- `combat/explosion.ts`: `explode(world, spec)` (FR-C overlap + `shotLineClear`; FR-D `friendlyFire`; FR-E one hit per body; buildings by overlap + clear line to the nearest point), `createExplosionSpec`, `EXPLOSION_KINDS = ["grenade", "mine", "bloater", "hand_grenade"]` (append-only), `blastResult` / `explosionCounters` for tests.
- `zombies/bloater.ts`: `BLOATER_BLAST_WEAPON` (the credit-id pattern), `friendlyFire: false` use.
- `map/data/downtown.tmj.json` › `hazards`: `gas_leak_zone` 31–37 × 2–9.5 m, `kind=gas_leak`, `minStage=2`; `collision`: `gas_pump_a` 32.5–34.5 × 3.5–4.5, `gas_pump_b` 32.5–34.5 × 7–8, `gas_kiosk` (building) 41–48 × 0–6. `tools/maps/buildDowntown.ts` line ~140 defines the hazard.
- `combat/loadout.ts`: `WeaponSlot { weapon, ammo, reloadTicks, cooldownS, level }`, `createSlot`, `setLoadout`, `activeSlot`. `economy/shop.ts`: `buyWeapon` (empty second slot first, else `slot` required; replaced weapon lost), `owns`, `romanLevel`, `upgradeWeapon`.
- `buildings/bearTrap.ts`: re-arm by standing `rearmS` (`rearmPlayer`, `rearmTicks`, a break resets).
- `player/freeSpot.ts › boxOrFireBlocked`, `spotBlocked`.
- Client: `render/ExplosionView.ts` (`blastLookFor(e.kind)`, EX1 fireball), `sim/NetSimHost.ts` (`syncSlot`, `predictAmmo` from the fire clock), `scenes/HudScene.ts` (prompts/toasts), weapon icons.

### Must be preserved

Every other blast unchanged (grenade 50 % FF, Bloater full, mine); `EXPLOSION_KINDS` indices; shop rules in build phases; slot-owned upgrade levels; the 5.12 consumable flow; the fire clock for unchanged weapons.

### Copies touched (brief 2)

World (`special.active` gas/crate sub-records) → schema (`crateWeapon`, `crateClaimSlot`, `crateClaimTicks`; the 6.8 event record) → `syncState` (+ reset) → `RunStateView` / `RUN_STATE_FIELDS` → `fakeRoom` → devThrottle → mirror (`NetSimHost`: event record → `special.active`; loadout via the existing fields + fire-clock restart) → Predictor (nothing) → `snapshotWorld` (sub-records).

### Beat the rule (for the reviewer; brief 4)

1. Stand exactly on the 6 m edge (body overlapping by 1 cm / clear by 1 cm): hit / not hit.
2. Hide behind a pump, the bus, a car, the kiosk, a barricade, sandbags as it blows: which shield? (Map boxes and cars yes; barricades/sandbags no.)
3. A teammate shoots the tank while you are inside: 60 to you? (Yes.) While you are downed inside: nothing.
4. Shoot the tank at 2.9 s, 3.0 s; with a turret; with a flamethrower jet; with a grenade landing on it: which blow it?
5. Shoot it twice on the same tick from two players: one blast, one credit.
6. Lure 100 zombies into the ring with the car alarm (6.8) then blow it: kill count, pay to the shooter, frame time.
7. Run onto the crate during the flare: can you take it early? Stand 0.79 / 0.81 m off; step off at 0.95 s; get downed at 0.95 s.
8. Two players reach it together: who gets it? Can the second steal it by standing longer?
9. Carry two weapons and take it: is the warning visible the whole second? Does the replaced weapon's level show? Take a Chainsaw while holding Chainsaw I / III.
10. Leave the crate untaken: is it gone at the build start? Can it be taken during the build phase? (No.)
11. Take the crate under `?lag=150&jitter=20` while firing: ammo count and fire rate correct right after the swap?

### Bandwidth (brief 11)

Event messages ~20 B × ~4; crate claim ticks change ≤ 20 times per pick-up (~60 B); the blast is the existing `explosion.happened` (~20 B). Negligible; report.

### Phone FPS / Perf

Vapour ≤ 48 and flare smoke ≤ 48 pooled particles (`events.json › fx.maxGasParticles`, `maxFlareParticles`), one crate sprite, one ring; the blast reuses EX1's pools (one 6 m blast). Run `?stress=150` with a forced boom; report headless FPS before/after with load. Server: one blast (linear pass over ≤ 180 zombies) once per event.

### Art

GL1 (vapour cloud from a fill cap, dashed 6 m ring, countdown arc, yellow-green) and SD2 + SD3 (green smoke flare; olive military case strapped to a pallet; small chute; white weapon pin) from `docs/art/epic-6/looks.html` (screenshots `docs/art/epic-6/ingame/ev-*.png`). EX1 fireball at 6 m for the blast (round C). All game code via `addGeneratedTexture`.

### Dependencies

- **6.8** (framework, shot hook, `events` map spots, EventView): must be merged first.
- **6.3**: markers, ring and arc via `aboveDarkness(obj, ABOVE_DARK.marker)`, the crate and its fill ring via `aboveDarkness(obj, ABOVE_DARK.pickup)` (`render/darkness/aboveDark.ts`; fallback: top world depth until merged).
- **6.2**: rubble shields the blast (it is a map box/blocker: automatic once 6.2 adds it to the shot blockers); rubble must not cover crate spots (6.8's spot test).
- **Epic 5**: 5.5 `explode`, 5.8 FF rule, 5.1 levels — all merged. 5.13 card shop: no overlap (the crate is not a card).

### Notes for the merge (brief 19)

- `combat/explosion.ts`: append `"gas_leak"` to `EXPLOSION_KINDS` (wire index; renumber nothing).
- `economy/shop.ts`: `giveCrateWeapon` is new, next to `buyWeapon`; 5.13 (card shop) may restructure buying — keep `giveCrateWeapon` independent of the shop list.
- `events/registry.ts`: register `gasLeak` and `supplyDrop` (6.10 registers its two: append).
- Schema/`syncState`/`stateView`/`fakeRoom`: append crate fields after 6.8's event record; 6.10 appends survivor fields.
- `render/EventView.ts`, `render/city/eventArt.ts`: append GL1/SD parts; 6.10 appends its own.
- `render/ExplosionView.ts`: a `gas_leak` look entry only.

### Suggested build round

**Round 3** (`docs/epic-6-decisions.md` › Build rounds): **after 6.8**, **in parallel with 6.10** (different modules; both append to the event record, `EventView` and the registry — merge one after the other). Also parallel with 6.7 (boss) and 6.11 (vote): no shared files except `netEvents.ts` kind numbers.

### References

- `epics.md` › Story 6.9; GDD › Special events (gas leak, supply drop rows); FR39, FR40, FR57 (the gas leak as a hazard); alignment Q8 (gas blast LOS), Q9 (standing players only).
- `docs/ideas/epic-6/proposal.md` § 0 D7, § 6; `party-notes.md` › Round 9.
- Story files 5.5 (`explode`, cover rule), 5.8 (full-damage FF), 5.1 (levels), 5.14 (stand-on-it), 6.8 (framework).

## Dev Agent Record

Merged story (designer 2026-11-24): **6.9 + 6.10 "Gas leak, supply drop, power failure and survivor"** — one build, one record (this file); `6-10-power-failure-and-survivor.md` points here.

### Agent Model Used

Claude (Claude Code cloud session, branch `story-6-9`).

### Debug Log References

- Start: `story-6-8` (a8a70cd) merged with `master` (9c540b3): conflicts in `netEvents.ts`, `simEvents.ts`, `balance.ts(+test)`, `index.ts`, `eventInterest.ts`, `placeholderSfx.ts`, `GameScene.ts` resolved by keeping both sides; the Downtown map files re-generated with `npm run maps:build` (never by hand). One lint error in 6.8's `flowField.ts` (`slot--` unused) fixed; 6.8's later merge carries its own fix.
- Later: `origin/story-6-8` merged again (2c5b072, review API: `EventModule.update` returns `EventOutcome | null`; 6.8 had merged `master` 7385b47 itself): the four modules return `"done"` / `"failed"` / `null`; the survivor no longer calls `endSpecialEvent` from `update`.
- Survivor probe (24 whole runs, 4 god-mode bots, waves 3/6/8): as specified (D6) the NPC died in 1–4 s, 1 save in 24 → design question to the main session → **decision 6.10 B1** (designer): while it waits zombies ignore it unless within 5 m (`events.json › survivor.waitIgnoreM` 5); once led, S3 as before. Built.
- Headless `?stress=150` (solo dev build, own port 5397, 844 × 390 at DPR 1, 10 × 1 s samples after 6 s, load 1.0–1.5): no event 53.5 / 53.9 fps; gas leak hissing (44 vapour puffs live) 48.0 / 48.0 (−11 %); supply drop flare (43–44 smoke puffs live) 47.2 / 46.6 (−12 %). Not comparable with `docs/perf/epic-6-blackout.md`'s DPR-2 numbers (12.4 fps floor there); relative cost only.
- Bandwidth: the survivor walking ≈ 6 B per patch (≈ 120 B/s at 20 Hz, `syncState.test.ts`); the crate's claim ≤ 20 one-byte changes per pick-up; events ~20 B × 3–4 per event; the blast is the existing `explosion.happened`.

### Completion Notes List

**Shared sim (server, solo, mirror):**
- `events/gasLeak.ts` (G1–G4): tank at the `gas_leak` hazard's centre (34, 5.75 m; gate: the zone open at the stage, `minStage` 2), HISS 10 s, armed after 3 s for the 6.8 shot hook (`specialShotTarget` / `onSpecialShot` extended, API unchanged), one `explode` (`kind "gas_leak"` appended to `EXPLOSION_KINDS`, 6 m, `killDamage` 10,000, 60 to every standing player with `friendlyFire: false`, 150 to buildings, normal blast line of sight), kills credited to the shooter with `GAS_LEAK_WEAPON`, nobody on the timer; holds the wave while hissing. Known, accepted: the bullet that blows the tank is not stopped at the tank (the hook runs after the hit pass; anything behind it within the step is inside the 6 m blast anyway).
- `events/supplyDrop.ts` (G5–G8): spot ≥ 12 m from the team centre, `spotClearM` 1 m free of boxes/buildings/fire (fallback: the farthest free one), weapon from the stream among the five at level II; FLARE 5 s → LANDED → TAKEN; one claimant, standing, centre ≤ 0.8 m, 20 unbroken ticks; refused at ≥ II (`crateRefusal`); never holds the wave. `economy/shop.ts › giveCrateWeapon` / `crateOutcome` / `crateRefusal` (D8–D10, DD4) and `weapon.crate_taken` (netEvents kind 75).
- `events/powerFailure.ts` (P1–P3): waves 6–8 not already full blackout (`lightState.wavePct` exported for it), FLICKER 2 s → DARK: sets `world.lights.powerFailure` and calls 6.3's `refreshBlackout` (the only writer of `blackoutPct`); the wave's end clears it. `powerFailureWave(world, wave)` is the hook 6.12 can call for endless.
- `events/survivor.ts` (S1–S5 + B1): spots (an NPC spot is only used when an open safe spot ≥ 20 m from it exists), leader rule (nearest standing within 3 m; lost beyond 6 m, downed or gone), movement ≤ 4.0 m/s to 1 m behind the leader with the fire stop and `pushOutOfBuildings`, save at 2 m → +100 `"event"` money (appended to `MONEY_REASONS` after `"boss"`) to every player in the run, `waveOffS` 1.5 s then `"done"`; 0 HP → `"failed"`; wave end → `"wave_end"`. `damageSurvivor` lives in `events/survivor.ts` (not `combat/damage.ts`: no import cycle). God mode does NOT spare it (a survivor nobody can hurt held the horde round it forever in the god-mode sims).
- Zombies (S3): `zombieAi.ts` target list holds the survivor as a `ChaseTarget` after the players (bit-for-bit as before without one); bites go to `damageSurvivor`, no flank cone for it; `spit.ts` targets/hits it (`SPIT_TARGET_SURVIVOR` id) with its own acid clock; `flowField.ts` seeds the chase fields from it while it is led (B1); `explosion.ts` hurts it in Bloater blasts only (S4).
- Wire: RunState appends `crateWeapon`, `crateClaimSlot`, `crateClaimTicks`, `npcX`, `npcY`, `npcHp`, `npcState`, `npcLook`, `npcLeaderSlot`, `safeX`, `safeY` (after 6.8's event record; on change only; reset), `RUN_STATE_FIELDS`, `RunStateView`, `fakeRoom`, `lobbyStore.test`; `net/mirrorEvent.ts` copies them into the client World.
- `EVENT_PHASE` appends HISS 5 … SAVED 13; `special` gains `gasLeak`, `supplyDrop`, `survivor` records (+ snapshot, log counters).
- Bots: out of a hissing ring, the nearest allowed standing bot takes a landed crate, the nearest bot walks to a waiting survivor, the leader walks it to the flag (waits when it lags 3 m).

**Client:** `render/city/eventArt.ts` appends 25 frames (flame/gun/person/flag pins and arrows in yellow-green / white, tank caps, vapour and smoke puffs, crate on pallet, chute, flare, shadow, SV1–SV3 standing/crouched) to the event atlas (one `addGeneratedTexture`, ≤ 2048² tested); `render/EventPickupsView.ts` (new, owned by `EventView`) draws the tank, vapour (≤ 48 pooled), the dashed 6 m ring and arc (server phase tick), the flare smoke (≤ 48 pooled), the falling crate + chute + shadow, the white fill ring, the NPC (smoothed toward the server position, never predicted), its HP bar, labels, the leader's faint 3 m circle, the white flag + 2 m ring + its own edge arrow — pickups in `ABOVE_DARK.pickup`, pins/labels/arcs in `ABOVE_DARK.marker`. `eventMarkers.ts`: per-kind icon, label, ring, crate fall/fill, survivor state, flag, the power-failure flicker; banner colours by the colour rule (`EventCue.bannerColor`); `cratePrompt` (G7) feeds the HUD's existing toast line from `GameScene` (no HudScene/shop/build-bar change). `CityView.powerFlicker` drives every lamp together for the 2 s (keyed off the server phase tick). `grenadeFx.blastLookFor`: the gas leak is EX1. Seven placeholder sounds.
- Follow-up owned (6.2 re-review R1): GameScene's fog hookups now go through `render/fog/fogWiring.ts › wireFog` (unit test) and `tools/checks/fogWiring.test.ts` checks the scene calls it at create and every frame.

**Tests (new):** `events/gasLeak.test.ts` (12), `supplyDrop.test.ts` (11), `powerFailure.test.ts` (4), `survivor.test.ts` (14 incl. a 12-seed × 600-tick box/fire fuzz and the fire-edge stop), `eventsRunSim.test.ts` (8 seeds × whole runs with all four forced + a determinism digest), client `eventPickups.test.ts` (7), `localFire.test.ts` (+2: mid-wave weapon change), `syncState.test.ts` (+1, bandwidth), `netEvents.test.ts` (+1 round trip), `fogWiring` (2 + 1). 6.8's `eventRunSim.test.ts` now expects all six kinds; `eventMarkers.test.ts` cue checks use `toMatchObject` (new `bannerColor` field).

**Mutations (each run against its test file; all 12 killed):** G2 `friendlyFire: true` → gasLeak "all four… 60"; G1 blast line of sight removed → "the pumps shield"; G3 arm delay 0 → "2.95 s passes"; G6 claim not reset on a step-off → 2 tests; G6 downed may claim → "downed at 19 ticks"; G8 crate holds the wave → "G8: untaken…"; P1 no flicker delay → "FLICKER for 40 ticks"; S2 downed may lead → 2 tests; S4 grenade blasts hurt the NPC → "bullet passes… grenade spares… Bloater hurts"; S5 reward to the leader only → "+100 to every player"; S3 NPC not seeded in the chase field → the seed test (survived once, test added); S3 zombies ignore the NPC → "a Walker next to it bites".

### Not verified

- Online two tabs under `?lag=150&jitter=20` (ring/arc in step on both phones, the boom everywhere at once, the NPC following smoothly on the other phone, a tab woken mid-blackout / across the crate) — covered by the mirror/marker unit tests from server ticks, not run in two browsers.
- The gas boom itself on screen (EX1 at 6 m with the 96-particle cap): not screenshotted; the look entry is the existing EX1 path.
- The survivor's call repeat every `helpCallS` 6 s and the positional gas-hiss loop: built as one-shot cues (start sound only); `helpCallS` is unused.
- Shop-glow layers flickering with the lamps (only the lamp layer flickers for P1).
- Real-phone FPS (Xiaomi Mi 11i); `PERF_ASSERT=1` tick cost with the NPC in the target list.
- 6.12 endless hook: `powerFailureWave` / the modules' `fits` are ready, wiring into `endlessEventCandidates()` waits for 6.11+6.12 on master.

### Notes for the merge (every shared file touched)

- `packages/shared/src/events/eventState.ts`: `EVENT_PHASE` appends 5–13; `SpecialEventState` appends `gasLeak`, `supplyDrop`, `survivor` + `NPC_STATE`; log counters appended; snapshot extended.
- `events/registry.ts`: four `case`s replace the stubs. `events/specialEvents.ts`: `specialShotTarget` / `onSpecialShot` bodies add the gas tank (signatures unchanged). `events/eventRunSim.test.ts` (6.8's): final assertion = all six kinds.
- `config/balance/events.json` + `balanceSchema.ts` + `balance.ts › crossCheckEvents`: `gasLeak`, `supplyDrop`, `powerFailure`, `survivor` (incl. B1 `waitIgnoreM`), `fx.maxGasParticles` / `maxFlareParticles`, six banners; cross-checks (crate weapons exist, level ≤ maxLevel, power waves ⊂ waves, banners present).
- `core/simEvents.ts`: `MONEY_REASONS` + `"event"` (after 6.7's `"boss"`); `weapon.crate_taken`. `net/netEvents.ts`: kind 75 `WEAPON_CRATE_TAKEN` (75–84 reserved for 6.9/6.10). `bots/headlessRun.ts`: `earnedBy.event`.
- `combat/explosion.ts`: `EXPLOSION_KINDS` + `"gas_leak"` (append); Bloater-only survivor pass after the player pass. `economy/shop.ts`: `giveCrateWeapon`, `crateOutcome`, `crateRefusal` appended (independent of the card shop).
- `zombies/zombieAi.ts`: `ChaseTarget` list (players then the survivor), `damagePlayer` routes the survivor, no flank cone for it, `standingWithin` players only — merge with 6.6/6.7/6.8 lines kept. `zombies/spit.ts`: survivor in `standing`, `SPIT_TARGET_SURVIVOR`, acid clock. `zombies/flowField.ts`: `seedPlayer` takes `{status,x,y}`; survivor seed while led.
- `decay/lightState.ts`: `wavePct` exported (no new writer of `blackoutPct`).
- `bots/botPolicy.ts`: `errandX/Y/Stop` fields, gas-ring escape inside `laneOut`, `errand()`.
- `index.ts`: exports appended after 6.8's block.
- Server: `rooms/schema/RunState.ts` (11 fields after `eventLane`; RunState now 39 fields + 6.11's), `syncState.ts` (+ reset), `syncState.test.ts`.
- Client: `net/fakeRoom.ts`, `net/mirrorEvent.ts`, `net/lobbyStore.test.ts`, `render/EventView.ts` (owns `EventPickupsView`; pin/arrow frame by icon; car arc only for the car; `powerFlicker()`), `render/eventMarkers.ts` (look fields appended; `EventCue.bannerColor`; `cratePrompt`), `render/city/eventArt.ts` (frames appended; `drawPin`/`drawArrowDisc` take a colour), `render/city/CityView.ts` (`powerFlicker`), `render/grenadeFx.ts` (gas_leak → fireball), `audio/placeholderSfx.ts` (7 sounds), `scenes/GameScene.ts` (`cratePrompt` on the toast line, `cityView.powerFlicker`, banner colour from the cue, `wireFog`).
- Docs: readability sheet items 90–96 (`docs/art/6-9/` screenshots).

### File List

New: `packages/shared/src/events/{gasLeak,supplyDrop,powerFailure,survivor}.ts` (+ `.test.ts`), `packages/shared/src/events/eventsRunSim.test.ts`, `apps/client/src/render/EventPickupsView.ts`, `apps/client/src/render/eventPickups.test.ts`, `apps/client/src/render/fog/fogWiring.ts` (+ `.test.ts`), `tools/checks/fogWiring.test.ts`, `docs/art/6-9/*.png`.
Changed: see "Notes for the merge".

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
- 2026-11-24: designer accepted every recommended decision ("ok, perfect"); status ready-for-dev.
- 2026-11-25: built as the merged story 6.9 + 6.10 (decision 6.10 B1 applied); status review.
