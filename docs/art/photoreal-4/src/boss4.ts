/**
 * Photoreal, group 4: the Behemoth (designer 2026-11-26, "Yes" to the Behemoth next). Take A: today's drawing
 * (`behemothArt.ts`, copied here as `behemoth4.ts` with take B's detail switched off) through the characters' in-game
 * relight (`charRelight.ts`, Story 9.13). Take B: the same with new detail drawn into the body before the relight.
 * Drawn at 48 px per metre (the game: 36). Built into ../compare.html by build.mjs.
 */
import { drawBehemoth as drawToday } from "../../../../apps/client/src/render/city/behemothArt";
import { relightCharSteps, sheenStep, sheenStrip, sheenSide } from "../../../../apps/client/src/render/city/charRelight";
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
type Take = "now" | "a" | "b" | "v2" | "v3" | "mix";

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
/** V3's steady glow (no pulse): about take B's static red. */
const STEADY_GLOW = 0.6;
/** The pulse's wave front: a bright beat at radius (or path length) d at time t. */
const beat = (d: number, t: number, spacing: number): number => Math.pow(Math.max(0, Math.cos(((d - t * (spacing / VEIN_PERIOD_S)) / spacing) * Math.PI * 2)), 6);
/**
 * V2: finds take B's enraged vein cores (drawn magenta in "marker" mode, so only the parts not covered by the shirt or
 * vest show), paints them dark red in the source before the relight, and returns their pulse strip: each vein pixel
 * lights with a beat running outward from the chest (by radius).
 */
function markerPulse(src: HTMLCanvasElement, pulse = true): HTMLCanvasElement {
  const W = src.width;
  const sg = src.getContext("2d", { willReadFrequently: true })!;
  const img = sg.getImageData(0, 0, W, W);
  const d = img.data;
  const mask = new Float32Array(N * N);
  for (let i = 0; i < W * W; i++) {
    const r = d[i * 4] as number;
    const g = d[i * 4 + 1] as number;
    const b = d[i * 4 + 2] as number;
    const m = Math.max(0, Math.min(1, ((Math.min(r, b) - g) / 255 - 0.25) * 2));
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
  const cx = N / 2 - 0.1 * R;
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
  setDetail(t !== "a");
  setVeinMode(t === "v2" ? "marker" : t === "v3" || t === "mix" ? "organic" : "static");
  const src = make(N * SS, N * SS);
  const s = src.getContext("2d", { willReadFrequently: true })!;
  s.translate(N, N);
  drawBehemoth(s, PXM * SS, v, pose, k, enr, ph);
  const veins = t !== "a" && t !== "b" && enr && pose !== "dead" ? markerPulse(src, t !== "v3") : null;
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
    const pulse = 0.55 + 0.45 * Math.sin(t * (enraged ? 5 : 2.2));
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
const CAPTION: Record<Take, string> = { now: "Now", a: "Take A: relit", b: "Take B: new detail", v2: "B + V2: pulse", v3: "B + V3: organic", mix: "B + V2/V3 mix" };
const TAKES: Take[] = ["now", "a", "b", "v2", "v3", "mix"];

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
      const normal: [Pic, Pic] = [pic(t, v, "walk", 0, false, 0), pic(t, v, "walk", 0, false, 0.5)];
      await idle();
      const enr: [Pic, Pic] = [pic(t, v, "walk", 0, true, 0), pic(t, v, "walk", 0, true, 0.5)];
      const a: Anim = { canvas: c, take: t, frames: { normal, enraged: enr }, v };
      anims.push(a);
      drawAnim(a, 0);
    }
  }
  document.getElementById("loading")!.hidden = true;
  if (playing) requestAnimationFrame(frame);
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
    ["a", false, CAPTION.a],
    ["b", false, CAPTION.b],
    ["v2", true, "B + V2, enraged"],
    ["v3", true, "B + V3, enraged"],
    ["mix", false, CAPTION.mix],
    ["mix", true, "Mix, enraged"],
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
  (window as unknown as { done: boolean }).done = true;
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
