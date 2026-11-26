---
baseline_commit: 8932065
---

# Story 12.4: No refund for buildings lost to decay

Status: review

<!-- Quick story 2026-11-25 from a designer decision in the party-mode session. Changes FR58 ("destroyed with a 50% refund") and Story 6.2 review L4 ("50 % back of what was paid"). Small: one rule, a balance key and the tests that pin the old amount. -->

## Story

As the designer,
I want buildings destroyed by the city's decay to be simply lost,
so that building next to crumbling parts of the city is a real gamble.

## Designer decision (2026-11-25)

> Change the rule that says we refund a player when their building is destroyed by the decay system. We shouldn't. Bad luck.

## Acceptance Criteria

1. **No refund.** `destroyBlockedBuildings` (`packages/shared/src/decay/decaySystem.ts`) still destroys the building and emits `building.destroyed`, but no money goes back to the owner. There's no `refundMoney` call and no `money.earned` with reason `refund` from decay.
2. **Every decay loss.** This covers every way the decay system destroys a building:
   - A building under new cover from a decay stage (FR58).
   - A building a fire lit at the build start overlaps (Story 4.8 review M2).
   - A building within 0.8 m of new cover (Story 12.1 AC 6).
3. **The balance key goes.** Remove `decay.buildingRefundShare` from `balanceSchema.ts` and `decay.json` (CN-6, accepted by the designer 2026-11-26), rather than setting it to 0. That way nobody turns the refund back on by accident with an override. The schema rejects the key if an old override still sets it.
4. **Unchanged:** selling and taking back a building (5.20, `building.sold.refund`), and buildings destroyed by zombies, the Behemoth or explosions (no refund today either).
5. **The player knows.** The owner sees a toast when decay destroys their building: **"Lost to the collapse"** (stage cover) or **"Lost to the fire"** (fire). It shows no amount. Story 12.1's toast text loses its refund amount.
6. **Bots and sims.** Economy sims (`economy/tenWaveSim.test.ts`, `shopSim.test.ts`) and bot seeds whose numbers move are re-checked or re-recorded. Note any change in end-of-run money in the dev notes for the balance pass (10.8).
7. **Tests.** Update the tests that pin the old refund: `decay/decay.test.ts` (the 0.5 check and the range check), `decay/panic.test.ts`, `decay/ruins.test.ts`, `decay/fire.test.ts`, `buildings/floor.test.ts`. Each one now expects the building gone and the wallet unchanged.
8. **Docs.** FR58 in `_bmad-output/planning-artifacts/epics.md` (and the readiness report copy) loses "with a 50% refund". Add a line pointing to this story.

Added 2026-11-26 (clash X2; designer "ok" 2026-11-26, `sprint-change-proposal-2026-11-26-epic-9-photoreal.md` §6).

9. **Every place the refund is written.** Besides FR58, add as-built notes to Story 4.5's ACs and Story 6.2's rubble AC ("the usual 50 % refund (FR53)") in `epics.md`, and update the rule line in `game-architecture.md` ("buildings on newly blocked cells are destroyed with a 50% refund") and the HANDOFF Epic 4 summary.
10. **Before 10.8, with a changelog line.** Land this story before Story 10.8 (its 2,500–3,000 earnings target may move). Log the end-of-run money change, with its reason and the re-checked sim numbers, in `docs/balance/changelog.md`.

## Tasks

- [x] `decay/decaySystem.ts`: drop the refund (AC 1, 2); update the header comment (step 2) and the Story 6.2 L4 comment.
- [x] `config/balanceSchema.ts`, `config/balance/decay.json`: remove the key (AC 3).
- [x] Client toast (AC 5).
- [x] Tests and sims (AC 6, 7).
- [x] `epics.md` FR58 (AC 8).
- [x] As-built notes on 4.5 and 6.2, architecture rule line, HANDOFF line (AC 9).
- [x] `docs/balance/changelog.md` line (AC 10).
- [x] Story 12.1 AC 6 already says "no refund" (updated with this story).

## Dev Notes

- Today: `refundMoney(world, b.ownerId, Math.floor(paid * share))` with `share = 0.5` of everything paid, upgrades included (Story 6.2 review L4).
- CN-6 settled: remove the key, not 0.

## Dev Agent Record

Builder: cloud session, branch `story-12-1` (one PR with Story 12.1, built after it), 2026-11-26. Built with `gds-dev-story`.

### Decisions

No decision was left open (CN-6 settled: remove the key). Builder decisions, **auto-accepted (designer 2026-11-26: follow recommendations)**:
- **D1 toast texts.** "Lost to the collapse" (under new cover), "Lost to the fire", and 12.1's margin case "Your barricade was cleared by the collapse" ("building" for a non-barricade wall); none shows an amount. The client knows the cause from `building.destroyed.cause` (12.1 D5; online it rides the existing net tuple).
- **D2 the reason `refund` stays** in `MONEY_REASONS` (append-only wire list; selling and take-back, 5.20, still pay through it).

