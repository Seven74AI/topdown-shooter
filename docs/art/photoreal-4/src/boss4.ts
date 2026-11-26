/**
 * Photoreal, group 4: the Behemoth (designer 2026-11-26, "Yes" to the Behemoth next). Take A: today's drawing
 * (`behemothArt.ts`, copied here as `behemoth4.ts` with take B's detail switched off) through the characters' in-game
 * relight (`charRelight.ts`, Story 9.13). Take B: the same with new detail drawn into the body before the relight.
 * Drawn at 48 px per metre (the game: 36). Built into ../compare.html by build.mjs.
 */
import { drawBehemoth as drawToday } from "./behemothNow"; // the drawing before Story 9.15 (the "Now" column)
import { relightCharSteps, sheenStep, sheenStrip, sheenSide } from "../../../../apps/client/src/render/city/charRelight";
import { drawBehemoth as drawOneModel, setHighlight, HL_COLOUR, type ModelElement } from "./behemoth5";
import { drawBehemoth, setDetail, setVeinMode, BEHEMOTH_LOOK_IDS, BH_R_M, type BehemothPose } from "./behemoth4";

const N = 336; // frame px (7 m)
const PXM = N / 7;
const SS = 2;
/** The relight's volume scale (px per "radius"): 0.7 × the frame's px per metre read best on the boss's parts. */
const RF = 0.7;
const make = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
const idle = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
function run<T>(g: Generator<number, T, void>): T {
  for (;;) {
    const r = g.next();
    if (r.done) return r.value;
  }
}

interface Pic {
  base: HTMLCanvasElement;
  glow: HTMLCanvasElement | null;
  sheen: HTMLCanvasElement | null;
  /** Take B2, enraged: the vein pulse strip (VEIN_STEPS pictures of N px side by side, for ADD). */
  veins?: HTMLCanvasElement | null;
}
type Take = "now" | "a" | "b" | "v2" | "v3" | "mix" | "c";

/*
 * ---- Vein options (designer 2026-11-26: "create both [V2 and V3] … not mixed … you can add a v2/v3 mix too") ----
 * V2: take B's zigzag veins, pulsing (a beat running outward from the chest every 1.2 s).
 * V3: organic veins grown like the Bloaters', a steady red glow (no pulse).
 * Mix: the organic veins of V3 with the pulse of V2.
 */
/** Pulse pictures per period (crossfaded). */
const VEIN_STEPS = 8;
/** One pulse every 1.2 s: a heartbeat, slower and heavier than the Bloaters'. */
const VEIN_PERIOD_S = 1.2;
/** Take C, enraged: the eyes never drop below this between beats (at 0.35 they were dimmer than the calm eyes for
 *  most of the beat: an enraged boss must read at least as strongly as a calm one). */
const EYE_FLOOR = 0.75;
/** V3's steady glow (no pulse): about take B's static red. */
const STEADY_GLOW = 0.6;
/** The pulse's wave front: a bright beat at radius (or path length) d at time t. */
const beat = (d: number, t: number, spacing: number): number => Math.pow(Math.max(0, Math.cos(((d - t * (spacing / VEIN_PERIOD_S)) / spacing) * Math.PI * 2)), 6);
/**
 * V2: finds take B's enraged vein cores (drawn magenta in "marker" mode, so only the parts not covered by the shirt or
 * vest show), paints them dark red in the source before the relight, and returns their pulse strip: each vein pixel
 * lights with a beat running outward from the chest (by radius).
 */
function markerPulse(src: HTMLCanvasElement, pulse = true, originR = -0.1): HTMLCanvasElement {
  const W = src.width;
  const sg = src.getContext("2d", { willReadFrequently: true })!;
  const img = sg.getImageData(0, 0, W, W);
  const d = img.data;
  const mask = new Float32Array(N * N);
  for (let i = 0; i < W * W; i++) {
    const r = d[i * 4] as number;
    const g = d[i * 4 + 1] as number;
    const b = d[i * 4 + 2] as number;
    // magenta-ness: blue and red both above green (no skin, blood or flesh colour has that); thin anti-aliased marker
    // lines are only partly magenta, so a strong gain catches them whole (a half-converted line shows pink)
    const m = Math.max(0, Math.min(1, ((Math.min(r, b) - g) / 255 - 0.2) * 5)); // a dead zone: cloth stains tint faintly that way
    if (m <= 0) continue;
    // dark red where the core was (the relight then lights it like skin)
    d[i * 4] = r + (90 - r) * m;
    d[i * 4 + 1] = g + (18 - g) * m;
    d[i * 4 + 2] = b + (10 - b) * m;
    const x = Math.floor((i % W) / SS);
    const y = Math.floor(Math.floor(i / W) / SS);
    mask[y * N + x] = (mask[y * N + x] as number) + m / (SS * SS);
  }
  sg.putImageData(img, 0, 0);
  const R = BH_R_M * PXM;
  const cx = N / 2 + originR * R;
  const cy = N / 2;
  const spacing = 1.9 * R;
  const strip = make(N * VEIN_STEPS, N);
  const g = strip.getContext("2d")!;
  const one = make(N, N);
  const og = one.getContext("2d")!;
  for (let f = 0; f < VEIN_STEPS; f++) {
    const t = (f / VEIN_STEPS) * VEIN_PERIOD_S;
    const fr = og.createImageData(N, N);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const m = mask[y * N + x] as number;
        if (m <= 0.02) continue;
        const al = (pulse ? Math.min(0.95, 0.18 + beat(Math.hypot(x - cx, y - cy), t, spacing) * 0.8) : STEADY_GLOW) * Math.min(1, m * 1.6);
        const j = (y * N + x) * 4;
        fr.data[j] = 255;
        fr.data[j + 1] = 120;
        fr.data[j + 2] = 80;
        fr.data[j + 3] = Math.round(255 * al);
      }
    }
    og.clearRect(0, 0, N, N);
    og.putImageData(fr, 0, 0);
    g.save();
    g.translate(f * N, 0);
    g.globalCompositeOperation = "lighter";
    g.filter = "blur(2.5px)"; // the halo
    g.globalAlpha = 0.8;
    g.drawImage(one, 0, 0);
    g.filter = "none";
    g.globalAlpha = 1;
    g.drawImage(one, 0, 0);
    g.restore();
  }
  return strip;
}
function today(v: number, pose: BehemothPose, k: number, enr: boolean, ph: number): Pic {
  const c = make(N, N);
  const g = c.getContext("2d")!;
  g.translate(N / 2, N / 2);
  drawToday(g, PXM, v, pose, k, enr, ph);
  return { base: c, glow: null, sheen: null };
}
function relit(v: number, pose: BehemothPose, k: number, enr: boolean, ph: number, t: Take): Pic {
  setDetail(t !== "a" && t !== "c");
  setVeinMode(t === "v2" ? "marker" : t === "v3" || t === "mix" ? "organic" : "static");
  const src = make(N * SS, N * SS);
  const s = src.getContext("2d", { willReadFrequently: true })!;
  s.translate(N, N);
  (t === "c" ? drawOneModel : drawBehemoth)(s, PXM * SS, v, pose, k, enr, ph);
  const veins = t !== "a" && t !== "b" && enr && (pose !== "dead" || t === "c") ? markerPulse(src, t !== "v3", t === "c" ? 0.3 : -0.1) : null;
  const L = run(relightCharSteps(src, N, SS, PXM * SS * RF, 901 + v * 7, make));
  return { base: L.base, glow: L.glow, sheen: sheenStrip(L.gloss, N, make), veins };
}
const pic = (t: Take, v: number, pose: BehemothPose, k: number, enr: boolean, ph = 0): Pic => (t === "now" ? today(v, pose, k, enr, ph) : relit(v, pose, k, enr, ph, t));

