/* Lumen-LF5 applied to the other 8 Epic 7 screens, keeping the round-1 approved layouts and row orders:
 * PH1 hub + Unlocks · TR1 Training · BT2 borrowed tag (shop) · AC2 accounts · DP2 district picker · SC1 lobby slot card ·
 * ED1 + LK2 + LS1 survivor editor · LB2 + OA2 + BF2 loot bag (in play: white = pick-ups, no theme accent).
 */
const LF = LF5, UI = LF5.C, SK = UI.S;
const LOOKS = {
  mo: {},
  ana: { head: 'riot', top: 'camo', hair: 'tied', skin: '3', colours: { top: '#5d6b3a', hair: '#3a2a1c', accent: '#1f2326' } },
  kit: { head: 'cone', top: 'floral', hair: 'curly', skin: '6', pack: 'duffel', colours: { top: '#2c6f8f', hair: '#121010', accent: '#e0b33a' } },
  lu: { head: 'bunny', pack: 'teddy', top: 'hoodie', hair: 'tied', skin: '2', colours: { top: '#7a3b6e', hair: '#b5762e', accent: '#d8d2c4' } },
};
const SUP = 340;
function safe(w, h) { const sm = w < 700; return { sm, x0: sm ? 50 : 12, x1: sm ? w - 50 : w - 12, y0: 6, y1: h - (sm ? 25 : 8) }; }
const menuBg = (w, h) => dawn(w, h, 'dw2', { dim: 0.55, blur: 3 });
function T(g, s, x, y, o = {}) { text(g, s, x, y, { px: 14, wt: 500, col: SK.ink, shadow: false, ...o }); }
function supChip(g, x, y, v, px = 16) { crate(g, x, y - px * 0.85, px); return UI.tnum(g, fmt(v), x + px + 4, y, px, { wt: 600, col: SK.ink, skew: 0 }) + px + 4; }
function chevron(g, x, y, s, dir = 1, col = SK.ink) { g.strokeStyle = col; g.lineWidth = 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(x - s * 0.3 * dir, y - s * 0.5); g.lineTo(x + s * 0.3 * dir, y); g.lineTo(x - s * 0.3 * dir, y + s * 0.5); g.stroke(); }
function backKey(g, x, y) { UI.button(g, x, y, 44, 36, ' ', 'secondary', 'normal'); chevron(g, x + 22, y + 18, 12, -1, SK.accentText); }
function tabs(g, x, y, w, h, labels, sel) {
  const tw0 = w / labels.length;
  labels.forEach((l, i) => {
    const on = i === sel, bx = x + i * tw0 + 2, bw = tw0 - 4;
    UI.shape(g, bx, y, bw, h, 6);
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, on ? 'rgba(70,76,86,0.95)' : 'rgba(34,38,44,0.9)'); gr.addColorStop(1, on ? 'rgba(36,40,46,0.95)' : 'rgba(18,20,24,0.9)');
    g.fillStyle = gr; g.fill(); UI.shape(g, bx, y, bw, h, 6); bevel(g, bx, y, bw, h, on ? 0.5 : 0.25, 0.6, 1);
    if (on) { g.fillStyle = SK.accent; neon(g, () => g.fillRect(bx + 6, y + h - 3, bw - 12, 2), SK.accentGlow, 6); }
    text(g, l.toUpperCase(), bx + bw / 2, y + h / 2 + 5, { px: 14, wt: 700, ls: 1.4, col: on ? SK.ink : SK.mute, align: 'center', shadow: false });
  });
}
function field(g, x, y, w, h, label, value, state = 'normal', o = {}) {
  if (label) UI.micro(g, label.toUpperCase(), x, y - 4, { col: state === 'error' ? '#ff6b6b' : SK.mute });
  const p = () => UI.shape(g, x, y, w, h, 5);
  g.fillStyle = 'rgba(6,7,9,0.85)'; p(); g.fill(); innerShade(g, p, { blur: 4, a: 0.9, lw: 3 });
  g.save(); p(); g.clip(); texture(g, TEX.grain, x, y, w, h, { op: 'overlay', a: 0.4 }); g.restore();
  const lc = state === 'focus' ? SK.accent : state === 'error' ? '#ff5a5a' : SK.line2;
  g.strokeStyle = lc; g.lineWidth = state === 'normal' ? 1 : 1.4; if (state === 'focus') neon(g, () => { p(); g.stroke(); }, SK.accentGlow, 5); else { p(); g.stroke(); }
  const ph = !value;
  T(g, ph ? (o.placeholder || '') : value, x + 10, y + h / 2 + 5.5, { px: o.mono ? 15 : 16, wt: 600, ls: o.mono ? 4 : 0, col: ph ? 'rgba(200,205,212,0.3)' : SK.ink });
  if (state === 'focus') { const cx = x + 10 + tw(g, value || '', o.mono ? 15 : 16, 600, o.mono ? 4 : 0) + 2; g.fillStyle = SK.accent; g.fillRect(cx, y + 9, 2, h - 18); }
}
function keyboard(g, w, h, kh = 140) {
  const y0 = h - kh;
  g.fillStyle = '#1a1c20'; g.fillRect(0, y0, w, kh); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(0, y0, w, 1);
  const rows = [['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'], ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'], ['⇧', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫']];
  const rh = (kh - 14) / 4, kw = Math.min(52, (w - 40) / 10);
  rows.forEach((r, j) => { const rw = r.length * (kw + 5); r.forEach((k, i) => { const x = (w - rw) / 2 + i * (kw + 5), y = y0 + 5 + j * (rh + 2); g.fillStyle = '#000'; rrect(g, x, y + 1, kw, rh - 2, 5); g.fill(); g.fillStyle = k.length > 1 && k !== '⌫' ? '#3b3e44' : '#55595f'; if (k === '⌫' || k === '⇧') g.fillStyle = '#3b3e44'; rrect(g, x, y, kw, rh - 2, 5); g.fill(); T(g, k, x + kw / 2, y + rh / 2 + 4, { px: 15, wt: 500, col: '#fff', align: 'center' }); }); });
  const y = y0 + 5 + 3 * (rh + 2); g.fillStyle = '#3b3e44'; rrect(g, 20, y, 70, rh - 2, 5); g.fill(); rrect(g, w - 90, y, 70, rh - 2, 5); g.fill(); g.fillStyle = '#55595f'; rrect(g, 100, y, w - 200, rh - 2, 5); g.fill();
  T(g, '123', 55, y + rh / 2 + 4, { px: 13, col: '#fff', align: 'center' }); T(g, 'space', w / 2, y + rh / 2 + 4, { px: 13, col: '#fff', align: 'center' }); T(g, 'return', w - 55, y + rh / 2 + 4, { px: 13, col: '#fff', align: 'center' });
}
function icon(g, id, kind, x, y, w, h) {
  const im = IMG['ic-' + kind + '-' + id];
  if (im) { const k = Math.min(w / im.width, h / im.height) * 0.95, iw = im.width * k, ih = im.height * k; g.save(); g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 3; g.shadowOffsetX = 1; g.shadowOffsetY = 1.5; g.drawImage(im, x + (w - iw) / 2, y + (h - ih) / 2, iw, ih); g.restore(); return; }
  // placeholder silhouette (no icon art yet): a dark lit shape
  g.save(); g.translate(x + w / 2, y + h / 2); g.fillStyle = '#5a616b';
  if (id === 'pistol') { g.beginPath(); g.moveTo(-14, -7); g.lineTo(13, -7); g.lineTo(13, -1); g.lineTo(-3, -1); g.lineTo(-6, 9); g.lineTo(-13, 9); g.lineTo(-10, -1); g.closePath(); g.fill(); }
  else for (let i = 0; i < 3; i++) g.fillRect(-14, -8 + i * 6, 28, 4);
  g.restore();
}
function portrait(g, look, x, y, s, slot) {
  const p = () => rrect(g, x, y, s, s, 5);
  g.save(); p(); g.clip(); g.fillStyle = '#1b1d20'; g.fillRect(x, y, s, s); texture(g, TEX.grain, x, y, s, s, { op: 'overlay', a: 0.7 }); texture(g, TEX.fbm, x, y, s, s, { op: 'soft-light', a: 0.5 });
  g.strokeStyle = SLOT[slot]; g.lineWidth = s * 0.07; g.globalAlpha = 0.95; g.beginPath(); g.arc(x + s / 2, y + s * 0.56, s * 0.34, 0, TAU); g.stroke(); g.globalAlpha = 1;
  survivorAt(g, LOOKS[look] || {}, x + s / 2, y + s * 0.56, s * 0.27, -Math.PI / 2 - 0.35);
  keyWash(g, x, y, s, s, 0.1, 0.3); g.restore();
  g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = 1.5; p(); g.stroke(); g.strokeStyle = SK.line2; g.lineWidth = 0.8; p(); g.stroke();
}
function hubHeader(g, sf, title = 'PROGRESS') {
  const [fx, fy, fW] = UI.panel(g, sf.x0, sf.y0, sf.x1 - sf.x0, 44, { c: 8 });
  backKey(g, fx + 2, fy + 1);
  text(g, title, fx + 54, fy + 25, { px: 20, wt: 700, ls: 2, col: SK.ink, shadow: false });
  const tx = fx + 54 + tw(g, title, 20, 700, 2) + 12;
  supChip(g, tx, fy + 25, SUP, 16);
  const ax = fx + fW - 6;
  const li = 'Log in', sm = 'Save my progress', lw = tw(g, li.toUpperCase(), 12, 700, 1.2) + 22, sw = tw(g, sm.toUpperCase(), 12, 700, 1.2) + 22;
  UI.button(g, ax - lw, fy + 4, lw, 30, li, 'tertiary', 'normal', { px: 12 });
  UI.button(g, ax - lw - sw - 2, fy + 4, sw, 30, sm, 'tertiary', 'normal', { px: 12 });
  if (!sf.sm) UI.micro(g, 'GUEST', ax - lw - sw - 8, fy + 23, { align: 'right', px: 9 });
}

