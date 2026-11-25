import { describe, expect, it } from "vitest";
import { COSMETIC_SLOTS, COSMETICS, DEFAULT_LOOK, LOOK_CODE_MAX, type SurvivorLook } from "../config/cosmetics";
import { catalogueParts, decodeLook, encodeLook, ownedParts, partKey } from "./lookCode";

/** Every catalogue part counts as owned here (round trips); the real join uses `ownedParts()`. */
const ALL = catalogueParts();

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}
const hex6 = (r: () => number): string => Math.floor(r() * 0x1000000).toString(16).padStart(6, "0");

function withPart(slot: (typeof COSMETIC_SLOTS)[number], id: string, colours = DEFAULT_LOOK.colours): SurvivorLook {
  return { ...DEFAULT_LOOK, [slot]: id, colours };
}

describe("look code (Story 7.9 AC 2)", () => {
  it("writes the fixed v1 format, colours without # and lowercase", () => {
    expect(encodeLook(DEFAULT_LOOK)).toBe("v1|top:jacket|head:cap|hair:short|pack:backpack|skin:1|c:3c5670,231f1c,1f2326");
  });

  it("round-trips every one of the 51 parts with random colours", () => {
    const r = rng(7);
    expect(COSMETICS.parts).toHaveLength(51);
    for (const p of COSMETICS.parts) {
      const look = withPart(p.slot, p.id, { top: `#${hex6(r)}`, hair: `#${hex6(r)}`, accent: `#${hex6(r)}` });
      const code = encodeLook(look);
      expect(code.length).toBeLessThanOrEqual(LOOK_CODE_MAX);
      const back = decodeLook(code, ALL);
      expect(back.replaced).toBe(0);
      expect(back.look).toEqual(look);
    }
  });

  it("the longest legal look (every slot's longest id) fits in 96 characters", () => {
    const longest = {} as Record<string, string>;
    for (const slot of COSMETIC_SLOTS) {
      longest[slot] = COSMETICS.parts.filter((p) => p.slot === slot).reduce((a, b) => (b.id.length > a.length ? b.id : a), "");
    }
    const look = { ...(longest as unknown as SurvivorLook), colours: { top: "#ffffff", hair: "#ffffff", accent: "#ffffff" } };
    expect(encodeLook(look).length).toBeLessThanOrEqual(LOOK_CODE_MAX);
    // 8-character ids in every slot (the schema maximum) still fit
    const eight = { top: "abcdefgh", head: "abcdefgh", hair: "abcdefgh", pack: "abcdefgh", skin: "abcdefgh", colours: look.colours };
    expect(encodeLook(eight).length).toBe(94);
  });

  it("refuses to write a code over the bound", () => {
    expect(() => encodeLook({ ...DEFAULT_LOOK, top: "x".repeat(40) })).toThrow(RangeError);
  });
});

