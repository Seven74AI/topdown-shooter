/**
 * Story 4.9: placeholder sprite art drawn with Canvas 2D (from `downtown-look-study.html`, itself
 * from `style-lab-r3.html`). Every function draws one atlas frame in local coordinates; the atlas
 * builder (`spriteAtlas.ts`) places them. No Phaser here.
 */
import type { ZombieTypeId } from "@topdown/shared";
import { CAR_COLORS, CAR_WRECK } from "./dressing";
import { drawSpitter } from "./spitterArt";
import { drawBrute } from "./bruteArt";

type G = CanvasRenderingContext2D;

export function hash(n: number): number {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}
export function circle(c: G, x: number, y: number, r: number): void {
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
}
export function ell(c: G, x: number, y: number, rx: number, ry: number, a = 0): void {
  c.beginPath();
  c.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), a, 0, Math.PI * 2);
}
/** Rounded rectangle path (no `roundRect`: older Safari). */
export function rrect(c: G, x: number, y: number, w: number, h: number, r: number): void {
  const q = Math.max(0, Math.min(r, w / 2, h / 2));
  c.beginPath();
  c.moveTo(x + q, y);
  c.lineTo(x + w - q, y);
  c.quadraticCurveTo(x + w, y, x + w, y + q);
  c.lineTo(x + w, y + h - q);
  c.quadraticCurveTo(x + w, y + h, x + w - q, y + h);
  c.lineTo(x + q, y + h);
  c.quadraticCurveTo(x, y + h, x, y + h - q);
  c.lineTo(x, y + q);
  c.quadraticCurveTo(x, y, x + q, y);
  c.closePath();
}
export function rgbOf(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}
/** `h` moved toward white (t > 0) or black (t < 0). */
export function shade(h: string, t: number): string {
  const f = t < 0 ? 0 : 255;
  const a = Math.abs(t);
  const c = rgbOf(h).map((v) => Math.round(v + (f - v) * a));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
export function bevel(g: G, x: number, y: number, w: number, h: number, b: number, hi: string, lo: string): void {
  g.fillStyle = hi;
  g.fillRect(x, y, w, b);
  g.fillRect(x, y, b, h);
  g.fillStyle = lo;
  g.fillRect(x, y + h - b, w, b);
  g.fillRect(x + w - b, y, b, h);
}
export function outline(g: G, x: number, y: number, w: number, h: number, lw = 1.6): void {
  g.strokeStyle = "#08080a";
  g.lineWidth = lw;
  g.strokeRect(x, y, w, h);
}

// ---------------------------------------------------------------------------
// Characters (facing +x, centred on the body; units: px, `r` = collision radius in px)
// ---------------------------------------------------------------------------

/**
 * Night-muted character colours (characters are drawn above the lightmap, D5, so they carry the
 * darkness themselves). Runner: pale skin + dark-red shirt (Story 3.8 rule); Crawler darker (3.9).
 */
export const CHAR = {
  skin: "#7c8676",
  runnerSkin: "#a99c84",
  crawlerSkin: "#5d6658",
  hair: "#231f1c",
  outline: "rgba(6,6,6,0.7)",
  blood: "#5a0c0a",
  walkerShirts: ["#454c5a", "#574636", "#3b4636", "#625849"],
  runnerShirts: ["#6e2a24", "#5e2a2e"],
  crawlerShirts: ["#2c3328", "#3a2e2a"],
  jacket: "#3c5670",
  pack: "#26251f",
  cap: "#1f2326",
  survivorSkin: "#c49a7c",
  gun: "#17181a",
} as const;

/** Half-size of each type's frame, in collision radii (the frame is a square of 2 × this). */
export const CHAR_EXTENT_R: Readonly<Record<ZombieTypeId | "survivor", number>> = {
  walker: 1.55,
  runner: 1.5,
  crawler: 1.75,
  spitter: 2.35, // Story 5.6 (P4): mouth drops ahead and the acid trail behind (drawn × SPITTER_ART_SCALE) reach ~2.3 r
  brute: 1.5, // Story 5.7: fists ~1.2 r ahead, the windup fists ~1.45 r to the side, BR5's dragged chain ~1.3 r behind
  survivor: 2.15,
};

function wounds(c: G, r: number, seed: number, n: number): void {
  c.fillStyle = CHAR.blood;
  for (let i = 0; i < n; i++) {
    circle(c, -r * 0.2 + (hash(seed + i) - 0.5) * r * 0.6, (hash(seed * 2 + i) - 0.5) * r * 1.3, r * (0.1 + hash(seed + i * 5) * 0.12));
    c.fill();
  }
}

/** One zombie, top-down, facing +x, at (0, 0). */
export function drawZombie(c: G, type: ZombieTypeId, r: number, variant: number, windup = false): void {
  // Story 5.6: the Spitter's whole look is one function (the designer's pick drops in there).
  if (type === "spitter") return drawSpitter(c, r, variant, windup);
  // Story 5.7: the Brute's five looks (BR1–BR5) and its windup pose, one function.
  if (type === "brute") return drawBrute(c, r, variant, windup);
  const seed = 5 + variant * 13 + (type === "runner" ? 100 : type === "crawler" ? 200 : 0);
  c.lineJoin = "round";
  c.strokeStyle = CHAR.outline;
  c.lineWidth = Math.max(1, r * 0.1);
  if (type === "crawler") {
    const skin = CHAR.crawlerSkin;
    const shirt = CHAR.crawlerShirts[variant % CHAR.crawlerShirts.length] as string;
    // arms clawing forward, spread
    for (const s of [-1, 1]) {
      c.save();
      c.translate(r * 0.15, s * r * 0.45);
      c.rotate(s * (0.55 + s * 0.2));
      c.fillStyle = skin;
      rrect(c, 0, -r * 0.15, r * 1.1, r * 0.3, r * 0.15);
      c.fill();
      c.stroke();
      c.restore();
    }
    c.fillStyle = CHAR.blood;
    ell(c, -r * 1.3, 0, r * 0.3, r * 0.38);
    c.fill();
    c.fillStyle = shirt;
    ell(c, -r * 0.5, 0, r * 0.95, r * 0.55);
    c.fill();
    c.stroke();
    wounds(c, r, seed, 2);
    c.fillStyle = skin;
    circle(c, r * 0.55, 0, r * 0.42);
    c.fill();
    c.stroke();
    c.fillStyle = CHAR.hair;
    ell(c, r * 0.42, 0, r * 0.26, r * 0.32);
    c.fill();
    return;
  }
  if (type === "runner") {
    const skin = CHAR.runnerSkin;
    const shirt = CHAR.runnerShirts[variant % CHAR.runnerShirts.length] as string;
    // sprinting: one arm forward, one swept back; leaning torso, head pushed out
    c.strokeStyle = skin;
    c.lineCap = "round";
    c.lineWidth = r * 0.28;
    c.beginPath();
    c.moveTo(0, -r * 0.55);
    c.lineTo(r * 0.85, -r * 0.8);
    c.moveTo(0, r * 0.55);
    c.lineTo(-r * 0.85, r * 0.8);
    c.stroke();
    c.lineCap = "butt";
    c.strokeStyle = CHAR.outline;
    c.lineWidth = Math.max(1, r * 0.1);
    c.fillStyle = shirt;
    ell(c, -r * 0.1, 0, r * 0.42, r * 0.8, 0.12);
    c.fill();
    c.stroke();
    wounds(c, r, seed, 1);
    c.fillStyle = skin;
    circle(c, r * 0.42, 0, r * 0.4);
    c.fill();
    c.stroke();
    c.fillStyle = CHAR.hair;
    ell(c, r * 0.28, 0, r * 0.26, r * 0.32);
    c.fill();
    return;
  }
  // walker: shoulders, both arms reaching forward
  const skin = CHAR.skin;
  const shirt = CHAR.walkerShirts[variant % CHAR.walkerShirts.length] as string;
  const len = r * 1.25;
  for (const s of [-1, 1]) {
    c.fillStyle = skin;
    rrect(c, 0, s * r * 0.62 - r * 0.15, len + s * r * 0.08, r * 0.3, r * 0.15);
    c.fill();
    c.stroke();
  }
  c.fillStyle = shirt;
  ell(c, -r * 0.15, 0, r * 0.5, r * 0.95);
  c.fill();
  c.stroke();
  wounds(c, r, seed, 2);
  c.fillStyle = skin;
  circle(c, r * 0.14, 0, r * 0.46);
  c.fill();
  c.stroke();
  c.fillStyle = CHAR.hair;
  ell(c, -r * 0.04, 0, r * 0.3, r * 0.38);
  c.fill();
}

/**
 * The survivor, top-down, facing +x (gun forward), at (0, 0). The slot ring is PlayerView's.
 * Story 5.3: `heldGun` draws a weapon's own top-down art in place of the plain gun (under the arms).
 */
export function drawSurvivor(c: G, r: number, heldGun?: (c: G, r: number) => void): void {
  c.lineJoin = "round";
  c.strokeStyle = CHAR.outline;
  c.lineWidth = Math.max(1, r * 0.08);
  if (heldGun) {
    c.save();
    heldGun(c, r);
    c.restore();
  } else {
    c.fillStyle = CHAR.gun;
    rrect(c, r * 0.3, -r * 0.13, r * 1.75, r * 0.26, 1);
    c.fill();
  }
  c.strokeStyle = CHAR.jacket;
  c.lineCap = "round";
  c.lineWidth = r * 0.3;
  c.beginPath();
  c.moveTo(0, -r * 0.6);
  c.lineTo(r * 0.85, -r * 0.1);
  c.moveTo(0, r * 0.6);
  c.lineTo(r * 0.55, r * 0.12);
  c.stroke();
  c.lineCap = "butt";
  c.strokeStyle = CHAR.outline;
  c.lineWidth = Math.max(1, r * 0.08);
  c.fillStyle = CHAR.pack;
  rrect(c, -r * 0.98, -r * 0.48, r * 0.5, r * 0.96, r * 0.15);
  c.fill();
  c.fillStyle = CHAR.jacket;
  ell(c, -r * 0.05, 0, r * 0.52, r * 0.9);
  c.fill();
  c.stroke();
  c.fillStyle = CHAR.survivorSkin;
  circle(c, r * 0.12, 0, r * 0.4);
  c.fill();
  c.stroke();
  c.fillStyle = CHAR.cap;
  ell(c, r * 0.02, 0, r * 0.36, r * 0.4);
  c.fill();
  c.beginPath();
  c.ellipse(r * 0.38, 0, r * 0.16, r * 0.3, 0, -Math.PI / 2, Math.PI / 2);
  c.fill();
}

// ---------------------------------------------------------------------------
// Vehicles and props (local map px: the object's box is (0, 0, w, h))
// ---------------------------------------------------------------------------

/** The city bus, front (crushed) at x = 0, in a w × h box. */
export function drawBus(g: G, w: number, h: number): void {
  const x = 0;
  const y = 0;
  const ins = 5;
  const axles = [x + 58, x + w - 78];
  g.fillStyle = "#0b0b0c";
  for (const ax of axles) {
    g.fillRect(ax - 16, y + 1, 32, 7);
    g.fillRect(ax - 16, y + h - 8, 32, 7);
  }
  g.fillStyle = "#26282a";
  for (const ax of axles) {
    g.beginPath();
    g.ellipse(ax, y + ins, 19, 4, 0, Math.PI, 0);
    g.fill();
    g.beginPath();
    g.ellipse(ax, y + h - ins, 19, 4, 0, 0, Math.PI);
    g.fill();
  }
  const body = (): void => {
    g.beginPath();
    g.moveTo(x + 16, y + ins);
    g.lineTo(x + w - 7, y + ins);
    g.quadraticCurveTo(x + w - 2, y + ins, x + w - 2, y + ins + 5);
    g.lineTo(x + w - 2, y + h - ins - 5);
    g.quadraticCurveTo(x + w - 2, y + h - ins, x + w - 7, y + h - ins);
    g.lineTo(x + 18, y + h - ins);
    g.lineTo(x + 9, y + h - ins - 5);
    g.lineTo(x + 13, y + h - 24);
    g.lineTo(x + 3, y + h - 33);
    g.lineTo(x + 10, y + 42);
    g.lineTo(x + 2, y + 31);
    g.lineTo(x + 11, y + 20);
    g.lineTo(x + 6, y + ins + 6);
    g.closePath();
  };
  g.fillStyle = "#8a877b";
  body();
  g.fill();
  g.fillStyle = "#3f6086";
  g.fillRect(x + 22, y + ins + 1, w - 30, 3);
  g.fillRect(x + 22, y + h - ins - 4, w - 30, 3);
  const wy1 = y + ins + 5;
  const wy2 = y + h - ins - 12;
  const wx0 = x + 30;
  const wx1 = x + w - 22;
  for (const wy of [wy1, wy2]) {
    g.fillStyle = "#101820";
    g.fillRect(wx0, wy, wx1 - wx0, 7);
    g.fillStyle = "rgba(150,180,210,0.18)";
    g.fillRect(wx0, wy, wx1 - wx0, 2);
    g.fillStyle = "#8a877b";
    for (let px = wx0 + 26; px < wx1; px += 28) g.fillRect(px, wy, 3, 7);
  }
  g.strokeStyle = "rgba(220,230,240,0.45)";
  g.lineWidth = 0.8;
  g.beginPath();
  for (const [bx, by] of [
    [x + 98, wy1 + 3],
    [x + 210, wy2 + 3],
    [x + 150, wy2 + 4],
  ] as const) {
    for (let k = 0; k < 4; k++) {
      g.moveTo(bx, by);
      g.lineTo(bx + (hash(bx + k) - 0.5) * 20, by + (hash(by + k) - 0.5) * 7);
    }
  }
  g.stroke();
  const rx = x + 24;
  const ry = y + ins + 14;
  const rw = w - 40;
  const rh = h - 2 * ins - 28;
  g.fillStyle = "#b3afa1";
  g.fillRect(rx, ry, rw, rh);
  for (let i = 0; i < 500; i++) {
    g.fillStyle = hash(i * 1.7) > 0.5 ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.08)";
    g.fillRect(rx + hash(i * 3.1) * rw, ry + hash(i * 5.3) * rh, 1.3, 1.3);
  }
  bevel(g, rx, ry, rw, rh, 1.5, "rgba(255,255,255,0.35)", "rgba(0,0,0,0.35)");
  g.save();
  g.fillStyle = "rgba(30,32,36,0.6)";
  g.font = "800 20px system-ui, sans-serif";
  g.textBaseline = "middle";
  g.fillText("4217", rx + 50, ry + rh / 2 + 1);
  g.restore();
  for (const hx of [rx + 14, rx + 128]) {
    g.fillStyle = "#8f8c80";
    g.fillRect(hx, ry + rh / 2 - 9, 18, 18);
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 1;
    g.strokeRect(hx, ry + rh / 2 - 9, 18, 18);
  }
  // AC unit (raised): a short hard shadow toward the light direction, then the box
  const ax = x + w - 118;
  const ay = y + 20;
  const aw = 72;
  const ah = 40;
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.fillRect(ax + 4, ay + 6, aw, ah);
  g.fillStyle = "#7a7e80";
  g.fillRect(ax, ay, aw, ah);
  bevel(g, ax, ay, aw, ah, 2, "rgba(255,255,255,0.3)", "rgba(0,0,0,0.45)");
  for (const fx of [ax + 18, ax + 54]) {
    g.fillStyle = "#2b2e31";
    circle(g, fx, ay + ah / 2, 12);
    g.fill();
    g.strokeStyle = "rgba(160,165,170,0.5)";
    g.lineWidth = 1;
    g.beginPath();
    for (let k = 0; k < 4; k++) {
      const a = (k * Math.PI) / 4;
      g.moveTo(fx - Math.cos(a) * 11, ay + ah / 2 - Math.sin(a) * 11);
      g.lineTo(fx + Math.cos(a) * 11, ay + ah / 2 + Math.sin(a) * 11);
    }
    g.stroke();
  }
  outline(g, ax, ay, aw, ah, 1.2);
  // shattered windshield + crumple lines at the crashed front
  g.fillStyle = "#121a22";
  g.beginPath();
  g.moveTo(x + 14, y + 12);
  g.lineTo(x + 24, y + 12);
  g.lineTo(x + 24, y + h - 12);
  g.lineTo(x + 15, y + h - 12);
  g.lineTo(x + 19, y + h - 30);
  g.lineTo(x + 12, y + 40);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(220,230,240,0.55)";
  g.lineWidth = 0.8;
  g.beginPath();
  for (let k = 0; k < 9; k++) {
    const cy = y + 40;
    g.moveTo(x + 19, cy);
    g.lineTo(x + 19 + (hash(k * 3.3) - 0.5) * 12, cy + (hash(k * 7.1) - 0.5) * 50);
  }
  g.stroke();
  g.strokeStyle = "rgba(0,0,0,0.6)";
  g.lineWidth = 1.2;
  g.beginPath();
  g.moveTo(x + 6, y + 16);
  g.lineTo(x + 14, y + 26);
  g.moveTo(x + 5, y + 50);
  g.lineTo(x + 13, y + 46);
  g.moveTo(x + 10, y + 64);
  g.lineTo(x + 16, y + 58);
  g.stroke();
  g.fillStyle = "rgba(200,200,190,0.35)";
  g.fillRect(x + 4, y + 30, 3, 6);
  g.fillRect(x + 8, y + 52, 3, 5);
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.lineWidth = 1;
  g.beginPath();
  for (let k = 0; k < 6; k++) {
    g.moveTo(x + w - 12 - k * 3, y + 26);
    g.lineTo(x + w - 12 - k * 3, y + h - 26);
  }
  g.stroke();
  g.fillStyle = "#8a1e18";
  g.fillRect(x + w - 5, y + ins + 4, 3, 9);
  g.fillRect(x + w - 5, y + h - ins - 13, 3, 9);
  g.strokeStyle = "#08080a";
  g.lineWidth = 1.8;
  body();
  g.stroke();
}

