# Sprint Change Proposal: Epic 8 decisions (2026-11-24)

Mode: batch. Scope: **Minor** (backlog text only; Epic 8 is not started, no code changes). Approved by the designer ("ok", all recommendations).

## 1. Issue
The Epic 8 decisions pass (`docs/ideas/epic-8/decisions.md`, D1–D15, pressure-tested in `docs/ideas/epic-8/forge/`) found gaps in the planned stories: losing the whole loadout after 120 s, near-zero catch-up money from "average wallet", a host-only resume although host can migrate, a wipe-dodge by quitting mid-wave, no handling when every player drops, and saves dying on releases.

## 2. Impact
- **Epic 8:** all seven stories rewritten in `epics.md` (8.3 renamed "Host role and removing a player"; 8.4 adds `saved_run_players`, two snapshots per build phase, the lost-run rule).
- **FRs:** FR72–FR76 updated (catch-up money, remembered seat, host role, resume by any account, "Big one!" ping).
- **GDD:** Multiplayer Considerations and Run Structure pause/resume lines.
- **Architecture:** Saved runs row; Host line in Run Room Rules.
- **Epic 7:** Story 7.2 should count Supplies only for waves a player was in (note, not yet edited).
- **Code today:** host already migrates on leave (`apps/server/src/run/lobby.ts nextHost`); nothing else built.

## 3. Approach
Direct adjustment. Story files are written with `gds-create-story` just before Epic 8 is built, after Epic 6 changes the run state.

## 4. Changes
| Decision | Story text now says |
| --- | --- |
| D1, D2 | 120 s hold; survivor vanishes safely; dropped while downed = out for the wave (8.1) |
| D3 | everything held exactly (reload restarts, card offer kept) (8.1) |
| D4 | seat remembered all run by account (8.1, 8.2) |
| D5 | World freezes while nobody is connected, up to 120 s (8.1) |
| D6, D7 | joins in any build phase, +15 s once per phase, 100 + 60 % of team's average earned (8.2) |
| D8, D9 | host moves at once, never back; host can Remove player in lobby/build (8.3) |
| D10, D11 | snapshots at build start and last build tick; resumable after Save and quit, server stop, or all leaving in a build; mid-wave abandon = lost (8.4) |
| D12 | Save and quit host only, build phases (8.5) |
| D13, D14 | any account from the run resumes; 3 saves per account; balance changes never block, schema bumps need a migration (8.6) |
| D15 | Help! · Over here · Big one! · Ready; pinned 4 s; one live ping per player (8.7) |

## 5. Handoff
Developer agent / main session: build Epic 8 from these texts after Epics 6–7. Success: each AC above has a test; the 8.4 round-trip test covers every run-state field.
