# Epic 5 balance pass: findings and proposals

Written 2026-11-24 for the designer. **Nothing is changed in the balance JSON yet.** Answer "ok" to take every recommendation, or give codes (e.g. "B1 ok, B2 0.3, no B5").

Interactive page (money per build, with sliders): https://claude.ai/artifact/UQcr75ZrboG6PdYX57z9K5 (source `docs/balance/epic-5-economy.html`).

## Recommendation first

1. **Earnings (Q10): raise the wave-clear bonus from 10 × N to 15 × N (B1).** This has been the named fallback since Epic 3. With start money 200, a 10-wave run then lands at **2,500–2,930 per player for 2–4 players**, inside the GDD target of 2,500–3,000. Today 3–4 players fall short (2,220–2,440).
2. **Solo: zombies × 0.4 → × 0.35 (B2).** At × 0.4, solo bots held out only **1 of 12** runs. At × 0.35 (with the weapon fixes) they hold out 7 of 12, about the same as 2-player bots.
3. **Fix four weapons that the 10-HP Walker makes weak** (B3–B7): Pistol damage 6, Assault Rifle 10 damage at 6 shots/s, Shotgun pellets 5, Fire Axe swings faster, Grenade Launcher blast 2.5 m and price 700.
4. **Small price fixes:** mine 35 (B8), Body armor II 300 (B9).
5. **Keep:** start money 200, the **6-building cap (Q11)**, the turret, med station, traps, consumables, the Flamethrower and the card-shop rules.

## How this was measured

