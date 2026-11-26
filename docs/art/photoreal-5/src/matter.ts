/**
 * Group 5, family "matter": acid, gas, event smoke / vapour / dust / flare, the Ruins' dust, grit and ash, the dust of a
 * placed building, rain, and the Behemoth's dust. Under the group's idea ("every effect is light or matter, and the
 * street keeps the mark"):
 * - dust, smoke, vapour, gas and rain are MATTER: lit by the one key light from the upper left (brighter on the side
 *   facing it, self-shadowed on the far side, cool tint), solid bits (grit, ash) throw a soft shadow down-right; they
 *   leave their cause, rise or fall, spread, thin out and settle (secondary follows);
 * - only acid glows (yellow-green = acid / gas / infection); gas is yellow-green but does not glow;
 * - the MARK: the acid's etched asphalt, the wet street (RN-B);
 * - the readable edges stay exactly where they are today (the acid ring is the damage edge, the gas ring is the slow edge).
 * "Now" looks replay the game's own code (frames from its `ensure…()` builders, numbers from its views).
 */
import { make, sprite, countSprite, rng, ramp, clamp01, idle, type FxCard, type Look, type Stage } from "./kit";
import { fakeScene, frameCanvas } from "./textureShim";
import { ensureAtlases, ATLAS_FX, FX_ACID_PUDDLES, FX_GLOW, FX_SPIT_GLOB, FX_GAS_CLOUDS, FX_DUST, FX_GRIT, FX_ASH, FX_RAIN, FX_SPLASH } from "../../../../apps/client/src/render/city/spriteAtlas";
import { ensureEventTextures, EVENT_ATLAS, EVENT_FRAMES, EVENT_SMOKE_RGB } from "../../../../apps/client/src/render/city/eventArt";
import { ensureBossTextures, BOSS_ATLAS } from "../../../../apps/client/src/render/city/bossAtlas";
import { litPuff, tinted, silhouette, gritChip, ashFlake, glowTex, acidGlob, wetHighlight, acidPool, acidBubble, rainStreak, rainSplash, wetPatch, flareStick } from "./matter-tex";

/* ---------------- shared ---------------- */
let gameBaked = false;
function bakeGame(): void {
  if (gameBaked) return;
  gameBaked = true;
  ensureAtlases(fakeScene);
  ensureEventTextures(fakeScene);
}
const fxf = (name: string): HTMLCanvasElement => frameCanvas(ATLAS_FX, name);
const evf = (name: string): HTMLCanvasElement => frameCanvas(EVENT_ATLAS, name);
const hex = (n: number): [number, number, number] => [(n >> 16) & 255, (n >> 8) & 255, n & 255];
const on = (st: Stage, part: string): boolean => !st.only || st.only === part;
/** A stable 0–1 per (index, channel). */
function hh(i: number, ch: number, seed = 0): number {
  let h = Math.imul(i + 1 + seed * 7919, 2654435761) ^ Math.imul(ch + 7, 1597334677);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}