describe("decodeLook never fails (AC 3, L1)", () => {
  it("no look sent → the default look, nothing replaced", () => {
    for (const v of [undefined, null, ""]) expect(decodeLook(v)).toEqual({ look: DEFAULT_LOOK, replaced: 0 });
  });

  it("non-strings, over-long strings and other versions → the default look, all 8 replaced", () => {
    for (const v of [42, {}, ["v1"], true, "x".repeat(10_000), `v1|${"top:jacket|".repeat(1000)}`, "v2|top:hoodie", "V1|top:hoodie"]) {
      const d = decodeLook(v);
      expect(d.look).toEqual(DEFAULT_LOOK);
      expect(d.replaced).toBe(8);
    }
  });

  it("reads each slot on its own: a bad slot becomes its default, the rest is kept", () => {
    const d = decodeLook("v1|top:hoodie|head:RIOT|hair:mohawk|pack:nope|skin:5|c:ff0000,00ff00,0000ff");
    expect(d.look).toEqual({ top: "hoodie", head: "cap", hair: "mohawk", pack: "backpack", skin: "5", colours: { top: "#ff0000", hair: "#00ff00", accent: "#0000ff" } });
    expect(d.replaced).toBe(2);
  });

  it("each colour on its own: #-colours, uppercase, short or a wrong count → that colour's default", () => {
    const d = decodeLook("v1|top:hoodie|head:cap|hair:short|pack:none|skin:1|c:#ff0000,ABCDEF,123456");
    expect(d.look.colours).toEqual({ top: DEFAULT_LOOK.colours.top, hair: DEFAULT_LOOK.colours.hair, accent: "#123456" });
    expect(d.replaced).toBe(2);
    const two = decodeLook("v1|top:hoodie|head:cap|hair:short|pack:none|skin:1|c:ff0000,00ff00");
    expect(two.look.colours).toEqual(DEFAULT_LOOK.colours);
    expect(two.replaced).toBe(3);
  });

  it("fields in any order, unknown keys ignored, the first of a duplicate wins, spaces are not trimmed", () => {
    const d = decodeLook("v1|c:010203,040506,070809|skin:2|zzz:1|head:beanie|head:cap|pack:school|hair:buzz|top:track");
    expect(d.look).toEqual({ top: "track", head: "beanie", hair: "buzz", pack: "school", skin: "2", colours: { top: "#010203", hair: "#040506", accent: "#070809" } });
    expect(d.replaced).toBe(0);
    expect(decodeLook("v1|head:beanie |top:jacket").look.head).toBe("cap");
  });

  it("head:none and pack:none are different parts", () => {
    const d = decodeLook("v1|head:none|pack:none");
    expect(d.look.head).toBe("none");
    expect(d.look.pack).toBe("none");
    expect(decodeLook("v1|top:none").look.top).toBe("jacket");
    const owned = new Set([...ownedParts()].filter((k) => k !== "pack:none"));
    expect(decodeLook("v1|head:none|pack:none", owned).look).toMatchObject({ head: "none", pack: "backpack" });
  });

  it("fuzz: 1,000 random strings all decode to a full look that re-encodes within 96 characters", () => {
    const r = rng(42);
    const alphabet = "v1|:,abcdefghijklmnopqrstuvwxyz0123456789#ÉΩ😀 \u0000";
    const ids = COSMETICS.parts.map((p) => `${p.slot}:${p.id}`);
    for (let i = 0; i < 1000; i++) {
      let s = r() < 0.5 ? "v1|" : "";
      const n = Math.floor(r() * (i % 50 === 0 ? 10_000 : 120));
      for (let j = 0; j < n; j++) s += r() < 0.1 ? `${ids[Math.floor(r() * ids.length)]}|` : alphabet[Math.floor(r() * alphabet.length)];
      const d = decodeLook(s);
      for (const slot of COSMETIC_SLOTS) expect(typeof d.look[slot]).toBe("string");
      expect(d.replaced).toBeGreaterThanOrEqual(0);
      expect(d.replaced).toBeLessThanOrEqual(8);
      expect(encodeLook(d.look).length).toBeLessThanOrEqual(LOOK_CODE_MAX);
    }
  });
});

describe("ownership (AC 4, L2)", () => {
  it("ownedParts() is exactly the 31 starter parts", () => {
    const owned = ownedParts();
    expect(owned.size).toBe(31);
    for (const p of COSMETICS.parts) expect(owned.has(partKey(p.slot, p.id))).toBe(p.unlock === "starter");
  });

  it("a part not owned is drawn as the default part; once owned (7.11), it is kept", () => {
    const code = "v1|top:camo|head:riot|hair:short|pack:golf|skin:1|c:3c5670,231f1c,1f2326";
    const d = decodeLook(code);
    expect(d.look).toMatchObject({ top: "jacket", head: "cap", pack: "backpack" });
    expect(d.replaced).toBe(3);
    const later = decodeLook(code, ownedParts(["head:riot", "top:camo"]));
    expect(later.look).toMatchObject({ top: "camo", head: "riot", pack: "backpack" });
    expect(later.replaced).toBe(1);
  });

  it("catalogueParts() is every one of the 51 parts (the client's decode of state.look)", () => {
    expect(catalogueParts().size).toBe(51);
    expect(decodeLook("v1|head:prop", catalogueParts()).look.head).toBe("prop");
    expect(decodeLook("v1|head:prop").look.head).toBe("cap");
  });

  it("the default look is always owned and re-encodes to itself", () => {
    const code = encodeLook(DEFAULT_LOOK);
    expect(decodeLook(code)).toEqual({ look: DEFAULT_LOOK, replaced: 0 });
  });
});
