# Epic 5: designer decisions to confirm

**Designer: "ok" on 2026-11-23: every recommended value below is accepted.**

Written 2026-11-23 from the 13 story files (`_bmad-output/implementation-artifacts/5-*.md`). Each line is the story writer's **recommended value**. "ok" accepts all of them; change any line by its code (e.g. "5.8 D1: halve it").

Every story also starts with an **art pick**: the designer chooses the look from ~5 code-drawn proposals (Meshy/vector images only as references; see "Art method" below) before it's built.

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

**5.5 Grenade Launcher:** touch aim = stick push mapped to 3–12 m with a landing ring; ~~rounds burst at a car's face (no lob over)~~ rounds fly over everything except real buildings (changed 2026-11-23, see below); minimum 3 m; no building damage; zombies pushed 0.6 m; no knockback on players; 20 m/s; price 800.

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
- **Brute and narrow gaps** (designer, 2026-11-23, after the 5.7 review found players untouchable in 1 m car gaps): when the player is in a gap the Brute can't enter, its reach grows from 1.3 m to 1.8 m (same 0.5 s wind-up, dodged by stepping deeper; still needs a clear line).
- **Grenade Launcher lobs over obstacles** (designer, 2026-11-23, replacing 5.5's "no lob over"): rounds fly over cars, the bus, gas pumps, low walls, barriers, sandbags, barricades and turrets; only real buildings (map collision boxes with `building: true`: the corner shop, apartments, gas kiosk, diner, offices, warehouse) stop them at the face. A round aimed onto a car's roof lands at the car's near face (so the blast still sees around it). Explosions are still shielded by cars and the bus (FR-C unchanged).
- **Barricades stop bullets** (designer, 2026-11-23, replacing Story 4.2 / FR53's "bullets pass over barricades"): every barricade tier (wood, reinforced, metal; balance `stopsBullets`) stops every bullet — players' own, teammates', turrets' — and aim assist and turret targeting skip targets behind one. Turrets, sandbags, police barriers and floor buildings stop no bullets; map rules are unchanged (buildings, cars, the bus, pumps, the parking wall and the dumpster stop bullets). Bullets only: explosions, flames, melee, Spitter acid and Bloater gas keep their rules. Bots now aim at a zombie they can hit and strafe to open a line (bot sim: 2/3/4 bots win 5/4/5 of 6 seeded runs, from 5/6/6).

## Round C looks (designer, 2026-11-23)

Page: claude.ai/artifact/NasqdNNAhnHQEkbHVcamFZ (code drawings in `docs/art/epic-5/round-c/looks.html`).
- **Two flamethrowers** (designer: "fuel jet for the one with longer range but narrower, gas torch for the shorter but wider"): **Flamethrower** = FT1 military twin-tank body (shop icon to be improved) with the **FS1 fuel jet** stream; **Gas torch** = FT2 propane rig (main-session suggestion, FT3 rejected) with the **FS2 gas torch cone**. Proposed numbers (designer may change): Flamethrower 6 m reach, 20° cone, price 700; Gas torch 3 m reach, 60° cone, price 550; same burn damage/fuel rules as 5.4. Built in 5.4.
- FS3 rolling fire: rejected.
- Grenade Launcher: all three kept (GL1 base; GL2/GL3 upgrade or skin looks).
- Explosions: keep both **EX1 fireball** (Grenade Launcher, main-session suggestion) and **EX2 shockwave + debris** (the 5.9 mine blast, and later the 5.12 hand grenade). EX3 not used.
- Bloaters: **all five BL1–BL5 as random per-Bloater variants** (as the Brute).

## Ideas outside Epic 5 (designer, 2026-11-23)

- **Offline play (Bluetooth / local Wi-Fi): dropped.** The research on branch `claude/idea-offline-play` stays there for reference; nothing is scheduled.
- **Survivor customization: scheduled** as Stories 7.8–7.12 (Epic 7, with accounts; `docs/ideas/customization/`).
- **Building-system UX rework: scheduled** as Stories 5.15–5.25 (designer picked "B · Carry + drag"; `docs/ideas/building-ux/`). 5.15–5.19 client-only, can start any time; 5.20, 5.22, 5.24 after 5.10 and 5.14.
- **Epic 6 design: scheduled** — the revised Stories 6.1–6.12 replace the old Epic 6 texts in epics.md (`docs/ideas/epic-6/`, designer decisions D1–D7: Behemoth crash stun only, always 2 events per run, endless +40 zombies/wave up to 600 then +6 % HP, Ruins debris ambience only, floodlight 6 m in blackout (noted in Story 5.10), alive cap 110 while the Behemoth lives, event levers kept). Implied GDD updates (events 2 per run, endless cap 600) are recorded here; the supply drop's weapon list gains the Gas torch.

## Round D looks (designer, 2026-11-23)

Page: claude.ai/artifact/9VXjyGj7JTSgVDJKUcD3xQ (code drawings in `docs/art/epic-5/round-d/looks.html`).
- **Floodlight (5.10): FL1 tripod work light = base look; FL5 stadium lamp on sandbags = upgrade/skin look.** FL2–FL4 not used.
- **Med station (5.10): all five (MS1–MS5) rejected**; iteration 2 → **MS10 case stack with a glowing green-cross LED panel** (designer, 2026-11-23).
- **Gear icons (5.11): GR6** = the realistic painted objects (GR4) on embossed metal tags (GR2).
- **Consumable icons (5.12): CI4** (realistic painted objects).
- **Hand grenade (5.12): all three kept** (HG1 pineapple base; HG2 smooth M67, HG3 can-shaped as variants/upgrade looks). The thrown grenade uses these, not 5.5's 40 mm round.
- **Molotov (5.12): all three kept** (like the grenade): MB1 wine bottle / even spread = base; MB2 beer bottle / forward splash and MB3 flask / joining puddles as random variants.

## Build-bar icons (designer, 2026-11-23, Story 5.16 follow-up)

Page: claude.ai/artifact/7kKW2xQre8zUWQZri7tWg3 (code drawings in `docs/art/5-16/icons/index.html`).
- **Buildings get their own build-bar icons**, separate from the top-down world art (like weapons have their own shop icons). 5.16 ships with the world art in the tiles; the icons come in a small follow-up story.
- Style **I1 tilted objects** (a low three-quarter view with height). Wood barricade **I1**, spike trap **I1**.
- Auto-turret: **T1 sentry gun** (base) and **T2 armoured dome** kept (by the two-pick rule: T2 for a later turret upgrade tier or skin).
- Mine: **M1 pressure mine** (thick olive disc, raised plate, red light).
- Later buildings (med station, floodlight, bear trap) get an I1-style icon when built; until then the tile falls back to the world art.

## Bear trap (5.14) (designer, 2026-11-23: "Okay with everything")

All recommended values in `_bmad-output/implementation-artifacts/5-14-bear-trap.md` › Designer decisions accepted: 1 × 1 m floor trap, plate = zombie centre within 0.35 m; snap 5 damage, holds 3 s (a Brute 1.5 s, trap wears normally; Bloater full 3 s); a held zombie can't move or be pushed but still bites/spits/swells in reach; one zombie per catch; never catches players or in a build phase; afterwards it is closed and harmless until any player stands on it 1 s (free, any phase), and every trap re-arms at build start; $50, 100 HP, 25 HP per catch (4 catches), repairable; fire wears it, mine and Bloater blasts don't (as the spike trap: blasts only damage walls; builder's correction, accepted by the main session 2026-11-23); closed look = B-T1 with jaws shut, drawn in code, designer reviews the screenshot.

## Alignment answers (designer, 2026-11-23)

Answers to the 16 open questions in `docs/alignment/alignment-check-2026-11-23.md`. Designer: "everything okay", so the report's recommendation stands for every question, except Q2 and Q15. Q1, Q5, Q6 and Q7 were settled earlier the same day.

| Q | Topic | Answer |
| --- | --- | --- |
| Q1 | Medkit in build phases vs. hidden buttons | In build phases the **consumable and swap buttons move above the build bar's top-left** instead of hiding. Built by 5.12. |
| Q2 | Epic 9 art | **No hiring at all** ("we won't hire anybody"). Epic 9 is a polish pass of the code-drawn art **and** audio, made without hiring: code/procedural, or licensed/free libraries. No hired artist, no hired sound designer. |
| Q3 | Supplies unlock prices | Gas torch 350, Bear trap 100, one "Barricade upgrades" unlock (reinforced + metal) 150. |
| Q4 | Small-phone layout | The 5.20 undo chip sits above the build bar's top-left; the 5.21 action bar keeps 78 × 56 at bottom 112; ACs checked at 568 × 320 and 800 × 360 with ≥ 12 px gaps. |
| Q5 | Who builds the item chip | **5.19** builds it (not 5.18). |
| Q6 | Molotov fire across walls and cars | Same rule as acid: a fire zone hurts only with a clear line from the zone centre (plus a test). Built by 5.12. |
| Q7 | Bear trap | As the designer's 5.14 decisions D1–D12 (section "Bear trap (5.14)" on the 5.14 branch): a Brute is held 1.5 s; any standing player re-arms a closed trap by standing on it 1 s; every trap re-arms at build start; worn out after 4 catches; held zombies don't block players. Bloater blasts: see the open point below. |
| Q8 | Boss and event cover | Behemoth slam and throw ignore cover ("the drawn zone is the promise"). The gas-leak blast uses the normal blast line of sight. Ruins rubble stops melee and blasts; lobs fly over it (it is not `building: true`). |
| Q9 | Downed players and event pickups | Standing players only take the supply crate or lead the survivor NPC. |
| Q10 | Earnings decision owner | The Epic 5 balance pass after round E (4.10 is deferred); recorded in the GDD Economy section. |
| Q11 | Building cap | Keep 6 per player; review it in the Epic 5 balance pass. |
| Q12 | Solo status | "Solo is allowed, not balance-tuned"; solo runs at × 0.4. |
| Q13 | Card pool exhaustion | Show fewer cards; Reroll is disabled when no new draw exists. |
| Q14 | Ping button | Top-right or by the minimap, hidden while holding a building; pings draw above the blackout darkness. |
| Q15 | Reference phones | The Honor 10 is **not** a test phone. The low-end floor is the **Xiaomi Mi 11i** (confirmed by the designer 2026-11-24). It replaces the Honor 10 everywhere (7.9 budgets, NFR1, 10.2). |
| Q16 | Turret kill pay during the 120 s reconnect hold | Turret kills keep paying into the held wallet during the 120 s, then stop. |

**Open point for the designer (Q7):** the 5.14 story's accepted text says "fire and Bloater blasts wear it, mines don't", but the answer passed on for this pass says "Bloater blasts don't wear floor traps". Which one holds?

Applied by the course correction in `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-23.md`.

- **Solo Behemoth HP = × 0.4** (designer, 2026-11-24), like every other solo scaling.
- **Bear trap closed look (D11) approved** as built (designer, 2026-11-24).

## Epic 6 looks (designer, 2026-11-24)

All Epic 6 look picks (Ruins, Collapse, blackout, Behemoth, events, vote and dawn) are in **`docs/epic-6-decisions.md`** (page claude.ai/artifact/7ikXRSUD7ZURpADLAtEPSJ, `docs/art/epic-6/looks.html`).
- **Take-back after use (5.20 review, designer "everything okay", 2026-11-24):** option B — once a building has done its job in the current build phase (a med station healed someone), taking it back refunds only the normal 50 % sell share; med stations keep healing in build phases. Sell refunds stay based on what was paid (not HP): a fresh rebuy costs exactly a repair, so selling a worn building earns nothing extra.

## Early weapon card art (designer, 2026-11-24, Story 5.13 follow-up)

Page: claude.ai/artifact/7MPKNLcAPBgPjiATVK4Cok (code drawings in `docs/art/5-13/early-weapons.html`, `EARLY` script block; screenshots in `docs/art/5-13/early-weapons/`).
- The three Epic 1 weapons get side-view shop art in place of the generic SVG pictogram on the 5.13 cards (`KindGlyph` in `ShopScreen.tsx`). **All nine drawings are kept**; by the two-pick rule the first is the base look, the others upgrade-tier or skin looks later.
- **SMG: S1** compact stamped-steel (wire stock, straight stick magazine) = base; S2 boxy suppressed and S3 wooden-stock with drum kept. S3's drum seen almost edge-on (designer reference photo), seated in a magazine housing.
- **Hunting Rifle: H1** walnut bolt-action with scope = base; H2 lever-action (brass receiver) and H3 olive-camo synthetic with scope and bipod kept. All three stocks redrawn from the designer's reference photos (H1 swept pistol grip and recoil pad; H2 curved wrist and dropped butt; H3 broad swept-back grip, box magazine).
- **Machete: M1** classic black-handle = base; M2 panga and M3 rusty kukri-style kept.
- Build: port `smgS1` / `rifleH1` / `macheteM1` (signature `(ctx, size)`, metres, centred, same helpers) into `apps/client/src/render/city/weaponArt.ts` as `smg`, `hunting_rifle`, `machete` icon views in `WEAPON_ART`, with `ICON_Y` 0.44 / 0.5 / 0.5; icon only (the top-down in-hand art is unchanged). The kept variants (S2, S3, H2, H3, M2, M3) can go in `WEAPON_TIER_ICON` / `WEAPON_TOP_TIER_ICON` for upgrades III / IV, or wait for skins.
