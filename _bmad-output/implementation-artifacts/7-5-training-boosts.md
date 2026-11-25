# Story 7.5: Training boosts

Status: done

<!-- Epic 7 progression story 5 of 7. Story file 2026-11-24 (gds-create-story, non-interactive) from the real code on master 7385b47. Designer decision D6 (Training keeps its caps and its GDD cost 50 × level; always applies in full, solo too; never scaled to the team) is a rule here. FR80 base number fixed by the readiness pass (200 → 250). -->

## Story

As a player,
I want small, capped boosts I can train between runs,
so that I get a bit stronger without leaving new friends behind.

> **Brief.** EPIC 6 BRIEF lines **1, 2** (four Training levels per player are World + schema state: every copy, incl. the Predictor's reload), **3, 4, 8** (replays: Training is part of the run's start data), **9, 10** (every number in `progression.json › training`), **11** (four u8 per player, once: ≈ 0 B/s), **15** (bots and sims stay at level 0 unless a test says so), **17, 19, 29, 31, 32**.

> **Scope:** the Training data, a training route on the account API, the **Training** tab in 7.3's Progress hub, applying levels when a survivor is created (online and solo), a Training line per player on Results. **Not here:** a "player level with stats" system (parked idea, customization D2: if it comes back it may absorb these four rows).

## Acceptance Criteria

### Fairness / player-visible rules (each is a test)

- **T1 "Training is small and capped."** 4 boosts × 5 levels: max HP +2 % a level (max +10 %), damage +1 % a level (max +5 %), starting money +10 a level (200 → 250, from `economy.json › startingWallet`), reload speed +1 % a level (max +5 %) (FR80). Level 6 can't be bought.
- **T2 "It always applies in full, and only to me."** My levels apply in every run I play, solo or online, never scaled to the team's lowest (D6); a teammate's Training never changes my numbers.
- **T3 "It costs what it says."** Level n costs 50 × n (50, 100, 150, 200, 250; 750 a boost, 3,000 for all); a double tap or two phones never buy two levels or charge twice.
- **T4 "I can see why a friend is tougher."** Results lists each player's Training (e.g. "Training · HP 3 · Damage 2 · Money 5 · Reload 0").
- **T5 "Buying mid-run does nothing until the next run."** Levels are read when the host taps Start (7.4 K8).

### Behaviour

