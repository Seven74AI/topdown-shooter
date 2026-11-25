/* Content, layout and the reveal timeline: shared by PR1–PR3 (the themes only change how things are rendered).
 * Content and row order = the approved RW1 panel (Story 7.2 AC 5 + 7.4, 7.5, 7.6, 7.7, 7.11, 7.12).
 */
const TEAM = [
  { name: 'Mo', kills: 212, earned: 1840, tr: [3, 2, 5, 0] },
  { name: 'Ana', kills: 187, earned: 1620, tr: [5, 5, 5, 5] },
  { name: 'Kit', kills: 140, earned: 1310, tr: [0, 0, 0, 0] },
  { name: 'Lu', kills: 96, earned: 1185, tr: [1, 0, 2, 0] },
];
const trLine = (t) => (t.every((v) => v === 0) ? '—' : `HP ${t[0]} · Dmg ${t[1]} · $ ${t[2]} · Reload ${t[3]}`);
const STATES = [
  ['saving', 'Saving…'], ['failed', "Couldn't save"], ['offline', 'Not saved'], ['practice', 'Practice'], ['mate', "Teammate's find"], ['collector', 'Collector'],
];

/** Screen geometry (CSS px). 568 × 320 keeps out of the 44 / 21 px safe edges. */
function layout(w, h) {
  const small = w < 700;
  const ins = small ? { l: 44, r: 44, b: 21, t: 0 } : { l: 0, r: 0, b: 0, t: 0 };
  const pad = small ? 8 : 14;
  const x0 = ins.l + pad, x1 = w - ins.r - pad, y0 = ins.t + pad, y1 = h - ins.b - pad + (small ? 2 : 0);
  const lw = small ? 192 : 318, gap = small ? 10 : 16;
  const left = { x: x0, y: y0, w: lw, h: y1 - y0 };
  const right = { x: x0 + lw + gap, y: y0, w: x1 - x0 - lw - gap, h: y1 - y0 };
  const hdr = small ? 24 : 28;
  const view = { x: right.x + 8, y: right.y + hdr + 6, w: right.w - 16, h: right.h - hdr - 12 };
  return { w, h, small, ins, left, right, hdr, view, title: small ? 26 : 32, rowH: small ? 34 : 40 };
}

/** The layout a theme uses (themes may move or shrink the panels). */
function lay(T, w, h) { const L = layout(w, h); return T.adjust ? T.adjust(L) : L; }

// ---------- the panel rows ----------
/** Rows of the rewards panel for a state, in the fixed order: Supplies · items · unlock lines · nudge. */
function rowsFor(state, L) {
  const R = rowsRaw(state, L);
  let y = 0; for (const r of R) { r.y = y; y += r.h + (r.type === 'div' ? 0 : 6); }
  R.total = y;
  return R;
}
function rowsRaw(state, L) {
  const S = L.small, IS = L.itemS || 48;
  const R = [];
  const add = (type, h, d = {}) => R.push({ type, h, ...d });
  if (state === 'saving') { add('status', 120, { kind: 'saving' }); return R; }
  if (state === 'failed') { add('status', 96, { kind: 'failed', title: "Couldn't save this run", hint: 'Your Supplies from earlier runs are safe.' }); return R; }
  if (state === 'offline') { add('status', 96, { kind: 'offline', title: 'Not saved', hint: 'Playing offline from your progress.' }); return R; }
  if (state === 'practice') { add('status', 110, { kind: 'practice', title: "Practice runs don't earn rewards", hint: 'Play online (even alone) to earn Supplies and items.' }); return R; }
  const mate = state === 'mate';
  const ledger = mate ? [['Waves 10 × 10', 100], ['Behemoth', 50], ['Extract', 100]] : [['Waves 10 × 10', 100], ['Behemoth', 50], ['Extract', 100]];
  add('supplies', 44 + ledger.length * (S ? 16 : 18) + 4 + 22 + (mate ? 0 : 26), { amount: mate ? 250 : 500, base: 250, rookie: !mate, total: mate ? 1990 : 740, ledger });
  add('div', 12);
  if (state === 'collector') {
    add('item', IS + 8, { slot: 'head', id: 'riot', tag: 'New item', name: 'Riot helmet', sub: 'first extraction', wear: true, isNew: true });
    add('collector', IS + 8);
  } else if (mate) {
    add('item', IS + 8, { slot: 'head', id: 'gas', tag: 'New item', name: 'Gas mask', sub: 'Behemoth killed', wear: true, isNew: true });
    add('mate', IS + 2, { slot: 'head', id: 'cone', who: 'Mo', whoSlot: 0, name: 'Traffic cone' });
  } else {
    add('item', IS + 8, { slot: 'head', id: 'riot', tag: 'New item', name: 'Riot helmet', sub: 'first extraction', wear: true, isNew: true });
    add('item', IS + 8, { slot: 'head', id: 'gas', tag: 'New item', name: 'Gas mask', sub: 'Behemoth killed', wear: true, isNew: true });
    add('item', IS + 8, { slot: 'head', id: 'cone', tag: 'Found in wave 6', name: 'Traffic cone', sub: 'surprise bag', wear: true, isNew: true });
  }
  add('div', 12);
  if (!mate) add('line', 54, { icon: 'gl', tag: 'You used', name: 'Grenade Launcher', price: 500 });
  add('line', 54, { icon: 'd2', tag: 'Unlocked', name: 'District 2', sub: 'coming soon' });
  if (!mate) { add('div', 12); add('nudge', S ? 62 : 54); }
  return R;
}

