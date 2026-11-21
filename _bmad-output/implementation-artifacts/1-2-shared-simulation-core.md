# Story 1.2: Shared simulation core

Status: ready-for-dev

## Story

As the designer,
I want the game rules to run in one engine-free package with a fixed 20 Hz step, seeded randomness and data-driven numbers,
so that the same rules can later run on the server and the phone, and every run can be reproduced.

## Acceptance Criteria

1. **World and fixed step.** Given `packages/shared`, when I create a World with `createWorld({ balance, seed })` and call `step(world, 0.05)`, the systems run in the fixed order from the architecture and `world.tick` advances by 1.
2. **Determinism (NFR10).** Two Worlds created with the same seed and fed the same input log are identical after 1,000 ticks (Vitest). The package contains no `Math.random()` or `Date.now()` (already enforced by the Story 1.1 lint rule; this story adds a test that relies on it).
3. **Balance loading.** Given balance JSON files in `packages/shared/src/config/balance/` (`weapons.json`, `zombies.json`, `waves.json`), `loadBalance()` validates them with zod into one typed `Balance` object. An invalid value (e.g. negative damage) makes loading throw an error that names the file and the key.
4. **Event bus.** When a system emits `world.events.emit({ type: "zombie.killed", ... })` during a tick, subscribers receive the tick's events in emission order, exactly once, when the tick ends, and the payload is typed by the `SimEvent` union.
5. **Local SimHost.** Given the client, when the Game scene starts, it runs the World through a `SimHost` interface (local implementation stepping at 20 Hz) and renders by interpolating between steps (an `alpha` in [0, 1) between the previous and current tick).

## Tasks / Subtasks

- [ ] **Task 1: Core types and Result** (AC 1)
  - [ ] `packages/shared/src/core/result.ts`: `Result<T, E>` exactly as in the architecture (Cross-cutting › Error Handling), plus `ok(value)` / `err(error)` helpers
  - [ ] `packages/shared/src/config/constants.ts`: add `TICK_DT_S = 1 / TICK_RATE_HZ` (0.05). Keep `GAME_TITLE`, `TICK_RATE_HZ`
- [ ] **Task 2: Seeded RNG** (AC 2)
  - [ ] `core/rng.ts`: `createRng(seed: number): Rng` using **sfc32**, with the 4 state words seeded by **splitmix32** from `seed >>> 0`. Discard the first 12 outputs (sfc32 warm-up)
  - [ ] `Rng` API: `next(): number` in [0, 1); `int(minIncl, maxIncl): number`; `range(min, max): number`; `pick<T>(arr: readonly T[]): T` (throws on empty, programmer error); `getState(): RngState` (`readonly [number, number, number, number]`) and `createRngFromState(state)` (Story 8.4 snapshots every stream)
  - [ ] `core/rng.test.ts`: same seed → same 1,000 outputs; different seeds differ; `getState`/`createRngFromState` round-trip continues the identical sequence; `int` stays in bounds over 10,000 draws and hits both ends; a frozen golden vector (first 5 `next()` values for seed `12345`) so an accidental algorithm change is caught
  - [ ] Named sub-streams (`decay`, `events`, `shop:<slot>:<phase>`) are **Story 4.4**. Do not build them now; one `world.rng` is enough
- [ ] **Task 3: Event bus** (AC 4)
  - [ ] `core/simEvents.ts`: the `SimEvent` union (see Dev Notes › Events)
  - [ ] `core/eventBus.ts`: `EventBus` with `emit(e)`, `subscribe(handler): () => void` (returns unsubscribe), `flush()`. `emit` appends to a pending array; `flush` delivers pending events in order to every subscriber, then clears. Events emitted *by a subscriber during flush* go into the next tick's queue (never delivered in the same flush, never lost)
  - [ ] `core/eventBus.test.ts`: order, exactly-once, nothing delivered before `flush`, unsubscribe, emit-during-flush behaviour, payload typing (a `// @ts-expect-error` line for a wrong payload)
