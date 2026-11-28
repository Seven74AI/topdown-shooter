# Story 9.22: Status icons

Status: ready-for-dev

<!-- Written 2026-11-28 with gds-create-story from the real code (sim statuses, net state, client views) and the
     approved group-5 card ST-A (docs/art/photoreal-5/src/telegraphs-r2-status.ts, telegraphs-r2.ts › stA / stCard).
     Correct-course: sprint-change-proposal-2026-11-28-photoreal-fx.md. A NEW FEATURE: full three-layer review. -->

## Story

As a player,
I want an animated icon above any body under a status I can act on, with its time left,
so that I see at a glance who is down, burning, slowed, trapped, stunned, protected or healing.

## Designer decisions — the source of truth

- CR-R (2026-11-28): "no need to show CRASH, but we should show a stun icons. We probably should make some animated status
  icon for both player and monsters because they could be affected by same statuses." → the ST card.
- Rules (round 3): "**Yes, 24 max, ordered by most important zombie. For example we should always display the ones of
  behemoth.**" Survivors and the Behemoth always show theirs; zombie icons are capped at 24, ordered by the zombie's
  importance (**Behemoth > Brute / Bloater / Spitter > Runner > Walker / Crawler, then nearest**), halved with `?fx=low`.
  Above the head, max 3 stacked, in priority order.
- "Reco" 2026-11-28: **ST-A picked**.
- Q5 (answered): "protected" = Story 8.1's protection (2 s after a return; everyone standing during the evacuation,
  12.75 s): no damage, no shooting.
- **Proposal Q2 (open, recommendation followed):** a zombie's icons show only when the zombie itself is visible;
  survivors' and the Behemoth's above the darkness. **Q3 (open, followed):** today's cues (tints, blink, flames, HUD glows,
  the boss bar's amber flash) all stay.

## Acceptance Criteria

1. **The set (ST-A).** One family of 8 icons, each a **dark badge 0.56 m** (20 px at 36 px/m; normal blend) + **one glyph of
   light** (ADD, a white-hot core cooling to its colour) looping on its cause's own clock + **a thin ring draining
   clockwise from 12 o'clock** over the real time left (a dim track under it; none for a zone status):

   | Icon | Glyph, colour | Loop | Ring | Bodies, cause (sim) |
   |---|---|---|---|---|
   | STUNNED | amber stars orbiting a dazed swirl | 1 orbit / 1.0 s (the stun breath) | `charge.stunS` 2 s | Behemoth after a crash (`boss/telegraph.ts`, STUN state) |
   | TRAPPED | amber jaws clenching | 2 / s | `bear_trap.holdS` 3 s (Brute × 0.5) | zombie in a bear trap (`buildings/bearTrap.ts`, `holdTicks`) |
   | BURNING | a flame, amber-orange | flicker on the 0.5 s pulse | zombie ignite 3 s (`flamethrower.igniteS`); none for a survivor in a fire zone | zombie `igniteTicks` (`combat/flame.ts`); survivor in car fire / Molotov / flame cone (zone) |
   | ACID | a yellow-green drop | one drop per 0.8 s (2 pulses) | none (zone) | survivor in a Spitter puddle |
   | SLOWED | yellow-green chevrons dragged back | — | Crawler bite 1 s (`crawler.biteSlowS`); gas: zone + 0.25 s | survivor (`player/slow.ts`, one slot, the stronger wins); zombie on spikes (zone, `slowPct`) |
   | DOWNED | a red heart beating | 1 / s | `downedS` 20 s (pauses while revived); a white revive ring fills outside it over `reviveS` 3 s (1.5 s with the kit) | survivor (`player/downed.ts`) |
   | HEALING | a white cross rising | — | none (zone) | survivor in med-station reach (+5 HP/s) |
   | PROTECTED | a white shield with a sheen | — | `returnProtectTicks` 40 (2 s) / the evacuation calm 12.75 s | survivor (`player/hold.ts`, `run/extract.ts`) |

   Not iconised (on purpose, card): knockback (0.2 s), the car-alarm lure (horde-wide), enraged (permanent: eyes + HUD),
   cooldowns, the chainsaw wielder's own slow.
2. **Placement.** Screen-up (north) of the body, 0.3 m over its edge (Behemoth × 1.5 = 0.45 m, icon × 1.5); a row centred
   on the body, 0.62 m apart, **at most 3**, order **downed > burning > acid > slowed > stunned > trapped > protected >
   healing**; never over the body or its gun; the row re-centres when one ends. Pop in 0.12 s (scale 0.6 → 1), fade out the
   last 0.15 s; a zone status ends when the body leaves (+ 0.15 s fade). Brightness: glyph core > ring > bloom > badge; no
   icon brighter than the boss's warnings (no full-bright red except DOWNED).
