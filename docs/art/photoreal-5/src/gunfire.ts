/**
 * Photoreal group 5, family "gunfire": muzzle flashes, the shotgun blast, rounds in flight, hits, blood, the Crawler
 * trail, melee arcs, the Chainsaw's sparks and the building feedback rings / debris.
 *
 * "Now" = today's FxView.ts / ProjectileView.ts / BloodTrailView.ts / ZombieView.ts flash / meleeFx.ts, replayed with
 * the same numbers (radii, colours, alpha tweens, lifetimes, counts, blend). Takes: drawn in gunfire-art.ts, composed
 * here like pooled Phaser images. The group's idea: light (flash, plume, tracer, sparks, rings) is emitted and added;
 * matter (blood, mist, smoke, dust, splinters) is lit from the upper left and falls; the mark stays.
 */
import { captured, fakeScene, frameCanvas } from "./textureShim";
import { ensureAtlases } from "../../../../apps/client/src/render/city/spriteAtlas";
import { countSprite, easeOut, idle, make, ramp, rng, sprite, type FxCard, type Look, type Stage } from "./kit";
import {
  MZ_H_M,
  MZ_W_M,
  SG_H_M,
  SG_W_M,
  bakeBlood,
  bakeChip,
  bakeDrop,
  bakeDust,
  bakeGlint,
  bakeMist,
  bakeMuzzle,
  bakePlume,
  bakePool,
  bakeRing,
  bakeSmear,
  bakeSmoke,
  bakeSpark,
  bakeSweep,
  bakeTracer,
  disc,
  silhouette,
  slice,
  strokeRing,
  type BloodPic,
  type MuzzleKind,
} from "./gunfire-art";

const DEG = Math.PI / 180;
const on = (st: Stage, part: string): boolean => st.only === null || st.only === part;
type Tex = { name: string; canvas: HTMLCanvasElement; note?: string };
const tx = (name: string, canvas: HTMLCanvasElement, note?: string): Tex => ({ name, canvas, note });

/** The game's plain character frames (context under the effects): captured once from spriteAtlas. */
function charFrame(name: string): HTMLCanvasElement {
  if (!captured.has("atlas_characters")) ensureAtlases(fakeScene);
  return frameCanvas("atlas_characters", name);
}
/** Draws a context body (not counted: not an effect). sideM = the game's display size (2 r × CHAR_EXTENT_R). */
function body(g: CanvasRenderingContext2D, pic: HTMLCanvasElement, x: number, y: number, sideM: number, pxm: number, rot: number): void {
  const s = sideM * pxm;
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  g.drawImage(pic, -s / 2, -s / 2, s, s);
  g.restore();
}
/** A short dark gun barrel ending at (x, y), pointing +x (context, not counted). */
function barrel(g: CanvasRenderingContext2D, x: number, y: number, pxm: number, lenM = 0.35): void {
  g.fillStyle = "#121416";
  g.fillRect(x - lenM * pxm, y - 0.035 * pxm, lenM * pxm, 0.07 * pxm);
  g.fillStyle = "rgba(140,150,160,0.35)";
  g.fillRect(x - lenM * pxm, y - 0.035 * pxm, lenM * pxm, 0.015 * pxm);
}
function label(g: CanvasRenderingContext2D, s: string, x: number, y: number, pxm: number, align: CanvasTextAlign = "left"): void {
  if (pxm < 38) return;
  g.font = `500 ${Math.round(Math.max(10, pxm * 0.13))}px Inter, system-ui, sans-serif`;
  g.fillStyle = "rgba(200,206,212,0.75)";
  g.textAlign = align;
  g.textBaseline = "middle";
  g.fillText(s, x, y);
}
const linFade = (t: number, ms: number): number => Math.max(0, 1 - t / (ms / 1000));

/* ======================================================================================================== MZ */
const MZ_ROWS: readonly { kind: MuzzleKind; scale: number; name: string }[] = [
  { kind: "pistol", scale: 1, name: "Pistol, SMG (× 1)" },
  { kind: "rifle", scale: 1.25, name: "Rifle (× 1.25)" },
  { kind: "shotgun", scale: 1.6, name: "Shotgun (× 1.6)" },
  { kind: "turret", scale: 1, name: "Turret (× 1)" },
];
const mzRowY = (st: Stage, i: number): number => st.cy + (i - 1.5) * 0.9 * st.pxm;
const mzX = (st: Stage): number => st.cx;

function mzNow(): Look {
  let d: HTMLCanvasElement | null = null;
  return {
    code: "now",
    title: "a flat pale-yellow disc",
    note: "A circle of 0.18 m × the weapon's scale, #ffe9a8, alpha 1 → 0 in 50 ms, normal blend (it can't light anything).",
    bake: async () => {
      d ??= disc(64, "#ffe9a8");
    },
    draw: (g, t, st) => {
      if (!on(st, "flash")) return;
      MZ_ROWS.forEach((r, i) => sprite(g, d!, mzX(st), mzRowY(st, i), 0.36 * r.scale, st.pxm, 0, linFade(t, 50)));
    },
    textures: () => [tx("Arc (Phaser circle)", d ?? make(1, 1), "drawn by the GPU, no texture")],
    parts: [{ id: "flash", label: "Flash" }],
    frames: [
      { label: "frame 1", t: 0.005, when: "0–17 ms" },
      { label: "frame 2", t: 0.022, when: "17–33 ms" },
      { label: "frame 3", t: 0.039, when: "33–50 ms" },
    ],
  };
}
function mzTake(code: "MZ-A" | "MZ-B"): Look {
  const flash = new Map<MuzzleKind, HTMLCanvasElement[]>();
  let pool: HTMLCanvasElement | null = null;
  let smoke: HTMLCanvasElement[] = [];
  const B = code === "MZ-B";
  const poolM = B ? 5.2 : 1.8;
  const poolA = B ? 0.5 : 0.38;
  const poolMs = B ? 70 : 80;
  return {
    code,
    title: B ? "the shot lights the street" : "a real muzzle flash",
    note: B
      ? "Same flash as MZ-A, but the light it throws is big: a 2.6 m pool (× weapon) for 70 ms, so at night every shot shows the shooter and the zombies close to them for a frame or two."
      : "Three frames over today's 50 ms: a white-hot star (the shape of each gun: pistol star, rifle brake jets, shotgun bloom, turret twin jets), then the gas pushed forward and cooling to orange. A small warm light pool on the street (0.9 m), and a wisp of gun smoke that drifts forward after.",
    bake: async () => {
      if (flash.size) return;
      for (const r of MZ_ROWS) {
        flash.set(r.kind, [0, 1, 2].map((f) => bakeMuzzle(r.kind, f, 11 + f)));
        await idle();
      }
      pool = bakePool(64, [255, 200, 130]);
      smoke = [bakeSmoke(48, 3), bakeSmoke(48, 9)];
    },
    draw: (g, t, st) => {
      MZ_ROWS.forEach((r, i) => {
        const x = mzX(st);
        const y = mzRowY(st, i);
        const scale = r.scale / (r.kind === "shotgun" ? 1.25 : r.kind === "rifle" ? 1.1 : 1); // the shapes already differ per gun
        if (on(st, "pool") && t < poolMs / 1000) sprite(g, pool!, x + 0.1 * st.pxm, y, poolM * r.scale, st.pxm, 0, poolA * linFade(t, poolMs), true);
        if (on(st, "flash") && t < 0.05) {
          const f = t < 0.017 ? 0 : t < 0.034 ? 1 : 2;
          sprite(g, flash.get(r.kind)![f]!, x, y, MZ_W_M * scale, st.pxm, 0, 1, true, MZ_H_M * scale);
        }
        if (on(st, "smoke")) {
          const n = st.low ? 1 : 2;
          for (let k = 0; k < n; k++) {
            const age = t - 0.03 - k * 0.02;
            const life = 0.65;
            if (age <= 0 || age > life) continue;
            const u = age / life;
            const sz = (0.14 + 0.38 * easeOut(u)) * r.scale;
            const px = x + (0.15 + k * 0.08 + 0.35 * easeOut(u)) * r.scale * st.pxm;
            const py = y + (k ? 0.05 : -0.04) * st.pxm - 0.06 * u * st.pxm;
            sprite(g, smoke[k]!, px, py, sz, st.pxm, u * 0.8 + k, 0.38 * ramp(age, 0, 0.06) * (1 - u));
          }
        }
      });
    },
    textures: () => [
      ...MZ_ROWS.flatMap((r) => (flash.get(r.kind) ?? []).map((c, f) => tx(`mz_${r.kind}_${f}`, c, "ADD"))),
      tx("mz_pool", pool ?? make(1, 1), "ADD"),
      ...smoke.map((c, k) => tx(`gunsmoke_${k}`, c)),
    ],
    parts: [
      { id: "flash", label: "Flash (light)" },
      { id: "pool", label: "Light pool" },
      { id: "smoke", label: "Gun smoke (matter)" },
    ],
    frames: [
      { label: "frame 1", t: 0.005, when: "0–17 ms: white-hot star" },
      { label: "frame 2", t: 0.022, when: "17–33 ms: gas pushed forward" },
      { label: "frame 3", t: 0.039, when: "33–50 ms: orange wisps" },
      { label: "smoke", t: 0.3, when: "after: smoke only" },
    ],
  };
}
const MZ: FxCard = {
  id: "muzzle",
  code: "MZ",
  name: "Muzzle flash, per weapon",
  family: "gunfire",
  brief:
    "<b>Light.</b> A shot is burning powder gas leaving the barrel: a white-hot core that cools to orange as it expands, in the shape each muzzle gives it (a pistol's short star, a rifle brake's side jets, a shotgun's round bloom, the turret's twin jets). It is the hottest thing on the street, so it is <b>added</b> and throws a short pool of warm light on the asphalt. The gas then becomes <b>matter</b>: a wisp of grey smoke, lit from the upper left, drifting forward. Size stays the game's (× weapon scale); it must never hide the target.",
  game:
    "<code>FxView.muzzle</code>: a pooled Phaser <code>circle</code>, radius 0.18 m × <code>muzzleScaleFor</code> (<code>weaponLook.ts</code>: shotgun 1.6, assault rifle 1.25, grenade launcher 1.4, every other gun 1), colour #ffe9a8, depth 9, normal blend, alpha 1 → 0 in <code>MUZZLE_MS</code> = 50 ms (linear). Same flash at scale 1 for <code>turret.fired</code>. Rates (<code>weapons.json</code>): pistol 3/s, SMG 12/s, rifle 6/s, shotgun 1.2/s, hunting rifle 1.2/s.",
  perf:
    "MZ-A: 12 flash frames (96 × 48 px, 18 KB each, one atlas strip ≈ 220 KB), one 64² pool, two 48² smoke puffs: ≈ 250 KB. Per shot: 1 flash + 1 pool (both ADD) for 50–80 ms, + 2 smoke puffs for 0.65 s. An SMG at 12/s keeps ≈ 16 smoke puffs alive per gun: <b>new cap needed</b> (proposal <code>fx.maxGunSmoke</code> 24, oldest reused; <code>?fx=low</code> = 1 puff per shot, cap 12). MZ-B: same textures, the pool drawn bigger (fill cost only, 70 ms).",
  findings: [
    "<b>Not additive:</b> today's flash is a normal-blend disc, so it reads as a pale sticker and never lights the ground or the shooter.",
    "The SMG and hunting rifle have no scale of their own (× 1, same as the pistol); the turret's flash is the pistol's.",
    "Checked and fine: 50 ms = 3 frames at 60 Hz; pooled (no allocation per shot).",
  ],
  lengthS: 0.7,
  gapS: 0.35,
  keyT: [0.005, 0.022, 0.039, 0.3],
  viewM: 4.2,
  aspect: 0.9,
  origin: [0.48, 0.5],
  under: (g, _t, st) => MZ_ROWS.forEach((r, i) => {
    barrel(g, mzX(st), mzRowY(st, i), st.pxm, r.kind === "turret" ? 0.25 : 0.4);
    label(g, r.name, mzX(st) - 0.5 * st.pxm, mzRowY(st, i), st.pxm, "right");
  }),
  looks: [mzNow(), mzTake("MZ-A"), mzTake("MZ-B")],
  plan: {
    goal: "Every shot reads at once as a hot burst at the gun, sized by the weapon, then gets out of the way of the target.",
    timing: "Flash 50 ms (<code>MUZZLE_MS</code>, FxView.ts), 3 game frames. Light pool 80 ms. Smoke 0.03–0.68 s. Next shot: SMG 83 ms, rifle 167 ms, pistol 333 ms.",
    lengthS: 0.7,
    lanes: {
      light: [{ t0: 0, t1: 0.08, label: "warm pool on the street, fading", nw: true }],
      core: [
        { t0: 0, t1: 0.017, label: "star", key: true, nw: true },
        { t0: 0.017, t1: 0.034, label: "push", nw: true },
        { t0: 0.034, t1: 0.05, label: "wisps", nw: true },
      ],
      smoke: [{ t0: 0.03, t1: 0.68, label: "gun smoke drifts forward, lit from the upper left", nw: true }],
      game: [{ t0: 0, t1: 0.05, label: "shot, sound" }],
    },
  },
};

