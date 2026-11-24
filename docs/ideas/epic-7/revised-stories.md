# Epic 7: revised story texts (7.1–7.7)

Drop-in replacements for Stories 7.1–7.7 in `_bmad-output/planning-artifacts/epics.md`, for `gds-correct-course`. Numbers and reasons: `proposal.md` (decisions D1–D12). Stories 7.8–7.12 (customization) are unchanged except the two notes at the end. "Changed:" lines list what differs from today's text; delete them when applying.

**Also change outside Epic 7** (same pass): GDD › Player Progression (Supplies table, starter pool, unlock list, Training cost, pacing "≈ 15 runs for every unlock, ≈ 21 for everything", borrowed card, rookie lift); FR78 (+20 per wave, rookie lift, who counts); FR79 (starter pool gains Fire Axe and Revive kit; borrowed card); FR80 (25 × level); FR81 (host may pick a district anyone in the lobby has); GDD shop section ("6 random cards … from the player's unlocked pool, one of which may be borrowed from a teammate").

---

## Epic 7: Accounts and meta-progression

Players keep progress between runs: Supplies earned every run, unlocks that add cards to their own shop and tiles to their build bar, capped Training boosts, and an optional account so progress follows them to another device. New friends catch up fast (rookie lift, a bigger starter pool, borrowed cards). The database arrives here, with only the tables each story needs. All progression numbers live in `packages/shared` `progression.json` (balance JSON).

### Story 7.1: Progress saved on the server

As a player,
I want the game to remember me on my phone without signing up,
So that my progress is kept from my very first run.

**Acceptance Criteria:**

**Given** the deploy stack and local development
**When** they start
**Then** a PostgreSQL 18 service runs (Docker Compose), the server connects with Drizzle ORM, and `npm run db:migrate` applies versioned Drizzle Kit migrations

**Given** this story's migration
**When** it runs
**Then** it creates only the `accounts` table (id, username nullable, password hash nullable, recovery code hash nullable, guest token hash, display name, created) and the `progress` table (account id, supplies, lifetime supplies, unlocks, training levels, districts)

**Given** a first visit
**When** the client has no guest token
**Then** the server issues a random 32-byte token, sets it as a first-party HttpOnly, Secure, SameSite=Lax cookie for 1 year (renewed on each visit), and the client also keeps a copy in `localStorage` (try/catch); either one is enough to find the account (designer D9: Safari clears script storage after 7 days without a visit)

**Given** a guest token on join (Story 2.3)
**When** no account matches its hash
**Then** a guest account and an empty progress row (starter pool only) are created; otherwise the existing account is loaded and its display name prefilled
**And** the database is reached only through repositories in `apps/server/src/db`

**Given** the VPS
**When** a night passes
**Then** a `pg_dump` backup runs, 14 days are kept, and copies go off the VPS (target documented in `docs/deploy.md`); a restore is tested once and the result noted (NFR13)

Changed: server cookie next to `localStorage` (D9); `lifetime supplies` (D3) and `recovery code hash` (D10) columns.

### Story 7.2: Earn and bank Supplies

As a player,
I want to earn Supplies at the end of every run, even when we lose,
So that every run moves me forward.

**Acceptance Criteria:**

**Given** a run ends (extract, wipe or quit)
**When** Supplies are computed for each player (server only, from the run result)
**Then** they get +20 per wave survived, +50 if the Behemoth was killed, +100 if the team extracted, and +20 per endless wave only if the team extracted (FR78; `progression.json`)
**And** a wave counts for every player still in the run when it ends, downed or out; a player who quits banks the waves ended before they left (designer D2)
**And** after a wipe in endless, only waves 1–10 and the boss count

**Given** a player whose lifetime Supplies are below 500 before this run
**When** their Supplies are computed
**Then** the run's total is doubled (rookie lift, D3), and Results shows "Rookie bonus × 2"

**Given** the extract-or-stay vote (Story 6.11)
**When** it shows
**Then** it shows "Extract now: +100 · Stay: +20 a wave, lost if you wipe"

