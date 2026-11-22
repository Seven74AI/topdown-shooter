# Story 3.2: Personal wallets and rewards

Status: review

## Story

As a player,
I want to earn my own money from kills, assists, revives and cleared waves,
so that what I buy reflects how I played and helps the team.

> **Decisions taken while writing this story (no designer questions; recorded here, the designer can change them):** money pops ("+N") show for **my own** wallet only; one pop per frame (gains in the same frame are summed); a kill with no killer (dev cheats) pays nothing, assists included; the HUD shows the wallet as `$100` under the health bar; the Results screen does not show money yet (3.10 adds "money earned" to its temporary Results).

## Acceptance Criteria

1. **Start wallet (FR12).** At the start of a run every player has a personal wallet of 100, read from a new `economy.json` balance file. The HUD shows it. The shop (3.3) will show it too.
2. **Kill and assist (FR45).** When the economy system processes `zombie.killed`, the killer gets the reward of the zombie's type (Walker 2, Runner 3, Crawler 3 from `zombies.json`). Every **other** player who damaged that zombie gets 50% of the reward, rounded down, as an assist.
3. **Revive.** When `player.revived` is processed, the reviver gets +25.
4. **Wave-clear bonus.** When wave N ends, every player in the run, including downed and out players, gets 10 × N.
5. **Feedback and authority.** When money is earned, a small "+N" pops up near the player. The wallet lives in schema state. Only the server changes it (solo: the local World). The client never predicts money.
6. **Tests.** Vitest covers the kill, assist split, revive and wave bonus amounts.

## Tasks / Subtasks

- [x] **Task 1: Balance** (AC 1–4)
  - [x] Add `packages/shared/src/config/balance/economy.json`: `{ "startingWallet": 100, "assistShare": 0.5, "reviveReward": 25, "waveClearBonusPerWave": 10, "buildingKillShare": 0.5 }`. `buildingKillShare` is for 3.6 (turret kills pay the owner 50%). It is unused here but makes the kill-credit path explicit.
  - [x] Add `economySchema` (strict, ints ≥ 0, shares in [0, 1]) to `balanceSchema.ts`, and add `economy` to `balanceFileSchemas` and to `BUNDLED` in `balance.ts`.
  - [x] Rewards stay on the zombie types (`zombies.json › types.*.reward`; Walker 2 is there already). 3.8 and 3.9 add Runner 3 and Crawler 3. No number inline.
- [x] **Task 2: Wallet state (shared)** (AC 1, 5)
  - [x] `PlayerState` gains `wallet: number` (spendable) and `earned: number` (total earned this run, never reduced by spending; 3.10 logs it). `addPlayer` sets `wallet = balance.economy.startingWallet` and `earned = 0`.
  - [x] Both fields reach `snapshotWorld` through the player spread. Add a test that proves it.
- [x] **Task 3: Damager tracking (shared, allocation-free)** (AC 2)
  - [x] `World.economy: EconomyState`, from `createEconomyState(ZOMBIE_POOL_CAPACITY)`:
    - `damagers: (string | null)[]`, length `capacity × MAX_DAMAGERS` (`MAX_DAMAGERS = MAX_PLAYERS = 4`), preallocated;
    - `damagerCount: Uint8Array(capacity)`.
  - [x] Each `zombie.hit` with a `sourceId` adds that id to the zombie slot's list, once. Extra ids past `MAX_DAMAGERS` are ignored.
  - [x] **Reset:** `spawnZombie` sets `damagerCount[id] = 0`, which covers slot reuse with a new generation. Paying a kill also clears the list.
  - [x] `snapshotWorld` gains `economy.damagers`: `[slot, ids…]` for every slot with a count > 0.
