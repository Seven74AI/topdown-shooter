/**
 * ST: animated status icons, ONE set for survivors, zombies and the Behemoth (designer 2026-11-28: "We probably should
 * make some animated status icon for both player and monsters because they could be affected by same statuses.").
 *
 * Goal first (fx.md › FX 4): "At a glance, what is happening to this body and for how long", the same picture on any
 * body. Every icon is built the same way, so the set reads as one family:
 *   - BADGE (matter): a soft dark disc, 0.56 m (20 px at the game's 36 px/m), so the icon reads over a bright fire, a
 *     dark street or a relit body alike. Normal blend.
 *   - GLYPH (light): one shape, emissive (ADD), a white-hot core that cools to its colour. One loop each, on its
 *     cause's own clock (the fire's 0.5 s damage pulse, the acid's 0.4 s pulse, the stun's 1.0 s dazed breath, the
 *     downed heartbeat 1 s).
 *   - TIMER (light): a thin ring round the badge that drains clockwise from 12 o'clock over the status' real time left
 *     (a dim track under it). Statuses with no timer (in a zone) show no lit ring.
 * Colour: the glyph takes its cause's colour where the cause has one (fire amber-orange, acid / gas yellow-green, like
 * the FX on the street), otherwise its meaning: amber = your window (the boss stunned, a zombie trapped), red = danger
 * (you are down), white = people (healing, protected, being revived).
 * Placement: "above the head" = screen-up of the body (top-down: north), 0.3 m over the body's edge; several stack in a
 * row centred on the body, 0.62 m apart, at most 3 (priority order below). Over the boss ×1.5 (a 4 m body).
 * Textures are baked once (`stBake`); `drawIcon` only composes sprites and one Graphics ring.
 */
import { make, idle, clamp01, sprite, countSprite, type Stage } from "./kit";

export type StatusId = "downed" | "burning" | "acid" | "slowed" | "stunned" | "trapped" | "protected" | "healing";
/** Stacking priority (left → right): danger first, then the windows, then people. At most 3 shown. */
export const ST_ORDER: readonly StatusId[] = ["downed", "burning", "acid", "slowed", "stunned", "trapped", "protected", "healing"];
export const ST_MAX = 3;
export const BADGE_M = 0.56;
export const STACK_M = 0.62;
export const ABOVE_M = 0.3;
export const POP_S = 0.12; // pops in (scale 0.6 → 1)
export const OUT_S = 0.15; // fades out

const COL: Record<StatusId, { hot: string; bloom: string }> = {
  downed: { hot: "255,226,218", bloom: "255,44,30" },
  burning: { hot: "255,244,214", bloom: "255,120,24" },
  acid: { hot: "240,255,200", bloom: "150,220,40" },
  slowed: { hot: "236,255,206", bloom: "150,220,40" },
  stunned: { hot: "255,242,206", bloom: "255,160,30" },
  trapped: { hot: "255,236,200", bloom: "255,150,30" },
  protected: { hot: "255,255,255", bloom: "200,220,255" },
  healing: { hot: "255,255,255", bloom: "210,236,255" },
};
export const stColour = (id: StatusId): string => `rgb(${COL[id].bloom})`;

const PX = 96; // glyph texture side (0.56 m at up to 170 px/m)
export interface StArt {
  badge: HTMLCanvasElement;
  star: HTMLCanvasElement;
  swirl: HTMLCanvasElement;
  flame: HTMLCanvasElement[];
  drop: HTMLCanvasElement;
  splash: HTMLCanvasElement;
  chevron: HTMLCanvasElement;
  jawTop: HTMLCanvasElement;
  jawBot: HTMLCanvasElement;
  heart: HTMLCanvasElement;
  plus: HTMLCanvasElement;
  shield: HTMLCanvasElement;
  sheen: HTMLCanvasElement[];
}
export let stArt: StArt | null = null;

