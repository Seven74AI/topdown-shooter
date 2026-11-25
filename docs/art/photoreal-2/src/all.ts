/**
 * Take 3 for every character frame (designer 2026-11-25: "now we're on to something. Make the rest like that,
 * so I can compare everything"). Game code (Canvas 2D), the take 3 engine (`t3engine.ts`), each frame matching
 * the look the game draws today: the survivor with every held weapon (and the Chainsaw running), walkers ×4,
 * runners ×2, crawlers ×2, Spitters ×2 with their windup, Brutes BR1–BR5 with their windup, Bloaters BL1–BL5 at
 * the three swell stages. Built into ../all.html by build-all.mjs.
 */
import { drawBloater } from "../../../../apps/client/src/render/city/bloaterArt";
import { drawSurvivor, drawZombie } from "../../../../apps/client/src/render/city/spriteArt";
import { WEAPON_ART, WEAPON_BACK_ART, drawChainsawRunning } from "../../../../apps/client/src/render/city/weaponArt";
import { asphalt, canvas, ctx, night, rng, type G } from "../../asset-fixes-1/src/lib";
import { mix, type Rgb } from "../../photoreal-1/src/relief";
import { R, TAU, build, cap, ell, hand, head, type Look, type Prim } from "./t3engine";

const SS = 2; // supersampling for the bulk page (take3.html keeps 3)
const hx = (h: string): Rgb => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const lighten = (c: Rgb, k: number): Rgb => mix(c, [255, 255, 255], k);

// ─────────────────────────────── survivor ───────────────────────────────

const JACKET: Rgb = [56, 84, 120];
const CAPC: Rgb = [30, 34, 38];

/** The survivor's body with arms reaching to two hand points (lead hand `a`, rear hand `b`). */
function survivorBody(a: [number, number], b: [number, number], back: Prim[]): Prim[] {
  return [
    ...back,
    ell(-0.1, 0, 0.52, 0.96, 0.34, 0.3, "cloth", { fold: Math.PI / 2 }),
    cap(0.05, -0.68, (0.05 + a[0]) / 2 + 0.05, (-0.68 + a[1]) / 2, 0.17, 0.34, 0.16, "cloth"),
    cap(0.05, 0.68, (0.05 + b[0]) / 2 + 0.05, (0.68 + b[1]) / 2, 0.17, 0.34, 0.16, "cloth"),
    cap((0.05 + a[0]) / 2 + 0.05, (-0.68 + a[1]) / 2, a[0], a[1], 0.11, 0.36, 0.11, "skin"),
    cap((0.05 + b[0]) / 2 + 0.05, (0.68 + b[1]) / 2, b[0], b[1], 0.11, 0.36, 0.11, "skin"),
  ];
}

const PACK: Prim[] = [
  ell(-0.62, 0, 0.32, 0.6, 0.42, 0.3, "cloth", { col: [36, 36, 34], fold: Math.PI / 2 }),
  cap(-0.45, -0.55, 0.1, -0.6, 0.06, 0.62, 0.04, "strap"),
  cap(-0.45, 0.55, 0.1, 0.6, 0.06, 0.62, 0.04, "strap"),
];
/** FT1's twin fuel tanks replace the backpack (WEAPON_BACK_ART). */
const TANKS: Prim[] = [
  cap(-0.62, -0.32, -0.62, -0.02, 0.2, 0.4, 0.3, "metal", { col: [120, 40, 30] }),
  cap(-0.62, 0.32, -0.62, 0.02, 0.2, 0.4, 0.3, "metal", { col: [120, 40, 30] }),
  cap(-0.45, -0.55, 0.1, -0.6, 0.06, 0.62, 0.04, "strap"),
  cap(-0.45, 0.55, 0.1, 0.6, 0.06, 0.62, 0.04, "strap"),
];
/** FT2's small gas cylinder on the back. */
const CANISTER: Prim[] = [...PACK.slice(0, 1), cap(-0.6, -0.15, -0.6, 0.15, 0.13, 0.7, 0.18, "metal", { col: [170, 150, 40] }), ...PACK.slice(1)];

function headAndCap(): Prim[] {
  return [...head(0.08, 0, 0.43, "skin", 0.5, 0), ell(0.04, 0, 0.45, 0.43, 1.05, 0.22, "cloth", { col: CAPC }), ell(0.5, 0, 0.21, 0.35, 0.99, 0.06, "cloth", { col: CAPC })];
}

type WeaponDef = { hands: [[number, number], [number, number]]; prims: Prim[]; back?: Prim[]; extras?: (g: G) => void };

