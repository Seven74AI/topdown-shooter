# Epic 7: decisions to confirm and looks needed — Stories 7.9–7.12 (your look, editor, milestone items, loot bag)

**Status: accepted.** Designer 2026-11-25: "Okay, for all" — every recommended value (first, in bold) accepted. Account / progress deletion: no story yet; default is Epic 10 polish (10.1 settings screen) unless the designer asks for an Epic 7 story.

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

## 7.9 build-time choices (auto-accepted overnight — designer: follow the GDS recommendation)

Made while building Story 7.9 (2026-11-25, branch `story-7-9`); recommended value first, alternative after.

| Code | Choice | Taken (alternative) |
| --- | --- | --- |
| 7.9 B1 | When the bodies darken (D1) | **Compare the decay stage each frame (2 compares), repaint on a change: a tab that slept through build starts repaints once** (listen for `decay.stage_changed`) |
| 7.9 B2 | A join with no look at all (bots, old tabs) | **The default look, not logged as "replaced"** (logged like any bad look) |
| 7.9 B3 | How a client reads `state.look` | **Against every part in its catalogue (the server already checked ownership)** (against the starter parts: would strip 7.11's items) |
| 7.9 B4 | `?devlooks=N` | **N survivors in all, 1–4 (mine + N − 1, AC 14's "devlooks=4 → 3 extra")** (N extra) |
| 7.9 B5 | The look in the session response | **Optional `progress: { look }`, canonicalised by the server; a failed progress read keeps the session saved with the default look** (a failed read makes the whole session unsaved) |
| 7.9 B6 | This phone's copy of my look | **`localStorage` `topdown.look`: the server's copy wins and is kept; a server "default" clears it; save server down → the copy** (no device copy: default look when the server is down) |
| 7.9 B7 | The DP2 district line in the lobby | **Shows the current district read-only ("Downtown"); Story 7.7 makes the same panel the host's picker** (an empty placeholder slot) |
| 7.9 B8 | Bake cost over AC 9's target on the 4× throttle (9.1 ms) | **One bake per frame, first bakes and build-start repaints alike (review L7); online the first bake waits for the server's decay stage; a survivor shows the default picture until its body is baked** (bake the `nopack` frame only when needed: kept as the next cut if the phone hitches) |
| 7.9 B9 | Lobby texts with no room on a 568 px phone | **Start's "Waiting for…" hint inside the Start button; "Copied" on the Copy button; guests see "The host starts the game" where Start is** (a hint line under the cards: no room at 320 px tall) |
| 7.9 B10 | The lobby portrait | **Whole body with pack and the plain gun, turned like the SC3 sheet, animated layers drawn still (the propeller shows)** (no gun) |

## 7.10 build-time choices (auto-accepted overnight — designer: follow the GDS recommendation)

Made while building Story 7.10 (2026-11-25, branch `story-7-10`); recommended value first, alternative after. The story's own decisions D1–D7 were taken as recommended (row "D1–D7"). Every row: **auto-accepted (designer: follow the GDS recommendation)**.

| Code | Choice | Taken (alternative) |
| --- | --- | --- |
| 7.10 D1–D7 | The story's decisions | **All recommended: phone picker + 12 quick colours (D1); night colours on the big preview with the chosen colour as a small swatch (D2); my lobby card changes for everyone before Start, never in a run (D3); Done offline keeps the look on this phone and syncs next start (D4); Random changes everything incl. skin (D5); big preview turns once per 6 s, drag turns it (D6); Back throws changes away, no question (D7)** |
| 7.10 T0 | The editor layout | **The designer's pick ED1 + LK2 + LS1 (7-UI-5, `docs/art/epic-7/lumen/editor.jpg`) is the look; no new proposals drawn** (draw 2–3 new layouts) |
| 7.10 B1 | The hub's Survivor tab | **Opens the editor as its own full screen; Back / Done return to the hub** (the editor inside the hub's list panel: no room for the previews at 568 × 320) |
| 7.10 B2 | The save route's path | **`POST /api/account/look` (server `/account/look`), beside 7.1's `/account/session` and 7.3's `/account/unlock`** (the story's placeholder `PUT /api/progress/look`) |
| 7.10 B3 | AC 9's "newer server look wins" | **A pending Done remembers the server look it was edited from (`base`); at the next start it is sent only if the server still has that base, else the server's newer look (another phone) wins and the pending one is dropped** (a new `look_saved_at` column + migration, timestamps from two phone clocks) |
| 7.10 B4 | Done answered 429 | **The editor stays open with "Too many saves, try again in a minute"; nothing is cached** (cache it as pending like an offline save) |
| 7.10 B5 | "Saved on this phone…" | **Shown 2.5 s in the info row, then the editor closes by itself (Back closes at once)** (close at once and show it on the next screen) |
| 7.10 B6 | 12 quick colours at 568 px | **A sideways-scrolling strip of 44 px circles beside the picker (3–5 visible on a small phone)** (smaller circles under the 44 px minimum) |
| 7.10 B7 | What `lobby.set_look` may wear | **The same owned set as the join (starter parts until 7.11 feeds the account's items into the room)** (a database read per lobby change) |
| 7.10 B8 | Ring colour in the previews | **My lobby slot's colour; outside a lobby, slot 1 (blue)** (always orange as in the sheet: orange is the accent) |
| 7.10 B9 | Tiles while dragging a colour | **Both previews follow every picker event; the tiles repaint 150 ms after the colour settles** (tiles repaint on every event: 20 data URLs per event on a phone) |
| 7.10 B10 | Drag speed | **0.02 rad per CSS px on top of the slow turn** (drag stops the turn) |
| 7.10 B11 | The 12 quick colours (`cosmetics.json › look.swatches`) | **Jacket blue, teal, olive, plum, rust, bone, near-black, Runner red, mustard, sky, brown, grey** (any other 12) |
| 7.10 B12 | Done in the lobby | **Also sends `lobby.set_look` with the stored code (or the phone copy when offline): D3 at once** (only from the next join) |
| 7.10 B13 | Text size in the editor | **≥ 14 px everywhere (AC 2), checked by the DOM layout test (R9's floor is 11)** (11 px labels) |
| 7.10 B14 | `/account/look` per IP | **60 calls per IP per minute before the body or the database (brief 15), beside AC 11's 10 per account** (account limit only) |
