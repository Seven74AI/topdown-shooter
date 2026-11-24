# Readability sheet: answer key (designer only, don't share before Part 4)

Scoring for the 4.10 decision rule: an object is **readable** when ≥ 3 of 4 players (or all but one) name it right; the bullets answer counts separately ("Cover" row).

| # | Picture | Object | Bullets | Notes |
| --- | --- | --- | --- | --- |
| 1 | `01_curb_car.png` | parked car (stage 1) | **stop** | |
| 2 | `02_bus.png` | crashed bus | **stop** | |
| 3 | `04_building_roof.png` | building roof (apartments) | **stop** | |
| 4 | `05_streetlight.png` | streetlight | through (decoration) | |
| 5 | `06_moved_car.png` | car pushed into the road (stage 2 Panic) | **stop** | right if "car"; bonus if they noticed it moved |
| 6 | `07_police_barrier.png` | police barrier (stage 2) | **through** (stops bodies only) | |
| 7 | `08_dumpster.png` | dumpster (stage 2) | **stop** | flagged "a green box" by the designer last session |
| 8 | `09_sandbags.png` | sandbags (stage 3) | **through** (stops bodies only) | flagged "grey eggs" by the designer last session |
| 9 | `12_wood_barricade.png` | wood barricade (player-built) | **stop** (stops bodies and bullets) | changed 2026-11-23: every barricade tier stops bullets (PR #6) |
| 10 | `10_burning_car_with_fire_ring.png` | burning car (stage 3) | **stop** | hurts when your body touches the ring (2 m from the car's centre) |
| 11 | `13_turret.png` | turret (player-built) | through | |
| 12 | `11_rain_overall.png` | rain / puddles (night, stage 3) | n/a | mood check, not an object |
| 13–15 | `14_walker.png`, `15_runner.png`, `16_crawler.png` | Walker (pale, slow), Runner (red, fast, flanks), Crawler (green, low, slows on bite) | n/a | Epic 3 check: can they tell them apart? |
| 18 | `19_reinforced_barricade.png` | reinforced barricade (player-built, wood tier 2, B8 look) | **stop** (stops bodies and bullets) | walk on it: no. Story 5.9 |
| 19 | `20_metal_barricade.png` | metal barricade (tier 3, M1c look, no yellow plate) | **stop** (stops bodies and bullets) | walk on it: no. Story 5.9 |
| 20 | `21_spike_trap.png` | spike trap (nail board, floor) | **through** | walk on it: yes (players unharmed); zombies hurt + slowed. Story 5.9 |
| 21 | `22_mine.png` | mine (floor, single use, N6 look) | **through** | walk on it: yes (players never set it off); inner ring = a zombie touching it sets it off, outer ring = blast (hurts you 40 too). Story 5.9 |
| 22 | `23_spitter.png` | Spitter (Story 5.6, P4 "gaunt"): bony grey body covered in glowing green pustules, open mouth dripping acid | n/a | right if "spitter / acid zombie / the green-spotted one"; it stands off ~6 m, rears back (mouth blazes, gurgle) and spits; bullets kill it like any zombie |
| 23 | `24_acid_puddle.png` | acid puddle (Story 5.6) | through (a ground hazard) | hurts (2 every 0.4 s) while your body touches the bright ring (1 m round its centre); gone after 3 s and at every build start |
| 24 | `25_survivor_fire_axe.png` | survivor holding the Fire Axe (Story 5.2, AX1: long wooden haft, red head at the end) | n/a | right if "axe / fire axe"; swing = a wide pale arc with a warm rim, the zombie is knocked 1.5 m back (stops at cover) |
| 25 | `26_survivor_chainsaw.png` | survivor holding the Chainsaw (Story 5.2, CS1: orange engine block, grey bar ahead) | n/a | right if "chainsaw"; while it cuts the chain blurs, sparks (and blood) fly and you walk 20 % slower |
| 26 | `27_brute.png` | two Brutes (Story 5.7; here BR3 bloated butcher and BR5 prisoner in orange with a chain; the other looks: riot cop, hi-vis worker, bodybuilder) | n/a | right if "brute / big one / tank / mini-boss"; ~1.2 m wide (twice a Walker); before each hit it stops and spreads its arms for 0.5 s (step 0.3 m back to dodge); a hit knocks you 1.5 m; 120 HP, hurts buildings 3× |
| 27 | `28_bloater.png` | Bloaters (Story 5.8; all five looks: BL1 office worker in a stretched white shirt, BL2 yellow hazmat suit, BL3 sewer worker in waders, BL4 tourist in a Hawaiian shirt, BL5 shirtless with glowing gas sacs) | n/a | right if "bloater / fat one / exploder / the swollen ones"; round and 1 m wide, slow (0.9 m/s); it never bites: touch it and it swells, any death makes it burst (30 to every player within 2.5 m, even when a friend popped it) |
| 28 | `29_bloater_swell.png` | a Bloater swelling (Story 5.8): bigger, pulsing green, a ring at the 2.5 m blast edge filling like a clock | n/a | right if "it's going to explode / get out of the ring"; it bursts exactly 1 s after it started, where it stands; cars, the bus and buildings shield you, barricades and sandbags don't (blasts are not stopped by barricades, even though bullets are) |
| 29 | `30_bloater_gas.png` | the gas cloud after a burst (Story 5.8): yellow-green fog, ring at its 2.5 m edge, bile splats; the screen edge tints light green while it slows you | through (a ground hazard; no gas behind a car) | slows you 30 % (never hurts), 0.25 s after you leave; gone after 4 s and at every build start |

Pictures: Playwright, solo dev build, 844×390 at 2×, HUD and survivor hidden, normal zoom (2026-11-23). The helper noted: shop fronts other than the diner and kiosk barely glow; the streetlight is a small dot; rain is faint in a still frame; zombies are ~0.7 m across and differ mainly by colour; barricade and sandbags are both low and brownish; the turret reads as a box with a stub; a moved car looks like any parked car.

Story 5.5 additions (pictures: Playwright, solo dev build, 844×390 at 2×, HUD shown, 2026-11-23):

| # | file | answer | bullets | notes |
| --- | --- | --- | --- | --- |
| 30 | `31_grenade_round.png` | a Grenade Launcher round in flight (brass and olive 40 mm, drawn 3 × size, raised on its arc with a shadow) and the landing ring (white = it lands at the aim point; the ring is the exact 2 m blast) | n/a | right if "grenade / shell / rocket"; the ring shows where it bursts and how big the blast is |
| 31 | `32_landing_ring_car.png` | the landing ring at a car's near face (amber): the aim point is on the car's roof, so the round lands at the car's near face | the round flies over cars when aimed past them; only buildings stop it | aimed onto a car's roof it lands at the car's near face (amber ring); aimed past a car it flies over it (PR #5, 2026-11-23); standing 2 m from that face you take 20 of your own blast. Retake the picture with the aim clearly on the roof if it was taken under the old rule |
| 32 | `33_explosion_fireball.png` | grenade explosion (EX1 fireball): fills the circle and stops at its thin ring = the 2 m damage edge | blasts are **stopped** by cars/bus/buildings, **not** by barricades/sandbags | 40 to zombies, 20 to every survivor in it (the shooter too); zombies pushed 0.6 m |
| 33 | `34_explosion_shockwave.png` | mine explosion (EX2 shockwave + debris): white flash, a ring rolling out to the 2.5 m edge, chunks | as 32 | Story 5.9's mine now uses the shared blast look |
| 34 | `35_flamethrower_cone.png` | survivor with the Flamethrower (Story 5.4, FT1: olive twin tanks on the back, long wand) and its fuel jet | **stopped by** cars, the bus, buildings (the fire ends at their face); goes over barricades and sandbags | right if "flamethrower"; 6 m long, 20° narrow: zombies in it burn (5 every 0.25 s + 3 s of burning); a teammate in it loses 5 every 0.5 s (friendly fire) |
| 35 | `36_gas_torch_cone.png` | survivor with the Gas torch (Story 5.4, FT2: red propane bottle under a pipe, blue pilot) and its cone | as 34 | right if "torch / gas burner / flamethrower"; 3 m short, 60° wide, blue at the nozzle |
| 36 | `37_burning_zombies.png` | burning zombies (Story 5.4: small flames on the body for 3 s after a flame hit) | n/a | right if "on fire / burning"; they keep chasing; the burn credits whoever lit them |

Story 5.10 additions (pictures: Playwright, solo dev build `?shopall=1`, 844×390 at 2×, 2026-11-23):

| # | file | answer | bullets | notes |
| --- | --- | --- | --- | --- |
| 37 | `38_floodlight.png` | a floodlight (FL1: a yellow tripod work light, its glass along the front edge) and its warm-white light pool (4 m radius) on the street | **pass** (bullets fly over it; it stops bodies: an obstacle, not cover) | right if "lamp / light / work light / floodlight"; 150 HP, zombies break it; not in the shop until the blackout story (6.3) |
| 38 | `39_med_station.png` | a med station (MS10: hard med cases stacked on a crate, a glowing green-cross LED panel on top) and its soft green ring at the 2 m heal edge | **pass** (an obstacle, not cover) | right if "medkit / healing / first aid"; touch the ring = +5 HP/s while standing (never for downed survivors), two stations don't stack, walls don't block it; a green "+" shows by a survivor being healed |

Story 5.14 additions (pictures: Playwright, solo dev build, 844×390 at 2×, 2026-11-23):

| # | file | answer | bullets | notes |
| --- | --- | --- | --- | --- |
| 39 | `40_bear_trap_open.png` | a bear trap, open (B-T1: round steel jaws lying flat, teeth inward, a round plate in the middle, a spring each side, a chain to a stake) | **pass** (floor: bullets and bodies cross it) | right if "bear trap / leg trap / jaw trap / trap"; survivors walk over it safely; a zombie whose centre reaches the plate is caught |
| 40 | `41_bear_trap_closed.png` | the same trap sprung: jaws shut into one bar, a zombie held in it | **pass** | right if "it closed / caught a zombie / it went off"; holds 3 s (a Brute 1.5 s), the zombie still bites what is in reach; stand on a closed trap 1 s to re-arm it (every trap re-arms at a build start) |

Story 5.12 additions (pictures: Playwright, solo dev build, 800×360 at 2×, HUD shown, 2026-11-23; files in `docs/art/5-12/`):

| # | file | answer | bullets | notes |
| --- | --- | --- | --- | --- |
| 41 | `5-12-hud-wave-ring-800x360.png` | the consumable button (CI4 grenade, count 3) left of swap, and the throw's landing ring (white, the exact 2.5 m blast) | n/a | right if "grenades / quick item"; E or a tap throws one; greyed when it can't be used now (a throwable in a build phase, a medkit at full HP), dimmed while the server hasn't confirmed the last use |
| 42 | `5-12-molotov-flight-800x360.png` | a molotov in flight (a bottle with a burning rag; HG1–3 / MB1–3 looks vary per throw) | flies **over** cars, the bus, barricades; only buildings stop it | right if "molotov / fire bottle" |
| 43 | `5-12-molotov-fire-800x360.png` | molotov fire: the 4.12 fire on the asphalt with a ring of flames at the 3 m edge = the damage edge | fire goes through barricades and sandbags (a ground area) | 8/s to zombies, 4/s to survivors (teammates and you), never stacks with a car fire, 4 s, burns no building, no path change |
| 44 | `5-12-grenade-flight-800x360.png` | a hand grenade blast (EX2 shockwave + debris) at the bus's near face, its ring = the 2.5 m damage edge | the blast is **stopped by** cars/bus/buildings, **not** by barricades/sandbags | 44 to zombies, 20 to every survivor in it (you too) |

Story 6.3 additions (pictures: Playwright, solo dev build `?blackout=10&stress=…&stressbuild=lights`, 800×360 at 2×, 2026-11-24; files in `docs/art/6-3/`):

| # | file | answer | bullets | notes |
| --- | --- | --- | --- | --- |
| 46 | `6-3-blackout-10-800x360.png` | a blackout wave (10 % light): the pale yellow dot pairs are zombie **eyes** (every zombie within 14 m, lit or not); the cone is your **flashlight** (60°, 8 m; 80°, 12 m with the Tactical flashlight; a teammate's cone is drawn the same way); the round warm pools are **floodlights** (6 m in a blackout), a burning car glows orange (4 m); rain sparkles inside every beam and pool | darkness changes nothing: cover and bullets work as in the light | right if "eyes / zombies in the dark" and "my torch"; the dark can't be turned off (no setting lightens it) |

Story 7.8 addition (picture: game code drawn with @napi-rs/canvas, `docs/art/7-8/sheet.ts`, game size × 2, 2026-11-24):

| # | file | answer | bullets | notes |
| --- | --- | --- | --- | --- |
| 47 | `47_survivor_looks.png` | four survivors with chosen looks: riot helmet + camo coat (blue), gas mask + plank bundle (orange), bike helmet + golf bag + puffer (green), welding mask + hoodie (purple) | n/a | right if "nothing, they're just looks / clothes". Wrong (a readability bug, brief 13) if anyone reads armor, gas immunity, building material or a power-up into them. Looks are cosmetic only (proposal D1). |
