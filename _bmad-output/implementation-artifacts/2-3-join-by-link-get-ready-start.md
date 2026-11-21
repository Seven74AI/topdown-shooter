---
baseline_commit: a6d6b123cbc23e07c8c28dac13d992d6f6ab333a
---

# Story 2.3: Join by link, get ready, start

Status: review

## Story

As a friend,
I want to open the link (or type the code), pick a name and tap Ready,
so that I join my friends' game in seconds.

## Acceptance Criteria

1. **Join.** When I open a share link `/j/<code>`, or type a code on the start screen, and enter a name, I join that room's lobby. I see every player's name, color and Ready state.
2. **Guest token.** A device opening the game for the first time creates a random guest token, stored in localStorage (in a try/catch), and sends it on join. The server keeps it hashed in memory as the player's identity for the session.
3. **Refusals.** With 4 players in the lobby, a 5th sees "This game is full". A wrong or expired code shows "Game not found".
4. **Start.** When every joined player is Ready and there are at least 2 players, the host's **Start** button is enabled. Tapping it starts the run for everyone. In development builds the host can start alone (for testing).
5. **Slots.** Each player gets a stable slot 0–3 when they join, with a ring color: blue, orange, green, purple.

## Tasks / Subtasks

- [x] **Task 1: Shared contract** (AC 1, 2, 4)
  - [x] `net/messages.ts` (from 2.1):
    - `joinOptionsSchema` gets `guestToken: z.string().regex(/^[0-9a-f]{32}$/)`;
    - add `lobbySetReadySchema = z.object({ ready: z.boolean() }).strict()` and `runStartSchema = z.object({}).strict()`;
    - `JoinRefusal` gets `"already_joined"`;
    - add `MIN_PLAYERS_TO_START = 2` and `MAX_PLAYERS = 4`.
  - [x] `RunJoined` payload type: `{ playerId: string; slot: number; tickRateHz: number }`.
  - [x] Tests for the new schemas.
- [x] **Task 2: Schema fields** (AC 1, 5): `PlayerState` gets `ready: t.boolean()`. `RunState` already has `hostSlot`. Update `shared/net/stateView.ts` to match.
- [x] **Task 3: Slots, host and identity (server)** (AC 2, 5). Add `apps/server/src/run/lobby.ts`, pure and unit-tested (see Dev Notes › Lobby rules):
  - `assignSlot(taken)` returns the lowest free slot 0–3, or -1;
  - `nextHost(members)` returns the longest-connected member;
  - `hashGuestToken(token)` returns hex SHA-256 (`node:crypto`).
- [x] **Task 4: RunRoom joins** (AC 1–3, 5)
  - [x] `onJoin`: if `state.phase !== "lobby"`, throw `new ServerError(526, "run_started")`. Story 8.2 opens Build-phase joins.
  - [x] Hash the token. If a member with that hash is already in the room, throw `already_joined`.
  - [x] Assign the slot and set `playerId = "p" + slot`.
  - [x] Store the server-only record `{ playerId, slot, sessionId, name, guestTokenHash, joinedAtMs }` in a `Map<sessionId, Member>`, never in schema.
  - [x] Add the `PlayerState` to schema, then `client.send(S2C.RUN_JOINED, { playerId, slot, tickRateHz: TICK_RATE_HZ })`.
  - [x] Log `player_joined` with `playerId` and `slot`. Never log the token or its hash.
- [x] **Task 5: Ready and start (server)** (AC 4)
  - [x] `C2S.LOBBY_SET_READY` (guarded, lobby only) sets the sender's `ready`.
  - [x] `C2S.RUN_START` (guarded) is accepted only when all of these hold:
    - the phase is lobby;
    - the sender's slot is `hostSlot`;
    - every member is ready;
    - there are at least `MIN_PLAYERS_TO_START` members, or 1 if `allowSoloStart`.
  - [x] A refused start is logged at `info` as `run_start_refused` with a reason. Nothing is sent back: the button is disabled on the client anyway.
  - [x] An accepted start sets `state.phase = "wave"` and logs `run_started`. Story 2.4 hooks the `RunController` into this exact transition. Until then the room stays in `wave` with nothing simulated.
  - [x] `allowSoloStart = process.env.NODE_ENV !== "production"` (the Docker image sets production in 2.2). Pass it into `createGameServer({ allowSoloStart })` so tests can choose.
