/**
 * FI-B: the burning car, rethought goal first (designer 2026-11-26: "Fire on cars should be rethink entirely. The fire
 * cant be a circle if the car is a rectangle. Circle may represent the heat. But flames in a perfect circle look weird"
 * and "picking a goal: show player a car is burning + zone where they get damaged").
 *
 * GOAL: (1) THIS CAR is burning; (2) INSIDE THIS CIRCLE you get hurt (decay.json fire: radius 2 m, 10 dmg/s in 0.5 s
 * pulses).
 *
 * ELEMENTS, each with one job toward the goal (read 1 = the car burns, read 2 = the zone):
 *  - the wreck (the approved Story 9.14 burnt car): the fuel. Read 1.
 *  - flames ON the car's fuel, in the car's own frame: the cabin (seats, plastics: the tallest, densest), the engine bay
 *    (second), the four tyres (small, long-lived), the fuel pool leaking under the rear (low, wide). They follow the
 *    rectangle, lean downwind, never form a circle. Read 1.
 *  - heat on the ground: the circle. A warm glow brightest at the car, held to a readable edge exactly at R, and a thin
 *    steady heat line on that edge. No flame draws the circle. Read 2.
 *  - the damage pulse: the heat line brightens a little on each 0.5 s damage tick (one clock with the game). Read 2.
 *  - light from the flames: a flickering pool on the car, its flicker drives the ground glow (one clock). Read 1.
 *  - black smoke: from the cabin and engine, drifting downwind, thin where it leaves the flames so the cores show;
 *    smoke may cross the edge (it doesn't burn). Read 1, from far away.
 *  - embers: from the cabin, downwind. Read 1 (alive).
 *  - the mark: soot burnt into the asphalt under the car, the pool's dark stain. What stays.
 *
 * COMPOSITION: flames only inside the car's shape and the pool; the circle only from heat; brightness order cabin >
 * engine > pool > tyres > ground glow > heat line; the bright flame never passes R (the game's edge rule: the car is
 * 4.5 m, the zone 4 m wide, so the bumpers stick out 0.25 m and their flames are kept inside); one flicker for flames,
 * car light and ground glow; the heat line moves only with the damage pulse.
 */
import { make, sprite, rng, type Look, type Stage } from "./kit";
import { takeA, type TakeA } from "./fire-kit";
import { fireFlicker } from "../../../../apps/client/src/render/city/fireParticles";
import carUrl from "./carburnt_a.png"; // cropped from the approved Story 9.14 atlas (streetProps.webp, 64 px/m)

export const FI_R = 2;
export const CAR_ANGLE = 0.35;
const WIND = ((): [number, number] => {
  const l = Math.hypot(0.55, 0.32); // fireParticles wind
  return [0.55 / l, 0.32 / l];
})();
const WIND_ANG = Math.atan2(WIND[1], WIND[0]);
const CAR_LEN = 4.5;
const CAR_W = 2.0;

let car: HTMLCanvasElement | null = null;
export async function approvedCar(): Promise<HTMLCanvasElement> {
  if (car) return car;
  const img = new Image();
  img.src = carUrl;
  await img.decode();
  car = make(img.width, img.height);
  car.getContext("2d")!.drawImage(img, 0, 0);
  return car;
}
/** The approved wreck at the zone centre (not counted as an FX sprite: it's the prop). */
export function drawCar(g: CanvasRenderingContext2D, st: Stage): void {
  if (!car) return;
  g.save();
  g.translate(st.cx, st.cy);
  g.rotate(CAR_ANGLE);
  g.drawImage(car, (-CAR_LEN / 2) * st.pxm, (-CAR_W / 2) * st.pxm, CAR_LEN * st.pxm, CAR_W * st.pxm);
  g.restore();
}

