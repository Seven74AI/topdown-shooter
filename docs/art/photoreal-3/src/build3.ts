/**
 * Photoreal, group 3: things you build (designer 2026-11-25: "Start with things you build"). The same recipe as the
 * accepted characters take 4: today's drawings are kept exactly (every plank, bolt and spike), then each colour region
 * becomes a rounded volume lit by the cool street key light, with materials read from the colour (wood grain along the
 * planks, brushed and pitted steel, rough rust, woven sandbags), gloss on steel, and lamps / LEDs / the med cross kept
 * as a separate glow layer. Then details turn into animation: floodlights hum and flicker, the med station's cross
 * beats and scans, the mine's LED blinks with a sensor ping, and glints run over steel jaws, spikes and wire.
 * Drawn at twice the game's resolution (192 px per metre). Built into ../compare.html by build.mjs.
 */
import { drawBearTrap, drawInFrame, drawMetalBarricade, drawMine, drawReinforcedBarricade, drawSpikeTrap, type Ctx } from "../../../../apps/client/src/render/city/buildingArt";
import { drawObjectInFrame, drawWoodBarricade } from "../../../../apps/client/src/render/city/objectArt";
import { drawFloodlightFL1, drawFloodlightFL5, drawMedStation, drawPropInFrame } from "../../../../apps/client/src/render/city/propArt";
import { CB, SIDE_C, drawCorner, drawFrontIn, drawFrontOut, drawPoliceCorner, drawPoliceFront, drawPoliceSide, drawSide, type Style, drawMT3, drawPB3, drawRF3, drawWD3, drawWD3corner, drawWD3outV, drawWD3sideE, drawWD3sideW, drawWD3v, inFrameM } from "./barricadeTakes";
import { asphalt, canvas, ctx, fbm, hash2, night, type G } from "../../asset-fixes-1/src/lib";

declare const REFS: Record<string, string>; // the Meshy references (round 3)
declare const CURRENT: Record<string, string>; // today's frames (data URLs), injected by build.mjs

const PXM = 192; // 2× the game's 96 px per metre
const SS = 2;
const GAME_PXM = 96;

type Glow = "none" | "flicker" | "heartbeat" | "blink" | "strobe";
interface Item {
  id: string;
  name: string;
  wM: number;
  hM: number;
  draw: (g: Ctx, w: number, h: number) => void;
  inFrame: typeof drawInFrame;
  /** Direction of the wood grain / brushed steel. */
  dir: "x" | "y";
  /** Which drawn pixels glow (r, g, b 0–255). */
  emissive?: (r: number, g: number, b: number) => boolean;
  glow: Glow;
  /** Glints running over the steel (count). */
  glints: number;
  note: string;
}

const hueOf = (r: number, g: number, b: number): number => {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  const d = mx - mn;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
};
const satOf = (r: number, g: number, b: number): number => {
  const mx = Math.max(r, g, b);
  return mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
};
const lampWhite = (r: number, g: number, b: number): boolean => (r + g + b) / 765 > 0.86 && satOf(r, g, b) < 0.4;
const crossGreen = (r: number, g: number, b: number): boolean => {
  const h = hueOf(r, g, b);
  return h > 115 && h < 175 && satOf(r, g, b) > 0.35 && Math.max(r, g, b) > 150;
};
const ledRed = (r: number, g: number, b: number): boolean => {
  const h = hueOf(r, g, b);
  return (h < 18 || h > 340) && satOf(r, g, b) > 0.6 && r > 120;
};

const ITEMS: Item[] = [
  { id: "building_barricade_wood", name: "Wood barricade", wM: 2, hM: 0.5, draw: drawWoodBarricade, inFrame: drawObjectInFrame, dir: "x", glow: "none", glints: 6, note: "Real wood grain along the planks, rounded edges, nail heads that catch the light." },
  { id: "building_barricade_reinforced", name: "Reinforced barricade", wM: 2, hM: 0.5, draw: drawReinforcedBarricade, inFrame: drawInFrame, dir: "y", glow: "none", glints: 14, note: "Grain on the posts; glints run along the razor wire." },
  { id: "building_barricade_metal", name: "Metal barricade", wM: 2, hM: 0.5, draw: drawMetalBarricade, inFrame: drawInFrame, dir: "x", glow: "none", glints: 8, note: "Brushed, pitted steel with rust in the seams; the street light slides over the plates." },
  { id: "building_spiketrap_a", name: "Spike trap", wM: 2, hM: 2, draw: drawSpikeTrap, inFrame: drawInFrame, dir: "x", glow: "none", glints: 26, note: "Weathered boards; the spike tips glint one by one." },
  { id: "building_mine_a", name: "Mine", wM: 0.5, hM: 0.5, draw: drawMine, inFrame: drawInFrame, dir: "x", emissive: ledRed, glow: "blink", glints: 3, note: "Armed: the red LED blinks and sends out a faint sensor ping." },
  { id: "building_beartrap_open", name: "Bear trap (open)", wM: 1, hM: 1, draw: (g, w, h) => drawBearTrap(g, w, h, false), inFrame: drawInFrame, dir: "x", glow: "none", glints: 12, note: "Oiled steel jaws; glints run around the teeth." },
  { id: "building_beartrap_closed", name: "Bear trap (closed)", wM: 1, hM: 1, draw: (g, w, h) => drawBearTrap(g, w, h, true), inFrame: drawInFrame, dir: "x", glow: "none", glints: 8, note: "Same steel, jaws shut." },
  { id: "prop_floodlight_a", name: "Floodlight (tripod)", wM: 1, hM: 1, draw: drawFloodlightFL1, inFrame: drawPropInFrame, dir: "y", emissive: lampWhite, glow: "flicker", glints: 4, note: "The lamp hums with a soft flicker and a wide bloom; brushed yellow housing." },
  { id: "prop_floodlight_b", name: "Floodlight (sandbags)", wM: 1, hM: 1, draw: drawFloodlightFL5, inFrame: drawPropInFrame, dir: "x", emissive: lampWhite, glow: "flicker", glints: 4, note: "Woven sandbag cloth; the caged lamp flickers like a generator light." },
  { id: "prop_medstation_a", name: "Med station", wM: 1, hM: 1, draw: drawMedStation, inFrame: drawPropInFrame, dir: "x", emissive: crossGreen, glow: "heartbeat", glints: 4, note: "The green cross beats like a pulse and a scan line runs down it." },
];

