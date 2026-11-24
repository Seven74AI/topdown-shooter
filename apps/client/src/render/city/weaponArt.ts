/**
 * Story 5.3: the Shotgun and Assault Rifle art, drawn in game code (Canvas 2D; Epic 5 art method).
 * Story 5.2 adds the Fire Axe (AX1) and the Chainsaw (CS1, with its running-blade view), ported from
 * `docs/art/epic-5/round-b/looks.html`.
 * Each gun is ONE drawing function with two views, so the designer's final pick drops in by
 * replacing that function:
 *
 * - `"icon"`: the side-view shop icon, ported from `docs/art/epic-5/round-a/code-drawings.html`
 *   (G1 pump-action shotgun, R2 classic assault rifle; Story 5.1: G3/R1 are their upgrade-tier
 *   looks at levels III–IV, icon only, `WEAPON_TIER_ICON`), units in
 *   metres centred on the gun, scaled by `size` px per metre;
 * - `"held"`: the top-down gun in the survivor's hands (the survivor frames `survivor_shotgun_a`,
 *   `survivor_assault_rifle_a`), facing +x from the body centre, `size` = the collision radius in px
 *   (the `drawSurvivor` convention). Readable at a glance: the Shotgun short and fat with a ribbed
 *   wooden pump; the Assault Rifle long and thin, black receiver between wooden stock and handguard,
 *   with its curved magazine showing at the side.
 *
 * No Phaser here; drawn once into an atlas / icon canvas, never per frame.
 */
type G = CanvasRenderingContext2D;
export type WeaponArtView = "icon" | "held";

const TAU = Math.PI * 2;
/** Device px per canvas px of the icon canvas (the rim/inner offsets of `part` are in device px). */
const DPR = 2;
/** One logical px in object units (metres): set per draw. */
let P = 1;

