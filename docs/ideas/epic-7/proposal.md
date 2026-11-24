# Epic 7, progression and unlocks: proposal

Idea work, 2026-11-24, branch `claude/idea-epic-7`. Inputs: the roundtable (`party-notes.md`), the pressure test (`forge/.memlog.md`), and the playable simulator (`progression-sim.html`, published at claude.ai/artifact/LFskPyGc9Ji9ziyD8iaQVd). Revised story texts: `revised-stories.md`. No game code changed.

Every number is a starting value for balance JSON (a new `progression.json`), not code.

## 0. Designer decisions

**Designer, 2026-11-24.** First round: "I'm not sure if unlocking everything should be a real goal. Not everybody wants to play with every weapon, so maybe we can keep the numbers we had." The session agreed and revised D1, D3 and D6 (below, marked *revised*). Second round: **"ok"**, so every value in the "Decision" column is accepted.

| # | Decision (accepted) |
| --- | --- |
| D1 | *revised:* **keep the GDD earnings: +10 per wave survived, +50 Behemoth, +100 extract, +20 per endless wave (kept only on extract).** Unlocking everything is a long-term goal, not the target; the target is "your first weapon in about 3 runs, a few favourites in about 10". |
| D2 | A wave counts for everyone still in the run when it ends, downed or out; a quitter banks what they had. |
| D3 | *revised:* rookie lift **× 2 until 300 lifetime Supplies** (about the first 3 runs). |
| D4 | Fire Axe and Revive kit join the starter pool (they leave the unlock list). |
| D5 | Free unlock order; "Good next pick" marker; no tree. |
| D6 | *revised:* Training keeps its caps **and its GDD cost, 50 × level** (3,000 for all): the sink for Supplies left over from items a player skips. Always applies in full, solo too; never scaled to the team. |
| D7 | Borrowed card: 1 of 6 cards may come from a teammate's unlocks I lack. |
| D8 | Unlocks can't be turned off (v1). |
| D9 | Guest token also in a 1-year HttpOnly server cookie; "Save my progress" once after the first run that banks ≥ 200 Supplies. |
| D10 | Username + password + one-time 12-character recovery code; no email. |
| D11 | Logging in on a device with guest progress merges it. |
| D12 | The host can pick a district if anyone in the lobby has it. |

Applied to `epics.md` (Stories 7.1–7.7, FR78–FR81) and the GDD by `gds-correct-course`: `_bmad-output/planning-artifacts/sprint-change-proposal-2026-11-24.md`.

The table below is the session's **first** proposal, kept as the record (D1, D3 and D6 were then revised as above).

| # | Question | Recommended | Why |
| --- | --- | --- | --- |
| D1 | Supplies per run | **+20 per wave survived** (was 10), +50 Behemoth, +100 extract, +20 per endless wave (kept only on extract) | The GDD numbers take ~42 runs to get everything; the target is 15–20. A full extract = 350, a wave-5 loss = 100: every run moves you, winning still pays 3.5× more. |
| D2 | Who gets a wave | **Everyone still in the run when the wave ends, even downed or out.** Quitting banks what you had. | Otherwise the weakest player earns the least. |
| D3 | Rookie lift | **Double Supplies until 500 lifetime Supplies** (about the first 3 runs) | A new friend unlocks their first real weapon in a few runs, not ten. |
| D4 | Starter pool | **Add the Fire Axe and the Revive kit** to the starter pool (they leave the unlock list) | Today a new player's card pool is exactly 6 items: the "random" shop shows the same 6 cards every build and Reroll is never on. 8 items fix that. The rookie gets the co-op item. |
| D5 | Unlock order | **Free: any item, any order.** The screen marks one "Good next pick" (the cheapest locked item in the category you own fewest of). No tree, no prerequisites. | 14 items is small; a tree adds rules with nothing to decide. |
| D6 | Training | **Keep 4 boosts × 5 levels, same caps (+10 % HP, +5 % damage, +5 % reload, start money 100 → 150), but cost 25 × level** (25 … 125; 1,500 for all, was 3,000). Always applies, solo too. Not scaled to the team. | Halves the slowest part of the grind. Scaling a veteran down "to be fair" makes their Training feel stolen; the caps already keep a newcomer viable. |
| D7 | Borrowed card (co-op fairness) | **Yes: each build, 1 of your 6 cards may come from a teammate's unlocks that you don't have**, tagged "Borrowed from Mo". Bought with run money, gone after the run. Fixed at the draw (room at build start), same shop stream, still 6 draws. | The new friend gets to try the Chainsaw tonight, and learns what to unlock. Veterans rarely get one (their friends seldom have something they lack), so it targets the newcomer by itself. Replaces 7.4's "a teammate's unlocks never appear in my shop". |
| D8 | Turning unlocks off | **No** (v1): every unlock is always in your deck | 5.13's rarity weights already keep big pools sane; a toggle screen is extra UI for little. |
| D9 | Keeping guests safe | **The server also keeps the guest token in a 1-year first-party HttpOnly cookie**, and Results shows "Save my progress" once after the first run that banks ≥ 200 Supplies | Safari deletes a site's script storage after 7 days without a visit: an every-third-Friday friend would lose everything. |
| D10 | Account recovery | **Username + password + a 12-character recovery code shown once at sign-up** ("screenshot this"); no email | Lets a forgotten password be reset without collecting emails. |
| D11 | Logging in on a device that has guest progress | **Merge:** unlocks and cosmetics joined, Supplies added, the higher Training level, stats added | Nobody loses a night's play; in a co-op game there's nothing to exploit. |
| D12 | District pick | District 2 unlocks per player on their first Downtown extract; **the host can pick a district if anyone in the lobby has it** | Better together: a veteran brings a newcomer along. (District 2 is "coming soon" in v1, so only the rule ships.) |

