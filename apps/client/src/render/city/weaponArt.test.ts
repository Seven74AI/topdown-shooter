import { describe, expect, it } from "vitest";
import { cardCatalog, loadBalance } from "@topdown/shared";
import { SURVIVOR_WEAPON_FRAMES } from "./spriteAtlas";
import { WEAPON_ART, WEAPON_ICON_ART, hasWeaponIcon } from "./weaponArt";

/** A 2D context that records the drawing calls (no canvas in the test environment). */
function recordingContext(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const calls: string[] = [];
  const gradient = { addColorStop: () => undefined };
  const ctx = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key in target) return target[key];
      if (key === "getTransform") return () => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 });
      return () => {
        calls.push(String(key));
        return gradient;
      };
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

describe("early weapon card art (Story 5.28)", () => {
  it("every weapon the card shop can offer has side-view art (no pictogram fallback)", () => {
    const weapons = cardCatalog(loadBalance()).filter((c) => c.kind === "weapon");
    expect(weapons.map((w) => w.id)).toEqual(expect.arrayContaining(["smg", "hunting_rifle", "machete"]));
    for (const w of weapons) expect(hasWeaponIcon(w.id), w.id).toBe(true);
  });

  it("SMG, Hunting Rifle and Machete are icon-only: no held view, so no survivor frame of their own", () => {
    expect(Object.keys(WEAPON_ICON_ART).sort()).toEqual(["hunting_rifle", "machete", "smg"]);
    for (const id of Object.keys(WEAPON_ICON_ART)) {
      expect(WEAPON_ART[id], id).toBeUndefined();
      expect(SURVIVOR_WEAPON_FRAMES[id], id).toBeUndefined();
    }
  });

  it("each icon draws shaded parts and leaves the context balanced (save = restore)", () => {
    for (const [id, draw] of Object.entries(WEAPON_ICON_ART)) {
      const { ctx, calls } = recordingContext();
      draw(ctx, 88);
      const count = (k: string) => calls.filter((c) => c === k).length;
      expect(count("fill"), id).toBeGreaterThan(10);
      expect(count("save"), id).toBe(count("restore"));
    }
  });
});
