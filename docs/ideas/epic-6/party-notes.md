# Epic 6 roundtable: party notes

Party mode (`bmad-party-mode`, session mode), 2026-11-23, on branch `claude/idea-epic-6`. Idea work only: no game code, no planning files changed. What came out of it is in `proposal.md`; the playable boss mock is `behemoth-prototype.html`.

**In the room**

- 🎲 **Samus Shepard**, game designer: pillars first, wants every system to create a team decision.
- 🏛️ **Cloud Dragonborn**, game architect: ticks, bytes, the 20 Hz server, "what does the wire carry".
- 🕹️ **Link Freeman**, game developer: has built 4.5–5.7, knows where the code bites, and counts stories.
- 📱 **Mo**, player voice: speaks for the four friends. Hosts on a 2019 Pixel over 4G, the others are on an iPhone 12, an old Galaxy and a tablet. Discord voice on, thumbs covering the bottom corners, not reading patch notes.

**Facts on the table before we started** (checked in the code, 2026-11-23):

- The view is **24 × 13.5 m** (`camera.ts`). A 16:9 phone shows ~35 CSS px per metre. The map is 48 × 32 m. The prototype draws at 48 px/m, so 24 × 13.5 m is exactly 1152 × 648 px.
- Survivors: 100 HP, 4.5 m/s, radius 0.4 m. Remote players and zombies show 100–150 ms behind; your own survivor is predicted; the server rewinds zombies for **your shots**, not for zombie hits on you.
- The Brute (5.7): 120 HP, 0.6 m radius, 0.5 s wind-up, dodge by stepping 0.3 m back, 35 damage, 1.5 m knockback, gap reach 1.8 m, 3× damage to buildings, wide-body pathing (flow field inflated by 0.25 m). 1 Brute in waves 5 and 6.
- Decay: stages 1–3 built (`decay.json › stageByWave` already lists 10 waves: 1,1,2,2,3,3,4,4,5,5). Fire zones: 2 m radius, 10 dmg/s, last 2 waves, zombies path around them. A `gas_leak_zone` already sits at the gas station (minStage 2). Spawn points carry `minStage`.
- Waves today: `runWaves` 5 (Epic 5 makes it 6), N × 40, 150 alive, ×0.4 / 0.6 / 0.8 / 1.0 by player count.
- Sustained damage per second with reloads (base weapons): Pistol ~12, SMG ~32, Hunting Rifle ~26, Shotgun ~26, Assault Rifle ~37, Chainsaw 60 (melee). Upgrades are damage only, up to ×1.75 at IV.
- Epic 5 decided the Floodlight is a 4 m radius glow, max 8, and that it and the Tactical flashlight stay hidden from the shop until the blackout exists.

---

## Round 1: what is the Behemoth *for*?

🎲 **Samus:** Before numbers. The Brute already exists and it's a good little boss: wind-up, step back, done. If the Behemoth is a big Brute with 50 times the HP, we've made a sponge. It needs to ask the team three different questions. Slam asks "are you too close?", charge asks "are you in a line with it?", throw asks "are you standing still?". Three distances, three answers.

📱 **Mo:** Can I say what actually happens with us? Two of us hang back with rifles, Jess runs in with the chainsaw, and Kai is downed somewhere asking for help. If the boss just chases the closest person, Jess dies every run and the rifle guys never feel it.

🕹️ **Link:** That's the target pick. Nearest is one line of code. Anything smarter is a story of its own.

🎲 **Samus:** Then it's worth a story. Here's my pitch: it chases **whoever hurt it most in the last 5 seconds**. The rifle guys deal the damage, so it turns on them, and the chainsaw gets a free back. Now the team can *play* with it: someone baits, someone punishes.

🏛️ **Cloud:** A rolling 5 s damage window per player is four floats on the server. Fine. But it must not flip every tick, or it'll jitter between two players at 150 ms and look broken. **It changes target at most once every 4 s**, and it never picks a downed player.

