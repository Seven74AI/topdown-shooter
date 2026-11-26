import { artKit, setArtPixel } from "../../../../apps/client/src/render/city/bruteArt";

/**
 * Photoreal group 4, take C ("one model", designer 2026-11-26): today's Behemoth (`behemothArt.ts`) with its added
 * detail rethought as one anatomy; see the "Take C" block below. Copied from behemoth4.ts; pose geometry unchanged.
 *
 * Story 6.5 (T0): the Behemoth, drawn in game code from the designer's picks (`docs/epic-6-decisions.md`
 * › Epic 6 looks, section 4: all four looks BH1 prototype, BH2 site worker, BH3 overgrowth, BH4 riot
 * cop, one at random per Behemoth). Ported from `drawBehemothG` in `docs/art/epic-6/looks.html`
 * (section 4) onto the Brute's shared helpers: the reference draws in metres around its 2 m body,
 * facing +x. Poses: walk (2 frames), slam (arms rising, 3 frames by progress), slamHit, charge, rush,
 * throw, stun, roar; plus an "outline + eyes" frame per look, normal and enraged (red eyes), drawn
 * above the darkness (6.3).
 */

type G = CanvasRenderingContext2D;
type Path = (c: G) => void;
const { lerp, mulberry, shade, R, E, blobPath, fillP, strokeP, rivet, part, polyTex, skinTex, clothTex, drawLimb, fist } = artKit;
const TAU = Math.PI * 2;

export const BEHEMOTH_LOOK_IDS = ["BH1", "BH2", "BH3", "BH4"] as const;
type LookKind = "proto" | "worker" | "growth" | "riot";
const LOOKS: readonly { look: LookKind; skin: string }[] = [
  { look: "proto", skin: "#6a7360" },
  { look: "worker", skin: "#6f705f" },
  { look: "growth", skin: "#5f6a58" },
  { look: "riot", skin: "#66705e" },
];

export type BehemothPose = "walk" | "slam" | "slamHit" | "charge" | "rush" | "throw" | "stun" | "roar" | "dead"; // Story 6.7: + "dead" (the collapse, k 0–1)

/** Reference body radius (m). */
export const BH_R_M = 2;
/** Half the frame (m): the roar's arms and fists reach ~3.4 m from the centre. */
export const BH_FRAME_HALF_M = 3.5;

const hash = (n: number): number => {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
};
function Pg(c: G, p: readonly number[]): void {
  c.moveTo(p[0] as number, p[1] as number);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i] as number, p[i + 1] as number);
  c.closePath();
}
function glow(c: G, x: number, y: number, r: number, rgb: string, a: number): void {
  if (a <= 0) return;
  c.save();
  c.globalCompositeOperation = "lighter";
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a})`);
  g.addColorStop(0.3, `rgba(${rgb},${a * 0.5})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  c.fillStyle = g;
  c.beginPath();
  c.arc(x, y, r, 0, TAU);
  c.fill();
  c.restore();
}
function castShadow(c: G, fn: Path, dx: number, dy: number, blur: number, a: number): void {
  const m = c.getTransform();
  const s = Math.hypot(m.a, m.b);
  c.save();
  c.translate(-4000 / s, 0);
  c.shadowColor = `rgba(0,0,0,${a})`;
  c.shadowOffsetX = (4000 * m.a) / s + dx * s;
  c.shadowOffsetY = dy * s;
  c.shadowBlur = blur * s;
  c.fillStyle = "#000";
  fn(c);
  c.restore();
}
function lump(c: G, x: number, y: number, rx: number, ry: number, col: string, seed: number, hi = 0.32): void {
  part(c, (q) => blobPath(q, x, y, rx, ry, seed, 0.06, 40), { base: col, lit: "radial", box: [x - rx, y - ry, x + rx, y + ry], tex: skinTex(seed, 0.8), hi, lo: 0.6, rim: 0.3, inner: 0.35, line: 1.6 });
}
function rebar(c: G, x1: number, y1: number, x2: number, y2: number): void {
  const seg: Path = (q) => {
    q.moveTo(x1, y1);
    q.lineTo(x2, y2);
  };
  strokeP(c, seg, "#140d09", 0.11);
  strokeP(c, seg, "#86492a", 0.06);
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    const x = lerp(x1, x2, t);
    const y = lerp(y1, y2, t);
    strokeP(
      c,
      (q) => {
        q.moveTo(x - 0.03, y - 0.03);
        q.lineTo(x + 0.03, y + 0.03);
      },
      "rgba(20,12,8,0.7)",
      0.012,
    );
  }
}
function throwChunk(c: G): void {
  part(c, (q) => Pg(q, [-0.7, -0.5, 0.6, -0.65, 0.8, 0.3, 0.1, 0.7, -0.75, 0.35]), { base: "#6a675f", lit: "top", box: [-0.75, -0.65, 0.8, 0.7], tex: polyTex(121), hi: 0.35, lo: 0.5, rim: 0.35, line: 1.4 });
}