/** New orientation for the barricades, like the police sawhorse (designer 2026-11-25). */
const take = (id: string, name: string, draw: (g: Ctx) => void, dir: "x" | "y", glints: number, note: string): Item => ({ id, name, wM: 2, hM: 1, draw: (g) => draw(g), inFrame: inFrameM, dir, glow: "none", glints, note });
const amber = (r: number, g: number, b: number): boolean => {
  const h = hueOf(r, g, b);
  return h > 25 && h < 55 && satOf(r, g, b) > 0.55 && r > 200;
};
const TAKES: { title: string; now: string; items: Item[] }[] = [
  { title: "Police barricade (in the game today)", now: "", items: [
    { ...take("PB3", "PB3 · Police sawhorses", drawPB3, "x", 8, "Two striped boards on splayed A-frame legs, amber lamps blinking on the end ones, and the long slatted shadow."), emissive: amber, glow: "strobe" },
  ] },
  { title: "Wood barricade", now: "building_barricade_wood", items: [
    take("WD3", "WD3 · Scavenged survivor wall", drawWD3, "x", 6, "Stakes of uneven height, an old door, a stood-up pallet, long planks nailed across, props leaning on the front, cinder blocks and a tyre."),
  ] },
  { title: "Reinforced barricade", now: "building_barricade_reinforced", items: [
    take("RF3", "RF3 · Steel-sheeted wall + razor wire", drawRF3, "x", 18, "The wall faced with rusty corrugated sheets, chains slung across, a coil of razor wire along the top."),
  ] },
  { title: "Metal barricade", now: "building_barricade_metal", items: [
    take("MT3", "MT3 · Welded steel panels", drawMT3, "x", 12, "Welded steel plates with hazard bands, steel beam props, sandbags along the base."),
  ] },
];

interface Lit {
  base: HTMLCanvasElement;
  glow: HTMLCanvasElement;
  bloom: HTMLCanvasElement;
  cage: HTMLCanvasElement;
  gloss: HTMLCanvasElement;
  hasGlow: boolean;
  /** Centre and size of the glowing part (output px). */
  gc: [number, number, number];
  /** Glint spots on the steel (output px). */
  spots: [number, number][];
  w: number;
  h: number;
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const a = src.slice();
  const t = new Float32Array(w * h);
  const rr = Math.max(1, Math.round(r));
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -rr; x <= rr; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))] as number;
      for (let x = 0; x < w; x++) {
        t[y * w + x] = acc / (2 * rr + 1);
        acc += (a[y * w + Math.min(w - 1, x + rr + 1)] as number) - (a[y * w + Math.max(0, x - rr)] as number);
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -rr; y <= rr; y++) acc += t[Math.min(h - 1, Math.max(0, y)) * w + x] as number;
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * rr + 1);
        acc += (t[Math.min(h - 1, y + rr + 1) * w + x] as number) - (t[Math.max(0, y - rr) * w + x] as number);
      }
    }
  }
  return a;
}