const WEAPONS: Record<string, WeaponDef> = {
  pistol: { hands: [[0.95, -0.06], [0.92, 0.1]], prims: [ell(1.15, 0.02, 0.24, 0.07, 0.46, 0.07, "metal"), ell(0.98, 0.02, 0.13, 0.15, 0.46, 0.1, "skin")] },
  shotgun: {
    hands: [[1.2, 0.06], [0.72, 0.16]],
    prims: [cap(0.3, 0.17, 0.78, 0.14, 0.1, 0.42, 0.08, "wood"), cap(0.6, 0.12, 2.2, 0.06, 0.055, 0.45, 0.05, "metal"), cap(1.1, 0.1, 1.55, 0.08, 0.08, 0.45, 0.07, "wood"), ell(1.22, 0.06, 0.12, 0.11, 0.5, 0.09, "skin"), ell(0.72, 0.16, 0.11, 0.11, 0.5, 0.09, "skin")],
  },
  assault_rifle: {
    hands: [[1.25, 0.04], [0.75, 0.15]],
    prims: [
      cap(0.25, 0.16, 0.7, 0.14, 0.09, 0.42, 0.08, "rubber"), // stock
      cap(0.6, 0.12, 1.9, 0.07, 0.07, 0.45, 0.06, "metal", { col: [24, 26, 28] }), // receiver and handguard
      cap(1.9, 0.07, 2.25, 0.06, 0.03, 0.45, 0.03, "metal"), // muzzle
      cap(0.95, 0.1, 1.1, 0.32, 0.06, 0.4, 0.05, "metal", { col: [30, 32, 34] }), // curved magazine
      ell(1.0, 0.09, 0.1, 0.05, 0.53, 0.04, "metal", { col: [40, 44, 48] }), // sight
      ell(1.27, 0.04, 0.12, 0.11, 0.5, 0.09, "skin"),
      ell(0.75, 0.15, 0.11, 0.11, 0.5, 0.09, "skin"),
    ],
  },
  fire_axe: {
    hands: [[1.0, 0.0], [0.55, 0.22]],
    prims: [
      cap(0.4, 0.25, 2.2, -0.05, 0.06, 0.44, 0.05, "wood"), // long haft
      cap(2.15, -0.35, 2.25, 0.2, 0.08, 0.46, 0.06, "metal", { col: [150, 30, 26] }), // red head
      cap(2.15, -0.35, 2.05, -0.5, 0.06, 0.46, 0.04, "metal", { col: [190, 192, 196] }), // the bright edge
      ell(1.0, 0.0, 0.12, 0.11, 0.5, 0.09, "skin"),
      ell(0.55, 0.22, 0.11, 0.11, 0.5, 0.09, "skin"),
    ],
  },
  chainsaw: {
    hands: [[0.95, -0.12], [0.75, 0.2]],
    prims: [
      ell(0.92, 0.04, 0.32, 0.22, 0.42, 0.18, "plastic", { col: [210, 110, 20] }), // orange body
      cap(1.15, 0.04, 2.45, 0.04, 0.09, 0.42, 0.05, "metal", { col: [150, 152, 156] }), // the bar
      cap(0.7, -0.16, 1.05, -0.16, 0.04, 0.6, 0.04, "rubber"), // front handle
      ell(0.95, -0.12, 0.12, 0.11, 0.62, 0.09, "skin"),
      ell(0.75, 0.2, 0.11, 0.11, 0.62, 0.09, "skin"),
    ],
  },
  grenade_launcher: {
    hands: [[1.15, 0.04], [0.7, 0.16]],
    prims: [
      cap(0.3, 0.16, 0.75, 0.14, 0.09, 0.42, 0.08, "wood"),
      cap(0.7, 0.1, 1.75, 0.08, 0.13, 0.45, 0.1, "metal", { col: [52, 58, 44] }), // the fat tube
      ell(1.75, 0.08, 0.05, 0.11, 0.5, 0.06, "metal", { col: [20, 20, 20] }), // its bore
      ell(1.15, 0.04, 0.12, 0.11, 0.55, 0.09, "skin"),
      ell(0.7, 0.16, 0.11, 0.11, 0.55, 0.09, "skin"),
    ],
  },
  flamethrower: {
    hands: [[1.1, 0.04], [0.65, 0.18]],
    back: TANKS,
    prims: [
      cap(0.55, 0.16, 1.85, 0.06, 0.06, 0.45, 0.05, "metal", { col: [60, 62, 66] }), // the wand
      cap(-0.45, 0.25, 0.55, 0.18, 0.04, 0.5, 0.03, "rubber"), // fuel hose from the tanks
      ell(1.88, 0.06, 0.06, 0.06, 0.46, 0.05, "metal", { col: [30, 30, 30] }),
      ell(1.1, 0.04, 0.12, 0.11, 0.5, 0.09, "skin"),
      ell(0.65, 0.18, 0.11, 0.11, 0.5, 0.09, "skin"),
    ],
    extras: (g) => {
      const x = 1.95 * R;
      const gr = g.createRadialGradient(x, 0.06 * R, 0, x, 0.06 * R, 0.14 * R);
      gr.addColorStop(0, "rgba(140,190,255,0.9)");
      gr.addColorStop(1, "rgba(80,120,255,0)");
      g.globalCompositeOperation = "lighter";
      g.fillStyle = gr;
      g.fillRect(x - 0.14 * R, -0.1 * R, 0.28 * R, 0.32 * R); // the pilot flame
    },
  },
  gas_torch: {
    hands: [[1.0, 0.02], [0.68, 0.16]],
    back: CANISTER,
    prims: [
      cap(0.8, 0.06, 1.45, 0.03, 0.05, 0.45, 0.04, "metal", { col: [170, 160, 110] }), // brass torch
      cap(-0.5, 0.2, 0.8, 0.08, 0.035, 0.5, 0.03, "rubber"), // gas hose
      ell(1.0, 0.02, 0.12, 0.11, 0.5, 0.09, "skin"),
      ell(0.68, 0.16, 0.11, 0.11, 0.5, 0.09, "skin"),
    ],
    extras: (g) => {
      const x = 1.52 * R;
      const gr = g.createRadialGradient(x, 0.03 * R, 0, x, 0.03 * R, 0.12 * R);
      gr.addColorStop(0, "rgba(160,200,255,0.95)");
      gr.addColorStop(1, "rgba(80,120,255,0)");
      g.globalCompositeOperation = "lighter";
      g.fillStyle = gr;
      g.fillRect(x - 0.12 * R, -0.1 * R, 0.24 * R, 0.26 * R);
    },
  },
};

