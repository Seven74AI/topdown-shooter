---
baseline_commit: 0ee0d6db
---

# Story 8.7: Pings

Status: review

<!-- Designer 2026-11-25: ALL 33 Epic 8 story decisions (E8-J/H/S/R/P, docs/epic-8-story-decisions.md) ANSWERED: accepted as recommended. Built overnight 2026-11-25 on story-8-7 (gds-dev-story, autonomous); build-time decisions 8.7 B1–B13 auto-accepted overnight (same file). -->
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

- [x] **T1 Fairness tests first** (P1–P6): `apps/server/src/rooms/RunRoom.ping.test.ts` (server position, 1/s drop, out/held/waiting/lobby/results refused, broadcast to all), `apps/client/src/render/pingModel.test.ts`, `packages/shared/src/replay/` digest-with-pings test.
- [x] **T2 Wire** (AC 1, 4, 5): `packages/shared/src/net/messages.ts` (`PING_KINDS`, `C2S.PING_SEND`, `S2C.PING_SHOWN`, `pingSendSchema`, `PingShown`), `apps/server/src/net/limits.ts` (`PING_PER_S`), `apps/server/src/net/messageGuard.ts` (bucket `"ping"`), `apps/server/src/rooms/RunRoom.ts` (`onMessage`, `onPing`).
- [x] **T3 Client net** : `apps/client/src/net/session.ts` (`room.onMessage(S2C.PING_SHOWN, …)`), `apps/client/src/sim/NetSimHost.ts` (`sendPing(kind)`, nothing while disconnected), `fakeRoom`/devThrottle/bot copies (brief 2: messages pass the throttle with the same delay as other S2C messages).
- [x] **T4 HUD** (AC 2, 3): `apps/client/src/scenes/hudTopLayout.ts` (`layoutPingButton`, wave line end), `ui/sizes.ts`, `scenes/hudModel.ts` (`pingButton`, `pingWheelOpen`, `pingPressed` latches), `scenes/pingWheel.ts` (new, pure layout + hit test), `scenes/HudScene.ts` (draw + taps), `scenes/GameScene.ts` (wiring only), `input/keyMap.ts` + `input/KeyboardMouse.ts` (`takePing`, `heldCount`), digits suspended while open.
- [x] **T5 Draw** (AC 1, 6, 7): `render/pingModel.ts`, `render/PingView.ts` (icons via `addGeneratedTexture`, `aboveDarkness(obj, "ping")`), edge arrows in HudScene via `placeEventArrow`.
- [x] **T6 Sound** (AC 8): `audio/placeholderSfx.ts`.
- [x] **T7 Layout** (P6): `scenes/hudLayout.test.ts` (ping button + wheel chips in modes `wave`, `build`, `vote`; absent in `holding`, `reconnecting`), `scenes/hudTopLayout.test.ts` (widest wave line with the button), wheel-in-safe-area test at all four sizes with insets 44/21; wiring tests (R2) for the button, F key, and `PING_SHOWN` → view.
- [x] **T8 Bots + readability** (AC 10): `tools/bots/botClient.ts` + flag; `docs/playtests/milestone-1/readability-sheet.md` items 130–133 (the four icons at 14 px over stage 1 dusk and stage 5 blackout).
- [x] **T9 Gate** (R6); screenshots of the wheel open at 568×320 and 844×390 (stills only, designer: no videos) in `docs/art/epic-8/pings-*.png`.

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

Claude (Claude Code cloud session, builder for story-8-7), gds-dev-story, autonomous overnight run.

### Gate

- **Gate (R6):** story commit + master `06e8356` merged (merge `c292148`); `npm run typecheck && npm run lint && npm test && npm run build && REQUIRE_DIST=1 npx vitest run tools/checks/noCheatsInRelease.test.ts` → exit 0. **526 test files passed / 4 skipped, 4738 tests passed / 31 skipped**; lint 0 problems; build OK; release no-cheats scan 3/3. Load at the end 3.71 (1-min). Only docs (this file) changed after the gate.