/** The night street under the boss (asphalt with a little grain). */
const street = ((): HTMLCanvasElement => {
  const c = make(N, N);
  const g = c.getContext("2d")!;
  g.fillStyle = "#23282d";
  g.fillRect(0, 0, N, N);
  let s = 7;
  const rnd = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "120,130,140"},${0.05 + rnd() * 0.08})`;
    g.fillRect(rnd() * N, rnd() * N, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  const vg = g.createRadialGradient(N * 0.4, N * 0.35, N * 0.1, N / 2, N / 2, N * 0.75);
  vg.addColorStop(0, "rgba(255,226,170,0.06)");
  vg.addColorStop(1, "rgba(0,0,0,0.35)");
  g.fillStyle = vg;
  g.fillRect(0, 0, N, N);
  return c;
})();

/** Eye positions in the walk pose (frame px): the head at 0.62 R, eyes 0.16 R further, ±0.08 R apart. */
const EYES: [number, number][] = [-1, 1].map((s) => [N / 2 + (0.62 + 0.16) * BH_R_M * PXM, N / 2 + s * 0.08 * BH_R_M * PXM]);

interface Anim {
  canvas: HTMLCanvasElement;
  take: Take;
  frames: { normal: [Pic, Pic]; enraged: [Pic, Pic] | null };
  v: number;
}
const anims: Anim[] = [];
let playing = !matchMedia("(prefers-reduced-motion: reduce)").matches;
let enraged = false;

function drawAnim(a: Anim, t: number): void {
  const g = a.canvas.getContext("2d")!;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.drawImage(street, 0, 0);
  const fr = enraged && a.frames.enraged ? a.frames.enraged : a.frames.normal;
  const animate = a.take !== "now";
  // walk: the two pictures crossfade (the game swaps them; the takes ease between them)
  const w = 0.5 + 0.5 * Math.sin(t * Math.PI * 1.1);
  const breath = animate ? 1 + 0.012 * Math.sin(t * 1.7) : 1;
  g.translate(N / 2, N / 2);
  g.scale(breath, breath);
  g.translate(-N / 2, -N / 2);
  const [p0, p1] = fr;
  if (animate) {
    g.globalAlpha = 1;
    g.drawImage(p0.base, 0, 0);
    g.globalAlpha = w;
    g.drawImage(p1.base, 0, 0);
  } else {
    g.drawImage((w > 0.5 ? p1 : p0).base, 0, 0);
  }
  g.globalAlpha = 1;
  if (animate) {
    const top = w > 0.5 ? p1 : p0;
    g.globalCompositeOperation = "lighter";
    if (top.sheen) {
      const h = sheenSide(N);
      const k = sheenStep(t);
      g.drawImage(top.sheen, k * h, 0, h, h, 0, 0, N, N);
    }
    const pulse = a.take === "c" && enraged ? EYE_FLOOR + (1 - EYE_FLOOR) * beat(0, t, 1) : 0.55 + 0.45 * Math.sin(t * (enraged ? 5 : 2.2));
    if (top.glow) {
      g.globalAlpha = 0.6 + 0.4 * pulse;
      g.drawImage(top.glow, 0, 0);
      g.globalAlpha = 1;
    }
    if (enraged && top.veins) {
      const f = ((t / VEIN_PERIOD_S) % 1) * VEIN_STEPS;
      const i0 = Math.floor(f);
      const x = f - i0;
      g.globalAlpha = 1 - x;
      g.drawImage(top.veins, i0 * N, 0, N, N, 0, 0, N, N);
      g.globalAlpha = x;
      g.drawImage(top.veins, ((i0 + 1) % VEIN_STEPS) * N, 0, N, N, 0, 0, N, N);
      g.globalAlpha = 1;
    }
    const rgb = enraged ? "255,74,46" : "240,214,106";
    for (const [x, y] of EYES) {
      const gr = g.createRadialGradient(x, y, 0, x, y, 14);
      gr.addColorStop(0, `rgba(${rgb},${0.35 * pulse})`);
      gr.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, 14, 0, Math.PI * 2);
      g.fill();
    }
  }
}
function frame(ms: number): void {
  const t = playing ? ms / 1000 : 0;
  for (const a of anims) drawAnim(a, t);
  if (playing) requestAnimationFrame(frame);
}

const LOOK_NAMES = ["BH1, the prototype", "BH2, the site worker", "BH3, the overgrowth", "BH4, the riot cop"];
const CAPTION: Record<Take, string> = { now: "Now", a: "Take A: relit", b: "Take B: new detail", v2: "B + V2: pulse", v3: "B + V3: organic", mix: "Previous pick: B + mix", c: "Take C: one model" };
const TAKES: Take[] = ["now", "mix", "c"];

async function main(): Promise<void> {
  const host = document.getElementById("looks")!;
  for (let v = 0; v < BEHEMOTH_LOOK_IDS.length; v++) {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `<h3>${LOOK_NAMES[v]}</h3><div class="sides"></div>`;
    host.append(card);
    const sides = card.querySelector(".sides")!;
    for (const t of TAKES) {
      const fig = document.createElement("figure");
      fig.className = t;
      const c = make(N, N);
      fig.append(c);
      fig.insertAdjacentHTML("beforeend", `<figcaption>${CAPTION[t]}</figcaption>`);
      sides.append(fig);
      await idle();
      // the game bakes the walk at phases 0 and 0.5, where the arm swing (sin) is 0 both times: today's two walk frames
      // are the same picture. Take C uses 0.25 / 0.75 (the full swing); "now" and the previous pick stay as today.
      const [p0, p1] = t === "c" ? [0.25, 0.75] : [0, 0.5];
      const normal: [Pic, Pic] = [pic(t, v, "walk", 0, false, p0), pic(t, v, "walk", 0, false, p1)];
      await idle();
      const enr: [Pic, Pic] = [pic(t, v, "walk", 0, true, p0), pic(t, v, "walk", 0, true, p1)];
      const a: Anim = { canvas: c, take: t, frames: { normal, enraged: enr }, v };
      anims.push(a);
      drawAnim(a, 0);
    }
  }
  document.getElementById("loading")!.hidden = true;
  if (playing) requestAnimationFrame(frame);
  const playerDone = actionPlayer();
  // every pose of BH1
  const POSES: [string, BehemothPose, number][] = [
    ["Walk", "walk", 0],
    ["Slam wind-up", "slam", 0.5],
    ["Slam raised", "slam", 1],
    ["Slam hit", "slamHit", 0],
    ["Charge", "charge", 1],
    ["Rush", "rush", 1],
    ["Throw", "throw", 1],
    ["Stun", "stun", 0],
    ["Roar", "roar", 0],
    ["Collapse", "dead", 0.6],
    ["Dead", "dead", 1],
  ];
  const tbl = document.getElementById("poses")!;
  const head = document.createElement("tr");
  head.innerHTML = `<th></th>` + POSES.map((p) => `<th>${p[0]}</th>`).join("");
  tbl.append(head);
  const ROWS: [Take, boolean, string][] = [
    ["now", false, CAPTION.now],
    ["mix", false, "Previous pick"],
    ["c", false, "Take C"],
    ["c", true, "Take C, enraged"],
  ];
  for (const [t, enr, label] of ROWS) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<th>${label}</th>`;
    tbl.append(tr);
    for (const [, pose, k] of POSES) {
      await idle();
      const p = pic(t, 0, pose, k, enr);
      const c = make(N, N);
      const g = c.getContext("2d")!;
      g.drawImage(street, 0, 0);
      g.drawImage(p.base, 0, 0);
      if (p.glow) {
        g.globalCompositeOperation = "lighter";
        g.drawImage(p.glow, 0, 0);
      }
      if (p.veins) g.drawImage(p.veins, 0, 0, N, N, 0, 0, N, N); // the beat at the chest
      const td = document.createElement("td");
      td.append(c);
      tr.append(td);
    }
  }
  await playerDone;
  await decomposed();
  await actionPlan();
  (window as unknown as { done: boolean }).done = true;
}

/* ---------------- Actions and animation, decomposed (take C) ----------------
 * Designer 2026-11-26: "decorticate actions and animation, to verify that each element composing the whole model
 * is behaving correctly". The game's own frame list (`render/city/bossAtlas.ts › POSE_FRAMES`) and when
 * `render/BossView.ts` shows each one.
 */
