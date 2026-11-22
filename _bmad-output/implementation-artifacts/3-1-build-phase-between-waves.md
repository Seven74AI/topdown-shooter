# Story 3.1: Build phase between waves

Status: done

## Story

As a player,
I want a 30-second build phase before the first wave and after every wave, which ends early when we're all ready,
so that we have a breather to prepare.

> **Epic 2 retro (2026-11-22) adds A2, A5 and A12 to this story** (Tasks 8–10) and its "EPIC 3 BRIEF" as the checklist.

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

- [x] **Task 1: Balance** (AC 2–4)
  - [x] `waves.json` + schema: add `buildPhaseS: 30`; remove `pauseBetweenWavesS` and `firstWaveDelayS`.
  - [x] `player.json` + schema: add `buildHealFrac: 0.5`; remove `returnHpFrac`. Update the balance tests that list these keys.
- [x] **Task 2: Run state machine (shared)** (AC 1, 2, 4)
  - [x] New `packages/shared/src/run/runStateMachine.ts`: `RunPhase = "lobby" | "build" | "wave" | "results"` (move the type here from `net/messages.ts` and re-export it there), `RunState { phase; buildTicksLeft }` in `world.run` (World starts in `"lobby"`).
  - [x] Transitions (each checks the current phase and throws on a wrong one):
    - `startBuild(world)`: lobby | wave → build. Sets `buildTicksLeft = ticksFor(buildPhaseS)`, clears every player's `buildReady`, heals and returns players (Task 3), emits `build.started { wave: waves.number + 1 }`.
    - `startWave(world)`: build → wave. Clears `buildReady`, calls the wave director's `beginWave` (number + 1, size, queue, `wave.started`).
    - `endWave(world)`: wave → build. Clears the wave's queue/remaining/rush, emits `wave.ended { number }`, then `startBuild`. (Story 3.2 pays the wave-clear bonus here.)
    - `endRun(world)`: build | wave → results. Nothing steps after it.
  - [x] `setBuildReady(world, playerId, ready)`: build phase only, known players only; ignored otherwise.
  - [x] `updateRun` system (the `waves` slot of `SYSTEM_ORDER`): if `world.teamWiped` and the phase is build/wave → `endRun`; if `waves.paused` → nothing; build: if every player is Ready (and there is at least one) or `--buildTicksLeft === 0` → `startWave` (the first spawn batch runs the same tick); wave: the wave director's spawn/rush step, and `endWave` when it reports the wave cleared.
  - [x] Move `skipWave` (dev cheat) next to the transitions (it kills wave zombies and calls `endWave`); `leaveLast` checks `world.run.phase === "wave"`.
  - [x] `waveDirector.ts`: remove `WavePhase`, `phase` and `timerTicks` from `WaveState`; `startWave` becomes the internal `beginWave`; `updateWaves` returns whether the wave was cleared. No import of the state machine from the director (no cycles).
  - [x] `snapshotWorld` gains `run` and each player's `buildReady` (players are spread already).
  - [x] `index.ts` exports the transitions, `setBuildReady`, `updateRun`, `RunPhase`, `RunState`.
- [x] **Task 3: Heal and return (shared)** (AC 3)
  - [x] `returnOutPlayers(world)` (reused, `player/downed.ts`): now heals every player by `maxHp × buildHealFrac` (capped) and returns **downed and out** players next to the lowest-slot standing teammate (same placement as 2.8), `player.returned` for each. Called only from `startBuild`. Remove the call from `updateDowned`, the `w.phase === "active"` check, and `PlayerState.outSinceWave`.
  - [x] `PlayerState.buildReady: boolean` (false).
- [x] **Task 4: Events** (AC 2): `build.started { wave }` in `simEvents.ts`; net kind `BUILD_STARTED: 19` in `netEvents.ts` with a round-trip test.
- [x] **Task 5: Server** (AC 1, 2, 5)
  - [x] Schema: `RunState.buildTicksLeft: t.uint16()`, `PlayerState.buildReady: t.boolean()`; `stateView.ts` views; `syncState` copies `phase` (build/wave/results from `world.run.phase`), `buildTicksLeft` and `buildReady`; `resetRunFields` resets them.
  - [x] `C2S.BUILD_SET_READY = "build.set_ready"`, `buildSetReadySchema = { ready: boolean }` (strict), registered with `this.net.guard`; the handler calls `controller.setBuildReady(playerId, ready)` (ignored outside a build).
  - [x] `RunController` constructor starts the run with `startBuild` (Lobby → Build) after adding the players; `setBuildReady` passes through.
  - [x] `RunRoom`: `onStart` no longer writes `phase = "wave"` (the first `syncState` writes `"build"`); `onTick` steps while the phase is build or wave; `team.wiped` keeps the room's `endRun` (Results bookkeeping, `run_ended` log). Joins stay lobby-only (Story 8.2 opens build-phase joins).
