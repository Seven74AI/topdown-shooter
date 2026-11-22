# Story 2.11: In-run menu

Status: done

## Story

As a player,
I want a menu during the run to leave the game,
so that I can quit cleanly without closing the browser.


> **Designer decisions (2026-11-21):** Docker is installed on the VPS (use Docker Compose; the systemd fallback is not needed). HTTPS/WSS stays on the Cloudflare Tunnel's edge certificates; Caddy is plain HTTP on 127.0.0.1:8080 behind it. The downed countdown pauses during a revive (Story 2.8). The in-run menu pauses solo practice; online it keeps running (Story 2.11).

## Acceptance Criteria

1. **Menu.** During a run, when I tap the ☰ button (top corner, inside the safe area; Esc on desktop), an in-run menu opens over the game with **Resume** and **Leave game**. The run keeps going: online games don't pause. Epic 8 adds **Save and quit** (host only) and Epic 10 adds **Settings** to this menu.
2. **Leave.** When I tap **Leave game** and confirm, I return to the start screen and my teammates see "<name> left". The run goes on without me, with no reconnect window for a deliberate leave.

## Tasks / Subtasks

- [x] **Task 1: Menu button** (AC 1)
  - [x] Register a `menu` button with the `HudButtons` registry (Story 1.8). A touch that starts on it never spawns a stick (button-first routing).
  - [x] Size and place: 48 × 48 CSS px × dpr, at the **top-right** corner, inset by the safe area (`safeArea()` from 1.8) + 12 px. The icon is three white bars.
  - [x] The 1.11 performance overlay currently sits at the top right: move it so it starts below the button, and keep both readable.
  - [x] Shown only while a run is on screen (solo or online), hidden on Results.
- [x] **Task 2: Esc key** (AC 1): add `Escape` to the Story 1.10 key-map table to toggle the menu. While the menu is open, Esc closes it (Resume). Esc must never reach the game as an input.
- [x] **Task 3: Menu screen** (AC 1)
  - [x] `apps/client/src/ui/InRunMenu.tsx`, a Preact overlay with `pointer-events: auto` while open and a semi-transparent backdrop.
  - [x] Items come from an array, `MENU_ITEMS: { id; label; visible(ctx) }[]`, so Save and quit (8.5, host only) and Settings (10.1) slot in without restructuring.
  - [x] Epic 2 items: **Resume**, **Leave game**. Buttons ≥ 44 × 44 px, text ≥ 14 px.
  - [x] `uiState`: a menu-open flag next to the `playing` screen (`{ kind: "playing"; menu: "closed" | "open" | "confirmLeave" }`), so the HUD and game keep rendering underneath.
- [x] **Task 4: The run keeps going** (AC 1)
  - [x] **Online:** the host keeps stepping and sending. While the menu is open, the local input is neutral: GameScene sends `NEUTRAL_INPUT` values with a fresh seq each step, and `TouchSticks.reset()` runs on open. My survivor stands still and stops firing; the zombies keep coming. That is what "online games don't pause" means: say so in the menu ("The game keeps running").
  - [x] **Solo:** pause the local host while the menu is open (`LocalSimHost.update` skips stepping and resets its accumulator). Nobody else is affected. This is a choice made here: record it.
- [x] **Task 5: Leave flow** (AC 2)
  - [x] **Leave game** opens a confirm step: "Leave the game? Your team keeps playing." with **Leave** and **Cancel**.
  - [x] On **Leave**:
    - `session.leave()` calls `room.leave(true)` (consented);
    - dispose the `NetSimHost`;
    - `scene.stop("Game")` (which also stops Hud);
    - `history.replaceState(null, "", "/")`;
    - `uiStore.set({ kind: "start" })`.
  - [x] Solo: the same without the room.
  - [x] Guard double taps: leave runs once.
- [x] **Task 6: Server side** (AC 2)
  - [x] In `RunRoom.onLeave(client, code)` during a run: remove the player (2.4 already does) and broadcast `S2C.PLAYER_LEFT` `{ playerId, name, reason }`:
    - `reason: "left"` when `code === CloseCode.CONSENTED` (4000);
    - `"disconnected"` otherwise.
  - [x] Also broadcast it in the lobby, so the lobby list and the toast agree.
  - [x] If the leaver was host, `hostSlot` moves to the longest-connected member (2.3 `nextHost`).
  - [x] If the room becomes empty, it disposes itself.
  - [x] Log `info` `player_left` with `{ roomId, playerId, reason, wave }`.
- [x] **Task 7: Teammates see it** (AC 2)
  - [x] On `player.left`, show a short toast for 3 s: "<name> left" or "<name> lost connection". Draw it as a HUD banner line under the wave text, using the existing banner style without replacing a wave banner (queue them).
  - [x] Their ring, name and arrow disappear with the player (2.4 removes the mirror player; 2.9 views follow).
