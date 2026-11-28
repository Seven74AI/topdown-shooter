/**
 * Telegraphs, round 2 (photoreal group 5): the bake helpers of TH-R, GD-R and CR-R. Everything here runs once in a
 * Look's `bake()`; nothing is made per frame.
 *
 * ONE kind of mark per kind of damage (fx.md › FX 5, designer 2026-11-28: "why slam cracks and craters are so
 * different?"). The slam cracks and the throw crater are now drawn by the SAME function, the game's approved
 * `groundDamageArt.ts › drawGroundDamage`, each with its own `DamageLook`, and relit by the SAME `relief()` pass
 * (same light from the upper left, same depth). The crater adds what a falling slab does that fists don't: a deeper
 * dish, asphalt slabs heaved up round the rim, the slab's own broken pieces in the pit. Those extra pieces are drawn
 * with the decal's own palette (the lit lip 200 grey at low alpha, the crack black 6,5,4, gravel greys 55–110).
 */
import { make, rng } from "./kit";
import { relief } from "./telegraphs-art";
import { drawGroundDamage, fbm, type DamageLook } from "../../../../apps/client/src/render/city/groundDamageArt";

/** The slam's look (the approved one, `SLAM_DAMAGE`): kept as is. The crater's look, from the same function: */
export const CRATER_DAMAGE: DamageLook = {
  bowl: 1.7, // a deeper dish: a 1.3 m slab fell 3 m (the slam's is 1)
  cracks: 5, // fewer, shorter main fractures (the slam: 11); the slabs take the rim
  soot: 0.62, // here the dark pit floor (crushed asphalt in its own shadow), not a scorch
  rays: 0.8, // more ejecta: the slab threw the road out
  debris: 300, // gravel
  fine: 3, // few long hairlines (the slam: 9)
  seed: 19,
};
/** Both marks are baked at the same density: 384 px for the slam's 9 m (42.7 px/m) → 256 px for the crater's 6 m. */
export const MARK_PXM = 384 / 9;
/**
 * The crater's side: twice the throw's 3 m reach, by the slam's own rule (its 9 m decal = 2 × the 4.5 m reach): the
 * fractures end where the danger ended. The dish lip sits at 0.19 × the side = 1.1 m (a 2.25 m pit for a 1.3 m slab).
 */
export const CRATER_SIDE_M = 6;

/** The relight both marks share (`gdRelit`'s numbers): same light, same depth. */
export const markRelief = (c: HTMLCanvasElement): HTMLCanvasElement => relief(c, { fromLum: 1.1, blur: 1, depth: 5 });

type P = [number, number];
/** A jagged closed path through `pts` (each side broken into steps). */
function jagged(g: CanvasRenderingContext2D, pts: readonly P[], R: () => number, amp: number): void {
  g.beginPath();
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i] as P;
    const [bx, by] = pts[(i + 1) % pts.length] as P;
    if (i === 0) g.moveTo(ax, ay);
    for (let k = 1; k <= 3; k++) {
      const f = k / 3;
      const j = k < 3 ? (R() - 0.5) * amp : 0;
      g.lineTo(ax + (bx - ax) * f + j, ay + (by - ay) * f + j);
    }
  }
  g.closePath();
}
/** Soft aggregate mottling inside what is already drawn (no hard specks: the relight would ring them). */
function mottle(g: CanvasRenderingContext2D, n: number, seed: number, amt: number, from: HTMLCanvasElement): void {
  const img = g.getImageData(0, 0, n, n);
  const base = from.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, n, n).data;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const j = (y * n + x) * 4;
      if ((img.data[j + 3] as number) === (base[j + 3] as number) && img.data[j] === base[j]) continue; // untouched
      const f = 1 + (fbm(x / 5, y / 5, seed, 4) - 0.5) * amt;
      img.data[j] = Math.min(255, (img.data[j] as number) * f);
      img.data[j + 1] = Math.min(255, (img.data[j + 1] as number) * f);
      img.data[j + 2] = Math.min(255, (img.data[j + 2] as number) * f);
    }
  g.putImageData(img, 0, 0);
}

/**
 * The throw crater, flat (before the relight): `drawGroundDamage(CRATER_DAMAGE)`, then the heaved slabs round the
 * lip and the slab's own pieces in the pit. `n` px for CRATER_SIDE_M.
 */
