/* 6 · Story 7.7 lobby district picker · 7 · Story 7.9 lobby slot card with the survivor drawing. */
const LOBBY_ROWS = [
  { name: 'Mo', look: 'mo', host: true, ready: true },
  { name: 'Ana', look: 'ana', you: true, ready: false },
  { name: 'Kit', look: 'kit', ready: true },
  null,
];
function thumb(kind, w = 72, h = 44) {
  const key = 'th' + kind + w + h; if (urlCache.has(key)) return urlCache.get(key);
  const [c, g] = canvas(w, h);
  const city = G7.render({ stage: kind === 'downtown' ? 1 : 3, ppm: (w / 34) * DPR, x0: 7, y0: 5, w: 34, h: 34 * h / w, noLight: true });
  if (kind === 'd2') { g.save(); g.translate(w, 0); g.scale(-1, 1); g.filter = 'grayscale(0.7) brightness(0.45) sepia(0.3)'; g.drawImage(city, 0, 0, w, h); g.restore(); }
  else g.drawImage(city, 0, 0, w, h);
  const u = c.toDataURL('image/jpeg', 0.85); urlCache.set(key, u); return u;
}
const LB_CSS = `
.lobby{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr);align-content:start;align-items:start!important;padding:8px calc(var(--sr) + 12px) calc(var(--sb) + 6px) calc(var(--sl) + 12px)!important;gap:6px!important;column-gap:16px!important}
.lobby .lobby__invite,.lobby .lobby__team{gap:6px}
.lobby__code{font-size:44px!important}
.lobby__players{gap:4px!important}
.lobby .btn{min-height:44px;min-width:0;padding:0 18px}
.lobby .lobby__row{gap:8px}
.sc1{min-height:42px!important;padding:1px 8px 1px 1px!important;gap:8px!important}
.sc1 img{width:40px;height:40px;border-radius:7px;flex:none}
.sc1-open{width:40px;height:40px;border-radius:7px;border:2px dashed #555;flex:none}
.sc2{min-height:44px!important;padding:2px 8px 2px 2px!important}
.sc2 img{width:40px;height:40px;border-radius:50%;flex:none;box-shadow:0 0 0 3px var(--c)}
.sc2-open{width:40px;height:40px;border-radius:50%;border:2px dashed #555;flex:none}
.dp1{display:flex;gap:6px;width:min(360px,100%)}
.dp1 button,.dp1 div{flex:1;min-width:0;min-height:58px;padding:3px;border:0;border-radius:8px;background:#24272c;color:#fff;font:700 14px/1.1 system-ui;display:flex;flex-direction:column;align-items:center;gap:2px;position:relative}
.dp1 img{width:100%;height:30px;object-fit:cover;border-radius:5px}
.dp1 .on{box-shadow:inset 0 0 0 3px #e8e4da}
.dp1 small{font-weight:600;color:#9aa0a6;font-size:14px}
.dp1 .lk{position:absolute;top:8px;left:50%;margin-left:-8px}
.dp1 .rnd{background:transparent;border:2px dashed #444;color:#777;justify-content:center}
.dp2{display:flex;align-items:center;gap:8px;width:min(360px,100%);min-height:44px;padding:2px 10px 2px 2px;border:0;border-radius:8px;background:#24272c;color:#fff;font:600 15px system-ui;text-align:left}
.dp2 img{width:64px;height:40px;object-fit:cover;border-radius:6px}
.dp2 b{flex:1}
.dp2 .chev{width:16px;height:16px;transform:rotate(90deg);color:#bbb}
.dp2.ro{background:transparent;box-shadow:inset 0 0 0 1px #333}
.sheet2{position:fixed;left:calc(var(--sl) + 40px);right:calc(var(--sr) + 40px);bottom:var(--sb);background:#1b1d21;border-radius:14px 14px 0 0;padding:10px 12px 12px;box-shadow:0 -10px 40px rgba(0,0,0,.7);display:flex;flex-direction:column;gap:8px;z-index:5;color:#fff;text-align:left}
.sheet2 h2{margin:0;font-size:16px}
.sheet2 .cards{display:flex;gap:8px}
.sheet2 .cards > *{flex:1;min-height:110px;border:0;border-radius:10px;background:#24272c;color:#fff;padding:5px;display:flex;flex-direction:column;gap:3px;font:700 15px system-ui;text-align:left;position:relative}
.sheet2 img{width:100%;height:56px;object-fit:cover;border-radius:6px}
.sheet2 small{font:500 14px/1.2 system-ui;color:#9aa0a6}
.sheet2 .on{box-shadow:inset 0 0 0 3px #e8e4da}
.sheet2 .rnd{background:transparent;border:2px dashed #444;color:#777}
.sheet2 .lk{position:absolute;top:22px;left:50%;margin-left:-8px}
.dimmed::after{content:"";position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:4}
.dp3{display:flex;flex-direction:column;gap:4px;width:100%;margin-top:2px}
.dp3 > *{display:flex;align-items:center;gap:8px;min-height:44px;padding:2px 8px 2px 2px;border:0;border-radius:8px;background:#24272c;color:#fff;font:700 15px system-ui;text-align:left}
.dp3 img{width:56px;height:38px;object-fit:cover;border-radius:5px}
.dp3 span{flex:1;line-height:1.15}.dp3 small{display:block;font:500 14px system-ui;color:#9aa0a6}
.dp3 .on{box-shadow:inset 0 0 0 3px #e8e4da}
.dp3 .rnd{background:transparent;border:2px dashed #444;color:#777;min-height:32px}
.lobby--dp3 .lobby__code{font-size:34px!important}
.lobby--dp3 .lobby__link{display:none}
.lb-dh{margin:0;font-size:14px;color:#bbb}
`;
function slotRow(p, i, sc) {
  if (!p) return `<li class="lobby__player lobby__player--open ${sc}">${sc === 'sc1' ? '<span class="sc1-open"></span>' : sc === 'sc2' ? '<span class="sc2-open"></span>' : `<span class="lobby__dot" style="background:${SLOT[i]}"></span>`}<span class="lobby__name">Open</span></li>`;
  let pic = `<span class="lobby__dot" style="background:${SLOT[i]}"></span>`;
  if (sc === 'sc1') pic = `<img src="${portrait(p.look, { w: 40, h: 40, r: 12.5, ringCol: SLOT[i], cy: 0.58 })}" alt="">`;
  if (sc === 'sc2') pic = `<img style="--c:${SLOT[i]}" src="${portrait(p.look, { w: 40, h: 40, r: 19, cy: 0.56, ang: -Math.PI / 2, round: 1 })}" alt="">`;
  return `<li class="lobby__player ${sc}">${pic}<span class="lobby__name">${p.name}</span>${p.host ? '<span class="lobby__tag">Host</span>' : ''}${p.you ? '<span class="lobby__tag lobby__tag--you">You</span>' : ''}<span class="lobby__ready${p.ready ? ' lobby__ready--on' : ''}">${p.ready ? 'Ready' : 'Not ready'}</span></li>`;
}
function districtEl(dp, host) {
  const dt = thumb('downtown'), d2 = thumb('d2');
  if (dp === 'DP1') return `<div class="dp1">${host ? `<button class="on"><img src="${dt}" alt="">Downtown</button><button><img src="${d2}" alt=""><span class="lk">${SVG.lock}</span>District 2<small>Locked</small></button>` : `<div class="on"><img src="${dt}" alt="">Downtown</div><div><img src="${d2}" alt=""><span class="lk">${SVG.lock}</span>District 2<small>Locked</small></div>`}<div class="rnd">Random city<small>later</small></div></div>`;
  if (dp === 'DP2') return host ? `<button class="dp2"><img src="${dt}" alt=""><b>District: Downtown</b><svg class="chev" viewBox="0 0 16 16"><path d="M5 2l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4"/></svg></button>` : `<div class="dp2 ro"><img src="${dt}" alt=""><b>District: Downtown</b><small class="k-mute">host picks</small></div>`;
  return '';
}
function dp3List(host) {
  return `<p class="lb-dh">${host ? 'District (you pick)' : 'District (host picks)'}</p><div class="dp3"><${host ? 'button' : 'div'} class="on"><img src="${thumb('downtown')}" alt=""><span>Downtown<small>Selected</small></span></${host ? 'button' : 'div'}><div><img src="${thumb('d2')}" alt=""><span>District 2<small>Extract from Downtown to unlock</small></span>${SVG.lock}</div><div class="rnd"><span>Random city · later</span></div></div>`;
}
function lobbyHtml({ sc = 'sc1', dp = null, host = true, sheet = false }) {
  const invite = `<section class="lobby__invite"><h2 class="lobby__label">Game code</h2><p class="lobby__code">QXRT</p><p class="lobby__link">hordes.sevend.io/j/QXRT</p><div class="lobby__row"><button class="btn">Copy</button><button class="btn">Share</button></div>${dp === 'DP3' ? dp3List(host) : `<p class="lobby__notice">${dp === 'DP1' && !host ? 'The host picks the district' : ''}</p>`}<button class="btn btn--secondary">Leave</button></section>`;
  const team = `<section class="lobby__team">${dp && dp !== 'DP3' ? districtEl(dp, host) : ''}<ul class="lobby__players">${LOBBY_ROWS.map((p, i) => slotRow(p, i, sc)).join('')}</ul><div class="lobby__row"><button class="btn">${host ? 'Not ready' : 'Ready'}</button>${host ? '<button class="btn btn--start">Start</button>' : ''}</div></section>`;
  const sh = sheet ? `<div class="sheet2"><h2>Pick the district</h2><div class="cards"><button class="on"><img src="${thumb('downtown')}" alt="">Downtown<small>Selected</small></button><div><img src="${thumb('d2')}" alt=""><span class="lk">${SVG.lock}</span>District 2<small>Extract from Downtown to unlock</small></div><div class="rnd">Random city<small>Epic 11</small></div></div></div>` : '';
  return `<div class="menu lobby${dp === 'DP3' ? ' lobby--dp3' : ''}${sheet ? ' dimmed' : ''}">${invite}${team}</div>${sh}`;
}
const DP_V = {
  DP1: { name: 'A row of district cards', desc: 'Three small picture cards above the slots (Downtown selected, District 2 locked, a dashed "Random city · later" space for Epic 11). The host taps a card; others see the same row, not tappable. It fits at 568 × 320, but the cards are small: the lock text is cut to "Locked" and a fourth district would not fit.' },
  DP2: { name: 'One "District" line, cards in a sheet', rec: true, desc: 'A single 44 px line "District: Downtown ›" with its picture. The host taps it to open a sheet with the big district cards (third frame); others see "host picks" and no arrow. Takes the least room, and Random city fits in the sheet later.' },
  DP3: { name: 'Districts in the invite column', desc: 'The district list sits under the game code on the left (code smaller, share link hidden), the team column stays as it is. Clear, but the left column gets busy and the code is harder to read out.' },
};
const SC_V = {
  SC1: { name: 'Close-up left of the name', rec: true, desc: 'Each filled slot shows the survivor on a small square of asphalt with its slot ring (40 px), then name, Host / You tags and Ready. Rows stay one line; Open slots show a dashed square.' },
  SC2: { name: 'Head close-up in the slot circle', desc: 'The slot dot becomes a 40 px circle in the slot colour, zoomed on the head (hats, masks and hair read best; tops and packs are cut off).' },
  SC3: { name: 'Line-up cards', desc: 'Four tall cards side by side, the survivor drawn big (about 3× game size, whole body with pack) over the name, tags and Ready. The best look at everyone, but the code and buttons move to a top row and the share link is hidden at 568 × 320.' },
};
const SC3_CSS = `
.l3{position:fixed;inset:0;background:rgba(0,0,0,.88);color:#fff;font:500 15px/1.3 system-ui,sans-serif;display:flex;flex-direction:column;gap:8px;padding:8px calc(var(--sr) + 12px) calc(var(--sb) + 6px) calc(var(--sl) + 12px)}
.l3-top{display:flex;align-items:center;gap:8px}
.l3-top .lobby__code{font-size:32px!important;margin-right:auto}
.l3-top .btn{min-height:44px;min-width:0;padding:0 14px}
.l3-cards{flex:1;display:grid;grid-template-columns:repeat(4,1fr);gap:8px;min-height:0}
.l3c{display:flex;flex-direction:column;border-radius:10px;background:rgba(255,255,255,.07);overflow:hidden;min-width:0}
.l3c img{width:100%;flex:1;min-height:0;object-fit:cover;border-bottom:3px solid var(--c)}
.l3c b{padding:3px 8px 0;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.l3c .tg{display:flex;gap:4px;align-items:center;padding:2px 6px 6px;flex-wrap:wrap}
.l3c.open{border:2px dashed #444;background:transparent;align-items:center;justify-content:center;color:#777}
`;
function sc3Html() {
  return `<div class="l3"><div class="l3-top"><span class="lobby__label">Code</span><p class="lobby__code">QXRT</p><button class="btn">Share</button><button class="btn btn--secondary">Leave</button><button class="btn">Not ready</button><button class="btn btn--start">Start</button></div><div class="l3-cards">${LOBBY_ROWS.map((p, i) => p ? `<div class="l3c" style="--c:${SLOT[i]}"><img src="${portrait(p.look, { w: 124, h: 150, r: 34, ringCol: SLOT[i], cy: 0.6, ang: -Math.PI / 2 - 0.5 })}" alt=""><b>${p.name}</b><span class="tg">${p.host ? '<span class="lobby__tag">Host</span>' : ''}${p.you ? '<span class="lobby__tag lobby__tag--you">You</span>' : ''}<span class="lobby__ready${p.ready ? ' lobby__ready--on' : ''}">${p.ready ? 'Ready' : 'Not ready'}</span></span></div>` : '<div class="l3c open">Open</div>').join('')}</div></div>`;
}
{
  const s = section('s-dp', '6 · Lobby district picker', 'Story 7.7',
    'The host picks the district if anyone in the lobby has it; in v1 only Downtown is playable and District 2 shows "Locked · extract from Downtown to unlock" or "Unlocked · coming soon". Room is kept for Epic 11\'s Random city card. Each variant: host view, a teammate\'s read-only view, and 800 × 360. The slot rows use SC1 (item 7). Two changes to today\'s lobby in every variant: on the 568 phone it becomes two columns like on bigger phones (today it stacks into one long scrolling column), and Leave moves to the invite column to make room. The "Unlocked: District 2" reward line is in row 3 of the rewards panel (item 1).',
    '<b>Recommended: DP2.</b> One line is all the lobby can spare at 568 × 320 above four slots; the sheet has space for big district pictures, the full lock text and Random city later, and a teammate sees the pick without a control they can\'t use.');
  const grid = el('div', 'grid'); s.appendChild(grid);
  const bg = cityBg(568, 320, { stage: 1 }), bg8 = cityBg(800, 360, { stage: 1 });
  for (const code of Object.keys(DP_V)) {
    const v = DP_V[code];
    const fr = card(grid, code, v.name, v.desc, v.rec);
    fr.appendChild(phone({ w: 568, h: 320, label: `${code} · host`, html: lobbyHtml({ dp: code, host: true }), css: LB_CSS, bg }));
    fr.appendChild(phone({ w: 568, h: 320, label: `${code} · teammate`, html: lobbyHtml({ dp: code, host: false }), css: LB_CSS, bg }));
    if (code === 'DP2') fr.appendChild(phone({ w: 568, h: 320, label: 'DP2 · host tapped the line', html: lobbyHtml({ dp: code, host: true, sheet: true }), css: LB_CSS, bg }));
    fr.appendChild(phone({ w: 800, h: 360, label: `${code} · host`, html: lobbyHtml({ dp: code, host: true }), css: LB_CSS, bg: bg8 }));
  }
  pickRow(s, 'District picker', Object.keys(DP_V));
}
{
  const s = section('s-sc', '7 · Lobby slot card with your survivor', 'Story 7.9',
    'Each filled slot shows that player\'s survivor drawn by the game (<code>drawSurvivor</code> with their 7.8 parts, night colours). Example: Mo (default look, host), Ana (riot helmet, camo coat — you, not ready), Kit (traffic cone, floral shirt, duffel), one open slot. Slot rings, names and tags keep the slot colours (people). Shown without the district line; item 6 shows them together.',
    '<b>Recommended: SC1.</b> The whole survivor (hat, top and pack) is recognisable at 40 px with its slot ring, the rows stay one line so four players, Ready and Start fit at 568 × 320, and nothing else in the lobby moves.');
  const grid = el('div', 'grid'); s.appendChild(grid);
  const bg = cityBg(568, 320, { stage: 1 }), bg8 = cityBg(800, 360, { stage: 1 });
  for (const code of Object.keys(SC_V)) {
    const v = SC_V[code];
    const fr = card(grid, code, v.name, v.desc, v.rec);
    const html = code === 'SC3' ? sc3Html() : lobbyHtml({ sc: code.toLowerCase(), dp: null });
    const css = code === 'SC3' ? SC3_CSS : LB_CSS;
    fr.appendChild(phone({ w: 568, h: 320, label: code, html, css, bg }));
    fr.appendChild(phone({ w: 800, h: 360, label: code, html, css, bg: bg8 }));
  }
  pickRow(s, 'Slot card', Object.keys(SC_V));
}
