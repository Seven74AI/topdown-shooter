/* PR1 · Tactical HUD — P1's language (the boss warning display the designer called "just perfect") in steel + amber,
 * with material depth: smoked gunmetal glass plates (brushed, scratched, bevelled), neon line frames with bloom,
 * corner brackets, hazard stripes, the faint triangle field, items in reticle boxes, flicker on landing.
 */
const PR1 = (() => {
  const STEEL_LINE = 'rgba(170,196,220,0.85)', STEEL_GLOW = 'rgba(120,170,230,0.7)';
  const col = { name: C.ink, sub: C.ink2, mute: C.mute, accentText: C.amberHi };
  const panelPath = (g, r) => chamfer(g, r.x, r.y, r.w, r.h, [12, 3, 12, 3]);
  function plateFill(g, x, y, w, h, pathFn, side) {
    let gr = g.createLinearGradient(x, y, x + w * 0.4, y + h);
    gr.addColorStop(0, 'rgba(26,33,42,0.88)'); gr.addColorStop(1, 'rgba(7,10,14,0.93)');
    g.fillStyle = gr; pathFn(); g.fill();
    g.save(); pathFn(); g.clip();
    texture(g, TEX.brushed, x, y, w, h, { op: 'soft-light', a: 0.35, scale: 0.6 });
    texture(g, TEX.fbm, x, y, w, h, { op: 'soft-light', a: 0.5, scale: 0.9, ox: x * 3 });
    texture(g, TEX.scratch, x, y, w, h, { op: 'source-over', a: 0.18, scale: 0.7, ox: y });
    if (side) triField(g, x, y, w, h, side === 'right' ? 'rgba(255,170,60,0.06)' : 'rgba(150,190,230,0.05)', 13);
    g.fillStyle = 'rgba(255,255,255,0.022)'; for (let yy = y; yy < y + h; yy += 3) g.fillRect(x, yy, w, 1);
    gr = g.createLinearGradient(0, y, 0, y + h * 0.45); gr.addColorStop(0, 'rgba(220,235,255,0.075)'); gr.addColorStop(1, 'rgba(220,235,255,0)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    keyWash(g, x, y, w, h, 0.06, 0.25);
    g.restore();
    innerShade(g, pathFn, { blur: 10, a: 0.6, lw: 8 });
  }
  const T = {
    code: 'PR1', col,
    bg: (w, h, st) => dawn(w, h, st === 'endless' ? 'dw2' : 'dw1', { dim: 0.42 }),
    shell(g, r, side) {
      const p = () => panelPath(g, r);
      castShadow(g, p, { blur: 16, a: 0.7 });
      plateFill(g, r.x, r.y, r.w, r.h, p, side);
      g.save(); chamfer(g, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, [11, 2.5, 11, 2.5]); bevel(g, r.x, r.y, r.w, r.h, 0.22, 0.5, 1); g.restore();
      const amber = side === 'right';
      g.strokeStyle = amber ? C.amber : STEEL_LINE; g.lineWidth = amber ? 1.6 : 1.2;
      neon(g, () => { p(); g.stroke(); }, amber ? C.amberGlow : STEEL_GLOW, amber ? 12 : 7);
      g.lineWidth = 1.6; g.globalAlpha = 0.85;
      neon(g, () => brackets(g, r.x, r.y, r.w, r.h, 11, 4), amber ? C.amberGlow : STEEL_GLOW, 6);
      g.globalAlpha = 1;
      // ruler ticks along the foot
      g.fillStyle = amber ? 'rgba(255,178,56,0.55)' : 'rgba(170,196,220,0.45)';
      for (let i = 0; i < 9; i++) g.fillRect(r.x + r.w - 20 - i * 6, r.y + r.h - (i % 3 === 0 ? 8 : 6), 1.2, i % 3 === 0 ? 4 : 2);
      if (amber) hazard(g, r.x + r.w - 52, r.y - 7, 40, 4, C.amber, 3.5);
      else hazard(g, r.x + 14, r.y + r.h + 3, 34, 3.5, 'rgba(170,196,220,0.7)', 3.5);
    },
    header(g, x, y, w, h) {
      const bx = x + 9, by = y + 6, bs = h - 6;
      g.strokeStyle = C.amber; g.lineWidth = 1.2; neon(g, () => g.strokeRect(bx, by, bs, bs), C.amberGlow, 6);
      crate(g, bx + 2, by + 2, bs - 4);
      text(g, 'RUN REWARDS', bx + bs + 8, by + bs / 2 + 6, { px: 16, wt: 700, col: C.amber, ls: 2.2, glow: C.amberGlow, blur: 8 });
      const lx = bx + bs + 8, ly = y + h + 3;
      const gr = g.createLinearGradient(lx, 0, x + w - 10, 0); gr.addColorStop(0, 'rgba(255,178,56,0.8)'); gr.addColorStop(1, 'rgba(255,178,56,0)');
      g.fillStyle = gr; g.fillRect(x + 9, ly, w - 20, 1);
      hazard(g, x + w - 70, by + 4, 50, bs - 8, 'rgba(255,178,56,0.22)', 3);
    },
    title(g, x, y, w, t, wave, L) {
      const tw0 = tw(g, wave.toUpperCase(), 14, 600, 1.5) + 14, tx = x + w - tw0, ty = y - 19;
      let px = L.title; while (px > 18 && tw(g, t.toUpperCase(), px, 700, 1.5) > w - tw0 - 8) px--;
      text(g, t.toUpperCase(), x, y, { px, wt: 700, ls: 1.5, fill: steelFill(g, y, px * 0.8), glow: 'rgba(160,200,255,0.55)', blur: 12 });
      g.strokeStyle = STEEL_LINE; g.lineWidth = 1; chamfer(g, tx, ty, tw0, 22, [5, 0, 5, 0]); g.stroke();
      g.fillStyle = 'rgba(160,190,220,0.12)'; g.fill();
      text(g, wave.toUpperCase(), tx + tw0 / 2, ty + 16, { px: 14, wt: 600, ls: 1.5, col: C.steelHi, align: 'center' });
    },
    colHead(g, x, y, w, cols) {
      const o = { px: 14, wt: 600, col: C.mute, ls: 1.4, shadow: false };
      text(g, 'PLAYER', cols.name, y + 12, o); text(g, 'KILLS', cols.kills, y + 12, { ...o, align: 'right' }); text(g, 'EARNED', cols.earned, y + 12, { ...o, align: 'right' });
      g.fillStyle = 'rgba(170,196,220,0.35)'; g.fillRect(x, y + 17, w, 1);
      g.fillStyle = STEEL_LINE; g.fillRect(x, y + 15, 1, 4); g.fillRect(x + w - 1, y + 15, 1, 4);
    },
    player(g, x, y, w, h, p, i, cols, L) {
      if (i % 2 === 0) { g.fillStyle = 'rgba(200,220,255,0.035)'; chamfer(g, x - 3, y, w + 6, h, [0, 0, 6, 0]); g.fill(); }
      g.fillStyle = SLOT[i]; neon(g, () => { rrect(g, x, y + 4, 3, h - 8, 1.5); g.fill(); }, SLOT[i], 8);
      const ny = y + (L.small ? 15 : 17);
      text(g, p.name, cols.name, ny, { px: 17, wt: 600, col: C.ink });
      text(g, fmt(p.kills), cols.kills, ny, { px: 16, wt: 500, col: C.ink2, align: 'right' });
      text(g, '$' + fmt(p.earned), cols.earned, ny, { px: 16, wt: 600, col: C.ink, align: 'right' });
      text(g, trLine(p.tr), cols.name, ny + 16, { px: 14, wt: 500, col: C.mute });
    },
    btn(g, x, y, w, h, label, kind, pulse) {
      const plate = cached(`pr1-btn-${kind}-${w}-${h}`, () => {
        const pad = 16, [c, b] = mk(w + pad * 2, h + pad * 2); b.translate(pad, pad);
        const p = () => chamfer(b, 0, 0, w, h, [9, 2, 9, 2]);
        castShadow(b, p, { blur: 6, a: 0.6, dx: 2, dy: 3 });
        const gr = b.createLinearGradient(0, 0, 0, h);
        if (kind === 'steel') { gr.addColorStop(0, '#e4ecf3'); gr.addColorStop(0.5, '#a9b7c4'); gr.addColorStop(1, '#6d7b89'); }
        else if (kind === 'amber') { gr.addColorStop(0, '#4a3008'); gr.addColorStop(1, '#170e02'); }
        else { gr.addColorStop(0, '#34404c'); gr.addColorStop(1, '#121820'); }
        b.fillStyle = gr; p(); b.fill();
        b.save(); p(); b.clip(); texture(b, TEX.brushed, 0, 0, w, h, { op: 'soft-light', a: kind === 'steel' ? 0.7 : 0.4, scale: 0.5 }); texture(b, TEX.scratch, 0, 0, w, h, { op: 'source-over', a: 0.25 }); b.restore();
        chamfer(b, 0.75, 0.75, w - 1.5, h - 1.5, [8.5, 1.5, 8.5, 1.5]); bevel(b, 0, 0, w, h, 0.6, 0.6, 1.2);
        if (kind !== 'steel') { b.strokeStyle = kind === 'amber' ? C.amber : STEEL_LINE; b.lineWidth = 1.3; neon(b, () => { p(); b.stroke(); }, kind === 'amber' ? C.amberGlow : STEEL_GLOW, 7); }
        return c;
      });
      g.drawImage(plate, x - 16, y - 16, w + 32, h + 32);
      if (kind === 'amber' && pulse) bloom(g, x + w / 2, y + h / 2, w * 0.7, `rgba(255,160,40,${0.18 * pulse})`);
      const tc = kind === 'steel' ? '#0c1116' : kind === 'amber' ? C.amberHi : C.ink;
      const ox = kind === 'primary' ? 7 : 0;
      if (kind === 'primary') { g.strokeStyle = C.steelHi; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 18, y + h / 2 - 5); g.lineTo(x + 13, y + h / 2); g.lineTo(x + 18, y + h / 2 + 5); g.stroke(); }
      let px = 16, ls = 1.3; while (px > 14 && tw(g, label.toUpperCase(), px, 700, ls) > w - 14 - ox * 2) { px -= 0.5; ls = 0.6; }
      text(g, label.toUpperCase(), x + w / 2 + ox, y + h / 2 + 6, { px, ls, wt: 700, col: tc, align: 'center', shadow: kind !== 'steel', glow: kind === 'amber' ? 'rgba(255,170,60,0.6)' : null, blur: 6 });
    },
    well(g, x, y, s, a) {
      const sc = 0.85 + 0.15 * a.p;
      g.save(); g.translate(x + s / 2, y + s / 2); g.scale(sc, sc); g.translate(-x - s / 2, -y - s / 2);
      const gr = g.createRadialGradient(x + s * 0.45, y + s * 0.4, 0, x + s / 2, y + s / 2, s * 0.75);
      gr.addColorStop(0, '#2a3a4a'); gr.addColorStop(1, '#06090c');
      g.fillStyle = gr; chamfer(g, x, y, s, s, [6, 0, 6, 0]); g.fill();
      g.save(); g.clip(); g.strokeStyle = 'rgba(150,190,230,0.08)'; g.lineWidth = 1;
      for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(x + i * s / 4, y); g.lineTo(x + i * s / 4, y + s); g.moveTo(x, y + i * s / 4); g.lineTo(x + s, y + i * s / 4); g.stroke(); }
      g.restore();
      g.restore();
    },
    item(g, slot, id, x, y, s, a) {
      if (a.lit < 1) { g.save(); g.globalAlpha *= 1 - a.lit; g.drawImage(itemArt(slot, id, s, 'sil'), x, y, s, s); g.restore(); }
      if (a.lit > 0) { g.save(); g.globalAlpha *= a.lit; g.drawImage(itemArt(slot, id, s), x, y, s, s); g.restore(); }
      if (a.flash > 0.01) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a.flash * 0.5; g.drawImage(itemArt(slot, id, s), x, y, s, s); g.restore(); }
    },
    wellTop(g, x, y, s, a) {
      g.save(); chamfer(g, x, y, s, s, [6, 0, 6, 0]); g.clip();
      sweep(g, x, y, s, s, a.sweep, { a: a.lt < 1.2 ? 0.6 : 0.16, col: a.isNew ? '255,214,150' : '220,235,255' });
      const gr = g.createLinearGradient(x, y, x + s, y + s); gr.addColorStop(0, 'rgba(255,255,255,0.10)'); gr.addColorStop(0.35, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, s, s);
      g.restore();
      const lineCol = a.isNew ? C.amber : STEEL_LINE, glow = a.isNew ? C.amberGlow : STEEL_GLOW;
      g.strokeStyle = a.isNew ? 'rgba(255,178,56,0.55)' : 'rgba(170,196,220,0.5)'; g.lineWidth = 1; chamfer(g, x, y, s, s, [6, 0, 6, 0]); g.stroke();
      const gap = 3 + (1 - a.p) * 8;
      g.save(); g.strokeStyle = lineCol; g.lineWidth = 1.6; g.globalAlpha *= 0.75 + 0.25 * a.pulse;
      neon(g, () => brackets(g, x, y, s, s, 7, gap), glow, 4 + 8 * a.pulse + 14 * a.flash); g.restore();
      if (a.flash > 0.01) bloom(g, x + s / 2, y + s / 2, s, `rgba(255,190,90,${0.45 * a.flash})`);
    },
    tag(g, x, y, label, kind, a, L, slot) {
      const s = label.toUpperCase(), w0 = tw(g, s, 14, 700, 1.2) + (kind === 'slot' ? 26 : 12), h = 19;
      g.save(); if (a) g.globalAlpha *= a.tag;
      if (kind === 'amber') {
        g.fillStyle = C.amber; neon(g, () => { chamfer(g, x, y, w0, h, [5, 0, 5, 0]); g.fill(); }, C.amberGlow, 8);
        text(g, s, x + 6, y + 15, { px: 14, wt: 700, ls: 1.2, col: '#1a1004', shadow: false });
      } else {
        const lc = kind === 'steel' ? STEEL_LINE : 'rgba(255,255,255,0.8)';
        g.strokeStyle = lc; g.lineWidth = 1; chamfer(g, x + 0.5, y + 0.5, w0 - 1, h - 1, [5, 0, 5, 0]); g.stroke();
        g.fillStyle = 'rgba(255,255,255,0.06)'; g.fill();
        let tx = x + 6;
        if (kind === 'slot') { g.fillStyle = SLOT[slot]; neon(g, () => { g.beginPath(); g.arc(x + 11, y + h / 2, 5, 0, TAU); g.fill(); }, SLOT[slot], 6); tx = x + 20; }
        text(g, s, tx, y + 15, { px: 14, wt: 700, ls: 1.2, col: kind === 'steel' ? C.steelHi : '#fff', shadow: false });
      }
      g.restore(); return w0;
    },
    number(g, x, y, v, px, tt) {
      const s = '+' + fmt(v);
      const flick = tt < 2.1 && tt > 0.4 ? 0.8 + 0.2 * Math.sin(tt * 90) : 1;
      text(g, s, x, y, { px, wt: 700, fill: goldFill(g, y, px * 0.75), glow: 'rgba(255,150,30,0.75)', blur: 14, alpha: flick });
      return tw(g, s, px, 700);
    },
    rookie(g, xr, y, sp, L) {
      const two = L.small, w = two ? 74 : 136, h = two ? 38 : 22, x = xr - w;
      const k = sp < 1 ? lerp(1.8, 1, backOut(sp)) : 1;
      g.save(); g.translate(x + w / 2, y + h / 2); g.scale(k, k); g.translate(-x - w / 2, -y - h / 2); g.globalAlpha *= clamp(sp * 3);
      g.fillStyle = 'rgba(30,18,2,0.85)'; chamfer(g, x, y, w, h, [6, 0, 6, 0]); g.fill();
      hazard(g, x + 2, y + 2, 5, h - 4, C.amber, 2.5); hazard(g, x + w - 7, y + 2, 5, h - 4, C.amber, 2.5);
      g.strokeStyle = C.amber; g.lineWidth = 1.2; neon(g, () => { chamfer(g, x, y, w, h, [6, 0, 6, 0]); g.stroke(); }, C.amberGlow, 8);
      const o = { px: 14, wt: 700, ls: 1, col: C.amberHi, align: 'center', glow: 'rgba(255,160,40,0.6)', blur: 6 };
      if (two) { text(g, 'ROOKIE', x + w / 2, y + 16, o); text(g, 'BONUS ×2', x + w / 2, y + 32, o); } else text(g, 'ROOKIE BONUS ×2', x + w / 2, y + 16, o);
      g.restore();
      if (sp > 0 && sp < 1) bloom(g, x + w / 2, y + h / 2, w, `rgba(255,190,90,${0.5 * (1 - sp)})`);
    },
    ledger(g, x, y, w, lab, val, a) {
      g.save(); g.translate((1 - a) * -10, 0); g.globalAlpha *= a;
      text(g, lab, x, y, { px: 14, wt: 500, col: C.ink2 });
      const lw = tw(g, lab, 14, 500) + 6, vs = '+' + val, vw = tw(g, vs, 14, 600);
      g.fillStyle = 'rgba(170,196,220,0.3)'; for (let xx = x + lw; xx < x + w - vw - 6; xx += 4) g.fillRect(xx, y - 3, 1.5, 1);
      text(g, vs, x + w, y, { px: 14, wt: 600, col: C.amber, align: 'right' });
      g.restore();
    },
    total(g, x, y, w, v) {
      g.fillStyle = 'rgba(255,178,56,0.35)'; g.fillRect(x, y - 16, w, 1);
      text(g, 'TOTAL', x, y, { px: 14, wt: 600, ls: 1.4, col: C.mute });
      const s = fmt(v) + ' Supplies', sw = tw(g, s, 16, 600);
      text(g, s, x + w, y + 1, { px: 16, wt: 600, col: C.ink, align: 'right' });
      crate(g, x + w - sw - 19, y - 13, 16);
    },
    divider(g, x, y, w) {
      const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgba(170,196,220,0)'); gr.addColorStop(0.5, 'rgba(170,196,220,0.45)'); gr.addColorStop(1, 'rgba(170,196,220,0)');
      g.fillStyle = gr; g.fillRect(x, y, w, 1);
      g.fillStyle = 'rgba(170,196,220,0.7)'; g.save(); g.translate(x + w / 2, y + 0.5); g.rotate(Math.PI / 4); g.fillRect(-2.5, -2.5, 5, 5); g.restore();
    },
    iconBox(g, x, y, w, h) {
      g.fillStyle = 'rgba(4,7,10,0.7)'; chamfer(g, x, y, w, h, [5, 0, 5, 0]); g.fill();
      g.strokeStyle = 'rgba(170,196,220,0.5)'; g.lineWidth = 1; g.stroke();
    },
    nudgeBox(g, x, y, w, h) {
      g.fillStyle = 'rgba(150,185,220,0.07)'; chamfer(g, x, y, w, h, [8, 0, 8, 0]); g.fill();
      g.strokeStyle = 'rgba(170,196,220,0.45)'; g.lineWidth = 1; g.setLineDash([3, 3]); g.stroke(); g.setLineDash([]);
      g.fillStyle = STEEL_LINE; g.fillRect(x, y + 8, 2, h - 16);
    },
    status(g, x, y, w, r, clock, still) {
      if (r.kind === 'saving') {
        spinner(g, x + 12, y + 18, 9, still ? 0.4 : clock, C.amber);
        text(g, 'SAVING…', x + 30, y + 25, { px: 20, wt: 700, ls: 1.5, col: C.ink });
        for (let i = 0; i < 3; i++) {
          const yy = y + 46 + i * 24, ww = [w * 0.85, w * 0.7, w * 0.55][i];
          g.fillStyle = 'rgba(170,196,220,0.08)'; chamfer(g, x, yy, ww, 14, [4, 0, 4, 0]); g.fill();
          g.save(); g.clip(); sweep(g, x, yy, ww, 14, still ? 0.5 : ((clock * 0.6 + i * 0.12) % 1.4) / 1.4 * 1.4 - 0.2, { a: 0.18, col: '200,220,255' }); g.restore();
        }
        return;
      }
      const ic = r.kind === 'practice' ? null : 1;
      if (ic) cloudX(g, x, y + 4, 24, C.steelHi); else { g.strokeStyle = C.steelHi; g.lineWidth = 1.6; g.beginPath(); g.arc(x + 12, y + 16, 10, 0, TAU); g.moveTo(x + 18, y + 16); g.arc(x + 12, y + 16, 5, 0, TAU); g.stroke(); }
      const lines = wrap(g, r.title, w - 34, 19, 700);
      lines.forEach((ln, i) => text(g, ln, x + 32, y + 22 + i * 22, { px: 19, wt: 700, col: C.ink }));
      const hy = y + 22 + lines.length * 22 + 2;
      wrap(g, r.hint, w - 34, 15, 500).forEach((ln, i) => text(g, ln, x + 32, hy + i * 18, { px: 15, wt: 500, col: C.ink2 }));
      g.fillStyle = 'rgba(170,196,220,0.5)'; g.fillRect(x + 32, y + 2, 26, 1.5);
    },
    scrollCue(g, L, pos, frac) {
      const V = L.view, x = L.right.x + L.right.w - 5, h = V.h - 10, th = Math.max(20, h * frac);
      g.fillStyle = 'rgba(170,196,220,0.18)'; g.fillRect(x, V.y + 4, 1.5, h);
      g.fillStyle = C.amber; neon(g, () => g.fillRect(x - 0.5, V.y + 4 + (h - th) * pos, 2.5, th), C.amberGlow, 5);
      if (pos < 0.98) { const gr = g.createLinearGradient(0, V.y + V.h - 22, 0, V.y + V.h); gr.addColorStop(0, 'rgba(8,11,15,0)'); gr.addColorStop(1, 'rgba(8,11,15,0.92)'); g.fillStyle = gr; g.fillRect(V.x - 4, V.y + V.h - 22, V.w + 4, 22); }
    },
    overlay(g, L, t, still) {
      if (still) return;
      const r = L.right, band = (t * 0.35) % 1.3 - 0.15;
      g.save(); chamfer(g, r.x, r.y, r.w, r.h, [12, 3, 12, 3]); g.clip(); g.globalCompositeOperation = 'lighter';
      const yy = r.y + r.h * band, gr = g.createLinearGradient(0, yy - 16, 0, yy + 16);
      gr.addColorStop(0, 'rgba(255,190,110,0)'); gr.addColorStop(0.5, 'rgba(255,190,110,0.035)'); gr.addColorStop(1, 'rgba(255,190,110,0)');
      g.fillStyle = gr; g.fillRect(r.x, yy - 16, r.w, 32); g.restore();
    },
  };
  return T;
})();
