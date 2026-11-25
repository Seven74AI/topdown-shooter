/* Epic 7 premium round 1 — the shared material kit (the reusable visual language for every Epic 7 screen).
 * Everything is Canvas 2D, drawn in CSS px on a context pre-scaled by DPR. Expensive layers (noise, brushed metal,
 * plates, item close-ups, backdrops) are rendered ONCE into cached canvases; per-frame motion only composites them
 * and draws a few strokes / numbers (what the game would do with baked textures + a cheap update).
 */
'use strict';
const TAU = Math.PI * 2;
const QS = new URLSearchParams(location.search);
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const STATIC = QS.has('static') || REDUCED;
const DPR = Math.min(2, Math.max(1, Math.round(devicePixelRatio || 1)));
const FONT = "'Oswald','Arial Narrow',Impact,sans-serif";
const SLOT = G7.SLOT; // blue, orange, green, purple (the game's slot colours)

// ---------- palette: steel / gunmetal, amber-gold = rewards & Supplies, white = items & people ----------
const C = {
  ink: '#eef1f4', ink2: '#c3cad2', mute: '#8d97a3', faint: '#5d6672',
  steel: '#9fb3c6', steelHi: '#d7e4f0', steelLo: '#3a4652',
  amber: '#ffb238', amberHi: '#ffe1a0', amberLo: '#b8700f', amberGlow: 'rgba(255,160,40,0.85)',
  gun0: '#0d1116', gun1: '#161c23', gun2: '#222a33', gun3: '#323c47',
};
// key light: upper-left, slightly cool (palette.ts LIGHT_DIR + tint 0.93/0.98/1.06), dark ambient, shadow down-right
const LIGHT = { x: -0.62, y: -0.78, tint: 'rgba(214,228,255,', shadow: { x: 3, y: 5 } };

function rng(seed) { let s = (seed >>> 0) || 1; return () => (s = (s * 16807) % 2147483647) / 2147483647; }
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => 1 - Math.pow(1 - clamp(t), 3);
const easeIO = (t) => { t = clamp(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const backOut = (t) => { t = clamp(t); const c1 = 1.9, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const fmt = (n) => Math.round(n).toLocaleString('en-US');

/** A canvas of w × h CSS px at scale `k` (default DPR), its context pre-scaled. */
function mk(w, h, k = DPR) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w * k)); c.height = Math.max(1, Math.ceil(h * k));
  const g = c.getContext('2d'); g.scale(k, k); c.cw = w; c.ch = h;
  return [c, g];
}
const CACHE = new Map();
function cached(key, fn) { if (!CACHE.has(key)) CACHE.set(key, fn()); return CACHE.get(key); }