### Tests per task (brief R1: "file > test name")

- **T1** `apps/server/src/rooms/RunRoom.ping.test.ts` > "P1 + P3: broadcast to everyone (the sender too) with the sender's slot and SERVER position…", "P5: a ping changes nothing in the World — its snapshotWorld digest is the same…", "P2: at most 1 per second per player (own bucket, counted as pingDropped)…", "P4 rule table (pingRefusal)…", "P4: downed can ping; out, held, frozen, lobby and results can't"; `apps/client/src/render/pingModel.test.ts` (5 tests: 4 s, replace, > 4 s late not shown, malformed, clears). The `packages/shared/src/replay/` digest test is replaced by the P5 handler-digest test (pings never enter shared sim code: no shared file but `messages.ts` changed).
- **T2** `apps/server/src/net/messageGuard.test.ts` > "Story 8.7 (E8-P5): pings have their own 1/s bucket (burst 1)…"; RunRoom.ping tests above; `tools/checks/pingWiring.test.ts` > "server: ping.send through the guard's own 'ping' bucket…".
- **T3** `apps/client/src/sim/NetSimHost.ping.test.ts` (sendPing kind only / link down; ping.shown → inbox model, never the World; solo B8); devThrottle wraps every `onMessage` generically, so `ping.shown` passes it with the same delay as other S2C messages (no change needed); `tools/checks/pingWiring.test.ts` > "client net…".
- **T4** `apps/client/src/scenes/pingWheel.test.ts` (4 tests), `apps/client/src/scenes/pingFrame.test.ts` (4 tests: P4 visibility, F / 1–4 latch + digits eaten while open, chip send, pan), `apps/client/src/input/keyMap.test.ts` > "Story 8.7: F opens the ping wheel"; `tools/checks/pingWiring.test.ts` > "GameScene…", "HudScene…".
- **T5** `apps/client/src/render/pingArrows.test.ts` (20 tests: 0.01° stateful sweeps both ways at 568×320 / 640×360 / 800×360 / 844×390, oscillation ±0.01°/0.1°/0.5° across every jump, four pings at 0°/3°/10°/25° spread, keep off the event arrow, resize 568×320 → 844×390, no allocation); `tools/checks/pingWiring.test.ts` > "the view puts every ping object above the darkness"; `tools/checks/galleryCoversAllArt.test.ts` and `noUnregisteredTextures.test.ts` (the new `atlas_ping`).
- **T6** `tools/checks/pingWiring.test.ts` > GameScene (`playSfx(… "ping_double" : "ping", pingPan(sx, sw), PING_SFX_VOLUME)`), `pingFrame.test.ts` > "pan…". Sound itself: not verified by ear (headless).
- **T7** `apps/client/src/scenes/hudLayout.test.ts` > ONE HUD LAYOUT TEST (ping in wave / build / vote, three open-wheel modes, absent holding / selected / reconnecting), "Story 6.14: … wave line …" (compact line ≥ 11 px), "Story 8.7: the ping button and wheel at every test size" (568×320, 640×360, 800×360, 844×390, + a 20 px top inset).
- **T8** `tools/bots/ping.test.ts` > "two bots: Bot 1 every 2 s, Bot 2 every 0.25 s — both shown on the other bot, Bot 2's extras dropped at the 1/s bucket"; `npm run bots -- --ping-every 2`; readability sheet items 130–133.
- **T9** gate above; stills in `docs/art/epic-8/built/8-7-*.png` (phone landscape 844×390 and desktop 1280×720 at deviceScaleFactor 2, real server, two tabs; script `docs/art/epic-8/built/8-7-shots.cjs`).

### Measurements

- **Bandwidth (AC 9, brief 8):** `ping.shown` = 24 B on the wire (protocol byte + type string + msgpack integer array; asserted ≤ 30 B in RunRoom.ping.test). Worst case 4 pings/s per room → **≤ 96 B/s per phone** (budget 120). `ping.send` from a phone: ≈ 25 B, ≤ 1/s. Before: 0 (new feature).
- **Arrows (R3):** bearing error ≤ 30° in every frame of the 0.01° sweeps for one ping and for up to three crowded pings; ≤ 45° for a 4th on the same bearing at 568×320 only (B7, measured 43.5°); jumps > 40 px ≤ 3 per turn, each oscillation flips at most once; ≥ 4 px between ping arrows and from the event arrow.