**Given** the Results screen
**When** it shows
**Then** each player sees a "Run rewards" panel: "+N Supplies" with the breakdown, their new total, and (added by later stories) a new milestone item, a loot item and the district unlock
**And** after the first run that banks ≥ 200 Supplies for a guest, it shows "Save my progress" once (opens Story 7.6)
**And** if the player used a supply-drop weapon they haven't unlocked, it shows "You used the <weapon>: unlock it for <price>"

**Given** the server
**When** Supplies are banked
**Then** they are written to `progress` (supplies and lifetime supplies) in one transaction per run; a failed write is logged at `error` and retried once

**Given** the Supplies rules
**When** Vitest runs
**Then** tests cover loss, extract, endless extract, endless wipe, a downed/out player at wave end, a quitter, the rookie lift crossing 500, and a solo run

Changed: +20 per wave (D1), who counts (D2), rookie lift (D3), vote line, Run rewards panel, save nudge (D9), supply-drop unlock hint.

### Story 7.3: Unlock screen

As a player,
I want to spend Supplies to unlock new weapons, buildings, gear and consumables,
So that my options grow over time.

**Acceptance Criteria:**

**Given** a new account
**When** its progress is created
**Then** its pool contains the starter items: Pistol, Machete, Fire Axe, Shotgun, SMG, Hunting Rifle, Body armor I, Running shoes, Revive kit, Wood barricade, Auto-turret, Medkit, Grenades (FR79, D4)

**Given** the start screen
**When** I tap "Progress"
**Then** a hub opens with three tabs: Unlocks · Training (7.5) · Survivor (7.10), with my Supplies total at the top

**Given** the Unlocks tab
**When** I open it
**Then** I see every item by category, unlocked ones marked, locked ones with their Supplies price and one plain line of what they do: Assault Rifle 200, Chainsaw 300, Gas torch 350, Flamethrower 400, Grenade Launcher 500; Spike trap 100, Bear trap 100, Mine 100, Floodlight 120, Barricade upgrades (reinforced + metal tiers, one unlock) 150, Med station 300; Tactical flashlight 100, Body armor II 250; Molotovs 150
**And** any locked item can be bought in any order (D5); one is marked "Good next pick": the cheapest locked item in the category where I own the fewest
**And** the header says "Unlocks add cards to your shop, not power"

**Given** I tap Unlock with enough Supplies
**When** the server validates it
**Then** the item joins my pool and the Supplies are spent in one transaction; otherwise "Not enough Supplies" and nothing changes; a double tap never charges twice

Changed: Fire Axe and Revive kit move to the starter pool (D4); Progress hub; free order with "Good next pick" (D5); unlocks can't be turned off (D8).

### Story 7.4: Shop deck from my unlocks

As a player,
I want my shop to offer only what I've unlocked, plus a chance to try a friend's,
So that unlocks change which choices I get and new friends can try the good stuff.

**Acceptance Criteria:**

