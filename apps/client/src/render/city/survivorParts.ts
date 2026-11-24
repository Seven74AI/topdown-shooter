/**
 * Story 7.8: the survivor, one function per slot (top, headgear, hair, backpack, skin), with the designer's picked
 * parts (`docs/epic-7-decisions.md` › Survivor parts; drawings from `docs/art/7-8/parts.html`, `round-2.html` and
 * `round-3.html`). Facing +x, centred on the body, `r` = collision radius in px.
 *
 * `drawSurvivor` (spriteArt.ts) calls them in the game's order: weapon back piece → held gun → arms → backpack →
 * top body → head (skin) → hair → headgear. The default parts (jacket, backpack, skin 1) are today's survivor
 * stroke for stroke; the default cap is the designer's new drawing (round 3, B).
 *
 * Round-2 rule: a top view with a slight lean. Tall headgear leans back a little so its front face shows: a darker
 * side wall (`wall`) under a top shifted back.
 *
 * Every function leaves the line state as it found it (`lineJoin` round, outline colour and width, `lineCap` butt):
 * the order and the values matter for pixel identity. Fixed part colours are night colours already (like `CHAR`)
 * and go through `stageDim` (identity at stage 1). No allocation per frame: these run when a texture is baked.
 */
import { cosmeticPart, type CosmeticSlot } from "@topdown/shared";
import { CHAR, circle, ell, rrect, shade } from "./spriteArt";
import { stageDim, type ResolvedLook } from "./survivorLook";
import { drawLayerStill } from "./survivorLayers";

type G = CanvasRenderingContext2D;

/** Fixed part colours, per part (night colours already: drawn above the lightmap, D5). */
export const PART_COLOURS = {
  camo: { base: "#56603d", tail: "#3f4430", blots: ["#262a1b", "#7a6c45", "#2f3b22"] },
  floral: { petal: "#ece6d6", centre: "#d9b44a" },
  hoodShade: "rgba(0,0,0,0.35)",
  bike: { shell: "#5f6a76", wall: "#47505a", peak: "#3a414a", vents: "#1c2026" },
  headphones: { band: "#2a2c30" },
  fire: { brim: "#1b1c1f", wall: "#121315", crown: "#2c2d31", comb: "#45464c", badge: "#a08a3c" },
  riot: { guard: "#0f1012", wall: "#0c0d0f", dome: "#1d2024", visor: "rgba(110,140,165,0.72)", glint: "rgba(255,255,255,0.35)" },
  gas: { strap: "#121212", face: "#2b2e2a", lens: "rgba(150,175,165,0.65)", filter: "#4f5349", filterCore: "#33362f" },
  hockey: { mask: "#d8d4c8", holes: "#222222" },
  laurel: ["#4b6a38", "#5d7d45"],
  weld: { wall: "#1c1d1f", cap: "#2a2c2e", plate: "#34373a", lens: "#0f1112", glint: "rgba(170,200,220,0.5)" },
  cone: { base: "#b45a1e", body: "#c8692a", stripe: "#e3ddd0" },
  chef: { band: "#c9c6bd", puff: "#e4e1d8" },
  pot: { handle: "#1d1d1f", wall: "#5c6065", body: "#7d8186", ring: "#5c6065" },
  bunny: { fur: "#d9c9c4", inner: "#c98d97" },
  viking: { horn: "#d6ccb2", hornBand: "#8f846c", wall: "#4b4e52", dome: "#6f7377", ridge: "#8a8e92", band: "#7d6236" },
  propeller: { blades: "#c9c1a8", hub: "#2a2c30" },
  baldShine: "rgba(255,255,255,0.16)",
  hairTie: "#151515",
  duffel: { bag: "#3b3f2f", strap: "#20221a" },
  planks: { wood: ["#8a6a44", "#74583a", "#94744c"], strap: "#2a2416" },
  golf: { shaft: "#9aa0a6", covers: ["#3b5a3a", "#d8d2c0", "#3b5a3a", "#b8bcc0"], bag: "#2d3a4a", rim: "#1f2832" },
  teddy: { fur: "#7a5634", muzzle: "#b08860", eyes: "#0d0b09" },
  cat: { fur: "#9a6230", stripes: "#6e4420", eyes: "#d9c27a" },
  plant: { pot: "#7a4a32", soil: "#2a1f17", leaves: ["#3f6b34", "#4d7d3e"] },
} as const;
/** Shade amounts (`shade` toward white > 0, black < 0) for the parts drawn in a picker colour. */
const SHADE = { dark: -0.18, darker: -0.28, wall: -0.38, deep: -0.45, light: 0.25, lighter: 0.35, pale: 0.55 } as const;
/** Lean: how far a tall part's top sits behind its base, in radii. */
const LEAN = { low: 0.06, mid: 0.08, high: 0.1, tall: 0.24 } as const;

