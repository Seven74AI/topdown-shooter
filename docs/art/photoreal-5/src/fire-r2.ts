/**
 * Fire family, round 2 revised takes (designer picks 2026-11-28, `docs/art/photoreal-decisions.md` › FX):
 *  - GR-R: "GR shadows are strange, they more look like mirrored images. Plz make a new version."
 *  - MO-R: "I like MOG, the fire and the cone, but our molotov is actually not a cone but a circle. Maybe we could
 *    rethink the Molotov shape to a more conic form … make the fire grow for a bit, like 2m cone … when it land and it
 *    grow to 3m or 4m after impact before it start to fade".
 * (FI-R lives with FI-B in `fire-car.ts`.)
 *
 * Each look's `goalFirst` was written before it was drawn (dead-city-model fx.md › FX 4). Both compose baked sprites
 * statelessly from the time and the seed; nothing is created in `draw()`.
 */
import { make, sprite, rng, easeOut, type Look, type Stage, type ActionPlan } from "./kit";
import { G, gameAtlases, relitFrame } from "./fire-kit";
import { gk, on, hash, pulse05, WIND, WIND_ANG } from "./fire-gkit";
import { fireFlicker } from "../../../../apps/client/src/render/city/fireParticles";
import { fbm } from "../../../../apps/client/src/render/city/groundDamageArt";
import { ROUND_H_M, ROUND_W_M } from "../../../../apps/client/src/render/city/blastFxAtlas";
import { GRENADE_FRAME_M, MOLOTOV_FRAME_M, MOLOTOV_RAG_X_M } from "../../../../apps/client/src/render/city/throwArt";
import { MOLOTOV_FADE_S } from "../../../../apps/client/src/render/molotovFx";

const X = (st: Stage, x: number): number => st.cx + x * st.pxm;
const Y = (st: Stage, y: number): number => st.cy + y * st.pxm;

/** Pixel painter for baked textures (bake only). */
function pixels(w: number, h: number, f: (x: number, y: number, out: number[]) => boolean): HTMLCanvasElement {
  const c = make(w, h);
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const o = [0, 0, 0, 0];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (!f(x, y, o)) continue;
      const j = (y * w + x) * 4;
      img.data[j] = o[0] as number;
      img.data[j + 1] = o[1] as number;
      img.data[j + 2] = o[2] as number;
      img.data[j + 3] = Math.round(255 * Math.min(1, Math.max(0, o[3] as number)));
    }
  g.putImageData(img, 0, 0);
  return c;
}

/* ================================ GR-R: rounds in flight, a real shadow ================================ */
const LAUNCH = { x0: -4, y0: -1.3, x1: 3.5, speed: 20 }; // weapons.json grenade_launcher.lobSpeedMps (as GR-G)
const HAND = { x0: -4, y0: 1.3, x1: 3.5, speed: 12 }; // consumables.json grenades.throwSpeedMps
const ARC_M = 1.5; // combat.json explosion.fx.lobArcM
/** The game's shadow offset per metre of height (GrenadeView: down-right, light from the upper left). */
const SH_OFF = [0.35, 0.45] as const;
interface Pose {
  x: number;
  y: number;
  z: number;
  u: number;
  live: boolean;
}
function flightAt(f: { x0: number; y0: number; x1: number; speed: number }, t: number, out: Pose): Pose {
  const dur = Math.max(0.25, (f.x1 - f.x0) / f.speed);
  const u = t / dur;
  out.live = u >= 0 && u < 1;
  const uu = Math.max(0, Math.min(1, u));
  out.u = uu;
  out.x = f.x0 + (f.x1 - f.x0) * uu;
  out.y = f.y0;
  out.z = 4 * ARC_M * uu * (1 - uu);
  return out;
}
/**
 * A shadow blob: a flat ellipse of the item's footprint (aspect h / w), dark cool grey, with an umbra and a penumbra
 * of `soft` (0 crisp … 1 all penumbra). No picture of the item in it: a shadow has no details.
 */