/** A fuel source in car metres (x forward, y to the car's right): a box, how many flame slots, flame size, life. */
interface Source {
  id: "cabin" | "engine" | "tyres" | "fuel";
  pts: (r: () => number) => [number, number];
  n: number;
  size: [number, number];
  life: [number, number];
  drift: number;
  /** Hottest colour step the flames start at (0 white-hot … 5 red-brown). */
  hot: number;
}
const TYRES: [number, number][] = [
  [1.35, -0.88],
  [1.35, 0.88],
  [-1.3, -0.88],
  [-1.3, 0.88],
];
const POOL = { x: -1.3, y: 1.15, rx: 0.6, ry: 0.42 }; // the leak from under the rear, spreading out on the downwind side
const SOURCES: readonly Source[] = [
  { id: "cabin", pts: (r) => [-0.8 + r() * 1.6, -0.6 + r() * 1.2], n: 18, size: [0.8, 1.2], life: [0.45, 0.8], drift: 0.9, hot: 1 },
  { id: "engine", pts: (r) => [1.0 + r() * 0.6, -0.55 + r() * 1.1], n: 14, size: [0.55, 0.85], life: [0.35, 0.65], drift: 0.8, hot: 1 },
  { id: "tyres", pts: (r) => TYRES[Math.floor(r() * 4)] as [number, number], n: 8, size: [0.3, 0.45], life: [0.5, 0.9], drift: 0.3, hot: 1 },
  {
    id: "fuel",
    pts: (r) => {
      const a = r() * Math.PI * 2;
      const d = Math.sqrt(r());
      return [POOL.x + Math.cos(a) * POOL.rx * d, POOL.y + Math.sin(a) * POOL.ry * d];
    },
    n: 14,
    size: [0.4, 0.7],
    life: [0.4, 0.7],
    drift: 0.35,
    hot: 1,
  },
];
const ca = Math.cos(CAR_ANGLE);
const sa = Math.sin(CAR_ANGLE);
/** Car metres → zone metres (rotated). */
const toZone = (x: number, y: number): [number, number] => [x * ca - y * sa, x * sa + y * ca];