/** Outline width for survivor parts (today's `max(1, 0.08 r)`). */
export function outlineWidth(r: number): number {
  return Math.max(1, r * 0.08);
}
function resetLine(c: G, r: number): void {
  c.lineCap = "butt";
  c.strokeStyle = CHAR.outline;
  c.lineWidth = outlineWidth(r);
}
/** Fill the current path, then outline it. */
function fs(c: G, colour: string): void {
  c.fillStyle = colour;
  c.fill();
  c.stroke();
}
/** One stroked segment (r units), then the outline state again. */
function seg(c: G, r: number, x1: number, y1: number, x2: number, y2: number, colour: string, w: number, cap: CanvasLineCap = "butt"): void {
  c.strokeStyle = colour;
  c.lineWidth = r * w;
  c.lineCap = cap;
  c.beginPath();
  c.moveTo(r * x1, r * y1);
  c.lineTo(r * x2, r * y2);
  c.stroke();
  resetLine(c, r);
}
function poly(c: G, r: number, pts: readonly (readonly [number, number])[]): void {
  c.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? c.moveTo(r * x, r * y) : c.lineTo(r * x, r * y)));
  c.closePath();
}
/** The lean's side wall: a drum whose base is at `x` and whose top will sit at `x - h` (r units). */
function wall(c: G, r: number, x: number, y: number, rx: number, ry: number, h: number, colour: string): void {
  c.fillStyle = colour;
  ell(c, r * x, r * y, r * rx, r * ry);
  c.fill();
  c.stroke();
  c.fillRect(r * (x - h), r * (y - ry), r * h, r * ry * 2);
  c.beginPath();
  c.moveTo(r * (x - h), r * (y - ry));
  c.lineTo(r * x, r * (y - ry));
  c.moveTo(r * (x - h), r * (y + ry));
  c.lineTo(r * x, r * (y + ry));
  c.stroke();
}
const dim = (look: ResolvedLook, hex: string): string => stageDim(hex, look.stage);

/** The picker colour a part takes (catalogue `colour`); fixed-colour parts get the accent colour, unused. */
export function partColour(look: ResolvedLook, slot: CosmeticSlot, partId: string): string {
  const k = cosmeticPart(slot, partId)?.colour;
  return k === "top" ? look.colours.top : k === "hair" ? look.colours.hair : look.colours.accent;
}

// ---------------------------------------------------------------------------------------------------------------
// Top
// ---------------------------------------------------------------------------------------------------------------

/** Top slot, under the backpack: the two arms (sleeves in the top colour). */
export function drawArms(c: G, r: number, partId: string, colour: string, look: ResolvedLook): void {
  c.strokeStyle = partId === "camo" ? dim(look, PART_COLOURS.camo.base) : colour;
  c.lineCap = "round";
  c.lineWidth = r * 0.3;
  c.beginPath();
  c.moveTo(0, -r * 0.6);
  c.lineTo(r * 0.85, -r * 0.1);
  c.moveTo(0, r * 0.6);
  c.lineTo(r * 0.55, r * 0.12);
  c.stroke();
  if (partId === "track") {
    c.strokeStyle = shade(colour, SHADE.pale);
    c.lineWidth = r * 0.09;
    c.beginPath();
    c.moveTo(0, -r * 0.68);
    c.lineTo(r * 0.8, -r * 0.2);
    c.moveTo(0, r * 0.68);
    c.lineTo(r * 0.5, r * 0.22);
    c.stroke();
  }
  resetLine(c, r);
}

const FLOWERS: readonly (readonly [number, number])[] = [[-0.3, -0.5], [-0.05, 0.45], [-0.45, 0.15], [0.15, -0.15], [-0.25, 0.8]];
const CAMO_BLOTS: readonly (readonly [number, number, number, number, number, number])[] = [
  [0, -0.4, -0.55, 0.3, 0.18, 0.4],
  [1, -0.05, -0.3, 0.28, 0.16, -0.6],
  [2, -0.35, 0.2, 0.32, 0.2, 0.9],
  [1, 0.1, 0.5, 0.26, 0.15, 0.3],
  [0, 0.05, 0.05, 0.22, 0.14, -0.2],
  [2, -0.15, -0.8, 0.25, 0.14, 1.2],
  [0, -0.25, 0.7, 0.26, 0.15, -0.9],
];

