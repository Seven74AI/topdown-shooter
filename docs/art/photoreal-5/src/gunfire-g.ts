/**
 * Photoreal group 5, gunfire family: the goal-first takes (`${card}-G`, dead-city-model fx.md › FX 4, designer
 * 2026-11-26: "picking a goal … then think of elements needed, and then how they compose with each other").
 *
 * For every card the reasoning is written FIRST, in the Look's `goalFirst` (goal from the game's rule and numbers →
 * elements with one job each → composition → its own timeline), and the drawing follows from it. Today's emitter
 * geometry is not inherited where the goal says otherwise (FI-A's lesson): the debris no longer flies out in a ring
 * round a rectangular barricade, the repair / upgrade light follows the building's own footprint, the shotgun's gas
 * stops at the gun and the pellets carry the spread, the chainsaw throws its blood where a chain throws it.
 *
 * Same contract as gunfire.ts: bake() makes the textures once, draw() only composes sprites (no canvas or gradient
 * made while playing), `st.only` draws one part, `st.low` halves the particles.
 */
import { captured, fakeScene, frameCanvas } from "./textureShim";
import { ensureAtlases } from "../../../../apps/client/src/render/city/spriteAtlas";
import { easeOut, idle, make, ramp, rng, sprite, type Look, type Stage } from "./kit";
import { MZ_H_M, MZ_W_M, bakeBlood, bakeChip, bakeDrop, bakeDust, bakeGlint, bakeMist, bakeMuzzle, bakePool, bakeSmear, bakeSmoke, bakeSpark, slice, type BloodPic, type MuzzleKind } from "./gunfire-art";
import { BLOOM_MUZZLE, BLOOM_W_M, BLOOM_H_M, bakeBarricade, bakeBloom, bakeHand, bakeHead, bakeJaw, bakeOutline, bakePrint, bakeReach, bakeTail, bakeTrapBase } from "./gunfire-g-art";

const DEG = Math.PI / 180;
const on = (st: Stage, part: string): boolean => st.only === null || st.only === part;
type Tex = { name: string; canvas: HTMLCanvasElement; note?: string };
const tx = (name: string, canvas: HTMLCanvasElement | null | undefined, note?: string): Tex => ({ name, canvas: canvas ?? make(1, 1), note });
const linFade = (t: number, ms: number): number => Math.max(0, 1 - t / (ms / 1000));
function charFrame(name: string): HTMLCanvasElement {
  if (!captured.has("atlas_characters")) ensureAtlases(fakeScene);
  return frameCanvas("atlas_characters", name);
}
/** A sprite whose anchor (ax, ay metres from the picture's centre, before rotation) sits at (x, y). */
function spriteAt(g: CanvasRenderingContext2D, tex: HTMLCanvasElement, x: number, y: number, ax: number, ay: number, wM: number, pxm: number, rot: number, a: number, add: boolean, hM?: number): void {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  sprite(g, tex, x - (ax * c - ay * s) * pxm, y - (ax * s + ay * c) * pxm, wM, pxm, rot, a, add, hM);
}
/** Context drawn by a take (a building, a trap): not an effect, not counted, hidden in the inspector. */
function ctxPic(g: CanvasRenderingContext2D, st: Stage, pic: HTMLCanvasElement, x: number, y: number, wM: number, hM: number, rot = 0, a = 1): void {
  if (st.only !== null || a <= 0) return;
  g.save();
  g.globalAlpha = a;
  g.translate(x, y);
  g.rotate(rot);
  g.drawImage(pic, (-wM / 2) * st.pxm, (-hM / 2) * st.pxm, wM * st.pxm, hM * st.pxm);
  g.restore();
}

/* ======================================================================================================== MZ-G */
/** The card's rows, each firing at its REAL rate through the loop (weapons.json / buildings.json turret). */
const MZG_ROWS: readonly { kind: MuzzleKind; scale: number; hz: number }[] = [
  { kind: "pistol", scale: 1, hz: 12 }, // the row is "Pistol, SMG": shown at the SMG's 12/s, the worst case for clutter
  { kind: "rifle", scale: 1.25, hz: 6 },
  { kind: "shotgun", scale: 1.6, hz: 1.2 },
  { kind: "turret", scale: 1, hz: 5 },
];
const mzgY = (st: Stage, i: number): number => st.cy + (i - 1.5) * 0.9 * st.pxm;
export function mzG(): Look {
  const flash = new Map<MuzzleKind, HTMLCanvasElement[]>();
  let pool: HTMLCanvasElement | null = null;
  let smoke: HTMLCanvasElement[] = [];
  return {
    code: "MZ-G",
    title: "the gun's own clock",
    note: "Close to MZ-A in the flash (same per-gun shapes, same 50 ms), because the goal agrees with it. What the goal changed: each gun is shown at its real rate, and the light is held while you keep firing (a steady glow on the shooter, a small kick per shot) instead of strobing 12 times a second. The light sits on the shooter's side of the muzzle, not on the target. Every other flash is mirrored so a burst doesn't stamp one picture. Smoke thins with the rate (an SMG leaves a light haze, a shotgun a puff) and drifts sideways, never into the line of fire.",
    goalFirst: {
      goal: "Read <b>who is firing, with what, and which way</b>: a hot burst at the muzzle in the gun's own shape and size (× 1 pistol / SMG, × 1.25 rifle, × 1.6 shotgun, × 1 turret), on the gun's own clock (SMG 12/s, rifle 6/s, turret 5/s, pistol 3/s, shotgun 1.2/s), and never hide the zombie 0.7 m ahead.",
      elements: [
        { name: "Flash (light)", job: "which gun and which way: the shape per gun (pistol star, rifle brake jets, shotgun bloom, turret twin jets), pointing down the barrel; 50 ms per shot. Read: <i>with what, which way</i>." },
        { name: "Light on the shooter (light)", job: "who is firing, at night: a warm glow centred 0.25 m behind the muzzle (on the hands and body), held while the gun keeps firing (0.15 s after the last shot) with a small kick per shot. Read: <i>who</i>." },
        { name: "Gun smoke (matter)", job: "how long and how hard they've been firing: one wisp per shot, thinner the faster the gun (alpha × √(3 / rate)), drifting sideways out of the line. Read: <i>sustained fire</i>, after the light." },
      ],
      composition: [
        "The flash stays inside 0.5 m of the muzzle (× scale); nothing bright reaches the zombie at 0.7 m.",
        "The light pool sits behind the muzzle (on the shooter), never ahead of it.",
        "Smoke goes sideways and back (the wind's side), never stays ahead on the line of fire.",
        "Brightness: flash core > flash lobes > light pool > smoke (smoke is lit matter, never glows).",
        "One clock per gun: its rate. The flash fires on every shot; the light holds across shots (no 12 Hz strobe); each smoke wisp is born on its shot.",
        "Every other shot is mirrored (flip across the barrel) so a burst never repeats one picture.",
      ],
      plan: {
        goal: "Who is firing, with what, which way, on the gun's own clock.",
        timing: "Per shot: flash 50 ms (<code>MUZZLE_MS</code>), 3 frames. Rates (<code>weapons.json</code>, turret <code>buildings.json</code>): SMG 12/s (83 ms), rifle 6/s, turret 5/s, pistol 3/s, shotgun 1.2/s. Light holds 0.15 s after the last shot.",
        lengthS: 0.7,
        lanes: {
          light: [{ t0: 0, t1: 0.7, label: "glow on the shooter held while firing, a kick per shot", nw: true }],
          core: [
            { t0: 0, t1: 0.05, label: "flash", key: true },
            { t0: 0.083, t1: 0.133, label: "SMG next", nw: true },
            { t0: 0.167, t1: 0.217, label: "rifle next", nw: true },
            { t0: 0.333, t1: 0.383, label: "pistol next", nw: true },
          ],
          smoke: [{ t0: 0.03, t1: 0.7, label: "a wisp per shot, thinner the faster, sideways", nw: true }],
          game: [{ t0: 0, t1: 0.7, label: "shots on the gun's rate" }],
        },
      },
    },
    bake: async () => {
      if (flash.size) return;
      for (const r of MZG_ROWS) {
        flash.set(r.kind, [0, 1, 2].map((f) => bakeMuzzle(r.kind, f, 11 + f)));
        await idle();
      }
      pool = bakePool(64, [255, 200, 130]);
      smoke = [bakeSmoke(48, 3), bakeSmoke(48, 9)];
    },
    draw: (g, t, st) => {
      MZG_ROWS.forEach((r, i) => {
        const x = st.cx;
        const y = mzgY(st, i);
        const per = 1 / r.hz;
        const n = Math.floor(t / per); // the last shot so far
        const tk = t - n * per; // time since it
        const scale = r.scale / (r.kind === "shotgun" ? 1.25 : r.kind === "rifle" ? 1.1 : 1);
        // the light on the shooter: held while firing (the loop shows continuous fire), a kick on each shot
        if (on(st, "light")) {
          const held = per < 0.4 ? 0.55 : 0.55 * linFade(tk, 150);
          const kick = 0.45 * linFade(tk, 60);
          sprite(g, pool!, x - 0.25 * st.pxm, y, 1.9 * r.scale, st.pxm, 0, 0.4 * (held + kick), true);
        }
        if (on(st, "flash") && tk < 0.05) {
          const f = tk < 0.017 ? 0 : tk < 0.034 ? 1 : 2;
          const flip = n % 2 ? -1 : 1;
          sprite(g, flash.get(r.kind)![f]!, x, y, MZ_W_M * scale, st.pxm, 0, 1, true, MZ_H_M * scale * flip);
        }
        if (on(st, "smoke")) {
          const life = 0.65;
          const step = st.low ? 2 : 1; // ?fx=low: every other shot
          const thin = Math.min(1, Math.sqrt(3 / r.hz));
          for (let k = n; k >= 0 && (n - k) * per < life + 0.03; k--) {
            if (k % step) continue;
            const age = t - k * per - 0.03;
            if (age <= 0 || age > life) continue;
            const u = age / life;
            const side = k % 2 ? 1 : -1;
            const sz = (0.14 + 0.36 * easeOut(u)) * r.scale;
            const fwd = (0.12 + 0.18 * easeOut(Math.min(1, u * 3))) * r.scale; // the gas leaves forward, then stops
            const px = x + (fwd - 0.12 * u) * st.pxm;
            const py = y + (-0.06 - 0.22 * u + side * 0.03) * st.pxm; // drifts to the wind's side (up the screen)
            sprite(g, smoke[k % 2]!, px, py, sz, st.pxm, u * 0.8 + k, 0.4 * thin * ramp(age, 0, 0.06) * (1 - u));
          }
        }
      });
    },
    textures: () => [
      ...MZG_ROWS.flatMap((r) => (flash.get(r.kind) ?? []).map((c, f) => tx(`mz_${r.kind}_${f}`, c, "ADD, shared with MZ-A"))),
      tx("shooter light", pool, "ADD, shared"),
      ...smoke.map((c, k) => tx(`gunsmoke_${k}`, c, "shared")),
    ],
    parts: [
      { id: "flash", label: "Flash (which gun, which way)" },
      { id: "light", label: "Light on the shooter (who)" },
      { id: "smoke", label: "Smoke (sustained fire)" },
    ],
    frames: [
      { label: "shot 1", t: 0.005, when: "0–17 ms: every gun fires" },
      { label: "push", t: 0.039, when: "33–50 ms: wisps" },
      { label: "between", t: 0.07, when: "between shots: light held" },
      { label: "SMG 2", t: 0.088, when: "the SMG's 2nd shot (mirrored)" },
      { label: "burst", t: 0.5, when: "0.5 s of fire: haze vs puff" },
    ],
  };
}
export const MZ_G_PERF =
  " <b>MZ-G</b>: the MZ-A textures (no new ones). Per gun while firing: 1 flash (ADD, on shots), 1 light (ADD, held), ≤ 8 smoke wisps for an SMG at 12/s (alpha × 0.5), ≤ 4 rifle, ≤ 1 shotgun; <code>?fx=low</code> one wisp every other shot. Peak on the card ≈ 4 flashes + 4 lights + 16 wisps. The proposed <code>fx.maxGunSmoke</code> cap (24) still holds.";