- [x] **Task 6: Leave in the lobby** (AC 1, 5): `onLeave` removes the member and its `PlayerState`, which frees the slot. If the host left, `hostSlot = nextHost(...).slot`.
- [x] **Task 7: Guest token (client)** (AC 2): `apps/client/src/net/guestToken.ts`, see Dev Notes › Guest token.
- [x] **Task 8: Join by code or link (client)** (AC 1, 3)
  - [x] `connection.ts` gets `joinGame(code, name)`, which calls `client.joinById(normalizeRoomCode(code), { intent: "join", name, balanceVersion, guestToken })` and returns a `Result` with the same error mapping (`joinErrorText`).
  - [x] `createGame` also sends the guest token.
  - [x] Add `apps/client/src/net/route.ts`: `parseJoinPath(pathname)` returns the code for `/j/<code>` (case-insensitive, optional trailing slash), else null. Unit-tested.
  - [x] `main.ts`: on a join path, the start screen opens with the code prefilled and the name field focused.
  - [x] After joining, keep the URL. On leave, `history.replaceState(null, "", "/")`.
- [x] **Task 9: Start screen and lobby (client)** (AC 1, 4, 5)
  - [x] Start screen: name field, **Create game**, a 4-letter code field (auto-uppercase, `maxlength=4`, `autocapitalize="characters"`, only alphabet letters accepted) with **Join**, and **Practice solo**.
  - [x] Lobby: a list of 4 rows in slot order. Each row shows a color dot, the name, "Ready" or "Not ready", "Host" for `hostSlot`, and "You" for the local player. Below the list:
    - **Ready** / **Not ready**, a toggle that sends `lobby.set_ready`;
    - **Start**, host only: enabled per AC 4 with the same rule as the server; otherwise show the reason ("Waiting for everyone to be Ready", "Need at least 2 players");
    - **Leave**.
  - [x] Colors: see Dev Notes › Colors.
- [x] **Task 10: Start transition (client)** (AC 4): when `room.state.phase` becomes `"wave"`, call `uiStore.request("startOnline")`. Until Story 2.4 adds the networked host, that shows a full-screen "Starting…" placeholder. Story 2.4 replaces it with `scene.start("Game", { mode: "online", session })`.
- [x] **Task 11: Tests**
  - [x] Unit: `lobby.ts`, `route.ts`, `guestToken.ts` (storage throws → in-memory token, same value within the page; stored token reused; invalid stored value regenerated), and the start-rule helper `canStart(players, isHost, allowSolo)` in `packages/shared/src/net/lobbyRules.ts`, shared by client and server.
  - [x] Integration (`RunRoom.test.ts`, `bootTestServer` from 2.1):
    - 4 clients get slots 0–3 and `run.joined`;
    - a 5th is rejected with 522 "locked" (maps to "This game is full");
    - joining "ZZZZ" gives 522 "not found" (maps to "Game not found");
    - slot 1 leaves and the next joiner gets slot 1;
    - the host leaves and `hostSlot` moves to the longest-connected player;
    - start is refused when someone isn't Ready, refused with 1 player when `allowSoloStart: false`, and accepted with 1 player when it is true;
    - a non-host start is refused;
    - a join after start is rejected with `run_started`;
    - the same guest token twice is rejected with `already_joined`;
    - `room.state` contains no `guestToken` anywhere: serialize `room.state.toJSON()` and check.

## Dev Notes

### Scope and prerequisites

- Builds on 2.1: `RunRoom`, `messages.ts`, `messageGuard`, `connection.ts`, `joinErrors.ts`, `StartScreen`, `LobbyScreen`, `uiState`. Read the 2.1 record and code first.
- Out of scope:
  - running the fight (2.4);
  - mid-run joins (8.2), reconnect (8.1) and host migration mid-run (8.3);
  - district choice: the host "picks a district" in the GDD, but only Downtown exists, so no picker until a second district;
  - accounts (7.x).

### Lobby rules

- **Slots** are stable for the session: a player keeps theirs until they leave. The lowest free slot is reused. The slot gives the player id (`p0`–`p3`, decided in 2.1), the ring color, the spawn position (2.4) and, later, the shop RNG stream (architecture › Personal Shop).
- **Host:** the creator is host (`hostSlot` = their slot, 0). When the host leaves, the longest-connected remaining member becomes host (architecture › Run Room Rules), using `joinedAtMs` order. Epic 8 extends this to a host leaving mid-run.
- **Full** is the Colyseus room lock at `maxClients = 4` (verified: 522 "… is locked"). Don't add a second "full" check.
- **Not found:** 522 "… not found". Also show "Game not found" for a code that fails `isRoomCode` on the client, without calling the server.
- **Started:** rejected in `onJoin` with `run_started` (2.1 already maps it to "This game has already started").
- **Ready:** changing it is allowed only in the lobby. Ready flags are reset when the room returns to the lobby (Story 2.8).

