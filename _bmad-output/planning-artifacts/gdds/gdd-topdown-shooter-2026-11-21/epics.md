---
title: topdown-shooter — Development Epics
source: gdd.md
created: 2026-11-21
updated: 2026-11-23
status: final
---

# Development Epics

Each epic ends in something playable on a phone. Epics 1–4 together form **Milestone 1** from the brief: a prototype that proves online co-op with big hordes works in a phone browser.

## Epic 1 — Core combat on one phone
- **Goal:** the twin-stick horde fight feels good on a phone, single player.
- **In:** landscape touch controls (floating sticks, auto-fire, aim assist), player movement and health, Pistol, SMG, Machete, Hunting Rifle (one weapon per range), 2-slot loadout and weapon swap, Walkers with crowd separation, simple waves on a placeholder street, hit feedback.
- **Out:** networking, shop, decay, final art.
- **Depends on:** nothing.
- **Playable result:** one player survives growing waves of Walkers on their phone; measure frame rate with 150 Walkers.
- **High-level stories:** touch twin-stick controls · player movement and health · weapon firing and reload · melee arc · Walker AI and crowd separation · wave spawner · wave end with last 5 marked and rushing · hit feedback · weapon swap · melee playtest on real phones · desktop keyboard/mouse fallback · frame-rate overlay.

## Epic 2 — Online co-op foundation
- **Goal:** 2–4 friends play the same fight from a shared link.
- **In:** game server, lobby with share link and 4-letter code, guest names, synced players and horde (150 zombies), server-confirmed hits, downed state and revive, loss when all are down, player rings and off-screen teammate arrows.
- **Out:** accounts, reconnect, save/resume, host migration.
- **Depends on:** Epic 1.
- **Playable result:** 4 phones on 4G play the same horde wave together with no visible disagreement.
- **High-level stories:** lobby and share link · player join and ready · server-run simulation of players and zombies · horde sync within bandwidth target · server-confirmed hits · downed and revive · team wipe · teammate rings and edge arrows · latency test at 150 ms.

## Epic 3 — Build phase and economy
- **Goal:** the wave → build phase → wave loop works with real choices.
- **In:** 30 s build phase with Ready, personal wallets, kill/assist/revive/building rewards, wave-clear bonus, fixed-list shop (the 6-card roguelike shop arrives in Epic 5, once the item pool is big enough), Auto-turret and Wood barricade, building placement on a grid, repairs, 6-building cap, heal 50% per build phase, Runner and Crawler zombies, player-count scaling (60/80/100%).
- **Out:** full item list, meta-progression.
- **Depends on:** Epic 2.
- **Playable result:** a team plays 5 waves (now 6 waves; 6.1 makes 10) with build phases, buying weapons and placing turrets and barricades.
- **High-level stories:** build phase flow and Ready · wallets and rewards · shop UI (fixed list) · building placement and grid · turret behavior · barricade blocking and zombie attacks on buildings · repairs and cap · Runner AI (flanking) · Crawler AI (slow bite).

## Epic 4 — Downtown and city decay (first slice)
- **Goal:** the city that falls, playable through the first stages.
- **In:** Downtown map (intersection, alleys, gas station, bus, parking lot), per-player camera, cover rules, spawn points, decay stages Evening → Panic → Breakdown (cars moving into the road, barriers, fire zones, sandbags), placeholder Dead City art.
- **Out:** Ruins and Collapse stages, blackout, final art.
- **Depends on:** Epic 3.
- **Playable result = Milestone 1:** 2–4 players online in Downtown, 3 weapons, 3 zombie types, turret + barricade, shop, 5 waves (now 6 waves; 6.1 makes 10) through 3 decay stages.
- **High-level stories:** Downtown layout and collisions · camera follow · cover and bullet rules · spawn point system · decay stage engine · Panic changes · Breakdown changes (fire zones) · run seed.

## Epic 5 — Full arsenal and bestiary
- **Goal:** every weapon, zombie, building, gear and consumable from the GDD.
- **In:** remaining 7 weapons (11 in all, incl. the Gas torch), upgrades I–IV, Spitter, Bloater, Brute, remaining buildings, gear, consumable slot and button, friendly-fire rules for explosions and fire, telegraphs.
- **Depends on:** Epic 4.
- **Playable result:** all builds are possible; every zombie type demands its own answer.
- **Out:** boss, events, Ruins/Collapse, meta-progression.
- **High-level stories:** remaining weapons · upgrade levels · Spitter (ranged + telegraph + acid) · Bloater (contact and death explosions, gas) · Brute (building damage, knockback resistance) · remaining buildings · gear effects · consumable slot · friendly fire for fire/explosions · 6-card roguelike shop with reroll and card floor.

## Epic 6 — The full run: decay, boss, events, endless
- **Goal:** a complete 10-wave run and the endless mode.
- **In:** Ruins and Collapse stages, blackout waves (lighting, flashlights, floodlights), fog, the Behemoth, 6 special events, evacuation vote, endless mode with evac every 5 waves, boss HP scaling by player count.
- **Depends on:** Epic 5.
- **Playable result:** a team plays from Evening to the Behemoth and chooses to extract or stay.
- **Out:** accounts and unlocks, other districts.
- **High-level stories:** Ruins stage · Collapse stage · blackout lighting with flashlights and floodlights · fog · Behemoth attacks and enrage · event system + 6 events · evacuation vote · endless scaling and evac every 5 waves · boss HP scaling.

