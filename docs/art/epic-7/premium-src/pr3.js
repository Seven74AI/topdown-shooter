/* PR3 · Cinematic glass — frosted panes over the blurred dawn (depth of field), light-catching edges, a drifting
 * sheen, soft gold bloom; items rise on a lit glass pedestal under a light shaft, with a flare streak and motes.
 */
const PR3 = (() => {
  const col = { name: '#ffffff', sub: 'rgba(236,242,250,0.78)', mute: 'rgba(225,232,242,0.6)', accentText: '#ffdb8e' };
  const GOLD = '#ffd27a', GOLD_GLOW = 'rgba(255,190,90,0.8)';
  let look = 'dw1';
  function sunRays(g, w, h, warm) {
    const sx = w * 0.06, sy = -h * 0.12, r = rng(5);
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) {
      const a = 0.25 + r() * 0.95, sp = 0.025 + r() * 0.05, L = w * 1.3;
      const gr = g.createLinearGradient(sx, sy, sx + Math.cos(a) * L, sy + Math.sin(a) * L);
      gr.addColorStop(0, warm ? 'rgba(255,200,130,0.16)' : 'rgba(170,200,255,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + Math.cos(a - sp) * L, sy + Math.sin(a - sp) * L); g.lineTo(sx + Math.cos(a + sp) * L, sy + Math.sin(a + sp) * L); g.closePath(); g.fill();
    }
    bloom(g, sx + w * 0.05, sy + h * 0.1, w * 0.35, warm ? 'rgba(255,214,160,0.55)' : 'rgba(190,215,255,0.35)');
    g.restore();
  }
  const bgOf = (w, h, lk, blur) => cached(`pr3-bg-${w}-${h}-${lk}-${blur}`, () => {
    const [c, g] = mk(w, h);
    g.drawImage(dawn(w, h, lk, { dim: blur ? 0.3 : 0.2, blur }), 0, 0, w, h);
    sunRays(g, w, h, lk === 'dw1');
    return c;
  });
  const glassPath = (g, r, rad = 14) => rrect(g, r.x, r.y, r.w, r.h, rad);
  function glass(g, r, { rad = 14, tint = 0.5, warm = false } = {}) {
    const p = () => glassPath(g, r, rad);
    castShadow(g, p, { blur: 26, a: 0.55, dx: 2, dy: 10 });
    g.save(); p(); g.clip();
    g.drawImage(bgOf(T._w, T._h, look, 9), 0, 0, T._w, T._h);
    let gr = g.createLinearGradient(r.x, r.y, r.x + r.w * 0.3, r.y + r.h);
    gr.addColorStop(0, `rgba(40,48,62,${tint - 0.12})`); gr.addColorStop(1, `rgba(6,9,15,${tint + 0.22})`);
    g.fillStyle = gr; g.fillRect(r.x, r.y, r.w, r.h);
    texture(g, TEX.grain, r.x, r.y, r.w, r.h, { op: 'overlay', a: 0.55 });
    texture(g, TEX.fbm, r.x, r.y, r.w, r.h, { op: 'soft-light', a: 0.25, scale: 1.4 });
    gr = g.createLinearGradient(0, r.y, 0, r.y + r.h * 0.4); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(r.x, r.y, r.w, r.h);
    g.restore();
    // light-catching edge: bright upper-left, a warm bounce lower-right
    gr = g.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h);
    gr.addColorStop(0, 'rgba(255,255,255,0.75)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.12)'); gr.addColorStop(0.75, 'rgba(255,255,255,0.06)'); gr.addColorStop(1, warm ? 'rgba(255,200,130,0.5)' : 'rgba(255,220,180,0.25)');
    g.strokeStyle = gr; g.lineWidth = 1.2; p(); g.stroke();
    g.save(); rrect(g, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, rad - 1.5); g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1; g.stroke(); g.restore();
  }
  const T = {
    code: 'PR3', col, _w: 568, _h: 320,
    bg(w, h, st) { look = st === 'endless' ? 'dw2' : 'dw1'; T._w = w; T._h = h; return bgOf(w, h, look, 0); },
    shell(g, r, side) {
      glass(g, r, { warm: side === 'right' });
      if (side === 'right') { // a warm gold light along the top edge
        g.save(); g.globalCompositeOperation = 'lighter';
        const gr = g.createLinearGradient(r.x + 20, 0, r.x + r.w - 20, 0); gr.addColorStop(0, 'rgba(255,200,110,0)'); gr.addColorStop(0.3, 'rgba(255,200,110,0.9)'); gr.addColorStop(1, 'rgba(255,200,110,0)');
        g.fillStyle = gr; g.shadowColor = GOLD_GLOW; g.shadowBlur = 10; g.fillRect(r.x + 20, r.y - 0.5, r.w - 40, 1.5); g.restore();
      }
    },
    header(g, x, y, w, h) {
      crate(g, x + 12, y + 8, h - 6, { glow: true });
      text(g, 'RUN REWARDS', x + h + 14, y + h / 2 + 9, { px: 16, wt: 600, ls: 3.2, col: '#fff', glow: 'rgba(255,220,170,0.5)', blur: 10 });
      const gr = g.createLinearGradient(x + 12, 0, x + w - 12, 0); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x + 12, y + h + 3, w - 24, 1);
    },
    title(g, x, y, w, t, wave, L) {
      const s = t.toUpperCase(), ww = tw(g, wave.toUpperCase(), 14, 500, 2.5);
      let px = L.title + 2; while (px > 18 && tw(g, s, px, 600, 3) > w - ww - 10) px--;
      text(g, s, x, y, { px, wt: 600, ls: 3, col: '#fff', glow: 'rgba(255,215,160,0.7)', blur: 18 });
      text(g, wave.toUpperCase(), x + w, y, { px: 14, wt: 500, ls: 2.5, col: GOLD, align: 'right', glow: 'rgba(255,190,90,0.5)', blur: 8 });
    },
    colHead(g, x, y, w, cols) {
      const o = { px: 14, wt: 500, col: col.mute, ls: cols.earned - cols.name < 200 ? 0.8 : 2, shadow: false };
      text(g, 'PLAYER', cols.name, y + 12, o); text(g, 'KILLS', cols.kills, y + 12, { ...o, align: 'right' }); text(g, 'EARNED', cols.earned, y + 12, { ...o, align: 'right' });
    },
    player(g, x, y, w, h, p, i, cols, L) {
      g.fillStyle = 'rgba(255,255,255,0.055)'; rrect(g, x - 4, y, w + 8, h, 9); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 1; g.stroke();
      bloom(g, x + 4, y + h / 2 - 4, 14, SLOT[i] + '99');
      const gr = g.createRadialGradient(x + 3, y + h / 2 - 5, 0, x + 4, y + h / 2 - 4, 4.5); gr.addColorStop(0, '#fff'); gr.addColorStop(0.5, SLOT[i]); gr.addColorStop(1, SLOT[i] + '00');
      g.fillStyle = gr; g.beginPath(); g.arc(x + 4, y + h / 2 - 4, 5, 0, TAU); g.fill();
      const ny = y + (L.small ? 15 : 17);
      text(g, p.name, cols.name, ny, { px: 17, wt: 600, col: '#fff' });
      text(g, fmt(p.kills), cols.kills, ny, { px: 16, wt: 500, col: col.sub, align: 'right' });
      text(g, '$' + fmt(p.earned), cols.earned, ny, { px: 16, wt: 600, col: '#fff', align: 'right' });
      text(g, trLine(p.tr), cols.name, ny + 16, { px: 14, wt: 500, col: col.mute });
    },
    btn(g, x, y, w, h, label, kind, pulse) {
      const plate = cached(`pr3-btn-${kind}-${w}-${h}`, () => {
        const pad = 16, [c, b] = mk(w + pad * 2, h + pad * 2); b.translate(pad, pad);
        const p = () => rrect(b, 0, 0, w, h, 12);
        castShadow(b, p, { blur: 10, a: 0.5, dx: 1, dy: 5 });
        b.save(); p(); b.clip();
        let gr = b.createLinearGradient(0, 0, 0, h);
        if (kind === 'steel') { gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#c7d1db'); }
        else if (kind === 'amber') { gr.addColorStop(0, 'rgba(255,205,120,0.55)'); gr.addColorStop(1, 'rgba(150,80,10,0.55)'); }
        else { gr.addColorStop(0, 'rgba(255,255,255,0.24)'); gr.addColorStop(1, 'rgba(255,255,255,0.06)'); }
        b.fillStyle = gr; b.fillRect(0, 0, w, h);
        b.fillStyle = 'rgba(0,0,0,0.25)'; if (kind !== 'steel') b.fillRect(0, 0, w, h);
        gr = b.createLinearGradient(0, 0, 0, h * 0.5); gr.addColorStop(0, 'rgba(255,255,255,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        b.fillStyle = gr; b.fillRect(0, 0, w, h * 0.5);
        b.restore();
        gr = b.createLinearGradient(0, 0, w, h); gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.15)'); gr.addColorStop(1, kind === 'amber' ? 'rgba(255,200,110,0.8)' : 'rgba(255,255,255,0.3)');
        b.strokeStyle = gr; b.lineWidth = 1.2; p(); b.stroke();
        return c;
      });
      if (kind === 'amber') bloom(g, x + w / 2, y + h / 2, w * 0.8, `rgba(255,180,70,${0.12 + 0.18 * (pulse || 0)})`);
      g.drawImage(plate, x - 16, y - 16, w + 32, h + 32);
      const s = label.toUpperCase();
      let px = 16, ls = 1.6; while (px > 14 && tw(g, s, px, 600, ls) > w - 16) { px -= 0.5; ls = 0.8; }
      text(g, s, x + w / 2, y + h / 2 + 6, { px, ls, wt: 600, align: 'center', col: kind === 'steel' ? '#0f141a' : kind === 'amber' ? '#fff3d6' : '#fff', shadow: kind !== 'steel', glow: kind === 'amber' ? 'rgba(255,190,90,0.6)' : null, blur: 8 });
    },
    well(g, x, y, s, a) {
      const p = () => rrect(g, x, y, s, s, 10);
      g.save(); p(); g.clip();
      let gr = g.createLinearGradient(0, y, 0, y + s); gr.addColorStop(0, 'rgba(10,14,22,0.75)'); gr.addColorStop(1, 'rgba(50,58,72,0.6)');
      g.fillStyle = gr; g.fillRect(x, y, s, s);
      // light shaft from above (strong on landing, faint at rest)
      const k = a.isNew ? (a.lt < 99 ? 0.35 + 0.65 * Math.exp(-Math.pow((a.lt - 0.55) / 0.35, 2)) : 0.35) * (0.8 + 0.2 * a.pulse) : 0.15;
      g.globalCompositeOperation = 'lighter';
      gr = g.createLinearGradient(0, y, 0, y + s); gr.addColorStop(0, `rgba(255,225,170,${0.5 * k})`); gr.addColorStop(1, 'rgba(255,225,170,0)');
      g.fillStyle = gr; g.beginPath(); g.moveTo(x + s * 0.38, y); g.lineTo(x + s * 0.62, y); g.lineTo(x + s * 0.9, y + s); g.lineTo(x + s * 0.1, y + s); g.closePath(); g.fill();
      // pedestal light pool
      g.save(); g.translate(x + s / 2, y + s * 0.84); g.scale(1, 0.32); gr = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.42); gr.addColorStop(0, `rgba(255,205,130,${0.75 * k})`); gr.addColorStop(1, 'rgba(255,205,130,0)'); g.fillStyle = gr; g.fillRect(-s, -s, s * 2, s * 2); g.restore();
      g.restore();
    },
    item(g, slot, id, x, y, s, a) {
      const rise = a.lt < 99 ? (1 - ease((a.lt - 0.1) / 0.6)) * 9 : 0;
      const bob = a.isNew && a.lt >= 1.2 ? Math.sin(a.lt * 2) * 0.8 : 0;
      g.save(); rrect(g, x, y, s, s, 10); g.clip(); g.translate(0, rise - bob);
      if (a.lit < 1) { g.save(); g.globalAlpha *= (1 - a.lit) * a.p; g.drawImage(itemArt(slot, id, s, 'sil'), x, y, s, s); g.restore(); }
      if (a.lit > 0) { g.save(); g.globalAlpha *= a.lit; g.drawImage(itemArt(slot, id, s), x, y, s, s); g.restore(); }
      if (a.flash > 0.01) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a.flash * 0.45; g.drawImage(itemArt(slot, id, s), x, y, s, s); g.restore(); }
      g.restore();
    },
    wellTop(g, x, y, s, a) {
      const p = () => rrect(g, x, y, s, s, 10);
      g.save(); p(); g.clip();
      sweep(g, x, y, s, s, a.sweep, { a: a.lt < 1.2 ? 0.5 : 0.14, width: 0.3, col: '255,248,235' });
      const gr = g.createLinearGradient(x, y, x + s * 0.6, y + s); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.02)'); gr.addColorStop(0.32, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x, y, s, s);
      g.restore();
      const eg = g.createLinearGradient(x, y, x + s, y + s); eg.addColorStop(0, 'rgba(255,255,255,0.7)'); eg.addColorStop(0.5, 'rgba(255,255,255,0.1)'); eg.addColorStop(1, a.isNew ? 'rgba(255,200,110,0.7)' : 'rgba(255,255,255,0.25)');
      g.strokeStyle = eg; g.lineWidth = 1; p(); g.stroke();
      // motes rising (cheap: 5 dots per well)
      if (a.isNew && a.lt < 99) {
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 5; i++) { const ph = (a.lt * 0.35 + i * 0.21) % 1, mx = x + s * (0.25 + 0.5 * ((i * 0.37) % 1)) + Math.sin(a.lt * 1.5 + i) * 3, my = y + s * (0.95 - ph * 1.05); g.fillStyle = `rgba(255,220,160,${0.7 * Math.sin(ph * Math.PI)})`; g.beginPath(); g.arc(mx, my, 0.9, 0, TAU); g.fill(); }
        g.restore();
      }
      // flare streak on landing
      if (a.flash > 0.01) {
        g.save(); g.globalCompositeOperation = 'lighter';
        const fx = x + s * 0.5, fy = y + s * 0.42, L = s * 1.6 * a.flash + s * 0.3;
        const gr2 = g.createLinearGradient(fx - L, 0, fx + L, 0); gr2.addColorStop(0, 'rgba(255,220,170,0)'); gr2.addColorStop(0.5, `rgba(255,240,215,${0.85 * a.flash})`); gr2.addColorStop(1, 'rgba(255,220,170,0)');
        g.fillStyle = gr2; g.fillRect(fx - L, fy - 0.8, L * 2, 1.6);
        g.restore();
        bloom(g, fx, fy, s * 0.7, `rgba(255,225,170,${0.5 * a.flash})`);
      }
    },
    tag(g, x, y, label, kind, a, L, slot) {
      const s = label.toUpperCase(); let tx = x;
      g.save(); if (a && a.lt < 99) g.globalAlpha *= ease((a.lt - 0.3) / 0.3);
      if (kind === 'slot') { bloom(g, x + 5, y + 10, 10, SLOT[slot] + 'aa'); g.fillStyle = SLOT[slot]; g.beginPath(); g.arc(x + 5, y + 10, 4, 0, TAU); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(x + 4, y + 9, 1.4, 0, TAU); g.fill(); tx = x + 14; }
      else { g.fillStyle = kind === 'amber' ? GOLD : kind === 'white' ? '#fff' : 'rgba(255,255,255,0.6)'; g.fillRect(x, y + 9, 9, 1.5); tx = x + 14; }
      const c2 = kind === 'amber' ? GOLD : kind === 'steel' ? 'rgba(235,240,247,0.7)' : '#fff';
      text(g, s, tx, y + 15, { px: 14, wt: 600, ls: 2, col: c2, glow: kind === 'amber' ? 'rgba(255,190,90,0.6)' : null, blur: 8 });
      g.restore(); return tw(g, s, 14, 600, 2) + 14;
    },
    number(g, x, y, v, px, tt) {
      const s = '+' + fmt(v), w = tw(g, s, px, 600, 1);
      text(g, s, x, y, { px, wt: 600, ls: 1, fill: goldFill(g, y, px * 0.75), glow: 'rgba(255,170,60,0.9)', blur: 22 });
      if (tt < 2.2 && tt > 0.4) { g.save(); g.globalCompositeOperation = 'lighter'; const gr = g.createLinearGradient(x - 20, 0, x + w + 40, 0); gr.addColorStop(0, 'rgba(255,210,150,0)'); gr.addColorStop(0.5, 'rgba(255,225,180,0.6)'); gr.addColorStop(1, 'rgba(255,210,150,0)'); g.fillStyle = gr; g.fillRect(x - 20, y - px * 0.38, w + 60, 1.2); g.restore(); }
      return w;
    },
    rookie(g, xr, y, sp) {
      const w = 136, h = 22, x = xr - w, k = sp < 1 ? lerp(1.5, 1, backOut(sp)) : 1;
      g.save(); g.translate(x + w / 2, y + h / 2); g.scale(k, k); g.translate(-x - w / 2, -y - h / 2); g.globalAlpha *= clamp(sp * 3);
      bloom(g, x + w / 2, y + h / 2, w * 0.6, 'rgba(255,180,70,0.18)');
      const p = () => rrect(g, x, y, w, h, 11);
      g.fillStyle = 'rgba(255,190,90,0.2)'; p(); g.fill();
      const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, 'rgba(255,240,210,0.9)'); gr.addColorStop(1, 'rgba(255,190,90,0.6)');
      g.strokeStyle = gr; g.lineWidth = 1.2; p(); g.stroke();
      text(g, 'ROOKIE BONUS ×2', x + w / 2, y + 16, { px: 14, wt: 600, ls: 1.4, col: '#ffe7b8', align: 'center', glow: 'rgba(255,190,90,0.6)', blur: 8 });
      g.restore();
      if (sp > 0 && sp < 1) { g.save(); g.globalCompositeOperation = 'lighter'; const L = w * (1.4 - sp); const gr2 = g.createLinearGradient(x + w / 2 - L, 0, x + w / 2 + L, 0); gr2.addColorStop(0, 'rgba(255,230,190,0)'); gr2.addColorStop(0.5, `rgba(255,240,215,${0.8 * (1 - sp)})`); gr2.addColorStop(1, 'rgba(255,230,190,0)'); g.fillStyle = gr2; g.fillRect(x + w / 2 - L, y + h / 2 - 0.8, L * 2, 1.6); g.restore(); }
    },
    ledger(g, x, y, w, lab, val, a) {
      g.save(); g.globalAlpha *= a; g.translate(0, (1 - a) * 5);
      text(g, lab, x, y, { px: 14, wt: 500, col: col.sub });
      const lw = tw(g, lab, 14, 500) + 8, vs = '+' + val, vw = tw(g, vs, 14, 600);
      const gr = g.createLinearGradient(x + lw, 0, x + w - vw - 8, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x + lw, y - 4, w - vw - 8 - lw, 1);
      text(g, vs, x + w, y, { px: 14, wt: 600, col: GOLD, align: 'right' });
      g.restore();
    },
    total(g, x, y, w, v) {
      const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0.05)');
      g.fillStyle = gr; g.fillRect(x, y - 16, w, 1);
      text(g, 'TOTAL', x, y, { px: 14, wt: 500, ls: 2, col: col.mute });
      const s = fmt(v) + ' Supplies', sw = tw(g, s, 16, 600);
      text(g, s, x + w, y + 1, { px: 16, wt: 600, col: '#fff', align: 'right' });
      crate(g, x + w - sw - 19, y - 13, 16);
    },
    divider(g, x, y, w) {
      const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.4)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x, y, w, 1);
      if (w > 30) bloom(g, x + w / 2, y, 12, 'rgba(255,220,170,0.35)');
    },
    iconBox(g, x, y, w, h) {
      const p = () => rrect(g, x, y, w, h, 8);
      g.fillStyle = 'rgba(8,12,18,0.55)'; p(); g.fill();
      const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0.12)');
      g.strokeStyle = gr; g.lineWidth = 1; p(); g.stroke();
    },
    nudgeBox(g, x, y, w, h) {
      const p = () => rrect(g, x, y, w, h, 12);
      g.fillStyle = 'rgba(255,255,255,0.07)'; p(); g.fill();
      const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(1, 'rgba(255,255,255,0.1)');
      g.strokeStyle = gr; g.lineWidth = 1; p(); g.stroke();
    },
    status(g, x, y, w, r, clock, still) {
      if (r.kind === 'saving') {
        bloom(g, x + 12, y + 18, 18, 'rgba(255,190,90,0.25)');
        spinner(g, x + 12, y + 18, 9, still ? 0.4 : clock, GOLD);
        text(g, 'SAVING…', x + 30, y + 25, { px: 20, wt: 600, ls: 2.5, col: '#fff', glow: 'rgba(255,220,170,0.5)', blur: 10 });
        for (let i = 0; i < 3; i++) { const yy = y + 46 + i * 24, ww = [w * 0.85, w * 0.7, w * 0.55][i]; g.fillStyle = 'rgba(255,255,255,0.07)'; rrect(g, x, yy, ww, 14, 7); g.fill(); g.save(); rrect(g, x, yy, ww, 14, 7); g.clip(); sweep(g, x, yy, ww, 14, still ? 0.5 : ((clock * 0.6 + i * 0.12) % 1.4) / 1.4 * 1.4 - 0.2, { a: 0.22, col: '255,240,215' }); g.restore(); }
        return;
      }
      if (r.kind === 'practice') { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x + 12, y + 16, 10, 0, TAU); g.moveTo(x + 17, y + 16); g.arc(x + 12, y + 16, 5, 0, TAU); g.stroke(); }
      else cloudX(g, x, y + 4, 24, 'rgba(255,255,255,0.9)');
      const lines = wrap(g, r.title, w - 34, 19, 600);
      lines.forEach((ln, i) => text(g, ln, x + 32, y + 22 + i * 22, { px: 19, wt: 600, col: '#fff', glow: 'rgba(255,230,200,0.3)', blur: 8 }));
      const hy = y + 22 + lines.length * 22 + 2;
      wrap(g, r.hint, w - 34, 15, 500).forEach((ln, i) => text(g, ln, x + 32, hy + i * 18, { px: 15, wt: 500, col: col.sub }));
    },
    scrollCue(g, L, pos, frac) {
      const V = L.view, x = L.right.x + L.right.w - 6, h = V.h - 10, th = Math.max(22, h * frac);
      g.fillStyle = 'rgba(255,255,255,0.12)'; rrect(g, x - 1, V.y + 4, 2, h, 1); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.85)'; rrect(g, x - 1.5, V.y + 4 + (h - th) * pos, 3, th, 1.5); g.fill();
      if (pos < 0.98) { const gr = g.createLinearGradient(0, V.y + V.h - 22, 0, V.y + V.h); gr.addColorStop(0, 'rgba(10,14,22,0)'); gr.addColorStop(1, 'rgba(10,14,22,0.75)'); g.fillStyle = gr; g.fillRect(V.x - 4, V.y + V.h - 22, V.w + 4, 22); }
    },
    overlay(g, L, t, still) {
      if (still) return;
      // a broad sheen drifting across the glass
      const p = (t * 0.07) % 1.6 - 0.3;
      for (const r of [L.left, L.right]) {
        g.save(); glassPath(g, r); g.clip(); sweep(g, 0, r.y, L.w, r.h, p, { width: 0.18, a: 0.06, col: '255,250,240', angle: 0.8 }); g.restore();
      }
    },
  };
  return T;
})();