export const MZ_G_FINDINGS = [
  "<b>MZ-G</b>: at 12/s the SMG's per-shot light pool (A: 80 ms) strobes on and off at 12 Hz; held light with a kick per shot reads as \"firing\" without the flicker.",
  "<b>MZ-G</b>: the MZ card fires every gun once; the real read is the gun's rate (an SMG at 12/s stacks ~8 smoke wisps): MZ-G plays each row at its own rate.",
];

/* ======================================================================================================== SG-G */
const SG_HALF = 15 * DEG;
const SG_RANGE = 5;
const SG_SPEED = 60;
function pelletDirs(seed: number): number[] {
  const R = rng(1000 + seed); // same as the card's other looks
  return Array.from({ length: 8 }, () => (R() - 0.5) * 2 * SG_HALF);
}
export function sgG(): Look {
  let bloom: HTMLCanvasElement[] = [];
  let head: HTMLCanvasElement | null = null;
  let tail: HTMLCanvasElement | null = null;
  let pool: HTMLCanvasElement | null = null;
  let smoke: HTMLCanvasElement[] = [];
  let dust: HTMLCanvasElement[] = [];
  const ARRIVE = SG_RANGE / SG_SPEED; // 83 ms
  return {
    code: "SG-G",
    title: "the pellets draw the spray",
    note: "Rethought from the goal. The cone of gas drawn to 2.4 m stood for the spread, but gas stops at the gun and the pellets fly 5 m. So the gas is a short bloom (≤ 0.9 m, the shot), the 8 pellets are tracers to the real 5 m range (the spread), and where each pellet ends, a puff of dust kicks off the asphalt, so the 30° × 5 m fan stays written on the street for half a second after the pellets are gone. The smoke stays at the gun and drifts sideways: the fan, where the zombies are, stays clear.",
    goalFirst: {
      goal: "Read <b>the spray</b>: 8 pellets × 5 dmg over a 30° fan reaching 5 m (<code>weapons.json</code> shotgun; knockback 0.5 m), so you see where the shot went and then what it hit.",
      elements: [
        { name: "Muzzle bloom (light)", job: "the shotgun fired: a round burst of hot gas, ≤ 0.9 m (the shotgun's 1.6× size), 110 ms. Read: <i>a shotgun shot</i>. It replaces both today's flash and the 2.4 m cone." },
        { name: "8 pellet tracers (light)", job: "where the spread goes: a hot head and a one-frame tail each (1 m at 60 m/s), out to 5 m in 83 ms. Read: <i>the fan</i>." },
        { name: "Dust kicks at the pellets' ends (matter)", job: "how far and how wide it reached, after the pellets are gone: one lit puff where each pellet stops (5 m), 0.45 s. Read: <i>the fan's size</i>, held long enough to see." },
        { name: "Light on the shooter (light)", job: "who fired, at night: a warm glow behind the muzzle, 90 ms. Read: <i>who</i>." },
        { name: "Gun smoke (matter)", job: "the gun just fired, after the light: one cloud at the gun drifting sideways. Read: <i>just fired</i>." },
      ],
      composition: [
        "The bloom and the smoke stay within 1 m of the muzzle: the fan beyond 1 m (where the targets are) holds only pellets and dust.",
        "Dust appears only at the pellets' ends (on the 5 m arc), never along the way.",
        "Brightness: bloom throat > tracer heads > bloom edge > tails > shooter light > dust > smoke.",
        "One clock: the pellets' flight. The bloom peaks at 0, the pellets arrive at 83 ms and the dust kicks then; smoke after the light.",
        "Nothing bright crosses 5 m (the range).",
      ],
      plan: {
        goal: "Where the spray went, then what it hit.",
        timing: "Bloom 110 ms (<code>BLAST_MS</code>), 3 frames. Pellets 60 m/s, 5 m → 83 ms (<code>weapons.json</code>). Dust kicks 83–530 ms. Next shot 0.83 s.",
        lengthS: 1.0,
        lanes: {
          light: [{ t0: 0, t1: 0.09, label: "light on the shooter", nw: true }],
          core: [{ t0: 0, t1: 0.11, label: "bloom ≤ 0.9 m", key: true, nw: true }],
          matter: [
            { t0: 0, t1: 0.083, label: "8 tracers to 5 m" },
            { t0: 0.083, t1: 0.53, label: "dust kicks at the ends", key: true, nw: true },
          ],
          smoke: [{ t0: 0.03, t1: 0.85, label: "smoke at the gun, sideways", nw: true }],
          game: [{ t0: 0, t1: 0.083, label: "pellets hit (knockback 0.5 m)" }],
        },
      },
    },
    bake: async () => {
      if (bloom.length) return;
      bloom = [0, 1, 2].map((f) => bakeBloom(f, 7));
      await idle();
      head = bakeHead(16, null);
      tail = bakeTail(64, 8, null);
      pool = bakePool(64, [255, 196, 120]);
      smoke = [bakeSmoke(64, 4), bakeSmoke(64, 8)];
      dust = [bakeDust(40, 3), bakeDust(40, 9), bakeDust(40, 14)];
    },
    draw: (g, t, st) => {
      const dirs = pelletDirs(st.seed);
      if (on(st, "light") && t < 0.09) sprite(g, pool!, st.cx - 0.2 * st.pxm, st.cy, 2.6, st.pxm, 0, 0.45 * linFade(t, 90), true);
      if (on(st, "dust") && t >= ARRIVE) {
        const age = t - ARRIVE;
        if (age < 0.45) {
          const u = age / 0.45;
          dirs.forEach((a, k) => {
            if (st.low && k % 2) return;
            const x = st.cx + Math.cos(a) * SG_RANGE * st.pxm;
            const y = st.cy + Math.sin(a) * SG_RANGE * st.pxm;
            sprite(g, dust[k % 3]!, x + 0.08 * u * st.pxm, y - 0.05 * u * st.pxm, 0.22 + 0.35 * easeOut(u), st.pxm, k, 0.8 * ramp(age, 0, 0.03) * (1 - u));
          });
        }
      }
      if (on(st, "smoke")) {
        const n = st.low ? 1 : 2;
        for (let k = 0; k < n; k++) {
          const age = t - 0.03 - k * 0.03;
          const life = 0.82;
          if (age <= 0 || age > life) continue;
          const u = age / life;
          const fwd = 0.25 + k * 0.3 + 0.2 * easeOut(Math.min(1, u * 3));
          sprite(g, smoke[k]!, st.cx + (fwd - 0.1 * u) * st.pxm, st.cy + (-0.05 - 0.35 * u + k * 0.06) * st.pxm, 0.3 + 0.55 * easeOut(u), st.pxm, k + u * 0.6, 0.45 * ramp(age, 0, 0.05) * (1 - u));
        }
      }
      if (on(st, "bloom") && t < 0.11) {
        const f = t < 0.037 ? 0 : t < 0.074 ? 1 : 2;
        // the muzzle sits at BLOOM_MUZZLE of the picture's width
        spriteAt(g, bloom[f]!, st.cx, st.cy, -BLOOM_W_M * (0.5 - BLOOM_MUZZLE), 0, BLOOM_W_M, st.pxm, 0, 1, true, BLOOM_H_M);
      }
      if (on(st, "pellets")) {
        const d = SG_SPEED * t;
        if (t > 0 && t <= ARRIVE + 0.001)
          for (const a of dirs) {
            const m = Math.min(SG_RANGE, d);
            const tl = Math.min(1, m); // the tail never starts behind the muzzle
            const hx = st.cx + Math.cos(a) * m * st.pxm;
            const hy = st.cy + Math.sin(a) * m * st.pxm;
            spriteAt(g, tail!, hx, hy, tl / 2, 0, tl, st.pxm, a, 0.9, true, 0.05);
            sprite(g, head!, hx, hy, 0.09, st.pxm, 0, 1, true);
          }
      }
    },
    textures: () => [...bloom.map((c, f) => tx(`sg_bloom_${f}`, c, "ADD, cropped")), tx("round_head", head, "ADD, shared with TR-G"), tx("round_tail", tail, "ADD, shared with TR-G"), tx("shooter light", pool, "ADD, shared"), ...smoke.map((c, k) => tx(`gunsmoke_big_${k}`, c, "shared")), ...dust.map((c, k) => tx(`pellet_dust_${k}`, c))],
    parts: [
      { id: "bloom", label: "Muzzle bloom (the shot)" },
      { id: "pellets", label: "Pellet tracers (the spread)" },
      { id: "dust", label: "Dust kicks (the reach)" },
      { id: "light", label: "Light on the shooter" },
      { id: "smoke", label: "Smoke at the gun" },
    ],
    frames: [
      { label: "bloom", t: 0.008, when: "0–37 ms: bloom white, pellets leaving" },
      { label: "flight", t: 0.05, when: "50 ms: pellets at 3 m" },
      { label: "arrive", t: 0.092, when: "92 ms: dust kicks on the 5 m arc" },
      { label: "after", t: 0.4, when: "0.4 s: the fan still on the street, smoke at the gun" },
    ],
  };
}
export const SG_G_PERF =
  " <b>SG-G</b>: 3 bloom frames 83 × 58 px (cropped to the gas: 19 KB each, vs 70 KB for the 4.8 m plume), 1 head 16², 1 tail 64 × 8 (shared with TR-G), 3 dust 40², smoke and light shared: ≈ 90 KB. Per shot: 1 bloom + 1 light (ADD) ≤ 110 ms, 8 pellets = the existing projectile pool (head + tail: 2 images per slot), 8 dust kicks for 0.45 s (a new pooled set, <b>cap 32</b>; <code>?fx=low</code> 4), 2 smoke (low 1).";
