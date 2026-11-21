# Story 2.1: Game server and a room code

Status: ready-for-dev

## Story

As a host,
I want to tap "Create game" and get a 4-letter code and a share link,
so that I can invite my friends.

## Acceptance Criteria

1. **Server starts.** In the repo root, `npm run dev` starts a Colyseus 0.18 server next to the Vite client. The server logs `server_started` as pino JSON and answers `GET /health` with 200.
2. **Create game.** On the client's start screen (Preact overlay), when I enter a name (1–16 characters) and tap **Create game**, a `RunRoom` is created. Its id is a random 4-letter code without ambiguous letters (no I, O, 0, 1).
3. **Lobby.** The lobby shows the code and the link `https://<host>/j/<code>`, with a **Copy** button and a **Share** button (Web Share API where available).
4. **Balance check.** A client whose balance version differs from the server's is refused with "Please refresh".
5. **Message hygiene.** Every client message is validated with its zod schema from `packages/shared/src/net`. Messages over 1 KB, invalid messages, unknown message types and more than 25 inputs/s per client are dropped and logged at `warn`.

## Tasks / Subtasks

- [ ] **Task 1: Dependencies** (AC 1). Pin exact versions (`.npmrc` has `save-exact=true`). Re-check each with `npm view <pkg> version` first:
  - `apps/server` dependencies: `@colyseus/core` 0.18.29, `@colyseus/ws-transport` 0.18.5, `@colyseus/schema` 5.0.50, `pino` 10.4.0, `tsx` 4.23.15 (moved from devDependencies; Story 2.2 runs the server with `node --import tsx`).
  - `apps/server` devDependencies: `@colyseus/sdk` 0.18.10, `@colyseus/testing` 0.18.6, `@colyseus/tools` 0.18.11 (testing imports it), `ws` 8.23.0 (raw-socket tests).
  - `apps/client` dependencies: `@colyseus/sdk` 0.18.10.
  - See Dev Notes › Packages for why this is not the `colyseus` umbrella package.
- [ ] **Task 2: Net contract in shared** (AC 2, 4, 5). Add `packages/shared/src/net/messages.ts` (see Dev Notes › Net contract) and `net/roomCode.ts` (`ROOM_CODE_ALPHABET`, `ROOM_CODE_LENGTH`, `isRoomCode(s)`, `normalizeRoomCode(s)` that uppercases and trims). Export both from `index.ts`. Add tests for `isRoomCode` and for the zod schemas (name trimming, 1–16 characters, control characters refused, unknown keys refused because of `.strict()`).
- [ ] **Task 3: Server bootstrap** (AC 1).
  - `apps/server/src/app.ts`: `createGameServer(opts)` returns `defineServer({ rooms: { [RUN_ROOM_NAME]: defineRoom(RunRoom) }, routes: createRouter({ health }), transport: new WebSocketTransport({ maxPayload: MAX_CLIENT_MESSAGE_BYTES }), greet: false })`.
  - `apps/server/src/index.ts`: replace the stub. Read env once (`PORT` default 2567, `HOST` default `0.0.0.0`, `LOG_LEVEL` default `info`), listen, then log `log.info({ port, balanceVersion }, "server_started")`. Keep the SIGINT/SIGTERM handling: Colyseus registers graceful shutdown itself, so remove the manual `process.exit` that the stub had.
  - `apps/server/src/ops/logger.ts`: the root pino logger plus `roomLog(roomId)`, a child logger with `roomId`.
  - `apps/server/src/ops/health.ts`: `createEndpoint("/health", { method: "GET" }, …)` returns `200 {"ok":true,"rooms":n,"uptimeS":n}`.
