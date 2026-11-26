/**
 * Fire family, goal-first takes (`-G`, dead-city-model fx.md › FX 4): EX1-G, EX2-G, GR-G, FS-G, BX-G (MO-G is in
 * `fire-gmo.ts`; FI's goal-first take is FI-B, `fire-car.ts`). Each look's `goalFirst` (goal → elements →
 * composition → plan) was written before it was drawn; the code follows it. None of them steps today's emitter: each
 * places its own sprites, statelessly from the time and the seed, where its goal says (take A's pictures).
 */
import { sprite, rng, easeOut, type Look, type Stage, type ActionPlan } from "./kit";
import { G, gameAtlases, relitFrame, shadowOf, FLAME_A_STEPS } from "./fire-kit";
import { gk, on, hash, WIND, WIND_ANG, EDGE } from "./fire-gkit";
import { fireFlicker } from "../../../../apps/client/src/render/city/fireParticles";
import { ROUND_H_M, ROUND_W_M } from "../../../../apps/client/src/render/city/blastFxAtlas";
import { GRENADE_FRAME_M } from "../../../../apps/client/src/render/city/throwArt";

const X = (st: Stage, x: number): number => st.cx + x * st.pxm;
const Y = (st: Stage, y: number): number => st.cy + y * st.pxm;
const flame = (step: number, v: number): HTMLCanvasElement => (gk().A.flame[Math.max(0, Math.min(FLAME_A_STEPS - 1, step))] as HTMLCanvasElement[])[v & 3] as HTMLCanvasElement;
const soot = (tone: number, v: number): HTMLCanvasElement => (gk().A.soot[Math.min(2, tone)] as HTMLCanvasElement[])[v % 3] as HTMLCanvasElement;
const dust = (tone: number, v: number): HTMLCanvasElement => (gk().A.dust[Math.min(2, tone)] as HTMLCanvasElement[])[v % 3] as HTMLCanvasElement;
const gas = (tone: number, v: number): HTMLCanvasElement => (gk().A.gas[Math.min(2, tone)] as HTMLCanvasElement[])[v % 3] as HTMLCanvasElement;

/** A chunk thrown from the centre: lands at `land` m after `tl` s on a hop of `h` m; its shadow meets it on landing. */
function chunk(g: CanvasRenderingContext2D, st: Stage, t: number, k: number, a: number, land: number, tl: number, h: number, size: number, fadeAt: number): void {
  const K = gk();
  const u = Math.min(1, t / tl);
  const d = land * easeOut(u * 0.6 + 0.4 * u * u);
  const z = 4 * h * u * (1 - u);
  const x = Math.cos(a) * d;
  const y = Math.sin(a) * d;
  const alpha = t < fadeAt ? 1 : Math.max(0, 1 - (t - fadeAt) / 0.6);
  const ch = K.A.chunks[k % 6] as HTMLCanvasElement;
  const sh = K.A.chunkShadows[k % 6] as HTMLCanvasElement;
  const rot = k * 1.7 + (u < 1 ? t * (6 + k) : tl * (6 + k));
  sprite(g, sh, X(st, x + 0.02 + z * 0.35), Y(st, y + 0.03 + z * 0.45), size * (sh.width / ch.width), st.pxm, rot, alpha * Math.max(0.25, 0.75 - z * 0.3));
  sprite(g, ch, X(st, x), Y(st, y - z * 0.15), size * (1 + z * 0.3), st.pxm, rot, alpha);
}

