# Story 2.10: 4-phone 4G test

Status: ready-for-dev

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

- [ ] **Task 1 (dev): Byte counters, client** (AC 1)
  - [ ] Add `apps/client/src/net/netMeter.ts`. On join, attach a `message` listener to the SDK socket (`(room.connection.transport as { ws?: WebSocket }).ws`) that adds `event.data.byteLength`, with `binaryType` `arraybuffer`.
  - [ ] Wrap `room.connection.send` to count outgoing bytes.
  - [ ] Keep 1-second buckets in a ring of 60 (no allocation per message). Expose `downKBps`, `upKBps` (1 s), `avgDownKBps` (since wave start) and `peakDownKBps`.
  - [ ] KB means 1024 bytes, payload only: no WebSocket, TCP or TLS overhead. Say so in the doc.
  - [ ] Unit-test the bucket logic with injected time.
- [ ] **Task 2 (dev): Byte counters, server** (AC 2)
  - [ ] In `onJoin`, wrap that client's `raw()` to add `data.byteLength` to the member's `bytesOut`. Colyseus 0.18 sends messages, `sendBytes` and patches through it; verify with a test that a state patch is counted.
  - [ ] Count `bytesIn` in the `"*"` and guarded handlers, roughly: the encoded size isn't available, so count inputs × 1 message and note that this estimate is approximate.
  - [ ] On `wave.ended`, log `info` `net_stats` per player: `{ roomId, wave, playerId, avgOutKBps, peakOutKBps, rttMs }`, next to `horde_stats` from 2.5.
- [ ] **Task 3 (dev): Overlay lines** (AC 1). The Story 1.11 overlay (`debug/PerfOverlay.ts`) left room for them. When `host.online`, add:
  - [ ] `ping 142 ms · delay 140 ms · jitter 18 ms` (RTT from `net.pinged`, 2.4; delay and jitter from 2.6);
  - [ ] `down 21.4 KB/s (avg 20.8, peak 26.1) · up 2.3 KB/s`;
  - [ ] `horde 20/s · corrections 0 · snaps 0` (2.5, 2.6);
  - [ ] `hits 212 · reversed 4 (1.9%)` (2.7).
  - [ ] Text ≥ 12 px × dpr, `setText` only when a value changes.
- [ ] **Task 4 (dev): Wave summary and Copy** (AC 2): on `wave.ended`, when the overlay is on, show a summary box: avg/min FPS (1.11 stats), avg/peak down KB/s, avg up, avg/p95 ping, reversed / apparent hits, snaps. Add a **Copy results** button (clipboard), as in 1.11's stress summary.
- [ ] **Task 5 (dev): Test scenario "150 alive"** (AC 2). See Dev Notes › Scenario.
- [ ] **Task 6 (dev): Bot policy (shared)** (AC 5): `packages/shared/src/bots/botPolicy.ts` + test. See Dev Notes › Bot policy.
- [ ] **Task 7 (dev): Bot clients** (AC 4): `tools/bots/run.ts`, `tools/bots/botClient.ts`. See Dev Notes › Bot clients.
- [ ] **Task 8 (dev): Load test with bots** (AC 4)
  - [ ] Locally (`npm run dev`), create a room in one browser with `?debug=1`, then run `npm run bots -- --room <CODE> --count 3` and start the scenario.
  - [ ] Record the browser's down KB/s and the server's `net_stats` and `horde_stats` as the first row of the doc, labelled "local, bots, no 4G".
  - [ ] Repeat once with `?lag=150&jitter=20` (2.6 throttle).
- [ ] **Task 9 (dev): Results doc** (AC 2): create `docs/perf/epic-2-network.md`. See Dev Notes › Doc.
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

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- This is a **human story** (the playtest, Task 10, is run by the designer and friends). The dev agent must not mark it done until Tasks 10 and 11 are recorded. Until then, set the status to `review` with a clear "waiting for 4-phone test" note.

### File List
