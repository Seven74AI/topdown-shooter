# Story 6.10: Power failure and survivor

Status: review

## Story

As a team,
I want the lights to fail without warning and a survivor to need our help,
so that the run keeps asking for teamwork.

> **EPIC 6 BRIEF** (`docs/epic-6-brief.md`), pasted verbatim. Every line applies; reviewers check each one.
>
> ```
> EPIC 6 BRIEF (from the Epic 4 retro's EPIC 5 BRIEF + Epic 6 specifics; reviewers: check each line)
> 1. Builders run in their own CLOUD SESSION (branch story-6-x, one container each; HANDOFF §3 Session 6 rules). Never `npm run dev` with fixed ports; assigned ports only; stop processes by PID. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current master. While building run only the touched areas' tests; ONE full gate at the end.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo (LocalSimHost), NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → fakeRoom → mirror → Predictor → devThrottle → snapshotWorld). Boss, events, vote and light state are server truth; the client only draws.
> 3. FAIRNESS RULE FIRST: each mechanic's player-visible rule is written in the story ACs before building, and each rule is a test.
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (the story's "Beat the rule" list is the start, not the end) and list every attempt and its result.
> 5. Cover: bullets stop at map cover (cars, bus, buildings, pumps, parking wall, dumpster), at every barricade tier and at Ruins rubble. Lobbed rounds (launcher, hand grenade, molotov) fly over everything except real buildings (`building: true`); rubble is NOT `building: true`. Spit, flames, blasts, acid, gas and fire zones: cars, the bus, buildings and rubble stop or shield them (clear line from the centre). Sandbags, police barriers, turrets and floor buildings (traps, mines) stop bodies only. Melee is stopped by barricades, shot-blocking map cover and rubble. Behemoth slam and throw IGNORE cover ("the drawn zone is the promise"); the gas-leak blast uses the normal blast line of sight. Server and the client's cosmetic copy agree; rewound (2.12) hits for players' shots only.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged. Boss hits resolve once, on the tick the telegraph ends.
> 7. Spatial code (rubble, breaches, the Behemoth body and charge, shoves, the survivor NPC, the helicopter pad, crate spots) gets a builder-written fuzz test: random layouts × every stage × variant × many ticks; no body inside a box, no stall, zombies and the boss reach a player, flow fields rebuild only at build start (the boss field is its own, on its own clock).
> 8. Randomness only from named seed streams (`decay` for variants/looks, `events` for event schedule/spots/weapons, `spawns`, `combat`); same seed + input log → same snapshotWorld digest, including boss and event state.
> 9. Liveness: every sim/replay/integration test asserts something really happened (all 10 waves played, the boss spawned/attacked/crashed/died, each event triggered, a vote resolved, ≥ 1 endless wave). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks (1.2 s = 24 ticks); no per-tick/per-frame allocation (pool stamps, decals, markers, particles); every number in balance JSON (`waves.json`, `decay.json`, `boss.json`, `events.json`, …), no inline literals.
> 11. Bandwidth: telegraphs, event starts/ends and effects go out as reliable events (kind + start tick + fixed zone), not per-tick state; one boss record in the room state; report added B/s; total ≤ 30 KB/s per phone (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled and capped (max live decals/particles in balance JSON). The reference low-end phone is the Xiaomi Mi 11i (designer 2026-11-24; the Honor 10 is not a test phone). Run ?stress=150 with the story's effects active; report headless FPS before/after with load; the latest recorded ?stress=150 baseline in docs/perf/ is the floor.
> 13. Readability: every new object must read at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet (`docs/playtests/milestone-1/readability-sheet.md`).
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start AND across a boss telegraph / event start / vote, on a late Game scene start and a reconnect; client shows server truth (pending until state agrees).
> 15. Balance: earnings stay as built until the Epic 5 balance pass settles them; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 10-wave sim and assert all waves ended. Solo is "allowed, not tuned" and scales × 0.4 (Behemoth HP too).
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added server p99 ≤ 2 ms total budget for Epic 6 (boss field + events + vote).
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently (votes and pings are inputs to budget for).
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix, ?seed, the decay-stage cheat, new: force blackout, start at wave N, force event X, spawn Behemoth), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master. Each story goes to master as soon as its review (and re-reviews) is clean.
> 20. Every texture drawn in code is created through addGeneratedTexture with a redraw callback (Android Chrome wipes canvases while the app is in the background); test that it redraws after a simulated context loss (`tools/checks/noUnregisteredTextures.test.ts` must stay green). That includes the darkness texture, light stamps, boss atlas, decals, markers and dawn.
>
> EPIC 6 SPECIFICS
> 21. BOSS FAIRNESS (each is a test): (a) every danger zone (slam centre, charge lane + stop point, throw landing spot) is fixed when its telegraph starts; (b) the client draws the telegraph's progress from the server's start tick, never from when the message arrived, and the fill always ends on the hit; (c) edge grace 0.25 m: a hit lands only when the player's centre is 0.25 m inside the drawn edge; (d) boss hits use the player's newest server position, no rewind; (e) telegraph lengths never shorten (enrage, endless, player count); (f) one boss attack at a time, then recovery, then the per-player-count gap; (g) a downed player is never targeted or hit again.
> 22. CAP 110 WHILE THE BEHEMOTH LIVES: at most 110 zombies alive while it is alive (D6), back to 150 the tick it dies; the boss itself does not count; enrage Crawlers respect the cap; the stampede's +30 over-cap allowance is counted against the cap that applies.
> 23. EVENT FAIRNESS: every event announces itself (banner + sound + map marker above the darkness) before it can hurt anyone; the schedule comes only from the `events` stream (2 different events, 2 different waves of 3–8, never 5, never back-to-back); a lever (shoot the armed car, shoot the gas tank after 3 s) works the same for every player and credits whoever pulled it; only standing players take the crate or lead the survivor; the gas blast hurts every player in range in full (as Bloaters) and is shielded by the normal blast line of sight.
> 24. BLACKOUT READABILITY: darkness and fog vision can't be turned off (FR87); quality settings only change their look. Always above the darkness: teammates with rings, zombie eyes within 14 m (or the fog edge), the boss's outline and eyes, every boss telegraph, event markers, the crate, the survivor and the safe point, pings. Colour rule: red = boss danger only, amber = an event you can use, yellow-green = gas, white = pick-ups and people. No hot beam core, no lens flare; rain sparkles inside beams. Check at 568 × 320 and 800 × 360.
> 25. ENDLESS PERFORMANCE: nothing grows without a cap over 20+ endless waves (alive 150 / 110, wave size 600, Brutes ≤ 6 alive, decals, craters, markers, event records, kill logs); a 20-wave endless sim records server tick p99 and memory and asserts they stay flat; FPS recorded with blackout + fog + Behemoth + 150 zombies (`docs/perf/epic-6-blackout.md`).
> 26. LIGHT IS SERVER TRUTH: the light state (stage, blackout flag, power out, flicker seeds, build-phase half darkness) is part of the world and replays; a client that joins or wakes mid-wave draws the same darkness as everyone else; fog hides zombies only on the local screen, never in the sim (aim assist and turrets keep their own rules; aim assist never locks a target your screen hides).
> 27. DO NOT TOUCH EPIC 5 WORK IN PROGRESS: 5.13 card shop and 5.20–5.25 building UX are being built in other sessions (shop, build bar, carry/drag UI); Epic 6 changes there go through their balance flags (`inShop`) or a "Notes for the merge" line, not edits to their UI.
> 28. ONE RUN FLOW: the run phase machine (lobby → build → wave → … → vote → extract/endless → results) has one owner per change (6.1 removes the 6-wave ending, 6.11 adds the vote, 6.12 adds endless); every phase change is a tested transition, and Results always show (no stuck run).
> ```

