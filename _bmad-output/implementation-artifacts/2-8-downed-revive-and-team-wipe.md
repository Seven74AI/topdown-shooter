# Story 2.8: Downed, revive and team wipe

Status: review

## Story

As a player,
I want to go down instead of dying, and be revived by a teammate,
so that we survive by helping each other.


> **Designer decisions (2026-11-21):** Docker is installed on the VPS (use Docker Compose; the systemd fallback is not needed). HTTPS/WSS stays on the Cloudflare Tunnel's edge certificates; Caddy is plain HTTP on 127.0.0.1:8080 behind it. The downed countdown pauses during a revive (Story 2.8). The in-run menu pauses solo practice; online it keeps running (Story 2.11).

## Acceptance Criteria

1. **Downed (FR10).** A player at 0 HP goes down. They cannot move or fire, a 20 s countdown shows above them, and `player.downed` is emitted. Zombies ignore downed players and target the nearest standing player.
2. **Revive.** When a standing teammate stays within 1.2 m of a downed player for 3 s, the player is revived with 30% of max HP and `player.revived` is emitted. A progress ring is shown, and moving away resets it.
3. **Out.** When the 20 s run out and no one has revived the player, they are out. They spectate a teammate until the next wave starts, then return next to a standing teammate with 50% HP. In Epic 3 the build phase takes over this return.
4. **Team wipe (FR11).** When no player is standing (everyone downed or out), the run ends for everyone with a Results screen (wave reached, kills per player) and a **Back to lobby** button.
5. **Tests.** Vitest covers timers in ticks, revive reset, out and return, and wipe detection.

## Tasks / Subtasks

- [x] **Task 1: Balance** (AC 1–3): `player.json` + schema gain `downedS: 20`, `reviveS: 3`, `reviveRadiusM: 1.2`, `reviveHpFrac: 0.3` and `returnHpFrac: 0.5`. No number inline (NFR14).
- [x] **Task 2: Player state (shared)** (AC 1–3)
  - [x] `PlayerStatus = "alive" | "downed" | "out"`. **Remove `"dead"`** and the `player.died` event, and update every use: `zombieAi.damagePlayer`, `GameScene`, `FxView`, tests, `netEvents`.
  - [x] `PlayerState` gains `downedTicksLeft`, `reviveTicks`, `reviverId: string | null` and `outSinceWave`.
  - [x] `World` gains `teamWiped: boolean`.
  - [x] Add all of them to `snapshotWorld`.
- [x] **Task 3: Downed system (shared)** (AC 1–4): `packages/shared/src/player/downed.ts`, `updateDowned(world)`. Call it at the end of the `player` system (`updatePlayers`), so the order inside a tick stays fixed. See Dev Notes › Rules.
- [x] **Task 4: Events (shared)** (AC 1–4)
  - [x] Add `player.downed { playerId }`, `player.revived { playerId, reviverId }`, `player.out { playerId }`, `player.returned { playerId, x, y }` and `team.wiped { wave }`.
  - [x] Add their kinds to `net/netEvents.ts` and remove `player.died`. Round-trip tests.
- [x] **Task 5: Server** (AC 3, 4)
  - [x] Schema: `PlayerState` gains `downedTicksLeft: t.uint16()`, `reviveProgress: t.uint8()` (0–255 = 0–100%) and `kills: t.uint16()`. `RunState` gains `resultWave: t.uint16()`. Update `stateView.ts`.
  - [x] `RunController` counts `zombie.killed` per `killerId`, and `syncState` copies the counts.
  - [x] On `team.wiped`: `state.phase = "results"`, `state.resultWave = wave`, log `info` `run_ended` with `{ roomId, runSeed, wave, kills }`. `onTick` returns early whenever `phase !== "wave"`: the World is no longer stepped.
  - [x] `C2S.LOBBY_RETURN` (guarded) in phase `results`, from any member: drop the controller, then `phase = "lobby"`. Every `ready = false`, game fields reset, `kills = 0`. The members and their slots stay; the host stays. This is the whole room going back to the lobby.
  - [x] Horde interest (2.5 hook `viewTargetFor`): an "out" player's view follows the spectate target (Dev Notes › Spectating).
