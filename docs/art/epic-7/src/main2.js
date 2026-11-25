/* 2 · Story 7.3 Progress hub + Unlocks tab (placeholder icons; 7.5 Training and 7.10 Survivor tabs) · 4 · 7.5 Training. */
const UNL = [
  ['Weapons', [
    ['pistol', 'Pistol', 'Your sidearm: never runs dry', 'starter', 'w'], ['machete', 'Machete', 'Quiet blade, no reloads', 'starter', 'w'], ['fire_axe', 'Fire Axe', 'Heavy swing that cleaves a crowd', 'starter', 'w'],
    ['shotgun', 'Shotgun', 'Wide spread up close', 'starter', 'w'], ['smg', 'SMG', 'Fast and light, short range', 'starter', 'w'], ['hunting_rifle', 'Hunting Rifle', 'One big shot, long range', 'starter', 'w'],
    ['assault_rifle', 'Assault Rifle', 'Fast-firing rifle, good at any range', 'bought', 'w'], ['chainsaw', 'Chainsaw', 'Close-range shredder for crowds', 300, 'w', 'confirm'],
    ['gas_torch', 'Gas torch', 'Short, wide cone of fire', 350, 'w'], ['flamethrower', 'Flamethrower', 'Long, narrow jet of burning fuel', 400, 'w'], ['grenade_launcher', 'Grenade Launcher', 'Lobs explosive rounds over cover', 500, 'w']]],
  ['Buildings', [
    ['wood_barricade', 'Wood barricade', 'Blocks the way, zombies go round', 'starter', 'b'], ['auto_turret', 'Auto-turret', 'Shoots the nearest zombie', 'starter', 'b'],
    ['spike_trap', 'Spike trap', 'Hurts every zombie that walks over it', 100, 'b', 'good'], ['bear_trap', 'Bear trap', 'Catches a zombie and holds it', 100, 'b'], ['mine', 'Mine', 'Blows up under the first zombie', 100, 'b'],
    ['floodlight', 'Floodlight', 'Lights the dark around it', 120, 'b'], ['barricade_upgrades', 'Barricade upgrades', 'Reinforced and metal barricades', 150, 'b'], ['med_station', 'Med station', 'Heals whoever stands at it', 300, 'b']]],
  ['Gear', [
    ['body_armor_1', 'Body armor I', 'More max HP', 'starter', 'g'], ['running_shoes', 'Running shoes', 'Move a bit faster', 'starter', 'g'], ['revive_kit', 'Revive kit', 'Revive teammates faster', 'starter', 'g'],
    ['tactical_flashlight', 'Tactical flashlight', 'A wider beam in the dark', 100, 'g'], ['body_armor_2', 'Body armor II', 'Even more max HP', 250, 'g']]],
  ['Consumables', [['medkit', 'Medkit', 'Heals you on the spot', 'starter', 'c'], ['grenades', 'Grenades', 'Thrown blast for a crowd', 'starter', 'c'], ['molotovs', 'Molotovs', 'A pool of fire where it lands', 150, 'c']]],
];
const SUPPLIES = 340;
// locked first (cheapest first), then what you have: the next thing to buy is at the top of each section
for (const [, rows] of UNL) rows.sort((a, b) => (typeof a[3] === 'number' ? a[3] : 1e4) - (typeof b[3] === 'number' ? b[3] : 1e4));
// Placeholder silhouettes (code-drawn) for the two items that have no icon art yet: the Pistol and the barricade upgrades.
function silUrl(id, w = 56, h = 32, col = '#5a616b') {
  const key = 'sil' + id + w + col; if (urlCache.has(key)) return urlCache.get(key);
  const [c, g] = canvas(w, h); g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,.5)'; g.lineWidth = 1;
  g.translate(w / 2, h / 2);
  if (id === 'pistol') { g.beginPath(); g.moveTo(-16, -8); g.lineTo(15, -8); g.lineTo(15, -1); g.lineTo(-3, -1); g.lineTo(-5, 3); g.lineTo(-7, 11); g.lineTo(-15, 11); g.lineTo(-12, -1); g.lineTo(-16, -2); g.closePath(); g.fill(); g.stroke(); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(-12, -6, 25, 2); }
  else { for (let i = 0; i < 3; i++) { g.fillRect(-18, -10 + i * 7, 26, 5); } g.fillStyle = '#7c838d'; g.fillRect(2, -12, 16, 24); g.fillStyle = col; for (const [x, y] of [[5, -9], [15, -9], [5, 9], [15, 9]]) { g.beginPath(); g.arc(x, y, 1.4, 0, TAU); g.fill(); } }
  const u = c.toDataURL(); urlCache.set(key, u); return u;
}
function iconUrl(id, kind) {
  if (kind === 'w') return G7.weaponIconUrl(id);
  if (kind === 'g') return G7.gearIconUrl(id);
  if (kind === 'c') return G7.consumableIconUrl(id);
  return G7.buildIconUrl(id);
}
const CAT_GLYPH = { w: 'WPN', b: 'BLD', g: 'GEAR', c: 'USE' };
function iconHtml(id, kind, ph) {
  const u = iconUrl(id, kind);
  if (u) return `<img class="pu-ic" src="${u}" alt="">`;
  if (ph === 'box') return `<span class="pu-ic pu-ph pu-ph--box">${CAT_GLYPH[kind]}</span>`;
  if (ph === 'stamp') return `<span class="pu-ic pu-ph pu-ph--stamp">${id === 'pistol' ? 'P' : 'BU'}</span>`;
  return `<img class="pu-ic pu-ph--sil" src="${silUrl(id)}" alt="">`;
}
function actionHtml(row) {
  const [id, , , price, , flag] = row;
  if (price === 'starter') return `<span class="pu-done">Unlocked <span class="k-tape pu-st">Starter</span></span>`;
  if (price === 'bought') return `<span class="pu-done">Unlocked</span>`;
  if (flag === 'confirm') return `<button class="k-btn k-btn--confirm pu-go" data-id="${id}" data-p="${price}" data-s="confirm">Confirm ${price}</button>`;
  if (price > SUPPLIES) return `<span class="pu-need">${sup(price)}<small>Not enough Supplies · need ${price - SUPPLIES} more</small></span>`;
  return `<button class="k-btn pu-go" data-id="${id}" data-p="${price}">${SVG.sup} ${price} · Unlock</button>`;
}
// ---------- 4 · Training (7.5) ----------
const BOOSTS = [
  ['max_hp', 'Max HP', 'More health for the whole run', 3, (l) => `+${2 * l} % max HP`],
  ['damage', 'Damage', 'Your weapons hit a little harder', 5, (l) => `+${l} % damage`],
  ['start_money', 'Start money', 'More cash in the first build phase', 0, (l) => `+$${10 * l} at the start`],
  ['reload', 'Reload', 'Reload a little faster', 1, (l) => `${l} % faster reload`, 'confirm'],
];
const TR_CSS = `
.tr-head{margin:6px 0;font-size:14px;color:#9aa0a6}
.tr-row{display:flex;align-items:center;gap:10px;min-height:52px;padding:3px 6px;border-bottom:1px solid rgba(255,255,255,.07)}
.tr-nm{width:118px;flex:none;font-weight:700}
.tr-nm small{display:block;font-size:14px;font-weight:500;color:#9aa0a6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tr-row .k-pips i{width:16px;height:10px}
.tr-now{flex:1;min-width:0;font-size:14px;line-height:1.3}
.tr-now b{display:block;font-size:15px}
.tr-now span{color:#9aa0a6;white-space:nowrap}
.tr-go{font-size:14px;padding:0 12px}
.tr-done{color:#e3d3a0;font-weight:800;font-size:14px;letter-spacing:.06em;text-transform:uppercase}
.tr2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.tr2 .tc2{background:#1e2125;border-radius:10px;padding:8px;display:flex;flex-direction:column;gap:4px}
.tr2 .seg5{display:flex;gap:3px}.tr2 .seg5 i{flex:1;height:12px;border-radius:2px;background:#3a3e44}.tr2 .seg5 i.on{background:#e3d3a0}
.tr2 .tc2 .k-btn,.tr2 .tc2 .tr-done{align-self:stretch;text-align:center}
.tr3 .lad{display:flex;gap:4px;flex:none}
.tr3 .lad > *{width:48px;min-height:44px;border-radius:6px;display:flex;flex-direction:column;align-items:center;justify-content:center;font:700 13px/1.1 system-ui;border:0}
.tr3 .lad .on{background:#e3d3a0;color:#17191c}
.tr3 .lad .nx{background:#e8e8e8;color:#111;font-size:12px}
.tr3 .lad .nx.k-btn--confirm{background:#f5c542}
.tr3 .lad .off{background:#2a2d32;color:#6b7078}
`;
function trainingHtml(code) {
  const head = '<p class="tr-head">Small boosts, capped. They always apply in full.</p>';
  const nowNext = (b) => { const L = b[3]; return L >= 5 ? `<b>Now: ${b[4](L)}</b><span>Maxed</span>` : `<b>Now: ${L ? b[4](L) : 'nothing yet'}</b><span>Next: ${b[4](L + 1)} · ${sup(50 * (L + 1))}</span>`; };
  const btn = (b) => b[3] >= 5 ? '<span class="tr-done">Maxed</span>' : b[5] === 'confirm' ? `<button class="k-btn k-btn--confirm tr-go" data-p="${50 * (b[3] + 1)}" data-s="confirm">Confirm ${50 * (b[3] + 1)}</button>` : `<button class="k-btn tr-go" data-p="${50 * (b[3] + 1)}">Train</button>`;
  const pips = (L) => `<span class="k-pips">${[0, 1, 2, 3, 4].map((j) => `<i class="${j < L ? 'on' : ''}"></i>`).join('')}</span>`;
  if (code === 'TR2') return head + `<div class="tr2">${BOOSTS.map((b) => `<div class="tc2"><b>${b[1]} <small class="k-mute">L${b[3]}/5</small></b><span class="seg5">${[0, 1, 2, 3, 4].map((j) => `<i class="${j < b[3] ? 'on' : ''}"></i>`).join('')}</span><div class="tr-now">${nowNext(b)}</div>${btn(b)}</div>`).join('')}</div>`;
  if (code === 'TR3') return head + `<div class="tr3">${BOOSTS.map((b) => `<div class="tr-row"><span class="tr-nm">${b[1]}<small>${b[4](b[3]) === b[4](0) ? 'nothing yet' : 'Now ' + b[4](b[3])}</small></span><span class="lad">${[1, 2, 3, 4, 5].map((l) => l <= b[3] ? `<span class="on">${l}</span>` : l === b[3] + 1 ? `<button class="nx tr-go${b[5] === 'confirm' ? ' k-btn--confirm' : ''}" data-p="${50 * l}"${b[5] === 'confirm' ? ' data-s="confirm"' : ''}>${b[5] === 'confirm' ? 'OK?' : 'Train'}<small>${50 * l}</small></button>` : `<span class="off">${50 * l}</span>`).join('')}</span></div>`).join('')}</div>`;
  return head + BOOSTS.map((b) => `<div class="tr-row"><span class="tr-nm">${b[1]}<small>${b[2]}</small></span>${pips(b[3])}<div class="tr-now">${nowNext(b)}</div>${btn(b)}</div>`).join('');
}
const HUB_CSS = `
.hub{position:fixed;inset:0;display:flex;flex-direction:column;background:rgba(8,9,11,.93);color:#fff;font:500 15px/1.3 system-ui,sans-serif;padding:6px calc(var(--sr) + 10px) calc(var(--sb) + 4px) calc(var(--sl) + 10px)}
.hub-h{display:flex;align-items:center;gap:8px;flex:none}
.hub-h h1{margin:0;font-size:20px}
.hub-sup{font-size:19px}.k-supn{white-space:nowrap}
@media (max-width:600px){.hub-h h1{font-size:18px}.hub-acc button{padding:0 5px}.hub-tag{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hub-tabs button{padding:0 14px}}
.hub-acc{margin-left:auto;display:flex;align-items:center;gap:2px;font-size:14px;color:#bbb}
.hub-acc button{min-height:44px;padding:0 8px;border:0;background:none;color:#8fc3ff;font:700 14px system-ui;text-decoration:underline;text-underline-offset:3px}
.hub-tag{margin:0;font-size:14px;color:#9aa0a6;flex:none}
.hub-tabs{display:flex;gap:4px;flex:none}
.hub-tabs button{min-height:44px;padding:0 16px;border:0;background:#24272c;color:#bbb;font:700 15px system-ui;border-radius:8px 8px 0 0}
.hub-tabs button[aria-pressed=true]{background:#3a3f46;color:#fff;box-shadow:inset 0 -3px 0 #e3d3a0}
.hub-body{flex:1;min-height:0;overflow-y:auto;scrollbar-width:thin}
.hub-sec{margin:8px 0 2px;font:700 14px system-ui;color:#bbb;text-transform:uppercase;letter-spacing:.08em}
.pu-row{display:flex;align-items:center;gap:10px;min-height:48px;padding:2px 6px;border-bottom:1px solid rgba(255,255,255,.07)}
.pu-ic{width:56px;height:32px;object-fit:contain;flex:none}
.pu-ph{display:flex;align-items:center;justify-content:center}
.pu-ph--box{border:2px dashed #5a616b;border-radius:4px;color:#8a919b;font:800 11px "Arial Narrow",system-ui;letter-spacing:.08em}
.pu-ph--stamp{background:#3a3f46;color:#c8ccd0;border-radius:3px;font:800 16px "Arial Narrow",system-ui;transform:rotate(-4deg);box-shadow:inset 0 0 0 2px #5a616b}
.pu-tx{flex:1;min-width:0}
.pu-nm{display:block;font-weight:700;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pu-ln{display:block;font-size:14px;color:#9aa0a6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pu-done{color:#9aa0a6;font-size:14px;font-weight:600;display:flex;gap:6px;align-items:center;white-space:nowrap}
.pu-st{font-size:11px}
.pu-good{background:#34c759;color:#06210f;font:800 11px/16px system-ui;padding:0 6px;border-radius:3px;margin-left:6px;vertical-align:1px;letter-spacing:.04em;text-transform:uppercase}
.pu-go{font-size:14px;padding:0 10px}
.pu-need{display:flex;flex-direction:column;align-items:flex-end;font-size:15px;opacity:.85}
.pu-need small{font-size:14px;color:#f5c542;white-space:nowrap}
.pu-off{color:#f5c542;font-size:14px}
.hub-pane[hidden]{display:none}
.hub-ed{display:flex;align-items:center;justify-content:center;height:100%;color:#9aa0a6;font-size:15px;text-align:center;padding:10px}
`;
function unlockList(ph, opts = {}) {
  const only = opts.only;
  return UNL.filter(([cat]) => !only || cat === only).map(([cat, rows]) => `${only ? '' : `<h3 class="hub-sec">${cat}</h3>`}${rows.map((r) => `<div class="pu-row">${iconHtml(r[0], r[4], ph)}<span class="pu-tx"><span class="pu-nm">${r[1]}${r[5] === 'good' ? '<span class="pu-good">Good next pick</span>' : ''}</span><span class="pu-ln">${r[2]}</span></span>${actionHtml(r)}</div>`).join('')}`).join('');
}
/** Wires tabs, Unlock → Confirm (3 s) → spinner → Unlocked, and Train the same way. */
function hubPaint(d) {
  let s = SUPPLIES;
  const supEls = () => d.querySelectorAll('.hub-supn');
  for (const b of d.querySelectorAll('[data-tab]')) b.onclick = () => { for (const x of d.querySelectorAll('[data-tab]')) x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); for (const p of d.querySelectorAll('.hub-pane')) p.hidden = p.dataset.pane !== b.dataset.tab; };
  for (const b of d.querySelectorAll('.pu-go, .tr-go')) {
    const label = b.innerHTML; let timer = 0;
    b.onclick = () => {
      const p = +b.dataset.p;
      if (b.dataset.s !== 'confirm') { b.dataset.s = 'confirm'; b.classList.add('k-btn--confirm'); b.textContent = `Confirm ${p}`; timer = setTimeout(() => { b.dataset.s = ''; b.classList.remove('k-btn--confirm'); b.innerHTML = label; }, 3000); return; }
      clearTimeout(timer); b.disabled = true; b.innerHTML = '<span class="k-spin"></span>';
      setTimeout(() => { s -= p; for (const e of supEls()) e.innerHTML = `${SVG.sup} ${fmt(s)}`; const done = el('span', b.classList.contains('tr-go') ? 'tr-done' : 'pu-done', b.classList.contains('tr-go') ? 'Trained' : 'Unlocked'); b.replaceWith(done); }, 900);
    };
  }
}
const accRow = `<span class="hub-acc">Guest ·<button type="button">Save my progress</button><button type="button">Log in</button></span>`;
const PH_V = {
  PH1: {
    name: 'Tabs on top, one long list', rec: true,
    desc: 'Header (Back, Supplies, account row), the tab bar built for 3 (Unlocks · Training · Survivor), then the four sections as one scrolling list: icon, name, one plain line, Unlock or "Unlocked" (locked items first in each section, cheapest first). Placeholder icons: a grey silhouette of the item.',
    ph: 'sil',
    html: () => `<div class="hub"><div class="hub-h"><button class="k-btn k-btn--dark" type="button" aria-label="Back">${SVG.back}</button><h1>Progress</h1><span class="k-supn hub-sup hub-supn">${SVG.sup} ${SUPPLIES}</span>${accRow}</div><p class="hub-tag">Unlocks add cards to your shop, not power · District 2: extract from Downtown to unlock</p><div class="hub-tabs"><button data-tab="u" aria-pressed="true">Unlocks</button><button data-tab="t" aria-pressed="false">Training</button><button data-tab="s" aria-pressed="false">Survivor</button></div><div class="hub-body"><div class="hub-pane" data-pane="u">${unlockList('sil')}</div><div class="hub-pane" data-pane="t" hidden>${trainingHtml('TR1')}</div><div class="hub-pane" data-pane="s" hidden><div class="hub-ed">The survivor editor (Story 7.10) opens in this tab: see item 8.</div></div></div></div>`,
    css: '',
  },
  PH2: {
    name: 'Side rail, cards grid',
    desc: 'A left rail holds Back, the Supplies total, the three tabs (tall) and the account; the right shows the items as cream tag cards (the 5.13 shop card style) in a grid, price on the tape. More items on screen, but the plain line is cut to the name only at 568 × 320. Placeholder icons: dashed box with the category.',
    ph: 'box',
    css: `.hub{flex-direction:row;gap:10px}.rail{width:132px;flex:none;display:flex;flex-direction:column;gap:6px}.rail .hub-sup{font-size:22px;margin:2px 0}.rail [data-tab]{min-height:44px;border:0;border-radius:8px;background:#24272c;color:#bbb;font:700 15px system-ui;text-align:left;padding:0 12px}.rail [data-tab][aria-pressed=true]{background:#e3d3a0;color:#17191c}.rail .acc2{margin-top:auto;font-size:14px;color:#bbb}.rail .acc2 button{min-height:44px;width:100%;border:0;border-radius:8px;background:#333;color:#fff;font:700 14px system-ui;margin-top:4px}.main2{flex:1;min-width:0;display:flex;flex-direction:column}.grid2{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px;padding-bottom:6px}.tc{position:relative;display:flex;flex-direction:column;align-items:center;gap:2px;min-height:96px;padding:0 6px 6px;background:radial-gradient(rgba(90,70,40,.1) 1px,transparent 1.4px) 0 0/9px 9px,#ece3c8;color:#17191c;border-radius:3px;clip-path:polygon(0 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%);text-align:center}.tc .k-tape{align-self:stretch;margin:0 -6px 4px;justify-content:center}.tc .pu-ic{height:28px}.tc b{font-size:14px;line-height:1.1}.tc .pu-go{min-height:44px;width:100%;margin-top:auto;background:#17191c;color:#ece3c8}.tc.own{filter:grayscale(.7) brightness(.75)}.tc .need{font-size:14px;color:#8a2a20;font-weight:700;margin-top:auto}.tc .gn{position:absolute;right:4px;top:18px;background:#34c759;color:#06210f;font:800 11px system-ui;padding:0 4px;border-radius:3px}`,
    html: () => `<div class="hub"><div class="rail"><button class="k-btn k-btn--dark" type="button">${SVG.back} Back</button><span class="k-supn hub-sup hub-supn">${SVG.sup} ${SUPPLIES}</span><button data-tab="u" aria-pressed="true">Unlocks</button><button data-tab="t" aria-pressed="false">Training</button><button data-tab="s" aria-pressed="false">Survivor</button><div class="acc2">Guest<button>Save my progress</button></div></div><div class="main2"><p class="hub-tag">Unlocks add cards to your shop, not power</p><div class="hub-body"><div class="hub-pane" data-pane="u">${UNL.map(([cat, rows]) => `<h3 class="hub-sec">${cat}</h3><div class="grid2">${rows.map((r) => { const own = typeof r[3] !== 'number'; return `<div class="tc${own ? ' own' : ''}"><span class="k-tape">${own ? (r[3] === 'starter' ? 'Starter' : 'Unlocked') : `${r[3]} Supplies`}</span>${r[5] === 'good' ? '<span class="gn">GOOD PICK</span>' : ''}${iconHtml(r[0], r[4], 'box')}<b>${r[1]}</b>${own ? '' : r[3] > SUPPLIES ? `<span class="need">need ${r[3] - SUPPLIES} more</span>` : `<button class="k-btn pu-go" data-p="${r[3]}">Unlock</button>`}</div>`; }).join('')}</div>`).join('')}</div><div class="hub-pane" data-pane="t" hidden>${trainingHtml('TR2')}</div><div class="hub-pane" data-pane="s" hidden><div class="hub-ed">Survivor editor (item 8)</div></div></div></div></div>`,
  },
  PH3: {
    name: 'Category chips, short list',
    desc: 'Tabs sit in the header line; under it four category chips (Weapons 7/11 · Buildings 2/8 · Gear 3/5 · Consumables 2/3) show one category at a time, so a category mostly fits without scrolling. One more tap to see everything. Placeholder icons: a grey letter stamp.',
    ph: 'stamp',
    css: `.hub-h .hub-tabs{margin-left:8px}.hub-h .hub-tabs button{border-radius:8px;padding:0 12px}.chips{display:flex;gap:6px;flex:none;margin:4px 0}.chips button{min-height:44px;padding:0 12px;border:0;border-radius:22px;background:#24272c;color:#ccc;font:700 14px system-ui}.chips button[aria-pressed=true]{background:#e3d3a0;color:#17191c}.chips small{font-weight:500;opacity:.75;margin-left:4px}`,
    html: () => `<div class="hub"><div class="hub-h"><button class="k-btn k-btn--dark" type="button" aria-label="Back">${SVG.back}</button><span class="k-supn hub-sup hub-supn">${SVG.sup} ${SUPPLIES}</span><div class="hub-tabs"><button data-tab="u" aria-pressed="true">Unlocks</button><button data-tab="t" aria-pressed="false">Training</button><button data-tab="s" aria-pressed="false">Survivor</button></div><span class="hub-acc"><button type="button">${SVG.user} Guest</button></span></div><div class="hub-body"><div class="hub-pane" data-pane="u"><div class="chips">${UNL.map(([cat, rows], i) => `<button aria-pressed="${i === 0}" data-cat="${cat}">${cat}<small>${rows.filter((r) => typeof r[3] !== 'number').length}/${rows.length}</small></button>`).join('')}</div>${UNL.map(([cat], i) => `<div class="cat" data-c="${cat}"${i ? ' hidden' : ''}>${unlockList('stamp', { only: cat })}</div>`).join('')}<p class="hub-tag">Unlocks add cards to your shop, not power</p></div><div class="hub-pane" data-pane="t" hidden>${trainingHtml('TR3')}</div><div class="hub-pane" data-pane="s" hidden><div class="hub-ed">Survivor editor (item 8)</div></div></div></div>`,
    paint: (d) => { for (const b of d.querySelectorAll('[data-cat]')) b.onclick = () => { for (const x of d.querySelectorAll('[data-cat]')) x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); for (const c of d.querySelectorAll('.cat')) c.hidden = c.dataset.c !== b.dataset.cat; }; },
  },
};
{
  const s = section('s-ph', '2 · Progress hub + Unlocks tab', 'Story 7.3 (tabs for 7.5 and 7.10)',
    'Opened by a <b>Progress</b> button on the start screen and in the lobby. Header: Supplies total and "Unlocks add cards to your shop, not power", plus 7.6\'s account row and 7.7\'s District 2 line. Example account: 340 Supplies, the Assault Rifle bought; one Unlock is already in its "Confirm 300" state (3 s), the Gas torch shows "need 10 more", the Spike trap is the Good next pick. <b>Tap Unlock twice</b> in a frame to see Confirm → spinner → Unlocked; the tabs work too. Two items have no icon art yet (the Pistol, the barricade upgrades): each variant shows one placeholder style.',
    '<b>Recommended: PH1.</b> The plainest to read: every item\'s one-line explanation stays visible, the tab bar has room for Training and Survivor, and the grey silhouette placeholder reads as "an item" without pretending to be final art.');
  const grid = el('div', 'grid'); s.appendChild(grid);
  for (const code of Object.keys(PH_V)) {
    const v = PH_V[code];
    const fr = card(grid, code, v.name, v.desc, v.rec);
    const paint = (d) => { hubPaint(d); if (v.paint) v.paint(d); };
    fr.appendChild(phone({ w: 568, h: 320, label: code, html: v.html(), css: HUB_CSS + TR_CSS + v.css, paint }));
    fr.appendChild(phone({ w: 800, h: 360, label: code, html: v.html(), css: HUB_CSS + TR_CSS + v.css, paint }));
  }
  const spec = el('div', 'card'); spec.innerHTML = '<div class="head"><span class="code">icons</span><h3>Placeholder icons side by side</h3></div><p class="desc">For the Pistol and the barricade upgrades (no icon art yet), next to a real icon (Spike trap) for scale.</p>';
  const row = el('div', 'specimen');
  for (const [k, n] of [['sil', 'PH1 silhouette'], ['box', 'PH2 dashed box'], ['stamp', 'PH3 stamp']]) {
    const sp = el('div', 'spec', `<h4>${n}</h4><div style="display:flex;gap:14px;align-items:center;background:#15171a;padding:10px;border-radius:6px">${['pistol', 'barricade_upgrades'].map((id) => iconHtml(id, id === 'pistol' ? 'w' : 'b', k)).join('')}<img class="pu-ic" src="${G7.buildIconUrl('spike_trap')}" alt=""></div>`);
    row.appendChild(sp);
  }
  const st = el('style', null, '.spec .pu-ic{width:84px;height:48px;object-fit:contain;display:flex;align-items:center;justify-content:center}.spec .pu-ph--box{border:2px dashed #5a616b;border-radius:4px;color:#8a919b;font:800 14px "Arial Narrow",system-ui;letter-spacing:.08em}.spec .pu-ph--stamp{background:#3a3f46;color:#c8ccd0;border-radius:3px;font:800 22px "Arial Narrow",system-ui;transform:rotate(-4deg);box-shadow:inset 0 0 0 2px #5a616b}');
  spec.appendChild(st); spec.appendChild(row); grid.appendChild(spec);
  pickRow(s, 'Progress hub', Object.keys(PH_V));
}