function blob(wPx: number, aspect: number, soft: number): HTMLCanvasElement {
  const pad = Math.ceil(wPx * (0.15 + 0.6 * soft));
  const W = wPx + pad * 2;
  const H = Math.ceil(wPx * aspect) + pad * 2;
  const rx = wPx / 2;
  const ry = (wPx * aspect) / 2;
  const pen = 0.12 + 1.1 * soft; // penumbra width, in units of the ellipse's radius
  return pixels(W, H, (x, y, o) => {
    const dx = (x + 0.5 - W / 2) / rx;
    const dy = (y + 0.5 - H / 2) / ry;
    const d = Math.hypot(dx, dy); // 1 = the item's outline
    const u = (d - (1 - pen * 0.5)) / pen; // 0 inside the umbra … 1 out of the penumbra
    if (u >= 1) return false;
    const k = u <= 0 ? 1 : 1 - u * u * (3 - 2 * u);
    o[0] = 6;
    o[1] = 8;
    o[2] = 12;
    o[3] = k * (1 - 0.35 * soft); // the soft blob is also paler at its core (the light wraps round)
    return o[3] > 0.004;
  });
}
const GR_R_PLAN: ActionPlan = {
  goal: "Something is flying to THAT spot and bursts there in a moment; its shadow on the ground says where and how soon.",
  timing: "Launcher 20 m/s (min 0.25 s): 7.5 m in 0.375 s. Hand grenade 12 m/s (min 0.3 s): 0.625 s. Arc 1.5 m (combat.json lobArcM). Shadow offset (0.35, 0.45) m per metre of height (GrenadeView). GR-R: the shadow's penumbra and paleness follow the height continuously (two blobs cross-faded), its size grows 25 % per metre.",
  lengthS: 0.8,
  lanes: {
    core: [
      { t0: 0, t1: 0.375, label: "round: rises, falls (3×), relit (A)" },
      { t0: 0.375, t1: 0.625, label: "grenade lands (tumbling), relit (A)" },
    ],
    matter: [
      { t0: 0, t1: 0.19, label: "shadow: crisp, dark → soft, pale", nw: true },
      { t0: 0.19, t1: 0.375, label: "→ crisp, dark: meets the round", key: true, nw: true },
      { t0: 0.375, t1: 0.625, label: "grenade's shadow meets it", key: true, nw: true },
    ],
    smoke: [{ t0: 0, t1: 0.55, label: "launcher trail (who shot, from where)" }],
    game: [
      { t0: 0.37, t1: 0.4, label: "round bursts", key: true },
      { t0: 0.62, t1: 0.65, label: "grenade bursts", key: true },
    ],
  },
};
export function grR(): Look {
  let round: HTMLCanvasElement, hand: HTMLCanvasElement;
  let rCrisp: HTMLCanvasElement, rSoft: HTMLCanvasElement, hCrisp: HTMLCanvasElement, hSoft: HTMLCanvasElement;
  const p: Pose = { x: 0, y: 0, z: 0, u: 0, live: false };
  const q: Pose = { x: 0, y: 0, z: 0, u: 0, live: false };
  /** The item's footprint on the ground in metres at ground scale: measured from its relit picture's outline at bake. */
  const R_FOOT = { w: 0, h: 0, ox: 0, oy: 0, rot: 0 };
  const H_FOOT = { w: 0, h: 0, ox: 0, oy: 0, rot: 0 };
  /** One shadow: two blobs cross-faded by height (no pop between steps), offset down-right by the height. */
  function shadow(g: CanvasRenderingContext2D, st: Stage, crisp: HTMLCanvasElement, soft: HTMLCanvasElement, foot: { w: number; h: number; ox: number; oy: number; rot: number }, ps: Pose, rot: number): void {
    const hk = Math.min(1, ps.z / ARC_M); // 0 on the ground … 1 at the top of the arc
    const grow = 1 + 0.25 * ps.z; // the penumbra widens with height
    const dark = 0.8 - 0.42 * hk; // crisp and dark low, pale high
    const sc = 1 + ps.z * 0.3; // the item's own scale with height: the outline's offset from the sprite's centre grows with it
    const ca = Math.cos(rot);
    const sn = Math.sin(rot);
    const sx = X(st, ps.x + ps.z * SH_OFF[0] + (foot.ox * ca - foot.oy * sn) * sc);
    const sy = Y(st, ps.y + ps.z * SH_OFF[1] + (foot.ox * sn + foot.oy * ca) * sc);
    // each blob's texture is wider than the footprint by its penumbra pad: crispK / softK scale it to the footprint
    sprite(g, crisp, sx, sy, foot.w * grow * crispK, st.pxm, rot + foot.rot, dark * (1 - hk));
    sprite(g, soft, sx, sy, foot.w * grow * softK, st.pxm, rot + foot.rot, dark * hk * 1.3);
  }
  let crispK = 1;
  let softK = 1;
  return {
    code: "GR-R",
    title: "A shadow, not a copy",
    note: "Revised from GR-G because the designer found its shadows \"strange, they more look like mirrored images\": GR-G's shadow was the item's own picture, blurred and darkened, so the round's and the grenade's outlines and details showed in it. GR-R's shadow is what a shadow really is from one light high in the upper left: a flat, soft, dark blob of the item's footprint on the asphalt, with no detail in it, pushed down-right by the item's height (the game's 0.35 / 0.45 m per metre). GR-G's timing idea stays: low it is small, crisp and dark; high it widens, softens and pales, and it sharpens again as the item comes down, so it counts down to the burst and meets the item where the blast will be. The relit round and grenade (GR-A) and the launcher's trail are unchanged.",
    goalFirst: {
      goal: "Something is flying to <b>that spot</b> and bursts there in a moment (launcher round 20 m/s, ≤ 0.6 s; hand grenade 12 m/s, ≤ 0.7 s), with a 2.5 m blast.",
      elements: [
        { name: "Shadow (a blob on the ground)", job: "where it lands and how soon: a flat dark ellipse of the item's footprint (sized and turned from the relit picture's own body, so the grenade's pin ring adds nothing), no picture in it; it runs on the ground track, pushed down-right by the height, and meets the item at the burst point." },
        { name: "Shadow sharpness", job: "how high, so how soon: on the ground crisp and dark (alpha 0.80, a penumbra of 12 % of its size); at the top of the arc (1.5 m) 38 % wider, soft (the penumbra is the whole blob) and pale (≈ 0.4 peak). Continuous, two blobs cross-faded: no step." },
        { name: "Item (relit, GR-A)", job: "what is coming: round or grenade, rising and falling (scale +30 % per metre), the grenade tumbling." },
        { name: "Launcher trail", job: "who shot it and from where: a thin grey propellant trail, gone in 0.2 s. Not on the hand grenade." },
        { name: "Cut: the item's picture in the shadow", job: "a shadow has no details, and a copy of the sprite read as a reflection (the designer's \"mirrored images\")." },
      ],
      composition: [
        "The shadow lies flat on the ground, under everything, down-right of the item (key light upper left), and never leaves the ground track.",
        "Brightness: the item's glint > the item > the trail > the shadow. No additive sprite.",
        "One clock: the flight. Height, scale, shadow offset, shadow size, penumbra, paleness and the tumble all come from the flight's progress.",
        "The shadow is cool, near-black (6, 8, 12), never coloured: it darkens the asphalt, it doesn't paint on it.",
      ],
      plan: GR_R_PLAN,
    },
    async bake() {
      gameAtlases();
      gk();
      if (!round) {
        round = relitFrame(G.round(), 40, 11, 40 * 0.9);
        hand = relitFrame(G.hand()[1] as HTMLCanvasElement, 64, 12, 64 * 0.9);
        // the footprint = the ellipse with the same area moments as the picture's opacity (its body; thin bits like the
        // grenade's pin ring weigh little), at the size the item is drawn on the ground
        const measure = (c: HTMLCanvasElement, drawnW: number, out: { w: number; h: number; ox: number; oy: number; rot: number }): void => {
          const d = c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data;
          let m0 = 0, mx = 0, my = 0, mxx = 0, myy = 0, mxy = 0;
          for (let y = 0; y < c.height; y++)
            for (let x = 0; x < c.width; x++) {
              const a = (d[(y * c.width + x) * 4 + 3] as number) / 255;
              if (a < 0.05) continue;
              m0 += a;
              mx += a * x;
              my += a * y;
              mxx += a * x * x;
              myy += a * y * y;
              mxy += a * x * y;
            }
          const cx = mx / m0, cy = my / m0;
          const sxx = mxx / m0 - cx * cx, syy = myy / m0 - cy * cy, sxy = mxy / m0 - cx * cy;
          const tr = (sxx + syy) / 2;
          const det = Math.sqrt(Math.max(0, ((sxx - syy) / 2) ** 2 + sxy * sxy));
          const m = drawnW / c.width;
          out.w = 4 * Math.sqrt(tr + det) * m; // a filled ellipse's full axis = 4 σ
          out.h = 4 * Math.sqrt(Math.max(1e-6, tr - det)) * m;
          out.rot = 0.5 * Math.atan2(2 * sxy, sxx - syy);
          out.ox = (cx + 0.5 - c.width / 2) * m;
          out.oy = (cy + 0.5 - c.height / 2) * m;
        };
        measure(round, ROUND_W_M * 3 * 1.1, R_FOOT);
        measure(hand, GRENADE_FRAME_M.w * 2.2 * 1.12, H_FOOT);
        const B = 48; // px across the footprint (a 0.37 m blob at 72 px/m is ≈ 27 px: 48 keeps the zoom smooth)
        rCrisp = blob(B, R_FOOT.h / R_FOOT.w, 0);
        rSoft = blob(B, R_FOOT.h / R_FOOT.w, 1);
        hCrisp = blob(B, H_FOOT.h / H_FOOT.w, 0);
        hSoft = blob(B, H_FOOT.h / H_FOOT.w, 1);
        crispK = rCrisp.width / B; // the texture's width over the footprint's (the penumbra pad)
        softK = rSoft.width / B;
      }
    },
    textures: () => [
      { name: "round relit (A)", canvas: round },
      { name: "hand grenade relit (A)", canvas: hand },
      { name: "round shadow: crisp (low)", canvas: rCrisp, note: "flat blob, no detail" },
      { name: "round shadow: soft (high)", canvas: rSoft },
      { name: "grenade shadow: crisp", canvas: hCrisp },
      { name: "grenade shadow: soft", canvas: hSoft },
    ],
    parts: [
      { id: "item", label: "Round / grenade (relit)" },
      { id: "shadow", label: "Shadow blob (landing read)" },
      { id: "trail", label: "Launcher trail" },
    ],
    frames: [
      { label: "launch", t: 0.03, when: "leaves the muzzle: shadow small, crisp, dark" },
      { label: "top", t: 0.2, when: "round at the top: shadow wide, soft, pale" },
      { label: "mid", t: 0.33, when: "grenade at the top; round about to land (crisp again)" },
      { label: "land", t: 0.6, when: "grenade about to land on its shadow" },
    ],
    draw(g, t, st) {
      const pxm = st.pxm;
      const A = gk().A;
      flightAt(LAUNCH, t, p);
      if (on(st, "trail"))
        for (let k = 1; k <= 5; k++) {
          const tk = t - k * 0.035;
          if (tk < 0) continue;
          flightAt(LAUNCH, tk, q);
          if (!q.live) continue;
          const a = Math.max(0, 0.6 * (1 - (k * 0.035) / 0.22));
          sprite(g, (A.soot[1] as HTMLCanvasElement[])[k % 3] as HTMLCanvasElement, X(st, q.x), Y(st, q.y - q.z * 0.15), 0.12 + k * 0.035 * 1.2, pxm, k, a);
        }
      if (p.live) {
        if (on(st, "shadow")) shadow(g, st, rCrisp, rSoft, R_FOOT, p, 0);
        if (on(st, "item")) sprite(g, round, X(st, p.x), Y(st, p.y - p.z * 0.15), ROUND_W_M * (1 + p.z * 0.3) * 3 * 1.1, pxm, 0, 1);
      }
      flightAt(HAND, t, p);
      if (p.live) {
        const spin = p.u * Math.PI * 2 * 2.2;
        if (on(st, "shadow")) shadow(g, st, hCrisp, hSoft, H_FOOT, p, spin);
        if (on(st, "item")) sprite(g, hand, X(st, p.x), Y(st, p.y - p.z * 0.15), GRENADE_FRAME_M.w * (1 + p.z * 0.3) * 2.2 * 1.12, pxm, spin, 1);
      }
    },
  };
}