const GAME_FRAMES: readonly { name: string; pose: BehemothPose; k: number; ph: number; when: string; shown: boolean }[] = [
  { name: "walk_a", pose: "walk", k: 0, ph: 0.25, when: "walking: swapped with walk_b every 0.65 m; also held while a charge or throw is warned. Fixed: baked at phase 0.25 (today 0 = no swing)", shown: true },
  { name: "walk_b", pose: "walk", k: 0, ph: 0.75, when: "walking (the other step). Fixed: phase 0.75 (today 0.5 = the same picture as walk_a)", shown: true },
  { name: "slam_a", pose: "slam", k: 0.15, ph: 0, when: "slam warning, first third", shown: true },
  { name: "slam_b", pose: "slam", k: 0.5, ph: 0, when: "slam warning, second third", shown: true },
  { name: "slam_c", pose: "slam", k: 1, ph: 0, when: "slam warning, last third", shown: true },
  { name: "slamhit_a", pose: "slamHit", k: 0, ph: 0, when: "the slam lands (a moment after)", shown: true },
  { name: "charge_a", pose: "charge", k: 1, ph: 0, when: "baked but never shown today (the charge warning holds a walk frame)", shown: false },
  { name: "rush_a", pose: "rush", k: 1, ph: 0, when: "the charge run", shown: true },
  { name: "throw_a", pose: "throw", k: 1, ph: 0, when: "baked but never shown today (the throw warning holds a walk frame)", shown: false },
  { name: "stun_a", pose: "stun", k: 0, ph: 0, when: "stunned after crashing into something (2 s)", shown: true },
  { name: "roar_a", pose: "roar", k: 0, ph: 0, when: "the enrage roar", shown: true },
  { name: "dead_a", pose: "dead", k: 0.35, ph: 0, when: "death, first third of the collapse", shown: true },
  { name: "dead_b", pose: "dead", k: 0.7, ph: 0, when: "death, second third", shown: true },
  { name: "dead_c", pose: "dead", k: 1, ph: 0, when: "dead (stays, grey-tinted)", shown: true },
];
const ELEMENTS: readonly [ModelElement, string][] = [
  ["muscles", "Muscle masses"],
  ["splits", "Skin splits (and BH1's stapled one)"],
  ["veins", "Veins"],
  ["clothes", "Clothes and armour"],
  ["impacts", "Impacts: rebar, concrete, grit, blood"],
  ["head", "Head: brow, scar, teeth"],
  ["glow", "Enraged glow (marker)"],
];
const SMALL = 132;
function plainC(v: number, pose: BehemothPose, k: number, ph: number, enr: boolean, e: ModelElement | null): HTMLCanvasElement {
  const c = make(N, N);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.translate(N / 2, N / 2);
  setHighlight(e);
  drawOneModel(g, PXM, v, pose, k, enr, ph);
  setHighlight(null);
  if (e) {
    // everything but the element: grey and dim, so the cyan reads
    const img = g.getImageData(0, 0, N, N);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] as number;
      const gg = d[i + 1] as number;
      const b = d[i + 2] as number;
      const isHl = gg > 200 && b > 200 && r < 90;
      if (isHl) continue;
      const l = (r * 0.3 + gg * 0.55 + b * 0.15) * 0.55;
      d[i] = d[i + 1] = d[i + 2] = l;
    }
    g.putImageData(img, 0, 0);
  }
  return c;
}
function cell(src: HTMLCanvasElement, label?: string, dim = false): HTMLTableCellElement {
  const td = document.createElement("td");
  const c = make(N, N);
  const g = c.getContext("2d")!;
  g.drawImage(street, 0, 0);
  g.globalAlpha = dim ? 0.55 : 1;
  g.drawImage(src, 0, 0);
  c.style.width = c.style.height = `${SMALL}px`;
  td.append(c);
  if (label) td.insertAdjacentHTML("beforeend", `<div class="cap">${label}</div>`);
  return td;
}
function relitC(v: number, f: (typeof GAME_FRAMES)[number], enr: boolean): HTMLCanvasElement {
  const p = pic("c", v, f.pose, f.k, enr, f.ph);
  const c = make(N, N);
  const g = c.getContext("2d")!;
  g.drawImage(p.base, 0, 0);
  g.globalCompositeOperation = "lighter";
  if (p.glow) g.drawImage(p.glow, 0, 0);
  if (p.veins) g.drawImage(p.veins, 0, 0, N, N, 0, 0, N, N);
  return c;
}
async function decomposed(): Promise<void> {
  const main = document.querySelector("main")!;
  const sec = document.createElement("section");
  sec.innerHTML = `<h2>Actions and animation, decomposed (take C)</h2>
  <p>Every frame the game bakes for the boss, in the order it uses them, and when each one shows. Then each element of the model alone (cyan) in every frame, the two walk frames side by side, and the heartbeat step by step.</p>
  <div class="card"><h3>What the breakdown found</h3><ol class="finds">
    <li><b>Today's walk never moves</b> (game bug): the two walk frames are baked at phases 0 and 0.5, where the arm swing is zero both times, so they are the same picture. Take C bakes 0.25 / 0.75: the arms swing.</li>
    <li><b>Today's death frames have a black head and spine</b> (game bug): the darkened dead skin was made in a colour format the shading can't read. Fixed in take C.</li>
    <li><b>The charge and throw poses are never shown</b> (⚠ above): during their warnings the body holds a walk frame; only the rush switches pose. The arms are the tell, so showing them would make both attacks easier to read.</li>
    <li><b>The body is never drawn enraged in the game</b>: all body frames are baked calm; only the outline frame in the dark gets red eyes. Take C's rage (glowing veins and splits on the heartbeat) needs enraged frames or a glow layer on top.</li>
    <li><b>No idle animation in the game</b>: the boss has no breathing, sheen or glow pulse; the page animates more than the game does.</li>
    <li>Fixed in take C: <b>arm veins flickered between the walk steps</b> (they were regrown from each pose; now fixed to the arm), and <b>the enraged eyes dropped to 35 %</b> between beats, dimmer than calm eyes (now never below 75 %).</li>
    <li>Checked and fine: splits, veins and glow stay on skin in every frame and look; clothes, armour, pads and the riot cuff cover them; concrete and grit move with shoulders and fists; the raised slam arms cover the torso (the tell stays the arms); no glow when dead.</li>
  </ol></div>
  <div class="card poses"><table id="dc-frames"></table></div>
  <h2>Each element alone</h2>
  <p>The element in cyan, the rest greyed. Check it sits where the brief says, moves with its part, and is covered by what lies on it. <span class="controls" id="dc-looks"></span></p>
  <div class="card poses"><table id="dc-elements"></table></div>
  <h2>The walk: two frames</h2>
  <p>The game swaps walk_a and walk_b every 0.65 m (no blend). Red marks every pixel that changes between them: only the arms and what is on them should move.</p>
  <div class="card poses"><table id="dc-walk"></table></div>
  <h2>The heartbeat, step by step</h2>
  <p>Enraged, one beat every 1.2 s runs out from the neck along the veins into the splits; the eyes peak at the start of each beat. 8 steps of 0.15 s.</p>
  <div class="card poses"><table id="dc-beat"></table></div>`;
  main.append(sec);
  // 1. the game's frames, calm and enraged
  const tf = document.getElementById("dc-frames")!;
  const head = document.createElement("tr");
  head.innerHTML = "<th></th>" + GAME_FRAMES.map((f) => `<th title="${f.when}">${f.name}${f.shown ? "" : " ⚠"}</th>`).join("");
  tf.append(head);
  for (const enr of [false, true]) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<th>${enr ? "Enraged (not baked today)" : "Calm (baked)"}</th>`;
    tf.append(tr);
    for (const f of GAME_FRAMES) {
      await idle();
      tr.append(cell(relitC(0, f, enr && f.pose !== "dead"), undefined, !f.shown));
    }
  }
  const whenRow = document.createElement("tr");
  whenRow.innerHTML = "<th>When</th>" + GAME_FRAMES.map((f) => `<td class="cap wide">${f.when}</td>`).join("");
  tf.append(whenRow);
  // 2. the element inspector, per look
  const looksHost = document.getElementById("dc-looks")!;
  const te = document.getElementById("dc-elements")!;
  let busy = 0;
  const drawElements = async (v: number): Promise<void> => {
    const my = ++busy;
    te.textContent = "";
    const h = document.createElement("tr");
    h.innerHTML = "<th></th>" + GAME_FRAMES.map((f) => `<th>${f.name}</th>`).join("");
    te.append(h);
    for (const [e, label] of ELEMENTS) {
      const tr = document.createElement("tr");
      tr.innerHTML = `<th>${label}</th>`;
      te.append(tr);
      for (const f of GAME_FRAMES) {
        await idle();
        if (my !== busy) return;
        tr.append(cell(plainC(v, f.pose, f.k, f.ph, e === "glow" && f.pose !== "dead", e)));
      }
    }
  };
  for (let v = 0; v < 4; v++) {
    const b = document.createElement("button");
    b.textContent = BEHEMOTH_LOOK_IDS[v] as string;
    b.setAttribute("aria-pressed", String(v === 0));
    b.addEventListener("click", () => {
      for (const x of looksHost.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === b));
      void drawElements(v);
    });
    looksHost.append(b);
  }
  await drawElements(0);
  // 3. the walk: walk_a, walk_b, and the pixels that change
  const tw = document.getElementById("dc-walk")!;
  for (let v = 0; v < 4; v++) {
    await idle();
    const a = relitC(v, GAME_FRAMES[0]!, false);
    const b = relitC(v, GAME_FRAMES[1]!, false);
    const diff = make(N, N);
    const dg = diff.getContext("2d")!;
    const da = a.getContext("2d")!.getImageData(0, 0, N, N).data;
    const db = b.getContext("2d")!.getImageData(0, 0, N, N).data;
    dg.drawImage(a, 0, 0);
    dg.fillStyle = "rgba(0,0,0,0.55)";
    dg.fillRect(0, 0, N, N);
    const out = dg.getImageData(0, 0, N, N);
    for (let i = 0; i < da.length; i += 4) {
      const dd = Math.abs((da[i] as number) - (db[i] as number)) + Math.abs((da[i + 1] as number) - (db[i + 1] as number)) + Math.abs((da[i + 2] as number) - (db[i + 2] as number)) + Math.abs((da[i + 3] as number) - (db[i + 3] as number));
      if (dd > 40) {
        out.data[i] = 255;
        out.data[i + 1] = 40;
        out.data[i + 2] = 40;
        out.data[i + 3] = 255;
      }
    }
    dg.putImageData(out, 0, 0);
    const tr = document.createElement("tr");
    tr.innerHTML = `<th>${BEHEMOTH_LOOK_IDS[v]}</th>`;
    tr.append(cell(a, "walk_a"), cell(b, "walk_b"), cell(diff, "what changes"));
    tw.append(tr);
  }
  // 4. the heartbeat: the 8 steps of the vein strip, with the eye pulse value
  const tb = document.getElementById("dc-beat")!;
  for (let v = 0; v < 4; v++) {
    await idle();
    const p = pic("c", v, "walk", 0, true, 0.25);
    const tr = document.createElement("tr");
    tr.innerHTML = `<th>${BEHEMOTH_LOOK_IDS[v]}</th>`;
    for (let s = 0; s < VEIN_STEPS; s++) {
      const c = make(N, N);
      const g = c.getContext("2d")!;
      g.drawImage(p.base, 0, 0);
      g.globalCompositeOperation = "lighter";
      const t = (s / VEIN_STEPS) * VEIN_PERIOD_S;
      const eye = EYE_FLOOR + (1 - EYE_FLOOR) * beat(0, t, 1);
      if (p.glow) {
        g.globalAlpha = 0.6 + 0.4 * eye;
        g.drawImage(p.glow, 0, 0);
        g.globalAlpha = 1;
      }
      if (p.veins) g.drawImage(p.veins, s * N, 0, N, N, 0, 0, N, N);
      tr.append(cell(c, `${(t).toFixed(2)} s · eyes ${Math.round(eye * 100)} %`));
    }
    tb.append(tr);
  }
}

/* ---------------- Action plan: goals first, then each part's job, then one timeline (take C) ----------------
 * Designer 2026-11-26: "they should work taken apart but we should also check that they compose correctly with the
 * other elements. The goal should be determined before we animate each part, so we can then decide what each part
 * has to do and how we coordinate them all together." A PROPOSAL (nothing animated yet): per action its goal, its
 * real duration (balance `boss.json`), a dope sheet (one lane per part) and the composed key moments (every
 * element together, as planned at that moment).
 */
type LaneId = "pose" | "torso" | "eyes" | "glow" | "clothes" | "dust" | "fx";
const LANES: readonly [LaneId, string][] = [
  ["pose", "Pose (frame)"],
  ["torso", "Torso: breath, swell"],
  ["eyes", "Eyes"],
  ["glow", "Veins + splits (enraged)"],
  ["clothes", "Clothes"],
  ["dust", "Dust, debris"],
  ["fx", "Game warning / FX"],
];
/** A bar on a lane: from t0 to t1 (s), its label; `key` = a short accent (a moment), `nw` = new in this plan. */
interface Bar {
  t0: number;
  t1: number;
  label: string;
  key?: boolean;
  nw?: boolean;
}
/** A composed key moment: the frame, enraged or not, the planned glow and eye levels (0–1). */
interface Moment {
  t: number;
  frame: string;
  enr: boolean;
  glow: number;
  eyes: number;
  note: string;
}
interface ActionPlan {
  id: string;
  name: string;
  goal: string;
  lengthS: number;
  timing: string;
  lanes: Partial<Record<LaneId, Bar[]>>;
  moments: Moment[];
}
const PLAN: readonly ActionPlan[] = [
  {
    id: "walk",
    name: "Walk (calm, then enraged)",
    goal: "Weight: a huge, slow thing that can't be stopped. Every step lands.",
    lengthS: 1.0,
    timing: "A step every 0.65 m: 0.5 s at 1.3 m/s (0.38 s enraged, × 1.3 speed). Shown: two steps.",
    lanes: {
      pose: [
        { t0: 0, t1: 0.5, label: "walk_a (phase 0.25: the swing)", nw: true },
        { t0: 0.5, t1: 1, label: "walk_b (phase 0.75)", nw: true },
      ],
      torso: [
        { t0: 0, t1: 0.08, label: "dip 1 %", key: true, nw: true },
        { t0: 0.08, t1: 0.5, label: "rise: the breath rides the step", nw: true },
        { t0: 0.5, t1: 0.58, label: "dip", key: true, nw: true },
        { t0: 0.58, t1: 1, label: "rise", nw: true },
      ],
      eyes: [{ t0: 0, t1: 1, label: "calm: steady yellow · enraged: red, 75 % → 100 % on the beat" }],
      glow: [
        { t0: 0, t1: 0.12, label: "beat", key: true, nw: true },
        { t0: 0.12, t1: 1, label: "enraged: a beat every 3 steps (≈ 1.15 s), ON a footfall · calm: none", nw: true },
      ],
      clothes: [{ t0: 0, t1: 1, label: "still (strain creases drawn)" }],
      dust: [{ t0: 0, t1: 1, label: "none (keep the walk quiet)" }],
      fx: [{ t0: 0, t1: 1, label: "none" }],
    },
    moments: [
      { t: 0, frame: "walk_a", enr: false, glow: 0, eyes: 1, note: "calm, step A" },
      { t: 0.5, frame: "walk_b", enr: false, glow: 0, eyes: 1, note: "calm, step B" },
      { t: 0, frame: "walk_a", enr: true, glow: 1, eyes: 1, note: "enraged, the beat on the footfall" },
      { t: 0.5, frame: "walk_b", enr: true, glow: 0.25, eyes: 0.75, note: "enraged, between beats" },
    ],
  },
  {
    id: "slam",
    name: "Slam",
    goal: "Get out of the ring NOW: power builds through the warning, then everything is released at once on the hit.",
    lengthS: 2.0,
    timing: "Warning 1.2 s, the hit, recover 0.8 s.",
    lanes: {
      pose: [
        { t0: 0, t1: 0.4, label: "slam_a" },
        { t0: 0.4, t1: 0.8, label: "slam_b" },
        { t0: 0.8, t1: 1.2, label: "slam_c" },
        { t0: 1.2, t1: 1.5, label: "slamhit", key: true },
        { t0: 1.5, t1: 2, label: "walk" },
      ],
      torso: [
        { t0: 0, t1: 1.2, label: "swells 1.00 → 1.07, breath held", nw: true },
        { t0: 1.2, t1: 2, label: "exhale back to 1.00", nw: true },
      ],
      eyes: [
        { t0: 0, t1: 1.2, label: "75 % → 100 %, with the disc's glow", nw: true },
        { t0: 1.2, t1: 1.35, label: "flash", key: true, nw: true },
        { t0: 1.35, t1: 2, label: "settle" },
      ],
      glow: [
        { t0: 0, t1: 1.2, label: "heart races: beats at 0, 0.55, 0.9, 1.1 s", nw: true },
        { t0: 1.2, t1: 1.35, label: "ALL lit", key: true, nw: true },
        { t0: 1.35, t1: 2, label: "back to the 1.2 s beat" },
      ],
      clothes: [{ t0: 0, t1: 1.2, label: "strain creases deepen with the swell (per frame)", nw: true }],
      dust: [
        { t0: 1.2, t1: 1.6, label: "puff from the fists", key: true, nw: true },
        { t0: 1.25, t1: 1.8, label: "grit falls off the shoulders", nw: true },
      ],
      fx: [
        { t0: 0, t1: 1.2, label: "glowing countdown disc, ticks light up" },
        { t0: 1.2, t1: 2, label: "ground damage", key: true },
      ],
    },
    moments: [
      { t: 0.2, frame: "slam_a", enr: true, glow: 0.4, eyes: 0.8, note: "the warning starts" },
      { t: 0.9, frame: "slam_c", enr: true, glow: 0.8, eyes: 0.95, note: "arms up, heart racing" },
      { t: 1.2, frame: "slamhit_a", enr: true, glow: 1, eyes: 1, note: "THE HIT: everything peaks" },
      { t: 1.7, frame: "walk_a", enr: true, glow: 0.25, eyes: 0.8, note: "recovering" },
    ],
  },
  {
    id: "charge",
    name: "Charge (and the crash stun)",
    goal: "It will run down that lane: get out of it. If it crashes, it is helpless: hit it now.",
    lengthS: 4.0,
    timing: "Warning 1.0 s, the rush (12 m/s, up to 1 s), then recover 1.0 s, or a 2 s stun after a crash.",
    lanes: {
      pose: [
        { t0: 0, t1: 0.5, label: "charge, crouching (k 0.5)", nw: true },
        { t0: 0.5, t1: 1, label: "charge_a, head down (k 1)", nw: true },
        { t0: 1, t1: 2, label: "rush" },
        { t0: 2, t1: 4, label: "stun (after a crash)" },
      ],
      torso: [
        { t0: 0, t1: 1, label: "breath held, leaning in" },
        { t0: 1, t1: 2, label: "no breathing" },
        { t0: 2, t1: 4, label: "slow, heavy breaths (dazed)", nw: true },
      ],
      eyes: [
        { t0: 0, t1: 2, label: "100 %, locked on the lane", nw: true },
        { t0: 2, t1: 4, label: "30 %: dazed", nw: true },
      ],
      glow: [
        { t0: 0, t1: 1, label: "heart races", nw: true },
        { t0: 1, t1: 2, label: "steady 60 %: adrenaline", nw: true },
        { t0: 2, t1: 4, label: "OFF: helpless (the window)", nw: true },
      ],
      clothes: [{ t0: 0, t1: 4, label: "still" }],
      dust: [
        { t0: 1, t1: 2, label: "dust trail behind it", nw: true },
        { t0: 2, t1: 2.4, label: "crash burst", key: true, nw: true },
      ],
      fx: [
        { t0: 0, t1: 1, label: "lane strip" },
        { t0: 2, t1: 4, label: "CRASH mark (amber: your chance)" },
      ],
    },
    moments: [
      { t: 0.3, frame: "charge_a", enr: true, glow: 0.6, eyes: 1, note: "warning: head down, aimed" },
      { t: 1.5, frame: "rush_a", enr: true, glow: 0.6, eyes: 1, note: "the rush" },
      { t: 2.5, frame: "stun_a", enr: true, glow: 0, eyes: 0.3, note: "crashed: helpless" },
    ],
  },
  {
    id: "throw",
    name: "Throw",
    goal: "Something heavy is coming at THAT spot: watch the chunk go up, then move.",
    lengthS: 2.4,
    timing: "Lift 1.0 s, flight 0.8 s, recover 0.6 s.",
    lanes: {
      pose: [
        { t0: 0, t1: 0.5, label: "throw, lifting (k 0.5)", nw: true },
        { t0: 0.5, t1: 1, label: "throw_a, chunk overhead", nw: true },
        { t0: 1, t1: 2.4, label: "walk (released)" },
      ],
      torso: [
        { t0: 0, t1: 1, label: "swell with the lift", nw: true },
        { t0: 1, t1: 1.4, label: "exhale", nw: true },
      ],
      eyes: [{ t0: 0, t1: 1, label: "100 %" }],
      glow: [
        { t0: 0, t1: 1, label: "normal beat" },
        { t0: 1, t1: 1.15, label: "beat ON the release", key: true, nw: true },
      ],
      clothes: [{ t0: 0, t1: 2.4, label: "still" }],
      dust: [
        { t0: 0.3, t1: 1, label: "crumbs fall from the chunk", nw: true },
        { t0: 1.8, t1: 2.2, label: "landing burst", key: true },
      ],
      fx: [
        { t0: 0, t1: 1.8, label: "target ring" },
        { t0: 1, t1: 1.8, label: "chunk in flight" },
      ],
    },
    moments: [
      { t: 0.3, frame: "throw_a", enr: false, glow: 0, eyes: 1, note: "lifting" },
      { t: 1.0, frame: "throw_a", enr: true, glow: 1, eyes: 1, note: "release (enraged)" },
    ],
  },
  {
    id: "roar",
    name: "Roar: the enrage",
    goal: "It changed: angrier and faster from now on. The fight's second half starts, and you see it happen.",
    lengthS: 1.5,
    timing: "Roar 1.5 s at half health, the 5 m shock ring.",
    lanes: {
      pose: [
        { t0: 0, t1: 0.3, label: "roar (inhale)" },
        { t0: 0.3, t1: 1.5, label: "roar (mouth open)" },
      ],
      torso: [
        { t0: 0, t1: 0.3, label: "big inhale", nw: true },
        { t0: 0.3, t1: 1.5, label: "swollen 1.08" },
      ],
      eyes: [
        { t0: 0, t1: 0.3, label: "yellow" },
        { t0: 0.3, t1: 0.4, label: "SNAP to red", key: true, nw: true },
        { t0: 0.4, t1: 1.5, label: "red 100 %" },
      ],
      glow: [{ t0: 0.3, t1: 1.5, label: "the veins light from the neck outward (one slow wave); the skin flushes calm → enraged", nw: true }],
      clothes: [{ t0: 0, t1: 1.5, label: "still" }],
      dust: [{ t0: 0.3, t1: 0.8, label: "dust blown off by the roar", nw: true }],
      fx: [{ t0: 0.3, t1: 0.8, label: "shock ring (5 m push)", key: true }],
    },
    moments: [
      { t: 0.1, frame: "roar_a", enr: false, glow: 0, eyes: 1, note: "inhale, still calm" },
      { t: 0.8, frame: "roar_a", enr: true, glow: 0.5, eyes: 1, note: "the change spreads" },
      { t: 1.5, frame: "roar_a", enr: true, glow: 1, eyes: 1, note: "fully enraged" },
    ],
  },
  {
    id: "death",
    name: "Death",
    goal: "It's over: it is no longer a threat. The heart stops first, then the body falls.",
    lengthS: 2.0,
    timing: "Collapse 1.5 s (three frames), then it lies there.",
    lanes: {
      pose: [
        { t0: 0, t1: 0.5, label: "dead_a" },
        { t0: 0.5, t1: 1, label: "dead_b" },
        { t0: 1, t1: 2, label: "dead_c (stays)" },
      ],
      torso: [{ t0: 0, t1: 2, label: "breathing stops", nw: true }],
      eyes: [{ t0: 0, t1: 0.05, label: "out", key: true }],
      glow: [
        { t0: 0, t1: 0.15, label: "last weak beat", key: true, nw: true },
        { t0: 0.15, t1: 0.4, label: "fades out", nw: true },
      ],
      clothes: [{ t0: 0, t1: 2, label: "still" }],
      dust: [{ t0: 1, t1: 1.5, label: "big dust puff as it hits the ground", key: true, nw: true }],
      fx: [{ t0: 0, t1: 2, label: "skin darkens, grey tint" }],
    },
    moments: [
      { t: 0.1, frame: "dead_a", enr: false, glow: 0, eyes: 0, note: "the heart stops" },
      { t: 1.2, frame: "dead_c", enr: false, glow: 0, eyes: 0, note: "down" },
    ],
  },
];
const RULES: readonly [string, string][] = [
  ["R1 Tells first", "During a warning, the pose carries the read. Eyes and glow only build toward the hit moment, never pulse against the countdown."],
  ["R2 One clock", "Steps, breath and heartbeat share one rhythm: the breath rides the steps; enraged, the beat lands on every 3rd footfall (≈ 1.15 s)."],
  ["R3 Release together", "At a release (slam hit, crash, throw, roar) everything peaks in the same 0.15 s: glow, eyes, dust, the game's FX. Then it settles."],
  ["R4 Weak = dim", "Helpless reads as dim: the stun turns the glow off and the eyes to 30 %; death puts them out first, before the body falls."],
  ["R5 Secondary follows", "Dust, falling grit and settling come after the impact that causes them, never before."],
];

function compose(v: number, frameName: string, enr: boolean, glowA: number, eyes: number): HTMLCanvasElement {
  const f = GAME_FRAMES.find((g) => g.name === frameName) ?? (GAME_FRAMES[0] as (typeof GAME_FRAMES)[number]);
  const p = pic("c", v, f.pose, f.k, enr, f.ph);
  const c = make(N, N);
  const g = c.getContext("2d")!;
  g.drawImage(p.base, 0, 0);
  g.globalCompositeOperation = "lighter";
  if (p.glow) {
    g.globalAlpha = eyes;
    g.drawImage(p.glow, 0, 0);
  }
  if (p.veins && glowA > 0) {
    g.globalAlpha = 1;
    // glow level: the steady ember (step 4, between beats) up to a beat over the whole body
    g.drawImage(p.veins, 4 * N, 0, N, N, 0, 0, N, N);
    g.globalAlpha = Math.max(0, Math.min(1, (glowA - 0.25) / 0.75));
    for (const s of [0, 1, 2]) g.drawImage(p.veins, s * N, 0, N, N, 0, 0, N, N);
  }
  g.globalAlpha = 1;
  return c;
}

async function actionPlan(): Promise<void> {
  const main = document.querySelector("main")!;
  const sec = document.createElement("section");
  sec.innerHTML = `<h2>Action plan: goals first (proposal, nothing animated yet)</h2>
  <p>For every action: <b>what the player must read</b> (the goal), its real length in the game, then what each part does, on one timeline so the parts are coordinated, and the composed key moments (every element together, as planned). <span class="nw">Green</span> = new in this plan. Five rules tie the parts together:</p>
  <div class="card"><ul class="finds">${RULES.map(([a, b]) => `<li><b>${a}.</b> ${b}</li>`).join("")}</ul></div>`;
  main.append(sec);
  for (const a of PLAN) {
    const card = document.createElement("article");
    card.className = "card plan";
    const ticks: number[] = [];
    for (let t = 0; t <= a.lengthS + 1e-6; t += a.lengthS > 2.5 ? 0.5 : 0.25) ticks.push(t);
    const pct = (t: number): string => `${(t / a.lengthS) * 100}%`;
    card.innerHTML = `<h3>${a.name}</h3><p class="goal"><b>Goal:</b> ${a.goal}</p><p class="timing">${a.timing}</p>
      <div class="dope"><div class="ruler"><span></span><div class="track">${ticks.map((t) => `<i style="left:${pct(t)}">${Number(t.toFixed(2))} s</i>`).join("")}</div></div>
      ${LANES.map(([id, label]) => `<div class="lane"><span>${label}</span><div class="track">${(a.lanes[id] ?? [])
        .map((b) => `<div class="bar${b.key ? " key" : ""}${b.nw ? " nw" : ""}" style="left:${pct(b.t0)};width:calc(${pct(b.t1 - b.t0)} - 2px)" title="${b.label}">${b.label}</div>`)
        .join("")}</div></div>`).join("")}</div>
      <div class="moments"></div>`;
    sec.append(card);
    const host = card.querySelector(".moments")!;
    for (const m of a.moments) {
      await idle();
      const fig = document.createElement("figure");
      const c = make(N, N);
      const g = c.getContext("2d")!;
      g.drawImage(street, 0, 0);
      g.drawImage(compose(0, m.frame, m.enr, m.glow, m.eyes), 0, 0);
      fig.append(c);
      fig.insertAdjacentHTML("beforeend", `<figcaption>${m.t.toFixed(1)} s · ${m.note}</figcaption>`);
      host.append(fig);
    }
  }
}

/* ---------------- Action player: the plan, playing (take C) ----------------
 * Designer 2026-11-26: "it would be cool to be able to see action playing, not only frames". Each action plays in
 * real time as planned (`PLAN`): frame swaps, breath / swell, eye levels, the vein glow and its beats, dust, and a
 * rough sketch of the game's own warning FX (disc, lane, target ring, CRASH, shock ring). The street scrolls under
 * the boss when it moves. Same pictures as the bake (take C, relit).
 */
type PlayerAction = "walk" | "slam" | "charge" | "throw" | "roar" | "death";
const PLAYER_ACTIONS: readonly [PlayerAction, string][] = [
  ["walk", "Walk"],
  ["slam", "Slam"],
  ["charge", "Charge → crash"],
  ["throw", "Throw"],
  ["roar", "Roar (enrage)"],
  ["death", "Death"],
];
/** World scale of the player canvas (px per metre): rings of 4.5–5 m fit. */
const PW = 560;
/** Player scale (px per metre): 36 = the game's size; the zoom doubles it. */
let PS = 36;
const framePx = (): number => BH_R_M * 2 * 1.75 * PS; // the 7 m frame at the player's scale
/** Plain asphalt for the scrolling street (the cards' street has a vignette that would repeat as a pattern). */
const asphalt = ((): HTMLCanvasElement => {
  const c = make(256, 256);
  const g = c.getContext("2d")!;
  g.fillStyle = "#23282d";
  g.fillRect(0, 0, 256, 256);
  let q = 11;
  const rnd = (): number => ((q = (q * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 1500; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? "0,0,0" : "120,130,140"},${0.05 + rnd() * 0.08})`;
    g.fillRect(rnd() * 256, rnd() * 256, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  return c;
})();
/** One reusable canvas for the dead body's grey tint (tinting on the main canvas would grey the street too). */
const tintC = make(N, N);
interface FramePair {
  calm: Pic;
  enr: Pic;
}
const EXTRA_FRAMES: readonly { name: string; pose: BehemothPose; k: number; ph: number }[] = [
  { name: "charge_h", pose: "charge", k: 0.5, ph: 0 }, // G2 A: the charge warning, crouching
  { name: "throw_h", pose: "throw", k: 0.5, ph: 0 }, // G2 A: the throw lift, half way
];
const pairsByLook = new Map<number, Map<string, FramePair>>();
async function framePairs(v: number, onProgress: (k: number) => void): Promise<Map<string, FramePair>> {
  const have = pairsByLook.get(v);
  if (have) return have;
  const m = new Map<string, FramePair>();
  const all = [...GAME_FRAMES.map((f) => ({ name: f.name, pose: f.pose, k: f.k, ph: f.ph })), ...EXTRA_FRAMES];
  let i = 0;
  for (const f of all) {
    await idle();
    m.set(f.name, { calm: pic("c", v, f.pose, f.k, false, f.ph), enr: pic("c", v, f.pose, f.k, true, f.ph) });
    onProgress(++i / all.length);
  }
  pairsByLook.set(v, m);
  return m;
}

