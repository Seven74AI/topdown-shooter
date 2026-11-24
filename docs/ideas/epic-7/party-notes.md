# Epic 7 roundtable: party notes

Party mode (`bmad-party-mode`, session mode), 2026-11-24, branch `claude/idea-epic-7`. Idea work only: no game code, no planning files changed. Results: `proposal.md` (decisions D1–D12), `revised-stories.md` (7.1–7.7), prototype `progression-sim.html`.

**In the room**

- 🎲 **Samus Shepard**, game designer: pillars first; "more options, not more power".
- 🏛️ **Cloud Dragonborn**, game architect: database rows, tokens, what breaks on a phone browser.
- 🕹️ **Link Freeman**, game developer: built the 5.13 card-shop seam (`cardPool`), counts stories.
- 📱 **Mo**, player voice: hosts for four friends. One of them, Kai, joins "maybe every third Friday".

**Facts on the table** (checked 2026-11-24 in the GDD, epics.md, the 5.13 story and balance JSON):

- Supplies (FR78): +10 per wave survived, +50 Behemoth, +100 extract, +20 per endless wave (kept only on extract). A full extract = 250.
- Unlock prices (GDD + alignment Q3) add up to **3,370**: weapons 1,900, buildings 870, gear 450, Molotovs 150.
- Training: 4 boosts × 5 levels × 50 × level = **3,000**.
- GDD pacing target: everything after **≈ 15–20 runs**.
- Starter pool: Pistol, Machete, Shotgun, SMG, Hunting Rifle, Body armor I, Running shoes, Wood barricade, Auto-turret, Medkit, Grenades.
- 5.13: 6 cards per build, ≥ 1 weapon and ≥ 1 gear, no Pistol card, owned items never drawn, reroll 20, fewer cards + Reroll off when no new draw exists (Q13). `cardPool(world, playerId)` is the seam 7.4 replaces.
- Customization (7.8–7.12): cosmetics never cost Supplies; 10 milestone items (M1–M10); 1-in-5 loot bag. D2 there: a "player level with stats" idea is parked and may absorb Training.

---

## Round 1: the grind maths

🕹️ **Link:** I ran the numbers before anyone got excited. A friend group that wipes around wave 5 for a few runs, then wave 7–9, then extracts every other run: **42 runs** to buy everything. Unlocks alone: 25.

🎲 **Samus:** The GDD promised 15–20. We're at double.

📱 **Mo:** 42 Fridays is most of a year. We'd stop at run 10.

🏛️ **Cloud:** Two levers. Earn more or cost less. Training is the fat one: 3,000 for a +10 % HP ceiling.

🎲 **Samus:** I don't want to touch the unlock prices; the designer set Gas torch, Bear trap and Barricade upgrades in the alignment pass. Double the wave pay instead: **+20 per wave**. A full extract becomes 350, a wave-5 wipe still gives 100. A loss always moves you.

🕹️ **Link:** And halve Training: **25 × level**, 375 per boost, 1,500 total. With those two: unlocks in ~15 runs, everything in ~21.

📱 **Mo:** Still slower than I'd like for Kai.

🎲 **Samus:** Hold that thought. Kai gets their own round.

## Round 2: the first run's shop is a fixed menu

🕹️ **Link:** Here's the thing nobody's noticed. A new player's card pool is Machete, Shotgun, SMG, Hunting Rifle (Pistol's never a card) plus Body armor I and Running shoes. **That's exactly six.** The "random roguelike shop" shows the same six cards every build, and Reroll is greyed out from the start.

🎲 **Samus:** That kills the pitch of 5.13 for exactly the person we most need to hook.

🏛️ **Cloud:** Add two to the starter pool and it breathes. Eight items, six cards, minus what you own.

🎲 **Samus:** **Fire Axe and Revive kit.** The Axe is cheap (150) and fun; the Revive kit is the co-op item, so the rookie is the one who can pick their friends up. Both move out of the unlock list. Unlock total drops to 3,120.

📱 **Mo:** Revive kit for the new guy is lovely. He's always the one dying first and then he gets to be the hero.

## Round 3: new friends feeling behind

📱 **Mo:** Kai, run 1, with three of us at run 15. We've got Chainsaw, Grenade Launcher, mines, med station. He's got a Shotgun. He *will* feel it.

🎲 **Samus:** The caps protect his survival. They don't protect his fun. Two ideas. One: a **rookie lift**, double Supplies until 500 lifetime. His first three runs get him a weapon of his choice.

🕹️ **Link:** Trivial. One multiplier in the 7.2 transaction.

🎲 **Samus:** Two, and this is the one I love: a **Borrowed card**. Each build, one of your six cards may come from a teammate's unlocks that you don't have, tagged "Borrowed from Mo". You buy it with run money like any card. It's gone after the run.

🏛️ **Cloud:** That breaks the 7.4 line "a teammate's unlocks never appear in my shop". And 5.13's F1: a teammate never changes my cards.

