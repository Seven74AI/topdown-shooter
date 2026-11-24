# Story 6.11: Evacuation vote

Status: review

## Story

As a team,
I want to vote to get out or stay after beating the Behemoth,
so that we choose together how much to risk.

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

Most relevant here: **28 (one run flow: the vote is a new phase with tested transitions; Results always show)**, 2 (phase, timer and votes are server truth in schema; solo runs the same state machine), 3/4 (vote fairness), 14 (hidden tab and reconnect across the vote; a late Game scene start during the vote), 17 (the vote is a message under `this.net.guard`; at most a few per player), 20 (helicopter, pad, searchlight and dawn drawn in code through `addGeneratedTexture`), 24 (the vote UI and the helicopter read in the dark at 568 × 320 and 800 × 360), 10 (vote and dawn lengths in balance JSON, ticks).

## Acceptance Criteria

### Fairness rules (player-visible; brief line 3; each is tested)

- **F1 "Everyone in the run votes, downed or out too."** Every player in the World when the vote opens gets the Extract and Stay buttons, standing, downed or out (FR66). A player who left the run is not counted.
- **F2 "Every vote is visible to everyone, live."** Each player's choice shows at once in their slot colour on every phone (chips above the buttons); a player can change their vote until the vote ends (6.11 D2).
- **F3 "Stay needs a real majority; silence means Extract."** The team stays only if **more than half of the players in the run** voted Stay. A tie, no votes, or a player who didn't vote counts toward Extract (6.11 D1). Examples: 4 players, 2 Stay / 2 Extract → Extract; 2 Stay / 0 Extract / 2 silent → Extract; 3 Stay → Stay; solo: Stay only if you tap Stay.
- **F4 "15 seconds, the same on every phone, and it ends early when everyone has voted."** The countdown is `evac.voteS` **15 s** (300 ticks) of server time; the client draws it from the server's ticks-left, never its own clock. When every player in the run has a vote in, it ends at once (after a `evac.allVotedHoldS` **1 s** beat so the last chip is seen, 6.11 D3).
- **F5 "Nothing can hurt you during the vote."** During the vote no zombie, fire, hazard, timer (downed countdown included) or building acts, and no player moves or shoots (6.11 D4). The wave is already cleared, so nothing is waiting to spawn.
- **F6 "The vote opens only when the wave is really over."** It opens on the tick wave 10 is cleared (the last-5 rule included; after the Behemoth's death in Story 6.7), never earlier; in endless after every Behemoth wave (Story 6.12: 15, 20, 25…).
- **F7 "The result is the same for everyone and always leads somewhere."** Extract → dawn → Results "Extracted"; Stay → a normal 30 s build phase for wave 11. Never a stuck screen.

### Behaviour

1. **Balance (`waves.json › evac`, new block):** `voteS` 15, `allVotedHoldS` 1, `dawnS` 4 (client only, for the dawn length), `firstWave` 10 (= `runWaves`: the vote opens after clearing it). Story 6.12 adds `everyWaves` 5. Loader: `firstWave === runWaves` (cross-check).
2. **Run state machine** (`run/runStateMachine.ts`): `RunPhase` gains **`"vote"`**. New named transitions:
   - `openEvacVote(world)`: Wave → Vote. Called by `endWave` instead of `endRun` when `isEvacWave(balance, number, run.endless)` (6.11: `number === evac.firstWave`, `endless` defaults to false; 6.12 extends). Sets `run.voteTicksLeft = ticksFor(voteS)`, clears every `PlayerState.vote` to 0, clears grenades/molotov/blasts/acid (as `endRun` and `startBuild` do), emits `run.vote_opened { wave, ticks }`.
   - `castVote(world, playerId, choice)`: phase "vote" only; unknown players ignored; `choice` 1 = extract, 2 = stay (0 is not a vote). Changing a vote is allowed (F2).
   - `resolveEvacVote(world)`: Vote → Results (extract) or Vote → Build (stay) by F3. Emits `run.vote_resolved { choice, extract, stay }`. Extract: `run.extracted { wave }` then `endRun` (`run.ending = "extracted"`). Stay: `run.endless = true` (Story 6.12 reads it), then `startBuild` (from "vote": decay stays 5, heal, downed/out players return; `build.started { wave: 11 }`).
   - `updateRun`: in "vote", `voteTicksLeft--`; all voted → `voteTicksLeft = min(voteTicksLeft, ticksFor(allVotedHoldS))`; at 0 → `resolveEvacVote`.
   - `expectPhase` lists: `startBuild` from `"lobby" | "wave" | "vote"`; `endRun` from `"build" | "wave" | "vote"`.
3. **Freeze during the vote (F5).** `step()` (`core/world.ts`) runs only the `input` and `waves` (run) systems while `world.run.phase === "vote"` (one check, no per-system edits). `world.tick` still advances (the timer counts ticks).
4. **Endings replace `heldOut`.** `RunState` gets `ending: "none" | "wiped" | "extracted" | "lost"` (6.12 sets "lost": a wipe after Stay). `run.held_out` is replaced by `run.extracted`; `heldOut` stays as a derived getter or is removed with every reader updated (list in Current state). Story 6.1's interim "You held out!" Results go away.
5. **Network.** Schema: `RunState.voteTicksLeft` (uint16), `RunState.resultEnding` (string, set with phase "results"; replaces `resultHeldOut`), `PlayerState.vote` (uint8, 0 none / 1 extract / 2 stay, on change). `syncState`, `resetRunFields`, `RUN_STATE_FIELDS` / `PLAYER_STATE_FIELDS`, `fakeRoom`, devThrottle key lists. Message `C2S.EVAC_VOTE` (`evac.vote`, `evacVoteSchema = z.object({ choice: z.enum(["extract", "stay"]) }).strict()`), handled in `RunRoom` with `this.net.guard` (phase "vote" only; others ignored). Events `run.vote_opened`, `run.vote_resolved`, `run.extracted` in `simEvents.ts` + `netEvents.ts` (encode/decode, sent to everyone).
6. **Server.** `RunRoom.onTick` steps phases `"build" | "wave" | "vote"`; `run.extracted` → `endRun(controller, wave, "extracted")`; `run_ended` log gains `ending`; new `vote_resolved` log line `{ wave, extract, stay, silent, choice }` (the GDD's run stats).
7. **Solo** (`LocalSimHost`): the same state machine; the in-run menu still pauses everything, the vote included. Votes go through the same `castVote`.
8. **Client: the vote UI (look EX1).** A Preact overlay `ui/EvacVote.tsx` (architecture › UI: "EvacVote"), shown while `phase === "vote"`: title "EVAC IS HERE", sub "Extract now, or stay and fight on (endless)?", a green **EXTRACT** and a red **STAY** button (140 × 56 px, bottom centre, under the thumbs), a 15 s ring timer between them, and 4 slot-coloured chips above them that fill with each player's choice (downed/out players' chips dimmed but still vote). My choice is shown at once (pending, the `readyRequest.ts` pattern) and confirmed when the server's `vote` agrees. After it resolves: "EXTRACT · 3 – 1" for the `allVotedHoldS` beat. Joysticks and fire are hidden; the HUD's top bar stays. Checked at 568 × 320, 800 × 360 and 844 × 390.
9. **Client: the helicopter.** On `run.vote_opened` the helicopter descends onto the intersection pad (centre = the map's `events` layer point `evac_pad`, Downtown (24, 15.9), added with 6.8's layer; pad radius `evac.padRadiusM` 3 m in `waves.json`: the 6 m pad, dashed white ring) over the first 2 s, rotor spinning, a searchlight sweeping (BL4 rule: rain sparkles in the beam, no hot core). It is **visual only**: no collision, no effect on buildings under it (6.11 D5). It draws above the darkness through Story 6.3's `aboveDarkness(obj, slot)` (`render/darkness/aboveDark.ts`, slot `ABOVE_DARK.marker`) (brief 24). Gone on Stay (lifts off over 2 s while the build phase starts).
10. **Client: dawn (DW1 / DW2).** On `run.extracted` the helicopter lifts off toward the north-east and **4 s of dawn** play: **DW1 warm sunrise** after wave 10 (orange-pink light sweeping from the east edge, darkness lifting to soft grey, rain thinning to none), **DW2 blue hour** for an endless extract (Story 6.12) and behind "Lost in the city". Then Results. A tap skips the dawn. A phone that wakes (hidden tab) or starts the Game scene more than `dawnS` after the extract tick goes straight to Results (no late dawn).
11. **Results "Extracted".** Title **"Extracted"**, sub "Wave reached N", the existing table (name, kills, money earned this run), the run seed. Wipe before any vote: "Wave reached N" (unchanged). `uiState.resultsTitle` reads `ending`.
12. **Bots and sims.** `headlessRun`: bots vote at the vote's first tick, `opts.vote ?? "extract"` (6.12 adds `"stay"` with a wave limit). `tools/bots/run.ts` (real-server bots): each bot sends `evac.vote` extract on `phase === "vote"`; its stop line reads `resultEnding`. The 10-wave sim of 6.1 now ends with `ending === "extracted"`.
13. **Tests:** see T7.

## Tasks / Subtasks

- [x] **T0 Art (picks: docs/epic-6-decisions.md › 6 Vote EX1, 6 Dawn DW1 + DW2).** Port from `docs/art/epic-6/src/main5.js` (`voteUI` EX1 branch, `drawHeliTop`, `pad`, `searchlight`, the DW1/DW2 branches of the dawn card) into game code: helicopter top-down (body + rotor frames) in a small `render/city/heliArt.ts` baked through `addGeneratedTexture` (frames `heli_body_0`, `heli_rotor_0..n`, `pad_ring_0`); dawn as a full-screen overlay drawn with Phaser Graphics/gradients each frame for 4 s (no texture) or one gradient texture through `addGeneratedTexture`. The EX1 vote UI is HTML/CSS (Preact), no texture. Screenshot for the designer (no new pick).
- [x] **T1 Balance + phase** (AC 1, 2, 4)
  - [x] `balanceSchema.ts › wavesSchema`: `evac { voteS, allVotedHoldS, dawnS, firstWave, padRadiusM }` (strict, with defaults); `balance.ts › crossCheck` (`firstWave === runWaves`); the pad centre is map data (`DistrictMap.eventSpots`, point `evac_pad` in the `events` layer, generator `tools/maps/buildDowntown.ts`), and a map test checks it is inside the map and clear of map boxes (random-city CCP 2026-11-24: Random city places the pad per city).
  - [x] `runStateMachine.ts`: `RunPhase` + `"vote"`; `RunState { voteTicksLeft, ending, endless }`; `openEvacVote`, `castVote`, `resolveEvacVote`, `isEvacWave`; `endWave` → vote; `updateRun` vote branch; `expectPhase` lists.
  - [x] `core/world.ts › step`: vote freeze (AC 3). Also any `run.phase` switch that lists phases (`consumables.ts`, `bearTrap.ts`, `medStation.ts`, `fire.ts`, `turret.ts`): confirm "vote" falls into the safe branch (they never run in a vote thanks to the freeze, but their types must compile).
  - [x] Tests `runStateMachine.test.ts` (+ every transition; wrong-phase throws; F3 table for 1–4 players incl. silent players; changed vote; all voted → ends after 20 ticks; timer → 300 ticks; Stay → build of wave 11 with downed players returned; Extract → results "extracted").
- [x] **T2 Events + schema + server** (AC 5, 6; brief 2, 17)
  - [x] `core/simEvents.ts`: `run.vote_opened`, `run.vote_resolved`, `run.extracted` (remove `run.held_out`); `net/netEvents.ts` encode/decode (new `K` codes, append-only); `apps/server/src/net/eventInterest.ts`: to everyone.
  - [x] `apps/server/src/rooms/schema/RunState.ts`: `voteTicksLeft`, `resultEnding`, `PlayerState.vote`; `schema/syncState.ts` (on change, + `resetRunFields`); `net/stateView.ts` (`RUN_STATE_FIELDS`, `PLAYER_STATE_FIELDS`, views); `fakeRoom`; devThrottle key lists.
  - [x] `net/messages.ts`: `C2S.EVAC_VOTE`, `evacVoteSchema`; `RunRoom`: `onMessage(C2S.EVAC_VOTE, this.net.guard(evacVoteSchema, (c, m) => this.onEvacVote(c, m.choice)))`; `onTick` phase gate; `endRun(controller, wave, ending)`; logs.
  - [x] Tests `RunRoom.vote.test.ts` (new, `bootTestServer()`): a real room cleared to wave 10 (balance override `runWaves 2`, `evac.firstWave 2` for speed): vote opens, two clients vote, live `vote` fields, result; a vote outside "vote" ignored; a third message burst inside the guard bucket; reconnect-free leave during the vote (the leaver is no longer counted; the vote can end early); `syncState.test.ts` (+ fields synced and reset).
- [x] **T3 Solo + mirror** (AC 7; brief 2, 14)
  - [x] `LocalSimHost`: `castVote` call path; menu pause covers the vote.
  - [x] `NetSimHost`: copies `phase` "vote", `voteTicksLeft`, each player's `vote`; `world.run.ending` from `resultEnding` (replaces the `resultHeldOut` line).
  - [x] `net/onlineFlow.ts`: phase "vote" keeps the session (build ↔ wave ↔ vote are one run); `resultsFromState` reads `resultEnding`.
  - [x] Tests: `NetSimHost.vote.test.ts` (new: a state that jumps across the whole vote; a wake after `run.extracted` + 5 s → Results, no dawn), `onlineFlow.test.ts` (+ vote phase keeps the session).
- [x] **T4 Vote UI** (AC 8; EX1)
  - [x] `ui/EvacVote.tsx` + CSS in `overlay.css`; `uiState.ts`: the `playing` screen gets a `vote` sub-state, or a `vote` screen kind (choose the one that keeps the HUD drawing; Story 2.11's menu pattern: overlay over the live game); requests `evacVote(choice)`.
  - [x] Pending vote (`readyRequest.ts` pattern): my chip fills at once, the server confirms.
  - [x] Hide joysticks / fire during the vote (`GameScene` / input layer read `phase === "vote"`); send neutral moves while the vote is on (so the Predictor stands still too; see D-B).
  - [x] Tests: a `voteModel.ts` (pure: chips, counts, ring fraction from ticks, pending → confirmed) + `voteModel.test.ts`; layout check at 568 × 320 / 800 × 360 (≥ 12 px gaps, buttons ≥ 56 px tall).
- [x] **T5 Helicopter + dawn** (AC 9, 10; brief 20, 24)
  - [x] `render/HeliView.ts` (new): descend 2 s on `run.vote_opened`, rotor, searchlight, pad ring, lift-off on Stay/Extract; `aboveDarkness(heli, ABOVE_DARK.marker)` from Story 6.3 (`render/darkness/aboveDark.ts`; if 6.3 is not merged: top depth, a merge note).
  - [x] `render/DawnView.ts` (new): DW1 / DW2 4 s overlay; skip on tap; no dawn if the extract tick is older than `dawnS` (hidden tab / late scene start).
  - [x] `GameScene`: on `run.extracted` → dawn, then Results (`showSoloResults` / the online Results path); `ResultsScreen.tsx` + `uiState.resultsTitle`: "Extracted" / "Wave reached N" / (6.12) "Lost in the city".
  - [x] Tests: `noUnregisteredTextures.test.ts` stays green; a heli texture redraw test after a simulated context loss (4.13 pattern); `dawnModel.test.ts` (look per ending, skip rule, late-wake rule).
- [x] **T6 Bots and sims** (AC 12)
  - [x] `bots/headlessRun.ts` (`vote` option; log `ending`), `tools/bots/run.ts`, the 6.1 sims (`ending === "extracted"`).
- [x] **T7 Gates.** Mutations (tie → Stay; silent counted as Stay; freeze removed → a zombie/fire acts in the vote test; `startBuild` from vote not allowed → Stay test; dawn ignores the late-wake rule → wake test) and which tests failed. Browser check (Playwright): solo `?startwave=10&wallet=3000` (6.1's switch) → clear → vote → Extract → dawn → "Extracted"; again with Stay → build phase "Wave 11 in 30 s"; online 2 tabs under `?lag=150&jitter=20`: live chips, a changed vote, all voted → ends after 1 s; a hidden tab across the vote. Screenshots at 568 × 320 and 844 × 390. `typecheck && lint && test && build`. Merge notes.

## Dev Notes

### Designer decisions to confirm (made non-interactively; recommended values)

1. **6.11 D1 — What "majority" means.** Recommended: **Stay only if more than half of the whole team votes Stay; anyone who doesn't vote counts as Extract** (so one player can't drag three silent friends into endless). Alternative: majority of the votes cast (1 Stay vs 3 silent = Stay).
2. **6.11 D2 — Can you change your vote?** Recommended: **yes, until the vote ends** (friends argue on voice, then switch). Alternative: first tap is final.
3. **6.11 D3 — When everyone has voted.** Recommended: **the vote ends 1 s later** (everyone sees the last chip land). Alternative: at once, or always the full 15 s.
4. **6.11 D4 — What moves during the vote.** Recommended: **nothing: players stand still too** (no moving, no shooting; the wave is cleared anyway). Alternative: players may walk around (no shooting).
5. **6.11 D5 — The helicopter on the pad.** Recommended: **it is only a picture** (it never pushes players, never breaks buildings under it, the pad doesn't block building). Alternative: no building allowed on the 6 m pad from wave 9 on.
6. **6.11 D6 — Skipping the dawn.** Recommended: **a tap skips the 4 s dawn straight to Results**. Alternative: the dawn always plays.

### Decisions (developer guidance)

- **D-A The vote is a run phase, not an event.** The architecture names `Lobby → Build → Wave → EvacVote → (Endless ↔ EvacVote) → Results`; `"vote"` in `RunPhase` gives schema, mirror and solo the phase for free and keeps "a transition from a wrong phase throws".
- **D-B Freeze in `step()`, neutral moves on the client.** The server ignores movement/fire in a vote because the `player` and `combat` systems don't run. The Predictor (`net/prediction.ts`) runs its own `PREDICTION_SYSTEMS` World and doesn't know the phase, so the client must send neutral moves while it sees phase "vote"; the ~175 ms before it sees the vote gives at most a small smoothed correction (< 1 m, `PREDICTION_SNAP_M` not reached). Test it in `tools/netsim` or `prediction.test.ts`.
- **D-C Results come straight after Extract on the server.** `run.extracted` and phase "results" happen on the same tick; the 4 s dawn is client-only. So nothing server-side can get stuck in a dawn, and "Back to lobby" works at once.
- **D-D Counting the team.** "Players in the run" = `world.players` (a leaver is removed today; Story 8.1's 120 s reconnect hold will need a decision: a held player counts as silent = Extract). Note it for 8.1.
- **D-E `run.endless`** is set here on Stay and read by Story 6.12 (sizes, events, Behemoth waves). Without 6.12, Stay still leads to wave 11 with the W10 mix and the normal `waveSize` (11 × 40), which is fine as an interim.

### Current state (read before changing)

- `packages/shared/src/run/runStateMachine.ts`: `RunPhase = "lobby" | "build" | "wave" | "results"`; `RunState { phase, buildTicksLeft, heldOut }`; `startBuild` (from lobby | wave), `startWave`, `endWave` (`number ≥ runWaves` → `heldOut`, `run.held_out`, `endRun`), `endRun` (from build | wave; clears grenades/molotov/blasts), `setBuildReady`, `updateRun` (`SystemFn` in the `waves` slot), `skipWave`.
- `packages/shared/src/core/systems.ts › SYSTEM_ORDER` = input, player, buildings, combat, zombies, boss, waves, specialEvents, economy, decayTimers. `core/world.ts › step` runs them all every tick.
- Readers of the held-out ending (all change): `apps/server/src/rooms/RunRoom.ts` (`onTick` → `endRun(controller, wave, heldOut)`, `state.resultHeldOut`, `run_ended` log), `apps/server/src/rooms/schema/RunState.ts` (`resultHeldOut`), `packages/shared/src/net/stateView.ts` (`resultHeldOut`), `packages/shared/src/core/simEvents.ts` + `net/netEvents.ts` (`run.held_out`, `K.RUN_HELD_OUT`), `apps/client/src/sim/NetSimHost.ts` (`world.run.heldOut = state.resultHeldOut`), `apps/client/src/net/onlineFlow.ts` (`resultsFromState`, phase switch), `apps/client/src/ui/uiState.ts` (`results.heldOut`, `resultsTitle`), `apps/client/src/ui/ResultsScreen.tsx`, `apps/client/src/scenes/GameScene.ts` (`run.held_out` → `showSoloResults`), `packages/shared/src/bots/headlessRun.ts` (`heldOut`), `tools/bots/run.ts` (stop line), tests that read them.
- `RunRoom.onTick` returns early unless phase is "build" or "wave"; `onLobbyReturn` only in "results". Messages are registered with `this.net.guard(schema, handler)` (`RunRoom` constructor, `onMessage(C2S.…)`).
- `apps/client/src/net/onlineFlow.ts › createOnlinePhaseHandler`: build ↔ wave keep the session; results → Results screen; lobby → release.
- `apps/client/src/scenes/readyRequest.ts`: the pending-then-confirmed pattern for a toggle sent to the server.
- `apps/client/src/sim/LocalSimHost.ts`: `paused` (in-run menu) stops `update`.
- `apps/client/src/render/city/palette.ts › NIGHT_BY_STAGE` (stage 5 "before dawn" placeholder); Story 6.3 adds the darkness layer (`world.lights` in `decay/lightState.ts`, `refreshBlackout`, wire `RunState.blackoutPct`/`halfDark`) and `render/darkness/aboveDark.ts › aboveDarkness(obj, slot)`. The dawn overlay fades 6.3's darkness out client-side only (it never writes `blackoutPct`).
- Art source: `docs/art/epic-6/src/main5.js` (`HELI = [24, 15.9]`, `drawHeliTop`, `pad` (3 m dashed ring), `searchlight`, `voteUI` EX1, dawn DW1/DW2).

### Must be preserved

Wipe → Results "Wave reached N"; Back to lobby from Results; build ↔ wave flow; the in-run menu pausing solo; every Epic 5 phase rule (shop/building only in build; molotov/acid cleared at build start); replay digests stay deterministic (vote ticks and votes go in `snapshotWorld` via `run`, which is spread already).

### Copies touched (brief 2)

World (`run.phase "vote"`, `run.voteTicksLeft`, `run.ending`, `run.endless`, `PlayerState.vote`) → schema (`RunState.voteTicksLeft`, `resultEnding`; `PlayerState.vote`) → `syncState` (+ `resetRunFields`) → `stateView` (`RUN_STATE_FIELDS`, `PLAYER_STATE_FIELDS`) → `fakeRoom` → mirror (`NetSimHost`: phase, ticks, votes, ending) → Predictor: none (neutral moves, D-B) → devThrottle key lists → `snapshotWorld` (run state is spread; add `vote` to the player copy if players are listed field by field). Server: message + guard. Solo: `LocalSimHost`. Bots: `headlessRun`, `tools/bots/run.ts`.

### Beat the rule (for the reviewer; brief 4)

1. Spam Stay/Extract 20 times a second: does the guard drop it silently and the chip still end right? (The last vote that arrived counts.)
2. Vote Stay, then leave the room: is the leaver's vote still counted? (It must not be.)
3. 2 players: one Stay, one silent → Extract (F3). 3 players: 2 Stay → Stay. Solo silent → Extract.
4. Hidden tab during the whole vote, wake in the build phase of wave 11: no dawn, no vote UI left, HUD right.
5. Can a downed player be revived, or a fire hurt anyone, during the vote? (F5: no.)
6. Throw a grenade on the tick wave 10 is cleared: does it burst during the vote? (Cleared at `openEvacVote`.)
7. Under `?lag=150&jitter=20`, keep running while the vote opens: does the survivor snap back? (Small smoothed correction only.)
8. Two clients vote on the same tick the timer hits 0: one result, the same on every phone.
9. A late Game scene start (reload the tab) during the vote: the vote UI shows with the right ticks left and chips.

### Bandwidth

Votes: `PlayerState.vote` 1 B per change; `voteTicksLeft` 2 B per patch while the vote runs (20 Hz × 2 B = 40 B/s for 15 s); 3 small events per vote. Negligible.

### Phone FPS / Perf

Vote: an HTML overlay and one helicopter sprite + searchlight on a cleared map (no horde): cheap. Dawn: one full-screen gradient for 4 s. Server: a vote tick runs 2 systems (cheaper than a build tick).

### Art

EX1 (vote UI: HTML/CSS), the helicopter + pad + searchlight (game code, `addGeneratedTexture`), DW1 warm sunrise (wave-10 extract), DW2 blue hour (endless extract and "Lost in the city", Story 6.12). Colour rule (brief 24): the buttons use green/red as the look picked (EX1); the boss-only red rule is about the map, not UI buttons — note it in the Completion Notes.

### Dependencies

- **6.1** (runWaves 10) first. **6.7** (the Behemoth's death → "Evac inbound") makes F6's wave-10 clear the real trigger; without it the vote opens after a plain wave 10. **6.3** gives the above-the-darkness layer for the helicopter (fallback: top depth). **6.12** extends `isEvacWave`, sets `ending "lost"`, uses DW2.
- Epic 5 in progress: 5.13 (card shop) and 5.20–5.25 (build bar UX) touch `HudScene`/build UI; the vote UI is a separate Preact overlay; hiding joysticks goes through the existing input layer, not the build bar.

### Notes for the merge (brief 19)

- `runStateMachine.ts`: 6.12 adds endless rules in `beginWave`'s inputs and `isEvacWave`; 6.5/6.7 don't touch it. Keep `isEvacWave` the single place.
- `core/world.ts › step`: the vote freeze is one `if`. Story 6.3 adds one `refreshBlackout(world)` line each in `startBuild`, `startWave` and the path to Results (`runStateMachine.ts`): keep them when adding `openEvacVote`/`resolveEvacVote`; the vote itself keeps the light of the cleared wave 10 (no `refreshBlackout` call in `openEvacVote`), and Stay → `startBuild` refreshes it as usual.
- `simEvents.ts` / `netEvents.ts`: 6.5–6.10 add many events; `K` codes are append-only (resolve by merge order).
- `RunState.ts` / `stateView.ts` / `syncState.ts`: 6.3 (light state), 6.5 (boss record) add fields: append.
- `ResultsScreen.tsx` / `uiState.ts`: 6.12 adds "Lost in the city"; 7.x adds Supplies.
- `GameScene.ts`: banner/event switch lines only; 6.5–6.10 add their own cases.

### Suggested build round

**Round 3** (`docs/epic-6-decisions.md` › Build rounds; after 6.1; merges after 6.7 so the real trigger exists, but it can be built against a plain wave 10). Runs in parallel with 6.7 (boss) and 6.9/6.10 (events) — no shared files except the append-only event/schema lists. 6.12 (round 4) waits for it.

### References

- `epics.md` › Story 6.11; FR66, FR67. GDD › Win/Loss Conditions (vote rules, 4 s of dawn). `game-architecture.md` › Run state machine (EvacVote), UI (Preact EvacVote), Time and determinism (vote timers count ticks), "Evacuation vote: 15 s; majority wins; a tie or no votes = extract". `docs/ideas/epic-6/proposal.md` §7, `party-notes.md` Round 10. `docs/epic-6-decisions.md` (EX1, DW1, DW2). Stories 2.8 (Results, Back to lobby), 3.1 (run state machine), 3.10 (held out), 2.11 (menu overlay).

## Dev Agent Record

Merged story (designer 2026-11-24): **6.11 Evacuation vote + 6.12 Endless mode**, built as ONE story on branch `story-6-11` (from `story-6-6`, merged with `origin/master`). This record covers both story files; `6-12-endless-mode.md` points here.

### Agent Model Used

Claude (cloud builder session, BMAD gds-dev-story method).

### Debug Log References

- Shared: `npx vitest run src/run src/waves src/config src/net/netEvents.test.ts src/decay/lightState.test.ts src/replay src/economy/endlessSim.test.ts` — green.
- Server: `RunRoom.vote.test.ts`, `RunRoom.3-10.test.ts`, `devStartWave.test.ts`, `schema/*`, `tickCostEndless.test.ts` — green.
- Client: full client suite 159 files / 1490 tests green (load 0.38).
- Endless flow sim: 30,094 ticks, waves 11–30, Behemoths at 10/15/20/25/30, HP 6,000 × 1 / 1.25 / 1.5 / 1.75 / 2.0, tick p99 0.571 ms, heap 41.2 → 38.5 MB (load 0.64).
- Tick cost (load 0.47): wave 10 p99 1.125 ms; wave 19 endless (600 zombies, ≤ 6 Brutes, HP × 1.24) p99 1.837 ms (`docs/perf/epic-6-blackout.md`).

### Completion Notes List

**Fairness rules → tests (brief 3).** 6.11 F1 everyone votes (downed too; a leaver not counted) — `evacVote.test.ts`, `RunRoom.vote.test.ts`; F2 live + changeable — `RunRoom.vote.test.ts` (chip on the other phone, changed vote), `voteModel.test.ts`; F3 the 1–4 player table incl. silent players and ties — `evacVote.test.ts`; F4 300 ticks, all voted → exactly 20 ticks later, never past the timer, ring from server ticks — `evacVote.test.ts`, `voteModel.test.ts`; F5 freeze (zombie, downed timer, move, shot) — `evacVote.test.ts`; F6 opens only on the clearing tick of wave 10 (and 15/20/25 in endless) — `evacVote.test.ts`, `runStateMachine.test.ts`; F7 Extract → Results "extracted" same tick, Stay → wave-11 build — `evacVote.test.ts`. 6.12 F1 sizes 11–30 × 1–4 players, F2 hpMult and spawn HP, F3 Brute counts, ≤ 6 alive every tick and the wave ends only after all of them died, thresholds 25–90 %, F4 boss waves / HP growth / telegraph ticks at wave 25 = wave 10 (enraged too, 1–4 players) — `waveDirector.endless.test.ts`, `endlessSim.test.ts`; F5 odd/even darkness, power failure D6/D8 — `endless.test.ts`; F6 event waves and no repeat — `endless.test.ts`; F7 "lost" and the earnings split — `evacVote.test.ts`, `endlessSim.test.ts` (b).

**Mutations (brief 9 / T7) — each failed tests:** tie → Stay (3 failed); silent counted as Stay (2); vote freeze removed (1: the freeze test); `startBuild` not allowed from "vote" (7); `ending` stays "wiped" in endless (2: `evacVote` + wipe sim); endless size cap removed (2); Brute alive cap off (1); boss every 4 waves (1); event repeat allowed (1); `hpMult` not applied at spawn (1); endless boss HP growth not wired (1: flow sim, added after the first run let it survive); dawn ignores the late-wake rule (2).

**Builder decisions (no designer question needed; listed for the reviewer):**
1. **No `evac.firstWave` key**: the vote keys on `waves.runWaves` (the one source). A separate key that must equal `runWaves` broke every test that overrides `runWaves` (6-wave sims, `runWaves 20` fuzz tests) because the cross-check refused the balance. `isEvacWave(balance, wave, endless)` is the single place: outside endless any wave ≥ `runWaves` opens the vote (a run never plays on without a Stay).
2. **Loader checks dropped for the same reason**: "endless.maxZombiesPerWave ≥ wave 10's size" and "brutesMaxAlive ≤ maxAlive" refused override-built balances; kept: the 65,535 count cap and `oddWaveMix`/`evenWaveMix` inside the mix list.
3. **The vote freeze keeps the `economy` system running** (besides `input` and `waves`): it only pays this tick's pending events, so a wave bonus whose `wave.ended` was emitted between steps (the dev skip) is still paid. Nothing else can earn in a vote.
4. **All-voted hold**: the check runs before the decrement, so the vote ends exactly `allVotedHoldS` (20 ticks) after the last vote lands.
5. **Dawn is a Preact/CSS overlay** (`ResultsScreen` + `dawnModel.ts`): DW1 = soft-light orange-pink gradient from the east over a lifting dark layer, DW2 = cold screen-blend blue + grey; no texture, nothing to repaint. The dawn's end is a wall-clock time set when the extract is SEEN: online only when the previous phase was the vote (seen live); a reload/late scene start or a tab woken past it gets the card at once. "Lost" shows DW2 behind the card at once (D7). The dawn length comes from `waves.json › evac.dawnS` (main.ts passes `clientBalance()`).
6. **Helicopter** (`render/HeliView.ts`, `render/heliPose.ts`, atlas `render/city/heliArt.ts` through `addGeneratedTexture`, frames `heli_body_0`, `heli_rotor_0` (spun), `heli_beacon_0`, `heli_pad_0`, `heli_beam_0`): all in `ABOVE_DARK.marker`; the searchlight pool is a flat soft fall-off, additive, no hot core. A woken tab / late start during the vote finds it landed (descent age from the server's ticks).
7. **HUD during the vote**: sticks, weapon label, swap and consumable buttons hidden (STAY covered the weapon label at 568 × 320); input neutral (D-B). Top line: "Wave 10 · Evac vote"; endless "Wave 13 · Endless · Zombies N" / "Wave 14 · Endless · 25 s" (single-spaced dots to fit at 568 px).
8. **Brief 31 layout test**: new "vote" mode (☰ + EXTRACT + STAY from `layoutEvacVote`, the same numbers as `overlay.css`); every rule applies except "in the move-stick half" for EXTRACT — the designer's EX1 puts it left of the ring, and in a vote the sticks are hidden and nothing moves (D4). No new break; the baseline is unchanged.
9. **Colour rule (brief 24)**: EXTRACT green / STAY red are the picked EX1 UI buttons, not map danger; the boss-only red rule is about the map.
10. **Endless events (6.12 F6, D4, D6)** are built against a small interface (`run/endlessEvents.ts`): the build-start hook schedules `run.endlessEvent` from the `events` stream with "no repeat", but `endlessEventCandidates` returns none until Story 6.8's framework lands — see Notes for the merge.
11. **Endless darkness** lives inside 6.3's `refreshBlackout` (the only writer): odd → `endlessLightPct` (5) full strength; even → 5 at half strength; a power failure in an even wave → `powerFailureLightPct` (20) full (D6/D8); endless build phases half dark when 6.4's `halfDarkInBuild` is on; the vote keeps the wave's rule. New keys `decay.json › blackout.endlessOddWaves / endlessEvenHalfDark`.
12. **Endless Brutes**: computed count (`N − 8`), thresholds by formula from `bruteFromFraction` to `bruteToFraction` (no growing list), an owed Brute stays in the queue while 6 are alive (the alive scan runs only when a Brute is due). The type is now chosen before the spawn pick (no RNG or state in `waveZombieType`), so waves 1–10 are bit-identical.
13. **Replay**: new input-log command `vote`; `headlessRun` records it (bots vote on the vote's first tick, `vote` / `stayUntilWave` options; log `ending`, `endlessWaves`, `votes`).
14. **Dev switch**: `?startwave=` / `DEV_START_WAVE` accept 1–99; > `runWaves` starts the run in endless.
15. **Server logs**: `vote_resolved { wave, extract, stay, silent, choice }`; `run_ended` gains `ending`, `endless`, `endlessWaves`, `earnedBeforeEndless`, `earnedAfter10Lost` (no in-run money is taken away).

**Bandwidth (brief 11):** `voteTicksLeft` uint16 per patch during a vote (≈ 40 B/s for 15 s), `PlayerState.vote` 1 B per change, `RunState.endless` once, `resultEnding` once; 3 small reliable events per vote. Negligible.

### Copies touched (brief 2)

World (`run.phase "vote"`, `run.voteTicksLeft/ending/endless/endlessEvent/lastEndlessEvent`, `PlayerState.vote/earnedAtEvac`, `waves.hpMult/fixedFormula/fixedFromSpawn/fixedToSpawn/brutesMaxAlive`) → schema (`RunState.voteTicksLeft/resultEnding/endless`, `PlayerState.vote`) → `syncState` + `resetRunFields` → `stateView` (`RUN_STATE_FIELDS`, `PLAYER_STATE_FIELDS`) → `fakeRoom` → mirror (`NetSimHost`: phase, ticks, votes, ending, endless) → Predictor: none (neutral moves in a vote) → devThrottle: through the key lists → `snapshotWorld` (run/waves/players spread). Solo: `LocalSimHost.castVote`. Bots: `headlessRun`, `tools/bots/botClient.ts` + `run.ts`, `tools/sims/*`.

### Notes for the merge (brief 19; every shared file touched)

- **`run/runStateMachine.ts`** (owner of this change, brief 28): `RunPhase` + "vote"; `RunState` replaces `heldOut` with `ending` + `voteTicksLeft`, `endless`, `endlessEvent`, `lastEndlessEvent`; new `openEvacVote`, `castVote`, `resolveEvacVote`, `isEvacWave`, `countVotes`, `voteOutcome`, `VOTE_*`; `endWave` → vote; `startBuild` from lobby | wave | vote (calls `scheduleEndlessEvent`); `endRun` from build | wave | vote. 6.3's `refreshBlackout` lines kept (none added in `openEvacVote`).
- **`core/world.ts › step`**: the vote freeze `if` (input, waves, economy only).
- **`core/simEvents.ts` / `net/netEvents.ts`**: `run.held_out` (K 25) removed and retired; new K **65** `RUN_VOTE_OPENED`, **66** `RUN_VOTE_RESOLVED`, **67** `RUN_EXTRACTED` (our 65–74 range; 6.8 owns 55–64).
- **`net/messages.ts`**: `C2S.EVAC_VOTE` + `evacVoteSchema` (index.ts exports).
- **`net/stateView.ts`**, **`apps/server/src/rooms/schema/RunState.ts`**, **`schema/syncState.ts`**, **`apps/client/src/net/fakeRoom.ts`**: `resultHeldOut` → `resultEnding` (string); appended `voteTicksLeft`, `endless` (RunState, after `boss`) and `vote` (PlayerState, last). 6.8/6.9/6.10 appending fields: append after ours.
- **`apps/server/src/rooms/RunRoom.ts`**: `EVAC_VOTE` handler under `this.net.guard`; `onTick` steps "vote"; `endRun(controller, wave)` reads `world.run.ending`; logs. **`run/RunController.ts`**: `castVote`.
- **`waves/waveDirector.ts`**: `waveSize`/`waveMixOf` gain `endless = false` (every existing caller unchanged); `waveHpMult`, `endlessBrutes`, `isEndlessNumber`; `applyFixedCounts(…, endless)`; `WaveState` new fields; `waveZombieType` Brute alive cap; the type is picked before `pickSpawnPoint` (6.8's stampede spawns go through `spawnZombie`, not this path).
- **`zombies/zombiePool.ts › spawnZombie`**: one multiply `stats.hp × world.waves.hpMult` (6.7's Crawlers and 6.8's stampede get it in endless).
- **`boss/bossState.ts`**: `isBossWave` endless rule; `endlessBossHpMult`; `bossMaxHp(…, growth = 1)`. **`boss/behemoth.ts`**: passes `world.run.endless` and the growth (HP only; `bossTicks` untouched, 6.6 note).
- **`decay/lightState.ts › refreshBlackout`**: the endless rules + "vote keeps the wave's light". 6.2+6.4 (`story-6-2`) does not touch this function; 6.10's power failure sets `lights.powerFailure` and calls it (order respected).
- **`config/balanceSchema.ts` / `balance.ts` / `waves.json` / `decay.json`**: `waves.evac`, `waves.endless`, `blackout.endlessOddWaves/endlessEvenHalfDark`, `BLACKOUT_DEFAULTS`; cross-checks.
- **`run/endlessEvents.ts` (MERGE POINT with 6.8/6.10)**: `endlessEventCandidates(world, wave)` returns `[]`. At the 6.8 merge make it return the event ids whose gates pass for that wave (power failure included, 6.12 D6), and have 6.8's scheduler start `world.run.endlessEvent` in that wave with its normal 20–60 % window, banner, sound and marker. The "which waves" (`isEndlessEventWave`) and "no repeat" (`pickEndlessEvent`, `events` stream) rules are done and tested.
- **`render/HeliView.ts › evacPadOf` (MERGE POINT with 6.8's map `events` layer)**: reads `map.eventSpots` point `evac_pad`, falls back to the map centre (Downtown (24, 16)). When 6.8 adds the layer with `evac_pad` (24, 15.9), nothing else changes; add the map test (inside the map, clear of boxes) with it.
- **`decay/collapse.ts` / `ruinsLook.ts` (story-6-2)**: no change needed — they already rotate the weather (D7) and use RU4 by wave number past the table.
- **`run/devStartWave.ts`** (+ server `devStartWave.ts` tests): 1–99, > `runWaves` = endless.
- **`replay/inputLog.ts`**: `vote` command. **`bots/headlessRun.ts`**: `heldOut` → `ending`, `endlessWaves`, `votes`; `vote`, `stayUntilWave`.
- **Client**: `sim/SimHost.ts` (`castVote`), `LocalSimHost.ts`, `NetSimHost.ts`; `net/onlineFlow.ts` (vote keeps the session; `resultsFromState` → `ending`/`endless`; dawn; new required dep `dawnS`), `main.ts`; `ui/uiState.ts` (results `ending`, `endless`, `dawnEndsAtMs`; `resultsTitle`/`resultsSub`), `ResultsScreen.tsx`, new `EvacVote.tsx`, `voteModel.ts`, `dawnModel.ts`, `App.tsx`, `overlay.css`; `scenes/GameScene.ts` (vote feed, heli, solo results, neutral input), `HudScene.ts` + `hudModel.ts` (`endless`, `voting`, `waveLine`), `hudLayout.test.ts` (vote mode).
- **Docs**: readability sheet items **80–85**; `docs/perf/epic-6-blackout.md` endless section; screenshots `docs/art/6-11/`.
- `sprint-status.yaml` not touched (main session).

### Not verified

- Online two-tab browser check under `?lag=150&jitter=20` (live chips, a changed vote, all voted → 1 s, a hidden tab across the vote): covered only by the server room test, the mirror test and `onlineFlow.test.ts`, not in a browser.
- A wipe in endless in the browser ("Lost in the city" on DW2): unit/sim tested, not screenshotted.
- Headless FPS (`?stress=150`) with the story's effects: not run (the vote is an HTML overlay and one sprite on a cleared map; the wave-25 blackout + fog + Behemoth FPS case belongs to 6.3/6.5 and needs the Mi 11i).
- Darkness during the vote/endless in the browser: on this branch `lightPctByWave` is still all 0 and `halfDarkInBuild` false (6.4 turns them on), so screenshots of wave 10 show no blackout; endless wave 15 showed the 5 % blackout (`blackout 5` in the check).
- Endless events in play (6.8 not merged: the hook schedules nothing yet).
- Pre-existing at 568 × 320: the HP bar covers the start of the top wave line (also before this story).

### File List

New: `packages/shared/src/run/endlessEvents.ts`, `run/evacVote.test.ts`, `run/endless.test.ts`, `waves/waveDirector.endless.test.ts`, `economy/endlessSim.test.ts`; `apps/server/src/rooms/RunRoom.vote.test.ts`, `run/tickCostEndless.test.ts`; `apps/client/src/ui/EvacVote.tsx`, `ui/voteModel.ts`, `ui/voteModel.test.ts`, `ui/dawnModel.ts`, `ui/dawnModel.test.ts`, `render/HeliView.ts`, `render/heliPose.ts`, `render/HeliView.test.ts`, `render/city/heliArt.ts`, `render/city/heliArt.test.ts`, `sim/NetSimHost.vote.test.ts`; `docs/art/6-11/*.png`.

Modified: see Notes for the merge (shared: runStateMachine, world, simEvents, netEvents, messages, stateView, player, waveDirector, zombiePool, bossState, behemoth, lightState, balanceSchema, balance, waves.json, decay.json, devStartWave, inputLog, headlessRun, index; their tests; server: RunRoom, RunController, RunState, syncState and tests; client: SimHost, LocalSimHost, NetSimHost, onlineFlow, main, uiState, ResultsScreen, App, overlay.css, GameScene, HudScene, hudModel, fakeRoom and tests; tools: bots, sims; docs: readability sheet, perf).

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
- 2026-11-24: designer accepted every recommended decision ("ok, perfect"); status ready-for-dev.
- 2026-11-24: built together with 6.12 (merged story) on `story-6-11`; status review.
