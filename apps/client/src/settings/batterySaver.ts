import { BATTERY_SAVER_FPS } from "@topdown/shared";
import { getSettings, subscribeSettings } from "./settings";

/**
 * Story 10.3-Q1 A (AC 5): Battery saver draws at most `BATTERY_SAVER_FPS` (30) frames a second. It wraps Phaser's
 * loop callback (`TimeStep.callback` = `game.step`: the scenes' update and the draw): a display frame that comes too
 * soon after the last drawn one is skipped, and the next drawn frame gets the whole time since (so every second of
 * wall time still reaches the scenes; the sim hosts step 20 Hz ticks from that time, `LocalSimHost.update` /
 * `NetSimHost.update`). Applied at once on a change, no reload.
 *
 * Not Phaser's own `fps.limit` / `setFPSLimit`: it draws when the time since the last draw is ≥ 1000 / 30 ms exactly,
 * so a 60 Hz display whose two frames add up to 33.3 ms (rAF timestamps are rounded) skips a third frame now and then
 * (a 50 ms frame, then a 16 ms one), and it keeps the remainder after passing it on (time counted twice).
 */
const FRAME_MS = 1000 / BATTERY_SAVER_FPS;
/** rAF jitter allowance: on 60 Hz two frames always pass, one never does (16.7 < 29.3 ≤ 33.3). */
const SLACK_MS = 4;

/** What the cap needs of Phaser's loop (tests pass a fake). */
export interface CappableLoop {
  callback: (time: number, delta: number) => void;
}

/** The cap's state: on while Battery saver is (the quality check reads it too: 10.3 review H). */
export const frameCap = { on: false };

/**
 * Wraps `loop.callback` once (call after the game booted: Phaser sets the callback in `loop.start`). The wrapper is
 * one closure made here; per display frame it only adds numbers.
 */
export function capFrames(loop: CappableLoop): void {
  const draw = loop.callback;
  let sinceDrawMs = 0;
  loop.callback = (time, delta) => {
    if (!frameCap.on) {
      // Review L3: the saver just turned off between two drawn frames: the skipped frames' time goes into this one.
      const d = delta + sinceDrawMs;
      sinceDrawMs = 0;
      draw(time, d);
      return;
    }
    sinceDrawMs += delta;
    if (sinceDrawMs < FRAME_MS - SLACK_MS) return;
    const d = sinceDrawMs;
    sinceDrawMs = 0;
    draw(time, d);
  };
}

/** Follows the setting; returns the unsubscribe. */
export function bindBatterySaver(): () => void {
  frameCap.on = getSettings().batterySaver;
  return subscribeSettings((s) => {
    frameCap.on = s.batterySaver;
  });
}
