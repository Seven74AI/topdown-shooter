---
baseline_commit: 8f81792
---
# Story 6.3: Blackout lighting

Status: review

## Story

As a player,
I want blackout waves where only flashlights, floodlights, fires and muzzle flashes light the dark,
so that light becomes something we fight for.

> **EPIC 6 BRIEF** (`docs/epic-6-brief.md`), pasted verbatim. Every line applies; reviewers check each one.
>
> ```
> EPIC 6 BRIEF (from the Epic 4 retro's EPIC 5 BRIEF + Epic 6 specifics; reviewers: check each line)
> 1. Builders run in their own CLOUD SESSION (branch story-6-x, one container each; HANDOFF §3 Session 6 rules). Never `npm run dev` with fixed ports; assigned ports only; stop processes by PID. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current master. While building run only the touched areas' tests; ONE full gate at the end.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo (LocalSimHost), NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → fakeRoom → mirror → Predictor → devThrottle → snapshotWorld). Boss, events, vote and light state are server truth; the client only draws.
> 3. FAIRNESS RULE FIRST: each mechanic's player-visible rule is written in the story ACs before building, and each rule is a test.
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (the story's "Beat the rule" list is the start, not the end) and list every attempt and its result.
> 5. Cover: bullets stop at map cover (cars, bus, buildings, pumps, parking wall, dumpster), at every barricade tier and at Ruins rubble. Lobbed rounds (launcher, hand grenade, molotov) fly over everything except real buildings (`building: true`); rubble is NOT `building: true`. Spit, flames, blasts, acid, gas and fire zones: cars, the bus, buildings and rubble stop or shield them (clear line from the centre). Sandbags, police barriers, turrets and floor buildings (traps, mines) stop bodies only. Melee is stopped by barricades, shot-blocking map cover and rubble. Behemoth slam and throw IGNORE cover ("the drawn zone is the promise"); the gas-leak blast uses the normal blast line of sight. Server and the client's cosmetic copy agree; rewound (2.12) hits for players' shots only.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged. Boss hits resolve once, on the tick the telegraph ends.
> 7. Spatial code (rubble, breaches, the Behemoth body and charge, shoves, the survivor NPC, the helicopter pad, crate spots) gets a builder-written fuzz test: random layouts × every stage × variant × many ticks; no body inside a box, no stall, zombies and the boss reach a player, flow fields rebuild only at build start (the boss field is its own, on its own clock).
> 8. Randomness only from named seed streams (`decay` for variants/looks, `events` for event schedule/spots/weapons, `spawns`, `combat`); same seed + input log → same snapshotWorld digest, including boss and event state.
> 9. Liveness: every sim/replay/integration test asserts something really happened (all 10 waves played, the boss spawned/attacked/crashed/died, each event triggered, a vote resolved, ≥ 1 endless wave). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks (1.2 s = 24 ticks); no per-tick/per-frame allocation (pool stamps, decals, markers, particles); every number in balance JSON (`waves.json`, `decay.json`, `boss.json`, `events.json`, …), no inline literals.
> 11. Bandwidth: telegraphs, event starts/ends and effects go out as reliable events (kind + start tick + fixed zone), not per-tick state; one boss record in the room state; report added B/s; total ≤ 30 KB/s per phone (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled and capped (max live decals/particles in balance JSON). The reference low-end phone is the Xiaomi Mi 11i (designer 2026-11-24; the Honor 10 is not a test phone). Run ?stress=150 with the story's effects active; report headless FPS before/after with load; the latest recorded ?stress=150 baseline in docs/perf/ is the floor.
> 13. Readability: every new object must read at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet (`docs/playtests/milestone-1/readability-sheet.md`).
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start AND across a boss telegraph / event start / vote, on a late Game scene start and a reconnect; client shows server truth (pending until state agrees).
> 15. Balance: earnings stay as built until the Epic 5 balance pass settles them; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 10-wave sim and assert all waves ended. Solo is "allowed, not tuned" and scales × 0.4 (Behemoth HP too).
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added server p99 ≤ 2 ms total budget for Epic 6 (boss field + events + vote).
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently (votes and pings are inputs to budget for).
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix, ?seed, the decay-stage cheat, new: force blackout, start at wave N, force event X, spawn Behemoth), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master. Each story goes to master as soon as its review (and re-reviews) is clean.
> 20. Every texture drawn in code is created through addGeneratedTexture with a redraw callback (Android Chrome wipes canvases while the app is in the background); test that it redraws after a simulated context loss (`tools/checks/noUnregisteredTextures.test.ts` must stay green). That includes the darkness texture, light stamps, boss atlas, decals, markers and dawn.
>
> EPIC 6 SPECIFICS
> 21. BOSS FAIRNESS (each is a test): (a) every danger zone (slam centre, charge lane + stop point, throw landing spot) is fixed when its telegraph starts; (b) the client draws the telegraph's progress from the server's start tick, never from when the message arrived, and the fill always ends on the hit; (c) edge grace 0.25 m: a hit lands only when the player's centre is 0.25 m inside the drawn edge; (d) boss hits use the player's newest server position, no rewind; (e) telegraph lengths never shorten (enrage, endless, player count); (f) one boss attack at a time, then recovery, then the per-player-count gap; (g) a downed player is never targeted or hit again.
> 22. CAP 110 WHILE THE BEHEMOTH LIVES: at most 110 zombies alive while it is alive (D6), back to 150 the tick it dies; the boss itself does not count; enrage Crawlers respect the cap; the stampede's +30 over-cap allowance is counted against the cap that applies.
> 23. EVENT FAIRNESS: every event announces itself (banner + sound + map marker above the darkness) before it can hurt anyone; the schedule comes only from the `events` stream (2 different events, 2 different waves of 3–8, never 5, never back-to-back); a lever (shoot the armed car, shoot the gas tank after 3 s) works the same for every player and credits whoever pulled it; only standing players take the crate or lead the survivor; the gas blast hurts every player in range in full (as Bloaters) and is shielded by the normal blast line of sight.
> 24. BLACKOUT READABILITY: darkness and fog vision can't be turned off (FR87); quality settings only change their look. Always above the darkness: teammates with rings, zombie eyes within 14 m (or the fog edge), the boss's outline and eyes, every boss telegraph, event markers, the crate, the survivor and the safe point, pings. Colour rule: red = boss danger only, amber = an event you can use, yellow-green = gas, white = pick-ups and people. No hot beam core, no lens flare; rain sparkles inside beams. Check at 568 × 320 and 800 × 360.
> 25. ENDLESS PERFORMANCE: nothing grows without a cap over 20+ endless waves (alive 150 / 110, wave size 600, Brutes ≤ 6 alive, decals, craters, markers, event records, kill logs); a 20-wave endless sim records server tick p99 and memory and asserts they stay flat; FPS recorded with blackout + fog + Behemoth + 150 zombies (`docs/perf/epic-6-blackout.md`).
> 26. LIGHT IS SERVER TRUTH: the light state (stage, blackout flag, power out, flicker seeds, build-phase half darkness) is part of the world and replays; a client that joins or wakes mid-wave draws the same darkness as everyone else; fog hides zombies only on the local screen, never in the sim (aim assist and turrets keep their own rules; aim assist never locks a target your screen hides).
> 27. DO NOT TOUCH EPIC 5 WORK IN PROGRESS: 5.13 card shop and 5.20–5.25 building UX are being built in other sessions (shop, build bar, carry/drag UI); Epic 6 changes there go through their balance flags (`inShop`) or a "Notes for the merge" line, not edits to their UI.
> 28. ONE RUN FLOW: the run phase machine (lobby → build → wave → … → vote → extract/endless → results) has one owner per change (6.1 removes the 6-wave ending, 6.11 adds the vote, 6.12 adds endless); every phase change is a tested transition, and Results always show (no stuck run).
> 29. HAND-BACK: when your branch is pushed and your full gate is green, send the main session a message (claude-code-remote send_message, session_id "@parent") with branch, commit, the master commit you merged, gate result with load, "Notes for the merge" and the "Not verified" list; then stop. Reviewers do the same with their findings. The main session archives each builder/reviewer session once its story is on master.
> 30. LATCH THE PAYLOAD WITH THE EDGE: every new edge input (vote, ping, lever, crate, survivor lead, any new button) snapshots its payload (aim, target, choice) on the tap frame together with the flag, in both LocalSimHost and NetSimHost (Epic 5: 5.12's throw used the next frame's aim). Test with 60 fps frames over 50 ms steps and under ?lag=150&jitter=20.
> 31. ONE HUD LAYOUT TEST: every on-screen control (incl. boss bar, vote panel, event banners, markers' screen-edge arrows) is in one layout test at 568×320 and 640×360 with insets 44/21: no overlaps, 48 px clearance round the survivor at the centre, nothing pressable in the move-stick half. Add new HUD to that test (6.3 creates it if it doesn't exist); don't check it story by story (Epic 5: six stories moved buttons around each other).
> 32. FRESH DECISIONS, MERGED TREE: before you build and before you review, read the decision-log lines newer than the story file (git log docs/epic-6-decisions.md docs/epic-5-decisions.md); a merged pair updates both story files. Merge current master before the final gate and review that merged commit (Epic 5: five merge-only bugs). Every push to master passes typecheck and lint, docs-only and art-only commits included.
> ```
>
> Most relevant here: **2** (two new synced light fields: World → schema → syncState → stateView → fakeRoom → mirror → devThrottle → snapshotWorld; the Predictor needs nothing), **10** (no allocation per frame in the darkness repaint: pooled stamps, no gradients created per frame), **12** (the darkness repaint is the single biggest new per-frame cost of Epic 6; measure on `?stress=150&blackout=5`), **18** (force-blackout switches), **20** (darkness canvas + stamps through `addGeneratedTexture` / the texture registry), **24** (what draws above the darkness, no hot core, can't be turned off), **26** (the blackout level is server truth and replays), **27** (the shop flags only: no edits to 5.13 / 5.16+ UI).

## Acceptance Criteria

### Fairness rules (player-visible; brief line 3; each is tested)

- **F1 "Everyone's dark is the same dark."** Whether a blackout is on, how dark it is (`blackoutPct`) and whether it is at half strength (`halfDark`) come from the server's World and replay with the run. Every phone in the room, a late joiner, a reconnect and a tab that woke up mid-wave draw the same darkness level on the next frame after the state arrives (no fade from the old level, no local guess).
- **F2 "You can always see what is biting you."** Every standing survivor (and every downed one) has a **1.6 m** glow round them, cut out of the darkness, whichever way they aim. A zombie touching you is always inside your glow (body radii ≤ 0.6 m + your 0.35 m < 1.6 m), so it is always drawn lit.
- **F3 "Your flashlight points where you aim, and everyone sees it."** In a blackout every standing survivor's flashlight is on, free: a **60°, 8 m** cone along their facing; the **Tactical flashlight** (gear bit) makes it **80°, 12 m**. Teammates' cones are drawn on your screen too, along their drawn facing. The cut-out shape on screen is exactly the cone `inFlashlightCone` reports (6.4's fog uses the same function, so "I see it in my beam" and "the fog shows it in my beam" never disagree).
- **F4 "Eyes give the dark away."** Every zombie within **14 m** of your survivor shows two eyes above the darkness, lit or not (6.4 may shrink this to the fog edge). Beyond 14 m an unlit zombie is not drawn on top of the darkness (it stays under it).
- **F5 "Your team never disappears."** Teammates (body, slot ring, name) are drawn above the darkness at every distance on screen; the off-screen teammate arrows (2.9) are unchanged.
- **F6 "The dark can't be switched off."** No setting, URL option or quality level (`?fx=low` included) removes or lightens the darkness or shrinks it; quality only changes its look (rain sparkles, edge softness). A test asserts the darkness alpha is the same with `lowFx` on and off.
- **F7 "A light is as big as it is drawn."** In a blackout a floodlight lights **6 m** (D5; `buildings.json › floodlight.light.blackoutRadiusM`), a burning car's fire **4 m**, a muzzle flash **3 m for 100 ms**; the cut-out drawn is that radius (tested on the stamp sizes), and the floodlight's existing additive pool grows to the same 6 m.
- **F8 "Darkness only hides; it never changes a hit."** Zombie AI, turrets, aim assist, bullets, blasts and damage behave exactly as with the lights on (the sim reads no light state for gameplay). Test: a seeded wave run with `blackoutPct` 5 and with 0 gives the same `snapshotWorld` digest except the light fields.
- **F9 "No blackout, no cost."** With `blackoutPct` 0 the darkness image is hidden, never repainted and never re-uploaded; no beam, eye or sparkle object is visible or updated.

### Behaviour

1. **Light state (server truth, brief 26).** `LightState` (`packages/shared/src/decay/lightState.ts`) gains two **synced** fields beside its derived list:
   - `blackoutPct: number` — 0 = no blackout; 1–100 = the light (percent of normal) unlit ground keeps.
   - `halfDark: boolean` — true = the darkness is drawn at half strength (6.4: build phases at stage 5).
   - plus `powerFailure: boolean` (server/solo, set by 6.10; in `snapshotWorld`, not synced: the client sees its effect through `blackoutPct`) and `forcedPct: number` (dev only, −1 = off).
   - Helpers (shared, pure, no allocation): `isBlackout(world)`, `darknessAlpha(world)` = `(1 − blackoutPct / 100) × (halfDark ? halfDarkK : 1)` (0 when off), `lightRadiusOf(world, l)` (= `l.blackoutRadiusM` during a blackout, else `l.radiusM`), `flashlightOf(balance, gearMask)` → `{ cosHalf, rangeM, halfAngleRad }` (cached per balance), `inFlashlightCone(px, py, facingX, facingY, cone, x, y)` (dot-product test, no trig per call).
2. **Who sets it: one function.** `refreshBlackout(world)` (shared) computes `blackoutPct` and `halfDark` from the World and is called at the end of `startBuild`, in `startWave`, when the run ends (→ 0), and by any mid-wave change (6.10's power failure). Order of rules: dev `forcedPct` ≥ 0 → that; else a wave whose `lightPctByWave` entry is > 0 → it (6.4 fills waves 9–10, 6.12 adds the endless rule); else `powerFailure` during a wave → `powerFailureLightPct`; else 0. `halfDark` = in a build phase AND the coming or last wave's entry is > 0 (6.4 turns this on via `blackout.halfDarkInBuild`; 6.3 ships it `false`). 6.3 ships every `lightPctByWave` entry as **0** (no live blackout yet in a normal run; 6.4/6.10/6.12 switch them on), so this story can merge before them without changing a normal run.
3. **Balance (`decay.json › blackout`, new, schema with defaults):** `lightPctByWave` `[0,0,0,0,0,0,0,0,0,0]` (index = wave − 1; 6.4 sets `[0,0,0,0,0,0,0,0,10,5]`: wave 9 → 10, wave 10 → 5), `powerFailureLightPct` **20**, `endlessLightPct` **5** (6.12 reads it), `halfDarkK` **0.5**, `halfDarkInBuild` `false` (6.4 sets `true`), `glowM` **1.6**, `fireLightM` **4**, `muzzleLightM` **3**, `muzzleLightS` **0.1**, `turretMuzzleLight` `true`, `flameLightM` **3**, `explosionLightM` **5**, `explosionLightS` **0.15**, `molotovLight` `true`, `eyesM` **14**, `maxStamps` **48**, `maxEyes` **150**, `maxSparkles` **160**. `player.json › flashlight { coneDeg: 60, rangeM: 8 }`; `gear.json › tactical_flashlight` gains `coneDeg: 80, rangeM: 12`. The schedule from the designer's look pick (20 % power failure, 10 % wave 9, 5 % wave 10 and every endless blackout) lives in these keys; the darkness colour per level is a look (client palette, behaviour 7).
4. **Light sources in a blackout.** `updateLightState` sets each fire's `blackoutRadiusM` to `blackout.fireLightM` (4 m; today it copies the 2 m zone radius). Molotov fire zones (5.12, `world.molotovs`) light their own zone radius (3 m) while they burn (D4; drawn from the client's molotov view, not added to the derived list). Floodlights use `light.blackoutRadiusM` (6 m) through `lightRadiusOf`. Muzzle flashes: every `weapon.fired` (players, also teammates' through the existing events) and `turret.fired` lights **3 m for 0.1 s** at the muzzle; flame weapons while firing light **3 m** along the jet; explosions (`explosion.happened` events, 5.5/5.8/5.9) flash **5 m for 0.15 s**.
5. **Darkness layer (client, `DarknessView`).** One canvas at **half the game canvas resolution** (the game canvas is device px with DPR capped at `MAX_DPR`), covering the camera view, created with `addGeneratedTexture` (key `fx_darkness`, its paint = the current frame's darkness, so a context loss repaints it). While `isBlackout`: once per frame fill it with the level's dark colour at `darknessAlpha`, then erase (`destination-out`) the light stamps for: every standing/downed survivor's 1.6 m glow, every standing survivor's flashlight cone, every light in `lightsOf(world)` at `lightRadiusOf`, live molotov zones, live muzzle/explosion flashes; then `tex.refresh()`. Stamps are pre-drawn soft-edged canvases (disc, 60° cone, 80° cone; one soft and one hard-edged set) drawn with `drawImage` + `setTransform` (no `createRadialGradient`, no `filter: blur` per frame), at most `maxStamps` per frame (nearest the camera centre first; your own glow and cone are never dropped). Depth **`DARKNESS_DEPTH` 11.7**: above every world object and effect drawn today (≤ 11.62), below rain (11.8), the vignette (11.9) and the build UI (≥ 12).
6. **Above the darkness (the API 6.4–6.10 use).** `render/darkness/aboveDark.ts` exports `DARKNESS_DEPTH` and `ABOVE_DARK` — named depth slots between the darkness and the rain: `sparkle 11.705`, `eyes 11.71`, `boss 11.72`, `telegraph 11.73`, `teammate 11.74`, `pickup 11.75`, `marker 11.76`, `ping 11.77` — and `aboveDarkness(obj, slot)` (sets the depth; a view calls it once when it creates its objects, or switches with `blackoutChanged`). This story uses `eyes`, `teammate`, `sparkle`; 6.5–6.10 put their boss body outline/eyes, telegraphs, event markers, crate, survivor NPC and safe point in their slots (rule: a view that must read in the dark draws in a slot; nothing else goes above 11.7). Pings (8.7) use `ping`.
7. **Look (from the picks; `docs/epic-6-decisions.md` › 3 Blackout and 3 Beams).** Darkness colour per level in `render/city/palette.ts › DARK_LOOKS`: **20 % = BL2 "moonlit"** (`6,12,30`, cold blue cast, soft beam edges), **10 % = BL1 spec** (`4,6,12`, soft edges), **5 % = BL3 "pitch"** (`2,2,4`, **crisp beam edges**: the hard stamp set). A faint warm additive tint on top of each cut-out (fire `255,120,45`, floodlight `255,236,200`, flashlight `255,240,210` at ≤ 0.1 alpha, as in `looks.html`). **Rain sparkles (from BL4) inside every beam and floodlight pool** (`BeamSparkleView`: pooled additive streaks, ≤ `maxSparkles`, depth `ABOVE_DARK.sparkle`; `?fx=low` halves them). **No bright hot core down the beam, no lens flare.** The normal rain (CityView) is dimmed to 35 % alpha in a blackout (it stays visible but faint over the dark). Baked streetlight pools and shop glow are simply covered by the darkness (a blackout means the power is out; 6.4/6.10 own the bake of dead lamps).
8. **Eyes (`EyesView`).** For each drawn zombie within `eyesM` of the local survivor (6.4 may pass a smaller fog radius), two pale dots (`236,226,150`, alpha 0.9) at its head along its drawn facing, pooled images of one FX-atlas frame `fx_eyes_a` (≤ `maxEyes`), depth `ABOVE_DARK.eyes`, only while `isBlackout`. Brute eyes larger (`fx_eyes_brute`); 6.5 adds the Behemoth's (red when enraged).
9. **Teammates above the darkness.** While `isBlackout`, `PlayerView` moves every survivor's body, ring and name to `ABOVE_DARK.teammate` (one `setDepth` per view on the change, not per frame); back to their normal depths when it ends.
10. **Floodlight pool.** `FloodlightView` sizes each pool from `lightRadiusOf` (6 m in a blackout) and keeps its additive warmth; its strength `floodA` unchanged.
11. **Shop from wave 1 (balance flags only, brief 27).** `buildings.json › floodlight.inShop` and `gear.json › tactical_flashlight.inShop` become `true`: the Floodlight shows as a build-bar tile (5.16) and the Tactical flashlight can be bought/drawn as a gear card (5.11 / 5.13), from the first build phase. No edits to the shop or build-bar UI code; tests that asserted "not for sale" are updated to the new truth (and the `not_for_sale` path keeps a test with a balance that has `inShop: false`).
12. **No off switch (FR87).** Nothing in `settings.ts`, `urlOptions.ts` or the in-run menu turns darkness off or lightens it.
13. **Dev switches (brief 18).** Solo cheat panel: "Force blackout: off / 20 / 10 / 5 %" (sets `forcedPct` + `refreshBlackout`, any phase); URL `?blackout=20|10|5` (solo, release-safe like `?fx=low`, so `?stress=150&blackout=5` measures FPS); server `DEV_FORCE_BLACKOUT=5` (dev servers only, read per run like `DEV_DECAY_STAGES`).
14. **Perf record.** `docs/perf/epic-6-blackout.md`: headless `?stress=150` vs `?stress=150&blackout=5` (FPS, frame ms p95, load) and a filled form for the Mi 11i and one 2021 mid-range phone (the designer's friends fill the phone rows; the doc says so plainly until then).

## Tasks / Subtasks

- [x] **T0 Art (from the picks; no new pick needed).** Port from `docs/art/epic-6/src/main1.js › darkness / warmLight` and `main2.js › makeBlackoutCard / rainInLight / eyes`: the three darkness looks BL2 / BL1 / BL3 by level, soft + hard stamp sets, warm tints, BL4's rain-in-light streaks (without the hot core and the lens flare: drop the linear-gradient core stroke and `blueSpr`), the eyes. All drawn in game code: the darkness canvas and every stamp canvas go through `addGeneratedTexture` / the texture registry (brief 20); the eye frames go into the FX atlas (`spriteAtlas.ts`, `category_name_variant`, atlas ≤ 2048²: `atlasLayout.test.ts`). Screenshot at 568 × 320 and 800 × 360 for each level for the designer (AC 7).
- [x] **T1 Shared light state** (AC 1–4; F1, F7, F8)
  - [x] `decay/lightState.ts`: `blackoutPct`, `halfDark`, `powerFailure`, `forcedPct`; `isBlackout`, `darknessAlpha`, `lightRadiusOf`, `refreshBlackout`, `setForcedBlackout(world, pct)`; fire `blackoutRadiusM` = `blackout.fireLightM`. Update the file header (the list stays derived; the four flags are state).
  - [x] `player/flashlight.ts` (new): `flashlightOf(balance, gearMask)` (cached per balance via `WeakMap`, reads `player.json › flashlight` and the gear item's `coneDeg`/`rangeM`, the widest owned wins), `inFlashlightCone(...)`. Export both from `index.ts` (6.4 uses them).
  - [x] `config/balanceSchema.ts`: `decay.blackout` (all keys of AC 3, with defaults), `player.flashlight`, gear item `coneDeg`/`rangeM` (optional, ≥ 0); `balance.ts › crossCheck`: `lightPctByWave` entries 0–100, `glowM` > every zombie radius + player radius (F2: 1.6 > 0.6 + 0.35; and 6.5's 2 m Behemoth is outside this check: it has its own outline).
  - [x] `run/runStateMachine.ts`: call `refreshBlackout` at the end of `startBuild`, in `startWave`, and on the way to Results (→ 0).
  - [x] Tests `decay/lightState.test.ts` (+ `refreshBlackout rule order`, `table 0 → no blackout`, `forced wins`, `powerFailure only in a wave`, `halfDark only in a build phase`, `darknessAlpha 5 % → 0.95, half → 0.475`, `lightRadiusOf 4 ↔ 6 m`, `fire lights 4 m in a blackout`), `player/flashlight.test.ts` (`60°/8 m`, `tactical 80°/12 m`, `edge: 29.9° in, 30.1° out`, `8.0 m in, 8.01 m out`), `core/determinism.test.ts` (+ F8 digest test).
- [x] **T2 Wire and copies** (AC 1; brief 2, 14, 26)
  - [x] Schema `RunState.blackoutPct` (uint8), `halfDark` (boolean), appended last; `syncState` (on change only), `resetRunFields`; `RUN_STATE_FIELDS` (`net/stateView.ts`); `fakeRoom.ts`; devThrottle key list (automatic from `RUN_STATE_FIELDS`: check); `NetSimHost` mirror sets `world.lights.blackoutPct/halfDark` from the state on every patch (beside `mirrorDecay`); `snapshotWorld` gains `lights: { blackoutPct, halfDark, powerFailure, forcedPct }` (update its "lights not here on purpose" comment: the list stays out).
  - [x] Predictor: nothing (no gameplay effect: F8). Say so in the copies list.
  - [x] Server: `DEV_FORCE_BLACKOUT` (`apps/server/src/run/devForceBlackout.ts`, the `devDecayStages.ts` pattern + test; ignored in production with a logged reason).
  - [x] Tests `syncState.test.ts` (+ `blackout fields on change only, ≤ 3 B, reset`), `NetSimHost.blackout.test.ts` (new: `mirror follows the state`, `late join draws the current level`, `a state that jumped across a wave start (hidden tab) gives the new level at once`).
- [x] **T3 Darkness layer** (AC 5, 7; F2, F3, F6, F7, F9)
  - [x] `render/darkness/aboveDark.ts` (depth constants + `aboveDarkness`), `render/darkness/lightStamps.ts` (stamp canvases: disc, cone 60°, cone 80°, soft + hard; registered with the texture registry for repaint, phase `cache`), `render/darkness/DarknessView.ts` (the canvas via `addGeneratedTexture`, positioned on the camera view every frame; repaint only while `isBlackout`; hidden and idle otherwise).
  - [x] Pure helper `render/darkness/darknessPlan.ts`: from the World + drawn player positions/facings + camera view → a preallocated stamp list (kind, x, y, angle, size) capped at `maxStamps`, own light first. Unit-tested in node (no Phaser).
  - [x] Flash lights: a small pooled ring buffer of live flashes fed from `FxView` (`weapon.fired`, `turret.fired`, explosion events) and the flame views (5.4) while a jet fires; ages by the frame clock (paused-aware).
  - [x] `render/city/palette.ts › DARK_LOOKS` (by level: colour, edge set, tint alphas); `CityView`: rain alpha × 0.35 while `isBlackout` (one compare per frame).
  - [x] Tests: `darknessPlan.test.ts` (`own glow and cone always kept at the cap`, `teammate cone along its facing`, `downed: glow only (D3)`, `out: nothing`, `floodlight 6 m`, `fire 4 m`, `muzzle 3 m gone after 0.1 s`, `no stamps when blackout is off`), `darknessView.test.ts` with the `testScene.ts` helper (`F6: alpha equal with lowFx`, `F9: no refresh call while off`), `textureRegistry` repaint test for `fx_darkness` and the stamps (brief 20), `noUnregisteredTextures.test.ts` green.
- [x] **T4 Eyes, teammates, sparkles, floodlight** (AC 6, 8–10; F4, F5)
  - [x] `render/darkness/EyesView.ts` (pool ≤ `maxEyes`, reads `ZombieView`'s drawn positions/facings, within `eyesM`), `render/darkness/BeamSparkleView.ts` (pool ≤ `maxSparkles`, positions hashed inside each drawn cone/pool like `rainInLight`, `?fx=low` half), `PlayerView` depth switch, `FloodlightView` size from `lightRadiusOf`.
  - [x] Tests: `eyes within 14 m only`, `eyes hidden when blackout off`, `teammate depth above DARKNESS_DEPTH in a blackout and back after`, `floodlight pool 12 m across in a blackout`, `sparkles ≤ cap; half with lowFx`.
- [x] **T5 Shop flags** (AC 11; brief 27)
  - [x] `buildings.json › floodlight.inShop: true`, `gear.json › tactical_flashlight.inShop: true`. Update tests that assumed "hidden": `buildings.test.ts`, `economy/shop.test.ts`, `buildBar.test.ts`, `botShop` tests, `RunRoom.shop.test.ts`, `devShopAll.test.ts` (keep the dev switch working for any future `inShop: false` item, tested with a test balance). Check `botShop.ts`: bots may now buy the flashlight/floodlight (fine; record it in the sim output).
  - [x] Card shop (5.13, if merged): no code change; its pool reads `inShop` (add a test line there only if 5.13 is already on master; else a merge note).
- [x] **T6 Dev switches and perf** (AC 13, 14; brief 12, 16, 18)
  - [x] Cheat panel control (`DevCheats.tsx` + `devCheatActions.ts › setForcedBlackoutCheat`, solo only, any phase), `urlOptions.ts › blackoutPct` (`?blackout=20|10|5`, solo), applied in `GameScene` create for solo and in `stressScenario.ts`.
  - [x] Headless `?stress=150` vs `?stress=150&blackout=5` (and `&fx=low`): FPS before/after with machine load; per-frame cost of the repaint (ms, from the perf overlay); write `docs/perf/epic-6-blackout.md` with empty phone rows (Mi 11i + a 2021 mid-range phone) and the "how to fill" steps.
  - [x] Fallback if the headless drop is > 15 % at `?stress=150&blackout=5`: darkness canvas at a quarter of the game canvas (DD2), stamps cap 32; record which one shipped.
- [x] **T7 Readability sheet.** Add "a blackout wave: eyes, a teammate's beam, a floodlight pool, a burning car" to `docs/playtests/milestone-1/readability-sheet.md` (+ key) (brief 13).
- [x] **T8 Gates.** Mutations, each must fail a test (list which): `refreshBlackout` not called in `startWave`; `halfDarkK` ignored; floodlight uses `radiusM` in a blackout; cone uses 30° full angle instead of half; own glow droppable at the stamp cap; `lowFx` lowers alpha; darkness repainted while off; teammate depth not restored; `blackoutPct` not mirrored. Browser check (Playwright, own ports): solo `?blackout=5`, `?blackout=20`, `?blackout=10&fx=low`; online two tabs with `DEV_FORCE_BLACKOUT=5` and `?lag=150&jitter=20` (both tabs same level, teammate beam visible, eyes, floodlight with `?shopall=1` not needed any more); a hidden tab (`window.__game.loop.sleep()/wake()`) across a build start; a simulated context loss (`textureRegistry` rebuild) during a blackout: darkness still drawn; 568 × 320 and 800 × 360 screenshots. `npm run typecheck && npm run lint && npm test && npm run build`. Merge notes.

## Dev Notes

### Designer decisions to confirm (made non-interactively; recommended values)

1. **6.3 D1 ★ How dark a blackout is (from your look pick).** Recommended: **20 % light ("moonlit", blue) for a power-failure wave (waves 6–8), 10 % in wave 9, 5 % ("pitch", crisp beam edges) in wave 10 and every endless blackout.** Alternative: the old story text, a flat 10 % everywhere. (Your pick replaces the epics' "10 %" line.)
2. **6.3 D2 ★ Build phases at stage 5 are half as dark as the wave.** Recommended: **half the darkness** (after wave 10's 5 % that is about 52 % light: you plan in dim moonlight). Alternative: build phases fully lit. (6.4 switches it on; the number lives here.)
3. **6.3 D3 ★ A downed survivor's light.** Recommended: **flashlight off, the 1.6 m glow stays** (teammates can find you; the downed marker is unchanged). An "out" survivor gives no light. Alternative: a downed survivor keeps the flashlight on, pointing where they fell.
4. **6.3 D4 Extra light sources beyond the GDD list.** Recommended: **yes**: flamethrower/gas torch jets light 3 m while firing, explosions flash 5 m for 0.15 s, molotov fires light their 3 m zone, turret muzzle flashes light 3 m like players'. Alternative: only flashlights, floodlights, car fires and player muzzle flashes.
5. **6.3 D5 Zombie eyes.** Recommended: **two pale yellow dots on every zombie within 14 m, bigger on a Brute**, always above the dark (the Behemoth's go red when enraged: 6.5). Alternative: eyes only on zombies facing you.
6. **6.3 D6 Teammates in the dark.** Recommended: **body, ring and name always drawn above the darkness** (you always know where your friends are). Alternative: only their ring above the dark.
7. **6.3 D7 Rain in a blackout.** Recommended: **normal rain dimmed to 35 %, rain sparkles inside every beam and floodlight pool (from BL4), no hot core, no lens flare** (your pick). `?fx=low` halves the sparkles only.
8. **6.3 D8 Floodlight and Tactical flashlight in the shop from wave 1** (as the story says, prices unchanged: Floodlight 100, Tactical flashlight 120). Recommended: **yes**. Alternative: only from wave 6.
9. **6.3 D9 Your flashlight outside a blackout.** Recommended: **not drawn** (no cost, the street lights are on). Alternative: a faint beam always.
10. **6.3 D10 Darkness changes nothing in the fight itself.** Recommended: **yes, only what you see**: zombies, turrets and aim assist work as in the light (fair, and the same on every phone). Alternative (architecture idea "turrets only target lit zombies"): left for later.

### Decisions (developer guidance)

- **DD1 Canvas darkness, not a RenderTexture.** `tools/checks/noUnregisteredTextures.test.ts` forbids `RenderTexture` / `DynamicTexture` (Story 4.13: Android wipes GPU textures; only canvases the registry repaints survive). So: a 2D canvas through `addGeneratedTexture`, repainted per frame while on, `tex.refresh()` (re-upload). This is the method the looks page already uses (`docs/art/epic-6/src/main1.js › darkness`). Phaser 4 filters/masks (GPU only) are an option only if T6 shows the upload too slow — verify the API in `node_modules/phaser/types` first (brief 17) and keep the registry rule.
- **DD2 Resolution.** Half the game canvas (architecture › Performance: "darkness texture at half resolution"); the game canvas is device px with DPR capped (`main.ts`, `display.ts › MAX_DPR` 2): a Mi 11i landscape (~873 × 393 CSS px) gives ~873 × 393 darkness px (~1.4 MB upload per frame). Fallback quarter resolution (T6) if needed; linear filtering keeps edges smooth; the hard (BL3) edge set is drawn 1 px sharper to compensate.
- **DD3 No allocation per frame.** Stamps are pre-drawn canvases (made once, repainted by the registry); per frame only `fillRect`, `drawImage`, `setTransform`, `globalCompositeOperation`. No `createRadialGradient`, no `filter`, no closures, no arrays (the stamp plan is a preallocated `Float32Array` ring).
- **DD4 One rule function.** `refreshBlackout` is the only writer of `blackoutPct` / `halfDark` (6.4, 6.10, 6.12 change its inputs: the table, `powerFailure`, the endless rule), so the rule order is tested once and the client never computes a level itself.
- **DD5 Cones from the drawn facing.** The beam follows the `PlayerView`'s drawn rotation (predicted for me, interpolated for teammates: `heading` uint8 on the wire, 1.4° steps), so it never lags the drawn body. The shared `inFlashlightCone` takes a facing vector and the cached `cosHalf` (6.4's fog check uses it with the same inputs on the local screen).
- **DD6 Light list stays derived.** Do not sync `world.lights.list`; only the four flags are state (two synced). `lightsOf(world)` stays the reader (5.10 review L2).
- **DD7 Depth band.** Everything that must read in the dark lives in 11.7–11.8 (below the rain 11.8 and vignette 11.9; the building UI at ≥ 12 is already above). Today's highest world depths are 11.6–11.62 (embers, lobbed rounds' air marks): all under the darkness, as they should be.

### Current state (read before changing)

- `packages/shared/src/decay/lightState.ts` (Story 5.10): `LightSource { kind: "floodlight" | "fire", x, y, radiusM, blackoutRadiusM, buildingId }`, `LightState { list, buildingsVersion, firesKey, firesCount, rebuilds, pool }`, `updateLightState(world)` (rebuilds on `buildings.version` / fire-set change, no allocation after warm-up), `lightsOf(world)`. Header: "No blackout flag yet: Story 6.3 adds it and reads this list." Fires get `blackoutRadiusM = f.radiusM` (2 m) today.
- `core/world.ts`: `lights: createLightState()` ("derived"); `core/worldSnapshot.ts`: lights deliberately not in the snapshot.
- `decay/applyDecayStage.ts` calls `updateLightState` after a stage change; `decay/decayState.ts › stageForWave`; `decay.json › stageByWave [1,1,2,2,3,3,4,4,5,5]`.
- `run/runStateMachine.ts`: `startBuild` (decay mutate, clears acid/grenades/molotovs/blasts, `build.started`), `startWave` (`beginWave`), `endWave` (→ build or Results after `runWaves`).
- `buildings.json › floodlight { price 100, hp 150, inShop: false, light { radiusM 4, blackoutRadiusM 6 } }`; `buildings.ts › placementError` returns `"not_for_sale"` for `!stats.inShop`; `economy/shop.ts` skips `inShop === false`; `gear.json › tactical_flashlight { price 120, inShop: false }`; `economy/gear.ts` (bitmask `PlayerState.gear`, `ownsGear`, "Tactical flashlight: only the bit (Story 6.3's blackout cone)"); `config/devBalance.ts` (`DEV_SHOP_ALL` / `?shopall=1` sets every `inShop` true); `apps/server/src/run/devShopAll.ts`.
- Client: `render/city/palette.ts › NightLight` / `NIGHT_BY_STAGE` (stages 4–5 are "darker placeholders until Epic 6"), `nightAt`; `render/city/CityView.ts` (static light baked into the tiles at a stage change: `drawLightmap`/`drawGlow`; pooled flicker/blinker glows at depth 4.32; rain pool 128 at 11.8, vignette 11.9; `?fx=low` → `lowFx`); `render/FloodlightView.ts` (≤ `controls.fx.maxFloodLights` ADD pools, size `2 × l.radiusM`, alpha `floodA`, depth 4.32, "no render texture, no full-screen layer"); `render/FxView.ts` (`weapon.fired` → `muzzle()`, 50 ms tween, `turret.fired`); `render/PlayerView.ts` (ring, body depth 10, rotation from `facingX/Y`); `render/ZombieView.ts` (per-type `LOOKS` depth); `render/city/canvasTexture.ts › addGeneratedTexture(scene, key, canvas, paint, addFrames?, phase)`; `render/gfx/textureRegistry.ts` (`RebuildPhase.cache/atlas/bake/text`); `tools/checks/noUnregisteredTextures.test.ts` (forbids RenderTexture/DynamicTexture/addCanvas outside canvasTexture.ts and CityView.ts).
- Wire: `apps/server/src/rooms/schema/RunState.ts` (`decayStage`, `decayVariants`, `decayFiresOut` written on change), `syncState.ts`, `packages/shared/src/net/stateView.ts › RUN_STATE_FIELDS`, `apps/client/src/net/fakeRoom.ts`, `net/devThrottle.ts` (keys from `RUN_STATE_FIELDS`), `sim/NetSimHost.ts` (`mirrorDecay(...)` on each patch), `net/prediction.ts` (`syncDecay`).
- Dev: `debug/DevCheats.tsx` (decay-stage select, solo only), `debug/devCheatActions.ts`, `debug/urlOptions.ts` (`lowFx`), `debug/stressScenario.ts`, `apps/server/src/run/devDecayStages.ts`.
- No darkness, eyes, beam or "above the darkness" code exists yet.

### Must be preserved

Normal (non-blackout) look and cost bit-for-bit (F9: no new per-frame work when off); the 4.9 baked light and contrast tests (`palette.test.ts`); 5.10's floodlight pools outside a blackout (4 m); `lightsOf` read rule; 4.13 repaint after a context loss; the `not_for_sale` refusal path (still tested with a test balance); prediction = server (no Predictor change); the decay-stage cheat; `?fx=low` behaviour of fires; every existing depth order below 11.7.

### Copies touched (brief 2)

World (`lights.blackoutPct`, `halfDark`, `powerFailure`, `forcedPct`) → schema (`RunState.blackoutPct` uint8, `halfDark` boolean) → `syncState` (+ `resetRunFields`) → `RUN_STATE_FIELDS` → `fakeRoom` → devThrottle (key list, automatic) → mirror (`NetSimHost` sets the two synced fields; `powerFailure`/`forcedPct` are server/solo only) → Predictor (**none**: no gameplay effect) → `snapshotWorld` (all four).

### Beat the rule (for the reviewer; brief 4)

1. Look for any way to lighten the dark: settings, `?fx=low`, `?debug=1`, a phone's brightness aside — browser zoom, resizing the window mid-wave (does the canvas re-size and keep the alpha?), switching tabs.
2. Aim your flashlight at a zombie 8.0 m away exactly on the 30° edge: drawn lit? Does `inFlashlightCone` agree?
3. Stand with your back to a zombie biting you: is it always inside your 1.6 m glow? With a Brute (0.6 m)?
4. Two phones, `?lag=150&jitter=20`: same darkness, same teammate beam direction (within the 1.4° heading step), same floodlight size?
5. Hide a tab during a build start into a blackout wave, wake it mid-wave: dark at once? Wake it after the blackout ended: light at once?
6. Put 8 floodlights, 2 car fires, 4 flamethrowers and an SMG strobe on screen: what is dropped at the stamp cap — never your own glow or cone?
7. Context loss (app switch on Android, or the registry's simulated loss) mid-blackout: is the darkness still drawn (not a fully lit screen = a cheat by app-switching)?
8. Do zombies, turrets or aim assist behave differently in the dark (they must not: F8)? Compare digests.
9. Downed in the dark: is your glow still there, your flashlight off (D3)? Out: no light at all?
10. Buy the Tactical flashlight in wave 1: does it change anything before a blackout (it must not, D9)?
11. Find any object drawn above the darkness that should not be (a zombie body beyond 14 m, a puddle, blood) — reveals information.

### Bandwidth (brief 11)

Two RunState fields written only on change (a blackout starting or ending, a build phase going half dark): ~3 B per change, a few times per run. No per-tick bytes. Everything else is client-side from existing state/events.

### Phone FPS / Perf (brief 12, 16)

The new cost is client-only and only during a blackout: one half-res canvas fill + ≤ 48 stamp `drawImage` + one texture upload per frame, ≤ 150 eye images, ≤ 160 sparkle images. Measure `?stress=150` vs `?stress=150&blackout=5` headless with load; target ≤ 15 % drop headless, else the quarter-resolution fallback (T6). No server cost (one function at phase changes). Record in `docs/perf/epic-6-blackout.md`; phone rows (Mi 11i) are the designer's friends' job (say so).

### Art

From `docs/epic-6-decisions.md` › 3 Blackout: **BL3 pitch 5 %** with **BL2 moonlit 20 %** kept, getting darker through the run (20 % → 10 % → 5 %); › 3 Beams: **rain streaks sparkling inside every beam and the floodlight pool (BL4)**, **no bright hot core, no lens flare**; floodlight 6 m in blackout (D5). Code: `docs/art/epic-6/looks.html` (section 3), sources `docs/art/epic-6/src/main1.js` (`darkness`, `warmLight`, `beamLight`) and `main2.js` (`makeBlackoutCard`, `rainInLight`, `eyes`, `inCone`); screenshots `docs/art/epic-6/ingame/bl-1240.png`, `bl-390.png`. All art is game code through `addGeneratedTexture` (brief 20). The BL1 (10 %) look is used for wave 9 as the middle step of your "getting darker" pick.

### Dependencies

- **Epic 5 (done):** 5.10 (light list, floodlight `light.blackoutRadiusM`, `inShop`), 5.11 (gear bit, flashlight `inShop`), 5.4 flame views, 5.5/5.8/5.9 explosion events, 5.12 molotov zones, 4.13 registry. **5.13 card shop (in progress elsewhere):** reads `inShop`; no edit here (brief 27). **5.16 build bar:** shows the floodlight once `inShop` is true; no edit here.
- **6.4 Collapse** needs this story: it fills `blackout.lightPctByWave` (waves 9–10), sets `halfDarkInBuild`, and its fog uses `inFlashlightCone` / `flashlightOf` and passes a fog radius to `EyesView`.
- **6.5–6.7 Behemoth, 6.8–6.10 events** draw their markers/telegraphs/NPCs in `ABOVE_DARK` slots; they can be built before 6.3 lands if they use the exported depth constants (land 6.3's `aboveDark.ts` first, or copy the constants and switch at merge).
- **6.10 Power failure** sets `world.lights.powerFailure = true` and calls `refreshBlackout` (its lamp flicker 2 s first); cleared at `startBuild`.
- **6.12 Endless** adds the odd-wave rule inside `refreshBlackout` (reads `endlessLightPct`).
- **6.2 Ruins** (flicker) touches `CityView`'s lamp animation; no overlap with the darkness layer except `CityView.ts` (rain alpha one line here).

### Notes for the merge (brief 19)

- `decay/lightState.ts`: this story adds the flags and `refreshBlackout`; 6.10 sets `powerFailure`; 6.12 adds one rule branch (keep the rule order tested in one table test).
- `config/balance/decay.json` / `balanceSchema.ts`: `decay.blackout` block is new; 6.2/6.4 add stage 4–5 keys beside it (different keys); 6.4 changes only `lightPctByWave` and `halfDarkInBuild` values.
- `run/runStateMachine.ts`: one `refreshBlackout` line in `startBuild`, `startWave` and the Results path; 6.1 (removes the 6-wave ending), 6.11 (vote) and 6.12 (endless) touch the same functions: keep the call at the end of each transition.
- `RunState.ts` / `syncState.ts` / `stateView.ts` / `fakeRoom.ts`: append `blackoutPct`, `halfDark` last; 6.5 (boss record), 6.8 (events), 6.11 (vote) append their own fields: order by merge.
- `NetSimHost.ts`: one mirror line beside `mirrorDecay`; 6.5/6.8/6.11 add theirs.
- `GameScene.ts`: creates `DarknessView`, `EyesView`, `BeamSparkleView` after `FloodlightView` and updates them after `syncPlayerViews` (they read drawn positions); 6.4–6.11 add views in the same block.
- `PlayerView.ts`: depth switch only (5.15/5.19 ghost/carry code nearby: no overlap in lines expected).
- `CityView.ts`: rain alpha line only; 6.2 (flicker) and 6.4 (dead grid, fog bank) change the lamp/bake code.
- `palette.ts`: `DARK_LOOKS` new; 6.2/6.4 retune `NIGHT_BY_STAGE` rows 4–5 (different lines).
- `buildings.json` / `gear.json`: `inShop` true; if 5.13 or 5.20–5.25 changed nearby lines, keep both.
- `spriteAtlas.ts`: eye frames appended to the FX atlas; 6.5 adds the boss atlas separately.

### Suggested build round

**Round 1 of Epic 6, in parallel with 6.1 (waves 7–10), 6.2 (Ruins) and 6.5 (Behemoth arrives)** — file overlap is small: `runStateMachine.ts` (one line, with 6.1), `CityView.ts` (rain line, with 6.2), `RunState`/`syncState`/`NetSimHost` append-only (with 6.5). Merge 6.3 **before 6.4** (Collapse), **6.10** (power failure) and **6.12** (endless), which build on `refreshBlackout`, `inFlashlightCone` and `ABOVE_DARK`. Land `render/darkness/aboveDark.ts` early (or first) so 6.5–6.10 use the same slots.

### References

- `epics.md` › Epic 6 › Story 6.3 (FR64, FR87); GDD › Art (Lighting, Effects), Performance (frame rate on wave 9 blackout, quality settings: blackout darkness cannot be turned off), Gear (Tactical flashlight), Buildings (Floodlight 4 m / 6 m in blackout).
- `game-architecture.md` › 4. Blackout Lighting ("the server owns the light state … the client renders a darkness render texture only when the flag is on … zombie eyes above the darkness"), Performance ("darkness texture at half resolution", DPR cap 2, atlases ≤ 2048²), Dev cheats ("force blackout").
- `docs/ideas/epic-6/proposal.md` § 5 (blackout table), § 4 (Collapse, fog meets flashlight); `party-notes.md` Round 8; designer decision D5.
- `docs/epic-6-decisions.md` › Epic 6 looks (3 Blackout, 3 Beams, colour rule).
- Story files 4.9 (baked light, `NIGHT_BY_STAGE`), 4.12 (fire), 4.13 (texture registry), 5.4 (flames), 5.10 (light list, floodlight), 5.11 (gear), 5.12 (molotov).

## Dev Agent Record

### Agent Model Used

Claude (Claude Code, cloud builder session for Story 6.3)

### Debug Log References

- Headless perf: `docs/perf/epic-6-blackout.md` (Playwright, 844 × 390 DPR 2, own Vite port 5391).
- Online check: own server `PORT=2591 DEV_FORCE_BLACKOUT=5 ALLOW_SOLO_START=1`, Vite 5392 with a temp proxy config (removed), two tabs `?lag=150&jitter=20`.

### Completion Notes List

- **Shared light state (T1).** `LightState` gains `blackoutPct`, `halfDark` (synced), `powerFailure`, `forcedPct` (server/solo); `isBlackout`, `darknessAlpha`, `lightRadiusOf`, `refreshBlackout` (the only writer; rule order forced → wave table → power failure in a wave → half dark in a build phase → 0), `setForcedBlackout`. Car fires light `blackout.fireLightM` (4 m) in a blackout. `player/flashlight.ts`: `flashlightOf` (cached per balance, widest owned cone wins), `inFlashlightCone` (dot product, no trig). `decay.json › blackout` (all AC 3 keys, schema defaults = shipped values, every `lightPctByWave` entry 0), `player.json › flashlight`, gear `coneDeg/rangeM`; `crossCheck`: glowM > every zombie radius + player radius. `refreshBlackout` at the end of `startBuild`, in `startWave` (after `beginWave`), in `endRun`.
- **Wire (T2).** `RunState.blackoutPct` (uint8) + `halfDark` (boolean) appended; `syncState` on change only (measured: ≤ 3 B on the change tick, 0 per tick), `resetRunFields`; `RUN_STATE_FIELDS` (devThrottle follows automatically, tested); `fakeRoom`; `NetSimHost.applyState` copies both on every patch (beside `mirrorDecay`); `snapshotWorld.lights` (four flags; the list stays out). Predictor: nothing (F8). `DEV_FORCE_BLACKOUT` (`apps/server/src/run/devForceBlackout.ts`, production ignores it with a logged reason; `RunController.forceBlackoutPct`).
- **Darkness (T3).** `render/darkness/`: `aboveDark.ts` (landed first, pushed early for 6.5), `darknessPlan.ts` (preallocated stamp plan + `FlashLights` ring + `planDarkness`), `lightStamps.ts` (disc, 60°/80° cones soft + hard, warm tints; drawn once, texture-registry phase `cache`), `DarknessView.ts` (half-res canvas via `addGeneratedTexture` key `fx_darkness`, repaint = the current frame, depth 11.7, hidden/idle when off). `palette.ts › DARK_LOOKS` (BL2 20 % / BL1 10 % / BL3 5 % crisp beams) + tints. CityView rain × 0.35 in a blackout.
- **Above the dark (T4).** `EyesView` (≤ maxEyes pooled FX-atlas frames `fx_eyes_a` / `fx_eyes_brute`, within `eyesM` of my drawn survivor, along the drawn facing), `BeamSparkleView` (≤ maxSparkles additive streaks inside beams and floodlight pools; `?fx=low` halves), `PlayerView.setAboveDark` (body/ring/“+” to `ABOVE_DARK.teammate` on the change only; names are HudScene text, already on top), `FloodlightView` sized by `lightRadiusOf` (12 m across in a blackout). `ZombieView.drawnImage(id)` added for the eyes.
- **Flashes (D4).** Muzzle flashes (`weapon.fired`, `turret.fired` with `turretMuzzleLight`) 3 m × 0.1 s at 0.8 m ahead; explosions 5 m × 0.15 s (minus the event's age); flame jets 3 m round the middle of the jet while `flames.flaming(id)`; molotov zones at their radius (from `MolotovFires.live`). Fed from GameScene's event loop only while a blackout is on; aged by the paused-aware clock.
- **Shop (T5).** Floodlight and Tactical flashlight `inShop: true`. Tests that asserted "hidden" now assert the new truth; the `not_for_sale` path and the dev shop-all switch keep their tests with a test balance (`loadDevBalance(opts, base?)` gained an optional base for that). Bots now buy the Tactical flashlight (120) in most runs (seen in the probe: `tactical_flashlight@W5` for most bots). Replay test seed 7 → 20 (seed 7's p0 no longer rerolls with the bigger card pool; 20 has p0 rerolls, Spitters, acid). Six-wave card sim list gained `tactical_flashlight` (2p seed 2 bought no card in build 0 otherwise).
- **Dev switches (T6).** Cheat panel "Force blackout: off / 20 / 10 / 5 %" (`setForcedBlackoutCheat`, solo, any phase), `?blackout=20|10|5` (solo, release-safe; applied in GameScene create for every solo run incl. `?stress`, so no separate `stressScenario.ts` change), `DEV_FORCE_BLACKOUT`.
- **Perf (T6).** Headless `?stress=150`: 12.4 fps → `&blackout=5` 9.2 (−26 %), `&fx=low` 9.0, `&blackout=20` 9.7 (load 2.6–3.7). Over the 15 % headless target: the quarter-size fallback was tried and gained nothing (−27 %), and a probe with no paint and no upload cost the same, so the headless cost is SwiftShader filling one more full-screen layer. **Shipped: half resolution, 48 stamps.** Phone rows left for the designer's friends (doc says so).
- **HUD layout test (brief 31).** Created `scenes/hudLayout.test.ts` (568 × 320, 640 × 360, insets 44/21; modes wave / build / holding / selected). The Epic 5 HUD as built breaks the 48 px centre gap / move-stick-half rules in 15 listed places (no overlaps, nothing off the safe area); recorded as an exact baseline so any new break fails. OPEN FOR DESIGNER (below).
- **Browser (T8).** Solo `?stress=150&blackout=5` (crisp 60° cone, 1.6 m glow, eyes on all 150), `?blackout=20/10/5` with 8 floodlights at 568 × 320 and 800 × 360 (`docs/art/6-3/`), online two tabs under `?lag=150&jitter=20` with `DEV_FORCE_BLACKOUT=5` (both 5 %, each draws the other's cone, floodlight tile in the build bar), a real WebGL context loss + restore mid-blackout (registry rebuild 1, darkness still drawn), a hidden tab slept 6 s and woke (same level). 
- **Full gate** (branch merged with origin/master 8f81792, which is still the newest master): `npm run typecheck` ✓, `npm run lint` ✓, `npm test` ✓ 325 files / 2678 tests passed (3 skipped), `npm run build` ✓; load 1.24 at start, 3.50 at the end of the tests (1-min average, 4 cores, this container only).
- **Re-gate after merging master 9849071 (Story 6.1, 10 waves):** conflicts only in urlOptions(.test).ts, RunRoom.ts, sprint-status (kept both sides); `refreshBlackout` still last in startBuild/startWave/endRun; the seed-dependent sims (replay seed 20, six-wave card sim) still pass with no change. typecheck ✓, lint ✓, test ✓ 328 files / 2699 passed (3 skipped), build ✓; load 1.66 → 4.75.
- **Gate after the review fixes** (merged master 9849071): typecheck ✓, lint ✓, test ✓ 329 files / 2705 passed (3 skipped), build ✓; load 0.56 → 3.64.
- **Mutations (T8), each run against its test file, all KILLED:** `refreshBlackout` not called in `startWave` (lightState.test), `halfDarkK` ignored (lightState.test), floodlight `radiusM` in a blackout (darknessView.test), cone full angle used as half (flashlight.test), own glow droppable at the cap (darknessPlan.test), `lowFx` lowers the alpha (`tools/checks/darknessNoOffSwitch.test.ts` source guard; the first try survived because the darkness takes no quality flag at all, so a source scan was added), darkness repainted while off (darknessView.test), teammate depth not restored (darknessView.test), `blackoutPct` not mirrored (NetSimHost.blackout.test).
- **Not verified:** any phone (Mi 11i rows empty); a hidden tab across a real build start → blackout wave in the browser (covered by `NetSimHost.blackout.test.ts`, and no normal wave is dark until 6.4); a live blackout wave in a normal run (every `lightPctByWave` entry is 0 until 6.4); Brute eyes and flame/explosion/turret flashes only in unit tests, not seen in a browser; `?fx=low` sparkle halving only in tests; reconnect not tried.
- **OPEN FOR DESIGNER:** (1) brief 31's HUD rules vs the Epic 5 layout as built — at 568 × 320 / 640 × 360 Ready sits in the move-stick half, the build bar's first tiles, ⟳ / item chip and the action bar's Move / Upgrade come within 48 px of the survivor (baseline list in `hudLayout.test.ts`); kept as built (brief 27). (2) Headless blackout cost −26 % (> 15 %): shipped half resolution because the fallback didn't help headless; the Mi 11i rows decide.

### File List

- `packages/shared/src/decay/lightState.ts`, `decay/lightState.test.ts`
- `packages/shared/src/player/flashlight.ts` (new), `player/flashlight.test.ts` (new)
- `packages/shared/src/config/balanceSchema.ts`, `config/balance.ts`, `config/devBalance.ts`, `config/balance.test.ts`
- `packages/shared/src/config/balance/decay.json`, `player.json`, `gear.json`, `buildings.json`
- `packages/shared/src/run/runStateMachine.ts`
- `packages/shared/src/core/worldSnapshot.ts`, `core/determinism.test.ts`
- `packages/shared/src/net/stateView.ts`, `index.ts`
- `packages/shared/src/bots/headlessRun.ts` (`onTick` hook)
- `packages/shared/src/buildings/buildings.test.ts`, `economy/gear.test.ts`, `economy/shop.test.ts`, `economy/shopCards.test.ts`, `economy/sixWaveSim.test.ts`, `replay/replay.test.ts`
- `apps/server/src/rooms/schema/RunState.ts`, `rooms/schema/syncState.ts`, `rooms/schema/syncState.test.ts`, `rooms/RunRoom.ts`
- `apps/server/src/run/RunController.ts`, `run/devForceBlackout.ts` (new), `run/devForceBlackout.test.ts` (new)
- `apps/client/src/render/darkness/aboveDark.ts`, `darknessPlan.ts`, `lightStamps.ts`, `DarknessView.ts`, `EyesView.ts`, `BeamSparkleView.ts`, `fakeScene.testkit.ts`, `darknessPlan.test.ts`, `darknessView.test.ts` (all new)
- `apps/client/src/render/AcidView.ts`, `render/BloaterView.ts`, `render/PlayerView.ts`, `render/ZombieView.ts`, `render/FloodlightView.ts`, `render/city/rainLook.ts` (new), `render/city/rainLook.test.ts` (new), `render/city/CityView.ts`, `render/city/palette.ts`, `render/city/spriteAtlas.ts`
- `apps/client/src/scenes/GameScene.ts`, `scenes/hudLayout.test.ts` (new), `scenes/buildBar.test.ts`, `apps/server/src/rooms/RunRoom.buildings.test.ts`, `tools/checks/darknessNoOffSwitch.test.ts` (new)
- `apps/client/src/sim/NetSimHost.ts`, `sim/NetSimHost.blackout.test.ts` (new), `net/fakeRoom.ts`, `net/lobbyStore.test.ts`
- `apps/client/src/debug/urlOptions.ts`, `debug/urlOptions.test.ts`, `debug/devCheatActions.ts`, `debug/devCheatActions.test.ts`, `debug/DevCheats.tsx`
- `docs/perf/epic-6-blackout.md` (new), `docs/art/6-3/*.png` (new), `docs/playtests/milestone-1/readability-sheet.md`, `readability-key.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`, this story file

### Notes for the merge (builder)

- Review fixes (2026-11-24): `ABOVE_DARK` gained `rush: 11.765` (the rush chevrons; 6.5's shim may lack it, this file wins); `decay.json › blackout.rainK` new; `STAMP_GLOW` (plan kind 2) + `fx_darkstamp_glow` stamp; `DARKNESS_PAD` (the darkness reaches 3 % past each view edge, GameScene passes the padded view to `planDarkness`).
- Designer B3: `AcidView` / `BloaterView` gained `darkGhost` (ghost images + one ghost Graphics in `ABOVE_DARK.hazard`), set by GameScene each frame before their update; `ABOVE_DARK.hazard` 11.707 and `decay.json › blackout.hazardAboveDarkPct` new.
- Review L3 (not this story): aim assist can lock a zombie beyond 14 m that the dark hides; 6.4 owns it with the fog (6.4 D4: aim assist never locks a target your screen hides).

- `RunState.ts` / `syncState.ts` / `stateView.ts › RUN_STATE_FIELDS + RunStateView` / `fakeRoom.ts` / `net/lobbyStore.test.ts` literal: `blackoutPct`, `halfDark` appended last; 6.5's `boss` record goes beside them (order free).
- `NetSimHost.applyState`: two lines after `mirrorDecay`; 6.5 adds its mirror line there too.
- `snapshotWorld`: a `lights` entry after `run`; 6.5's boss entry anywhere.
- `runStateMachine.ts`: `refreshBlackout(world)` as the LAST line of `startBuild`, `startWave` (after `beginWave`) and `endRun`; 6.1 edits these functions (keep the calls last).
- `GameScene.ts`: imports; fields after `floodlightView`; views created after `FloodlightView`; destroyed after it; one `blackoutFlash(e)` line after `molotovView.handle`; `view.setAboveDark(...)` in `syncPlayerView`; `updateDarkness(host, zoom)` after `cityView.update` (end of `update`) + two private methods and `MUZZLE_LIGHT_AHEAD_M` at the file end. 6.5 should create its views near the floodlight block and draw above the darkness with `aboveDarkness(obj, "boss" | "telegraph" | "marker")` from `render/darkness/aboveDark.ts` (this file wins over 6.5's shim).
- `hudLayout.test.ts` is THE brief-31 test: 6.5 adds the boss bar rect to the `wave` (and any other) mode; a new break must not be added to `KNOWN_LIST`.
- `CityView.ts`: the rain alpha (`rainA`) line only. `palette.ts`: `DARK_LOOKS` appended at the end. `spriteAtlas.ts`: two FX frames (`fx_eyes_a`, `fx_eyes_brute`) appended.
- `buildings.json` / `gear.json`: `inShop: true` (+ flashlight `coneDeg/rangeM`).
- Seed-dependent tests changed by the bigger card pool: `replay.test.ts` SEED 20, `sixWaveSim.test.ts` LIST + `tactical_flashlight`. 6.1 (10 waves, waves.json) will move these sims again: re-pick if they fail after the merge.
- `headlessRun.ts`: new optional `onTick` (F8 liveness probe).

## Senior Developer Review (AI)

- **Reviewer:** fresh-agent review in a separate cloud session, on story-6-3 merged with master 9849071 (relayed by the main session), 2026-11-24.
- **Outcome:** Changes requested → all requested fixes applied by the builder (below); high/medium fixes go to a fresh re-review.

### Action Items

- [x] [AI-Review][High] H1: `?blackout=` (release, solo) / `DEV_FORCE_BLACKOUT` could LIGHTEN a dark wave (forced won over the table). Fix: `refreshBlackout` applies `forcedPct` only when its darkness alpha ≥ the rule's (a half-dark build phase compared by alpha too); tests: table 5 + forced 20 → 5 (alpha ≥ 0.95) in `lightState.test.ts` and through `RunController` in `devForceBlackout.test.ts`.
- [x] [AI-Review][Medium] M1: camera shake opened a lit strip at the screen edge. Fix: the darkness canvas and image reach `DARKNESS_PAD` = 3 % of the view past each edge (≥ 2 × the biggest shake `MINE_SHAKE_MAX` 1.2 %); the plan culls on the padded view; test in `darknessView.test.ts`.
- [x] [AI-Review][Medium] M2: `hudLayout.test.ts` baseline matched id + rule only. Fix: each `KNOWN_LIST` line records its as-built centre gap / move-half offset (px); the test fails if a gap shrinks or an offset grows by > 0.5 px.
- [x] [AI-Review][Low] L1: the glow erased only ~half the dark at contact distance. Fix: own glow stamp (`CUT_GLOW`, flat full cut to `GLOW_CORE_K` 0.65 of the radius ≥ (0.6 + 0.4) / 1.6), glow strength 1; test on the cut strength (`cutAt`).
- [x] [AI-Review][Low] L2: in-cone zombies at 7.9 m / on the 30° edge drew nearly dark. Fix: `CUT_CONE` 1 → 0.97 at 90 % → 0.88 at the range; soft wedges now fade only OUTSIDE the true edge (innermost wedge = the exact half angle); tests.
- [x] [AI-Review][Low] L4: rush chevrons used a raw depth 12. Fix: `ABOVE_DARK.rush` 11.765.
- [x] [AI-Review][Low] L6: the 35 % rain factor moved to `decay.json › blackout.rainK` (`render/city/rainLook.ts`, tested).
- [x] [AI-Review][Low] L7: the story's brief block now carries lines 29–32.
- [x] [AI-Review][Low] L8: Results are always lit (`refreshBlackout` ignores `forcedPct` in Results); the comment matches.
- [x] [AI-Review][Low] Two surviving mutations now killed: BL3 5 % uses the hard cone stamps (20 % / 10 % the soft ones) in `darknessView.test.ts`; the rain dims in a blackout in `rainLook.test.ts`. Re-run: H1, M1, L1 mutations killed too.
- [ ] [AI-Review][Low] L3 (aim assist beyond 14 m in the dark): deferred to 6.4 (fog, 6.4 D4); merge note added.
- [x] [AI-Review][Low] L5 → designer decision 6.3 B3: acid puddles and Bloater gas (both cloud layers + the gas edge ring) get a second copy above the darkness (`ABOVE_DARK.hazard` 11.707) at `decay.json › blackout.hazardAboveDarkPct` (10 %) of their alpha, only in a blackout; inside light the full look shows under it (the faint same-colour copy changes it ≈ nothing: the "simplest equivalent" of max(lit, 10 %)). Own mines and traps stay under the dark. Test in `darknessView.test.ts` (mutation: ghost at full alpha → killed). Not seen in a browser.

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
- 2026-11-24: designer accepted every recommended decision ("ok, perfect"); status ready-for-dev.
- 2026-11-24: designer decision 6.3 B3 (review L5) built: hazards above the dark at 10 %.
- 2026-11-24: addressed code review findings — 10 items resolved (H1, M1, M2, L1, L2, L4, L6, L7, L8, two mutations); L3 deferred to 6.4, L5 with the designer.
- 2026-11-24: implemented (gds-dev-story): light state + rule, flashlight cone, wire fields, darkness layer, eyes, sparkles, teammates above the dark, floodlight 6 m, shop flags, dev switches, HUD layout test, perf doc; status review.
