import { describe, expect, it } from "vitest";
import { BOSS_ARRIVED_BANNER, BOSS_WARNING_BANNER, bossCue, type BossCue } from "./bossCue";

const out: BossCue = { banner: "", sound: "", shake: false, buzz: false, music: "" };

describe("Story 6.5 boss cues", () => {
  it("warning: banner + rumble; arrival: banner + roar + music", () => {
    expect(bossCue({ type: "boss.warning", x: 0, y: 0, hitTick: 80 }, "p0", 0, 0, out)).toMatchObject({ banner: BOSS_WARNING_BANNER, sound: "boss_rumble" });
    expect(bossCue({ type: "boss.arrived", x: 0, y: 0, maxHp: 1, look: 0 }, "p0", 0, 0, out)).toMatchObject({ banner: BOSS_ARRIVED_BANNER, sound: "boss_roar", music: "start" });
  });
  it("a woken tab's backlog: no late banner or sound (the music follows the state)", () => {
    expect(bossCue({ type: "boss.warning", x: 0, y: 0, hitTick: 80, ageS: 5 }, "p0", 0, 0, out)).toMatchObject({ banner: "", sound: "" });
    expect(bossCue({ type: "boss.arrived", x: 0, y: 0, maxHp: 1, look: 0, ageS: 5 }, "p0", 0, 0, out)).toMatchObject({ banner: "", sound: "", music: "start" });
    expect(bossCue({ type: "boss.slammed", attackId: 1, x: 0, y: 0, ageS: 5 }, "p0", 0, 0, out)).toMatchObject({ sound: "", shake: false });
  });
  it("the slam shakes within 12 m; the target's buzz is for the new target only", () => {
    expect(bossCue({ type: "boss.slammed", attackId: 1, x: 0, y: 0 }, "p0", 11, 0, out).shake).toBe(true);
    expect(bossCue({ type: "boss.slammed", attackId: 1, x: 0, y: 0 }, "p0", 13, 0, out).shake).toBe(false);
    expect(bossCue({ type: "boss.target_changed", playerId: "p0" }, "p0", 0, 0, out).buzz).toBe(true);
    expect(bossCue({ type: "boss.target_changed", playerId: "p1" }, "p0", 0, 0, out).buzz).toBe(false);
  });
});
