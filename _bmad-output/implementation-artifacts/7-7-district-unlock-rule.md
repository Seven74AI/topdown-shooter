# Story 7.7: District unlock rule

Status: done (built in the merged story 7.7 + 7.11 + 7.12 on branch `story-7-12`; Dev Agent Record in `7-12-surprise-loot-bag.md`)

<!-- Epic 7 progression story 7 of 7. Story file 2026-11-24 (gds-create-story, non-interactive) from the real code on master 7385b47. Designer decision D12 (the host can pick a district if anyone in the lobby has it) is a rule here. District 2 content is out of v1 (FR81: "rule only"); Epic 11 later adds a Random city card to the same picker (open from the start, not an unlock; sprint-change-proposal-2026-11-24-random-city.md). -->

## Story

As a player,
I want to see that extracting from Downtown unlocks the next district,
so that I have a goal beyond one map.

> **Brief.** EPIC 6 BRIEF lines **1, 3, 4, 9, 10** (the district list in `progression.json`), **17** (the pick is a lobby message under `this.net.guard`), **19, 29, 31, 32**.

> **Scope:** the district list, the unlock written in 7.2's end-of-run transaction, a host-only district picker in the lobby with the "anyone in the lobby has it" rule, the Results line. In v1 only Downtown can actually be played; District 2's card shows its state. **Not here:** District 2's map, the Random city card (Epic 11).

## Acceptance Criteria

### Fairness / player-visible rules (each is a test)

