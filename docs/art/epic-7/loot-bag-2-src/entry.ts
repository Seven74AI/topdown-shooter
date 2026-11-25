/**
 * Loot bag round 2 page: the six objects (objects.ts) on the real Downtown bake (rain, 5 % blackout) with the real
 * survivors, zombies, S2 sandbags and the 6.9 supply crate (game drawing code, read-only).
 */
import { DOWNTOWN_MAP, shopfrontsOf, DEFAULT_LOOK } from "@topdown/shared";
import { downtownScene } from "../../../../apps/client/src/render/city/testScene";
import { drawBase, drawOverlay, drawLightmap, drawGlow, type CityScene } from "../../../../apps/client/src/render/city/drawCity";
import { ensureAtlases } from "../../../../apps/client/src/render/city/spriteAtlas";
import { DOWNTOWN_DRESSING, MAP_PX_PER_M, type Dressing } from "../../../../apps/client/src/render/city/dressing";
import { drawSurvivor, drawZombie } from "../../../../apps/client/src/render/city/spriteArt";
import { resolveLook } from "../../../../apps/client/src/render/city/survivorLook";
import { drawObjectInFrame, drawSandbags } from "../../../../apps/client/src/render/city/objectArt";
// @ts-expect-error exported for this page by build.mjs (read-only)
import { drawCrate, drawPuff } from "../../../../apps/client/src/render/city/eventArt";
import { EVENT_SMOKE_RGB } from "../../../../apps/client/src/render/city/eventArt";
import { SLOT_COLOR_CSS } from "../../../../apps/client/src/render/playerColors";
import { OBJECTS, objectCanvas, silhouetteOf, RM, FRAME_M, canvas, type ObjDef } from "./objects";

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;
const DPR = 2;
const PPM = 35;
const fakeScene = { textures: { exists: () => true } } as never;

function dressingFor(off: boolean): Dressing {
  const d = DOWNTOWN_DRESSING; if (!off) return d;
  const shop: Record<string, readonly [string, number]> = {};
  for (const f of shopfrontsOf(DOWNTOWN_MAP)) shop[f.name] = [(d.shopLight[f.name] ?? ["255,190,120", 0.5])[0], 0];
  return { ...d, shopLight: shop, spill: [], neon: [], lamps: [], flickerLamp: -1, canopy: "", runningCar: "" } as Dressing;
}
function street(stage: number, off: boolean, x0: number, y0: number, w: number, h: number): HTMLCanvasElement {
  const atlas = ensureAtlases(fakeScene);
  const cs: CityScene = { ...downtownScene(Math.min(stage, 3), 359), stage, atlas, dressing: dressingFor(off) };
  const ppm = PPM * DPR;
  const cv = canvas(Math.round(w * ppm), Math.round(h * ppm)); const g = cv.getContext("2d")!;
  const s = ppm / MAP_PX_PER_M, P = MAP_PX_PER_M;
  const bd = { x0: x0 * P - 96, y0: y0 * P - 96, x1: (x0 + w) * P + 96, y1: (y0 + h) * P + 96 };
  g.setTransform(s, 0, 0, s, -x0 * ppm, -y0 * ppm);
  drawBase(g, s, cs, bd); drawOverlay(g, s, cs, bd);
  if (!off) {
    const L = 8, W = DOWNTOWN_MAP.widthM, H = DOWNTOWN_MAP.heightM;
    const light = canvas(W * L, H * L), glow = canvas(W * L, H * L);
    const lg = light.getContext("2d")!, gg = glow.getContext("2d")!;
    lg.setTransform(L / P, 0, 0, L / P, 0, 0); gg.setTransform(L / P, 0, 0, L / P, 0, 0);
    drawLightmap(lg, cs); drawGlow(gg, cs);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "multiply"; g.drawImage(light, x0 * L, y0 * L, w * L, h * L, 0, 0, cv.width, cv.height);
    g.globalCompositeOperation = "lighter"; g.drawImage(glow, x0 * L, y0 * L, w * L, h * L, 0, 0, cv.width, cv.height);
    g.globalCompositeOperation = "source-over";
  }
  return cv;
}
const LOOKS = [
  { head: "riot", top: "camo", hair: "tied", skin: "3", colours: { top: "#5d6b3a", hair: "#3a2a1c", accent: "#1f2326" } },
  {},
  { head: "cone", top: "floral", hair: "curly", skin: "6", pack: "duffel", colours: { top: "#2c6f8f", hair: "#121010", accent: "#e0b33a" } },
];
function survivor(g: G, i: number, x: number, y: number, a: number, slot: number): void {
  const r = 0.4 * PPM;
  g.save(); g.globalAlpha = 0.9; g.strokeStyle = SLOT_COLOR_CSS[slot]!; g.lineWidth = Math.max(1.5, r * 0.2); g.beginPath(); g.arc(x, y, r * 1.22, 0, TAU); g.stroke(); g.restore();
  g.save(); g.translate(x, y); g.rotate(a); drawSurvivor(g, r, undefined, undefined, resolveLook({ ...DEFAULT_LOOK, ...(LOOKS[i] as object) } as never, 3)); g.restore();
}
function zombie(g: G, x: number, y: number, a: number, v: number, type = "walker"): void { g.save(); g.translate(x, y); g.rotate(a); drawZombie(g, type as never, 0.4 * PPM, v); g.restore(); }

