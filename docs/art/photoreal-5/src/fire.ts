/**
 * Group 5, family "fire": EX1 launcher blast, EX2 mine / hand-grenade blast, GR rounds in flight, MO Molotov, FI fire
 * (fire-lab D), FS flamethrower streams, BX Bloater burst.
 *
 * "Now" = the game today: the game's OWN pure particle sims (grenadeFx `BlastParticles` / `Explosions`, fireParticles
 * `CarFire`, flameJet `FlameJets`, bloaterFx `BloaterFx`) stepped like the views step them, drawn with the game's own
 * atlas frames (painted by its `ensure…()` code) and the views' sizes, tints, blends, alphas and draw order.
 * Take A = the same sims (same timing, same sizes, same read: nothing about play changes), drawn with the photoreal
 * textures of `fire-kit.ts › takeA()`: flames coloured by temperature (white-hot core → amber → red-brown, never the
 * boss's warning red), smoke lit by the street's key light from the upper left, relit debris with ground shadows, a
 * real scorch mark, light pools. Take B only where there is a real choice (BX-B: glowing bile).
 */
import { BlastParticles, Explosions, BLAST_TIMES, P_DEBRIS, P_DUST, P_EMBER, P_FLAME, P_SMOKE, type BlastLook, type ParticleDraw as BlastDraw } from "../../../../apps/client/src/render/grenadeFx";
import { fiCarLook, approvedCar, drawCar as drawApprovedCar } from "./fire-car";
import { ex1G, ex2G, grG, fsG, bxG } from "./fire-g";
import { moG } from "./fire-gmo";
import { CarFire, edgeFlameDraw, emberDraw, fireFlicker, flameDraw, freeFlameFitR, smokeDraw, type ParticleDraw as FireDraw } from "../../../../apps/client/src/render/city/fireParticles";
import { FLAME_TINTS, SMOKE_PALETTES } from "../../../../apps/client/src/render/city/fireSprites";
import { FlameJets, FLAME_STYLE, TORCH_BLUE, type JetDraw } from "../../../../apps/client/src/render/flameJet";
import { BloaterFx, BURST_DROP, BURST_FLASH_S, BURST_PUFF, BURST_RING_FADE_S, BURST_RING_S, BURST_SCRAP, BURST_SPLAT } from "../../../../apps/client/src/render/bloaterFx";
import { MolotovFires } from "../../../../apps/client/src/render/molotovFx";
import { ringDisplayM, GRENADE_FRAME_M, MOLOTOV_FRAME_M, MOLOTOV_RAG_X_M } from "../../../../apps/client/src/render/city/throwArt";
import { ROUND_H_M, ROUND_W_M } from "../../../../apps/client/src/render/city/blastFxAtlas";
import { FIRE_RING_ALPHA, FIRE_RING_COLOR } from "../../../../apps/client/src/render/city/fireRing";
import { make, sprite, countSprite, easeOut, type FxCard, type Look, type Stage } from "./kit";
import { G, Replay, TintCache, gameAtlases, hex, relitFrame, shadowOf, takeA, takeATextures, tinted, FLAME_A_STEPS, type TakeA } from "./fire-kit";

type Tex = { name: string; canvas: HTMLCanvasElement; note?: string };
const on = (st: Stage, id: string): boolean => st.only === null || st.only === id;
const X = (st: Stage, x: number): number => st.cx + x * st.pxm;
const Y = (st: Stage, y: number): number => st.cy + y * st.pxm;
function ringStroke(g: CanvasRenderingContext2D, st: Stage, x: number, y: number, r: number, wM: number, col: number, a: number, glow = 0): void {
  if (a <= 0.01 || r <= 0) return;
  countSprite(glow > 0);
  g.save();
  g.strokeStyle = hex(col);
  if (glow > 0) {
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = a * glow;
    g.lineWidth = Math.max(1, wM * st.pxm * 4);
    g.beginPath();
    g.arc(X(st, x), Y(st, y), r * st.pxm, 0, Math.PI * 2);
    g.stroke();
    g.globalCompositeOperation = "source-over";
  }
  g.globalAlpha = a;
  g.lineWidth = Math.max(1, wM * st.pxm);
  g.beginPath();
  g.arc(X(st, x), Y(st, y), r * st.pxm, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}
/** FLAME_TINTS index of a tint (exact for the ramp steps; the nearest for the edge flames' continuous ramp). */
const tintIdx = new Map<number, number>();
function flameStep(tint: number): number {
  let i = tintIdx.get(tint);
  if (i === undefined) {
    let best = 0;
    let bd = Infinity;
    FLAME_TINTS.forEach((t, k) => {
      const d = Math.abs(((t >> 16) & 255) - ((tint >> 16) & 255)) + Math.abs(((t >> 8) & 255) - ((tint >> 8) & 255)) + Math.abs((t & 255) - (tint & 255));
      if (d < bd) {
        bd = d;
        best = k;
      }
    });
    i = best;
    tintIdx.set(tint, i);
  }
  return i;
}
const stepA = (tint: number): number => Math.min(FLAME_A_STEPS - 1, Math.floor((flameStep(tint) * FLAME_A_STEPS) / FLAME_TINTS.length));

/* =============================== EX1 / EX2: explosions =============================== */
const R_BLAST = 2.5; // weapons.json grenade_launcher.blastRadiusM; buildings.json mine.blastRadiusM; consumables.json grenades.radiusM
const DUST_TINTS = [0x968068, 0x786e62, 0x645e56, 0x58544e, 0x4c4945, 0x42403e] as const;
const DEBRIS_TINTS = [0x1b1c1f, 0x2a2b2f, 0x3a3c40, 0x111214, 0x4a4c50, 0x8a8e94] as const;
interface BlastSim {
  p: BlastParticles;
  ex: Explosions;
}
const blastSim = (look: BlastLook): Replay<BlastSim> =>
  new Replay<BlastSim>(
    (seed) => {
      const p = new BlastParticles(96, 0x5eed5 + seed * 7919); // combat.json explosion.fx.maxExplosionParticles
      const ex = new Explosions(8, 16);
      ex.start(look, 0, 0, R_BLAST, 0);
      p.burst(look, 0, 0, R_BLAST, 4, 3);
      return { p, ex };
    },
    (s, dt) => s.p.step(dt),
  );

function blastNow(look: BlastLook): Look {
  const sim = blastSim(look);
  let flame: TintCache, smoke: TintCache, dust: TintCache, debris: TintCache;
  let ember: HTMLCanvasElement, flash: HTMLCanvasElement, glow: HTMLCanvasElement, scorch: HTMLCanvasElement;
  const d: BlastDraw = { x: 0, y: 0, w: 0, h: 0, rot: 0, alpha: 0, variant: 0, t: 0 };
  const ringOut = { r: 0, alpha: 0 };
  return {
    code: "now",
    title: look === "fireball" ? "EX1 fireball today" : "EX2 shockwave today",
    note: "The game's own particles, frames, tints and timings (ExplosionView).",
    async bake() {
      gameAtlases();
      flame = new TintCache(G.blastFlame(), FLAME_TINTS);
      smoke = new TintCache(G.blastSmoke(), SMOKE_PALETTES.black);
      dust = new TintCache(G.blastSmoke(), DUST_TINTS);
      debris = new TintCache([G.debris()], DEBRIS_TINTS);
      ember = G.blastEmber();
      flash = G.blastFlash();
      glow = G.blastGlow();
      scorch = G.scorch();
    },
    textures: () => [
      { name: "fx_blastflame ×4", canvas: G.blastFlame()[0] as HTMLCanvasElement, note: "white mask, tinted" },
      { name: "fx_blastsmoke ×3", canvas: G.blastSmoke()[0] as HTMLCanvasElement },
      { name: "fx_blastember", canvas: ember },
      { name: "fx_blastflash", canvas: flash },
      { name: "fx_blastglow", canvas: glow },
      { name: "fx_scorch", canvas: scorch },
      { name: "fx_debris", canvas: G.debris() },
    ],
    parts: PARTS_BLAST,
    frames: FRAMES_BLAST,
    draw(g, t, st) {
      const { p, ex } = sim.at(t, st.seed, st.low);
      const T = BLAST_TIMES[look];
      const pxm = st.pxm;
      if (on(st, "mark")) sprite(g, scorch, X(st, 0), Y(st, 0), 2 * R_BLAST, pxm, ex.scorchRot[0] as number, ex.scorchAlpha(0, t));
      const ga = t < 0.05 ? 1 : Math.max(0, 1 - (t - 0.05) / T.glowS);
      if (on(st, "light")) sprite(g, glow, X(st, 0), Y(st, 0), 2 * R_BLAST, pxm, 0, 0.55 * ga, true);
      if (on(st, "smoke"))
        for (let i = 0; i < p.capacity; i++) {
          const k = p.kind[i];
          if ((k !== P_SMOKE && k !== P_DUST) || !p.draw(i, d) || d.alpha < 0.01) continue;
          const tex = k === P_SMOKE ? smoke.get(d.variant, SMOKE_PALETTES.black[Math.min(5, Math.floor(d.t * 6))] as number) : dust.get(d.variant, DUST_TINTS[Math.min(5, Math.floor(d.t * 6))] as number);
          sprite(g, tex, X(st, d.x), Y(st, d.y), d.w, pxm, d.rot, d.alpha, false, d.h);
        }
      for (let i = 0; i < p.capacity; i++) {
        const k = p.kind[i];
        if ((k !== P_FLAME && k !== P_DEBRIS) || !p.draw(i, d) || d.alpha < 0.01) continue;
        if (k === P_FLAME && on(st, "flame")) sprite(g, flame.get(d.variant, FLAME_TINTS[Math.min(FLAME_TINTS.length - 1, Math.floor(d.t * FLAME_TINTS.length))] as number), X(st, d.x), Y(st, d.y), d.w, pxm, d.rot, d.alpha, true, d.h);
        if (k === P_DEBRIS && on(st, "debris")) sprite(g, debris.get(0, DEBRIS_TINTS[i % 6] as number), X(st, d.x), Y(st, d.y), d.w, pxm, d.rot, d.alpha, false, d.h);
      }
      const fa = t < T.flashS ? 1 - t / T.flashS : 0;
      if (fa > 0 && on(st, "flash")) sprite(g, flash, X(st, 0), Y(st, 0), (look === "fireball" ? 2.2 : 2.6) * R_BLAST * (0.7 + 0.3 * (t / T.flashS)), pxm, 0, fa, true);
      if (on(st, "ring")) {
        const r = ex.ring(0, t, ringOut);
        ringStroke(g, st, 0, 0, r.r, look === "fireball" ? 0.05 : 0.08, look === "fireball" ? 0xffb060 : 0xf2eee6, r.alpha);
      }
      if (on(st, "embers"))
        for (let i = 0; i < p.capacity; i++) {
          if (p.kind[i] !== P_EMBER || !p.draw(i, d) || d.alpha < 0.01) continue;
          sprite(g, ember, X(st, d.x), Y(st, d.y), d.w, pxm, d.rot, d.alpha, true, d.h);
        }
    },
  };
}
function blastA(look: BlastLook): Look {
  const sim = blastSim(look);
  let A: TakeA;
  const d: BlastDraw = { x: 0, y: 0, w: 0, h: 0, rot: 0, alpha: 0, variant: 0, t: 0 };
  const ringOut = { r: 0, alpha: 0 };
  const fire = look === "fireball";
  return {
    code: fire ? "EX1-A" : "EX2-A",
    title: fire ? "Photoreal fireball" : "Photoreal shockwave",
    note: fire
      ? "Same particles and timing. The flash is a white-hot core with short rays; flames cool from white to amber to red-brown; soot smoke is lit from the upper left; chunks are relit and drop shadows; the scorch is a real mark with blast rays and embers that die in 1.5 s; a warm light pool."
      : "Same particles and timing. A harder, whiter flash; the dust ring is lit concrete dust (tan, lit top-left, shaded bottom-right); more chunks, relit, with shadows that meet them when they land; a scorch with fewer embers.",
    async bake() {
      A = takeA();
    },
    textures: () => takeATextures(fire ? ["flame", "soot", "spark", "flash", "pool", "scorch", "scorchGlow", "chunks", "chunkShadows"] : ["flame", "soot", "dust", "spark", "flash", "pool", "scorch", "scorchGlow", "chunks", "chunkShadows"]),
    parts: PARTS_BLAST,
    frames: FRAMES_BLAST,
    draw(g, t, st) {
      const { p, ex } = sim.at(t, st.seed, st.low);
      const T = BLAST_TIMES[look];
      const pxm = st.pxm;
      const skip = (i: number): boolean => st.low && (i & 1) === 1; // ?fx=low: half the flames and puffs
      if (on(st, "mark")) {
        sprite(g, A.scorch, X(st, 0), Y(st, 0), 2 * R_BLAST * 0.95, pxm, ex.scorchRot[0] as number, ex.scorchAlpha(0, t) / 0.85 * 0.92);
        const ea = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 1.4);
        sprite(g, A.scorchGlow, X(st, 0), Y(st, 0), R_BLAST * 1.3, pxm, 0.7, ea * (fire ? 0.9 : 0.5), true);
      }
      const ga = t < 0.05 ? 1 : Math.max(0, 1 - (t - 0.05) / T.glowS);
      if (on(st, "light")) sprite(g, A.pool, X(st, 0), Y(st, 0), 2 * R_BLAST, pxm, 0, (fire ? 0.85 : 0.6) * ga, true);
      if (on(st, "smoke"))
        for (let i = 0; i < p.capacity; i++) {
          const k = p.kind[i];
          if ((k !== P_SMOKE && k !== P_DUST) || skip(i) || !p.draw(i, d) || d.alpha < 0.01) continue;
          const tone = Math.min(2, Math.floor(d.t * 3));
          const set = k === P_SMOKE ? A.soot : A.dust;
          sprite(g, (set[tone] as HTMLCanvasElement[])[d.variant % 3] as HTMLCanvasElement, X(st, d.x), Y(st, d.y), d.w * 1.05, pxm, d.rot, Math.min(0.85, d.alpha * 1.25), false, d.h * 1.05);
        }
      if (on(st, "debris"))
        for (let i = 0; i < p.capacity; i++) {
          if (p.kind[i] !== P_DEBRIS || !p.draw(i, d) || d.alpha < 0.01) continue;
          const z = p.z[i] as number;
          const c = i % 6;
          const ch = A.chunks[c] as HTMLCanvasElement;
          const sh = A.chunkShadows[c] as HTMLCanvasElement;
          const gy = d.y + z * 0.15;
          sprite(g, sh, X(st, d.x + 0.02 + z * 0.35), Y(st, gy + 0.03 + z * 0.45), d.w * 1.4 * (sh.width / ch.width), pxm, d.rot, d.alpha * Math.max(0.25, 0.75 - z * 0.3));
          sprite(g, ch, X(st, d.x), Y(st, d.y), d.w * 1.4, pxm, d.rot, d.alpha, false, d.h * 1.4);
        }
      if (on(st, "flame"))
        for (let i = 0; i < p.capacity; i++) {
          if (p.kind[i] !== P_FLAME || skip(i) || !p.draw(i, d) || d.alpha < 0.01) continue;
          const s = Math.min(FLAME_A_STEPS - 1, Math.floor(d.t * FLAME_A_STEPS * (fire ? 1 : 1.4)));
          sprite(g, (A.flame[s] as HTMLCanvasElement[])[d.variant % 4] as HTMLCanvasElement, X(st, d.x), Y(st, d.y), d.w * 1.1, pxm, d.rot, Math.min(1, d.alpha * 1.15), true, d.h * 1.1);
        }
      const fa = t < T.flashS ? 1 - t / T.flashS : 0;
      if (fa > 0 && on(st, "flash")) sprite(g, A.flash, X(st, 0), Y(st, 0), (fire ? 2.2 : 2.6) * R_BLAST * (0.7 + 0.3 * (t / T.flashS)), pxm, fire ? 0 : 0.4, Math.pow(fa, fire ? 1 : 0.7), true);
      if (on(st, "ring")) {
        const r = ex.ring(0, t, ringOut);
        ringStroke(g, st, 0, 0, r.r, fire ? 0.05 : 0.07, fire ? 0xffb060 : 0xf2eee6, r.alpha, 0.25);
      }
      if (on(st, "embers"))
        for (let i = 0; i < p.capacity; i++) {
          if (p.kind[i] !== P_EMBER || !p.draw(i, d) || d.alpha < 0.01) continue;
          sprite(g, A.spark, X(st, d.x), Y(st, d.y), d.w * 1.3, pxm, d.rot, d.alpha, true, d.h * 1.6);
        }
    },
  };
}
const PARTS_BLAST = [
  { id: "flash", label: "Flash" },
  { id: "light", label: "Light pool" },
  { id: "flame", label: "Flames" },
  { id: "smoke", label: "Smoke / dust" },
  { id: "debris", label: "Debris" },
  { id: "embers", label: "Sparks" },
  { id: "ring", label: "Edge ring" },
  { id: "mark", label: "Scorch" },
] as const;
const FRAMES_BLAST = [
  { label: "f0", t: 0.02, when: "the hit: flash at full" },
  { label: "f1", t: 0.08, when: "flash fading, flames out" },
  { label: "f2", t: 0.2, when: "flash gone, ring / dust at the edge" },
  { label: "f3", t: 0.5, when: "flames dying, chunks landing" },
  { label: "f4", t: 1.2, when: "smoke only" },
  { label: "f5", t: 2.6, when: "the mark stays" },
];