/* ================================ MO-R: a cone of fire that grows ================================ */
/**
 * The proposed damage zone (a GAME change: today `hazards/molotov.ts` burns a 3 m circle for 4 s). A teardrop (a
 * tapered capsule) pointing along the throw: a round back of radius `back` around the impact, widening at
 * `HALF_DEG` to a round front cap, its tip `reach` metres ahead of the impact. It grows self-similarly from the
 * impact: reach 2 m at landing → 4.5 m after GROW_S (ease-out), holds, then the flames fade over the last 0.6 s
 * while the zone keeps its size (the sim's zone burns until it ends, as today).
 */
export const MO_R = { reach0: 2, reach1: 4.5, growS: 1.0, halfDeg: 35, back1: 0.8, durS: 4 } as const;
const SIN_A = Math.sin((MO_R.halfDeg * Math.PI) / 180);
/** Full-size shape: back radius r0 at the impact, front radius r1 at d ahead (d + r1 = reach1). */
const SH_D = (MO_R.reach1 - MO_R.back1) / (1 + SIN_A); // 2.35 m
const SH_R0 = MO_R.back1; // 0.8 m
const SH_R1 = SH_R0 + SH_D * SIN_A; // 2.15 m
const SB = (SH_R0 - SH_R1) / SH_D;
const SA = Math.sqrt(1 - SB * SB);
/**
 * Signed distance (m) from (x, y) to the full-size teardrop (x along the throw from the impact); < 0 inside. The
 * "uneven capsule" (Inigo Quilez): exact, a few multiplies, no allocation. It is also the sim's test the story would
 * use: a body of radius r burns when `sdCone(p / k) * k < r` (k = reach / reach1).
 */
