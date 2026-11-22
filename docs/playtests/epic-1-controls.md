# Epic 1 controls playtest (Story 1.12)

Goal: check that moving, aiming, auto-fire, aim assist, swapping and **melee under twin-stick** feel right on real phones before we build online co-op on top of them.

## Links

Open on your phone, in **landscape**. Both links start the run with a fixed pair of weapons. `tune=1` adds a **Tune** button for adjusting controls live.

| Loadout | Link |
| --- | --- |
| Pistol + Machete | https://hordes.sevend.io/?loadout=pistol,machete&tune=1 |
| SMG + Hunting Rifle | https://hordes.sevend.io/?loadout=smg,hunting_rifle&tune=1 |

The links show the build last deployed to the VPS (`deploy/deploy.sh`). GitHub Pages was retired on 2026-11-22.

Extras:
- `&debug=1` shows FPS and load.
- `?stress=150` runs the 150-Walker performance test (Story 1.11): after 60 s, press **Copy results** and paste them into `docs/perf/epic-1-stress.md`.

## How to play

- **Left thumb, anywhere on the left half:** move.
- **Right thumb, anywhere on the right half:** aim. Push past about a third of the stick to fire automatically.
- **⇄ button (bottom right):** swap your two weapons.
- Play **3 waves with each loadout**.

## Form (one per tester)

Copy this block and fill it in.

```
Tester:
Phone + browser:
Waves reached — Pistol + Machete:      SMG + Hunting Rifle:

Rate 1 (bad) to 5 (great), plus one sentence:
- Move stick:
- Aim stick:
- Auto-fire:
- Aim assist (shots bending toward zombies):
- Swap button:
- Melee (Machete):

What felt wrong:
Did you change anything in Tune? Paste "Copy values":
```

## Results

_(testers' forms go here)_

## Decisions

_Filled in with the designer after the playtest. For each issue: tune (change balance) or new story._

- Melee under twin-stick: **keep / tune / change**: _
- Notes for the 1.12 tuning:
  - The Machete swings from the survivor's center, so its reach past the body is about 1.4 m.
  - Every Machete hit kills a Walker (12 dmg against 10 HP), so pushback isn't visible yet.

## Tuning changes

_Balance values changed after the playtest, with the reason for each._