/** A soft-edged lump that reads as a muscle under the skin (a colour step the relight turns into a volume). */
function muscle(c: G, x: number, y: number, rx: number, ry: number, rot: number, col: string, seed: number): void {
  void seed;
  c.save();
  c.globalCompositeOperation = "source-atop";
  c.translate(x, y);
  c.rotate(rot);
  // the groove that separates the muscle (a crease for the relight), on its shadow side
  strokeP(
    c,
    (q) => {
      q.ellipse(0, 0, rx, ry, 0, Math.PI * 0.05, Math.PI * 1.05);
    },
    shade(col, -0.26), // soft: a hard dark groove reads as a second outline once relit
    0.03,
  );
  c.scale(1, ry / rx);
  // a soft swell: lit on the key-light side, a crescent of shadow on the far side, no outline
  const hi = c.createRadialGradient(-rx * 0.25, -rx * 0.3, 0, 0, 0, rx);
  hi.addColorStop(0, "rgba(215,228,205,0.30)");
  hi.addColorStop(0.55, "rgba(215,228,205,0.08)");
  hi.addColorStop(1, "rgba(215,228,205,0)");
  c.fillStyle = hi;
  c.beginPath();
  c.arc(0, 0, rx, 0, TAU);
  c.fill();
  const lo = c.createRadialGradient(-rx * 0.2, -rx * 0.25, rx * 0.55, 0, 0, rx * 1.08);
  lo.addColorStop(0, "rgba(10,14,8,0)");
  lo.addColorStop(0.7, "rgba(10,14,8,0.32)");
  lo.addColorStop(1, "rgba(10,14,8,0)");
  c.fillStyle = lo;
  c.beginPath();
  c.arc(0, 0, rx * 1.08, 0, TAU);
  c.fill();
  c.restore();
}
/** Striations: fine curved creases across a muscle, following its round. */
function striations(c: G, x: number, y: number, rx: number, ry: number, rot: number, n: number, col: string): void {
  c.save();
  c.translate(x, y);
  c.rotate(rot);
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n - 0.5;
    strokeP(
      c,
      (q) => {
        q.moveTo(-rx * 0.8, t * ry * 1.6);
        q.quadraticCurveTo(0, t * ry * 1.6 + ry * 0.25, rx * 0.8, t * ry * 1.6);
      },
      col,
      0.035,
    );
  }
  c.restore();
}

/** A long scar closed with staples. */
function stapledScar(c: G, x1: number, y1: number, x2: number, y2: number, seed: number): void {
  const rnd = mulberry(seed);
  const mx = (x1 + x2) / 2 + (rnd() - 0.5) * 0.15;
  const my = (y1 + y2) / 2 + (rnd() - 0.5) * 0.15;
  const path: Path = (q) => {
    q.moveTo(x1, y1);
    q.quadraticCurveTo(mx, my, x2, y2);
  };
  strokeP(c, path, "#2a1612", 0.12);
  strokeP(c, path, "#6e2a22", 0.07);
  strokeP(c, path, "#a1574a", 0.018);
  const nx = -(y2 - y1);
  const ny = x2 - x1;
  const nl = Math.hypot(nx, ny) || 1;
  for (let i = 1; i < 7; i++) {
    const t = i / 7;
    const x = (1 - t) * (1 - t) * x1 + 2 * (1 - t) * t * mx + t * t * x2;
    const y = (1 - t) * (1 - t) * y1 + 2 * (1 - t) * t * my + t * t * y2;
    const ux = (nx / nl) * 0.07;
    const uy = (ny / nl) * 0.07;
    const st: Path = (q) => {
      q.moveTo(x - ux, y - uy);
      q.lineTo(x + ux, y + uy);
    };
    strokeP(c, st, "#15171a", 0.035, "butt");
    strokeP(c, st, "#b9bec4", 0.016, "butt");
  }
}
/** A chunk of concrete grown into the hide, with a ring of torn, bloody skin. */
function fusedRubble(c: G, x: number, y: number, s: number, seed: number): void {
  const rnd = mulberry(seed);
  const pts: number[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * TAU + rnd() * 0.4;
    const d = s * (0.7 + rnd() * 0.45);
    pts.push(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.85);
  }
  fillP(c, (q) => blobPath(q, x, y, s * 1.08, s * 0.98, seed + 1, 0.12, 28), "rgba(20,14,10,0.85)");
  part(c, (q) => Pg(q, pts), { base: "#77746b", lit: "top", box: [x - s, y - s, x + s, y + s], tex: polyTex(seed), hi: 0.4, lo: 0.5, rim: 0.35, line: 1.1 });
  for (let i = 0; i < 4; i++) {
    const a = rnd() * TAU;
    const d = rnd() * s * 0.5;
    fillP(c, (q) => E(q, x + Math.cos(a) * d, y + Math.sin(a) * d, s * 0.08, s * 0.06), "#3d3b36");
  }
}