/* ================================ EX1-G: launcher blast ================================ */
const R_BLAST = 2.5; // weapons.json grenade_launcher.blastRadiusM (= mine, hand grenade, Bloater)
const EX1_PLAN: ActionPlan = {
  goal: "It burst HERE, it reached THIS far (2.5 m), and it is over.",
  timing: "weapons.json grenade_launcher: 40 damage once on the burst tick, 2.5 m, push 0.6 m; shake within 6 m (combat.json). EX1-G: flash 0.08 s, front reaches R at 0.12 s and cools out by 0.4 s, fireball flames live 0.35–0.7 s, smoke 0.1–3.2 s, scorch 30 s (game).",
  lengthS: 3.2,
  lanes: {
    light: [
      { t0: 0, t1: 0.08, label: "flash: where + when", key: true },
      { t0: 0.08, t1: 0.5, label: "light pool to R, fading" },
    ],
    core: [
      { t0: 0, t1: 0.12, label: "front out to R", key: true, nw: true },
      { t0: 0.12, t1: 0.7, label: "front cools out by 0.4 s; fireball cools inside R", nw: true },
    ],
    matter: [{ t0: 0, t1: 0.6, label: "6 chunks hop out, land on their shadows" }],
    smoke: [{ t0: 0.1, t1: 3.2, label: "soot rises from the centre, downwind (may cross R)" }],
    mark: [
      { t0: 0, t1: 0.12, label: "scorch in (rays end at R)", key: true },
      { t0: 0.12, t1: 1.5, label: "embers die in the scorch" },
      { t0: 1.5, t1: 3.2, label: "scorch stays (30 s)" },
    ],
    game: [
      { t0: 0, t1: 0.05, label: "40 damage, push", key: true },
      { t0: 0.05, t1: 0.22, label: "shake" },
    ],
  },
};
export function ex1G(): Look {
  return {
    code: "EX1-G",
    title: "Here, this far, over",
    note: "Goal first: where it burst, how far it reached, that it is over. The reach is now the fireball's own edge: a front of light that races out to exactly 2.5 m in 0.12 s and cools white → orange → red-brown, so the amber ring is gone (amber is for events you can use). The fireball stays inside it; flying sparks are cut (no job); the scorch's rays end at the reach and keep the size on the ground. Close to A in its pictures; what changed is who tells the size.",
    goalFirst: {
      goal: "It burst <b>here</b>, everyone inside <b>2.5 m</b> took 40 (once, on the burst tick, behind cover excepted), and it is <b>over</b>: nothing burns afterwards.",
      elements: [
        { name: "Flash", job: "where and when: the brightest thing on screen for 0.08 s, white-hot core." },
        { name: "Blast front", job: "how far: one soft band of light that reaches exactly R at 0.12 s and cools out by 0.4 s. A blast really is round, so a round front is the thing itself, not a drawn ring. Replaces the amber ring (amber = usable event)." },
        { name: "Fireball", job: "it is fire, not a shock: flames thrown outward, tips out, cooling by temperature; their bright part stays inside the front." },
        { name: "Light pool", job: "lights the street up to R for 0.5 s: you feel the size on the ground and on bodies." },
        { name: "Chunks (6)", job: "the push: asphalt thrown outward, landing on their shadows inside R." },
        { name: "Smoke", job: "it happened here: soot rising from the centre after the light, read from far; may drift past R." },
        { name: "Scorch + embers", job: "the size afterwards: the mark's rays end at R; embers die in it in 1.5 s (just happened)." },
        { name: "Cut: flying sparks", job: "no job of their own (the flash says 'here', the front says 'how far'); they crossed the edge and blurred it." },
      ],
      composition: [
        "Brightness: flash > fireball core > front > light pool > scorch embers. Smoke and chunks are matter, lit from the upper left.",
        "Nothing bright crosses R: flame size is clamped so its bright part stops 5 cm inside; the front ends on R; the light pool ends on R. Only smoke may cross.",
        "One clock: light peaks at 0–0.05 s, the front and fireball expand together (0.12 s), matter flies to 0.6 s, smoke rises after, the mark stays.",
        "Over: by 0.7 s no light is left, so the player reads 'safe to walk in'.",
      ],
      plan: EX1_PLAN,
    },
    async bake() {
      gk();
    },
    textures: () => {
      const K = gk();
      return [
        { name: "blast front ×3 temperatures", canvas: K.front[0] as HTMLCanvasElement, note: "ADD, edge at R" },
        { name: "front (orange)", canvas: K.front[1] as HTMLCanvasElement, note: "ADD" },
        { name: "front (red-brown)", canvas: K.front[2] as HTMLCanvasElement, note: "ADD" },
        { name: "A flame steps (shared)", canvas: flame(0, 0), note: "ADD" },
        { name: "A soot (shared)", canvas: soot(0, 0) },
        { name: "A flash (shared)", canvas: K.A.flash, note: "ADD" },
        { name: "A pool (shared)", canvas: K.A.pool, note: "ADD" },
        { name: "A scorch (shared)", canvas: K.A.scorch },
        { name: "A chunks (shared)", canvas: K.A.chunks[0] as HTMLCanvasElement },
      ];
    },
    parts: [
      { id: "flash", label: "Flash" },
      { id: "front", label: "Blast front (the reach)" },
      { id: "flame", label: "Fireball" },
      { id: "light", label: "Light pool" },
      { id: "debris", label: "Chunks" },
      { id: "smoke", label: "Smoke" },
      { id: "mark", label: "Scorch + embers" },
    ],
    frames: [
      { label: "f0", t: 0.02, when: "the burst: flash at full, front starting" },
      { label: "f1", t: 0.12, when: "the front reaches 2.5 m" },
      { label: "f2", t: 0.25, when: "front cooling, fireball orange" },
      { label: "f3", t: 0.6, when: "flames out, chunks landed" },
      { label: "f4", t: 1.5, when: "smoke only" },
      { label: "f5", t: 3, when: "the mark stays" },
    ],
    draw(g, t, st) {
      const K = gk();
      const A = K.A;
      const pxm = st.pxm;
      const R = R_BLAST;
      if (on(st, "mark")) {
        sprite(g, A.scorch, st.cx, st.cy, 2 * R * EDGE, pxm, 0.6 + st.seed, Math.min(1, t / 0.12) * 0.9);
        const ea = t < 0.12 ? t / 0.12 : Math.max(0, 1 - (t - 0.12) / 1.4);
        sprite(g, A.scorchGlow, st.cx, st.cy, R * 1.2, pxm, 0.7, ea * 0.85, true);
      }
      if (on(st, "light")) sprite(g, A.pool, st.cx, st.cy, 2 * R, pxm, 0, 0.9 * (t < 0.05 ? 1 : Math.max(0, 1 - (t - 0.05) / 0.45)), true);
      if (on(st, "smoke")) {
        const n = st.low ? 4 : 8;
        for (let k = 0; k < n; k++) {
          const born = 0.1 + hash(k * 7 + st.seed) * 0.2;
          const life = 2.6 + hash(k * 3 + 1) * 0.6;
          const a = (t - born) / life;
          if (a < 0 || a > 1) continue;
          const ang = hash(k * 11 + 5 + st.seed) * Math.PI * 2;
          const r0 = R * 0.45 * hash(k * 13 + 2);
          const dd = a * life * 0.6;
          const x = Math.cos(ang) * r0 + WIND[0] * dd;
          const y = Math.sin(ang) * r0 + WIND[1] * dd - a * 0.4;
          sprite(g, soot(Math.floor(a * 3), k), X(st, x), Y(st, y), 1.2 + a * 2.0, pxm, k + a, Math.min(1, a / 0.06) * (1 - a * 0.9));
        }
      }
      if (on(st, "debris")) for (let k = 0; k < 6; k++) chunk(g, st, t, k, (k / 6) * Math.PI * 2 + hash(k + st.seed * 17) * 0.8, R * (0.45 + 0.4 * hash(k * 5 + 3)), 0.4 + 0.2 * hash(k * 9), 0.5, 0.22, 2.4);
      if (on(st, "flame")) {
        const n = st.low ? 13 : 26;
        const grow = easeOut(t / 0.12);
        for (let k = 0; k < n; k++) {
          const life = 0.35 + hash(k * 31 + 7) * 0.35;
          const age = t / life;
          if (age >= 1) continue;
          const ang = (k / n) * Math.PI * 2 + hash(k * 17 + st.seed) * 0.6;
          const f = k % 2 === 0 ? 0.1 + 0.45 * hash(k * 3) : 0.5 + 0.45 * hash(k * 5 + 1); // half fill the middle: a ball, not spokes
          let d = f * R * grow;
          let size = (1.0 + 0.7 * hash(k * 7 + 2)) * (0.6 + 0.4 * grow) * Math.sin(Math.PI * Math.min(1, age * 1.1 + 0.08)) ** 0.6;
          d += WIND[0] * age * 0.15;
          const reach = d + size * 0.45;
          if (reach > R - 0.05) size = Math.max(0, (R - 0.05 - d) / 0.45);
          if (size < 0.05) continue;
          const step = Math.min(5, Math.floor(age * 5.5));
          sprite(g, flame(step, k), X(st, Math.cos(ang) * d), Y(st, Math.sin(ang) * d), size * 0.9, pxm, ang + Math.PI / 2 + (hash(k * 37) - 0.5) * 1.6, (1 - age * 0.4) * 0.8, true, size);
        }
      }
      if (on(st, "front") && t < 0.42) {
        const r = R * easeOut(t / 0.12);
        const step = t < 0.08 ? 0 : t < 0.2 ? 1 : 2;
        const a = t < 0.12 ? 0.75 : Math.max(0, 0.75 - (t - 0.12) / 0.3);
        sprite(g, K.front[step] as HTMLCanvasElement, st.cx, st.cy, (2 * r) / EDGE, pxm, st.seed, a, true);
      }
      if (on(st, "flash") && t < 0.08) sprite(g, A.flash, st.cx, st.cy, R * 1.7 * (0.75 + 0.25 * (t / 0.08)), pxm, 0, 1 - t / 0.08, true);
    },
  };
}