// ─── the pick-up signal (same on every option): soft white ground ring, white rim light up-left, one glint ───
const sigCache = new Map<string, { obj: HTMLCanvasElement; white: HTMLCanvasElement; black: HTMLCanvasElement }>();
function layers(d: ObjDef) {
  let h = sigCache.get(d.code);
  if (!h) { const obj = objectCanvas(d); h = { obj, white: silhouetteOf(obj, "#fff"), black: silhouetteOf(obj, "#000") }; sigCache.set(d.code, h); }
  return h;
}
function glint(g: G, x: number, y: number, R: number, a: number): void {
  g.save(); g.globalCompositeOperation = "lighter"; g.globalAlpha = a;
  const gr = g.createRadialGradient(x, y, 0, x, y, R * 0.9); gr.addColorStop(0, "rgba(255,255,255,0.9)"); gr.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = gr; g.beginPath(); g.arc(x, y, R * 0.9, 0, TAU); g.fill();
  g.fillStyle = "#fff"; g.beginPath();
  for (let i = 0; i < 8; i++) { const rr = i % 2 ? R * 0.1 : R * (i % 4 === 0 ? 1 : 0.6); const an = (i / 8) * TAU - Math.PI / 2; g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); }
  g.closePath(); g.fill(); g.restore();
}
/** Draws the object centred at (x, y) at `ppm` CSS px per metre; `sig` = the pick-up signal strength (0–1). */
function drawObject(g: G, d: ObjDef, x: number, y: number, ppm: number, sig = 1, shadow = true): void {
  const L = layers(d); const S = FRAME_M * ppm;
  g.save(); g.translate(x, y);
  if (sig > 0) { // ground ring (one frame of its 1.2 s pulse)
    const R = d.ringR * ppm; if (ppm > 60) sig *= 0.6;
    g.save(); g.globalCompositeOperation = "lighter";
    const gr = g.createRadialGradient(0, 0, R * 0.4, 0, 0, R * 1.15); gr.addColorStop(0, "rgba(255,255,255,0)"); gr.addColorStop(0.72, `rgba(255,255,255,${0.1 * sig})`); gr.addColorStop(0.86, `rgba(255,255,255,${0.42 * sig})`); gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R * 1.15, 0, TAU); g.fill();
    g.strokeStyle = `rgba(255,255,255,${0.55 * sig})`; g.lineWidth = Math.max(1, ppm * 0.018); g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
    g.strokeStyle = `rgba(255,255,255,${0.18 * sig})`; g.lineWidth = Math.max(0.8, ppm * 0.01); g.beginPath(); g.arc(0, 0, R * 1.2, 0, TAU); g.stroke();
    g.restore();
  }
  g.rotate(d.rot);
  if (shadow) { // soft cast shadow down-right (rotated back to screen space)
    g.save(); g.rotate(-d.rot); g.translate(0.05 * ppm, 0.07 * ppm); g.rotate(d.rot);
    g.filter = `blur(${Math.max(1, 0.04 * ppm)}px)`; g.globalAlpha = 0.7; g.drawImage(L.black, -S / 2, -S / 2, S, S); g.restore();
    g.save(); g.filter = `blur(${Math.max(0.5, 0.01 * ppm)}px)`; g.globalAlpha = 0.6; g.drawImage(L.black, -S / 2 + 0.008 * ppm, -S / 2 + 0.012 * ppm, S, S); g.restore();
  }
  g.imageSmoothingQuality = "high";
  g.drawImage(L.obj, -S / 2, -S / 2, S, S);
  if (sig > 0) { // rim light: the white silhouette minus itself shifted down-right = the up-left edge
    const c = canvas(L.obj.width, L.obj.height); const cg = c.getContext("2d")!;
    const off = Math.max(2, 1.3 * RM / ppm);
    cg.drawImage(L.white, 0, 0);
    cg.globalCompositeOperation = "destination-out";
    const ox = off * Math.cos(-d.rot + Math.PI / 4) * Math.SQRT2 * 0.7, oy = off * Math.sin(-d.rot + Math.PI / 4) * Math.SQRT2 * 0.7;
    cg.drawImage(L.white, ox, oy);
    g.save(); g.globalCompositeOperation = "lighter";
    const ra = ppm > 60 ? 0.45 : 0.85; g.globalAlpha = ra * sig; g.filter = `blur(${Math.max(0.6, ppm * 0.012)}px)`; g.drawImage(c, -S / 2, -S / 2, S, S);
    g.filter = "none"; g.globalAlpha = ra * 0.6 * sig; g.drawImage(c, -S / 2, -S / 2, S, S);
    g.restore();
    glint(g, d.glint[0] * ppm, d.glint[1] * ppm, Math.max(5, 0.11 * ppm) * sig, 0.95);
  }
  g.restore();
}
function rain(g: G, w: number, h: number, a: number, seed = 42): void {
  let s = seed; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.save(); g.strokeStyle = `rgba(190,205,225,${0.3 * a})`; g.lineWidth = 1; g.beginPath();
  for (let i = 0; i < (w * h) / 1300; i++) { const x = r() * w, y = r() * h; g.moveTo(x, y); g.lineTo(x - 3, y + 11); }
  g.stroke();
  g.strokeStyle = `rgba(200,215,235,${0.22 * a})`;
  for (let i = 0; i < (w * h) / 4000; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.ellipse(x, y, 2 + r() * 2, 1 + r(), 0, 0, TAU); g.stroke(); }
  g.restore();
}
function sandbags(g: G, x: number, y: number, ppm: number, rot = 0): void {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = "rgba(0,0,0,0.35)"; g.filter = `blur(${ppm * 0.06}px)`; g.fillRect(-1.45 * ppm + ppm * 0.08, -0.45 * ppm + ppm * 0.1, 2.9 * ppm, 0.9 * ppm); g.filter = "none";
  drawObjectInFrame(g, -1.5 * ppm, -0.5 * ppm, 3 * ppm, ppm, ppm, (c) => drawSandbags(c, 3, 1));
  g.restore();
}
function crate(g: G, x: number, y: number, ppm: number, smoke = true): void {
  const k = ppm / 72; // the frame (80 × 72 px) is 1 m tall in game
  g.save(); g.translate(x, y); g.scale(k, k);
  g.fillStyle = "rgba(0,0,0,0.4)"; g.fillRect(-36, -30, 80, 72);
  drawCrate(g, { x: -40, y: -36, w: 80, h: 72 });
  if (smoke) { g.translate(14, -46); drawPuff(g, { x: -32, y: -32, w: 64, h: 64 }, EVENT_SMOKE_RGB, 0.55); g.translate(18, -22); drawPuff(g, { x: -32, y: -32, w: 64, h: 64 }, EVENT_SMOKE_RGB, 0.35); }
  g.restore();
}