/** Today's drawing → volumes, light, materials, gloss, glow. */
function relight(it: Item, seed: number): Lit {
  const w = Math.round(it.wM * PXM);
  const h = Math.round(it.hM * PXM);
  const W = w * SS;
  const H = h * SS;
  const src = canvas(W, H);
  const sg = ctx(src);
  // drawn at the game's 96 px per metre (its 1-px lines keep their weight), rasterised at 4× for the relight
  const k = (PXM * SS) / GAME_PXM;
  sg.scale(k, k);
  it.inFrame(sg, 0, 0, W / k, H / k, GAME_PXM, (c) => it.draw(c, it.wM, it.hM));
  sg.setTransform(1, 0, 0, 1, 0, 0);
  const d = sg.getImageData(0, 0, W, H).data;
  const n = W * H;
  const A = new Float32Array(n);
  const lum = new Float32Array(n);
  const sat = new Float32Array(n);
  const hu = new Float32Array(n);
  const emis = new Uint8Array(n);
  let ex = 0;
  let ey = 0;
  let ec = 0;
  for (let i = 0; i < n; i++) {
    const r = d[i * 4] as number;
    const g = d[i * 4 + 1] as number;
    const b = d[i * 4 + 2] as number;
    A[i] = (d[i * 4 + 3] as number) / 255;
    lum[i] = (r * 0.3 + g * 0.55 + b * 0.15) / 255;
    sat[i] = satOf(r, g, b);
    hu[i] = hueOf(r, g, b);
    if (it.emissive && A[i]! > 0.6 && it.emissive(r, g, b)) {
      emis[i] = 1;
      ex += i % W;
      ey += (i / W) | 0;
      ec++;
    }
  }
  // creases: dark lines and sharp colour edges
  const E = new Float32Array(n);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (A[i]! < 0.5) continue;
      let edge = 0;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        edge = Math.max(edge, (Math.abs((d[i * 4] as number) - (d[j * 4] as number)) + Math.abs((d[i * 4 + 1] as number) - (d[j * 4 + 1] as number)) + Math.abs((d[i * 4 + 2] as number) - (d[j * 4 + 2] as number))) / 255);
      }
      E[i] = Math.min(1, Math.max(lum[i]! < 0.08 ? 1 : 0, edge > 0.2 ? edge * 1.2 : 0));
    }
  }
  const cut = new Float32Array(n);
  for (let i = 0; i < n; i++) cut[i] = A[i]! * (1 - E[i]!);
  const b1 = boxBlur(cut, W, H, 1.2 * SS);
  const b2 = boxBlur(cut, W, H, 3 * SS);
  const b3 = boxBlur(cut, W, H, 7 * SS);
  // material per pixel: 0 other, 1 wood, 2 steel, 3 rust, 4 cloth
  const mat = new Uint8Array(n);
  const Hf = new Float32Array(n);
  const along = it.dir === "x";
  for (let i = 0; i < n; i++) {
    const x = i % W;
    const y = (i / W) | 0;
    const hh = hu[i]!;
    const s = sat[i]!;
    const l = lum[i]!;
    let m = 0;
    if (s < 0.16 && l > 0.12) m = 2;
    else if (hh >= 8 && hh < 30 && s > 0.45 && l < 0.45) m = 3;
    else if (hh >= 22 && hh < 55 && s > 0.15 && s < 0.6 && l > 0.15) m = l > 0.5 && s < 0.4 ? 4 : 1;
    mat[i] = m;
    const u = along ? x : y;
    const v = along ? y : x;
    let tex = 0;
    if (m === 1) {
      // wood: long stretched grain, rings, and fine fibres
      const ring = Math.sin(v / (2.2 * SS) + fbm(u / (60 * SS), v / (8 * SS), seed, 3) * 9);
      tex = ring * 0.012 + (fbm(u / (40 * SS), v / (1.6 * SS), seed + 1, 3) - 0.5) * 0.05 + (hash2(u >> 2, v, seed) - 0.5) * 0.012;
    } else if (m === 2) {
      tex = (fbm(u / (30 * SS), v / (0.8 * SS), seed + 2, 2) - 0.5) * 0.012 - (fbm(x / (1.2 * SS), y / (1.2 * SS), seed + 3, 2) > 0.72 ? 0.01 : 0);
    } else if (m === 3) {
      tex = (fbm(x / (1.4 * SS), y / (1.4 * SS), seed + 4, 3) - 0.5) * 0.06;
    } else if (m === 4) {
      tex = Math.sin(x * 1.5 / SS) * Math.sin(y * 1.5 / SS) * 0.01 + (fbm(x / (4 * SS), y / (4 * SS), seed + 5, 3) - 0.5) * 0.05;
    } else tex = (fbm(x / (2 * SS), y / (2 * SS), seed + 6, 2) - 0.5) * 0.02;
    Hf[i] = (b1[i]! * 0.3 + b2[i]! * 0.35 + b3[i]! * 0.35) * A[i]! + tex * A[i]! - E[i]! * 0.08;
  }
  const base = sg.createImageData(W, H);
  const glow = sg.createImageData(W, H);
  const gloss = sg.createImageData(W, H);
  const occ = sg.createImageData(W, H);
  const oc = occ.data;
  const o = base.data;
  const go = glow.data;
  const so = gloss.data;
  const L = [-0.5, -0.72, 0.48];
  const ll = Math.hypot(L[0]!, L[1]!, L[2]!);
  const [lx, ly, lz] = [L[0]! / ll, L[1]! / ll, L[2]! / ll];
  const tint = [0.94, 0.98, 1.06];
  const K = 12;
  const spotCand: [number, number, number][] = [];
  let hasGlow = false;
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const a = A[i]!;
      if (a <= 0.004) continue;
      const dx = (Hf[i + 1]! - Hf[i - 1]!) * K;
      const dy = (Hf[i + W]! - Hf[i - W]!) * K;
      const nl = Math.hypot(dx, dy, 1);
      const nx = -dx / nl;
      const ny = -dy / nl;
      const nz = 1 / nl;
      const nd = nx * lx + ny * ly + nz * lz;
      const diff = Math.max(0, nd);
      const m = mat[i]!;
      const l0 = lum[i]!;
      const glossK = Math.min(1, m === 2 ? 0.75 : m === 3 ? 0.04 : m === 1 ? 0.1 : m === 4 ? 0.02 : (l0 < 0.18 ? 0.5 : 0) + (sat[i]! > 0.55 ? 0.4 : 0) + 0.08);
      const rz = 2 * nd * nz - lz;
      const sp = Math.pow(Math.max(0, rz), m === 2 ? 28 : 16) * glossK;
      const grain = 1 + (hash2(x, y, seed) - 0.5) * 0.05 + (fbm(x / (1.2 * SS), y / (1.2 * SS), seed + 7, 2) - 0.5) * 0.14 * (1 - glossK);
      const ao = 1 - E[i]! * 0.3;
      // soft, see-through parts of the drawing (shadows, halos) stay as drawn
      // thin parts (wire, chain, legs) keep most of their drawn colour so the light can't swallow them
      const thin = Math.min(1, Math.max(0, 1 - b2[i]! / Math.max(0.01, a) - 0.15) * 1.6);
      const solid = Math.min(1, Math.max(0, (a - 0.35) / 0.4)) * (1 - 0.75 * thin);
      for (let c = 0; c < 3; c++) {
        const v = d[i * 4 + c] as number;
        const lit = Math.min(255, v * (0.42 + 0.88 * diff * (tint[c] as number)) * grain * ao + sp * 230 * (tint[c] as number));
        o[i * 4 + c] = emis[i] ? v : v + (lit - v) * solid;
      }
      o[i * 4 + 3] = d[i * 4 + 3] as number;
      if (!emis[i] && a > 0.5) oc[i * 4 + 3] = 255;
      if (emis[i]) {
        hasGlow = true;
        for (let c = 0; c < 3; c++) go[i * 4 + c] = d[i * 4 + c] as number;
        go[i * 4 + 3] = 255;
      }
      if (glossK > 0.4 && solid > 0.9) {
        so[i * 4] = so[i * 4 + 1] = so[i * 4 + 2] = 255;
        so[i * 4 + 3] = Math.round(255 * glossK * Math.max(0, nz));
        if (m === 2 && sp > 0.35 && (x + y * 7) % 3 === 0) spotCand.push([x, y, sp]);
      }
    }
  }
  // glint spots: the brightest highlights, spread out
  spotCand.sort((p, q) => q[2] - p[2]);
  const spots: [number, number][] = [];
  const minD = 10 * SS;
  for (const p of spotCand) {
    if (spots.length >= it.glints) break;
    if (spots.every((s) => Math.hypot(s[0] * SS - p[0], s[1] * SS - p[1]) > minD)) spots.push([p[0] / SS, p[1] / SS]);
  }
  // the solid parts right next to the glow (lamp cage, housing rim, cross frame): drawn again over the glow so it can't wash them out
  const em = new Float32Array(n);
  for (let i = 0; i < n; i++) em[i] = emis[i]!;
  const near = boxBlur(em, W, H, 6 * SS);
  const cage = sg.createImageData(W, H);
  const cg = cage.data;
  for (let i = 0; i < n; i++) {
    if (emis[i] || near[i]! < 0.02 || A[i]! < 0.5) continue;
    for (let c = 0; c < 4; c++) cg[i * 4 + c] = o[i * 4 + c] as number;
  }
  const shrink = (img: ImageData, blur = 0): HTMLCanvasElement => {
    const c = canvas(W, H);
    ctx(c).putImageData(img, 0, 0);
    const out = canvas(w, h);
    const og = ctx(out);
    og.imageSmoothingQuality = "high";
    if (blur) og.filter = `blur(${blur}px)`;
    og.drawImage(c, 0, 0, w, h);
    return out;
  };
  const gr = ec ? Math.sqrt(ec / Math.PI) / SS : 0;
  // the bloom stays off the solid parts (cage bars, frames) so the glow doesn't wash them out
  const bloom = shrink(glow, 8);
  const bgc = ctx(bloom);
  bgc.globalCompositeOperation = "destination-out";
  bgc.globalAlpha = 0.85;
  bgc.drawImage(shrink(occ), 0, 0);
  return { base: shrink(base), glow: shrink(glow), bloom, cage: shrink(cage), gloss: shrink(gloss), hasGlow, gc: [ex / Math.max(1, ec) / SS, ey / Math.max(1, ec) / SS, gr], spots, w, h };
}

