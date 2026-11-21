# Story 1.12: Melee and controls playtest on real phones

Status: ready-for-dev

<!-- Human story: the playtest is run by the designer and friends. The dev agent prepares the build and the form, then applies the tuning decisions. -->

## Story

As the designer,
I want my friends and me to try the controls on our own phones,
so that we fix the feel (especially melee under twin-stick) before building on top of it.

## Acceptance Criteria

1. **Playtest.** With the published build, at least 3 people play 3 waves each with Pistol + Machete and with SMG + Hunting Rifle on their own phones; their feedback on the move stick, aim stick, auto-fire, aim assist, swap and melee is written to `docs/playtests/epic-1-controls.md`.
2. **Decisions.** The feedback is reviewed with the designer; each issue is either fixed by tuning balance or control values (dead zones, aim-assist angle, melee arc), or turned into a new story. The decision on melee under twin-stick (keep as is, tune, or change) is recorded.

## Tasks / Subtasks

- [ ] **Task 1 (dev): Playtest build** — make sure the published links (`https://hordes.sevend.io/` and/or GitHub Pages) run Stories 1.2–1.11. In release builds the dev loadout picker (1.8) is hidden, so add a fixed `?loadout=pistol,machete` / `?loadout=smg,hunting_rifle` URL option (release-safe: it only picks a starting loadout from existing weapons, no other cheat). Put both links at the top of the playtest doc
- [ ] **Task 2 (dev): Playtest form** — `docs/playtests/epic-1-controls.md`: how to play (landscape, left thumb moves, right thumb aims and fires, swap button), the two links, and per tester a short form: phone + browser; 1–5 ratings and one sentence each for move stick, aim stick, auto-fire, aim assist, swap, melee; "what felt wrong"; waves reached per loadout. Plus a section "Decisions" (empty) and "Tuning changes" (empty)
- [ ] **Task 3 (dev): Live tuning without code** — `?tune=1` (release-safe) shows a small panel to adjust, for this session only, `moveDeadZone`, `aimDeadZone`, `aimAssistDeg`, Machete `arcDeg` / `rangeM` / `hitPushbackM`, and the stick radius, with **Copy values**. Implement as a client-side balance override applied before `createWorld` (`loadBalance(withOverrides(raw, overrides))`), so the simulation still reads one validated `Balance` object
- [ ] **Task 4 (human): Run the playtest** — designer + at least 2 friends, 3 waves per loadout, fill in the form
- [ ] **Task 5 (designer + dev): Decide** — for each issue: tune (change `config/balance/*.json`, bump nothing else; balance version changes automatically) or create a story (append to `epics.md` and `sprint-status.yaml` via `gds-correct-course` if it changes scope). Record the melee decision: keep / tune / change
- [ ] **Task 6 (dev): Apply** — commit the tuned balance values with the reasons in the doc's "Tuning changes"; run tests (some tests assert balance-driven numbers; update expected values only where the change was decided here)

## Dev Notes

- This is a **human story** (marked in `sprint-status.yaml`). The dev agent must not mark it done until Task 4 and Task 5 are recorded by the designer. Until then, set the status to `review` with a clear "waiting for playtest" note.
- Builds on all of Epic 1. Read Stories 1.3, 1.5, 1.6, 1.8, 1.9 records for the current control values.
- Tuning knobs already live in balance (Story 1.3 `controls.json`, 1.9 Machete) or client constants (stick radius in 1.3). If the playtest wants stick radius or button positions changed, those are client constants, not balance; change them in code and note it.
- Results feed Story 2.x only through balance values; no architecture change is expected. If melee is judged unworkable, that is a design change → `gds-correct-course`.

### Project Structure Notes

New: `docs/playtests/epic-1-controls.md`, `apps/client/src/debug/TuningPanel.tsx`, `apps/client/src/debug/urlOptions.ts` (parses `?loadout`, `?tune`, `?debug`, `?stress` in one place; unit-tested).
Modified: `GameScene.ts` / run start (overrides, URL loadout), `config/balance.ts` (`withOverrides` helper, validated like the rest).

### References

- [Source: epics.md#Story 1.12: Melee and controls playtest on real phones]
- [Source: gdd.md#Controls and Input] (open risk: melee under twin-stick)
- Balance data-driven (NFR14): [Source: epics.md#NonFunctional Requirements]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