- [x] **Task 4: Economy system (shared)** (AC 2–4): `packages/shared/src/economy/economy.ts`, `updateEconomy: SystemFn`, wired into `DEFAULT_SYSTEMS.economy`. It stays a no-op in `NO_SYSTEMS` and `PREDICTION_SYSTEMS`.
  - [x] **Source of truth: this tick's pending events.** The economy slot runs after combat, waves and the player system, and before `events.flush()` (architecture › system order). Add a read-only accessor to `EventBus`, `pendingAt(i)`. Next to it, `pendingCount` already exists.
  - [x] Read `n = pendingCount` first, then walk events `0 … n-1` in order. Money events emitted during the walk are not re-read.
  - [x] Events emitted between steps (a dev cheat's `skipWave`, or 3.1's `endWave` called by the run state machine) are still pending at the next step, so they are paid exactly once at that step.
  - [x] `zombie.hit` → `recordDamager`.
  - [x] `zombie.killed` → `payKill(world, zombieId, killerId, 1)`:
    - The reward is `balance.zombies.types[zombieTypeOf(pool, zombieId)].reward`. The slot still holds the type: a freed slot is held 20 ticks before reuse, so its type is intact when the economy runs that tick or the next.
    - The killer gets `floor(reward × share)`.
    - Every other recorded damager gets `floor(reward × assistShare)`.
    - The list is then cleared.
    - `killerId === null` (cheat) pays nothing.
  - [x] **3.6 hook:** `payKill(world, zombieId, creditId, share)` is exported. A turret kill will call it with the owner and `buildingKillShare`, or 3.6 adds an `ownerId` to `zombie.killed`. Either way it goes through one function.
  - [x] `player.revived` → `earn(reviverId, reviveReward, "revive")`.
  - [x] `wave.ended { number }` → every player in `world.players`, whatever their status, `earn(id, waveClearBonusPerWave × number, "wave")`.
  - [x] `earn(world, playerId, amount, reason)` adds the amount to `wallet` and `earned`, then emits `money.earned { playerId, amount, reason }`. It does nothing for an unknown player or for an amount ≤ 0.
  - [x] `spendMoney(world, playerId, amount): Result<number, "unknown_player" | "invalid_amount" | "insufficient_funds">` returns the new wallet. It is for 3.3/3.4/3.7. The server validates purchases, and nothing calls it in 3.2 except tests.
  - [x] Export everything from `index.ts`.
- [x] **Task 5: Events and wire** (AC 5)
  - [x] Add `SimEvent` `money.earned { playerId; amount; reason: MoneyReason }`, with `MONEY_REASONS = ["kill", "assist", "revive", "wave"] as const`. The list is append only, because the index goes on the wire. 3.6 appends `"building"`.
  - [x] Add `NET_EVENT_KIND.MONEY_EARNED = 19`, encoded as `[19, slot, amount, reasonIndex]`, with a round-trip test.
- [x] **Task 6: Server** (AC 1, 5)
  - [x] Schema `PlayerState`: add `wallet: t.uint32()` and `earned: t.uint32()`, both defaulting to 0. Add both to `PlayerStateView`, `resetPlayer`, the client `fakeRoom.fakePlayer` and **the dev throttle's `PLAYER_FIELDS`** (the `satisfies` check fails until you do).
  - [x] `syncState` copies `wallet` and `earned`, assigning each only when it changed.
  - [x] `run_ended` also logs `earned` per player (input for 3.10).
- [x] **Task 7: Client** (AC 1, 5)
  - [x] Mirror: `NetSimHost.applyPlayer` sets `p.wallet = s.wallet` and `p.earned = s.earned` from the latest state. `money.earned` reaches the scene through the event queue at the render tick, like other server events.
  - [x] The prediction World has no economy system, so nothing predicts money.
  - [x] Solo: `LocalSimHost` runs `DEFAULT_SYSTEMS`, so it already has the economy.
  - [x] HUD model gains:
    - `money` (my wallet);
    - `moneyGain` (sum of my `money.earned` this frame; the HUD consumes it and resets it to 0);
    - `localX/localY` (the drawn world position the camera follows).
  - [x] GameScene fills them each frame and on `money.earned` events where `playerId === localId`.
  - [x] HudScene draws a gold `$100` line under the HP text. It calls `setText` only when the value changes.
  - [x] HudScene draws pooled "+N" texts (6). Each rises about 22 CSS px and fades out over 900 ms, just right of the survivor near head height (moved from "above": above, it hid under the wave banner), using HUD tweens, so the solo pause (2.11 `tweens.pauseAll`) freezes them. Gold, bold, dark stroke, ≥ 14 CSS px.
  - [x] Reset the pops in `init`/`create`, because Phaser reuses scenes.
- [x] **Task 8: Tests** (AC 6): see Dev Notes › Testing.

## Dev Notes

### Scope and prerequisites