function survivor(weapon: string, running = false): HTMLCanvasElement {
  const w = WEAPONS[weapon] ?? (WEAPONS.pistol as WeaponDef);
  const look: Look = { skin: [196, 152, 120], cloth: JACKET, hair: [50, 36, 24], blood: 0, seed: 321 };
  const prims: Prim[] = [...survivorBody(w.hands[0], w.hands[1], w.back ?? PACK), ...w.prims, ...headAndCap()];
  const extras = (g: G): void => {
    w.extras?.(g);
    if (running) {
      // the running chain: motion blur along the bar and sparks off the tip
      g.strokeStyle = "rgba(200,205,210,0.35)";
      g.lineWidth = 0.14 * R;
      g.beginPath();
      g.moveTo(1.2 * R, 0.04 * R);
      g.lineTo(2.45 * R, 0.04 * R);
      g.stroke();
      const r = rng(9);
      g.globalCompositeOperation = "lighter";
      for (let i = 0; i < 14; i++) {
        g.fillStyle = `rgba(255,${180 + Math.floor(r() * 60)},90,${0.5 + r() * 0.4})`;
        g.fillRect((2.4 + r() * 0.3) * R, (r() - 0.5) * 0.4 * R, 2, 2);
      }
    }
  };
  return build({ prims, extent: 2.7, look, ss: SS, extras });
}

// ─────────────────────────────── walkers, runners, crawlers ───────────────────────────────

const WALKER_SHIRTS = ["#454c5a", "#574636", "#3b4636", "#625849"].map(hx);
const RUNNER_SHIRTS = ["#6e2a24", "#5e2a2e"].map(hx);
const CRAWLER_SHIRTS = ["#2c3328", "#3a2e2a"].map(hx);
const ZSKIN: Rgb = [128, 140, 118];

function walker(v: number): HTMLCanvasElement {
  const look: Look = { skin: mix(ZSKIN, [140, 130, 120], v * 0.1), cloth: lighten(WALKER_SHIRTS[v] as Rgb, 0.18), hair: [44, 38, 30], blood: 0.7 + v * 0.08, seed: 401 + v * 13 };
  const reachL = 0.08 * (v % 2 ? 1 : -1);
  const prims: Prim[] = [
    ell(-0.2, 0, 0.52, 0.98, 0.32, 0.3, "cloth", { torn: 0.25, fold: Math.PI / 2 }),
    cap(0.0, -0.66, 0.5, -0.7, 0.19, 0.34, 0.18, "cloth", { torn: 0.35 }),
    cap(0.0, 0.66, 0.55, 0.62, 0.19, 0.34, 0.18, "cloth", { torn: 0.35 }),
    cap(0.48, -0.7, 1.12 + reachL, -0.6, 0.12, 0.32, 0.13, "zskin"),
    cap(0.53, 0.62, 1.18 - reachL, 0.68, 0.12, 0.32, 0.13, "zskin"),
    ...hand(1.2 + reachL, -0.6, 0.12, 0.2, "zskin", 0.22),
    ...hand(1.26 - reachL, 0.68, -0.08, 0.2, "zskin", 0.25),
    ell(-0.05 + v * 0.05, -0.55, 0.09, 0.12, 0.6, 0.02, "wound", { torn: 0.3 }),
    ...head(0.14, 0, 0.44, "zskin", [0.75, 0.4, 0.9, 0.55][v] as number, 0.3),
  ];
  return build({ prims, extent: 1.55, look, ss: SS });
}

function runner(v: number): HTMLCanvasElement {
  const look: Look = { skin: [150, 146, 128], cloth: lighten(RUNNER_SHIRTS[v] as Rgb, 0.1), hair: v ? [80, 60, 34] : [36, 30, 24], blood: 0.6, seed: 431 + v * 7 };
  const prims: Prim[] = [
    ell(-0.1, 0, 0.42, 0.8, 0.34, 0.28, "cloth", { rot: 0.12, torn: 0.2, fold: Math.PI / 2 }),
    cap(0, -0.55, 0.78, -0.78, 0.13, 0.32, 0.13, "zskin"),
    cap(0, 0.55, -0.78, 0.78, 0.13, 0.32, 0.13, "zskin"),
    ...hand(0.86, -0.8, -0.28, 0.17, "zskin", 0.2),
    ...hand(-0.86, 0.8, Math.PI - 0.3, 0.17, "zskin", 0.15),
    ...head(0.42, 0, 0.4, "zskin", 0.7, 0),
  ];
  return build({ prims, extent: 1.5, look, ss: SS });
}

function crawler(v: number): HTMLCanvasElement {
  const look: Look = { skin: [104, 114, 96], cloth: lighten(CRAWLER_SHIRTS[v] as Rgb, 0.15), hair: [30, 28, 26], blood: 1, seed: 451 + v * 7 };
  const prims: Prim[] = [
    ell(-1.25, 0, 0.3, 0.38, 0, 0.03, "wound", { torn: 0.3 }), // the blood it drags
    ell(-0.5, 0, 0.95, 0.55, 0.14, 0.24, "cloth", { torn: 0.3, fold: Math.PI / 2 }),
    cap(0.15, -0.45, 0.88, -1.02, 0.13, 0.18, 0.12, "zskin"),
    cap(0.15, 0.45, 0.93, 0.98, 0.13, 0.18, 0.12, "zskin"),
    ...hand(0.98, -1.1, -0.85, 0.18, "zskin", 0.3, 0.18),
    ...hand(1.02, 1.05, 0.8, 0.18, "zskin", 0.3, 0.18),
    ...head(0.55, 0, 0.42, "zskin", 0.45, 0, 0.6),
  ];
  return build({ prims, extent: 1.75, look, ss: SS });
}

