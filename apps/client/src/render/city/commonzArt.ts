/**
 * New walkers, runners and crawlers (designer 2026-11-25: "the Walker, the Runner and the Crawler … feel a little
 * behind every other zombie in terms of details and feeling, they don't feel premium AAA"). Game code drawn with the
 * Brute's art kit (`bruteArt.ts › artKit`: shaded parts, cloth and skin textures, tapered limbs, wounds), at the
 * Brute's level of detail, and animated: every function takes a phase `ph` (0–1, one loop) so the limbs move —
 * walkers shamble with their arms swinging, runners pump their arms, crawlers claw forward and drag.
 *
 * Like the Brute, the drawing is in metres facing +y around the body; the exported functions take the game's
 * convention (`r` px = the collision radius, facing +x). Kept to the frame extents of `CHAR_EXTENT_R`.
 */
import { artKit, setArtPixel } from "./bruteArt";

type G = CanvasRenderingContext2D;
type Pt = [number, number];
const { mulberry, shade, E, blobPath, fillP, strokeP, part, skinTex, clothTex, drawLimb, wound } = artKit;
const TAU = Math.PI * 2;
/** Collision radius (m) the drawings are made around (walker / runner / crawler in the balance: ~0.35 m). */
const REF_R = 0.35;
let P = 1;

function frame(c: G, r: number, fn: () => void): void {
  const ppm = r / REF_R;
  c.save();
  c.rotate(-Math.PI / 2); // drawn facing +y → the frame faces +x
  c.scale(ppm, ppm);
  P = 1 / ppm;
  setArtPixel(P);
  fn();
  c.restore();
}

/** A clawed open hand at `at`, pointing `ang` (radians, +y forward), fingers spread `spread`. */
function hand(c: G, at: Pt, ang: number, s: number, skin: string, seed: number, spread = 0.35, curl = 0.2): void {
  c.save();
  c.translate(at[0], at[1]);
  c.rotate(ang - Math.PI / 2);
  // fingers first (under the palm), each a tapered limb with a dark broken nail
  for (let k = 0; k < 4; k++) {
    const a = (k - 1.5) * spread * 0.5;
    const bx = (k - 1.5) * s * 0.42;
    const len = s * (k === 1 || k === 2 ? 1.25 : 1.05);
    const mx = bx + Math.sin(a) * len * 0.55;
    const my = s * 0.4 + Math.cos(a) * len * 0.55;
    const ex = bx + Math.sin(a + curl * (k % 2 ? 1 : -1)) * len;
    const ey = s * 0.4 + Math.cos(a) * len * (1 - curl * 0.4);
    drawLimb(c, [bx, s * 0.3, mx, my, ex, ey], [s * 0.36, s * 0.3, s * 0.22], skin, seed + k, { tex: null, hi: 0.25, knobs: false });
    fillP(c, (q) => E(q, ex, ey + s * 0.04, s * 0.09, s * 0.07), "rgba(40,30,24,0.85)");
  }
  // thumb toward the body
  drawLimb(c, [-s * 0.55, 0, -s * 0.85, s * 0.45, -s * 0.8, s * 0.75], [s * 0.38, s * 0.3, s * 0.2], skin, seed + 9, { tex: null, hi: 0.25, knobs: false });
  part(c, (q) => blobPath(q, 0, 0, s * 0.82, s * 0.7, seed, 0.12, 32), { base: skin, lit: "radial", box: [-s, -s, s, s], hi: 0.3, lo: 0.45, rim: 0.3, tex: skinTex(seed, 0.6), line: 1 });
  // grime and blood on the knuckles
  fillP(c, (q) => blobPath(q, s * 0.1, s * 0.45, s * 0.4, s * 0.18, seed + 4, 0.4, 20), "rgba(70,12,10,0.55)");
  c.restore();
}

/** The torso outline (shoulders at y = f, back at y = b, half width w), a slightly irregular blob. */
function torsoPath(w: number, f: number, b: number, seed: number, lean = 0) {
  return (q: G): void => blobPath(q, lean, (f + b) / 2, w, (f - b) / 2, seed, 0.06, 64);
}