📱 **Mo:** And tell me it picked me. A little red skull over my head, a buzz on the phone. Otherwise I find out by dying.

🎲 **Samus:** The skull, yes. And the throw goes the other way: it throws at the *farthest* player over 8 m. Hiding at the back is never safe either.

**Where the room landed:** target = most damage in the last 5 s, nearest breaks ties, switch at most every 4 s, never a downed player, a marker over the target. Slam for anyone close, charge at the target at 5–12 m, throw at the farthest player beyond 8 m.

## Round 2: telegraphs at 150 ms (the fight)

🏛️ **Cloud:** Let me do the lag math, because nobody else will. The server starts a slam at tick t. Mo's phone sees it about 75 ms later (one way) plus ~100 ms of interpolation for remote things. So Mo sees the arms go up **~175 ms late**. Mo moves, but his input takes another 75 ms to reach the server, and the server judges where Mo *is on the server*. So of a 1.2 s telegraph Mo really has **1.2 − 0.25 = 0.95 s**. Take a human reaction of 0.25 s and he has 0.7 s of running: 3.1 m at full speed.

🕹️ **Link:** And slowed by a Crawler bite (−30 %) that's 2.2 m. With the chainsaw on (−20 %), stacked, ~1.8 m.

🎲 **Samus:** So the slam radius has to be escapable in under 1.8 m from melee range. Body radius 2 m, chainsaw reach 1.5 m, so Jess stands about 3.3 m from its centre. A 4 m slam from the centre is 0.7 m of running. Too easy. A slam 4 m *beyond the body*, 6 m from centre, is 2.7 m. Unfair when bitten.

📱 **Mo:** I don't care about fair-on-paper. I care that when I die I can say "yeah, my bad". Every time.

🎲 **Samus:** Then **4.5 m from the centre**: 2.5 m beyond its body. From melee range, ~1.6 m to escape. Escapable bitten, punishing if you're greedy.

🏛️ **Cloud:** Three more rules, or the lag eats us anyway:
1. **The danger zone is locked when the telegraph starts.** The slam centre, the charge lane, the throw's landing spot: fixed at frame one. The client draws exactly where it will hit; nobody dodges a moving target.
2. **The client draws the telegraph from the server's start tick**, not from when the message arrived. If the event arrives 175 ms late, the fill is already 15 % done. The ring never lies about the time left.
3. **Edge grace 0.25 m:** the server hits only if your centre is 0.25 m inside the drawn edge. Close calls go to the player.

🕹️ **Link:** No rewind for boss hits on players? 2.12 rewinds zombies for shots.

🏛️ **Cloud:** No rewind the other way. Rewinding the boss to what you saw would let a laggy phone dodge late. The grace is the gift, and it's the same for everyone.

🎲 **Samus:** And **enrage never shortens a telegraph.** It makes the cooldowns shorter and the boss faster. The warning is a promise; we don't break it at 50 %.

📱 **Mo:** And never two boss attacks at once. If a throw lands while I'm in a slam ring, I'm not learning anything.

🏛️ **Cloud:** One attack at a time, then a recovery, then a gap. Easy to enforce: it's a state machine with one slot.

**Where the room landed:** slam 1.2 s / 4.5 m from centre / 40 dmg; charge 1.0 s with the lane locked; throw 1.0 s lift + 0.8 s flight, landing spot locked at the start; 0.25 m edge grace; telegraph progress keyed to the server tick; no rewind for boss hits; telegraphs fixed through enrage; never two attacks overlapping.

## Round 3: the charge and the bus

🕹️ **Link:** The charge "destroys every building in its path". Buildings are barricades and turrets, fine. What happens when it hits the bus?

🎲 **Samus:** That's the best moment in the fight and we haven't designed it yet. It **crashes**. It hits a car, the bus, a building or a rubble pile and it's **stunned for 2 s and takes 50 % more damage**. Now the team has a plan: stand in front of the bus, wait for the head to drop, step aside, and everyone unloads.