// ─────────────────────────────── animation ───────────────────────────────

const PAD = 28;

function glowLevel(kind: Glow, t: number, seed: number): number {
  if (kind === "flicker") {
    // a generator lamp: steady hum, with now and then a short dip
    const hum = 0.88 + 0.06 * Math.sin(t * 2 * Math.PI * 7.3) * fbm(t * 4, 0.3, seed, 2);
    const dip = fbm(t * 1.6, 1.7, seed + 1, 2);
    return hum * (dip < 0.34 ? 0.35 + (Math.sin(t * 60) > 0 ? 0.4 : 0) : 1);
  }
  if (kind === "heartbeat") {
    const p = (t % 1.1) / 1.1;
    const beat = Math.exp(-((p - 0.08) ** 2) / 0.002) + 0.7 * Math.exp(-((p - 0.28) ** 2) / 0.002);
    return 0.4 + 0.5 * beat;
  }
  if (kind === "blink") return t % 1.2 < 0.14 ? 1 : 0.12;
  if (kind === "strobe") return Math.max(0.15, Math.sin(t * Math.PI * 2 * 0.9)) ** 0.5;
  return 0;
}

function animated(lit: Lit, it: Item, scale: number, seed: number): { c: HTMLCanvasElement; frame: (t: number) => void } {
  const { w, h } = lit;
  const cw = Math.round((w + PAD * 2) * scale);
  const chh = Math.round((h + PAD * 2) * scale);
  const c = canvas(cw, chh);
  const g = ctx(c);
  const bg = canvas(cw, chh);
  const bgg = ctx(bg);
  asphalt(bgg, cw, chh, 5 + seed);
  night(bgg, cw, chh, 0.3, [[cw * 0.1, chh * 0.1, Math.max(cw, chh) * 0.9]]);
  const sheen = canvas(w, h);
  const shg = ctx(sheen);
  const frame = (t: number): void => {
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    g.drawImage(bg, 0, 0);
    g.save();
    g.scale(scale, scale);
    g.translate(PAD, PAD);
    // contact shadow
    g.save();
    g.globalAlpha = 0.55;
    g.filter = "blur(3px) brightness(0)";
    g.drawImage(lit.base, 4, 6);
    g.restore();
    g.drawImage(lit.base, 0, 0);
    // the street light's sheen sliding over the steel
    shg.globalCompositeOperation = "copy";
    shg.drawImage(lit.gloss, 0, 0);
    shg.globalCompositeOperation = "source-in";
    const sx = ((t * 0.18 + seed * 0.13) % 1.4 - 0.2) * (w + h);
    const gr = shg.createLinearGradient(sx - h, 0, sx, h);
    gr.addColorStop(0, "rgba(205,222,255,0)");
    gr.addColorStop(0.5, "rgba(205,222,255,0.32)");
    gr.addColorStop(1, "rgba(205,222,255,0)");
    shg.fillStyle = gr;
    shg.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "lighter";
    g.drawImage(sheen, 0, 0);
    // glints: little star highlights that come and go on the steel
    lit.spots.forEach(([x, y], k) => {
      const ph = (t * 0.55 + k * 0.618 + seed * 0.1) % 1;
      const a = ph < 0.18 ? Math.sin((ph / 0.18) * Math.PI) : 0;
      if (a <= 0.01) return;
      const r = (3 + 3 * a) * Math.min(1, Math.max(0.6, Math.min(w, h) / 120));
      const rg = g.createRadialGradient(x, y, 0, x, y, r);
      rg.addColorStop(0, `rgba(255,255,255,${0.95 * a})`);
      rg.addColorStop(0.35, `rgba(210,228,255,${0.35 * a})`);
      rg.addColorStop(1, "rgba(210,228,255,0)");
      g.fillStyle = rg;
      g.fillRect(x - r, y - r, r * 2, r * 2);
      g.fillStyle = `rgba(255,255,255,${0.7 * a})`;
      g.fillRect(x - r * 1.6, y - 0.5, r * 3.2, 1);
      g.fillRect(x - 0.5, y - r * 1.6, 1, r * 3.2);
    });
    // the glow: lamps, the LED, the med cross
    if (lit.hasGlow) {
      const k = glowLevel(it.glow, t, seed);
      const [gx, gy, gr0] = lit.gc;
      if (it.glow === "flicker") {
        // the light it throws on the street
        g.globalAlpha = 0.22 * k;
        const pr = Math.max(w, h) * 0.7;
        const pg = g.createRadialGradient(gx, gy, 0, gx, gy, pr);
        pg.addColorStop(0, "rgba(255,236,190,1)");
        pg.addColorStop(1, "rgba(255,236,190,0)");
        g.fillStyle = pg;
        g.fillRect(gx - pr, gy - pr, pr * 2, pr * 2);
      }
      g.globalAlpha = Math.min(1, (it.glow === "blink" ? 0.6 : 0.25) * k);
      g.drawImage(lit.glow, 0, 0);
      g.globalAlpha = Math.min(1, k);
      g.drawImage(lit.bloom, 0, 0);
      g.drawImage(lit.bloom, 0, 0);
      if (it.glow === "blink") {
        // the LED's flare and the sensor ping
        const fr = gr0 * 6 * k;
        const fg = g.createRadialGradient(gx, gy, 0, gx, gy, fr);
        fg.addColorStop(0, `rgba(255,80,60,${0.9 * k})`);
        fg.addColorStop(1, "rgba(255,40,30,0)");
        g.globalAlpha = 1;
        g.fillStyle = fg;
        g.fillRect(gx - fr, gy - fr, fr * 2, fr * 2);
        const pp = (t % 1.2) / 1.2;
        g.strokeStyle = `rgba(255,70,50,${0.45 * (1 - pp)})`;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(gx, gy, 4 + pp * Math.max(w, h) * 0.8, 0, Math.PI * 2);
        g.stroke();
      }
      if (it.glow === "heartbeat") {
        // a scan line running down the cross, masked to it
        shg.globalCompositeOperation = "copy";
        shg.drawImage(lit.glow, 0, 0);
        shg.globalCompositeOperation = "source-in";
        const yy = gy - gr0 * 1.6 + ((t * 0.7) % 1) * gr0 * 3.2;
        const sl = shg.createLinearGradient(0, yy - 6, 0, yy + 6);
        sl.addColorStop(0, "rgba(220,255,235,0)");
        sl.addColorStop(0.5, "rgba(220,255,235,0.9)");
        sl.addColorStop(1, "rgba(220,255,235,0)");
        shg.fillStyle = sl;
        shg.fillRect(0, 0, w, h);
        g.globalAlpha = 1;
        g.drawImage(sheen, 0, 0);
      }
      g.globalCompositeOperation = "source-over";
      g.globalAlpha = 0.9;
      g.drawImage(lit.cage, 0, 0);
      g.globalAlpha = 1;
    }
    g.restore();
  };
  return { c, frame };
}

