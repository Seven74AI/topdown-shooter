/* The proposal page: sections per direction, phone frames (canvas), the reveal loop, picks, capture hooks. */
const THEMES = [PC1, PC2, PC3];
const INFO = {
  PC1: { name: 'Day-break · warm', rec: true, diff: 'The sun breaks the horizon on the left: golden light floods the canopy, dust and fine scratches on the glass catch it, a soft flare drifts across. Dry, warm, triumphant: the extraction moment.' },
  PC2: { name: 'Rain + condensation', diff: 'An overcast, rain-washed dawn: beads on the canopy refract the low light, drops run down the glass, condensation creeps in from the frame. Cooler and moodier; the HUD glows warmer against it.' },
  PC3: { name: 'Blue hour · instrument lighting', diff: 'Before sunrise: deep blue sky with the last stars, the burning city glowing below, the panel lit by amber floodlights and its own instruments. Fits endless runs and "Lost in the city" (DW2).' },
};
const CHANGED = [
  'You can see and feel the cockpit: a canopy bow, corner pillars and a centre post cut across the view; the city is a perspective ground plane far below, burning, under a dawn sky with a horizon — and it banks, climbs and moves forward.',
  'A real instrument panel: painted metal with worn edges and Dzus fasteners, stencilled labels, a live attitude indicator (tilts with the bank), altimeter (climbing), torque gauge, blinking master-caution lamp, toggle switches.',
  'The team is on an MFD set into the panel: thick bezel with screws, rubber push buttons with legends, black glass with pixel grid and scanlines, sun glare.',
  'The rewards are projected on a tilted HUD combiner glass in a frame on mount arms: green coating reflections, amber projection with a double image (ghost), heading-tape ticks.',
  'The pilot\'s gloved hand on the collective and the out-of-focus helmet edge; a rotor-blade shadow sweeps across everything; slight vibration.',
  'Every element has material: Back to lobby and Save my progress are backlit rubber keys in screwed housings (legend wear, LED); Wear it is an illuminated push-button; Supplies is a 7-segment LED counter; Rookie ×2 is a stamped, riveted warning placard; items are relit with the photoreal relight renderer at 52–58 px inside rotating targeting reticles that lock on.',
];
const MAIN = document.getElementById('main');
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const frames = []; // { cv, g, T, L, state, mode, scroll, t0, visible, crop }
let motion = !STATIC;