- [x] **Task 6: Client visuals** (AC 1–3)
  - [x] Add `apps/client/src/render/DownedView.ts`: for each downed player, a revive progress ring in world space (an arc filling from `reviveProgress`).
  - [x] Show a countdown above each downed player: `Math.ceil(downedTicksLeft / 20)` s, white with a dark stroke, ≥ 14 CSS px. Draw it in **HudScene screen space**, converting world to screen with `hudModel.camX/camY/camZoom` the way the rush arrows do, so the text stays crisp at any camera zoom. Story 2.9 draws player names the same way.
  - [x] Draw the survivor darker while downed. Hide out players.
  - [x] HUD lines:
    - when I'm downed: "Downed: a teammate can revive you (17 s)";
    - when I'm out: "You're out: back next wave", with the camera spectating;
    - when I'm reviving someone: "Reviving…".
  - [x] Story 2.9 adds the pulsing marker and edge-arrow icon. Don't build them here.
  - [x] Mirror and `LocalSimHost` both expose the new fields: the mirror copies them from schema, the local host has them in the World.
- [x] **Task 7: Results screen** (AC 4)
  - [x] Replace `ui/GameOver.tsx` with `ui/ResultsScreen.tsx`: "Wave reached N", then a table with color dot, name and kills, sorted by slot.
  - [x] Online: a **Back to lobby** button sends `lobby.return`. When `phase` becomes `lobby`, the client shows the lobby. A player who taps later just goes to the lobby, which may already be showing for the others.
  - [x] Solo: kills are counted from local events, and a **Restart** button keeps the old behaviour.
  - [x] `uiState`: `{ kind: "results"; wave: number; rows: ResultRow[] }` replaces `gameOver`.
- [x] **Task 8: Tests** (AC 5): see Dev Notes › Testing.

## Dev Notes

### Scope and prerequisites

- Builds on 2.4 (schema, `RunController`, event codec, the online game over placeholder this story replaces) and 2.5 (the interest hook).
- Read `zombies/zombieAi.ts`:
  - `damagePlayer` sets the status today;
  - `nearestAlivePlayer` already ignores non-alive players, so AC 1's "zombies ignore downed" needs no AI change, only a test;
  - `collectAlivePlayers` runs once per tick.
- Also read `waves/waveDirector.ts` (it stops when no one is alive; `startWave` emits `wave.started`), `player/movement.ts` and `combat/firing.ts` (both skip non-alive players).
- Out of scope:
  - the +25 revive reward (3.2);
  - the build-phase heal and return (3.1 replaces the return rule here: keep it in one function, `returnOutPlayers`, so 3.1 can call it from the Build start);
  - Revive kit gear (5.11);
  - reconnect (8.1).

### Rules (all timers in ticks; Epic 1 lesson: never float seconds)

For each player, in id order:

- **Alive → downed:** `damagePlayer` (zombieAi) sets `status = "downed"` at `hp ≤ 0` and `hp = 0`. It also sets `downedTicksLeft = ticksFor(downedS)` (400), `reviveTicks = 0` and `reviverId = null`, then emits `player.downed`.
- **Downed:**
  - Look for a reviver: the nearest **alive** teammate whose centre is within `reviveRadiusM` of the downed player's centre.
  - If there is one: `reviveTicks++`, `reviverId = them`.
  - If there is none: `reviveTicks = 0` and `reviverId = null` (AC 2: moving away resets).
  - At `reviveTicks ≥ ticksFor(reviveS)` (60): set `status = "alive"`, `hp = Math.ceil(maxHp × reviveHpFrac)` (30), and emit `player.revived`.
  - Otherwise, **the countdown pauses while a revive is in progress** and runs when none is. At `downedTicksLeft === 0`: `status = "out"`, `outSinceWave = world.waves.number`, emit `player.out`.
  - The paused countdown was confirmed by the designer (2026-11-21); the GDD only says "after 20 s without revive".
