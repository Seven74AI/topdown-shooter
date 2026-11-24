# Epic 8: designer decisions

Written 2026-11-24, before Epic 8 is built (story files come later, after Epic 6 changes the run state). Each decision lists options with the **recommendation first**. Answer "ok" to accept every recommendation, or change one by its code (e.g. "D5 B").

Pressure-tested with `bmad-forge-idea` (`forge/`): Cloud Dragonborn (architect), Samus Shepard (designer), Theo (the friend who plays on the train) and Rina (the min-maxer). Their cracks changed D2, D4, D5, D6, D7, D8, D11 and D13.

**What the code does today:** any dropped connection = the player leaves for good (removed from the fight at once, wallet and gear gone). Joins work only in the lobby. The host role **already moves** to the longest-connected player when the host leaves (lobby and mid-run). Nothing is saved.

## Dropping out and coming back

**D1. How long a dropped player is held.**
- **A (rec.) 120 s** (the GDD's 2-minute rule). Covers a tunnel, an app switch, a phone call.
- B 60 s: less time with a missing teammate, but a phone call can outlast it.
- C 180 s.

**D2. What their survivor does while they're gone (mid-wave).**
- **A (rec.) Vanishes safely.** Out of the fight: zombies stop chasing it, it can't be hurt, it doesn't count for a team wipe. If they were **downed** when they dropped, they count as **out** for this wave and come back at the next build phase (no free revive by reconnecting).
- B Stays frozen in place: zombies eat it; a 4G blip often means coming back dead.
- C Goes downed at once: teammates must revive a player who isn't even there.
- D A simple bot plays it: lots of work, and bots don't dodge.

**D3. Where they come back and with what.**
- **A (rec.) Everything exactly as held:** HP, wallet, weapons, upgrades, gear, consumable count, ammo in the magazine (a reload in progress starts over), the current card offer and rerolls. Mid-wave: next to a standing teammate. Build phase: where they were. A building they were carrying goes back to their hand.
- B Same, but back at full HP and ammo: rejoining becomes a heal.

**D4. When the 120 s run out.**
- **A (rec.) The seat is remembered for the whole run.** The survivor's stuff stays frozen (no more turret pay after 120 s, as Q16). If they come back later, at a build phase and with a free slot, they get **their own** stuff back, never the fresh-joiner money. This also stops "quit and rejoin to get new cash".
- B GDD as written: after 120 s they are gone; a return is a new join (Pistol + catch-up money), so a dead phone costs you your whole loadout.

**D5. Everyone is disconnected at once** (solo in a tunnel, the whole group on a bad train, the Wi-Fi drops).
- **A (rec.) The fight freezes** (zombies, timers, everything) while nobody is connected, up to 120 s. The first one back unfreezes it, with a 3-2-1 count. After 120 s the room closes and the run is **lost** (see D11).
- B The fight keeps going with nobody there (the room may close and lose the run within seconds; solo runs die on every tunnel).

Teammates see a grey chip "Theo · reconnecting 1:43" in the team list and a toast when they're back; no body on the map. Their buildings stay and anyone can repair them (no decision needed).

## Joining a run that's already going

**D6. When a late friend may join.**
- **A (rec.) In any build phase, including endless.** During a wave they see "Wave in progress, you'll join at the next build phase" and watch the fight. A join adds **+15 s** to the build timer (once per build phase), so they can shop.
- B Build phase only, no extra time (a friend arriving with 4 s left can't buy anything).
- C Only up to wave 5.

**D7. What a late joiner starts with.**
- **A (rec.) Pistol + 100 + 60 % of what the team has earned on average so far.** About 640 at wave 5, about 1,400 at wave 9 (at the GDD target of ≈ 2,750 per full run). Enough for one good weapon and a building, still behind the others.
- B The team's **average wallet** (GDD as written). Right after a shopping phase that can be ~50 at wave 7.
- C A fixed table per wave (wave 3: 400, wave 6: 900, wave 9: 1,400).

## Host

**D8. What "host" means with our own server.**
The server runs the game; no phone hosts it. "Host" is only who taps **Start**, **Save and quit** and (D9) **Remove player**.
- **A (rec.) The role moves at once** when the host drops or leaves, to the longest-connected player ("You are now the host"), and **does not move back** when they return (no flip-flopping during a bad-signal night). Story 8.3 shrinks to this plus the kick (D9); most of it is already built.
- B The role waits for the host's 120 s first (GDD wording): nobody can save while the host is in a tunnel.

**D9. Removing a player.** A share link can leak to someone you don't know.
- **A (rec.) The host can remove a player in the lobby and in build phases** (with a confirm). A removed player can't rejoin this run.
- B No kick (friends only; everyone just leaves and makes a new room).

## Saving

**D10. When the run is autosaved and what it holds.**
- **A (rec.) Twice per build phase: when it starts, and on its last tick** (the wave is about to begin, all purchases made). Only the newest is kept. It holds everything a resume needs: every player's seat (wallet, earned, weapons and upgrades, gear, consumables, card offer), every building (type, tier, rotation, owner, HP, wear, what was paid), wave, decay stage and the run's variations, light and blackout, event schedule, boss and endless counters, loot bag, every random stream. Never zombies, shots, puddles or fires (a build phase has none). About 50 KB.
- B Only at build start (a crash mid-wave loses that build phase's shopping).

**D11. Which saves can be resumed.**
- **A (rec.) Three ways:** Save and quit (D12); the **server** stopping (crash or deploy: "Server restarting, your run is saved"); everyone leaving during a **build phase** (counts as Save and quit). Everyone leaving or timing out **mid-wave** = the run is **lost** (Results "Lost in the city"). This stops "close the app before a wipe and retry the wave".
- B Any autosave can be resumed, whatever happened (an easy wipe-dodge).

**D12. Save and quit.**
- **A (rec.) Host only, build phases only, with a confirm.** Held buildings go back, pending placements finish, the undo window closes. Everyone sees "Run saved. Anyone from this run can resume it for 7 days." Any other player can still Leave on their own at any time. During a wave the button is greyed: "You can save during the build phase".
- B Anyone can Save and quit (one friend ends the night for everyone).
- C A team vote (slower, needs vote UI).

## Resuming

**D13. Who can resume and with whom.**
- **A (rec.) Any account that was in the run can resume it** (not only the host: with D8 the host can change mid-run). Kept 7 days, at most **3 saved runs per account** (the oldest drops off). One run can be open only once at a time; a finished run (won, wiped, extracted) deletes its save.
- B Only the host at save time (GDD as written): if the organiser's phone breaks, the run is gone.

**D14. Resuming with fewer or other players.**
- **A (rec.)** A new lobby with a new code; returning accounts get their own seat back; newcomers join with the D7 money; wave size uses the new player count (solo × 0.4). Missing players' stuff waits in the save for a later night; their buildings stay up and are repairable, but their turrets pay nobody. A save from an older game version **always** resumes: balance changes never block it, and every change to the save format ships a migration (a test fails without one).
- B Old saves die whenever the save format changes (any release could wipe everyone's saved runs).

## Pings

**D15. Pings.**
- **A (rec.)** Button top-right (Q14), F on desktop, hidden while holding a building. Wheel: **Help! · Over here · Big one! · Ready** ("Big one!" replaces "Brute!" so it also fits the Behemoth). Pinned where you sent it (your position), **4 s**, one live ping per player (a new one replaces the old), max 1 per second, your colour + edge arrow off screen + a short sound, drawn above the blackout (Q14). Downed players can ping.
- B Also a fifth "Look there" ping placed where you aim (8 m out): more useful in the blackout, but a harder wheel on a phone.
- C GDD wording "Brute!" kept.

## Abuse cases (covered by the choices above)

| Trick | Stopped by |
| --- | --- |
| Drop while downed to come back standing | D2: dropped while downed = out for the wave |
| Rejoin to reload, reset the consumable gap or get a new card offer | D3: everything held exactly |
| Quit and rejoin as "new" to get fresh money | D4: your seat is remembered all run |
| Everyone closes the app before a wipe, then resumes | D11: mid-wave leaving loses the run |
| A stranger with the link | D9: host removes them |
| Join at wave 9 to farm Supplies (Epic 7) | Supplies count only waves you were in (note for Story 7.2) |
| Returning mid-wave next to a teammate (a small teleport) | Accepted: costs 5–10 s of reconnecting |

## Designer answers

_Pending._