3. **Statuses from the sim** (pure `render/statusModel.ts`, no Phaser): for each body, the live statuses and their
   time left in **ticks** (shown as a fraction), from:
   - **local** (solo / host mirror): the World directly (`world.players`, `world.zombies` typed arrays `igniteTicks`,
     `holdTicks`, `slowPct`, `world.boss`);
   - **online**: survivors from the synced state (`net/stateView.ts`: `status`, `downedTicksLeft`, `reviveProgress` /
     revive ticks, `slowTicks`, `slowPct`, `protectTicks`), the boss from its synced state; zombies: **burning** from the
     horde stream's burning bit (`hordeFormat.ts:167-175`), **trapped** from `bear_trap.snapped` (kind 41: buildingId, x, y)
     + the zombie on that trap + `holdS` (Brute × 0.5), **spike slow** from the zombie's position over a spike trap's
     footprint (buildings are on the client); zone statuses of survivors (fire, acid, heal) from the client mirror's zone
     tests (`molotovZoneAt` / car fires / `acidFx` puddles / med reach) or the existing cues (`FireCue.burning`, the HUD's
     acid / gas glow sources).
   - **Never a guess the sim disagrees with**: the probe compares the online model with the server's truth over a scripted
     run (bear traps, spikes, a flamer, a Crawler, gas, a downed survivor, a return, the evacuation, the boss crash) and
     every disagreement over 1 tick (rings) / 2 ticks (on/off) is either fixed or carried on the wire (B2).
