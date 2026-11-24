# Epic 6: designer decisions

## Story decisions to confirm

**Designer: "ok, perfect" on 2026-11-24: every recommended value below is accepted.** Written 2026-11-24 from the 12 story files (`_bmad-output/implementation-artifacts/6-*.md`, brief `docs/epic-6-brief.md`). Each line is the story writer's **recommended value** (first), with the alternative after it. **"ok" accepts all 110.** Change any line by its code (e.g. "6.11 D1: votes cast"). The looks are already picked (section "Epic 6 looks" below), so no story needs a new art pick.

### The ones worth a look (game feel)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 6.3 D1 / 6.4 D5 | How dark a blackout is | **Your look pick: 20 % light in a power-failure wave (6–8), 10 % in wave 9, 5 % in wave 10 and every endless blackout** (the old story text said a flat 10 % everywhere; your pick replaces it) |
| 6.4 D2 | Whose flashlight sees through the fog | **Any standing teammate's beam shows the zombies in it on your screen too** ("light that way!") (only your own beam, as the story text said) |
| 6.5 D1 | Can you walk through the Behemoth? | **No, its body pushes you out like a wall** (today you can walk through zombies; inside the boss the slam could never be dodged) |
| 6.5 D8 | Barricades against the Behemoth | **They slow it, they don't stop it: 100 HP per second to the barricade, it moves at a quarter speed until through (wood 2 s, metal 6 s)** |
| 6.6 D5 | Hiding in alleys from the Behemoth | **When it can't walk to you, it may throw at you from 4.5 m instead of 8 m** (8 m always: an alley 5–8 m away is then safe from everything) |
| 6.8 D6 | Can a wave end in the middle of an event? | **No: a crossing stampede or a counting-down gas tank holds the wave open, then it ends** (the wave's end cancels the event) |
| 6.11 D1 | What "majority" means in the vote | **Stay only if more than half of the whole team votes Stay; anyone silent counts as Extract** (majority of the votes cast: 1 Stay vs 3 silent = Stay) |
| 6.12 D2 | Brutes in late endless | **Keep adding one per wave (wave 20 = 12 in the wave), at most 6 alive at once** (stop at 6 per wave) |

Also worth a glance: **6.1 D1** the two Brutes of waves 7–10 come at 25 % and 65 % of the wave (today's code would send them together); **6.2 D1** the collapsed alley fills wall to wall (a heap only at the street end would trap a live spawn); **6.10 D8** the survivor's safe point is a **white** flag, not the drawn green (colour rule: white = people; green is too close to gas and the supply smoke); **6.9 D6** the crate shows its weapon already at the flare, 5 s before it lands.

### 6.1 The full 10-wave curve

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 6.1 D1 | When the two Brutes of waves 7–10 come | **First after 25 % of the wave, second after 65 %**; in wave 10 never together with the Behemoth's entry at 50 % (both at 25 %, as today's code would do) |
| 6.1 D2 | How the money check is measured | **With bots that can't die, so every check run plays all 10 waves**; a second set of normal runs only logs how far bots get (normal bots only) |
| 6.1 D3 | If earnings miss 2,500–3,000 per player | **Log it only; the Epic 5 balance pass decides** (raise the wave bonus here) |
| 6.1 D4 | A dev switch to start at wave N | **Yes** (`?startwave=7` solo, `DEV_START_WAVE` server, dev builds only) |

### 6.2 Ruins (waves 7–8)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 6.2 D1 | How the alley closes | **The whole alley fills with rubble wall to wall** (a heap only at the street end) |
| 6.2 D2 | Which alley | **Alley 1, 2 or 3, one at random per run** (always alley 2, as on the look page) |
| 6.2 D3 | Where the 2 new wall holes (spawns) open | **Apartments' south wall and the offices' west wall, one each side of the crossing** (the diner's north wall from the look page; it sits 1 m from an existing spawn) |
| 6.2 D4 | The 3 rubble piles in the streets | **Same 3 spots every run** (3 of 5 spots per run: more variety, 10× more to test) |
| 6.2 D5 | Rubble as cover | **Stops bullets, bodies, melee, spit and blasts like a car; lobbed rounds fly over; "Blocked by rubble" when building** |
| 6.2 D6 | Ruins look per run | **RU1, RU2 or RU3 at random for waves 7–10; endless always RU4 fire-gutted** (all four random) |
| 6.2 D7 | Streetlight flicker | **Each lamp goes out 0.15–0.6 s every 4–10 s, in waves and build phases** (waves only) |
| 6.2 D8 | Shop glow at stage 4 | **30 %** (50 %, the look page's value) |
| 6.2 D9 | The collapse moment | **2 s rumble + dust burst with the "Ruins" banner** (banner only) |
| 6.2 D10 | Falling debris | **A dust puff + sound every 0.6–1.6 s, never damage** |

### 6.3 Blackout lighting

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 6.3 D1 | How dark | **20 % / 10 % / 5 % as in "worth a look"** (flat 10 %) |
| 6.3 D2 | Build phases at stage 5 | **Half the wave's darkness (about 52 % light after wave 10)** (fully lit) |
| 6.3 D3 | A downed survivor's light | **Flashlight off, the 1.6 m glow stays; an "out" survivor gives no light** (flashlight stays on) |
| 6.3 D4 | Extra lights | **Yes: flamethrower/gas torch 3 m while firing, explosions 5 m for 0.15 s, molotov fires, turret muzzle flashes 3 m** (only flashlights, floodlights, car fires, player muzzle flashes) |
| 6.3 D5 | Zombie eyes | **Two pale yellow dots on every zombie within 14 m, bigger on a Brute** (only zombies facing you) |
| 6.3 D6 | Teammates in the dark | **Body, ring and name always above the darkness** (ring only) |
| 6.3 D7 | Rain in a blackout | **Rain dimmed to 35 %, sparkles inside beams and floodlight pools, no hot core, no lens flare; low quality halves the sparkles** |
| 6.3 D8 | Floodlight (100) and Tactical flashlight (120) in the shop | **From wave 1, prices unchanged** (from wave 6) |
| 6.3 D9 | Your flashlight outside a blackout | **Not drawn** (a faint beam always) |
| 6.3 D10 | Does darkness change the fight? | **No, only what you see: zombies, turrets and aim assist work as in the light** (turrets only shoot lit zombies) |

### 6.4 Collapse (waves 9–10)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 6.4 D1 | Fog edge | **Zombies within 9 m always shown, fading out by 10 m (13 → 14 m in build phases)** (hard cut at 10 m) |
| 6.4 D2 | Whose flashlight sees through fog | **Any standing teammate's beam** (only your own) |
| 6.4 D3 | What fog hides | **Only zombies (and their eyes) and spit in flight; never the boss, teammates, markers, crate, survivor, puddles, fires** (also puddles and gas) |
| 6.4 D4 | Aim assist in fog | **Never snaps to a zombie your fog hides** (keeps assisting) |
| 6.4 D5 | How dark | **Wave 9 = 10 %, wave 10 = 5 %, build phases half as dark** (same line as 6.3 D1) |
| 6.4 D6 | New cover at stage 5 | **None; the extra debris is flat and visual only** (2 more piles) |
| 6.4 D7 | Weather style | **Dead streetlights always, plus haze, fog bank, ash or flood at random per run; endless changes it every wave** |
| 6.4 D8 | Low quality | **Simpler fog look, exactly the same visibility** |
| 6.4 D9 | Sound | **Near silence: wind, rain (none with ash), a distant growl every 6–14 s** |
| 6.4 D10 | Spectating when out | **Fog centres on the teammate you watch** |
| 6.4 D11 | Flood puddles | **Visual only** (they slow you) |

### 6.5 The Behemoth arrives

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 6.5 D1 | Walk through the Behemoth | **No, its body pushes you out** (walk through, as zombies today) |
| 6.5 D2 | Where it comes in | **One of the 4 main street ends: the one farthest from the team and ≥ 14 m from everyone (else the farthest)** (any spawn point) |
| 6.5 D3 | Hitting it under lag | **Your shots hit it where your screen shows it (0.3 s allowance, as zombies); its attacks on you get no lag allowance** |
| 6.5 D4 | What hurts it | **Guns, melee, both flamethrowers, grenades, mines, turrets, Bloater blasts; not car fires, molotov fire, acid, gas or floor traps** |
| 6.5 D5 | Slam hits zombies too | **Yes, 40 damage, no money for anyone** (zombies unharmed) |
| 6.5 D6 | Turrets shoot it | **Yes** (only players fight the boss) |
| 6.5 D7 | Looks | **BH1–BH4 at random per Behemoth, never the same twice in a row** |
| 6.5 D8 | Barricades | **Slow it: 100 HP/s, quarter speed until through** |
| 6.5 D9 | Boss bar | **Top centre, name, gold notch at 50 %, red when enraged** |
| 6.5 D11 | When the 110 alive cap starts | **With the 4 s warning**, so the horde thins before it walks in (only when it walks in) |
| 6.5 D10 | Being its target | **Short buzz (3 × 40 ms) on your phone + a red skull everyone sees; buzz off with vibration off** |

### 6.6 Behemoth charge and throw

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 6.6 D1 | What it crashes into (2 s stun, ×1.5 damage) | **Anything solid on the map: cars, bus, buildings, rubble, pumps, walls, dumpster, sandbags, police barriers, map edge; never your barricades or turrets (it smashes them)** |
| 6.6 D2 | Buildings in a charge | **Every player building it touches is destroyed, traps and mines too (mines don't go off), no refund** |
| 6.6 D3 | Zombies in a charge | **Trampled: 30 damage, no money** |
| 6.6 D4 | Zombies in a throw ring | **35 damage, no money** |
| 6.6 D5 | Alleys | **Throw from 4.5 m when it can't walk to you** (8 m always) |
| 6.6 D6 | Crash announced | **"CRASH!" banner 1.2 s, boss bar flashes amber during the stun** |
| 6.6 D7 | What it throws | **Looks only: rubble or a burnt car within 6 m, else torn-up road** |
| 6.6 D8 | Craters and cracks | **Stay until the build phase, at most 8** |
| 6.6 D9 | Numbers | **Prototype values: charge 5–12 m, 1.0 s warning, 10 m at 12 m/s, 30 damage + 2.5 m shove, 7 s cooldown; throw beyond 8 m, 1.0 s lift + 0.8 s flight, 3 m ring, 35 damage, 6 s cooldown** |

### 6.7 Enrage and the end of the Behemoth

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 6.7 D1 | Crawlers dropped while enraged | **Count in the wave (must be killed, pay 3)** (extras that vanish when it dies) |
| 6.7 D2 | The roar | **Pushes everyone within 5 m out 1.5 m, no damage; it stands still 1.5 s** |
| 6.7 D3 | An attack started when it dies | **Cancelled** |
| 6.7 D4 | Who gets the 150 | **Every player, downed and out too** (standing only) |
| 6.7 D5 | "EVAC INBOUND" banner | **Names who finished it; that player gets +1 kill** |
| 6.7 D6 | Its body | **Collapses and stays on the street, not solid, until the build phase** (fades at once) |
| 6.7 D7 | Enraged pace | **30 % faster, cooldowns and gaps 30 % shorter, a Crawler every 8 / 6 / 5 / 4 s (1–4 players)** |
| 6.7 D8 | Boss music | **Stops when it dies** |

### 6.8 Events: car alarm and stampede

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 6.8 D1 | Which car gets the alarm | **A random parked car 8–25 m from the team** (any parked car) |
| 6.8 D2 | What sets it off early | **Any player's bullet that reaches the car; not turrets, melee, flames or blasts** (anything that damages it) |
| 6.8 D3 | Pulled zombies | **Everything within 15 m walks to the car for 15 s; still bites anyone within 2 m; the last-5 rushers ignore it** (pulled zombies ignore players) |
| 6.8 D4 | Stampede lane | **One of 4 fixed street lanes, among those passing within 10 m of the team** (any lane) |
| 6.8 D5 | Stampede contact | **8 damage once per Runner per player, no shove, no building damage** (8 per second) |
| 6.8 D6 | Wave end mid-event | **Held open until the event ends** (cancels the event) |
| 6.8 D7 | Stuck stampede Runners | **No progress for 1 s → a normal Runner** |
| 6.8 D8 | Schedule shown in advance? | **No, you find out when it starts** ("Next wave: ???") |
| 6.8 D9 | Banners | **"CAR ALARM · shoot it to set it off", "STAMPEDE!"** |
| 6.8 D10 | Off-screen events | **Edge arrow for every event marker** |
| 6.8 D11 | Stampede size | **Counts everyone in the run, downed too** (standing only) |

### 6.9 Gas leak and supply drop

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 6.9 D1 | Where the gas tank sits | **Between the two pumps (centre of the gas-station zone)** (where the look page drew it, outside the zone) |
| 6.9 D2 | What sets the tank off early | **A player's bullet only, after its first 3 s** (grenades, molotovs and Bloater blasts too) |
| 6.9 D3 | Brutes in the blast | **Die like every zombie** (take 150 and survive) |
| 6.9 D4 | Kill pay | **Whoever shot the tank; nobody if it blew by itself** (split across the team) |
| 6.9 D5 | Fire afterwards | **None, a scorch mark** (3 m fire for 10 s) |
| 6.9 D6 | When the crate shows its weapon | **Already at the flare, 5 s before it lands** (when it lands) |
| 6.9 D7 | Which weapon | **Equal chance: Flamethrower, Gas torch, Grenade Launcher, Chainsaw, Assault Rifle, at level II** |
| 6.9 D8 | Both slots full | **Replaces your active weapon, with a "Replaces your SMG III" warning (step off to cancel)** (always the second slot) |
| 6.9 D9 | One slot empty | **Goes into the empty slot; you swap to it yourself** (switch at once) |
| 6.9 D10 | You already have it | **Level I → II; at II or higher you can't take it (a teammate can)** |
| 6.9 D11 | Taking it | **Stand within 0.8 m for 1 s; stepping off restarts; first on it keeps the claim** |
| 6.9 D12 | Crate spots | **10 fixed spots on open road, ≥ 12 m from the team** |

### 6.10 Power failure and survivor

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 6.10 D1 | Warning before the power fails | **Banner + sound, 2 s of flicker, then 20 % moonlit dark until the wave ends** (no banner: only the flicker) |
| 6.10 D2 | How the survivor follows | **Latches onto a standing player within 3 m, lost beyond 6 m** (lost beyond 3 m) |
| 6.10 D3 | Can players hurt the survivor? | **No; only zombies and car fires** (50 % friendly fire) |
| 6.10 D4 | Reaching safety | **Its centre within 2 m of the flag** |
| 6.10 D5 | Who gets the +100 | **Every player, downed too** (standing only) |
| 6.10 D6 | Does crouching hide it? | **No** (ignored by zombies beyond 5 m) |
| 6.10 D7 | Power failure in endless | **Allowed on even endless waves** (never in endless) |
| 6.10 D8 | Safe-point colour | **White flag** (green, as drawn) |
| 6.10 D9 | Spots | **8 survivor spots, 6 safe spots on open road** |
| 6.10 D10 | Survivor look | **SV1, SV2 or SV3 at random** |

### 6.11 Evacuation vote

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 6.11 D1 | Majority | **More than half of the whole team must vote Stay; silent = Extract** (votes cast) |
| 6.11 D2 | Change your vote | **Yes, until the vote ends** (first tap final) |
| 6.11 D3 | Everyone voted | **Vote ends 1 s later** (at once / full 15 s) |
| 6.11 D4 | What moves during the vote | **Nothing, players included** (players may walk, no shooting) |
| 6.11 D5 | The helicopter | **A picture only: never blocks or breaks anything** (no building on the pad from wave 9) |
| 6.11 D6 | Skipping the dawn | **A tap skips the 4 s dawn** (always plays) |

### 6.12 Endless mode

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 6.12 D1 | Endless HP growth on the Behemoth | **No; only its own +25 % per endless Behemoth** (both stack: wave 25 ≈ 2.8×) |
| 6.12 D2 | Brutes | **+1 per wave forever, at most 6 alive** (stop at 6 per wave) |
| 6.12 D3 | Even endless waves | **Half dark (odd waves are 5 % pitch black)** (all pitch black) |
| 6.12 D4 | Event repeats | **Never the same as the previous endless event** (fully random) |
| 6.12 D5 | Zombie mix | **Odd waves wave 9's mix, even waves wave 10's** (wave 10's always) |
| 6.12 D6 | Power failure in endless | **Allowed on even waves** (same line as 6.10 D7) |
| 6.12 D8 | How dark an even endless wave gets after a power failure | **20 % moonlit, like every power failure** (5 % pitch black) |
| 6.12 D7 | After a wipe in endless | **Straight to "Lost in the city" with the blue-hour dawn behind it, no 4 s wait** (4 s of blue hour first) |

### Notes for the designer (things the stories noticed)

- **Darkness numbers:** your look pick (20 / 10 / 5 %) replaces the epic's "10 % everywhere"; the stories follow the pick. `epics.md` 6.3 gets this line once you confirm.
- **"Lost in the city" rewards:** the GDD says rewards after wave 10 are lost; there are no Supplies yet (Epic 7), so 6.12 only records the earnings before and after wave 10. No in-run money is taken away.
- **Gas tank position:** the look page drew the tank outside the gas-station zone; 6.9 D1 puts it in the zone.
- **Supply crate mid-wave:** the first time a weapon changes during a wave (until now only in build phases); 6.9 handles it.
- **Behemoth "+50"** in the GDD is a Supplies reward (Epic 7), separate from the in-run 150 (6.7).

### Merged stories and new build rounds (designer, 2026-11-24)

Four pairs are built and reviewed as ONE story each (12 stories → 8, 4 rounds → 3). The story files stay separate; the builder of a merged story reads both files and writes one Dev Agent Record / review section in the first one.

| Round | Stories (parallel) | Notes |
| --- | --- | --- |
| 1 | **6.1**, **6.3**, **6.5** | 6.3's `aboveDark.ts` lands early; 6.5 builds on `?bosswave=`. |
| 2 | **6.2 + 6.4** Ruins and Collapse, **6.6 + 6.7** Behemoth charge, throw, enrage and end, **6.8** events framework | 6.2+6.4 after 6.3; 6.6+6.7 after 6.5 (fresh review + re-review of every medium/high fix — the riskiest); 6.6+6.7 and 6.8 both touch `zombieAi.ts`/`flowField.ts`: merge one after the other. |
| 3 | **6.9 + 6.10** gas leak, supply drop, power failure and survivor, **6.11 + 6.12** evacuation vote and endless mode | 6.9+6.10 after 6.8 and 6.2+6.4 (`refreshBlackout`); 6.11+6.12 after 6.1 and 6.6+6.7. |

### Build rounds (by file overlap) — original plan, superseded by the merges above

| Round | Stories (parallel) | Why together / what they wait for |
| --- | --- | --- |
| 1 | **6.1, 6.2, 6.3, 6.5** | Different areas: waves data, map + stage 4, darkness layer, boss module (6.5 builds on a dev switch `?bosswave=`, so it needn't wait for 6.1). Merge notes: `waveDirector.ts` (6.1 + 6.5), `GameScene.ts` depths (6.3 + 6.5), `CityView.ts` (6.2 + 6.3). Land 6.3's `aboveDark.ts` early. |
| 2 | **6.4, 6.6, 6.8** | 6.4 after 6.2 + 6.3; 6.6 after 6.5; 6.8 (events framework) best after 6.5 (`maxAliveNow`). 6.6 and 6.8 both touch `zombieAi.ts`/`flowField.ts`: merge one after the other. |
| 3 | **6.7, 6.9, 6.10, 6.11** | 6.7 after 6.6; 6.9 and 6.10 after 6.8 (6.10 also after 6.3/6.4: both touch `refreshBlackout`); 6.11 needs 6.1 and merges after 6.7 (helicopter on "wave 10 cleared with the boss dead"). |
| 4 | **6.12** | Last: needs 6.11 and extends 6.3, 6.5, 6.8, 6.11. |

The three Behemoth stories share files and are built one after another (6.5 → 6.6 → 6.7); give each a fresh-agent review and re-review every medium/high fix (they are the riskiest).


## Design decisions D1–D7 (designer, 2026-11-23)

Design decisions D1–D7 (boss, events, endless): `docs/ideas/epic-6/proposal.md` § 0 (also summarised in `docs/epic-5-decisions.md`).

## Epic 6 looks (designer, 2026-11-24)

Page: claude.ai/artifact/7ikXRSUD7ZURpADLAtEPSJ (code drawings in `docs/art/epic-6/looks.html`, screenshots in `docs/art/epic-6/ingame/`). All art is drawn in game code (art method: `docs/epic-5-decisions.md`). Lines marked are the session's proposal awaiting the designer's "ok".

| Section | Story | Picked | How the variants are used |
| --- | --- | --- | --- |
| 1 Ruins | 6.2 | **all four**: RU1 concrete + rebar, RU2 brick, RU3 wall slabs, RU4 fire-gutted | one material per run, picked by the `decay` stream (the whole map matches); RU4 is the endless look |
| 2 Collapse | 6.4 | **all four**: CO1 dead grid + haze, CO2 rolling fog, CO3 ash fall, CO4 flooded street | CO1's dead grid (dead lamp heads, fallen streetlight, fire = the only warm light) always; the fog/weather style (CO1 haze, CO2 fog bank, CO3 ash, CO4 flood) is one per run from the `decay` stream, rotating in endless |
| 3 Blackout | 6.3 | **BL3 pitch 5 %**, with **BL2 moonlit 20 %** kept, getting darker through the run: 20 % → 10 % → 5 % | power failure in waves 6–8 = 20 % moonlit (blue cast); wave 9 = 10 %; wave 10 and every endless blackout = 5 % pitch with crisp beam edges. Build phases at stage 5 stay half of the wave's darkness |
| 3 Beams | 6.3 | **rain streaks sparkling inside every beam and the floodlight pool (from BL4)**; **no bright hot core** down the beam | no lens flare either (it came with the core); floodlight 6 m in blackout (D5) |
| 4 Behemoth | 6.5–6.7 | **all four**: BH1 prototype, BH2 site worker, BH3 overgrowth, BH4 riot cop | one random look per Behemoth (like the Brute's five); endless Behemoths never repeat the previous look. Tells as drawn (red + white hatching, dashed edge, hole for the body, CRASH mark, skull on the target, boss bar with gold 50 % notch) |
| 5 Car alarm | 6.8 | **CA3** icon only (CA1, CA2 skipped) | a pulsing bell marker over the car; the 15 m pull is not drawn as rings |
| 5 Stampede | 6.8 | **ST1** dust cloud + amber chevrons | |
| 5 Gas leak | 6.9 | **GL1** vapour cloud + dashed 6 m ring + countdown arc; **GL3** propane tank kept as an idea | GL3's propane tank for a later map whose gas source is a tank, not a forecourt cap |
| 5 Supply drop | 6.9 | **green smoke (SD2) with the SD3 crate strapped to a pallet** | marker shows the weapon (D7) |
| 5 Survivor | 6.10 | **all three**: SV1 yellow raincoat, SV2 nurse, SV3 office worker | one random per event |
| 5 Power failure | 6.10 | no new art (Ruins flicker 2 s, then the blackout) | |
| 6 Vote | 6.11 | **EX1** two big buttons + slot chips + ring timer | |
| 6 Dawn | 6.11 | **DW1** warm sunrise and **DW2** blue hour | DW1 on Extract after wave 10; DW2 on an endless extract and behind "Lost in the city" |

Colour rule from the events (designer: "perfect"): amber = an event you can use, yellow-green = gas, red = boss danger only, white = pick-ups and people.

## Build-time decisions (designer, 2026-11-24)

| Code | Decision | Picked |
| --- | --- | --- |
| 6.3 B1 | Brief 31 HUD layout test vs the Epic 5 HUD as built (Ready in the move-stick half; first build-bar tiles, ⟳ / item chip / ↶, Move / Upgrade within 48 px of the survivor at 568×320 and 640×360; 15 lines) | **Keep as built**: the 15 are the test's KNOWN_LIST; any NEW break fails the test; revisit in Epic 10 polish with a small-phone playtest |
| 6.3 B2 | Blackout cost headless −26 % at `?stress=150&blackout=5` (target ≤ 15 %; SwiftShader's extra full-screen layer, quarter res didn't help) | **Accept for now**; the Xiaomi Mi 11i check decides (`docs/perf/epic-6-blackout.md` phone rows) |