- [ ] **Task 4: RunRoom skeleton** (AC 2, 4, 5). Add `apps/server/src/rooms/RunRoom.ts`, `rooms/roomCode.ts` (server-side generation) and `rooms/schema/RunState.ts`. See Dev Notes › RunRoom.
- [ ] **Task 5: Message guard** (AC 5). Add `apps/server/src/net/messageGuard.ts` with `guard(schema, handler)`, a token bucket (`net/tokenBucket.ts`), drop logging and the `"*"` fallback. See Dev Notes › Message hygiene.
- [ ] **Task 6: Dev wiring** (AC 1). In `apps/client/vite.config.ts`, add `server.proxy["/api"] = { target: "http://localhost:2567", ws: true, rewrite: (p) => p.replace(/^\/api/, "") }`, so the client always talks to `${location.origin}/api` (phones on the same Wi-Fi work too). Production uses the same path through Caddy (Story 2.2). The root `dev` script already runs both workspaces; keep it.
- [ ] **Task 7: Client connection** (AC 2, 4). Add `apps/client/src/net/connection.ts`:
  - `serverUrl()` returns `import.meta.env.VITE_SERVER_URL ?? \`${location.origin}/api\``.
  - `createGame(name)` returns `Promise<Result<Room<RunStateView>, string>>`. It calls `client.create(RUN_ROOM_NAME, { intent: "create", name, balanceVersion })` and maps errors to player text with `joinErrorText(err)` (in `net/joinErrors.ts`, unit-tested).
- [ ] **Task 8: Start screen and lobby UI** (AC 2, 3). See Dev Notes › Client flow.
  - Add `ui/StartScreen.tsx` (name input remembered in localStorage under `topdown.name` with try/catch, **Create game**, **Practice solo**).
  - Add `ui/LobbyScreen.tsx` (big code, link, Copy, Share, player list).
  - Add `ui/share.ts`: `shareLink(code)` returns `${location.origin}/j/${code}`; `share()` uses `navigator.share` if present, else copies with `navigator.clipboard.writeText` and shows "Link copied".
  - Extend `uiState.ts` with the new screens.
- [ ] **Task 9: Tests** (AC 1–5). See Dev Notes › Testing.

## Dev Notes

### Scope and prerequisites

- Epic 1 code is the base: read `packages/shared/src/net/input.ts`, `config/balance.ts` (`balance.version` is an fnv1a hash of the validated balance), `apps/client/src/ui/uiState.ts`, `ui/App.tsx`, `scenes/BootScene.ts` and `apps/server/src/index.ts` (the stub).
- Out of scope:
  - joining by code or link, Ready, Start, slots and colors, and guest tokens (all Story 2.3);
  - running the World on the server (2.4);
  - deploy, Origin check and the room-creation rate limit (2.2).
- The lobby in this story shows only the host. That is expected.

### Packages

- `colyseus` 0.18.12 (the umbrella package in the architecture table) re-exports `@colyseus/core`, `ws-transport`, `auth`, `monitor`, `playground`, `redis-driver` and `redis-presence`. We need only core, ws-transport and schema. Installing those directly gives a smaller Docker image and fewer dependencies. Record this as a deliberate variance. The ESLint boundary already blocks `colyseus` and `@colyseus/*` inside `packages/shared`.
- `@colyseus/schema` 5: use the **`schema()` + `t.*` builder API**, not `@type` decorators. Decorators need `experimentalDecorators` and `useDefineForClassFields: false`, which conflict with our tsconfig and Vite. Example: `export const PlayerState = schema({ name: t.string(), slot: t.uint8() }, "PlayerState"); export type PlayerState = SchemaType<typeof PlayerState>;`. Collections take the type name: `t.map(PlayerState)`, `t.array("string")`.
- Verified on 0.18 with a scratch probe (2026-11-21):
  - A `ServerError(526, "balance_mismatch")` thrown in `static onAuth` makes the SDK reject with a `MatchMakeError` whose `code` is 526 and whose `message` is `balance_mismatch`.
  - An unknown room id gives code 522 with message `room "ZZZZ" not found`. A full room gives code 522 with message `room "ABCD" is locked`.
  - A `ServerError` thrown in `onJoin` also rejects the SDK join promise with that code and message.
  - `client.sendBytes(1, bytes)` arrives in `room.onMessage(1, (b: Uint8Array) => …)` as a `Uint8Array` view.

