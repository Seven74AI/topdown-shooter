# Customization roundtable: party notes

Party mode (`bmad-party-mode`, session mode), 2026-11-23, on branch `claude/idea-customization`. Idea work only: no game code, no planning files changed.

**In the room**

- 🎲 **Samus Shepard**, game designer: pillars first, loves a clean rule.
- 🎨 **Sally**, UX designer: thinks in phone pixels and thumbs.
- 🏛️ **Cloud Dragonborn**, game architect: net bytes, atlases, the database.
- 🎮 **Dex**, player voice: one of the friend group. Plays on a 2019 Android, mostly on the bus, sometimes on Discord voice with the others. Not a gamer who reads patch notes.

**Facts on the table before we started** (checked in the code):

- A phone in landscape shows 24 m across, so about **35 CSS px per metre**. The survivor's body is 0.4 m in radius, so the **body is ~28 px across, ~38 px with the slot ring**, and ~60 px from backpack to gun tip.
- `drawSurvivor` (`apps/client/src/render/city/spriteArt.ts`) is already built from parts: held gun, two arms (jacket colour), backpack, torso ellipse (jacket), head (skin), cap with brim. Every colour is a constant in `CHAR`.
- Weapons already change the look (Story 5.3: each gun has a "held" view; Story 5.1 picks G3/R1 looks for upgrade tiers III–IV).
- Slot colours are fixed by lobby slot: blue, orange, green, purple (`playerColors.ts`), drawn as the ground ring, the name and the edge arrows.
- Story 5.11 gear (armor I/II, running shoes, revive kit, flashlight) lasts one run, is synced as a bitmask `PlayerState.gear`, and only shows as 24 px HUD icons. Nothing on the body.
- Epic 7: guest account from a device token (7.1), Supplies (7.2), unlock screen with Supplies prices (7.3), Training boosts capped at +10 % HP / +5 % damage (7.5), username + password later (7.6). Epic 10 already plans "settings in localStorage, synced to the account when logged in".

---

## Round 1: what can you even see from above at 38 px?

🎨 **Sally:** Let me paint it. Wave 7, rain, 120 zombies, my thumb covering a third of the screen. My survivor is a 28-pixel bean. What do I see? A **blob of jacket colour**, a **head shape**, a **backpack bump** behind, and the **gun** in front. That's it. Faces, shoes, belts, earrings: gone. If we build a wardrobe of 200 items and 150 of them are invisible in play, that's a lie we're telling the player.

🎲 **Samus:** So we set a rule. A part earns a slot only if it changes **at least ~40 px² of colour or the outline** at game size. Jacket: ~400 px², passes easily. Headgear: a cap vs a hood vs a helmet changes the head's outline, passes. Backpack: ~100 px², passes. Skin tone: the head is ~90 px² but mostly covered by headgear. Shoes: zero. Fail.

🎮 **Dex:** Honestly I just want to find myself. Last time we played I lost track of which blue guy was me for like three seconds and died. If my jacket is mine, I'd find me.

🏛️ **Cloud:** You find yourself today by the camera: you're always in the centre. What you lose is **teammates**. Which is why the ring and arrows exist.

🎮 **Dex:** Okay but I still want to look like *me*. And I want a dumb hat.

🎲 **Samus:** Noted: "dumb hat" is a design requirement now.

**Where the room landed:** seven visible slots, ranked by pixels: **top colour** (biggest), **top style** (hoodie, coat… changes the outline and arms), **headgear**, **backpack**, **skin tone**, **hair** (only when the headgear leaves it showing), **one accent** (scarf, reflective stripes, shoulder patch). Everything else is out. A "close-up" preview in the editor and on the Results screen can show detail that the game can't.

## Round 2: slot colours vs personal colours (the fight)

🎨 **Sally:** Here's my worry. Dex picks a bright orange jacket. He's in the **blue** slot. Now there's an orange jacket on a blue ring and the orange-slot player next to him. Which one is "orange"? We'd be breaking Story 2.9's whole point.

🎮 **Dex:** So I can't have orange? That's my colour.

🎲 **Samus:** Two options. **A:** the slot colour stays king, jackets come from a **muted Dead City palette** (10 colours, low saturation), so the ring is always the loudest colour on a survivor. **B:** your favourite colour *becomes* your slot colour when it's free in the lobby.