- **Builds on:**
  - 2.7: `zombie.hit.sourceId` is the shooter or swinger. It is set in `combat/damage.ts › applyZombieDamage`, the single damage entry point.
  - 2.8: `player.revived { playerId, reviverId }` is emitted in `player/downed.ts`.
  - 1.7: `wave.ended { number }` is emitted by `waves/waveDirector.ts › endWave`, which the director and the `skipWave` cheat both use.
- **Parallel stories:**
  - **3.1** (build phase, `run/runStateMachine.ts` with `startBuild/startWave/endWave/endRun`): it will move the wave flow. 3.2 pays the bonus from the **`wave.ended` event**, not from a call inside the director. Whoever ends a wave, by the director or by the state machine through shared `endWave`, gets the bonus paid. If 3.1 emits `wave.ended` from a different function, nothing here changes.
  - **3.9** (Crawler, reward 3): adds a zombie type with `reward: 3`. `payKill` reads the reward by type, so nothing changes here.
- **Later stories:**
  - **3.3** shop spends with `spendMoney`, server-validated.
  - **3.6** turret kills credit the owner with `payKill(…, ownerId, buildingKillShare)`.
  - **3.10** logs `earned` per player.
  - **8.2** (mid-run join with the team average) sets `wallet` directly.
- **Out of scope:**
  - the shop UI;
  - building kills;
  - money on the Results screen (3.10);
  - teammates' pops;
  - rejoin keeping the wallet (8.1).

### Rules

- **Order in a tick:** input → player (downed/revive emits `player.revived`) → combat (`zombie.hit`, `zombie.killed`) → zombies → waves (`wave.ended`) → **economy** → flush.
  - Events are paid in emit order. That is deterministic, because the sim is seeded and has no `Math.random` or `Date.now`.
- **Assist:** "every other player who damaged that zombie" is any player whose shot or swing hit it at least once since it spawned.
  - Damage amount doesn't matter.
  - The killer is never also paid an assist.
  - Players who left the run (not in `world.players`) are skipped.
- **Rounding:** `Math.floor`, applied per payment. A Walker's assist is floor(2 × 0.5) = 1; a reward-3 type gives 1.
- **Wave bonus:** every player in `world.players`, downed and out included. A wiped team never ends its wave, so it gets no bonus.
  - The `skipWave` dev cheat ends the wave and pays the bonus; that is expected for a cheat.
  - The kills it makes have `killerId = null` and pay nothing.
- **Authority:** only the economy system (and later server-validated spending) writes `wallet`/`earned`.
  - Online, the client reads them from schema. The mirror World's systems are all no-ops, and the Predictor runs input + movement only.
- **Allocation:** damager lists are preallocated typed/fixed arrays. Iterating pending events allocates nothing.
  - `money.earned` objects are created per payment, like every other sim event (kills are event-rate, not tick-rate).

### "+N" popups

- Only for the local player's own gains. The sum per frame is one pop.
- It follows the survivor the camera follows. While out, that is the spectated teammate's position, so the wave bonus pop stays visible.
- Pool of 6 Phaser texts in HudScene, reused round-robin.
- Screen space, world → screen with `camX/camY/camZoom`, like the downed countdowns, so the text stays crisp at any zoom.

### Testing (shared, Vitest, fixed seed)

Isolate mechanics with `systems: { waves: () => {} }` where the wave director would interfere (Epic 1 lesson).

- **Start:**
  - `addPlayer` gives wallet 100, earned 0;
  - a balance override of `economy.startingWallet` changes it.
- **Kill:**
  - p0 kills a Walker with the pistol through the real combat path → p0 +2;
  - `money.earned { reason: "kill", amount: 2 }`.
- **Assist split:**
  - p0 hits, p1 kills → p1 +2, p0 +1;
  - three damagers → killer +2, the two others +1 each;
  - several hits by the same player count once;
  - with a reward of 3 (balance override): killer 3, assist 1.
- **Reset:**
  - p0 damages zombie A, A dies to a cheat (null killer: nobody paid);
  - after the slot is reused for B (`generation` +1), p1 kills B → p0 gets no assist.
- **Revive:** the real downed/revive rules (two players, 60 ticks in reach) → reviver +25, the revived +0.
- **Wave bonus:**
  - `endWave` at wave 3 → +30 to alive, downed and out players alike;
  - the real wave director clearing wave 1 → +10.
