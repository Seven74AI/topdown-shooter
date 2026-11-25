import { describe, expect, it } from "vitest";
import { BOSS_AMBER, BOSS_ARRIVED_BANNER, BOSS_CRASH_BANNER, BOSS_CRASH_BANNER_MS, BOSS_ENRAGED_BANNER, BOSS_RED, BOSS_WARNING_BANNER, bossCue, evacSubtitle, type BossCue } from "./bossCue";

const out: BossCue = { banner: "", bannerColor: "", bannerMs: 0, sound: "", shake: false, buzz: false, music: "" };

describe("Story 6.5 boss cues", () => {
  it("warning: rumble; arrival: roar + music (the banner is the HUD's P1 warning display, no text banner)", () => {
    expect(bossCue({ type: "boss.warning", x: 0, y: 0, hitTick: 80 }, "p0", 0, 0, out)).toMatchObject({ banner: "", sound: "boss_rumble" });
    expect(BOSS_WARNING_BANNER).toBe("");
    expect(bossCue({ type: "boss.arrived", x: 0, y: 0, maxHp: 1, look: 0 }, "p0", 0, 0, out)).toMatchObject({ banner: "", sound: "boss_roar", music: "start" });
    expect(BOSS_ARRIVED_BANNER).toBe("");
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
    expect(bossCue({ type: "boss.target_changed", playerId: "p0", ageS: 5 }, "p0", 0, 0, out).buzz).toBe(false); // review L5: stale
  });
});

describe("Stories 6.6 + 6.7 boss cues", () => {
  const tele = (kind: number, ageS?: number) => ({ type: "boss.telegraph" as const, attackId: 1, kind, startTick: 0, hitTick: 20, cx: 0, cy: 0, radiusM: 0, endX: 0, endY: 0, crash: false, src: 0, srcX: 0, srcY: 0, ...(ageS ? { ageS } : {}) });
  it("charge scrape, throw lift, nothing for a slam's telegraph; none when stale", () => {
    expect(bossCue(tele(2), "p0", 0, 0, out).sound).toBe("boss_charge_scrape");
    expect(bossCue(tele(3), "p0", 0, 0, out).sound).toBe("boss_throw_lift");
    expect(bossCue(tele(1), "p0", 0, 0, out).sound).toBe("");
    expect(bossCue(tele(2, 5), "p0", 0, 0, out).sound).toBe("");
  });
  it("D6: CRASH! in amber for 1.2 s + the crash sound + a shake near it", () => {
    expect(bossCue({ type: "boss.crashed", attackId: 1, x: 0, y: 0 }, "p0", 3, 0, out)).toMatchObject({ banner: BOSS_CRASH_BANNER, bannerColor: BOSS_AMBER, bannerMs: BOSS_CRASH_BANNER_MS, sound: "boss_crash", shake: true });
    expect(BOSS_CRASH_BANNER_MS).toBe(1200);
  });
  it("the impact: sound and a shake within 8 m", () => {
    expect(bossCue({ type: "boss.thrown_impact", attackId: 1, x: 0, y: 0 }, "p0", 7, 0, out)).toMatchObject({ sound: "boss_throw_impact", shake: true });
    expect(bossCue({ type: "boss.thrown_impact", attackId: 1, x: 0, y: 0 }, "p0", 9, 0, out).shake).toBe(false);
  });
  it("6.7: ENRAGED in red (never late for a woken tab); EVAC INBOUND in amber with the finisher, even for a woken tab (no late sound)", () => {
    expect(bossCue({ type: "boss.enraged", x: 0, y: 0 }, "p0", 0, 0, out)).toMatchObject({ banner: BOSS_ENRAGED_BANNER, bannerColor: BOSS_RED, sound: "boss_roar_enrage" });
    expect(bossCue({ type: "boss.enraged", x: 0, y: 0, ageS: 9 }, "p0", 0, 0, out)).toMatchObject({ banner: "", sound: "" });
    expect(bossCue({ type: "boss.killed", killerId: "p1", weapon: "smg", x: 0, y: 0, number: 1 }, "p0", 0, 0, out, "Sam", 150)).toMatchObject({ banner: "EVAC INBOUND\n+150 to everyone\nSam finished it", bannerColor: BOSS_AMBER, sound: "boss_death" });
    expect(bossCue({ type: "boss.killed", killerId: null, weapon: "", x: 0, y: 0, number: 1, ageS: 9 }, "p0", 0, 0, out, "", 150)).toMatchObject({ banner: "EVAC INBOUND\n+150 to everyone", sound: "" });
    expect(evacSubtitle("", 150)).toBe("+150 to everyone");
  });
});
