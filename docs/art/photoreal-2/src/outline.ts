/**
 * Survivor outline test (designer 2026-11-25: "try the survivor with the black outline instead of the gray
 * transparent one, and one without outline"). Today's survivor drawing with three outline treatments, each shown
 * as today's flat drawing and as take 4 (photoreal, animated). The outline colour is the game's `CHAR.outline`
 * (spriteArt.ts), swapped here before drawing.
 */
import { CHAR, drawSurvivor } from "../../../../apps/client/src/render/city/spriteArt";
import { WEAPON_ART, WEAPON_BACK_ART } from "../../../../apps/client/src/render/city/weaponArt";
import { asphalt, canvas, ctx, night, type G } from "../../asset-fixes-1/src/lib";
import { SURV, animated, relight4 } from "./take4";

const R = 68;
const STYLES: { id: string; name: string; outline: string; width?: number }[] = [
  { id: "grey", name: "Today: grey see-through outline", outline: "rgba(6,6,6,0.7)" },
  { id: "black", name: "Black outline", outline: "rgba(0,0,0,1)" },
  { id: "none", name: "No outline", outline: "rgba(0,0,0,0)" },
];
const WEAPONS: { name: string; w?: string }[] = [{ name: "Pistol" }, { name: "Shotgun", w: "shotgun" }, { name: "Flamethrower", w: "flamethrower" }];

function drawWith(outline: string, w?: string) {
  return (g: G, r: number): void => {
    const mut = CHAR as unknown as { outline: string };
    const before = mut.outline;
    mut.outline = outline;
    if (w) drawSurvivor(g, r, (c, rr) => WEAPON_ART[w]?.(c, "held", rr), WEAPON_BACK_ART[w]);
    else drawSurvivor(g, r);
    mut.outline = before;
  };
}

function flat(draw: (g: G, r: number) => void, size: number, zoom: number): HTMLCanvasElement {
  const N = Math.ceil(2 * 2.7 * R);
  const f = canvas(N, N);
  const fg = ctx(f);
  fg.translate(N / 2, N / 2);
  draw(fg, R);
  const c = canvas(size, size);
  const g = ctx(c);
  asphalt(g, size, size, 5);
  night(g, size, size, 0.3, [[size * 0.05, size * 0.05, size * 0.9]]);
  const s = (size * zoom) / N;
  const off = (size - N * s) / 2;
  g.save();
  g.globalAlpha = 0.6;
  g.filter = "blur(5px) brightness(0)";
  g.drawImage(f, off + 8, off + 12, N * s, N * s);
  g.restore();
  g.drawImage(f, off, off, N * s, N * s);
  return c;
}

function main(): void {
  const host = document.getElementById("tests") as HTMLElement;
  const live: ((t: number) => void)[] = [];
  for (const wp of WEAPONS) {
    const sec = document.createElement("section");
    sec.innerHTML = `<h2>${wp.name}</h2><div class="grid"></div>`;
    host.append(sec);
    const grid = sec.querySelector(".grid") as HTMLElement;
    for (const [i, st] of STYLES.entries()) {
      const draw = drawWith(st.outline, wp.w);
      const card = document.createElement("article");
      card.className = "pair";
      card.innerHTML = `<h3></h3><div class="sides"><figure><figcaption>Flat (today's rendering)</figcaption></figure><figure><figcaption>Take 4 (animated)</figcaption></figure></div>`;
      (card.querySelector("h3") as HTMLElement).textContent = st.name;
      const figs = card.querySelectorAll("figure");
      const zoom = wp.w ? 1.25 : 1.5;
      (figs[0] as HTMLElement).prepend(flat(draw, 240, zoom));
      const lit = relight4(draw, 2.7, 990 + i);
      const a = animated(lit, SURV, zoom, 240, i * 0.5);
      a.frame(0);
      (figs[1] as HTMLElement).prepend(a.c);
      live.push(a.frame);
      grid.append(card);
    }
  }
  const t0 = performance.now();
  const loop = (now: number): void => {
    for (const f of live) f((now - t0) / 1000);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

main();