### Net contract (decided here; later stories extend it, never rename it)

`packages/shared/src/net/messages.ts`:

```ts
export const RUN_ROOM_NAME = "run";
/** Client → server: imperative `domain.verb` (architecture › Naming). */
export const C2S = {
  INPUT_SEND: "input.send",           // PlayerInput (net/input.ts), 20/s (Story 2.4)
  LOBBY_SET_READY: "lobby.set_ready", // { ready: boolean } (2.3)
  RUN_START: "run.start",             // {} host only (2.3)
  NET_PONG: "net.pong",               // { id } echo of net.pinged (2.4)
  LOBBY_RETURN: "lobby.return",       // {} after Results (2.8)
} as const;
/** Server → client: past tense. */
export const S2C = {
  RUN_JOINED: "run.joined",                 // { playerId, slot, tickRateHz } (2.3/2.4)
  SIM_EVENTS_FLUSHED: "sim.events_flushed", // { tick, events: NetEvent[] } (2.4)
  NET_PINGED: "net.pinged",                 // { id, rttMs } (2.4)
  SERVER_SHUTDOWN_STARTED: "server.shutdown_started", // { message } (2.2)
  PLAYER_LEFT: "player.left",               // { playerId, name, reason } (2.11)
} as const;
/** Binary messages use numeric types (1 byte on the wire instead of a string). */
export const BYTES = { HORDE_FRAME: 1 } as const; // Story 2.5
export type JoinRefusal = "invalid_options" | "balance_mismatch" | "run_started" | "rate_limited";
export const joinOptionsSchema = z.object({
  intent: z.enum(["create", "join"]),
  name: playerNameSchema,  // z.string().trim().min(1).max(16).regex(/^[^\p{C}]+$/u)
  balanceVersion: z.string().min(1).max(16),
  // guestToken: added by Story 2.3
}).strict();
```

- The schemas live here (architecture boundary 6). The server imports them. The client uses the inferred types so it can never send a shape the server rejects.
- Player ids inside the World are `p0`–`p3`, the stable slot (decided here for 2.3/2.4). Map keys in schema use the same ids. Never use the Colyseus `sessionId` as a player id: it changes on rejoin in Epic 8.

### RunRoom

- `onCreate(options)`:
  - Refuse unless `options.intent === "create"`. `static onAuth` has already validated the options.
  - Set `this.roomId = await uniqueRoomCode()`. It draws 4 letters from `ROOM_CODE_ALPHABET` with `crypto.randomInt` and retries while `matchMaker.getLocalRoomById(code)` exists (at most 20 tries, then throw).
  - Set `this.maxClients = 4`, `this.patchRate = 50`, `this.state = new RunState()` with `phase = "lobby"`, then register the handlers.
- `static async onAuth(_token, options, ctx)`:
  - If `JSON.stringify(options).length > MAX_CLIENT_MESSAGE_BYTES`, throw `new ServerError(526, "invalid_options")`.
  - Otherwise run `joinOptionsSchema.safeParse(options)`; on failure throw `new ServerError(526, "invalid_options")`.
  - If `options.balanceVersion !== serverBalance.version`, throw `new ServerError(526, "balance_mismatch")`.
  - Return `{ name, ip: ctx.ip }`. Only the static `onAuth` runs: Colyseus ignores an instance-level `onAuth` when a static one exists.
  - Load the balance once at module level with `loadBalance()`.