/* =============================== GR: rounds in flight =============================== */
const LAUNCH = { x0: -4, y0: -1.3, x1: 3.5, speed: 20 }; // weapons.json grenade_launcher.lobSpeedMps
const HAND = { x0: -4, y0: 1.3, x1: 3.5, speed: 12 }; // consumables.json grenades.throwSpeedMps
const ARC_M = 1.5; // combat.json explosion.fx.lobArcM
interface Pose {
  x: number;
  y: number;
  z: number;
  u: number;
  live: boolean;
}
function flightAt(f: { x0: number; y0: number; x1: number; speed: number }, t: number, out: Pose, t0 = 0): Pose {
  const dur = Math.max(0.25, (f.x1 - f.x0) / f.speed);
  const u = (t - t0) / dur;
  out.live = u >= 0 && u < 1;
  const uu = Math.max(0, Math.min(1, u));
  out.u = uu;
  out.x = f.x0 + (f.x1 - f.x0) * uu;
  out.y = f.y0;
  out.z = 4 * ARC_M * uu * (1 - uu);
  return out;
}
const PARTS_GR = [
  { id: "item", label: "Round / grenade" },
  { id: "shadow", label: "Shadow" },
  { id: "trail", label: "Smoke trail" },
] as const;
const FRAMES_GR = [
  { label: "launch", t: 0.03, when: "leaves the muzzle" },
  { label: "top", t: 0.2, when: "launcher round at the top of its arc" },
  { label: "mid", t: 0.33, when: "hand grenade at the top" },
  { label: "land", t: 0.6, when: "hand grenade about to land" },
];
function grLook(take: "now" | "A"): Look {
  let round: HTMLCanvasElement, shadow: HTMLCanvasElement, hand: HTMLCanvasElement, handSh: HTMLCanvasElement, roundSh: HTMLCanvasElement;
  let A: TakeA;
  const p: Pose = { x: 0, y: 0, z: 0, u: 0, live: false };
  return {
    code: take === "now" ? "now" : "GR-A",
    title: take === "now" ? "today" : "Relit, soft shadows, a smoke trail",
    note:
      take === "now"
        ? "Launcher round (top lane, 20 m/s) and hand grenade (bottom lane, 12 m/s, tumbling 2.2 turns), shown 3× / 2.2× their size to read on a phone, a flat shadow drifting down-right with height."
        : "The game's own drawings relit (metal volume, a glint from the upper left); the shadow is the item's own soft silhouette; the launcher round leaves a thin grey propellant trail (gone in 0.2 s). Sizes, arc and tumble unchanged.",
    async bake() {
      gameAtlases();
      round = G.round();
      shadow = G.roundShadow();
      hand = (G.hand()[1] as HTMLCanvasElement);
      if (take === "A") {
        A = takeA();
        round = relitFrame(round, 40, 11, 40 * 0.9);
        hand = relitFrame(hand, 64, 12, 64 * 0.9);
        roundSh = shadowOf(round, 2, 0.95);
        handSh = shadowOf(hand, 2, 0.95);
      }
    },
    textures: () => (take === "now" ? [{ name: "fx_grenaderound", canvas: round }, { name: "fx_grenadeshadow", canvas: shadow }, { name: "fx_handgrenade ×3", canvas: hand }] : [{ name: "round relit", canvas: round }, { name: "round shadow", canvas: roundSh }, { name: "hand grenade relit ×3", canvas: hand }, { name: "hand shadow ×3", canvas: handSh }, ...takeATextures(["soot"]).slice(6, 7)]),
    parts: take === "A" ? PARTS_GR : PARTS_GR.slice(0, 2),
    frames: FRAMES_GR,
    draw(g, t, st) {
      const pxm = st.pxm;
      // launcher round
      flightAt(LAUNCH, t, p);
      const head = 0;
      if (take === "A" && on(st, "trail")) {
        for (let k = 1; k <= 5; k++) {
          const tk = t - k * 0.035;
          const q = flightAt(LAUNCH, tk, { x: 0, y: 0, z: 0, u: 0, live: false });
          const age = k * 0.035 + (p.live ? 0 : t - Math.max(0, (LAUNCH.x1 - LAUNCH.x0) / LAUNCH.speed));
          if (!q.live && tk > 0) continue;
          if (tk < 0) continue;
          const a = Math.max(0, 0.6 * (1 - age / 0.22));
          sprite(g, (A.soot[1] as HTMLCanvasElement[])[k % 3] as HTMLCanvasElement, X(st, q.x), Y(st, q.y - q.z * 0.15), 0.12 + age * 1.2, pxm, k, a);
        }
      }
      if (p.live) {
        const s = (1 + p.z * 0.3) * 3;
        if (on(st, "shadow")) sprite(g, take === "now" ? shadow : roundSh, X(st, p.x + p.z * 0.35), Y(st, p.y + p.z * 0.45), ROUND_W_M * 3 * (take === "now" ? 1 : roundSh.width / round.width) * 0.95, pxm, head, Math.max(0.25, 0.8 - p.z * 0.25), false, ROUND_H_M * 3 * 0.9 * (take === "now" ? 1 : roundSh.height / round.height));
        if (on(st, "item")) sprite(g, round, X(st, p.x), Y(st, p.y - p.z * 0.15), ROUND_W_M * s * (take === "now" ? 1 : 1.1), pxm, head, 1, false, take === "now" ? ROUND_H_M * s : undefined);
      }
      // hand grenade
      flightAt(HAND, t, p);
      if (p.live) {
        const spin = p.u * Math.PI * 2 * 2.2;
        const s = (1 + p.z * 0.3) * 2.2;
        const fm = GRENADE_FRAME_M;
        if (on(st, "shadow")) sprite(g, take === "now" ? shadow : handSh, X(st, p.x + p.z * 0.35), Y(st, p.y + p.z * 0.45), fm.w * 2.2 * 0.8 * (take === "now" ? 1 : 1.25), pxm, spin, Math.max(0.25, 0.7 - p.z * 0.25), false, fm.h * 2.2 * 0.7 * (take === "now" ? 1 : 1.6));
        if (on(st, "item")) sprite(g, hand, X(st, p.x), Y(st, p.y - p.z * 0.15), fm.w * s * (take === "now" ? 1 : 1.12), pxm, spin, 1, false, take === "now" ? fm.h * s : undefined);
      }
    },
  };
}

