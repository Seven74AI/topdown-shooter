---
stepsCompleted: [step-01-document-discovery, step-02-gdd-analysis, step-03-epic-coverage-validation, step-04-ux-alignment, step-05-epic-quality-review, step-06-final-assessment]
scope: Epic 7 only (Stories 7.1–7.12)
documentsIncluded:
  gdd: gdds/gdd-topdown-shooter-2026-11-21/gdd.md
  architecture: game-architecture.md
  epics: epics.md (› Epic 7)
  ux: none for Epic 7 (docs/ideas/customization/avatar-editor.html is a prototype, not a spec)
  stories: none yet (no 7-* story files in implementation-artifacts)
  supporting:
    - gdds/gdd-topdown-shooter-2026-11-21/epics.md (GDD epic overview, not a duplicate of epics.md)
    - docs/epic-7-decisions.md
    - docs/ideas/epic-7/proposal.md (§ 0, D1–D12)
    - docs/ideas/epic-7/revised-stories.md
    - docs/ideas/epic-7/progression-sim.html
    - docs/ideas/customization/proposal.md
    - docs/ideas/customization/draft-stories.md
    - docs/ideas/customization/avatar-editor.html
    - planning-artifacts/sprint-change-proposal-2026-11-24.md (Epic 7 progression)
    - planning-artifacts/sprint-change-proposal-2026-11-24-epic-8.md (Epic 8 note on Story 7.2)
---

# Implementation Readiness Assessment Report: Epic 7

**Date:** 2026-11-24
**Project:** topdown-shooter
**Scope:** Epic 7 "Accounts and meta-progression" only.

## Document Inventory

| Type | File | Notes |
| --- | --- | --- |
| GDD | `gdds/gdd-topdown-shooter-2026-11-21/gdd.md` | Whole document |
| Architecture | `game-architecture.md` | Whole document |
| Epics | `epics.md` › Epic 7 (Stories 7.1–7.12) | 7.1–7.7 progression, 7.8–7.12 customization |
| Story files | none | No `7-*` files in `implementation-artifacts` yet |
| Decisions | `docs/epic-7-decisions.md`, `docs/ideas/epic-7/proposal.md` § 0 | Progression D1–D12, designer "ok" 2026-11-24 |
| Customization | `docs/ideas/customization/proposal.md`, `draft-stories.md`, `avatar-editor.html` | Decisions 2026-11-23 |
| GDD epic overview | `gdds/gdd-topdown-shooter-2026-11-21/epics.md` | 8.5 KB summary of each epic, not a second copy of `epics.md` |
| UX | none for Epic 7 | The editor prototype exists; no written UX spec |

**Duplicates:** none. **Missing:** no Epic 7 UX spec; no story files yet (expected, they come after this check).

## GDD Analysis (Epic 7 slice)

The FR and NFR lines in `epics.md` › Requirements Inventory were read against the GDD (§ Player Progression, Multiplayer Considerations, Art, Scope) and `packages/shared/src/config/balance/economy.json`.

### Functional Requirements in scope

- **FR77:** A guest can upgrade to an account later and keep their progress.
- **FR78:** Supplies per run, even on a loss: +10 per wave survived (only waves the player was in), +50 Behemoth, +100 extract, +20 per endless wave (kept only on extract); doubled while lifetime Supplies < 300 (rookie lift).
- **FR79:** Starter pool (13 items); other items unlocked with Supplies at the GDD prices, in any order; unlocks add cards to that player's deck; one card per offer may be borrowed from a teammate.
- **FR80:** Training: 4 boosts × 5 levels (max HP +10 %, damage +5 %, starting currency 100 → 150, reload +5 %), level cost 50 × level.
- **FR81:** District 2 unlocks after a player's first Downtown extraction; host can pick a district anyone in the lobby has.

Total: 5 FRs (FR77–FR81). FR47 (card shop from the unlocked pool) is shared with Epic 5 and finished by Story 7.4.

### Non-Functional Requirements in scope