function nowCanvas(it: Item, scale: number, seed: number, onReady: () => void): HTMLCanvasElement {
  const w = Math.round(it.wM * PXM);
  const h = Math.round(it.hM * PXM);
  const cw = Math.round((w + PAD * 2) * scale);
  const chh = Math.round((h + PAD * 2) * scale);
  const c = canvas(cw, chh);
  const g = ctx(c);
  asphalt(g, cw, chh, 5 + seed);
  night(g, cw, chh, 0.3, [[cw * 0.1, chh * 0.1, Math.max(cw, chh) * 0.9]]);
  const img = new Image();
  img.onload = () => {
    g.imageSmoothingQuality = "high";
    g.drawImage(img, PAD * scale, PAD * scale, w * scale, h * scale);
    onReady();
  };
  img.src = CURRENT[it.id] ?? "";
  return c;
}

// ─────────────────────────────── page ───────────────────────────────

function fig(c: HTMLCanvasElement, cap: string): HTMLElement {
  const f = document.createElement("figure");
  f.appendChild(c);
  const fc = document.createElement("figcaption");
  fc.textContent = cap;
  f.appendChild(fc);
  return f;
}

const live: { el: HTMLCanvasElement; frame: (t: number) => void; on: boolean }[] = [];
const io = new IntersectionObserver((es) => {
  for (const e of es) {
    const l = live.find((x) => x.el === e.target);
    if (l) l.on = e.isIntersecting;
  }
});

