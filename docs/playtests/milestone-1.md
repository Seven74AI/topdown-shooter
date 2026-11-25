# Milestone 1 playtest (Story 4.10)

One evening, 2–4 friends, real phones over 4G. This one session covers every human check still open:

| Check | From | Where it's recorded |
| --- | --- | --- |
| Controls feel (move, aim, auto-fire, aim assist, swap, melee) | 1.12 | Part 1 form, below |
| Phone speed with the Dead City look (mid-range Android if anyone has one) | 1.11, 4.9 | `docs/perf/milestone-1.md` |
| 4 phones on 4G: bandwidth, ping, reversed hits, snaps | 2.10 | `docs/perf/milestone-1.md` |
| Build phase on touch: Ready, Shop, placing, repairing | Epic 3 | Part 5 form |
| Runner and Crawler readability | Epic 3 | Part 4 sheet |
| **Earnings decision:** keep, or wave bonus 15 × N | Epic 3 | Decisions |
| Stage objects: "what is this?" and "does it stop bullets?" (this replaces the planned 4.11 redraw) | Epic 4 retro | Part 4 sheet |
| Fire edge, decay feel, night and rain | 4.6–4.9 | Part 5 form |

**The decision this session makes:** **go** (start Epic 5) or **fix-first** (stories for the problems first). See "Decision rules".

## Before the session (designer)

1. Ask Hermes to deploy the latest `master` (`docs/hermes-go-live.md` › Every later release), then check that `https://hordes.sevend.io/api/health` answers.
2. Send everyone this page's link and the Part 4 sheet (`docs/playtests/milestone-1/readability-sheet.md`). **Tell them not to open the sheet before Part 4.**
3. Each phone: battery above 50 %, **Wi-Fi off** (mobile data), screen lock off or set long, sound on, **landscape**.
4. Optional but very useful: the host starts a **screen recording** for the online runs (iPhone: Control Centre › Screen Recording; Android: quick settings › Screen record). It's the only way to watch moments later, since everyone is playing.

## Plan (about 75 min)

| Part | What | Time |
| --- | --- | --- |
| 0 | Welcome, setup, Wi-Fi off | 5 min |
| 1 | Solo controls, two loadouts | 10 min |
| 2 | Speed test on each phone | 3 min |
| 3 | **Online run A** with the numbers overlay (5 waves) | 15 min |
| 4 | Readability sheet (alone, no talking) | 5 min |
| 5 | **Online run B**, just play (5 waves) | 15 min |
| 6 | Talk it through + forms | 15 min |
| 7 | Designer: decisions | after |

### Part 0: welcome (read this out)

> "It's a co-op zombie game for phones. The city falls apart over the night. We're testing whether it works and whether it's fun, not whether you're good at it. Play the way you normally would, and say out loud what you're thinking if you like. There are no wrong answers. If something breaks, tell me, but keep playing if you can."

Don't explain the objects, the cover rules or the shop. Finding out by yourself is part of the test.

### Part 1: solo controls (1.12)

Each player alone, in landscape:

| Loadout | Link |
| --- | --- |
| Pistol + Machete | https://hordes.sevend.io/?loadout=pistol,machete&tune=1 |
| SMG + Hunting Rifle | https://hordes.sevend.io/?loadout=smg,hunting_rifle&tune=1 |

Play **2 waves with each**. Left thumb moves; right thumb aims, and pushing past about a third fires automatically. ⇄ swaps weapons. Fill in the controls form (Part 6) right after.

### Part 2: speed test (1.11)

Each phone: open **https://hordes.sevend.io/?stress=150** and wait 60 s without touching the screen. Tap **Copy results** and paste into the group chat. The perf sheet has a row per phone.

### Part 3: online run A, with numbers (2.10)