/** Seamless loop of a constant emitter: calls `f(k, age)` for every particle alive at t (emitted at k / rate, mod L). */
function emitter(t: number, L: number, rate: number, cap: number, lifeMax: number, f: (k: number, age: number) => void): void {
  const n = Math.round(rate * L);
  let live = 0;
  for (let k = 0; k < n && live < cap; k++) {
    const t0 = k / rate;
    let age = t - t0;
    if (age < 0) age += L;
    if (age > lifeMax) continue;
    live++;
    f(k, age);
  }
}
/** Ring stroked like Phaser's `lineStyle + strokeCircle` (one Graphics). */
function ring(g: CanvasRenderingContext2D, x: number, y: number, rM: number, lineM: number, rgb: [number, number, number], a: number, pxm: number): void {
  if (a <= 0.003) return;
  countSprite();
  g.save();
  g.strokeStyle = `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${a})`;
  g.lineWidth = Math.max(1, lineM * pxm);
  g.beginPath();
  g.arc(x, y, rM * pxm, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}
const tex = (name: string, canvas: HTMLCanvasElement | null, note?: string): { name: string; canvas: HTMLCanvasElement; note?: string } => ({ name, canvas: canvas ?? make(1, 1), ...(note ? { note } : {}) });

/* =====================================================================================================
 * AC: Spitter acid. Game: render/AcidView.ts + acidFx.ts, frames fx_spit_glob_01, fx_acid_puddle_01/02, fx_glow
 * (shadow, tinted black). zombies.json › spitter.spit: speed 9 m/s, puddle radius 1.0 m, puddleS 3.
 * ===================================================================================================== */
const AC_FLIGHT_M = 5;
const AC_FLIGHT_S = AC_FLIGHT_M / 9;
const AC_PUDDLE_S = 3;
const GLOB_M = 0.45;
const LOB_GROW = 0.7;
const LOB_LIFT_M = 0.35;
const SHADOW_M = 0.28;
const PUDDLE_FADE_IN_S = 0.12;
const PUDDLE_FADE_OUT_S = 0.6;
/** Glob position along its path at t, and the lob (cosmetic arc, as AcidView). */
function globAt(t: number): { f: number; arc: number } {
  const f = clamp01(t / AC_FLIGHT_S);
  return { f, arc: 4 * f * (1 - f) };
}
const acNowTex: { glob?: HTMLCanvasElement; shadow?: HTMLCanvasElement; puddle?: HTMLCanvasElement } = {};
const acNow: Look = {
  code: "now",
  title: "Today",
  note: "A neon glob with a black dot for its shadow, then a flat, evenly glowing pool inside a crisp ring.",
  async bake() {
    bakeGame();
    acNowTex.glob = fxf(FX_SPIT_GLOB);
    acNowTex.shadow = silhouette(fxf(FX_GLOW), "#000");
    acNowTex.puddle = fxf(FX_ACID_PUDDLES[0] as string);
  },
  draw(g, t, st) {
    const x0 = st.cx - 3.2 * st.pxm;
    if (t < AC_FLIGHT_S) {
      const { f, arc } = globAt(t);
      const x = x0 + f * AC_FLIGHT_M * st.pxm;
      if (on(st, "shadow")) sprite(g, acNowTex.shadow!, x, st.cy, SHADOW_M, st.pxm, 0, 0.35);
      if (on(st, "glob")) sprite(g, acNowTex.glob!, x, st.cy - LOB_LIFT_M * arc * st.pxm, GLOB_M * (1 + LOB_GROW * arc), st.pxm, 0);
      return;
    }
    const age = t - AC_FLIGHT_S;
    if (age >= AC_PUDDLE_S) return;
    const a = Math.min(1, age / PUDDLE_FADE_IN_S, (AC_PUDDLE_S - age) / PUDDLE_FADE_OUT_S + 0.35);
    if (on(st, "puddle")) sprite(g, acNowTex.puddle!, x0 + AC_FLIGHT_M * st.pxm, st.cy, 2, st.pxm, 1.3, Math.max(0, a));
  },
  textures: () => [tex("fx_spit_glob_01", acNowTex.glob ?? null), tex("fx_glow (black tint: shadow)", acNowTex.shadow ?? null), tex("fx_acid_puddle_01", acNowTex.puddle ?? null, "a 2nd variant _02")],
  parts: [
    { id: "glob", label: "Glob" },
    { id: "shadow", label: "Shadow" },
    { id: "puddle", label: "Puddle" },
  ],
  frames: [
    { label: "flight", t: AC_FLIGHT_S * 0.5, when: "top of the lob" },
    { label: "splash", t: AC_FLIGHT_S + 0.06, when: "fading in" },
    { label: "lying", t: AC_FLIGHT_S + 1.5, when: "full" },
    { label: "last", t: AC_FLIGHT_S + 2.99, when: "alpha 0.35, then gone" },
  ],
};
function acTake(code: "AC-A" | "AC-B"): Look {
  const glowOn = code === "AC-A";
  const T: { glob?: HTMLCanvasElement; hi?: HTMLCanvasElement; glow?: HTMLCanvasElement; shadow?: HTMLCanvasElement; pools: HTMLCanvasElement[]; halo?: HTMLCanvasElement; bub: HTMLCanvasElement[]; splat?: HTMLCanvasElement; wisp?: HTMLCanvasElement } = { pools: [], bub: [] };
  return {
    code,
    title: glowOn ? "Glowing acid" : "Matte acid, lit edge",
    note: glowOn
      ? "A heavy, viscous glob with strings behind it and the street light on it; it lands with a splat, eats into the asphalt and bubbles. The pool glows softly (only acid glows); the damage ring stays exactly where it is."
      : "Same glob and timing, but the pool is a dark, oily liquid: only the bubbles, the meniscus and the damage ring catch the light. Reads more like a real chemical; the ring alone carries the danger edge in the dark.",
    async bake() {
      T.glob = acidGlob();
      T.hi = wetHighlight();
      T.glow = glowTex(48, "170,255,70", 0.9, 0.3);
      T.shadow = silhouette(T.glob, "rgba(0,0,0,0.5)", 2);
      await idle();
      T.pools = [acidPool(144, 3, glowOn), acidPool(144, 11, glowOn)];
      T.halo = glowTex(96, "150,240,60", 0.32, 0.16);
      T.bub = [0, 1, 2].map((f) => acidBubble(f, glowOn));
      T.splat = acidBubble(1, glowOn);
      T.wisp = tinted(litPuff(48, 33, { rag: 0.7, scale: 2.6, alpha: 0.5 }), [190, 200, 150]);
    },
    draw(g, t, st) {
      const x0 = st.cx - 3.2 * st.pxm;
      const px = st.pxm;
      if (t < AC_FLIGHT_S) {
        const { f, arc } = globAt(t);
        const x = x0 + f * AC_FLIGHT_M * px;
        const y = st.cy - LOB_LIFT_M * arc * px;
        const s = GLOB_M * (1 + LOB_GROW * arc) * 1.25;
        // shadow on the street: further down-right and softer at the top of the lob
        if (on(st, "shadow")) sprite(g, T.shadow!, x + (0.06 + arc * 0.12) * px, st.cy + (0.08 + arc * 0.16) * px, s * (1 - 0.25 * arc), px, 0, 0.55 - 0.2 * arc);
        if (on(st, "glow") && glowOn) sprite(g, T.glow!, x, y, 0.7, px, 0, 0.55, true);
        if (on(st, "glob")) sprite(g, T.glob!, x - 0.08 * px, y, s, px, 0);
        if (on(st, "highlight")) sprite(g, T.hi!, x + 0.0 * px, y - 0.05 * px, 0.11, px, 0, 0.9);
        return;
      }
      const age = t - AC_FLIGHT_S;
      if (age >= AC_PUDDLE_S + 0.25) return;
      const px0 = x0 + AC_FLIGHT_M * px;
      const pool = T.pools[st.seed % 2] as HTMLCanvasElement;
      // fade: in 0.12 s, out over the last 0.6 s to 0 (no pop), the ring last; spreading 0.85 → 1 of the liquid in 0.15 s
      const fadeOut = clamp01((AC_PUDDLE_S - age) / PUDDLE_FADE_OUT_S);
      const a = Math.min(1, age / PUDDLE_FADE_IN_S) * (age < AC_PUDDLE_S ? Math.max(0.0, fadeOut) : 0);
      const spread = 0.9 + 0.1 * ramp(age, 0, 0.15);
      // not rotated: the street light's reflection in it must stay upper-left (the variant changes per puddle instead)
      if (on(st, "pool") && a > 0) sprite(g, pool, px0, st.cy, 2 * spread, px, 0, a);
      if (on(st, "glow") && glowOn && a > 0) sprite(g, T.halo!, px0, st.cy, 2.0, px, 0, 0.8 * a * (0.85 + 0.15 * Math.sin(age * 5)), true);
      // the splat: drops thrown forward, settling within 0.25 s (matter flies, then the mark)
      if (on(st, "splat") && age < 0.3) {
        const u = age / 0.3;
        for (let k = 0; k < 4; k++) {
          const ang = -0.8 + 1.6 * hh(k, 1, st.seed);
          const d = (0.45 + 0.5 * hh(k, 2, st.seed)) * Math.min(1, u * 2.2);
          sprite(g, T.splat!, px0 + Math.cos(ang) * d * px, st.cy + Math.sin(ang) * d * px, 0.16 * (1 - 0.4 * u), px, 0, 1 - u);
        }
      }
      // bubbles: each 0.7 s cycle grows, swells, pops (seeded spots inside the liquid)
      if (on(st, "bubbles") && a > 0.05) {
        const nb = st.low ? 2 : 4;
        for (let k = 0; k < nb; k++) {
          const ph = (age * 1.4 + hh(k, 3)) % 1;
          const fr = ph < 0.45 ? 0 : ph < 0.85 ? 1 : 2;
          const ang = hh(k, 4) * Math.PI * 2;
          const d = 0.15 + 0.5 * hh(k, 5);
          sprite(g, T.bub[fr] as HTMLCanvasElement, px0 + Math.cos(ang) * d * px, st.cy + Math.sin(ang) * d * px, 0.17, px, 0, a * (fr === 2 ? 1 - (ph - 0.85) / 0.15 : 0.95));
        }
      }
      // fumes: a few thin wisps rising and drifting (matter, does not glow)
      if (on(st, "fumes") && a > 0.05) {
        const nw = st.low ? 2 : 4;
        for (let k = 0; k < nw; k++) {
          const ph = (age * 0.55 + k / nw) % 1;
          sprite(g, T.wisp!, px0 + (hh(k, 6) - 0.5) * 1.0 * px + ph * 0.25 * px, st.cy + (hh(k, 7) - 0.5) * 0.8 * px - ph * 0.5 * px, 0.45 + 0.5 * ph, px, 0, a * 0.35 * Math.sin(Math.PI * ph));
        }
      }
    },
    textures: () => [tex("acid_glob", T.glob ?? null), tex("acid_glob_shadow", T.shadow ?? null), tex("wet_highlight", T.hi ?? null), ...(glowOn ? [tex("acid_glow (ADD, cropped)", T.glow ?? null), tex("acid_halo (ADD)", T.halo ?? null)] : []), tex("acid_pool_a", T.pools[0] ?? null), tex("acid_pool_b", T.pools[1] ?? null), ...T.bub.map((b, i) => tex(`acid_bubble_${i}`, b)), tex("acid_drop (= bubble 1)", T.splat ?? null), tex("acid_fume (shared puff, tinted)", T.wisp ?? null)],
    parts: [
      { id: "glob", label: "Glob" },
      { id: "highlight", label: "Highlight" },
      { id: "shadow", label: "Shadow" },
      ...(glowOn ? [{ id: "glow", label: "Glow (ADD)" }] : []),
      { id: "splat", label: "Splat drops" },
      { id: "pool", label: "Pool + mark + ring" },
      { id: "bubbles", label: "Bubbles" },
      { id: "fumes", label: "Fumes" },
    ],
    frames: [
      { label: "flight", t: AC_FLIGHT_S * 0.5, when: "top of the lob" },
      { label: "splat", t: AC_FLIGHT_S + 0.06, when: "landing" },
      { label: "lying", t: AC_FLIGHT_S + 1.5, when: "bubbling" },
      { label: "fading", t: AC_FLIGHT_S + 2.75, when: "last 0.6 s" },
    ],
  };
}

/* =====================================================================================================
 * GA: the Bloater's gas cloud. Game: render/BloaterView.ts (two fog discs fx_gascloud_a/b, alpha 0.42 / 0.22,
 * counter-rotating at 0.05 / 0.08 rad/s, the gas edge ring), bloaterFx.ts (fade in 0.25 s, out over the last 1 s),
 * zombies.json › bloater: gasRadiusM 2.5, gasS 4.0. The burst itself (flash, shock ring, drops) is the fire family's BX.
 * ===================================================================================================== */
const GAS_R = 2.5;
const GAS_S = 4;
const gasAlpha = (t: number): number => (t < 0 || t >= GAS_S ? 0 : t < 0.25 ? t / 0.25 : Math.min(1, (GAS_S - t) / 1));
const GAS_EDGE: [number, number, number] = [0xcd, 0xe1, 0x78];
const gaNowT: { a?: HTMLCanvasElement; b?: HTMLCanvasElement } = {};
const gaNow: Look = {
  code: "now",
  title: "Today",
  note: "Two flat noise discs turning slowly in opposite directions, with a thin yellow-green edge ring.",
  async bake() {
    bakeGame();
    gaNowT.a = fxf(FX_GAS_CLOUDS[0] as string);
    gaNowT.b = fxf(FX_GAS_CLOUDS[1] as string);
  },
  draw(g, t, st) {
    const a = gasAlpha(t);
    if (a <= 0) return;
    if (on(st, "layers")) {
      sprite(g, gaNowT.a!, st.cx, st.cy, 2 * GAS_R, st.pxm, 1.7 + t * 0.05, 0.42 * a);
      sprite(g, gaNowT.b!, st.cx, st.cy, 2 * GAS_R, st.pxm, 0.9 - t * 0.08, 0.22 * a);
    }
    if (on(st, "edge")) ring(g, st.cx, st.cy, GAS_R, 0.045, GAS_EDGE, 0.45 * a, st.pxm);
  },
  textures: () => [tex("fx_gascloud_a", gaNowT.a ?? null), tex("fx_gascloud_b", gaNowT.b ?? null)],
  parts: [
    { id: "layers", label: "Fog discs" },
    { id: "edge", label: "Edge ring" },
  ],
  frames: [
    { label: "in", t: 0.12, when: "fading in" },
    { label: "full", t: 1.5, when: "full" },
    { label: "out", t: 3.5, when: "last second" },
  ],
};
const gaT: { a?: HTMLCanvasElement; b?: HTMLCanvasElement; wisp?: HTMLCanvasElement } = {};
const gaA: Look = {
  code: "GA-A",
  title: "Rolling, lit gas",
  note: "Heavy gas that rolls out from the burst, denser and lit on top, shadowed down-right, with curling wisps at its rim. Yellow-green but not glowing. The slow edge ring stays where it is, a little softer.",
  async bake() {
    const col: [number, number, number] = [0.74, 0.8, 0.42];
    gaT.a = litPuff(192, 5, { fill: 0.78, rag: 0.35, scale: 2.6, alpha: 0.85, rgb: col, shade: 2.2 });
    await idle();
    gaT.b = litPuff(192, 13, { fill: 0.7, rag: 0.5, scale: 4.2, alpha: 0.7, rgb: [0.8, 0.86, 0.46], shade: 2.6 });
    gaT.wisp = litPuff(64, 17, { rag: 0.65, scale: 2.4, alpha: 0.75, rgb: col, shade: 2 });
  },
  draw(g, t, st) {
    const a = gasAlpha(t);
    if (a <= 0) return;
    // roll-out: the cloud reaches the edge in 0.35 s (it is full size for the sim at once; the ring shows the edge)
    const roll = 0.7 + 0.3 * ramp(t, 0, 0.35);
    if (on(st, "layers")) {
      sprite(g, gaT.a!, st.cx, st.cy, 2 * GAS_R * 1.02 * roll, st.pxm, 1.7 + t * 0.05, 0.62 * a);
      sprite(g, gaT.b!, st.cx, st.cy, 2 * GAS_R * 0.92 * roll, st.pxm, 0.9 - t * 0.08, 0.38 * a);
    }
    if (on(st, "wisps")) {
      const n = st.low ? 4 : 8;
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2 + t * 0.12 * (k % 2 ? 1 : -1) + hh(k, 1) * 0.6;
        const r = GAS_R * (0.82 + 0.1 * Math.sin(t * 1.3 + k)) * roll;
        sprite(g, gaT.wisp!, st.cx + Math.cos(ang) * r * st.pxm, st.cy + Math.sin(ang) * r * st.pxm, 1.1 + 0.2 * Math.sin(t * 0.9 + k * 2), st.pxm, ang + t * 0.2, 0.45 * a);
      }
    }
    if (on(st, "edge")) ring(g, st.cx, st.cy, GAS_R, 0.04, GAS_EDGE, 0.4 * a, st.pxm);
  },
  textures: () => [tex("gas_layer_a", gaT.a ?? null), tex("gas_layer_b", gaT.b ?? null), tex("gas_wisp", gaT.wisp ?? null)],
  parts: [
    { id: "layers", label: "Gas layers" },
    { id: "wisps", label: "Rim wisps" },
    { id: "edge", label: "Edge ring" },
  ],
  frames: [
    { label: "roll", t: 0.15, when: "rolling out" },
    { label: "full", t: 1.5, when: "full" },
    { label: "out", t: 3.5, when: "last second" },
  ],
};

