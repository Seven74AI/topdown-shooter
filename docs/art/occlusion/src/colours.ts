/**
 * Zombie silhouette colours (designer 2026-11-25: "make me a quick comparison with all the alternatives"): the picked
 * silhouette (option C), with the zombie colour varied; survivors stay in their slot colours. Red clashes with the
 * game's rule "red = boss danger in play" and with the walls' red damage bar. Game code only: the relit wall pictures (`bakeSteps`), the game's zombie and survivor drawings at
 * the game's size (34 px per body radius at 96 px per metre). A Walker paces just behind a wall, a survivor stands
 * behind it, a Runner passes in front (never affected). Each panel is one option. Built into ../compare.html by build.mjs.
 */
import { bakeSteps, relitSpecs, wallFrame } from "../../../../apps/client/src/render/city/buildingsFrames";
import { FRONT_BASE_Y } from "../../../../apps/client/src/render/city/barricadeArt";
import { drawSurvivor, drawZombie } from "../../../../apps/client/src/render/city/spriteArt";

const PXM = 96; // the game's px per metre
const R = 34; // the game's body radius in px
const W_M = 5.3;
const H_M = 2.15;
const W = Math.round(W_M * PXM);
const H = Math.round(H_M * PXM);
type G = CanvasRenderingContext2D;

const make = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  return c;
};
const ctx = (c: HTMLCanvasElement): G => c.getContext("2d") as G;

function relit(frame: string): HTMLCanvasElement {
  const a = relitSpecs().find((x) => x.frame === frame);
  if (!a) throw new Error(frame);
  const st = bakeSteps(a, make);
  let s = st.next();
  while (!s.done) s = st.next();
  return s.value.base;
}

/** The street: dark asphalt with a little grain and a warm lamp pool. */
function street(): HTMLCanvasElement {
  const c = make(W, H);
  const g = ctx(c);
  g.fillStyle = "#23262b";
  g.fillRect(0, 0, W, H);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.12)";
    g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 2, 1);
  }
  const lp = g.createRadialGradient(W * 0.2, H * 0.1, 0, W * 0.2, H * 0.1, W * 0.7);
  lp.addColorStop(0, "rgba(255,214,150,0.16)");
  lp.addColorStop(1, "rgba(255,214,150,0)");
  g.fillStyle = lp;
  g.fillRect(0, 0, W, H);
  return c;
}

/** One body sprite (drawn once): a canvas with the body centred. */
function body(draw: (g: G) => void): HTMLCanvasElement {
  const s = R * 6;
  const c = make(s, s);
  const g = ctx(c);
  g.translate(s / 2, s / 2);
  draw(g);
  return c;
}

interface Wall {
  pic: HTMLCanvasElement;
  /** Footprint centre (m). */
  x: number;
  y: number;
}

interface Body {
  sprite: HTMLCanvasElement;
  x: number;
  y: number;
  angle: number;
  /** "z" zombie / survivor slot colour (css). */
  kind: "z" | string;
}

type Option = "asbuilt" | "fade" | "silhouette" | "outline" | "window" | "localfade";

/** Where a wall's picture sits (px) and whether a body is behind it (north of its footprint, under its picture). */
function wallRect(w: Wall): { x: number; y: number; w: number; h: number } {
  const pw = w.pic.width;
  const ph = w.pic.height;
  const oy = 0.5 + FRONT_BASE_Y / 1; // the origin is the footprint centre (front picture: 2 × 1 m)
  return { x: w.x * PXM - pw / 2, y: w.y * PXM - ph * oy, w: pw, h: ph };
}
function behind(b: Body, w: Wall): boolean {
  const r = wallRect(w);
  return b.y < w.y && b.x * PXM > r.x - R && b.x * PXM < r.x + r.w + R && b.y * PXM > r.y - R;
}

function drawBody(g: G, b: Body): void {
  g.save();
  g.translate(b.x * PXM, b.y * PXM);
  g.rotate(b.angle);
  g.drawImage(b.sprite, -b.sprite.width / 2, -b.sprite.height / 2);
  g.restore();
}

/** A body's flat shape in one colour (for silhouettes and outlines). */
function shape(b: Body, colour: string, grow = 0): HTMLCanvasElement {
  const c = make(W, H);
  const g = ctx(c);
  if (grow > 0) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.save();
      g.translate(Math.cos(a) * grow, Math.sin(a) * grow);
      drawBody(g, b);
      g.restore();
    }
  } else drawBody(g, b);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = colour;
  g.fillRect(0, 0, W, H);
  return c;
}