/* ================================ EX2-G: mine / hand-grenade blast ================================ */
const EX2_PLAN: ActionPlan = {
  goal: "A hard crack HERE that threw everything out to 2.5 m; no fire is left.",
  timing: "buildings.json mine: 80 damage (players × 0.5), 2.5 m, trigger 1 m; consumables.json grenades: 40, 2.5 m; mineBlast.ts shake 220 ms. EX2-G: flash 0.05 s, dust front rolls to R in 0.25 s and stops, fragments 0.12 s, chunks land by 0.5 s, dust settles 0.3–1.6 s.",
  lengthS: 2.6,
  lanes: {
    light: [
      { t0: 0, t1: 0.05, label: "hard flash", key: true },
      { t0: 0.05, t1: 0.25, label: "short pool" },
    ],
    core: [{ t0: 0, t1: 0.25, label: "dust front rolls to R and stops", key: true, nw: true }],
    matter: [
      { t0: 0, t1: 0.12, label: "fragments streak to R, die", nw: true },
      { t0: 0.12, t1: 0.5, label: "10 chunks land on their shadows" },
    ],
    smoke: [{ t0: 0.25, t1: 2.2, label: "dust hangs at the front, thins, drifts a little" }],
    mark: [
      { t0: 0, t1: 0.05, label: "crater + cracks to R", key: true, nw: true },
      { t0: 0.05, t1: 0.3, label: "cracks stay" },
      { t0: 0.3, t1: 1.6, label: "dust settles at the reach", nw: true },
    ],
    game: [
      { t0: 0, t1: 0.05, label: "80 / 40 damage", key: true },
      { t0: 0.05, t1: 0.22, label: "shake 220 ms" },
    ],
  },
};
export function ex2G(): Look {
  return {
    code: "EX2-G",
    title: "A crack that throws to the edge",
    note: "Goal first: force, not fire, and its exact reach. The reach is the dust itself: a wall of concrete dust rolls out and stops on 2.5 m, and leaves a pale settled band there, so the white ring is gone (white is for pick-ups and people). Fragments streak out and die at the edge; cracks in the asphalt end at the reach; the 8 small flames are cut (no fuel: they read as EX1).",
    goalFirst: {
      goal: "A hard crack <b>here</b>: everything inside <b>2.5 m</b> took 80 (mine; players half) or 40 (hand grenade), was thrown outward, and <b>no fire is left</b>.",
      elements: [
        { name: "Flash", job: "where and when: harder and shorter than EX1's (0.05 s)." },
        { name: "Dust front", job: "how far: concrete dust blown out in a wall that stops on R at 0.25 s. A blast front is really round, and it is matter (lit from the upper left), so no colour code is needed. Replaces the white ring (white = pick-ups, people)." },
        { name: "Fragments (14)", job: "hard and metal: straight streaks out to R in 0.12 s, then gone. They stop at the edge like the damage." },
        { name: "Chunks (10)", job: "the throw: asphalt thrown hard, landing on their shadows inside R." },
        { name: "Crater + cracks", job: "where, afterwards: a pit with cracks running out, the longest ending at R." },
        { name: "Settled dust", job: "how far, afterwards: the pale band the front dropped where it stopped." },
        { name: "Light pool", job: "a short pool (0.25 s): the crack lights the street for a blink." },
        { name: "Cut: flames", job: "no fuel; small flames made it read as a weaker EX1." },
      ],
      composition: [
        "Brightness: flash > fragments > pool. Everything else is matter or mark, darker than light.",
        "The front, the fragments and the cracks all end on R; dust may thin and drift past it after 0.5 s (smoke rule).",
        "One clock: flash 0–0.05 s, fragments to 0.12 s, front stops at 0.25 s, chunks land by 0.5 s, dust settles after, marks stay.",
        "No warm light after 0.25 s: nothing is burning.",
      ],
      plan: EX2_PLAN,
    },
    async bake() {
      gk();
    },
    textures: () => {
      const K = gk();
      return [
        { name: "crater + cracks", canvas: K.cracks, note: "cracks end at R" },
        { name: "settled dust band", canvas: K.deposit },
        { name: "A dust (shared)", canvas: dust(0, 0) },
        { name: "A spark (shared)", canvas: K.A.spark, note: "ADD" },
        { name: "A flash (shared)", canvas: K.A.flash, note: "ADD" },
        { name: "A pool (shared)", canvas: K.A.pool, note: "ADD" },
        { name: "A chunks (shared)", canvas: K.A.chunks[0] as HTMLCanvasElement },
      ];
    },
    parts: [
      { id: "flash", label: "Flash + pool" },
      { id: "front", label: "Dust front (the reach)" },
      { id: "frag", label: "Fragments" },
      { id: "debris", label: "Chunks" },
      { id: "mark", label: "Crater, cracks, settled dust" },
    ],
    frames: [
      { label: "f0", t: 0.02, when: "the crack: flash, fragments flying" },
      { label: "f1", t: 0.12, when: "fragments at the edge" },
      { label: "f2", t: 0.25, when: "the dust front stops on 2.5 m" },
      { label: "f3", t: 0.6, when: "chunks landed, dust hangs" },
      { label: "f4", t: 1.4, when: "dust thinning, band settled" },
      { label: "f5", t: 2.4, when: "the mark stays" },
    ],
    draw(g, t, st) {
      const K = gk();
      const A = K.A;
      const pxm = st.pxm;
      const R = R_BLAST;
      if (on(st, "mark")) {
        sprite(g, K.cracks, st.cx, st.cy, (2 * R) / EDGE, pxm, st.seed * 0.9, Math.min(1, t / 0.05) * 0.95);
        sprite(g, K.deposit, st.cx, st.cy, (2 * R) / EDGE, pxm, st.seed, Math.min(1, Math.max(0, (t - 0.3) / 1.3)) * 0.9);
      }
      if (on(st, "flash")) sprite(g, A.pool, st.cx, st.cy, 2 * R, pxm, 0, 0.6 * Math.max(0, 1 - t / 0.25), true);
      if (on(st, "debris")) for (let k = 0; k < 10; k++) chunk(g, st, t, k, (k / 10) * Math.PI * 2 + hash(k * 3 + st.seed * 13) * 0.6, R * (0.5 + 0.45 * hash(k * 5 + 9)), 0.3 + 0.2 * hash(k * 7), 0.35, 0.2, 2);
      if (on(st, "front")) {
        const n = st.low ? 14 : 28;
        const roll = easeOut(t / 0.25);
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * Math.PI * 2 + hash(k * 19 + st.seed) * 0.25;
          const size = (0.75 + 0.35 * hash(k * 23)) * (0.5 + 0.5 * roll) + Math.max(0, t - 0.25) * 0.35;
          const d = Math.max(0, R - size * 0.42) * roll + Math.max(0, t - 0.5) * 0.12 * (0.5 + hash(k));
          const x = Math.cos(ang) * d + WIND[0] * Math.max(0, t - 0.5) * 0.15;
          const y = Math.sin(ang) * d + WIND[1] * Math.max(0, t - 0.5) * 0.15;
          const a = Math.min(1, t / 0.04) * (t < 0.6 ? 0.9 : Math.max(0, 0.9 * (1 - (t - 0.6) / 1.6)));
          sprite(g, dust(Math.min(2, Math.floor(t / 0.7)), k), X(st, x), Y(st, y), size, pxm, k * 1.3 + t * 0.3, a);
        }
        // a thin veil inside the front (the dust that didn't make it to the edge)
        for (let k = 0; k < (st.low ? 3 : 5); k++) {
          const ang = hash(k * 41 + st.seed) * Math.PI * 2;
          const d = R * (0.2 + 0.4 * hash(k * 43)) * roll;
          sprite(g, dust(1, k), X(st, Math.cos(ang) * d), Y(st, Math.sin(ang) * d), 1.2 + t * 0.4, pxm, k, Math.min(1, t / 0.05) * Math.max(0, 0.5 * (1 - t / 1.8)));
        }
      }
      if (on(st, "frag") && t < 0.14) {
        const n = st.low ? 7 : 14;
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * Math.PI * 2 + hash(k * 29 + st.seed) * 0.4;
          const u = t / 0.12;
          const d = (R - 0.2) * Math.min(1, u) * (0.75 + 0.25 * hash(k * 31));
          const len = 0.35 + 0.25 * hash(k);
          sprite(g, A.spark, X(st, Math.cos(ang) * (d - len * 0.3)), Y(st, Math.sin(ang) * (d - len * 0.3)), len, pxm, ang, Math.max(0, 1 - u * 0.8), true, 0.06);
        }
      }
      if (on(st, "flash") && t < 0.05) sprite(g, A.flash, st.cx, st.cy, R * 1.5, pxm, 0.4, Math.pow(1 - t / 0.05, 0.7), true);
    },
  };
}