/** Draws `path` twice into a PX square: a blurred bloom in the colour, then the hot core (thinner / smaller). */
function lightGlyph(id: StatusId, path: (g: CanvasRenderingContext2D) => void, o: { stroke?: number; fill?: boolean; core?: number } = {}): HTMLCanvasElement {
  const c = make(PX, PX);
  const g = c.getContext("2d")!;
  const { hot, bloom } = COL[id];
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const pass of [0, 1, 2]) {
    g.save();
    g.filter = pass === 0 ? "blur(7px)" : pass === 1 ? "blur(2px)" : "none";
    const col = pass === 2 ? `rgba(${hot},1)` : `rgba(${bloom},${pass === 0 ? 0.75 : 0.95})`;
    g.strokeStyle = col;
    g.fillStyle = col;
    const w = o.stroke ?? 7;
    g.lineWidth = pass === 2 ? w * (o.core ?? 0.42) : w * (pass === 0 ? 1.8 : 1.15);
    g.translate(PX / 2, PX / 2);
    if (pass === 2 && o.fill) g.scale(o.core ?? 0.7, o.core ?? 0.7);
    path(g);
    if (o.fill) g.fill();
    else g.stroke();
    g.restore();
  }
  return c;
}
const star = (g: CanvasRenderingContext2D, r: number): void => {
  g.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 4;
    const rr = i % 2 ? r * 0.38 : r;
    if (i === 0) g.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
    else g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.closePath();
};
function flameFrame(k: number): HTMLCanvasElement {
  // a flame tongue licking up; three frames lean and stretch differently (crossfaded on the fire's 0.5 s pulse)
  const lean = [-0.12, 0.1, 0.0][k] as number;
  const tall = [1, 0.9, 1.08][k] as number;
  const c = make(PX, PX);
  const g = c.getContext("2d")!;
  g.translate(PX / 2, PX / 2 + 16);
  const shape = (s: number): void => {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(-22 * s, -6 * s, -16 * s, -26 * s * tall, (lean * 60 - 2) * s, -46 * s * tall);
    g.bezierCurveTo(-2 * s, -30 * s * tall, 8 * s, -32 * s * tall, (lean * 40 + 6) * s, -24 * s * tall);
    g.bezierCurveTo(14 * s, -16 * s, 20 * s, -6 * s, 0, 0);
    g.closePath();
  };
  g.filter = "blur(6px)";
  g.fillStyle = "rgba(255,80,20,0.8)";
  shape(1.15);
  g.fill();
  g.filter = "blur(1.5px)";
  const gr = g.createLinearGradient(0, 0, 0, -46);
  gr.addColorStop(0, "rgba(255,200,90,1)");
  gr.addColorStop(0.6, "rgba(255,120,24,1)");
  gr.addColorStop(1, "rgba(230,50,20,0.9)");
  g.fillStyle = gr;
  shape(1);
  g.fill();
  g.filter = "none";
  g.fillStyle = "rgba(255,248,222,1)"; // the white-hot root
  g.translate(0, -2);
  shape(0.48);
  g.fill();
  return c;
}