1. **Host:** open **https://hordes.sevend.io/?debug=1**, type a name, tap **Create game**, and send the share link.
2. **Others:** open the link, **add `?debug=1` to the end** (`https://hordes.sevend.io/j/ABCD?debug=1`), type a name, tap **Ready**.
3. Play the whole run: 5 waves (waves 1–2 Evening, 3–4 Panic, 5 Breakdown with burning cars and rain).
4. After each wave a **Network results** box opens. Tap **Copy results** and paste into the chat during the 30 s build phase. At minimum, copy **wave 4 and wave 5**: they're the biggest hordes, and wave 5 has fire and rain.
5. At the end, **screenshot the Results screen** (it shows each player's money earned and the run seed), win or lose.

If a phone has no mobile data, it stays on Wi-Fi and adds `&lag=150&jitter=20` to fake 4G. Write down which phones did that.

#### Reconnect checks (Story 8.1, during run A, one iPhone and one Android)

These can only be checked on real phones (the cloud session has no iPhone; brief line 23). In a wave, with teammates around:

1. **Lock the phone for 30 s mid-wave, then unlock it.** Expected: after ~3 s the teammates see a grey chip "<name> · reconnecting 1:5x" (top left) and no body on the map; the locked phone, when unlocked, shows "Connection lost, reconnecting…" for a moment (or nothing, if it was quick), then the survivor is back next to a teammate, blinking for 2 s (can't be hurt, can't shoot), with the same HP, money, weapons and ammo. The teammates see "<name> is back". Write down how many seconds the phone needed after unlocking.
2. **Airplane mode for 10 s mid-wave, then off.** Same as 1. Also check: nothing tapped while offline (shop, Ready, a consumable) happened late.
3. If either phone shows the "reconnecting" screen for more than ~15 s after the signal is back, note the phone and browser (iPhone Safari: the page should reload by itself after 5 s and take the seat back).
4. Bonus (one phone): while held, the others keep fighting; if **everyone** locks their phone at once, the night waits ("Paused: nobody connected") and the first one back gets a 3-2-1.

### Part 4: readability sheet (Epic 4, Epic 3)

Right after run A, **each player alone, without talking**, opens the readability sheet and writes for each picture: what it is, and whether bullets go through it. Collect the answers before anyone discusses them.

### Part 5: online run B, just play

The same as run A but **without `?debug=1`** (no numbers on screen). New game, same group. Play to win. The designer watches the group (see the observation guide) and screenshots the Results screen at the end.

### Part 6: talk + forms

Ask first, open questions, and write down quotes:

1. "What was your overall feel?"
2. "What stood out, good or bad?"
3. "Would you play this again with us next week?"
4. "When did you feel most in danger? When did you feel safest?"
5. "Was there a moment you didn't understand what was happening?"

Then everyone fills in the two forms below.

## Observation guide (designer, during runs A and B)

You're playing too, so keep it light: a word in the chat or a voice memo at each build phase is enough. Watch for these:

| Signal | Looks like | Note down |
| --- | --- | --- |
| Confusion | stops moving, walks into a wall, asks "what's that?" | wave, place, object |
| Frustration | sighs, "that's unfair", "I didn't see it" | the cause, e.g. "fire hurt me from outside" |
| Engagement | shouts, callouts like "behind you!", "one more" | what was happening |
| Boredom | looks away, idles in the build phase | which wave or phase |
| Cover | someone shoots into a car, or hides behind sandbags expecting them to stop bullets | which object |
| Money | "I can't afford anything" / "too much money" | wave |

Notes format: `wave · place · what happened · reaction`. Example: `W5 · by the bus · ran through the fire ring · "ow, didn't see it"`.

**When to step in:** only for a crash, a stuck screen, or someone genuinely upset. Otherwise let people struggle and write it down.

## Forms (one per player)

Copy the block and fill it in.

```
Player:
Phone + browser:
Mobile data or Wi-Fi + lag:

PART 1: CONTROLS. Rate 1 (bad) to 5 (great), plus one sentence:
- Move stick:
- Aim stick:
- Auto-fire:
- Aim assist (shots bending toward zombies):
- Swap button:
- Melee (Machete):
Waves reached: Pistol + Machete __  SMG + Hunting Rifle __
Changed anything in Tune? Paste "Copy values":

PART 5: THE RUN. Rate 1-5, plus one sentence:
- Fun overall:
- Difficulty (1 too easy, 3 right, 5 too hard):
- Money: could you buy what you wanted? (1 never, 3 mostly, 5 always)
- Shop on touch (opening, buying):
- Placing barricades and turrets with your thumb:
- Repairing:
- The Ready button between waves:
- Did the city getting worse (cars moving, police lines, fire) change how you played?
- Fire: could you tell where it hurts?
- Night and rain: too dark / right / too bright?
- Did the game ever stutter or freeze? When?
- Did a teammate or zombie ever jump or teleport?
- Did a bullet that clearly hit ever do nothing?

What was the best moment?
What was the worst moment?
One thing you'd change:
```

## Results

_(players' forms, chat pastes, Results screenshots and notes go here)_

### Readability answers

Fill in from the sheets. ✓ = right, ✗ = wrong or "don't know".

| # | Object | Stops bullets? | P1 what / bullets | P2 | P3 | P4 |
| --- | --- | --- | --- | --- | --- | --- |
| _see `milestone-1/readability-sheet.md` for the list and the answer key_ | | | | | | |

### Earnings

From the Results screenshots (the "earned" column):

| Run | Players | Waves survived | Earned per player | Median |
| --- | --- | --- | --- | --- |
| A | | | | |
| B | | | | |

Target for a full 5-wave run: **650–790 earned per player** (GDD share). Bots earned 529–625.

## Decision rules (agreed before the session)

| Check | Keep / go | Fix-first story |
| --- | --- | --- |
| **Earnings** (runs that reached "You held out!") | median earned ≥ 650 per player, or ≥ 600 and no one scored Money ≤ 2 | otherwise turn on the **wave bonus 15 × N** (balance change, no new story) |
| **Readability** | an object is right for ≥ 3 of 4 players (or all but one) | it's wrong for 2 or more players → a redraw story for those objects (the former 4.11 scope) |
| **Cover** | the "stops bullets?" answer is right for ≥ 3 of 4 | a "show what stops bullets" story |
| **Phone speed** | stress test avg ≥ 50 FPS and the worst second ≥ 30 on every phone; no stutter reported in wave 5 | a perf story (target the device and the stage) |
| **Network** | avg down ≤ 30 KB/s, reversed hits < 5 %, no reported teleports | a netcode story with the pasted numbers |
| **Controls** | every item averages ≥ 3 | tune (Tune values) or a controls story |
| **Fun** | Fun averages ≥ 3 and most say they'd play again | talk it through before Epic 5 (scope, not bugs) |
| **Crash / stuck** | none | always fix-first |

**Go** = no fix-first row (balance changes are fine). **Fix-first** = each failing row becomes a story (`gds-correct-course`), built and reviewed before Epic 5.

## Decisions (designer, after the session)

- Earnings: **keep / wave bonus 15 × N**: _
- Readability redraws: _
- Other fix-first stories: _
- **Epic 5: go / fix-first**: _

## Report (after the session)

```
## Milestone 1 playtest report: <date>

Players: _ · Runs: _ (held out: _) · Overall feel: positive / mixed / negative

Key findings (with evidence: a quote, a number, a note):
1.
2.
3.

| Issue | Severity (critical / major / minor) | Recommendation | Priority (P0-P3) |
| --- | --- | --- | --- |

Quotes:
> "" - Player _

Next steps:
1.
```

Severity: **critical** = a crash or can't continue; **major** = clearly hurts the fun or fairness; **minor** = noticed, doesn't matter much.
