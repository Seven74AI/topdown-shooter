---
stepsCompleted: [step-01-document-discovery, step-02-gdd-analysis, step-03-epic-coverage-validation, step-04-ux-alignment, step-05-epic-quality-review, step-06-final-assessment]
mode: headless (fresh checker; designer not asked; menus auto-continued)
scope: whole plan, widened to drift vs code (open epics 9, 10, 11; open stories 1.11, 1.12, 2.10, 4.10; done epics 1–8 and 10.10)
filesIncluded:
  - _bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md (+ epics.md, decision-log.md)
  - _bmad-output/planning-artifacts/game-architecture.md
  - _bmad-output/planning-artifacts/epics.md
  - _bmad-output/planning-artifacts/sprint-change-proposal-*.md, earlier readiness reports
  - _bmad-output/implementation-artifacts/sprint-status.yaml + story files
  - docs/overnight-run-log-2026-11-25.md, docs/epic-8-story-decisions.md, docs/art/photoreal-decisions.md, docs/perf/
  - code: apps/client, apps/server, packages/shared (balance JSON is in packages/shared/src/config/balance/)
---

# Implementation Readiness Assessment Report

**Date:** 2026-11-26
**Project:** topdown-shooter
**Checker:** a fresh session running `gds-check-implementation-readiness` headless (HANDOFF.md; `bmad-build` not used)

## Summary

| Rank | Count | Meaning |
| --- | --- | --- |
| **blocker** | 1 | Stops a story file from being written or built as the plan stands |
| **fix-now** | 20 | 17 factual doc corrections **applied** in this commit, plus 3 open ones for the main session |
| **needs-designer** | 8 | Scope or direction choices (Q2–Q9). Each has a recommendation (§8). Q1 is the blocker and also a designer question |
| **note** | 8 | Worth knowing; no action needed now |

**Verdict:**
- **Epic 10: READY.** Apply the 10.1 / 10.5 / 10.8 notes (Q2–Q4) when you write those story files.
- **Epic 11: READY (post-v1).** The missing dependencies are now written into epics.md.
- **Epic 9 (9.1–9.10): NOT READY.** Their direction predates the photoreal pass (B-1). Decide that first.

Evidence paths are relative to the repo root. `E` = `_bmad-output/planning-artifacts/epics.md`, `A` = `game-architecture.md`, `G` = the GDD `gdd.md`. Line numbers are from **before** this commit's edits unless marked "now".

## 1. Document inventory (step 1)

| Type | Files | Issues |
| --- | --- | --- |
| GDD | `gdds/gdd-topdown-shooter-2026-11-21/` holds `gdd.md`, `epics.md` and `decision-log.md` (one sharded set) | No duplicates |
| Architecture | `game-architecture.md` (whole) | None |
| Epics | `epics.md` (whole, 3,619 lines, 11 epics) | None |
| UX | No standalone UX doc. The building UX spec is `docs/ideas/building-ux/ux-spec.md` (E:224). Lumen UI sheets are in `docs/art/epic-7/lumen/`. Build-UI options are in `docs/art/build-ui/` | Expected (a game with UX in the GDD and in story files) |
| Tracking | `implementation-artifacts/sprint-status.yaml`, 114 story files | See §5 |

## 2. GDD analysis (step 2)

The GDD still holds all FR1–FR94 and the NFRs, and they trace to epics.md (FR coverage map E:240–320). The GDD had drifted in four places, all now corrected (§7, A-13 to A-15):
- the art production method (photoreal pass);
- build-phase input (the 10.10 Build button);
- join-mid-run money (E8-J1/J2);
- save points, which now include the evacuation vote (E8-S12).

The solo × 0.35 scale was already in G:201.

## 3. Epic coverage (step 3)

- **No FR without an epic.** FR82 ("Dead City art, drawn in game code", E:147) is still literally true, because 9.13 relights the code drawings. It is partly superseded for street props by 9.14's pre-rendered atlas. The FR text is left unchanged; it belongs to Q1.
- FR87 (quality settings) is in 10.1. Today only the URL flag `?fx=low` exists (`apps/client/src/debug/urlOptions.ts:105-109,215`).

## 4. UX alignment (step 4)