📱 **Mo:** Oh that's the clip we'd send in the group chat. "Kai baited it into the bus." Yes.

🏛️ **Cloud:** And it's cheap: a charge is a straight line I can sweep against the static cover once at telegraph start. I know at frame one where it stops. That also means the lane we draw can **stop at the car**. The player sees the crash coming.

🕹️ **Link:** Speed? The rush is 10 m. At 12 m/s that's 0.83 s. Lane width is its body, 4 m. Someone standing on the line needs 2.4 m sideways minus grace, ~2.15 m, and they have 1.0 s minus lag minus reaction, ~0.5 s. That's 2.25 m. Tight, but it's the attack that says "don't stand in its line".

🎲 **Samus:** Keep it tight. The minimum charge range is 5 m, so you also get the travel time. And getting hit shoves you **2.5 m to the side**, out of the lane, so one charge can't hit you twice.

**Where the room landed:** charge 12 m/s, 10 m, 4 m lane, 30 dmg + 2.5 m side shove, once per player per charge; destroys buildings; stops at hard cover → **crash: stunned 2 s, takes ×1.5 damage**; the drawn lane stops where it will crash.

## Round 4: the throw, and who is allowed to change the map

🎲 **Samus:** The throw picks up a wreck or rubble. I love that the decayed map is its ammo. Burnt-out cars from stage 3, rubble from stage 4.

🏛️ **Cloud:** I'll stop you there. If the throw *removes* a car, the flow field changes mid-boss, the spawn-safety rules change, and the client mirror has to know. All for a 1-second animation. **The throw never changes collision.** It lifts a chunk off the nearest pile or wreck (visual only), or tears up the road if nothing is within 6 m. The impact leaves a crater decal, not a wall.

🎲 **Samus:** ...Fine. I'll take a crater over a refactor. As long as it *looks* like it ripped the car's door off.

🕹️ **Link:** Throw at the landing spot locked at telegraph start, no lead on the target: so it only punishes standing still. 3 m radius, 35 damage, 1.8 s total warning. Anyone who is moving walks out without thinking.

📱 **Mo:** Which is the guy behind the barricades reloading his rifle. Good. That guy is me.

**Where the room landed:** throw targets the farthest player beyond 8 m, ring at the landing spot from the start, 1.0 s lift + 0.8 s flight, 3 m, 35 dmg, no knockback. Collision never changes; ammo is visual.

## Round 5: phases, enrage, and the horde

🎲 **Samus:** Two phases is right for a 10-wave friend run. Phase 1 teaches the three attacks. At 50 % it **roars for 1.5 s**: it stands still, pushes everyone within 5 m out by 1.5 m (no damage), the bar turns red. Then +30 % speed, cooldowns ×0.7, a Crawler off its back every 4 s.

🕹️ **Link:** A roar that stands still is a free 1.5 s of damage. Good, it's a reward for getting it to half.

📱 **Mo:** How much is going on at once, though? Wave 10 is the biggest horde *and* the boss. On my Pixel at 150 zombies it's already a soup.

🏛️ **Cloud:** And the GDD's frame-rate test is wave 9 blackout with 150 in view. Wave 10 adds a 4 m boss with telegraph decals. I'd drop the **alive cap to 110 while the Behemoth lives**. The wave still has its ~400; they just queue longer.

🎲 **Samus:** I'll argue the opposite for a second: the horde *is* the pillar. Horde chaos. If it's just the boss, it's a different game.

📱 **Mo:** 110 is still a horde, Samus. On my screen I can't tell 110 from 150. I *can* tell when I lose the slam ring under bodies.

🎲 **Samus:** ...Then the telegraph decals draw **above zombies**. And 110. I'll test it in the prototype.

**HP and player count.** 🕹️ **Link:** The GDD says 6,000 × 0.6 / 0.8 / 1.0, and solo 0.4. Four players with mid-level guns, half their fire on the horde: ~110 DPS on the boss, ~55 s. Two players: 3,600 HP at ~55 DPS, 65 s. Solo: 2,400 at ~28, 85 s, alone with the slam.

