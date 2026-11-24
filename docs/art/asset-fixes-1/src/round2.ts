/**
 * Round 2 (designer, 2026-11-24): "I like the glow of S1, try some more in the same style"; the boss
 * effects "neon is not bad but still not it, try more"; the ground cracks "too cartoonesque".
 * Slam warnings S1a–S1e (S1's glow, five takes), boss effects D–G, realistic ground damage R1–R3.
 */
import { drawBehemoth } from "../../../../apps/client/src/render/city/behemothArt";
import { drawSurvivor } from "../../../../apps/client/src/render/city/spriteArt";
import { GROUND } from "../../../../apps/client/src/render/city/palette";
import { S1, SET_A, TAU, TELE_N, TELE_R, HOLE_FRAC, asphalt, boneSkull, canvas, ctx, flatSkull, glowRing, night, put, rng, roundRect, splat, teleTexture, type FxSet, type G, type TeleOption } from "./lib";

// ─────────────────────────────── noise ───────────────────────────────

function hash2(x: number, y: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

function fbm(x: number, y: number, seed: number, oct = 5): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f, seed + i * 17);
    f *= 2.03;
    amp *= 0.5;
  }
  return s;
}

// ─────────────────────────────── slam warning: S1's glow, five takes ───────────────────────────────

/** S1's baked glow without the ticks, with a palette (r,g,b of the glow; the rim core stays near white). */
function hotDisc(g: G, glow: string, ticks: boolean, outerBloom: boolean): void {
  const c = TELE_N / 2;
  const R = outerBloom ? TELE_R * HALO_RIM : TELE_R; // room for light spilling past the rim
  const hole = R * HOLE_FRAC;
  g.save();
  g.translate(c, c);
  const gr = g.createRadialGradient(0, 0, hole, 0, 0, R);
  gr.addColorStop(0, `rgba(${glow},0.02)`);
  gr.addColorStop(0.6, `rgba(${glow},0.10)`);
  gr.addColorStop(0.92, `rgba(${glow},0.32)`);
  gr.addColorStop(1, `rgba(${glow},0.55)`);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, R, 0, TAU);
  g.arc(0, 0, hole, 0, TAU, true);
  g.fill();
  if (outerBloom) {
    const ob = g.createRadialGradient(0, 0, R, 0, 0, TELE_R);
    ob.addColorStop(0, `rgba(${glow},0.35)`);
    ob.addColorStop(1, `rgba(${glow},0)`);
    g.fillStyle = ob;
    g.beginPath();
    g.arc(0, 0, TELE_R, 0, TAU);
    g.arc(0, 0, R, 0, TAU, true);
    g.fill();
  }
  for (let i = 0; i < 6; i++) {
    g.strokeStyle = `rgba(${glow},${0.1 - i * 0.014})`;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(0, 0, R - 6 - i * 6, 0, TAU);
    g.stroke();
  }
  g.strokeStyle = `rgba(${glow},0.9)`;
  g.lineWidth = 7;
  g.beginPath();
  g.arc(0, 0, R - 4, 0, TAU);
  g.stroke();
  g.strokeStyle = "rgba(255,240,226,1)";
  g.lineWidth = 2.5;
  g.beginPath();
  g.arc(0, 0, R - 4, 0, TAU);
  g.stroke();
  if (ticks) {
    g.strokeStyle = "rgba(255,220,200,0.55)";
    g.lineWidth = 2;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      const l = i % 6 === 0 ? 16 : 7;
      g.beginPath();
      g.moveTo(Math.cos(a) * (R - 12), Math.sin(a) * (R - 12));
      g.lineTo(Math.cos(a) * (R - 12 - l), Math.sin(a) * (R - 12 - l));
      g.stroke();
    }
  }
  g.restore();
}

/** The glowing fill from the body out to the front (shared by the takes). */
function hotFill(g: G, cx: number, cy: number, hole: number, f: number, glow: string, k = 1): void {
  const gr = g.createRadialGradient(cx, cy, hole, cx, cy, f);
  gr.addColorStop(0, `rgba(${glow},${0.05 * k})`);
  gr.addColorStop(1, `rgba(${glow},${0.3 * k})`);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(cx, cy, f, 0, TAU);
  g.arc(cx, cy, hole, 0, TAU, true);
  g.fill();
}

const RED = "255,60,40";