// ─────────────────────────────── Spitter (P4 gaunt) ───────────────────────────────

const SPITTER_SKINS = ["#7f806c", "#7a7466"].map(hx);

function spitter(v: number, windup: boolean): HTMLCanvasElement {
  const look: Look = { skin: lighten(SPITTER_SKINS[v] as Rgb, 0.1), cloth: [52, 50, 48], hair: [36, 32, 26], blood: 0.2, seed: 501 + v * 9 };
  const r = rng(51 + v);
  const sacs: Prim[] = [];
  for (let i = 0; i < 18; i++) {
    const a = r() * TAU;
    const d = r() * 0.75;
    sacs.push(ell(-0.25 + Math.cos(a) * d * 0.55, Math.sin(a) * d * 0.95, 0.06 + r() * 0.08, 0.06 + r() * 0.08, 0.55, 0.08 + r() * 0.06, "acid"));
  }
  const hxh = windup ? 0.2 : 0.45; // rearing back
  const armX = windup ? 0.45 : 0.85;
  const prims: Prim[] = [
    ell(-1.5, 0.15, 0.12, 0.09, 0, 0.03, "acid"),
    ell(-1.85, -0.1, 0.1, 0.07, 0, 0.03, "acid"),
    cap(-0.4, -0.45, -0.95, -0.85, 0.12, 0.15, 0.12, "cloth", { torn: 0.25 }),
    cap(-0.4, 0.45, -0.95, 0.85, 0.12, 0.15, 0.12, "cloth", { torn: 0.25 }),
    ell(-1.02, -0.9, 0.14, 0.1, 0.12, 0.1, "zskin"),
    ell(-1.02, 0.9, 0.14, 0.1, 0.12, 0.1, "zskin"),
    ell(-0.25, 0, 0.55, 0.85, 0.3, 0.28, "zskin"),
    cap(0.1, -0.7, armX, -0.9, 0.09, 0.3, 0.1, "zskin"),
    cap(0.1, 0.7, armX, 0.9, 0.09, 0.3, 0.1, "zskin"),
    ...hand(armX + 0.08, -0.92, windup ? -0.6 : -0.15, 0.15, "zskin", 0.25, 0.3),
    ...hand(armX + 0.08, 0.92, windup ? 0.6 : 0.15, 0.15, "zskin", 0.25, 0.3),
    ...sacs,
    ...head(hxh, 0, 0.36, "zskin", 0.15),
    ell(hxh + 0.43, 0, windup ? 0.24 : 0.18, windup ? 0.26 : 0.2, 0.75, 0.08, "acid"),
    ell(hxh + 0.8, 0.05, 0.16, 0.1, 0.05, 0.04, "acid"),
  ];
  return build({
    prims,
    extent: 2.35,
    look,
    ss: SS,
    extras: (g) => {
      g.globalCompositeOperation = "lighter";
      for (const [x, y, rr, a] of [
        [hxh + 0.45, 0, windup ? 0.85 : 0.6, windup ? 0.38 : 0.22],
        [-0.25, 0, 0.9, 0.2],
      ] as const) {
        const gr = g.createRadialGradient(x * R, y * R, 0, x * R, y * R, rr * R);
        gr.addColorStop(0, `rgba(150,255,50,${a})`);
        gr.addColorStop(1, "rgba(150,255,50,0)");
        g.fillStyle = gr;
        g.fillRect((x - rr) * R, (y - rr) * R, 2 * rr * R, 2 * rr * R);
      }
    },
  });
}

// ─────────────────────────────── Brute BR1–BR5 ───────────────────────────────

/** The Brute's arms: walk (fists forward) or windup (arms raised wide, shoulders 8 % wider). */
function bruteArms(windup: boolean, sleeve: "full" | "elbow" | "none", sleeveCol: Rgb | undefined, skin: "zskin"): { prims: Prim[]; fists: [number, number][] } {
  const w = windup ? 1.08 : 1;
  const fists: [number, number][] = windup
    ? [
        [0.35, -1.35],
        [0.35, 1.35],
      ]
    : [
        [1.05, -0.7],
        [1.05, 0.7],
      ];
  const prims: Prim[] = [];
  for (const [i, s] of [-1, 1].entries()) {
    const sh: [number, number] = [0.0, s * 0.8 * w];
    const f = fists[i] as [number, number];
    const el: [number, number] = windup ? [0.15, s * 1.15] : [0.45, s * 0.76];
    const upper = sleeve === "none" ? skin : "cloth";
    const lower = sleeve === "full" ? "cloth" : skin;
    prims.push(cap(sh[0], sh[1], el[0], el[1], 0.23, 0.36, 0.22, upper, { col: sleeveCol }));
    prims.push(cap(el[0], el[1], f[0], f[1], 0.2, 0.37, 0.2, lower, { col: sleeveCol }));
  }
  return { prims, fists };
}