/* =====================================================================================================
 * EV: event smoke, vapour, dust and the flare. Game: render/EventPickupsView.ts (gas leak vapour 22/s, life 2.2 s × 0.7–1.2,
 * puff 1.4 m × (0.5 + 1.3 u), alpha 0.7 (1 − u); supply flare 0.6 × 0.3 m and its green smoke 16/s, life 3 s, drift
 * (0.35, −0.3) m/s, 1.68 m, alpha 0.75), render/EventView.ts (stampede dust 24/s, life 1.6 s, 2.2 m × (0.6 + 0.8 u),
 * alpha 0.7 (1 − u)); events.json › fx caps 48 / 48 / 64. The three are shown side by side (left vapour, middle flare,
 * right stampede dust running to the right).
 * ===================================================================================================== */
const EV_L = 4;
const SMOKE_RGB = EVENT_SMOKE_RGB.split(",").map(Number) as [number, number, number];
interface EvTex {
  vapour: HTMLCanvasElement[];
  smoke: HTMLCanvasElement[];
  dust: HTMLCanvasElement[];
  flare?: HTMLCanvasElement;
  light?: HTMLCanvasElement;
  grit?: HTMLCanvasElement;
}
function evDraw(T: EvTex, take: boolean, g: CanvasRenderingContext2D, t: number, st: Stage): void {
  const px = st.pxm;
  const vx0 = st.cx - 4 * px;
  const fx0 = st.cx - 0.6 * px;
  const dx0 = st.cx + 2.0 * px;
  const k2 = st.low ? 0.5 : 1;
  // gas leak vapour: from the tank's fill cap, up-left (GL1)
  if (on(st, "vapour"))
    emitter(t, EV_L, 22 * k2, 48, 2.64, (k, age) => {
      const life = 2.2 * (0.7 + hh(k, 1) * 0.5);
      if (age >= life) return;
      const u = age / life;
      const ang = hh(k, 2) * 1.2 - 0.6 - Math.PI * 0.7;
      const sp = 0.6 + hh(k, 3);
      // take: the jet slows as it spreads (gas leaves fast, then hangs)
      const dist = take ? sp * life * (1 - Math.pow(1 - u, 2)) * 0.6 : sp * age;
      const s = 1.4 * (0.5 + u * 1.3) * (take ? 0.9 : 1);
      const x = vx0 + (Math.cos(ang) * dist + (hh(k, 4) - 0.5) * 0.2) * px;
      const y = st.cy + 0.6 * px + (Math.sin(ang) * dist + (hh(k, 5) - 0.5) * 0.2) * px;
      sprite(g, T.vapour[k % T.vapour.length] as HTMLCanvasElement, x, y, s, px, take ? hh(k, 6) * 6 : 0, (take ? 0.6 : 0.7) * (1 - u) * (take ? Math.min(1, u * 8) : 1));
    });
  // supply flare + its green smoke (SD2)
  if (on(st, "flare")) {
    if (take) {
      const fl = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3);
      sprite(g, T.light!, fx0 + 0.25 * px, st.cy + 0.6 * px, 2.4, px, 0, 0.32 * fl, true);
      sprite(g, T.flare!, fx0, st.cy + 0.6 * px, 0.6, px, -0.35, 1);
      sprite(g, T.light!, fx0 + 0.25 * px, st.cy + 0.52 * px, 0.35, px, 0, 0.9 * fl, true);
    } else sprite(g, T.flare!, fx0, st.cy + 0.6 * px, 0.6, px, 0, 1, false, 0.3);
  }
  if (on(st, "smoke"))
    emitter(t, EV_L, 16 * k2, 48, 3.6, (k, age) => {
      const life = 3 * (0.7 + hh(k, 7) * 0.5);
      if (age >= life) return;
      const u = age / life;
      const vx = 0.35 + (hh(k, 8) - 0.5) * 0.4;
      const vy = -0.3 + (hh(k, 9) - 0.5) * 0.4;
      // take: rises fast off the flare then bends with the wind (smoke is matter: it slows and spreads)
      const lift = take ? 0.5 * (1 - Math.pow(1 - Math.min(1, u * 2), 2)) : 0;
      const x = fx0 + 0.3 * px + vx * age * px;
      const y = st.cy + 0.55 * px + (vy * age - lift) * px;
      const s = 1.68 * (0.5 + u * 1.3) * (take ? 0.85 + 0.3 * hh(k, 10) : 1);
      sprite(g, T.smoke[k % T.smoke.length] as HTMLCanvasElement, x, y, s, px, take ? hh(k, 11) * 6 + age * 0.3 : 0, (take ? 0.85 : 0.75) * (1 - u) * (take ? Math.min(1, u * 10) : 1));
    });
  // stampede dust: puffs at the lane's start edge, thrown along the run (ST1)
  if (on(st, "dust"))
    emitter(t, EV_L, 24 * k2, 64, 1.6, (k, age) => {
      const u = age / 1.6;
      const lat = (hh(k, 12) - 0.5) * 2.4;
      const at = hh(k, 13) * 1.2;
      const vx = 0.4 + hh(k, 14) * 0.8;
      const vy = (hh(k, 15) - 0.5) * 0.4;
      const x = dx0 + (at + vx * age) * px;
      const y = st.cy + (lat + vy * age) * px;
      const s = 2.2 * (0.6 + u * 0.8) * (take ? 0.8 : 1);
      sprite(g, T.dust[k % T.dust.length] as HTMLCanvasElement, x, y, s, px, take ? hh(k, 16) * 6 : 0, (take ? 0.6 : 0.7) * (1 - u) * (take ? Math.min(1, u * 6) : 1));
    });
  if (take && on(st, "grit"))
    emitter(t, EV_L, 10 * k2, 24, 0.6, (k, age) => {
      const u = age / 0.6;
      const lat = (hh(k, 17) - 0.5) * 2.4;
      const x = dx0 + (hh(k, 18) * 1.0 + (1.2 + hh(k, 19)) * age) * px;
      const y = st.cy + lat * px - Math.sin(Math.PI * u) * 0.25 * px;
      sprite(g, T.grit!, x, y, 0.08, px, age * 9 + k, 1 - u * u);
    });
}
const evNowT: EvTex = { vapour: [], smoke: [], dust: [] };
const evNow: Look = {
  code: "now",
  title: "Today",
  note: "Flat round puffs that grow and fade: yellow-green vapour, green flare smoke, brown stampede dust. The flare is a dark bar with a green dot.",
  async bake() {
    bakeGame();
    evNowT.vapour = [evf(EVENT_FRAMES.vapour)];
    evNowT.smoke = [evf(EVENT_FRAMES.smoke)];
    evNowT.dust = [evf(EVENT_FRAMES.dust0), evf(EVENT_FRAMES.dust1), evf(EVENT_FRAMES.dust2)];
    evNowT.flare = evf(EVENT_FRAMES.flare);
  },
  draw: (g, t, st) => evDraw(evNowT, false, g, t, st),
  textures: () => [tex("event_vapour_a", evNowT.vapour[0] ?? null), tex("event_smoke_a", evNowT.smoke[0] ?? null), ...evNowT.dust.map((d, i) => tex(`event_dust_${"abc"[i]}`, d)), tex("event_flare_a", evNowT.flare ?? null)],
  parts: [
    { id: "vapour", label: "Gas leak vapour" },
    { id: "flare", label: "Flare" },
    { id: "smoke", label: "Flare smoke" },
    { id: "dust", label: "Stampede dust" },
  ],
  frames: [
    { label: "a", t: 0.5, when: "steady emission" },
    { label: "b", t: 1.0, when: "0.5 s later" },
  ],
};
const evAT: EvTex = { vapour: [], smoke: [], dust: [] };
const evA: Look = {
  code: "EV-A",
  title: "Real vapour, signal smoke and dust",
  note: "Same emitters, rates and colours (yellow-green gas, the approved green signal smoke, warm dust), drawn as lit billows: bright on the side facing the light, shadowed on the far side. The gas jet leaves fast and hangs; the smoke rises off the flare and then bends with the wind; the dust kicks grit. The flare burns: a white-hot green head with a small pool of green light.",
  async bake() {
    evAT.vapour = [1, 2].map((s) => litPuff(64, 40 + s, { rag: 0.55, scale: 2.4, alpha: 0.7, rgb: [0.86, 0.9, 0.48], shade: 1.6 }));
    await idle();
    const sm: [number, number, number] = [SMOKE_RGB[0] / 255 + 0.12, SMOKE_RGB[1] / 255, SMOKE_RGB[2] / 255 + 0.08];
    evAT.smoke = [1, 2, 3].map((s) => litPuff(72, 50 + s, { rag: 0.6, scale: 2.3, alpha: 0.85, rgb: sm, shade: 2.2 }));
    await idle();
    evAT.dust = [1, 2, 3].map((s) => litPuff(64, 60 + s, { rag: 0.5, scale: 2.6, alpha: 0.75, rgb: [0.72, 0.62, 0.5], shade: 1.8 }));
    evAT.flare = flareStick();
    evAT.light = glowTex(64, "120,255,140", 0.9, 0.3);
    evAT.grit = tinted(gritChip(7), [176, 150, 120]);
  },
  draw: (g, t, st) => evDraw(evAT, true, g, t, st),
  textures: () => [...evAT.vapour.map((v, i) => tex(`event_vapour_${i}`, v)), ...evAT.smoke.map((v, i) => tex(`event_smoke_${i}`, v)), ...evAT.dust.map((v, i) => tex(`event_dust_${i}`, v)), tex("event_flare", evAT.flare ?? null), tex("flare_light (ADD, cropped)", evAT.light ?? null), tex("grit (shared chip, tinted)", evAT.grit ?? null)],
  parts: [
    { id: "vapour", label: "Gas leak vapour" },
    { id: "flare", label: "Flare + light" },
    { id: "smoke", label: "Flare smoke" },
    { id: "dust", label: "Stampede dust" },
    { id: "grit", label: "Kicked grit" },
  ],
  frames: [
    { label: "a", t: 0.5, when: "steady emission" },
    { label: "b", t: 1.0, when: "0.5 s later" },
  ],
};