/** S1a "Sparks": S1 plus embers that lift off the rim and drift in, thicker as the slam nears. */
const S1A: TeleOption = {
  id: "S1a",
  additive: true,
  disc: (g) => hotDisc(g, RED, false, false),
  live(g, cx, cy, hole, R, p) {
    const f = hole + (R - hole) * p;
    hotFill(g, cx, cy, hole, f, RED);
    glowRing(g, cx, cy, f, 1);
    const n = Math.round(30 + p * 70);
    const t = performance.now() / 1000;
    for (let i = 0; i < n; i++) {
      const a = hash2(i, 1, 3) * TAU + t * 0.15 * (hash2(i, 2, 3) - 0.5);
      const life = (t * (0.4 + hash2(i, 3, 3) * 0.6) + hash2(i, 4, 3)) % 1;
      const d = R - life * (R - hole) * 0.55;
      const x = cx + Math.cos(a) * d;
      const y = cy + Math.sin(a) * d;
      const al = Math.sin(life * Math.PI) * (0.5 + p * 0.5);
      g.fillStyle = `rgba(255,${150 + Math.round(hash2(i, 5, 3) * 80)},90,${al})`;
      g.beginPath();
      g.arc(x, y, 1 + hash2(i, 6, 3) * 1.6, 0, TAU);
      g.fill();
    }
  },
};

/** S1b "Heartbeat": the whole warning throbs, the beat quickening until the slam lands. */
const S1B: TeleOption = {
  id: "S1b",
  additive: true,
  disc: (g) => hotDisc(g, RED, false, false),
  live(g, cx, cy, hole, R, p) {
    const f = hole + (R - hole) * p;
    const phase = (2 + p * p * 10) * p * 1.6; // beats per windup, faster at the end
    const beat = Math.pow(Math.max(0, Math.sin(phase * TAU)), 6);
    hotFill(g, cx, cy, hole, R, RED, 0.35 + beat * 0.9);
    glowRing(g, cx, cy, R - 4, 0.4 + beat * 0.6);
    glowRing(g, cx, cy, f, 0.8);
  },
};

/** S1c "Countdown": the rim's ticks light up one by one around the dial; when the circle closes, it lands. */
const S1C: TeleOption = {
  id: "S1c",
  additive: true,
  disc: (g) => hotDisc(g, RED, true, false),
  live(g, cx, cy, hole, R, p) {
    hotFill(g, cx, cy, hole, R, RED, 0.3 + p * 0.7);
    const lit = Math.floor(p * 72);
    for (let i = 0; i < lit; i++) {
      const a = -Math.PI / 2 + (i / 72) * TAU;
      const l = i % 6 === 0 ? 20 : 11;
      for (const [lw, col] of [
        [7, "rgba(255,60,40,0.35)"],
        [2.6, "rgba(255,235,220,0.95)"],
      ] as const) {
        g.strokeStyle = col;
        g.lineWidth = lw;
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * (R - 10), cy + Math.sin(a) * (R - 10));
        g.lineTo(cx + Math.cos(a) * (R - 10 - l), cy + Math.sin(a) * (R - 10 - l));
        g.stroke();
      }
    }
    // the sweep's head
    const a = -Math.PI / 2 + p * TAU;
    const hx = cx + Math.cos(a) * (R - 4);
    const hy = cy + Math.sin(a) * (R - 4);
    const hg = g.createRadialGradient(hx, hy, 0, hx, hy, 22);
    hg.addColorStop(0, "rgba(255,240,220,0.95)");
    hg.addColorStop(1, "rgba(255,60,40,0)");
    g.fillStyle = hg;
    g.fillRect(hx - 22, hy - 22, 44, 44);
  },
};

/** S1d's rim sits at this share of its texture (the rest is the light spilling past it). */
const HALO_RIM = 0.86;

/** S1d "Halo": S1 whose light spills past the rim onto the street, so the edge of safety glows. */
const S1D: TeleOption = {
  id: "S1d",
  additive: true,
  disc: (g) => hotDisc(g, RED, false, true),
  live(g, cx, cy, hole, R, p) {
    const f = hole + (R - hole) * p;
    hotFill(g, cx, cy, hole, f, RED);
    glowRing(g, cx, cy, f, 1);
  },
};

