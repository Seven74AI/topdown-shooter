/**
 * Story 7.8 raster tests (AC 3, AC 6): a real Canvas 2D in Node (`@napi-rs/canvas`, tests only). Recording
 * stand-ins can't count pixels, so these two ACs draw for real and compare bytes.
 */
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { CHAR_R_PX, SURVIVOR_CHAINSAW_RUNNING, SURVIVOR_FRAME, SURVIVOR_WEAPON_FRAMES } from "./spriteAtlas";
import { CHAR_EXTENT_R, drawSurvivor } from "./spriteArt";
import { WEAPON_ART, WEAPON_BACK_ART, drawChainsawRunning } from "./weaponArt";

type G = CanvasRenderingContext2D;
type Draw = (c: G) => void;

/**
 * Frozen reference: `drawSurvivor` as it was before Story 7.8 (spriteArt.ts at the 7.8 baseline), with its
 * colours written out so a later CHAR change can't move the reference.
 */
function legacyDrawSurvivor(c: G, r: number, heldGun?: (c: G, r: number) => void, back?: (c: G, r: number) => void): void {
  const OUTLINE = "rgba(6,6,6,0.7)";
  const ell = (x: number, y: number, rx: number, ry: number): void => {
    c.beginPath();
    c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, Math.PI * 2);
  };
  const rrect = (x: number, y: number, w: number, h: number, rr: number): void => {
    const q = Math.max(0, Math.min(rr, w / 2, h / 2));
    c.beginPath();
    c.moveTo(x + q, y);
    c.lineTo(x + w - q, y);
    c.quadraticCurveTo(x + w, y, x + w, y + q);
    c.lineTo(x + w, y + h - q);
    c.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
    c.lineTo(x + q, y + h);
    c.quadraticCurveTo(x, y + h, x, y + h - q);
    c.lineTo(x, y + q);
    c.quadraticCurveTo(x, y, x + q, y);
    c.closePath();
  };
  c.lineJoin = "round";
  c.strokeStyle = OUTLINE;
  c.lineWidth = Math.max(1, r * 0.08);
  if (back) {
    c.save();
    back(c, r);
    c.restore();
  }
  if (heldGun) {
    c.save();
    heldGun(c, r);
    c.restore();
  } else {
    c.fillStyle = "#17181a";
    rrect(r * 0.3, -r * 0.13, r * 1.75, r * 0.26, 1);
    c.fill();
  }
  c.strokeStyle = "#3c5670";
  c.lineCap = "round";
  c.lineWidth = r * 0.3;
  c.beginPath();
  c.moveTo(0, -r * 0.6);
  c.lineTo(r * 0.85, -r * 0.1);
  c.moveTo(0, r * 0.6);
  c.lineTo(r * 0.55, r * 0.12);
  c.stroke();
  c.lineCap = "butt";
  c.strokeStyle = OUTLINE;
  c.lineWidth = Math.max(1, r * 0.08);
  if (!back) {
    c.fillStyle = "#26251f";
    rrect(-r * 0.98, -r * 0.48, r * 0.5, r * 0.96, r * 0.15);
    c.fill();
  }
  c.fillStyle = "#3c5670";
  ell(-r * 0.05, 0, r * 0.52, r * 0.9);
  c.fill();
  c.stroke();
  c.fillStyle = "#c49a7c";
  c.beginPath();
  c.arc(r * 0.12, 0, r * 0.4, 0, Math.PI * 2);
  c.fill();
  c.stroke();
  c.fillStyle = "#1f2326";
  ell(r * 0.02, 0, r * 0.36, r * 0.4);
  c.fill();
  c.beginPath();
  c.ellipse(r * 0.38, 0, r * 0.16, r * 0.3, 0, -Math.PI / 2, Math.PI / 2);
  c.fill();
}

/** Draws into a fresh square canvas of `side` px, centred, and returns its RGBA bytes. */
export function rasterize(side: number, draw: Draw): Uint8ClampedArray {
  const cv = createCanvas(side, side);
  const g = cv.getContext("2d") as unknown as G;
  g.translate(side / 2, side / 2);
  draw(g);
  return g.getImageData(0, 0, side, side).data;
}

function differingBytes(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

/** Every survivor atlas frame, with how today's `spriteAtlas.ts` draws it (`drawCharacterFrame`). */
type Frame = { name: string; gun?: (c: G, r: number) => void; back?: ((c: G, r: number) => void) | undefined };
function survivorFrames(): Frame[] {
  const out: Frame[] = [{ name: SURVIVOR_FRAME }, { name: SURVIVOR_CHAINSAW_RUNNING, gun: (c, r) => drawChainsawRunning(c, "held", r) }];
  for (const [weapon, name] of Object.entries(SURVIVOR_WEAPON_FRAMES)) {
    const art = WEAPON_ART[weapon];
    if (art) out.push({ name, gun: (c, r) => art(c, "held", r), back: WEAPON_BACK_ART[weapon] });
  }
  return out;
}

const FRAME_SIDE = Math.ceil(2 * CHAR_EXTENT_R.survivor * CHAR_R_PX);

describe("survivor parts raster (Story 7.8)", () => {
  const frames = survivorFrames();

  it("covers every survivor frame, the flamethrower's back piece included", () => {
    expect(frames.length).toBe(2 + Object.keys(SURVIVOR_WEAPON_FRAMES).length);
    expect(frames.some((f) => f.back)).toBe(true);
  });

  it.each(frames.map((f) => [f.name, f] as const))("AC 3: %s is pixel-identical to today's survivor", (_name, f) => {
    const before = rasterize(FRAME_SIDE, (g) => legacyDrawSurvivor(g, CHAR_R_PX, f.gun, f.back));
    const after = rasterize(FRAME_SIDE, (g) => drawSurvivor(g, CHAR_R_PX, f.gun, f.back));
    let opaque = 0;
    for (let i = 3; i < before.length; i += 4) if ((before[i] as number) > 0) opaque++;
    expect(opaque).toBeGreaterThan(1000); // liveness: something was drawn
    expect(differingBytes(before, after)).toBe(0);
  });
});
