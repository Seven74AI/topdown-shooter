/**
 * Story 5.9: the art of the new buildings, drawn in game code (Canvas 2D; designer's Epic 5 art
 * method: Meshy / vector / code drawings are only references). ONE drawing function per object, so
 * the designer's final pick drops in by replacing that function's body:
 *
 * - `drawReinforcedBarricade`: the B8 look (`docs/art/4-11/barricade_upgrade_b8.jpg`): upright
 *   weathered pallets propped by diagonal struts, a coil of barbed wire along the top.
 * - `drawMetalBarricade`: the designer's pick M1c (round 3): strictly top-down riveted steel plates
 *   between four square posts with hazard-striped caps.
 * - `drawSpikeTrap`: the designer's pick T1, the nail board (rusty nails standing up from weathered
 *   planks), ported from `code-drawings.html › drawT1` and scaled to the 2 × 2 m footprint.
 * - `drawMine`: the designer's pick N6 (round 3): the olive pressure-plate mine with a red light in
 *   the centre (the blinking glow is drawn by the game on top, `MineView`).
 *
 * Every function draws in METRES around the frame centre (the caller scales by px/m), in true
 * colours, with NO cast shadow (the game draws shadows by height, 4.11 rule). Frame axes for the
 * walls follow 4.11's B6 convention: the long side along +x, struts / feet toward −y (the back), so
 * `barricadeTransform` turns every tier the same way. Deterministic (seeded): every client draws
 * the same picture. Pure Canvas: no Phaser, so the drawings are easy to edit and preview.
 */

export type Ctx = CanvasRenderingContext2D;

/** Small seeded PRNG (mulberry32), as in the reference drawings. */
export function mulberry(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One device pixel in metres while drawing (set by the caller from px/m). */
let P = 0.01;

/** Draws `fn` at `pxPerM` with the origin at the frame centre (w × h px). */
export function drawInFrame(g: Ctx, x: number, y: number, w: number, h: number, pxPerM: number, fn: (g: Ctx) => void): void {
  g.save();
  g.translate(x + w / 2, y + h / 2);
  g.scale(pxPerM, pxPerM);
  P = 1 / pxPerM;
  fn(g);
  g.restore();
}

function rect(g: Ctx, x: number, y: number, w: number, h: number, fill: string): void {
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
}

function line(g: Ctx, x0: number, y0: number, x1: number, y1: number, style: string, width: number): void {
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y1);
  g.strokeStyle = style;
  g.lineWidth = width;
  g.lineCap = "round";
  g.stroke();
}

/** Wood grain streaks inside the box (already clipped by the caller or not: short and inside). */
function grain(g: Ctx, x: number, y: number, w: number, h: number, alongX: boolean, r: () => number, n: number): void {
  for (let i = 0; i < n; i++) {
    const dark = r() < 0.7;
    g.strokeStyle = dark ? `rgba(25,14,6,${0.08 + r() * 0.16})` : `rgba(210,180,140,${0.06 + r() * 0.12})`;
    g.lineWidth = (0.6 + r() * 1.2) * P;
    g.beginPath();
    if (alongX) {
      const yy = y + r() * h;
      const x0 = x + r() * w * 0.3;
      g.moveTo(x0, yy);
      g.lineTo(x0 + w * (0.3 + r() * 0.7), yy + (r() - 0.5) * h * 0.1);
    } else {
      const xx = x + r() * w;
      const y0 = y + r() * h * 0.3;
      g.moveTo(xx, y0);
      g.lineTo(xx + (r() - 0.5) * w * 0.1, y0 + h * (0.3 + r() * 0.7));
    }
    g.stroke();
  }
}

/** A weathered plank: fill, grain, lit top edge, dark bottom edge, outline. */
function plank(g: Ctx, x: number, y: number, w: number, h: number, base: string, r: () => number, alongX: boolean): void {
  rect(g, x, y, w, h, base);
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  grain(g, x, y, w, h, alongX, r, Math.max(4, Math.round((w * h) / 0.012)));
  const gr = alongX ? g.createLinearGradient(0, y, 0, y + h) : g.createLinearGradient(x, 0, x + w, 0);
  gr.addColorStop(0, "rgba(220,225,235,0.18)");
  gr.addColorStop(0.5, "rgba(0,0,0,0)");
  gr.addColorStop(1, "rgba(0,0,0,0.35)");
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  g.restore();
  g.strokeStyle = "rgba(8,5,3,0.9)";
  g.lineWidth = 1.1 * P;
  g.strokeRect(x, y, w, h);
}

