# Epic 6: revised story texts (6.1–6.12)

Drop-in replacements for the Epic 6 section of `_bmad-output/planning-artifacts/epics.md`, for the main session to apply with `gds-correct-course`. Numbers and reasons: `proposal.md` (designer decisions D1–D7, 2026-11-23). What changed from the current text is listed under each story ("Changed:"); delete those lines when applying.

**Also change outside Epic 6** (same correct-course pass): GDD "1–2 events per run" → "2 events per run"; GDD endless "+40 per wave" → "+40 per wave up to 600, then +6 % zombie HP per wave"; GDD supply-drop list gains the Gas torch; Story 5.10's Floodlight note gains "6 m light radius in blackout waves (Epic 6)".

---

## Epic 6: The full run: decay, boss, events, endless

A team plays the full 10 waves from Evening to the Behemoth through Ruins and Collapse (blackout, fog), meets two special events, votes to extract or stay, and can go endless.

### Story 6.1: The full 10-wave curve

As a team,
I want the run to last 10 waves with the full zombie mix,
So that a run builds to a real climax.

**Acceptance Criteria:**

**Given** `waves.json`
**When** a run is played with 4 players
**Then** wave sizes are N × 40 (W10 = 400), at most 150 alive, × 0.4 / 0.6 / 0.8 / 1.0 by player count (FR28)
**And** waves 7–10 use this mix (walker / runner / crawler / spitter / bloater): W7 38/22/15/10/15, W8 35/24/15/11/15, W9 40/18/17/10/15, W10 38/22/15/10/15, with 2 fixed Brutes in each of waves 7–10 (not scaled by player count) (FR29)

**Given** the temporary 6-wave ending from Epic 5
**When** this story is done
**Then** it is removed; until Story 6.11 exists, clearing wave 10 shows the Results screen

**Given** a full 10-wave run with 4 bots
**When** the economy is logged
**Then** each player's earnings are compared with the 2,500–3,000 target and the result is written to the test output, and the sim asserts that all 10 waves were played

Changed: exact W7–W10 mix and Brute counts; the sim asserts waves really ran.

### Story 6.2: Ruins

As a player,
I want rubble to close an alley and new holes to open in the walls,
So that the map squeezes us as the city breaks.

**Acceptance Criteria:**

**Given** the build phase before wave 7
**When** stage 4 is applied
**Then** rubble closes one of alleys 1–3 (a decay variant picked by the `decay` stream), 3 rubble piles (≈ 2 × 1.5 m) appear in the streets as hard cover (they stop bullets and bodies), and 2 breach spawn points with `minStage: 4` open in building walls facing the intersection (FR62)
**And** cells covered by rubble refuse building placement ("Can't build here"), and buildings already there are destroyed with the usual 50 % refund (FR53)
**And** the "no area is ever enclosed" and spawn-clearance tests pass on every stage × variant combination

**Given** stage 4
**When** it plays
**Then** each streetlight drops out for 0.15–0.6 s every 4–10 s (seeded per lamp), shop glow is at 30 %, and the wind and falling-debris placeholder ambience plays (debris is sound and dust only, no damage: designer, D4)

Changed: which alley and how (decay variant), 3 piles as hard cover, 2 breaches, flicker numbers, debris has no damage.

### Story 6.3: Blackout lighting

As a player,
I want blackout waves where only flashlights, floodlights, fires and muzzle flashes light the dark,
So that light becomes something we fight for.

**Acceptance Criteria:**

**Given** the server's light state
**When** the blackout flag is on
**Then** the client draws a half-resolution darkness texture leaving unlit ground at 10 % light, and cuts out: each player's flashlight cone along their aim (60°, 8 m; Tactical flashlight 80°, 12 m), a 1.6 m glow round every survivor, floodlights (6 m radius in blackout: designer, D5), fire zones (4 m) and muzzle flashes (3 m for 100 ms) (FR64)
**And** teammates (with rings), zombie eyes within 14 m, event markers and anything Stories 6.5–6.10 mark "above the darkness" are drawn above it

**Given** the blackout flag is off
**When** the game renders
**Then** no darkness texture is drawn (no cost)