/** What the plan says at time t of an action. */
interface PlayState {
  frame: string;
  /** 0 calm … 1 enraged picture (the roar crossfades). */
  rage: number;
  /** Eye glow level 0–1 (multiplies the eye layer). */
  eyes: number;
  /** Steady vein glow (the ember between beats), 0–1. */
  ember: number;
  /** Seconds since the last beat (Infinity: none), and that beat's strength (1 normal, flash = all lit). */
  sinceBeat: number;
  flash: number;
  scale: number;
  /** Street scroll speed (m/s) and the boss's travel. */
  speed: number;
}
const beatsBefore = (t: number, beats: readonly number[]): number => {
  let s = Infinity;
  for (const b of beats) if (b <= t) s = Math.min(s, t - b);
  return s;
};
const lengthOf = (a: PlayerAction, enr: boolean): number => (a === "walk" ? (enr ? 0.38 : 0.5) * 6 : a === "slam" ? 2.0 : a === "charge" ? 4.0 : a === "throw" ? 2.4 : a === "roar" ? 2.5 : 2.5);
function planAt(a: PlayerAction, t: number, enr: boolean): PlayState {
  const st: PlayState = { frame: "walk_a", rage: enr ? 1 : 0, eyes: enr ? EYE_FLOOR : 1, ember: enr ? 0.25 : 0, sinceBeat: Infinity, flash: 0, scale: 1, speed: 0 };
  const step = enr ? 0.38 : 0.5;
  const eyeBeat = (since: number): number => (enr ? EYE_FLOOR + (1 - EYE_FLOOR) * Math.max(0, 1 - since / 0.25) : 1);
  if (a === "walk") {
    const n = Math.floor(t / step);
    st.frame = n % 2 === 0 ? "walk_a" : "walk_b";
    const sinceStep = t - n * step;
    st.scale = 1 - 0.01 * Math.max(0, 1 - sinceStep / 0.12) + 0.004 * Math.sin((sinceStep / step) * Math.PI); // dip on the footfall, the breath rides the step
    st.speed = 1.3 * (enr ? 1.3 : 1);
    if (enr) {
      const beats: number[] = [];
      for (let k = 0; k * step <= t; k += 3) beats.push(k * step); // every 3rd footfall
      st.sinceBeat = beatsBefore(t, beats);
      st.eyes = eyeBeat(st.sinceBeat);
    }
  } else if (a === "slam") {
    st.frame = t < 0.4 ? "slam_a" : t < 0.8 ? "slam_b" : t < 1.2 ? "slam_c" : t < 1.5 ? "slamhit_a" : "walk_a";
    st.eyes = t < 1.2 ? 0.75 + 0.25 * (t / 1.2) : t < 1.35 ? 1 : enr ? EYE_FLOOR : 1;
    if (t >= 1.2) st.scale = 1 + 0.01 * Math.max(0, 1 - (t - 1.2) / 0.8); // the exhale
    if (enr) {
      st.sinceBeat = beatsBefore(t, [0, 0.55, 0.9, 1.1, 2.4]);
      if (t >= 1.2 && t < 1.35) st.flash = 1;
    }
  } else if (a === "charge") {
    st.frame = t < 0.5 ? "charge_h" : t < 1 ? "charge_a" : t < 2 ? "rush_a" : "stun_a";
    st.eyes = t < 2 ? 1 : 0.3;
    st.speed = t >= 1 && t < 2 ? 12 : 0;
    if (t >= 2) st.scale = 1 + 0.006 * Math.sin(((t - 2) / 1.0) * Math.PI * 2); // slow, heavy, dazed breaths
    if (enr) {
      if (t < 1) st.sinceBeat = beatsBefore(t, [0, 0.4, 0.7, 0.9]);
      else if (t < 2) st.ember = 0.6;
      else st.ember = 0; // helpless: the glow goes out
    }
  } else if (a === "throw") {
    st.frame = t < 0.5 ? "throw_h" : t < 1 ? "throw_a" : "walk_a";
    st.scale = t < 1 ? 1 + 0.012 * (t / 1) : 1 + 0.012 * Math.max(0, 1 - (t - 1) / 0.4);
    st.eyes = t < 1 ? 1 : enr ? EYE_FLOOR : 1;
    if (enr) st.sinceBeat = beatsBefore(t, [0, 1.0, 2.2]);
  } else if (a === "roar") {
    st.frame = "roar_a";
    st.rage = t < 0.3 ? 0 : Math.min(1, (t - 0.3) / 1.2);
    st.scale = t < 0.3 ? 1 + 0.02 * (t / 0.3) : 1.02;
    st.eyes = 1;
    st.ember = 0.25 * st.rage;
  } else {
    st.frame = t < 0.5 ? "dead_a" : t < 1 ? "dead_b" : "dead_c";
    st.eyes = 0;
    st.ember = 0;
    st.rage = 0;
    if (enr) st.sinceBeat = t < 0.4 ? t : Infinity; // the last weak beat
  }
  if (st.sinceBeat !== Infinity && a !== "walk" && enr && a !== "death") st.eyes = Math.max(st.eyes, eyeBeat(st.sinceBeat));
  return st;
}