/** S1e "White heat": S1 in fire colours: orange glow, a gold-white rim, the front burning yellow. */
const S1E: TeleOption = {
  id: "S1e",
  additive: true,
  disc: (g) => hotDisc(g, "255,110,30", false, false),
  live(g, cx, cy, hole, R, p) {
    const f = hole + (R - hole) * p;
    hotFill(g, cx, cy, hole, f, "255,120,30");
    for (const [lw, col] of [
      [20, "rgba(255,90,20,0.14)"],
      [11, "rgba(255,140,40,0.3)"],
      [5, "rgba(255,200,90,0.65)"],
      [2, "rgba(255,250,220,1)"],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      g.arc(cx, cy, f, 0, TAU);
      g.stroke();
    }
  },
};

/** A slam scene for a take (see round 1's `slamScene`; this one also draws the boss effects marker and a decal). */
function scene(o: TeleOption, opts: { fx?: FxSet; decal?: HTMLCanvasElement; W?: number } = {}): HTMLCanvasElement {
  const W = opts.W ?? 460;
  const PM = W / 13;
  const c = canvas(W, W);
  const g = ctx(c);
  const R = 4.5 * PM;
  const hole = 2 * PM;
  const cx = W / 2;
  const cy = W / 2;
  const ground = canvas(W, W);
  const gg = ctx(ground);
  asphalt(gg, W, W, 21);
  gg.fillStyle = GROUND.lane;
  for (let y = 0; y < W; y += 60) gg.fillRect(W * 0.13, y, 3, 34);
  const disc = teleTexture(o);
  const survivors: [number, number, number][] = [
    [cx + 3.6 * PM, cy - 1.2 * PM, Math.PI],
    [cx - 2.6 * PM, cy + 3.9 * PM, -1.2],
    [cx + 1.2 * PM, cy + 5.4 * PM, -1.9],
  ];
  const T = 2600;
  const t0 = performance.now();
  const frame = (now: number): void => {
    const t = (now - t0) % T;
    const wind = 1600;
    const p = Math.min(1, t / wind);
    const after = t - wind;
    g.drawImage(ground, 0, 0);
    if (opts.decal && after > 0) {
      g.save();
      g.globalAlpha = Math.min(1, after / 120) * 0.85;
      const s = 9 * PM;
      g.drawImage(opts.decal, cx - s / 2, cy - s / 2, s, s);
      g.restore();
    }
    for (const [x, y, a] of survivors) {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      drawSurvivor(g, 0.42 * PM);
      g.restore();
    }
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.5);
    drawBehemoth(g, PM, 0, after > 0 ? "slamHit" : "slam", after > 0 ? 0 : p, false);
    g.restore();
    night(g, W, W, 0.5, [[cx - 140, cy - 160, 200]]);
    if (after <= 0) {
      g.save();
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = Math.min(1, t / 300);
      const k = TELE_N / 2 / TELE_R / (o.id === "S1d" ? HALO_RIM : 1); // the halo's rim is the zone's edge
      g.drawImage(disc, cx - R * k, cy - R * k, 2 * R * k, 2 * R * k);
      o.live(g, cx, cy, hole, R, p);
      g.restore();
    } else if (after < 260) {
      g.save();
      g.globalCompositeOperation = "lighter";
      const k = 1 - after / 260;
      const gr = g.createRadialGradient(cx, cy, hole * 0.5, cx, cy, R * (1 + (1 - k) * 0.15));
      gr.addColorStop(0, "rgba(255,220,180,0)");
      gr.addColorStop(0.8, `rgba(255,120,70,${0.35 * k})`);
      gr.addColorStop(1, "rgba(255,80,40,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, W, W);
      g.restore();
    }
    if (opts.fx) {
      const [x, y] = survivors[0] as [number, number, number];
      g.save();
      g.translate(x, y - 0.95 * PM);
      const pulse = 1 + 0.08 * Math.sin(now / 120);
      g.scale(pulse, pulse);
      opts.fx.skull(g, 0.45 * PM);
      g.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return c;
}

// ─────────────────────────────── boss effects, round 2 ───────────────────────────────

/** Light coming from behind a shape: a soft red halo (no hard neon tube). */
function halo(g: G, s: number, col: string, a: number): void {
  const gr = g.createRadialGradient(0, 0, s * 0.2, 0, 0, s);
  gr.addColorStop(0, `rgba(${col},${a})`);
  gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, s, 0, TAU);
  g.fill();
}

/** Draws `fn` with a red rim light: the shape in silhouette, offset, lit red, then the shape on top. */
function rimLit(g: G, fn: () => void, col: string, blur: number): void {
  g.save();
  g.shadowColor = col;
  g.shadowBlur = blur;
  fn();
  g.restore();
  fn();
}

/** D "Lit bone": Grit's bone skull and icons, lit from behind by a red danger glow. */
const SET_D: FxSet = {
  id: "D",
  skull(g, s) {
    halo(g, s * 1.15, "255,30,30", 0.55);
    rimLit(g, () => boneSkull(g, s * 1.12), "rgba(255,40,40,1)", s * 0.35);
  },
  disc(g, s) {
    g.fillStyle = "rgba(14,8,8,0.92)";
    g.beginPath();
    g.arc(0, 0, s * 0.92, 0, TAU);
    g.fill();
    halo(g, s * 0.9, "255,30,30", 0.6);
    g.strokeStyle = "rgba(255,90,70,0.9)";
    g.lineWidth = s * 0.05;
    g.beginPath();
    g.arc(0, 0, s * 0.88, 0, TAU);
    g.stroke();
    rimLit(g, () => boneSkull(g, s * 0.85), "rgba(255,40,40,1)", s * 0.25);
  },
  slam: (g, s) => {
    halo(g, s, "255,30,30", 0.35);
    rimLit(g, () => SET_A.slam(g, s), "rgba(255,40,40,1)", s * 0.3);
  },
  charge: (g, s) => {
    halo(g, s, "255,30,30", 0.35);
    rimLit(g, () => SET_A.charge(g, s), "rgba(255,40,40,1)", s * 0.3);
  },
  throw: (g, s) => {
    halo(g, s, "255,30,30", 0.35);
    rimLit(g, () => SET_A.throw(g, s), "rgba(255,40,40,1)", s * 0.3);
  },
};

/** Paints `fn` (a shape filled in any colour) as red spray paint: soft overspray, mist dots, a few drips. */
function spray(g: G, s: number, fn: (col: string) => void, seed: number): void {
  const r = rng(seed);
  g.save();
  g.filter = `blur(${Math.max(1, s * 0.06)}px)`;
  g.globalAlpha = 0.45;
  fn("#d01818");
  g.restore();
  fn("#c4161a");
  // mist
  g.fillStyle = "rgba(210,24,24,0.5)";
  for (let i = 0; i < 70; i++) {
    const a = r() * TAU;
    const d = s * (0.5 + r() * 0.55);
    g.fillRect(Math.cos(a) * d, Math.sin(a) * d, 1, 1);
  }
  // drips
  g.fillStyle = "#b31417";
  for (let i = 0; i < 3; i++) {
    const x = (r() - 0.5) * s * 0.6;
    const y0 = s * (0.25 + r() * 0.1);
    const l = s * (0.25 + r() * 0.35);
    g.fillRect(x - 0.8, y0, 1.8, l);
    g.beginPath();
    g.arc(x + 0.1, y0 + l, 1.6, 0, TAU);
    g.fill();
  }
}

/** E "Spray paint": the marks a survivor would paint on a wall: red stencils with overspray and drips. */
const SET_E: FxSet = {
  id: "E",
  skull(g, s) {
    spray(g, s, (col) => flatSkull(g, s * 1.15, col), 3);
  },
  disc(g, s) {
    g.fillStyle = "#2b2a28"; // a concrete chip
    g.beginPath();
    g.arc(0, 0, s * 0.92, 0, TAU);
    g.fill();
    spray(
      g,
      s,
      (col) => {
        g.strokeStyle = col;
        g.lineWidth = s * 0.1;
        g.beginPath();
        g.arc(0, 0, s * 0.74, 0, TAU);
        g.stroke();
        flatSkull(g, s * 0.85, col);
      },
      5,
    );
  },
  slam(g, s) {
    spray(
      g,
      s,
      (col) => {
        g.fillStyle = col;
        g.fillRect(-s * 0.12, -s * 0.8, s * 0.24, s * 0.7);
        g.beginPath();
        g.moveTo(-s * 0.4, -s * 0.15);
        g.lineTo(s * 0.4, -s * 0.15);
        g.lineTo(0, s * 0.3);
        g.fill();
        g.fillRect(-s * 0.8, s * 0.42, s * 1.6, s * 0.12);
      },
      7,
    );
  },
  charge(g, s) {
    spray(
      g,
      s,
      (col) => {
        g.fillStyle = col;
        for (const dx of [-0.45, 0.05]) {
          g.beginPath();
          g.moveTo(s * (dx + 0.45), 0);
          g.lineTo(s * (dx - 0.05), -s * 0.5);
          g.lineTo(s * (dx - 0.05), s * 0.5);
          g.fill();
        }
      },
      9,
    );
  },
  throw(g, s) {
    spray(
      g,
      s,
      (col) => {
        g.fillStyle = col;
        g.beginPath();
        g.moveTo(-s * 0.05, -s * 0.3);
        g.lineTo(s * 0.45, -s * 0.45);
        g.lineTo(s * 0.65, s * 0.05);
        g.lineTo(s * 0.35, s * 0.45);
        g.lineTo(-s * 0.2, s * 0.35);
        g.fill();
        g.strokeStyle = col;
        g.lineWidth = s * 0.1;
        g.beginPath();
        g.arc(-s * 0.2, s * 0.55, s * 0.6, -2.9, -1.9);
        g.stroke();
      },
      11,
    );
  },
};

/** Draws a shape as smouldering embers: charred dark body, glowing hot edges and cracks. */
function ember(g: G, s: number, shape: () => void, seed: number): void {
  // the glow behind
  g.save();
  g.shadowColor = "rgba(255,90,20,1)";
  g.shadowBlur = s * 0.4;
  g.fillStyle = "#2a0d06";
  shape();
  g.restore();
  // charred body with a hot-edge stroke
  g.save();
  g.fillStyle = "#1a0b07";
  shape();
  g.clip();
  const r = rng(seed);
  for (let i = 0; i < 6; i++) {
    let x = (r() - 0.5) * s;
    let y = (r() - 0.5) * s;
    let a = r() * TAU;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      a += (r() - 0.5) * 1.2;
      x += Math.cos(a) * s * 0.12;
      y += Math.sin(a) * s * 0.12;
      g.lineTo(x, y);
    }
    g.strokeStyle = "rgba(255,120,30,0.9)";
    g.lineWidth = Math.max(1, s * 0.035);
    g.stroke();
  }
  const inner = g.createRadialGradient(0, 0, 0, 0, 0, s);
  inner.addColorStop(0, "rgba(255,80,20,0.25)");
  inner.addColorStop(1, "rgba(255,80,20,0)");
  g.fillStyle = inner;
  g.fillRect(-s, -s, 2 * s, 2 * s);
  g.restore();
}

/** Shapes as fill paths (used by the ember and beacon sets). */
function skullPath(g: G, s: number): void {
  // a filled skull silhouette as one path, holes drawn after
  g.beginPath();
  g.arc(0, -0.08 * s, 0.4 * s, 0, TAU);
  g.fill();
  roundRect(g, -0.22 * s, 0.1 * s, 0.44 * s, 0.3 * s, 0.06 * s);
  g.fill();
}

function skullHoles(g: G, s: number, col: string): void {
  g.fillStyle = col;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(sx * 0.16 * s, -0.06 * s, 0.11 * s, 0.1 * s, 0, 0, TAU);
    g.fill();
  }
  g.beginPath();
  g.moveTo(0, 0.07 * s);
  g.lineTo(-0.045 * s, 0.17 * s);
  g.lineTo(0.045 * s, 0.17 * s);
  g.fill();
}