function brute(v: number, windup: boolean): HTMLCanvasElement {
  const w = windup ? 1.08 : 1;
  const seed = 601 + v * 11;
  const skinOf: Rgb[] = [hx("#77806f"), hx("#79826f"), hx("#86756f"), hx("#7b7f6b"), hx("#7a816e")];
  const look: Look = { skin: lighten(skinOf[v] as Rgb, 0.12), cloth: [32, 34, 38], hair: [24, 22, 20], blood: [0.35, 0.4, 0.6, 0.3, 0.45][v] as number, seed };
  let prims: Prim[] = [];
  const regions: Record<string, (g: G) => void> = {};
  let albedo: ((rx: number, ry: number, c: Rgb, r: Record<string, number>) => Rgb) | undefined;
  const plateText = (text: string, px: number) => (g: G): void => {
    g.save();
    g.translate(-0.3 * R, 0);
    g.rotate(Math.PI / 2);
    g.font = `700 ${Math.round(px * R)}px Oswald, Impact, sans-serif`;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(text, 0, 0);
    g.restore();
  };
  if (v === 0) {
    // BR1 riot cop
    const armour: Rgb = [26, 27, 31];
    const arms = bruteArms(windup, "full", [32, 34, 38], "zskin");
    prims = [
      ...arms.prims,
      ...arms.fists.map(([x, y]) => ell(x, y, 0.27, 0.24, 0.38, 0.26, "plastic", { col: [30, 30, 32] })),
      ell(-0.2, 0, 0.62 * w, 1.08 * w, 0.38, 0.34, "cloth"),
      ell(-0.3, 0, 0.5, 0.84 * w, 0.58, 0.22, "plastic", { col: [36, 38, 42] }),
      ...[-1, 1].flatMap((s) => [0, 1, 2].map((k) => ell(0.06 - k * 0.11, s * (0.93 + k * 0.03) * w, 0.3 - k * 0.05, 0.27 - k * 0.04, 0.5 + k * 0.07, 0.08, "plastic", { col: armour }))),
      ...head(0.22, 0, 0.37, "zskin", 0),
      ell(0.16, 0, 0.44, 0.42, 1.12, 0.26, "plastic", { col: [18, 19, 22] }),
      ell(0.55, 0, 0.1, 0.32, 1.1, 0.12, "metal", { col: [60, 74, 90] }),
    ];
    regions.letters = plateText("POLICE", 0.26);
    albedo = (rx, ry, c, r) => ((r.letters ?? 0) > 0.5 ? [170, 172, 176] : c);
  } else if (v === 1) {
    // BR2 construction worker: hard hat, torn hi-vis vest with reflective stripes, grey tee to the elbow, concrete dust
    const hiv = hx("#aab634");
    const arms = bruteArms(windup, "elbow", [96, 98, 100], "zskin");
    prims = [
      ...arms.prims,
      ...arms.fists.map(([x, y]) => ell(x, y, 0.26, 0.23, 0.38, 0.25, "zskin")),
      ell(-0.2, 0, 0.62 * w, 1.08 * w, 0.38, 0.34, "cloth", { col: [96, 98, 100] }),
      ell(-0.28, 0, 0.55, 0.95 * w, 0.5, 0.25, "cloth", { col: lighten(hiv, 0.05), torn: 0.25 }),
      ...head(0.22, 0, 0.38, "zskin", 0),
      ell(0.14, 0, 0.47, 0.45, 1.1, 0.24, "plastic", { col: [220, 180, 30] }), // yellow hard hat
      ell(0.42, 0, 0.18, 0.42, 1.06, 0.05, "plastic", { col: [220, 180, 30] }),
    ];
    regions.stripes = (g) => {
      for (const y of [-0.45, 0.45]) g.fillRect(-0.75 * R, y * R - 0.05 * R, 0.85 * R, 0.1 * R);
      g.fillRect(-0.55 * R, -0.9 * R, 0.1 * R, 1.8 * R);
    };
    albedo = (rx, ry, c, r) => {
      if ((r.stripes ?? 0) > 0.5) return [196, 198, 200];
      return mix(c, [190, 186, 176], Math.max(0, Math.sin(rx * 70) * Math.sin(ry * 70) - 0.7) * 0.6); // concrete dust
    };
  } else if (v === 2) {
    // BR3 bloated butcher: shirtless, pear-shaped, apron strings cutting in, a cleaver in his back
    const arms = bruteArms(windup, "none", undefined, "zskin");
    prims = [
      ...arms.prims,
      ...arms.fists.map(([x, y]) => ell(x, y, 0.26, 0.24, 0.38, 0.25, "zskin")),
      ell(-0.3, 0, 0.75 * w, 1.15 * w, 0.32, 0.42, "zskin"), // the pear-shaped bulk
      cap(-0.55, -0.95, -0.55, 0.95, 0.04, 0.72, 0.02, "strap", { col: [200, 196, 186] }), // apron strings
      cap(-0.1, -0.2, -0.45, -0.35, 0.05, 0.86, 0.05, "wood"), // the cleaver's handle
      cap(-0.45, -0.35, -0.6, -0.55, 0.08, 0.76, 0.03, "metal", { col: [170, 172, 176] }), // its blade, sunk in
      ell(-0.52, -0.45, 0.12, 0.08, 0.74, 0.02, "wound", { torn: 0.3 }),
      ...head(0.25, 0, 0.36, "zskin", 0.1),
    ];
  } else if (v === 3) {
    // BR4 bodybuilder: huge bare traps and shoulders, shredded black tank top, lifting belt, gold chain
    const arms = bruteArms(windup, "none", undefined, "zskin");
    prims = [
      ...arms.prims,
      ...arms.fists.map(([x, y]) => ell(x, y, 0.27, 0.24, 0.38, 0.26, "zskin")),
      ell(-0.15, 0, 0.6 * w, 1.15 * w, 0.4, 0.38, "zskin"),
      ell(0.0, -0.55, 0.3, 0.32, 0.62, 0.18, "zskin"), // traps
      ell(0.0, 0.55, 0.3, 0.32, 0.62, 0.18, "zskin"),
      ell(-0.35, 0, 0.42, 0.62, 0.62, 0.16, "cloth", { col: [22, 22, 24], torn: 0.35 }), // shredded tank top
      cap(-0.75, -0.6, -0.75, 0.6, 0.09, 0.66, 0.06, "strap", { col: [92, 60, 34] }), // lifting belt
      ...head(0.22, 0, 0.36, "zskin", 0.25),
    ];
    regions.chain = (g) => {
      g.lineWidth = 0.05 * R;
      g.beginPath();
      g.arc(0.22 * R, 0, 0.42 * R, Math.PI * 0.6, Math.PI * 1.4);
      g.stroke();
    };
    albedo = (rx, ry, c, r) => ((r.chain ?? 0) > 0.5 ? [218, 176, 70] : c);
  } else {
    // BR5 prisoner: orange jumpsuit with a stencilled number, shackles joined by a chain, a broken chain dragging
    const orange = hx("#c8642a");
    const arms = bruteArms(windup, "full", orange, "zskin");
    prims = [
      ...arms.prims,
      ...arms.fists.map(([x, y]) => ell(x, y, 0.26, 0.23, 0.38, 0.25, "zskin")),
      ...arms.fists.map(([x, y]) => ell(x - 0.2, y, 0.1, 0.24, 0.45, 0.1, "metal", { col: [90, 92, 96] })), // shackles
      ell(-0.2, 0, 0.62 * w, 1.08 * w, 0.38, 0.34, "cloth", { col: orange }),
      ...head(0.22, 0, 0.38, "zskin", 0.08),
    ];
    // the chain between the wrists, and a broken length dragging behind
    const links = (x0: number, y0: number, x1: number, y1: number, n: number): Prim[] =>
      Array.from({ length: n }, (_, i) => {
        const t = (i + 0.5) / n;
        return ell(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.07, 0.045, 0.3, 0.05, "metal", { col: [96, 98, 102], rot: Math.atan2(y1 - y0, x1 - x0) + (i % 2) * 1.2 });
      });
    const f = arms.fists;
    prims.push(...links((f[0] as [number, number])[0] - 0.2, (f[0] as [number, number])[1], (f[1] as [number, number])[0] - 0.2, (f[1] as [number, number])[1], windup ? 14 : 9));
    prims.push(...links(-0.75, 0.2, -1.4, 0.45, 6));
    regions.letters = plateText("8814", 0.3);
    albedo = (rx, ry, c, r) => ((r.letters ?? 0) > 0.5 ? [40, 30, 24] : c);
  }
  return build({ prims, extent: 1.5, look, ss: SS, regions, albedo });
}