/* ================================ GR-G: rounds in flight ================================ */
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
const GR_PLAN: ActionPlan = {
  goal: "Something is flying to THAT spot and bursts there soon.",
  timing: "Launcher 20 m/s (min 0.25 s): 7.5 m in 0.375 s. Hand grenade 12 m/s (min 0.3 s): 0.625 s. Arc 1.5 m (combat.json lobArcM). The burst is EX1 / EX2.",
  lengthS: 0.8,
  lanes: {
    core: [
      { t0: 0, t1: 0.375, label: "round: rises, falls (3×)" },
      { t0: 0.375, t1: 0.625, label: "grenade lands (tumbling)" },
    ],
    matter: [{ t0: 0, t1: 0.625, label: "shadow: soft and pale high, crisp and dark low, meets the item on landing", nw: true }],
    smoke: [{ t0: 0, t1: 0.55, label: "launcher trail (who shot, from where)" }],
    game: [
      { t0: 0.37, t1: 0.4, label: "round bursts", key: true },
      { t0: 0.62, t1: 0.65, label: "grenade bursts", key: true },
    ],
  },
};
export function grG(): Look {
  let round: HTMLCanvasElement, hand: HTMLCanvasElement;
  const rSh: HTMLCanvasElement[] = [];
  const hSh: HTMLCanvasElement[] = [];
  const p: Pose = { x: 0, y: 0, z: 0, u: 0, live: false };
  const q: Pose = { x: 0, y: 0, z: 0, u: 0, live: false };
  const shIdx = (z: number): number => (z > 1 ? 2 : z > 0.45 ? 1 : 0);
  return {
    code: "GR-G",
    title: "The shadow says where it lands",
    note: "Goal first: where it will land and when. Close to A: the relit item, its own shadow and the launcher trail stay. What the goal changed: the shadow is now the landing read. It is soft and pale while the item is high and turns crisp and dark as it comes down, so its sharpening counts down to the burst, and it meets the item exactly where the blast will be.",
    goalFirst: {
      goal: "Something is flying to <b>that spot</b> and bursts there in a moment (launcher round 20 m/s, ≤ 0.6 s; hand grenade 12 m/s, ≤ 0.7 s), with a 2.5 m blast.",
      elements: [
        { name: "Shadow", job: "where it lands and how soon: it runs on the ground track; soft and pale when the item is high, crisp and dark low; it meets the item at the burst point." },
        { name: "Item (relit)", job: "what is coming: round or grenade, rising and falling (scale +30 % per metre), the grenade tumbling." },
        { name: "Launcher trail", job: "who shot it and from where: a thin grey propellant trail, gone in 0.2 s. Not on the hand grenade (nothing propels it)." },
        { name: "Cut: any glow", job: "nothing burns until it lands; a light would read as fire." },
      ],
      composition: [
        "The shadow lies on the ground (down-right of the item by its height, light from the upper left) and never leaves the ground track.",
        "Brightness: the item's glint > the item > the trail > the shadow. No additive sprite.",
        "One clock: the flight. Height, scale, shadow offset, shadow sharpness and the tumble all come from the flight's progress u.",
      ],
      plan: GR_PLAN,
    },
    async bake() {
      gameAtlases();
      gk();
      if (!round) {
        round = relitFrame(G.round(), 40, 11, 40 * 0.9);
        hand = relitFrame(G.hand()[1] as HTMLCanvasElement, 64, 12, 64 * 0.9);
        for (const [b, a] of [
          [1, 0.95],
          [2.5, 0.75],
          [4.5, 0.5],
        ] as const) {
          rSh.push(shadowOf(round, b, a));
          hSh.push(shadowOf(hand, b, a));
        }
      }
    },
    textures: () => [
      { name: "round relit", canvas: round },
      { name: "round shadow: low", canvas: rSh[0] as HTMLCanvasElement },
      { name: "round shadow: high", canvas: rSh[2] as HTMLCanvasElement },
      { name: "hand grenade relit", canvas: hand },
      { name: "hand shadow ×3 heights", canvas: hSh[1] as HTMLCanvasElement },
    ],
    parts: [
      { id: "item", label: "Round / grenade" },
      { id: "shadow", label: "Shadow (landing read)" },
      { id: "trail", label: "Launcher trail" },
    ],
    frames: [
      { label: "launch", t: 0.03, when: "leaves the muzzle: shadow crisp" },
      { label: "top", t: 0.2, when: "round at the top: shadow soft" },
      { label: "mid", t: 0.33, when: "grenade at the top; round about to land (crisp)" },
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
        const s = (1 + p.z * 0.3) * 3;
        const sh = rSh[shIdx(p.z)] as HTMLCanvasElement;
        if (on(st, "shadow")) sprite(g, sh, X(st, p.x + p.z * 0.35), Y(st, p.y + p.z * 0.45), ROUND_W_M * 3 * (sh.width / round.width) * (1 + p.z * 0.12), pxm, 0, 0.45 + 0.45 * (1 - p.z / ARC_M));
        if (on(st, "item")) sprite(g, round, X(st, p.x), Y(st, p.y - p.z * 0.15), ROUND_W_M * s * 1.1, pxm, 0, 1);
      }
      flightAt(HAND, t, p);
      if (p.live) {
        const spin = p.u * Math.PI * 2 * 2.2;
        const s = (1 + p.z * 0.3) * 2.2;
        const sh = hSh[shIdx(p.z)] as HTMLCanvasElement;
        if (on(st, "shadow")) sprite(g, sh, X(st, p.x + p.z * 0.35), Y(st, p.y + p.z * 0.45), GRENADE_FRAME_M.w * 2.2 * (sh.width / hand.width) * 1.12 * (1 + p.z * 0.12), pxm, spin, 0.45 + 0.45 * (1 - p.z / ARC_M));
        if (on(st, "item")) sprite(g, hand, X(st, p.x), Y(st, p.y - p.z * 0.15), GRENADE_FRAME_M.w * s * 1.12, pxm, spin, 1);
      }
      void ROUND_H_M;
    },
  };
}