// ---------- the reveal timeline (seconds; loops every LOOP s) ----------
const LOOP = 8.4;
/** When each row lands: Supplies ledger ticks, the Rookie ×2 stamp, then items one by one, then lines and nudge. */
function timeline(rows) {
  let t = 2.35;
  for (const r of rows) {
    if (r.type === 'supplies' || r.type === 'status') r.at = 0.3;
    else if (r.type === 'div') r.at = t - 0.1;
    else if (r.type === 'item' || r.type === 'mate' || r.type === 'collector') { r.at = t; t += 0.95; }
    else { r.at = t; t += 0.35; }
  }
  return rows;
}
const SUP_T = { ledger: [0.45, 0.75, 1.05], count0: 0.45, count1: 1.3, stamp: 1.5, count2: 1.55, count3: 2.05, total: 2.05 };
/** Supplies counter value at t. */
function supValue(r, t) {
  if (t >= 99) return r.amount;
  const a = r.base * ease((t - SUP_T.count0) / (SUP_T.count1 - SUP_T.count0));
  if (!r.rookie) return a;
  return a + (r.amount - r.base) * ease((t - SUP_T.count2) / (SUP_T.count3 - SUP_T.count2));
}
/** Auto-scroll during the reveal so each new row lands in view. */
function scrollAt(rows, L, t) {
  const max = Math.max(0, rows.total - L.view.h);
  let s = 0;
  for (const r of rows) {
    if (r.at == null || r.type === 'div') continue;
    const need = clamp(r.y + r.h + 4 - L.view.h, 0, max);
    const k = easeIO((t - (r.at - 0.45)) / 0.45);
    s = lerp(s, Math.max(s, need), k);
  }
  return s;
}