**Given** this story is done
**When** the shop is built
**Then** the Floodlight and Tactical flashlight are in the shop from wave 1 (balance flag from Stories 5.10 and 5.11)

**Given** quality settings
**When** a player looks for a way to turn darkness off
**Then** there is none: blackout darkness is gameplay (FR87)

**Given** the dev cheat "force blackout"
**When** used with 150 zombies in view on the reference phones
**Then** FPS is recorded in `docs/perf/epic-6-blackout.md`

Changed: ambient level, personal glow, light sizes, Floodlight 6 m, what draws above, shop from wave 1.

### Story 6.4: Collapse

As a player,
I want the power to die, fog to roll in, and the last two waves to be fought in the dark,
So that the run hits its tension peak.

**Acceptance Criteria:**

**Given** the build phase before wave 9
**When** stage 5 is applied
**Then** the power is out (streetlights and shop glow removed from the light state) and waves 9 and 10 are blackout waves (FR63)

**Given** a wave at stage 5
**When** a zombie is more than 10 m from the local player
**Then** it is hidden on that player's screen unless it is inside that player's flashlight beam (which sees to its full length); fog vision cannot be turned off (only its visual quality can)

**Given** a build phase at stage 5
**When** it plays
**Then** the darkness is at half strength and fog opens to 14 m (planning is not done blind)

**Given** stage 5
**When** it plays
**Then** the near-silence placeholder ambience plays (growls and rain)

Changed: wave 10 is a blackout wave by flag (not a separate rule), flashlights see through fog, half-dark build phases.

### Story 6.5: The Behemoth arrives

As a team,
I want a huge boss to crash into wave 10 while the horde is still coming,
So that the run ends with a fight we'll talk about.

**Acceptance Criteria:**

**Given** wave 10
**When** half of the wave's zombies have spawned
**Then** a 4 s warning plays (rumble, red edge marker, "Something big is coming"), then the Behemoth walks in from the street edge farthest from the team and at least 14 m from every player: radius 2 m, 1.3 m/s, immune to knockback, 6,000 HP × 0.4 / 0.6 / 0.8 / 1.0 by player count (FR33, FR31)
**And** while it lives at most 110 zombies are alive (150 again after it dies), a boss bar with a 50 % notch shows at the top of the screen, and placeholder boss music starts

**Given** the Behemoth
**When** it picks a target
**Then** it chases the standing player who dealt it the most damage in the last 5 s (ties: nearest), switches at most once every 4 s, never targets a downed player, and the target shows a red skull to everyone

**Given** a standing player within 4.0 m of its centre and the slam ready
**When** it slams
**Then** it raises its arms for 1.2 s while a red hatched ring of 4.5 m from its centre fills, then players whose centre is inside 4.25 m (0.25 m edge grace) take 40 damage and are pushed 2 m out; 0.8 s recovery, cooldown 4 s (FR34, FR84)