- **NFR12:** hashed passwords and guest tokens, rate-limited login (Epic 7 part: passwords, login limit).
- **NFR13:** account progress survives restarts and deploys; nightly backups kept 14 days.
- **NFR1:** FPS floor (Story 7.9's per-player survivor textures).

### Additional Requirements (architecture)

PostgreSQL 18 + Drizzle 0.45, DB only through `apps/server/src/db` repositories, Argon2id via @node-rs/argon2, login 5/min per IP, Preact menus, balance in typed JSON validated with zod, named seed sub-streams.

### GDD Completeness Assessment

Progression is complete and matches D1–D12, with three conflicts:

- **G1 Starting currency.** GDD Training says "starting currency +50 (200 → 250)" and `economy.json` has `startingWallet: 200` (designer 2026-11-24). FR80 and Story 7.5 still say "+10 per level (100 → 150)". FR12 ("100 currency") and FR72 ("100 + 60 %") are stale the same way (outside Epic 7).
- **G2 Cosmetics.** GDD § Scope "Not in v1" still lists **cosmetics**, while GDD § Art (line 314) and Stories 7.8–7.12 build them.
- **G3 No FR for customization.** No FR covers the survivor look, milestone items or the loot bag; Stories 7.8–7.12 trace only to `docs/ideas/customization/proposal.md`.

## Epic Coverage Validation

### Coverage Matrix

| FR / NFR | Requirement | Story (AC) | Status |
| --- | --- | --- | --- |
| FR77 | Guest → account, keep progress | 7.1 (guest account), 7.6 (upgrade, login, merge, recovery) | ✓ Covered |
| FR78 | Supplies per run, wave rule, rookie lift | 7.2 (all ACs, tests) | ✓ Covered |
| FR79 | Starter pool, unlock screen, any order, borrowed card | 7.3 (pool, prices, order), 7.4 (deck, borrow) | ✓ Covered |
| FR80 | Training 4 × 5, 50 × level | 7.5 | ⚠ Covered, wrong base number (G1) |
| FR81 | District 2 rule | 7.7 | ✓ Covered |
| FR47 | Cards from the unlocked pool | 7.4 (replaces 5.13 `cardPool`) | ✓ Covered |
| NFR12 | Hashed passwords/tokens, login limit | 7.1 (token hash), 7.6 (Argon2id, 5/min) | ✓ Covered |
| NFR13 | Durable progress, nightly backups 14 days | 7.1 (Postgres, `pg_dump`, restore test) | ✓ Covered |
| NFR1 | FPS floor | 7.9 (stress baseline, ≤ 2 ms textures) | ✓ Covered |
| (none) | Survivor customization, milestone items, loot | 7.8–7.12 | ⚠ No FR (G3) |

### Missing Requirements

No FR is uncovered. The reverse gap: five stories (7.8–7.12) have no FR, and the GDD scope line excludes them (G2, G3).

### Coverage Statistics

- FRs in scope: 5 (+ FR47 shared)
- FRs covered: 5 (100 %), one with a number conflict
- Stories without an FR: 5 of 12

## UX Alignment Assessment

### UX Document Status

Not found for Epic 7. `docs/ideas/customization/avatar-editor.html` is an interactive prototype of the survivor editor; `docs/ideas/epic-7/progression-sim.html` is a numbers simulator, not a UI. Architecture § UI puts the new menus (unlocks, results) in Preact overlays.

### Alignment Issues

- **U1 Login entry point.** Story 7.6 covers upgrade, login and recovery, but no AC says where "Log in" and "Forgot password" live on the start screen for a player on a new device. Without it the merge path (D11) can't be reached.
- **U2 Progress hub.** Story 7.3 defines the hub (Unlocks · Training · Survivor) but not the layout on a landscape phone, tap sizes or how a locked item's "one plain line" fits; Epic 5's card and build-bar specs set the minimum sizes to reuse.
- **U3 Results "Run rewards" panel.** Story 7.2 adds a panel that later stories extend (milestone, loot, district); its order and space on a small landscape screen aren't fixed.

### Warnings

UX is implied (6 new screens or panels: Progress hub, Unlocks, Training, account/login/recovery, Survivor editor, Run rewards). A short UX note per screen, or a `gds-ux` pass on the hub and account screens, is recommended before Stories 7.3 and 7.6. The editor has a prototype, which is enough for 7.10.

## Epic Quality Review

### Epic structure

- **Player value:** yes. "Players keep progress between runs" is player-facing; the database arrives inside 7.1, which is a player story ("remember me without signing up"), not a technical epic.
- **Independence:** Epic 7 needs Epics 2–6 (join, card shop, Behemoth, extract, endless, supply drop), all earlier: fine. It must not need Epic 8, but two stories do (Q3).
- **Data created when needed:** the 7.1 migration creates only `accounts` and `progress`: good. Inside the customization stories the order is broken (Q2).

### 🔴 Critical Violations

None. No technical epic, no epic-sized story.

### 🟠 Major Issues

- **Q1 Training base number (G1).** Story 7.5 AC 1: "starting currency +10 per level (100 → 150)". The game starts with 200 (`economy.json`, GDD). **Fix:** "+10 per level (200 → 250)" in 7.5 and FR80; also FR12 and FR72 (outside this epic).
- **Q2 Story 7.9 reads fields that don't exist yet.** 7.9 sends "the look code … from the player's progress" and checks each part "is owned by the account", but the `look` field is created by 7.10's migration and `cosmetics` (owned items) by 7.11's. **Fix:** 7.9's migration adds `look` (7.10 then only writes it), and until 7.11 ownership = the part's unlock rule is `starter`; 7.11 adds `cosmetics` and extends the check.
- **Q3 Forward dependencies on Epic 8.** Story 7.12 has an AC "Given Epic 8's snapshot rule … round-trip test" and Story 7.2 counts "a run resumed on another night (Epic 8)". Snapshots and resume don't exist until Epic 8. **Fix:** turn both into notes ("Epic 8 adds the bag and per-night waves to its snapshot"), and add them to Story 8.4's round-trip list instead.
- **Q4 Customization not traced (G2, G3).** **Fix:** add FR89 (survivor look from parts, shown to the team; milestone items; per-run loot bag; cosmetic only) to the GDD and `epics.md`, map it to Epic 7, and remove "cosmetics" from the GDD's Not in v1 line.
- **Q5 Architecture is behind the stories.** `game-architecture.md` still says: guest token "in localStorage" only (7.1 adds the 1-year HttpOnly cookie, D9); `progress` without lifetime supplies, look, cosmetics, stats, and `accounts` without display name and recovery code hash; balance files list without `progression.json` and `cosmetics.json`; seed sub-streams without `loot` (code: `STREAM_NAMES = decay, events, spawns, combat`); nothing on the HTTP route that sets the cookie and does login/unlock/training calls (`apps/server/src/app.ts`). **Fix:** one architecture update before 7.1 (Persistence, Accounts, Balance, PRNG, an "Account HTTP API" line).

### 🟡 Minor Concerns

- **Q6** 7.6 merges "cosmetics joined … stats added" before 7.11 creates them. Wording: "every progress field that exists".
- **Q7** 7.3's hub has Training (7.5) and Survivor (7.10) tabs; say each tab appears when its story lands.
- **Q8** 7.2 shows "Save my progress" (opens 7.6) before 7.6 exists; say the line is added by 7.6, or build 7.6 before 7.2 ships.
- **Q9** 7.12 says the `loot` stream is from Story 4.4; it isn't. 7.12 adds `loot` to `STREAM_NAMES` (adding a named stream doesn't change other streams).
- **Q10** 7.10's "under 30 seconds" has no AC; add a timed check in the designer's playtest or drop the number.
- **Q11** 7.1 doesn't say how a guest token reaches the Colyseus join (cookie on the WebSocket upgrade vs token in join options); decide in Q5.
- **Q12** Customization proposal § 8 flags that the designer's future "level system with stats" may replace Training (7.5). No action now; recheck before 7.5.

