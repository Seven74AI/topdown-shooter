---
baseline_commit: e029c57
---

# Story 8.12: Only standing, connected players vote

Status: review

<!-- Quick story 2026-11-25 from a designer decision in the party-mode session on cinematics. It deliberately REVERSES Story 8.1 review M2 / re-review RR1-M1 (a held seat counted as a silent = Extract vote). -->

## Story

As a player in a co-op run,
I want the evacuation vote to count only the players who are actually connected,
so that a teammate who dropped can't tip the vote to Extract against the players who are still here.

## Designer decision (2026-11-25)

> If a player is not there, two people want to stay and one wants to extract, then they should stay. The player who has disconnected should not be taken into account.

> (later the same day) Disconnected players do not count. Downed players do not count. If there is a tie, Extract wins.
> (later) Dead people do not count in the vote.

This replaces the rule from Story 8.1 review M2 ("a held seat is a silent vote, silent = Extract"). The 6.11 D1 rule still applies to **connected** players who don't vote: they count as Extract.

## Acceptance Criteria

0. **Who counts: connected players who are standing.** A player counts in the vote only while connected (not in `world.heldPlayers`) **and alive** (`status === "alive"`): downed and out (dead, spectating) players don't count. The count is taken at the tick the vote resolves: a downed player who is revived before then counts again with the choice they made (or silent).

1. **Held seats leave the count.** `resolveEvacVote` uses only the connected players as the total: `voteOutcome(t.stay, world.players.size)`. `countVotes` no longer adds `world.heldPlayers.size` to `silent`.
   - 4 seats, 1 held, 2 Stay + 1 Extract → **Stay** (endless on).
   - 4 seats, 2 held, 2 Stay → **Stay**.
   - 4 seats, 1 held, 1 Stay + 2 Extract → Extract.
   - 4 connected, 2 Stay + 2 Extract → Extract (unchanged: a tie is Extract).
   - 3 connected, 2 Stay + 1 silent → Stay (unchanged: 2 × 2 > 3).
   - 4 connected, 1 downed (voted Extract), 2 Stay + 1 Extract → **Stay** (2 × 2 > 3).
   - 4 connected, 2 downed, 1 Stay + 1 Extract → Extract (tie).
   - 4 connected, 1 out (dead), 2 Stay + 1 Extract → **Stay**.
2. **The vote can end early without the held seats or downed players.** `everyoneVoted` drops the `world.heldPlayers.size > 0` guard and skips downed and out players. Once every counted player has voted, the vote ends `allVotedHoldS` later, as in 6.11 F4.
3. **A player who comes back during the vote votes.** A seat returning (`returnPlayer`) while the phase is `vote` counts again from that tick, starting with no vote (silent = Extract). It counts at the tick the vote resolves, so a return can still change the outcome.
4. **Nobody counts → Extract.** If no player counts when the vote resolves (all held, downed or out), the result stays Extract (`voteOutcome` with 0 players already returns `"extract"`).
5. **Earnings unchanged.** `markHeldEvac` stays: a held seat still gets `earnedAtEvac` at the first Stay (the 8.1 M2 earnings fix is about banking, not the vote).
6. **The panel agrees with the server.** Downed and out players' chips are shown as "not voting" too, and their vote buttons are disabled. The client vote panel stops counting held seats as silent Extract chips (`apps/client/src/ui/voteModel.ts` `addHeldVoters`, 8.1 RR1-M1). A held seat is either hidden from the panel or shown as a dimmed chip marked "not voting" that is left out of the result line, `allIn` and `voteUrgent`. The result line ("STAY · 1 – 2") matches what the server will decide.
7. **Replay unchanged.** `hold` / `return` stay replay commands. The replay digest test still passes; only the vote outcome in scenarios with held seats changes.

## Tasks

- [x] `packages/shared/src/run/runStateMachine.ts`: `countVotes`, `resolveEvacVote`, `everyoneVoted` (AC 1, 2, 4); update the comments that cite "review M2".
- [x] `packages/shared/src/player/hold.test.ts`: rewrite the "Story 8.1 review M2" block (lines ~529–570) to the new rule (AC 1–3); keep the `earnedAtEvac` assertion (AC 5).
- [x] `packages/shared/src/run/evacVote.test.ts`: add the AC 1 table as cases.
- [x] `apps/client/src/ui/voteModel.ts` + `apps/client/src/ui/connectionModel.test.ts`: `addHeldVoters` per AC 6.
- [x] Docs: note the reversal next to 8.1 M2 in `_bmad-output/implementation-artifacts/8-1-reconnect-within-2-minutes.md` (review table) and `docs/epic-8-story-decisions.md`.

## Dev Notes

- Before 8.1 review M2, the code already ignored held seats (`voteOutcome(t.stay, world.players.size)`). M2 changed it on purpose ("Probe: 4 players, 2 vote Stay, 2 held → Stay … with the story's rule it is Extract"). This story goes back to the earlier behaviour, now chosen by the designer, and adds the panel and return-during-vote rules.
- The risk M2 guarded against: a player on a bad line drops for a few seconds during the vote and the rest of the team switches the run to endless. That's accepted now. A returning player can still vote before the timer ends (AC 3).
- CN-5 settled: dead (out) players don't count.
- When Extract wins, the extraction walk and cinematic play: Stories 12.2 and 12.3.

