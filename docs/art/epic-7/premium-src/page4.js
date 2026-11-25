/* Premium round 2 (interface) page: PI1–PI3, component sheets at 2×, Results at 568 × 320 and 800 × 360, reveal, states. */
const THEMES = [LG0, LC1, LP2, LT3];
const INFO = {
  LG0: { name: 'Gold (reference)', mood: 'Warm, triumphant, "loot"-coded; glows like the sunrise on DW1, still rich on DW2.', tension: 'Gold sits close to amber (= an event you can use) and to the orange player slot; the slot colour only appears as a dot / bar, so it still reads.' },
  LC1: { name: 'Ice cyan', rec: true, mood: 'Cool, clean, high-tech; the strongest contrast against the warm DW1 dawn, calm and crisp on DW2 blue hour. New items glow ice-white-cyan.', tension: 'Cyan is near the blue player slot (#3d8bff): teammate cards keep the slot blue frame + dot + name, new items use a lighter, greener cyan, and the two never share a card. Supplies are no longer amber (rewards = cyan here).' },
  LP2: { name: 'Platinum', mood: 'Quiet luxury: white-silver light, champagne warmth on new items only; the most "high-end", least game-y.', tension: 'White = pick-ups and people: the chrome is silver, but white-ish everywhere lowers the pop of item names; new items get a warm champagne frame so they still stand out.' },
  LT3: { name: 'Teal + brass', mood: 'Crafted and characterful: brass frames, teal light, like a restored instrument; earthy on DW1, rich on DW2.', tension: 'Teal is between the green player slot and gas yellow-green; it stays blue-leaning (#3fd6c0) and never fills large areas, and new items are brass (not teal) so the reward reads warm.' },
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
try { PICK.v = localStorage.getItem('epic7-lumen-pick'); } catch (e) { /* */ }
function setPick(v) { PICK.v = v; try { localStorage.setItem('epic7-lumen-pick', v || ''); } catch (e) { /* */ } for (const b of document.querySelectorAll('.pick button')) b.setAttribute('aria-pressed', b.dataset.v === v ? 'true' : 'false'); document.getElementById('picked').textContent = v ? `Your pick: ${v}` : 'No pick yet: tap LG0, LC1, LP2 or LT3.'; }
function buildPage() {
  const toc = document.getElementById('toc');
  document.getElementById('rec').innerHTML = '<b>My favourite: LC1 Ice cyan.</b> It gives Lumen the cleanest, most premium read: cool light against the warm dawn makes every panel and item pop, it frees amber for "an event you can use" in gameplay, and new items glow like rare loot. LG0 stays the safe warm choice; LP2 is the most luxurious but the least loud; LT3 has the most character.';
  for (const T of THEMES) {
    const I = INFO[T.code];
    const s = el('section'); s.id = 's-' + T.code; s.dataset.code = T.code; MAIN.appendChild(s);
    s.appendChild(el('h2', null, `<span class="code">${T.code}</span>${I.name}${I.rec ? '<span class="tag">favourite</span>' : ''}`));
    s.appendChild(el('p', 'diff', `<b>Mood:</b> ${I.mood}<br><b>Colour-rule check:</b> ${I.tension}`));
    toc.appendChild(el('a', null, `${T.code} · ${I.name}`)).href = '#s-' + T.code;
    s.appendChild(el('h3', null, 'Component sheet (shown at 2×)'));
    let fr = s.appendChild(el('div', 'frames'));
    frame(fr, T, 612, 462, 'full', 'sheet', `${T.code} · components`, { zoom: 2, shot: 'components', note: 'panel · buttons × states · rows × states · cards · tags · badge · counter · bar · scroll · modal' });
    s.appendChild(el('h3', null, 'Results + Run rewards'));
    fr = s.appendChild(el('div', 'frames'));
    frame(fr, T, 568, 320, 'full', 'still', `${T.code} · Extract (DW1 dawn)`, { shot: 'results-568', note: '568 × 320 · scroll the panel' });
    frame(fr, T, 800, 360, 'endless', 'still', `${T.code} · endless (DW2 blue hour)`, { shot: 'results-800', note: '800 × 360 · scroll the panel' });
    s.appendChild(el('h3', null, 'Reveal'));
    fr = s.appendChild(el('div', 'frames'));
    frame(fr, T, 568, 320, 'full', 'reveal', `${T.code} · reveal`, { shot: 'reveal', note: `568 × 320 · ${LOOP} s loop` });
    keyframes(s, T);
    s.appendChild(el('h3', null, 'Status states'));
    fr = s.appendChild(el('div', 'frames'));
    for (const [k2, n] of STATES) frame(fr, T, 568, 320, k2, 'still', `${T.code} · ${n}`, { crop: true });
    const p = el('div', 'pick', '<span>Your pick for the Lumen colour theme:</span>');
    for (const T2 of THEMES) { const b = el('button', null, T2.code); b.type = 'button'; b.dataset.v = T2.code; b.onclick = () => setPick(T2.code); p.appendChild(b); }
    s.appendChild(p);
  }
  setPick(PICK.v || null);
  document.getElementById('copy').onclick = () => { const t = `Lumen colour theme: ${PICK.v || 'LC1 (favourite)'}`; try { navigator.clipboard.writeText(t); } catch (e) { /* */ } document.getElementById('picked').textContent = 'Copied: ' + t; };
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
