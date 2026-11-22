# Story 2.11: In-run menu

Status: ready-for-dev

## Story

As a player,
I want a menu during the run to leave the game,
so that I can quit cleanly without closing the browser.


> **Designer decisions (2026-11-21):** Docker is installed on the VPS (use Docker Compose; the systemd fallback is not needed). HTTPS/WSS stays on the Cloudflare Tunnel's edge certificates; Caddy is plain HTTP on 127.0.0.1:8080 behind it. The downed countdown pauses during a revive (Story 2.8). The in-run menu pauses solo practice; online it keeps running (Story 2.11).

## Acceptance Criteria

1. **Menu.** During a run, when I tap the ☰ button (top corner, inside the safe area; Esc on desktop), an in-run menu opens over the game with **Resume** and **Leave game**. The run keeps going: online games don't pause. Epic 8 adds **Save and quit** (host only) and Epic 10 adds **Settings** to this menu.
2. **Leave.** When I tap **Leave game** and confirm, I return to the start screen and my teammates see "<name> left". The run goes on without me, with no reconnect window for a deliberate leave.

## Tasks / Subtasks

- [ ] **Task 1: Menu button** (AC 1)
  - [ ] Register a `menu` button with the `HudButtons` registry (Story 1.8). A touch that starts on it never spawns a stick (button-first routing).
  - [ ] Size and place: 48 × 48 CSS px × dpr, at the **top-right** corner, inset by the safe area (`safeArea()` from 1.8) + 12 px. The icon is three white bars.
  - [ ] The 1.11 performance overlay currently sits at the top right: move it so it starts below the button, and keep both readable.
  - [ ] Shown only while a run is on screen (solo or online), hidden on Results.
- [ ] **Task 2: Esc key** (AC 1): add `Escape` to the Story 1.10 key-map table to toggle the menu. While the menu is open, Esc closes it (Resume). Esc must never reach the game as an input.
- [ ] **Task 3: Menu screen** (AC 1)
  - [ ] `apps/client/src/ui/InRunMenu.tsx`, a Preact overlay with `pointer-events: auto` while open and a semi-transparent backdrop.
  - [ ] Items come from an array, `MENU_ITEMS: { id; label; visible(ctx) }[]`, so Save and quit (8.5, host only) and Settings (10.1) slot in without restructuring.
  - [ ] Epic 2 items: **Resume**, **Leave game**. Buttons ≥ 44 × 44 px, text ≥ 14 px.
  - [ ] `uiState`: a menu-open flag next to the `playing` screen (`{ kind: "playing"; menu: "closed" | "open" | "confirmLeave" }`), so the HUD and game keep rendering underneath.
- [ ] **Task 4: The run keeps going** (AC 1)
  - [ ] **Online:** the host keeps stepping and sending. While the menu is open, the local input is neutral: GameScene sends `NEUTRAL_INPUT` values with a fresh seq each step, and `TouchSticks.reset()` runs on open. My survivor stands still and stops firing; the zombies keep coming. That is what "online games don't pause" means: say so in the menu ("The game keeps running").
  - [ ] **Solo:** pause the local host while the menu is open (`LocalSimHost.update` skips stepping and resets its accumulator). Nobody else is affected. This is a choice made here: record it.
- [ ] **Task 5: Leave flow** (AC 2)
  - [ ] **Leave game** opens a confirm step: "Leave the game? Your team keeps playing." with **Leave** and **Cancel**.
  - [ ] On **Leave**:
    - `session.leave()` calls `room.leave(true)` (consented);
    - dispose the `NetSimHost`;
    - `scene.stop("Game")` (which also stops Hud);
    - `history.replaceState(null, "", "/")`;
    - `uiStore.set({ kind: "start" })`.
  - [ ] Solo: the same without the room.
  - [ ] Guard double taps: leave runs once.
- [ ] **Task 6: Server side** (AC 2)
  - [ ] In `RunRoom.onLeave(client, code)` during a run: remove the player (2.4 already does) and broadcast `S2C.PLAYER_LEFT` `{ playerId, name, reason }`:
    - `reason: "left"` when `code === CloseCode.CONSENTED` (4000);
    - `"disconnected"` otherwise.
  - [ ] Also broadcast it in the lobby, so the lobby list and the toast agree.
  - [ ] If the leaver was host, `hostSlot` moves to the longest-connected member (2.3 `nextHost`).
  - [ ] If the room becomes empty, it disposes itself.
  - [ ] Log `info` `player_left` with `{ roomId, playerId, reason, wave }`.