function refCanvas(id: string, label: string): HTMLElement {
  const c = canvas(1152, 200);
  const g = ctx(c);
  asphalt(g, 1152, 200, 9);
  night(g, 1152, 200, 0.3, [[100, 20, 900]]);
  const img = new Image();
  img.onload = () => {
    const s = 1100 / img.width;
    g.imageSmoothingQuality = "high";
    g.drawImage(img, 26, 100 - (img.height * s) / 2, img.width * s, img.height * s);
  };
  img.src = CURRENT[id] ?? "";
  return fig(c, label);
}

const nowItem0 = (id: string): boolean => ITEMS.some((x) => x.id === id);

async function takes(): Promise<void> {
  const box = document.getElementById("takes") as HTMLElement;
  const ref = document.createElement("article");
  ref.className = "pair wide";
  const rh = document.createElement("h3");
  rh.textContent = "References (Meshy): what real barricades look like from a raised camera";
  ref.appendChild(rh);
  const rg = document.createElement("div");
  rg.className = "refs";
  for (const [k, cap] of [["police", "Police sawhorses"], ["police_drone", "Police, from higher"], ["wood", "Scavenged wood"], ["wood_drone", "Wood, from higher"], ["reinforced", "Reinforced + razor wire"], ["metal", "Welded metal"]] as const) {
    const f = document.createElement("figure");
    const im = document.createElement("img");
    im.src = REFS[k] ?? "";
    im.alt = cap;
    f.appendChild(im);
    const fc = document.createElement("figcaption");
    fc.textContent = cap;
    f.appendChild(fc);
    rg.appendChild(f);
  }
  ref.appendChild(rg);
  box.appendChild(ref);
  let n = 0;
  for (const grp of TAKES) {
    const h = document.createElement("h2");
    h.textContent = grp.title;
    box.appendChild(h);
    const grid = document.createElement("div");
    grid.className = "takes";
    const nowCard = document.createElement("article");
    nowCard.className = "pair";
    const nh = document.createElement("h3");
    nh.textContent = nowItem0(grp.now) ? "Today (photoreal, below)" : "Today";
    nowCard.appendChild(nh);
    const nowItem = ITEMS.find((x) => x.id === grp.now);
    if (nowItem) {
      const nl = relight(nowItem, 1700 + n);
      const na = animated(nl, nowItem, 1, n + 20);
      na.frame(0);
      nowCard.appendChild(fig(na.c, "Today"));
      live.push({ el: na.c, frame: na.frame, on: true });
      io.observe(na.c);
    } else nowCard.appendChild(refCanvas("prop_barrier_a", "Today · B1 sawhorses"));
    grid.appendChild(nowCard);
    for (const it of grp.items) {
      await new Promise((r) => setTimeout(r, 0));
      const lit = relight(it, 1500 + n * 13);
      const a = animated(lit, it, 1, n + 30);
      a.frame(0);
      const card = document.createElement("article");
      card.className = "pair";
      card.id = it.id;
      const h3 = document.createElement("h3");
      h3.textContent = it.name;
      card.appendChild(h3);
      card.appendChild(fig(a.c, "New orientation"));
      const p = document.createElement("p");
      p.textContent = it.note;
      card.appendChild(p);
      grid.appendChild(card);
      live.push({ el: a.c, frame: a.frame, on: true });
      io.observe(a.c);
      n++;
    }
    box.appendChild(grid);
  }
}

