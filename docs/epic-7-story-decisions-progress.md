# Epic 7 progression stories (7.1–7.7): decisions to confirm

Written 2026-11-24 from the seven story files `_bmad-output/implementation-artifacts/7-1-*.md` … `7-7-*.md`, which were built from the real code on master `7385b47`. The other Epic 7 writer covers 7.9–7.12 (survivor look, editor, milestone items, loot bag) in its own file.

Each line shows the **recommended value** first, in bold, with the alternative after it. **"ok" accepts all 40.** To change one, use its code, for example "7.2 D8: doesn't count". Your earlier decisions D1–D12 (`docs/epic-7-decisions.md`) are already rules in the stories and are not asked again.

## The ones worth a look (how the game feels)

| Code | What it changes in play | Recommended (alternative) |
| --- | --- | --- |
| 7.2 D8 | The wave your team dies in | **It counts: a wipe in wave 5 pays 50 Supplies.** This matches the pacing you accepted (first weapon you want by about run 3). (It doesn't count, because "survived" read strictly excludes it: a wipe in wave 5 pays 40 and that first weapon moves to run 4.) |
| 7.2 D1 | Practice solo (the offline run on your phone) | **Banks nothing (no Supplies, no milestone items, no loot bag), and Results says "Practice runs don't earn rewards".** A one-player online game pays in full. (Practice pays too, but anyone could edit their phone to give themselves rewards.) |
| 7.2 D5 | Behemoths in endless (waves 15, 20, …) | **+50 each, kept only if the team extracts**, the same rule as endless waves. (Only the wave-10 Behemoth pays.) |
| 7.6 D1 + D2 | You log in on a phone whose guest already bought things you also own | **Nothing you paid for is wasted.** A doubled unlock refunds its price as Supplies. For Training you keep the higher level and get back what the other side spent on that boost. (Keep one copy and the higher level, and the doubled Supplies are lost.) |
| 7.5 D2 | What Training's "damage +5 %" covers | **Your own weapons only:** guns, melee, flames and the launcher. (Also your turrets, traps, mines, grenades and molotovs: a veteran's turret wall gets a little stronger too.) |
| 7.4 D3 | The save server can't be reached when the host taps Start | **You play tonight with the starter items and the run still starts.** Results says "Not saved". (Wait up to 2 s, then refuse to start until the server is back.) |

Also worth a glance:
- **7.3 D1:** a new player's "Good next pick" is the **Spike trap (100)**.
- **7.4 D2:** you can't upgrade any barricade, even a teammate's, without the Barricade-upgrades unlock.
- **7.6 D3:** the recovery-code screen closes only after you tap "I saved it".

## 7.1 Progress saved on the server

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.1 D1 | A computer without Docker (builders, tests) | **The server uses a small built-in database when none is set up, outside the live game** (every builder needs Docker) |
| 7.1 D2 | How long a join ticket lasts | **10 minutes**, fetched fresh before each Create/Join (1 minute) |
| 7.1 D3 | The cookie and phone storage point at two different players | **The cookie wins** (phone storage wins) |
| 7.1 D4 | Where the starter pool is kept | **In one game file; each player's save holds only what they bought** (copy the 13 starter items into every save) |
| 7.1 D4b | Guest key length | **Keep today's 128-bit key, so phones that already played keep their identity** (a new, longer key: every earlier phone becomes a new player) |
| 7.1 D5 | Someone copies my guest key to another device | **It's the same player, like a house key; 7.6's password is the real lock** (tie the key to one device: this breaks the Safari cookie fallback) |
| 7.1 D6 | New guest profiles from one internet address | **At most 20 an hour, then play goes on unsaved** (no limit) |
| 7.1 D7 | Where backup copies go off the VPS | **A Cloudflare R2 bucket** (free under 10 GB; the site already uses Cloudflare) (to your own computer every night) |
| 7.1 D8 | The database is down at the start of a night | **Play anyway; Results says "Not saved"** (refuse to start runs) |

