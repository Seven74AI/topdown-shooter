# Balance changelog

Every change to `packages/shared/src/config/balance/*.json` (or to anything else hashed into `balance.version`, `config/balance.ts`) adds one line here: date, code, what changed, the reason, and where the evidence is. Story 10.8 changes numbers only with a line here (NFR14).

Created 2026-11-26 (readiness Q5, designer "ok" 2026-11-26, `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-26-epic-9-photoreal.md` §6). The first entries are back-filled from the Epic 5 balance pass (`docs/epic-5-decisions.md` › Epic 5 balance pass, analysis `docs/balance/epic-5-balance-pass.md`) and Story 9.13 B28.

| Date | Code | Change | Reason | Evidence |
| --- | --- | --- | --- | --- |
| 2026-11-24 | Epic 5 B1 | Wave-clear bonus 10 × N → **15 × N** | Earnings target 2,500–3,000 per player (Q10) | 10-wave sims: ≈ 2,500 / 2,710 / 2,930 per player at 4 / 3 / 2 players (`docs/balance/epic-5-balance-pass.md`) |
| 2026-11-24 | Epic 5 B2 | Solo zombie count × 0.4 → **× 0.35** (the Behemoth's solo HP stays × 0.4) | Solo was too hard | Solo bots held out 1/12 before, 7/12 after |
| 2026-11-24 | Epic 5 B3 | Pistol damage 5 → **6** | IV = 10.5 one-shots Walkers (replaces 5.1's "Pistol IV = 8.75") | Weapon table (`tools/sims/weaponTable.ts`) |
| 2026-11-24 | Epic 5 B4 | Assault Rifle damage 7 → **10**, rate 8 → **6**/s | One-shots Walkers | Weapon table |
| 2026-11-24 | Epic 5 B5 | Shotgun pellet damage 4 → **5** | Point blank 40 (replaces 5.3's "point blank always 32") | Weapon table |
| 2026-11-24 | Epic 5 B6 | Fire Axe swing rate 1.1 → **1.4**/s; price stays 300 | Melee too slow; at 250 it would crowd the SMG out of early offers (pre-mortem) | `docs/balance/epic-5-balance-pass.md` |
| 2026-11-24 | Epic 5 B7 | Grenade Launcher blast 2 → **2.5 m**, price 800 → **700** | Under-used for its price | `docs/balance/epic-5-balance-pass.md` |
| 2026-11-24 | Epic 5 B8 | Mine price 60 → **35** | Under-used | `docs/balance/epic-5-balance-pass.md` |
| 2026-11-24 | Epic 5 B9 | Body armor II price 350 → **300** | Under-used | `docs/balance/epic-5-balance-pass.md` |
| 2026-11-24 | Epic 5 B10 | Start money **stays 200** (250 not taken) | No change | — |
| 2026-11-24 | Epic 5 B11 | Building cap **stays 6 per player** (Q11) | Money runs out first today; re-check in 6.1's 10-wave sim, then 10.8 | 6.1 sim: buildings 3–6 of the cap (`docs/epic-5-decisions.md`) |
| 2026-11-24 | Epic 5 B12 | Turret, med station, traps, consumables, Flamethrower, card-shop rules **unchanged** | No change | — |
| 2026-11-25 | 9.13 B28 | Four new `controls.fx` caps (`controls.json`, `balanceSchema.ts`); **no gameplay number changed**. `balance.version` changes, so an older open tab gets `balance_mismatch` and an older save resumes with `digestChecked=false`; the `carCorner.test.ts` golden `worldDigest` re-pinned 1728716985 → 3587910981 | Caps for the 9.13 relit character effects | `_bmad-output/implementation-artifacts/9-13-photoreal-characters-in-game.md` › B28 (review L10) |
| 2026-11-26 | 12.4 | `decay.buildingRefundShare` (0.5) **removed** (`decay.json`, `balanceSchema.ts`; the strict schema now rejects the key, even at 0): a building the decay system destroys (stage cover, a new fire, 12.1's 0.8 m margin) gives nothing back. `balance.version` changes (older tab: `balance_mismatch`; older save: `digestChecked=false`); `carCorner.test.ts` golden `worldDigest` re-pinned 3587910981 → 2551157819 | Designer 2026-11-25 ("bad luck"); CN-6 (remove, not 0) | 10-wave sims, master → 12.1 + 12.4 (`12-4-no-refund-for-decay-losses.md` › Dev Agent Record): refunds 31/player in god seed 3 and 125 in total over the 12 mortal runs → **0**; god-mode 4 bots earned/player 2,563 / 2,596 / 2,416 → 2,563 / 2,596 / 2,504 and end wallet 1,353 / 1,341 / 1,142 → 1,353 / 1,341 / 1,216 (seed 3's earnings move because 12.1's margin cleared one bot barricade; its wallet +6 per player is 12.4: without the 125 refund one bot skips body armor I and ends 25 higher). End-of-run money moves by < 1 %; the 2,500–3,000 target is unaffected (input for 10.8) |

Owed lines (add them when the story lands):
- **10.8:** each re-checked or changed number (15 × N, `loot.runChance` 0.2, cap of 6), with its reason.
