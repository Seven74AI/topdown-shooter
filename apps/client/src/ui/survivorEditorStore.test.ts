import { COSMETICS, DEFAULT_LOOK, MILESTONES, decodeLook, encodeLook, ownedParts, partKey } from "@topdown/shared";
import { describe, expect, it } from "vitest";
import {
  EDITOR_TABS,
  EDITOR_TEXT,
  SWATCHES,
  TAB_PICKERS,
  changed,
  draftCode,
  infoLine,
  infoLocked,
  openEditor,
  ownedFrom,
  ownedIds,
  pick,
  random,
  setColour,
  setTab,
  tilesFor,
} from "./survivorEditorStore";

/** Story 7.10 T3 (AC 2–7, 10; E2, E3, E5): the editor's pure state. */
const STARTER = ownedParts();
const STARTER_CODE = "v1|top:hoodie|head:beanie|hair:mohawk|pack:school|skin:4|c:aa0000,00bb00,0000cc";

describe("tabs and tiles (AC 2, 5, 6)", () => {
  it("five tabs Top / Head / Hair / Pack / Skin; Hat & bag colour in Head and Pack only; Top shows the top picker", () => {
    expect(EDITOR_TABS.map((t) => t.label)).toEqual(["Top", "Head", "Hair", "Pack", "Skin"]);
    expect(TAB_PICKERS).toEqual({ top: ["top"], head: ["accent"], hair: ["hair"], pack: ["accent"], skin: [] });
    expect(EDITOR_TEXT.accent).toBe("Hat & bag colour");
    expect(SWATCHES).toHaveLength(12); // D1
  });

  it("each tab lists its catalogue parts: starter parts owned, milestone parts locked with their howTo, loot parts as silhouettes", () => {
    const counts: Record<string, [number, number, number]> = {};
    for (const { slot } of EDITOR_TABS) {
      const tiles = tilesFor(slot, STARTER);
      expect(tiles.map((t) => t.id)).toEqual(COSMETICS.parts.filter((p) => p.slot === slot).map((p) => p.id));
      counts[slot] = [tiles.filter((t) => t.state === "owned").length, tiles.filter((t) => t.state === "milestone").length, tiles.filter((t) => t.state === "loot").length];
      for (const t of tiles) {
        const p = COSMETICS.parts.find((x) => x.slot === slot && x.id === t.id)!;
        expect(t.state).toBe(p.unlock === "starter" ? "owned" : p.unlock === "loot" ? "loot" : "milestone");
      }
    }
    expect(counts).toEqual({ top: [4, 1, 1], head: [8, 7, 6], hair: [7, 0, 0], pack: [4, 2, 3], skin: [8, 0, 0] }); // 31 / 10 / 10
  });

  it("milestone tile line = milestones.json howTo for each of m1–m10; loot line = 'Found during waves'; never a price", () => {
    let milestones = 0;
    for (const { slot } of EDITOR_TABS)
      for (const t of tilesFor(slot, STARTER)) {
        const p = COSMETICS.parts.find((x) => x.slot === slot && x.id === t.id)!;
        if (t.state === "milestone") {
          milestones++;
          expect(t.line).toBe(MILESTONES.find((m) => `milestone:${m.id}` === p.unlock)!.howTo);
        }
        if (t.state === "loot") expect(t.line).toBe("Found during waves");
        expect(`${t.line ?? ""} ${t.name}`).not.toMatch(/supplies|price|buy|\d+\s*(¢|\$)/i);
      }
    expect(milestones).toBe(10);
    expect(Object.values(EDITOR_TEXT).join(" ")).not.toMatch(/supplies|price|buy/i); // E2: no shop words anywhere
  });

  it("AC 6: owned = starter parts + the server's cosmetics (7.11); a milestone item I own is an owned tile", () => {
    const owned = ownedFrom({ cosmetics: ["head:riot", "pack:teddy"] });
    const head = tilesFor("head", owned);
    expect(head.find((t) => t.id === "riot")?.state).toBe("owned");
    expect(head.find((t) => t.id === "gas")?.state).toBe("milestone");
    expect(tilesFor("pack", owned).find((t) => t.id === "teddy")?.state).toBe("owned");
    expect(ownedFrom(null)).toEqual(STARTER);
  });
});