/** A head from above (face +y): skull, ears, nose, patchy matted hair, a scalp wound. */
function head(c: G, x: number, y: number, s: number, skin: string, hair: string, seed: number, bald: number, tilt = 0): void {
  c.save();
  c.translate(x, y);
  c.rotate(tilt);
  for (const sx of [-1, 1]) part(c, (q) => E(q, sx * s * 0.92, -s * 0.05, s * 0.16, s * 0.24), { base: shade(skin, -0.05), lit: "radial", box: [-s, -s, s, s], hi: 0.2, lo: 0.4, line: 0.8 });
  part(c, (q) => E(q, 0, s * 0.95, s * 0.16, s * 0.14), { base: skin, lit: "radial", box: [-s, -s, s, s], hi: 0.2, lo: 0.4, line: 0.8 }); // nose
  part(c, (q) => blobPath(q, 0, 0, s * 0.86, s, seed, 0.05, 48), { base: skin, lit: "radial", box: [-s, -s, s, s], hi: 0.34, lo: 0.55, rim: 0.3, tex: skinTex(seed, 1.2), line: 1.2 });
  // hair: matted clumps over the crown and back, bald patches showing through
  const r = mulberry(seed + 7);
  c.save();
  c.beginPath();
  blobPath(c, 0, -s * (0.15 + bald * 0.25), s * 0.82, s * (0.82 - bald * 0.3), seed + 1, 0.18, 40);
  c.clip();
  fillP(c, (q) => blobPath(q, 0, -s * 0.2, s, s, seed + 2, 0.1, 40), hair);
  for (let i = 0; i < 70; i++) {
    const a = r() * TAU;
    const d = r() * s * 0.85;
    const x0 = Math.cos(a) * d;
    const y0 = Math.sin(a) * d - s * 0.2;
    strokeP(c, (q) => {
      q.moveTo(x0, y0);
      q.quadraticCurveTo(x0 + (r() - 0.5) * s * 0.3, y0 - s * 0.18, x0 + (r() - 0.5) * s * 0.4, y0 - s * (0.3 + r() * 0.25));
    }, r() < 0.5 ? shade(hair, 0.35) : "rgba(0,0,0,0.45)", (0.5 + r() * 0.8) * P);
  }
  for (let i = 0; i < 3; i++) fillP(c, (q) => blobPath(q, (r() - 0.5) * s, (r() - 0.5) * s, s * 0.18, s * 0.12, seed + 20 + i, 0.4, 20), shade(skin, -0.1)); // bald patches
  c.restore();
  wound(c, s * 0.35, -s * 0.25, s * 0.22, seed + 30);
  c.restore();
}

/** Blood soaked into cloth around a point. */
function bloodStain(c: G, x: number, y: number, s: number, seed: number): void {
  fillP(c, (q) => blobPath(q, x, y, s, s * 0.8, seed, 0.45, 32), "rgba(42,10,8,0.55)");
  fillP(c, (q) => blobPath(q, x, y, s * 0.55, s * 0.45, seed + 1, 0.4, 24), "rgba(26,5,4,0.6)");
}

// ─────────────────────────────── walker ───────────────────────────────

const WALKER = [
  { cloth: "#4d5566", stain: "70,20,15", skin: "#7d8877", hair: "#2a241e", bald: 0.2, kind: "shirt" },
  { cloth: "#5c4a38", stain: "60,25,15", skin: "#808a78", hair: "#3a2c20", bald: 0.0, kind: "hoodie" },
  { cloth: "#3e4a38", stain: "60,20,15", skin: "#78836f", hair: "#1e1b18", bald: 0.45, kind: "flannel" },
  { cloth: "#665b4b", stain: "65,25,18", skin: "#858c7a", hair: "#4a3a2a", bald: 0.1, kind: "jacket" },
] as const;