// ---------- 1 · hub + Unlocks (PH1) ----------
const UNL = [['WEAPONS', [['chainsaw', 'Chainsaw', 'Close-range shredder for crowds', 300, 'w', 'confirm'], ['gas_torch', 'Gas torch', 'Short, wide cone of fire', 350, 'w'], ['flamethrower', 'Flamethrower', 'Long, narrow jet of burning fuel', 400, 'w'], ['grenade_launcher', 'Grenade Launcher', 'Lobs explosive rounds over cover', 500, 'w'], ['assault_rifle', 'Assault Rifle', 'Fast-firing rifle, good at any range', 'bought', 'w'], ['pistol', 'Pistol', 'Your sidearm: never runs dry', 'starter', 'w', 'ph']]],
  ['BUILDINGS', [['spike_trap', 'Spike trap', 'Hurts every zombie that walks over it', 100, 'b', 'good'], ['bear_trap', 'Bear trap', 'Catches a zombie and holds it', 100, 'b'], ['floodlight', 'Floodlight', 'Lights the dark around it', 120, 'b'], ['barricade_upgrades', 'Barricade upgrades', 'Reinforced and metal barricades', 150, 'b', 'ph']]]];
function unlockRow(g, x, y, w, h, r, st) {
  const [id, name, line, price, kind, flag] = r;
  UI.iconBox(g, x, y + 5, 56, h - 10); icon(g, id, flag === 'ph' ? 'none' : kind, x + 3, y + 7, 50, h - 14);
  const tx = x + 66, aw = st.sm ? 150 : 190;
  T(g, name, tx, y + 18, { px: 15, wt: 600 });
  T(g, line, tx, y + 34, { px: 12, col: SK.mute, maxW: w - 66 - aw - 6 });
  if (flag === 'good') UI.tag(g, tx + tw(g, name, 15, 600) + 8, y + 6, 'Good next pick', 'accent', { px: 9, h: 15 });
  const ax = x + w;
  if (price === 'starter' || price === 'bought') { UI.tag(g, ax - 76, y + h / 2 - (price === 'starter' ? 12 : 8), 'Unlocked', 'steel'); if (price === 'starter') UI.micro(g, 'STARTER', ax - 4, y + h / 2 + 14, { px: 8, align: 'right' }); }
  else if (flag === 'confirm' || (st.confirm === id)) { UI.button(g, ax - 124, y + (h - 38) / 2, 124, 38, `Confirm ${price}`, 'primary', 'pressed', { px: 14 }); UI.micro(g, 'TAP AGAIN · 3 S', ax - 62, y + h - 1, { align: 'center', px: 7.5, col: SK.accentText }); }
  else if (st.busy === id) { UI.button(g, ax - 124, y + (h - 38) / 2, 124, 38, ' ', 'primary', 'disabled'); spinner(g, ax - 62, y + h / 2, 8, st.t || 0.4, SK.accent); }
  else if (price > SUP) { const pw = supChip(g, ax - 64, y + 19, price, 14); void pw; T(g, `Not enough · need ${price - SUP} more`, ax, y + 35, { px: 11.5, col: SK.accentText, align: 'right' }); }
  else UI.button(g, ax - 124, y + (h - 38) / 2, 124, 38, `Unlock · ${price}`, 'secondary', 'normal', { px: 14 });
  UI.divider(g, x, y + h, w);
}
function hub(g, w, h, st = {}) {
  g.drawImage(menuBg(w, h), 0, 0, w, h);
  const sf = safe(w, h); hubHeader(g, sf);
  T(g, 'Unlocks add cards to your shop, not power · District 2: extract from Downtown to unlock', sf.x0 + 4, sf.y0 + 62, { px: 12, col: SK.ink2, maxW: sf.x1 - sf.x0 - 8 });
  tabs(g, sf.x0, sf.y0 + 70, Math.min(330, sf.x1 - sf.x0), 36, ['Unlocks', 'Training', 'Survivor'], st.tab || 0);
  const [fx, fy, fW, fH] = UI.panel(g, sf.x0, sf.y0 + 112, sf.x1 - sf.x0, sf.y1 - sf.y0 - 112, { c: 10 });
  g.save(); g.beginPath(); g.rect(fx, fy, fW, fH); g.clip();
  if (st.tab === 1) training(g, fx + 8, fy + 6, fW - 22, fH, sf, st);
  else {
    let y = fy + 4 - (st.scroll || 0);
    for (const [sec, rows] of UNL) { UI.micro(g, sec, fx + 10, y + 12, { col: SK.accentText, px: 9 }); UI.divider(g, fx + 8 + tw(g, sec, 9, 600, 1.4) + 8, y + 9, fW - 30 - tw(g, sec, 9, 600, 1.4), true); y += 16; for (const r of rows) { unlockRow(g, fx + 8, y, fW - 22, 44, r, { ...st, sm: sf.sm }); y += 46; } y += 4; }
  }
  g.restore();
  UI.scroll(g, fx + fW - 6, fy + 8, fH - 16, (st.scroll || 0) / 300, 0.45);
}
// ---------- 2 · Training (TR1) ----------
const BOOSTS = [['Max HP', 'More health for the whole run', 3, (l) => `+${2 * l} % max HP`, 200], ['Damage', 'Your weapons hit a little harder', 5, (l) => `+${l} % damage`, 0], ['Start money', 'More cash in the first build phase', 0, (l) => `+$${10 * l} at the start`, 50], ['Reload', 'Reload a little faster', 1, (l) => `${l} % faster reload`, 100, 'confirm']];
function training(g, x, y, w, H, sf, st) {
  T(g, 'Small boosts, capped. They always apply in full.', x + 2, y + 14, { px: 12, col: SK.ink2 });
  let yy = y + 22;
  for (const [name, line, lv, f, cost, flag] of BOOSTS) {
    const h = 48, nw = sf.sm ? 96 : 150;
    T(g, name, x + 2, yy + 19, { px: 15, wt: 600 }); T(g, line, x + 2, yy + 35, { px: 11.5, col: SK.mute, maxW: nw });
    const px0 = x + nw + 8; for (let i = 0; i < 5; i++) { UI.bar(g, px0 + i * 13, yy + 19, 11, 9, i < lv ? 1 : 0); }
    const nx = px0 + 72, ax = x + w;
    T(g, lv ? `Now: ${f(lv)}` : 'Now: nothing yet', nx, yy + 19, { px: 13.5, wt: 600, maxW: ax - nx - 90 });
    if (lv < 5) { const s = `Next: ${f(lv + 1)} · `; T(g, s, nx, yy + 35, { px: 12, col: SK.mute, maxW: ax - nx - 120 }); const sw = Math.min(tw(g, s, 12, 500), ax - nx - 120); supChip(g, nx + sw, yy + 35, cost, 12); } else T(g, 'Maxed', nx, yy + 35, { px: 12, col: SK.mute });
    if (lv >= 5) UI.tag(g, ax - 64, yy + 16, 'Maxed', 'accent', { px: 11, h: 18 });
    else if (flag === 'confirm') UI.button(g, ax - 108, yy + 5, 108, 38, `Confirm ${cost}`, 'primary', 'pressed', { px: 13 });
    else UI.button(g, ax - 84, yy + 5, 84, 38, 'Train', 'secondary', 'normal', { px: 14 });
    UI.divider(g, x, yy + h, w); yy += h + 2;
  }
}
// ---------- 3 · shop with the BT2 borrowed strip ----------
const CARDS = [['shotgun', 'Shotgun', 150, 'Dmg 8 × 6 · close', 'WPN'], ['body_armor_2', 'Body armor II', 260, '+40 max HP', 'GEAR'], ['smg', 'SMG', 120, 'Dmg 9 · 11 / s', 'WPN'], ['grenade_launcher', 'Grenade Launcher', 330, 'Blast 2.5 m', 'WPN', 0], ['running_shoes', 'Running shoes', 90, '+12 % speed', 'GEAR'], ['chainsaw', 'Chainsaw', 280, 'Dmg 60 / s · reach 1.2 m', 'WPN', 2]];
function shopCard(g, x, y, w, h, c, i, sel) {
  const [id, name, price, stat, cat, from] = c, kind = cat === 'GEAR' ? 'g' : 'w';
  const p = () => UI.shape(g, x, y, w, h, 6);
  castShadow(g, p, { blur: 6, a: 0.6, dx: 1.5, dy: 3 });
  const gr = g.createLinearGradient(x, y, x + w * 0.3, y + h); gr.addColorStop(0, '#2c3138'); gr.addColorStop(1, '#16191d'); g.fillStyle = gr; p(); g.fill();
  g.save(); p(); g.clip(); texture(g, TEX.grain, x, y, w, h, { op: 'overlay', a: 0.5 });
  const hg = g.createLinearGradient(0, y, 0, y + 15); hg.addColorStop(0, cat === 'GEAR' ? '#9fb3c6' : '#e9edf1'); hg.addColorStop(1, cat === 'GEAR' ? '#6c8094' : '#b7c0ca'); g.fillStyle = hg; g.fillRect(x, y, w, 15);
  text(g, `#0${i + 1}`, x + 6, y + 11, { px: 9.5, wt: 700, col: '#111418', shadow: false }); text(g, cat, x + w - 6, y + 11, { px: 9.5, wt: 700, ls: 1, col: '#111418', align: 'right', shadow: false });
  bloom(g, x + w / 2, y + 36, w * 0.4, 'rgba(255,180,90,0.12)');
  icon(g, id, kind, x + 8, y + 19, w - 16, 30);
  g.restore();
  T(g, name, x + 6, y + 64, { px: 13, wt: 600, maxW: w - 10 });
  UI.tnum(g, sel ? '' : '$' + price, x + 6, y + 80, 14, { wt: 600, col: SK.accentText, skew: 0 });
  if (sel) T(g, `Buy for $${price}`, x + 6, y + 80, { px: 13, wt: 700, col: SK.accentText });
  if (from != null) { // BT2: the dark "From Mo" strip at the foot, with the slot chip
    const sy = y + h - 18; g.fillStyle = 'rgba(0,0,0,0.75)'; g.save(); p(); g.clip(); g.fillRect(x, sy, w, 18); g.restore();
    UI.slotChip(g, x + 6, sy + 4, 10, 10, from); T(g, `From ${['Mo', 'Ana', 'Kit', 'Lu'][from]}`, x + 21, sy + 13, { px: 12, wt: 600 });
  } else T(g, stat, x + 6, y + h - 6, { px: 11, col: SK.mute, maxW: w - 10 });
  g.strokeStyle = sel ? SK.accent : SK.line2; g.lineWidth = sel ? 1.6 : 1; if (sel) neon(g, () => { p(); g.stroke(); }, SK.accentGlow, 8); else { p(); g.stroke(); }
}
function shop(g, w, h) {
  g.drawImage(dawn(w, h, 'dw1', { dim: 0.6, blur: 3 }), 0, 0, w, h);
  const sf = safe(w, h), [fx, fy, fW, fH] = UI.panel(g, sf.x0, sf.y0, sf.x1 - sf.x0, sf.y1 - sf.y0);
  UI.header(g, fx, fy, fW, 38, 'SHOP', { caption: 'BUILD PHASE · WAVE 6' });
  UI.tnum(g, '$340', fx + 70, fy + 31, 18, { wt: 600, col: SK.accentText, skew: 0 });
  UI.button(g, fx + fW - (sf.sm ? 160 : 190), fy + 4, sf.sm ? 92 : 110, 30, 'Reroll $20', 'secondary', 'normal', { px: 12 });
  UI.button(g, fx + fW - (sf.sm ? 64 : 76), fy + 4, sf.sm ? 60 : 70, 30, 'Close', 'tertiary', 'normal', { px: 12 });
  const gx = fx + 8, gy = fy + 46, gw = sf.sm ? 264 : 450, cw = (gw - 12) / 3, ch = (fH - 54 - 6) / 2;
  CARDS.forEach((c, i) => shopCard(g, gx + (i % 3) * (cw + 6), gy + Math.floor(i / 3) * (ch + 6), cw, ch, c, i, i === 3));
  const rx = gx + gw + 10, rw = fx + fW - rx - 8;
  wrap(g, 'Grenade Launcher: borrowed from Mo · Blast 2.5 m', rw, 12.5, 500).forEach((ln, i) => T(g, ln, rx, gy + 12 + i * 15, { px: 12.5, col: SK.accentText }));
  UI.micro(g, 'CONSUMABLES', rx, gy + 54, { col: SK.mute });
  [['medkit', 'Medkit ×1', 60], ['grenades', 'Grenades ×2', 80]].forEach(([id, n, p], i) => { const yy = gy + 60 + i * 50; UI.button(g, rx, yy, rw, 44, ' ', 'secondary', 'normal'); icon(g, id, 'c', rx + 6, yy + 6, 32, 32); T(g, n, rx + 44, yy + 19, { px: 13, wt: 600, maxW: rw - 48 }); UI.tnum(g, '$' + p, rx + 44, yy + 36, 13, { wt: 600, col: SK.accentText, skew: 0 }); });
  wrap(g, "1 card of 6 can come from a teammate's unlocks you don't have yet.", rw, 11.5, 500).slice(0, 3).forEach((ln, i) => T(g, ln, rx, gy + 172 + i * 14, { px: 11.5, col: SK.mute }));
}
// ---------- 4 · accounts (AC2) ----------
function accStart(g, w, h, st = {}) {
  g.drawImage(menuBg(w, h), 0, 0, w, h);
  const sf = safe(w, h), pw = sf.sm ? 300 : 340, px = (w - pw) / 2;
  const [fx, fy, fW] = UI.panel(g, px, sf.y0 + 2, pw, sf.y1 - sf.y0 - 4, { c: 12 });
  text(g, 'HORDES', fx + fW / 2, fy + 34, { px: 30, wt: 700, ls: 6, align: 'center', shadow: false, fill: goldFill(g, fy + 34, 22), col: SK.ink });
  UI.divider(g, fx + 30, fy + 44, fW - 60, true);
  const x0 = fx + 14, iw = fW - 28;
  field(g, x0, fy + 64, iw - 128, 40, 'Your name', 'Mo', 'normal');
  UI.button(g, x0 + iw - 120, fy + 62, 120, 44, 'Create game', 'primary', 'normal', { px: 14 });
  const ac = st.logged ? 'Logged in as mo_42 ·' : 'Playing as a guest ·';
  T(g, ac, fx + fW / 2 - 40, fy + 126, { px: 12.5, col: SK.ink2, align: 'right' });
  UI.button(g, fx + fW / 2 - 36, fy + 112, st.logged ? 64 : 120, 22, st.logged ? 'Log out' : 'Save my progress', 'tertiary', 'normal', { px: 11 });
  if (!st.logged) UI.button(g, fx + fW / 2 + 94, fy + 112, 54, 22, 'Log in', 'tertiary', 'normal', { px: 11 });
  UI.micro(g, 'OR JOIN WITH A CODE', fx + fW / 2, fy + 152, { align: 'center' });
  field(g, x0 + 40, fy + 160, 110, 40, '', '', 'normal', { mono: true, placeholder: 'CODE' });
  UI.button(g, x0 + 158, fy + 158, 92, 44, 'Join', 'secondary', 'normal', { px: 14 });
  UI.button(g, x0, fy + 214, iw / 2 - 4, 40, 'Practice solo', 'secondary', 'normal', { px: 13 });
  UI.button(g, x0 + iw / 2 + 4, fy + 214, iw / 2 - 4, 40, 'Progress', 'secondary', 'normal', { px: 13 });
}
function accForm(g, w, h, mode) {
  g.drawImage(menuBg(w, h), 0, 0, w, h);
  const sf = safe(w, h), kh = sf.sm ? 140 : 150;
  const [fx, fy, fW] = UI.panel(g, sf.x0, 4, sf.x1 - sf.x0, h - kh - 8, { c: 10 });
  backKey(g, fx + 4, fy + 4);
  const title = mode === 'save' ? 'SAVE MY PROGRESS' : mode === 'login' ? 'LOG IN' : 'FORGOT PASSWORD';
  text(g, title, fx + 58, fy + 29, { px: 18, wt: 700, ls: 2, col: SK.ink, shadow: false });
  if (mode === 'login') UI.button(g, fx + fW - 150, fy + 6, 146, 30, 'Forgot password?', 'tertiary', 'normal', { px: 11.5 });
  const y = fy + 64, bw = 92, gap = 8, fw = (fW - 20 - bw - gap * 2) / 2;
  if (mode === 'forgot') { field(g, fx + 8, y, fw, 40, 'Username', 'mo_42'); field(g, fx + 8 + fw + gap, y, fw, 40, 'Recovery code', 'ABCD-EFGH-JK', 'focus', { mono: true }); UI.button(g, fx + fW - 8 - bw, y - 2, bw, 44, 'Next', 'primary', 'disabled', { px: 14 }); }
  else {
    field(g, fx + 8, y, fw, 40, 'Username', 'mo_42', mode === 'save' ? 'focus' : 'normal');
    field(g, fx + 8 + fw + gap, y, fw, 40, 'Password', mode === 'login' ? '••••••••' : '', mode === 'login' ? 'error' : 'normal');
    UI.button(g, fx + fW - 8 - bw, y - 2, bw, 44, mode === 'save' ? 'Save' : 'Log in', 'primary', 'normal', { px: 14 });
    T(g, mode === 'save' ? '3–20 letters, numbers, _ - . · password 8 or more · works on any phone' : 'Wrong username or password', fx + 10, y + 58, { px: 12, col: mode === 'login' ? '#ff6b6b' : SK.mute, maxW: fW - 20 });
  }
  keyboard(g, w, h, kh);
}
function accModal(g, w, h, kind) {
  accStart(g, w, h, { logged: kind === 'logout' }); g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, w, h);
  const pw = kind === 'code' ? 330 : 280, ph = kind === 'code' ? 170 : 130, px = (w - pw) / 2, py = (h - ph) / 2 - 6;
  const [fx, fy, fW, fH] = UI.panel(g, px, py, pw, ph, { fw: SK.fw + 2, c: 12 });
  if (kind === 'code') {
    UI.header(g, fx, fy, fW, 30, 'RECOVERY CODE · KEEP IT', { px: 14 });
    const cy = fy + 44, p = () => UI.shape(g, fx + 14, cy, fW - 28, 40, 5); g.fillStyle = 'rgba(0,0,0,0.6)'; p(); g.fill(); g.setLineDash([4, 3]); g.strokeStyle = SK.accent; g.lineWidth = 1.2; p(); g.stroke(); g.setLineDash([]);
    UI.tnum(g, 'ABCD-EFGH-JKMN', fx + fW / 2, cy + 28, 22, { align: 'center', wt: 700, col: SK.ink, skew: 0, cell: 0.62 });
    wrap(g, "Screenshot this: it's the only way back in if you forget your password.", fW - 28, 12, 500).forEach((ln, i) => T(g, ln, fx + 14, cy + 58 + i * 14, { px: 12, col: SK.ink2 }));
    UI.button(g, fx + fW - 196, fy + fH - 40, 84, 34, 'Copy', 'secondary', 'normal', { px: 13 }); UI.button(g, fx + fW - 104, fy + fH - 40, 92, 34, 'I saved it', 'primary', 'normal', { px: 13 });
  } else {
    UI.header(g, fx, fy, fW, 30, 'LOG OUT?', { px: 15 });
    wrap(g, 'This phone will play as a new guest. Your account is safe.', fW - 24, 12.5, 500).forEach((ln, i) => T(g, ln, fx + 12, fy + 50 + i * 15, { px: 12.5, col: SK.ink2 }));
    UI.button(g, fx + fW - 196, fH + fy - 44, 90, 38, 'Cancel', 'tertiary', 'normal', { px: 13 }); UI.button(g, fx + fW - 100, fH + fy - 44, 90, 38, 'Log out', 'primary', 'normal', { px: 13 });
  }
}
// ---------- 5 + 6 · lobby: DP2 district line + SC1 slot rows ----------
const SLOTS = [['Mo', 'mo', 'Host', true], ['Ana', 'ana', 'You', false], ['Kit', 'kit', null, true], null];
function slotRow(g, x, y, w, h, s, i, st = 'normal') {
  const p = () => UI.shape(g, x, y, w, h, 5);
  if (!s) { g.setLineDash([3, 3]); g.strokeStyle = SK.line2; g.lineWidth = 1; rrect(g, x + 6, y + 4, h - 8, h - 8, 4); g.stroke(); g.setLineDash([]); T(g, 'Open', x + h + 6, y + h / 2 + 5, { px: 14, col: SK.mute }); g.strokeStyle = 'rgba(255,255,255,0.06)'; p(); g.stroke(); return; }
  const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, s[2] === 'You' ? SK.selA : 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(255,255,255,0.015)'); g.fillStyle = gr; p(); g.fill();
  g.strokeStyle = SK.line; g.lineWidth = 1; p(); g.stroke();
  portrait(g, s[1], x + 4, y + 3, h - 6, i);
  UI.slotChip(g, x + h + 2, y + h / 2 - 8, 12, 16, i);
  T(g, s[0], x + h + 20, y + h / 2 + 5, { px: 15, wt: 600 });
  let rx = x + w - 8;
  const rd = s[3] ? 'READY' : 'NOT READY';
  if (s[3]) { g.strokeStyle = '#e9edf1'; g.lineWidth = 2; g.beginPath(); g.moveTo(rx - tw(g, rd, 12, 700, 1) - 16, y + h / 2); g.lineTo(rx - tw(g, rd, 12, 700, 1) - 12, y + h / 2 + 4); g.lineTo(rx - tw(g, rd, 12, 700, 1) - 5, y + h / 2 - 4); g.stroke(); }
  text(g, rd, rx, y + h / 2 + 4.5, { px: 12, wt: 700, ls: 1, col: s[3] ? '#e9edf1' : SK.mute, align: 'right', shadow: false });
  rx -= tw(g, rd, 12, 700, 1) + (s[3] ? 24 : 10);
  if (s[2]) { const tw1 = tw(g, s[2].toUpperCase(), 10, 700, 1.2) + 14; UI.tag(g, rx - tw1, y + h / 2 - 8, s[2], s[2] === 'You' ? 'accent' : 'steel'); }
}
function districtThumb(g, x, y, w, h, locked = false) {
  const im = cached('lob-dt', () => G7.render({ stage: 3, ppm: 10 * DPR, x0: 12, y0: 8, w: 12, h: 8, power: 'on' }));
  g.save(); UI.shape(g, x, y, w, h, 4); g.clip(); g.drawImage(im, x, y, w, h); if (locked) { g.fillStyle = 'rgba(8,12,20,0.6)'; g.fillRect(x, y, w, h); } g.restore();
  g.strokeStyle = SK.line2; g.lineWidth = 1; UI.shape(g, x, y, w, h, 4); g.stroke();
}
function lobby(g, w, h, st = {}) {
  g.drawImage(menuBg(w, h), 0, 0, w, h);
  const sf = safe(w, h), lw = sf.sm ? 176 : 270;
  const [lx, ly, lW] = UI.panel(g, sf.x0, sf.y0, lw, sf.y1 - sf.y0, { c: 10 });
  UI.micro(g, 'GAME CODE', lx + lW / 2, ly + 18, { align: 'center', px: 9.5 });
  UI.tnum(g, 'QXRT', lx + lW / 2, ly + 60, 42, { align: 'center', wt: 700, fill: SK.numFill, glow: SK.numGlow, skew: 0, cell: 0.8 });
  T(g, 'hordes.sevend.io/j/QXRT', lx + lW / 2, ly + 80, { px: 12, col: SK.ink2, align: 'center' });
  const bw = (lW - 30) / 2; UI.button(g, lx + 10, ly + 92, bw, 40, 'Copy', 'secondary', 'normal', { px: 13 }); UI.button(g, lx + 20 + bw, ly + 92, bw, 40, 'Share', 'secondary', 'normal', { px: 13 });
  UI.button(g, lx + lW / 2 - 50, ly + 150, 100, 40, 'Leave', 'tertiary', 'normal', { px: 13 });
  const rx = sf.x0 + lw + 10, rw = sf.x1 - rx;
  // DP2: one district line
  const dp = () => UI.shape(g, rx, sf.y0, rw, 44, 6);
  castShadow(g, dp, { blur: 6, a: 0.5, dx: 1, dy: 3 });
  let gr = g.createLinearGradient(0, sf.y0, 0, sf.y0 + 44); gr.addColorStop(0, 'rgba(48,54,62,0.96)'); gr.addColorStop(1, 'rgba(22,25,29,0.96)'); g.fillStyle = gr; dp(); g.fill(); dp(); bevel(g, rx, sf.y0, rw, 44, 0.5, 0.6, 1);
  districtThumb(g, rx + 4, sf.y0 + 4, 54, 36);
  UI.micro(g, 'DISTRICT', rx + 66, sf.y0 + 16, { col: SK.accentText });
  T(g, 'Downtown', rx + 66, sf.y0 + 34, { px: 16, wt: 600 });
  if (st.host) chevron(g, rx + rw - 16, sf.y0 + 22, 12, 1, SK.accentText); else UI.micro(g, 'HOST PICKS', rx + rw - 10, sf.y0 + 26, { align: 'right' });
  const rh = sf.sm ? 36 : 40;
  SLOTS.forEach((s, i) => slotRow(g, rx, sf.y0 + 50 + i * (rh + 4), rw, rh, s, i));
  const by = sf.y1 - 44;
  if (st.host) { UI.button(g, rx + rw - 230, by, 110, 44, 'Not ready', 'secondary', 'normal', { px: 14 }); UI.button(g, rx + rw - 112, by, 112, 44, 'Start', 'primary', 'normal', { px: 15 }); }
  else UI.button(g, rx + rw / 2 - 60, by, 120, 44, 'Ready', 'primary', 'normal', { px: 15 });
  if (st.sheet) {
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(0, 0, w, h);
    const pw = sf.sm ? 400 : 520, ph = 186, px = (w - pw) / 2, py = h - ph - (sf.sm ? 21 : 0);
    const [fx, fy, fW] = UI.panel(g, px, py, pw, ph + 10, { c: 12 });
    UI.header(g, fx, fy, fW, 30, 'PICK THE DISTRICT', { px: 15 });
    const cw = (fW - 32) / 3, cy = fy + 40, chh = 132;
    const cards = [['Downtown', 'Selected', 'sel'], ['District 2', 'Extract from Downtown to unlock', 'lock'], ['Random city', 'Epic 11', 'later']];
    cards.forEach(([n, sub, k], i) => {
      const cx = fx + 8 + i * (cw + 8), p = () => UI.shape(g, cx, cy, cw, chh, 7);
      if (k === 'later') { g.setLineDash([4, 3]); g.strokeStyle = SK.line2; p(); g.stroke(); g.setLineDash([]); }
      else { castShadow(g, p, { blur: 6, a: 0.6, dx: 1, dy: 3 }); g.fillStyle = '#1b1e22'; p(); g.fill(); districtThumb(g, cx + 4, cy + 4, cw - 8, 66, k === 'lock'); }
      if (k === 'lock') { g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(cx + cw / 2, cy + 37, 13, 0, TAU); g.fill(); g.strokeStyle = SK.ink; g.lineWidth = 2; g.beginPath(); g.arc(cx + cw / 2, cy + 34, 4.5, Math.PI, 0); g.stroke(); g.fillStyle = SK.ink; g.fillRect(cx + cw / 2 - 6, cy + 34, 12, 9); }
      T(g, n, cx + 8, cy + (k === 'later' ? 24 : 90), { px: 15, wt: 600, col: k === 'later' ? SK.mute : SK.ink });
      wrap(g, sub, cw - 16, 12, 500).slice(0, 2).forEach((ln, j) => T(g, ln, cx + 8, cy + (k === 'later' ? 40 : 106) + j * 14, { px: 12, col: k === 'sel' ? SK.accentText : SK.mute }));
      if (k === 'sel') { g.strokeStyle = SK.accent; g.lineWidth = 1.6; neon(g, () => { p(); g.stroke(); }, SK.accentGlow, 8); }
    });
  }
}
// ---------- 7 · survivor editor (ED1 + LK2 + LS1) ----------
const ED_TABS = ['Top', 'Head', 'Hair', 'Pack', 'Skin'];
const HOWTO = { riot: 'Extract from Downtown once', gas: 'Kill the Behemoth', fire: 'Survive wave 5', hockey: 'Reach endless wave 15' };
function edTile(g, x, y, s, part, state) {
  const p = () => UI.shape(g, x, y, s, s, 5);
  const gr = g.createRadialGradient(x + s * 0.45, y + s * 0.4, 0, x + s / 2, y + s / 2, s * 0.75); gr.addColorStop(0, '#3a4048'); gr.addColorStop(1, '#16191d');
  g.fillStyle = gr; p(); g.fill();
  g.save(); p(); g.clip();
  if (state === 'loot') { g.drawImage(itemArt(part.slot, part.id, s, 'sil'), x, y, s, s); text(g, '?', x + s - 7, y + 14, { px: 14, wt: 700, col: SK.mute, align: 'center', shadow: false }); }
  else { g.drawImage(relitItem(part.slot, part.id, s), x, y, s, s); if (state === 'locked') { g.fillStyle = 'rgba(10,11,13,0.55)'; g.fillRect(x, y, s, s); } }
  g.restore();
  if (state === 'locked') { g.fillStyle = 'rgba(8,9,11,0.85)'; g.beginPath(); g.arc(x + s / 2, y + s / 2, 11, 0, TAU); g.fill(); g.strokeStyle = SK.ink; g.lineWidth = 1.8; g.beginPath(); g.arc(x + s / 2, y + s / 2 - 2, 3.6, Math.PI, 0); g.stroke(); g.fillStyle = SK.ink; g.fillRect(x + s / 2 - 5, y + s / 2 - 2, 10, 7); }
  g.strokeStyle = state === 'sel' ? SK.accent : SK.line2; g.lineWidth = state === 'sel' ? 2 : 1; if (state === 'sel') neon(g, () => { p(); g.stroke(); }, SK.accentGlow, 6); else { p(); g.stroke(); }
}
function editor(g, w, h, st = {}) {
  g.drawImage(menuBg(w, h), 0, 0, w, h);
  const sf = safe(w, h), lw = sf.sm ? 170 : 300;
  const [lx, ly, lW, lH] = UI.panel(g, sf.x0, sf.y0, lw, sf.y1 - sf.y0, { c: 10 });
  backKey(g, lx + 4, ly + 4);
  const look = { ...LOOKS.mo, head: st.tab === 1 ? 'gas' : 'none', top: 'camo', colours: { ...G7.DEFAULT_LOOK.colours, top: '#5d6b3a' } };
  const ps = sf.sm ? lW - 12 : lW - 16, pY = ly + 46, pH = sf.sm ? 128 : 186;
  g.save(); UI.shape(g, lx + 6, pY, ps, pH, 6); g.clip(); asphaltBg(g, lx + 6, pY, ps, pH);
  ringAt(g, lx + 6 + ps / 2, pY + pH / 2, pH * 0.3, SLOT[1]); survivorAt(g, look, lx + 6 + ps / 2, pY + pH / 2, pH * 0.24, -Math.PI / 2 - 0.5); g.restore();
  g.strokeStyle = SK.line2; g.lineWidth = 1; UI.shape(g, lx + 6, pY, ps, pH, 6); g.stroke();
  UI.micro(g, 'CHOSEN', lx + lW - 64, ly + 18, { align: 'right', px: 8 }); UI.micro(g, 'IN GAME', lx + lW - 8, ly + 18, { align: 'right', px: 8 });
  for (const [sx, c] of [[lx + lW - 60, '#5d6b3a'], [lx + lW - 12 - 1, '#46502c']]) { g.fillStyle = c; rrect(g, sx - 2, ly + 24, 12, 12, 2); g.fill(); g.strokeStyle = SK.line2; g.stroke(); }
  // game-size preview
  const gy = pY + pH + 6, gh = lH - (gy - ly) - 6;
  g.save(); UI.shape(g, lx + 6, gy, ps, gh, 6); g.clip(); asphaltBg(g, lx + 6, gy, ps, gh);
  [[0.5, 0.5, 1, 'mo'], [0.3, 0.6, 0, 'ana'], [0.68, 0.38, 2, 'kit']].forEach(([fx2, fy2, sl, lk]) => { ringAt(g, lx + 6 + ps * fx2, gy + gh * fy2, 9, SLOT[sl]); survivorAt(g, lk === 'mo' ? look : LOOKS[lk], lx + 6 + ps * fx2, gy + gh * fy2, 7, -Math.PI / 2); });
  g.restore(); g.strokeStyle = SK.line2; UI.shape(g, lx + 6, gy, ps, gh, 6); g.stroke();
  // right column
  const rx = sf.x0 + lw + 10, rw = sf.x1 - rx;
  tabs(g, rx, sf.y0, rw, 36, ED_TABS, st.tab);
  const [fx, fy, fW, fH] = UI.panel(g, rx, sf.y0 + 42, rw, sf.y1 - sf.y0 - 42, { c: 10 });
  const ts = sf.sm ? 50 : 58, gap = 6, cols = Math.floor((fW - 12) / (ts + gap));
  let parts = G7.COSMETICS.parts.filter((p) => p.slot === (st.tab === 1 ? 'head' : 'top')).slice(0, cols * 2);
  if (st.tab === 1 && !parts.some((p) => p.id === 'gas')) parts[Math.min(parts.length - 1, 5)] = G7.COSMETICS.parts.find((p) => p.slot === 'head' && p.id === 'gas');
  parts.forEach((p, i) => {
    const owned = p.unlock === 'starter' || p.id === 'riot' || p.id === 'cone' || p.id === 'camo';
    const state = (st.tab === 1 ? p.id === 'gas' : p.id === 'camo') ? 'sel' : owned ? 'own' : p.unlock === 'loot' ? 'loot' : 'locked';
    edTile(g, fx + 6 + (i % cols) * (ts + gap), fy + 6 + Math.floor(i / cols) * (ts + gap), ts, p, state === 'sel' && st.tab === 1 ? 'locked' : state);
    if (st.tab === 1 && p.id === 'gas') { const x2 = fx + 6 + (i % cols) * (ts + gap), y2 = fy + 6 + Math.floor(i / cols) * (ts + gap); g.strokeStyle = SK.accent; g.lineWidth = 2; neon(g, () => { UI.shape(g, x2, y2, ts, ts, 5); g.stroke(); }, SK.accentGlow, 6); }
  });
  const iy = fy + 6 + 2 * (ts + gap) + 4;
  if (st.tab === 1) { g.fillStyle = SK.accentText; g.beginPath(); g.arc(fx + 12, iy + 4, 3.2, Math.PI, 0); g.strokeStyle = SK.accentText; g.lineWidth = 1.6; g.stroke(); g.fillRect(fx + 7, iy + 4, 10, 8); }
  T(g, st.tab === 1 ? 'Gas mask: Kill the Behemoth' : 'Camo coat', fx + (st.tab === 1 ? 24 : 8), iy + 12, { px: 13, wt: 600, col: st.tab === 1 ? SK.accentText : SK.ink });
  const cy = iy + 22;
  T(g, st.tab === 1 ? 'Hat & bag colour' : 'Top colour', fx + 8, cy + 18, { px: 12.5, col: SK.ink2 });
  const sx0 = fx + 8 + tw(g, 'Hat & bag colour', 12.5, 500) + 10;
  const rg = g.createConicGradient(0, sx0 + 13, cy + 13); ['#ff3b30', '#ffcc00', '#34c759', '#00c7be', '#007aff', '#af52de', '#ff3b30'].forEach((c, i) => rg.addColorStop(i / 6, c));
  g.fillStyle = rg; g.beginPath(); g.arc(sx0 + 13, cy + 13, 12, 0, TAU); g.fill();
  ['#3c5670', '#2f6a5a', '#5d6b3a', '#7a3b6e', '#c46a2a', '#d8d2c4', '#231f1c'].slice(0, sf.sm ? 3 : 7).forEach((c, i) => { const x2 = sx0 + 32 + i * 28; g.fillStyle = c; g.beginPath(); g.arc(x2 + 12, cy + 13, 11, 0, TAU); g.fill(); g.strokeStyle = i === 2 ? SK.accent : 'rgba(0,0,0,0.7)'; g.lineWidth = i === 2 ? 2 : 1.2; g.stroke(); });
  UI.button(g, fx + fW - 210, fy + fH - 48, 110, 44, 'Random', 'secondary', 'normal', { px: 14 });
  UI.button(g, fx + fW - 94, fy + fH - 48, 88, 44, 'Done', 'primary', 'normal', { px: 15 });
}
function asphaltBg(g, x, y, w, h) { g.fillStyle = '#1c1e21'; g.fillRect(x, y, w, h); texture(g, TEX.grain, x, y, w, h, { op: 'overlay', a: 0.8, scale: 0.6 }); texture(g, TEX.fbm, x, y, w, h, { op: 'soft-light', a: 0.6 }); const gr = g.createRadialGradient(x + w * 0.35, y + h * 0.3, 0, x + w / 2, y + h / 2, w); gr.addColorStop(0, 'rgba(140,170,200,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = gr; g.fillRect(x, y, w, h); }
function ringAt(g, x, y, r, col) { g.save(); g.strokeStyle = col; g.lineWidth = Math.max(1.5, r * 0.16); g.globalAlpha = 0.9; g.beginPath(); g.arc(x, y, r, 0, TAU); g.stroke(); g.restore(); }
// ---------- 8 · loot bag in play (LB2 + OA2 + BF2): white = pick-ups, the theme accent is NOT used in play ----------
function world(g, w, h, mode) {
  const im = cached(`lb-world-${w}-${h}`, () => G7.render({ stage: 3, ppm: 35 * DPR, x0: 14, y0: 11, w: w / 35, h: h / 35, power: 'on' }));
  g.drawImage(im, 0, 0, w, h);
  g.fillStyle = mode === 'dark' ? 'rgba(2,3,8,0.78)' : 'rgba(6,9,16,0.35)'; g.fillRect(0, 0, w, h);
  if (mode === 'rain') { g.strokeStyle = 'rgba(200,215,235,0.18)'; g.lineWidth = 1; const r = rng(4); for (let i = 0; i < 140; i++) { const x = r() * w, y = r() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x - 3, y + 10); g.stroke(); } }
  [[0.42, 0.42, 0, 'mo'], [0.3, 0.62, 1, 'ana'], [0.6, 0.66, 2, 'kit']].forEach(([fx, fy, sl, lk]) => { ringAt(g, w * fx, h * fy, 14, SLOT[sl]); survivorAt(g, LOOKS[lk], w * fx, h * fy, 11, -Math.PI / 2 - 0.4); });
}
function bag(g, x, y, s, p = 0.6) {
  g.save(); g.translate(x, y);
  const sack = () => { g.beginPath(); g.moveTo(-s * 0.3, -s * 0.18); g.quadraticCurveTo(0, -s * 0.34, s * 0.3, -s * 0.18); g.lineTo(s * 0.42, s * 0.3); g.quadraticCurveTo(0, s * 0.48, -s * 0.42, s * 0.3); g.closePath(); };
  g.fillStyle = 'rgba(0,0,0,0.5)'; g.save(); g.translate(s * 0.08, s * 0.1); sack(); g.fill(); g.restore();
  const gr = g.createLinearGradient(-s * 0.4, -s * 0.3, s * 0.4, s * 0.4); gr.addColorStop(0, '#6a715f'); gr.addColorStop(0.5, '#4c5246'); gr.addColorStop(1, '#2c3029'); g.fillStyle = gr; sack(); g.fill();
  g.save(); sack(); g.shadowColor = '#fff'; g.shadowBlur = s * (0.15 + 0.25 * p); g.strokeStyle = `rgba(255,255,255,${0.5 + 0.45 * p})`; g.lineWidth = s * 0.06; g.stroke(); g.restore();
  g.strokeStyle = '#2a2d26'; g.lineWidth = s * 0.06; g.beginPath(); g.moveTo(-s * 0.22, -s * 0.2); g.quadraticCurveTo(0, -s * 0.05, s * 0.22, -s * 0.2); g.stroke();
  g.restore();
}
function oa2(g, x, y, ang, frac) {
  // the off-screen bag badge, built like a Lumen plate but white (pick-up) instead of the theme accent
  const r = 17;
  g.save(); g.translate(x, y);
  castShadow(g, () => { g.beginPath(); g.arc(0, 0, r, 0, TAU); }, { blur: 5, a: 0.7, dx: 1, dy: 2 });
  const gr = g.createLinearGradient(-r, -r, r, r); gr.addColorStop(0, '#3a4048'); gr.addColorStop(1, '#121417'); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, r - 1.5, 0, TAU); g.stroke();
  g.strokeStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 6; g.beginPath(); g.arc(0, 0, r - 1.5, -Math.PI / 2, -Math.PI / 2 + TAU * frac); g.stroke(); g.shadowBlur = 0;
  g.rotate(ang); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(r + 9, 0); g.lineTo(r + 2, -6); g.lineTo(r + 2, 6); g.closePath(); g.fill(); g.rotate(-ang);
  bag(g, 0, 1, 20, 0.7);
  g.restore();
}
function bf2(g, w, y, who) {
  const s = who == null ? 'BAG FOUND!' : ' found a bag!', name = who == null ? '' : ['Mo', 'Ana', 'Kit', 'Lu'][who];
  const tw0 = tw(g, s, 15, 700, 1) + tw(g, name, 15, 700, 1) + (who == null ? 0 : 18) + 44, x = (w - tw0) / 2;
  const p = () => chamfer(g, x, y, tw0, 32, [8, 0, 8, 0]);
  castShadow(g, p, { blur: 8, a: 0.6, dx: 1, dy: 3 });
  const gr = g.createLinearGradient(0, y, 0, y + 32); gr.addColorStop(0, 'rgba(46,50,56,0.95)'); gr.addColorStop(1, 'rgba(16,18,21,0.95)'); g.fillStyle = gr; p(); g.fill(); p(); bevel(g, x, y, tw0, 32, 0.5, 0.6, 1);
  g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1; g.shadowColor = '#fff'; g.shadowBlur = 6; p(); g.stroke(); g.shadowBlur = 0;
  bag(g, x + 18, y + 16, 18, 0.8);
  let tx = x + 34;
  if (who != null) { UI.slotChip(g, tx, y + 8, 12, 16, who); tx += 17; text(g, name, tx, y + 21.5, { px: 15, wt: 700, col: SLOT[who], shadow: true }); tx += tw(g, name, 15, 700); }
  text(g, s, tx, y + 21.5, { px: 15, wt: 700, ls: 1, col: '#ffffff', shadow: true });
}
function lootFrame(g, w, h, mode, o = {}) {
  world(g, w, h, mode);
  if (o.bagAt) bag(g, w * o.bagAt[0], h * o.bagAt[1], 22, 0.7);
  if (o.arrow) { const sf = safe(w, h); oa2(g, o.arrow === 'right' ? sf.x1 - 24 : sf.x0 + 24, h * 0.55, o.arrow === 'right' ? 0 : Math.PI, 0.62); }
  if (o.toast !== undefined) bf2(g, w, 40, o.toast);
}

