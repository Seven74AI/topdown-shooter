/**
 * Story 7.8 raster tests (AC 3, AC 6): a real Canvas 2D in Node (`@napi-rs/canvas`, tests only). Recording
 * stand-ins can't count pixels, so these two ACs draw for real and compare bytes.
 */
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { COSMETICS, DEFAULT_LOOK, fnv1a32, type CosmeticSlot, type SurvivorLook } from "@topdown/shared";
import { CHAR_R_PX, SURVIVOR_CHAINSAW_RUNNING, SURVIVOR_FRAME, SURVIVOR_WEAPON_FRAMES } from "./spriteAtlas";
import { CHAR_EXTENT_R, drawSurvivor } from "./spriteArt";
import { WEAPON_ART, WEAPON_BACK_ART, drawChainsawRunning } from "./weaponArt";
import { drawHead } from "./survivorParts";
import { DEFAULT_RESOLVED_LOOK, resolveLook } from "./survivorLook";

type G = CanvasRenderingContext2D;
type Draw = (c: G) => void;

/**
 * Frozen reference: `drawSurvivor` as it was before Story 7.8 (spriteArt.ts at the 7.8 baseline), with its
 * colours written out so a later CHAR change can't move the reference.
 */
function legacyDrawSurvivor(c: G, r: number, heldGun?: (c: G, r: number) => void, back?: ((c: G, r: number) => void) | undefined, withCap = true): void {
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
  if (!withCap) return;
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
/** fnv1a32 of the default `survivor_body_a` raster (@napi-rs/canvas 1.1.0). */
const DEFAULT_FRAME_DIGEST = 2573057595;

describe("survivor parts raster (Story 7.8)", () => {
  const frames = survivorFrames();

  it("pins the designer's picked default (cap round 3 B): digest of survivor_body_a", () => {
    // AC 3 builds its reference with today's body + `drawHead("cap")`, so it can't see a change to the cap itself.
    // This digest freezes the picked drawing. If the designer approves a new default, update the value.
    const bytes = rasterize(FRAME_SIDE, (g) => drawSurvivor(g, CHAR_R_PX));
    expect(fnv1a32(Array.from(bytes).join(","))).toBe(DEFAULT_FRAME_DIGEST);
  });

  it("covers every survivor frame, the flamethrower's back piece included", () => {
    expect(frames.length).toBe(2 + Object.keys(SURVIVOR_WEAPON_FRAMES).length);
    expect(frames.some((f) => f.back)).toBe(true);
  });

  // AC 3 as changed by the designer's pick (docs/epic-7-decisions.md › Survivor parts): the default cap is the new
  // drawing; every other pixel of every survivor frame is today's.
  it.each(frames.map((f) => [f.name, f] as const))("AC 3: %s is today's survivor with only the cap redrawn", (_name, f) => {
    const before = rasterize(FRAME_SIDE, (g) => {
      legacyDrawSurvivor(g, CHAR_R_PX, f.gun, f.back, false);
      drawHead(g, CHAR_R_PX, "cap", "#1f2326", DEFAULT_RESOLVED_LOOK);
    });
    const after = rasterize(FRAME_SIDE, (g) => drawSurvivor(g, CHAR_R_PX, f.gun, f.back));
    let opaque = 0;
    for (let i = 3; i < before.length; i += 4) if ((before[i] as number) > 0) opaque++;
    expect(opaque).toBeGreaterThan(1000); // liveness: something was drawn
    expect(differingBytes(before, after)).toBe(0);
    // ... and the cap really is the new one, not today's
    const today = rasterize(FRAME_SIDE, (g) => legacyDrawSurvivor(g, CHAR_R_PX, f.gun, f.back));
    expect(differingBytes(today, after)).toBeGreaterThan(100);
  });
});

/** AC 6: at 35 px per metre (r = 14 px) every part changes ≥ 40 px² of colour, or the outline. */
const GAME_R = 14;
const PROBE = 80;
const NONE: Readonly<Record<CosmeticSlot, string | null>> = { top: null, head: "none", hair: null, pack: "none", skin: null };

function lookWith(slot: CosmeticSlot, id: string): SurvivorLook {
  const l: Record<string, unknown> = { ...DEFAULT_LOOK, [slot]: id };
  if (slot === "hair") l.head = "none"; // hair is judged with no headgear
  if (slot === "skin") {
    l.head = "none"; // the head shows only without headgear and hair
    l.hair = "bald";
  }
  return l as SurvivorLook;
}
function gameRaster(look: SurvivorLook): Uint8ClampedArray {
  return rasterize(PROBE, (g) => drawSurvivor(g, GAME_R, undefined, undefined, resolveLook(look, 1)));
}
function changed(a: Uint8ClampedArray, b: Uint8ClampedArray): { px: number; outline: boolean } {
  let px = 0;
  let outline = false;
  for (let i = 0; i < a.length; i += 4) {
    let diff = false;
    for (let k = 0; k < 4; k++) if (Math.abs((a[i + k] as number) - (b[i + k] as number)) > 8) diff = true;
    if (diff) px++;
    if (((a[i + 3] as number) > 0) !== ((b[i + 3] as number) > 0)) outline = true;
  }
  return { px, outline };
}

describe("every part shows at game size (Story 7.8 AC 6)", () => {
  const cases = COSMETICS.parts
    .filter((p) => p.id !== NONE[p.slot] && !(NONE[p.slot] === null && p.id === DEFAULT_LOOK[p.slot]))
    .map((p) => [`${p.slot}:${p.id}`, p.slot, p.id] as const);

  it("covers every part but the slot baselines", () => {
    expect(cases.length).toBe(COSMETICS.parts.length - 2 - 3); // head/pack "none"; top/hair/skin defaults
  });

  it.each(cases)("%s changes ≥ 40 px² or the outline", (_k, slot, id) => {
    const base = gameRaster(lookWith(slot, NONE[slot] ?? DEFAULT_LOOK[slot]));
    const m = changed(gameRaster(lookWith(slot, id)), base);
    expect(m.px >= 40 || m.outline, `${slot}:${id} changed ${m.px} px², outline ${m.outline}`).toBe(true);
  });
});

describe("parts in a slot can be told apart at game size (designer, round 1: \"buzz is the same as short\")", () => {
  const pairs: (readonly [string, CosmeticSlot, string, string])[] = [];
  for (const slot of ["top", "head", "hair", "pack", "skin"] as const) {
    const ids = COSMETICS.parts.filter((p) => p.slot === slot).map((p) => p.id);
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) pairs.push([`${slot}: ${ids[i]} vs ${ids[j]}`, slot, ids[i] as string, ids[j] as string]);
  }
  const cache = new Map<string, Uint8ClampedArray>();
  const raster = (slot: CosmeticSlot, id: string): Uint8ClampedArray => {
    const k = `${slot}:${id}`;
    let v = cache.get(k);
    if (!v) cache.set(k, (v = gameRaster(lookWith(slot, id))));
    return v;
  };

  it("checks every pair", () => {
    expect(pairs.length).toBeGreaterThan(300);
  });

  it.each(pairs)("%s differ by ≥ 40 px² or the outline", (_k, slot, a, b) => {
    const m = changed(raster(slot, a), raster(slot, b));
    expect(m.px >= 40 || m.outline, `${slot} ${a}/${b}: ${m.px} px²`).toBe(true);
  });
});