🎲 **Samus:** Small teams also get attacked more often per person. So scale the **gap between attacks**: 1.5 s at four players, 1.8 s at three, 2.2 s at two, 2.8 s solo. And Crawler drops 4 / 5 / 6 / 8 s.

**Where the room landed:** 2 phases, a 1.5 s roar at 50 %; enraged +30 % speed, cooldowns and gaps ×0.7, Crawler every 4 s at four players; alive cap 110 while it lives; boss decals above zombies; HP 2,400 / 3,600 / 4,800 / 6,000; attack gap and Crawler interval scaled by player count. Open: **do we want a back weak spot** for flanking (Samus yes, Link "later")?

## Round 6: readable on a 13.5 m tall screen

📱 **Mo:** The screen is short. If it's 7 m above me, it's off the screen and it throws at me.

🏛️ **Cloud:** View half-height is 6.75 m. Throw range starts at 8 m. So the throw is *usually* from off screen vertically. That's why the landing ring matters more than the pose: the ring is under *you*, so it's always on your screen.

🕹️ **Link:** And a boss edge marker: the teammate arrows (2.9) exist. A bigger red one with a skull, pulsing during a telegraph, and its colour says what is coming: ring icon, lane icon, rock icon.

🎲 **Samus:** HUD: boss bar top centre (thumbs are at the bottom), a notch at 50 %, the name. Banner "THE BEHEMOTH" for 2 s on arrival. Its entry: a 4 s rumble and the edge marker *before* it appears, from the street edge farthest from the team, at least 14 m from every player.

📱 **Mo:** Colours. Fire is orange, acid is green, Runners have red shirts. If the slam ring is orange I'll think it's a car fire.

🎲 **Samus:** Boss danger is **red with white hatching and a white edge**. Nothing else in the game uses hatching. It reads even for a colour-blind friend.

**Where the room landed:** ring always under you, boss edge marker with an attack icon, bar at the top with a 50 % notch, 4 s rumble entry, red-and-white hatched danger zones drawn above zombies, darkness and fog.

## Round 7: Ruins and Collapse

🎲 **Samus:** Stage 4 Ruins, waves 7–8. The map squeezes. Rubble closes **one of the three alleys** (picked by the decay stream), and **three rubble piles** land in the streets as hard cover: they stop bullets and bodies, no building on them. **Two breach spawn points** open in building walls facing the intersection, so zombies now come from the middle too.

🕹️ **Link:** All of that is the existing mutation system: `block`, `add` with `kind: rubble`, spawns with `minStage: 4`, variants for which alley. No new engine. Just map work and the "no area enclosed" test on every combination.

📱 **Mo:** Falling debris? The GDD says the ambience is wind and falling debris. Do things fall on us?

🎲 **Samus:** I'd love a shadow that grows and then a chunk lands: 1.5 s shadow, 1 m, 20 damage, near building edges only.

🕹️ **Link:** That's a new hazard type, a new telegraph, a new test set, in the stage that already has the most new map. And next to buildings is where people build. I'd hold it.

🎲 **Samus:** It's the one thing that makes Ruins *feel* like ruins...

🏛️ **Cloud:** Then it's an option for the designer, not a default. Light it up as sound and dust only, and see if the playtest asks for more.

**Stage 4 lights.** Streetlights **flicker**: each lamp drops out for 0.15–0.6 s every 4–10 s, the warning that the power is going. Shop glow down to 30 %.

**Stage 5 Collapse, waves 9–10.** Power out: streetlights and shop glow gone. Waves 9 and 10 are blackout waves. **Fog: zombies beyond 10 m from you are hidden.**

🏛️ **Cloud:** Note the geometry: the view is 24 × 13.5 m, so a 10 m fog circle only bites at the **left and right ends of a landscape screen**. Up and down you see 6.75 m anyway. Cheap to draw, and it makes the sides scary.