export const SG_G_FINDINGS = [
  "<b>SG-G</b>: the 2.4 m blast cone (<code>BLAST_M</code>) is half the shotgun's 5 m range: it shows neither the gas (which stops within a metre) nor the reach. The pellets and where they end show both.",
  "<b>SG-G</b>: the shotgun's 1.6× muzzle flash and its blast are two effects for one shot; SG-G's bloom is both (MZ's shotgun row would hand over to it).",
];

/* ======================================================================================================== TR-G */
const TRG_LANES: readonly { look: "gun" | "pellet" | "turret"; name: string; dy: number; off: number; speed: number }[] = [
  { look: "gun", name: "gun", dy: -1.1, off: 0, speed: 60 },
  { look: "pellet", name: "pellet", dy: 0, off: 0.05, speed: 60 },
  { look: "turret", name: "turret", dy: 1.1, off: 0.1, speed: 40 }, // buildings.json auto_turret projectileSpeedMps 40
];
export function trG(): Look {
  const T: Record<string, HTMLCanvasElement> = {};
  return {
    code: "TR-G",
    title: "the round and its one-frame blur",
    note: "Rethought from the goal: a round is a point moving fast, so it is drawn as one (a small white-hot head where the round really is) plus what the eye keeps of it in one frame: a thin tail as long as it travels in 1/60 s (1 m for your guns at 60 m/s, 0.67 m for the turret at 40 m/s). The tail's length now tells the speed and its colour the owner (amber yours, cyan the turret's). Pellets: the same head, a thinner, dimmer tail (eight fly together, so the group tells them apart). The page now moves turret rounds at their real 40 m/s.",
    goalFirst: {
      goal: "Read <b>where each round is and where it is going, and whose it is</b>: your guns' rounds at 60 m/s (<code>weapons.json</code>), the turret's at 40 m/s (<code>buildings.json</code>), and never a bar that covers what it flies past.",
      elements: [
        { name: "Head (light)", job: "where the round is: a small white-hot point (0.09 m, ≥ 3 px at game size) at the sim's interpolated position. Read: <i>where</i>." },
        { name: "Tail (light)", job: "where it goes and how fast: a thin streak behind the head, as long as one frame's travel (speed / 60: 1 m, 0.67 m turret), cooling to nothing. Read: <i>which way, how fast</i>." },
        { name: "Tail colour", job: "whose: amber for players, cyan for the turret (its identity today). Read: <i>whose</i>." },
      ],
      composition: [
        "The head is the brightest thing; the tail is thin (≤ 0.05 m) and fades to nothing, so it never covers a body it passes.",
        "The tail never starts behind the muzzle (it grows to full length in the first frame).",
        "Brightness: head > tail near the head > tail end.",
        "One clock: the sim tick; head and tail move together, nothing lingers after the round.",
      ],
      plan: {
        goal: "Where each round is, where it goes, whose it is.",
        timing: "60 m/s (guns), 40 m/s (turret, 5/s). One frame (16.7 ms) of travel = 1 m / 0.67 m.",
        lengthS: 0.5,
        lanes: {
          light: [{ t0: 0, t1: 0.5, label: "head: the round", nw: true }],
          core: [{ t0: 0, t1: 0.5, label: "one-frame tail, length = speed / 60", nw: true }],
          game: [{ t0: 0, t1: 0.5, label: "projectile moves (interpolated)" }],
        },
      },
    },
    bake: async () => {
      if (T.head) return;
      T.head = bakeHead(16, null);
      T.headCyan = bakeHead(16, [111, 227, 255]);
      T.tail = bakeTail(64, 8, null);
      T.tailCyan = bakeTail(64, 8, [111, 227, 255]);
    },
    draw: (g, t, st) => {
      for (const lane of TRG_LANES)
        for (let k = 0; k < 3; k++) {
          const age = t - lane.off - k * 0.167;
          if (age <= 0) continue;
          const d = 0.4 + lane.speed * age;
          if (d > st.w / st.pxm - 0.2) continue;
          const x = st.cx + d * st.pxm;
          const y = st.cy + lane.dy * st.pxm;
          const cyan = lane.look === "turret";
          const len = Math.min(lane.speed / 60, lane.speed * age);
          const pel = lane.look === "pellet";
          if (on(st, "tail")) spriteAt(g, cyan ? T.tailCyan! : T.tail!, x, y, len / 2, 0, len, st.pxm, 0, pel ? 0.75 : 1, true, pel ? 0.045 : 0.065);
          if (on(st, "head")) sprite(g, cyan ? T.headCyan! : T.head!, x, y, pel ? 0.075 : 0.09, st.pxm, 0, 1, true);
        }
    },
    textures: () => [tx("round_head", T.head, "ADD"), tx("round_head_turret", T.headCyan, "ADD"), tx("round_tail", T.tail, "ADD"), tx("round_tail_turret", T.tailCyan, "ADD")],
    parts: [
      { id: "head", label: "Head (where)" },
      { id: "tail", label: "One-frame tail (which way, how fast, whose)" },
    ],
    frames: [
      { label: "frame 1", t: 0.017, when: "one tick" },
      { label: "frame 2", t: 0.034, when: "next tick" },
    ],
  };
}
export const TR_G_PERF = " <b>TR-G</b>: 2 heads 16² + 2 tails 64 × 8 (≈ 6 KB). Two images per projectile slot (head + tail) instead of one: the projectile pool doubles its image count (the pool size, not the shots, sets it).";
export const TR_G_FINDINGS = [
  "<b>TR-G</b>: turret rounds fly at 40 m/s (<code>buildings.json › auto_turret.turret.projectileSpeedMps</code>), not 60: the page's other looks move them at 60. TR-G uses 40.",
  "<b>TR-G</b>: today's 0.6 m bar is 0.6 of a frame's travel at 60 m/s; a 1 m one-frame tail is what the eye would keep (and tells the turret's slower rounds apart by length).",
];

