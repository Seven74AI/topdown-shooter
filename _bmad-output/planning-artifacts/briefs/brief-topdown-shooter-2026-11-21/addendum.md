---
title: Game Brief Addendum — topdown-shooter
created: 2026-11-21
updated: 2026-11-21
---

# Addendum

Detail that came up during the brief and belongs in the GDD, the architecture or later work.

## Art direction: how Dead City was chosen
Three rounds of playable style probes, each a live co-op horde fight with the same weapons:

| Round | Styles | Result |
|---|---|---|
| 1 ([style-lab.html](style-lab.html)) | Pixel Grit, Neon Vector, Toybox, Lamplight | Lamplight liked, but not as a constant look; kept as **blackout waves** |
| 2 ([style-lab-r2.html](style-lab-r2.html)) | Ink Sketch, Comic Pop, Diorama, Duotone | None chosen; the user asked for grittier and scarier |
| 3 ([style-lab-r3.html](style-lab-r3.html)) | Dead City, Grindhouse, Blood Moon, CCTV | **Dead City chosen** |
| Decay ([dead-city-decay.html](dead-city-decay.html)) | Dead City across 5 decay stages | Confirmed the city decay idea |

Styles that were not chosen could still serve as special levels or modes later. For example, CCTV footage would make a strong intro, and a Blood Moon cemetery could be a special district.

## City decay stages (from the decay probe)
The 10-wave run moves through these at about 2 waves each:

| Stage | Waves | What you see | Gameplay idea |
|---|---|---|---|
| Evening | 1–2 | Lights on, shops lit, parked cars, clean street | Calm opening to learn the map; lit shops as places to loot or build |
| Panic | 3–4 | Abandoned cars with doors open, police barriers, papers, first blood | Cars become cover and choke points |
| Breakdown | 5–6 | Burning wrecks, rain, sandbags, broken glass | Fires light the area and burn whoever walks through, zombies and players |
| Ruins | 7–8 | Burned-out cars, rubble, cracks, weeds, flickering lights | Rubble blocks paths and tightens the arena; flicker warns of the blackout |
| Collapse | 9–10, then endless | Power out, fallen poles, heavy rain, fog, overgrowth | Blackout waves (in the probe, every other wave) |

## Zombie roster (first pass, from the round 3 probe)
| Type | Role | Behavior | What it asks of the team |
|---|---|---|---|
| Walker | The crowd | Slow, arms out, comes in numbers | Crowd control |
| Runner | Flanker | Fast and fragile, sprints around the line | Someone watching the sides |
| Crawler | Ankle-biter | Low, slow, easy to miss, leaves a blood trail | Attention in the chaos |
| Brute | Wall breaker | Huge, slow, barely flinches when hit | Focused high damage; melee needs support |
| Bloater | Living bomb | Explodes into gas that also hurts other zombies | Timing: pop it inside the crowd, not next to you |
| Spitter | Ranged | Stops at a distance, spits acid | Punishes players who camp behind turrets |

## Mechanics ideas to develop in the GDD
- **Wave 10 extract-or-stay vote:** the team decides together whether to push their luck.
- **Wave modifiers:** blackout is the first; fog, fast zombies and boss waves are candidates for variety in endless mode and later runs.
- **Readability:** a colored ground ring per player worked in the probes; zombie types need distinct silhouettes because the palette is muted.
- **Melee under twin-stick:** a wide arc swing on the aim direction worked in the probes; it still needs a playtest on real phones.

## Technical notes for the architecture
- **Server-authoritative simulation** is likely needed: the horde must be identical for all players, and the server also has to hold run state for **pause and resume**.
- **Join mid-run:** the late joiner needs catch-up currency or gear so they are not useless in wave 7.
- **Horde sync:** sending 150+ zombie positions to phones needs a compact network format; this is the first thing the prototype must prove.
- **Rendering:** the probes ran 150+ zombies with lighting effects on a single 2D canvas. Real phones still need testing; full-screen effects (rain, grain, blackout) should be optional.
