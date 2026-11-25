---
baseline_commit: f67154d
---
# Story 7.12: Surprise loot bag

Status: review (merged story 7.7 + 7.11 + 7.12, all parts built; one Dev Agent Record here)

<!-- Story file 2026-11-25 from the real code on master 7385b47. Customization story 5 of 5 (7.8 done → 7.9 → 7.10 ∥ 7.11 → 7.12). Decisions to confirm: docs/epic-7-story-decisions-looks.md › 7.12. -->

## Story

As a player,
I want a rare bag to drop during a wave,
so that some runs end with a surprise.

> **Brief.** Epic 7 has no brief of its own yet. EPIC 6 BRIEF lines that apply (`docs/epic-6-brief.md`), reviewers check each: **1** (own cloud session, branch `story-7-12`), **2** (the bag is shared sim state: World → schema → syncState → stateView key lists → fakeRoom → mirror → devThrottle → snapshotWorld → bots), **3/4** (rules below are tests; beat them), **6** (the pick-up is per body, per tick), **7** (spatial: a fuzz test that the bag never lands in a solid, over random layouts × every stage × many seeds), **8** (randomness only from the new `loot` stream; same seed + input log → same digest, bag included), **9** (liveness: the 1,000-seed sim really schedules bags and a sim run really drops and picks one up), **10** (ticks, no allocation, numbers in balance JSON), **11** (the bag is one record set on change plus reliable events; report B/s), **12** (atlased, pooled: one sprite), **13** (readability: the bag reads as a pick-up, not cover; readability sheet), **14** (hidden tab across the drop, late Game scene start, reconnect during the bag's 20 s), **18**, **19**, **20**, **23-like** (only standing players take it), **24** (above the darkness, white = pick-ups), **25** (endless adds no bags; nothing grows), **29**, **31** (the "Bag found!" cue in the HUD layout test), **32**. NETWORK PASS BRIEF **18** (the server decides the finder and the item) and **21** (a held seat keeps a found item).
>
> **Scope:** the `loot` seed stream and the run's loot plan; the bag in the World (drop, 20 s, pick-up); its picture, glint and cue; the item choice on the server; banking in Story 7.2's transaction (into 7.11's `cosmetics`); the Results line. **No** new part (the 10 loot parts are in `cosmetics.json`).

## Acceptance Criteria

1. **The `loot` stream.** `STREAM_NAMES` (`packages/shared/src/core/seedStreams.ts:17`) gains `loot` and `createSeedStreams` (`:60`) creates it (other streams' sequences don't change: they are keyed by name). Its seed mixes the run seed with a **server-only salt** (D3): `streamSeed(runSeed ^ lootSalt, "loot")`, `lootSalt` a random u32 per run kept on the server (in the run's log line and, later, Story 8.4's snapshot), never on the room state; Practice solo and tests pass their own salt (0 by default). The run seed on the room state (`RunState.runSeed`) alone can't tell a client whether this run has a bag.
2. **The plan at run start.** From the `loot` stream, in this order: `has = next() < loot.runChance` (**0.2**); if `has`: `wave` uniform in **3–10**, `killFrac` uniform in [0, 1), `itemRoll` uniform in [0, 1). All numbers in a new balance file `packages/shared/src/config/balance/loot.json` (`runChance` 0.2, `firstWave` 3, `lastWave` 10, `bagTicks` 400, `pickRadiusM` 0.6, `glint` look values) validated with zod like the other balance files. The rate doesn't depend on zombie count or player count; solo runs too; **endless (waves 11+) adds none**. The plan is World state (`world.loot.plan`), never sent to clients.
3. **The drop.** When wave `plan.wave` starts (`wave.started { number, size }`, `simEvents.ts:76`), `killIndex = 1 + floor(killFrac × size)`; every `zombie.killed` in that wave counts (any cause: guns, melee, turrets, mines, fire, blasts); on the `killIndex`-th, the bag appears **where that zombie died**, moved to the nearest free spot if that point is inside a solid (map cover, buildings incl. barricades, rubble; `findBoxFreeSpot`, `player/freeSpot.ts:109`; fire, acid and gas don't move it, D4). It lies there **400 ticks (20 s)**, then disappears. A team wipe before that kill means no bag this run. Only one bag per run, ever.
4. **The pick-up.** Each tick while the bag is out, the first **standing** player (status `alive`, in `world.players` — downed, out and held players can't) whose centre is within **0.6 m** of the bag's centre takes it; several in range on the same tick → the lowest slot. No button. Emits `loot.found { playerId, wave }`; the bag is gone for everyone. The bag stays its full 20 s even if the wave ends meanwhile (D6) and can be taken in the build phase; it is gone at its 400th tick or when the run ends.
5. **Seen by everyone.** The bag is one small record on the room state (`RunState.lootBag`: `x`, `y` (float32), `untilTick` (u32), `state` (`none | out | found | gone`), set only on drop, pick-up and expiry — never per tick) plus reliable events `loot.dropped { x, y, untilTick }`, `loot.found { playerId, wave }`, `loot.expired` (netEvents encode/decode). A client that joins, wakes or starts its Game scene late draws the bag from the record if it is still out. Added bytes: ≤ 60 B per run (bandwidth test), 0 B/s per tick.
6. **The picture.** A small sack with a soft **white** glint (colour rule: white = pick-ups), drawn in code in the Dead City look, atlased (`fx_lootbag_a` + glint frames), **one pooled sprite**, above the darkness (`ABOVE_DARK.pickup`, `render/darkness/aboveDark.ts`, the 6.9 crate's slot), the glint pulsing from the bag's drop tick (tick-based, no per-frame allocation); it reads as a pick-up, not cover (readability sheet item, number from the main session at dispatch). With D5, a white edge-of-screen arrow points to it while it is off screen. Look per the designer's pick ("Needs a look?").
7. **The cue.** Everyone sees a short **"Bag found!"** line (with the finder's name for teammates: "Ana found a bag!") in the existing HUD toast line (`scenes/toastQueue.ts`) and hears a short placeholder sound (`loot_found`); the bag's drop plays `loot_drop` (soft) where it fell. Both in the HUD layout test (brief 31).
8. **The item (server).** At `loot.found`, the server picks the item from the finder's **unowned** loot parts (the 10 loot parts in `cosmetics.json` minus their `cosmetics`, 7.11; sorted by catalogue order): `unowned[floor(itemRoll × unowned.length)]`. If they own all 10, the find is **"Collector"** and no item. The pick is kept on the finder's seat (pending, server only; a held 8.1 seat keeps it) — not in the World, because the World doesn't know accounts.
9. **Banked even after a wipe or a quit.** The pending item is written to the finder's `progress.cosmetics` (7.11's `grantCosmetics`; as built, review L9: the same union inline in `progressRepo.addSupplies`) in **Story 7.2's end-of-run transaction**, on every ending (wipe, extract, endless loss) and for a finder who quits, at the moment 7.2 banks them; a failed write is retried once (7.2 rule), idempotent per run id. The finder can wear it from their next join (7.9 checks at join).
10. **Results.** The finder's "Run rewards" panel (7.2) shows **"Found in wave N: <item>"** with a close-up drawing of the part (7.10's `partTileUrl`), or "Collector: you have every surprise item" (no item). With D1, every teammate's Results also shows "<name> found: <item>".
11. **Practice solo (D2).** The offline practice run makes no loot plan unless Story 7.2 makes practice runs bank (then it follows 7.2's rule); online solo runs (a room with one player) have bags like any run.
12. **Snapshot note (Epic 8).** Story 8.4's snapshot must carry `world.loot` (plan, killed count, bag position, ticks left) and each seat's pending item; its round-trip test covers them (a note in 8.4's list, not built here). `snapshotWorld` (`core/worldSnapshot.ts:150`) includes `world.loot` now, so the replay digest covers the bag.
13. **Tests** (each mutated once): a seeded sim over **1,000 run seeds** gives **20 % ± 3 %** runs with a planned bag, every planned wave in 3–10, never in endless; the same seed + salt → the same plan and the same drop spot; a different salt → independent plans; the bag never spawns inside a solid (fuzz over every stage's map, random death spots incl. inside cars, barricades and rubble); a full headless run with a forced plan (`devLoot` switch) really drops a bag at the planned kill and a bot picks it up (liveness); pick-up: standing only, 0.6 m boundary (0.59 vs 0.61), same-tick tie → lowest slot, held player can't; 400-tick expiry; item: unowned only, Collector at 10, deterministic from `itemRoll`; banked on wipe / extract / quit / held; Results lines; 0 B/s per tick; snapshot digest includes the bag.

## Fairness / player-visible rules (each is a test)

- **B1 "One in five runs, for everyone the same."** The chance is per run (20 %), not per zombie or per player; solo too (online), endless none. Test: 1,000-seed sim (AC 13).
- **B2 "Nobody knows in advance."** No client can tell from what it receives whether or when a bag will drop (the plan never leaves the server; the stream uses the server salt). Test: the plan is not in `RunState`, not in any event before `loot.dropped`; with the room's `runSeed` alone, a client computing the `loot` stream gets a different plan than the server (salt ≠ 0).
- **B3 "First one standing on it gets it."** First standing player within 0.6 m by tick order; same tick → lowest slot; downed, out and dropped players can't. Test as in AC 13.
- **B4 "Everyone sees the same bag."** Same spot, same 20 s, gone for everyone at the same tick (server truth; the client only draws). Test: two `NetSimHost`s on a fake room draw the bag at the same spot, and both hide it on `loot.found` / at `untilTick`.
- **B5 "Your find is safe."** The item is banked even after a wipe, a quit or a drop (8.1 hold). Test as in AC 9.
- **B6 "Always something new."** The item is one you don't own; with all 10, "Collector". Test as in AC 8.
- **B7 "Cosmetic only."** The bag changes nothing in the fight: it doesn't block anything, nobody is slowed or hurt by it, zombies ignore it. Test: a run with a forced bag and the same inputs, bag never picked up vs picked up → the same zombie positions and HP (digest of everything but `world.loot`).

## Tasks / Subtasks

- [x] **T0 Look pick** (AC 6, 7) — code-drawn proposals of the bag (2–3 sacks, with the glint) at game size on wet asphalt, in rain, in blackout (above the darkness) and next to the 6.9 crate, plus the off-screen arrow (D5) and the "Bag found!" line; designer picks; record in `docs/epic-7-decisions.md` › Loot bag (7.12). Readability: "is it cover?" — no (a pick-up).
- [x] **T1 Stream, plan, balance** (AC 1, 2, B1, B2) — `seedStreams.ts` (`loot`, salted), `config/balance/loot.json` + its zod schema in the balance loader (`Balance.loot`; a balance version bump is expected), `packages/shared/src/loot/lootPlan.ts` (`makeLootPlan(rng, balance)`), `World.loot` (`core/world.ts`) `{ plan, salt, killed, bag: { x, y, ticksLeft } | null, foundBy, foundWave }`.
- [x] **T2 Drop, timer, pick-up (shared sim)** (AC 3, 4, B3, B7) — `packages/shared/src/loot/lootBag.ts` as a system in the step (after kills are emitted, before the tick's events are drained): count `zombie.killed` in the planned wave, drop at the `killIndex`-th, `findBoxFreeSpot` for the spot, tick the timer, pick-up scan over `world.players` in slot order, events `loot.dropped` / `loot.found` / `loot.expired` in `simEvents.ts`. Dev switch `devLoot=<wave>:<frac>` (server `DEV_LOOT`, client `?loot=` in practice; never in production) to force a plan.
- [x] **T3 Network** (AC 5, B4) — `RunState.lootBag` record + `syncState` (on change only) + `stateView.ts` (`RunStateView.lootBag`, key list) + `resetRunFields` + `fakeRoom` + devThrottle `StateCopy` + mirror (the client never simulates the bag: it draws the record) + `netEvents.ts` kinds for the three events (ask the main session for the kind numbers at dispatch: 6.8–6.12 are adding kinds) + bots ignore it; bandwidth test.
- [x] **T4 Client** (AC 6, 7) — `render/LootBagView.ts` (one pooled sprite + glint, `ABOVE_DARK.pickup`, frames in the FX atlas through `addGeneratedTexture`), the off-screen arrow (D5, the teammate-arrow code of Story 2.9 as the pattern), the toast line and sounds, `GameScene` wiring (drawn from the record; hidden on found/expired; a woken tab draws the record as it is). Readability sheet item + key.
- [x] **T5 Item and banking (server)** (AC 8–10, B5, B6) — waits for 7.11's `cosmetics` column: on `loot.found` in `RunRoom` (or 7.2's per-seat record), `pickLootItem(unowned, itemRoll)` → pending on the seat; bank with `grantCosmetics` (as built: inline in `progressRepo.addSupplies`, review L9) inside 7.2's transaction; `loot_found { wave, collector }` log line (no item names needed). Results lines (7.2's panel), the teammates' line with D1.
- [x] **T6 Tests + gate** (AC 13) — sims (1,000 seeds; forced-plan full run), fuzz (no solid), unit (pick-up, timer, item), room (banking on every ending, held seat), bandwidth, replay digest; browser check solo `?loot=3:0.1` and two tabs online `?lag=150&jitter=20` (both see the same bag, one takes it, both see it vanish); a hidden tab across the drop; `?stress=150` with a bag out (FPS unchanged); full gate; "Notes for the merge"; "Not verified".

## Dev Notes

### What exists today (read before changing)

- **Seed streams:** `packages/shared/src/core/seedStreams.ts` — `STREAM_NAMES = ["decay", "events", "spawns", "combat"]` (`:17`), `streamSeed(runSeed, key)` (named sub-seeds; adding a name changes no other stream), `createSeedStreams(runSeed)` (`:60`), the per-player shop streams. The run seed is on the room state (`RunState.runSeed`, `RunState.ts:157`; shown on Results), so an unsalted `loot` stream would be computable by any client (B2, D3).
- **Waves and kills:** `wave.started { number, size }` (`simEvents.ts:76`, from `waves/waveDirector.ts`), `zombie.killed { zombieId, killerId, x, y, weapon, buildingId? }` (`:32`, emitted by `combat/damage.ts`, flames, blasts, mines). Wave 10 is the Behemoth's wave (6.5: at most 110 zombies alive while it lives); its `size` is the wave's zombies (the boss isn't a `zombie.killed`). Endless waves are 11+ (6.12).
- **Free spots:** `player/freeSpot.ts` — `boxBlocked`, `boxOrFireBlocked` (`:39`), `findBoxFreeSpot(world, cx, cy, r, rings, out)` (`:109`): use `findBoxFreeSpot` with the bag's radius (≈ 0.25 m) so fire doesn't move the bag (D4) but boxes and buildings do. Rubble (6.2/6.4) is a box in the decay layers — confirm it's in `boxBlocked` at build time.
- **A pick-up that exists:** Story 6.9's supply crate (`events/supplyDrop.ts`, check at build time): standing players only, 0.8 m for 1 s, drawn at `ABOVE_DARK.pickup`, white fill ring, HUD prompt. The bag is simpler (0.6 m, instant, no claim), but reuse its view/depth/readability pattern and its "standing players only" helper if one exists.
- **Above the darkness:** `apps/client/src/render/darkness/aboveDark.ts` `ABOVE_DARK` (slots for sparkle, hazard, eyes, boss, …; 6.9 adds `pickup`).
- **HUD toast:** `apps/client/src/scenes/toastQueue.ts` `ToastQueue` (2.11's "<name> left" lines).
- **Snapshot / digest:** `packages/shared/src/core/worldSnapshot.ts:150` `snapshotWorld(world)`.
- **Ownership:** 7.9's `ownedParts`, 7.11's `cosmetics` column and `grantCosmetics(tx, accountId, keys)`; the 10 loot parts are `unlock: "loot"` in `cosmetics.json`: `top:floral`, `head:cone`, `head:chef`, `head:pot`, `head:bunny`, `head:viking`, `head:prop` (the spinning propeller), `pack:teddy`, `pack:cat`, `pack:plant`.

### Why the item is chosen on the server, not in the World

The World (shared sim, replays, practice solo) doesn't know accounts. It records **who** found the bag and in which wave; the server room turns that into an item with the seat's owned set (loaded at join, 7.9/7.11) and `plan.itemRoll`. So replays stay account-free and a modified client can't choose the item.

### Kill index

`killIndex` is computed when the planned wave starts, from that wave's actual `size`, so a team that changed size mid-run (Epic 8 joins/leaves later) still reaches it; a wave always ends only when all its zombies are dead, so the bag drops unless the team wipes first. That makes "runs with a dropped bag" a bit under 20 % for losing teams; the 1,000-seed test checks **planned** bags (AC 13) and the forced-plan run checks the drop.

### Check at build time

- Epic 6 **6.8–6.12** (event records, netEvents kind numbers, `ABOVE_DARK.pickup`, the crate, `ending`, endless) and the Network pass (**8.1** held seats — a held player isn't in `world.players`, so they can't pick up for free; **8.10** horde stream — no overlap). Get the netEvents kind range and the readability sheet number from the main session at dispatch (HANDOFF §3 session 9 rule 1).
- Story **7.2** (banking transaction, per-seat record, Run rewards panel, practice-solo rule) and **7.11** (`cosmetics`, `grantCosmetics`).
- `docs/perf/` newest `?stress=150` baseline.

### Architecture compliance

- Randomness only from named seed streams (architecture › Randomness: `loot (Story 7.12)`); balance numbers in JSON (`loot.json`); events not per-tick state (one record on change); the server is the truth for pick-ups (ADR-01).
- Art drawn in code into an atlas through `addGeneratedTexture` (Story 4.13 / brief 20).

### Files

- New: `packages/shared/src/loot/lootPlan.ts`, `lootBag.ts` (+ tests, + fuzz), `packages/shared/src/config/balance/loot.json`, `apps/client/src/render/LootBagView.ts` (+ test), loot bag art in `apps/client/src/render/city/` (FX atlas frames), `apps/server/src/meta/loot.ts` (`pickLootItem`, + test), `docs/art/7-12/` (T0 proposals), a 1,000-seed sim in `tools/sims/`.
- Changed: `apps/client/src/gallery/collect.ts`, `apps/client/src/debug/urlOptions.test.ts`, `apps/server/src/rooms/RunRoom.test.ts`, `packages/shared/src/core/seedStreams.ts`, `core/world.ts`, the system list (`core/systems.ts`), `core/simEvents.ts`, `net/netEvents.ts`, `net/stateView.ts`, `core/worldSnapshot.ts`, the balance loader (`config/balance.ts`, `config/balanceSchema.ts`) and `packages/shared/src/index.ts`; `apps/server/src/rooms/schema/RunState.ts`, `syncState.ts`, `apps/server/src/rooms/RunRoom.ts` (salt, item pick, `DEV_LOOT`), 7.2's banking and rewards; `apps/client/src/net/fakeRoom.ts`, `devThrottle.ts`, `apps/client/src/scenes/GameScene.ts`, `apps/client/src/render/city/spriteAtlas.ts` (FX frames), `apps/client/src/debug/urlOptions.ts`, 7.2's Run rewards panel; `docs/playtests/milestone-1/readability-sheet.md` + key.

## Test plan

| Area | Test | Mutation that must fail it |
| --- | --- | --- |
| Rate | 1,000 seeds → 20 % ± 3 % planned; waves 3–10; none in endless | `runChance` read as 0.02 → fails; `lastWave` 11 → fails |
| Determinism | same seed + salt → same plan and spot; salt changes it | drop the salt → B2 test fails |
| Spot | fuzz: never in a solid at any stage; fire doesn't move it | skip `findBoxFreeSpot` → fuzz fails |
| Pick-up | standing only; 0.59 / 0.61 m; same-tick tie → lowest slot; held can't | allow downed → test fails |
| Timer | gone at tick 400 for everyone; stays into the build phase | expire at wave end → D6 test fails |
| Item | unowned only; Collector at 10; deterministic | pick from all loot parts → B6 fails |
| Banking | wipe / extract / quit / held → banked once; retry idempotent | bank only on extract → wipe test fails |
| Network | record on change only; 0 B/s per tick; late joiner sees the bag | sync the timer per tick → bandwidth test fails |
| Liveness | forced plan → bag drops at the planned kill, a bot takes it | — |
| Replay | digest includes `world.loot`; B7 fight unchanged | — |

## Beat the rule (reviewers: start here, then go further)

1. **Knowing in advance:** compute the `loot` stream from `RunState.runSeed` with the public code → wrong plan (salt). Check that no log line, event or state field leaks the plan or the salt to clients (also not in `?debug=1`).
2. **Farming:** restart runs until a bag drops (each run is a real 20 % from wave 3 on; nothing to skip without the plan); a team leaves and rejoins to re-roll (the plan is per run, made once); join a run late to grab the bag (Epic 8 later: allowed if you're standing nearest — note for 8.2); keep a bag "for a friend" (no claim: first standing body takes it).
3. **Cheating:** a modified client says "I took it" — there is no such message; the server's World decides. Teleport hack: positions are server-simulated from inputs (2.4), so the client can't move faster than its speed.
4. **Unfair spots:** the death spot inside a burning car, a wall, a barricade, rubble, outside the map, or in a gas cloud → moved out of solids (fire/gas stay, D4: you can see the danger; check it isn't unreachable — a spot enclosed by barricades the team built is reachable by moving one; note).
5. **Losing it:** the finder drops (8.1 hold) → pending item kept, banked at the end; the finder's hold runs out → banked when 7.2 banks them; the team wipes 2 s after the pick-up → banked; the server restarts before the end → lost (7.2/8.4's rule for unfinished runs; note it); the database write fails twice → logged, lost (note).
6. **Two devices:** the same account finds bags on two phones in two runs at once → two different unowned items? Each run picks from the owned set loaded at its join, so both may pick the same item → the union stores it once; the second find is a duplicate (note: acceptable, rare; or re-pick at bank time from the then-unowned set — the builder may do that inside the transaction if simple).
7. **Lifecycle:** hidden tab while the bag drops and is taken → on wake, no bag drawn, the toast shows once (not replayed late, `ageS` rule); a late Game scene start during the 20 s → the bag is drawn from the record; blackout → the bag is visible above the darkness.
8. **Performance:** `?stress=150` with a bag out → one sprite, no FPS change; 20 endless waves → no bag state grows (B1: none in endless).

## Notes for the merge

- `seedStreams.ts`: `loot` added at the end of `STREAM_NAMES`; `createSeedStreams` gains a `salt` argument (default 0) — every caller listed (server run start, LocalSimHost, replays, sims).
- `simEvents.ts` / `netEvents.ts`: three event kinds (kind numbers from the main session).
- `RunState.ts` / `stateView.ts` / `fakeRoom.ts` / `devThrottle.ts` / `syncState.ts`: one `lootBag` record (on change only).
- Balance: a new `loot.json` file bumps the balance version (one "Please refresh" for open tabs after the deploy).
- `worldSnapshot.ts`: `world.loot` in the digest → golden replay digests change once (say so; regenerate with the story).
- 7.2's banking and Run rewards: one grant and one Results line, next to 7.11's.
- For **Epic 8 (8.4)**: add `world.loot` and each seat's pending loot item to the snapshot round-trip list.

## Decisions to confirm

Already decided (not asked again): 1 in 5 runs (L1), 20 s on the ground (O2), whoever walks over it first (D4), waves 3–10 and per-run not per-zombie (D5, epics AC), 0.6 m, no button, banked even after a wipe or a quit, Collector when you own all 10, the 10 loot items (7.8 picks).

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.12 D1 | Who sees what was found | **Everyone's Results shows "Ana found: Traffic cone" (the finder's line is bigger)** (only the finder sees the item; teammates see "Ana found a bag") |
| 7.12 D2 | A bag in Practice solo | **Only if Story 7.2 lets practice runs earn Supplies; otherwise no bag there** (a bag that can be found but saves nothing) |
| 7.12 D3 | Can anyone know in advance that a run has a bag | **No: the server mixes a secret into the bag's dice, so even a modified phone can't tell** (the plain run seed: simpler, a modified phone could tell and quit runs without a bag) |
| 7.12 D4 | A bag that falls in a fire, acid or gas | **Stays where it fell: you see the danger and choose** (moved to the nearest safe spot) |
| 7.12 D5 | Finding the bag when it's off screen | **A small white arrow at the screen edge for its 20 s** (no arrow: you have to see it fall) |
| 7.12 D6 | The bag when the wave ends | **Stays its full 20 s, also into the build phase** (vanishes when the wave ends) |

## Needs a look?

**Yes:** the **bag** (a small sack with a soft white glint, Dead City look, readable at game size, in rain and in blackout above the darkness, clearly a pick-up and not cover), the **off-screen arrow** (D5), the **"Bag found!" / "Ana found a bag!"** HUD line, and the **"Found in wave N: <item>"** line in the Results "Run rewards" panel (draw it together with 7.2's panel and 7.11's "New item" line: one pick). 2–3 code-drawn proposals each (T0), designer picks before T4. The 10 items themselves are picked (7.8).

## Dependencies

- **Needs on master:** Story **7.2** (banking, per-seat record, Run rewards panel, practice-solo rule), **7.11** (`cosmetics` column, `grantCosmetics`) for T5; **7.9** (`ownedParts`, the item is wearable from the next join); Epic 6 **6.9** (crate pattern, `ABOVE_DARK.pickup`), **6.11/6.12** (endings, endless numbering).
- **Can start before 7.11:** T0–T4 (stream, plan, bag in the World, network, view) touch no account code; T5 merges 7.11 first.
- **Other writer's stories:** 7.2 (the transaction and the practice-solo rule decide AC 9 and AC 11), 7.1 (the guest-token identity: a copied token could also bank someone's loot into the wrong account — the 7.1 flag), 7.6 (merge joins `cosmetics`, so loot finds merge too).
- **Epic 8:** 8.4 snapshot (AC 12 note), 8.2 (a mid-run joiner can find the bag — fine, no change).

## References

- `_bmad-output/planning-artifacts/epics.md` › Story 7.12, FR89; `sprint-change-proposal-2026-11-24-epic-7-readiness.md` (Q3 snapshot note, Q9 `loot` added here); `sprint-change-proposal-2026-11-24-survivor-parts.md` (the 10 loot items)
- `docs/ideas/customization/proposal.md` § 5 (loot), § 10 (O1, O2); `docs/epic-7-decisions.md` › Final catalogue
- `_bmad-output/implementation-artifacts/6-9-gas-leak-and-supply-drop.md` (crate pick-up, `ABOVE_DARK.pickup`, colour rule), `7-11-milestone-items.md`, `7-9-my-look-in-the-game.md`
- `_bmad-output/planning-artifacts/game-architecture.md` › Randomness, Balance data; `docs/epic-6-brief.md`; `docs/network-pass-brief.md`

## Dev Agent Record

### Agent Model Used

Builder child session (cloud), `gds-dev-story`, FULL AUTONOMOUS RUN (designer asleep; every choice auto-accepted and logged in `docs/epic-7-story-decisions-looks.md` › "7.12 build-time choices", B1–B15).

### Debug Log References

- Early start (Epic 7 brief 29): T0–T4 built on `story-7-12` from origin/master f67154d. **T5 (item pick + banking in 7.2's transaction, 7.11's `cosmetics`, the Results lines) and the full gate wait for 7.2 and 7.11 on master.**
- netEvents kinds 130–132 (range 130–139); readability-sheet items 110–112 (range 110–114).
- Balance: the new `loot.json` file bumps the balance version once (one "Please reload" for open tabs after the deploy).
- Replay digests: `snapshotWorld` now includes `world.loot` (and `streams.loot`), so every digest changes once. The repo stores no golden digest (the replay tests compute both sides per run): nothing to regenerate (B14).

### Implementation Plan (as built)

- **Shared (T1/T2):** `seedStreams.ts` gains `loot` (`createSeedStreams(runSeed, lootSalt = 0)`, `streamSeed(runSeed ^ salt, "loot")`; other streams unchanged). `loot/lootPlan.ts` (`makeLootPlan`: has → wave → killFrac → itemRoll → variant; wave clamped to `runWaves`). `loot/lootBag.ts`: `World.loot` record, the `loot` system (last in `SYSTEM_ORDER`, after `decayTimers`, so fire-pulse kills count), drop via `lootSpot` (death point, else 0.25 m rings, else `findBoxFreeSpot`), 400-tick life, pick-up scan in slot order (status `alive`, ≤ 0.6 m inclusive), `loot.dropped/found/expired`, run end = gone; `forceLootPlan` + `parseDevLoot` (dev switch). `createWorld({ loot: { salt, prevVariant, off } })`. `snapshotWorld.loot`.
- **Network (T3):** `RunState.lootBag{State,X,Y,UntilTick,Variant}` appended last; `syncLootBag` writes only when the state changes; `resetRunFields`; `RunStateView` + `RUN_STATE_FIELDS` (so devThrottle's `StateCopy` and the schema key check follow); `fakeRoom`; `mirrorLootBag` (NetSimHost; the mirror never simulates the bag); NetSimHost ages loot events (`ageS`); netEvents 130–132 (global). Server: `RunRoom` makes a `randomUint32()` salt per run (in the `run_started` log line only), passes the previous look, reads `DEV_LOOT` (dev only, `run/devLoot.ts`). Bots (`tools/bots/botClient.ts`) ignore the new fields (nothing reads them).
- **Client (T4):** `render/city/lootObjects.ts` (the pick page's relief renderer + LB4–LB8, copied), `render/city/lootBagAtlas.ts` (one 1024 × 256 atlas through `addGeneratedTexture`: 5 looks with the white rim light, ring, glint, OA2 badge), `render/lootBagLook.ts` (tick-based look), `render/LootBagView.ts` (one pooled sprite each, `ABOVE_DARK.pickup`, OA2 badge via `placeSecondEventArrow` + 20 s ring), `render/lootBagCue.ts` ("Bag found!" / "<name> found a bag!", sounds, stale-backlog rule), `audio/placeholderSfx.ts` (`loot_drop`, `loot_found`), GameScene + HudScene wiring (BF2 line in the finder's slot colour with the bag icon, `layoutLootLine` in `hudTopLayout.ts`), practice: no plan unless `?loot=` (D2).

### Completion Notes List

- Story context created 2026-11-25 from master 7385b47: comprehensive developer guide, status ready-for-dev.
- **T0** [x] — no new proposal round (B1): built from 7-UI-6 / OA2 / BF2; stills `docs/art/epic-7/built/7-12-bags.png` (five looks × normal light / 5 % blackout, rain, 568 × 320 at dsf 2) and `7-12-hud.png` (OA2 badge + BF2 line); readability items 110–112 + key. Tests: `apps/client/src/render/city/lootBagAtlas.raster.test.ts > each of the five looks is drawn, with a white rim light round it`, `> LB6 (the field case) is visibly smaller than the 1 m supply crate and has no green`.
- **T1** [x] — `packages/shared/src/loot/lootPlan.test.ts > B1: 1,000 run seeds → 20 % ± 3 % runs with a planned bag, every wave in 3–10, never endless`; `> the plan is drawn in the story's order from the loot stream`; `> same seed + salt → the same plan; another salt → an independent plan`; `> B2: from the public run seed alone a client computes another plan (the salt ≠ 0); other streams don't change`; `> practice (D2) and mirror Worlds make no plan and draw nothing`; `> 7-UI-6: the look is never the previous bag's`; `> B1: a shorter run (runWaves 6) never plans a bag past its last wave`; `packages/shared/src/core/world.test.ts > runs systems in the fixed architecture order`.
- **T2** [x] — `packages/shared/src/loot/lootBag.test.ts > drops at the killIndex-th kill of the planned wave, where that zombie died`; `> no plan → no bag; a team wipe before the kill → no bag`; `> standing within 0.6 m takes it (0.59 yes, 0.61 no)`; `> downed and out players can't; a held / left player (not in world.players) can't`; `> several in range on the same tick → the lowest slot`; `> lies exactly 400 ticks, into the build phase (D6), then loot.expired; the run's end takes it`; `> devLoot parses <wave>:<frac>`; `> AC 12: snapshotWorld covers the bag`; `packages/shared/src/loot/lootBag.fuzz.test.ts > every stage × masks × buildings × 40 seeds × 60 death spots`; `packages/shared/src/loot/lootRunSim.test.ts > liveness: a forced plan drops the bag at the planned kill of wave 3 and a bot takes it`; `> B7: the bag changes nothing in the fight`.
- **T3** [x] — `packages/shared/src/loot/lootBag.test.ts > netEvents 130–132 round-trip; ≤ 60 B per run`; `packages/shared/src/net/netEvents.test.ts > round-trips every forwarded kind`; `apps/server/src/run/lootBandwidth.test.ts > taken or expired: ≤ 60 B per run (events + record), the record written exactly twice, 0 B per tick while it lies` (39 B taken / 37 B expired); `> B2: the room state carries no plan, no salt, no kill count`; `apps/server/src/run/devLoot.test.ts > parses <wave>:<frac>; refuses junk; production ignores it`; `apps/client/src/render/lootBag.test.ts > two clients draw the same bag at the same spot and both hide it at untilTick` (B4, late join); `tools/checks/lootBagWiring.test.ts > NetSimHost copies the room's lootBag record into the mirror every state, and ages loot events`; `> the server salts every run and reads DEV_LOOT`. Schema ↔ key-list drift: compile-time `RunFieldsMatchKeyList` (typecheck).
- **T4** [x] — `apps/client/src/render/lootBag.test.ts > the glint flashes from the drop tick`; `> 'Bag found!' for the finder, '<name> found a bag!' for teammates, the slot colour; stale backlog: no line, no sound`; `> one sprite each (bag, ring, glint, badge, tip, arc), made once; the bag, ring and glint in ABOVE_DARK.pickup`; `> OA2: off screen → the badge at the edge`; `apps/client/src/scenes/hudLayout.test.ts > Story 7.12: 568 × 320 / 640 × 360 / 800 × 360 / 844 × 390: the loot line (icon + text) keeps off the top band and inside the safe area`; `tools/checks/lootBagWiring.test.ts > GameScene makes the view, updates it every frame after the event view, cues the events, and shows the line`; `> HudScene colours the loot line and draws its icon from layoutLootLine`; `> practice makes no plan unless ?loot= forces one (D2)`; `tools/checks/noUnregisteredTextures.test.ts` (the atlas goes through `addGeneratedTexture`).
- **T5** [x] (merged story, after 7.2 + 7.9 + 7.3 landed) — the item pick and banking inside 7.2's transaction: `apps/server/src/meta/loot.ts` (`pickLootItem`), `meta/runMeta.ts` (`seatMeta`: stats delta, milestone parts, the loot item picked from the parts owned INSIDE the transaction after this run's milestone parts, District 2), `db/progressRepo.ts › addSupplies(…, meta)` (row lock, writes only when the run_rewards row is new, breakdown replayed on a retry), `meta/banking.ts` (finder first → teammates' `teamLoot`, D1; leaver meta at the Leave; unsaved finder preview), `run.rewards` fields `newItems` / `loot` / `teamLoot` / `newDistricts`, Results rows (`ui/rewardsModel.ts › metaRows`, `ResultsScreen.tsx`). Tests: `apps/server/src/meta/meta.test.ts > picks from the unowned loot parts in catalogue order, deterministic from itemRoll`, `> Collector: owning all ten → null (no item)`; `apps/server/src/db/metaBank.test.ts > 7.12 AC 8 / B6: the finder gets an unowned loot part from itemRoll; with all ten owned → Collector (no item)`, `> 7.11 AC 6: a retry of the same run (or a second endRun) adds no stats and grants nothing again`; `apps/server/src/meta/bankingMeta.test.ts > 7.12 D1: the finder banks first; every teammate's Results names the find; the finder's own line is the loot`, `> 7.12: an unsaved finder (no account) still sees the find; nothing else is granted without a saved bank`; `apps/client/src/ui/rewardsMeta.test.ts > Collector, and a teammate's find with the finder's name (7.12 D1)`, `> brief 26 order: new items first …`; `tools/checks/metaWiring.test.ts > the bank passes the meta writes into the transaction; …`.
- **T6** [x] — sims (1,000 seeds, forced-plan liveness), fuzz, unit, room (`RunRoom.districts.test.ts`), bank (wipe / extract / lost / quit, held via the shared record), bandwidth, replay digest, layout tests; mutations listed in the Gate line. Browser checks: the early part's in-game stills; the Results rows and the lobby sheet are covered by model + layout tests, NOT a browser run (Not verified).

### Merged story 7.7 + 7.11 (same branch, same review)

Story files keep their ACs: `7-7-district-unlock-rule.md`, `7-11-milestone-items.md` (tasks ticked there with pointers here).

- **7.11 T1 Data** [x] — `packages/shared/src/config/milestones.json` + `milestones.ts` — `milestones.test.ts > ten milestones m1…m10, each unlocking exactly one catalogue part`, `> refuses a broken file`.
- **7.11 T2 Migration + repository** [x] — `apps/server/drizzle/0004_milestones_loot.sql` (drizzle-kit, after 7.6's 0003_accounts_devices; first generated as 0003 after 0002_look: `progress.cosmetics text[]`, `progress.stats jsonb`), `progressRepo` (`get` returns them; the bank writes them) — `metaBank.test.ts > brief 21: migration 0004 runs forward on a copy of the 0003 schema (7.6) with rows in it`, `> 7.11 AC 5 / M-F5: … two runs of one account ending at once both add`, `> 7.11: M1 granted with the first bank; a second qualifying run grants nothing new (M-F3); stats add up`.
- **7.11 T3 Per-run counters** [x] — `packages/shared/src/meta/milestoneRecord.ts` (+ `runRecord.ts` wave mask) — `milestoneRecord.test.ts > kills: own kills and finishing the Behemoth count; a turret's or mine's kill doesn't (D6)`, `> revives go to the reviver; downs count in waves 1–10 only (D7)`, `> M-F2: barricades count only when still standing at the next wave start; 100 place / take-back cycles → 0`, `> wave mask: waves that ended while in (held seats too); the wave a team wipe falls in is paid but not survived`; `player/hold.test.ts` (the counters ride with a held seat).
- **7.11 T4 Milestone check** [x] — `apps/server/src/meta/milestones.ts` — `meta.test.ts > M1 at wave 5 (not 4), M4 at wave 15 (not 14) …`, `> M2 only extracting from Downtown; M3 …; M8 only all four standing`, `> lifetime boundaries: 24/25 revives, 999/1,000 kills, 99/100 barricades, 19/20 runs`, `> M10 …`, `> M-F3 …`; `bankingMeta.test.ts > M-F4: M1 is granted on every ending (wipe, extract, endless loss) and for a quitter`, `> 7.11 AC 6: a leaver banks with what it had at the Leave`, `> M8: extracting with exactly four all standing grants the laurel to all four; three, or one downed, doesn't`; liveness `apps/server/src/meta/milestoneLiveness.test.ts > 2 bots, 10 waves, extract: M1, M2, M3, M10 for both; kills > 0; 1 run each; no M8`.
- **7.11 T5 Ownership** [x] — `RunRoom.loadMemberProgress` re-checks the asked look with `ownedParts(cosmetics)` in the lobby; the progress view carries `cosmetics` — `RunRoom.districts.test.ts > an account that owns the riot helmet keeps it in its look (after the progress load); one that doesn't gets the default head`. 7.10's look route: not on master (note).
- **7.11 T6 Results line** [x] partly — "New item: … (reason)" rows with a picture (B20); **"Wear it" (D8) not built** (needs 7.10's save path, B21).
- **7.11 T7 Merge** [ ] — 7.6 not on master: note for 7.6 (B28).
- **7.7 T1 Data + rule** [x] — `progression.json › districts`, `packages/shared/src/meta/districts.ts` — `districts.test.ts > AC 1: …`, `> R1: …`, `> R2: the open mask is the union …`, `> R2/R4/R5: only the host, only a district someone here has, only a playable one`.
- **7.7 T2 Unlock write** [x] — `metaBank.test.ts > 7.7 R1: an extraction from Downtown adds District 2 once; a wipe, a quit or another district adds nothing`; `bankingMeta.test.ts > 7.7 R1: District 2 for the seats at the extract; a quitter (remembered seat) gets nothing`; Results "Unlocked: District 2 / coming soon" (`rewardsMeta.test.ts`).
- **7.7 T3 Lobby** [x] — `RunState.district`, `districtsOpen` (+ stateView, fakeRoom, lobbyStore, connection listeners), `lobby.district` under `this.net.guard`, R3 reset + `lobby.district_reset`, Start reads the pick — `RunRoom.districts.test.ts > R2: … R3: the last holder leaves → back to Downtown + notice`, `> R4: a non-host's pick, an unknown id and a pick mid-run are refused or ignored; Start always plays Downtown (AC 5)`.
- **7.7 T4 UI** [x] — DP2 sheet (`ui/districtModel.ts`, `LobbyScreen.tsx`, `lobbyLayout.ts › districtSheet`), hub "Districts" line (`hubModel.ts › districtsLine`) — `apps/client/src/ui/districtModel.test.ts > nobody has District 2: …`, `> someone here has it: 'Unlocked · coming soon' in v1 (R5) …`, `> the host's tap sends lobby.district { id }`, `> R9: the sheet's cards sit inside the safe area …`, `> the hub's Districts line`.
- **7.7 T5** [x] — this record.

### Gate

**Full gate (merged story 7.7 + 7.11 + 7.12), commit 1366b68 on `story-7-12` merged with master 99ac898 (7.3, after 7.1 / 7.2 / 7.9 / 8.1): typecheck ✔, lint ✔, test ✔ — 490 files passed, 3 skipped; 4,363 tests passed, 23 skipped (real-PostgreSQL tests skip without a server) — build ✔. Load 3.4 (4 cores).** A first gate run failed 14 tests (7.3 / 7.9 tests comparing the progress reply, a 7.9 source check, SQL outside `src/db` in a test, the hub's Districts line overflowing at 568 × 320); all fixed in 1366b68. Mutations of the merged part, each failed a test: M5 `>` for `>=`; District 2 on any ending; no owned check (double grant); counting barricade placements; a non-host pick allowed; loot from all parts (owned too); the wiped wave counted as survived.


Early part only (no full gate yet, per dispatch), on `story-7-12` from master f67154d: typecheck ✔, lint ✔; touched areas (`packages/shared` loot/core/net/config/replay/waves/bots + the 8 raw-balance tests, `apps/server`, `apps/client`, `tools/checks`): 2,398 tests, all pass after three follow-ups (gallery `collect.ts`, `urlOptions` default list, the `run_started` log fields) — 297 files; the whole `packages/shared` suite passed earlier in the session (1,667 tests) once the order test and a dropped balance cross-check were fixed. Load ≈ 2.9 (4 cores). Mutations (brief 6), each failed a test: pick-up allows downed; pick-up boundary narrowed; the drop skips the spot search; the bag expires at the wave's end; `runChance` ÷ 10; `lastWave` + 1; no salt. Full gate after T5 on the branch merged with master.

### Notes for the merge

**Merged story additions (7.7 / 7.11 / 7.12 T5):**
- `apps/server/drizzle/0004_milestones_loot.sql` + `meta/_journal.json` + `0004_snapshot.json`: regenerated by drizzle-kit after 7.6's `0003_accounts_devices` (7.6 landed first; fresh `when`, `prevId` = 7.6's snapshot; the same two ALTERs). Forward test: `metaBank.test.ts › migration 0004 runs forward on a copy of the 0003 schema`. `look.db.test.ts` now keeps only the migrations BEFORE 0002 in its "VPS" copy.
- `db/progressRepo.ts`: `addSupplies(runId, accountId, pay, meta?)` — the meta writes run under the same row lock and only when the run_rewards row is new. **7.6 (landed first)**: the meta writes go to its `payee` row (a merged guest's account); run_rewards stays keyed by the seat's account id; `MERGE_RULES` gained `cosmetics` = union and `stats` = added per key (`districts` union was 7.6's) (B28; tests `mergeRules.test.ts`, `metaBank.test.ts › 7.6 payee`). **7.10** (landed first): `ownedFor` reads `progress.cosmetics`, `onSetLook` uses the member's loaded cosmetics, the join stays database-free and the progress load re-checks the member's last asked look, practice wears the cached cosmetics (B34; tests `look.test.ts › Stories 7.11 / 7.12`, `RunRoom.districts.test.ts › lobby.set_look wears…`, `LocalSimHost.look.test.ts`).
- `packages/shared/src/player/player.ts`: six PlayerState fields appended (`waveMask`, `kills`, `revives`, `downs10`, `barricades`, `barricadesPending`); `player/hold.test.ts` classifies them "kept".
- `packages/shared/src/economy/economy.ts`: `countMilestoneEvent` after `apply` in the economy pass; `meta/runRecord.ts`: the wave mask (and the wiped wave cleared from it).
- `progression.json`: new `districts` key (required by the schema; tests that build a progression by hand add it). 7.3's `unlocks` / `starterLines` kept.
- `RunState`: `district`, `districtsOpen` appended after the `lootBag*` fields; `C2S.LOBBY_DISTRICT`, `S2C.LOBBY_DISTRICT_RESET`; `run.rewards` gains optional `newItems`, `loot`, `teamLoot`, `newDistricts`; the progress view gains optional `districts`, `cosmetics`.
- `meta/banking.ts`: `BankSeat.meta` / `teamLoot`, `RunBankDeps.district`, `RunBank.seatMetaNow`; the finder banks first in `bankRunEnd`.
- `RunRoom.ts`: `loadMemberProgress` at join (lobby look re-check, districts), `recomputeDistricts` on load and lobby leave, `onLobbyDistrict`, `DISTRICT_MAPS` at Start, `Member.look` no longer readonly (`run/lobby.ts`).
- Client: `ResultsScreen.tsx` (items / unlocks groups), `rewardsModel.ts` (`metaRows`, `rewardsView(…, nameOf)`), `survivorPortrait.ts › itemPortraitUrl`, `LobbyScreen.tsx` (district button + sheet, R3 notice; 7.3's Progress button kept), `lobbyLayout.ts` (`sheet`, the district line in `lobbyButtons`), `lobbyStore.ts` (`district`, `districtsOpen`, reset notice, `pickDistrict`), `connection.ts` (two listeners), `hubModel.ts › districtsLine`, `ProgressScreen.tsx`, `overlay.css`.
- For **Epic 8 (8.4)**: the snapshot round-trip list adds the PlayerState milestone counters (they are already in `snapshotWorld`) and, if 8.4 snapshots the room, `memberProgress` is reloadable (no need to store it).

**Early part (T0–T4):**

- `packages/shared/src/core/seedStreams.ts`: `loot` appended to `STREAM_NAMES`; `createSeedStreams(runSeed, lootSalt = 0)` — callers: `createWorld` only (it passes `opts.loot?.salt`); `snapshotSeedStreams` gains `loot`.
- `core/world.ts`: `World.loot` + `CreateWorldOptions.loot` (`{ salt?, prevVariant?, off? }`; default: a plan with salt 0). `core/systems.ts`: `"loot"` appended LAST to `SYSTEM_ORDER` (+ `DEFAULT_SYSTEMS` / `NO_SYSTEMS`); anyone listing systems by hand adds it. `core/simEvents.ts`: `loot.dropped / loot.found / loot.expired`. `net/netEvents.ts`: kinds 130–132.
- `config/balance.ts` + `balanceSchema.ts`: new file `loot.json` → **balance version bump**. Tests that build `RawBalanceFiles` by hand need `loot` (8 files fixed here: `events: eventsJson, loot: lootJson`).
- `apps/server/src/rooms/schema/RunState.ts`, `syncState.ts`, `packages/shared/src/net/stateView.ts`, `apps/client/src/net/fakeRoom.ts`, `lobbyStore.test.ts`: five `lootBag*` fields appended LAST, in their own small lines (7.9 / 8.1 add PlayerState fields — no overlap).
- `apps/server/src/run/RunController.ts`: options `lootSalt`, `lootPrevVariant`, `devLoot`. `rooms/RunRoom.ts`: salt per run, `lastLootVariant`, `DEV_LOOT`, `run_started` logs `lootSalt`.
- `apps/client/src/sim/NetSimHost.ts` (mirror + `ageS`), `LocalSimHost.ts` (`loot: { off: true }`, `devLoot`), `scenes/GameScene.ts`, `scenes/HudScene.ts` (toast line colour/icon), `scenes/hudModel.ts` (`toastLoot`, `toastSlot`), `scenes/hudTopLayout.ts` (`layoutLootLine`), `render/EventView.ts` (`edgeArrowAt()`, `controlRects()`), `render/darkness/fakeScene.testkit.ts` (fake `beginPath/arc/strokePath`), `debug/urlOptions.ts` (`?loot=`), `audio/placeholderSfx.ts`.
- `packages/shared/src/bots/headlessRun.ts`: test-only `seekLoot` option (default off).
- `snapshotWorld`: `loot` added → every replay digest changes once (no stored goldens).
- For **Epic 8 (8.4)**: add `world.loot` (plan, salt, killIndex, killed, bag, untilTick) and each seat's pending loot item (T5) to the snapshot round-trip list.

### Not verified

- Merged part: (review M5: the Results rows and the lobby district sheet are now measured in a real browser at four sizes); "Wear it" (7.11 D8) not built; 7.10's look route and 7.6's merge rules (not on master); PostgreSQL 18 itself (the review fixes ran the real-PG tests on a local PostgreSQL 16); the VPS migration (Hermes).

- Real phones (Mi 11i, iOS Safari): the bake cost (≈ 0.3 s in node for the five looks) and FPS with a bag out; `?stress=150` before/after not run yet (T6).
- Online two-tab check under `?lag=150&jitter=20` / `&loss=1`, a hidden tab across the drop, a reconnect during the 20 s — covered by unit tests only so far (T6 with T5).
- The rare frame with the event arrow, the survivor flag arrow and the bag badge all at the edge (B10).

### File List

- New (merged part): `apps/server/drizzle/0004_milestones_loot.sql`, `drizzle/meta/0004_snapshot.json`, `apps/server/src/meta/runMeta.ts`, `bankingMeta.test.ts`, `milestoneLiveness.test.ts`, `apps/server/src/db/metaBank.test.ts`, `apps/server/src/rooms/RunRoom.districts.test.ts`, `packages/shared/src/meta/milestoneRecord.ts`, `milestoneRecord.test.ts`, `districts.ts`, `districts.test.ts`, `apps/client/src/ui/districtModel.ts`, `districtModel.test.ts`, `rewardsMeta.test.ts`, `tools/checks/metaWiring.test.ts`.
- Changed (merged part): `apps/server/drizzle/meta/_journal.json`, `apps/server/src/db/schema.ts`, `progressRepo.ts`, `db.test.ts`, `look.db.test.ts`, `apps/server/src/meta/banking.ts`, `milestones.ts`, `meta.test.ts`, `apps/server/src/auth/unlock.ts`, `apps/server/src/rooms/RunRoom.ts`, `rooms/RunRoom.test.ts`, `rooms/schema/RunState.ts`, `apps/server/src/run/lobby.ts`, `packages/shared/src/config/progression.json`, `progression.ts`, `progression.test.ts`, `packages/shared/src/economy/economy.ts`, `meta/runRecord.ts`, `player/player.ts`, `player/hold.test.ts`, `net/messages.ts`, `net/account.ts`, `net/stateView.ts`, `index.ts`, `apps/client/src/net/fakeRoom.ts`, `lobbyStore.ts`, `lobbyStore.test.ts`, `connection.ts`, `apps/client/src/ui/ResultsScreen.tsx`, `rewardsModel.ts`, `LobbyScreen.tsx`, `lobbyLayout.ts`, `hubModel.ts`, `ProgressScreen.tsx`, `overlay.css`, `apps/client/src/render/city/survivorPortrait.ts`, `tools/checks/rewardsWiring.test.ts`, `_bmad-output/implementation-artifacts/7-7-district-unlock-rule.md`, `7-11-milestone-items.md`.
- New: `packages/shared/src/config/milestones.json`, `milestones.ts`, `milestones.test.ts`, `apps/server/src/meta/milestones.ts`, `loot.ts`, `meta.test.ts`, `packages/shared/src/config/balance/loot.json`, `packages/shared/src/loot/lootPlan.ts`, `lootBag.ts`, `lootPlan.test.ts`, `lootBag.test.ts`, `lootBag.fuzz.test.ts`, `lootRunSim.test.ts`; `apps/server/src/run/devLoot.ts`, `devLoot.test.ts`, `lootBandwidth.test.ts`; `apps/client/src/render/city/lootObjects.ts`, `lootBagAtlas.ts`, `lootBagAtlas.raster.test.ts`, `apps/client/src/render/LootBagView.ts`, `lootBagLook.ts`, `lootBagCue.ts`, `lootBag.test.ts`; `tools/checks/lootBagWiring.test.ts`; `docs/art/epic-7/built/7-12-shots.cjs`, `7-12-bags.png`, `7-12-hud.png`.
- Changed: `apps/client/src/gallery/collect.ts`, `apps/client/src/debug/urlOptions.test.ts`, `apps/server/src/rooms/RunRoom.test.ts`, `packages/shared/src/core/seedStreams.ts`, `world.ts`, `systems.ts`, `simEvents.ts`, `worldSnapshot.ts`, `world.test.ts`; `config/balance.ts`, `balanceSchema.ts`; `net/netEvents.ts`, `netEvents.test.ts`, `stateView.ts`; `bots/headlessRun.ts`; `index.ts`; 8 tests that build raw balance files (`combat/aimAssist`, `melee`, `firing`, `swap`, `config/balance`, `zombies/zombieAi`, `waves/waveDirector`, `waves/spawnPoints`); `apps/server/src/rooms/RunRoom.ts`, `rooms/schema/RunState.ts`, `syncState.ts`, `run/RunController.ts`; `apps/client/src/net/fakeRoom.ts`, `mirrorEvent.ts`, `lobbyStore.test.ts`, `sim/NetSimHost.ts`, `LocalSimHost.ts`, `scenes/GameScene.ts`, `HudScene.ts`, `hudModel.ts`, `hudTopLayout.ts`, `hudLayout.test.ts`, `render/EventView.ts`, `render/darkness/fakeScene.testkit.ts`, `debug/urlOptions.ts`, `audio/placeholderSfx.ts`; `docs/epic-7-story-decisions-looks.md`, `docs/playtests/milestone-1/readability-sheet.md`, `readability-key.md`; `_bmad-output/implementation-artifacts/sprint-status.yaml`; this story file.

### Change Log

- 2026-11-25: early part T0–T4 built (stream, plan, bag in the World, network record + events, client view, badge, line, sounds, art); T5 held.
- 2026-11-25: review round 1 fixed (M1–M6, L1–L9); 7.6 merged (migration → 0004, payee, MERGE_RULES); full gate green on 72fd4da.
- 2026-11-25: scope change — the merged story 7.7 + 7.11 + 7.12; built after 7.2 / 7.9 / 7.3 landed: milestone counters, migration 0003, meta writes in 7.2's bank, loot item + Collector, districts (data, lobby pick, R3, Start), Results rows, hub line. Status → review.

## Senior Developer Review (AI)

**Reviewer:** fresh reviewer session, 2026-11-25. Full three-layer `gds-code-review` (Blind Hunter, Edge Case Hunter and Acceptance Auditor, run in parallel), plus the reviewer's own probes and mutations.
**Scope:** `git diff 99ac898...origin/story-7-12`, head 6c2a16a.
**Tree reviewed:** story-7-12 merged with 99ac898 ONLY. Merging the current master (c549a05: 7.4+7.5 and the wall silhouettes) gives **18 conflicted files, 37 hunks**, which is more than trivial. The worst are `banking.ts` (×7), `unlockRoute.test.ts` (×7), `RunRoom.ts` (×3), `ResultsScreen.tsx`/`rewardsModel.ts` (×3 each), the `player.ts` field block and `progression.json/ts`. **The builder must do that merge and re-gate. The banking.ts and RunRoom.ts merges need a narrow re-review.**
**Checks run:** `npm ci`, typecheck (exit 0), and the 25 new or probed test files: 157/157 green on real PostgreSQL 16 (TEST_DATABASE_URL). No full gate was run.

**Verdict: CHANGES REQUESTED.** No high findings. Six mediums and nine lows. Banking exactly once, concurrency, salt secrecy and the pick-up rules all held.

### Findings

| ID | Sev | Where | Scenario | Minimal fix |
|---|---|---|---|---|
| **M1** | Medium | `packages/shared/src/loot/lootBag.ts:156-162` (`lootTaker`), `apps/server/src/meta/banking.ts:212, 296-301` (`teamLootOf` fallback), `apps/server/src/rooms/RunRoom.ts:717-719` | **A seat that already banked can take the bag.** The item is lost, and teammates are shown an item nobody got. **(A) honest player:** P Leaves with consent and banks `quit`. P rejoins via the remembered seat with the same playerId, then takes the bag. At run end, `bank(finderSeat)` returns P's earlier result, which has no `loot`. P gets no item, and `teamLootOf` falls back to `pickLootItem(new Set(), roll)`, so every teammate reads "P found: Traffic cone". **(B) griefer with a modified client:** sends `run.leave` (`onRunLeave` banks at once) but keeps the socket open, then walks onto the bag and destroys the team's only drop of the run. **(C):** the finder Leaves and its leave-bank is still in flight at `bankRunEnd`. `this.done.get(finder)` is undefined (`done` is filled only on settle), so the same phantom fallback is used. | Skip seats whose bank has started in `lootTaker`: the room marks the PlayerState in `bankLeaver`, or the World gets a `banked` set. In `bankRunEnd`, await `this.banks.get(finder)` (the promise) instead of `done.get`. When the finder's result has no `loot`, send `teamLoot` with `key: null` ("P found the bag"), never an invented item. Add tests for A and B. |
| **M2** | Medium (designer call) | `packages/shared/src/meta/milestoneRecord.ts:56-59` (and `combat.json` `friendlyFire.canDown: true`, `combat/damage.ts:40-56`, which has no phase gate) | **M5 revive farm with no risk.** In build phase 1 (no zombies), A downs B with a grenade or molotov (friendly fire, 50 %, can down) and revives them. Repeating that ~25 times in one or a few runs banks M5 (Headband). The 7.11 Beat-the-rule 1 accepted "a friend stands in a crowd" (real risk), not self-made downs. M-F2 says "You can't farm a milestone". The cost is grenade money only. | Count `player.revived` only when the down was not caused by a player (carry `byPlayer` on the downed state). Or count revives only in phase `wave`. Otherwise the designer accepts it and it gets logged in the decisions file. |
| **M3** | Medium (latent: low while only Downtown is playable) | `apps/server/src/rooms/RunRoom.ts:741-744, 1309-1326` and `:470` (loaded once, at join) | **The lobby's district and look data go stale across runs.** `memberProgress` is deleted only on a leave in the lobby, and `onLobbyReturn` neither reloads nor recomputes. playerIds are `p${slot}`, so they are reused. (a) Host H, the only member owning D, picks D and quits mid-run. The others return to the lobby. `districtsOpen` and `state.district` still hold D, which breaks R3, and a guest taking slot H inherits H's districts in the mask. (b) The team extracts and unlocks District 2, or earns a milestone part. Back in the lobby the picker still shows it locked and the part's look is not re-checked until they rejoin the room. | Delete `memberProgress` on every final leave. On `onLobbyReturn`, reload progress for the current members and call `recomputeDistricts()`. Add a room test for each case. |
| **M4** | Medium | `apps/client/src/ui/ProgressScreen.tsx:135-146`, `overlay.css:2388-2396` | **The hub "Districts" line sits inside `role="tablist"`** as a non-tab span, at 11 px, `nowrap` with an ellipsis. At 568×320 the space beside the tabs is far below the ~230 px "District 2: extract from Downtown to unlock" needs, so the text is cut off (R9 says nothing cut off). It also contradicts B29 ("in the hub's rule line") and 7.7 AC 7 ("header or under the Supplies total"), and hurts a11y. | Move it out of the tablist, under the Supplies total or the rule line, let it wrap, use the house minimum text size, and have `hubDomLayout` require the full text to be visible. |
| **M5** | Medium | `tools/checks/resultsDomLayout.test.ts`, `apps/client/src/ui/districtModel.test.ts:36`, `lobbyLayout.test.ts` | **R9 / brief 13 layout coverage is missing for the new UI.** No Results fixture has `newItems`, `loot`, `teamLoot` or `newDistricts`, so the `rw-item`/`rw-unlock` rows (pictures, 13–15 px text, ellipsis) are never measured at the 4 sizes. The DP2 district sheet is checked only as model rectangles, with no text size or "not cut" check. The Dev Agent Record discloses this, but it is still a brief violation. | Add an items+unlock fixture to `resultsDomLayout` (4 sizes), and a DOM check of the district sheet at 568×320 that includes 7.3's Progress button. |
| **M6** | Low-Medium | `apps/server/src/rooms/RunRoom.ts:223, 1193` | **"Never the same look twice in a row" (brief 25, 7-UI-6) is only partly true.** `lastLootVariant` is one global per process, updated when a run *plans* a bag, not when one drops. If a planned bag never drops (team wipe first, or the wave never reached), the next two bags players actually see can share a look. Parallel rooms also overwrite each other. | Update it on `loot.dropped`, or at run end when `loot.state !== NONE`. Add a wiring assertion. Log "per process, per server" in the decisions file. |
| L1 | Low | `packages/shared/src/combat/explosion.ts:217` → `boss/death.ts:33` → `milestoneRecord.ts:51-54` | When a mine (or a mine-popped Bloater blast) finishes the Behemoth, `boss.killed.killerId` is the mine's owner, so they get +1 lifetime kill. D6 says "not a turret's or a mine's" (turret bullets already pass null). | Pass `buildingId > 0 ? null : source` as the boss credit, or carry `buildingId` on `boss.killed`. |
| L2 | Low | `milestoneRecord.ts:61-64` | `downs10` counts any down while `waves.number ≤ runWaves`, including build-phase downs and the build/evac after wave 10 ended. A teammate's grenade after wave 10 can grief someone's M10. D7 says "downs during waves 1…runWaves". | Also require `world.run.phase === "wave"`. |
| L3 | Low | `apps/server/src/meta/banking.ts:212-219` | Every teammate's bank is chained after the finder's bank (2 bounded attempts + retry wait, ~6 s worst case on "Saving…"). B22 says "they wait one bank" but not how long. | Bank in parallel and send `teamLoot` as a small follow-up, or write down the worst case in B22. |
| L4 | Low (test gap: surviving mutant) | `lootBag.ts` `<= r2` | Mutant `<` instead of `<=` survived. B3 "boundary inclusive" has no test. | Add a player exactly at `pickRadiusM`. |
| L5 | Low (test gap: surviving mutant; R1 claim) | `apps/server/src/meta/runMeta.ts` `statsDelta` | Mutant `runs: 1` (ignoring D4's wave-1 rule) survived. M-F2's promised test "20 runs quit in build 1 → +0 runs" does not exist. | Add the test, on `statsDelta` plus a bank. |
| L6 | Low (test gap: surviving mutant) | `runMeta.ts:30` | Mutant that drops `heldPlayers.size === 0` survived. 7.11 Beat-the-rule 5 (a held seat at the extract tick → no M8) has no test. | Add the test. |
| L7 | Low (test gap: surviving mutant) | `runMeta.ts` `grant` (`after.add`) | Mutant that picks the loot item WITHOUT this run's milestone parts survived. Beat-the-rule 6 (the loot item never equals a milestone part granted in the same bank) is untested. | Add a case where the roll would hit the just-granted part's index. |
| L8 | Low | `apps/server/src/meta/milestones.ts:51`, `runMeta.ts:30` | Inline numbers: `w <= 10` for M10, `=== 4` for M8 (brief 7). | Put `n` in the `milestones.json` rules, or read `runWaves` / `MAX_PLAYERS`. |
| L9 | Low (R1 / M-F6) | `7-11-milestone-items.md:57`, 7.12 AC 9/T5; no M-F6 test | T2 and AC 9 name `grantCosmetics`/`addStats`, but the writes are inline in `progressRepo.addSupplies`. No test proves "cosmetic only" (M-F6) by replaying a run with all milestone parts worn and comparing digests with the default look. | Fix the wording and add that digest test. |

### Beat the rule: attempts and results

| # | Attempt | Result |
|---|---|---|
| 1 | Barricades: 100 place/take-back cycles in one build | **Held** (0; the taken-back id is not in `buildings.list`; tests). |
| 2 | Barricades: sell after the wave starts and rebuild each build | Counts +1 per wave at 50 % cost each time. Accepted by the story (Beat-the-rule 1). |
| 3 | Barricades: id reuse after a sell, or an upgrade/move counted as a placement | **Held** (`nextId` only increases; `building.placed` comes only from `placeBuilding`). |
| 4 | Kills by an owned turret or mine vs own kills | **Held** for zombies (`buildingId`, mutant killed). **Broken** for a mine finishing the boss (L1). |
| 5 | Boss finisher double count (zombie.killed + boss.killed) | **Held** (the boss emits only `boss.killed`; mutant killed). |
| 6 | Revive farm with a friend (friendly-fire downs in build) | **Broken** (M2). |
| 7 | Downs outside waves 1–10 / M10 griefing | **Partly broken** (L2). |
| 8 | A milestone item twice (two runs, retry, 12 concurrent banks) | **Held.** Real-PG probe: `head:fire` once, stats exact (12 runs), a retry replays the same breakdown. |
| 9 | A loot item twice (12 concurrent banks, one account, each a finder) | **Held.** Real PG: all 10 loot parts distinct, then Collector (null) for the rest. |
| 10 | Choose or predict the loot item (client) | **Held.** The salt is `randomUint32()`, server-only (in the `run_started` log line only, per D3). The plan is never on room state. `lootBag*` is written only from the drop on. Solo/practice make no plan. `DEV_LOOT` is ignored in production. No client message claims the bag. |
| 11 | Pick up the bag while downed, out or held | **Held** (status `alive` and in `world.players` only; mutant killed). |
| 12 | Pick up the bag after this seat already banked (Leave, then rejoin / `run.leave` without closing) | **Broken** (M1). |
| 13 | Two players on the bag the same tick | **Held** (lowest flame slot = the seat slot from `p${slot}`, fixed scan). The boundary-inclusive rule is untested (L4). |
| 14 | Bag inside a wall or solid | **Held** (`boxBlocked` → rings → `findBoxFreeSpot`; the final clamp is unreachable in practice). |
| 15 | Bag expiry / the run ending while the bag is out | **Held** (`tick >= untilTick` and `results` are checked before the pick-up; mutant killed). |
| 16 | Collector (all 10 owned) | **Held** (null key; mutant killed). |
| 17 | An unsaved (guest) finder | A preview item is shown, nothing written (accepted for the finder, B23). Teammates get the invented item too (part of M1's fix). |
| 18 | The finder leaving before Results (D1) | Works when the finder's leave-bank has settled. In flight → phantom item (M1 C). |
| 19 | District unlock without extracting, or for a leaver | **Held** (`extracted` only for seats banking `extracted`; mutant killed). |
| 20 | District pick by a non-host, outside the lobby, a locked pick, `lobby.district` spam | **Held** (`pickRefusal`, lobby-only guard, write only on change, guard rate limit; 4 mutants killed). |
| 21 | Host picks a locked or unplayable district with a modified client | **Held** (`locked` / `coming_soon` refusals; `DISTRICT_MAPS` falls back to Downtown). |
| 22 | R3 reset notice when the member who opened the pick leaves | **Held in the lobby** (mutant killed). **Broken across a run** (M3). |
| 23 | A rejoining or held seat's counters (8.1) | **Held** (counters live on PlayerState; held seats keep counting through `seat()`; remembered seats bank with their own state). |
| 24 | Two runs of one account ending at once: stats | **Held on real PostgreSQL** (`FOR UPDATE`; 12-way probe exact; the row-lock mutant is killed by `metaBank` + realPostgres). |
| 25 | Migration 0003 forward on a DB with rows | **Held** (0000–0002 + 3 accounts/progress rows → 0003: columns added with the defaults, rows kept). |
| 26 | Replay determinism with the bag (digests) | **Held** (the loot record is in `snapshotWorld`; `lootRunSim`/fuzz tests green; no stored golden digest to regenerate). |
| 27 | Bandwidth claim of 39 B/run | **True** (`lootBandwidth.test.ts`: events 20 B + record 19 B; expired 37 B). |
| 28 | Results group order (brief 26) | **Correct** (supplies → items [new, my find/Collector, teammate's find] → unlocks). R9 layout is unmeasured (M5). |
| 29 | Lobby DP2 sheet at 568×320 with the Progress button | Geometry fits by the model (line x183 w125, Progress x314, Leave x424). There is no DOM text check (M5). |
| 30 | Hub Districts line | **Cut off / misplaced** (M4). |

### Mutations (each new or probed test mutated once; 23 total)

**Killed (19):**
- Pick-up: `alive` gate.
- Expiry: `>=` → `>`.
- No bag after a team wipe.
- Kill index off by one.
- Variant: "never the previous".
- Plan wave clamped to `runWaves`.
- Turret-kill exclusion.
- `downs10` wave gate.
- Barricade "still standing" check.
- District only on extract.
- Meta writes only when the run_rewards row is new.
- M5 `>=` → `>`.
- Collector returns null.
- `not_host` refusal.
- `locked` refusal.
- `lobby.district` lobby-only.
- R3 recompute on a lobby leave.
- `FOR UPDATE` row lock.
- Boss finisher +1.

**Survived (4):** pick radius `<=` → `<` (L4), runs D4 (L5), M8 held check (L6), loot after milestone parts (L7).

Script: `7-12-review-probes/mut.sh.txt`. Real-PG probe: `7-12-review-probes/realPgMeta.probe.ts.txt`.

### R1 / R6
- **R1 (claims vs code):** 39 B is true. The row order is true. "Never twice in a row" is overstated (M6). The hub line's placement contradicts B29 (M4). The repository function names are wrong (L9). M-F2's quit test does not exist (L5).
- **R6 (mutate each new test once):** done (23). Four gaps (L4–L7).

## Review fixes (round 1, after CHANGES REQUESTED on review-7-12 @ a4af0617)

Each was fixed minimally, with a test; each new test was mutated once (the old code fails it) unless noted.

| # | Fix | Test(s) |
|---|-----|---------|
| M1 | `world.loot.banked` (set in the room's `bankLeaver`): `lootTaker` skips a seat already banked (Leave / `run.leave`). `bankRunEnd` awaits `banks.get(finder)` (a bank still in flight) instead of `done`. Without a find in the finder's result, teammates get `teamLoot {key: null, wave: 0}`, which reads "<name> found the bag", with no Collector line and no guessed item (B33) | `lootBag.test.ts › review M1`, `RunRoom.rewards.test.ts › review M1 (A) / (B)`, `bankingMeta.test.ts › review M1`, `rewardsMeta.test.ts` (wave 0 → no sub) |
| M2 | A revive counts toward M5 only in phase `wave`, and not when the reviver caused that down. `PlayerState.downedBy` is set by `downPlayer(world, p, by)` from `damagePlayerBy`'s source. **B31, auto-accepted overnight (designer: follow the GDS recommendation); the designer may override** | `milestoneRecord.test.ts › review M2 (B31)`; `hold.test.ts` (new field "kept") |
| M3 | `memberProgress` is deleted on every final leave. `lobby.return` recomputes the districts at once, then reloads every member's progress once the run's banks settle (`runBanked`). The look is not re-checked on that reload | `RunRoom.districts.test.ts › review M3` (mutant: no reload → fails) |
| M4 | The hub Districts line leaves the tablist: its own `<p>` under the rule line, wrapping, 12 px | `hubDomLayout.test.ts` now requires the full text, ≥ 12 px, outside the tablist and above the tabs at 568×320 … 844×390 (+ a District 2 owned case) |
| M5 | Results meta-rows fixture (2 new items, a find, District 2, the worst names) at 4 sizes, and a DP2 sheet DOM check (4 sizes, host view) that includes 7.3's Progress button. **They caught a real bug:** one of my merges dropped the `}` that closes 7.3's `@keyframes ph-spin`, so the browser swallowed every 7.7 / 7.11 / 7.12 rule after it (the Results item pictures drew 256 px wide; the sheet cards had 21 px buttons). Fixed, and `tools/checks/cssBraces.test.ts` now guards brace balance (no CSS linter runs in the gate) | `resultsDomLayout.test.ts` (meta case), `districtSheetDomLayout.test.ts`, `cssBraces.test.ts` (both DOM checks fail on the old CSS) |
| M6 | `lastLootVariant` is set on `loot.dropped` (a bag players saw), never from the plan; per process (B32) | `lootBagWiring.test.ts` (one assignment, on the drop) |
| L1 | A mine's blast finishing the Behemoth passes no killer to `applyBossDamage`, like a turret does in `firing.ts` | `death.test.ts › review L1` (mine → null, own grenade → owner) |
| L2 | `downs10` counts only in phase `wave` | `milestoneRecord.test.ts › review L2` |
| L3 | Documented in B22: teammates already bank in parallel with each other; worst case ≈ 6 s for their line (the finder's two attempts) while Results shows "Saving…" | — |
| L4 | — | `lootBag.test.ts › review L4` (exactly `pickRadiusM` takes it; + 1e-6 doesn't) |
| L5 | — | `bankingMeta.test.ts › review L5` (20 quits in build 1 → 0 runs, no M9; with wave 1 → 20) |
| L6 | — | `bankingMeta.test.ts › review L6` (four at the extract, one held → no M8). Its mutant (dropping `heldPlayers.size === 0`) is equivalent: a held seat leaves `world.players`, so the size check already fails it |
| L7 | `seatMeta(…, lootList?)` (tests only) | `bankingMeta.test.ts › review L7` (a catalogue where M1's part is also a loot part: the bag gives the next part; mutant without `after.add` fails) |
| L8 | M10's waves come from `milestones.json` (`wave10_never_downed.n: 10`, = `runWaves`, checked in tests); M8 uses `MAX_PLAYERS` | `milestones.test.ts` (n = runWaves) |
| L9 | Story wording: `grantCosmetics` / `addStats` are inline in `progressRepo.addSupplies` (7.11 T2 + notes, 7.12 AC 9 / T5) | M-F6: `RunRoom.districts.test.ts › review L9` (two rooms, same dev seed, one wearing all ten milestone parts that it owns, one with the default look; the loot salt aligned; 1,600 ticks into wave 1 → the same `worldDigest`) |

Real PostgreSQL 16 (a throwaway local cluster): `apps/server/src/db` + `apps/server/src/meta` with `TEST_DATABASE_URL`, plus the review's `realPgMeta` probe: 14 files, 85 tests, all pass, none skipped.

**Full gate after the review fixes, commit 72fd4da on `story-7-12` merged with master c00713d (7.6 landed; migration regenerated as 0004): typecheck ✔, lint ✔, test ✔ — 512 files passed, 4 skipped; 4,603 tests passed, 31 skipped — build ✔. Load ≈ 2.9 (4 cores).** A first run on cd23bfc failed 7 tests in 3 files: the district room tests needed 7.6's `checkTicketRows: false` (B21), the 7.1 AC 9 source check forbade the M3 reload's `.then(` (now an async `reloadProgress`), and `metaWiring` still expected the pre-M3 delete. All fixed in 72fd4da. Real PostgreSQL 16 after the 7.6 merge: `apps/server/src/db` + `meta` + `auth`, 23 files, 197 tests, all pass, none skipped.

For the narrow re-review: M1 (`lootBag.ts` `lootTaker`, `banking.ts` `bankRunEnd` / `teamLootOf`, `RunRoom.ts` `bankLeaver`), M2 (`milestoneRecord.ts`, `downed.ts`, `damage.ts`), M3 (`RunRoom.ts` `finalLeave` / `onLobbyReturn` / `loadMemberProgress`), and the `banking.ts` / `RunRoom.ts` merge resolutions.

## Designer override of B33 (2026-11-25, live; for re-review round 2)

Changes M1's fallback; listed separately from the round 1 fixes.

- `meta/banking.ts › teamLootOf`: no find in the finder's result, or a result that isn't `saved` → `undefined` (no team line; folded with round 2 L1). The `{key: null, wave: 0}` "found the bag" fallback is gone (client: `rewardsModel.ts` no longer special-cases wave 0).
- `meta/banking.ts › run`: after the second failed attempt, a finder's seat logs `loot_bank_failed {playerId, accountId, runId, wave, err}` once (`err` = `dbErrText`, cut at `\nparams:`).
- `ui/rewardsModel.ts › metaRows`: a `failed` bank with a find → the row `{kind: "lost"}` "Couldn't save the bag's item" / "(found in wave N)" (`LOOT_FAILED_TEXT`, worded like `REWARDS_TEXT.failed`); `overlay.css` reuses `.rw-status--failed`'s red for `.rw-item--lost .rw-item__line` (one rule, no second error style). `not_saved` keeps the finder's own "Found in…" row (B23); its teammates get no line (L1).
- Tests (each mutated once, all killed): `bankingMeta.test.ts › B33 (designer override …)` (no teamLoot, finder `failed` with its loot, one log line equal to the cut `err`, no params anywhere in the logs), `› review M1 …` (never banked → no team line), `rewardsMeta.test.ts › B33 …` (the lost row; `not_saved` still "Found in…").
- Decision B33 in `docs/epic-7-story-decisions-looks.md` marked "designer override 2026-11-25" with the new rule.

## Re-review round 1 (APPROVED, 0 H/M) — lows folded in (for round 2)

| # | Fix | Test(s) (each mutated once, killed) |
|---|-----|---------|
| L1 | `teamLootOf` names a find only when the finder's result is `saved` (failed and `not_saved` → no team line; one change with the B33 override) | `bankingMeta.test.ts › B33 …` (failing finder repo → teammates' `teamLoot` undefined), `› 7.12: an unsaved finder …` (no line) |
| L2 | `restoreRemembered` reloads the seat's progress (`loadMemberProgress(member, undefined, false)`): its districts count again at `lobby.return` | `RunRoom.districts.test.ts › review round 2 L2` (leave mid-run, rejoin, lobby.return → no reset, District 2 still open) |
| L3 | B31 amended (**designer, 2026-11-25**): a revive counts only of a down with no player source (`downedBy === null`) — closes the 3-player rotation farm | `milestoneRecord.test.ts › review M2 (B31 amended …)` (A downs B, C revives → 0) |
| N1 | Confirmed: revives finish in `player` and the wave can clear in `waves`, both before `economy` counts the event, so a revive on the clearing tick saw "build". `player.revived` and `player.downed` now carry `inWave` (server bookkeeping, not on the wire; absent → the current phase) | `milestoneRecord.test.ts › review N1` ×2 |