- `onJoin(client)`: add a `PlayerState` (`name` from `client.auth`; slot 0 for now, Story 2.3 assigns real slots), set `hostSlot = 0`, then `log.info({ roomId, playerId }, "player_joined")`.
- `onLeave(client, code)`: remove the player. A room left empty disposes itself (`autoDispose` stays true). Log `player_left` with the code.
- `rooms/schema/RunState.ts` (extended by 2.3, 2.4 and 2.8; field names are final):
  - `RunState { phase: t.string(), hostSlot: t.uint8(), players: t.map(PlayerState) }`
  - `PlayerState { slot: t.uint8(), name: t.string() }`

  `phase` takes `"lobby" | "wave" | "results"` in Epic 2; Epic 3 adds `"build"`. Define a `RunPhase` union in `shared/net/messages.ts`.
- Plain shapes for the client: add `packages/shared/src/net/stateView.ts` with TypeScript interfaces `RunStateView` and `PlayerStateView`, which mirror the schema fields as plain read-only data. The client types `room.state` with them, because it cannot import server code. In `RunState.ts`, add a compile-time check that the schema type is assignable to the view, so drift is a type error.

### Message hygiene

- **Never pass a zod schema to `this.onMessage(type, schema, cb)`.** In 0.18, a failed Standard Schema validation **disconnects** the client, and the AC wants "dropped". Instead register `this.onMessage(type, guard(schema, handler))`. `guard` calls `safeParse`; on failure it drops the message and counts the drop.
- Unknown types: register `this.onMessage("*", …)`. It drops and logs. Without it, Colyseus disconnects clients that send an unregistered type (verified).
- **1 KB limit:** set the `ws` `maxPayload` to `MAX_CLIENT_MESSAGE_BYTES = 1024`. A bigger frame is refused by `ws`, which closes that socket (the client sees 1009, the server's `onLeave` sees 1006: verified). Room code never sees the frame. In `onJoin`, add `client.ref.on("error", (e) => { if (e.code === "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH") warn(...) })` so it is logged at `warn`. A real client never sends more than about 200 bytes. Record this as the mechanism for "dropped" in the Completion Notes. Join options travel by HTTP and are checked in `onAuth` (above).
- **Rate:** `input.send` uses a token bucket per client (capacity 25, refill 25/s) on `this.clock.currentTime`. A bucket, not a 1-second window, so the burst after a 4G stall is accepted. Every other message type shares a second bucket (10/s). Don't use Colyseus `maxMessagesPerSecond`: it disconnects.
- **Logging drops:** a burst must not flood the log. Log at most one `warn` per client and reason every 10 s, with a count: `log.warn({ roomId, playerId, reason, dropped }, "client_message_rejected")`. Reasons: `invalid`, `unknown_type`, `rate`, `too_large`.
- Limits live in `apps/server/src/net/limits.ts` (`MAX_CLIENT_MESSAGE_BYTES`, `MAX_INPUTS_PER_S`, `MAX_OTHER_MESSAGES_PER_S`). They are security limits, not gameplay numbers, so they don't belong in balance.
- In this story `input.send` has a handler that validates with `playerInputSchema`, then ignores the message. Story 2.4 queues it.

### Client flow

- `uiState.ts`: `UiScreen` gains `{ kind: "start"; error?: string }` and `{ kind: "lobby"; code: string }`. Lobby data (players) comes from a small `lobbyStore` that the net session updates from `room.state`. `UiRequests` gains `createGame(name)`, `startSolo()` and `leaveLobby()`. Keep `restart`.
- `BootScene` no longer starts `Game` by itself. After the title it sets `uiStore.set({ kind: "start" })` and registers `startSolo` (→ `scene.start("Game", { mode: "solo" })`). `GameScene.create(data)` reads `data.mode` (only `"solo"` exists until 2.4) and otherwise behaves exactly as today.
- URL options that start a solo run directly (`?solo`, and `?stress`/`?loadout`/`?tune` from Stories 1.11–1.12 if present) skip the start screen. **Practice solo** keeps the published link useful for the Epic 1 playtests.
- The lobby is a full overlay with `pointer-events: auto`. Show the code in large letters (≥ 48 CSS px, letter-spaced) and the link under it. Buttons are at least 44 × 44 px (`ui/sizes.ts` from 1.8 if it exists). **Leave** calls `room.leave(true)` and returns to start.
- Error text, through one function `joinErrorText(err)`:

  | Error | Text |
  | --- | --- |
  | `balance_mismatch` | "Please refresh" (add a Refresh button that calls `location.reload()`) |
  | 522 with "not found" | "Game not found" |
  | 522 with "locked" | "This game is full" |
  | `run_started` | "This game has already started" |
  | `rate_limited` | "Too many games created, try again in a minute" |
  | network failure | "Can't reach the server" |

  Story 2.3 uses the same function.

### Testing

- Unit tests (Vitest, `node` environment):
  - `roomCode` (shared): alphabet has no I, O, 0 or 1; length 4; `isRoomCode` rejects 3 or 5 letters, lowercase before normalization, and digits.
  - The server generator: 1,000 codes are all valid, and a collision forces a retry. Inject the "exists" check.
  - `tokenBucket`: 25 accepted then the 26th dropped at t = 0; refill after 40 ms gives one more; a 1 s stall then 20 at once are all accepted.
  - The `messages.ts` schemas.
  - `joinErrorText` (client).
- Integration test `apps/server/src/rooms/RunRoom.test.ts` with `@colyseus/testing`:
  - Write a helper `apps/server/src/test/bootTestServer.ts`: `const server = createGameServer(); await server.listen(2600 + Number(process.env.VITEST_POOL_ID ?? 0)); return new ColyseusTestServer(server)`. Don't use `boot(server)`: it always listens on port 2568, which collides across parallel test files. Shut down in `afterAll`.
  - Cases:
    - create returns a 4-letter code and the state shows the host;
    - a wrong `balanceVersion` rejects with `balance_mismatch`;
    - a bad name rejects with `invalid_options`;
    - an invalid `input.send` is dropped and the client stays connected;
    - an unknown type is dropped and the client stays connected;
    - 40 inputs sent at once give 25 accepted (spy on the handler);
    - a 2 KB message closes that client only;
    - `GET /health` returns 200.
- Keep room tests fast: no real waits beyond a few patches (`room.waitForNextPatch()`).

### Project Structure Notes

- New:
  - `packages/shared/src/net/{messages.ts, messages.test.ts, roomCode.ts, roomCode.test.ts, stateView.ts}`
  - `apps/server/src/{app.ts, ops/logger.ts, ops/health.ts, rooms/RunRoom.ts, rooms/RunRoom.test.ts, rooms/roomCode.ts, rooms/roomCode.test.ts, rooms/schema/RunState.ts, net/messageGuard.ts, net/tokenBucket.ts, net/tokenBucket.test.ts, net/limits.ts, test/bootTestServer.ts}`
  - `apps/client/src/net/{connection.ts, joinErrors.ts, joinErrors.test.ts, lobbyStore.ts}`
  - `apps/client/src/ui/{StartScreen.tsx, LobbyScreen.tsx, share.ts}`
- Modified:
  - `apps/server/{package.json, src/index.ts}`
  - `apps/client/{package.json, vite.config.ts, src/ui/uiState.ts, src/ui/App.tsx, src/ui/overlay.css, src/scenes/BootScene.ts, src/scenes/GameScene.ts (init data only)}`
  - `packages/shared/src/index.ts`, `package-lock.json`
- Server tsconfig: `types: ["node"]`, `moduleResolution: bundler`. tsx runs the ESM sources directly, so no build step is needed.

### References

- [Source: epics.md#Story 2.1: Game server and a room code]
- [Source: game-architecture.md#Run Room Rules] (code, link, maxClients), [#Security and Operations] (1 KB, 25/s), [#Error Handling] (Result, short messages), [#Logging] (pino, `roomId` on every line), [#Configuration] (balance version on join), [#Architectural Boundaries] (6)
- [Source: gdd.md#Multiplayer Considerations] (share link + 4-letter code)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