/** F "Embers": charred shapes with glowing orange edges and cracks, like the fire and the S1 glow. */
const SET_F: FxSet = {
  id: "F",
  skull(g, s) {
    ember(g, s, () => skullPath(g, s * 1.15), 3);
    skullHoles(g, s * 1.15, "rgba(255,170,60,0.95)");
  },
  disc(g, s) {
    g.fillStyle = "rgba(12,6,4,0.92)";
    g.beginPath();
    g.arc(0, 0, s * 0.92, 0, TAU);
    g.fill();
    g.save();
    g.shadowColor = "rgba(255,90,20,1)";
    g.shadowBlur = s * 0.3;
    g.strokeStyle = "rgba(255,120,40,0.95)";
    g.lineWidth = s * 0.06;
    g.beginPath();
    g.arc(0, 0, s * 0.84, 0, TAU);
    g.stroke();
    g.restore();
    ember(g, s * 0.85, () => skullPath(g, s * 0.85), 4);
    skullHoles(g, s * 0.85, "rgba(255,170,60,0.95)");
  },
  slam(g, s) {
    ember(
      g,
      s,
      () => {
        g.beginPath();
        g.rect(-s * 0.14, -s * 0.8, s * 0.28, s * 0.6);
        g.moveTo(-s * 0.42, -s * 0.22);
        g.lineTo(s * 0.42, -s * 0.22);
        g.lineTo(0, s * 0.28);
        g.closePath();
        g.rect(-s * 0.8, s * 0.42, s * 1.6, s * 0.14);
        g.fill();
      },
      5,
    );
  },
  charge(g, s) {
    ember(
      g,
      s,
      () => {
        g.beginPath();
        for (const dx of [-0.45, 0.05]) {
          g.moveTo(s * (dx + 0.45), 0);
          g.lineTo(s * (dx - 0.05), -s * 0.52);
          g.lineTo(s * (dx - 0.05), s * 0.52);
          g.closePath();
        }
        g.fill();
      },
      6,
    );
  },
  throw(g, s) {
    ember(
      g,
      s,
      () => {
        g.beginPath();
        g.moveTo(-s * 0.3, -s * 0.35);
        g.lineTo(s * 0.35, -s * 0.55);
        g.lineTo(s * 0.72, -s * 0.05);
        g.lineTo(s * 0.45, s * 0.5);
        g.lineTo(-s * 0.2, s * 0.55);
        g.lineTo(-s * 0.5, s * 0.1);
        g.closePath();
        g.fill();
      },
      7,
    );
  },
};

