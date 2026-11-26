/**
 * MO-G: the Molotov, goal first (dead-city-model fx.md › FX 4), rethought like the car (FI-B). The flames of MO-A
 * (Story 5.12's pool fire) also form a ring at the zone's edge; here the flames burn only on the fuel the bottle
 * splashed, in the throw's direction, and the 3 m zone is shown by heat.
 *
 * GOAL: the bottle lands HERE; inside THIS 3 m circle you burn (consumables.json molotovs: 8 damage/s in 0.5 s pulses)
 * for 4 s; and the fire is ENDING (the last 0.6 s, MOLOTOV_FADE_S).
 *
 * ELEMENTS (one job each): the bottle + rag flame (a fire bomb is coming); the impact (glass + a whoosh: it landed
 * here); the fuel splash (where the fire is: thrown forward from the impact, a fan with fingers and drops); flames on
 * the fuel only (it burns: thick fuel tall, fingers low, lit by a front running out from the impact); heat on the
 * ground = the zone (a warmth that ends exactly at 3 m, a heat line that ticks with the damage); the light from the
 * flames (one flicker); soot (seen from far); the fade (fingers die first, heat and line fade together); the mark
 * (the fuel stain, then a scorch in the fan's shape). Cut: the edge flames (they drew the ring), embers (no job).
 *
 * COMPOSITION: flames only on the fuel; the circle only from heat; brightness: whoosh > thick-fuel flames > finger
 * flames > light pool > heat glow > heat line; the bright flame never passes R (the fuel is laid inside 2.85 m); one
 * flicker for flames, light and glow; the line moves only with the 0.5 s damage tick; smoke may cross the edge.
 */
import { make, sprite, rng, easeOut, type Look, type Stage, type ActionPlan } from "./kit";
import { G, gameAtlases, relitFrame, shadowOf } from "./fire-kit";
import { gk, on, hash, pulse05, WIND, WIND_ANG, EDGE } from "./fire-gkit";
import { fireFlicker } from "../../../../apps/client/src/render/city/fireParticles";
import { MOLOTOV_FRAME_M, MOLOTOV_RAG_X_M } from "../../../../apps/client/src/render/city/throwArt";
import { MOLOTOV_FADE_S } from "../../../../apps/client/src/render/molotovFx";

const MOL_R = 3; // consumables.json molotovs.radiusM
const MOL_DUR = 4; // molotovs.durationS
const FLIGHT = { x0: -4.5, x1: 0, speed: 12 }; // throwSpeedMps; the throw goes +x, so the splash goes +x
export const MO_LAND = Math.max(0.3, (FLIGHT.x1 - FLIGHT.x0) / FLIGHT.speed);
const SPREAD_S = 0.3; // the splash lands in 0.3 s
const BURN_MPS = 5; // the fire runs along the fuel at 5 m/s (2.6 m in ≈ 0.5 s, as the game's spread to the ring)
/** The fire's strength: 1 while burning, down to 0 over the last MOLOTOV_FADE_S. */
const env = (age: number): number => (age < 0 || age > MOL_DUR ? 0 : age > MOL_DUR - MOLOTOV_FADE_S ? (MOL_DUR - age) / MOLOTOV_FADE_S : 1);

