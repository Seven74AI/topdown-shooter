# Survivor customization: proposal

Idea work, 2026-11-23. Inputs: the roundtable (`party-notes.md`), then the designer's answers in the narrowing step (forge log in `forge/.memlog.md`). Playable mockup: `avatar-editor.html` in this folder. Draft stories: `draft-stories.md`. Nothing here changes game code or planning files. The main session adds the stories later with `gds-correct-course`.

## 1. What we're building, in one paragraph

Each player makes **their own survivor**: skin tone, hair, headgear, top, backpack, one accent, and **any colours they like**. They make it in a quick editor (30 seconds, Random button) that shows the survivor big and **at real game size in a crowd of zombies**. The look is **cosmetic only**. Most items are free from day one. Some are **milestone items** earned by doing something once, and some are **surprise loot** found during a wave, very rarely. It is saved with the player's progress, so it ships **with Epic 7 (accounts)**.

## 2. Decisions (designer, 2026-11-23)

| # | Decision | What it means |
| --- | --- | --- |
| D1 | **No bonuses on equipment.** Customization is the character's look only. | No stat items, no "kit" perks. Epic 5 gear (5.11) stays exactly as planned: bought per run, HUD icons. |
| D2 | A **player level system where the player puts stats** is a separate idea for later. | Out of scope here. It overlaps Epic 7 Training (7.5); see §8. |
| D3 | Unlocks: **free starter set + milestone items + surprise loot during a wave**. | Cosmetics never cost Supplies. |
| D4 | Loot goes to **whoever grabs the bag**. | A short dash for a reward, inside the wave. |
| D5 | Loot chance **really low**, because there are a lot of zombies. | The chance is set **per run, not per zombie** (§5), so 150 zombies don't make it common. |
| D6 | **Any colour** (free colour picker), not a fixed muted palette. | The slot ring stays the team colour; see §4 for how the game keeps it readable. |
| D7 | **Wait for Epic 7**: build customization together with accounts. | No device-only version first. §7 notes what *could* work before accounts if plans change. |