- [ ] **Task 4: Balance data and loader** (AC 3)
  - [ ] `config/balance/weapons.json`, `zombies.json`, `waves.json` with the Epic 1 values (see Dev Notes › Balance data)
  - [ ] `config/balanceSchema.ts`: zod schemas per file (see Dev Notes › Balance schema)
  - [ ] `config/balance.ts`: `loadBalance(raw?: RawBalanceFiles): Balance`. With no argument it uses the bundled JSON (static `import ... with { type: "json" }`, see Dev Notes › JSON imports). With an argument (tests) it validates what it's given. On failure it throws `BalanceError` whose message is `"<file>.json: <path.to.key>: <zod message>"`
  - [ ] `Balance` also carries `version: string`: an FNV-1a 32-bit hash (hex) of the canonical JSON of all files (`core/hash.ts`, keys sorted). Story 2.1 compares it between client and server
  - [ ] `config/balance.test.ts`: bundled files load; negative `damage` on `pistol` throws naming `weapons.json` and `pistol.damage`; a missing file key throws; the version is stable for the same input and changes when any number changes; `Balance` is deeply frozen (`Object.isFrozen` on a nested object)
- [ ] **Task 5: World and step** (AC 1, 2)
  - [ ] `core/world.ts`: `createWorld({ balance, seed, systems? })` and `step(world, dtS)` (see Dev Notes › World)
  - [ ] `core/systems.ts`: `SYSTEM_ORDER` and the default no-op systems (see Dev Notes › System order)
  - [ ] `net/input.ts`: `PlayerInput` type + zod `playerInputSchema` + `NEUTRAL_INPUT` (see Dev Notes › Input). `setInput(world, playerId, input)` in `core/world.ts` stores the latest input per player; the input system copies it into `world.inputs` for the tick
  - [ ] `core/world.test.ts`: tick advances by 1 per step; systems are called in `SYSTEM_ORDER` (inject recording systems via `systems`); `step` with `dtS !== TICK_DT_S` throws; event flush happens last (a recording subscriber sees events emitted by any system in the same tick, after every system has run)
  - [ ] `core/determinism.test.ts`: two Worlds, seed `42`, the same scripted input log (1,000 ticks, inputs changing every few ticks, generated from a *separate* seeded Rng), plus an injected test system that draws from `world.rng` and accumulates into world state and emits events. After 1,000 ticks `snapshotForTest(world)` (tick, rng state, accumulated values, event log) is deep-equal. A third World with seed `43` differs
- [ ] **Task 6: Public API** — `packages/shared/src/index.ts` exports: constants, `Result`/`ok`/`err`, `createRng`/`createRngFromState`/`Rng`/`RngState`, `EventBus`, `SimEvent`, `loadBalance`/`Balance`/`BalanceError`, `createWorld`/`step`/`setInput`/`World`, `PlayerInput`/`playerInputSchema`/`NEUTRAL_INPUT`
- [ ] **Task 7: Client SimHost** (AC 5)
  - [ ] `apps/client/src/sim/SimHost.ts`: the interface (see Dev Notes › SimHost)
  - [ ] `apps/client/src/sim/LocalSimHost.ts`: fixed-step accumulator over the shared World
  - [ ] `apps/client/src/sim/LocalSimHost.test.ts` (node environment, no Phaser): 1 s of 16.7 ms frames → exactly 20 steps; a 2 s frame (tab was hidden) steps at most `MAX_CATCHUP_STEPS` then drops the rest; `alpha` stays in [0, 1); events from all steps of a frame are handed out once, in order
  - [ ] `apps/client/src/scenes/GameScene.ts`: creates a `LocalSimHost` with `loadBalance()` and a seed from `crypto.getRandomValues`, calls `host.update(delta / 1000)` in `update()`, shows a small debug text `tick N` (top-left, 14 px × dpr). This text is temporary scaffolding; Story 1.3 replaces it with the street and survivor
  - [ ] `BootScene` starts `GameScene` after showing the title for 0.5 s (`this.time.delayedCall`). Keep the rotate overlay as is
- [ ] **Task 8: Verify** — `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` all pass; record results in the Dev Agent Record. Open the dev build in the headless browser (as Story 1.1 did) and confirm the `tick N` counter rises at ~20/s

## Dev Notes

### Scope (read first)

- **In scope:** World, fixed step, system order (as no-op stubs), seeded RNG, event bus, balance loader + Epic 1 balance data, input message type, client `SimHost` + `LocalSimHost`, a placeholder `GameScene`.
- **Out of scope:** players and movement (1.3), zombie pool and spatial grid (1.4), projectiles (1.5), wave director (1.7), named RNG streams (4.4), Colyseus (2.1). Do **not** add empty folders for later domains.
- Story 1.1 code to keep working: `BootScene` (title, re-centering), `display.ts` (`dpr()`), `main.ts` (DPR-capped canvas, resize), `RotateOverlay`, the ESLint shared boundary and its test, CI. Read them before editing.

### Story 1.1 learnings that apply