**Given** a run
**When** my 6 cards are drawn (Story 5.13's `cardPool`, replaced here)
**Then** they come from my unlocked weapons and gear (FR47, FR79)
**And** the build bar shows only my unlocked buildings, and the shop's always-available section only my unlocked consumables
**And** the Epic 5 card rules stay: no Pistol card, `inShop:false` items never drawn, owned items never drawn, no upgrade cards, no locking

**Given** teammates in the room at build start who have unlocked weapons or gear I haven't
**When** my offer is drawn
**Then** one of my 6 slots is drawn from that "borrow list" and shows "Borrowed from <name>" (designer D7); I buy it with run money like any card; it counts toward the weapon/gear floor; my unlocks don't change
**And** the draw still uses only `shop:<slot>:<build>` with exactly 6 draws; a reroll redraws the borrowed slot the same way; a teammate joining or leaving mid-build changes nothing until the next draw (5.13 F1, F2)
**And** buildings and consumables are never borrowed

**Given** the supply drop event
**When** I grab the crate
**Then** its rare weapon is given even if I haven't unlocked it

**Given** a player whose pool can't fill the card floor
**When** cards are drawn
**Then** the floor is filled as far as possible and the rest are weapon cards; when fewer than 6 new items exist, fewer cards show, and Reroll is disabled when no new draw exists (alignment Q13)

**Given** the deck rules
**When** Vitest runs
**Then** tests cover: a new player's offer shows ≥ 2 different sets across rerolls (8-item starter pool), a borrowed card appears only when a teammate has something I lack, same seed + same room → same cards, a solo player never gets a borrowed card, a teammate's leave mid-build doesn't change my offer

Changed: borrowed card (D7) replaces "a teammate's unlocks never appear in my shop"; tests.

### Story 7.5: Training boosts

As a player,
I want small, capped boosts I can train between runs,
So that I get a bit stronger without leaving new friends behind.

**Acceptance Criteria:**

**Given** the Training tab of the Progress hub
**When** I open it
**Then** I see 4 boosts with 5 levels each: max HP +2 % per level (max +10 %), damage +1 % per level (max +5 %), starting currency +10 per level (100 → 150), reload speed +1 % per level (max +5 %) (FR80)

**Given** I buy the next level
**When** I have enough Supplies
**Then** it costs 25 × level (25, 50, 75, 100, 125; 375 per boost, 1,500 for all) and is saved to `progress` (D6)

**Given** a run starts (solo or online)
**When** my survivor is created
**Then** my own Training levels are applied in full, never scaled to the team (D6), and they are listed on the Results screen

Changed: cost 25 × level (D6); applies in full, solo too; the "revisit before building" note is settled: Training stays, a later level system may absorb it.

### Story 7.6: Upgrade to an account

As a player,
I want to turn my guest profile into an account with a username and password,
So that I keep my progress on a new phone.

**Acceptance Criteria:**

**Given** a guest
**When** I choose "Save my progress" and enter a username (3–20 characters, unique) and a password (at least 8 characters)
**Then** my guest account becomes a full account, with the password hashed with Argon2id and all progress kept (FR77)
**And** I am shown a 12-character recovery code once (4-4-4, "Screenshot this: it's the only way back in if you forget your password"); only its hash is stored (D10)

**Given** "Forgot password"
**When** I enter my username, my recovery code and a new password
**Then** the password is replaced, the old code stops working and a new code is shown once

**Given** another device
**When** I log in with my username and password
**Then** that device's guest token (cookie and `localStorage`) is linked to my account and my progress loads
**And** if that device's guest had its own progress, it is merged in: unlocks and cosmetics joined, Supplies and lifetime Supplies added, the higher level of each Training boost, stats added; the guest account is then retired (D11)

**Given** login and recovery attempts
**When** one IP makes more than 5 per minute
**Then** further attempts are refused with "Too many attempts, try again in a minute" (NFR12)

**Given** wrong credentials or a wrong recovery code
**When** I submit
**Then** I see "Wrong username or password" (or "Wrong username or code") with no hint which one is wrong

Changed: recovery code (D10), merge (D11), rate limit covers recovery.

### Story 7.7: District unlock rule

As a player,
I want to see that extracting from Downtown unlocks the next district,
So that I have a goal beyond one map.

**Acceptance Criteria:**

**Given** the host's district picker in the lobby
**When** it shows
**Then** Downtown is selectable, and district 2 is selectable when **any player in the lobby** has unlocked it (D12); otherwise it shows as locked with "Extract from Downtown to unlock"

**Given** a player's first extraction from Downtown
**When** progress is saved (Story 7.2's transaction)
**Then** district 2 is recorded as unlocked for that player, Results shows "Unlocked: district 2", and its card shows "Unlocked: coming soon" (FR81)

Changed: pickable when anyone in the lobby has it (D12); unlock shown in the Run rewards panel.

---

## Notes for 7.8–7.12 (no text change needed)

- 7.10's editor opens as the "Survivor" tab of 7.3's Progress hub (and from the lobby card, O4).
- 7.11 and 7.12 add their lines to 7.2's "Run rewards" panel; milestone M2 (first extraction) and 7.7's district unlock fire from the same event.