## 1. Supplies (D1–D3, as accepted)

| Source | Supplies |
| --- | --- |
| Each wave survived (1–10) | +10 |
| Behemoth killed | +50 |
| Extract | +100 |
| Each endless wave | +20, kept only if the team extracts |
| Rookie lift | × 2 while lifetime Supplies < 300 (the run that crosses 300 is still doubled) |

Example runs: wipe in wave 5 = 50 (rookie 100). Wipe in wave 8 = 80. Extract after wave 10 = 250. Extract after 3 endless waves = 310. Endless wipe after 3 endless waves = 150 (waves 1–10 + boss; endless lost).

The extract vote shows the bet: "Extract now: +100 · Stay: +20 a wave, lost if you wipe".

## 2. What there is to buy

**Starter pool (free, D4):** Pistol, Machete, **Fire Axe**, Shotgun, SMG, Hunting Rifle, Body armor I, Running shoes, **Revive kit**, Wood barricade, Auto-turret, Medkit, Grenades.

**Unlocks (14 items, 3,120 Supplies):**

| Category | Items | Sum |
| --- | --- | --- |
| Weapons | Assault Rifle 200 · Chainsaw 300 · Gas torch 350 · Flamethrower 400 · Grenade Launcher 500 | 1,750 |
| Buildings | Spike trap 100 · Bear trap 100 · Mine 100 · Floodlight 120 · Barricade upgrades (reinforced + metal) 150 · Med station 300 | 870 |
| Gear | Tactical flashlight 100 · Body armor II 250 | 350 |
| Consumables | Molotovs 150 | 150 |

**Training (D6):** 4 boosts × 5 levels, level n costs 50 × n → 750 per boost, 3,000 for all.

**Everything:** 6,120 Supplies (a long-term goal, not the target).

## 3. Pacing (from the simulator's default friend group)

The model: 3 runs wiping at wave 5, 3 at wave 7, 3 at wave 9, then every other run extracts (sometimes 2 endless waves), the rest wipe at wave 8. Open the simulator to change it.

| Setup | First weapon you want (~300) | A few favourites (~1,000) | Everything |
| --- | --- | --- | --- |
| GDD as written | run 6 | run 11 | run 42 |
| **Accepted (GDD earnings + rookie lift to 300)** | **run 3** | **run 10** | ~run 40 |
| First proposal (+20 per wave, Training 25 × level) | run 2 | run 6 | run 21 |

## 4. The shop deck (Story 7.4, with 5.13)

- `cardPool(world, playerId)` = my unlocked weapons and gear (starter + unlocks), minus 5.13's exclusions (Pistol, `inShop: false`, owned).
- **Borrowed card (D7):** at each build start, the "borrow list" = items any teammate in the room has unlocked that I haven't (weapons and gear only). If it isn't empty, one of my 6 card slots is drawn from it (same `shop:<slot>:<build>` stream, still 6 draws), marked "Borrowed from <name>". It counts toward the weapon/gear floor. Rerolls redraw it the same way. A teammate leaving mid-build changes nothing until the next draw.
- Build bar: only my unlocked buildings. Always-available section: only my unlocked consumables. (No borrowing for buildings or consumables: the card is the "try it" moment.)
- Supply drop (Epic 6): its weapon is given even when locked; Results adds "You used the Grenade Launcher: unlock it for 500".
- Q13 stays: fewer cards when the pool runs dry; Reroll off when no new draw exists.

## 5. Accounts (D9–D11)

- Guest token: random 32 bytes, stored on the device (`localStorage`, try/catch) **and** as an HttpOnly, Secure, SameSite=Lax cookie set by the server for 1 year (renewed on each visit). Only its hash is in the database.
- "Save my progress": username 3–20, password ≥ 8 (Argon2id), then a one-time recovery code (12 characters, 4-4-4, hashed). "Forgot password" = username + recovery code + new password; a new code is shown after use.
- Logging in on a device with its own guest progress merges it (D11), then the device token points at the account.
- Rate limit stays NFR12 (5 attempts per IP per minute), recovery attempts included.

## 6. How it fits customization (7.8–7.12)

- **One "Progress" hub** on the start screen: Unlocks · Training · Survivor (7.10). Supplies total at the top.
- **One "Run rewards" panel** on Results: Supplies breakdown (D1–D3), new milestone item (7.11), loot bag (7.12), "unlocked: district 2" (7.7), "Save my progress" nudge (D9). All written in 7.2's single transaction.
- Cosmetics still never cost Supplies (customization D3). Milestone M2 "first extraction" and the district unlock fire from the same event.
- Training stays separate from the parked "level system with stats" idea (customization D2); if that idea comes back it can absorb these four rows.

## 7. Watch list

- **Grind:** "everything" is not the goal (designer). First wanted weapon by run 3, a few favourites by run 10. If friends still feel slow after the playtest, the lever is wave pay (+20 per wave halves the waits; see the simulator).
- **Pay-to-win feel:** no real money anywhere; unlocks add options; Training is capped at about +10 % strength.
- **New friends behind:** D3 rookie lift, D4 bigger starter pool (incl. Revive kit), D7 borrowed card, D12 district rule.
- **Exploits:** Supplies come only from the server's run result (never the client); a quitter banks only what they earned; solo earns the same as co-op (solo is "allowed, not tuned").