function nailHead(g: Ctx, x: number, y: number, rr: number): void {
  g.beginPath();
  g.arc(x, y, rr, 0, Math.PI * 2);
  g.fillStyle = "#4a3426";
  g.fill();
  g.beginPath();
  g.arc(x - rr * 0.3, y - rr * 0.3, rr * 0.45, 0, Math.PI * 2);
  g.fillStyle = "rgba(220,190,160,0.45)";
  g.fill();
}

function bolt(g: Ctx, x: number, y: number, rr: number, base: string): void {
  const gr = g.createRadialGradient(x - rr * 0.4, y - rr * 0.4, 0, x, y, rr * 1.05);
  gr.addColorStop(0, "rgba(235,235,240,0.85)");
  gr.addColorStop(0.5, base);
  gr.addColorStop(1, "rgba(0,0,0,0.85)");
  g.beginPath();
  g.arc(x, y, rr, 0, Math.PI * 2);
  g.fillStyle = gr;
  g.fill();
  g.lineWidth = 0.7 * P;
  g.strokeStyle = "rgba(0,0,0,0.7)";
  g.stroke();
}

/**
 * Story 5.9 / designer B8: the reinforced barricade (2 × 0.5 m footprint; frame w × d metres).
 * Two upright pallets standing side by side along the long side (seen from above: the top stringer
 * and the ends of the deck boards, a little leaning so the boards show), three diagonal struts to the
 * back (−y), and a coil of barbed wire along the front top edge.
 */
export function drawReinforcedBarricade(g: Ctx, w: number, d: number): void {
  const r = mulberry(5908);
  const x0 = -w / 2;
  const y0 = -d / 2;
  // Struts first (behind): from the pallets' back edge down to the ground at the back.
  for (const sx of [-0.78, 0, 0.78]) {
    const fx = sx * (w / 2);
    g.save();
    g.translate(fx, y0 + d * 0.38);
    g.rotate(-Math.PI / 2 + (r() - 0.5) * 0.35);
    plank(g, 0, -0.045, d * 0.42, 0.09, "#6b5a45", r, true);
    g.restore();
  }
  // The pallets: a leaning deck (boards across, ends visible) on a top stringer.
  const deckY = y0 + d * 0.36;
  const deckH = d * 0.5;
  const pw = w / 2;
  for (let k = 0; k < 2; k++) {
    const px = x0 + k * pw + 0.02;
    const ww = pw - 0.04;
    rect(g, px, deckY, ww, deckH, "#2b2219"); // the dark gaps between boards
    const boards = 6;
    const bw = (ww - 0.02) / boards;
    for (let i = 0; i < boards; i++) {
      const tone = ["#7a6852", "#857158", "#6f5e49", "#806c55", "#76644e", "#8a765c"][(i + k * 2) % 6] as string;
      plank(g, px + 0.01 + i * bw + 0.006, deckY + (r() - 0.5) * 0.01, bw - 0.016, deckH, tone, r, false);
      nailHead(g, px + 0.01 + i * bw + bw / 2, deckY + 0.03, 0.007);
      nailHead(g, px + 0.01 + i * bw + bw / 2, deckY + deckH - 0.03, 0.007);
    }
    // Top stringer (the beam the boards are nailed to), seen end-on along the top.
    plank(g, px - 0.01, deckY - 0.05, ww + 0.02, 0.07, "#5f4f3d", r, true);
    // Corner blocks.
    for (const bx of [px, px + ww / 2 - 0.04, px + ww - 0.08]) plank(g, bx, deckY - 0.065, 0.08, 0.1, "#55463a", r, true);
  }
  // Barbed wire coil along the front (+y) top edge: overlapping loops, barbs.
  const cy = deckY - 0.015; // along the pallets' top edge (the stringer), as in B8
  const loops = 15;
  const span = w - 0.08;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < loops; i++) {
      const cx = x0 + 0.04 + (i + 0.5) * (span / loops);
      g.beginPath();
      g.ellipse(cx, cy, (span / loops) * 0.7, d * 0.13, 0.35, 0, Math.PI * 2);
      g.strokeStyle = pass === 0 ? "rgba(5,5,6,0.7)" : "#b4bcc4";
      g.lineWidth = (pass === 0 ? 1.8 : 0.9) * P;
      g.stroke();
      if (pass === 1) {
        const bx = cx + span / loops * 0.6;
        line(g, bx - 0.012, cy - 0.012, bx + 0.012, cy + 0.012, "#c8d0d8", 1 * P);
        line(g, bx - 0.012, cy + 0.012, bx + 0.012, cy - 0.012, "#c8d0d8", 1 * P);
      }
    }
  }
}

