/**
 * The Behemoth's warnings, goal first (-G takes; dead-city-model fx.md › FX 4, designer 2026-11-26: "picking a goal …
 * and then think of elements needed, and then how they compose with each other to attend the goal").
 *
 * Each -G was reasoned BEFORE drawing, in this order (the same text is on the page, `goalFirst`):
 *   goal (what the player must read, with the game's numbers) → elements (one job each, or cut) → composition (where
 *   each may and may not be, brightness order, one clock, what may cross an edge) → its own timeline.
 *
 * One language across the family (so the six warnings read as one system, not six pictures):
 *  - DANGER is a red EDGE of light exactly on the game's boundary (4.5 m slam, 3 m throw, the lane's 4.8 m sides) and
 *    a faint red wash inside it. Nothing bright is drawn outside the edge (only its 0.25 m bloom).
 *  - THE CLOCK is the edge itself: it is there dim from the first frame (where), and lights up like a dial from the
 *    boss's side (slam: clockwise from the top; lane: from the body to the end) until it is fully lit on the hit (when).
 *    A hot head marks the dial's "now". No second clock (today's ticks, white closing ring, chevrons are cut).
 *  - THE HEART: the wash pulses on the Behemoth's own racing heartbeat (Story 9.15 `BOSS_ANIM.beat.slamRacing` /
 *    `chargeRacing`), each beat stronger than the last (tells first: it only builds).
 *  - RELEASE TOGETHER: on the hit everything flares for `BOSS_ANIM.glow.flashS` (0.15 s, the boss's own flash), then the
 *    light dies first (the game's 0.3 s fade); dust and bits follow; the mark stays.
 *  - YOUR WINDOW is amber (CRASH): it lasts the whole 2 s stun and is drawn above the body.
 *  - Story 9.15's boss dust (`bossDust.ts › BOSS_DUST`: the fists, the rush trail, the crash, the landing) is the boss's
 *    own; the -G takes don't add a second burst on top. It is sketched in as context (not counted).
 */
import { make, idle, clamp01, ramp, easeOut, sprite, countSprite, type Look, type Stage, type ActionPlan } from "./kit";
import BOSS from "../../../../packages/shared/src/config/balance/boss.json";
import { BOSS_ANIM } from "../../../../apps/client/src/render/bossAnim";
import { BOSS_DUST, dustHash } from "../../../../apps/client/src/render/bossDust";
import { slamFrameIndex, warningPoseIndex } from "../../../../apps/client/src/render/bossTelegraph";
import { hudFlicker, HUD_ART_SCALE } from "../../../../apps/client/src/render/city/hudWarnArt";
import { fbm } from "./telegraphs-art";
import { edgeArc, washArc, edgeLine, laneWash, blitG, drawDial, wordShade, wordGlow, dustFilm, type GSeg } from "./telegraphs-g-art";
import { boot, boss, show, sh, X, Y, sharedArt, shared, chunkTex, craterTex, gdRelit, debris, clBake, clArt, p1Bake, p1Art, p1Survivor, lockGeom, lockP } from "./telegraphs";

/* ---------------- The game's numbers (boss.json, bossTelegraph.ts, bossAnim.ts) ---------------- */
const BODY_R = BOSS.radiusM; // 2
const SLAM_R = BOSS.slam.radiusM; // 4.5
const SLAM_T = BOSS.slam.telegraphS; // 1.2
const FADE = 0.3; // bossTelegraph.ts › TELEGRAPH_FADE_S
const SLAM_HIT_S = 0.5; // BossView SLAM_HIT_S
const FLASH = BOSS_ANIM.glow.flashS; // 0.15
const CHARGE_T = BOSS.charge.telegraphS; // 1.0
const RUSH_V = BOSS.charge.speedMps; // 12
const LANE_W = BOSS.charge.laneWidthM; // 4.8
const STUN_S = BOSS.charge.stunS; // 2
const LIFT_S = BOSS.throw.liftS; // 1.0
const FLIGHT_S = BOSS.throw.flightS; // 0.8
const THROW_R = BOSS.throw.radiusM; // 3
const THROW_LEN = LIFT_S + FLIGHT_S;
const CHUNK_M = 1.3; // BOSS_CHUNK_M
const CRATER_M = 3.2; // BOSS_CRATER_M
const CHUNK_ARC_M = 3; // bossTelegraph CHUNK_ARC_M
const CRACK_SIDE_M = 9; // the crack decal: 2 × 256 / (2 × 28.4 px/m)
const SLAM_BEATS = BOSS_ANIM.beat.slamRacing.map((f) => f * SLAM_T); // 0, 0.55, 0.9, 1.1 s
const CHARGE_BEATS = BOSS_ANIM.beat.chargeRacing.map((f) => f * CHARGE_T); // 0, 0.4, 0.7, 0.9 s
const BEAT_FALL = BOSS_ANIM.beat.eyeFallS; // 0.25
const STUN_PERIOD = BOSS_ANIM.breath.stunPeriodS; // 1.0
const DIAL_N = 24; // the edge's pieces (15° each)

/** The heart through a warning: each beat peaks then falls in 0.25 s; later beats are stronger (it only builds). */
function heart(t: number, beats: readonly number[], len: number): number {
  let v = 0;
  for (const b of beats) {
    if (t < b) break;
    v = Math.max(v, Math.max(0, 1 - (t - b) / BEAT_FALL) * (0.45 + 0.55 * (b / len)));
  }
  return v;
}
/** The release: 1 at the hit, 0 after the boss's 0.15 s flash. */
const release = (t: number, at: number): number => (t >= at ? 1 - ramp(t, at, at + FLASH) : 0);

/* ---------------- Context: Story 9.15's own boss dust (not this take's; not counted) ---------------- */
function puff(g: CanvasRenderingContext2D, st: Stage, xm: number, ym: number, r: number, age: number, life: number, i: number): void {
  if (age < 0 || age >= life || st.only !== null) return;
  const k = age / life;
  const tex = shared!.dust[i % 3] as HTMLCanvasElement;
  const d = 2 * r * (1 + BOSS_DUST.grow * k) * st.pxm;
  g.save();
  g.globalAlpha = BOSS_DUST.alpha * (1 - k);
  g.drawImage(tex, X(st, xm) - d / 2, Y(st, ym) - d / 2, d, d);
  g.restore();
}
function ctxBurst(g: CanvasRenderingContext2D, st: Stage, b: { n: number; speed: number; r: number; lifeS: number }, xm: number, ym: number, since: number, seed: number): void {
  if (since < 0 || since > b.lifeS + BOSS_DUST.jitterS) return;
  for (let i = 0; i < b.n; i++) {
    const age = since - dustHash(seed + i, 1) * BOSS_DUST.jitterS;
    const a = dustHash(seed + i, 2) * Math.PI * 2;
    const v = b.speed * (0.6 + 0.4 * dustHash(seed + i, 3));
    puff(g, st, xm + Math.cos(a) * v * Math.max(0, age), ym + Math.sin(a) * v * Math.max(0, age), b.r, age, b.lifeS, i);
  }
}

