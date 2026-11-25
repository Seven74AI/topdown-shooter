/* Epic 7 looks — core: phone frames (iframes styled by the game's overlay.css), survivors, tiles, picks. */
'use strict';
const DPR = 2;
const STATIC = /[?&]static/.test(location.search);
const TAU = Math.PI * 2;
const SLOT = G7.SLOT; // blue, orange, green, purple
const MAIN = document.getElementById('main');

// ---------- small DOM helpers ----------
function el(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
function canvas(w, h, dpr = DPR) { const c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); const g = c.getContext('2d'); g.scale(dpr, dpr); return [c, g]; }
function hash(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }
function rnd(seed) { let s = seed >>> 0; return () => { s = (s + 0x6d2b79f5) >>> 0; return hash(s); }; }

// ---------- the survivors on this page (real drawSurvivor + Story 7.8 parts) ----------
const LOOKS = {
  mo: {},
  ana: { head: 'riot', top: 'camo', hair: 'tied', skin: '3', colours: { top: '#5d6b3a', hair: '#3a2a1c', accent: '#1f2326' } },
  kit: { head: 'cone', top: 'floral', hair: 'curly', skin: '6', pack: 'duffel', colours: { top: '#2c6f8f', hair: '#121010', accent: '#e0b33a' } },
  lu: { head: 'bunny', pack: 'teddy', top: 'hoodie', hair: 'tied', skin: '2', colours: { top: '#7a3b6e', hair: '#b5762e', accent: '#d8d2c4' } },
  jo: { head: 'beanie', top: 'puffer', pack: 'school', hair: 'short', skin: '5', colours: { top: '#c46a2a', hair: '#2b2421', accent: '#2f6fd0' } },
};
const TEAM = [
  { name: 'Mo', look: 'mo', kills: 212, earned: 1840, tr: [3, 2, 5, 0] },
  { name: 'Ana', look: 'ana', kills: 187, earned: 1620, tr: [5, 5, 5, 5] },
  { name: 'Kit', look: 'kit', kills: 140, earned: 1310, tr: [0, 0, 0, 0] },
  { name: 'Lu', look: 'lu', kills: 96, earned: 1185, tr: [1, 0, 2, 0] },
];
const lookOf = (k) => (typeof k === 'string' ? LOOKS[k] : k) || {};

function asphalt(g, w, h, seed = 7, tone = '#1b1d20') {
  g.fillStyle = tone; g.fillRect(0, 0, w, h);
  const r = rnd(seed);
  for (let i = 0; i < w * h / 18; i++) { const v = r(); g.fillStyle = v < 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.12)'; g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5); }
  const sh = g.createRadialGradient(w * 0.35, h * 0.3, 0, w * 0.35, h * 0.3, Math.max(w, h) * 0.8);
  sh.addColorStop(0, 'rgba(140,160,190,0.10)'); sh.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = sh; g.fillRect(0, 0, w, h);
}
function ring(g, x, y, r, col, a = 0.9) { g.save(); g.globalAlpha = a; g.strokeStyle = col; g.lineWidth = Math.max(1.5, r * 0.2); g.beginPath(); g.arc(x, y, r * 1.22, 0, TAU); g.stroke(); g.restore(); }
/** Survivor at (x, y), facing `ang` (0 = +x), body radius r px. */
function survivorAt(g, look, x, y, r, ang = -Math.PI / 2, stage = 1) { g.save(); g.translate(x, y); g.rotate(ang); G7.drawSurvivor(g, r, lookOf(look), stage); g.restore(); }

const urlCache = new Map();
/** A close-up portrait as a data URL (facing up-right, on asphalt, optional slot ring). */
function portrait(look, o = {}) {
  const { w = 48, h = 48, r = 15, ang = -Math.PI / 2 - 0.35, cx = 0.5, cy = 0.62, bg = 'asphalt', ringCol = null, stage = 1, round = 0 } = o;
  const key = JSON.stringify([look, w, h, r, ang, cx, cy, bg, ringCol, stage, round]);
  if (urlCache.has(key)) return urlCache.get(key);
  const [c, g] = canvas(w, h);
  if (round) { g.beginPath(); g.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, TAU); g.clip(); }
  if (bg === 'asphalt') asphalt(g, w, h, 11);
  else if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  if (ringCol) ring(g, w * cx, h * cy, r, ringCol);
  survivorAt(g, look, w * cx, h * cy, r, ang, stage);
  const u = c.toDataURL('image/png'); urlCache.set(key, u); return u;
}

