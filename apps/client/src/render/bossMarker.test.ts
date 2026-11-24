import { describe, expect, it } from "vitest";
import { BOSS_ATTACK, BOSS_STATE } from "@topdown/shared";
import { bossMarker, type BossMarker } from "./bossMarker";

const out: BossMarker = { visible: false, x: 0, y: 0, angle: 0, pulse: false, icon: 0 };

describe("Story 6.5 boss edge marker", () => {
  it("off screen: at the edge on the centre line; on screen or no boss: none", () => {
    bossMarker(BOSS_STATE.WALK, 0, 2000, 160, 568, 320, 30, out);
    expect(out.visible).toBe(true);
    expect(out.x).toBeCloseTo(568 - 30, 6);
    expect(out.y).toBeCloseTo(160, 6);
    expect(out.pulse).toBe(false);
    expect(bossMarker(BOSS_STATE.WALK, 0, 200, 160, 568, 320, 30, out).visible).toBe(false);
    expect(bossMarker(BOSS_STATE.NONE, 0, 2000, 160, 568, 320, 30, out).visible).toBe(false);
    expect(bossMarker(BOSS_STATE.DEAD, 0, 2000, 160, 568, 320, 30, out).visible).toBe(false);
  });

  it("pulses during the warning and a telegraph, with the attack's icon", () => {
    expect(bossMarker(BOSS_STATE.WARNING, 0, -100, -100, 568, 320, 30, out)).toMatchObject({ visible: true, pulse: true, icon: 0 });
    expect(bossMarker(BOSS_STATE.TELEGRAPH, BOSS_ATTACK.SLAM, -100, 50, 568, 320, 30, out)).toMatchObject({ visible: true, pulse: true, icon: BOSS_ATTACK.SLAM });
    expect(bossMarker(BOSS_STATE.RECOVER, BOSS_ATTACK.SLAM, -100, 50, 568, 320, 30, out)).toMatchObject({ pulse: false, icon: 0 });
  });
});
