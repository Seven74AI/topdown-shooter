# Epic 7: decisions to confirm and looks needed — Stories 7.9–7.12 (your look, editor, milestone items, loot bag)

Written 2026-11-25 from the four story files (`_bmad-output/implementation-artifacts/7-9-my-look-in-the-game.md`, `7-10-survivor-editor.md`, `7-11-milestone-items.md`, `7-12-surprise-loot-bag.md`). The other Epic 7 stories (7.1–7.7: progress saved on the server, Supplies, unlock screen, shop deck, Training, account upgrade, district unlock) have their own file from the other writer.

Each line is the story writer's **recommended value** (first, in bold), with the alternative after it. **"ok" accepts all 25.** Change any line by its code (e.g. "7.11 D5: any team size"). Everything already in `docs/epic-7-decisions.md` and the customization proposal (any colour with no warning, 1 bag in 5 runs, 20 s on the ground, whoever walks over it first, items never sold, identical looks allowed, the ten milestones and their items, the 51 parts) is a rule in the stories and is not asked again.

## The ones worth a look (how the game feels)

| Code | What it changes in play | Recommended (alternative) |
| --- | --- | --- |
| 7.9 D1 | As the city falls apart, survivors get a little darker with it (lightness × 1 in the evening down to × 0.84 at collapse; everyone, the default survivor too) | **Yes, redrawn at each build phase** (no: survivors look the same all night, as today) |
| 7.10 D3 | You change your survivor while waiting in the lobby | **Your friends see the new look on your card at once, before Start** (it only shows from your next game) |
| 7.11 D1 | The team survives wave 5 / kills the Behemoth / reaches wave 15 while you're down or out | **You still earn that item, same as Supplies: you were in the run** (only players standing at that moment; the Behemoth item only for whoever finished it) |
| 7.11 D5 | "Extract with all 4 alive" (laurel wreath) | **Exactly 4 players, all standing when the helicopter leaves** (any team size, as long as everyone in the run is standing: 2- and 3-player groups can earn it) |
| 7.12 D1 | Someone finds the surprise bag | **Everyone's Results screen shows "Ana found: Traffic cone"** (only the finder sees the item; the others see "Ana found a bag") |
| 7.12 D5 | The bag drops somewhere you can't see | **A small white arrow at the screen edge points to it for its 20 seconds** (no arrow: you only find it if you saw it fall) |

Also worth a glance: **7.11 D2** "endless wave 15" means clearing wave 15, the 5th endless wave (not 15 endless waves = wave 25); **7.11 D3** a barricade counts toward the 100 only if it's still standing when the next wave starts, so placing and taking it back earns nothing.

## 7.9 My look in the game

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.9 D1 | Survivors darken a little as the city falls | **Yes: redrawn at each build start, from × 1 (evening) to × 0.84 lightness (collapse), the default look too** (no: same brightness all night, as today) |
| 7.9 D2 | How the gun is put on a custom survivor (no visible difference) | **The gun is its own picture under the body: about 1–2 ms at the start of a run** (every weapon pose drawn per player: about 5–8 ms, a small hitch at the start on a cheap phone) |
| 7.9 D3 | Your survivor on the lobby card | **A close-up drawing (about 3× game size) left of the name on each slot card** (a smaller head-and-shoulders drawing) — exact layout picked from drawings |
| 7.9 D4 | Your look in Practice solo | **Your own look (from this phone's saved progress)** (the default survivor in practice) |

## 7.10 Survivor editor

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.10 D1 | The colour picker | **The phone's own colour picker plus a row of 12 quick colours** (the phone's picker only) |
| 7.10 D2 | Colours on the big preview | **Night colours (what your friends will see), with the colour you chose as a small swatch next to it** (daylight colours big; night colours only in the small game-size preview) |
| 7.10 D3 | Changing your look while waiting in the lobby | **Your card and survivor change for everyone at once (before Start); never during a run** (only from your next game) |
| 7.10 D4 | Tapping Done when the server can't be reached | **Kept on this phone and used at once, saved to your profile automatically next time; the editor says so** (you stay in the editor until saving works) |
| 7.10 D5 | What Random changes | **Everything, skin tone included** (keeps your skin tone) |
| 7.10 D6 | The big preview | **Turns slowly by itself (one turn every 6 s); drag to turn it yourself** (still; drag only) |
| 7.10 D7 | Leaving the editor without tapping Done | **Throws the changes away, no question** (asks "Keep changes?") |