// ─────────────────────────────── Bloater BL1–BL5 ───────────────────────────────

function bloater(v: number, s: number): HTMLCanvasElement {
  const k = 1 + 0.35 * s; // the swell
  const seed = 701 + v * 13;
  const skins = ["#86907e", "#86907e", "#7e8a76", "#968478", "#7a8668"].map(hx);
  const skin = mix(lighten(skins[v] as Rgb, 0.1), [170, 180, 90], s * 0.35); // sicklier as it swells
  const look: Look = { skin, cloth: [196, 194, 184], hair: [60, 54, 46], blood: 0.25, seed };
  const r = rng(seed);
  const body = ell(-0.08, 0, 1.02 * k, 1.15 * k, 0.2, 0.7, "zskin");
  const bx = body.rx;
  const by = body.ry;
  const blisters: Prim[] = [];
  for (let i = 0; i < (v === 4 ? 16 : 8); i++) {
    const a = r() * TAU;
    const d = 0.35 + r() * 0.5;
    blisters.push(ell(-0.08 + Math.cos(a) * d * bx, Math.sin(a) * d * by, 0.07 + r() * 0.07, 0.07 + r() * 0.07, 0.7, 0.07, v === 4 ? "acid" : "zskin"));
  }
  const sleeve: Rgb = [[188, 190, 180], hx("#a08a2c"), hx("#5b616c"), hx("#3c5d5e"), [0, 0, 0]][v] as Rgb;
  const arms: Prim[] = [
    cap(0.5, -0.88 * k, 1.05, -1.02 * k, 0.15, 0.3, 0.16, v === 4 ? "zskin" : "cloth", { col: lighten(sleeve, 0.08) }),
    cap(0.5, 0.88 * k, 1.05, 1.02 * k, 0.15, 0.3, 0.16, v === 4 ? "zskin" : "cloth", { col: lighten(sleeve, 0.08) }),
    ell(1.15, -1.04 * k, 0.2, 0.18, 0.3, 0.16, v === 1 ? "rubber" : "zskin", { col: [180, 160, 40] }),
    ell(1.15, 1.04 * k, 0.2, 0.18, 0.3, 0.16, v === 1 ? "rubber" : "zskin", { col: [180, 160, 40] }),
  ];
  const clothCol: Rgb[] = [[196, 194, 184], hx("#a8912f"), hx("#5b616c"), hx("#3c5d5e"), [0, 0, 0]];
  // clothes over the body: the office shirt splits open at the edges; suits and overalls cover it all
  const over = (col: Rgb, torn = 0.15): Prim => {
    const f = v === 0 ? 0.92 : 1.02;
    return ell(body.x - (v === 0 ? 0.04 : 0), 0, bx * f, by * f, 0.24, 0.68, "cloth", { col, torn: torn + s * 0.15 });
  };
  let prims: Prim[] = [...arms, body];
  const regions: Record<string, (g: G) => void> = {};
  let albedo: ((rx: number, ry: number, c: Rgb, rr: Record<string, number>) => Rgb) | undefined;
  if (v === 0) {
    prims.push(over(clothCol[0] as Rgb), ell(0.42 * k, 0.38 * k, 0.24, 0.18, 0.82, 0.1, "zskin"));
    prims.push(...blisters, cap(0.8 * k - 0.2, 0, 0.1, 0.05, 0.07, 0.96, 0.04, "cloth", { col: [150, 24, 28] }));
  } else if (v === 1) {
    // BL2 hazmat suit: yellow rubbery suit, taped seams, a respirator hood
    prims.push(over(lighten(clothCol[1] as Rgb, 0.08), 0.02));
    regions.tape = (g) => {
      g.lineWidth = 0.08 * R;
      g.beginPath();
      g.moveTo(-0.9 * R * k, 0);
      g.lineTo(0.55 * R, 0);
      g.stroke();
    };
    albedo = (rx, ry, c, rr) => ((rr.tape ?? 0) > 0.5 ? [120, 122, 118] : c);
  } else if (v === 2) {
    // BL3 sewer worker: dark overalls, sludge stains, rubber gloves
    prims.push(over(lighten(clothCol[2] as Rgb, 0.08)), cap(-0.3, -0.5 * k, 0.4, -0.5 * k, 0.06, 0.95, 0.03, "strap", { col: [50, 54, 60] }), cap(-0.3, 0.5 * k, 0.4, 0.5 * k, 0.06, 0.95, 0.03, "strap", { col: [50, 54, 60] }));
    arms.forEach((p, i) => {
      if (i >= 2) (p as { mat: string }).mat = "rubber";
    });
    albedo = (rx, ry, c) => mix(c, [70, 66, 36], Math.max(0, Math.sin(rx * 4 + ry * 3) * Math.cos(ry * 5) - 0.4) * 0.8); // sludge
  } else if (v === 3) {
    // BL4 obese tourist: a teal flowered shirt stretched open, a camera strap, sunburnt skin
    prims.push(over(lighten(clothCol[3] as Rgb, 0.1)), cap(-0.6, -0.7 * k, 0.6, 0.6 * k, 0.04, 0.96, 0.02, "strap", { col: [30, 28, 26] }));
    regions.flowers = (g) => {
      const fr = rng(9);
      for (let i = 0; i < 26; i++) {
        g.beginPath();
        g.arc((fr() - 0.6) * 1.8 * R * k, (fr() - 0.5) * 2 * R * k, 0.07 * R, 0, TAU);
        g.fill();
      }
    };
    albedo = (rx, ry, c, rr) => ((rr.flowers ?? 0) > 0.5 ? mix(c, [220, 200, 120], 0.6) : c);
  } else {
    // BL5 rotting gas sacs: no clothes, sacs bulging everywhere, cuts
    prims.push(...blisters, ell(0.1, -0.4 * k, 0.22, 0.16, 0.85, 0.06, "wound", { torn: 0.3 }));
  }
  prims = [...prims, ...head(0.8 * k, 0, 0.34, "zskin", v === 1 ? 0 : 0.4, 0, 1.0)];
  if (v === 1) prims.push(ell(0.8 * k, 0, 0.4, 0.38, 1.08, 0.22, "rubber", { col: lighten(clothCol[1] as Rgb, 0.05) }), ell(0.8 * k + 0.3, 0, 0.12, 0.2, 1.1, 0.1, "plastic", { col: [30, 30, 32] })); // hood + respirator
  const veins = s > 0;
  return build({
    prims,
    extent: 1.8,
    look,
    ss: SS,
    regions,
    albedo,
    extras: veins
      ? (g) => {
          // glowing veins as it swells toward the burst
          const vr = rng(seed + 5);
          g.globalCompositeOperation = "lighter";
          g.strokeStyle = `rgba(170,255,60,${0.25 + s * 0.45})`;
          g.lineWidth = 1.2 + s;
          for (let i = 0; i < 10; i++) {
            let x = (vr() - 0.5) * bx * R;
            let y = (vr() - 0.5) * by * R;
            let a = vr() * TAU;
            g.beginPath();
            g.moveTo(x, y);
            for (let j = 0; j < 6; j++) {
              a += (vr() - 0.5) * 1.2;
              x += Math.cos(a) * 0.12 * R;
              y += Math.sin(a) * 0.12 * R;
              g.lineTo(x, y);
            }
            g.stroke();
          }
        }
      : undefined,
  });
}