🏛️ **Cloud:** B is cheap, by the way: the lobby assigns slots already; a "preferred slot colour" is one byte on join. But with four friends who all like blue, three get disappointed every lobby.

🎨 **Sally:** And A protects readability by construction. I want a **test**, not a promise: every jacket colour has saturation ≤ 0.45 and stays far from the four slot hues and from **Runner red** (dark red shirt means "Runner", Story 3.8 rule). If a colour fails, it isn't in the palette.

🎮 **Dex:** Muted orange? Like a rusty orange?

🎨 **Sally:** "Rust" passes. Neon orange doesn't.

🎲 **Samus:** Let's do **A now, B as an optional lobby nicety later.** Dex gets rust.

🎮 **Dex:** I'll take rust. Under protest.

**Side rule from Sally that everyone signed:** a cosmetic must **never copy a gameplay signal**. No red-cross items (that will mean "has the revive kit"), no plate vests (that means armor), no light on the shoulder (flashlight), no zombie skin tones, no dark-red shirts.

## Round 3: bonus gear vs cosmetics (the hard one)

🎲 **Samus:** The user's idea has two halves: items that give **bonuses** and items that are **just looks**. Here's my position, and I'll be loud about it: **permanent stat gear is a no.** Epic 7 already caps Training at +10 % HP and +5 % damage, *on purpose*, so a new friend isn't carried. A "+15 % speed boots" you keep forever blows through that.

🎮 **Dex:** Yeah if Marco has played 40 runs and I've played 3 and he's got better boots… I'm just quitting. It's a game for us. Not a grind.

🏛️ **Cloud:** But bonus gear already exists: **5.11**, and it's per run. You buy armor in the build phase, you lose it at the end. That's the bonus half, done.

🎨 **Sally:** Then the missing piece is that 5.11 gear is **invisible**. A 24 px HUD icon only tells *me* what *I* have. If armor shows as a vest on my body, my teammates know I'm the tank. If the revive kit shows as a white pouch with a red cross on my backpack, a downed friend knows **who to scream for**.

🎲 **Samus:** Oh, that's good. That's "Better together" pillar, straight. The bonus gear *is* the equipment system, it just needs to be worn.

🎮 **Dex:** So I'd see Marco's vest and go "okay he's in front". I like that. And running shoes?

🏛️ **Cloud:** Feet are under the body from above. Invisible. HUD icon only, or a faint dust puff when sprinting; I'd skip it.

🎲 **Samus:** So the split is:

| | Chosen by | Lasts | Changes stats | Seen in game |
| --- | --- | --- | --- | --- |
| **Look** (avatar parts) | you, in the editor | forever (device, later account) | never | yes |
| **Gear** (Epic 5 shop) | bought in the build phase | one run | yes | **yes, drawn over the look** (new) |
| **Weapons** (Epic 3/5) | bought | one run | yes | yes (already) |
| **Training** (Epic 7) | Supplies | forever | small, capped | no |

🎨 **Sally:** And the gear overlay must leave **at least half the jacket showing** (sides and arms), so you still recognise the person under the armor.

**Parked, not killed:** a "kit" sidegrade you pick before a run (e.g. start with a Medkit instead of 100 money). Interesting, but it's a balance feature, not customization. Belongs in a future balance pass, if ever.

## Round 4: unlocks and progression

🏛️ **Cloud:** Epic 7's unlock screen sells guns for Supplies. If hats cost Supplies too, every hat is a gun you didn't unlock. That makes looks compete with power.

🎮 **Dex:** Don't make me choose between the flamethrower and a hat. I will choose the hat and then lose.

🎲 **Samus:** Then cosmetics never cost Supplies. Three ways to get them:

1. **Starter set, free from the first run** (most items).
2. **Milestone items**: earned by doing a thing once ("first extraction", "kill the Behemoth", "revive 25 teammates"). They're bragging rights you can *see*.
3. **Random drops**: no. Feels like a slot machine; we're not doing that.

🎮 **Dex:** Milestone hats are good. If I see someone in a riot helmet I know they've extracted. That's cool.