## 7.11 Milestone items

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.11 D1 | Who earns the team moments (survive wave 5, kill the Behemoth, endless wave 15) | **Everyone in the run when it happens, downed or out too (same as Supplies)** (only players standing at that moment; the Behemoth item only for whoever finished it) |
| 7.11 D2 | What "endless wave 15" means | **Clearing wave 15, the 5th endless wave** (clearing 15 endless waves, i.e. wave 25) |
| 7.11 D3 | Which barricades count toward 100 | **One you placed that is still standing when the next wave starts; upgrades don't count** (every placement counts, even one taken back at once — easy to farm) |
| 7.11 D4 | What counts as a run for "20 runs" | **A run you were in when wave 1 ended** (every run you started, even one you quit at once) |
| 7.11 D5 | "Extract with all 4 alive" | **Exactly 4 players, all standing when you extract** (everyone in the run standing, any team size) |
| 7.11 D6 | Which kills count toward 1,000 | **Your own kills, as on Results (turret and mine kills don't count)** (turret and mine kills count too) |
| 7.11 D7 | "Reach wave 10 without going down" | **You were in every wave 1–10 and never went down in them** (never went down while you were in the run, so someone who joined later can earn it) |
| 7.11 D8 | A new item on the Results screen | **Picture, name and reason, plus a "Wear it" button that puts it on** (picture, name and reason only; put it on in the editor) |

## 7.12 Surprise loot bag

| Code | Decision | Recommended (alternative) |
| --- | --- | --- |
| 7.12 D1 | Who sees what was found | **Everyone's Results shows "Ana found: Traffic cone" (the finder's line is bigger)** (only the finder sees the item; teammates see "Ana found a bag") |
| 7.12 D2 | A bag in Practice solo | **Only if practice runs earn Supplies (Story 7.2 decides); otherwise no bag there** (a bag can drop in practice but nothing is saved) |
| 7.12 D3 | Can anyone know in advance that a run has a bag | **No: the server mixes a secret into the bag's dice, so even a modified phone can't tell** (use the plain run seed: simpler, but a modified phone could tell and quit runs without a bag) |
| 7.12 D4 | A bag that falls in a fire, acid or gas | **Stays where it fell: you see the danger and decide** (moved to the nearest safe spot) |
| 7.12 D5 | Finding the bag when it's off screen | **A small white arrow at the screen edge for its 20 s** (no arrow) |
| 7.12 D6 | The bag when the wave ends | **Stays its full 20 s, also into the build phase** (vanishes when the wave ends) |

## Looks needed (you pick from code drawings before each is built)

| Story | What | When |
| --- | --- | --- |
| 7.9 | **Lobby slot card with your survivor's drawing** (where it sits and how big, with the Host / You / Ready tags), at 568 × 320 and 800 × 360 | before 7.9's lobby task |
| 7.10 | **The editor screen** (tabs, part tiles, big turning preview, game-size preview, colour pickers, Random, Done), the **locked milestone tile** (lock + "how to get it") and the **loot silhouette tile** | before 7.10's screen task |
| 7.11 + 7.12 (+ 7.2) | **The Results "Run rewards" lines:** "New item: Riot helmet (first extraction)" with its picture (and "Wear it"), and "Found in wave 6: Traffic cone". Best drawn together with Story 7.2's "Run rewards" panel (its layout is still open), one pick for all | before 7.2's panel is built, or before 7.11 |
| 7.12 | **The loot bag** (a small sack with a soft white glint, in rain and in blackout, clearly a pick-up and not cover), the **off-screen arrow** (D5) and the **"Bag found!" / "Ana found a bag!"** line | before 7.12's view task |

No new part drawings: all 51 parts (including the ten milestone and ten loot items) were picked in Story 7.8.

## Build order

| Step | Story | Waits for | Can run in parallel with | File overlap and how it's handled |
| --- | --- | --- | --- | --- |
| 1 | **7.9** My look in the game | **7.1** on master (database, account at join); the Network pass's **8.1** (it rewrites the join); Epic 6 done | **7.12 steps T0–T4** (the bag in the World and on screen) | Shared: `RunState.ts`, `stateView.ts`, `fakeRoom.ts`, `devThrottle.ts` (7.9 adds `look` to the player, 7.12 adds `lootBag` to the run: small, separate lines). 7.9's look-code, gun-split and texture work (T1, T4, T5) can start before 7.1 lands; only the database and join tasks wait. |
| 2a | **7.10** Survivor editor | 7.9; **7.3** (Progress hub, for the tab); 7.1's account web routes | **7.11** | Only `milestones.json` (the same table is in both story files: whichever starts first creates it). |
| 2b | **7.11** Milestone items | 7.9; **7.2** (end-of-run transaction, waves per player, Run rewards panel); Epic 6's 6.11/6.12 (extract, endless) | **7.10** | Adds to 7.2's transaction and Results panel; 7.12 later adds next to it. |
| 3 | **7.12** Surprise loot bag (banking step T5) | **7.11** (the owned-items column), 7.2 | — | T5 merges 7.11 first; its Results line sits next to 7.11's. |

Up to 2 of these builders at once (7.9 ∥ 7.12-start, then 7.10 ∥ 7.11). Each builder gets its netEvents kind numbers and readability-sheet number from the main session (7.12 needs both).

Dependencies on the other writer's stories: **7.1** (storage and identity: looks, items and stats are saved on its account; its open flag — anyone with a copied guest token is that player — also means they could wear or bank that player's items, cosmetic only), **7.2** (the end-of-run transaction, the practice-solo rule, the "Run rewards" panel), **7.3** (the Progress hub tab), **7.6** (merging a guest into an account: owned items joined, stats added, the account's look kept unless it's the default), **7.7** (the district, for "first extraction from Downtown").

## Open questions (for the main session, not designer decisions)

- **Practice solo earning:** 7.11 and 7.12 bank exactly where 7.2 banks Supplies. If 7.2 lets the offline practice run earn, milestones and the bag follow (7.12 D2); if not, practice gives nothing. Please make sure 7.2's file states it.
- **Results "Run rewards" panel:** its layout (readiness U3) is 7.2's; the 7.11 and 7.12 lines need it. Ideally one look pick covers 7.2's panel and both lines.
- **netEvents kinds and readability-sheet numbers:** 7.12 adds three event kinds and one readability item; 6.8–6.12 are still taking numbers. Assign at dispatch.
- **Balance version bump:** 7.12's new `loot.json` balance file bumps the balance version once (open tabs see "Please refresh" after that deploy). Expected, mentioned so it isn't a surprise.
- **Golden replay digests** change once with 7.12 (the bag is part of the World); the story says to regenerate them.
- **`progress` columns:** 7.9 adds `look`, 7.11 adds `cosmetics` and `stats` — on top of 7.1's table. The architecture already lists them that way.
