import { describe, expect, it } from "vitest";
import { loadBalance, weaponIds } from "@topdown/shared";
import { PELLET_STREAK_SCALE, blastLengthFor, fireSfxFor, muzzleScaleFor, streakScales } from "./weaponLook";

const balance = loadBalance();

describe("weapon look (Story 5.3)", () => {
  it("each new gun has its own fire sound; the others keep the Pistol's", () => {
    expect(fireSfxFor("shotgun")).toBe("weapon_shotgun_fire");
    expect(fireSfxFor("assault_rifle")).toBe("weapon_assault_rifle_fire");
    expect(fireSfxFor("smg")).toBe("weapon_pistol_fire");
  });
  it("the Shotgun's flash is the biggest", () => {
    expect(muzzleScaleFor("shotgun")).toBeGreaterThan(muzzleScaleFor("assault_rifle"));
    expect(muzzleScaleFor("assault_rifle")).toBeGreaterThan(muzzleScaleFor("pistol"));
  });
  it("only the Shotgun draws a blast cone", () => {
    expect(blastLengthFor("shotgun")).toBeGreaterThan(0);
    expect(blastLengthFor("assault_rifle")).toBe(0);
  });

  it("only pellet guns draw short streaks", () => {
    const s = streakScales(balance);
    weaponIds(balance).forEach((id, i) => expect(s[i]).toBe(id === "shotgun" ? PELLET_STREAK_SCALE : 1));
  });
});