/* ======================================================================================================== SG */
const SG_HALF = 15 * DEG; // weapons.json shotgun spreadDeg 30
const SG_LEN = 2.4; // weaponLook.ts BLAST_M
const SG_RANGE = 5;
const SG_SPEED = 60;
function pelletDirs(seed: number): number[] {
  const R = rng(1000 + seed);
  return Array.from({ length: 8 }, () => (R() - 0.5) * 2 * SG_HALF);
}
function sgNow(): Look {
  let cone: HTMLCanvasElement | null = null;
  let streak: HTMLCanvasElement | null = null;
  let d: HTMLCanvasElement | null = null;
  const P = 48;
  return {
    code: "now",
    title: "a flat warm cone + 8 yellow sticks",
    note: "Two flat wedges (outer #ffc46b at 0.18 over 2.4 m, inner #fff1c4 at 0.4) fading in 110 ms; 8 pellet streaks 0.3 × 0.07 m; the 1.6× disc flash.",
    bake: async () => {
      cone ??= slice(SG_LEN, SG_HALF, "#ffc46b", 0.18, P, { r: SG_LEN * 0.45, half: SG_HALF * 0.7, col: "#fff1c4", alpha: 0.4 });
      if (!streak) {
        streak = make(30, 7);
        const sg = streak.getContext("2d")!;
        sg.fillStyle = "#ffe7b0";
        sg.fillRect(0, 0, 30, 7);
      }
      d ??= disc(64, "#ffe9a8");
    },
    draw: (g, t, st) => {
      if (on(st, "cone") && t < 0.11) sprite(g, cone!, st.cx, st.cy, cone!.width / P, st.pxm, 0, linFade(t, 110));
      if (on(st, "pellets")) {
        const head = SG_SPEED * t;
        if (head > 0 && head <= SG_RANGE)
          for (const a of pelletDirs(st.seed)) {
            const m = head - 0.15;
            sprite(g, streak!, st.cx + Math.cos(a) * m * st.pxm, st.cy + Math.sin(a) * m * st.pxm, 0.3, st.pxm, a, 1, false, 0.07);
          }
      }
      if (on(st, "flash") && t < 0.05) sprite(g, d!, st.cx, st.cy, 0.36 * 1.6, st.pxm, 0, linFade(t, 50));
    },
    textures: () => [tx("Graphics slice ×2", cone ?? make(1, 1), "redrawn per shot"), tx("Rectangle", streak ?? make(1, 1)), tx("Arc", d ?? make(1, 1))],
    parts: [
      { id: "cone", label: "Blast cone" },
      { id: "pellets", label: "Pellets" },
      { id: "flash", label: "Flash" },
    ],
    frames: [
      { label: "frame 1", t: 0.008, when: "0–17 ms" },
      { label: "frame 2", t: 0.025, when: "17–33 ms" },
      { label: "frame 4", t: 0.058, when: "50–67 ms" },
      { label: "frame 6", t: 0.092, when: "83–100 ms" },
    ],
  };
}
function sgTake(): Look {
  let plume: HTMLCanvasElement[] = [];
  let flash: HTMLCanvasElement[] = [];
  let tracer: HTMLCanvasElement | null = null;
  let pool: HTMLCanvasElement | null = null;
  let smoke: HTMLCanvasElement[] = [];
  return {
    code: "SG-A",
    title: "a blast of hot gas, then smoke",
    note: "The same 30° × 2.4 m blast, as hot turbulent gas (white at the throat, orange at the ends) in 3 frames over today's 110 ms; the pellets as tapered tracers; a big warm light pool; then a cloud of gun smoke rolls out along the cone and drifts (0.9 s).",
    bake: async () => {
      if (plume.length) return;
      plume = [0, 1, 2].map((f) => bakePlume(f, SG_HALF, SG_LEN, 5));
      await idle();
      flash = [0, 1, 2].map((f) => bakeMuzzle("shotgun", f, 21 + f));
      tracer = bakeTracer(48, 8, 1.05, null);
      pool = bakePool(64, [255, 196, 120]);
      smoke = [bakeSmoke(64, 4), bakeSmoke(64, 8), bakeSmoke(64, 15)];
    },
    draw: (g, t, st) => {
      if (on(st, "pool") && t < 0.09) sprite(g, pool!, st.cx + 0.6 * st.pxm, st.cy, 3.2, st.pxm, 0, 0.42 * linFade(t, 90), true);
      if (on(st, "smoke")) {
        const n = st.low ? 2 : 3;
        for (let k = 0; k < n; k++) {
          const age = t - 0.03 - k * 0.025;
          const life = 0.9;
          if (age <= 0 || age > life) continue;
          const u = age / life;
          const along = (0.35 + k * 0.5) + 0.45 * easeOut(u);
          const side = (k - 1) * 0.12;
          sprite(g, smoke[k]!, st.cx + along * st.pxm, st.cy + (side - 0.08 * u) * st.pxm, 0.3 + 0.65 * easeOut(u) + k * 0.1, st.pxm, k + u * 0.6, 0.46 * ramp(age, 0, 0.05) * (1 - u));
        }
      }
      if (on(st, "cone") && t < 0.11) {
        const f = t < 0.037 ? 0 : t < 0.074 ? 1 : 2;
        sprite(g, plume[f]!, st.cx, st.cy, SG_W_M, st.pxm, 0, 1, true, SG_H_M);
      }
      if (on(st, "pellets")) {
        const head = SG_SPEED * t;
        if (head > 0 && head <= SG_RANGE)
          for (const a of pelletDirs(st.seed)) {
            const m = head - 0.15;
            sprite(g, tracer!, st.cx + Math.cos(a) * m * st.pxm, st.cy + Math.sin(a) * m * st.pxm, 0.36, st.pxm, a, 1, true, 0.085);
          }
      }
      if (on(st, "flash") && t < 0.05) sprite(g, flash[t < 0.017 ? 0 : t < 0.034 ? 1 : 2]!, st.cx, st.cy, MZ_W_M, st.pxm, 0, 1, true, MZ_H_M);
    },
    textures: () => [...plume.map((c, f) => tx(`sg_plume_${f}`, c, "ADD")), ...flash.map((c, f) => tx(`mz_shotgun_${f}`, c, "ADD, shared with MZ")), tx("tracer_pellet", tracer ?? make(1, 1), "ADD"), tx("pool", pool ?? make(1, 1), "ADD, shared"), ...smoke.map((c, k) => tx(`gunsmoke_big_${k}`, c))],
    parts: [
      { id: "cone", label: "Hot gas (light)" },
      { id: "pellets", label: "Pellet tracers" },
      { id: "flash", label: "Muzzle flash" },
      { id: "pool", label: "Light pool" },
      { id: "smoke", label: "Smoke (matter)" },
    ],
    frames: [
      { label: "plume 1", t: 0.008, when: "0–37 ms: throat white-hot" },
      { label: "plume 2", t: 0.05, when: "37–74 ms: pushed out, cooling" },
      { label: "plume 3", t: 0.092, when: "74–110 ms: orange ends" },
      { label: "smoke", t: 0.4, when: "after: smoke rolls out" },
    ],
  };
}
const SG: FxCard = {
  id: "shotgun",
  code: "SG",
  name: "Shotgun blast and pellets",
  family: "gunfire",
  brief:
    "<b>Light, then matter.</b> A shotgun throws a cone of burning gas much bigger than a pistol's flash: it is the cone today's flat wedge stands for, so the take keeps its exact 30° × 2.4 m (the sim's spread) but draws it as hot, turbulent gas, white at the throat and orange at the ends, added, lighting the street around the shooter. The 8 pellets are tiny hot tracers. After the light, the gas is <b>smoke</b>: a lit grey cloud rolling out along the cone, drifting, gone in under a second.",
  game:
    "<code>FxView.blast</code> (<code>weaponLook.ts › BLAST_M</code> shotgun 2.4 m): a pooled Graphics with two <code>slice</code> fills: outer #ffc46b at 0.18 over the weapon's <code>spreadDeg</code> (30°), inner #fff1c4 at 0.4 over 0.45 × length and 0.7 × spread; depth 8.6; alpha 1 → 0 in 110 ms. Pellets: <code>ProjectileView</code> rectangles #ffe7b0, 0.6 m × <code>PELLET_STREAK_SCALE</code> 0.5 = 0.3 m, 0.07 m wide, 60 m/s, range 5 m (≈ 83 ms). Flash: the 1.6× disc.",
  perf:
    "SG-A: 3 plume frames (230 × 77 px, 70 KB each), 3 smoke puffs 64² (16 KB each), one pellet tracer (48 × 8), pool and flash shared with MZ: ≈ 270 KB. Per shot (1.2/s): 1 plume + 1 flash + 1 pool (ADD) for ≤ 110 ms, 8 tracers (ADD, the existing projectile pool: no new objects), 3 smoke puffs for 0.9 s (≤ 4 alive per shotgun; counted in the proposed <code>fx.maxGunSmoke</code>; <code>?fx=low</code> = 2).",
  findings: [
    "Checked and fine: the cone matches the sim's spread exactly (keep: it is the spray's read, pellets live only ~5 frames).",
    "Today the pellets, the cone and the flash are three different yellows (#ffe7b0, #ffc46b / #fff1c4, #ffe9a8): SG-A draws all of them from one temperature ramp.",
  ],
  lengthS: 1.0,
  gapS: 0.3,
  keyT: [0.008, 0.05, 0.092, 0.4],
  viewM: 6,
  aspect: 0.6,
  origin: [0.14, 0.5],
  under: (g, _t, st) => barrel(g, st.cx, st.cy, st.pxm, 0.55),
  looks: [sgNow(), sgTake()],
  plan: {
    goal: "Read the spray: a short, wide, violent cone that shows where the pellets went, then clears so you see what it hit.",
    timing: "Cone 110 ms (<code>BLAST_MS</code>), pellets ≈ 83 ms (5 m at 60 m/s), flash 50 ms. Next shot 0.83 s (1.2/s). Smoke ends before it.",
    lengthS: 1.0,
    lanes: {
      light: [
        { t0: 0, t1: 0.05, label: "flash", key: true },
        { t0: 0, t1: 0.09, label: "big light pool", nw: true },
      ],
      core: [
        { t0: 0, t1: 0.037, label: "gas: white throat", key: true, nw: true },
        { t0: 0.037, t1: 0.074, label: "pushed out", nw: true },
        { t0: 0.074, t1: 0.11, label: "orange ends", nw: true },
      ],
      matter: [{ t0: 0, t1: 0.083, label: "8 pellet tracers" }],
      smoke: [{ t0: 0.03, t1: 0.98, label: "smoke rolls out along the cone and drifts", nw: true }],
      game: [{ t0: 0, t1: 0.083, label: "pellets hit (knockback 0.5 m)" }],
    },
  },
};

