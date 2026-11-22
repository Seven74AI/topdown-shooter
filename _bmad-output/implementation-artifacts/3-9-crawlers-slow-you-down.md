# Story 3.9: Crawlers slow you down

Status: done

## Story

As a player,
I want low Crawlers that are easy to miss and slow me when they bite,
so that the crowd has hidden dangers.

## Acceptance Criteria

1. **Stats (FR22).** A Crawler zombie type exists with 8 HP, 0.7 m/s, 12 damage per hit (one hit per second, like every zombie), reward 3. Every number comes from `zombies.json` (NFR14), none inline.
2. **Bite slow (FR22).** When a Crawler bite lands on a standing player, the player moves 30 % slower for 1 s (20 ticks). A second bite while slowed **refreshes** the 1 s and never stacks (still 30 %, never 60 %). God mode (no damage) also means no slow. Walkers never slow.
3. **Prediction stays exact.** Online, the slow is part of the player's server state and reaches the client; the local survivor's prediction moves at exactly the server's slowed speed and counts the slow down exactly like the server. The only prediction error a bite may cause is the unavoidable one at its onset (the client learns of the bite one snapshot later); there are no further corrections while slowed or when the slow ends.
4. **Look (FR22, readability rule).** A Crawler is drawn with a long, low silhouette (clearly different from a Walker), **beneath** every other zombie type, and leaves a blood trail on the street that fades out over 5 s. Solo and online.
5. **Dev hooks.** The dev cheat panel can spawn Crawlers (solo). A temporary wave mix shows Crawlers in normal waves before Story 3.10: `?wavemix=walker,crawler` (solo) and `DEV_WAVE_MIX=walker,crawler` on the server (online). `waves.json` is unchanged.
6. **Tests.** Vitest covers the stats, the slow (exact speed, 20 ticks, refresh, no stack, god mode, Walkers don't slow), determinism with Crawlers, the wire fields, the Predictor while slowed, and a netsim run with bites at 150 ms RTT.

## Tasks / Subtasks

- [x] **Task 1: Balance** (AC 1, 2)
  - [x] `zombies.json` gains `crawler: { hp: 8, speedMps: 0.7, damage: 12, attackIntervalS: 1.0, radiusM: 0.35, reward: 3, biteSlowPct: 30, biteSlowS: 1 }`.
  - [x] `zombieTypeSchema` gains `biteSlowPct: z.number().int().min(0).max(90).default(0)` and `biteSlowS: z.number().min(0).max(10).default(0)` (Walkers keep their JSON as is).
- [x] **Task 2: Type (shared)** (AC 1): append `"crawler"` to `ZOMBIE_TYPES` (index 1; append only, the index is on the wire). The horde stream already sends the type nibble (`packTypeState`), and the mirror already copies it: no format change.
- [x] **Task 3: Slow state and rules (shared)** (AC 2, 3)
  - [x] `PlayerState` gains `slowTicksLeft` (0 = not slowed) and `slowPct` (integer percent, 0 when not slowed). `addPlayer` sets both to 0. `snapshotWorld` already spreads players: add a determinism test anyway.
  - [x] New `player/slow.ts`: `slowPlayer(p, pct, ticks)` (refresh, no stack: `slowTicksLeft = max(left, ticks)`, `slowPct = max(active pct, pct)`), `playerSpeed(base, p)` = `base × (100 − slowPct) / 100` while `slowTicksLeft > 0`, and `tickSlow(p)`.
  - [x] `zombieAi.damagePlayer` applies the attacker type's bite slow after the damage (skipped in god mode and for non-alive players, like the damage).
  - [x] `movePlayers` uses `playerSpeed` and then counts the slow down by one tick, for every player (whatever the status). It is the shared code the predictor runs (`PREDICTION_SYSTEMS`), so the server and the predictor count the same ticks.
- [x] **Task 4: Server** (AC 3): schema `PlayerState` gains `slowTicks: t.uint8()` and `slowPct: t.uint8()`; `syncState` copies them, `resetRunFields` resets them; `stateView.ts` gains both (the drift check must pass).
- [x] **Task 5: Client prediction and mirror** (AC 3)
  - [x] `Predictor.reconcile(ackSeq, x, y, status, slowTicks = 0, slowPct = 0)` writes them into the predicted player before the replay. `NetSimHost.takeSnapshot` passes them.
  - [x] `NetSimHost.applyPlayer` copies them into the mirror players (for the slowed look).
  - [x] Dev throttle: both keys in `PLAYER_FIELDS` (the `satisfies` check fails otherwise).
- [x] **Task 6: Look** (AC 4)
  - [x] `ZombieView`: a per-type look table (`satisfies Record<ZombieTypeId, …>`, so Story 3.8's Runner must add its own): texture drawing, display length × width (in collision radii) and depth. Crawler: long low body (≈ 2.6 r long, 1.2 r wide), darker and lower contrast than a Walker, depth 4.5 (Walkers stay at 5).
  - [x] New `render/BloodTrailView.ts`: pooled ring of trail-mark Images (one generated texture); a Crawler drops a mark every 0.35 m moved; each mark's alpha falls linearly from 0.6 to 0 over 5 s and it is then hidden. Its own clock advances by frame time, and not while solo is paused (2.11: a pause freezes FX). Nothing allocated per frame. Depth 1 (with the blood splats, under every zombie).
  - [x] `PlayerView`: a slowed standing survivor's body is drawn tinted (sickly green-grey), so the slow can be seen.
  - [x] `GameScene` creates and destroys the trail view with the others (Phaser reuses the scene: create resets).
- [x] **Task 7: Dev hooks** (AC 5)
  - [x] `WorldDebug.waveMix: readonly ZombieTypeId[] | null` (default null). `spawnWaveZombie` picks `waveMix[spawnIndex % length]` where `spawnIndex = size − queued` (no RNG draw, no new state), else `"walker"`, and clamps with that type's radius.
  - [x] Shared `parseWaveMix(raw, balance)` → known balance types or null.
  - [x] Server: `RunController` option `waveMix`, `RunRoom` reads `DEV_WAVE_MIX` (like `DEV_NO_WAVES`).
  - [x] Client: `urlOptions.waveMix` from `?wavemix=` (solo only, release-safe, temporary until 3.10).
  - [x] The cheat panel's type list already lists every balance type: check Crawler appears.
- [x] **Task 8: Tests** (AC 6): see Dev Notes › Testing.

## Dev Notes

### Scope and prerequisites

- Built on Epic 2 (complete). Read first:
  - `zombies/zombieAi.ts` (`damagePlayer`, pass 4 attack; the bite happens in the zombie system, **after** the player system in the tick);
  - `player/movement.ts` (`movePlayers`, shared with prediction, only + − × ÷ sqrt min max);
  - `apps/client/src/net/prediction.ts` (rebase at `ackSeq` and replay) and `tools/netsim/predictionCircle.test.ts` (harness);
  - `net/hordeFormat.ts` (type nibble, 0–15: room for 16 types), `apps/client/src/net/mirrorZombies.ts`;
  - `render/ZombieView.ts`, `render/FxView.ts` (splat ring buffer), `scenes/GameScene.ts` (`setPresentationPaused`);
  - `apps/client/src/net/devThrottle.ts` (`PLAYER_FIELDS` `satisfies`).
- **Out of scope:** Crawlers in the wave composition and the wave curve (3.10 edits `waves.json`); the Behemoth dropping Crawlers (Epic 6); a Crawler sound; final art (Epic 9).
- **Parallel stories:** 3.1 (build phase) and 3.2 (wallets) are built at the same time. 3.2 reads `reward` from `zombies.json` per type: the Crawler's `reward: 3` is already there. 3.8 (Runners) adds a type the same way: it appends to `ZOMBIE_TYPES` and adds a look; whoever merges second takes the next index.

### Rules (timers count ticks)

- Bite at tick T (zombie system): `slowTicksLeft = max(slowTicksLeft, ticksFor(biteSlowS))` = 20, `slowPct = max(slowTicksLeft > 0 ? slowPct : 0, biteSlowPct)` = 30.
- Ticks T+1 … T+20 (player system, before the zombies): speed = `speedMps × (100 − slowPct) / 100` = 3.15 m/s, then `slowTicksLeft--`; at 0, `slowPct = 0`. Tick T+21 is full speed again. So the slow is exactly 20 movement ticks = 1 s.
- A refresh at T+10 sets 20 again (not 30): no stacking of time or strength.
- Integer percent on the wire (`uint8`): the server and the predictor compute the same expression from the same integers, so the speed is bit-identical (a float factor would need its exact bits on the wire).
- The counter runs for every status (a player downed by the bite just lets it run out); only standing players move.

### Why the slow reaches the predictor (AC 3)

The bite happens on the server; the client can't predict it. The snapshot at tick T carries `slowTicks`/`slowPct` **after** tick T, the same moment as `x`, `y` and `ackSeq`. The predictor rebases on it and replays the newer inputs through `movePlayers`, which slows and counts exactly as the server will for those inputs. So: one correction at the bite's onset (≈ 0.3 × 4.5 m/s × the ticks the client was ahead, ≈ 0.1–0.2 m at 150 ms, smoothed), then none. A starved or drained server tick also counts the slow down (the server counts ticks, not inputs): that case already corrects today.

### Testing (Vitest, fixed seeds; `systems: { waves: () => {} }` for one mechanic)

- **Balance:** Crawler numbers load; Walker gets `biteSlowPct 0`; `biteSlowPct` 95 or 1.5 fails validation.
- **AI:** a Crawler walks at 0.7 m/s; it bites for 12 once per 20 ticks.
- **Slow:** after a bite the player moves exactly 4.5 × 0.7 × 0.05 per tick for 20 ticks, full speed on the 21st; a second bite 10 ticks later refreshes to 20 and keeps 30 %; Walker bites never slow; god mode: no slow.
- **Determinism:** same seed with Crawlers + waveMix → identical `snapshotWorld` (incl. `slowTicksLeft`).
- **Wave mix:** `waveMix [walker, crawler]` alternates types; `parseWaveMix` drops unknown ids.
- **Server:** `syncState` copies and resets the two fields.
- **Predictor:** reconcile with `slowTicks 20, slowPct 30`, then 25 local steps: speed matches a server World step for step (20 slowed, then full).
- **Netsim:** the circle walk at 75 ± 10 ms one-way with a bite every ~1.5 s (via `slowPlayer` on the server World): corrections ≤ bites, error after each onset settles to < `PREDICTION_IGNORE_M`; control run with a predictor that ignores the slow shows many more corrections.

### Project Structure Notes

- New: `packages/shared/src/player/slow.ts` (+ test), `apps/client/src/render/BloodTrailView.ts`, `packages/shared/src/waves/waveMix.ts`.
- Modified: `zombies.json`, `balanceSchema.ts`, `zombieTypes.ts`, `player.ts`, `movement.ts`, `zombieAi.ts`, `world.ts`, `waveDirector.ts`, `stateView.ts`, `index.ts`; server `RunState.ts`, `syncState.ts`, `RunController.ts`, `RunRoom.ts`; client `prediction.ts`, `NetSimHost.ts`, `devThrottle.ts`, `ZombieView.ts`, `PlayerView.ts`, `GameScene.ts`, `urlOptions.ts`; `tools/netsim/predictionCircle.test.ts`.

### References

- [Source: epics.md#Story 3.9: Crawlers slow you down], FR22
- [Source: gdds/…/gdd.md#Enemy Design and AI] (bestiary row; readability: "Crawler long and low")
- [Source: game-architecture.md#Networking] (timers count ticks, shared simulation, prediction)
- Epic 1–2 lessons (HANDOFF.md §3): tick timers, no per-frame allocation, Phaser 4 `setTint` + `setTintMode`, scene reuse, no inline gameplay numbers, schema fields in the throttle key lists.

## Dev Agent Record

### Agent Model Used

claude-opus-5-5 (builder agent, worktree `story-3-9`)

### Debug Log References

- Headless Chromium runs the solo sim slowly (~14 fps, catch-up capped): Crawlers spawned 8 m out took ~18 s of wall time to reach the survivor. Feel and exactness are judged with the netsim harness (Epic 3 brief line 18); the browser confirms looks and wiring.
- `RunRoom.fight.test.ts › measures the live room tick with 4 clients and 150 Walkers` failed once under full-suite load (a timing test), then passed alone and in the next two full runs. Not touched by this story.
- The temporary Vite proxy needed `127.0.0.1` (Node resolved `localhost` to `::1`; the server listens on IPv4).

### Completion Notes List

- **Balance (AC 1):** `zombies.json` › `crawler` { hp 8, speedMps 0.7, damage 12, attackIntervalS 1, radiusM 0.35, reward 3, biteSlowPct 30, biteSlowS 1 }. `zombieTypeSchema` gains `biteSlowPct` (int 0–90, default 0) and `biteSlowS` (0–10 s, default 0: the ticks fit the uint8 wire field). Walker JSON unchanged. **Decision:** collision radius 0.35 like a Walker (crowd packing unchanged); the long silhouette is visual only.
- **Type:** `ZOMBIE_TYPES = ["walker", "crawler"]` (index 1). The horde stream's type nibble and the mirror already carry the type: no format change.
- **Slow (AC 2), `player/slow.ts`:** `slowPlayer` (refresh = `max(left, ticks)`, strength = the stronger percent while one is active, so no stacking), `playerSpeed` (`base × (100 − pct) / 100`, integer percent → bit-identical on both sides), `tickSlow`. `zombieAi.damagePlayer` now takes the attacker's stats and applies its bite slow (after the god-mode / alive check, so god mode = no slow). `movePlayers` reads the speed for the tick and then counts the slow down for every status: a bite at tick T slows exactly movement ticks T+1…T+20. Verified in the browser: slowed steps exactly 0.1575 m, full 0.225 m.
- **Every copy of the new state (Epic 3 brief line 3):**
  1. World: `PlayerState.slowTicksLeft`, `slowPct` (`addPlayer` → 0);
  2. `snapshotWorld`: players are spread (determinism test checks the field is in it); `WorldDebug.waveMix` is in `debug`;
  3. schema `PlayerState.slowTicks`, `slowPct` (uint8);
  4. `syncState` (copy on change) and `resetRunFields`;
  5. `stateView.PlayerStateView` (drift check passes);
  6. NetSimHost mirror (`applyPlayer` copies both: the slowed look);
  7. Predictor (`reconcile(…, slowTicks, slowPct)` before the replay; `NetSimHost.takeSnapshot` passes them);
  8. devThrottle `PLAYER_FIELDS` (`satisfies` check);
  9. test fixture `fakeRoom.fakePlayer`.
- **Prediction (AC 3):** netsim (real `RunController` + real `Predictor`, 75 ± 10 ms one-way): bites every 1.5 s → 18 corrections for 19 bites, 0 snaps, max error 0.20 m (the onset: 30 % of the ~3 steps the client was ahead, smoothed); bites every 0.7 s (constant refresh) → 1 correction; control run that ignores the streamed slow → 380 corrections. Browser, online with `?lag=150&jitter=20` (every reconcile logged): 330 reconciles while standing, 99 of them slowed, 7 slow onsets; 3 corrections, **all at an onset, 0 while slowed or at the end of a slow**. (One more correction/large error when the player went down, as before this story.)
- **Look (AC 4):** `ZombieView` per-type look table (`satisfies Record<ZombieTypeId, ZombieLook>`): texture, length × width in radii, depth. Crawler: long low body with trailing legs and clawing arms, darker than a Walker, 0.98 × 0.49 m, depth 4.5 (Walkers 5). New `render/BloodTrailView.ts`: ring of 400 pooled Images (one generated texture), a mark every 0.35 m a Crawler moves, alpha 0.6 → 0 linearly over 5 s on its own clock (frozen while solo is paused), then hidden; per-slot typed arrays; nothing allocated per frame. Browser: one mark measured at alpha 0.29 at 2.6 s, 0.04 at 4.67 s, hidden at 5.02 s; the oldest visible mark is always < 5 s. `PlayerView`: a slowed standing survivor is drawn green-grey (`0x9fb08a`).
- **Dev hooks (AC 5):** the cheat panel lists Crawler automatically (it lists every balance type). `WorldDebug.waveMix` + `parseWaveMix` (shared); wave zombies cycle the mix by spawn index (no RNG draw, no new state). Server `DEV_WAVE_MIX=walker,crawler` (RunRoom → RunController option `waveMix`); client solo `?wavemix=walker,crawler` (release-safe, temporary until 3.10). `waves.json` unchanged. No JSON was edited for the browser checks (HP raised and waves paused through the World object in solo; online used real numbers).
- **Bandwidth (brief line 11):** measured with the schema Encoder: a slowed, moving player adds 44 bytes per 20 ticks (≈ 44 B/s per slowed player, per receiving client; 0 when not slowed). No new events.
- **Tests:** 739 passing, 3 skipped (was 718 + 3). New: `player/slow.test.ts` (14: Crawler numbers, Walker defaults, schema rejects 95 % / 1.5 % / 11 s, crawl speed 0.7, bite 12 once per s, exact 20 slowed ticks then full speed, refresh without stacking (incl. two Crawlers), Walkers don't slow, god mode, slow runs out while downed, helpers, `parseWaveMix`, wave mix alternates types, determinism with Crawlers). `prediction.test.ts` (+2: slowed predictor bit-identical to a server World for 25 steps; onset replay corrects once, then 33 snapshots with no correction). `syncState.test.ts` (+1, reset extended). `tools/netsim/predictionCircle.test.ts` (+2: bites at 150 ms RTT, control). `urlOptions.test.ts` (+1). `zombieAi.test.ts` debug snapshot expectation updated.
- **Browser check (Python Playwright + Chromium, 844×390; server PORT=4367 with `DEV_WAVE_MIX=walker,crawler`, Vite 6873 via a temporary config, deleted):** solo: 12/16 Crawlers + Walkers via the dev cheat panel; depth 4.5 vs 5 read from the images; trails; slowed tint; exact slowed step. Online (Create → Ready → Start, `?lag=150&jitter=20`): up to 20 Crawlers in wave 1 from the server mix, drawn with trails at depth 4.5, the slow reaching the mirror and the predictor, no page errors. Screenshots in `/tmp/s39/`: `solo-crawlers-approach.png`, `solo-crowd-closeup.png`, `solo-trail.png`, `solo-trail-fading.png`, `solo-slowed-tint.png`, `online-crawlers.png`, `online-slowed.png`, `online-end.png`.
- **Not verified:** real phones and how easy Crawlers are to miss at phone size (designer playtest); a long online slowed fight (the survivor goes down within ~10 s of meeting the crowd on real numbers, so the online sample is 7 onsets); the trail freezing during a solo pause in the browser (code path only); 3-4 players.
- **Deviations:** none from the ACs. Added `WorldDebug.waveMix` and `?wavemix` (story Task 7). The slow percent is an integer by design (wire and bit-exactness).

### Notes for the merge (brief line 20)

- `zombies.json`: my block is `types.crawler`; 3.8 adds `types.runner` beside it. `balanceSchema.ts`: two keys at the end of `zombieTypeSchema` (`biteSlowPct`, `biteSlowS`).
- `zombieTypes.ts`: `ZOMBIE_TYPES` append: whoever merges second appends after the other (`["walker", "crawler", "runner"]`); `ZombieView.LOOKS` then needs the Runner entry (compile error until it exists, on purpose). `BloodTrailView.TRAIL_TYPES` lists only `crawler`.
- `waveDirector.ts` (3.1 build phase, 3.10 composition): `spawnWaveZombie` now asks `waveZombieType(world)`; 3.10 replaces that function's body with the wave composition (keep `waveMix` as a dev override or drop it with `parseWaveMix`, `?wavemix`, `DEV_WAVE_MIX`).
- `zombieAi.ts`: `damagePlayer(world, p, stats, id)` takes the zombie's stats (was the damage number); 3.5 (buildings) adding hits on buildings should not route through it.
- `player.ts` / `movement.ts`: two `PlayerState` fields; `movePlayers` reads `playerSpeed` and calls `tickSlow` first in the loop. 3.1 heal/return code needs nothing.
- Schema `RunState.ts`: `slowTicks`, `slowPct` at the end of `PlayerState`; `syncState.ts` two lines at the end of `syncPlayer`, two in `resetPlayer`; `stateView.ts` two fields after `kills`; `devThrottle.ts` two keys; `fakeRoom.ts` two defaults. 3.2 (wallets) adds its own fields in the same places: keep both.
- `RunController.ts`: option `waveMix`, one line in the constructor; `RunRoom.ts`: one option line in `startRun`.
- `NetSimHost.ts`: `reconcile` call gains two arguments; `applyPlayer` two lines after `p.status = s.status`.
- `GameScene.ts`: `trailView` field, create/destroy/update lines next to `zombieView`, one `waveMix` line after `addPlayer`.
- 3.2 wallets: the Crawler's `reward: 3` is read from balance per type as for Walkers.

### File List

- `packages/shared/src/player/slow.ts`, `player/slow.test.ts`, `waves/waveMix.ts` (new)
- `packages/shared/src/config/balance/zombies.json`, `config/balanceSchema.ts`, `zombies/zombieTypes.ts`, `zombies/zombieAi.ts`, `zombies/zombieAi.test.ts`, `player/player.ts`, `player/movement.ts`, `core/world.ts`, `waves/waveDirector.ts`, `net/stateView.ts`, `index.ts` (modified)
- `apps/server/src/rooms/schema/RunState.ts`, `rooms/schema/syncState.ts`, `rooms/schema/syncState.test.ts`, `run/RunController.ts`, `rooms/RunRoom.ts` (modified)
- `apps/client/src/render/BloodTrailView.ts` (new)
- `apps/client/src/render/ZombieView.ts`, `render/PlayerView.ts`, `scenes/GameScene.ts`, `net/prediction.ts`, `net/prediction.test.ts`, `net/devThrottle.ts`, `net/fakeRoom.ts`, `sim/NetSimHost.ts`, `debug/urlOptions.ts`, `debug/urlOptions.test.ts` (modified)
- `tools/netsim/predictionCircle.test.ts` (modified)
- `_bmad-output/implementation-artifacts/3-9-crawlers-slow-you-down.md` (new), `sprint-status.yaml` (modified)

## Senior Developer Review (AI)

- **Date:** 2026-11-22 · **Reviewer:** independent review agent (fresh context; full suite, touched tests 5×, 17 mutations of which 15 were caught, solo and online browser checks under `?lag=150&jitter=20`). **Outcome:** no high findings; one medium, fixed. The 3.2 merge confirmed correct.
- [x] [Med] A starved server tick still counted the slow down, so a stall near a slow's end gave a 0.07–0.14 m correction per snapshot (AC 3 says no corrections while slowed). Fix, as the 2.7 weapon timing: `movePlayers` doesn't count the slow on a starved tick (`weaponsPaused`), and RunController counts it once per skipped input. Netsim test: a stall across a slow's end adds no corrections beyond those of the bites and the stall alone (fails without the fix: 11 vs ≤ 9).
- [x] [Low] The NetSimHost → Predictor slow wiring was untested (defaults hid it): test that a streamed slow makes my predicted step 70 % (fails if the wiring is removed).
- [x] [Low] The determinism test never had a bite: Crawlers now start next to the player and the test asserts slowed ticks happened.
- Noted: the schema accepts `biteSlowPct > 0` with `biteSlowS: 0` (no slow, no error); the drawn Crawler is 2.8 × 1.4 radii (collision stays the 0.35 m circle, a recorded decision); with > 40 Crawlers the trails get shorter than 5 s (fine for 3.10).

## Change Log

- 2026-11-22: Review fixes (slow counts applied seqs, wiring and determinism tests). Story done.

- 2026-11-22: Story created from the real code (Epic 2 complete).
- 2026-11-22: Story 3.9 implemented: Crawler type (8 HP, 0.7 m/s, 12 dmg, reward 3), bite slow 30 % / 20 ticks (refresh, no stack) in player state + schema + predictor, long low silhouette beneath Walkers, pooled 5 s blood trail, slowed tint, dev wave mix (`?wavemix`, `DEV_WAVE_MIX`). 739 tests passing. Status → review.
