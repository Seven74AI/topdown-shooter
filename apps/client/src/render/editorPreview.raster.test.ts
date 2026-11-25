/**
 * Story 7.10 (E1, AC 2, 3, 5; D6): the editor's pictures drawn for real (`@napi-rs/canvas`, tests only).
 */
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_LOOK, decodeLook, ownedParts, type SurvivorLook } from "@topdown/shared";
import { drawSurvivorBody, drawSurvivorGun } from "./city/spriteArt";
import { resolveLook } from "./city/survivorLook";
import { BigPreview, GAME_PX_PER_M, PLAYER_RADIUS_M, drawGamePreview, watchVisible } from "./editorPreview";
import { SILHOUETTE, TILE_PX, clearTileCache, drawTile, partTileUrl, tileCacheSize } from "./city/partTiles";
import { SLOT_COLOR_CSS } from "./playerColors";

type G = CanvasRenderingContext2D;
const LOOK: SurvivorLook = decodeLook("v1|top:puffer|head:beanie|hair:curly|pack:school|skin:6|c:c03030,e0c020,20a0e0", ownedParts()).look;
const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];

describe("E1: what you see is what your friends see", () => {
  it("the game-size preview draws me exactly as the game's body bake (gun frame + drawSurvivorBody, stage 1) at 35 px/m × dpr", () => {
    const W = 360;
    const H = 240;
    const dpr = 2;
    const p = createCanvas(W, H);
    drawGamePreview(p.getContext("2d") as unknown as G, W, H, dpr, resolveLook(LOOK, 1), 1);
    // The reference: the game's path (SurvivorLookTextures.paintBodies + the shared gun frame), alone on a clear canvas.
    const m = createCanvas(W, H);
    const g = m.getContext("2d") as unknown as G;
    g.translate(W / 2, H * 0.55);
    g.rotate(-Math.PI / 2);
    const r = PLAYER_RADIUS_M * GAME_PX_PER_M * dpr;
    expect(r).toBe(28); // 0.4 m × 35 px/m × 2
    drawSurvivorGun(g, r);
    drawSurvivorBody(g, r, resolveLook(LOOK, 1), true, false);
    const a = p.getContext("2d").getImageData(0, 0, W, H).data;
    const b = m.getContext("2d").getImageData(0, 0, W, H).data;
    let same = 0;
    let diff = 0;
    for (let i = 0; i < a.length; i += 4) {
      if (b[i + 3] !== 255) continue; // the bake's fully covered pixels (edges blend with the street)
      if (a[i] === b[i] && a[i + 1] === b[i + 1] && a[i + 2] === b[i + 2]) same++;
      else diff++;
    }
    expect(same).toBeGreaterThan(1500); // liveness: the body is really there, big enough
    expect(diff).toBe(0);
  });

  it("my slot ring is drawn around me in my slot colour; the other two people wear the other slots' rings", () => {
    const W = 360;
    const H = 240;
    const c = createCanvas(W, H);
    drawGamePreview(c.getContext("2d") as unknown as G, W, H, 2, resolveLook(DEFAULT_LOOK, 1), 2);
    const d = c.getContext("2d").getImageData(0, 0, W, H).data;
    const at = (x: number, y: number): [number, number, number] => {
      const i = (Math.round(y) * W + Math.round(x)) * 4;
      return [d[i] as number, d[i + 1] as number, d[i + 2] as number];
    };
    const ringR = (0.4 + 0.15) * 35 * 2;
    const px = at(W / 2 + ringR, H * 0.55); // the ring's right edge (the body faces up: nothing covers it there)
    const [gr, gg, gb] = rgb(SLOT_COLOR_CSS[2]);
    expect(Math.abs(px[0] - gr) + Math.abs(px[1] - gg) + Math.abs(px[2] - gb)).toBeLessThan(60);
  });
});