/** One blob of splashed fuel (metres from the impact, x = the throw's direction); th = how thick (0 drop … 1 core). */
interface Blob {
  x: number;
  y: number;
  r: number;
  th: number;
  d: number;
}
const FUEL_PXM = 40;
const FUEL_BOX = { x0: -0.9, x1: 3.0, y0: -2.0, y1: 2.0 }; // the canvas spans this (m, from the impact)
function splash(): Blob[] {
  const r = rng(5120);
  const out: Blob[] = [];
  const push = (x: number, y: number, rad: number, th: number): void => {
    const d = Math.hypot(x, y);
    if (d + rad > MOL_R - 0.15) return; // all fuel inside 2.85 m
    out.push({ x, y, r: rad, th, d });
  };
  // the core: a fan thrown forward, thick on its centre line, widest about 1.5 m out
  for (let i = 0; i < 38; i++) {
    const u = Math.pow(r(), 0.8);
    const x = 0.05 + u * 2.0;
    const half = 0.25 + 0.75 * Math.sin(Math.min(1, u * 1.3) * Math.PI * 0.75);
    const v = (r() * 2 - 1) * half;
    push(x, v, 0.22 + 0.22 * (1 - Math.abs(v) / half) * (1 - u * 0.4), 0.55 + 0.45 * (1 - Math.abs(v) / half));
  }
  // fingers: thin runs out of the fan, ending in drops
  for (let f = 0; f < 7; f++) {
    const a = (f / 6 - 0.5) * 1.3 + (r() - 0.5) * 0.2;
    const start = 1.1 + r() * 0.5;
    const len = 0.7 + r() * 0.8;
    for (let s = 0; s <= 14; s++) {
      const dd = start + (len * s) / 14;
      const wig = Math.sin(s * 0.9 + f) * 0.04;
      push(Math.cos(a) * dd - Math.sin(a) * wig, Math.sin(a) * dd + Math.cos(a) * wig, 0.13 - s * 0.005, 0.38 - s * 0.015);
    }
    const dd = start + len + 0.2 + r() * 0.2;
    push(Math.cos(a) * dd, Math.sin(a) * dd, 0.09, 0.2);
  }
  // a few drops thrown back and to the sides at the impact
  for (let i = 0; i < 6; i++) {
    const a = Math.PI + (r() - 0.5) * 2.4;
    const dd = 0.25 + r() * 0.5;
    push(Math.cos(a) * dd, Math.sin(a) * dd, 0.07 + r() * 0.04, 0.15);
  }
  return out;
}

interface Tex {
  blobs: Blob[];
  /** Flame spots, weighted by how much fuel (th × r): indices into blobs. */
  pick: number[];
  fuel: HTMLCanvasElement;
  scorch: HTMLCanvasElement;
  bottle: HTMLCanvasElement;
  bottleSh: HTMLCanvasElement;
}
let T: Tex | null = null;
function bake(): Tex {
  if (T) return T;
  gameAtlases();
  const blobs = splash();
  const pick: number[] = [];
  blobs.forEach((b, i) => {
    const w = Math.max(1, Math.round(b.th * b.r * 30));
    for (let k = 0; k < w; k++) pick.push(i);
  });
  const W = Math.ceil((FUEL_BOX.x1 - FUEL_BOX.x0) * FUEL_PXM);
  const H = Math.ceil((FUEL_BOX.y1 - FUEL_BOX.y0) * FUEL_PXM);
  const mask = make(W, H);
  {
    const g = mask.getContext("2d")!;
    for (const b of blobs) {
      const x = (b.x - FUEL_BOX.x0) * FUEL_PXM;
      const y = (b.y - FUEL_BOX.y0) * FUEL_PXM;
      const rad = b.r * FUEL_PXM;
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, `rgba(0,0,0,${0.5 + 0.5 * b.th})`);
      gr.addColorStop(0.75, `rgba(0,0,0,${0.4 + 0.4 * b.th})`);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, rad, 0, Math.PI * 2);
      g.fill();
    }
  }
  {
    const soft = make(W, H);
    const sg = soft.getContext("2d")!;
    sg.filter = "blur(2px)";
    sg.drawImage(mask, 0, 0);
    const mg = mask.getContext("2d")!;
    mg.clearRect(0, 0, W, H);
    mg.drawImage(soft, 0, 0);
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
  // wet fuel: dark, oily, a lit rim on the edges facing the light (upper left)
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
  // the scorch: the same shape, matte, black-brown, a little wider (the fire licks past the fuel's edge)
  const scorch = make(W, H);
  {
    const g = scorch.getContext("2d")!;
    g.filter = "blur(4px)";
    g.drawImage(colour("rgb(12,10,8)", mask), 0, 0);
    g.filter = "none";
    g.globalAlpha = 0.6;
    g.drawImage(colour("rgb(8,7,6)", mask), 0, 0);
  }
  const bottle = relitFrame(G.bottle()[1] as HTMLCanvasElement, 72, 21, 72 * 0.9);
  T = { blobs, pick, fuel, scorch, bottle, bottleSh: shadowOf(bottle, 2, 0.7) };
  return T;
}