## 7.2 Earn and bank Supplies

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.2 D1 | Practice solo | **Banks nothing (Supplies, milestone items, loot), says so** (pays too) |
| 7.2 D2 | A player who quits before the extract | **Keeps the waves and the boss they were there for, not the +100** (also gets the +100 if the team extracts later) |
| 7.2 D3 | A safety record so a retry can't pay twice | **Yes, one line per player per run** (none) |
| 7.2 D4 | A quitter doesn't see Results | **The start screen shows "+40 Supplies banked from your last run" once** (nothing) |
| 7.2 D5 | Endless Behemoths | **+50 each, kept only on extract** (only the wave-10 one) |
| 7.2 D6 | "You used the Grenade Launcher: unlock it for 500" | **Built in 7.4, which has the prices and the unlock check** (here) |
| 7.2 D7 | The server crashes mid-run | **Nothing banked; Epic 8's autosave will resume runs** (bank after every wave) |
| 7.2 D8 | The wave the team dies in | **Counts (a wave-5 wipe = 50)** (doesn't: 40) |

## 7.3 Unlock screen

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.3 D1 | "Good next pick" | **Starter items count; ties go to the cheapest. A new player's pick is the Spike trap** (count only bought items) |
| 7.3 D2 | Where the Progress button is | **Start screen and lobby** (start screen only) |
| 7.3 D3 | Guarding against a mis-tap (unlocks can't be undone) | **Tap Unlock, then "Confirm 300" within 3 s** (one tap buys) |
| 7.3 D4 | The one-line text under each item | **As proposed in the story's table** (you rewrite any) |

## 7.4 Shop deck from my unlocks

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.4 D1 | Practice solo's shop | **Your own unlocks** (starter items only) |
| 7.4 D2 | Upgrading a barricade without the unlock | **Whoever pays needs the unlock** (anyone, if the barricade's owner has it) |
| 7.4 D3 | Save server unreachable at Start | **Starter items tonight, the run starts** (refuse to start) |
| 7.4 D4 | When Results shows "unlock it for 500" | **After a supply-drop weapon or a bought borrowed card** (supply drop only) |
| 7.4 D5 | Where the borrowed card sits | **Drawn first, then sorted with the others** (always last) |

## 7.5 Training boosts

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.5 D1 | Max-HP training and body armor | **+10 % of the base 100 (110); armor's +25/+50 goes on top** (+10 % of everything: 165 with Armor II) |
| 7.5 D2 | What damage training covers | **Your own weapons only** (also turrets, traps, mines, thrown items) |
| 7.5 D3 | Client and server disagreeing on Training numbers | **Part of the version check, like every balance number** (no check) |
| 7.5 D4 | Reload steps smaller than one game tick (1/20 s) | **Rounded: short reloads change only from level 2–3** (exact fractions, more code) |
| 7.5 D5 | Where the team sees your Training | **Results only** (also on the lobby card) |

## 7.6 Upgrade to an account

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.6 D1 | Both sides bought the same unlock | **Refund its price** (lost) |
| 7.6 D2 | Both trained the same boost | **Higher level + refund the other side's spend** (higher level only) |
| 7.6 D3 | Closing the recovery-code screen | **Only with "I saved it"** (a normal Close) |
| 7.6 D4 | Password hashing strength | **The OWASP minimum: about 50 ms per login on the VPS** (stronger and slower, more memory) |
| 7.6 D5 | Logging out | **The phone becomes a new empty guest; the account is safe** (no Log out, only "Log in as someone else") |
| 7.6 D6 | Many wrong guesses at one name from many addresses | **Only the 5-a-minute limit per address** (lock the name for 10 min after 20 wrong tries: anyone could then lock a friend out) |

## 7.7 District unlock rule

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.7 D1 | District 2's name | **"District 2" until its content is chosen** (pick one of the GDD candidates now, for example "Hospital") |
| 7.7 D2 | Seeing district progress outside the lobby | **A "Districts" line in the Progress hub** (lobby only) |
| 7.7 D3 | The host picked District 2 and its only holder leaves (can't happen in v1: District 2 isn't playable yet) | **Back to Downtown with a notice** (keep the pick, refuse Start) |

## Build order

These rounds are picked by file overlap, following HANDOFF §3: a story starts as soon as its real overlap allows, with up to 3–4 builders at once. Every builder gets its story file, the EPIC 6 BRIEF lines the story names, `docs/epic-7-decisions.md` and this file.

| Round | Stories (parallel) | Waits for | Overlap and how it's handled |
| --- | --- | --- | --- |
| 1 | **7.1** (alone) | Network pass done, so 8.1 is on master (7.1 finishes its identity work: seats matched by account) | Everything else needs the database, the account API and `Member.accountId`. The other writer's **7.9** can start right after 7.1. |
| 2 | **7.2** ∥ **7.3** | 7.1; 7.2 also needs Epic 6's 6.11+6.12 (extract, endless) on master | 7.2 touches `player.ts` counters, `economy.ts`, `RunRoom.endRun/onLeave`, `meta/banking.ts`, `ResultsScreen`. 7.3 touches `progression.json › unlocks`, `meta/pool.ts`, `auth` routes, `ProgressScreen`, `StartScreen`, `LobbyScreen`. They share only `progression.json`, under different keys. |
| 3 | **7.4 → 7.5** (one builder, in that order) ∥ **7.6** ∥ **7.7** | 7.4: 7.3 (+ 7.2 for its Results line, 6.9 for the supply drop). 7.5: 7.4. 7.6: 7.2 + 7.3. 7.7: 7.2 + 6.11 | 7.4 and 7.5 share `addPlayer` options, the run-start progress load in `RunRoom.startRun`, schema `PlayerState` fields and `NetSimHost`, so they run in sequence. 7.6 is `auth/*`, `meta/merge.ts`, `AccountScreen` and a `StartScreen` row. 7.7 is lobby state and the picker, plus one writer in `banking.ts`. The other writer's **7.10** (needs 7.3's hub), **7.11** and **7.12** (need 7.2's transaction) can join this round. |

Estimated effort: 7.1 L, 7.2 M, 7.3 M, 7.4 M–L, 7.5 M, 7.6 M–L, 7.7 S–M (about 6–7 builder sessions). Reviews: a full fresh review for 7.1, 7.2, 7.4 and 7.6 (money, identity, the shop draw, passwords), and a light review plus "beat the rule" for 7.3, 7.5 and 7.7.

### Links to the other writer's stories (7.9–7.12)

- **7.9** (my look in the game) needs 7.1: an account behind the look and the `progress` table that its `look` column joins.
- **7.10** (survivor editor) is the third tab of 7.3's Progress hub. Its look route sits beside 7.3's and 7.5's routes. Its look rule goes into 7.6's merge list.
- **7.11** (milestone items) and **7.12** (loot bag) write inside 7.2's end-of-run transaction (`meta/banking.ts` writers) and add lines to 7.2's Run rewards panel. M2 "first extraction" fires from the same `run.extracted` as 7.7's district unlock. 7.11's `cosmetics`/`stats` merge rules go into 7.6's merge list.

## Looks needed

The designer picks each of these from code-drawn proposals before its story is built. One proposal page can carry all six.

1. **7.2: Results "Run rewards" panel**, at 568 × 320 and 800 × 360. Fixed row order (later stories append, never reorder): (1) Supplies: "+N Supplies", the breakdown, the rookie badge, or a status (Saving / Not saved / Couldn't save / practice). (2) Item rows with a close-up drawing: 7.11 "New item: …" per milestone, then 7.12 "Found in wave N: …" or "Collector". (3) Unlock lines: 7.4 "unlock it for 500", 7.7 "Unlocked: District 2". (4) 7.6's "Save my progress". One scrolling column; empty groups take no space.
2. **7.3: Progress hub and Unlocks tab.** The hub frame (Supplies total, header line, a tab bar for 3 tabs, Back), the item row (icon, name, line, price, Unlock → Confirm → spinner, Unlocked/Starter), the "Good next pick" tag, the not-enough and offline states, and placeholder icons for items without a drawing.
3. **7.4: "Borrowed from <name>" tag** on the 5.13 shop card.
4. **7.5: Training tab** (4 rows with 5-pip level bars, Now/Next, Train, Maxed) and the small Training line per player on Results.
5. **7.6: Account screens.** The start-screen and hub account row, the Save / Log in / Forgot password forms on a landscape phone with the keyboard up, the recovery-code card, the log-out confirm, and the Results "Save my progress" line.
6. **7.7: Lobby district picker** (Downtown, District 2 locked or "Unlocked · coming soon", room for Epic 11's Random city card) and the "Unlocked: District 2" line on Results.

7.1 needs no look.

## Open questions for the main session (not designer decisions)

- **No Epic 7 brief exists.** The stories name the EPIC 6 BRIEF lines that apply, as Story 7.8 did. A short `docs/epic-7-brief.md` (money only from the server, one transaction per run, every column has a merge rule, never await the database in a tick) would serve all twelve stories.
- **Planning text to update** after "ok":
  - `epics.md`: the 7.2 supply-drop hint moves to 7.4 (7.2 D6).
  - Architecture table list: `run_rewards` (7.2) and `device_tokens` plus `merged_into` (7.6, which replaces `accounts.guest_token_hash`).
  - `progression.json` lives in `packages/shared/src/config/` next to `cosmetics.json`. From 7.5 on, its Training numbers join the balance version.
- **The proposal's "random 32 bytes" guest token:** the real token is 16 bytes (`guestToken.ts`), and 8.1 relies on it. 7.1 keeps it (D4b).
- **8.1's copied-token flag:** 7.1 moves seat matching from the raw guest token to a server-signed account ticket and keeps the cookie HttpOnly. A copied key stays "the same player" (7.1 D5).
- **Deleting an account or progress:** no story covers it. Ask whether friends need a "delete my progress" button (no email is stored, only a name).
- **8.2 (Epic 8, later):** a mid-run joiner's money is "100 + 60 % of the team average". Should Training's start-money boost add to that? The stories leave it to 8.2.
- **Process:** I loaded `gds-create-story` once and applied its workflow to each of the seven stories. I didn't edit `sprint-status.yaml`, as asked: the seven keys are still `backlog`, and the files say ready-for-dev.
