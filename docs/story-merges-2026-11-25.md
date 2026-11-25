# Story merges (designer 2026-11-25, "Yes merge what can be merged")

Merged stories are built by ONE builder and get ONE fresh review (and at most two narrow re-reviews, then main-session checks — re-review cap). Each original story file keeps its ACs; the builder works from both files and records one Dev Agent Record in the first file (the others point to it). Sprint status moves together.

| Merged story | Contains | Why | Review |
| --- | --- | --- | --- |
| **7.4+7.5** | 7.4 Shop deck from my unlocks · 7.5 Training boosts | share `addPlayer` options, the run-start progress load, `PlayerState` fields and `NetSimHost` (already planned in sequence by one builder) | full (shop draw + Training are rules a player can exploit) |
| **7.7+7.11+7.12** | 7.7 District unlock rule · 7.11 Milestone items · 7.12 T5 (bag banking; T0–T4 already built on story-7-12) | all three write inside 7.2's end-of-run bank transaction (`meta/banking.ts`, `boundedTransaction`) and add rows to the same Results groups; 7.7's district unlock and 7.11's M2 "first extraction" fire from the same `run.extracted` | full (rewards) |
| **8.4+8.5+8.6** | Autosave at every build phase · Save and quit · Resume a saved run | one save format, one storage table, one restore path | full |
| **8.2+8.3** | Join mid-run at a build phase · Host role and removing a player | both extend 8.1's seat/lobby code (`seatKey`, remembered seats, join rules) | full |

Kept separate: **7.6** Upgrade to an account (passwords + guest merge: its own full review), **7.10** Survivor editor (mostly visual: light review), **8.7** Pings (small, parallel), **8.11** optional (+ 8.10's 64 kbit/s backpressure follow-up).

Epic 8 story files (8.2–8.7) don't exist yet: they are written as the merged files above (`gds-create-story`), prepared while Epic 7 lands; building them stays the stretch goal (only once Epic 7 is fully on master).