/* ======================================================================================================== TR */
const TR_LANES: readonly { look: "gun" | "pellet" | "turret"; name: string; dy: number; off: number }[] = [
  { look: "gun", name: "Gun round (0.6 m)", dy: -1.1, off: 0 },
  { look: "pellet", name: "Shotgun pellet (0.3 m)", dy: 0, off: 0.05 },
  { look: "turret", name: "Turret round (cyan, × 0.7)", dy: 1.1, off: 0.1 },
];
function trEach(st: Stage, t: number, fn: (lane: (typeof TR_LANES)[number], x: number, y: number) => void): void {
  for (const lane of TR_LANES)
    for (let k = 0; k < 3; k++) {
      const age = t - lane.off - k * 0.167;
      if (age <= 0) continue;
      const head = 0.4 + 60 * age;
      if (head > st.w / st.pxm - 0.2) continue;
      fn(lane, st.cx + head * st.pxm, st.cy + lane.dy * st.pxm);
    }
}
function trNow(): Look {
  const r: Record<string, HTMLCanvasElement> = {};
  return {
    code: "now",
    title: "flat coloured sticks",
    note: "Rectangles 0.6 × 0.07 m (#ffd27a), pellets 0.3 m (#ffe7b0), turret rounds cyan #6fe3ff at × 0.7; the head is the projectile.",
    bake: async () => {
      for (const [k, c] of [["gun", "#ffd27a"], ["pellet", "#ffe7b0"], ["turret", "#6fe3ff"]] as const) {
        r[k] ??= (() => {
          const cv = make(60, 7);
          const g = cv.getContext("2d")!;
          g.fillStyle = c;
          g.fillRect(0, 0, 60, 7);
          return cv;
        })();
      }
    },
    draw: (g, t, st) => {
      if (!on(st, "round")) return;
      trEach(st, t, (lane, x, y) => {
        const L = lane.look === "gun" ? 0.6 : lane.look === "pellet" ? 0.3 : 0.42;
        const W = lane.look === "turret" ? 0.049 : 0.07;
        sprite(g, r[lane.look]!, x - (L / 2) * st.pxm, y, L, st.pxm, 0, 1, false, W);
      });
    },
    textures: () => Object.entries(r).map(([k, c]) => tx(`Rectangle ${k}`, c)),
    parts: [{ id: "round", label: "Round" }],
    frames: [
      { label: "frame 1", t: 0.017, when: "one tick: 1 m" },
      { label: "frame 2", t: 0.034, when: "next tick" },
    ],
  };
}
function trTake(): Look {
  const r: Record<string, HTMLCanvasElement> = {};
  return {
    code: "TR-A",
    title: "hot tracers",
    note: "Same lengths and speed; each round is a tracer: a white-hot head, a tail that thins and cools behind it, added (light). Turret rounds keep their cyan (the turret's identity) in the tail, white in the head.",
    bake: async () => {
      r.gun ??= bakeTracer(72, 10, 1, null);
      r.pellet ??= bakeTracer(40, 10, 1.1, null);
      r.turret ??= bakeTracer(56, 10, 1, [111, 227, 255]);
    },
    draw: (g, t, st) => {
      if (!on(st, "round")) return;
      trEach(st, t, (lane, x, y) => {
        const L = lane.look === "gun" ? 0.6 : lane.look === "pellet" ? 0.3 : 0.42;
        sprite(g, r[lane.look]!, x - (L / 2) * st.pxm, y, L, st.pxm, 0, 1, true, lane.look === "turret" ? 0.05 : 0.06);
      });
    },
    textures: () => Object.entries(r).map(([k, c]) => tx(`tracer_${k}`, c, "ADD")),
    parts: [{ id: "round", label: "Tracer" }],
    frames: [
      { label: "frame 1", t: 0.017, when: "one tick: 1 m" },
      { label: "frame 2", t: 0.034, when: "next tick" },
    ],
  };
}
const TR: FxCard = {
  id: "tracer",
  code: "TR",
  name: "Rounds in flight",
  family: "gunfire",
  brief:
    "<b>Light.</b> At 60 m/s a round is only ever seen as a streak: the eye keeps the hot head and the path behind it. So each round becomes a tracer, white-hot at the head, thinning and cooling to amber along its tail, added on top. Same lengths as today (they tell gun, pellet and turret apart); the turret keeps its cyan tail so you can tell its fire from yours.",
  game:
    "<code>ProjectileView</code>: one pooled Phaser <code>rectangle</code> per projectile slot, origin at its head (1, 0.5), 0.6 × 0.07 m #ffd27a; pellets × 0.5 length (#ffe7b0); turret rounds #6fe3ff at × 0.7; depth 8; interpolated between ticks; speed 60 m/s (<code>weapons.json › projectileSpeedMps</code>).",
  perf: "TR-A: 3 tracer textures (72 × 10, 40 × 10, 56 × 10: < 6 KB together). Same pool, same count as today (one image per projectile slot); only the blend changes to ADD. No light pool per round (it would cost a sprite per bullet).",
  findings: ["Checked and fine: the head is the projectile's interpolated position; rotation is set every frame (a reused slot never keeps the old direction)."],
  lengthS: 0.5,
  gapS: 0.2,
  keyT: [0.02, 0.09, 0.2],
  viewM: 8,
  aspect: 0.45,
  origin: [0.02, 0.5],
  under: (g, _t, st) => TR_LANES.forEach((l) => label(g, l.name, st.cx + 0.2 * st.pxm, st.cy + (l.dy - 0.3) * st.pxm, st.pxm)),
  looks: [trNow(), trTake()],
};