// ─── scenes ───
const W = 568, H = 320;
let rainBg: HTMLCanvasElement | null = null, darkBg: HTMLCanvasElement | null = null;
function bgs() { if (!rainBg) { rainBg = street(3, false, 15, 13, W / PPM, H / PPM); darkBg = street(5, true, 15, 13, W / PPM, H / PPM); } return [rainBg, darkBg!] as const; }
const PLAYERS: [number, number, number, number][] = [[0.36, 0.62, -0.3, 0], [0.24, 0.4, -0.7, 1], [0.47, 0.3, 0.3, 2]];
const ZS: [number, number, number, number][] = [[0.84, 0.3, 3.4, 2], [0.9, 0.55, 3.1, 5], [0.78, 0.84, 3.7, 8], [0.1, 0.86, -0.6, 4]];
const BAG: [number, number] = [0.62, 0.6];
function sceneCanvas(): [HTMLCanvasElement, G] { const c = canvas(W * DPR, H * DPR); c.style.width = W + "px"; c.style.height = H + "px"; const g = c.getContext("2d")!; g.scale(DPR, DPR); return [c, g]; }
function scene(d: ObjDef, mode: "rain" | "dark"): HTMLCanvasElement {
  const [c, g] = sceneCanvas(); const [rb, db] = bgs();
  g.drawImage(mode === "rain" ? rb : db, 0, 0, W, H);
  // a sandbag line and the supply crate in the same street, for the "never confused" read
  sandbags(g, 0.2 * W, 0.16 * H, PPM, 0.05);
  if (mode === "rain") crate(g, 0.86 * W, 0.12 * H, PPM, true);
  for (const [x, y, a, v] of ZS) zombie(g, x * W, y * H, a, v);
  if (mode === "rain") rain(g, W, H, 1);
  if (mode === "dark") {
    const dc = canvas(W * DPR, H * DPR); const dg = dc.getContext("2d")!; dg.scale(DPR, DPR);
    dg.fillStyle = "rgba(3,5,9,0.95)"; dg.fillRect(0, 0, W, H); dg.globalCompositeOperation = "destination-out";
    for (const [x, y, a] of PLAYERS) {
      const px = x * W, py = y * H, ang = a - Math.PI / 2 + Math.PI / 2; const len = 7 * PPM;
      const gr = dg.createRadialGradient(px, py, 4, px, py, len); gr.addColorStop(0, "rgba(0,0,0,0.82)"); gr.addColorStop(0.7, "rgba(0,0,0,0.6)"); gr.addColorStop(1, "rgba(0,0,0,0)");
      dg.fillStyle = gr; dg.beginPath(); dg.moveTo(px, py); dg.arc(px, py, len, ang - 0.32, ang + 0.32); dg.closePath(); dg.fill();
      const g2 = dg.createRadialGradient(px, py, 0, px, py, 30); g2.addColorStop(0, "rgba(0,0,0,0.6)"); g2.addColorStop(1, "rgba(0,0,0,0)"); dg.fillStyle = g2; dg.beginPath(); dg.arc(px, py, 30, 0, TAU); dg.fill();
    }
    g.drawImage(dc, 0, 0, W, H);
    rain(g, W, H, 0.35);
  }
  for (const [x, y, a, s] of PLAYERS) survivor(g, s, x * W, y * H, a, s === 0 ? 1 : s === 1 ? 0 : 2);
  drawObject(g, d, BAG[0] * W, BAG[1] * H, PPM, 1);
  return c;
}
function closeup(d: ObjDef): HTMLCanvasElement {
  const w = 300, h = 320; const c = canvas(w * DPR, h * DPR); c.style.width = w + "px"; c.style.height = h + "px";
  const g = c.getContext("2d")!; g.scale(DPR, DPR);
  const [rb] = bgs(); // a patch of the real wet street, enlarged 4×
  g.imageSmoothingQuality = "high"; g.drawImage(rb, 0.4 * W * DPR, 0.5 * H * DPR, (w / 4) * DPR, (h / 4) * DPR, 0, 0, w, h);
  drawObject(g, d, w / 2, h / 2 + 6, PPM * 4, 1);
  g.fillStyle = "rgba(255,255,255,0.75)"; g.font = "600 11px Oswald, sans-serif"; g.fillText("4× · 140 px per metre", 10, h - 10);
  g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 1; g.beginPath(); g.moveTo(w - 150, h - 14); g.lineTo(w - 10, h - 14); g.moveTo(w - 150, h - 18); g.lineTo(w - 150, h - 10); g.moveTo(w - 10, h - 18); g.lineTo(w - 10, h - 10); g.stroke();
  g.textAlign = "center"; g.fillText("1 m", w - 80, h - 20);
  return c;
}
function compare(d: ObjDef): HTMLCanvasElement {
  const w = 568, h = 200; const c = canvas(w * DPR, h * DPR); c.style.width = w + "px"; c.style.height = h + "px";
  const g = c.getContext("2d")!; g.scale(DPR, DPR);
  const [rb] = bgs(); g.drawImage(rb, 0.3 * W * DPR, 0.62 * H * DPR, w, h, 0, 0, w, h); g.fillStyle = "rgba(0,0,0,0.2)"; g.fillRect(0, 0, w, h);
  const p2 = PPM * 2;
  sandbags(g, 120, 72, p2 * 0.62); crate(g, 300, 80, p2, true); drawObject(g, d, 450, 76, p2, 1);
  // 1× row
  g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(0, 140, w, 60);
  sandbags(g, 120, 170, PPM); crate(g, 300, 172, PPM, true); drawObject(g, d, 450, 170, PPM, 1);
  g.fillStyle = "rgba(255,255,255,0.8)"; g.font = "600 11px Oswald, sans-serif";
  g.fillText("COVER · S2 SANDBAGS", 40, 16); g.fillText("6.9 SUPPLY CRATE", 252, 16); g.fillText(`LOOT · ${d.code}`, 420, 16);
  g.fillText("2× (bags ⅝ size)", 8, 132); g.fillText("1× game size", 8, 152);
  return c;
}

