/**
 * Round 4 (designer, 2026-11-24): boss effects "look like stickers" and are "not photoreal enough". So
 * nothing floats on top any more: the marks are things happening IN the street. Two directions, each
 * showing the three jobs: who the Behemoth is after (target), where it is when off screen (edge), and
 * what it is about to do (slam / charge / throw), all animated.
 * - W1 "Red light": light does the talking: a red pool on the asphalt under the target with lit dust
 *   motes; a red wash and light shafts bleeding in from the screen edge; the attack changes the light.
 * - W2 "Tremor": the ground does the talking: the street cracks and pebbles jump under the target with
 *   every footstep; dust rolls in from the edge; the attack changes the dust.
 */
import { drawSurvivor } from "../../../../apps/client/src/render/city/spriteArt";
import { GROUND } from "../../../../apps/client/src/render/city/palette";
import { TAU, asphalt, canvas, ctx, groundDamage, hash2, night, put, type G } from "./lib";

type Attack = "walk" | "slam" | "charge" | "throw";

const W = 520;
const H = 300;
const PM = 30; // px per metre in these mock-ups

/** The night street with one survivor (the target) and a few others; the boss is off screen to the right. */
function street(seed: number): HTMLCanvasElement {
  const c = canvas(W, H);
  const g = ctx(c);
  asphalt(g, W, H, seed);
  g.fillStyle = GROUND.sidewalk;
  g.fillRect(0, 0, W, 44);
  g.fillStyle = GROUND.curb;
  g.fillRect(0, 44, W, 3);
  g.fillStyle = GROUND.lane;
  for (let x = 0; x < W; x += 70) g.fillRect(x, 200, 40, 3);
  night(g, W, H, 0.55, [[120, 30, 160]]);
  return c;
}

const TARGET = { x: 190, y: 150 };
const OTHERS: [number, number, number][] = [
  [90, 110, 0.4],
  [120, 230, -0.3],
];

function survivors(g: G, t: number, shake: number): void {
  for (const [x, y, a] of OTHERS) {
    g.save();
    g.translate(x, y);
    g.rotate(a);
    drawSurvivor(g, 0.42 * PM);
    g.restore();
  }
  g.save();
  g.translate(TARGET.x + shake, TARGET.y);
  g.rotate(Math.sin(t * 0.7) * 0.3); // looking around
  drawSurvivor(g, 0.42 * PM);
  g.restore();
}

/** Footstep beat: a thump every 0.9 s (0 → 1 just after each step). */
const thump = (t: number): number => Math.max(0, 1 - ((t % 0.9) / 0.9) * 4);

// ─────────────────────────────── W1: red light ───────────────────────────────