### Guest token

- `getGuestToken()`: read `localStorage.getItem("topdown.guestToken")` in a try/catch. If it matches `/^[0-9a-f]{32}$/`, use it. Otherwise create one from `crypto.getRandomValues(new Uint8Array(16))` as hex and try to store it.
- If storage throws (private mode, blocked storage), keep the token in a module variable for this page. The player then gets a fresh identity on reload, which is fine.
- The server never stores or logs the raw token. It hashes it with SHA-256 and keeps the hash in the member record, in memory only.
- Story 7.1 turns the token into a server session. Story 8.1 uses the hash to match a reconnecting player to their slot. Keep the `Member` record shape easy to extend.
- Not a secret in Epic 2: it only tells players apart. Don't build auth on it yet.

### Colors

Add `apps/client/src/render/playerColors.ts` (Story 2.9 uses it for rings and arrows):

```ts
export const SLOT_COLORS = [0x3d8bff, 0xff8a1f, 0x34c759, 0xb05cff] as const; // blue, orange, green, purple
export const SLOT_COLOR_CSS = ["#3d8bff", "#ff8a1f", "#34c759", "#b05cff"] as const;
export const SLOT_COLOR_NAMES = ["Blue", "Orange", "Green", "Purple"] as const;
```

Each color must stay distinguishable from the others and from the green-grey zombies (NFR11). Story 9.7 may restyle them.

### UI details

- The lobby is a Preact overlay with `pointer-events: auto`.
- The code field and name field use `inputmode`/`autocapitalize` hints, `enterkeyhint="go"` and `autocomplete="off"`.
- On phones the keyboard covers half the landscape screen: keep the fields near the top, and scroll the active field into view.
- Buttons are at least 44 × 44 CSS px and text at least 14 px (readiness fix U4, `ui/sizes.ts` from Story 1.8).
- The lobby list reads `room.state` through `lobbyStore` (2.1). Subscribe with `Callbacks.get(room)`:
  - `onAdd("players", …)`, `onRemove("players", …)`;
  - `listen(player, "ready", …)`;
  - `listen("hostSlot", …)`, `listen("phase", …)`.

  The schema 5 API is `const $ = Callbacks.get(room)`. Re-render from a plain snapshot array, never by passing schema instances into Preact state.

### Testing notes

- `@colyseus/testing` `ColyseusTestServer.sdk` is a real SDK client: create several with `new Client(\`ws://127.0.0.1:${port}\`)` for multi-player cases, or call `colyseus.sdk.joinById` repeatedly.
- Await `room.waitForNextPatch()` before asserting state.
- A rejected join shows up as a `MatchMakeError` (`code`, `message`). Assert on both.

### Project Structure Notes

- New:
  - `apps/server/src/run/{lobby.ts, lobby.test.ts}`
  - `packages/shared/src/net/{lobbyRules.ts, lobbyRules.test.ts}`
  - `apps/client/src/net/{guestToken.ts, guestToken.test.ts, route.ts, route.test.ts}`
  - `apps/client/src/render/playerColors.ts`
- Modified:
  - `packages/shared/src/net/{messages.ts, stateView.ts}`, `index.ts`
  - `apps/server/src/rooms/{RunRoom.ts, RunRoom.test.ts, schema/RunState.ts}`, `app.ts`
  - `apps/client/src/{main.ts, net/connection.ts, net/lobbyStore.ts, ui/StartScreen.tsx, ui/LobbyScreen.tsx, ui/uiState.ts, ui/overlay.css}`

### References