🎨 **Sally:** Lock icons in the editor with the *how*, not a price: "Extract from Downtown once". The locked item is a goal.

🏛️ **Cloud:** Milestones need trustworthy counters. Before Epic 7 there's no server-side progress, so milestone items can't be earned before 7.1. Story 7.2 already writes a per-run transaction at the end of every run: milestones get checked there, same transaction.

## Round 5: tech, saving, before and after accounts

🏛️ **Cloud:** Boring version, because boring works:

- A shared catalogue `cosmetics.json` in `packages/shared` (id, slot, colours, unlock rule). No gameplay numbers.
- The look travels as a **short code**, e.g. `v1.2.0.3.4.6.1.2.0` (one number per slot, ≤ 32 characters), sent once with the join, like the display name. On the room state it's one string per player; **zero per-tick cost**.
- The server checks each part exists (and, after Epic 7, that it's unlocked) and swaps anything bad for the default. **Never refuse a join over a look.**
- **Before accounts:** stored on the device in `localStorage` (`try/catch`, defaults if storage fails; the Epic 10 settings pattern). Only starter items are offered.
- **After 7.1:** the look lives on the `progress` row, the device copy becomes a cache. 7.6 (username + password) carries it over for free, since it's part of progress.

🎨 **Sally:** And drawing? Today the survivor is one baked atlas frame per weapon.

🏛️ **Cloud:** With parts, baking every combination is impossible (over a million). Two ways: **(A)** bake each part as its own atlas frame and stack 5–7 images per survivor; **(B)** at join, draw each player's body once into a small canvas with the same `drawSurvivor`-style functions (4 players × one ~150 px frame, ~1 ms), re-draw at a build start when their gear changes. The gun stays its own image *under* the body, which the current draw order already does.

🎲 **Samus:** The art method note says "bake so phones don't draw at start-up".

🏛️ **Cloud:** That's about hundreds of frames. Four small canvases at join is fine, and it keeps the art as **one drawing function per part**, the same style as weapons. I'd go B; A is the fallback if a phone stutters.

🎮 **Dex:** I don't know what any of that means but please let me make my guy in 30 seconds and have a "random" button.

🎨 **Sally:** 30 seconds is the bar. Big preview, plus **the survivor at real game size, on asphalt, in a crowd of zombies**, so you see what your friends will see. Randomize button. Done button. That's the mockup.

## Round 6: the open questions the room couldn't settle

- 🎮 vs 🎨: **Duplicates in the lobby.** Dex: "if two of us pick the same look it's funny". Sally: "the ring separates you, but a warning would be nice". Unsettled; a soft hint at most.
- 🎲 vs 🏛️: **Weapon finishes** (wood, tape-wrapped, olive, rust for all guns). Samus loves it (the art method was written to allow it); Cloud wants it after the avatar ships because every gun's "held" and "icon" views need a finish parameter. Parked to phase 3.
- **Body build** (slim / broad): Sally says only ±5 % visual, never smaller than the real hitbox, or it's a fairness problem. Samus thinks it's not worth a slot. Not in v1.

---

## What the room handed to the narrowing step

1. Seven visible slots; anything invisible at game size is out.
2. Slot colour stays king; jackets from a muted, tested palette (no slot hues, no Runner red, no gameplay signals).
3. Looks never change stats. Bonuses stay run-only (Epic 5 gear) and **become visible on the body**.
4. Cosmetics never cost Supplies: free starter set + milestone items, no random drops.
5. Device storage first (starter set only), account storage from 7.1, milestones from 7.2.
6. Look = short code sent once on join; server validates, never refuses.
7. Per-player body drawn once at join / build start; gun stays a separate image.

Narrowed with the designer in `proposal.md`; playable mockup in `avatar-editor.html`.

## After the roundtable: what the designer changed

The designer kept the "looks never change stats" line and went further: **no bonuses on equipment at all** (a player level system with stats may come later as its own idea). They overruled the room on three points: **any colour** instead of a muted palette (Sally's ring/hint rules stay as mitigation), **surprise loot during a wave** instead of no random drops (kept very rare: chance set per run, not per zombie), and **wait for Epic 7** instead of shipping a device-only editor first. See `proposal.md` §2.