Most relevant here: 2 (the survivor NPC is a new body: World → schema → mirror; the power failure writes 6.3's light state), 3/4 (fairness rules, "Beat the rule"), 6 (bites on the NPC per zombie, its own clock), 7 (the NPC's movement and the zombies chasing it: fuzz), 8 (`events` stream only: spots and look), 9 (a real save and a real power failure in the sims), 10 (ticks, `events.json`), 11 (one small body record, not per-tick events), 14 (hidden tab across the power cut; a late join sees the darkness and the NPC), **23 (standing players only lead the NPC)**, 24 (NPC, safe point and markers above the darkness; white = people), **26 (light is server truth: the power failure is in the world, replays, and every phone draws the same darkness)**.

## Acceptance Criteria

### Fairness rules (player-visible; brief lines 3, 23 and 26; each is tested)

- **P1 "The lights warn you."** A power failure starts with a "POWER FAILURE" banner and sound, then every streetlight and shop front flickers for **2 s** (40 ticks); only then does the darkness fall. Nobody is ever plunged into darkness without those 2 s.
- **P2 "Same darkness for everyone, until the wave ends."** From the end of the flicker to the end of that wave the wave is a blackout wave at the moonlit level (`decay.json › blackout.powerFailureLightPct` **20 %**, BL2) on every phone, including a phone that joins or wakes mid-wave (server truth through 6.3's synced `blackoutPct`). The next build phase has its normal light again.
- **P3 "Only in waves 6–8."** A power failure is scheduled only in waves 6, 7 or 8 (6.8 gate), never in a wave that is already a full blackout wave (a half-dark even endless wave is not one: 6.12 D3/D6).
- **S1 "The survivor is easy to find and never a teammate look-alike."** It appears with a white person marker (edge arrow when off screen), a bright coat, no gun and no slot ring, at least **15 m** from the team; the white safe-point flag appears at the same time, at least **20 m** from it.
- **S2 "Only a standing player leads it."** It follows the nearest **standing** player who comes within **3 m** of it; it keeps following that leader until the leader is more than **6 m** away, is downed or leaves, then it crouches and waits for the next standing player within 3 m. Downed and out players never lead it.
- **S3 "Zombies want it as much as you."** Zombies pick the survivor as a target exactly like a player (nearest target; the chase field is seeded from it; Spitters spit at it; Brutes wind up on it; the last-5 rush may go for it); each bite does that zombie's normal damage on its own clock.
- **S3b "Alone, it hides" (decision 6.10 B1, designer 2026-11-25).** While the survivor waits (crouched, not yet led) a zombie or Spitter goes for it only when its centre is within `events.json › survivor.waitIgnoreM` **5 m** of it, and the chase fields are not seeded from it; once a standing player leads it, S3 applies in full. Tested: `survivor.test.ts` "decision 6.10 B1" (a zombie 10 m off ignores it, one 4 m off goes for it, led → the far zombie comes and the field is seeded from it).
- **S4 "Your weapons never hurt it."** Players' bullets, pellets, melee, flames, grenades, mines and molotovs pass through or ignore the survivor; only zombies (bites, spit and acid, Bloater blasts) and burning car fires can hurt it, and it never walks into a fire on its own (it stops at the fire's edge).
- **S5 "Saved means paid, for everyone."** When the survivor's centre comes within **2 m** of the safe-point centre before the wave ends, every player in the run gets **+100** at once; if it dies (50 HP) or the wave ends first, nobody gets anything ("Survivor lost").