- Phaser import is `import * as Phaser from "phaser";`. Phaser 4 has no `resolution` option; text sizes are CSS px × `dpr()`.
- `verbatimModuleSyntax` is on: use `import type` for types. `exactOptionalPropertyTypes` is on: optional fields must be omitted, not set to `undefined`.
- `noUncheckedIndexedAccess` is on: array/record reads are `T | undefined`. In hot loops index typed arrays (which are not affected), or assert once outside the loop.
- `.npmrc` has `save-exact=true`; any new dependency is pinned exactly. This story needs **no new dependency** (zod 4.6.7 is already in shared).
- Lint forbids `setTimeout`, `performance`, `Math.random`, `Date.now`, DOM and Node in `packages/shared`, including its tests.

### World

```ts
// packages/shared/src/core/world.ts
export interface World {
  tick: number;                 // ticks stepped so far
  readonly balance: Balance;
  readonly seed: number;        // uint32
  readonly rng: Rng;
  readonly events: EventBus;
  readonly pendingInputs: Map<string, PlayerInput>; // latest input per player id, set by setInput()
  inputs: Map<string, PlayerInput>;                // inputs applied this tick (copied by the input system)
  // Later stories add their state here (players 1.3, zombies 1.4, projectiles 1.5, waves 1.7 …)
}

export interface CreateWorldOptions {
  balance: Balance;
  seed: number;
  systems?: Partial<Systems>;   // tests only: replace systems by name
}

export function createWorld(opts: CreateWorldOptions): World;
export function setInput(world: World, playerId: string, input: PlayerInput): void;
export function step(world: World, dtS: number): void; // throws if dtS !== TICK_DT_S (compare with 1e-9 tolerance)
```

- `step` runs `SYSTEM_ORDER` in order with `dtS`, then `world.tick += 1`, then `world.events.flush()` **last** (architecture: "drained once per tick").
- Store the resolved systems on the World in a non-enumerable/private field (e.g. a `WeakMap<World, Systems>` in `world.ts`) so state snapshots and deep-equal tests don't see functions.
- Players are keyed by a string `playerId` because the server will use Colyseus session ids; Epic 1 uses `"local"`.
- Keep World a plain object (no class) so Story 8.4 can snapshot it.

### System order

Architecture › Communication Patterns, verbatim order:

```ts
// packages/shared/src/core/systems.ts
export const SYSTEM_ORDER = [
  "input", "player", "buildings", "combat", "zombies", "boss",
  "waves", "specialEvents", "economy", "decayTimers",
] as const;
export type SystemName = (typeof SYSTEM_ORDER)[number];
export type SystemFn = (world: World, dtS: number) => void;
export type Systems = Record<SystemName, SystemFn>;
```

- Default systems: `input` copies `pendingInputs` into `inputs` (fresh Map each tick, so a player who sent nothing keeps their last input, which is the networking rule for dropped packets). All others are no-ops in this story.
- Later stories **replace** a no-op by importing their real system into the defaults map in `systems.ts` (e.g. 1.3 sets `player: updatePlayers`). Never reorder `SYSTEM_ORDER`.
- Event dispatch is not a system; it is the fixed last call in `step`.

### Events

```ts
// packages/shared/src/core/simEvents.ts — start small; each story adds its own variants
export type SimEvent =
  | { type: "zombie.killed"; zombieId: number; killerId: string | null; x: number; y: number; weapon: string }
  | { type: "test.ping"; n: number }; // used by tests only; remove when real events exist
```

- Naming rule: `domain.past_tense` in snake case. `weapon` becomes the `WeaponId` union once 1.5 exists.
- `EventBus` is synchronous, has no async handlers, and allocates nothing per event beyond the pending array push. Reuse two arrays (swap on flush) instead of allocating each tick.

### Input

```ts
// packages/shared/src/net/input.ts
export const playerInputSchema = z.object({
  seq: z.number().int().nonnegative(),
  moveX: z.number().min(-1).max(1), moveY: z.number().min(-1).max(1),
  aimX: z.number().min(-1).max(1),  aimY: z.number().min(-1).max(1),
  fire: z.boolean(),        // aim stick past its dead zone, or mouse held
  swap: z.boolean(),        // edge-triggered by the client: true for one sample per tap
  consumable: z.boolean(),  // Story 5.12; always false until then
  isMouse: z.boolean(),     // disables aim assist (FR4)
}).strict();
export type PlayerInput = z.infer<typeof playerInputSchema>;
export const NEUTRAL_INPUT: PlayerInput = { seq: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, swap: false, consumable: false, isMouse: false };
```

