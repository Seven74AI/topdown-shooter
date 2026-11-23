import { describe, expect, it } from "vitest";
import { gearIds, loadBalance } from "@topdown/shared";
import { GEAR_ICON_FRAMES, gearIconFramesFor } from "./gearIcons";

describe("gear icons (Story 5.11, AC 3)", () => {
  const ids = gearIds(loadBalance());
  it("every gear item has an atlas frame (category_name_variant)", () => {
    for (const id of ids) expect(GEAR_ICON_FRAMES[id]).toMatch(/^icon_gear_[a-z0-9]+_a$/);
  });

  it("HUD frames follow the owned mask in the fixed gear.json order; the output array is reused", () => {
    const out: string[] = [];
    expect(gearIconFramesFor(ids, 0, out)).toEqual([]);
    expect(gearIconFramesFor(ids, 4 | 1, out)).toEqual(["icon_gear_armor1_a", "icon_gear_shoes_a"]);
    const again = gearIconFramesFor(ids, 2 | 8 | 16, out);
    expect(again).toBe(out);
    expect(again).toEqual(["icon_gear_armor2_a", "icon_gear_revivekit_a", "icon_gear_flashlight_a"]);
  });
});