function insetsOverlay(box, L) {
  const { w, h, ins } = L; if (!ins.l) return;
  const ov = el('div', 'ph-ins');
  ov.innerHTML = `<i style="left:0;top:0;bottom:0;width:${ins.l / w * 100}%"></i><i style="right:0;top:0;bottom:0;width:${ins.r / w * 100}%"></i><i style="left:${ins.l / w * 100}%;right:${ins.r / w * 100}%;bottom:0;height:${ins.b / h * 100}%"></i>`;
  box.appendChild(ov);
}
/** A phone frame (full screen) or a panel crop. mode: 'still' (idle motion) | 'reveal' (the timeline loops). */
function frame(parent, T, w, h, state, mode, label, note, crop = false, shot = null, zoom = 1) {
  const L = lay(T, w, h);
  const cw = crop ? L.right.w + 16 : w, ch = crop ? L.right.h + 16 : h;
  const wrap = el('div', 'ph' + (crop ? ' crop' : '')), box = el('div', 'ph-box');
  const fk = Math.min(4, DPR * zoom), [cv, g] = mk(cw, ch, fk); cv.style.aspectRatio = `${cw}/${ch}`;
  box.appendChild(cv); if (!crop) insetsOverlay(box, L);
  wrap.appendChild(box);
  const lbl = el('div', 'ph-lbl', `<b>${label}</b><span>${crop ? 'panel at 568 × 320' : `${w} × ${h}`}${note ? ' · ' + note : ''}</span>`);
  wrap.appendChild(lbl);
  wrap.style.width = `min(100%, ${cw * zoom}px)`; if (shot) wrap.dataset.shot = shot; box.style.width = '100%'; box.style.aspectRatio = `${cw}/${ch}`;
  parent.appendChild(wrap);
  const f = { k: fk, cv, g, T, L, state, mode, scroll: 0, t0: performance.now(), visible: true, crop, cw, ch, id: `${T.code}-${state}-${w}-${mode}${crop ? '-crop' : ''}` };
  frames.push(f);
  if (mode === 'reveal') {
    const b = el('button', 'replay', 'Replay'); b.type = 'button'; b.onclick = () => { f.t0 = performance.now(); if (!motion) draw(f, 0.001, true); };
    lbl.firstChild.after(b);
  }
  if (!crop && mode === 'still') wireScroll(f, box);
  return f;
}
function maxScroll(f) { const rows = cached(`rows-${f.L.w}-${f.L.itemS || 48}-${f.state}`, () => timeline(rowsFor(f.state, f.L))); return Math.max(0, rows.total - f.L.view.h); }
function wireScroll(f, box) {
  const toCss = (e) => { const r = box.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * f.L.w, y: (e.clientY - r.top) / r.height * f.L.h }; };
  const inPanel = (p) => p.x > f.L.right.x && p.x < f.L.right.x + f.L.right.w && p.y > f.L.right.y && p.y < f.L.right.y + f.L.right.h;
  box.addEventListener('wheel', (e) => { if (!inPanel(toCss(e))) return; e.preventDefault(); f.scroll = clamp(f.scroll + e.deltaY * 0.5, 0, maxScroll(f)); if (!motion) draw(f, 0, true); }, { passive: false });
  let drag = null;
  box.addEventListener('pointerdown', (e) => { if (!inPanel(toCss(e))) return; drag = { y: e.clientY, s: f.scroll, k: f.L.h / box.getBoundingClientRect().height }; box.setPointerCapture(e.pointerId); });
  box.addEventListener('pointermove', (e) => { if (!drag) return; f.scroll = clamp(drag.s - (e.clientY - drag.y) * drag.k, 0, maxScroll(f)); if (!motion) draw(f, 0, true); });
  box.addEventListener('pointerup', () => { drag = null; });
}
function draw(f, t, still) {
  const d0 = DPR; DPR = f.k;
  const g = f.g; g.save(); g.clearRect(0, 0, f.cw, f.ch);
  if (f.crop) g.translate(-(f.L.right.x - 8), -(f.L.right.y - 8));
  if (f.mode === 'reveal') renderScreen(g, f.T, f.L, f.state, still ? 99 : t, { reveal: !still });
  else renderScreen(g, f.T, f.L, f.state, 0, { scroll: f.scroll, idle: still ? undefined : t });
  g.restore();
  DPR = d0;
}
/** Static key frames of the reveal (shown always, so the sequence reads without motion). */
function keyframes(parent, T, state) {
  const row = el('div', 'strip'); parent.appendChild(row);
  const L = lay(T, 568, 320), s = 0.5;
  for (const [t, cap] of [[0.9, '0.9 s · ledger ticks'], [1.62, '1.6 s · Rookie ×2 stamp'], [2.95, '2.9 s · item lands (sweep, flash)'], [5.3, '5.3 s · auto-scrolled, lines in']]) {
    const kf = el('div', 'kf');
    const cw = L.right.w + 16, ch = L.right.h + 16;
    const [cv, g] = mk(cw * s * 1.15, ch * s * 1.15, DPR); cv.style.width = cw * s * 1.15 + 'px';
    g.scale(s * 1.15, s * 1.15); g.translate(-(L.right.x - 8), -(L.right.y - 8));
    renderScreen(g, T, L, state, t, { reveal: true });
    kf.appendChild(cv); kf.appendChild(el('span', null, cap)); row.appendChild(kf);
  }
}
/** The reusable kit, as specimens: buttons, tags, an item well, a ledger line. */
function kitStrip(parent, T) {
  const L = lay(T, 800, 360);
  const [cv, g] = mk(860, 92); cv.style.width = '860px';
  g.drawImage(T.bg(800, 360, 'full'), 0, 120 * DPR, 800 * DPR, 92 * DPR, 0, 0, 860, 92);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 860, 92);
  if (T.kitPaper) { g.fillStyle = T.kitPaper; g.fillRect(430, 6, 280, 80); }
  T.btn(g, 14, 24, 150, 44, 'Back to lobby', 'primary', 0, L);
  T.btn(g, 178, 24, 84, 44, 'Wear it', 'amber', 0.6, L);
  T.btn(g, 276, 24, 150, 44, 'Save my progress', 'steel', 0, L);
  T.tag(g, 442, 14, 'New item', 'amber', null, L);
  T.tag(g, 442, 38, 'Unlocked', 'white', null, L);
  T.tag(g, 442, 62, 'Mo found', 'slot', null, L, 0);
  const a = itemAnim(99, 0, true, true);
  T.well(g, 556, 22, 48, a, L); T.item(g, 'head', 'riot', 556, 22, 48, a, L); T.wellTop(g, 556, 22, 48, a, L);
  T.rookie(g, 846, 35, 1, { small: false });
  parent.appendChild(el('div', 'kit')).appendChild(cv);
}

const PICK = { v: null };
try { PICK.v = localStorage.getItem('epic7-cockpit-pick'); } catch (e) { /* private mode */ }
function setPick(v) { PICK.v = PICK.v === v ? null : v; try { localStorage.setItem('epic7-cockpit-pick', PICK.v || ''); } catch (e) { /* */ } for (const b of document.querySelectorAll('.pick button')) b.setAttribute('aria-pressed', b.dataset.v === PICK.v ? 'true' : 'false'); document.getElementById('picked').textContent = PICK.v ? `Your pick: ${PICK.v}` : 'No pick yet: tap PC1, PC2 or PC3 under a variant.'; }

