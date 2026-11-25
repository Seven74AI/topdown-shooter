/* The proposal page: sections per direction, phone frames (canvas), the reveal loop, picks, capture hooks. */
const THEMES = [PR1, PR2, PR3, typeof PR4 !== 'undefined' && PR4, typeof PR5 !== 'undefined' && PR5, typeof PR6 !== 'undefined' && PR6].filter(Boolean);
const INFO = {
  PR1: { name: 'Tactical HUD · steel + amber', rec: true, diff: 'P1\'s language (the boss warning display you called "just perfect") recoloured to steel + amber and given material: smoked gunmetal-glass plates (brushed, scratched, bevelled), neon line frames with bloom, corner brackets, hazard stripes, the triangle field; items land like a boss signal in reverse: a tick ring lights clockwise with a white-hot head and sparks drift in, ending exactly on the landing flash; then a light sweep and a glow pulse; marching chevrons in the header.' },
  PR2: { name: 'Field case · machined metal', diff: 'Heavy, physical: brushed gunmetal plates with bevels, hex screws, engraved seams and chipped enamel; players on stamped steel dog tags with slot-colour enamel; Supplies on a brass plate with a mechanical odometer counter; each new item is revealed by an iris shutter opening in a machined well.' },
  PR3: { name: 'Cinematic glass · dawn light', diff: 'Light and depth: frosted glass panes over the blurred dawn (depth of field), light-catching edges and a drifting sheen, soft gold bloom on the numbers; items rise on a lit glass pedestal under a light shaft with a lens-flare streak and drifting motes.' },
  PR4: { name: 'Evac cockpit · MFD + HUD', round: 2, diff: 'Diegetic: you read the results inside the evac helicopter at dawn. The team is on the cockpit\'s multi-function display (bezel, push buttons, black glass, sun glare); the rewards are projected on the see-through HUD combiner, so the city keeps falling away and banking behind them. Supplies fill a segmented gauge; each item is locked on by a target-designator box and painted in by a scan line ("LOCK").' },
  PR5: { name: 'Case closed · evidence board', round: 2, diff: 'Tactile and analog under a desk lamp: a cork board with the team on a typed index card, Supplies inked by a numbering stamp on a manila tag, items as polaroids that develop in front of you and get pinned with a brass thumbtack, linked by twine; "EXTRACTED" lands as a rubber stamp.' },
  PR6: { name: 'After-action report · war-news broadcast', round: 2, diff: 'A fictional in-world news channel covers your extraction: a live drone feed of the dawn city (slow pan, scan lines, LIVE and channel bugs), glossy gold-and-steel lower-third bars that slide in, a scrolling ticker ("BEHEMOTH DOWN · DISTRICT 2 UNLOCKED"), and each new item shown as an "exclusive" picture-in-picture card that flips in with a glint.' },
};
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
function frame(parent, T, w, h, state, mode, label, note, crop = false) {
  const L = lay(T, w, h);
  const cw = crop ? L.right.w + 16 : w, ch = crop ? L.right.h + 16 : h;
  const wrap = el('div', 'ph' + (crop ? ' crop' : '')), box = el('div', 'ph-box');
  const [cv, g] = mk(cw, ch); cv.style.aspectRatio = `${cw}/${ch}`;
  box.appendChild(cv); if (!crop) insetsOverlay(box, L);
  wrap.appendChild(box);
  const lbl = el('div', 'ph-lbl', `<b>${label}</b><span>${crop ? 'panel at 568 × 320' : `${w} × ${h}`}${note ? ' · ' + note : ''}</span>`);
  wrap.appendChild(lbl);
  wrap.style.width = `min(100%, ${cw}px)`; box.style.width = '100%'; box.style.aspectRatio = `${cw}/${ch}`;
  parent.appendChild(wrap);
  const f = { cv, g, T, L, state, mode, scroll: 0, t0: performance.now(), visible: true, crop, cw, ch, id: `${T.code}-${state}-${w}-${mode}${crop ? '-crop' : ''}` };
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
  const g = f.g; g.save(); g.clearRect(0, 0, f.cw, f.ch);
  if (f.crop) g.translate(-(f.L.right.x - 8), -(f.L.right.y - 8));
  if (f.mode === 'reveal') renderScreen(g, f.T, f.L, f.state, still ? 99 : t, { reveal: !still });
  else renderScreen(g, f.T, f.L, f.state, 0, { scroll: f.scroll, idle: still ? undefined : t });
  g.restore();
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
try { PICK.v = localStorage.getItem('epic7-premium-pick'); } catch (e) { /* private mode */ }
function setPick(v) { PICK.v = PICK.v === v ? null : v; try { localStorage.setItem('epic7-premium-pick', PICK.v || ''); } catch (e) { /* */ } for (const b of document.querySelectorAll('.pick button')) b.setAttribute('aria-pressed', b.dataset.v === PICK.v ? 'true' : 'false'); document.getElementById('picked').textContent = PICK.v ? `Your pick: ${PICK.v}` : 'No pick yet: tap PR1, PR2 or PR3 under a direction.'; }

function buildPage() {
  const toc = document.getElementById('toc');
  document.getElementById('rec').innerHTML = '<b>Recommended: PR1.</b> It is P1 — the look you already approved — carried from the boss warning to the whole UI: the same frames, brackets, stripes and type, now on real material (gunmetal glass, bevels, scratches) with bloom and motion. It stays readable at 568 × 320 (thin lines, dark plates, high contrast), and it is the cheapest to run. From PR2 it could borrow the odometer counter; from PR3 the light sweep on items.';
  let round2 = false;
  for (const T of THEMES) {
    const I = INFO[T.code];
    if (I.round === 2 && !round2) { round2 = true; const h = el('section', null, '<h2 style="font-size:34px">Round 1b · three more, outside the box</h2><p class="diff">The designer asked for three bolder concepts. Same content and row order, same colour rule; the screen becomes something in the world. <b style="color:var(--amber)">My favourite: PR4</b> — the results live inside the evac helicopter, the city really falls away behind the HUD glass, and it keeps the amber HUD language of PR1 / P1, so the two can merge.</p>'); h.id = 's-round2'; MAIN.appendChild(h); toc.appendChild(el('a', null, 'Round 1b')).href = '#s-round2'; }
    const s = el('section'); s.id = 's-' + T.code; s.dataset.code = T.code; MAIN.appendChild(s);
    s.appendChild(el('h2', null, `<span class="code">${T.code}</span>${I.name}${I.rec ? '<span class="tag">recommended</span>' : ''}`));
    s.appendChild(el('p', 'diff', I.diff));
    toc.appendChild(el('a', null, `${T.code} · ${I.name.split(' · ')[0]}`)).href = '#s-' + T.code;
    s.appendChild(el('h3', null, 'Full Extract screen'));
    let fr = s.appendChild(el('div', 'frames'));
    frame(fr, T, 568, 320, 'full', 'still', `${T.code} · Extract (DW1 sunrise)`, 'scroll the panel');
    frame(fr, T, 800, 360, 'endless', 'still', `${T.code} · endless Extract (DW2 blue hour)`, 'scroll the panel');
    s.appendChild(el('h3', null, 'Item reveal — how a new item lands'));
    fr = s.appendChild(el('div', 'frames'));
    frame(fr, T, 568, 320, 'full', 'reveal', `${T.code} · reveal`, `${LOOP} s loop`);
    keyframes(s, T, 'full');
    s.appendChild(el('h3', null, 'Status states (rewards panel)'));
    fr = s.appendChild(el('div', 'frames'));
    for (const [k, n] of STATES) frame(fr, T, 568, 320, k, 'still', `${T.code} · ${n}`, '', true);
    s.appendChild(el('h3', null, 'Reusable pieces'));
    kitStrip(s, T);
    const p = el('div', 'pick', '<span>Your pick for the Run rewards design:</span>');
    for (const T2 of THEMES) { const b = el('button', null, T2.code); b.type = 'button'; b.dataset.v = T2.code; b.onclick = () => setPick(T2.code); p.appendChild(b); }
    s.appendChild(p);
  }
  setPick(PICK.v === null ? null : PICK.v); if (!PICK.v) setPick(null);
  const cmp = el('section'); cmp.id = 's-compare'; MAIN.appendChild(cmp);
  cmp.appendChild(el('h2', null, 'What differs'));
  cmp.appendChild(el('table', 'cmp', `<tr><th>Code</th><th>Direction</th><th>Counter</th><th>Item lands</th><th>Cost on a phone</th></tr>
    <tr><td>PR1</td><td>${INFO.PR1.name}</td><td>Digits flicker up, gold with bloom</td><td>Reticle box closes in, silhouette → lit, sweep, glow pulse, tag flickers in</td><td>Lowest: baked plates, lines + one sweep</td></tr>
    <tr><td>PR2</td><td>${INFO.PR2.name}</td><td>Mechanical odometer rolls</td><td>Iris shutter opens, glass glint, enamel edge lights up</td><td>Low: baked plates; iris = 6 polygons for 0.5 s</td></tr>
    <tr><td>PR3</td><td>${INFO.PR3.name}</td><td>Soft count with gold bloom</td><td>Light shaft, item rises on the pedestal, flare streak, motes</td><td>Medium: the blurred backdrop is baked once; additive glows each frame</td></tr>`));
  document.getElementById('copy').onclick = () => { const t = `Run rewards premium: ${PICK.v || 'PR1 (recommended)'}`; try { navigator.clipboard.writeText(t); } catch (e) { /* */ } document.getElementById('picked').textContent = 'Copied: ' + t; };
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