### Within-epic order

7.1 → 7.2 → 7.3 → 7.4 → 7.5 → 7.6 → 7.7 works. Customization (proposal § 9): 7.8 (needs nothing; art pick first) → 7.9 (7.1, 7.8) → 7.10 (7.9) → 7.11 (7.10, 7.2) → 7.12 (7.10, 7.2). 7.8 can start now, before Epic 6 is built.

### Best Practices Checklist

| Check | Result |
| --- | --- |
| Epic delivers player value | ✓ |
| Epic works without later epics | ⚠ Q3 (7.2, 7.12 reference Epic 8) |
| Stories sized to one build | ✓ |
| No forward dependencies | ⚠ Q2, Q6–Q8 |
| Data created when needed | ⚠ Q2 |
| Clear Given/When/Then ACs | ✓ (Q10 one unmeasured goal) |
| FR traceability | ⚠ Q4 |

## Summary and Recommendations

### Overall Readiness Status

**NEEDS WORK.** The design is settled and the stories are detailed. All the fixes are text edits to `epics.md`, the GDD and the architecture; no design decision is open.

### Critical Issues Requiring Immediate Action

1. Q1: Training starting currency 100 → 150 must be 200 → 250 (7.5, FR80).
2. Q2: give `look` (and a starter-only ownership rule) to 7.9 so it doesn't need 7.10 and 7.11.
3. Q3: move the Epic 8 snapshot and resume ACs out of 7.2 and 7.12 into Story 8.4.
4. Q4: add an FR for customization and remove "cosmetics" from the GDD's Not in v1.
5. Q5: update the architecture (cookie, tables, balance files, `loot` stream, account HTTP API).

### Recommended Next Steps

1. Apply Q1–Q9 with a short `gds-correct-course` (minor scope, backlog text only), like the Epic 8 decisions pass.
2. Write the story file for 7.8 now; it depends on nothing, and its art pick (designer chooses part looks) can run while Epic 6 is built.
3. Before 7.3 and 7.6: a short UX note for the Progress hub, login/recovery entry and Run rewards panel (U1–U3).
4. Write the 7.1–7.7 story files after Epic 6, since they read the run end, extract, endless and supply drop that Epic 6 builds.

### Final Note

This assessment found 15 issues in 4 categories (3 GDD conflicts, 3 UX gaps, 5 major and 7 minor story issues, some overlapping). None needs a new design decision. Fix the five issues above before building; the rest can be fixed as each story file is written.

**Assessor:** gds-check-implementation-readiness, 2026-11-24. Outside this epic: FR12 and FR72 still say 100 start money; FR45 says a 10 × N wave bonus while the GDD says 15 × N; the sprint-status note "9.2–9.10 depend on the hired artist and sound designer" contradicts the GDD ("no hiring", designer 2026-11-23).
