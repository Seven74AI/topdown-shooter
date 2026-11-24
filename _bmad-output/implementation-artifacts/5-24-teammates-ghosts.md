---
baseline_commit: 6eaed168e83b989e67e4013273b2ad40a53c9129
---

# Story 5.24: Teammates' ghosts

Status: done

(Building UX rework **BX-10**, the last Epic 5 story. Design: `docs/ideas/building-ux/ux-spec.md` §11 "What teammates see (network)" (the designer kept teammate ghosts, §15 decision 7; budget ≈ 0.4 KB/s for 30 s, 0 in waves), fairness F7 ("cosmetic is cosmetic: teammate ghosts never block, never leave the build phase"); `draft-stories.md` › BX-10; `epics.md` › Story 5.24; prototype claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR. Builds on 5.15–5.23 (carry / `stepPlacement`, build bar, `blockReason`, chain + pending, drag / pin / item chip, sell / undo, action bar + move incl. `building.move` with seq, placement feel + owner marks, mouse / keys). **This story touches the server:** a new C2S message `building.ghost` and a new S2C relay `building.ghosted`; nothing in the schema, nothing in the World.)

Main-session brief carried in (2026-11-24): bandwidth (brief 11) and the per-client guard (~10 non-input msgs/s shared by place / sell / move / shop) matter most: a ghost relay must not starve those (rate-limit hard, ≤ 4 Hz, only on change, or fold it into the input message); total ≤ 30 KB/s. Online check with two clients at `?lag=150&jitter=20`: the teammate's ghost is visible, moves smoothly, disappears on place / cancel / phase change / disconnect; bandwidth measured and reported; screenshots in `docs/art/5-24/`.

## Story

