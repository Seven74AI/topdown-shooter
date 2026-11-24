# Story 5.18: Place, place, place (chain and pending under lag)

Status: done

(Building UX rework BX-4. Design: `docs/ideas/building-ux/ux-spec.md` §5 (numbers: pending timeout 2 s, chain rate ≤ 4/s), §6.3 Place, §6.4 Pending, §15 (designer: **B · Carry + drag**, **no hold-to-paint**: one Place = one building, walls come from the chain jump), `draft-stories.md` › BX-4, feel: `prototype.html` / claude.ai/artifact/KVsb47j3u6m22TzgYDuCAR. Spine-wins rule: where the spec and the prototype disagree, the spec wins. Builds on 5.15 (`stepPlacement`, carry, hand cluster), 5.16 (build bar, `pickError`, toasts) and 5.17 (`blockReason`, the reason line, the 250 ms hold). **Client-only: no message, schema or server change.** Takes over two accepted lows: **5.15 L7** (the server judges `building.place` before queued inputs, so after a fast reversal under big lag a green ghost can be refused `blocked` — handled like any pending refusal) and **5.16 L2** (the build bar's count/wallet lagged one round trip online — the pending count and wallet now feed `buildOwned` / the tiles' wallet).)

## Story

As a player,
I want to place several of the same building in a row and trust it under lag,
so that I can build a wall in seconds.

> **EPIC 5 BRIEF** (§11 of `epic-4-retro-2026-11-23.md`) is this story's checklist; every line applies. Quoted in full (paste it into the builder and the reviewer prompt too):
>
> ```
> EPIC 5 BRIEF (from the Epic 4 retro; reviewers: check each line)
> 1. Own worktree + assigned ports only. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current work branch.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo, NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → mirror → Predictor → devThrottle → snapshotWorld).
> 3. FAIRNESS RULE FIRST: write each mechanic's player-visible rule into the ACs before building (e.g. "standing in a Spitter puddle always hurts at N/s", "a mine never kills its owner's teammates unless friendly fire is on", "a Bloater blast is stopped by cars/bus/buildings").
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (step out on the damage tick, stack traps, place mines on spawns, flamethrower through cover, swap to dodge reloads) and list every attempt and its result.
> 5. Projectiles and areas (grenades, spit, flames, blasts, puddles) respect 4.2 cover: car/bus/buildings stop them, barriers/sandbags only stop bodies; server and the client's cosmetic copy agree; rewound (2.12) hits where applicable.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged.
> 7. Spatial code (traps, mines, Brute charges, knockback, new barricades) gets a builder-written fuzz test: random layouts × decay stages × many ticks; no body inside a box, no stall, zombies reach a player, flow fields rebuild only at build start.
> 8. Randomness only from named seed streams; the card shop uses shop:<slot>:<build>; same seed + input log → same snapshotWorld digest.
> 9. Liveness: every sim/replay/integration test asserts something really happened (kills by the new weapon, ≥ 1 explosion, ≥ 1 trap trigger). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks; no per-tick/per-frame allocation (pool projectiles, puddles, particles); every number in balance JSON, no inline literals.
> 11. Bandwidth: projectiles and effects go out as events (spawn + seed), not per-tick state; report added B/s; total ≤ 30 KB/s (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled, and capped (max live particles/puddles in balance JSON). Run ?stress=150 with the new effects active; report headless FPS before/after with load; the 4.10 phone numbers are the floor, not to be lost.
> 13. Readability: every new zombie and object must be recognisable at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet.
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start, on a late Game scene start; client shows server truth (pending until state agrees).
> 15. Balance: start from the 4.10 earnings decision; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 6-wave sim and assert waves ended.
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added p99 ≤ 2 ms total budget.
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently.
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master.
> 20. (added 2026-11-23, Story 4.13) Every texture drawn in code is created through addGeneratedTexture with a redraw callback (Android Chrome wipes canvases while the app is in the background); test that it redraws after a simulated context loss.
> ```
>
> Most relevant here: **2** (no sim copy is touched: the pending boxes are a client prediction drawn over the World; World, schema, syncState, state views, mirror, Predictor, devThrottle, snapshotWorld and the server are unchanged; NetSimHost changes only *when* it hands a refusal to the scene), **3/4** (fairness ACs 6–10 and "Beat the rule"), **9** (liveness: the netsim test asserts that three buildings really appeared and that refusals really happened; mutations), **10** (the pending timeout, send gap, chain step and walk-away distance in `controls.json`; the pending boxes are a fixed pool of Graphics, drawn once per box, animated by position/alpha/rotation only), **14** (`?lag=150&jitter=20`, a hidden tab across a build start, server truth after one round trip), **17** (the per-client guard drops > ~10 non-input msgs/s silently: the chain sends ≤ 4/s), **20** (no new texture: dashed boxes and spinners are Graphics). Lines 5–8, 11–13, 15–16 have nothing to act on (client-only presentation, no new object or effect, no sim change, 0 B/s added; the request is the unchanged `building.place`).