Rejected, with reasons: permanent stat gear (leaves new friends behind, breaks Training's caps); cosmetics sold for Supplies (a hat would compete with unlocking a gun); a fixed muted palette (designer wants free colours); a device-only first release (designer prefers one release with accounts).

## 3. What you can see at game size (the rule behind the slots)

A phone in landscape shows 24 m across: about **35 CSS px per metre**. The survivor's body is 0.4 m in radius, so it is **~28 px across, ~38 px with its ring, ~60 px from backpack to gun tip**.

**Rule:** a slot exists only if it changes at least ~40 px² of colour or changes the outline at game size. Shoes, faces, belts and jewellery fail, so they are not in the game. Detail that is too small for play can still show in the editor's big preview and on the Results screen.

| Slot | Approx. area at game size | Starter | Milestone | Loot | Colour |
| --- | --- | --- | --- | --- | --- |
| Top style (jacket, hoodie, coat…) | ~400 px² + arms | 5 | 2 | 2 | **free picker** |
| Headgear | ~90 px², changes the head outline | 8 (incl. "none") | 4 | 5 | fixed per item (a few take the accent colour) |
| Hair (shows when the headgear leaves it showing) | ~60 px² | 5 | – | – | **free picker** |
| Backpack | ~100 px² | 5 (incl. "none") | 2 | 2 | fixed per item |
| Accent (scarf, stripes, patch, cape…) | 20–150 px² | 4 (incl. "none") | 2 | 1 | **free picker** |
| Skin tone | ~90 px² (head + hands) | 8 presets | – | – | presets only |
| **Total** | | **35** | **10** | **10** | 3 pickers |

That is **55 parts** in v1 (35 + 10 + 10) and over a million combinations from the starter set alone. Body shape is not a slot: the hitbox is the same for everyone, so the body drawing stays the same size.

Held weapons already change the look (Stories 5.1 and 5.3). The gun stays its own layer, drawn under the arms.

## 4. Readability with free colours

The designer chose any colour. To keep teammates readable, these things stay fixed:

1. **The slot ring, name and edge arrows keep the slot colour** (blue, orange, green, purple; Story 2.9). The ring is the team signal, the jacket is personal.
2. **Night light applies to the chosen colour.** Survivors are drawn above the darkness layer, so they carry the night themselves (`CHAR` colours are pre-darkened). A chosen colour is darkened and slightly desaturated the same way, and more at later decay stages. Neon pink becomes "neon pink at night". The editor shows both the chosen colour and the in-game colour.
3. **A soft hint, never a block.** If the top colour is very close to a slot ring colour, or to Runner dark red, the editor shows one line ("Close to the orange team ring, teammates may mix you up") and still lets you keep it.
4. **Never copy a gameplay signal.** No item may look like armor plates, a red-cross medic bag, a shoulder flashlight, zombie skin or a Runner shirt pattern. The art pick checks this.

## 5. Surprise loot (very rare, per run)

How it works:

- At the start of a run, the run seed (its own `loot` stream, Story 4.4) decides **whether this run has a loot bag**, and if so **which wave (3–10) and which kill in that wave** drops it. The rate doesn't depend on how many zombies there are or how many players.
- The bag lands where that zombie died: a small canvas sack with a soft glint, visible to everyone. It lies there for **20 s**, then disappears.
- **Whoever walks over it first gets it** (pick-up radius 0.6 m, no button). Solo runs have bags too.
- It gives a **loot item that player doesn't own yet**, chosen at random from the 10 loot items. A player who owns all of them gets a "Collector" line on Results and no item.
- The item is revealed on the **Results screen** ("Found in wave 6: Traffic-cone hat") and saved with the run's results, **even if the team wipes or the player quits**. A surprise you earned shouldn't be lost.
- Endless mode doesn't add bags. Bags are not part of the unlock screen and can't be bought.

**How rare?** Pick one:

| Option | Runs with a bag | Per player (4 players, split evenly) | All 10 loot items for one player |
| --- | --- | --- | --- |
| **L1 (recommended)** | **1 in 5 runs** (20 %) | about 1 every 20 runs | ~200 runs |
| L2 | 1 in 10 runs (10 %) | about 1 every 40 runs | ~400 runs |
| L3 | 1 in 3 runs (33 %) | about 1 every 12 runs | ~120 runs |

L1 means a group playing 3–4 runs in an evening sees a bag **about once every other evening**. That's rare enough to make the group shout when one drops, without it being so rare that nobody ever sees one. The rate is one number in balance JSON, so the 4.10-style playtests can tune it.

## 6. Milestone items (earned once, never bought)

Checked at the end of every run, in Story 7.2's Supplies transaction. Each needs a lifetime counter on the player's progress (a small `stats` field).

| # | Milestone | Item (slot) |
| --- | --- | --- |
| M1 | Survive wave 5 | Firefighter helmet (headgear) |
| M2 | First extraction from Downtown | Riot helmet (headgear) |
| M3 | Kill the Behemoth | Gas mask (headgear) |
| M4 | Endless wave 15 | Hockey mask (headgear) |
| M5 | Revive 25 teammates (lifetime) | Leather jacket (top) |
| M6 | 1,000 zombie kills (lifetime) | Camo coat (top) |
| M7 | Build 100 barricades (lifetime) | Work harness (accent) |
| M8 | Extract with all 4 players alive | Four-dot team patch (accent) |
| M9 | 20 runs played | Guitar case (backpack) |
| M10 | Reach wave 10 without going down | Ammo rig (backpack) |

In the editor, a locked milestone item shows its lock and **how to get it** ("Extract from Downtown once"), never a price.

**Loot items (10):** Traffic-cone hat, Chef's hat, Cooking-pot helmet, Party hat, Bunny-ear beanie (headgear); Floral shirt, Bathrobe (top); Teddy-bear pack, Cooler box (backpack); Cape (accent). They are the silly ones on purpose, so a lucky player stands out. Locked loot items show only a silhouette and "Found during waves".

## 7. Saving: with accounts (the plan), and what works before them

**With Epic 7 (the plan, D7):**

- Story 7.1 creates a **guest account from a device token**, so players are "logged in" from their first run without signing up. Customization uses that.
- The `progress` row gets three new fields in the customization story's own migration (7.1 says each story adds only what it needs): `look` (text), `cosmetics` (owned milestone and loot item ids) and `stats` (lifetime counters for milestones).
- Story 7.6 (username + password) carries all of it to a new phone for free, because it's part of progress.

**If it ever has to ship before accounts** (not the plan, kept for reference): the look code goes into `localStorage` (`try/catch`, defaults when storage fails; the Epic 10 settings pattern) and is sent on join like the display name. Starter items only. Milestones and loot need server-side progress, so they wait for 7.1. At 7.1 the device copy becomes a cache: the first save copies it to the account if the account has no look yet.

**How the look travels (both cases):**

- A shared catalogue `cosmetics.json` in `packages/shared`: id, slot, which colours it takes, how it unlocks. No gameplay numbers in it.
- The look is a **short code**, e.g. `v1|top:hoodie|head:beanie|hair:short|pack:duffel|acc:scarf|skin:4|c:7a3e2f,2b2118,d9b36c` (≤ 96 characters), sent **once with the join**. On the room state it is one string per player. **Zero per-tick network cost.**
- The server checks every part: it must exist, and after 7.1 the player must own it. A bad part becomes the default part. **A look never stops a join.**

**How it is drawn:**

- `drawSurvivor` is split into one function per part (top, headgear, hair, pack, accent), in the same game-code style as the guns. The default look is today's survivor, so nothing changes for players who never open the editor.
- Each player's body is drawn **once at join** into a small canvas texture (4 players × one ~150 px frame, about 1 ms). The gun stays its own atlas image under the body. The downed view uses the same texture.
- Fallback if a phone stutters: put every part in the atlas at build time and stack 5–7 images per survivor.

## 8. How it overlaps Epic 5 gear and Epic 7

| Story | Overlap | What to do |
| --- | --- | --- |
| **5.11 Gear** | None now (D1). Gear keeps its bonuses, its per-run bitmask and its HUD icons. | Nothing. *Parked idea:* draw armor/revive kit on the body later so teammates can see who has them (roundtable round 3). That's a gameplay-readability story, not customization. |
| 5.1 / 5.3 Weapon looks | Guns already change the survivor's look, and tier III–IV guns look different. | Keep the gun as a separate layer under the arms. **Weapon finishes** (wood, tape-wrapped, olive, rust) are a later phase. |
| 2.3 Join, 2.9 slot colours | The look joins the display name on join; the ring stays the slot colour. | Story C2. |
| **7.1 Progress** | The `progress` row is where look, owned cosmetics and stats live. | C1 adds the three fields in its own migration. |
| **7.2 Supplies** | End-of-run transaction. | Milestones and loot are banked in the **same transaction** (C4, C5). |
| **7.3 Unlock screen** | Sells items for Supplies. | Cosmetics are **not** on it. The editor ("Survivor" button) is its own screen. |
| 7.4 Shop deck | None. | – |
| **7.5 Training** | The designer's future "level system with stats" (D2) would probably replace or absorb Training. | Flag it for a later `gds-correct-course`. Customization doesn't depend on it. |
| **7.6 Account upgrade** | Carries progress to a new device. | Nothing extra: look and cosmetics are part of progress. |
| Epic 8 rejoin and saved runs | Run snapshot rule: new run state goes into the snapshot. | The loot bag (position, timer) and a player's "found this run" item go into the snapshot. The look comes from the account. |
| Epic 9 art and audio | Final art polish. | Part art follows the Epic 5 art method (code drawings, designer picks). |

## 9. Build order (inside Epic 7, after 7.2)

| Step | Story | Needs | Size |
| --- | --- | --- | --- |
| 1 | **C1** Survivor parts in game code + catalogue (art pick first) | nothing (art only) | M |
| 2 | **C2** Look on join and in the game (code, server check, per-player texture) | C1, 7.1 | M |
| 3 | **C3** Survivor editor screen (saves to progress) | C2 | M |
| 4 | **C4** Milestone items (lifetime stats, checked at run end) | C3, 7.2 | S–M |
| 5 | **C5** Surprise loot bag | C3, 7.2, 4.4 seed streams | M |
| later | C6 Weapon finishes (parked); gear on the body (parked) | – | – |

C1 can be drawn early (it's only art and a catalogue) and the designer can pick looks with the mockup. It ships with C2.

## 10. Open choices for the designer

| Code | Choice | Recommended |
| --- | --- | --- |
| O1 | Loot rate | **L1: 1 in 5 runs** |
| O2 | Bag lifetime on the ground | **20 s** |
| O3 | Duplicate looks in one lobby | **allowed, no warning** (the ring tells you apart) |
| O4 | Editor entry points | **Start screen "Survivor" button + tap your own card in the lobby** |
| O5 | Item counts | **35 starter / 10 milestone / 10 loot** (§3) |
| O6 | The "close to a team colour" hint | **show it, never block** |

"ok" accepts all six recommended values.