## Decisions (auto-accepted (designer 2026-11-26))

The story left these open; each takes the recommendation and is logged in `docs/epic-8-story-decisions.md` › "Story 8.12".

- **D1** A downed or out player's `castVote` is still stored on the server (unchanged); it only counts if they stand again before the vote resolves. The panel disables their buttons and the scene drops their taps.
- **D2** A seat returning during the 1 s "everyone voted" beat doesn't re-extend it (6.11 F4: the timer only shortens). The returner counts at the resolve: silent = Extract unless they tap in time.
- **D3** Nobody counts (all held, downed or out): no early end; the timer runs out, then Extract.
- **D4** Held seats stay in the panel as dimmed chips (AC 6's second option), reading "not voting" like downed and out players; left out of the result line, `allIn` and `voteUrgent`. When I'm down or out, my buttons are disabled and neither shows pressed.

## Dev Agent Record

### Completion Notes List

- `runStateMachine.ts`: new `countsInVote(p)` (= `status === "alive"`; a held seat isn't in `world.players`), exported. `countVotes` tallies only counted players (held seats are no longer added to `silent`); `resolveEvacVote` uses `voteOutcome(stay, counted)`; `everyoneVoted` skips non-counted players and drops the held-seat guard, false when nobody counts. `run.vote_resolved { extract, stay, silent }` now sums to the counted players. `markHeldEvac` unchanged (AC 5).
- AC 3 needed no code: `holdPlayer` already clears `vote` (8.1 F7), and `returnPlayer` puts the player back in `world.players`, so they count from that tick, silent.
- Client: `GameScene.collectVoter` uses `countsInVote`; the tap handler drops taps from a downed or out me. `voteModel`: `voteResultLine`, `allIn` and `voteUrgent` skip non-standing chips (nobody counting: no line, not urgent except the last 500 ms); a non-standing chip shows vote 0; `VoteView.canVote`; `mine` is 0 when I'm not standing. `EvacVote.tsx`: "not voting" chip text, buttons `disabled` (+ the tap guarded), `.evac__btn:disabled` greyed in `overlay.css`.
- Late joiners (8.2) and removed players (8.3) are not in `world.players`, so they never counted and still don't; the panel only lists World players plus held seats.
- Docs: as-built note on 6.11's fairness rules; FR66 reworded in epics.md and the GDD (and the architecture line); epics.md 6.11 ACs carry as-built notes; 8.1 M2 / RR1-M1 / the Epic 6 note marked as reversed; decisions doc section.

### Tests

- `run/evacVote.test.ts` › "Story 8.12": the AC 1 table through the real run (held, downed, out; counted totals checked); early end with held + downed seats; a silent standing player keeps the timer; a return mid-vote counts again, silent, including the "inside the hold beat" case (D2) and a returner who votes Stay; the threshold recomputes when the silent player drops (tie → Stay); a revived player counts with their earlier choice; nobody counts (all held; held + downed) → Extract after the full timer. The old "a downed player votes too (F1)" case is rewritten to the new rule.
- `player/hold.test.ts`: the 8.1 M2 block rewritten (2 Stay + 2 held → Stay; 1 held + 2 Stay + 1 Extract → Stay with `earnedAtEvac` kept; 1 held + 1 Stay + 2 Extract → Extract); RR1-N1 now asserts the vote IS shortened with a held seat.
- `ui/connectionModel.test.ts` › "Story 8.12": the panel's counts (held, downed, out, me downed, nobody counting); `ui/voteModel.test.ts` downed case updated.
- Browser (Playwright + Chromium, 800 × 360, a temporary page rendering `EvacVote` with `overlay.css`): "not voting" chips dimmed, result lines "STAY · 0 – 2" / "EXTRACT · 1 – 1", both buttons disabled and greyed when I'm downed. Not verified: the full online game with a real dropped phone during a vote.

### File List

- packages/shared/src/run/runStateMachine.ts, packages/shared/src/index.ts
- packages/shared/src/run/evacVote.test.ts, packages/shared/src/player/hold.test.ts
- apps/client/src/ui/voteModel.ts, apps/client/src/ui/EvacVote.tsx, apps/client/src/ui/overlay.css, apps/client/src/scenes/GameScene.ts
- apps/client/src/ui/connectionModel.test.ts, apps/client/src/ui/voteModel.test.ts
- docs: 6-11-evacuation-vote.md, 8-1-reconnect-within-2-minutes.md, this file, epics.md, gdd.md, game-architecture.md, docs/epic-8-story-decisions.md

### Notes for the merge

- netEvents kinds and readability-sheet numbers: none used.
- `run.vote_resolved`'s `silent` no longer includes held seats (server log `vote_resolved` changes the same way).
