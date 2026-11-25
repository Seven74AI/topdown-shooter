/* PR6 · After-action report — a fictional in-world news channel covers your extraction: a live drone feed of the dawn
 * city behind glossy gold-and-steel broadcast graphics, team rows as lower-third bars, a scrolling ticker, 3D gold
 * numerals with a glint, and each new item as a picture-in-picture card that flips in.
 */
const PR6 = (() => {
  const GOLD = '#f5b941', NAVY0 = '#13213a', NAVY1 = '#060b15';
  const col = { name: '#ffffff', sub: 'rgba(222,232,246,0.82)', mute: 'rgba(200,212,230,0.62)', accentText: '#ffd37a' };
  let look = 'dw1';
  const TICK = '4 SURVIVORS EXTRACTED AT DAWN  ◆  BEHEMOTH DOWN IN WAVE 10  ◆  DISTRICT 2 UNLOCKED  ◆  ROOKIE BONUS DOUBLES SUPPLIES  ◆  SURPRISE BAG FOUND IN WAVE 6  ◆  ';
  function goldBar(g, x, y, w, h, slant = 8) {
    g.beginPath(); g.moveTo(x + slant, y); g.lineTo(x + w, y); g.lineTo(x + w - slant, y + h); g.lineTo(x, y + h); g.closePath();
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#fff0bf'); gr.addColorStop(0.45, '#f5b941'); gr.addColorStop(0.55, '#d48f1c'); gr.addColorStop(1, '#8f5a0c');
    g.fillStyle = gr; g.fill();
    g.save(); g.clip(); const hl = g.createLinearGradient(0, y, 0, y + h * 0.5); hl.addColorStop(0, 'rgba(255,255,255,0.55)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hl; g.fillRect(x, y, w, h * 0.5); g.restore();
  }
  function navyBar(g, x, y, w, h, slant = 8, a = 0.92) {
    g.beginPath(); g.moveTo(x + slant, y); g.lineTo(x + w, y); g.lineTo(x + w - slant, y + h); g.lineTo(x, y + h); g.closePath();
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, `rgba(44,64,98,${a})`); gr.addColorStop(0.5, `rgba(19,33,58,${a})`); gr.addColorStop(1, `rgba(6,11,21,${a})`);
    g.fillStyle = gr; g.fill();
    g.save(); g.clip(); const hl = g.createLinearGradient(0, y, 0, y + h * 0.45); hl.addColorStop(0, 'rgba(255,255,255,0.22)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hl; g.fillRect(x, y, w, h * 0.45); g.restore();
  }
  const feed = (w, h, lk) => dawn(Math.round(w * 1.15), Math.round(h * 1.15), lk, { dim: 0.22 });
  const T = {
    code: 'PR6', col,
    adjust(L) {
      const th = L.small ? 22 : 24;
      const left = { ...L.left, h: L.left.h - th - 6 }, right = { ...L.right, h: L.right.h - th - 6 };
      const hdr = L.small ? 26 : 30;
      return { ...L, left, right, hdr, ticker: { x: L.left.x, y: L.left.y + L.left.h - th + 2, w: L.right.x + L.right.w - L.left.x, h: th }, rowH: L.small ? 32 : 38, lpad: L.small ? 6 : 10,
        view: { x: right.x + 8, y: right.y + hdr + 6, w: right.w - 16, h: right.h - hdr - 10 } };
    },
    live(g, L, state, t, still) {
      look = state === 'endless' ? 'dw2' : 'dw1';
      const f = feed(L.w, L.h, look), W = Math.round(L.w * 1.15), H = Math.round(L.h * 1.15);
      const px = still ? -W * 0.06 : -W * 0.065 + Math.sin(t * 0.11) * W * 0.06, py = still ? -H * 0.06 : -H * 0.065 + Math.cos(t * 0.08) * H * 0.05;
      g.drawImage(f, px, py, W, H);
      g.fillStyle = 'rgba(255,255,255,0.025)'; for (let y = 0; y < L.h; y += 3) g.fillRect(0, y, L.w, 1);
    },
    bg(w, h, st) { look = st === 'endless' ? 'dw2' : 'dw1'; return cached(`pr6-bg-${w}-${h}-${look}`, () => { const [c, g] = mk(w, h); T.live(g, { w, h }, st, 0, true); return c; }); },
    shell(g, r, side, L) {
      if (side === 'left') {
        const gr = g.createLinearGradient(r.x, 0, r.x + r.w + 30, 0); gr.addColorStop(0, 'rgba(4,8,16,0.72)'); gr.addColorStop(0.75, 'rgba(4,8,16,0.5)'); gr.addColorStop(1, 'rgba(4,8,16,0)');
        g.fillStyle = gr; g.fillRect(r.x - 6, r.y, r.w + 36, r.h);
        // ticker plate (static parts; the text scrolls in overlay)
        const T0 = L.ticker;
        navyBar(g, T0.x, T0.y, T0.w, T0.h, 0, 0.95);
        const lw = L.small ? 74 : 226;
        goldBar(g, T0.x, T0.y, lw, T0.h, 0);
        g.fillStyle = '#fff'; g.beginPath(); g.arc(T0.x + 10, T0.y + T0.h / 2, 3.5, 0, TAU); g.fill(); bloom(g, T0.x + 10, T0.y + T0.h / 2, 8, 'rgba(255,255,255,0.8)');
        text(g, L.small ? 'LIVE' : 'LIVE · AFTER-ACTION REPORT', T0.x + 19, T0.y + T0.h / 2 + 5.5, { px: 14, wt: 700, ls: 1, col: '#1c1203', shadow: false });
        g.fillStyle = GOLD; g.fillRect(T0.x, T0.y - 1.5, T0.w, 1.5);
        return;
      }
      const p = () => { g.beginPath(); g.moveTo(r.x, r.y); g.lineTo(r.x + r.w, r.y); g.lineTo(r.x + r.w, r.y + r.h - 10); g.lineTo(r.x + r.w - 10, r.y + r.h); g.lineTo(r.x, r.y + r.h); g.closePath(); };
      castShadow(g, p, { blur: 18, a: 0.6, dx: 3, dy: 8 });
      const gr = g.createLinearGradient(r.x, r.y, r.x + r.w * 0.3, r.y + r.h); gr.addColorStop(0, 'rgba(20,34,58,0.94)'); gr.addColorStop(1, 'rgba(5,9,18,0.96)');
      g.fillStyle = gr; p(); g.fill();
      g.save(); p(); g.clip(); texture(g, TEX.fbm, r.x, r.y, r.w, r.h, { op: 'soft-light', a: 0.3, scale: 1.2 });
      g.strokeStyle = 'rgba(120,160,220,0.06)'; g.lineWidth = 1; for (let i = -r.h; i < r.w; i += 9) { g.beginPath(); g.moveTo(r.x + i, r.y + r.h); g.lineTo(r.x + i + r.h, r.y); g.stroke(); }
      g.restore();
      g.strokeStyle = 'rgba(160,190,235,0.35)'; g.lineWidth = 1; p(); g.stroke();
      g.fillStyle = GOLD; g.fillRect(r.x, r.y + r.h - 2, r.w - 10, 2);
    },
    header(g, x, y, w, h) {
      const bw = Math.min(w - 64, 190);
      goldBar(g, x - 6, y, bw, h, 10);
      crate(g, x + 6, y + 4, h - 8);
      text(g, 'RUN REWARDS', x + h + 2, y + h / 2 + 6.5, { px: 17, wt: 700, ls: 1.6, col: '#1c1203', shadow: false });
      navyBar(g, x + bw - 14, y, w - bw + 14, h, 10, 1);
      text(g, 'DCN', x + w - 10, y + h / 2 + 6, { px: 16, wt: 700, ls: 2, col: '#ffffff', align: 'right', shadow: false });
      if (w > 330) text(g, 'EXCLUSIVE', x + w - 46, y + h / 2 + 5, { px: 14, wt: 600, ls: 1, col: GOLD, align: 'right', shadow: false });
    },
    title(g, x, y, w, t, wave, L) {
      const s = t.toUpperCase(), ww = tw(g, wave.toUpperCase(), 14, 700, 1.2) + 22;
      let px = L.title; while (px > 18 && tw(g, s, px, 700, 1) > w - ww - 4) px--;
      const bh = px + 10, by = y - px - 2;
      navyBar(g, x - 4, by, w - ww + 12, bh, 10, 0.95);
      text(g, s, x + 8, y + 2, { px, wt: 700, ls: 1, col: '#fff', shadow: false });
      goldBar(g, x + w - ww - 2, by + 4, ww + 4, bh - 8, 8);
      text(g, wave.toUpperCase(), x + w - ww / 2 + 1, by + bh / 2 + 5, { px: 14, wt: 700, ls: 1.2, col: '#1c1203', align: 'center', shadow: false });
    },
    colHead(g, x, y, w, cols) {
      const o = { px: 14, wt: 600, col: GOLD, ls: 1.2, shadow: false };
      text(g, 'PLAYER', cols.name, y + 12, o); text(g, 'KILLS', cols.kills, y + 12, { ...o, align: 'right' }); text(g, 'EARNED', cols.earned, y + 12, { ...o, align: 'right' });
    },
    player(g, x, y, w, h, p, i, cols, L) {
      navyBar(g, x - 2, y, w + 6, h - 2, 7, 0.9);
      g.save(); g.beginPath(); g.moveTo(x + 5, y); g.lineTo(x + 11, y); g.lineTo(x + 4, y + h - 2); g.lineTo(x - 2, y + h - 2); g.closePath();
      g.fillStyle = SLOT[i]; g.fill(); g.restore();
      const ny = y + (L.small ? 14 : 16);
      text(g, p.name, cols.name, ny, { px: 17, wt: 700, col: '#fff' });
      text(g, fmt(p.kills), cols.kills, ny, { px: 16, wt: 500, col: col.sub, align: 'right' });
      text(g, '$' + fmt(p.earned), cols.earned, ny, { px: 16, wt: 700, col: '#fff', align: 'right' });
      text(g, trLine(p.tr), cols.name, ny + 15, { px: 14, wt: 500, col: col.mute });
    },
    btn(g, x, y, w, h, label, kind, pulse) {
      const s = label.toUpperCase();
      g.save(); castShadow(g, () => { g.beginPath(); g.moveTo(x + 9, y); g.lineTo(x + w, y); g.lineTo(x + w - 9, y + h); g.lineTo(x, y + h); g.closePath(); }, { blur: 6, a: 0.6, dx: 2, dy: 3 }); g.restore();
      if (kind === 'steel') { g.beginPath(); g.moveTo(x + 9, y); g.lineTo(x + w, y); g.lineTo(x + w - 9, y + h); g.lineTo(x, y + h); g.closePath(); const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c9d4e2'); g.fillStyle = gr; g.fill(); }
      else if (kind === 'amber') goldBar(g, x, y, w, h, 9);
      else { navyBar(g, x, y, w, h, 9, 1); g.fillStyle = GOLD; g.fillRect(x + 4, y + h - 2, w - 13, 2); }
      if (kind === 'amber' && pulse) bloom(g, x + w / 2, y + h / 2, w * 0.7, `rgba(255,190,80,${0.15 * pulse})`);
      let px = 16, ls = 1.2; while (px > 14 && tw(g, s, px, 700, ls) > w - 22) { px -= 0.5; ls = 0.5; }
      text(g, s, x + w / 2, y + h / 2 + 6, { px, ls, wt: 700, align: 'center', col: kind === 'primary' ? '#fff' : '#121a26', shadow: false });
    },
    well(g, x, y, s, a) {
      const k = a.lt >= 99 ? 1 : backOut(clamp(a.lt / 0.45)); // the PIP card flips in
      g.save(); g.translate(x + s / 2, 0); g.scale(Math.max(0.02, k), 1); g.translate(-x - s / 2, 0);
      castShadow(g, () => { g.beginPath(); g.rect(x - 2, y - 2, s + 4, s + 4); }, { blur: 5, a: 0.6, dx: 2, dy: 3 });
      g.fillStyle = GOLD; g.fillRect(x - 2, y - 2, s + 4, s + 4);
      const gr = g.createRadialGradient(x + s * 0.4, y + s * 0.35, 0, x + s / 2, y + s / 2, s * 0.8); gr.addColorStop(0, '#41526a'); gr.addColorStop(1, '#0b111b');
      g.fillStyle = gr; g.fillRect(x, y, s, s);
      g.restore();
    },
    item(g, slot, id, x, y, s, a) {
      const k = a.lt >= 99 ? 1 : backOut(clamp(a.lt / 0.45));
      g.save(); g.translate(x + s / 2, 0); g.scale(Math.max(0.02, k), 1); g.translate(-x - s / 2, 0);
      g.beginPath(); g.rect(x, y, s, s); g.clip();
      g.globalAlpha *= clamp(a.lit * 1.5); g.drawImage(itemArt(slot, id, s), x, y, s, s);
      g.restore();
    },
    wellTop(g, x, y, s, a) {
      g.save(); g.beginPath(); g.rect(x, y, s, s); g.clip();
      sweep(g, x, y, s, s, a.sweep, { a: a.lt < 1.2 ? 0.7 : 0.2, width: 0.22, col: '255,246,220' });
      g.fillStyle = 'rgba(255,255,255,0.04)'; for (let yy = y; yy < y + s; yy += 2) g.fillRect(x, yy, s, 1);
      g.restore();
      if (a.flash > 0.01) bloom(g, x + s / 2, y + s / 2, s * 0.8, `rgba(255,220,150,${0.4 * a.flash})`);
    },
    tag(g, x, y, label, kind, a, L, slot) {
      const s = label.toUpperCase(), w0 = tw(g, s, 14, 700, 1) + (kind === 'slot' ? 24 : 18), h = 19;
      g.save(); if (a && a.lt < 99) { const k = ease((a.lt - 0.25) / 0.3); g.globalAlpha *= k; g.translate((1 - k) * -14, 0); }
      if (kind === 'amber') goldBar(g, x, y, w0, h, 6);
      else if (kind === 'slot') { navyBar(g, x, y, w0, h, 6, 1); g.fillStyle = SLOT[slot]; g.fillRect(x + 6, y + 4, 8, h - 8); }
      else { g.beginPath(); g.moveTo(x + 6, y); g.lineTo(x + w0, y); g.lineTo(x + w0 - 6, y + h); g.lineTo(x, y + h); g.closePath(); g.fillStyle = kind === 'steel' ? 'rgba(160,190,235,0.25)' : 'rgba(255,255,255,0.9)'; g.fill(); }
      text(g, s, x + (kind === 'slot' ? 18 : 9), y + 15, { px: 14, wt: 700, ls: 1, col: kind === 'amber' ? '#1c1203' : kind === 'white' ? '#0f1724' : '#ffffff', shadow: false });
      g.restore(); return w0;
    },
    number(g, x, y, v, px, tt) {
      const s = '+' + fmt(v), w = tw(g, s, px, 700, 0.5);
      for (let d = 3; d >= 1; d--) text(g, s, x + d * 0.7, y + d * 0.9, { px, wt: 700, ls: 0.5, col: d === 3 ? 'rgba(0,0,0,0.6)' : '#7a4a08', shadow: false });
      text(g, s, x, y, { px, wt: 700, ls: 0.5, fill: goldFill(g, y, px * 0.75), shadow: false });
      const gp = tt >= 99 ? -1 : (tt - 2.05) / 0.6;
      g.save(); g.beginPath(); g.rect(x - 4, y - px, w + 8, px + 4); g.clip(); sweep(g, x - 4, y - px, w + 8, px + 4, gp, { a: 0.8, width: 0.2, col: '255,250,230' }); g.restore();
      return w + 2;
    },
    rookie(g, xr, y, sp) {
      const w = 136, h = 22, x = xr - w, k = sp < 1 ? ease(sp) : 1;
      g.save(); g.beginPath(); g.rect(x - 4, y - 2, (w + 8) * k, h + 4); g.clip(); // wipes in like a graphic
      goldBar(g, x, y, w, h, 8);
      text(g, 'ROOKIE BONUS ×2', x + w / 2, y + 16, { px: 14, wt: 700, ls: 1, col: '#1c1203', align: 'center', shadow: false });
      g.restore();
    },
    ledger(g, x, y, w, lab, val, a) {
      g.save(); g.globalAlpha *= a; g.translate((1 - a) * 18, 0);
      text(g, lab, x, y, { px: 14, wt: 500, col: col.sub });
      const vs = '+' + val; text(g, vs, x + w, y, { px: 14, wt: 700, col: GOLD, align: 'right' });
      g.fillStyle = 'rgba(160,190,235,0.15)'; g.fillRect(x, y + 3, w, 1);
      g.restore();
    },
    total(g, x, y, w, v) {
      g.fillStyle = GOLD; g.fillRect(x, y - 16, w, 1.5);
      text(g, 'TOTAL', x, y, { px: 14, wt: 700, ls: 1.4, col: GOLD });
      const s = fmt(v) + ' Supplies', sw = tw(g, s, 16, 700);
      text(g, s, x + w, y + 1, { px: 16, wt: 700, col: '#fff', align: 'right' });
      crate(g, x + w - sw - 19, y - 13, 16);
    },
    divider(g, x, y, w) { g.fillStyle = 'rgba(160,190,235,0.25)'; g.fillRect(x, y, w, 1); g.fillStyle = GOLD; g.fillRect(x, y - 0.5, Math.min(w, 30), 2); },
    iconBox(g, x, y, w, h) { g.fillStyle = 'rgba(160,190,235,0.6)'; g.fillRect(x - 1, y - 1, w + 2, h + 2); g.fillStyle = '#0b111b'; g.fillRect(x, y, w, h); },
    nudgeBox(g, x, y, w, h) { navyBar(g, x, y, w, h, 0, 0.9); g.fillStyle = GOLD; g.fillRect(x, y, 3, h); },
    status(g, x, y, w, r, clock, still) {
      if (r.kind === 'saving') {
        spinner(g, x + 12, y + 18, 9, still ? 0.4 : clock, GOLD);
        text(g, 'SAVING…', x + 30, y + 25, { px: 20, wt: 700, ls: 1.5, col: '#fff' });
        for (let i = 0; i < 3; i++) { const yy = y + 46 + i * 22, ww = [w * 0.85, w * 0.7, w * 0.55][i]; navyBar(g, x, yy, ww, 14, 5, 0.8); g.save(); g.beginPath(); g.rect(x, yy, ww, 14); g.clip(); sweep(g, x, yy, ww, 14, still ? 0.5 : ((clock * 0.6 + i * 0.12) % 1.4) / 1.4 * 1.4 - 0.2, { a: 0.25, col: '255,230,170' }); g.restore(); }
        return;
      }
      goldBar(g, x, y + 4, 26, 24, 5);
      if (r.kind === 'practice') { g.strokeStyle = '#1c1203'; g.lineWidth = 1.6; g.beginPath(); g.arc(x + 13, y + 16, 7, 0, TAU); g.stroke(); }
      else cloudX(g, x + 3, y + 7, 20, '#1c1203');
      const lines = wrap(g, r.title, w - 36, 19, 700);
      lines.forEach((ln, i) => text(g, ln, x + 34, y + 22 + i * 22, { px: 19, wt: 700, col: '#fff' }));
      const hy = y + 22 + lines.length * 22 + 2;
      wrap(g, r.hint, w - 36, 15, 500).forEach((ln, i) => text(g, ln, x + 34, hy + i * 18, { px: 15, wt: 500, col: col.sub }));
    },
    scrollCue(g, L, pos, frac) {
      const V = L.view, x = L.right.x + L.right.w - 5, h = V.h - 10, th = Math.max(20, h * frac);
      g.fillStyle = 'rgba(160,190,235,0.2)'; g.fillRect(x, V.y + 4, 2, h);
      g.fillStyle = GOLD; g.fillRect(x, V.y + 4 + (h - th) * pos, 2, th);
      if (pos < 0.98) { const gr = g.createLinearGradient(0, V.y + V.h - 22, 0, V.y + V.h); gr.addColorStop(0, 'rgba(6,10,20,0)'); gr.addColorStop(1, 'rgba(6,10,20,0.95)'); g.fillStyle = gr; g.fillRect(V.x - 4, V.y + V.h - 22, V.w + 4, 22); }
    },
    overlay(g, L, t, still) {
      const T0 = L.ticker, lw = L.small ? 74 : 226, tx = T0.x + lw + 8, tw0 = T0.w - lw - 16;
      g.save(); g.beginPath(); g.rect(tx, T0.y, tw0, T0.h); g.clip();
      const full = tw(g, TICK, 14, 600, 1), off = still ? 0 : (t * 42) % full;
      for (let k = 0; k < 3; k++) text(g, TICK, tx - off + k * full, T0.y + T0.h / 2 + 5.5, { px: 14, wt: 600, ls: 1, col: '#ffffff', shadow: false });
      g.restore();
      const fe = g.createLinearGradient(tx + tw0 - 20, 0, tx + tw0, 0); fe.addColorStop(0, 'rgba(10,18,32,0)'); fe.addColorStop(1, 'rgba(10,18,32,1)'); g.fillStyle = fe; g.fillRect(tx + tw0 - 20, T0.y, 20, T0.h);
      // a broadcast glint across the gold header every few seconds
      if (!still) { const r = L.right, p = (t * 0.25) % 1.6; g.save(); g.beginPath(); g.rect(r.x - 6, r.y, Math.min(r.w - 64, 190), L.hdr); g.clip(); sweep(g, r.x - 6, r.y, Math.min(r.w - 64, 190), L.hdr, p, { a: 0.6, width: 0.15, col: '255,255,240' }); g.restore(); }
    },
  };
  return T;
})();