// ---------- rendering ----------
/** The cached static layer: backdrop, both panel shells, the whole left column (it never animates). */
function baseLayer(T, L, state) {
  return cached(`base-${T.code}-${L.w}-${state}`, () => {
    const [c, g] = mk(L.w, L.h);
    const bg = T.bg(L.w, L.h, state);
    if (!T.live) g.drawImage(bg, 0, 0, L.w, L.h);
    T.shell(g, L.left, 'left', L);
    T.shell(g, L.right, 'right', L);
    leftColumn(g, T, L, state);
    T.header(g, L.right.x, L.right.y, L.right.w, L.hdr, L);
    return c;
  });
}
function leftColumn(g, T, L, state) {
  const { x, y, w, h } = L.left, S = L.small, px = L.lpad != null ? L.lpad : S ? 10 : 14;
  const lost = state === 'lost';
  T.title(g, x + px, y + (S ? 32 : 40), w - px * 2, lost ? 'Lost in the city' : 'Extracted', state === 'endless' ? 'Wave 14' : 'Wave 10', L);
  const cols = { name: x + px + 14, kills: x + w - (S ? 66 : 110), earned: x + w - px };
  let yy = y + (S ? 44 : 56);
  T.colHead(g, x + px, yy, w - px * 2, cols, L);
  yy += S ? 20 : 24;
  TEAM.forEach((p, i) => { T.player(g, x + px, yy, w - px * 2, L.rowH, p, i, cols, L); yy += L.rowH + (S ? 2 : 4); });
  const bh = 44, by = y + h - bh - (S ? 6 : 10);
  T.btn(g, x + px, by, S ? 148 : 170, bh, 'Back to lobby', 'primary', 0, L);
  if (!S) text(g, 'Run seed 2207', x + w - px, by + bh / 2 + 5, { px: 14, wt: 500, col: T.col.mute, shadow: T.shadow !== false, glow: T.textGlow || null, align: 'right' });
}

/** Draws one screen at time t. opt.reveal = play the timeline; otherwise everything has landed (idle effects only). */
function renderScreen(g, T, L, state, t, opt = {}) {
  const reveal = !!opt.reveal;
  const rows = cached(`rows-${L.w}-${L.itemS || 48}-${state}`, () => timeline(rowsFor(state, L)));
  const tt = reveal ? t : 99; // timeline time (99 = everything landed)
  if (T.live) T.live(g, L, state, reveal ? t : opt.idle || 0, !reveal && opt.idle == null);
  g.drawImage(baseLayer(T, L, state), 0, 0, L.w, L.h);
  const V = L.view;
  const scroll = opt.scroll != null ? opt.scroll : reveal ? scrollAt(rows, L, tt) : 0;
  g.save(); g.beginPath(); g.rect(V.x - 6, V.y - 4, V.w + 12, V.h + 4); g.clip();
  const pass = () => { for (const r of rows) {
    const yy = V.y + r.y - scroll;
    if (yy > V.y + V.h + 4 || yy + r.h < V.y - 6) continue;
    const lt = tt - (r.at || 0);
    if (lt < 0) continue;
    drawRow(g, T, L, r, V.x, yy, V.w, lt, tt, reveal ? t : opt.idle || 0, !reveal && opt.idle == null);
  } };
  if (T.ghost) { g.save(); g.globalAlpha = T.ghost; g.translate(1.8, 1.2); pass(); g.restore(); } // HUD double image
  pass();
  g.restore();
  // scroll cue: a fade + a thin rail when more is below
  const max = Math.max(0, rows.total - V.h);
  if (max > 0) T.scrollCue(g, L, scroll / max, V.h / rows.total);
  T.overlay(g, L, reveal ? t : opt.idle || 0, !reveal && opt.idle == null);
}

