import { afterEach, describe, expect, it, vi } from "vitest";
import { cardCatalog, loadBalance } from "@topdown/shared";
import { SURVIVOR_WEAPON_FRAMES } from "./spriteAtlas";
import {
  drawHuntingRifle,
  drawHuntingRifleLever,
  drawHuntingRifleSynthetic,
  drawMachete,
  drawMacheteKukri,
  drawMachetePanga,
  drawSmg,
  drawSmgDrum,
  drawSmgSuppressed,
  WEAPON_ART,
  WEAPON_ICON_ART,
  WEAPON_TIER_ICON,
  WEAPON_TOP_TIER_ICON,
  weaponIconUrl,
} from "./weaponArt";

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
  afterEach(() => vi.unstubAllGlobals());

  it("weaponIconUrl returns art for every weapon the card shop can offer (no pictogram fallback), drawn once then cached", () => {
    const createElement = vi.fn(() => ({ width: 0, height: 0, getContext: () => recordingContext().ctx, toDataURL: () => "data:image/png;base64,AA" }));
    vi.stubGlobal("document", { createElement });
    const weapons = cardCatalog(loadBalance()).filter((c) => c.kind === "weapon");
    expect(weapons.map((w) => w.id)).toEqual(expect.arrayContaining(["smg", "hunting_rifle", "machete"]));
    for (const w of weapons) {
      const before = createElement.mock.calls.length;
      expect(weaponIconUrl(w.id), w.id).toBe("data:image/png;base64,AA");
      expect(weaponIconUrl(w.id), w.id).toBe("data:image/png;base64,AA");
      expect(createElement.mock.calls.length - before, w.id).toBe(1); // the second call is cached: no new canvas
    }
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

  it("upgrade-tier looks (designer 2026-11-24): SMG S1 → S2 → S3, Hunting Rifle H2 → H1 → H3, Machete M2 → M1 → M3", () => {
    expect(WEAPON_ICON_ART.smg).toBe(drawSmg);
    expect(WEAPON_ICON_ART.hunting_rifle).toBe(drawHuntingRifleLever);
    expect(WEAPON_ICON_ART.machete).toBe(drawMachetePanga);
    const looks: [string, (c: CanvasRenderingContext2D, s: number) => void, (c: CanvasRenderingContext2D, s: number) => void][] = [
      ["smg", drawSmgSuppressed, drawSmgDrum],
      ["hunting_rifle", drawHuntingRifle, drawHuntingRifleSynthetic],
      ["machete", drawMachete, drawMacheteKukri],
    ];
    for (const [id, tier, top] of looks) {
      for (const [map, want] of [[WEAPON_TIER_ICON, tier], [WEAPON_TOP_TIER_ICON, top]] as const) {
        // the maps wrap the drawing; check that the wrapper draws the same calls as the named look
        const a = recordingContext(); map[id]?.(a.ctx, 88);
        const b = recordingContext(); want(b.ctx, 88);
        expect(a.calls.length, id).toBeGreaterThan(10);
        expect(a.calls, id).toEqual(b.calls);
      }
    }
  });

  it("levels I–II, III and IV give three different cached icons for the early weapons", () => {
    const createElement = vi.fn(() => ({ width: 0, height: 0, getContext: () => recordingContext().ctx, toDataURL: () => `data:image/png;base64,${createElement.mock.calls.length}` }));
    vi.stubGlobal("document", { createElement });
    for (const id of ["smg", "hunting_rifle", "machete"]) {
      const urls = [1, 2, 3, 4].map((lvl) => weaponIconUrl(id, lvl));
      expect(urls[0], id).toBe(urls[1]);
      expect(new Set(urls).size, id).toBe(3);
    }
  });
});
