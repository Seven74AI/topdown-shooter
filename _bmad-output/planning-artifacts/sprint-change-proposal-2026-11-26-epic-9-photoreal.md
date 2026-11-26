# Sprint Change Proposal: Epic 9 photoreal, Epic 10 order (2026-11-26)

Mode: batch (headless; run by a correct-course session per HANDOFF.md with `gds-correct-course`, `bmad-build` not used). Scope: **Moderate** (backlog reorganisation: 10 stories re-based, 1 story added, 3 stories folded, 2 epics closed, 1 epic reopened; planning text only, no code).

Approval: the **designer's decisions of 2026-11-26** (sent to this session by the main session) are applied as written. Two follow-ups from the main session are also applied: **all real-phone testing stays parked** (designer 2026-11-25, HANDOFF §5.2; §4.7), and **Story 8.12 and Epic 12** (party-mode session 2026-11-25, PR #25) are copied into epics.md as written (§4.8). Items the designer has **not** decided are proposed only (§6), each with a recommendation.

Inputs: `implementation-readiness-report-2026-11-26.md` (B-1/Q1–Q9, N-1–N-11), `implementation-artifacts/epic-7-retro-2026-11-26.md` (E7-A1–A8), `implementation-artifacts/epic-8-retro-2026-11-26.md` (E8-A1–A10), `docs/art/photoreal-decisions.md`, the 9.13 and 9.14 story files, `docs/perf/epic-9-street-props.md`, `apps/client/src/audio/ambience.ts`.

## 1. Issue summary

- **Trigger (readiness B-1, the only blocker).** Stories 9.1–9.10 were written for "a polish pass of the code-drawn art; AI images only references" (designer 2026-11-23). The designer then ran a photoreal pass and approved it group by group (9.11 buildables, 9.12 wall silhouettes, 9.13 characters, 9.14 street props). As built, this added two ways into the game: **worker relight** (code drawings relit at load in a Web Worker) and a **pre-rendered atlas** (`streetProps.webp`, made offline from the approved code). 9.1–9.10 conflict with that or overlap it:
  - 9.2 still asks for cars, barriers and sandbags, which 9.14 already ships.
  - 9.3 and 9.4 do not build on the 9.13 bodies.
  - 9.5–9.7 say "code-drawn polish".
  - FR82 still reads "drawn in game code".
- **Order (readiness Q3).** 9.5, 9.6, 9.8 and 10.2 read settings that only Story 10.1 adds.
- **Leftovers:**
  - 1.11 AC 3, 1.12 and 4.10 have kept Epics 1 and 4 open, and their checks overlap 10.2 and 10.9 (readiness Q6, Q7).
  - 8.10 B6 (the 64 kbit/s horde queue, up to 4,720 ms) has no owner (readiness Q9, E8-A4).
  - Account deletion is not planned anywhere (E7-A8).

## 2. Impact analysis

### Checklist (from `checklist.md`)

| Item | Status | Note |
| --- | --- | --- |
| 1 Trigger and context | [x] | B-1 is evidenced in the readiness report §6 (code paths cited there) |
| 2.1–2.5 Epic impact | [x] | Epic 9 re-based. Epic 10 reordered. Epics 1 and 4 closed. Epic 8 reopened for 8.13. Epic 11: Q8 is still open (§6) |
| 3.1 GDD | [x] | Production paragraph, epic table and assumption line in `gdd.md`; Epic 9 and 10 in the GDD `epics.md`; a new `decision-log.md` entry |
| 3.2 Architecture | [x] | Only the Asset Management paragraph (the pipeline). The Asset-loading row (A:172) already described 9.14 |
| 3.3 UX | [N/A] | No standalone UX doc. 9.7 now routes UI art through a proposal pick, starting from Lumen LF5 |
| 3.4 Narrative | [N/A] | None |
| 3.5 Other (tracking) | [x] | `sprint-status.yaml`, the 1.11 and 1.12 story files, and the `deferred-work.md` 8.10 B6 line |
| 4 Path forward | [x] | Direct adjustment (§3) |
| 5 Proposal components | [x] | This document |
| 6 Final review and handoff | [x] | The §6 questions and clashes X1–X11 were accepted by the designer ("ok", 2026-11-26) and applied (§8) |

### Epic and story impact