export function sdCone(x: number, y: number): number {
  const px = Math.abs(y);
  const py = x;
  const k = -SB * px + SA * py;
  if (k < 0) return Math.hypot(px, py) - SH_R0;
  if (k > SA * SH_D) return Math.hypot(px, py - SH_D) - SH_R1;
  return SA * px + SB * py - SH_R0;
}
/** The zone's scale at `age` s after landing: reach(age) / reach1. */
const scaleAt = (age: number): number => (MO_R.reach0 + (MO_R.reach1 - MO_R.reach0) * easeOut(age / MO_R.growS)) / MO_R.reach1;
/** The fire's strength: 1 while burning, down to 0 over the last MOLOTOV_FADE_S. */
const envR = (age: number): number => (age < 0 || age > MO_R.durS ? 0 : age > MO_R.durS - MOLOTOV_FADE_S ? (MO_R.durS - age) / MOLOTOV_FADE_S : 1);
/** Where the impact sits on the card (m from the card's origin): 1 m left, so the 4.5 m cone fits the 9 m view. */
const IMP_X = -1.0;
const FLIGHT_R = { len: 4.5, speed: 12 }; // the same flight as MO-A / MO-G (4.5 m at 12 m/s), so the card's times hold
export const MO_R_LAND = Math.max(0.3, FLIGHT_R.len / FLIGHT_R.speed);
const BURN_MPS = 5; // the fire runs along the fuel at 5 m/s (MO-G)

interface Blob {
  x: number;
  y: number;
  r: number;
  th: number;
  d: number;
}
/** Half-width of the full-size teardrop at x (m from the impact, along the throw): its outline seen from the axis. */
function halfW(x: number): number {
  if (x <= -SH_R0) return 0;
  // the widest |y| still inside, by bisection on the signed distance (bake only)
  let lo = 0;
  let hi = SH_R1 + 0.1;
  if (sdCone(x, 0) >= 0) return 0;
  for (let i = 0; i < 18; i++) {
    const m = (lo + hi) / 2;
    if (sdCone(x, m) < 0) lo = m;
    else hi = m;
  }
  return lo;
}
/**
 * How much fuel lies at (x, y) at full size, 0 … 1: a thick puddle where the bottle broke, a sheet thrown forward
 * that thins toward its sides and front, a ragged edge 0.12–0.45 m inside the zone's edge (noise), dry islands.
 */
function fuelAt(x: number, y: number): number {
  const sd = sdCone(x, y);
  const n = fbm(x * 1.6 + 7, y * 1.6 + 3, 512, 4);
  const margin = 0.12 + 0.33 * n;
  if (sd > -margin) return 0;
  const hw = Math.max(0.3, halfW(x));
  const side = Math.min(1, Math.abs(y) / hw);
  const puddle = Math.max(0, 1 - Math.hypot(x * 0.9, y) / 0.75);
  const sheet = (1 - side * side) * (1 - Math.max(0, x) / 6.5);
  const edge = Math.min(1, (-sd - margin) / 0.18); // soft ragged rim
  const islands = fbm(x * 3.1 + 11, y * 3.1 + 5, 513, 3);
  const th = Math.max(puddle, 0.3 + 0.62 * sheet) * edge * (islands < 0.28 ? islands / 0.28 : 1);
  return Math.max(0, Math.min(1, th + (n - 0.5) * 0.25));
}
/** Flame spots: points on the fuel at full size, with how much fuel is there (th) and their distance (d). */
function splashR(): Blob[] {
  const r = rng(5121);
  const out: Blob[] = [];
  for (let i = 0; out.length < 260 && i < 6000; i++) {
    const x = -SH_R0 + r() * (MO_R.reach1 + SH_R0);
    const y = (r() * 2 - 1) * SH_R1;
    const th = fuelAt(x, y);
    if (th < 0.18 || r() > th) continue;
    out.push({ x, y, r: 0.18, th, d: Math.hypot(x, y) });
  }
  return out;
}

