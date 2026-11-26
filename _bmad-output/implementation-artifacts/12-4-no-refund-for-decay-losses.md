---
baseline_commit: 8932065
---

# Story 12.4: No refund for buildings lost to decay

Status: ready-for-dev

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

- [ ] `decay/decaySystem.ts`: drop the refund (AC 1, 2); update the header comment (step 2) and the Story 6.2 L4 comment.
- [ ] `config/balanceSchema.ts`, `config/balance/decay.json`: remove the key (AC 3).
- [ ] Client toast (AC 5).
- [ ] Tests and sims (AC 6, 7).
- [ ] `epics.md` FR58 (AC 8).
- [ ] As-built notes on 4.5 and 6.2, architecture rule line, HANDOFF line (AC 9).
- [ ] `docs/balance/changelog.md` line (AC 10).
- [x] Story 12.1 AC 6 already says "no refund" (updated with this story).

## Dev Notes

- Today: `refundMoney(world, b.ownerId, Math.floor(paid * share))` with `share = 0.5` of everything paid, upgrades included (Story 6.2 review L4).
- CN-6 settled: remove the key, not 0.