function drawRow(g, T, L, r, x, y, w, lt, tt, clock, still) {
  const S = L.small, A = T.col;
  const appear = ease(lt / 0.35);
  g.save(); g.globalAlpha *= appear;
  const slide = (1 - appear) * 10;
  switch (r.type) {
    case 'div': T.divider(g, x, y + r.h / 2, w * ease(lt / 0.5), L); break;
    case 'status': T.status(g, x, y, w, r, clock, still, L); break;
    case 'supplies': {
      const v = supValue(r, tt);
      const cs = S ? 28 : 32;
      crate(g, x + 1, y + 4, cs, { glow: true });
      const nx = x + cs + 8;
      const nw = T.number(g, nx, y + (S ? 34 : 36), v, S ? 34 : 38, tt, still, L);
      text(g, 'Supplies', nx + nw + 6, y + (S ? 32 : 34), { px: S ? 16 : 18, wt: 600, col: A.accentText, shadow: T.shadow !== false, glow: T.textGlow || null, ls: 1 });
      let ly = y + 44;
      const lh = S ? 16 : 18;
      r.ledger.forEach(([lab, val], i) => {
        const la = tt >= 99 ? 1 : ease((tt - SUP_T.ledger[i]) / 0.3);
        if (la > 0) T.ledger(g, x + 2, ly + lh - 4, w - 4, lab, val, la, L);
        ly += lh;
      });
      if (r.rookie) {
        const sp = tt >= 99 ? 1 : clamp((tt - SUP_T.stamp) / 0.35);
        if (sp > 0) T.rookie(g, x + 2 + 136, ly + 3, sp, { small: false });
        ly += 26;
      }
      const ta = tt >= 99 ? 1 : ease((tt - SUP_T.total) / 0.4);
      if (ta > 0) {
        const totalNow = r.total - r.amount + v;
        g.save(); g.globalAlpha *= ta;
        T.total(g, x + 2, ly + 18, w - 4, totalNow, L);
        g.restore();
      }
      break;
    }
    case 'item': case 'mate': case 'collector': {
      const IS = L.itemS || 48, s = r.type === 'mate' ? IS - 6 : IS;
      const a = itemAnim(lt, clock, still, r.type !== 'mate' && r.isNew !== false);
      T.well(g, x, y + (r.h - s) / 2, s, a, L);
      if (r.type === 'collector') bagGlyph(g, x + s * 0.18, y + (r.h - s) / 2 + s * 0.16, s * 0.64);
      else T.item(g, r.slot, r.id, x, y + (r.h - s) / 2, s, a, L);
      T.wellTop(g, x, y + (r.h - s) / 2, s, a, L);
      const tx = x + s + 10, btnW = r.wear ? (S ? 72 : 84) : 0, oy = Math.max(0, (r.h - 56) / 2);
      y += oy;
      const tWide = w - (tx - x) - btnW - 6;
      const ta = ease((lt - 0.25) / 0.35);
      g.save(); g.globalAlpha *= ta; g.translate(slide * 0 + (1 - ta) * 12, 0);
      if (r.type === 'mate') {
        T.tag(g, tx, y + 8, `${r.who} found`, 'slot', a, L, r.whoSlot);
        text(g, r.name, tx, y + 42, { px: 17, wt: 600, col: A.name, shadow: T.shadow !== false, glow: T.textGlow || null });
      } else if (r.type === 'collector') {
        T.tag(g, tx, y + 6, 'Collector', 'white', a, L);
        wrap(g, 'You have every surprise item', tWide + btnW, 15, 500).slice(0, 2).forEach((ln, i) => text(g, ln, tx, y + 38 + i * 17, { px: 15, wt: 500, col: A.name, shadow: T.shadow !== false, glow: T.textGlow || null }));
      } else {
        T.tag(g, tx, y + 4, r.tag, r.tag === 'New item' ? 'amber' : 'white', a, L);
        text(g, r.name, tx, y + 38, { px: 17, wt: 600, col: A.name, shadow: T.shadow !== false, glow: T.textGlow || null, maxW: tWide });
        text(g, r.sub, tx, y + 53, { px: 14, wt: 500, col: A.sub, shadow: T.shadow !== false, glow: T.textGlow || null, maxW: tWide });
      }
      g.restore();
      if (r.wear) { const ba = ease((lt - 0.6) / 0.3); if (ba > 0) { g.save(); g.globalAlpha *= ba; T.btn(g, x + w - btnW, y - oy + (r.h - 44) / 2, btnW, 44, 'Wear it', 'amber', a.pulse, L); g.restore(); } }
      break;
    }
    case 'line': {
      g.translate(0, slide);
      const iw = 48, ih = 34, iy = y + (r.h - ih) / 2;
      T.iconBox(g, x, iy, iw, ih, L);
      if (r.icon === 'gl' && IMG.gl) { g.save(); g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 3; g.shadowOffsetX = 1; g.shadowOffsetY = 2; g.drawImage(IMG.gl, x + 3, iy + 5, iw - 6, ih - 10); g.restore(); }
      if (r.icon === 'd2') district2(g, x + 2, iy + 2, iw - 4, ih - 4);
      const tx = x + iw + 10;
      T.tag(g, tx, y + 4, r.tag, r.tag === 'Unlocked' ? 'white' : 'steel', null, L);
      text(g, r.name, tx, y + 38, { px: 17, wt: 600, col: A.name, shadow: T.shadow !== false, glow: T.textGlow || null, maxW: w - iw - 14 });
      if (r.price) {
        const pre = 'Unlock it for ';
        text(g, pre, tx, y + 53, { px: 14, wt: 500, col: A.sub, shadow: T.shadow !== false, glow: T.textGlow || null });
        const pw = tw(g, pre, 14, 500);
        crate(g, tx + pw, y + 41, 14);
        text(g, fmt(r.price), tx + pw + 16, y + 53, { px: 14, wt: 600, col: A.accentText, shadow: T.shadow !== false, glow: T.textGlow || null });
      } else text(g, r.sub, tx, y + 53, { px: 14, wt: 500, col: A.sub, shadow: T.shadow !== false, glow: T.textGlow || null });
      break;
    }
    case 'nudge': {
      g.translate(0, slide);
      T.nudgeBox(g, x, y, w, r.h, L);
      const bw = S ? 118 : 160, tx = x + 10;
      const lines = wrap(g, 'Keep your Supplies and items on any phone.', w - bw - 26, 14, 500);
      const ly = y + r.h / 2 - (lines.length * 16) / 2 + 12;
      lines.forEach((ln, i) => text(g, ln, tx, ly + i * 16, { px: 14, wt: 500, col: A.name, shadow: T.shadow !== false, glow: T.textGlow || null }));
      T.btn(g, x + w - bw - 8, y + (r.h - 44) / 2, bw, 44, 'Save my progress', 'steel', 0, L);
      break;
    }
  }
  g.restore();
}