/** Car body: inset 1 px, corner radius 4 px (close to the collision box, weakness #2). */
const CAR_INSET = 1;
const CAR_RADIUS = 4;
function carBody(g: G, L: number, W: number): void {
  rrect(g, -L / 2 + CAR_INSET, -W / 2 + CAR_INSET, L - 2 * CAR_INSET, W - 2 * CAR_INSET, CAR_RADIUS);
}

/** A car facing +x in an L × W box centred at (0, 0). */
export function drawCar(g: G, L: number, W: number, variant: number): void {
  const col = CAR_COLORS[variant % CAR_COLORS.length] as string;
  const wreck = CAR_WRECK[variant % CAR_WRECK.length] as boolean;
  g.fillStyle = "#0b0b0c";
  for (const sx of [-L * 0.31, L * 0.3]) for (const sy of [-1, 1]) g.fillRect(sx - 10, sy * (W / 2 - 3) - 3, 20, 6);
  g.fillStyle = col;
  carBody(g, L, W);
  g.fill();
  const gr = g.createLinearGradient(0, -W / 2, 0, W / 2);
  gr.addColorStop(0, "rgba(255,255,255,0.10)");
  gr.addColorStop(0.5, "rgba(255,255,255,0)");
  gr.addColorStop(1, "rgba(0,0,0,0.25)");
  g.fillStyle = gr;
  carBody(g, L, W);
  g.fill();
  g.fillStyle = shade(col, -0.3);
  g.fillRect(L * 0.1, -W / 2 + 1, 5, 4);
  g.fillRect(L * 0.1, W / 2 - 5, 5, 4);
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(L * 0.22, -W * 0.18);
  g.lineTo(L / 2 - 6, -W * 0.14);
  g.moveTo(L * 0.22, W * 0.18);
  g.lineTo(L / 2 - 6, W * 0.14);
  g.stroke();
  g.fillStyle = "#121a23";
  g.beginPath();
  g.moveTo(L * 0.2, -W / 2 + 7);
  g.lineTo(L * 0.2, W / 2 - 7);
  g.lineTo(L * 0.04, W / 2 - 10);
  g.lineTo(L * 0.04, -W / 2 + 10);
  g.closePath();
  g.fill();
  g.fillStyle = "rgba(160,185,210,0.2)";
  g.beginPath();
  g.moveTo(L * 0.17, -W / 2 + 9);
  g.lineTo(L * 0.12, -W / 2 + 9);
  g.lineTo(L * 0.07, W / 2 - 14);
  g.lineTo(L * 0.1, W / 2 - 14);
  g.closePath();
  g.fill();
  if (wreck) {
    g.strokeStyle = "rgba(220,230,240,0.5)";
    g.lineWidth = 0.7;
    g.beginPath();
    for (let k = 0; k < 7; k++) {
      g.moveTo(L * 0.13, 0);
      g.lineTo(L * 0.13 + (hash(k * 2.3 + variant) - 0.5) * 18, (hash(k * 4.7 + variant) - 0.5) * W * 0.8);
    }
    g.stroke();
  }
  g.fillStyle = "#111820";
  g.beginPath();
  g.moveTo(-L * 0.2, -W / 2 + 9);
  g.lineTo(-L * 0.2, W / 2 - 9);
  g.lineTo(-L * 0.31, W / 2 - 11);
  g.lineTo(-L * 0.31, -W / 2 + 11);
  g.closePath();
  g.fill();
  const rx = -L * 0.2;
  const rw = L * 0.24;
  const ry = -W / 2 + 9;
  const rh = W - 18;
  g.fillStyle = shade(col, 0.2);
  rrect(g, rx, ry, rw, rh, 3);
  g.fill();
  g.fillStyle = "rgba(255,255,255,0.16)";
  g.fillRect(rx + 1, ry + 1, rw - 2, 1.5);
  g.strokeStyle = "rgba(0,0,0,0.5)";
  g.lineWidth = 1;
  rrect(g, rx, ry, rw, rh, 3);
  g.stroke();
  g.fillStyle = "#ddd6ad";
  g.fillRect(L / 2 - 5, -W / 2 + 6, 4, 9);
  g.fillRect(L / 2 - 5, W / 2 - 15, 4, 9);
  g.fillStyle = "#8c1d17";
  g.fillRect(-L / 2 + 2, -W / 2 + 6, 3, 9);
  g.fillRect(-L / 2 + 2, W / 2 - 15, 3, 9);
  g.strokeStyle = "#08080a";
  g.lineWidth = 1.6;
  carBody(g, L, W);
  g.stroke();
}