- The 10.10 hybrid Build button (BU-1 = B) was built (`10-10-build-button.md:22`, PR #20). G:88 described the 4 × 2 build bar. **Applied:** G now describes the Build button (A-13). Older "build bar" mentions remain in G:171, :184 and :246 (note N-6).
- Safe areas are largely built (§6, Epic 10). The HUD layout test covers 568 × 320 … 1920 × 1080 with insets (`apps/client/src/scenes/hudLayout.test.ts:44-48,154,210-246`).

## 5. sprint-status.yaml consistency (step 5, part 1)

- **Every key in sprint-status has a story heading in epics.md.** Merged keys (5.22→5.21, 5.25→5.23, 6.4/6.7/6.10/6.12, 7.5, 7.7/7.11→7.12, 8.2/8.3, 8.4–8.6) point to existing merged story files.
- **Every story heading in epics.md has a key.**
- **Status mismatches:**
  - `6-2-ruins.md:6` said `Status: review`; sprint-status:150 says `done`. The close-out confirms done: re-review approved (:486) and main-session gate green, "Story done." (:488). **Applied** (A-3).
  - All other story-file Status lines match. 7.7 and 7.11 say "done (built in the merged story …)", which is consistent.
- **Stale comments:**
  - Header note "Epic 9 is a polish pass of the code-drawn art" (sprint-status:42).
  - The 9.14 entry said "builder after 9.13 merges". The PR was merged 2026-11-26 00:19 as `1fbf310e` (`docs/overnight-run-log-2026-11-25.md:206`).
  - 1.11 had no "human" note.
  - **Applied** for all three (A-16).
- Epic 1, 2 and 4 stay `in-progress` because of 1.11/1.12, 2.10 and 4.10. That is correct.

## 6. Epic and story quality: open epics vs code (step 5, part 2)

### Epic 9 (9.1–9.10)

| Story | Verdict | Evidence |
| --- | --- | --- |
| **Photoreal premise (all)** | **Confirmed: 9.1–9.10 predate the photoreal pass.** The Epic 9 intro (E:3006) and G:323 said "polish pass of the code-drawn art; AI images only references". The designer then approved photoreal sets: 9.11 relit buildables, 9.13 relit characters (worker bake), and 9.14 a **pre-rendered image atlas** (`apps/client/src/render/city/streetProps.webp`, 9.14 B1 `9-14-…md:45`). The Behemoth, FX, icons, UI, buildings and ground are "Not started" (`docs/art/photoreal-decisions.md:10`) | **B-1** |
| 9.1 asset spec | **Partly refuted.** The look ids are still valid: 9.13 *relit* today's drawings, so Spitter P4 (`render/city/spitterArt.ts:3,362`), Brute BR1–BR5 (`bruteArt.ts:4-5,29`) and Bloater BL1–BL5 (`spriteAtlas.ts:29`) are still drawn in code. What is missing: the spec has no line for the photoreal pipeline (worker bake, `npm run art:street-props`, the take-4 / commonz designs, the drift hash `streetProps.json`). `docs/art/asset-spec.md` and `docs/audio/` do not exist | Q1 |
| 9.2 Downtown in 5 states | **Confirmed overlap with 9.14.** Cars in 3 conditions, barriers and sandbags are now in the photo atlas (26 frames). Rubble keeps the Ruins art (9.14 B7). Buildings and ground are still code-drawn (`drawCity.ts:354,596,626`). There is no vegetation code at all | Q1 |
| 9.3 survivor animations | **Confirmed partly open, overlapping 9.13.** 9.13 gives bodies breathing, sway, glow and chainsaw shake (`render/charAnim.ts:1-30`). There are **no per-weapon-family holding poses** (`spriteArt.ts:261-269`: the arms don't change with the weapon) and no reload, fire or downed poses (downed is a tint + ring, `PlayerView.ts:20,287,298`) | Q1 |
| 9.4 zombie / Behemoth animations | **Confirmed partly open.** 9.13 built walk loops for walker, runner and crawler (`charactersFrames.ts:30-35`) and the existing windup and swell poses. There are **no attack or death animations**: on death the zombie vanishes and a splat appears (`render/FxView.ts:101-102`). The Behemoth is still code-drawn (6.5, `behemothArt.ts:3-10`) and not photoreal | Q1 |
| 9.5 gore | Not started. Blood splats exist with cap **200**, not the AC's 300 (`FxView.ts:8-9`). There is no dismemberment. **The gore toggle depends on 10.1** | Q3, N-3 |
| 9.6 effects | Not started as a polish pass. "Rain, fog visuals, film grain and light glow read their quality settings" depends on 10.1. There is no film-grain control today | Q3 |
| 9.7 UI art | The Lumen LF5 UI style (Epic 7, decision 7-UI-1…5) already covers the hub, results and lobby. The story text predates Lumen | Q1 |
| 9.8 ambience and buses | **Confirmed.** Ambience exists in `apps/client/src/audio/ambience.ts`: procedural, per stage, 3 s crossfade (:23,27,42-46,386-387), built by 4.6, 4.7, 6.2 and 6.4. Stage 3 reuses Panic (:42-46), so there is no Breakdown loop of its own. **There are no buses**: the ambience gain goes straight to `destination` (:29,393-395), and the "music" boss loop runs on the SFX master (`placeholderSfx.ts:823,839`). **The sliders depend on 10.1** (`ambience.ts:28` says so) | Q2 |
| 9.9 music | Not started. There are no music files and no music gain | — |
| 9.10 weapon / zombie sounds | Placeholder synth for about 56 sounds (`placeholderSfx.ts:1-70`). Positional pan exists (:243-248). Voice limits exist only for blasts (:86,506-518) | — |

### Epic 10

| Story | Verdict | Evidence |
| --- | --- | --- |
| 10.1 settings | **Partly refuted: a settings store does exist**, but with only 3 fields. `apps/client/src/settings/settings.ts:2-36` (`screenShake`, `haptics`, `alwaysFullSpeed`; key `topdown-shooter.settings`; try/catch), plus a Settings view in the ☰ menu (`ui/InRunMenu.tsx:100-102`, `spec-always-full-speed-setting.md` done). Quality, volume, gore, aim assist, "Show performance" and account sync are missing. `progress` has **no `settings` column** (`apps/server/src/db/schema.ts:52-74`). **Confirmed that 9.5, 9.6, 9.8 and 10.2 depend on it** (10.2: "when quality settings are lowered"). A state note has been **applied** to E 10.1 (A-17) | Q3 |
| 10.2 frame-rate pass | Valid. It absorbs 1.11's open AC 3 (same reference phones). No `docs/perf/epic-10-fps.md` yet | Q7 |
| 10.3 memory / battery | Valid, not started | — |
| 10.4 fast loading | Partly done. Hashed assets are cached immutably (`deploy/Caddyfile:58-64`), and 9.14 measured the street-props download (`docs/perf/epic-9-street-props.md:73-81`). There is **no loading progress bar**: 9.14 B26 removed "Loading…" (`9-14-…md:99`). Trap: `public/assets/maps/downtown.tmj` is unhashed but gets the immutable header (`Caddyfile:53-57`) | N-2 |
| 10.5 install / safe areas | **Confirmed.** Safe areas are largely done (`index.html:7` `viewport-fit=cover`, `display.ts:22-37`, HudScene insets :1125-2052, `overlay.css` `env(safe-area-inset-*)`). There is **no web manifest**, icon, apple meta or service worker (`apps/client/index.html:1-42`; `public/` has only the map). A state note has been **applied** (A-17) | Q4 |
| 10.6 report a problem | Not started (no ring buffer, no `problem_reported`) | — |
| 10.7 run stats | Not started. Only `run_rewards` exists (`schema.ts:82-88`). Epic 11.7 depends on it | — |
| 10.8 balance pass | **Confirmed drift.** The AC's path `config/balance/*.json` was wrong; the files are in `packages/shared/src/config/balance/` (**applied**, A-4). `balance.version` is an FNV hash of the JSON (`packages/shared/src/config/balance.ts:255-257`), so any change "bumps" it. 9.13 changed it (4 `controls.fx` caps, golden digest 1728716985 → 3587910981, `9-13-…md:40,137` B28) with **no changelog**, because `docs/balance/changelog.md` doesn't exist. Items the AC lists as open are already settled: the 15 × N wave bonus (`economy.json:5`, `docs/epic-5-decisions.md:211`), `loot.runChance` 0.2 (`loot.json:2`), and the cap of 6 (`buildings.json:2`) | Q5 |
| 10.9 playtests and v1 | Valid. It already absorbs 4.10 if 4.10 never ran (E:3401) | Q6 |
| 10.10 build button | Done. E:3413 said "Waits on the designer's layout pick", and the story file said the same at :9. Both are stale: BU-1 = B, PR #20 merged. **Applied** (A-2) | — |

### Epic 11 (post-v1)

The dependencies mostly hold:
- `DistrictMap` has decay groups with `pick` (`packages/shared/src/map/districtMap.ts:131-136,180-203`).
- `evac_pad` is in the map events (:154-156).
- The 7.7 district list is data-driven (`config/progression.json:205-219`, `meta/districts.ts:22-24`).

The ACs did not name these dependencies (all **applied** as a note under the Epic 11 intro, A-17):
- **Save format bump.** A Random-city save must store `citySeed` + `generatorVersion`. Today it stores `mapVersion`, `seed` and `district` (`save/runSave.ts:95-99`), and restore refuses a different `mapVersion` (`save/restore.ts:130`). That needs `SAVE_SCHEMA_VERSION` 1 → 2 plus a migration step (`save/migrations.ts:2-5`).
- **Net protocol bump.** The new join fields need `NET_PROTOCOL_VERSION` 3 → 4 (`net/messages.ts:172`).
- **Downtown-only join check.** The client sends `DOWNTOWN_MAP.version` (`apps/client/src/net/connection.ts:41`), and the server's `DISTRICT_MAPS = {downtown}` refuses anything else (`RunRoom.ts:285,485`).
- **11.2 check A** should use `gameplayDecayMasks`. `legalDecayMasks` includes look bits since 6.2 (`decay/decayState.ts:132,168`).
- **11.6 "art drawn by type"** predates the 9.14 fixed-frame photo atlas, and `drawFrame` stretches frames (`drawCity.ts:766-777`). This is Q8.

### Open stories 1.11, 1.12, 2.10, 4.10

| Story | State | Evidence |
| --- | --- | --- |
| 1.11 | Only AC 3's reference-phone rows are open (human). The iPhone 12 and Pixel 5 rows are empty | `docs/perf/epic-1-stress.md:55,57`; story :141,:207 |
| 1.12 | Human playtest tasks 4–6 open. Folded into `docs/playtests/milestone-1.md` Part 1 | `1-12-…md:27-29` |
| 2.10 | The 4-phone test is open (human, parked). **Its doc is stale against the Network pass:** it still proposes the 300 ms rewind as the follow-up (`docs/perf/epic-2-network.md:113`), which 2.12, 8.8 and 8.9 already built (now 600 ms). Its baseline of 12–13 KB/s (:151) predates 8.10. Also check `REVERSED_HIT_SLACK_MS = 300` (`apps/client/src/debug/reversedHits.ts:4`) against the 600 ms window | N-1 (fix-now, open) |
| 4.10 | **Stale.** E:1450 says "full 5-wave runs" and E:1456 says "go / fix-first for starting Epic 5". `milestone-1.md` still has 5 waves (:32,:34,:63), "650–790 earned" (:175), the 15 × N decision as still open (:12,:181) and "replaces 4.11" (:13). It lacks the Behemoth, events, the evac vote, Epic 7 progress and the 10.10 Build button. The game is 10 waves (`waves.json:12`) | Q6 |

## 7. Drift vs code (done epics 1–8, 10.10) and the fixes applied

Planning docs were generally kept up to date (A:159, :172, :190–192 and :321 were already updated for 8.8–8.11 and 9.14). The drift is in older paragraphs and in decisions that were logged only in story files or run logs.

### Applied in this commit (fix-now, factual corrections)

| # | Fix | Where (now) | Evidence |
| --- | --- | --- | --- |
| A-1 | Headings "9.13 (backlog)" and "9.14 (backlog)" changed to "(done)" | E 9.13 / 9.14 headings | sprint-status:213-214; PRs #16 and #22 |
| A-2 | 10.10 "Waits on the designer's layout pick" changed to "BU-1 = B, done, PR #20" | E Story 10.10 note; `10-10-build-button.md:9` | `10-10-…md:7,22`; sprint-status:228 |
| A-3 | `6-2-ruins.md` Status changed from review to done | `6-2-ruins.md:6` | story :486,:488; sprint-status:150 |
| A-4 | Balance path `config/balance/` changed to `packages/shared/src/config/balance/` | E Story 1.2 (E:418), E Story 10.8 (E:3391) | `ls packages/shared/src/config/balance/` |
| A-5 | Solo scale × 0.4 changed to × 0.35 (Behemoth HP stays × 0.4) | E FR31 (E:66), E Story 8.6 D14 (E:2977) | `waves.json:13`; `docs/epic-5-decisions.md:212` (B2); G:201 already said 0.35 |
| A-6 | The 8.10 "far zombies every 2nd tick" AC gets an as-built note: the far rule is off (B7 / OR-16) | E Story 8.10 (E:2787) | `8-10-…md:101,326`; run log :58 |
| A-7 | Story 1.1 CI / GitHub Pages ACs get as-built notes: CI runs on PRs + master pushes; Pages retired, game at hordes.sevend.io | E:391, E:397 | `.github/workflows/ci.yml:8-23`; HANDOFF.md:129 |
| A-8 | "Darkness render texture" changed to "not a RenderTexture (6.3 DD1)" | E:198 | A:168 |
| A-9 | Requirements inventory: real table list (`device_tokens`, `run_rewards`, saved-run tables; `run_results` planned) and the `__Host-tdg` cookie | E:200, E:203 | `apps/server/drizzle/0000…0005`; `schema.ts:39,82,101,119`; `auth/accountRoutes.ts:225` |
| A-10 | **Epic 8 as-built block** under the Epic 8 intro. It lists the 8.1 close codes 4020–4023, B15 / B16 / OR-19, E8-J1/J2, H2/H3, S1/S6/S11/S12, 8.7 B5, the 8.9 600 ms rewind, 8.11 protocol v3, and the unowned 8.10 B6 | E Epic 8, before "Network pass" | `packages/shared/src/net/reconnect.ts:231-239`; `docs/epic-8-story-decisions.md:17-76`; run log :58-62; `constants.ts:58` |
| A-11 | Epic 9 photoreal intro gets an as-built note: worker relight for 9.11 and 9.13, a pre-rendered atlas for 9.14, other groups not started | E "Photoreal pass" intro | `docs/art/photoreal-decisions.md:6-10` |
| A-12 | **Architecture** corrections, listed below | A:58, :161, :164, :200, :202, :206, :353-354, :398, :474, :526, :578, :580, :589 | See below |
| A-13 | **GDD** corrections: build phase now uses the Build button; join money is max(own, 100 + 60 % of fighting seats); Save and quit also works in the vote; the Production note and :363 record the photoreal pass | G:88, :155, :157, :323, :363 | `10-10-…md`; E8-J1/J2/S12; photoreal-decisions |
| A-14 | **GDD epics.md** corrections: Epic 8 "resume with host" changed to "any account" (D11); Epic 9 art line records the photoreal pass; the missing Epic 11 section added | GE:75, GE:79, end | `docs/ideas/epic-8/decisions.md:65-66` (D11); `savedRunsRepo.ts` |
| A-15 | **GDD decision-log** corrections: the "host must be present" entry is marked superseded (D11 / E8-R1); a new dated entry records the photoreal pass, the silhouette and red rule, and the Build button | DL:23, end | as above |
| A-16 | sprint-status comments: Epic 9 header note, 1.11 "human" note, 9.14 merge record; `last_updated` | sprint-status header, 1.11 and 9.14 entries | run log :206 |
| A-17 | Dated state notes (no AC changed): on 9.8, 10.1, 10.5 and 10.8, and on the Epic 11 dependencies (save and net version bumps, Downtown-only join check, `gameplayDecayMasks`, 11.6 vs the photo atlas) | E Story 9.8 / 10.1 / 10.5 / 10.8 / Epic 11 intro | §6 |

The A-12 architecture corrections:
- "save & resume (7 days, **host required**)" changed to "any account" (A:58 contradicted A:163 and :559).
- "save points only in Build" changed to "Build and the evacuation vote (E8-S12)" (A:161, :202). `SAVE_SCHEMA_VERSION` and the `packages/shared/src/save/` format added (`runSave.ts:20`).
- `device_tokens`, `run_rewards` and the migration list added to A:200.
- Reconnect row: `seatKey()` `guest:` / `acct:` (`apps/server/src/run/lobby.ts:91`) and close codes 4020–4023.
- Balance file list corrected: there is no `items.json`; the list now includes combat, consumables, gear, shop, loot, player, controls and bots; `progression.json` and `cosmetics.json` sit in `config/`.
- The run state machine is in `packages/shared/src/run/runStateMachine.ts`, not `apps/server/src/run` (A:398, :526).
- Novel pattern 2's "~30 KB/s" is marked as the original design, superseded by 8.10 (A:474).
- "Clients never send binary" corrected: the 8.11 input is binary (A:578; `MAX_CLIENT_MESSAGE_BYTES` in `apps/server/src/net/limits.ts:7`).
- The CI / PR / `gate` process from HANDOFF.md §3 and `ci.yml` added (A:580).
- Dev DB is PGlite when `DATABASE_URL` is unset (A:589; `apps/server/src/index.ts:24-36`).
- The art method paragraph now records the photoreal pass (A:206 contradicted A:172 and :321).

### Open fix-now items (not applied: outside a docs-only correction, or owned by the main session)

- **N-1:** `docs/perf/epic-2-network.md` is stale against the Network pass (2.10 row above). Also check whether `REVERSED_HIT_SLACK_MS = 300` (`apps/client/src/debug/reversedHits.ts:4`) should follow the 600 ms rewind. That is a code question, so it was not touched.
- **N-2:** **9.14 FU1** (`9-14-…md:153`): a street-props download that fails after Boot shuts down never settles (Phaser `LoaderPlugin.shutdown` drops the listeners), so every run silently uses code props. It is tracked only in the story file. Add it to `deferred-work.md` or a small fix story. Related: B26 removed the only loading feedback (10.4 needs a progress bar anyway).
- **N-3:** **HANDOFF.md is stale.** The header and §2 table still say Epic 7 is "ready-for-dev", the Network pass is "ready-for-dev" and Epics 8–10 are backlog, and §5.8 still asks for BU-1. Not edited here, because the main session owns the handoff. It should refresh §2, §5 and §7.

## 8. Needs-designer questions (with recommendations)

| # | Rank | Question | Recommendation |
| --- | --- | --- | --- |
| **Q1 (B-1)** | **blocker** for writing 9.2–9.7 story files | Epic 9's direction: is the rest of Epic 9 photoreal (like 9.11–9.14), code-drawn polish, or a mix? Which groups are next: the Behemoth, FX, icons, UI, buildings and ground? | Run `gds-correct-course` on Epic 9 and re-base 9.2–9.7 on the photoreal pipeline. **9.2:** buildings, ground and decay props not covered by 9.14 (drop the car, barrier and sandbag parts). **9.3:** weapon-family holding, reload and downed poses on the 9.13 relit bodies. **9.4:** attack and death animations, plus a photoreal Behemoth (BH1–BH4). **9.6 and 9.7:** say which groups go photoreal, and keep Lumen LF5 for the UI. **9.1:** keep the look ids (still valid) and add the pipeline sections. Update FR82's wording at the same time |
| Q2 | needs-designer | 9.8: ambience is already built. Shrink 9.8 to the three buses, a Breakdown (stage 3) loop of its own and the sliders? | Yes. Make 10.1 a prerequisite of 9.8, or move the sliders AC into 10.1 |
| Q3 | needs-designer | Order: build 10.1 (settings) before 9.5, 9.6 and 9.8, which read its settings? | Yes. Write 10.1 to *extend* `settings/settings.ts` and the existing ☰ Settings view, and add the `progress.settings` migration. Build it early, ahead of the rest of Epic 10 |
| Q4 | needs-designer | 10.5: safe areas are mostly done. Narrow its AC? | Change the safe-area AC to "verify on a notched phone + add top-inset cases to `hudLayout.test.ts`". Keep the manifest, icons and the browser matrix as the main work |
| Q5 | needs-designer | 10.8: three of its "open" items are already settled, and balance changes have no changelog | Start `docs/balance/changelog.md` now and back-fill Epic 5 B1–B12 and 9.13 B28. Reword the 10.8 AC to "re-check 15 × N, runChance 0.2 and cap 6 against real runs" rather than "settle" them |
| Q6 | needs-designer | 4.10 (Milestone 1 playtest): retire it into 10.9? | Yes. Mark 4.10 as superseded by 10.9, which already runs its checks, and refresh `docs/playtests/milestone-1.md` to 10 waves, current earnings, the Behemoth, events, the vote and the Build button. That closes Epic 4 |
| Q7 | needs-designer | 1.11 and 1.12: close them by folding them into 10.2 and 10.9? 2.10: keep it? | Fold 1.11 AC 3 into 10.2 and 1.12 into the 10.9 game nights, then close both and Epic 1. Keep 2.10 as the designer's parked 4-phone test, but refresh its doc first (N-1) |
| Q8 | needs-designer | 11.6 (Random city art): reuse the fixed photo-atlas frames by kind, or code-drawn art for generated cities? | Reuse the atlas frames by kind (no stretching; add size variants with `npm run art:street-props`), and use code drawings only for generated buildings and ground. Decide this together with Q1 |
| Q9 | needs-designer | 8.10 B6 (RTT-based horde skip at 64 kbit/s, frames queue up to 4.7 s) has had no owner since 8.11 B2. Plan it? | A small Network follow-up story before the 2.10 4-phone test, or fold it into 10.2. Also give the 8.10 "pending-kill zombie unhittable locally" idea (run log :58) a home in `deferred-work.md` |

## 9. Notes

- **N-4 (note):** the 8.x ACs in E still read as the original plan in places: E:2908 "seat is dropped", E:2944/2955 "build phase only", E:2998 "small wheel". The new as-built block (A-10) is the reference; the ACs were not rewritten.
- **N-5 (note):** A:157 and A:183 say remotes render "~100 ms behind". It is adaptive 100–250 ms since 8.9, which A:194 already states.
- **N-6 (note):** G:171, :184 and :246 still say "build bar". The build bar still exists inside the 10.10 panel, so this is only wording.
- **N-7 (note):** 9.5's blood cap is 300 in the AC versus 200 in the code (`FxView.ts:8-9`). Settle it when 9.5 is written.
- **N-8 (note):** run-log follow-ups not in sprint-status or `deferred-work.md` (run log :142, :182–:202): the `cut.test` and `RunRoom.host.test.ts:206` flakes, hurt pushback not swept against solids, `smokeReconnect.cjs` pre-Lumen selectors, the edge arrow overlapping a ping arrow, a dead `pingWheelColumn`. Worth one triage pass by the main session.
- **N-9 (note):** OR-11 (walls drawn in front of bodies, run log :52) is very likely closed by the 9.12 silhouettes.
- **N-10 (note):** "B26" is a story-local code in three stories: 9.14 (no wait for the street-props image), 9.13 and 7.12. B-codes are only unique within a story, so always cite them as "9.14 B26".
- **N-11 (note):** the 9.14 decision "street props pre-rendered" was correctly copied to A:172 and A:321 by the story itself (AC 2). Only A:206 lagged, now fixed.

## 10. Final assessment (step 6)

- **Overall:** the plan is in good shape for **Epic 10** and **Epic 11**. Doc drift for the done epics is corrected in this commit.
- **The one blocker:** Epic 9's 9.1–9.10 were written for a "polish the code-drawn art" direction that the photoreal pass changed. Decide Q1 (recommended: `gds-correct-course` on Epic 9) before writing any 9.2–9.7 story file.
- **Next steps, in order:**
  1. Designer: answer Q1–Q9. Q1 first; Q3 unblocks the settings-dependent stories.
  2. Main session: N-2 (FU1 into the backlog), N-3 (refresh HANDOFF §2/§5/§7), N-1 (the 2.10 doc), then the N-8 triage.
  3. Write 10.1 first, then Epic 10 in the order 10.2–10.7 → 10.8 → 10.9.