// ---------- noise textures (tileable, rendered once at 256²) ----------
function tileNoise(n, cells, seed) {
  // periodic value noise, `cells` lattice cells across n px
  const r = rng(seed), L = new Float32Array(cells * cells);
  for (let i = 0; i < L.length; i++) L[i] = r();
  const out = new Float32Array(n * n);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const fx = x / n * cells, fy = y / n * cells, ix = Math.floor(fx), iy = Math.floor(fy);
    let tx = fx - ix, ty = fy - iy; tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
    const a = L[(iy % cells) * cells + ix % cells], b = L[(iy % cells) * cells + (ix + 1) % cells];
    const c = L[((iy + 1) % cells) * cells + ix % cells], d = L[((iy + 1) % cells) * cells + (ix + 1) % cells];
    out[y * n + x] = lerp(lerp(a, b, tx), lerp(c, d, tx), ty);
  }
  return out;
}
function texCanvas(n, fn) {
  const c = document.createElement('canvas'); c.width = c.height = n;
  const g = c.getContext('2d'), im = g.createImageData(n, n);
  for (let i = 0; i < n * n; i++) { const [v, a] = fn(i % n, (i / n) | 0, i); im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = v; im.data[i * 4 + 3] = a; }
  g.putImageData(im, 0, 0); return c;
}
/** fbm mottling (grey around 128): soft-light it over anything to kill flat fills. */
const TEX = {
  get fbm() { return cached('tex-fbm', () => { const n = 256, o = [tileNoise(n, 4, 3), tileNoise(n, 8, 5), tileNoise(n, 16, 7), tileNoise(n, 32, 9)]; return texCanvas(n, (x, y, i) => [clamp(128 + ((o[0][i] * 0.5 + o[1][i] * 0.25 + o[2][i] * 0.15 + o[3][i] * 0.1) - 0.5) * 300, 0, 255), 255]); }); },
  /** brushed metal: long horizontal streaks */
  get brushed() { return cached('tex-brushed', () => { const n = 256, r = rng(11), rows = new Float32Array(n); for (let y = 0; y < n; y++) rows[y] = r(); const fine = tileNoise(n, 64, 13); return texCanvas(n, (x, y, i) => { const s = rows[y] * 0.6 + rows[(y + 1) % n] * 0.25 + fine[i] * 0.15 + Math.sin((x / n) * TAU * 2 + rows[y] * 9) * 0.04; return [clamp(128 + (s - 0.5) * 120, 0, 255), 255]; }); }); },
  /** grain: per-pixel speckle */
  get grain() { return cached('tex-grain', () => { const r = rng(17); return texCanvas(128, () => [r() < 0.5 ? 255 : 0, Math.floor(r() * 26)]); }); },
  /** scratches: thin light strokes, alpha only */
  get scratch() { return cached('tex-scratch', () => { const [c, g] = mk(256, 256, 1); const r = rng(23); g.lineCap = 'round'; for (let i = 0; i < 70; i++) { const x = r() * 256, y = r() * 256, a = r() * TAU * 0.15 - 0.2 + (r() < 0.3 ? 1.2 : 0), l = 6 + r() * 40; g.strokeStyle = `rgba(255,255,255,${0.08 + r() * 0.22})`; g.lineWidth = 0.4 + r() * 0.6; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 4, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 4, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); } return c; }); },
};
function pat(g, tex, scale = 1, ox = 0, oy = 0) { const p = g.createPattern(tex, 'repeat'); p.setTransform(new DOMMatrix([scale, 0, 0, scale, ox, oy])); return p; }
/** Overlay a texture inside the current clip. */
function texture(g, tex, x, y, w, h, { op = 'soft-light', a = 0.5, scale = 0.5, ox = 0, oy = 0 } = {}) {
  g.save(); g.globalCompositeOperation = op; g.globalAlpha = a; g.fillStyle = pat(g, tex, scale, ox, oy); g.fillRect(x, y, w, h); g.restore();
}