/* ================================ FS-G: flamethrower and gas torch ================================ */
const FS_ON = 1.6;
const FLAMERS = [
  { x: -3.2, y: -1.5, range: 6, half: (10 * Math.PI) / 180, jet: true }, // weapons.json flamethrower: 6 m, 20°
  { x: -3.2, y: 1.7, range: 3, half: (30 * Math.PI) / 180, jet: false }, // gas_torch: 3 m, 60°
] as const;
const FS_PLAN: ActionPlan = {
  goal: "Your stream covers THIS (6 m × 20° / 3 m × 60°) while you hold, and stops when you let go.",
  timing: "weapons.json: flamethrower 6 m, 20°, 20 damage per 0.25 s pulse, ignites 3/s for 3 s; gas torch 3 m, 60°. FS-G: fuel parcels fly the reach in 0.45 s (FS1) / 0.3 s (FS2), 40 / 50 per s (half with ?fx=low), so the stream clears 0.45 s after release.",
  lengthS: 2.4,
  lanes: {
    light: [
      { t0: 0, t1: FS_ON, label: "floor light in the cone's shape, ends at the reach", nw: true },
      { t0: FS_ON, t1: 2.4, label: "pilot only (armed)" },
    ],
    core: [
      { t0: 0, t1: 0.45, label: "stream runs out to the reach", key: true },
      { t0: 0.45, t1: FS_ON, label: "full: ignites 0.4 m out, white → amber → red-brown bloom at the tip", nw: true },
      { t0: FS_ON, t1: FS_ON + 0.45, label: "released: the stream detaches and flies out", key: true, nw: true },
    ],
    smoke: [{ t0: 0.4, t1: FS_ON + 1, label: "soot from the tip, downwind" }],
    game: [{ t0: 0, t1: FS_ON, label: "damage every 0.25 s, ignites" }],
  },
};
export function fsG(): Look {
  return {
    code: "FS-G",
    title: "The stream is the cone",
    note: "Goal first: what your stream covers, and that it stopped. The stream is one rope of burning fuel (FS1) or a gas fan (FS2) that fills the game's cone and ends at its reach; the floor light is baked in the cone's own shape and ends there too. On release the rope detaches from the nozzle and flies out, so you see it stop. Burning drips on the ground were considered and cut: fire on the ground would read as a damage zone that doesn't exist.",
    goalFirst: {
      goal: "While you hold, your stream covers <b>this cone</b> (flamethrower 6 m × 20°, gas torch 3 m × 60°; 20 damage per 0.25 s, targets ignite), and it <b>stops</b> the moment you let go.",
      elements: [
        { name: "Stream", job: "the cover: FS1 is a rope of liquid fuel that lights 0.4 m out, widens with the cone and blooms (cooler, bigger) at the reach; FS2 a short wide fan with a blue gas core. The bright part never passes the cone or the reach." },
        { name: "Floor light", job: "the cone on the ground: a light baked in the cone's own shape (range, angle) that ends at the reach; it goes out with the stream." },
        { name: "Release", job: "it stopped: the rope detaches at the nozzle and its last fuel flies out and dies in 0.45 s; the floor light goes out in 0.15 s." },
        { name: "Pilot flame", job: "armed: a small flame at the nozzle that stays lit after release (FS2: blue)." },
        { name: "Soot", job: "where the stream ends, from far away: a few wisps from the tip, downwind." },
        { name: "Cut: burning drips / puddles", job: "the game leaves no fire on the ground; a burning drip would promise a damage zone." },
      ],
      composition: [
        "Flame only inside the cone; its bright part stops at the reach (size clamped); the floor light ends with it.",
        "Brightness: the ignition point (white) > the stream's middle (amber) > the tip bloom (red-brown, larger) > the floor light > the pilot.",
        "One clock: the trigger. Parcels are born only while it is held; everything after release is the last fuel flying out.",
        "Smoke may drift past the reach; nothing bright does.",
      ],
      plan: FS_PLAN,
    },
    async bake() {
      gameAtlases(); // the card's survivors
      gk();
    },
    textures: () => {
      const K = gk();
      return [
        { name: "floor light, FS1 cone (6 m × 20°)", canvas: K.cone6, note: "ADD, cropped to the cone" },
        { name: "floor light, FS2 cone (3 m × 60°)", canvas: K.cone3, note: "ADD" },
        { name: "A flame steps (shared)", canvas: flame(1, 0), note: "ADD" },
        { name: "A torch (shared)", canvas: K.A.torch[0] as HTMLCanvasElement, note: "ADD" },
        { name: "A soot (shared)", canvas: soot(1, 0) },
      ];
    },
    parts: [
      { id: "flame", label: "Stream" },
      { id: "light", label: "Floor light (the cone)" },
      { id: "pilot", label: "Pilot flame" },
      { id: "smoke", label: "Soot" },
    ],
    frames: [
      { label: "open", t: 0.2, when: "trigger: the stream runs out" },
      { label: "full", t: 0.8, when: "full stream" },
      { label: "full'", t: 0.83, when: "two frames later" },
      { label: "release", t: 1.8, when: "released: the stream detaches" },
      { label: "after", t: 2.2, when: "gone: pilot + soot" },
    ],
    draw(g, t, st) {
      const K = gk();
      const pxm = st.pxm;
      for (let fi = 0; fi < FLAMERS.length; fi++) {
        const f = FLAMERS[fi]!;
        const ox = f.x + 0.5;
        const tan = Math.tan(f.half);
        const fl = fireFlicker(t, fi * 1.7);
        const lightA = t <= FS_ON ? Math.min(1, t / (f.jet ? 0.45 : 0.3)) ** 2 : Math.max(0, 1 - (t - FS_ON) / 0.15); // it comes up as the stream reaches the end
        if (on(st, "light") && lightA > 0) {
          const c = f.jet ? K.cone6 : K.cone3;
          const wM = c.width / 24;
          sprite(g, c, X(st, ox + wM / 2), Y(st, f.y), wM, pxm, 0, 0.34 * lightA * (0.85 + 0.15 * fl), true, c.height / 24);
        }
        if (on(st, "smoke"))
          for (let j = 0; j < 4; j++) {
            const born = 0.4 + j * 0.3 + hash(j * 5 + fi) * 0.1;
            if (born > FS_ON) continue;
            const u = (t - born) / 1.1;
            if (u < 0 || u > 1) continue;
            const sx = ox + f.range * 0.85 + WIND[0] * u * 1.2;
            const sy = f.y + (hash(j * 7 + fi) - 0.5) * f.range * tan + WIND[1] * u * 1.2 - u * 0.4;
            sprite(g, soot(1 + (j & 1), j), X(st, sx), Y(st, sy), 0.4 + u * 1.0, pxm, j + u, 0.45 * (1 - u) * Math.min(1, u * 6));
          }
        if (on(st, "flame")) {
          const rate = (f.jet ? 40 : 50) / (st.low ? 2 : 1);
          const fly = f.jet ? 0.45 : 0.3;
          const v = f.range / fly;
          const k0 = Math.max(0, Math.floor((t - fly) * rate));
          const k1 = Math.floor(Math.min(t, FS_ON) * rate);
          for (let k = k0; k <= k1; k++) {
            const tb = k / rate;
            const a = t - tb;
            if (a < 0 || a > fly) continue;
            const d = v * a;
            const u = d / f.range;
            const ign = f.jet ? 0.4 : 0.05; // FS1's liquid fuel lights 0.4 m out; gas lights at the nozzle
            if (d < ign) continue;
            const sway = f.jet ? Math.sin(tb * 7.3) * 0.35 : 0;
            const lat = (sway + (hash(k * 13 + fi * 7 + st.seed) - 0.5) * (f.jet ? 0.7 : 1.6)) * d * tan;
            const coneW = 2 * d * tan;
            let w = f.jet ? Math.max(0.22, coneW * 0.75 + u * u * 0.6) : Math.max(0.2, coneW * 0.45);
            let h = w * (f.jet ? 1.6 : 1.3);
            // the bright part never passes the reach or the cone
            if (d + h * 0.45 > f.range) h = Math.max(0, (f.range - d) / 0.45);
            const side = Math.abs(lat) + w * 0.35 - d * tan;
            if (side > 0) w = Math.max(0, w - side / 0.35);
            if (h < 0.06 || w < 0.05) continue;
            let tex: HTMLCanvasElement;
            if (!f.jet && u < 0.28) tex = K.A.torch[k & 3] as HTMLCanvasElement;
            else tex = flame(f.jet ? (u < 0.25 ? 0 : u < 0.5 ? 1 : u < 0.75 ? 2 : u < 0.9 ? 3 : 4) : 1 + Math.floor(u * 4), k);
            const alpha = (f.jet ? 0.62 : 0.55) * (1 - Math.max(0, u - 0.8) * 2.5) * Math.min(1, (d - ign) / 0.3 + 0.3);
            sprite(g, tex, X(st, ox + d), Y(st, f.y + lat), w, pxm, Math.PI / 2 + (hash(k * 3) - 0.5) * 0.3, alpha, true, h);
          }
        }
        if (on(st, "pilot")) {
          const tex = f.jet ? flame(1, Math.floor(t * 12)) : (K.A.torch[Math.floor(t * 12) & 3] as HTMLCanvasElement);
          sprite(g, tex, X(st, ox + 0.08), Y(st, f.y), 0.12, pxm, Math.PI / 2 + Math.sin(t * 17 + fi) * 0.15, 0.85, true, 0.2);
        }
      }
    },
  };
}