As a player,
I want to see what my teammates are about to build, before they place it,
so that we don't build on top of each other.

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`) is this story's checklist; every line applies. Quoted in full:
>
> ```
> EPIC 5 BRIEF (from the Epic 4 retro; reviewers: check each line)
> 1. Own worktree + assigned ports only. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current work branch.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo, NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → mirror → Predictor → devThrottle → snapshotWorld).
> 3. FAIRNESS RULE FIRST: write each mechanic's player-visible rule into the ACs before building (e.g. "standing in a Spitter puddle always hurts at N/s", "a mine never kills its owner's teammates unless friendly fire is on", "a Bloater blast is stopped by cars/bus/buildings").
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (step out on the damage tick, stack traps, place mines on spawns, flamethrower through cover, swap to dodge reloads) and list every attempt and its result.
> 5. Cover (updated 2026-11-23, PR #5 lob-over + PR #6 barricades stop bullets): bullets stop at map cover (cars, bus, buildings, pumps, parking wall, dumpster) and at every barricade tier. Lobbed rounds (launcher, hand grenade, molotov) fly over everything except real buildings (`building: true`), which stop them at the face. Spit, flames, blasts, acid and gas: cars, the bus and buildings stop or shield them. Sandbags, police barriers, turrets and floor buildings (traps, mines) stop bodies only. Melee is stopped by barricades and shot-blocking map cover. Server and the client's cosmetic copy agree; rewound (2.12) hits where applicable.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged.
> 7. Spatial code (traps, mines, Brute charges, knockback, new barricades) gets a builder-written fuzz test: random layouts × decay stages × many ticks; no body inside a box, no stall, zombies reach a player, flow fields rebuild only at build start.
> 8. Randomness only from named seed streams; the card shop uses shop:<slot>:<build>; same seed + input log → same snapshotWorld digest.
> 9. Liveness: every sim/replay/integration test asserts something really happened (kills by the new weapon, ≥ 1 explosion, ≥ 1 trap trigger). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks; no per-tick/per-frame allocation (pool projectiles, puddles, particles); every number in balance JSON, no inline literals.
> 11. Bandwidth: projectiles and effects go out as events (spawn + seed), not per-tick state; report added B/s; total ≤ 30 KB/s (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled, and capped (max live particles/puddles in balance JSON). Run ?stress=150 with the new effects active; report headless FPS before/after with load; the latest recorded ?stress=150 baseline in docs/perf/ is the floor, not to be lost (4.10 is deferred).
> 13. Readability: every new zombie and object must be recognisable at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet.
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start, on a late Game scene start; client shows server truth (pending until state agrees).
> 15. Balance: earnings stay as built (4.10 deferred); the Epic 5 balance pass after round E settles them; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 6-wave sim and assert waves ended.
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added p99 ≤ 2 ms total budget.
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently.
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master.
> 20. (added 2026-11-23, Story 4.13) Every texture drawn in code is created through addGeneratedTexture with a redraw callback (Android Chrome wipes canvases while the app is in the background); test that it redraws after a simulated context loss.
> ```

## Fairness rules first (brief line 3; ux-spec §11, F7)

- **F7 Cosmetic is cosmetic.** A teammate's ghost lives only in the receiving client's `TeammateGhosts` store (outside the World, outside the schema, outside the server's World). It never blocks a placement or a move (mine or anyone's), never changes my ghost's colour, reason line, chain, pending boxes, the server's checks, the flow field or anything in the simulation. Its only effect is pixels.
- **F7b It never leaves the build phase.** The server relays a ghost only while the run is in a build phase; every client hides all teammate ghosts the moment its phase is not "build" (wave start, results, lobby), and the sender stops sending when its hand empties (which a wave start does).
- **F7c No colour of truth.** A teammate's ghost is never coloured valid / blocked (the receiver doesn't know their pending prices, and the server never judged it): it is always the sender's slot colour, 50 % alpha, dashed.
- **Honest sender, bounded liar.** The server relays only: a known player, standing (a clear `""` passes for anyone in the room), in a build phase, a known building type, and a footprint centre inside the sender's own view (`viewRect` + 2 m (review L1): where a carried or pinned ghost can really be). Everything else is dropped silently (cosmetic: no refusal message). The rate is bounded by its own bucket so a flood can't starve real actions.
- **No new information.** The relay carries only what the sender's screen already shows them (type, spot, rotation) plus their player id; no wallet, no pending prices, no validity.
- **Stale ghosts die.** A ghost is hidden 1 s after its last update (the sender re-sends every 500 ms while holding still), at once on `""`, on `player.left`, on any phase other than build, and when the room returns to the lobby.

## Acceptance Criteria

1. **C2S `building.ghost { type, gx, gy, rot }`** (`type: ""` = my hand is empty), strict zod schema (type 0–32 chars, gx / gy 0–255 ints, rot 0–3), handled through `this.net.guard` with its **own rate bucket** (`MAX_GHOST_MESSAGES_PER_S` = 5, capacity 5): a ghost flood never takes a token from the shared "other" bucket (place / sell / move / shop / repair / upgrade / ready), and those never starve ghosts. Over-rate messages are dropped silently and counted like any other drop (`client_message_rejected`, reason `rate`).
2. **Sender (client):** while I hold a building (new or a move) in a build phase, my client sends the ghost **only when type / gx / gy / rot changed**, at most every **250 ms** (4 Hz; a change inside the gap goes out when the gap ends, so the last spot always arrives), plus a **keepalive every 500 ms** while unchanged; when my hand empties (Place ends the hold, ✕, wave start, menu, downed) it sends one `""`. An off-wire spot (`Placement.onWire` false) counts as empty. Solo sends nothing. Nothing is sent in waves.
3. **Server relay:** `RunRoom.onGhost` checks with the shared `ghostError(world, playerId, msg)` (unknown player → not standing (except `""`) → not a build phase → unknown type → out of the sender's view) and relays an accepted ghost to **every other client** as S2C `building.ghosted [slot, typeIdx, gx, gy, rot]` (a tuple, D6; `typeIdx` −1 = none; `broadcast(…, { except: sender })`, one encode). Not stored anywhere on the server.
4. **Receiver:** `RunInbox` listens from the join (no unhandled-type warning) into a `TeammateGhosts` store (one entry per slot, preallocated, no allocation per message beyond the SDK's decode); its own player id is ignored. An entry is hidden on `""`, 1 s after its last update (`GHOST_TIMEOUT_MS`), on `player.left` for that player, on the lobby reset, and whenever the World's phase is not "build".
5. **Look:** each live teammate ghost is a **dashed outline** of the building's footprint (`footprint(stats, gx, gy, rot)`, `dashedRect`) in the sender's **ring colour** (`SLOT_COLORS[slot]`), **50 % alpha**, a faint fill (8 %), never red / green; with a label **"Bo · Auto-turret"** (name · building name; "Teammate" when the name is empty) above it in the sender's colour (HUD text, 12 CSS px × dpr, dark stroke), hidden with the ghost. Drawn under my own placement preview. Graphics + Text only (no texture; brief 20 N/A).
6. **Smooth:** the outline glides to a new spot (exponential, ~80 ms time constant) instead of jumping at 4 Hz; a ghost that (re)appears or changes type / rotation snaps. No allocation per frame (redrawn only when the footprint size or colour changes).
7. **Bandwidth (brief 11):** a test measures the relay's real wire bytes (Colyseus message framing + msgpack) per receiver for the worst case (3 teammates carrying and turning continuously for a 30 s build: 4 Hz each) and asserts ≤ 0.4 KB/s (ux-spec §11); the story reports the measured B/s and the typical case. 0 B/s in waves (the server drops, the client doesn't send).
8. **No regressions:** every existing test passes; my own placement, chain, pending, drag / pin, move and undo are unchanged.

## Beat the rule (reviewer: try each, record the result)

| # | Attempt | Expected result |
| --- | --- | --- |
| B1 | Flood `building.ghost` (100/s) while placing / selling / moving | ghosts beyond 5/s dropped silently (own bucket); place / sell / move / shop still accepted at their normal rate (test: a flood then a place → placed) |
| B2 | Flood ghosts to amplify traffic to teammates | at most 5 relays/s per sender reach each teammate (≈ 0.25 KB/s per flooding sender) |
| B3 | Send a ghost in a wave (crafted) | dropped (`not_build_phase`); receivers also hide all ghosts outside build |
| B4 | Send a ghost far away (other side of the map) to mislead | dropped (`out_of_view`: footprint centre outside the sender's view + 2 m) |
| B5 | Ghost of a building I can't afford / a type not in the shop | relayed if the type exists (cosmetic only; the receiver sees an outline, nothing changes); an unknown type is dropped |
| B6 | Ghost onto a spawn / onto a teammate / into a wall | relayed (cosmetic, F7): it never blocks anything; the teammate's own ghost stays as its own check says |
| B7 | A stale ghost after the sender disconnects / closes the tab / hides the tab | hidden on `player.left`; a hidden tab sends no keepalive → hidden after 1 s |
| B8 | A ghost across the build → wave edge under lag | the relay is ordered before the wave's patch on the same socket; the receiver hides it when the phase changes |
| B9 | Ghost while downed / out | dropped (`not_alive`); a `""` is still relayed |
| B10 | Spoof another player's ghost (`playerId` in the C2S payload) | strict schema refuses unknown keys; the server stamps the sender's own player id |
| B11 | Ghost blocks my own placement (client) | never: structural (D9), no test: `Placement.check` reads the World only and the ghost store is outside it |
| B12 | Off-wire values (gx 300, rot 7, type of 40 chars, extra keys) | `invalid` drop (schema) |

## Tasks / Subtasks

- [x] **T1 Shared:** `buildings/ghost.ts` (`GhostError`, `ghostError`, `GHOST_VIEW_MARGIN_M`); `net/messages.ts` (`C2S.BUILDING_GHOST`, `S2C.BUILDING_GHOSTED`, `buildingGhostSchema`, `BuildingGhosted`, `GHOST_MIN_INTERVAL_MS` 250, `GHOST_KEEPALIVE_MS` 500, `GHOST_TIMEOUT_MS` 1000); exports; tests.
- [x] **T2 Server:** `MessageGuard` third bucket `"ghost"` + `MAX_GHOST_MESSAGES_PER_S` (limits.ts); `RunRoom.onGhost` + relay; `RunRoom.ghost.test.ts` (relay to others only, never to sender, wave dropped, far dropped, downed dropped, flood doesn't starve place); bandwidth test.
- [x] **T3 Client net:** `net/teammateGhosts.ts` (`TeammateGhosts` store + `GhostSender` pacing); `RunInbox` listens + `player.left` / reset clears; `SimHost.sendGhost` / `teammateGhosts`; NetSimHost, LocalSimHost; tests.
- [x] **T4 Client view:** `render/TeammateGhostView.ts` (dashed outline + glide); hudModel ghost labels; HudScene draws labels; GameScene wiring (send after `updatePlacement`, hide outside build).
- [x] **T5 Online check** (own ports, two clients, `?lag=150&jitter=20`), bandwidth from the server's meters, screenshots `docs/art/5-24/`.
- [x] **T6 Gate + mutations + record.**

## Dev Notes

### Decisions (taken here, recommended values)

- **D1 Own bucket, not the shared one.** The brief's rule is "a ghost relay must not starve place / sell / move / shop". Sharing the 10/s bucket at 4 Hz would leave 6/s for the real actions (a chain of Places at the 5.18 send gap plus a ready toggle could hit it); folding it into `input.send` would add ~8 B × 20 Hz to every input all run (also in waves) and touch the 2.4–2.12 input path. A third bucket (5/s, capacity 5) in the same `MessageGuard` keeps both guarantees and costs one `TokenBucket` per client. The C2S stays a separate message.
- **D2 Pacing: on change ≤ 4 Hz, keepalive 2 Hz, timeout 1 s.** The AC "vanish after 1 s without an update" and "only on change" contradict for a ghost held still; a 500 ms keepalive (only while holding) resolves it with 2× margin for 150 ± 20 ms lag. Worst case per sender 4 msg/s (moving), typical while still 2 msg/s, 0 with empty hands.
- **D3 Server validation is silent.** Cosmetic data gets no refusal message (that would double the traffic of a flood). Drops are logged at debug only (the guard's counters already log floods). Order: `unknown_player`, `not_alive` (clears exempt), `not_build_phase`, `unknown_type`, `out_of_view`.
- **D4 Range = the sender's view.** A carried ghost sits ≤ ~3 m from me; a pinned ghost stays until it leaves my view (5.18 / 5.19). The server uses the shared `viewRect` (the widest camera view, 24 × 13.5 m, clamped like the camera) + 2 m margin on the footprint centre (review L1: the server checks against its older position of the sender while the client predicts 0.7–1.4 m ahead at `?lag=150`). Receivers draw in the world, so they see it only when it is in their own view (no extra visibility rule).
- **D5 Type check only, no wallet / cap check.** Wallet and cap shown to the sender include pending prices the server doesn't know; checking them would drop honest ghosts during a chain. A move's ghost (free) uses the building's type. Any `balance.buildings` type passes.
- **D6 Payload (changed during the build):** `[slot, typeIdx, gx, gy, rot]` (`typeIdx` into `buildingTypeIds`, −1 = none), like the net events. Measured with Colyseus's own encoder: the named object `{ playerId, type, gx, gy, rot }` was **66 B** per relay (worst case 0.77 KB/s per receiver, over ux-spec's 0.4 KB/s); the array is **24–26 B** (worst 312 B/s). The slot is stamped by the server (B10). The C2S message keeps names (it goes to the server once, ≤ 4/s).
- **D7 Look:** dashed outline (0.06 m line, 0.25 m dashes as 5.22's `MoveView`), slot colour, alpha 0.5, fill 0.08; label "Name · Building" 12 CSS px in slot colour with a 3 px dark stroke, 0.25 m above the footprint's top edge; depth under the placement preview (12.7 vs 13). No owner of a move is distinguished ("Bo · Spike trap" for a moved trap too): the old spot is already visible as the standing building.
- **D8 Glide:** drawn centre → target with `k = 1 − exp(−dt / 80 ms)` per frame; snaps on appear, on type / rot change, or a jump > 6 m (a pin jump across the screen reads as a jump anyway).
- **D9 Store outside the World.** `TeammateGhosts` is a client module in `net/`; neither `Placement`, `pendingPlacements`, `blockReason` nor the Predictor import it (F7 is structural; B11 has no test, it follows from the module boundary).
- **D10 No change to solo.** `LocalSimHost.sendGhost` is a no-op and `teammateGhosts` is null.

### Current state (read before changing)

- `apps/server/src/net/messageGuard.ts`: two buckets (`input`, `other`); `guard(schema, handler, bucket)`; `limits.ts` holds the rates.
- `apps/server/src/rooms/RunRoom.ts`: handlers registered in `onCreate`, the `onMoveBuilding` pattern; `onLeave` broadcasts `player.left`; `state.phase` mirrors the World's phase.
- `packages/shared/src/net/messages.ts` (C2S / S2C, zod), `net/interest.ts` (`viewRect`), `buildings/buildings.ts` (`buildingStats`, `footprint`).
- `apps/client/src/net/session.ts` (`RunInbox` listens from the join; `player.left` sink; `reset()` on lobby return), `sim/SimHost.ts`, `NetSimHost.ts`, `LocalSimHost.ts`.
- `apps/client/src/scenes/GameScene.ts` (`updatePlacement` once per frame in `beforeHostStep`; views updated in the render part), `placement.ts` (`Placement.active/type/gx/gy/rot/onWire()`), `hudModel.ts` (camX / camY / camZoom, teammate names), `HudScene.ts` (name tags), `render/MoveView.ts`, `render/dashes.ts`, `render/playerColors.ts`.

### Must be preserved

The shared "other" bucket's 10/s for every existing message; 5.15–5.23's hand, chain, pending, drag / pin, move, undo, feel and keys; the 2.9 name tags; every existing test.

### References

`docs/ideas/building-ux/ux-spec.md` §11, §15; `draft-stories.md` BX-10; `epics.md` › Story 5.24; `HANDOFF.md` §3 lessons; `docs/epic-5-decisions.md`; story files 5-18, 5-21, 5-23.

## Notes for the merge (brief line 19)

- `packages/shared/src/net/messages.ts`: `C2S.BUILDING_GHOST` (`building.ghost`), `S2C.BUILDING_GHOSTED` (`building.ghosted`), `buildingGhostSchema` (strict; type ≤ 32 chars incl. "", gx / gy 0–255, rot 0–3), `BuildingGhost`, `BuildingGhosted` (a 5-number tuple), `GHOST_MIN_INTERVAL_MS` 250, `GHOST_KEEPALIVE_MS` 500, `GHOST_TIMEOUT_MS` 1000 (net constants, not balance: no balance version change). New `buildings/ghost.ts` (`ghostError`, `GhostError`, `GhostRequest`, `GHOST_VIEW_MARGIN_M` 2, review L1). Exports in `index.ts`. No net event kind, no schema field, no SimEvent.
- Server: `net/limits.ts` `MAX_GHOST_MESSAGES_PER_S` 5; `net/messageGuard.ts` a third bucket `"ghost"` (`MessageBucket` type widened); `RunRoom.onGhost` (registered with `"ghost"`), `broadcast(…, { except })` with a reused tuple. `RunController`, `syncState`, the schema: untouched.
- Client: new `net/teammateGhosts.ts` (`TeammateGhosts`, `GhostSender`, `teammateGhostFor`), `render/ghostGlide.ts`, `render/TeammateGhostView.ts`. `RunInbox.ghosts` (listens from the join; `player.left` now clears that slot's ghost even with no sink; `reset()` / `close()` clear all). `SimHost.sendGhost` / `teammateGhosts` (NetSimHost: the inbox's store; LocalSimHost: no-op / null) — any other `SimHost` implementation must add both. `hudModel`: `ghostLabelAt`, `ghostLabelShown`, `ghostLabelText`. `HudScene`: `ghostLabels` texts (created with the name tags, resized with them), `drawGhostLabels()` after `drawTeammates()`. `GameScene`: `ghostView` (created / destroyed with `moveView`), `ghostSender` (reset in `create`), `sendGhost(host)` right after `updatePlacement` in `beforeHostStep`, the view updated after `moveView`.
- Depth: teammate ghosts 12.7 (under 5.22's move boxes 12.8 and the placement preview 13).
- A future reconnect (Epic 8 `allowReconnection`): a dropped player's ghost times out after 1 s on the others; nothing to restore.

## Senior Developer Review (AI)

Fresh-agent review by the main session (2026-11-24): **clean — no high, no medium.** All 21 reviewer mutations killed; flood, spoof, stale-ghost and F7 attempts all held. Optional lows done on `story-5-24`:

| # | Sev | Finding | Fix |
| --- | --- | --- | --- |
| L1 | Low | The 1 m view margin could drop an honest pinned ghost at the view's edge: the server checks against its older position of the sender while the client predicts 0.7–1.4 m ahead at `?lag=150`. | `GHOST_VIEW_MARGIN_M` 1 → **2 m**; `ghost.test.ts` adds a ghost 1.4 m past the half width (relayed); the far-away cases moved out to 16 m / 10 m. |
| L2 | Low | The bandwidth test covered only honest 4 Hz pacing, not a modified client at the guard's rate. | `ghostBandwidth.test.ts` also asserts 3 senders × `MAX_GHOST_MESSAGES_PER_S` (5/s) × 26 B = 390 B/s ≤ the 409.6 B/s budget. |
| L3 | Low | The receiver's "which slots show this frame" rule (clear outside build, never my own slot) was inline in the Phaser view (untested). | Pure `teammateGhostFor(ghosts, build, slot, localSlot)` in `net/teammateGhosts.ts`, used by `TeammateGhostView`; test in `teammateGhosts.test.ts`. |
| L4 | Low | The story text was stale: AC 3 still said the object payload, D7's label lift said 0.55 m, and B11 / D9 promised a test that wasn't written. | AC 3 → the tuple; D7 → 0.25 m (as built); B11 / D9 → structural, no test; the view margin → 2 m everywhere. |
| L5 | Note | Slot 2's ring colour (green `#34c759`) is close to the valid-placement green, so a green teammate's ghost could be read as "valid". | For the playtest readability sheet: check whether a green teammate's dashed 50 % ghost is confused with my own valid ghost (mine is solid-filled; theirs a dashed outline with a name label). |

Fix-round mutations: 4/4 killed (outside build not cleared · own slot shown · margin back to 1 m · ghost bucket 10/s).

## Dev Agent Record

### Agent Model Used

Claude (cloud builder session for Story 5.24).

### Debug Log References

- Online check: own server (port 25624, `ALLOW_SOLO_START=1 DEV_STARTING_WALLET=5000`) and own Vite (port 5324, git-excluded `apps/client/vite.5324.local.mjs`), both stopped by PID; Playwright, two contexts, `?lag=150&jitter=20&wallet=5000`; numbers and shots in `docs/art/5-24/README.md`. Found during the check: Ana's first Place was refused `blocked` (she had walked into the bus's cover) — the game's rule, not a bug; the script walks her back first.
- Bandwidth: measured with `getMessageBytes.raw(Protocol.ROOM_DATA, …)` (Colyseus 0.18's own frame): named payload 66 B → tuple 24–26 B (D6). `ghostBandwidth.test.ts` prints: frame 26 B (clear 24 B); worst 312 B/s, still 156 B/s per receiver; budget 409.6 B/s. Online: 58 B/s average from one walking teammate (≈ 96 B/s while moving), 0 B/s in the wave.
- Mutations (one per new test, each reverted by the runner): **17 run, 17 killed** — ghostError: build phase not checked · view not checked · clears not exempt when downed; schema not strict; guard: ghost on the shared bucket; room: relayed back to the sender · type index lost · registered on the shared bucket; bandwidth: 10 Hz pacing; store: no timeout; sender: no keepalive · no min interval; inbox: `player.left` keeps the ghost · reset keeps ghosts; host: ghost not sent; glide: no snap on rotation · no easing.
- Full gate (one run, at the end): `npm run typecheck && npm run lint && npm test && npm run build` → exit 0; **318 test files passed, 1 skipped; 2624 tests passed, 3 skipped**; build OK (the existing > 1600 kB chunk warning). Load ~1.5 → 2.5 during the run.

### Completion Notes List

- `building.ghost` (C2S, strict) → shared `ghostError` (known, standing (clears exempt), build phase, known type, inside the sender's view + 2 m) → `building.ghosted [slot, typeIdx, gx, gy, rot]` to every other client. Nothing stored on the server; nothing in the World or schema (F7). Its own 5/s guard bucket (D1): B1 test floods 100 ghosts then places — placed, no refusal.
- Sender pacing (`GhostSender`): on change ≤ 4 Hz with the last spot always delivered, keepalive 2 Hz while still, one clear when the hand empties, nothing outside a build phase. Receiver (`TeammateGhosts` in `RunInbox`): hidden on clear, after 1 s, on `player.left`, on lobby reset, and outside build (the view clears the store).
- Look: dashed footprint outline in the sender's slot colour at 50 % with an 8 % fill, glides (τ 80 ms; snaps on appear / type / rotation / > 6 m), label "Ana · Auto-turret" (12 CSS px, slot colour, dark stroke) drawn by the HUD; Graphics + Text only (no texture: brief 20 N/A); redrawn only when the footprint or colour changes; texts rebuilt only on change; no per-frame allocation (`live()` returns the stored entry; the view reuses its box and glide states).
- B11 (a ghost never blocks my placement) is structural: `TeammateGhosts` is referenced only by `session.ts`, `SimHost` / `NetSimHost` / `LocalSimHost`, `GameScene` and `TeammateGhostView`; `Placement`, `pendingPlacements`, `blockReason`, the Predictor and the shared sim never see it. The shared test checks a ghost on a teammate (where a placement is refused) is still relayed (B6).
- Beat the rule: B1 (test + guard test), B2 (bucket → ≤ 5 relays/s per sender), B3 (shared + room tests, online 0 relays in the wave), B4 (shared + room tests), B5 (unknown type dropped in tests; an unaffordable type is relayed by design, D5), B6 (shared test), B7 (NetSimHost test + online 179–198 ms; silent sender 958–963 ms), B8 (online: hidden at the wave patch), B9 (shared + room tests), B10 (strict schema test + server-stamped slot), B11 (structural, above), B12 (schema + store tests).
- Not done / not verified: a real phone; 4 real clients (the room test relays to 2 others; 3 senders computed); `?stress=150` (nothing added to waves: no ghost traffic or drawing outside build); the glide's look at device frame rates (headless runs ~10–25 fps).

### File List

- `_bmad-output/implementation-artifacts/5-24-teammates-ghosts.md` (new), `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/shared/src/buildings/ghost.ts` (new), `ghost.test.ts` (new); `net/messages.ts`, `net/messages.test.ts`; `index.ts`
- `apps/server/src/net/limits.ts`, `net/messageGuard.ts`, `net/messageGuard.test.ts`; `rooms/RunRoom.ts`, `rooms/RunRoom.ghost.test.ts` (new); `run/ghostBandwidth.test.ts` (new)
- `apps/client/src/net/teammateGhosts.ts` (new), `teammateGhosts.test.ts` (new), `net/session.ts`; `sim/SimHost.ts`, `LocalSimHost.ts`, `NetSimHost.ts`, `NetSimHost.ghost.test.ts` (new)
- `apps/client/src/render/ghostGlide.ts` (new), `ghostGlide.test.ts` (new), `TeammateGhostView.ts` (new); `scenes/hudModel.ts`, `HudScene.ts`, `GameScene.ts`
- `docs/art/5-24/` (7 screenshots + README)

### Change Log

- 2026-11-24: Story file written; status → in-progress.
- 2026-11-24: Built (relay, own bucket, store, pacing, view, labels), online check, mutations 17/17; status → review.
- 2026-11-24: Review clean; lows L1–L4 done (L5 a playtest note); master merged; status → done.