/* =============================== MO: Molotov =============================== */
const MOL_R = 3; // consumables.json molotovs.radiusM
const MOL_DUR = 4; // molotovs.durationS
const MOL_FLIGHT = { x0: -4.5, y0: 0, x1: 0, speed: 12 };
const MOL_LAND = Math.max(0.3, (MOL_FLIGHT.x1 - MOL_FLIGHT.x0) / MOL_FLIGHT.speed); // minFlightS 0.3
/** One zone's budget as MolotovView sets it (consumables.json fx: share 0.25, smoke 0.1, edge 1.2 m, 1 light). */
const MOL_BUDGET = { share: Math.min(0.25, 80 / (1 * 80)), smoke: 0.1, edge: Math.max(1.2, (2 * Math.PI * MOL_R) / 64) };
const molEnv = (t: number): number => {
  const z = { x: 0, y: 0, radiusM: MOL_R, id: 1, startS: MOL_LAND, endS: MOL_LAND + MOL_DUR, spread: 0, dir: 0 };
  return t < MOL_LAND ? 0 : MolotovFires.envelope(z, t);
};
const molSim = (spread: number): Replay<CarFire> =>
  new Replay<CarFire>(
    (seed) => {
      const f = new CarFire(0x4f12 + seed * 7919, true); // MolotovView's FireView runs at low caps always
      f.setPoolBudget(MOL_BUDGET.share, MOL_BUDGET.smoke, MOL_BUDGET.edge);
      return f;
    },
    (f, dt, T) => {
      const age = T - MOL_LAND;
      if (age < 0) return;
      f.setPool(spread, 0, age, molEnv(T));
      f.update(dt, T, MOL_R);
    },
  );
const PARTS_FIRE = [
  { id: "item", label: "Bottle / rag" },
  { id: "light", label: "Light pool" },
  { id: "ring", label: "Damage ring" },
  { id: "flame", label: "Flames" },
  { id: "smoke", label: "Smoke" },
  { id: "embers", label: "Embers" },
  { id: "mark", label: "Fuel / scorch mark" },
] as const;
function drawCarFire(g: CanvasRenderingContext2D, st: Stage, f: CarFire, T: number, R: number, flameTex: (frame: number, tint: number) => HTMLCanvasElement, smokeTex: (frame: number, tint: number, t: number) => HTMLCanvasElement, emberTex: HTMLCanvasElement, d: FireDraw, aK = 1): void {
  const pxm = st.pxm;
  if (on(st, "smoke"))
    for (let i = 0; i < f.smoke.cap; i++) {
      if (!smokeDraw(f.smoke, i, "black", 0, 0, d) || d.alpha < 0.04) continue;
      const tt = (f.smoke.age[i] as number) / (f.smoke.life[i] as number);
      sprite(g, smokeTex(d.frame, d.tint, tt), X(st, d.x), Y(st, d.y), d.w, pxm, d.rot, Math.min(1, d.alpha * aK), false, d.h);
    }
  if (on(st, "flame")) {
    for (let i = 0; i < f.flames.cap; i++) {
      if (!flameDraw(f.flames, i, freeFlameFitR(R), d) || d.alpha < 0.01) continue;
      sprite(g, flameTex(d.frame, d.tint), X(st, d.x), Y(st, d.y), d.w, pxm, d.rot, d.alpha, true, d.h);
    }
    for (let i = 0; i < f.edgeN; i++) {
      if (!edgeFlameDraw(f, i, T, R, d)) continue;
      sprite(g, flameTex(d.frame, d.tint), X(st, d.x), Y(st, d.y), d.w, pxm, d.rot, d.alpha, true, d.h);
    }
  }
  if (on(st, "embers"))
    for (let i = 0; i < f.embers.cap; i++) {
      if (!emberDraw(f.embers, i, R, d) || d.alpha < 0.01) continue;
      // take A's spark texture is already a streak: no second stretch
      if (aK !== 1) sprite(g, emberTex, X(st, d.x), Y(st, d.y), d.h * 1.6, pxm, d.rot, d.alpha * 0.8, true, d.h * 0.7);
      else sprite(g, emberTex, X(st, d.x), Y(st, d.y), d.w, pxm, d.rot, d.alpha, true, d.h);
    }
}
function moLook(take: "now" | "A"): Look {
  const spread = 1; // MB2 forward splash (throwVariant of the landing point picks 0–2)
  const sim = molSim(spread);
  let flame: TintCache, smoke: TintCache, ember: HTMLCanvasElement, light: HTMLCanvasElement, ring: HTMLCanvasElement, bottle: HTMLCanvasElement, shadow: HTMLCanvasElement, rag: HTMLCanvasElement[], bottleSh: HTMLCanvasElement;
  let A: TakeA;
  const d: FireDraw = { x: 0, y: 0, w: 0, h: 0, rot: 0, alpha: 0, tint: 0, frame: 0 };
  const p: Pose = { x: 0, y: 0, z: 0, u: 0, live: false };
  return {
    code: take === "now" ? "now" : "MO-A",
    title: take === "now" ? "today (MB2 splash)" : "Photoreal Molotov",
    note:
      take === "now"
        ? "Bottle tumbling in (1.5× size, rag flame at 14 Hz), then the 4 s fire zone: fire-lab D particles at a quarter share, the edge flames where the fuel has reached the ring, a soft light, the thin orange ring at exactly 3 m."
        : "Same flight and fire. The rag burns with a real flame and lights the bottle; the bottle is relit and casts its own shadow. The splash leaves a dark wet fuel stain first, then the fire: temperature-coloured flames, lit soot, a flickering warm pool; the ring fades with the fire instead of popping off, and a scorch mark stays when the fire is out.",
    async bake() {
      gameAtlases();
      flame = new TintCache(G.fireFlame(), FLAME_TINTS);
      smoke = new TintCache(G.fireSmoke(), SMOKE_PALETTES.black);
      ember = G.fireEmber();
      light = G.fireLight();
      ring = tinted(G.molRing(), FIRE_RING_COLOR);
      bottle = G.bottle()[spread] as HTMLCanvasElement;
      shadow = G.roundShadow();
      rag = G.fireFlame();
      if (take === "A") {
        A = takeA();
        bottle = relitFrame(bottle, 72, 21, 72 * 0.9);
        bottleSh = shadowOf(bottle, 2, 0.7);
      }
    },
    textures: () =>
      take === "now"
        ? [{ name: "fx_molotov ×3", canvas: bottle }, { name: "fx_grenadeshadow", canvas: shadow }, { name: "fx_fireflame ×4", canvas: rag[0] as HTMLCanvasElement, note: "white mask" }, { name: "fx_firesmoke ×3", canvas: G.fireSmoke()[0] as HTMLCanvasElement }, { name: "fx_fireember", canvas: ember }, { name: "fx_firelight", canvas: light }, { name: "fx_molotovring", canvas: ring }]
        : [{ name: "bottle relit ×3", canvas: bottle }, { name: "bottle shadow ×3", canvas: bottleSh }, { name: "fx_molotovring (kept)", canvas: ring }, ...takeATextures(["flame", "soot", "spark", "pool", "fuel", "scorch"])],
    parts: PARTS_FIRE,
    frames: [
      { label: "flight", t: 0.2, when: "bottle in the air" },
      { label: "splash", t: MOL_LAND + 0.15, when: "fuel spreading (MB2 forward)" },
      { label: "full", t: MOL_LAND + 0.8, when: "the ring is reached: full fire" },
      { label: "burn", t: MOL_LAND + 2.5, when: "burning (damage every 0.5 s)" },
      { label: "fade", t: MOL_LAND + 3.7, when: "last 0.6 s: fading" },
      { label: "out", t: MOL_LAND + 4.2, when: "zone over" },
    ],
    draw(g, t, st) {
      const pxm = st.pxm;
      const f = sim.at(t, st.seed, st.low);
      const env = molEnv(t);
      const age = t - MOL_LAND;
      if (take === "A" && age >= 0 && on(st, "mark")) {
        const spreadK = easeOut(age / 0.45);
        sprite(g, A.fuel, X(st, 0.25), Y(st, 0), 2 * MOL_R * 0.98 * spreadK, pxm, 0.3, Math.min(0.85, 0.85 * Math.min(1, age / 0.1)));
        sprite(g, A.scorch, X(st, 0.1), Y(st, 0), 2 * MOL_R * 0.9, pxm, 1.1, Math.min(0.7, Math.max(0, (age - 0.3) / 3.5) * 0.7));
      }
      if (age >= 0 && env > 0) {
        if (on(st, "light")) {
          const fl = fireFlicker(t, 0.7);
          if (take === "now") sprite(g, light, X(st, 0), Y(st, 0), 2 * MOL_R, pxm, 0, 0.13 * env * fl, true);
          else sprite(g, A.pool, X(st, 0), Y(st, 0), 2 * MOL_R * 0.95, pxm, 0, 0.32 * env * fl, true);
        }
        if (on(st, "ring")) {
          const dm = ringDisplayM(MOL_R);
          sprite(g, ring, X(st, 0), Y(st, 0), dm, pxm, 0, take === "now" ? FIRE_RING_ALPHA : FIRE_RING_ALPHA * Math.max(env, 0.0));
          if (take === "A") sprite(g, ring, X(st, 0), Y(st, 0), dm * 1.01, pxm, 0, 0.18 * env * fireFlicker(t * 0.7, 2), true);
        }
        if (take === "now") drawCarFire(g, st, f, t, MOL_R, (fr, ti) => flame.get(fr, FLAME_TINTS[flameStep(ti)] as number), (fr, ti) => smoke.get(fr, ti), ember, d);
        else
          drawCarFire(
            g,
            st,
            f,
            t,
            MOL_R,
            (fr, ti) => (A.flame[stepA(ti)] as HTMLCanvasElement[])[fr % 4] as HTMLCanvasElement,
            (fr, _ti, tt) => (A.soot[Math.min(2, Math.floor(tt * 3))] as HTMLCanvasElement[])[fr % 3] as HTMLCanvasElement,
            A.spark,
            d,
            1.2,
          );
      } else if (take === "now" && age >= 0 && on(st, "ring")) {
        /* the game hides the ring with the zone */
      }
      // the bottle in flight
      flightAt(MOL_FLIGHT, t, p);
      if (p.live) {
        const spin = p.u * Math.PI * 2 * 1.6;
        const s = (1 + p.z * 0.3) * 1.5;
        const fm = MOLOTOV_FRAME_M;
        const y = p.y - p.z * 0.15;
        if (on(st, "item")) {
          if (take === "now") sprite(g, shadow, X(st, p.x + p.z * 0.35), Y(st, p.y + p.z * 0.45), fm.w * 1.5 * 0.8, pxm, spin, Math.max(0.25, 0.7 - p.z * 0.25), false, fm.h * 1.5 * 0.7);
          else sprite(g, bottleSh, X(st, p.x + p.z * 0.35), Y(st, p.y + p.z * 0.45), fm.w * 1.5 * 1.1, pxm, spin, Math.max(0.25, 0.7 - p.z * 0.25));
          sprite(g, bottle, X(st, p.x), Y(st, y), fm.w * s * (take === "now" ? 1 : 1.12), pxm, spin, 1, false, take === "now" ? fm.h * s : undefined);
          const nx = (MOLOTOV_RAG_X_M[spread] ?? 0.15) * s;
          const rx = p.x + Math.cos(spin) * nx;
          const ry = y + Math.sin(spin) * nx - 0.26 * 0.25 * s;
          if (take === "now") sprite(g, rag[Math.floor(t * 14) % 4] as HTMLCanvasElement, X(st, rx), Y(st, ry), 0.26 * s, pxm, 0, 0.85, true);
          else {
            sprite(g, A.pool, X(st, rx), Y(st, ry + 0.1), 0.9, pxm, 0, 0.35 * fireFlicker(t, 1), true);
            sprite(g, (A.flame[1] as HTMLCanvasElement[])[Math.floor(t * 14) % 4] as HTMLCanvasElement, X(st, rx), Y(st, ry - 0.04 * s), 0.3 * s, pxm, -Math.PI / 2 + Math.sin(t * 20) * 0.3, 0.95, true);
            sprite(g, (A.soot[2] as HTMLCanvasElement[])[Math.floor(t * 7) % 3] as HTMLCanvasElement, X(st, rx - 0.25), Y(st, ry - 0.05), 0.35, pxm, t * 3, 0.25);
          }
        }
      }
    },
  };
}