/* ---------------- Take C: one model (photoreal group 4, designer 2026-11-26) ----------------
 * Designer: "rethink the whole thing together … each element has to be thought of while keeping the others in head …
 * a coherent model". One idea drives every element: A BODY THAT GREW TOO FAST FOR ITS SKIN.
 *  - Masses: the hunched back seen from above. Trapezius ridges from the neck to the shoulders, deltoids on the
 *    shoulder lumps, lats down the flanks, a spine groove down the middle. Inside today's silhouette (frame, poses
 *    and warnings unchanged). Lit from the one key light (upper left), soft: the relight adds the volume.
 *  - Skin splits: the skin tore where it stretches most (deltoid tops, the trapezius-deltoid seam, the flanks, the
 *    biceps peaks), across the pull. Raw red inside. They replace today's random enraged cracks and the generic
 *    wounds: one kind of damage.
 *  - Veins: run along the grooves between muscles, from the neck base (the heart side) out to the splits they feed,
 *    and on along the arms. Calm: dark raised lines. Enraged: the veins and the splits glow from the same blood
 *    (marker core, turned into the red glow by the page), and one heartbeat (1.2 s) runs out from the neck base;
 *    the eyes pulse on the same beat.
 *  - Clothes: what survived the growth, torn where the body burst out (along the spine, round the shoulders), with
 *    strain creases pulling toward the shoulders. Veins and splits lie under them.
 *  - Impacts: it rams walls head and shoulders first, so concrete is embedded in the FRONT of the shoulders and grit
 *    in the knuckles; rebar sticks in the back with blood only at the entry points.
 *  - Per look: BH1 prototype = surgical staples (the lab), BH2 site worker = concrete dust, BH3 overgrowth = tumours
 *    grew out of the splits (green pustules stay the infection's colour, never on the beat), BH4 riot cop = flesh
 *    swelling round the fused armour edges, splits at the rims.
 *  - Detail sized for the game (36 px/m: the boss is ~144 px across): nothing thinner than ~1 px there; teeth only
 *    when the mouth is open (roar).
 */
/** Marker colour for every enraged glow core (veins, splits): the page finds it and makes it glow and pulse. */
export const GLOW_MARKER = "#ff00ff";

/** A guided vein: the Bloater's growth (short steps, ± 0.275 rad jitter, branching 6 %, two levels), steered toward
 *  `tx, ty` (it follows the groove to the split it feeds), tapering. Source-atop: only on what is painted (skin). */
function guidedVein(c: G, x0: number, y0: number, tx: number, ty: number, seed: number, enr: boolean, w = 0.032): void {
  const rnd = mulberry(seed);
  const step = 0.035;
  const lines: { pts: number[]; w: number }[] = [];
  const grow = (x: number, y: number, a: number, steps: number, ww: number, depth: number, steer: boolean): void => {
    const pts = [x, y];
    for (let i = 0; i < steps; i++) {
      if (steer) {
        const want = Math.atan2(ty - y, tx - x);
        let d = want - a;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        a += d * 0.18;
        if (Math.hypot(tx - x, ty - y) < step * 1.5) break;
      }
      a += (rnd() - 0.5) * 0.55;
      x += Math.cos(a) * step;
      y += Math.sin(a) * step;
      pts.push(x, y);
      if (depth < 2 && rnd() < 0.06) grow(x, y, a + (rnd() < 0.5 ? -1 : 1) * (0.6 + rnd() * 0.5), Math.round((steps - i) * 0.4) + 3, ww * 0.6, depth + 1, false);
    }
    lines.push({ pts, w: ww });
  };
  grow(x0, y0, Math.atan2(ty - y0, tx - x0), Math.ceil((Math.hypot(tx - x0, ty - y0) / step) * 1.6), w, 0, true);
  c.save();
  c.globalCompositeOperation = "source-atop";
  for (const v of lines) {
    const n = v.pts.length / 2;
    for (let k = 0; k < 3; k++) {
      const i0 = Math.floor((k * (n - 1)) / 3);
      const i1 = Math.floor(((k + 1) * (n - 1)) / 3);
      if (i1 <= i0) continue;
      const ww = v.w * (1 - k * 0.22);
      const path: Path = (q) => {
        q.moveTo(v.pts[i0 * 2] as number, v.pts[i0 * 2 + 1] as number);
        for (let i = i0 + 1; i <= i1; i++) q.lineTo(v.pts[i * 2] as number, v.pts[i * 2 + 1] as number);
      };
      // raised: a lit edge toward the key light, then the dark body of the vein
      c.save();
      c.translate(-ww * 0.4, -ww * 0.4);
      strokeP(c, path, enr ? "rgba(255,140,100,0.22)" : "rgba(178,190,158,0.2)", ww * 0.55);
      c.restore();
      strokeP(c, path, enr ? "rgba(74,14,9,0.85)" : "rgba(26,34,24,0.38)", ww);
      if (enr) strokeP(c, path, GLOW_MARKER, ww * 0.5);
    }
  }
  c.restore();
}

/** A skin split: a lens torn across the pull, dark rim, raw red inside; enraged, the inside glows (marker core). */
function split(c: G, x: number, y: number, len: number, ang: number, enr: boolean, open = 0.3): void {
  const h = len * open * 0.5;
  const lens = (q: G, k: number): void => {
    q.moveTo(-len / 2, 0);
    q.quadraticCurveTo(0, -h * 2 * k, len / 2, 0);
    q.quadraticCurveTo(0, h * 2 * k, -len / 2, 0);
    q.closePath();
  };
  c.save();
  c.globalCompositeOperation = "source-atop";
  c.translate(x, y);
  c.rotate(ang);
  // stretched skin round the tear (pale strain lines along the pull)
  for (const s of [-1, 1]) strokeP(c, (q) => {
    q.moveTo(-len * 0.35, s * h * 2.2);
    q.quadraticCurveTo(0, s * h * 3, len * 0.35, s * h * 2.2);
  }, "rgba(190,175,160,0.14)", len * 0.05);
  fillP(c, (q) => lens(q, 1.35), "rgba(28,8,6,0.9)"); // the torn rim
  fillP(c, (q) => lens(q, 1), enr ? "#7e2016" : "#4e1610"); // raw flesh (dark when calm: it is a wound, not a light)
  fillP(c, (q) => lens(q, 0.45), enr ? GLOW_MARKER : "#2a0a07"); // the deep seam (glows enraged)
  c.restore();
}