/* ---------------- Baked art ---------------- */
interface GArt {
  slamEdge: GSeg;
  slamWash: GSeg;
  throwEdge: GSeg;
  throwWash: GSeg;
  stunDial: GSeg;
  laneEdge: GSeg;
  laneWash: GSeg;
  chunk: HTMLCanvasElement;
  crater: HTMLCanvasElement;
  reveal: HTMLCanvasElement[];
  film: HTMLCanvasElement;
  filmSmall: HTMLCanvasElement;
  word: HTMLCanvasElement;
  wordShade: HTMLCanvasElement;
  headPool: HTMLCanvasElement;
}
let G: GArt | null = null;
async function gBake(): Promise<GArt> {
  boot();
  await sharedArt();
  if (G) return G;
  const RED = { hot: "255,236,222", bloom: "255,44,30" };
  const slamEdge = edgeArc(SLAM_R, (Math.PI * 2) / DIAL_N, { inM: 0.5, outM: 0.25, core: 0.08, pxm: 40, seed: 211, ...RED });
  const slamWash = washArc(BODY_R - 0.1, SLAM_R, { a0: 0.04, a1: 0.42, pxm: 20, seed: 213, col: "255,40,28" });
  const throwEdge = edgeArc(THROW_R, (Math.PI * 2) / DIAL_N, { inM: 0.42, outM: 0.22, core: 0.07, pxm: 44, seed: 217, ...RED });
  const throwWash = washArc(0, THROW_R, { a0: 0.1, a1: 0.42, pxm: 20, seed: 219, col: "255,40,28" });
  const stunDial = edgeArc(BODY_R + 0.55, (Math.PI * 2) / DIAL_N, { inM: 0.3, outM: 0.22, core: 0.09, pxm: 48, seed: 223, hot: "255,240,206", bloom: "255,150,30" });
  const laneEdge = edgeLine(14, 0.6, 24, 227, RED.hot, RED.bloom);
  const lw = laneWash(14, LANE_W, 12, 229);
  await idle();
  // GD-G's mark, revealed in three pictures over the boss's 0.15 s flash (40 %, 75 %, all), shared by SD-G
  const full = gdRelit();
  const n = full.width;
  const reveal = [0.4, 0.75].map((r) => {
    const c = make(n, n);
    const g = c.getContext("2d", { willReadFrequently: true })!;
    g.drawImage(full, 0, 0);
    const img = g.getImageData(0, 0, n, n);
    for (let y = 0; y < n; y++)
      for (let x = 0; x < n; x++) {
        const u = x / n - 0.5;
        const v = y / n - 0.5;
        const d = Math.hypot(u, v) * 2 + (fbm(u * 5, v * 5, 231) - 0.5) * 0.35;
        const j = (y * n + x) * 4;
        img.data[j + 3] = Math.round((img.data[j + 3] as number) * clamp01((r - d) / 0.08));
      }
    g.putImageData(img, 0, 0);
    return c;
  });
  reveal.push(full);
  await idle();
  const headPool = make(64, 64);
  {
    const g = headPool.getContext("2d")!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,90,60,0.7)");
    gr.addColorStop(0.4, "rgba(255,44,30,0.25)");
    gr.addColorStop(1, "rgba(255,44,30,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  G = {
    slamEdge,
    slamWash,
    throwEdge,
    throwWash,
    stunDial,
    laneEdge,
    laneWash: lw,
    chunk: chunkTex(0, 112),
    crater: craterTex(160, 0.9, 237),
    reveal,
    film: dustFilm(192, 241),
    filmSmall: dustFilm(96, 243),
    word: wordGlow("CRASH", 1.07, 48),
    wordShade: wordShade("CRASH", 1.07, 48),
    headPool,
  };
  await idle();
  return G;
}

/** A zone's wash: 8 pieces of 45° round (cx, cy) px. */
function wash(g: CanvasRenderingContext2D, s: GSeg, cx: number, cy: number, pxm: number, a: number): void {
  for (let k = 0; k < 8; k++) blitG(g, s, cx, cy, (k * Math.PI) / 4, pxm, a, true);
}
/** The dial's head: the point being lit now (a hot core and a small pool on the asphalt). */
function head(g: CanvasRenderingContext2D, st: Stage, xm: number, ym: number, R: number, p: number, a: number): void {
  const ang = -Math.PI / 2 + p * Math.PI * 2;
  const x = X(st, xm + Math.cos(ang) * R);
  const y = Y(st, ym + Math.sin(ang) * R);
  sprite(g, G!.headPool, x, y, 1.3, st.pxm, 0, 0.8 * a, true);
  sprite(g, shared!.headHot, x, y, 0.42, st.pxm, 0, a, true);
}
/** The dust that rolls out from the cause and STOPS at the reach (its outer puffs end on R), then settles. */
function reachDust(g: CanvasRenderingContext2D, st: Stage, xm: number, ym: number, since: number, r0: number, R: number, n: number, seed: number): void {
  const life = 1.2;
  if (since < 0 || since > life) return;
  const art = shared!;
  const roll = easeOut(clamp01(since / 0.35));
  const fade = ramp(since, 0, 0.05) * (1 - ramp(since, 0.35, life));
  const m = st.low ? Math.ceil(n / 2) : n;
  for (let i = 0; i < m; i++) {
    const a = (i / m) * Math.PI * 2 + sh(i + seed, 1) * 0.4;
    const sz = 0.9 + sh(i + seed, 2) * 0.4; // puff diameter (m): its outer half ends on R
    const d = r0 + (R - sz * 0.42 - r0) * roll;
    sprite(g, art.dust[i % 3] as HTMLCanvasElement, X(st, xm + Math.cos(a) * d), Y(st, ym + Math.sin(a) * d), sz * (0.8 + 0.2 * roll), st.pxm, a, 0.5 * fade);
  }
}

/* ======================================================================================
 * SD-G
 * ====================================================================================== */