/** A walker shambling, facing +x; `ph` swings the arms in turn and bobs the head. */
export function drawWalker2(c: G, r: number, variant: number, ph = 0): void {
  const V = WALKER[variant % WALKER.length] as (typeof WALKER)[number];
  const seed = 800 + variant * 37;
  frame(c, r, () => {
    const sw = Math.sin(ph * TAU);
    const W = 0.27;
    const F = 0.08;
    const B = -0.2;
    // arms reaching forward, swinging in turn: shoulder → elbow → wrist, then the clawed hand
    for (const s of [-1, 1]) {
      const fw = s * sw * 0.05;
      const S: Pt = [s * (W - 0.06), F - 0.02];
      const El: Pt = [s * 0.23, 0.2 + fw];
      const Wr: Pt = [s * 0.17, 0.37 + fw]; // Story 9.13: 0.01 m shorter than the page, so the fingertips stay inside the 1.55 r frame
      const pts = [...S, ...El, ...Wr];
      // sleeve to the forearm (torn), then the grey forearm
      drawLimb(c, pts, [0.1, 0.085, 0.07], V.skin, seed + s, { tex: skinTex(seed + s, 1.6) });
      const cuff = V.kind === "shirt" ? 0.55 : V.kind === "flannel" ? 0.75 : 0.95;
      const Cf: Pt = [S[0] + (Wr[0] - S[0]) * cuff, S[1] + (Wr[1] - S[1]) * cuff];
      drawLimb(c, [...S, El[0] * (cuff > 0.6 ? 1 : 0.5) + S[0] * (cuff > 0.6 ? 0 : 0.5), El[1] * (cuff > 0.6 ? 1 : 0.5) + S[1] * (cuff > 0.6 ? 0 : 0.5), ...Cf], [0.12, 0.105, 0.095], V.cloth, seed + 10 + s, { tex: clothTex(seed + 10 + s, V.stain), hi: 0.22, knobs: false });
      // the frayed cuff
      strokeP(c, (q) => blobPath(q, Cf[0], Cf[1], 0.05, 0.03, seed + 20 + s, 0.5, 18), "rgba(20,16,12,0.6)", 1 * P);
      hand(c, [Wr[0], Wr[1] + 0.05], Math.PI / 2 + s * 0.15, 0.045, V.skin, seed + 30 + s, 0.4, 0.25);
    }
    // the torso: shoulders and back in the outfit
    const tp = torsoPath(W, F, B, seed);
    part(c, tp, { base: V.cloth, lit: "radial", box: [-W, B - 0.05, W, F + 0.05], hi: 0.34, lo: 0.6, tex: clothTex(seed + 40, V.stain), rim: 0.28 });
    c.save();
    c.beginPath();
    tp(c);
    c.clip();
    // folds pulled across the back by the reaching arms
    for (let k = -2; k <= 2; k++) strokeP(c, (q) => {
      q.moveTo(k * 0.09, B);
      q.quadraticCurveTo(k * 0.06 + sw * 0.01, (F + B) / 2, k * 0.12, F);
    }, "rgba(0,0,0,0.22)", 1.4 * P);
    if (V.kind === "flannel") {
      // a red-and-green check
      for (let x = -W; x < W; x += 0.05) strokeP(c, (q) => {
        q.moveTo(x, B);
        q.lineTo(x + 0.02, F);
      }, "rgba(120,30,25,0.28)", 2.2 * P);
      for (let y = B; y < F; y += 0.05) strokeP(c, (q) => {
        q.moveTo(-W, y);
        q.lineTo(W, y + 0.01);
      }, "rgba(15,20,12,0.3)", 1.6 * P);
    }
    if (V.kind === "hoodie") part(c, (q) => blobPath(q, 0, F - 0.02, 0.13, 0.07, seed + 50, 0.15, 32), { base: shade(V.cloth, -0.05), lit: "radial", box: [-0.13, F - 0.09, 0.13, F + 0.05], hi: 0.3, lo: 0.5, tex: clothTex(seed + 51), line: 1 }); // the hood bunched behind the neck
    if (V.kind === "jacket") {
      strokeP(c, (q) => {
        q.moveTo(-W, B + 0.06);
        q.lineTo(W, B + 0.06);
      }, "rgba(30,24,16,0.7)", 3 * P); // belt
      fillP(c, (q) => E(q, 0, B + 0.06, 0.015, 0.012), "#9a8a60");
    }
    // torn holes with skin showing, blood soaked in
    fillP(c, (q) => blobPath(q, 0.1, -0.06, 0.032, 0.022, seed + 60, 0.5, 20), shade(V.skin, -0.2));
    bloodStain(c, -0.12, 0.0, 0.08, seed + 61);
    bloodStain(c, 0.16, 0.04, 0.05, seed + 62);
    c.restore();
    c.beginPath();
    tp(c);
    c.strokeStyle = "rgba(6,6,7,0.85)";
    c.lineWidth = 1.4 * P;
    c.stroke();
    if (V.kind === "shirt") {
      // the collar either side of the neck
      for (const s of [-1, 1]) part(c, (q) => blobPath(q, s * 0.07, F - 0.01, 0.06, 0.035, seed + 70 + s, 0.1, 20), { base: shade(V.cloth, 0.1), lit: "top", box: [-0.15, F - 0.05, 0.15, F + 0.04], hi: 0.3, lo: 0.4, line: 0.8 });
    }
    head(c, sw * 0.012, F + 0.04, 0.105, V.skin, V.hair, seed + 80, V.bald, sw * 0.08);
  });
}