🎲 **Samus:** F1 is about *during* a build: rerolls, buys, joins. The borrowed card is fixed at the draw. The pool is read once at build start.

🏛️ **Cloud:** Then it's deterministic if the pool is "union of the teammates in the room at build start". Same seed + same room = same cards. Fine. I'll want that in a test.

🕹️ **Link:** Cost: `cardPool` gets a second list. One slot, drawn from the same shop stream, so still exactly 6 draws. Maybe half a story.

📱 **Mo:** It's also an ad. Kai tries the Chainsaw, loves it, now he knows what to unlock.

🎲 **Samus:** "Try before you unlock." That's pillar 4 doing real work.

🏛️ **Cloud:** Do veterans get borrowed cards too?

🎲 **Samus:** Only if a teammate has something they don't. Usually that's nobody, so it targets the newcomer by itself. No rule needed.

## Round 4: Training and pay-to-win

🏛️ **Cloud:** Nobody pays real money, so no literal pay-to-win. The feel is "veteran's numbers are bigger".

🎲 **Samus:** +10 % HP, +5 % damage, +5 % reload, +50 start money. A veteran is maybe 10 % stronger. You feel the Chainsaw, not the +5 %.

📱 **Mo:** Could Training scale down to the team's lowest, so it's even?

🎲 **Samus:** Then a veteran's Training does nothing on the nights they play with Kai. Feels like being robbed. No. Keep it personal and capped.

🕹️ **Link:** The customization D2 note says a stat-level system might replace Training. Do we wait?

🎲 **Samus:** No. Ship Training now, small and capped. If the level system ever comes, it can absorb these four rows.

📱 **Mo:** Just show it somewhere. If my friend is tougher I'd like to know why.

🕹️ **Link:** Results already shows Training per the story. That's enough.

## Round 5: what counts, and when

🎲 **Samus:** "Per wave survived while in the run." A teammate who's out in wave 6 while the rest clear it: do they get the 20?

📱 **Mo:** Yes! Otherwise the weakest player earns least. Backwards.

🎲 **Samus:** Agreed. A wave counts for everyone still in the run when it ends, downed or out. Team reward. A quitter banks what they had.

🏛️ **Cloud:** And endless keeps the FR78 rule: endless Supplies only on extract; a wipe keeps waves 1–10 and the boss. The extract vote should show it: "Extract now: +100 · Stay: +20 a wave, lost if you wipe".

🎲 **Samus:** Good. That turns the vote into a real bet.

## Round 6: guests, Safari, and accounts

🏛️ **Cloud:** Big risk. The guest token sits in `localStorage`. **Safari wipes script storage for a site you haven't opened in 7 days.** Kai plays every third Friday. Kai loses everything.

📱 **Mo:** That would be the end of Kai.

🏛️ **Cloud:** Fix: the server also sets the guest token as a first-party, HttpOnly cookie, one year. The 7-day rule hits storage written by scripts, not server cookies from the same site. Plus a nudge: after the first run that banks ≥ 200 Supplies, Results says "Save my progress" once.

🕹️ **Link:** No email in 7.6. Forgotten password = gone.

🏛️ **Cloud:** A **recovery code** shown once at sign-up, 12 characters, "screenshot this". Lets you set a new password. No email, nothing to leak.

🎲 **Samus:** And a guest who's played on the tablet logs into their account there?

🏛️ **Cloud:** Merge, don't pick. Unlocks and cosmetics: union. Supplies: add. Training: the higher level. Stats: add. In a co-op game there's nothing to exploit.

## Round 7: districts and the rest

🎲 **Samus:** District 2 unlocks on your first Downtown extract, per player. Who can pick it in the lobby?

📱 **Mo:** If I've unlocked it and Kai's hosting, I want to go.

🎲 **Samus:** So: the host can pick a district **if anyone in the lobby has it**. Better together. It's "coming soon" in v1, so it's only the rule.

🕹️ **Link:** Unlock order: tree or free?

🎲 **Samus:** Free. 16 items, you pick. The screen marks one "Good next pick" (the cheapest item of the category you own least of). No toggling unlocks off your deck in v1; the 5.13 rarity weights already keep the pool from getting silly.

🏛️ **Cloud:** Tie-in with customization: one **Progress** hub on the start screen (Unlocks · Training · Survivor), and one **Run rewards** panel on Results: Supplies breakdown, new milestone item, loot bag. Milestone M2 "first extraction" and the district unlock fire from the same transaction.

📱 **Mo:** And the supply drop?

🎲 **Samus:** Already gives its weapon even if locked. Add a Results line: "You used the Grenade Launcher: unlock it for 500". Another "try before you unlock".

🕹️ **Link:** Story count stays seven; 7.4 grows a little (borrowed card), 7.6 grows (cookie, recovery code, merge).

🎲 **Samus:** Prototype: a simulator where the designer drags the knobs and watches runs-to-everything, plus the unlock screen with the Borrowed card. They'll play with it more than they'll read this.
