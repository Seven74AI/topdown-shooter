# Sprint Change Proposal: Epic 7 progression and unlocks (2026-11-24)

Workflow: `gds-correct-course`, batch mode. Approved by the designer ("ok", 2026-11-24). Source: Epic 7 idea session, `docs/ideas/epic-7/` (party notes, forge log, `proposal.md` D1–D12, `revised-stories.md`, prototype claude.ai/artifact/LFskPyGc9Ji9ziyD8iaQVd).

## 1. Issue summary

Epic 7 (backlog, nothing built) was planned before Epic 5's card shop (5.13) and the customization stories (7.8–7.12). The idea session found:
- **The starter card pool is exactly 6 items** (Machete, Shotgun, SMG, Hunting Rifle, Body armor I, Running shoes): a new player's "random" shop shows the same 6 cards every build and Reroll is never on.
- **Unlocking everything takes ≈ 42 runs** with the GDD numbers (target said 15–20). The designer decided unlocking everything should not be the goal ("not everybody wants to play with every weapon"), so earnings and Training costs stay; the pacing target becomes "first wanted weapon in ≈ 3 runs, a few favourites in ≈ 10".
- **New friends feel behind** next to veterans with more unlocks.
- **Safari clears a site's script storage after 7 days without a visit**, so a guest token kept only in `localStorage` loses an occasional player's progress.
- 7.4's "a teammate's unlocks never appear in my shop", 7.6 (no password recovery, no guest merge) and 7.7 (who may pick a district) needed decisions.

## 2. Impact analysis

| Artifact | Impact |
| --- | --- |
| Epic 7 | Stories 7.1–7.7 replaced (texts below); epic summary updated. 7.8–7.12 unchanged except 7.10's entry point (the Survivor tab of 7.3's Progress hub). No new stories; 7.4 and 7.6 grow a little. |
| Epic 5 | None to built code. 5.13's `cardPool` seam is what 7.4 replaces (borrowed card uses the same `shop:<slot>:<build>` stream, 6 draws; 5.13 F1/F2 hold: the borrow list is read once at the draw). |
| Epic 6 | 6.11's vote shows "Extract now: +100 · Stay: +20 a wave, lost if you wipe" (added in 7.2's ACs). |
| Epic 8 | None (a rejoin keeps the stored offer, borrowed card included, per 5.13 F2). |
| FRs | FR78 (who counts, rookie lift), FR79 (starter pool + Fire Axe and Revive kit, any order, borrowed card), FR81 (host may pick a district anyone in the lobby has). FR77, FR80 unchanged. |
| GDD | Player Progression (starter pool, unlock list, rookie lift, who counts, borrowed card, Training never scaled, pacing), shop section (borrowed card). |
| Architecture | Additions only: guest token also as a first-party HttpOnly cookie (1 year); `progress.lifetime_supplies`, `accounts.recovery_code_hash`; balance file `progression.json`. No change to the room/netcode design. |
| UX | New Progress hub (Unlocks · Training · Survivor) and a "Run rewards" panel on Results (prototype shows both). |

## 3. Recommended approach

**Direct adjustment** of backlog stories (nothing built). Effort neutral to slightly up (7.4 borrowed card ≈ half a day, 7.6 recovery + merge ≈ half a day). Risk low. Scope: **Minor** (planning text only; route to the builder when Epic 7 starts).

## 4. Detailed changes (applied)

Designer decisions (`docs/ideas/epic-7/proposal.md` §0):

| # | Decision |
| --- | --- |
| D1 | Earnings stay: +10 per wave, +50 Behemoth, +100 extract, +20 per endless wave (kept only on extract) |
| D2 | A wave counts for everyone still in the run when it ends (downed/out too); only waves a player was in (late join, leaving, Epic 8 drops and resumed runs: see 7.2); a quitter banks what they had |
| D3 | Rookie lift: × 2 until 300 lifetime Supplies |
| D4 | Fire Axe and Revive kit join the starter pool (leave the unlock list) |
| D5 | Free unlock order; "Good next pick" marker |
| D6 | Training unchanged (50 × level, same caps); applies in full, never scaled to the team |
| D7 | Borrowed card: 1 of 6 cards from a teammate's unlocks I lack |
| D8 | Unlocks can't be turned off (v1) |
| D9 | Guest token also in a 1-year HttpOnly cookie; "Save my progress" nudge after the first run banking ≥ 200 |
| D10 | Recovery code (12 characters, shown once), no email |
| D11 | Logging in on a device with guest progress merges it |
| D12 | Host can pick a district if anyone in the lobby has it |

- **Stories 7.1–7.7:** OLD = the 2026-11-21 texts (git history of `epics.md`); NEW = `epics.md` › Epic 7 now, identical to `docs/ideas/epic-7/revised-stories.md` without its "Changed:" lines (each "Changed:" line there is the per-story rationale).
- **Story 7.10:** entry point now "the Survivor tab of the Progress hub (Story 7.3) or my own card in the lobby".
- **FR78, FR79, FR81:** rewritten in `epics.md` (see section 2).
- **GDD › Player Progression and shop section:** updated as listed in section 2.

## 5. Implementation handoff

- **Scope: Minor.** Planning files are updated; no code changes now.
- **Builder of Epic 7** (`gds-create-story` per story): use the new texts; numbers go in `packages/shared` `progression.json`; 7.4 must keep 5.13's fairness rules F1–F9 and add the borrowed-card tests listed in its ACs.
- **Success criteria:** a new player's first offers differ across rerolls; first wanted unlock in ≈ 3 runs for a typical group (simulator), checked again in the friend-group playtest.