- **Between steps:** `skipWave` called outside `step` → paid at the next step, once.
- **Spend:** `spendMoney` ok returns the new wallet; the `insufficient_funds`, `invalid_amount` and `unknown_player` errors leave the wallet unchanged; `earned` is unchanged by spending.
- **Determinism:** two Worlds with the same seed and inputs have equal `snapshotWorld`, which includes wallets and damagers.
- **Systems:** `PREDICTION_SYSTEMS`/`NO_SYSTEMS` never change a wallet.
- **Wire:** `money.earned` round-trip.
- **Server:**
  - `syncState` copies wallet/earned, and `resetRunFields` zeroes them;
  - a `RunController` run where p1 kills zombies p0 damaged shows the amounts;
  - a `bootTestServer` integration: the client's state has wallet 100 after start, and a server-side kill raises it.
- **Client:** `NetSimHost` writes `wallet` from the schema into the mirror; the dev throttle copies `wallet`/`earned`.

### Project Structure Notes

- New:
  - `packages/shared/src/economy/{economy.ts, economy.test.ts}`
  - `packages/shared/src/config/balance/economy.json`
  - `apps/server/src/rooms/RunRoom.economy.test.ts`
- Modified:
  - shared: `config/{balance.ts, balanceSchema.ts}`, `core/{world.ts, systems.ts, eventBus.ts, simEvents.ts, worldSnapshot.ts}`, `player/player.ts`, `zombies/zombiePool.ts`, `net/{netEvents.ts, stateView.ts}`, `index.ts`
  - server: `rooms/schema/{RunState.ts, syncState.ts}`, `rooms/RunRoom.ts`
  - client: `net/{devThrottle.ts, fakeRoom.ts}`, `sim/NetSimHost.ts`, `scenes/{GameScene.ts, HudScene.ts, hudModel.ts}`
- Apps never import each other. The client reads the schema through `PlayerStateView`, and `RunState.ts`'s compile-time drift check enforces it.

### Project Context Rules

- No `project-context.md` exists. The rules come from the architecture and the reviews:
  - deterministic shared sim with no per-tick allocation;
  - no gameplay number inline;
  - every new SimEvent gets a net kind and a round-trip test;
  - every new schema field goes into `PlayerStateView`, `resetPlayer`, `fakePlayer` and the dev throttle key lists;
  - `this.net.guard` for client messages (none are added here);
  - `bootTestServer()` for room tests;
  - Phaser 4 APIs (check `node_modules/phaser/types`);
  - reset scene state in `create`/`init`;
  - no new dependencies.

### References

