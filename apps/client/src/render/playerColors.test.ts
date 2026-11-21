import { describe, expect, it } from "vitest";
import { MAX_PLAYERS } from "@topdown/shared";
import { SLOT_COLORS, SLOT_COLOR_CSS, SLOT_COLOR_NAMES } from "./playerColors";

describe("slot colors", () => {
  it("has one distinct color per slot, the same in Phaser and CSS form", () => {
    expect(SLOT_COLORS).toHaveLength(MAX_PLAYERS);
    expect(SLOT_COLOR_CSS).toHaveLength(MAX_PLAYERS);
    expect(SLOT_COLOR_NAMES).toEqual(["Blue", "Orange", "Green", "Purple"]);
    expect(new Set(SLOT_COLORS).size).toBe(MAX_PLAYERS);
    SLOT_COLORS.forEach((c, i) => expect(SLOT_COLOR_CSS[i]).toBe(`#${c.toString(16).padStart(6, "0")}`));
  });
});
