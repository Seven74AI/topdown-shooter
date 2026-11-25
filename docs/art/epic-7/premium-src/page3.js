/* Premium round 2 (interface) page: PI1–PI3, component sheets at 2×, Results at 568 × 320 and 800 × 360, reveal, states. */
const THEMES = [PI1, PI2, PI3];
const INFO = {
  PI1: { name: 'Lumen', rec: true, ref: 'Destiny 2 + Halo Infinite: the calm, luminous post-game — thin precise frames, generous spacing, a single gold accent, rarity-coloured item cards with a header band and the item lit on a gradient.', premium: 'Restraint and precision: glass faces over bevelled steel frames, gold diamond inlays and end caps, light display numerals with gold fill, white-hot rarity edges; nothing loud, everything finished.' },
  PI2: { name: 'Field Ops', ref: 'The Division 2 + Call of Duty MW: the tactical debrief — matte charcoal plates, orange-amber signal colour, cut corners, segmented bars, dense micro-typography (serials, units, captions), grid and circuit traces.', premium: 'Information craft: every surface carries a quiet technical layer (grid, traces, rivets, serials), bars are segmented, brackets frame actions; it reads like equipment, not a web page.' },
  PI3: { name: 'Arena', ref: 'Apex Legends + Halo Infinite: the punchy reward screen — chunky skewed shapes, thick brushed-metal frames with bright bevels, italic gold numerals, bold rarity cards with strong glow.', premium: 'Weight and energy: machined frames with rivets and an accent stripe, 3D buttons with a lip that presses down, skewed metallic badges, the biggest and brightest item cards.' },
};
const MAIN = document.getElementById('main');
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
const frames = [];
let motion = !STATIC;
function insets(box, w, h) { if (w > 700) return; const ov = el('div', 'ph-ins'); ov.innerHTML = `<i style="left:0;top:0;bottom:0;width:${44 / w * 100}%"></i><i style="right:0;top:0;bottom:0;width:${44 / w * 100}%"></i><i style="left:${44 / w * 100}%;right:${44 / w * 100}%;bottom:0;height:${21 / h * 100}%"></i>`; box.appendChild(ov); }
function frame(parent, T, w, h, state, mode, label, o = {}) {
  const zoom = o.zoom || 1, crop = !!o.crop, k = Math.min(4, DPR * (o.res || zoom));
  const Lp = T.layoutPI(w, h), cw = crop ? Lp.right.w + 16 : w, ch = crop ? Lp.right.h + 12 : h;
  const wrap = el('div', 'ph' + (crop ? ' crop' : '')), box = el('div', 'ph-box');
  const [cv, g] = mk(cw, ch, k); box.appendChild(cv); if (!crop && mode !== 'sheet') insets(box, w, h);
  wrap.appendChild(box); const lbl = el('div', 'ph-lbl', `<b>${label}</b><span>${o.note || (crop ? 'panel at 568 × 320' : `${w} × ${h}`)}</span>`); wrap.appendChild(lbl);
  wrap.style.width = `min(100%, ${cw * zoom}px)`; box.style.width = '100%'; box.style.aspectRatio = `${cw}/${ch}`; if (o.shot) wrap.dataset.shot = o.shot;
  parent.appendChild(wrap);
  const f = { T, cv, g, k, w, h, cw, ch, state, mode, crop, Lp, scroll: 0, t0: performance.now(), visible: true };
  frames.push(f);
  if (mode === 'reveal') { const b = el('button', 'replay', 'Replay'); b.type = 'button'; b.onclick = () => { f.t0 = performance.now(); }; lbl.firstChild.after(b); }
  if (mode === 'still' && !crop) {
    const toCss = (e) => { const r = box.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * w, y: (e.clientY - r.top) / r.height * h }; };
    const inP = (p) => p.x > Lp.right.x && p.x < Lp.right.x + Lp.right.w;
    box.addEventListener('wheel', (e) => { if (!inP(toCss(e))) return; e.preventDefault(); f.scroll = Math.max(0, Math.min((f.max || 0), f.scroll + e.deltaY * 0.5)); if (!motion) draw(f, 0, true); }, { passive: false });
    let dr = null; box.addEventListener('pointerdown', (e) => { if (!inP(toCss(e))) return; dr = { y: e.clientY, s: f.scroll, k: h / box.getBoundingClientRect().height }; box.setPointerCapture(e.pointerId); });
    box.addEventListener('pointermove', (e) => { if (!dr) return; f.scroll = Math.max(0, Math.min(f.max || 0, dr.s - (e.clientY - dr.y) * dr.k)); if (!motion) draw(f, 0, true); });
    box.addEventListener('pointerup', () => { dr = null; });
  }
  return f;
}
function draw(f, t, still) {
  const d0 = DPR; DPR = f.k; const g = f.g; g.save(); g.clearRect(0, 0, f.cw, f.ch);
  if (f.mode === 'sheet') f.T.sheet(g, f.cw, f.ch, t, still);
  else { if (f.crop) g.translate(-(f.Lp.right.x - 8), -(f.Lp.right.y - 6)); const r = f.mode === 'reveal' ? f.T.render(g, f.w, f.h, f.state, still ? 99 : t, { reveal: !still }) : f.T.render(g, f.w, f.h, f.state, 0, { scroll: f.scroll, idle: still ? undefined : t }); f.max = r.max; }
  g.restore(); DPR = d0;
}
function keyframes(parent, T) {
  const row = el('div', 'strip'); parent.appendChild(row);
  const Lp = T.layoutPI(568, 320), s = 0.56, cw = Lp.right.w + 16, ch = Lp.right.h + 12;
  for (const [t, cap] of [[0.9, '0.9 s · bars fill, counter ticks'], [1.65, '1.6 s · Rookie ×2 stamps on'], [2.95, '2.9 s · first card lands (sweep, burst)'], [4.6, '4.6 s · all cards in']]) {
    const kf = el('div', 'kf'); const [cv, g] = mk(cw * s, ch * s, DPR); cv.style.width = cw * s + 'px';
    g.scale(s, s); g.translate(-(Lp.right.x - 8), -(Lp.right.y - 6)); T.render(g, 568, 320, 'full', t, { reveal: true });
    kf.appendChild(cv); kf.appendChild(el('span', null, cap)); row.appendChild(kf);
  }
}
const PICK = { v: null };
try { PICK.v = localStorage.getItem('epic7-pi-pick'); } catch (e) { /* */ }
function setPick(v) { PICK.v = v; try { localStorage.setItem('epic7-pi-pick', v || ''); } catch (e) { /* */ } for (const b of document.querySelectorAll('.pick button')) b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'); document.getElementById('picked').textContent = v ? `Your pick: ${v}` : 'No pick yet: tap PI1, PI2 or PI3.'; }
function buildPage() {
  const toc = document.getElementById('toc');
  document.getElementById('rec').innerHTML = '<b>My favourite: PI1 Lumen.</b> It is the most "finished" — the premium comes from construction and restraint (layered glass and steel, gold inlays, rarity cards with real loot renders) rather than decoration, so it scales to all nine Epic 7 screens without getting noisy, and its gold accent fits our amber = earned rule. PI2 is the strongest if you want the tactical Dead City tone; PI3 if you want the loudest reward moment.';
  for (const T of THEMES) {
    const I = INFO[T.code];
    const s = el('section'); s.id = 's-' + T.code; s.dataset.code = T.code; MAIN.appendChild(s);
    s.appendChild(el('h2', null, `<span class="code">${T.code}</span>${I.name}${I.rec ? '<span class="tag">favourite</span>' : ''}`));
    s.appendChild(el('p', 'diff', `<b>Reference:</b> ${I.ref}<br><b>What makes it premium:</b> ${I.premium}`));
    toc.appendChild(el('a', null, `${T.code} · ${I.name}`)).href = '#s-' + T.code;
    s.appendChild(el('h3', null, 'Component sheet (shown at 2×)'));
    let fr = s.appendChild(el('div', 'frames'));
    frame(fr, T, 612, 462, 'full', 'sheet', `${T.code} · components`, { zoom: 2, shot: 'components', note: 'panel · buttons × states · rows × states · cards · tags · badge · counter · bar · scroll · modal' });
    s.appendChild(el('h3', null, 'Results + Run rewards'));
    fr = s.appendChild(el('div', 'frames'));
    frame(fr, T, 568, 320, 'full', 'still', `${T.code} · Extract`, { shot: 'results-568', note: '568 × 320 · scroll the panel' });
    frame(fr, T, 800, 360, 'endless', 'still', `${T.code} · endless`, { shot: 'results-800', note: '800 × 360 · scroll the panel' });
    s.appendChild(el('h3', null, 'Reveal'));
    fr = s.appendChild(el('div', 'frames'));
    frame(fr, T, 568, 320, 'full', 'reveal', `${T.code} · reveal`, { shot: 'reveal', note: `568 × 320 · ${LOOP} s loop` });
    keyframes(s, T);
    s.appendChild(el('h3', null, 'Status states'));
    fr = s.appendChild(el('div', 'frames'));
    for (const [k2, n] of STATES) frame(fr, T, 568, 320, k2, 'still', `${T.code} · ${n}`, { crop: true });
    const p = el('div', 'pick', '<span>Your pick for the Epic 7 interface:</span>');
    for (const T2 of THEMES) { const b = el('button', null, T2.code); b.type = 'button'; b.dataset.v = T2.code; b.onclick = () => setPick(T2.code); p.appendChild(b); }
    s.appendChild(p);
  }
  setPick(PICK.v || null);
  document.getElementById('copy').onclick = () => { const t = `Epic 7 interface: ${PICK.v || 'PI1 (favourite)'}`; try { navigator.clipboard.writeText(t); } catch (e) { /* */ } document.getElementById('picked').textContent = 'Copied: ' + t; };
  document.getElementById('ins').onclick = (e) => { const on = document.body.classList.toggle('no-ins'); e.target.setAttribute('aria-pressed', on ? 'false' : 'true'); };
  const mb = document.getElementById('motion'); mb.setAttribute('aria-pressed', motion ? 'true' : 'false');
  mb.onclick = () => { motion = !motion; mb.setAttribute('aria-pressed', motion ? 'true' : 'false'); if (motion) { for (const f of frames) f.t0 = performance.now(); requestAnimationFrame(loop); } else for (const f of frames) draw(f, 0, true); };
}
const io = new IntersectionObserver((es) => { for (const e of es) { const f = frames.find((x) => x.cv === e.target); if (f) f.visible = e.isIntersecting; } });
function loop(now) { if (!motion) return; for (const f of frames) if (f.visible) draw(f, f.mode === 'reveal' ? ((now - f.t0) / 1000) % LOOP : now / 1000, false); requestAnimationFrame(loop); }
(async () => {
  await Promise.all([500, 600, 700].map((w) => document.fonts.load(`${w} 20px Oswald`)));
  await loadImg('gl', G7.weaponIconUrl('grenade_launcher'));
  buildPage();
  for (const f of frames) { draw(f, f.mode === 'reveal' ? 99 : 0, true); io.observe(f.cv); }
  document.body.dataset.ready = '1';
  if (motion) requestAnimationFrame(loop);
})();
window.PREMIUM = { stop() { motion = false; }, revealAt(code, t) { const f = frames.find((x) => x.T.code === code && x.mode === 'reveal'); draw(f, t, false); } };
