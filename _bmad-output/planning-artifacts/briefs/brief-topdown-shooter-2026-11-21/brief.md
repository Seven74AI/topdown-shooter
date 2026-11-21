---
title: Game Brief — topdown-shooter (working title)
status: draft
version: 0.1
created: 2026-11-21
updated: 2026-11-21
---

# Game Brief — topdown-shooter (working title)

> Draft v0.1. Items tagged **[ASSUMPTION]** are Claude's proposals and still need the user's yes / no.

## Vision

**Core fantasy [ASSUMPTION]:** *You and your friends hold out together while your city falls around you, one wave at a time.*

**Elevator pitch:** A 2D top-down co-op horde shooter for 2–4 friends, played in a phone browser from a shared link. Waves of zombies grow from a handful to a flood while the district you picked slides from a normal evening into total collapse. Between waves you spend what you earned on weapons, gear and defenses. When everyone is down the run ends, but your unlocks carry over to the next one.

**What players should walk away feeling [ASSUMPTION]:** the panic of a screen full of zombies, the pride of a defense that held, and the story of *that* run ("the bloater took out the whole barricade on wave 14").

## Stakes & audience
- Passion project for the user and their friends. Not a commercial launch.
- **Players:** the user's friend group, 2–4 at a time, each on their own phone, each with an account.
- **Sessions [ASSUMPTION]:** evening sessions with friends; a full run to collapse is the long goal, early deaths make shorter runs.

## Core loop
1. **Pick** a district and create or join a game (lobby, share link).
2. **Fight** a wave: twin-stick combat, pure action, no menus.
3. **Build phase** between waves: spend currency on weapons, equipment and buildings (turrets, barricades…).
4. The city **decays** a step, the next wave is bigger and nastier.
5. Repeat until everyone is down → **meta-progression**: unlocks widen the item pool, plus small capped boosts → next run.

## Gameplay pillars [ASSUMPTION — 4 proposed, confirm or cut]
1. **Horde chaos** — large crowds are the spectacle; fighting 150+ zombies must feel powerful, not cluttered.
2. **Build your stand** — what you buy and build between waves decides whether the next wave breaks you.
3. **A city that falls** — the district visibly and mechanically degrades over the run; late waves play differently, not just harder.
4. **Better together** — roles emerge from gear (melee / mid / long range), and zombie types demand different answers, so a team beats four solo players.

## Key mechanics (decided)
- **Controls:** twin-stick on touch (left thumb move, right thumb aim and fire).
- **No classes:** your role (melee, mid, long range) comes only from the gear you buy and find.
- **Waves + build phase:** building and upgrading only between waves.
- **Run structure:** play until everyone is down. ~**20 waves** from a clean city to collapse.
- **City decay (5 stages: Evening → Panic → Breakdown → Ruins → Collapse)** changes gameplay: abandoned cars as cover, fires, rubble narrowing paths, flickering then dead streetlights.
- **Blackout waves:** the "Lamplight" idea. In the darkness you only see what flashlights, turrets and muzzle flashes light up. They are part of the late game once the power grid dies.
- **Districts:** players pick a district at the start of a run; it decays around them. More districts over time.
- **Meta-progression:** mostly unlocks that add to the item pool, plus small capped permanent boosts (newcomers stay viable).
- **Zombie roster (first pass):** Walker, Runner, Crawler, Brute, Bloater, Spitter. Each one tests a different team skill.

## Art & audio direction
- **Art: Dead City.** Gritty, realistic, muted colors, rainy urban streets at night. Chosen after 3 rounds of playable style probes (see the files in this folder).
- **Readability rule:** muted palettes make friends and foes look alike, so players get a colored ground ring (or equivalent) and zombie types are told apart by silhouette.
- **Tone [ASSUMPTION]:** tense and grim rather than comedic. Blood is part of the look. Level of gore still open.
- **Audio [ASSUMPTION]:** to define in the GDD. Rain, distant sirens early, silence and growls late.

## References & differentiation [ASSUMPTION — for the user to check out]
| Game | Take | Leave |
|---|---|---|
| Brotato | Shop between waves, build defined by items | Single-player, abstract look |
| Boxhead (browser) | Top-down zombie waves, barricades, plays in a browser | Dated feel, no meta-progression |
| CoD Zombies "Dead Ops Arcade" | Top-down twin-stick zombie co-op | Arcade tone |
| Risk of Rain 2 | Co-op, unlocks widen the item pool | 3D, not a horde game |

**What makes this one different:** online co-op for 2–4 on phones **from a link, no install**, plus building between waves, plus **a city that decays over the run and changes how it plays**. None of the references combine those.

## Scope & MVP [ASSUMPTION — to be challenged]
- **Team:** the user, building with AI assistance (BMAD). Plenty of time and budget.
- **Platform:** mobile web browsers first (portrait or landscape to decide), desktop browser as a bonus.
- **Biggest technical risks:**
  1. **Real-time multiplayer with big hordes** on phone connections (needs a server; must stay in sync).
  2. **Performance:** 150+ zombies with effects at a smooth frame rate in a mobile browser.
  3. **Touch controls:** twin-stick plus building UI on a small screen.
- **Proposed first milestone (prototype, prove the risks):** 2–4 players online in one small district, twin-stick, 3 weapons (one per range), 3 zombie types, 1 turret + 1 barricade, shop between waves, 5 waves through 2–3 decay stages. No accounts yet (just a name), no meta-progression yet.
- **MVP after that:** accounts, meta-progression, all 6 zombie types, full 20-wave decay, blackout waves, one complete district.
- **Later:** more districts, more weapons and buildings, wave modifiers, **PvP mode** (parked, not dropped).

## Open questions
- Working title.
- What happens after wave 20: endless "collapse" mode for a high score, or an ending (evacuation, final stand)?
- Target length of a full run (20 waves could be 30–45 minutes).
- Can a run be paused or resumed, and can a friend join mid-run?
- Portrait or landscape on the phone.
- Gore level.