- [x] **Task 6: Client** (AC 2, 5)
  - [x] `SimHost.setBuildReady(ready)`: `LocalSimHost` calls the shared `setBuildReady` (applies before the next step); `NetSimHost` sends `build.set_ready`.
  - [x] `LocalSimHost` constructor calls `startBuild` (the player is added right after; the heal of nobody is a no-op, and the build event is delivered at the first step).
  - [x] `NetSimHost.applyState` mirrors `world.run.phase` (build/wave/results), `world.run.buildTicksLeft` and each player's `buildReady`.
  - [x] HUD: during a build the top line reads `Wave N in S s` (`S = ceil(buildTicksLeft / 20)`), and a Ready button shows at the bottom centre (`Ready` / `Ready ✓`, plus `k/n ready` online). A tap toggles the local player's Ready through `SimHost.setBuildReady`. The button hides during a wave, on Results, in the loadout picker and while the menu is open. Banner `Build phase` at the run's first build; `Wave N cleared` stays at a wave's end.
  - [x] Out status line: `You're out: back after this wave`.
  - [x] `onlineFlow`: the run's session starts at the first **build or wave** phase after the lobby (not on every `wave`), so build → wave → build never restarts the Game scene.
  - [x] Dev throttle: `PLAYER_FIELDS.buildReady` and `STATE_FIELDS.buildTicksLeft` (the `satisfies` check enforces it).
- [x] **Task 8: Epic 2 retro A2 — state copies checked against the server schema** (AC 5)
  - [x] Shared key lists `PLAYER_STATE_FIELDS` / `RUN_STATE_FIELDS` in `net/stateView.ts` (`satisfies Record<keyof view, true>`); the server schema (`RunState.ts`) asserts its own field names are exactly these; the dev throttle iterates them. A schema field missing from the copy is a compile error.
- [x] **Task 9: Epic 2 retro A5 — dev balance switch for browser checks**
  - [x] Shared `config/devBalance.ts` (`loadDevBalance({ zombieDamageScale })`, `parseDevScale`); server env `DEV_ZOMBIE_DAMAGE_SCALE` builds `serverBalance` with it (logs `dev_balance_override`); dev client builds read `?zdmg=<scale>` (`debug/clientBalance.ts`) for both the game and the join's `balanceVersion`, so versions match. Release clients ignore `?zdmg`.
- [x] **Task 10: Epic 2 retro A12 — free spot for the return**
  - [x] `player/freeSpot.ts`: one occupancy check `spotBlocked` (map edge, other players, alive zombies; Story 3.4 adds buildings there) and `findFreeSpotNear` (rings of `spawnOffsetM × 1…returnSearchRings`, 8 directions, +x first). `returnOutPlayers` uses it, falling back to the 2.8 spot when everything is taken. `player.json`: `returnSearchRings: 3`. Tests: zombie on a spot, teammate on a spot, map corner, full first ring → second ring, everything full → fallback.
- [x] **Task 7: Tests** (AC 6): see Dev Notes › Testing. Update the existing tests that assumed the 3 s intro, the 5 s pause, `waves.phase`, `outSinceWave`, `returnHpFrac`, or `phase === "wave"` right after Start.

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

claude-opus-5-5 (story writer + builder agent, worktree `story-3-1`)

### Debug Log References

- Browser harness pitfalls (not game bugs): a Playwright `mouse.down()` at an off-screen point never reaches the canvas, and later moves with the button "held" never fire; two pages in one browser throttle the background page's rAF (starved inputs pause the server weapon). Fixed in the script (fire only at on-screen targets, `bring_to_front`, no-backgrounding flags).
- Events emitted outside a step (transitions called from tests or dev cheats) are delivered at the next step's flush; tests flush by hand.

