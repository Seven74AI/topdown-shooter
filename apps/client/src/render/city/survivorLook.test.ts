import { describe, expect, it } from "vitest";
import { DEFAULT_LOOK } from "@topdown/shared";
import { CHAR } from "./spriteArt";
import { DEFAULT_RESOLVED_LOOK, lightSat, nightMute, resolveLook, stageDim } from "./survivorLook";

const PINK = "#ff3fa0";

describe("survivor look colours (Story 7.8)", () => {
  it("the default look keeps today's CHAR colours, unmuted", () => {
    expect(DEFAULT_RESOLVED_LOOK.colours).toEqual({ top: CHAR.jacket, hair: CHAR.hair, accent: CHAR.cap, skin: CHAR.survivorSkin });
    expect(DEFAULT_RESOLVED_LOOK).toMatchObject({ top: "jacket", head: "cap", hair: "short", pack: "backpack", acc: "none", skin: "1", hidesHair: true, stage: 1 });
  });

  it("a chosen colour gets darker and less saturated at night", () => {
    const m = nightMute(PINK);
    expect(m).toMatch(/^#[0-9a-f]{6}$/);
    expect(lightSat(m).l).toBeLessThan(lightSat(PINK).l - 0.1);
    expect(lightSat(m).s).toBeLessThan(lightSat(PINK).s - 0.05);
    const r = resolveLook({ ...DEFAULT_LOOK, colours: { ...DEFAULT_LOOK.colours, top: PINK } });
    expect(r.colours.top).toBe(m);
    expect(r.colours.hair).toBe(CHAR.hair);
  });

  it("stage 1 adds no dim; later stages dim more", () => {
    expect(stageDim(PINK, 1)).toBe(PINK);
    expect(stageDim(CHAR.jacket, 1)).toBe(CHAR.jacket);
    const l = [1, 2, 3, 4, 5].map((s) => lightSat(stageDim(PINK, s)).l);
    for (let i = 1; i < 5; i++) expect(l[i]).toBeLessThan(l[i - 1] as number);
    const late = resolveLook(DEFAULT_LOOK, 5);
    expect(lightSat(late.colours.top).l).toBeLessThan(lightSat(CHAR.jacket).l);
    expect(lightSat(late.colours.skin).l).toBeLessThan(lightSat(CHAR.survivorSkin).l);
  });

  it("an unknown part id falls back to the default part; hood hides the hair, bandana doesn't", () => {
    expect(resolveLook({ ...DEFAULT_LOOK, head: "crown", pack: "jetpack" })).toMatchObject({ head: "cap", pack: "backpack" });
    expect(resolveLook({ ...DEFAULT_LOOK, head: "hood" }).hidesHair).toBe(true);
    expect(resolveLook({ ...DEFAULT_LOOK, head: "bandana" }).hidesHair).toBe(false);
    expect(resolveLook({ ...DEFAULT_LOOK, skin: "8" }).colours.skin).toBe("#4a2f21");
  });
});