/* =====================================================================================================
 * RD: the Ruins' dust, grit and ash. Game: render/city/DustView.ts (a puff = 3 smoke fx_dust_a, 0.8 m × (1 + 1.4 u), life
 * 1.8 s, alpha 0.5 sin(π min(1, 1.4 u)) (1 − u), drift + 0.15 m/s down; 8 grit fx_grit_a 0.06 m, life 1.1 s, a fall from
 * 2 m × 0.3, spin 6 rad/s; tint = the Ruins material's dust colour), decay.json › ruins (a puff every 0.6–1.6 s, caps 40
 * smoke / 60 grit, ?fx=low halves); render/city/CityView.ts (CO3 ash: the rain pool, fx_ash_a 0.07 × 0.045 m, speed
 * × 0.08, drift 0.6 m/s, alpha 0.55, tint b8b2a8). The ash only falls in a CO3 collapse; shown here over the same street.
 * ===================================================================================================== */
const RD_TINT: [number, number, number] = [184, 176, 160];
const ASH_TINT: [number, number, number] = hex(0xb8b2a8);
function rdDraw(T: { smoke: HTMLCanvasElement[]; grit: HTMLCanvasElement[]; ash: HTMLCanvasElement[]; block?: HTMLCanvasElement }, take: boolean, g: CanvasRenderingContext2D, t: number, st: Stage): void {
  const px = st.pxm;
  const ox = st.cx;
  const oy = st.cy;
  if (on(st, "smoke"))
    for (let k = 0; k < 3; k++) {
      const age = t;
      if (age >= 1.8) break;
      const u = age / 1.8;
      const vx = (hh(k, 1, st.seed) - 0.3) * 0.3;
      const x = ox + ((hh(k, 2, st.seed) - 0.5) * 0.6 + vx * age) * px;
      const y = oy + ((hh(k, 3, st.seed) - 0.5) * 0.4 + 0.15 * age) * px;
      const size = 0.8 * (1 + 1.4 * u);
      const a = 0.5 * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u);
      sprite(g, T.smoke[k % T.smoke.length] as HTMLCanvasElement, x, y, take ? size * 1.1 : size, px, take ? hh(k, 4, st.seed) * 6 + age * 0.25 : 0, take ? Math.min(1, a * 1.5) : a);
    }
  if (on(st, "grit"))
    for (let k = 0; k < (st.low ? 4 : 8); k++) {
      const age = t - (take ? hh(k, 9, st.seed) * 0.15 : 0);
      if (age < 0 || age >= 1.1) continue;
      const u = age / 1.1;
      const gx = ox + (hh(k, 5, st.seed) - 0.5) * 0.5 * px;
      const gy = oy + (hh(k, 6, st.seed) - 0.5) * 0.3 * px;
      const vx = (hh(k, 7, st.seed) - 0.5) * 0.6;
      if (take) {
        // a real fall: accelerates down (toward its landing point "up the screen"), one small bounce, then rests and fades
        const fall = Math.min(1, age / 0.45);
        const lift = 0.6 * (1 - fall * fall) + (age > 0.45 && age < 0.65 ? Math.sin(((age - 0.45) / 0.2) * Math.PI) * 0.05 : 0);
        const x = gx + vx * Math.min(age, 0.65) * 0.3 * px;
        sprite(g, T.grit[k % T.grit.length] as HTMLCanvasElement, x, gy - lift * px, 0.08, px, Math.min(age, 0.65) * 6 + k, age < 0.75 ? 1 : 1 - (age - 0.75) / 0.35);
      } else {
        const lift = 2 * (1 - u) * (1 - u) * 0.3;
        sprite(g, T.grit[0] as HTMLCanvasElement, gx + vx * age * 0.3 * px, gy - lift * px, 0.06, px, age * 6, 1 - u);
      }
    }
  if (on(st, "ash")) {
    const n = st.low ? 6 : 12;
    const W = st.w / px + 2;
    const H = st.h / px + 2;
    for (let i = 0; i < n; i++) {
      const sp = (12 + hh(i, 20) * 6) * 0.08;
      const yOff = (hh(i, 21) * H + t * sp) % H;
      const xOff = (((hh(i, 22) * W + Math.sin(t * 0.8 + i) * 0.4 + t * 0.6) % W) + W) % W;
      const x = (xOff - 1) * px;
      const y = (yOff - 1) * px;
      if (take) {
        const tumble = Math.cos(t * (1.5 + hh(i, 23)) + i);
        const fr = Math.abs(tumble) < 0.35 ? 1 : 0;
        // the flake's shadow on the street (it is a solid bit): down-right, soft
        sprite(g, T.ash[2] as HTMLCanvasElement, x + 0.05 * px, y + 0.08 * px, 0.07, px, i, 0.25);
        sprite(g, T.ash[fr] as HTMLCanvasElement, x, y, 0.08, px, i + t * 0.4, 0.75, false, 0.06 * Math.max(0.35, Math.abs(tumble)));
      } else sprite(g, T.ash[0] as HTMLCanvasElement, x, y, 0.07, px, 0, 0.55, false, 0.045);
    }
  }
}
const rdNowT: { smoke: HTMLCanvasElement[]; grit: HTMLCanvasElement[]; ash: HTMLCanvasElement[] } = { smoke: [], grit: [], ash: [] };
const rdNow: Look = {
  code: "now",
  title: "Today",
  note: "Three soft round blobs grow and fade; eight white squares (tinted) drop from above; ash is a flat grey dot.",
  async bake() {
    bakeGame();
    rdNowT.smoke = [tinted(fxf(FX_DUST), RD_TINT)];
    rdNowT.grit = [tinted(fxf(FX_GRIT), RD_TINT)];
    rdNowT.ash = [tinted(fxf(FX_ASH), ASH_TINT)];
  },
  draw: (g, t, st) => rdDraw(rdNowT, false, g, t, st),
  textures: () => [tex("fx_dust_a (tinted)", rdNowT.smoke[0] ?? null, "shared with the Behemoth's dust (9.15)"), tex("fx_grit_a (tinted)", rdNowT.grit[0] ?? null), tex("fx_ash_a (tinted)", rdNowT.ash[0] ?? null)],
  parts: [
    { id: "smoke", label: "Dust puffs" },
    { id: "grit", label: "Grit" },
    { id: "ash", label: "Ash (CO3)" },
  ],
  frames: [
    { label: "puff", t: 0.2, when: "grit falling" },
    { label: "spread", t: 0.7, when: "grit landed" },
    { label: "thin", t: 1.4, when: "fading" },
  ],
};
/** RD-A's dust texture is the NEW fx_dust_a: neutral and lit, so the game's tint still colours it (shared with BD). */
const dustLit: HTMLCanvasElement[] = [];
async function bakeDustLit(): Promise<void> {
  if (dustLit.length) return;
  for (const s of [1, 2, 3]) {
    dustLit.push(litPuff(80, 70 + s, { rag: 0.55, scale: 2.5, alpha: 0.85, shade: 2.0 }));
    await idle();
  }
}
const rdAT: { smoke: HTMLCanvasElement[]; grit: HTMLCanvasElement[]; ash: HTMLCanvasElement[] } = { smoke: [], grit: [], ash: [] };
const rdA: Look = {
  code: "RD-A",
  title: "Lit dust, falling chips, tumbling ash",
  note: "The puffs are billows of dust lit from the upper left (three variants, still tinted by the Ruins material in the game). The grit is real chips with their own shadow that fall, bounce once and rest before fading. Ash flakes tumble (face, edge, face) and cast a faint shadow.",
  async bake() {
    await bakeDustLit();
    rdAT.smoke = dustLit.map((d) => tinted(d, RD_TINT));
    rdAT.grit = [3, 5, 9].map((s) => tinted(gritChip(s), RD_TINT));
    rdAT.ash = [tinted(ashFlake(false, 2), ASH_TINT), tinted(ashFlake(true, 2), ASH_TINT), silhouette(ashFlake(false, 2), "rgba(0,0,0,0.6)", 1)];
  },
  draw: (g, t, st) => rdDraw(rdAT, true, g, t, st),
  textures: () => [...dustLit.map((d, i) => tex(`fx_dust_${"abc"[i]} (neutral, lit)`, d, "tinted in the game; shared with BD")), ...rdAT.grit.map((d, i) => tex(`fx_grit_${"abc"[i]}`, d)), tex("fx_ash_face", rdAT.ash[0] ?? null), tex("fx_ash_edge", rdAT.ash[1] ?? null), tex("fx_ash_shadow", rdAT.ash[2] ?? null)],
  parts: [
    { id: "smoke", label: "Dust puffs" },
    { id: "grit", label: "Grit" },
    { id: "ash", label: "Ash (CO3)" },
  ],
  frames: [
    { label: "puff", t: 0.2, when: "grit falling" },
    { label: "bounce", t: 0.55, when: "grit bounces" },
    { label: "spread", t: 0.9, when: "grit resting" },
    { label: "thin", t: 1.4, when: "fading" },
  ],
};