/* dust: deterministic puffs (soft grey discs that grow and fade) */
interface Puff {
  t0: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
}
function puffsFor(a: PlayerAction, enr: boolean): Puff[] {
  const R = BH_R_M;
  const out: Puff[] = [];
  let q = 17;
  const rnd = (): number => ((q = (q * 16807) % 2147483647) / 2147483647);
  const burst = (t0: number, x: number, y: number, n: number, spd: number, r: number, life: number): void => {
    for (let i = 0; i < n; i++) {
      const ang = rnd() * Math.PI * 2;
      const s = spd * (0.4 + rnd() * 0.6);
      out.push({ t0: t0 + rnd() * 0.08, x, y, vx: Math.cos(ang) * s, vy: Math.sin(ang) * s, r: r * (0.6 + rnd() * 0.6), life: life * (0.7 + rnd() * 0.5) });
    }
  };
  if (a === "slam") {
    for (const s of [-1, 1]) burst(1.2, 1.12 * R, s * 0.5 * R, 9, 2.2, 0.35, 0.5); // fists hit the ground
    for (const s of [-1, 1]) for (let i = 0; i < 6; i++) out.push({ t0: 1.25 + i * 0.07, x: 0.2 * R + (rnd() - 0.5) * 0.4, y: s * 0.72 * R, vx: (rnd() - 0.5) * 0.4, vy: s * (0.6 + rnd() * 0.5), r: 0.08, life: 0.5 }); // grit falls off the shoulders
  } else if (a === "charge") {
    for (let i = 0; i < 26; i++) out.push({ t0: 1 + i * 0.038, x: -1.1 * R, y: (rnd() - 0.5) * 1.4 * R, vx: -1.5 - rnd(), vy: (rnd() - 0.5) * 0.6, r: 0.3 + rnd() * 0.25, life: 0.6 }); // the trail
    burst(2.0, 1.3 * R, 0, 16, 3, 0.4, 0.6); // the crash
  } else if (a === "throw") {
    for (let i = 0; i < 8; i++) out.push({ t0: 0.3 + i * 0.08, x: (rnd() - 0.4) * 0.6, y: (rnd() - 0.5) * 0.6, vx: (rnd() - 0.5) * 0.3, vy: (rnd() - 0.5) * 0.3, r: 0.07, life: 0.4 }); // crumbs from the chunk
    burst(1.8, 6.0, 0, 12, 2, 0.4, 0.5); // the landing
  } else if (a === "roar") {
    burst(0.3, 0, 0, 22, 4.5, 0.3, 0.5); // dust blown off
  } else if (a === "death") {
    burst(1.0, -0.2, 0.3, 24, 2.2, 0.55, 0.7); // it hits the ground
  }
  void enr;
  return out;
}