- **Epic 9:** 9.1–9.8 rewritten (9.8 shrunk), 9.9 and 9.10 kept. 9.11–9.14 stay done. Epic 9 stays in-progress.
- **Epic 10:**
  - 10.1 comes first and gains a deletion AC.
  - 10.2 absorbs 1.11 AC 3.
  - 10.9 absorbs 1.12 and 4.10.
  - 9.5, 9.6, 9.8 and 10.2 each state that they depend on 10.1.
- **Epics 1 and 4:** closed. 1.11, 1.12 and 4.10 are done, each with a "folded into 10.x" note.
- **Epic 2:** unchanged. 2.10 stays parked in review.
- **Epic 8:** new Story 8.13 (backlog). The epic goes back to in-progress.

### Technical impact

- None now (docs only).
- Later stories keep today's rules: no simulation, net, balance or digest change, except new `controls.fx` caps, and 8.13 may need a `NET_PROTOCOL_VERSION` bump.

## 3. Recommended approach

**Direct adjustment.** Every change fits inside the existing epics, and no completed work is rolled back. The photoreal pipeline is already built and measured, so re-basing the stories mostly means pointing each one at it and giving it the same budgets as 9.13 and 9.14.

- **Effort:** docs only now. Per-story effort is about the same as before, or lower for 9.2 and 9.8, whose scope shrank.
- **Risk:**
  - Each art group now waits on a designer pick, the same cadence as 9.11–9.14.
  - The first-load budget has to be tracked per atlas. 9.1 records the headroom.
- **Timeline:** 10.1 moves to the front. 8.13 is a small story in the normal build order. Epic 12 (with 8.12) lands before 10.2, 10.8 and 10.9. No story waits on a phone night.

## 4. Detailed change proposals (applied)

### 4.1 Epic 9 (epics.md)

**Epic 9 intro.**
- OLD: "this epic is a polish pass of the art already drawn in game code … Meshy and vector images are only references."
- NEW: "Direction: photoreal", in five points:
  - **Pick first:** every group goes through a proposal page before it is built.
  - **Two ways into the game:** worker relight, or a pre-rendered atlas. The code drawing is the fallback.
  - **Budgets:**
    - atlases ≤ 2048²;
    - each pre-rendered atlas ≤ 2 MB, and the first load < 15 MB;
    - bake long task ≤ 6 ms at 1× CPU;
    - full bake ≤ 15 s at 4× CPU;
    - `?stress=150` average FPS within 2 FPS of master, and p95 within +1 ms, at 1× and 4× CPU.
  - **Gameplay unchanged.**
  - **Dependencies:** 9.1 first; 9.5, 9.6 and 9.8 depend on 10.1.
- Rationale: one shared contract instead of repeating it in every story. The numbers are the ones 9.13 (AC 3, AC 4) and 9.14 (`docs/perf/epic-9-street-props.md`) already met.

**New Epic 9 story list:**

| Story | New scope (one line) | Key testable ACs |
| --- | --- | --- |
| 9.1 Art and audio asset spec | Keep every look id. Add a pipeline line per art group (code only / worker relight / pre-rendered atlas), its photoreal state and owner story, sound buses, and the budgets with today's spend | Spec lists every frame and look id; each group has a pipeline, state and owner; budgets as numbers, plus the 9.13 caps and bake times and the 9.14 atlas (2032 × 536, 531 KB) |
| 9.2 Downtown in five decay states | Buildings, ground and the decay props not in 9.14 (fires and scorch, ground debris, vegetation at stages 4–5) across 5 states, after a proposal pick | Collision, cover and spawn unchanged, map and digest tests green; ≤ 2 MB per atlas; slow-4G title ≤ +1 s; stress in stage 3 rain and the stage 5 blackout within 2 FPS / +1 ms |
| 9.3 Survivor animations | Six weapon-family poses (walk, fire or swing, reload) plus downed, on the 9.13 relit bodies, after a proposal pick | Pose changes on the next frame; the reload pose lasts the weapon's reload time; bake ≤ 6 ms long task; raster digest green; stress within 2 FPS / +1 ms |
| 9.4 Zombie and Behemoth animations | Attack and death animations for the 6 types, plus a photoreal Behemoth (all its poses and telegraphs), after a proposal pick | Death ≤ 0.8 s, then the splat; deaths capped and pooled (`?fx=low` halves the cap); readability rules (NFR11); stress within 2 FPS / +1 ms; digest unchanged |
| 9.5 Gore and dismemberment | Photoreal pieces and blood via a proposal pick. **Depends on 10.1** | Client-only; blood cap 300 (today 200; keep 200 if the stress test fails, and record why); "Blood only" applies without a reload; stress with a full cap within 2 FPS / +1 ms |
| 9.6 Effects | Photoreal effects from fire-lab D, EX1/EX2 and FS1/FS2 via a proposal pick. **Depends on 10.1** | Pooled, no per-frame allocation; reads the quality settings live; blackout and the 10 m fog limit ignore them; stress test in rain with flamethrower and launcher within 2 FPS / +1 ms |
| 9.7 UI art | Photoreal UI per group via a proposal pick, starting from Lumen LF5 | Picks recorded; ≤ 2 MB per atlas; text ≥ 14 px; buttons ≥ 44 × 44; `hudLayout.test.ts` 568 × 320 … 1920 × 1080 with and without insets |
| 9.8 Ambience and audio buses | **Shrunk (readiness Q2):** three buses, a stage-3 `breakdown` loop of its own, drizzle and heavy-rain beds, and 10.1's volumes wired in. **Depends on 10.1** | Every sound on exactly one bus (routing unit test); the boss loop moves to the music bus; a volume change applies within 100 ms; 3 s crossfade; zero per-frame allocation |
| 9.9 Adaptive music | Kept as written | Intensity follows alive count, 0 → 150; build track; boss track; streamed |
| 9.10 Weapon and zombie sounds | Kept as written | 11 distinct fire and reload sounds; signature warning cues; positional; voice limits |
| 9.11–9.14 | Done (unchanged) | — |