## Epic 7 — Accounts and meta-progression
- **Goal:** progress carries between runs.
- **In:** guest-to-account upgrade, Supplies earning, unlock screen, shop deck built from the unlocked pool, Training boosts with caps, district 2 unlock rule.
- **Depends on:** Epic 6.
- **Playable result:** a player unlocks a weapon after a run and sees it appear in their next shop.
- **Out:** cosmetics, district 2 content.
- **High-level stories:** guest-to-account upgrade · Supplies earning and banking · unlock screen · shop deck from unlocked pool · Training boosts and costs · district unlock rule.

## Epic 8 — Real-life resilience
- **Goal:** real life doesn't break a run.
- **In:** join mid-run at build phases with catch-up currency, 2-minute reconnect, host migration, Save and quit with 7-day resume, quick pings.
- **Depends on:** Epic 3 (wallets for catch-up currency); can run in parallel with Epics 5–7.
- **Playable result:** a player's phone dies mid-run, they rejoin with their gear; a run is saved and resumed the next day.
- **Out:** matchmaking, voice chat.
- **High-level stories:** join at build phase with catch-up currency · reconnect window · host migration · Save and quit · resume by any account from the run (Epic 8 D11; "with host" superseded) · ping button and markers · (2026-11-25/26) only connected, standing players vote (8.12) · slow-line horde skip (8.13).

## Epic 9 — Dead City art and audio
- **Goal:** a photoreal pass of the art and a polish pass of the audio, made without hiring anybody (designer, 2026-11-23; photoreal direction 2026-11-26, `sprint-change-proposal-2026-11-26-epic-9-photoreal.md`).
- **In:** photoreal district art in 5 decay states (buildings, ground and decay props; one night, dawn only on Extract), survivor poses per weapon family with reload and downed, zombie attack and death animations, a photoreal Behemoth, dismemberment, effects, UI art, ambience per decay stage with three audio buses, adaptive music, weapon and zombie sounds. Each art group is picked by the designer on a proposal page, then built the 9.11–9.14 way: code drawings relit in a worker, or an atlas pre-rendered from the approved code, with the code drawing as fallback (`docs/art/photoreal-decisions.md`); fixed budgets (first load < 15 MB, `?stress=150` within 2 FPS of master). Sound comes from code/procedural generation or licensed/free libraries.
- **Depends on:** Epic 4 for structure; runs in parallel from there.
- **Playable result:** the game looks and sounds like Dead City.
- **Out:** new districts' art; hiring an artist or sound designer.
- **High-level stories:** art and audio spec (every generator, atlas, frame, picked look, pipeline and budget) · buildings, ground and decay props × 5 decay states · survivor weapon, reload and downed poses · zombie attack and death animations and a photoreal Behemoth · dismemberment · effects · UI art · audio buses and the Breakdown loop · adaptive music · weapon and zombie sounds · (done) photoreal buildables, wall silhouettes, characters, street props.
- **Depends on:** Story 10.1 (settings) for dismemberment (gore toggle), effects (quality settings) and the audio buses (volumes).

## Epic 10 — Performance and polish
- **Goal:** meet every technical target on the reference phones.
- **In:** frame-rate and battery tuning, quality settings and gore toggle, load time, home-screen install and safe areas, simple run stats (loadouts used, wave reached) for the success metrics, balance pass on economy and waves, playtests with the friend group.
- **Depends on:** Epics 6–9.
- **Playable result:** v1, ready for weekly game nights.
- **Out:** new content.
- **Order:** settings (10.1) first, because Epic 9's gore, effects and audio buses and the frame-rate pass read it; the frame-rate pass takes over Epic 1's open phone FPS check, and the game nights take over Epic 1's controls playtest and Epic 4's Milestone 1 playtest (Epics 1 and 4 closed 2026-11-26).
- **High-level stories:** quality settings, gore toggle and progress deletion · reference-phone performance pass · memory and battery pass · load time and music streaming · economy and wave balance pass · home-screen install and safe areas · run stats · friend-group playtests.

## Epic 11 — Random city (post-v1)
- **Goal:** the host can pick Random city: a new 70 × 70 m city generated from rules on every run, shareable by its city code (designer 2026-11-24, `sprint-change-proposal-2026-11-24-random-city.md`).
- **Depends on:** Epic 6, Story 7.7, Story 8.4, Story 10.7; built after Epic 10.
- **High-level stories:** 11.1–11.7 in `_bmad-output/planning-artifacts/epics.md` › Epic 11 (added to this summary by the readiness check 2026-11-26).

## Epic 12 — Extraction cinematic
- **Goal:** a won run ends like a film (party-mode session 2026-11-25, designer decisions; added to this summary by the correct-course 2026-11-26).
- **In:** no building can seal a pocket of the map (12.1), no refund for decay losses (12.4), an extraction phase where survivors walk to the helicopter, board and fly out over a horde (12.2), a cinematic camera with letterbox, zoom-out, dawn sweep and fade (12.3). With Story 8.12: only connected, standing players vote.
- **Depends on:** Epic 6 (vote, pad, helicopter), Story 8.12; lands before the Epic 10 frame-rate pass, balance pass and playtests.
- **High-level stories:** 12.1–12.4 in `_bmad-output/planning-artifacts/epics.md` › Epic 12.