### Implementation notes

- `decay/decaySystem.ts`: no `refundMoney`, no `money.earned` from decay, for every cause (stage cover, a fire lit at the build start, 12.1's 0.8 m margin); header (step 2) and the 6.2 L4 comment rewritten. `buildingStats` / `refundMoney` imports dropped.
- `config/balanceSchema.ts`, `config/balance/decay.json`: `buildingRefundShare` removed; the decay object is `.strict()`, so a file that still sets it (even 0) is rejected (`decay.test.ts` sets it by hand: `withOverrides` only writes existing keys).
- Client toast: `decayLossText` (`scenes/blockText.ts`), shown to the owner from the event loop (`GameScene`).
- Unchanged (AC 4): `building.sold.refund` (5.20), and zombie / Behemoth / blast losses (never refunded).

### Tests (AC 7)

Now "building gone, wallet unchanged": `decay/decay.test.ts` (the 0.5 check → the key is gone and rejected at 0.5 and 0; the 50 % test → causes `collapse`, no refund events; review L2 now also covers 12.1's margin: 0.8 m away stays, flush is `cleared`, 1 cm in is `collapse`, no money), `decay/panic.test.ts`, `decay/ruins.test.ts` (both tests, causes asserted), `decay/fire.test.ts` (cause `fire`), `buildings/floor.test.ts`, `buildings/upgrade.test.ts`; `zombies/downtown.fuzz.test.ts` and `zombies/ruins.fuzz.test.ts` (refunds must be 0); `apps/server/src/run/decayBandwidth.test.ts` (no refund tuples). `zombies/carCorner.test.ts`: golden `worldDigest` re-pinned 3587910981 → 2551157819 only because `balance.version` changed (it passed unchanged on 12.1's commit, before this story).

### AC 6 / AC 10: sims and end-of-run money

`economy/tenWaveSim.test.ts`, `shopSim.test.ts` and every bot/sim test pass unchanged (`npm run test:slow`: 740 tests). Re-checked numbers (scratch `runHeadless` script), master `d8ffaee` → 12.1 only → 12.1 + 12.4:

| Run | Refunded | Earned / player | End wallet / player |
| --- | --- | --- | --- |
| god, 4 bots, seed 1 | 0 → 0 → 0 | 2,563 → 2,563 → 2,563 | 1,353 → 1,353 → 1,353 |
| god, 4 bots, seed 2 | 0 → 0 → 0 | 2,596 → 2,596 → 2,596 | 1,341 → 1,341 → 1,341 |
| god, 4 bots, seed 3 | 31 / player → 31 → **0** | 2,416 → 2,504 → 2,504 | 1,142 → 1,210 → 1,216 |
| mortal, 1–4 bots × seeds 1–3 (12 runs) | 125 total → 125 → **0** | — | — |

The refund was worth at most ~1 % of a player's end-of-run money; seed 3's earnings move because of 12.1's margin (one bot barricade cleared), not the refund. For 10.8: the 2,500–3,000 earnings target is unaffected (earnings never counted refunds). Logged in `docs/balance/changelog.md`.

### Docs (AC 8, 9, 10)

FR58 in `epics.md` (and the 2026-11-25 readiness report copy: an as-built note) loses the 50 % refund with a pointer to this story; as-built notes on Story 4.5's ACs and Story 6.2's rubble AC; `game-architecture.md` rule line; HANDOFF Epic 4 summary; `docs/balance/changelog.md` row (the owed line removed).

### File List

Modified: `packages/shared/src/decay/decaySystem.ts`, `packages/shared/src/config/balanceSchema.ts`, `packages/shared/src/config/balance/decay.json`, `packages/shared/src/core/simEvents.ts` (comment), `packages/shared/src/economy/economy.ts` (comment), `packages/shared/src/decay/{decay,panic,ruins,fire}.test.ts`, `packages/shared/src/buildings/{floor,upgrade}.test.ts`, `packages/shared/src/zombies/{downtown,ruins}.fuzz.test.ts`, `packages/shared/src/zombies/carCorner.test.ts`, `apps/server/src/run/decayBandwidth.test.ts`, `apps/client/src/scenes/{blockText,GameScene}.ts` (toast, shared with 12.1), `apps/client/src/debug/devCheatActions.ts` (comment), `_bmad-output/planning-artifacts/{epics,game-architecture,implementation-readiness-report-2026-11-25}.md`, `HANDOFF.md`, `docs/balance/changelog.md`.

### Change Log

- 2026-11-26: built (branch `story-12-1`, after 12.1).