const sdP = (t: number): number => clamp01(t / SLAM_T);
const sdA = (t: number): number => (t <= SLAM_T ? 1 : Math.max(0, 1 - (t - SLAM_T) / FADE));
function sdPose(t: number): string {
  if (t < SLAM_T) return ["slam_a", "slam_b", "slam_c"][slamFrameIndex(sdP(t))] as string;
  if (t < SLAM_T + SLAM_HIT_S) return "slamhit_a";
  return "walk_a";
}
const sdPlan: ActionPlan = {
  goal: "Get out of the 4.5 m circle in 1.2 s: the edge says where the safe side starts, the edge lighting round says how long is left, and the hit says it happened.",
  timing: "boss.json › slam: telegraphS 1.2, radiusM 4.5, damage 40, pushM 2, recoverS 0.8; TELEGRAPH_FADE_S 0.3; Story 9.15: racing heart at 0 / 0.55 / 0.9 / 1.1 s, flash 0.15 s, slam_a/b/c by progress, slamHit 0.5 s.",
  lengthS: 2.2,
  lanes: {
    light: [
      { t0: 0, t1: 1.2, label: "edge at 35 %, lit round like a dial to 100 %", nw: true },
      { t0: 1.2, t1: 1.35, label: "flash 0.15", key: true },
      { t0: 1.35, t1: 1.5, label: "out (0.3 s)" },
    ],
    core: [
      { t0: 0, t1: 0.25, label: "♥", nw: true },
      { t0: 0.55, t1: 0.8, label: "♥", nw: true },
      { t0: 0.9, t1: 1.1, label: "♥", nw: true },
      { t0: 1.1, t1: 1.2, label: "♥", nw: true },
      { t0: 1.2, t1: 1.35, label: "wash flash", key: true },
    ],
    smoke: [
      { t0: 1.2, t1: 1.7, label: "9.15 fist dust (context)" },
      { t0: 1.23, t1: 2.2, label: "dust rolls to 4.5 m, stops, settles", nw: true },
    ],
    mark: [{ t0: 1.2, t1: 2.2, label: "cracks run out in 0.15 s (GD-G), stay", key: true }],
    game: [
      { t0: 0, t1: 1.2, label: "slam_a → b → c" },
      { t0: 1.2, t1: 1.7, label: "slamHit: 40 dmg, 2 m push", key: true },
      { t0: 1.7, t1: 2.2, label: "recover" },
    ],
  },
};
const sdG: Look = {
  code: "SD-G",
  title: "One edge that is also the clock",
  note: "Goal first: where (the edge), how long (the edge itself lights round like a dial), it happened (one flash). The ring is a single red edge of light exactly at 4.5 m, there dim from the first frame and lit clockwise from the top in 1.2 s, with a hot head at the dial's \"now\". Inside, a faint red wash pulses on the Behemoth's own racing heartbeat (9.15), each beat stronger. Today's ticks and amber sparks are cut (a second clock, and amber means your window). On the hit everything flashes for the boss's 0.15 s, the light dies in 0.3 s, dust rolls out to exactly 4.5 m and stops there, and the cracks run out. Closest to SD-A in material (light on asphalt), but one element now does the ring's three jobs.",
  bake: async () => {
    await gBake();
  },
  goalFirst: {
    goal: "Get out of this 4.5 m circle within 1.2 s, or take 40 and a 2 m push (boss.json › slam).",
    elements: [
      { name: "The red edge at 4.5 m", job: "WHERE: the one boundary; outside it you are safe. Dim (35 %) from the first frame so the circle is known at once." },
      { name: "The edge lit round (dial) + its hot head", job: "WHEN: the edge lights clockwise from the top over the 1.2 s; fully lit = the hit. The head marks \"now\" so the dial reads as moving." },
      { name: "Faint red wash inside (2 → 4.5 m)", job: "INSIDE = DANGER for whoever stands in it; it pulses on the boss's racing heart (0 / 0.55 / 0.9 / 1.1 s), each beat stronger: soon." },
      { name: "The flash (0.15 s)", job: "IT HAPPENED: edge and wash peak with the boss's own 0.15 s flash, then the light dies first (0.3 s)." },
      { name: "Dust that stops at 4.5 m", job: "HOW FAR IT REACHED: it rolls out from the body and stops on the edge, after the light is gone." },
      { name: "Cracks (GD-G)", job: "THE MARK: it really hit; they reach the same 4.5 m." },
      { name: "Cut: 72 ticks, amber sparks, debris", job: "Ticks were a second clock; the sparks were amber/yellow (amber = your window) and drifted across the edge; 9.15's grit already throws the bits." },
    ],
    composition: [
      "Nothing bright outside 4.5 m: only the edge's 0.25 m bloom crosses it. Dust may cross nothing either: it stops on the edge.",
      "Nothing inside 2 m (the body covers it); the body is drawn above the light so the slam pose carries the read (tells first).",
      "Brightness: head > lit edge > unlit edge > wash. All red; no amber, no white except the hot cores.",
      "One clock: the dial = the server's telegraph progress; the wash beats = BossAnim's racing heart (the same shares of 1.2 s); the flash = BossAnim's flashS.",
      "Release together: flash, slamHit pose, 9.15's fist dust and the cracks all start on the hit tick; the reach dust follows 0.03 s later.",
    ],
    plan: sdPlan,
  },
  draw(g, t, st) {
    const a = G!;
    const p = sdP(t);
    const al = sdA(t);
    const rel = release(t, SLAM_T);
    const since = t - SLAM_T;
    if (since >= 0 && show(st, "mark")) sprite(g, a.reveal[since < 0.05 ? 0 : since < 0.1 ? 1 : 2] as HTMLCanvasElement, st.cx, st.cy, CRACK_SIDE_M, st.pxm, 0.6, 0.95);
    if (show(st, "dust")) reachDust(g, st, 0, 0, since - 0.03, BODY_R, SLAM_R, 16, 7);
    if (al > 0) {
      if (show(st, "wash")) wash(g, a.slamWash, st.cx, st.cy, st.pxm, al * (0.3 + 0.25 * p + 0.45 * heart(t, SLAM_BEATS, SLAM_T)) + 0.6 * rel);
      if (show(st, "edge")) drawDial(g, a.slamEdge, DIAL_N, st.cx, st.cy, st.pxm, 0.2 * al + 0.75 * rel, al + 0.5 * rel, t >= SLAM_T ? 1 : p);
      if (show(st, "head") && p < 1) head(g, st, 0, 0, SLAM_R, p, al);
    }
    if (st.only === null) {
      boss(g, st, sdPose(t), 0); // above the light (BossView bodyTop): the pose carries the read
      const fx = BOSS_DUST.fistAhead * BODY_R;
      const fy = BOSS_DUST.fistSide * BODY_R;
      ctxBurst(g, st, BOSS_DUST.slamFists, fx, -fy, since, 11);
      ctxBurst(g, st, BOSS_DUST.slamFists, fx, fy, since, 41);
    }
  },
  textures: () => [
    { name: "edge piece ×24 (15°)", canvas: G!.slamEdge.tex, note: "ADD, the dial" },
    { name: "wash piece ×8 (45°)", canvas: G!.slamWash.tex, note: "ADD, 2 → 4.5 m" },
    { name: "head", canvas: shared!.headHot, note: "ADD 0.42 m" },
    { name: "head pool", canvas: G!.headPool, note: "ADD 1.3 m" },
    ...G!.reveal.map((c, i) => ({ name: `cracks ${["40 %", "75 %", "all"][i]} (GD-G)`, canvas: c, note: "9 m" })),
    ...shared!.dust.map((c, i) => ({ name: `dust ${i + 1}`, canvas: c })),
  ],
  parts: [
    { id: "edge", label: "Edge = dial" },
    { id: "head", label: "Dial head" },
    { id: "wash", label: "Wash + heart" },
    { id: "dust", label: "Dust to the reach" },
    { id: "mark", label: "Cracks" },
  ],
  frames: [
    { label: "start", t: 0.05, when: "slam_a, edge dim, ♥ 1" },
    { label: "⅓", t: 0.6, when: "slam_b, ♥ 2" },
    { label: "⅔", t: 0.95, when: "slam_c, ♥ 3" },
    { label: "hit", t: 1.2, when: "slamHit, flash, cracks 40 %" },
    { label: "+0.15", t: 1.36, when: "flash over, dust rolling" },
    { label: "settle", t: 1.9, when: "dust on the edge, light gone" },
  ],
};

/* ======================================================================================
 * TH-G
 * ====================================================================================== */