/** A red emergency beacon lens (dome with a hot core and a highlight). */
function beacon(g: G, s: number): void {
  halo(g, s * 1.2, "255,30,30", 0.5);
  const gr = g.createRadialGradient(-s * 0.2, -s * 0.25, s * 0.05, 0, 0, s * 0.8);
  gr.addColorStop(0, "#ffd9cf");
  gr.addColorStop(0.25, "#ff4a3a");
  gr.addColorStop(0.8, "#a50f12");
  gr.addColorStop(1, "#4a0608");
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, s * 0.8, 0, TAU);
  g.fill();
  g.strokeStyle = "#1a1a1a";
  g.lineWidth = s * 0.08;
  g.stroke();
  g.fillStyle = "rgba(255,255,255,0.55)";
  g.beginPath();
  g.ellipse(-s * 0.28, -s * 0.34, s * 0.2, s * 0.1, -0.6, 0, TAU);
  g.fill();
}

/** G "Beacon": the boss marked by a red emergency light, like the police and ambulance lights in the city. */
const SET_G: FxSet = {
  id: "G",
  skull(g, s) {
    beacon(g, s);
    g.save();
    g.globalAlpha = 0.85;
    flatSkull(g, s * 0.75, "#2a0204");
    g.restore();
  },
  disc(g, s) {
    // light beams of a rotating beacon
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const a of [0.4, 0.4 + Math.PI]) {
      const gr = g.createRadialGradient(0, 0, 0, 0, 0, s);
      gr.addColorStop(0, "rgba(255,60,40,0.45)");
      gr.addColorStop(1, "rgba(255,60,40,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.moveTo(0, 0);
      g.arc(0, 0, s, a - 0.35, a + 0.35);
      g.closePath();
      g.fill();
    }
    g.restore();
    beacon(g, s * 0.8);
    g.save();
    g.globalAlpha = 0.85;
    flatSkull(g, s * 0.6, "#2a0204");
    g.restore();
  },
  slam(g, s) {
    beacon(g, s * 0.9);
    g.strokeStyle = "rgba(40,2,4,0.85)";
    g.lineWidth = s * 0.1;
    for (const r of [0.2, 0.45]) {
      g.beginPath();
      g.arc(0, 0, s * r, 0, TAU);
      g.stroke();
    }
  },
  charge(g, s) {
    beacon(g, s * 0.9);
    g.fillStyle = "rgba(40,2,4,0.85)";
    for (const dx of [-0.32, 0.12]) {
      g.beginPath();
      g.moveTo(s * (dx + 0.3), 0);
      g.lineTo(s * (dx - 0.06), -s * 0.36);
      g.lineTo(s * (dx - 0.06), s * 0.36);
      g.fill();
    }
  },
  throw(g, s) {
    beacon(g, s * 0.9);
    g.fillStyle = "rgba(40,2,4,0.85)";
    g.beginPath();
    g.moveTo(-s * 0.2, -s * 0.18);
    g.lineTo(s * 0.22, -s * 0.32);
    g.lineTo(s * 0.4, s * 0.04);
    g.lineTo(s * 0.18, s * 0.34);
    g.lineTo(-s * 0.28, s * 0.25);
    g.fill();
  },
};