/** A closed fort of wood barricades: inside faces on the far wall, outside faces on the near wall, braces inside, corner pieces. */
/** The approved pictures, for the asset review page's export (`window.__build3`). */
const EXP: { id: string; group: string; name: string; url: string }[] = [];
function still(lit: Lit): string {
  const c = canvas(lit.w, lit.h);
  const g = ctx(c);
  g.drawImage(lit.base, 0, 0);
  if (lit.hasGlow) {
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.5;
    g.drawImage(lit.glow, 0, 0);
    g.drawImage(lit.bloom, 0, 0);
  }
  return c.toDataURL("image/png");
}

interface FortSet {
  title: string;
  caption: string;
  inside: (g: Ctx, v: number) => void;
  outside: (g: Ctx, v: number) => void;
  side: (g: Ctx, braceSide: 1 | -1, v: number) => void;
  corner: (g: Ctx, h: 1 | -1, v: 1 | -1, inside: boolean) => void;
  glow?: boolean;
}
const styleSet = (st: Style, title: string, caption: string): FortSet => ({ title, caption, inside: (g, v) => drawFrontIn(g, st, v), outside: (g, v) => drawFrontOut(g, st, v), side: (g, b, v) => drawSide(g, st, b, v), corner: (g, h, v, i) => drawCorner(g, st, h, v, i) });
const FORTS: FortSet[] = [
  styleSet("wood", "Wood barricade (approved)", "Far wall: inside face (braces, junk) · near wall: outside face (clean, rubble at its foot) · side walls: braces inside · corner pieces close every corner"),
  styleSet("rf", "Reinforced barricade", "The wood wall reinforced: rusty corrugated steel, steel straps, chains, razor wire along every top · banded posts with wire at the corners"),
  styleSet("mt", "Metal barricade", "Welded plates of uneven size: hazard bands and rust outside, angle-iron stiffeners, I-beam props inside · steel I-beam corner posts"),
  { title: "Police barricade", caption: "Sawhorses look the same from both sides, so inside and outside are just two variants · side lines show the sawhorses end-on · a traffic drum at each corner", inside: (g, v) => drawPoliceFront(g, v), outside: (g, v) => drawPoliceFront(g, v + 10), side: (g, _b, v) => drawPoliceSide(g, v), corner: (g) => drawPoliceCorner(g), glow: true },
];

