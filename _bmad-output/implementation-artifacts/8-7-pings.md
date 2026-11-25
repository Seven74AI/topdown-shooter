---
baseline_commit: 0ee0d6db
---

# Story 8.7: Pings

Status: ready-for-dev

<!-- Story file 2026-11-25 (gds-create-story, autonomous) from the real code on master 0ee0d6db. Kept separate (docs/story-merges-2026-11-25.md: "small, parallel"). Epic 8 D15 is the RULE (accepted 2026-11-24). New decisions: docs/epic-8-story-decisions.md (codes P…), "recommended, to accept". -->

## Story

As a player,
I want to send a quick message with a marker,
so that we can coordinate without voice chat.

> **BRIEF**: paste `docs/epic-7-brief.md` verbatim (Epic 7 is landing at the same time; its Epic 6 + Network pass lines still bind), plus this file, `docs/ideas/epic-8/decisions.md` and `docs/epic-8-story-decisions.md`. Most relevant: 3/4, 7 (client timing in frame ms, no per-frame allocation), 8 (bandwidth), 11 (`this.net.guard`; the per-client guard), 13 (the ONE HUD layout test), 15 [NP 18] (the server stamps where and who), R2 (wiring tests), **R3 (measurable placement rule: the edge arrow)**, R9, R11 (the top band goes through `hudTopLayout.ts`). Epic 6 brief 24 (pings are always above the darkness).

## Acceptance Criteria

### Fairness / player-visible rules (brief 3; each is a test)

- **P1 "A ping is where I am, not where I say."** The server stamps every ping with the sender's **server** position at the tick it arrives (the client sends only the kind), so a modified client can't place pings across the map (D15 "pinned where you sent it (your position)", brief 15).
- **P2 "One voice per player."** At most **1 ping per second** per player (server-enforced; extra pings are dropped silently and counted), and one live ping per player: a new one replaces the old one on every screen (D15).
- **P3 "Everyone sees it, even in the dark."** Every teammate (and the sender) sees the ping's icon in the sender's slot colour for **4 s**, with an edge arrow when it is off screen and a short sound; pings draw above the blackout darkness (`ABOVE_DARK.ping` 11.77) and are not hidden by fog (Epic 6 brief 24, D15).
- **P4 "Downed can call for help."** Downed players can ping; out players (spectating), held seats and 8.2's waiting joiners can't (decision E8-P4). Pings work in build phases, waves and the vote; never in the lobby or on Results.
- **P5 "Pings change nothing in the fight."** Pings are never World state: no `snapshotWorld` change, no replay change, no save (8.4); zombies don't hear them (decision E8-P6).
- **P6 "The button never gets in the way."** The ping button and its wheel never overlap another control in the ONE HUD layout test (568×320, 640×360, plus the 800×360 / 844×390 sweeps); the button is hidden while I hold a building (`placementActive`) and while reconnecting (D15, Q14).

### Behaviour (numbers are tests)