- [ ] **Task 7: Teammates see it** (AC 2)
  - [ ] On `player.left`, show a short toast for 3 s: "<name> left" or "<name> lost connection". Draw it as a HUD banner line under the wave text, using the existing banner style without replacing a wave banner (queue them).
  - [ ] Their ring, name and arrow disappear with the player (2.4 removes the mirror player; 2.9 views follow).
- [ ] **Task 8: Tests**
  - [ ] Unit:
    - the menu state machine in `uiState` (open, confirm, cancel, resume; leave only from confirm);
    - `MENU_ITEMS` visibility (Epic 2: always both);
    - `LocalSimHost` doesn't step while paused, and doesn't burst-step after resume (the accumulator is reset);
    - the neutral input while the menu is open still increments seq.
  - [ ] Integration (`RunRoom.test.ts`):
    - two players in a run; p1 calls `leave(true)`; p0 receives `player.left` with `reason: "left"` and p1's name;
    - the state no longer has p1;
    - the room keeps ticking (`state.tick` grows);
    - forcibly closing p1's socket instead gives `reason: "disconnected"`;
    - the host leaving moves `hostSlot`.

## Dev Notes

### Scope and prerequisites

- Needs 1.8 (`HudButtons`, `safeArea()`, `ui/sizes.ts`), 1.10 (key map), 1.11 (overlay position), 2.4 (`NetSession`, removal on leave, `NetSimHost.dispose`), 2.8 (Results; the menu is hidden there) and 2.9 (views keyed by player).
- Out of scope:
  - Save and quit (8.5), Settings (10.1) and reconnect (8.1);
  - "are you sure" when the host leaves the lobby (2.1 already has Leave there).

### From the 2.4 review (2026-11-22)

- `leaveRoom` in `main.ts` isn't tied to one room: a stale `NetSession.leave()` that runs after the player joined a new room would leave the new one. Bind it to the session's room when you touch leave.
- `RunInbox` (`net/session.ts`) re-buffers fight batches after the NetSimHost unsubscribes; if a run can restart in the same room, clear it at the new start.

### Colyseus facts (verified on 0.18 with a probe)

- `room.leave(true)` closes with code 4000 (`CloseCode.CONSENTED`). The server calls `onLeave(client, 4000)` and **not** `onDrop`.
- A connection that drops (socket closed, network lost) calls `onDrop` first if it is defined, then `onLeave`. Epic 2 defines no `onDrop`, so every leave goes to `onLeave`. The close code tells them apart.
- **Note for Story 8.1:** reconnect will add `onDrop` with `allowReconnection(client, 120)`. A consented leave never reaches `onDrop`, so "no reconnect window for a deliberate leave" stays true automatically. Keep this note in the code comment of `onLeave`.

### UX notes

- The menu sits over the live game. Keep the backdrop light (alpha about 0.5) so the player can see the danger they're in.
- On phones, the ☰ must not be easy to hit by accident with the aim thumb. The top-right corner is away from the thumb zones (sticks are in the lower halves), and 12 px inside the safe area keeps it clear of the notch.
- Leaving shows the start screen with the name still filled in (2.1 stores it).

### Project Structure Notes

- New: `apps/client/src/ui/InRunMenu.tsx`, `apps/client/src/ui/menuItems.ts` + test
- Modified:
  - `apps/client/src/{ui/uiState.ts, ui/App.tsx, ui/overlay.css, scenes/HudScene.ts, scenes/GameScene.ts, input/KeyboardMouse.ts (Esc), input/HudButtons.ts (menu), sim/LocalSimHost.ts (pause), net/session.ts (leave), debug/PerfOverlay.ts (position)}`
  - `apps/server/src/rooms/RunRoom.ts` (+ test)
  - `packages/shared/src/net/messages.ts` (the `PlayerLeft` payload type, `reason: "left" | "disconnected"`)

### References

- [Source: epics.md#Story 2.11: In-run menu] (readiness fix: new story)
- [Source: implementation-readiness-report-2026-11-21.md#Resolutions] (in-run menu added)
- [Source: game-architecture.md#Run Room Rules] (host reassigned to the longest-connected player), [#Client Platform Budgets] (Preact overlay `pointer-events: none` except active screens; safe areas)
- [Source: 1-8-two-weapon-slots-smg-and-hunting-rifle.md#Buttons and touch routing]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