- [x] **Task 8: Tests**
  - [x] Unit:
    - the menu state machine in `uiState` (open, confirm, cancel, resume; leave only from confirm);
    - `MENU_ITEMS` visibility (Epic 2: always both);
    - `LocalSimHost` doesn't step while paused, and doesn't burst-step after resume (the accumulator is reset);
    - the neutral input while the menu is open still increments seq.
  - [x] Integration (`RunRoom.test.ts`):
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

Claude Opus 5.5 (Claude Code), builder agent in worktree `story-2-11`.

### Debug Log References

- `npm run typecheck && npm run lint && npm test && npm run build`: all pass (101 test files, 714 tests passed, 3 skipped).
- Browser check (Python Playwright + Chromium; server on PORT=3867, Vite on 6373 with a temporary config adding the `/api` proxy, deleted afterwards): 37/37 checks passed. Screenshots in `/tmp/s211/` (01–14).

### Completion Notes List

- **Menu (AC 1).** ☰ is a `menu` button in the `HudButtons` registry (buttons-first routing, so a touch on it never spawns a stick; checked on a touch phone viewport). 48 × 48 CSS px, top-right, 12 px inside the safe area, three white bars on a dark rounded square (`HudScene.layoutMenuButton`, redrawn on layout only). Shown only while the screen is `playing` and the run is running (hidden in the dev loadout picker and on Results). The perf overlay now starts 8 px under ☰ (`PerfOverlay`, constants in `ui/sizes.ts`).
- **Esc.** `Escape: "menu"` in the key-map table; `KeyboardMouse.takeMenu()` gives one edge per press (auto-repeat adds none, kept through a blur). Esc never switches a touch player to mouse mode, is `preventDefault`ed and never reaches `PlayerInput`. Esc closes the menu from any open state, the confirm step included.
- **Menu screen.** `ui/InRunMenu.tsx` (Preact, `pointer-events: auto`, backdrop alpha 0.5) renders `MENU_ITEMS` (`ui/menuItems.ts`: `{ id, label, action, visible(ctx) }`, ctx = `{ online, isHost }`) so Save and quit (8.5) and Settings (10.1) slot in. Buttons are the existing `.btn` (≥ 48 px tall, 18 px text). The note says "The game keeps running" online and "Paused" solo.
- **State.** `UiScreen` `playing` is now `{ kind: "playing"; menu: "closed" | "open" | "confirmLeave"; online }`; the pure `menuStep(state, action)` is the state machine (`toggle`, `resume`, `leave`, `cancel`, `confirm` → `"left"` only from `confirmLeave`). Every input (☰, Esc, buttons) goes through `GameScene.onMenu` (the `menu` UI request), which ignores it when no run is on screen. Opening the menu calls `router.releaseAll()` (keys, mouse button, sticks) and the HUD drops held buttons, so nothing is still pressed on resume.
- **Online keeps running.** While the menu is open the Game scene passes `neutralizeInput(input)` (no move, fire, swap, consumable; aim kept) to the host, which still stamps a fresh seq on every step, so the server keeps getting one input per tick. Checked in the browser: both pages' ticks advance with the menu open.
- **Solo pauses** (designer decision 2026-11-21). `LocalSimHost.paused`: `update` steps nothing and does not add frame time. The accumulator is **frozen** rather than reset: no catch-up burst on resume (unit test + browser: steps after resume match real time at 20 Hz) and `alpha` stays put, so the drawn positions don't snap on pause or resume. Checked in the browser: zombie positions and tick identical after 1.5 s in the menu.
- **Leave (AC 2).** Leave game → confirm ("Leave the game? Your team keeps playing.", solo "Leave the game?") → Leave runs `GameScene.leaveGame` once (`leaving` guard; double click checked): the host's dispose → `NetSession.leave()` → the lobby store's `room.leave(true)` (consented, close 4000) and the URL back to BASE_URL; then the start screen and `Boot` with `{ start: true }` (no title, only the start handlers). Solo: the same without the room. Leaving keeps the name filled in (2.1 stores it).
- **2.4 review items.** `leaveRoom` in `main.ts` is bound to the session's room (`lobbyStore.leave(room)` leaves only if that room is still current, unit-tested), and clears `activeRun`. RunInbox re-buffering: 2.8 already drops buffered batches when the room returns to the lobby (`RunInbox.reset()`); a mid-run leave closes the inbox. Clearing it again at the new start would drop tick 1's events that can arrive before the start patch, so nothing more was added.
- **Server.** `RunRoom.onLeave` broadcasts `S2C.PLAYER_LEFT` `{ playerId, name, reason }` (`"left"` for `CloseCode.CONSENTED`, else `"disconnected"`), in the lobby too. It logs `player_left` with `{ roomId, playerId, reason, code, wave }`, hands the host to the longest-connected member, and the room auto-disposes when empty. The Story 8.1 note about `onDrop` / `allowReconnection` is in the `onLeave` comment. `PlayerLeft` / `PlayerLeftReason` are in `packages/shared/src/net/messages.ts`.
- **Interaction with 2.8/2.9.** The leaver is removed from the World at once. If they were the last one standing with the rest downed, the next tick's wipe check ends the run (integration test: phase `results`, `team.wiped` forwarded). A downed leaver's countdown goes with them, and a reviver who leaves stops the revive on the next tick (the revive search runs every tick). The client mirror drops the player with their state entry, so their ring (player view), name and arrow disappear. Checked in the browser for a guest leaving and for the host leaving.
- **Toast.** `RunInbox` listens for `player.left` from the join (well-formed messages only) and hands them to the Game scene's sink. The `ToastQueue` (`scenes/toastQueue.ts`) shows "<name> left" / "<name> lost connection" for 3 s each, queued, on its own HUD line under the status line, so it never replaces a wave banner.
- **Dev ⚙ moved.** The dev cheats ⚙ (dev builds only) now sits left of ☰ at the top. Below the moved perf overlay it overlapped it.