// ─────────────────────────────── page ───────────────────────────────

interface Row {
  group: string;
  name: string;
  extent: number;
  zoom: number;
  now: (g: G, r: number) => void;
  take3: () => HTMLCanvasElement;
}

const held = (w: string) => (c: G, r: number): void => WEAPON_ART[w]?.(c, "held", r);
const ROWS: Row[] = [
  { group: "Survivor", name: "Pistol (also SMG, hunting rifle, machete)", extent: 2.7, zoom: 1.5, now: (g, r) => drawSurvivor(g, r), take3: () => survivor("pistol") },
  ...["shotgun", "assault_rifle", "fire_axe", "chainsaw", "grenade_launcher", "flamethrower", "gas_torch"].map((w) => ({
    group: "Survivor",
    name: w.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()),
    extent: 2.7,
    zoom: 1.2,
    now: (g: G, r: number) => drawSurvivor(g, r, held(w), WEAPON_BACK_ART[w]),
    take3: () => survivor(w),
  })),
  { group: "Survivor", name: "Chainsaw running", extent: 2.7, zoom: 1.2, now: (g, r) => drawSurvivor(g, r, (c, rr) => drawChainsawRunning(c, "held", rr)), take3: () => survivor("chainsaw", true) },
  ...[0, 1, 2, 3].map((v) => ({ group: "Walkers", name: `Walker ${"ABCD"[v]}`, extent: 1.55, zoom: 0.9, now: (g: G, r: number) => drawZombie(g, "walker", r, v), take3: () => walker(v) })),
  ...[0, 1].map((v) => ({ group: "Runners and crawlers", name: `Runner ${"AB"[v]}`, extent: 1.5, zoom: 0.9, now: (g: G, r: number) => drawZombie(g, "runner", r, v), take3: () => runner(v) })),
  ...[0, 1].map((v) => ({ group: "Runners and crawlers", name: `Crawler ${"AB"[v]}`, extent: 1.75, zoom: 0.9, now: (g: G, r: number) => drawZombie(g, "crawler", r, v), take3: () => crawler(v) })),
  ...[0, 1].flatMap((v) => [false, true].map((wu) => ({ group: "Spitters", name: `Spitter ${"AB"[v]}${wu ? " (windup)" : ""}`, extent: 2.35, zoom: 0.95, now: (g: G, r: number) => drawZombie(g, "spitter", r, v, wu), take3: () => spitter(v, wu) }))),
  ...[0, 1, 2, 3, 4].flatMap((v) =>
    [false, true].map((wu) => ({
      group: "Brutes",
      name: `BR${v + 1} ${["riot cop", "construction worker", "butcher", "bodybuilder", "prisoner"][v]}${wu ? " (windup)" : ""}`,
      extent: 1.5,
      zoom: 0.9,
      now: (g: G, r: number) => drawZombie(g, "brute", r, v, wu),
      take3: () => brute(v, wu),
    })),
  ),
  ...[0, 1, 2, 3, 4].flatMap((v) =>
    [0, 1, 2, 3].map((st) => ({
      group: "Bloaters",
      name: `BL${v + 1} ${["office worker", "hazmat", "sewer worker", "tourist", "gas sacs"][v]}${st ? ` (swell ${st})` : ""}`,
      extent: 1.8,
      zoom: 0.9,
      now: (g: G, r: number) => drawBloater(g, r, v, st / 3),
      take3: () => bloater(v, st / 3),
    })),
  ),
];