/* ======================================================================================================== HT */
const HT_Z = 2 * 0.35 * 1.55; // walker display side (m): 2 r × CHAR_EXTENT_R
function htZombie(): HTMLCanvasElement {
  return charFrame("zombie_walker_a");
}
const htZx = (st: Stage): number => st.cx + 0.2 * st.pxm;
function htNow(): Look {
  let white: HTMLCanvasElement | null = null;
  return {
    code: "now",
    title: "the body flashes flat white",
    note: "The zombie's sprite is filled white (setTint 0xffffff, TintModes.FILL) for 80 ms (a Brute 160 ms). No mark, no blood.",
    bake: async () => {
      white ??= silhouette(htZombie());
    },
    draw: (g, t, st) => {
      if (on(st, "flash") && t < 0.08) sprite(g, white!, htZx(st), st.cy, HT_Z, st.pxm, Math.PI);
    },
    textures: () => [tx("tint (no texture)", white ?? make(1, 1))],
    parts: [{ id: "flash", label: "Hit flash" }],
    frames: [
      { label: "frame 1", t: 0.01, when: "0–80 ms: white" },
      { label: "frame 6", t: 0.09, when: "after 80 ms: normal" },
    ],
  };
}
function htTake(): Look {
  let lit: HTMLCanvasElement | null = null;
  let mist: HTMLCanvasElement[] = [];
  let drop: HTMLCanvasElement[] = [];
  return {
    code: "HT-A",
    title: "a lit flash and a spray out the back",
    note: "The flash keeps its 80 ms but keeps the body's shape (the picture brightened toward white, not a flat fill). The round exits: a dark red-brown mist sprays out the far side (0.2 s) and a few drops land behind the zombie and stay as small marks.",
    bake: async () => {
      if (lit) return;
      const z = htZombie();
      lit = make(z.width, z.height);
      const g = lit.getContext("2d")!;
      g.drawImage(z, 0, 0);
      g.globalCompositeOperation = "lighter";
      g.drawImage(z, 0, 0);
      g.drawImage(z, 0, 0);
      g.globalCompositeOperation = "source-atop";
      g.fillStyle = "rgba(255,255,255,0.62)";
      g.fillRect(0, 0, z.width, z.height);
      mist = [bakeMist(48, 2), bakeMist(48, 7)];
      drop = [bakeDrop(16, 1), bakeDrop(16, 4), bakeDrop(16, 9)];
    },
    draw: (g, t, st) => {
      const R = rng(77 + st.seed);
      const ex = htZx(st) + 0.3 * st.pxm; // the exit side (shot from the left)
      if (on(st, "drops"))
        for (let k = 0; k < (st.low ? 2 : 4); k++) {
          const a = (R() - 0.5) * 0.9;
          const dist = 0.25 + R() * 0.35;
          const u = Math.min(1, t / 0.11);
          const h = 4 * 0.12 * u * (1 - u);
          const x = ex + Math.cos(a) * dist * easeOut(u) * st.pxm;
          const y = st.cy + (Math.sin(a) * dist * easeOut(u) - h) * st.pxm;
          sprite(g, drop[k % 3]!, x, y, (u < 1 ? 0.05 : 0.065) + h * 0.2, st.pxm, a, u < 1 ? 0.9 : 0.85 * linFade(t - 0.11, 3000));
        }
      if (on(st, "mist"))
        for (let k = 0; k < (st.low ? 1 : 3); k++) {
          const a = (k - 1) * 0.35;
          const age = t - k * 0.012;
          if (age <= 0 || age > 0.22) continue;
          const u = age / 0.22;
          sprite(g, mist[k % 2]!, ex + Math.cos(a) * 0.45 * easeOut(u) * st.pxm, st.cy + Math.sin(a) * 0.45 * easeOut(u) * st.pxm, 0.12 + 0.3 * easeOut(u), st.pxm, k, 0.7 * (1 - u));
        }
      if (on(st, "flash") && t < 0.08) sprite(g, lit!, htZx(st), st.cy, HT_Z, st.pxm, Math.PI, 1 - 0.55 * (t / 0.08));
    },
    textures: () => [tx("hit_lit (per zombie frame)", lit ?? make(1, 1), "or a tint: see perf"), ...mist.map((c, k) => tx(`blood_mist_${k}`, c)), ...drop.map((c, k) => tx(`blood_drop_${k}`, c))],
    parts: [
      { id: "flash", label: "Lit flash" },
      { id: "mist", label: "Exit mist (matter)" },
      { id: "drops", label: "Drops → marks" },
    ],
    frames: [
      { label: "hit", t: 0.01, when: "0–17 ms: flash full" },
      { label: "spray", t: 0.06, when: "60 ms: flash dims, mist out" },
      { label: "landed", t: 0.15, when: "drops landed" },
    ],
  };
}
const HT: FxCard = {
  id: "hit",
  code: "HT",
  name: "Hit on a zombie",
  family: "gunfire",
  brief:
    "<b>Light on the body, matter out of it.</b> The white hit flash is a readability rule (FR19: you must see that you hit), so it stays, same length; but a flat white fill erases the body: the take brightens the zombie's own picture toward white, so its shape stays readable through the flash. The round goes through: <b>matter</b> sprays out the far side as a dark red-brown mist, and a few drops land on the street behind it and stay (<b>the mark</b>): you can read where the shot came from.",
  game:
    "<code>FxView</code> <code>zombie.hit</code> → <code>ZombieView.flash</code>: the top sprite gets <code>setTint(0xffffff)</code> + <code>TintModes.FILL</code> for <code>FLASH_MS</code> 80 ms (<code>BRUTE_FLASH_MS</code> 160 ms, Story 5.7), plus the hit sound. No position or direction is used.",
  perf:
    "HT-A: the lit flash in the game = a <b>tint</b>, not a texture: Phaser's <code>TintModes.ADD</code>-style brightening (tint toward white without FILL) or a second additive copy of the same frame: 0 new textures. Mist: 2 × 48² (9 KB each), drops: 3 × 16². Per hit: up to 3 mist + 4 drops (0.2 s), drop marks live 3 s (a <b>new pool, cap 64 marks</b>; <code>?fx=low</code>: 1 mist + 2 drops, cap 32). Needs the shot's direction on <code>zombie.hit</code> (today the event has the zombie id only).",
  findings: [
    "The flat FILL tint turns the zombie into a white blob for 5 frames: the type (Walker vs Runner) can't be read during sustained fire.",
    "<code>zombie.hit</code> carries no direction, so no effect can know where the shot came from: HT-A needs the shooter's direction (or the projectile's) added to the event (client-only use).",
  ],
  lengthS: 0.6,
  gapS: 0.3,
  keyT: [0.01, 0.06, 0.15],
  viewM: 3,
  aspect: 0.6,
  origin: [0.45, 0.5],
  under: (g, _t, st) => body(g, htZombie(), htZx(st), st.cy, HT_Z, st.pxm, Math.PI),
  looks: [htNow(), htTake()],
  plan: {
    goal: "You know you hit, and from which side, without losing sight of what you hit.",
    timing: "Flash 80 ms (Brute 160 ms) (<code>ZombieView.ts › FLASH_MS</code>). Mist 0–0.22 s, drops land at 0.11 s, marks fade over 3 s.",
    lengthS: 0.6,
    lanes: {
      light: [{ t0: 0, t1: 0.08, label: "flash: body brightened, shape kept", key: true, nw: true }],
      matter: [
        { t0: 0, t1: 0.22, label: "exit mist", nw: true },
        { t0: 0, t1: 0.11, label: "drops fly", nw: true },
      ],
      mark: [{ t0: 0.11, t1: 0.6, label: "drops stay (3 s)", nw: true }],
      game: [{ t0: 0, t1: 0.02, label: "damage, sound", key: true }],
    },
  },
};

/* ======================================================================================================== BL */
function blNow(): Look {
  let splat: HTMLCanvasElement | null = null;
  let puff: HTMLCanvasElement | null = null;
  return {
    code: "now",
    title: "a dark red disc + a red puff",
    note: "Splat: a circle r 0.35 m, #5a0f0f at 0.85, fading to 0 over 10 s (200 kept). Puff: a circle r 0.3 m, #8a1c1c, scale 0.5 → 1.4 and alpha 0.8 → 0 in 200 ms.",
    bake: async () => {
      splat ??= disc(64, "#5a0f0f");
      puff ??= disc(64, "#8a1c1c");
    },
    draw: (g, t, st) => {
      if (on(st, "splat")) sprite(g, splat!, st.cx, st.cy, 0.7, st.pxm, 0, 0.85 * linFade(t, 10_000));
      if (on(st, "puff") && t < 0.2) sprite(g, puff!, st.cx, st.cy, 0.6 * (0.5 + 0.9 * (t / 0.2)), st.pxm, 0, 0.8 * linFade(t, 200));
    },
    textures: () => [tx("Arc splat", splat ?? make(1, 1)), tx("Arc puff", puff ?? make(1, 1))],
    parts: [
      { id: "splat", label: "Splat" },
      { id: "puff", label: "Death puff" },
    ],
    frames: [
      { label: "burst", t: 0.03, when: "0–200 ms: puff grows" },
      { label: "pool", t: 0.3, when: "after: the disc" },
      { label: "5 s", t: 5, when: "half faded" },
    ],
  };
}
function blTake(code: "BL-A" | "BL-B"): Look {
  const spatter = code === "BL-B";
  let pools: BloodPic[] = [];
  let mist: HTMLCanvasElement[] = [];
  let drop: HTMLCanvasElement[] = [];
  const SIZE = 1.2;
  return {
    code,
    title: spatter ? "matte spatter soaked into the street" : "a glossy pool that spreads, then dries",
    note: spatter
      ? "No pool: a burst of spatter thrown in every direction, matte, with a darker soak under it where the asphalt drank it. Reads as old and dry from the start; no gloss."
      : "A dark red-brown mist bursts out (0.3 s), drops fly and land, and the blood spreads into a pool in 0.3 s (shaded as a liquid: thick dark middle, thin translucent rim, the rim facing the street light catches a soft gloss). The gloss dries off in a few seconds; the pool fades on today's 10 s. 3 pool shapes, picked per kill; sized by the zombie (× radius / 0.35).",
    bake: async () => {
      if (pools.length) return;
      for (let k = 0; k < 3; k++) {
        pools.push(bakeBlood(11 + k * 7, SIZE, spatter));
        await idle();
      }
      mist = [bakeMist(56, 5), bakeMist(56, 12), bakeMist(56, 19)];
      drop = [bakeDrop(16, 2), bakeDrop(16, 6)];
    },
    draw: (g, t, st) => {
      const p = pools[st.seed % pools.length]!;
      const rot = (st.seed * 2.39996) % (Math.PI * 2);
      if (on(st, "pool")) {
        const grow = spatter ? ramp(t, 0.01, 0.06) : 0.3 + 0.7 * easeOut(t / 0.3);
        const a = (spatter ? 0.95 * grow : 0.97 * ramp(t, 0.02, 0.06)) * linFade(t, 10_000);
        sprite(g, p.base, st.cx, st.cy, SIZE * (spatter ? 1 : grow), st.pxm, rot, a);
        if (!spatter) sprite(g, p.gloss, st.cx, st.cy, SIZE * grow, st.pxm, rot, 0.32 * a * (1 - ramp(t, 0.8, 5)), true);
      }
      if (on(st, "drops") && t < 0.13) {
        const R = rng(31 + st.seed);
        for (let k = 0; k < (st.low ? 3 : 6); k++) {
          const ang = R() * Math.PI * 2;
          const dist = 0.3 + R() * 0.25;
          const u = t / 0.13;
          const h = 4 * 0.15 * u * (1 - u);
          sprite(g, drop[k % 2]!, st.cx + Math.cos(ang) * dist * easeOut(u) * st.pxm, st.cy + (Math.sin(ang) * dist * easeOut(u) - h) * st.pxm, 0.05 + h * 0.25, st.pxm, ang, 0.9);
        }
      }
      if (on(st, "mist"))
        for (let k = 0; k < (st.low ? 2 : 5); k++) {
          const age = t - k * 0.01;
          if (age <= 0 || age > 0.32) continue;
          const u = age / 0.32;
          const ang = (k / 5) * Math.PI * 2 + st.seed;
          sprite(g, mist[k % 3]!, st.cx + Math.cos(ang) * 0.32 * easeOut(u) * st.pxm, st.cy + Math.sin(ang) * 0.32 * easeOut(u) * st.pxm, 0.22 + 0.4 * easeOut(u), st.pxm, k, 0.6 * (1 - u) * ramp(age, 0, 0.03));
        }
    },
    textures: () => [...pools.flatMap((p, k) => [tx(`blood_pool_${k}`, p.base, "shaded"), ...(spatter ? [] : [tx(`blood_gloss_${k}`, p.gloss, "ADD")])]), ...mist.map((c, k) => tx(`blood_mist_${k}`, c)), ...drop.map((c, k) => tx(`blood_drop_${k}`, c))],
    parts: [
      { id: "mist", label: "Mist (matter)" },
      { id: "drops", label: "Flying drops" },
      { id: "pool", label: spatter ? "Spatter (mark)" : "Pool + gloss (mark)" },
    ],
    frames: [
      { label: "burst", t: 0.03, when: "30 ms: mist out" },
      { label: "spread", t: 0.12, when: "drops land, pool spreading" },
      { label: "settled", t: 0.35, when: "pool full, glossy" },
      { label: "5 s", t: 5, when: "dried, half faded" },
    ],
  };
}
const BL: FxCard = {
  id: "blood",
  code: "BL",
  name: "Blood splat and death puff",
  family: "gunfire",
  brief:
    "<b>Matter, then the mark.</b> A zombie dies: blood leaves the body as a fine dark mist and as drops that fly and land, then it spreads on the asphalt into a pool, thick and dark in the middle, thin and translucent at the rim, with the satellites the drops made. Fresh blood is the one mark with a little gloss (it catches the street light); it dries matte. It is <b>dark red-brown</b>, one colour everywhere, never the bright warning red (today's puff #8a1c1c sits close to it). Two takes because this is a real choice: a fresh glossy pool (A) or matte, soaked spatter (B).",
  game:
    "<code>FxView.splat</code>: a ring buffer of 200 Phaser circles r 0.35 m #5a0f0f, depth 1, alpha 0.85 → 0 over <code>SPLAT_FADE_MS</code> 10 s (a tween each). <code>FxView.puff</code>: a pooled circle r 0.3 m #8a1c1c, depth 6, scale 0.5 → 1.4, alpha 0.8 → 0 in <code>PUFF_MS</code> 200 ms. Same size for every type.",
  perf:
    "BL-A: 3 shaded pools 128² (64 KB each) + 3 gloss masks (ADD), 3 mist puffs 56², 2 drops 16²: ≈ 430 KB. Per kill: 1 pool + 1 gloss (the existing 200 ring; the gloss is a 2nd image, or dropped after 5 s), ≤ 5 mist + 6 drops for 0.3 s (a new pooled set, <b>cap 48</b>; <code>?fx=low</code>: 2 mist + 3 drops). BL-B: 3 spatters, no gloss: ≈ 230 KB. The shading runs once at bake (≈ 10 ms per pool), not in play.",
  findings: [
    "Four different bloods in the game today: splat #5a0f0f, puff #8a1c1c (bright, close to the warning red), Crawler trail #4a0c0c, Chainsaw blood #8a1010. The takes use one blood palette everywhere.",
    "Every splat is 0.35 m whatever died (a Brute is r 0.6, a Bloater 0.5): the takes scale the pool by the zombie's radius.",
    "200 splats each run their own 10 s tween (fine on desktop; on a phone a shared clock in the view would be cheaper).",
  ],
  lengthS: 1.6,
  gapS: 0.4,
  keyT: [0.03, 0.12, 0.35, 1.5],
  viewM: 2.4,
  aspect: 0.75,
  looks: [blNow(), blTake("BL-A"), blTake("BL-B")],
  plan: {
    goal: "The kill lands: a burst you feel, then a mark that tells the street what happened here.",
    timing: "Puff 200 ms (<code>PUFF_MS</code>); splat fades over 10 s (<code>SPLAT_FADE_MS</code>), 200 kept. Take: mist 0–0.32 s, drops land at 0.13 s, pool spreads 0–0.3 s, gloss dries 0.8–5 s.",
    lengthS: 1.6,
    lanes: {
      matter: [
        { t0: 0, t1: 0.32, label: "mist burst (dark red-brown)", key: true, nw: true },
        { t0: 0, t1: 0.13, label: "drops fly", nw: true },
      ],
      mark: [
        { t0: 0.02, t1: 0.3, label: "pool spreads", nw: true },
        { t0: 0.3, t1: 1.6, label: "glossy → dries matte (5 s) → fades (10 s)", nw: true },
      ],
      game: [{ t0: 0, t1: 0.02, label: "zombie removed", key: true }],
    },
  },
};