function buildPage() {
  const toc = document.getElementById('toc');
  document.getElementById('rec').innerHTML = '<b>My favourite: PC1.</b> The sunrise is the reward: the warm light pours through the canopy onto worn paint, glass and the glove, the HUD reads crisply against it, and it matches the DW1 dawn players already see after an Extract. PC3 is the natural partner for endless runs / "Lost in the city" (DW2), so PC1 + PC3 can ship as one cockpit with two lights.';
  const ch = el('section'); ch.id = 's-changed'; MAIN.appendChild(ch);
  ch.appendChild(el('h2', null, 'What changed vs PR4'));
  ch.appendChild(el('ul', 'diff', CHANGED.map((c) => `<li>${c}</li>`).join('')));
  toc.appendChild(el('a', null, 'What changed')).href = '#s-changed';
  for (const T of THEMES) {
    const I = INFO[T.code];
    const s = el('section'); s.id = 's-' + T.code; s.dataset.code = T.code; MAIN.appendChild(s);
    s.appendChild(el('h2', null, `<span class="code">${T.code}</span>${I.name}${I.rec ? '<span class="tag">favourite</span>' : ''}`));
    s.appendChild(el('p', 'diff', I.diff));
    toc.appendChild(el('a', null, `${T.code} · ${I.name.split(' · ')[0]}`)).href = '#s-' + T.code;
    s.appendChild(el('h3', null, 'Hero frame (568 × 320 shown at 2×)'));
    let fr = s.appendChild(el('div', 'frames'));
    frame(fr, T, 568, 320, 'full', 'still', `${T.code} · Extract`, 'shown at 2× · scroll the panel', false, null, 2);
    s.appendChild(el('h3', null, 'Phone frames'));
    fr = s.appendChild(el('div', 'frames'));
    frame(fr, T, 568, 320, 'full', 'still', `${T.code} · 568 × 320`, 'scroll the panel', false, 'hero-1136x640');
    frame(fr, T, 800, 360, 'full', 'still', `${T.code} · 800 × 360`, 'scroll the panel', false, 'hero-1600x900');
    s.appendChild(el('h3', null, 'Item reveal — how a new item lands'));
    fr = s.appendChild(el('div', 'frames'));
    frame(fr, T, 568, 320, 'full', 'reveal', `${T.code} · reveal`, `${LOOP} s loop`, false, 'reveal');
    keyframes(s, T, 'full');
    s.appendChild(el('h3', null, 'Status states (rewards panel)'));
    fr = s.appendChild(el('div', 'frames'));
    for (const [k, n] of STATES) frame(fr, T, 568, 320, k, 'still', `${T.code} · ${n}`, '', true);
    const p = el('div', 'pick', '<span>Your pick for the cockpit:</span>');
    for (const T2 of THEMES) { const b = el('button', null, T2.code); b.type = 'button'; b.dataset.v = T2.code; b.onclick = () => setPick(T2.code); p.appendChild(b); }
    s.appendChild(p);
  }
  setPick(PICK.v || null); if (!PICK.v) setPick(null);
  document.getElementById('copy').onclick = () => { const t = `Run rewards cockpit: ${PICK.v || 'PC1 (favourite)'}`; try { navigator.clipboard.writeText(t); } catch (e) { /* */ } document.getElementById('picked').textContent = 'Copied: ' + t; };
  document.getElementById('ins').onclick = (e) => { const on = document.body.classList.toggle('no-ins'); e.target.setAttribute('aria-pressed', on ? 'false' : 'true'); };
  const mb = document.getElementById('motion'); mb.setAttribute('aria-pressed', motion ? 'true' : 'false');
  mb.onclick = () => { motion = !motion; mb.setAttribute('aria-pressed', motion ? 'true' : 'false'); if (motion) { for (const f of frames) f.t0 = performance.now(); requestAnimationFrame(loop); } else for (const f of frames) draw(f, 0, true); };
}

const io = new IntersectionObserver((es) => { for (const e of es) { const f = frames.find((x) => x.cv === e.target); if (f) f.visible = e.isIntersecting; } });
function loop(now) {
  if (!motion) return;
  for (const f of frames) if (f.visible) draw(f, f.mode === 'reveal' ? ((now - f.t0) / 1000) % LOOP : now / 1000, false);
  requestAnimationFrame(loop);
}

(async () => {
  await Promise.all([500, 600, 700].map((w) => document.fonts.load(`${w} 20px Oswald`)));
  await loadImg('gl', G7.weaponIconUrl('grenade_launcher'));
  buildPage();
  for (const f of frames) { draw(f, f.mode === 'reveal' ? 99 : 0, true); io.observe(f.cv); }
  document.body.dataset.ready = '1';
  if (motion) requestAnimationFrame(loop);
})();

/** Capture hooks (shots.cjs): stop the loop and draw one reveal frame at an exact time. */
window.PREMIUM = {
  stop() { motion = false; },
  revealAt(code, t) { const f = frames.find((x) => x.T.code === code && x.mode === 'reveal'); draw(f, t, false); return f.id; },
};