### Debug Log References

- `eventArrow.ts` held at most 8 obstacles and silently dropped the rest; the 8th keep-off (ping button) broke the 6.14 L4 fan test that way. Capacity → 24 (B10).
- The dev ⚙ sat exactly where the ping button goes (touch taps hit it in dev builds): moved left (B11).
- The large slot-colour triangle seen next to a ping's edge arrow in `8-7-phone-edge-arrow.png` is the existing Story 2.9 teammate arrow (the pinging teammate is off screen too), drawn by HudScene on the same bearing.

### Completion Notes List

- Server: `C2S.PING_SEND { kind }` (strict) through `this.net.guard(…, "ping")` — its own `TokenBucket(1, 1)` (`PING_PER_S`); `RunRoom.onPing` + pure `pingRefusal` (phase build/wave/vote, not frozen, not held, alive or downed); `S2C.PING_SHOWN [slot, kindIdx, xDm, yDm, tick]` to everyone; rate drops counted per player (`pingDropped` in `net_stats`). Never World state.
- Client: `PingModel` (4 slots, 4 s, late pings dropped), `PingView` (world icon + edge arrows, `ABOVE_DARK.ping`), `pingArrows` (6.8 placement + pair gap + beside fallback), `PingHud` (button left of ☰ with the 1 s ring, 2 × 2 chip wheel), `pingFrame` (visibility, F / 1–4 / Esc, send), `pingArt` (code-drawn atlas, gallery), sound `ping` / `ping_double`. Layout: `layoutPingButton`, wave line ends before it, compact wave line at 568 px (B3), boss bar gap to the ping button, event arrows keep off it.
- Bots: `pingEveryS` / `--ping-every <S>`, seeded kinds per bot.
- netEvents kinds 150–154: none used (pings are an S2C message). Readability numbers 130–133 used.

### Notes for the merge

- `packages/shared/src/net/messages.ts`: 8.7 appends `PING_SEND` at the end of `C2S` and `PING_SHOWN` at the end of `S2C` under a `// Story 8.7 (pings) ↓` comment, and one block at the end of the file (`PING_KINDS`, `PING_LABELS`, `pingSendSchema`, `PingShown`, `PING_SHOW_MS`, `PING_COOLDOWN_MS`). 8.2+8.3's own entries go beside them: keep both.
- `packages/shared/src/index.ts`: a `// Story 8.7 (pings)` export block after `type BuildingGhosted`: keep both.
- `apps/server/src/rooms/RunRoom.ts` `onCreate`: one block of 3 lines (`// Story 8.7 (pings) ↓ … ↑`) just before the `"*"` handler; plus `pingRefusal` (module level, before `randomUint32`), `onPing` / `countPingDrop` / `pingDropped` (before `ghostMsg`), `pingDropped` in `logNetStats`, a clear in `startWaveStats`. If 8.2+8.3 adds waiting joiners WITH a World player, add them to `pingRefusal` (today a waiting joiner has no World player → refused as "status").
- `apps/server/src/net/messageGuard.ts`: bucket type gains `"ping"`; the bucket pick is now `g[bucket]`.
- `apps/client/src/scenes/hudLayout.test.ts`: 8.7 adds `pingBtn` / `pingChips`, the ping in `wave` / `build` / `vote`, three `ping_wheel_*` modes and 4 KNOWN_LIST lines; 8.2+8.3's waiting mode: add it to the "no ping button" list in the 8.7 describe at the end.
- `apps/client/src/render/eventArrow.ts`: `newWaveControlRects()` makes 8 rects (8th = ping button); `MAX_NOTCHES` 24.
- `apps/client/src/scenes/hudModel.ts` `waveLine(m, compact?)`: new optional arg.
- `apps/client/src/debug/DevCheats.css`: ⚙ at right 128 px, panel at 180 px.