function redPool(g: G, x: number, y: number, r: number, a: number): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(255,50,30,${0.42 * a})`);
  gr.addColorStop(0.55, `rgba(255,40,25,${0.2 * a})`);
  gr.addColorStop(1, "rgba(255,30,20,0)");
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, 2 * r, 2 * r);
}

function w1Target(g: G, t: number): void {
  g.save();
  g.globalCompositeOperation = "lighter";
  const a = 0.75 + 0.25 * Math.sin(t * 5);
  redPool(g, TARGET.x, TARGET.y, 1.5 * PM, a);
  // dust motes drifting through the light
  for (let i = 0; i < 26; i++) {
    const ang = hash2(i, 1, 9) * TAU + t * (0.2 + hash2(i, 2, 9) * 0.3);
    const d = (0.3 + hash2(i, 3, 9) * 1.1) * PM;
    const x = TARGET.x + Math.cos(ang) * d;
    const y = TARGET.y + Math.sin(ang) * d * 0.9 - ((t * 6 + i * 3) % 12);
    const fade = 1 - d / (1.5 * PM);
    g.fillStyle = `rgba(255,170,140,${0.55 * fade})`;
    g.fillRect(x, y, 1.4, 1.4);
  }
  g.restore();
}

function w1Edge(g: G, t: number, atk: Attack): void {
  g.save();
  g.globalCompositeOperation = "lighter";
  const by = 160; // the boss is off screen to the right, at this height
  let k = 0.65 + 0.2 * Math.sin(t * 3) + 0.25 * thump(t);
  if (atk === "slam") k += 0.6 * Math.pow(Math.max(0, Math.sin(t * 9)), 8); // flashes on a quickening beat
  const wash = g.createRadialGradient(W + 40, by, 10, W + 40, by, 300);
  wash.addColorStop(0, `rgba(255,50,30,${0.55 * k})`);
  wash.addColorStop(1, "rgba(255,40,25,0)");
  g.fillStyle = wash;
  g.fillRect(W - 300, 0, 300, H);
  // light shafts sweeping in from the boss
  const spread = atk === "charge" ? 0.06 : 0.35;
  const aim = atk === "charge" ? Math.atan2(TARGET.y - by, TARGET.x - (W + 40)) : Math.PI + Math.sin(t * 0.8) * 0.15;
  for (let i = 0; i < (atk === "charge" ? 1 : 3); i++) {
    const a = aim + (i - 1) * spread + Math.sin(t * 1.3 + i) * 0.04;
    const len = atk === "charge" ? 420 : 260;
    const gr = g.createLinearGradient(W + 40, by, W + 40 + Math.cos(a) * len, by + Math.sin(a) * len);
    gr.addColorStop(0, `rgba(255,70,40,${(atk === "charge" ? 0.45 : 0.22) * k})`);
    gr.addColorStop(1, "rgba(255,60,30,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.moveTo(W + 40, by);
    const half = atk === "charge" ? 0.05 : 0.07;
    g.lineTo(W + 40 + Math.cos(a - half) * len, by + Math.sin(a - half) * len);
    g.lineTo(W + 40 + Math.cos(a + half) * len, by + Math.sin(a + half) * len);
    g.closePath();
    g.fill();
  }
  g.restore();
  if (atk === "throw") throwShadow(g, t, true);
}

/** The thrown chunk's shadow growing on the ground where it will land (both directions). */
function throwShadow(g: G, t: number, red: boolean): void {
  const p = (t % 2.2) / 2.2;
  const x = TARGET.x + 40;
  const y = TARGET.y + 30;
  const r = (0.4 + p * 1.1) * PM;
  g.save();
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(0,0,0,${0.25 + p * 0.5})`);
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(x, y, r, r * 0.8, 0, 0, TAU);
  g.fill();
  if (red) {
    g.globalCompositeOperation = "lighter";
    g.strokeStyle = `rgba(255,60,40,${0.2 + p * 0.5})`;
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(x, y, r, r * 0.8, 0, 0, TAU);
    g.stroke();
  }
  // grit falling ahead of the chunk
  g.globalCompositeOperation = "source-over";
  for (let i = 0; i < 10; i++) {
    const fx = x + (hash2(i, 1, 4) - 0.5) * r * 1.4;
    const fy = y + (hash2(i, 2, 4) - 0.5) * r - (1 - ((t * 1.6 + hash2(i, 3, 4)) % 1)) * 30;
    g.fillStyle = "rgba(170,160,148,0.7)";
    g.fillRect(fx, fy, 1.5, 1.5);
  }
  g.restore();
}

// ─────────────────────────────── W2: tremor ───────────────────────────────

const crackDecal = groundDamage({ bowl: 0, cracks: 7, soot: 0, rays: 0.3, debris: 120, seed: 41, fine: 5 });

function w2Target(g: G, t: number): number {
  const th = thump(t);
  // the street cracks under the target (grows over the hunt), lit faintly red from inside
  g.save();
  g.globalAlpha = 0.75;
  const s = 3.2 * PM;
  g.drawImage(crackDecal, TARGET.x - s / 2, TARGET.y - s / 2, s, s);
  g.restore();
  g.save();
  g.globalCompositeOperation = "lighter";
  const gr = g.createRadialGradient(TARGET.x, TARGET.y, 0, TARGET.x, TARGET.y, 0.9 * PM);
  gr.addColorStop(0, `rgba(255,70,30,${0.12 + th * 0.25})`);
  gr.addColorStop(1, "rgba(255,60,20,0)");
  g.fillStyle = gr;
  g.fillRect(TARGET.x - PM, TARGET.y - PM, 2 * PM, 2 * PM);
  g.restore();
  // pebbles jump on each footstep, dust puffs
  for (let i = 0; i < 18; i++) {
    const a = hash2(i, 1, 7) * TAU;
    const d = (0.5 + hash2(i, 2, 7) * 1.1) * PM;
    const hop = th * (4 + hash2(i, 3, 7) * 6);
    const x = TARGET.x + Math.cos(a) * d;
    const y = TARGET.y + Math.sin(a) * d;
    g.fillStyle = "rgba(0,0,0,0.5)";
    g.fillRect(x + 1, y + 1, 2, 2);
    g.fillStyle = "rgb(120,114,104)";
    g.fillRect(x, y - hop, 2, 2);
  }
  if (th > 0) {
    const r = (1.2 + (1 - th) * 0.8) * PM;
    const dg = g.createRadialGradient(TARGET.x, TARGET.y, r * 0.6, TARGET.x, TARGET.y, r);
    dg.addColorStop(0, "rgba(150,140,126,0)");
    dg.addColorStop(0.8, `rgba(150,140,126,${0.22 * th})`);
    dg.addColorStop(1, "rgba(150,140,126,0)");
    g.fillStyle = dg;
    g.fillRect(TARGET.x - r, TARGET.y - r, 2 * r, 2 * r);
  }
  return th * 1.5; // camera shake
}