/** Grit and dust: a soft pale patch, no hard specks (the relight draws a crease round every hard-edged speck, so
 *  specks read as dotted marks). Concrete dust on BH2, grit on every look's knuckles. */
function dust(c: G, x: number, y: number, rad: number, n: number, seed: number, a = 0.5): void {
  const rnd = mulberry(seed);
  c.save();
  c.globalCompositeOperation = "source-atop";
  for (let i = 0; i < n; i++) {
    const t = rnd() * TAU;
    const d = Math.sqrt(rnd()) * rad * 0.6;
    const px = x + Math.cos(t) * d;
    const py = y + Math.sin(t) * d;
    const rr = rad * (0.35 + rnd() * 0.4);
    const g = c.createRadialGradient(px, py, 0, px, py, rr);
    g.addColorStop(0, `rgba(176,172,162,${a * 0.22})`);
    g.addColorStop(1, "rgba(176,172,162,0)");
    c.fillStyle = g;
    c.beginPath();
    c.arc(px, py, rr, 0, TAU);
    c.fill();
  }
  c.restore();
}

/** The splits of one side of the torso, in torso units (r): where the stretch is greatest, across the pull. */
const SPLITS: readonly (readonly [number, number, number, number])[] = [
  // x, |y|, length, angle (for the +y side; mirrored). Few and large: they must read at 36 px/m (~9 px long).
  [0.22, 0.76, 0.26, 0.3], // deltoid top: the biggest stretch
  [-0.5, 0.7, 0.18, 0.95], // the flank (lat)
];

/** Torso: muscle masses, spine groove, veins to the splits, the splits. Drawn after the body lumps, before the
 *  clothes (which cover what they cover). Kept on the torso's own lumps (the arms under it are not painted on). */
function torsoAnatomy(c: G, r: number, look: LookKind, skin: string, enr: boolean): void {
  const lt = shade(skin, 0.1);
  const dk = shade(skin, -0.16);
  c.save();
  c.beginPath();
  E(c, -0.2 * r, 0, 0.67 * r, 0.81 * r);
  for (const s of [-1, 1]) E(c, 0.14 * r, s * 0.6 * r, 0.43 * r, 0.39 * r);
  c.clip();
  for (const s of [-1, 1]) {
    muscle(c, 0.12 * r, s * 0.3 * r, 0.36 * r, 0.19 * r, s * 0.95, lt, 301 + s); // trapezius: neck to shoulder
    muscle(c, 0.2 * r, s * 0.64 * r, 0.3 * r, 0.25 * r, s * 0.35, lt, 303 + s); // deltoid
    muscle(c, -0.5 * r, s * 0.5 * r, 0.36 * r, 0.18 * r, s * -0.3, dk, 305 + s); // lat down the flank
    muscle(c, -0.15 * r, s * 0.2 * r, 0.42 * r, 0.16 * r, 0, shade(skin, 0.04), 307 + s); // the erectors beside the spine
  }
  // the spine groove (its rip shows through the shirt on BH1 / BH2)
  strokeP(c, (q) => {
    q.moveTo(0.28 * r, 0);
    q.quadraticCurveTo(-0.3 * r, 0.02 * r, -0.86 * r, 0);
  }, "rgba(16,20,14,0.5)", 0.05);
  // veins: from the neck base along the grooves to the splits they feed
  for (const s of [-1, 1]) {
    const [x0, y0] = [0.3 * r, s * 0.12 * r];
    for (let i = 0; i < SPLITS.length; i++) {
      const sp = SPLITS[i] as readonly [number, number, number, number];
      if (look === "growth" && i > 0) continue;
      const sx = sp[0] * r;
      const sy = s * sp[1] * r;
      const from: [number, number] = i === 1 ? [-0.05 * r, s * 0.18 * r] : [x0, y0];
      guidedVein(c, from[0], from[1], sx, sy, 311 + i * 7 + (s > 0 ? 50 : 0), enr, i === 0 ? 0.036 : 0.03);
    }
  }
  for (const s of [-1, 1]) {
    for (let i = 0; i < SPLITS.length; i++) {
      const sp = SPLITS[i] as readonly [number, number, number, number];
      if (look === "growth" && i > 0) continue; // BH3: tumours grew out of the rest
      if (look === "proto" && s < 0 && i === 0) {
        // the lab stapled this one shut (BH1, the prototype)
        const L = sp[2] * r * 1.4;
        const ca = Math.cos(s * sp[3]);
        const sa = Math.sin(s * sp[3]);
        stapledScar(c, sp[0] * r - ca * L / 2, s * sp[1] * r - sa * L / 2, sp[0] * r + ca * L / 2, s * sp[1] * r + sa * L / 2, 371);
        continue;
      }
      split(c, sp[0] * r, s * sp[1] * r, sp[2] * r, s * sp[3], enr);
    }
  }
  c.restore();
}

