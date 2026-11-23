# Sprint Change Proposal: planning text aligned with later decisions (2026-11-23)

Workflow: `gds-correct-course`, run in batch mode. The designer approved it beforehand ("everything okay", 2026-11-23; answers in `docs/epic-5-decisions.md` › "Alignment answers").

## 1. Issue summary

The alignment check (`docs/alignment/alignment-check-2026-11-23.md`) found **90 stale-text rows** (57 high, 33 low) and **16 open questions**. In those rows, planning text says something that a later designer decision replaced, for example:
- barricades now stop bullets (PR #6);
- the Grenade Launcher lobs over obstacles (PR #5);
- the build bar replaced the shop for buildings (5.16);
- all art is drawn in game code;
- the Epic 6 decisions D1–D7.

Left as they were, these lines would lead builders to build the wrong rule, or reviewers to fail a correct build.

## 2. Impact analysis

- **Epics:** 5 (ready-for-dev and backlog stories), 6, 7, 8 and 10 (wording, rules and checks).
  - Epic 9 gets a new goal: a polish pass of the code-drawn art **and** audio, with no hiring (designer Q2).
- **Artifacts:**
  - `epics.md` (requirements inventory, UX/additional requirements, Stories 5.4–5.22 and 6.2–10.9);
  - the GDD, the GDD's epics list and its decision log;
  - `game-architecture.md`;
  - the EPIC 5 BRIEF (`epic-4-retro-2026-11-23.md` §11) and its copy in 5.13;
  - the superseded EPIC 4 BRIEF line in the Epic 3 retro;
  - the readability key and sheet;
  - the 5.13 story file;
  - the building UX spec and draft stories;
  - `docs/epic-5-decisions.md`.
- **Technical:** none. No game code changes. Built stories already follow the decisions.

## 3. Recommended approach

**Direct adjustment.** The text is edited in place with the newer rule and its source, and no story is added or removed. Effort was small, risk is low, and the timeline is unchanged.

## 4. Change proposals (applied)

Each row's before/after text is in the alignment report (§ tables, "What it says" → "Proposed new wording"). Every row was re-checked against the current file before editing.

| Group | Rows | Files |
| --- | --- | --- |
| Cross-cutting rules | 1–42 | `epics.md` FRs/NFRs/requirements; GDD; GDD epics; decision log; `game-architecture.md` |
| Briefs and playtest sheet | 43–49 | `epic-4-retro` §11 (brief lines 5, 12, 15); `epic-3-retro` (superseded note); readability key and sheet (fill-in block now goes to 38) |
| Epic 5 | 56–64, 66–73 | 5.13 story file (buildings out of the shop, `not_alive` on buy and reroll, C3 decided and drawn in CSS, Gas torch, Q13); `epics.md` 5.4, 5.9–5.11, 5.13, 5.16, 5.17, 5.20–5.22; UX spec and draft stories |
| Epics 6–10 | 74–88, 90 | `epics.md` 6.2–6.10, 7.3–7.9, 8.1–8.7, Epic 9 (rewritten, no hiring), 10.1, 10.2, 10.8, 10.9 |
| Decision docs | 89 | `docs/epic-5-decisions.md` line 7 |

These designer answers were applied where they bite:
- Q1: swap and consumable buttons sit above the build bar's top-left.
- Q2: no hiring.
- Q3: unlock prices 350 / 100 / 150.
- Q4: undo chip and action-bar sizes.
- Q5: 5.19 builds the item chip.
- Q8: boss, event and rubble cover rules.
- Q9: standing players only.
- Q10: earnings decided by the Epic 5 balance pass.
- Q11: cap 6 kept.
- Q12: solo × 0.4, not balance-tuned.
- Q13: fewer cards, Reroll disabled.
- Q14: pings.
- Q15: the Honor 10 is replaced by the Xiaomi Mi 11 (exact model to confirm).
- Q16: turret pay during the reconnect hold.

**Partly applied:**
- Row 9: the count is "7 building types (barricade in 3 tiers, …)", not "8 buildings + 3 tiers".
- Row 25: the GDD bear trap row leaves out which damage wears it (open point below).
- Row 48: the sheet caption is changed; the picture may still need a retake.
- The Gas torch row copies the Flamethrower's burn, fuel and reload values.

**Held back.** These are files and sections that builders or writers are working on now; the main session forwards their rows:
- 5.12 story file: rows 50, 51, 52, 53, 54, 55, plus Q1 and Q6 (the molotov needs a clear line from the zone centre).
- 5.14 section in `epics.md`: row 65, plus Q7 (D1–D12).
- 5.18 / 5.19: Q5 (5.19 builds the item chip).

Requirement-inventory lines that mention these stories (FR49, FR52) were updated.

## 5. Implementation handoff

- **Scope:** Moderate, because it is text across many artifacts with no backlog reorganisation. The orchestrator forwards the held-back rows to the 5.12, 5.14, 5.18 and 5.19 builders.
- **Success criteria:** no planning text contradicts `docs/epic-5-decisions.md`, HANDOFF §4 or the Epic 6 decisions; future builders read one rule per mechanic.
- **Open for the designer:**
  1. The Xiaomi Mi 11 is a 2021 flagship, faster than the Pixel 5 and Galaxy A52, so it is odd as a low-end floor. Is it a Redmi Note 11 or a Xiaomi 11 Lite?
  2. Do Bloater blasts wear the bear trap? The 5.14 text says yes; the answer passed on for this pass says no.
  3. Solo Behemoth HP: × 0.4 or × 0.3?
  4. Should the 10.8 earnings target (2,500–3,000) be revisited in the balance pass?
