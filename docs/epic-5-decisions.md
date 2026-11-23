# Epic 5: designer decisions to confirm

**Designer: "ok" on 2026-11-23: every recommended value below is accepted.**

Written 2026-11-23 from the 13 story files (`_bmad-output/implementation-artifacts/5-*.md`). Each line is the story writer's **recommended value**. "ok" accepts all of them; change any line by its code (e.g. "5.8 D1: halve it").

Every story also starts with an **art pick**: the designer chooses the look from ~5 Meshy proposals before it's built (like 4.11).

## The ones worth a look (game feel)

| Code | Decision | Recommended |
| --- | --- | --- |
| 5.8 D1 | A Bloater's blast hurts players nearby | **30 to every player in range, full damage, even when a teammate popped it** (the GDD's friendly-fire line says gas is halved; this makes popping a Bloater next to friends a real mistake) |
| 5.4 D1 | Flamethrower friendly fire can down a teammate | yes (50 % damage to friends) |
| 5.7 | The Brute | 1 Brute in waves 5 and 6 whatever the player count; 0.5 s wind-up before each hit (step 0.3 m away to dodge); hit every 1.5 s; knocks you 1.5 m |
| 5.1 | Weapon upgrades I–IV | damage only; each level costs 60 % of the weapon's price (Pistol 60, SMG 120, Assault Rifle 270…) |
| 5.2 | Chainsaw | slows you 20 % while it runs; 6 damage per tick, 10 ticks/s |
| 5.6 | Spitters | spit every 3 s; acid puddle 1 m radius for 3 s; flies over barricades and sandbags, stopped by cars/bus/buildings |
| 5.9 | Barricade ladder | wood (200 HP, 40) → reinforced **B8** look (350 HP, +50) → metal (600 HP, +70) |
| 5.12 | Molotov | 3 m fire, only in waves; kills pay the thrower |
| 5.13 | Card shop | 6 cards per build (≥ 1 weapon, ≥ 1 gear), reroll 20, no locking cards, card look C3 "police evidence tag" |
| 5.10/5.11 | Floodlight and flashlight | built now but hidden from the shop until the blackout (Epic 6), where they matter |

## Everything else

**5.3 Shotgun and Assault Rifle:** pellets spread evenly (point blank always 32); knockback 0.5 m once per shot, stops at barricades; no screen shake for the shotgun; prices Shotgun 250, Assault Rifle 450.

**5.6 Spitters:** weak bite up close 5 dmg/s, no retreat; 8 % of waves 4–5 (≈ 13 at 4 players); puddle 2 HP every 0.4 s, direct hit 15, spit 9 m/s; puddles cleared at each build start; caps 24 spits / 32 puddles; acid has its own hurt cue (not the fire one).

**5.9 Traps and mines:** upgrade heals to full; spike trap loses 1 HP per spike (~60 Walkers); mines: no fuse, 0.5 × 0.5 m, immune to fire and zombies, no building damage, no chains, no knockback; 2 m clear of spawns; only the owner upgrades; zombies don't path around traps.

**5.1 Upgrades:** Pistol base 100; marks only in HUD and shop (none at I); "replace weapon" warns upgrades are lost; exact damage (Pistol IV = 8.75).

**5.2 Axe and Chainsaw:** chainsaw slow multiplies with a Crawler bite (to 56 %); axe knockback 1.5 m stops at cover/barricades/map edge, may push into a car fire; instant axe swing.

**5.7 Brute:** radius 0.6 m (needs a wider pathing grid, the round B risk); spawns after 25 % of the wave; "Brute!" banner for the first one only, roar every time; weapons and turrets push it only 20 %.

**5.4 Flamethrower:** car fires stay full damage; flames never ignite players; burning zombies keep chasing; zombie burn 5 every 0.25 s; 1 fuel per firing tick, auto reload; no building damage; price 700.

**5.5 Grenade Launcher:** touch aim = stick push mapped to 3–12 m with a landing ring; rounds burst at a car's face (no lob over); minimum 3 m; no building damage; zombies pushed 0.6 m; no knockback on players; 20 m/s; price 800.

**5.8 Bloaters:** blast kills credit whoever popped it (passed down a chain); 40 damage to buildings; chain blasts one link per tick (max 8); radius 0.5 m; swell blast 20 ticks after it starts, standing still; gas slow = Crawler slow; wave 6 mix walker 40 / runner 20 / crawler 15 / spitter 10 / bloater 15.

**5.10 Floodlight and med station:** floodlight radius 4 m; both 1 × 1 m; med station heals in build and wave, through walls, never stacks; floodlight = cheap pooled glow (max 8), no full-screen light layer; prices floodlight 100 (150 HP), med station 400 (300 HP).

**5.11 Gear:** revive kit makes you revive in 1.5 s; armor adds its bonus to current HP when bought; Armor II full 350, no trade-in; running shoes ×1.1 multiply with slows; HUD icons 24 px next to HP.

**5.12 Consumables:** 0.5 s between uses; medkit also in build phases, not at full HP; button 64 px left of swap; using one doesn't stop firing/reload/swap; refill = full price; throw 2–8 m with a landing ring.

**5.13 Card shop:** rarity by price (≤ 250 common ×3, ≤ 500 rare ×2, epic ×1); reroll flat 20; no upgrade cards (upgrades stay always available); no price scaling per wave; no Pistol card; tap to select, tap again to buy; cards ≥ 96 × 112 px in a 3 × 2 grid; no extra gating of expensive cards early; seed-predicting cards accepted; start money stays 100.

## Notes for the builders (from the writers)

