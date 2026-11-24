# Sprint Change Proposal: Epic 7 readiness fixes (2026-11-24)

Mode: batch. Scope: **Minor** (planning text only; Epic 7 is not started, no code changes). Approved by the designer ("let's do all that", 2026-11-24). Source: `implementation-readiness-report-2026-11-24-epic-7.md` (G1–G3, U1, Q1–Q11).

## 1. Issue

The Epic 7 readiness check found stale numbers, stories that read data or features from later stories or Epic 8, customization without a requirement, and an architecture behind the stories.

## 2. Impact

- **Epic 7:** Stories 7.2, 7.3, 7.5, 7.6, 7.9, 7.10, 7.11 and 7.12 edited; epic summary and FR line updated. No new stories.
- **Epic 8:** Story 8.4's snapshot also carries the waves each seat was in (from 7.2). The loot bag was already listed.
- **FRs:** FR12 (start 200), FR80 (200 → 250), new **FR89** (survivor customization) mapped to Epic 7.
- **GDD:** "cosmetics" removed from Not in v1; a "Survivor look" line added to Player Progression.
- **Architecture:** Accounts (cookie + `localStorage`, account HTTP API, session ticket in join options), tables, balance files, seed streams.
- **Sprint status:** the Epic 9 note no longer says an artist and sound designer are hired.

## 3. Approach

Direct adjustment of backlog text. Story files are written from these texts (7.8 now; 7.1–7.7 after Epic 6).

## 4. Changes

| Finding | Change |
| --- | --- |
| G1, Q1 | FR12 and FR80, Story 7.5: start money 200, Training 200 → 250 (+10 per level, read from `economy.json`) |
| G2, G3, Q4 | FR89 added and mapped; GDD scope line and Player Progression updated |
| Q2 | 7.9's migration adds `look`; ownership = `starter` rule until 7.11; 7.10 only writes `look`; 7.11 extends the check |
| Q3 | 7.2: waves per seat kept in run state, resumed-night counting moved to a note for 8.4/8.6; 7.12: snapshot AC replaced by a note; 8.4 lists "waves each seat was in" |
| Q5, Q11 | Architecture: guest token in a 1-year HttpOnly cookie + `localStorage`; account HTTP API in `apps/server/src/app.ts`; client gets a short-lived session ticket and sends it in the Colyseus join options; full `accounts`/`progress` columns with the story that adds each; `progression.json`, `cosmetics.json`; `loot` stream |
| Q6 | 7.6 merge: every later progress field merged by its own story's rule (7.10 look, 7.11 cosmetics and stats) |
| Q7 | 7.3: hub opens with Unlocks; Training and Survivor tabs added by 7.5 and 7.10 |
| Q8, U1 | 7.2 leaves the "Save my progress" Results line to 7.6; 7.6 adds the start-screen "Save my progress" / "Log in" / "Forgot password" / "Log out" entry |
| Q9 | 7.12 adds `loot` to `STREAM_NAMES` (other streams unchanged) |
| Q10 | 7.10: timed 30 s check in the designer's playtest |

**Decision to confirm (technical, Q11):** the session ticket in join options was picked because an HttpOnly cookie can't be read by the client and Colyseus join options are the existing path for the display name. Change it in Story 7.1 if the builder finds a simpler way.

**Designer decisions (2026-11-24, after this proposal):** late joiners get **200 + 60 %** of the team's average earnings (base raised from 100 to the run's start money; FR72, Story 8.2, GDD, Epic 8 D7 note); FR45 corrected to the **15 × N** wave bonus already in `economy.json` and the GDD. Story 3.2's done text (10 × N) is left as history.

**Still open (before Stories 7.3 and 7.6):** U2 Progress hub layout and U3 Run rewards panel layout on a landscape phone.

## 5. Handoff

Story files: 7.8 now (no dependencies; art pick first). 7.1–7.7 after Epic 6. 7.9–7.12 after 7.1, 7.2 and 7.8.