export async function stBake(): Promise<StArt> {
  if (stArt) return stArt;
  const badge = make(PX, PX);
  {
    const g = badge.getContext("2d")!;
    const gr = g.createRadialGradient(PX / 2, PX / 2, 0, PX / 2, PX / 2, PX / 2);
    gr.addColorStop(0, "rgba(10,12,15,0.78)");
    gr.addColorStop(0.78, "rgba(10,12,15,0.72)");
    gr.addColorStop(1, "rgba(10,12,15,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, PX, PX);
  }
  const swirl = lightGlyph("stunned", (g) => {
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = (i / 40) * Math.PI * 3.2;
      const r = 4 + i * 0.55;
      if (i === 0) g.moveTo(Math.cos(a) * r, Math.sin(a) * r * 0.55);
      else g.lineTo(Math.cos(a) * r, Math.sin(a) * r * 0.55);
    }
  }, { stroke: 4, core: 0.4 });
  const splash = lightGlyph("acid", (g) => {
    g.beginPath();
    g.ellipse(0, 0, 22, 7, 0, 0, Math.PI * 2);
  }, { stroke: 4, core: 0.45 });
  const sheen: HTMLCanvasElement[] = [];
  const shieldPath = (g: CanvasRenderingContext2D): void => {
    g.beginPath();
    g.moveTo(0, -28);
    g.quadraticCurveTo(14, -20, 24, -21);
    g.quadraticCurveTo(24, 10, 0, 30);
    g.quadraticCurveTo(-24, 10, -24, -21);
    g.quadraticCurveTo(-14, -20, 0, -28);
    g.closePath();
  };
  for (let k = 0; k < 6; k++) {
    // a diagonal light sweeping across the shield (clipped to it): six frames
    const c = make(PX, PX);
    const g = c.getContext("2d")!;
    g.translate(PX / 2, PX / 2);
    shieldPath(g);
    g.clip();
    const x = -40 + k * 16;
    const gr = g.createLinearGradient(x - 10, 0, x + 10, 0);
    gr.addColorStop(0, "rgba(255,255,255,0)");
    gr.addColorStop(0.5, "rgba(255,255,255,0.75)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.setTransform(1, 0, 0.5, 1, PX / 2, PX / 2);
    g.fillRect(x - 10, -40, 20, 80);
    sheen.push(c);
  }
  stArt = {
    badge,
    star: lightGlyph("stunned", (g) => star(g, 13), { fill: true, core: 0.55 }),
    swirl,
    flame: [0, 1, 2].map(flameFrame),
    drop: lightGlyph("acid", (g) => {
      g.beginPath();
      g.moveTo(0, -24);
      g.bezierCurveTo(6, -12, 15, -2, 15, 8);
      g.arc(0, 8, 15, 0, Math.PI);
      g.bezierCurveTo(-15, -2, -6, -12, 0, -24);
      g.closePath();
    }, { fill: true, core: 0.55 }),
    splash,
    chevron: lightGlyph("slowed", (g) => {
      g.beginPath();
      g.moveTo(9, -18);
      g.lineTo(-9, 0);
      g.lineTo(9, 18);
    }, { stroke: 7 }),
    jawTop: lightGlyph("trapped", (g) => {
      // the upper jaw: an arc with three teeth pointing down
      g.beginPath();
      g.moveTo(-26, 2);
      g.quadraticCurveTo(0, -30, 26, 2);
      g.moveTo(-18, -6);
      g.lineTo(-12, 4);
      g.lineTo(-6, -11);
      g.lineTo(0, 4);
      g.lineTo(6, -11);
      g.lineTo(12, 4);
      g.lineTo(18, -6);
    }, { stroke: 5 }),
    jawBot: lightGlyph("trapped", (g) => {
      g.beginPath();
      g.moveTo(-26, -2);
      g.quadraticCurveTo(0, 30, 26, -2);
      g.moveTo(-15, 8);
      g.lineTo(-9, -3);
      g.lineTo(-3, 11);
      g.lineTo(3, -3);
      g.lineTo(9, 11);
      g.lineTo(15, 8);
    }, { stroke: 5 }),
    heart: lightGlyph("downed", (g) => {
      g.beginPath();
      g.moveTo(0, 22);
      g.bezierCurveTo(-30, 2, -22, -24, 0, -10);
      g.bezierCurveTo(22, -24, 30, 2, 0, 22);
      g.closePath();
    }, { fill: true, core: 0.5 }),
    plus: lightGlyph("healing", (g) => {
      g.beginPath();
      g.moveTo(0, -17);
      g.lineTo(0, 17);
      g.moveTo(-17, 0);
      g.lineTo(17, 0);
    }, { stroke: 8, core: 0.45 }),
    shield: lightGlyph("protected", shieldPath, { stroke: 5 }),
    sheen,
  };
  await idle();
  return stArt;
}

/** x offset (m) of slot i of n in a stacked row. */
export const slotX = (i: number, n: number): number => (i - (n - 1) / 2) * STACK_M;

/**
 * One status icon. (xm, ym) = the icon's centre in metres, `t` = the page clock (loops), `age` = seconds since the
 * status started (pop-in), `left` = fraction of its time left (null: no timer, in a zone), `out` = 0..1 fading out,
 * `extra` = revive progress for "downed" (0..1), `s` = scale (1; the boss 1.5).
 */
export function drawIcon(g: CanvasRenderingContext2D, st: Stage, id: StatusId, xm: number, ym: number, t: number, age: number, left: number | null, out: number, extra: number, s: number): void {
  const a = stArt!;
  if (age < 0 || out >= 1) return;
  const pop = clamp01(age / POP_S);
  const k = (0.6 + 0.4 * (1 - Math.pow(1 - pop, 3))) * s;
  const al = Math.min(1, pop * 2) * (1 - out);
  const x = st.cx + xm * st.pxm;
  const y = st.cy + ym * st.pxm;
  const B = BADGE_M * k;
  const all = st.only === null || st.only === "icon";
  if (all || st.only === "badge") sprite(g, a.badge, x, y, B * 1.12, st.pxm, 0, al);
  const gly = all || st.only === "glyph";
  const u = B / 0.56; // glyph metres per badge
  if (gly)
    switch (id) {
      case "stunned": {
        // the dazed swirl turning, three stars orbiting it on a tilted ellipse: one turn per 1.0 s (the stun breath)
        sprite(g, a.swirl, x, y, B * 1.0, st.pxm, -t * Math.PI * 2 * 0.5, al * 0.4, true);
        for (let i = 0; i < 3; i++) {
          const ang = t * Math.PI * 2 + (i * Math.PI * 2) / 3;
          const front = 0.5 + 0.5 * Math.sin(ang); // 1 = nearest
          sprite(g, a.star, x + Math.cos(ang) * 0.17 * u * st.pxm, y + Math.sin(ang) * 0.09 * u * st.pxm, B * (0.42 + 0.16 * front), st.pxm, ang * 0.5, al * (0.6 + 0.4 * front), true);
        }
        break;
      }
      case "burning": {
        // three flame pictures crossfaded on the fire's 0.5 s damage pulse
        const ph = (t / 0.5) % 1;
        const f = ph * 3;
        const i0 = Math.floor(f) % 3;
        const w = f - Math.floor(f);
        sprite(g, a.flame[i0] as HTMLCanvasElement, x, y, B * 1.3, st.pxm, 0, al * (1 - w), true);
        sprite(g, a.flame[(i0 + 1) % 3] as HTMLCanvasElement, x, y, B * 1.3, st.pxm, 0, al * w, true);
        break;
      }
      case "acid": {
        // a drop falls through the badge and splashes, on the puddle's 0.4 s pulse
        const ph = (t / 0.8) % 1;
        const fall = Math.min(1, ph / 0.7);
        sprite(g, a.drop, x, y + (-0.08 + 0.13 * fall * fall) * u * st.pxm, B * 0.9, st.pxm, 0, al * (1 - Math.max(0, ph - 0.7) / 0.3), true);
        if (ph > 0.65) sprite(g, a.splash, x, y + 0.13 * u * st.pxm, B * (0.45 + 0.4 * (ph - 0.65) / 0.35), st.pxm, 0, al * (1 - (ph - 0.65) / 0.35), true);
        break;
      }
      case "slowed": {
        // two chevrons pointing back, drifting back slowly (dragged), 1 s loop
        for (let i = 0; i < 2; i++) {
          const ph = (t + i * 0.5) % 1;
          const dx = (0.1 - 0.2 * ph) * u;
          sprite(g, a.chevron, x + dx * st.pxm, y, B * 0.9, st.pxm, 0, al * Math.sin(ph * Math.PI), true);
        }
        break;
      }
      case "trapped": {
        // the jaws clench twice a second (it pulls against the trap)
        const c = 0.5 + 0.5 * Math.cos((t / 0.5) * Math.PI * 2);
        const gap = (0.02 + 0.05 * c) * u * st.pxm;
        sprite(g, a.jawTop, x, y - gap, B * 1.05, st.pxm, 0, al, true);
        sprite(g, a.jawBot, x, y + gap, B * 1.05, st.pxm, 0, al, true);
        break;
      }
      case "downed": {
        // a heart beating once a second (lub-dub), weak: 20 s to bleed out
        const ph = t % 1;
        const beat = Math.exp(-Math.pow((ph - 0.1) / 0.06, 2)) + 0.6 * Math.exp(-Math.pow((ph - 0.3) / 0.06, 2));
        sprite(g, a.heart, x, y, B * (0.92 + 0.1 * beat), st.pxm, 0, al * (0.6 + 0.4 * beat), true);
        break;
      }
      case "healing": {
        // a cross rising out of the badge and fading, 1 s loop (one at a time: two overlapping read as a double cross)
        {
          const ph = t % 1;
          sprite(g, a.plus, x, y + (0.08 - 0.18 * ph) * u * st.pxm, B * (0.62 + 0.16 * (1 - ph)), st.pxm, 0, al * Math.sin(ph * Math.PI), true);
        }
        break;
      }
      case "protected": {
        sprite(g, a.shield, x, y, B * 0.98, st.pxm, 0, al * 0.9, true);
        const ph = (t / 1.2) % 1; // a sheen every 1.2 s
        if (ph < 0.5) sprite(g, a.sheen[Math.min(5, Math.floor((ph / 0.5) * 6))] as HTMLCanvasElement, x, y, B * 0.98, st.pxm, 0, al * 0.8, true);
        break;
      }
    }
  if ((left !== null || id === "downed") && (all || st.only === "timer")) {
    // the timer: a dim track and the time left, clockwise from 12 o'clock (one Graphics, ADD)
    countSprite(true);
    const r = (B / 2) * 0.98 * st.pxm;
    g.save();
    g.globalCompositeOperation = "lighter";
    g.lineCap = "round";
    g.lineWidth = Math.max(1, 0.045 * k * st.pxm);
    g.strokeStyle = stColour(id);
    g.globalAlpha = 0.22 * al;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.stroke();
    if (left !== null && left > 0) {
      g.globalAlpha = 0.95 * al;
      g.beginPath();
      g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
      g.stroke();
    }
    if (id === "downed" && extra > 0) {
      // being revived: a white ring fills outside it (people), the downed countdown pauses
      g.strokeStyle = "rgb(255,255,255)";
      g.globalAlpha = al;
      g.lineWidth = Math.max(1, 0.06 * k * st.pxm);
      g.beginPath();
      g.arc(x, y, r + 0.07 * k * st.pxm, -Math.PI / 2, -Math.PI / 2 + extra * Math.PI * 2);
      g.stroke();
    }
    g.restore();
  }
}