/** An item row's animation state: lt = time since the row started landing. */
function itemAnim(lt, clock, still, isNew) {
  if (still) return { p: 1, lit: 1, sweep: -1, flash: 0, pulse: isNew ? 0.5 : 0, tag: 1, lt: 99, isNew };
  const p = ease(lt / 0.3);
  const lit = clamp((lt - 0.45) / 0.3);
  const sweepP = lt < 1.2 ? (lt - 0.3) / 0.8 : ((clock * 0.2 + 0.37) % 1.6) / 1.6 * 1.6 - 0.3; // landing sweep, then a slow sheen
  const flash = Math.exp(-Math.pow((lt - 0.6) / 0.14, 2));
  const pulse = isNew ? 0.5 + 0.5 * Math.sin(clock * 2.6 + 1) : 0;
  const tag = lt < 0.75 ? (Math.sin(lt * 60) > -0.2 ? 1 : 0.25) : 1; // flicker in (P1)
  return { p, lit, sweep: sweepP, flash, pulse: lt < 1 ? Math.max(pulse * ease((lt - 0.6) / 0.4), 0) : pulse, tag, lt, isNew };
}

/** District 2 thumbnail: a cooler, darker crop of the street bake (no District 2 map exists yet). */
function district2(g, x, y, w, h) {
  const src = cached('d2', () => {
    const city = cached(`city-d2`, () => G7.render({ stage: 3, ppm: 12 * DPR, x0: 34, y0: 20, w: 8, h: 6, power: 'off', noLight: true }));
    const [c, gc] = mk(w, h, DPR * 2); gc.drawImage(city, 0, 0, w, h); gc.globalCompositeOperation = 'multiply'; gc.fillStyle = '#7a8aa6'; gc.fillRect(0, 0, w, h); gc.globalCompositeOperation = 'source-over';
    const gr = gc.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0.4)'); gc.fillStyle = gr; gc.fillRect(0, 0, w, h);
    return c;
  });
  g.drawImage(src, x, y, w, h);
  text(g, 'D2', x + w - 3, y + h - 3, { px: 14, wt: 700, col: '#ffffff', align: 'right' });
}