/** Top slot, over the backpack: the body. */
export function drawTop(c: G, r: number, partId: string, colour: string, look: ResolvedLook): void {
  if (partId === "camo") {
    const P = PART_COLOURS.camo;
    poly(c, r, [[-0.5, -0.5], [-1.0, -0.35], [-1.0, 0.35], [-0.5, 0.5]]);
    fs(c, dim(look, P.tail));
    ell(c, -r * 0.08, 0, r * 0.58, r * 0.94);
    c.fillStyle = dim(look, P.base);
    c.fill();
    c.save();
    ell(c, -r * 0.08, 0, r * 0.58, r * 0.94);
    c.clip();
    for (const [k, x, y, a, b, t] of CAMO_BLOTS) {
      c.fillStyle = dim(look, P.blots[k] as string);
      ell(c, r * x, r * y, r * a, r * b, t);
      c.fill();
    }
    c.restore();
    ell(c, -r * 0.08, 0, r * 0.58, r * 0.94);
    c.stroke();
    return;
  }
  // jacket (today's body) and the tops built on it
  c.fillStyle = colour;
  ell(c, -r * 0.05, 0, r * 0.52, r * 0.9);
  c.fill();
  c.stroke();
  if (partId === "hoodie" && look.head !== "hood") {
    ell(c, -r * 0.32, 0, r * 0.28, r * 0.42);
    fs(c, shade(colour, SHADE.dark));
    c.strokeStyle = shade(colour, 0.5);
    c.lineWidth = r * 0.06;
    c.beginPath();
    c.moveTo(r * 0.38, -r * 0.14);
    c.lineTo(r * 0.5, -r * 0.2);
    c.moveTo(r * 0.38, r * 0.14);
    c.lineTo(r * 0.5, r * 0.2);
    c.stroke();
    resetLine(c, r);
  } else if (partId === "puffer") {
    c.strokeStyle = shade(colour, -0.4);
    c.lineWidth = r * 0.07; // pick page: 0.05 wide, shade -0.32; bolder so it passes 40 px² in the default blue (AC 6)
    for (const x of [-0.38, -0.12, 0.14]) {
      c.beginPath();
      c.ellipse(x * r, 0, r * 0.07, r * 0.86 - Math.abs(x) * r * 0.4, 0, -Math.PI / 2, Math.PI / 2);
      c.stroke();
    }
    resetLine(c, r);
  } else if (partId === "track") {
    c.strokeStyle = shade(colour, SHADE.pale);
    c.lineWidth = r * 0.09;
    c.beginPath();
    c.ellipse(-r * 0.05, 0, r * 0.44, r * 0.8, 0, -2.2, -1.0);
    c.stroke();
    c.beginPath();
    c.ellipse(-r * 0.05, 0, r * 0.44, r * 0.8, 0, 1.0, 2.2);
    c.stroke();
    resetLine(c, r);
  } else if (partId === "floral") {
    const P = PART_COLOURS.floral;
    c.save();
    ell(c, -r * 0.05, 0, r * 0.52, r * 0.9);
    c.clip();
    for (const [x, y] of FLOWERS) {
      c.fillStyle = dim(look, P.petal);
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        circle(c, r * (x + Math.cos(a) * 0.1), r * (y + Math.sin(a) * 0.1), r * 0.1);
        c.fill();
      }
      c.fillStyle = dim(look, P.centre);
      circle(c, r * x, r * y, r * 0.05);
      c.fill();
    }
    c.restore();
    ell(c, -r * 0.05, 0, r * 0.52, r * 0.9);
    c.stroke();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Backpack
// ---------------------------------------------------------------------------------------------------------------

/** Backpack slot ("none" draws nothing). A weapon's back piece replaces it (the caller skips it). */
export function drawPack(c: G, r: number, partId: string, colour: string, look: ResolvedLook): void {
  switch (partId) {
    case "none":
      return;
    case "duffel": {
      const P = PART_COLOURS.duffel;
      rrect(c, -r * 0.92, -r * 0.82, r * 0.42, r * 1.64, r * 0.2);
      fs(c, dim(look, P.bag));
      for (const y of [-0.4, 0.4]) seg(c, r, -0.92, y, -0.5, y, dim(look, P.strap), 0.05);
      return;
    }
    case "school":
      rrect(c, -r * 1.04, -r * 0.54, r * 0.58, r * 1.08, r * 0.2);
      fs(c, colour);
      rrect(c, -r * 1.12, -r * 0.34, r * 0.26, r * 0.68, r * 0.1);
      fs(c, shade(colour, -0.22));
      seg(c, r, -0.88, -0.3, -0.88, 0.3, shade(colour, SHADE.lighter), 0.04);
      return;
    case "planks": {
      const P = PART_COLOURS.planks;
      P.wood.forEach((w, i) => {
        rrect(c, -r * (1.26 - i * 0.16), -r * 1.05, r * 0.15, r * 2.1, r * 0.02);
        fs(c, dim(look, w));
      });
      for (const y of [-0.5, 0.5]) seg(c, r, -1.3, y, -0.78, y, dim(look, P.strap), 0.08);
      return;
    }
    case "golf": {
      const P = PART_COLOURS.golf;
      for (let i = 0; i < 4; i++) {
        const ex = -1.42 + i * 0.04;
        const ey = -0.6 + i * 0.3;
        seg(c, r, -0.9, 0.05, ex, ey, dim(look, P.shaft), 0.05);
        circle(c, r * ex, r * ey, r * 0.1);
        fs(c, dim(look, P.covers[i] as string));
      }
      ell(c, -r * 0.84, r * 0.12, r * 0.32, r * 0.42);
      fs(c, dim(look, P.bag));
      ell(c, -r * 0.98, r * 0.1, r * 0.16, r * 0.24);
      fs(c, dim(look, P.rim));
      return;
    }
    case "teddy": {
      const P = PART_COLOURS.teddy;
      const fur = dim(look, P.fur);
      circle(c, -r * 0.82, -r * 0.32, r * 0.14);
      fs(c, fur);
      circle(c, -r * 0.82, r * 0.32, r * 0.14);
      fs(c, fur);
      circle(c, -r * 0.8, 0, r * 0.36);
      fs(c, fur);
      c.fillStyle = dim(look, P.muzzle);
      ell(c, -r * 1.06, 0, r * 0.12, r * 0.14);
      c.fill();
      c.fillStyle = dim(look, P.eyes);
      circle(c, -r * 0.95, -r * 0.12, r * 0.04);
      c.fill();
      circle(c, -r * 0.95, r * 0.12, r * 0.04);
      c.fill();
      return;
    }
    case "cat": {
      const P = PART_COLOURS.cat;
      const fur = dim(look, P.fur);
      c.fillStyle = dim(look, CHAR.pack);
      rrect(c, -r * 0.98, -r * 0.48, r * 0.5, r * 0.96, r * 0.15);
      c.fill();
      c.stroke();
      c.strokeStyle = fur;
      c.lineWidth = r * 0.1;
      c.lineCap = "round";
      c.beginPath();
      c.moveTo(-r * 0.95, r * 0.3);
      c.quadraticCurveTo(-r * 1.35, r * 0.6, -r * 1.2, r * 0.95);
      c.stroke();
      resetLine(c, r);
      for (const s of [-1, 1]) {
        poly(c, r, [[-0.9, s * 0.1], [-1.12, s * 0.24], [-0.92, s * 0.28]]);
        fs(c, fur);
      }
      circle(c, -r * 0.78, 0, r * 0.24);
      fs(c, fur);
      seg(c, r, -0.95, 0, -0.75, 0, dim(look, P.stripes), 0.04);
      c.fillStyle = dim(look, P.eyes);
      for (const s of [-1, 1]) {
        circle(c, -r * 0.64, s * r * 0.08, r * 0.035);
        c.fill();
      }
      return;
    }
    case "plant": {
      const P = PART_COLOURS.plant;
      circle(c, -r * 0.8, 0, r * 0.3);
      fs(c, dim(look, P.pot));
      c.fillStyle = dim(look, P.soil);
      circle(c, -r * 0.8, 0, r * 0.22);
      c.fill();
      for (let i = 0; i < 7; i++) {
        const a = Math.PI * 0.6 + (i / 6) * Math.PI * 0.8;
        ell(c, r * (-0.8 + Math.cos(a) * 0.38), r * Math.sin(a) * 0.38, r * 0.3, r * 0.1, a);
        fs(c, dim(look, P.leaves[i % 2] as string));
      }
      return;
    }
    default:
      // backpack (today's: fill only, no outline)
      c.fillStyle = dim(look, CHAR.pack);
      rrect(c, -r * 0.98, -r * 0.48, r * 0.5, r * 0.96, r * 0.15);
      c.fill();
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Skin and hair
// ---------------------------------------------------------------------------------------------------------------

/** Skin slot: the head. */
export function drawSkin(c: G, r: number, _partId: string, colour: string): void {
  c.fillStyle = colour;
  circle(c, r * 0.12, 0, r * 0.4);
  c.fill();
  c.stroke();
}

/** Hair slot (the caller skips it when the headgear hides the hair). */
export function drawHair(c: G, r: number, partId: string, colour: string): void {
  switch (partId) {
    case "bald":
      c.fillStyle = PART_COLOURS.baldShine;
      ell(c, r * 0.02, -r * 0.12, r * 0.12, r * 0.07, 0.4);
      c.fill();
      return;
    case "buzz": // stubble: the skin shows through, a crisp hairline in front
      c.fillStyle = colour;
      c.globalAlpha = 0.3;
      ell(c, r * 0.02, 0, r * 0.34, r * 0.39);
      c.fill();
      c.globalAlpha = 1;
      c.strokeStyle = colour;
      c.lineWidth = r * 0.06;
      c.beginPath();
      c.ellipse(r * 0.02, 0, r * 0.33, r * 0.38, 0, -1.0, 1.0);
      c.stroke();
      resetLine(c, r);
      return;
    case "flattop":
      c.fillStyle = colour;
      rrect(c, -r * 0.3, -r * 0.3, r * 0.6, r * 0.6, r * 0.08);
      c.fill();
      c.fillStyle = shade(colour, 0.18);
      rrect(c, -r * 0.24, -r * 0.24, r * 0.48, r * 0.48, r * 0.06);
      c.fill();
      return;
    case "mohawk":
      c.fillStyle = colour;
      c.globalAlpha = 0.28;
      ell(c, r * 0.02, 0, r * 0.34, r * 0.39);
      c.fill();
      c.globalAlpha = 1;
      rrect(c, -r * 0.42, -r * 0.09, r * 0.86, r * 0.18, r * 0.09);
      c.fill();
      seg(c, r, -0.38, 0, 0.4, 0, shade(colour, 0.3), 0.04);
      return;
    case "curly":
      c.fillStyle = colour;
      for (let i = 0; i < 9; i++) {
        const a = Math.PI * 0.55 + (i / 8) * Math.PI * 0.9;
        circle(c, r * (0.02 + Math.cos(a) * 0.3), r * Math.sin(a) * 0.32, r * 0.16);
        c.fill();
      }
      ell(c, 0, 0, r * 0.3, r * 0.34);
      c.fill();
      return;
    default: // short (and tied, which adds a ponytail)
      c.fillStyle = colour;
      ell(c, r * 0.02, 0, r * 0.34, r * 0.39);
      c.fill();
      if (partId === "tied") {
        ell(c, -r * 0.57, 0, r * 0.33, r * 0.15); // a touch longer than the pick page, for 40 px² (AC 6)
        fs(c, colour);
        c.fillStyle = PART_COLOURS.hairTie;
        c.fillRect(-r * 0.3, -r * 0.06, r * 0.06, r * 0.12);
      }
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Headgear
// ---------------------------------------------------------------------------------------------------------------

function drawCap(c: G, r: number, A: string): void {
  // the default cap (round 3, B): brim in front with stitching, leaning crown, button, light logo badge
  c.beginPath();
  c.ellipse(r * 0.32, 0, r * 0.36, r * 0.36, 0, -Math.PI / 2, Math.PI / 2);
  c.closePath();
  fs(c, shade(A, SHADE.darker));
  c.strokeStyle = shade(A, SHADE.light);
  c.lineWidth = r * 0.035;
  c.beginPath();
  c.ellipse(r * 0.32, 0, r * 0.28, r * 0.28, 0, -Math.PI / 2 + 0.3, Math.PI / 2 - 0.3);
  c.stroke();
  resetLine(c, r);
  wall(c, r, 0.04, 0, 0.36, 0.38, LEAN.high, shade(A, SHADE.deep));
  ell(c, -r * 0.06, 0, r * 0.34, r * 0.36);
  fs(c, A);
  c.fillStyle = shade(A, 0.4);
  circle(c, -r * 0.1, 0, r * 0.05);
  c.fill();
  c.fillStyle = shade(A, 0.6);
  circle(c, r * 0.11, 0, r * 0.11);
  c.fill();
  c.stroke();
}

/**
 * Headgear slot ("none" draws nothing). `colour` is the part's picker colour (`partColour`). `withLayers` false leaves
 * a part's animated layer out (the game draws it as its own sprite, `SurvivorLayerPool`).
 */
export function drawHead(c: G, r: number, partId: string, colour: string, look: ResolvedLook, withLayers = true): void {
  const A = colour;
  const d = (hex: string): string => dim(look, hex);
  switch (partId) {
    case "none":
      return;
    case "cap":
      return drawCap(c, r, A);
    case "beanie":
      wall(c, r, 0.1, 0, 0.4, 0.42, LEAN.high, shade(A, -0.35));
      ell(c, 0, 0, r * 0.4, r * 0.42);
      fs(c, A);
      c.strokeStyle = shade(A, SHADE.light);
      c.lineWidth = r * 0.07;
      ell(c, 0, 0, r * 0.3, r * 0.33);
      c.stroke();
      resetLine(c, r);
      c.fillStyle = shade(A, SHADE.light);
      circle(c, -r * 0.08, 0, r * 0.11);
      c.fill();
      c.stroke();
      return;
    case "hood":
      ell(c, 0, 0, r * 0.46, r * 0.48);
      fs(c, shade(A, -0.12));
      c.fillStyle = PART_COLOURS.hoodShade;
      ell(c, r * 0.3, 0, r * 0.12, r * 0.26);
      c.fill();
      return;
    case "bike": {
      const P = PART_COLOURS.bike;
      c.beginPath();
      c.ellipse(r * 0.42, 0, r * 0.12, r * 0.26, 0, -Math.PI / 2, Math.PI / 2);
      c.closePath();
      fs(c, d(P.peak));
      wall(c, r, 0.1, 0, 0.46, 0.4, LEAN.high, d(P.wall));
      ell(c, 0, 0, r * 0.46, r * 0.4);
      fs(c, d(P.shell));
      c.fillStyle = d(P.vents);
      for (const y of [-0.2, 0, 0.2]) {
        rrect(c, -r * 0.24, y * r - r * 0.035, r * 0.34, r * 0.07, r * 0.03);
        c.fill();
      }
      return;
    }
    case "headph":
      c.strokeStyle = d(PART_COLOURS.headphones.band);
      c.lineWidth = r * 0.1;
      c.beginPath();
      c.moveTo(r * 0.02, -r * 0.44);
      c.quadraticCurveTo(-r * 0.12, 0, r * 0.02, r * 0.44);
      c.stroke();
      resetLine(c, r);
      for (const s of [-1, 1]) {
        rrect(c, -r * 0.08, s > 0 ? r * 0.34 : -r * 0.56, r * 0.3, r * 0.22, r * 0.09);
        fs(c, A);
      }
      return;
    case "bucket":
      ell(c, r * 0.04, 0, r * 0.58, r * 0.56);
      fs(c, shade(A, SHADE.dark));
      wall(c, r, 0.04, 0, 0.36, 0.36, 0.09, shade(A, SHADE.wall));
      ell(c, -r * 0.05, 0, r * 0.34, r * 0.34);
      fs(c, A);
      seg(c, r, 0.14, 0, -0.24, 0, shade(A, -0.25), 0.05);
      return;
    case "wide":
      ell(c, r * 0.04, 0, r * 0.68, r * 0.64);
      fs(c, shade(A, -0.2));
      wall(c, r, 0.04, 0, 0.3, 0.33, 0.12, shade(A, -0.4));
      ell(c, -r * 0.08, 0, r * 0.28, r * 0.31);
      fs(c, A);
      seg(c, r, 0.1, 0, -0.26, 0, shade(A, -0.3), 0.05);
      return;
    case "fire": {
      const P = PART_COLOURS.fire;
      ell(c, -r * 0.18, 0, r * 0.66, r * 0.55);
      fs(c, d(P.brim));
      wall(c, r, 0.06, 0, 0.38, 0.38, LEAN.mid, d(P.wall));
      ell(c, -r * 0.02, 0, r * 0.36, r * 0.36);
      fs(c, d(P.crown));
      seg(c, r, 0.28, 0, -0.4, 0, d(P.comb), 0.13, "round");
      poly(c, r, [[0.36, -0.16], [0.5, -0.13], [0.55, 0], [0.5, 0.13], [0.36, 0.16]]);
      fs(c, d(P.badge));
      return;
    }
    case "riot": {
      const P = PART_COLOURS.riot;
      ell(c, -r * 0.28, 0, r * 0.3, r * 0.46);
      fs(c, d(P.guard));
      wall(c, r, 0.06, 0, 0.47, 0.47, LEAN.mid, d(P.wall));
      ell(c, -r * 0.02, 0, r * 0.45, r * 0.45);
      fs(c, d(P.dome));
      c.beginPath();
      c.ellipse(r * 0.3, 0, r * 0.3, r * 0.42, 0, -Math.PI / 2, Math.PI / 2);
      c.closePath();
      fs(c, P.visor);
      c.strokeStyle = P.glint;
      c.lineWidth = r * 0.05;
      c.beginPath();
      c.ellipse(r * 0.3, 0, r * 0.2, r * 0.3, 0, -1.2, -0.2);
      c.stroke();
      resetLine(c, r);
      return;
    }
    case "gas": {
      const P = PART_COLOURS.gas;
      c.strokeStyle = d(P.strap);
      c.lineWidth = r * 0.06;
      ell(c, r * 0.06, 0, r * 0.34, r * 0.4);
      c.stroke();
      resetLine(c, r);
      rrect(c, r * 0.28, -r * 0.27, r * 0.3, r * 0.54, r * 0.14);
      fs(c, d(P.face));
      for (const s of [-1, 1]) {
        circle(c, r * 0.4, s * r * 0.15, r * 0.1);
        fs(c, P.lens);
      }
      circle(c, r * 0.68, 0, r * 0.15);
      fs(c, d(P.filter));
      c.fillStyle = d(P.filterCore);
      circle(c, r * 0.68, 0, r * 0.08);
      c.fill();
      return;
    }
    case "hockey": {
      const P = PART_COLOURS.hockey;
      ell(c, r * 0.34, 0, r * 0.16, r * 0.32);
      fs(c, d(P.mask));
      c.fillStyle = d(P.holes);
      for (const y of [-0.14, 0.14]) {
        ell(c, r * 0.42, y * r, r * 0.04, r * 0.06);
        c.fill();
      }
      return;
    }
    case "band":
      c.strokeStyle = A;
      c.lineCap = "round";
      c.lineWidth = r * 0.11;
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(-r * 0.36, s * r * 0.06);
        c.quadraticCurveTo(-r * 0.7, s * r * 0.2, -r * 0.98, s * r * 0.32);
        c.stroke();
      }
      c.lineCap = "butt";
      c.lineWidth = r * 0.12;
      ell(c, r * 0.04, 0, r * 0.36, r * 0.4);
      c.stroke();
      resetLine(c, r);
      return;
    case "laurel":
      for (let i = 0; i < 14; i++) {
        const a = Math.PI * 0.35 + (i / 13) * Math.PI * 1.3;
        ell(c, r * (0.04 + Math.cos(a) * 0.4), r * Math.sin(a) * 0.44, r * 0.13, r * 0.065, a + Math.PI / 2 + (i % 2 ? 0.5 : -0.5));
        fs(c, d(PART_COLOURS.laurel[i % 2] as string));
      }
      return;
    case "weld": {
      const P = PART_COLOURS.weld;
      wall(c, r, 0.06, 0, 0.36, 0.4, LEAN.low, d(P.wall));
      ell(c, 0, 0, r * 0.34, r * 0.38);
      fs(c, d(P.cap));
      c.save();
      c.translate(-r * 0.02, 0);
      rrect(c, -r * 0.06, -r * 0.32, r * 0.4, r * 0.64, r * 0.08);
      fs(c, d(P.plate));
      rrect(c, r * 0.06, -r * 0.17, r * 0.16, r * 0.34, r * 0.03);
      fs(c, d(P.lens));
      seg(c, r, 0.08, -0.12, 0.18, -0.02, P.glint, 0.03);
      c.restore();
      return;
    }
    case "cone": {
      const P = PART_COLOURS.cone;
      c.save();
      c.rotate(0.785);
      rrect(c, -r * 0.42, -r * 0.42, r * 0.84, r * 0.84, r * 0.08);
      fs(c, d(P.base));
      c.restore();
      circle(c, r * 0.02, 0, r * 0.34);
      fs(c, d(P.body));
      c.strokeStyle = d(P.stripe);
      c.lineWidth = r * 0.08;
      circle(c, r * 0.02, 0, r * 0.22);
      c.stroke();
      resetLine(c, r);
      c.fillStyle = d(P.body);
      circle(c, r * 0.02, 0, r * 0.1);
      c.fill();
      return;
    }
    case "chef": {
      const P = PART_COLOURS.chef;
      wall(c, r, 0.08, 0, 0.32, 0.32, LEAN.tall, d(P.band));
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI * 2;
        circle(c, r * (-0.2 + Math.cos(a) * 0.26), r * Math.sin(a) * 0.26, r * 0.2);
        fs(c, d(P.puff));
      }
      c.fillStyle = d(P.puff);
      circle(c, -r * 0.2, 0, r * 0.28);
      c.fill();
      return;
    }
    case "pot": {
      const P = PART_COLOURS.pot;
      rrect(c, -r * 0.12, r * 0.3, r * 0.16, r * 0.58, r * 0.06);
      fs(c, d(P.handle));
      wall(c, r, 0.1, 0, 0.44, 0.44, LEAN.high, d(P.wall));
      circle(c, 0, 0, r * 0.44);
      fs(c, d(P.body));
      c.strokeStyle = d(P.ring);
      c.lineWidth = r * 0.06;
      circle(c, 0, 0, r * 0.32);
      c.stroke();
      resetLine(c, r);
      return;
    }
    case "bunny": {
      const P = PART_COLOURS.bunny;
      ell(c, r * 0.04, 0, r * 0.4, r * 0.42);
      fs(c, d(P.fur));
      for (const s of [-1, 1]) {
        ell(c, -r * 0.45, s * r * 0.2, r * 0.34, r * 0.1, s * 0.25);
        fs(c, d(P.fur));
        c.fillStyle = d(P.inner);
        ell(c, -r * 0.45, s * r * 0.2, r * 0.24, r * 0.045, s * 0.25);
        c.fill();
      }
      return;
    }
    case "viking": {
      const P = PART_COLOURS.viking;
      for (const s of [-1, 1]) {
        c.beginPath();
        c.moveTo(r * 0.1, s * r * 0.32);
        c.quadraticCurveTo(r * 0.06, s * r * 0.7, -r * 0.1, s * r * 0.76);
        c.quadraticCurveTo(-r * 0.06, s * r * 0.56, -r * 0.16, s * r * 0.34);
        c.closePath();
        fs(c, d(P.horn));
        seg(c, r, 0.02, s * 0.5, -0.12, s * 0.48, d(P.hornBand), 0.04);
      }
      wall(c, r, 0.06, 0, 0.42, 0.42, LEAN.mid, d(P.wall));
      ell(c, -r * 0.02, 0, r * 0.4, r * 0.4);
      fs(c, d(P.dome));
      seg(c, r, 0.3, 0, -0.38, 0, d(P.ridge), 0.07);
      c.strokeStyle = d(P.band);
      c.lineWidth = r * 0.06;
      ell(c, -r * 0.02, 0, r * 0.37, r * 0.37);
      c.stroke();
      resetLine(c, r);
      return;
    }
    case "prop": {
      wall(c, r, 0.06, 0, 0.4, 0.42, LEAN.low, shade(A, -0.3));
      ell(c, 0, 0, r * 0.38, r * 0.4);
      c.fillStyle = A;
      c.fill();
      c.save();
      ell(c, 0, 0, r * 0.38, r * 0.4);
      c.clip();
      c.fillStyle = shade(A, 0.45);
      for (const a of [0, Math.PI]) {
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, r, a, a + Math.PI / 2);
        c.closePath();
        c.fill();
      }
      c.restore();
      ell(c, 0, 0, r * 0.38, r * 0.4);
      c.stroke();
      // The propeller is an animated layer (survivorLayers.ts): drawn here only in still pictures.
      if (withLayers) drawLayerStill(c, r, "propeller");
      return;
    }
  }
}
