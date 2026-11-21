# Story 2.8: Downed, revive and team wipe

Status: ready-for-dev

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

- [ ] **Task 1: Balance** (AC 1–3): `player.json` + schema gain `downedS: 20`, `reviveS: 3`, `reviveRadiusM: 1.2`, `reviveHpFrac: 0.3` and `returnHpFrac: 0.5`. No number inline (NFR14).
- [ ] **Task 2: Player state (shared)** (AC 1–3)
  - [ ] `PlayerStatus = "alive" | "downed" | "out"`. **Remove `"dead"`** and the `player.died` event, and update every use: `zombieAi.damagePlayer`, `GameScene`, `FxView`, tests, `netEvents`.
  - [ ] `PlayerState` gains `downedTicksLeft`, `reviveTicks`, `reviverId: string | null` and `outSinceWave`.
  - [ ] `World` gains `teamWiped: boolean`.
  - [ ] Add all of them to `snapshotWorld`.
- [ ] **Task 3: Downed system (shared)** (AC 1–4): `packages/shared/src/player/downed.ts`, `updateDowned(world)`. Call it at the end of the `player` system (`updatePlayers`), so the order inside a tick stays fixed. See Dev Notes › Rules.
- [ ] **Task 4: Events (shared)** (AC 1–4)
  - [ ] Add `player.downed { playerId }`, `player.revived { playerId, reviverId }`, `player.out { playerId }`, `player.returned { playerId, x, y }` and `team.wiped { wave }`.
  - [ ] Add their kinds to `net/netEvents.ts` and remove `player.died`. Round-trip tests.
- [ ] **Task 5: Server** (AC 3, 4)
  - [ ] Schema: `PlayerState` gains `downedTicksLeft: t.uint16()`, `reviveProgress: t.uint8()` (0–255 = 0–100%) and `kills: t.uint16()`. `RunState` gains `resultWave: t.uint16()`. Update `stateView.ts`.
  - [ ] `RunController` counts `zombie.killed` per `killerId`, and `syncState` copies the counts.
  - [ ] On `team.wiped`: `state.phase = "results"`, `state.resultWave = wave`, log `info` `run_ended` with `{ roomId, runSeed, wave, kills }`. `onTick` returns early whenever `phase !== "wave"`: the World is no longer stepped.
  - [ ] `C2S.LOBBY_RETURN` (guarded) in phase `results`, from any member: drop the controller, then `phase = "lobby"`. Every `ready = false`, game fields reset, `kills = 0`. The members and their slots stay; the host stays. This is the whole room going back to the lobby.
  - [ ] Horde interest (2.5 hook `viewTargetFor`): an "out" player's view follows the spectate target (Dev Notes › Spectating).
- [ ] **Task 6: Client visuals** (AC 1–3)
  - [ ] Add `apps/client/src/render/DownedView.ts`: for each downed player, a revive progress ring in world space (an arc filling from `reviveProgress`).
  - [ ] Show a countdown above each downed player: `Math.ceil(downedTicksLeft / 20)` s, white with a dark stroke, ≥ 14 CSS px. Draw it in **HudScene screen space**, converting world to screen with `hudModel.camX/camY/camZoom` the way the rush arrows do, so the text stays crisp at any camera zoom. Story 2.9 draws player names the same way.
  - [ ] Draw the survivor darker while downed. Hide out players.
  - [ ] HUD lines:
    - when I'm downed: "Downed: a teammate can revive you (17 s)";
    - when I'm out: "You're out: back next wave", with the camera spectating;
    - when I'm reviving someone: "Reviving…".
  - [ ] Story 2.9 adds the pulsing marker and edge-arrow icon. Don't build them here.
  - [ ] Mirror and `LocalSimHost` both expose the new fields: the mirror copies them from schema, the local host has them in the World.
- [ ] **Task 7: Results screen** (AC 4)
  - [ ] Replace `ui/GameOver.tsx` with `ui/ResultsScreen.tsx`: "Wave reached N", then a table with color dot, name and kills, sorted by slot.
  - [ ] Online: a **Back to lobby** button sends `lobby.return`. When `phase` becomes `lobby`, the client shows the lobby. A player who taps later just goes to the lobby, which may already be showing for the others.
  - [ ] Solo: kills are counted from local events, and a **Restart** button keeps the old behaviour.
  - [ ] `uiState`: `{ kind: "results"; wave: number; rows: ResultRow[] }` replaces `gameOver`.
- [ ] **Task 8: Tests** (AC 5): see Dev Notes › Testing.

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

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
