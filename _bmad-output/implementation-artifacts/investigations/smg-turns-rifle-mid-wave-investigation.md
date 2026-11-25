# Investigation: SMG "turns into the hunting rifle" mid-wave, restored at wave end

## Hand-off Brief

1. **What happened.** While firing the SMG (loadout: SMG and pistol), the player saw the aim change to something like the hunting rifle with "a bit of sniper vision". It stayed that way for the rest of the wave and went back to the SMG when the wave ended. This is the playtester's account (Hypothesized). No logs or replay exist.
2. **Where the case stands.** Active, with little evidence. No code path puts a hunting rifle into a loadout during a wave. The best-fitting candidate is the Power Failure event: it starts mid-wave, lasts exactly until the wave ends, and adds a flashlight cone around the aim.
3. **What's needed next.** Ask the playtester four short questions (see Missing Evidence). Then try to reproduce with a forced power failure on wave 6.

## Case Info

| Field            | Value                                                    |
| ---------------- | -------------------------------------------------------- |
| Ticket           | N/A (verbal playtest report)                             |
| Date opened      | 2026-11-25                                               |
| Status           | Active (evidence-light)                                  |
| System           | Branch `claude/adoring-brahmagupta-4s3m7a`, HEAD `2a88929` |
| Evidence sources | User report; source code                                 |

## Problem Statement

> "I had the SMG and a pistol. At some point, when I was firing with the SMG, the aim turned into the one of the hunting rifle with the sniper vision a little bit … it wasn't the SMG anymore. It was stuck with that during the whole wave, and when the wave ended, I got my SMG back."

The report has three parts, each treated as unconfirmed: (a) the weapon changed, (b) something about vision changed ("sniper vision"), (c) it was fixed when the wave ended.

## Evidence Inventory

| Source                     | Status    | Notes                                                                 |
| -------------------------- | --------- | --------------------------------------------------------------------- |
| User description           | Available | Verbal and imprecise. No screenshot.                                  |
| Logs / replay / video      | Missing   | No capture of the session.                                            |
| Session details            | Missing   | Solo or online? Which wave? Any banner? Did the HUD weapon label change? |
| Source code                | Available | See trace below.                                                      |

## Confirmed Findings

### Finding 1: No camera zoom or scope per weapon
**Evidence:** `apps/client/src/scenes/GameScene.ts:2019-2020`. Zoom comes only from `pixelsPerMeter(width, height)`.
**Detail:** There is no "sniper view" tied to a weapon. The hunting rifle differs from the SMG only in stats (`packages/shared/src/config/balance/weapons.json:33-46`: range 17 m, 1.2 shots/s, 0 spread, pierce 5, screen shake), its sprite and its sound.

### Finding 2: The only ways to change a weapon mid-wave are the slot swap and the supply-drop crate
**Evidence:** `packages/shared/src/economy/shop.ts:250-272` (`giveCrateWeapon`), `packages/shared/src/events/supplyDrop.ts:20-26,129-130`.
**Detail:** The crate auto-claims after standing within 0.8 m of it for 1 s. With both slots full, it **replaces the active slot**. The crate pool is flamethrower, gas_torch, grenade_launcher, chainsaw and assault_rifle (`packages/shared/src/config/balance/events.json:25`). **The hunting rifle is not in the pool.** The change is **permanent**: nothing restores the old slot at wave end (grep for crate restore and saved-slot code: no hits).

### Finding 3: Power Failure goes dark mid-wave and ends exactly at wave end
**Evidence:** `packages/shared/src/events/powerFailure.ts:7-19`. Waves 6/7/8 (`events.json:26`). Light drops to 20 % (`decay.json` `blackout.powerFailureLightPct`).
**Detail:** It runs FLICKER (2 s) then DARK "until the wave ends; the wave's end clears the flag". While dark, each survivor gets a flashlight cone along their aim: 60°, 8 m (`packages/shared/src/player/flashlight.ts`, `player.json:11`). The survivor body is moved above the darkness layer (`apps/client/src/render/PlayerView.ts:155-164`).

