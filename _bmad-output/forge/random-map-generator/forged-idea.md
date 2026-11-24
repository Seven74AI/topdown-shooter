# Forged idea: Random city (map generator)

Outcome: **HARDENED** (2026-11-24). Source log: `.memlog.md` in this folder.

## Decisions (locked)

- **Fully generated city each run**: street plan (avenue, T, parallel streets, dead end…), block sizes and building footprints come from rules. No hand-made blocks.
- **Output = a normal `DistrictMap`** (solids, cover, spawns, hazards, decay groups with `pick N`), so `applyDecayStage`, server, prediction and replays stay unchanged.
- **Built in shared code from the run seed**: the server sends the seed, every client builds the same city. No map download.
- **Size 70 × 70 m** (3.2× Downtown), to leave room for street shapes. Waves and spawns get rebalanced so fights stay as dense as Downtown's.
- **Decay = generic rules + landmark recipes.** Generic: curb cars move into the road, cars burn, police lines, manholes and windows open. A recipe is a rule set that builds a landmark in any size and position, with its own stage events.
- **Spawns, a mix**: stage 1 from the city edges only; from stage 2, spawns near the group also open (about 15–35 m away, never within 6 m). The generator spreads spawn points across the city.
- **Each city must pass checks A–G, or it is rejected and regenerated**: A never seals off an area (any stage or variant); B every spawn reaches the players; C an open start area near the middle, buildable in wave 1, never hit by decay; D cover spread out (no empty 15 × 15 m square); E at least 2–3 choke points; F no spawn path that traps zombies; G streets at least 3 m wide. A and B already exist as Downtown tests.
- **Lobby**: the host picks Downtown or Random city. Results shows a **city code** the host can type to replay or share that city.
- **Random city is open from the start**, with no unlock. The District 2 rule (FR81 / Story 7.7) is unchanged.
- **First version**: generated streets, plain buildings, cars, barriers, generic decay, and **one recipe: the gas station** (kiosk, pumps, stage-2 gas leak). Art is drawn by type and any size.

## Rejected

- Downtown variants only, or cities assembled from hand-made blocks (incl. the hybrid with hand-made blocks in generated lots): the user wants a fully rule-generated city.
- Two separate modes ("assembled" vs "wild"): two generators to build.
- City preview with reroll: extra UI, spoils discovery.
- Check H (cover visible on the first screen): dropped.

## Open risks

- Waves 1–2 may feel thin on 70 × 70 with edge-only spawns.
- Retuning for 3.2× the area: the 150 alive cap and the pathfinding rebuild budget (19,600 cells vs 6,144).
- New players may skip Downtown, the hand-made first city.
- Client art is keyed to specific Downtown objects (`drawCity.ts` looks up `bus_glass` and `canopy` by name); the generated city needs art drawn by type.
