# Story 2.10: 4-phone 4G test

Status: review

<!-- 2026-11-22: every (dev) task is done. The human 4-phone test (Tasks 10 and 11) is still open: waiting for the designer and friends. Do not mark done before it is recorded in docs/perf/epic-2-network.md. -->

<!-- Human story: the 4-phone test is run by the designer and friends. The dev agent builds the overlay lines, the test scenario, the bots and the results doc, then records the numbers the designer reports. -->

## Story

As the designer,
I want to play a full wave with 4 phones on 4G and measure it,
so that we prove online co-op with big hordes works (Milestone 1's first goal).

## Acceptance Criteria

1. **Network overlay.** When online, the performance overlay also shows ping and bandwidth in and out (KB/s).
2. **The test.** 4 phones on 4G (or with a 150 ms throttle) play a wave with 150 Walkers alive. When the wave ends:
   - each phone's average download is ≤ 30 KB/s (NFR4);
   - reversed hits are below 1 in 20 (NFR5);
   - FPS is recorded;
   - the players report no visible disagreement (NFR3).

   The results are written to `docs/perf/epic-2-network.md`.
3. **Follow-up.** If reversed hits are ≥ 1 in 20, a follow-up story is created to enable hit testing against 300 ms of rewound zombie positions (the architecture's upgrade path).
4. **Bots.** Headless bot clients in `tools/bots` can fill a room with up to 4 fake players, for repeatable load tests.
5. **Bot policy.** A simple bot policy lives in `packages/shared`. Bots using it play in a headless World or a real room and clear waves well enough to measure economy and load (used by Stories 3.10, 6.1 and 10.8). The policy:
   - moves toward the team's centre;
   - aims at the nearest zombie and fires;
   - revives a downed teammate in reach;
   - taps Ready;
   - in later epics, buys from a fixed shopping list.

## Tasks / Subtasks

- [x] **Task 1 (dev): Byte counters, client** (AC 1)
  - [x] Add `apps/client/src/net/netMeter.ts`. On join, attach a `message` listener to the SDK socket (`(room.connection.transport as { ws?: WebSocket }).ws`) that adds `event.data.byteLength`, with `binaryType` `arraybuffer`.
  - [x] Wrap `room.connection.send` to count outgoing bytes.
  - [x] Keep 1-second buckets in a ring of 60 (no allocation per message). Expose `downKBps`, `upKBps` (1 s), `avgDownKBps` (since wave start) and `peakDownKBps`.
  - [x] KB means 1024 bytes, payload only: no WebSocket, TCP or TLS overhead. Say so in the doc.
  - [x] Unit-test the bucket logic with injected time.
- [x] **Task 2 (dev): Byte counters, server** (AC 2)
  - [x] In `onJoin`, wrap that client's `raw()` to add `data.byteLength` to the member's `bytesOut`. Colyseus 0.18 sends messages, `sendBytes` and patches through it; verify with a test that a state patch is counted.
  - [x] Count `bytesIn` in the `"*"` and guarded handlers, roughly: the encoded size isn't available, so count inputs × 1 message and note that this estimate is approximate.
  - [x] On `wave.ended`, log `info` `net_stats` per player: `{ roomId, wave, playerId, avgOutKBps, peakOutKBps, rttMs }`, next to `horde_stats` from 2.5.
- [x] **Task 3 (dev): Overlay lines** (AC 1). The Story 1.11 overlay (`debug/PerfOverlay.ts`) left room for them. When `host.online`, add:
  - [x] `ping 142 ms · delay 140 ms · jitter 18 ms` (RTT from `net.pinged`, 2.4; delay and jitter from 2.6);
  - [x] `down 21.4 KB/s (avg 20.8, peak 26.1) · up 2.3 KB/s`;
  - [x] `horde 20/s · corrections 0 · snaps 0` (2.5, 2.6);
  - [x] `hits 212 · reversed 4 (1.9%)` (2.7).
  - [x] Text ≥ 12 px × dpr, `setText` only when a value changes.
- [x] **Task 4 (dev): Wave summary and Copy** (AC 2): on `wave.ended`, when the overlay is on, show a summary box: avg/min FPS (1.11 stats), avg/peak down KB/s, avg up, avg/p95 ping, reversed / apparent hits, snaps. Add a **Copy results** button (clipboard), as in 1.11's stress summary.
- [x] **Task 5 (dev): Test scenario "150 alive"** (AC 2). See Dev Notes › Scenario.
- [x] **Task 6 (dev): Bot policy (shared)** (AC 5): `packages/shared/src/bots/botPolicy.ts` + test. See Dev Notes › Bot policy.
- [x] **Task 7 (dev): Bot clients** (AC 4): `tools/bots/run.ts`, `tools/bots/botClient.ts`. See Dev Notes › Bot clients.
- [x] **Task 8 (dev): Load test with bots** (AC 4)
  - [x] Locally (`npm run dev`), create a room in one browser with `?debug=1`, then run `npm run bots -- --room <CODE> --count 3` and start the scenario.
  - [x] Record the browser's down KB/s and the server's `net_stats` and `horde_stats` as the first row of the doc, labelled "local, bots, no 4G".
  - [x] Repeat once with `?lag=150&jitter=20` (2.6 throttle).
- [x] **Task 9 (dev): Results doc** (AC 2): create `docs/perf/epic-2-network.md`. See Dev Notes › Doc.
- [ ] **Task 10 (human: designer + 3 friends): The 4-phone test** (AC 2)
  - [ ] On the published build (https://hordes.sevend.io, after Story 2.2's deploy by Hermes), 4 phones on mobile data (Wi-Fi off) join one room.
  - [ ] Open the host's link with `?debug=1&scenario=net150` (see Scenario), play the wave to its end, then tap **Copy results** on each phone and paste into the doc.
  - [ ] Also ask each player: "Did you ever see something that didn't match what your friends saw?" Write the answer down word for word.
  - [ ] If 4G isn't possible for everyone, the phones on Wi-Fi add `&lag=150&jitter=20`. Mark which phones did that.
- [ ] **Task 11 (designer + dev): Decide** (AC 3)
  - [ ] If any phone's reversed hits are ≥ 5 %, or the players saw disagreements, create the follow-up story "Rewind hit testing (300 ms zombie history)" with `gds-correct-course`: append it to `epics.md` under Epic 2 or 4 and to `sprint-status.yaml`.
  - [ ] If the average download is above 30 KB/s, record which stream is responsible (horde vs schema and events, from the server stats) and open a follow-up the same way.
  - [ ] Record the decisions in the doc's "Decisions" section.

## Dev Notes

### Scope and prerequisites

- Needs 2.1–2.9 done, 1.11 (`PerfOverlay`, `perfStats`, the `?stress` pattern) and 2.2 deployed by Hermes.
- Read `debug/PerfOverlay.ts`, `debug/urlOptions.ts` (1.12), 2.6's throttle and 2.7's reversed-hit counter.
- Out of scope:
  - fixing what the test finds (follow-up stories);
  - the rewind itself;
  - economy bots that buy (Epic 3 adds the shopping list);
  - automated phone farms.

### Scenario

- 150 alive needs wave 4 (160 Walkers, cap 150), and survival needs god mode. Release builds have no cheats (Story 1.11), so add one fixed, release-safe scenario, like 1.11's `?stress`:
  - `?scenario=net150` on the **host's** create sends `scenario: "net150"` in the join options. Add it to `joinOptionsSchema` as `z.enum(["net150"]).optional()`.
  - The server accepts it only when env `ALLOW_TEST_SCENARIOS=1`. Hermes sets it in `docker-compose.yml` for the test day, then removes it.
- The scenario at run start:
  - `world.debug.godMode = true` (1.11);
  - the wave director starts at wave 4 (`world.waves.number = 3` with a short intro);
  - Pistols as usual.

  Everything else is normal: real spawns, real AI, real hits.
- Log `info` `test_scenario_started` with the scenario name. The overlay shows a "TEST SCENARIO" tag, so nobody mistakes the run for a normal game.

### Bot policy

```ts
export interface BotView {            // what a bot can know; built from a World or from net state
  self: { x: number; y: number; status: PlayerStatus; rangeM: number };
  teammates: ReadonlyArray<{ x: number; y: number; status: PlayerStatus }>;
  nearestZombie: { x: number; y: number; distM: number } | null;
}
export interface BotConfig { keepDistanceM: number; regroupDistM: number; reviveSearchM: number; shoppingList?: readonly string[] }
export function botInput(view: BotView, cfg: BotConfig, seq: number, out: PlayerInput): void;
export function botViewFromWorld(world: World, playerId: string, out: BotView): void;
```

Decision order:

1. A downed teammate within `reviveSearchM` (6 m): move to them and stop within 1 m, which revives them (2.8).
2. A zombie closer than `keepDistanceM` (2.5 m): back away from it.
3. Farther than `regroupDistM` (4 m) from the centre of the alive teammates: move toward it.
4. Otherwise: stand still.

- Aim at the nearest zombie, and fire while it is within `rangeM`. `isMouse: false`, so the bot gets aim assist like a phone player. Never swap.
- Pure and deterministic: no RNG needed. Shared rules apply: no `Math.random`, no allocation per call.
- `BotConfig` defaults live in `config/balance/bots.json` (validated like other balance files) so Stories 3.10 and 10.8 can tune bots without code changes.
- `shoppingList` is unused until Epic 3. Document the hook.
- **Test** (`botPolicy.test.ts`), headless with a fixed seed: 4 bots in a `createWorld` with the real systems, `botViewFromWorld` → `botInput` → `setInput` each tick. Assert that they reach wave 3 (waves 1 and 2 cleared) without a team wipe, and that a downed bot is revived by a teammate. Tune `BotConfig` if not, and note the values.

### Bot clients

- `tools/bots/run.ts` (run with `npm run bots -- --url http://localhost:2567 --room ABCD --count 3 [--origin https://hordes.sevend.io]`):
  - Add root devDependencies `tsx` 4.23.15 and `@colyseus/sdk` 0.18.10, the same pins as the workspaces, and a root script `"bots": "tsx tools/bots/run.ts"`.
  - Each bot joins with `intent: "join"`, a name `Bot 1`–`Bot 3`, the bundled `balanceVersion`, and a random guest token.
- The SDK passes `ClientOptions.headers` to the WebSocket too. Set `Origin` so a production server (2.2 Origin check) accepts the bots.
- Each bot:
  - sends `lobby.set_ready true`;
  - decodes horde frames with the shared `hordeFormat` to find its nearest zombie, and reads players from the state;
  - builds a `BotView` and sends `input.send` every 50 ms with an increasing seq;
  - answers `net.pinged`.
- Bots don't render, predict or interpolate. They use the newest data. Log one line per wave per bot.
- `tools/bots` may import from `packages/shared`. It must not import from `apps/*`.

### Doc (`docs/perf/epic-2-network.md`)

Sections:

- **Method:** build sha, date, scenario, network type per phone, throttle used.
- **Targets:** NFR3, NFR4 (≤ 30 KB/s down), NFR5 (< 5 % reversed), NFR1 (FPS recorded).
- **Results:** a table with one row per phone. Columns: device, browser, network, avg/peak down KB/s, up KB/s, avg/p95 ping, reversed / apparent hits, FPS avg/min, snaps.
- **Server:** tick ms avg/max, slow ticks, `horde_stats`, `net_stats`.
- **What players saw:** quotes.
- **Decisions.**

Pre-fill the local bot rows from Task 8.

### Previous story intelligence

- Story 1.11 set the pattern for a release-safe fixed scenario (`?stress`) and for Copy results. Reuse its summary component.
- Expected bandwidth from the design: the horde is about 24 KB/s at 150 in view (2.5's test measures 24,160 B/s of payload), and patches plus events should stay under 6 KB/s. If the phones measure much more, compare with the server's `net_stats` to find which side counts differently.

### Project Structure Notes

- New:
  - `apps/client/src/net/{netMeter.ts, netMeter.test.ts}`
  - `packages/shared/src/bots/{botPolicy.ts, botPolicy.test.ts}`, `packages/shared/src/config/balance/bots.json`
  - `tools/bots/{run.ts, botClient.ts}`
  - `docs/perf/epic-2-network.md`
- Modified:
  - `apps/client/src/{debug/PerfOverlay.ts, debug/urlOptions.ts, sim/NetSimHost.ts, net/connection.ts}`
  - `apps/server/src/{rooms/RunRoom.ts, run/RunController.ts}`
  - `packages/shared/src/{net/messages.ts, config/balance.ts, config/balanceSchema.ts, index.ts}`
  - root `package.json`, `deploy/docker-compose.yml` (the commented `ALLOW_TEST_SCENARIOS` line)

### References

- [Source: epics.md#Story 2.10: 4-phone 4G test]
- [Source: game-architecture.md#Debug Tools] (overlay with ping and bandwidth, also in release), [#Networking] (budget 24 + 6 KB/s, lag compensation upgrade path), [#Testing] (headless bots in `tools/bots`)
- NFR3, NFR4, NFR5: [Source: epics.md#NonFunctional Requirements]; [gdd.md#Performance Requirements] (Network)
- Human-story pattern: [Source: 1-12-melee-and-controls-playtest-on-real-phones.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (Claude Code), builder agent in worktree `story-2-10`.

### Debug Log References

- `npm run typecheck && npm run lint && npm test && npm run build`: all pass (107 test files, 748 tests passed, 3 skipped).
- Local server `PORT=4067 ALLOW_SOLO_START=1 ALLOW_TEST_SCENARIOS=1` (started from a wrapper file so other agents' process clean-ups could not stop it; two earlier runs were cut short that way).
- Bot runs (`npm run bots`): 4 bots `net150` wave 4 with `--hold-fire 25` (peak 150 alive) and without; 4 bots normal waves 1–3. Logs and server lines summarised in `docs/perf/epic-2-network.md` › Local bot baseline.
- Browser check (Python Playwright + Chrome headless, Vite on 6573 with a temporary config merging `apps/client/vite.config.ts` with a `/api` proxy to 4067, deleted afterwards): host `?debug=1&scenario=net150` + 3 bots, once plain and once with `&lag=150&jitter=20`. Overlay lines, TEST SCENARIO tag, the wave summary box and Copy results ("Copied.") checked. Screenshots: `/tmp/s210/lag150-peak.png` (overlay at 147 alive), `/tmp/s210/lag150-summary.png`, `/tmp/s210/local-peak.png`, `/tmp/s210/local-summary.png`.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- This is a **human story** (the playtest, Task 10, is run by the designer and friends). The dev agent must not mark it done until Tasks 10 and 11 are recorded. Until then, set the status to `review` with a clear "waiting for 4-phone test" note.
- **2026-11-22, dev parts done; waiting for the 4-phone test.** Tasks 1–9 are done; Tasks 10–11 are open.
- **Byte counters, shared (Tasks 1–2).** `packages/shared/src/net/byteRate.ts`: `ByteRate`, 1-second buckets in a `Float64Array` ring of 60, plus the average and the busiest whole second since a mark (seconds the mark fell in don't count toward the peak). Pure (time passed in), no allocation per `add`. `attachByteCounters(room, down, up, now)` adds a `message` listener on `room.connection.transport.ws` and wraps `room.connection.send`; structural types only, so it stays engine-free and the client, the bots and the server test all use it. KB = 1024 bytes of payload, said in the doc and in the Copy results text.
- **Client (Task 1).** `net/netMeter.ts`: the page's `NetMeter` (down/up `ByteRate`), attached in `connection.ts` right after create/join, marked at each `wave.started`. Exposes `downKBps`, `upKBps` (last whole second), `avgDownKBps`, `peakDownKBps`, `avgUpKBps`. Tested with injected time (`netMeter.test.ts`, `byteRate.test.ts`).
- **Server (Task 2).** `RunRoom.countBytes` (in `onJoin`): wraps that client's `raw()` (bound once) into `out`, and listens to the `ws` socket's `message` event into `in`. Integration test: a state patch with no message is counted, and equals byte for byte what the SDK client's counter receives; what the client sends equals the server's `in`. `wave.started` restarts every per-wave counter; `wave.ended` logs `net_stats` `{ roomId, wave, playerId, avgOutKBps, peakOutKBps, avgInKBps, hordeKBps, rttMs }` per player, then `horde_stats` (2.5), then `tick_stats` `{ wave, peakZombiesAlive, ticks, tickAvgMs, tickMaxMs, slowTicks, patchAvgMs, patchMaxMs, slowPatches }` (a per-wave window on `SlowTickWatch`).
- **Overlay (Task 3).** `PerfOverlay`, when `perf.net` (the `NetSimHost`) is set: `TEST SCENARIO net150` first line (or `scenario net150 refused by the server` when the URL asked and the server didn't apply it), `ping … · delay … · jitter …`, `down … KB/s (avg …, peak …) · up … KB/s`, `horde N/s · corrections · snaps` (horde frames/s over ≥ 1-s windows), `hits … · reversed … (…%)`. Text stays 13 CSS px × dpr; `setText` only when the text changed (still rebuilt 4×/s, as in 1.11). The dev-only `console.info("net_stats")` in `NetSimHost` is gone (the overlay shows it now).
- **Wave summary (Task 4).** `debug/netSummary.ts` (`NetWaveSummary`): from `wave.started` to `wave.ended`, FPS through 1.11's `PerfSummary`, ping sampled once a second into a preallocated ring (average, nearest-rank p95), the meter's avg/peak down and avg up, and the growth of apparent / confirmed / reversed hits, snaps and corrections. When the wave ends with the overlay on, the **Network results** box (`NetResults.tsx`) shows the report with **Copy results**; the report ends with a ready-made row for the doc's table. 1.11's box became the shared `ResultsDialog.tsx` (StressResults uses it too).
- **Scenario (Task 5).** `packages/shared/src/net/testScenarios.ts`: `TEST_SCENARIOS = ["net150"]`, `NET150_START_WAVE = 4`, `applyTestScenario` (god mode, `waves.number = 3`, the usual 3-s intro). `joinOptionsSchema.scenario = z.enum(TEST_SCENARIOS).optional()`; the client sends it on create from `?scenario=net150` (`urlOptions().scenario`). The server honours it only with `ALLOW_TEST_SCENARIOS=1` (`index.ts` → `createGameServer({ allowTestScenarios })` → `defineRoom` default, which a client cannot override); otherwise it logs `test_scenario_refused` and runs a normal game. At the start it logs `test_scenario_started { scenario, startWave }` and sets the new schema field `RunState.scenario` (also in `RunStateView` and the dev throttle's field list), so every phone's overlay shows the tag, not only the host's. `deploy/docker-compose.yml` has the commented `ALLOW_TEST_SCENARIOS` line.
- **Bot policy (Task 6).** `packages/shared/src/bots/botPolicy.ts`: `BotView` (preallocated by `createBotView`: teammates array + `teammateCount`, `nearestZombie` pointing at a reused record), `botInput(view, cfg, seq, out)` with the Dev Notes' decision order, `botViewFromWorld`. Pure, no RNG, no allocation per call (module-level visitor, no closures). `config/balance/bots.json` (validated by `botsSchema`): `keepDistanceM 2.5`, `regroupDistM 4`, `reviveSearchM 6`, `reviveStopM 1`, `shoppingList []` (the Epic 3 hook, documented). The team centre includes the bot itself. **No tuning was needed:** with the defaults, 4 headless bots (seed 0x2010, real systems, no god mode) reach wave 3 at tick 1109 with 0 downs; a downed bot is revived by a teammate within `reviveS` + 3 s. Tests also cover aim/fire range, backing away, regrouping, doing nothing while downed, determinism.
- **Bot clients (Task 7).** `tools/bots/botClient.ts` + `run.ts`, `npm run bots -- …` (root devDependencies `tsx` 4.23.15 and `@colyseus/sdk` 0.18.10, the workspaces' pins; script `bots`). Each bot joins (or the first creates, with `--scenario`, and starts once all are Ready), taps Ready, answers `net.pinged`, decodes horde frames with the shared `readHordeFrame` into preallocated arrays, builds a `BotView` from the newest state and frame, and sends `input.send` every 50 ms. `--origin` sets the `Origin` header (the SDK passes `ClientOptions.headers` to the WebSocket in Node). One `bot_wave` JSON line per wave per bot, a `bots_summary` at the end. Imports only `packages/shared` and the SDK, never `apps/*`.
- **Load test (Task 8) and doc (Task 9).** `docs/perf/epic-2-network.md`: the designer's "How to run the 4-phone test", Method, Targets, the phone Results table, Server, What players saw, Decisions (templates), and the **Local bot baseline**: worst case (150 alive, team crowded) 12.0–12.5 KB/s average down per client, busiest second 20.6–22.5 (server side), ~90 % of it the horde; up 2.1 KB/s; server tick 0.5 ms avg / 6.9 ms max, no slow ticks. Browser host + 3 bots: 13.0 KB/s avg down (plain and with `?lag=150&jitter=20`), snaps 0.
- **Reversed hits.** The headless browser measured 13 / 73 (17.8 %) and 10 / 77 (13.0 %). This is **not a valid NFR5 reading**: software-rendered Chrome on the shared 2-CPU VM ran ~36 FPS with frames up to 280 ms (the stall case of 2.7). To get a netcode-only number for the big crowd, the 2.7 harness (`tools/netsim/hitsSim.ts`) got a `walkers` option and a reported case: 150 Walkers, 150 ms RTT: standing 0 / 76 (0.0 %), kiting 4 / 76 (5.3 %). Phones decide NFR5 (Task 10).

**Deviations**
- `bytesIn` on the server is exact (the socket's `message` event gives each whole frame) instead of the "inputs × 1 message" estimate the task allowed.
- The bucket logic lives in `packages/shared/src/net/byteRate.ts` (tested there), not inside `netMeter.ts`: the server's `net_stats` and the bots need the same counter, and apps can't import each other. `netMeter.ts` is the client's wrapper and its test drives the same logic with injected time.
- New schema field `RunState.scenario` (not in the story's file list), so guests see the TEST SCENARIO tag too.
- `net_stats` also has `avgInKBps` and `hordeKBps` (the latter answers Task 11's "which stream is responsible"); a per-wave `tick_stats` line was added for the doc's Server section; per-wave counters (`horde_stats` included) now restart at `wave.started`, so the intro and the pause between waves are not in them.
- `BotView.teammates` is a reused array with `teammateCount`, and `BotConfig` has `reviveStopM` (the "stop within 1 m" number lives in `bots.json`, no inline gameplay number).
- `bots.json` is part of the balance files, so the bundled `balance.version` changed (client and server bundle the same files, as before). Tests that build balance from individual JSON files now include `bots`.
- Bots have a load-test knob `--hold-fire <s>` (not policy) so the horde reaches the 150-alive cap; without it 4 bots kill faster than the director spawns (peak 105 alive).
- Task 8 ran on the agent's own server/port (4067) and Vite (6573) with a headless browser instead of `npm run dev` with a real browser.
- The test scenario's refusal test is in its own file (`RunRoom.scenario.test.ts`): Colyseus's matchmaker is one per process, so one test file can't hold two room definitions.

**Not verified**
- Anything on real phones or real 4G (Task 10): FPS, real RTT/jitter and loss, reversed hits with thumbs and aim assist, visible disagreement.
- `--origin` against the production server (no access to the VPS from the cloud session); the header path was read in the SDK source (`WebSocketTransport.connect(url, headers)` in Node).
- The summary box's layout on a small phone screen: at 800 × 450 the text is long and the box scrolls.
- Revives in a real room: the bots never went down there (god mode in `net150`, and none in waves 1–3); the revive is proven by the headless policy test.

### File List

- New: `packages/shared/src/net/{byteRate.ts, byteRate.test.ts, testScenarios.ts}`, `packages/shared/src/bots/{botPolicy.ts, botPolicy.test.ts}`, `packages/shared/src/config/balance/bots.json`, `apps/client/src/net/{netMeter.ts, netMeter.test.ts}`, `apps/client/src/debug/{netSummary.ts, netSummary.test.ts, NetResults.tsx, ResultsDialog.tsx}`, `apps/server/src/rooms/{RunRoom.net.test.ts, RunRoom.scenario.test.ts}`, `tools/bots/{run.ts, botClient.ts}`, `docs/perf/epic-2-network.md`
- Modified: `packages/shared/src/{index.ts, net/messages.ts, net/stateView.ts, config/balance.ts, config/balanceSchema.ts}` and the balance-building tests (`config/balance.test.ts`, `combat/{firing,aimAssist,melee,swap}.test.ts`, `waves/waveDirector.test.ts`, `zombies/zombieAi.test.ts`), `apps/client/src/{debug/PerfOverlay.ts, debug/perfStats.ts, debug/StressResults.tsx, debug/urlOptions.ts, debug/urlOptions.test.ts, net/connection.ts, net/devThrottle.ts, net/fakeRoom.ts, net/lobbyStore.test.ts, scenes/GameScene.ts, sim/NetSimHost.ts, ui/App.tsx}`, `apps/server/src/{app.ts, index.ts, rooms/RunRoom.ts, rooms/schema/RunState.ts, run/RunController.ts, run/slowTick.ts}`, `tools/netsim/{hitsSim.ts, hits.test.ts}`, root `package.json`, `package-lock.json`, `deploy/docker-compose.yml`, `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-11-22: Developer parts of Story 2.10 implemented (byte counters client + server, overlay network lines and TEST SCENARIO tag, wave summary with Copy results, `net150` scenario behind `ALLOW_TEST_SCENARIOS`, shared bot policy + `bots.json`, `tools/bots`, results doc with the local bot baseline and the designer's how-to). Status → review; the human 4-phone test (Tasks 10–11) is still open.
