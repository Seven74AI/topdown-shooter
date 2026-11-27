# Sprint change proposal: Epic 11 after Epic 12 (2026-11-27)

**Trigger:** the Epic 11 vs Epic 12 readiness check (`epic-11-vs-12-readiness-2026-11-27.md`, findings F1–F14). Epic 11 (random city, backlog, post-v1) was planned before Epic 12 (extraction cinematic, done) was built.
**Mode:** batch. **Scope:** minor. Only epics.md's Epic 11 text changes (plus one line in ADR-06 and a note in the 12.2 story file). No code and no Epic 12 change. **Status: waiting for the designer's picks D1–D5. Nothing is applied yet.**

## 1. Issue summary

Epic 12 added rules that every map must meet: an `evac_pad` that anchors the no-forts check, a walk to the pad capped at 8 s, a fly-out horde of 150 Walkers drawn from the spawn points, a white fade timed to the helicopter crossing the east edge, and no refund for decay losses. Nothing in Epic 12 is tied to Downtown in code. On a 70 × 70 m city, though, the distances and time budgets don't fit Epic 11's ACs as written. The two highs are the walk distance (F1) and the city-building time (F2).

## 2. Impact

- **Epic 11:** ACs of 11.1, 11.2, 11.3, 11.5, 11.6 and 11.7 and the epic's readiness note change. Story count and build order are unchanged.
- **Epic 12:** no change. One line in the 12.2 story file corrects "Epic 11 takes protocol 6" to 7.
- **GDD / architecture:** ADR-06 gets one line (where the checks run, per D2). The GDD needs nothing unless D1 = A changes the ≤ 20 s line in FR67.
- **Code:** none now. Epic 11 is still post-v1.

## 3. Designer choices (codes, options with numbers, one recommendation)

**D1: the walk to the helicopter in a big city (F1).** Today a survivor walks at 4.5 m/s for at most 8 s, so about 36 m. Downtown's farthest spot is about 29 m from the pad. A 70 × 70 m city's corners are about 49 m away in a straight line, and more along the streets.
- **A** A longer walk in Random city: walk cap 8 → 13 s (about 58 m), and the fly-out shortened from 8 → 6.5 s so the ending stays ≤ 20 s (13 + 0.5 + 6.5).
- **B** *(recommended)* The survivors jog in Random city: autopilot at 1.5× walk speed (6.75 m/s, about 54 m in 8 s). Every timing stays as built (ending ≤ 16.5 s), and Downtown is unchanged. Pass line: at most 10 % of walks end in the timeout cut over the 8-seed sim.
- **C** Accept it: far survivors get the black fade cut, as it works today.

**D2: who runs the fairness checks (F2).** Check A alone is about 160 path floods per try: about 70 ms on the server and about 300 ms on a phone, against 11.1's 20 ms / 150 ms budget, which includes up to 20 tries.
- **A** *(recommended)* The server builds and checks the city once when the run starts (budget ≤ 500 ms, before the first tick). It sends the seed it accepted, and phones build only that city with no checks (≤ 150 ms). The city code is already that accepted seed.
- **B** Every phone also runs the checks, behind the loading screen (budget ≤ 2 s on a phone, 4× CPU headless).
- **C** Cheaper check A: only the 5 stages × 4 worst-case masks (20 floods). Faster, but a rare bad variant could slip through.

**D3: the fly-out horde in a big city (F6).** 150 Walkers move about 10 m in the 8 s fly-out. Downtown's spawn edges are about 16–24 m from the pad; a 70 × 70 m city's are about 35 m away, so the crowd would stay far from the helicopter.
- **A** Keep as built: round-robin over every open spawn point.
- **B** *(recommended)* Random city only: the horde spawns from the open spawn points within 25 m of the pad (at least the nearest 4). Downtown is unchanged.
- **C** Random city only: spawn the horde on open road in a ring 12–20 m round the pad (always on screen at 0.6× zoom; no spawn point is needed).

**D4: the "Restart with seed" admin cheat on a city the host typed in (F10).**
- **A** *(recommended)* Keep the typed city. Only decay picks, events and shop cards change with the new seed.
- **B** A new city from the new seed.

