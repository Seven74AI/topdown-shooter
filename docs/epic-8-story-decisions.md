# Epic 8 story decisions (8.2+8.3, 8.4–8.6, 8.7)

Written 2026-11-25 by the story writer (`gds-create-story`, autonomous) for the three remaining Epic 8 story files:

- `_bmad-output/implementation-artifacts/8-2-3-join-mid-run-and-host-role.md`
- `_bmad-output/implementation-artifacts/8-4-5-6-save-and-resume.md`
- `_bmad-output/implementation-artifacts/8-7-pings.md`

The designer's Epic 8 decisions D1–D15 (`docs/ideas/epic-8/decisions.md`, accepted 2026-11-24) are **rules**. The decisions below are new: questions the story files had to answer that D1–D15 leave open. Each uses the **recommended value** (overnight style, designer: "follow the GDS recommendation"), and all are **recommended, to accept**. To change one, give its code and the alternative (e.g. "E8-J3 B").

## Joining mid-run (8.2)

| Code | What it changes in play | Recommended (in the story) | Alternative |
| --- | --- | --- | --- |
| **E8-J1** | A friend who joins in the **first** build phase gets less money than a normal start (D7's formula: 100 + 60 % of 0 = 100 < 200). Story 7.5 Training start money is also left open (`epic-7-story-decisions-progress.md` line 141). | Late money = **max(own start money, 100 + ⌊0.6 × team average earned⌋)**. Own start money is 200, plus Training start money once 7.5 is on master. Training does not add on top of the formula. | B: the D7 formula alone (first-build joiner 100). C: the formula plus the Training start money on top. |
| **E8-J2** | Whose earnings make "the team average". | Seats in the fight now (present + reconnecting). Players who left the run don't pull it down. | B: every seat of the run, including ones that left. |
| **E8-J3** | A late joiner could take a teammate's old slot. That slot carries the player id, the building cap and turret pay, so the joiner would collect a gone friend's turret kills. | A held or remembered seat **keeps its slot**. If no other slot is free: "This run is full". The host can free a remembered seat with Remove. | B: the joiner takes the slot. The old seat's buildings are disowned, and the old seat can come back only into another free slot. |
| **E8-J4** | +15 s build time on a join (D6). | Only the **first late join in a build phase** adds 15 s. A returning own seat adds nothing. | B: every new joiner adds 15 s (several joins = several extensions). |
| **E8-J5** | A remembered seat (dropped > 120 s) comes back mid-wave. | It keeps waiting on the "seat kept" screen until the build phase (8.1 D4, unchanged). It does not watch as a spectator. | B: it watches like a new joiner (J4) until the build phase. |
| **E8-J6** | Leave at wave 3 (Supplies banked then, 7.2), rejoin, play to wave 10. With 7.2's "once per run" key, waves 4–10 would pay nothing. | **Top-up**: a second bank for the same run pays only the difference (`new − already`, never negative), in the same transaction. The total always equals one uninterrupted run. | B: bank only once per run. Leaving and rejoining forfeits the rest. |

## Host and removing a player (8.3)

| Code | What it changes in play | Recommended (in the story) | Alternative |
| --- | --- | --- | --- |
| **E8-H1** | Who is "longest connected" after drops. D8 says the role never moves back, but the old host still has the earliest join and would win the *next* host change. | A seat that returns from a hold counts as **newly connected** (it goes to the back of the line). | B: original join order (an old host who returns wins the next change). |
| **E8-H2** | How long a removed player stays out. | Banned for the **whole room** (the lobby and every later run in it, by seat). A stranger with a fresh browser can still get in; the host removes again. | B: banned only for the current run. C: also a host "lock: no new players" switch (more UI). |
| **E8-H3** | A removed player's buildings. | They **stay** standing, anyone can repair them, they **pay nobody** and count for nobody's cap (owner cleared, owner mark neutral). | B: they are removed with the player (the team loses walls mid-build). |
| **E8-H4** | Supplies for a removed player (Epic 7). | Banked like a Leave ("quit": the waves they were in). | B: nothing. |

## Saving and resuming (8.4–8.6)

| Code | What it changes in play | Recommended (in the story) | Alternative |
| --- | --- | --- | --- |
| **E8-S1** | What the save is. | A separate, versioned save format (`packages/shared/src/save/`), not today's `snapshotWorld` digest. A **coverage test** forces every new state field to be "saved" or "excluded with a reason". A round trip is judged equal by `snapshotWorld`. | B: extend `snapshotWorld` into the save (it hashes buffers, so restore would need a second shape anyway). |
| **E8-S2** | The "last tick" autosave (D10). | Captured **just before the tick that ends the build** (timer at 1 tick, or everyone Ready), so every purchase is in it. | B: captured on the wave's first tick (the World is already in the wave). |
| **E8-S3** | Save id. | The save id **is** Story 7.2's run id, kept across resumes, so Supplies stay "banked once per run" over several nights. | B: a new id per resume (a run resumed 3 times could bank 3 times). |
| **E8-S4** | A save that expires after 7 days would lose the Supplies of the waves played. | Every resumable save **tops up Supplies** for the waves played so far (no extract bonus). The final Results top up the rest (via E8-J6). | B: bank only at the final Results (an expired save pays nothing). |
| **E8-S5** | The tables (epics 8.4 AC 1 lists the columns). | Add `wave`, `names` (for the Saved games list without loading 50 KB), `status` (`open`/`saved`), `room_code`, `updated_at`, `expires_at`. Only the two tables. | B: exactly the listed columns. The list reads the snapshot. |
| **E8-S6** | A server process that dies without a clean stop (power cut, OOM). | At the next start, every save still marked "open" becomes resumable (= "the server stopping", D11). Its last autosave is the save. | B: those runs are lost. |
| **E8-S7** | Autosave writes. | Never awaited by the tick. One write in flight per room, and a newer save replaces a queued older one. Capture + JSON ≤ 3 ms. Database down → skipped and logged, play goes on. | B: synchronous write at the build start (could stall the tick). |
| **E8-S8** | Save and quit fails (database down). | The room **stays open**. The host sees "Couldn't save the run. Try again." and play goes on. | B: everyone is sent out anyway ("Couldn't save"), and the run is lost. |
| **E8-S9** | An old save names an item the new balance no longer has. | The item is dropped and its `paid` refunded to the owner (unknown weapon → slot default, building removed, gear bit dropped), logged. It never blocks the resume (D14). | B: the save is refused ("This save is too old"). |
| **E8-S10** | Removed players and saves. | Banned seats are in the save: a removed player can't come back by resuming or by joining the resumed lobby. | B: bans end with the room (a resume forgives). |
| **E8-S11** | The 3-saves-per-account limit (D13). | After each save, each account keeps its **newest 3** resumable runs. An older link is dropped, and a run nobody is linked to any more is deleted. | B: a 4th save is refused until one is finished. |
| **E8-S12** | The evacuation vote (after wave 10 / every 5th endless wave): no zombies, but not a build phase. | The vote counts as a calm phase. Everyone leaving or the server stopping during the vote **saves**, and the resume opens **into the vote** with a fresh vote timer. Save and quit works there too. | B: the vote counts like a wave (everyone leaving there = lost run). |
| **E8-R1** | Who hosts a resumed run. | Whoever taps Resume. The lobby shows "Resuming · Downtown · wave 6" and has a new code. Anyone with the link can join. | B: the host at save time only (GDD wording, already replaced by D13). |
| **E8-R2** | A saved player who isn't there on resume. | Their seat becomes a **remembered seat** for tonight (they can still join at a build phase) and stays in the next save. | B: they can come back only on a later resume. |
| **E8-R3** | A newcomer's money on resume. | Story 8.2's late-join money, from the returning seats' average earned. | B: a normal start (200). |
| **E8-R4** | Build time on resume. | A **fresh full build timer**. No +15 s for lobby joins (they joined before the timer started). | B: the timer left at save time. |
| **E8-R5** | Where "Saved games" shows. | On the start screen between Join and Practice solo (Lumen LF5 rows: district · wave · names · "saved 2 days ago" · Resume), or inside the Epic 7 hub (PH1) if that is on master. No delete button (saves expire in 7 days). | B: also a "Forget" button per row. |

## Pings (8.7)

| Code | What it changes in play | Recommended (in the story) | Alternative |
| --- | --- | --- | --- |
| **E8-P1** | Wheel shape and controls. | Tap the button: 4 chips (≥ 44 px, icon + word) fan out in a quarter circle down-left of it. Tap a chip to send. It closes on a second tap, a tap outside, or after 3 s. Desktop: F opens, 1–4 pick, Esc closes. | B: a short vertical list under the button. C: press-and-drag to a chip (faster, harder to learn). |
| **E8-P2** | The four icons (a new look; normally a designer pick). | Code-drawn: Help! = white cross on a slot-colour disc, Over here = pin, Big one! = "!!" in a triangle, Ready = check, each with its word. No red (red = boss danger). Readability sheet items 130–133. The designer can swap them later. | B: words only (no icons). |
| **E8-P3** | Ping sound. | One short synth chirp panned toward the ping. "Help!" plays it twice. The sender hears it too. No haptics. | B: a different cue per kind. C: no sound for your own pings. |
| **E8-P4** | Who can ping. | Standing and **downed** players (D15), in build phases, waves and the vote. Not out (spectating) players, reconnecting seats, waiting late joiners, the lobby or Results. | B: out players can ping too (from their last position). |
| **E8-P5** | Rate limit. | Its **own** server bucket (1 per second) so pings never use up the shop/build message budget. The button shows a 1 s ring after a send. | B: share the "other" 10/s bucket. |
| **E8-P6** | Do pings affect the fight? | Never: not World state, not in replays or saves, zombies don't hear them. | B: "Over here" lures zombies a little (a new game rule: needs a designer pick). |

## Numbers handed out (brief 27)

- netEvents kinds reserved: 8.2+8.3 **140–144**, 8.4–8.6 **145–149**, 8.7 **150–154**. None is expected to be used (joins, removes, saves and pings are S2C messages).
- Readability sheet: 8.7 **130–133**.
- Close codes: **4022** removed (8.3), **4023** run saved (8.5). Both end the connection for good: no reconnect, never 4000.
- Migration: the next free number when 8.4–8.6 lands (`0002_saved_runs` if no Epic 7 migration came before it).

## Build order

1. **8.2+8.3 ∥ 8.7**, both on master now. The only overlap is message names and `RunRoom.onCreate` lines. 8.2+8.3 task T9 (Supplies top-up) waits for 7.2 on master.
2. **8.4–8.6** after 7.1 and 7.2 are on master **and** after 8.2+8.3 (it reuses late-join money, bans and the top-up). Preferably also after the Epic 7 stories that add run state, so the coverage test sorts their fields in one pass.

## Designer answers (2026-11-25, ~12:00)

- **All 33 decisions accepted as recommended**, except where noted below.
- **Spitter deadlock:** keep today's rules. Spitter acid passes barricades; bullets stop on barricades (the 2026-11-23 rule stays). Add fix **A**: when every remaining zombie is a Spitter holding a spot, the Spitter rush starts at once instead of waiting for ≤ 5 left (`packages/shared/src/zombies/spit.ts`). The designer's reasoning: "bullets and acid are pretty much the same thing", so acid going through matters more to them than symmetry. Ride-along task on the first Epic 8 story touching the sim (8.2+8.3), with a headless test: 6 Spitters holding behind a barricade end the wave.
