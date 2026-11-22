# Story 3.1: Build phase between waves

Status: ready-for-dev

## Story

As a player,
I want a 30-second build phase before the first wave and after every wave, which ends early when we're all ready,
so that we have a breather to prepare.

> **Decisions made while writing this story (2026-11-22, no designer questions asked; change any of them freely):**
> 1. The run state machine lives in **shared** code (`packages/shared/src/run/runStateMachine.ts`), not only on the server, so solo practice (`LocalSimHost`) runs exactly the same build phase. The server's room keeps only the room-level bits (members, Results bookkeeping, Back to lobby) and calls the shared transitions. The phase lives in the World (`world.run.phase`).
> 2. **Players can move and shoot during the build phase**, exactly as in a wave (no zombies spawn, so shots hit nothing; reloads finish). This keeps the client's prediction (2.6) and local fire clock (2.7) identical to the server with no phase rule on either side. Story 3.4's placement mode turns the sticks off on the client only.
> 3. **Ready is a toggle** (tap again to take it back), like the lobby Ready. The build ends at the start of the first tick on which every player in the World is Ready.
> 4. The heal is **+50 % of max HP, capped at max**, for everyone. Downed and out players come back standing next to a teammate with 0 + 50 % = 50 HP. `returnHpFrac` is replaced by `buildHealFrac` (one number, not two).
> 5. Ready button: a HUD button (Phaser, `HudButtons`, so a touch on it never starts a stick) at the **bottom centre**, between the thumbs. Story 3.3 puts its Shop button next to it.
> 6. No keyboard shortcut for Ready (a mouse click on the button works, like the swap button). Can be added to `keyMap.ts` later.

## Acceptance Criteria

