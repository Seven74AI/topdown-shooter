# Draft stories: survivor customization

For the main session to add to Epic 7 with `gds-correct-course` once the designer accepts `proposal.md`. Written in the `epics.md` style. Numbers are the designer's decided values (proposal §10: O1–O5 as recommended, O6 no colour hint). Working ids C1–C5; suggested final ids **7.8–7.12** (after 7.7). Each story starts with the Epic 5 art method: code drawings, the designer picks, Meshy only as a reference.

Order: C1 → C2 → C3, then C4 and C5 in parallel (different files: C4 touches run-end stats, C5 touches the wave/pickup loop).

---

### Story 7.8 (C1): Survivor parts in game code

As a player,
I want my survivor to be built from parts I can swap,
So that customization is possible without new image files.

**Acceptance Criteria:**

**Given** the art pick
**When** the story starts
**Then** the designer picks part looks from a code-drawing page (starting point: `docs/ideas/customization/avatar-editor.html`) before any part is built, and every part passes the "no gameplay signal" check (no armor plates, red-cross bags, shoulder lights, zombie skin or Runner shirts)

**Given** `drawSurvivor` in `apps/client/src/render/city/spriteArt.ts`
**When** it is split into part functions (top, headgear, hair, backpack, accent, skin)
**Then** the default look draws exactly today's survivor (pixel test against the current frame), and the held gun stays its own layer under the arms (Story 5.3 convention)

**Given** `packages/shared` `cosmetics.json`
**When** it is read
**Then** it lists 55 parts (35 starter, 10 milestone, 10 loot; proposal §3, §6), each with id, slot, colour inputs (none / top / hair / accent) and unlock rule (`starter`, `milestone:<id>`, `loot`), and no gameplay numbers

**Given** any chosen colour
**When** a part is drawn for the game
**Then** it is night-muted the same way as the `CHAR` colours (darker and slightly desaturated, more per decay stage), and the editor can show both versions

**Given** every part
**When** drawn at 35 px per metre (0.4 m body radius)
**Then** each non-"none" part changes at least 40 px² or the outline compared with "none" (automated pixel-count test)

### Story 7.9 (C2): My look in the game

As a player,
I want my friends to see the survivor I made,
So that I can find myself and they can recognise me.

**Acceptance Criteria:**

**Given** a join (Story 2.3)
**When** the client sends its join options
**Then** it includes the look code (≤ 96 characters, `v1|…` format) from the player's progress; the server checks each part exists and is owned by the account, replaces any bad part with the default, and **never refuses a join because of a look**

**Given** the room state
**When** a player joins
**Then** their look is one string field set once; it costs nothing per tick

**Given** a player's look
**When** the Game scene creates their survivor
**Then** the body is drawn once into a per-player canvas texture (≤ 4 per run, ≤ ~2 ms total on the Honor 10), the gun image is drawn under it, and the downed view uses the same body
**And** the slot ring, name and edge arrows keep the slot colour (Story 2.9)

**Given** the lobby
**When** a player is in a slot
**Then** their slot card shows their survivor (close-up drawing); identical looks are allowed

**Given** `?stress=150`
**When** 4 custom survivors are on screen
**Then** phone FPS matches the 4.10 numbers (the floor)

### Story 7.10 (C3): Survivor editor

As a player,
I want to make my survivor in under 30 seconds,
So that customizing is fun, not a chore.

**Acceptance Criteria:**

**Given** the start screen
**When** I tap "Survivor" (or my own card in the lobby)
**Then** a Preact screen opens with tabs Top / Head / Hair / Pack / Accent / Skin, a big rotating preview, and a **game-size preview** (35 px per metre on wet asphalt, slot ring, a few zombies and teammates around)

**Given** the tabs
**When** I pick a part or a colour
**Then** both previews update at once; colours use a free picker; the top colour shows the night-muted in-game swatch next to it

**Given** any colour, even one close to a slot ring colour or Runner red
**When** I pick it
**Then** it is accepted with no warning (designer decision O6)

**Given** a locked part
**When** it shows
**Then** a milestone item shows a lock and how to get it ("Extract from Downtown once"); a loot item shows only a silhouette and "Found during waves"; neither shows a price

**Given** I tap Random
**When** it runs
**Then** it picks only parts I own and random colours

**Given** I tap Done
**When** the server saves it
**Then** the look is written to my `progress` row (new `look` field, this story's migration) and cached on the device (try/catch); it is used from my next join

### Story 7.11 (C4): Milestone items

As a player,
I want to earn special items by doing something memorable,
So that my survivor shows what I've done.

**Acceptance Criteria:**

**Given** this story's migration
**When** it runs
**Then** `progress` gets `cosmetics` (owned item ids) and `stats` (lifetime counters: revives, kills, barricades built, runs played)

**Given** a run ends (Story 7.2's transaction)
**When** Supplies are banked
**Then** the same transaction updates the counters and grants every milestone reached (M1–M10, proposal §6); each is granted once

**Given** a new milestone item
**When** the Results screen shows
**Then** it shows "New item: Riot helmet (first extraction)" with a close-up drawing

**Given** the milestone rules
**When** Vitest runs
**Then** tests cover each milestone, no double grant, wipe and quit runs, and a failed write retried once (7.2 rule)

### Story 7.12 (C5): Surprise loot bag

As a player,
I want a rare bag to drop during a wave,
So that some runs end with a surprise.

**Acceptance Criteria:**

**Given** a run starts
**When** the `loot` seed stream is read (Story 4.4)
**Then** with chance `loot.runChance` = 0.2 (balance JSON) the run has one bag, at a chosen wave 3–10 and kill index in that wave; the rate doesn't depend on zombie or player count; solo runs too; endless adds none

**Given** that kill
**When** the zombie dies
**Then** a bag appears where it died, visible to all (glint, atlased, Dead City look) for 400 ticks (20 s), then disappears

**Given** a living player
**When** their centre comes within 0.6 m of the bag
**Then** the server gives the bag to them (first by tick order; ties to the lower slot); everyone sees a short "Bag found!" cue; downed or out players can't pick it up

**Given** the bag is picked up
**When** the item is chosen
**Then** it is a random loot item the player doesn't own; if they own all 10, they get "Collector" on Results and no item

**Given** the run ends (extract, wipe or quit)
**When** Results show
**Then** the finder sees "Found in wave N: <item>" and the item is banked in Story 7.2's transaction, even after a wipe or a quit

**Given** Epic 8's snapshot rule
**When** a run is saved or a player rejoins
**Then** the bag (position, ticks left) and a pending found item are in the snapshot (round-trip test)

**Given** the loot rules
**When** Vitest runs
**Then** a seeded sim over 1,000 run seeds gives 20 % ± 3 % runs with a bag, every bag at waves 3–10, the same seed gives the same bag, and the bag never spawns inside a solid

---

## Parked (not for now)

- **Weapon finishes** (wood, tape-wrapped, olive, rust) for every gun's "held" and "icon" views. After C2.
- **Gear shown on the body** (armor vest, revive-kit pouch) so teammates can read who has what. A readability idea for Epic 5/6, separate from customization.
- **Player level system with stats** (designer, D2). Its own idea and forge session; it would touch Story 7.5 Training.