const MO_PLAN = (L: number): ActionPlan => ({
  goal: "It lands HERE; inside this 3 m circle you burn for 4 s; and now it's ending.",
  timing: "consumables.json molotovs: 3 m, 4 s, 8 damage/s in 0.5 s pulses; flight 4.5 m at 12 m/s = 0.375 s; molotovFx MOLOTOV_FADE_S 0.6 s. MO-G: splash lands in 0.3 s, fire runs along it at 5 m/s (≈ 0.5 s to the far fingers), flames 0.4–0.75 s each, smoke 2.6–3.4 s.",
  lengthS: L + 4.6,
  lanes: {
    light: [
      { t0: 0, t1: L, label: "rag flame: the only light in the air" },
      { t0: L, t1: L + 0.12, label: "whoosh", key: true, nw: true },
      { t0: L + 0.12, t1: L + 4, label: "light on the fuel + heat on the ground: one flicker", nw: true },
    ],
    core: [
      { t0: L + 0.05, t1: L + 0.6, label: "fire runs out along the fuel", key: true, nw: true },
      { t0: L + 0.6, t1: L + 3.4, label: "flames on the fuel only: thick tall, fingers low", nw: true },
      { t0: L + 3.4, t1: L + 4, label: "fade: fingers die first, heat fades", nw: true },
    ],
    matter: [
      { t0: 0, t1: L, label: "bottle tumbles, own shadow" },
      { t0: L, t1: L + SPREAD_S, label: "glass + fuel thrown forward", key: true, nw: true },
    ],
    smoke: [{ t0: L + 0.3, t1: L + 4.6, label: "thin soot from the fuel, downwind (may cross R)" }],
    mark: [
      { t0: L, t1: L + 0.3, label: "wet fuel lands (fan)", nw: true },
      { t0: L + 0.3, t1: L + 4.6, label: "fuel burns into a fan-shaped scorch, stays", nw: true },
    ],
    game: [
      { t0: L, t1: L + 0.05, label: "zone on", key: true },
      { t0: L + 0.05, t1: L + 4, label: "8/s, pulses every 0.5 s = heat line ticks", nw: true },
    ],
  },
});