// ---------- part tiles (Story 7.10: drawn from the 7.8 part functions, zoomed on the slot) ----------
const PARTS = G7.COSMETICS.parts;
const partOf = (slot, id) => PARTS.find((p) => p.slot === slot && p.id === id);
function tileLook(slot, id, colours) {
  const l = { [slot]: id }; if (colours) l.colours = colours;
  if (slot === 'hair') l.head = 'none';
  if (slot === 'skin') { l.head = 'none'; l.hair = 'bald'; }
  return l;
}
const TILE_BASE = { top: 'jacket', head: 'none', hair: 'bald', pack: 'none', skin: '1' };
function tileGeom(slot, s) {
  if (slot === 'pack') return { r: s * 0.36, cx: 0.5, cy: 0.3, ang: -Math.PI / 2 };
  if (slot === 'top') return { r: s * 0.34, cx: 0.5, cy: 0.58, ang: -Math.PI / 2 - 0.25 };
  return { r: s * 0.78, cx: 0.5, cy: 0.56, ang: -Math.PI / 2 - 0.2 };
}
function drawTile(g, slot, id, s, colours) {
  const t = tileGeom(slot, s);
  survivorAt(g, tileLook(slot, id, colours), s * t.cx, s * t.cy, t.r, t.ang);
}
/** mode: 'own' | 'locked' (dimmed, drawn) | 'sil' (dark silhouette of the part only) | 'ghost' (silhouette on a faint survivor) */
function tileBg(g, s) { const gr = g.createRadialGradient(s * 0.5, s * 0.45, 0, s * 0.5, s * 0.5, s * 0.75); gr.addColorStop(0, '#59606a'); gr.addColorStop(1, '#2c3036'); g.fillStyle = gr; g.fillRect(0, 0, s, s); }
function tileUrl(slot, id, s = 64, mode = 'own', colours = null, noBg = false) {
  const key = JSON.stringify(['t', slot, id, s, mode, colours, noBg]);
  if (urlCache.has(key)) return urlCache.get(key);
  const [c, g] = canvas(s, s);
  if (mode === 'own' || mode === 'locked') {
    if (!noBg) tileBg(g, s);
    drawTile(g, slot, id, s, colours);
    if (mode === 'locked') { g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(20,22,26,0.5)'; g.fillRect(0, 0, s, s); g.globalCompositeOperation = 'source-over'; }
  } else {
    // the part's own pixels: where the survivor with the part differs from the same survivor without it
    const [a, ga] = canvas(s, s); drawTile(ga, slot, id, s, colours);
    const [b, gb] = canvas(s, s); drawTile(gb, slot, slot === 'top' ? 'jacket' : TILE_BASE[slot], s, colours);
    const da = ga.getImageData(0, 0, a.width, a.height), db = gb.getImageData(0, 0, b.width, b.height);
    const [m, gm] = canvas(s, s, 1); m.width = a.width; m.height = a.height;
    const out = gm.createImageData(a.width, a.height);
    for (let i = 0; i < da.data.length; i += 4) {
      const d = Math.abs(da.data[i] - db.data[i]) + Math.abs(da.data[i + 1] - db.data[i + 1]) + Math.abs(da.data[i + 2] - db.data[i + 2]) + Math.abs(da.data[i + 3] - db.data[i + 3]);
      if (d > 24 && da.data[i + 3] > 40) { out.data[i] = 12; out.data[i + 1] = 13; out.data[i + 2] = 16; out.data[i + 3] = 255; }
    }
    gm.putImageData(out, 0, 0);
    if (!noBg) tileBg(g, s);
    if (mode === 'ghost') { g.globalAlpha = 0.22; g.drawImage(b, 0, 0, s, s); g.globalAlpha = 1; }
    // a 1 px light rim so the shape reads on the dark tile
    g.save(); g.filter = 'drop-shadow(0 0 0.7px rgba(190,198,210,0.7))'; g.drawImage(m, 0, 0, s, s); g.restore();
  }
  const u = c.toDataURL('image/png'); urlCache.set(key, u); return u;
}

// ---------- svg glyphs used inside frames (code-drawn) ----------
const SVG = {
  sup: '<svg class="k-sup" viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="4" width="13" height="10" rx="1" fill="#8a7a52" stroke="#1a1712" stroke-width="1.2"/><path d="M1.5 7.5h13M8 4v10" stroke="#1a1712" stroke-width="1.1"/><path d="M3 2.5h10l1.5 1.5h-13z" fill="#b9a878" stroke="#1a1712" stroke-width="1"/></svg>',
  lock: '<svg class="k-lock" viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 7V5.2a3.5 3.5 0 0 1 7 0V7" fill="none" stroke="#e8e4da" stroke-width="1.8"/><rect x="3" y="7" width="10" height="7.5" rx="1.4" fill="#e8e4da"/><circle cx="8" cy="10.4" r="1.2" fill="#17191c"/></svg>',
  bag: '<svg class="k-bag" viewBox="0 0 16 16" aria-hidden="true"><path d="M5 5.2 Q8 3.4 11 5.2 L12.6 13 Q8 15.2 3.4 13 Z" fill="#fff"/><path d="M6 4.6 Q8 2 10 4.6" fill="none" stroke="#fff" stroke-width="1.4"/></svg>',
  chev: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  back: '<svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16"><path d="M10.5 2.5 5 8l5.5 5.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  dice: '<svg viewBox="0 0 16 16" aria-hidden="true" width="18" height="18"><rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="5" cy="5" r="1.3" fill="currentColor"/><circle cx="11" cy="11" r="1.3" fill="currentColor"/><circle cx="8" cy="8" r="1.3" fill="currentColor"/><circle cx="11" cy="5" r="1.3" fill="currentColor"/><circle cx="5" cy="11" r="1.3" fill="currentColor"/></svg>',
  user: '<svg viewBox="0 0 16 16" aria-hidden="true" width="16" height="16"><circle cx="8" cy="5.5" r="3" fill="currentColor"/><path d="M2.5 14.5c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5z" fill="currentColor"/></svg>',
};

// ---------- the kit: proposal CSS shared by all frames (on top of the game's overlay.css) ----------
const KIT = `
html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#090a0c;-webkit-font-smoothing:antialiased}
body{background-size:cover;background-position:center}
*{box-sizing:border-box}
.k-sup{width:1.05em;height:1.05em;vertical-align:-0.15em;flex:none}
.k-lock{width:16px;height:16px;flex:none}
.k-bag{width:1em;height:1em;vertical-align:-0.12em}
.k-supn{color:#e3d3a0;font-weight:800;font-variant-numeric:tabular-nums}
.k-mute{color:#9aa0a6}
.k-hint{color:#c8ccd0;font-size:14px}
.k-tape{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:2px;background:repeating-linear-gradient(-45deg,#e9e6dc 0 8px,rgba(0,0,0,.14) 8px 11px),#e9e6dc;color:#17191c;font:800 12px/16px "Arial Narrow",system-ui,sans-serif;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap}
.k-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;min-width:44px;padding:0 14px;border:0;border-radius:8px;background:#e8e8e8;color:#111;font:700 15px/1 system-ui,sans-serif;white-space:nowrap;cursor:pointer}
.k-btn--dark{background:#333;color:#fff}
.k-btn--go{background:#34c759;color:#06210f}
.k-btn--confirm{background:#f5c542;color:#17191c}
.k-btn--ghost{background:transparent;color:#e8e4da;box-shadow:inset 0 0 0 2px #555}
.k-btn:disabled{opacity:.45}
.k-spin{width:18px;height:18px;border-radius:50%;border:3px solid rgba(0,0,0,.25);border-top-color:#17191c;animation:k-sp .8s linear infinite}
@keyframes k-sp{to{transform:rotate(360deg)}}
.k-pips{display:inline-flex;gap:3px}
.k-pips i{width:14px;height:8px;border-radius:2px;background:#3a3e44}
.k-pips i.on{background:#e3d3a0}
.k-dot{flex:none;width:14px;height:14px;border-radius:50%;border:2px solid #fff;display:inline-block;vertical-align:-2px}
.k-kb{position:absolute;left:0;right:0;bottom:0;background:#2b2d31;padding:6px 4px 4px;display:flex;flex-direction:column;gap:6px;z-index:20}
.k-kb div{display:flex;gap:5px;justify-content:center;flex:1}
.k-kb span{flex:1;max-width:52px;border-radius:5px;background:#5a5d63;color:#fff;font:400 15px/1 system-ui;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 0 #111}
.k-kb span.w{max-width:none;flex:5}
.k-kb span.d{background:#414449;max-width:80px;flex:1.6;font-size:12px}
.k-caret{display:inline-block;width:2px;height:18px;background:#4aa3ff;vertical-align:-3px;animation:k-bl 1s steps(1) infinite}
@keyframes k-bl{50%{opacity:0}}
.k-field{display:flex;flex-direction:column;gap:2px;text-align:left}
.k-field label{font-size:14px;color:#bbb}
.k-in{min-height:44px;padding:8px 12px;border:2px solid #777;border-radius:8px;background:#1a1a1a;color:#fff;font:600 17px/1.5 system-ui,sans-serif;white-space:nowrap;overflow:hidden}
.k-in.focus{border-color:#4aa3ff}
.k-err{color:#ff8a80;font-size:14px;margin:0}
`;
const INSETS = { 568: { top: 0, right: 44, bottom: 21, left: 44 } };
const insOf = (w) => INSETS[w] || { top: 0, right: 0, bottom: 0, left: 0 };
const cssCache = new Map();
function overlayFor(w) {
  if (!cssCache.has(w)) { const ins = insOf(w); cssCache.set(w, OVERLAY.replace(/env\(safe-area-inset-(top|right|bottom|left)(?:\s*,[^)]*)?\)/g, (m, s) => ins[s] + 'px')); }
  return cssCache.get(w);
}
function kitVars(w) { const i = insOf(w); return `:root{--sl:${i.left}px;--sr:${i.right}px;--sb:${i.bottom}px;--st:${i.top}px}`; }