/* ================================ BX-G: Bloater burst ================================ */
const BX_R = 2.5; // zombies.json bloater.explodes.blastRadiusM = gasRadiusM
const BX_GAS_S = 4; // gasS
const gasEnv = (t: number): number => (t < 0 ? 0 : t < 0.25 ? t / 0.25 : t < BX_GAS_S - 1 ? 1 : Math.max(0, (BX_GAS_S - t) / 1));
const BX_PLAN: ActionPlan = {
  goal: "It popped HERE (2.5 m blast), and this 2.5 m cloud slows you for 4 s: stay out until it clears.",
  timing: "zombies.json bloater.explodes: blast 2.5 m, 30 to players once; gas 2.5 m, 4 s, slows 30 % (+0.25 s linger). BX-G: flash 0.1 s, gas front reaches R in 0.1 s (= the blast reach), cloud holds, thins over the last 1 s.",
  lengthS: 4.2,
  lanes: {
    light: [{ t0: 0, t1: 0.1, label: "yellow-green flash: the pop", key: true }],
    core: [{ t0: 0, t1: 0.1, label: "gas front out to R = blast reach", key: true, nw: true }],
    matter: [
      { t0: 0, t1: 0.6, label: "12 bile drops fly, land as splats (inside R)" },
      { t0: 0.6, t1: 2.5, label: "3 cloth scraps flutter down" },
    ],
    smoke: [
      { t0: 0, t1: 3, label: "cloud holds: lit volume, rolled rim = its edge", nw: true },
      { t0: 3, t1: 4, label: "thins all over: clearing", nw: true },
    ],
    mark: [{ t0: 0.4, t1: 4, label: "splats, gone with the cloud" }],
    game: [
      { t0: 0, t1: 0.05, label: "30 damage", key: true },
      { t0: 0.05, t1: 4, label: "slows 30 %" },
    ],
  },
};
export function bxG(): Look {
  let bile: HTMLCanvasElement[] = [];
  let bileSh: HTMLCanvasElement;
  let scraps: HTMLCanvasElement[] = [];
  return {
    code: "BX-G",
    title: "One front: blast reach = gas zone",
    note: "Goal first: it popped here, and this cloud slows you until it clears. The blast and the gas have the same 2.5 m, so they are shown by one thing: the gas is thrown out to the edge in 0.1 s (the blast's reach) and stays there as the cloud's rolled rim (the zone). Both rings are cut (the shock ring was white = people); the cloud thins all over in its last second, so you see it clearing. Bile stays matte (BX-B's glow is not taken: the gas is the danger, not the bile).",
    goalFirst: {
      goal: "It popped <b>here</b> (30 damage to players inside <b>2.5 m</b>, once), and <b>this cloud</b> (2.5 m) slows you 30 % for <b>4 s</b>: stay out until it clears.",
      elements: [
        { name: "Flash", job: "the pop: short yellow-green burst (infection is the one fluid that glows), 0.1 s." },
        { name: "Gas front", job: "the blast's reach: puffs thrown out to R in 0.1 s. It becomes the cloud's rim: the same 2.5 m, so one element tells both." },
        { name: "Cloud body", job: "the zone: one lit volume (upper-left key light), dense to the rim, whose own rolled rim is the edge. Replaces the gas edge ring." },
        { name: "Clearing", job: "how long: the whole cloud thins in its last second (not from the edge in, which would lie about where it slows)." },
        { name: "Bile drops → splats", job: "messy, it was a body: drops fly with shadows and land inside R; splats leave with the cloud." },
        { name: "Cloth scraps (3)", job: "it was a person: the Bloater's clothes flutter down." },
        { name: "Cut: shock ring, gas ring", job: "white means people; the gas front and the rim carry both reads." },
      ],
      composition: [
        "Brightness: flash > nothing else glows. Bile, scraps and gas are matter, lit from the upper left.",
        "The gas front stops on R and never passes it while the zone is live; bile lands inside R.",
        "One clock: pop (0–0.1 s), matter lands (to 0.6 s), cloud holds, clears in the last 1 s together with the splats.",
        "Draw order: splats under the cloud, flying drops and scraps over it.",
      ],
      plan: BX_PLAN,
    },
    async bake() {
      gameAtlases();
      gk();
      if (!bile.length) {
        bile = G.bile().map((b, i) => relitFrame(b, 64, 31 + i, 64 * 0.7));
        bileSh = shadowOf(bile[2] as HTMLCanvasElement, 2, 0.55);
        scraps = [0x8f8a78, 0x4a4f58, 0x3c5d5e].map((c, i) => {
          const s = G.scrap();
          const t = document.createElement("canvas");
          t.width = s.width;
          t.height = s.height;
          const tg = t.getContext("2d")!;
          tg.drawImage(s, 0, 0);
          tg.globalCompositeOperation = "multiply";
          tg.fillStyle = `#${c.toString(16).padStart(6, "0")}`;
          tg.fillRect(0, 0, t.width, t.height);
          tg.globalCompositeOperation = "destination-in";
          tg.drawImage(s, 0, 0);
          return relitFrame(t, 40, 41 + i, 40 * 0.8);
        });
      }
    },
    textures: () => {
      const K = gk();
      return [
        { name: "gas body (rim = edge)", canvas: K.gasBody },
        { name: "A gas puffs (shared)", canvas: gas(0, 0) },
        { name: "A gas flash (shared)", canvas: K.A.flashGas, note: "ADD" },
        { name: "bile relit ×4", canvas: bile[0] as HTMLCanvasElement },
        { name: "bile shadow", canvas: bileSh },
        { name: "scrap relit ×3", canvas: scraps[0] as HTMLCanvasElement },
      ];
    },
    parts: [
      { id: "flash", label: "Flash" },
      { id: "front", label: "Gas front / rim" },
      { id: "smoke", label: "Cloud body" },
      { id: "matter", label: "Bile drops, splats" },
      { id: "scrap", label: "Cloth scraps" },
    ],
    frames: [
      { label: "pop", t: 0.03, when: "the pop: flash, front leaving" },
      { label: "reach", t: 0.1, when: "the front reaches 2.5 m" },
      { label: "fly", t: 0.3, when: "drops flying" },
      { label: "land", t: 0.8, when: "splats down, cloud holding" },
      { label: "hold", t: 2.5, when: "the zone holds" },
      { label: "clear", t: 3.6, when: "clearing (last 1 s)" },
    ],
    draw(g, t, st) {
      const K = gk();
      const pxm = st.pxm;
      const R = BX_R;
      const env = gasEnv(t);
      const nd = st.low ? 6 : 12;
      // splats (under the cloud)
      if (on(st, "matter"))
        for (let k = 0; k < nd; k++) {
          const tl = 0.3 + 0.3 * hash(k * 5 + 1);
          if (t < tl) continue;
          const ang = hash(k * 7 + st.seed) * Math.PI * 2;
          const d = R * (0.3 + 0.6 * hash(k * 11 + 3));
          const s = 0.45 + 0.3 * hash(k * 13);
          sprite(g, bile[k & 3] as HTMLCanvasElement, X(st, Math.cos(ang) * d), Y(st, Math.sin(ang) * d), s, pxm, ang, 0.9 * Math.min(1, gasEnv(Math.max(0.3, t)) + (t < 1 ? 1 : 0)), false, s * 0.8);
        }
      if (on(st, "smoke") && env > 0) {
        sprite(g, K.gasBody, st.cx, st.cy, (2 * R) / EDGE, pxm, t * 0.04 + st.seed, 0.7 * env * Math.min(1, t / 0.12));
      }
      if (on(st, "front") && env > 0) {
        const n = st.low ? 8 : 16;
        const out = easeOut(t / 0.1);
        for (let k = 0; k < n; k++) {
          const ang = (k / n) * Math.PI * 2 + hash(k * 17 + st.seed) * 0.3 + t * 0.05;
          const size = (0.9 + 0.4 * hash(k * 19)) * (0.55 + 0.45 * out) * (1 + 0.04 * Math.sin(t * 1.3 + k));
          const d = Math.max(0, R - size * 0.45) * out;
          sprite(g, gas(t < 0.3 ? 0 : 1, k), X(st, Math.cos(ang) * d), Y(st, Math.sin(ang) * d), size, pxm, k + t * 0.1, 0.5 * env);
        }
      }
      if (on(st, "flash") && t < 0.1) sprite(g, K.A.flashGas, st.cx, st.cy, R * 1.5, pxm, 0.3, (1 - t / 0.1) ** 2, true);
      if (on(st, "matter"))
        for (let k = 0; k < nd; k++) {
          const tl = 0.3 + 0.3 * hash(k * 5 + 1);
          if (t >= tl) continue;
          const ang = hash(k * 7 + st.seed) * Math.PI * 2;
          const land = R * (0.3 + 0.6 * hash(k * 11 + 3));
          const u = t / tl;
          const d = land * easeOut(u);
          const z = 4 * 0.6 * u * (1 - u);
          const x = Math.cos(ang) * d;
          const y = Math.sin(ang) * d;
          sprite(g, bileSh, X(st, x + z * 0.35), Y(st, y + z * 0.45), 0.22, pxm, ang, 0.4);
          sprite(g, bile[2] as HTMLCanvasElement, X(st, x), Y(st, y - z * 0.15), 0.26 * (1 + z * 0.3), pxm, ang, 0.95, false, 0.18 * (1 + z * 0.3));
        }
      if (on(st, "scrap"))
        for (let k = 0; k < (st.low ? 2 : 3); k++) {
          const tl = 1.5 + hash(k * 3 + 7) * 1.0;
          const u = Math.min(1, t / tl);
          const ang = hash(k * 23 + st.seed) * Math.PI * 2;
          const d = R * (0.4 + 0.4 * hash(k * 29)) * easeOut(Math.min(1, u * 3));
          const z = u < 1 ? 1.2 * (1 - u) * Math.min(1, u * 8) : 0;
          const x = Math.cos(ang) * d + Math.sin(t * 5 + k) * 0.15 * z;
          const y = Math.sin(ang) * d;
          const rot = k + t * (u < 1 ? 3 : 0) + (u >= 1 ? tl * 3 : 0);
          const a = t < BX_GAS_S - 1 ? 1 : env;
          if (z > 0) sprite(g, bileSh, X(st, x + z * 0.35), Y(st, y + z * 0.45), 0.3, pxm, rot, 0.3 * a);
          sprite(g, scraps[k] as HTMLCanvasElement, X(st, x), Y(st, y - z * 0.15), 0.32, pxm, rot, a);
        }
      void WIND_ANG;
      void rng;
    },
  };
}