export function drawPump(g: G, w: number, h: number): void {
  g.fillStyle = "#4a4a47";
  g.fillRect(0, 0, w, h);
  bevel(g, 0, 0, w, h, 2, "rgba(255,255,255,0.2)", "rgba(0,0,0,0.45)");
  outline(g, 0.75, 0.75, w - 1.5, h - 1.5, 1.5);
  const cx = 14;
  const cw = w - 28;
  const cy = 6;
  const ch = h - 12;
  g.fillStyle = "#6e2a23";
  g.fillRect(cx, cy, cw, ch);
  bevel(g, cx, cy, cw, ch, 1.5, "rgba(255,255,255,0.25)", "rgba(0,0,0,0.4)");
  g.fillStyle = "#7fb7a8";
  g.fillRect(cx + 6, cy + 6, 10, ch - 12);
  g.strokeStyle = "#111";
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(cx + cw, cy + 6);
  g.quadraticCurveTo(cx + cw + 8, cy + ch / 2, cx + cw, cy + ch - 6);
  g.stroke();
  outline(g, cx, cy, cw, ch, 1.2);
}

export function drawBarrier(g: G, w: number, h: number): void {
  g.fillStyle = "#2f3032";
  for (const fx of [2, w / 2 - 3, w - 8]) g.fillRect(fx, 0, 6, h);
  const py = 3;
  const ph = h - 6;
  g.save();
  g.beginPath();
  g.rect(1, py, w - 2, ph);
  g.clip();
  g.fillStyle = "#b5b1a5";
  g.fillRect(0, py, w, ph);
  g.fillStyle = "#2c4e7c";
  for (let sx = -10; sx < w; sx += 20) {
    g.beginPath();
    g.moveTo(sx, py + ph);
    g.lineTo(sx + 10, py + ph);
    g.lineTo(sx + 10 + ph, py);
    g.lineTo(sx + ph, py);
    g.closePath();
    g.fill();
  }
  g.restore();
  g.fillStyle = "rgba(255,255,255,0.25)";
  g.fillRect(1, py, w - 2, 1);
  g.strokeStyle = "#08080a";
  g.lineWidth = 1.3;
  g.strokeRect(1, py, w - 2, ph);
  g.fillStyle = "#d08a2a";
  circle(g, 5, h / 2, 2.6);
  g.fill();
  circle(g, w - 5, h / 2, 2.6);
  g.fill();
}