/* ======================================================================================================== BT */
const BT_SPEED = 0.7; // crawler m/s (BloodTrailView comment, zombies.json)
const BT_SPACING = 0.35;
const BT_Z = 2 * 0.35 * 1.75;
const btX = (st: Stage, t: number): number => st.cx + BT_SPEED * t * st.pxm;
function btMarks(t: number, fn: (k: number, x: number, age: number) => void): void {
  for (let k = 1; k * BT_SPACING <= BT_SPEED * t; k++) {
    const born = (k * BT_SPACING) / BT_SPEED;
    const age = t - born;
    if (age > 5) continue;
    fn(k, k * BT_SPACING, age);
  }
}
function btCrawler(g: CanvasRenderingContext2D, t: number, st: Stage): void {
  if (st.only !== null) return;
  body(g, charFrame("zombie_crawler_a"), btX(st, t), st.cy, BT_Z, st.pxm, 0);
}
function btNow(): Look {
  let m: HTMLCanvasElement | null = null;
  return {
    code: "now",
    title: "flat dark ovals",
    note: "Every 0.35 m a 0.42 × 0.26 m mark (two ellipses, #4a0c0c), alpha 0.6 → 0 over 5 s.",
    bake: async () => {
      if (m) return;
      m = make(32, 20);
      const g = m.getContext("2d")!;
      g.fillStyle = "rgba(74,12,12,1)";
      g.beginPath();
      g.ellipse(16, 10, 14.4, 5.5, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = "rgba(74,12,12,0.7)";
      g.beginPath();
      g.ellipse(9.6, 7.6, 6.4, 5, 0, 0, Math.PI * 2);
      g.fill();
    },
    draw: (g, t, st) => {
      if (on(st, "trail")) btMarks(t, (_k, x, age) => sprite(g, m!, st.cx + x * st.pxm, st.cy, 0.42, st.pxm, 0, 0.6 * (1 - age / 5), false, 0.26));
      btCrawler(g, t, st);
    },
    textures: () => [tx("blood_trail", m ?? make(1, 1))],
    parts: [{ id: "trail", label: "Trail marks" }],
    frames: [
      { label: "1.5 s", t: 1.5, when: "2 marks/s" },
      { label: "4 s", t: 4, when: "the oldest half faded" },
    ],
  };
}
function btTake(): Look {
  let sm: BloodPic[] = [];
  return {
    code: "BT-A",
    title: "a wet drag smear",
    note: "Longer smears (0.5 m) that overlap into one continuous drag mark, thick where the body pressed and streaked behind, shaded like the pools with a fresh gloss on the rim facing the light; the gloss dries in 2 s, the mark fades on today's 5 s. 3 shapes, slight random turn.",
    bake: async () => {
      if (sm.length) return;
      for (let k = 0; k < 3; k++) sm.push(bakeSmear(5 + k * 13));
    },
    draw: (g, t, st) => {
      if (on(st, "trail"))
        btMarks(t, (k, x, age) => {
          const p = sm[k % 3]!;
          const rot = Math.sin(k * 1.7) * 0.12;
          const a = 0.82 * (1 - age / 5);
          sprite(g, p.base, st.cx + x * st.pxm, st.cy + Math.sin(k * 2.3) * 0.03 * st.pxm, 0.7, st.pxm, rot, a);
          sprite(g, p.gloss, st.cx + x * st.pxm, st.cy + Math.sin(k * 2.3) * 0.03 * st.pxm, 0.7, st.pxm, rot, 0.5 * a * (1 - ramp(age, 0.4, 2)), true);
        });
      btCrawler(g, t, st);
    },
    textures: () => sm.flatMap((p, k) => [tx(`smear_${k}`, p.base, "shaded"), tx(`smear_gloss_${k}`, p.gloss, "ADD")]),
    parts: [{ id: "trail", label: "Smear + gloss" }],
    frames: [
      { label: "1.5 s", t: 1.5, when: "fresh, glossy" },
      { label: "4 s", t: 4, when: "the oldest dried and fading" },
    ],
  };
}
const BT: FxCard = {
  id: "trail",
  code: "BT",
  name: "Crawler blood trail",
  family: "gunfire",
  brief:
    "<b>The mark.</b> A Crawler drags its body: the trail is one continuous smear, heaviest where the body pressed, with a few broad drag streaks behind (soft, never fine lines). Fresh, it keeps a little gloss (the same blood and the same shading as the kills); it dries matte and fades on today's 5 s. Same spacing, same lifetime, same blood palette as BL.",
  game:
    "<code>BloodTrailView</code>: a ring of 400 Phaser images (texture <code>blood_trail</code>, 32 × 20 px, two ellipses #4a0c0c), one every 0.35 m a Crawler moves (0.7 m/s: 2 per second), 0.42 × 0.26 m, alpha 0.6 → 0 over 5 s, depth 1; fog-hidden Crawlers drop none.",
  perf: "BT-A: 3 smears 96² shaded + 3 gloss masks: ≈ 220 KB. Same ring (400), one image per mark + its gloss for 2 s (or the gloss dropped: the matte smear alone still reads). No change to spacing or count.",
  findings: ["Checked and fine: marks never allocate (ring of 400), the fade runs on the view's own clock (a pause freezes it)."],
  lengthS: 6,
  gapS: 0.4,
  keyT: [1.5, 3.5, 5.5],
  viewM: 5.5,
  aspect: 0.4,
  origin: [0.08, 0.5],
  looks: [btNow(), btTake()],
};

/* ======================================================================================================== ML */
const ML_W: readonly { name: string; range: number; arc: number; dx: number; heavy: boolean }[] = [
  { name: "Machete (110°, 1.8 m)", range: 1.8, arc: 110 * DEG, dx: -1.9, heavy: false },
  { name: "Fire Axe (140°, 2.2 m)", range: 2.2, arc: 140 * DEG, dx: 1.9, heavy: true },
];
const mlPos = (st: Stage, i: number): [number, number] => [st.cx + ML_W[i]!.dx * st.pxm, st.cy + 1.3 * st.pxm];
function mlNow(): Look {
  const w: HTMLCanvasElement[] = [];
  const P = 48;
  return {
    code: "now",
    title: "flat pale wedges",
    note: "Machete: the sector filled #e8eef2 at 0.35, fading in 120 ms. Fire Axe: #f2e6dc at 0.3 with a warm 0.22 m rim (#ffd2b8 at 0.55), fading in 200 ms.",
    bake: async () => {
      if (w.length) return;
      w.push(slice(1.8, 55 * DEG, "#e8eef2", 0.35, P));
      w.push(slice(2.2, 70 * DEG, "#f2e6dc", 0.3, P, undefined, { w: 0.22, col: "#ffd2b8", alpha: 0.55 }));
    },
    draw: (g, t, st) => {
      if (!on(st, "arc")) return;
      ML_W.forEach((m, i) => {
        const [x, y] = mlPos(st, i);
        const a = linFade(t, m.heavy ? 200 : 120);
        if (a > 0) sprite(g, w[i]!, x, y, w[i]!.width / P, st.pxm, -Math.PI / 2, a);
      });
    },
    textures: () => w.map((c, i) => tx(`Graphics slice ${ML_W[i]!.name}`, c, "redrawn per swing")),
    parts: [{ id: "arc", label: "Swing arc" }],
    frames: [
      { label: "frame 1", t: 0.01, when: "0–17 ms: full sector" },
      { label: "frame 4", t: 0.06, when: "60 ms: half gone" },
    ],
  };
}
function mlTake(): Look {
  const sweeps: HTMLCanvasElement[][] = [];
  let glint: HTMLCanvasElement | null = null;
  const P = 40;
  return {
    code: "ML-A",
    title: "the blade's sweep",
    note: "The same sector, but swept: the blade crosses it in 4 frames (60 ms machete, 90 ms axe), leaving a motion smear that is densest at the blade and toward the rim; a glint where the steel catches the street light; then it fades out on today's end times (120 / 200 ms).",
    bake: async () => {
      if (sweeps.length) return;
      for (const m of ML_W) {
        sweeps.push([0.25, 0.5, 0.75, 1].map((f) => bakeSweep(m.range, m.arc, f, m.heavy)));
        await idle();
      }
      glint = bakeGlint(48);
    },
    draw: (g, t, st) => {
      ML_W.forEach((m, i) => {
        const [x, y] = mlPos(st, i);
        const sweepS = m.heavy ? 0.09 : 0.06;
        const endS = m.heavy ? 0.2 : 0.12;
        if (t >= endS) return;
        const f = Math.min(3, Math.floor((t / sweepS) * 4));
        const a = t < sweepS ? 1 : 1 - (t - sweepS) / (endS - sweepS);
        const tex = sweeps[i]![f]!;
        if (on(st, "arc")) sprite(g, tex, x, y, tex.width / P, st.pxm, -Math.PI / 2, a);
        if (on(st, "glint") && t < sweepS + 0.03) {
          const frac = Math.min(1, t / sweepS);
          const ang = -Math.PI / 2 - m.arc / 2 + m.arc * frac;
          const ga = Math.sin(Math.min(1, t / (sweepS + 0.03)) * Math.PI);
          sprite(g, glint!, x + Math.cos(ang) * m.range * 0.9 * st.pxm, y + Math.sin(ang) * m.range * 0.9 * st.pxm, m.heavy ? 0.42 : 0.34, st.pxm, 0, ga, true);
        }
      });
    },
    textures: () => [...sweeps.flatMap((s, i) => s.map((c, f) => tx(`sweep_${ML_W[i]!.heavy ? "axe" : "machete"}_${f}`, c))), tx("glint", glint ?? make(1, 1), "ADD")],
    parts: [
      { id: "arc", label: "Sweep smear" },
      { id: "glint", label: "Steel glint (light)" },
    ],
    frames: [
      { label: "sweep 1", t: 0.008, when: "0–15 ms" },
      { label: "sweep 2", t: 0.024, when: "15–30 ms" },
      { label: "sweep 3", t: 0.039, when: "30–45 ms" },
      { label: "sweep 4", t: 0.054, when: "45–60 ms: the whole sector" },
      { label: "fade", t: 0.1, when: "60–120 ms (axe to 200 ms)" },
    ],
  };
}
const ML: FxCard = {
  id: "melee",
  code: "ML",
  name: "Melee swing arc",
  family: "gunfire",
  brief:
    "<b>Matter in motion, with one glint of light.</b> A swing is steel crossing the air: the eye keeps a smear behind the blade, densest at the blade and toward the rim (the tip moves fastest), and a glint where the edge catches the street light. So the arc is drawn as that sweep, crossing the sim's sector in a few frames. It still covers <b>exactly the sim's sector</b> (Story 5.2's F1 rule: the read of what you can hit), and ends on today's times. The Fire Axe: a wider, heavier, warmer band.",
  game:
    "<code>FxView.swing</code>: a pooled Graphics (cap <code>fx.maxSwingArcs</code> 8) with a <code>slice</code> fill of the sim's sector (<code>weapons.json</code>: machete 110° × 1.8 m, fire axe 140° × 2.2 m), depth 7. Machete (\"light\"): #e8eef2 at 0.35, fade 120 ms. Fire Axe (\"heavy\"): #f2e6dc at 0.3 + a 0.22 m rim stroke #ffd2b8 at 0.55, fade 200 ms. Rates: machete 2.5/s, axe 1.4/s.",
  perf:
    "ML-A: 4 sweep frames per weapon (machete 148², axe 180²: ≈ 610 KB for both, as one atlas) + one 48² glint. Per swing: 1 image (frames swapped) + 1 glint (ADD) for ≤ 200 ms. Same cap 8. Unlike today's Graphics, no path is rebuilt per swing (cheaper).",
  findings: [
    "Checked and fine: the wedge is the exact sim sector (F1).",
    "Today the swing has no direction of travel (a whole wedge appears at once), so a swing reads like a cone, not a cut.",
  ],
  lengthS: 0.4,
  gapS: 0.4,
  keyT: [0.008, 0.039, 0.1],
  viewM: 8,
  aspect: 0.5,
  under: (g, _t, st) =>
    ML_W.forEach((m, i) => {
      const [x, y] = mlPos(st, i);
      g.fillStyle = "#15181b";
      g.beginPath();
      g.arc(x, y, 0.2 * st.pxm, 0, Math.PI * 2);
      g.fill();
      label(g, m.name, x, y + 0.45 * st.pxm, st.pxm, "center");
    }),
  looks: [mlNow(), mlTake()],
  plan: {
    goal: "Read the cut: which way the blade went and exactly what it could reach.",
    timing: "Machete 120 ms, axe 200 ms (<code>SWING_MS</code>, <code>AXE_SWING_MS</code>). Sweep: 60 ms (4 frames) / 90 ms, then fade to the same end.",
    lengthS: 0.4,
    lanes: {
      light: [{ t0: 0, t1: 0.09, label: "glint rides the blade", nw: true }],
      core: [
        { t0: 0, t1: 0.06, label: "sweep (machete)", key: true, nw: true },
        { t0: 0.06, t1: 0.12, label: "fade" },
        { t0: 0.12, t1: 0.2, label: "axe fade ends" },
      ],
      game: [{ t0: 0, t1: 0.02, label: "hits resolved on the swing", key: true }],
    },
  },
};

/* ======================================================================================================== CS */
const CS_RANGE = 1.5;
const CS_HALF = 30 * DEG;
const CS_TIP = CS_RANGE * 0.75;
const SPARK_MS = 180;
interface Spark {
  vx: number;
  vy: number;
  life: number;
  born: number;
  blood: boolean;
}
/** The game's SparkPool.spawn (meleeFx.ts), replayed: same random order and numbers. 10 ticks/s, all hits. */
function csSparks(lengthS: number, low: boolean): Spark[] {
  const out: Spark[] = [];
  let seed = 1;
  const rand = (): number => ((seed = (seed * 1664525 + 1013904223) >>> 0), seed / 4294967296);
  const spawn = (born: number, n: number, blood: boolean): void => {
    for (let i = 0; i < n; i++) {
      const side = rand() < 0.5 ? -1 : 1;
      const a = (rand() - 0.5) * 2.1;
      const px = 0;
      const py = side; // dir = +x → perpendicular (0, side)
      const c = Math.cos(a);
      const s = Math.sin(a);
      const ux = px * c - py * s - 0.35;
      const uy = px * s + py * c;
      const sp = 2 + rand() * 3;
      out.push({ vx: ux * sp, vy: uy * sp, life: (SPARK_MS * (0.6 + rand() * 0.4)) / 1000, born, blood });
    }
  };
  for (let k = 0; k * 0.1 < lengthS - 0.05; k++) {
    spawn(k * 0.1, low ? 2 : 4, false);
    spawn(k * 0.1, low ? 1 : 2, true);
  }
  return out;
}
const csPos = (sp: Spark, age: number, drag = 6): [number, number] => {
  const k = (1 - Math.exp(-drag * age)) / drag;
  return [CS_TIP + sp.vx * k, sp.vy * k];
};
const CS_ZX = 1.35;
function csNow(): Look {
  let wedge: HTMLCanvasElement | null = null;
  let sq: HTMLCanvasElement[] = [];
  const P = 48;
  return {
    code: "now",
    title: "a faint wedge + square sparks",
    note: "A 60° × 1.5 m wedge (#ffc98a at 0.16) redrawn every 0.1 s (fades in 140 ms); per cut 4 steel sparks (#ffe2a0) + 2 blood (#8a1010), 0.1 m squares flying 2–5 m/s, 108–180 ms.",
    bake: async () => {
      wedge ??= slice(CS_RANGE, CS_HALF, "#ffc98a", 0.16, P);
      if (!sq.length) sq = ["#ffe2a0", "#8a1010"].map((c) => {
        const cv = make(8, 8);
        const g = cv.getContext("2d")!;
        g.fillStyle = c;
        g.fillRect(0, 0, 8, 8);
        return cv;
      });
    },
    draw: (g, t, st) => {
      if (on(st, "wedge")) {
        const last = Math.floor(t / 0.1) * 0.1;
        for (const s of [last, last - 0.1]) {
          if (s < 0 || t - s >= 0.14) continue;
          sprite(g, wedge!, st.cx, st.cy, wedge!.width / P, st.pxm, 0, 1 - (t - s) / 0.14);
        }
      }
      for (const sp of csSparks(1, st.low)) {
        const age = t - sp.born;
        if (age < 0 || age >= sp.life) continue;
        if (!on(st, sp.blood ? "blood" : "sparks")) continue;
        const [x, y] = csPos(sp, age);
        sprite(g, sq[sp.blood ? 1 : 0]!, st.cx + x * st.pxm, st.cy + y * st.pxm, 0.1, st.pxm, 0, Math.min(1, (sp.life - age) / (SPARK_MS / 1000)));
      }
    },
    textures: () => [tx("Graphics slice", wedge ?? make(1, 1)), tx("spark (Graphics rect)", sq[0] ?? make(1, 1)), tx("blood (Graphics rect)", sq[1] ?? make(1, 1))],
    parts: [
      { id: "wedge", label: "Wedge" },
      { id: "sparks", label: "Steel sparks" },
      { id: "blood", label: "Blood" },
    ],
    frames: [
      { label: "cut", t: 0.02, when: "a tick's sparks fly" },
      { label: "next", t: 0.12, when: "next tick" },
    ],
  };
}
function csTake(): Look {
  let wedge: HTMLCanvasElement | null = null;
  let spark: HTMLCanvasElement[] = [];
  let drop: HTMLCanvasElement[] = [];
  let pool: HTMLCanvasElement | null = null;
  let mist: HTMLCanvasElement | null = null;
  const P = 48;
  return {
    code: "CS-A",
    title: "hot sparks, heavy blood",
    note: "Same sparks, same numbers, as hot streaks stretched along their flight and cooling from white-yellow to dull red as they die (light, added); a flicker of light at the blade. Blood as dark red-brown drops that fly shorter (heavier), land and stay (cap 8 marks), and a small mist at each cut. The wedge stays (the sim's sector), a little fainter.",
    bake: async () => {
      if (wedge) return;
      wedge = slice(CS_RANGE, CS_HALF, "#ffc98a", 0.11, P);
      spark = [0, 1, 2].map((a) => bakeSpark(a));
      drop = [bakeDrop(16, 3), bakeDrop(16, 8)];
      pool = bakePool(48, [255, 190, 110]);
      mist = bakeMist(40, 21);
    },
    draw: (g, t, st) => {
      if (on(st, "wedge")) {
        const last = Math.floor(t / 0.1) * 0.1;
        for (const s of [last, last - 0.1]) {
          if (s < 0 || t - s >= 0.14) continue;
          sprite(g, wedge!, st.cx, st.cy, wedge!.width / P, st.pxm, 0, 1 - (t - s) / 0.14);
        }
      }
      const tick = Math.floor(t / 0.1);
      const tk = t - tick * 0.1;
      if (on(st, "light")) sprite(g, pool!, st.cx + CS_TIP * st.pxm, st.cy, 1.3, st.pxm, 0, (0.3 + 0.15 * Math.abs(Math.sin(tick * 2.7))) * (1 - 0.6 * tk / 0.1), true);
      if (on(st, "blood") && tk < 0.2) sprite(g, mist!, st.cx + (CS_TIP + 0.12) * st.pxm, st.cy, 0.12 + tk * 1.5, st.pxm, tick, 0.45 * (1 - tk / 0.1));
      const sparks = csSparks(1, st.low);
      // blood marks: the last 8 that landed
      if (on(st, "blood")) {
        const landed = sparks.filter((s) => s.blood && t - s.born >= s.life).slice(-8);
        landed.forEach((s, i) => {
          const [x, y] = csPos(s, s.life, 9);
          sprite(g, drop[i % 2]!, st.cx + x * st.pxm, st.cy + y * st.pxm, 0.055, st.pxm, i, 0.8);
        });
      }
      for (const sp of sparks) {
        const age = t - sp.born;
        if (age < 0 || age >= sp.life) continue;
        if (sp.blood) {
          if (!on(st, "blood")) continue;
          const [x, y] = csPos(sp, age, 9);
          sprite(g, drop[0]!, st.cx + x * st.pxm, st.cy + y * st.pxm, 0.05, st.pxm, 0, 0.95);
          continue;
        }
        if (!on(st, "sparks")) continue;
        const [x, y] = csPos(sp, age);
        const v = Math.hypot(sp.vx, sp.vy) * Math.exp(-6 * age);
        const ang = Math.atan2(sp.vy, sp.vx);
        const u = age / sp.life;
        sprite(g, spark[u < 0.33 ? 0 : u < 0.66 ? 1 : 2]!, st.cx + x * st.pxm, st.cy + y * st.pxm, 0.08 + v * 0.06, st.pxm, ang, 1 - u * 0.5, true, 0.055);
      }
    },
    textures: () => [tx("wedge", wedge ?? make(1, 1)), ...spark.map((c, k) => tx(`spark_${["hot", "orange", "red"][k]}`, c, "ADD")), ...drop.map((c, k) => tx(`blood_drop_${k}`, c, "shared")), tx("blade light", pool ?? make(1, 1), "ADD"), tx("mist", mist ?? make(1, 1), "shared")],
    parts: [
      { id: "wedge", label: "Wedge (sim sector)" },
      { id: "sparks", label: "Sparks (light)" },
      { id: "light", label: "Blade light" },
      { id: "blood", label: "Blood drops, mist, marks" },
    ],
    frames: [
      { label: "cut", t: 0.02, when: "20 ms: sparks hot" },
      { label: "cooling", t: 0.09, when: "sparks orange" },
      { label: "next", t: 0.12, when: "next tick" },
    ],
  };
}
const CS: FxCard = {
  id: "chainsaw",
  code: "CS",
  name: "Chainsaw sparks and blood",
  family: "gunfire",
  brief:
    "<b>Light thrown off steel, matter thrown off flesh.</b> A chainsaw cutting throws sparks: tiny bits of hot metal, seen as streaks along their flight, white-yellow when born and cooling to dull red as they die, added. Blood is heavier: dark red-brown drops that fly shorter, land and stay. A flicker of light at the blade where the sparks are born. Same numbers as the game's spark pool (count, speed, life, cap); the faint wedge stays because it is the sim's sector.",
  game:
    "<code>FxView.sawCut</code> every tick (10/s): the wedge (#ffc98a at 0.16, 60° × 1.5 m, fade 140 ms) and <code>meleeFx.ts › SparkPool.spawn</code> at the blade tip (0.75 × range): per cut <code>chainsawSparksPerHit</code> 4 steel + 2 blood (a miss: 1 steel), ±60° around the blade's side, 2–5 m/s with drag, life 0.6–1 × <code>chainsawSparkMs</code> 180 ms, cap <code>maxChainsawSparks</code> 32; drawn as 0.1 m squares (#ffe2a0 / #8a1010) in one Graphics, alpha by life left.",
  perf:
    "CS-A: 3 spark streaks 32 × 8, 2 drops 16², a 48² light, a 40² mist (≈ 20 KB). Sparks: same pool (32), drawn as images (or kept in the one Graphics with lines: no textures at all). New: ≤ 8 blood marks (a ring) and one blade light + one mist per cut. <code>?fx=low</code>: 2 steel + 1 blood per cut.",
  findings: [
    "Square sparks (0.1 m = 3.6 px) read as pixels, not sparks: nothing shows their motion.",
    "Chainsaw blood #8a1010 is a fourth blood colour (see BL).",
    "Checked and fine: one Graphics for every spark, typed arrays, no allocation; the spawn is deterministic (no Math.random).",
  ],
  lengthS: 1.0,
  gapS: 0.2,
  keyT: [0.02, 0.09, 0.55],
  viewM: 3.2,
  aspect: 0.6,
  origin: [0.22, 0.5],
  under: (g, _t, st) => {
    body(g, charFrame("zombie_walker_a"), st.cx + CS_ZX * st.pxm, st.cy, HT_Z, st.pxm, Math.PI);
    g.fillStyle = "#15181b";
    g.beginPath();
    g.arc(st.cx - 0.15 * st.pxm, st.cy, 0.2 * st.pxm, 0, Math.PI * 2);
    g.fill();
  },
  looks: [csNow(), csTake()],
  plan: {
    goal: "Feel the saw biting: a steady spray of hot sparks at the blade, blood when it cuts flesh, never a cloud that hides the target.",
    timing: "A cut every 0.1 s; sparks live 108–180 ms (<code>chainsawSparkMs</code>), cap 32; wedge 140 ms. Shown: 1 s of cutting a zombie.",
    lengthS: 1.0,
    lanes: {
      light: [{ t0: 0, t1: 1, label: "blade light flickers on every cut", nw: true }],
      core: [{ t0: 0, t1: 1, label: "wedge (sim sector), re-drawn every 0.1 s" }],
      matter: [
        { t0: 0, t1: 1, label: "sparks: white → orange → red as they die (6 per cut)", nw: true },
      ],
      mark: [{ t0: 0.15, t1: 1, label: "blood drops land and stay (last 8)", nw: true }],
      game: [{ t0: 0, t1: 1, label: "damage every tick, rev sound" }],
    },
  },
};

/* ======================================================================================================== BF */
const BF_SPOTS = {
  repair: [-3, -1.15],
  upgrade: [0, -1.15],
  snap: [3, -1.15],
  sold: [-1.7, 1.25],
  debris: [2, 1.25],
} as const;
type BfSpot = keyof typeof BF_SPOTS;
const bfAt = (st: Stage, s: BfSpot): [number, number] => [st.cx + BF_SPOTS[s][0] * st.pxm, st.cy + BF_SPOTS[s][1] * st.pxm];
const BF_NAMES: Record<BfSpot, string> = { repair: "Repaired", upgrade: "Upgraded", snap: "Bear trap snaps", sold: "Sold (2 × 1 m)", debris: "Destroyed" };
const DEBRIS_N = 6;
function bfNow(): Look {
  const T: Record<string, HTMLCanvasElement> = {};
  const P = 64;
  return {
    code: "now",
    title: "flat rings, a lifting box, brown circles",
    note: "Rings: repair #7cff8a (0.6 m, 0.1 stroke, × 0.4 → 2, 450 ms), upgrade #90caf9 (× 0.4 → 2.4), snap #e8ecef (0.45 m, × 1.6 → 0.5, 180 ms). Sold: the footprint #e8dcc0 at 0.55 lifts 0.15 m in 200 ms. Destroyed: 6 brown circles (#8b5a2b) fly out in 450 ms.",
    bake: async () => {
      if (T.repair) return;
      T.repair = strokeRing(0.6, 0.1, "#7cff8a", P);
      T.upgrade = strokeRing(0.6, 0.12, "#90caf9", P);
      T.snap = strokeRing(0.45, 0.08, "#e8ecef", P);
      T.sold = (() => {
        const c = make(64, 32);
        const g = c.getContext("2d")!;
        g.fillStyle = "#e8dcc0";
        g.fillRect(0, 0, 64, 32);
        return c;
      })();
      T.debris = disc(32, "#8b5a2b");
    },
    draw: (g, t, st) => {
      const ring = (s: "repair" | "upgrade" | "snap", s0: number, s1: number, a0: number, ms: number): void => {
        if (!on(st, s) || t >= ms / 1000) return;
        const u = t / (ms / 1000);
        const [x, y] = bfAt(st, s);
        sprite(g, T[s]!, x, y, (T[s]!.width / P) * (s0 + (s1 - s0) * u), st.pxm, 0, a0 * (1 - u));
      };
      ring("repair", 0.4, 2, 1, 450);
      ring("upgrade", 0.4, 2.4, 1, 450);
      ring("snap", 1.6, 0.5, 0.9, 180);
      if (on(st, "sold") && t < 0.2) {
        const [x, y] = bfAt(st, "sold");
        sprite(g, T.sold!, x, y - 0.15 * (t / 0.2) * st.pxm, 2, st.pxm, 0, 0.55 * (1 - t / 0.2), false, 1);
      }
      if (on(st, "debris") && t < 0.45) {
        const [x, y] = bfAt(st, "debris");
        const u = t / 0.45;
        for (let k = 0; k < DEBRIS_N; k++) {
          const a = (k / DEBRIS_N) * Math.PI * 2;
          const px = Math.cos(a) * (0.5 + 0.8 * u);
          const py = Math.sin(a) * (0.3 + 0.6 * u);
          sprite(g, T.debris!, x + px * st.pxm, y + py * st.pxm, 0.44 * (0.6 + 0.7 * u), st.pxm, 0, 0.9 * (1 - u));
        }
      }
    },
    textures: () => Object.entries(T).map(([k, c]) => tx(`${k} (Phaser shape)`, c)),
    parts: (["repair", "upgrade", "snap", "sold", "debris"] as const).map((id) => ({ id, label: BF_NAMES[id] })),
    frames: [
      { label: "start", t: 0.03, when: "30 ms" },
      { label: "mid", t: 0.15, when: "150 ms (snap ending)" },
      { label: "late", t: 0.35, when: "350 ms" },
    ],
  };
}
function bfTake(): Look {
  const T: Record<string, HTMLCanvasElement> = {};
  let chips: HTMLCanvasElement[] = [];
  let dust: HTMLCanvasElement[] = [];
  return {
    code: "BF-A",
    title: "light rings on the ground, real splinters",
    note: "Same rings, sizes and times, drawn as light thrown on the asphalt (a soft band with a hot thin core, added); green motes rise from a repair, a glint flashes on an upgrade, the snap kicks a little dust. Sold: the footprint lifts as a soft ghost and leaves dust. Destroyed: 6 lit wood splinters fly out on today's paths with their shadows, land and stay (fade over 4 s), in a cloud of lit sawdust.",
    bake: async () => {
      if (T.repair) return;
      T.repair = bakeRing(96, [124, 255, 138], 0.11);
      T.upgrade = bakeRing(96, [144, 202, 249], 0.12);
      T.snap = bakeRing(72, [232, 236, 239], 0.1);
      T.mote = bakePool(16, [190, 255, 196], 1.4);
      T.glint = bakeGlint(48);
      T.sold = (() => {
        const c = make(80, 44);
        const g = c.getContext("2d")!;
        g.filter = "blur(3px)";
        g.fillStyle = "rgba(232,220,192,0.9)";
        g.fillRect(8, 8, 64, 28);
        return c;
      })();
      chips = Array.from({ length: DEBRIS_N }, (_, k) => bakeChip(31 + k * 5));
      dust = [bakeDust(48, 2), bakeDust(48, 11), bakeDust(48, 17)];
    },
    draw: (g, t, st) => {
      const ring = (s: "repair" | "upgrade" | "snap", s0: number, s1: number, a0: number, ms: number, rM: number): void => {
        if (!on(st, s) || t >= ms / 1000) return;
        const u = t / (ms / 1000);
        const [x, y] = bfAt(st, s);
        // ring texture: radius at 0.78 of its half side → width so its ring sits on today's radius
        sprite(g, T[s]!, x, y, ((rM * 2) / 0.78) * (s0 + (s1 - s0) * u), st.pxm, 0, a0 * (1 - u * u), true);
      };
      ring("repair", 0.4, 2, 1, 450, 0.6);
      ring("upgrade", 0.4, 2.4, 1, 450, 0.6);
      ring("snap", 1.6, 0.5, 0.9, 180, 0.45);
      if (on(st, "repair") && t < 0.7) {
        const [x, y] = bfAt(st, "repair");
        for (let k = 0; k < (st.low ? 2 : 4); k++) {
          const a = k * 1.9 + 0.4;
          const age = t - k * 0.05;
          if (age <= 0) continue;
          sprite(g, T.mote!, x + Math.cos(a) * 0.45 * st.pxm, y + (Math.sin(a) * 0.3 - 0.5 * age) * st.pxm, 0.18, st.pxm, 0, 0.8 * (1 - age / 0.7), true);
        }
      }
      if (on(st, "upgrade") && t > 0.04 && t < 0.3) {
        const [x, y] = bfAt(st, "upgrade");
        const r = 0.6 * (0.4 + 2 * (t / 0.45));
        sprite(g, T.glint!, x - r * 0.7 * st.pxm, y - r * 0.7 * st.pxm, 0.5, st.pxm, 0, Math.sin(((t - 0.04) / 0.26) * Math.PI), true);
      }
      if (on(st, "snap") && t > 0.1 && t < 0.6) {
        const [x, y] = bfAt(st, "snap");
        for (let k = 0; k < (st.low ? 1 : 3); k++) {
          const u = (t - 0.1) / 0.5;
          const a = k * 2.1;
          sprite(g, dust[k]!, x + Math.cos(a) * (0.2 + 0.25 * u) * st.pxm, y + Math.sin(a) * (0.15 + 0.2 * u) * st.pxm, 0.25 + 0.3 * u, st.pxm, k, 0.4 * (1 - u));
        }
      }
      if (on(st, "sold")) {
        const [x, y] = bfAt(st, "sold");
        if (t < 0.2) sprite(g, T.sold!, x, y - 0.15 * easeOut(t / 0.2) * st.pxm, 2.5, st.pxm, 0, 0.5 * (1 - t / 0.2), false, 1.375);
        for (let k = 0; k < (st.low ? 2 : 4); k++) {
          const age = t - 0.05;
          if (age <= 0 || age > 0.55) continue;
          const u = age / 0.55;
          const cx = (k % 2 ? 1 : -1) * 0.95;
          const cy = (k < 2 ? -1 : 1) * 0.45;
          sprite(g, dust[k % 3]!, x + cx * st.pxm, y + (cy - 0.1 * u) * st.pxm, 0.3 + 0.35 * u, st.pxm, k, 0.35 * (1 - u));
        }
      }
      if (on(st, "debris")) {
        const [x, y] = bfAt(st, "debris");
        const u = Math.min(1, t / 0.45);
        if (t < 0.6)
          for (let k = 0; k < (st.low ? 3 : DEBRIS_N); k++) {
            const a = (k / DEBRIS_N) * Math.PI * 2 + 0.3;
            const v = Math.min(1, t / 0.6);
            sprite(g, dust[k % 3]!, x + Math.cos(a) * (0.35 + 0.6 * easeOut(v)) * st.pxm, y + Math.sin(a) * (0.25 + 0.4 * easeOut(v)) * st.pxm, 0.45 + 0.55 * easeOut(v), st.pxm, k, 0.55 * (1 - v));
          }
        for (let k = 0; k < DEBRIS_N; k++) {
          const a = (k / DEBRIS_N) * Math.PI * 2;
          const e = easeOut(u);
          const px = Math.cos(a) * (0.5 + 0.8 * e);
          const py = Math.sin(a) * (0.3 + 0.6 * e);
          const h = 4 * 0.35 * u * (1 - u);
          const c = chips[k]!;
          const wM = c.width / 120;
          sprite(g, c, x + px * st.pxm, y + (py - h) * st.pxm, wM * (1 + h * 0.5), st.pxm, a + u * (k % 2 ? 4 : -3), u < 1 ? 1 : Math.max(0, 1 - (t - 0.45) / 4));
        }
      }
    },
    textures: () => [...Object.entries(T).map(([k, c]) => tx(k, c, ["repair", "upgrade", "snap", "mote", "glint"].includes(k) ? "ADD" : undefined)), ...chips.map((c, k) => tx(`splinter_${k}`, c)), ...dust.map((c, k) => tx(`sawdust_${k}`, c))],
    parts: (["repair", "upgrade", "snap", "sold", "debris"] as const).map((id) => ({ id, label: BF_NAMES[id] })),
    frames: [
      { label: "start", t: 0.03, when: "30 ms" },
      { label: "mid", t: 0.15, when: "150 ms" },
      { label: "late", t: 0.35, when: "350 ms" },
      { label: "landed", t: 0.8, when: "splinters stay" },
    ],
  };
}
const BF: FxCard = {
  id: "buildfx",
  code: "BF",
  name: "Building feedback: repair, upgrade, snap, sold, destroyed",
  family: "gunfire",
  brief:
    "<b>Signals as light, breakage as matter.</b> The rings are signals you must read (green = repaired, steel blue = upgraded, white = a trap closed): they keep their colour, size and timing, but are drawn as light thrown on the asphalt (a soft band with a hot core, added), with one small physical touch each: green motes rising, a glint on fresh steel, a puff of dust when the jaws slam. Sold: the footprint lifts as a soft ghost. Destroyed is <b>matter</b>: splinters of the barricade fly out, lit from the upper left with their shadows, land and stay a while (<b>the mark</b>) in a cloud of sawdust.",
  game:
    "<code>FxView</code>: <code>repaired</code> a pooled circle r 0.6 m, stroke 0.1 #7cff8a, × 0.4 → 2, alpha 1 → 0, 450 ms; <code>upgraded</code> stroke 0.12 #90caf9, × 0.4 → 2.4, 450 ms; <code>snapped</code> r 0.45, stroke 0.08 #e8ecef, × 1.6 → 0.5, alpha 0.9 → 0, 180 ms; <code>sold</code> a rectangle of the footprint, #e8dcc0 at 0.55, up 0.15 m, 200 ms; <code>debris</code> 6 circles r 0.22 #8b5a2b from (0.5, 0.3) to (1.3, 0.9) m around the centre, × 0.6 → 1.3, alpha 0.9 → 0, 450 ms (all depth 6–9).",
  perf:
    "BF-A: 3 ring textures (96², 72²) + mote, glint, ghost (≈ 110 KB), 6 splinters (≤ 64², shared by every building) + 3 dust 48² (≈ 90 KB). Per event: 1–2 images + ≤ 4 motes / dust; destroyed: 6 splinters that stay 4 s (a new ring, <b>cap 48 splinters</b>) + 6 dust for 0.6 s. <code>?fx=low</code>: half the motes and dust, 3 splinters.",
  findings: [
    "Every destroyed building throws the same brown wood puffs, even metal and police barricades: BF-A bakes a metal splinter set too (<code>bakeChip(…, metal)</code>), picked by the building type.",
    "The rings scale their stroke with them (Phaser scales the whole Arc): the upgrade ring's line grows from 0.05 m to 0.29 m wide. BF-A's light band scales the same way (kept on purpose: it softens as it spreads).",
    "Checked and fine: everything pooled; sold uses the real footprint for its type and rotation.",
  ],
  lengthS: 0.9,
  gapS: 0.5,
  keyT: [0.03, 0.15, 0.35, 0.8],
  viewM: 9,
  aspect: 0.6,
  under: (g, _t, st) => (Object.keys(BF_SPOTS) as BfSpot[]).forEach((s) => {
    const [x, y] = bfAt(st, s);
    label(g, BF_NAMES[s], x, y + (s === "sold" || s === "debris" ? 1.15 : 0.95) * st.pxm, st.pxm, "center");
  }),
  looks: [bfNow(), bfTake()],
  plan: {
    goal: "Each building event reads at a glance (what happened, to which building) without becoming a firework; a broken one leaves its wreck.",
    timing: "Repair / upgrade 450 ms (<code>REPAIR_MS</code>), snap 180 ms (<code>SNAP_MS</code>), sold 200 ms (<code>SOLD_MS</code>), debris 450 ms (<code>DEBRIS_MS</code>). Take: splinters land at 0.45 s and fade over 4 s.",
    lengthS: 0.9,
    lanes: {
      light: [
        { t0: 0, t1: 0.45, label: "repair / upgrade light rings" },
        { t0: 0, t1: 0.18, label: "snap", key: true },
      ],
      matter: [{ t0: 0, t1: 0.45, label: "splinters fly (destroyed)", nw: true }],
      smoke: [
        { t0: 0, t1: 0.6, label: "sawdust (destroyed), dust (sold, snap)", nw: true },
      ],
      mark: [{ t0: 0.45, t1: 0.9, label: "splinters stay (4 s)", nw: true }],
      game: [{ t0: 0, t1: 0.02, label: "sound", key: true }],
    },
  },
};

export const cards: FxCard[] = [MZ, SG, TR, HT, BL, BT, ML, CS, BF];
void countSprite;