**Given** any boss attack
**When** it is telegraphed
**Then** the danger zone is fixed at the telegraph's start, the start tick is sent reliably and the client draws the fill from that tick, hits use the player's newest server position (no rewind), only one boss attack runs at a time, and a gap of 2.8 / 2.2 / 1.8 / 1.5 s (1–4 players) follows each recovery
**And** telegraphs draw above zombies, darkness and fog (with a hole for the boss's body), and an edge marker with the next attack's icon shows when the boss is off screen

**Given** Vitest
**When** it runs
**Then** tests cover HP scaling, slam timing and radius, edge grace (just inside hit, just outside missed), the target rule, the alive cap and one-attack-at-a-time

Changed: entry warning and side, alive cap 110, target rule, slam trigger/radius/grace/push, the fairness rules (fixed zones, tick-keyed fill, no rewind, gap per player count), readability.

### Story 6.6: Behemoth charge and throw

As a team,
I want the Behemoth to charge through our defenses and throw wrecks at us,
So that we have to keep moving, and can bait it into a wall.

**Acceptance Criteria:**

**Given** its target 5–12 m away with at least 4 m of clear lane
**When** the Behemoth charges
**Then** it lowers its head for 1.0 s while a lane as wide as its body plus a survivor (4.8 m) is drawn to where it will stop, then rushes up to 10 m at 12 m/s; players it touches (0.25 m grace) take 30 damage and are shoved 2.5 m sideways, once per charge; every building in its path is destroyed; zombies in its path are trampled (FR34, FR53)
**And** the stop point is found at telegraph start by sweeping its body against static cover; if the lane ends on hard cover (car, bus, building, rubble, map edge) the lane shows a CRASH mark

**Given** a charge that ends on hard cover
**When** it crashes
**Then** it is stunned for 2 s and takes × 1.5 damage meanwhile (designer, D1); otherwise 1.0 s recovery; cooldown 7 s

**Given** a standing player more than 8 m away and the throw ready
**When** the Behemoth throws
**Then** it aims at the farthest such player's position at the telegraph start, lifts a chunk for 1 s (from the nearest rubble pile or burnt car within 6 m, else the road; visual only) while a 3 m ring shows at the landing spot, and the chunk flies 0.8 s: 35 damage within 3 m (0.25 m grace), a crater decal, no collision change; 0.6 s recovery, cooldown 6 s

**Given** its attacks
**When** the gap ends
**Then** it picks slam if anyone is close, else charge if the target is in range with a clear lane, else throw, else it walks; cooldowns from `boss.json`

Changed: lane width and drawn stop, speed, shove, crash stun (new), throw aims at the farthest player with no lead, throws never change collision, the pick order.

### Story 6.7: Enrage and the end of the Behemoth

As a team,
I want the Behemoth to get angrier when it's hurt, and its death to call the helicopter,
So that the last half of the fight is the hardest.

**Acceptance Criteria:**

**Given** the Behemoth at 50 % HP or less and not mid-attack
**When** it enrages
**Then** it roars for 1.5 s standing still (players within 5 m pushed 1.5 m, no damage), then moves 30 % faster, its cooldowns and gaps are 30 % shorter, and a Crawler drops off its back every 8 / 6 / 5 / 4 s (1–4 players) (FR35)
**And** telegraph lengths do not change (test)

**Given** the Behemoth dies
**When** `boss.killed` is emitted
**Then** every player gets 150, an "Evac inbound" banner shows, the alive cap returns to 150, and the remaining wave 10 zombies must still be cleared (the last-5 rule applies) before the helicopter lands (FR36)

Changed: roar, Crawler interval per player count, telegraphs unchanged, kill pay, cap back to 150.

### Story 6.8: Special events, car alarm and stampede

As a team,
I want surprises in the middle of the run,
So that no two runs play the same.

**Acceptance Criteria:**

**Given** a new run
**When** events are scheduled from the `events` seed stream
**Then** exactly 2 different events are placed in 2 different waves of 3–8, never wave 5, never in back-to-back waves (designer, D2), respecting each event's gate (gas leak: stage 2+; car alarm: a parked car still parked; power failure: waves 6–8) (FR37)
**And** each event starts at a random moment between 20 % and 60 % of its wave's spawns, with a banner, a sound and a map marker drawn above the darkness

**Given** the car alarm
**When** it triggers
**Then** a parked car blinks "armed" for 20 s; when a player shoots it, or when the 20 s run out, its alarm sounds for 15 s and every zombie within 15 m heads to that car (FR38, designer D7)

**Given** the stampede
**When** it triggers
**Then** after a 3 s warning (rumble, dust at a map edge, arrows across the lane) 12 / 18 / 24 / 30 Runners (1–4 players, outside the wave count) cross in a straight 8 m lane at 5 m/s for 10 s without chasing, dealing 8 damage on contact; up to 30 may exceed the alive cap and normal spawns pause meanwhile (FR41)
**And** stampede Runners still on the map after the 10 s become normal Runners that count toward zombies remaining and the last-5 rule

**Given** a framework for events
**When** a new event is added
**Then** it is one module in `shared/events` with its data in `events.json`

Changed: always 2, waves 3–8 not back-to-back, gates, the armed car lever, stampede numbers and cap rule.

### Story 6.9: Gas leak and supply drop

As a team,
I want a gas tank that explodes and a supply crate worth fighting for,
So that we have to choose between risk and reward.

**Acceptance Criteria:**

**Given** the gas leak
**When** it triggers
**Then** the gas station tank hisses for 10 s with a visible 6 m ring, then explodes: zombies within 6 m die, players within 6 m take 60 damage (friendly fire, as with Bloaters), buildings take 150 (FR39)
**And** after the first 3 s any player can shoot the tank to set it off at once (designer, D7); kills credit whoever set it off

**Given** the supply drop
**When** it triggers
**Then** a smoke flare marks a reachable spot at least 12 m from the team's centre (from the `events` stream), and 5 s later a crate lands there with a marker for all players showing the weapon inside (FR40, designer D7)
**And** the first player to stand on it for 1 s gets that weapon at level II (Flamethrower, Gas torch, Grenade Launcher, Chainsaw or Assault Rifle) in an empty slot, otherwise in place of the active weapon (a warning shows before the 1 s completes); the crate stays until the wave ends

Changed: shoot the tank early, building damage, kill credit, flare warning, crate shows its weapon, Gas torch added, empty-slot rule.

### Story 6.10: Power failure and survivor

As a team,
I want the lights to fail without warning and a survivor to need our help,
So that the run keeps asking for teamwork.

**Acceptance Criteria:**

**Given** the power failure (waves 6–8 only)
**When** it triggers
**Then** the streetlights flicker for 2 s, then the current wave becomes a blackout wave until it ends (FR42)

**Given** the survivor
**When** it triggers
**Then** an NPC with 50 HP appears at least 15 m from the team with a marker, and a safe-point marker appears at least 20 m from it; it follows the nearest player within 3 m at 4.0 m/s, crouches when nobody is near, and zombies target it like a player; both markers and the NPC draw above the darkness (FR43)

**Given** the survivor reaches the safe point before the wave ends
**When** escorted
**Then** every player gets +100 currency; if it dies or the wave ends first, nobody gets the bonus

Changed: power failure wave window and flicker warning, survivor distances, speed, crouch, wave-end rule.

### Story 6.11: Evacuation vote

As a team,
I want to vote to get out or stay after beating the Behemoth,
So that we choose together how much to risk.

**Acceptance Criteria:**

**Given** wave 10 cleared after the Behemoth's death
**When** the helicopter lands on the intersection (6 m pad, searchlight)
**Then** every player, downed and out players included, sees Extract and Stay buttons and a 15 s countdown, and every vote shows live in its slot colour; nothing else moves during the vote (FR66)

**Given** the votes
**When** the countdown ends or everyone has voted
**Then** the majority wins; a tie or no votes means Extract

**Given** Extract
**When** chosen
**Then** the helicopter lifts off, the first light of dawn rises over the district for 4 s (designer, 2026-11-22), then the run is won and the Results screen shows "Extracted" with wave reached, kills and money per player (FR67)

**Given** Stay
**When** chosen
**Then** a normal 30 s build phase for wave 11 starts

Changed: landing spot, who votes, live votes, the pause during the vote, dawn length, what Stay does.

### Story 6.12: Endless mode

As a team,
I want to keep fighting in the collapsed city after wave 10,
So that we can push our luck for more rewards.

**Acceptance Criteria:**

**Given** Stay
**When** wave 11 and later run
**Then** each wave has 40 more zombies than the last at 4 players until 600 (wave 15), then stays at 600 and zombies get +6 % HP per wave after 15; still max 150 alive; × the player-count table (FR68, designer D3)
**And** each wave has 1 more Brute than the last (wave 11 = 3), at most 6 alive; blackout on odd waves (11, 13, 15…); the map stays at stage 5 with fog

**Given** every 5th wave (15, 20, 25…)
**When** it runs
**Then** a Behemoth appears in it with +25 % HP per earlier endless Behemoth (× 1.25, × 1.5…), with the same telegraphs, and after that wave is cleared a new evacuation vote opens

**Given** an even endless wave without a Behemoth (12, 14, 16, 18, 22…)
**When** it is scheduled
**Then** one event that fits runs in it (designer, D3)

**Given** a team wipe in endless before extracting
**When** the run ends
**Then** the Results screen shows "Lost in the city" and the run records that rewards earned after wave 10 are lost (Supplies use this in Epic 7)

Changed: size cap at 600 then HP growth, Brute cap, endless Behemoth HP growth, events on even waves.