interface MoTex {
  blobs: Blob[];
  pick: number[];
  fuel: HTMLCanvasElement;
  scorch: HTMLCanvasElement;
  heat: HTMLCanvasElement;
  line: HTMLCanvasElement;
  pool: HTMLCanvasElement;
  bottle: HTMLCanvasElement;
  bottleSh: HTMLCanvasElement;
}
/** Every MO-R texture spans this box at full size (m from the impact; x = the throw). */
const BOX = { x0: -0.9, x1: 4.6, y0: -2.3, y1: 2.3 };
const BPXM = 40;
let MT: MoTex | null = null;
function bakeMo(): MoTex {
  if (MT) return MT;
  gameAtlases();
  const blobs = splashR();
  const pick: number[] = [];
  blobs.forEach((b, i) => {
    const w = Math.max(1, Math.round(b.th * b.th * 9)); // flames gather where the fuel is thick (the puddle, the spine)
    for (let k = 0; k < w; k++) pick.push(i);
  });
  const W = Math.ceil((BOX.x1 - BOX.x0) * BPXM);
  const H = Math.ceil((BOX.y1 - BOX.y0) * BPXM);
  const toM = (px: number, py: number): [number, number] => [BOX.x0 + (px + 0.5) / BPXM, BOX.y0 + (py + 0.5) / BPXM];
  // the fuel mask: per pixel from the fuel field, with a few drops thrown past the sheet's rim (still inside the zone)
  const mask = pixels(W, H, (px, py, o) => {
    const [x, y] = toM(px, py);
    const th = fuelAt(x, y);
    if (th <= 0) return false;
    o[0] = 0;
    o[1] = 0;
    o[2] = 0;
    o[3] = 0.55 + 0.45 * th;
    return true;
  });
  {
    const g = mask.getContext("2d")!;
    const r = rng(77);
    for (let i = 0; i < 40; i++) {
      const x = -0.4 + r() * 4.4;
      const y = (r() * 2 - 1) * 2.1;
      const sd = sdCone(x, y);
      if (sd > -0.14 || sd < -0.5) continue; // drops in the band between the sheet and the zone's edge
      const rad = (0.03 + r() * 0.05) * BPXM;
      g.fillStyle = `rgba(0,0,0,${0.6 + r() * 0.3})`;
      g.beginPath();
      g.ellipse((x - BOX.x0) * BPXM, (y - BOX.y0) * BPXM, rad * 1.4, rad, Math.atan2(y, x), 0, Math.PI * 2);
      g.fill();
    }
  }
  const colour = (col: string, src: HTMLCanvasElement): HTMLCanvasElement => {
    const c = make(W, H);
    const g = c.getContext("2d")!;
    g.fillStyle = col;
    g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = "destination-in";
    g.drawImage(src, 0, 0);
    return c;
  };
  const fuel = colour("rgb(26,21,15)", mask);
  {
    const rim = colour("rgba(170,160,140,1)", mask);
    const rg = rim.getContext("2d")!;
    rg.globalCompositeOperation = "destination-out";
    rg.drawImage(mask, 2, 2);
    const g = fuel.getContext("2d")!;
    g.globalAlpha = 0.4;
    g.drawImage(rim, 0, 0);
  }
  // the scorch: the fuel's shape burnt matte black-brown, licking a little past it, mottled like burnt asphalt
  const scorch = make(W, H);
  {
    const g = scorch.getContext("2d")!;
    g.filter = "blur(3px)";
    g.drawImage(colour("rgb(14,11,9)", mask), 0, 0);
    g.filter = "none";
    const d = g.getImageData(0, 0, W, H);
    for (let py = 0; py < H; py++)
      for (let px = 0; px < W; px++) {
        const j = (py * W + px) * 4 + 3;
        if (!d.data[j]) continue;
        const [x, y] = toM(px, py);
        const n = fbm(x * 4 + 2, y * 4 + 9, 514, 4);
        d.data[j] = Math.round((d.data[j] as number) * (0.55 + 0.6 * n));
        d.data[j - 3] = d.data[j - 2] = d.data[j - 1] = Math.round(10 + 22 * (1 - n)); // ash greys where it burnt thin
      }
    g.putImageData(d, 0, 0);
  }
  // heat on the ground = the zone: warmest on the fuel's spine near the impact, a floor of warmth to the edge, faded
  // over the last 0.25 m INSIDE the teardrop (FI-R's quieter edge), nothing outside
  const heat = pixels(W, H, (px, py, o) => {
    const [x, y] = toM(px, py);
    const sd = sdCone(x, y);
    if (sd >= 0) return false;
    const fu = fuelAt(x, y); // warmest over the fuel, a floor of warmth to the edge
    const n = fbm(x * 2.2 + 5, y * 2.2 + 1, 515, 3);
    const u = Math.min(1, -sd / 0.25);
    o[0] = 255;
    o[1] = 118 + 60 * fu;
    o[2] = 40 + 26 * fu;
    o[3] = (0.3 + 0.45 * fu) * (0.8 + 0.4 * n) * (0.35 + 0.65 * u * u * (3 - 2 * u));
    return true;
  });
  // the heat line: a soft warm band 0.1 m inside the edge (FWHM ≈ 0.15 m at full size), slow shimmer, down to a few %
  // at the edge itself (no crisp outer rim)
  const wr = rng(79);
  const wob = [wr(), wr(), wr(), wr(), wr()];
  const line = pixels(W, H, (px, py, o) => {
    const [x, y] = toM(px, py);
    const sd = sdCone(x, y);
    if (sd > 0.02 || sd < -0.3) return false;
    const band = (sd + 0.07) / 0.055;
    const ang = Math.atan2(y, x - 1.2);
    let w = 0;
    for (let k = 0; k < 5; k++) w += Math.sin(ang * (k + 3) + (wob[k] as number) * 6.28) / 5;
    o[0] = 255;
    o[1] = 165;
    o[2] = 100;
    o[3] = Math.exp(-band * band) * (0.775 + 0.225 * w) * (sd > 0 ? 1 - sd / 0.02 : 1);
    return o[3] > 0.004;
  });
  // the light from the flames: a warm pool in the cone's shape (held 0.3 m inside the edge), additive
  const pool = pixels(W, H, (px, py, o) => {
    const [x, y] = toM(px, py);
    const sd = sdCone(x, y);
    if (sd > -0.3) return false;
    const k = Math.min(1, (-sd - 0.3) / 1.1);
    o[0] = 255;
    o[1] = 160;
    o[2] = 72;
    o[3] = k * k * (3 - 2 * k) * 0.8;
    return true;
  });
  const bottle = relitFrame(G.bottle()[1] as HTMLCanvasElement, 72, 21, 72 * 0.9);
  // the bottle's shadow: a flat blob of its footprint (GR-R's rule), no picture
  const bottleSh = blob(64, MOLOTOV_FRAME_M.h / MOLOTOV_FRAME_M.w, 0.35);
  MT = { blobs, pick, fuel, scorch, heat, line, pool, bottle, bottleSh };
  return MT;
}