// ─────────────────────────────── realistic ground damage ───────────────────────────────

interface DamageOpts {
  readonly bowl: number; // how deep the impact dish reads (0 = flat)
  readonly cracks: number; // number of main fractures
  readonly soot: number; // scorch strength
  readonly rays: number; // dust ejecta strength
  readonly debris: number; // loose chunks
  readonly seed: number;
}

/**
 * Ground damage on a transparent 256 px decal (9 m), built like a photo rather than a drawing: a shaded
 * impact dish from a noise height field, tapering branching fractures with a lit lip, a broken
 * fragment zone, dust ejecta rays and loose aggregate. `o` tunes the three takes.
 */
function groundDamage(o: DamageOpts): HTMLCanvasElement {
  const N = 256;
  const c = canvas(N, N);
  const g = ctx(c);
  const img = g.createImageData(N, N);
  const d = img.data;
  const cx = N / 2;
  const R0 = N * 0.15; // dish radius
  const hAt = (x: number, y: number): number => {
    const dx = (x - cx) / R0;
    const dy = (y - cx) / R0;
    const r = Math.sqrt(dx * dx + dy * dy);
    const dish = r < 1.6 ? -Math.cos(Math.min(1, r / 1.25) * Math.PI * 0.5) * (1 - Math.max(0, r - 1.25) / 0.35) : 0;
    const rim = Math.exp(-((r - 1.25) ** 2) / 0.04) * 0.25; // pushed-up lip
    const n = fbm(x / 9, y / 9, o.seed, 4) - 0.5;
    return (dish + rim) * o.bowl + n * 0.35 * Math.min(1, 1.8 / (r + 0.3));
  };
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const i = (y * N + x) * 4;
      const nx = hAt(x - 1, y) - hAt(x + 1, y);
      const ny = hAt(x, y - 1) - hAt(x, y + 1);
      const shade = (nx * -0.55 + ny * -0.83) * 6; // light from the top-left (the map's light)
      const dx = (x - cx) / (N / 2);
      const dy = (y - cx) / (N / 2);
      const r = Math.sqrt(dx * dx + dy * dy);
      const fade = Math.max(0, 1 - r / 0.62);
      // scorch / soot
      const soot = o.soot * Math.max(0, 1 - r / (0.32 + 0.12 * fbm(x / 20, y / 20, o.seed + 9, 3))) * (0.7 + 0.3 * fbm(x / 6, y / 6, o.seed + 4, 3));
      // dust ejecta: radial streaks
      const ang = Math.atan2(dy, dx);
      const ray = Math.pow(fbm(Math.cos(ang) * 6 + 10, Math.sin(ang) * 6 + 10, o.seed + 2, 3), 3) * 4;
      const dust = o.rays * ray * Math.max(0, 1 - Math.abs(r - 0.45) / 0.32) * (0.6 + 0.4 * fbm(x / 3, y / 3, o.seed + 5, 2));
      let lr = 0;
      let lg = 0;
      let lb = 0;
      let a = 0;
      if (shade > 0) {
        lr = lg = lb = 200;
        a = Math.min(0.5, shade * 0.6) * fade;
      } else {
        a = Math.min(0.75, -shade * 0.8) * fade;
      }
      // composite soot (dark brown-black) and dust (pale grey) over the shading
      const sa = Math.min(0.85, soot);
      lr = lr * (1 - sa) + 18 * sa;
      lg = lg * (1 - sa) + 14 * sa;
      lb = lb * (1 - sa) + 12 * sa;
      a = a + sa * (1 - a);
      const da = Math.min(0.35, dust);
      lr = lr * (1 - da) + 150 * da;
      lg = lg * (1 - da) + 144 * da;
      lb = lb * (1 - da) + 134 * da;
      a = a + da * (1 - a);
      d[i] = lr;
      d[i + 1] = lg;
      d[i + 2] = lb;
      d[i + 3] = Math.round(a * 255);
    }
  }
  g.putImageData(img, 0, 0);
  // fractures: branching, tapering, jagged at small scale, a lit lip on the light side
  const r = rng(o.seed);
  const crack = (x: number, y: number, a: number, len: number, w: number, depth: number): void => {
    const pts: [number, number, number][] = [[x, y, w]];
    let px = x;
    let py = y;
    let pa = a;
    for (let t = 0; t < len; t += 2.2) {
      // asphalt splits in straight runs with sharp kinks (not curling like roots)
      pa += (r() - 0.5) * 0.16 + (fbm(px / 30, py / 30, o.seed + 30, 2) - 0.5) * 0.1 + (r() < 0.07 ? (r() - 0.5) * 1.3 : 0);
      px += Math.cos(pa) * 2.2;
      py += Math.sin(pa) * 2.2;
      pts.push([px, py, w * (1 - t / len) + 0.35]);
      if (depth < 2 && r() < 0.022) crack(px, py, pa + (r() < 0.5 ? -1 : 1) * (0.5 + r() * 0.6), len * (0.3 + r() * 0.3), w * 0.55, depth + 1);
    }
    for (const [ox, oy, col, k] of [
      [-0.8, -0.8, "rgba(190,185,175,0.18)", 1.1],
      [0, 0, "rgba(6,5,4,0.92)", 1],
    ] as const) {
      g.strokeStyle = col;
      g.lineCap = "round";
      for (let i = 1; i < pts.length; i++) {
        const [x0, y0, w0] = pts[i - 1] as [number, number, number];
        const [x1, y1] = pts[i] as [number, number, number];
        g.lineWidth = w0 * k;
        g.beginPath();
        g.moveTo(x0 + ox, y0 + oy);
        g.lineTo(x1 + ox, y1 + oy);
        g.stroke();
      }
    }
  };
  for (let i = 0; i < o.cracks; i++) {
    const a = (i / o.cracks) * TAU + r() * 0.4;
    const start = R0 * (0.3 + r() * 0.5);
    crack(cx + Math.cos(a) * start, cx + Math.sin(a) * start, a, N * (0.18 + r() * 0.22), 1.6 + r() * 1.2, 0);
  }
  // the fragment zone: short concentric cracks that break the dish into pieces
  for (let i = 0; i < o.cracks * 2; i++) {
    const a = r() * TAU;
    const rr = R0 * (0.5 + r() * 0.9);
    crack(cx + Math.cos(a) * rr, cx + Math.sin(a) * rr, a + Math.PI / 2 + (r() - 0.5) * 0.6, 10 + r() * 16, 1.3, 2);
  }
  // loose aggregate and chunks with tiny shadows
  for (let i = 0; i < o.debris; i++) {
    const a = r() * TAU;
    const dd = R0 * (0.6 + Math.pow(r(), 0.7) * 2.6);
    const x = cx + Math.cos(a) * dd;
    const y = cx + Math.sin(a) * dd;
    const s = r() < 0.15 ? 2 + r() * 3 : 0.8 + r() * 1.2;
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(x + 0.8, y + 0.8, s, s * 0.8);
    const v = Math.round(55 + r() * 55);
    g.fillStyle = `rgb(${v},${v - 3},${v - 6})`;
    g.fillRect(x, y, s, s * 0.8);
  }
  return c;
}

