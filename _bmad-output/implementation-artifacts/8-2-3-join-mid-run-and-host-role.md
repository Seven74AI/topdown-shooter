---
baseline_commit: 0ee0d6db
---

# Story 8.2+8.3 (merged): Join mid-run at a build phase · Host role and removing a player

Status: ready-for-dev

<!-- Merged story (designer 2026-11-25, docs/story-merges-2026-11-25.md): ONE builder, ONE full fresh review (≤ 2 narrow re-reviews, then main-session checks). Both parts extend 8.1's seat code in RunRoom (seatKey, members, holds, rememberedSeats, finalLeave/nextHost). Story file 2026-11-25 (gds-create-story, autonomous) from the real code on master 0ee0d6db (8.1 + 8.8/8.9/8.10 done). Epic 8 D1–D15 (docs/ideas/epic-8/decisions.md, accepted 2026-11-24) are RULES here. New decisions: docs/epic-8-story-decisions.md (codes J…, H…), recommended values written in, "recommended, to accept". -->

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

- [ ] **T1 Fairness tests first** (J1–J7, H1–H3): `apps/server/src/rooms/RunRoom.latejoin.test.ts`, `RunRoom.host.test.ts`, `packages/shared/src/economy/lateJoin.test.ts` — written red before T2–T8 (brief 3).
- [ ] **T2 Late-join money and build time** (AC 2, 3): `packages/shared/src/economy/lateJoin.ts`, `config/balance/economy.json` (+ `balanceSchema.ts`, version bump), `run/runStateMachine.ts` (`addBuildTime`, `run.joinExtendedBuild`), `core/worldSnapshot.ts` (rides in `run`).
- [ ] **T3 Controller** (AC 1): `apps/server/src/run/RunController.ts` `addLatePlayer(playerId, slot, wallet)`; test in `RunController.test.ts` (offer drawn from `shop:<slot>:<n>`, wave size next wave, counters 0).
- [ ] **T4 Room join paths** (AC 1, 4, 5, 6): `apps/server/src/rooms/RunRoom.ts` `join()` (+ `takenSlots()`: members, holds, remembered), waiting members entering at `build.started`, `bannedSeats`; `run/lobby.ts` `Member.waiting`; `packages/shared/src/net/messages.ts` (`run_full`, `removed`, `PlayerLeftReason "removed"`, `HOST_REMOVE`, `PLAYER_REMOVED`); `rooms/schema/RunState.ts` + `syncState.ts` (`waiting`), every brief-2 copy.
- [ ] **T5 Host** (AC 8): `moveHostIfGone()` in `RunRoom.ts`; `nextHost` filter in `lobby.ts` (+ `lobby.test.ts`); `endHold` re-order.
- [ ] **T6 Remove, server** (AC 10): `RunRoom.onHostRemove`, `removeSeat`; `net/limits.ts` `CLOSE_REMOVED = 4022`; `packages/shared/src/buildings/buildings.ts` `disownBuildings` (+ test: cap count, turret pay goes nowhere, owner mark draws neutral).
- [ ] **T7 Client** (AC 4, 6, 7, 9, 11, 12): `net/joinErrors.ts`, `net/connection.ts`, `net/linkMonitor.ts` (4022 terminal), `ui/LobbyScreen.tsx` (+ `lobbyStore.ts` `remove(playerId)`), `ui/menuItems.ts` + `ui/uiState.ts` (`players`, `confirmRemove`) + `ui/InRunMenu.tsx`, waiting view (`connectionModel.ts`-style pure model `waitingView` + `ConnectionOverlay.tsx` line), `scenes/toastQueue.ts` / `GameScene.ts` host toast, `ui/hostToast.ts` (pure); `scenes/hudLayout.test.ts` + menu layout test.
- [ ] **T8 Bots and tools**: `tools/bots/botClient.ts` reads `waiting`; `npm run bots -- --late-bot 3 --late-at 3` (a bot joins at build 3 and one at mid-wave 5) in `tools/bots/` with a liveness test (joined, waited, entered, shot).
- [ ] **T9 Banking top-up (after 7.2 is on master)** (AC 13, J7): `apps/server/src/db/progressRepo.ts` `addSupplies` top-up (PGlite + `realPostgres.test.ts` concurrent case), `apps/server/src/meta/banking.ts` (a rejoined seat may bank twice: second = top-up), removed seat banks "quit". If 7.2 is not on master when T1–T8 are done: ship without T9 and leave it as the first task of 8.4–8.6 (say so in the hand-back).
- [ ] **T10 Gate** (R6): typecheck, lint, test, build on the branch merged with current master; "Gate" line in the Dev Agent Record; `tools/netaudit/smokeReconnect.cjs`-style two-tab smoke with a late third tab joining mid-wave on `?lag=150&jitter=20&loss=1` (brief R10).

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

### Gate

### Debug Log References

### Completion Notes List

### File List
