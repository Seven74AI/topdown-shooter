---
baseline_commit: b0e491a9e10eb5acb73fbbecb7f30aba93ab8172
---

# Story 8.1: Reconnect within 2 minutes

Status: in-progress

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
- **F4 "Coming back mid-wave is safe, not an escape."** Mid-wave a returning player appears next to a standing teammate (the 2.8 build-start spot rule: `findFreeSpotNear` the lowest-slot standing teammate), never where they vanished, with **2 s** of spawn protection (can't be hurt, can't shoot; shown blinking) (decision 8.1 D3). In a build phase they appear where they were.
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

- [ ] **T1 Shared sim: hold and return** (AC 1–3, F1–F5): in `packages/shared/src/player/player.ts` next to `removePlayer` (line 174): `holdPlayer(world, id)` moves the `PlayerState` from `world.players` to `world.heldPlayers` (new `Map` on `World`, `core/world.ts`), does what `removePlayer` does to the boss threat slot and the flame slot, turns `downed` into `out`, cancels a reload, returns a carried building to the hand (build phase); `returnPlayer(world, id, at)` puts it back (reclaims the flame slot; status `out` stays out until the build start; spawn protection ticks from `balance` → `config/balance/player.json › returnProtectTicks` 40). Every system that iterates `world.players` now ignores held players for free; grep for `players.get(` lookups by owner id (turret/trap/mine pay, kill credit, `buildings.ts`, economy) and make the pay path also find a held owner (F5) and nobody after the hold. `snapshotWorld` includes `heldPlayers`.
- [ ] **T2 Controller + quiet rule** (AC 2, 3, 10): `RunController.holdPlayer/returnPlayer/isHeld`, the 60-tick quiet counter per player (no input queued and none applied), input-queue reset on return; `RunController.removePlayer` (line 494) stays the final leave.
- [ ] **T3 Room lifecycle** (AC 1, 6, 8, 9, 10): `RunRoom.onDrop` / `onReconnect` / `onLeave` (keep the 2.11 comment's promise: consented leave → `onLeave` directly); hold fields on `PlayerState` schema (`heldUntilTick` u32, 0 = connected) and `RunState` (`frozen` bool, `resumeIn` u8) through every copy (brief 2: RunState.ts → syncState → stateView key lists → fakeRoom → devThrottle StateCopy → mirror → bots); the guest-token takeover in `join()` (today: `already_joined` refusal at `RunRoom.ts:332` — becomes "take over" in a started run for a held or connected seat with the same hash; lobby keeps the refusal); `rememberedSeats`; `pingMaxRetries: 4` in `app.ts`; logs `player_held {reason: drop|quiet}`, `player_returned {afterMs, via: token|guest}`, `player_hold_expired`, `room_frozen`, `room_resumed`.
- [ ] **T4 Horde and events on return**: `HordeEncoder.send` already sends only to `ClientState.JOINED` clients (`hordeEncoder.ts:33-38`, a comment there anticipates this story): check that a reconnected client is JOINED again and gets frames the next tick; events (`sim.events_flushed`) are not replayed for the offline time (the phone resets its event queue on return); `RunInbox` (`session.ts:213`) handlers survive an SDK reconnect of the same `Room` (verify in `node_modules/@colyseus/sdk/build/Room.mjs`).
- [ ] **T5 Client reconnect** (AC 4–7): `apps/client/src/net/connection.ts` sets `room.reconnection` (enabled, `maxEnqueuedMessages 0`, `minDelay 500`, `maxDelay 3000`, `maxRetries` enough for 120 s; `minUptime` 5000 default means a drop in the first 5 s after joining doesn't auto-reconnect: handle it with the guest-token path) and stores `{ roomId, reconnectionToken }` in `sessionStorage` (`activeRun.ts` is the natural home); `lobbyStore.ts:170` `room.onLeave` must no longer treat a drop as "lost" while reconnection is pending (use `room.onDrop` / `onReconnect`); the watchdog in `NetSimHost.update` (or the session) with the last-message time from `RunInbox` (any message, any type); the reload fallback (`visibilitychange` timestamps); `main.ts` start-up: a `sessionStorage` entry → try reconnect before the start screen.
- [ ] **T6 UI** (AC 1, 4, 9, 10; decision 8.1 D2, D4): the reconnecting screen (Preact overlay, `apps/client/src/ui/`), the grey team-list chip with countdown (team list from Story 2.9), toasts, "seat kept" waiting screen, "Paused: nobody connected" and 3-2-1; spawn-protection blink on the returning survivor (alpha pulse on the existing body, no new texture; if a texture is needed it goes through `addGeneratedTexture`). Add every new on-screen element to the one HUD layout test (EPIC 6 brief 31) at 568×320 and 640×360.
- [ ] **T7 Bots: cut switch and reconnect** (AC 11): `tools/netaudit/lagLine.ts` (from 8.8) gains `cut(ms)` (holds both directions, no bytes, no close); `tools/bots/run.ts` `--cut-bot N --cut-at S --cut-for S`; `tools/bots/botClient.ts` sets the same reconnection options, its own 3 s watchdog, and re-sends from a fresh seq after return. Bots log `reconnected after X ms`.
- [ ] **T8 Tests** (AC 11, F1–F8), including the field-by-field hold round-trip and the 8 s cut; run the 10-wave sim with one bot dropping twice and assert all waves ended (brief 6).
- [ ] **T9 Docs + gate + hand-back**: `docs/perf/network-pass-2026-11.md` § 8.1 (cut test timings); HANDOFF §2/§4 (reconnect exists; dev cut switch); `docs/playtests/` 2.10 plan: add "lock the phone 30 s mid-wave, come back" and "airplane mode 10 s" checks for iPhone and Android.

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

| Case | Before (master) | After target |
| --- | --- | --- |
| Bot line cut 8 s mid-wave (lossy line) | bot is out of the run | back in its seat, same loadout/wallet/HP, ≤ 10 s after the cut ends |
| Bot line cut 30 s | out | back, ≤ 10 s after the cut ends |
| Bot line cut 130 s | out | seat freed at 120 s, rejoined at the next build phase with its stuff |
| Server: silent socket terminated after | 6–9 s | 12–15 s |
| Phone shows "reconnecting" after | never (≈ 56 s of silent SDK retries, then start screen) | 3 s |
| Server tick p99 with one held player + hold bookkeeping | record | ≤ +0.2 ms |
| Bytes: hold fields | — | report (expected ≈ 0 when nobody is held) |

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

### Debug Log References

### Completion Notes List

- Story file written 2026-11-24 by the story writer (gds-create-story, non-interactive) from master da82847; decisions 8.1 D1–D8 pending.

### File List

## Change Log

- 2026-11-24: story file created (ready-for-dev, decisions pending; Network pass ACs merged in).