// ---------- shapes ----------
/** Chamfered rect; `c` is a number or [tl, tr, br, bl]. */
function chamfer(g, x, y, w, h, c) {
  const [a, b, d, e] = Array.isArray(c) ? c : [c, c, c, c];
  g.beginPath();
  g.moveTo(x + a, y); g.lineTo(x + w - b, y); g.lineTo(x + w, y + b); g.lineTo(x + w, y + h - d);
  g.lineTo(x + w - d, y + h); g.lineTo(x + e, y + h); g.lineTo(x, y + h - e); g.lineTo(x, y + a); g.closePath();
}
function rrect(g, x, y, w, h, r) { g.beginPath(); g.roundRect(x, y, w, h, r); }
function brackets(g, x, y, w, h, len, gap = 0) {
  g.beginPath();
  for (const [cx, cy, sx, sy] of [[x - gap, y - gap, 1, 1], [x + w + gap, y - gap, -1, 1], [x - gap, y + h + gap, 1, -1], [x + w + gap, y + h + gap, -1, -1]]) {
    g.moveTo(cx + sx * len, cy); g.lineTo(cx, cy); g.lineTo(cx, cy + sy * len);
  }
  g.stroke();
}
function hazard(g, x, y, w, h, col, step = 4, col2 = null) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip();
  if (col2) { g.fillStyle = col2; g.fillRect(x, y, w, h); }
  g.fillStyle = col;
  for (let sx = x - h - step * 2; sx < x + w + h; sx += step * 2) { g.beginPath(); g.moveTo(sx, y + h); g.lineTo(sx + step, y + h); g.lineTo(sx + step + h, y); g.lineTo(sx + h, y); g.closePath(); g.fill(); }
  g.restore();
}
/** P1's faint triangle field (fixed pattern). */
function triField(g, x, y, w, h, col, s = 12) {
  g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.strokeStyle = col; g.lineWidth = 0.8;
  for (let j = 0; j * s * 0.9 < h + s; j++) for (let i = 0; i * s < w + s; i++) {
    if (Math.sin(i * 1.7 + j * 2.3) <= 0.35) continue;
    const tx = x + i * s + (j % 2) * (s / 2), ty = y + j * s * 0.9;
    g.beginPath(); g.moveTo(tx, ty - s * 0.35); g.lineTo(tx + s * 0.4, ty + s * 0.35); g.lineTo(tx - s * 0.4, ty + s * 0.35); g.closePath(); g.stroke();
  }
  g.restore();
}