4. **Caps.** Survivors' and the Behemoth's icons always show. **Zombie icons ≤ 24** (`fx.maxZombieStatusIcons` 24;
   **12 with `?fx=low`**), chosen by importance **Behemoth > Brute / Bloater / Spitter > Runner > Walker / Crawler**, then
   nearest to the camera centre; the pass runs every 8 frames (like 9.13's caps) with no allocation; a zombie that drops out
   of the cap loses its icons at once (no fade). **A hidden zombie shows none** (fog, blackout: only when its body is drawn,
   Q2); survivors' and the boss's icons above the darkness (a new `ABOVE_DARK.status` slot between `rush` 11.765 and `ping`
   11.77).
5. **View.** `render/StatusIconView.ts`: badge and glyph sprites from the `status` atlas (1 badge + 17 glyph pictures of
   96², one 512² atlas), pooled for (4 survivors + 1 boss + 24 zombies) × 3 icons; rings drawn into one Graphics per frame
   (cleared and redrawn, no allocation) or pooled ring sprites (say which). ≤ 13 game objects per body, ≈ 1 m² of ADD.
6. **CR-R's stun icon** is this story's STUNNED icon over the Behemoth (9.21 only removes the CRASH word).
7. **Perf.** `?stress=150` with every zombie burning (a flamer sweeping) and 6 bear traps snapping within 2 FPS and +1 ms
   p95 of master at 1× and 4× CPU; the model's per-frame cost measured (`PERF_ASSERT=1`).

## Tasks / Subtasks

- [ ] T1 `render/statusModel.ts` (pure; local sources) + tests. *(T1–T2 may start before 9.6 lands.)*
- [ ] T2 Online sources + the probe (AC 3); B2 if needed.
- [ ] T3 `docs/art/photoreal-5/src/atlas/status.atlas.ts` (ST-A's `stBake`); `npm run art:fx` (after 9.6).
- [ ] T4 `StatusIconView` + caps + placement + darkness slot (AC 2, 4, 5); GameScene wiring.
- [ ] T5 Tests, gallery, readability sheet 202–209 (one item per icon + the cap), stills `docs/art/9-22/`, perf.

## Dev Notes

### The code today (read before touching)

- **Statuses in the sim** (`packages/shared/src`, 20 Hz): boss STUN (`boss/telegraph.ts`, `boss.json › charge.stunS` 2,
  `stunDamageMult` 1.5); zombie `igniteTicks` (`zombies/zombiePool.ts:81`, `combat/flame.ts`; the boss never ignites);
  `holdTicks` (:60, `buildings/bearTrap.ts`; Brute 50 %); `trapTicks` / `slowPct` (:56-59, spike traps,
  `buildings/trap.ts`); survivor slow (`player/slow.ts`, one slot), downed (`player/downed.ts`), protection
  (`player/hold.ts` `protectTicks`, `run/extract.ts`); zones: `decay/fire.ts` (car fires + Molotov zones, one fire clock),
  `zombies/spit.ts` (acid, survivors only), med station (`buildings` med reach, +5 HP/s).
- **Wire**: players' fields in `net/stateView.ts:22-76` (status, downedTicksLeft, revive progress / ticks, slowTicks,
  slowPct, protectTicks; server `apps/server/src/rooms/schema/syncState.ts`); the horde stream's burning bit
  (`net/hordeFormat.ts:158-175`, states ≤ 7); `bear_trap.snapped` kind 41 (`netEvents.ts:280-282 / :542-543`: buildingId,
  x, y — no zombie id); no zombie hold / spike-slow state on the wire.
- **Client cues today** (kept, Q3): `PlayerView` DOWNED / SLOWED tints, `protectBlink.ts`, `BurnView` (FireCue), the HUD's
  fire / acid / gas glows (GameScene :2472 `bloaterFx.inCloud`), `BossHud` amber stun flash, `FlameView.zombies`
  (burning zombies' flames, nearest first).
- **Visibility**: `ZombieView` draws a zombie only when visible (fog / blackout: `fog.visibility`, the eyes rule within
  14 m); reuse its visibility instead of recomputing. `render/darkness/aboveDark.ts` slots (DARKNESS 11.7; rush 11.765,
  ping 11.77).
- **9.13 caps pattern** (`ZombieView.ts:202-203`: `maxCharacterAnim` etc., halved by low, cap pass every 8 frames, nearest
  the camera centre first).

### Builder decisions (B-numbers; tell the reviewer)

- **B1 The model is pure and in ticks**; the view converts to seconds only for the loops.
- **B2 If the online derivation is wrong** (AC 3 probe), carry the missing zombie statuses on the wire: a new event
  `zombie.status` from this story's kinds **100–103** (e.g. trap hold start with the zombie net id; spike slow on/off), or
  one more bit in the horde state nibble (a protocol change: then bump `NET_PROTOCOL_VERSION`). Prefer the event; say which
  and why.
- **B3 Ignite ring online**: the burning bit has no time left; the ring restarts when the bit appears or the zombie is
  re-hit by a flame cone the client sees (`weapon.flame_*` + the cone test), and counts `igniteS` down. Exact locally.
- **B4 New cap** `fx.maxZombieStatusIcons` 24 (+ schema; `balance.version` changes: re-pin goldens).
- **B5 Importance table** in a client config (`statusModel.ts`), not the balance JSON.

### Guardrails (AGENTS.md §5)

As 9.6. Rendering never changes sim state; Colyseus rules (`this.net.guard`, no zod in `onMessage`) if a message is
added; `bootTestServer()` for server tests; per-client message guard (~10 non-input messages / s) not touched by a server
event; no per-frame allocation; deterministic.

### Testing

- Model, one test per status, solo **and** online (NetSimHost tests with a scripted server): times left exact (rings
  within 1 tick), priority order, max 3, re-centre, zone statuses on enter / leave, the revive ring pausing the downed ring,
  protection 2 s / 12.75 s.
- Caps: 40 burning zombies of mixed types → exactly 24 icons, Brutes / Bloaters / Spitters first, then Runners, then the
  nearest Walkers / Crawlers; 12 with low; survivors and the boss never dropped; hidden zombies none.
- A sim / bot run asserts icons really appeared (bear trap snapped → TRAPPED seen; Crawler bite → SLOWED seen; the boss
  crash → STUNNED for 2 s).
- Browser: every icon on a survivor, a zombie and the Behemoth (× 1.5) at 844 × 390 DPR 2, a blackout and fog wave; stills
  beside the ST card.

### Notes for the merge

- **Touches:** new `render/statusModel.ts`, `render/StatusIconView.ts`, `render/darkness/aboveDark.ts` (one slot),
  `scenes/GameScene.ts` (wiring), `render/fx/atlas/status.*`, `docs/art/photoreal-5/src/atlas/status.atlas.ts`,
  `controls.json` + schema (keep-both), maybe `net/netEvents.ts` + server forwarding (B2), tests, gallery, readability
  sheet, perf doc.
- **Overlaps:** 9.16 edits `ZombieView.flash()` only (this story reads visibility); 9.18 changes the Molotov zone test
  (the survivor's BURNING zone status uses `molotovZoneAt`, so it follows 9.18 automatically); 9.21 removes the CRASH word.
- **Net kinds:** 100–103. **Readability sheet:** 202–209.

### References

- `docs/art/photoreal-decisions.md` (CR-R, ST rules round 3, Q5 protection, "Reco" 1); `docs/art/photoreal-5/src/telegraphs-r2-status.ts`
  (ST_ORDER, ST_MAX 3, BADGE_M 0.56, STACK_M 0.62, ABOVE_M 0.3, POP_S 0.12, OUT_S 0.15, colours `COL`),
  `telegraphs-r2.ts › stA / stCard` (goalFirst, perf, findings); GDD › Art Style › Status icons; Story 8.1 (protection).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