1. **The four pings** (FR76, D15). `PING_KINDS = ["help", "here", "big", "ready"]` in `packages/shared/src/net/messages.ts` with labels **Help! · Over here · Big one! · Ready** ("Big one!" covers the Brute and the Behemoth). Code-drawn icons (decision E8-P2): Help! = a white cross on a slot-colour disc, Over here = a downward pin, Big one! = a heavy "!!" in a triangle, Ready = a check — each with its word under it (11 px min); drawn through `addGeneratedTexture` (Android redraw, brief 12) into one small atlas; on the readability sheet as items **130–133** (decision E8-P2: auto-accepted, the designer can swap the glyphs later).
2. **Button.** A 48 CSS px round button with the ping glyph, top-right, **left of ☰** with the 12 px gap (`ui/sizes.ts`: `PING_BUTTON_CSS_PX = 48`), laid out in `scenes/hudTopLayout.ts` (`layoutPingButton`); `layoutWaveLine`'s right end moves to the ping button's left edge − `HUD_BAND_GAP_CSS_PX` (R11). Shown in modes `wave`, `build`, `vote` and while downed; hidden in `holding`, `reconnecting`, out/spectating, waiting (8.2), lobby, results.
3. **Wheel** (decision E8-P1). Tap the button → 4 chips (each ≥ 44 px, icon + word) fan out in a quarter circle down-left of the button (radius 76 CSS px, 15°–75° below the left horizontal), inside the safe area at every test size; tap a chip = send and close; tap the button again or anywhere else = close; it closes by itself after **3 s**. Movement and aim keep working while it is open (the wheel only takes taps that land on it). Desktop: **F** opens/closes it (`input/keyMap.ts`: `KeyF` → `"ping"`, already reserved in the comment), **1–4** pick while it is open (the build bar's digits are ignored while the wheel is open), Esc closes it (before the menu), a mouse click on a chip sends.
4. **Send.** `C2S.PING_SEND { kind }` (zod strict enum), registered with `this.net.guard(pingSendSchema, …, "ping")` — its **own** bucket in `MessageGuard` (`PING_PER_S = 1`, burst 1, `net/limits.ts`) so pings never eat the "other" 10/s bucket used by shop and build messages (decision E8-P5). Client cooldown: the button shows a 1 s ring after a send and ignores taps meanwhile (so honest players never hit the server drop).
5. **Server** `RunRoom.onPing`: sender is a member with a World player whose status is `alive` or `downed`, phase `build`/`wave`/`vote`, not frozen → `S2C.PING_SHOWN { slot, kind, x, y, tick }` broadcast to every client (x, y = the server position rounded to 0.1 m; `tick` = the server tick), logged at debug only. Dropped pings counted per player (`ping_dropped` in the 2.10 `net_stats` line). Pings are never added to the World or the event bus (P5).
6. **Client model** `render/pingModel.ts` (pure, preallocated: 4 slots): `show(slot, kind, x, y, nowMs)` replaces that slot's ping, `expire(nowMs)` after **4,000 ms** of frame clock; a ping arriving more than 4 s late (a hidden tab waking) is not shown. Drawn by `render/PingView.ts` in GameScene at `ABOVE_DARK.ping` (world-space icon with a short pop-in, 150 ms) and by HudScene as an edge arrow when off screen.
7. **Edge arrow** (R3). Off-screen pings use the 6.8 event-arrow placement (`render/eventArrow.ts` `placeEventArrow` with `waveControlRects` + the ping button as keep-off rects, one hold state per slot): bearing error ≤ **30°** (`EVENT_ARROW_MAX_BEARING_ERR_RAD`), never overlapping a control or another ping arrow (≥ 4 px apart, `PAIR_GAP_CSS_PX` style), no jump > 40 CSS px while the target moves < 0.5 m. Tested with a stateful sweep at 0.01° steps around the screen, oscillation across each side switch, and a resize (568×320 → 844×390) mid-ping. Arrow = slot-colour triangle + the kind icon at 24 px.
8. **Sound** (decision E8-P3). One short synth cue `ping` in `audio/placeholderSfx.ts` (`SfxName`), panned by the ping's screen x (−1…1), volume 0.8; "Help!" plays it twice (80 ms apart); the sender hears it too. Muted with the game's sound setting; no haptics.
9. **Bandwidth.** ≤ 4 pings/s per room × ~30 B = ≤ **120 B/s** per phone worst case (measure with the bot flag below; brief 8).
10. **Bots.** `npm run bots -- --ping-every 2` makes each bot ping (random kind from its own seeded stream) every 2 s; a liveness test checks pings were sent, shown on another bot, dropped at > 1/s, and that the World digest is identical with pings on and off (P5).

## Tasks / Subtasks

- [ ] **T1 Fairness tests first** (P1–P6): `apps/server/src/rooms/RunRoom.ping.test.ts` (server position, 1/s drop, out/held/waiting/lobby/results refused, broadcast to all), `apps/client/src/render/pingModel.test.ts`, `packages/shared/src/replay/` digest-with-pings test.
- [ ] **T2 Wire** (AC 1, 4, 5): `packages/shared/src/net/messages.ts` (`PING_KINDS`, `C2S.PING_SEND`, `S2C.PING_SHOWN`, `pingSendSchema`, `PingShown`), `apps/server/src/net/limits.ts` (`PING_PER_S`), `apps/server/src/net/messageGuard.ts` (bucket `"ping"`), `apps/server/src/rooms/RunRoom.ts` (`onMessage`, `onPing`).
- [ ] **T3 Client net** : `apps/client/src/net/session.ts` (`room.onMessage(S2C.PING_SHOWN, …)`), `apps/client/src/sim/NetSimHost.ts` (`sendPing(kind)`, nothing while disconnected), `fakeRoom`/devThrottle/bot copies (brief 2: messages pass the throttle with the same delay as other S2C messages).
- [ ] **T4 HUD** (AC 2, 3): `apps/client/src/scenes/hudTopLayout.ts` (`layoutPingButton`, wave line end), `ui/sizes.ts`, `scenes/hudModel.ts` (`pingButton`, `pingWheelOpen`, `pingPressed` latches), `scenes/pingWheel.ts` (new, pure layout + hit test), `scenes/HudScene.ts` (draw + taps), `scenes/GameScene.ts` (wiring only), `input/keyMap.ts` + `input/KeyboardMouse.ts` (`takePing`, `heldCount`), digits suspended while open.
- [ ] **T5 Draw** (AC 1, 6, 7): `render/pingModel.ts`, `render/PingView.ts` (icons via `addGeneratedTexture`, `aboveDarkness(obj, "ping")`), edge arrows in HudScene via `placeEventArrow`.
- [ ] **T6 Sound** (AC 8): `audio/placeholderSfx.ts`.
- [ ] **T7 Layout** (P6): `scenes/hudLayout.test.ts` (ping button + wheel chips in modes `wave`, `build`, `vote`; absent in `holding`, `reconnecting`), `scenes/hudTopLayout.test.ts` (widest wave line with the button), wheel-in-safe-area test at all four sizes with insets 44/21; wiring tests (R2) for the button, F key, and `PING_SHOWN` → view.
- [ ] **T8 Bots + readability** (AC 10): `tools/bots/botClient.ts` + flag; `docs/playtests/milestone-1/readability-sheet.md` items 130–133 (the four icons at 14 px over stage 1 dusk and stage 5 blackout).
- [ ] **T9 Gate** (R6); screenshots of the wheel open at 568×320 and 844×390 (stills only, designer: no videos) in `docs/art/epic-8/pings-*.png`.

## Dev Notes

### Current state (master 0ee0d6db; read before changing)

- **Top-right HUD:** only ☰ (`HudScene.layoutMenuButton`, `MENU_BUTTON_CSS_PX = 48`, `MENU_BUTTON_INSET_CSS_PX = 12`, `ui/sizes.ts`). No minimap exists. Wave line top-centre (`drawWave`, `hudTopLayout.ts` `layoutWaveLine` stops `HUD_BAND_GAP_CSS_PX = 6` before ☰); boss bar `scenes/BossHud.ts` / `bossBar.ts` at y 46 (`BOSS_BAR_TOP_CSS_PX`) with `BOSS_BAR_GAP_CSS_PX = 12` to ☰. HP/money/8.1 held chips top-left. The right side below holds swap and quick-use (`scenes/consumableButton.ts` `layoutRightButtons`), the build bar (`scenes/buildBar.ts`) and the hand cluster while holding (`scenes/handCluster.ts`).
- **The ONE HUD layout test** `scenes/hudLayout.test.ts`: `SIZES` 568×320 / 640×360, insets 44/0/21; modes `wave`, `build`, `holding`, `reconnecting`, `vote`, `selected`; its header already says "… 8.7 pings: add a rect to the mode it shows in"; `KNOWN_LIST` = the as-built baseline.
- **State the HUD reads:** `scenes/hudModel.ts` (`placementActive` = holding a building, `buildBar`, `menuButton`, `voting`, latches).
- **Arrows:** `render/edgeArrow.ts` (pure), teammate arrows `render/teammateMarkers.ts` (`MATE_ARROW_MARGIN = 40`), event arrows `render/eventArrow.ts` (`placeEventArrow`, `waveControlRects`, 30° max bearing error, hysteresis `EVENT_ARROW_JUMP_CSS_PX = 40`, `EVENT_ARROW_HOLD_RAD` 10°), pair placement `render/eventArrowPair.ts`.
- **Darkness:** `render/darkness/aboveDark.ts` — `DARKNESS_DEPTH = 11.7`, `ABOVE_DARK.ping = 11.77` **already reserved** ("Pings (Epic 8.7)"); `aboveDarkness(obj, slot)`.
- **Keys:** `input/keyMap.ts` binds by `KeyboardEvent.code`; `KeyF` is free and reserved in its comment for pings; digits 1–7 = build bar; Esc = menu.
- **Sound:** `audio/placeholderSfx.ts` — Web Audio synth, `playSfx(name, pan, volume)`; only UI cue today `ui_build_pick`.
- **Messages:** `C2S`/`S2C` + zod schemas in `packages/shared/src/net/messages.ts`; `RunRoom.onCreate` registers each with `this.net.guard(schema, handler, bucket?)`; buckets "input" 25/s, "ghost" 5/s, "other" 10/s (`net/limits.ts`). Relay model: `BUILDING_GHOSTED` (5.24) is a non-sim S2C relay — pings follow it, not netEvents.
- **Colours:** `render/playerColors.ts` `SLOT_COLORS` (blue, orange, green, purple). Epic 6 colour rule: red = boss danger only — no red in ping icons (Help! uses the slot colour + white).

### Developer guidance

- Pings are a HUD/netcode feature: zero changes to `packages/shared` simulation files (P5). The only shared change is `messages.ts`.
- No per-frame allocation: the 4-slot ping model and arrow outputs are preallocated (brief 7).
- The wheel is a HUD overlay in HudScene (Phaser), like the build bar, not a Preact screen (it must coexist with play).

### Beat the rule (reviewer start list; brief 4)

1. A modified client sends a position (ignored: the schema is `{ kind }` strict) or floods pings (bucket: 1/s; the "other" bucket and shop/build messages unaffected).
2. Ping spam to annoy: 1/s and one live ping per player cap the screen at 4 icons.
3. A held/out/waiting player pings (refused); a downed one does (allowed).
4. Pings as a wall-hack: they show only the sender's own position (teammates already see each other).
5. The wheel open over the build bar/hand cluster at 568×320; F while holding a building (hidden: F does nothing); digits while the wheel is open (no build pick).
6. A hidden tab wakes with a 10 s old ping in the queue (not shown, AC 6).
7. Edge arrow jitter at a screen corner (stateful 0.01° sweep), two pings at the same bearing (gap rule).

### Files (expected)

Shared: `net/messages.ts`. Server: `rooms/RunRoom.ts`, `net/messageGuard.ts`, `net/limits.ts`. Client: `scenes/HudScene.ts`, `scenes/hudTopLayout.ts`, `scenes/hudModel.ts`, `scenes/pingWheel.ts` (new), `scenes/GameScene.ts`, `render/pingModel.ts` (new), `render/PingView.ts` (new), `input/keyMap.ts`, `input/KeyboardMouse.ts`, `net/session.ts`, `sim/NetSimHost.ts`, `audio/placeholderSfx.ts`, `ui/sizes.ts`, tests. Tools: `tools/bots/botClient.ts`. Docs: readability sheet, `docs/art/epic-8/`.

### File overlap and build order

- **Runs in parallel with 8.2+8.3** (only `messages.ts` and `RunRoom.onCreate` lines overlap: append in separate blocks; the HUD layout test: 8.2+8.3 adds only a waiting mode). Independent of Epic 7 except the brief-30 asset session and any Epic 7 HUD change: merge master before touching `HudScene.ts` and again before the final gate.
- Not in the save (8.4–8.6): nothing to coordinate.
- netEvents kinds: **150–154** reserved (none expected: pings are an S2C message). Readability sheet: **130–133**.

### Effort and review

- **Effort: M** (≈ 3–4 h: server + wire 0.5 h, wheel + button + layout 1.5 h, view + arrows + sound 1 h, bots + gate 0.5–1 h).
- **Review: full** (asked for all Epic 8 stories): one fresh reviewer with the three layers; beat-the-rule focus on the rate limit, the server position and the layout sweeps.

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 8.7; FR76.
- `docs/ideas/epic-8/decisions.md` D15; Q14 (button top-right, above the blackout); `docs/epic-8-story-decisions.md` E8-P1…P6.
- `docs/epic-6-brief.md` line 24 (always above the darkness: pings), line 17 (votes and pings are inputs to budget for).
- `_bmad-output/planning-artifacts/game-architecture.md` line 629 (pings defined in the architecture).

## Dev Agent Record

### Agent Model Used

### Gate

### Debug Log References

### Completion Notes List

### File List
