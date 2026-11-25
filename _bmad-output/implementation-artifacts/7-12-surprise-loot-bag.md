# Story 7.12: Surprise loot bag

Status: ready-for-dev

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
9. **Banked even after a wipe or a quit.** The pending item is written to the finder's `progress.cosmetics` (7.11's `grantCosmetics`) in **Story 7.2's end-of-run transaction**, on every ending (wipe, extract, endless loss) and for a finder who quits, at the moment 7.2 banks them; a failed write is retried once (7.2 rule), idempotent per run id. The finder can wear it from their next join (7.9 checks at join).
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

- [ ] **T0 Look pick** (AC 6, 7) — code-drawn proposals of the bag (2–3 sacks, with the glint) at game size on wet asphalt, in rain, in blackout (above the darkness) and next to the 6.9 crate, plus the off-screen arrow (D5) and the "Bag found!" line; designer picks; record in `docs/epic-7-decisions.md` › Loot bag (7.12). Readability: "is it cover?" — no (a pick-up).
- [ ] **T1 Stream, plan, balance** (AC 1, 2, B1, B2) — `seedStreams.ts` (`loot`, salted), `config/balance/loot.json` + its zod schema in the balance loader (`Balance.loot`; a balance version bump is expected), `packages/shared/src/loot/lootPlan.ts` (`makeLootPlan(rng, balance)`), `World.loot` (`core/world.ts`) `{ plan, salt, killed, bag: { x, y, ticksLeft } | null, foundBy, foundWave }`.
- [ ] **T2 Drop, timer, pick-up (shared sim)** (AC 3, 4, B3, B7) — `packages/shared/src/loot/lootBag.ts` as a system in the step (after kills are emitted, before the tick's events are drained): count `zombie.killed` in the planned wave, drop at the `killIndex`-th, `findBoxFreeSpot` for the spot, tick the timer, pick-up scan over `world.players` in slot order, events `loot.dropped` / `loot.found` / `loot.expired` in `simEvents.ts`. Dev switch `devLoot=<wave>:<frac>` (server `DEV_LOOT`, client `?loot=` in practice; never in production) to force a plan.
- [ ] **T3 Network** (AC 5, B4) — `RunState.lootBag` record + `syncState` (on change only) + `stateView.ts` (`RunStateView.lootBag`, key list) + `resetRunFields` + `fakeRoom` + devThrottle `StateCopy` + mirror (the client never simulates the bag: it draws the record) + `netEvents.ts` kinds for the three events (ask the main session for the kind numbers at dispatch: 6.8–6.12 are adding kinds) + bots ignore it; bandwidth test.
- [ ] **T4 Client** (AC 6, 7) — `render/LootBagView.ts` (one pooled sprite + glint, `ABOVE_DARK.pickup`, frames in the FX atlas through `addGeneratedTexture`), the off-screen arrow (D5, the teammate-arrow code of Story 2.9 as the pattern), the toast line and sounds, `GameScene` wiring (drawn from the record; hidden on found/expired; a woken tab draws the record as it is). Readability sheet item + key.
- [ ] **T5 Item and banking (server)** (AC 8–10, B5, B6) — waits for 7.11's `cosmetics` column: on `loot.found` in `RunRoom` (or 7.2's per-seat record), `pickLootItem(unowned, itemRoll)` → pending on the seat; bank with `grantCosmetics` inside 7.2's transaction; `loot_found { wave, collector }` log line (no item names needed). Results lines (7.2's panel), the teammates' line with D1.
- [ ] **T6 Tests + gate** (AC 13) — sims (1,000 seeds; forced-plan full run), fuzz (no solid), unit (pick-up, timer, item), room (banking on every ending, held seat), bandwidth, replay digest; browser check solo `?loot=3:0.1` and two tabs online `?lag=150&jitter=20` (both see the same bag, one takes it, both see it vanish); a hidden tab across the drop; `?stress=150` with a bag out (FPS unchanged); full gate; "Notes for the merge"; "Not verified".

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
- Changed: `packages/shared/src/core/seedStreams.ts`, `core/world.ts`, the system list (`core/systems.ts`), `core/simEvents.ts`, `net/netEvents.ts`, `net/stateView.ts`, `core/worldSnapshot.ts`, the balance loader (`config/balance.ts`, `config/balanceSchema.ts`) and `packages/shared/src/index.ts`; `apps/server/src/rooms/schema/RunState.ts`, `syncState.ts`, `apps/server/src/rooms/RunRoom.ts` (salt, item pick, `DEV_LOOT`), 7.2's banking and rewards; `apps/client/src/net/fakeRoom.ts`, `devThrottle.ts`, `apps/client/src/scenes/GameScene.ts`, `apps/client/src/render/city/spriteAtlas.ts` (FX frames), `apps/client/src/debug/urlOptions.ts`, 7.2's Run rewards panel; `docs/playtests/milestone-1/readability-sheet.md` + key.

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

### Debug Log References

### Completion Notes List

- Story context created 2026-11-25 from master 7385b47: comprehensive developer guide, status ready-for-dev.

### File List