## Deduced Conclusions

### Deduction 1: A real weapon change does not fit the reported recovery
**Based on:** Findings 1 and 2.
**Reasoning:** A crate weapon stays after the wave, and the hunting rifle cannot come from a crate. A slot swap would not undo itself at wave end. So if the SMG really "came back at wave end", the loadout most likely never changed. What changed was how the scene looked.

### Deduction 2: Power Failure matches the timing and the "vision" part exactly
**Based on:** Finding 3.
**Reasoning:** It starts at an arbitrary moment mid-wave, while the player is firing. It adds a narrow lit cone that follows the aim, which reads as a "scope / sniper vision". It lasts the rest of the wave and clears at wave end. The darkness also hides the SMG's short tracers and the surroundings, and the survivor sprite is re-layered. That could make the gun look different.

## Hypothesized Paths

### Hypothesis 1: Power Failure blackout mistaken for a weapon change
**Status:** Open (leading)
**Theory:** The tester was on wave 6, 7 or 8 (or an even endless wave). "POWER FAILURE" fired, and the flashlight cone plus darkness felt like a scoped rifle.
**Would confirm:** The tester recalls a "POWER FAILURE" banner, flickering lamps or a dark screen. The HUD weapon label still said SMG. It reproduces on a forced power failure.
**Would refute:** The HUD label or icon showed another weapon, or the shots really changed (slow, single, piercing, screen shake).

### Hypothesis 2: Supply-drop crate replaced the active SMG
**Status:** Open (unlikely)
**Theory:** The tester walked over a crate while firing. The assault rifle (level-2 look) replaced the active SMG and was mistaken for the hunting rifle.
**Would confirm:** A "SUPPLY DROP" banner, the crate-taken chime, or the HUD showing "Assault Rifle".
**Would refute:** The SMG coming back at wave end. The code never restores it, so if it truly came back, this hypothesis is out (or there is a second bug).

### Hypothesis 3: Client-side display desync (online only)
**Status:** Open (unexamined)
**Theory:** The client's predicted weapon state (`apps/client/src/sim/NetSimHost.ts` fire clock / `moveWeapon`) or the HUD weapon cache (`GameScene.ts:2348-2351`) shows the wrong weapon until a resync at the phase change.
**Would confirm:** It only happens online. The server's loadout says SMG while the client draws or shoots something else.
**Would refute:** It happened in solo (`LocalSimHost`, no prediction).

## Missing Evidence

| Gap                                              | Impact                     | How to Obtain       |
| ------------------------------------------------ | -------------------------- | ------------------- |
| Which wave number?                               | 6–8 strongly favours H1    | Ask the tester      |
| Banner seen ("POWER FAILURE" / "SUPPLY DROP")?   | Separates H1 and H2        | Ask the tester      |
| What changed: HUD label, gun sprite, shot behaviour, or the lit area? | Separates visual from real | Ask the tester |
| Solo or online?                                  | Rules H3 in or out         | Ask the tester      |

## Reproduction Plan

1. **H1:** Start a solo run with an SMG + pistol loadout (URL loadout option, `apps/client/src/debug/urlOptions.ts`). Play wave 6, or force the power-failure event with the dev event tools (`packages/shared/src/events/devEvents.ts`). Fire the SMG through the flicker and watch the view. Ask the tester whether it matches.
2. **H2:** Force a supply drop with the assault rifle while holding the SMG with both slots full. Stand on it while firing. Expect the SMG to be replaced and **not** to come back at wave end.

## Conclusion

**Confidence:** Low (hypothesized; clear data gap).
No code path lets the hunting rifle appear mid-wave and then revert at wave end. The Power Failure blackout is the only mechanic that starts mid-wave, adds an aim-following cone, and ends exactly at wave end. It is the leading explanation, so this is likely a readability issue rather than a loadout bug.