function mulberry(a: number): () => number {
  let s = a | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function rgbOf(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
function shade(h: string, t: number): string {
  const f = t < 0 ? 0 : 255;
  const a = Math.abs(t);
  const c = rgbOf(h).map((v) => Math.round(v + (f - v) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
type PathFn = (c: G) => void;
function R(c: G, x: number, y: number, w: number, h: number, r = 0): void {
  if (!r) {
    c.moveTo(x, y);
    c.lineTo(x + w, y);
    c.lineTo(x + w, y + h);
    c.lineTo(x, y + h);
    c.closePath();
    return;
  }
  const q = Math.min(r, w / 2, h / 2);
  c.moveTo(x + q, y);
  c.arcTo(x + w, y, x + w, y + h, q);
  c.arcTo(x + w, y + h, x, y + h, q);
  c.arcTo(x, y + h, x, y, q);
  c.arcTo(x, y, x + w, y, q);
  c.closePath();
}
function E(c: G, x: number, y: number, rx: number, ry: number, a = 0): void {
  c.moveTo(x + rx * Math.cos(a), y + rx * Math.sin(a));
  c.ellipse(x, y, Math.max(1e-5, rx), Math.max(1e-5, ry), a, 0, TAU);
  c.closePath();
}
function Pg(c: G, p: readonly number[]): void {
  c.moveTo(p[0] as number, p[1] as number);
  for (let i = 2; i < p.length; i += 2) c.lineTo(p[i] as number, p[i + 1] as number);
  c.closePath();
}
function fillP(c: G, fn: PathFn, style: string | CanvasGradient): void {
  c.beginPath();
  fn(c);
  c.fillStyle = style;
  c.fill();
}
function strokeP(c: G, fn: PathFn, style: string, w: number, cap: CanvasLineCap = "round"): void {
  c.beginPath();
  fn(c);
  c.strokeStyle = style;
  c.lineWidth = w;
  c.lineCap = cap;
  c.lineJoin = "round";
  c.stroke();
}
function devToLocal(c: G, dx: number, dy: number): [number, number] {
  const m = c.getTransform();
  const det = m.a * m.d - m.b * m.c;
  return [(m.d * dx - m.c * dy) / det, (-m.b * dx + m.a * dy) / det];
}
/** The light comes from the screen's upper left whatever the object's rotation. */
function lightDir(c: G): [number, number] {
  const v = devToLocal(c, -1, -1);
  const l = Math.hypot(v[0], v[1]);
  return [v[0] / l, v[1] / l];
}
function rivet(c: G, x: number, y: number, r: number, base: string, hex = false): void {
  c.beginPath();
  if (hex) {
    // Story 5.1 (G3/R1): a hex bolt head
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3;
      if (i) c.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
      else c.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    c.closePath();
  } else E(c, x, y, r, r);
  const L = lightDir(c);
  const g = c.createRadialGradient(x + L[0] * r * 0.45, y + L[1] * r * 0.45, 0, x, y, r * 1.05);
  g.addColorStop(0, shade(base, 0.55));
  g.addColorStop(0.55, base);
  g.addColorStop(1, shade(base, -0.55));
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 0.7 * P;
  c.strokeStyle = "rgba(0,0,0,0.65)";
  c.stroke();
}
type Tex = (c: G, x0: number, y0: number, x1: number, y1: number) => void;
interface PartOpts {
  base: string;
  box: readonly [number, number, number, number];
  tex?: Tex;
  hi?: number;
  lo?: number;
  rim?: number;
  inner?: number;
  line?: number;
  /** Story 5.1 (U1 plate): "top" = a light gradient along the screen light, not the part's vertical. */
  lit?: "top";
  /** Outline colour (default near-black). */
  stroke?: string;
}
/** One shaded part: fill, texture, light gradient, rim light upper-left, inner shade lower-right, outline. */
function part(c: G, path: PathFn, o: PartOpts): void {
  const [x0, y0, x1, y1] = o.box;
  const w = x1 - x0;
  const h = y1 - y0;
  c.beginPath();
  path(c);
  c.fillStyle = o.base;
  c.fill();
  c.save();
  c.clip();
  if (o.tex) o.tex(c, x0, y0, x1, y1);
  const hi = o.hi ?? 0.22;
  const lo = o.lo ?? 0.4;
  let g: CanvasGradient;
  if (o.lit === "top") {
    const L = lightDir(c);
    const s = Math.hypot(w, h) / 2;
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    g = c.createLinearGradient(cx + L[0] * s, cy + L[1] * s, cx - L[0] * s, cy - L[1] * s);
    g.addColorStop(0, `rgba(200,215,240,${hi})`);
    g.addColorStop(0.5, "rgba(0,0,0,0)");
    g.addColorStop(1, `rgba(0,0,0,${lo})`);
  } else {
    g = c.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, `rgba(215,225,242,${hi})`);
    g.addColorStop(0.2, `rgba(215,225,242,${hi * 0.3})`);
    g.addColorStop(0.5, "rgba(0,0,0,0.04)");
    g.addColorStop(0.85, `rgba(0,0,0,${lo})`);
    g.addColorStop(1, `rgba(60,72,90,${lo * 0.35})`);
  }
  c.fillStyle = g;
  c.fillRect(x0 - w, y0 - h, w * 3, h * 3);
  const rim = o.rim ?? 0.42;
  if (rim > 0) {
    const d = devToLocal(c, 1.5 * DPR, 1.7 * DPR);
    c.beginPath();
    c.rect(x0 - w, y0 - h, w * 3, h * 3);
    c.save();
    c.translate(d[0], d[1]);
    path(c);
    c.restore();
    c.fillStyle = `rgba(195,210,235,${rim})`;
    c.fill("evenodd");
  }
  const dk = o.inner ?? 0.32;
  if (dk > 0) {
    const d = devToLocal(c, -1.3 * DPR, -1.5 * DPR);
    c.beginPath();
    c.rect(x0 - w, y0 - h, w * 3, h * 3);
    c.save();
    c.translate(d[0], d[1]);
    path(c);
    c.restore();
    c.fillStyle = `rgba(0,0,0,${dk})`;
    c.fill("evenodd");
  }
  c.restore();
  if (o.line !== 0) {
    c.beginPath();
    path(c);
    c.lineJoin = "round";
    c.strokeStyle = o.stroke ?? "rgba(4,4,6,0.95)";
    c.lineWidth = (o.line ?? 1.3) * P;
    c.stroke();
  }
}

// ---------- textures (drawn inside a clip, object units) ----------
function woodTex(seed: number, ang = 0): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const L = Math.hypot(x1 - x0, y1 - y0);
    c.save();
    c.translate((x0 + x1) / 2, (y0 + y1) / 2);
    c.rotate(ang);
    for (let i = 0; i < 90; i++) {
      const y = (r() - 0.5) * L;
      const amp = L * (0.0015 + r() * 0.005);
      const f = (2 + r() * 5) / L;
      const ph = r() * TAU;
      c.beginPath();
      for (let k = 0; k <= 48; k++) {
        const x = -L / 2 + (L * k) / 48;
        const yy = y + Math.sin(x * f * 4 + ph) * amp + Math.sin(x * f * 11 + ph * 2) * amp * 0.2;
        if (k) c.lineTo(x, yy);
        else c.moveTo(x, yy);
      }
      c.strokeStyle = r() < 0.72 ? `rgba(28,14,6,${0.14 + r() * 0.32})` : `rgba(205,160,110,${0.05 + r() * 0.1})`;
      c.lineWidth = (0.5 + r() * 1.5) * P;
      c.stroke();
    }
    for (let i = 0; i < 7; i++) {
      const x = (r() - 0.5) * L;
      const y = (r() - 0.5) * L * 0.5;
      const rr = L * (0.04 + r() * 0.1);
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      g.addColorStop(0, "rgba(175,135,92,0.2)");
      g.addColorStop(1, "rgba(175,135,92,0)");
      c.fillStyle = g;
      c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    for (let i = 0; i < 30; i++) {
      const x = (r() - 0.5) * L;
      const y = (r() - 0.5) * L * 0.5;
      const l = L * (0.004 + r() * 0.03);
      const a = (r() - 0.5) * 1.4;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      c.strokeStyle = `rgba(225,195,155,${0.1 + r() * 0.22})`;
      c.lineWidth = (0.4 + r() * 0.6) * P;
      c.stroke();
    }
    c.restore();
  };
}
function steelTex(seed: number, wear = 0.5): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    const area = (w * h) / (P * P);
    for (let i = 0; i < Math.min(140, area * 0.012); i++) {
      c.fillStyle = r() < 0.5 ? `rgba(200,210,225,${0.03 + r() * 0.05})` : `rgba(0,0,0,${0.05 + r() * 0.08})`;
      c.fillRect(x0 + r() * w, y0 + r() * h, w * (0.05 + r() * 0.3), 0.6 * P);
    }
    const n = Math.min(500, area * 0.03 * wear);
    for (let i = 0; i < n; i++) {
      const ed = r() < 0.6;
      const x = x0 + r() * w;
      const y = ed ? (r() < 0.5 ? y0 + r() * h * 0.15 : y1 - r() * h * 0.12) : y0 + r() * h;
      const v = (150 + r() * 45) | 0;
      c.fillStyle = `rgba(${v},${v},${v + 12},${0.07 + r() * 0.2})`;
      const s = P * (0.6 + r() * 1.4);
      c.fillRect(x, y, s * (1 + r() * 2), s);
    }
    if (wear > 0.7) {
      for (let i = 0; i < Math.min(50, area * 0.003); i++) {
        c.fillStyle = `rgba(115,62,30,${0.15 + r() * 0.25})`;
        c.beginPath();
        c.arc(x0 + r() * w, y0 + r() * h, P * (0.8 + r() * 2.5), 0, TAU);
        c.fill();
      }
    }
  };
}
function polyTex(seed: number, check = false): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    const n = Math.min(1600, ((w * h) / (P * P)) * 0.12);
    for (let i = 0; i < n; i++) {
      c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.025 + r() * 0.05})` : `rgba(0,0,0,${0.08 + r() * 0.12})`;
      c.fillRect(x0 + r() * w, y0 + r() * h, P * (0.8 + r()), P * (0.8 + r()));
    }
    if (check) {
      // Story 5.1 (R1 grip): checkering
      c.strokeStyle = "rgba(0,0,0,0.4)";
      c.lineWidth = 0.7 * P;
      c.beginPath();
      const s = 3 * P;
      for (let k = -h; k < w + h; k += s) {
        c.moveTo(x0 + k, y0);
        c.lineTo(x0 + k + h, y1);
        c.moveTo(x0 + k + h, y0);
        c.lineTo(x0 + k, y1);
      }
      c.stroke();
    }
  };
}
function trigger(c: G, tg: PathFn, tr: PathFn): void {
  strokeP(c, tg, "#050506", 0.0075 + 2 * P);
  strokeP(c, tg, "#24262a", 0.0075);
  c.save();
  c.translate(0, -0.0022);
  strokeP(c, tg, "rgba(170,180,195,0.35)", 1.1 * P);
  c.restore();
  strokeP(c, tr, "#050506", 0.0055 + 2 * P);
  strokeP(c, tr, "#2e3035", 0.0055);
}

// ---------- held (top-down) helpers: units = collision radii × r px ----------
const HELD = { steel: "#1d1f22", steelHi: "#4a4f57", wood: "#6a4426", woodDark: "#3a2312", outline: "rgba(6,6,6,0.85)" } as const;
function heldPart(c: G, path: PathFn, fill: string, r: number): void {
  c.beginPath();
  path(c);
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = Math.max(1, r * 0.05);
  c.strokeStyle = HELD.outline;
  c.stroke();
}
/** A light streak along the upper (−y, toward the light) edge of a top-down part. */
function heldGlint(c: G, x0: number, x1: number, y: number, r: number, a = 0.45): void {
  strokeP(c, (q) => {
    q.moveTo(x0, y);
    q.lineTo(x1, y);
  }, `rgba(190,205,225,${a})`, Math.max(0.8, r * 0.03), "butt");
}

/**
 * G1 pump-action shotgun (worn wooden stock and ribbed forend, dull black steel). `view` "icon":
 * side view, `size` px per metre, centred; "held": top-down in the survivor's hands, `size` = r px.
 */
export function drawShotgun(c: G, view: WeaponArtView, size: number): void {
  if (view === "held") {
    const r = size;
    c.lineJoin = "round";
    // stock (at the shoulder) → receiver → barrel over the magazine tube → ribbed pump
    heldPart(c, (q) => R(q, r * 0.1, -r * 0.16, r * 0.62, r * 0.32, r * 0.1), HELD.wood, r);
    heldPart(c, (q) => R(q, r * 0.66, -r * 0.15, r * 0.42, r * 0.3, r * 0.04), HELD.steel, r);
    heldPart(c, (q) => R(q, r * 1.05, -r * 0.09, r * 1.08, r * 0.18, r * 0.04), HELD.steel, r);
    heldGlint(c, r * 1.08, r * 2.08, -r * 0.05, r);
    heldPart(c, (q) => R(q, r * 1.22, -r * 0.17, r * 0.5, r * 0.34, r * 0.08), HELD.wood, r);
    for (let k = 1; k < 6; k++) strokeP(c, (q) => { q.moveTo(r * (1.22 + k * 0.083), -r * 0.16); q.lineTo(r * (1.22 + k * 0.083), r * 0.16); }, "rgba(20,9,3,0.8)", Math.max(1, r * 0.035), "butt");
    heldGlint(c, r * 0.14, r * 0.7, -r * 0.12, r, 0.25);
    fillP(c, (q) => E(q, r * 2.1, 0, r * 0.05, r * 0.05), "#cdbd8c"); // brass bead at the muzzle
    return;
  }
  P = 1 / size;
  c.save();
  c.scale(size, size);
  part(c, (q) => R(q, 0.02, -0.006, 0.425, 0.022, 0.004), { base: "#232528", box: [0.02, -0.006, 0.445, 0.016], tex: steelTex(3, 0.4), hi: 0.35 });
  part(c, (q) => R(q, 0.438, -0.009, 0.02, 0.028, 0.004), { base: "#2a2c30", box: [0.438, -0.009, 0.458, 0.019], hi: 0.4 });
  part(c, (q) => R(q, 0.02, -0.032, 0.476, 0.022, 0.003), { base: "#202226", box: [0.02, -0.032, 0.496, -0.01], tex: steelTex(4, 0.5), hi: 0.5 });
  part(c, (q) => R(q, 0.488, -0.0335, 0.012, 0.025, 0.003), { base: "#25272b", box: [0.488, -0.0335, 0.5, -0.0085], hi: 0.45 });
  fillP(c, (q) => E(q, 0.484, -0.0345, 0.0028, 0.002), "#cdbd8c");
  part(c, (q) => R(q, 0.414, -0.034, 0.014, 0.052, 0.002), { base: "#2b2d31", box: [0.414, -0.034, 0.428, 0.018], hi: 0.35 });
  part(c, (q) => R(q, 0.02, 0.008, 0.1, 0.007, 0.001), { base: "#3a3d42", box: [0.02, 0.008, 0.12, 0.015], hi: 0.3, rim: 0.2 });
  const fe: PathFn = (q) => {
    q.moveTo(0.112, -0.012);
    q.quadraticCurveTo(0.205, -0.019, 0.298, -0.012);
    q.quadraticCurveTo(0.306, 0.006, 0.298, 0.025);
    q.quadraticCurveTo(0.205, 0.031, 0.112, 0.025);
    q.quadraticCurveTo(0.104, 0.006, 0.112, -0.012);
    q.closePath();
  };
  part(c, fe, { base: "#5c3a21", box: [0.104, -0.019, 0.306, 0.031], tex: woodTex(21, 0), hi: 0.3 });
  c.save();
  c.beginPath();
  fe(c);
  c.clip();
  for (let x = 0.123; x < 0.29; x += 0.0102) {
    strokeP(c, (q) => { q.moveTo(x, -0.02); q.lineTo(x, 0.032); }, "rgba(14,6,2,0.78)", 1.8 * P, "butt");
    strokeP(c, (q) => { q.moveTo(x + 2 * P, -0.02); q.lineTo(x + 2 * P, 0.032); }, "rgba(225,175,125,0.2)", 1 * P, "butt");
  }
  c.restore();
  const st: PathFn = (q) => {
    q.moveTo(-0.488, -0.03);
    q.bezierCurveTo(-0.4, -0.027, -0.3, -0.022, -0.252, -0.015);
    q.quadraticCurveTo(-0.222, -0.011, -0.196, -0.03);
    q.lineTo(-0.192, 0.024);
    q.quadraticCurveTo(-0.222, 0.028, -0.245, 0.046);
    q.bezierCurveTo(-0.3, 0.072, -0.4, 0.09, -0.488, 0.104);
    q.closePath();
  };
  part(c, st, { base: "#57381f", box: [-0.488, -0.03, -0.192, 0.104], tex: woodTex(9, 0.08), hi: 0.28 });
  part(c, (q) => Pg(q, [-0.506, -0.032, -0.488, -0.03, -0.488, 0.104, -0.506, 0.108]), { base: "#151517", box: [-0.506, -0.032, -0.488, 0.108], tex: polyTex(5), hi: 0.2 });
  strokeP(c, (q) => { q.moveTo(-0.4886, -0.029); q.lineTo(-0.4886, 0.103); }, "rgba(205,205,198,0.6)", 1.2 * P);
  const rc: PathFn = (q) => {
    q.moveTo(-0.198, -0.035);
    q.lineTo(0.022, -0.035);
    q.quadraticCurveTo(0.028, -0.035, 0.028, -0.029);
    q.lineTo(0.028, 0.012);
    q.lineTo(0.012, 0.026);
    q.lineTo(-0.198, 0.026);
    q.closePath();
  };
  part(c, rc, { base: "#26282c", box: [-0.198, -0.035, 0.028, 0.026], tex: steelTex(12, 1), hi: 0.42 });
  fillP(c, (q) => R(q, -0.12, 0.016, 0.1, 0.007, 0.002), "#0a0a0b");
  fillP(c, (q) => R(q, -0.07, -0.027, 0.062, 0.019, 0.002), "#08090a");
  part(c, (q) => R(q, -0.064, -0.023, 0.05, 0.011, 0.001), { base: "#3d4146", box: [-0.064, -0.023, -0.014, -0.012], hi: 0.35, rim: 0.3, line: 0.8 });
  strokeP(c, (q) => { q.moveTo(-0.19, -0.03); q.lineTo(0.02, -0.03); }, "rgba(160,170,185,0.2)", 0.8 * P);
  trigger(
    c,
    (q) => {
      q.moveTo(-0.162, 0.024);
      q.quadraticCurveTo(-0.165, 0.06, -0.125, 0.06);
      q.lineTo(-0.1, 0.059);
      q.quadraticCurveTo(-0.08, 0.055, -0.078, 0.024);
    },
    (q) => {
      q.moveTo(-0.118, 0.024);
      q.quadraticCurveTo(-0.116, 0.04, -0.128, 0.048);
    },
  );
  for (const [x, y] of [[-0.17, 0.004], [-0.152, 0.017], [-0.03, 0.017], [0.012, 0.0]] as const) rivet(c, x, y, 0.0032, "#3a3d42");
  c.restore();
}

/**
 * R2 classic assault rifle (wooden furniture, curved steel magazine, worn). `view` "icon": side
 * view, `size` px per metre, centred; "held": top-down in the survivor's hands, `size` = r px.
 */
export function drawAssaultRifle(c: G, view: WeaponArtView, size: number): void {
  if (view === "held") {
    const r = size;
    c.lineJoin = "round";
    // curved magazine canted out to the side (the one thing a top-down rifle shows), under the rest
    heldPart(c, (q) => {
      q.moveTo(r * 0.98, r * 0.06);
      q.lineTo(r * 1.16, r * 0.06);
      q.quadraticCurveTo(r * 1.2, r * 0.3, r * 1.36, r * 0.44);
      q.lineTo(r * 1.2, r * 0.52);
      q.quadraticCurveTo(r * 1.03, r * 0.32, r * 0.98, r * 0.06);
      q.closePath();
    }, "#2f3134", r);
    heldPart(c, (q) => R(q, r * 0.08, -r * 0.11, r * 0.6, r * 0.22, r * 0.07), HELD.wood, r); // stock
    heldPart(c, (q) => R(q, r * 0.66, -r * 0.11, r * 0.62, r * 0.22, r * 0.03), "#33363a", r); // receiver + dust cover
    heldGlint(c, r * 0.7, r * 1.24, -r * 0.07, r);
    heldPart(c, (q) => R(q, r * 1.26, -r * 0.1, r * 0.46, r * 0.2, r * 0.06), HELD.wood, r); // handguard
    heldPart(c, (q) => R(q, r * 1.7, -r * 0.045, r * 0.56, r * 0.09, r * 0.02), HELD.steel, r); // barrel
    heldPart(c, (q) => R(q, r * 2.0, -r * 0.08, r * 0.07, r * 0.16, r * 0.02), HELD.steel, r); // front sight block
    heldPart(c, (q) => R(q, r * 2.2, -r * 0.07, r * 0.1, r * 0.14, r * 0.03), HELD.steel, r); // muzzle brake
    return;
  }
  P = 1 / size;
  const W = "#5b3820";
  c.save();
  c.scale(size, size);
  part(c, (q) => R(q, 0.2, -0.0335, 0.21, 0.0115, 0.002), { base: "#2a2b2d", box: [0.2, -0.0335, 0.41, -0.022], tex: steelTex(41, 0.8), hi: 0.45 });
  part(c, (q) => R(q, 0.205, -0.0195, 0.19, 0.004, 0.001), { base: "#34363a", box: [0.205, -0.0195, 0.395, -0.0155], hi: 0.3, rim: 0.2, line: 0.8 });
  part(c, (q) => Pg(q, [0.406, -0.036, 0.437, -0.036, 0.446, -0.019, 0.406, -0.019]), { base: "#2b2c2f", box: [0.406, -0.036, 0.446, -0.019], tex: steelTex(42, 0.9), hi: 0.4 });
  strokeP(c, (q) => { q.moveTo(0.428, -0.035); q.lineTo(0.428, -0.02); }, "rgba(0,0,0,0.6)", 1 * P);
  part(
    c,
    (q) => {
      q.moveTo(0.368, -0.036);
      q.lineTo(0.392, -0.036);
      q.lineTo(0.392, -0.017);
      q.lineTo(0.368, -0.017);
      q.closePath();
      Pg(q, [0.37, -0.036, 0.376, -0.036, 0.376, -0.074, 0.37, -0.07]);
      Pg(q, [0.384, -0.036, 0.39, -0.036, 0.39, -0.07, 0.384, -0.074]);
    },
    { base: "#2b2c2f", box: [0.368, -0.074, 0.392, -0.017], tex: steelTex(43, 0.9), hi: 0.4 },
  );
  strokeP(c, (q) => { q.moveTo(0.38, -0.036); q.lineTo(0.38, -0.064); }, "#1b1c1e", 0.0025);
  part(c, (q) => R(q, 0.18, -0.059, 0.07, 0.013, 0.004), { base: "#2d2e31", box: [0.18, -0.059, 0.25, -0.046], tex: steelTex(44, 0.9), hi: 0.4 });
  part(c, (q) => Pg(q, [0.238, -0.061, 0.258, -0.061, 0.258, -0.02, 0.236, -0.02]), { base: "#2a2b2e", box: [0.236, -0.061, 0.258, -0.02], tex: steelTex(45, 0.9), hi: 0.38 });
  const lh: PathFn = (q) => {
    q.moveTo(0.06, -0.034);
    q.lineTo(0.198, -0.034);
    q.quadraticCurveTo(0.204, -0.02, 0.198, 0.0);
    q.quadraticCurveTo(0.13, 0.014, 0.06, 0.012);
    q.closePath();
  };
  part(c, lh, { base: W, box: [0.06, -0.034, 0.204, 0.014], tex: woodTex(46, 0.02), hi: 0.3 });
  part(c, (q) => R(q, 0.194, -0.037, 0.014, 0.04, 0.002), { base: "#2b2c2f", box: [0.194, -0.037, 0.208, 0.003], hi: 0.35 });
  const uh: PathFn = (q) => {
    q.moveTo(0.072, -0.04);
    q.lineTo(0.074, -0.058);
    q.quadraticCurveTo(0.13, -0.066, 0.186, -0.06);
    q.lineTo(0.186, -0.04);
    q.closePath();
  };
  part(c, uh, { base: "#5e3a21", box: [0.072, -0.066, 0.186, -0.04], tex: woodTex(47, 0), hi: 0.3 });
  part(c, (q) => R(q, 0.052, -0.06, 0.036, 0.022, 0.002), { base: "#2c2d30", box: [0.052, -0.06, 0.088, -0.038], tex: steelTex(48, 0.9), hi: 0.4 });
  part(c, (q) => Pg(q, [0.06, -0.06, 0.094, -0.064, 0.094, -0.06, 0.06, -0.057]), { base: "#232426", box: [0.06, -0.064, 0.094, -0.057], hi: 0.3, line: 0.8 });
  const st: PathFn = (q) => {
    q.moveTo(-0.172, -0.034);
    q.quadraticCurveTo(-0.3, -0.03, -0.426, -0.022);
    q.lineTo(-0.426, 0.086);
    q.quadraticCurveTo(-0.3, 0.05, -0.172, 0.012);
    q.closePath();
  };
  part(c, st, { base: W, box: [-0.426, -0.034, -0.172, 0.086], tex: woodTex(49, -0.12), hi: 0.3 });
  part(c, (q) => Pg(q, [-0.426, -0.024, -0.441, -0.025, -0.441, 0.089, -0.426, 0.087]), { base: "#2b2c2f", box: [-0.441, -0.025, -0.426, 0.089], tex: steelTex(50, 1), hi: 0.35 });
  part(c, (q) => Pg(q, [-0.2, -0.04, -0.17, -0.04, -0.17, -0.03, -0.2, -0.032]), { base: "#2e2f32", box: [-0.2, -0.04, -0.17, -0.03], hi: 0.35, line: 0.8 });
  part(c, (q) => R(q, -0.172, -0.04, 0.234, 0.052), { base: "#3a3c3f", box: [-0.172, -0.04, 0.062, 0.012], tex: steelTex(51, 1.2), hi: 0.4 });
  const dc: PathFn = (q) => {
    q.moveTo(-0.165, -0.04);
    q.quadraticCurveTo(-0.165, -0.052, -0.15, -0.053);
    q.lineTo(0.045, -0.053);
    q.lineTo(0.05, -0.04);
    q.closePath();
  };
  part(c, dc, { base: "#3d3f42", box: [-0.165, -0.053, 0.05, -0.04], tex: steelTex(52, 1.2), hi: 0.5 });
  for (let x = -0.15; x < -0.1; x += 0.008) strokeP(c, (q) => { q.moveTo(x, -0.052); q.lineTo(x, -0.041); }, "rgba(0,0,0,0.45)", 1 * P, "butt");
  strokeP(c, (q) => { q.moveTo(-0.17, -0.041); q.lineTo(0.06, -0.041); }, "rgba(0,0,0,0.55)", 1 * P);
  fillP(c, (q) => R(q, -0.03, -0.036, 0.052, 0.012, 0.001), "#141516");
  part(c, (q) => { E(q, 0.04, -0.034, 0.007, 0.0055); R(q, 0.0, -0.036, 0.04, 0.004, 0.001); }, { base: "#4a4c50", box: [0.0, -0.04, 0.047, -0.028], hi: 0.5, line: 0.9 });
  for (const [x, y] of [[-0.16, 0.004], [-0.142, 0.004], [0.03, 0.004], [0.045, 0.004], [0.055, -0.03], [0.04, -0.01], [-0.155, -0.025]] as const) rivet(c, x, y, 0.0026, "#55585c");
  const sel: PathFn = (q) => {
    q.moveTo(-0.008, -0.023);
    q.lineTo(-0.11, -0.014);
    q.lineTo(-0.112, -0.008);
    q.lineTo(-0.1, -0.007);
    q.lineTo(-0.098, -0.011);
    q.lineTo(-0.008, -0.018);
    q.closePath();
  };
  part(c, sel, { base: "#4a4c4f", box: [-0.112, -0.023, -0.008, -0.007], hi: 0.45, line: 1 });
  trigger(
    c,
    (q) => {
      q.moveTo(-0.088, 0.012);
      q.lineTo(-0.088, 0.038);
      q.quadraticCurveTo(-0.087, 0.044, -0.078, 0.044);
      q.lineTo(-0.012, 0.042);
      q.quadraticCurveTo(-0.004, 0.04, -0.004, 0.012);
    },
    (q) => {
      q.moveTo(-0.056, 0.012);
      q.quadraticCurveTo(-0.053, 0.026, -0.062, 0.034);
    },
  );
  const pg: PathFn = (q) => {
    q.moveTo(-0.098, 0.011);
    q.lineTo(-0.13, 0.011);
    q.lineTo(-0.168, 0.098);
    q.quadraticCurveTo(-0.164, 0.11, -0.15, 0.109);
    q.lineTo(-0.137, 0.104);
    q.quadraticCurveTo(-0.12, 0.06, -0.098, 0.011);
    q.closePath();
  };
  part(c, pg, { base: "#5a301c", box: [-0.168, 0.011, -0.098, 0.11], tex: woodTex(53, 1.2), hi: 0.3 });
  const mg: PathFn = (q) => {
    q.moveTo(0.004, 0.011);
    q.lineTo(0.052, 0.011);
    q.quadraticCurveTo(0.064, 0.095, 0.116, 0.163);
    q.lineTo(0.081, 0.184);
    q.quadraticCurveTo(0.024, 0.105, 0.004, 0.011);
    q.closePath();
  };
  part(c, mg, { base: "#323437", box: [0.004, 0.011, 0.116, 0.184], tex: steelTex(54, 1.3), hi: 0.42 });
  for (const k of [0.3, 0.55, 0.75])
    strokeP(c, (q) => { q.moveTo(0.004 + 0.048 * k, 0.016); q.quadraticCurveTo(0.024 + 0.04 * k, 0.1, 0.081 + 0.035 * k, 0.18 - 0.021 * k); }, "rgba(0,0,0,0.45)", 1.6 * P);
  part(c, (q) => Pg(q, [0.078, 0.18, 0.118, 0.158, 0.124, 0.168, 0.084, 0.192]), { base: "#2b2c2f", box: [0.078, 0.158, 0.124, 0.192], hi: 0.35 });
  part(c, (q) => R(q, -0.008, 0.012, 0.01, 0.018, 0.002), { base: "#3a3c3f", box: [-0.008, 0.012, 0.002, 0.03], hi: 0.3, line: 0.8 });
  c.restore();
}

// ================= Story 5.2: Fire Axe AX1 and Chainsaw CS1 (docs/art/epic-5/round-b/looks.html) =================
/** A wobbly blob (paint chips on the axe head). */
function blobPath(c: G, cx: number, cy: number, rx: number, ry: number, seed: number, amp = 0.15, n = 56): void {
  const r = mulberry(seed);
  const ph = [r() * TAU, r() * TAU, r() * TAU] as const;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + amp * (0.5 * Math.sin(a * 2 + ph[0]) + 0.3 * Math.sin(a * 3 + ph[1]) + 0.2 * Math.sin(a * 5 + ph[2]));
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
}
/** Outlined flat fill for the top-down views (`k` px per metre). */
function heldFill(c: G, path: PathFn, fill: string, k: number): void {
  c.beginPath();
  path(c);
  c.fillStyle = fill;
  c.fill();
  c.lineWidth = Math.max(1, k * 0.02) / k;
  c.strokeStyle = HELD.outline;
  c.stroke();
}

/** AX1: red fire-department axe (red-painted pick head, bright ground edge, varnished hickory haft). */
const AX1 = { head: { base: "#9c2318", bd: 0.15, flare: 0.03, bulge: 0.035, pl: 0.17, ew: 0.03 }, haft: { base: "#8a5a2c", x0: -0.47 }, hx: 0.36, edge: "#c9ccd0" } as const;
type AxeHead = (typeof AX1)["head"];
/** The pick-head axe head at x = hx (side view: blade edge up at −y, pick down at +y). */
function axeHeadPath(hx: number, o: AxeHead): PathFn {
  const ew = o.ew;
  return (q) => {
    q.moveTo(hx - ew, -0.022);
    q.quadraticCurveTo(hx - ew * 0.8, -o.bd * 0.5, hx - ew - o.flare, -o.bd);
    q.quadraticCurveTo(hx + 0.005, -o.bd - o.bulge, hx + ew + o.flare * 0.9, -o.bd + 0.006);
    q.quadraticCurveTo(hx + ew * 0.85, -o.bd * 0.5, hx + ew, -0.022);
    q.lineTo(hx + ew, 0.022);
    q.quadraticCurveTo(hx + ew * 0.75, o.pl * 0.45, hx + 0.005, o.pl);
    q.lineTo(hx - 0.003, o.pl + 0.004);
    q.quadraticCurveTo(hx - ew * 0.75, o.pl * 0.45, hx - ew, 0.022);
    q.closePath();
  };
}
function haftPath(x0: number, x1: number, t: number): PathFn {
  return (q) => {
    q.moveTo(x0 + 0.01, -t * 1.25);
    q.quadraticCurveTo(x0 + 0.12, -t * 0.9, (x0 + x1) / 2, -t);
    q.lineTo(x1, -t * 0.95);
    q.lineTo(x1, t * 0.95);
    q.lineTo((x0 + x1) / 2, t);
    q.quadraticCurveTo(x0 + 0.12, t * 1.1, x0 + 0.01, t * 1.5);
    q.quadraticCurveTo(x0 - 0.012, t * 0.2, x0 + 0.01, -t * 1.25);
    q.closePath();
  };
}
const axeEdge = (hx: number, o: AxeHead): PathFn => (q) => {
  q.moveTo(hx - 0.03 - o.flare, -o.bd);
  q.quadraticCurveTo(hx + 0.005, -o.bd - o.bulge, hx + 0.03 + o.flare * 0.9, -o.bd + 0.006);
};

/**
 * Story 5.2 AX1 Fire Axe. `view` "icon": side view, `size` px per metre, centred; "held": top-down
 * in the survivor's hands (`size` = r px = 0.4 m), the haft along +x, the red head flat at the far
 * end with the bright edge out to the left (−y) and the pick to the right: the whole silhouette is
 * longer than any gun's, with a wide red T at the end (readable at a glance).
 */
export function drawFireAxe(c: G, view: WeaponArtView, size: number): void {
  const A = AX1;
  if (view === "held") {
    const k = size / 0.4;
    c.save();
    c.scale(k, k);
    const OP = P;
    P = 1 / k;
    const x0 = 0.06;
    const hx = 0.9;
    heldFill(c, haftPath(x0, hx + 0.05, 0.02), A.haft.base, k);
    strokeP(c, (q) => { q.moveTo(x0 + 0.05, -0.012); q.lineTo(hx, -0.011); }, "rgba(230,210,170,0.3)", Math.max(0.7, k * 0.008) / k, "butt");
    c.save();
    c.translate(hx, 0);
    c.scale(1.4, 1.4);
    c.translate(-hx, 0);
    const hp = axeHeadPath(hx, A.head);
    heldFill(c, hp, A.head.base, k * 1.4);
    c.save();
    c.beginPath();
    hp(c);
    c.clip();
    c.save();
    c.translate(0, 0.012);
    strokeP(c, axeEdge(hx, A.head), A.edge, 0.032, "butt");
    c.restore();
    c.restore();
    c.beginPath();
    hp(c);
    c.lineWidth = Math.max(1, k * 0.02) / (k * 1.4);
    c.strokeStyle = HELD.outline;
    c.stroke();
    c.restore();
    P = OP;
    c.restore();
    return;
  }
  P = 1 / size;
  c.save();
  c.scale(size, size);
  const H = A.haft;
  const hx = A.hx;
  const hp = axeHeadPath(hx, A.head);
  part(c, haftPath(H.x0, hx + 0.05, 0.017), { base: H.base, box: [H.x0, -0.03, hx + 0.05, 0.03], tex: woodTex(61, 0), hi: 0.35 });
  part(c, hp, { base: A.head.base, box: [hx - 0.08, -A.head.bd - 0.04, hx + 0.08, A.head.pl], tex: steelTex(64, 0.6), hi: 0.4, lo: 0.45 });
  c.save();
  c.beginPath();
  hp(c);
  c.clip();
  const r = mulberry(65);
  for (let i = 0; i < 18; i++) fillP(c, (q) => blobPath(q, hx + (r() - 0.5) * 0.14, -0.14 + r() * 0.3, 0.004 + r() * 0.01, 0.003 + r() * 0.007, 66 + i, 0.5, 16), "rgba(150,155,160,0.6)");
  c.save();
  c.translate(0, 0.012);
  strokeP(c, axeEdge(hx, A.head), A.edge, 0.03, "butt");
  c.restore();
  c.save();
  c.translate(0, 0.003);
  strokeP(c, axeEdge(hx, A.head), "rgba(255,255,255,0.5)", 0.006, "butt");
  c.restore();
  c.restore();
  part(c, (q) => R(q, hx - 0.028, -0.012, 0.056, 0.024, 0.004), { base: shade(A.head.base, -0.4), box: [hx - 0.028, -0.012, hx + 0.028, 0.012], hi: 0.2, rim: 0.15, line: 0.9 });
  fillP(c, (q) => E(q, hx + 0.04, 0, 0.009, 0.017), shade(H.base, -0.2));
  c.restore();
}

/** CS1: orange classic chainsaw (orange body, white starter cover, black handles and guard, steel bar). */
const CS1 = { body: "#c0601c", cover: "#c9c4b8", bar: 0.46 } as const;

/** The chain on the bar: teeth when still, a bright streak band when running (the "running-blade blur"). */
function chainTeeth(c: G, x0: number, x1: number, y0: number, y1: number, off: number, run: boolean): void {
  const ry = (y1 - y0) / 2;
  const cy = (y0 + y1) / 2;
  if (run) {
    for (const y of [y0, y1]) {
      const g = c.createLinearGradient(x0, 0, x1, 0);
      g.addColorStop(0, "rgba(170,178,188,0.25)");
      g.addColorStop(0.5, "rgba(215,222,230,0.75)");
      g.addColorStop(1, "rgba(170,178,188,0.35)");
      c.beginPath();
      c.moveTo(x0, y);
      c.lineTo(x1, y);
      c.strokeStyle = g;
      c.lineWidth = 0.016;
      c.lineCap = "butt";
      c.stroke();
      c.save();
      c.setLineDash([0.03, 0.018]);
      c.lineDashOffset = -off * (y === y0 ? 1 : -1);
      const dy = y === y0 ? -0.004 : 0.004;
      strokeP(c, (q) => { q.moveTo(x0, y + dy); q.lineTo(x1, y + dy); }, "rgba(255,255,255,0.55)", 0.003, "butt");
      c.restore();
    }
    strokeP(c, (q) => q.arc(x1, cy, ry, -Math.PI / 2, Math.PI / 2), "rgba(210,218,228,0.6)", 0.016, "butt");
    return;
  }
  for (const [y, d] of [[y0, -1], [y1, 1]] as const) {
    for (let x = x0 + 0.006; x < x1 - 0.004; x += 0.019) {
      fillP(c, (q) => Pg(q, [x, y, x + 0.012, y, x + 0.016, y + d * 0.011, x + 0.004, y + d * 0.012]), "#2b2d31");
      strokeP(c, (q) => { q.moveTo(x + 0.004, y + d * 0.012); q.lineTo(x + 0.016, y + d * 0.011); }, "rgba(200,208,218,0.55)", 0.9 * P, "butt");
    }
  }
  for (let a = -1.4; a <= 1.4; a += 0.45) {
    const x = x1 + Math.cos(a) * ry;
    const y = cy + Math.sin(a) * ry;
    fillP(c, (q) => E(q, x + Math.cos(a) * 0.006, y + Math.sin(a) * 0.006, 0.007, 0.005, a), "#2b2d31");
  }
}

/**
 * Story 5.2 CS1 Chainsaw, still or running (`run`: the chain is a bright blur, the saw jitters).
 * "icon": side view, `size` px per metre; "held": top-down (`size` = r px = 0.4 m): the orange
 * engine block in both hands and a long steel bar straight ahead (no gun is that wide and orange).
 */
export function drawChainsaw(c: G, view: WeaponArtView, size: number, run = false, t = 0): void {
  const S = CS1;
  if (view === "held") {
    const k = size / 0.4;
    c.save();
    c.scale(k, k);
    const OP = P;
    P = 1 / k;
    const jit = run ? Math.sin(t * 90) * 0.004 : 0;
    c.translate(jit * 0.5, jit);
    const bx0 = 0.56;
    const bx1 = 0.56 + S.bar;
    heldFill(c, (q) => R(q, bx0, -0.024, bx1 - bx0, 0.048, 0.024), "#9aa0a8", k);
    if (run) {
      for (const y of [-0.022, 0.022]) strokeP(c, (q) => { q.moveTo(bx0 + 0.02, y); q.lineTo(bx1, y); }, "rgba(235,240,248,0.85)", 0.012, "butt");
      fillP(c, (q) => E(q, bx1 + 0.01, 0, 0.035, 0.03), "rgba(220,228,238,0.25)");
    } else {
      for (let x = bx0 + 0.02; x < bx1; x += 0.03) for (const y of [-0.026, 0.026]) fillP(c, (q) => E(q, x, y, 0.008, 0.006), "#2b2d31");
    }
    heldFill(c, (q) => R(q, 0.26, -0.1, 0.32, 0.19, 0.045), S.body, k);
    heldFill(c, (q) => R(q, 0.31, -0.125, 0.17, 0.045, 0.015), S.cover, k);
    strokeP(c, (q) => { q.moveTo(0.29, -0.06); q.lineTo(0.55, -0.06); }, "rgba(255,255,255,0.22)", 0.012, "butt");
    heldFill(c, (q) => R(q, 0.1, -0.022, 0.18, 0.044, 0.02), "#1d1e21", k);
    const loop: PathFn = (q) => {
      q.moveTo(0.36, 0.09);
      q.bezierCurveTo(0.4, 0.17, 0.55, 0.14, 0.55, 0.0);
      q.bezierCurveTo(0.55, -0.1, 0.47, -0.15, 0.43, -0.13);
    };
    strokeP(c, loop, HELD.outline, 0.04 + 2 / k);
    strokeP(c, loop, "#1f2023", 0.04);
    heldFill(c, (q) => R(q, 0.575, -0.11, 0.025, 0.22, 0.008), "#1c1d20", k);
    P = OP;
    c.restore();
    return;
  }
  P = 1 / size;
  c.save();
  c.scale(size, size);
  const jit = run ? Math.sin(t * 90) * 0.0015 : 0;
  c.translate(jit, -jit);
  const bx0 = 0.03;
  const bx1 = 0.03 + S.bar;
  const bh = 0.05;
  const bp: PathFn = (q) => {
    q.moveTo(bx0, -bh / 2);
    q.lineTo(bx1, -bh * 0.42);
    q.arc(bx1, 0, bh * 0.42, -Math.PI / 2, Math.PI / 2);
    q.lineTo(bx0, bh / 2);
    q.closePath();
  };
  part(c, bp, { base: "#8b9097", box: [bx0, -bh / 2, bx1 + bh / 2, bh / 2], tex: steelTex(71, 0.9), hi: 0.45 });
  c.save();
  c.beginPath();
  bp(c);
  c.clip();
  strokeP(c, (q) => { q.moveTo(bx0 + 0.02, 0); q.lineTo(bx1 - 0.02, 0); }, "rgba(0,0,0,0.3)", 1.4 * P);
  for (let x = bx0 + 0.06; x < bx1 - 0.04; x += 0.11) rivet(c, x, 0.012, 0.004, "#9aa0a8");
  c.restore();
  chainTeeth(c, bx0, bx1, -bh / 2 - 0.002, bh / 2 + 0.002, t * 0.6, run);
  const rh: PathFn = (q) => {
    q.moveTo(-0.2, 0.035);
    q.lineTo(-0.36, 0.045);
    q.quadraticCurveTo(-0.4, 0.04, -0.4, 0.005);
    q.quadraticCurveTo(-0.39, -0.03, -0.34, -0.035);
    q.lineTo(-0.2, -0.04);
    q.lineTo(-0.2, -0.015);
    q.lineTo(-0.34, -0.012);
    q.quadraticCurveTo(-0.37, -0.01, -0.372, 0.006);
    q.quadraticCurveTo(-0.37, 0.022, -0.34, 0.022);
    q.lineTo(-0.2, 0.015);
    q.closePath();
  };
  part(c, rh, { base: "#1d1e21", box: [-0.4, -0.04, -0.2, 0.045], tex: polyTex(72), hi: 0.35 });
  const body: PathFn = (q) => {
    q.moveTo(-0.24, -0.075);
    q.quadraticCurveTo(-0.24, -0.1, -0.21, -0.1);
    q.lineTo(0.03, -0.09);
    q.quadraticCurveTo(0.06, -0.085, 0.065, -0.05);
    q.lineTo(0.07, 0.05);
    q.quadraticCurveTo(0.065, 0.08, 0.03, 0.085);
    q.lineTo(-0.2, 0.09);
    q.quadraticCurveTo(-0.24, 0.09, -0.24, 0.06);
    q.closePath();
  };
  part(c, body, { base: S.body, box: [-0.24, -0.1, 0.07, 0.09], tex: polyTex(73), hi: 0.38, lo: 0.45 });
  c.save();
  c.beginPath();
  body(c);
  c.clip();
  fillP(c, (q) => R(q, -0.24, 0.035, 0.31, 0.06), "rgba(0,0,0,0.35)");
  part(c, (q) => E(q, -0.1, 0.0, 0.07, 0.062), { base: S.cover, box: [-0.17, -0.062, -0.03, 0.062], tex: polyTex(74), hi: 0.4, rim: 0.35, line: 1.1 });
  for (let j = -2; j <= 2; j++) strokeP(c, (q) => { q.moveTo(-0.14, j * 0.018); q.lineTo(-0.06, j * 0.018); }, "rgba(0,0,0,0.5)", 1.6 * P, "butt");
  for (let x = -0.02; x < 0.05; x += 0.014) strokeP(c, (q) => { q.moveTo(x, -0.07); q.lineTo(x, -0.035); }, "rgba(0,0,0,0.5)", 1.4 * P, "butt");
  c.restore();
  part(c, (q) => R(q, -0.21, -0.12, 0.04, 0.025, 0.008), { base: "#2a2b2e", box: [-0.21, -0.12, -0.17, -0.095], hi: 0.4, line: 1 });
  const th: PathFn = (q) => {
    q.moveTo(-0.17, -0.095);
    q.bezierCurveTo(-0.16, -0.19, -0.06, -0.2, 0.0, -0.17);
    q.quadraticCurveTo(0.04, -0.15, 0.045, -0.09);
  };
  strokeP(c, th, "#050506", 0.026 + 2 * P);
  strokeP(c, th, "#1f2023", 0.026);
  c.save();
  c.translate(-0.002, -0.006);
  strokeP(c, th, "rgba(180,190,205,0.3)", 0.006);
  c.restore();
  part(c, (q) => Pg(q, [0.05, -0.085, 0.075, -0.085, 0.105, -0.185, 0.085, -0.195]), { base: "#1c1d20", box: [0.05, -0.195, 0.105, -0.085], tex: polyTex(75), hi: 0.35 });
  for (const [x, y] of [[-0.22, -0.06], [0.045, 0.06], [0.045, -0.06]] as const) rivet(c, x, y, 0.005, "#55585c");
  c.restore();
}
/** The Chainsaw's running-blade view (the survivor frame `survivor_chainsaw_b`, shown while it cuts). */
export const drawChainsawRunning = (c: G, view: WeaponArtView, size: number): void => drawChainsaw(c, view, size, true, 0.37);

// ================= Story 5.1: upgrade-tier looks (levels III–IV) and the U1 tier plate =================

/** A red shotgun shell with a brass base (G3's side strap), object units. */
function shell(c: G, x: number, y: number, w: number, h: number): void {
  const bh = 0.013;
  const red: PathFn = (q) => R(q, x, y, w, h - bh, 0.0025);
  c.beginPath();
  red(c);
  let g = c.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, "#3a0a07");
  g.addColorStop(0.25, "#9a1d16");
  g.addColorStop(0.42, "#e2594b");
  g.addColorStop(0.6, "#a41f17");
  g.addColorStop(1, "#320806");
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 1 * P;
  c.strokeStyle = "rgba(8,2,2,0.9)";
  c.stroke();
  for (let k = 1; k < 4; k++) strokeP(c, (q) => { q.moveTo(x + (w * k) / 4, y + 0.0005); q.lineTo(x + (w * k) / 4, y + 0.005); }, "rgba(30,5,4,0.6)", 0.7 * P);
  const b: PathFn = (q) => R(q, x - 0.0006, y + h - bh, w + 0.0012, bh, 0.001);
  c.beginPath();
  b(c);
  g = c.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, "#3e2b0c");
  g.addColorStop(0.3, "#b88b3a");
  g.addColorStop(0.45, "#f3d68c");
  g.addColorStop(0.65, "#a77a2c");
  g.addColorStop(1, "#3a280b");
  c.fillStyle = g;
  c.fill();
  c.stroke();
  strokeP(c, (q) => { q.moveTo(x, y + h - 0.003); q.lineTo(x + w, y + h - 0.003); }, "rgba(60,40,10,0.7)", 0.8 * P);
}

function bez(p: readonly number[], t: number): [number, number] {
  const u = 1 - t;
  const n = (i: number): number => p[i] as number;
  return [u * u * u * n(0) + 3 * u * u * t * n(2) + 3 * u * t * t * n(4) + t * t * t * n(6), u * u * u * n(1) + 3 * u * u * t * n(3) + 3 * u * t * t * n(5) + t * t * t * n(7)];
}

/**
 * Story 5.1: G3 tactical pump shotgun (black, pistol-grip stock, sling, red shells on the side),
 * the Shotgun's look at upgrade levels III–IV. Side-view icon only (ported from
 * `docs/art/epic-5/round-b/looks.html › drawG3`), `size` px per metre, centred, muzzle +x.
 */
export function drawShotgunTactical(c: G, size: number): void {
  P = 1 / size;
  c.save();
  c.scale(size, size);
  const sp = [0.447, 0.03, 0.28, 0.21, -0.22, 0.27, -0.43, 0.078] as const;
  const sl: PathFn = (q) => { q.moveTo(sp[0], sp[1]); q.bezierCurveTo(sp[2], sp[3], sp[4], sp[5], sp[6], sp[7]); };
  strokeP(c, sl, "#050506", 0.016 + 2 * P);
  strokeP(c, sl, "#1f2023", 0.016);
  c.save();
  c.translate(0, -0.0035);
  strokeP(c, sl, "rgba(150,160,175,0.16)", 0.004);
  c.restore();
  c.setLineDash([3 * P, 2.5 * P]);
  for (const dy of [-0.0055, 0.0055]) {
    c.save();
    c.translate(0, dy);
    strokeP(c, sl, "rgba(125,128,132,0.4)", 0.7 * P, "butt");
    c.restore();
  }
  c.setLineDash([]);
  for (const t of [0.22, 0.8]) {
    const [a, b] = bez(sp, t);
    const [a2, b2] = bez(sp, t + 0.01);
    c.save();
    c.translate(a, b);
    c.rotate(Math.atan2(b2 - b, a2 - a));
    part(c, (q) => R(q, -0.012, -0.0115, 0.024, 0.023, 0.002), { base: "#3b3e43", box: [-0.012, -0.0115, 0.012, 0.0115], hi: 0.4, tex: steelTex(t * 99, 0.6) });
    fillP(c, (q) => R(q, -0.007, -0.006, 0.014, 0.012, 0.001), "#121214");
    c.restore();
  }
  part(c, (q) => R(q, 0.03, -0.007, 0.4, 0.023, 0.004), { base: "#1d1e21", box: [0.03, -0.007, 0.43, 0.016], tex: steelTex(31, 0.3), hi: 0.3 });
  part(c, (q) => R(q, 0.425, -0.009, 0.035, 0.027, 0.004), { base: "#222327", box: [0.425, -0.009, 0.46, 0.018], hi: 0.35 });
  for (let x = 0.43; x < 0.456; x += 0.004) strokeP(c, (q) => { q.moveTo(x, -0.007); q.lineTo(x, 0.016); }, "rgba(0,0,0,0.5)", 0.7 * P, "butt");
  part(c, (q) => R(q, 0.03, -0.031, 0.465, 0.02, 0.003), { base: "#1b1c1f", box: [0.03, -0.031, 0.495, -0.011], tex: steelTex(32, 0.3), hi: 0.48 });
  part(c, (q) => Pg(q, [0.468, -0.031, 0.49, -0.031, 0.486, -0.042, 0.475, -0.042]), { base: "#1b1c1f", box: [0.468, -0.042, 0.49, -0.031], hi: 0.4 });
  part(c, (q) => R(q, 0.385, -0.033, 0.016, 0.052, 0.002), { base: "#26282b", box: [0.385, -0.033, 0.401, 0.019], hi: 0.3 });
  part(c, (q) => R(q, 0.1, 0.013, 0.03, 0.025, 0.002), { base: "#202125", box: [0.1, 0.013, 0.13, 0.038], hi: 0.3 });
  part(c, (q) => R(q, 0.065, 0.036, 0.115, 0.022, 0.004), { base: "#1a1b1e", box: [0.065, 0.036, 0.18, 0.058], tex: steelTex(33, 0.2), hi: 0.45 });
  for (let x = 0.072; x < 0.1; x += 0.0035) strokeP(c, (q) => { q.moveTo(x, 0.038); q.lineTo(x, 0.056); }, "rgba(0,0,0,0.55)", 0.8 * P, "butt");
  part(c, (q) => R(q, 0.178, 0.031, 0.024, 0.032, 0.004), { base: "#1e1f22", box: [0.178, 0.031, 0.202, 0.063], hi: 0.45 });
  c.beginPath();
  R(c, 0.2, 0.034, 0.004, 0.026, 0.001);
  const lens = c.createLinearGradient(0, 0.034, 0, 0.06);
  lens.addColorStop(0, "#e8f2ff");
  lens.addColorStop(0.5, "#8aa0b8");
  lens.addColorStop(1, "#2a3440");
  c.fillStyle = lens;
  c.fill();
  part(c, (q) => R(q, 0.065, -0.016, 0.2, 0.046, 0.009), { base: "#1c1d20", box: [0.065, -0.016, 0.265, 0.03], tex: polyTex(34), hi: 0.32 });
  for (const y of [-0.005, 0.004, 0.013, 0.022]) {
    strokeP(c, (q) => { q.moveTo(0.078, y); q.lineTo(0.252, y); }, "rgba(0,0,0,0.7)", 1.6 * P);
    strokeP(c, (q) => { q.moveTo(0.078, y + 1.6 * P); q.lineTo(0.252, y + 1.6 * P); }, "rgba(170,180,195,0.14)", 0.8 * P);
  }
  const rc: PathFn = (q) => {
    q.moveTo(-0.185, -0.036);
    q.lineTo(0.03, -0.036);
    q.quadraticCurveTo(0.036, -0.036, 0.036, -0.03);
    q.lineTo(0.036, 0.012);
    q.lineTo(0.02, 0.027);
    q.lineTo(-0.185, 0.027);
    q.closePath();
  };
  part(c, rc, { base: "#202226", box: [-0.185, -0.036, 0.036, 0.027], tex: steelTex(35, 0.6), hi: 0.4 });
  fillP(c, (q) => R(q, -0.01, -0.003, 0.04, 0.012, 0.002), "#08090a");
  part(c, (q) => R(q, 0.0, -0.046, 0.03, 0.011, 0.002), { base: "#1d1e21", box: [0, -0.046, 0.03, -0.035], hi: 0.35 });
  part(c, (q) => { Pg(q, [0.002, -0.046, 0.009, -0.046, 0.008, -0.056, 0.003, -0.056]); Pg(q, [0.021, -0.046, 0.028, -0.046, 0.027, -0.056, 0.022, -0.056]); }, { base: "#1d1e21", box: [0, -0.056, 0.03, -0.046], hi: 0.4 });
  part(c, (q) => R(q, -0.162, -0.042, 0.136, 0.042, 0.003), { base: "#18191b", box: [-0.162, -0.042, -0.026, 0], tex: polyTex(36), hi: 0.25 });
  for (let i = 0; i < 5; i++) shell(c, -0.154 + i * 0.0247, -0.06, 0.0198, 0.056);
  for (const x of [-0.152, -0.036]) rivet(c, x, -0.006, 0.0028, "#3a3c40", true);
  trigger(
    c,
    (q) => { q.moveTo(-0.15, 0.025); q.quadraticCurveTo(-0.153, 0.058, -0.118, 0.058); q.lineTo(-0.095, 0.057); q.quadraticCurveTo(-0.075, 0.052, -0.072, 0.025); },
    (q) => { q.moveTo(-0.11, 0.025); q.quadraticCurveTo(-0.108, 0.04, -0.12, 0.047); },
  );
  const st: PathFn = (q) => {
    q.moveTo(-0.183, -0.03);
    q.lineTo(-0.49, -0.042);
    q.lineTo(-0.5, -0.04);
    q.lineTo(-0.5, 0.08);
    q.lineTo(-0.47, 0.082);
    q.quadraticCurveTo(-0.33, 0.05, -0.25, 0.034);
    q.lineTo(-0.185, 0.027);
    q.closePath();
  };
  part(c, st, { base: "#202124", box: [-0.5, -0.042, -0.183, 0.082], tex: polyTex(37), hi: 0.3 });
  fillP(c, (q) => R(q, -0.455, 0.0, 0.042, 0.026, 0.004), "#0b0b0c");
  strokeP(c, (q) => { q.moveTo(-0.452, 0.0255); q.lineTo(-0.416, 0.0255); }, "rgba(160,170,185,0.3)", 0.9 * P);
  strokeP(c, (q) => { q.moveTo(-0.33, -0.034); q.lineTo(-0.2, -0.029); }, "rgba(0,0,0,0.5)", 0.9 * P);
  c.restore();
}

/**
 * Story 5.1: R1 modern assault rifle (black, short scope, vertical grip, curved magazine), the
 * Assault Rifle's look at upgrade levels III–IV. Side-view icon only (ported from
 * `docs/art/epic-5/round-a/code-drawings.html › drawR1`), `size` px per metre, centred, muzzle +x.
 */
export function drawAssaultRifleModern(c: G, size: number): void {
  P = 1 / size;
  c.save();
  c.scale(size, size);
  const B = "#232427";
  part(c, (q) => Pg(q, [-0.45, -0.042, -0.345, -0.036, -0.33, -0.022, -0.33, 0.006, -0.38, 0.03, -0.432, 0.072, -0.45, 0.076]), { base: "#2a2b2e", box: [-0.45, -0.042, -0.33, 0.076], tex: polyTex(61), hi: 0.3 });
  fillP(c, (q) => R(q, -0.43, -0.025, 0.05, 0.02, 0.004), "#0d0d0e");
  part(c, (q) => R(q, -0.464, -0.044, 0.016, 0.124, 0.004), { base: "#151517", box: [-0.464, -0.044, -0.448, 0.08], tex: polyTex(62), hi: 0.2 });
  part(c, (q) => R(q, -0.345, -0.028, 0.15, 0.022, 0.004), { base: "#1d1e21", box: [-0.345, -0.028, -0.195, -0.006], tex: steelTex(63, 0.3), hi: 0.42 });
  for (let x = -0.31; x < -0.22; x += 0.013) fillP(c, (q) => E(q, x, -0.0085, 0.003, 0.0015), "#0a0a0b");
  part(c, (q) => R(q, 0.255, -0.0235, 0.165, 0.0125, 0.002), { base: "#1b1c1f", box: [0.255, -0.0235, 0.42, -0.011], tex: steelTex(64, 0.3), hi: 0.5 });
  part(c, (q) => R(q, 0.415, -0.027, 0.036, 0.019, 0.003), { base: "#1d1e21", box: [0.415, -0.027, 0.451, -0.008], hi: 0.45 });
  for (let x = 0.424; x < 0.448; x += 0.006) strokeP(c, (q) => { q.moveTo(x, -0.022); q.lineTo(x, -0.013); }, "#060606", 1.5 * P, "butt");
  part(c, (q) => { R(q, 0.266, -0.031, 0.026, 0.026, 0.002); Pg(q, [0.27, -0.031, 0.289, -0.031, 0.283, -0.074, 0.275, -0.074]); }, { base: "#1e1f22", box: [0.266, -0.074, 0.292, -0.005], tex: polyTex(65), hi: 0.35 });
  fillP(c, (q) => E(q, 0.279, -0.05, 0.003, 0.006), "#0b0b0c");
  part(c, (q) => R(q, 0.06, -0.043, 0.2, 0.062, 0.004), { base: B, box: [0.06, -0.043, 0.26, 0.019], tex: polyTex(66), hi: 0.3 });
  for (let x = 0.068; x < 0.255; x += 0.0105) {
    fillP(c, (q) => R(q, x, -0.02, 0.006, 0.016, 0.001), "#0c0c0d");
    fillP(c, (q) => R(q, x + 0.0005, 0.012, 0.006, 0.006, 0), "#0c0c0d");
  }
  strokeP(c, (q) => { q.moveTo(0.062, -0.024); q.lineTo(0.258, -0.024); }, "rgba(160,170,185,0.18)", 0.8 * P);
  part(c, (q) => R(q, 0.142, 0.016, 0.042, 0.012, 0.002), { base: "#1e1f22", box: [0.142, 0.016, 0.184, 0.028], hi: 0.3 });
  part(c, (q) => { q.moveTo(0.149, 0.026); q.lineTo(0.178, 0.026); q.lineTo(0.176, 0.1); q.quadraticCurveTo(0.164, 0.108, 0.152, 0.1); q.closePath(); }, { base: "#202124", box: [0.149, 0.026, 0.178, 0.108], tex: polyTex(67), hi: 0.32 });
  for (let y = 0.036; y < 0.098; y += 0.007) strokeP(c, (q) => { q.moveTo(0.151, y); q.lineTo(0.176, y); }, "rgba(0,0,0,0.55)", 1.1 * P, "butt");
  part(c, (q) => { q.moveTo(-0.205, -0.04); q.lineTo(0.062, -0.04); q.lineTo(0.062, -0.004); q.lineTo(-0.205, -0.004); q.closePath(); }, { base: "#26272a", box: [-0.205, -0.04, 0.062, -0.004], tex: polyTex(68), hi: 0.36 });
  part(c, (q) => R(q, -0.205, -0.051, 0.465, 0.011, 0.001), { base: "#202124", box: [-0.205, -0.051, 0.26, -0.04], hi: 0.35 });
  for (let x = -0.2; x < 0.255; x += 0.0098) fillP(c, (q) => R(q, x, -0.0508, 0.004, 0.005, 0), "#0b0b0c");
  fillP(c, (q) => R(q, -0.09, -0.027, 0.068, 0.017, 0.001), "#131416");
  strokeP(c, (q) => { q.moveTo(-0.088, -0.019); q.lineTo(-0.024, -0.019); }, "rgba(150,160,175,0.2)", 0.8 * P);
  part(c, (q) => E(q, -0.038, -0.032, 0.009, 0.007), { base: "#2b2c30", box: [-0.047, -0.039, -0.029, -0.025], hi: 0.5 });
  part(c, (q) => R(q, -0.222, -0.043, 0.024, 0.009, 0.002), { base: "#2b2c2f", box: [-0.222, -0.043, -0.198, -0.034], hi: 0.4, line: 0.9 });
  part(c, (q) => Pg(q, [-0.205, -0.005, 0.035, -0.005, 0.035, 0.012, -0.008, 0.022, -0.008, 0.06, -0.062, 0.06, -0.062, 0.028, -0.15, 0.028, -0.205, 0.018]), { base: "#25262a", box: [-0.205, -0.005, 0.035, 0.06], tex: polyTex(69), hi: 0.32 });
  part(c, (q) => { q.moveTo(-0.058, 0.058); q.lineTo(-0.012, 0.058); q.quadraticCurveTo(-0.004, 0.12, 0.03, 0.172); q.lineTo(-0.012, 0.186); q.quadraticCurveTo(-0.044, 0.125, -0.058, 0.058); q.closePath(); }, { base: "#1e1f22", box: [-0.058, 0.058, 0.03, 0.186], tex: steelTex(70, 0.5), hi: 0.4 });
  for (const k of [0.35, 0.65]) strokeP(c, (q) => { q.moveTo(-0.058 + 0.046 * k, 0.062); q.quadraticCurveTo(-0.044 + 0.04 * k, 0.125, -0.012 + 0.04 * k, 0.183 - 0.012 * k); }, "rgba(0,0,0,0.55)", 1.6 * P);
  part(c, (q) => Pg(q, [-0.014, 0.182, 0.032, 0.169, 0.035, 0.178, -0.011, 0.193]), { base: "#18191b", box: [-0.014, 0.169, 0.035, 0.193], hi: 0.3 });
  trigger(
    c,
    (q) => { q.moveTo(-0.138, 0.027); q.lineTo(-0.138, 0.045); q.lineTo(-0.07, 0.045); q.lineTo(-0.066, 0.027); },
    (q) => { q.moveTo(-0.1, 0.027); q.quadraticCurveTo(-0.097, 0.036, -0.106, 0.041); },
  );
  part(c, (q) => { q.moveTo(-0.172, 0.026); q.lineTo(-0.14, 0.026); q.bezierCurveTo(-0.142, 0.05, -0.152, 0.06, -0.15, 0.07); q.lineTo(-0.168, 0.103); q.quadraticCurveTo(-0.18, 0.108, -0.19, 0.1); q.closePath(); }, { base: "#202124", box: [-0.19, 0.026, -0.14, 0.108], tex: polyTex(71, true), hi: 0.3 });
  part(c, (q) => { E(q, -0.125, 0.008, 0.006, 0.006); R(q, -0.125, 0.006, 0.016, 0.004, 0.001); }, { base: "#34363a", box: [-0.131, 0.002, -0.109, 0.014], hi: 0.4, line: 0.8 });
  for (const [x, y] of [[-0.19, 0.004], [-0.03, 0.004], [0.02, -0.02], [-0.18, -0.02]] as const) rivet(c, x, y, 0.0026, "#3a3c40");
  // scope
  part(c, (q) => R(q, -0.122, -0.064, 0.072, 0.014, 0.002), { base: "#202124", box: [-0.122, -0.064, -0.05, -0.05], hi: 0.35 });
  rivet(c, -0.105, -0.057, 0.0035, "#3a3c40", true);
  rivet(c, -0.068, -0.057, 0.0035, "#3a3c40", true);
  part(c, (q) => { q.moveTo(-0.125, -0.098); q.lineTo(-0.042, -0.098); q.lineTo(-0.042, -0.068); q.lineTo(-0.125, -0.068); q.closePath(); }, { base: "#2a2b2e", box: [-0.125, -0.098, -0.042, -0.068], tex: polyTex(72), hi: 0.45 });
  part(c, (q) => Pg(q, [-0.045, -0.1, -0.03, -0.108, 0.0, -0.108, 0.0, -0.06, -0.03, -0.06, -0.045, -0.066]), { base: "#2a2b2e", box: [-0.045, -0.108, 0, -0.06], tex: polyTex(73), hi: 0.45 });
  c.beginPath();
  R(c, -0.0025, -0.106, 0.004, 0.044, 0.001);
  const g = c.createLinearGradient(0, -0.106, 0, -0.062);
  g.addColorStop(0, "#9fc4e6");
  g.addColorStop(0.4, "#24384c");
  g.addColorStop(1, "#0b1016");
  c.fillStyle = g;
  c.fill();
  part(c, (q) => R(q, -0.152, -0.1, 0.03, 0.034, 0.004), { base: "#26272a", box: [-0.152, -0.1, -0.122, -0.066], hi: 0.4 });
  part(c, (q) => R(q, -0.092, -0.114, 0.022, 0.017, 0.002), { base: "#2d2e31", box: [-0.092, -0.114, -0.07, -0.097], hi: 0.45 });
  part(c, (q) => E(q, -0.081, -0.083, 0.009, 0.009), { base: "#2d2e31", box: [-0.09, -0.092, -0.072, -0.074], hi: 0.45 });
  strokeP(c, (q) => { q.moveTo(-0.12, -0.0975); q.lineTo(-0.045, -0.0975); }, "rgba(60,200,90,0.5)", 1 * P);
  c.restore();
}

/**
 * Story 5.1 (designer decision: "when a weapon has a second look it is its III–IV look"): the
 * level from which the shop/HUD icon shows the upgrade-tier look. Presentation only (not balance).
 */
export const UPGRADE_LOOK_LEVEL = 3;
/** The upgrade-tier icon drawings (G1 → G3, R2 → R1), by weapon id. */
export const WEAPON_TIER_ICON: Readonly<Record<string, (c: G, size: number) => void>> = {
  shotgun: drawShotgunTactical,
  assault_rifle: drawAssaultRifleModern,
  grenade_launcher: (c, size) => drawGrenadeLauncherBlooper(c, size), // Story 5.5: GL2 at III (GL3 at IV: `WEAPON_TOP_TIER_ICON`)
  // designer 2026-11-24: the Epic 1 weapons' III looks (S2, H1, M1)
  smg: (c, size) => drawSmgSuppressed(c, size),
  hunting_rifle: (c, size) => drawHuntingRifle(c, size),
  machete: (c, size) => drawMachete(c, size),
};
/** Story 5.5: a third look at level IV (the Grenade Launcher's GL3 pump); weapons without one keep their III look. */
export const WEAPON_TOP_TIER_ICON: Readonly<Record<string, (c: G, size: number) => void>> = {
  grenade_launcher: (c, size) => drawGrenadeLauncherPump(c, size),
  // designer 2026-11-24: the Epic 1 weapons' IV looks (S3, H3, M3)
  smg: (c, size) => drawSmgDrum(c, size),
  hunting_rifle: (c, size) => drawHuntingRifleSynthetic(c, size),
  machete: (c, size) => drawMacheteKukri(c, size),
};

/** The U1 plate's width (CSS px) per level (the numeral's width); height is `TIER_PLATE_H`. */
const TIER_PLATE_W: readonly number[] = [0, 13, 17, 21, 19];
export const TIER_PLATE_H = 12;
const ROMAN_NUMERALS = ["", "I", "II", "III", "IV"] as const;

/** U1 plate width in CSS px for a level (1–4; others: 0, no plate). */
export function tierPlateWidth(level: number): number {
  return TIER_PLATE_W[level] ?? 0;
}

/**
 * Story 5.1 (designer pick U1): the upgrade tier mark, a roman numeral stamped into a riveted steel
 * plate (ported from `docs/art/epic-5/round-b/looks.html › plateU1`). Drawn with its top-left at
 * (0, 0), `tierPlateWidth(level)` × `TIER_PLATE_H` CSS px; the caller scales for the device. Drawn
 * once into the FX atlas / an icon canvas, never per frame.
 */
export function drawTierPlate(c: G, level: number): void {
  const w = tierPlateWidth(level);
  if (w === 0) return;
  const h = TIER_PLATE_H;
  P = 1;
  part(c, (q) => R(q, 0, 0, w, h, 2), { base: "#7c8086", lit: "top", box: [0, 0, w, h], tex: steelTex(91, 1.2), hi: 0.45, lo: 0.35, rim: 0.55, inner: 0.3, line: 1.1 });
  for (const rx of [2.3, w - 2.3]) fillP(c, (q) => E(q, rx, h / 2, 0.9, 0.9), "rgba(20,22,25,0.7)");
  c.save();
  c.font = '700 9px Oswald, "Arial Narrow", sans-serif';
  c.textAlign = "center";
  c.textBaseline = "middle";
  const txt = ROMAN_NUMERALS[level] ?? "";
  c.fillStyle = "rgba(255,255,255,0.35)";
  c.fillText(txt, w / 2 + 0.5, h / 2 + 1.5);
  c.fillStyle = "#16181b";
  c.fillText(txt, w / 2, h / 2 + 0.8);
  c.restore();
}

const plateUrls = new Map<number, string>();

/** The U1 plate for `level` as a PNG data URL (shop rows; drawn once per level, cached), or null. */
export function tierMarkUrl(level: number): string | null {
  const w = tierPlateWidth(level);
  if (w === 0 || typeof document === "undefined") return null;
  const cached = plateUrls.get(level);
  if (cached) return cached;
  const cv = document.createElement("canvas");
  cv.width = w * DPR;
  cv.height = TIER_PLATE_H * DPR;
  const g = cv.getContext("2d");
  if (!g) return null;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawTierPlate(g, level);
  const url = cv.toDataURL("image/png");
  plateUrls.set(level, url);
  return url;
}

// ================= Story 5.5: the Grenade Launcher (round C: GL1 base; GL2 / GL3 its III / IV looks) =================
// Ported from `docs/art/epic-5/round-c/looks.html › glIcon1–3, heldGL` (icons: side view, metres,
// muzzle +x; held: top-down, r units).

/** A shaded tube along x (looks.html `tube`). */
function tube(c: G, x0: number, x1: number, y: number, d: number, base: string, tex: Tex, r = d * 0.3): void {
  part(c, (q) => R(q, x0, y - d / 2, x1 - x0, d, r), { base, lit: "top", box: [x0, y - d / 2, x1, y + d / 2], tex, hi: 0.45, lo: 0.5, rim: 0.4 });
}
/** A ribbed pistol grip / foregrip (looks.html `gripPart`). */
function gripPart(c: G, x: number, y: number, len: number, ang: number, w: number, base: string): void {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const pts: readonly (readonly [number, number])[] = [[-w / 2, 0], [w / 2, 0], [(w / 2) * 0.9, len], [(-w / 2) * 1.1, len]];
  const g: PathFn = (q) => {
    pts.forEach(([px, py], i) => {
      const X = x + px * ca - py * sa;
      const Y = y + px * sa + py * ca;
      if (i) q.lineTo(X, Y);
      else q.moveTo(X, Y);
    });
    q.closePath();
  };
  part(c, g, { base, box: [x - len, y - 0.01, x + len, y + len], tex: polyTex(91, true), hi: 0.3, rim: 0.3 });
  c.save();
  c.beginPath();
  g(c);
  c.clip();
  for (let k = 1; k < 6; k++) strokeP(c, (q) => { q.moveTo(x - 0.06, y + (len * k) / 6); q.lineTo(x + 0.06, y + (len * k) / 6 + 0.004); }, "rgba(0,0,0,0.35)", 1 * P, "butt");
  c.restore();
}
const GL_POLY = "#202124";
const GL_OD = "#3b4030";

/** GL1 revolver-drum launcher, side view (the story's "stubby drum launcher"). `size` px per metre. */
function glIcon1(c: G): void {
  const bar = (path: PathFn, w: number): void => {
    strokeP(c, path, "#050506", w + 2 * P);
    strokeP(c, path, "#26282b", w);
    c.save();
    c.translate(0, -w * 0.25);
    strokeP(c, path, "rgba(180,190,205,0.25)", w * 0.25);
    c.restore();
  };
  bar((q) => { q.moveTo(-0.41, -0.035); q.lineTo(-0.17, -0.035); }, 0.02);
  bar((q) => { q.moveTo(-0.41, 0.065); q.lineTo(-0.2, 0.01); }, 0.018);
  bar((q) => { q.moveTo(-0.33, -0.035); q.lineTo(-0.3, 0.044); }, 0.012);
  part(c, (q) => R(q, -0.445, -0.055, 0.04, 0.14, 0.012), { base: "#151517", box: [-0.445, -0.055, -0.405, 0.085], tex: polyTex(41, true), hi: 0.25 });
  gripPart(c, -0.145, 0.01, 0.09, 0.3, 0.036, GL_OD);
  trigger(c, (q) => { q.moveTo(-0.13, 0.012); q.quadraticCurveTo(-0.135, 0.05, -0.1, 0.048); q.lineTo(-0.075, 0.045); q.quadraticCurveTo(-0.065, 0.03, -0.065, 0.012); }, (q) => { q.moveTo(-0.095, 0.012); q.quadraticCurveTo(-0.093, 0.03, -0.103, 0.036); });
  part(c, (q) => R(q, -0.19, -0.07, 0.33, 0.024, 0.006), { base: "#2a2c2f", box: [-0.19, -0.07, 0.14, -0.046], tex: steelTex(42, 0.8), hi: 0.45 });
  part(c, (q) => R(q, -0.19, -0.05, 0.08, 0.07, 0.01), { base: GL_POLY, box: [-0.19, -0.05, -0.11, 0.02], tex: polyTex(43), hi: 0.35 });
  const dr: PathFn = (q) => R(q, -0.105, -0.052, 0.205, 0.142, 0.022);
  part(c, dr, { base: "#35383c", lit: "top", box: [-0.105, -0.052, 0.1, 0.09], tex: steelTex(44, 1), hi: 0.5, lo: 0.55 });
  c.save();
  c.beginPath();
  dr(c);
  c.clip();
  for (let y = -0.035; y < 0.09; y += 0.024) {
    strokeP(c, (q) => { q.moveTo(-0.09, y); q.lineTo(0.085, y); }, "rgba(0,0,0,0.55)", 2.2 * P, "butt");
    strokeP(c, (q) => { q.moveTo(-0.09, y + 2 * P); q.lineTo(0.085, y + 2 * P); }, "rgba(200,210,225,0.18)", 1 * P, "butt");
  }
  for (const x of [-0.1, 0.095]) fillP(c, (q) => R(q, x - 0.008, -0.06, 0.016, 0.16), "rgba(10,10,12,0.7)");
  c.restore();
  tube(c, 0.1, 0.36, -0.022, 0.058, "#2a2c30", steelTex(45, 0.9), 0.008);
  part(c, (q) => R(q, 0.335, -0.056, 0.03, 0.068, 0.006), { base: "#1f2124", box: [0.335, -0.056, 0.365, 0.012], hi: 0.45, line: 1 });
  fillP(c, (q) => R(q, 0.1, 0.01, 0.26, 0.012), "rgba(0,0,0,0.35)");
  gripPart(c, 0.21, 0.012, 0.075, -0.08, 0.032, GL_OD);
  part(c, (q) => Pg(q, [-0.04, -0.07, -0.03, -0.1, 0.08, -0.1, 0.09, -0.07]), { base: "#1c1d20", box: [-0.04, -0.1, 0.09, -0.07], tex: polyTex(46, true), hi: 0.3, line: 1 });
  for (const [x, y] of [[-0.17, -0.035], [0.12, -0.058], [0.12, 0.01]] as const) rivet(c, x, y, 0.005, "#4a4d52");
}

/** GL2 break-action wooden "blooper", side view (the Grenade Launcher's level III look). */
function glIcon2(c: G): void {
  const st: PathFn = (q) => {
    q.moveTo(-0.42, -0.04);
    q.bezierCurveTo(-0.32, -0.035, -0.2, -0.03, -0.11, -0.035);
    q.lineTo(-0.11, 0.02);
    q.quadraticCurveTo(-0.16, 0.025, -0.2, 0.04);
    q.bezierCurveTo(-0.28, 0.065, -0.36, 0.08, -0.42, 0.095);
    q.closePath();
  };
  part(c, st, { base: "#6a4426", box: [-0.42, -0.04, -0.11, 0.095], tex: woodTex(51, 0.06), hi: 0.32 });
  part(c, (q) => Pg(q, [-0.445, -0.044, -0.42, -0.041, -0.42, 0.096, -0.445, 0.1]), { base: "#141415", box: [-0.445, -0.044, -0.42, 0.1], tex: polyTex(52, true), hi: 0.2 });
  part(c, (q) => R(q, -0.125, -0.05, 0.11, 0.07, 0.01), { base: "#2a2c30", box: [-0.125, -0.05, -0.015, 0.02], tex: steelTex(53, 1), hi: 0.45 });
  fillP(c, (q) => R(q, -0.1, -0.062, 0.03, 0.014, 0.004), "#1d1e21");
  trigger(c, (q) => { q.moveTo(-0.11, 0.02); q.quadraticCurveTo(-0.115, 0.058, -0.08, 0.056); q.lineTo(-0.055, 0.053); q.quadraticCurveTo(-0.045, 0.038, -0.045, 0.02); }, (q) => { q.moveTo(-0.08, 0.02); q.quadraticCurveTo(-0.078, 0.038, -0.088, 0.044); });
  tube(c, -0.02, 0.33, -0.02, 0.064, "#2c2f33", steelTex(54, 0.9), 0.01);
  part(c, (q) => R(q, 0.315, -0.055, 0.025, 0.07, 0.006), { base: "#222427", box: [0.315, -0.055, 0.34, 0.015], hi: 0.45, line: 1 });
  const fe: PathFn = (q) => { q.moveTo(0.0, 0.008); q.lineTo(0.2, 0.008); q.quadraticCurveTo(0.215, 0.02, 0.2, 0.034); q.lineTo(0.0, 0.034); q.closePath(); };
  part(c, fe, { base: "#5c3a21", box: [0, 0.008, 0.215, 0.034], tex: woodTex(55, 0), hi: 0.3 });
  part(c, (q) => { q.moveTo(0.05, -0.052); q.lineTo(0.058, -0.11); q.lineTo(0.095, -0.11); q.lineTo(0.1, -0.052); q.closePath(); }, { base: "#1c1d20", box: [0.05, -0.11, 0.1, -0.052], hi: 0.3, line: 1 });
  fillP(c, (q) => R(q, 0.064, -0.1, 0.022, 0.04), "#08090a");
  for (const [x, y] of [[-0.1, -0.03], [-0.04, 0.0]] as const) rivet(c, x, y, 0.0045, "#4a4d52");
}

/** GL3 pump-action tube launcher (4-round tube under the barrel), side view (the level IV look). */
function glIcon3(c: G): void {
  const st: PathFn = (q) => {
    q.moveTo(-0.47, -0.045);
    q.bezierCurveTo(-0.38, -0.04, -0.26, -0.035, -0.17, -0.04);
    q.lineTo(-0.17, 0.02);
    q.quadraticCurveTo(-0.21, 0.024, -0.25, 0.04);
    q.bezierCurveTo(-0.32, 0.065, -0.4, 0.08, -0.47, 0.095);
    q.closePath();
  };
  part(c, st, { base: "#5e3d22", box: [-0.47, -0.045, -0.17, 0.095], tex: woodTex(61, 0.06), hi: 0.3 });
  part(c, (q) => Pg(q, [-0.49, -0.048, -0.47, -0.045, -0.47, 0.096, -0.49, 0.1]), { base: "#141415", box: [-0.49, -0.048, -0.47, 0.1], tex: polyTex(62, true), hi: 0.2 });
  trigger(c, (q) => { q.moveTo(-0.16, 0.022); q.quadraticCurveTo(-0.165, 0.06, -0.13, 0.058); q.lineTo(-0.105, 0.055); q.quadraticCurveTo(-0.095, 0.04, -0.095, 0.022); }, (q) => { q.moveTo(-0.13, 0.022); q.quadraticCurveTo(-0.128, 0.04, -0.138, 0.046); });
  part(c, (q) => R(q, -0.175, -0.06, 0.17, 0.085, 0.008), { base: "#26282c", box: [-0.175, -0.06, -0.005, 0.025], tex: steelTex(63, 1), hi: 0.45 });
  fillP(c, (q) => R(q, -0.13, -0.045, 0.07, 0.03, 0.003), "#08090a");
  tube(c, -0.01, 0.33, 0.022, 0.046, "#2a2c30", steelTex(64, 0.8), 0.01);
  tube(c, -0.01, 0.4, -0.034, 0.05, "#24262a", steelTex(65, 0.9), 0.008);
  part(c, (q) => R(q, 0.385, -0.062, 0.022, 0.056, 0.005), { base: "#1d1f22", box: [0.385, -0.062, 0.407, -0.006], hi: 0.45, line: 1 });
  const fe: PathFn = (q) => R(q, 0.07, -0.004, 0.17, 0.054, 0.014);
  part(c, fe, { base: "#6a4426", box: [0.07, -0.004, 0.24, 0.05], tex: woodTex(66, 0), hi: 0.32 });
  c.save();
  c.beginPath();
  fe(c);
  c.clip();
  for (let x = 0.085; x < 0.235; x += 0.0105) strokeP(c, (q) => { q.moveTo(x, -0.01); q.lineTo(x, 0.06); }, "rgba(14,6,2,0.78)", 1.8 * P, "butt");
  c.restore();
  part(c, (q) => Pg(q, [0.02, -0.058, 0.03, -0.1, 0.07, -0.1, 0.08, -0.058]), { base: "#1c1d20", box: [0.02, -0.1, 0.08, -0.058], hi: 0.3, line: 1 });
  for (let y = -0.094; y < -0.062; y += 0.008) strokeP(c, (q) => { q.moveTo(0.035, y); q.lineTo(0.065, y); }, "rgba(200,205,210,0.35)", 0.8 * P, "butt");
  part(c, (q) => R(q, -0.11, -0.044, 0.04, 0.024, 0.004), { base: "#a8853a", box: [-0.11, -0.044, -0.07, -0.02], hi: 0.6, line: 0.8 }); // a 40 mm round in the port
}

/** An icon drawing at `size` px per metre (the shared icon frame: `P` set, scaled, restored). */
function glIcon(draw: (c: G) => void): (c: G, size: number) => void {
  return (c, size) => {
    P = 1 / size;
    c.save();
    c.scale(size, size);
    draw(c);
    c.restore();
  };
}
export const drawGrenadeLauncherBlooper = glIcon(glIcon2);
export const drawGrenadeLauncherPump = glIcon(glIcon3);

/**
 * GL1 Grenade Launcher (Story 5.5). `view` "icon": the side view, `size` px per metre; "held":
 * top-down in the survivor's hands, `size` = r px (looks.html `heldGL('GL1')`: a fat drum, a short
 * stubby barrel; it reads as "not a gun" at game size).
 */
export function drawGrenadeLauncher(c: G, view: WeaponArtView, size: number): void {
  if (view === "icon") return glIcon(glIcon1)(c, size);
  const r = size;
  c.lineJoin = "round";
  heldPart(c, (q) => R(q, r * 0.1, -r * 0.1, r * 0.42, r * 0.2, r * 0.04), "#26282b", r);
  c.fillStyle = "#0d0e10";
  c.fillRect(r * 0.16, -r * 0.05, r * 0.28, r * 0.1);
  heldPart(c, (q) => R(q, r * 0.5, -r * 0.25, r * 0.56, r * 0.5, r * 0.11), "#4f545b", r);
  for (let y = -r * 0.15; y < r * 0.2; y += r * 0.1) strokeP(c, (q) => { q.moveTo(r * 0.55, y); q.lineTo(r * 1.01, y); }, "rgba(0,0,0,0.65)", Math.max(1, r * 0.05), "butt");
  heldGlint(c, r * 0.56, r * 1.0, -r * 0.2, r, 0.4);
  heldPart(c, (q) => R(q, r * 1.04, -r * 0.15, r * 0.8, r * 0.3, r * 0.06), "#2e3135", r);
  heldPart(c, (q) => R(q, r * 1.8, -r * 0.18, r * 0.1, r * 0.36, r * 0.03), "#1f2124", r);
  heldGlint(c, r * 1.07, r * 1.78, -r * 0.09, r, 0.4);
}

// ================= Story 5.4: the flame weapons (round C: FT1 Flamethrower, FT2 Gas torch) =================
// Ported from `docs/art/epic-5/round-c/looks.html` (FT1 military twin-tank, FT2 scavenged propane rig).

function rustTex(seed: number, amt = 1): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    const area = (w * h) / (P * P);
    const nb = Math.min(26, 4 + area * 0.0015) * amt;
    for (let i = 0; i < nb; i++) {
      const x = x0 + r() * w;
      const y = y0 + r() * h;
      const rr = Math.max(w, h) * (0.04 + r() * 0.14);
      const g = c.createRadialGradient(x, y, 0, x, y, rr);
      const col = r() < 0.5 ? "150,72,28" : "92,46,20";
      g.addColorStop(0, `rgba(${col},${0.28 + r() * 0.32})`);
      g.addColorStop(1, `rgba(${col},0)`);
      c.fillStyle = g;
      c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
    const n = Math.min(900, area * 0.05 * amt);
    for (let i = 0; i < n; i++) {
      c.fillStyle = r() < 0.6 ? `rgba(160,84,36,${0.18 + r() * 0.3})` : `rgba(28,20,15,${0.2 + r() * 0.3})`;
      const sz = P * (0.6 + r() * 1.6);
      c.fillRect(x0 + r() * w, y0 + r() * h, sz, sz);
    }
  };
}
function flameTube(c: G, x0: number, x1: number, y: number, d: number, base: string, tex: Tex, o: { r?: number } = {}): PathFn {
  const p: PathFn = (q) => R(q, x0, y - d / 2, x1 - x0, d, o.r ?? d * 0.3);
  part(c, p, { base, lit: "top", box: [x0, y - d / 2, x1, y + d / 2], tex, hi: 0.45, lo: 0.5, rim: 0.4 });
  return p;
}
function hoseS(c: G, path: PathFn, w: number, col: string, ridge = true): void {
  strokeP(c, path, "#050506", w + 2.2 * P);
  strokeP(c, path, col, w);
  if (ridge) {
    c.save();
    c.setLineDash([w * 0.35, w * 0.35]);
    strokeP(c, path, "rgba(0,0,0,0.45)", w * 0.9, "butt");
    c.restore();
  }
  c.save();
  c.translate(-w * 0.12, -w * 0.18);
  strokeP(c, path, "rgba(200,210,225,0.22)", w * 0.25);
  c.restore();
}
function holes(c: G, clip: PathFn, x0: number, x1: number, y0: number, y1: number, step: number, r: number): void {
  c.save();
  c.beginPath();
  clip(c);
  c.clip();
  let row = 0;
  for (let y = y0; y <= y1; y += step, row++) {
    for (let x = x0 + (row % 2) * (step / 2); x <= x1; x += step) {
      fillP(c, (q) => E(q, x, y, r, r * 0.8), "rgba(4,4,5,0.9)");
      fillP(c, (q) => E(q, x + r * 0.3, y + r * 0.35, r * 0.5, r * 0.3), "rgba(255,190,120,0.10)");
    }
  }
  c.restore();
}
function flameGrip(c: G, x: number, y: number, len: number, ang: number, w: number, base: string, tex?: Tex): void {
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const pts = [[-w / 2, 0], [w / 2, 0], [(w / 2) * 0.9, len], [(-w / 2) * 1.1, len]] as const;
  const g: PathFn = (q) => {
    for (let i = 0; i < 4; i++) {
      const [px, py] = pts[i] as readonly [number, number];
      const X = x + px * ca - py * sa;
      const Y = y + px * sa + py * ca;
      if (i) q.lineTo(X, Y);
      else q.moveTo(X, Y);
    }
    q.closePath();
  };
  part(c, g, { base, box: [x - len, y - 0.01, x + len, y + len], tex: tex ?? polyTex(91, true), hi: 0.3, rim: 0.3 });
  c.save();
  c.beginPath();
  g(c);
  c.clip();
  for (let k = 1; k < 6; k++) strokeP(c, (q) => { q.moveTo(x - 0.06, y + (len * k) / 6); q.lineTo(x + 0.06, y + (len * k) / 6 + 0.004); }, "rgba(0,0,0,0.35)", 1 * P, "butt");
  c.restore();
}
function glowAt(c: G, x: number, y: number, r: number, rgb: string, a: number): void {
  if (a <= 0 || r <= 0) return;
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
/** The pilot flame at the nozzle (orange FT1, blue FT2), a still frame (the atlas is drawn once). */
function pilotIcon(c: G, x: number, y: number, blue: boolean): void {
  if (blue) {
    glowAt(c, x, y, 0.03, "120,170,255", 0.9);
    glowAt(c, x + 0.008, y, 0.012, "235,245,255", 0.9);
  } else {
    glowAt(c, x, y, 0.032, "255,150,50", 0.9);
    glowAt(c, x + 0.006, y - 0.002, 0.012, "255,240,200", 0.9);
  }
}
function pilotHeld(c: G, x: number, y: number, r: number, blue: boolean): void {
  if (blue) {
    glowAt(c, x, y, r * 0.2, "110,160,255", 0.9);
    glowAt(c, x, y, r * 0.08, "235,245,255", 0.9);
  } else {
    glowAt(c, x, y, r * 0.22, "255,150,50", 0.85);
    glowAt(c, x, y, r * 0.08, "255,240,200", 0.9);
  }
}
function heldBox(c: G, x: number, y: number, w: number, h: number, fill: string, rad: number): void {
  c.beginPath();
  R(c, x, y, w, h, rad);
  c.fillStyle = fill;
  c.fill();
  c.stroke();
}

const FT1_OD = "#4b5034";

/**
 * Story 5.4 FT1: the Flamethrower, an old army twin-tank (two olive tanks, a perforated heat shield
 * on the wand, an orange pilot flame). "icon": side view (`size` px per metre); "held": top-down in
 * the hands (`size` = r px), the tanks on the back come from `drawFlamethrowerBack`.
 * Icon improved over the round C card (designer: "shop icon to be improved"): a bolder nozzle with
 * a lick of fuel flame, and lighter tank tops, so it reads as a flamethrower at 96 × 44.
 */
export function drawFlamethrower(c: G, view: WeaponArtView, size: number): void {
  if (view === "held") {
    const r = size;
    c.lineWidth = Math.max(1, r * 0.05);
    c.strokeStyle = "rgba(6,6,6,0.85)";
    heldBox(c, r * 0.3, -r * 0.15, r * 0.34, r * 0.3, "#2a2c30", r * 0.05);
    heldBox(c, r * 0.6, -r * 0.08, r * 1.5, r * 0.16, "#25272b", r * 0.06);
    heldBox(c, r * 1.18, -r * 0.14, r * 0.85, r * 0.28, FT1_OD, r * 0.06);
    c.fillStyle = "rgba(0,0,0,0.75)";
    for (let x = r * 1.27; x < r * 1.98; x += r * 0.11) {
      for (const y of [-r * 0.06, r * 0.03]) {
        c.beginPath();
        c.arc(x, y, Math.max(0.6, r * 0.03), 0, TAU);
        c.fill();
      }
    }
    heldBox(c, r * 1.62, r * 0.12, r * 0.4, r * 0.11, "#2a2c30", r * 0.04);
    c.beginPath();
    c.moveTo(r * 2.02, -r * 0.1);
    c.lineTo(r * 2.27, -r * 0.06);
    c.lineTo(r * 2.27, r * 0.06);
    c.lineTo(r * 2.02, r * 0.1);
    c.closePath();
    c.fillStyle = "#2b2d31";
    c.fill();
    c.stroke();
    strokeP(c, (q) => { q.moveTo(r * 0.62, -r * 0.055); q.lineTo(r * 2.0, -r * 0.055); }, "rgba(190,205,225,0.35)", Math.max(0.8, r * 0.03), "butt");
    pilotHeld(c, r * 2.02, r * 0.175, r, false);
    return;
  }
  P = 1 / size;
  c.save();
  c.scale(size, size);
  const tk = (y: number, base: string, sd: number): void => {
    const p: PathFn = (q) => R(q, -0.5, y, 0.4, 0.1, 0.05);
    part(c, p, { base, lit: "top", box: [-0.5, y, -0.1, y + 0.1], tex: steelTex(sd, 0.9), hi: 0.5, lo: 0.55 });
    c.save();
    c.beginPath();
    p(c);
    c.clip();
    for (const x of [-0.43, -0.17]) strokeP(c, (q) => { q.moveTo(x, y - 0.01); q.lineTo(x, y + 0.11); }, "rgba(0,0,0,0.4)", 2 * P, "butt");
    c.restore();
  };
  tk(-0.005, shade(FT1_OD, -0.3), 11);
  tk(0.055, FT1_OD, 12);
  fillP(c, (q) => R(q, -0.37, 0.054, 0.03, 0.11), "rgba(30,26,18,0.9)");
  fillP(c, (q) => R(q, -0.25, 0.054, 0.03, 0.11), "rgba(30,26,18,0.9)");
  part(c, (q) => R(q, -0.095, 0.08, 0.03, 0.05, 0.008), { base: "#8a6a2c", box: [-0.095, 0.08, -0.065, 0.13], hi: 0.5, line: 1 });
  hoseS(c, (q) => { q.moveTo(-0.07, 0.1); q.bezierCurveTo(0.02, 0.13, 0.02, 0.02, -0.12, 0.0); q.quadraticCurveTo(-0.24, -0.02, -0.27, -0.05); }, 0.022, "#1d1e20");
  flameGrip(c, -0.215, -0.045, 0.085, 0.35, 0.032, "#1e1f22");
  trigger(
    c,
    (q) => { q.moveTo(-0.195, -0.045); q.quadraticCurveTo(-0.2, -0.01, -0.165, -0.012); q.lineTo(-0.14, -0.015); q.quadraticCurveTo(-0.13, -0.03, -0.13, -0.045); },
    (q) => { q.moveTo(-0.16, -0.045); q.quadraticCurveTo(-0.158, -0.03, -0.168, -0.022); },
  );
  part(c, (q) => R(q, -0.3, -0.098, 0.12, 0.055, 0.01), { base: "#2a2c30", box: [-0.3, -0.098, -0.18, -0.043], tex: steelTex(13, 1), hi: 0.45 });
  rivet(c, -0.285, -0.07, 0.012, "#b08a3c", true);
  flameTube(c, -0.18, 0.36, -0.07, 0.03, "#25272b", steelTex(14, 0.8));
  flameGrip(c, 0.015, -0.06, 0.075, -0.1, 0.03, "#1e1f22");
  const hs = flameTube(c, 0.1, 0.34, -0.07, 0.056, FT1_OD, steelTex(15, 1.1), { r: 0.01 });
  holes(c, hs, 0.115, 0.33, -0.09, -0.05, 0.013, 0.0035);
  for (const x of [0.105, 0.335]) fillP(c, (q) => R(q, x - 0.006, -0.1, 0.012, 0.06, 0.003), "#2c2f22");
  flameTube(c, 0.22, 0.355, -0.026, 0.022, "#2a2c30", steelTex(16, 0.8));
  fillP(c, (q) => R(q, 0.25, -0.04, 0.012, 0.03), "#1a1b1d");
  // the nozzle, bolder than the card's (it is what says "flamethrower" at shop size)
  part(c, (q) => Pg(q, [0.34, -0.092, 0.4, -0.086, 0.45, -0.08, 0.45, -0.06, 0.4, -0.054, 0.34, -0.048]), { base: "#2b2d31", box: [0.34, -0.092, 0.45, -0.048], tex: steelTex(17, 1), hi: 0.55 });
  fillP(c, (q) => R(q, 0.444, -0.08, 0.009, 0.02, 0.002), "#9c7a36");
  // a lick of burning fuel out of the nozzle
  const lick: PathFn = (q) => { q.moveTo(0.452, -0.078); q.quadraticCurveTo(0.49, -0.095, 0.515, -0.072); q.quadraticCurveTo(0.49, -0.062, 0.452, -0.062); q.closePath(); };
  c.save();
  c.globalCompositeOperation = "lighter";
  const lg = c.createLinearGradient(0.452, 0, 0.515, 0);
  lg.addColorStop(0, "rgba(255,235,170,0.95)");
  lg.addColorStop(0.5, "rgba(255,150,40,0.85)");
  lg.addColorStop(1, "rgba(200,60,10,0)");
  fillP(c, lick, "rgba(0,0,0,0)");
  c.beginPath();
  lick(c);
  c.fillStyle = lg;
  c.fill();
  c.restore();
  pilotIcon(c, 0.365, -0.026, false);
  c.restore();
}

/** FT1's twin tanks on the survivor's back (top-down, r px; replaces the backpack). */
export function drawFlamethrowerBack(c: G, r: number): void {
  c.lineWidth = Math.max(1, r * 0.06);
  for (const sgn of [-1, 1]) {
    const x = -r * 0.78;
    const y = sgn * r * 0.29;
    const rr = r * 0.3;
    c.beginPath();
    c.arc(x, y, rr, 0, TAU);
    const g = c.createRadialGradient(x - rr * 0.35, y - rr * 0.35, 0, x, y, rr);
    g.addColorStop(0, shade(FT1_OD, 0.35));
    g.addColorStop(0.6, FT1_OD);
    g.addColorStop(1, shade(FT1_OD, -0.55));
    c.fillStyle = g;
    c.fill();
    c.strokeStyle = "rgba(6,6,6,0.85)";
    c.stroke();
    c.beginPath();
    c.arc(x, y, rr * 0.32, 0, TAU);
    c.fillStyle = "#8a6a2c";
    c.fill();
    c.stroke();
  }
  c.fillStyle = "#1e1d18";
  c.fillRect(-r * 0.84, -r * 0.05, r * 0.16, r * 0.1);
  c.beginPath();
  c.moveTo(-r * 0.62, r * 0.42);
  c.bezierCurveTo(-r * 0.25, r * 1.12, r * 0.25, r * 0.75, r * 0.38, r * 0.14);
  c.lineCap = "round";
  c.strokeStyle = "rgba(6,6,6,0.9)";
  c.lineWidth = r * 0.17;
  c.stroke();
  c.strokeStyle = "#1d1e20";
  c.lineWidth = r * 0.11;
  c.stroke();
  c.strokeStyle = "rgba(190,200,215,0.25)";
  c.lineWidth = r * 0.03;
  c.stroke();
  c.lineCap = "butt";
}

const FT2_RED = "#8e2a20";

/**
 * Story 5.4 FT2: the Gas torch, a scavenged propane rig (a water pipe, a red propane bottle clamped
 * under it, a blue camping-torch pilot). "icon": side view; "held": top-down (`size` = r px).
 */
export function drawGasTorch(c: G, view: WeaponArtView, size: number): void {
  if (view === "held") {
    const r = size;
    c.lineWidth = Math.max(1, r * 0.05);
    c.strokeStyle = "rgba(6,6,6,0.85)";
    heldBox(c, r * 0.12, -r * 0.09, r * 0.5, r * 0.18, "#6b4a2a", r * 0.05);
    heldBox(c, r * 0.62, r * 0.02, r * 0.95, r * 0.38, FT2_RED, r * 0.17);
    heldBox(c, r * 0.45, -r * 0.07, r * 1.75, r * 0.14, "#7d8186", r * 0.05);
    for (const x of [0.78, 1.35]) heldBox(c, r * x, -r * 0.11, r * 0.12, r * 0.5, "#8f9399", r * 0.02);
    heldBox(c, r * 2.15, -r * 0.11, r * 0.15, r * 0.22, "#a8853a", r * 0.04);
    strokeP(c, (q) => { q.moveTo(r * 0.47, -r * 0.035); q.lineTo(r * 2.15, -r * 0.035); }, "rgba(210,220,230,0.4)", Math.max(0.8, r * 0.03), "butt");
    pilotHeld(c, r * 2.15, r * 0.15, r, true);
    return;
  }
  P = 1 / size;
  c.save();
  c.scale(size, size);
  const st: PathFn = (q) => { q.moveTo(-0.48, -0.085); q.lineTo(-0.2, -0.075); q.lineTo(-0.2, -0.045); q.lineTo(-0.48, -0.04); q.quadraticCurveTo(-0.5, -0.062, -0.48, -0.085); q.closePath(); };
  part(c, st, { base: "#6b4a2a", box: [-0.5, -0.09, -0.2, -0.04], tex: woodTex(21, 0), hi: 0.3 });
  c.save();
  c.beginPath();
  st(c);
  c.clip();
  fillP(c, (q) => R(q, -0.33, -0.1, 0.06, 0.07), "#7a7b76");
  for (let x = -0.33; x < -0.27; x += 0.012) strokeP(c, (q) => { q.moveTo(x, -0.1); q.lineTo(x + 0.006, -0.03); }, "rgba(0,0,0,0.3)", 0.8 * P, "butt");
  c.restore();
  flameGrip(c, -0.17, -0.05, 0.09, 0.32, 0.034, "#3e5a37", polyTex(22));
  trigger(
    c,
    (q) => { q.moveTo(-0.15, -0.05); q.quadraticCurveTo(-0.155, -0.012, -0.12, -0.014); q.lineTo(-0.1, -0.018); q.quadraticCurveTo(-0.09, -0.03, -0.09, -0.05); },
    (q) => { q.moveTo(-0.12, -0.05); q.quadraticCurveTo(-0.118, -0.032, -0.13, -0.024); },
  );
  part(c, (q) => R(q, -0.21, -0.09, 0.1, 0.05, 0.012), { base: "#3e5a37", box: [-0.21, -0.09, -0.11, -0.04], tex: polyTex(23), hi: 0.4 });
  flameTube(c, -0.12, 0.39, -0.068, 0.027, "#7d8186", rustTex(24, 0.7));
  for (const x of [-0.02, 0.2, 0.31]) part(c, (q) => R(q, x, -0.084, 0.035, 0.032, 0.004), { base: "#77786f", box: [x, -0.084, x + 0.035, -0.052], tex: polyTex(25 + ((x * 10) | 0)), hi: 0.35, line: 0.9 });
  part(c, (q) => Pg(q, [0.385, -0.08, 0.43, -0.086, 0.452, -0.09, 0.452, -0.046, 0.43, -0.05, 0.385, -0.056]), { base: "#a8853a", box: [0.385, -0.09, 0.452, -0.046], tex: steelTex(26, 0.5), hi: 0.55 });
  for (let x = 0.395; x < 0.43; x += 0.008) strokeP(c, (q) => { q.moveTo(x, -0.083); q.lineTo(x, -0.053); }, "rgba(60,40,10,0.6)", 0.8 * P, "butt");
  const bt: PathFn = (q) => R(q, -0.11, -0.035, 0.33, 0.13, 0.06);
  part(c, bt, { base: FT2_RED, lit: "top", box: [-0.11, -0.035, 0.22, 0.095], tex: rustTex(27, 0.6), hi: 0.42, lo: 0.55 });
  c.save();
  c.beginPath();
  bt(c);
  c.clip();
  fillP(c, (q) => R(q, 0.0, 0.0, 0.12, 0.05, 0.005), "rgba(205,195,170,0.55)");
  c.restore();
  for (const x of [-0.06, 0.15]) {
    fillP(c, (q) => R(q, x, -0.09, 0.014, 0.19, 0.003), "#8f9399");
    strokeP(c, (q) => { q.moveTo(x + 0.003, -0.088); q.lineTo(x + 0.003, 0.09); }, "rgba(255,255,255,0.35)", 0.8 * P);
  }
  part(c, (q) => R(q, 0.215, -0.0, 0.04, 0.06, 0.01), { base: "#9a9da2", box: [0.215, 0, 0.255, 0.06], tex: steelTex(28, 0.6), hi: 0.5, line: 1 });
  hoseS(c, (q) => { q.moveTo(0.25, 0.025); q.bezierCurveTo(0.31, 0.03, 0.33, -0.02, 0.3, -0.05); }, 0.014, "#2a2b2d", false);
  flameTube(c, 0.33, 0.4, -0.036, 0.018, "#2b4f8c", polyTex(29));
  pilotIcon(c, 0.405, -0.036, true);
  c.restore();
}


// ---------- Story 5.28: the Epic 1 weapons' side-view shop icons (designer picks S1 / H1 / M1, `docs/epic-5-decisions.md` › "Early weapon card art"), ported from the `EARLY` block of `docs/art/5-13/early-weapons.html`. Icon only: the held (top-down) art stays the survivor's plain gun. ----------

/** A steel rod (wire stock, lever loop, bolt handle): dark outline, body, a light line on top. */
function rod(c: G, path: PathFn, w: number, col: string): void {
  strokeP(c, path, "#050506", w + 2 * P);
  strokeP(c, path, col, w);
  c.save();
  c.translate(0, -w * 0.28);
  strokeP(c, path, "rgba(200,210,225,0.35)", Math.max(0.8 * P, w * 0.25));
  c.restore();
}
/** A bright ground edge along `edge`, clipped to the blade `blade`, shifted `dy` into the blade. */
function bladeEdge(c: G, blade: PathFn, edge: PathFn, dy: number, w: number, col = "#c9ccd0"): void {
  c.save();
  c.beginPath();
  blade(c);
  c.clip();
  c.save();
  c.translate(0, dy);
  strokeP(c, edge, col, w, "butt");
  c.restore();
  strokeP(c, edge, "rgba(255,255,255,0.55)", 1.6 * P, "butt");
  c.restore();
}
/** A dark recess (vent hole, slot, lightening cut). */
const hole = (c: G, path: PathFn): void => { fillP(c, path, "#08090a"); c.save(); c.translate(0.8 * P, 0.9 * P); c.globalAlpha = 0.35; strokeP(c, path, "#7d848c", 0.7 * P); c.restore(); };
/** A riflescope along x (eyepiece bell, tube, turret, objective bell, lens glint). */
function scope(c: G, x0: number, x1: number, y: number, d: number, base: string, o: { eye?: number; obj?: number; bell?: number; shade?: number } = {}): void {
  const eb = o.eye ?? 0.07, ob = o.obj ?? 0.1, D = o.bell ?? d * 1.55;
  const body = (q: G) => {
    q.moveTo(x0, y - D * 0.42); q.lineTo(x0 + eb * 0.55, y - D * 0.42); q.lineTo(x0 + eb, y - d / 2);
    q.lineTo(x1 - ob, y - d / 2); q.lineTo(x1 - ob * 0.35, y - D / 2); q.lineTo(x1, y - D / 2);
    q.lineTo(x1, y + D / 2); q.lineTo(x1 - ob * 0.35, y + D / 2); q.lineTo(x1 - ob, y + d / 2);
    q.lineTo(x0 + eb, y + d / 2); q.lineTo(x0 + eb * 0.55, y + D * 0.42); q.lineTo(x0, y + D * 0.42); q.closePath();
  };
  const tx = (x0 + x1) / 2 - 0.01;
  part(c, (q) => R(q, tx - 0.016, y - d / 2 - 0.022, 0.032, 0.024, 0.004), { base, box: [tx - 0.016, y - d / 2 - 0.022, tx + 0.016, y - d / 2 + 0.002], tex: steelTex(301, 0.4), hi: 0.45 });
  part(c, (q) => R(q, tx - 0.012, y + d / 2 - 0.002, 0.024, 0.016, 0.004), { base, box: [tx - 0.012, y + d / 2 - 0.002, tx + 0.012, y + d / 2 + 0.014], hi: 0.35 });
  part(c, body, { base, lit: "top", box: [x0, y - D / 2, x1, y + D / 2], tex: steelTex(302, 0.35), hi: 0.55, lo: 0.55, rim: 0.45 });
  for (const x of [x0 + eb, x1 - ob]) strokeP(c, (q) => { q.moveTo(x, y - d / 2); q.lineTo(x, y + d / 2); }, "rgba(0,0,0,0.6)", 1 * P, "butt");
  const sh = o.shade;
  if (sh) part(c, (q) => R(q, x1, y - D / 2 + 0.002, sh, D - 0.004, 0.004), { base, box: [x1, y - D / 2, x1 + sh, y + D / 2], tex: steelTex(303, 0.4), hi: 0.4 });
  const lx = x1 + (o.shade ?? 0) - 0.003;
  const g = c.createLinearGradient(0, y - D / 2, 0, y + D / 2);
  g.addColorStop(0, "#9fd0ff"); g.addColorStop(0.45, "#2b4a78"); g.addColorStop(1, "#0d1424");
  fillP(c, (q) => E(q, lx, y, 0.006, D * 0.42), g);
  fillP(c, (q) => E(q, lx - 0.001, y - D * 0.18, 0.0025, D * 0.12), "rgba(255,255,255,0.8)");
}

// ---------------------------------- SMG ----------------------------------


/** S1 compact stamped-steel SMG: perforated barrel jacket, straight stick magazine, folding wire stock. */
export function drawSmg(c: G, size: number): void {
  P = 1 / size; c.save(); c.scale(size, size);
  // folding wire stock (behind everything)
  rod(c, (q) => { q.moveTo(-0.19, -0.045); q.lineTo(-0.47, -0.04); }, 0.014, "#34373b");
  rod(c, (q) => { q.moveTo(-0.19, -0.01); q.lineTo(-0.47, 0.065); }, 0.014, "#34373b");
  part(c, (q) => R(q, -0.5, -0.06, 0.034, 0.145, 0.01), { base: "#2b2d31", box: [-0.5, -0.06, -0.466, 0.085], tex: steelTex(311, 0.9), hi: 0.4 });
  // barrel + perforated jacket
  part(c, (q) => R(q, 0.4, -0.04, 0.075, 0.018, 0.003), { base: "#1f2124", box: [0.4, -0.04, 0.475, -0.022], tex: steelTex(312, 0.5), hi: 0.45 });
  part(c, (q) => R(q, 0.455, -0.072, 0.012, 0.034, 0.002), { base: "#2a2c30", box: [0.455, -0.072, 0.467, -0.038], hi: 0.4 });
  const jk = (q: G) => R(q, 0.19, -0.056, 0.22, 0.05, 0.012);
  part(c, jk, { base: "#2c2e32", lit: "top", box: [0.19, -0.056, 0.41, -0.006], tex: steelTex(313, 0.9), hi: 0.5, lo: 0.5 });
  for (let x = 0.22; x < 0.39; x += 0.034) hole(c, (q) => R(q, x, -0.042, 0.02, 0.022, 0.009));
  // receiver tube
  const rc = (q: G) => { q.moveTo(-0.2, -0.066); q.lineTo(0.2, -0.066); q.lineTo(0.2, 0.004); q.lineTo(-0.17, 0.004); q.quadraticCurveTo(-0.2, 0.004, -0.2, -0.02); q.closePath(); };
  part(c, rc, { base: "#33363a", box: [-0.2, -0.066, 0.2, 0.004], tex: steelTex(314, 1.1), hi: 0.5 });
  hole(c, (q) => R(q, -0.13, -0.044, 0.17, 0.009, 0.004)); // cocking slot
  part(c, (q) => { E(q, 0.03, -0.04, 0.012, 0.011); }, { base: "#4a4d52", box: [0.018, -0.051, 0.042, -0.029], hi: 0.6, line: 1 });
  part(c, (q) => Pg(q, [-0.17, -0.066, -0.16, -0.084, -0.13, -0.084, -0.12, -0.066]), { base: "#2b2d31", box: [-0.17, -0.084, -0.12, -0.066], hi: 0.4 });
  for (const [x, y] of [[-0.185, -0.01], [0.18, -0.01], [0.1, -0.055], [-0.06, -0.055]] as const) rivet(c, x, y, 0.0045, "#55585c");
  // stick magazine + well
  const mg = (q: G) => { q.moveTo(0.072, 0.0); q.lineTo(0.128, 0.0); q.lineTo(0.134, 0.215); q.lineTo(0.08, 0.215); q.closePath(); };
  part(c, mg, { base: "#2e3033", box: [0.072, 0, 0.134, 0.215], tex: steelTex(315, 1.2), hi: 0.45 });
  for (const k of [0.07, 0.12, 0.17]) strokeP(c, (q) => { q.moveTo(0.08, k); q.lineTo(0.128, k); }, "rgba(0,0,0,0.45)", 1.3 * P, "butt");
  part(c, (q) => R(q, 0.06, -0.004, 0.08, 0.04, 0.006), { base: "#26282c", box: [0.06, -0.004, 0.14, 0.036], tex: steelTex(316, 1), hi: 0.45 });
  part(c, (q) => R(q, 0.076, 0.208, 0.062, 0.016, 0.004), { base: "#1d1e21", box: [0.076, 0.208, 0.138, 0.224], hi: 0.35 });
  // trigger + pistol grip (brown bakelite)
  trigger(c, (q) => { q.moveTo(-0.09, 0.004); q.quadraticCurveTo(-0.094, 0.056, -0.05, 0.056); q.lineTo(-0.02, 0.054); q.quadraticCurveTo(0.0, 0.045, 0.0, 0.004); }, (q) => { q.moveTo(-0.045, 0.004); q.quadraticCurveTo(-0.042, 0.024, -0.054, 0.034); });
  const gp = (q: G) => { q.moveTo(-0.096, 0.0); q.lineTo(-0.15, 0.0); q.lineTo(-0.19, 0.13); q.quadraticCurveTo(-0.185, 0.148, -0.165, 0.146); q.lineTo(-0.14, 0.142); q.quadraticCurveTo(-0.12, 0.06, -0.096, 0.0); q.closePath(); };
  part(c, gp, { base: "#3a2a20", box: [-0.19, 0, -0.096, 0.148], tex: polyTex(317, true), hi: 0.3 });
  c.restore();
}


/** H1 bolt-action hunting rifle: walnut stock with cheek comb, blued barrel, big scope, bolt knob. */
export function drawHuntingRifle(c: G, size: number): void {
  P = 1 / size; c.save(); c.scale(size, size);
  part(c, (q) => R(q, -0.02, -0.034, 0.5, 0.017, 0.004), { base: "#1f2226", box: [-0.02, -0.034, 0.48, -0.017], tex: steelTex(341, 0.4), hi: 0.5 });
  part(c, (q) => R(q, 0.466, -0.046, 0.01, 0.014, 0.002), { base: "#2a2c30", box: [0.466, -0.046, 0.476, -0.032], hi: 0.4 });
  // stock (designer reference: a classic walnut bolt-action): straight comb, a pistol grip that
  // sweeps down behind the trigger, straight belly to a tall butt, thick black recoil pad, long
  // forend with a rounded tip; black floorplate under the action
  const st = (q: G) => {
    q.moveTo(-0.482, -0.024); q.lineTo(-0.25, -0.03); q.quadraticCurveTo(-0.215, -0.033, -0.195, -0.042); q.lineTo(0.2, -0.026);
    q.quadraticCurveTo(0.236, -0.022, 0.232, 0.0); q.quadraticCurveTo(0.224, 0.016, 0.192, 0.016); q.lineTo(-0.03, 0.02);
    q.lineTo(-0.112, 0.022); q.quadraticCurveTo(-0.13, 0.03, -0.134, 0.058); q.lineTo(-0.14, 0.088);
    q.quadraticCurveTo(-0.162, 0.1, -0.184, 0.09); q.quadraticCurveTo(-0.198, 0.06, -0.24, 0.056); q.lineTo(-0.482, 0.112); q.closePath();
  };
  part(c, st, { base: "#6a4222", box: [-0.482, -0.042, 0.236, 0.112], tex: woodTex(342, -0.04), hi: 0.32 });
  c.save(); c.beginPath(); st(c); c.clip();
  for (const [x0, x1, y0, y1] of [[-0.18, -0.13, 0.03, 0.08], [0.07, 0.17, -0.02, 0.01]] as const) {
    for (let k = x0 - 0.05; k < x1; k += 0.006) {
      strokeP(c, (q) => { q.moveTo(k, y1); q.lineTo(k + (y1 - y0), y0); }, "rgba(20,10,4,0.35)", 0.7 * P, "butt");
      strokeP(c, (q) => { q.moveTo(k, y0); q.lineTo(k + (y1 - y0), y1); }, "rgba(20,10,4,0.35)", 0.7 * P, "butt");
    }
  }
  strokeP(c, (q) => { q.moveTo(-0.48, -0.02); q.lineTo(-0.25, -0.026); q.quadraticCurveTo(-0.215, -0.029, -0.195, -0.038); }, "rgba(240,200,150,0.25)", 1.3 * P); // comb highlight
  c.restore();
  part(c, (q) => Pg(q, [-0.141, 0.084, -0.14, 0.088, -0.162, 0.1, -0.184, 0.09, -0.181, 0.083, -0.162, 0.091]), { base: "#151517", box: [-0.184, 0.083, -0.14, 0.1], hi: 0.3, line: 0.9 }); // grip cap
  part(c, (q) => Pg(q, [-0.482, -0.024, -0.506, -0.026, -0.51, 0.044, -0.506, 0.116, -0.482, 0.112, -0.488, 0.044]), { base: "#18191b", box: [-0.51, -0.026, -0.482, 0.116], tex: polyTex(343), hi: 0.2 }); // recoil pad
  part(c, (q) => R(q, -0.05, 0.014, 0.1, 0.012, 0.003), { base: "#1d1f22", box: [-0.05, 0.014, 0.05, 0.026], hi: 0.35 }); // floorplate
  rivet(c, -0.4, 0.09, 0.0035, "#77797c");
  part(c, (q) => R(q, -0.21, -0.042, 0.2, 0.026, 0.006), { base: "#26282c", box: [-0.21, -0.042, -0.01, -0.016], tex: steelTex(344, 0.6), hi: 0.5 });
  // bolt handle + knob
  rod(c, (q) => { q.moveTo(-0.17, -0.028); q.quadraticCurveTo(-0.18, -0.005, -0.19, 0.012); }, 0.008, "#3a3d42");
  part(c, (q) => E(q, -0.192, 0.016, 0.012, 0.012), { base: "#3e4146", box: [-0.204, 0.004, -0.18, 0.028], hi: 0.6, line: 1 });
  trigger(c, (q) => { q.moveTo(-0.098, 0.018); q.quadraticCurveTo(-0.1, 0.052, -0.07, 0.052); q.lineTo(-0.05, 0.05); q.quadraticCurveTo(-0.034, 0.044, -0.034, 0.018); }, (q) => { q.moveTo(-0.066, 0.018); q.quadraticCurveTo(-0.064, 0.032, -0.074, 0.04); });
  // scope rings + scope
  for (const x of [-0.14, 0.03]) part(c, (q) => R(q, x, -0.074, 0.026, 0.034, 0.003), { base: "#222428", box: [x, -0.074, x + 0.026, -0.04], hi: 0.4 });
  scope(c, -0.235, 0.15, -0.092, 0.034, "#1b1d20", { eye: 0.07, obj: 0.11, bell: 0.056 });
  rivet(c, 0.17, 0.018, 0.0035, "#77797c"); // forend sling swivel
  c.restore();
}


/** M1 classic machete: long black-coated blade with a clipped tip and a bright ground edge, black riveted grip. */
export function drawMachete(c: G, size: number): void {
  P = 1 / size; c.save(); c.scale(size, size);
  const bl = (q: G) => { q.moveTo(-0.24, -0.03); q.lineTo(0.35, -0.038); q.quadraticCurveTo(0.44, -0.034, 0.49, -0.004); q.quadraticCurveTo(0.475, 0.05, 0.4, 0.064); q.quadraticCurveTo(0.08, 0.062, -0.24, 0.032); q.closePath(); };
  const edge = (q: G) => { q.moveTo(0.49, -0.004); q.quadraticCurveTo(0.475, 0.05, 0.4, 0.064); q.quadraticCurveTo(0.08, 0.062, -0.22, 0.034); };
  part(c, bl, { base: "#2b2e32", box: [-0.24, -0.038, 0.49, 0.064], tex: steelTex(371, 1.2), hi: 0.45, lo: 0.45 });
  bladeEdge(c, bl, edge, -0.011, 0.024);
  strokeP(c, (q) => { q.moveTo(-0.2, -0.026); q.lineTo(0.34, -0.033); }, "rgba(210,220,235,0.3)", 1.2 * P); // spine glint
  const hd = (q: G) => {
    q.moveTo(-0.22, -0.036); q.lineTo(-0.47, -0.032); q.quadraticCurveTo(-0.5, -0.03, -0.5, -0.004); q.quadraticCurveTo(-0.5, 0.03, -0.47, 0.06);
    q.quadraticCurveTo(-0.45, 0.07, -0.44, 0.048); q.quadraticCurveTo(-0.4, 0.034, -0.37, 0.044); q.quadraticCurveTo(-0.33, 0.052, -0.3, 0.04); q.quadraticCurveTo(-0.26, 0.036, -0.22, 0.042); q.closePath();
  };
  part(c, hd, { base: "#1b1c1e", box: [-0.5, -0.036, -0.22, 0.07], tex: polyTex(372, true), hi: 0.32 });
  for (const x of [-0.27, -0.34, -0.41]) rivet(c, x, 0.004, 0.007, "#8d9196");
  hole(c, (q) => E(q, -0.475, 0.0, 0.008, 0.008)); // lanyard hole
  c.restore();
}



// Upgrade-tier looks of the Epic 1 weapons (designer 2026-11-24: SMG S1 → S2 → S3; Hunting Rifle H2 → H1 → H3; Machete M2 → M1 → M3).
// Ported from docs/art/5-13/early-weapons.html (S2, S3, H2, H3, M2, M3).

/** S2 boxy suppressed SMG: square receiver, fat suppressor, curved magazine, fixed polymer stock. */
export function drawSmgSuppressed(c: G, size: number): void {
  P = 1 / size; c.save(); c.scale(size, size);
  // fixed stock with a lightening cut
  const st = (q: G) => { q.moveTo(-0.2, -0.06); q.lineTo(-0.47, -0.054); q.lineTo(-0.47, 0.08); q.lineTo(-0.38, 0.08); q.quadraticCurveTo(-0.3, 0.03, -0.2, 0.0); q.closePath(); };
  part(c, st, { base: "#1e1f22", box: [-0.47, -0.06, -0.2, 0.08], tex: polyTex(321), hi: 0.3 });
  hole(c, (q: G) => { q.moveTo(-0.24, -0.035); q.lineTo(-0.42, -0.032); q.lineTo(-0.42, 0.03); q.quadraticCurveTo(-0.33, 0.01, -0.24, -0.012); q.closePath(); });
  part(c, (q: G) => R(q, -0.5, -0.058, 0.032, 0.142, 0.008), { base: "#141516", box: [-0.5, -0.058, -0.468, 0.084], tex: polyTex(322, true), hi: 0.2 });
  // suppressor
  tube(c, 0.19, 0.49, -0.036, 0.078, "#2a2c2f", steelTex(323, 0.6), 0.012);
  for (const x of [0.22, 0.46]) strokeP(c, (q: G) => { q.moveTo(x, -0.074); q.lineTo(x, 0.002); }, "rgba(0,0,0,0.55)", 1.2 * P, "butt");
  // receiver (boxy) + handguard
  const rc = (q: G) => R(q, -0.21, -0.076, 0.32, 0.082, 0.008);
  part(c, rc, { base: "#34373b", box: [-0.21, -0.076, 0.11, 0.006], tex: steelTex(324, 1), hi: 0.5 });
  part(c, (q: G) => R(q, 0.1, -0.068, 0.1, 0.066, 0.01), { base: "#1d1e21", box: [0.1, -0.068, 0.2, -0.002], tex: polyTex(325), hi: 0.3 });
  for (let x = 0.115; x < 0.195; x += 0.016) strokeP(c, (q: G) => { q.moveTo(x, -0.06); q.lineTo(x, -0.01); }, "rgba(0,0,0,0.6)", 1.4 * P, "butt");
  part(c, (q: G) => R(q, -0.18, -0.098, 0.04, 0.024, 0.006), { base: "#26282c", box: [-0.18, -0.098, -0.14, -0.074], hi: 0.4 }); // drum sight
  part(c, (q: G) => R(q, 0.15, -0.084, 0.03, 0.018, 0.005), { base: "#26282c", box: [0.15, -0.084, 0.18, -0.066], hi: 0.4 }); // cocking handle
  strokeP(c, (q: G) => { q.moveTo(-0.2, -0.05); q.lineTo(0.1, -0.05); }, "rgba(0,0,0,0.5)", 1 * P);
  for (const [x, y] of [[-0.19, -0.012], [0.09, -0.012], [-0.06, -0.062]] as const) rivet(c, x, y, 0.0045, "#55585c");
  // curved magazine
  const mg = (q: G) => { q.moveTo(0.025, 0.004); q.lineTo(0.078, 0.004); q.quadraticCurveTo(0.085, 0.11, 0.13, 0.19); q.lineTo(0.088, 0.21); q.quadraticCurveTo(0.036, 0.12, 0.025, 0.004); q.closePath(); };
  part(c, mg, { base: "#2e3033", box: [0.025, 0.004, 0.13, 0.21], tex: steelTex(326, 1.2), hi: 0.45 });
  for (const k of [0.35, 0.65]) strokeP(c, (q: G) => { q.moveTo(0.025 + 0.053 * k, 0.01); q.quadraticCurveTo(0.036 + 0.05 * k, 0.12, 0.088 + 0.042 * k, 0.206 - 0.02 * k); }, "rgba(0,0,0,0.45)", 1.5 * P);
  // trigger + polymer grip
  trigger(c, (q: G) => { q.moveTo(-0.11, 0.006); q.quadraticCurveTo(-0.114, 0.056, -0.07, 0.056); q.lineTo(-0.04, 0.054); q.quadraticCurveTo(-0.02, 0.045, -0.02, 0.006); }, (q: G) => { q.moveTo(-0.065, 0.006); q.quadraticCurveTo(-0.062, 0.026, -0.074, 0.034); });
  const gp = (q: G) => { q.moveTo(-0.115, 0.004); q.lineTo(-0.17, 0.004); q.lineTo(-0.205, 0.135); q.quadraticCurveTo(-0.2, 0.152, -0.18, 0.15); q.lineTo(-0.155, 0.146); q.quadraticCurveTo(-0.138, 0.06, -0.115, 0.004); q.closePath(); };
  part(c, gp, { base: "#1c1d20", box: [-0.205, 0.004, -0.115, 0.152], tex: polyTex(327, true), hi: 0.3 });
  c.restore();
}

/** S3 wooden-stock submachine gun: walnut stock and grips, finned barrel, drum magazine. */
export function drawSmgDrum(c: G, size: number): void {
  P = 1 / size; c.save(); c.scale(size, size);
  const W = "#5b3820";
  const st = (q: G) => { q.moveTo(-0.19, -0.05); q.quadraticCurveTo(-0.34, -0.044, -0.475, -0.034); q.lineTo(-0.475, 0.098); q.quadraticCurveTo(-0.33, 0.05, -0.19, 0.008); q.closePath(); };
  part(c, st, { base: W, box: [-0.475, -0.05, -0.19, 0.098], tex: woodTex(331, -0.1), hi: 0.3 });
  part(c, (q: G) => Pg(q, [-0.475, -0.036, -0.495, -0.037, -0.495, 0.102, -0.475, 0.1]), { base: "#151517", box: [-0.495, -0.037, -0.475, 0.102], tex: polyTex(332), hi: 0.2 });
  // barrel: finned near the receiver, plain, compensator
  part(c, (q: G) => R(q, 0.08, -0.046, 0.33, 0.022, 0.004), { base: "#232528", box: [0.08, -0.046, 0.41, -0.024], tex: steelTex(333, 0.6), hi: 0.45 });
  const fn = (q: G) => R(q, 0.15, -0.058, 0.12, 0.046, 0.006);
  part(c, fn, { base: "#2a2c30", box: [0.15, -0.058, 0.27, -0.012], tex: steelTex(334, 0.8), hi: 0.45 });
  c.save(); c.beginPath(); fn(c); c.clip();
  for (let x = 0.16; x < 0.27; x += 0.0105) strokeP(c, (q: G) => { q.moveTo(x, -0.06); q.lineTo(x, -0.01); }, "rgba(0,0,0,0.7)", 2 * P, "butt");
  c.restore();
  part(c, (q: G) => R(q, 0.4, -0.054, 0.07, 0.038, 0.006), { base: "#26282b", box: [0.4, -0.054, 0.47, -0.016], tex: steelTex(335, 0.7), hi: 0.45 });
  for (const x of [0.415, 0.432, 0.449]) hole(c, (q: G) => R(q, x, -0.054, 0.008, 0.012, 0.002));
  // drum (drawn before the receiver so its top slides up into the magazine housing)
  drumTall(c, 0.1, -0.03, 0.018); // seen almost edge-on, as on the real gun (reference photo)
  // receiver
  part(c, (q: G) => R(q, -0.2, -0.072, 0.29, 0.078, 0.008), { base: "#383a3e", box: [-0.2, -0.072, 0.09, 0.006], tex: steelTex(336, 1.1), hi: 0.5 });
  part(c, (q: G) => Pg(q, [-0.16, -0.072, -0.152, -0.09, -0.124, -0.09, -0.116, -0.072]), { base: "#2b2d31", box: [-0.16, -0.09, -0.116, -0.072], hi: 0.4 });
  part(c, (q: G) => E(q, 0.0, -0.078, 0.013, 0.011), { base: "#55585c", box: [-0.013, -0.089, 0.013, -0.067], hi: 0.6, line: 1 }); // cocking knob
  hole(c, (q: G) => R(q, -0.08, -0.05, 0.13, 0.009, 0.004));
  for (const [x, y] of [[-0.19, -0.012], [0.08, -0.012], [-0.12, -0.012]] as const) rivet(c, x, y, 0.0045, "#5c5f63");
  // trigger + wooden pistol grip + wooden vertical foregrip
  trigger(c, (q: G) => { q.moveTo(-0.1, 0.006); q.quadraticCurveTo(-0.104, 0.054, -0.064, 0.054); q.lineTo(-0.035, 0.052); q.quadraticCurveTo(-0.018, 0.044, -0.018, 0.006); }, (q: G) => { q.moveTo(-0.06, 0.006); q.quadraticCurveTo(-0.057, 0.025, -0.069, 0.033); });
  const gp = (q: G) => { q.moveTo(-0.105, 0.004); q.lineTo(-0.158, 0.004); q.quadraticCurveTo(-0.19, 0.08, -0.19, 0.13); q.quadraticCurveTo(-0.17, 0.15, -0.14, 0.142); q.quadraticCurveTo(-0.14, 0.07, -0.105, 0.004); q.closePath(); };
  part(c, gp, { base: W, box: [-0.19, 0.004, -0.105, 0.15], tex: woodTex(338, 1.3), hi: 0.3 });
  const fg = (q: G) => {
    q.moveTo(0.27, -0.012); q.lineTo(0.33, -0.012); q.lineTo(0.334, 0.03);
    for (let i = 0; i < 3; i++) { const y = 0.03 + i * 0.032; q.quadraticCurveTo(0.346, y + 0.016, 0.336, y + 0.032); }
    q.quadraticCurveTo(0.31, 0.142, 0.28, 0.13); q.quadraticCurveTo(0.262, 0.06, 0.27, -0.012); q.closePath();
  };
  part(c, fg, { base: W, box: [0.262, -0.012, 0.346, 0.142], tex: woodTex(339, 1.5), hi: 0.32 });
  part(c, (q: G) => R(q, 0.264, -0.026, 0.074, 0.018, 0.004), { base: "#2a2c30", box: [0.264, -0.026, 0.338, -0.008], hi: 0.4 });
  // magazine housing: the receiver's front block the drum slides up into, with guide lips hugging
  // the drum's top front and back, a dark slot where it enters and the latch on the back lip
  const hs = (q: G) => { q.moveTo(0.05, -0.064); q.lineTo(0.152, -0.064); q.quadraticCurveTo(0.16, -0.064, 0.16, -0.054); q.lineTo(0.16, 0.012); q.lineTo(0.15, 0.03); q.lineTo(0.138, 0.03); q.lineTo(0.136, 0.018); q.lineTo(0.064, 0.018); q.lineTo(0.062, 0.03); q.lineTo(0.05, 0.03); q.closePath(); };
  part(c, hs, { base: "#36383c", box: [0.05, -0.064, 0.16, 0.03], tex: steelTex(345, 1.1), hi: 0.5 });
  strokeP(c, (q: G) => { q.moveTo(0.066, 0.016); q.lineTo(0.134, 0.016); }, "#050506", 2.2 * P, "butt");
  strokeP(c, (q: G) => { q.moveTo(0.05, -0.04); q.lineTo(0.16, -0.04); }, "rgba(0,0,0,0.5)", 1 * P);
  part(c, (q: G) => R(q, 0.04, -0.004, 0.016, 0.03, 0.004), { base: "#4a4d52", box: [0.04, -0.004, 0.056, 0.026], hi: 0.55, line: 1 }); // latch
  for (const [x, y] of [[0.058, -0.052], [0.152, -0.052], [0.152, 0.004]] as const) rivet(c, x, y, 0.0042, "#5c5f63");
  c.restore();
}


/**
 * S3 drum (designer reference photo): the big round drum hangs under the receiver ahead of the
 * trigger, seen almost edge-on: a tall narrow ellipse. Its rim (the drum's thickness) shows as a
 * dark band at the back, the narrow front face carries the winding key. x = drum centre, top = receiver bottom.
 */
function drumTall(c: G, x: number, top: number, shadeY?: number): void {
  const ry = 0.142, rx = 0.03, th = 0.03, cy = top + ry - 0.004, xb = x - th / 2, xf = x + th / 2;
  // rim band: back ellipse + the hull to the front face
  const rim = (q: G) => { q.moveTo(xb, cy - ry); q.lineTo(xf, cy - ry); q.ellipse(xf, cy, rx, ry, 0, -Math.PI / 2, Math.PI / 2); q.lineTo(xb, cy + ry); q.ellipse(xb, cy, rx, ry, 0, Math.PI / 2, Math.PI * 1.5); q.closePath(); };
  part(c, rim, { base: "#222427", box: [xb - rx, cy - ry, xf + rx, cy + ry], tex: steelTex(340, 1.1), hi: 0.35, lo: 0.6 });
  c.save(); c.beginPath(); rim(c); c.clip();
  for (const k of [0.3, 0.7]) strokeP(c, (q: G) => { q.ellipse(xb + th * k, cy, rx, ry, 0, Math.PI / 2, Math.PI * 1.5); }, "rgba(0,0,0,0.5)", 1.3 * P);
  c.restore();
  // front face
  const face = (q: G) => E(q, xf, cy, rx, ry);
  part(c, face, { base: "#34363a", lit: "top", box: [xf - rx, cy - ry, xf + rx, cy + ry], tex: steelTex(337, 1.2), hi: 0.5, lo: 0.5 });
  strokeP(c, (q: G) => E(q, xf, cy, rx * 0.72, ry * 0.86), "rgba(0,0,0,0.45)", 1.2 * P);
  for (const k of [-0.6, -0.3, 0.3, 0.6]) rivet(c, xf + rx * 0.45 * Math.sqrt(1 - k * k), cy + ry * 0.75 * k, 0.0035, "#55585c");
  part(c, (q: G) => R(q, xf - 0.004, cy - 0.022, 0.024, 0.044, 0.006), { base: "#2a2c30", box: [xf - 0.004, cy - 0.022, xf + 0.02, cy + 0.022], hi: 0.5, line: 1 }); // winding key housing
  part(c, (q: G) => R(q, xf + 0.014, cy - 0.01, 0.016, 0.02, 0.004), { base: "#5a5d62", box: [xf + 0.014, cy - 0.01, xf + 0.03, cy + 0.01], hi: 0.6, line: 0.9 }); // key
  if (shadeY !== undefined) {
    // contact shadow where the drum leaves the housing
    c.save(); c.beginPath(); rim(c); face(c); c.clip();
    const g = c.createLinearGradient(0, shadeY, 0, shadeY + 0.03);
    g.addColorStop(0, "rgba(0,0,0,0.6)"); g.addColorStop(1, "rgba(0,0,0,0)");
    c.fillStyle = g; c.fillRect(x - 0.1, shadeY - 0.01, 0.2, 0.045);
    c.restore();
  }
}

// ------------------------------ Hunting Rifle ------------------------------

/** H2 lever-action rifle: brass receiver, straight walnut stock, tube magazine, big lever loop, iron sights. */
export function drawHuntingRifleLever(c: G, size: number): void {
  P = 1 / size; c.save(); c.scale(size, size);
  const W = "#6a4122";
  part(c, (q: G) => R(q, -0.04, -0.04, 0.53, 0.018, 0.004), { base: "#24272b", box: [-0.04, -0.04, 0.49, -0.022], tex: steelTex(351, 0.5), hi: 0.5 });
  part(c, (q: G) => R(q, -0.04, -0.021, 0.45, 0.015, 0.006), { base: "#2a2d31", box: [-0.04, -0.021, 0.41, -0.006], tex: steelTex(352, 0.5), hi: 0.45 });
  part(c, (q: G) => R(q, 0.39, -0.044, 0.016, 0.042, 0.004), { base: "#2a2c30", box: [0.39, -0.044, 0.406, -0.002], hi: 0.45 }); // muzzle band
  part(c, (q: G) => Pg(q, [0.47, -0.04, 0.474, -0.054, 0.482, -0.054, 0.484, -0.04]), { base: "#2a2c30", box: [0.47, -0.054, 0.484, -0.04], hi: 0.4 });
  fillP(c, (q: G) => E(q, 0.478, -0.055, 0.0035, 0.003), "#d8c27a"); // brass bead
  part(c, (q: G) => Pg(q, [0.12, -0.04, 0.118, -0.05, 0.13, -0.054, 0.14, -0.05, 0.138, -0.04]), { base: "#2a2c30", box: [0.118, -0.054, 0.14, -0.04], hi: 0.4 }); // buckhorn
  const fe = (q: G) => { q.moveTo(0.02, -0.027); q.lineTo(0.29, -0.027); q.lineTo(0.29, 0.004); q.lineTo(0.02, 0.008); q.closePath(); };
  part(c, fe, { base: W, box: [0.02, -0.027, 0.29, 0.008], tex: woodTex(353, 0), hi: 0.32 });
  part(c, (q: G) => R(q, 0.284, -0.031, 0.018, 0.042, 0.004), { base: "#2a2c30", box: [0.284, -0.031, 0.302, 0.011], tex: steelTex(357, 0.5), hi: 0.45 }); // forend cap
  // stock (designer reference: a classic lever-action): the wrist drops from the receiver in a
  // curve, the comb runs back almost level, a tall butt; underneath, a curved pistol-grip wrist
  // the lever loop wraps around, then a long straight belly down to the toe
  const st = (q: G) => {
    q.moveTo(-0.17, -0.036); q.quadraticCurveTo(-0.215, -0.034, -0.26, -0.008); q.quadraticCurveTo(-0.28, 0.0, -0.3, 0.0);
    q.lineTo(-0.482, -0.008); q.quadraticCurveTo(-0.488, 0.06, -0.482, 0.128);
    q.lineTo(-0.27, 0.07); q.quadraticCurveTo(-0.23, 0.06, -0.215, 0.044); q.quadraticCurveTo(-0.19, 0.022, -0.17, 0.022); q.closePath();
  };
  part(c, st, { base: W, box: [-0.488, -0.036, -0.17, 0.128], tex: woodTex(354, -0.16), hi: 0.32 });
  c.save(); c.beginPath(); st(c); c.clip();
  strokeP(c, (q: G) => { q.moveTo(-0.172, -0.032); q.quadraticCurveTo(-0.215, -0.03, -0.258, -0.004); q.quadraticCurveTo(-0.28, 0.004, -0.3, 0.004); q.lineTo(-0.48, -0.004); }, "rgba(240,200,150,0.25)", 1.3 * P); // comb highlight
  fillP(c, (q: G) => { q.moveTo(-0.25, 0.064); q.quadraticCurveTo(-0.22, 0.05, -0.2, 0.03); q.lineTo(-0.19, 0.04); q.quadraticCurveTo(-0.22, 0.064, -0.25, 0.072); q.closePath(); }, "rgba(0,0,0,0.25)"); // grip shadow
  c.restore();
  part(c, (q: G) => Pg(q, [-0.482, -0.008, -0.5, -0.01, -0.504, 0.06, -0.5, 0.132, -0.482, 0.128, -0.488, 0.06]), { base: "#18191b", box: [-0.504, -0.01, -0.482, 0.132], tex: polyTex(355), hi: 0.2 }); // butt pad
  rivet(c, -0.4, 0.1, 0.0035, "#77797c"); // sling swivel
  // brass receiver
  const rc = (q: G) => { q.moveTo(-0.18, -0.044); q.lineTo(0.02, -0.044); q.lineTo(0.02, 0.016); q.quadraticCurveTo(-0.05, 0.03, -0.13, 0.028); q.lineTo(-0.18, 0.022); q.closePath(); };
  part(c, rc, { base: "#a07a32", box: [-0.18, -0.044, 0.02, 0.03], tex: steelTex(356, 0.5), hi: 0.6, lo: 0.5 });
  for (const [x, y] of [[-0.15, -0.01], [-0.02, -0.01], [-0.08, 0.012]] as const) rivet(c, x, y, 0.0045, "#6e5520");
  hole(c, (q: G) => R(q, -0.07, -0.036, 0.075, 0.012, 0.003)); // ejection port
  part(c, (q: G) => Pg(q, [-0.18, -0.03, -0.205, -0.052, -0.198, -0.058, -0.168, -0.042]), { base: "#2a2c30", box: [-0.205, -0.058, -0.168, -0.03], hi: 0.45 }); // hammer
  // lever loop + trigger
  const lv = (q: G) => { q.moveTo(-0.04, 0.024); q.quadraticCurveTo(-0.042, 0.058, -0.075, 0.06); q.lineTo(-0.15, 0.062); q.quadraticCurveTo(-0.2, 0.062, -0.205, 0.046); q.quadraticCurveTo(-0.2, 0.032, -0.178, 0.026); };
  rod(c, lv, 0.011, "#2c2e32");
  strokeP(c, (q: G) => { q.moveTo(-0.12, 0.026); q.quadraticCurveTo(-0.118, 0.04, -0.128, 0.05); }, "#050506", 0.0055 + 2 * P);
  strokeP(c, (q: G) => { q.moveTo(-0.12, 0.026); q.quadraticCurveTo(-0.118, 0.04, -0.128, 0.05); }, "#2e3035", 0.0055);
  c.restore();
}

/** H3 synthetic-stock rifle: olive polymer stock, stainless fluted barrel + muzzle brake, scope with sunshade, folded bipod. */
export function drawHuntingRifleSynthetic(c: G, size: number): void {
  P = 1 / size; c.save(); c.scale(size, size);
  const OD = "#545a42";
  part(c, (q: G) => R(q, -0.02, -0.035, 0.46, 0.019, 0.005), { base: "#8b9096", box: [-0.02, -0.035, 0.44, -0.016], tex: steelTex(361, 0.3), hi: 0.6 });
  for (let x = 0.24; x < 0.43; x += 0.04) strokeP(c, (q: G) => { q.moveTo(x, -0.0265); q.lineTo(x + 0.03, -0.0265); }, "rgba(0,0,0,0.55)", 1.6 * P, "round");
  part(c, (q: G) => R(q, 0.43, -0.041, 0.065, 0.03, 0.006), { base: "#1d1f22", box: [0.43, -0.041, 0.495, -0.011], tex: steelTex(362, 0.5), hi: 0.45 });
  for (const x of [0.445, 0.462, 0.479]) hole(c, (q: G) => R(q, x, -0.035, 0.009, 0.018, 0.002));
  // folded bipod under the forend
  rod(c, (q: G) => { q.moveTo(0.17, 0.02); q.lineTo(0.36, 0.024); }, 0.01, "#26282b");
  part(c, (q: G) => R(q, 0.155, 0.006, 0.03, 0.026, 0.005), { base: "#26282b", box: [0.155, 0.006, 0.185, 0.032], hi: 0.4 });
  part(c, (q: G) => R(q, 0.35, 0.016, 0.026, 0.016, 0.006), { base: "#141516", box: [0.35, 0.016, 0.376, 0.032], hi: 0.3 });
  // stock (designer reference: modern synthetic hunting stocks): straight comb, a steep pistol grip
  // with a palm swell, straight belly to a tall butt, thick black recoil pad, long flat-bottomed
  // forend; olive with a camo pattern and a stippled grip panel
  const st = (q: G) => {
    q.moveTo(-0.482, -0.026); q.lineTo(-0.24, -0.032); q.quadraticCurveTo(-0.21, -0.034, -0.195, -0.042); q.lineTo(0.215, -0.026);
    q.quadraticCurveTo(0.236, -0.024, 0.236, -0.006); q.quadraticCurveTo(0.234, 0.016, 0.205, 0.016); q.lineTo(-0.03, 0.02);
    q.lineTo(-0.09, 0.022); q.quadraticCurveTo(-0.12, 0.03, -0.138, 0.068); q.lineTo(-0.152, 0.098);
    q.quadraticCurveTo(-0.164, 0.12, -0.19, 0.112); q.quadraticCurveTo(-0.205, 0.08, -0.222, 0.062);
    q.quadraticCurveTo(-0.24, 0.048, -0.285, 0.054); q.lineTo(-0.482, 0.112); q.closePath();
  };
  part(c, st, { base: OD, box: [-0.482, -0.042, 0.236, 0.112], tex: polyTex(363), hi: 0.32 });
  c.save(); c.beginPath(); st(c); c.clip();
  const cr = mulberry(368);
  for (let i = 0; i < 26; i++) {
    const col = ["rgba(150,140,104,0.75)", "rgba(46,52,34,0.8)", "rgba(110,104,76,0.7)", "rgba(70,62,44,0.7)"][i % 4] ?? "rgba(70,62,44,0.7)";
    fillP(c, (q: G) => blobPath(q, -0.48 + cr() * 0.72, -0.04 + cr() * 0.15, 0.014 + cr() * 0.026, 0.008 + cr() * 0.014, 369 + i, 0.5, 22), col);
  }
  polyTex(370)(c, -0.48, -0.04, 0.24, 0.11);
  const sp = (q: G) => Pg(q, [-0.118, 0.036, -0.17, 0.04, -0.196, 0.098, -0.16, 0.104]);
  fillP(c, sp, "rgba(0,0,0,0.25)");
  c.save(); c.beginPath(); sp(c); c.clip(); polyTex(364, true)(c, -0.2, 0.034, -0.11, 0.106); c.restore();
  strokeP(c, (q: G) => { q.moveTo(-0.48, -0.022); q.lineTo(-0.24, -0.028); q.quadraticCurveTo(-0.21, -0.03, -0.195, -0.038); }, "rgba(230,230,200,0.22)", 1.3 * P);
  c.restore();
  part(c, (q: G) => Pg(q, [-0.482, -0.026, -0.512, -0.028, -0.516, 0.044, -0.512, 0.116, -0.482, 0.112, -0.488, 0.044]), { base: "#141516", box: [-0.516, -0.028, -0.482, 0.116], tex: polyTex(365, true), hi: 0.2 }); // recoil pad
  strokeP(c, (q: G) => { q.moveTo(-0.5, -0.02); q.lineTo(-0.504, 0.11); }, "rgba(0,0,0,0.6)", 1 * P);
  rivet(c, -0.4, 0.092, 0.0035, "#77797c"); // sling stud
  part(c, (q: G) => R(q, -0.2, -0.042, 0.19, 0.026, 0.006), { base: "#26282c", box: [-0.2, -0.042, -0.01, -0.016], tex: steelTex(366, 0.6), hi: 0.5 });
  rod(c, (q: G) => { q.moveTo(-0.165, -0.028); q.quadraticCurveTo(-0.172, -0.006, -0.182, 0.008); }, 0.008, "#3a3d42");
  part(c, (q: G) => R(q, -0.198, 0.0, 0.03, 0.024, 0.008), { base: "#1d1e21", box: [-0.198, 0, -0.168, 0.024], tex: polyTex(367, true), hi: 0.45, line: 1 });
  trigger(c, (q: G) => { q.moveTo(-0.092, 0.016); q.quadraticCurveTo(-0.094, 0.05, -0.064, 0.05); q.lineTo(-0.044, 0.048); q.quadraticCurveTo(-0.028, 0.042, -0.028, 0.016); }, (q: G) => { q.moveTo(-0.06, 0.016); q.quadraticCurveTo(-0.058, 0.03, -0.068, 0.038); });
  part(c, (q: G) => R(q, -0.018, 0.012, 0.056, 0.046, 0.004), { base: "#1d1e21", box: [-0.018, 0.012, 0.038, 0.058], tex: steelTex(369, 0.6), hi: 0.4 }); // box magazine
  for (const y of [0.026, 0.04]) strokeP(c, (q: G) => { q.moveTo(-0.012, y); q.lineTo(0.032, y); }, "rgba(0,0,0,0.5)", 1.1 * P, "butt");
  for (const x of [-0.15, 0.02]) part(c, (q: G) => R(q, x, -0.068, 0.026, 0.028, 0.003), { base: "#1b1c1f", box: [x, -0.068, x + 0.026, -0.04], hi: 0.4 });
  scope(c, -0.24, 0.13, -0.09, 0.036, "#17181b", { eye: 0.075, obj: 0.1, bell: 0.062, shade: 0.05 });
  c.restore();
}

// --------------------------------- Machete ---------------------------------

/** M2 panga: very wide blade with a swept-up tip and a deep belly, raw steel with a grind line, wooden grip. */
export function drawMachetePanga(c: G, size: number): void {
  P = 1 / size; c.save(); c.scale(size, size);
  const bl = (q: G) => { q.moveTo(-0.23, -0.03); q.lineTo(0.22, -0.036); q.quadraticCurveTo(0.38, -0.04, 0.495, -0.085); q.quadraticCurveTo(0.5, 0.03, 0.4, 0.085); q.quadraticCurveTo(0.1, 0.1, -0.23, 0.034); q.closePath(); };
  const edge = (q: G) => { q.moveTo(0.495, -0.085); q.quadraticCurveTo(0.5, 0.03, 0.4, 0.085); q.quadraticCurveTo(0.1, 0.1, -0.21, 0.036); };
  part(c, bl, { base: "#7c8188", box: [-0.23, -0.085, 0.5, 0.1], tex: steelTex(381, 1.1), hi: 0.5, lo: 0.45 });
  c.save(); c.beginPath(); bl(c); c.clip();
  fillP(c, (q: G) => { q.moveTo(-0.23, -0.03); q.lineTo(0.22, -0.036); q.quadraticCurveTo(0.38, -0.04, 0.495, -0.085); q.lineTo(0.495, -0.03); q.quadraticCurveTo(0.3, 0.02, -0.23, 0.0); q.closePath(); }, "rgba(20,24,30,0.28)"); // flat vs grind
  c.restore();
  bladeEdge(c, bl, edge, -0.012, 0.026, "#d4d7db");
  strokeP(c, (q: G) => { q.moveTo(-0.2, -0.026); q.lineTo(0.22, -0.032); q.quadraticCurveTo(0.37, -0.036, 0.48, -0.078); }, "rgba(225,232,240,0.4)", 1.2 * P);
  const hd = (q: G) => { q.moveTo(-0.215, -0.038); q.lineTo(-0.48, -0.03); q.quadraticCurveTo(-0.505, -0.02, -0.5, 0.02); q.quadraticCurveTo(-0.495, 0.05, -0.47, 0.052); q.lineTo(-0.215, 0.044); q.closePath(); };
  part(c, hd, { base: "#6a4426", box: [-0.505, -0.038, -0.215, 0.052], tex: woodTex(382, 0), hi: 0.32 });
  for (const x of [-0.26, -0.34, -0.42]) rivet(c, x, 0.005, 0.0075, "#b8a070");
  c.restore();
}

/** M3 rusty kukri-style machete: forward-bent blade with rust patches and the notch at the handle, ringed wooden grip, brass bolster. */
export function drawMacheteKukri(c: G, size: number): void {
  P = 1 / size; c.save(); c.scale(size, size);
  const bl = (q: G) => {
    q.moveTo(-0.2, -0.028); q.quadraticCurveTo(0.12, -0.085, 0.34, -0.05); q.quadraticCurveTo(0.46, -0.02, 0.49, 0.075);
    q.quadraticCurveTo(0.42, 0.095, 0.32, 0.068); q.quadraticCurveTo(0.12, 0.03, -0.12, 0.032);
    q.lineTo(-0.14, 0.018); q.lineTo(-0.156, 0.032); q.lineTo(-0.2, 0.03); q.closePath();
  };
  const edge = (q: G) => { q.moveTo(0.49, 0.075); q.quadraticCurveTo(0.42, 0.095, 0.32, 0.068); q.quadraticCurveTo(0.12, 0.03, -0.11, 0.032); };
  part(c, bl, { base: "#6e6a64", box: [-0.2, -0.085, 0.49, 0.095], tex: rustTex(391, 1), hi: 0.45, lo: 0.5 });
  c.save(); c.beginPath(); bl(c); c.clip();
  const r = mulberry(392);
  for (let i = 0; i < 9; i++) fillP(c, (q: G) => blobPath(q, -0.1 + r() * 0.55, -0.05 + r() * 0.1, 0.02 + r() * 0.04, 0.012 + r() * 0.02, 393 + i, 0.45, 24), `rgba(${120 + r() * 30 | 0},${55 + r() * 20 | 0},24,${0.45 + r() * 0.3})`);
  c.restore();
  bladeEdge(c, bl, edge, -0.009, 0.018, "#b9b6ae");
  const hd = (q: G) => { q.moveTo(-0.215, -0.034); q.lineTo(-0.47, -0.04); q.quadraticCurveTo(-0.51, -0.03, -0.505, 0.012); q.quadraticCurveTo(-0.5, 0.05, -0.47, 0.058); q.lineTo(-0.215, 0.042); q.closePath(); };
  part(c, hd, { base: "#4a2e1a", box: [-0.51, -0.04, -0.215, 0.058], tex: woodTex(394, 0), hi: 0.3 });
  c.save(); c.beginPath(); hd(c); c.clip();
  for (const x of [-0.29, -0.37]) { strokeP(c, (q: G) => { q.moveTo(x, -0.06); q.lineTo(x, 0.07); }, "rgba(10,5,2,0.7)", 3 * P, "butt"); strokeP(c, (q: G) => { q.moveTo(x + 2 * P, -0.06); q.lineTo(x + 2 * P, 0.07); }, "rgba(220,170,120,0.25)", 1 * P, "butt"); }
  c.restore();
  part(c, (q: G) => R(q, -0.235, -0.04, 0.036, 0.086, 0.008), { base: "#9a7a34", box: [-0.235, -0.04, -0.199, 0.046], tex: steelTex(395, 0.6), hi: 0.6 });
  part(c, (q: G) => R(q, -0.515, -0.026, 0.02, 0.066, 0.006), { base: "#9a7a34", box: [-0.515, -0.026, -0.495, 0.04], hi: 0.55, line: 1 });
  c.restore();
}


/** Weapons with their own art (shop icon + held view), by balance id (the rest keep the survivor's plain gun; Story 5.28: their shop icon is in `WEAPON_ICON_ART`). */
export const WEAPON_ART: Readonly<Record<string, (c: G, view: WeaponArtView, size: number) => void>> = {
  shotgun: drawShotgun,
  assault_rifle: drawAssaultRifle,
  fire_axe: drawFireAxe,
  chainsaw: drawChainsaw,
  grenade_launcher: drawGrenadeLauncher, // Story 5.5 (GL1)
  flamethrower: drawFlamethrower, // Story 5.4: FT1
  gas_torch: drawGasTorch, // Story 5.4: FT2
};
/**
 * Story 5.28: weapons with a side-view shop icon only (no held view: in the hands they keep the
 * survivor's plain gun, so they make no `survivor_<weapon>_a` frame). Base looks (designer
 * 2026-11-24): S1, H2 lever-action, M2 panga; their III / IV looks are in `WEAPON_TIER_ICON` /
 * `WEAPON_TOP_TIER_ICON`.
 */
export const WEAPON_ICON_ART: Readonly<Record<string, (c: G, size: number) => void>> = {
  smg: drawSmg,
  hunting_rifle: drawHuntingRifleLever,
  machete: drawMachetePanga,
};
/** Story 5.4: what a weapon puts on the survivor's back instead of the backpack (FT1's twin tanks). */
export const WEAPON_BACK_ART: Readonly<Record<string, (c: G, r: number) => void>> = {
  flamethrower: drawFlamethrowerBack,
};


/** Shop icon size (CSS px) and the side-view scale: a 1 m gun fills the width. */
export const ICON_W = 96;
export const ICON_H = 44;
const iconUrls = new Map<string, string>();
/** Where the side view's origin sits in the icon (share of the height; px right): the art is not centred on 0. */
const ICON_Y: Readonly<Record<string, number>> = { smg: 0.44, hunting_rifle: 0.52, machete: 0.5, assault_rifle: 0.36, fire_axe: 0.5, chainsaw: 0.62, flamethrower: 0.58, gas_torch: 0.62 };
/** Per-look origin height for looks that sit differently from their weapon's base (key = weapon, `weapon:tier`, `weapon:top`). */
const ICON_Y_LOOK: Readonly<Record<string, number>> = { "assault_rifle:tier": 0.4, "hunting_rifle:tier": 0.5, "hunting_rifle:top": 0.5, "smg:top": 0.4 };
const ICON_X_SHIFT: Readonly<Record<string, number>> = { chainsaw: -2, flamethrower: -2, gas_torch: 0 };

/**
 * The side-view icon of `weapon` (Story 5.1: at upgrade `level`) as a PNG data URL (drawn once on first use, then cached), or null
 * for a weapon without art. Browser only (a canvas).
 */
export function weaponIconUrl(weapon: string, level = 1): string | null {
  const held = WEAPON_ART[weapon];
  const iconOnly = WEAPON_ICON_ART[weapon];
  if ((!held && !iconOnly) || typeof document === "undefined") return null;
  const draw = iconOnly ?? ((c: G, size: number) => held?.(c, "icon", size));
  // Story 5.1: from level III the weapon's upgrade-tier look (G3, R1), when it has one.
  const top = level >= 4 ? WEAPON_TOP_TIER_ICON[weapon] : undefined;
  const tier = top ?? (level >= UPGRADE_LOOK_LEVEL ? WEAPON_TIER_ICON[weapon] : undefined);
  const key = top ? `${weapon}:top` : tier ? `${weapon}:tier` : weapon;
  const cached = iconUrls.get(key);
  if (cached) return cached;
  const cv = document.createElement("canvas");
  cv.width = ICON_W * DPR;
  cv.height = ICON_H * DPR;
  const g = cv.getContext("2d");
  if (!g) return null;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.translate(ICON_W / 2 + (ICON_X_SHIFT[weapon] ?? 0), ICON_H * (ICON_Y_LOOK[key] ?? ICON_Y[weapon] ?? 0.42));
  if (tier) tier(g, ICON_W * 0.92);
  else draw(g, ICON_W * 0.92);
  const url = cv.toDataURL("image/png");
  iconUrls.set(key, url);
  return url;
}