- [Source: epics.md#Story 2.3: Join by link, get ready, start]
- [Source: game-architecture.md#Run Room Rules] (maxClients, joins only in Lobby/Build, host), [#Personal Shop in a Shared Run] (stable slot), [#Security and Operations] (guest tokens stored hashed)
- [Source: gdd.md#Multiplayer Considerations] (guest with a name, Ready, host starts), FR69, FR70
- Ring colors: [Source: epics.md#Requirements Inventory] FR55

## Dev Agent Record

### Agent Model Used

claude-opus-5-5 via gds-dev-story

### Debug Log References

- Checked in `@colyseus/core` 0.18.29 (`MatchMaker.mjs`): `onCreate` receives `merge({}, clientOptions, handler.options)`, so `defineRoom(RunRoom, { allowSoloStart })` defaults always win over anything a client sends, and static `onAuth` only sees the client options (a client adding `allowSoloStart` is refused by the strict schema with `invalid_options`; integration test).
- A `ServerError(526, …)` thrown in `onJoin` reaches the SDK as a `MatchMakeError` with that code and message (`run_started`, `already_joined` tests), same as from `onAuth`.
- `run.joined` is sent in `onJoin`; Colyseus queues it until the client acknowledges the join, so a handler registered right after `create`/`joinById` resolves always gets it (integration tests and the browser check).
- `lobbyStore` is imported statically by `main.ts`, so it must not import the SDK (`Callbacks`) or the lazy `connection` chunk would be pulled into the main bundle. `watchLobby` (schema 5 `Callbacks.get(room)`) lives in `connection.ts` and is passed to `lobbyStore.attach`. Build: main chunk 1,553 kB (no Colyseus code in it), `connection` chunk 181 kB / 57 kB gzip.
- Typecheck: `crypto.getRandomValues` needs `Uint8Array<ArrayBuffer>` under TS 6 lib types.

### Completion Notes List

- **AC 1 (join):** `/j/<code>` (any case, optional trailing slash, `net/route.ts`) opens the start screen with the code prefilled and the name field focused; Enter in the name field then joins. Typing a code works too (field keeps only alphabet letters, uppercased, max 4, `autocapitalize="characters"`, `enterkeyhint="go"`, `autocomplete="off"`; focused fields scroll into view). `connection.joinGame(code, name)` → `client.joinById(normalizeRoomCode(code), { intent: "join", name, balanceVersion, guestToken })`. The lobby lists 4 rows in slot order: color dot, name (or "Open"), "Host", "You", "Ready"/"Not ready", then a Ready/Not ready toggle, Start (host only) with the reason when disabled, and Leave. The URL is kept after joining; Leave does `history.replaceState(null, "", BASE_URL)`.
- **AC 2 (guest token):** `net/guestToken.ts`: `topdown.guestToken` read in try/catch, reused when it matches `/^[0-9a-f]{32}$/`, otherwise 16 random bytes as hex and stored; if storage throws, an in-memory token for the page. Sent on create and join (`joinOptionsSchema.guestToken`, required). `onAuth` hashes it (SHA-256, `run/lobby.ts`) and only the hash reaches `client.auth` and the `Member` record; the raw token never leaves `onAuth`. Neither token nor hash is in room state or logs (integration test serializes `room.state.toJSON()` and the log calls; server log of the browser check has no 32+ hex string).
- **AC 3 (refusals):** 5th player → Colyseus 522 "locked" → "This game is full"; unknown code → 522 "not found" → "Game not found"; a malformed code (e.g. `/j/abio`) shows "Game not found" without calling the server; join after start → `run_started` → "This game has already started"; same guest token twice → `already_joined` → "You're already in this game".
- **AC 4 (start):** shared `canStart`/`startBlocker(players, isHost, allowSolo)` (`packages/shared/src/net/lobbyRules.ts`) drives both the Start button and the server. `run.start` is accepted only in the lobby, from `hostSlot`, everyone Ready, ≥ `MIN_PLAYERS_TO_START` (1 with `allowSoloStart`); refusals log `run_start_refused` at info with `reason` (`not_lobby`/`not_host`/`too_few`/`not_ready`) and send nothing. Accepted: `phase = "wave"`, log `run_started`. Clients see `phase` → `"wave"` and call `uiStore.request("startOnline")` → full-screen "Starting…" (with Leave). `allowSoloStart = NODE_ENV !== "production"` in `index.ts`, passed to `createGameServer({ allowSoloStart })` (default false); the client allows a solo Start with `import.meta.env.DEV`.
- **AC 5 (slots):** `assignSlot` (lowest free 0–3), `playerId = "p" + slot`, `run.joined { playerId, slot, tickRateHz }` to the joiner, `PlayerState.ready` in schema, `SLOT_COLORS`/`SLOT_COLOR_CSS`/`SLOT_COLOR_NAMES` in `render/playerColors.ts` (blue, orange, green, purple). A freed slot is reused; when the host leaves, `nextHost` (lowest `joinedAtMs`, ties by join order) takes `hostSlot` and the room logs `host_changed`.
- **Browser check (Playwright, chromium, 844×390, `npm run dev`, separate contexts):** host "Ana" creates (code ZWZN) → row "Ana Host You Not ready", Start disabled with "Waiting for everyone to be Ready" (dev: alone is allowed, so no "Need at least 2"). Friend opens `/j/zwzn` → code prefilled "ZWZN", name focused, types "Bo" + Enter → lobby, URL kept. Both see both rows with names, Host/You and Ready state; dots are rgb(61,139,255)/(255,138,31)/(52,199,89)/(176,92,255); the friend has no Start button. Host Ready → friend sees "Ana Host Ready"; Start still disabled until the friend is Ready, then enabled; friend back to Not ready disables it again. Two more join (Cy, Di) → 4 rows, Start disabled (new players not Ready). 5th → "This game is full". Typed "zzzz" → field "ZZZZ" → "Game not found"; `/j/abio` → "Game not found" (no request); typing "a1b o-cd9e" leaves "ABCD". Cy and Di leave (their URL back to `/`), host starts → both show "Starting…"; a join now → "This game has already started". Dev: a lone host can Ready + Start → "Starting…", Leave → start screen. Practice solo → `Game` + `Hud` active; `/?solo&loadout=pistol,smg` → straight into `Game`. No page errors (only the browser's own console line for the 522 HTTP responses). Server log: `player_joined`/`player_left`/`run_started`/`host_changed`/`room_disposed` with `roomId`. Servers stopped afterwards.
- **Tests:** 378 passing (375 in `npm test` + the 3 release-cheat checks with `REQUIRE_DIST=1` after `npm run build`), 57 files. 42 new: shared `messages` +3, `lobbyRules` 2; server `run/lobby` 5, `RunRoom` integration +15 (4 slots + `run.joined`, 5th → 522 locked, ZZZZ → 522 not found, freed slot reused, host hand-over to longest-connected, Ready per sender, start refused when not Ready then accepted, non-host refused, solo refused without `allowSoloStart` then accepted, Ready/start ignored after start, join after start → `run_started`, same token → `already_joined`, no token/hash in state or logs, `allowSoloStart` only from the server, malformed token → `invalid_options`); client `guestToken` 6, `route` 3, `lobbyStore` +6 (`lobbyView` rows/host/hints, store with a fake room: one snapshot per patch, `run.joined`, `phase` callback, send, leave, first-state wait, lost connection), `codeInput` 1, `playerColors` 1, `joinErrors` +1 assertion. The `RunRoom` file ran 5 times in a row without a flake (~1.5 s). `npm run typecheck`, `npm run lint`, `npm run build` pass.
- **Deviations / decisions:**
  - Start rule helper: `startBlocker(...)` returns the reason (`not_host`/`too_few`/`not_ready`) and `canStart` wraps it, so the client hint and the server log reason come from the same function. With 1 player and no solo start the reason is `too_few` ("Need at least 2 players") even if they are not Ready.
  - The lobby subscribes with `Callbacks.get(room)` (`onAdd`/`onRemove` players, `listen` ready/name, `hostSlot`, `phase`) via `connection.watchLobby`, coalesced to one plain snapshot per microtask (2.1 used `onStateChange`, which in 2.4 would fire 20×/s).
  - `startOnline` is handled by `BootScene` (the scene that will call `scene.start("Game", { mode: "online", session })` in 2.4) and shows the new `UiScreen` `{ kind: "starting" }`; the placeholder also has Leave so nobody is stuck before 2.4. `BootScene.ts` and `App.tsx` are not in the story's file list.
  - Leave uses `history.replaceState(null, "", import.meta.env.BASE_URL)` instead of `"/"`: identical on the VPS, and it keeps the GitHub Pages build (`BASE_PATH=/topdown-shooter/`) on its own path.
  - Extra `JoinRefusal` text: `already_joined` → "You're already in this game" (the same device in a second tab).
  - `filterCodeInput` lives in `ui/codeInput.ts` (Vitest only collects `*.test.ts`, not `.tsx`).
  - `bootTestServer(roomOptions = { allowSoloStart: true })`; tests flip `room.allowSoloStart` on a live room for the strict case.
  - Leaving during `wave` also removes the member and hands over the host (harmless until 2.4; Epic 8 owns mid-run host migration).
  - `PlayerState.ready` uses `t.boolean().default(false)`.
- **For Story 2.4:**
  - Hook the `RunController` in `RunRoom.onStart` right where `this.state.phase = "wave"` is set; build `players` from `this.members` (`{ playerId, slot }`, join order). Extend the `run_started` log with `runSeed` (it already has `roomId` from the room logger and `players` count).
  - `Member` (`apps/server/src/run/lobby.ts`) is the server-only record; add `rttMs` there.
  - `onLeave` already removes the member and its `PlayerState`; add `controller.removePlayer(playerId)` there.
  - Client: replace `BootScene.startOnline()` (currently `uiStore.set({ kind: "starting" })`) with `this.scene.start("Game", { mode: "online", session })`; the `"starting"` `UiScreen` and `StartingScreen` in `LobbyScreen.tsx` can then go. `lobbyStore.current()` is the SDK room and `lobbyStore.joinedInfo()` the `run.joined` payload (`playerId`, `slot`, `tickRateHz`) for `NetSession`. `lobbyStore.attach` registers a `run.joined` handler right after the join resolves; `run.joined` has arrived long before the start, so `NetSession` should take it from `lobbyStore.joinedInfo()` rather than wait for the message (SDK `onMessage` allows several handlers per type, but a late one misses it).
  - The lobby screen hides on `kind: "starting"`/`"playing"`; Story 2.8's return to lobby can reuse `onPhase` in `main.ts` (`phase === "lobby"` → `uiStore.set({ kind: "lobby", code })`).
  - For Story 2.9: `SLOT_COLORS` in `apps/client/src/render/playerColors.ts`; `MAX_PLAYERS` is exported from shared.

### File List

- `packages/shared/src/net/messages.ts` (modified)
- `packages/shared/src/net/messages.test.ts` (modified)
- `packages/shared/src/net/lobbyRules.ts` (new)
- `packages/shared/src/net/lobbyRules.test.ts` (new)
- `packages/shared/src/net/stateView.ts` (modified)
- `packages/shared/src/index.ts` (modified)
- `apps/server/src/run/lobby.ts` (new)
- `apps/server/src/run/lobby.test.ts` (new)
- `apps/server/src/rooms/RunRoom.ts` (modified)
- `apps/server/src/rooms/RunRoom.test.ts` (modified)
- `apps/server/src/rooms/schema/RunState.ts` (modified)
- `apps/server/src/app.ts` (modified)
- `apps/server/src/index.ts` (modified)
- `apps/server/src/test/bootTestServer.ts` (modified)
- `apps/client/src/main.ts` (modified)
- `apps/client/src/net/connection.ts` (modified)
- `apps/client/src/net/guestToken.ts` (new)
- `apps/client/src/net/guestToken.test.ts` (new)
- `apps/client/src/net/route.ts` (new)
- `apps/client/src/net/route.test.ts` (new)
- `apps/client/src/net/joinErrors.ts` (modified)
- `apps/client/src/net/joinErrors.test.ts` (modified)
- `apps/client/src/net/lobbyStore.ts` (modified)
- `apps/client/src/net/lobbyStore.test.ts` (modified)
- `apps/client/src/render/playerColors.ts` (new)
- `apps/client/src/render/playerColors.test.ts` (new)
- `apps/client/src/ui/StartScreen.tsx` (modified)
- `apps/client/src/ui/LobbyScreen.tsx` (modified)
- `apps/client/src/ui/codeInput.ts` (new)
- `apps/client/src/ui/codeInput.test.ts` (new)
- `apps/client/src/ui/uiState.ts` (modified)
- `apps/client/src/ui/App.tsx` (modified)
- `apps/client/src/ui/overlay.css` (modified)
- `apps/client/src/scenes/BootScene.ts` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-11-21: Story 2.3 implemented: join by share link `/j/<code>` or typed code, guest token (localStorage, SHA-256 on the server, never in state or logs), slots p0–p3 with blue/orange/green/purple, host hand-over to the longest-connected player, `lobby.set_ready` and host-only `run.start` with the shared `canStart` rule (dev may start alone), "This game is full" / "Game not found" / "already started" refusals, lobby rows with color, Host, You and Ready, and a "Starting…" placeholder until Story 2.4. 378 tests passing.
