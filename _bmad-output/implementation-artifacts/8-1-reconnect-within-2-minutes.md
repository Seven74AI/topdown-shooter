---
baseline_commit: b0e491a9e10eb5acb73fbbecb7f30aba93ab8172
---

# Story 8.1: Reconnect within 2 minutes

Status: review

<!-- Network pass story 3 of 5 (pulled forward from Epic 8 by the designer 2026-11-24). Story file 2026-11-24 from the real code on master da82847; decisions pending (docs/network-pass-decisions.md). Accepted Epic 8 decisions D1–D5 (docs/ideas/epic-8/decisions.md) are already rules here. -->

## Story

As a player,
I want to get back into the run with my gear if my phone drops the connection,
so that a bad signal doesn't end my night.

> **NETWORK PASS BRIEF** (`docs/network-pass-brief.md`): paste it verbatim into the builder and reviewer prompts. Most relevant here: 2 (every copy of the new hold fields), 3/4, **5 (this story DOES change the World: hold, return, freeze; say how and keep replays deterministic)**, 6 (a bot really dropped and came back), 9 (hidden tab, late scene start, reconnect), 14 (the 8 s cut runs on the lossy line), 18 (the server decides who is held and where they return), **21 (a drop is not a leave; stale inputs are dropped)**, 22 (Epic 6 state must be held too), **23 (iPhone can't be tested here)**, 24 (plain text, never blame).

## Acceptance Criteria

### Fairness / player-visible rule (brief 3; each is a test)

- **F1 "Dropping is never a free revive."** A player who was **downed** when they dropped (or went quiet, D1) counts as **out** for the rest of this wave and comes back at the next build phase like any out player (Epic 8 D2).
- **F2 "Dropping is never a free heal or reload."** On return everything is exactly as held: HP, wallet, earned, weapons and upgrades, gear, consumable count, ammo in the magazine (a reload in progress starts over), card offer and rerolls; a building being carried goes back to the hand (Epic 8 D3).
- **F3 "A dropped teammate can't be hurt and isn't a target, and doesn't save or doom the team."** While held, their survivor is out of the World: zombies, the Behemoth and events don't target it, nothing damages it, and the team-wipe check ignores it (Epic 8 D2). If every connected player is down or out, the team wipes even with a teammate held.
- **F4 "Coming back mid-wave is safe, not an escape."** Mid-wave a returning player appears next to a standing teammate (the 2.8 build-start spot rule: `findFreeSpotNear` the lowest-slot standing teammate), never where they vanished, with **2 s** of spawn protection (can't be hurt, can't shoot; shown blinking) (decision 8.1 D3). In a build phase they appear where they were. **Review M1 / decision 8.1 B15 (auto-accepted overnight):** the teleport + protection happen at most **once per player per wave** and only after a hold of **≥ 3 s** (`player.json › returnMinHoldTicks` 60); any other mid-wave return lands where they vanished (last server position), unprotected. **Decision 8.1 B16:** a dropped body first stays in the World for 3 s mid-wave (standing, hittable, a target) before it vanishes; a return inside those 3 s just plays on in place. **B18:** in a frozen World (solo) the 3-2-1 replaces the protection.
- **F5 "My turret keeps working for me, for 2 minutes."** During the 120 s hold, kills by their turrets/traps pay into the held wallet; after the hold (or after a deliberate Leave) their buildings stay, can be repaired by anyone and pay nobody.
- **F6 "If everybody is gone, the night waits."** When no player is connected, the whole World freezes (zombies, timers, boss, events, build timer) for up to 120 s; the first player back unfreezes it after a visible **3-2-1** (3 s); after 120 s the room closes and the run is **lost** mid-wave or treated as saved in a build phase (Story 8.4's rule; until 8.4 exists: lost) (Epic 8 D5).
- **F7 "Nothing I pressed while offline happens late."** Inputs, shop taps, placements and Ready presses made while the connection was down are dropped, never replayed on return.
- **F8 "My seat is mine for the whole run."** After 120 s the slot is freed but the seat (all their stuff, frozen) is remembered; if they come back at a later **build phase** with a slot free, they get it back (never late-joiner money) (Epic 8 D4).

### Behaviour

1. **Drop → hold** (FR73, D1, D2). `RunRoom.onDrop(client, code)` in the run phases (build, wave and any Epic 6 run phase such as the vote; lobby and results: decision 8.1 D7) calls `this.allowReconnection(client, 120)` and the controller's `holdPlayer(id)`; a consented leave (close code 4000) still goes straight to `onLeave` (today's path, `RunRoom.ts:378-410`). Teammates see a grey chip **"<name> · reconnecting 1:43"** in the team list (counting down from the server's `heldUntilTick`), no body on the map, a toast **"<name> is back"** on return, and **"<name> left"** when the hold runs out.
2. **Quiet player = held** (decision 8.1 D1). A connected player whose inputs stopped for **3 s** (60 ticks without an input: hidden tab, app switch, a dead spot the socket hasn't noticed) is held the same way mid-wave (in a build phase nothing can hurt them: they just stand); when inputs resume on the same socket they return by F4's rule.
3. **Return** (D3). `onReconnect(client)` (or a guest-token takeover, AC 6) calls `returnPlayer(id)`: the held `PlayerState` goes back into `world.players` exactly as it was (F2), placed by F4, the input queue reset to accept the client's next seq (no `seq_gap_suspect` for a legit return), the Predictor on the phone snaps to the server position. The phone gets the full state, events from now on, and a fresh horde frame (8.10 later: a keyframe).
4. **The phone while reconnecting.** "Connection lost, reconnecting…" (decision 8.1 D2: the picture frozen and dimmed, a countdown, a **Leave** button) from the moment the watchdog fires or the socket closes; the SDK's offline queue is off (`room.reconnection.maxEnqueuedMessages = 0`: F7) and `NetSimHost` sends nothing while not connected; on return the run continues in the same Game scene (no scene restart when the SDK reconnected the same `Room` object; a reload uses the late-scene-start path).
5. **No-data watchdog** (network pass AC). If the phone has had **no message of any kind for 3 s** (horde frames arrive 20×/s, so this is never normal), it shows AC 4's screen and closes the socket itself (non-consented) so reconnection starts, even when the browser never reported a close (WebKit 247943).
6. **Matching a returning phone** (network pass AC). First by the SDK's `reconnectionToken` (`client.reconnect(token)`; the token is also kept in `sessionStorage` with the room code, so a reload can use it); if that is refused (the server still thinks the old socket is alive, or the page lost the token), by a fresh `joinById(code)` whose **guest token** (Story 2.3, `guestToken.ts`; hashed on the server) matches a held or still-connected seat: the server closes the old socket (non-consented: no hold restart) and gives the seat to the new connection (decision 8.1 D5). A guest token matching no seat in a started run is refused as today (`run_started`). Story 7.1 adds account matching later.
7. **iOS hung reconnect** (WebKit 308073). If the page was hidden for **> 10 s** and a reconnect attempt has not opened within **5 s**, the page reloads and AC 6 takes it straight back into the held seat (decision 8.1 D6: any browser).
8. **Transport patience** (network pass AC). `WebSocketTransport({ pingInterval: 3000, pingMaxRetries: 4 })` in `apps/server/src/app.ts` (≈ 12–15 s before a silent socket is terminated; today 2 retries ≈ 6–9 s, `WebSocketTransport.mjs:53-54`). With AC 2 the survivor is already safe after 3 s; the transport limit only decides when Colyseus starts its own 120 s clock.
9. **After 120 s** (D4, F8). Colyseus rejects the reconnection and calls `onLeave`: the member and slot are freed, the seat (the held `PlayerState` and their per-run data) moves to `rememberedSeats` keyed by the guest-token hash; a `joinById` with that guest token is accepted **only in a build phase** and only into a free slot, and restores the seat. The phone shows (decision 8.1 D4) "Your seat is kept. You'll rejoin at the next build phase" and joins by itself when the room enters a build phase.
10. **Freeze when nobody is connected** (D5, F6). When the last connected client drops (or goes quiet, AC 2), `RunRoom.onTick` stops stepping the World (the 120 s hold timers are Colyseus wall-clock timers: they keep running); the room sets `state.frozen = true`. The first client back sets `state.resumeIn = 3` → 2 → 1 (room clock, 1 s each), then ticking resumes. The phone shows "Paused: nobody connected" / the 3-2-1. Solo online runs (allowed) get the same rule.
11. **Tests that prove it.**
    - Server unit/integration (`bootTestServer()`): drop mid-wave → held, not targeted, not damaged (a Bloater blast and a Behemoth slam on the held spot hurt nobody), wipe check ignores it; reconnect within 120 s → F2 field by field (a round-trip test over EVERY `PlayerState` / World player field: a new field without hold support fails it, like 8.4's later snapshot test); downed-at-drop → out; turret kill during hold → held wallet; 121 s → left, seat remembered, rejoin at the next build phase restores it; nobody connected → World tick frozen (digest identical across the freeze), 3-2-1, resume.
    - Client: watchdog fires at 3 s of silence with a fake room; stale inputs dropped; token in `sessionStorage`; reload path joins the held seat; Leave during reconnecting = consented leave.
    - **The 8 s cut** (network pass AC): 4 bots on the lossy line (8.8's `lagLine`), wave 3+, one bot's line cut both ways for **8 s** (`--cut-bot 1 --cut-at 30 --cut-for 8`): the bot is back in its seat with its loadout, wallet and HP as at the cut, within **10 s** of the cut ending, and the run continues to the next build phase. Liveness: the cut really happened (server logged `player_held` and `player_returned`).
    - Replay: an input log with a hold/return replays to the same digest (hold and return are recorded room events applied at a tick, brief 5).

## Tasks / Subtasks

- [x] **T1 Shared sim: hold and return** (AC 1–3, F1–F5): in `packages/shared/src/player/player.ts` next to `removePlayer` (line 174): `holdPlayer(world, id)` moves the `PlayerState` from `world.players` to `world.heldPlayers` (new `Map` on `World`, `core/world.ts`), does what `removePlayer` does to the boss threat slot and the flame slot, turns `downed` into `out`, cancels a reload, returns a carried building to the hand (build phase); `returnPlayer(world, id, at)` puts it back (reclaims the flame slot; status `out` stays out until the build start; spawn protection ticks from `balance` → `config/balance/player.json › returnProtectTicks` 40). Every system that iterates `world.players` now ignores held players for free; grep for `players.get(` lookups by owner id (turret/trap/mine pay, kill credit, `buildings.ts`, economy) and make the pay path also find a held owner (F5) and nobody after the hold. `snapshotWorld` includes `heldPlayers`. (tests: `packages/shared/src/player/hold.test.ts` › "covers every field", "a build-phase hold + return keeps every 'kept' field exactly", "a reload in progress starts over", F1 ×2, F3 ×4 incl. Bloater blast + Behemoth slam, F4 ×2, F5, F8, "snapshotWorld lists held players")
- [x] **T2 Controller + quiet rule** (AC 2, 3, 10): `RunController.holdPlayer/returnPlayer/isHeld`, the 60-tick quiet counter per player (no input queued and none applied), input-queue reset on return; `RunController.removePlayer` (line 494) stays the final leave. (tests: `apps/server/src/run/RunController.hold.test.ts` › "D1: … 60 wave ticks is held", "D1: build-phase quiet doesn't count", "F7: inputs sent while held are ignored; the return accepts the client's next seq", "F7: an input whose view is > 2 s behind …", "releaseHeld … restoreSeat keep the kills")
- [x] **T3 Room lifecycle** (AC 1, 6, 8, 9, 10): `RunRoom.onDrop` / `onReconnect` / `onLeave` (keep the 2.11 comment's promise: consented leave → `onLeave` directly); hold fields on `PlayerState` schema (`heldUntilTick` u32, 0 = connected) and `RunState` (`frozen` bool, `resumeIn` u8) through every copy (brief 2: RunState.ts → syncState → stateView key lists → fakeRoom → devThrottle StateCopy → mirror → bots); the guest-token takeover in `join()` (today: `already_joined` refusal at `RunRoom.ts:332` — becomes "take over" in a started run for a held or connected seat with the same hash; lobby keeps the refusal); `rememberedSeats`; `pingMaxRetries: 4` in `app.ts`; logs `player_held {reason: drop|quiet}`, `player_returned {afterMs, via: token|guest}`, `player_hold_expired`, `room_frozen`, `room_resumed`. (tests: `apps/server/src/rooms/RunRoom.reconnect.test.ts` (15) › drop → hold → token return, SDK auto-reconnect same Room, downed → out, lobby drop = leave (D7), consented Leave remembered, takeover of a connected seat (4021), takeover of a held seat, full 4-player takeover, stranger refused, lobby already_joined, hold runs out → seat_kept mid-wave → restored at build, quiet hold + input return, quiet→drop keeps its clock, solo freeze digest + 3-2-1, wipe with a teammate held; `RunRoom.leave.test.ts` › "Story 8.1: a dropped socket mid-run is held"; `tools/checks/reconnectWiring.test.ts` › "the server holds drops, freezes the tick, and uses the patient transport")
- [x] **T4 Horde and events on return**: `HordeEncoder.send` already sends only to `ClientState.JOINED` clients (`hordeEncoder.ts:33-38`, a comment there anticipates this story): check that a reconnected client is JOINED again and gets frames the next tick; events (`sim.events_flushed`) are not replayed for the offline time; ~~the phone resets its event queue on return~~ **(review L6: this sub-item is NOT done — see Not verified 6; the server sends no events to a dropped client, a few queued before the drop may play late)**; `RunInbox` (`session.ts:213`) handlers survive an SDK reconnect of the same `Room` (verify in `node_modules/@colyseus/sdk/build/Room.mjs`). (tests: `RunRoom.reconnect.test.ts` › "the SDK's automatic reconnect (same Room object) …" asserts patches AND horde frames to handlers registered at the join; SDK checked: `Room.mjs` keeps `onMessageHandlers` across `handleReconnection`. Event queue: not reset on return (Not verified 6))
- [x] **T5 Client reconnect** (AC 4–7): `apps/client/src/net/connection.ts` sets `room.reconnection` (enabled, `maxEnqueuedMessages 0`, `minDelay 500`, `maxDelay 3000`, `maxRetries` enough for 120 s; `minUptime` 5000 default means a drop in the first 5 s after joining doesn't auto-reconnect: handle it with the guest-token path) and stores `{ roomId, reconnectionToken }` in `sessionStorage` (`activeRun.ts` is the natural home); `lobbyStore.ts:170` `room.onLeave` must no longer treat a drop as "lost" while reconnection is pending (use `room.onDrop` / `onReconnect`); the watchdog in `NetSimHost.update` (or the session) with the last-message time from `RunInbox` (any message, any type); the reload fallback (`visibilitychange` timestamps); `main.ts` start-up: a `sessionStorage` entry → try reconnect before the start screen. (tests: `packages/shared/src/net/reconnect.test.ts` (11: configureReconnection, Watchdog 1 ms sweep + stall rule, SeatRecovery ×6, shouldRescueReload); `apps/client/src/net/linkMonitor.test.ts` (9); `lobbyStore.reconnect.test.ts` (6: seat in sessionStorage, takeover on SDK give-up, crossed takeovers, 4021 taken_over, Leave while reconnecting = consented, lobby = lost); `seatStore.test.ts` (2); `sim/NetSimHost.reconnect.test.ts` (send gate); wiring: `reconnectWiring.test.ts` › main.ts + BootScene + GameScene lines)
- [x] **T6 UI** (AC 1, 4, 9, 10; decision 8.1 D2, D4): the reconnecting screen (Preact overlay, `apps/client/src/ui/`), the grey team-list chip with countdown (team list from Story 2.9), toasts, "seat kept" waiting screen, "Paused: nobody connected" and 3-2-1; spawn-protection blink on the returning survivor (alpha pulse on the existing body, no new texture; if a texture is needed it goes through `addGeneratedTexture`). Add every new on-screen element to the one HUD layout test (EPIC 6 brief 31) at 568×320 and 640×360. (tests: `apps/client/src/ui/connectionModel.test.ts` (4), `render/protectBlink.test.ts`, `scenes/hudLayout.test.ts` › mode "reconnecting" (Leave) + "Story 8.1: the held-teammate chips …"; wiring › "the overlay is mounted, and the player view blinks protection"; screens in `docs/perf/img/8-1-*.png`)
- [x] **T7 Bots: cut switch and reconnect** (AC 11): `tools/netaudit/lagLine.ts` (from 8.8) gains `cut(ms)` (holds both directions, no bytes, no close); `tools/bots/run.ts` `--cut-bot N --cut-at S --cut-for S`; `tools/bots/botClient.ts` sets the same reconnection options, its own 3 s watchdog, and re-sends from a fresh seq after return. Bots log `reconnected after X ms`. (tests: `tools/bots/cut.test.ts` (4 bots on 8.8's 1 % line, net150); cut is its own additive `tools/netaudit/cutLine.ts` chained in front of 8.8's lag line (8.8 was not on master when T7 was built); CLI runs in `docs/perf/network-pass-2026-11.md` § 8.1)
- [x] **T8 Tests** (AC 11, F1–F8), including the field-by-field hold round-trip and the 8 s cut; run the 10-wave sim with one bot dropping twice and assert all waves ended (brief 6). (tests: as above + `packages/shared/src/player/holdRunSim.test.ts` › "all waves end; the bot was held twice …"; replay: `hold.test.ts` › "a log with a mid-wave hold and return replays to the same snapshotWorld digest; without them it diverges")
- [x] **T9 Docs + gate + hand-back**: `docs/perf/network-pass-2026-11.md` § 8.1 (cut test timings); HANDOFF §2/§4 (reconnect exists; dev cut switch); `docs/playtests/` 2.10 plan: add "lock the phone 30 s mid-wave, come back" and "airplane mode 10 s" checks for iPhone and Android. (`docs/perf/network-pass-2026-11.md` § 8.1, `docs/perf/network-pass-smoke-8-1-2026-11-25.md` (two-tab smoke, brief 34), HANDOFF §2/§4, `docs/playtests/milestone-1.md` › Reconnect checks; gate below)

## Dev Notes

### Current state (read before changing)

- **Any drop = leave for good today.** `RunRoom.onLeave` (`apps/server/src/rooms/RunRoom.ts:389-410`): members delete (frees the slot), `state.players.delete`, `controller.removePlayer` (World drop at once), `player.left` broadcast with reason `left` (code 4000) or `disconnected`, host moves to `nextHost` (`run/lobby.ts`). No `onDrop`, no `allowReconnection`. The comment at lines 380-386 already plans this story's shape.
- **Joins** (`RunRoom.ts:327-362`): lobby only (`run_started` otherwise); `onAuth` (line 229) hashes the guest token (`hashGuestToken`, `run/lobby.ts`); a second join with the same hash is refused `already_joined` (line 332). `Member` holds `playerId`, `slot`, `sessionId`, `guestTokenHash`, `joinOrder`, `rttMs`.
- **World removal** (`packages/shared/src/player/player.ts:174-181`): clears the boss threat slot (6.5 F7), releases the flame slot (5.4), deletes the player and its inputs. Zombies retarget the next tick. Status type: `"alive" | "downed" | "out"` (`player.ts:10`). Team wipe: `player/downed.ts` ("no one standing → `team.wiped` once").
- **Colyseus 0.18.29 server** (`node_modules/@colyseus/core/build/Room.d.ts:365-391, 870-891`): `onDrop(client, code)` is called for a non-consented close when defined; `allowReconnection(previousClient, seconds)` returns a `Deferred<Client>`; `onReconnect(client)`; `onLeave` when the client really leaves (also after a reconnection timeout).
- **Colyseus 0.18 SDK** (`node_modules/@colyseus/sdk/build/Room.d.ts`, `Reconnection.d.ts`/`.mjs`): automatic reconnection is ON by default: `maxRetries 15`, `delay/minDelay 100`, `maxDelay 5000` (≈ 56 s total: the audit's "retries in vain"), `minUptime 5000`, **`maxEnqueuedMessages 10` (messages sent while offline are replayed on reconnect: must be 0, F7)**; events `room.onDrop`, `room.onReconnect`; `room.reconnectionToken`; `Client.reconnect(token)`.
- **Transport** (`node_modules/@colyseus/ws-transport/build/WebSocketTransport.mjs:53-54,161-171`): `pingInterval` 3000 ms, `pingMaxRetries` 2 by default; options exist on the constructor (`WebSocketTransport.d.ts:19-20`); `app.ts:34` passes neither.
- **Client lost-room path**: `lobbyStore.ts:160-176` (`room.onLeave` → `onLost(lostReason(...))`, `serverNotice.ts` "server_restarting" | "connection_lost"); `connection.ts` (SDK `Client`, `createGame`/`joinGame`, `options()` with `guestToken`); `guestToken.ts` (comment: "Story 8.1 matches reconnects by it"); `activeRun.ts`; `main.ts` (`enterLobby`, the dev throttle wrapper `throttled()`).
- **Messages listened from the join**: `RunInbox` (`session.ts:195-260`) buffers early events, drops early horde frames, answers pings at once.
- **Horde gating**: `HordeEncoder.send` skips any client not `ClientState.JOINED` (a comment calls out Epic 8 reconnection: 0.18 would otherwise queue bytes for a joining client).
- **Hidden tab today**: Phaser stops the loop, `NetSimHost.stepInputs` sends nothing, the server starves the player (holds still, weapon paused) — in a wave the survivor stands and can die. AC 2 changes that.

### Developer guidance

- **Detach, don't add a fourth status.** Moving the `PlayerState` object to `world.heldPlayers` keeps every system's `world.players` loop correct without touching them (targeting, AI, combat, revive, wipe, boss, events, aim assist, turrets). The few lookups by owner id (pay, kill credit) are the only places that must know about held players. Adding a `"held"` status would mean auditing every `status === "alive"` check across Epics 2–6.
- **Determinism.** The server decides hold and return at a tick; record them in the input log the replay tool reads (Story 4.4, `packages/shared/src/replay/inputLog.ts`) so the digest test covers them.
- **The takeover is the robust path.** When the phone's watchdog closes its socket at 3 s, the server may still see the old socket as alive for up to 15 s (AC 8), so `reconnect(token)` is refused; the guest-token takeover (AC 6) closes the old socket and hands over the seat at once. Try the token first (cheap, keeps the `Room` object and handlers), fall back to the takeover after one refusal.
- **Freeze is room-level.** Don't add a "frozen" mode to the World: just don't call `controller.tick()` while frozen; `world.tick` doesn't advance, so every tick-counted timer (build timer, boss, events, fires) waits by construction.
- **Not in this story:** joining a started run as a new player (8.2), Remove player (8.3), autosave/resume (8.4–8.6), accounts (7.1).

### Decisions to confirm (designer: "ok" or by code; recommended value first)

Already decided (Epic 8 D1–D5, 2026-11-24): 120 s hold; vanishes safely, downed = out for the wave; everything held exactly; seat remembered all run; world freezes while nobody is connected. New for this story:

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 8.1 D1 | A phone that goes quiet without dropping (app switch, a call, a tunnel the socket hasn't noticed) | **After 3 s with no input, the survivor vanishes safely like a drop** and comes back next to a teammate (today: it stands still and gets eaten until the server gives up 12–15 s later) |
| 8.1 D2 | What you see while reconnecting | **The picture freezes and dims, "Connection lost, reconnecting… 1:43" and a Leave button** (a small banner on top of the last picture) |
| 8.1 D3 | Coming back in the middle of a wave | **2 s where you can't be hurt (and can't shoot), shown blinking**, next to a teammate (no protection: you may land in a crowd) |
| 8.1 D4 | After the 2 minutes ran out | **The phone waits on "Your seat is kept, you'll rejoin at the next build phase" and rejoins by itself** (back to the start screen; rejoin with the link at a build phase) |
| 8.1 D5 | The same phone (or a second tab) joins again while its seat is held or still open | **The newest connection takes the seat** (the old one is closed) (refused "already playing", as today) |
| 8.1 D6 | Who gets the "reload into your seat" rescue for hung reconnects | **Any browser, after > 10 s in the background** (only iPhone Safari, where the bug is known) |
| 8.1 D7 | A drop in the lobby or on Results | **Same as Leave, as today** (rejoin by the link) (held 120 s too) |
| 8.1 D8 | How long the server waits for a silent socket | **12–15 s** (3 s × 4 pings; with D1 the survivor is already safe after 3 s) (9–12 s: × 3) |

### Beat the rule (reviewer start list; brief 4)

1. **Wipe dodge:** last standing player about to die turns on airplane mode: with D1 they vanish (held), the connected players are all down → team wipes (F3: held players don't keep the team alive). Solo: everyone disconnected → freeze → come back → the zombie is still there (freeze, not a reset).
2. **Escape:** surrounded, switch apps for 3 s, come back next to a teammate (F4). Is it worth it? (Lost 3 s + 2 s protection with no shooting; a downed player can't escape: out for the wave.) Record whether a player can do it repeatedly to dodge every Brute wind-up; propose a cooldown (e.g. the 2nd quiet return in one wave lands where they vanished) if it is.
3. **Free revive:** downed → drop → return: must be out (F1). Downed → quiet 3 s → inputs again: out too.
4. **Free reload / heal / reroll:** drop mid-reload, mid-shop: reload restarts, HP same, offer and rerolls same (F2).
5. **Late inputs:** tap Buy twice while offline, then reconnect: nothing bought (F7). Ready pressed offline: not ready.
6. **Seat theft:** a stranger who knows the link joins mid-run: refused (`run_started`); with a copied guest token (same browser profile): takes the seat (D5) — the token is the identity until accounts; note it, don't fix.
7. **Turret farming:** a player drops for good at wave 2 with 4 turrets: their wallet stops growing after 120 s (F5), the turrets keep shooting for the team.
8. **Freeze abuse:** the whole team disconnects mid-wave to "pause" (e.g., to think during the boss): allowed for 120 s (D5 accepted), the 3-2-1 gives a fair restart; the boss telegraph in progress resumes from where it was (tick-counted).
9. **Hold leaks:** 30 drops and returns in one run (bot): no growth in memory, `heldPlayers` empty after each return, slots/colours consistent, the host role correct (8.3 rule: moves at once, never back).
10. **Boss / events while held:** a Behemoth throw aimed at a player who drops before the hit: the landing spot is fixed (EPIC 6 21a), nobody is hit; a stampede lane over the held spot: nobody is hurt; a supply crate can't be taken by a held player.
11. Mutate: comment out `holdPlayer`'s downed→out → F1 test fails; set `maxEnqueuedMessages` back to 10 → F7 test fails; remove the guest-token takeover → the 8 s cut test fails (or takes > 10 s).

### Measurements (brief 13) — fill in

| Case | Before (master) | After target | After (story-8-1, measured 2026-11-25) |
| --- | --- | --- | --- |
| Bot line cut 8 s mid-wave (lossy line) | bot is out of the run | back in its seat, same loadout/wallet/HP, ≤ 10 s after the cut ends | **303 ms** (1 %), **302 ms** (2 %), 51 ms clean; HP/weapons same, wallet same or + pay while held (F5); automated test 6/6 |
| Bot line cut 30 s | out | back, ≤ 10 s after the cut ends | **51 ms** (clean) |
| Bot line cut 130 s | out | seat freed at 120 s, rejoined at the next build phase with its stuff | hold expired at 120 s, `seat_kept` ×7, **restored at the next build phase** 13 s after the cut, wallet/weapons same (net150) |
| Server: silent socket terminated after | 6–9 s | 12–15 s | 12–15 s by config (`pingInterval` 3000 × `pingMaxRetries` 4; not timed) |
| Phone shows "reconnecting" after | never (≈ 56 s of silent SDK retries, then start screen) | 3 s | **3.1 s** (two-tab smoke 3075–3133 ms; unit sweep fires at 3001 ms); 30 ms on an `offline` event |
| Server tick p99 with one held player + hold bookkeeping | record | ≤ +0.2 ms | tick avg 0.92 / max 6.5 ms (wave 3 with a hold) vs 0.88 / 2.2 ms (same wave, other run); bookkeeping = a ≤ 4-slot loop: below noise (p99 not separately recorded) |
| Bytes: hold fields | — | report (expected ≈ 0 when nobody is held) | 0 B/s when nobody is held; ~120 B once per mid-wave return (protectTicks 40 → 0) |

Method, lines and load: `docs/perf/network-pass-2026-11.md` § 8.1. "Before" is master b0e491a by construction (no `onDrop`; the 2.11 test asserted a mid-run drop removed the player); the bots had no cut switch before this story.

### Files (expected)

- `packages/shared/src/player/player.ts`, `core/world.ts`, `player/downed.ts` (wipe check reads `world.players` only: verify), pay paths in `buildings/turret.ts`, `trap.ts`, `mine.ts`, `bearTrap.ts` / economy kill pay (verify which), `packages/shared/src/config/balance/player.json` (`returnProtectTicks`), `net/stateView.ts`, `core/worldSnapshot.ts` (`snapshotWorld`), `replay/inputLog.ts`
- `apps/server/src/run/RunController.ts`, `apps/server/src/rooms/RunRoom.ts`, `apps/server/src/rooms/schema/RunState.ts`, `syncState.ts`, `apps/server/src/app.ts`, `apps/server/src/run/lobby.ts` (seat lookup by hash)
- `apps/client/src/net/connection.ts`, `session.ts`, `lobbyStore.ts`, `activeRun.ts`, `fakeRoom.ts`, `devThrottle.ts` (StateCopy follows the keys), `apps/client/src/sim/NetSimHost.ts` (watchdog, send gate, reset on return), `apps/client/src/main.ts`, `apps/client/src/ui/*` (overlay, chip, toasts), `apps/client/src/scenes/GameScene.ts` (protection blink, freeze overlay hook)
- `tools/netaudit/lagLine.ts`, `tools/bots/run.ts`, `tools/bots/botClient.ts`

### Epic 6: check at build time (brief 22)

- **New run state that must be held:** whatever 6.8–6.12 added to `PlayerState` / the World per player (event credit, carried crate, the survivor NPC being led, vote choice). The field-by-field round-trip test (AC 11) will fail on anything not handled: decide per field (keep exactly / reset / drop the NPC's lead). Rules to apply: only standing players take the crate or lead the survivor (EPIC 6 brief 23), so a held player drops the lead; a vote of a held player counts as silent (6.11 D1: silent = Extract).
- **Run phases:** `RunRoom.onTick` steps only "build" and "wave" today (`RunRoom.ts:757`); 6.11/6.12 add the vote and endless phases: hold applies in every run phase except lobby/results (D7).
- **Boss:** `clearBossThreatSlot` on hold (as `removePlayer`); Behemoth HP counted from players present at entry (6.5 B2): a held player at its entry doesn't count.

### Notes for the merge (brief 12)

- `RunRoom.ts`: 8.10 adds a keyframe request for (re)joined clients in `sendHorde`; 8.11 moves the patch into `onTick`. Keep the hold logic out of `onTick` except the freeze gate (one `if`).
- `PlayerState` schema / stateView: 8.9 added `inputQueued`; add `heldUntilTick` next to it.
- `NetSimHost.ts`: 8.9 owns `stepInputs` pacing; this story adds the send gate (`if (!connected) return`) at its top and the watchdog in `update`.
- `lagLine.ts`: additive `cut()`.

### Dependencies

8.8 (lossy line + bot line for the cut test). Independent of 8.9 except shared files above (merge 8.9 first if both are open). Story 7.1 later adds account matching; 8.2 later opens build-phase joins for new players on top of AC 9's remembered-seat join; 8.4 replaces F6's "lost" for build phases with "saved".

### Suggested build round

Round 2, in parallel with 8.10 (see `docs/network-pass-decisions.md` › Build rounds). Effort L (1–2 builder sessions). Full fresh review (game rules + exploits).

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 8.1 (incl. the Network pass ACs); `docs/ideas/epic-8/decisions.md` D1–D5 (+ forge notes in `docs/ideas/epic-8/forge/`); `sprint-change-proposal-2026-11-24-epic-8.md`
- `docs/perf/network-audit-2026-11.md` §2 (reconnect: none), F9, §5 Transport and mobile networks (WebKit 308073, 247943, LTE wake-up), §6 #4
- Story 2.3 (guest token), 2.8 (downed/out/wipe, build-start spot), 2.9 (team list), 2.11 (Leave, `player.left`)
- `docs/network-pass-brief.md`, `docs/network-pass-decisions.md`

## Dev Agent Record

### Agent Model Used

Claude (builder child session, gds-dev-story; autonomous overnight run).

### Gate

**Gate after merging Story 8.10** 2026-11-25 07:17–07:25 on story-8-1 @ 056935a (master f67154d merged): typecheck && lint && test && build → **green**: 429 files passed (1 skipped), **3893 tests passed** (3 skipped), build ✓. Load 0.73 at the start, 3.09 at the end.

**Re-review-1 fix gate** 2026-11-25 06:51–06:59 on story-8-1 @ 01de5bb (master 02e7d8c merged): typecheck ✓, lint ✓, test ✓ — 423 files passed (1 skipped), **3861 tests passed** (3 skipped); build failed at first only because master's new gallery needs `@fontsource/oswald` from the merged lockfile → `npm ci` (no code change) → build ✓ (06:59). Load 0.67 at the start, 3.79 at the end.

**Review-fix gate** 2026-11-25 06:13–06:20 on story-8-1 @ ae23fbd (master d8d44d0 already merged: `git merge origin/master` → up to date): typecheck && lint && test && build → **green**: 417 files passed (1 skipped), **3821 tests passed** (3 skipped), build ✓. Load 0.97 at the start, 3.90 at the end.

First gate: Gate 2026-11-25 05:34–05:41 on story-8-1 @ 801e1eb (= master d8d44d0 with Stories 8.8 + 8.9 merged in): `npm run typecheck && npm run lint && npm test && npm run build` → **green**: 416 test files passed (1 skipped), **3799 tests passed** (3 skipped), build ✓. Load 0.46 at the start, 3.54 at the end (4 cores; no other job of mine running). After the gate: the T4 horde-frame assertion in `RunRoom.reconnect.test.ts` (edited during the gate) re-run alone → 15/15; the commit after it changes only that test and docs.

### Implementation Plan (as built)

- **Shared (`player/hold.ts`)**: "detach, don't add a fourth status". `holdPlayer` moves the `PlayerState` to `world.heldPlayers` (`{ player, wave, phase }`), clears the boss threat slot and the flame slot (Epic 6's NPC lead and crate claim are keyed by that slot, so they drop too), downed → out (F1), cancels reloads, clears knockback / flame edge / Ready / vote (F7, 6.11 D1 silent), drops inputs. `returnPlayer` puts the same object back: mid-wave next to the lowest-slot standing teammate (`placeNextToTeammate` = the build-start `returnSpot`) with `returnProtectTicks` 40 (D3), build phase where they were; a build start missed while held is replayed for that player (`catchUpBuildStart`). `releaseHeldPlayer` / `restoreSeat` for F8. `economy.earn` also finds a held owner (F5). Protection: `damagePlayerBy` + the direct zombie/spit/fire checks, `updatePlayerWeapon` and consumables skip while `protectTicks > 0`; `movePlayers` counts it down. Replay kinds `hold` / `return`; `snapshotWorld` lists held players only when there are any (old digests unchanged).
- **Server**: `RunController.holdPlayer/returnPlayer/isHeld/activeCount/releaseHeld/restoreSeat/resetInputs/isStaleInput`, the quiet counter (wave ticks only, B1), queue reset on hold/return. `RunRoom.onDrop` → `allowReconnection(client, leftS)` (run phases only, D7), `onReconnect` → return (via token), `join()` in a started run: takeover of a held or connected seat with the same `seatKey` (D5; old socket closed 4021, member moved first so its onDrop/onLeave do nothing), remembered seat restored only in a build phase into its own free slot (else `seat_kept`), stranger `run_started`; `onLeave`/`finalLeave` remembers the seat mid-run (F8, B5); quiet holds get a room timer and close the socket with 4020 at expiry; freeze (`state.frozen`, one `if` in `onTick`) when nobody is present, 3-2-1 on the room clock. Transport `pingMaxRetries: 4`. Logs `player_held`, `player_returned {afterMs, via}`, `player_hold_expired`, `seat_taken_over`, `seat_restored`, `room_frozen`, `room_resumed`, `run_abandoned`.
- **Phone**: shared pure `net/reconnect.ts` (Watchdog, SeatRecovery, configureReconnection: offline queue 0, F7) used by the client's `LinkMonitor` and by the bots (brief 20). The SDK's token reconnect first; after 2 s (or when the SDK gives up) a takeover join by guest token; a takeover that lands late is adopted (B12). Watchdog 3 s on raw messages, ignores page stalls (B13). `seatStore` (sessionStorage: code, token, name) → `main.ts › resumeSavedSeat` on load; hidden > 10 s + not back 5 s after showing → reload (D6). NetSimHost sends nothing while the link is down. `ConnectionOverlay`: reconnecting / seat kept panels (Leave = consented), Paused + 3-2-1, grey chips, "is back" toast. Held teammates are not drawn; protection blinks (`protectBlink.ts`).
- **Bots**: same reconnect rules, `--cut-bot/--cut-at/--cut-for` with `tools/netaudit/cutLine.ts` (in front of 8.8's lag line).

### Debug Log References

- Two-tab smoke runs 1–2 found three bugs (hung takeover join, false watchdog after a scene restart, reload stuck on the start screen); fixed, run 3 clean (`docs/perf/network-pass-smoke-8-1-2026-11-25.md`).
- The first automated cut runs were flaky (2/5): a takeover landing after the SDK's own token reconnect was closed as "late" and put the seat back on hold → B12 (adopt). 9 green runs since.
- Brief 29 (bot changes don't hide bugs): the bots only gained the reconnect path; their policy is unchanged. The lossy-line cut test switched to the god-mode scenario after 1 of 3 runs wiped in wave 3 (B11) — the wipe was the bots' play, not a reconnect failure (the bot was back 0.3 s after the cut in that run).

### Completion Notes List

- Story file written 2026-11-24 by the story writer (gds-create-story, non-interactive) from master da82847; decisions 8.1 D1–D8 accepted 2026-11-24 (all recommended).
- Built 2026-11-25 overnight; every build-time choice is logged as 8.1 B1–B14 in `docs/network-pass-decisions.md` ("auto-accepted overnight (designer: follow the GDS recommendation)").
- Beat the rule (builder's own pass, reviewers continue): 1 wipe dodge → held players don't keep the team alive (test); 2 escape by app switch: costs 3 s + 2 s protection without shooting; repeatable (no cooldown built: recorded for the reviewer); 3 free revive → out (tests, drop and quiet); 4 free reload → reload restarts, HP/offer/rerolls kept (test); 5 late inputs → SDK queue 0, NetSimHost gate, server drops > 2 s old view ticks (tests); 6 seat theft with a copied guest token → takes the seat (D5, noted for 7.1); 7 turret farming → no pay after the hold (test); 8 freeze abuse → allowed 120 s (D5), 3-2-1; 9 hold leaks → 10-wave sim with two holds leaves `heldPlayers` empty; bots dropped/returned repeatedly in the smoke; 10 boss/events → Behemoth slam on a held spot hurts nobody (test), NPC lead/crate claim drop with the slot; 11 mutations: see Not verified 9.

### Notes for the merge (brief 12)

- **`RunRoom.ts`**: hold logic is in `onDrop` / `onReconnect` / `onLeave`→`finalLeave` / `join()` (takeover, remembered seats) and new private helpers; `onTick` gained ONE line (`if (this.state.frozen) return;`). 8.10's keyframe for (re)joined clients: a reconnected client re-enters `this.clients` as JOINED (same sessionId; `attachClient` runs again) and a takeover is a fresh join: both must get 8.10's first keyframe (test in both files). `maxClients` is 8 during a run (B6).
- **Seat identity (Story 7.1)**: every seat match goes through `seatKey(auth)` in `apps/server/src/run/lobby.ts` (`guest:<hash>`); `Member.seatKey` and `rememberedSeats` are keyed by it. 7.1 changes only that function (account ticket → `acct:<id>`) and whatever it adds to `RunAuth`.
- **`RunController.ts`**: shares the input path with 8.9 (merged): `queueInput` got the held check + the stale-view drop (after the seq checks); `tick()` got `holdQuietPlayers()` + one `quietTicks++` line beside 8.9's `depthAtTick`; `resetQueue` also zeroes 8.9's `depthAtTick`. 8.11 (one packet per tick): keep `isStaleInput` before queueing.
- **`PlayerState` schema / stateView / fakeRoom**: `heldUntilTick`, `protectTicks` right after 8.9's `inputQueued`; `RunState`: `frozen`, `resumeIn` appended. devThrottle copies follow the key lists.
- **8.9 clock (its note "the watchdog goes before the clock lines")**: 8.1's watchdog lives in `LinkMonitor` (lobbyStore), not in `NetSimHost.update`; a same-room reconnect keeps the 8.9 clock and delay, tested monotonic: `NetSimHost.reconnect.test.ts` › "a same-room reconnect keeps the render clock monotonic". A takeover / reload builds a new NetSimHost (fresh clock).
- **8.10 per-client horde state**: `RunRoom.attachClient` runs on every first join, `onReconnect`, takeover and restored seat, and always with a NEW Colyseus client object (0.18 creates a new client on a reconnect even with the same sessionId), so 8.10's WeakMap-by-client encoder state gives a keyframe automatically; optionally call `this.horde?.forceKey(client)` there (comment left). New tests here that join a room will need 8.10's `netProtocolVersion` join option once 8.10 lands (RunRoom.reconnect.test.ts `options()`, tools/bots/cut.test.ts via BotClient). Whoever lands second adds the room-level "first frame after a reconnect is a keyframe" test.
- **`NetSimHost.ts`**: the send gate is the first lines of `stepInputs` (before 8.9's pacing line); `dropMissing`/`addMissing` skip held teammates; `applyPlayer` copies `protectTicks`.
- **`tools/bots/run.ts` / `botClient.ts`**: the cut line is chained in front of 8.8's lag line (`urlFor`); `BotClient.room` is now mutable (a takeover swaps it) and `wire(room)` holds every handler.
- **`docs/perf/network-pass-2026-11.md`**: § 8.1 appended after 8.9's section.
- **`lobbyStore.ts` / `main.ts`**: `enterLobby` → `enterRoom(room, connection)` (a recovered room goes through the same attach); `AttachOptions.rejoin` / `onRecovered`.

### Not verified

1. iPhone Safari (WebKit 308073 hung reconnect → the reload rescue; 247943 no `onclose` → the watchdog), real 4G, app switch and phone lock on real phones: built from the bug reports and unit-tested with fakes; checks added to the 2.10 playtest plan (brief 23).
2. The 12–15 s transport limit is by configuration, not timed.
3. Server tick p99 with a held player was not separately recorded (avg/max per wave only).
4. The two-tab smoke ran without `&loss=1` (written before 8.8 reached master); the lossy line was covered by the bots and the automated cut test.
5. The hidden-tab rescue reload (D6) is unit-tested (`shouldRescueReload`) and wired (source check), never triggered in a browser.
6. The phone's event queue is not reset on a same-room reconnect (events of the offline time are simply never sent by the server; a few queued ones may play late on return).
7. "A building being carried goes back to the hand" (F2): the World has no carried-building state (5.22 moves are one message), so there is nothing to return; the client's held ghost is not cleared on a drop.
8. The chip's countdown stops while the World is frozen (B8); the reconnecting panel counts from the phone's own drop time, so it can be up to 3 s more generous than the server's hold.
9. Mutation checks run (after the gate, each reverted): `holdPlayer`'s downed→out off → 1 test fails (`hold.test.ts` › F1 "downed at the hold → out"); `maxEnqueuedMessages` back to 10 → 3 fail (`reconnect.test.ts` › configureReconnection, `linkMonitor.test.ts` › configures the SDK, `lobbyStore.reconnect.test.ts` › run.joined saves the seat); the takeover line in `join()` removed → 3 fail (`RunRoom.reconnect.test.ts` › takeover of a connected seat, of a held seat, full 4-player run); the freeze `if` in `onTick` removed → the solo freeze test fails. NOT mutated: the cut test without the takeover (heavy; not run).
10. A second real tab of the same phone takes the seat (D5); the old tab shows "You're already in this game" — the wording reused from 2.3, not a new text.

### File List

- `HANDOFF.md`
- `_bmad-output/implementation-artifacts/8-1-reconnect-within-2-minutes.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/client/src/main.ts`
- `apps/client/src/net/connection.ts`
- `apps/client/src/net/fakeRoom.ts`
- `apps/client/src/net/linkMonitor.test.ts`
- `apps/client/src/net/linkMonitor.ts`
- `apps/client/src/net/lobbyStore.reconnect.test.ts`
- `apps/client/src/net/lobbyStore.test.ts`
- `apps/client/src/net/lobbyStore.ts`
- `apps/client/src/net/seatStore.test.ts`
- `apps/client/src/net/seatStore.ts`
- `apps/client/src/net/serverNotice.ts`
- `apps/client/src/render/PlayerView.ts`
- `apps/client/src/render/protectBlink.test.ts`
- `apps/client/src/render/protectBlink.ts`
- `apps/client/src/scenes/BootScene.ts`
- `apps/client/src/scenes/GameScene.ts`
- `apps/client/src/scenes/hudLayout.test.ts`
- `apps/client/src/sim/NetSimHost.reconnect.test.ts`
- `apps/client/src/sim/NetSimHost.ts`
- `apps/client/src/ui/App.tsx`
- `apps/client/src/ui/ConnectionOverlay.tsx`
- `apps/client/src/ui/connectionModel.test.ts`
- `apps/client/src/ui/connectionModel.ts`
- `apps/client/src/ui/overlay.css`
- `apps/server/src/app.ts`
- `apps/server/src/net/limits.ts`
- `apps/server/src/rooms/RunRoom.leave.test.ts`
- `apps/server/src/rooms/RunRoom.reconnect.test.ts`
- `apps/server/src/rooms/RunRoom.ts`
- `apps/server/src/rooms/schema/RunState.ts`
- `apps/server/src/rooms/schema/syncState.ts`
- `apps/server/src/run/RunController.hold.test.ts`
- `apps/server/src/run/RunController.ts`
- `apps/server/src/run/lobby.ts`
- `docs/network-pass-decisions.md`
- `docs/perf/img/8-1-held-chip.png`
- `docs/perf/img/8-1-reconnecting-panel.png`
- `docs/perf/network-pass-2026-11.md`
- `docs/perf/network-pass-smoke-8-1-2026-11-25.md`
- `docs/playtests/milestone-1.md`
- `packages/shared/src/combat/consumables.ts`
- `packages/shared/src/combat/damage.ts`
- `packages/shared/src/combat/firing.ts`
- `packages/shared/src/config/balance/player.json`
- `packages/shared/src/config/balanceSchema.ts`
- `packages/shared/src/core/world.ts`
- `packages/shared/src/core/worldSnapshot.ts`
- `packages/shared/src/decay/fire.ts`
- `packages/shared/src/economy/economy.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/net/messages.ts`
- `packages/shared/src/net/reconnect.test.ts`
- `packages/shared/src/net/reconnect.ts`
- `packages/shared/src/net/stateView.ts`
- `packages/shared/src/player/downed.ts`
- `packages/shared/src/player/hold.test.ts`
- `packages/shared/src/player/hold.ts`
- `packages/shared/src/player/holdRunSim.test.ts`
- `packages/shared/src/player/movement.ts`
- `packages/shared/src/player/player.ts`
- `packages/shared/src/replay/inputLog.ts`
- `packages/shared/src/zombies/spit.ts`
- `packages/shared/src/zombies/zombieAi.ts`
- `tools/bots/botClient.ts`
- `tools/bots/cut.test.ts`
- `tools/bots/run.ts`
- `tools/checks/reconnectWiring.test.ts`
- `tools/netaudit/cutLine.ts`
- `tools/netaudit/smokeReconnect.cjs`

## Senior Developer Review (AI)

Reviewer: reviewer child session (gds-code-review: Blind Hunter, Edge Case Hunter, Acceptance Auditor; autonomous overnight run), 2026-11-25.
Tree reviewed: `review-8-1` = `origin/story-8-1` db2cff2 merged with `origin/master` d8d44d0 (**no conflicts**: master was already merged, "Already up to date"). Diff `git diff origin/master...HEAD` (72 files, +4304/−75).
Checks run (no full gate, as asked): `npm ci`; `npm run typecheck` → green; the story's 14 new/changed test files → 14 files / 131 tests green (24 s); `tools/bots/cut.test.ts` → green (51 s). Probes were scratch tests, deleted after (not committed).

**Verdict: CHANGES REQUESTED** — 3 high, 3 medium, 6 low. The hold/return/freeze/takeover core is sound and well tested (every mutation but two failed a test), but three ordinary-player exploits break F2 and the boss/wave scaling, and the reconnect is an on-demand teleport + invulnerability (F4 / brief 18).

### Findings

| ID | Sev | Where | Failure scenario (probed) | Minimal fix |
| --- | --- | --- | --- | --- |
| **H1** | high | `packages/shared/src/player/hold.ts:73` (`missedBuildStart`) | **Free heal (F2).** `waves.number` increments at `startWave`, so a hold made in build phase N−1 (`h.wave = N−1`) that returns in wave N counts as "missed a build start" → `catchUpBuildStart` heals +`buildHealFrac` (50 % max HP) and clears acid/flame clocks. Probe (shared + live room PR3): HP 20 → **70** on a drop in the build, token return after the wave started. Any player: close/reload the tab in the last seconds of a build. | Record the build-start index at the hold (`buildIdx = waves.number + (phase === "build" ? 1 : 0)`) and treat a build start as missed only when the current index is larger. Test: build hold → wave return keeps HP. |
| **H2** | high | `apps/server/src/run/RunController.ts:635` (`restoreSeat(…, this.world.waves.number, "wave")`) | **Free heal, repeatable (F2).** A consented Leave in a build phase (B5: remembered) + rejoin by the link in the SAME build is restored as "held in a wave" → catch-up heal +50 % every time. Probe PR2 (live room): HP 20 → **70**, again 20 → 70 on a second Leave/rejoin; full HP each build phase for two taps. | Keep the hold's own `wave`/`phase` (or H1's index) in `RememberedSeat` (`releaseHeld` returns them) and pass them to `restoreSeat`. Test: Leave + rejoin in the same build keeps HP. |
| **H3** | high | `packages/shared/src/boss/behemoth.ts:181` (`world.players.size` at `arrive`), `packages/shared/src/waves/waveDirector.ts:377` (`beginWave` counts `world.players`) | **Team cheese of the boss and wave size.** Held seats aren't counted when the Behemoth's HP is fixed (4 s `boss.warning` is longer than the 3 s quiet rule: 3 players app-switch at the warning, or reload) → HP for 1 player: **2400 vs 6000** (−60 %, `soloHpScale` 0.4); they're back 2 s later next to the 4th player. Same at `beginWave`: 3 players reload in the last second of a build → the whole wave is sized ×0.35 instead of ×1.0 (and H1 heals them on return). The story file names the boss rule ("a held player at its entry doesn't count") but not its exploit. | Count the run's seats, not the present bodies, where a run-long number is fixed: `world.players.size + world.heldPlayers.size` in `arrive` and `beginWave` (telegraph gaps / enrage crawlers are per moment: may stay). Test: 4 seats, 3 held at arrival/begin → 4-player HP / size. |
| **M1** | medium (designer rule) | `packages/shared/src/player/hold.ts:75-79` (teleport + protection on every mid-wave return), `apps/server/src/rooms/RunRoom.ts` `onDrop` | **Escape / teleport / invulnerability on demand (F4 "not an escape", brief 18 "'I reconnected' changes the World").** Closing or reloading the tab sends WS 1001 = non-consented → `onDrop` holds the seat *instantly* (no 3 s wait). Probe PR1 (live room, 5 cycles back to back, no cooldown): back in **152 ms**, moved **30 m → 1.5 m** from the teammate, `protectTicks` 39 each time. Honest player: pull-to-refresh / F5 dodges a Behemoth slam, a gas or Bloater blast, a lethal bite (back in 1–3 s), or regroups across the map. Modified client: close+reconnect every ~2.15 s = permanently invulnerable (held ↔ protected), and a protected body is still the nearest zombie target → an unkillable decoy that keeps the team standing. Downed players can't use it (F1 holds). App switch: same teleport after 3 s of standing still (costly in a crowd, free when safe). | Designer rule (R7: new game rule). Recommended minimal rule: **teleport + protection at most once per player per wave; any further return in that wave lands where they vanished, unprotected** — and **a hold shorter than 3 s (QUIET_HOLD_TICKS) returns in place, unprotected** (an instant drop is a reload or a cheat, never a dangerous dead line). Test: 2nd return in a wave in place with `protectTicks` 0; a 150 ms drop returns in place. |
| **M2** | medium | `packages/shared/src/run/runStateMachine.ts:243` (`voteOutcome(t.stay, world.players.size)`), `:253` (`markEvac`), `everyoneVoted` | **A held seat leaves the vote instead of counting as silent (Dev Notes "Epic 6": 6.11 D1 silent = Extract).** Probe: 4 players, 2 vote Stay, 2 held → **Stay** (endless on); with the story's rule it is Extract (2 × 2 > 4 is false). The vote also ends early once the present players voted. A held player at the first Stay never gets `earnedAtEvac` (→ `run_ended` `earnedBeforeEndless` / `earnedAfter10Lost` wrong for them). | Denominator = present + held seats in `resolveEvacVote` / `everyoneVoted`; `markEvac` also over `heldPlayers`. Test: 2 Stay + 2 held → Extract. |
| **M3** | medium | `apps/client/src/sim/NetSimHost.ts:236,1044` (one `ServerClock` for the Room's life; nothing re-bases it on a same-room reconnect) | **Picture runs ahead of the data for up to a minute after a freeze (brief 9 "across a reconnect", 16; 8.9 F2).** While everyone is gone the server tick stands still (F6) but the phone's estimate keeps advancing through the offline time and the 3-2-1; after the resume it may only slew back at 10 %. Probe (`ServerClock`, 6 s freeze): lead **5998 ms → 998 ms over 50 s** — the render tick sits past the newest horde frame (others/zombies held at the newest frame, 8.9's freeze counter climbing). Every solo online drop hits this; the two-tab smoke never froze. | Re-base the clock (and `AdaptiveDelay`) when `state.frozen` goes true → false or on `onReconnect` while the overlay covers the picture (one step there is allowed), e.g. `ServerClock.reset()`. Test: freeze 6 s → lead < 200 ms within 1 s of the resume, estimate monotonic after it. |
| L1 | low | `apps/server/src/rooms/RunRoom.ts:1076` (`endRun` loops `world.players`) | A player held when the run ends (wipe/extract) has no kills/earned in `run_ended`. | Also loop `heldPlayers`. |
| L2 | low | `apps/server/src/rooms/RunRoom.ts:402` (`attachClient` → `net.add`) | Every reconnect/takeover gets a fresh `ClientGuard`: full buckets again (a cheater refills the ~10 msg/s budget by reconnecting in ~150 ms), and the dropped socket's drop counters are never reported (`onDrop` doesn't `net.remove`). | Carry the guard by playerId across a reconnect/takeover (or report on drop). |
| L3 | low | `apps/client/src/net/lobbyStore.ts:257` (B12) | A deliberately opened new tab within 15 s of the old tab's own recovery loses the seat back to the old tab (any 4021 in `ownTakeoverMs` is retaken): D5 "newest wins" is inverted for 15 s. | Retake only while this tab's own takeover attempt is known to have crossed (attempt count / epoch), not on time alone. |
| L4 | low | `apps/client/src/net/linkMonitor.test.ts:96-137`, `apps/client/src/scenes/hudLayout.test.ts:64` | Two tests don't bite (brief 26/27): `takeoverAfterMs` 2000 → 20 000 passes (the test advances by the constant); moving `.held-chips` to the screen centre in `overlay.css` passes (the test's box is hard-coded, not read from the CSS). | Pin 2000 ms in the test; read top/left/max-width from `overlay.css` (like other source checks). |
| L5 | low | `apps/server/src/rooms/RunRoom.reconnect.test.ts` | D7's Results half (a drop on Results is a leave) has no test; only the lobby is tested. | One test. |
| L6 | low | story T4 | T4 is [x] with a sub-item not done ("the phone resets its event queue on return": Not verified 6) — brief 25. | Untick the sub-item or reset the queue. |

### Beat the rule (every attempt)

| # | Attempt (player / cheater) | Result |
| --- | --- | --- |
| 1 | Wipe dodge: last standing goes airplane/quiet while the rest are down | Blocked: held seats don't keep the team alive (test "wipe with a teammate held"). Cheater: drop + return lands in a later tick → wipe fires in between. |
| 2 | Escape a crowd by app switch (3 s) | Works after 3 s standing still: teleport next to the lowest-slot teammate + 2 s protection; repeatable, no cooldown (M1). |
| 3 | Escape / dodge a boss slam, gas or Bloater blast by **reload** (honest) or socket close (cheater) | **Works instantly** (WS 1001 = drop): 152 ms round trip in the probe, 5× in a row (M1). |
| 4 | Permanent invulnerability (cheater loop close→reconnect every ~2 s) | Works: held ↔ protected; the protected body is still a zombie target (decoy) (M1). |
| 5 | Downed → drop/quiet → free revive / escape "out for the wave" | Blocked (F1 tests; probe agrees): out until the next build start. |
| 6 | Free heal: drop in build, return mid-wave | **Works** +50 % HP (H1). |
| 7 | Free heal: Leave + rejoin in the same build | **Works** +50 % HP, repeatable (H2). |
| 8 | Free reload / reroll by dropping | Blocked: reload restarts, offer + rerolls kept (tests). |
| 9 | Boss HP cheese: 3 hold at the Behemoth's arrival | **Works**: 2400 vs 6000 HP (H3). |
| 10 | Wave-size cheese: 3 reload at the end of a build | **Works** by code (`beginWave` counts present players; H3). |
| 11 | Keep earning while held (B7) | Turret/kill/refund pay lands in the held wallet for ≤ 120 s, then nobody (test, mutation M2 caught); wave-clear bonus not paid while held (B7, accepted). No farming beyond the hold. |
| 12 | Dupe money/items via takeover (two tabs, same token) | Blocked: one `Member` moves; one `PlayerState` (held object reused); old socket's onDrop/onLeave/inputs find no member. Remembered seat deleted on restore. |
| 13 | Stranger's new connection takes a held seat | Blocked without the guest token (`run_started`, test). Copied token = that player (7.1 D5 / D5; noted, not a bug). Token never broadcast. |
| 14 | Late takeover races (B12): token reconnect vs takeover crossing | Adopted correctly (tests); only L3 (new tab within 15 s loses). |
| 15 | Stale inputs replayed after reconnect | Blocked: SDK queue 0 (3 tests fail when 10), NetSimHost gate (mutation M7 caught), server drops view > 2 s old (M4 caught), held queue ignored. Non-input taps sent in the first 3 s of an *undetected* silence can arrive late on the same socket = ordinary lag (after a takeover they are ignored). |
| 16 | One player freezes the run for others | Blocked: freeze only when `activeCount() === 0`; probe PR4: 3 connected + 1 held → not frozen, ticking. Solo: pausing by app switch is allowed (D5), unlimited chaining (noted). |
| 17 | Held player blocks Ready / vote / extract / endless / Results | Ready: no (only present players). Vote: no block, but the held seat changes the outcome (M2). Results: any member can `lobby.return`; holds are rejected there (no stuck run). |
| 18 | Back after 120 s at the next build with all stuff (D4) | Works (test; mutation M5 caught); with H2's heal on top. |
| 19 | Lobby / Results drop = Leave (D7) | Lobby tested; Results by code (`inRun` excludes it), untested (L5). |
| 20 | Close codes 4000/4020/4021 through 8.8's lag line | The lag and cut lines are TCP byte proxies (`lagLine.ts:16`: close frames travel like data) — codes pass unchanged; 4020 on the phone → takeover → `seat_kept` (no special case needed). |
| 21 | Clock/render on reconnect (8.9 F2) | Never backwards (holds), but ahead for up to a minute after a freeze (M3). |
| 22 | Horde stream on reconnect | Reconnected client is JOINED and gets frames the next tick (test). **For 8.10**: put the keyframe request in `attachClient` (the one hook for join, reconnect, takeover, remembered-seat restore); reset the per-client baseline on `onReconnect` (SAME sessionId: the phone may have missed frames); delete the old sessionId's baseline in `takeOver` / `finalLeave`; no frames are sent while frozen (`onTick` returns before `sendHorde`). |
| 23 | Per-client message guard after reconnect | Reset to full buckets each reconnect (L2). |
| 24 | maxClients 8 abuse (B6) | Strangers still refused in `join()` (test); rooms are private (`setPrivate`), so the unlock lists nothing. No abuse found. |
| 25 | Hold leaks (30 drops) | `holds`, `heldPlayers`, `heldSlots` cleared on return (10-wave sim + PR1's 5 cycles leave none). |

### Mutations (each reverted; run on the touched test files)

| # | Mutation | Result |
| --- | --- | --- |
| C1 | **Cut test without the takeover** (`join()` takeover line commented out; not mutated by the builder) | **Failed** (`cut.test.ts`: `expected false to be true`, 4002 close; 2 m 46 s) |
| M1 | No protection on a teammate return (`hold.ts:76`) | 3 failed (hold.test F4, reconnect ×2) |
| M2 | `earn` ignores held owners (F5) | 1 failed (hold.test F5) |
| M3 | Quiet counter counts build phases (B1) | 1 failed (RunController.hold "build-phase quiet doesn't count") |
| M4 | `isStaleInput` always false (F7/B4) | 1 failed (RunController.hold F7 "> 2 s behind") |
| M5 | Seat not remembered in `finalLeave` (F8/B5) | 2 failed (reconnect "hold runs out", "consented Leave remembered") |
| M6 | Watchdog stall rule off (B13) | 1 failed (reconnect.test stall rule) |
| M7 | NetSimHost send gate off (F7) | 1 failed (NetSimHost.reconnect) |
| M8 | Protection blink constant | 1 failed (protectBlink) |
| M9 | Seat not saved to sessionStorage | 1 failed (lobbyStore.reconnect "run.joined saves the seat") |
| M10 | `takeoverAfterMs` 2000 → 20 000 | **Survived** (L4) |
| M11 | Chip countdown ignores the current tick | 1 failed (connectionModel) |
| M12 | holdRunSim: the bot never held | 1 failed (holdRunSim liveness) |
| M13 | `inRun()` false (no holds) | 1 failed (RunRoom.leave "a dropped socket mid-run is held") |
| M14 | 3-2-1 → 1 s | 1 failed (reconnect solo freeze) |
| M15 | `.held-chips` moved to the screen centre | **Survived** (L4) |

### Brief lines

- 25 (named test per [x]): every task names tests that exist (T1 16, T2 5, T3 15 + leave + wiring, T5/T6/T8 as listed); T4's event-queue sub-item is not done (L6).
- 30 (gate line): present (commit 801e1eb, master d8d44d0, 416 files / 3799 tests, load 0.46 → 3.54). Not re-run here.
- 18 (server stays the truth): violated by M1 (a reconnect teleports and protects). 21 (a drop is not a leave; stale inputs dropped): holds (row 15). 27 (measurable timing): watchdog 1 ms sweep ✓; takeover 2 s not pinned (L4). 33 (Epic 6 timers): no pacing/budget change, but the vote outcome changed (M2). 5 (replay): hold/return are replay commands with a digest test ✓ (the server itself records no log, as before). 9/16: M3. 2 (copies): `heldUntilTick`/`protectTicks`/`frozen`/`resumeIn` through schema, syncState, stateView keys, fakeRoom, NetSimHost ✓.

### Re-review asks (brief 28)

Each fix above changes behaviour → narrow re-review whose first task is "exploit this fix": H1/H2 with a build-start index sweep (hold in build/wave/vote × return in build/wave/vote × same/next wave), H3 with held seats at arrival and at `beginWave`, M1's rule with reload-speed (≤ 150 ms) and 3 s holds, M3 with freezes of 3–120 s.

### Review fixes (2026-11-25, builder; each minimal, each with a test; all behaviour-changing → narrow re-review)

| ID | Fix | Test |
| --- | --- | --- |
| H1 | Held players carry `buildIdx = buildStartIndex(world)` (`waves.number + (phase === "build" ? 1 : 0)`); a build start counts as missed only if it grew | `hold.test.ts` › "review H1 … (sweep)" (9 cases: build/wave/vote × same/next) |
| H2 | `RememberedSeat.buildIdx` (from `releaseHeld`) is passed to `restoreSeat` | `RunRoom.reconnect.test.ts` › "review H2: a Leave + rejoin in the same build heals nothing" (twice) |
| H3 | Seats, not bodies: `beginWave` counts `heldPlayers` too; the Behemoth's HP at arrival and `events/common.ts › playersInRun` (stampede size) count held seats. Telegraph gaps / enrage crawlers stay per moment | `hold.test.ts` › "review H3" ×2 (wave size for 4 with 3 held; 4-player boss HP with 3 held) |
| M1 | **Decision 8.1 B15** (auto-accepted overnight, the reviewer's minimal rule): teleport + protection once per player per wave (`PlayerState.protectedReturnWave`), and only after a hold ≥ `returnMinHoldTicks` 60 (3 s); otherwise in place, unprotected | `hold.test.ts` › "review M1 / B15" ×2 (5-cycle loop: only the first; a 150 ms reload and a 59-tick hold in place; next wave again); reconnect tests now expect no protection after a quick return |
| M2 | Vote: held seats are silent (`countVotes.silent`), in the denominator (`resolveEvacVote`), `everyoneVoted` false while one is held, `markEvac` over `heldPlayers` | `hold.test.ts` › "review M2" ×2 |
| M3 | `ServerClock.rebase()` + `AdaptiveDelay.rebase()` when `state.frozen` goes true → false or the link comes back (same room), then one sample at the newest tick | `NetSimHost.reconnect.test.ts` › "review M3: … after a freeze" (lead > 4 s before, < 200 ms within 1 s after; monotonic after) — fails without the call |
| L1 | `run_ended` loops held seats too | `RunRoom.reconnect.test.ts` › "a team wipes … even with a teammate held" (`earned.p1`) |
| L2 | `MessageGuard.add(…, keep)` on a reconnect, `rename(old, new)` on a takeover | `messageGuard.test.ts` › "review L2" |
| L3 | The 15 s retake only after adopting a LATE takeover of this tab (`lateAdoptedAtMs`), never after a normal recovery | `lobbyStore.reconnect.test.ts` › "review L3 …" + the late case |
| L4 | `linkMonitor.test.ts` pins 2000 ms; the chip box is `connectionModel.ts › HELD_CHIPS` (used by `hudLayout.test.ts`) and its CSS twin is cross-checked by `tools/checks/heldChipsCss.test.ts` (the evacVoteCss pattern: the client tsconfig has no Node types and Vitest serves no raw CSS) | mutations 2000 → 20000 (2 tests fail) and `.held-chips` moved (`heldChipsCss` fails) |
| L5 | Drop on Results = leave (D7) | `RunRoom.reconnect.test.ts` › "review L5" |
| L6 | T4's event-queue sub-item unticked (struck through, Not verified 6) | — |
| 8.10 | Comment hooks in `attachClient` (keyframe request), `onReconnect` (reset baseline), `takeOver` and `finalLeave` (delete the old sessionId's baseline) | — |

### Re-review (narrow) 1

Reviewer: re-reviewer child session (autonomous overnight run), 2026-11-25. Scope: ONLY the fix commits b65edc2, 5084cf3, ae23fbd. Tree: `rereview-8-1` = `origin/story-8-1` a4c802c merged with `origin/master` 02e7d8c (8.8, 8.9, building art). **One conflict**, `apps/client/src/scenes/hudLayout.test.ts` import block (master added `BOSS_BAR_NAME_CSS_PX` + moved the evacVoteCss comment; the story added `HELD_CHIPS`): resolved by keeping both (the `connectionModel` comment now names `heldChipsCss.test.ts`). Checks: `npm ci`; `npm run typecheck` green; the 9 touched test files green (127 tests) after the merge; `tools/bots/cut.test.ts` green (64 s). Probes were scratch tests (shared sim, client models, live Colyseus rooms on an OS-picked port), not committed.

**Verdict: FINDINGS — 0 high, 1 medium, 3 low, 4 nit.** H1, H2, H3, M1/B15, L1, L2, L3 hold under every attempt below; the medium is a client-side consequence of M2.

| ID | Sev | Where | Scenario (probed) | Minimal fix |
| --- | --- | --- | --- | --- |
| **RR1-M1** | medium (created by M2) | `apps/client/src/scenes/GameScene.ts:1073` (vote chips from `host.world.players`), `apps/client/src/ui/voteModel.ts:112,121` (`allIn` / result line), `voteUrgent` | **The phone's vote panel contradicts the server once a seat is held.** The mirror drops held teammates (`NetSimHost.ts:299`), so the panel tallies only present players while the server now counts held seats as silent = Extract and `everyoneVoted` waits. Probe (`voteView` + shared `resolveEvacVote`): 4 seats, 2 Stay + 1 Extract present, 1 held → panel **"STAY · 1 – 2"**, server **Extract**. 2 Stay + 2 held → panel "STAY · 0 – 2" for the rest of the 15 s, then the run extracts. `voteUrgent` also says "everyone voted" (urgent sends) while the server waits the full timer. | Add held seats to the vote input as silent (dimmed) chips, from the room state (`heldUntilTick > 0`), so `allIn` stays false, the result line counts them as Extract and `voteUrgent` agrees with `everyoneVoted`. Test: 3 present + 1 held → no result line; result = server's choice. |
| RR1-L1 | low (pre-existing, B15 doesn't close it) | `packages/shared/src/player/hold.ts:50` (body leaves the World at once on a drop) | **Vanishing is still an invulnerability** — B15's doc says "never an escape or an invulnerability". A held body is not in `world.players`: no zombie or boss target, no blast or slam. Probe: hold, 50-damage blast on the spot, return 5 ticks later → in place, unprotected, **HP unchanged** (the same blast hits a present body). Unlimited per wave (B15 only limits teleport + protection). Costs the cheater a blind reconnect (airplane mode, or a modified client). Co-op only. | Designer call. Option: a mid-wave DROP keeps the body in the World (standing, hittable, untargeted by nothing) for `returnMinHoldTicks` before it vanishes — the 3 s the quiet rule already waits; or record it as accepted in B15 and fix the doc line. |
| RR1-L2 | low (designer note on H3) | `packages/shared/src/waves/waveDirector.ts:376`, `packages/shared/src/boss/behemoth.ts:182` | **A held seat that never comes back sizes what starts in its 120 s.** Probe: count drops to 1 when the hold expires (live room, `holdS` 0.4) and a real solo still gets ×0.35 / solo HP — but a 2-player team whose mate's phone dies faces the next wave sized for 2 and, if the Behemoth arrives inside the hold, 2-player HP (×0.6 vs solo ×0.4 = 1.5×) for the whole fight, while gaps / crawlers (`telegraph.ts:281`, `enrage.ts:101`, present bodies) run at solo pace. Bounded (one wave / one boss), the intended trade against H3's cheese. | Optional: when a hold expires (`releaseHeld`) with the boss alive, rescale `hp`/`maxHp` to the new seat count keeping the fraction. Or accept in B15. |
| RR1-L3 | low (test asserts an unreachable state) | `packages/shared/src/player/hold.test.ts:303`, `hold.ts:87` | **Solo returns are never protected now.** Solo (and any all-held team) freezes the World, so `world.tick − atTick` stays 0 → `longHold` false → in place, unprotected. Probe (live room): solo drop mid-wave, 4 s frozen, token return → `protectTicks` 0. The shared test gets protection only by advancing `world.tick` by hand during a "freeze" — impossible in a room. The 3-2-1 arguably gives the beat (zombies stood still too), but D3's "nobody standing: in place, still protected" silently no longer applies to solo. | Either decide (B15 note: "a frozen World's return is covered by the 3-2-1") and change the test to expect 0, or measure the hold in room ms (`hold.atMs`) for the frozen case. |
| RR1-N1 | nit | `hold.test.ts:494` (M2) | `everyoneVoted`'s held check survives mutation (`|| heldPlayers.size > 0` removed → 31/31 green): the test calls `resolveEvacVote` directly. The probe confirms the behaviour (3 seats, 2 Stay + 1 held: the vote runs 300 ticks = the whole 15 s, bounded; ends earlier if the hold expires). | Step the World in the vote with a held seat and assert it is still "vote" after `allVotedHoldS`. |
| RR1-N2 | nit | `apps/client/src/net/linkMonitor.ts:110` (L3) | `adopt(r, late)` wiring untested: setting `lateAdoptedAtMs` on every adopt passes linkMonitor + lobbyStore tests (16/16) — the L3 tests set the flag by hand. | One linkMonitor test: a normal recovery leaves `lateAdoptedAtMs` −∞, a late one sets it. |
| RR1-N3 | nit | `apps/server/src/rooms/RunRoom.ts` `takeOver` (L2), `NetSimHost.ts:1070` (M3), `events/common.ts:67` (H3) | Wiring untested: removing `net.rename` in `takeOver` passes the 24 touched server tests (my live probe — same guard object after a takeover — catches it); removing `delay.rebase()` or the link-up edge passes the M3 test; `playersInRun` without held seats passes 143 shared tests. | A room-level guard-identity test; an M3 case for the link edge; one stampede-size case with a held seat. |
| RR1-N4 | nit | `NetSimHost.ts:1068` (M3) | The re-base is taken on the frame the overlay LIFTS (`frozen` true → false), not while it covers: the drawn picture steps back by the render delay (probe: 1 tick in the fake at 50 ms delay; ~2–5 ticks at a real 100–250 ms) — the last pre-freeze motion replays once. Monotonic after (probe: 30 frames). Link edge: 0 step. | Accept, or freeze the render clock while `frozen` (no step at all). |

#### Attempts (each fix: "exploit this fix")

| # | Fix | Attempt | Result |
| --- | --- | --- | --- |
| 1 | H1 | Live: HP 20, drop in build → wave starts → token return | HP 20 kept ✔ |
| 2 | H1 | Live: drop in wave → build → return (heal once), drop again in that build → return in the next wave | 20 → 70, then 70 kept (no 2nd heal) ✔ |
| 3 | H1 | Real state machine: held in the wave-10 vote → Stay → endless build → return | one heal ✔; `buildStartIndex` vote 10 → build 11 → wave 11 (no heal from build → wave) ✔ |
| 4 | H1 | Two build starts while held | one catch-up (one heal), never two ✔ |
| 5 | H2 | Leave + rejoin same build ×2, then Leave → next build → rejoin | 20, 20, then one heal ✔ (+ the story's live test) |
| 6 | H3 | Count with a held seat, after hold expiry (live, `holdS` 0.4), real solo wave size | 2 → 1 on expiry; real solo ×0.35 ✔ — residual harm RR1-L2 |
| 7 | H3 | grep `players.size` in `packages/shared/src` for other run-long counts | only per-moment ones left (boss gaps, enrage crawlers, wipe/ready checks) ✔ |
| 8 | B15 | Live: two 3 s+ drops in one wave (teammate sending inputs) | 1st teleported + protected, 2nd `{moved 0, prot 0}` ✔ |
| 9 | B15 | Per wave across 9 → 10 → endless 11, 12 | one protected return per wave each wave ✔ |
| 10 | B15 | Alternate two players | per-player field, each gets one per wave (accepted rule) ✔ |
| 11 | B15 | In-place return as an escape: blast on the vanished spot | **dodged** → RR1-L1 |
| 12 | B15 | Solo / all-held freeze | never protected → RR1-L3 |
| 13 | B15 | Honest phone dropping twice in a wave | 2nd lands where it vanished (zombies had retargeted away) unprotected — the accepted B15 cost |
| 14 | M2 | 2 Stay + 1 Extract + 1 held; 2 Stay + 2 held | server Extract ✔; **phone panel says STAY** → RR1-M1 |
| 15 | M2 | Held seat returning during the vote | vote cleared at the hold, can vote again (`castVote` once in `players`) ✔ |
| 16 | M2 | All present voted, one held | waits the whole 15 s timer (300 ticks), bounded ✔ (RR1-N1) |
| 17 | M3 | 6 s freeze, then resume; link down 6 s, then up | backward step 1 tick at the freeze edge (RR1-N4), 0 at the link edge; monotonic 30 frames after ✔ |
| 18 | L2 | Live takeover: guard object for the new session; old socket's leave | same object, old key gone, 2 guards ✔ |
| 19 | L3 | Mutation: every adopt sets the late flag | passes → RR1-N2 |

#### Mutations (each reverted)

| Mutation | Result |
| --- | --- |
| `buildStartIndex` without the build +1 | 4 fail ✔ |
| drop `protectedReturnWave` check | 1 fail ✔ |
| `longHold = true` | 1 fail ✔ |
| `beginWave` count without held | 1 fail ✔ |
| Behemoth HP without held | 1 fail ✔ |
| `countVotes` without held silent | 1 fail ✔ |
| no `markHeldEvac` | 1 fail ✔ |
| `everyoneVoted` without held check | **0 fail** (RR1-N1) |
| `restoreSeat(…, −1)` (H2) | 1 fail ✔ |
| `playersInRun` without held | **0 fail** (RR1-N3) |
| no `clock.rebase()` | 1 fail ✔ |
| no `delay.rebase()` / no link-up edge | **0 fail** (RR1-N3) |
| `add` ignores `keep` | 1 fail ✔ |
| no `net.rename` in `takeOver` | **0 fail** in the touched tests (RR1-N3; caught by the live probe) |
| late flag on every adopt | **0 fail** (RR1-N2) |
| `run_ended` without held seats | 1 fail ✔ |
| `HELD_CHIPS` renamed / CSS twin | `heldChipsCss` fails ✔ |

### Re-review 1 fixes (2026-11-25, builder)

| ID | Fix | Test |
| --- | --- | --- |
| RR1-M1 | Held seats join the vote panel as silent, dimmed chips (`NetSimHost.heldSeatSlots` from the room state → `voteModel.addHeldVoters` in GameScene): no result line until the server's rule allows one, the line counts them as Extract, `voteUrgent` agrees with `everyoneVoted` | `connectionModel.test.ts` › "RR1-M1" ×2 (2 Stay + 1 Extract + 1 held: no "STAY · 1 – 2", not urgent; outcome EXTRACT), `NetSimHost.reconnect.test.ts` › "heldSeatSlots", wiring `reconnectWiring.test.ts` › "RR1-M1" |
| B16 (RR1-L1) | **Decision 8.1 B16** (auto-accepted overnight): `RunController.dropPlayer` — mid-wave the dropped body stays `returnMinHoldTicks` (3 s) in the World, standing, hittable, a target, then vanishes (`onDropHold`, log `player_vanished`); `cancelDrop` on a return inside the 3 s (plays on in place); build/vote hold at once. Freeze only once nobody is present (a dropping body counts) | `RunController.hold.test.ts` › "decision B16" ×4 (60 ticks then held; a blast hits the dropping body; back within 3 s in place, unprotected, inputs applied, countdown stopped; build = held at once); `RunRoom.reconnect.test.ts` › "B16: downed and back within the 3 s: still downed in place"; room tests now wait out the 3 s before "vanished" |
| B17 (RR1-L2) | **Decision 8.1 B17**: accepted as is (bounded by the 120 s hold) | — |
| B18 (RR1-L3) | **Decision 8.1 B18**: in a frozen World the 3-2-1 replaces protection | `hold.test.ts` › "decision 8.1 B18: solo …" (no tick advanced by hand; protectTicks 0); `RunRoom.reconnect.test.ts` › solo freeze asserts protectTicks 0 while the 3-2-1 shows |
| RR1-N4 | While `state.frozen` both phone clocks hold still; when the freeze lifts the render clock moves on from where it stood (`AdaptiveDelay.rebase(true)`), so nothing drawn steps back; a link-up edge re-bases fully (the reconnecting panel covers it) | `NetSimHost.reconnect.test.ts` › "review M3" (render tick constant while frozen, monotonic across the lift) + "a phone that missed a whole freeze …" (link edge; fails without `delay.rebase` or without the link edge) |
| RR1-N1/N2/N3 | Tests that bite: `everyoneVoted`'s held check (`hold.test.ts` › "N1", stepping the World), late flag only on a late adopt (`linkMonitor.test.ts` › "RR1-N2"), `net.rename` in `takeOver` (`RunRoom.reconnect.test.ts` › takeover of a connected seat checks the guard object), `playersInRun` counts held (`hold.test.ts` › "N3"), `delay.rebase` / link edge (above) | each mutation now fails a test |

### Merge with Story 8.10 (2026-11-25, 8.1 lands second)

- Merged master f67154d (8.10): conflicts kept both sides (sprint-status, NetSimHost — 8.10 moved `receiveHorde`, 8.1's clock re-base kept —, perf doc, `JoinRefusal` now has both `seat_kept` and `update_required`, bots `--kbps` and `--cut-*`).
- `RunRoom.attachClient` calls `this.horde?.resetHordeStream(client)` (belt and braces: every caller passes a new Colyseus client); `takeOver` and `finalLeave` call `forgetClient` on the old socket.
- New test `RunRoom.reconnect.test.ts` › "the first frame after a token reconnect, and after a takeover, is a keyframe and decodes with no error" (fresh `HordeStreamDecoder` decodes every frame; the frames carry the zombie). Join options in the 8.1 tests carry `netProtocolVersion`.

### Re-review (narrow) 2

Reviewer: re-reviewer child session (autonomous overnight run), 2026-11-25. Scope: ONLY 06654ed (RR1-M1), babd790 (B16), 01de5bb (B17/B18, RR1-N4, N1–N3). Tree: `rereview2-8-1` = `origin/story-8-1` bd05dfa merged with `origin/master` ad9388f — **no conflicts**. Checks: `npm ci`; `npm run typecheck` green; touched tests (`RunRoom.reconnect`, `RunController.hold`, `hold`, `NetSimHost.reconnect`, `connectionModel`, `linkMonitor`, `reconnectWiring`) + `tools/bots/cut.test.ts`: 8 files, 88 tests green. Probes: live Colyseus rooms (test server, OS-picked port), RunController, NetSimHost on the FakeRoom; kept (not run by the gate) in `_bmad-output/implementation-artifacts/probes/8-1-rr2/*.probe.ts.txt`.

**Verdict: FINDINGS — 0 high, 2 medium, 1 low, 1 nit.** RR1-M1 holds under every vote probe; B16's server side does what it says (hittable, a target, 3 s, in place within 3 s, build/vote at once, chained drops give nothing); the two mediums are B16's edges: what teammates SEE during the 3 s, and B15's 3 s clock now starting at the vanish.

| ID | Severity | Where | Finding | Minimal fix |
| --- | --- | --- | --- | --- |
| RR2-M1 | medium | `apps/server/src/rooms/RunRoom.ts:512` (sets `heldUntilTick` at the drop) × `apps/client/src/sim/NetSimHost.ts:297-303` (`dropMissing` / `addMissing` remove any teammate with `heldUntilTick > 0`) | **The 3 s dropping body is invisible to the team.** B16 keeps the body in the server World (standing, hittable, a target), but `startHold` writes `heldUntilTick` at once, and every teammate's mirror removes a body with `heldUntilTick > 0`. Probe (NetSimHost, FakeRoom): teammate on my map before = true, after the drop patch = **false**. For 3 s zombies (and a Behemoth telegraph) converge on an empty spot; a DOWNED dropping teammate is revivable on the server (probe: still `downed`, bleed-out 400 → 379 in 1 s) but shows no body, no ring, no revive prompt; on a return within 3 s the body pops back in place. | Write `heldUntilTick` only when the body actually leaves the World: skip it in `startHold` while `controller.isDropping(id)`, set it in `onDropHold` (end time from `hold.atMs`, the 120 s unchanged). The chips, the vote panel (RR1-M1) and the mirror follow. (Or a separate `dropping` schema flag: chip yes, body kept.) |
| RR2-M2 | medium | `packages/shared/src/player/hold.ts:54` (`atTick` = the vanish tick) × `hold.ts:87` (`longHold`) | **B15's "hold ≥ 3 s" now counts from the vanish, so the safe return needs ≥ 6 s away.** Live room (teammate present): back after 2.5 s → not vanished, in place, protect 0 ✔ (B16); after **4 s** → vanished at +59 ticks, returned **in place, protect 0, `protectedReturnWave` −1**; after 7 s → teleported next to Ana, protect 40. An honest phone back in 3–6 s (the common Wi-Fi blip) lands, unprotected, where its body stood 3 s while the horde converged — F4 "coming back mid-wave is safe" no longer holds for it. Not an escape either way. | Count the hold from the drop: the B16 vanish holds with `atTick = world.tick − returnMinHoldTicks` (e.g. `holdPlayer(world, id, sinceTick)` from the countdown in `RunController.holdQuietPlayers`), so a return after the vanish is ≥ 3 s by construction. Escape check with the fix: a 3.1 s return teleports + protects at most once per wave (B15 unchanged) after 3 s standing hittable — no new loop. |
| RR2-L1 | low (designer note on B16 (h)) | `apps/server/src/rooms/RunRoom.ts:546-552` (`updateFreeze`: `activeCount() === 0`) × `RunController.ts:703` (the countdown runs only in a stepped wave) | **Solo: a re-drop during the 3-2-1 no longer cancels it.** Live: solo back → `resumeIn` 3 → drops again (0 ms and 300 ms into the count): the dropping body counts as present, its 3 s can't run while frozen, so the count finishes, the World **resumes with nobody connected**, runs 60 ticks (the body eaten), then refreezes. The doc line "everyone gone again cancels it" is now false. Also the plain solo drop: World ran **60 ticks (3.0 s) before `frozen`** with the phone gone — what B16 says ("a dropping body counts"), so intended; a flapping solo phone pays 3 s per flap. | Accept and fix the doc line, or while frozen treat a dropping body as absent (cancel the 3-2-1 and hold it at once: `if (state.frozen && isDropping) holdPlayer`). |
| RR2-N1 | nit | `apps/client/src/sim/NetSimHost.ts:1089` × the `wasFrozen` guard in `update` | Link up **while** frozen (down before the freeze began): the full re-base sets the render tick NaN and the held clocks keep it NaN for the rest of the freeze; at the lift it anchors **0.34 tick (17 ms) below** the last frame drawn before the link loss (sweep, 50/50 offsets). Covered by the paused overlay; every other ordering 0. | Accept (or advance once on the link-up frame so the held value is a number). |

#### Attempts

| # | Area | Attempt | Result |
| --- | --- | --- | --- |
| 1 | RR1-M1 | 2 Stay + 1 Extract + 1 held | no result line, not urgent, final EXTRACT · 2 – 2 ✔ |
| 2 | RR1-M1 | 2 Stay + 2 held | 4 chips (2 dimmed), no line, not urgent, EXTRACT · 2 – 2 (= server `voteOutcome(2, 4)`) ✔ |
| 3 | RR1-M1 | held seat returns mid-vote and votes Extract | 4 in → "EXTRACT · 2 – 2", urgent ✔ (server: `returnPlayer` in vote, `castVote` accepted) |
| 4 | RR1-M1 | last present vote while a seat is held | urgent false until the last 500 ms ✔ (server `everyoneVoted` false, waits) |
| 5 | RR1-M1 | hold expires during the vote | seat leaves the state → chip gone, 3 chips, all in → "STAY · 1 – 2" + urgent; server `releaseHeld` drops it from `countVotes` too ✔ |
| 6 | RR1-M1 | 568×320 with 4 chips + held | a held seat is one of the 4 seats: `addHeldVoters` caps at 4 (preallocated); buttons 96–236 / 332–472 ✔. No double chip for a seat dropped in a wave's last 3 s (the mirror already dropped its body — RR2-M1's other side) |
| 7 | B16 (a) | blast on a dropping body | hit ✔ (builder test, re-run); a blast on the exact vanish tick misses (hold before step — inherent) |
| 8 | B16 (b) | live: back at 2.5 s / 4 s / 7 s | in place unprotected / **in place unprotected (vanished)** / teleport + protect 40 → RR2-M2 |
| 9 | B16 (b) | 3.1 s escape loop? | no: today 3–6 s is in place unprotected, ≥ 6 s once per wave; with RR2-M2's fix once per wave after 3 s hittable ✔ |
| 10 | B16 (c) | chained drops: drop 55 ticks, back, ×10 (controller) | never held, B15 never used, **0 inputs applied while dropping**: a decoy that can't move or shoot — no gain over standing still connected ✔ |
| 11 | B16 (d) | downed dropping (live) | stays downed, bleed-out runs (400 → 379 in 1 s), revivable on the server — invisible to the reviver (RR2-M1); vanish → out (F1) ✔; back < 3 s → downed in place ✔ |
| 12 | B16 (e) | both drop at once (live) | not frozen at the drop; frozen after 60 ticks, both held ✔ |
| 13 | B16 (f) | drop in build (live) | held at once ✔. Wave ends while dropping (controller): build heal on the body (20 → 70), held at once, return in the build heals nothing more ✔ |
| 14 | B16 (g) | Behemoth telegraph on a dropping body | it is in `world.players`: targeted for 3 s; the vanish clears the threat slot (`holdPlayer`) → retarget ✔ (shown as aiming at nothing: RR2-M1) |
| 15 | B16 (h) | solo drop (live) | World runs 60 ticks (3.0 s), then frozen — as B16 decided → RR2-L1 note |
| 16 | B16 (h) | solo re-drop at 0 / 300 ms into the 3-2-1 (live) | count completes, World resumes with nobody connected 60 ticks, refreezes → RR2-L1 |
| 17 | B16 | re-drop after a token return (2p 100 ms / 1 s, solo after the 3-2-1, SDK auto-reconnect ×2) | held each time ✔ (a socket killed in the same JS turn as the reconnect frees the seat — test artifact, a real close is a later I/O event) |
| 18 | RR1-N4 | stateful 1 ms sweep (50 offsets): freeze/lift; down in freeze → up after lift; down → up inside a freeze it never saw start; 120 ms freeze; lift + up same ms; down before freeze → up inside it | 0 step back in 5 orderings (the lift + up same ms one: 0.34 at the covered link-up edge, allowed); **0.34 tick at the lift** in the last → RR2-N1 |

#### Mutations (each reverted; one per new probe)

| Mutation | Result |
| --- | --- |
| `longHold = true` | controller B15 probe fails ✔ |
| `queueInput` accepts a dropping seat | chained-drop probe fails ✔ |
| catch-up on `>=` build index | wave-end probe fails ✔ |
| mirror keeps held teammates | client B16 probe flips to pass ✔ (it asserts the B16 intent) |
| `addHeldVoters` adds nothing | vote probe fails ✔ |
| `delay.rebase(false)` on the lift | N4 sweep fails ✔ |
| `dropPlayer` holds at once mid-wave | live room probe fails ✔ |

### Re-review 2 fixes (2026-11-25, builder)

| ID | Fix | Test |
| --- | --- | --- |
| RR2-M1 | `heldUntilTick` is written only when the body really leaves the World: not in `startHold` while `controller.isDropping`, but in `onDropHold` at the vanish (end time still from the drop: `hold.atMs` + 120 s). Teammates' mirrors keep the B16 dropping body (and a downed one's ring and revive prompt) for its 3 s; the chip and the vote panel follow at the vanish | `RunRoom.reconnect.test.ts` › "a drop mid-wave …" (teammate's state `heldUntilTick` 0 while the body stands, then vanished); `NetSimHost.reconnect.test.ts` › "RR2-M1: the mirror keeps a teammate's body until heldUntilTick is written" |
| RR2-M2 | The B16 vanish holds with `atTick` backdated by the 3 s already away (`holdPlayer(world, id, awayTicks)`), so B15's "away ≥ 3 s" counts from the DROP | `RunController.hold.test.ts` › "RR2-M2" ×2 (back at 4 s → the wave's one teleport + protection; back at 2.5 s → in place, unprotected); the room drop test now expects the protected return |
| B18 kept | With RR2-M2 a solo return after the vanish would count as long: `returnPlayer(…, allowProtect)` — the room passes `!state.frozen`, so a frozen World's return stays in place and unprotected (the 3-2-1 replaces it) | `RunRoom.reconnect.test.ts` › solo freeze (protectTicks 0 while the 3-2-1 shows) |
| RR2-L1 | **Decision 8.1 B19** (auto-accepted overnight): a dropping body counts as present, so a solo drop (or a re-drop during the 3-2-1) first runs its 3 s in a stepped World, then freezes; the stale doc line in `RunRoom.updateFreeze` fixed | — (doc) |
| RR2-N1 | Accepted (the paused overlay covers the 17 ms) | — |
| Flakes | `RunRoom.reconnect.test.ts` › "a quiet seat that then drops keeps its 120 s clock": asserts the window the room passes to `allowReconnection` (≤ 3.6 − 1.5 s: what is left of the first hold), not wall time; waits 10 s / 15 s. `tools/bots/cut.test.ts`: waits on conditions with more room (ready 30 s, ack 15 s, back 15 s × slack), the AC's 10 s bound × `max(1, load/2)` (exactly 10 s at load ≤ 2), timeout 360 s | both green together with the server suite + the economy sims in parallel (load 4.69) |


Gate (re-review 2, 2026-11-25 07:34–07:41 UTC, after merging origin/master — already up to date): `npm run typecheck && npm run lint && npm test && npm run build` → EXIT 0; 429 test files passed / 1 skipped, 3896 tests passed / 3 skipped; build ok. Load 0.71 at start, 4.30 at end.

### Re-review (narrow) 3

Reviewer: re-reviewer child session (autonomous overnight run), 2026-11-25. Scope: ONLY f587c26 (RR2-M1, RR2-M2, B18 `allowProtect`, B19 doc, the two flake hardenings). Tree: `rereview3-8-1` = `origin/story-8-1` 24e3aa8 merged with `origin/master` 8248be0 — **no conflicts**. Checks: `npm ci`; `npm run typecheck` green; touched tests (`RunRoom.reconnect`, `RunController.hold`, `hold`, `NetSimHost.reconnect`): 4 files, 69 tests green; `tools/bots/cut.test.ts` green (`backAfterCutEndMs` 303, `loadSlack` 1, load ≈ 0.3). Probes (controller + live Colyseus room) kept, not run by the gate, in `_bmad-output/implementation-artifacts/probes/8-1-rr3/*.probe.ts.txt`. (Re-review 2's `probes/8-1-rr2/` was never committed: RR3-N2.)

**Verdict: FINDINGS — 0 high, 1 medium, 1 low, 2 nit.** RR2-M1, RR2-M2 and B18 do what they say under every attempt below; no early expiry, no carry-over, no new escape. The medium is RR2-M2's twin on the quiet path (pre-existing, not closed by the fix).

| ID | Severity | Where | Finding | Minimal fix |
| --- | --- | --- | --- | --- |
| RR3-M1 | medium (pre-existing; RR2-M2's twin) | `apps/server/src/run/RunController.ts:712` (`holdPlayer(s.playerId)` in the quiet loop, no `awayTicks`) × `packages/shared/src/player/hold.ts:89` (`longHold`) | **D1's quiet hold still counts B15's 3 s from the vanish.** A quiet phone's body stands 3 s (60 ticks, hittable, a target) exactly like a B16 drop, but the quiet vanish holds with `atTick = world.tick`, so its "away ≥ 3 s" needs ≥ 6 s of silence. Probes: controller — silent 61 ticks → held, inputs 20 ticks later (4 s silent) → **in place, protect 0**; live room (teammate sending) — quiet hold, input 1 s later → `{moved 0, prot 0}`, while a DROP back at the same 4 s now teleports + protects 40. RR2-M2's argument ("an honest phone back in 3–6 s lands, unprotected, where its body stood while the horde converged") applies unchanged to an app switch / tunnel. Not an escape either way. The room test "a connected player with no input for 3 s … returns it next to a teammate" asserts `protectTicks` 0, contradicting its own title. | `holdPlayer(s.playerId, s.quietTicks)` (or `QUIET_HOLD_TICKS`) in `holdQuietPlayers`'s quiet loop; flip that room test to expect the wave's one protected return. Or record in B15 that the quiet path is intentionally counted from the vanish. |
| RR3-L1 | low (test strength) | `tools/bots/cut.test.ts:61,83,86` (`loadSlack = max(1, load/2)`) | **The AC 11 bound (back ≤ 10 s after the cut) has no ceiling under load.** Load 4 → 20 s, 8 → 40 s, 16 → 80 s (the `until` wait scales too: 15 s × slack). Measured here: back **303 ms** after the cut ends — the real margin is ~30×, so the 10 s bound itself was never the flaky part; scaling it mostly lets a real regression (e.g. a reconnect that waits out a 15–20 s backoff) pass on a loaded CI box. A tick bound doesn't fit (the SDK's reconnect backoff is wall-clock; under load the server's ticks stretch too and would hide the same regression). | Keep the slack on the waits (ready / ack / `until`) only and assert the AC's 10 s unscaled; or cap it (`min(2, …)`). |
| RR3-N1 | nit (test gap) | `apps/server/src/rooms/RunRoom.ts:1018` (`onDropHold`'s end time) | **Nothing pins "the 120 s still run from the drop" in `heldUntilTick`.** Mutation: end time from the vanish (`w.tick + holdS·20`) → all 19 `RunRoom.reconnect` tests pass; teammates' chips would read 3 s more than the seat really has (the seat still expires at drop + holdS: Colyseus window). Probe R1 pins it: `heldUntilTick − dropTick` = 121 for holdS 6 (expected 120 ± 1), seat left 6016 ms after the drop. | One assertion in the drop test: `heldUntilTick − tickAtDrop ≈ holdS × 20`. |
| RR3-N2 | nit (record) | this file, re-review 2 header | Re-review 2 says its probes are kept in `probes/8-1-rr2/*.probe.ts.txt`; that directory was never committed (absent on `story-8-1` and master). | Accept; re-review 3's probes are committed under `probes/8-1-rr3/`. |

#### Attempts

| # | Area | Attempt | Result |
| --- | --- | --- | --- |
| 1 | RR2-M1 | live room: drop, sample teammate state every 100 ms while the body stands | 29 samples, `heldUntilTick` 0 in all; vanish after exactly 60 ticks; Ana's state gets `heldUntilTick` at the vanish ✔ |
| 2 | RR2-M1 | end time at the vanish | `heldUntilTick − dropTick` = 121 (holdS 6 → 120): from the drop ✔; seat left 6016 ms after the drop — **not 3 s early, not 3 s late** ✔ |
| 3 | RR2-M1 | client mirrors (NetSimHost, Predictor, devThrottle) | one removal point (`NetSimHost.dropMissing` / `addMissing`, `heldUntilTick > 0`); the Predictor reads `host.world`, devThrottle wraps the room's patches: all follow the same field, body removed in the patch of the vanish ✔ |
| 4 | RR2-M1 | downed dropping teammate (live) | Ana's view at +1 s: `heldUntilTick` 0, `status` downed, bleed-out 375 → body, ring and revive prompt drawn; vanish → held, `out` (F1) ✔ |
| 5 | RR2-M2 | return at 2.9 s (58 ticks) | still dropping, `returnPlayer` false → `cancelDrop`, in place, protect 0 ✔ |
| 6 | RR2-M2 | return on the vanish tick | away 61 ticks (60 credited + the step; same +1 convention as any hold), teleport + protect 40 ✔ |
| 7 | RR2-M2 | return at 3.1 s / then a second ≥ 3 s drop at 4 s in the same wave | 1st teleport + protect 40; 2nd in place, protect 0 (B15 once per wave) ✔ |
| 8 | RR2-M2 | carry-over: drop, back at 1 s, drop again, vanish | `dropTicks` restarts at 60 on the 2nd drop; away at its vanish 61 = 2nd drop only; a "0 s second drop" can't reach the hold without its own 3 s standing ✔ |
| 9 | RR2-M2 | drop, wave ends at 1 s | held at once in build with away 21 (what it really stood) — a build return gets nothing anyway ✔ |
| 10 | RR2-M2 | does backdating shorten the 120 s? | no: `atTick` only feeds `longHold`; the window is Colyseus's `allowReconnection(leftS)` from `hold.atMs` (the drop) and `heldUntilTick` from the drop (#2) ✔ |
| 11 | D1 | quiet 3 s → held, inputs 1 s later (controller + live) | **in place, protect 0** → RR3-M1 |
| 12 | B18 | `returnPlayer(id, false)` after a 4 s hold | in place, protect 0, `protectedReturnWave` not consumed (−1) ✔; room passes `!state.frozen` before `updateFreeze`, so the first back into a frozen World is unprotected; returns during the 3-2-1 too (still frozen) ✔ |
| 13 | Flake | quiet-then-drop test now asserts the `allowReconnection` window | holds the D1 rule (mutation M6 caught) ✔ |
| 14 | Flake | cut.test `loadSlack` | unbounded with load; real margin 303 ms vs 10 s → RR3-L1 |

#### Mutations (each reverted; one per new test)

| Mutation | Result |
| --- | --- |
| M1 `startHold` writes `heldUntilTick` at the drop (no `isDropping` guard) | room drop test fails ✔ |
| M2 `holdPlayer(id, 0)` at the vanish (no backdating) | `RunController.hold` RR2-M2 "back 4 s" + room drop test fail ✔ |
| M3 `returnPlayer` ignores `allowProtect` | room solo freeze test fails ✔ |
| M4 mirror keeps held teammates (`> 1e9` in `dropMissing` + `addMissing`) | `NetSimHost` RR2-M1 test fails ✔ (a first try changing `dropMissing` only survived: `addMissing` re-adds — the test's two sides are both needed, fine) |
| M5 `onDropHold` writes no `heldUntilTick` | room drop test fails ✔ |
| M6 a drop after a quiet hold restarts the window (`allowReconnection(holdS)`) | quiet-then-drop test fails ✔ |
| M7 `onDropHold` end time from the vanish (fresh holdS) | **all 19 room tests pass** → RR3-N1 |
| cut.test | not mutated (a regression must exceed 10 s to show; argued in RR3-L1 instead) |

## Change Log

- 2026-11-24: story file created (ready-for-dev, decisions pending; Network pass ACs merged in).
- 2026-11-25: built (T1–T9), merged with master after 8.8 and 8.9 landed; decisions 8.1 B1–B14 auto-accepted overnight; status review.
- 2026-11-25: senior developer review (AI): changes requested (H1–H3, M1–M3, L1–L6); findings above.
- 2026-11-25: review fixes H1–H3, M1 (decision 8.1 B15), M2, M3, L1–L6 (builder); 8.10 hooks left as comments.
- 2026-11-25: narrow re-review 1: RR1-M1, B16–B18 auto-accepted, nits N1–N4.
- 2026-11-25: re-review 1 fixes RR1-M1, B16 (dropped body stays 3 s), B17 (accepted), B18 (solo: 3-2-1 replaces protection), N1–N4 (builder).
- 2026-11-25: merged master with Story 8.10; 8.10 hooks wired (resetHordeStream / forgetClient) and the keyframe-after-reconnect test (8.1 landed second).
- 2026-11-25: re-review 2 fixes RR2-M1, RR2-M2 (+ B18 kept via allowProtect), B19 recorded, two flaky tests hardened (builder).
- 2026-11-25: narrow re-review 3: RR3-M1 (quiet path B15 from the vanish), RR3-L1 (cut.test load slack unbounded), N1–N2.