// ─────────────────────────────── runner ───────────────────────────────

const RUNNER = [
  { cloth: "#7a3028", stain: "60,10,8", skin: "#a69a84", hair: "#2a2018", bald: 0.1 },
  { cloth: "#682f33", stain: "55,10,10", skin: "#a39886", hair: "#5a4028", bald: 0 },
] as const;

/** A runner sprinting, facing +x; `ph` pumps the arms (one forward, one back, swapping). */
export function drawRunner2(c: G, r: number, variant: number, ph = 0): void {
  const V = RUNNER[variant % RUNNER.length] as (typeof RUNNER)[number];
  const seed = 900 + variant * 41;
  frame(c, r, () => {
    const sw = Math.sin(ph * TAU);
    c.save();
    c.rotate(sw * 0.08); // the shoulders twist with the stride
    for (const s of [-1, 1]) {
      const k = s * sw; // +1: this arm forward
      const S: Pt = [s * 0.2, 0.04];
      const El: Pt = [s * 0.25, 0.04 + k * 0.17];
      const Wr: Pt = [s * 0.18, 0.04 + k * 0.32];
      drawLimb(c, [...S, ...El, ...Wr], [0.09, 0.075, 0.06], V.skin, seed + s, { tex: skinTex(seed + s, 1.2) });
      drawLimb(c, [...S, (S[0] + El[0]) / 2, (S[1] + El[1]) / 2], [0.105, 0.095], V.cloth, seed + 5 + s, { tex: clothTex(seed + 5 + s, V.stain), knobs: false, hi: 0.2 }); // short sleeve
      hand(c, Wr, Math.atan2(Wr[1] - El[1], Wr[0] - El[0]), 0.038, V.skin, seed + 10 + s, 0.2, 0.6);
    }
    const tp = torsoPath(0.22, 0.1, -0.14, seed, 0);
    part(c, tp, { base: V.cloth, lit: "radial", box: [-0.22, -0.19, 0.22, 0.15], hi: 0.36, lo: 0.6, tex: clothTex(seed + 20, V.stain), rim: 0.28 });
    c.save();
    c.beginPath();
    tp(c);
    c.clip();
    // a race number pinned on the back (a marathon runner, turned), torn and bloodied
    part(c, (q) => {
      q.rect(-0.07, -0.08, 0.14, 0.09);
    }, { base: "#d8d4c6", lit: "top", box: [-0.07, -0.08, 0.07, 0.01], hi: 0.2, lo: 0.3, line: 0.8 });
    c.fillStyle = "rgba(20,20,20,0.85)";
    c.save();
    c.translate(0, -0.035);
    c.scale(0.001, -0.001); // text at 55 px in a 1/1000 scale: tiny fonts don't render reliably
    c.font = "700 55px sans-serif";
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText(variant ? "217" : "1042", 0, 0);
    c.restore();
    bloodStain(c, 0.05, -0.04, 0.06, seed + 30);
    bloodStain(c, -0.12, 0.05, 0.05, seed + 31);
    for (let k = -2; k <= 2; k++) strokeP(c, (q) => {
      q.moveTo(k * 0.08, -0.14);
      q.lineTo(k * 0.1 + sw * 0.02, 0.1);
    }, "rgba(0,0,0,0.2)", 1.2 * P);
    c.restore();
    c.beginPath();
    tp(c);
    c.strokeStyle = "rgba(6,6,7,0.85)";
    c.lineWidth = 1.4 * P;
    c.stroke();
    head(c, -sw * 0.01, 0.13, 0.1, V.skin, V.hair, seed + 40, V.bald, -sw * 0.1);
    c.restore();
  });
}

// ─────────────────────────────── crawler ───────────────────────────────

const CRAWLER = [
  { cloth: "#323a2d", stain: "60,15,10", skin: "#626b5c", hair: "#1c1a18", bald: 0.3 },
  { cloth: "#41342f", stain: "60,15,10", skin: "#5f6659", hair: "#2a2420", bald: 0.6 },
] as const;