/* =====================================================================================================
 * PD: the dust when a building is placed. Game: render/PlaceFxView.ts (one Graphics: fillCircle per particle, colour
 * a89c88), placeFxPools.ts › DustPool, placeFeel.ts: 8 per puff from the footprint's edge, speed 0.7 m/s slowing to 0,
 * radius 0.12 → 0.05 m, alpha 0.7 (1 − t), life 0.4 s; cap controls.json › fx.maxPlaceDust 64.
 * ===================================================================================================== */
const PD_COL: [number, number, number] = hex(0xa89c88);
const PD_W = 2;
const PD_H = 1;
function pdParticles(st: Stage, t: number, f: (x: number, y: number, k: number, u: number, dx: number, dy: number) => void): void {
  const hw = PD_W / 2;
  const hh2 = PD_H / 2;
  const spin = ((st.seed * 0.618034) % 1) * ((2 * Math.PI) / 8);
  for (let k = 0; k < 8; k++) {
    const a = spin + (k * 2 * Math.PI) / 8;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const s = Math.min(Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : Infinity, Math.abs(dy) > 1e-6 ? hh2 / Math.abs(dy) : Infinity);
    const u = Math.min(1, t / 0.4);
    // distance travelled with v = 0.7 (1 − age / life): 0.7 (t − t² / (2 L))
    const tt = Math.min(t, 0.4);
    const d = 0.7 * (tt - (tt * tt) / 0.8);
    f(dx * s + dx * d, dy * s + dy * d, k, u, dx, dy);
  }
}
function footprint(g: CanvasRenderingContext2D, _t: number, st: Stage): void {
  g.save();
  g.strokeStyle = "rgba(220,214,200,0.25)";
  g.setLineDash([4, 4]);
  g.lineWidth = 1;
  g.strokeRect(st.cx - (PD_W / 2) * st.pxm, st.cy - (PD_H / 2) * st.pxm, PD_W * st.pxm, PD_H * st.pxm);
  g.restore();
}
const pdNow: Look = {
  code: "now",
  title: "Today",
  note: "Eight flat beige dots fly out from the footprint's edge and shrink as they fade (0.4 s).",
  async bake() {},
  draw(g, t, st) {
    if (t >= 0.4 || !on(st, "dust")) return;
    countSprite();
    g.save();
    pdParticles(st, t, (x, y, _k, u) => {
      g.fillStyle = `rgba(${PD_COL[0]},${PD_COL[1]},${PD_COL[2]},${0.7 * (1 - u)})`;
      g.beginPath();
      g.arc(st.cx + x * st.pxm, st.cy + y * st.pxm, (0.12 + (0.05 - 0.12) * u) * st.pxm, 0, Math.PI * 2);
      g.fill();
    });
    g.restore();
  },
  textures: () => [],
  parts: [{ id: "dust", label: "Dust dots" }],
  frames: [
    { label: "out", t: 0.05, when: "just placed" },
    { label: "mid", t: 0.2, when: "flying out" },
    { label: "end", t: 0.38, when: "almost gone" },
  ],
};
const pdAT: { dust: HTMLCanvasElement[]; grit?: HTMLCanvasElement } = { dust: [] };
const pdA: Look = {
  code: "PD-A",
  title: "A puff of real dust",
  note: "The same 8 puffs, 0.4 s, from the same edge, but they GROW as they spread and thin out (dust billows; today's dots shrink), drawn with the shared lit dust picture, plus two chips knocked out where the piece lands.",
  async bake() {
    await bakeDustLit();
    pdAT.dust = dustLit.map((d) => tinted(d, PD_COL));
    pdAT.grit = tinted(gritChip(12), PD_COL);
  },
  draw(g, t, st) {
    if (t >= 0.5) return;
    const px = st.pxm;
    if (on(st, "dust") && t < 0.4)
      pdParticles(st, t, (x, y, k, u) => {
        sprite(g, pdAT.dust[k % 3] as HTMLCanvasElement, st.cx + x * px, st.cy + y * px, 0.3 + 0.35 * u, px, k * 1.3 + u * 0.5, 0.75 * (1 - u) * Math.min(1, u * 8 + 0.3));
      });
    if (on(st, "grit") && !st.low)
      for (let k = 0; k < 2; k++) {
        const u = Math.min(1, t / 0.5);
        const dx = k ? 1 : -1;
        const x = st.cx + dx * (PD_W / 2 + 0.35 * Math.sqrt(u)) * px;
        const y = st.cy + (0.2 * (k ? 1 : -0.5)) * px - Math.sin(Math.PI * Math.min(1, u * 1.2)) * 0.12 * px;
        sprite(g, pdAT.grit!, x, y, 0.07, px, u * 8 * dx, t < 0.35 ? 1 : 1 - (t - 0.35) / 0.15);
      }
  },
  textures: () => [...pdAT.dust.map((d, i) => tex(`fx_dust_${"abc"[i]} (shared, tinted a89c88)`, d)), tex("grit (shared chip)", pdAT.grit ?? null)],
  parts: [
    { id: "dust", label: "Dust puffs" },
    { id: "grit", label: "Chips" },
  ],
  frames: [
    { label: "out", t: 0.05, when: "just placed" },
    { label: "mid", t: 0.2, when: "spreading" },
    { label: "end", t: 0.38, when: "thin" },
  ],
};

/* =====================================================================================================
 * RN: rain and splashes. Game: render/city/CityView.ts (pool 128, 0.4 drops / m² × the stage's rain level, fx_rain_a
 * 0.035 × 0.45 m slanted 0.22, 12–18 m/s, alpha 0.28 (× 0.35 in a blackout, rainLook.ts); splashes: 16 × level, fx_splash_a
 * ellipse growing to 0.45 m wide, alpha (1 − phase) 0.5, 1.6 per second each). Shown at level 1 (stage 3 heavy rain).
 * ===================================================================================================== */
const RAIN_SLANT = 0.22;
function rnDraw(T: { drop?: HTMLCanvasElement; splash: HTMLCanvasElement[]; wet: HTMLCanvasElement[] }, take: number, g: CanvasRenderingContext2D, t: number, st: Stage): void {
  const px = st.pxm;
  const vw = st.w / px;
  const vh = st.h / px;
  if (take === 2 && on(st, "wet")) {
    sprite(g, T.wet[0] as HTMLCanvasElement, st.w * 0.3, st.h * 0.62, 3.2, px, 0, 0.9);
    sprite(g, T.wet[1] as HTMLCanvasElement, st.w * 0.74, st.h * 0.32, 2.6, px, 0.2, 0.85);
  }
  const level = 1;
  const nSplash = Math.round(16 * level * (st.low ? 0.5 : 1));
  if (on(st, "splash"))
    for (let i = 0; i < nSplash; i++) {
      const phase = t * 1.6 + i * 0.37;
      const ph = phase - Math.floor(phase);
      const cyc = Math.floor(phase);
      const x = hh(i * 13 + cyc, 1) * vw * px;
      const y = hh(i * 29 + cyc, 2) * vh * px;
      if (take) {
        const fr = Math.min(3, Math.floor(ph * 4));
        sprite(g, T.splash[fr] as HTMLCanvasElement, x, y, 0.42, px, 0, take === 2 ? 0.75 : 0.6);
      } else {
        const w = Math.max(0.01, ph * 0.45);
        sprite(g, T.splash[0] as HTMLCanvasElement, x, y, w, px, 0, (1 - ph) * 0.5, false, w / 2);
      }
    }
  if (on(st, "drops")) {
    const n = Math.min(128, Math.round(vw * vh * 0.4 * level * (st.low ? 0.5 : 1)));
    const spanY = vh + 3;
    const spanX = vw + 3;
    for (let i = 0; i < n; i++) {
      const sp = 12 + hh(i, 3) * 6;
      const yOff = (hh(i, 4) * spanY + t * sp) % spanY;
      const xOff = (((hh(i, 5) * spanX + yOff * RAIN_SLANT) % spanX) + spanX) % spanX;
      sprite(g, T.drop!, (xOff - 1.5) * px, (yOff - 1.5) * px, take ? 0.03 : 0.035, px, -Math.atan(RAIN_SLANT), take ? 0.4 : 0.28, false, take ? 0.6 : 0.45);
    }
  }
}
const rnNowT: { drop?: HTMLCanvasElement; splash: HTMLCanvasElement[]; wet: HTMLCanvasElement[] } = { splash: [], wet: [] };
const rnNow: Look = {
  code: "now",
  title: "Today",
  note: "Short pale streaks; each splash is one thin ellipse growing and fading.",
  async bake() {
    bakeGame();
    rnNowT.drop = fxf(FX_RAIN);
    rnNowT.splash = [fxf(FX_SPLASH)];
  },
  draw: (g, t, st) => rnDraw(rnNowT, 0, g, t, st),
  textures: () => [tex("fx_rain_a", rnNowT.drop ?? null), tex("fx_splash_a", rnNowT.splash[0] ?? null)],
  parts: [
    { id: "drops", label: "Drops" },
    { id: "splash", label: "Splashes" },
  ],
  frames: [
    { label: "a", t: 0.3, when: "any moment" },
    { label: "b", t: 0.45, when: "0.15 s later" },
  ],
};
function rnTake(code: "RN-A" | "RN-B"): Look {
  const T: { drop?: HTMLCanvasElement; splash: HTMLCanvasElement[]; wet: HTMLCanvasElement[] } = { splash: [], wet: [] };
  const b = code === "RN-B";
  return {
    code,
    title: b ? "Rain + a wet street" : "Rain with real splashes",
    note: b
      ? "RN-A plus the mark: two wet patches on the asphalt (darker, glossy, the street light's streak in them). Costs two 192×112 textures and two sprites; the patches would come from the decay stage, not per drop."
      : "Thinner, longer motion-blurred streaks with a brighter head (they catch the street light). Each splash is a crown: beads thrown up and out, then the ring spreading and a last ripple (4 frames on the same 0.625 s cycle).",
    async bake() {
      T.drop = rainStreak();
      T.splash = [0, 1, 2, 3].map((f) => rainSplash(f));
      if (b) T.wet = [wetPatch(1), wetPatch(4)];
    },
    draw: (g, t, st) => rnDraw(T, b ? 2 : 1, g, t, st),
    textures: () => [tex("rain_streak", T.drop ?? null), ...T.splash.map((s, i) => tex(`rain_splash_${i}`, s)), ...T.wet.map((s, i) => tex(`wet_patch_${i}`, s))],
    parts: [
      { id: "drops", label: "Drops" },
      { id: "splash", label: "Splashes" },
      ...(b ? [{ id: "wet", label: "Wet patches" }] : []),
    ],
    frames: [
      { label: "crown", t: 0.0, when: "splash frame 0 (first splash)" },
      { label: "beads", t: 0.17, when: "frame 1" },
      { label: "ring", t: 0.33, when: "frame 2" },
      { label: "ripple", t: 0.5, when: "frame 3" },
    ],
  };
}