- [Source: epics.md#Story 3.2: Personal wallets and rewards], FR12, FR45
- [Source: gdd.md#Economy and Resources] (assist 50%, revive +25, building kills 50%, wave bonus 10 × N to every player incl. downed/out, start 100, target ≈ 2,500–3,000 per player over 10 waves)
- [Source: game-architecture.md#Communication Patterns] (economy after waves, before dispatch), [#Error Handling] (`Result` for purchases), [#State Management] (wallets in schema; the room is the only writer)
- Code: `core/systems.ts` (economy slot), `combat/damage.ts`, `zombies/zombiePool.ts`, `player/downed.ts`, `waves/waveDirector.ts`, `run/RunController.ts`, `rooms/schema/*`, `sim/NetSimHost.ts`, `net/devThrottle.ts`

## Dev Agent Record

### Agent Model Used

claude-opus-5-5 (story writer + builder agent, worktree `story-3-2`)

### Debug Log References

- The first browser run drew the wave bonus pop under the "Wave N cleared" banner (banner at 32 % of the screen height, survivor at 50 %, pop 1.1 m above). The pop now starts 0.6 m right of the survivor at head height and rises 22 CSS px, so it stays clear of the banner (`solo-wave1-cleared.png`).
- `skipWave` and other between-step emits land in the bus's pending list and are paid at the next step's economy slot. A test covers it.
- "Max payload size exceeded" in the server test log comes from the existing edge test, not from this story.

### Completion Notes List

- **Balance (AC 1–4):**
  - New `economy.json`: `startingWallet 100`, `assistShare 0.5`, `reviveReward 25`, `waveClearBonusPerWave 10`, `buildingKillShare 0.5` (the last one is for 3.6).
  - Strict zod schema, added to `balanceFileSchemas` and `BUNDLED`.
  - Tests that build raw balance files by hand now include `economy`.
  - Kill rewards stay on the zombie types: Walker 2.
- **Shared economy (AC 2–4):** `economy/economy.ts`.
  - `updateEconomy` is wired to `DEFAULT_SYSTEMS.economy`. It stays a no-op in `NO_SYSTEMS` and `PREDICTION_SYSTEMS`.
  - It reads this tick's pending events through the new `EventBus.pendingAt(i)`, capping the count first so its own `money.earned` events are not re-read. Events are paid in emit order:
    - `zombie.hit` (with a `sourceId`) records a damager;
    - `zombie.killed` calls `payKill`: the killer gets the type's reward and every other damager `floor(reward × 0.5)`. A null killer pays nothing;
    - `player.revived` pays the reviver +25;
    - `wave.ended` pays N × 10 to every player in `world.players`, whatever their status.
  - `earn` adds to both `wallet` and `earned` and emits `money.earned { playerId, amount, reason }`.
  - `spendMoney(world, id, amount): Result<number, "unknown_player" | "invalid_amount" | "insufficient_funds">` is ready for 3.3, 3.4 and 3.7.
  - `payKill(world, zombieId, creditId, share)` is the 3.6 hook for building kills.
  - Damagers are stored allocation-free: a preallocated `(string | null)[]` of `ZOMBIE_POOL_CAPACITY × MAX_DAMAGERS (4)` plus `damagerCount: Uint8Array`. The list is cleared when a kill is paid, and `spawnZombie` resets the count, which covers slot reuse with a new generation.
  - The zombie's type is read from the freed slot. Slots are held 20 ticks, so the economy runs well within that window.
- **Every new field through all copies (retro brief line 3):**
  - `PlayerState.wallet` / `.earned`:
    - World: set in `addPlayer` from balance;
    - schema: `RunState.ts` `wallet` / `earned` as `t.uint32`;
    - `syncState`: `syncWallet`, assigned only on change;
    - `resetRunFields`: zeroed;
    - `stateView.ts`: `PlayerStateView` (the compile-time drift check passes);
    - `NetSimHost` mirror: `applyPlayer`;
    - Predictor: not affected (money changes neither movement nor weapons, and `PREDICTION_SYSTEMS` has no economy);
    - devThrottle: added to `PLAYER_FIELDS` (the `satisfies` check);
    - `fakeRoom.fakePlayer`;
    - `snapshotWorld`: through the player spread (test).
  - `World.economy`: `snapshotWorld.economy.damagers`, a determinism test.
  - `SimEvent` `money.earned`: net kind 19 `[19, slot, amount, reasonIndex]`, with `MONEY_REASONS` append only, and a round-trip test.
- **Server:**
  - The schema fields above.
  - `run_ended` also logs `earned` per player.
  - No new C2S message: the client has no way to change a wallet. A test sends an unknown message and checks the wallet is unchanged.
- **Client:**
  - The HUD model gains `money`, `moneyGain`, `localX` and `localY`.
  - GameScene sums my `money.earned` per frame and passes my wallet and the drawn position the camera follows to the HUD.
  - HudScene:
    - draws a gold `$N` under the HP text, calling `setText` only on change;
    - draws 6 pooled "+N" texts on HUD tweens, so the solo pause's `tweens.pauseAll` freezes them;
    - resets in `init` and `create`, because Phaser reuses scenes.
  - Phaser 4 APIs checked: `tweens.add` on a plain object, `'Quad.easeIn'`, `killTweensOf`.
- **Tests:** 746 passing, 3 skipped.
  - New `economy.test.ts` (20):
    - start wallet and the balance override;
    - a real pistol kill +2;
    - assist split p0 1 / p1 2, three damagers, a repeat hit counted once, reward 3 → 3 / 1, the killer gets no self-assist;
    - a null killer pays nothing, a damager who left is skipped, slot reuse resets, the MAX_DAMAGERS cap;
    - the `payKill` building share;
    - revive +25 through the real downed rules, paid at tick 60, not 59;
    - wave bonus 30 to alive, downed and out players; the real director clearing wave 1 pays +10; a `skipWave` between steps is paid once;
    - `spendMoney` ok and each error;
    - `earn` guards;
    - `snapshotWorld` covers wallets, earned and damagers (determinism);
    - `NO_SYSTEMS` / `PREDICTION_SYSTEMS` never change money.
  - New `economySim.test.ts`: the seeded bot sim (below).
  - netEvents: two `money.earned` round-trips.
  - `syncState.test.ts`: wallet/earned copied, no patch when unchanged, reset.
  - New `RunRoom.economy.test.ts` (2, `bootTestServer`):
    - 100 at start on both clients;
    - kill/assist reach every client's state and the `MONEY_EARNED` events;
    - the wave bonus includes a downed player;
    - an unknown client message doesn't touch the wallet;
    - Back to lobby zeroes it, and the next run starts at 100.
  - New `NetSimHost.economy.test.ts` (3): the mirror copies wallet/earned for me and others; my inputs never change my wallet; the dev throttle copies both fields.
  - `npm run typecheck && npm run lint && npm test && npm run build` pass.
- **Seeded bot sim (retro risk, A10; evidence for 3.3 prices):** 2 bots, Pistol only, real balance and systems, seeds 1–5. Bot rules: aim at and fire on the nearest zombie, kite inside 3 m, revive a downed teammate.
  - 4 of 5 seeds wipe in **wave 3** and 1 in wave 2. That matches the retro's "Pistol runs wipe early".
  - Wallets p0/p1:

    | | Seed 1 | Seed 2 | Seed 3 | Seed 4 | Seed 5 |
    | --- | --- | --- | --- | --- | --- |
    | End of W1 | 188/151 | 186/152 | 188/151 | 188/151 | 186/152 |
    | End of W2 | 362/254 | (wiped) | 368/251 | 366/252 | 362/254 |
    | Final (wiped) | 444/297 | 272/195 | 440/287 | 456/297 | 452/303 |

  - Money split over a run: kills ≈ 60 %, assists ≈ 30 %, wave bonus ≈ 10 %.
  - Reading: after wave 1 both players can afford the Machete (150) but not the SMG (200). After wave 2 the leading player can buy the SMG and the other one nearly can. The Hunting Rifle (350) needs wave 2–3.
  - p0 earns consistently more than p1 in this setup (spawn side and the same nearest-target rule). That is a bot artefact, not an economy rule.
- **Browser check (Python Playwright + Chromium 844×390, server PORT=4267, Vite 6773 through a temporary `vite.s32.config.ts` merging `vite.config.ts` with `/api` → 4267, deleted after; `window.__game`; mouse auto-aim at the nearest zombie; money events captured by wrapping `fxView.handle`):**
  - **Solo, real balance** (`?solo&loadout=smg,pistol`, god mode): HUD `$100` at start. Wave 1 cleared with 40 kills → 41 money events (80 kill + 10 wave), wallet and HUD **190**. Wallet = 100 + the sum of the events, and the kill sum = 2 × kills. Screenshots: `solo-start.png`, `solo-pop.png` ("+2" pops), `solo-wave1-cleared.png` ("+12" = last kill + wave bonus in one frame; re-shot after the pop moved, with the small test waves).
  - **Online, two pages** (Ana creates, Bo joins by `/j/<code>`, Ready, Start): both pages show both wallets at 100.
    - Run 1, through wave 2: 18 zombies, 9 kills each; each player kill 18 + assist 2 + wave 30 = **150**.
    - Run 2: Ana 152 (kill 18, assist 4, wave 30), Bo 149 (kill 18, assist 1, wave 30).
    - On each page the wallet = 100 + that page's own money events and the HUD matches. Both pages agree on every player's wallet. No page errors.
    - Screenshots: `online-start-ana.png`, `online-pop-{ana,bo}.png`, `online-wave2-cleared-{ana,bo}.png`.
- **Not verified:**
  - real phones and 4G;
  - pops under `?lag` (the money event goes through the same queue as every other server event; the wallet goes through the throttle's copied fields, unit-tested);
  - the out player's pop position in a browser (the code places it at the spectated teammate);
  - feel: headless Chromium runs at a low fps.
- **Deviations:**
  - **Hand-edited balance for the online browser check:** `waves.json zombiesPerWave` was set to 6 on both server and client so two Pistol players could clear waves, then reverted before the commit. This goes against retro brief line 19 ("use the dev balance override switch"). The only override switch that exists, `?tune=1`, is solo-only, and online always plays the bundled balance.
  - The pop sits right of the survivor, not above (banner overlap).
  - `money.earned` has no `wallet` field (the wallet comes from schema).
  - Results do not show money (left to 3.10).
- **Bandwidth (retro brief line 11):**
  - one `money.earned` tuple per payment (4 small ints ≈ 5 B msgpack);
  - wallet/earned patches only on change (uint32, a few bytes);
  - at roughly 1–2 kills/s per team, that adds well under 0.1 KB/s per client.
- **Notes for the merge (retro brief line 20):**
  - **3.1 (run state machine):**
    - The wave bonus is paid from the `wave.ended` event, wherever it is emitted, in or between steps. If 3.1 renames or splits the event, add the new one to `apply()` in `economy/economy.ts`.
    - Players are created with wallet 100 by `addPlayer`: create the World once per run, as `RunController` does now, not once per build phase.
    - `resetRunFields` now also zeroes `wallet` and `earned`.
    - `RunRoom.endRun` logs `earned`. If 3.1 moves `endRun` into the state machine, keep that log line.
  - **3.9 (Crawler):**
    - `zombies.json` adds `crawler.reward: 3`. Nothing in the economy changes: rewards are read by type.
    - `ZOMBIE_TYPES` append-only is unchanged here.
    - Conflicts are possible only in the test files that build raw balance objects (`{ …, controls, economy }`).
  - **Schema / stateView / devThrottle / fakeRoom:** `wallet` and `earned` sit right after `kills` in each.
  - **`NetSimHost.applyPlayer`:** two lines after `this.applyDowned(p, s)`.
  - **`GameScene`:** a `money.earned` branch in the event loop, plus three lines after `hudModel.maxHp`.
  - **`HudScene`:** a constants block before `STICK_FILL`, fields after `markers`, objects created after `hpText`, `drawMoney()` called after `drawHealth()`.
  - **Balance:**
    - `economy.json` is new;
    - `balanceSchema.ts` gains `economySchema` before `balanceFileSchemas`;
    - `balance.ts` adds the import and the `BUNDLED` entry.
  - **`EventBus`:** `pendingAt(i)` added after `pendingCount`.
  - **`core/world.ts`:** an `economy` field. `core/systems.ts`: `economy: updateEconomy`. `zombiePool.spawnZombie`: one reset line.
  - **`netEvents`:** kind 19 is taken.
  - **`index.ts`:** exports appended at the end.

### File List

- `packages/shared/src/economy/economy.ts`, `economy/economy.test.ts`, `economy/economySim.test.ts`, `config/balance/economy.json` (new)
- `packages/shared/src/config/{balance.ts, balanceSchema.ts}`, `core/{eventBus.ts, simEvents.ts, systems.ts, world.ts, worldSnapshot.ts}`, `player/player.ts`, `zombies/zombiePool.ts`, `net/{netEvents.ts, stateView.ts}`, `index.ts` (modified)
- `packages/shared/src/net/netEvents.test.ts`, `config/balance.test.ts`, `combat/{aimAssist,firing,melee,swap}.test.ts`, `waves/waveDirector.test.ts`, `zombies/zombieAi.test.ts` (modified: the `economy` balance file)
- `apps/server/src/rooms/RunRoom.economy.test.ts` (new); `rooms/RunRoom.ts`, `rooms/schema/{RunState.ts, syncState.ts, syncState.test.ts}` (modified)
- `apps/client/src/sim/NetSimHost.economy.test.ts` (new); `sim/NetSimHost.ts`, `net/{devThrottle.ts, fakeRoom.ts}`, `scenes/{GameScene.ts, HudScene.ts, hudModel.ts}` (modified)
- `_bmad-output/implementation-artifacts/3-2-personal-wallets-and-rewards.md` (new), `sprint-status.yaml` (modified)

## Change Log

- 2026-11-22: Story 3.2 implemented: wallets (100 from `economy.json`), kill/assist/revive/wave-bonus rewards in the shared economy system, wallet in schema, "+N" pops and `$N` in the HUD, `spendMoney`/`payKill` APIs for 3.3/3.6, seeded Pistol bot sim. 746 tests passing. Status → review.
- 2026-11-22: Story created from the epics, GDD, architecture and the real code (Epic 2 complete).