async function fort(set: FortSet, box: HTMLElement, base: number): Promise<void> {
  const mk = (id: string, draw: (g: Ctx) => void, wM: number, hM: number, seed: number): Lit => relight({ ...take(id, "", draw, "x", 0, ""), wM, hM, ...(set.glow ? { emissive: amber, glow: "strobe" as const } : {}) }, seed);
  const L = {
    inside: mk("fi", (g) => set.inside(g, 1), 2, 1, base + 1),
    inside2: mk("fi2", (g) => set.inside(g, 2), 2, 1, base + 2),
    outside: mk("fo", (g) => set.outside(g, 3), 2, 1, base + 3),
    outside2: mk("fo2", (g) => set.outside(g, 4), 2, 1, base + 4),
    sideE: mk("se", (g) => set.side(g, 1, 1), 1, 2.8, base + 5),
    sideW: mk("sw", (g) => set.side(g, -1, 2), 1, 2.8, base + 6),
    NW: mk("nw", (g) => set.corner(g, 1, 1, true), 1.4, 2, base + 7),
    NE: mk("ne", (g) => set.corner(g, -1, 1, true), 1.4, 2, base + 8),
    SW: mk("sw2", (g) => set.corner(g, 1, -1, false), 1.4, 2, base + 9),
    SE: mk("se2", (g) => set.corner(g, -1, -1, false), 1.4, 2, base + 10),
  };

  await new Promise((r) => setTimeout(r, 0));
  const PX = 130;
  const W = 7.2;
  const Hm = 5.6;
  const c = canvas(Math.round(W * PX), Math.round(Hm * PX));
  const g = ctx(c);
  asphalt(g, c.width, c.height, 21);
  night(g, c.width, c.height, 0.3, [[c.width * 0.5, c.height * 0.5, c.width * 0.6]]);
  const k = PX / PXM;
  type Kind = keyof typeof L;
  // footprint centres (m): north wall y 1.25 (two pieces), south wall y 4.25, west/east walls x 1.0 / 6.0, corner squares
  const pieces: [Kind, number, number][] = [
    ["inside", 2.25, 1.25], ["inside2", 4.25, 1.25], ["NW", 1.0, 1.25], ["NE", 5.5, 1.25],
    ["sideE", 1.0, 2.75], ["sideW", 5.5, 2.75],
    ["outside", 2.25, 4.25], ["outside2", 4.25, 4.25], ["SW", 1.0, 4.25], ["SE", 5.5, 4.25],
  ];
  const near = (p: [Kind, number, number]): number => (p[0].startsWith("side") ? p[2] + 1 : p[2] + (p[0].length === 2 ? 0.01 : 0));
  for (const [key, cap] of [["inside", "front, inside"], ["outside", "front, outside"], ["sideE", "side, braces east"], ["sideW", "side, braces west"], ["NW", "corner"]] as const) EXP.push({ id: `${set.title}_${key}`, group: set.title.replace(" (approved)", ""), name: cap, url: still(L[key]) });
  for (const p of [...pieces].sort((a, b) => near(a) - near(b))) {
    const [kind, x, y] = p;
    const lit = L[kind];
    const anchorY = kind.startsWith("inside") || kind.startsWith("outside") ? 0.24 : kind.startsWith("side") ? SIDE_C : CB;
    g.drawImage(lit.base, (x + 0.35) * PX - (lit.w / 2) * k, (y + 0.35) * PX - (lit.h / 2 + anchorY * PXM) * k, lit.w * k, lit.h * k);
  }
  const card = document.createElement("article");
  card.className = "pair wide";
  const h3 = document.createElement("h3");
  h3.textContent = set.title;
  card.appendChild(h3);
  card.appendChild(fig(c, set.caption));
  const pieceRow = document.createElement("div");
  pieceRow.className = "pieces";
  const show = (lit: Lit, cap: string, s: number): HTMLElement => {
    const cc = canvas(Math.round(lit.w * s) + 30, Math.round(lit.h * s) + 30);
    const gg = ctx(cc);
    asphalt(gg, cc.width, cc.height, 22);
    night(gg, cc.width, cc.height, 0.3, []);
    gg.drawImage(lit.base, 15, 15, lit.w * s, lit.h * s);
    return fig(cc, cap);
  };
  pieceRow.appendChild(show(L.inside, "Front · inside (variant 1)", 0.5));
  pieceRow.appendChild(show(L.inside2, "Front · inside (variant 2)", 0.5));
  pieceRow.appendChild(show(L.outside, "Front · outside (variant 3)", 0.5));
  pieceRow.appendChild(show(L.outside2, "Front · outside (variant 4)", 0.5));
  pieceRow.appendChild(show(L.sideE, "Side · braces east", 0.5));
  pieceRow.appendChild(show(L.sideW, "Side · braces west", 0.5));
  pieceRow.appendChild(show(L.NW, "Corner", 0.5));
  card.appendChild(pieceRow);
  box.appendChild(card);
}

async function main(): Promise<void> {
  const fbox = document.getElementById("fort") as HTMLElement;
  for (const [i, set] of FORTS.entries()) await fort(set, fbox, 1800 + i * 40);
  await takes();
  const list = document.getElementById("list") as HTMLElement;
  for (let i = 0; i < ITEMS.length; i++) {
    const it = ITEMS[i] as Item;
    await new Promise((r) => setTimeout(r, 0));
    const lit = relight(it, 700 + i * 13);
    if (!it.id.startsWith("building_barricade")) EXP.push({ id: it.id, group: "Traps, lights and med station", name: it.name, url: still(lit) });
    const scale = it.wM >= 2 && it.hM >= 2 ? 0.5 : it.wM < 1 ? 2 : 1;
    const a = animated(lit, it, scale, i);
    a.frame(0);
    const card = document.createElement("article");
    card.className = "pair" + (it.wM >= 2 && it.hM < 1 ? " wide" : "");
    card.id = it.id;
    const h3 = document.createElement("h3");
    h3.textContent = it.name;
    card.appendChild(h3);
    const sides = document.createElement("div");
    sides.className = "sides";
    sides.appendChild(fig(nowCanvas(it, scale, i, () => undefined), "Now"));
    sides.appendChild(fig(a.c, "Photoreal"));
    card.appendChild(sides);
    const p = document.createElement("p");
    p.textContent = it.note;
    card.appendChild(p);
    list.appendChild(card);
    live.push({ el: a.c, frame: a.frame, on: true });
    io.observe(a.c);
  }
  Object.assign(window, { __build3: EXP });
  (document.getElementById("loading") as HTMLElement).remove();
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const t0 = performance.now();
  const tick = (now: number): void => {
    const t = (now - t0) / 1000;
    for (const l of live) if (l.on) l.frame(t);
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  (window as unknown as { __ready: boolean }).__ready = true;
}
void main();
