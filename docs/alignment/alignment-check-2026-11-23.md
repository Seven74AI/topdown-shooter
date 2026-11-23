# Alignment check: planning text vs. later decisions (2026-11-23)

Read-only check (skill `gds-check-implementation-readiness`, run without its interactive menus). It looks for planning text that a **later** designer decision has made out of date. **Nothing has been edited.** The fixes are for `gds-correct-course` to apply once the designer approves.

**Checked:**
- `_bmad-output/planning-artifacts/`: `epics.md` (all of it), the GDD folder (`gdd.md`, `decision-log.md`, the GDD's `epics.md`), `game-architecture.md` and the briefs.
- `docs/ideas/building-ux/ux-spec.md` and `draft-stories.md`.
- The ready-for-dev story files 5.12 and 5.13.
- The playtest readability sheet and its answer key.

**Sources of truth (newer):**
- `docs/epic-5-decisions.md` (E5D) and `HANDOFF.md` §4 (HO)
- the retro §11 briefs, `docs/ideas/epic-6/proposal.md` D1–D7 (P6) and `docs/ideas/customization/`
- the decision and "Senior Developer Review (AI)" sections of the done stories 5.5, 5.9–5.11, 5.15–5.17 and 5.26
- PR #5 (Grenade Launcher lobs over obstacles) and PR #6 (barricades stop bullets)

**Status** (from `sprint-status.yaml`):
- ready-for-dev: 5.12, 5.13
- backlog: 5.14, 5.18–5.25, and Epics 6–10
- everything else in Epic 5 is done

**Severity:**
- **high** means the text would mislead a builder into building the wrong rule, or into failing a correct build.
- **low** means the text is cosmetic, historical, or a done story whose builder already followed the decision.

**Counts:** 90 stale-text rows (some rows bundle several lines of the same fix): **57 high** and **33 low**. There are also **16 open questions** for the designer (§ Open questions).

Line numbers are as of commit `609f9a2`.

**Short paths:**
- EPX = `_bmad-output/planning-artifacts/epics.md`
- GDD = `_bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md`
- ARCH = `_bmad-output/planning-artifacts/game-architecture.md`
- S5.12 / S5.13 = `_bmad-output/implementation-artifacts/5-12-consumables.md` / `5-13-roguelike-card-shop.md`
- RKEY / RSHEET = `docs/playtests/milestone-1/readability-key.md` / `readability-sheet.md`
- UXS = `docs/ideas/building-ux/ux-spec.md`

---

## Cross-cutting: requirements inventory, GDD, architecture (read by every future builder)

| # | Document + section/line | What it says | Newer decision (source) | Proposed new wording | Sev |
|---|---|---|---|---|---|
| 1 | EPX L100 FR53 | "Barricades block zombies and players but not bullets" | Barricades stop bullets (E5D "Barricades stop bullets", PR #6) | "Every barricade tier (wood/reinforced/metal) blocks zombies, players and every bullet (own, teammates', turrets'); aim assist and turret targeting skip zombies behind one. Turrets, sandbags, police barriers and floor buildings stop no bullets. Explosions, flames, melee, acid and gas keep their own rules." | high |
| 2 | GDD L187 Buildings table, Barricade | "players can't pass; bullets pass" | same (PR #6) | "2 m wall; blocks zombies, players and all bullets" | high |
| 3 | GDD L148 Cover; EPX L106 FR56 | "bullets pass over barriers and sandbags but not cars or the bus" | Map rule unchanged but incomplete (PR #6) | append "; buildings, gas pumps, the parking wall and the dumpster also stop bullets; player barricades stop bullets" | low |
| 4 | GDD L115; EPX L43 FR14 | "Melee hits everything inside its arc instantly" | Melee can't hit through barricades and walls (E5D Round B) | "…instantly, except through barricades and shot-blocking map cover (walls, cars, bus, buildings); low cover (sandbags, barriers, traps, mines) doesn't block it. All melee weapons." | high |
| 5 | GDD L109 Grenade Launcher row | "12 m lob, 2 m blast" | Lobs over everything except real buildings; 3 m minimum (E5D "Grenade Launcher lobs over obstacles", PR #5) | "3–12 m lob with a landing ring; flies over cars, bus, pumps, low walls, barriers, sandbags, barricades and turrets; only buildings stop it at their face; aimed onto a car roof it lands at the car's near face; the blast is still shielded by cars/bus" | high |
| 6 | GDD L181; EPX L93 FR49 Consumables | no throw rule | Hand grenades and molotovs reuse the 5.5 lob (inherit PR #5); waves only (S5.12 D3) | add "thrown 2–8 m on the Grenade Launcher's lob (over everything but buildings); grenades and molotovs in waves only" | high |
| 7 | GDD L83; EPX L27 FR4 Aim assist | "projectiles bend up to 8° toward the nearest zombie inside the aim cone" | Assist only when the raw aim would miss (HO §4); skips zombies behind a barricade (PR #6) | "…only when the raw aim would miss, never toward a zombie behind a barricade" | high |
| 8 | GDD L105 Flamethrower row; EPX L1578 (5.4, done) | "4 m, 35° cone" | Flamethrower = FS1 fuel jet 6 m / 20° / 700; separate Gas torch 3 m / 60° / 550 (E5D Round C) | "6 m fuel jet, 20° cone, 700"; add a **Gas torch** row: "3 m, 60° cone, same burn/fuel rules, 550" | high |
| 9 | EPX L42 FR13; L231 coverage; GDD L309 | "The 10 weapons"; "Epic 5 (other 6 weapons)"; "10 weapons, 7 buildings" | 11 weapons incl. the Gas torch (HO §2); bear trap 5.14; barricade ladder | "11 weapons (… Flamethrower, Gas torch …)"; "other 7 weapons"; "11 weapons, 8 buildings + 3 barricade tiers" | high |
| 10 | GDD L118; EPX L47 FR18 Friendly fire | "on at 50% for explosions and fire (grenade launcher, flamethrower burn, bloater gas)" | Bloater blast = full 30 to every player in range, even when a teammate popped it (E5D 5.8 D1); gas only slows | "50% for grenades, mines, molotovs and flamethrower/gas-torch fire. Exception: a Bloater's blast does its full 30 to every player in range, whoever popped it. Bloater gas only slows." | high |
| 11 | GDD L129; EPX L56 FR24 Bloater | "30 blast" | same | "30 to every player in 2.5 m (full, never halved)" | low |
| 12 | GDD L128; EPX L55 FR23 Spitter | no cover rule | Spit flies over barricades/sandbags, is stopped by cars/bus/buildings; acid doesn't hurt across walls/cars/buildings (E5D 5.6, Round B) | append those rules | high |
| 13 | GDD L130/134; EPX L64 FR29 Brute | "W5 first Brute" (implies scaling) | 1 Brute in waves 5–6 whatever the player count, 2 fixed in 7–10; 0.5 s wind-up; 1.8 m reach into narrow gaps (E5D 5.7, P6 §2) | "Brutes are fixed, not scaled: 1 in W5–W6, 2 in W7–10; 0.5 s wind-up; reach 1.3 m (1.8 m into gaps it can't enter)" | low |
| 14 | GDD L136, L41 Pillar 1; EPX L59 FR27 | "Zombie stats never change with waves" | Endless: +6% zombie HP per wave after 600 zombies (P6 D3) | add "(exception: endless beyond wave 15, +6% HP per wave)" | high |
| 15 | GDD L197; EPX L63 FR28 | "at most ≈ 150 alive at once" | 110 while the Behemoth lives (P6 D6) | add "(110 while the Behemoth lives)" | high |
| 16 | GDD L200–206; EPX L71–73 FR33–35 Behemoth | no co-op hook; "Crawlers drop off its back every 4 s"; "slam 4 m radius"; "arrives mid-wave" | Crash stun only: a charge ending on hard cover stuns it 2 s at ×1.5 damage (P6 D1); Crawler every 8/6/5/4 s for 1–4 players; slam picked within 4 m, ring 4.5 m; arrives at 50% of wave 10's spawns (P6 §1) | add the crash-stun bullet and P6 §1 numbers | high |
| 17 | GDD L208; EPX L78 FR37 | "1–2 per run, random, in waves 3–9, never in the same wave as the first Brute" | **Always 2**, two different waves of 3–8, never 5, never back-to-back, never the same event twice (P6 D2) | as stated | high |
| 18 | GDD L211–215; EPX L79–83 FR38–42 Events | car alarm "15 m for 15 s"; gas leak "10 s then explodes"; supply drop "first player to reach it"; power failure "current wave" | Levers kept: car armed 20 s, started by a shot; gas tank shootable after 3 s; crate shows its weapon (list incl. Gas torch, level II, stand 1 s); power failure waves 6–8 only (P6 D7, §6) | add those rules | high |
| 19 | GDD L276; EPX L124 FR68 Endless | "Blackout every other wave; +40 zombies per wave (still max 150 alive) … a Behemoth every 5th wave" | +40/wave up to 600 (wave 15), then +6% HP/wave; blackout on odd waves; +1 Brute/wave (max 6 alive); Behemoth +25% HP each time; one event on each even wave without a Behemoth (P6 D3, §8) | as stated | high |
| 20 | GDD L271; EPX L112 FR59 Stage 1 | "Evening \| open map, full lighting" | Night, not day-night: stage 1 = dusk, darker each stage (HO §4) | "Dusk: open map, the brightest stage (it darkens each stage)" | low |
| 21 | GDD L273; EPX L114 FR61 | "rain begins" | Drizzle from stage 1, heavy rain at stage 3 (HO §4) | "heavy rain (drizzle since stage 1)" | low |
| 22 | GDD L60–62, L163; EPX L122–123 FR67 Extract | no dawn | Dawn on Extract, 4 s (HO §4, P6 §7) | "Extract: the helicopter lifts off into 4 s of dawn, then Results" | low |
| 23 | GDD L192; EPX L99 FR52 Floodlight | "Lights an 8 m circle" | 4 m radius (8 m across), 6 m in blackout; hidden until 6.3 (E5D 5.10, P6 D5; `light.radiusM` / `light.blackoutRadiusM`) | "4 m radius light (6 m in blackout waves); sold once Story 6.3 lands" | high |
| 24 | GDD L188; EPX L99 FR52 Metal barricade | "Upgrade of a wood barricade \| 600 \| +120" | Ladder wood 200/40 → reinforced B8 350/+50 → metal M1c 600/+70 (E5D 5.9) | add a Reinforced row 350/+50; Metal 600/+70 | high |
| 25 | GDD L185–193 Buildings | no bear trap | Bear trap = second trap, Story 5.14, look B-T1 (E5D) | add a row (numbers from 5.14) | low |
| 26 | GDD L59, L71; EPX L36 FR10 Revive | "a teammate standing next to them for 3 s" | 2.0 m centre-to-centre; countdown pauses while revived; downed gun keeps reloading (HO §4) | "a standing teammate within 2.0 m (centre to centre) for 3 s; the downed countdown pauses while someone revives" | high |
| 27 | GDD L178; EPX L92 FR48 Revive kit | "Revive time 3 s → 1.5 s" | The kit belongs to the reviver; the fastest need among standing teammates in the 2 m zone counts; no stacking; a downed kit owner gains nothing (5.11 AC 6 / review L1) | as stated | high |
| 28 | GDD L169–171; EPX L90 FR46 Shop | "Always available: all unlocked buildings and consumables, repairs, and upgrades" | Build bar replaces the shop for buildings (5.16); can't buy while downed/out (`not_alive`, 5.11 M1); `inShop:false` items hidden | "Shop: consumables and upgrades for owned weapons, plus 6 cards. Buildings come from the build bar. A downed or out player can't buy." | high |
| 29 | GDD L171; EPX L91 FR47 Cards | "6 random cards … Reroll: 20" | No locking, no upgrade cards, no Pistol card, rarity by price, no per-wave price scaling, C3 look (E5D 5.13) | add those rules | low |
| 30 | GDD L88; EPX L97 FR50 Placement | "tap a building in the shop, then tap the ground … 1 m grid … drag to rotate" | "B · Carry + drag" with the build bar (UXS §15, 5.15–5.25); 0.5 m lattice (HO §4) | "pick a building in the build bar, carry its ghost and drag to place (0.5 m lattice); red at once, green only after 250 ms clear" | high |
| 31 | GDD L72, L183 | "on a 1 m grid" | 0.5 m lattice anchored by its min corner (HO §4) | "on a 0.5 m lattice" | high |
| 32 | EPX L215 UX Design Requirements | "No UX design document exists yet … placement input defined in Story 3.4" | The building UX spec exists (UXS, designer picked B) | point to UXS and Stories 5.15–5.25 | low |
| 33 | ARCH L205; EPX L202, L211 Assets | "Placeholder/AI art in the same atlas layout as final art so Epic 9 swaps files" | All art drawn in game code, baked atlases, every texture through `addGeneratedTexture` (E5D Art method; Story 4.13) | "Art is drawn in game code (`render/city/*`) into atlases with `category_name_variant` frames, each registered through `addGeneratedTexture`; AI/vector images are references only." | high |
| 34 | ARCH L319, L172 | "atlases/ # characters.png/.json, downtown.png/.json"; "Preload (district atlas, sprites…)" | same | "atlases are generated in code at load (no character/district PNGs)" | high |
| 35 | GDD L314, L353; GDD decision-log L19 | "placeholder or AI-assisted art (Epics 1–8)" | same | as #33 | low |
| 36 | ARCH L159, L190; EPX L186 | "no full rewind in v1"; "keeps 300 ms … for rewind if > 1 in 20" | 2.12 shipped: rewind ≤ 6 ticks / 300 ms; spread keyed to the input seq (HO §2) | "the server rewinds zombies to what the shooter saw (≤ 6 ticks / 300 ms); boss hits are not rewound (P6 §1.5)" | high |
| 37 | EPX L195 Hosting; ARCH L166, L553 | "Caddy 2.11 (HTTPS/WSS + static client)"; "subdomain on the user's domain" | TLS at the Cloudflare Tunnel; Caddy plain HTTP on 127.0.0.1:8080; https://hordes.sevend.io; Hermes deploys (HO §4) | as stated | low |
| 38 | ARCH L540; EPX L177 | "Time inside the simulation is in seconds (dt)" | Simulation timers count ticks (HO §3) | "timers in ticks; rates in SI units" | low |
| 39 | ARCH L452, L426; EPX L188 | "Client `DecayView` … swaps Tiled visual layer groups" | `DecayView` is gone; visuals in `render/city/*`; map built by `tools/maps/buildDowntown.ts` (HO §2–3) | update the names | low |
| 40 | ARCH L294–299; EPX L199 Debug | "Dev cheats … stripped from release" | `?wallet` (solo), `?loadout`, `?lag`, `?debug` are release-safe (HO §2) | list the release-safe switches | low |
| 41 | GEP L31/34/42; GDD L324; EPX L209, L246, L323, L327 | "5 waves" / "5-wave curve" | The run is 6 waves until 6.1 makes 10 (HO §2) | keep as history, add "(now 6 waves; 6.1 makes 10)" | low |
| 42 | GDD decision-log (whole file) | ends at the Epic 2 decisions | Later decisions live in E5D, HO §4, P6 §0 | add a pointer line to those three | low |

## Epic 4 carry-over: briefs and the playtest sheet (still used by Epic 5+ builders and by 4.10)

| # | Document + section/line | What it says | Newer decision (source) | Proposed new wording | Sev |
|---|---|---|---|---|---|
| 43 | EPIC 5 BRIEF line 5 (`epic-4-retro-2026-11-23.md` §11; copied into every 5-* story, e.g. S5.12 L19) | "Projectiles and areas (grenades, spit, flames, blasts, puddles) respect 4.2 cover: car/bus/buildings stop them, barriers/sandbags only stop bodies" | PR #5 lob-over; PR #6 barricades stop bullets | "Bullets stop at map cover and at every barricade tier. Lobbed rounds (launcher, grenade, molotov) are stopped only by real buildings. Spit, flames, blasts, acid and gas: cars, bus and buildings stop/shield them. Sandbags, barriers, turrets and floor buildings stop bodies only." | high |
| 44 | EPIC 4 BRIEF line 6 (`epic-3-retro` §11) | "melee ignores cover" | Melee blocked by barricades and walls (E5D Round B) | Superseded by the EPIC 5 BRIEF; add a "superseded" note (in case it is reused) | low |
| 45 | EPIC 5 BRIEF lines 12 and 15 (in every 5-* story) | "the 4.10 phone numbers are the floor"; "start from the 4.10 earnings decision" | 4.10 deferred "way, way later" and no longer blocks Epic 5; earnings stay as built; Epic 5 balance pass after round E (sprint-status, HO §5) | "the latest recorded `?stress=150` baseline is the floor"; "earnings stay as built (4.10 deferred); balance pass after round E" | high |
| 46 | RKEY L15, L20, L21 (wood, reinforced, metal barricade) | "**through** (stops bodies only)" | Barricades stop bullets (PR #6) | "**stop** (stops bodies and bullets)" | high |
| 47 | RKEY L40 (#31 landing ring at a car) | "cars, the bus and buildings stop the round … a round never flies over a car" | Lob over (PR #5) | "aimed onto a car's roof it lands at the car's near face (amber ring); aimed past a car it flies over it; only buildings stop it" | high |
| 48 | RSHEET L116–117 (picture `32_landing_ring_car.png`) | "the orange ring at the car" | same | retake the picture with the aim on a car roof, or caption it "aimed onto the car's roof" | low |
| 49 | RKEY L30 (#29 Bloater) | "barricades and sandbags don't [shield you]" | Correct for blasts (PR #6 is bullets only); no change, but say "blasts" | "(blasts are not stopped by barricades, even though bullets are)" | low |

## Epic 5 (ready-for-dev and backlog)

| # | Document + section/line | What it says | Newer decision (source) | Proposed new wording | Sev |
|---|---|---|---|---|---|
| 50 | S5.12 AC 5 L44 (grenade) | "the ground track is stopped at the face of a car, the bus or a map building … barriers/sandbags/barricades do not stop it" | Lob over all but `building: true` boxes; a car roof → near face (FR-B2); blast still shielded by cars/bus (PR #5; `combat/grenades.ts`) | "5.5 FR-B/FR-B2: the round flies over cars, the bus, pumps, low walls, barriers, sandbags, barricades and turrets; only a real building stops it, at its face. An aim point on a car/bus roof lands at its near face. The blast is shielded by cars, the bus and buildings (FR-C)." | high |
| 51 | S5.12 AC 6 L45 (molotov) | "same clamp and cover stop" | same | "same clamp and FR-B/FR-B2 lob rule as AC 5" | high |
| 52 | S5.12 C7 L62, C15 L70, T3 tests L83, Dependencies L138 | "The round stops and explodes at the bus face"; "a car 1 m ahead still explodes the round there"; "track stopped at cover faces" | same | C7: "aimed past the bus it flies over and bursts behind; aimed onto the roof it lands at the near face"; C15: "aim point on a car 1 m ahead → near face, 20 to you; aim beyond → flies over"; tests: flies over a car / car roof → near face / building face stops it | high |
| 53 | S5.12 T0 L75; AC 10 L49; T7 L91 | "~5 Meshy proposals each … the grenade body is 5.5's sprite"; "molotov zone like the 4.8 car fire (F6 pick)"; "a grenade blast is 5.5's" | Art in game code; round D picks: CI4 icons, HG1 grenade (HG2/HG3 variants; "not 5.5's 40 mm round"), MB1 molotov (MB2/MB3 random); EX2 shockwave for the hand grenade; fire = fire-lab D (E5D Art method, Round C, Round D) | "T0 done: port CI4, HG1 (+HG2/HG3), MB1 (+MB2/MB3) from `docs/art/epic-5/round-d/looks.html` into code (`addGeneratedTexture`); ground fire reuses 4.12's fire-lab D; hand-grenade blast = EX2" | high |
| 54 | S5.12 AC 2 / T2 L80 buy order | "`not_build` → `unknown_player` → `not_for_sale` → `already_full` → money" | `not_alive` after `unknown_player` in `buyItem` (5.11 review M1) | insert "→ `not_alive`" and the test "downed/out in build → refused, wallet unchanged" | high |
| 55 | S5.12 AC 1 L40 button visibility | hidden "with an empty slot, while downed/out, in placement mode, shop or menu open" | 5.16 D3: swap/ammo hidden while the build bar shows; the consumable button sits in the same place | add "…and while the build bar / action bar shows" (see open question Q1) | high |
| 56 | S5.13 Categories table L48; AC 1 L70; T6 L134; Must-preserve L193; Current-state L183 | Always-available **Buildings** row ("Wood barricade 40 … Tap → placement (3.4)", "Metal barricade is the +120 Upgrade"); "open with … buildings" | The build bar replaces the shop for buildings (5.16 AC 4); ladder +50/+70 (5.9) | delete the Buildings row; add "Not in the shop: buildings (build bar, 5.16); upgrades by tapping a barricade (+50 reinforced, +70 metal)"; the shop opens from the build bar's 🛒 tile | high |
| 57 | S5.13 AC 5 L74, AC 6 L75 | buy and reroll check orders without a standing check | `not_alive` (5.11 M1) | insert "→ standing (`not_alive`)" after "known player"; test "downed in build: card buy and reroll refused, no charge" | high |
| 58 | S5.13 T0 L104–106; D10 L161 | "~5 Meshy proposals … 9-slice WebP/PNG"; "Designer picks from C1–C5" | C3 "police evidence tag" already picked (E5D table); art in code | "T0 done: C3; draw frame and rarity tapes in code (CSS, or Canvas via `addGeneratedTexture`)"; D10 = C3 (decided) | high |
| 59 | S5.13 Weapons row L46; D2 L153; Depends L38 | no Gas torch; epic tier "Chainsaw, Flamethrower, Grenade Launcher" | Gas torch 550 (E5D Round C) | add "Gas torch 550" to the list and to the epic tier (> 500) | low |
| 60 | S5.13 D13 L164; Repairs row L51 | "the first build buys barricades / medkit"; "Repair: tap a damaged building" hint | Buildings from the build bar; 5.21 action bar | "…buys buildings from the build bar or a medkit"; "Repair: tap a building" | low |
| 61 | EPX L1756–1757 Story 5.13 ACs | "an always-available section (buildings, consumables, repairs, upgrades…)"; "weapons and gear I already own are not drawn" | 5.16; `inShop:false` never drawn; no Pistol card (5.10 D5, 5.11 AC 7, E5D 5.13) | "(consumables, upgrades for weapons I own; buildings are in the build bar, 5.16)"; add "items with `inShop:false` are never drawn; the Pistol is never a card" | high |
| 62 | EPX L1903 Story 5.20 AC 1 | `sellBuilding` order "unknown player → not build phase → gone → not owner" | The standing check for building actions moved to 5.20 (5.11 re-review R2) | "unknown player → `not_alive` → not build phase → gone → not owner"; new AC: "5.20 adds the same check to place, repair and upgrade; tests for downed/out in each" | high |
| 63 | EPX L1940 Story 5.22 AC 1 | `moveBuilding` "unknown player → not build phase → …" | same | insert "→ `not_alive`" | high |
| 64 | EPX L1922 Story 5.21 AC 1 | action bar opens on a building tap, no downed rule | Build bar hidden while down (5.16 D5) | add "hidden while I'm downed/out" | low |
| 65 | EPX L1786–1792 Story 5.14 Bear trap | no bullet/melee/icon rule | Floor buildings stop no bullets (PR #6) and no melee (E5D); later buildings get an I1 build-bar icon (5.26); look B-T1 drawn in code | add "non-solid: stops no bullets and no melee (like 5.9 traps); I1 build-bar icon drawn in code; world look B-T1" | high |
| 66 | EPX L1851 Story 5.17 AC 7 (done; read by 5.18/5.19) | "A reason stays on screen ≥ 250 ms before switching back to valid" | Red is instant; valid needs 250 ms of continuous clear, and every blocked frame restarts the clock (5.17 review L1) | as stated | low |
| 67 | EPX L1701 Story 5.10 (done; read by 6.3) | "it lights an 8 m circle" | 4 m radius, 6 m in blackout (`light.blackoutRadiusM`); E5D says "noted in Story 5.10", but only the story file has it | "lights a 4 m radius (8 m across; 6 m in blackout waves)" | low |
| 68 | EPX L1722 Story 5.11 (done) | "Revive kit cuts my revive time from 3 s to 1.5 s" | The kit belongs to the reviver (5.11 AC 6) | "I revive teammates in 1.5 s (fastest reviver in the zone counts; no stacking; no effect on my own revive)" | low |
| 69 | EPX L1679–1680 Story 5.9 (done; copied into S5.13) | "Upgrade (+120) … metal barricade 600 HP" | ladder +50 / +70 | "Upgrade (+50) → reinforced 350 HP; again (+70) → metal 600 HP" | low |
| 70 | EPX L1828, L1831 Story 5.16 (done) | "the building's icon (same code-drawn art as in the world)"; hidden list | 5.26 I1 icons (world art fallback); swap/ammo/consumable button hidden while the bar shows; bar hidden while downed | update both lines | low |
| 71 | UXS §8 L191–199; draft-stories F1–F7, BX-6 AC 1, BX-8 AC 1 | no "alive" fairness rule | `not_alive` / 5.20 standing check (5.11 M1, R2) | add rule 9 / F8: "Standing only: every place/move/sell/repair/upgrade is refused while downed/out" | low |
| 72 | UXS §13 L264, §10 L222; draft BX-3 AC 7 | "hold a reason ≥ 250 ms before switching back"; "colour cross-fade 80 ms" | 5.17 hold rule (red instant, 250 ms clear) | "blocked → red at once; → valid only after 250 ms of continuous clear" | low |
| 73 | UXS §4 L78–80, §3 L60–66, §7.2 L156/160/164, §12 L245; draft BX-2 AC 2, BX-3 AC 4 | reason line 17 px above the item chip; tile icon = world art; "Blocked by **the** car"; zombie "body red-tinted"; spawn circles "in view"; "puts it away with a tap on its tile"; tile order | As built in 5.15 (18 px, 6 px above ✕), 5.17 (D3 "a car", D5 red circle, D7 every stage's spawn circles), 5.16 (Shop fixed bottom-right, bar hidden while holding), 5.26 (I1 icons) | bring the spec in line with the built stories (one edit pass) | low |

## Epic 6 (backlog). Epic 6 in epics.md already matches the revised stories and D1–D7, except for:

| # | Document + section/line | What it says | Newer decision (source) | Proposed new wording | Sev |
|---|---|---|---|---|---|
| 74 | EPX L2064–2065 Story 6.3 | "**When** the shop is built … Floodlight and Tactical flashlight are in the shop from wave 1" | The Floodlight is a build-bar tile, not in the shop (5.16 AC 1/4) | "When the build phase opens, `inShop` is true for both: the Floodlight shows as a build-bar tile (5.16) and the Tactical flashlight can appear as a gear card (5.13), from wave 1" | high |
| 75 | EPX L2213 Story 6.9 Gas leak | "players within 6 m take 60 damage (friendly fire, as with Bloaters)" | The Bloater rule is FULL damage (E5D 5.8 D1); "friendly fire" reads as 50% | "every player within 6 m takes the full 60, even when a teammate shot the tank early (same rule as the Bloater blast)" | high |
| 76 | EPX L2111, L2125 Story 6.5; L2218 Story 6.9 | missing: the boss's own flow field (inflated 2 m, rebuilt every 0.5 s, barricades/turrets costed), 100 damage/s to buildings it walks into, art in code (5 poses, `addGeneratedTexture`), outline and eyes above the darkness; crate above the darkness | P6 §1.1, §1.6, §5, §9 (missing from both revised-stories and epics) | add these lines to 6.5 / 6.9 | high |

## Epic 7 (backlog)

| # | Document + section/line | What it says | Newer decision (source) | Proposed new wording | Sev |
|---|---|---|---|---|---|
| 77 | EPX L2361 Story 7.3 unlock list | "Fire Axe 150 … Grenade Launcher 500; Spike trap 100, Mine 100, Floodlight 120, Metal barricade 150, Med station 300" | Gas torch (E5D Round C) and Bear trap (5.14) have no unlock, so a pool-only 7.4 draw never offers them; metal is an upgrade tier of the barricade (5.9 ladder) | add "Gas torch ⟨price⟩", "Bear trap ⟨price⟩"; "Barricade upgrades (reinforced + metal) 150" (prices: Q3) | high |
| 78 | EPX L2378 Story 7.4; L2295 Epic 7 intro; L2376–2377 | "the always-available section shows only my unlocked buildings and consumables"; "unlocks that add cards to their own shop" | Build bar replaces the shop for buildings (5.16); card rules (E5D 5.13) | "the build bar shows only my unlocked buildings; the shop's always-available section only my unlocked consumables"; "…cards to their shop and tiles to their build bar"; add "no Pistol card, `inShop:false` never drawn, no upgrade cards, no locking" | high |
| 79 | EPX L2509 Story 7.9 | "phone FPS matches the 4.10 numbers (the floor)" | 4.10 deferred, numbers may not exist | "within 2 FPS of the latest recorded `?stress=150` baseline in `docs/perf/`, and meets NFR1" | high |

## Epic 8 (backlog)

| # | Document + section/line | What it says | Newer decision (source) | Proposed new wording | Sev |
|---|---|---|---|---|---|
| 80 | EPX L2691 Story 8.4 autosave contents | "(players by slot with wallets, loadouts, upgrades, gear; buildings; wave; decay stage and plan; event schedule; every PRNG stream state)" | Later epics added run state: barricade tier, rotation, owner; consumable slot and count; current card offer (5.13); light/blackout state; boss; endless counters; loot bag and pending item (7.12); rewards-after-wave-10 flag (6.12) | extend the list with those fields | high |
| 81 | EPX L2711 Story 8.5 Save and quit (in a build phase) | "the host taps Save and quit … the run is saved" | Building UX adds held ghosts, pending placements, the 10 s undo window and take-back (5.15–5.22) | add "held ghosts are put away, pending placements resolve first, and the undo/take-back window closes (on resume, buildings count as placed in an earlier phase)" | high |

## Epic 9 (backlog), which still assumes a hired artist and sprite art

| # | Document + section/line | What it says | Newer decision (source) | Proposed new wording | Sev |
|---|---|---|---|---|---|
| 82 | EPX L2760–2762 Epic 9 intro; L2772–2774 Story 9.1 | "Final assets replace placeholders"; "hire an artist"; "every atlas and frame … animation names and frame counts … for the artist" | Art method: drawn in game code, baked atlases, picks from code-drawn proposals, two-pick rule (E5D) | rewrite per Q2. Default: "art is drawn in code; 9.1 lists every generator, atlas, `category_name_variant` frame and every picked look id (P4, BR1–5, BL1–5, FL1/FL5, MS10, GR6, CI4, HG1, MB1, C3, I1/T1/M1)" | high |
| 83 | EPX L2805–2807 Story 9.3 | "4 color variants (blue, orange, green, purple)"; "per weapon type (… flamethrower, launcher) … animations" | Customization: each player's look drawn into a per-player texture at join; slot colour only on the ring, name and arrows (7.8/7.9); 11 weapons incl. Gas torch | "the body comes from the player's look (7.8/7.9); slot colour only on the ring, name and edge arrows; holding poses per weapon family incl. Gas torch, within 7.9's budget" | high |
| 84 | EPX L2821–2824 Story 9.4 | zombie atlas "walk, attack and death animations, plus telegraph poses" | Picked looks: Spitter P4, Brute BR1–5 and Bloater BL1–5 as random variants, Brute wind-up with arms under the clothes; Behemoth 5 poses drawn in code (E5D, P6 §9) | "code-drawn, keeping the picked looks and variants; telegraph poses incl. the Brute's wind-up and the Behemoth's walk/slam/charge/throw/stun-roar" | high |
| 85 | EPX L2861 Story 9.6 | "muzzle flashes, blood, fire, acid, gas, explosions … use final art" | Fire = fire-lab D (4.12); EX1 (launcher), EX2 (mine, hand grenade), FS1 / FS2 streams; weather tied to decay | "…code-drawn, keeping fire-lab D, EX1, EX2, FS1, FS2; rain follows decay, fog at stage 5" | high |
| 86 | EPX L2877 Story 9.7 | "the HUD, shop cards, lobby, evacuation vote, ping icons …" | Build bar, action bar and I1 icons (5.16/5.21/5.26); C3 cards; GR6 gear and CI4 consumable icons; survivor editor (7.10) | list those, "code-drawn UI art, keeping the picked looks" | high |
| 87 | EPX L2840 (9.5), L2894 (9.8), L2928–2934 (9.10), L2788–2790 (9.2) | gore pieces with no medium; ambience with no drizzle; "about 30 weapon sounds"; 5 visual states | Art in code; drizzle from stage 1; 11 weapons (Gas torch distinct), grenade/molotov throws, Brute 0.5 s wind-up, Behemoth telegraphs and event cues; one night, dawn only on extract | small additions as stated | low |

## Epic 10 (backlog)

| # | Document + section/line | What it says | Newer decision (source) | Proposed new wording | Sev |
|---|---|---|---|---|---|
| 88 | EPX L3077–3079 Story 10.8; L3093–3095 Story 10.9 | balance pass from "run stats, bot runs and playtest notes"; "3 game nights" | 4.10 deferred; the earnings fallback (15 × N), solo Behemoth HP 0.4 vs 0.3 (P6 §1.7) and `loot.runChance` were left to the playtest | 10.8: "settles what 4.10 left open (earnings model, solo Behemoth HP, loot chance)"; 10.9: "if 4.10 never ran, its Milestone 1 checks run in the first game night" | high |

## The decision docs themselves (small, low)

| # | Document + section/line | What it says | Newer decision | Proposed new wording | Sev |
|---|---|---|---|---|---|
| 89 | `docs/epic-5-decisions.md` L7 | "the designer chooses the look from ~5 Meshy proposals" | the same file's Art method: code-drawn proposals | "…from ~5 code-drawn proposals (Meshy/vector only as references)" | low |
| 90 | EPX L335 Epic list | "meets the special events" | always 2 (P6 D2) | "meets two special events" | low |


---

## Open questions for the designer (no decision exists yet)

| # | Question | Where it bites | Recommendation |
|---|---|---|---|
| Q1 | **Medkit in build phases vs. a hidden button.** 5.12 allows the medkit in build phases, but 5.16 hides the bottom-right buttons whenever the build bar shows (almost the whole build phase), so on touch the medkit can't be reached. | 5.12 (ready-for-dev) | Move the consumable button (and swap) above the grid's left edge in build phases, as 5.16 D3 already suggests. The alternative is a waves-only medkit (the build-start heal already gives 50 %). |
| Q2 | **Epic 9 "hired artist / final assets" vs. "all art is game code".** Is Epic 9 a polish pass of the code-drawn art (artist as art director or reference) or a real asset swap? | Epic 9, GDD L314/L353, FR82/FR86 | Polish code-drawn art; hire a sound designer only. Rewrite the Epic 9 goal accordingly (rows 82–87). |
| Q3 | **Supplies unlock prices** for the Gas torch, the Bear trap and the barricade tiers. | 7.3 / GDD Progression | Gas torch 350 (below the Flamethrower's 400), Bear trap 100 (like the Spike trap), one "Barricade upgrades" unlock for both tiers at 150. |
| Q4 | **Small-phone layout:** the 5.20 undo chip overlaps the slid Ready button at 568×320, and the action-bar sizes disagree (epics 78×56 @112 vs. spec 64×56 @92). | 5.20, 5.21 | Undo chip above the bar's top-left; keep 78×56 @112; ACs checked at 568×320 and 800×360 with ≥ 12 px gaps. |
| Q5 | **Nobody owns the item chip.** 5.18 and 5.19 assume it exists, but 5.16 didn't build it. | 5.18 | Make it an explicit 5.18 AC (160×32, reason line above it). |
| Q6 | **Molotov fire across walls and cars.** Acid doesn't hurt across walls/cars/buildings, but molotov zones use plain overlap, so a zone at a car's face burns 3 m behind it. | 5.12 | Same rule as acid: a clear line from the zone centre, plus a test. |
| Q7 | **Bear trap:** how does it treat the Brute and other heavies, and does it re-arm or wear out? | 5.14 | The Brute is held for half the time; the trap wears out after N grabs, and Repair (5.21) re-arms it, so no new button is needed. |
| Q8 | **Boss and event cover rules:** does the Behemoth slam or throw care about walls/barricades? Does the gas-leak blast respect car/bus shielding? Does Ruins rubble stop lobs, melee and blasts? | 6.2, 6.5, 6.6, 6.9 | Slam and throw ignore cover ("the drawn zone is the promise"). The gas leak uses the normal blast line-of-sight. Rubble stops melee and blasts, and lobs fly over it (it is not `building: true`). |
| Q9 | **Downed players and event pickups:** can a downed player take the supply crate, or lead the survivor NPC? | 6.9, 6.10 | Standing players only (like `not_alive`). |
| Q10 | **Who owns the earnings decision** now that 4.10 is deferred? | GDD Economy, 10.8 | The Epic 5 balance pass after round E; record it in the GDD Economy section. |
| Q11 | **Building cap of 6 per player** while bear trap, floodlight and med station compete for the slots. | GDD L183, FR51, build bar "k/6" | Keep 6; review it in the Epic 5 balance pass. |
| Q12 | **Solo status:** GDD Out of Scope says "solo is not a supported target", but solo online runs exist at × 0.4, and P6 asks whether solo Behemoth HP should be × 0.3. | GDD L347, FR31 | Reword to "solo is allowed, not balance-tuned"; add × 0.4 to FR31. |
| Q13 | **Card pool exhaustion:** when a player owns every unlocked weapon and gear item, 6 cards can't be filled. | 7.4 (and 5.13 with few items) | Show fewer cards and disable Reroll when no new draw exists. |
| Q14 | **Ping button placement** vs. the build bar and hand cluster; should pings show above the blackout darkness? | 8.7, 6.3 | Top-right or by the minimap, hidden while holding a building; pings draw above the darkness. |
| Q15 | **Reference phones:** 7.9 budgets on an "Honor 10", but NFR1 and 10.2 list iPhone 12 / Pixel 5 / Galaxy A52. | 7.9, 10.2 | Confirm the Honor 10 is a real test phone. If it is, add it to 10.2 as the low-end floor. |
| Q16 | **Turret kill pay during the 120 s reconnect hold** ("turret kills pay the owner" vs. "no kill rewards after leaving"). | 8.1 | Keep paying into the held wallet during the 120 s, then stop. |

Lower-priority notes for the same pass: 5.13's card frame medium (the shop is Preact DOM, so draw C3 in CSS); 10.1 needs its own `settings` field/migration; 7.5 Training may be absorbed by the customization level-system idea (add a "revisit before building" note); the readability sheet's fill-in block stops at 29 while the pictures go to 38.

## Checked and already aligned

- Epic 6 in epics.md matches `docs/ideas/epic-6/revised-stories.md` and D1–D7, apart from rows 74–76.
- Stories 7.8–7.12 match the customization proposal.
- Nothing in scope still mentions offline/Bluetooth play, player zoom, GitHub Pages, or a day-night cycle. The view stays 24 × 13.5 m and the horde is sent for the view + 4 m.
- The GDD's "no weak points" line agrees with D1.
- The UX spec never says barricades can be shot over.
- Stories 5.15, 5.18, 5.19, 5.23, 5.24 and 5.25 in epics.md match the built stories.