const INFO: Record<string, { name: string; line: string; fit: string; rec: string; star?: boolean }> = {
  LB4: { name: "The dead hiker's backpack", line: "Slate ripstop trekking pack lying on its back: padded lid with a buckled strap, zipped front pocket, a mountain patch, a ribbed foam sleeping mat strapped across the bottom, a steel mug on a carabiner, a cut shoulder strap flopped out.", fit: "It is literally the zombie's belongings: the survivor it used to be packed this before the city fell. The rolled mat makes the silhouette unique (nothing else on the street is a rectangle with a cylinder).", rec: "Best story and silhouette; the colour (blue-grey) sits apart from olive cover and the green crate.", star: true },
  LB5: { name: "Tactical go-bag (duffel)", line: "Black Cordura duffel with coyote ends, MOLLE webbing rows, two carry handles with a rubber grip, a twin-pull zipper, a loose shoulder strap, a white luggage tag and a worn GO BAG print.", fit: "The prepper's bug-out bag: exactly what a survivor grabs. Reads as a bag at once from its handles and strap.", rec: "Strong second; long and dark like a body bag at 1×, so keep it short (0.7 m)." },
  LB6: { name: "Lockable field case", line: "Charcoal hard case: raised rim and ribs, two latches, rubber handle, padlocked hasp, a pressure valve, a worn PROPERTY OF SURVIVOR stencil label and a strip of white tape.", fit: "A sealed case = 'something valuable inside' with a lock to break. Very AAA-loot.", rec: "Not recommended: a hard rectangular box is the closest to the supply crate and to cover." },
  LB7: { name: "Trauma bag", line: "Navy ripstop medic bag: white cross on a velcro patch, two reflective silver bands, side pouches, twin zips, a webbing handle, a tourniquet tucked in a pocket, an old dark stain.", fit: "Fits the city-in-collapse; the white cross is the clearest 'pick-up' symbol in the game's colour rule.", rec: "Not recommended for 7.12: players will expect healing, and the med station already owns the cross." },
  LB8: { name: "Police evidence bag", line: "Heavy clear plastic bag, heat-sealed top, white EVIDENCE label with signature lines and a barcode; the survivor part inside (here the gas mask) is seen through the wet, creased plastic with rain beads.", fit: "The police station / riot theme of Downtown, and the item is visible: the bag literally shows its reward.", rec: "Most original, but the item is half the read and would spoil the 'surprise'; the clear plastic also loses contrast in the dark." },
  LB9: { name: "Delivery rider's thermal backpack", line: "Square insulated cube bag: black Cordura, zip lid with piping, a big reflective silver panel with a worn HOT FOOD print, a top handle, straps flopped out, a stepped-in dent and a torn corner showing the silver lining.", fit: "The most 'city' object: every Downtown has these riders. A square with a white panel reads at a glance, day and night.", rec: "Best night read (the reflective panel catches the light); a little less 'survivor' story than LB4." },
};