const TB = -5;
const TT = 4;
const thP = (t: number): number => clamp01(t / THROW_LEN);
const thA = (t: number): number => (t <= THROW_LEN ? 1 : Math.max(0, 1 - (t - THROW_LEN) / FADE));
function thPose(t: number): string {
  if (t < LIFT_S) return warningPoseIndex(t / LIFT_S) === 0 ? "throw_b" : "throw_a";
  return "walk_a"; // throw.ts: the chunk flies while the boss recovers (BossView: walk frame)
}
function chunkAt(t: number): { on: boolean; x: number; h: number; f: number } {
  if (t < LIFT_S || t > THROW_LEN) return { on: false, x: 0, h: 0, f: 0 };
  const f = (t - LIFT_S) / FLIGHT_S;
  return { on: true, f, x: TB + (TT - TB) * f, h: 4 * CHUNK_ARC_M * f * (1 - f) };
}
const thPlan: ActionPlan = {
  goal: "A 1.3 m slab lands inside this 3 m circle in 1.8 s: where (the edge), when (the edge lit round, then the slab's own shadow meeting it), it landed (one flash).",
  timing: "boss.json › throw: liftS 1.0, flightS 0.8, radiusM 3, damage 35; CHUNK_ARC_M 3; fade 0.3 s; Story 9.15: throw_b → throw_a by the lift, the beat on the release, walk frame in flight (recover), landing dust 12 × 0.5 s.",
  lengthS: 2.9,
  lanes: {
    light: [
      { t0: 0, t1: 1.8, label: "edge dim → lit round like a dial (1.8 s)", nw: true },
      { t0: 1.8, t1: 1.95, label: "flash", key: true },
      { t0: 1.95, t1: 2.1, label: "out" },
    ],
    core: [
      { t0: 0, t1: 1.0, label: "lift: throw_b → throw_a; wash low" },
      { t0: 1.0, t1: 1.25, label: "♥ release: wash steps up", key: true, nw: true },
      { t0: 1.25, t1: 1.8, label: "wash holds" },
    ],
    matter: [
      { t0: 1.0, t1: 1.8, label: "slab on its arc + its real shadow: they meet on the impact", nw: true },
      { t0: 1.8, t1: 2.3, label: "slab breaks: bits", nw: true },
    ],
    smoke: [
      { t0: 1.8, t1: 2.3, label: "9.15 landing dust (context)" },
      { t0: 1.83, t1: 3.0, label: "dust to 3 m, stops", nw: true },
    ],
    mark: [{ t0: 1.8, t1: 2.9, label: "crater stays", key: true }],
    game: [
      { t0: 0, t1: 1.0, label: "lift (TELEGRAPH)" },
      { t0: 1.0, t1: 1.8, label: "flight (boss recovers)" },
      { t0: 1.8, t1: 1.85, label: "impact: 35 dmg", key: true },
    ],
  },
};
const thG: Look = {
  code: "TH-G",
  title: "The edge counts down, the shadow lands",
  note: "Goal first. The circle is the same red edge as SD-G, exactly at 3 m, lit round like a dial over the whole 1.8 s (one language for both circle warnings). The white closing ring is cut: white means people and pick-ups, and it was a second clock. In flight the slab's own shadow (down-right of it, the street's light is upper left) slides in from the boss's side and sharpens as it falls; it meets the slab on the impact, exactly when the dial closes. That answers the open question: the shadow IS the clock in flight, but a real one, not TH-B's shadow parked on the target. The wash steps up on the release (the boss's beat). Impact: flash 0.15 s, the slab breaks into bits, dust stops at 3 m, the crater stays.",
  bake: async () => {
    await gBake();
  },
  goalFirst: {
    goal: "A 1.3 m slab of road lands inside this 3 m circle 1.8 s after the lift starts (1.0 s lift + 0.8 s flight): get out or take 35 (boss.json › throw).",
    elements: [
      { name: "The red edge at 3 m", job: "WHERE: the boundary of the landing zone, dim from the first frame." },
      { name: "The edge lit round (dial) + head", job: "WHEN, over the whole 1.8 s (the player in the ring may not be looking at the boss): full = impact. Same language as SD-G." },
      { name: "Faint red wash", job: "INSIDE = DANGER; low during the lift, steps up on the release beat: it is in the air now." },
      { name: "The slab (relit road chunk)", job: "WHAT: something real and heavy, torn from the street; its arc says it comes from the boss." },
      { name: "The slab's real shadow", job: "WHEN, in flight: it slides in from the boss's side, darker and sharper as the slab falls, and meets it on the impact (the dial closes at the same moment)." },
      { name: "Flash, bits, dust to 3 m", job: "IT LANDED and HOW FAR it hit: the flash with the impact, the slab breaks into bits (matter, shadows), dust stops on the 3 m edge." },
      { name: "Crater", job: "THE MARK (GD-G's style)." },
      { name: "Cut: hatching, white closing ring, TH-B's parked shadow", job: "Hatching had no job the wash doesn't do; white = people / pick-ups, and two clocks; a shadow waiting on the target isn't where a shadow would be." },
    ],
    composition: [
      "Light only inside the 3 m (the edge's bloom crosses by 0.22 m); the shadow and the slab may cross the edge (they come from outside).",
      "The shadow is matter (normal blend, dark), never light: it can't be confused with the red zone.",
      "Brightness: head > lit edge > unlit edge > wash. Red only.",
      "One clock: the dial = the attack's progress (start → impact tick); the shadow meets the slab on the same tick; the wash steps on the release beat (BossAnim).",
      "Release together: flash, bits, 9.15's landing dust and the crater on the impact; the reach dust 0.03 s after.",
    ],
    plan: thPlan,
  },
  draw(g, t, st) {
    const a = G!;
    const art = shared!;
    const p = thP(t);
    const al = thA(t);
    const rel = release(t, THROW_LEN);
    const since = t - THROW_LEN;
    const cx = X(st, TT);
    if (since >= 0 && show(st, "mark")) sprite(g, a.crater, cx, st.cy, CRATER_M, st.pxm, 0.4, ramp(since, 0, 0.04));
    if (show(st, "dust")) reachDust(g, st, TT, 0, since - 0.03, 0.6, THROW_R, 12, 17);
    if (show(st, "bits")) debris(g, st, art, TT, 0, since, 8, 2.0, 60);
    if (st.only === null) ctxBurst(g, st, BOSS_DUST.throwLanding, TT, 0, since, 71);
    if (al > 0) {
      const step = t >= LIFT_S ? 1 : 0;
      const beat = t >= LIFT_S ? Math.max(0, 1 - (t - LIFT_S) / BEAT_FALL) : 0;
      if (show(st, "wash")) wash(g, a.throwWash, cx, st.cy, st.pxm, al * (0.3 + 0.25 * step + 0.3 * beat) + 0.6 * rel);
      if (show(st, "edge")) drawDial(g, a.throwEdge, DIAL_N, cx, st.cy, st.pxm, 0.2 * al + 0.75 * rel, al + 0.5 * rel, t >= THROW_LEN ? 1 : p);
      if (show(st, "head") && p < 1) head(g, st, TT, 0, THROW_R, p, al);
    }
    // the pose the game shows (9.15): throw_b → throw_a through the lift, the walk frame while the slab flies (the card's
    // context body holds throw_a, chunk overhead, through the flight: drawn over here)
    if (st.only === null && t >= LIFT_S) boss(g, st, thPose(t), TB);
    const ch = chunkAt(t);
    if (ch.on) {
      if (show(st, "shadow")) {
        const k = 1 - ch.h / CHUNK_ARC_M; // 0 at the top of the arc, 1 on the ground
        const sx = X(st, ch.x + ch.h * 0.24);
        const sy = Y(st, ch.h * 0.32);
        const w = CHUNK_M * (1.05 + 0.25 * (1 - k));
        sprite(g, art.shadowSoft, sx, sy, w * 1.5, st.pxm, 0, 0.32 * (1 - k * 0.6));
        sprite(g, art.shadow, sx, sy, w * 0.95, st.pxm, 0, 0.15 + 0.6 * k * k);
      }
      if (show(st, "chunk")) sprite(g, a.chunk, X(st, ch.x), Y(st, -ch.h * 0.35), CHUNK_M * (1 + ch.h / 6), st.pxm, ch.f * 5);
    }
  },
  textures: () => [
    { name: "edge piece ×24 (15°)", canvas: G!.throwEdge.tex, note: "ADD, the dial" },
    { name: "wash piece ×8 (45°)", canvas: G!.throwWash.tex, note: "ADD, 0 → 3 m" },
    { name: "road slab, relit", canvas: G!.chunk, note: "1.3 m" },
    { name: "shadow, sharp", canvas: shared!.shadow },
    { name: "shadow, soft", canvas: shared!.shadowSoft },
    { name: "crater, relit", canvas: G!.crater, note: "3.2 m" },
    ...shared!.bits.map((c, i) => ({ name: `bit ${i + 1}`, canvas: c })),
  ],
  parts: [
    { id: "edge", label: "Edge = dial" },
    { id: "head", label: "Dial head" },
    { id: "wash", label: "Wash" },
    { id: "chunk", label: "Slab" },
    { id: "shadow", label: "Its shadow (flight clock)" },
    { id: "bits", label: "Bits" },
    { id: "dust", label: "Dust to the reach" },
    { id: "mark", label: "Crater" },
  ],
  frames: [
    { label: "lift", t: 0.4, when: "throw_b, dial ¼" },
    { label: "release", t: 1.02, when: "walk frame, ♥, slab leaves" },
    { label: "top", t: 1.4, when: "slab at 3 m, shadow soft and far" },
    { label: "falling", t: 1.65, when: "shadow sharp, nearly under it" },
    { label: "impact", t: 1.8, when: "they meet: flash, crater" },
    { label: "settle", t: 2.3, when: "dust on the edge" },
  ],
};

/* ======================================================================================
 * CL-G and CR-G (the lane; the crash)
 * ====================================================================================== */
interface Charge {
  bx: number;
  len: number;
  stop: number;
  crash: boolean;
}
const CL_C: Charge = { bx: -7, len: 10, stop: CHARGE_T + 10 / RUSH_V, crash: false };
const CR_C: Charge = { bx: -6, len: 6, stop: CHARGE_T + 6 / RUSH_V, crash: true };
const laneX0 = (c: Charge): number => c.bx - BODY_R;
const laneLen = (c: Charge): number => c.len + 2 * BODY_R;
const lnP = (t: number): number => clamp01(t / CHARGE_T);
const lnA = (c: Charge, t: number): number => (t <= c.stop ? 1 : Math.max(0, 1 - (t - c.stop) / FADE));
const bossX = (c: Charge, t: number): number => (t < CHARGE_T ? c.bx : c.bx + Math.min(c.len, (t - CHARGE_T) * RUSH_V));
function chargePose(c: Charge, t: number): string {
  if (t < CHARGE_T) return warningPoseIndex(lnP(t)) === 0 ? "charge_b" : "charge_a";
  if (t < c.stop) return "rush_a";
  if (c.crash && t < c.stop + STUN_S) return "stun_a";
  return "walk_a";
}
/** The lane, goal first: two red edges that light from the body to the end (the dial), the lit end line, a wash
 *  behind the front, a hot front; in the rush the light goes out behind the body's back. */