/* ======================================================================================================== HT-G */
const HT_Z = 2 * 0.35 * 1.55;
const htZx = (st: Stage): number => st.cx + 0.2 * st.pxm;
export function htG(): Look {
  let lit: HTMLCanvasElement | null = null;
  let mist: HTMLCanvasElement[] = [];
  let drop: HTMLCanvasElement[] = [];
  return {
    code: "HT-G",
    title: "the flash says hit, the spray says from where",
    note: "Close to HT-A in its parts, because the goal needs the same two reads. What the goal changed: the flash is lit from the side the shot came from (the body's front, brighter there, its shape kept), so it carries the direction for the 80 ms it shows. The exit spray is a narrow jet along the shot's line (±15°), not a fan, and the drops land on that line 0.4–0.9 m behind, so the street keeps the line of fire. The entry kick-back was cut (no job the spray doesn't already do).",
    goalFirst: {
      goal: "Read <b>I hit it, from this side</b>, every hit (FR19), without losing the zombie's type during sustained fire (a flash every 83 ms with an SMG): 80 ms flash (<code>FLASH_MS</code>, Brute 160 ms), pushback 0.15 m (<code>weapons.json › hitPushbackM</code>).",
      elements: [
        { name: "Lit flash on the body (light)", job: "I hit it: the zombie's own picture brightened toward white, more on the entry side, shape and type kept. Read: <i>hit</i> (and <i>from where</i> while it shows)." },
        { name: "Exit jet (matter)", job: "from where: dark red-brown mist out the far side along the shot (±15°), 0.18 s. Read: <i>which way the shot went</i>." },
        { name: "Drops on the line (mark)", job: "from where, after: 3–4 drops land 0.4–0.9 m behind on the shot's line and stay 3 s. Read: <i>the line of fire</i> is kept on the street." },
      ],
      composition: [
        "The flash only on the body; the jet starts at the body's far edge (0.3 m), never over the body.",
        "Jet and drops stay inside ±15° of the shot's line, on the exit side only.",
        "Brightness: the flash is the only light; blood is dark matter, never bright, never the warning red.",
        "One clock: the hit. Flash 0–80 ms, jet 0–180 ms, drops land at 120 ms, marks fade over 3 s.",
      ],
      plan: {
        goal: "I hit it, from this side.",
        timing: "Flash 80 ms (<code>ZombieView.ts › FLASH_MS</code>; Brute 160 ms). Jet 0–0.18 s; drops land at 0.12 s, stay 3 s.",
        lengthS: 0.6,
        lanes: {
          light: [{ t0: 0, t1: 0.08, label: "flash, brighter on the entry side", key: true, nw: true }],
          matter: [
            { t0: 0, t1: 0.18, label: "exit jet on the shot's line", nw: true },
            { t0: 0, t1: 0.12, label: "drops fly on the line", nw: true },
          ],
          mark: [{ t0: 0.12, t1: 0.6, label: "drops stay on the line (3 s)", nw: true }],
          game: [{ t0: 0, t1: 0.02, label: "damage, sound, pushback 0.15 m", key: true }],
        },
      },
    },
    bake: async () => {
      if (lit) return;
      const z = charFrame("zombie_walker_a");
      lit = make(z.width, z.height);
      const g = lit.getContext("2d")!;
      g.drawImage(z, 0, 0);
      g.globalCompositeOperation = "lighter";
      g.drawImage(z, 0, 0);
      g.globalCompositeOperation = "source-atop";
      // the zombie's frame faces +x (its front = the side facing the shooter): brighter there
      const gr = g.createLinearGradient(0, 0, z.width, 0);
      gr.addColorStop(0, "rgba(255,255,255,0.35)");
      gr.addColorStop(1, "rgba(255,255,255,0.8)");
      g.fillStyle = gr;
      g.fillRect(0, 0, z.width, z.height);
      mist = [bakeMist(48, 2), bakeMist(48, 7)];
      drop = [bakeDrop(16, 1), bakeDrop(16, 4), bakeDrop(16, 9)];
    },
    draw: (g, t, st) => {
      const R = rng(77 + st.seed);
      const ex = htZx(st) + 0.3 * st.pxm; // the far edge (shot from the left, along +x)
      if (on(st, "drops"))
        for (let k = 0; k < (st.low ? 2 : 4); k++) {
          const a = (R() - 0.5) * 0.5; // ±15°
          const dist = 0.4 + R() * 0.5;
          const u = Math.min(1, t / 0.12);
          const h = 4 * 0.12 * u * (1 - u);
          const x = ex + Math.cos(a) * dist * easeOut(u) * st.pxm;
          const y = st.cy + (Math.sin(a) * dist * easeOut(u) - h) * st.pxm;
          sprite(g, drop[k % 3]!, x, y, (u < 1 ? 0.05 : 0.07) + h * 0.2, st.pxm, a, u < 1 ? 0.9 : 0.85 * linFade(t - 0.12, 3000));
        }
      if (on(st, "jet"))
        for (let k = 0; k < (st.low ? 1 : 2); k++) {
          const age = t - k * 0.015;
          if (age <= 0 || age > 0.18) continue;
          const u = age / 0.18;
          const a = (k - 0.5) * 0.18;
          const d = 0.08 + 0.45 * easeOut(u);
          // stretched along the shot: a jet, not a ball
          sprite(g, mist[k % 2]!, ex + Math.cos(a) * d * st.pxm, st.cy + Math.sin(a) * d * st.pxm, 0.18 + 0.4 * easeOut(u), st.pxm, a, 0.72 * (1 - u), false, 0.1 + 0.16 * easeOut(u));
        }
      if (on(st, "flash") && t < 0.08) sprite(g, lit!, htZx(st), st.cy, HT_Z, st.pxm, Math.PI, 1 - 0.55 * (t / 0.08));
    },
    textures: () => [tx("hit_lit_front (per zombie frame, or a tint)", lit), ...mist.map((c, k) => tx(`blood_mist_${k}`, c, "shared")), ...drop.map((c, k) => tx(`blood_drop_${k}`, c, "shared"))],
    parts: [
      { id: "flash", label: "Lit flash (hit, from where)" },
      { id: "jet", label: "Exit jet (which way)" },
      { id: "drops", label: "Drops on the line (kept)" },
    ],
    frames: [
      { label: "hit", t: 0.01, when: "0–17 ms: flash full, front brighter" },
      { label: "jet", t: 0.06, when: "60 ms: flash dims, jet out" },
      { label: "landed", t: 0.15, when: "drops on the line" },
    ],
  };
}
export const HT_G_PERF = " <b>HT-G</b>: no new textures (the flash is HT-A's picture with a front-weighted brightening: in the game a tint plus a gradient, or a second additive copy). Per hit: ≤ 2 jet puffs (low 1) + 4 drops (low 2) for 0.18 s; drop marks in HT-A's pool (cap 64).";
export const HT_G_FINDINGS = [
  "<b>HT-G</b>: the brighter-front flash assumes the zombie faces its shooter (it walks at its target); for a shot in the back the gradient would have to follow the shot, so the game version needs the hit direction on <code>zombie.hit</code> (the same need as HT-A).",
];

/* ======================================================================================================== BL-G */
export function blG(): Look {
  let pools: BloodPic[] = [];
  let mist: HTMLCanvasElement[] = [];
  let drop: HTMLCanvasElement[] = [];
  const SIZE = 1.2;
  return {
    code: "BL-G",
    title: "the kill, and which way it fell",
    note: "Close to BL-A (the approved blood: same mist, drops, glossy pool, same palette and lifetimes), because the goal asks for the same reads. What the goal changed: the kill had a direction, so the burst, the drops and the pool are thrown downrange (the pool 1.3× longer along the shot and 0.12 m past the body's centre), and the street keeps which way the fight went. The gloss now has a job of its own: fresh = this fight is happening now, matte = it was earlier.",
    goalFirst: {
      goal: "Read <b>a zombie died here, this size, this way</b>, and later <b>how long ago</b>: the burst on the kill, a mark sized by the body (× radius / 0.35: Walker 0.35, Bloater 0.5, Brute 0.6 m), glossy for ~5 s, gone after 10 s (<code>SPLAT_FADE_MS</code>, 200 kept).",
      elements: [
        { name: "Mist burst (matter)", job: "the kill landed: a dark red-brown burst, 0.3 s, biased downrange. Read: <i>dead, now</i>." },
        { name: "Drops (matter → mark)", job: "the direction: 6 drops thrown downrange (±35°) 0.3–0.6 m, landing as satellites of the pool. Read: <i>which way it fell</i>." },
        { name: "Pool (mark)", job: "a zombie died here and how big: thick dark middle, thin rim, 1.3× longer along the shot, sized by the zombie's radius. Read: <i>here, this size</i>." },
        { name: "Gloss (mark)", job: "how fresh: the rim facing the street light catches a sheen that dries off over 5 s. Read: <i>now vs earlier</i>." },
      ],
      composition: [
        "Everything on the exit side of the body's centre: nothing thrown back toward the shooter.",
        "Blood is dark red-brown everywhere (BL-A's palette), never the warning red; the gloss is the only light (a soft cool sheen, ADD, weak).",
        "Brightness: gloss > rim > drops > middle; nothing in it glows.",
        "One clock: the kill. Mist 0–0.3 s, drops land at 0.13 s, pool spreads 0–0.3 s, gloss dries 0.8–5 s, the pool fades by 10 s.",
      ],
      plan: {
        goal: "A zombie died here, this size, this way; and how long ago.",
        timing: "Pool fades over 10 s (<code>SPLAT_FADE_MS</code>), 200 kept. Mist 0–0.3 s, drops land at 0.13 s, pool spreads 0–0.3 s, gloss dries 0.8–5 s.",
        lengthS: 1.6,
        lanes: {
          matter: [
            { t0: 0, t1: 0.3, label: "mist, downrange", key: true },
            { t0: 0, t1: 0.13, label: "drops thrown downrange", nw: true },
          ],
          mark: [
            { t0: 0.02, t1: 0.3, label: "pool spreads, longer along the shot", nw: true },
            { t0: 0.3, t1: 1.6, label: "gloss = fresh → dries (5 s) → fades (10 s)" },
          ],
          game: [{ t0: 0, t1: 0.02, label: "zombie removed", key: true }],
        },
      },
    },
    bake: async () => {
      if (pools.length) return;
      for (let k = 0; k < 3; k++) {
        pools.push(bakeBlood(11 + k * 7, SIZE, false));
        await idle();
      }
      mist = [bakeMist(56, 5), bakeMist(56, 12), bakeMist(56, 19)];
      drop = [bakeDrop(16, 2), bakeDrop(16, 6)];
    },
    draw: (g, t, st) => {
      const p = pools[st.seed % pools.length]!;
      const R0 = rng(5 + st.seed);
      const dir = (R0() - 0.5) * 0.5; // the kill shot came from the left (+x downrange), ±15° per kill
      const ca = Math.cos(dir);
      const sa = Math.sin(dir);
      const px0 = st.cx + 0.12 * ca * st.pxm;
      const py0 = st.cy + 0.12 * sa * st.pxm;
      if (on(st, "pool")) {
        const grow = 0.3 + 0.7 * easeOut(t / 0.3);
        const a = 0.97 * ramp(t, 0.02, 0.06) * linFade(t, 10_000);
        sprite(g, p.base, px0, py0, SIZE * grow * 1.15, st.pxm, dir, a, false, SIZE * grow * 0.88);
        sprite(g, p.gloss, px0, py0, SIZE * grow * 1.15, st.pxm, dir, 0.32 * a * (1 - ramp(t, 0.8, 5)), true, SIZE * grow * 0.88);
      }
      if (on(st, "drops")) {
        const R = rng(31 + st.seed);
        for (let k = 0; k < (st.low ? 3 : 6); k++) {
          const ang = dir + (R() - 0.5) * 1.2;
          const dist = 0.3 + R() * 0.3;
          const u = Math.min(1, t / 0.13);
          const h = 4 * 0.15 * u * (1 - u);
          const al = u < 1 ? 0.9 : 0.85 * linFade(t, 10_000);
          sprite(g, drop[k % 2]!, st.cx + Math.cos(ang) * dist * easeOut(u) * st.pxm, st.cy + (Math.sin(ang) * dist * easeOut(u) - h) * st.pxm, (u < 1 ? 0.05 : 0.06) + h * 0.25, st.pxm, ang, al);
        }
      }
      if (on(st, "mist"))
        for (let k = 0; k < (st.low ? 2 : 4); k++) {
          const age = t - k * 0.012;
          if (age <= 0 || age > 0.3) continue;
          const u = age / 0.3;
          const ang = dir + (k - 1.5) * 0.45;
          const d = 0.1 + 0.35 * easeOut(u);
          sprite(g, mist[k % 3]!, st.cx + Math.cos(ang) * d * st.pxm, st.cy + Math.sin(ang) * d * st.pxm, 0.22 + 0.4 * easeOut(u), st.pxm, k, 0.6 * (1 - u) * ramp(age, 0, 0.03));
        }
    },
    textures: () => [...pools.flatMap((p, k) => [tx(`blood_pool_${k}`, p.base, "shared with BL-A"), tx(`blood_gloss_${k}`, p.gloss, "ADD, shared")]), ...mist.map((c, k) => tx(`blood_mist_${k}`, c, "shared")), ...drop.map((c, k) => tx(`blood_drop_${k}`, c, "shared"))],
    parts: [
      { id: "mist", label: "Mist (dead, now)" },
      { id: "drops", label: "Drops (which way)" },
      { id: "pool", label: "Pool + gloss (here, size, how fresh)" },
    ],
    frames: [
      { label: "burst", t: 0.03, when: "30 ms: mist out downrange" },
      { label: "spread", t: 0.12, when: "drops land, pool spreading" },
      { label: "settled", t: 0.35, when: "pool full, glossy" },
      { label: "5 s", t: 5, when: "dried (earlier fight), half faded" },
    ],
  };
}
export const BL_G_PERF = " <b>BL-G</b>: BL-A's textures (shared, no new ones). Per kill: 1 pool + 1 gloss (the 200 ring), ≤ 4 mist (low 2) + 6 drops (low 3) for 0.3 s; the drops stay with the pool (the pool's 10 s; 6 images per kill: a ring of <b>cap 300</b>, or baked into the pool picture).";
export const BL_G_FINDINGS = [
  "<b>BL-G</b>: <code>zombie.killed</code> carries x, y only; the downrange throw needs the killing shot's direction (the same need as HT-A / HT-G on <code>zombie.hit</code>). Without it BL-G falls back to BL-A's random turn.",
];