📱 **Mo:** What about the build phase in the dark? Placing a barricade blind is miserable.

🎲 **Samus:** Build phases at stage 5 are **half dark** ("the moon breaks through the clouds") and fog opens to 14 m. The fight is dark, the planning isn't.

**Where the room landed:** Ruins = 1 alley closed + 3 rubble piles + 2 breach spawns + flickering lamps; falling debris is an open option (default: ambience only). Collapse = power out, waves 9–10 dark, fog 10 m in waves, half-dark build phases with 14 m fog.

## Round 8: blackout lighting

🏛️ **Cloud:** One half-resolution darkness texture, filled black, then light shapes erased out of it: every player's flashlight cone, a small glow round each survivor, floodlights, fires, muzzle flashes. Pooled stamps, no allocation. Off when the blackout is off: zero cost.

🎲 **Samus:** How dark is dark? Pure black loses the map. I want the **buildings faintly there: 10 % of normal light**. Zombies in the dark are **eyes only**: two dots, visible to 14 m, or to the fog edge.

📱 **Mo:** I need to see what is biting me. If I aim the flashlight away and something is on me I can't see it.

🎲 **Samus:** A **1.6 m personal glow** round every survivor, always. The flashlight is 60°, 8 m, everyone has it free. The Tactical flashlight is 80°, 12 m. Muzzle flashes light 3 m for 100 ms, so an SMG strobes. Fires light 4 m.

🕹️ **Link:** The Floodlight. Epic 5 built a 4 m glow. In a blackout 4 m is barely more than your own 1.6 m glow plus your cone. It won't sell.

🎲 **Samus:** 6 m in a blackout. 12 m across. It's what you stand around.

🏛️ **Cloud:** Fog meets flashlight: inside a flashlight cone, the fog reveals out to the beam's length. That keeps the Tactical flashlight worth buying in stage 5 (12 m beats the 10 m fog).

**What always draws above the darkness and fog:** teammates (with rings), zombie eyes (within range), the boss's body outline and eyes, **every boss telegraph**, event markers, the supply crate, the survivor NPC.

**Where the room landed:** 10 % ambient, eyes to 14 m, 1.6 m personal glow, flashlight 60°/8 m, Tactical 80°/12 m, muzzle 3 m/100 ms, fire 4 m, **Floodlight 6 m in blackout** (changes the Epic 5 value), cones see through fog. Floodlight and Tactical flashlight go into the shop **from wave 1** once 6.3 lands (power failure can strike early).

## Round 9: the six events

🎲 **Samus:** Every event must be a **team decision**, not weather. Let me go through them.

**Car alarm.** 🎲 **Samus:** As written, an alarm goes off and zombies go to it. That's weather. Make it a tool: a parked car's lights **blink "armed" for 20 s**. Shoot it and the alarm runs 15 s, pulling every zombie within 15 m. Nobody shoots? It goes off by itself at 20 s.
📱 **Mo:** So we pull them onto the gas station and Molotov it. Yes.

**Stampede.** 🕹️ **Link:** 3 s warning: rumble, dust at a map edge, arrows across the lane. Then Runners in an **8 m wide lane** cross at 5 m/s for 10 s, not chasing, 8 damage on contact. 30 at four players (12 / 18 / 24 / 30). Whoever survives the crossing becomes a normal Runner in the wave count.
🏛️ **Cloud:** They're on top of the 150 cap. Allow **+30 above the cap** for the stampede only and pause normal spawns while it runs.

**Gas leak.** 🎲 **Samus:** The tank hisses 10 s with a 6 m ring, then explodes: zombies inside die, players take 60, buildings take 150. And **after 3 s anyone can shoot the tank** to set it off early. Lure, then pop.
📱 **Mo:** Friendly fire though. If Kai pops it while I'm in the ring...
🎲 **Samus:** Then that's the story you tell. Same rule as the Bloater: full damage to everyone.