const R1 = (): HTMLCanvasElement => groundDamage({ bowl: 1, cracks: 11, soot: 0, rays: 0.6, debris: 260, seed: 7 });
const R2 = (): HTMLCanvasElement => groundDamage({ bowl: 0.8, cracks: 9, soot: 0.75, rays: 0.4, debris: 180, seed: 19 });
const R3 = (): HTMLCanvasElement => groundDamage({ bowl: 0.35, cracks: 7, soot: 0, rays: 0.25, debris: 90, seed: 23 });

// ─────────────────────────────── page wiring ───────────────────────────────

function icon(draw: (g: G, s: number) => void, px: number, scale: number): HTMLCanvasElement {
  const c = canvas(px * scale, px * scale);
  const g = ctx(c);
  g.fillStyle = "#1a1d21";
  g.fillRect(0, 0, c.width, c.height);
  g.translate(c.width / 2, c.height / 2);
  g.scale(scale, scale);
  draw(g, px / 2);
  return c;
}

function decalOnStreet(decal: HTMLCanvasElement, lit: boolean): HTMLCanvasElement {
  const W = 300;
  const c = canvas(W, W);
  const g = ctx(c);
  asphalt(g, W, W, 41);
  g.fillStyle = GROUND.lane;
  for (let y = 0; y < W; y += 60) g.fillRect(36, y, 3, 34);
  g.globalAlpha = 0.85; // BossView draws decals at 0.85
  g.drawImage(decal, 22, 22, 256, 256);
  g.globalAlpha = 1;
  if (!lit) night(g, W, W, 0.35, [[60, 50, 160]]);
  return c;
}

function main(): void {
  const takes: TeleOption[] = [S1, S1A, S1B, S1C, S1D, S1E];
  for (const o of takes) put(`tele-${o.id}`, scene(o));
  for (const set of [SET_D, SET_E, SET_F, SET_G]) {
    put(`fx-${set.id}`, icon(set.skull, 64, 2));
    put(`fx-${set.id}`, icon(set.disc, 72, 2));
    for (const ic of [set.slam, set.charge, set.throw]) put(`fx-${set.id}`, icon(ic, 48, 2));
  }
  for (const [id, mk] of [
    ["R1", R1],
    ["R2", R2],
    ["R3", R3],
  ] as const) {
    const decal = mk();
    put(`dmg-${id}`, decalOnStreet(decal, true));
    put(`dmg-${id}`, decalOnStreet(decal, false));
  }
  put("combo-D", scene(S1A, { fx: SET_D, decal: R1(), W: 420 }));
  put("combo-F", scene(S1E, { fx: SET_F, decal: R2(), W: 420 }));
  put("combo-G", scene(S1C, { fx: SET_G, decal: R3(), W: 420 }));
  void splat;
}

main();