### Behaviour

1. **Power failure module (`events/powerFailure.ts`, FR42).** `fits(world, wave)`: wave ∈ `events.json › powerFailure.waves` **[6, 7, 8]** (6.12 adds even endless waves: D7) and not already a full blackout wave (a half-dark even endless wave, 6.12 D3, qualifies: the power failure makes it a full blackout at `powerFailureLightPct`). Phases: `flicker` (`flickerS` **2 s**) → `dark` (until `wave.ended`). At the start of `dark` the module sets 6.3's server/solo-only **`world.lights.powerFailure = true`** and calls **`refreshBlackout(world)`** (the ONLY writer of `blackoutPct`; it applies `decay.json › blackout.powerFailureLightPct` 20); at `end` (wave end) it sets `powerFailure = false` and calls `refreshBlackout(world)` again. Never writes `blackoutPct` itself. `isBlackout(world)` / `darknessAlpha(world)` (6.3) read the result; the Floodlight's 6 m blackout radius (D5) and flashlight cones follow automatically.
2. **Flicker (client, P1).** During `flicker` the client drives the same lamp-flicker look as stage 4 (6.2's per-lamp flicker in the city light layer) at full intensity for 2 s, keyed off `eventPhaseTick` (every phone in step); with 6.2 not merged, a simple 0.15 s on/off pattern on the city's streetlight and shop-glow layers. Banner "POWER FAILURE", sound `event_power_down` (a thunk + hum dying).
3. **Survivor module (`events/survivor.ts`, FR43).** `fits`: at least one `survivor` spot and one `safe` spot (6.8's `DistrictMap.eventSpots`) open at the stage with ≥ `safeMinFromNpcM` **20 m** between them. At trigger, from `world.streams.events`: the NPC spot among open `survivor` spots ≥ `minFromTeamM` **15 m** from the team centre, box/building/fire-free (fallback: the farthest open spot); the safe point among open `safe` spots ≥ 20 m from the NPC; the look (SV1 / SV2 / SV3, equal chances). NPC record in `world.special.active.survivor`: `x, y, hp` (**50**), `radiusM` **0.4**, `state` (`waiting | following | saved | dead`), `leaderSlot`, `biteCooldown` per zombie handled by the zombie's own attack clock.
4. **NPC movement (server/solo, never predicted).** Each tick in `following`: move toward the point `followGapM` **1.0 m** behind the leader at up to `speedMps` **4.0** (players run 4.5), through `pushOutOfBuildings` (map boxes, cover, buildings), clamped to the map, stopping before entering a burning fire circle (`circleInFire`, the 5.7 knockback stop rule). `waiting`: stands, crouched pose. Leader rule S2: pick-up range `pickUpM` **3 m**, lost at `loseM` **6 m**. Saved at `saveRadiusM` **2 m** from the safe point (S5) → `saved`, `earn(world, id, 100, "event")` for every player in `world.players` (new `MONEY_REASONS` entry `"event"`, append-only), `event.ended { outcome: "done" }`, the NPC is removed after a short wave-off. HP 0 → `dead`, `event.ended { outcome: "failed" }`. Wave end first → `event.ended { outcome: "wave_end" }`, NPC removed.
5. **Zombies target the NPC (S3).** `zombies/zombieAi.ts`: the per-tick target list (`collectAlivePlayers` → a list of chase targets that both `PlayerState` and the NPC record satisfy: `x, y, radiusM`, alive) includes a living NPC; `nearestAlivePlayer` → `nearestTarget`; contact damage on the NPC goes through a new `damageSurvivor(world, amount, zombieId)` (no slow, no knockback, no downed state); Brute windup/swing and the Runner flank work against it (the flank cone of a target without aim = no cone). `zombies/spit.ts › collectStanding` includes it (acid and spit hurt it). `zombies/flowField.ts`: the chase (and wide chase) seeding adds the NPC's cell like a player's (`seedAround`). `combat/explosion.ts`: a Bloater blast (`kind: "bloater"`) hits the NPC by the same overlap + clear line rule; no other blast kind does (S4). `decay/fire.ts`: a car fire's pulse hurts it if it overlaps (it stops at the edge, so only if a fire starts under it — not possible mid-wave; kept for safety).
6. **Wire.** Append to 6.8's event record in the schema: `npcX`, `npcY` (uint16 cm), `npcHp` (uint8), `npcState` (uint8), `npcLook` (uint8), `npcLeaderSlot` (uint8, 255 none), `safeX`, `safeY` (uint16 cm) — on change only; `RUN_STATE_FIELDS`, `RunStateView`, `fakeRoom`, devThrottle. The client mirror copies them into its World's `special.active.survivor`; the view interpolates the NPC like a remote player (100 ms behind, the 2.6 buffers). Events: no per-bite event (HP comes from the schema); `event.phase_changed { phase: following | waiting, playerId }` for the "following" label and a small chirp; `event.ended` for saved / lost.
7. **Client.** `render/EventView.ts` (6.8's) gains: the NPC (SV1 yellow raincoat / SV2 nurse in teal scrubs / SV3 office worker in white shirt and tie; standing and crouched frames in `render/city/eventArt.ts`, drawn like the survivors' `CHAR` style; no gun, no ring), a small HP bar, label "HELP!" while waiting / "following" while led, a faint dashed 3 m pick-up circle round its leader while following; the white person pin over it; the safe point as a white flag pin with a 2 m ring on the ground and an edge arrow when off screen. Every survivor drawing and pin through 6.3's `aboveDarkness(obj, ABOVE_DARK.pickup)` (NPC, HP bar, safe ring) and `ABOVE_DARK.marker` (pins, edge arrows). Banners: "POWER FAILURE", "SURVIVOR · lead them to the flag", "Survivor saved · +100", "Survivor lost". Sounds: `event_power_down`, `event_survivor_help` (a call, positional, repeats every 6 s while waiting), `event_survivor_saved`.
8. **Dev switches.** `?events=power_failure@6`, `?events=survivor@3` (6.8's format); the solo cheat menu's "Force event" covers both; `DEV_EVENTS` on the server.
9. **Bots.** `bots/botPolicy.ts`: in a survivor event the bot nearest the NPC walks to it, then to the safe point at ≤ 4.0 m/s (liveness for sims); other bots keep fighting.

## Tasks / Subtasks

- [x] **T0 Art (picks fixed; no new pick).** `docs/epic-6-decisions.md` › section 5: **power failure: no new art** (the Ruins flicker for 2 s, then the blackout); **survivor: all three SV1 yellow raincoat, SV2 nurse, SV3 office worker**, one at random per event. Port `NPCS` / `drawNPC` (standing + crouched) and `IC.person`, `IC.flag` from `docs/art/epic-6/looks.html` (`makeSurvivorCard`) into `render/city/eventArt.ts` (frames `npc_<look>_<pose>` in the event atlas) and `render/EventView.ts`, every texture via `addGeneratedTexture` (brief 20). Colour rule: white for the NPC's pin, label, HP bar and the safe flag (D8: the drawing's green flag becomes white). Add the NPC and the flag to the readability sheet ("is this a teammate?" — must read "no").
- [x] **T1 Balance** (AC 1, 3, 4): `events.json › powerFailure`, `survivor` (below); schema + cross-checks (`loseM > pickUpM`, `saveRadiusM < safeMinFromNpcM`, waves ⊂ 6.8's waves); `MONEY_REASONS` + `"event"` (append; `net/netEvents.ts` encodes the index).
- [x] **T2 Power failure** (AC 1, 2; P1–P3): `events/powerFailure.ts` using 6.3's `world.lights.powerFailure` + `refreshBlackout(world)`. Tests `events/powerFailure.test.ts`: no darkness for 40 ticks after the start, then `isBlackout` true with `blackoutPct` = 20; cleared at `wave.ended` (the next build phase is not dark); never scheduled outside 6–8 (6.8 schedule test covers it); replay digest includes it; a mirror World that receives the state mid-wave reports the same `darknessAlpha`.
- [x] **T3 Survivor body + AI** (AC 3–5; S1–S5): `events/survivor.ts` (spawn, leader rule, movement, save, death), the target-list refactor in `zombies/zombieAi.ts` (behaviour for players unchanged bit-for-bit when no NPC), `damageSurvivor` (`combat/damage.ts`), `collectStanding` (`zombies/spit.ts`), chase seeding (`zombies/flowField.ts`), the Bloater-only blast pass (`combat/explosion.ts`), `earn(…, "event")` (`economy/economy.ts`). Tests `events/survivor.test.ts`: spots ≥ 15 / ≥ 20 m at every stage × mask; pick-up at 2.99 m yes / 3.01 m no; lost at 6 m, on a downed leader, on a leave; never led by a downed or out player; speed ≤ 4.0; stops at a car fire's edge; never inside a box (pushed out round the bus); zombies bite it (Walker 10, Runner 8, Brute windup, Spitter acid), a Bloater blast hurts it, players' pistol/shotgun/flame/grenade/mine/molotov never do; saved at 2 m → +100 to all 4 (downed too); death at 0 HP → nothing; wave end → nothing; last-5 rush can target it; the wave still ends with the NPC alive.
- [x] **T4 Wire + client** (AC 6, 7): schema fields, `syncState` (+ reset), views, `fakeRoom`, devThrottle, `NetSimHost` mirror + interpolation, `EventView`/`eventArt`, banners and sounds in `GameScene`, the flicker hook in the city light layer (`render/city/CityView.ts`; 6.2 owns the per-lamp flicker — reuse it). Tests: round trips, `syncState.test.ts`, `eventMarkers.test.ts` (+ NPC/flag), atlas size, redraw after context loss.
- [x] **T5 Fuzz, sims, bandwidth, perf** (brief 7, 9, 11, 16): extend the 6.8 fuzz with a forced survivor: random layouts × stages 2–4 × masks × ≥ 3,000 ticks with a bot leader — no NPC centre inside a box or a fire, no stall (the NPC reaches the safe point with a bot leader in ≥ 90 % of layouts), zombies reach it; 10-wave sim over 8 seeds with forcing: ≥ 1 power failure (blackout ticks counted), ≥ 1 survivor saved and ≥ 1 lost, +100 paid; bandwidth (NPC record ≈ 80–200 B/s while it moves); tick cost with the NPC in the target list (`PERF_ASSERT=1`, load).
- [x] **T6 Gates.** Mutations (e.g. no flicker delay → P1; `blackoutPct` written directly → the 6.3 writer test; downed player may lead → S2; bullets hurt the NPC → S4; reward to the leader only → S5; NPC not seeded in the chase field → zombies-reach test) and which tests failed. Browser check: solo `?events=power_failure@6` (+ a Floodlight to see the 6 m pool) and `?events=survivor@3`, online two tabs `?lag=150&jitter=20`: flicker in step on both phones, darkness identical, a tab woken mid-blackout is dark, NPC follows the leader smoothly on the other phone, saved banner + money on both. Full gate. Merge notes.

`events.json` additions (starting values):

```json
"powerFailure": { "waves": [6, 7, 8], "flickerS": 2 },
"survivor": { "hp": 50, "radiusM": 0.4, "speedMps": 4.0, "followGapM": 1.0, "pickUpM": 3, "loseM": 6, "minFromTeamM": 15, "safeMinFromNpcM": 20, "saveRadiusM": 2, "reward": 100, "helpCallS": 6 },
"banners": { "power_failure": "POWER FAILURE", "survivor": "SURVIVOR · lead them to the flag", "survivor_saved": "Survivor saved · +100", "survivor_lost": "Survivor lost" }
```

The light level itself stays in 6.3's `decay.json › blackout.powerFailureLightPct` (20).

## Dev Notes

### Designer decisions to confirm (made non-interactively; recommended values)

- **6.10 D1 ★ The warning before the power fails.** Recommended: **banner + sound, then 2 s of flickering lamps, then dark (moonlit 20 %) until the wave ends.** Alternative: no banner (a true surprise; only the flicker).
- **6.10 D2 ★ How the survivor follows.** Recommended: **it latches onto a standing player who comes within 3 m and keeps following until that player is more than 6 m away**, then crouches and waits. Alternative: lost as soon as the leader is more than 3 m away (much stricter: you must walk slowly).
- **6.10 D3 ★ Can you hurt the survivor?** Recommended: **no — only zombies (bites, spit, Bloater blasts) and car fires hurt it; your bullets, flames and grenades pass through.** Alternative: friendly fire 50 % like teammates.
- **6.10 D4 Reaching safety.** Recommended: **the survivor's centre within 2 m of the flag** (a 2 m ring drawn on the ground).
- **6.10 D5 Who gets the +100.** Recommended: **every player in the run, downed ones too**, the moment it is saved. Alternative: standing players only.
- **6.10 D6 Crouching doesn't hide it.** Recommended: **zombies go for it whether it crouches or follows.** Alternative: a crouched survivor is ignored by zombies more than 5 m away.
- **6.10 D7 Power failure in endless.** Recommended: **allowed on even endless waves that are not already blackout waves** (6.12's "any event that fits"). Alternative: never in endless.
- **6.10 D8 ★ Safe-point colour.** Recommended: **a white flag** (the colour rule: white = people and pick-ups; green is too close to gas and the supply smoke). Alternative: the green flag as drawn.
- **6.10 D9 Spots.** Recommended: **8 survivor spots and 6 safe spots on open road (map data from 6.8), chosen at random within the distance rules.**
- **6.10 D10 The survivor's look.** Recommended: **SV1, SV2 or SV3 at random each time** (all three picked).

### Decisions (developer guidance)

- **DD1 The power failure never writes `blackoutPct`.** 6.3's `refreshBlackout(world)` is the only writer (stage 5, endless odd waves, the force-blackout cheat, half-dark build phases and this event all go through it). This story only flips `world.lights.powerFailure` (server/solo-only) and calls the refresh; the synced `blackoutPct` carries it to every phone (P2, brief 26).
- **DD2 The NPC is not a player.** Not in `world.players` (revive, wallets, team wipe, HUD rings, interest, input don't see it). It joins only the zombies' target list, the chase seeding, the Spitters' list and the Bloater blast pass. A `ChaseTarget` type (`x, y, radiusM` + alive) lets `nearestTarget` treat both alike with no allocation.
- **DD3 Server truth, interpolated.** The NPC moves only on the server/solo; clients draw it from schema 100 ms behind like remote survivors. No prediction (it is never the local player).
- **DD4 Only one event at a time** (6.8 DD1): the survivor never meets a gas leak or stampede; a power failure and a survivor are never in the same wave.
- **DD5 Fire stop** reuses the knockback rule (`circleInFire` before a step); no fire nav cost needed for one body.

### Current state (read before changing)

- `decay/lightState.ts`: today `LightState` = derived floodlight + fire list (`updateLightState`, `lightsOf`), "No blackout flag yet: Story 6.3 adds it". 6.3 (final names, coordinator 2026-11-24) adds to `world.lights`: synced `blackoutPct`, `halfDark`; server/solo-only `powerFailure`, `forcedPct`; `refreshBlackout(world)` (only writer of `blackoutPct`), `isBlackout(world)`, `darknessAlpha(world)`; `decay.json › blackout.powerFailureLightPct 20`. Client: `render/darkness/aboveDark.ts` (`DARKNESS_DEPTH` 11.7, `aboveDarkness(obj, slot)`, `ABOVE_DARK.{…, pickup, marker, …}`).
- `zombies/zombieAi.ts`: `alivePlayers`, `collectAlivePlayers`, `nearestAlivePlayer` (pass 1 and pass 4), `damagePlayer` → `damagePlayerBy`; Brute `startWindup`/`resolveSwing`/`swingReachFor`; flank `inFlankCone` (player aim).
- `zombies/spit.ts › collectStanding` (Spitters' targets), `zombies/flowField.ts › seedPlayer` / `seedAround` (chase seeding from `world.players`).
- `combat/explosion.ts › blastPlayer` (player pass; the NPC pass goes beside it, Bloater kind only).
- `buildings/collision.ts › pushOutOfBuildings`; `decay/decayState.ts › circleInFire`.
- `economy/economy.ts › earn`, `core/simEvents.ts › MONEY_REASONS = ["kill", "assist", "revive", "wave", "refund"]`.
- Client: remote-player interpolation in `sim/NetSimHost.ts`; `render/PlayerView.ts` (survivor drawing style); `render/city/CityView.ts` (streetlight + shop glow layers that flicker).

### Must be preserved

With no NPC, zombie targeting, damage, Spitter targets, chase seeding and blasts behave bit-for-bit as today (existing replays keep their digests apart from the empty event record); `MONEY_REASONS` indices; 6.3's single-writer rule; Floodlight light radius rules (5.10).

### Copies touched (brief 2)

World (`special.active.survivor`, `world.lights.powerFailure` via 6.3) → schema (`npcX`, `npcY`, `npcHp`, `npcState`, `npcLook`, `npcLeaderSlot`, `safeX`, `safeY`; `blackoutPct` is 6.3's) → `syncState` (+ reset) → `RunStateView` / `RUN_STATE_FIELDS` → `fakeRoom` → devThrottle → mirror (`NetSimHost`: NPC record + interpolation; light state via 6.3) → Predictor (nothing) → `snapshotWorld` (survivor sub-record; `powerFailure` in 6.3's light snapshot).

### Beat the rule (for the reviewer; brief 4)

1. Count the ticks between the "POWER FAILURE" event and the first dark frame on two phones under lag: 40 ticks on the server, same on both.
2. Sleep a tab before the power failure, wake mid-wave: dark? Join mid-wave: dark? Next build phase: light?
3. Buy a Floodlight before wave 6 and stand in it during the power failure: 6 m pool (D5)?
4. Lead the survivor, then sprint (4.5 m/s): when is it lost (6 m)? Get downed while leading: does it stop? Can a downed teammate within 3 m pick it up? (No.)
5. Shoot, flame, grenade and mine right through the survivor: any damage? (No.) Pop a Bloater next to it: damage.
6. Lead it through a car fire: does it stop at the edge? Around the bus: stuck? Into a 1 m car gap: pushed out cleanly?
7. Park the survivor behind a barricade ring and stand next to it: do zombies break in for it (they target it like you)?
8. Leave it crouched far away: do zombies still go for it (D6)? Does the wave still end with it alive?
9. Save it while two players are downed: +100 to all four?
10. Two players race to lead it: who gets it (nearest standing within 3 m)? Can the second steal it while the first stays within 6 m? (No.)
11. Replay a run with a power failure and a survivor: same digest.

### Bandwidth (brief 11)

NPC record ~8 B per change, ≤ 20 Hz while it moves ≈ 100–200 B/s with patch overhead; power failure = one `blackoutPct` change (6.3) + 2–3 events. Report in the bandwidth test.

### Phone FPS / Perf

One NPC sprite (2 poses × 3 looks in the event atlas), two pins, one ring, one HP bar. The power failure's cost is 6.3's darkness pass (its `docs/perf/epic-6-blackout.md` number covers it). Server: the NPC adds one target to the nearest-target loop (O(1) per zombie) and one seed to the chase field. Run `?stress=150` with a forced survivor; report headless FPS with load.

### Art

Power failure: no new art (2 s flicker with the Ruins lamp flicker, then 6.3's blackout at 20 % moonlit, BL2). Survivor: SV1 yellow raincoat (hood), SV2 nurse in teal scrubs with a white cross badge, SV3 office worker in a white shirt and tie; crouched and standing poses; white person pin; white safe flag (D8). From `docs/art/epic-6/looks.html` › `makeSurvivorCard` / `drawNPC` (screenshots `docs/art/epic-6/ingame/ev-*.png`). Game code via `addGeneratedTexture`.

### Dependencies

- **6.8** (framework, map spots, EventView, event record): merged first.
- **6.3** (`world.lights.powerFailure`, `refreshBlackout`, `isBlackout`, `darknessAlpha`, `blackoutPct` sync, `aboveDarkness` slots): the power-failure half needs 6.3 merged; the survivor half doesn't (use the top world depth until 6.3 lands).
- **6.2**: the per-lamp flicker drawing (reuse it for the 2 s; fallback pattern until merged); rubble must not cover survivor/safe spots (6.8's spot test).
- **6.12**: calls `fits` for endless (D7).
- **Epic 5**: no overlap (no shop/build UI).

### Notes for the merge (brief 19)

- `decay/lightState.ts`: only reads/writes `powerFailure` and calls `refreshBlackout` (6.3's); never adds a second writer of `blackoutPct`.
- `zombies/zombieAi.ts`: the target-list refactor (`ChaseTarget`, `nearestTarget`) touches the same lines as 6.8's lure steering and stampede branch — merge after 6.8 and keep both; 6.5's boss has its own system.
- `zombies/flowField.ts`: chase seeding adds the NPC; 6.8 adds lure fields; 6.5 a boss field — separate.
- `zombies/spit.ts › collectStanding`, `combat/explosion.ts` (NPC pass), `combat/damage.ts › damageSurvivor`: new small additions.
- `core/simEvents.ts › MONEY_REASONS`: append `"event"` (6.7 may append `"boss"` for the kill pay: either order, never reorder).
- Schema/`syncState`/views/`fakeRoom`: append survivor fields after 6.9's crate fields.
- `render/EventView.ts`, `render/city/eventArt.ts`, `render/city/CityView.ts` (flicker hook: shared with 6.2's flicker — coordinate in one function).

### Suggested build round

**Round 3** (`docs/epic-6-decisions.md` › Build rounds): **after 6.8**, **in parallel with 6.9** (different modules; append-only on the shared record, registry and `EventView`). The power-failure half also waits for **6.3 and 6.4** (6.4 adds a case to `refreshBlackout`; by round 3 both are on master; if not, build the survivor first and add the power failure as the last task). Parallel with 6.7 (boss) and 6.11 (vote); `zombieAi.ts` merge care after 6.8.

### References

- `epics.md` › Story 6.10; GDD › Special events (power failure, survivor rows), "only standing players can take the supply crate or lead the survivor"; FR42, FR43; alignment Q9.
- `docs/ideas/epic-6/proposal.md` § 5 (blackout), § 6 (events); `party-notes.md` › Round 9; `docs/epic-6-decisions.md` › Blackout (20 % moonlit for a power failure) and section 5.
- Story files 2.6 (interpolation), 3.5 (chase field), 5.6 (Spitter targets), 5.7 (fire-edge stop, windup), 5.8 (Bloater blast), 5.10 (Floodlight 6 m), 6.3 (light state API), 6.8 (framework).

## Dev Agent Record

Merged with 6.9 (designer 2026-11-24): the one Dev Agent Record, the "Not verified" list and the "Notes for the merge" are in `6-9-gas-leak-and-supply-drop.md`. Decision 6.10 B1 (designer, 2026-11-25): while the survivor waits zombies ignore it unless within 5 m; once led, S3 unchanged.

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
- 2026-11-24: designer accepted every recommended decision ("ok, perfect"); status ready-for-dev.
- 2026-11-25: built inside the merged story 6.9 + 6.10 (record in 6-9's file); status review.