/* ======================================================================================================== BT-G */
const BT_SPEED = 0.7;
const BT_SPACING = 0.35;
const BT_Z = 2 * 0.35 * 1.75;
export function btG(): Look {
  let sm: BloodPic[] = [];
  let hand: HTMLCanvasElement[] = [];
  return {
    code: "BT-G",
    title: "a body dragged by its hands",
    note: "The torso smear is BT-A's (close to A there: the goal keeps it). What the goal changed: a Crawler pulls itself by its hands, so every 0.35 m step (the game's own spacing) also leaves a hand print, left and right in turn, 0.22 m off the line, palm ahead and fingers dragged back: the trail now says <i>a crawler</i>, not just a bleeding thing, and the prints point the way it went. The gloss stays only on the freshest 1.5 m, so the shine points at the Crawler too.",
    goalFirst: {
      goal: "Read <b>a Crawler came this way, and where it is now</b> (0.7 m/s, a mark every 0.35 m, marks fade over 5 s; its bite slows you 30 % for 1 s: <code>zombies.json</code>).",
      elements: [
        { name: "Torso smear (mark)", job: "the path: one continuous drag mark where the body pressed, heavier at its front. Read: <i>came this way</i>." },
        { name: "Hand prints, left and right in turn (mark)", job: "what made it and which way: a palm ahead and three finger drags pulled back, one per step, alternating sides. Read: <i>a crawler, going that way</i>." },
        { name: "Gloss on the fresh end (mark)", job: "where it is now: only the last ~2 s of trail shines; older marks are matte and fading. Read: <i>it's at the shiny end</i>." },
      ],
      composition: [
        "All marks on the path: the smear on the line, the prints 0.22 m either side (shoulder width), never ahead of the Crawler.",
        "The prints are under the Crawler's body where it is (drawn before it), and the smear covers their inner edge (the body drags over them).",
        "Nothing glows; the gloss is the only light (weak, cool sheen) and lives on the freshest end only.",
        "One clock: the step (0.35 m = 0.5 s at 0.7 m/s): one smear and one print per step; age drives gloss (2 s) and fade (5 s).",
      ],
      plan: {
        goal: "A Crawler came this way, and it's at the shiny end.",
        timing: "A step every 0.35 m (0.5 s at 0.7 m/s, <code>BloodTrailView</code>); marks fade over 5 s; gloss dries 0.4–2 s.",
        lengthS: 6,
        lanes: {
          mark: [
            { t0: 0.5, t1: 6, label: "a smear + a hand print per step (L/R)", nw: true },
            { t0: 0.5, t1: 2.5, label: "gloss on the fresh end" },
          ],
          game: [{ t0: 0, t1: 6, label: "Crawler moves 0.7 m/s" }],
        },
      },
    },
    bake: async () => {
      if (sm.length) return;
      for (let k = 0; k < 3; k++) sm.push(bakeSmear(5 + k * 13));
      hand = [bakeHand(3), bakeHand(8)];
    },
    draw: (g, t, st) => {
      for (let k = 1; k * BT_SPACING <= BT_SPEED * t; k++) {
        const born = (k * BT_SPACING) / BT_SPEED;
        const age = t - born;
        if (age > 5) continue;
        const x = st.cx + k * BT_SPACING * st.pxm;
        const fade = 1 - age / 5;
        if (on(st, "hands")) {
          const side = k % 2 ? -1 : 1;
          // the hand reached a step ahead of the mark: palm forward (+x), at shoulder width
          sprite(g, hand[k % 2]!, x + 0.28 * st.pxm, st.cy + side * 0.24 * st.pxm, 0.32, st.pxm, side * 0.12, 0.95 * fade, false, 0.2 * side);
        }
        if (on(st, "trail")) {
          const p = sm[k % 3]!;
          const rot = Math.sin(k * 1.7) * 0.12;
          const y = st.cy + Math.sin(k * 2.3) * 0.03 * st.pxm;
          sprite(g, p.base, x, y, 0.7, st.pxm, rot, 0.82 * fade, false, 0.56);
          sprite(g, p.gloss, x, y, 0.7, st.pxm, rot, 0.5 * fade * (1 - ramp(age, 0.4, 2)), true, 0.56);
        }
      }
      if (st.only === null) {
        const s = BT_Z * st.pxm;
        g.save();
        g.translate(st.cx + BT_SPEED * t * st.pxm, st.cy);
        g.drawImage(charFrame("zombie_crawler_a"), -s / 2, -s / 2, s, s);
        g.restore();
      }
    },
    textures: () => [...sm.flatMap((p, k) => [tx(`smear_${k}`, p.base, "shared with BT-A"), tx(`smear_gloss_${k}`, p.gloss, "ADD, shared")]), ...hand.map((c, k) => tx(`hand_print_${k}`, c))],
    parts: [
      { id: "trail", label: "Torso smear + gloss (path, now)" },
      { id: "hands", label: "Hand prints (a crawler, which way)" },
    ],
    frames: [
      { label: "1.5 s", t: 1.5, when: "fresh, glossy, 3 prints" },
      { label: "4 s", t: 4, when: "the oldest matte and fading" },
    ],
  };
}
export const BT_G_PERF = " <b>BT-G</b>: BT-A's smears + 2 hand prints 42 × 26 px (≈ 9 KB). Per step: 1 smear + its gloss (2 s) + 1 print: the ring of 400 holds 200 steps of smear + print (or 800 for the same 400 steps); no change to spacing.";
export const BT_G_FINDINGS = ["<b>BT-G</b>: checked: the prints alternate on the step counter the view already keeps (one mark per 0.35 m), so no new state is needed."];