- **Out → return** (`returnOutPlayers`):
  - Runs when `world.waves.phase === "active"` and `world.waves.number > outSinceWave`, which is the first tick of the next wave.
  - Place the player next to the lowest-slot alive teammate: their position plus `spawnOffsetM` along +x, or −x if that would leave the map, clamped. Set `prevX/prevY` to the same point.
  - Set `hp = Math.ceil(maxHp × returnHpFrac)` and `status = "alive"`, then emit `player.returned`.
- **Wipe:** after the steps above, if `world.players.size > 0`, no player is `"alive"` and `!world.teamWiped`: set `teamWiped = true` and emit `team.wiped { wave: world.waves.number }` exactly once.
  - Solo (1 player): going down is an immediate wipe, the same tick. Local mode keeps "the solo death ends the game" from Epic 1.
- Downed and out players don't move or fire (movement and firing already skip non-alive players), and they can't swap (the `updateSwap` status check). A downed player's projectiles already in flight keep flying.
- The wave director already does nothing while no one is alive. Nothing else in the run changes for downed players in Epic 2.

### Spectating

The view target for an out player, used by both the server's horde interest and the client camera, is the **lowest-slot alive teammate**. Because both sides compute the same choice, the streamed view always matches the camera. Put the function in shared `player/spectate.ts`, `spectateTarget(world, playerId)`. Tapping to switch targets can come later; don't build it now.

### Testing (shared, Vitest, fixed seed)

Isolate the mechanics: use `systems: { waves: () => {} }` unless the test is about the return, and give zombies a test balance where needed (Epic 1 lesson). Cases:

- **Down:** 0 HP gives `downed` and `player.downed` once.
  - A downed player is never attacked; the zombie walks to the standing one.
  - A downed player's input doesn't move them or fire.
- **Countdown:** with no reviver, `out` comes exactly 400 ticks after going down: not at 399.
- **Revive:**
  - a teammate at 1.1 m for 60 ticks revives with 30 HP;
  - at tick 59 they step to 1.3 m, then come back: the progress restarts from 0;
  - the countdown doesn't move during the revive;
  - two revivers count as one.
- **Out and return:**
  - out during wave 2: at the first active tick of wave 3 they return next to the lowest-slot standing teammate, inside the map, with 50 HP;
  - out during the pause after wave 2 (`number === 2`, `outSinceWave = 2`): they return at the first active tick of wave 3.
- **Wipe:**
  - all downed gives `team.wiped` once;
  - downed plus out gives a wipe;
  - one standing gives no wipe;
  - after a wipe, more ticks emit nothing new;
  - solo going down wipes the same tick.
- **Server** (`RunController`/`RunRoom` integration): kills are counted per player; a wipe sets `phase = "results"` and `resultWave`; `lobby.return` resets to the lobby with Ready false and the slots kept; after that, `run.start` works again.

### Project Structure Notes

- New:
  - `packages/shared/src/player/{downed.ts, downed.test.ts, spectate.ts}`
  - `apps/client/src/render/DownedView.ts`, `apps/client/src/ui/ResultsScreen.tsx`
- Modified:
  - `packages/shared/src/{player/player.ts, player/movement.ts, zombies/zombieAi.ts, core/world.ts, core/simEvents.ts, core/worldSnapshot.ts, config/balance/player.json, config/balanceSchema.ts, net/netEvents.ts, net/stateView.ts}` and the tests using `"dead"`/`player.died`
  - `apps/server/src/{run/RunController.ts, rooms/RunRoom.ts, rooms/schema/RunState.ts, rooms/schema/syncState.ts, net/hordeEncoder.ts}`
  - `apps/client/src/{scenes/GameScene.ts, scenes/HudScene.ts, scenes/hudModel.ts, sim/NetSimHost.ts, ui/uiState.ts, ui/App.tsx}`
- Delete: `apps/client/src/ui/GameOver.tsx`.

### References

