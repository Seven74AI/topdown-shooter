---
baseline_commit: e13f439
---

# Story 12.2: Extraction: walk to the helicopter and lift off

Status: ready-for-dev

<!-- Quick story 2026-11-25 from the party-mode session on cinematics. Needs 12.1 (buildings never close a path) and 8.12 (vote counting). The camera work is 12.3; this story already looks right with the normal camera. -->

## Story

As a team that just voted to extract,
I want our survivors to walk to the helicopter on their own, climb in and fly off over the horde,
so that the end of a won run feels like an ending, not a cut to a menu.

## Designer decisions (2026-11-25)

- When Extract wins, everybody is frozen and moved automatically to the helicopter. When everybody is inside, it flies off.
- Extract wins on a tie (6.11 D1, unchanged). Disconnected and downed players don't count in the vote (Story 8.12).

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

## Tasks

- [ ] `packages/shared/src/run/runStateMachine.ts`: `"extract"` phase, `startExtract`, phase tick, `endRun` from `extract` (AC 1, 2, 9).
- [ ] `packages/shared/src/run/extract.ts` (new): autopilot, boarding, timeout, horde (AC 5–10).
- [ ] Balance: `evac.walkTimeoutS`, `evac.flyOutS`, `evac.flyOutHorde` in `balanceSchema.ts` and `waves.json`.
- [ ] Server: `RunRoom.onTick` steps the `extract` phase; drop inputs (AC 3); copy chain (AC 15).
- [ ] Client: hide the action controls and stop sending input; `heliPose` fly-out (AC 11); Results timing (AC 12).
- [ ] Tests (AC 16).

## Dev Notes

- Today `resolveEvacVote` calls `endRun` in the same tick (runStateMachine.ts), and the helicopter does a 4 s climb (`EXTRACT_FLY_S`), entirely on the client.
- Party-session reasoning for driving the walk in the sim rather than as a client animation: every phone sees the same walk, and replays and trailers (later) get it for free.
- Decisions CN-3 and CN-4 are recommended defaults; the designer can change them.