// ---------- backgrounds: the real Downtown bake (game code), dimmed by the screen's own overlay ----------
const bgCache = new Map();
function cityBg(w, h, o = {}) {
  const { stage = 3, x0 = 14, y0 = 11, power = 'on', ppm = 35, noLight = false } = o;
  const key = JSON.stringify([w, h, stage, x0, y0, power, ppm, noLight]);
  if (bgCache.has(key)) return bgCache.get(key);
  const c = G7.render({ stage, ppm: ppm * DPR, x0, y0, w: w / ppm, h: h / ppm, power, noLight });
  const u = c.toDataURL('image/jpeg', 0.82); bgCache.set(key, u); return u;
}

// ---------- phone frames ----------
let pending = 0;
const frames = [];
function markReady() { if (pending === 0) document.body.dataset.ready = '1'; }
/**
 * A phone screen: an iframe at w × h CSS px, styled by the game's overlay.css (safe-area env() replaced by the
 * device's insets) + KIT + `css`. `paint(doc, win)` runs after load (draw canvases, wire taps).
 */
function phone({ w = 568, h = 320, html, css = '', bg = null, paint = null, label = '', note = '' }) {
  const wrap = el('div', 'ph');
  const box = el('div', 'ph-box');
  const inner = el('div', 'ph-in');
  const ifr = document.createElement('iframe');
  ifr.width = w; ifr.height = h; ifr.setAttribute('scrolling', 'no'); ifr.title = label || `${w} × ${h}`;
  const bodyStyle = bg ? ` style="background-image:url(${bg})"` : '';
  ifr.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><style>${overlayFor(w)}${KIT}${kitVars(w)}${css}</style></head><body${bodyStyle}>${html}</body></html>`;
  pending++;
  ifr.addEventListener('load', () => {
    try { if (paint) paint(ifr.contentDocument, ifr.contentWindow); } catch (e) { console.error(e); }
    pending--; markReady();
  }, { once: true });
  inner.appendChild(ifr);
  box.appendChild(inner);
  const ins = insOf(w);
  if (ins.left || ins.right || ins.bottom) {
    const ov = el('div', 'ph-ins');
    ov.innerHTML = `<i style="left:0;top:0;bottom:0;width:${ins.left / w * 100}%"></i><i style="right:0;top:0;bottom:0;width:${ins.right / w * 100}%"></i><i style="left:${ins.left / w * 100}%;right:${ins.right / w * 100}%;bottom:0;height:${ins.bottom / h * 100}%"></i>`;
    box.appendChild(ov);
  }
  wrap.appendChild(box);
  wrap.appendChild(el('div', 'ph-lbl', `<b>${label}</b><span>${w} × ${h}${note ? ' · ' + note : ''}</span>`));
  const f = { wrap, box, inner, w, h };
  frames.push(f);
  wrap.style.width = w + 'px';
  box.style.width = w + 'px'; box.style.height = h + 'px';
  return wrap;
}
function fitFrames() {
  for (const f of frames) {
    const avail = f.wrap.parentElement ? f.wrap.parentElement.clientWidth : f.w;
    const s = Math.min(1, avail / f.w);
    f.inner.style.transform = s < 1 ? `scale(${s})` : '';
    f.box.style.width = f.w * s + 'px'; f.box.style.height = f.h * s + 'px'; f.wrap.style.width = f.w * s + 'px';
  }
}
addEventListener('resize', fitFrames);

// ---------- animation (off with ?static) ----------
const anims = [];
function animate(fn) { anims.push(fn); }
function loop(t) { for (const fn of anims) fn(t / 1000); if (!STATIC) requestAnimationFrame(loop); }

// ---------- sections, cards, picks ----------
const PICKS = {};
let stored = {};
try { stored = JSON.parse(localStorage.getItem('epic7-looks-picks') || '{}'); } catch (e) { stored = {}; }
const sections = [];
function section(id, title, small, sub, rec) {
  const s = el('section'); s.id = id;
  s.appendChild(el('h2', null, `${title} <small>${small}</small>`));
  if (sub) s.appendChild(el('p', 'sub', sub));
  if (rec) s.appendChild(el('p', 'rec', rec));
  MAIN.appendChild(s);
  sections.push({ id, title });
  return s;
}
function card(parent, code, name, desc, isRec) {
  const c = el('div', 'card' + (isRec ? ' is-rec' : ''));
  c.dataset.code = code;
  c.appendChild(el('div', 'head', `<span class="code">${code}</span><h3>${name}</h3>${isRec ? '<span class="tag">recommended</span>' : ''}`));
  c.appendChild(el('p', 'desc', desc));
  const fr = el('div', 'frames'); c.appendChild(fr);
  parent.appendChild(c);
  return fr;
}
function pickRow(parent, item, codes) {
  const p = el('div', 'pick', `<span>Your pick for ${item}:</span>`);
  for (const code of codes) {
    const b = el('button', null, code); b.type = 'button';
    b.setAttribute('aria-pressed', stored[item] === code ? 'true' : 'false');
    b.onclick = () => { stored[item] = stored[item] === code ? undefined : code; for (const x of p.querySelectorAll('button')) x.setAttribute('aria-pressed', x.textContent === stored[item] ? 'true' : 'false'); savePicks(); };
    p.appendChild(b);
  }
  PICKS[item] = codes;
  parent.appendChild(p);
}
function savePicks() {
  try { localStorage.setItem('epic7-looks-picks', JSON.stringify(stored)); } catch (e) { /* private mode */ }
  const t = Object.keys(PICKS).filter((k) => stored[k]).map((k) => `${k}: ${stored[k]}`).join(' · ');
  document.getElementById('picked').textContent = t || 'No picks yet: tap a code under each item.';
}
document.getElementById('copy').onclick = () => {
  const t = Object.keys(PICKS).map((k) => `${k}: ${stored[k] || '(recommended)'}`).join('\n');
  try { navigator.clipboard.writeText(t); } catch (e) { /* ignore */ }
  document.getElementById('picked').textContent = 'Copied: ' + t.replace(/\n/g, ' · ');
};
document.getElementById('ins').onclick = (e) => { const on = document.body.classList.toggle('no-ins'); e.target.setAttribute('aria-pressed', on ? 'false' : 'true'); };

// ---------- shared screen bits ----------
const fmt = (n) => n.toLocaleString('en-US');
function sup(n, cls = '') { return `<span class="k-supn ${cls}">${SVG.sup} ${fmt(n)}</span>`; }
function kb(h = 150, kind = 'text') {
  const rows = kind === 'code' ? [['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'], ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'J'], ['K', 'M', 'N', 'P', 'Q', 'R', 'S', 'T', '⌫']] : [['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫']];
  return `<div class="k-kb" style="height:${h}px">${rows.map((r) => `<div>${r.map((k) => `<span${k.length > 1 && k !== '⌫' ? ' class="d"' : ''}>${k}</span>`).join('')}</div>`).join('')}<div><span class="d">123</span><span class="d">🌐</span><span class="w">space</span><span class="d">return</span></div></div>`;
}
