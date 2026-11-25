---
baseline_commit: 0ee0d6db
---

# Story 8.2+8.3 (merged): Join mid-run at a build phase · Host role and removing a player

Status: review

<!-- Merged story (designer 2026-11-25, docs/story-merges-2026-11-25.md): ONE builder, ONE full fresh review (≤ 2 narrow re-reviews, then main-session checks). Both parts extend 8.1's seat code in RunRoom (seatKey, members, holds, rememberedSeats, finalLeave/nextHost). Story file 2026-11-25 (gds-create-story, autonomous) from the real code on master 0ee0d6db (8.1 + 8.8/8.9/8.10 done). Epic 8 D1–D15 (docs/ideas/epic-8/decisions.md, accepted 2026-11-24) are RULES here. New decisions: docs/epic-8-story-decisions.md (codes J…, H…), recommended values written in. DESIGNER 2026-11-25: all 33 Epic 8 story decisions accepted as recommended (docs/epic-8-story-decisions.md › Designer answers); builder decisions 8.2-B1…8.3-B13 auto-accepted overnight (same file). Ride-along: Spitter deadlock fix A (designer 2026-11-25). -->

## Story

**8.2** As a friend arriving late,
I want to join a run that's already going,
so that I don't have to wait for the next one.

**8.3** As a team,
I want someone else to take over Start and Save if the host goes, and a way to remove a stranger,
so that the run goes on and a leaked link can't ruin it.

> **BRIEF**: paste `docs/epic-7-brief.md` verbatim into the builder and reviewer prompts (it carries the Epic 6 and Network pass lines; Epic 7 is landing at the same time), plus this file, `docs/ideas/epic-8/decisions.md` and `docs/epic-8-story-decisions.md`. Most relevant lines: 2 (every copy of new state fields: `waiting`, `hostSlot` toast, `removed`), 3/4 (fairness first, beat the rule), 9 (lag, hidden tab, a reconnect across a join), 11 (`this.net.guard`, `ServerError(526)` only for join refusals), 15 [NP 18] (the server decides who may join and with what money), 17 [NP 21] (a drop is not a leave), 18 (banked once), 27 (numbers below), R1–R3, R8.

## Acceptance Criteria

### Fairness / player-visible rules (brief 3; each is a test)

- **J1 "Late is welcome, not rich."** A late joiner with no seat in this run starts with a Pistol and **max(own start money, 100 + ⌊0.6 × team average `earned`⌋)** — own start money is `economy.json › startingWallet` (+ Story 7.5 Training start money when it has landed) — so arriving in the first build phase never gives less than a normal start, and arriving at wave 9 (team average ≈ 2,170 earned) gives ≈ 1,400, still behind the others (FR72, D7, decisions E8-J1, E8-J2).
- **J2 "Quitting and rejoining never pays."** A player whose seat is held or remembered (8.1) always gets **their own seat** back, never late-joiner money — also after a consented Leave (8.1 F8), also with a new tab or reloaded page (same `seatKey`), also after the 120 s ran out (D4).
- **J3 "A late join never steals a teammate's seat."** A late joiner never takes the slot (and so the player id `p<slot>`, the building cap count and the turret pay) of a held or remembered seat. If every free slot belongs to one, the join is refused with "This run is full" (decision E8-J3); the host can free a remembered seat with Remove (H3).
- **J4 "Mid-wave, you watch."** During a wave (and the evacuation vote) a late joiner is connected and watches the fight ("Wave in progress, you'll join at the next build phase"), is not in the World (not a target, not counted for wave size, the wipe check, the vote or the freeze), and enters the World at the next `build.started` (D6).
- **J5 "A join buys shopping time, once."** The first late join in a build phase adds **+15 s** to the build timer; later joins in the same build phase add nothing; a rejoining own seat adds nothing (D6, decision E8-J4).
- **J6 "The next wave is sized for who is here."** The wave after a join uses the new seat count (`waveDirector.ts:376`: present + held), exactly like a lobby start with that many players (FR31). A watching joiner (J4) is not counted until they enter.
- **J7 "Supplies count only the waves I was in."** A late joiner's `wavesIn`/`bossesIn` counters (Story 7.2) start at 0 (`addPlayer` defaults); a returning own seat keeps its counters.
- **H1 "There is always someone to press Start and Save."** When the host drops, goes quiet (held) or leaves, `hostSlot` moves **at once** to the longest-connected **connected** member, who sees "You are now the host"; it does not move back when the old host returns (FR74, D8). "Longest-connected" counts from a seat's last return: a held seat that returns becomes the newest (decision E8-H1).
- **H2 "Only the host can remove, only when nobody is fighting."** Remove exists only for the host, in the lobby and in build phases, with a confirm; never on yourself; never during a wave or vote (D9).
- **H3 "Removed means gone for this room."** A removed player is disconnected with "You were removed from this run", their seat is dropped (not held, not remembered: no stuff to come back to), and their `seatKey` can't join this room again (lobby or any later run of the room; decision E8-H2). Their buildings stay, are repairable and pay nobody, and stop counting as anyone's (`ownerId` cleared, decision E8-H3). Removing a held or remembered seat frees its slot the same way.

### Behaviour (numbers are tests)

