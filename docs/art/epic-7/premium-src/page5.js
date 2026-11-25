/* Lumen-LF5 screens page: one sheet per screen (frames at real size, captured at 2×). Still images only. */
const MAIN = document.getElementById('main');
const el = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };
function insets(box, w, h) { if (w !== 568) return; const ov = el('div', 'ph-ins'); ov.innerHTML = `<i style="left:0;top:0;bottom:0;width:${44 / w * 100}%"></i><i style="right:0;top:0;bottom:0;width:${44 / w * 100}%"></i><i style="left:${44 / w * 100}%;right:${44 / w * 100}%;bottom:0;height:${21 / h * 100}%"></i>`; box.appendChild(ov); }
function frame(parent, w, h, fn, label, zoom = 1) {
  const wrap = el('div', 'ph'), box = el('div', 'ph-box'); const d0 = DPR; DPR = Math.min(4, DPR * zoom);
  const [cv, g] = mk(w, h); try { fn(g, w, h); } catch (e) { console.error(e); } DPR = d0;
  box.appendChild(cv); insets(box, w, h); wrap.appendChild(box); wrap.appendChild(el('div', 'ph-lbl', `<b>${label}</b><span>${w} × ${h}</span>`));
  wrap.style.width = `min(100%, ${w * zoom}px)`; box.style.width = '100%'; box.style.aspectRatio = `${w}/${h}`; cv.style.width = '100%'; parent.appendChild(wrap);
}
(async () => {
  await Promise.all([500, 600, 700].map((w) => document.fonts.load(`${w} 20px Oswald`)));
  const want = [['chainsaw', 'w'], ['gas_torch', 'w'], ['flamethrower', 'w'], ['grenade_launcher', 'w'], ['assault_rifle', 'w'], ['shotgun', 'w'], ['smg', 'w'], ['body_armor_2', 'g'], ['running_shoes', 'g'], ['medkit', 'c'], ['grenades', 'c'], ['spike_trap', 'b'], ['bear_trap', 'b'], ['floodlight', 'b']];
  await Promise.all(want.map(([id, k]) => { const u = k === 'w' ? G7.weaponIconUrl(id) : k === 'g' ? G7.gearIconUrl(id) : k === 'c' ? G7.consumableIconUrl(id) : G7.buildIconUrl(id); return u ? loadImg(`ic-${k}-${id}`, u) : null; }));
  await loadImg('gl', G7.weaponIconUrl('grenade_launcher'));
  const toc = document.getElementById('toc');
  for (const sc of SCREENS) {
    const s = el('section'); s.id = 's-' + sc.id; s.dataset.shot = sc.id; MAIN.appendChild(s);
    s.appendChild(el('h2', null, `<span class="code">${sc.code}</span>${sc.title}`));
    s.appendChild(el('p', 'diff', sc.note));
    toc.appendChild(el('a', null, sc.title)).href = '#s-' + sc.id;
    const fr = s.appendChild(el('div', 'frames'));
    for (const [w, h, fn, label, zoom] of sc.frames) frame(fr, w, h, fn, label, zoom || 1);
  }
  document.getElementById('ins').onclick = (e) => { const on = document.body.classList.toggle('no-ins'); e.target.setAttribute('aria-pressed', on ? 'false' : 'true'); };
  document.body.dataset.ready = '1';
})();
