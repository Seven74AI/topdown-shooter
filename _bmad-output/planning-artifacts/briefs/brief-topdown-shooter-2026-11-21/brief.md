---
title: Game Brief — topdown-shooter (working title)
status: final
version: 1.0
created: 2026-11-21
updated: 2026-11-21
---

# Game Brief — topdown-shooter (working title)

Detail that belongs in later documents (zombie roster, decay stages, art probe history, technical notes) is in [addendum.md](addendum.md). Every decision and its reason is in `.decision-log.md`.

## Vision

**Core fantasy:** *You and your friends hold out together while your city falls around you, one wave at a time.*

**Elevator pitch:** A 2D top-down co-op horde shooter for 2–4 friends, played in a phone browser from a shared link. Over 10 waves, the zombies grow from a handful to a flood while the district you picked slides from a normal evening into total collapse. Between waves you spend what you earned on weapons, gear and defenses. Survive wave 10 and the run is won, or push on into endless waves. Your unlocks carry over to the next run.

**What players should walk away with:** the panic of a screen full of zombies, the pride of a defense that held, and the story of *that* run ("the bloater took out our whole barricade on wave 9").

## Stakes & audience
- A passion project for the user and their friends, not a commercial launch.
- **Players:** the user's friend group, 2–4 at a time, each on their own phone with their own account.
- **Sessions:** a complete run is 10 waves, about 15–25 minutes, short enough for a phone session. Endless mode is for groups who want to push further.
- **Real life gets in the way:** a run can be **paused and resumed**, and a friend can **join mid-run**.

## Core loop
1. **Pick** a district, then create or join a game (lobby, share link).
2. **Fight** a wave: twin-stick action, no menus.
3. **Build phase** between waves: spend currency on weapons, equipment and buildings (turrets, barricades…).
4. The city **decays** one step about every 2 waves; the next wave is bigger and nastier.
5. **Wave 10** completes the run. Extract, or keep going in **endless** until everyone is down.
6. **Meta-progression:** unlocks widen the item pool, plus small capped boosts. Then the next run.

## Gameplay pillars
1. **Horde chaos:** large crowds are the spectacle. Fighting 150+ zombies must feel powerful, not cluttered.
2. **Build your stand:** what you buy and build between waves decides whether the next wave breaks you.
3. **A city that falls:** the district degrades over the run, in looks and in play. Late waves play differently, not only harder.
4. **Better together:** roles come from gear (melee, mid, long range), and zombie types demand different answers, so a team beats four solo players.

## Key mechanics
- **Controls:** twin-stick on touch (left thumb moves, right thumb aims and fires).
- **No classes:** a player's role comes only from the gear they buy and find.
- **Waves, then a build phase:** building and upgrading happen only between waves.
- **Run structure:** 10 waves take the city from Evening to Collapse (about 2 waves per decay stage). After that, endless waves in the collapsed city until everyone is down.
- **Wave 10 choice (proposed, to confirm in the GDD):** an evacuation arrives. Extract and keep everything, or stay for endless with bigger rewards and the risk of losing part of them.
- **City decay changes gameplay:** five stages (Evening, Panic, Breakdown, Ruins, Collapse) bring abandoned cars as cover, fires, rubble narrowing paths, and streetlights that flicker, then die.
- **Blackout waves:** in the dark you only see what flashlights, turrets and muzzle flashes light up. They belong to the late game, once the power grid fails.
- **Districts:** players pick a district at the start of a run and it decays around them. One district at first, more over time.
- **Meta-progression:** mostly unlocks that add to the item pool, plus small capped permanent boosts, so newcomers stay viable.
- **Zombies:** a first roster of six types (Walker, Runner, Crawler, Brute, Bloater, Spitter), each testing a different team skill.

## Art & audio direction
- **Art: Dead City.** Gritty and realistic, with muted colors and rainy urban streets at night. Chosen after three rounds of playable style probes.
- **Readability rule:** muted colors make friends and foes look alike, so each player gets a colored ground ring (or equivalent), and zombie types are told apart by silhouette.
- **Tone:** tense and grim, not comedic. Blood is part of the look; the exact gore level is still open.
- **Audio:** to define in the GDD. A starting idea: rain and distant sirens early, silence and growls late.

## References & differentiation
| Game | Take | Leave |
|---|---|---|
| Brotato | Shop between waves, a build defined by items | Single-player, abstract look |
| Boxhead (browser) | Top-down zombie waves, barricades, plays in a browser | Dated feel, no meta-progression |
| CoD Zombies "Dead Ops Arcade" | Top-down twin-stick zombie co-op | Arcade tone |
| Risk of Rain 2 | Co-op where unlocks widen the item pool | 3D, not a horde game |

**What makes this game different:** online co-op for 2–4 players on phones, **from a link with no install**, plus building between waves, plus **a city that decays over the run and changes how it plays**. None of the references combine these.

## Scope & MVP
- **Team:** the user, building with AI assistance through BMAD. Time and budget are not the main limits.
- **Platform:** mobile web browsers first, desktop browsers as a bonus.
- **Biggest technical risks:**
  1. **Real-time multiplayer with big hordes** on phone connections. This needs a server, and every player must see the same horde.
  2. **Pause, resume and join mid-run.** The server must keep the run's state, and a late joiner must be able to catch up.
  3. **Performance:** 150+ zombies with effects at a smooth frame rate in a mobile browser.
  4. **Touch controls:** twin-stick plus a building interface on a small screen.
- **First milestone (a prototype that proves the risks):** 2–4 players online in one small district, twin-stick controls, 3 weapons (one per range), 3 zombie types, 1 turret and 1 barricade, a shop between waves, and 5 waves through 2–3 decay stages. Players type a name; no accounts or meta-progression yet.
- **MVP after that:** accounts, meta-progression, all 6 zombie types, the full 10-wave decay, endless mode, blackout waves, pause/resume/join mid-run, and one complete district.
- **Later:** more districts, more weapons and buildings, wave modifiers, and a **PvP mode** (set aside for later, not dropped).

## Open questions (for the GDD)
- Working title.
- The extract-or-stay choice at wave 10: confirm it, and decide how much reward is at risk in endless.
- Whether blackout waves start inside the 10-wave run (waves 9–10) or only in endless.
- Portrait or landscape on the phone.
- Gore level.