**Deviations**
- `scene.stop("Game")` became `scene.start("Boot", { start: true })` (which stops Game, and Game stops Hud). With a bare stop, nothing would register the start screen's Practice solo / Join handlers.
- Solo pause freezes the accumulator instead of resetting it. This meets the goal (no burst on resume) without a one-tick visual snap.
- The integration tests are in a new `RunRoom.leave.test.ts` (like `RunRoom.downed.test.ts` / `.fight.test.ts`) instead of `RunRoom.test.ts`, to keep merges with parallel stories clean.
- `playing` carries `online` too (the menu's note and item context).

**Not verified**
- Real phones (notch / safe-area insets, real thumbs near ☰). Only a Chromium mobile viewport with touch emulation was checked.
- "disconnected" was checked by killing the socket on the server side in the integration test, not by a real network loss in the browser.
- In the browser, the team-wipe-by-leave case was checked only by the integration test, not visually.

### File List

- New: `apps/client/src/ui/InRunMenu.tsx`, `apps/client/src/ui/menuItems.ts`, `apps/client/src/ui/menuItems.test.ts`, `apps/client/src/input/menuInput.ts`, `apps/client/src/input/menuInput.test.ts`, `apps/client/src/scenes/toastQueue.ts`, `apps/client/src/scenes/toastQueue.test.ts`, `apps/server/src/rooms/RunRoom.leave.test.ts`
- Modified: `apps/client/src/{main.ts, ui/uiState.ts, ui/uiState.test.ts, ui/App.tsx, ui/overlay.css, ui/sizes.ts, scenes/GameScene.ts, scenes/HudScene.ts, scenes/hudModel.ts, scenes/BootScene.ts, input/keyMap.ts, input/KeyboardMouse.ts, input/InputRouter.ts, input/keyVector.test.ts, input/selectSource.test.ts, sim/LocalSimHost.ts, sim/LocalSimHost.test.ts, net/session.ts, net/session.test.ts, net/lobbyStore.ts, net/lobbyStore.test.ts, debug/PerfOverlay.ts, debug/DevCheats.css}`, `apps/server/src/rooms/RunRoom.ts`, `packages/shared/src/net/messages.ts`, `packages/shared/src/index.ts`, `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Senior Developer Review (AI)

- **Date:** 2026-11-22 · **Reviewer:** independent review agent (fresh context; full suite, touched tests 5×, browser: solo pause/resume, two pages with guest and host leaving, `?lag`, hidden-tab cases, 844×390 touch viewport). **Outcome:** solo pause, online neutral inputs (0 corrections, no phantom shots), the Leave flow, `player.left` and the hidden-tab guards confirmed. One medium finding, fixed.
- [x] [Med] Under `?lag` the lobby screen stayed over the running game (the Game scene read the throttled state, still "lobby"): no menu, no shots, and the lobby's Leave left the room with the Game scene still running. Fix: the scene shows "playing" unless the phase is `results` (the phase handler only starts it on a real `wave`); `leaveLobby` also requests `leaveRun` as a safety net. Verified in the browser under `?lag=150&jitter=20`: shots fire, Esc opens the menu.
- [x] [Low] The solo pause froze the sim but not what is drawn on wall time: tweens in both scenes are paused (blood fade, muzzle, puffs), the camera shake reset, and the wave banner's clock shifted by the paused time. ☰ is hidden under `?stress` (a pause would skew the benchmark).
- [x] [Low] Dev ⚙ cheats sat above the menu: now under it (z-index 5).
- [x] [Low] A swap/consumable latched in the same step as opening the menu still went out: `SimHost.clearEdges()` on open. Test.
- Noted: the zombie hit flash still uses scene time during a pause (a 1-frame tint); ☰ under the backdrop can't close the menu (Resume and Esc do).

## Change Log

- 2026-11-22: Review fixes (lag screen, presentation pause, cheats under the menu, clearEdges). Story done.

- 2026-11-22: Story 2.11 implemented: in-run menu (☰ + Esc, Resume / Leave game with a confirm step). Solo pauses with the accumulator frozen; online keeps running with neutral inputs. The server sends `player.left` (left / disconnected) and hands over the host; teammates get a toast. The leave is bound to the session's room. Status → review.