/* =====================================================================================================
 * BD: the Behemoth's dust (Story 9.15, branch story-9-15 › render/bossDust.ts + BossView.ts): pooled fx_dust_a puffs
 * tinted b8ada0, peak alpha 0.5 fading linearly, radius r × (1 + 1.6 t). Shown: the slam hit (a burst of 9 from each fist
 * 1.12 r ahead, ± 0.5 r, speed 2.2 × 0.4–1, r 0.35 × 0.6–1.2, life 0.5 × 0.7–1.2, start within 0.08 s; grit: 6 per
 * shoulder every 0.07 s from 0.05 s, r 0.08, life 0.5, out 0.6–1.1 m/s). r = boss radius 2 m. Pool 48 (?fx=low 24).
 * ===================================================================================================== */
const BOSS_R = 2;
const PUFF_COLOR: [number, number, number] = hex(0xb8ada0);
function dustHash(i: number, ch: number): number {
  let h = Math.imul(i + 1, 2654435761) ^ Math.imul(ch + 7, 1597334677);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}
interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  t0: number;
}
/** The slam's puffs, in metres from the boss centre (facing +x). Fixed list (the plan is deterministic). */
const SLAM_PUFFS: Puff[] = ((): Puff[] => {
  const out: Puff[] = [];
  let e = 0;
  for (const side of [-1, 1]) {
    const fx = 1.12 * BOSS_R;
    const fy = side * 0.5 * BOSS_R;
    for (let k = 0; k < 9; k++, e++) {
      const a = dustHash(e, 1) * Math.PI * 2;
      const s = 2.2 * (0.4 + 0.6 * dustHash(e, 2));
      out.push({ x: fx, y: fy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 0.35 * (0.6 + 0.6 * dustHash(e, 3)), life: 0.5 * (0.7 + 0.5 * dustHash(e, 4)), t0: 0.08 * dustHash(e, 5) });
    }
  }
  for (const side of [-1, 1])
    for (let k = 0; k < 6; k++, e++) {
      const out1 = 0.6 + 0.5 * dustHash(e, 6);
      out.push({ x: 0.2 * BOSS_R, y: side * 0.72 * BOSS_R, vx: (dustHash(e, 7) - 0.3) * 0.5, vy: side * out1, r: 0.08, life: 0.5, t0: 0.05 + k * 0.07 });
    }
  return out;
})();
let bossFrame: HTMLCanvasElement | null = null;
function bossUnder(g: CanvasRenderingContext2D, _t: number, st: Stage): void {
  if (!bossFrame) return;
  const w = 7 * st.pxm;
  g.drawImage(bossFrame, st.cx - w / 2, st.cy - w / 2, w, w);
}
function bdDraw(tx: HTMLCanvasElement[], take: boolean, g: CanvasRenderingContext2D, t: number, st: Stage): void {
  if (!on(st, "dust")) return;
  const n = st.low ? 24 : 48;
  SLAM_PUFFS.forEach((p, i) => {
    if (i >= n) return;
    const age = t - p.t0;
    if (age < 0 || age >= p.life) return;
    const u = age / p.life;
    const x = st.cx + (p.x + p.vx * age) * st.pxm;
    const y = st.cy + (p.y + p.vy * age) * st.pxm;
    const d = 2 * p.r * (1 + 1.6 * u);
    sprite(g, tx[i % tx.length] as HTMLCanvasElement, x, y, d, st.pxm, take ? i * 1.7 + u * 0.4 : 0, 0.5 * (1 - u));
  });
}
const bdNowT: HTMLCanvasElement[] = [];
const bdNow: Look = {
  code: "now",
  title: "Story 9.15 (in review)",
  note: "Soft round grey discs from the fists and grit off the shoulders, on the slam hit, timed by the approved group 4 plan.",
  async bake() {
    bakeGame();
    ensureBossTextures(fakeScene);
    bossFrame = frameCanvas(BOSS_ATLAS, "boss_bh1_slamhit_a");
    bdNowT.push(tinted(fxf(FX_DUST), PUFF_COLOR));
  },
  draw: (g, t, st) => bdDraw(bdNowT, false, g, t, st),
  textures: () => [tex("fx_dust_a (tinted b8ada0)", bdNowT[0] ?? null, "shared texture")],
  parts: [{ id: "dust", label: "Dust" }],
  frames: [
    { label: "hit", t: 0.06, when: "slam hit" },
    { label: "spread", t: 0.25, when: "grit off the shoulders" },
    { label: "thin", t: 0.45, when: "fading" },
  ],
};
const bdAT: HTMLCanvasElement[] = [];
const bdA: Look = {
  code: "BD-A",
  title: "Only the dust picture changes",
  note: "Same pool, bursts, timing and tint as 9.15: only fx_dust_a is redrawn (the lit billows of RD-A, three variants, turned per puff). If RD-A is picked, the boss gets it with no code change to 9.15.",
  async bake() {
    await bakeDustLit();
    for (const d of dustLit) bdAT.push(tinted(d, PUFF_COLOR));
  },
  draw: (g, t, st) => bdDraw(bdAT, true, g, t, st),
  textures: () => bdAT.map((d, i) => tex(`fx_dust_${"abc"[i]} (tinted b8ada0)`, d, "shared with RD-A")),
  parts: [{ id: "dust", label: "Dust" }],
  frames: [
    { label: "hit", t: 0.06, when: "slam hit" },
    { label: "spread", t: 0.25, when: "grit off the shoulders" },
    { label: "thin", t: 0.45, when: "fading" },
  ],
};