function laneG(g: CanvasRenderingContext2D, st: Stage, c: Charge, t: number): void {
  const a = G!;
  const al = lnA(c, t);
  if (al <= 0) return;
  const p = lnP(t);
  const L = laneLen(c);
  const x0 = X(st, laneX0(c));
  const rel = release(t, CHARGE_T);
  const u = L / 14; // the strips are 14 m long: crop to this lane
  // in the rush: the danger is only ahead of the body; behind its back the light goes out (0.6 m behind its back, 0.05 s after it passes)
  const back = t >= CHARGE_T ? clamp01((bossX(c, t) - BODY_R - 0.6 - laneX0(c)) / L) : 0;
  const lit = t >= CHARGE_T ? 1 : p;
  const hb = heart(t, CHARGE_BEATS, CHARGE_T);
  if (show(st, "wash")) blitG(g, a.laneWash, x0, st.cy, 0, st.pxm, al * (0.22 + 0.2 * hb) + 0.3 * rel, true, back * u, lit * u);
  if (show(st, "edges")) {
    for (const s of [-1, 1]) {
      const y = Y(st, (s * LANE_W) / 2);
      blitG(g, a.laneEdge, x0, y, 0, st.pxm, al + 0.5 * rel, true, back * u, lit * u); // lit
      if (lit < 1) blitG(g, a.laneEdge, x0, y, 0, st.pxm, 0.2 * al, true, lit * u, u); // not yet
    }
    // the far end: where it stops (lit when the front reaches it)
    blitG(g, a.laneEdge, x0 + L * st.pxm, Y(st, -LANE_W / 2), Math.PI / 2, st.pxm, (lit >= 1 ? al : 0.2 * al) + 0.5 * rel, true, 0, LANE_W / 14);
  }
  if (show(st, "front") && t < CHARGE_T) {
    const fx = x0 + L * p * st.pxm;
    blitG(g, a.laneEdge, fx, Y(st, -LANE_W / 2), Math.PI / 2, st.pxm, 0.95 * al, true, 0, LANE_W / 14);
    sprite(g, a.headPool, fx, Y(st, -LANE_W / 2), 1.1, st.pxm, 0, 0.8, true);
    sprite(g, a.headPool, fx, Y(st, LANE_W / 2), 1.1, st.pxm, 0, 0.8, true);
  }
}
/** Context: Story 9.15's rush trail (a puff every 1/26 s behind the body). Not counted. */
function ctxRush(g: CanvasRenderingContext2D, st: Stage, c: Charge, t: number): void {
  if (st.only !== null) return;
  const T = BOSS_DUST.rushTrail;
  const end = Math.min(t, c.stop);
  for (let i = 0; ; i++) {
    const born = CHARGE_T + i * T.everyS;
    if (born > end) break;
    const age = t - born;
    if (age > T.lifeS) continue;
    const back = T.backMin + (T.backMax - T.backMin) * dustHash(i, 4);
    const x = bossX(c, born) - T.behind * BODY_R - back * age;
    const y = (dustHash(i, 5) - 0.5) * T.across * BODY_R;
    puff(g, st, x, y, T.r0 + T.rSpread * dustHash(i, 6), age, T.lifeS, i);
  }
}
const clPlan: ActionPlan = {
  goal: "Step out sideways off this 4.8 m-wide line within 1 s; it then rushes the whole 14 m at 12 m/s.",
  timing: "boss.json › charge: telegraphS 1.0, speedMps 12, laneWidthM 4.8, distM 10 (lane 14 m with the body), damage 30, shove 2.5 m; fade 0.3 s; Story 9.15: charge_b → charge_a by progress, racing heart 0 / 0.4 / 0.7 / 0.9 s, rush glow, rush trail.",
  lengthS: 2.4,
  lanes: {
    light: [
      { t0: 0, t1: 1.0, label: "edges dim; lit from the body to the end (dial)", nw: true },
      { t0: 1.0, t1: 1.15, label: "flash: the rush", key: true },
      { t0: 1.15, t1: 1.83, label: "goes out behind the body", nw: true },
      { t0: 1.83, t1: 2.13, label: "out" },
    ],
    core: [
      { t0: 0, t1: 1.0, label: "hot front crosses the lane, runs to the end", nw: true },
      { t0: 0, t1: 0.25, label: "♥", nw: true },
      { t0: 0.4, t1: 0.65, label: "♥", nw: true },
      { t0: 0.7, t1: 0.9, label: "♥", nw: true },
    ],
    smoke: [{ t0: 1.0, t1: 2.4, label: "9.15 rush trail (context)" }],
    game: [
      { t0: 0, t1: 1.0, label: "charge_b → charge_a" },
      { t0: 1.0, t1: 1.83, label: "rush 12 m/s: 30 dmg, shove", key: true },
      { t0: 1.83, t1: 2.4, label: "recover" },
    ],
  },
};
const clG: Look = {
  code: "CL-G",
  title: "Two edges that fill like a fuse",
  note: "Goal first: you can't outrun it along the lane, so the read is the two SIDES (step across) and when it goes. The two 4.8 m sides are red edges of light, dim from the first frame, lit from the body to the far end over the 1 s like a fuse (the same dial as SD-G and TH-G), with a hot front across the lane and a faint wash behind it pulsing on the boss's racing heart. The end line lights when the front gets there: it stops here. Chevrons and hatching are cut (the front already gives the direction). New: in the rush the light goes out behind the body's back, so what's still lit is exactly where it will still pass. The rush dust is 9.15's (context). Closest to CL-A in material, but its sides are the clock and the lane empties behind the body.",
  bake: async () => {
    await gBake();
  },
  goalFirst: {
    goal: "Step sideways off this 4.8 m-wide, 14 m line within 1 s: then it rushes the whole lane at 12 m/s (30 damage, 2.5 m shove), faster than you can run along it.",
    elements: [
      { name: "Two red side edges (4.8 m apart)", job: "WHERE: the line you must step across, dim from the first frame." },
      { name: "The edges lit from the body to the end (fuse) + a hot front across the lane", job: "WHEN and WHICH WAY: fully lit to the end = it goes; the front runs the way it will run." },
      { name: "The end line", job: "HOW FAR: it stops here; lit when the front reaches it." },
      { name: "A faint red wash behind the front", job: "INSIDE = DANGER, pulsing on the boss's racing heart (0 / 0.4 / 0.7 / 0.9 s), stronger each beat." },
      { name: "Light going out behind the body (rush)", job: "WHERE IT STILL WILL BE: behind its back you are safe again." },
      { name: "Cut: hatching, chevrons, own rush dust", job: "Hatching = the wash's job; chevrons = the front's job; 9.15 already kicks the rush trail." },
    ],
    composition: [
      "Light only inside the lane (edge bloom 0.3 m); the body is drawn above the light (bodyTop), so the charge pose carries the read.",
      "Brightness: front > lit edges > end line > unlit edges > wash. Red only.",
      "One clock: the fuse = the charge's telegraph progress; the beats = BossAnim's charge racing heart; the flash = the rush start with the boss's steady rush glow.",
      "Release together: flash, rush pose and 9.15's trail on the rush tick.",
    ],
    plan: clPlan,
  },
  draw(g, t, st) {
    laneG(g, st, CL_C, t);
    if (st.only === null) {
      ctxRush(g, st, CL_C, t);
      boss(g, st, chargePose(CL_C, t), bossX(CL_C, t));
    }
  },
  textures: () => [
    { name: "edge strip", canvas: G!.laneEdge.tex, note: "ADD 14 × 0.6 m, cropped ×5" },
    { name: "lane wash", canvas: G!.laneWash.tex, note: "ADD 14 × 4.8 m at 12 px/m, cropped" },
    { name: "head pool", canvas: G!.headPool, note: "ADD 1.1 m ×2" },
  ],
  parts: [
    { id: "edges", label: "Side edges + end (fuse)" },
    { id: "front", label: "Hot front" },
    { id: "wash", label: "Wash + heart" },
  ],
  frames: [
    { label: "warning ¼", t: 0.25, when: "charge_b, fuse ¼" },
    { label: "warning ¾", t: 0.75, when: "charge_a, ♥ 2" },
    { label: "go", t: 1.0, when: "fuse full: flash, rush" },
    { label: "rush", t: 1.4, when: "light out behind it" },
    { label: "stop", t: 1.84, when: "at the end" },
    { label: "fade", t: 2.0, when: "out" },
  ],
};

