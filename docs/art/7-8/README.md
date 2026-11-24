# Story 7.8 art pick: survivor parts

`parts.html` is self-contained (open it in a browser). Built from `docs/ideas/customization/avatar-editor.html`
with the same path helpers as `apps/client/src/render/city/spriteArt.ts`. Designer picks:
`docs/epic-7-decisions.md` › "Survivor parts (7.8)".

- One card per part (55), grouped by slot: a close-up in editor light and the part at real game size (35 px per
  metre, body radius 0.4 m = 14 px, wet asphalt, blue slot ring, four walkers) in the night-muted in-game colour.
  Everything else stays the default look. Hair is shown with no headgear; skin with no headgear and bald.
- The default parts (`jacket`, `cap`, `short`, `backpack`, skin 1) are drawn exactly as today's `drawSurvivor`:
  the prototype's hands, backpack strap and jacket panel are gone, so the default look stays pixel-identical (AC 3).
- Each card's chip is the AC 6 measure at game size: pixels whose colour changes by more than 8 in any channel
  against the same look without the part ("none", or the slot's default part for top, hair and skin).
- Red-edged cards are the gameplay-signal candidates (story Dev Notes + proposal § 4.4): riot, bike, hard, gas,
  hockey (red scratch), stripes, ammo, cooler (white box = pick-up), floral (pink-red). Each has a safer **B**.
- Changes against the prototype: hoodie hood, tracksuit piping, floral flowers, tied hair, curly hair and the
  shoulder patch drawn larger so they pass the 40 px² rule; the team patch moved from the backpack to the shoulder
  (it vanished with no pack or with the flamethrower tanks); the cape and scarf are drawn after the body (the
  game's order); night mute is the story's HSL rule (lightness × 0.62, saturation × 0.8, tunable on the page).
- Picks save to the published page's store (`picks/<slot>_<id>` = `{ choice: keep | B | redraw | drop, note }`,
  `picks/_look` = the mute sliders); the "Copy picks" text is the fallback. A local `file://` copy can't save.

## Round 2

`round-2.html` (claude.ai/artifact/LVWByCqRkA3vF5DLrHaK9j) holds the round-1 page's helpers and kept parts, plus the
redraws (2–3 drawings each: coat, leather, camo, floral, robe, cap, capb, fire, riot, gas, buzz, frame, guitar,
cape) and replacement candidates for the dropped parts (groups with "pick N"). Round 2 rule from the designer: top
view with a slight lean (tall headgear shows its front face; a darker side wall under a top shifted back 0.08 r).
Each drawing also shows the 64 px tile the Story 7.10 editor would use. Picks save to `picks2/<slot>_<id>`.

## Round 3

`round-3.html` (claude.ai/artifact/Rw1Uys1tS9NB6d824JvJr9): round 2's page with cap and backwards cap again (long
brim, logo badge, strong lean; "Default colours" shows today's dark cap grey), viking horns out to the sides,
the guitar case behind the back (two placements), the lean on the headgear kept from round 1 (A as picked, B with
the lean), and one candidate pair each for milestones M5, M7, M8. The accent slot is gone. Picks: `picks3/<slot>_<id>`.