/** Yellow/black hazard stripes in a box (the reference's `hazard`). */
function hazard(g: Ctx, x: number, y: number, w: number, h: number, stripe: number): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  rect(g, x, y, w, h, "#e2b11f");
  g.fillStyle = "#16161a";
  for (let k = -h - stripe * 2; k < w + h; k += stripe * 2) {
    g.beginPath();
    g.moveTo(x + k, y + h);
    g.lineTo(x + k + stripe, y + h);
    g.lineTo(x + k + stripe + h, y);
    g.lineTo(x + k + h, y);
    g.closePath();
    g.fill();
  }
  g.restore();
}

/** A lit top-left edge and a dark bottom-right edge inside a box (the reference's `litEdge`). */
function litEdge(g: Ctx, x0: number, y0: number, x1: number, y1: number): void {
  line(g, x0 + P, y0 + P, x1 - P, y0 + P, "rgba(225,232,245,0.45)", 1.2 * P);
  line(g, x0 + P, y0 + P, x0 + P, y1 - P, "rgba(225,232,245,0.3)", 1.2 * P);
  line(g, x0 + P, y1 - P, x1 - P, y1 - P, "rgba(0,0,0,0.55)", 1.4 * P);
  line(g, x1 - P, y0 + P, x1 - P, y1 - P, "rgba(0,0,0,0.45)", 1.4 * P);
}