const MO_R_PLAN = (L: number): ActionPlan => ({
  goal: "It lands HERE; the fire runs forward in the throw's direction and grows from a 2 m to a 4.5 m cone in 1 s; inside it you burn; and now it's ending.",
  timing: "Proposed (a game change): reach 2 m at landing → 4.5 m at +1.0 s (ease-out), half-angle 35°, back 0.8 m behind the impact, 16.4 m² at full size (today's circle 28.3 m²); damage 8/s in 0.5 s pulses for 4 s as today; the flames fade over the last 0.6 s (MOLOTOV_FADE_S) while the zone keeps its size. Flight 4.5 m at 12 m/s = 0.375 s.",
  lengthS: L + 4.6,
  lanes: {
    light: [
      { t0: 0, t1: L, label: "rag flame: the only light in the air" },
      { t0: L, t1: L + 0.12, label: "whoosh", key: true },
      { t0: L + 0.12, t1: L + 4, label: "light pool in the cone's shape, one flicker" },
    ],
    core: [
      { t0: L + 0.05, t1: L + 1, label: "fire runs forward; the cone grows 2 → 4.5 m", key: true, nw: true },
      { t0: L + 1, t1: L + 3.4, label: "full cone: flames on the fuel only", nw: true },
      { t0: L + 3.4, t1: L + 4, label: "fade: fingers first, heat fades", nw: true },
    ],
    matter: [
      { t0: 0, t1: L, label: "bottle tumbles over its shadow blob" },
      { t0: L, t1: L + 0.3, label: "glass + fuel thrown forward", key: true },
    ],
    smoke: [{ t0: L + 0.3, t1: L + 4.6, label: "thin soot, downwind (may cross the edge)" }],
    mark: [
      { t0: L, t1: L + 1, label: "wet fuel runs out with the cone", nw: true },
      { t0: L + 1, t1: L + 4.6, label: "burns into a teardrop scorch, stays" },
    ],
    game: [
      { t0: L, t1: L + 1, label: "zone grows (cone, 2 → 4.5 m)", key: true, nw: true },
      { t0: L + 1, t1: L + 4, label: "8/s, pulses every 0.5 s = heat line ticks", nw: true },
    ],
  },
});