/* =============================== FI: fire (fire-lab D, a burning car) =============================== */
const FI_R = 2; // decay.json fire.radiusM
const FI_WARM = 3; // the loop starts after 3 s of burning
const fiSim = (): Replay<CarFire> =>
  new Replay<CarFire>(
    (seed, low) => {
      const f = new CarFire(0x4f12 + seed * 7919, low);
      f.setCar(0.35);
      return f;
    },
    (f, dt, T) => f.update(dt, T, FI_R),
  );
function fiLook(take: "now" | "A"): Look {
  const sim = fiSim();
  let flame: TintCache, smoke: TintCache, ember: HTMLCanvasElement, light: HTMLCanvasElement;
  let A: TakeA;
  const d: FireDraw = { x: 0, y: 0, w: 0, h: 0, rot: 0, alpha: 0, tint: 0, frame: 0 };
  return {
    code: take === "now" ? "now" : "FI-A",
    title: take === "now" ? "fire-lab D today" : "Photoreal fire",
    note:
      take === "now"
        ? "A burning wreck (2 m zone): fuel flames on the car and round the ring, black smoke drifting with the wind, embers, a soft light, the orange ring at the damage edge."
        : "Same particles and wind. Flames cool from white to amber to red-brown, so the hot core reads where the fuel is; soot is lit from the upper left with a warm belly from the flames; the light pool flickers stronger; soot blackens the ground under the wreck.",
    async bake() {
      gameAtlases();
      flame = new TintCache(G.fireFlame(), FLAME_TINTS);
      smoke = new TintCache(G.fireSmoke(), SMOKE_PALETTES.black);
      ember = G.fireEmber();
      light = G.fireLight();
      if (take === "A") A = takeA();
    },
    textures: () => (take === "now" ? [{ name: "fx_fireflame ×4", canvas: G.fireFlame()[0] as HTMLCanvasElement, note: "white mask, 16 tints" }, { name: "fx_firesmoke ×3", canvas: G.fireSmoke()[0] as HTMLCanvasElement }, { name: "fx_fireember", canvas: ember }, { name: "fx_firelight", canvas: light }] : takeATextures(["flame", "soot", "spark", "pool", "scorch"])),
    parts: PARTS_FIRE.slice(1),
    frames: [
      { label: "a", t: 0, when: "steady burning" },
      { label: "b", t: 0.12, when: "a few frames later" },
      { label: "c", t: 1.5, when: "1.5 s later" },
    ],
    draw(g, t, st) {
      const T = t + FI_WARM;
      const f = sim.at(T, st.seed, st.low);
      const pxm = st.pxm;
      const fl = fireFlicker(T, 0.7);
      if (take === "A" && on(st, "mark")) sprite(g, A.scorch, X(st, 0.2), Y(st, 0.1), 2 * FI_R * 1.1, pxm, 0.35, 0.55);
      if (on(st, "light")) {
        if (take === "now") sprite(g, light, X(st, 0), Y(st, 0), 2 * FI_R, pxm, 0, 0.13 * fl, true);
        else sprite(g, A.pool, X(st, 0), Y(st, 0), 2 * FI_R * 1.05, pxm, 0, 0.36 * fl, true);
      }
      if (on(st, "ring")) {
        // CityView: a 2 px orange ring + a 5 px glow (fireRing.ts)
        countSprite();
        g.save();
        g.strokeStyle = hex(FIRE_RING_COLOR);
        g.globalAlpha = 0.1;
        g.lineWidth = 5;
        g.beginPath();
        g.arc(X(st, 0), Y(st, 0), FI_R * pxm, 0, Math.PI * 2);
        g.stroke();
        g.globalAlpha = FIRE_RING_ALPHA;
        g.lineWidth = 2;
        g.stroke();
        g.restore();
      }
      if (take === "now") drawCarFire(g, st, f, T, FI_R, (fr, ti) => flame.get(fr, FLAME_TINTS[flameStep(ti)] as number), (fr, ti) => smoke.get(fr, ti), ember, d);
      else
        drawCarFire(
          g,
          st,
          f,
          T,
          FI_R,
          (fr, ti) => (A.flame[stepA(ti)] as HTMLCanvasElement[])[fr % 4] as HTMLCanvasElement,
          (fr, _ti, tt) => (A.soot[Math.min(2, Math.floor(tt * 3))] as HTMLCanvasElement[])[fr % 3] as HTMLCanvasElement,
          A.spark,
          d,
          1.15,
        );
    },
  };
}

/* =============================== FS: flamethrower (FS1) and gas torch (FS2) =============================== */
const FS_ON = 1.6;
const FLAMERS = [
  { x: -3.2, y: -1.5, range: 6, half: (10 * Math.PI) / 180, style: FLAME_STYLE.JET, w: "flamethrower" }, // weapons.json flamethrower: range 6, cone 20°
  { x: -3.2, y: 1.7, range: 3, half: (30 * Math.PI) / 180, style: FLAME_STYLE.TORCH, w: "gas_torch" }, // gas_torch: range 3, cone 60°
] as const;
const SURV_R = 0.4;
const fsSim = (): Replay<FlameJets> =>
  new Replay<FlameJets>(
    (_seed, low) => new FlameJets(low ? 48 : 96), // combat.json fx.maxFlameParticles (halved with ?fx=low)
    (J, dt, T) => {
      if (T <= FS_ON) FLAMERS.forEach((f, k) => J.emit(k, dt, 90, f.style, f.x + SURV_R + 0.1, f.y, 1, 0, f.range, f.half, 0.4, () => -1)); // fx.flameParticlesPerS 90 (45 low: the shell's low only halves the cap here)
      J.step(dt);
    },
  );
function fsLook(take: "now" | "A"): Look {
  const sim = fsSim();
  let flame: TintCache, light: HTMLCanvasElement, s1: HTMLCanvasElement, s2: HTMLCanvasElement;
  let A: TakeA;
  const d: JetDraw = { x: 0, y: 0, w: 0, h: 0, rot: 0, alpha: 0, tint: 0, frame: 0 };
  return {
    code: take === "now" ? "now" : "FS-A",
    title: take === "now" ? "FS1 jet (top), FS2 torch (bottom), today" : "Photoreal streams",
    note:
      take === "now"
        ? "1.6 s of fire, then release. FS1: a narrow fuel jet blooming late (6 m, 20°). FS2: a short wide torch with a blue core at the nozzle (3 m, 60°). A warm floor glow along each cone."
        : "Same rays, reach and cones. FS1's fuel burns white at the core and cools to amber and red-brown at the tips; FS2 keeps its blue-white core, then amber. A pilot light at each nozzle; the floor glow is a warm pool; thin soot wisps rise from the stream's end and drift off for 0.8 s after release.",
    async bake() {
      gameAtlases();
      flame = new TintCache(G.fireFlame(), [...FLAME_TINTS, TORCH_BLUE]);
      light = tinted(G.fireLight(), 0xff9a40);
      s1 = G.survivor("flamethrower");
      s2 = G.survivor("gas_torch");
      if (take === "A") A = takeA();
    },
    textures: () => (take === "now" ? [{ name: "fx_fireflame ×4", canvas: G.fireFlame()[0] as HTMLCanvasElement, note: "16 tints + blue" }, { name: "fx_firelight (tinted)", canvas: light }] : takeATextures(["flame", "torch", "pool", "flash", "soot"])),
    parts: [
      { id: "flame", label: "Flames" },
      { id: "light", label: "Floor glow" },
      { id: "smoke", label: "Soot wisps" },
      { id: "flash", label: "Pilot light" },
    ],
    frames: [
      { label: "open", t: 0.1, when: "trigger: the jet builds" },
      { label: "full", t: 0.6, when: "full stream" },
      { label: "full'", t: 0.63, when: "two frames later" },
      { label: "release", t: 1.75, when: "released: the last rays fly out" },
      { label: "after", t: 2.2, when: "gone (wisps in A)" },
    ],
    draw(g, t, st) {
      const J = sim.at(t, st.seed, st.low);
      const pxm = st.pxm;
      FLAMERS.forEach((f, k) => {
        const ox = f.x + SURV_R + 0.1;
        const len = f.range;
        const wide = Math.max(0.8, 2 * len * Math.tan(f.half));
        const firing = t <= FS_ON;
        if (firing && on(st, "light")) {
          if (take === "now") sprite(g, light, X(st, ox + len * 0.55), Y(st, f.y), len * 1.15, pxm, 0, 0.38 * fireFlicker(t, k * 1.7), true, wide * 1.1);
          else sprite(g, A.pool, X(st, ox + len * 0.5), Y(st, f.y), len * 1.1, pxm, 0, 0.42 * fireFlicker(t, k * 1.7), true, wide * 1.05);
        }
        if (take === "A" && on(st, "smoke"))
          for (let j = 0; j < 6; j++) {
            const born = Math.floor((t - j * 0.13) / 0.78) * 0.78 + j * 0.13;
            if (born < 0.2 || born > FS_ON) continue;
            const u = (t - born) / 0.78;
            const sx = ox + len * (0.8 + 0.06 * j) + 0.55 * 1.6 * u;
            const sy = f.y + ((j % 3) - 1) * wide * 0.18 + (0.32 * 1.4 - 0.2) * u - 0.3 * u;
            sprite(g, (A.soot[1 + (j & 1)] as HTMLCanvasElement[])[j % 3] as HTMLCanvasElement, X(st, sx), Y(st, sy), 0.35 + u * 0.9, pxm, j + u, 0.5 * (1 - u) * Math.min(1, u * 5));
          }
        if (take === "A" && firing && on(st, "flash")) sprite(g, A.flash, X(st, ox + 0.15), Y(st, f.y), 0.45, pxm, t * 5, 0.5 + 0.2 * fireFlicker(t * 2, k), true);
      });
      if (on(st, "flame"))
        for (let i = 0; i < J.cap; i++) {
          if (!J.draw(i, t, d)) continue;
          let tex: HTMLCanvasElement;
          if (take === "now") tex = flame.get(d.frame, d.tint);
          else if (d.tint === TORCH_BLUE) tex = A.torch[d.frame % 4] as HTMLCanvasElement;
          else tex = (A.flame[stepA(d.tint)] as HTMLCanvasElement[])[d.frame % 4] as HTMLCanvasElement;
          sprite(g, tex, X(st, d.x), Y(st, d.y), d.w * (take === "A" ? 1.08 : 1), pxm, d.rot, d.alpha, true, d.h * (take === "A" ? 1.1 : 1));
        }
      void s1;
      void s2;
    },
  };
}

