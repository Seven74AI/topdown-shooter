/* 1 · Story 7.2 Results "Run rewards" panel (+ 7.4, 7.6, 7.7, 7.11, 7.12 rows). */
const RW_STATES = [
  ['full', 'Everything (finder)'], ['mate', 'Teammate view'], ['saving', 'Saving…'], ['failed', "Couldn't save"],
  ['offline', 'Not saved'], ['practice', 'Practice'], ['collector', 'Collector'],
];
function trLine(t) { const z = t.every((v) => v === 0); return z ? '—' : `HP ${t[0]} · Dmg ${t[1]} · $ ${t[2]} · Reload ${t[3]}`; }
function resultsTable(o = {}) {
  const { training = 'tl1', compact = false } = o;
  return `<table class="results__table rw-table"><thead><tr><th>Player</th><th class="results__kills">Kills</th><th class="results__earned">Earned</th></tr></thead><tbody>${TEAM.map((p, i) => `<tr><td><div class="results__name"><span class="lobby__dot" style="background:${SLOT[i]}"></span><span class="rw-nm">${p.name}</span></div></td><td class="results__kills">${p.kills}</td><td class="results__earned">$${fmt(p.earned)}${training === 'tl3' ? `</td><td class="tl3">${p.tr.reduce((a, b) => a + b, 0)}/20` : ''}</td></tr>${training === 'tl2' ? `<tr class="tlr"><td colspan="3">${tl2(p.tr)}</td></tr>` : ''}${training === 'tl1' && !compact ? `<tr class="tlr"><td colspan="3"><small class="tl1">${trLine(p.tr)}</small></td></tr>` : ''}`).join('')}</tbody></table>`;
}
function tl2(t) { return `<small class="tl2">${['HP', 'Dmg', '$', 'Rel'].map((n, i) => `<span>${n}<span class="k-pips">${[0, 1, 2, 3, 4].map((j) => `<i class="${j < t[i] ? 'on' : ''}"></i>`).join('')}</span></span>`).join('')}</small>`; }