### Completion Notes List

- **Run state machine (AC 1, 2, 4):** `packages/shared/src/run/runStateMachine.ts`: `RunPhase = lobby | build | wave | results` in `world.run` (with `buildTicksLeft`); `startBuild` (lobby|wave → build), `startWave` (build → wave), `endWave` (wave → build, emits `wave.ended` then starts the build in the same tick), `endRun` (build|wave → results); wrong-phase calls throw. `setBuildReady` (toggle, build only, known players). `updateRun` (the `waves` system slot): wipe → `endRun`; `waves.paused` freezes everything; build: everyone Ready (≥ 1 player) or the 600-tick countdown → `startWave` (first spawn batch on that tick); wave: `updateWaves` (now returns "cleared") → `endWave`. `skipWave` moved here. Wave director: `phase`/`timerTicks`/`WavePhase` removed, `beginWave`/`clearWave` exported; balance `buildPhaseS: 30` replaces `pauseBetweenWavesS`/`firstWaveDelayS`. `RunPhase` re-exported from `net/messages.ts`.
- **Heal and return (AC 3, retro A12):** `returnOutPlayers` heals every standing player by `buildHealFrac` (0.5, replaces `returnHpFrac`) capped, then returns downed **and** out players (id order) with 50 HP on the first free spot near the lowest-slot standing teammate: `player/freeSpot.ts` `findFreeSpotNear` (rings `spawnOffsetM × 1…returnSearchRings(3)`, 8 directions, +x first) over one occupancy check `spotBlocked` (map edge, other placed players, alive zombies; **Story 3.4 adds buildings there**); fallback = the 2.8 spot. Called only by `startBuild`; `outSinceWave` and the per-tick return are gone.
- **Events:** `build.started { wave }` (net kind **20**; 19 is 3.2's `money.earned`).
- **Server:** `RunController` starts the run with `startBuild` and passes `setBuildReady` through; `RunRoom` registers `build.set_ready` via `this.net.guard(buildSetReadySchema, …)` (the guard's rate bucket applies), no longer writes `phase = "wave"` at Start, steps the World in build and wave. Joins stay lobby-only.
- **Client:** `SimHost.setBuildReady` (Local: shared `setBuildReady`; Net: sends `build.set_ready`). `LocalSimHost` starts in build (solo has the same build phase; the menu pause freezes its countdown). HUD: top line `Wave N in S s`, bottom-centre Ready button (HudButtons `"ready"`, so touches never start a stick; `Ready`/`Ready ✓`, `k/n` online; shown state is this device's request at once, reset on every phase change; hidden in a wave, picker, Results, menu, `?stress`). Banner `Build phase` at the first build; out line `You're out: back after this wave`. `onlineFlow`: one session per run, started at the first build/wave after the lobby; a new run seen right after Results (lobby patch skipped under `?lag`) still gets a fresh session. Firing/moving in a build use the unchanged code paths (decision 2), so prediction and the local fire clock need no change; a build still needs one input per tick like a wave (starved/slow rules of 2.7/3.9 unchanged).
- **Retro A2:** shared `PLAYER_STATE_FIELDS` / `RUN_STATE_FIELDS` (`net/stateView.ts`, `satisfies` the views); `RunState.ts` asserts the schema's field names are exactly these lists (proven: adding a probe schema field fails typecheck); `devThrottle` iterates them. Covers the merged 3.2/3.9/2.10 fields (`wallet`, `earned`, `slowTicks`, `slowPct`, `scenario`).
- **Retro A5:** shared `config/devBalance.ts` (`loadDevBalance`, `parseDevScale`); server `DEV_ZOMBIE_DAMAGE_SCALE` (logs `dev_balance_override`), dev client `?zdmg=` via `debug/clientBalance.ts` for the game and the join version. Used for the online browser check (0.08) instead of editing JSON.
- **State copies touched (brief line 3):** World (`world.run`, `PlayerState.buildReady`) → schema (`buildTicksLeft`, `buildReady`) → `syncState` (phase from the World, both fields, reset) → `stateView` + key lists → NetSimHost mirror (`world.run.phase/buildTicksLeft`, `buildReady`) → Predictor: not affected (no movement/weapon rule) → devThrottle (shared lists) → `snapshotWorld` (`run`; `buildReady` via the player spread) → `fakeRoom` test state. Bots: `tools/bots/botClient.ts` fights in build too and taps Ready once per patch; the shared bot test taps Ready.
- **Tests:** 835 passing, 3 skipped (`npm test`, after merging `claude/epic-2-continue`). New: `run/runStateMachine.test.ts` (19: transitions, invalid ones throw, exactly 600 ticks, no spawns, Ready all/one/toggle/solo/leaver/ignored, Ready cleared, no pause, paused freeze, move+fire in build, heal + return, downed return, wipe → results, determinism with snapshot of `run`/`buildReady`), `config/devBalance.test.ts` (3), downed return/free-spot tests (zombie spot, teammate spot, corner, ring 2, fallback), `RunRoom.build.test.ts` (5, `bootTestServer`: countdown on both clients, `build.started` forwarded, Ready 1/2 keeps build, 2/2 starts wave 1, toggle + malformed Ready dropped by the guard, cleared wave → build with the downed teammate back at 50 HP and the other healed 40 → 90, Ready → wave 2, last player alone skips, lobby ignores Ready), client `onlineFlow` (2), `LocalSimHost` (2), `NetSimHost` build mirror (1), devThrottle copy (1), urlOptions `?zdmg`. Existing tests adapted (3 s build in the wave director tests, room helpers wait for `build`, horde/net stats tests start a wave by hand). `typecheck`, `lint`, `build` pass.
- **Browser check (Python Playwright + Chromium 844×390, server PORT=4167, Vite 6673 via a temporary merged config, deleted):** screenshots in `/tmp/s31/`.
  - Solo (`?solo&loadout=pistol,smg`): build `Wave 1 in 29 s` + Ready → click → wave 1 → HP set to 30, Skip wave → build `Wave 2 in 30 s`, HP 80 → Esc menu: countdown frozen (583 → 583) → Ready → wave 2. No page errors. (`solo-1…5`, `postmerge-solo-*`)
  - Online (host Ana; guest Bo by share link under `?lag=150&jitter=20`; server `DEV_ZOMBIE_DAMAGE_SCALE=0.08`, clients `?zdmg=0.08`): both in build; Bo taps Ready → Ana's button `Ready 1/2`; Ana taps → wave 1 on both; Bo walks to the edge and goes down (`Downed … (20 s)`), his tab sleeps 5 s (`loop.sleep()/wake()`); Ana's scripted aim clears the wave (45 s) → build 2 on both: Bo back standing at 50 HP 1.5 m from Ana, `Ready 0/2`; both Ready → wave 2. Repeated after the merge (wallet `$190` shows). No page errors. (`online-1…5`, `postmerge-online-*`)
- **Not verified:** real phones/touch on the Ready button (mouse only); a late Game scene start during a build (covered by the 2.8 `activeRun` tests, not re-run in a browser); an out (not just downed) player returning in a browser (unit + room tests); the in-run menu online during a build (solo only).
- **Deviations:** the state machine is in `packages/shared/src/run/` (architecture says server `run/`), recorded as decision 1. `beginWave` counts all players for the wave size (was alive players; equal at a wave start since everyone is returned). `waves.paused` (DEV_NO_WAVES) freezes the build countdown and Ready too, so dev rooms with it stay in the build phase (useful for 3.3/3.4).

### Notes for the merge (brief line 20)

- `runStateMachine.ts` / `waveDirector.ts`: phases only via the transitions; `endWave` emits `wave.ended` (3.2 pays the bonus from that event) then `startBuild`. 3.9's `waveZombieType` is kept.
- Schema (`RunState.ts`): field objects `playerFields`/`runFields` + the A2 assertions; every new field must also go into `PLAYER_STATE_FIELDS`/`RUN_STATE_FIELDS` (`stateView.ts`), or typecheck fails.
- `NetSimHost.applyState`/`applyPlayer`: mirror lines for `run.phase`, `buildTicksLeft`, `buildReady`.
- `main.ts` unchanged; `onlineFlow.ts` owns the build/wave session rule.
- Balance JSON: `waves.buildPhaseS`; `player.buildHealFrac`, `player.returnSearchRings` (removed `waves.pauseBetweenWavesS`, `waves.firstWaveDelayS`, `player.returnHpFrac`).
- 3.3/3.4: act only while `world.run.phase === "build"` (room: `controller.world.run.phase`); end shop/placement when it changes; add buildings to `spotBlocked`; put Shop next to the `"ready"` HUD button.

### File List

- New: `packages/shared/src/run/runStateMachine.ts`, `run/runStateMachine.test.ts`, `player/freeSpot.ts`, `config/devBalance.ts`, `config/devBalance.test.ts`; `apps/server/src/rooms/RunRoom.build.test.ts`; `apps/client/src/debug/clientBalance.ts`.
- Modified (shared): `waves/waveDirector.ts`, `player/{downed,player}.ts`, `core/{world,systems,simEvents,worldSnapshot}.ts`, `config/{balanceSchema.ts,balance/waves.json,balance/player.json}`, `net/{messages,netEvents,stateView,testScenarios}.ts`, `index.ts`; tests `waves/waveDirector.test.ts`, `player/{downed,slow}.test.ts`, `net/netEvents.test.ts`, `economy/economy.test.ts`, `bots/botPolicy.test.ts`.
- Modified (server): `run/RunController.ts`, `rooms/RunRoom.ts`, `rooms/schema/{RunState,syncState}.ts`; tests `run/RunController.test.ts`, `rooms/RunRoom{,.fight,.downed,.leave,.economy,.net}.test.ts`.
- Modified (client): `sim/{SimHost,LocalSimHost,NetSimHost}.ts`, `scenes/{GameScene,HudScene,hudModel}.ts`, `net/{onlineFlow,devThrottle,connection,fakeRoom}.ts`, `debug/{devCheatActions,urlOptions}.ts`, `ui/sizes.ts`; tests `sim/{LocalSimHost,NetSimHost.downed}.test.ts`, `net/{onlineFlow,devThrottle,lobbyStore}.test.ts`, `debug/{devCheatActions,urlOptions}.test.ts`.
- Modified (tools): `tools/bots/botClient.ts`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`, this file.

## Senior Developer Review (AI)

- **Date:** 2026-11-22 · **Reviewer:** independent review agent (fresh context; full suite, touched folders 4× under load, ~35 mutations of which all but 6 were caught, A2 proven by adding schema fields, browser: two tabs under `?lag=150&jitter=20`, late scene start, same-room cycle, menu during build, solo pause, A5 refusal, bots). **Outcome:** decisions judged reasonable; one medium finding, fixed.
- [x] [Med] After a hidden tab slept across wave → build (or a dropped `build.set_ready`), my Ready button showed the old Ready while the server had me not ready, and the next tap sent "not ready". Fix: `scenes/readyRequest.ts` — the server's `buildReady` is the truth; a tap is a pending request shown until the server agrees or for at most 1.5 s; a new build (phase or wave number change, even slept through) voids it. Tests incl. the slept-through build.
- [x] [Low] Stale comments (where 3.2 pays the bonus; an orphan JSDoc in syncState): fixed.
- [x] [Low] Dev balance switch (A5): ignored with a warning when `NODE_ENV=production` (the server image sets it); the warn line logs the parsed value, and a rejected value logs `dev_balance_override_ignored`. Bots can't join a dev-scaled server (they load the plain balance): noted.
- [x] [Low] Bots sent Ready every 50 ms until confirmed: once per build, retried after 1 s.
- [x] [Low] Test gaps: an empty World is never "all Ready"; an out player's old position doesn't block a free spot. (`startBuild`'s Ready clear is redundant with `startWave`'s: accepted.)
- Noted: `buildTicksLeft` changes every tick in a build (≈ 60 B/s per client, negligible; A8 line for 3.10's measurement); `DEV_NO_WAVES` rooms stay in build forever and Ready does nothing there (intended for 3.3/3.4 checks); the NetSimHost mirror is still a hand-written copy (not covered by A2).

## Change Log

- 2026-11-22: Review fixes (Ready request model, production guard on the dev switch, bot Ready, comments, tests). Story done.

- 2026-11-22: Story written (gds-create-story) and implemented: run state machine (Lobby → Build → Wave → … → Results), 30 s build phase with Ready (online and solo), build-start heal + return on a free spot, 5 s pause removed; retro A2 (schema-checked state copies), A5 (dev balance switch), A12 (free-spot return). Merged `claude/epic-2-continue` (3.2, 3.9, 2.10 dev parts). Status → review.
