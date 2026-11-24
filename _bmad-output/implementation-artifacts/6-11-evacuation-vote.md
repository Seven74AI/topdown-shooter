# Story 6.11: Evacuation vote

Status: drafted (ready-for-dev once the designer confirms docs/epic-6-decisions.md › Story decisions to confirm)

## Story

As a team,
I want to vote to get out or stay after beating the Behemoth,
so that we choose together how much to risk.

{{BRIEF}}

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
   - `openEvacVote(world)`: Wave → Vote. Called by `endWave` instead of `endRun` when `isEvacWave(balance, number)` (6.11: `number === evac.firstWave`; 6.12 extends). Sets `run.voteTicksLeft = ticksFor(voteS)`, clears every `PlayerState.vote` to 0, clears grenades/molotov/blasts/acid (as `endRun` and `startBuild` do), emits `run.vote_opened { wave, ticks }`.
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
9. **Client: the helicopter.** On `run.vote_opened` the helicopter descends onto the intersection pad (centre `evac.padX/padY` in `waves.json` = Downtown (24, 15.9), pad radius 3 m: the 6 m pad, dashed white ring) over the first 2 s, rotor spinning, a searchlight sweeping (BL4 rule: rain sparkles in the beam, no hot core). It is **visual only**: no collision, no effect on buildings under it (6.11 D5). It draws above the darkness (brief 24). Gone on Stay (lifts off over 2 s while the build phase starts).
10. **Client: dawn (DW1 / DW2).** On `run.extracted` the helicopter lifts off toward the north-east and **4 s of dawn** play: **DW1 warm sunrise** after wave 10 (orange-pink light sweeping from the east edge, darkness lifting to soft grey, rain thinning to none), **DW2 blue hour** for an endless extract (Story 6.12) and behind "Lost in the city". Then Results. A tap skips the dawn. A phone that wakes (hidden tab) or starts the Game scene more than `dawnS` after the extract tick goes straight to Results (no late dawn).
11. **Results "Extracted".** Title **"Extracted"**, sub "Wave reached N", the existing table (name, kills, money earned this run), the run seed. Wipe before any vote: "Wave reached N" (unchanged). `uiState.resultsTitle` reads `ending`.
12. **Bots and sims.** `headlessRun`: bots vote at the vote's first tick, `opts.vote ?? "extract"` (6.12 adds `"stay"` with a wave limit). `tools/bots/run.ts` (real-server bots): each bot sends `evac.vote` extract on `phase === "vote"`; its stop line reads `resultEnding`. The 10-wave sim of 6.1 now ends with `ending === "extracted"`.
13. **Tests:** see T7.

## Tasks / Subtasks

- [ ] **T0 Art (picks: docs/epic-6-decisions.md › 6 Vote EX1, 6 Dawn DW1 + DW2).** Port from `docs/art/epic-6/src/main5.js` (`voteUI` EX1 branch, `drawHeliTop`, `pad`, `searchlight`, the DW1/DW2 branches of the dawn card) into game code: helicopter top-down (body + rotor frames) in a small `render/city/heliArt.ts` baked through `addGeneratedTexture` (frames `heli_body_0`, `heli_rotor_0..n`, `pad_ring_0`); dawn as a full-screen overlay drawn with Phaser Graphics/gradients each frame for 4 s (no texture) or one gradient texture through `addGeneratedTexture`. The EX1 vote UI is HTML/CSS (Preact), no texture. Screenshot for the designer (no new pick).
- [ ] **T1 Balance + phase** (AC 1, 2, 4)
  - [ ] `balanceSchema.ts › wavesSchema`: `evac { voteS, allVotedHoldS, dawnS, firstWave, padX, padY, padRadiusM }` (strict, with defaults); `balance.ts › crossCheck` (`firstWave === runWaves`, pad inside the map and clear of map boxes).
  - [ ] `runStateMachine.ts`: `RunPhase` + `"vote"`; `RunState { voteTicksLeft, ending, endless }`; `openEvacVote`, `castVote`, `resolveEvacVote`, `isEvacWave`; `endWave` → vote; `updateRun` vote branch; `expectPhase` lists.
  - [ ] `core/world.ts › step`: vote freeze (AC 3). Also any `run.phase` switch that lists phases (`consumables.ts`, `bearTrap.ts`, `medStation.ts`, `fire.ts`, `turret.ts`): confirm "vote" falls into the safe branch (they never run in a vote thanks to the freeze, but their types must compile).
  - [ ] Tests `runStateMachine.test.ts` (+ every transition; wrong-phase throws; F3 table for 1–4 players incl. silent players; changed vote; all voted → ends after 20 ticks; timer → 300 ticks; Stay → build of wave 11 with downed players returned; Extract → results "extracted").
