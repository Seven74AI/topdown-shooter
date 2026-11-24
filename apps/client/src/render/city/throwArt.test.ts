import { describe, expect, it } from "vitest";
import { isFrameName, packAtlas } from "./atlasLayout";
import { HAND_GRENADE_FRAMES, MOLOTOV_FRAMES, MOLOTOV_RAG_X_M, throwFxSpecs } from "./throwArt";
import { CONSUMABLE_ICON_FRAMES } from "./consumableIcons";
import { ITEM_ICONS } from "./itemIcons";
import { loadBalance, consumableIds } from "@topdown/shared";

describe("throw art + consumable icons (Story 5.12, brief 12)", () => {
  it("three hand grenades (HG1–3) and three bottles (MB1–3), category_name_variant frames in one atlas ≤ 2048²", () => {
    expect(HAND_GRENADE_FRAMES).toEqual(["fx_handgrenade_a", "fx_handgrenade_b", "fx_handgrenade_c"]);
    expect(MOLOTOV_FRAMES).toEqual(["fx_molotov_a", "fx_molotov_b", "fx_molotov_c"]);
    expect(MOLOTOV_RAG_X_M).toHaveLength(3);
    const layout = packAtlas(throwFxSpecs());
    expect(layout.width).toBeLessThanOrEqual(2048);
    expect(layout.height).toBeLessThanOrEqual(2048);
  });

  it("every consumable has a CI4 drawing and an icon frame", () => {
    for (const id of consumableIds(loadBalance())) {
      expect(ITEM_ICONS[id], id).toBeDefined();
      expect(isFrameName(CONSUMABLE_ICON_FRAMES[id] as string), id).toBe(true);
    }
  });
});
