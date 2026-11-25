/**
 * Story 9.14 (B1): the street props' image atlas, rendered offline. Runs on a blank page in headless Chromium (driven
 * by `tools/art/streetProps.ts`, `npm run art:street-props`): the approved pilot's pictures (`pilot.ts › ITEMS`, the
 * relief renderer, 64 px per metre) and the approved standing police set (`barricadeArt.ts` police drawings relit
 * with the game's own relight, as the buildables are, 96 px per metre), packed with the game's atlas packer.
 * Exposes `window.__streetProps` = { width, height, frames, lamps, png, webp }.
 */
import { ITEMS } from "./pilot";
import { packAtlas, type FrameSpec } from "../../../../apps/client/src/render/city/atlasLayout";
import { drawPoliceCorner, drawPoliceFront, drawPoliceSide, inFrameCentred } from "../../../../apps/client/src/render/city/barricadeArt";
import { bakeSteps, type ArtSpec } from "../../../../apps/client/src/render/city/buildingsFrames";
import { amberLamp } from "../../../../apps/client/src/render/city/relight";
import { POLICE_PX_PER_M, policeArt, type PoliceArt } from "../../../../apps/client/src/render/city/streetPropsFrames";

const make = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = Math.round(w);
  c.height = Math.round(h);
  return c;
};

/** The police pictures relit like the standing barricades (192 px/m source), the lamps' bloom kept in the picture. */
function police(a: PoliceArt, i: number): HTMLCanvasElement {
  const draw = (g: CanvasRenderingContext2D): void => {
    if (a.kind === "front") drawPoliceFront(g, 1 + a.variant, a.units);
    else if (a.kind === "side") drawPoliceSide(g, 1 + a.variant);
    else drawPoliceCorner(g);
  };
  const spec: ArtSpec = { frame: a.frame, wM: a.wM, hM: a.hM, draw, inFrame: inFrameCentred, relit: { dir: a.kind === "side" ? "y" : "x", seed: 3100 + i * 10, glints: 0, emissive: amberLamp, srcPxPerM: 192 } };
  const steps = bakeSteps(spec, make);
  let s = steps.next();
  while (!s.done) s = steps.next();
  const lit = s.value;
  const c = make(lit.base.width, lit.base.height);
  const g = c.getContext("2d") as CanvasRenderingContext2D;
  g.drawImage(lit.base, 0, 0);
  if (lit.bloom) {
    // as the approved page's stills (`photoreal-3/src/build3.ts › still`)
    g.globalCompositeOperation = "lighter";
    g.globalAlpha = 0.5;
    g.drawImage(lit.bloom, 0, 0, c.width, c.height);
  }
  return c;
}

/** A lit lamp pixel after relight + bloom (amber to yellow-white: brighter and yellower than the drum's orange). */
const lampLit = (r: number, g: number, b: number): boolean => r > 230 && g > 150 && b < 130;

/** The lamps in a picture: centres of the amber blobs (px), top to bottom. */
function lampsOf(c: HTMLCanvasElement): [number, number][] {
  const { width: w, height: h } = c;
  const d = (c.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, w, h).data;
  const hot = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) if ((d[i * 4 + 3] as number) > 200 && lampLit(d[i * 4] as number, d[i * 4 + 1] as number, d[i * 4 + 2] as number)) hot[i] = 1;
  const out: [number, number][] = [];
  const stack: number[] = [];
  for (let i = 0; i < w * h; i++) {
    if (hot[i] !== 1) continue;
    let n = 0;
    let sx = 0;
    let sy = 0;
    hot[i] = 2;
    stack.push(i);
    while (stack.length) {
      const j = stack.pop() as number;
      const x = j % w;
      const y = (j - x) / w;
      n++;
      sx += x;
      sy += y;
      for (const k of [j - 1, j + 1, j - w, j + w]) if (k >= 0 && k < w * h && hot[k] === 1 && Math.abs((k % w) - x) <= 1) (hot[k] = 2), stack.push(k);
    }
    if (n >= 6) out.push([Math.round((sx / n) * 10) / 10, Math.round((sy / n) * 10) / 10]);
  }
  return out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}

function main(): void {
  const pics = new Map<string, HTMLCanvasElement>();
  for (const it of ITEMS) pics.set(it.id.replace("atlas_downtown/", ""), it.make());
  policeArt().forEach((a, i) => pics.set(a.frame, police(a, i)));
  const specs: FrameSpec[] = [...pics].map(([name, c]) => ({ name, w: c.width, h: c.height }));
  const layout = packAtlas(specs);
  const atlas = make(layout.width, layout.height);
  const g = atlas.getContext("2d") as CanvasRenderingContext2D;
  const frames: Record<string, { x: number; y: number; w: number; h: number }> = {};
  const lamps: Record<string, [number, number][]> = {};
  for (const f of layout.frames) {
    const c = pics.get(f.name) as HTMLCanvasElement;
    g.drawImage(c, f.x, f.y);
    frames[f.name] = { x: f.x, y: f.y, w: f.w, h: f.h };
    if (f.name.startsWith("prop_police")) lamps[f.name] = lampsOf(c);
  }
  Object.assign(window, {
    __streetProps: { width: layout.width, height: layout.height, pxPerM: { props: 64, police: POLICE_PX_PER_M }, frames, lamps, png: atlas.toDataURL("image/png"), webp: atlas.toDataURL("image/webp", 1), webp90: atlas.toDataURL("image/webp", 0.9) },
  });
}

main();