/* ======================================================================================================== ML-G */
const MLG_W: readonly { range: number; arc: number; dx: number; heavy: boolean }[] = [
  { range: 1.8, arc: 110 * DEG, dx: -1.9, heavy: false },
  { range: 2.2, arc: 140 * DEG, dx: 1.9, heavy: true },
];
export function mlG(): Look {
  const sweeps: { pic: HTMLCanvasElement; ax: number; ay: number }[][] = [];
  let glint: HTMLCanvasElement | null = null;
  const P = 40;
  return {
    code: "ML-G",
    title: "the reach, drawn at the rim",
    note: "Close to ML-A (a sweep crossing the sim's sector in 4 frames, a glint on the steel), because the goal is the same cut. What the goal changed: the read you need is <i>how far it reached</i>, so the light sits on the rim: a crisp band exactly at the weapon's range (1.8 m / 2.2 m) that stays a moment after the blade passes, the swept air inside it very faint, and the blade itself a short bright line at the leading angle. The pictures are cropped to the sector (half of A's squares).",
    goalFirst: {
      goal: "Read <b>which way the blade went and exactly what it could reach</b>: the sim's sector (F1: machete 110° × 1.8 m, fire axe 140° × 2.2 m, knockback 1.5 m), on today's times (120 / 200 ms).",
      elements: [
        { name: "Reach band (matter: air at the tip)", job: "how far: a crisp band exactly on the range, the fastest air at the tip. Read: <i>what it could reach</i>." },
        { name: "Blade line", job: "which way and where now: a short bright radial line at the leading angle, outer half only. Read: <i>the direction of the cut</i>." },
        { name: "Swept air (matter)", job: "the sector's width: very faint fill, fading behind the blade. Read: <i>from where to where</i>." },
        { name: "Glint (light)", job: "the moment of the cut: the steel catches the street light once, at the tip. Read: <i>now</i>." },
      ],
      composition: [
        "Nothing outside the sim's sector; the band's outer edge is the range, never past it.",
        "The fill stays faint (≤ 0.22) so a zombie inside the sector stays readable.",
        "Brightness: glint > blade line > reach band > fill.",
        "One clock: the swing. The blade crosses in 60 ms (axe 90 ms, heavier, wider band); the band holds and fades to today's end (120 / 200 ms).",
      ],
      plan: {
        goal: "Which way the blade went and exactly what it could reach.",
        timing: "Machete 120 ms, axe 200 ms (<code>SWING_MS</code>, <code>AXE_SWING_MS</code>). Sweep 60 / 90 ms (4 frames), then the band fades.",
        lengthS: 0.4,
        lanes: {
          light: [{ t0: 0, t1: 0.09, label: "glint at the tip" }],
          core: [
            { t0: 0, t1: 0.06, label: "blade crosses (machete)", key: true },
            { t0: 0.06, t1: 0.12, label: "reach band holds, fades", nw: true },
            { t0: 0.12, t1: 0.2, label: "axe fade ends" },
          ],
          game: [{ t0: 0, t1: 0.02, label: "hits resolved on the swing", key: true }],
        },
      },
    },
    bake: async () => {
      if (sweeps.length) return;
      for (const m of MLG_W) {
        sweeps.push([0.25, 0.5, 0.75, 1].map((f) => bakeReach(m.range, m.arc, f, m.heavy)));
        await idle();
      }
      glint = bakeGlint(48);
    },
    draw: (g, t, st) => {
      MLG_W.forEach((m, i) => {
        const x = st.cx + m.dx * st.pxm;
        const y = st.cy + 1.3 * st.pxm;
        const sweepS = m.heavy ? 0.09 : 0.06;
        const endS = m.heavy ? 0.2 : 0.12;
        if (t >= endS) return;
        const f = Math.min(3, Math.floor((t / sweepS) * 4));
        const a = t < sweepS ? 1 : 1 - (t - sweepS) / (endS - sweepS);
        const s = sweeps[i]![f]!;
        if (on(st, "reach")) spriteAt(g, s.pic, x, y, s.ax, s.ay, s.pic.width / P, st.pxm, -Math.PI / 2, a, false);
        if (on(st, "glint") && t < sweepS + 0.03) {
          const frac = Math.min(1, t / sweepS);
          const ang = -Math.PI / 2 - m.arc / 2 + m.arc * frac;
          const ga = Math.sin(Math.min(1, t / (sweepS + 0.03)) * Math.PI);
          sprite(g, glint!, x + Math.cos(ang) * m.range * 0.95 * st.pxm, y + Math.sin(ang) * m.range * 0.95 * st.pxm, m.heavy ? 0.4 : 0.32, st.pxm, 0, ga, true);
        }
      });
    },
    textures: () => [...sweeps.flatMap((s, i) => s.map((c, f) => tx(`reach_${MLG_W[i]!.heavy ? "axe" : "machete"}_${f}`, c.pic, "cropped to the sector"))), tx("glint", glint, "ADD, shared")],
    parts: [
      { id: "reach", label: "Reach band + blade + swept air" },
      { id: "glint", label: "Glint (now)" },
    ],
    frames: [
      { label: "sweep 1", t: 0.008, when: "0–15 ms" },
      { label: "sweep 2", t: 0.024, when: "15–30 ms" },
      { label: "sweep 3", t: 0.039, when: "30–45 ms" },
      { label: "sweep 4", t: 0.054, when: "45–60 ms: the whole sector" },
      { label: "hold", t: 0.1, when: "60–120 ms: the band fades (axe to 200 ms)" },
    ],
  };
}
export const ML_G_PERF = " <b>ML-G</b>: 4 frames per weapon cropped to the sector (machete ≈ 82 × 158, axe ≈ 98 × 182: ≈ 330 KB for both, about half of A), glint shared. Per swing: 1 image + 1 glint, same cap 8.";
export const ML_G_FINDINGS = ["<b>ML-G</b>: A's square sweep pictures are half empty (the sector covers ~55 % of the square); cropping to the sector halves the memory and the fill."];

/* ======================================================================================================== CS-G */
const CS_RANGE = 1.5;
const CS_HALF = 30 * DEG;
const CS_TIP = CS_RANGE * 0.75;
/** The chain's exit: it runs out along the bar's top, round the tip and back underneath, so what it tears off leaves the
 * tip sideways and back toward the wielder (+y side here, back = -x). */
const JET = Math.atan2(1, -0.35);
export function csG(): Look {
  let wedge: HTMLCanvasElement | null = null;
  let spark: HTMLCanvasElement[] = [];
  let drop: HTMLCanvasElement[] = [];
  let light: HTMLCanvasElement | null = null;
  let mist: HTMLCanvasElement | null = null;
  let pool: BloodPic | null = null;
  return {
    code: "CS-G",
    title: "the chain throws it out the side",
    note: "Rethought from the goal, keeping CS-A's more blood. A chain throws what it tears off where the chain leaves the cut: off the tip, sideways and back along the bar. So the blood is one heavy jet out of the bite's side on every cut (8 drops a cut, 4 with ?fx=low), landing in a fan of splats 0.4–1.4 m to that side (the last 40 stay), plus a wound pool growing at the zombie's feet while the saw holds it. The sparks are fewer (2 a cut) and fly with the same jet (one chain, one direction): their job is only the hot contact point, with the blade light. Nothing lands on the zombie, so it stays readable.",
    goalFirst: {
      goal: "Read <b>the saw is biting this zombie, and it's gory</b>: a cut every 0.1 s (6 dmg, 60/s; <code>weapons.json</code> chainsaw, 60° × 1.5 m, quiet hits, wielder slowed 20 %), the bite at the bar's tip (0.75 × range), blood that builds up while you hold it (designer: \"more blood\").",
      elements: [
        { name: "Blade light (light)", job: "where it bites, from far: a small warm flicker at the tip on every cut. Read: <i>contact, here</i>." },
        { name: "Hot sparks (light)", job: "the chain is running fast: 2 streaks a cut leaving the tip with the jet, white → orange → dull red as they die. Read: <i>running, biting</i>." },
        { name: "Blood jet (matter)", job: "it's cutting flesh: per cut a mist and 8 heavy drops thrown sideways-back off the tip (the chain's exit). Read: <i>flesh, every 0.1 s</i>." },
        { name: "Fan of splats (mark)", job: "how long you've held it: the drops land 0.4–1.4 m to the jet's side and stay (last 40). Read: <i>gore builds up</i>." },
        { name: "Wound pool (mark)", job: "where it was held: blood runs down and pools at the zombie's feet while the saw stays in. Read: <i>this one is being cut</i>." },
        { name: "Wedge (the sim's sector)", job: "what the saw reaches: 60° × 1.5 m, very faint. Read: <i>reach</i>." },
      ],
      composition: [
        "Blood and sparks leave on ONE side (the chain's exit), never forward over the zombie and never back onto the wielder.",
        "The fan of splats lies on the street beside the target; the wound pool runs off the body at its feet on the jet side, never over the zombie.",
        "Blood is dark red-brown (BL's palette), never bright; only the sparks and the blade light are light.",
        "Brightness: spark heads > blade light > spark tails > wedge; blood below all of them.",
        "One clock: the cut (0.1 s). Light, sparks, mist and the drops' launch all on the cut; splats land 0.2–0.38 s later; the pool grows with the hold.",
      ],
      plan: {
        goal: "The saw is biting this zombie, and it's gory.",
        timing: "A cut every 0.1 s (<code>FxView.sawCut</code>, 10 ticks/s); sparks live 108–180 ms (<code>chainsawSparkMs</code>). Shown: 1 s of cutting.",
        lengthS: 1.0,
        lanes: {
          light: [{ t0: 0, t1: 1, label: "blade light flickers on every cut" }],
          core: [{ t0: 0, t1: 1, label: "wedge (sim sector), very faint" }],
          matter: [
            { t0: 0, t1: 1, label: "jet: 8 drops + mist a cut, sideways off the tip", nw: true },
            { t0: 0, t1: 1, label: "2 sparks a cut, with the jet", nw: true },
          ],
          mark: [
            { t0: 0.2, t1: 1, label: "fan of splats beside the target (last 40)", nw: true },
            { t0: 0.1, t1: 1, label: "wound pool grows at the target's feet", nw: true },
          ],
          game: [{ t0: 0, t1: 1, label: "6 dmg a cut, rev sound" }],
        },
      },
    },
    bake: async () => {
      if (wedge) return;
      wedge = slice(CS_RANGE, CS_HALF, "#ffc98a", 0.08, 48);
      spark = [0, 1, 2].map((a) => bakeSpark(a));
      drop = [bakeDrop(16, 3), bakeDrop(16, 8)];
      light = bakePool(48, [255, 190, 110]);
      mist = bakeMist(40, 21);
      pool = bakeBlood(41, 1.2, false);
    },
    draw: (g, t, st) => {
      const tipX = st.cx + CS_TIP * st.pxm;
      const tick = Math.floor(t / 0.1);
      const tk = t - tick * 0.1;
      const jc = Math.cos(JET);
      const js = Math.sin(JET);
      if (on(st, "pool")) {
        const grow = Math.min(1, 0.25 + t / 1.2);
        // at the zombie's feet (its centre 1.35 m out) on the jet's side: it runs down off the body, never over it
        sprite(g, pool!.base, st.cx + 1.22 * st.pxm, st.cy + 0.48 * st.pxm, 0.85 * grow, st.pxm, 0.7, 0.9 * ramp(t, 0.05, 0.2), false, 0.6 * grow);
        sprite(g, pool!.gloss, st.cx + 1.22 * st.pxm, st.cy + 0.48 * st.pxm, 0.85 * grow, st.pxm, 0.7, 0.3 * ramp(t, 0.05, 0.2), true, 0.6 * grow);
      }
      if (on(st, "wedge")) {
        for (const s of [tick * 0.1, tick * 0.1 - 0.1]) {
          if (s < 0 || t - s >= 0.14) continue;
          sprite(g, wedge!, st.cx, st.cy, wedge!.width / 48, st.pxm, 0, 1 - (t - s) / 0.14);
        }
      }
      if (on(st, "blood")) {
        const n = st.low ? 4 : 8;
        const marks: [number, number, number, number][] = [];
        for (let k = 0; k <= tick; k++)
          for (let j = 0; j < n; j++) {
            const h = (k * 97 + j * 31 + 7) % 1000;
            const r1 = ((h * 7919) % 1000) / 1000;
            const r2 = ((h * 104729) % 1000) / 1000;
            const r3 = ((h * 1299709) % 1000) / 1000;
            const ang = JET + (r1 - 0.5) * 0.9; // ±26° round the chain's exit
            const sp = 2 + r2 * 3.4;
            const life = 0.2 + r3 * 0.18;
            const age = t - k * 0.1;
            const d = 0.06 + (sp * (1 - Math.exp(-3.2 * Math.min(age, life)))) / 3.2;
            const x = tipX + Math.cos(ang) * d * st.pxm;
            const y = st.cy + Math.sin(ang) * d * st.pxm;
            if (age >= life) marks.push([x, y, 0.07 + r3 * 0.09, h]);
            else if (age >= 0) sprite(g, drop[j % 2]!, x, y, 0.06 + r2 * 0.03, st.pxm, ang, 0.95, false, 0.045);
          }
        marks.slice(-40).forEach(([x, y, w, h]) => sprite(g, drop[h % 2]!, x, y, w, st.pxm, h, 0.85));
        // the mist on each cut, leaving with the jet
        if (tk < 0.1) sprite(g, mist!, tipX + jc * (0.1 + tk * 2.5) * st.pxm, st.cy + js * (0.1 + tk * 2.5) * st.pxm, 0.2 + tk * 3, st.pxm, tick * 1.7, 0.5 * (1 - tk / 0.1));
      }
      if (on(st, "light")) sprite(g, light!, tipX, st.cy, 1.0, st.pxm, 0, (0.28 + 0.14 * Math.abs(Math.sin(tick * 2.7))) * (1 - 0.6 * tk / 0.1), true);
      if (on(st, "sparks")) {
        const n = st.low ? 1 : 2;
        for (let k = Math.max(0, tick - 2); k <= tick; k++)
          for (let j = 0; j < n; j++) {
            const h = (k * 53 + j * 17 + 3) % 1000;
            const life = 0.11 + (((h * 7919) % 1000) / 1000) * 0.07;
            const age = t - k * 0.1;
            if (age < 0 || age >= life) continue;
            const ang = JET + ((((h * 104729) % 1000) / 1000) - 0.5) * 0.7;
            const sp = 3 + (((h * 1299709) % 1000) / 1000) * 2;
            const d = (sp * (1 - Math.exp(-6 * age))) / 6;
            const v = sp * Math.exp(-6 * age);
            const u = age / life;
            sprite(g, spark[u < 0.33 ? 0 : u < 0.66 ? 1 : 2]!, tipX + Math.cos(ang) * d * st.pxm, st.cy + Math.sin(ang) * d * st.pxm, 0.08 + v * 0.06, st.pxm, ang, 1 - u * 0.5, true, 0.055);
          }
      }
    },
    textures: () => [tx("wedge", wedge), ...spark.map((c, k) => tx(`spark_${["hot", "orange", "red"][k]}`, c, "ADD, shared")), ...drop.map((c, k) => tx(`blood_drop_${k}`, c, "shared")), tx("blade light", light, "ADD, shared"), tx("mist", mist, "shared"), tx("wound pool", pool?.base, "a BL pool"), tx("wound gloss", pool?.gloss, "ADD")],
    parts: [
      { id: "light", label: "Blade light (contact)" },
      { id: "sparks", label: "Sparks (running)" },
      { id: "blood", label: "Jet + fan of splats (flesh, gore)" },
      { id: "pool", label: "Wound pool (held here)" },
      { id: "wedge", label: "Wedge (sim sector)" },
    ],
    frames: [
      { label: "cut", t: 0.02, when: "20 ms: light, sparks, jet out" },
      { label: "cooling", t: 0.09, when: "sparks orange, drops in flight" },
      { label: "next", t: 0.12, when: "next cut" },
      { label: "held", t: 0.9, when: "0.9 s: the fan and the pool built up" },
    ],
  };
}
export const CS_G_PERF = " <b>CS-G</b>: CS-A's textures + one BL pool (64 KB). Per cut: 1 light, 2 sparks (the spark pool, cap 32; low 1), 8 drops in flight (≤ 32 alive; low 4), 1 mist; marks: the last 40 splats (a ring) + 1 wound pool per held target.";
export const CS_G_FINDINGS = [
  "<b>CS-G</b>: today's spark pool throws its steel sparks on both sides of the blade (±60° round the side), against one chain direction; CS-G throws sparks and blood out one side (the chain's exit), which also keeps the target clear.",
  "<b>CS-G</b>: the split \"4 steel + 2 blood\" (<code>chainsawSparksPerHit</code>) would become 2 sparks + 8 drops (a client-side FX number, no balance change).",
];