function dustCloud(g: G, x: number, y: number, r: number, a: number): void {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(120,112,100,${a})`);
  gr.addColorStop(1, "rgba(120,112,100,0)");
  g.fillStyle = gr;
  g.fillRect(x - r, y - r, 2 * r, 2 * r);
}

function w2Edge(g: G, t: number, atk: Attack): void {
  // dust rolling in from the boss's side, thicker on every footstep
  const th = thump(t);
  for (let i = 0; i < 40; i++) {
    const y = 30 + hash2(i, 1, 3) * (H - 60);
    const life = (t * (0.15 + hash2(i, 4, 3) * 0.2) + hash2(i, 2, 3)) % 1;
    const x = W + 10 - life * (70 + hash2(i, 5, 3) * 70);
    const fade = Math.sin(life * Math.PI);
    dustCloud(g, x, y + Math.sin(t + i) * 4, 10 + hash2(i, 3, 3) * 22 + life * 14, (0.07 + th * 0.06) * fade);
  }
  // a faint red heat glow far off, where it stands
  g.save();
  g.globalCompositeOperation = "lighter";
  const wash = g.createRadialGradient(W + 60, 160, 10, W + 60, 160, 160);
  wash.addColorStop(0, `rgba(255,60,30,${0.25 + th * 0.2})`);
  wash.addColorStop(1, "rgba(255,40,20,0)");
  g.fillStyle = wash;
  g.fillRect(W - 160, 0, 160, H);
  g.restore();
  if (atk === "slam") {
    // a dust shock ring bursting at the edge on the quickening beat
    const p = (t % 1.1) / 1.1;
    const r = 30 + p * 160;
    g.save();
    g.strokeStyle = `rgba(150,140,126,${0.4 * (1 - p)})`;
    g.lineWidth = 18 * (1 - p) + 4;
    g.beginPath();
    g.arc(W + 30, 160, r, 0, TAU);
    g.stroke();
    g.restore();
  }
  if (atk === "charge") {
    // dust streaks racing toward the target along its line
    for (let i = 0; i < 14; i++) {
      const u = (t * 1.4 + hash2(i, 1, 5)) % 1;
      const y0 = 160 + (hash2(i, 2, 5) - 0.5) * 50;
      const x = W - u * (W - TARGET.x);
      const y = y0 + (TARGET.y - y0) * u;
      g.strokeStyle = `rgba(160,150,136,${0.35 * (1 - u)})`;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x + 30, y + ((160 - TARGET.y) / (W - TARGET.x)) * 30);
      g.stroke();
    }
  }
  if (atk === "throw") throwShadow(g, t, false);
}

// ─────────────────────────────── page wiring ───────────────────────────────

function animate(dir: "W1" | "W2", atk: Attack): HTMLCanvasElement {
  const c = canvas(W, H);
  const g = ctx(c);
  const bg = street(dir === "W1" ? 11 : 12);
  const t0 = performance.now();
  const frame = (now: number): void => {
    const t = (now - t0) / 1000;
    let shake = 0;
    g.save();
    if (dir === "W2") shake = thump(t) * 1.5 * Math.sin(t * 60);
    g.translate(shake, 0);
    g.drawImage(bg, 0, 0);
    if (dir === "W1") w1Target(g, t);
    else w2Target(g, t);
    survivors(g, t, 0);
    if (dir === "W1") w1Edge(g, t, atk);
    else w2Edge(g, t, atk);
    g.restore();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return c;
}

for (const dir of ["W1", "W2"] as const) for (const atk of ["walk", "slam", "charge", "throw"] as const) put(`${dir}-${atk}`, animate(dir, atk));