- Flat numbers (not nested vectors) keep the message small and zod-cheap; Story 2.1 validates this exact schema on the server, Story 2.4 sends one per 50 ms step.
- Move/aim are already-normalized stick vectors (length ≤ 1); dead zones are applied on the client (1.3, 1.5), and the simulation clamps length to 1 defensively.

### Balance data (Epic 1 values, from the GDD)

`weapons.json` (keys are balance ids, lowercase snake):

| id | kind | damage | rateHz | rangeM | spreadDeg | magazine | reloadS | pierce | arcDeg | price |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| pistol | gun | 5 | 3 | 9 | 2 | 12 | 1.0 | 1 | — | 0 |
| smg | gun | 4 | 12 | 8.5 | 8 | 40 | 1.6 | 1 | — | 200 |
| hunting_rifle | gun | 35 | 1.2 | 17 | 0 | 5 | 2.5 | 5 | — | 350 |
| machete | melee | 12 | 2.5 | 1.8 | — | — | — | — | 110 | 150 |

- Guns also get `projectileSpeedMps: 60`. GDD gives no Pistol spread; 2° is a placeholder, flag it in Completion Notes. Hunting Rifle spread 0 (GDD lists none).
- `knockbackM`: optional, default 0 (Fire Axe/Shotgun in Epic 5). Hit pushback for every hit (FR19) is a separate small value: `hitPushbackM: 0.15` per weapon, tuned in 1.12.
- `screenShake`: boolean per weapon (true for `hunting_rifle`), FR19.

`zombies.json`: `{ "types": { "walker": { "hp": 10, "speedMps": 1.2, "damage": 10, "attackIntervalS": 1.0, "radiusM": 0.35, "reward": 2 } } }`. Per-type stats live under `types` so later stories can add non-type sections (Story 1.4 adds `crowd` for separation). GDD: contact hits once per second. Radius is not in the GDD; 0.35 m is a placeholder for a person seen from above.

`waves.json`: `zombiesPerWave: 40` (wave N spawns N × 40), `maxAlive: 150`, `lastRushCount: 5`, `pauseBetweenWavesS: 5` (Epic 1 only; Story 3.1 replaces it with the build phase).

Player stats (100 HP, 4.5 m/s, radius 0.4 m) are **Story 1.3's** to add (`player.json`), with the schema extended in the same way.

### Balance schema

```ts
// packages/shared/src/config/balanceSchema.ts (shape, not final code)
const gun = z.object({ kind: z.literal("gun"), damage: z.number().positive(), rateHz: z.number().positive(),
  rangeM: z.number().positive(), spreadDeg: z.number().min(0).max(90), magazine: z.number().int().positive(),
  reloadS: z.number().positive(), pierce: z.number().int().min(1), projectileSpeedMps: z.number().positive(),
  knockbackM: z.number().min(0).default(0), hitPushbackM: z.number().min(0), screenShake: z.boolean(),
  price: z.number().int().min(0) }).strict();
const melee = z.object({ kind: z.literal("melee"), damage: ..., rateHz: ..., rangeM: ..., arcDeg: z.number().positive().max(360),
  knockbackM: ..., hitPushbackM: ..., screenShake: ..., price: ... }).strict();
export const weaponsSchema = z.record(z.string().regex(/^[a-z][a-z0-9_]*$/), z.discriminatedUnion("kind", [gun, melee]));
```

- Use `.strict()` so a typo in a key fails loading instead of being ignored.
- Error naming: wrap each file's `safeParse`; build the key path from `issue.path.join(".")`; message `weapons.json: pistol.damage: Too small: expected number to be >0`. Throw one `BalanceError` listing every issue (newline-separated); its `message` must contain the first issue's file and path (the AC test checks `weapons.json` and `pistol.damage`).
- `zombiesSchema = z.object({ types: z.record(id, zombieType) }).strict()`; later stories extend the object (e.g. `crowd`), never the per-type record shape without updating every entry.
- After validation, deep-freeze the result (`Object.freeze` recursively) so no system can mutate balance at runtime.
- Types: `export type Balance = { version: string; weapons: Weapons; zombies: Zombies; waves: Waves }` from `z.infer`. Systems read `world.balance.weapons.pistol.damage`, never raw JSON (architecture › Data Patterns).

### JSON imports

- Use `import weapons from "./balance/weapons.json" with { type: "json" };`. `resolveJsonModule` is already on in `tsconfig.base.json`; Vite and Vitest both support import attributes. If TypeScript 6.0 rejects the attribute under `module: ESNext` + `moduleResolution: bundler`, drop the `with` clause (plain default import works in both tools) and note it.
- Do not read files with `fs`: shared is engine-free and the client bundles the JSON.