// ---------- light & glow ----------
/** P1 neon: wide blurred pass drawn additively, then the crisp line on top. */
function neon(g, fn, glow, blur = 10, passes = 1) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.shadowColor = glow; g.shadowBlur = blur;
  for (let i = 0; i < passes; i++) fn(); g.restore(); fn();
}
/** Soft cast shadow of a path (down-right, from the upper-left key light). */
function castShadow(g, pathFn, { blur = 12, a = 0.6, dx = LIGHT.shadow.x, dy = LIGHT.shadow.y } = {}) {
  g.save(); g.shadowColor = `rgba(0,0,0,${a})`; g.shadowBlur = blur; g.shadowOffsetX = dx; g.shadowOffsetY = dy;
  pathFn(); g.fillStyle = '#000'; g.fill(); g.restore();
}
/** Bevel: a stroke whose colour runs light (upper-left) → dark (lower-right). */
function bevel(g, x, y, w, h, hi = 0.45, lo = 0.6, lw = 1.5) {
  const gr = g.createLinearGradient(x, y, x + w * 0.6, y + h * 1.4);
  gr.addColorStop(0, `rgba(255,255,255,${hi})`); gr.addColorStop(0.45, 'rgba(255,255,255,0.04)'); gr.addColorStop(0.55, 'rgba(0,0,0,0.1)'); gr.addColorStop(1, `rgba(0,0,0,${lo})`);
  g.strokeStyle = gr; g.lineWidth = lw; g.stroke();
}
/** Inner occlusion: darkens inside the current path's edges (grime in the crevices). */
function innerShade(g, pathFn, { blur = 8, a = 0.55, col = '0,0,0', lw = 6 } = {}) {
  g.save(); pathFn(); g.clip(); g.shadowColor = `rgba(${col},${a})`; g.shadowBlur = blur; g.strokeStyle = `rgba(${col},${a})`; g.lineWidth = lw; pathFn(); g.stroke(); g.restore();
}
/** Key-light wash: upper-left brighter, lower-right darker. */
function keyWash(g, x, y, w, h, a = 0.18, d = 0.35) {
  const gr = g.createLinearGradient(x, y, x + w * 0.5, y + h * 1.2);
  gr.addColorStop(0, `${LIGHT.tint}${a})`); gr.addColorStop(0.5, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${d})`);
  g.fillStyle = gr; g.fillRect(x, y, w, h);
}
/** A soft radial bloom, drawn additively. */
function bloom(g, x, y, r, col, a = 1) {
  g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a;
  const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); g.restore();
}
/** A diagonal light sweep band across a box at progress p (0..1), drawn additively. */
function sweep(g, x, y, w, h, p, { width = 0.35, a = 0.55, col = '255,240,210', angle = 0.5 } = {}) {
  if (p <= 0 || p >= 1) return;
  const span = w + h * angle, cx = x - h * angle + (span + w * width * 2) * p - w * width;
  g.save(); g.globalCompositeOperation = 'lighter';
  const gr = g.createLinearGradient(cx - w * width, 0, cx + w * width, 0);
  gr.addColorStop(0, `rgba(${col},0)`); gr.addColorStop(0.5, `rgba(${col},${a})`); gr.addColorStop(1, `rgba(${col},0)`);
  g.fillStyle = gr; g.transform(1, 0, -angle, 1, y * angle, 0); g.fillRect(cx - w * width, y, w * width * 2, h); g.restore();
}

// ---------- type ----------
function font(px, wt = 600) { return `${wt} ${px}px ${FONT}`; }
/** Text with Oswald, optional letter spacing, glow (additive), emboss / engrave, gradient fill. */
function text(g, s, x, y, o = {}) {
  const { px = 16, wt = 600, col = C.ink, align = 'left', base = 'alphabetic', ls = 0, glow = null, blur = 8, engrave = false, emboss = false, shadow = true, alpha = 1, fill = null, maxW } = o;
  g.save(); g.globalAlpha *= alpha; g.font = font(px, wt); g.textAlign = align; g.textBaseline = base; g.letterSpacing = ls + 'px';
  const f = (st) => { g.fillStyle = st; maxW ? g.fillText(s, x, y, maxW) : g.fillText(s, x, y); };
  if (engrave) { f('rgba(0,0,0,0.75)'); g.translate(0, 1); f('rgba(255,255,255,0.18)'); g.translate(0, -0.5); }
  else if (emboss) { g.translate(-0.6, -0.7); f('rgba(255,255,255,0.45)'); g.translate(1.4, 1.6); f('rgba(0,0,0,0.75)'); g.translate(-0.8, -0.9); }
  else if (shadow) { g.save(); g.shadowColor = 'rgba(0,0,0,0.8)'; g.shadowBlur = 3; g.shadowOffsetX = 0.5; g.shadowOffsetY = 1; f(fill || col); g.restore(); }
  if (glow) { g.save(); g.globalCompositeOperation = 'lighter'; g.shadowColor = glow; g.shadowBlur = blur; f(fill || col); g.restore(); }
  f(fill || col);
  g.restore();
}
function tw(g, s, px, wt = 600, ls = 0) { g.save(); g.font = font(px, wt); g.letterSpacing = ls + 'px'; const w = g.measureText(s).width; g.restore(); return w; }
function wrap(g, s, maxW, px, wt = 500) {
  const words = s.split(' '), lines = []; let cur = '';
  for (const w of words) { const t = cur ? cur + ' ' + w : w; if (tw(g, t, px, wt) > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
  if (cur) lines.push(cur); return lines;
}
/** Metallic gold fill for reward numbers (vertical, hot core). */
function goldFill(g, y, h) {
  const gr = g.createLinearGradient(0, y - h, 0, y);
  gr.addColorStop(0, '#fff6d6'); gr.addColorStop(0.42, '#ffd27a'); gr.addColorStop(0.55, '#f2a227'); gr.addColorStop(1, '#a8600c');
  return gr;
}
function steelFill(g, y, h) {
  const gr = g.createLinearGradient(0, y - h, 0, y);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#dfe7ef'); gr.addColorStop(0.56, '#aab6c2'); gr.addColorStop(1, '#e8eef4');
  return gr;
}

// ---------- glyphs (drawn, not stickers: each gets a lit, shaded volume) ----------
/** The Supplies crate: a small lit wooden-metal crate with bands, at (x, y) size s (box top-left). */
function crate(g, x, y, s, { glow = false } = {}) {
  g.save(); g.translate(x, y);
  const u = s / 16;
  castShadow(g, () => { g.beginPath(); g.rect(u * 1.5, u * 4, u * 13, u * 10.5); }, { blur: 3 * u, a: 0.6, dx: u, dy: u * 1.5 });
  // lid
  let gr = g.createLinearGradient(0, u * 2, 0, u * 4.5); gr.addColorStop(0, '#e9c983'); gr.addColorStop(1, '#9b7438');
  g.fillStyle = gr; g.beginPath(); g.moveTo(u * 2.6, u * 2); g.lineTo(u * 13.4, u * 2); g.lineTo(u * 15, u * 4.4); g.lineTo(u * 1, u * 4.4); g.closePath(); g.fill();
  // body
  gr = g.createLinearGradient(u, u * 4, u * 15, u * 15); gr.addColorStop(0, '#c99a52'); gr.addColorStop(0.6, '#8d6430'); gr.addColorStop(1, '#5a3c19');
  g.fillStyle = gr; g.fillRect(u * 1.3, u * 4.4, u * 13.4, u * 10.2);
  g.strokeStyle = 'rgba(40,24,8,0.55)'; g.lineWidth = u * 0.5;
  for (const yy of [7.6, 10.8]) { g.beginPath(); g.moveTo(u * 1.3, u * yy); g.lineTo(u * 14.7, u * yy); g.stroke(); }
  // steel corner bands
  gr = g.createLinearGradient(0, u * 4, 0, u * 15); gr.addColorStop(0, '#e6edf3'); gr.addColorStop(0.5, '#8794a1'); gr.addColorStop(1, '#4b5560');
  g.fillStyle = gr; for (const bx of [1.3, 12.6]) g.fillRect(u * bx, u * 4.4, u * 2.1, u * 10.2);
  g.fillRect(u * 1.3, u * 8.6, u * 13.4, u * 1.4);
  g.fillStyle = '#2a2016'; for (const bx of [2.35, 13.65]) for (const by of [5.6, 13.2]) { g.beginPath(); g.arc(u * bx, u * by, u * 0.45, 0, TAU); g.fill(); }
  g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = u * 0.5; g.beginPath(); g.moveTo(u * 1.4, u * 14.4); g.lineTo(u * 1.4, u * 4.5); g.lineTo(u * 14.6, u * 4.5); g.stroke();
  g.restore();
  if (glow) bloom(g, x + s / 2, y + s * 0.55, s * 0.9, 'rgba(255,170,60,0.35)');
}
/** Survivor bag glyph (7.12 loot): dark sack with a white edge glow. */
function bagGlyph(g, x, y, s) {
  g.save(); g.translate(x, y); const u = s / 16;
  g.save(); g.shadowColor = 'rgba(255,255,255,0.9)'; g.shadowBlur = 4 * u;
  g.beginPath(); g.moveTo(u * 5, u * 5.2); g.quadraticCurveTo(u * 8, u * 3.4, u * 11, u * 5.2); g.lineTo(u * 12.8, u * 13); g.quadraticCurveTo(u * 8, u * 15.4, u * 3.2, u * 13); g.closePath();
  const gr = g.createLinearGradient(u * 3, u * 4, u * 13, u * 15); gr.addColorStop(0, '#4a4f57'); gr.addColorStop(1, '#14161a'); g.fillStyle = gr; g.fill(); g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = u * 0.8; g.stroke();
  g.beginPath(); g.moveTo(u * 6, u * 4.6); g.quadraticCurveTo(u * 8, u * 2, u * 10, u * 4.6); g.stroke();
  g.restore();
}
function cloudX(g, x, y, s, col) {
  g.save(); g.translate(x, y); const u = s / 16; g.strokeStyle = col; g.lineWidth = u * 1.4; g.lineCap = 'round';
  g.beginPath(); g.moveTo(u * 4.5, u * 12); g.arc(u * 4.5, u * 9, u * 3, Math.PI * 0.5, Math.PI * 1.45); g.arc(u * 8.3, u * 6.5, u * 3.6, Math.PI * 1.1, Math.PI * 1.95); g.arc(u * 12, u * 9.2, u * 2.8, Math.PI * 1.5, Math.PI * 0.5); g.closePath(); g.stroke();
  g.beginPath(); g.moveTo(u * 2, u * 2.5); g.lineTo(u * 14, u * 14.5); g.stroke(); g.restore();
}
function spinner(g, x, y, r, t, col) {
  g.save(); g.lineCap = 'round'; g.lineWidth = r * 0.28;
  g.strokeStyle = 'rgba(255,255,255,0.14)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke();
  g.strokeStyle = col; g.beginPath(); g.arc(x, y, r, t * 5, t * 5 + 1.7); g.stroke(); g.restore();
}

// ---------- the real item drawings (drawSurvivor parts, Story 7.8), rendered with the material treatment ----------
const PART_BASE = { top: 'jacket', head: 'none', hair: 'bald', pack: 'none', skin: '1' };
function tileLook(slot, id) { const l = { [slot]: id }; if (slot === 'hair') l.head = 'none'; if (slot === 'skin') { l.head = 'none'; l.hair = 'bald'; } return l; }
function tileGeom(slot, s) {
  if (slot === 'pack') return { r: s * 0.36, cx: 0.5, cy: 0.3, ang: -Math.PI / 2 };
  if (slot === 'top') return { r: s * 0.34, cx: 0.5, cy: 0.58, ang: -Math.PI / 2 - 0.25 };
  return { r: s * 0.78, cx: 0.5, cy: 0.56, ang: -Math.PI / 2 - 0.2 };
}
function survivorAt(g, look, x, y, r, ang) { g.save(); g.translate(x, y); g.rotate(ang); G7.drawSurvivor(g, r, look, 1); g.restore(); }
/**
 * The item close-up on a transparent canvas (size s CSS px, 3× supersampled): soft cast shadow down-right, the part,
 * a cool key-light wash from the upper-left, a rim light on the lit edge, ambient occlusion on the far side.
 * mode 'lit' | 'sil' (dark silhouette, for the reveal's first beat).
 */
function itemArt(slot, id, s, mode = 'lit') {
  return cached(`item-${slot}-${id}-${s}-${mode}`, () => {
    const k = DPR * 2, t = tileGeom(slot, s);
    const [raw, gr] = mk(s, s, k); survivorAt(gr, tileLook(slot, id), s * t.cx, s * t.cy, t.r, t.ang);
    const [out, g] = mk(s, s, DPR);
    const sil = (col) => { const [c, gc] = mk(s, s, k); gc.drawImage(raw, 0, 0, s, s); gc.globalCompositeOperation = 'source-in'; gc.fillStyle = col; gc.fillRect(0, 0, s, s); return c; };
    const black = sil('#000');
    if (mode === 'sil') {
      g.drawImage(black, 0, 0, s, s);
      g.save(); g.globalCompositeOperation = 'source-atop'; const lg = g.createLinearGradient(0, 0, s, s); lg.addColorStop(0, '#2a3038'); lg.addColorStop(1, '#07090b'); g.fillStyle = lg; g.fillRect(0, 0, s, s); g.restore();
      return out;
    }
    g.save(); g.filter = `blur(${s * 0.05}px)`; g.globalAlpha = 0.7; g.drawImage(black, s * 0.05, s * 0.08, s, s); g.restore();
    g.drawImage(raw, 0, 0, s, s);
    // lighting, clipped to the item
    const [lit, gl] = mk(s, s, DPR);
    let lg = gl.createLinearGradient(0, 0, s * 0.9, s); lg.addColorStop(0, 'rgba(225,236,255,0.38)'); lg.addColorStop(0.45, 'rgba(255,255,255,0)'); lg.addColorStop(1, 'rgba(0,0,10,0.45)');
    gl.fillStyle = lg; gl.fillRect(0, 0, s, s);
    gl.globalCompositeOperation = 'destination-in'; gl.drawImage(raw, 0, 0, s, s);
    g.drawImage(lit, 0, 0);
    // rim light: the silhouette offset up-left, minus itself
    const [rim, grr] = mk(s, s, DPR);
    grr.drawImage(sil('#e6f0ff'), 0, 0, s, s); grr.globalCompositeOperation = 'destination-out'; grr.drawImage(black, s * 0.025, s * 0.03, s, s);
    grr.globalCompositeOperation = 'destination-in'; grr.drawImage(raw, 0, 0, s, s);
    g.save(); g.globalAlpha = 0.55; g.drawImage(rim, 0, 0); g.restore();
    // specular glint: a soft spot on the upper-left of the shape
    const [sp, gs] = mk(s, s, DPR); lg = gs.createRadialGradient(s * 0.38, s * 0.3, 0, s * 0.38, s * 0.3, s * 0.32); lg.addColorStop(0, 'rgba(255,255,255,0.35)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); gs.fillStyle = lg; gs.fillRect(0, 0, s, s); gs.globalCompositeOperation = 'destination-in'; gs.drawImage(raw, 0, 0, s, s);
    g.save(); g.globalCompositeOperation = 'lighter'; g.drawImage(sp, 0, 0); g.restore();
    return out;
  });
}

// ---------- images from the game (weapon icon) ----------
const IMG = {};
function loadImg(key, url) { return new Promise((res) => { const i = new Image(); i.onload = () => { IMG[key] = i; res(); }; i.onerror = () => res(); i.src = url; }); }

// ---------- the dawn backdrop (Story 6.11: DW1 warm sunrise on Extract, DW2 blue hour) ----------
/** The real Downtown bake (game code), lights off, graded to the dawn; sun low on the upper left (the key light). */
function dawn(w, h, look = 'dw1', { dim = 0.45, blur = 0 } = {}) {
  return cached(`dawn-${w}-${h}-${look}-${dim}-${blur}`, () => {
    const city = cached(`city-${w}-${h}`, () => G7.render({ stage: 5, ppm: 34 * DPR, x0: 15, y0: 11, w: w / 34, h: h / 34, power: 'off', noLight: true }));
    const [c, g] = mk(w, h);
    g.save(); if (blur) g.filter = `blur(${blur}px)`; g.drawImage(city, -blur * 2, -blur * 2, w + blur * 4, h + blur * 4); g.restore();
    // grade
    g.globalCompositeOperation = 'multiply';
    let gr = g.createLinearGradient(0, 0, w, h);
    if (look === 'dw1') { gr.addColorStop(0, '#ffd2a0'); gr.addColorStop(0.5, '#c88a72'); gr.addColorStop(1, '#4b3a52'); }
    else { gr.addColorStop(0, '#9fb8e8'); gr.addColorStop(0.5, '#56709e'); gr.addColorStop(1, '#1e2a48'); }
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'screen';
    gr = g.createRadialGradient(w * 0.12, -h * 0.15, 0, w * 0.12, -h * 0.15, w * 0.8);
    if (look === 'dw1') { gr.addColorStop(0, 'rgba(255,190,110,0.75)'); gr.addColorStop(0.35, 'rgba(255,120,60,0.25)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); }
    else { gr.addColorStop(0, 'rgba(150,190,255,0.45)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); }
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    // long morning haze
    gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, look === 'dw1' ? 'rgba(255,180,120,0.12)' : 'rgba(120,150,210,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = `rgba(4,6,10,${dim})`; g.fillRect(0, 0, w, h);
    gr = g.createRadialGradient(w * 0.45, h * 0.45, h * 0.2, w * 0.5, h * 0.5, w * 0.75); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    texture(g, TEX.grain, 0, 0, w, h, { op: 'overlay', a: 0.5, scale: 0.5 });
    return c;
  });
}