- **R1 "One extract from Downtown unlocks District 2 for me."** On my first extraction from Downtown (wave 10, or a later endless extract), District 2 is added to my progress in the same transaction as my Supplies, and Results shows "Unlocked: District 2" once (FR81). Only players in the run at the extract get it (as 7.2's extract bonus).
- **R2 "A friend can bring me along."** In the lobby the host can pick a district if **any player in the lobby** has unlocked it (D12); a district nobody has shows locked with "Extract from Downtown to unlock".
- **R3 "The pick can't strand anyone."** If the last player who has the picked district leaves the lobby before Start, the pick goes back to Downtown and everyone sees "Back to Downtown: nobody here has District 2".
- **R4 "Only the host picks; everyone sees it."** Non-hosts see the current pick but can't change it; the server refuses a pick from a non-host or of a district the rule doesn't allow (refusal is only logged, like Start).
- **R5 "Coming soon means coming soon."** In v1 District 2's card shows "Unlocked · coming soon" (when someone has it) and can't be started; Downtown stays the run's map.

### Behaviour

1. **Data** (`progression.json › districts`): `[ { id: "downtown", name: "Downtown", unlock: null, playable: true }, { id: "district_2", name: "District 2", unlock: { extractFrom: "downtown" }, playable: false } ]` (name: decision 7.7 D1). A test: `downtown` matches `DOWNTOWN_MAP.name` (`map/districtMap.ts:151`, `downtown.test.ts:27-28`).
2. **Unlock write.** 7.2's `meta/banking.ts` gets a writer: when `ending === "extracted"`, the map is `downtown`, and the player was in the run at `run.extracted`, add `district_2` to `progress.districts` if absent; the transaction returns `newDistricts`, sent in `run.rewards` (`{ …, newDistricts: [{ id, name }] }`). Results panel line "Unlocked: District 2" (with "coming soon" under it in v1), placed after 7.11's milestone item and 7.12's loot line, before 7.6's nudge (7.2 AC 5 order).
3. **Lobby state.** When a member joins the lobby (account from 7.1), the room loads their `districts` (async, 2 s timeout; none until loaded or on failure). Schema `RunState.district` (string, default `"downtown"`) and `RunState.districtsOpen` (u8 bitmask: union of members' unlocked districts, bit i = list index; Downtown always set), recomputed on join/leave. `syncState`, stateView key lists, `fakeRoom`, `lobbyStore`.
4. **Pick message** `C2S.LOBBY_DISTRICT = "lobby.district"` `{ id }` (`z.object({ id: z.string().max(32) }).strict()`, `this.net.guard`): accepted only in the lobby, from the host (`state.hostSlot`), for a listed id whose bit is in `districtsOpen` **and** `playable` (R5; tests use a test progression with a playable second district). R3 on every leave.
5. **Start** reads `state.district` to choose the map (`RunRoom.startRun`, `RunRoom.ts:675-692`, today always `DOWNTOWN_MAP` via `RunController.ts:287` default) — in v1 it is always Downtown; the code path is there for Epic 11 and later districts.
6. **Lobby UI** (`ui/LobbyScreen.tsx`): a district row above the team list: one card per district (Downtown selected; District 2 locked "Extract from Downtown to unlock", or "Unlocked · coming soon"); the host taps a playable card to pick; others see the pick. Room for a third card (Epic 11 Random city). Plus R3's notice in the existing `lobby__notice` line (`LobbyScreen.tsx`, 2 s notice).
7. **Progress hub** (7.3): the header (or a small "Districts" line under the Supplies total) shows "District 2: unlocked · coming soon" or "Extract from Downtown to unlock" (decision 7.7 D2).

## Tasks / Subtasks

- [x] **T1 Data + rule** (AC 1, 4): `progression.json › districts`, zod, `meta/districts.ts` (`openMask(members)`, `canPick(id, mask, isHost)`), tests.
- [x] **T2 Unlock write** (AC 2; R1): banking writer, `newDistricts` in `run.rewards`, Results line. Tests with 7.2's PGlite harness.
- [x] **T3 Lobby** (AC 3–5; R2–R4): member district load, schema fields + every copy, message + guard, leave fallback + notice, Start reads the pick.
- [x] **T4 UI** (AC 6, 7) after the designer's pick.
- [x] **T5 Tests + gate + hand-back.**

## Dev Notes

### Current state (read before changing)

- **No district picker or district field anywhere.** The client and server share `DistrictMap.version` in join options for a map check (`messages.ts:155`); `DistrictMap.name` is `"downtown"` (`districtMap.ts:151`); `RunController` uses `opts.map ?? DOWNTOWN_MAP` (`RunController.ts:287`).
- **Lobby:** `ui/LobbyScreen.tsx` (code, invite link, Copy/Share, a 2 s notice line, 4 slot rows with Host/You tags, Ready/Start/Leave); `net/lobbyStore.ts` (`lobbyView`); start rules `net/lobbyRules.ts:15-25` (`startBlocker`: host only, ≥ 1 player, all Ready); `RunRoom.onStart` (`:656-668`) → `startRun` (`:675`). Host moves on leave (architecture: to the longest-connected player).
- **Run end and extract:** from 6.11 (`run.ending`, `run.extracted`) and 7.2's banking transaction; neither exists on master yet.

### Epic 6: check at build time

- 6.11's `run.extracted` and `ending: "extracted"` (6.11 AC 4); 6.12's endless extract also counts (R1: "or a later endless extract").

### Testing (R1–R5 each a named test)

- R1 (PGlite): extract from Downtown → `districts` gains `district_2`, `newDistricts` once; a second extract → no new line; a wipe → nothing; a player who quit before the extract → nothing; endless extract → yes.
- R2: lobby of a newcomer (host) + a veteran with District 2 (test progression: playable) → host may pick it; the same lobby without the veteran → refused.
- R3: picked District 2, the veteran leaves → `district` back to `downtown`, notice sent.
- R4: a non-host pick → refused, logged; a pick outside the lobby → ignored.
- R5: real progression: District 2 never pickable; Start always uses Downtown.
- Client: cards render the three states; the notice shows.
- Mutations: allow non-hosts → R4 fails; skip the leave recompute → R3 fails; grant the district on any ending → R1's wipe case fails.

### Beat the rule (reviewer start list)

1. **Cheating:** send `lobby.district` as a non-host, with an unknown id, a non-playable id, or mid-run → refused/ignored.
2. **Farming:** none (no Supplies); a newcomer gets District 2 only by extracting themselves (riding along with a veteran lets them **play** it later, not own it).
3. **Losing progress:** the database fails at run end → the district is written with 7.2's retry; on a second failure it's logged with the Supplies breakdown.
4. **Two devices:** unlocked on the tablet, the phone sees it after its next session refresh (lobby join loads it).
5. **Offline / unsaved guest:** no account → no districts; can still play any district a teammate opens (R2 is about the lobby, not the player).
6. **Host leaves** with District 2 picked: the new host keeps the pick if someone still has it, else R3.

### Notes for the merge

- `progression.json`: separate `districts` key.
- `meta/banking.ts` writers: 7.2 (Supplies), this story, **7.11** (milestones: M2 "first extraction" fires from the same `run.extracted` event, proposal § 6), **7.12** (loot).
- `RunState` schema / `lobbyStore`: 8.2 (Epic 8, later) and Epic 11's Random city card add to the same lobby; keep the district row data-driven.
- `LobbyScreen.tsx`: **7.9** (other writer) shows each slot card's survivor; this story adds the district row above the team.

### Dependencies

7.1 (accounts), 7.2 (banking transaction and Run rewards panel), Epic 6's 6.11 (extract). Independent of 7.3–7.6 (only shares the hub header with 7.3). Epic 11 (Random city) builds on the picker.

### Decisions to confirm (recommended first, alternative after)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.7 D1 | District 2's name on its card | **"District 2"** until its content is chosen (one of the GDD candidates, e.g. "Hospital", now) |
| 7.7 D2 | Seeing my district progress outside the lobby | **A "Districts" line in the Progress hub** (lobby picker only) |
| 7.7 D3 | The host picked District 2 and its only holder leaves | **Back to Downtown with a notice** (keep the pick and refuse Start until the host changes it) |

### Needs a look?

**Yes: the lobby district picker** — the district cards row (Downtown selected, District 2 locked / "Unlocked · coming soon", room for Epic 11's Random city card), how the host's pick and a non-host's read-only view differ, fitting it above the 4 slot rows at 568 × 320 — and the **"Unlocked: District 2"** line in the Run rewards panel (part of 7.2's panel proposal). The designer picks from code-drawn proposals before this story is built.

### References

- `epics.md` › Story 7.7; FR81, FR90; GDD › Player Progression (District 2), Level Types; `docs/ideas/epic-7/proposal.md` § 0 D12, § 6; `sprint-change-proposal-2026-11-24-random-city.md`; `6-11-evacuation-vote.md` AC 4.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Story file written 2026-11-24 (gds-create-story, non-interactive) from master 7385b47; decisions 7.7 D1–D3 pending.
- **Update 2026-11-26 (back-filled, Epic 7 retro E7-A4):** D1–D3 are no longer pending. The designer accepted every recommended value on 2026-11-25 ("Okay, for all", `docs/epic-7-story-decisions-progress.md:3`, rows :96–:98): D1 the card is named **"District 2"** until its content is chosen; D2 a **"Districts" line in the Progress hub**; D3 the pick goes **back to Downtown with a notice** when its only holder leaves. Built that way in the merged story (see `7-12-surprise-loot-bag.md`).

### File List

## Change Log

- 2026-11-24: story file created (ready-for-dev).

- 2026-11-25: built in the merged story 7.7 + 7.11 + 7.12 (branch `story-7-12`); the named tests per task, the Gate line, Notes for the merge and Not verified are in `7-12-surprise-loot-bag.md` › Dev Agent Record.
- 2026-11-26: Completion Notes updated: decisions D1–D3 accepted 2026-11-25 (docs/epic-7-story-decisions-progress.md), back-filled per Epic 7 retro E7-A4.