/* ======================================================================================================== BF-G */
const BFG = {
  repair: [-3, -1.15],
  upgrade: [0, -1.15],
  snap: [3, -1.15],
  sold: [-1.7, 1.25],
  debris: [2, 1.25],
} as const;
type BfgSpot = keyof typeof BFG;
const bfgAt = (st: Stage, s: BfgSpot): [number, number] => [st.cx + BFG[s][0] * st.pxm, st.cy + BFG[s][1] * st.pxm];
const BAR_W = 2;
const BAR_H = 0.5;
export function bfG(): Look {
  const T: Record<string, HTMLCanvasElement> = {};
  let chips: HTMLCanvasElement[] = [];
  let dust: HTMLCanvasElement[] = [];
  const OUT_PAD = 0.35;
  return {
    code: "BF-G",
    title: "the building's own shape",
    note: "Rethought from each event's goal. The circles round a 2 × 0.5 m barricade were the FI-A mistake again (a ring round a rectangle), so the light now follows the building's own footprint: repaired, a green band leaves its outline and spreads a little; upgraded, a steel-blue band clamps onto it and a glint catches the new steel. The bear trap's jaws really are round, so its circle stays, as steel: two toothed jaws snap shut with a white glint where they meet. Sold: the building lifts away and leaves a pale print where it stood (the space is free). Destroyed: the barricade breaks in two and the halves slump to the ends, so the gap in the middle reads open; splinters fly out of its two faces (the way a hit plank breaks), not in a ring, and land and stay.",
    goalFirst: {
      goal: "Read, at a glance, <b>what happened to which building</b>: repaired (+hp, <code>repairShare</code> 0.5), upgraded (wood → reinforced → metal), trap snapped (holds 3 s, 5 dmg), sold (50 % back), destroyed (the gap is open); each in the building's real footprint (barricade 2 × 0.5 m, trap plate r 0.35 m: <code>buildings.json</code>), on today's times (450 / 450 / 180 / 200 / 450 ms).",
      elements: [
        { name: "Green outline (light)", job: "repaired, this one: a band on the footprint's outline that spreads 1 → 1.25× and fades, 450 ms; motes rise off the planks. Read: <i>fixed</i>." },
        { name: "Steel-blue outline + glint (light)", job: "upgraded, this one: a band that clamps 1.3 → 1× onto the footprint, holds, fades; a glint on the upper-left corner (the key light). Read: <i>tougher now</i>." },
        { name: "Jaws (the trap's own steel) + glint (light) + dust (matter)", job: "the trap caught something: two toothed half-rings fold up and meet in 40 ms, a white glint where they meet, a kick of dust. Read: <i>snapped, it's held</i>." },
        { name: "Lifting ghost + pale print (mark)", job: "sold, gone: the footprint lifts 0.15 m and fades (200 ms), a pale dust print stays 1.5 s. Read: <i>the space is free</i>." },
        { name: "Broken halves (mark)", job: "destroyed, and where the gap is: the barricade in two halves slumped to its ends, staying 4 s. Read: <i>open here</i>." },
        { name: "Splinters (matter → mark) + sawdust (matter)", job: "it broke violently: 6 lit splinters out of the two long faces, landing and staying; dust along the footprint. Read: <i>broken</i>." },
      ],
      composition: [
        "Every effect lives on its building's footprint: outlines on the outline, the print in the footprint, the halves inside it; nothing draws a circle round a rectangle.",
        "Splinters leave through the long faces (±y of the barricade), within ±35°, never along its length into the next building.",
        "Colours keep their meaning: green = repaired, steel blue = upgraded, white = a trap closed; amber and red are not used.",
        "Brightness: glints > outline cores > outline bands > motes; matter (splinters, dust, halves) lit from the upper left with shadows down-right, never bright.",
        "One clock per event, today's: 450 ms (repair, upgrade, debris), 180 ms (snap: jaws in 40 ms), 200 ms (sold). Marks stay after (print 1.5 s, wreck 4 s).",
      ],
      plan: {
        goal: "What happened to which building, in its own shape.",
        timing: "Repair / upgrade 450 ms (<code>REPAIR_MS</code>), snap 180 ms (<code>SNAP_MS</code>), sold 200 ms (<code>SOLD_MS</code>), debris 450 ms (<code>DEBRIS_MS</code>). Wreck and splinters stay 4 s, print 1.5 s.",
        lengthS: 0.9,
        lanes: {
          light: [
            { t0: 0, t1: 0.45, label: "outline: repair spreads / upgrade clamps", nw: true },
            { t0: 0.03, t1: 0.1, label: "snap glint", key: true, nw: true },
          ],
          core: [{ t0: 0, t1: 0.04, label: "jaws shut", key: true, nw: true }],
          matter: [{ t0: 0, t1: 0.45, label: "splinters out of the faces", nw: true }],
          smoke: [{ t0: 0, t1: 0.6, label: "sawdust along the footprint, trap dust", nw: true }],
          mark: [
            { t0: 0.05, t1: 0.9, label: "halves stay at the ends (4 s); print (1.5 s)", nw: true },
          ],
          game: [{ t0: 0, t1: 0.02, label: "sound", key: true }],
        },
      },
    },
    bake: async () => {
      if (T.repair) return;
      T.repair = bakeOutline(BAR_W, BAR_H, OUT_PAD, [124, 255, 138], 0.07);
      T.upgrade = bakeOutline(BAR_W, BAR_H, OUT_PAD, [144, 202, 249], 0.08);
      T.mote = bakePool(16, [190, 255, 196], 1.4);
      T.glint = bakeGlint(48);
      T.bar = bakeBarricade(0, 4);
      T.half1 = bakeBarricade(1, 4);
      T.half2 = bakeBarricade(2, 4);
      T.trap = bakeTrapBase();
      T.jaw = bakeJaw();
      T.print = bakePrint(BAR_W, BAR_H);
      await idle();
      chips = Array.from({ length: 6 }, (_, k) => bakeChip(31 + k * 5));
      dust = [bakeDust(48, 2), bakeDust(48, 11), bakeDust(48, 17)];
    },
    draw: (g, t, st) => {
      const oW = BAR_W + 2 * OUT_PAD;
      const oH = BAR_H + 2 * OUT_PAD;
      // ---- repaired: the barricade (context) + a green band leaving its outline
      {
        const [x, y] = bfgAt(st, "repair");
        ctxPic(g, st, T.bar!, x, y, 2.1, 0.62);
        if (on(st, "repair") && t < 0.45) {
          const u = t / 0.45;
          const s = 1 + 0.25 * easeOut(u);
          sprite(g, T.repair!, x, y, oW * s, st.pxm, 0, 1 - u * u, true, oH * (1 + 0.6 * (s - 1)));
        }
        if (on(st, "repair") && t < 0.7)
          for (let k = 0; k < (st.low ? 2 : 4); k++) {
            const age = t - k * 0.05;
            if (age <= 0) continue;
            sprite(g, T.mote!, x + (-0.75 + k * 0.5) * st.pxm, y + ((k % 2 ? 0.1 : -0.1) - 0.5 * age) * st.pxm, 0.16, st.pxm, 0, 0.8 * (1 - age / 0.7), true);
          }
      }
      // ---- upgraded: a steel-blue band clamps onto it, a glint on the upper-left corner
      {
        const [x, y] = bfgAt(st, "upgrade");
        ctxPic(g, st, T.bar!, x, y, 2.1, 0.62);
        if (on(st, "upgrade") && t < 0.45) {
          const s = 1 + 0.3 * (1 - easeOut(Math.min(1, t / 0.15)));
          const a = t < 0.2 ? 1 : 1 - (t - 0.2) / 0.25;
          sprite(g, T.upgrade!, x, y, oW * s, st.pxm, 0, a, true, oH * (1 + 0.6 * (s - 1)));
        }
        if (on(st, "upgrade") && t > 0.12 && t < 0.36) sprite(g, T.glint!, x - 0.95 * st.pxm, y - 0.22 * st.pxm, 0.45, st.pxm, 0, Math.sin(((t - 0.12) / 0.24) * Math.PI), true);
      }
      // ---- bear trap: the jaws fold up and meet (40 ms), a glint, dust
      {
        const [x, y] = bfgAt(st, "snap");
        ctxPic(g, st, T.trap!, x, y, 0.9, 0.9);
        if (on(st, "snap")) {
          const k = 1 - 0.92 * easeOut(Math.min(1, t / 0.04)); // 1 open → 0.08 shut (seen from above)
          const jh = 0.44 * k;
          // the top jaw (hinge on the centre line, jaw toward -y), the bottom one mirrored
          sprite(g, T.jaw!, x, y - (jh / 2) * st.pxm, 0.84, st.pxm, 0, 1, false, jh);
          sprite(g, T.jaw!, x, y + (jh / 2) * st.pxm, 0.84, st.pxm, Math.PI, 1, false, jh);
          if (t > 0.03 && t < 0.13) sprite(g, T.glint!, x + 0.05 * st.pxm, y, 0.5, st.pxm, 0, Math.sin(((t - 0.03) / 0.1) * Math.PI), true);
          if (t > 0.04 && t < 0.54)
            for (let j = 0; j < (st.low ? 1 : 2); j++) {
              const u = (t - 0.04) / 0.5;
              const sx = j ? 1 : -1;
              sprite(g, dust[j]!, x + sx * (0.3 + 0.2 * u) * st.pxm, y + (0.05 - 0.05 * u) * st.pxm, 0.25 + 0.3 * u, st.pxm, j, 0.4 * (1 - u));
            }
        }
      }
      // ---- sold: the building lifts away, a pale print stays where it stood
      {
        const [x, y] = bfgAt(st, "sold");
        if (on(st, "sold")) {
          sprite(g, T.print!, x, y, BAR_W + 0.3, st.pxm, 0, 0.75 * ramp(t, 0.02, 0.12) * linFade(t, 1500));
          if (t < 0.2) sprite(g, T.bar!, x, y - 0.15 * easeOut(t / 0.2) * st.pxm, 2.1 * (1 + 0.04 * t / 0.2), st.pxm, 0, 1 - t / 0.2, false, 0.62);
        }
      }
      // ---- destroyed: broken in two, the halves slump to the ends; splinters out of the faces; dust along it
      {
        const [x, y] = bfgAt(st, "debris");
        if (on(st, "debris")) {
          const u = Math.min(1, t / 0.18);
          const fade = t < 0.45 ? 1 : Math.max(0, 1 - (t - 0.45) / 4);
          sprite(g, T.half1!, x - 0.32 * easeOut(u) * st.pxm, y + 0.04 * u * st.pxm, 2.1, st.pxm, -0.1 * easeOut(u), fade, false, 0.62);
          sprite(g, T.half2!, x + 0.32 * easeOut(u) * st.pxm, y - 0.03 * u * st.pxm, 2.1, st.pxm, 0.13 * easeOut(u), fade, false, 0.62);
        }
        if (on(st, "dust") && t < 0.6)
          for (let k = 0; k < (st.low ? 2 : 3); k++) {
            const v = t / 0.6;
            const sx = (k - 1) * 0.7;
            sprite(g, dust[k]!, x + sx * st.pxm, y + (k % 2 ? 0.1 : -0.12) * (1 + v) * st.pxm, 0.5 + 0.6 * easeOut(v), st.pxm, k, 0.5 * (1 - v));
          }
        if (on(st, "splinters")) {
          const u = Math.min(1, t / 0.45);
          const e = easeOut(u);
          const n = st.low ? 3 : 6;
          for (let k = 0; k < n; k++) {
            const face = k % 2 ? 1 : -1; // out of the two long faces
            const R = rng(91 + k * 7);
            const along = (R() - 0.5) * 1.2; // born along the middle of the barricade (where it broke)
            const ang = face * Math.PI / 2 + (R() - 0.5) * 1.2;
            const dist = 0.45 + R() * 0.8;
            const h = 4 * 0.35 * u * (1 - u);
            const c = chips[k]!;
            const px = along + Math.cos(ang) * dist * e;
            const py = face * 0.25 + Math.sin(ang) * dist * e;
            sprite(g, c, x + px * st.pxm, y + (py - h) * st.pxm, (c.width / 120) * (1 + h * 0.5), st.pxm, ang + u * (k % 2 ? 4 : -3), u < 1 ? 1 : Math.max(0, 1 - (t - 0.45) / 4));
          }
        }
      }
    },
    textures: () => [
      tx("outline_repair", T.repair, "ADD, footprint 2 × 0.5 + 0.35 m"),
      tx("outline_upgrade", T.upgrade, "ADD"),
      tx("mote", T.mote, "ADD"),
      tx("glint", T.glint, "ADD, shared"),
      tx("trap_jaw", T.jaw, "the trap's own art in the game"),
      tx("barricade_half_L", T.half1),
      tx("barricade_half_R", T.half2),
      tx("sold_print", T.print),
      ...chips.map((c, k) => tx(`splinter_${k}`, c, "shared with BF-A")),
      ...dust.map((c, k) => tx(`sawdust_${k}`, c, "shared")),
      tx("context: barricade (not FX)", T.bar),
      tx("context: trap base (not FX)", T.trap),
    ],
    parts: [
      { id: "repair", label: "Repaired: green outline + motes" },
      { id: "upgrade", label: "Upgraded: steel outline + glint" },
      { id: "snap", label: "Trap: jaws + glint + dust" },
      { id: "sold", label: "Sold: ghost + print" },
      { id: "debris", label: "Destroyed: broken halves" },
      { id: "splinters", label: "Destroyed: splinters" },
      { id: "dust", label: "Destroyed: sawdust" },
    ],
    frames: [
      { label: "snap", t: 0.02, when: "20 ms: jaws half shut" },
      { label: "shut", t: 0.06, when: "60 ms: jaws shut, glint" },
      { label: "mid", t: 0.15, when: "150 ms: upgrade clamped, splinters out" },
      { label: "late", t: 0.35, when: "350 ms" },
      { label: "landed", t: 0.8, when: "the wreck and the splinters stay" },
    ],
  };
}
export const BF_G_PERF =
  " <b>BF-G</b>: 2 outline bands 173 × 77 px (ADD, cropped to the footprint + 0.35 m: 52 KB each), 2 broken halves 134 × 40, a jaw 81 × 42, a print 125 × 39, mote / glint / splinters / dust shared with BF-A: ≈ 180 KB. Per event: repair 1 band + 4 motes; upgrade 1 band + 1 glint; snap 2 jaws (the trap's own picture in the game: a swapped frame) + 1 glint + 2 dust; sold 1 ghost + 1 print (1.5 s); destroyed 2 halves + 6 splinters (stay 4 s: the BF-A splinter ring, <b>cap 48</b>, plus 2 halves) + 3 dust. <code>?fx=low</code>: half the motes, dust and splinters.";
export const BF_G_FINDINGS = [
  "<b>BF-G</b>: every ring is a circle round a footprint that isn't one (a barricade is 2 × 0.5 m): the FI-A mistake. <code>building.repaired</code> and <code>building.upgraded</code> carry x, y only; the view can look the building up (as <code>debris</code> and <code>sold</code> already get type and rotation) to draw its outline.",
  "<b>BF-G</b>: destroyed debris flies out in an even ring of 6 round the centre whatever broke; a barricade breaks across its middle and throws out of its faces. BF-G also keeps the wreck in the footprint, so the open gap reads (the sim frees the cell at once).",
  "<b>BF-G</b>: the bear trap's snap ring shrinks (× 1.6 → 0.5) where the jaws are: the one circle in this card that matches a round thing, so BF-G draws it as the jaws themselves.",
];