- [ ] **T2 Events + schema + server** (AC 5, 6; brief 2, 17)
  - [ ] `core/simEvents.ts`: `run.vote_opened`, `run.vote_resolved`, `run.extracted` (remove `run.held_out`); `net/netEvents.ts` encode/decode (new `K` codes, append-only); `apps/server/src/net/eventInterest.ts`: to everyone.
  - [ ] `apps/server/src/rooms/schema/RunState.ts`: `voteTicksLeft`, `resultEnding`, `PlayerState.vote`; `schema/syncState.ts` (on change, + `resetRunFields`); `net/stateView.ts` (`RUN_STATE_FIELDS`, `PLAYER_STATE_FIELDS`, views); `fakeRoom`; devThrottle key lists.
  - [ ] `net/messages.ts`: `C2S.EVAC_VOTE`, `evacVoteSchema`; `RunRoom`: `onMessage(C2S.EVAC_VOTE, this.net.guard(evacVoteSchema, (c, m) => this.onEvacVote(c, m.choice)))`; `onTick` phase gate; `endRun(controller, wave, ending)`; logs.
  - [ ] Tests `RunRoom.vote.test.ts` (new, `bootTestServer()`): a real room cleared to wave 10 (balance override `runWaves 2`, `evac.firstWave 2` for speed): vote opens, two clients vote, live `vote` fields, result; a vote outside "vote" ignored; a third message burst inside the guard bucket; reconnect-free leave during the vote (the leaver is no longer counted; the vote can end early); `syncState.test.ts` (+ fields synced and reset).
- [ ] **T3 Solo + mirror** (AC 7; brief 2, 14)
  - [ ] `LocalSimHost`: `castVote` call path; menu pause covers the vote.
  - [ ] `NetSimHost`: copies `phase` "vote", `voteTicksLeft`, each player's `vote`; `world.run.ending` from `resultEnding` (replaces the `resultHeldOut` line).
  - [ ] `net/onlineFlow.ts`: phase "vote" keeps the session (build ↔ wave ↔ vote are one run); `resultsFromState` reads `resultEnding`.
  - [ ] Tests: `NetSimHost.vote.test.ts` (new: a state that jumps across the whole vote; a wake after `run.extracted` + 5 s → Results, no dawn), `onlineFlow.test.ts` (+ vote phase keeps the session).