- 5.9 is the riskiest: traps and mines need a "not solid" flag skipped by every collision, sight, pathing and attack loop (5.9 lists them).
- 5.3, 5.2 and 5.7 share one knockback helper that stops at a barricade's face.
- 5.4 adds a quiet zombie-hit path (no event per flame tick); 5.4 owns the 50 % friendly-fire function, 5.5 owns `explode()`, 5.8 and 5.9 reuse them.
- 5.1 and 5.2 in the same round: the second to merge routes axe/chainsaw damage through the upgrade damage helper.

## Art method (designer, 2026-11-23)

**All new Epic 5 art is drawn in game code** (Canvas 2D, like the bus, cars and zombies today), not shipped as AI images. Reasons: easiest to edit, variants/damage/animation for free, one consistent style, no credits, and it makes later **weapon customization** possible (guns built from parts). Meshy and Claude's vector illustrations are used only as **references to aim for**. At build time all art is baked into a ready-made atlas so phones don't draw art at start-up. Story 4.11's Meshy sprites stay for now (reviewed and live); redraw them in code later only if they look out of place.

Round A shortlist (comparison page: claude.ai/artifact/G9RtYwhjfS9oujAQphB8VU): Shotgun G1/G3, Assault Rifle R2/R1, Spitter P1/P2/P4, metal barricade M1/M2, spike trap T1/T3, mine N1/N4. Round 2 code redraws requested: Spitter woman P2, gaunt Spitter P4, metal barricades, wire-and-glass trap T3, landmines.

## Art feedback, round 2 (designer, 2026-11-23)

- Spike trap = nailboard **T1**. Wire-and-glass T3 dropped (not recognisable without its name).
- **M1** metal barricade: perspective/feet look wrong → redraw strictly top-down (round 3). **M2** corrugated: good up close, too small to read in game → bolder game-size version (round 3).
- Mines: neither design liked → 5 new **round mines with a red dot** (round 3).
- New: **bear trap** as a second trap type → Story 5.14 (after round A).

## Final art picks, round A (designer, 2026-11-23)

Code drawings in `docs/art/epic-5/round-a/code-drawings.html` (round 3 badges for the newest).

| Object | Base look (now) | Upgrade-tier look (later) |
| --- | --- | --- |
| Shotgun (5.3) | G1 pump-action | G3 tactical (upgrades III–IV, Story 5.1) |
| Assault Rifle (5.3) | R2 wooden-furniture | R1 modern black (upgrades III–IV, Story 5.1) |
| Wood barricade ladder (5.9) | wood B6 → reinforced B8 → metal **M1c** | — |
| Spike trap (5.9) | T1 nailboard | — |
| Mine (5.9) | **N6** round pressure-plate mine, red dot | N9 (yellow-ring disc) for an improved mine |
| Bear trap (5.14) | **B-T1** | — |

Corrugated barricade (M2) dropped. Spitter (5.6): pick still open (P1/P2/P4; P2 needs more iteration). Rule: when the designer picks two, the first is the base look and the second the upgrade-tier look.

5.3 fairness rule: "point blank, all 8 pellets hit" holds within **1.35 m** (designer OK).

## Art decisions, later the same day (designer, 2026-11-23)

- Spitter (5.6) = **P4** (gaunt, pustules, acid trail). 5.6 currently draws P2: swap into `drawSpitter`.
- Metal barricade M1c: **remove the yellow plate**.
- 4.11's Meshy sprites are redrawn in game code (round 4 mockups accepted): wood barricade B6, sandbags S2, burning survivor effects. The reinforced barricade B8 is already in code (5.9). The **burning car** gets 3 new versions in the style of the game's existing cars (not Meshy), designer picks one → Story 4.12.
- Barricade mockups approved (wood B6 in code, reinforced B8, metal M1c without the yellow plate).
- Burning car: the three round-5 code versions were rejected ("the fire effect was better before"). Next: a particle-based fire lab in code (today's 4.11 fire vs three code fire styles, with smoke) before Story 4.12.

## Round B looks and more (designer, 2026-11-23: "every version is great, keep everything")

Page: claude.ai/artifact/GzRpZP8eS6n7JVMDs9ctcy (code drawings, copied to `docs/art/epic-5/round-b/looks.html`).
- **Brute (5.7): all five looks (BR1–BR5) are used as random variants**, one per Brute. Fix: in the wind-up pose the arms must be drawn UNDER the clothes (today they are drawn over them).
- **Fire Axe AX1, Chainsaw CS1, upgrade marks U1** are the base looks; the other versions are kept for upgrade tiers or skins later (rule: first = base, others = upgrade/skin looks).
- **Acid through thin walls (5.6 re-review):** puddles do NOT hurt across walls, cars and buildings (main session applied the recommended option; designer did not object).
- Fire: the designer likes the flames of fire-lab version C (fuel fire) but not its lava-style floor → version D (C's flames, normal asphalt with only a soft light) under review.
- **Fire = fire-lab version D** (designer, 2026-11-23): fuel-fire particle flames, smoke and embers on normal asphalt (scorch + soft flickering ground light, no lava pool), a ring of flames at the 2 m damage edge. Code in `docs/art/4-12/fire-lab.html` (panel D; survivor panel for the burning survivor). Story 4.12 builds it.
- **Melee can't hit through barricades and walls** (designer, 2026-11-23, after the 5.2 review found chainsaw farming from behind a barricade): wall buildings and shot-blocking map cover (walls, cars, bus, buildings) stop melee; low cover that bullets pass (sandbags, police barriers, traps, mines) doesn't. Applies to every melee weapon (Machete, Fire Axe, Chainsaw). Built in the 5.2 fix round.