1. **Run state machine.** A run follows an explicit run state machine, `run/runStateMachine.ts`: Lobby → Build → Wave → Build → … → Results. Phases change only through the named transitions `startBuild`, `startWave`, `endWave` and `endRun`; any other change is a bug (a transition from a wrong phase throws). The server and solo practice both use it.
2. **Build phase.** When a build phase starts (including before wave 1), a 30 s countdown (counted in ticks, from balance JSON) and a Ready button show to every player, and no zombies spawn. The phase ends when the countdown reaches 0 or every connected player has tapped Ready (FR44). This works online and solo (solo: the one player's Ready skips the rest of the build).
3. **Heal and return.** When a build phase starts, every player is healed by 50 % of max HP (capped at max), and downed or out players return standing next to a teammate. This replaces the Story 2.8 "return at the next wave" rule (FR9, FR10).
4. **No more wave pause.** The 5 s pause from Story 1.7 (and the 3 s first-wave delay) are removed; the build phase replaces them.
5. **Nothing else breaks.** The in-run menu (2.11: solo pause, online keeps running, Leave), downed/revive/wipe → Results (2.8), and the same-room cycle (Results → Back to lobby → Ready → Start again) keep working. Client prediction (2.6) and the local fire clock (2.7) keep matching the server across phase changes. The `?lag` dev throttle copies the new state fields.
6. **Tests.** Vitest covers the transitions (valid and invalid), the countdown in ticks (ends at exactly 600, not 599), Ready (all ready ends it the next tick; one not ready keeps it; un-ready; a leaver doesn't block it), heal and return, no spawns during build, and the server/room flow (build → wave → build → wave, Ready message).

## Tasks / Subtasks

- [ ] **Task 1: Balance** (AC 2–4)
  - [ ] `waves.json` + schema: add `buildPhaseS: 30`; remove `pauseBetweenWavesS` and `firstWaveDelayS`.
  - [ ] `player.json` + schema: add `buildHealFrac: 0.5`; remove `returnHpFrac`. Update the balance tests that list these keys.
- [ ] **Task 2: Run state machine (shared)** (AC 1, 2, 4)
  - [ ] New `packages/shared/src/run/runStateMachine.ts`: `RunPhase = "lobby" | "build" | "wave" | "results"` (move the type here from `net/messages.ts` and re-export it there), `RunState { phase; buildTicksLeft }` in `world.run` (World starts in `"lobby"`).
  - [ ] Transitions (each checks the current phase and throws on a wrong one):
    - `startBuild(world)`: lobby | wave → build. Sets `buildTicksLeft = ticksFor(buildPhaseS)`, clears every player's `buildReady`, heals and returns players (Task 3), emits `build.started { wave: waves.number + 1 }`.
    - `startWave(world)`: build → wave. Clears `buildReady`, calls the wave director's `beginWave` (number + 1, size, queue, `wave.started`).
    - `endWave(world)`: wave → build. Clears the wave's queue/remaining/rush, emits `wave.ended { number }`, then `startBuild`. (Story 3.2 pays the wave-clear bonus here.)
    - `endRun(world)`: build | wave → results. Nothing steps after it.
  - [ ] `setBuildReady(world, playerId, ready)`: build phase only, known players only; ignored otherwise.
  - [ ] `updateRun` system (the `waves` slot of `SYSTEM_ORDER`): if `world.teamWiped` and the phase is build/wave → `endRun`; if `waves.paused` → nothing; build: if every player is Ready (and there is at least one) or `--buildTicksLeft === 0` → `startWave` (the first spawn batch runs the same tick); wave: the wave director's spawn/rush step, and `endWave` when it reports the wave cleared.
  - [ ] Move `skipWave` (dev cheat) next to the transitions (it kills wave zombies and calls `endWave`); `leaveLast` checks `world.run.phase === "wave"`.
  - [ ] `waveDirector.ts`: remove `WavePhase`, `phase` and `timerTicks` from `WaveState`; `startWave` becomes the internal `beginWave`; `updateWaves` returns whether the wave was cleared. No import of the state machine from the director (no cycles).
  - [ ] `snapshotWorld` gains `run` and each player's `buildReady` (players are spread already).
  - [ ] `index.ts` exports the transitions, `setBuildReady`, `updateRun`, `RunPhase`, `RunState`.
- [ ] **Task 3: Heal and return (shared)** (AC 3)
  - [ ] `returnOutPlayers(world)` (reused, `player/downed.ts`): now heals every player by `maxHp × buildHealFrac` (capped) and returns **downed and out** players next to the lowest-slot standing teammate (same placement as 2.8), `player.returned` for each. Called only from `startBuild`. Remove the call from `updateDowned`, the `w.phase === "active"` check, and `PlayerState.outSinceWave`.
  - [ ] `PlayerState.buildReady: boolean` (false).
- [ ] **Task 4: Events** (AC 2): `build.started { wave }` in `simEvents.ts`; net kind `BUILD_STARTED: 19` in `netEvents.ts` with a round-trip test.
- [ ] **Task 5: Server** (AC 1, 2, 5)
  - [ ] Schema: `RunState.buildTicksLeft: t.uint16()`, `PlayerState.buildReady: t.boolean()`; `stateView.ts` views; `syncState` copies `phase` (build/wave/results from `world.run.phase`), `buildTicksLeft` and `buildReady`; `resetRunFields` resets them.
  - [ ] `C2S.BUILD_SET_READY = "build.set_ready"`, `buildSetReadySchema = { ready: boolean }` (strict), registered with `this.net.guard`; the handler calls `controller.setBuildReady(playerId, ready)` (ignored outside a build).
  - [ ] `RunController` constructor starts the run with `startBuild` (Lobby → Build) after adding the players; `setBuildReady` passes through.
  - [ ] `RunRoom`: `onStart` no longer writes `phase = "wave"` (the first `syncState` writes `"build"`); `onTick` steps while the phase is build or wave; `team.wiped` keeps the room's `endRun` (Results bookkeeping, `run_ended` log). Joins stay lobby-only (Story 8.2 opens build-phase joins).
- [ ] **Task 6: Client** (AC 2, 5)
  - [ ] `SimHost.setBuildReady(ready)`: `LocalSimHost` calls the shared `setBuildReady` (applies before the next step); `NetSimHost` sends `build.set_ready`.
  - [ ] `LocalSimHost` constructor calls `startBuild` (the player is added right after; the heal of nobody is a no-op, and the build event is delivered at the first step).
  - [ ] `NetSimHost.applyState` mirrors `world.run.phase` (build/wave/results), `world.run.buildTicksLeft` and each player's `buildReady`.
  - [ ] HUD: during a build the top line reads `Wave N in S s` (`S = ceil(buildTicksLeft / 20)`), and a Ready button shows at the bottom centre (`Ready` / `Ready ✓`, plus `k/n ready` online). A tap toggles the local player's Ready through `SimHost.setBuildReady`. The button hides during a wave, on Results, in the loadout picker and while the menu is open. Banner `Build phase` at the run's first build; `Wave N cleared` stays at a wave's end.
  - [ ] Out status line: `You're out: back after this wave`.
  - [ ] `onlineFlow`: the run's session starts at the first **build or wave** phase after the lobby (not on every `wave`), so build → wave → build never restarts the Game scene.
  - [ ] Dev throttle: `PLAYER_FIELDS.buildReady` and `STATE_FIELDS.buildTicksLeft` (the `satisfies` check enforces it).
- [ ] **Task 8: Epic 2 retro A2 — state copies checked against the server schema** (AC 5)
  - [ ] Shared key lists `PLAYER_STATE_FIELDS` / `RUN_STATE_FIELDS` in `net/stateView.ts` (`satisfies Record<keyof view, true>`); the server schema (`RunState.ts`) asserts its own field names are exactly these; the dev throttle iterates them. A schema field missing from the copy is a compile error.
- [ ] **Task 9: Epic 2 retro A5 — dev balance switch for browser checks**
  - [ ] Shared `config/devBalance.ts` (`loadDevBalance({ zombieDamageScale })`, `parseDevScale`); server env `DEV_ZOMBIE_DAMAGE_SCALE` builds `serverBalance` with it (logs `dev_balance_override`); dev client builds read `?zdmg=<scale>` (`debug/clientBalance.ts`) for both the game and the join's `balanceVersion`, so versions match. Release clients ignore `?zdmg`.
- [ ] **Task 10: Epic 2 retro A12 — free spot for the return**
  - [ ] `player/freeSpot.ts`: one occupancy check `spotBlocked` (map edge, other players, alive zombies; Story 3.4 adds buildings there) and `findFreeSpotNear` (rings of `spawnOffsetM × 1…returnSearchRings`, 8 directions, +x first). `returnOutPlayers` uses it, falling back to the 2.8 spot when everything is taken. `player.json`: `returnSearchRings: 3`. Tests: zombie on a spot, teammate on a spot, map corner, full first ring → second ring, everything full → fallback.
- [ ] **Task 7: Tests** (AC 6): see Dev Notes › Testing. Update the existing tests that assumed the 3 s intro, the 5 s pause, `waves.phase`, `outSinceWave`, `returnHpFrac`, or `phase === "wave"` right after Start.

## Dev Notes

### Scope and prerequisites

- Builds on 1.7 (wave director), 2.4 (`RunController`, schema, `syncState`), 2.8 (downed/out, `returnOutPlayers`, Results, same-room cycle), 2.6/2.7 (prediction, local fire clock), 2.11 (menu, solo pause).
- Out of scope: wallets and the wave-clear bonus (3.2), the shop (3.3), placement (3.4), Crawlers (3.9), joining mid-run during a build (8.2), reconnect (8.1: a disconnected-but-kept player must not block "everyone Ready"), decay changes at build start (Epic 4), autosave at build start (Epic 8), the extract vote (Epic 6).

### Current state (read before changing)

- `waves/waveDirector.ts`: `WaveState.phase` is `"intro" | "active" | "pause"`; `timerTicks` counts the 3 s intro and the 5 s pause; `startWave` (private) bumps the number and emits `wave.started`; `endWave` (exported, also used by `skipWave`) sets the pause. The director stops while no one is alive (`collectAlivePlayers`). It runs in the `waves` slot of `SYSTEM_ORDER` (after `player`, `combat`, `zombies`).
- `player/downed.ts`: `updateDowned` runs at the end of the player system and calls `returnOutPlayers` every tick (returns out players at the first active tick of a later wave, `outSinceWave`). `checkTeamWipe` sets `world.teamWiped` and emits `team.wiped`, from `downPlayer` too (solo wipe the same tick).
- `apps/server/src/run/RunController.ts`: owns the World and input queues ("Epic 3 adds Build and phases here"). `RunRoom.onStart` sets `phase = "wave"` and `startRun`; `onTick` returns unless phase is `"wave"`; `team.wiped` → `endRun` (phase `"results"`, `resultWave`, `run_ended`); `lobby.return` drops the controller and resets the schema.
- Client: `onlineFlow.createOnlinePhaseHandler` starts a fresh `NetSession` **on every `wave`** (must change); `GameScene` shows `Wave N` / `Wave N cleared` banners from events and the HUD's `Wave N · Zombies M` / `Get ready` top line from `world.waves`; `NetSimHost.applyState` copies `wave`/`remaining` from state; `LocalSimHost` creates the World and steps it (paused by the menu).
- `waves.paused` (DEV_NO_WAVES, `?stress`): with this story it freezes the whole run state machine (no build countdown, no wave start), so `?stress` stays zombie-free except its own Walkers.

### Rules (all timers in ticks)

- `buildTicksLeft = ticksFor(buildPhaseS)` = 600 at 20 Hz. Each build tick: first the Ready check, then `buildTicksLeft--`; at 0 → `startWave` on that tick. So a build that nobody skips lasts exactly 600 ticks from `startBuild`.
- "Every connected player Ready": every player in `world.players` (leavers are removed at once in Epic 2), and at least one. A Ready set between ticks takes effect at the next tick's check. Solo: tapping Ready starts the wave at the next step.
- `startBuild` order: phase → `buildTicksLeft` → clear `buildReady` → `returnOutPlayers` (heal all standing first, in id order, then return downed/out next to the lowest-slot standing teammate, in id order) → `build.started`.
- Heal: `hp = min(maxHp, hp + maxHp × buildHealFrac)`. A returned player: `hp = min(maxHp, maxHp × buildHealFrac)` = 50, `status = "alive"`, downed fields reset.
- `endWave` → `startBuild` in the same tick: `wave.ended` then `player.returned`… then `build.started`.
- Team wipe: `updateRun` turns `world.teamWiped` into `endRun` on the same tick (the `waves` slot runs after `zombies`, where the last hit lands). The room still uses the `team.wiped` event for its Results bookkeeping.
- **Firing and moving in a build:** allowed, unchanged code paths (decision 2). No new rule in `firing.ts`, `movement.ts`, `Predictor` or `LocalFireClock`.
- No per-tick allocation: `updateRun` uses module-level `forEach` callbacks (no closures, no iterators); `setBuildReady` is per message.
- Determinism: the state machine uses no RNG; `world.run` and `buildReady` are in `snapshotWorld`.

### Integration notes for parallel stories

- **3.2 (wallets/economy):** pay the wave-clear bonus (10 × N, every player including downed/out) inside `endWave` (before `startBuild`), or from the `wave.ended` event in the economy system; both work in solo too because solo runs the same state machine. Expected merge spots: `balanceSchema.ts`/`balance.ts` (3.2 adds `economy.json`, this story edits `waves`/`player`), `RunState.ts`/`stateView.ts`/`syncState.ts`/`devThrottle.ts` key lists (both add fields), `simEvents.ts`/`netEvents.ts` (kind numbers: this story takes 19; 3.2 should take the next free one), `HudScene.ts`/`hudModel.ts`.
- **3.9 (Crawlers):** only the wave director's spawn code is shared ground: this story renames `startWave` → `beginWave` and removes `phase`/`timerTicks`; spawn picking (`spawnWaveZombie`) is untouched.
- **3.3 shop / 3.4 placement:** run only while `world.run.phase === "build"` (client: `host.world.run.phase`, room: `state.phase === "build"`; the server's handlers check `controller.world.run.phase`). Close the shop / end placement mode when the phase leaves `"build"`. The build timer is `world.run.buildTicksLeft` / `state.buildTicksLeft`. The Ready button is the HUD button `"ready"` at the bottom centre; put Shop beside it.

### Testing (Vitest, fixed seeds)

- `run/runStateMachine.test.ts`: lobby → build → wave → build → … → results via the named functions; every invalid transition throws; build lasts exactly 600 ticks (wave not started at 599); no zombie spawns during build; all Ready → the next tick starts the wave; one not Ready keeps the build; un-Ready; Ready outside a build ignored; unknown player ignored; a removed (left) player doesn't block; `waves.paused` freezes the countdown; wipe → results; snapshot covers `run` and `buildReady`; two worlds same seed same snapshot after a full build → wave → build.
- `downed.test.ts`: return at build start for downed and out players with 50 HP next to the lowest-slot teammate; standing players healed +50, capped; no return during a wave any more.
- `waveDirector.test.ts`: adapt to the build phase (skip it with Ready or 600 ticks); the 5 s pause is gone (wave N cleared → build, not a pause).
- Server: `RunController` starts in build; `syncState` copies phase/`buildTicksLeft`/`buildReady`; `RunRoom` integration (`bootTestServer()`): Start → phase `build` on both clients, `build.set_ready` from both → `wave`, a wave cleared → `build` again; Ready ignored in the lobby; same-room cycle still works. Existing room tests that waited for `"wave"` after Start now send Ready first.
- Client: `onlineFlow` build → wave → build keeps one session; `LocalSimHost` starts in build and `setBuildReady` skips it; `NetSimHost` mirrors the build fields; dev throttle copies them.

### Project Structure Notes

- New: `packages/shared/src/run/runStateMachine.ts`, `run/runStateMachine.test.ts`.
- Architecture variance: the architecture lists the run state machine under `apps/server/src/run`. It goes to `packages/shared/src/run` so solo uses it (decision 1); `apps/server/src/run/RunController.ts` stays the server's owner of the run and calls it.
- Modified: shared `waves/waveDirector.ts`, `player/{downed,player}.ts`, `core/{world,systems,simEvents,worldSnapshot}.ts`, `config/{balanceSchema.ts,balance/waves.json,balance/player.json}`, `net/{messages,netEvents,stateView}.ts`, `index.ts`; server `run/RunController.ts`, `rooms/RunRoom.ts`, `rooms/schema/{RunState,syncState}.ts`; client `sim/{SimHost,LocalSimHost,NetSimHost}.ts`, `scenes/{GameScene,HudScene,hudModel}.ts`, `net/{onlineFlow,devThrottle}.ts`, `debug/devCheatActions.ts`, plus tests.

### References

- [Source: epics.md#Story 3.1: Build phase between waves] (ACs), [#Epic 3]
- [Source: gdd.md#Core Gameplay Loop] (30 s build phase, ends early when every player taps Ready, also before wave 1), [#Health] (each build phase heals 50 % of max HP), [#Downed state] (out until the next build phase, then return automatically)
- [Source: game-architecture.md#Run state machine] (explicit, server-side, Lobby → Build → Wave → … → Results), [#Consistency Rules] (`run/runStateMachine.ts`, named transitions), [#Networking] (timers count ticks)
- Story 2.8 (`returnOutPlayers` kept in one function for this story), Story 1.7 (pause), Story 2.11 (menu), HANDOFF.md › lessons the reviews keep finding

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log