/** Arm: biceps and forearm masses, the vein continuing from the shoulder down to the fist, a split on the biceps peak. */
function limbAnatomy(c: G, p: readonly number[], s: number, skin: string, enr: boolean, seed: number): void {
  const [ax, ay, ex, ey, fx, fy] = p as [number, number, number, number, number, number];
  const ua = Math.atan2(ey - ay, ex - ax);
  const fa = Math.atan2(fy - ey, fx - ex);
  const ul = Math.hypot(ex - ax, ey - ay);
  const fl = Math.hypot(fx - ex, fy - ey);
  c.save();
  c.beginPath();
  E(c, lerp(ax, ex, 0.5), lerp(ay, ey, 0.5), ul * 0.62, 0.21, ua);
  E(c, lerp(ex, fx, 0.5), lerp(ey, fy, 0.5), fl * 0.6, 0.18, fa);
  c.clip();
  muscle(c, lerp(ax, ex, 0.55), lerp(ay, ey, 0.55), ul * 0.36, 0.2, ua, shade(skin, 0.1), seed);
  muscle(c, lerp(ex, fx, 0.4), lerp(ey, fy, 0.4), fl * 0.33, 0.16, fa, shade(skin, 0.06), seed + 1);
  // one vein from the shoulder joint to the elbow, on to the wrist (continues the shoulder's)
  const bx = lerp(ax, ex, 0.55) + Math.cos(ua + s * Math.PI / 2) * 0.08;
  const by = lerp(ay, ey, 0.55) + Math.sin(ua + s * Math.PI / 2) * 0.08;
  guidedVein(c, lerp(ax, ex, 0.08), lerp(ay, ey, 0.08), bx, by, seed + 2, enr, 0.03);
  guidedVein(c, lerp(ex, fx, 0.0), lerp(ey, fy, 0.0), lerp(ex, fx, 0.92), lerp(ey, fy, 0.92), seed + 3, enr, 0.026);
  split(c, bx, by, 0.16, ua + Math.PI / 2, enr); // the biceps peak tore
  c.restore();
}

/** Strain creases on a torn shirt / vest: the cloth pulled toward the shoulders by the growth. */
function strain(c: G, r: number, col: string): void {
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const x0 = (-0.55 + i * 0.22) * r;
      strokeP(c, (q) => {
        q.moveTo(x0, s * 0.12 * r);
        q.quadraticCurveTo(x0 + 0.12 * r, s * 0.38 * r, x0 + 0.22 * r, s * 0.6 * r);
      }, col, 0.03);
    }
  }
}

/** Head: brow ridge over deep eye sockets, jaw; teeth only with the mouth open (they don't read when closed). */
function headAnatomy(c: G, r: number, skin: string, look: LookKind, roar: boolean): void {
  part(c, (q) => blobPath(q, 0.1 * r, 0, 0.09 * r, 0.22 * r, 271, 0.08, 24), { base: shade(skin, -0.08), lit: "top", box: [0.01 * r, -0.22 * r, 0.19 * r, 0.22 * r], tex: skinTex(271, 0.6), hi: 0.3, lo: 0.5, rim: 0.25, line: 1 });
  if (look === "proto") stapledScar(c, -0.2 * r, -0.12 * r, 0.02 * r, -0.2 * r, 273); // the lab opened the skull
  if (roar) {
    for (const yy of [-1, 1]) fillP(c, (q) => E(q, 0.2 * r, yy * 0.05 * r, 0.035 * r, 0.075 * r), "#d8cfb2");
  }
}

/** Impacts: concrete in the front of the shoulders (it rams head and shoulders first), dust on the site worker,
 *  blood only where the rebar goes in. After the clothes. */
function impacts(c: G, r: number, look: LookKind): void {
  if (look !== "riot") {
    fusedRubble(c, 0.46 * r, -0.6 * r, 0.09 * r, 361);
    dust(c, 0.46 * r, 0.62 * r, 0.14 * r, 4, 363, 0.8);
  }
  if (look === "worker") for (const s of [-1, 1]) dust(c, 0.25 * r, s * 0.7 * r, 0.3 * r, 6, 365 + s, 0.9);
  if (look !== "growth") {
    const entries: [number, number][] = [[-0.45, -0.42], [-0.2, 0.45]];
    if (look !== "riot") entries.push([-0.62, 0.16]);
    for (const [x, y] of entries) {
      fillP(c, (q) => blobPath(q, x * r, y * r, 0.08 * r, 0.07 * r, 259, 0.4, 20), "#3e0e0a");
      fillP(c, (q) => blobPath(q, x * r, y * r, 0.045 * r, 0.04 * r, 261, 0.3, 20), "#7e1a13");
    }
  }
}