- [ ] **T4 Vote UI** (AC 8; EX1)
  - [ ] `ui/EvacVote.tsx` + CSS in `overlay.css`; `uiState.ts`: the `playing` screen gets a `vote` sub-state, or a `vote` screen kind (choose the one that keeps the HUD drawing; Story 2.11's menu pattern: overlay over the live game); requests `evacVote(choice)`.
  - [ ] Pending vote (`readyRequest.ts` pattern): my chip fills at once, the server confirms.
  - [ ] Hide joysticks / fire during the vote (`GameScene` / input layer read `phase === "vote"`); send neutral moves while the vote is on (so the Predictor stands still too; see D-B).
  - [ ] Tests: a `voteModel.ts` (pure: chips, counts, ring fraction from ticks, pending → confirmed) + `voteModel.test.ts`; layout check at 568 × 320 / 800 × 360 (≥ 12 px gaps, buttons ≥ 56 px tall).
- [ ] **T5 Helicopter + dawn** (AC 9, 10; brief 20, 24)
  - [ ] `render/HeliView.ts` (new): descend 2 s on `run.vote_opened`, rotor, searchlight, pad ring, lift-off on Stay/Extract; above-the-darkness layer from Story 6.3 (if 6.3 is not merged: top depth, a merge note).
  - [ ] `render/DawnView.ts` (new): DW1 / DW2 4 s overlay; skip on tap; no dawn if the extract tick is older than `dawnS` (hidden tab / late scene start).
  - [ ] `GameScene`: on `run.extracted` → dawn, then Results (`showSoloResults` / the online Results path); `ResultsScreen.tsx` + `uiState.resultsTitle`: "Extracted" / "Wave reached N" / (6.12) "Lost in the city".
  - [ ] Tests: `noUnregisteredTextures.test.ts` stays green; a heli texture redraw test after a simulated context loss (4.13 pattern); `dawnModel.test.ts` (look per ending, skip rule, late-wake rule).
- [ ] **T6 Bots and sims** (AC 12)
  - [ ] `bots/headlessRun.ts` (`vote` option; log `ending`), `tools/bots/run.ts`, the 6.1 sims (`ending === "extracted"`).
- [ ] **T7 Gates.** Mutations (tie → Stay; silent counted as Stay; freeze removed → a zombie/fire acts in the vote test; `startBuild` from vote not allowed → Stay test; dawn ignores the late-wake rule → wake test) and which tests failed. Browser check (Playwright): solo `?startwave=10&wallet=3000` (6.1's switch) → clear → vote → Extract → dawn → "Extracted"; again with Stay → build phase "Wave 11 in 30 s"; online 2 tabs under `?lag=150&jitter=20`: live chips, a changed vote, all voted → ends after 1 s; a hidden tab across the vote. Screenshots at 568 × 320 and 844 × 390. `typecheck && lint && test && build`. Merge notes.

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
- `apps/client/src/render/city/palette.ts › NIGHT_BY_STAGE` (stage 5 "before dawn" placeholder); Story 6.3 adds the darkness layer.
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
- `core/world.ts › step`: the vote freeze is one `if`; Story 6.3 may add a light-state system: it goes in `SYSTEM_ORDER`, the freeze lists only input + waves.
- `simEvents.ts` / `netEvents.ts`: 6.5–6.10 add many events; `K` codes are append-only (resolve by merge order).
- `RunState.ts` / `stateView.ts` / `syncState.ts`: 6.3 (light state), 6.5 (boss record) add fields: append.
- `ResultsScreen.tsx` / `uiState.ts`: 6.12 adds "Lost in the city"; 7.x adds Supplies.
- `GameScene.ts`: banner/event switch lines only; 6.5–6.10 add their own cases.

### Suggested build round

**Round 4** (after 6.1; best after 6.7 so the real trigger exists, but it can be built against a plain wave 10). Can run in parallel with 6.9/6.10 (events) and 6.4 (Collapse) — no shared files except the append-only event/schema lists. 6.12 waits for it.

### References

- `epics.md` › Story 6.11; FR66, FR67. GDD › Win/Loss Conditions (vote rules, 4 s of dawn). `game-architecture.md` › Run state machine (EvacVote), UI (Preact EvacVote), Time and determinism (vote timers count ticks), "Evacuation vote: 15 s; majority wins; a tie or no votes = extract". `docs/ideas/epic-6/proposal.md` §7, `party-notes.md` Round 10. `docs/epic-6-decisions.md` (EX1, DW1, DW2). Stories 2.8 (Results, Back to lobby), 3.1 (run state machine), 3.10 (held out), 2.11 (menu overlay).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