- New tool `tools/sims/balancePass.ts`. It runs the real game headless with bots, the same loop as the existing sims, and also logs money per wave per player, the wallet at each build, and how many of the 6 cards that wallet can buy. Bots shop with the card-minded list from `sixWaveSim.test.ts`.
- **6-wave runs** (today's game): 1/2/3/4 players × 8 seeds (solo × 12).
- **10-wave runs** (Epic 6 shape, using Story 6.1's planned mix for waves 7–10, 2 Brutes each): bots in god mode so every run plays all 10 waves (Story 6.1's D2 method). 1–4 players, 18 seeds pooled per team size.
- Weapon value: `tools/sims/weaponTable.ts` (numbers straight from the JSON) plus bot runs with fixed loadouts (2 players × 4 seeds, no shopping).
- **Bots never dodge and never kite on purpose.** Survival numbers are a weak signal only. Money numbers are solid, except **assists**: bots earn assists worth about 14 % of their kill money, the GDD assumed 50 %, so human teams will likely earn somewhat **more** than shown.

## 1. Earnings per player (start money 200)

**Per wave, 10-wave run** (kill + assist money from the sims, plus today's wave bonus 10 × N):

| Players | W1 | W2 | W3 | W4 | W5 | W6 | W7 | W8 | W9 | W10 | **Run total incl. 200 start** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 (× 0.4) | 42 | 90 | 142 | 206 | 273 | 339 | 400 | 447 | 532 | 563 | **3,233** |
| 2 | 37 | 76 | 126 | 178 | 234 | 282 | 312 | 356 | 389 | 466 | **2,657** |
| 3 | 33 | 72 | 114 | 173 | 231 | 258 | 287 | 314 | 344 | 413 | **2,437** |
| 4 | 34 | 73 | 118 | 176 | 216 | 225 | 246 | 274 | 310 | 352 | **2,224** |
| GDD curve (4p) | 51 | 102 | 153 | 204 | 255 | 306 | 357 | 408 | 459 | 510 | 2,500–3,000 |

- **The target is met at 1–2 players, missed at 3–4.** 4 players are 11 % below the low end. This is not the old "4–19 % below" gap: start 200 and the new zombies' rewards (Spitter 5, Bloater 6, Brute 25) closed part of it.
- Each extra player gets fewer zombies of their own (× 0.4 / 0.6 / 0.8 / 1.0 spread over 1–4 people means 16 / 12 / 10.7 / 10 zombies per player per wave-step). That's why solo earns the most.
- **Wealth gap inside a team:** in 4-player runs one bot earned 720 and another 3,848 in the same run (the best weapon gets the kills). The wave bonus is the only money that is equal for everyone.
- **Today's 6-wave run:** 4 players earn ~890 per player (GDD share for 6 waves: 920–1,110), 2 players ~930, solo ~1,150.

**With B1 (15 × N):** +5 × N per wave, **+275 per player per 10-wave run** (+105 in today's 6-wave run). 10-wave totals: 1p 3,508 (3,200 with B2), 2p **2,932**, 3p **2,712**, 4p **2,499**. All are at or inside the target band, and human assists add on top.

## 2. What a player can afford, build by build

Money a 4-player player has had **in total** before each build (start + everything earned so far):

| Build | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
|---|---|---|---|---|---|---|---|---|---|---|
| Today | 200 | 234 | 307 | 425 | 601 | 817 | 1,042 | 1,288 | 1,562 | 1,872 |
| With B1 | 200 | 239 | 322 | 455 | 651 | 892 | 1,147 | 1,428 | 1,742 | 2,097 |

**Cards the wallet could buy** at the start of each build (of 6; bots, all team sizes alike): build 0 **2.7–3.0**, build 1 **0.3–0.8**, build 2 **0.0–0.4**, build 3 **2.0–2.7**, later 2.5–5.

- **Build 0 works:** 200 buys the SMG, the Machete or any 150 gear. The Shotgun (250) is just out of reach.
- **Builds 1–2 are dead for cards:** a player earns ~35 in wave 1 and ~75 in wave 2, and the cheapest card is 150. The early builds are for barricades (40), traps (50–80), a medkit (60) and upgrades.
- **From build 3** there's a card most builds. The 700–800 weapons (Flamethrower, Grenade Launcher) are reachable around **build 5** if you save everything.
- Typical 6-wave spend: SMG 200 + SMG II 120 + turret 250 + 2 barricades 80 + Armor I 150 ≈ 800 of ~1,090.
- **Verdict:** the shop feels usable at build 0 and from build 3, not in builds 1–2. B3 (Pistol 6) gives builds 1–2 a meaningful buy: Pistol upgrades at 60 each, always on sale, now reach real breakpoints. Start money 250 (B10) would let you save into a card by build 2, but I don't recommend it (see the table).

## 3. Weapon value

Zombie HP: Walker 10, Crawler 8, Runner 6, Spitter 12, Bloater 25, Brute 120. **Walkers are 40–100 % of every wave, so "shots to kill a Walker" decides almost everything.** Upgrades are damage only (+25 % per level). They help only when they cross a breakpoint.

| Weapon (price) | Walker kills/s, burst / with reloads | Sustained DPS per 100 money | Upgrade breakpoints vs Walkers | Bot runs, 2p, fixed weapon, no buildings |
|---|---|---|---|---|
| Pistol (free) | 1.5 / 1.2 | – | **none, I–IV all 2 shots** | wiped W4 (4/4) |
| SMG (200) | 4 / 2.7 | 16 | **II: 3 → 2 shots, +50 %** (best buy in the game, 120) | **held out 4/4** |
| Hunting Rifle (350) | 1.2 / 0.75 (pierces 5) | 7.5 | one-shots already; upgrades only vs Brute | 1/4 |
| Machete (150) | 2.5 per zombie in the arc | 20 | one-shots already | wiped W4 |
| Shotgun (250) | 1.2 shots/s, up to 2 Walkers per shot (3 pellets each) | 10 | II: 2 pellets per Walker, 4 per shot | 0–1/4 |
| Assault Rifle (450) | 4 / 2.6, **same as SMG I** | 8 | only III (990 total): 1 shot | 4/4 |
| Fire Axe (300) | 1.1 per zombie in the arc, **less than half the Machete** | 11 | one-shots already | wiped W4 |
| Chainsaw (600) | 5 / 5 | 10 | only IV (1,680 total) | wiped W4 |
| Grenade Launcher (800) | 0.5 blasts/s, 2 m blast | **2.5 (worst)** | one-shots already | wiped W3–W4 |
| Flamethrower (700) | every zombie in a 6 m × 20° cone dies each 0.25 s pulse | 7.6 | one-shots already | **4/4** |
| Gas torch (550) | same, 3 m × 60° | 9.7 | one-shots already | wiped W4 |

- **Dominant:** the **SMG**, for value (200 matches the 450 Assault Rifle; SMG II at 320 beats it). The **Flamethrower** is the crowd king. Both are fine as "the good buys", but the AR has no reason to exist next to the SMG.
- **Weak or useless:** Pistol upgrades (never change Walker shots), the **Assault Rifle** at I–II, the **Fire Axe** (worse than the Machete at everything but Bloaters and Brutes), the **Grenade Launcher** (weaker blast than a 27-money hand grenade: 2 m vs 2.5 m), and **upgrades on any weapon that already one-shots Walkers** (Rifle, Machete, Axe, GL, flames). These only help against Bloaters and Brutes.
- Melee bots wipe in wave 4 because bots don't close in or dodge Spitter acid. No conclusion on melee from bots.
- Systemic idea (not in this pass, needs code): upgrades III–IV could also add fire rate or reload speed, so upgrades matter for one-shot weapons. Recommendation: revisit after a human playtest.

## 4. Buildings and the 6-building cap

| Building | Value | Bot evidence (2p and 1p, Pistol only, normally wipes in W4) |
|---|---|---|
| Auto-turret 250 | 15 DPS forever, 300 HP, draws zombies; pays back ~its price over a 10-wave run (≈ 210 kills × 50 %) | **2 turrets: held out 4/4 (2p), 2/4 (solo)**, the strongest single purchase |
| Wood 40 → reinforced +50 → metal +70 | 5.0 / 3.9 / 3.75 HP per money; repair 50 % (10 HP per money) | bots box themselves in (barricades stop bullets), a placement artefact |
| Spike trap 80 | ~11 damage to a Walker crossing it (enough to kill), slow 40 % | some help (reaches W4–5) |
| Bear trap 50 | holds 3 s, 4 catches | small |
| Mine 60 | 80 damage in 2.5 m, once. A hand grenade does 40 in 2.5 m (enough for all but the Brute) for 27 each, thrown where you want. | bots stand on their own mines |
| Med station 400 | 5 HP/s in 2 m in waves and builds | bots rarely afford it; no signal |

- **Cap 6 (Q11): keep.** In a 6-wave run money runs out before the cap: "SMG + 6 turrets" bots ended with the same result as "SMG + 1 turret". In a 10-wave run (~2,500) six turrets (1,500) become possible. Watch it in 6.1's sim; no change now.
- Turret: strong, but it is the "build your stand" pillar. Keep 250.

## 5. Solo difficulty (since Spitters, Brute, Bloaters)

| Solo setup (12 seeds) | Held out | Notes |
|---|---|---|
| Today (× 0.4) | **1/12** | worse than HANDOFF's "2/4"; most die in W3–W4 (Crawlers, Spitters) |
| × 0.4 + Pistol 6 | 2/12 | |
| × 0.35 + B1, B3–B9 | **7/12** | 2-player bots with the same changes: 6/8 |
| × 0.3 + B1, B3–B9 | 11/12 | too easy for bots, so likely trivial for humans |
| × 0.3, nothing else | 5/12 | |

- Solo can't be revived, the Brute comes alone at full HP, and the revive-kit card is useless solo (idea for later: hide it in solo).
- 10-wave solo earnings at × 0.35 with B1 ≈ 3,200 (a bit above the band; solo is "allowed, not tuned", Q12).
- **The Behemoth's solo × 0.4** (designer, 2026-11-24) is a separate number; B2 doesn't touch it unless you say so.

## 6. Consumables and gear

| Item | Price | Value | Verdict |
|---|---|---|---|
| Medkit | 60 | 50 HP now, also in builds (builds already heal 50 %) | fair |
| Grenades ×3 | 80 | 3 × (40 in 2.5 m), ~27 per blast; bots killed 30–55 zombies per run with them | strong, fine |
| Molotovs ×2 | 100 | 3 m, 4 s, 8/s: anything that stays 1.5 s dies | fine |
| Body armor I | 150 | +25 HP (+25 %), 6 money per HP | good |
| Body armor II | 350 | +50 HP, no trade-in, so **+25 HP for 350 after Armor I** (14 per HP) | overpriced → B9 |
| Running shoes | 150 | +10 % speed | fine (kiting; bots can't show it) |
| Revive kit | 150 | revive in 1.5 s instead of 3 | fine in co-op, useless solo |

## Proposals

Each one is independent; change or drop any.

| # | Change | Current → proposed | Why | Expected effect |
|---|---|---|---|---|
| **B1** | Wave-clear bonus | 10 × N → **15 × N** | Closes the 3–4 player earnings gap; equal for everyone (helps whoever gets fewer kills) | +275 per player per 10-wave run (2,500–2,930 for 2–4p); +105 in today's 6 waves |
| **B2** | Solo zombie count | × 0.4 → **× 0.35** | Solo bots hold out 1/12 today | 7/12 with the other changes (2p: 6/8); solo earns a little less (~−12 %) |
| **B3** | Pistol damage | 5 → **6** (II 7.5, III 9, IV 10.5) | Upgrades never changed Walker shots; builds 1–2 need a useful buy | Runner 1 shot at I, Crawler at III, **Walker at IV** (180 total: 3 kills/s, close to SMG I); Pistol +20 % DPS. Replaces 5.1's "Pistol IV = 8.75" |
| **B4** | Assault Rifle | damage 7 → **10**, rate 8 → **6**/s | Same Walker speed as the 200 SMG for 450 | One-shots Walkers: 6 kills/s burst, 4.3 with reloads (SMG I 2.7, SMG II 4.05) with better range and aim; ammo lasts 5 s |
| **B5** | Shotgun pellet damage | 4 → **5** (point blank 40) | 250 money for Pistol-like results | 2 pellets per Walker: up to 4 Walkers per shot; +25 % DPS. Replaces 5.3's "point blank always 32"; its upgrades then only matter vs Bloater/Brute |
| **B6** | Fire Axe swing rate | 1.1 → **1.4**/s (price stays 300) | Worse than the Machete at everything but big zombies | +27 % kills; wider, longer arc and 1.5 m knockback make it the crowd-control melee. Price kept so it stays a rare card and doesn't crowd the SMG out of early offers (pre-mortem) |
| **B7** | Grenade Launcher | blast 2 → **2.5 m**, price 800 → **700** | Worst damage per money; its blast was smaller than a hand grenade's | +56 % blast area; still an epic card. Risk: more friendly fire (50 %) near teammates |
| **B8** | Mine price | 60 → **35** | A grenade blast costs ~27 and goes where you aim; a mine also takes a building slot | Mines become worth a slot as a trap line |
| **B9** | Body armor II price | 350 → **300** | +25 HP for 350 after Armor I | Still a rare card (≤ 500) |
| B10 | Start money | 200 → 250 | Would let you save into a card by build 2 and buy the Shotgun at build 0 | **Not recommended:** B1 + B3 cover it, and +50 to everyone pushes 1–2 player runs past 3,000 |
| B11 | Building cap | 6 → (keep) | Q11 asked for a review | **Keep 6**: money runs out first in today's runs; re-check with 6.1's 10-wave sim |
| B12 | Turret, med station, traps, consumables, Flamethrower, card-shop rules | keep | No clear problem in the numbers | — |

**Watch items for Story 6.1's 10-wave sim:** 2-player earnings above 3,000 once humans assist, turret count near the cap, Flamethrower dominance, solo too easy at × 0.35.

## Pre-mortem (bmad-advanced-elicitation)

"Two months on, the balance pass failed. Why?" Causes found and what changed:
- **The SMG disappeared from early offers.** A 250 Fire Axe would become a common card and take offer slots from the SMG, and survival depends on getting the SMG early. → **B6 keeps the price at 300**; B7/B9 stay in their rarity bands.
- **We broke accepted decisions without saying so.** → B3 and B5 name the 5.1/5.3 lines they replace.
- **Humans earn more than bots and overshoot.** → B1 is one number, easy to undo; Story 6.1 re-logs earnings.
- **Too many changes at once to read a playtest.** → Each code is independent and listed with before/after.
- **Solo became trivial.** → × 0.35, not × 0.3; the Behemoth's solo number stays separate.
- **Builds 1–2 are still empty.** → B3 makes Pistol upgrades real buys; B10 offered and declined with reasons.

## Reproduce

```
npx tsx tools/sims/balancePass.ts --players 1,2,3,4 --seeds 1-8                 # today's 6-wave run
npx tsx tools/sims/balancePass.ts --players 4 --seeds 1-6 --tenwave --god        # 10-wave earnings
npx tsx tools/sims/balancePass.ts --players 2 --seeds 1-4 --list "" --loadout smg,smg
npx tsx tools/sims/balancePass.ts --set economy.waveClearBonusPerWave=15 --set waves.playerCountScale.0=0.35
npx tsx tools/sims/weaponTable.ts
```