/* CR-G */
const WALL_X = CR_C.bx + CR_C.len + BODY_R;
const crPlan: ActionPlan = {
  goal: "It crashed and is stunned for 2 s: hit it now (×1.5 damage). The crash is one release; then an amber window that lasts the whole stun and shows how much is left.",
  timing: "boss.json › charge: stunS 2, stunDamageMult 1.5; lane fade 0.3 s after the stop; Story 9.15: stun pose, eyes 0.3, glow out, stun breath 1.0 s, crash dust 16 × 0.6 s at 1.3 r.",
  lengthS: 3.9,
  lanes: {
    light: [
      { t0: 1.5, t1: 1.65, label: "amber flash at the wall", key: true, nw: true },
      { t0: 1.5, t1: 1.8, label: "red lane out (0.3 s)" },
      { t0: 1.5, t1: 3.5, label: "AMBER window: ring drains 2 s, CRASH above the body", key: true, nw: true },
    ],
    core: [
      { t0: 1.5, t1: 2.5, label: "amber breathes with the stun (1 s)", nw: true },
      { t0: 2.5, t1: 3.5, label: "amber breathes", nw: true },
    ],
    matter: [{ t0: 1.5, t1: 2.0, label: "concrete bits off the wall", nw: true }],
    smoke: [{ t0: 1.5, t1: 2.1, label: "9.15 crash dust (context)" }],
    mark: [{ t0: 1.5, t1: 3.9, label: "crack in the wall stays", nw: true }],
    game: [
      { t0: 0, t1: 1.0, label: "warning" },
      { t0: 1.0, t1: 1.5, label: "rush" },
      { t0: 1.5, t1: 3.5, label: "STUN 2 s, ×1.5 damage", key: true },
    ],
  },
};
const crG: Look = {
  code: "CR-G",
  title: "An amber window that drains for 2 s",
  note: "Goal first: the crash is good news, and the read is \"hit it now, for how long\". At the stop the red lane goes out (danger over), an amber flash hits the wall with the bits and 9.15's crash dust, the wall keeps a crack. Then the window: an amber ring of light round the body that drains over exactly the 2 s stun, and the word CRASH, horizontal, above the body (today it rotates with the lane and the body hides it). Both are drawn above the body and breathe with its dazed 1 s breath; the boss itself goes dim (9.15: eyes 30 %, glow out). Resolves the open question: amber for the whole stun, above the body.",
  bake: async () => {
    await gBake();
    await clBake();
  },
  goalFirst: {
    goal: "It crashed into a wall and is stunned for 2 s (boss.json › charge.stunS): hit it now, you deal ×1.5 (stunDamageMult).",
    elements: [
      { name: "Red lane going out at the stop", job: "DANGER OVER: the red hands over to amber (the game's 0.3 s fade)." },
      { name: "Amber flash at the wall (0.15 s) + concrete bits + wall crack", job: "IT CRASHED (the cause): the release, where it hit; the crack stays." },
      { name: "Amber ring round the body, draining over 2 s", job: "THE WINDOW and HOW LONG: full at the crash, empty exactly when the stun ends. Above the body, outside its 2 m so it never hides it." },
      { name: "CRASH, horizontal, above the body", job: "NAMES the window at a glance; readable whatever the lane's direction." },
      { name: "The boss dim (9.15)", job: "WEAK = DIM: eyes 30 %, glow out; the amber is the brightest thing on screen." },
      { name: "Cut: the amber bar across the lane end, own dust burst", job: "The bar marked the crash spot for 0.3 s only; the ring and the word do the window; 9.15 has the crash dust." },
    ],
    composition: [
      "Amber only during the stun, red only before it: never both bright at once (the red fades as the amber flashes in).",
      "The ring sits at 2.55 m (just outside the body), the word 0.6 m above the body's top; both drawn above the body.",
      "Brightness: CRASH > ring > flash (gone in 0.15 s). The dim boss under them.",
      "One clock: the ring drains on the stun's own 2 s; its breathing is the boss's stun breath (1.0 s).",
      "Release together: flash, bits, 9.15 dust, stun pose on the crash tick.",
    ],
    plan: crPlan,
  },
  draw(g, t, st) {
    const a = G!;
    const art = shared!;
    laneG(g, st, CR_C, t);
    if (st.only === null) {
      ctxRush(g, st, CR_C, t);
      boss(g, st, chargePose(CR_C, t), bossX(CR_C, t));
    }
    const d = t - CR_C.stop;
    const rel = release(t, CR_C.stop);
    const bx = bossX(CR_C, t);
    if (d >= 0 && show(st, "mark")) sprite(g, clArt!.wallCrack, X(st, WALL_X + 0.55), st.cy, 1, st.pxm, 0, 1, false, 6.5);
    if (show(st, "bits")) debris(g, st, art, WALL_X - 0.2, 0, d, 8, 2.2, 80);
    if (st.only === null) ctxBurst(g, st, BOSS_DUST.crash, bx + BOSS_DUST.crashAhead * BODY_R - 0.6, 0, d, 91);
    if (show(st, "flash") && rel > 0) sprite(g, art.poolAmber, X(st, WALL_X - 0.4), st.cy, 4.5, st.pxm, 0, 0.75 * rel, true);
    if (d >= 0 && d < STUN_S) {
      const left = 1 - d / STUN_S;
      const breath = 0.86 + 0.14 * Math.cos((d / STUN_PERIOD) * Math.PI * 2);
      const inA = ramp(d, 0, 0.06) * (1 - ramp(d, STUN_S - 0.12, STUN_S));
      if (show(st, "ring")) drawDial(g, a.stunDial, DIAL_N, X(st, bx), st.cy, st.pxm, 0, inA * breath, left);
      if (show(st, "word")) {
        const wy = Y(st, -BODY_R - 0.6);
        sprite(g, a.wordShade, X(st, bx), wy, 4.2, st.pxm, 0, inA);
        sprite(g, a.word, X(st, bx), wy, 4.2, st.pxm, 0, inA * (0.8 + 0.2 * breath) + 0.4 * rel, true);
      }
    }
  },
  textures: () => [
    { name: "amber ring piece ×24", canvas: G!.stunDial.tex, note: "ADD, r 2.55 m, drains" },
    { name: "CRASH (light)", canvas: G!.word, note: "ADD 4.2 × 1.8 m" },
    { name: "CRASH (shade)", canvas: G!.wordShade, note: "normal, under the light" },
    { name: "amber flash", canvas: shared!.poolAmber, note: "ADD 4.5 m, 0.15 s" },
    { name: "wall crack", canvas: clArt!.wallCrack, note: "normal, stays" },
    { name: "edge strip (lane)", canvas: G!.laneEdge.tex, note: "ADD" },
  ],
  parts: [
    { id: "edges", label: "Lane edges" },
    { id: "front", label: "Lane front" },
    { id: "wash", label: "Lane wash" },
    { id: "flash", label: "Amber flash" },
    { id: "bits", label: "Concrete bits" },
    { id: "mark", label: "Wall crack" },
    { id: "ring", label: "Amber window (drains)" },
    { id: "word", label: "CRASH" },
  ],
  frames: [
    { label: "rush", t: 1.25, when: "rush, lane out behind it" },
    { label: "crash", t: CR_C.stop, when: "flash, ring full" },
    { label: "+0.15", t: CR_C.stop + 0.15, when: "flash over" },
    { label: "+0.5", t: CR_C.stop + 0.5, when: "red out, ring ¾" },
    { label: "+1.5", t: CR_C.stop + 1.5, when: "ring ¼" },
    { label: "end", t: CR_C.stop + 2.0, when: "stun over: amber gone" },
  ],
};

