/**
 * Take 4's animation as a small library for the asset review page (designer 2026-11-25: "could it be possible to see
 * the animations also? For example the veins on the Bloaters"). `window.T4.mount(label, size)` returns a canvas that
 * plays the accepted animated look of the character frame `label` ("Group: name", as the review export names them),
 * drawing only while it is on screen. Built with KEEP_OUTLINE (the accepted grey outline).
 */
import { LOOP_FRAMES, ROWS, animated, prepareBloater, relight4, type Lit } from "./take4";

interface Live {
  frame: (t: number) => void;
  el: HTMLCanvasElement;
  on: boolean;
}
const live: Live[] = [];
const io = new IntersectionObserver((es) => {
  for (const e of es) {
    const l = live.find((x) => x.el === e.target);
    if (l) l.on = e.isIntersecting;
  }
});
let running = false;

function mount(label: string, size = 240): HTMLCanvasElement | null {
  const i = ROWS.findIndex((r) => `${r.group}: ${r.name}` === label);
  const row = ROWS[i];
  if (!row) return null;
  // the same seeds as the take 4 page, so it is the same picture
  const lit = relight4(row.draw, row.extent, 900 + i * 7);
  const bfx = row.anim.bloater ? prepareBloater(lit, row.anim.bloater, 1300 + i * 17) : undefined;
  const fr = row.frames;
  const loop = fr ? { lits: Array.from({ length: LOOP_FRAMES }, (_, k) => relight4((g, r) => fr.draw(g, r, k / LOOP_FRAMES), row.extent, 900 + i * 7)), loopS: fr.loopS } : undefined;
  const a = animated(loop ? (loop.lits[0] as Lit) : lit, row.anim, row.zoom, size, i * 0.37, bfx, loop);
  a.frame(0);
  const entry: Live = { frame: a.frame, el: a.c, on: true };
  live.push(entry);
  io.observe(a.c);
  if (!running && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    running = true;
    const t0 = performance.now();
    const tick = (now: number): void => {
      for (const l of live) if (l.on && l.el.isConnected) l.frame((now - t0) / 1000);
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  return a.c;
}

Object.assign(window, { T4: { mount } });
