# Story 2.3: Join by link, get ready, start

Status: ready-for-dev

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

- [ ] **Task 1: Shared contract** (AC 1, 2, 4)
  - [ ] `net/messages.ts` (from 2.1):
    - `joinOptionsSchema` gets `guestToken: z.string().regex(/^[0-9a-f]{32}$/)`;
    - add `lobbySetReadySchema = z.object({ ready: z.boolean() }).strict()` and `runStartSchema = z.object({}).strict()`;
    - `JoinRefusal` gets `"already_joined"`;
    - add `MIN_PLAYERS_TO_START = 2` and `MAX_PLAYERS = 4`.
  - [ ] `RunJoined` payload type: `{ playerId: string; slot: number; tickRateHz: number }`.
  - [ ] Tests for the new schemas.
- [ ] **Task 2: Schema fields** (AC 1, 5): `PlayerState` gets `ready: t.boolean()`. `RunState` already has `hostSlot`. Update `shared/net/stateView.ts` to match.
- [ ] **Task 3: Slots, host and identity (server)** (AC 2, 5). Add `apps/server/src/run/lobby.ts`, pure and unit-tested (see Dev Notes › Lobby rules):
  - `assignSlot(taken)` returns the lowest free slot 0–3, or -1;
  - `nextHost(members)` returns the longest-connected member;
  - `hashGuestToken(token)` returns hex SHA-256 (`node:crypto`).
- [ ] **Task 4: RunRoom joins** (AC 1–3, 5)
  - [ ] `onJoin`: if `state.phase !== "lobby"`, throw `new ServerError(526, "run_started")`. Story 8.2 opens Build-phase joins.
  - [ ] Hash the token. If a member with that hash is already in the room, throw `already_joined`.
  - [ ] Assign the slot and set `playerId = "p" + slot`.
  - [ ] Store the server-only record `{ playerId, slot, sessionId, name, guestTokenHash, joinedAtMs }` in a `Map<sessionId, Member>`, never in schema.
  - [ ] Add the `PlayerState` to schema, then `client.send(S2C.RUN_JOINED, { playerId, slot, tickRateHz: TICK_RATE_HZ })`.
  - [ ] Log `player_joined` with `playerId` and `slot`. Never log the token or its hash.
- [ ] **Task 5: Ready and start (server)** (AC 4)
  - [ ] `C2S.LOBBY_SET_READY` (guarded, lobby only) sets the sender's `ready`.
  - [ ] `C2S.RUN_START` (guarded) is accepted only when all of these hold:
    - the phase is lobby;
    - the sender's slot is `hostSlot`;
    - every member is ready;
    - there are at least `MIN_PLAYERS_TO_START` members, or 1 if `allowSoloStart`.
  - [ ] A refused start is logged at `info` as `run_start_refused` with a reason. Nothing is sent back: the button is disabled on the client anyway.
  - [ ] An accepted start sets `state.phase = "wave"` and logs `run_started`. Story 2.4 hooks the `RunController` into this exact transition. Until then the room stays in `wave` with nothing simulated.
  - [ ] `allowSoloStart = process.env.NODE_ENV !== "production"` (the Docker image sets production in 2.2). Pass it into `createGameServer({ allowSoloStart })` so tests can choose.
- [ ] **Task 6: Leave in the lobby** (AC 1, 5): `onLeave` removes the member and its `PlayerState`, which frees the slot. If the host left, `hostSlot = nextHost(...).slot`.
- [ ] **Task 7: Guest token (client)** (AC 2): `apps/client/src/net/guestToken.ts`, see Dev Notes › Guest token.
- [ ] **Task 8: Join by code or link (client)** (AC 1, 3)
  - [ ] `connection.ts` gets `joinGame(code, name)`, which calls `client.joinById(normalizeRoomCode(code), { intent: "join", name, balanceVersion, guestToken })` and returns a `Result` with the same error mapping (`joinErrorText`).
  - [ ] `createGame` also sends the guest token.
  - [ ] Add `apps/client/src/net/route.ts`: `parseJoinPath(pathname)` returns the code for `/j/<code>` (case-insensitive, optional trailing slash), else null. Unit-tested.
  - [ ] `main.ts`: on a join path, the start screen opens with the code prefilled and the name field focused.
  - [ ] After joining, keep the URL. On leave, `history.replaceState(null, "", "/")`.
- [ ] **Task 9: Start screen and lobby (client)** (AC 1, 4, 5)
  - [ ] Start screen: name field, **Create game**, a 4-letter code field (auto-uppercase, `maxlength=4`, `autocapitalize="characters"`, only alphabet letters accepted) with **Join**, and **Practice solo**.
  - [ ] Lobby: a list of 4 rows in slot order. Each row shows a color dot, the name, "Ready" or "Not ready", "Host" for `hostSlot`, and "You" for the local player. Below the list:
    - **Ready** / **Not ready**, a toggle that sends `lobby.set_ready`;
    - **Start**, host only: enabled per AC 4 with the same rule as the server; otherwise show the reason ("Waiting for everyone to be Ready", "Need at least 2 players");
    - **Leave**.
  - [ ] Colors: see Dev Notes › Colors.
- [ ] **Task 10: Start transition (client)** (AC 4): when `room.state.phase` becomes `"wave"`, call `uiStore.request("startOnline")`. Until Story 2.4 adds the networked host, that shows a full-screen "Starting…" placeholder. Story 2.4 replaces it with `scene.start("Game", { mode: "online", session })`.
- [ ] **Task 11: Tests**
  - [ ] Unit: `lobby.ts`, `route.ts`, `guestToken.ts` (storage throws → in-memory token, same value within the page; stored token reused; invalid stored value regenerated), and the start-rule helper `canStart(players, isHost, allowSolo)` in `packages/shared/src/net/lobbyRules.ts`, shared by client and server.
  - [ ] Integration (`RunRoom.test.ts`, `bootTestServer` from 2.1):
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

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