function page(): void {
  const main = document.getElementById("main")!;
  for (const d of OBJECTS) {
    const i = INFO[d.code]!;
    const sec = document.createElement("section"); sec.className = "opt" + (i.star ? " star" : ""); sec.id = d.code;
    sec.innerHTML = `<header><span class="code">${d.code}</span><h2>${i.name}</h2>${i.star ? '<span class="fav">Favourite</span>' : ""}</header>
      <p class="line">${i.line}</p><p><b>Why it fits:</b> ${i.fit}</p><p class="rec"><b>Recommendation:</b> ${i.rec}</p>`;
    const row = document.createElement("div"); row.className = "row";
    const fig = (cv: HTMLCanvasElement, cap: string) => { const f = document.createElement("figure"); f.appendChild(cv); const fc = document.createElement("figcaption"); fc.textContent = cap; f.appendChild(fc); return f; };
    row.appendChild(fig(closeup(d), `${d.code} close-up 4× (wet, rain stage 3)`));
    row.appendChild(fig(scene(d, "rain"), `${d.code} at game size · Downtown, rain (stage 3) · 568 × 320`));
    row.appendChild(fig(scene(d, "dark"), `${d.code} · 5 % blackout (drawn above the darkness)`));
    row.appendChild(fig(compare(d), `${d.code} next to cover (sandbags) and the 6.9 supply crate`));
    sec.appendChild(row); main.appendChild(sec);
  }
  document.body.dataset.ready = "1";
}
(document.fonts?.ready ?? Promise.resolve()).then(() => setTimeout(page, 30));
