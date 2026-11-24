# Epic 6: designer decisions

Design decisions D1–D7 (boss, events, endless): `docs/ideas/epic-6/proposal.md` § 0 (also summarised in `docs/epic-5-decisions.md`).

## Epic 6 looks (designer, 2026-11-24)

Page: claude.ai/artifact/7ikXRSUD7ZURpADLAtEPSJ (code drawings in `docs/art/epic-6/looks.html`, screenshots in `docs/art/epic-6/ingame/`). All art is drawn in game code (art method: `docs/epic-5-decisions.md`). Lines marked *(proposed)* are the session's proposal awaiting the designer's "ok".

| Section | Story | Picked | How the variants are used |
| --- | --- | --- | --- |
| 1 Ruins | 6.2 | **all four**: RU1 concrete + rebar, RU2 brick, RU3 wall slabs, RU4 fire-gutted | *(proposed)* one material per run, picked by the `decay` stream (the whole map matches); RU4 is the endless look |
| 2 Collapse | 6.4 | **all four**: CO1 dead grid + haze, CO2 rolling fog, CO3 ash fall, CO4 flooded street | *(proposed)* CO1's dead grid (dead lamp heads, fallen streetlight, fire = the only warm light) always; the fog/weather style (CO1 haze, CO2 fog bank, CO3 ash, CO4 flood) is one per run from the `decay` stream, rotating in endless |
| 3 Blackout | 6.3 | **BL3 pitch 5 %**, with **BL2 moonlit 20 %** kept, getting darker through the run: 20 % → 10 % → 5 % | *(proposed)* power failure in waves 6–8 = 20 % moonlit (blue cast); wave 9 = 10 %; wave 10 and every endless blackout = 5 % pitch with crisp beam edges. Build phases at stage 5 stay half of the wave's darkness |
| 3 Beams | 6.3 | **rain streaks sparkling inside every beam and the floodlight pool (from BL4)**; **no bright hot core** down the beam | *(proposed)* no lens flare either (it came with the core); floodlight 6 m in blackout (D5) |
| 4 Behemoth | 6.5–6.7 | **all four**: BH1 prototype, BH2 site worker, BH3 overgrowth, BH4 riot cop | *(proposed)* one random look per Behemoth (like the Brute's five); endless Behemoths never repeat the previous look. Tells as drawn (red + white hatching, dashed edge, hole for the body, CRASH mark, skull on the target, boss bar with gold 50 % notch) |
| 5 Car alarm | 6.8 | **CA3** icon only (CA1, CA2 skipped) | a pulsing bell marker over the car; the 15 m pull is not drawn as rings |
| 5 Stampede | 6.8 | **ST1** dust cloud + amber chevrons | |
| 5 Gas leak | 6.9 | **GL1** vapour cloud + dashed 6 m ring + countdown arc; **GL3** propane tank kept as an idea | *(proposed)* GL3's propane tank for a later map whose gas source is a tank, not a forecourt cap |
| 5 Supply drop | 6.9 | **green smoke (SD2) with the SD3 crate strapped to a pallet** | marker shows the weapon (D7) |
| 5 Survivor | 6.10 | **all three**: SV1 yellow raincoat, SV2 nurse, SV3 office worker | *(proposed)* one random per event |
| 5 Power failure | 6.10 | no new art (Ruins flicker 2 s, then the blackout) | |
| 6 Vote | 6.11 | **EX1** two big buttons + slot chips + ring timer | |
| 6 Dawn | 6.11 | **DW1** warm sunrise or **DW2** blue hour (open) | *(proposed)* DW1 on Extract after wave 10; DW2 on an endless extract and behind "Lost in the city" |

Colour rule from the events (designer: "perfect"): amber = an event you can use, yellow-green = gas, red = boss danger only, white = pick-ups and people.