/* ======================================================================================
 * P1-G
 * ====================================================================================== */
const SURV: [number, number] = [-3.6, 0.3];
const LOCK_R = 0.8;
const LOCK_CSS = 47;
const LOCK_LINE = 2 / LOCK_CSS;
const W0 = 0.6; // the slam warning shown from 0.6 s to 1.8 s (P1's card timeline)
const W1 = 1.8;
/** The display's level: the failing-display flicker only while it walks; during a warning steady, building 0.8 → 1. */
function p1Level(t: number): number {
  if (t >= W0 && t <= W1) return 0.8 + 0.2 * ((t - W0) / (W1 - W0));
  return hudFlicker(t);
}
const p1Plan: ActionPlan = {
  goal: "It's after YOU (the lock), it's over THERE (the panel), and it is about to SLAM in this long (the plate's bar, the brackets closing).",
  timing: "BossView LOCK_R_M 0.8, 47 CSS px/m; hudFlicker; chevrons 2 Hz; BossHud PANEL_SCALE 0.75; a slam warning 1.2 s, shown here from 0.6 s; flash 0.15 s (9.15).",
  lengthS: 2.4,
  lanes: {
    light: [
      { t0: 0, t1: 0.6, label: "flicker (failing display)" },
      { t0: 0.6, t1: 1.8, label: "steady, building 80 → 100 %", nw: true },
      { t0: 1.8, t1: 1.95, label: "flash", key: true, nw: true },
      { t0: 1.95, t1: 2.4, label: "flicker" },
    ],
    core: [
      { t0: 0, t1: 0.6, label: "brackets breathe" },
      { t0: 0.6, t1: 1.8, label: "brackets close; plate bar fills", key: true, nw: true },
      { t0: 1.8, t1: 2.4, label: "breathe" },
    ],
    game: [{ t0: 0.6, t1: 1.8, label: "SLAM plate shows", key: true }],
  },
};
function p1Lock(g: CanvasRenderingContext2D, st: Stage, t: number, lv: number, rel: number): void {
  const x = X(st, SURV[0]);
  const y = Y(st, SURV[1]);
  const pm = st.pxm;
  const { gap, len } = lockGeom(t);
  if (show(st, "lock")) {
    countSprite();
    g.save();
    g.lineCap = "butt";
    g.shadowColor = "rgba(255,40,30,0.9)";
    g.shadowBlur = 0.12 * pm;
    for (let pass = 0; pass < 2; pass++) {
      g.lineWidth = (pass === 0 ? LOCK_LINE * 4 : LOCK_LINE) * pm;
      g.strokeStyle = "#ff3b30";
      g.globalAlpha = Math.min(1, (pass === 0 ? 0.25 + 0.3 * rel : 1) * lv);
      g.beginPath();
      for (let c = 0; c < 4; c++) {
        const sx = c & 1 ? 1 : -1;
        const sy = c & 2 ? 1 : -1;
        const cx = x + sx * gap * pm;
        const cy = y + sy * gap * pm;
        g.moveTo(cx, cy);
        g.lineTo(cx - sx * len * pm, cy);
        g.moveTo(cx, cy);
        g.lineTo(cx, cy - sy * len * pm);
      }
      g.stroke();
    }
    g.lineWidth = LOCK_LINE * pm;
    g.globalAlpha = 0.7 * lv;
    g.beginPath();
    for (let i = 0; i < 24; i++) {
      if (i % 6 === 0) continue;
      const a = (i / 24) * Math.PI * 2 + t * 0.8;
      g.moveTo(x + Math.cos(a) * LOCK_R * 0.95 * pm, y + Math.sin(a) * LOCK_R * 0.95 * pm);
      g.lineTo(x + Math.cos(a) * LOCK_R * 1.08 * pm, y + Math.sin(a) * LOCK_R * 1.08 * pm);
    }
    g.stroke();
    g.restore();
  }
  if (show(st, "tag")) sprite(g, p1Art!.plates.tag, x, Y(st, SURV[1] - gap - LOCK_R * 0.65), 88 / LOCK_CSS, st.pxm, 0, lv, false, 44 / LOCK_CSS);
}
function p1Screen(g: CanvasRenderingContext2D, st: Stage, t: number, lv: number): void {
  const plates = p1Art!.plates;
  const s = st.pxm / LOCK_CSS;
  const pw = 144 * 0.75 * s;
  const ph = 64 * 0.75 * s;
  const x = st.w - 38 * s - pw / 2;
  const y = st.h * 0.4;
  if (show(st, "panel")) {
    countSprite();
    g.save();
    g.globalAlpha = lv;
    g.drawImage(plates.danger, x - pw / 2, y - ph / 2, pw, ph);
    g.restore();
    countSprite();
    g.save();
    g.strokeStyle = "#ff3b30";
    g.lineWidth = 3 * s;
    const edge = pw / 2 - 10 * s;
    for (let i = 0; i < 3; i++) {
      const ph2 = (t * 2 + i / 3) % 1;
      const cx = x + edge + (10 + i * 9) * s;
      const a = 9 * s;
      g.globalAlpha = (0.3 + 0.7 * (1 - Math.abs(ph2 - 0.5) * 2)) * lv;
      g.beginPath();
      g.moveTo(cx - 4 * s, y + a);
      g.lineTo(cx + 4 * s, y);
      g.lineTo(cx - 4 * s, y - a);
      g.stroke();
    }
    g.restore();
  }
  const lp = lockP(t);
  if (show(st, "plate") && lp > 0) {
    const lw = 174 * 0.75 * s;
    const lh = 60 * 0.75 * s;
    const px = x - (pw + lw) / 2 - 4 * s - lw / 2;
    countSprite();
    g.save();
    g.globalAlpha = lv;
    g.drawImage(plates.slam, px, y - lh / 2, lw, lh);
    g.restore();
    // the time left, under the plate: a thin red bar filling to the hit (the same progress as the brackets)
    if (show(st, "bar")) {
      countSprite(true);
      g.save();
      g.globalCompositeOperation = "lighter";
      g.shadowColor = "rgba(255,40,30,0.9)";
      g.shadowBlur = 4 * s;
      g.fillStyle = "rgba(255,70,50,0.35)";
      g.fillRect(px + 8 * s, y + lh / 2 + 2 * s, lw - 16 * s, 3 * s);
      g.fillStyle = "#ff5a44";
      g.globalAlpha = lv;
      g.fillRect(px + 8 * s, y + lh / 2 + 2 * s, (lw - 16 * s) * lp, 3 * s);
      g.restore();
    }
  }
}
const p1G: Look = {
  code: "P1-G",
  title: "Steady when it counts",
  note: "Goal first, keeping P1 (\"just perfect\"): each part kept for its job: brackets and TARGET tag = it's after you; panel and chevrons = it's over there; SLAM plate = what comes. Two changes from the goal. (1) The failing-display flicker only plays while it walks: during a warning the display goes steady and builds 80 → 100 % (tells first: a dip during the countdown read as \"it stopped\"), and the brackets flash on the hit with the boss's 0.15 s flash. (2) A thin red bar under the SLAM plate fills to the hit, so a player who can't see the ring still knows when. The hazard bar under the lock is cut (no job the brackets and tag don't do). Plates rendered as a real screen (as P1-A). Close to P1-A otherwise.",
  bake: () => p1Bake(),
  goalFirst: {
    goal: "It is after YOU, it is over THERE, and in this long it will SLAM: the lock on you (0.8 m), the edge panel pointing at it, the plate and its time (a slam warning: 1.2 s).",
    elements: [
      { name: "Brackets + tick ring on the survivor", job: "WHO: the lock; the brackets close over the warning (its clock, on you)." },
      { name: "TARGET tag", job: "WHO, in words (several survivors close together)." },
      { name: "DANGER panel + chevrons at the screen edge", job: "WHERE it is when it's off screen." },
      { name: "SLAM plate", job: "WHAT comes next, during a warning only." },
      { name: "Red bar under the plate", job: "WHEN, for whoever can't see the ring: fills to the hit, on the same progress as the brackets.", },
      { name: "Flicker (walking only)", job: "STYLE: a failing display while nothing is coming; steady = something is coming." },
      { name: "Cut: the hazard bar under the lock", job: "No read of its own (the brackets and tag say it); one fewer moving stripe on the survivor." },
    ],
    composition: [
      "Layout, sizes and colours unchanged; red only.",
      "Steady during a warning (never dims against the countdown); flicker returns after.",
      "One clock: brackets and plate bar on the telegraph progress; the flash on the hit = the boss's 0.15 s flash.",
      "Drawn above the darkness like today (a warning must show in a blackout).",
    ],
    plan: p1Plan,
  },
  draw(g, t, st) {
    const lv = p1Level(t);
    const rel = release(t, W1);
    p1Lock(g, st, t, Math.min(1, lv + 0.3 * rel), rel);
    p1Screen(g, st, t, lv);
  },
  textures: () => [
    { name: "danger, screen", canvas: p1Art!.plates.danger },
    { name: "SLAM plate, screen", canvas: p1Art!.plates.slam },
    { name: "TARGET tag, screen", canvas: p1Art!.plates.tag },
  ],
  parts: [
    { id: "lock", label: "Lock (brackets + ring)" },
    { id: "tag", label: "TARGET tag" },
    { id: "panel", label: "DANGER + chevrons" },
    { id: "plate", label: "SLAM plate" },
    { id: "bar", label: "Time-left bar" },
  ],
  frames: [
    { label: "walking", t: 0.3, when: "flicker, brackets breathe" },
    { label: "warning", t: 0.9, when: "steady, bar ¼" },
    { label: "closing", t: 1.5, when: "bar ¾, brackets tight" },
    { label: "hit", t: 1.8, when: "flash" },
    { label: "after", t: 2.1, when: "plate off, flicker" },
  ],
};
void HUD_ART_SCALE;
void p1Survivor;

