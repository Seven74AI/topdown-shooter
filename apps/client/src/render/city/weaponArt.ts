/**
 * Story 5.3: the Shotgun and Assault Rifle art, drawn in game code (Canvas 2D; Epic 5 art method).
 * Story 5.2 adds the Fire Axe (AX1) and the Chainsaw (CS1, with its running-blade view), ported from
 * `docs/art/epic-5/round-b/looks.html`.
 * Each gun is ONE drawing function with two views, so the designer's final pick drops in by
 * replacing that function:
 *
 * - `"icon"`: the side-view shop icon, ported from `docs/art/epic-5/round-a/code-drawings.html`
 *   (G1 pump-action shotgun, R2 classic assault rifle; G3/R1 are the alternates there), units in
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
function fillP(c: G, fn: PathFn, style: string): void {
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
function rivet(c: G, x: number, y: number, r: number, base: string): void {
  c.beginPath();
  E(c, x, y, r, r);
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
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, `rgba(215,225,242,${hi})`);
  g.addColorStop(0.2, `rgba(215,225,242,${hi * 0.3})`);
  g.addColorStop(0.5, "rgba(0,0,0,0.04)");
  g.addColorStop(0.85, `rgba(0,0,0,${lo})`);
  g.addColorStop(1, `rgba(60,72,90,${lo * 0.35})`);
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
    c.strokeStyle = "rgba(4,4,6,0.95)";
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
function polyTex(seed: number): Tex {
  return (c, x0, y0, x1, y1) => {
    const r = mulberry(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    const n = Math.min(1600, ((w * h) / (P * P)) * 0.12);
    for (let i = 0; i < n; i++) {
      c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.025 + r() * 0.05})` : `rgba(0,0,0,${0.08 + r() * 0.12})`;
      c.fillRect(x0 + r() * w, y0 + r() * h, P * (0.8 + r()), P * (0.8 + r()));
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

/** Weapons with their own art, by balance id (the rest keep the survivor's plain gun and a text-only shop row). */
export const WEAPON_ART: Readonly<Record<string, (c: G, view: WeaponArtView, size: number) => void>> = {
  shotgun: drawShotgun,
  assault_rifle: drawAssaultRifle,
  fire_axe: drawFireAxe,
  chainsaw: drawChainsaw,
};

/** Shop icon size (CSS px) and the side-view scale: a 1 m gun fills the width. */
export const ICON_W = 96;
export const ICON_H = 44;
const iconUrls = new Map<string, string>();
/** Where the side view's origin sits in the icon (share of the height; px right): the art is not centred on 0. */
const ICON_Y: Readonly<Record<string, number>> = { assault_rifle: 0.36, fire_axe: 0.5, chainsaw: 0.62 };
const ICON_X_SHIFT: Readonly<Record<string, number>> = { chainsaw: -2 };

/**
 * The side-view icon of `weapon` as a PNG data URL (drawn once on first use, then cached), or null
 * for a weapon without art. Browser only (a canvas).
 */
export function weaponIconUrl(weapon: string): string | null {
  const draw = WEAPON_ART[weapon];
  if (!draw || typeof document === "undefined") return null;
  const cached = iconUrls.get(weapon);
  if (cached) return cached;
  const cv = document.createElement("canvas");
  cv.width = ICON_W * DPR;
  cv.height = ICON_H * DPR;
  const g = cv.getContext("2d");
  if (!g) return null;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  g.translate(ICON_W / 2 + (ICON_X_SHIFT[weapon] ?? 0), ICON_H * (ICON_Y[weapon] ?? 0.42));
  draw(g, "icon", ICON_W * 0.92);
  const url = cv.toDataURL("image/png");
  iconUrls.set(weapon, url);
  return url;
}
