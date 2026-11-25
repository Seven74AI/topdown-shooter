/* 8 · Story 7.10 survivor editor + locked milestone tile + loot silhouette tile. */
const HOWTO = { fire: 'Survive wave 5', riot: 'Extract from Downtown once', gas: 'Kill the Behemoth', hockey: 'Reach endless wave 15', band: 'Revive 25 teammates', camo: 'Kill 1,000 zombies', planks: 'Build 100 barricades', laurel: 'Extract with all 4 players standing', weld: 'Play 20 runs', golf: 'Reach wave 10 without going down' };
const OWNED_EXTRA = new Set(['head:riot', 'head:cone']); // example account: M2 earned, a traffic cone found
const owns = (p) => p.unlock === 'starter' || OWNED_EXTRA.has(p.slot + ':' + p.id);
const QUICK = ['#3c5670', '#2f6a5a', '#5d6b3a', '#7a3b6e', '#b8336a', '#c46a2a', '#e0b33a', '#d8d2c4', '#8a5a2b', '#231f1c', '#5a5f66', '#2f6fd0'];
const ED_TABS = [['top', 'Top'], ['head', 'Head'], ['hair', 'Hair'], ['pack', 'Pack'], ['skin', 'Skin']];
const ED_CSS = `
.ed{position:fixed;inset:0;display:grid;gap:8px;background:#121417;color:#fff;font:500 15px/1.3 system-ui,sans-serif;padding:6px calc(var(--sr) + 8px) calc(var(--sb) + 6px) calc(var(--sl) + 8px)}
.ed-tabs{display:flex;gap:3px}
.ed-tabs button{flex:1;min-height:44px;min-width:44px;padding:0 6px;border:0;border-radius:8px;background:#24272c;color:#bbb;font:700 14px system-ui}
.ed-tabs button[aria-pressed=true]{background:#e8e4da;color:#17191c}
.ed-tiles{display:grid;grid-template-columns:repeat(auto-fill,56px);gap:6px;align-content:start;overflow-y:auto;min-height:0;scrollbar-width:thin}
.ed-t{position:relative;width:56px;height:56px;padding:0;border:0;border-radius:8px;overflow:hidden;background:#2c3036;cursor:pointer}
.ed-t img{width:100%;height:100%;display:block}
.ed-t[aria-pressed=true]{box-shadow:0 0 0 3px #e8e4da}
.ed-t .lk{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:rgba(10,11,13,.75);display:flex;align-items:center;justify-content:center}
.ed-t .lkc{position:absolute;right:2px;bottom:2px;width:20px;height:20px;border-radius:50%;background:rgba(10,11,13,.8);display:flex;align-items:center;justify-content:center}
.ed-t .lkc svg{width:12px;height:12px}
.ed-t .q{position:absolute;right:4px;top:1px;font:800 15px system-ui;color:#9aa0a6}
.ed-t .gl{position:absolute;right:3px;top:3px;width:12px;height:12px;background:#fff;clip-path:polygon(50% 0,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0 50%,38% 38%);filter:drop-shadow(0 0 3px #fff)}
.ed-t--lk1{width:88px;height:auto;display:flex;flex-direction:column;background:transparent}
.ed-t--lk1 img{width:56px;height:56px;border-radius:8px;margin:0 auto;background:#2c3036}
.ed-t--lk1 small{font:500 14px/1.15 system-ui;color:#bbb;text-align:center;padding-top:2px}
.ed-info{min-height:20px;margin:0;font-size:14px;color:#c8ccd0;display:flex;align-items:center;gap:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ed-cols{display:flex;align-items:center;gap:5px;flex-wrap:nowrap;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;min-height:46px}
.ed-cols .lbl{font-size:14px;color:#bbb;white-space:nowrap}
.ed-sw{width:28px;height:28px;flex:none;border-radius:50%;border:2px solid rgba(255,255,255,.25);padding:0;position:relative}
.ed-sw::after{content:"";position:absolute;inset:-9px}
.ed-sw[aria-pressed=true]{border-color:#fff;box-shadow:0 0 0 2px #121417,0 0 0 4px #fff}
.ed-more{width:44px;height:44px;flex:none;border-radius:50%;border:0;background:conic-gradient(red,yellow,lime,cyan,blue,magenta,red);position:relative}
.ed-more input{position:absolute;inset:0;opacity:0;width:100%;height:100%}
.ed-pair{display:flex;align-items:center;gap:4px;font-size:14px;color:#bbb;white-space:nowrap}
.ed-pair i{width:22px;height:22px;border-radius:4px;display:inline-block;border:1px solid rgba(255,255,255,.3)}
.ed-big,.ed-small{display:block;width:100%;border-radius:10px;background:#1b1d20;touch-action:none}
.ed-big{cursor:grab}
.ed-acts{display:flex;gap:6px;justify-content:flex-end}
.ed-acts .k-btn{padding:0 14px}
.ed-cap{font-size:14px;color:#9aa0a6;margin:0}
.ed-col{display:flex;flex-direction:column;gap:6px;min-height:0;min-width:0}
.ed-stage{position:relative;min-height:0}
.ed-stage .ed-back{position:absolute;left:4px;top:4px;z-index:2}
.ed-stage .ed-sw2{position:absolute;right:6px;top:6px;z-index:2;font-size:14px;color:#bbb;background:rgba(0,0,0,.55);border-radius:6px;padding:3px 6px;display:flex;gap:4px;align-items:center}
.ed-stage .ed-sw2 i{width:16px;height:16px;border-radius:3px;display:inline-block;border:1px solid rgba(255,255,255,.4)}
`;
const ED_V = {
  ED1: {
    name: 'Preview left, tiles right', rec: true,
    desc: 'Left: the big turning preview (night colours, your chosen colour as a small swatch, drag to turn) over the game-size preview (35 px per metre, wet asphalt, your ring, 3 walkers, 2 teammates). Right: the five tabs, the part tiles, the colour row, then Random and Done.',
    css: `.ed{grid-template-columns:minmax(0,0.85fr) minmax(0,1.15fr)}.ed-col.l{grid-row:1}.ed-col.l .ed-stage{flex:1}.ed-col.l .ed-big{height:100%}.ed-small{height:88px;flex:none}`,
    html: () => `<div class="ed"><div class="ed-col l"><div class="ed-stage"><button class="k-btn k-btn--dark ed-back" data-act="back" aria-label="Back">${SVG.back}</button><span class="ed-sw2"></span><canvas class="ed-big"></canvas></div><canvas class="ed-small"></canvas></div><div class="ed-col"><div class="ed-tabs"></div><div class="ed-tiles"></div><p class="ed-info"></p><div class="ed-cols"></div><div class="ed-acts"><button class="k-btn k-btn--dark" data-act="random">${SVG.dice} Random</button><button class="k-btn k-btn--go" data-act="done">Done</button></div></div></div>`,
  },
  ED2: {
    name: 'Tabs rail, tiles centre, previews right',
    desc: 'A left rail of tall tabs (with Back on top), the tiles in the middle, both previews stacked on the right with Random and Done under them. The tiles get the most room; the big preview is smaller.',
    css: `.ed{grid-template-columns:96px minmax(0,1fr) 168px}.ed-rail{display:flex;flex-direction:column;gap:3px}.ed-rail .ed-tabs{flex-direction:column}.ed-rail .ed-tabs button{flex:none;text-align:left;padding:0 12px}.ed-col.r .ed-stage{flex:1}.ed-col.r .ed-big{height:100%}.ed-small{height:84px;flex:none}.ed-acts{justify-content:stretch}.ed-acts .k-btn{flex:1;padding:0 6px}`,
    html: () => `<div class="ed"><div class="ed-rail"><button class="k-btn k-btn--dark" data-act="back">${SVG.back} Back</button><div class="ed-tabs"></div></div><div class="ed-col"><div class="ed-tiles"></div><p class="ed-info"></p><div class="ed-cols"></div></div><div class="ed-col r"><div class="ed-stage"><span class="ed-sw2"></span><canvas class="ed-big"></canvas></div><canvas class="ed-small"></canvas><div class="ed-acts"><button class="k-btn k-btn--dark" data-act="random" aria-label="Random">${SVG.dice}</button><button class="k-btn k-btn--go" data-act="done">Done</button></div></div></div>`,
  },
  ED3: {
    name: 'Big stage, tiles in a strip',
    desc: 'The survivor fills the middle of the screen with the game-size view as an inset; the tiles run in one swipeable strip along the bottom and the colours sit at the top. The best look at your survivor, but only one row of tiles is visible.',
    css: `.ed{grid-template-columns:minmax(0,1fr) 150px;grid-template-rows:44px minmax(0,1fr) auto auto}.ed-tabs{grid-column:1/3}.ed-stage{grid-row:2;grid-column:1}.ed-stage .ed-big{height:100%}.ed-side{grid-row:2;grid-column:2;display:flex;flex-direction:column;gap:6px}.ed-small{height:84px;flex:none}.ed-side .ed-acts{margin-top:auto}.ed-side .ed-acts .k-btn{padding:0 10px}.ed-side .ed-cols .lbl{display:none}.ed-tiles{grid-column:1/3;grid-auto-flow:column;grid-auto-columns:56px;grid-template-columns:none;overflow-x:auto;overflow-y:hidden}.ed-cols{grid-column:1/3;display:none}.ed-info{grid-column:1/3}.ed-side .ed-cols{display:flex;flex-wrap:wrap;overflow:visible}.ed-side .ed-cols .ed-sw:nth-child(n+9){display:none}`,
    html: () => `<div class="ed"><div class="ed-tabs"></div><div class="ed-stage"><button class="k-btn k-btn--dark ed-back" data-act="back" aria-label="Back">${SVG.back}</button><span class="ed-sw2"></span><canvas class="ed-big"></canvas></div><div class="ed-side"><canvas class="ed-small"></canvas><div class="ed-cols"></div><div class="ed-acts"><button class="k-btn k-btn--dark" data-act="random" aria-label="Random">${SVG.dice}</button><button class="k-btn k-btn--go" data-act="done">Done</button></div></div><div class="ed-tiles"></div><p class="ed-info"></p></div>`,
  },
};
const LK_V = { LK1: 'Drawn, darkened, small lock in the corner, the "how to get it" line always under the tile (14 px)', LK2: 'Drawn, darkened, a lock in the middle; tapping shows the line in the info row under the grid' };
const LS_V = { LS1: 'A flat dark silhouette of the part only, "?" in the corner', LS2: 'The silhouette on a faint ghost of your survivor, with a small white glint (the loot bag\'s colour)' };
function tileHtml(p, sel, lk = 'LK2', ls = 'LS1', colours) {
  const key = `${p.slot}:${p.id}`;
  if (owns(p)) return `<button class="ed-t" data-k="${key}" aria-pressed="${sel}" aria-label="${p.name}"><img src="${tileUrl(p.slot, p.id, 56, 'own', colours)}" alt=""></button>`;
  if (p.unlock === 'loot') return ls === 'LS2' ? `<button class="ed-t" data-k="${key}" data-info="Found during waves" aria-label="Locked: found during waves"><img src="${tileUrl(p.slot, p.id, 56, 'ghost')}" alt=""><span class="gl"></span></button>` : `<button class="ed-t" data-k="${key}" data-info="Found during waves" aria-label="Locked: found during waves"><img src="${tileUrl(p.slot, p.id, 56, 'sil')}" alt=""><span class="q">?</span></button>`;
  const how = HOWTO[p.id] || 'Milestone';
  if (lk === 'LK1') return `<button class="ed-t ed-t--lk1" data-k="${key}" data-info="${how}" aria-label="Locked: ${how}"><img src="${tileUrl(p.slot, p.id, 56, 'locked', colours)}" alt=""><span class="lkc" style="right:18px;top:38px;bottom:auto">${SVG.lock}</span><small>${how}</small></button>`;
  return `<button class="ed-t" data-k="${key}" data-info="${how}" aria-label="Locked: ${how}"><img src="${tileUrl(p.slot, p.id, 56, 'locked', colours)}" alt=""><span class="lk">${SVG.lock}</span></button>`;
}
function edPaint(d, code, o = {}) {
  const st = { tab: o.tab || 'head', look: JSON.parse(JSON.stringify({ ...G7.DEFAULT_LOOK, ...LOOKS.ana, head: 'riot' })), turn: 0, drag: null };
  const lk = o.lk || 'LK2', ls = o.ls || 'LS1';
  const $ = (s) => d.querySelector(s);
  const big = $('.ed-big'), small = $('.ed-small');
  const sizeCanvas = (c) => { const r = c.getBoundingClientRect(); c.width = Math.max(10, Math.round(r.width * DPR)); c.height = Math.max(10, Math.round(r.height * DPR)); };
  sizeCanvas(big); sizeCanvas(small);
  const colourKey = () => (st.tab === 'top' ? 'top' : st.tab === 'hair' ? 'hair' : st.tab === 'skin' ? null : 'accent');
  function drawBig(t) {
    const g = big.getContext('2d'); const w = big.width / DPR, h = big.height / DPR;
    g.setTransform(DPR, 0, 0, DPR, 0, 0); asphalt(g, w, h, 5, '#202327');
    const sp = g.createRadialGradient(w / 2, h * 0.55, 0, w / 2, h * 0.55, Math.min(w, h) * 0.6); sp.addColorStop(0, 'rgba(255,240,215,0.16)'); sp.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = sp; g.fillRect(0, 0, w, h);
    const r = Math.min(w, h) * 0.24;
    ring(g, w / 2, h * 0.56, r, SLOT[1]);
    const ang = -Math.PI / 2 + (STATIC ? -0.55 : (t * TAU) / 6) + st.turn;
    survivorAt(g, st.look, w / 2, h * 0.56, r, ang);
  }
  const walkers = [[0.15, 0.3, 0.6, 3], [0.82, 0.25, 2.6, 7], [0.78, 0.8, 3.6, 12]];
  function drawSmall() {
    const g = small.getContext('2d'); const w = small.width / DPR, h = small.height / DPR;
    g.setTransform(DPR, 0, 0, DPR, 0, 0); asphalt(g, w, h, 9, '#17191c');
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, w, h);
    const R = 14;
    for (const [x, y, a, v] of walkers) { g.save(); g.translate(w * x, h * y); g.rotate(a); G7.drawZombie(g, 'walker', R * 1.05, v); g.restore(); }
    for (const [x, y, a, s] of [[0.34, 0.68, -0.3, 0], [0.62, 0.32, 2.4, 2]]) { ring(g, w * x, h * y, R, SLOT[s]); survivorAt(g, 'mo', w * x, h * y, R, a); }
    ring(g, w * 0.5, h * 0.58, R, SLOT[1]); survivorAt(g, st.look, w * 0.5, h * 0.58, R, -0.5);
  }
  const redraw = () => { drawBig(performance.now() / 1000); drawSmall(); const sw = $('.ed-sw2'); if (sw) { const k = colourKey() || 'top'; sw.innerHTML = `chosen <i style="background:${st.look.colours[k]}"></i> in game <i style="background:${G7.nightMute(st.look.colours[k])}"></i>`; } };
  function fillTabs() { $('.ed-tabs').innerHTML = ED_TABS.map(([k, n]) => `<button data-tab="${k}" aria-pressed="${st.tab === k}">${n}</button>`).join(''); for (const b of d.querySelectorAll('[data-tab]')) b.onclick = () => { st.tab = b.dataset.tab; fillTabs(); fillTiles(); fillCols(); redraw(); }; }
  function fillTiles() {
    const parts = PARTS.filter((p) => p.slot === st.tab);
    $('.ed-tiles').innerHTML = parts.map((p) => tileHtml(p, st.look[p.slot] === p.id, lk, ls, st.look.colours)).join('');
    for (const b of d.querySelectorAll('.ed-t')) b.onclick = () => {
      const [slot, id] = b.dataset.k.split(':');
      const info = $('.ed-info');
      if (b.dataset.info) { info.innerHTML = `${SVG.lock} ${b.dataset.info}`; return; }
      st.look[slot] = id; info.textContent = partOf(slot, id).name; fillTiles(); redraw();
    };
    const info = $('.ed-info'); const sel = partOf(st.tab, st.look[st.tab]); info.innerHTML = st.tab === 'head' ? `${SVG.lock} Gas mask: Kill the Behemoth` : sel ? sel.name : '';
  }
  function fillCols() {
    const k = colourKey(); const c = $('.ed-cols');
    if (!k) { c.innerHTML = '<span class="lbl">Skin: pick a tile</span>'; return; }
    const label = k === 'top' ? 'Top colour' : k === 'hair' ? 'Hair' : 'Hat & bag colour';
    c.innerHTML = `<span class="lbl">${label}</span><label class="ed-more" aria-label="More colours"><input type="color" value="${st.look.colours[k]}"></label>${QUICK.map((q) => `<button class="ed-sw" data-c="${q}" style="background:${q}" aria-pressed="${st.look.colours[k] === q}" aria-label="${q}"></button>`).join('')}`;
    const set = (v) => { st.look.colours = { ...st.look.colours, [k]: v }; fillCols(); fillTiles(); redraw(); };
    for (const b of c.querySelectorAll('.ed-sw')) b.onclick = () => set(b.dataset.c);
    c.querySelector('input').oninput = (e) => set(e.target.value);
  }
  const rb = d.querySelector('[data-act=random]');
  if (rb) rb.onclick = () => {
    for (const [slot] of ED_TABS) { const opts = PARTS.filter((p) => p.slot === slot && owns(p)); st.look[slot] = opts[Math.floor(Math.random() * opts.length)].id; }
    const rc = () => '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0');
    st.look.colours = { top: rc(), hair: rc(), accent: rc() }; fillTiles(); fillCols(); redraw();
  };
  big.onpointerdown = (e) => { st.drag = e.clientX; big.setPointerCapture(e.pointerId); };
  big.onpointermove = (e) => { if (st.drag != null) { st.turn += (e.clientX - st.drag) * 0.02; st.drag = e.clientX; } };
  big.onpointerup = () => { st.drag = null; };
  fillTabs(); fillTiles(); fillCols(); redraw();
  if (!STATIC) animate((t) => drawBig(t));
}
{
  const s = section('s-ed', '8 · Survivor editor', 'Story 7.10',
    'The third tab of the Progress hub. Tabs Top / Head / Hair / Pack / Skin (no Accent tab: "Hat & bag colour" sits under the Head and Pack tiles), part tiles drawn by the game\'s own 7.8 part code, a big preview turning once every 6 s (drag it), the game-size preview, 12 quick colours + the phone\'s own picker (the rainbow button), Random and Done. Example account: Ana, who earned the Riot helmet and found a Traffic cone; the other milestone and loot parts are locked. <b>Everything in these frames works</b>: tabs, tiles, colours, Random, drag.',
    '<b>Recommended: ED1 with LK2 and LS1.</b> ED1 keeps the big preview and the tiles side by side at 568 × 320 with two rows of tiles visible and Done always in the same corner. LK2 keeps tiles small and the grid even (the line shows when tapped), LS1 shows only the shape, so loot stays a surprise.');
  const grid = el('div', 'grid'); s.appendChild(grid);
  for (const code of Object.keys(ED_V)) {
    const v = ED_V[code];
    const fr = card(grid, code, v.name, v.desc, v.rec);
    fr.appendChild(phone({ w: 568, h: 320, label: `${code} · Head tab`, html: v.html(), css: ED_CSS + v.css, paint: (d) => edPaint(d, code) }));
    fr.appendChild(phone({ w: 800, h: 360, label: `${code} · Top tab`, html: v.html(), css: ED_CSS + v.css, paint: (d) => edPaint(d, code, { tab: 'top' }) }));
  }
  pickRow(s, 'Editor layout', Object.keys(ED_V));
  // locked milestone tile and loot silhouette tile
  const tg = el('div', 'grid two'); tg.style.marginTop = '18px'; s.appendChild(tg);
  const mk = (code, name, desc, rec, items, lk, ls) => {
    const fr = card(tg, code, name, desc, rec);
    const html = `<div class="ed" style="grid-template-columns:1fr"><div class="ed-col"><p class="ed-cap">Head tab, tiles at their real size (56 px):</p><div class="ed-tiles" style="grid-template-columns:repeat(auto-fill,${lk === 'LK1' ? 88 : 56}px)">${items.map((p) => tileHtml(p, p.id === 'riot', lk, ls)).join('')}</div><p class="ed-info">${lk ? `${SVG.lock} Kill the Behemoth` : `${SVG.lock} Found during waves`}</p></div></div>`;
    fr.appendChild(phone({ w: 568, h: 320, label: code, html, css: ED_CSS + '.ed{background:#121417}', paint: (d) => { for (const b of d.querySelectorAll('.ed-t')) b.onclick = () => { if (b.dataset.info) d.querySelector('.ed-info').innerHTML = `${SVG.lock} ${b.dataset.info}`; }; } }));
  };
  const heads = PARTS.filter((p) => p.slot === 'head');
  mk('LK1', 'Locked milestone: line under the tile', LK_V.LK1, false, heads.filter((p) => p.unlock.startsWith('milestone') || p.id === 'riot').slice(0, 6), 'LK1', 'LS1');
  mk('LK2', 'Locked milestone: lock in the middle', LK_V.LK2, true, heads.filter((p) => p.unlock !== 'loot'), 'LK2', 'LS1');
  pickRow(s, 'Locked milestone tile', Object.keys(LK_V));
  const tg2 = el('div', 'grid two'); tg2.style.marginTop = '18px'; s.appendChild(tg2);
  const loot = PARTS.filter((p) => p.unlock === 'loot');
  const mk2 = (code, name, desc, rec, ls) => {
    const fr = card(tg2, code, name, desc, rec);
    const html = `<div class="ed" style="grid-template-columns:1fr"><div class="ed-col"><p class="ed-cap">All ten surprise items as locked tiles (the Traffic cone is owned):</p><div class="ed-tiles">${loot.map((p) => tileHtml(p, false, 'LK2', ls)).join('')}</div><p class="ed-info">${SVG.lock} Found during waves</p></div></div>`;
    fr.appendChild(phone({ w: 568, h: 320, label: code, html, css: ED_CSS }));
  };
  mk2('LS1', 'Loot: flat silhouette', LS_V.LS1, true, 'LS1');
  mk2('LS2', 'Loot: ghost + white glint', LS_V.LS2, false, 'LS2');
  pickRow(s, 'Loot silhouette tile', Object.keys(LS_V));
}