function onStreet(obj: HTMLCanvasElement, size: number, zoom: number): HTMLCanvasElement {
  const c = canvas(size, size);
  const g = ctx(c);
  asphalt(g, size, size, 5);
  night(g, size, size, 0.3, [[size * 0.05, size * 0.05, size * 0.9]]);
  const s = (size * zoom) / obj.width;
  const off = (size - obj.width * s) / 2;
  g.save();
  g.globalAlpha = 0.6;
  g.filter = "blur(5px) brightness(0)";
  g.drawImage(obj, off + 8, off + 12, obj.width * s, obj.height * s);
  g.restore();
  g.drawImage(obj, off, off, obj.width * s, obj.height * s);
  return c;
}

function nowCanvas(extent: number, draw: (g: G, r: number) => void): HTMLCanvasElement {
  const N = Math.ceil(2 * extent * R);
  const c = canvas(N, N);
  const g = ctx(c);
  g.translate(N / 2, N / 2);
  draw(g, R);
  return c;
}

async function main(): Promise<void> {
  try {
    await document.fonts.load('700 20px "Oswald"');
  } catch {
    // fallback face
  }
  const host = document.getElementById("groups") as HTMLElement;
  const nav = document.getElementById("nav") as HTMLElement;
  const status = document.getElementById("loading") as HTMLElement;
  let grid: HTMLElement | null = null;
  let current = "";
  for (const [i, row] of ROWS.entries()) {
    if (row.group !== current) {
      current = row.group;
      const id = "g-" + current.toLowerCase().replace(/[^a-z]+/g, "-");
      const sec = document.createElement("section");
      sec.id = id;
      sec.innerHTML = `<h2>${current}</h2><div class="grid"></div>`;
      host.append(sec);
      grid = sec.querySelector(".grid");
      const a = document.createElement("a");
      a.href = "#" + id;
      a.textContent = current;
      nav.append(a);
    }
    const card = document.createElement("article");
    card.className = "pair";
    card.innerHTML = `<h3></h3><div class="sides"><figure><figcaption>Now</figcaption></figure><figure><figcaption>Take 3</figcaption></figure></div>`;
    (card.querySelector("h3") as HTMLElement).textContent = row.name;
    const figs = card.querySelectorAll("figure");
    (figs[0] as HTMLElement).prepend(onStreet(nowCanvas(row.extent, row.now), 220, row.zoom));
    (figs[1] as HTMLElement).prepend(onStreet(row.take3(), 220, row.zoom));
    grid?.append(card);
    status.textContent = `Drawing ${i + 1} of ${ROWS.length}…`;
    await new Promise((res) => setTimeout(res, 0));
  }
  status.remove();
}

void main();