**Supply drop.** 🎲 **Samus:** A smoke flare marks the spot 5 s before the crate lands, at least 12 m from the team's centre, always reachable. The crate **shows the weapon icon**, so the team decides who goes. Stand on it 1 s to take it, at level II: into your empty slot, else replacing your active weapon (the card warns).
🕹️ **Link:** The list in the story is old: Epic 5 now has the Gas torch too. Flamethrower, Gas torch, Grenade Launcher, Chainsaw, Assault Rifle.

**Power failure.** 🎲 **Samus:** Lamps flicker 2 s, then the current wave is a blackout to its end. **Waves 6–8 only**: wave 9 is already dark, and before 6 nobody has bought lights.
📱 **Mo:** Unless the flashlights were in the shop from the start.
🎲 **Samus:** They will be (round 8). Still 6–8: earlier it's just mean.

**Survivor.** 🕹️ **Link:** NPC, 50 HP, appears at least 15 m from the team; safe point at least 20 m from it. Follows the nearest player within 3 m at 4.0 m/s (a bit slower than you), crouches when nobody is near. Zombies target it like a player. Reach the safe point before the wave ends: **+100 to every player**. It dies or the wave ends: nothing.
📱 **Mo:** That one splits us. Two escort, two hold the barricades. That's the good kind of arguing on voice.

**Scheduling.** 🎲 **Samus:** "1 or 2 per run" sometimes gives 1. I'd always do **2**, in two different waves of 3–8, never 5, never back-to-back, never the same event twice. Each starts at a random point between 20 % and 60 % of its wave's spawns.
🕹️ **Link:** And the stage gates: gas leak needs the gas station zone (stage 2+, so wave 3+), car alarm needs a parked car still parked, power failure 6–8.

**Where the room landed:** every event gets a player lever (shoot the armed car, shoot the tank, see the crate's contents, escort or not). Numbers above. Open: **2 events always** vs "1 or 2".

## Round 10: the extract vote and endless

📱 **Mo:** The vote. We're on voice. We'll decide in 3 seconds. Then we'll argue for 12.

🎲 **Samus:** The helicopter lands on the intersection (a 6 m pad). Two big buttons, 15 s, **everyone sees every vote live in their slot colour**. Majority; tie or no vote = Extract. Downed and out players vote too: they earned it.

🕹️ **Link:** Extract: the helicopter lifts, 4 s of dawn over the district, then Results "Extracted". Stay: straight into a normal 30 s build phase for wave 11.

🏛️ **Cloud:** And nothing moves during the vote: no zombies, no timers but the vote. It's a pause that isn't a pause.

**Endless.** 🕹️ **Link:** "+40 per wave" with a 150 cap means wave 20 is 800 zombies. At our kill rates that's a 5-minute wave. People will quit from boredom before they die.

🎲 **Samus:** So size grows +40 to **600 (wave 15)**, then stops; after that each wave gives zombies **+6 % HP**. Brutes +1 per wave, at most 6 alive. Blackout on odd waves, fog always. A **Behemoth every 5th wave** with HP ×1.25 more each time (W15 ×1.25, W20 ×1.5…), and the vote after it's cleared.

📱 **Mo:** Events in endless? It gets samey without them.

🎲 **Samus:** One event on each even endless wave that has no Behemoth. Cheap: the framework exists by then.

**Where the room landed:** vote as above; endless size cap 600 then HP growth; Behemoth every 5th with growing HP; events in endless as an option.

---

## Questions the room put to the designer

1. Back weak spot on the Behemoth (×1.5 damage from behind) in v1, or only the crash stun?
2. Falling debris in Ruins: a real hazard, or ambience only?
3. Always 2 events per run, or 1–2 as the GDD says?
4. Floodlight 6 m in blackouts (changes the Epic 5 value of 4 m)?
5. Endless: size cap at 600 then HP growth, or +40 forever as the GDD says? Events in endless?
6. Alive cap 110 while the Behemoth lives, or keep 150?

The narrowing step (forge) put these to the designer; answers are in `proposal.md §0`.