1. **Build-phase join, new seat** (FR72, D6, D7). `RunRoom.join()` (`RunRoom.ts:374-382` today: a started run takes back only its own seats, else `run_started`) gains: phase `build`, no member/hold/remembered seat for this `seatKey`, not banned (H3), fewer than `MAX_PLAYERS` seats taken (members + holds + remembered seats) and a free slot by J3 → a **new seat**: `assignSlot` over every taken slot (members, holds, remembered seats' slots), `RunController.addLatePlayer(playerId, slot, wallet)` (new: `addPlayer` at `teamSpawnPoint(slot)` → `findFreeSpotNear` if blocked, `rewindMaxTicks` as in the constructor `RunController.ts:353`, a new `PlayerSlot` inserted in order, the shop stream keyed `shop:<slot>:<buildPhaseIndex>` (`seedStreams.ts`) drawn on demand by `ensureOffer`), the schema `PlayerState`, `hordeStats`, `attachClient`, `syncState`, `sendOffer`. Log `player_joined_mid_run {playerId, slot, wave, wallet, avgEarned}`.
2. **The money** (J1). `lateJoinWallet(seats, balance, ownStart)` in `packages/shared/src/economy/lateJoin.ts` (pure): `max(ownStart, lateJoin.base + floor(lateJoin.avgShare × avg))`, `avg` = mean `earned` over the seats present in the World + held (decision E8-J2; remembered seats and the joiner excluded; no seat → 0). `economy.json` gains `lateJoin: { base: 100, avgShare: 0.6, extraBuildS: 15 }` (balance version bump). Test table: avg 0 → 200; avg 900 (≈ wave 5) → 640; avg 2,170 (≈ wave 9) → 1,402; avg 200 → 220 (> 200). `?wallet`/`DEV_STARTING_WALLET` still set the exact number (dev wins, like 7.5).
3. **+15 s** (J5, decision E8-J4). `addBuildTime(world, ticks)` (shared, `runStateMachine.ts`): in phase `build` only, `buildTicksLeft += ticks`, once per build phase (`world.run.joinExtendedBuild` flag, cleared by `startBuild`; in `snapshotWorld` via `run`, and in 8.4's save). The joiner is not Ready, so `everyoneReady` (`runStateMachine.ts:322`) no longer starts the wave early by itself.
4. **Mid-wave and vote: watch** (J4). A join in `wave` or `vote` with the J-checks passing becomes a **waiting member**: `Member.waiting = true`, a slot reserved, schema `PlayerState { slot, name, waiting: true }` (new schema field; brief 2 copies: `RunState.ts` → `syncState` → stateView key lists → `fakeRoom` → mirror → devThrottle `StateCopy` → `botClient`), horde frames and events as for an out player, **not** in the World. On the next `build.started` (`RunRoom.onTick` event loop, `RunRoom.ts:1085-1095`) every waiting member enters by AC 1 (money computed then, +15 s applied once). The phone shows the spectate view (the out player's camera, `spectateTarget`) with the line **"Wave in progress, you'll join at the next build phase"**, no HUD controls but ☰ (Leave). A waiting member who leaves just frees the reserved slot. A run that ends while they wait shows them Results (they played nothing: Supplies 0).
5. **Own seat back** (J2). Unchanged 8.1 paths come first in `join()`: a member with the same `seatKey` → `takeOver`; a remembered seat → `restoreRemembered` (build phase, own slot free) or `seat_kept` (the phone retries). A remembered seat that comes back mid-wave keeps getting `seat_kept` (8.1 D4: back at a build phase) — it does **not** become a waiting member (decision E8-J5).
6. **Refusals** (`JoinRefusal`, `messages.ts:127`). New `run_full` ("This run is full", J3 / 4 seats) and `removed` ("You were removed from this run", H3); `run_started` stays only for phase `results` ("This run is ending, try again in a moment"); client texts in `net/joinErrors.ts` + `recoveryFailure` (`connection.ts:89-96`: both new reasons are "gone").
7. **Client late start.** A join into a started run goes straight to the Game scene through 8.1's late-scene-start path (the takeover/reload path in `onlineFlow`/`NetSimHost`), never via the lobby screen; the build-phase HUD shows the new wallet and the extended timer from the first patch.
8. **Host moves on hold** (H1, D8). `startHold` (`RunRoom.ts:497`) and `finalLeave` (`RunRoom.ts:638`) call one `moveHostIfGone()`: if the host's member is held, gone or waiting, `hostSlot` ← `nextHost` over **connected, non-waiting** members (a filter before `nextHost`, `lobby.ts:43-47`); if none, it stays (everyone is held: the room is frozen anyway, the first one back becomes host by the same rule). `endHold` sets the returning member's `joinOrder = ++joinCounter` (decision E8-H1). Log `host_changed {playerId, slot, why: "left"|"held"|"removed"}`.
9. **"You are now the host"** (H1). The client shows the toast once when `hostSlot` changes to its own slot after the first patch (never on the first patch, never for a lobby creator), in the lobby (`LobbyScreen.tsx`) and in a run (`toastQueue.ts` via `GameScene.toasts`). Pure model `hostToast(prevHostSlot, hostSlot, mySlot, firstPatch)` with tests; wiring test (R2).
10. **Remove** (H2, H3, D9). `C2S.HOST_REMOVE { playerId }` (zod strict, `this.net.guard`, "other" bucket). Server: sender is the host's member, phase `lobby` or `build`, target is not the sender and is a member (connected, held or waiting) or a remembered seat → `removeSeat(target)`: add its `seatKey` to `bannedSeats` (room lifetime), send `S2C.PLAYER_REMOVED` to the target socket, close it with **4022** (`CLOSE_REMOVED`, `net/limits.ts`, next to 4020/4021; never 4000), then the leave path **without** remembering the seat: `controller.removePlayer`, `disownBuildings(world, playerId)` (shared, `buildings.ts`: `ownerId` → `""`, `version++`), schema delete, `PLAYER_LEFT { reason: "removed" }` (new `PlayerLeftReason`), host move if needed, freeze update. A pending 8.1 reconnection is rejected. Anything else is ignored and logged `remove_refused {reason}`. Story 7.2 (when on master): the removed seat banks like a Leave ("quit", decision E8-H4).
11. **Remove UI** (H2). Lobby: a "Remove" button on each other player's row for the host (`LobbyScreen.tsx`), confirm "Remove <name> from this run? They can't come back." (danger + Cancel, the `confirmLeave` pattern). Build phase: ☰ menu → "Players" (host only, `menuItems.ts` `visible: (c) => c.online && c.isHost`) lists the other seats (connected, reconnecting, left = remembered) with Remove + the same confirm; greyed with "You can remove players in the build phase" during a wave/vote. Every button ≥ 44 px, in the ONE layout test (R9) at 568×320, 640×360, 800×360, 844×390.
12. **The removed phone** shows "You were removed from this run" with **OK** (back to the start screen), does not reconnect (close 4022 is terminal in `linkMonitor`/`connection.ts`), and a fresh join with the same guest token is refused `removed`.
13. **Banking top-up** (Story 7.2 × 8.1 × J2; waits for 7.2 on master, T9). A seat that banked on a consented Leave and later rejoins (remembered seat) banks again at the run end the **difference** (`progressRepo.addSupplies`: inside the same transaction, the existing `run_rewards` row is raised to the new total and only `new − already` (≥ 0) is added; decision E8-J6), so leaving at wave 3 and coming back for waves 4–10 pays waves 1–10 once.

## Tasks / Subtasks

- [x] **T1 Fairness tests first** (J1–J7, H1–H3): `apps/server/src/rooms/RunRoom.latejoin.test.ts`, `RunRoom.host.test.ts`, `packages/shared/src/economy/lateJoin.test.ts` — written red before T2–T8 (brief 3). → `RunRoom.latejoin.test.ts` (12 tests: "Story 8.2 J1…J7", "AC 4"), `RunRoom.host.test.ts` (12 tests: "Story 8.3 H1/H2/H3"), `economy/lateJoin.test.ts` > "the AC 2 table: avg 0 → 200, 900 → 640, 2,170 → 1,402, 200 → 220". Each rule mutated once: 10 room mutations, all caught (Completion Notes).
- [x] **T2 Late-join money and build time** (AC 2, 3): … → `packages/shared/src/economy/lateJoin.ts` (`lateJoinWallet`), `economy.json › lateJoin` (balance version = content hash, bumped by the change), `run/runStateMachine.ts › addBuildTime` + `run.joinExtendedBuild` (cleared by `startBuild`; in `snapshotWorld` only once true so older digests stay). Tests: `player/lateJoin.test.ts` > "the first late join of a build adds +15 s; a second adds nothing; …", "the joiner is not Ready, so the others' Ready no longer starts the wave early by itself", "snapshotWorld shows the flag only once set".
- [x] **T3 Controller** (AC 1): → `RunController.addLatePlayer` (shared `player/lateJoin.ts › addLatePlayer`: team spawn point → `findFreeSpotNear` if blocked, wallet, +15 s once; rewind, input slot in order). Tests: `player/lateJoin.test.ts` > "enters at the slot's team spawn point with the given wallet, a Pistol and the counters at 0", "a blocked spawn point → the first free spot round it", "its card offer is drawn on demand from its own stream (shop:<slot>:<n>)", "J6: the next wave is sized for who is here"; replay: "a log with a build-phase join, its inputs and a later remove replays to the same digest; without the join it diverges" (new replay kinds `join`, `remove`).
- [x] **T4 Room join paths** (AC 1, 4, 5, 6): → `RunRoom.join` (ban check, own seat first, then `joinLate`), `takenSlots()`, waiting members (`Member.waiting`, `PlayerState.waiting`, start data read off the join: decision 8.2-B1), `enterWaiting` at `build.started`, `run_full` / `removed` / `run_started` (Results only); schema `waiting` + every brief-2 copy (RunState → syncState reset → `PLAYER_STATE_FIELDS` → fakeRoom → devThrottle via the key list → NetSimHost mirror → botClient). Tests: `RunRoom.latejoin.test.ts` (all), `RunRoom.test.ts` > "Story 8.2: a new player can join a started run (a new seat); on Results the join is refused with run_started", `RunRoom.reconnect.test.ts` > "Story 8.2: a stranger (unknown guest token) gets a NEW seat in a started run, never a teammate's", `RunRoom.account.test.ts` > "review M1: a leaked ticket … (Story 8.2: a new unsaved seat at most)".
- [x] **T5 Host** (AC 8): → `moveHostIfGone(why)` (called by `startHold`, `endHold`, `finalLeave`, `removeSeat`, `enterWaiting`), `lobby.ts › nextConnectedHost`, `endHold` sets `joinOrder = ++joinCounter` (E8-H1). Tests: `lobby.test.ts` > "nextConnectedHost (Story 8.3 H1)"; `RunRoom.host.test.ts` > "the host drops mid-run → the role moves AT ONCE …", "E8-H1: a seat back from a hold counts as newly connected …", "the old host back after the move can't Remove".
- [x] **T6 Remove, server** (AC 10): → `RunRoom.onHostRemove`, `removeSeat`, `removeRemembered`, `bannedSeats`; `CLOSE_REMOVED = 4022` (shared `net/reconnect.ts`, re-exported by `net/limits.ts`); shared `disownBuildings` (+ `syncState` now copies an owner change; the client mirror too). Tests: `RunRoom.host.test.ts` > "refused: a non-host, yourself, an unknown id, a wave, the vote", "a malformed payload is dropped by the guard", "build phase: the target gets player.removed + close 4022; …", "E8-H4: a seat removed mid-run banks like a Leave", "lobby: the removed player can't rejoin …", "removing a HELD seat frees its slot …", "removing a REMEMBERED seat frees its slot the same way", "removing a waiting late joiner …"; `player/lateJoin.test.ts` > "disownBuildings … clears the owner: the cap counts nothing, kills pay nobody, the buildings stay".
- [x] **T7 Client** (AC 4, 6, 7, 9, 11, 12): → `net/joinErrors.ts`, `net/connection.ts` (`recoveryFailure`, `watchLobby` + waiting/held/leftSeats), `net/lobbyStore.ts` (4022 / `player.removed` terminal, `remove()`, `left` from `state.leftSeats`, decision 8.3-B6), `ui/LobbyScreen.tsx` (Remove ✕ + confirm), `ui/menuItems.ts` + `ui/uiState.ts` (`players`, `confirmRemove`) + `ui/InRunMenu.tsx`, `ui/waitingView.ts` (+ "Joining…" in a build), `ui/hostToast.ts`, `scenes/toastQueue.ts` ("<name> was removed"), `GameScene`/`HudScene` (`watching`: only ☰), `sim/NetSimHost.ts` (waiting players: no body, no input), `main.ts` + `ui/ServerNotice.tsx` (removed + OK). Tests: `net/joinErrors.test.ts`, `net/recoveryFailure.test.ts`, `net/lobbyLost.test.ts` > "a 4022 close is `removed` …", `net/lobbyStore.reconnect.test.ts` > "Story 8.3 (AC 12): removed mid-run (4022) …", `net/lobbyStore.test.ts` > "parseLeftSeats (Story 8.3 AC 11)", "Story 8.2 (AC 7): a NEW seat joining a started run reports the build phase …", `ui/hostToast.test.ts`, `ui/waitingView.test.ts`, `ui/uiState.test.ts` > "Story 8.3: Players → Remove asks first; …", `ui/menuItems.test.ts`, `ui/lobbyLayout.test.ts` (Remove rect ≥ 44 px), wiring `tools/checks/lateJoinHostWiring.test.ts` (R2), layout `tools/checks/playersMenuDomLayout.test.ts` (568×320, 640×360, 800×360, 844×390; decision 8.3-B13).
- [x] **T8 Bots and tools**: → `tools/bots/botClient.ts` (a waiting bot sends nothing; logs `bot_waiting` / `bot_entered`), `npm run bots -- --late-bot N --late-at W [--late-mid W]` (`tools/bots/run.ts`). Liveness: `tools/bots/lateJoin.test.ts` > "a bot joins at a build phase and plays; a bot joining mid-wave waits, enters at the next build phase, then shoots" (mutated once: the bot's waiting branch off → fails).
- [x] **T9 Banking top-up (after 7.2 is on master)** (AC 13, J7): 7.2 is on master → `progressRepo.addSupplies(…, topUp)` (row raised, only `new − already` paid; decision 8.2-B3), `RunBank.reopen` (a remembered seat that comes back), removed seat banks "quit" (`bankLeaver`). Tests: `db/runRewards.test.ts` > "Story 8.2 (AC 13, E8-J6): a top-up raises the run's row to the new total …", "Story 8.2 (brief 18): a concurrent double-submit of one top-up pays the difference once"; `RunRoom.rewards.test.ts` > "Story 8.2 (AC 13, E8-J6; replaces 7.2 B5): Leave mid-wave … run end: one row, raised to the whole run (top-up)". `realPostgres.test.ts` concurrent case not added (needs a real PostgreSQL; PGlite case above).
- [x] **T10 Gate** (R6): see the Gate line. Smoke: `tools/netaudit/smokeLateJoin.cjs` (3 tabs, real server, `?lag=150&jitter=20&loss=1`; report `docs/perf/smoke-8-2-3/`).

## Dev Notes

### Current state (read before changing; master 0ee0d6db)

- **Joins:** `RunRoom.join()` (`RunRoom.ts:371-410`): `seatKey(auth)` (`lobby.ts`, `guest:<hash>`; Story 7.1 makes it `acct:<id>` and adds `sameSeat` — on branch story-7-1, not on master yet: if 7.1 lands first, match seats with `sameSeat`, never compare keys by hand). Started run: member with the key → `takeOver` (`:443`), remembered seat → `restoreRemembered` (`:470`, build phase + own slot free, else `seat_kept`), else `run_started`. Lobby: `already_joined`, `assignSlot` over members only, first member is host.
- **maxClients:** `MAX_PLAYERS` in the lobby, `MAX_PLAYERS * 2` in a run (`startRun`, `:1043`) for takeovers/reconnects; the 4-seat limit is enforced in `join()` (keep it there: J3 counts holds and remembered seats).
- **Host:** only `finalLeave` moves it (`:663-668`, `nextHost` over all members = held ones too). `restoreRemembered` already gives the newest `joinOrder` (`:484`, "the host role never moves back"). No client notice exists (no toast).
- **Seat state:** `RememberedSeat` (`RunRoom.ts:160-170`) holds the whole `PlayerState`, kills, `buildIdx`. `holds` by player id; `rememberedSeats` by `seatKey`. Turret pay: `economy.ts:82` pays `world.players.get(ownerId) ?? heldPlayers…` — so a new player with an old id **would** be paid by the old turrets: J3 and `disownBuildings` exist for this. `ownerId` is `readonly string` (`buildings.ts:33`); `ownedCount` (`:179`) counts the cap by it.
- **Wave size:** `waveDirector.ts:365-380` counts `world.players` + `heldPlayers` at wave start (8.1 H3). Boss HP counts the same at arrival (`behemoth.ts:182`).
- **Shop streams:** `shop:<slot>:<buildPhaseIndex>` (`seedStreams.ts`), `buildPhaseIndex = waves.number`, so a joiner's first offer is reproducible and independent of teammates; `drawAllOffers` runs at `startBuild` for present players only, a late joiner's is drawn by `ensureOffer` on `sendOffer`.
- **Build timer:** `updateRun` (`runStateMachine.ts:307-330`): build ends when everyone is Ready or `buildTicksLeft` hits 0.
- **Client:** start screen `ui/StartScreen.tsx`; lobby `ui/LobbyScreen.tsx` (rows from `lobbyView`, "Host" tag, Start only for the host); in-run menu `ui/InRunMenu.tsx` + `ui/menuItems.ts` (its comment already plans Save and quit with `visible: (c) => c.online && c.isHost`; `MenuContext { online, isHost }`), `ui/uiState.ts` (`closed | open | confirmLeave`); held chips/toasts `ui/ConnectionOverlay.tsx` + `ui/connectionModel.ts`; HUD toasts `scenes/toastQueue.ts`.
- **Guard:** `MessageGuard.guard(schema, handler, bucket)`; "other" bucket 10/s (`net/limits.ts`).

### Developer guidance

- One function decides "taken slots" (members ∪ holds ∪ remembered); every join path and `assignSlot` call uses it.
- A waiting member is a `Member` (so close codes, takeover and the guard work) but has no World player; grep every `this.members` loop for code that assumes a World player (ping, RTT `setRtt`, `holdQuietPlayers` callbacks, vote silence, freeze `activeCount`). Do not hold a waiting member on a drop: a drop frees the reservation (nothing to keep).
- Never compute late money on the client; the client shows the wallet from the patch.
- The World changes (late `addPlayer`, `addBuildTime`, `disownBuildings`): replays stay deterministic because joins happen between ticks like 8.1's holds; add one replay test with a mid-run join (brief 5).

### Beat the rule (reviewer start list; brief 4)

1. Leave → rejoin as "new" for fresh money (same tab; cleared `sessionStorage`; reloaded page; new tab with the same guest token). Expect own seat (J2).
2. Clear site data (new guest token) and rejoin as a stranger: gets J1 money, but **a new slot**; the old seat stays remembered (J3). Can the same person now hold two seats? (Yes, as two players: accepted, they are two phones' worth of play; the old seat's slot stays reserved.)
3. Join at the last build tick for +15 s every build (one join per build max; a rejoining own seat adds nothing; a remove + new join by the host's friend: the flag stops a second +15 s).
4. Join mid-wave to dodge the wave and still get Supplies for it (J4, J7).
5. Join mid-wave to make the wave or boss smaller/bigger (J6: counted only from the next wave; boss HP at arrival unaffected by a waiting member).
6. Host removes a teammate mid-wave to save themselves (refused: H2), or removes a held teammate in a build to grab their slot for a friend (allowed, by design H3; logged).
7. A non-host sends `HOST_REMOVE` from a modified client; the host removes themselves; removes an unknown id; floods removes (guard bucket).
8. A removed player comes back with a new guest token (gets in as a stranger: accepted, E8-H2 alternative noted; the host removes again).
9. The host drops: someone else becomes host; the old host returns and taps Start/Remove (refused, not host); both tabs of a takeover.
10. Everyone held + one waiting joiner: is the World unfrozen by the waiter? (Must not be: J4.)
11. Two joins at the same tick into the last free slot (one gets `run_full`).
12. A late joiner's turret/building cap with a disowned building on the map.

### Files (expected)

Server: `rooms/RunRoom.ts`, `run/lobby.ts`, `run/RunController.ts`, `net/limits.ts`, `rooms/schema/RunState.ts`, `rooms/schema/syncState.ts`; later T9: `db/progressRepo.ts`, `meta/banking.ts`. Shared: `economy/lateJoin.ts` (new), `run/runStateMachine.ts`, `buildings/buildings.ts`, `net/messages.ts`, `net/stateView.ts`, `config/balance/economy.json`, `config/balanceSchema.ts`. Client: `net/joinErrors.ts`, `net/connection.ts`, `net/linkMonitor.ts`, `net/lobbyStore.ts`, `ui/LobbyScreen.tsx`, `ui/InRunMenu.tsx`, `ui/menuItems.ts`, `ui/uiState.ts`, `ui/ConnectionOverlay.tsx`, `ui/hostToast.ts` (new), `scenes/GameScene.ts` (toast wiring only), `sim/NetSimHost.ts` (late start), tests. Tools: `tools/bots/botClient.ts`, bot flags.

### File overlap and build order

- **Overlaps with 8.7 Pings:** `net/messages.ts` (new C2S/S2C names: append in separate blocks), `RunRoom.onCreate` message list (one line each), `ui/menuItems.ts` no (pings use the HUD), `scenes/hudLayout.test.ts` (both add rects; 8.2+8.3 only adds the waiting mode). Small, mechanical: **8.2+8.3 ∥ 8.7 in parallel**; whoever lands second merges master.
- **Overlaps with Epic 7:** 7.1 changes `seatKey`/`Member`/`RememberedSeat` (`accountId`) and `RunRoom.onAuth/join`; 7.2 adds `RunBank` calls in `finalLeave`/`endRun`. Build on master; if 7.1/7.2 land first, merge master before T4 and T9. T9 needs 7.2.
- **Before 8.4–8.6:** 8.4–8.6 save the new fields (`waiting` members are not saved: they have no seat yet; `bannedSeats` are saved, decision E8-S10) and reuse `lateJoinWallet` for newcomers on resume (D14).
- netEvents kinds (brief 27): **140–144** reserved for this story (none expected: joins and removes are S2C messages). Readability sheet: none.

### Effort and review

- **Effort: L** (≈ 5–7 h for one builder: server join/host/remove ≈ 3 h, client screens ≈ 2 h, bots + smoke + gate ≈ 1.5 h; T9 ≈ +1 h when 7.2 is there).
- **Review: full** (three layers + beat the rule): join money, seat theft and kick are exploitable rules.

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 8.2, Story 8.3; FR31, FR72, FR74.
- `docs/ideas/epic-8/decisions.md` D4, D6, D7, D8, D9 (+ abuse table); `docs/epic-8-story-decisions.md` E8-J1…J6, E8-H1…H4.
- `_bmad-output/planning-artifacts/game-architecture.md` › Host (line 558), Run Room Rules.
- `_bmad-output/implementation-artifacts/8-1-reconnect-within-2-minutes.md` (F2, F8, D4/D5, B15–B19); `7-1-progress-saved-on-the-server.md` (T6 `seatKey`/`sameSeat`); `7-2-earn-and-bank-supplies.md` (S2, S3, line 77: "a late joiner's counters start at 0").
- `docs/epic-7-story-decisions-progress.md` line 141 (Training start money and the late joiner → E8-J1).

## Dev Agent Record

### Agent Model Used

Claude (gds-dev-story, autonomous overnight run, 2026-11-25). The client part (T7) was built by a forked agent in the same tree and reviewed/adjusted by the builder.

### Gate

Gate 2026-11-25: tree `48316a9` (branch story-8-2-3 with master `06e8356` merged in `ecc022f`): `npm run typecheck` ✓, `npm run lint` ✓, `npm test` ✓ (529 files passed / 4 skipped; 4,772 tests passed / 31 skipped), `npm run build` ✓, `REQUIRE_DIST=1 npx vitest run tools/checks/noCheatsInRelease.test.ts` ✓ (3/3). Load 2.1 → 4.4 (4 cores) over the 9.5 min gate. The first gate run at `ecc022f` failed 17 tests in 3 files (run-state shape, the Players layout harness, wireCover seed 3); fixed in `48316a9` and the whole gate rerun.

Review-fix gate 2026-11-25 (new process, PR #10): head `f5f45977` (master `9bbc612f`+ merged): `npm run gate:fast` ✓ (typecheck, lint, test:fast 462 files / 4,484 tests passed, release:check incl. noCheatsInRelease ✓); the slow files touched: RunRoom latejoin/host/rewards/reconnect/test/account + tools/bots + playersMenuDomLayout ✓ (11 files, 140 tests). PR #9 CI on `f5f45977`: all 8 checks green (gate, static, release, docker, test shards 1–4).

### Debug Log References

- Spitter fix test first failed for a test reason (the build-start heal reset the camper's HP to 100 → a wipe); fixed by setting HP after the wave starts.
- `RunRoom.reconnect.test.ts` › "a quiet seat that then drops keeps its 120 s clock" and "solo drop mid-wave: the World stops…" time out at 5 s on this container also on untouched `origin/master` (checked in a separate worktree) while other heavy work runs; see the Gate line for the final run.
- Old-rule tests updated (the rule changed, not the code under them): `RunRoom.test.ts` (run_started → a new seat; run_started only on Results), `RunRoom.reconnect.test.ts` (a stranger gets a new seat), `RunRoom.account.test.ts` ×2 (a leaked ticket / another account gets a NEW unsaved / own seat, never the account's), `RunRoom.rewards.test.ts` (7.2 B5 "banked once" → E8-J6 top-up), `tools/checks/metaWiring.test.ts` (the bank call gains the top-up flag).
- Smoke harness: the Epic 7 Lumen lobby renamed its buttons (`.lobby__btn`, `.lobby__start`); the 8.1 `smokeReconnect.cjs` still uses the old selectors (not changed here: note for whoever runs it next).

### Completion Notes List

- **8.2 join mid-run.** A started run takes back own seats first (J2: takeover, remembered seat; E8-J5 unchanged), then `joinLate`: Results → `run_started`; no free slot by `takenSlots()` (members + held + remembered) → `run_full` (J3); else a waiting member with a reserved slot, its unlocks/Training read off the join (8.2-B1). It enters the World in a build phase (`enterWaiting`: at once in a build once loaded, else at `build.started`), money `lateJoinWallet` computed then (J1, E8-J2; dev `DEV_STARTING_WALLET` exact), +15 s once per build (J5, E8-J4), counters at 0 (J7), the next wave sized for it (J6). Mid-wave / vote it watches (J4): `PlayerState.waiting`, horde frames from its spectate view, not in the World, never host, a drop frees the slot; only waiting members left → Results (8.2-B2). Log lines `player_waiting`, `player_joined_mid_run {playerId, slot, wave, wallet, avgEarned}`.
- **8.3 host and Remove.** `moveHostIfGone` moves `hostSlot` at once on a hold (drop or quiet), a leave, a remove, to the longest-connected connected non-waiting member; a return gets the newest `joinOrder` (E8-H1); never moves back. `host.remove` (strict zod, guard "other" bucket): host only, lobby/build only, never self; the target (member: connected/held/waiting, or a remembered seat) is banned for the room (seat key or guest token, 8.3-B9), told `player.removed`, closed 4022, not held or remembered, banks `quit` mid-run (E8-H4), its buildings disowned (E8-H3). Remembered seats are listed for the host through `state.leftSeats` (8.3-B6).
- **Top-up (T9, E8-J6).** `RunBank.reopen` on a restored remembered seat; `addSupplies(…, topUp)` raises the row and pays only the difference, in the same transaction (8.2-B3).
- **Client.** Join texts, 4022 / `player.removed` terminal with "You were removed from this run" + OK, lobby ✕ Remove + confirm, ☰ → Players (connected / reconnecting / joins at the build phase / left the run) with Remove + confirm (greyed in a wave/vote), waiting line ("Joining…" in a build), HUD shows only ☰ while waiting (8.2-B11), "You are now the host" toast (lobby + run), "<name> was removed" toast.
- **Spitter deadlock fix A** (ride-along, designer 2026-11-25; `docs/investigations/cut-test-stall-2026-11-25.md`): `spit.ts › allRemainingHoldingSpitters` + the wave director's rush check. Acid/bullet rules unchanged. Test `packages/shared/src/zombies/spitterDeadlock.test.ts` (4 tests). Mutations: rush check off → "the rush starts at once with 6 left … and the wave ends" fails; "holding" check dropped → "only HOLDING Spitters count" fails; the first loop's type check → `continue` survives (equivalent: the second loop rejects non-Spitters too; kept as an early exit).
- **Mutations (brief 9 / R1), room tests:** M1 money ignores the average (3 fail), M2 remembered slots not taken (1), M3 waiting joiner enters mid-wave (5), M4 +15 s every join (1), M5 host not moved on hold (3), M6 joinOrder kept on return (1), M7 no ban (3), M8 buildings not disowned (1), M9 remove allowed in a wave (1), M10 own seat via joinLate (2): 10/10 caught. Bot liveness: the bot's waiting branch off → fails.
- **Numbers (brief 27):** netEvents kinds 140–144 reserved, none used (joins and removes are S2C messages: `player.removed`, and C2S `host.remove`). Close code 4022. No readability-sheet items. No migration. Balance: `economy.json › lateJoin` (the version is the content hash: it changed).
- **Bandwidth:** `waiting` (1 bool per player, on change), `leftSeats` (a short string on a leave/rejoin/remove), `owner` on a disown: ≈ 0 B/s added. A waiting phone gets the normal horde stream (as an out player).
- **Smoke (T10, brief R10):** `tools/netaudit/smokeLateJoin.cjs`, 3 headless tabs, real server, `?lag=150&jitter=20&loss=1`, god-mode net150 (report `docs/perf/smoke-8-2-3/smoke-8-2-3.log` + 6 screenshots): C joined mid-wave 4 → waiting 5.5 s after the click (page load included) with "Wave in progress, you'll join at the next build phase"; entered at the build phase (wallet 214); the host removed C from ☰ → Players → confirm, C showed "You were removed from this run" + OK 13 ms later; the host's tab closed → the other tab was host 268 ms later with "You are now the host". Note: a hidden tab in a BUILD phase is not held (8.1 D1), so it keeps the host role (seen in an earlier smoke run; by design).
- **Not verified:** real phones / iOS Safari / real 4G (brief 23); the GameScene toast and waiting HUD at runtime beyond the smoke screenshots; `realPostgres.test.ts` concurrent top-up (needs a real PostgreSQL; PGlite concurrent case added); the Players / confirm screens are checked by a real-browser layout test, not the canvas HUD layout test (8.3-B13).

### Notes for the merge

- **8.7 (pings, parallel):** `packages/shared/src/net/messages.ts` — my additions are in separate blocks marked `── Story 8.3 (host remove) ──` (C2S `HOST_REMOVE`, S2C `PLAYER_REMOVED`, schema/types at the end); `JoinRefusal` and `PlayerLeftReason` gained values in place. `RunRoom.onCreate`: one line (`C2S.HOST_REMOVE`). `packages/shared/src/index.ts`: one block at the end. `scenes/hudLayout.test.ts` untouched. `GameScene.ts`: status line, `m.watching`, readyButton/buildBar `!m.watching`, host toast lines. `HudScene.ts`: four `!m.watching` conditions + HP/money visibility.
- **Schema / state copies:** `PlayerState.waiting` and `RunState.leftSeats` appended last (RunState.ts → `PLAYER_STATE_FIELDS` / `RUN_STATE_FIELDS` → fakeRoom → devThrottle by key list → NetSimHost mirror → botClient). `syncState` now also copies a building's owner change (disown) and the client mirror follows it.
- **World:** `RunState.joinExtendedBuild` (in `snapshotWorld` only when true: existing goldens unchanged); `Building.ownerId` is no longer `readonly` (only `disownBuildings` and the mirror write it). Replay kinds `join`, `remove`.
- **8.4–8.6:** reuse `lateJoinWallet` for newcomers on resume (E8-R3); save `bannedSeats` (E8-S10, `RunRoom.bannedSeats`); waiting members are not saved (no seat yet); a resumed run's top-up uses `RunBank.reopen` / `addSupplies(…, topUp)`; `run.joinExtendedBuild` rides in `run`.
- **7.2 B5 replaced** by E8-J6 (top-up): `RunRoom.rewards.test.ts` test renamed; the 7.12 loot "banked" mark stays after a rejoin (8.2-B4).
- **Bots:** `--late-bot/--late-at/--late-mid`; a waiting bot sends nothing.
- **Smoke harness:** `tools/netaudit/smokeLateJoin.cjs` (uses the Lumen lobby selectors).

### File List

- `_bmad-output/implementation-artifacts/8-2-3-join-mid-run-and-host-role.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/client/src/main.ts`
- `apps/client/src/net/connection.ts`
- `apps/client/src/net/fakeRoom.ts`
- `apps/client/src/net/joinErrors.test.ts`
- `apps/client/src/net/joinErrors.ts`
- `apps/client/src/net/lobbyLost.test.ts`
- `apps/client/src/net/lobbyStore.reconnect.test.ts`
- `apps/client/src/net/lobbyStore.test.ts`
- `apps/client/src/net/lobbyStore.ts`
- `apps/client/src/net/recoveryFailure.test.ts`
- `apps/client/src/net/serverNotice.ts`
- `apps/client/src/net/session.test.ts`
- `apps/client/src/net/session.ts`
- `apps/client/src/scenes/GameScene.ts`
- `apps/client/src/scenes/HudScene.ts`
- `apps/client/src/scenes/hudModel.ts`
- `apps/client/src/scenes/toastQueue.test.ts`
- `apps/client/src/scenes/toastQueue.ts`
- `apps/client/src/sim/NetSimHost.ts`
- `apps/client/src/ui/InRunMenu.tsx`
- `apps/client/src/ui/LobbyScreen.tsx`
- `apps/client/src/ui/ServerNotice.tsx`
- `apps/client/src/ui/hostToast.test.ts`
- `apps/client/src/ui/hostToast.ts`
- `apps/client/src/ui/lobbyLayout.test.ts`
- `apps/client/src/ui/lobbyLayout.ts`
- `apps/client/src/ui/menuItems.test.ts`
- `apps/client/src/ui/menuItems.ts`
- `apps/client/src/ui/overlay.css`
- `apps/client/src/ui/uiState.test.ts`
- `apps/client/src/ui/uiState.ts`
- `apps/client/src/ui/waitingView.test.ts`
- `apps/client/src/ui/waitingView.ts`
- `apps/server/src/db/progressRepo.ts`
- `apps/server/src/db/runRewards.test.ts`
- `apps/server/src/meta/banking.ts`
- `apps/server/src/net/limits.ts`
- `apps/server/src/rooms/RunRoom.account.test.ts`
- `apps/server/src/rooms/RunRoom.host.test.ts`
- `apps/server/src/rooms/RunRoom.latejoin.test.ts`
- `apps/server/src/rooms/RunRoom.reconnect.test.ts`
- `apps/server/src/rooms/RunRoom.rewards.test.ts`
- `apps/server/src/rooms/RunRoom.test.ts`
- `apps/server/src/rooms/RunRoom.ts`
- `apps/server/src/rooms/schema/RunState.ts`
- `apps/server/src/rooms/schema/syncState.ts`
- `apps/server/src/run/RunController.ts`
- `apps/server/src/run/lobby.test.ts`
- `apps/server/src/run/lobby.ts`
- `docs/epic-8-story-decisions.md`
- `docs/perf/smoke-8-2-3/8-2-C-entered.png`
- `docs/perf/smoke-8-2-3/8-2-C-waiting.png`
- `docs/perf/smoke-8-2-3/8-3-C-removed.png`
- `docs/perf/smoke-8-2-3/8-3-host-confirm.png`
- `docs/perf/smoke-8-2-3/8-3-host-players.png`
- `docs/perf/smoke-8-2-3/8-3-new-host-toast.png`
- `docs/perf/smoke-8-2-3/smoke-8-2-3.log`
- `packages/shared/src/buildings/buildings.ts`
- `packages/shared/src/config/balance/economy.json`
- `packages/shared/src/config/balanceSchema.ts`
- `packages/shared/src/core/worldSnapshot.ts`
- `packages/shared/src/economy/lateJoin.test.ts`
- `packages/shared/src/economy/lateJoin.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/net/messages.ts`
- `packages/shared/src/net/reconnect.ts`
- `packages/shared/src/net/stateView.ts`
- `packages/shared/src/player/lateJoin.test.ts`
- `packages/shared/src/player/lateJoin.ts`
- `packages/shared/src/replay/inputLog.ts`
- `packages/shared/src/run/runStateMachine.test.ts`
- `packages/shared/src/run/runStateMachine.ts`
- `packages/shared/src/waves/waveDirector.ts`
- `packages/shared/src/zombies/spit.ts`
- `packages/shared/src/zombies/spitterDeadlock.test.ts`
- `tools/bots/botClient.ts`
- `tools/bots/lateJoin.test.ts`
- `tools/bots/run.ts`
- `tools/bots/wireCover.test.ts`
- `tools/checks/lateJoinHostWiring.test.ts`
- `tools/checks/metaWiring.test.ts`
- `tools/checks/playersMenuDomLayout.test.ts`
- `tools/netaudit/smokeLateJoin.cjs`

### Review fixes (PR #9, review of f4d4120: 3 H / 6 M / 6 L + nits)

- **H1** reused player id after a Remove: seats have a generation (`Member.seatGen`, kept across takeover/hold/remembered); `RunBank` keys banks, results, deliveries, top-ups and the loot finder by `playerId#seatGen` (`seatIdOf`); a new occupant resets its slot's card offer (`shop.build[slot] = −1`) and its loot "banked" mark (shared `addLatePlayer`). Tests: `RunRoom.rewards.test.ts` > "H1: Di is removed, Eve joins into Di's player id → … Eve banks on HER account and sees HER rewards"; `banking.test.ts` > "H1: two seats with the same player id … bank and deliver separately".
- **H2** top-up: grants against the stored stats (no second delta) and keeps the first bank's loot (never a second item). Test: `runRewards.test.ts` > "review H2: a top-up never grants a second loot item and never adds the stats twice".
- **H3** waiting-only Results → lobby with a host (`onLobbyReturn` → `moveHostIfGone`). Test: `RunRoom.latejoin.test.ts` > "the waiting joiner goes back to the lobby as host and can Start".
- **M1** top-up rookie sees the lifetime before this run; with no Supplies difference new items/districts are still granted. Test: `runRewards.test.ts` > "review M1: …".
- **M2** a still-waiting member gets a zero `not_saved` result at the run end (`RunBank.nothingFor`). Test: `RunRoom.rewards.test.ts` > "M2: …".
- **M3** a held/remembered seat that was removed: recovery answer `removed` → `onLost("removed")`; a reload shows the removed notice. Tests: `reconnect.test.ts` > "Story 8.3 review M3: removed stops at once and says so", `lobbyStore.reconnect.test.ts` > "Story 8.3 review M3: a held seat the host removed …", `recoveryFailure.test.ts`, wiring `lateJoinHostWiring.test.ts` (resumeSavedSeat).
- **M4** the late-join average is computed once before the enter loop. Test: `RunRoom.latejoin.test.ts` > "both get the money from the team's average before either entered (avg 900 → 640 each), and one offer each".
- **M5** the host is a seat (`hostKeyOf`: playerId + joinOrder); `restoreRemembered` ends with `moveHostIfGone("returned")` + `updateFreeze()`; the Remove check uses the host seat. Test: `RunRoom.host.test.ts` > "review M5: the old host leaves while the only teammate is held, then comes back into the same slot: host_changed, never silently".
- **M6** accepted risk → decision 8.3-B14 (no code).
- **L1** bank generation per seat (a stale in-flight Leave result after `reopen` is never delivered). Test: `banking.test.ts` > "L1: …".
- **L2** the replay `join` carries unlocks/Training. Test: `player/lateJoin.test.ts` > "a join command with unlocks + Training replays a survivor with them".
- **L3** `run.joinPending` holds the all-Ready early start while a build-phase join loads (timer runs; out of `snapshotWorld` while false). Tests: `player/lateJoin.test.ts` > "everyone Ready + joinPending → …", `RunRoom.latejoin.test.ts` > "Ana Ready while Bo's start data loads → …" (mutated: fails).
- **L4** kept (decision 8.2-B16).
- **L5** fix A after an 8 s stand-off, sampled every 10 ticks (decision 8.2-B15; `waves.json › spitterStall`; `WaveState.spitterStallSinceTick`, out of `snapshotWorld` while −1). Tests: `spitterDeadlock.test.ts` > "review L5: the rush waits for the stand-off to last … not after 7 s, yes by 9 s", "… a brief all-holding moment broken by a walker starts the 8 s over" (mutated: both fail).
- **L6** CI (PR #10) now fails shard 1 when a `*DomLayout.test.ts` browser test skips (`tools/ci/check-browser-ran.mjs`), so no env flag here; new case "Players list with a seat that left".
- **Nits:** queued > 0 never rushes (test "nit: zombies still queued …"); the build-start offer is sent once (the M4 test checks one offer each); `enterWaiting` no longer moves the host (no `host_changed` there); stale comments fixed (`startRun` maxClients, `recoveryFailure`); `player.left` goes to everyone except the removed phone; a late joiner's look is checked against its owned parts once they load.
- Test leak (pre-existing, found by H1's test): `RunRoom.rewards.test.ts` "database down" restored the room accounts without `checkTicketRows: false`, so later ticketed joins lost their account.
- Mutations of the fixes: H1, H2 (×2), M1, H3, M2, M5, L1, L3, L5: each fails its test.

### Change Log

- 2026-11-25: PR #9 review fixes (H1–H3, M1–M5, L1–L6, nits; decisions 8.3-B14, 8.2-B15, 8.2-B16).
- 2026-11-25: Story 8.2+8.3 built (join mid-run, waiting, late money, +15 s, host move, Remove, bans, disown, top-up, client UI, bots, smoke) + Spitter deadlock fix A; designer accepted all 33 Epic 8 decisions; builder decisions 8.2-B1…8.3-B13 auto-accepted overnight. Status → review.