- [Source: epics.md#Story 2.8: Downed, revive and team wipe]
- [Source: gdd.md#Win/Loss Conditions] (downed 3 s revive, 20 s, out until next build phase), FR10, FR11
- [Source: game-architecture.md#State Patterns] (player `alive | downed | out` with timers), [#Networking] (timers count ticks)
- Epic 1 lessons: tick timers (1.4 review), `systems` overrides in tests (1.7), reset UI model on restart (1.7 review)

## Dev Agent Record

### Agent Model Used

claude-opus-5-5 (builder agent, worktree `story-2-8`)

### Debug Log References

- Colyseus 0.18 `setFixedTimestep` clears the previous interval when called again, so a second run in the same room has one loop. The ping interval is a `Delayed` and is cleared on `lobby.return` (and before a new one is set).
- Test pitfall hit once: passing `undefined` to a defaulted parameter applies the default (my test helper silently turned the wave director off and looped forever); the helper takes `null` for "all real systems", and loops are capped.
- Browser check: the first `slow_patch` (780 ms, tick 36) right after the first run start on a freshly started `tsx` server was a one-off (JIT/first encode); no slow tick or patch in the later runs.

### Completion Notes List

- **Shared (AC 1–3, 5):** `PlayerStatus = "alive" | "downed" | "out"` ("dead" and `player.died` are gone everywhere). `PlayerState` gains `downedTicksLeft`, `reviveTicks`, `reviverId`, `outSinceWave`; `World.teamWiped`; all in `snapshotWorld` (players are spread). New `player/downed.ts`: `downPlayer` (called by `zombieAi.damagePlayer` at 0 HP), `findReviver`, `returnOutPlayers`, `checkTeamWipe`, `updateDowned` (end of `updatePlayers`, players in id order via a reused insertion-sorted array). Rules exactly as Dev Notes, timers in ticks (`ticksFor` once per tick): countdown 400, revive 60, **countdown paused while a revive is in progress** (designer decision), reset to 0 when no one is in reach, revive to `ceil(maxHp × 0.3)`, out sets `outSinceWave`, return at the first player-system tick of a later active wave next to the lowest-slot standing teammate (+x or −x by `spawnOffsetM`, clamped) with 50 HP. Nothing allocates per tick (module-level `forEach` callbacks, no Map iterators). `player/spectate.ts` `spectateTarget(world, id)` = lowest-slot standing teammate, used by the return, the server's horde interest and the client camera.
- **Wipe timing:** `checkTeamWipe` runs from `downPlayer` too, so the wipe lands on the same tick as the last player going down (solo: down = wipe on that tick, as the story asks); `updateDowned` also checks it (a downed team whose last standing player leaves wipes on the next tick). After a wipe `updateDowned` does nothing, so no further events.
- **Events:** `player.downed`, `player.revived`, `player.out`, `player.returned`, `team.wiped`; net kinds 14–18 (10, the old `PLAYER_DIED`, is retired, not reused); round-trip test covers every kind.
- **Server (AC 3, 4):** schema `downedTicksLeft`, `reviveProgress` (0–255), `kills`, `resultWave`; `stateView.ts` updated (drift check passes). `RunController` counts `zombie.killed` per `killerId` (`kills(id)`); `syncState` copies them. On `team.wiped` the room sets `phase = "results"`, `resultWave`, logs `run_ended { roomId, runSeed, wave, kills }`; `onTick` returns unless phase is `wave`. `lobby.return` (guarded with `this.net.guard(lobbyReturnSchema, …)`), any member, results only: drops controller/horde/event context/stats/ping interval, `resetRunFields` (every fight field and Ready back to default, slot/name kept), `phase = "lobby"`; members, slots and host stay; `run.start` works again. `viewTargetFor`: an out player's view is `spectateTarget(...) ?? own position`.
- **Client (AC 1–4):** `render/DownedView.ts` (world-space revive ring, one Graphics, redrawn only while someone is downed, hidden on Results); countdown `ceil(downedTicksLeft / TICK_RATE_HZ)` s in HudScene screen space from `hudModel.downed` (bold white, dark stroke, 16 CSS px; `setText` only when the number changes); status line "Downed: a teammate can revive you (N s)" / "You're out: back next wave" / "Reviving…" (string rebuilt only when N changes); downed survivors darker, out ones hidden; the out player's camera follows `spectateTarget`. `NetSimHost` mirrors status, countdown, revive progress → ticks, the reviver (`findReviver` on the mirrored positions) and `teamWiped = phase === "results"`.
- **Results (AC 4):** `ui/ResultsScreen.tsx` replaces `GameOver.tsx` (deleted): "Wave reached N" and a color dot / name / kills table by slot. Solo: kills counted from local `zombie.killed` events, **Restart** as before. Online: **Back to lobby** (disabled after a tap) sends `lobby.return`; `uiState` `{ kind: "results"; wave; rows; online }` (`online` added to pick the button).
- **Same-room cycle (2.4 review notes):** new `net/onlineFlow.ts` `createOnlinePhaseHandler` (used by `main.ts` as `onPhase`): `wave` → a fresh `NetSession` per run → `startOnline`; `results` → Results from room state; `lobby` → `session.release()` (from then on `NetSession.leave()`, called by `NetSimHost.dispose()`, is a no-op, so leaving the Game scene never leaves the room), `inbox.reset()` (drops batches re-buffered after the host unsubscribed, so the next run never sees the previous run's events; not done at `wave`, because run 2's tick-1 batch can beat the start patch), `backToLobby` (the online Game scene starts `Boot` with `{ lobby: true }`, which only registers the start handlers) and the lobby screen. `lobbyStore.returnToLobby()` sends `lobby.return`.
- **Tests:** 574 passing, 3 skipped (`npm test`; was 531 + 3 at 2.5). New: `downed.test.ts` (24: balance → ticks; down once; zombies ignore downed; downed input doesn't move/fire/swap; out exactly at 400 not 399; revive at 1.1 m in 60 ticks with 30 HP; reset at 1.3 m and restart from 0; countdown frozen during revive; revive 1 tick before out; two revivers count as one; downed can't revive; return in wave 3 for out in wave 2 and out in the pause; −x near the edge, clamped; real wave director return; spectate; wipe all downed / downed+out / one standing / nothing after / solo same tick / leaver / empty / determinism), netEvents kinds, `RunController` kills (2), `syncState` downed fields + reset (2), `RunRoom.downed.test.ts` (4, `bootTestServer`: kills per player, wipe → results + resultWave, World stops; `lobby.return` ignored mid-fight, accepted from a guest in results, lobby reset with slots/host kept; Ready + Start again runs a fresh run with inputs, events and a second wipe; out player's horde view), client `onlineFlow.test.ts` (7: full lobby → wave → results → lobby → wave cycle with a fresh session and no room leave; dispose after Back to lobby keeps the room and inbox; old-run batches dropped while run 2's tick 1 is kept; reset/release units), `NetSimHost.downed.test.ts` (2). `npm run typecheck`, `npm run lint`, `npm run build` pass.
- **Browser check (Python Playwright + Chromium, 844×390, server PORT=2967, Vite 5473 via a temporary config override, not committed):**
  - Solo (`?solo&loadout=pistol,smg`): put the survivor on a Walker with 1 HP → downed and Results "Wave reached 1 / You 0 / Restart" on the same tick → Restart → a new run (wave 0, 100 HP). Screenshot `solo-results.png`.
  - Online, two pages (Ana host, Bo by share link): Ready, Start; Bo steps away shooting; Ana stands and goes down: ring, "20 s" over her on both pages, her HUD "Downed: a teammate can revive you (N s)" (`online-downed-*.png`). Bo walks back and stands on her: his HUD "Reviving…", the ring fills on both pages, the countdown stops (`online-reviving-bo.png`, `online-being-revived-ana.png`); Ana is revived (29 HP after a hit). Then both stand until the wipe: Results on both pages "Wave reached 1 · Ana 0 · Bo 33 · Back to lobby" (`online-results-*.png`); server logged `run_ended {wave 1, kills {p0 0, p1 33}}`. Bo taps Back to lobby → both pages show the lobby with Ready reset and the Game scene stopped, `lobby_returned` logged, no leave (`online-lobby-again.png`) → Ready, Start → run 2 starts on both pages, Ana moves (`online-run2.png`). No page errors.
  - **Test setup deviation:** with the real Walker damage (10) the crowd always killed Bo during the 3 s revive, so for the online revive run only, `zombies.json` walker damage was set to 1 locally (both server and client, so the balance versions matched) and reverted before the commit. The revive rules themselves are covered at real numbers by the unit and integration tests.
- **Not verified:** the out player's spectator camera and "You're out: back next wave" line in a browser (unit-tested via `spectateTarget`, server `viewTargetFor` integration test); an out player returning at the next wave in a browser (unit-tested with the real wave director); real phones / 4G.
- **Deviations:** `uiState` results carries `online: boolean` (the story's shape had none; needed to pick Back to lobby vs Restart). The return happens on the first player-system tick after `wave.started` (the wave director runs after the player system in a tick), as the story's "first active tick". The wipe check also runs inside `downPlayer` so the solo same-tick wipe holds. The online Results screen is driven by `phase` in `main.ts`/`onlineFlow` (room state, every player's kills), not by the `team.wiped` event in the Game scene; solo uses the local event.
- **Notes for the 2.6 merge:** `NetSimHost.ts`: imports `findReviver`/`ticksFor`, field `reviveTicksTotal` + `writeReviver` callback next to `writePlayer`, two lines after `this.world.players.forEach(this.writePlayer)` in `applyState`, `this.applyDowned(p, s)` after `p.status = s.status` in `applyPlayer`, and the small `applyDowned` method. `session.ts`: `RunInbox.reset()` and `NetSession.release()` (+ doc comment). `main.ts`: `onPhase` is now `createOnlinePhaseHandler({...})`; its `makeSession` must use `lobbyStore.fightRoom()` (2.6) instead of `room`. `RunRoom.ts`: `onTick` early return on phase, `endRun`, `onLobbyReturn` (which clears `hordeStats`; 2.6/2.5 fixes also delete per-player stats in `onLeave`), `viewTargetFor`, `pingTimer`, `runSeed`.

### File List

- `packages/shared/src/player/downed.ts` (new)
- `packages/shared/src/player/downed.test.ts` (new)
- `packages/shared/src/player/spectate.ts` (new)
- `packages/shared/src/player/player.ts`, `player/movement.ts`, `zombies/zombieAi.ts`, `core/world.ts`, `core/simEvents.ts`, `core/worldSnapshot.ts`, `config/balance/player.json`, `config/balanceSchema.ts`, `net/netEvents.ts`, `net/stateView.ts`, `net/messages.ts`, `index.ts`, `combat/firing.ts`, `waves/waveDirector.ts` (modified)
- `packages/shared/src/net/netEvents.test.ts`, `zombies/zombieAi.test.ts`, `combat/swap.test.ts`, `waves/waveDirector.test.ts` (modified)
- `apps/server/src/rooms/RunRoom.ts`, `rooms/schema/RunState.ts`, `rooms/schema/syncState.ts`, `run/RunController.ts` (modified)
- `apps/server/src/rooms/RunRoom.downed.test.ts` (new); `rooms/schema/syncState.test.ts`, `run/RunController.test.ts` (modified)
- `apps/client/src/net/onlineFlow.ts`, `net/onlineFlow.test.ts`, `render/DownedView.ts`, `ui/ResultsScreen.tsx`, `sim/NetSimHost.downed.test.ts` (new)
- `apps/client/src/main.ts`, `net/session.ts`, `net/lobbyStore.ts`, `net/fakeRoom.ts`, `net/lobbyStore.test.ts`, `sim/NetSimHost.ts`, `scenes/GameScene.ts`, `scenes/HudScene.ts`, `scenes/hudModel.ts`, `scenes/BootScene.ts`, `render/PlayerView.ts`, `ui/uiState.ts`, `ui/uiState.test.ts`, `ui/App.tsx`, `ui/overlay.css` (modified)
- `apps/client/src/ui/GameOver.tsx` (deleted)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-11-22: Story 2.8 implemented: downed (20 s, paused while being revived), revive (3 s within 1.2 m, 30 % HP), out until the next wave (spectating the lowest-slot standing teammate, back with 50 % HP), team wipe → Results (wave, kills per player) → Back to lobby, and a second run in the same room. 574 tests passing.