export function craterFlat(n: number, seed = 0): HTMLCanvasElement {
  const c = make(n, n);
  const g = c.getContext("2d", { willReadFrequently: true })!;
  drawGroundDamage(g, 0, 0, n, { ...CRATER_DAMAGE, seed: CRATER_DAMAGE.seed + seed }, () => document.createElement("canvas"));
  const before = make(n, n);
  before.getContext("2d")!.drawImage(c, 0, 0);
  const R = rng(401 + seed);
  const cx = n / 2;
  const lip = n * 0.15 * 1.25; // drawGroundDamage's lip (R0 × 1.25)
  const u = n / 256;
  const LX = -0.6; // the light, upper left
  const LY = -0.8;
  // 0. the pit's own shade: a deep dish lit from the upper left keeps its upper-left wall and its floor in shadow
  //    (drawGroundDamage only shades the slopes, with the ejecta dust over them, so a deep dish read light)
  {
    const sx = cx - lip * 0.22;
    const sy = cx - lip * 0.28;
    const gr = g.createRadialGradient(sx, sy, 0, cx, cx, lip * 1.02);
    gr.addColorStop(0, "rgba(8,7,6,0.72)");
    gr.addColorStop(0.55, "rgba(8,7,6,0.5)");
    gr.addColorStop(0.85, "rgba(8,7,6,0.18)");
    gr.addColorStop(1, "rgba(8,7,6,0)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cx, lip * 1.02, 0, Math.PI * 2);
    g.fill();
  }
  // 1. heaved slabs: the road round the pit broke into a few angular plates and their inner edges were pushed up.
  //    Each plate: a soft shadow down-right (it stands up from the road), a top of the street's own asphalt tilted
  //    outward (lit when that tilt faces the upper-left light), a broken face toward the pit (lit when it faces the
  //    light, in its own shade otherwise), and the crack where it tore from the road (the decal's black + lit lip).
  //    Not a full ring: 6 plates of different sizes with gaps, the rest of the lip is only cracked.
  const N = 6;
  let a0 = R() * Math.PI * 2;
  for (let i = 0; i < N; i++) {
    const span = 0.45 + R() * 0.4;
    const a1 = a0 + span;
    const lift = 0.4 + R() * 0.6; // how far its inner edge was pushed up
    const r0 = lip * (0.84 + R() * 0.1);
    const r1 = r0 + n * (0.045 + 0.04 * lift);
    const am = (a0 + a1) / 2;
    const at = (r: number, a: number): P => [cx + Math.cos(a) * r, cx + Math.sin(a) * r];
    // straight broken edges: 2 inner corners, 3 outer corners
    const plate: P[] = [at(r0, a0 + 0.03), at(r0 * 1.02, am + (R() - 0.5) * 0.2), at(r0, a1 - 0.03), at(r1 * (0.97 + R() * 0.06), a1 - 0.08), at(r1 * (1.02 + R() * 0.05), am), at(r1 * (0.96 + R() * 0.06), a0 + 0.07)];
    const path = (): void => {
      g.beginPath();
      plate.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
    };
    g.save();
    g.translate((2 + 2.5 * lift) * u, (2.4 + 3 * lift) * u);
    path();
    g.fillStyle = `rgba(6,5,4,${(0.35 + 0.25 * lift).toFixed(2)})`;
    g.fill();
    g.restore();
    const out = Math.cos(am) * LX + Math.sin(am) * LY; // > 0: the top tilts toward the light
    const v = Math.round(40 + 14 * out * lift); // the street's asphalt (#23282d ≈ 38), tilted
    const gr = g.createLinearGradient(...at(r0, am), ...at(r1, am));
    gr.addColorStop(0, `rgb(${v + 6},${v + 8},${v + 10})`);
    gr.addColorStop(1, `rgb(${v - 4},${v - 2},${v})`);
    path();
    g.fillStyle = gr;
    g.fill();
    const facing = -out; // the broken face looks at the pit
    g.lineCap = "round";
    g.lineWidth = (1.2 + 2.2 * lift) * u;
    g.strokeStyle = facing > 0.1 ? `rgba(170,165,156,${(0.3 + 0.35 * facing).toFixed(2)})` : "rgba(6,5,4,0.85)";
    g.beginPath();
    g.moveTo(...(plate[0] as P));
    g.lineTo(...(plate[1] as P));
    g.lineTo(...(plate[2] as P));
    g.stroke();
    for (const [ox, col, w] of [
      [-0.8 * u, "rgba(190,185,175,0.18)", 1.5],
      [0, "rgba(6,5,4,0.85)", 1.1],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w * u;
      g.beginPath();
      for (let k = 2; k <= 6; k++) {
        const [x, y] = plate[k % 6] as P;
        if (k === 2) g.moveTo(x + ox, y + ox);
        else g.lineTo(x + ox, y + ox);
      }
      g.stroke();
    }
    a0 = a1 + 0.25 + R() * 0.45; // a gap: the lip there is only cracked
  }
  // 2. the slab's own pieces in the pit (the thrown road: one piece keeps a stretch of the worn centre line)
  for (let i = 0; i < 6; i++) {
    const a = R() * Math.PI * 2;
    const d = lip * (0.1 + R() * 0.5);
    const x = cx + Math.cos(a) * d;
    const y = cx + Math.sin(a) * d;
    const s = n * (0.026 + R() * 0.026) * (i === 0 ? 1.5 : 1);
    const pts: P[] = [];
    for (let k = 0; k < 5; k++) {
      const b = (k / 5) * Math.PI * 2 + R() * 0.6;
      pts.push([x + Math.cos(b) * s * (0.7 + R() * 0.5), y + Math.sin(b) * s * (0.6 + R() * 0.4)]);
    }
    g.save();
    g.translate(1.8 * u, 2.2 * u);
    jagged(g, pts, R, 1.5 * u);
    g.fillStyle = "rgba(6,5,4,0.55)";
    g.fill();
    g.restore();
    jagged(g, pts, R, 1.5 * u);
    g.fillStyle = "#353438"; // the road chunk (darker: in the pit)'s asphalt (chunkTex kind 0)
    g.fill();
    if (i === 0) {
      g.save();
      g.clip();
      g.strokeStyle = "rgba(150,126,52,0.6)"; // the worn centre line, as on the slab in flight
      g.lineWidth = s * 0.32;
      g.beginPath();
      g.moveTo(x - s, y + s * 0.2);
      g.lineTo(x + s, y - s * 0.25);
      g.stroke();
      g.restore();
    }
  }
  mottle(g, n, 433 + seed, 0.45, before);
  return c;
}