// ---------- Results refreshed with the slot fix ----------
function results(g, w, h, state) { LF.render(g, w, h, state, 0, {}); }

const SCREENS = [
  { id: 'hub', title: 'Progress hub + Unlocks', code: 'PH1', note: 'Header (back key, Supplies, account row), tabs built for three, one long list: icon, name, one plain line, action. States: Confirm (pressed, 3 s), Not enough (with how many more), Unlocked / Starter, a placeholder silhouette, and Unlocking… (spinner).', frames: [[568, 320, (g, w, h) => hub(g, w, h), '568 × 320 · Unlocks'], [800, 360, (g, w, h) => hub(g, w, h), '800 × 360'], [568, 320, (g, w, h) => hub(g, w, h, { scroll: 250, busy: 'spike_trap', t: 1.2 }), '568 · scrolled to Buildings, Unlocking… state']] },
  { id: 'training', title: 'Training tab (+ Results line)', code: 'TR1 + TL1', note: 'Same row shape as Unlocks: name and line, 5 pips (Lumen fill bars), Now / Next in words with the Supplies cost, Train · Confirm (pressed) · Maxed. The TL1 line under each player is on the Results frames below.', frames: [[568, 320, (g, w, h) => hub(g, w, h, { tab: 1 }), '568 × 320'], [800, 360, (g, w, h) => hub(g, w, h, { tab: 1 }), '800 × 360']] },
  { id: 'shop', title: 'Borrowed tag on shop cards', code: 'BT2', note: 'The card\'s last line becomes a dark strip with the teammate\'s slot chip and "From Mo"; the full "borrowed from Mo" is in the selected-card message. Shown on shop cards redrawn in Lumen (the shop itself is the 5.13 screen).', frames: [[568, 320, (g, w, h) => shop(g, w, h), '568 × 320 · card #04 selected'], [800, 360, (g, w, h) => shop(g, w, h), '800 × 360']] },
  { id: 'accounts', title: 'Account screens', code: 'AC2', note: 'Start screen with the account line under the name field; side-by-side fields above the keyboard; focus (accent outline + caret), error (red is allowed in menus), disabled; recovery code and log-out modals.', frames: [[568, 320, (g, w, h) => accStart(g, w, h), '568 · start, guest'], [568, 320, (g, w, h) => accForm(g, w, h, 'save'), '568 · Save my progress (focus)'], [568, 320, (g, w, h) => accForm(g, w, h, 'login'), '568 · Log in, wrong password (error)'], [568, 320, (g, w, h) => accModal(g, w, h, 'code'), '568 · recovery code modal'], [800, 360, (g, w, h) => accForm(g, w, h, 'forgot'), '800 · Forgot password (Next disabled)'], [568, 320, (g, w, h) => accModal(g, w, h, 'logout'), '568 · log out?']] },
  { id: 'lobby', title: 'Lobby district picker', code: 'DP2', note: 'One 44 px "District" line with its picture; the host taps it to open the sheet (Downtown selected, District 2 locked, Random city reserved); a teammate sees "host picks" and no arrow.', frames: [[568, 320, (g, w, h) => lobby(g, w, h, { host: true }), '568 · host'], [568, 320, (g, w, h) => lobby(g, w, h, {}), '568 · teammate'], [568, 320, (g, w, h) => lobby(g, w, h, { host: true, sheet: true }), '568 · host tapped the line'], [800, 360, (g, w, h) => lobby(g, w, h, { host: true }), '800 · host']] },
  { id: 'slots', title: 'Lobby slot card', code: 'SC1', note: 'Survivor close-up on asphalt with its slot ring, the slot chip with the player number, name, Host / You tags, Ready (white check) / Not ready; Open slots are a dashed square. Rows stay one line.', frames: [[300, 190, (g, w, h) => { g.drawImage(menuBg(w, h), 0, 0, w, h); SLOTS.forEach((s, i) => slotRow(g, 10, 10 + i * 44, w - 20, 40, s, i)); }, 'slot rows (shown at 2×)', 2], [800, 360, (g, w, h) => lobby(g, w, h, { host: true }), '800 · in the lobby']] },
  { id: 'editor', title: 'Survivor editor + locked and loot tiles', code: 'ED1 + LK2 + LS1', note: 'Preview left (chosen / in-game swatches, game-size preview), tabs, tiles relit at tile size; LK2 locked milestone = darkened item with a lock in the middle, its line in the info row when tapped; LS1 loot = flat dark silhouette with "?"; colour row; Random + Done always in the same corner.', frames: [[568, 320, (g, w, h) => editor(g, w, h, { tab: 1 }), '568 · Head tab, Gas mask tapped (locked)'], [800, 360, (g, w, h) => editor(g, w, h, { tab: 0 }), '800 · Top tab']] },
  { id: 'loot', title: 'Loot bag, off-screen arrow, "Bag found!"', code: 'LB2 + OA2 + BF2', note: 'In play: the bag keeps its white edge glow (white = pick-ups) and the HUD pieces use the Lumen construction in neutral steel + white, never the orange accent (the in-play colour rule). OA2: badge with the bag, white arrowhead and the 20 s ring; BF2: the finder\'s name in their slot colour with the slot chip.', frames: [[568, 320, (g, w, h) => lootFrame(g, w, h, 'rain', { bagAt: [0.5, 0.35] }), '568 · bag in the street (rain)'], [568, 320, (g, w, h) => lootFrame(g, w, h, 'rain', { arrow: 'right' }), '568 · bag off screen (OA2)'], [568, 320, (g, w, h) => lootFrame(g, w, h, 'dark', { arrow: 'left' }), '568 · off screen, blackout'], [800, 360, (g, w, h) => lootFrame(g, w, h, 'rain', { toast: null }), '800 · the finder (BF2)'], [568, 320, (g, w, h) => lootFrame(g, w, h, 'dark', { toast: 1 }), '568 · a teammate (BF2)']] },
  { id: 'results', title: 'Results + Run rewards with the slot fix', code: 'RW1 (LF5)', note: 'The orange player slot next to the orange accent: each player now has a filled slot chip with their number and a dark keyline (never orange-on-orange); the same chip is used in tags, cards, lobby rows and toasts.', frames: [[568, 320, (g, w, h) => results(g, w, h, 'full'), '568 · Extract'], [800, 360, (g, w, h) => results(g, w, h, 'endless'), '800 · endless'], [568, 320, (g, w, h) => results(g, w, h, 'mate'), '568 · teammate\'s find']] },
];