/** The pose drawing (reference units, metres, facing +x). `k` = pose progress 0–1, `ph` = walk phase 0–1. */
function behemoth(c: G, r: number, pose: BehemothPose, k: number, look: LookKind, skin: string, enr: boolean, ph: number): void {
  // Story 6.7: the collapse darkens the body as it sags (the corpse reads as no longer a threat).
  const skinC = pose === "dead" ? shade(skin, -0.3 * k) : enr ? "#7d6a5e" : skin;
  const sh = 0.12 * r;
  const sy = 0.82 * r;
  let A: number[];
  let B: number[];
  let headX = 0.62 * r;
  let headY = 0;
  let swell = 1;
  let torsoX = 0;
  const sw = Math.sin(ph * TAU) * 0.16 * r;
  const wL = [0.95 * r + sw, -0.98 * r, 0.33 * r];
  const wR = [0.95 * r - sw, 0.98 * r, 0.33 * r];
  if (pose === "slam") {
    const e = Math.min(1, k * 1.6);
    swell = 1 + 0.07 * e;
    A = [lerp(wL[0] as number, 0.2 * r, e), lerp(wL[1] as number, -0.34 * r, e), lerp(0.33, 0.44, e) * r];
    B = [lerp(wR[0] as number, 0.2 * r, e), lerp(wR[1] as number, 0.34 * r, e), lerp(0.33, 0.44, e) * r];
  } else if (pose === "slamHit") {
    A = [1.12 * r, -0.5 * r, 0.36 * r];
    B = [1.12 * r, 0.5 * r, 0.36 * r];
    headX = 0.7 * r;
  } else if (pose === "charge" || pose === "rush") {
    const e = pose === "rush" ? 1 : Math.min(1, k * 2);
    headX = lerp(0.62, 0.9, e) * r;
    torsoX = 0.1 * r * e;
    A = [lerp(wL[0] as number, -0.3 * r, e), lerp(wL[1] as number, -1.08 * r, e), 0.33 * r];
    B = [lerp(wR[0] as number, -0.3 * r, e), lerp(wR[1] as number, 1.08 * r, e), 0.33 * r];
  } else if (pose === "throw") {
    const e = Math.min(1, k * 1.8);
    A = [0.9 * r, -0.95 * r, 0.33 * r];
    B = [lerp(wR[0] as number, -0.15 * r, e), lerp(wR[1] as number, 0.15 * r, e), lerp(0.33, 0.42, e) * r];
  } else if (pose === "stun") {
    A = [0.3 * r, -1.28 * r, 0.32 * r];
    B = [0.42 * r, 1.25 * r, 0.32 * r];
    headX = 0.55 * r;
    headY = 0.22 * r;
  } else if (pose === "dead") {
    // Story 6.7 (D6): from the stun's slump to sprawled flat, arms thrown wide, head lolled aside.
    A = [lerp(0.3, -0.15, k) * r, lerp(-1.28, -1.5, k) * r, 0.32 * r];
    B = [lerp(0.42, 0.05, k) * r, lerp(1.25, 1.45, k) * r, 0.32 * r];
    headX = lerp(0.55, 0.78, k) * r;
    headY = lerp(0.22, 0.5, k) * r;
    swell = lerp(1, 0.92, k);
  } else if (pose === "roar") {
    A = [0.45 * r, -1.32 * r, 0.35 * r];
    B = [0.45 * r, 1.32 * r, 0.35 * r];
    headX = 0.5 * r;
    swell = 1.08;
  } else {
    A = wL;
    B = wR;
  }
  const raised = pose === "slam" || pose === "throw";
  castShadow(
    c,
    (q) => {
      q.beginPath();
      E(q, -0.08 * r, 0, r * 0.8, r * 0.92);
      q.fill();
    },
    0.18,
    0.26,
    0.18,
    0.42,
  );
  const arms = (): void => {
    for (const [F, s] of [
      [A, -1],
      [B, 1],
    ] as const) {
      const fx = F[0] as number;
      const fy = F[1] as number;
      const ex = (sh + fx) / 2 - 0.12 * r;
      const ey = (s * sy + fy) / 2 + s * 0.1 * r;
      drawLimb(c, [sh, s * sy, ex, ey, fx, fy], [0.5 * r, 0.44 * r, 0.38 * r], skinC, 51 + s * 7, { knobs: false });
      limbAnatomy(c, [sh, s * sy, ex, ey, fx, fy], s, skinC, enr, 281 + s * 11);
      if (look === "riot" && s < 0) {
        fillP(c, (q) => E(q, lerp(ex, fx, 0.7), lerp(ey, fy, 0.7), 0.2 * r, 0.24 * r), "#1d1f22");
        strokeP(c, (q) => E(q, lerp(ex, fx, 0.7), lerp(ey, fy, 0.7), 0.2 * r, 0.24 * r), "#8a8d92", 0.04);
      }
      const fa = Math.atan2(fy - ey, fx - ex);
      fist(c, fx, fy, fa, F[2] as number, skinC, 61 + s * 5, raised ? 1 : 0);
      // grit in the knuckles: it punches through walls
      dust(c, fx + Math.cos(fa) * (F[2] as number) * 0.5, fy + Math.sin(fa) * (F[2] as number) * 0.5, (F[2] as number) * 0.5, 4, 331 + s, 0.8);
    }
  };
  if (!raised) arms();
  c.save();
  c.translate(torsoX, 0);
  c.scale(swell, swell);
  lump(c, -0.2 * r, 0, 0.68 * r, 0.82 * r, skinC, 71, 0.28);
  for (const s of [-1, 1]) lump(c, 0.14 * r, s * 0.6 * r, 0.44 * r, 0.4 * r, skinC, 73 + s, 0.34);
  if (look === "riot") {
    // the flesh swells round the fused armour: a raised rim just outside the plate and pads, torn at the corners
    part(c, (q) => R(q, -0.92 * r, -0.58 * r, 0.98 * r, 1.16 * r, 0.24 * r), { base: shade(skinC, 0.06), lit: "radial", box: [-0.92 * r, -0.58 * r, 0.06 * r, 0.58 * r], tex: skinTex(341, 0.8), hi: 0.32, lo: 0.5, rim: 0.3, line: 1.2 });
  }
  torsoAnatomy(c, r, look, skinC, enr);
  if (look === "riot") for (const [x, y, a] of [[-0.35, 0.58, 0.1], [-0.9, 0.3, 1.5]] as const) for (const s of [-1, 1]) split(c, x * r, s * y * r, 0.18 * r, s * a, enr);
  if (look === "proto" || look === "worker") {
    const torn: Path = (q) => {
      for (let i = 0; i <= 48; i++) {
        const a = (i / 48) * TAU;
        const j = 1 + 0.16 * Math.sin(a * 7 + 1.3) * (Math.cos(a) < 0.2 ? 1 : 0.3) + 0.05 * Math.sin(a * 19);
        const x = -0.28 * r + Math.cos(a) * 0.56 * r * j;
        const y = Math.sin(a) * 0.67 * r * j;
        if (i) q.lineTo(x, y);
        else q.moveTo(x, y);
      }
      q.closePath();
    };
    const col = look === "worker" ? "#d2861c" : "#2a2f37";
    part(c, torn, { base: col, lit: "radial", box: [-0.9 * r, -0.7 * r, 0.3 * r, 0.7 * r], tex: clothTex(81, look === "worker" ? "60,40,10" : "60,30,20"), hi: 0.3, lo: 0.55, rim: 0.25, inner: 0.3, line: 1.4 });
    c.save();
    c.beginPath();
    torn(c);
    c.clip();
    strain(c, r, look === "worker" ? "rgba(90,50,8,0.35)" : "rgba(0,0,0,0.35)");
    if (look === "worker") dust(c, -0.3 * r, 0.1 * r, 0.6 * r, 10, 351, 0.9); // concrete dust on the vest
    c.restore();
    if (look === "worker") {
      c.save();
      c.beginPath();
      torn(c);
      c.clip();
      for (const yy of [-0.42, 0.42]) {
        fillP(c, (q) => R(q, -0.95 * r, yy * r - 0.05 * r, 1.2 * r, 0.1 * r), "#c8ccd0");
        fillP(c, (q) => R(q, -0.95 * r, yy * r - 0.05 * r, 1.2 * r, 0.03 * r), "rgba(255,255,255,0.5)");
      }
      fillP(c, (q) => R(q, -0.62 * r, -0.7 * r, 0.1 * r, 1.4 * r), "#c8ccd0");
      c.restore();
    }
    part(c, (q) => blobPath(q, -0.36 * r, 0, 0.44 * r, 0.12 * r, 83, 0.25, 30), { base: shade(skinC, -0.08), lit: "top", box: [-0.8 * r, -0.12 * r, 0.1 * r, 0.12 * r], tex: skinTex(83, 1), hi: 0.2, lo: 0.5, rim: 0.2, line: 1.3 });
    for (let i = 0; i < 6; i++) {
      const x = -0.72 * r + i * 0.135 * r;
      part(c, (q) => E(q, x, 0, 0.05 * r, 0.065 * r), { base: "#a39b85", lit: "radial", box: [x - 0.05 * r, -0.065 * r, x + 0.05 * r, 0.065 * r], hi: 0.4, lo: 0.4, rim: 0.2, line: 1 });
    }
  }
  if (look === "growth") {
    const rr = mulberry(91);
    for (let i = 0; i < 9; i++) {
      const x = (-0.75 + rr() * 0.9) * r;
      const y = (rr() - 0.5) * 1.3 * r;
      const s = (0.14 + rr() * 0.16) * r;
      lump(c, x, y, s, s * 0.85, shade(skinC, (rr() - 0.5) * 0.25), 95 + i, 0.4);
    }
    for (let i = 0; i < 7; i++) {
      const x = (-0.85 + i * 0.16) * r;
      part(c, (q) => Pg(q, [x - 0.06 * r, -0.05 * r, x + 0.1 * r, 0, x - 0.06 * r, 0.05 * r]), { base: "#d8d0b8", lit: "top", box: [x - 0.06 * r, -0.05 * r, x + 0.1 * r, 0.05 * r], hi: 0.4, lo: 0.4, rim: 0.3, line: 1 });
    }
    for (let i = 0; i < 8; i++) {
      const x = (-0.6 + rr() * 0.8) * r;
      const y = (rr() - 0.5) * 1.4 * r;
      glow(c, x, y, 0.16 * r, "190,220,90", 0.35);
      part(c, (q) => E(q, x, y, 0.045 * r, 0.04 * r), { base: "#b8c95a", lit: "radial", box: [x - 0.05 * r, y - 0.05 * r, x + 0.05 * r, y + 0.05 * r], hi: 0.6, lo: 0.3, rim: 0.3, line: 0.9 });
    }
  }
  if (look === "riot") {
    part(c, (q) => R(q, -0.86 * r, -0.52 * r, 0.86 * r, 1.04 * r, 0.18 * r), { base: "#1f2226", lit: "top", box: [-0.86 * r, -0.52 * r, 0, 0.52 * r], tex: polyTex(97), hi: 0.35, lo: 0.5, rim: 0.35, line: 1.6 });
    c.save();
    c.translate(-0.43 * r, 0);
    c.rotate(-Math.PI / 2);
    c.fillStyle = "rgba(220,222,226,0.55)";
    c.font = `700 ${0.2 * r}px Oswald, Impact, sans-serif`;
    c.textAlign = "center";
    c.textBaseline = "middle";
    c.fillText("POLICE", 0, 0);
    c.restore();
    for (const s of [-1, 1]) part(c, (q) => blobPath(q, 0.14 * r, s * 0.62 * r, 0.32 * r, 0.28 * r, 99 + s, 0.05, 30), { base: "#2a2d32", lit: "radial", box: [-0.2 * r, s * 0.62 * r - 0.3 * r, 0.46 * r, s * 0.62 * r + 0.3 * r], tex: polyTex(98), hi: 0.45, lo: 0.5, rim: 0.4, line: 1.4 });
    for (let i = 0; i < 6; i++) rivet(c, -0.78 * r + i * 0.14 * r, (i % 2 ? 1 : -1) * 0.46 * r, 0.03 * r, "#7d8086");
  }
  if (look !== "growth") {
    rebar(c, -0.45 * r, -0.42 * r, -0.95 * r, -0.72 * r);
    rebar(c, -0.2 * r, 0.45 * r, -0.66 * r, 0.92 * r);
    if (look !== "riot") rebar(c, -0.62 * r, 0.16 * r, -1.15 * r, 0.28 * r);
  }
  if (look === "worker" || look === "riot") {
    for (let i = 0; i < 9; i++) {
      const x = -0.7 * r - i * 0.13 * r;
      const y = 0.6 * r + Math.sin(i * 1.3) * 0.08 * r;
      strokeP(c, (q) => E(q, x, y, 0.07 * r, 0.04 * r), "#0d0d0e", 0.05);
      strokeP(c, (q) => E(q, x, y, 0.07 * r, 0.04 * r), "#7c7f84", 0.025);
    }
  }
  impacts(c, r, look);
  c.restore();
  if (raised) arms();
  if (pose === "throw") {
    const e = Math.min(1, k * 1.8);
    c.save();
    c.translate(lerp(0.9 * r, -0.05 * r, e), lerp(0.9 * r, 0.05 * r, e));
    c.rotate(0.4);
    const s = lerp(0.6, 1.0, e);
    c.scale(s, s);
    throwChunk(c);
    c.restore();
  }
  c.save();
  c.translate(headX, headY);
  part(c, (q) => E(q, 0, 0, 0.27 * r, 0.25 * r), { base: shade(skinC, -0.04), lit: "radial", box: [-0.27 * r, -0.25 * r, 0.27 * r, 0.25 * r], tex: skinTex(111, 1.3), hi: 0.4, lo: 0.55, rim: 0.3, line: 1.5 });
  if (look === "worker") {
    part(
      c,
      (q) => {
        q.ellipse(-0.04 * r, 0, 0.25 * r, 0.26 * r, 0, Math.PI * 0.62, Math.PI * 1.38);
        q.closePath();
      },
      { base: "#d9b21f", lit: "radial", box: [-0.29 * r, -0.26 * r, 0.05 * r, 0.26 * r], hi: 0.5, lo: 0.45, rim: 0.35, line: 1.3 },
    );
  }
  fillP(c, (q) => E(q, 0.08 * r, 0, 0.08 * r, 0.2 * r), shade(skinC, -0.38));
  headAnatomy(c, r, skinC, look, pose === "roar");
  if (pose === "roar") fillP(c, (q) => E(q, 0.19 * r, 0, 0.1 * r, 0.12 * r), "#1a0606");
  if (pose !== "dead") drawEyes(c, r, enr); // Story 6.7: a dead body has no glowing eyes (no false danger in the dark)
  c.restore();
}