### Hash

`core/hash.ts`: `fnv1a32(str): number` and `canonicalJson(value): string` (objects with sorted keys, no whitespace). `version = fnv1a32(canonicalJson({ weapons, zombies, waves })).toString(16).padStart(8, "0")`. Pure string math, so it is identical on the server and in the browser.

### SimHost

```ts
// apps/client/src/sim/SimHost.ts
export interface SimHost {
  /** Advance by a real frame time in seconds; steps the simulation 0..N times. */
  update(frameDtS: number): void;
  /** Fraction of the next step elapsed, in [0, 1). Renderers lerp prev → current by alpha. */
  readonly alpha: number;
  /** The authoritative (local) or predicted (networked) world, read-only for renderers. */
  readonly world: Readonly<World>;
  /** Send the local player's input for upcoming steps. */
  setLocalInput(input: PlayerInput): void;
  /** Events produced since the last call, in order; each event is returned exactly once. */
  drainEvents(): readonly SimEvent[];
  dispose(): void;
}
```

- `LocalSimHost`: accumulator; while `acc >= TICK_DT_S` and fewer than `MAX_CATCHUP_STEPS` (5) steps this frame: `setInput(world, "local", input)`, `step(world, TICK_DT_S)`. If the cap is hit, drop the leftover time (prevents the spiral of death after a hidden tab). `alpha = acc / TICK_DT_S`.
- It subscribes to `world.events` once and pushes into an array returned by `drainEvents()`.
- Interpolation needs previous positions. Pools added in later stories keep `prevX/prevY` arrays that the movement systems copy at the start of each tick; renderers draw `lerp(prev, cur, alpha)`. This story only provides `alpha`; say so in a comment on `SimHost`.
- The interface must not expose anything local-only; Story 2.4 adds `NetSimHost` behind the same interface without changing scenes (architecture › Development Environment).
- `apps/client/src/sim/` is a new folder (architecture lists `net/` for the networked host); it holds the interface and the local host. Record this variance.
- `MAX_CATCHUP_STEPS` and the seed source are client platform code, not gameplay numbers, so they may live in client code.

### Testing

- Vitest runs in the node environment (root `vitest.config.ts`). `LocalSimHost.test.ts` must not import Phaser (`LocalSimHost.ts` must not import Phaser either).
- Every new mechanic gets a test with a fixed seed (architecture › Consistency Rules).
- Determinism tests compare plain data (`structuredClone` the parts under test). No functions or Maps in the compared object; convert Maps to sorted arrays.

### Project Structure Notes

New files:

```
packages/shared/src/core/{result.ts, rng.ts, rng.test.ts, eventBus.ts, eventBus.test.ts, simEvents.ts,
                          hash.ts, world.ts, world.test.ts, systems.ts, determinism.test.ts}
packages/shared/src/config/{balance.ts, balance.test.ts, balanceSchema.ts}
packages/shared/src/config/balance/{weapons.json, zombies.json, waves.json}
packages/shared/src/net/input.ts
apps/client/src/sim/{SimHost.ts, LocalSimHost.ts, LocalSimHost.test.ts}
apps/client/src/scenes/GameScene.ts
```

Modified: `packages/shared/src/index.ts`, `packages/shared/src/config/constants.ts` (+ its test), `apps/client/src/main.ts` (register `GameScene`), `apps/client/src/scenes/BootScene.ts` (start `GameScene`).

### References

- Story and ACs: [Source: _bmad-output/planning-artifacts/epics.md#Story 1.2: Shared simulation core]
- Fixed step, determinism, timers in ticks: [Source: game-architecture.md#Networking]
- System order and `step()` example: [Source: game-architecture.md#Communication Patterns]
- Event bus rules and `SimEvent` example: [Source: game-architecture.md#Event System]
- Balance loading, `Balance` object, no inline numbers: [Source: game-architecture.md#Configuration], [#Data Patterns], [#Consistency Rules]
- `Result` type: [Source: game-architecture.md#Error Handling]
- SimHost local mode: [Source: game-architecture.md#Development Environment]
- Weapon and zombie numbers: [Source: gdd.md#Weapon Systems], [#Enemy Design and AI]; wave sizes [#Enemy Wave Design]
- Story 1.1 conventions and versions: [Source: _bmad-output/implementation-artifacts/1-1-project-scaffold-with-a-playable-link.md]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