/* ===================================================================================================== */
export const cards: FxCard[] = [
  {
    id: "acid",
    code: "AC",
    name: "Spitter acid: the glob and the puddle",
    family: "matter",
    brief: `<p><b>Acid is the one matter that glows</b> (yellow-green = acid). The glob is heavy and viscous: a drop with strings behind it, the street light on it upper-left (its own sprite, so it stays upper-left while the glob turns), its shadow on the street moving away with the lob. It lands with a splat (matter flies), then becomes <b>the mark</b>: a pool with a deep olive centre, see-through thin edges and a bright meniscus, eating into the asphalt under it, bubbling, giving off thin fumes. <b>The ring stays exactly where it is</b>: its outer edge is the damage edge (4.8 D16: touch the ring = you are in acid).</p>`,
    game: `<ul><li><code>render/AcidView.ts</code>: glob <code>fx_spit_glob_01</code> 0.45 m (× 1.7 at the top of the lob, lifted 0.35 m up the screen), shadow <code>fx_glow</code> tinted black 0.28 m at 0.35; puddle <code>fx_acid_puddle_01/02</code> 2 m (2 × puddleRadiusM 1.0), turned id × 1.3, fade in 0.12 s, alpha min(1, (3 − age) / 0.6 + 0.35).</li><li><code>acidFx.ts</code>: pools ≤ maxLiveSpits 24 / maxLivePuddles 32 (zombies.json › spitCaps); speed 9 m/s, puddle 3 s.</li><li>Blackout: a ghost copy above the darkness (hazard, 6.3 B3).</li></ul>`,
    perf: `<p>AC-A: 13 textures, ≈ 190 KB (the two pools are 144² for 2 m: 72 px/m = 36 px/m × dpr 2). Per puddle 1 pool + 1 halo (ADD, cropped to the pool) + ≤ 6 bubbles + ≤ 4 fumes = 12 sprites (today 1), so 32 puddles = 384 sprites at the cap: <b>cap the bubbles and fumes to the 8 nearest puddles</b> (like maxSpitterDrips 8) and halve with <code>?fx=low</code> (done here: 3 bubbles, 2 fumes). AC-B drops the two additive textures (no ADD fill on the CPU rasterizer).</p>`,
    findings: [
      "<b>Bug (pop):</b> the puddle never fades to 0: alpha = min(1, (3 − age) / 0.6 + 0.35) is still 0.35 at its last frame, then it vanishes (<code>AcidView.ts</code> line ~99). Both takes fade to 0 over the last 0.6 s; the sim's damage ends at 3 s either way.",
      "The glob is rotated to its flight direction with a highlight baked in, so the highlight turns with it (lit from the right when spat to the left). The takes keep the highlight as its own unrotated sprite.",
      "The glob's shadow does not move with the lob (fixed size and alpha); the takes push it down-right and soften it at the top of the arc.",
      "Checked and fine: the ring's outer edge sits at the frame's half side (the damage edge) in both variants; kept in the takes at the same place and width ratio.",
    ],
    lengthS: AC_FLIGHT_S + AC_PUDDLE_S + 0.25,
    gapS: 0.4,
    keyT: [AC_FLIGHT_S * 0.5, AC_FLIGHT_S + 0.08, AC_FLIGHT_S + 1.2, AC_FLIGHT_S + 2.8],
    viewM: 7,
    aspect: 0.6,
    looks: [acNow, acTake("AC-A"), acTake("AC-B")],
    plan: {
      goal: "See it coming, then know exactly where not to stand for 3 s.",
      timing: `Flight 5 m at 9 m/s = 0.56 s here (≤ 6 m range: 0.67 s); puddle 3 s from the splash (zombies.json › spitter.spit). The Spitter's 0.6 s windup (its rear-back pose) comes before.`,
      lengthS: AC_FLIGHT_S + AC_PUDDLE_S + 0.25,
      lanes: {
        light: [
          { t0: 0, t1: AC_FLIGHT_S, label: "glob glow (A)" },
          { t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + 2.4, label: "pool halo, slow shimmer (A)", nw: true },
          { t0: AC_FLIGHT_S + 2.4, t1: AC_FLIGHT_S + 3, label: "fade to 0", nw: true },
        ],
        core: [
          { t0: 0, t1: AC_FLIGHT_S, label: "glob: lob, highlight upper-left", nw: true },
          { t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + 0.15, label: "spread", key: true, nw: true },
          { t0: AC_FLIGHT_S + 0.15, t1: AC_FLIGHT_S + 3, label: "bubbles: grow, swell, pop (0.7 s each)", nw: true },
        ],
        matter: [{ t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + 0.3, label: "splat drops", key: true, nw: true }],
        smoke: [{ t0: AC_FLIGHT_S + 0.2, t1: AC_FLIGHT_S + 3, label: "thin fumes rising", nw: true }],
        mark: [{ t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + 3, label: "pool + etched asphalt + damage ring (ring unchanged)" }],
        game: [
          { t0: 0, t1: 0.05, label: "spit sound", key: true },
          { t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + 0.05, label: "splash", key: true },
          { t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + 3, label: "5 dmg/s inside, every 0.4 s" },
        ],
      },
    },
  },
  {
    id: "gas",
    code: "GA",
    name: "Bloater gas cloud",
    family: "matter",
    brief: `<p>Gas is <b>matter, not light</b>: heavy yellow-green fumes (gas / infection colour) that <b>roll out</b> from the burst, denser in the middle, lit on top-left and shadowed down-right, thinning into curling wisps at the rim. It does not glow. The two layers still turn against each other (today's motion, kept). <b>The edge ring stays</b>: it is the slow zone's edge (30 % slow inside).</p>`,
    game: `<ul><li><code>render/BloaterView.ts</code>: per cloud two discs <code>fx_gascloud_a/b</code> 5 m (2 × gasRadiusM 2.5), alpha 0.42 / 0.22, turning +0.05 / −0.08 rad/s; edge ring 0.045 m, cde178 at 0.45; ghosts above the darkness in a blackout.</li><li><code>bloaterFx.ts</code>: fade in 0.25 s, out over the last 1 s; gasS 4.0; maxGasClouds 24 (zombies.json › blasts).</li><li>The burst (flash, shock ring, drops, scraps, bile) is the fire family's card <b>BX</b>.</li></ul>`,
    perf: `<p>GA-A: 3 textures, 300 KB (two 192² layers: the cloud is 5 m, 38 px/m; the game shows it at 36 px/m × dpr). Per cloud 2 layers + 8 wisps + the ring = 11 sprites (today 3); 24 clouds = 264 at the cap: wisps only on the 6 nearest clouds (maxBloaterFx 6), 4 with <code>?fx=low</code>. The layers are normal blend, large: the same fill cost as today's two discs.</p>`,
    findings: [
      "Checked and fine: alpha in / out and the turning speeds match <code>bloaterFx.ts</code> / <code>BloaterView.ts</code>.",
      "Today's gas texture is flat (no light direction): the take lights it from the upper left like every other matter.",
      "The cloud is full size at once (the sim slows inside 2.5 m from the first tick); GA-A rolls the look out from 70 % to 100 % in 0.35 s, but the edge ring is drawn at full radius from the start so the slow zone reads exactly.",
    ],
    lengthS: GAS_S,
    gapS: 0.5,
    keyT: [0.15, 1.2, 3.5],
    viewM: 7,
    aspect: 0.8,
    looks: [gaNow, gaA],
    plan: {
      goal: "A zone you don't want to walk through: you see its edge at once, and it hangs there for 4 s.",
      timing: "gasS 4.0, fade in 0.25 s, out over the last 1 s (bloaterFx.ts); radius 2.5 m.",
      lengthS: GAS_S,
      lanes: {
        core: [
          { t0: 0, t1: 0.35, label: "roll out 70 → 100 %", key: true, nw: true },
          { t0: 0.35, t1: 3, label: "two layers turning (today's speeds)" },
          { t0: 3, t1: 4, label: "thin out" },
        ],
        smoke: [{ t0: 0.2, t1: 4, label: "rim wisps curl along the edge", nw: true }],
        mark: [{ t0: 0, t1: 4, label: "edge ring at 2.5 m (unchanged)" }],
        game: [
          { t0: 0, t1: 0.05, label: "burst (BX)", key: true },
          { t0: 0, t1: 4, label: "30 % slow inside" },
        ],
      },
    },
  },
  {
    id: "eventsmoke",
    code: "EV",
    name: "Event vapour, flare smoke, stampede dust",
    family: "matter",
    brief: `<p>Three emitters from the events, kept at their rates and colours because each colour means something: the <b>gas leak's yellow-green vapour</b> (gas: get out of the ring), the supply drop's <b>green signal smoke</b> (SD2, approved: where the crate lands; a signal colour, not acid) and the stampede's <b>warm dust</b>. All three become lit billows (matter): the gas jet leaves fast and hangs, the smoke rises off the flare then bends with the wind, the dust kicks up grit (secondary follows). The flare is <b>light</b>: a white-hot green head on a dark stick, with a small pool of green light.</p>`,
    game: `<ul><li><code>render/EventPickupsView.ts</code>: vapour <code>event_vapour_a</code> 22/s, life 2.2 s × 0.7–1.2, 1.4 m × (0.5 + 1.3 u), alpha 0.7 (1 − u); flare <code>event_flare_a</code> 0.6 × 0.3 m; smoke <code>event_smoke_a</code> 16/s, life 3 s, 1.68 m, alpha 0.75, drift (0.35, −0.3) m/s.</li><li><code>render/EventView.ts</code>: stampede dust <code>event_dust_a–c</code> 24/s, life 1.6 s, 2.2 m × (0.6 + 0.8 u), alpha 0.7 (1 − u).</li><li>Caps: events.json › fx 48 vapour, 48 smoke, 64 dust; all above the darkness.</li></ul>`,
    perf: `<p>EV-A: 12 textures, ≈ 160 KB (64–72 px puffs for 1.4–2.2 m). Same particle counts as today (one sprite each) plus ≤ 24 grit chips on the stampede and 3 sprites for the burning flare (2 additive, cropped). <code>?fx=low</code> halves all emitters (today it doesn't touch the event particles: see findings).</p>`,
    findings: [
      "<code>?fx=low</code> does not reduce the event vapour, flare smoke or stampede dust today (EventPickupsView / EventView ignore it). Proposed: halve them like the other particles (shown with the ?fx=low button).",
      "The flare is drawn as a 32 × 16 px bar and a dot, stretched to 0.6 × 0.3 m: it reads as a domino. EV-A draws a stick with a burning head.",
      "The gas leak vapour lives here (EV) rather than in GA (GA = the Bloater's cloud), as listed in the brief.",
      "Checked and fine: the signal smoke colour (EVENT_SMOKE_RGB 70,190,90) is a mid green, distinct from the acid / gas yellow-green: kept.",
    ],
    lengthS: EV_L,
    gapS: 0,
    keyT: [0.6, 1.8, 3.0],
    viewM: 12,
    aspect: 0.5,
    looks: [evNow, evA],
    plan: {
      goal: "From across the map: where the gas is, where the crate lands, where the stampede comes from.",
      timing: "Continuous while the event's phase lasts (gas leak HISS, supply FLARE, stampede warning): rates 22 / 16 / 24 per second (EventPickupsView / EventView).",
      lengthS: EV_L,
      lanes: {
        light: [{ t0: 0, t1: EV_L, label: "flare: burning head + green light pool, flicker", nw: true }],
        smoke: [
          { t0: 0, t1: EV_L, label: "vapour jet: fast out, then hangs", nw: true },
          { t0: 0, t1: EV_L, label: "signal smoke: rises, bends with the wind", nw: true },
        ],
        matter: [{ t0: 0, t1: EV_L, label: "stampede: dust billows + kicked grit", nw: true }],
        game: [{ t0: 0, t1: EV_L, label: "event phase (banner, marker)" }],
      },
    },
  },
  {
    id: "ruinsdust",
    code: "RD",
    name: "Ruins dust, grit and ash",
    family: "matter",
    brief: `<p>Stage 4 (Ruins): bits of the buildings keep coming down. The dust is <b>matter lit from the upper left</b>: billows with a lit side and a shadowed side, coloured by the Ruins material (the game's tint, kept). The grit is <b>chips of concrete</b> with their own soft shadow down-right, that fall, bounce once and rest before they fade (secondary follows the puff). Stage 5 CO3 ash: <b>flakes that tumble</b> (face, edge) and drift, each with a faint shadow. <b>RD-A redraws <code>fx_dust_a</code></b>, which the Behemoth's dust (BD) and the place dust (PD-A) share.</p>`,
    game: `<ul><li><code>render/city/DustView.ts</code>: per puff 3 smoke <code>fx_dust_a</code> 0.8 m × (1 + 1.4 u), life 1.8 s, alpha 0.5 sin(π min(1, 1.4 u)) (1 − u), drift down 0.15 m/s; 8 grit <code>fx_grit_a</code> 0.06 m, life 1.1 s, falling 0.6 m, spin 6 rad/s; tint = the material's dust (concrete 184,176,160).</li><li>decay.json › ruins: a puff every 0.6–1.6 s at rubble in view, collapse burst 2 s; caps 40 smoke / 60 grit, halved by <code>?fx=low</code>.</li><li><code>render/city/CityView.ts</code>: CO3 ash in the rain pool, <code>fx_ash_a</code> 0.07 × 0.045 m, alpha 0.55, tint b8b2a8.</li></ul>`,
    perf: `<p>RD-A: 9 textures, ≈ 80 KB (three 80² dust billows replace one 64²; three 20² chips; ash 16 × 12 ×3). Same counts as today (3 smoke + 8 grit per puff; caps 40 / 60, halved with <code>?fx=low</code>). Ash: +1 shadow sprite per flake (≤ 128 at the cap; drop the shadows with <code>?fx=low</code>).</p>`,
    findings: [
      "<code>fx_grit_a</code> is a hard white quad (8 px) shown at 0.06 m (2 px): it reads as a white speck. RD-A: lit chips with a soft edge and a shadow (skill § 4: no hard specks).",
      "Today's grit 'falls' with an ease-out from its highest point (fastest at the start): it floats down. RD-A accelerates it and adds one small bounce.",
      "Overlap (9.15): <code>fx_dust_a</code> is shared with the Behemoth's dust (<code>bossDust.ts</code>, tint b8ada0). Redrawing it here restyles the boss dust too, keeping 9.15's timing (see BD).",
      "Checked and fine: <code>?fx=low</code> halves the dust pools; the material tint follows the Ruins look.",
    ],
    lengthS: 1.8,
    gapS: 0.4,
    keyT: [0.2, 0.55, 1.2],
    viewM: 4,
    aspect: 0.75,
    looks: [rdNow, rdA],
    plan: {
      goal: "The ruins are still falling apart around you (ambience: it must never look like an attack).",
      timing: "One puff per 0.6–1.6 s (decay.json › ruins); smoke 1.8 s, grit 1.1 s (DustView.ts). Ash: continuous in CO3.",
      lengthS: 1.8,
      lanes: {
        smoke: [{ t0: 0, t1: 1.8, label: "3 lit billows: swell (0–0.7 s), thin out" }],
        matter: [
          { t0: 0, t1: 0.45, label: "grit falls (accelerating)", nw: true },
          { t0: 0.45, t1: 0.65, label: "bounce", key: true, nw: true },
          { t0: 0.65, t1: 1.1, label: "rests, fades" },
          { t0: 0, t1: 1.8, label: "ash tumbles (CO3)", nw: true },
        ],
        game: [{ t0: 0, t1: 0.1, label: "debris_fall (panned)", key: true }],
      },
    },
  },
  {
    id: "placedust",
    code: "PD",
    name: "Dust when a building is placed",
    family: "matter",
    brief: `<p>A piece hits the ground: dust is pushed out from under its edge. Dust is matter, so it <b>billows and grows while it thins</b> (today's dots shrink as they fly, which reads like sparks). Same 8 puffs, same edge points, same 0.4 s; the shared lit dust picture, plus two chips knocked out where it lands.</p>`,
    game: `<ul><li><code>render/PlaceFxView.ts</code>: one Graphics, a fillCircle per particle, colour a89c88.</li><li><code>placeFxPools.ts › DustPool</code> + <code>placeFeel.ts</code>: 8 per puff from the footprint's edge, 0.7 m/s slowing to 0, radius 0.12 → 0.05 m, alpha 0.7 (1 − t), life 0.4 s; cap controls.json › fx.maxPlaceDust 64.</li><li>Shown on a 2 × 1 m wood barricade footprint (dashed).</li></ul>`,
    perf: `<p>PD-A: reuses the shared dust textures (tinted copies in the game: no new texture if the tint is applied by Phaser) + one chip; 8 sprites + 2 chips per placement instead of one redrawn Graphics; ≤ 64 at the cap. Chips off with <code>?fx=low</code>.</p>`,
    findings: [
      "Today the dust shrinks (radius 0.12 → 0.05 m) as it spreads: physically backwards for dust. PD-A grows it 0.3 → 0.65 m while it fades.",
      "<code>?fx=low</code> doesn't halve the place dust today (cap 64 either way); a small effect, but the rule says halve.",
      "Checked and fine: 8 puffs on the footprint's edge, the seeded spin, 0.4 s.",
    ],
    lengthS: 0.5,
    gapS: 0.5,
    keyT: [0.05, 0.2, 0.36],
    viewM: 4,
    aspect: 0.6,
    under: footprint,
    looks: [pdNow, pdA],
    plan: {
      goal: "Thud: it's down, and it's solid.",
      timing: "0.4 s from building.placed (placeFeel.ts); with the drop and the sound.",
      lengthS: 0.5,
      lanes: {
        smoke: [{ t0: 0, t1: 0.4, label: "8 puffs: out from the edge, grow, thin", nw: true }],
        matter: [{ t0: 0, t1: 0.5, label: "2 chips knocked out", nw: true }],
        game: [{ t0: 0, t1: 0.05, label: "place sound + haptic", key: true }],
      },
    },
  },
  {
    id: "rain",
    code: "RN",
    name: "Rain and splashes",
    family: "matter",
    brief: `<p>Rain is matter falling through the street light: thin motion-blurred streaks with a brighter head, slanted as today. Each splash is a <b>crown</b>: beads thrown up and out, then the ring spreading, then a last ripple. <b>RN-B</b> adds <b>the mark</b>: the street is wet, darker and glossy, with the lamp's streak in it (a real choice: it costs two textures and changes the look of the whole street in the rainy stages).</p>`,
    game: `<ul><li><code>render/city/CityView.ts</code>: pool 128 drops, 0.4 / m² × the stage's rain level (CO4 flood × 1.3), <code>fx_rain_a</code> 0.035 × 0.45 m slanted 0.22, 12–18 m/s, alpha 0.28; splashes 16 × level, <code>fx_splash_a</code> ellipse to 0.45 m, alpha (1 − phase) 0.5, 1.6 per second each.</li><li><code>render/city/rainLook.ts</code>: × 0.35 in a blackout; Rain setting × 1 / 0.5 / 0 (Story 10.1).</li><li>Shown at level 1 (stage 3).</li></ul>`,
    perf: `<p>RN-A: 5 textures, ≈ 40 KB (the 4 splash frames 64 × 36). Same counts (≤ 128 drops, ≤ 16 splashes, halved with <code>?fx=low</code> and the Rain setting). RN-B: + 2 wet patches (192 × 112, 168 KB) as 2 large normal-blend sprites per screen.</p>`,
    findings: [
      "<code>fx_floodpool_a</code> (in the FX atlas) is not water: it is the floodlights' light pool (FloodlightView, ADD). It belongs with the light textures (9.6 lists 'floodlight light textures'), not with rain: not redrawn here.",
      "Checked and fine: drop count, slant, speeds and the splash cycle match CityView; the blackout dimming and the Rain setting stay as they are.",
    ],
    lengthS: 1.25,
    gapS: 0,
    keyT: [0.1, 0.35, 0.6],
    viewM: 5,
    aspect: 0.7,
    looks: [rnNow, rnTake("RN-A"), rnTake("RN-B")],
    plan: {
      goal: "It's pouring (stage 3), without hiding anything that matters.",
      timing: "Continuous; each splash cycle 0.625 s (1.6 / s), drops 12–18 m/s (CityView.ts).",
      lengthS: 1.25,
      lanes: {
        matter: [{ t0: 0, t1: 1.25, label: "drops: streak + bright head" }],
        core: [
          { t0: 0, t1: 0.16, label: "crown", key: true, nw: true },
          { t0: 0.16, t1: 0.31, label: "beads out", nw: true },
          { t0: 0.31, t1: 0.47, label: "ring", nw: true },
          { t0: 0.47, t1: 0.625, label: "ripple", nw: true },
          { t0: 0.625, t1: 0.78, label: "crown", key: true, nw: true },
          { t0: 0.78, t1: 1.25, label: "…" },
        ],
        mark: [{ t0: 0, t1: 1.25, label: "RN-B: wet patches (static)", nw: true }],
      },
    },
  },
  {
    id: "bossdust",
    code: "BD",
    name: "The Behemoth's dust (Story 9.15)",
    family: "matter",
    brief: `<p>The dust is <b>secondary: it follows its cause</b> (the group 4 plan's R5) and its timing is already approved and built in Story 9.15 (in review, PR #34). So <b>only the picture changes</b>: the same pooled puffs, bursts, sizes, alphas and tint, drawn with the new lit <code>fx_dust_a</code> from RD-A. Recommended: pick BD together with RD (one texture, one look for all dust).</p>`,
    game: `<ul><li>Branch story-9-15: <code>render/bossDust.ts</code> (pool 48, ?fx=low 24; slam: 9 per fist, 6 grit per shoulder; rush trail, crash 16, throw crumbs 8 + landing 12, roar 22, death 24), <code>BossView.ts</code> draws each with one <code>ATLAS_FX › FX_DUST</code> image tinted b8ada0; peak alpha 0.5, radius × (1 + 1.6 t).</li><li>Shown: the slam hit on BH1's slam-hit frame (today's game drawing, not the relit one).</li></ul>`,
    perf: `<p>No change to counts (pool 48 / 24). Texture: the shared dust grows from one 64² to three 80² (≈ 75 KB).</p>`,
    findings: [
      "Overlap with 9.15: <code>bossDust.ts</code> uses <code>FX_DUST</code>; when group 5's dust texture lands, the boss picks it up with no change to 9.15's code or timing. If three variants are picked, 9.15's one-image-per-slot can take the variant by slot index (one line).",
      "Checked and fine: the burst numbers here are copied from <code>BOSS_DUST</code> on story-9-15.",
    ],
    lengthS: 0.6,
    gapS: 0.6,
    keyT: [0.06, 0.25, 0.45],
    viewM: 8,
    aspect: 0.75,
    origin: [0.4, 0.5],
    under: bossUnder,
    looks: [bdNow, bdA],
    plan: {
      goal: "The slam lands with weight: the ground gives off dust from under the fists.",
      timing: "From the slam hit (boss.json slam: telegraph 1.2 s, then the hit); bursts start within 0.08 s, puffs live 0.35–0.6 s (bossDust.ts).",
      lengthS: 0.6,
      lanes: {
        smoke: [{ t0: 0, t1: 0.6, label: "fist bursts: 2 × 9 puffs" }],
        matter: [{ t0: 0.05, t1: 0.47, label: "grit off the shoulders, one every 0.07 s" }],
        game: [{ t0: 0, t1: 0.05, label: "slam hit (BossView, 9.15)", key: true }],
      },
    },
  },
];