## Acceptance Criteria

1. **One Place = one building** (designer, §15): a Place press sends at most one `building.place`; holding Place does nothing more.
2. **Chain (keep the item).** After a Place that was sent (or queued, AC 6), **the same building stays in my hands** when the **shown** wallet still covers its price **and** owned + pending < `maxPerPlayer`. Otherwise the hand empties with a toast: **"Not enough money for another"** / **"Building limit reached (6)"** (cap first, as `placementError`).
3. **Chain jump.** The next ghost is **pinned one footprint further** (rot and lock kept): a non-square footprint jumps along its **long side** by its length (barricades end to end: three Places = a 6 m wall); a square footprint jumps one footprint width along the axis nearest to **the right of my facing**; the jump is at least `controls.build.chainMinStepM` = **1.0 m** (so a 0.5 m mine jumps 1.0 m). The direction along the long side is the side of the right of my facing (BX-5 will switch it to the last drag's side). **If the jumped spot is blocked** (the pending-aware check of AC 5 says `blocked`), the ghost goes back to **carry** at once.
4. **Pinned (5.18's minimal pin; BX-5 adds the drag and the "↩ carry" chip).** A pinned ghost stays put in the world while I walk; ⟳ turns it 90° around its centre and keeps it pinned. It goes back to carry when (a) its centre leaves the view shrunk by 1 m (ux-spec §6.2), or (b) my survivor has walked more than `controls.build.chainUnpinWalkM` = **2.0 m** from where I stood at the Place (D3). Holding still ends under 5.15's rules.
5. **Pending.** A Place adds a **pending box** at the spot shown: a **dashed outline** of the footprint with a **spinner tick** at its corner. Until it is answered it **counts as occupied** for my next ghost (overlapping it = `blocked`, reason "Overlaps a building"), counts toward my cap (**owned + pending**), and its price comes off the **shown wallet**: HUD money, build-bar tiles + "n/6" count (5.16 L2), the reason line's "Need $X (you have $Y)", the shop's wallet. The server's wallet in the World is never changed by the client.
6. **Rate and in-flight cap (F6).** A Place press is turned down on this device (toast, nothing sent, the hand empties) when owned + pending ≥ `maxPerPlayer`, or when pending boxes already take the shown wallet below the price; so **never more than `maxPerPlayer − owned − pending` placements are in flight**. Sends from one client are at least `controls.build.chainSendGapMs` = **250 ms** apart (≤ 4/s, well under the guard's 10/s bucket): a faster tap shows its pending box at once and is sent when the gap allows (the spot sent = the spot shown at the press).
7. **Answers.** When the World shows my new building at the pending box's spot (type, gx, gy, rot, owner me, an id newer than any building I knew at the Place) the pending box **becomes the building** (it simply goes; BuildingView draws the building). On `building.refused`, or **no answer within `controls.build.pendingTimeoutMs` = 2 s** of the send, the box **shakes 3 × 150 ms (±0.1 m)**, **fades in 300 ms**, the reason toasts (`placeRefusalText`; timeout: **"No answer from the server"**) and the price is **shown back** at once.
8. **Which box a refusal belongs to (no ids on the wire).** `building.refused { reason }` carries no request id. The server answers one client's `building.place` messages in order, sends a refusal at once and a placed building with the next patch. So NetSimHost hands a refusal to the scene only once the mirror World has a **patch newer than the one it held when the refusal arrived** (every building accepted before that refusal is then in the World); the scene first turns matched boxes into buildings, then gives each refusal to the **oldest unanswered** box. A box that timed out stays an invisible "ghost" (no money, no cap) that can still take its late refusal or building, so a late answer never hits the wrong box. Solo: refusals and buildings come at once, same path.
9. **Lifecycle (F1, brief 14).** A **phase change or a new wave number** clears every pending box (queued ones are never sent; nothing is charged by the client; a late building or `not_build_phase` refusal shows as server truth / a toast). This covers a hidden tab slept across a build start. A new run (scene restart) starts with no pending.
10. **Fairness: the server decides (F1).** Pending boxes, the shown wallet and the chain are predictions; the server's `placeBuilding` rules and refusal codes are unchanged. **Placed + pending ≤ `maxPerPlayer`** on this device at all times.
11. **Under `?lag=150&jitter=20`:** three quick Places give three buildings, no double charge (final wallet = start − 3 × price), and the shown wallet is never below the server's final wallet for longer than one round trip.
12. **Numbers (brief 10).** `controls.json › build`: `pendingTimeoutMs 2000`, `chainSendGapMs 250`, `chainMinStepM 1.0`, `chainUnpinWalkM 2.0`, `barQuietMs 300` (review Q2) (zod with bounds and defaults so older fixtures load; send gap ≥ 150 ms, review L2). Shake/fade timings are the ux-spec's look constants next to the view. No allocation per frame: one pool of pending entries (16), one pool of box Graphics (each drawn once when a box takes the slot and once when it turns red), the spinner by `setRotation`, shake by `setPosition`, fade by `setAlpha`.
13. **Tests:** `pendingPlacements.test.ts` (wallet/count maths, rate gap, FIFO refusals with an accepted box in between, timeout → ghost → late refusal, match by spot + newer id, two boxes on one spot, clear on phase/wave, pool limit); `placement.test.ts` (+ chain jump per type and rot, square to the right of facing, mine 1.0 m, blocked jump → carry, pinned stays while walking, unpin by walk and by view, ⟳ while pinned, pending-aware check: limit / money / overlap order, chain toasts, Place gate); `NetSimHost.buildings.test.ts` (refusal released after the next patch; several refusals in one frame); **`NetSimHost.chain.test.ts`** (a fake server with the shared `placeBuilding`, DevThrottle at 150 ms ± 20: three quick Places → three buildings, wallet once each, shown wallet bound; 10 taps with $100 → 2 sent, 2 charged; refusal at the build→wave edge); `balance.test.ts` (defaults/bounds). Browser check online with an own server + client at `?lag=150&jitter=20`: a 3-barricade wall in a few taps, no double charge, 10 taps with $100. Screenshots in `docs/art/5-18/`.

## Beat the rule (reviewer: try each, record the result)

| # | Attempt | Expected result |
| --- | --- | --- |
| B1 | 10 taps on Place in 1 s with $100 (wood $40) | 2 pending boxes, 2 sent, 2 built, $80 charged; the hand empties after the 2nd with "Not enough money for another" |
| B2 | Tap Place at the build→wave edge | Refused `not_build_phase` by the server ("Only during the build phase"); nothing charged; the pending box is gone with the phase |
| B3 | Hidden tab with pending boxes across a build start | Woken: no pending box, shown wallet = server wallet |
| B4 | Hold at 5/6 and tap Place twice fast | 1 sent; the 2nd is turned down on the device ("Building limit reached (6)") |
| B5 | Place twice on the same spot fast (Place still sends a red ghost) | The 1st builds, the 2nd is refused `blocked`, only the 2nd box shakes |
| B6 | A green ghost refused `blocked` after a fast reversal under big lag (5.15 L7) | Shakes, fades, money shown back (like any refusal) |
| B7 | Flood Place to trip the server's message guard | ≤ 4 sends/s; the guard (10/s) never drops a placement |
| B8 | Kill the server mid-chain (no answers) | Each box shakes after 2 s with "No answer from the server", money shown back |
| B9 | Walk away from a pinned chain ghost | Back in my hands after 2 m (or when it leaves the view) |

## Tasks / Subtasks

- [x] **T1 Numbers.** `controls.json` + `buildControlsSchema`: `pendingTimeoutMs`, `chainSendGapMs`, `chainMinStepM`, `chainUnpinWalkM`; `balance.test.ts`.
- [x] **T2 `scenes/pendingPlacements.ts`** (Phaser-free): pooled entries, `add`, `pump`, `sync`, `refuse`, `update` (phase/wave clear, timeouts, end of the refusal animation, ghost expiry), `count`, `money`, `overlaps`; tests.
- [x] **T3 Placement chain + pin** (`placement.ts`): pending-aware `check`, the pending overlap reason, `chainStep`, `pin`/`unpin`, `carry` while pinned, ⟳ around the centre, Place gate + chain in `stepPlacement` (`PlacementFrame.pending`, view rect); tests.
- [x] **T4 NetSimHost refusal queue**: a small ring of (reason, tick at arrival); `takePlaceRefusal` returns the oldest only once `world.tick` is newer; tests.
- [x] **T5 `render/PendingView.ts`**: pooled dashed boxes + spinner, shake/fade; GameScene wiring (sync → step → pump → sync; refusals → `refuse`; shown wallet into HUD, bar, hint, shop).
- [x] **T6 NetSimHost chain test at 150 ms**, mutations.
- [x] **T7 Browser check online** (own ports, `?lag=150&jitter=20`), screenshots `docs/art/5-18/`.
- [x] **T8 Gate + record.**

## Dev Notes

### Decisions (taken here, recommended values; the ux-spec already decided everything else)

- **D1 Refusals are matched to boxes by order, released after the next patch** (AC 8). The wire has no request id and this story may not change messages. The server handles one client's places in order, answers a refusal at once and an acceptance with the next patch, and the dev throttle keeps the order per direction, so "first match buildings, then give each refusal (seen with a newer patch) to the oldest unanswered box" is exact. Cost: a refusal shows ~one tick (50 ms) later than before.
- **D2 Turned down on the device when pending makes it certain** (AC 6): at the cap counting pending, or short of money counting pending. The server would refuse these anyway (in a build phase my wallet only goes down by my own buys); this keeps the in-flight rule and saves messages. With **no** pending boxes a predicted refusal still sends (5.15: the server judges).
- **D3 Minimal pin** (AC 4): BX-5 isn't built, so there is no "↩ carry" chip yet. A pinned ghost returns to carry after **2.0 m** of walking (a deliberate walk to build elsewhere, not a stick twitch) or when it leaves the view (BX-5's rule, early). 5.19 can set `chainUnpinWalkM` to 0 (off) once its chip exists.
- **D4 Chain step = max(footprint along the jump axis, 1.0 m)**: barricades 2 m, turret 1 m, spike trap 2 m, mine 1 m (the spec's numbers) and 5.10's floodlight / med station get a sensible step from their footprint with no code change.
- **D5 Sends paced at 250 ms** (a minimum gap, not a bucket): 4/s at most, the press is never lost (queued with its box shown), and the timeout counts from the real send.
- **D6 Timed-out boxes become invisible ghosts** for up to 10 s (`GHOST_KEEP_MS`, a safety constant, cleared anyway with the phase): their late answer is taken by them, not by a newer box. A ghost doesn't count toward money or the cap (the server enforces the cap if a late acceptance comes).
- **D7 A timed-out box's late refusal doesn't toast again** (it already said "No answer from the server"); a refusal with no box (after a phase change) toasts as today.
- **D8 Look**: pending = white dashed outline (0.06 m, dashes 0.25 m) + 10 % white fill, spinner = a white quarter arc (r 0.18 m) at the box's top-right corner turning once per second; refused = the same box redrawn red (`#e53935`), shaken ±0.1 m along x (3 × 150 ms), then faded over 300 ms. Depth just under the ghost.

### Current state (read before changing)

- `client/scenes/placement.ts`: `Placement` (carry, ⟳, `check` = `placementError`, `explain` = 5.17 reason + hold, `confirm` ends holding), `stepPlacement` (cancel rules → hold input → ✕ → **Place = confirm + send, ends holding** → ⟳ → carry → check → explain → HUD).
- `client/scenes/GameScene.ts`: `sendPlace` → `host.placeBuilding`; per frame `updateShop` → `updatePlacement` → `updateRepair` → `updateBuildBar` (owned/wallet from the World) → `host.update` → `takePlaceRefusal` (one per frame) → toast; later `hudModel.money = player.wallet`; `hintText` reads the World wallet.
- `client/sim/NetSimHost.ts`: one `refusal` slot (a second refusal in the same frame overwrote the first); the mirror World's buildings, wallet and tick come from the latest room state in `applyState` (same patch).
- `client/sim/LocalSimHost.ts`: `placeBuilding` applies at once, a refusal is one slot (fine: ≤ 1 send per frame with D5).
- `client/net/devThrottle.ts`: keeps order per direction; refusals and patches share the incoming queue.
- `shared/buildings/buildings.ts`: `placementError` order: player → phase → type → integer → limit → money → blocked; `ownedCount`. Unchanged.

### Copies touched (brief line 2)

None of the sim copies. NetSimHost (client) changes when a refusal is handed on; `controls.json` gains four client-read numbers (`balance.version` changes with the JSON; client and server ship the same file).

### Must be preserved

5.15's carry, hold input, Place = the spot shown (now the spot shown at the press, even if sent later), ✕ / cancel rules; 5.16's bar and toasts (now fed pending-aware numbers); 5.17's reason, hold, culprit; 3.4's refusal texts; every existing test (the two that assumed "Place ends holding" / "a refusal is taken without a patch" are updated to the new rule).

### References

- `docs/ideas/building-ux/ux-spec.md` §5, §6.3, §6.4, §15; `draft-stories.md` BX-4; `epics.md` › Story 5.18; story files 5-15 (L7), 5-16 (L2), 5-17.

## Notes for the merge (brief line 19)

- `controls.json` / `balanceSchema.ts › buildControlsSchema`: four fields added after `reasonHoldMs` (5.19 adds its drag numbers after these).
- `scenes/placement.ts`: `PlacementFrame` gains `pending`, `viewMinX/Y`, `viewMaxX/Y`; `Placement` gains `pinned`, `pin`/`unpin`, `chainStep`, `request`. **5.19**: hook the "↩ carry" chip to `unpin()` and make the drag set `pinned`; switch the chain direction to the last drag's side in `chainStep`.
- `sim/NetSimHost.ts`: `takePlaceRefusal` releases after the next patch. **5.24 (move) / 5.22 (sell)** refusals carry no id either: reuse the same pattern.
- **5.19 (designer via main session, Q3)**: 5.19's pin chip **replaces** the 2 m walk-away rule — set `controls.build.chainUnpinWalkM` to 0 (or drop the walk check in `Placement.carry`) when the chip lands.
- **5.23 (Q1)**: keep "a blocked chain jump goes back to carry" (the red ghost on the last box); polish it there.
- `scenes/pendingFlow.ts › runPendingFrame` (review M2) owns the per-frame order of the pending placements; GameScene's `beforeHostStep` / `hostStep` are its two scene steps. New per-frame work that must see this frame's boxes goes into `beforeHostStep`.
- `SimHost` gains `placeRefusalsDropped` (review L1); a new host must count refusals it drops.
- `scenes/GameScene.ts`: the shown wallet (`shownWallet()`) replaces the World wallet for the HUD, bar, hint and shop. **5.10** buildings need nothing (generic chain step); **5.12**'s consumable buy uses the shop's wallet (already the shown one).

## Senior Developer Review (AI)

**Reviewer:** fresh agent dispatched by the main session, 2026-11-23. **Outcome:** 2 medium, 4 low, 1 nit; the oldest-first refusal design holds (B1 confirmed online: 2 placed, $100 → $20). Fixed on `story-5-18`; the mediums go to a re-review.

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| M1 | Medium | A spurious "No answer from the server" after a hidden tab / any frame gap > 2 s, although the building was built and charged (the timeout ran in the frame's first update, before the host applied the state that answered it). | Timeouts are checked only in the update after the host step (`update(…, timeouts)`), and they count **running time**: `clockMs` sums frame gaps capped at `MAX_FRAME_GAP_MS` = 100 ms, so a hidden tab or a hitch never times a box out. Tests: unit (one long gap, timeouts off, B3 clear on the woken frame) and netsim (Place then a 3 s hidden tab, with the send already out and with it still queued; a hidden tab across a build start). Browser: the reviewer's repro (Place, `loop.sleep()` 3 s, `wake()`) → no toast, built, $4960. |
| M2 | Medium | GameScene's pending wiring was untested ("no match after host.update" and "the pump never sends" survived; the netsim copied the loop by hand and dropped the timeout toast). | New Phaser-free `scenes/pendingFlow.ts › runPendingFrame(pending, host, now, scene, send, dropped)`: update → `beforeHost` (placement step … input) → pump + update → `stepHost` → update with timeouts (toast) → dropped-refusal check → refusals. GameScene calls it with `beforeHostStep` / `hostStep`; the netsim test uses it too (+ a never-answering server: the timeout toast). `pendingFlow.test.ts` (fake host) pins the order. Both mutants killed. |
| L1 | Low | After a stall > 10 s (a ghost forgotten) or > 8 refusals in one frame (ring overflow), refusals shifted to newer boxes. | `PendingPlacements.matching`: off once a ghost is forgotten while still awaiting, a still-awaiting box is evicted, or the host reports a dropped refusal (`SimHost.placeRefusalsDropped`, counted by NetSimHost's ring and LocalSimHost's slot → `lost()`); while off, refusals only toast; back on when no box awaits. |
| L2 | Low | `chainSendGapMs` min 100 allowed 10/s (the guard's limit); the ghost keep counted from the send (timeout max 10 s = keep); `maxPerPlayer` max 64 > pool 16. | Send gap min **150** ms; the ghost keep counts 10 s of running time **from the timeout**; the pool is sized from balance (`configure`: max(16, 2 × maxPerPlayer + 4)) and the view from the pool. |
| L3 | Low (accepted) | Two identical boxes on one spot, the first refused and the second accepted: the wrong one shakes. | **Accepted** (main session): same spot, same look; money and cap are right. |
| L4 | Low | `chainOffset` rounded the step (a 0.6 m footprint would jump 0.5 m, into itself). | `Math.ceil` (with a 1e-9 guard). Test: 0.6 m and 0.75 m → 1 m. |
| Q1–Q3 | Designer (main session) | Open questions. | Q1: keep ghost-back-to-hands (polish in 5.23). **Q2: build-bar taps within `controls.build.barQuietMs` = 300 ms after the hand empties pick nothing** (and the Shop tile does nothing): `BuildBarFrame.quiet`, `GameScene.handEmptiedMs` (test in `buildBar.test.ts`). Q3: 5.19's chip replaces the walk-away rule (Notes for the merge). |

Gate after the fixes on the tree merged with master `609f9a2`: `npm run typecheck && npm run lint && npm test && npm run build` → exit 0; **272 files passed / 1 skipped, 2,252 tests passed / 3 skipped**; build OK. Load 0.65 at the start, 3.3 at the end (4-core container, this builder alone).

Mutations of the fixes, one each, all **killed**: no frame-gap cap (unit and netsim, after adding the "send still queued" case); timeouts in every update; no match after the host step (netsim and flow test); the pump never sends; ghost expiry keeps pairing; dropped refusal ignored; ghost keep from the send; pool not sized from balance; quiet ignored; round instead of ceil; send gap min 100.

**Re-review (fresh agent, 2026-11-23) of `edd1094`:** clean — no new bugs (online SIGSTOP stall of the server → "No answer" at 2.07 s and the late building charged once; hidden tab → no toast). Two low test gaps and one tweak, done:

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| R2-L1 | Low | Nothing pinned "a box times out only after the host step, and matching runs before the timeout". | `pendingFlow.test.ts`: sent at clock 0, frames until the next one runs out its 2 s, that frame's host step brings the building → no toast, count 0. Mutants killed: the timeout loop before `matchBuildings`; timeouts on in the pre-host update. |
| R2-L2 | Low | The eviction path (a full pool of awaiting ghosts) was untested. | `pendingPlacements.test.ts`: 16 timed-out ghosts, one more box evicts the oldest → pairing off, the next refusal → "none", the new box still counted. Mutant "eviction keeps pairing" killed. |
| R2-T | Tweak | `MAX_FRAME_GAP_MS` 100 would stretch a real timeout on a slow device. | **250 ms** (a real 2 s timeout down to 4 fps; hidden tabs still covered). Test: 8 frames × 250 ms time out at 2 s; a 400 ms frame counts 250. Mutant "cap 100" killed. |

Touched tests (`pendingPlacements`, `pendingFlow`, `NetSimHost.chain`: 31 passed) + typecheck + lint after merging master `91282c1` (5.27 build-bar icons: no overlap). Status → **done**.

## Dev Agent Record

### Agent Model Used

Claude (builder cloud session, 2026-11-23). Baseline `3bbb955` (master with 5.15–5.17); master `69bd924` (5.10, 5.11) merged in before the final gate.

### Debug Log References

- Browser check (online, own server :2618 + Vite :5218, `?lag=150&jitter=20`, Playwright mobile 800 × 360, real touch taps): see `docs/art/5-18/README.md`. Wall: 3 built end to end, $5000 → $4880, shown wallet min 4880, ≤ 2 pending at once. Ten taps with $100: server log 2 `building_placed` / 0 `building_refused`, $100 → $20, shown min 20, toast "Not enough money for another". No console errors.
- The netsim test found a real bug while building: the patch lands inside `host.update`, after the frame's first pending match, so for one frame the HUD subtracted a price twice. Fixed by matching again right after `host.update` (GameScene and the test loop).
- Mutation M9b first survived (with the 250 ms send gap and 150 ms RTT the netsim never had an accepted box in flight when a refusal came). Added a server-hitch case (messages handled on arrival, ticks paused 700 ms): now killed.

### Completion Notes List

- **Pending tracker** (`scenes/pendingPlacements.ts`, Phaser-free): a pool of 16 entries; `add` (queued, counted), `pump` (oldest queued, ≥ `chainSendGapMs` 250 ms apart), `update` (phase/wave clear, boxes that became my buildings — same type/gx/gy/rot, owner me, id newer than both the newest id known at the press and the last match — timeouts after `pendingTimeoutMs` 2 s → refusal look + invisible ghost for a late answer, ghosts forgotten after 10 s), `refuse` (oldest awaiting box; "shown" / "ghost" / "none"), `count`, `money`, `overlaps`. No allocation after construction.
- **Chain + pin** (`scenes/placement.ts`): `check(world, owner, pending)` is pending-aware in `placementError`'s order (limit counting pending → money from the shown wallet → my pending ground = `blocked`, reason "Overlaps a building"); `placeGate` turns a Place down on the device only when pending makes the refusal certain (cap counting pending; short with a box pending) — with nothing pending a predicted refusal still sends (5.15); `stepPlacement`'s Place: request → gate → send → can I pay/build another (else hand empties: "Not enough money for another" / "Building limit reached (6)") → `chain` (jump `chainOffset`: long side end to end, squares to the right of the facing, ≥ `chainMinStepM` 1 m; pinned; blocked → back to carry). Pinned ghosts don't follow me; ⟳ turns them around their centre; back to carry after `chainUnpinWalkM` 2 m of walking or when the centre leaves the view (1 m inset).
- **NetSimHost**: refusals go into a ring of 8 with the room state's tick at arrival; `takePlaceRefusal` hands the oldest on only once the mirror World's tick is newer (every building the server accepted before the refusal is then mirrored), so FIFO matching is exact without ids. Also fixes the old single slot that lost a second refusal in one frame.
- **View** (`render/PendingView.ts`, `render/pendingLook.ts`, `dashedRect` in `render/dashes.ts`): one Graphics pair per pool slot, drawn when a box takes the slot and once when it turns red; per frame only position (shake ±0.1 m, 3 × 150 ms), alpha (300 ms fade) and the spinner's rotation (1 turn/s). No texture.
- **GameScene**: Place → `queuePlace` (box at the shown spot); per frame pending update → placement step → pump + update → `host.update` → update again → every refusal to `refuse` (toast unless "ghost") → "No answer from the server" on timeouts. The shown wallet (`wallet − pending.money`) feeds the HUD money, the build bar (and `owned + pending` for its count: 5.16 L2), the reason line and the shop.
- **Balance** (`controls.json › build`): `pendingTimeoutMs 2000`, `chainSendGapMs 250`, `chainMinStepM 1.0`, `chainUnpinWalkM 2.0` (zod, bounds, defaults).
- **Copies (brief 2)**: no sim copy, message, schema or server change; 0 B/s added. 5.15 L7 (green ghost refused after a fast reversal) is now just a pending refusal: shake, fade, money back.
- **Tests**: `pendingPlacements.test.ts` (12), `placement.test.ts` (+10 in the 5.18 block, one 5.15 test updated: Place now keeps the item), `pendingLook.test.ts` (4), `NetSimHost.buildings.test.ts` (+1, one updated: a refusal now needs the next patch), `NetSimHost.chain.test.ts` (5: three quick Places at 150 ± 20 ms, 10 taps with $100, a refused box between two accepted ones, a server hitch, the build→wave edge), `balance.test.ts` (+1).
- **Mutations (brief 9)**, one per new test area, all **killed**: refuse takes the newest box; match ignores `afterId`; no send gap; timeout ends awaiting; chain jumps left; pending ground not occupied; gate ignores pending on the cap; never unpin by walking; refusal released at once (buildings test, and the netsim after the hitch case); shake 0.2 m; dashed edge with even slots; timeout default 3000; chain without the money gate (netsim); chain step along the wrong axis (every-type test).
- **Full gate** on `story-5-18` merged with master `69bd924`: `npm run typecheck && npm run lint && npm test && npm run build` → exit 0; **270 files passed / 1 skipped, 2,232 tests passed / 3 skipped**; build OK. Load 2.4 at the start, 3.8 at the end (4-core container, this builder alone). (Before the merge: 262 files / 2,181 tests, exit 0.) The every-type chain test was added after that gate (touched test + lint + typecheck run, 34/34).
- **Not verified**: a real phone; a hidden tab slept across a build start in the browser (unit + netsim cover the clear; not driven with `loop.sleep()`); a real network stall (the netsim hitch only); several players building at once online; the pending boxes' readability over busy city art at phone size (only headless shots); 5.10's floodlight / med station chained in the browser (unit-tested generically).

### File List

- `_bmad-output/implementation-artifacts/5-18-place-place-place-chain-and-pending-under-lag.md` (new)
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `packages/shared/src/config/balance/controls.json`
- `packages/shared/src/config/balanceSchema.ts`
- `packages/shared/src/config/balance.test.ts`
- `apps/client/src/scenes/pendingPlacements.ts` (new)
- `apps/client/src/scenes/pendingPlacements.test.ts` (new)
- `apps/client/src/scenes/placement.ts`
- `apps/client/src/scenes/placement.test.ts`
- `apps/client/src/scenes/GameScene.ts`
- `apps/client/src/sim/NetSimHost.ts`
- `apps/client/src/sim/NetSimHost.buildings.test.ts`
- `apps/client/src/sim/NetSimHost.chain.test.ts` (new)
- `apps/client/src/render/PendingView.ts` (new)
- `apps/client/src/render/pendingLook.ts` (new)
- `apps/client/src/render/pendingLook.test.ts` (new)
- `apps/client/src/render/dashes.ts`
- `apps/client/src/scenes/pendingFlow.ts`, `pendingFlow.test.ts` (new, review M2)
- `apps/client/src/scenes/buildBar.ts`, `buildBar.test.ts` (Q2)
- `apps/client/src/sim/SimHost.ts`, `apps/client/src/sim/LocalSimHost.ts` (review L1)
- `apps/client/src/render/PendingView.ts` sized from the pool (review L2)
- `docs/art/5-18/README.md`, `5-18-wall-pending.png`, `5-18-wall-built.png`, `5-18-wall-end.png`, `5-18-ten-taps.png`, `5-18-ten-end.png` (new)

### Change Log

- 2026-11-23: Re-review clean; lows R2-L1, R2-L2 and the 250 ms frame-gap cap done; master `91282c1` merged. Status → done.

- 2026-11-23: Review fixes M1, M2, L1, L2, L4 + designer answers Q1–Q3 (Q2: 300 ms build-bar quiet window); L3 accepted; master `609f9a2` (5.26) merged. Status stays review (the mediums get a re-review).

- 2026-11-23: Story written (gds-create-story) from the code on master `3bbb955`.
- 2026-11-23: Built (gds-dev-story): pending tracker, chain + pin, refusal ordering in NetSimHost, pending view, shown wallet; master `69bd924` (5.10/5.11) merged; gate green. Status → review.
