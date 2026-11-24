# Story 6.9: Gas leak and supply drop

Status: drafted (ready-for-dev once the designer confirms docs/epic-6-decisions.md › Story decisions to confirm)

## Story

As a team,
I want a gas tank that explodes and a supply crate worth fighting for,
so that we have to choose between risk and reward.

{{BRIEF}}

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

- [ ] **T0 Art (picks fixed; no new pick).** `docs/epic-6-decisions.md` › section 5: **GL1** vapour cloud + dashed 6 m ring + countdown arc (GL3 propane tank kept as an idea only); **supply drop = SD2 green smoke with the SD3 crate strapped to a pallet**; the marker shows the weapon (D7). Port from `docs/art/epic-6/looks.html` (`makeGasCard`, `makeSupplyCard`, `SD_STY`, `IC.flame`, `IC.gun`; combine SD2's smoke colour `70,190,90` and military case with SD3's pallet and straps) into `render/city/eventArt.ts` and `render/EventView.ts`, every texture through `addGeneratedTexture` (brief 20). Weapon icons on the pin reuse the shop/weapon icons (`render/weaponLook.ts` / existing icon atlas). Colour rule: yellow-green `#dfe878` for gas, white `#e8e6e0` for the crate. Add tank and crate to the readability sheet (brief 13): "does the crate stop bullets?" — no (it's a pick-up).
- [ ] **T1 Balance** (AC 1, 4): `events.json › gasLeak` and `supplyDrop` (below) + schema + cross-checks (weapons exist in `weapons.json`, level ≤ `shop.upgrades.maxLevel`, `armDelayS < hissS`).
- [ ] **T2 Gas leak** (AC 1–3; G1–G4): `events/gasLeak.ts`, `EXPLOSION_KINDS` + `"gas_leak"` (append-only: the wire index), `GAS_LEAK_WEAPON`, the tank target in `specialShotTarget`. Tests `events/gasLeak.test.ts`: G1 ring edge (a body just inside hit, just outside not; behind a pump, the bus, a car and the kiosk: not hit; behind a barricade/sandbags: hit), G2 (60 to each of 4 players when one shot it; downed unharmed; Brute dies; buildings take 150), G3 (a bullet at 2.95 s passes, at 3.0 s blows it; turret/melee/flame/grenade don't; credit to the shooter, none on the timer), G4 (blast tick = start + 200 ticks without a shot), holds the wave, one blast only (two shots same tick).
- [ ] **T3 Supply drop** (AC 4–6; G5–G8): `events/supplyDrop.ts`, `giveCrateWeapon` in `economy/shop.ts`. Tests `events/supplyDrop.test.ts`: spot ≥ 12 m from the team centre and box/fire/building-free at every stage × mask; weapon from the stream (all five seen over seeds); not takeable during the flare; 1 s = 20 ticks; break → reset; claimant downed → reset; two players on it → the first keeps it; G7 rules (empty slot, level I → II, replace active with the warning, ≥ II refused); vanishes at the build start; no money change.
- [ ] **T4 Wire + client** (AC 6, 7): schema fields, `syncState`, views, `fakeRoom`, devThrottle, `NetSimHost` mirror + the fire-clock restart on a mid-wave weapon change (test in `fireClock` / `NetSimHost` tests), `EventView`/`eventArt`, `HudScene` prompt, `GameScene` banners and sounds, `ExplosionView` 6 m entry. Tests: round trips, `syncState.test.ts`, `eventMarkers.test.ts` (+ crate/tank), atlas size.
- [ ] **T5 Sims, fuzz, bandwidth, perf** (brief 7, 9, 11, 12): extend the 6.8 fuzz with a forced gas leak and supply drop (no body inside a box after the blast, no stall); 10-wave sim over 8 seeds with `DEV_EVENTS`-style forcing: ≥ 1 boom with ≥ 1 zombie killed, ≥ 1 crate taken by a bot; bandwidth; `?stress=150` with a forced boom (EX1 at 6 m) headless FPS before/after with load.
- [ ] **T6 Gates.** Mutations (e.g. `friendlyFire: true` → G2 test; LOS skipped → G1 pump test; arm delay 0 → G3; claim not reset on a step-off → G6; downed may claim → G6; crate persists into the build → G8) and which tests failed. Browser check: solo `?events=gas_leak@3` and `?events=supply_drop@3`, online two tabs `?lag=150&jitter=20`: ring + arc agree on both phones, shooting the tank after 3 s blows it everywhere at once, the crate's weapon visible from the flare, the pick-up swaps the HUD weapon without a wrong ammo count, a woken tab sees the crate. Full gate. Merge notes.

`events.json` additions (starting values):

```json
"gasLeak": { "hissS": 10, "armDelayS": 3, "radiusM": 6, "playerDamage": 60, "killDamage": 10000, "buildingDamage": 150, "tankAt": "zone_centre", "tankRadiusM": 0.6 },
"supplyDrop": { "flareS": 5, "minFromTeamM": 12, "takeRadiusM": 0.8, "takeS": 1, "level": 2, "weapons": ["flamethrower", "gas_torch", "grenade_launcher", "chainsaw", "assault_rifle"] },
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

Round "events-2": **after 6.8**, **in parallel with 6.10** (different modules; both append to the event record, `EventView` and the registry — merge one after the other). Also parallel with the boss stories 6.6/6.7 (no shared files except `netEvents.ts` kind numbers).

### References

- `epics.md` › Story 6.9; GDD › Special events (gas leak, supply drop rows); FR39, FR40; alignment Q8 (gas blast LOS), Q9 (standing players only).
- `docs/ideas/epic-6/proposal.md` § 0 D7, § 6; `party-notes.md` › Round 9.
- Story files 5.5 (`explode`, cover rule), 5.8 (full-damage FF), 5.1 (levels), 5.14 (stand-on-it), 6.8 (framework).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