/* =============================== BX: Bloater burst =============================== */
const BL_BLAST = 2.5; // zombies.json bloater explode.blastRadiusM
const BL_GAS_R = 2.5; // gasRadiusM
const BL_GAS_S = 4; // gasS
const SCRAP_TINTS = [0xc9cbbd, 0xb39b33, 0x4a4f58, 0x3c5d5e, 0xa9b455] as const;
const bxSim = (): Replay<BloaterFx> =>
  new Replay<BloaterFx>(
    (seed, low) => {
      const fx = new BloaterFx(24, low ? 120 : 240, BL_GAS_R, BL_GAS_S); // zombies.json blasts.maxGasClouds 24; controls.json fx.maxBloaterParticles 240
      for (let k = 0; k < seed % 5; k++) fx.burst(0, 0, -100); // rotate the seeded stream per loop like later bursts would
      fx.clear();
      fx.burst(0, 0, 0);
      fx.update(0);
      return fx;
    },
    (fx, _dt, T) => fx.update(T),
  );
function bxLook(take: "now" | "A" | "B"): Look {
  const sim = bxSim();
  let clouds: HTMLCanvasElement[], flash: HTMLCanvasElement, bile: HTMLCanvasElement[], scraps: HTMLCanvasElement[], puff: HTMLCanvasElement;
  let A: TakeA;
  let bileSh: HTMLCanvasElement[] = [];
  let bileGlow: HTMLCanvasElement[] = [];
  let drop: HTMLCanvasElement;
  return {
    code: take === "now" ? "now" : take === "A" ? "BX-A" : "BX-B",
    title: take === "now" ? "today" : take === "A" ? "Photoreal burst" : "A + glowing bile",
    note:
      take === "now"
        ? "A yellow-green flash (0.14 s), the shock ring out to 2.5 m in 0.1 s, bile drops flying and landing as splats, cloth scraps, a 4 s gas cloud (two turning layers + puffs) with its edge ring."
        : take === "A"
          ? "Same particles and timing. The flash is a short white-to-yellow-green burst (infection is the one fluid that glows); bile is wet and glossy, relit, with shadows under drops in flight; splats are wet with darker rims; scraps relit; the gas is a lit volume (lit top-left) instead of flat glows. Rings unchanged."
          : "Take A, and the bile on the ground glows faintly yellow-green, pulsing every 1.2 s, until the cloud clears: a clearer 'don't step here', at the cost of a few more additive sprites.",
    async bake() {
      gameAtlases();
      clouds = G.gasClouds();
      flash = G.bloaterFlash();
      bile = G.bile();
      scraps = SCRAP_TINTS.map((t) => tinted(G.scrap(), t));
      puff = tinted(G.glow(), 0xb9c65e);
      if (take !== "now") {
        A = takeA();
        bile = bile.map((b, i) => relitFrame(b, 64, 31 + i, 64 * 0.7));
        bileSh = bile.map((b) => shadowOf(b, 2, 0.55));
        scraps = scraps.map((s, i) => relitFrame(s, 40, 41 + i, 40 * 0.8));
        drop = bile[2] as HTMLCanvasElement;
        if (take === "B")
          bileGlow = bile.map((b) => {
            const c = make(b.width, b.height);
            const g = c.getContext("2d")!;
            g.filter = "blur(3px)";
            g.drawImage(b, 0, 0);
            g.filter = "none";
            g.globalCompositeOperation = "source-in";
            g.fillStyle = "rgba(196,236,96,1)";
            g.fillRect(0, 0, c.width, c.height);
            return c;
          });
      }
    },
    textures: () =>
      take === "now"
        ? [{ name: "fx_gascloud ×2", canvas: clouds[0] as HTMLCanvasElement }, { name: "fx_explosionbloater", canvas: flash }, { name: "fx_bilesplat ×4", canvas: bile[0] as HTMLCanvasElement }, { name: "fx_clothscrap ×5 tints", canvas: scraps[0] as HTMLCanvasElement }, { name: "fx_glow (puff)", canvas: puff }]
        : [...bile.map((b, i) => ({ name: `bile relit ${i}`, canvas: b })), ...bileSh.slice(0, 1).map((b) => ({ name: "bile shadow ×4", canvas: b })), ...scraps.slice(0, 1).map((s) => ({ name: "scrap relit ×5", canvas: s })), ...bileGlow.slice(0, 1).map((s) => ({ name: "bile glow ×4 (B)", canvas: s })), ...takeATextures(["gas", "flashGas"])],
    parts: [
      { id: "flash", label: "Flash" },
      { id: "ring", label: "Shock + gas rings" },
      { id: "matter", label: "Bile drops, splats" },
      { id: "scrap", label: "Cloth scraps" },
      { id: "smoke", label: "Gas cloud" },
    ],
    frames: [
      { label: "burst", t: 0.02, when: "the burst: flash, ring starting" },
      { label: "ring", t: 0.09, when: "the shock ring reaches 2.5 m" },
      { label: "fly", t: 0.25, when: "drops and scraps flying" },
      { label: "land", t: 0.7, when: "splats on the ground" },
      { label: "gas", t: 2.5, when: "the cloud holds" },
      { label: "clear", t: 3.7, when: "fading out (last 1 s)" },
    ],
    draw(g, t, st) {
      const fx = sim.at(t, st.seed, st.low);
      const pxm = st.pxm;
      const a = fx.cloudAlpha(0, t);
      const cx = fx.cloudX[0] as number;
      const cy = fx.cloudY[0] as number;
      const D = 2 * BL_GAS_R;
      const pulse = 0.7 + 0.3 * Math.pow(Math.max(0, Math.cos((t / 1.2) * Math.PI * 2)), 4);
      // splats and grounded scraps (depth 1.58)
      for (let i = 0; i < fx.maxParticles; i++) {
        if (fx.on[i] !== 1) continue;
        const k = fx.kind[i];
        const owner = fx.owner[i] as number;
        const ca = owner >= 0 ? fx.cloudAlpha(owner, t) : 1;
        const s = fx.size[i] as number;
        const x = fx.x[i] as number;
        const y = fx.y[i] as number;
        if (k === BURST_SPLAT && on(st, "matter")) {
          const b = bile[(fx.tone[i] as number) & 3] as HTMLCanvasElement;
          sprite(g, b, X(st, x), Y(st, y), s * (take === "now" ? 1 : 1.05), pxm, fx.rot[i] as number, 0.9 * ca, false, s * 0.8 * (take === "now" ? 1 : 1.05));
          if (take === "B") sprite(g, bileGlow[(fx.tone[i] as number) & 3] as HTMLCanvasElement, X(st, x), Y(st, y), s * 1.15, pxm, fx.rot[i] as number, 0.38 * ca * pulse, true, s * 0.9);
        }
        if (k === BURST_SCRAP && (fx.z[i] as number) <= 0 && on(st, "scrap")) sprite(g, scraps[(fx.tone[i] as number) % 5] as HTMLCanvasElement, X(st, x), Y(st, y), s * 1.6, pxm, fx.rot[i] as number, ca, false, take === "now" ? s : undefined);
      }
      // the cloud (6.6) and its puffs
      if (a > 0 && on(st, "smoke")) {
        if (take === "now") {
          sprite(g, clouds[0] as HTMLCanvasElement, X(st, cx), Y(st, cy), D, pxm, t * 0.05, 0.42 * a);
          sprite(g, clouds[1] as HTMLCanvasElement, X(st, cx), Y(st, cy), D, pxm, -t * 0.08, 0.22 * a);
        } else {
          sprite(g, (A.gas[1] as HTMLCanvasElement[])[0] as HTMLCanvasElement, X(st, cx), Y(st, cy), D * 1.05, pxm, t * 0.05, 0.5 * a);
          sprite(g, (A.gas[2] as HTMLCanvasElement[])[1] as HTMLCanvasElement, X(st, cx), Y(st, cy), D * 0.95, pxm, 1.3 - t * 0.08, 0.32 * a);
        }
        for (let i = 0; i < fx.maxParticles; i++) {
          if (fx.on[i] !== 1 || fx.kind[i] !== BURST_PUFF) continue;
          if (take !== "now" && st.low && (i & 1)) continue;
          const owner = fx.owner[i] as number;
          const ca = owner >= 0 ? fx.cloudAlpha(owner, t) : 1;
          const grow = 1 + Math.min(1, (fx.age[i] as number) / 1.5) * 0.25;
          const s = (fx.size[i] as number) * grow * 2;
          if (take === "now") sprite(g, puff, X(st, fx.x[i] as number), Y(st, fx.y[i] as number), s, pxm, 0, 0.26 * ca);
          else sprite(g, (A.gas[Math.min(2, Math.floor(((fx.age[i] as number) / BL_GAS_S) * 3))] as HTMLCanvasElement[])[i % 3] as HTMLCanvasElement, X(st, fx.x[i] as number), Y(st, fx.y[i] as number), s * 0.8, pxm, (fx.rot[i] as number) + (fx.age[i] as number) * 0.2, 0.34 * ca);
        }
      }
      // rings (6.7)
      if (on(st, "ring")) {
        ringStroke(g, st, cx, cy, BL_GAS_R, 0.045, 0xcde178, 0.45 * a);
        const ra = t < BURST_RING_S ? 0.85 : Math.max(0, 0.85 - (t - BURST_RING_S) / BURST_RING_FADE_S);
        ringStroke(g, st, cx, cy, BL_BLAST * Math.min(1, t / BURST_RING_S), 0.07, 0xe4f0a0, ra, take === "now" ? 0 : 0.2);
      }
      // the flash and everything in the air (11.6)
      if (t < BURST_FLASH_S && on(st, "flash")) {
        const f = 1 - t / BURST_FLASH_S;
        if (take === "now") sprite(g, flash, X(st, cx), Y(st, cy), D * 0.9, pxm, 0, f * f, true);
        else sprite(g, A.flashGas, X(st, cx), Y(st, cy), D * 0.85, pxm, 0.3, f * f, true);
      }
      for (let i = 0; i < fx.maxParticles; i++) {
        if (fx.on[i] !== 1) continue;
        const k = fx.kind[i];
        const s = fx.size[i] as number;
        const z = fx.z[i] as number;
        const x = fx.x[i] as number;
        const y = fx.y[i] as number;
        if (k === BURST_DROP && on(st, "matter")) {
          const sp = Math.hypot(fx.vx[i] as number, fx.vy[i] as number);
          const stv = 1 + Math.min(1.5, sp * 0.25);
          const rot = Math.atan2(fx.vy[i] as number, fx.vx[i] as number);
          const w = s * (1.6 + z * 0.4) * stv;
          const h = s * (1.6 + z * 0.4);
          if (take === "now") sprite(g, bile[(fx.tone[i] as number) & 3] as HTMLCanvasElement, X(st, x), Y(st, y - z * 0.15), w, pxm, rot, 0.95, false, h);
          else {
            sprite(g, bileSh[2] as HTMLCanvasElement, X(st, x + z * 0.35), Y(st, y + z * 0.45), w * 0.8, pxm, rot, 0.4, false, h * 0.8);
            sprite(g, drop, X(st, x), Y(st, y - z * 0.15), w * 0.75, pxm, rot, 0.95, false, h * 0.6);
          }
        } else if (k === BURST_SCRAP && z > 0 && on(st, "scrap")) {
          if (take !== "now") sprite(g, bileSh[0] as HTMLCanvasElement, X(st, x + z * 0.35), Y(st, y + z * 0.45), s * 1.4, pxm, fx.rot[i] as number, 0.3, false, s * 0.9);
          sprite(g, scraps[(fx.tone[i] as number) % 5] as HTMLCanvasElement, X(st, x), Y(st, y - z * 0.15), s * 1.6, pxm, fx.rot[i] as number, 1, false, take === "now" ? s : undefined);
        }
      }
    },
  };
}