function drawEyes(c: G, r: number, enr: boolean): void {
  const eye = enr ? "255,74,46" : "240,214,106";
  for (const s of [-1, 1]) {
    glow(c, 0.16 * r, s * 0.08 * r, 0.12 * r, eye, enr ? 0.7 : 0.4);
    fillP(c, (q) => E(q, 0.16 * r, s * 0.08 * r, 0.035 * r, 0.035 * r), `rgb(${eye})`);
  }
}

/**
 * The outline + eyes overlay (drawn above the darkness in a blackout, 6.3; DD10): a light rim of
 * the body's silhouette and the two eyes (red when enraged). Its own frame so the pose reads in the dark.
 */
function outlineEyes(c: G, r: number, enr: boolean): void {
  c.save();
  c.strokeStyle = enr ? "rgba(255,110,80,0.75)" : "rgba(220,226,235,0.6)";
  c.lineWidth = 0.09;
  c.beginPath();
  E(c, -0.2 * r, 0, 0.7 * r, 0.84 * r);
  c.stroke();
  for (const s of [-1, 1]) {
    c.beginPath();
    E(c, 0.14 * r, s * 0.62 * r, 0.44 * r, 0.4 * r);
    c.stroke();
  }
  c.translate(0.62 * r, 0);
  drawEyes(c, r, enr);
  c.restore();
}

/**
 * Draws Behemoth look `variant` (0–3) in `pose` into a frame centred at the context origin, facing
 * +x, at `pxPerM` px per metre. `outline` draws the overlay frame instead.
 */
export function drawBehemoth(c: G, pxPerM: number, variant: number, pose: BehemothPose | "outline", k: number, enraged: boolean, ph = 0): void {
  const L = LOOKS[((variant % LOOKS.length) + LOOKS.length) % LOOKS.length] as (typeof LOOKS)[number];
  c.save();
  c.scale(pxPerM, pxPerM);
  setArtPixel(1 / pxPerM);
  if (pose === "outline") outlineEyes(c, BH_R_M, enraged);
  else behemoth(c, BH_R_M, pose, k, L.look, L.skin, enraged, ph);
  c.restore();
}
