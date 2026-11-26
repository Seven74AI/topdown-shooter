---
baseline_commit: e029c57
---

# Story 8.12: Only standing, connected players vote

Status: ready-for-dev

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
8. **As-built notes when it lands (clash X1; designer "ok" 2026-11-26, `sprint-change-proposal-2026-11-26-epic-9-photoreal.md` §6).** Add an as-built note to Story 6.11 in `epics.md` (only connected, standing players count; downed, out and held players see disabled buttons) and reword FR66 to "a majority of the connected, standing players; a tie or no counted votes means Extract". The reversal of 8.1 M2 / RR1-M1 is confirmed with 8.1 B15/B16/B19 in the E8-A9 review (`docs/epic-8-story-decisions.md` › Designer review 2026-11-26); the existing Docs task covers the note there.

## Tasks

- [ ] `packages/shared/src/run/runStateMachine.ts`: `countVotes`, `resolveEvacVote`, `everyoneVoted` (AC 1, 2, 4); update the comments that cite "review M2".
- [ ] `packages/shared/src/player/hold.test.ts`: rewrite the "Story 8.1 review M2" block (lines ~529–570) to the new rule (AC 1–3); keep the `earnedAtEvac` assertion (AC 5).
- [ ] `packages/shared/src/run/evacVote.test.ts`: add the AC 1 table as cases.
- [ ] `apps/client/src/ui/voteModel.ts` + `apps/client/src/ui/connectionModel.test.ts`: `addHeldVoters` per AC 6.
- [ ] Docs: note the reversal next to 8.1 M2 in `_bmad-output/implementation-artifacts/8-1-reconnect-within-2-minutes.md` (review table) and `docs/epic-8-story-decisions.md`.

## Dev Notes

- Before 8.1 review M2, the code already ignored held seats (`voteOutcome(t.stay, world.players.size)`). M2 changed it on purpose ("Probe: 4 players, 2 vote Stay, 2 held → Stay … with the story's rule it is Extract"). This story goes back to the earlier behaviour, now chosen by the designer, and adds the panel and return-during-vote rules.
- The risk M2 guarded against: a player on a bad line drops for a few seconds during the vote and the rest of the team switches the run to endless. That's accepted now. A returning player can still vote before the timer ends (AC 3).
- CN-5 settled: dead (out) players don't count.
- When Extract wins, the extraction walk and cinematic play: Stories 12.2 and 12.3.