**D5: decay losses in a city nobody knows (F12, 12.4 "bad luck").** In Downtown players learn which alleys collapse. In a random city they can't.
- **A** *(recommended)* No hint, as you decided for 12.4: building near a side street is a gamble.
- **B** The build ghost shows "May collapse" within 2 m of a candidate rubble street (1 of 3 falls at stage 4). Text only, no new art.
- **C** The 3 candidate streets show cracked fronts from stage 3. This is new art and needs a look pick (dead-city-model).

## 4. Edits to epics.md (applied once you approve, with your D picks filled in)

**Epic 11 readiness note.** (a) `SAVE_SCHEMA_VERSION` is 2 today, so Epic 11 makes it 3. (b) Protocol: Epic 11 takes **7**, or the next free number when it lands (6 since 10.12). Free net-event kinds start at 76. Add: "(f) Epic 12 (2026-11-27 cross-check): every map needs exactly one clear `evac_pad`, no map-level pocket, a pad within walking time and a horde that reaches the pad; see `epic-11-vs-12-readiness-2026-11-27.md`."

**11.1** Budget line: per D2, e.g. (A) "≤ 150 ms on the phone to build the accepted city (no checks); the server builds and checks it once at run start, ≤ 500 ms, retries included".

**11.2**
- Check A becomes: "`verticesOutsideMainRegion(world) === 0` (Story 12.1's `pathOpen` grid, 0.4 m player clearance, anchored at the `evac_pad`) at every stage × every `gameplayDecayMasks` mask" (F3).
- Anchor check adds: "exactly one `evac_pad`; its 3 m `evac.padRadiusM` circle is free of solids and cover at every stage × mask; a city with 0 or 2 pads is rejected (test)" (F4).
- Adds: "the pad's x lets the helicopter cross the east edge at least 1 s before the fly-out ends (`flyOutDxM`, 1,000-seed test)" (F11).
- Adds the D1 rule, e.g. (B) "Story 12.2's walk test runs on generated maps: from every start spot the autopilot reaches the pad".

**11.3** Stage 4 rubble: "rubble in a dead end sits at its closed end or fills it to the end; nothing behind rubble is left as a free pocket (check A)". Add: "decay losses give no refund (12.4) and 12.1's 0.8 m clearing and stage re-check apply unchanged (test on a generated city)". Plus the D5 line if B or C.

**11.5**
- The whole-run AC becomes: "…reaches the Behemoth, the vote and the extraction: everyone boards, `run.lifted`, ending `extracted`, Results; the share of timeout cuts is recorded per seed (pass line from D1)" (F5).
- Adds: "on a 70 × 70 m city at 4× CPU (`PERF_ASSERT=1`, load recorded): the 12.1 per-placement check < 3 ms, ghost drag with no frame over budget, the build-start re-check with 100 walls median < 30 ms and max < 50 ms" (F7).
- Adds: "the sim logs money lost to decay per run for 10.8" (F12).
- Adds the D1 (speed or cap) and D3 (horde points) rules as `districts.json` overrides (Downtown unchanged).

**11.6** The designer stills for 3 seeds add the extraction (walk, lift-off, white). The 10.2 wave-9 stress row and the 10.3 texture row are re-run on one generated city and recorded next to Downtown (F11, F14).

**11.7** "`npm run stats` groups every `random:<code>` row as one 'Random city' line (codes listed under it); test" (F9). Plus "Restart with seed (10.12) keeps / replaces the typed city" per D4.

**Epic list (epics.md:429-435)** Move the "FRs covered: FR32, FR65, FR69, FR90–FR94" line under Epic 11, and make the Epic 12 heading `##` (F13).

**Elsewhere:** ADR-06 gets one line for D2. In `12-2-extraction-walk-and-lift-off.md:171`, "Epic 11 takes 6" becomes "Epic 11 takes 7 (10.12 took 6)".

## 5. Handoff

Minor: the main session applies these docs-only edits straight to master after the designer's picks. Epic 11 stays backlog. When it starts, `gds-create-story` reads the readiness report and this proposal. Success: every F1–F14 item is either in an Epic 11 AC or closed by a D pick.
