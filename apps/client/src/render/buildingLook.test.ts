import { describe, expect, it } from "vitest";
import type { Building } from "@topdown/shared";
import { damageStage, darken, hpChecksum } from "./buildingLook";

const b = (id: number, hp: number) => ({ id, hp }) as Building;

describe("building look (Story 3.5)", () => {
  it("review L3: the redraw key changes when one building loses X and another gains X", () => {
    expect(hpChecksum([b(1, 100), b(2, 150)])).not.toBe(hpChecksum([b(1, 90), b(2, 160)]));
    expect(hpChecksum([b(1, 100), b(2, 150)])).toBe(hpChecksum([b(1, 100), b(2, 150)]));
    expect(hpChecksum([b(1, 100)])).not.toBe(hpChecksum([b(2, 100)]));
  });

  it("damage stages and darkening", () => {
    expect(damageStage(1)).toBe(0);
    expect(damageStage(0.99)).toBe(1);
    expect(damageStage(0.5)).toBe(3);
    expect(damageStage(0.1)).toBe(4);
    expect(darken(0x808080, 0)).toBe(0x808080);
    expect(darken(0x808080, 0.5)).toBe(0x404040);
    expect(darken(0xffffff, 1)).toBe(0);
  });
});