/** A shaded steel plate: base, rust blooms, top-lit gradient, outline. */
function steelPlate(g: Ctx, x0: number, y0: number, x1: number, y1: number, base: string, r: () => number, rust: number): void {
  const w = x1 - x0;
  const h = y1 - y0;
  rect(g, x0, y0, w, h, base);
  g.save();
  g.beginPath();
  g.rect(x0, y0, w, h);
  g.clip();
  for (let k = 0; k < 24; k++) {
    g.fillStyle = r() < 0.5 ? `rgba(210,220,230,${0.04 + r() * 0.05})` : `rgba(0,0,0,${0.05 + r() * 0.07})`;
    g.fillRect(x0 + r() * w, y0 + r() * h, w * (0.05 + r() * 0.3), 0.7 * P);
  }
  for (let k = 0; k < Math.round(6 * rust); k++) {
    const rx = x0 + r() * w;
    const ry = y0 + r() * h;
    const rr = Math.max(w, h) * (0.04 + r() * 0.12);
    const gr = g.createRadialGradient(rx, ry, 0, rx, ry, rr);
    const col = r() < 0.5 ? "150,72,28" : "92,46,20";
    gr.addColorStop(0, `rgba(${col},${0.28 + r() * 0.3})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr;
    g.fillRect(rx - rr, ry - rr, rr * 2, rr * 2);
  }
  const lg = g.createLinearGradient(0, y0, 0, y1);
  lg.addColorStop(0, "rgba(215,225,242,0.3)");
  lg.addColorStop(0.5, "rgba(0,0,0,0.04)");
  lg.addColorStop(1, "rgba(0,0,0,0.35)");
  g.fillStyle = lg;
  g.fillRect(x0, y0, w, h);
  g.restore();
  g.strokeStyle = "rgba(4,4,6,0.95)";
  g.lineWidth = 1.6 * P;
  g.strokeRect(x0, y0, w, h);
}

/**
 * Story 5.9 / designer M1c (round 3, `code-drawings › drawM1c`): the metal barricade, strictly top
 * down: three riveted steel plates between four chunky square posts whose caps carry yellow/black
 * hazard stripes and four hex rivets. Centred on the 2 × 0.5 m footprint (the posts span its depth;
 * the reference's baked shadow and braces are left to the game's cast shadow).
 */
export function drawMetalBarricade(g: Ctx, w: number, d: number): void {
  const r = mulberry(1131);
  const k = w / 2; // the reference spans x ∈ [-1, 1] for a 2 m wall
  const posts = [-0.88 * k, -0.29 * k, 0.29 * k, 0.88 * k];
  const ps = Math.min(0.13, d / 2 - 0.01);
  const y0 = -0.07;
  const y1 = 0.07;
  const tones = ["#5c6065", "#666a6e", "#585c61"];
  for (let i = 0; i < 3; i++) {
    const x0 = posts[i] as number;
    const x1 = posts[i + 1] as number;
    steelPlate(g, x0, y0, x1, y1, tones[i] as string, r, 0.9);
    for (let x = x0 + 0.17; x < x1 - 0.14; x += 0.07) {
      bolt(g, x, y0 + 0.028, 0.01, "#7c7e82");
      bolt(g, x + 0.035, y1 - 0.028, 0.01, "#7c7e82");
    }
    litEdge(g, x0, y0, x1, y1);
  }
  for (const x of posts) {
    steelPlate(g, x - ps, -ps, x + ps, ps, "#3c3f43", r, 0.3);
    hazard(g, x - ps + 0.025, -ps + 0.025, 2 * ps - 0.05, 2 * ps - 0.05, 0.045);
    for (const [dx, dy] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ] as const)
      bolt(g, x + dx * (ps - 0.013), dy * (ps - 0.013), 0.009, "#8a8c90");
    litEdge(g, x - ps, -ps, x + ps, ps);
  }
}

/**
 * Story 5.9 / designer T1: the spike trap, a nail board (2 × 2 m). Weathered planks across, rusty
 * nails standing up in a jittered grid (rust bloom at each foot, a small contact shade on the board,
 * a bright tip), nail heads holding the planks.
 */
export function drawSpikeTrap(g: Ctx, w: number, h: number): void {
  const r = mulberry(801);
  const planks = 6;
  const ph = h / planks;
  const tones = ["#8d7f68", "#978870", "#837560", "#90826b", "#887a63"];
  rect(g, -w / 2, -h / 2, w, h, "#2a241d"); // gaps between the planks
  for (let i = 0; i < planks; i++) {
    const y = -h / 2 + i * ph;
    plank(g, -w / 2 + 0.01 + (r() - 0.5) * 0.02, y + 0.008, w - 0.02, ph - 0.016, tones[i % tones.length] as string, r, true);
    for (const nx of [-0.46, 0, 0.46]) for (const ny of [y + 0.06, y + ph - 0.06]) nailHead(g, nx * w + (r() - 0.5) * 0.01, ny, 0.012);
  }
  // Spikes: a 9 × 9 jittered grid (~0.22 m apart), long rusty nails leaning a little toward +y.
  const n = 9;
  const pitch = (w - 0.3) / (n - 1);
  for (let iy = 0; iy < n; iy++) {
    for (let ix = 0; ix < n; ix++) {
      const x = -w / 2 + 0.15 + ix * pitch + (r() - 0.5) * 0.05;
      const y = -h / 2 + 0.15 + iy * pitch + (r() - 0.5) * 0.05;
      const lx = (r() - 0.5) * 0.06;
      const ly = 0.05 + r() * 0.04;
      const rg = g.createRadialGradient(x, y, 0, x, y, 0.06);
      rg.addColorStop(0, "rgba(120,52,18,0.7)");
      rg.addColorStop(1, "rgba(120,52,18,0)");
      g.fillStyle = rg;
      g.fillRect(x - 0.06, y - 0.06, 0.12, 0.12);
      line(g, x, y, x + 0.06 + lx * 0.4, y + 0.08, "rgba(0,0,0,0.55)", 0.02); // contact shade on the board
      const tx = x + lx;
      const ty = y - ly;
      const lg = g.createLinearGradient(x, y, tx, ty);
      lg.addColorStop(0, "#3c1e0e");
      lg.addColorStop(0.5, "#8a4a24");
      lg.addColorStop(1, "#d8b08a");
      g.beginPath();
      g.moveTo(x - 0.014, y);
      g.lineTo(tx - 0.003, ty);
      g.lineTo(tx + 0.003, ty);
      g.lineTo(x + 0.014, y);
      g.closePath();
      g.fillStyle = lg;
      g.fill();
      g.lineWidth = 1.2 * P;
      g.strokeStyle = "rgba(10,5,2,0.95)";
      g.stroke();
      g.beginPath();
      g.arc(tx, ty, 0.007, 0, Math.PI * 2);
      g.fillStyle = "#f0d2b0";
      g.fill();
    }
  }
}

/** Two offset rings: a groove/ridge pressed into the metal (the reference's `emboss`). */
function emboss(g: Ctx, rr: number): void {
  g.beginPath();
  g.arc(-1.2 * P, -1.2 * P, rr, 0, Math.PI * 2);
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.lineWidth = 1.6 * P;
  g.stroke();
  g.beginPath();
  g.arc(1.2 * P, 1.2 * P, rr, 0, Math.PI * 2);
  g.strokeStyle = "rgba(235,238,220,0.3)";
  g.lineWidth = 1.1 * P;
  g.stroke();
}

/**
 * Story 5.9 / designer N6 (round 3, `code-drawings › drawN6`): the pressure-plate mine (≈ 0.38 m
 * across in its 0.5 m cell): a military olive disc with a ridged rim, a raised pressure plate with two
 * embossed rings, two yellow arming tabs and the red light in the centre (drawn here unlit; the game
 * blinks its glow on top during waves, `MineView`).
 */
export function drawMine(g: Ctx, w: number, h: number): void {
  const R0 = Math.min(0.19, Math.min(w, h) * 0.38);
  const disc = g.createRadialGradient(-R0 * 0.35, -R0 * 0.35, R0 * 0.1, 0, 0, R0);
  disc.addColorStop(0, "#6b7350");
  disc.addColorStop(0.6, "#4d5434");
  disc.addColorStop(1, "#2a2e1c");
  g.beginPath();
  g.arc(0, 0, R0, 0, Math.PI * 2);
  g.fillStyle = disc;
  g.fill();
  g.lineWidth = 1.8 * P;
  g.strokeStyle = "rgba(6,6,7,0.95)";
  g.stroke();
  // ridged rim: 40 ticks between r 0.142 and 0.19 (scaled)
  const s = R0 / 0.19;
  for (let k = 0; k < 40; k++) {
    const a = (k / 40) * Math.PI * 2;
    const c = Math.cos(a);
    const sn = Math.sin(a);
    line(g, c * 0.142 * s, sn * 0.142 * s, c * 0.185 * s, sn * 0.185 * s, "rgba(0,0,0,0.55)", 1.6 * P);
    line(g, c * 0.142 * s - 1.4 * P, sn * 0.142 * s - 1.4 * P, c * 0.185 * s - 1.4 * P, sn * 0.185 * s - 1.4 * P, "rgba(230,235,210,0.25)", 0.9 * P);
  }
  emboss(g, 0.14 * s);
  const pr = 0.105 * s;
  const plate = g.createRadialGradient(-pr * 0.3, -pr * 0.35, 0, 0, 0, pr);
  plate.addColorStop(0, "#7d8660");
  plate.addColorStop(0.6, "#5c6440");
  plate.addColorStop(1, "#3a4026");
  g.beginPath();
  g.arc(0, 0, pr, 0, Math.PI * 2);
  g.fillStyle = plate;
  g.fill();
  g.lineWidth = 1.4 * P;
  g.strokeStyle = "rgba(6,6,7,0.95)";
  g.stroke();
  emboss(g, 0.075 * s);
  emboss(g, 0.048 * s);
  for (const a of [0.6, 0.6 + Math.PI]) {
    g.save();
    g.rotate(a);
    rect(g, 0.112 * s, -0.008 * s, 0.024 * s, 0.016 * s, "#d6b02a");
    g.restore();
  }
  // the light (unlit: the game's blinking glow sits on it)
  const lr = 0.03 * s;
  const led = g.createRadialGradient(-lr * 0.3, -lr * 0.3, 0, 0, 0, lr);
  led.addColorStop(0, "#c86a5e");
  led.addColorStop(0.4, "#6a140f");
  led.addColorStop(1, "#2a0605");
  g.beginPath();
  g.arc(0, 0, lr, 0, Math.PI * 2);
  g.fillStyle = led;
  g.fill();
  g.lineWidth = 0.9 * P;
  g.strokeStyle = "rgba(10,2,2,0.9)";
  g.stroke();
  // wet beads
  const r = mulberry(1303);
  for (let i = 0; i < 14; i++) {
    const a = r() * Math.PI * 2;
    const dd = r() * R0 * 0.9;
    const x = Math.cos(a) * dd;
    const y = Math.sin(a) * dd;
    const rr = 0.002 + r() * 0.004;
    g.beginPath();
    g.arc(x - rr * 0.35, y - rr * 0.35, rr * 0.5, 0, Math.PI * 2);
    g.fillStyle = "rgba(245,248,255,0.6)";
    g.fill();
  }
}