/** A crawler without legs, dragging itself, facing +x; `ph` claws one arm forward then the other, and lurches. */
export function drawCrawler2(c: G, r: number, variant: number, ph = 0): void {
  const V = CRAWLER[variant % CRAWLER.length] as (typeof CRAWLER)[number];
  const seed = 1000 + variant * 43;
  frame(c, r, () => {
    const sw = Math.sin(ph * TAU);
    const lurch = Math.max(0, Math.sin(ph * TAU * 2)) * 0.015;
    c.save();
    c.translate(0, lurch);
    // the smear it leaves: blood and fluids dragged behind, with a rope of entrails
    // Story 9.13: the smear trimmed (page: centres −0.42 / −0.52 m, lengths 0.2 / 0.12 m) to stay inside the 1.75 r frame
    fillP(c, (q) => blobPath(q, 0, -0.4, 0.13, 0.15, seed, 0.35, 40), "rgba(55,6,5,0.75)");
    fillP(c, (q) => blobPath(q, 0.02, -0.47, 0.08, 0.085, seed + 1, 0.4, 30), "rgba(30,3,3,0.75)");
    drawLimb(c, [0.02, -0.22, 0.0, -0.31, 0.03, -0.39, 0.01, -0.46], [0.032, 0.028, 0.024, 0.018], "#4a1814", seed + 2, { tex: skinTex(seed + 2, 0.2), hi: 0.3, knobs: false });
    // arms clawing forward, spread, one reaching while the other pulls
    for (const s of [-1, 1]) {
      const k = s * sw;
      const S: Pt = [s * 0.17, 0.06];
      const El: Pt = [s * 0.3, 0.18 + k * 0.05];
      const Wr: Pt = [s * 0.27, 0.36 + k * 0.09];
      drawLimb(c, [...S, ...El, ...Wr], [0.085, 0.07, 0.06], V.skin, seed + 5 + s, { tex: skinTex(seed + 5 + s, 1.6) });
      drawLimb(c, [...S, (S[0] + El[0]) / 2, (S[1] + El[1]) / 2], [0.1, 0.09], V.cloth, seed + 8 + s, { tex: clothTex(seed + 8 + s, V.stain), knobs: false, hi: 0.2 });
      hand(c, [Wr[0], Wr[1] + 0.04], Math.PI / 2 + s * 0.35, 0.042, V.skin, seed + 12 + s, 0.55, k > 0 ? 0.1 : 0.5);
    }
    // the torso, ending in a ragged waist: torn shirt, the bared spine and ribs
    const tp = (q: G): void => blobPath(q, 0, -0.06, 0.2, 0.17, seed + 20, 0.08, 56);
    part(c, tp, { base: V.cloth, lit: "radial", box: [-0.2, -0.24, 0.2, 0.12], hi: 0.3, lo: 0.6, tex: clothTex(seed + 21, V.stain), rim: 0.24 });
    c.save();
    c.beginPath();
    tp(c);
    c.clip();
    // the shirt rides up: bare grey back with the spine and ribs pushing through
    part(c, (q) => blobPath(q, 0, -0.17, 0.16, 0.08, seed + 22, 0.25, 40), { base: V.skin, lit: "radial", box: [-0.16, -0.25, 0.16, -0.09], hi: 0.25, lo: 0.5, tex: skinTex(seed + 22, 1.4), line: 0.8 });
    for (let i = 0; i < 6; i++) fillP(c, (q) => E(q, 0, -0.1 - i * 0.025, 0.016, 0.01), "rgba(210,205,185,0.75)"); // vertebrae
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) strokeP(c, (q) => {
      q.moveTo(s * 0.02, -0.12 - i * 0.03);
      q.quadraticCurveTo(s * 0.08, -0.11 - i * 0.03, s * 0.12, -0.14 - i * 0.03);
    }, "rgba(200,195,175,0.5)", 1.2 * P); // ribs
    bloodStain(c, 0, -0.22, 0.09, seed + 23);
    c.restore();
    c.beginPath();
    tp(c);
    c.strokeStyle = "rgba(6,6,7,0.85)";
    c.lineWidth = 1.4 * P;
    c.stroke();
    head(c, sw * 0.015, 0.14, 0.1, V.skin, V.hair, seed + 30, V.bald, sw * 0.12);
    c.restore();
  });
}