interface Tex {
  A: TakeA;
  heat: HTMLCanvasElement;
  edge: HTMLCanvasElement;
  stain: HTMLCanvasElement;
  soot: HTMLCanvasElement;
}
let T: Tex | null = null;
function bakeTex(): Tex {
  if (T) return T;
  const A = takeA();
  // the heat on the ground: warm, brightest at the car, a readable edge exactly at R (the texture spans R + 4 %)
  const HP = 192;
  const heat = make(HP, HP);
  {
    const g = heat.getContext("2d")!;
    const img = g.createImageData(HP, HP);
    for (let y = 0; y < HP; y++)
      for (let x = 0; x < HP; x++) {
        const d = Math.hypot(x + 0.5 - HP / 2, y + 0.5 - HP / 2) / (HP / 2) / 0.96; // 1 = R
        if (d > 1.04) continue;
        const inner = 0.16 + 0.84 * Math.pow(Math.max(0, 1 - d), 1.8); // hot near the car, a floor of warmth to the edge
        const edge = d <= 1 ? 1 : Math.max(0, 1 - (d - 1) / 0.04); // the warmth ends AT R
        const a = inner * edge;
        const j = (y * HP + x) * 4;
        img.data[j] = 255;
        img.data[j + 1] = Math.round(120 + 70 * (1 - d));
        img.data[j + 2] = Math.round(40 + 30 * (1 - d));
        img.data[j + 3] = Math.round(255 * Math.min(1, a));
      }
    g.putImageData(img, 0, 0);
  }
  // the heat line on the edge: thin, soft both sides, with a slight unevenness (heat, not a drawn circle)
  const EP = 256;
  const edge = make(EP, EP);
  {
    const g = edge.getContext("2d")!;
    const img = g.createImageData(EP, EP);
    const R = (EP / 2) * 0.96;
    const r = rng(77);
    const wob = Array.from({ length: 12 }, () => r());
    for (let y = 0; y < EP; y++)
      for (let x = 0; x < EP; x++) {
        const dx = x + 0.5 - EP / 2;
        const dy = y + 0.5 - EP / 2;
        const d = Math.hypot(dx, dy);
        const ang = Math.atan2(dy, dx);
        let w = 0;
        for (let k = 0; k < 4; k++) w += Math.sin(ang * (k + 2) + (wob[k] as number) * 6.28) * 0.25;
        const band = Math.abs(d - R) / (EP * 0.012);
        if (band > 3) continue;
        const a = Math.exp(-band * band) * (0.75 + 0.25 * w) + Math.exp(-((d - R + EP * 0.02) ** 2) / (EP * 0.03) ** 2) * 0.25 * (d < R ? 1 : 0);
        const j = (y * EP + x) * 4;
        img.data[j] = 255;
        img.data[j + 1] = 138;
        img.data[j + 2] = 60;
        img.data[j + 3] = Math.round(255 * Math.min(1, a));
      }
    g.putImageData(img, 0, 0);
  }
  // the mark: soot burnt in under the car (car-shaped, soft) + the fuel stain
  const SW = 160;
  const SH = 96;
  const stain = make(SW, SH);
  {
    const g = stain.getContext("2d")!;
    const r = rng(19);
    for (let i = 0; i < 70; i++) {
      const x = SW * (0.08 + r() * 0.84);
      const y = SH * (0.15 + r() * 0.7);
      const rad = 10 + r() * 18;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(8,7,6,${0.1 + r() * 0.08})`);
      gr.addColorStop(1, "rgba(8,7,6,0)");
      g.fillStyle = gr;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  // the fuel pool: dark, glossy rim facing the light (upper left)
  const PP = 96;
  const soot = make(PP, PP);
  {
    const g = soot.getContext("2d")!;
    const gr = g.createRadialGradient(PP * 0.5, PP * 0.5, 0, PP * 0.5, PP * 0.5, PP * 0.48);
    gr.addColorStop(0, "rgba(24,18,12,0.6)");
    gr.addColorStop(0.8, "rgba(28,22,15,0.45)");
    gr.addColorStop(1, "rgba(20,16,12,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, PP, PP);
    g.strokeStyle = "rgba(150,140,125,0.22)";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(PP * 0.5, PP * 0.5, PP * 0.4, Math.PI * 1.05, Math.PI * 1.6);
    g.stroke();
  }
  T = { A, heat, edge, stain, soot };
  return T;
}

const hash = (n: number): number => {
  let x = (n | 0) ^ 0x9e3779b9;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
};
const on = (st: Stage, id: string): boolean => st.only === null || st.only === id;
/** The damage pulse (0.5 s): 1 at the tick, back to 0 in 0.25 s. */
export const pulseAt = (t: number): number => Math.max(0, 1 - ((t % 0.5) / 0.25)) ** 2;

export function fiCarLook(): Look {
  return {
    code: "FI-B",
    title: "Flames on the car, heat in the circle",
    note: "Rethought from the goal. The flames burn where the fuel is, on the car's own shape: the cabin tallest, then the engine bay, the four tyres, and a fuel pool leaking under the rear. They lean downwind and never form a circle. The circle is heat: a warm glow on the asphalt, strongest at the car, that ends exactly at the 2 m damage edge, with a thin heat line there that brightens on each 0.5 s damage tick. Black smoke from the cabin drifts downwind; soot stays burnt into the street.",
    async bake() {
      await approvedCar();
      bakeTex();
    },
    textures: () => {
      const t = bakeTex();
      return [
        { name: "flame steps ×6 ×4 (shared, take A)", canvas: t.A.flame[0]![0]!, note: "ADD" },
        { name: "soot ×3 ×3 (shared)", canvas: t.A.soot[0]![0]! },
        { name: "spark (shared)", canvas: t.A.spark, note: "ADD" },
        { name: "light pool (shared)", canvas: t.A.pool, note: "ADD" },
        { name: "heat (zone glow)", canvas: t.heat, note: "ADD, ends at R" },
        { name: "heat line", canvas: t.edge, note: "ADD" },
        { name: "soot mark", canvas: t.stain },
        { name: "fuel pool", canvas: t.soot },
      ];
    },
    parts: [
      { id: "heat", label: "Heat zone (glow)" },
      { id: "edge", label: "Heat line + damage pulse" },
      { id: "flames", label: "Flames on the car" },
      { id: "fuel", label: "Fuel pool + its flames" },
      { id: "light", label: "Light from the flames" },
      { id: "smoke", label: "Smoke" },
      { id: "embers", label: "Embers" },
      { id: "mark", label: "Soot mark" },
    ],
    frames: [
      { label: "a", t: 0, when: "a damage tick" },
      { label: "b", t: 0.12, when: "half-way to the next tick" },
      { label: "c", t: 0.25, when: "between ticks (line at rest)" },
      { label: "d", t: 1.5, when: "1.5 s later" },
    ],
    draw(g, t, st) {
      const X = bakeTex();
      const A = X.A;
      const pxm = st.pxm;
      const TT = t + 3; // already burning
      const fl = fireFlicker(TT, 0.7);
      const px = (zx: number): number => st.cx + zx * pxm;
      const py = (zy: number): number => st.cy + zy * pxm;
      // the mark, under the car
      if (on(st, "mark")) {
        const [mx, my] = toZone(-0.1, 0);
        sprite(g, X.stain, px(mx), py(my), CAR_LEN + 0.9, pxm, CAR_ANGLE, 0.9, false, CAR_W + 1.0);
      }
      if (on(st, "fuel")) {
        const [fx, fy] = toZone(POOL.x, POOL.y);
        sprite(g, X.soot, px(fx), py(fy), POOL.rx * 2.4, pxm, CAR_ANGLE, 0.95, false, POOL.ry * 2.4);
      }
      // the car itself (drawn again here so the soot sits under it)
      if (st.only === null) drawCar(g, st);
      // the burnt-out cabin and engine bay: soot darkens the car where it burns, so the added flames read amber on
      // black (on the car's cool grey they turned greenish)
      if (on(st, "mark")) {
        const [ax, ay] = toZone(0.3, 0);
        sprite(g, X.stain, px(ax), py(ay), 3.3, pxm, CAR_ANGLE, 0.95, false, 1.5);
      }
      // the heat: the circle, glow + line, one clock with the flames and the damage pulse
      if (on(st, "heat")) sprite(g, X.heat, st.cx, st.cy, (2 * FI_R) / 0.96, pxm, 0, 0.3 + 0.08 * fl, true);
      if (on(st, "edge")) sprite(g, X.edge, st.cx, st.cy, (2 * FI_R) / 0.96, pxm, 0, 0.5 + 0.35 * pulseAt(t), true);
      if (on(st, "light")) {
        const [lx, ly] = toZone(0.2, 0);
        sprite(g, A.pool, px(lx), py(ly), 3.2, pxm, 0, 0.22 * fl, true);
      }
      // flames: stateless slots per source (age from the time and the slot's phase; spot and shape per cycle)
      const flameRot = WIND_ANG + Math.PI / 2; // the masks' tip points up (-y): turn it downwind
      for (let si = 0; si < SOURCES.length; si++) {
        const s = SOURCES[si] as Source;
        if (!on(st, s.id === "fuel" ? "fuel" : "flames")) continue;
        const n = st.low ? Math.ceil(s.n / 2) : s.n;
        for (let k = 0; k < n; k++) {
          const life = s.life[0] + hash(si * 977 + k * 13) * (s.life[1] - s.life[0]);
          const ph = hash(si * 31 + k * 7 + 3) * life;
          const cyc = Math.floor((TT + ph) / life);
          const age = (TT + ph - cyc * life) / life; // 0–1
          const r = rng(si * 100003 + k * 7919 + cyc * 31 + st.seed * 3);
          const [cx0, cy0] = s.pts(r);
          let [zx, zy] = toZone(cx0, cy0);
          const dd = s.drift * age * life;
          zx += WIND[0] * dd;
          zy += WIND[1] * dd;
          let size = (s.size[0] + r() * (s.size[1] - s.size[0])) * Math.sin(Math.PI * Math.min(1, age * 1.15)) ** 0.7;
          // the edge rule: the bright flame never passes R
          const reach = Math.hypot(zx, zy) + size * 0.45;
          if (reach > FI_R - 0.05) size *= Math.max(0, (FI_R - 0.05 - Math.hypot(zx, zy)) / (size * 0.45));
          if (size < 0.04) continue;
          const step = Math.min(5, s.hot + Math.floor(age * 4.5));
          const tex = (A.flame[step] as HTMLCanvasElement[])[(k + cyc) % 4] as HTMLCanvasElement;
          sprite(g, tex, px(zx), py(zy), size * 0.75, pxm, flameRot + (r() - 0.5) * 0.5, (si === 0 ? 0.66 : 0.78) * (1 - age * 0.35), true, size * 1.25); // added flames saturate to lemon yellow where many overlap: the cabin's are fewer and fainter
        }
      }
      // embers from the cabin, downwind
      if (on(st, "embers")) {
        const n = st.low ? 6 : 12;
        for (let k = 0; k < n; k++) {
          const life = 1.0 + hash(k * 5 + 1) * 0.6;
          const ph = hash(k * 11 + 2) * life;
          const cyc = Math.floor((TT + ph) / life);
          const a = (TT + ph - cyc * life) / life;
          const r = rng(k * 613 + cyc * 17);
          let [zx, zy] = toZone(-0.6 + r() * 1.2, -0.5 + r() * 1.0);
          const d = a * life * (1.1 + r() * 0.8);
          zx += WIND[0] * d + Math.sin(a * 9 + k) * 0.12;
          zy += WIND[1] * d + Math.cos(a * 7 + k) * 0.12;
          sprite(g, A.spark, px(zx), py(zy), 0.07, pxm, 0, (1 - a) * 0.9, true);
        }
      }
      // smoke last (it rises above the flames), thin where it leaves them
      if (on(st, "smoke")) {
        const n = st.low ? 7 : 14;
        for (let k = 0; k < n; k++) {
          const life = 3.2 + hash(k * 3 + 9) * 1.0;
          const ph = hash(k * 19 + 4) * life;
          const cyc = Math.floor((TT + ph) / life);
          const a = (TT + ph - cyc * life) / life;
          const r = rng(k * 211 + cyc * 7 + 5);
          const src = r() < 0.7 ? [-0.6 + r() * 1.2, -0.45 + r() * 0.9] : [1.0 + r() * 0.5, -0.4 + r() * 0.8];
          let [zx, zy] = toZone(src[0] as number, src[1] as number);
          const d = 0.75 + a * life * 0.85; // born downwind of the flames: the smoke never sits on the fire's core
          zx += WIND[0] * d;
          zy += WIND[1] * d;
          const size = 0.9 + a * 2.4;
          const alpha = Math.min(1, a / 0.2) * 0.9 * (1 - a * 0.85);
          const tone = Math.min(2, Math.floor(a * 3));
          sprite(g, (A.soot[tone] as HTMLCanvasElement[])[k % 3] as HTMLCanvasElement, px(zx), py(zy), size, pxm, k + a, alpha);
        }
      }
    },
  };
}