### Not verified

- Real phones, real 4G, iOS Safari (touch on the ping button / chips was driven headless with Playwright's touchscreen only).
- The sound by ear (synth cue scheduled; headless).
- A stage 5 blackout still (B13); a still in a wave (the stills are in a build phase: `DEV_NO_WAVES=1`).
- Under `?lag=150&jitter=20` and `&loss=1` in a browser: pings ride the same reliable channel as other S2C messages (devThrottle wraps all of them); the model's age rule (B4) handles late ones; not run on the lossy line in a browser.
- A 4G TCP stall can deliver two honest pings < 1 s apart at the server: the second is dropped by the 1/s bucket (rare; the client cooldown is 1 s).

### File List

- M `_bmad-output/implementation-artifacts/sprint-status.yaml`
- M `apps/client/src/audio/placeholderSfx.ts`
- M `apps/client/src/debug/DevCheats.css`
- M `apps/client/src/gallery/collect.ts`
- M `apps/client/src/input/KeyboardMouse.ts`
- M `apps/client/src/input/keyMap.test.ts`
- M `apps/client/src/input/keyMap.ts`
- M `apps/client/src/net/session.ts`
- A `apps/client/src/render/PingView.ts`
- M `apps/client/src/render/eventArrow.ts`
- A `apps/client/src/render/pingArrows.test.ts`
- A `apps/client/src/render/pingArrows.ts`
- A `apps/client/src/render/pingArt.ts`
- A `apps/client/src/render/pingModel.test.ts`
- A `apps/client/src/render/pingModel.ts`
- M `apps/client/src/scenes/GameScene.ts`
- M `apps/client/src/scenes/HudScene.ts`
- A `apps/client/src/scenes/PingHud.ts`
- M `apps/client/src/scenes/bossBar.ts`
- M `apps/client/src/scenes/hudLayout.test.ts`
- M `apps/client/src/scenes/hudModel.ts`
- M `apps/client/src/scenes/hudTopLayout.ts`
- A `apps/client/src/scenes/pingFrame.test.ts`
- A `apps/client/src/scenes/pingFrame.ts`
- A `apps/client/src/scenes/pingWheel.test.ts`
- A `apps/client/src/scenes/pingWheel.ts`
- A `apps/client/src/scenes/pingWheelState.ts`
- M `apps/client/src/sim/LocalSimHost.ts`
- A `apps/client/src/sim/NetSimHost.ping.test.ts`
- M `apps/client/src/sim/NetSimHost.ts`
- M `apps/client/src/sim/SimHost.ts`
- M `apps/client/src/ui/sizes.ts`
- M `apps/server/src/net/limits.ts`
- M `apps/server/src/net/messageGuard.test.ts`
- M `apps/server/src/net/messageGuard.ts`
- A `apps/server/src/rooms/RunRoom.ping.test.ts`
- M `apps/server/src/rooms/RunRoom.ts`
- A `docs/art/epic-8/built/8-7-desktop-help-seen.png`
- A `docs/art/epic-8/built/8-7-desktop-pings.png`
- A `docs/art/epic-8/built/8-7-desktop-wheel-open.png`
- A `docs/art/epic-8/built/8-7-phone-edge-arrow.png`
- A `docs/art/epic-8/built/8-7-phone-help.png`
- A `docs/art/epic-8/built/8-7-phone-wheel-open.png`
- A `docs/art/epic-8/built/8-7-shots.cjs`
- M `docs/epic-8-story-decisions.md`
- M `docs/playtests/milestone-1/readability-sheet.md`
- M `packages/shared/src/index.ts`
- M `packages/shared/src/net/messages.ts`
- M `tools/bots/botClient.ts`
- A `tools/bots/ping.test.ts`
- M `tools/bots/run.ts`
- A `tools/checks/pingWiring.test.ts`
- M `_bmad-output/implementation-artifacts/8-7-pings.md` (this file)