export function moG(): Look {
  return {
    code: "MO-G",
    title: "Fuel thrown forward, heat for the zone",
    note: "Rethought from the goal, like the car. The bottle breaks where it lands and throws its fuel forward, in the throw's direction: a fan with thin fingers and drops. The fire runs out along that fuel in half a second and burns only there: tall on the thick middle, low on the fingers. No flame draws the circle. The 3 m zone is heat: a warm glow on the asphalt that ends exactly at 3 m, with a heat line that ticks with each 0.5 s damage pulse. In the last 0.6 s the fingers go out first and the heat fades, and the scorch stays in the fan's shape.",
    goalFirst: {
      goal: "The bottle lands <b>here</b>; inside <b>this 3 m circle</b> you burn (8 damage/s in 0.5 s pulses) for <b>4 s</b>; and you can see it <b>ending</b> (the last 0.6 s).",
      elements: [
        { name: "Bottle + rag flame", job: "a fire bomb is coming: the bottle tumbles on its own shadow; the rag is the only light in the air (orange; today's rag is an untinted white mask)." },
        { name: "Impact: glass + whoosh", job: "it landed here: shards thrown forward with the fuel, a 0.12 s ignition whoosh at the impact." },
        { name: "Fuel splash", job: "where the fire is: liquid thrown forward from the impact in the throw's direction, a fan with fingers and drops, landing in 0.3 s; it never leaves the circle." },
        { name: "Flames on the fuel", job: "it burns: lit by a front running out from the impact at 5 m/s; tall and dense on the thick middle, low on the fingers; leaning downwind. Never on the circle." },
        { name: "Heat on the ground", job: "the zone: a warmth centred on the impact that ends exactly at 3 m (the game's circle), with a thin heat line on the edge. Covers the side behind the impact too, where you also burn but no fuel lies." },
        { name: "Damage pulse", job: "the heat line brightens on each 0.5 s damage tick (one clock with the game)." },
        { name: "Light from the flames", job: "a flickering pool on the fuel; its flicker drives the heat glow (one clock)." },
        { name: "Soot", job: "a fire, from far away: thin smoke from the fuel, downwind; may cross the edge." },
        { name: "Fade", job: "it is ending: fingers go out first, then the thick middle shrinks; the heat and its line fade with them, and are gone when the zone is." },
        { name: "Mark", job: "it happened here: the wet stain, then a scorch in the fan's shape (needs a decal slot)." },
        { name: "Cut: edge flames, embers", job: "the edge flames drew the ring the designer rejected; embers had no job left." },
      ],
      composition: [
        "Flames only on the fuel; the circle only from heat. Brightness: whoosh > thick-fuel flames > finger flames > light pool > heat glow > heat line.",
        "The fuel is laid inside 2.85 m and each flame's bright part is clamped inside R; the light pool sits on the fuel and ends inside R.",
        "One flicker drives flames, light pool and heat glow; the heat line moves only with the 0.5 s damage tick.",
        "The splash and the fire share the throw's direction; the wind (the game's) bends the flames and smoke only.",
        "Smoke may drift past the edge (it doesn't burn); nothing bright does.",
      ],
      plan: MO_PLAN(MO_LAND),
    },
    async bake() {
      gk();
      bake();
    },
    textures: () => {
      const X = bake();
      const K = gk();
      return [
        { name: "fuel splash (wet)", canvas: X.fuel, note: "the fan, thrown forward" },
        { name: "scorch (fan shape)", canvas: X.scorch },
        { name: "heat zone", canvas: K.heat, note: "ADD, ends at R" },
        { name: "heat line", canvas: K.heatLine, note: "ADD" },
        { name: "glass shard", canvas: K.shard },
        { name: "bottle relit", canvas: X.bottle },
        { name: "bottle shadow", canvas: X.bottleSh },
        { name: "A flame steps (shared)", canvas: (K.A.flame[1] as HTMLCanvasElement[])[0] as HTMLCanvasElement, note: "ADD" },
        { name: "A pool (shared)", canvas: K.A.pool, note: "ADD" },
      ];
    },
    parts: [
      { id: "item", label: "Bottle + rag" },
      { id: "impact", label: "Glass + whoosh" },
      { id: "fuel", label: "Fuel splash + scorch" },
      { id: "flame", label: "Flames on the fuel" },
      { id: "heat", label: "Heat zone" },
      { id: "edge", label: "Heat line + damage pulse" },
      { id: "light", label: "Light from the flames" },
      { id: "smoke", label: "Soot" },
    ],
    frames: [
      { label: "flight", t: 0.2, when: "bottle in the air" },
      { label: "splash", t: MO_LAND + 0.15, when: "glass + fuel thrown forward, fire starting" },
      { label: "spread", t: MO_LAND + 0.45, when: "fire running out along the fuel" },
      { label: "burn", t: MO_LAND + 2.5, when: "burning (damage every 0.5 s)" },
      { label: "fade", t: MO_LAND + 3.75, when: "last 0.6 s: fingers out, heat fading" },
      { label: "out", t: MO_LAND + 4.3, when: "zone over: the scorch stays" },
    ],
    draw(g, t, st) {
      const X = bake();
      const K = gk();
      const A = K.A;
      const pxm = st.pxm;
      const px = (x: number): number => st.cx + x * pxm;
      const py = (y: number): number => st.cy + y * pxm;
      const age = t - MO_LAND;
      const e = env(age);
      const fl = fireFlicker(t, 0.7);
      if (age >= 0) {
        // the mark first: the fuel lands (scaled out from the impact), then burns into the scorch
        if (on(st, "fuel")) {
          const k = easeOut(Math.min(1, age / SPREAD_S));
          const wM = (FUEL_BOX.x1 - FUEL_BOX.x0) * k;
          const hM = (FUEL_BOX.y1 - FUEL_BOX.y0) * k;
          const cxm = ((FUEL_BOX.x0 + FUEL_BOX.x1) / 2) * k;
          const cym = ((FUEL_BOX.y0 + FUEL_BOX.y1) / 2) * k;
          const burnt = Math.min(1, Math.max(0, (age - 0.3) / 3.4));
          sprite(g, X.scorch, px(cxm), py(cym), wM, pxm, 0, 0.85 * burnt, false, hM);
          const wet = age < MOL_DUR - MOLOTOV_FADE_S ? 0.9 : Math.max(0, 0.9 * e);
          sprite(g, X.fuel, px(cxm), py(cym), wM, pxm, 0, wet * (1 - burnt * 0.4), false, hM);
        }
        if (e > 0) {
          const on0 = Math.min(1, age / 0.15);
          if (on(st, "heat")) sprite(g, K.heat, st.cx, st.cy, (2 * MOL_R) / EDGE, pxm, 0, (0.2 + 0.05 * fl) * e * on0, true);
          if (on(st, "edge")) sprite(g, K.heatLine, st.cx, st.cy, (2 * MOL_R) / EDGE, pxm, 0, (0.3 + 0.32 * pulse05(age)) * e * on0, true);
          if (on(st, "light")) sprite(g, A.pool, px(1.1), py(0), 3.4, pxm, 0, 0.42 * fl * e * Math.min(1, age / 0.4), true);
        }
        // glass: shards thrown forward with the fuel, then lying there, catching the firelight
        if (on(st, "impact")) {
          for (let k = 0; k < 7; k++) {
            const a = (hash(k * 7 + 3) - 0.5) * 2.0;
            const land = 0.35 + hash(k * 11 + 5) * 1.1;
            const u = Math.min(1, age / 0.25);
            const d = land * easeOut(u);
            const glint = e > 0 ? 0.75 + 0.25 * fireFlicker(t * 1.3, k) : 0.7;
            sprite(g, K.shard, px(Math.cos(a) * d), py(Math.sin(a) * d), 0.12, pxm, a + k * 2.1 + (u < 1 ? age * 20 : 5), glint * 0.7);
          }
          if (age < 0.12) {
            sprite(g, A.pool, st.cx, st.cy, 2.4, pxm, 0, 0.9 * (1 - age / 0.12), true);
            for (let k = 0; k < 4; k++) sprite(g, (A.flame[0] as HTMLCanvasElement[])[k] as HTMLCanvasElement, px(0.15 + k * 0.12), py((k - 1.5) * 0.15), 0.6, pxm, Math.PI / 2 + (k - 1.5) * 0.5, 0.8 * (1 - age / 0.12), true, 0.9);
          }
        }
        // flames on the fuel only, lit by a front running out from the impact; in the fade, thin fuel goes out first
        if (on(st, "flame") && e > 0) {
          const n = st.low ? 20 : 40;
          const rot = WIND_ANG + Math.PI / 2;
          const cut = 1 - e; // in the fade: fuel thinner than this is out
          for (let k = 0; k < n; k++) {
            const life = 0.4 + hash(k * 977 + 1) * 0.35;
            const ph = hash(k * 31 + 3) * life;
            const cyc = Math.floor((t + ph) / life);
            const fa = (t + ph - cyc * life) / life;
            const r = rng(k * 7919 + cyc * 31 + st.seed * 3);
            const b = X.blobs[X.pick[Math.floor(r() * X.pick.length)] as number] as Blob;
            const lit = age - 0.05 - b.d / BURN_MPS;
            if (lit < 0 || b.th < cut) continue;
            const ox = (r() - 0.5) * b.r;
            const oy = (r() - 0.5) * b.r;
            const drift = fa * life * 0.35;
            const x = b.x + ox + WIND[0] * drift;
            const y = b.y + oy + WIND[1] * drift;
            let size = (0.3 + 0.75 * b.th) * (0.7 + 0.5 * r()) * Math.sin(Math.PI * Math.min(1, fa * 1.15)) ** 0.7 * Math.min(1, lit / 0.25) * (0.6 + 0.4 * e);
            const reach = Math.hypot(x, y) + size * 0.45;
            if (reach > MOL_R - 0.05) size = Math.max(0, (MOL_R - 0.05 - Math.hypot(x, y)) / 0.45);
            if (size < 0.05) continue;
            const step = Math.min(5, 1 + Math.floor(fa * 4.5) + (b.th < 0.4 ? 1 : 0));
            sprite(g, (A.flame[step] as HTMLCanvasElement[])[(k + cyc) & 3] as HTMLCanvasElement, px(x), py(y), size * 0.75, pxm, rot + (r() - 0.5) * 0.5, 0.75 * (1 - fa * 0.35), true, size * 1.25);
          }
        }
        if (on(st, "smoke")) {
          const n = st.low ? 4 : 8;
          for (let k = 0; k < n; k++) {
            const life = 2.6 + hash(k * 3 + 9) * 0.8;
            const ph = hash(k * 19 + 4) * life;
            const cyc = Math.floor((t + ph) / life);
            const born = cyc * life - ph;
            const sa = (t - born) / life;
            const bornAge = born - MO_LAND;
            if (bornAge < 0.3 || env(bornAge) < 0.3) continue;
            const r = rng(k * 211 + cyc * 7 + 5);
            const b = X.blobs[X.pick[Math.floor(r() * X.pick.length)] as number] as Blob;
            const dd = 0.9 + sa * life * 0.8;
            const x = b.x + WIND[0] * dd;
            const y = b.y + WIND[1] * dd - sa * 0.3;
            sprite(g, (A.soot[Math.min(2, Math.floor(sa * 3))] as HTMLCanvasElement[])[k % 3] as HTMLCanvasElement, px(x), py(y), 0.6 + sa * 1.6, pxm, k + sa, Math.min(1, sa / 0.15) * 0.5 * (1 - sa) ** 1.5);
          }
        }
      }
      // the bottle in flight (as MO-A, the rag tinted)
      if (age < 0 && on(st, "item")) {
        const dur = MO_LAND;
        const u = Math.max(0, t / dur);
        const z = 4 * 1.5 * u * (1 - u);
        const x = FLIGHT.x0 + (FLIGHT.x1 - FLIGHT.x0) * u;
        const spin = u * Math.PI * 2 * 1.6;
        const s = (1 + z * 0.3) * 1.5;
        const fm = MOLOTOV_FRAME_M;
        const y = -z * 0.15;
        sprite(g, X.bottleSh, px(x + z * 0.35), py(z * 0.45), fm.w * 1.5 * 1.1, pxm, spin, Math.max(0.25, 0.7 - z * 0.25));
        sprite(g, X.bottle, px(x), py(y), fm.w * s * 1.12, pxm, spin, 1);
        const nx = (MOLOTOV_RAG_X_M[1] ?? 0.15) * s;
        const rx = x + Math.cos(spin) * nx;
        const ry = y + Math.sin(spin) * nx - 0.26 * 0.25 * s;
        sprite(g, A.pool, px(rx), py(ry + 0.1), 0.9, pxm, 0, 0.35 * fireFlicker(t, 1), true);
        sprite(g, (A.flame[1] as HTMLCanvasElement[])[Math.floor(t * 14) % 4] as HTMLCanvasElement, px(rx), py(ry - 0.04 * s), 0.3 * s, pxm, -Math.PI / 2 + Math.sin(t * 20) * 0.3, 0.95, true);
      }
    },
  };
}
export type { Stage };