function render(g: G, zc: string, bg: HTMLCanvasElement, walls: Wall[], bodies: Body[], front: Body[], t: number): void {
  const opt: Option = "silhouette";
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  g.drawImage(bg, 0, 0);
  for (const b of bodies) drawBody(g, b);
  // the walls (one layer each, so a wall's own effect stays on it)
  for (const w of walls) {
    const r = wallRect(w);
    const hidden = bodies.filter((b) => behind(b, w));
    const layer = make(W, H);
    const lg = ctx(layer);
    lg.drawImage(w.pic, r.x, r.y);
    if (opt === "window" || opt === "localfade") {
      // a soft hole (window) or a soft thinning (local fade) in the wall around each hidden body
      lg.globalCompositeOperation = "destination-out";
      for (const b of hidden) {
        const rad = R * 2.1;
        const gr = lg.createRadialGradient(b.x * PXM, b.y * PXM, rad * 0.35, b.x * PXM, b.y * PXM, rad);
        const k = opt === "window" ? 1 : 0.6;
        gr.addColorStop(0, `rgba(0,0,0,${k})`);
        gr.addColorStop(1, "rgba(0,0,0,0)");
        lg.fillStyle = gr;
        lg.fillRect(b.x * PXM - rad, b.y * PXM - rad, rad * 2, rad * 2);
      }
      lg.globalCompositeOperation = "source-over";
    }
    g.globalAlpha = opt === "fade" && hidden.length > 0 ? 0.45 : 1;
    g.drawImage(layer, 0, 0);
    g.globalAlpha = 1;
    if (opt === "silhouette" || opt === "outline") {
      for (const b of hidden) {
        const colour = b.kind === "z" ? zc : b.kind;
        let s: HTMLCanvasElement;
        if (opt === "silhouette") s = shape(b, colour);
        else {
          // a ring: the body grown by 2 px, minus the body
          s = shape(b, colour, 2.2);
          const sg = ctx(s);
          sg.globalCompositeOperation = "destination-out";
          drawBody(sg, b);
        }
        // only where the wall hides it
        const sg = ctx(s);
        sg.globalCompositeOperation = "destination-in";
        sg.drawImage(layer, 0, 0);
        g.globalAlpha = opt === "silhouette" ? 0.5 + 0.08 * Math.sin(t * 4) : 0.95;
        g.drawImage(s, 0, 0);
        g.globalAlpha = 1;
      }
    }
  }
  // the wood wall worn low: the game's red damage bar on it (the clash to judge)
  const w0 = walls[0] as Wall;
  g.fillStyle = "rgba(26,26,26,0.85)";
  g.fillRect(w0.x * PXM - 0.9 * PXM - 2, w0.y * PXM - 0.07 * PXM - 2, 1.8 * PXM + 4, 0.14 * PXM + 4);
  g.fillStyle = "#d84a32";
  g.fillRect(w0.x * PXM - 0.9 * PXM, w0.y * PXM - 0.07 * PXM, 1.8 * PXM * 0.25, 0.14 * PXM);
  for (const b of front) drawBody(g, b);
}

const COLOURS: { id: string; css: string; name: string; note: string }[] = [
  { id: "red", css: "rgb(255,92,72)", name: "A · Red (as built, from the page you picked)", note: "Strongest 'enemy' read, but the game keeps red for boss danger in play, and it sits right on the walls' red damage bar." },
  { id: "eyes", css: "rgb(236,226,150)", name: "B · Zombie-eye amber", note: "The pale amber of the zombies' eyes in a blackout: one language, 'that glow is a zombie'. Clear of the boss red and the damage bar." },
  { id: "white", css: "rgb(236,232,222)", name: "C · Off-white", note: "Neutral and very readable on dark walls; a little ghostly. Never confused with a player colour or a hazard." },
  { id: "grey", css: "rgb(168,154,140)", name: "D · Muted warm grey", note: "The quietest: you notice it when you look, it never shouts. May get lost on the grey metal wall." },
  { id: "green", css: "rgb(169,196,142)", name: "E · Pale zombie green", note: "The zombies' own skin tone, washed out. Reads 'undead', but sits near the acid / gas greens." },
  { id: "rust", css: "rgb(214,128,72)", name: "F · Rust orange", note: "Warm and alarming without being boss red; close to the orange player's slot colour (see the orange survivor)." },
];

async function main(): Promise<void> {
  const bg = street();
  const walls: Wall[] = [
    { pic: relit(wallFrame("wood", "out", 0)), x: 1.6, y: 1.45 },
    { pic: relit(wallFrame("mt", "out", 1)), x: 3.7, y: 1.45 },
  ];
  const walker = body((g) => drawZombie(g, "walker", R, 0));
  const runner = body((g) => drawZombie(g, "runner", R, 0));
  const surv = body((g) => drawSurvivor(g, R));
  const list = document.getElementById("list") as HTMLElement;
  const panels: { g: G; zc: string }[] = [];
  for (const o of COLOURS) {
    const card = document.createElement("article");
    card.className = "pair";
    card.id = o.id;
    const h3 = document.createElement("h3");
    h3.textContent = o.name;
    card.appendChild(h3);
    const c = make(W, H);
    card.appendChild(c);
    const p = document.createElement("p");
    p.textContent = o.note;
    card.appendChild(p);
    list.appendChild(card);
    panels.push({ g: ctx(c), zc: o.css });
  }
  (document.getElementById("loading") as HTMLElement).remove();
  const t0 = performance.now();
  const frame = (now: number): void => {
    const t = (now - t0) / 1000;
    // the Walker paces behind both walls; the survivor stands behind the metal one; the Runner passes in front
    const wx = 2.45 + Math.sin(t * 0.45) * 1.75;
    const dir = Math.cos(t * 0.45) >= 0 ? 0 : Math.PI;
    const bodies: Body[] = [
      { sprite: walker, x: wx, y: 1.12 + Math.sin(t * 3) * 0.02, angle: dir + Math.PI / 2 - Math.PI / 2, kind: "z" },
      { sprite: surv, x: 4.15, y: 1.08, angle: -Math.PI / 2, kind: "rgb(61,139,255)" },
      { sprite: surv, x: 0.95, y: 1.1, angle: -Math.PI / 2, kind: "rgb(255,138,31)" },
      { sprite: walker, x: 3.3, y: 1.15, angle: Math.PI / 2, kind: "z" },
    ];
    const rx = ((t * 1.1) % 7) - 0.8;
    const front: Body[] = [{ sprite: runner, x: rx, y: 1.92, angle: 0, kind: "z" }];
    for (const p of panels) render(p.g, p.zc, bg, walls, bodies, front, t);
    if (!matchMedia("(prefers-reduced-motion: reduce)").matches) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  Object.assign(window, { __ready: true });
}
void main();