export function drawSandbags(g: G, w: number, h: number): void {
  const bag = 19.2;
  const per = Math.max(1, Math.floor(w / bag));
  for (const [row, oy, off] of [
    [0, 9, 0],
    [1, h - 9, bag / 2],
  ] as const) {
    for (let i = 0; i < per; i++) {
      const bx = off + bag / 2 + i * bag;
      if (bx > w - 6) continue;
      g.fillStyle = row ? "#7a7058" : "#6c6350";
      ell(g, bx, oy, bag / 2, 7.5);
      g.fill();
      g.fillStyle = "rgba(255,255,255,0.12)";
      ell(g, bx - 2, oy - 2.5, 5, 2.5);
      g.fill();
      g.strokeStyle = "rgba(0,0,0,0.35)";
      g.lineWidth = 0.8;
      g.beginPath();
      g.moveTo(bx - 6, oy);
      g.lineTo(bx + 6, oy);
      g.stroke();
      g.strokeStyle = "#0a0a0b";
      g.lineWidth = 1.1;
      ell(g, bx, oy, bag / 2, 7.5);
      g.stroke();
    }
  }
}

/** A dumpster seen from above (a `block` mutation): green steel, two lids, corner caps. */
export function drawDumpster(g: G, w: number, h: number): void {
  g.fillStyle = "#2f4a37";
  g.fillRect(1, 1, w - 2, h - 2);
  bevel(g, 1, 1, w - 2, h - 2, 2, "rgba(255,255,255,0.22)", "rgba(0,0,0,0.45)");
  // two lids (one slightly open: a dark gap) and a hinge line
  g.fillStyle = "#38563f";
  g.fillRect(4, 4, w / 2 - 5, h - 8);
  g.fillRect(w / 2 + 1, 6, w / 2 - 5, h - 10);
  g.fillStyle = "rgba(0,0,0,0.55)";
  g.fillRect(w / 2 - 1, 4, 2, h - 8);
  g.strokeStyle = "rgba(0,0,0,0.4)";
  g.lineWidth = 1;
  for (let x = 8; x < w - 4; x += 6) {
    g.beginPath();
    g.moveTo(x, 6);
    g.lineTo(x, h - 6);
    g.stroke();
  }
  g.fillStyle = "#1b1d1c";
  for (const [x, y] of [
    [1, 1],
    [w - 5, 1],
    [1, h - 5],
    [w - 5, h - 5],
  ] as const)
    g.fillRect(x, y, 4, 4);
  g.fillStyle = "rgba(200,190,150,0.35)"; // spilled rubbish
  g.fillRect(w * 0.15, h - 4, 5, 3);
  outline(g, 0.75, 0.75, w - 1.5, h - 1.5, 1.5);
}

/** A generic blockage (crates and rubble) for a `block` mutation that has no art of its own. */
export function drawBlock(g: G, w: number, h: number): void {
  g.fillStyle = "#4a4136";
  g.fillRect(1, 1, w - 2, h - 2);
  const n = Math.max(2, Math.round((w * h) / 400));
  for (let i = 0; i < n; i++) {
    const cw = 8 + hash(i * 3.7) * Math.min(14, w / 2);
    const ch = 8 + hash(i * 5.3) * Math.min(14, h / 2);
    const x = 2 + hash(i * 1.9) * Math.max(0, w - cw - 4);
    const y = 2 + hash(i * 7.1) * Math.max(0, h - ch - 4);
    g.fillStyle = i % 2 ? "#6b5a42" : "#5a5a55";
    g.fillRect(x, y, cw, ch);
    bevel(g, x, y, cw, ch, 1.5, "rgba(255,255,255,0.2)", "rgba(0,0,0,0.45)");
  }
  outline(g, 0.75, 0.75, w - 1.5, h - 1.5, 1.5);
}