1. **Data** (`progression.json › training`): `{ maxLevel: 5, costPerLevel: 50, boosts: [ { id: "max_hp", pctPerLevel: 2 }, { id: "damage", pctPerLevel: 1 }, { id: "start_money", perLevel: 10 }, { id: "reload", pctPerLevel: 1 } ], line per boost }`. The boost numbers are gameplay numbers: they join the balance version check (`balanceVersion` in join options) so client and server can't disagree (decision 7.5 D3).
2. **Progress field.** `progress.training` jsonb (`{ max_hp: 0..5, … }`, from 7.1's migration) — no migration here.
3. **Route** `POST /account/training` `{ boost, level, requestId }`: buys exactly `level` when it is current + 1 and ≤ 5; one conditional `UPDATE … WHERE supplies >= cost AND (training->>boost)::int = level − 1` (absent = 0); answers `ok` / `not_enough {need}` / `already_trained` / `maxed`; same `requestId` rules as 7.3's unlock; log `trained {accountId, boost, level, cost}`. Session response `progress.training`.
4. **Applying it** (shared sim). `addPlayer` options (7.4's `RunPlayerInit`) gain `training: { maxHp, damage, startMoney, reload }` levels (default all 0); stored on `PlayerState.training*` (4 × u8). At creation (`player/player.ts:119-168`):
   - **Max HP:** base `player.json › maxHp` × (1 + 2 % × L), rounded to an integer (100 → 102 … 110); body armor's `maxHpBonus` adds on top, unscaled (decision 7.5 D1). `effectiveMaxHp` (`economy/gear.ts:150-152`) becomes `trainedBase + armorBonus`, used by `buyGear` (`gear.ts:223-226`) and every other caller, so armor bought later stays right.
   - **Start money:** `wallet = startingWallet + 10 × L` (`player.ts:143`); `DEV_STARTING_WALLET` / `?wallet` still set the exact number (dev wins).
   - **Damage:** every player-weapon damage read goes through one new `playerWeaponDamage(balance, p, weapon, level) = weaponDamage(...) × (1 + 1 % × L)` (`combat/weapons.ts:57-59` stays the base); call sites `combat/firing.ts:190` (melee), `:234` (bullets), `combat/flame.ts:177`, the Grenade Launcher round in `combat/grenades.ts:337` (the launcher branch; hand grenades and molotovs land through `landConsumable` at `:332`). A round whose owner has left (`grenades.ts:338-339`) uses Training 0. `ticksFor` is `Math.max(1, Math.round(s / TICK_DT_S))` (`core/time.ts:4`). Turrets, traps, mines, hand grenades and molotovs are **not** trained (decision 7.5 D2).
   - **Reload:** `slot.reloadTicks = ticksFor(stats.reloadS × (1 − 1 % × L))` at every reload start (`firing.ts:129, 177, 198, 212, 273`), with the same value in `weapon.reload_started { reloadS }`. One helper `reloadSecondsFor(p, stats)` so the five sites can't drift. The client's predicted reload (`NetSimHost` `fireClock.predictedReloadTicks`, `sim/NetSimHost.ts:931`) uses the same helper from the mirrored levels.
5. **Wire.** Schema `PlayerState` gains `trainHp, trainDmg, trainMoney, trainReload` (u8, set once at run start; `syncState`, stateView key lists, `fakeRoom`, devThrottle StateCopy, NetSimHost mirror, bots). 8.1's hold round-trip test covers them (they never change in a run).
6. **Server read at Start** shares 7.4's run-start progress load (`RunRoom.startRun`); failed read → level 0 (as 7.4 D3).
7. **Practice solo** uses the cached `progress.training` (try/catch; 0 when none): T2 "solo too". `?training=5,5,5,5` dev switch (dev builds) for checks.
8. **Training tab** (7.3's hub, second tab "Training"): four rows; each shows the boost name, a 5-pip level bar, "Now: +6 % max HP", "Next: +8 % · 200 Supplies" and **Train** (same Confirm-within-3 s guard as 7.3 D3; spinner; "Not enough Supplies · need 60 more"; "Maxed" at 5). Header line: "Small boosts, capped. They always apply in full."
9. **Results** (T4): each row of the Results table gets a small "Training" line from the schema fields (e.g. "HP 3 · Dmg 2 · $ 5 · Reload 0"; "—" at all zero).

## Tasks / Subtasks

- [x] **T1 Data + helpers** (AC 1): `progression.json › training`, zod, version fold-in (D3), `meta/training.ts` (`trainedMaxHp`, `trainedStartMoney`, `damageMul`, `reloadSecondsFor`), tests.
- [x] **T2 Sim** (AC 4): `PlayerState.training*`, `addPlayer` options, `effectiveMaxHp`, `playerWeaponDamage` at every damage site (grep `weaponDamage(` — every player-weapon call goes through the new function; add a test that greps for stray calls), `reloadSecondsFor` at the five reload sites.
- [x] **T3 Wire + server** (AC 3, 5, 6): route, schema fields + every copy, run-start load.
- [x] **T4 Client** (AC 7–9): Training tab, `account.train()`, practice solo, `?training`, Results line, Predictor reload.
- [x] **T5 Tests + gate + hand-back.**

## Dev Notes

### Current state (read before changing)

- **Start money:** `addPlayer` sets `wallet: world.balance.economy.startingWallet` (`player.ts:143`; 200, `economy.json`). Dev: `DEV_STARTING_WALLET` (`RunRoom.ts:99-104`, needs the client `?wallet` too or the join is a balance mismatch).
- **Max HP:** `addPlayer` `hp/maxHp: stats.maxHp` (`player.ts:130-131`, 100 from `player.json`). Gear model (`economy/gear.ts`): `armorBonus` (`:134-147`), `effectiveMaxHp = balance.player.maxHp + armorBonus` (`:150-152`), `buyGear` sets `p.maxHp = effectiveMaxHp(...)` and raises HP by the increase (`:223-226`); `speedBonusPct` (`:155-160`) is an integer-percent bonus to copy.
- **Damage:** `weaponDamage(balance, weapon, level)` (`combat/weapons.ts:57-59`) is "the ONE damage source for player weapons", exact (no rounding: Pistol IV = 8.75), no player argument. Used at `firing.ts:190` (melee), `:234` (bullets), `flame.ts:177`, `grenades.ts:337`.
- **Reload:** `slot.reloadTicks = ticksFor(stats.reloadS)` + `weapon.reload_started { reloadS }` at `firing.ts:129, 177, 198, 212, 273`; the client predicts reloads (`NetSimHost.ts:918-931`, `fireClock.predictedReloadTicks`).
- **Hub:** from 7.3 (`ui/ProgressScreen.tsx`, data-driven tab list); account API and request-id/limiter pattern from 7.3's unlock route.

### Gotcha: small reload steps round away

`ticksFor` turns seconds into whole ticks (50 ms). A 1.5 s reload is 30 ticks; level 1 (1 %) = 29.7 → 30 (no change), level 3 = 29.1 → 29. Short reloads change only at higher levels. Accepted (decision 7.5 D4); the tab shows the percentage, not ticks. Test the exact tick table for every weapon at levels 0–5 so the rounding is visible in review.

### What must keep working

Armor I/II HP (5.11), heal at build start (`buildHealFrac × maxHp`), the 5.1 upgrade damage table at level 0 (identical numbers: a test over every weapon × level at Training 0), turret/trap/mine damage, the client's ammo/reload prediction (no reload desync at Training 5: a NetSimHost test), replays (Training is in the run start data: same digest), the 10-wave sims (bots at 0).

### Testing (T1–T5 each a named test)

- T1: HP 102/104/106/108/110; money 210…250; damage × 1.01…1.05; reload table; buying level 6 → `maxed`.
- T2: a 2-player world, p0 at 5/5/5/5, p1 at 0: p0's numbers trained, p1's untouched; solo practice applies cached levels; no "team average" code path exists (grep).
- T3 (PGlite): costs 50…250; `level` ≠ current + 1 → `already_trained`; same `requestId` → one charge; two concurrent trains with Supplies for one → one wins.
- T4: Results rows show the levels from the schema.
- T5: train in the lobby, Start → applied; train during a run (second device) → not applied until the next Start.
- Armor: Training 5 + Armor II → maxHp 110 + 50 = 160; buying Armor I mid-run with Training 3 → 106 + 25.
- Mutations: scale by the team's lowest level → T2 fails; skip `reloadSecondsFor` at one of the five sites → the tick-table test fails; apply damage to turrets → the turret test fails.

### Beat the rule (reviewer start list)

1. **Cheating:** POST `{ level: 5 }` at level 0 → `already_trained`; edit cached levels in `localStorage` → practice only (no rewards); send a different `balanceVersion` → refused as today.
2. **Farming:** none (Training spends Supplies).
3. **Losing progress:** network drops after commit → next session shows the level; retry with the same `requestId` → no second charge.
4. **Two devices:** both train the same boost at once → one level bought (`already_trained` for the other).
5. **Offline:** practice uses cached levels; the tab shows "Offline · can't train now".
6. **Balance:** a full-Training veteran next to a newcomer is ≈ 10 % tougher (HP), ≈ 5 % harder-hitting, ≈ 5 % faster reloading, +50 money: check it in the 10-wave sim with 4 bots at Training 5 vs 0 (log only, no assert: brief 15).

### Notes for the merge

- `player.ts addPlayer` options and `RunPlayerInit`: shared with 7.4 (unlock mask); one type.
- `combat/firing.ts`, `flame.ts`, `grenades.ts`: damage/reload call sites; Epic 6 stories don't touch them; 8.8 changes rewind only.
- `economy/gear.ts effectiveMaxHp`: signature gains the player (or its trained base): update every caller.
- `ProgressScreen.tsx` tab list: second entry; **7.10** (other writer) adds Survivor third.
- `ResultsScreen.tsx`: a line in each table row; 7.2's panel is above the table.

### Dependencies

7.1, 7.3 (hub, account route pattern), 7.4's run-start load (or builds it first). 7.2 for Supplies to spend. No dependency on 7.6/7.7 or 7.9–7.12. Customization D2 (parked level system) is unaffected.

### Decisions to confirm (recommended first, alternative after)

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.5 D1 | Max-HP training and body armor | **+10 % of the base 100 HP (110), armor adds its +25/+50 on top** (+10 % of everything incl. armor: 165 with Armor II) |
| 7.5 D2 | What "damage +5 %" covers | **Your own weapons only** (guns, melee, flames, launcher) (also your turrets, traps, mines and thrown items) |
| 7.5 D3 | Client and server disagreeing on Training numbers | **Training numbers are part of the version check, like every balance number** (no check) |
| 7.5 D4 | Reload steps smaller than one game tick | **Rounded to whole ticks: short reloads change only from level 2–3** (keep fractions of ticks: exact, more code in the fire clock) |
| 7.5 D5 | Showing Training to the team | **On Results only** (the party notes' choice) (also a small number on the lobby card) |

### Needs a look?

**Yes: the Training tab** (4 rows with a 5-pip level bar, "Now / Next · price", Train → Confirm → spinner, "Maxed") inside the 7.3 hub frame, and the **per-player Training line on Results** (small text in each row at 568 × 320). The designer picks both from code-drawn proposals (they can be on the same proposal page as 7.3's hub).

### References

- `epics.md` › Story 7.5; FR80; GDD › Player Progression (Training row); `docs/ideas/epic-7/proposal.md` § 0 D6, § 2; party notes Round 4; readiness report G1/Q1, Q12; `docs/epic-5-decisions.md` (start money 200, Training step +50).

## Dev Agent Record

**Merged story 7.4+7.5** (designer 2026-11-25, `docs/story-merges-2026-11-25.md`): the one Dev Agent Record (Gate, tasks → tests for T1–T5 of this file, Notes for the merge, Not verified, File List) is in `7-4-shop-deck-from-my-unlocks.md`. Build-time choices 7.5 B1–B8: `docs/epic-7-decisions.md › Story 7.4+7.5 build-time choices`.

## Change Log

- 2026-11-24: story file created (ready-for-dev).
- 2026-11-25: built inside the merged story 7.4+7.5 on `story-7-4-5`; status review.