const TR_V = {
  TR1: { name: 'Rows with a 5-pip bar', rec: true, desc: 'One row per boost: name and plain line, the 5 pips, "Now: +6 % max HP" and "Next: +8 % · 200", Train → Confirm (3 s) → spinner, "Maxed" at 5. Same row shape as the Unlocks list.' },
  TR2: { name: 'Four cards, 2 × 2', desc: 'Each boost a card with a wide 5-step bar and a full-width Train button. Easy to tap, but at 568 × 320 the cards scroll after the first row.' },
  TR3: { name: 'Level ladder', desc: 'Each row shows the five levels as boxes with their prices; the next box is the Train button. You see the whole cost ahead, but the "Now / Next" words shrink to one line.' },
};
const TL_V = {
  TL1: { name: 'Small text line under the name', rec: true, desc: '"HP 3 · Dmg 2 · $ 5 · Reload 0" (14 px, grey) under each player in the table, "—" when untrained. Also used in the RW frames above.' },
  TL2: { name: 'Four mini pip bars', desc: 'HP / Dmg / $ / Rel with five tiny pips each. Visual, but the pips are small at 568 × 320.' },
  TL3: { name: 'One "Training" column', desc: 'A total "10/20" per player in a fourth column. Very compact, but it hides which boosts.' },
};
function renderTraining() {
  const s = section('s-tr', '4 · Training tab + Results line', 'Story 7.5',
    'The second tab of the hub. Four boosts (max HP +2 % per level, damage +1 %, start money +$10, reload 1 % faster), 5 levels, each level costs 50 × its number. Example: Max HP at 3, Damage maxed, Start money untrained, Reload\'s next level already in its Confirm state. Then the per-player Training line on Results.',
    '<b>Recommended: TR1 + TL1.</b> TR1 matches the Unlocks rows (one way to read the whole hub) and keeps "Now / Next" in words; TL1 is the line the story asks for and still readable on the small phone.');
  const grid = el('div', 'grid'); s.appendChild(grid);
  for (const code of Object.keys(TR_V)) {
    const v = TR_V[code];
    const fr = card(grid, code, v.name, v.desc, v.rec);
    const html = `<div class="hub"><div class="hub-h"><button class="k-btn k-btn--dark" type="button" aria-label="Back">${SVG.back}</button><h1>Progress</h1><span class="k-supn hub-sup hub-supn">${SVG.sup} ${SUPPLIES}</span>${accRow}</div><div class="hub-tabs"><button aria-pressed="false">Unlocks</button><button aria-pressed="true">Training</button><button aria-pressed="false">Survivor</button></div><div class="hub-body">${trainingHtml(code)}</div></div>`;
    fr.appendChild(phone({ w: 568, h: 320, label: code, html, css: HUB_CSS + TR_CSS, paint: hubPaint }));
    fr.appendChild(phone({ w: 800, h: 360, label: code, html, css: HUB_CSS + TR_CSS, paint: hubPaint }));
  }
  pickRow(s, 'Training tab', Object.keys(TR_V));
  const g2 = el('div', 'grid two'); g2.style.marginTop = '18px'; s.appendChild(g2);
  for (const code of Object.keys(TL_V)) {
    const v = TL_V[code];
    const fr = card(g2, code, v.name, v.desc, v.rec);
    const html = `<div class="rw" style="grid-template-columns:1fr"><div class="rw-left" style="align-items:center"><h1>Wave reached 7</h1>${resultsTable({ training: code.toLowerCase() })}<div class="rw-foot"><button class="btn" type="button">Back to lobby</button></div></div></div>`;
    fr.appendChild(phone({ w: 568, h: 320, label: code, html, css: RW_BASE + '.rw{background:rgba(0,0,0,.78)}.rw h1{color:#fff}.rw-table{width:auto;min-width:300px}', bg: cityBg(568, 320, { stage: 4, power: 'ruins' }) }));
  }
  pickRow(s, 'Training line on Results', Object.keys(TL_V));
}
