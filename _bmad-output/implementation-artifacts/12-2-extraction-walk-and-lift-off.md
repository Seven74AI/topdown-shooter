---
baseline_commit: c1eaaa8
---

# Story 12.2: Extraction: walk to the helicopter and lift off

Status: done

<!-- 2026-11-26: re-checked against master c1eaaa8 (12.1 + 12.4 PR #33, 8.12 vote rule, 8.13 protocol 4 / input format 2, 6.11 extract). See "Code moved since the story was written" below. -->
<!-- Quick story 2026-11-25 from the party-mode session on cinematics. Needs 12.1 (buildings never close a path) and 8.12 (vote counting). The camera work is 12.3; this story already looks right with the normal camera. -->

## Story

As a team that just voted to extract,
I want our survivors to walk to the helicopter on their own, climb in and fly off over the horde,
so that the end of a won run feels like an ending, not a cut to a menu.

## Designer decisions (2026-11-25)

- When Extract wins, everybody is frozen and moved automatically to the helicopter. When everybody is inside, it flies off.
- Extract wins on a tie (6.11 D1, unchanged). Only connected, living players count in the vote: disconnected, downed and dead players don't (Story 8.12).

## Acceptance Criteria

### The phase

1. **A new run phase.** `RunPhase` gets `"extract"`, between `vote` and `results`: `Vote ─resolveEvacVote(extract)→ Extract ─(boarded + fly-out)→ Results`. `resolveEvacVote` still decides the ending (`run.ending = "extracted"`, `run.extracted` event) at the vote, but calls `startExtract(world)` instead of `endRun`. `endRun` now runs at the end of the fly-out (AC 9). Stay is unchanged (→ build).
2. **It plays every time Extract wins**: a unanimous vote, a majority, a tie, or silence. It plays after wave 10 and after any endless evacuation wave.
3. **Player input is ignored.** During `extract`, the server drops movement, fire, build, shop and consumable inputs (`setInput` is skipped). The client stops sending them and hides the action controls. Pings (8.7) still work.
4. **Nobody can be hurt.** Every player is protected for the whole phase (`protectTicks`, Story 8.1), and fire, acid and spit pools are cleared when the phase starts.

### The walk

5. **Autopilot.** Each tick, every standing player gets a synthesized input inside the sim (not from the client) that moves them at normal walk speed toward the `evac_pad` centre. Routing uses a flow field seeded at the pad (`zombies/flowField.ts`, the field the bots already follow), with buildings as walls. Story 12.1 guarantees a player-sized path to the pad from anywhere walkable. The autopilot is part of `step()`, so the replay digest stays the same without new replay commands.
6. **Downed players stand up** at the start of the phase, at their current spot, and walk too (decision CN-3).
7. **Out players and held seats board on their own** (decision CN-4): they have no body to walk. The helicopter crew climbs out and "pulls them in" (a client visual in 12.3; in the sim they're boarded at the phase start).
8. **Boarding.** A player within `evac.padRadiusM` (3 m, today drawn only) of the pad centre **after the helicopter has landed** is boarded: `p.boarded = true`, their body stops and isn't drawn, and a `player.boarded { slot }` event is emitted. Boarding waits for the landing (the descent takes `DESCEND_S` 2 s from when the vote opens, and a vote can resolve sooner).
   - **Timeout.** After `evac.walkTimeoutS` (new, default 8 s) any player who hasn't boarded is boarded anyway, with a `run.extract_cut` event (12.3 fades through black for it). This is a safety net (a body stuck on a corner, a path made longer by the layout); 12.1 means a sealed pad shouldn't happen.

### Lift-off and fly-out

9. **Lift-off.** Once every player is boarded, after a 0.5 s beat, `run.lifted { tick }` is emitted and the server stamps `run.liftedAtTick`. The sim **keeps stepping** for `evac.flyOutS` (new, default 8 s), with no players on the ground, then `endRun` (ending `extracted`).
10. **The horde comes for the noise.** From lift-off, an **extraction horde** spawns from the wave spawn points (`waves/spawnPoints`) and heads for the pad (flow field seeded at the pad). Its size and rate are balance keys (`evac.flyOutHorde.count`, `.perS`). It isn't a numbered wave: no wave events, no bounty, no kills counted in run stats or milestones.
11. **Helicopter path.** The helicopter's lift-off flight becomes a longer fly-out: from the pad toward the east map edge over `evac.flyOutS`, climbing and growing as it does today. The pose stays a pure client function (`render/heliPose.ts`, `extracting` phase), driven by `liftedAtTick`, so every phone draws the same flight.

### Everything else

12. **Banking and Results.** Rewards are banked when `endRun` fires, as today; the ending was already fixed at the vote. A player who leaves during `extract` banks as `extracted`. Results show after the fly-out (`onlineFlow.ts` / `dawnModel.ts`: the dawn and Results card follow `endRun`, as now).
13. **Joiners and saves.** Story 8.2's waiting joiners aren't admitted during `extract`. Saves (8.4–8.6) happen at build phases only, so `extract` is never saved.
14. **Solo** (`LocalSimHost`) runs the same phase.
15. **State sync.** `run.phase`, `boarded` and `liftedAtTick` go through schema, `syncState`, `stateView` and the fake room (the usual copy chain). A phone that wakes up mid-phase jumps to the right moment, or straight to Results if the run already ended.
16. **Tests.**
   - A 4-player world: vote Extract, every player boards within `walkTimeoutS`, `run.lifted`, then `endRun` after `flyOutS`.
   - Downed stands up; out and held seats board at the start.
   - A survivor held up past the timeout (test hook) → timeout cut.
   - No damage during the phase.
   - The horde spawns only after lift-off and counts for nothing.
   - Replay digest with an extraction.
   - `headlessRun` / bots handle the new phase.

Added 2026-11-26 (clashes X6, X7, X8; designer "ok" 2026-11-26, `sprint-change-proposal-2026-11-26-epic-9-photoreal.md` §6).

17. **Protocol and docs (X6).** Bump `NET_PROTOCOL_VERSION` for the new phase and synced fields, so an old tab gets "please reload". Whichever of 12.2, 8.13 and Epic 11 lands first takes 4, the next one takes 5. When the story lands, reword FR67 in `epics.md` to "Extract wins the run: the survivors walk to the helicopter and fly out (≤ 20 s), then Results" and add an as-built note to Story 6.11.
18. **Saves and the copy chain (X7).** `runSave.coverage.test.ts` excludes `boarded` and `liftedAtTick` with the reason "phase extract is never saved". A save taken in the vote (8.4–8.6 S12) and resumed still runs the extraction. `run.phase`, `boarded` and `liftedAtTick` each get an E8-A2-style "sent, changed, synced" copy-chain test.
19. **Fly-out kills count for nothing (X8).** A test shows the milestone counters (7.11) do not move during `extract`. Story 10.7 does not count `extract` kills in run stats either (its AC).

## Tasks

- [x] `packages/shared/src/run/runStateMachine.ts`: `"extract"` phase, `startExtract`, phase tick, `endRun` from `extract` (AC 1, 2, 9).
- [x] `packages/shared/src/run/extract.ts` (new): autopilot, boarding, timeout, horde (AC 5–10).
- [x] Balance: `evac.descendS`, `evac.walkTimeoutS`, `evac.liftBeatS`, `evac.flyOutS`, `evac.flyOutHorde` in `balanceSchema.ts` and `waves.json`.
- [x] Server: `RunRoom.step` steps the `extract` phase; drop inputs (AC 3); copy chain (AC 15).
- [x] Client: hide the action controls and stop sending input; `heliPose` fly-out (AC 11); Results timing (AC 12).
- [x] Tests (AC 16).
- [x] `NET_PROTOCOL_VERSION` 4 → 5; FR67 and 6.11 as-built note (AC 17).
- [x] Coverage exclusion, vote-save resume test, copy-chain tests (AC 18).
- [x] Milestone counters test (AC 19).

## Dev Notes

- Today `resolveEvacVote` calls `endRun` in the same tick (runStateMachine.ts), and the helicopter does a 4 s climb (`EXTRACT_FLY_S`), entirely on the client.
- Party-session reasoning for driving the walk in the sim rather than as a client animation: every phone sees the same walk, and replays and trailers (later) get it for free.
- Decisions CN-3 and CN-4 are recommended defaults; the designer can change them.

### Code moved since the story was written (re-checked 2026-11-26 on master c1eaaa8)

- **8.12 (vote rule):** `countsInVote` = standing players only; held, downed and out seats don't count. Unchanged by 12.2;
  the extract stands the downed up AFTER the vote resolved, so the tally is the vote's truth.
- **8.13 (protocol 4, input format 2):** `NET_PROTOCOL_VERSION` was 4 → 12.2 takes **5** (X6). The 18-byte binary
  input is untouched (the client simply sends none during `extract`).
- **12.1 (path rule):** `buildings/pathOpen.ts` owns the 0.5 m body-sized lattice seeded at the `evac_pad`. The walk
  uses that same lattice (`walkDistanceFrom`, new export) instead of the zombie flow field the story named: it is the
  exact graph 12.1 guarantees is joined to the pad (a zombie field is cell-based and inflated differently).
- **12.4:** no overlap (decay refunds).
- **6.11 as built:** `run.extracted` ended the run in the room (`RunRoom.step`) and solo (`GameScene`). Both now end on
  the new `run.extract_done`; `run.extracted` still marks the decision at the vote.

## Dev Agent Record

### Decisions (auto-accepted: designer 2026-11-26 "follow recommendations")

- **CN-3** (recommended default, kept): a downed survivor stands up where they lie (HP = the revive's `reviveHpFrac`, or
  more) and walks. *auto-accepted (designer 2026-11-26: follow recommendations)*
- **CN-4** (recommended default, kept): out players and held seats are boarded at the phase start (a seat that drops
  mid-walk boards on its own too). *auto-accepted (designer 2026-11-26: follow recommendations)*
- **D-12.2-1 Where the sim state lives (X7):** the extraction state is `world.extract` (`ExtractState`: `boarded` set,
  `liftedAtTick`, timers), not new `PlayerState` / `RunState` fields. `WORLD_SAVE_PLAN.extract` excludes it ("phase
  extract is never saved"), so the save's shape, `SAVE_SCHEMA_VERSION` and the migrations stay as they are (the X7
  "coverage exclusion" route). The wire still carries `boarded` per player and `liftedAtTick` (AC 15).
  *auto-accepted (designer 2026-11-26: follow recommendations)*
- **D-12.2-2 Landing gate:** the descent's 2 s became balance (`evac.descendS`, counted from the vote's opening by
  `extract.landTicksLeft`); the client's `DESCEND_S` stays 2 (a test keeps them equal). A vote resumed from a save starts
  with the helicopter already landed. *auto-accepted*
- **D-12.2-3 Horde target:** boarded bodies wait at the pad centre (not drawn), so the existing chase field (seeded at
  standing players) heads to the pad — no extra pad field for zombies. Nobody can be hurt (protection), and nothing
  fires in `extract` (no combat, buildings, hazards, decay or loot system runs), so no kill can happen: no kills in run
  stats or milestones by construction (X8). *auto-accepted*
- **D-12.2-4 Horde numbers:** `flyOutHorde` = 40 Walkers at 8/s (all out in 5 s of the 8 s fly-out), round-robin over
  the open wave spawn points. *auto-accepted (a placeholder for 12.3's shot; ask below)*
- **D-12.2-5 "Extracted all four" milestone (7.11):** `runFacts` counts who stood when the extraction began
  (`extract.standingAtStart`), so CN-3's stand-up doesn't hand out the milestone a downed player at the vote didn't
  earn (was: standing at Results). *auto-accepted*
- **D-12.2-6 Joins:** a new seat joining during `extract` is refused (`run_started`), never a waiting joiner (AC 13).
  *auto-accepted*
- **D-12.2-7 Leavers (AC 12):** a consented Leave during `extract` banks `extracted`. Everyone dropping during `extract`
  falls into the existing "all gone mid-run" path (banks, save dropped): rare, left as is. *auto-accepted*
- **D-12.2-8 Shutdown during `extract`:** `saveBlocker` refuses an extract capture, so a server stop mid-extraction
  falls back to the last autosave (the vote's, E8-S12) like a mid-wave stop: the team resumes at the vote and votes
  again. Nothing was banked yet. *auto-accepted*

### Implementation notes

- Phase step (`core/world.ts › step`): `extract` runs `extractInputs` (autopilot, in place of the input system), the
  player system, then — after the lift-off only — `updatePathing` + the zombie slot, then the run slot
  (`updateExtract`: protection, boarding, cut, beat, lift-off, horde, end) and the economy.
- Autopilot: steer at a carrot 4 lattice steps (2 m) down `walkDistanceFrom`'s field; within 4 steps of the pad, at
  the pad centre. Unit move, `movePlayers` applies normal walk speed (sqrt only).
- `snapshotWorld` gains `extract` only once it started (every run without one keeps its digest; the carCorner golden
  moved only for `balance.version`, see its comment).
- Client: `NetSimHost` sends no input and draws my survivor from the interpolation ring during `extract`; mirrors
  `boarded` and `liftedAtTick` into its `world.extract`. `GameScene` hides boarded bodies (and their names/arrows),
  keeps the camera on my boarded body at the pad, hides every action control (`m.voting` true, `m.extracting` for the
  top line "Wave 10 · Extraction"), no protection blink. `HeliView` waits on the pad and flies out from the server's
  lift-off tick over `flyOutS`, east to 6 m past the map edge (`flyOutDxM`); a late phone jumps into the fly-out.
- Results online: `onlineFlow` now sees `extract → results`; the dawn still plays (live) after the fly-out.

### File list

Shared: `run/extract.ts` (new), `run/runStateMachine.ts`, `core/world.ts`, `core/worldSnapshot.ts`, `core/simEvents.ts`,
`buildings/pathOpen.ts`, `config/balanceSchema.ts`, `config/balance/waves.json`, `net/netEvents.ts`, `net/stateView.ts`,
`net/messages.ts`, `save/runSave.ts`, `index.ts`. Server: `rooms/RunRoom.ts`, `rooms/schema/RunState.ts`,
`rooms/schema/syncState.ts`, `run/RunController.ts`, `meta/runMeta.ts`. Client: `sim/NetSimHost.ts`,
`scenes/GameScene.ts`, `scenes/HudScene.ts`, `scenes/hudModel.ts`, `scenes/pingFrame.ts`, `render/heliPose.ts`,
`render/HeliView.ts`, `render/PlayerView.ts`, `net/onlineFlow.ts`, `net/lobbyStore.ts`, `net/fakeRoom.ts`,
`input/menuInput.ts`, `ui/connectionModel.ts`, `ui/waitingView.ts`. Tests: `run/extract.test.ts`,
`save/extractResume.test.ts`, `rooms/schema/syncState.extract.test.ts`, `sim/NetSimHost.extract.test.ts`, the replay
test, and updates to the vote / state machine / net events / room / carCorner / wiring tests.

### Notes for the merge (12.3 hooks)

- Timeline for the camera director: phase `"extract"` start (the `run.extracted` event, or `state.phase`),
  `player.boarded { playerId }` (net kind 68), `run.extract_cut` (69), `run.lifted { tick }` (70, = `liftedAtTick` in
  state), `run.extract_done { wave }` (71, Results the same tick). Solo reads the same from `world.extract`
  (`boarded`, `liftedAtTick`, `cut`, `ticks`, `padX/padY`).
- Helicopter pose: `heliPose(nowS, openedAtS, leftAtS, extract, out, flyS, flyDxM)` with `flyS = evac.flyOutS`,
  `flyDxM = flyOutDxM(map, padX)`; `HeliView.left(nowS, true, flyS)` is called from `GameScene.updateVote` off
  `world.extract.liftedAtTick` (works for a woken phone).
- Camera: `GameScene` centres on my body (at the pad once boarded) — replace that block (search "Story 12.2: aboard").
- HUD: `hudModel.extracting` is true for the whole phase (the director can hide the rest of the HUD from it).
- Out players / held seats are boarded at tick 0 of the phase (the crew "pull-in" visual is 12.3's).
- Net kinds used: 68–71. NET_PROTOCOL_VERSION = 5 (Epic 11 takes 6).

## Senior Developer Review (AI)

**Review 1** (fresh full three-layer review, 2026-11-26, on `b0ede6e1`; reviewer session `session_01CgLgPXDq7yDzkuhpu4JMQB`).
Rule for the fixes: minimal; each with a test that fails on `b0ede6e1` (test-only items excepted). A narrow re-review follows
for H1 and M1. Timings, who boards and the horde size are with the designer: unchanged.

| # | Sev | Finding | Fix | Test (fails on b0ede6e1) |
|---|-----|---------|-----|--------------------------|
| H1 | high | Everyone gone during `extract` → the World froze (`updateFreeze`, `inRun()` includes extract), holds expired, the run banked "quit" and the save was dropped "lost". | `RunRoom.updateFreeze`: never frozen in phase `extract` (no 3-2-1): the extraction runs to Results with nobody connected and banks "extracted"; `dropSave("ended")`. | `RunRoom.reconnect.test.ts` › "review H1: … votes Extract then drops" (stays `extract` forever on b0ede6e1). |
| M1 | medium | "Extracted all four" still read `players.size === 4` / `heldPlayers.size === 0` at Results: a hold or a Leave during the walk changed the answer. | `extract.allFourAtStart` (4 players, 0 held, all standing) stored by `beginExtract`; `runFacts` uses it once `extract.started`. Replaces `standingAtStart`. | `bankingMeta.test.ts` › "review M1": a hold one tick in → M8; a Leave mid-walk → same answer for the leaver and the stayers; one downed at the vote → none. |
| L1 | low | The fly-out horde damaged buildings. | `zombieAi`: no building hit in phase `extract`. | `extract.test.ts` › "review L1" (a barricade is destroyed on b0ede6e1). |
| L2 | low | `walkTimeoutS ≤ descendS` could cut before the landing; `Math.round` instead of `ticksFor`. | Balance refine `walkTimeoutS > descendS`; `openEvacVote` uses `ticksFor`. | `balance.test.ts` › "waves.json › evac (Story 12.2 review L2)". |
| L3 | low | Bot client ignored `extract` for reconnect, watchdog and pings. | `botInRun(phase)` (with `extract`) used at the three places; bots send no input in `extract`. | `tools/bots/botInRun.test.ts`. |
| L4 | low | A phone waking straight into a later endless extraction after a Stay lift-off saw no fly-out (`hasLeft` stuck). | `render/heliSync.ts › syncHeliToRun` (pure; GameScene calls it): a build clears a flown-off helicopter (a Stay lift-off still in the air plays out). | `heliSync.test.ts`. |
| L5 | low | `for…of` iterators per tick in `updateExtract` / `extractInputs`. | One pass with module-level `forEach` callbacks. | `tools/checks/extractNoAlloc.test.ts` (source check). |
| L6 | low | 12.3 needs `padX/padY`, `cut`, `ticks` online. | Synced `extractStartTick` (int32, −1) and `extractCut`; NetSimHost mirrors `startTick`, `ticks` (= tick − start), `cut`, and the pad (`evacPadPoint`, map data). | `syncState.extract.test.ts` › "review L6" (sent → changed → synced, reset); `NetSimHost.extract.test.ts` › "review L6". |
| L7 | low (tests) | AC 4 test didn't have fire/acid present at the start; AC 3 ping not through the room; two evacVote asserts loosened; no endless extraction test. | AC 4: a molotov fire and an acid puddle at the body during the vote are gone at the extract's start; ping sent through a real room reaches the teammate; `runVote` stops at the resolution so both asserts are exactly `"extract"` again; AC 2 test: Stay at 10, Extract at 15. | test-only. The room ping test fails with `pingRefusal` refusing `extract` (checked). |
| L8 | low | Online, prediction resumed on Results: a thumb on the stick walked my survivor (and the camera) away from the pad. | `NetSimHost`: no prediction in `extract` nor on Results after it (`liftedAtTick ≥ 0`). | `NetSimHost.extract.test.ts` › "review L8" (5 m off the pad on b0ede6e1). |
| nit | — | `flyOutHorde.type` any zombie; dry weapon ticks for skipped inputs in `extract`; test hooks; PlayerView field placement. | Schema `type: z.enum(["walker"])`; `RunController` drops skipped inputs in `extract`; hooks cleared in `afterEach` / `finally`; `noBlink` moved to the fields. | — |

Left for 12.3 (noted): the flashlight cone of a body walking to (or waiting at) the pad.

## Main session close-out (2026-11-26)
- Fresh 3-layer review (H1 empty room in extract banks quit; M1 all-four judged at Results; L1–L8) → fixed in b024d1e → narrow re-review: no findings. CI green. Merged as e5aef083 (PR #36). Protocol 5.
- **Open with the designer (balance only, tunable later):** timings (walk cap 8 s, beat 0.5 s, fly-out 8 s), downed survivors walk (CN-3), fly-out horde of 40 Walkers. Merged as built.

- **Designer 2026-11-27:** fly-out horde 40 → 150 Walkers (30/s), PR #38. Timings and the downed walk: still open.