export function moR(): Look {
  return {
    code: "MO-R",
    title: "A cone of fire that grows forward",
    note: "Started from MO-G, which the designer liked (\"I like MOG, the fire and the cone\"), and changed where they asked: \"our molotov is actually not a cone but a circle … rethink the Molotov shape to a more conic form … grow … 2m … when it land and it grow to 3m or 4m after impact before it start to fade\". The damage zone itself is now a teardrop pointing along the throw: a round back 0.8 m behind the impact, widening at 35° to a round front. It is 2 m long when the bottle lands and runs forward to 4.5 m in 1 s, holds, then the flames fade over the last 0.6 s. The fuel, the flames, the light pool, the heat on the ground and the heat line all follow the growing cone; the heat line still brightens on each 0.5 s damage tick. Its edge is FI-R's quieter one. This is a game change: the sim would burn this shape instead of the 3 m circle.",
    goalFirst: {
      goal: "The bottle lands <b>here</b>; the fire <b>runs forward</b> in the throw's direction, a cone growing from 2 m to 4.5 m in 1 s; inside <b>this cone</b> you burn (8 damage/s in 0.5 s pulses) for <b>4 s</b>; and you can see it <b>ending</b> (the last 0.6 s).",
      elements: [
        { name: "Bottle + rag flame", job: "a fire bomb is coming: the bottle tumbles over a flat shadow blob (GR-R's rule); the rag is the only light in the air (orange)." },
        { name: "Impact: glass + whoosh", job: "it landed here: shards thrown forward with the fuel, a 0.12 s ignition whoosh at the impact." },
        { name: "Fuel (the cone's body)", job: "where the fire is and which way it goes: a puddle where the bottle broke, a fan thrown forward that widens with the cone, fingers and drops at the front. It runs out with the zone (scaled from the impact), never past its edge." },
        { name: "Flames on the fuel", job: "it burns: lit by a front running out from the impact at 5 m/s; tall on the thick puddle and spine, low on the fingers; leaning downwind. Never on the edge." },
        { name: "Heat on the ground", job: "the zone: a warm teardrop that ends exactly on the cone's edge, warmest along the fuel's spine, its last 0.25 m faded inside the edge. It grows with the zone." },
        { name: "Heat line + damage pulse", job: "the edge and the clock: a soft warm band 0.1 m inside the edge, all the way round the teardrop, brightening on each 0.5 s damage tick. It grows with the zone." },
        { name: "Light from the flames", job: "a flickering pool in the cone's shape, held 0.3 m inside the edge; its flicker drives the heat glow (one clock)." },
        { name: "Soot", job: "a fire, from far away: thin smoke from the fuel, downwind; may cross the edge." },
        { name: "Fade", job: "it is ending: thin fuel goes out first, then the puddle; the heat and line fade with them, gone when the zone is. The zone keeps its full size to the end (the sim burns until it ends)." },
        { name: "Mark", job: "it happened here: the wet stain, then a scorch in the teardrop's shape (needs a decal slot)." },
      ],
      composition: [
        "One shape for all: fuel, flames, light pool, heat and heat line are all laid in the same teardrop (signed distance <code>sdCone</code>), all scaled from the impact by the same growth k(t) = reach(t) / 4.5 m. The sim would use the same test, so what you see is where you burn.",
        "Brightness: whoosh > puddle and spine flames > finger flames > light pool > heat glow > heat line.",
        "Each flame's bright part is clamped inside the teardrop; the light pool ends 0.3 m inside; the heat line peaks 0.1 m inside and is a few % at the edge.",
        "One flicker drives flames, light pool and heat glow; the heat line moves only with the 0.5 s damage tick.",
        "The cone points along the throw; the wind (the game's) bends only the flames and the smoke. Smoke may drift past the edge; nothing bright does.",
      ],
      plan: MO_R_PLAN(MO_R_LAND),
    },
    async bake() {
      gk();
      bakeMo();
    },
    textures: () => {
      const T = bakeMo();
      const K = gk();
      return [
        { name: "fuel (teardrop fan, full size)", canvas: T.fuel, note: "scaled from the impact as the cone grows" },
        { name: "scorch (teardrop)", canvas: T.scorch },
        { name: "heat zone (teardrop)", canvas: T.heat, note: "ADD, ends on the edge" },
        { name: "heat line (teardrop)", canvas: T.line, note: "ADD, 0.1 m inside the edge" },
        { name: "light pool (cone shape)", canvas: T.pool, note: "ADD" },
        { name: "glass shard (MO-G)", canvas: K.shard },
        { name: "bottle relit", canvas: T.bottle },
        { name: "bottle shadow blob", canvas: T.bottleSh },
        { name: "A flame steps (shared)", canvas: (K.A.flame[1] as HTMLCanvasElement[])[0] as HTMLCanvasElement, note: "ADD" },
      ];
    },
    parts: [
      { id: "item", label: "Bottle + rag" },
      { id: "impact", label: "Glass + whoosh" },
      { id: "fuel", label: "Fuel + scorch" },
      { id: "flame", label: "Flames on the fuel" },
      { id: "heat", label: "Heat zone (cone)" },
      { id: "edge", label: "Heat line + damage pulse" },
      { id: "light", label: "Light from the flames" },
      { id: "smoke", label: "Soot" },
    ],
    frames: [
      { label: "flight", t: 0.2, when: "bottle in the air" },
      { label: "land", t: MO_R_LAND + 0.15, when: "2 m cone: glass + fuel thrown forward, fire starting" },
      { label: "grow", t: MO_R_LAND + 0.5, when: "the cone running forward (≈ 4 m)" },
      { label: "full", t: MO_R_LAND + 2.5, when: "full 4.5 m cone, damage every 0.5 s" },
      { label: "fade", t: MO_R_LAND + 3.75, when: "last 0.6 s: fingers out, heat fading" },
      { label: "out", t: MO_R_LAND + 4.3, when: "zone over: the teardrop scorch stays" },
    ],
    draw(g, t, st) {
      const T = bakeMo();
      const K = gk();
      const A = K.A;
      const pxm = st.pxm;
      const ix = st.cx + IMP_X * pxm; // the impact, px
      const iy = st.cy;
      const px = (x: number): number => ix + x * pxm;
      const py = (y: number): number => iy + y * pxm;
      const age = t - MO_R_LAND;
      const e = envR(age);
      const fl = fireFlicker(t, 0.7);
      const k = age < 0 ? 0 : scaleAt(age);
      // a full-size box texture, scaled by k from the impact
      const box = (tex: HTMLCanvasElement, a: number, add: boolean): void => {
        sprite(g, tex, px(((BOX.x0 + BOX.x1) / 2) * k), py(((BOX.y0 + BOX.y1) / 2) * k), (BOX.x1 - BOX.x0) * k, pxm, 0, a, add, (BOX.y1 - BOX.y0) * k);
      };
      if (age >= 0) {
        if (on(st, "fuel")) {
          const burnt = Math.min(1, Math.max(0, (age - 0.3) / 3.4));
          box(T.scorch, 0.75 * burnt, false);
          const wet = age < MO_R.durS - MOLOTOV_FADE_S ? 0.9 : Math.max(0, 0.9 * e);
          box(T.fuel, wet * (1 - burnt * 0.4) * Math.min(1, age / 0.08), false);
        }
        if (e > 0) {
          const on0 = Math.min(1, age / 0.15);
          if (on(st, "heat")) box(T.heat, (0.18 + 0.05 * fl) * e * on0, true);
          if (on(st, "edge")) box(T.line, (0.22 + 0.2 * pulse05(age)) * e * on0, true);
          if (on(st, "light")) box(T.pool, 0.24 * fl * e * Math.min(1, age / 0.4), true);
        }
        if (on(st, "impact")) {
          for (let s = 0; s < 7; s++) {
            const a = (hash(s * 7 + 3) - 0.5) * 1.4;
            const land = 0.35 + hash(s * 11 + 5) * 1.1;
            const u = Math.min(1, age / 0.25);
            const d = land * easeOut(u);
            const glint = e > 0 ? 0.75 + 0.25 * fireFlicker(t * 1.3, s) : 0.7;
            sprite(g, K.shard, px(Math.cos(a) * d), py(Math.sin(a) * d), 0.12, pxm, a + s * 2.1 + (u < 1 ? age * 20 : 5), glint * 0.7);
          }
          if (age < 0.12) {
            sprite(g, A.pool, ix, iy, 2.4, pxm, 0, 0.9 * (1 - age / 0.12), true);
            for (let s = 0; s < 4; s++) sprite(g, (A.flame[0] as HTMLCanvasElement[])[s] as HTMLCanvasElement, px(0.15 + s * 0.12), py((s - 1.5) * 0.15), 0.6, pxm, Math.PI / 2 + (s - 1.5) * 0.5, 0.8 * (1 - age / 0.12), true, 0.9);
          }
        }
        if (on(st, "flame") && e > 0) {
          const n = st.low ? 28 : 56;
          const rot = WIND_ANG + Math.PI / 2;
          const cut = 1 - e;
          for (let s = 0; s < n; s++) {
            const life = 0.4 + hash(s * 977 + 1) * 0.35;
            const ph = hash(s * 31 + 3) * life;
            const cyc = Math.floor((t + ph) / life);
            const fa = (t + ph - cyc * life) / life;
            const r = rng(s * 7919 + cyc * 31 + st.seed * 3);
            const b = T.blobs[T.pick[Math.floor(r() * T.pick.length)] as number] as Blob;
            const lit = age - 0.05 - (b.d * k) / BURN_MPS;
            if (lit < 0 || b.th < cut) continue;
            // full-size spot (on the blob, drifting downwind), then scaled with the zone
            const drift = (fa * life * 0.35) / Math.max(0.3, k);
            const fx = b.x + (r() - 0.5) * b.r + WIND[0] * drift;
            const fy = b.y + (r() - 0.5) * b.r + WIND[1] * drift;
            let size = (0.4 + 0.8 * b.th) * (0.7 + 0.5 * r()) * Math.sin(Math.PI * Math.min(1, fa * 1.15)) ** 0.7 * Math.min(1, lit / 0.25) * (0.6 + 0.4 * e) * (0.55 + 0.45 * k);
            const room = -sdCone(fx, fy) * k - 0.05; // metres to the zone's edge at this size
            if (size * 0.45 > room) size = Math.max(0, room / 0.45);
            if (size < 0.05) continue;
            const step = Math.min(5, 1 + Math.floor(fa * 4.5) + (b.th < 0.4 ? 1 : 0));
            sprite(g, (A.flame[step] as HTMLCanvasElement[])[(s + cyc) & 3] as HTMLCanvasElement, px(fx * k), py(fy * k), size * 0.75, pxm, rot + (r() - 0.5) * 0.5, 0.75 * (1 - fa * 0.35), true, size * 1.25);
          }
        }
        if (on(st, "smoke")) {
          const n = st.low ? 4 : 8;
          for (let s = 0; s < n; s++) {
            const life = 2.6 + hash(s * 3 + 9) * 0.8;
            const ph = hash(s * 19 + 4) * life;
            const cyc = Math.floor((t + ph) / life);
            const born = cyc * life - ph;
            const sa = (t - born) / life;
            const bornAge = born - MO_R_LAND;
            if (bornAge < 0.3 || envR(bornAge) < 0.3) continue;
            const r = rng(s * 211 + cyc * 7 + 5);
            const b = T.blobs[T.pick[Math.floor(r() * T.pick.length)] as number] as Blob;
            const kb = scaleAt(bornAge);
            const dd = 0.9 + sa * life * 0.8;
            sprite(g, (A.soot[Math.min(2, Math.floor(sa * 3))] as HTMLCanvasElement[])[s % 3] as HTMLCanvasElement, px(b.x * kb + WIND[0] * dd), py(b.y * kb + WIND[1] * dd - sa * 0.3), 0.6 + sa * 1.6, pxm, s + sa, Math.min(1, sa / 0.15) * 0.5 * (1 - sa) ** 1.5);
          }
        }
      }
      if (age < 0 && on(st, "item")) {
        const u = Math.max(0, t / MO_R_LAND);
        const z = 4 * 1.5 * u * (1 - u);
        const x = -FLIGHT_R.len * (1 - u);
        const spin = u * Math.PI * 2 * 1.6;
        const s = (1 + z * 0.3) * 1.5;
        const y = -z * 0.15;
        const hk = Math.min(1, z / 1.5);
        sprite(g, T.bottleSh, px(x + z * 0.35), py(z * 0.45), MOLOTOV_FRAME_M.w * 1.5 * 1.2 * (1 + 0.25 * z), pxm, spin, 0.75 - 0.4 * hk);
        sprite(g, T.bottle, px(x), py(y), MOLOTOV_FRAME_M.w * s * 1.12, pxm, spin, 1);
        const nx = (MOLOTOV_RAG_X_M[1] ?? 0.15) * s;
        const rx = x + Math.cos(spin) * nx;
        const ry = y + Math.sin(spin) * nx - 0.26 * 0.25 * s;
        sprite(g, A.pool, px(rx), py(ry + 0.1), 0.9, pxm, 0, 0.35 * fireFlicker(t, 1), true);
        sprite(g, (A.flame[1] as HTMLCanvasElement[])[Math.floor(t * 14) % 4] as HTMLCanvasElement, px(rx), py(ry - 0.04 * s), 0.3 * s, pxm, -Math.PI / 2 + Math.sin(t * 20) * 0.3, 0.95, true);
      }
    },
  };
}