describe("big preview (D2, D6): no allocation per frame", () => {
  it("setLook resolves the look once; 120 frames resolve nothing more and turn one full turn in 6 s", () => {
    const resolve = vi.fn(resolveLook);
    const big = new BigPreview(resolve);
    big.setLook(LOOK);
    expect(resolve).toHaveBeenCalledTimes(1);
    const c = createCanvas(200, 200);
    const g = c.getContext("2d") as unknown as G;
    for (let i = 0; i < 120; i++) big.frame(g, 200, 200, i * 50, 0);
    expect(resolve).toHaveBeenCalledTimes(1);
    expect(big.frames).toBe(120);
    expect(big.angle(6000) - big.angle(0)).toBeCloseTo(0, 6); // a full turn
    expect(big.angle(3000) - big.angle(0)).toBeCloseTo(Math.PI, 6);
    big.dragAngle = 0.5;
    expect(big.angle(0)).toBeCloseTo(-Math.PI / 2 + 0.5, 6);
    // D2: night colours on the big preview: the chosen red top is never drawn as is
    const d = c.getContext("2d").getImageData(0, 0, 200, 200).data;
    let raw = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] === 0xc0 && d[i + 1] === 0x30 && d[i + 2] === 0x30) raw++;
    expect(raw).toBe(0);
  });
});

describe("visibilitychange (brief 20)", () => {
  it("redraws when the page becomes visible again, not when it hides; unsubscribes", () => {
    let handler: (() => void) | null = null;
    const doc = {
      visibilityState: "hidden" as DocumentVisibilityState,
      addEventListener: (_t: string, h: () => void) => (handler = h),
      removeEventListener: () => (handler = null),
    };
    const redraw = vi.fn();
    const off = watchVisible(doc as unknown as Document, redraw);
    handler!();
    expect(redraw).not.toHaveBeenCalled();
    doc.visibilityState = "visible";
    handler!();
    expect(redraw).toHaveBeenCalledTimes(1);
    off();
    expect(handler).toBeNull();
  });
});

describe("part tiles (AC 5; LK2, LS1)", () => {
  const pixels = (slot: "head" | "pack" | "top", id: string, state: "owned" | "milestone" | "loot") => {
    const c = createCanvas(TILE_PX, TILE_PX);
    drawTile(c.getContext("2d") as unknown as G, slot, id, LOOK, state);
    return c.getContext("2d").getImageData(0, 0, TILE_PX, TILE_PX).data;
  };

  it("LS1: a loot tile is a flat silhouette — every drawn pixel is the one silhouette colour, no part colour survives", () => {
    const [sr, sg, sb] = rgb(SILHOUETTE);
    for (const [slot, id] of [["head", "prop"], ["pack", "cat"], ["top", "floral"]] as const) {
      const d = pixels(slot, id, "loot");
      let drawn = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3]! < 64) continue; // a faint anti-aliased edge: premultiplied alpha can't keep its colour exactly
        drawn++;
        // premultiplied alpha rounds a faint edge pixel by a few units: the colour is still the silhouette's
        expect(Math.abs(d[i]! - sr) + Math.abs(d[i + 1]! - sg) + Math.abs(d[i + 2]! - sb), `pixel ${i / 4}`).toBeLessThanOrEqual(8);
      }
      expect(drawn).toBeGreaterThan(800);
    }
  });

  it("LK2: a milestone tile is the item darkened (same shape, every pixel darker); an owned tile keeps its colours", () => {
    const own = pixels("head", "gas", "owned");
    const lock = pixels("head", "gas", "milestone");
    let darker = 0;
    for (let i = 0; i < own.length; i += 4) {
      if (own[i + 3] === 0) continue;
      expect(lock[i + 3]).toBe(own[i + 3]);
      if ((lock[i]! + lock[i + 1]! + lock[i + 2]!) < (own[i]! + own[i + 1]! + own[i + 2]!)) darker++;
    }
    expect(darker).toBeGreaterThan(800);
  });

  it("one cached picture per part, look and state; a loot tile ignores my colours", () => {
    clearTileCache();
    let made = 0;
    const make = () => {
      made++;
      return createCanvas(TILE_PX, TILE_PX) as unknown as HTMLCanvasElement;
    };
    const a = partTileUrl("head", "cap", LOOK, "owned", make);
    expect(a).toMatch(/^data:image\/png/);
    expect(partTileUrl("head", "cap", LOOK, "owned", make)).toBe(a);
    expect(tileCacheSize()).toBe(1);
    partTileUrl("head", "prop", LOOK, "loot", make);
    partTileUrl("head", "prop", { ...LOOK, colours: { top: "#000001", hair: "#000002", accent: "#000003" } }, "loot", make);
    expect(tileCacheSize()).toBe(2); // the silhouette has no colour: one picture
    partTileUrl("head", "cap", { ...LOOK, colours: { ...LOOK.colours, accent: "#00ff00" } }, "owned", make);
    expect(tileCacheSize()).toBe(3);
    expect(made).toBe(1); // one canvas reused for every tile
    clearTileCache();
  });
});