**9.8 consistency check (needed before applying Q2).** The code confirms the readiness facts:
- `ambience.ts` has `evening`, `panic`, `ruins`, `collapse` and `collapse_ash`;
- stages 2–3 map to `panic`;
- the ambience gain has no bus, and the boss loop runs on the SFX master.

Two more facts:
- Rain is only in the Collapse loop. That is why the shrunk story keeps the drizzle and heavy-rain AC.
- 10.1 stores the volumes, and 9.8 applies them. This is consistent with decision 2 (10.1 first).

So the shrink is applied.

**FR82** (epics.md FR list and coverage map; GDD Production paragraph).
- OLD: "Dead City art, drawn in game code: gritty …"
- NEW: "Dead City art, made without hiring: photoreal looks the designer picks on proposal pages, put into the game as code drawings relit at load in a Web Worker or as atlases pre-rendered offline from the approved code (the code drawings stay the fallback); gritty …"
- Coverage map: "Epic 9 (photoreal pass: relit code drawings and pre-rendered atlases, no hiring)".

The Epic 9 line in the epic list and the Photoreal pass intro's overlap sentence are updated to match.

### 4.2 Epic 10 (epics.md)

- **Epic 10 intro:** new **Order** line: 10.1 first (9.5, 9.6, 9.8 and 10.2 depend on it), then 10.2–10.7 → 10.8 → 10.9. It also records the folds.
- **10.1:** new note: built first; extends `settings/settings.ts` and the ☰ Settings view. **New AC (E7-A8): "Delete my progress"**, as a guest or logged in:
  - a confirm screen that names what goes;
  - one transaction deletes `progress`, saved runs (or the player's seat in them), `run_rewards`, `device_tokens` and the account row;
  - `account_deleted` is logged with no personal data;
  - the guest token, cookie and stored settings are cleared, and the next open is a fresh guest with 0 Supplies;
  - tests prove the username can be registered again and the old token is refused;
  - the endpoint needs the session (plus the password for an account) and is rate-limited.
- **10.2:** "depends on 10.1" added to the quality-settings AC. **New AC from 1.11 AC 3:** 150 Walkers in god mode for 60 s on the iPhone 12 class and Pixel 5 class phones fill the empty rows of `docs/perf/epic-1-stress.md`, with the bottleneck for any miss. This AC is marked parked (§4.7).
- **10.9:**
  - OLD: "if the 4.10 Milestone 1 playtest never ran, its checks … run in the first game night".
  - NEW: the first game night runs both folded checks:
    - **4.10:** per-phone FPS, bandwidth and reversed hits in `docs/perf/milestone-1.md`, and the feedback themes, using `milestone-1.md` refreshed to the 10-wave game first;
    - **1.12:** feedback from at least 3 people on the controls, and the melee decision.

### 4.3 Epics 1, 4 and 2 (epics.md, story files, sprint-status)

- Epic list entries for Epics 1 and 4: a "Closed 2026-11-26" note.
- Stories 1.11, 1.12 and 4.10 each get a "Done 2026-11-26, folded into 10.x" note.
- Story files `1-11-…md` and `1-12-…md`: `Status: review` → `Status: done`, with a fold note. 4.10 has no story file.
- sprint-status:
  - `epic-1: done`, `epic-4: done`;
  - 1.11, 1.12 and 4.10 are `done`, each with a "folded into 10.x" comment;
  - 2.10 stays `review` with the comment "PARKED (designer 2026-11-25: all real-phone testing parked)".

### 4.4 Story 8.13: Slow-line horde skip (new, Epic 8)

**Renumbered:** the designer named this story 8.12, but master already uses 8.12 for the quick story "Disconnected players don't vote" (`8-12-disconnected-players-dont-vote.md`, ready-for-dev, added 2026-11-25 in party mode). To avoid two stories with one key, the slow-line story is **8.13**. Scope and placement are as decided.

New story in epics.md, placed after 8.7. The Epic 8 as-built "Still owed" line now points to it. ACs:
- A per-phone latency signal (an existing round trip, or a tiny ack plus a `NET_PROTOCOL_VERSION` bump). When the queued horde frames get older than a named threshold, the server skips the stale frames and sends a keyframe. Patches and events are never dropped.
- On the 8.10 T8 capped-line method (`lagLine --kbps`, 4 bots, wave 4, stalls of 0.2, 0.4 and 1 s):
  - at 64 kbit/s the longest wait is **≤ 1,000 ms** (today 4,720 / 4,680 / 1,883 ms), with 0 decode errors and positions within 1 cm after a keyframe;
  - at 128 kbit/s and on a clean line, `framesSkipped` stays 0 and horde KB/s stays within +5 % of 8.10 (8.2 KB/s, and ≤ 13.5 KB/s for the stampede);
  - the table goes into the story file and `docs/perf/network-pass-2026-11.md`.
- The existing net tests stay green, and the 8.8 and 8.9 lossy-line numbers do not get worse.

Tracking:
- sprint-status: `8-13-slow-line-horde-skip: backlog`; `epic-8: in-progress`.
- `deferred-work.md`: the 8.10 B6 line names 8.13 as its owner.

### 4.5 GDD (`gdds/gdd-topdown-shooter-2026-11-21/`)

- `gdd.md`:
  - **Production** paragraph rewritten for the photoreal method (pick on a proposal page → worker relight or pre-rendered atlas, code fallback; no hiring).
  - Epic table row 9: "Photoreal look and polished sound (no hiring)".
  - The no-hiring assumption line updated to match.
- `epics.md`:
  - Epic 9: Goal, In and High-level stories re-based, plus a new "Depends on: Story 10.1" line.
  - Epic 10: a new Order line; the first high-level story is now "quality settings, gore toggle and progress deletion".
- `decision-log.md`: a new 2026-11-26 entry with the four decisions. It supersedes the 2026-11-23 "polish pass" wording.

### 4.6 Architecture (`game-architecture.md`)

Only the **Asset Management** paragraph is changed. OLD: "Epic 9 polishes the code-drawn art and the audio without hiring". NEW: the two-way photoreal pipeline:
- **worker relight:** `relight.ts`, `*BakeWorker.ts`, a 6 ms sliced fallback, the kept cache, a re-bake after a graphics restore, and `controls.fx` caps;
- **pre-rendered atlas:** lossless WebP plus frame JSON plus a drift hash, ≤ 2 MB each, with the code fallback;
- the per-group budgets.

The Asset-loading row (A:172) and the tree (A:321) already describe 9.14 and are unchanged.

### 4.7 Real-phone testing parked (main-session follow-up, designer 2026-11-25)

The designer parked all real-phone testing (HANDOFF §5.2: "forget the real phone test for now"). That covers 2.10, the Mi 11i FPS rows, the 4.13 app-switch check, 4.10, and the phone parts of 10.2, 10.3, 10.5 and 10.9. Applied:

- **No phone night** is scheduled, and no story waits on one.
- **8.13:** "ready before the 2.10 phone test" → "a small story in the normal build order; land it before any real-device network test" (epics.md, the Epic 8 as-built line, sprint-status, `deferred-work.md`, decision log).
- **10.2:** the phone ACs are kept, marked *parked*, including the folded 1.11 AC 3. New buildable AC: headless Chromium at 844 × 390 DPR 2, 1× and 4× CPU, `?stress=150` in a wave 9 blackout, measured the 9.13 way into `docs/perf/epic-10-fps.md`. At 4× the average must be ≥ 30 FPS, or the bottleneck is named and the class's default quality is lowered until it is.
- **10.3:** the phone ACs are kept, marked *parked*. New buildable AC: a headless 10-wave solo or bot run samples the JS heap (CDP) and GPU texture memory at each build phase, with ≤ 5 % growth per wave after wave 2. 4× CPU main-thread busy time per minute is recorded as the battery proxy.
- **10.5:** the real notched-phone AC and the real iOS Safari / Android Chrome runs are *parked*. Playwright device emulation with insets plus `hudLayout.test.ts` is the buildable safe-area check. Desktop Chrome, Firefox, WebKit and Edge run through Playwright now.
- **10.9:** the per-phone measurements (4.10's rows) and the phone-specific checks (1.12 "on their own phones") are *parked*. The game nights themselves run on whatever devices the group uses.
- **Epic 10 intro:** one line states the parking rule.
- **Retro targets:**
  - E7-A2 (deploy and restore drill, no phone part) → "before the first accounts release".
  - E8-A2 → normal order.
  - E8-A4 → done (Story 8.13).
  - E8-A5: the doc and constant check now; the 4-phone test and the Mi 11i sheet "when phone testing resumes".
  - E8-A9 → "before the first Epic 10 story" (no phone part).

### 4.8 Story 8.12 and Epic 12 copied into the plan (main-session follow-up)

PR #25 (`9bf596bf`, a designer party-mode session, 2026-11-25) added the story files 8-12 and 12-1…12-4, ready-for-dev, but no epics.md text. Applied **without changing scope**:

- **epics.md:**
  - Story 8.12 "Only standing, connected players vote", placed before 8.13.
  - A new **Epic 12: Extraction cinematic** section (intro with the build order 8.12 → 12.1 (+ 12.4) → 12.2 → 12.3; Stories 12.1–12.4 condensed from their files, which stay the full spec).
  - An Epic 12 entry in the epic list, with "FRs touched: FR58, FR66, FR67".
- **GDD:** an Epic 12 section in the GDD's `epics.md`; 8.12 and 8.13 in the Epic 8 high-level stories; row 12 in the `gdd.md` epic table; a decision-log line.
- **Not changed (left to the stories):** FR58's "50 % refund" wording (12.4 AC 8 owns it), and FR66 / FR67 and 6.11's ACs (see the questions in §6).

## 5. Implementation handoff

- **Scope: Moderate.** Routed to the main session (story writer / scrum master), then the builders.
- **Main session:**
  1. Write the 10.1 story file first (with the E7-A8 deletion AC and the E7-A5 shape owner for `progress.settings`).
  2. Write the 8.13 story file; it is a small story in the normal build order, landed before any real-device network test.
  3. Build 8.12 → 12.1 (+ 12.4) → 12.2 → 12.3 from their story files once the §6 Epic 12 questions are answered (or their recommendations accepted).
  4. Write Epic 9 story files only after the matching proposal page has a designer pick: 9.1 any time; 9.2, 9.3 and 9.4 after their picks; 9.5, 9.6 and 9.8 after 10.1 is done.
  5. Refresh `docs/playtests/milestone-1.md` to the 10-wave game before the first 10.9 night.
- **Designer:** proposal-page picks for 9.2–9.7. Answer the open questions in §6.
- **Success criteria:**
  - every Epic 9 story file cites the intro's budgets and the designer's pick;
  - 10.1 lands before 9.5, 9.6, 9.8 and 10.2;
  - 8.13's 64 kbit/s netsim row reads ≤ 1,000 ms;
  - no story is held back by a phone-only AC;
  - sprint-status matches epics.md: every story heading has a key, and every key changed or added here has a heading (checked for this commit; 6.13 and 6.14 have no `### Story` heading, which is older than this commit).

## 6. Open questions (accepted 2026-11-26, applied)

The designer said "ok" (2026-11-26) to every recommendation below: Q4, Q5, Q8, E8-A9, E7-A6 and clashes X1–X11. Each row is marked accepted; where the edits landed is in §8.

| # | Question | Recommendation |
| --- | --- | --- |
| **Q4** (readiness) | 10.5: safe areas are mostly built. Narrow its safe-area AC? | **Yes.** Change the buildable AC to "`hudLayout.test.ts` gains cases with a non-zero top inset (≥ 47 px) at 568 × 320 and 844 × 390, plus one Playwright run with iPhone and Pixel device emulation". The real notched-phone check stays parked (§4.7). Keep the manifest, icons, Add-to-Home-Screen and the browser matrix as the main work · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| **Q5** (readiness) | 10.8: start the balance changelog now, and change "settle" to "re-check"? | **Yes to both.** Create `docs/balance/changelog.md` now as a docs task, back-filled with Epic 5 B1–B12 and 9.13 B28 (balance hash 1728716985 → 3587910981). Every balance change from now on adds a line. Reword the 10.8 AC to "re-check 15 × N, `loot.runChance` 0.2 and the cap of 6 against real runs and bot runs; change them only with a changelog reason" · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| **Q8** (readiness) | 11.6 (Random-city art): reuse the 9.14 fixed photo-atlas frames by kind? | **Yes.** Pick frames by kind without stretching (`drawFrame` stretches today). Add the size variants a generated city needs with `npm run art:street-props`. Use code drawings only for generated buildings and ground, and when 9.2 lands, its building and ground atlas the same way. Decide it when 9.2's pick is made, because 9.2 sets the building and ground pipeline · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| **E8-A9** (retro) | Designer review of the rule changes accepted overnight: 8.9 B7 and B9, 8.10 B7 (overrides D1), 8.1 B15, B16 and B19, and the 8.3 B14 accepted risk | **Confirm all of them as built**, recorded in `docs/network-pass-decisions.md` / `docs/epic-8-story-decisions.md`, with one exception: re-check **8.10 B7** (the far rule is off, so every zombie updates at 20 Hz) on 8.13's capped-line netsim rather than on phones, since phone testing is parked. If the 64 and 128 kbit/s rows hold, confirm it; if not, 8.13's skip is the first lever, before turning the far rule back on. Do the review before the first Epic 10 story · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| **E7-A6** (retro) | The Epic 7 picks still owed: 7.3 F12 (condensed font; "Not enough" under the price), 7.4 B11 (a second borrowed card through a paid reroll), 7.6 B18/B19 ("That name is taken" on Save; the guest-progress warning on login), 7.11 D8 "Wear it", and 7.10 AC 12 (a 30-second editor playtest) | **F12:** keep as built. **B11:** drop; one borrowed card keeps the deck rule simple. **B18/B19:** build both; both are small and prevent lost progress. **D8:** build it (one button on the loot reveal). **AC 12:** run it inside the first 10.9 game night. Record the answers in `docs/epic-7-story-decisions-*.md` before 10.9 · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| — | 9.5's blood cap: 300 (AC) or 200 (code)? (N-7) | Written into 9.5 as "300 if the stress test holds, otherwise 200, with the reason recorded". No designer call is needed unless they want gore density as a pick on the 9.5 proposal page |

### Epic 12 and 8.12 clashes and overlaps (main-session follow-up; checked against the code and the plan)

| # | Clash or overlap | Recommendation |
| --- | --- | --- |
| **X1** | **8.12 vs 6.11 / FR66.** 6.11's AC (epics.md) says every player, "downed and out players included", sees the vote buttons, and Stay needs "more than half of the **whole team**". FR66 says "majority wins". 8.12 gives downed and out players disabled buttons and counts only connected, alive players. It also reverses 8.1 review M2 (a held seat as a silent Extract vote), which the 8.1 risk note guarded against: a phone that drops for a few seconds can let the rest switch to endless | **Keep 8.12 as the designer decided.** When 8.12 lands, add an as-built note to 6.11 and reword FR66 to "a majority of the connected, standing players; a tie or no counted votes means Extract". Add 8.12 to the E8-A9 review list, so the M2 reversal is confirmed together with 8.1 B15/B16/B19 · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| **X2** | **12.4 vs FR58, 4.5, 6.2 and the architecture.** The "50 % refund" is written in FR58 (E:111), Story 4.5's ACs (E:1362, :1371), Story 6.2's rubble AC (E:2088, "the usual 50 % refund (FR53)"), `game-architecture.md:460` and the HANDOFF Epic 4 summary. In code it is `decay.buildingRefundShare` (0.5) in `decaySystem.ts:56,67`. 12.4 AC 8 updates only FR58. The Epic 10.8 target (2,500–3,000 earned per player) may move | **Widen 12.4's doc AC** to every listed place: as-built notes on 4.5 and 6.2, the architecture rule line and the HANDOFF line. Land 12.4 **before 10.8**, and log the end-of-run money change in `docs/balance/changelog.md` (Q5) · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| **X3** | **12.1 vs the escape and collision work (PRs #12 and #18, `spec-fix-escape-narrow-openings.md`).** `pushOutOfBuildings › escapeInside` already has a fine-grid flood fill that prefers open ground over a sealed pocket, and `collision.test.ts` / `relocationPinned.test.ts` pin "sealed fort" and "murder hole" cases. 12.1 adds a second flood fill (`pathOpen.ts`) at player clearance. Old forts still load (12.1 AC 10), so the escape logic stays needed | **One shared rasteriser:** 12.1 builds `pathOpen.ts` on the same grid and clearance helper as the escape fill (or the flow-field rasteriser its dev notes name), so the two can't disagree about what a gap is. Keep the sealed-fort escape tests (saves and replays can hold forts), and add one test that a placement 12.1 accepts never produces a pocket the escape would call sealed · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| **X4** | **12.1 vs the 5.x placement rules and zombie behaviour.** The new `"seals_path"` refusal joins the 5.17 block reasons, the 5.18 pending chain, 5.20 undo and 5.24 moves (12.1 covers 5.18 and 5.24). Undo or take-back of a piece is never refused (it can only open a path). But every fort now has a ≥ 0.8 m gap, so zombies of player size go through it instead of breaking walls (3.5). The flow field treats buildings as costly, not closed. Barricades become funnels, and 6.13's wide-body stall fix is tested only on gaps, not on forced gaps. The designer said "zombies don't matter here" | **Accept,** but measure it: before and after 12.1, run the 10-wave bot sim (bots build around the pad) and record wall damage taken, zombies through gaps and team wipes, as input for 10.8. Add the 6.13 wide-body case "Brute at a 0.8 m forced gap" to 12.1's tests · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| **X5** | **12.1 dev and art checks.** `?stress=5&stressbuild=fort` (`debug/stressScenario.ts:364`) lays a **closed** fort, used for the 9.11 / 9.12 look checks and readability sheet item 63. 12.1 makes that layout illegal in play | **Keep the dev fort** as a debug-only layout that bypasses the placement check (it never reaches the server), and add a comment pointing to 12.1 AC 10 · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| **X6** | **12.2 vs 6.11 extract and FR67.** FR67 and 6.11 say "the helicopter lifts off into 4 s of dawn, then Results". `heliPose.ts` has `EXTRACT_FLY_S = 4` and `DESCEND_S = 2`, all on the client; today `resolveEvacVote` calls `endRun` in the same tick. 12.2 adds a new `RunPhase` "extract" (`runStateMachine.ts:43`), sim-driven, plus new synced fields (`phase`, `boarded`, `liftedAtTick`, in `RunState.ts:160`). An older client would not know the phase | **Keep 12.2.** When it lands, reword FR67 to "Extract wins the run: the survivors walk to the helicopter and fly out (≤ 20 s), then Results", and add an as-built note to 6.11. **Bump `NET_PROTOCOL_VERSION`** for the new phase and fields (3 → 4), so an old tab gets "please reload". Whichever of 12.2, 8.13 and Epic 11 lands first takes 4, and the next one takes 5 · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| **X7** | **12.2 vs saves and the copy chain (Epic 8 rules).** 12.2 says `extract` is never saved, but the Epic 8 rule is that every new run field is saved or excluded with a reason by `runSave.coverage.test.ts`. 8.4–8.6 S12 autosaves the vote, and a resume opens into the vote. Retro E8-A2 asks for a "sent, changed, synced" test per copied field | **Add to 12.2's tasks:** coverage-test exclusions for `boarded` and `liftedAtTick` with the reason "phase extract is never saved", a test that a save taken in the vote and resumed still runs the extraction, and E8-A2-style copy-chain tests for the three synced fields · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| **X8** | **12.2's fly-out horde vs 10.7 run stats and Epic 7 milestones.** "No kills counted in run stats or milestones." 10.7 is not built yet, and milestones count kills today | **10.7 must exclude the fly-out horde.** Add one line to 10.7's AC ("kills during `extract` are not counted"), and give 12.2 a test that milestone counters do not move during `extract` · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| **X9** | **12.3 vs Epic 9 photoreal.** The crew sprite is "code-drawn, one simple figure". The helicopter is not in any photoreal group (`docs/art/photoreal-decisions.md`). The 0.6× zoom-out shows about 40 × 22.5 m with 9.2's buildings and ground, so 9.2's atlases must look right zoomed out, and the darkness and fog layers must cover the wider view | **Build 12.3 with code-drawn placeholders now**, then add the crew and the helicopter to 9.1's inventory as a photoreal group picked with 9.4 (characters) or 9.2 (city). Add "looks right at 0.6× zoom" to 9.2's proposal page · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| **X10** | **12.1 and 12.3 performance ACs name reference phones** (12.1 AC 9 "< 1 ms … on a reference phone"; 12.3 AC 12 "on the Epic 10 reference phones"), which are parked | **Measure them headless:** 12.1 at 4× CPU throttle (< 1 ms per check on Downtown, and record the time on a 140 × 140-cell grid for Epic 11's 70 × 70 m maps); 12.3 with `?stress=150` at 4× CPU during the fly-out, within the 9.x budget (2 FPS, +1 ms p95 of a normal wave). Keep the phone wording as parked · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |
| **X11** | **Order of Epic 12 vs Epics 9 and 10.** | **8.12 → 12.1 (+ 12.4) → 12.2 → 12.3**, after or alongside 10.1, and **before 10.2** (the frame-rate pass should measure the fly-out), **10.8** (12.4 moves the money) and **10.9** (the playtests should play the final ending). Epic 9 has no hard tie: 12.3 uses placeholders (X9). Epic 11 needs 12.1's check on generated maps, and every generated city's `evac_pad` must sit in the main walkable region · **Accepted 2026-11-26** (designer "ok"; applied, see §8) |

## 7. Files changed (this commit, docs only)

- `_bmad-output/planning-artifacts/epics.md`
- `_bmad-output/planning-artifacts/game-architecture.md`
- `_bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/{gdd.md, epics.md, decision-log.md}`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/1-11-performance-overlay-and-150-walker-stress-test.md`
- `_bmad-output/implementation-artifacts/1-12-melee-and-controls-playtest-on-real-phones.md`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `_bmad-output/implementation-artifacts/epic-7-retro-2026-11-26.md`, `epic-8-retro-2026-11-26.md` (action targets only, §4.7)
- this proposal

## 8. Accepted recommendations applied (2026-11-26, docs only)

Designer "ok" (2026-11-26) to every §6 recommendation. Applied:

- **Q4:** 10.5 gets a narrowed buildable safe-area AC (`hudLayout.test.ts` top inset ≥ 47 px at 568 × 320 and 844 × 390, one Playwright iPhone + Pixel emulation run) (`epics.md`).
- **Q5:** `docs/balance/changelog.md` created, back-filled with Epic 5 B1–B12 and 9.13 B28; 10.8's AC now "re-checks" 15 × N, `loot.runChance` 0.2 and the cap of 6, changing them only with a changelog reason (`epics.md`).
- **Q8:** 11.6 reuses the 9.14 atlas frames by kind, without stretching; building and ground follow 9.2's pick (`epics.md`).
- **E8-A9:** confirmed as built in `docs/epic-8-story-decisions.md` › Designer review 2026-11-26 (pointer in `docs/network-pass-decisions.md`); the 8.10 B7 re-check is an 8.13 AC (`epics.md`).
- **E7-A6:** `docs/epic-7-decisions.md` › Designer answers 2026-11-26 (F12 kept, B11 dropped); new **Story 7.13 Epic 7 leftovers (B18/B19, Wear it)** in `epics.md` and sprint-status (backlog; epic-7 in-progress); 7.10 AC 12 in 10.9's first game night (`epics.md`, `docs/playtests/epic-7-customization.md`). Note: B18/B19 are already in the code (`name_taken`, `mergeWarning`), so 7.13 verifies and tests them; D8 is the real build.
- **X1:** 8.12 AC (epics.md) + story file AC 8: the 6.11 as-built note and FR66 rewording when 8.12 lands.
- **X2:** 12.4 doc AC widened (FR58, 4.5, 6.2, architecture, HANDOFF), lands before 10.8 with a changelog line (epics.md + story file AC 9–10).
- **X3, X4, X5, X10:** 12.1 ACs (epics.md + story file AC 13–16).
- **X6, X7, X8:** 12.2 ACs (epics.md + story file AC 17–19); 10.7 does not count `extract` kills.
- **X9, X10:** 12.3 ACs (epics.md + story file AC 14–15); 9.1 lists the crew and helicopter as a photoreal group; 9.2's proposal page checks the 0.6× zoom-out.
- **X11:** Epic 12 intro order line; 11.1's anchor check puts `evac_pad` in the main walkable region and runs 12.1's check.
- GDD: `decision-log.md` entry 2026-11-26, `epics.md` Epic 7, 10, 11, 12 lines.
- Not touched: the Tasks sections of the 10-1 and 8-12 story files (builders at work); 10.1's ACs.