function rewardsRows(state) {
  if (state === 'saving') return `<div class="rw-sup"><p class="rw-status"><span class="k-spin rw-spin"></span> Saving…</p></div>`;
  if (state === 'failed') return `<div class="rw-sup"><p class="rw-status rw-status--bad">Couldn't save this run</p><p class="k-hint">Your Supplies from earlier runs are safe.</p></div>`;
  if (state === 'offline') return `<div class="rw-sup"><p class="rw-status">Not saved</p><p class="k-hint">Playing offline from your progress.</p></div>`;
  if (state === 'practice') return `<div class="rw-sup"><p class="rw-status">Practice runs don't earn rewards</p><p class="k-hint">Play online (even alone) to earn Supplies and items.</p></div>`;
  const mate = state === 'mate';
  const supplies = `<div class="rw-sup"><p class="rw-big">+${mate ? 250 : 500} <span>Supplies</span></p><p class="rw-break">Waves 10 × 10 = 100 · Behemoth +50 · Extract +100</p>${mate ? '' : '<p class="rw-rookie"><span class="k-tape">Rookie bonus × 2</span></p>'}<p class="rw-total">Total: ${sup(mate ? 1990 : 740)} Supplies</p></div>`;
  const item = (slot, id, text, btn = true, big = false) => `<div class="rw-item${big ? ' rw-item--big' : ''}"><img class="rw-tile" src="${tileUrl(slot, id, 48)}" alt=""><p>${text}</p>${btn ? '<button class="k-btn k-btn--dark rw-wear" type="button">Wear it</button>' : ''}</div>`;
  let items = '';
  if (state === 'collector') items = item('head', 'riot', 'New item: <b>Riot helmet</b> (first extraction)') + `<div class="rw-item"><span class="rw-tile rw-tile--bag">${SVG.bag}</span><p><b>Collector:</b> you have every surprise item</p></div>`;
  else if (mate) items = item('head', 'gas', 'New item: <b>Gas mask</b> (Behemoth killed)') + `<div class="rw-item rw-item--mate"><img class="rw-tile" src="${tileUrl('head', 'cone', 48)}" alt=""><p><span class="k-dot" style="background:${SLOT[0]}"></span> Mo found: <b>Traffic cone</b></p></div>`;
  else items = item('head', 'riot', 'New item: <b>Riot helmet</b> (first extraction)') + item('head', 'gas', 'New item: <b>Gas mask</b> (Behemoth killed)') + item('head', 'cone', 'Found in wave 6: <b>Traffic cone</b>', true, true);
  const gl = G7.weaponIconUrl('grenade_launcher');
  const unlocks = mate ? `<div class="rw-line"><span class="rw-ic rw-ic--d2"></span><p>Unlocked: <b>District 2</b><br><span class="k-mute">coming soon</span></p></div>` : `<div class="rw-line"><img class="rw-ic" src="${gl}" alt=""><p>You used the <b>Grenade Launcher</b>: unlock it for ${sup(500)}</p></div><div class="rw-line"><span class="rw-ic rw-ic--d2"></span><p>Unlocked: <b>District 2</b><br><span class="k-mute">coming soon</span></p></div>`;
  const nudge = mate ? '' : `<div class="rw-nudge"><p>Keep your Supplies and items on any phone.</p><button class="k-btn k-btn--go" type="button">Save my progress</button></div>`;
  return supplies + `<div class="rw-group">${items}</div><div class="rw-group">${unlocks}</div>${nudge}`;
}
const RW_BASE = `
.rw{position:fixed;inset:0;display:grid;color:#fff;font:500 15px/1.3 system-ui,sans-serif;background:linear-gradient(240deg,rgba(120,70,40,.78) 0%,rgba(30,30,44,.86) 70%);padding:10px calc(var(--sr) + 12px) calc(var(--sb) + 8px) calc(var(--sl) + 12px);gap:12px}
.rw h1{margin:0;font-size:26px;line-height:1.1;color:#f5c542}
.rw .results__sub{font-size:14px}
.rw-left{display:flex;flex-direction:column;gap:6px;min-height:0;min-width:0}
.rw-table{min-width:0;width:100%;font-size:15px}
.rw-table th{padding:2px 6px;font-size:14px}
.rw-table td{padding:3px 6px;vertical-align:top}
.rw-nm{display:flex;flex-direction:column;line-height:1.15}
.tl1{font-size:14px;color:#9aa0a6;font-weight:500;white-space:nowrap;display:block;padding-left:22px;margin-top:-3px}.tlr td{padding-top:0!important}
.tl2{display:flex;gap:8px;padding-left:22px;margin-top:-3px;font-size:14px;color:#9aa0a6}.tl2>span{display:inline-flex;gap:3px;align-items:center}.tl2 .k-pips i{width:5px;height:9px;border-radius:1px}
.tl3{font-size:14px;color:#9aa0a6;text-align:right}
.rw-w{font-size:16px;color:#c8ccd0;font-weight:600}.rw-foot{margin-top:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.rw-foot .btn{min-width:0}
.rw-panel{display:flex;flex-direction:column;min-height:0;min-width:0}
.rw-panel h2{margin:0 0 4px;font:700 14px/1 system-ui;color:#c8ccd0;text-transform:uppercase;letter-spacing:.1em}
.rw-scroll{overflow-y:auto;min-height:0;display:flex;flex-direction:column;gap:8px;padding-right:4px;scrollbar-width:thin}
.rw-sup p{margin:0}
.rw-big{font:800 30px/1.05 system-ui;color:#e3d3a0}.rw-big span{font-size:18px}
.rw-break{font-size:14px;color:#c8ccd0}
.rw-rookie{margin:3px 0 !important}
.rw-total{font-size:15px}
.rw-status{font:700 18px/1.3 system-ui;display:flex;align-items:center;gap:8px}.rw-status--bad{color:#ff8a80}
.rw-spin{border-color:rgba(255,255,255,.25);border-top-color:#fff}
.rw-group{display:flex;flex-direction:column;gap:6px}
.rw-group:empty{display:none}
.rw-item,.rw-line{display:flex;align-items:center;gap:8px}
.rw-item p,.rw-line p{margin:0;flex:1;min-width:0;font-size:14px;line-height:1.25}
.rw-item--big p{font-size:16px}
.rw-item--big .rw-tile{width:48px;height:48px}
.rw-tile{width:44px;height:44px;flex:none;border-radius:6px;background:#22252a;box-shadow:inset 0 0 0 1px rgba(255,255,255,.1)}
.rw-tile--bag{display:flex;align-items:center;justify-content:center;font-size:24px}
.rw-wear{min-width:0;padding:0 10px;font-size:14px}
.rw-ic{width:44px;height:22px;flex:none;object-fit:contain}
.rw-ic--d2{display:inline-block;height:28px;border-radius:3px;background:linear-gradient(160deg,#2c3a4a,#14181d);box-shadow:inset 0 0 0 1px rgba(255,255,255,.2)}
.rw-nudge{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:rgba(52,199,89,.12)}
.rw-nudge p{margin:0;flex:1;font-size:14px}
.rw-back{align-self:flex-start}.rw-tile{background:#2c3036}
@media (max-width:600px){.rw{grid-template-columns:minmax(0,205px) minmax(0,1fr)!important}.rw-foot .results__seed{display:none}}
`;
const RW_V = {
  RW1: {
    name: 'Two columns, rewards on the right', rec: true,
    desc: 'The team table stays on the left as today (title, table, Back to lobby); "Run rewards" is its own scrolling column on the right, rows in the fixed order. Nothing moves when rows are added.',
    css: `.rw{grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr)}.rw-panel{background:rgba(0,0,0,.35);border-radius:10px;padding:8px 8px 6px}`,
    html: (s) => `<div class="rw"><div class="rw-left"><h1>Extracted <span class="rw-w">· wave 10</span></h1>${resultsTable()}<div class="rw-foot"><button class="btn rw-back" type="button">Back to lobby</button><p class="results__seed">Run seed 2207</p></div></div><div class="rw-panel"><h2>Run rewards</h2><div class="rw-scroll">${rewardsRows(s)}</div></div></div>`,
  },
  RW2: {
    name: 'One column with a Team / Rewards switch',
    desc: 'Full width for the rewards (no wrapped lines), the team table one tap away behind "Team". Opens on "Run rewards". Tap the switch in the frame.',
    css: `.rw{grid-template-rows:auto minmax(0,1fr) auto;grid-template-columns:1fr}.rw-top{display:flex;align-items:center;gap:10px}.rw-top h1{flex:none}.rw-sw{display:flex;margin-left:auto;border-radius:8px;overflow:hidden;box-shadow:inset 0 0 0 2px #555}.rw-sw button{min-height:44px;padding:0 14px;border:0;background:transparent;color:#ddd;font:700 15px system-ui}.rw-sw button[aria-pressed=true]{background:#e8e8e8;color:#111}.rw-pane{min-height:0;overflow-y:auto;background:rgba(0,0,0,.35);border-radius:10px;padding:8px 10px}.rw-pane .rw-scroll{overflow:visible}.rw-bot{display:flex;align-items:center;gap:10px}.rw-bot .results__seed{margin:0 0 0 auto}[hidden]{display:none!important}`,
    html: (s) => `<div class="rw"><div class="rw-top"><h1>Extracted</h1><span class="results__sub">Wave 10</span><div class="rw-sw"><button type="button" aria-pressed="true" data-t="r">Run rewards</button><button type="button" aria-pressed="false" data-t="t">Team</button></div></div><div class="rw-pane"><div class="rw-scroll" data-p="r">${rewardsRows(s)}</div><div data-p="t" hidden>${resultsTable()}</div></div><div class="rw-bot"><button class="btn" type="button">Back to lobby</button><p class="results__seed">Run seed 2207</p></div></div>`,
    paint: (d) => { for (const b of d.querySelectorAll('.rw-sw button')) b.onclick = () => { for (const x of d.querySelectorAll('.rw-sw button')) x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); for (const p of d.querySelectorAll('[data-p]')) p.hidden = p.dataset.p !== b.dataset.t; }; },
  },
  RW3: {
    name: 'Rewards on a paper slip',
    desc: 'Same two columns as RW1, but the rewards are a cream "evidence tag" slip like the 5.13 shop cards (dark ink, taped item photos). More Dead City, but the slip is busier and its dark-on-cream text is a new style on Results.',
    css: `.rw{grid-template-columns:minmax(0,0.9fr) minmax(0,1.1fr)}.rw-panel{background:radial-gradient(rgba(90,70,40,.1) 1px,transparent 1.4px) 0 0/9px 9px,#ece3c8;color:#17191c;border-radius:3px;padding:0 10px 8px;clip-path:polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%);box-shadow:0 2px 0 rgba(0,0,0,.35)}.rw-panel h2{margin:0 -10px 6px;padding:3px 10px;background:repeating-linear-gradient(-45deg,#2f2a22 0 8px,#3d372d 8px 11px);color:#ece3c8}.rw-panel .rw-big,.rw-panel .k-supn{color:#7a5a12}.rw-panel .rw-break,.rw-panel .k-hint,.rw-panel .k-mute{color:#4a463c}.rw-panel .rw-tile{background:#fff;padding:2px;transform:rotate(-3deg);box-shadow:0 1px 2px rgba(0,0,0,.4)}.rw-panel .rw-item:nth-child(2) .rw-tile{transform:rotate(2deg)}.rw-panel .rw-wear{background:#17191c;color:#ece3c8}.rw-panel .rw-nudge{background:rgba(23,25,28,.08)}.rw-panel .rw-status--bad{color:#8a2a20}.rw-panel .rw-spin{border-color:rgba(0,0,0,.2);border-top-color:#17191c}.rw-panel .k-tape{background:#17191c;color:#ece3c8}`,
    html: (s) => RW_V.RW1.html(s),
  },
};
function rwFrame(code, state, w, h, label) {
  const v = RW_V[code];
  return phone({ w, h, label, html: v.html(state), css: RW_BASE + v.css, bg: cityBg(w, h, { stage: 5, power: 'ruins', x0: 16, y0: 12 }), paint: v.paint });
}
{
  const s = section('s-rw', '1 · Results "Run rewards"', 'Story 7.2 + 7.4, 7.6, 7.7, 7.11, 7.12',
    'One panel for all of Epic 7, fixed row order: <b>1</b> Supplies (big line, breakdown, Rookie badge, total — or its status) · <b>2</b> items (close-up drawing: "New item: …", "Found in wave N: …" or "Collector") · <b>3</b> unlock lines (7.4 "You used …", 7.7 "Unlocked: District 2") · <b>4</b> the "Save my progress" nudge (7.6, once). Example: a rookie who extracted after wave 10, reached two milestones and found the bag. The Results table gets the 7.5 Training line (TL1, see item 4). Scroll the panel inside the frames.',
    '<b>Recommended: RW1.</b> The team table and buttons stay where players know them, the rewards get a column of their own that can grow (4 items + 3 lines scroll inside it), and every row keeps its picture next to its words at 568 × 320.');
  const grid = el('div', 'grid'); s.appendChild(grid);
  for (const code of Object.keys(RW_V)) {
    const v = RW_V[code];
    const fr = card(grid, code, v.name, v.desc, v.rec);
    fr.appendChild(rwFrame(code, 'full', 568, 320, code));
    fr.appendChild(rwFrame(code, 'full', 800, 360, code));
  }
  // states strip for every variant (choose variant with the buttons)
  const st = card(grid, 'RW states', 'The other states of the panel', 'Saving… (until the server answers), Couldn\'t save, Not saved (offline), Practice, the teammate view (D1: "Mo found: Traffic cone", same picture, smaller line) and Collector. Shown in the variant picked here:', false);
  const seg = el('div', 'seg'); st.parentElement.insertBefore(seg, st);
  const fillStates = (code) => { st.innerHTML = ''; for (const [k, n] of RW_STATES.slice(1)) st.appendChild(rwFrame(code, k, 568, 320, `${code} · ${n}`)); fitFrames(); };
  for (const code of Object.keys(RW_V)) { const b = el('button', null, code); b.type = 'button'; b.setAttribute('aria-pressed', code === 'RW1' ? 'true' : 'false'); b.onclick = () => { for (const x of seg.children) x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); fillStates(code); }; seg.appendChild(b); }
  fillStates('RW1');
  pickRow(s, 'Run rewards', Object.keys(RW_V));
}