/* ======================================================================================
 * GD-G
 * ====================================================================================== */
const GD_SLAM: [number, number] = [-2.6, 0];
const GD_CRATER: [number, number] = [4.6, 1.6];
const GD_CRATER_T = 0.5;
const FILM_S = 3; // the settled dust lightens the fresh breaks, then is gone
const gdPlan: ActionPlan = {
  goal: "That hit was real and this is how far it reached; it stays, but as an old matte mark that never looks like a live warning.",
  timing: "On boss.slammed / boss.thrown_impact; stays until the build phase (caps.maxDecals 8); the crack decal is 9 m (= the slam's 4.5 m reach), the crater 3.2 m (inside the throw's 3 m ring); reveal over the boss's 0.15 s flash.",
  lengthS: 1.6,
  lanes: {
    mark: [
      { t0: 0, t1: 0.15, label: "cracks run out to 4.5 m (3 pictures)", key: true, nw: true },
      { t0: 0.15, t1: 1.6, label: "stays" },
      { t0: 0.5, t1: 0.55, label: "crater", key: true },
    ],
    smoke: [{ t0: 0.05, t1: 1.6, label: "settled dust on the fresh breaks fades (3 s)", nw: true }],
    game: [
      { t0: 0, t1: 0.05, label: "slam hit", key: true },
      { t0: 0.5, t1: 0.55, label: "throw impact", key: true },
    ],
  },
};
const gdG: Look = {
  code: "GD-G",
  title: "Broken to the reach, then just a mark",
  note: "Goal first: the mark is memory, not a warning. The approved drawing stays (relit as GD-A); it already ends at 4.5 m, the slam's reach, so the cracks run out to exactly where the danger ended, in three pictures over the boss's 0.15 s flash. A film of settled dust lightens the fresh breaks and fades over 3 s, so the newest hit reads as new and older ones go matte. No light, no red, no heave ring, and no debris or dust of its own: those belong to the attack (SD-G / TH-G) and 9.15's boss dust, and doubling them here was GD-B's mistake. Close to GD-B (the reveal); the goal changed the timing (the flash), the extent (the reach), and cut everything that wasn't the mark.",
  bake: async () => {
    await gBake();
  },
  goalFirst: {
    goal: "The street is broken exactly as far as the hit reached (the slam's 4.5 m, the throw's 3.2 m crater) and stays so until the build phase (8 decals at most), without ever reading as a live danger.",
    elements: [
      { name: "The approved cracks (R1 + R2 + R3), relit", job: "THE MARK, out to 4.5 m: the hit's reach, remembered." },
      { name: "The reveal in 3 pictures over 0.15 s", job: "CAUSE → EFFECT: the hit broke it, at the boss's flash." },
      { name: "Settled dust on the fresh breaks (fades in 3 s)", job: "NEW vs OLD: the latest hit reads fresh, then goes matte (secondary follows)." },
      { name: "The crater (3.2 m), same style", job: "THE THROW'S MARK, inside its 3 m ring." },
      { name: "Cut: GD-B's heave ring, GD-A/B's own debris and dust", job: "The attack's take and 9.15 already throw bits and dust at the hit; a second set doubled them." },
    ],
    composition: [
      "Matte only: no ADD, no red, no glow (a glowing crack reads as a warning still live).",
      "The decal is centred on the hit and ends at the reach; the crater sits inside the 3 m ring.",
      "Darker than the street but no darker than the relit drawing (α 0.95), so zombies and pick-ups on it stay readable.",
      "One clock: the reveal on the boss's flash; the film fades on its own 3 s, after.",
    ],
    plan: gdPlan,
  },
  draw(g, t, st) {
    const a = G!;
    if (show(st, "cracks")) sprite(g, a.reveal[t < 0.05 ? 0 : t < 0.1 ? 1 : 2] as HTMLCanvasElement, X(st, GD_SLAM[0]), Y(st, GD_SLAM[1]), CRACK_SIDE_M, st.pxm, 0.6, 0.95);
    if (show(st, "film")) sprite(g, a.film, X(st, GD_SLAM[0]), Y(st, GD_SLAM[1]), CRACK_SIDE_M * 0.85, st.pxm, 1.3, ramp(t, 0.03, 0.15) * (1 - clamp01(t / FILM_S)));
    if (t >= GD_CRATER_T) {
      if (show(st, "crater")) sprite(g, a.crater, X(st, GD_CRATER[0]), Y(st, GD_CRATER[1]), CRATER_M, st.pxm, 0.4, 1);
      if (show(st, "film")) sprite(g, a.filmSmall, X(st, GD_CRATER[0]), Y(st, GD_CRATER[1]), CRATER_M * 1.15, st.pxm, 0.2, 0.55 * ramp(t, GD_CRATER_T + 0.03, GD_CRATER_T + 0.15) * (1 - clamp01((t - GD_CRATER_T) / FILM_S)));
    }
  },
  textures: () => [
    ...G!.reveal.map((c, i) => ({ name: `cracks ${["40 %", "75 %", "all"][i]}`, canvas: c, note: "normal, 9 m" })),
    { name: "settled dust film", canvas: G!.film, note: "normal 7.7 m, fades 3 s" },
    { name: "crater, relit", canvas: G!.crater, note: "3.2 m" },
    { name: "crater film", canvas: G!.filmSmall, note: "normal" },
  ],
  parts: [
    { id: "cracks", label: "Slam cracks" },
    { id: "film", label: "Settled dust" },
    { id: "crater", label: "Crater" },
  ],
  frames: [
    { label: "slam", t: 0.0, when: "40 %" },
    { label: "+0.05", t: 0.05, when: "75 %" },
    { label: "+0.1", t: 0.1, when: "all, dust film on" },
    { label: "crater", t: GD_CRATER_T, when: "throw impact" },
    { label: "later", t: 1.4, when: "film fading" },
  ],
};

/** The six -G looks, in card order (telegraphs.ts appends each to its card). */
export function gLooks(): { SD: Look; TH: Look; CL: Look; CR: Look; P1: Look; GD: Look } {
  return { SD: sdG, TH: thG, CL: clG, CR: crG, P1: p1G, GD: gdG };
}