/* =============================== the cards =============================== */
const plain = (s: string): string => s;
const ADDNOTE = "Additive sprites are cropped to their visible circle (flash, light pool and ember textures are radial, so the square holds only the circle's corners); Story 9.15 measured ≈ 1 FPS per full-frame ADD sprite, and none of these covers more than about a fifth of the phone view at game zoom.";

export const cards: FxCard[] = [
  {
    id: "ex1",
    code: "EX1",
    name: "Grenade launcher blast (fireball)",
    family: "fire",
    brief: plain(
      "<b>Light, then matter, then the mark.</b> The flash is light: a white-hot core with short soft rays, then the fireball cools by temperature (white → amber → red-brown, never the boss's warning red). The <b>light pool</b> lights the street for 0.7 s. Matter follows: soot smoke lit by the street's one light from the upper left, with a warm belly while the fire is under it; chunks relit, dropping shadows that meet them when they land. The <b>scorch</b> stays: soot, blast rays, embers dying in the first 1.5 s. The amber ring stays exactly on the 2.5 m damage edge."
    ),
    game: "<code>ExplosionView.ts</code> + <code>grenadeFx.ts › BlastParticles / Explosions</code>, atlas <code>atlas_blastfx</code>. One blast: 34 flames (ADD, 16 ramp tints), 10 smoke puffs (black palette), 16 embers (ADD), 6 debris; flash 0.18 s (2.2 R), ground glow 2 R for 0.7 s (ADD), amber edge ring 0.05 m on R for 0.5 s, scorch decal 2 R fading over 30 s (or at the next build). Shared pool: <code>combat.json › explosion.fx</code> maxExplosionParticles 96, maxLiveExplosions 8, maxScorchDecals 16.",
    perf: `Now: up to 52 additive sprites per blast (34 flames + 16 embers + flash + glow), all in the shared 96-particle pool. EX1-A: the same sprites plus 1 additive (the scorch embers, 1.3 R wide) and 6 debris shadows (normal blend); textures +2.4 MB (24 flame steps × 96², 9 smoke 96², chunks 6 × ≈ 48², scorch 256², flash 192², pool 128²); bake ≈ 0.3 s, once per game. <code>?fx=low</code> (new in A): half the flames and puffs (today explosions ignore <code>?fx=low</code>). Largest additive: the flash, 5.5 m wide for 0.18 s. EX1-G: 30 additive (26 fireball flames, front, flash, pool, scorch embers) + 21 normal (scorch, 8 smoke, 6 chunks + 6 shadows): about 51 sprites at the peak, no sparks; <code>?fx=low</code>: 13 flames, 4 smoke (37). New textures: blast front ×3 temperatures, 256² each (768 KB); the rest shared with A. Largest additive: the front, 5.2 m square for 0.4 s (a ring cannot be cropped; its inner 45 % is empty pixels). ${ADDNOTE}`,
    findings: [
      "<b>Debris has no shadow</b> today: chunks are drawn 0.15 m up the screen per metre of height but nothing touches the ground, so they float. A adds a soft shadow that meets the chunk when it lands.",
      "<b><code>?fx=low</code> does not reach explosions</b>: <code>ExplosionView</code> always uses the full 96-particle pool. A halves flames and puffs with it.",
      "The late flame tints (deep red 74,13,6) add almost nothing in ADD, so old flames vanish instead of darkening: fine for a blast, and A keeps it (red-brown fringe only).",
      "Checked and fine: smoke stays under zombies (depth 4.37, the 4.12 rule); the flame cores stop at the 2.5 m edge (<code>FLAME_CORE_FRAC</code>); the ring ends exactly on R.",
      "<b>Question</b>: EX1's edge ring is amber (0xffb060), and amber means an event you can use. Keep it, or make it the flame's orange?",
      "<b>EX1-G answers it by colour meaning</b>: no ring. A blast front really is round, so the reach is the fireball's own front of light, which cools like flame (white → orange → red-brown) and is gone by 0.4 s; the scorch's rays end at R afterwards. Amber stays free for events you can use.",
      "EX1-G cuts the flying sparks: they had no job the flash and the front don't already do, and they crossed the 2.5 m edge, blurring the reach.",
    ],
    lengthS: 3.2,
    gapS: 0.5,
    keyT: [0.02, 0.08, 0.2, 0.5, 1.2, 2.8],
    viewM: 8,
    looks: [blastNow("fireball"), blastA("fireball"), ex1G()],
    plan: {
      goal: "A blast you feel in 0.2 s and can read the size of: the flash says where, the ring says how far, the smoke and the scorch say it happened here.",
      timing: "BLAST_TIMES.fireball (grenadeFx.ts): flash 0.18 s, glow 0.7 s, ring 0.5 s; flames 0.35–0.8 s, embers 0.4–1 s, smoke 2.4–3.2 s, debris 1.5–2.5 s; scorch 30 s. Damage lands on the event tick (t = 0); camera shake within 6 m.",
      lengthS: 3.2,
      lanes: {
        light: [
          { t0: 0, t1: 0.18, label: "flash: core + rays", key: true },
          { t0: 0, t1: 0.75, label: "light pool 2R (A: warmer)" },
        ],
        core: [
          { t0: 0, t1: 0.8, label: "fireball: white → amber → red-brown", nw: true },
          { t0: 0, t1: 0.5, label: "amber ring on 2.5 m" },
        ],
        matter: [
          { t0: 0, t1: 1, label: "sparks fly out" },
          { t0: 0, t1: 2.5, label: "chunks fly, land, A: shadows meet them", nw: true },
        ],
        smoke: [{ t0: 0.05, t1: 3.2, label: "soot rises, lit top-left, warm belly early (A)", nw: true }],
        mark: [
          { t0: 0, t1: 0.15, label: "scorch in", key: true },
          { t0: 0.1, t1: 1.5, label: "embers in the scorch (A)", nw: true },
          { t0: 1.5, t1: 3.2, label: "scorch stays (30 s / next build)" },
        ],
        game: [
          { t0: 0, t1: 0.05, label: "damage + bang", key: true },
          { t0: 0, t1: 0.22, label: "shake (≤ 6 m)" },
        ],
      },
    },
  },
  {
    id: "ex2",
    code: "EX2",
    name: "Mine and hand-grenade blast (shockwave)",
    family: "fire",
    brief: "<b>A hard white hit, then dust.</b> Less fire, more force: a whiter, harder flash; the dust ring is concrete dust rolling out and stopping exactly on the 2.5 m edge, lit from the upper left (tan tops, shaded undersides); 18 chunks thrown hard, relit, landing on their shadows; a short spray of sparks. The scorch is lighter than EX1's and has fewer embers.",
    game: "<code>ExplosionView.ts</code> (shockwave look), <code>mineBlast.ts</code> shake (≤ 6 m, 220 ms). 8 short flames, 24 dust puffs rolling to the edge in 0.32 s (6 dust tints), 18 debris, 14 sparks, 4 smoke puffs; flash 0.12 s (2.6 R), glow 0.3 s, a white ring growing to R in 0.25 s then fading 0.45 s; scorch as EX1. Same shared pool (96 / 8 / 16).",
    perf: `Now: up to 24 additive sprites per blast (8 flames + 14 sparks + flash + glow). EX2-A: the same plus 1 additive scorch-embers sprite and up to 18 debris shadows (normal). Textures shared with EX1-A (+0.3 MB for the dust set). <code>?fx=low</code> in A halves flames and dust puffs. Largest additive: the flash, 6.5 m wide for 0.12 s. EX2-G: 16 additive (14 fragments for 0.12 s, flash, pool) + 55 normal (crater + cracks, settled dust, 28 dust puffs + 5 veil, 10 chunks + 10 shadows); no flames; <code>?fx=low</code>: 7 fragments, 14 + 3 dust (≈ 44). New textures: cracks 256², dust band 256² (512 KB). Largest additive: the flash, 3.75 m for 0.05 s. ${ADDNOTE}`,
    findings: [
      "Same as EX1: floating debris (no shadow), no <code>?fx=low</code>.",
      "<b>Question</b>: the shock ring is white (0xf2eee6), and white means pick-ups and people. Keep it white, or use a pale concrete grey?",
      "<b>EX2-G answers it by colour meaning</b>: no ring. The reach is the dust itself, a wall of concrete dust that stops on 2.5 m and leaves a pale settled band there (matter, lit from the upper left, no code colour). Its cracks end at the reach too.",
      "EX2-G cuts the 8 short flames: a mine or grenade has no fuel, and the flames made it read as a weaker EX1.",
      "Checked: the dust ring stops on the edge (each puff's edge on R); the hand grenade uses this look (<code>blastLookFor</code>).",
    ],
    lengthS: 2.6,
    gapS: 0.5,
    keyT: [0.02, 0.08, 0.2, 0.5, 1.2, 2.4],
    viewM: 8,
    looks: [blastNow("shockwave"), blastA("shockwave"), ex2G()],
    plan: {
      goal: "A sharp crack that throws everything outward: the ring says the exact reach, the dust says the force.",
      timing: "BLAST_TIMES.shockwave: flash 0.12 s, glow 0.3 s, ring grows 0.25 s then fades 0.45 s; dust 1.4–2 s (rolls out in 0.32 s); debris 1.5–2.5 s; sparks 0.25–0.6 s; mine shake 220 ms (mineBlast.ts).",
      lengthS: 2.6,
      lanes: {
        light: [
          { t0: 0, t1: 0.12, label: "hard white flash", key: true },
          { t0: 0, t1: 0.35, label: "pool" },
        ],
        core: [{ t0: 0, t1: 0.7, label: "white ring grows to R, holds, fades" }],
        matter: [
          { t0: 0, t1: 0.6, label: "sparks" },
          { t0: 0, t1: 2.5, label: "18 chunks + shadows (A)", nw: true },
        ],
        smoke: [{ t0: 0, t1: 2, label: "dust ring rolls to the edge, lit (A)", nw: true }],
        mark: [{ t0: 0, t1: 2.6, label: "scorch (lighter), embers 1.5 s (A)", nw: true }],
        game: [
          { t0: 0, t1: 0.05, label: "damage", key: true },
          { t0: 0, t1: 0.22, label: "shake 220 ms" },
        ],
      },
    },
  },
  {
    id: "gr",
    code: "GR",
    name: "Rounds in flight: launcher round and hand grenade",
    family: "fire",
    brief: "<b>Matter in the air.</b> Solid things lit by the street's light: the game's own round and grenade drawings relit (metal volume, a glint top-left), each casting its own soft shadow that drifts down-right with height (the same rule as today), so you read the arc and where it lands. Only the launcher round leaves a thin grey propellant trail, gone in 0.2 s. No light: nothing burns until it lands.",
    game: "<code>GrenadeView.ts</code> + <code>grenadeFx.ts › GrenadeFlights.pose</code>: straight line, height 4·1.5 m·u(1−u), drawn 0.15 m up per metre, scale +30 % per metre; round shown 3× (0.37 m), hand grenade 2.2× and tumbling 2.2 turns; shadow <code>fx_grenadeshadow</code> offset (0.35, 0.45) m per metre of height. Pool <code>combat.json › explosion.maxLiveRounds</code> 32.",
    perf: "Now: 2 sprites per item (item + shadow), no additive. GR-A: the same 2 sprites, plus 5 small trail puffs (normal blend) for a launcher round only; textures: round 40², hand grenade 3 × 64², their shadows (≈ 60 KB). No additive sprites. GR-G: the same sprite counts as A; its shadows are 3 blurs per item picked by height (+≈ 40 KB). No additive sprites.",
    findings: ["Checked and fine: the shadow offset follows the height; the hand grenade's tumble is tied to the flight (u), not to the clock.", "Today's shadow is one flat ellipse for every item (round, grenade and the bottle), so it doesn't match the shape it belongs to; A uses each item's own soft silhouette.", "GR-G is close to A (the goal didn't ask for new elements): the change is that the shadow's sharpness follows the height, so it becomes the landing read and counts down to the burst."],
    lengthS: 0.8,
    gapS: 0.6,
    keyT: [0.03, 0.2, 0.33, 0.6],
    viewM: 9,
    aspect: 0.6,
    looks: [grLook("now"), grLook("A"), grG()],
    plan: {
      goal: "See it coming and where it will land: the arc reads from the scale and the shadow.",
      timing: "Launcher 20 m/s (weapons.json lobSpeedMps, min 0.25 s): 7.5 m in 0.375 s. Hand grenade 12 m/s (consumables.json throwSpeedMps, min 0.3 s): 0.625 s. Arc 1.5 m (combat.json lobArcM).",
      lengthS: 0.8,
      lanes: {
        core: [
          { t0: 0, t1: 0.375, label: "round: rise, fall (3×)" },
          { t0: 0, t1: 0.625, label: "grenade: tumble 2.2 turns" },
        ],
        matter: [{ t0: 0, t1: 0.625, label: "own soft shadows (A)", nw: true }],
        smoke: [{ t0: 0, t1: 0.55, label: "launcher trail, 0.2 s per puff (A)", nw: true }],
        game: [
          { t0: 0.37, t1: 0.4, label: "round bursts (EX1)", key: true },
          { t0: 0.62, t1: 0.65, label: "grenade bursts (EX2)", key: true },
        ],
      },
    },
  },
  {
    id: "mo",
    code: "MO",
    name: "Molotov: bottle, splash, fire zone",
    family: "fire",
    brief: "<b>Light rides on matter.</b> The rag is the only light in the air: a real flame that lights the bottle from the front (a small warm pool on the ground under it). On landing the <b>fuel</b> splashes first (a dark wet stain spreading in 0.45 s, MB2 forward), then burns: fire-lab D's flames by temperature, lit soot, a flickering warm pool. The ring stays at exactly 3 m (you touch it, you burn) and now <b>fades with the fire</b>. When it goes out, the <b>scorch</b> stays like a blast's.",
    game: "<code>GrenadeView.ts</code> (bottle 1.5×, 1.6 turns, rag = <code>fx_fireflame</code> ADD at 14 Hz), <code>MolotovView.ts</code> + <code>molotovFx.ts</code> + <code>FireView.ts</code> in pool mode (<code>CarFire.setPool</code>): radius 3 m, 4 s, last 0.6 s fades; per-zone share <code>consumables.json › fx</code> (particleShare 0.25, smokeShare 0.1, edgeSpacingM 1.2, maxParticles 80, maxEdgeFlames 64, maxLights 1), always at low caps; ring <code>fx_molotovring</code> tinted 0xff7828 at 0.55. Max 8 live zones.",
    perf: `Now: one zone ≈ 28 flames + 3 smoke + 6 embers + ≈ 16 edge flames + light + ring ≈ 55 sprites, ≈ 51 additive; the caps hold over all zones (80 particles, 64 edge flames, 1 light). MO-A: the same sprites plus 2 normal-blend ground marks (fuel, scorch) and 1 additive ring glow, the rag adds 1 additive pool (0.9 m) + 1 smoke puff in flight. The scorch after the fire needs a decal slot: reuse the explosions' scorch pool (maxScorchDecals 16). MO-G: 40 flames on the fuel + heat glow + heat line + light pool additive (43; the 64-slot edge-flame pool is not used at all), 5 more for the 0.12 s whoosh; 2 marks (fuel, scorch) + 7 glass shards + 8 smoke normal: about 60 sprites at the peak, like today's 55. <code>?fx=low</code>: 20 flames, 4 smoke (≈ 36). New textures: fuel splash 156 × 160 and its scorch (same size), heat 192², heat line 256², a 16 × 8 shard (≈ 0.45 MB). The heat glow and line are the largest additive: one 6.25 m square each. ${ADDNOTE}`,
    findings: [
      "<b>The rag flame is white</b>: <code>GrenadeView</code> draws a fire mask (white, meant to be tinted) without a tint, so the rag burns white instead of orange (visible in the Now column at ½×).",
      "<b>The ring pops off</b>: its alpha is fixed at 0.55 and only changes when the zone list changes, so during the last 0.6 s the flames fade and the ring stays at full strength, then vanishes. A fades it with the fire.",
      "The fire leaves no mark today: the zone ends and the street is clean. A leaves a scorch like a blast's (uses a scorch decal slot).",
      "Checked and fine: flames stay inside the 3 m ring (the edge rule with <code>freeFlameFitR</code>); edge flames only light where the fuel has reached the ring (<code>poolReach</code>).",
      "<b>MO-A's flames also make a ring</b>, like FI-A: Story 5.12's edge flames line the 3 m circle once the fuel \"reaches\" it, whatever the splash looked like. MO-G drops them: flames only on the splashed fuel, the circle shown by heat.",
      "The zone is centred on the landing point, but the MB2 splash throws the fuel forward: the side behind the impact burns you with no fuel on it. MO-G keeps the game's circle and shows that side by heat only (the fuel never leaves the circle: it is laid inside 2.85 m).",
      "MO-G needs the throw direction at the landing (<code>molotovFx</code> already keeps it for MB2: <code>z.dir</code>) and a decal slot for the fan-shaped scorch.",
    ],
    lengthS: MOL_LAND + 4.6,
    gapS: 0.4,
    keyT: [0.2, MOL_LAND + 0.15, MOL_LAND + 0.8, MOL_LAND + 2.5, MOL_LAND + 3.8, MOL_LAND + 4.4],
    viewM: 9,
    origin: [0.56, 0.5],
    looks: [moLook("now"), moLook("A"), moG()],
    plan: {
      goal: "Area denial you can read at a glance: where the fire is, its exact edge, how long it has left (the fade).",
      timing: "Flight 4.5 m at 12 m/s = 0.375 s. Zone: 4 s (consumables.json molotovs.durationS), damage 8/s pulsed every 0.5 s; the last 0.6 s fade (MOLOTOV_FADE_S). MB2: the fuel splashes forward along the throw.",
      lengthS: MOL_LAND + 4.6,
      lanes: {
        light: [
          { t0: 0, t1: MOL_LAND, label: "rag flame (A: lights the bottle)", nw: true },
          { t0: MOL_LAND, t1: MOL_LAND + 4, label: "warm pool, flickering" },
        ],
        core: [
          { t0: MOL_LAND, t1: MOL_LAND + 0.8, label: "fire spreads to the ring", key: true },
          { t0: MOL_LAND + 0.8, t1: MOL_LAND + 3.4, label: "burning, ring at 3 m" },
          { t0: MOL_LAND + 3.4, t1: MOL_LAND + 4, label: "fade (A: ring fades too)", nw: true },
        ],
        matter: [{ t0: 0, t1: MOL_LAND, label: "bottle tumbles, own shadow (A)", nw: true }],
        smoke: [{ t0: MOL_LAND + 0.3, t1: MOL_LAND + 4.6, label: "thin soot, lit (A)" }],
        mark: [
          { t0: MOL_LAND, t1: MOL_LAND + 0.45, label: "fuel stain spreads (A)", key: true, nw: true },
          { t0: MOL_LAND + 0.5, t1: MOL_LAND + 4.6, label: "scorch builds, stays (A)", nw: true },
        ],
        game: [
          { t0: MOL_LAND, t1: MOL_LAND + 0.05, label: "zone on", key: true },
          { t0: MOL_LAND, t1: MOL_LAND + 4, label: "damage pulses / 0.5 s" },
        ],
      },
    },
  },
  {
    id: "fi",
    code: "FI",
    name: "Fire: burning car",
    family: "fire",
    brief: `<b>Goal first</b> (designer 2026-11-26: "show player a car is burning + zone where they get damaged"). Two reads: <b>1. this car is burning</b>, <b>2. inside this circle you get hurt</b> (2 m, 10 damage/s in 0.5 s pulses).
<br><b>Elements, each with one job:</b><ul>
<li><b>The wreck</b> (approved, Story 9.14): the fuel. Read 1.</li>
<li><b>Flames on the car's fuel</b>, in the car's own shape: the cabin (seats, plastics: tallest, densest), the engine bay, the four tyres (small), a fuel pool leaking under the rear (low, wide). They lean downwind. Never a circle. Read 1.</li>
<li><b>Heat on the ground</b> = the circle: a warm glow, strongest at the car, that ends exactly at the damage edge, and a thin heat line on that edge. No flame draws the circle. Read 2.</li>
<li><b>The damage pulse</b>: the heat line brightens a little on each 0.5 s damage tick. Read 2.</li>
<li><b>Light from the flames</b>: a flickering pool on the car; its flicker also drives the ground glow. Read 1.</li>
<li><b>Black smoke</b> from the cabin and engine, downwind, thin where it leaves the flames: you see the fire from far away. Read 1.</li>
<li><b>Embers</b> from the cabin, downwind: it's alive.</li>
<li><b>The mark</b>: soot burnt into the asphalt under the car, the fuel stain. What stays.</li></ul>
<b>How they compose:</b> flames only inside the car and the pool; the circle only from heat; brightness: cabin &gt; engine &gt; pool &gt; tyres &gt; ground glow &gt; heat line; the bright flame never passes the damage edge (the car is 4.5 m, the zone 4 m wide, so the bumpers stick out 0.25 m: their flames are held inside); one flicker for flames, car light and ground glow; the heat line moves only with the damage tick; smoke may cross the edge (it doesn't burn).`,
    game: "<code>city/FireView.ts</code> + <code>fireParticles.ts › CarFire</code> (car mode), atlas <code>atlas_firefx</code> (white masks tinted with 16 ramp steps; smoke 6 tones), light <code>fx_firelight</code> 2R at 0.13 × flicker; ring by <code>CityView</code> (2 px orange line + 5 px glow, <code>fireRing.ts</code>). Caps per fire: 110 flames, 26 smoke, 24 embers (half with <code>?fx=low</code>). Burning survivors and zombies (<code>BurnView</code>, <code>FlameView.zombies</code>) use the same frames.",
    perf: `Now: a car fire ≈ 60–80 flames + 49 edge flames + embers additive, ≈ 20 smoke (caps 110 / 26 / 24, half with <code>?fx=low</code>; the 49 edge slots are never halved). FI-B (the goal-first take; no FI-G): 54 flames (cabin 18, engine 14, tyres 8, pool 14) + 12 embers + 3 glows (heat, heat line, car light) additive, 14 smoke, 3 marks: about 85 sprites, under half of today's ≈ 200, and <code>?fx=low</code> halves all of it (27 flames, 6 embers, 7 smoke). The heat glow and line are the largest additive: one 4.2 m square each, cropped to the circle. New textures: heat 192², heat line 256², soot mark 160 × 96, fuel pool 96² (≈ 470 KB); flames, smoke, embers and light shared with take A. ${ADDNOTE}`,
    findings: [
      "<b>FI-A declined</b> (designer 2026-11-26: \"The fire cant be a circle if the car is a rectangle… flames in a perfect circle look weird\"). FI-A was the same particle code with new pictures, so it kept today's ring of flames. That ring comes from Story 4.11's edge rule (\"most of the zone's flames are spawned right at the edge, so a clear ring of flames marks it\"). FI-B keeps the rule's real job (the bright flame never passes the damage edge) but marks the edge with heat, not flames.",
      "The car (4.5 m) is longer than the zone (4 m across): its bumpers stick out 0.25 m, and the zone doesn't follow the car's shape. FI-B keeps the circle (the sim's <code>circleInFire</code>) and holds the flames inside it.",
      "Burning survivors and zombies, and the Molotov pool, use the same fire code (BurnView, MolotovView). FI-B is only the car. The Molotov's flames also make a ring at the edge (MO-A): worth the same goal-first pass.",
      "Checked and fine: smoke thins near the source so it never hides the flames; embers stop at the source's downwind side; the heat ends at exactly R (2 m).",
      "FI-B is FI's goal-first take, so FI has no -G; its goal, elements and composition are now shown in the green block below the takes.",
    ],
    lengthS: 3,
    gapS: 0,
    keyT: [0, 0.25, 1.5, 2.5],
    viewM: 7,
    under: (g, _t, st) => drawApprovedCar(g, st), // the approved Story 9.14 wreck (as the game shows it since 9.14)
    looks: [fiLook("now"), fiCarLook()],
    plan: {
      goal: "This car is burning (flames on its own shape, smoke you see from far), and inside this circle you get hurt (heat that ends exactly at the edge, ticking with the damage).",
      timing: "Continuous: decay.json fire radius 2 m, damage 10/s in 0.5 s pulses, lasts 2 waves. FI-B: flame life 0.35–0.9 s by source, smoke 3.2–4.2 s, embers 1–1.6 s; wind (0.55, 0.32) as the game's.",
      lengthS: 2,
      lanes: {
        light: [
          { t0: 0, t1: 2, label: "car light + ground glow: one flicker (fireFlicker)", nw: true },
        ],
        core: [
          { t0: 0, t1: 2, label: "flames on cabin > engine > pool > tyres, downwind; never on the circle", nw: true },
        ],
        matter: [{ t0: 0, t1: 2, label: "embers from the cabin, downwind" }],
        smoke: [{ t0: 0, t1: 2, label: "black smoke from cabin + engine, downwind, thin at the flames", nw: true }],
        mark: [{ t0: 0, t1: 2, label: "soot under the car, fuel stain", nw: true }],
        game: [
          { t0: 0, t1: 0.25, label: "tick: heat line up", key: true, nw: true },
          { t0: 0.5, t1: 0.75, label: "tick", key: true, nw: true },
          { t0: 1, t1: 1.25, label: "tick", key: true, nw: true },
          { t0: 1.5, t1: 1.75, label: "tick", key: true, nw: true },
        ],
      },
    },
  },
  {
    id: "fs",
    code: "FS",
    name: "Flamethrower (FS1) and gas torch (FS2)",
    family: "fire",
    brief: "<b>Burning fuel in a stream.</b> FS1 throws liquid fuel: white at the core where it ignites, cooling to amber and red-brown at the late bloom, so the 6 m reach reads by colour. FS2 burns gas: a blue-white core at the nozzle, then a short amber fan (3 m, 60°). Both are light: a warm pool on the floor along the cone and a pilot light at the nozzle. After release, the stream's end leaves thin soot wisps (matter, drifting with the wind) for 0.8 s.",
    game: "<code>FlameView.ts</code> + <code>flameJet.ts › FlameJets</code>: rays inside the cone, 90 particles/s, pool 96 (<code>combat.json › fx</code>; both halved with <code>?fx=low</code>), FS1 jet (life 0.42–0.55 s, blooms at 85 %), FS2 torch (life 0.3–0.42 s, blue under 28 % of the reach); floor glow = <code>fx_firelight</code> tinted 0xff9a40 stretched along the cone at 0.38 × flicker; max 4 flamers; burning zombies get 2 flames each (max 40).",
    perf: `Now: up to 96 additive flames + 1 glow per flamer. FS-A: the same, plus 1 additive pilot light (0.45 m) per flamer and up to 6 soot wisps per flamer (normal, 1.2 m max). The floor glow is the largest additive: 6.9 × 2.3 m for FS1. Textures: flame steps and torch from the shared set (+150 KB for the torch). FS-G: fuel parcels in flight = rate × flight time: FS1 40/s × 0.45 s = 18, FS2 50/s × 0.3 s = 15 additive (today up to 96 per flamer), + 1 floor light + 1 pilot each, + up to 4 soot wisps; <code>?fx=low</code> halves the parcels (9 / 8). New textures: the two cone lights, 147 × 58 and 74 × 91 (≈ 60 KB), cropped to the cone. ${ADDNOTE}`,
    findings: ["Checked and fine: the bright part of every ray stays inside the cone (the w clamp); a ray stopped by a car splashes and dims at its face (not shown here: open street).", "FS2's blue core is one flat tint (TORCH_BLUE) on the same mask as the fire: A gives it its own blue-white texture.", "FS-G replaces the ray emitter with a rope of fuel parcels (FS1) and a gas fan (FS2) that fill the same cone; it shows the open street only (a ray stopped by a car is not drawn here). Burning drips on the ground were cut: the game leaves no fire there."],
    lengthS: 2.4,
    gapS: 0.4,
    keyT: [0.1, 0.6, 1.2, 1.75, 2.2],
    viewM: 9,
    aspect: 0.75,
    under: (g, _t, st) => {
      FLAMERS.forEach((f) => {
        const c = G.survivor(f.w);
        sprite(g, c, X(st, f.x - 0.05), Y(st, f.y), 1.4, st.pxm, 0);
      });
    },
    looks: [fsLook("now"), fsLook("A"), fsG()],
    plan: {
      goal: "See exactly what your stream covers (reach, width) while it burns, and that it stopped when you release.",
      timing: "Held 1.6 s here (fuel 6 s, weapons.json). FS1: range 6 m, cone 20°, damage pulses every 0.25 s; FS2: range 3 m, cone 60°. Particles live 0.3–0.55 s, so the stream clears 0.55 s after release.",
      lengthS: 2.4,
      lanes: {
        light: [
          { t0: 0, t1: FS_ON, label: "floor glow along the cone (A: pool)" },
          { t0: 0, t1: FS_ON, label: "pilot light (A)", nw: true },
        ],
        core: [
          { t0: 0, t1: 0.4, label: "stream builds", key: true },
          { t0: 0.4, t1: FS_ON, label: "full: heat-coloured (A)", nw: true },
          { t0: FS_ON, t1: FS_ON + 0.55, label: "last rays fly out" },
        ],
        smoke: [{ t0: 0.2, t1: FS_ON + 0.8, label: "soot wisps at the end (A)", nw: true }],
        game: [{ t0: 0, t1: FS_ON, label: "damage every 0.25 s, ignites" }],
      },
    },
  },
  {
    id: "bx",
    code: "BX",
    name: "Bloater burst: flash, bile, scraps, gas",
    family: "fire",
    brief: "<b>The one fluid that glows.</b> The burst is light: a short white-to-yellow-green flash (yellow-green = infection), the shock ring out to 2.5 m in 0.1 s. Then matter: bile is wet and glossy, relit, with shadows under drops in flight, landing as splats with dark rims; torn clothes (the Bloater's own colours) flutter down. The gas is a lit volume, lit top-left, turning slowly, with its 2.5 m edge ring. <b>BX-B</b> adds a faint glow on the bile until the gas clears.",
    game: "<code>BloaterView.ts</code> + <code>bloaterFx.ts › BloaterFx</code>, frames in <code>atlas_fx</code>: flash <code>fx_explosionbloater</code> (ADD, 0.9 × 5 m, 0.14 s), 14 drops (bile-splat frames) landing as splats ×3, 5 cloth scraps (5 tints), 8 puffs (<code>fx_glow</code> tinted 0xb9c65e), two cloud layers (<code>fx_gascloud</code>, 0.42 / 0.22) over 4 s with a 0.25 s fade-in and 1 s fade-out; rings: gas edge 0.045 m, shock 0.07 m. Caps: <code>controls.json › fx.maxBloaterParticles</code> 240, <code>zombies.json › blasts.maxGasClouds</code> 24, fuse rings 16.",
    perf: `Now: 27 sprites per burst + 2 cloud layers + rings, 1 additive (the flash). BX-A: the same plus up to 19 small shadows in flight (normal); 1 additive. BX-B: + up to 14 additive bile glows (≈ 0.4 m each) per burst, ×24 clouds at most = 336, so B would need its own cap (suggest 6 bursts' worth, like <code>maxBloaterFx</code>). Textures: relit bile 4 × 64², scraps 5 × 40², gas set 9 × 96² (≈ 0.5 MB). <code>?fx=low</code>: today the Bloater pool is not halved; A halves the puffs. BX-G: 1 additive (the flash, 0.1 s); normal: gas body 1 + 16 rim puffs + 12 drops (with 12 shadows in flight) then 12 splats + 3 scraps (+ shadows while falling): about 46 at the peak, no rings; <code>?fx=low</code>: 8 puffs, 6 drops, 2 scraps (≈ 26). New texture: the gas body 256² (256 KB). ${ADDNOTE}`,
    findings: [
      "<b>Flying drops use the ground-splat picture</b>: a flat splat shape flies through the air, stretched. A draws a round drop in flight and keeps the splat for the landing.",
      "<b><code>?fx=low</code> doesn't halve the Bloater pool</b> (<code>GameScene</code> passes <code>maxBloaterParticles</code> as is).",
      "<b>Overlap</b>: the gas cloud's look is the matter family's GA card; BX-A's lit cloud is drawn to match its idea, but GA's pick decides.",
      "Checked and fine: splats leave with their cloud (they fade in its last second); the shock ring reaches exactly the 2.5 m blast radius in 0.1 s.",
      "The blast and the gas have the same radius (2.5 m, <code>zombies.json</code>): BX-G shows both with one element, the gas thrown out to the edge in 0.1 s that stays as the cloud's rim. The two rings are cut (white = people).",
      "BX-G keeps the bile matte (BX-B's glow not taken): in the goal, the gas is what slows you, so the gas carries the zone, not the bile.",
    ],
    lengthS: 4.2,
    gapS: 0.5,
    keyT: [0.02, 0.09, 0.25, 0.7, 2.5, 3.7],
    viewM: 7,
    looks: [bxLook("now"), bxLook("A"), bxLook("B"), bxG()],
    plan: {
      goal: "A burst you can't miss, then a 4 s zone you must not walk into (the gas slows you): light says 'pop', matter says 'messy', the cloud and its ring say 'stay out'.",
      timing: "bloaterFx.ts: flash 0.14 s, shock ring 0.1 s + fade 0.6 s; drops land in ≈ 0.3–0.7 s (gravity 9); scraps flutter (slowed fall) 1.5–3.5 s; gas 4 s (zombies.json gasS), slows 30 %; fade in 0.25 s, out 1 s.",
      lengthS: 4.2,
      lanes: {
        light: [
          { t0: 0, t1: 0.14, label: "flash (A: white → yellow-green)", key: true },
          { t0: 0.6, t1: 4, label: "B: bile glows, 1.2 s pulse", nw: true },
        ],
        core: [{ t0: 0, t1: 0.7, label: "shock ring to 2.5 m, fades" }],
        matter: [
          { t0: 0, t1: 0.7, label: "drops fly (A: shadows), land as splats", nw: true },
          { t0: 0, t1: 3.5, label: "scraps flutter down" },
        ],
        smoke: [{ t0: 0, t1: 4, label: "gas: fade in, hold, fade out (A: lit volume)", nw: true }],
        mark: [{ t0: 0.5, t1: 4, label: "splats until the gas clears" }],
        game: [
          { t0: 0, t1: 0.05, label: "blast damage", key: true },
          { t0: 0, t1: 4, label: "gas slows 30 %" },
        ],
      },
    },
  },
];