describe("picking (AC 3, 5, 10)", () => {
  it("an owned part is worn at once; a locked one shows its line and changes nothing", () => {
    let s = openEditor(STARTER_CODE, STARTER, "head");
    s = pick(s, "head", "headph");
    expect(s.draft.head).toBe("headph");
    expect(infoLine(s)).toBe("Headphones");
    const before = s.draft;
    s = pick(s, "head", "gas");
    expect(s.draft).toBe(before); // LK2: nothing changes
    expect(infoLine(s)).toBe("Gas mask: Kill the Behemoth");
    expect(infoLocked(s)).toBe(true);
    s = pick(s, "head", "prop");
    expect(s.draft).toBe(before);
    expect(infoLine(s)).toBe("Found during waves"); // LS1: the loot name stays hidden
    expect(encodeLook(s.draft)).not.toContain("head:gas");
    s = setTab(s, "hair");
    expect(s.tapped).toBeNull();
    expect(infoLine(s)).toBe("Mohawk");
  });

  it("opening on a look with parts I don't own shows the default parts (a stale device copy can't wear a locked part)", () => {
    const s = openEditor(STARTER_CODE.replace("head:beanie", "head:riot"), STARTER);
    expect(s.draft.head).toBe(DEFAULT_LOOK.head);
    expect(openEditor(undefined, STARTER).draft).toEqual(DEFAULT_LOOK);
  });

  it("AC 4, E5: any colour is accepted with no warning — the 4 slot colours and Runner red; junk is ignored", () => {
    let s = openEditor(STARTER_CODE, STARTER);
    for (const c of ["#3d8bff", "#FF8A1F", "#34c759", "#b05cff", "#8b1a1a"]) {
      s = setColour(s, "top", c);
      expect(s.draft.colours.top).toBe(c.toLowerCase());
    }
    expect(setColour(s, "hair", "red")).toBe(s);
    expect(setColour(s, "hair", "#12345")).toBe(s);
    expect(decodeLook(draftCode(s), STARTER).replaced).toBe(0); // AC 13: the save body = the encoded draft, fully valid
  });

  it("D7: Back = the opened look is kept; changed() tells a touched draft", () => {
    const s = openEditor(STARTER_CODE, STARTER);
    expect(changed(s)).toBe(false);
    expect(changed(pick(s, "hair", "bald"))).toBe(true);
    expect(encodeLook(pick(s, "hair", "bald").opened)).toBe(STARTER_CODE);
  });
});

describe("Random (AC 7, D5, E3)", () => {
  it("500 Randoms never pick a locked part; every owned part (skin and 'none' included) comes up; colours are valid #rrggbb", () => {
    let seed = 0x7010;
    const rng = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    let s = openEditor(STARTER_CODE, STARTER);
    const seen = new Set<string>();
    const colours = new Set<string>();
    for (let i = 0; i < 500; i++) {
      s = random(s, rng);
      for (const { slot } of EDITOR_TABS) {
        expect(STARTER.has(partKey(slot, s.draft[slot])), `${slot}:${s.draft[slot]}`).toBe(true);
        seen.add(partKey(slot, s.draft[slot]));
      }
      for (const v of Object.values(s.draft.colours)) {
        expect(v).toMatch(/^#[0-9a-f]{6}$/);
        colours.add(v);
      }
    }
    expect(seen).toEqual(new Set(STARTER)); // each owned part reachable, "head:none" / "pack:none" included
    expect(colours.size).toBeGreaterThan(1400); // uniform RGB: nearly all different
    expect(decodeLook(draftCode(s), STARTER).replaced).toBe(0);
  });

  it("with an owned milestone item, Random can pick it; it never picks an unowned one", () => {
    const owned = ownedFrom({ cosmetics: ["head:riot"] });
    let s = openEditor(undefined, owned);
    let riot = 0;
    for (let i = 0; i < 500; i++) {
      s = random(s);
      if (s.draft.head === "riot") riot++;
      expect(owned.has(partKey("head", s.draft.head))).toBe(true);
    }
    expect(riot).toBeGreaterThan(0);
    expect(ownedIds("head", owned)).toContain("riot");
  });

  it("rng at the edge (0.9999…) still picks a real part", () => {
    const s = random(openEditor(undefined, STARTER), () => 0.9999999999);
    expect(s.draft.skin).toBe("8");
    expect(s.draft.colours.top).toBe("#ffffff");
  });
});