function drawPlayer(g: CanvasRenderingContext2D, pairs: Map<string, FramePair>, a: PlayerAction, t: number, enr: boolean, puffs: Puff[], travel: number): void {
  const st = planAt(a, t, enr);
  const cx = PW * 0.36;
  const cy = PW / 2;
  const FRAME_PX = framePx();
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  // the street, scrolling as it walks (it faces +x, so the street slides left)
  const tile = 256;
  const off = -((travel * PS) % tile);
  for (let x = off - tile; x < PW + tile; x += tile) for (let y = 0; y < PW; y += tile) g.drawImage(asphalt, x, y, tile, tile);
  const vg = g.createRadialGradient(cx, cy, PW * 0.15, cx, cy, PW * 0.8);
  vg.addColorStop(0, "rgba(255,226,170,0.05)");
  vg.addColorStop(1, "rgba(0,0,0,0.4)");
  g.fillStyle = vg;
  g.fillRect(0, 0, PW, PW);
  // the game's warning FX, roughly
  g.save();
  if (a === "slam" && t < 1.2) {
    const p = t / 1.2;
    const gr = g.createRadialGradient(cx, cy, BH_R_M * PS, cx, cy, 4.5 * PS);
    gr.addColorStop(0, `rgba(255,59,48,${0.05 + 0.25 * p})`);
    gr.addColorStop(1, `rgba(255,59,48,${0.15 + 0.35 * p})`);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, 4.5 * PS, 0, Math.PI * 2);
    g.arc(cx, cy, BH_R_M * PS, 0, Math.PI * 2, true);
    g.fill();
    g.strokeStyle = "rgba(255,90,70,0.9)";
    g.lineWidth = 3;
    const ticks = 12;
    for (let i = 0; i < ticks; i++) {
      if (i / ticks > p) break;
      const an = (i / ticks) * Math.PI * 2 - Math.PI / 2;
      g.beginPath();
      g.moveTo(cx + Math.cos(an) * 4.3 * PS, cy + Math.sin(an) * 4.3 * PS);
      g.lineTo(cx + Math.cos(an) * 4.6 * PS, cy + Math.sin(an) * 4.6 * PS);
      g.stroke();
    }
  }
  if (a === "slam" && t >= 1.2) {
    const k = 1 - (t - 1.2) / 0.8;
    g.strokeStyle = `rgba(10,10,10,${0.7 * Math.max(0, k)})`;
    g.lineWidth = 2;
    for (let i = 0; i < 14; i++) {
      const an = (i / 14) * Math.PI * 2 + 0.3;
      g.beginPath();
      g.moveTo(cx + Math.cos(an) * 2.1 * PS, cy + Math.sin(an) * 2.1 * PS);
      g.lineTo(cx + Math.cos(an) * (3.2 + (i % 3) * 0.5) * PS, cy + Math.sin(an) * (3.2 + (i % 3) * 0.5) * PS);
      g.stroke();
    }
  }
  if (a === "charge" && t < 1) {
    g.fillStyle = "rgba(255,59,48,0.22)";
    g.fillRect(cx - BH_R_M * PS, cy - 2.4 * PS, 12 * PS, 4.8 * PS);
    g.strokeStyle = "rgba(255,59,48,0.9)";
    g.lineWidth = 2;
    g.strokeRect(cx - BH_R_M * PS, cy - 2.4 * PS, 12 * PS, 4.8 * PS);
  }
  if (a === "throw" && t < 1.8) {
    g.fillStyle = "rgba(255,59,48,0.2)";
    g.beginPath();
    g.arc(cx + 6 * PS, cy, 3 * PS, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(255,59,48,0.9)";
    g.lineWidth = 2;
    g.stroke();
  }
  if (a === "roar" && t >= 0.3 && t < 0.8) {
    const k = (t - 0.3) / 0.5;
    g.strokeStyle = `rgba(255,59,48,${0.9 * (1 - k)})`;
    g.lineWidth = 6;
    g.beginPath();
    g.arc(cx, cy, (BH_R_M + (5 - BH_R_M) * k) * PS, 0, Math.PI * 2);
    g.stroke();
  }
  g.restore();
  // the body
  const pair = pairs.get(st.frame) ?? pairs.get("walk_a")!;
  const calmP = pair.calm;
  const enrP = pair.enr;
  g.save();
  g.translate(cx, cy);
  g.scale(st.scale, st.scale);
  const half = FRAME_PX / 2;
  const deadTint = a === "death" && t > 1.5;
  if (deadTint) {
    const tg = tintC.getContext("2d")!;
    tg.globalCompositeOperation = "source-over";
    tg.clearRect(0, 0, N, N);
    tg.drawImage(calmP.base, 0, 0);
    tg.globalCompositeOperation = "source-atop";
    tg.fillStyle = `rgba(40,40,44,${Math.min(0.45, (t - 1.5) * 0.9)})`;
    tg.fillRect(0, 0, N, N);
    g.drawImage(tintC, -half, -half, FRAME_PX, FRAME_PX);
  } else {
    if (st.rage < 1) g.drawImage(calmP.base, -half, -half, FRAME_PX, FRAME_PX);
    if (st.rage > 0) {
      g.globalAlpha = st.rage;
      g.drawImage(enrP.base, -half, -half, FRAME_PX, FRAME_PX);
      g.globalAlpha = 1;
    }
  }
  g.globalCompositeOperation = "lighter";
  // eyes (the relight's glow layer); in the roar they snap from yellow to red at 0.3 s
  const eyeP = a === "roar" ? (t < 0.3 ? calmP : enrP) : st.rage > 0.5 ? enrP : calmP;
  if (eyeP.glow && st.eyes > 0) {
    g.globalAlpha = Math.min(1, st.eyes);
    g.drawImage(eyeP.glow, -half, -half, FRAME_PX, FRAME_PX);
  }
  // the vein glow: ember, beats (the wave runs out over 4 steps of 0.15 s), flash, the roar's slow wave
  const strip = (a === "death" ? pairs.get("dead_a")?.enr.veins : enrP.veins) ?? null;
  if (strip) {
    const stepDraw = (s: number, alpha: number): void => {
      if (alpha <= 0) return;
      g.globalAlpha = Math.min(1, alpha);
      g.drawImage(strip, s * N, 0, N, N, -half, -half, FRAME_PX, FRAME_PX);
    };
    if (st.ember > 0) stepDraw(4, st.ember / 0.25);
    if (st.flash > 0) for (const s of [0, 1, 2, 3]) stepDraw(s, 1);
    if (a === "roar" && t >= 0.3) {
      const k = Math.min(4, ((t - 0.3) / 1.2) * 4);
      for (let s = 0; s < Math.floor(k); s++) stepDraw(s, 0.6);
    }
    if (st.sinceBeat !== Infinity) {
      const s = st.sinceBeat / 0.15;
      const weak = a === "death" ? 0.4 * Math.max(0, 1 - st.sinceBeat / 0.4) : 1;
      if (s < 4) stepDraw(Math.floor(s), weak);
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  // the sheen (G4 A): the drifting street light
  if (calmP.sheen && a !== "death") {
    g.globalCompositeOperation = "lighter";
    const h = sheenSide(N);
    g.drawImage(calmP.sheen, sheenStep(t) * h, 0, h, h, -half, -half, FRAME_PX, FRAME_PX);
    g.globalCompositeOperation = "source-over";
  }
  g.restore();
  // the thrown chunk in flight
  if (a === "throw" && t >= 1 && t < 1.8) {
    const k = (t - 1) / 0.8;
    const x = cx + 6 * PS * k;
    const lift = Math.sin(k * Math.PI) * 1.2 * PS;
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.beginPath();
    g.ellipse(x, cy + 6, 0.6 * PS, 0.4 * PS, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#6a675f";
    g.beginPath();
    g.ellipse(x, cy - lift, 0.65 * PS * (1 + 0.3 * Math.sin(k * Math.PI)), 0.5 * PS, k * 3, 0, Math.PI * 2);
    g.fill();
  }
  // dust
  for (const p of puffs) {
    const dt = t - p.t0;
    if (dt < 0 || dt > p.life) continue;
    const k = dt / p.life;
    const x = cx + (p.x + p.vx * dt) * PS;
    const y = cy + (p.y + p.vy * dt) * PS;
    const r = p.r * (1 + k * 1.6) * PS;
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(170,166,156,${0.5 * (1 - k)})`);
    gr.addColorStop(1, "rgba(170,166,156,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  // CRASH (amber: your chance)
  if (a === "charge" && t >= 2) {
    g.save();
    g.font = "700 30px Oswald, Impact, sans-serif";
    g.textAlign = "center";
    g.fillStyle = `rgba(242,181,68,${0.9 * (0.6 + 0.4 * Math.sin(t * 8))})`;
    g.fillText("CRASH", cx + 1.6 * PS, cy - 2.6 * PS);
    g.restore();
  }
}

async function actionPlayer(): Promise<void> {
  const main = document.querySelector("main")!;
  const sec = document.createElement("section");
  sec.innerHTML = `<h2>Watch the actions play (take C, as planned)</h2>
  <p>Each action plays in real time as the plan says: the frames the game shows, the breath, the eyes, the heartbeat glow, dust, and a rough sketch of the game's own warnings (disc, lane, target ring, CRASH, shock ring). Pick an action, calm or enraged, a look and a speed.</p>
  <div class="card player"><div class="pc">
    <div class="row" id="pl-actions"></div>
    <div class="row"><span id="pl-mode"></span><span id="pl-looks"></span><span id="pl-speed"></span><span id="pl-zoom"></span><button id="pl-pause" aria-pressed="false">Pause</button></div>
    <canvas id="pl-canvas" width="${PW}" height="${PW}"></canvas>
    <div class="row"><div class="bar"><i id="pl-head"></i></div><span id="pl-time">0.00 s</span></div>
    <p id="pl-goal"></p><p id="pl-loading" class="timing"></p>
  </div></div>`;
  main.insertBefore(sec, main.querySelector("h2"));
  let action: PlayerAction = "slam";
  let enr = true;
  let look = 0;
  let speed = 1;
  let paused = false;
  let pairs: Map<string, FramePair> | null = null;
  let t = 0;
  let travel = 0;
  let last = performance.now();
  let puffs = puffsFor(action, enr);
  const canvas = document.getElementById("pl-canvas") as HTMLCanvasElement;
  const g = canvas.getContext("2d")!;
  const goal = document.getElementById("pl-goal")!;
  const loading = document.getElementById("pl-loading")!;
  const head = document.getElementById("pl-head")!;
  const time = document.getElementById("pl-time")!;
  const setGoal = (): void => {
    const p = PLAN.find((x) => x.id === action);
    goal.innerHTML = p ? `<b>Goal:</b> ${p.goal}` : "";
  };
  const group = (host: HTMLElement, items: readonly [string, string][], pick: (id: string) => void, on: string): void => {
    for (const [id, label] of items) {
      const b = document.createElement("button");
      b.textContent = label;
      b.setAttribute("aria-pressed", String(id === on));
      b.addEventListener("click", () => {
        for (const x of host.querySelectorAll("button")) x.setAttribute("aria-pressed", String(x === b));
        pick(id);
      });
      host.append(b);
    }
  };
  const restart = (): void => {
    t = 0;
    puffs = puffsFor(action, enr);
    setGoal();
  };
  group(document.getElementById("pl-actions")!, PLAYER_ACTIONS, (id) => {
    action = id as PlayerAction;
    restart();
  }, action);
  group(document.getElementById("pl-mode")!, [["calm", "Calm"], ["enr", "Enraged"]], (id) => {
    enr = id === "enr";
    restart();
  }, "enr");
  const loadLook = async (v: number): Promise<void> => {
    pairs = null;
    loading.textContent = "Drawing the frames…";
    const got = await framePairs(v, (k) => (loading.textContent = `Drawing the frames… ${Math.round(k * 100)} %`));
    if (look === v) {
      pairs = got;
      loading.textContent = "";
    }
  };
  group(document.getElementById("pl-looks")!, BEHEMOTH_LOOK_IDS.map((id, i) => [String(i), id] as [string, string]), (id) => {
    look = Number(id);
    void loadLook(look);
  }, "0");
  group(document.getElementById("pl-speed")!, [["1", "1×"], ["0.5", "½×"], ["0.25", "¼×"]], (id) => (speed = Number(id)), "1");
  group(document.getElementById("pl-zoom")!, [["36", "Game size"], ["72", "Zoom 2×"]], (id) => (PS = Number(id)), "36");
  const pauseBtn = document.getElementById("pl-pause")!;
  pauseBtn.addEventListener("click", () => {
    paused = !paused;
    pauseBtn.setAttribute("aria-pressed", String(paused));
    pauseBtn.textContent = paused ? "Play" : "Pause";
  });
  setGoal();
  const tick = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const len = lengthOf(action, enr);
    if (!paused) {
      t += dt * speed;
      travel += planAt(action, Math.min(t, len), enr).speed * dt * speed;
      if (t > len + 0.8) {
        t = 0;
        puffs = puffsFor(action, enr);
      }
    }
    const tt = Math.min(t, len);
    if (pairs) drawPlayer(g, pairs, action, tt, enr, puffs, travel);
    head.style.left = `${(tt / len) * 100}%`;
    time.textContent = `${tt.toFixed(2)} s / ${len.toFixed(2)} s`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  await loadLook(0);
}

const animBtn = document.getElementById("anim")!;
animBtn.setAttribute("aria-pressed", String(playing));
animBtn.textContent = playing ? "Animation on" : "Animation off";
animBtn.addEventListener("click", () => {
  playing = !playing;
  animBtn.setAttribute("aria-pressed", String(playing));
  animBtn.textContent = playing ? "Animation on" : "Animation off";
  if (playing) requestAnimationFrame(frame);
  else for (const a of anims) drawAnim(a, 0);
});
const enrBtn = document.getElementById("enr")!;
enrBtn.addEventListener("click", () => {
  enraged = !enraged;
  enrBtn.setAttribute("aria-pressed", String(enraged));
  if (!playing) for (const a of anims) drawAnim(a, 0);
});
void main();
