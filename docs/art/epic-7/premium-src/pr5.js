/* PR5 · Case closed — tactile and analog: a cork evidence board raked by the dawn light through window blinds.
 * The team is a typed index card with slot-colour map pins, "EXTRACTED" lands as a rubber stamp, Supplies are inked by
 * a numbering stamp, items are polaroids that develop in front of you and get pinned with a brass thumbtack.
 */
const PR5 = (() => {
  const INK = '#1d232b', INK2 = '#474d55', BLUE = '#2f5f93', AMBER_INK = '#a8610a';
  const col = { name: INK, sub: INK2, mute: '#6b6b66', accentText: AMBER_INK };
  let look = 'dw1';
  function cork(w, h, lk) {
    return cached(`pr5-cork-${w}-${h}-${lk}`, () => {
      const [c, g] = mk(w, h);
      g.fillStyle = '#7d5c39'; g.fillRect(0, 0, w, h);
      texture(g, TEX.fbm, 0, 0, w, h, { op: 'multiply', a: 0.8, scale: 0.35 });
      const r = rng(9);
      for (let i = 0; i < w * h / 6; i++) { const v = r(); g.fillStyle = v < 0.45 ? 'rgba(40,24,10,0.35)' : v < 0.8 ? 'rgba(200,160,110,0.25)' : 'rgba(20,10,4,0.5)'; const s = 0.6 + r() * 1.6; g.fillRect(r() * w, r() * h, s, s * (0.6 + r())); }
      for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h; g.fillStyle = 'rgba(15,8,2,0.75)'; g.beginPath(); g.arc(x, y, 0.9, 0, TAU); g.fill(); }
      // dawn through the blinds: a warm (DW1) or blue-hour (DW2) light raking from the upper left, slatted
      g.globalCompositeOperation = 'soft-light';
      const gr = g.createRadialGradient(w * 0.1, -h * 0.1, 0, w * 0.1, 0, w * 0.95);
      gr.addColorStop(0, lk === 'dw1' ? 'rgba(255,200,140,1)' : 'rgba(150,180,240,1)'); gr.addColorStop(1, 'rgba(0,0,10,1)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(10,6,2,0.28)'; g.fillRect(0, 0, w, h);
      const v = g.createRadialGradient(w * 0.4, h * 0.4, h * 0.2, w * 0.5, h * 0.5, w * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = v; g.fillRect(0, 0, w, h);
      // twine stretched across the board between two pins
      g.strokeStyle = 'rgba(214,176,108,0.9)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(8, h * 0.9); g.quadraticCurveTo(w * 0.5, h * 0.98, w - 8, h * 0.86); g.stroke();
      return c;
    });
  }
  function paper(g, x, y, w, h, { tone = '#ede5d0', ruled = false, seed = 1, curl = true } = {}) {
    const p = () => { g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.lineTo(x + w, y + h - (curl ? 10 : 0)); g.lineTo(x + w - (curl ? 12 : 0), y + h); g.lineTo(x, y + h); g.closePath(); };
    castShadow(g, p, { blur: 10, a: 0.65, dx: 4, dy: 6 });
    g.fillStyle = tone; p(); g.fill();
    g.save(); p(); g.clip();
    texture(g, TEX.fbm, x, y, w, h, { op: 'multiply', a: 0.25, scale: 1.2, ox: seed * 31 });
    texture(g, TEX.grain, x, y, w, h, { op: 'overlay', a: 0.6 });
    if (ruled) { g.fillStyle = 'rgba(70,110,170,0.22)'; for (let yy = y + 50; yy < y + h; yy += 18) g.fillRect(x, yy, w, 1); g.fillStyle = 'rgba(47,95,147,0.45)'; g.fillRect(x, y + 32, w, 1.5); }
    const gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, 'rgba(255,240,215,0.25)'); gr.addColorStop(0.6, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(60,40,10,0.18)');
    g.fillStyle = gr; g.fillRect(x, y, w, h);
    g.restore();
    if (curl) { g.fillStyle = '#d5ccb4'; g.beginPath(); g.moveTo(x + w, y + h - 10); g.lineTo(x + w - 12, y + h); g.lineTo(x + w - 10, y + h - 9); g.closePath(); g.fill(); }
  }
  function tape(g, x, y, w, rot) {
    g.save(); g.translate(x, y); g.rotate(rot);
    g.fillStyle = 'rgba(232,222,190,0.72)'; g.fillRect(-w / 2, -6, w, 12);
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(-w / 2, -6, w, 3);
    g.strokeStyle = 'rgba(120,100,60,0.25)'; g.lineWidth = 0.6; g.beginPath(); for (let i = -w / 2; i <= w / 2; i += 2) { g.moveTo(i, -6); g.lineTo(i + 1, -7); } g.stroke();
    g.restore();
  }
  function pin(g, x, y, colr, sc = 1) {
    g.save(); g.translate(x, y); g.scale(sc, sc);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(3, 4, 4.5, 3, 0.5, 0, TAU); g.fill();
    const gr = g.createRadialGradient(-1.6, -1.8, 0.3, 0, 0, 4.6); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.35, colr); gr.addColorStop(1, 'rgba(0,0,0,0.7)');
    g.fillStyle = colr; g.beginPath(); g.arc(0, 0, 4.4, 0, TAU); g.fill(); g.fillStyle = gr; g.fill();
    g.restore();
  }
  function tack(g, x, y, sc = 1) {
    g.save(); g.translate(x, y); g.scale(sc, sc);
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(2.5, 3.5, 5, 3.2, 0.4, 0, TAU); g.fill();
    const gr = g.createRadialGradient(-1.8, -2, 0.3, 0, 0, 5); gr.addColorStop(0, '#fff6d8'); gr.addColorStop(0.4, '#d6a84a'); gr.addColorStop(1, '#6a4610');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 5, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(60,36,6,0.6)'; g.lineWidth = 0.6; g.beginPath(); g.arc(0, 0, 3, 0, TAU); g.stroke();
    g.restore();
  }
  /** Rubber-stamp ink: text in a rough box, knocked out by grain so it reads as real ink. */
  function stamp(g, s, cx, cy, px, inkCol, rot, { box = true, alpha = 1 } = {}) {
    const w = tw(g, s, px, 700, 2) + 16, h = px + 12;
    const key = `pr5-stamp-${s}-${px}-${inkCol}-${box}`;
    const st = cached(key, () => {
      const [c, b] = mk(w + 8, h + 8, DPR * 1.5); b.translate(4, 4);
      b.strokeStyle = inkCol; b.fillStyle = inkCol; b.lineWidth = 2.2;
      if (box) { b.strokeRect(1, 1, w - 2, h - 2); b.lineWidth = 0.8; b.strokeRect(4, 4, w - 8, h - 8); }
      b.font = font(px, 700); b.letterSpacing = '2px'; b.textAlign = 'center'; b.textBaseline = 'middle'; b.fillText(s, w / 2, h / 2 + 1);
      b.globalCompositeOperation = 'destination-out'; b.globalAlpha = 0.85; b.fillStyle = pat(b, TEX.grain, 0.7); b.fillRect(-4, -4, w + 8, h + 8);
      b.globalAlpha = 0.35; b.fillStyle = pat(b, TEX.fbm, 0.5); b.fillRect(-4, -4, w + 8, h + 8);
      return c;
    });
    g.save(); g.translate(cx, cy); g.rotate(rot); g.globalAlpha *= alpha; g.globalCompositeOperation = 'multiply'; g.drawImage(st, -w / 2 - 4, -h / 2 - 4, w + 8, h + 8); g.restore();
    return w;
  }
  const T = {
    code: 'PR5', col, shadow: false, kitPaper: '#e9e0c6',
    adjust(L) { return { ...L, view: { ...L.view, y: L.view.y + 2 } }; },
    bg(w, h, st) { look = st === 'endless' ? 'dw2' : 'dw1'; return cork(w, h, look); },
    shell(g, r, side) {
      if (side === 'left') { paper(g, r.x, r.y, r.w, r.h, { tone: '#efe9d8', ruled: true, seed: 3 }); tape(g, r.x + 18, r.y + 2, 40, -0.25); tape(g, r.x + r.w - 18, r.y + 2, 40, 0.22); }
      else {
        paper(g, r.x, r.y, r.w, r.h, { tone: '#e9e0c6', seed: 7 });
        g.save(); g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip(); g.fillStyle = 'rgba(47,95,147,0.12)'; for (let xx = r.x; xx < r.x + r.w; xx += 12) g.fillRect(xx, r.y, 0.6, r.h); for (let yy = r.y; yy < r.y + r.h; yy += 12) g.fillRect(r.x, yy, r.w, 0.6); g.restore();
        pin(g, r.x + r.w / 2, r.y + 5, '#cfd6de');
      }
    },
    header(g, x, y, w, h) {
      crate(g, x + 10, y + 8, h - 6);
      text(g, 'RUN REWARDS', x + h + 12, y + h / 2 + 9, { px: 16, wt: 700, ls: 2.4, col: INK, shadow: false });
      text(g, 'CASE 2207', x + w - 12, y + h / 2 + 9, { px: 14, wt: 600, ls: 1.5, col: BLUE, align: 'right', shadow: false });
      g.fillStyle = 'rgba(29,35,43,0.55)'; g.fillRect(x + 10, y + h + 4, w - 20, 1.2);
    },
    title(g, x, y, w, t, wave, L) {
      const s = t.toUpperCase();
      let px = L.title - 2; while (px > 16 && tw(g, s, px, 700, 2) + 16 > w * 0.66) px--;
      stamp(g, s, x + (tw(g, s, px, 700, 2) + 16) / 2 + 2, y - 10, px, BLUE, -0.05);
      text(g, wave, x + w, y - 6, { px: 16, wt: 500, col: INK2, align: 'right', shadow: false });
    },
    colHead(g, x, y, w, cols) {
      const o = { px: 14, wt: 600, col: BLUE, ls: 1.2, shadow: false };
      text(g, 'PLAYER', cols.name, y + 12, o); text(g, 'KILLS', cols.kills, y + 12, { ...o, align: 'right' }); text(g, 'EARNED', cols.earned, y + 12, { ...o, align: 'right' });
    },
    player(g, x, y, w, h, p, i, cols, L) {
      const ny = y + (L.small ? 15 : 17);
      pin(g, x + 3, ny - 5, SLOT[i]);
      const o = { shadow: false };
      text(g, p.name, cols.name, ny, { px: 17, wt: 600, col: INK, ...o });
      text(g, fmt(p.kills), cols.kills, ny, { px: 16, wt: 500, col: INK, align: 'right', ...o });
      text(g, '$' + fmt(p.earned), cols.earned, ny, { px: 16, wt: 600, col: INK, align: 'right', ...o });
      text(g, trLine(p.tr), cols.name, ny + 16, { px: 14, wt: 500, col: INK2, ...o });
    },
    btn(g, x, y, w, h, label, kind, pulse) {
      const plate = cached(`pr5-btn-${kind}-${w}-${h}`, () => {
        const pad = 10, [c, b] = mk(w + pad * 2, h + pad * 2); b.translate(pad, pad);
        const p = () => { b.beginPath(); b.moveTo(8, 0); b.lineTo(w, 0); b.lineTo(w, h); b.lineTo(8, h); b.lineTo(0, h / 2); b.closePath(); };
        castShadow(b, p, { blur: 4, a: 0.55, dx: 2, dy: 3 });
        b.fillStyle = kind === 'steel' ? '#f4f0e4' : kind === 'amber' ? '#efe3c4' : '#c9a873'; p(); b.fill();
        b.save(); p(); b.clip(); texture(b, TEX.fbm, 0, 0, w, h, { op: 'multiply', a: 0.35, scale: 0.9 }); texture(b, TEX.grain, 0, 0, w, h, { op: 'overlay', a: 0.7 }); b.restore();
        b.strokeStyle = 'rgba(80,56,20,0.35)'; b.lineWidth = 1; p(); b.stroke();
        b.fillStyle = '#5b4524'; b.beginPath(); b.arc(9, h / 2, 2.6, 0, TAU); b.fill(); b.strokeStyle = '#c8b28a'; b.lineWidth = 1.2; b.stroke();
        return c;
      });
      g.drawImage(plate, x - 10, y - 10, w + 20, h + 20);
      const s = label.toUpperCase();
      let px = 16, ls = 1.2; while (px > 14 && tw(g, s, px, 700, ls) > w - 24) { px -= 0.5; ls = 0.5; }
      if (kind === 'amber') stamp(g, s, x + w / 2 + 5, y + h / 2, px, AMBER_INK, -0.03, { box: false });
      else text(g, s, x + w / 2 + 5, y + h / 2 + 6, { px, ls, wt: 700, align: 'center', col: INK, shadow: false });
      if (kind === 'amber' && pulse) { g.save(); g.globalAlpha = 0.12 * pulse; g.fillStyle = '#fff2c8'; g.fillRect(x, y, w, h); g.restore(); }
    },
    well(g, x, y, s, a) {
      // the polaroid frame (thicker at the foot)
      const p = () => g.rect(x - 3, y - 3, s + 6, s + 9);
      castShadow(g, () => { g.beginPath(); p(); }, { blur: 4, a: 0.5, dx: 2, dy: 3 });
      g.fillStyle = '#f6f3ea'; g.beginPath(); p(); g.fill();
      g.save(); g.beginPath(); p(); g.clip(); texture(g, TEX.grain, x - 3, y - 3, s + 6, s + 9, { op: 'overlay', a: 0.5 }); g.restore();
      const gr = g.createRadialGradient(x + s * 0.4, y + s * 0.4, 0, x + s / 2, y + s / 2, s * 0.8); gr.addColorStop(0, '#3e4248'); gr.addColorStop(1, '#16181b');
      g.fillStyle = gr; g.fillRect(x, y, s, s);
      g.save(); g.beginPath(); g.rect(x, y, s, s); g.clip(); texture(g, TEX.grain, x, y, s, s, { op: 'overlay', a: 0.6 }); g.restore();
    },
    item(g, slot, id, x, y, s, a) {
      const dev = a.lt >= 99 ? 1 : clamp((a.lt - 0.15) / 1.1); // the polaroid develops
      g.save(); g.beginPath(); g.rect(x, y, s, s); g.clip();
      g.globalAlpha *= dev; g.drawImage(itemArt(slot, id, s), x, y, s, s); g.globalAlpha = 1;
      if (dev < 1) { g.fillStyle = `rgba(70,60,48,${0.85 * (1 - dev)})`; g.fillRect(x, y, s, s); g.fillStyle = `rgba(120,90,150,${0.25 * (1 - dev) * dev * 4})`; g.fillRect(x, y, s, s); }
      g.globalCompositeOperation = 'soft-light'; g.fillStyle = 'rgba(255,214,160,0.35)'; g.fillRect(x, y, s, s);
      g.restore();
    },
    wellTop(g, x, y, s, a) {
      const gl = g.createLinearGradient(x, y, x + s, y + s); gl.addColorStop(0, 'rgba(255,255,255,0.18)'); gl.addColorStop(0.35, 'rgba(255,255,255,0)'); g.fillStyle = gl; g.fillRect(x, y, s, s);
      const drop = a.lt >= 99 ? 1 : clamp(a.lt / 0.3);
      if (drop > 0) tack(g, x + s / 2, y - 1, lerp(1.8, 1, backOut(drop)));
    },
    tag(g, x, y, label, kind, a, L, slot) {
      const s = label.toUpperCase();
      g.save(); if (a && a.lt < 99) g.globalAlpha *= ease((a.lt - 0.25) / 0.2);
      let w0;
      if (kind === 'amber') { w0 = stamp(g, s, x + (tw(g, s, 14, 700, 2) + 16) / 2, y + 10, 14, AMBER_INK, -0.03); }
      else if (kind === 'slot') { pin(g, x + 5, y + 9, SLOT[slot]); text(g, s, x + 14, y + 15, { px: 14, wt: 700, ls: 1.2, col: INK, shadow: false }); w0 = tw(g, s, 14, 700, 1.2) + 14; }
      else { text(g, s, x, y + 15, { px: 14, wt: 700, ls: 1.5, col: kind === 'steel' ? BLUE : INK, shadow: false }); w0 = tw(g, s, 14, 700, 1.5); g.fillStyle = kind === 'steel' ? BLUE : INK; g.fillRect(x, y + 18, w0, 1); }
      g.restore(); return w0;
    },
    number(g, x, y, v, px, tt) {
      const s = '+' + fmt(v), w = tw(g, s, px, 700, 1);
      const [c, b] = mk(w + 6, px + 10);
      text(b, s, 2, px + 2, { px, wt: 700, ls: 1, col: AMBER_INK, shadow: false });
      b.globalCompositeOperation = 'destination-out'; b.globalAlpha = 0.4; b.fillStyle = pat(b, TEX.grain, 0.6); b.fillRect(0, 0, w + 6, px + 10);
      g.save(); g.globalCompositeOperation = 'multiply'; g.drawImage(c, x - 2, y - px - 2, w + 6, px + 10); g.restore();
      return w;
    },
    rookie(g, xr, y, sp) {
      const x = xr - 136, k = sp < 1 ? lerp(1.6, 1, backOut(sp)) : 1;
      g.save(); g.translate(x + 68, y + 11); g.scale(k, k); g.translate(-x - 68, -y - 11); g.globalAlpha *= clamp(sp * 4);
      stamp(g, 'ROOKIE BONUS ×2', x + 68, y + 11, 14, AMBER_INK, -0.06);
      g.restore();
    },
    ledger(g, x, y, w, lab, val, a) {
      g.save(); g.globalAlpha *= a;
      text(g, lab, x, y, { px: 14, wt: 500, col: INK, shadow: false });
      const lw = tw(g, lab, 14, 500) + 6, vs = '+' + val, vw = tw(g, vs, 14, 700);
      g.fillStyle = 'rgba(29,35,43,0.4)'; for (let xx = x + lw; xx < x + w - vw - 6; xx += 4) g.fillRect(xx, y - 2, 1.4, 1.2);
      text(g, vs, x + w, y, { px: 14, wt: 700, col: AMBER_INK, align: 'right', shadow: false });
      g.restore();
    },
    total(g, x, y, w, v) {
      g.fillStyle = INK; g.fillRect(x, y - 16, w, 1); g.fillRect(x, y - 14, w, 0.6);
      text(g, 'TOTAL', x, y, { px: 14, wt: 700, ls: 1.4, col: INK, shadow: false });
      const s = fmt(v) + ' Supplies', sw = tw(g, s, 16, 700);
      text(g, s, x + w, y + 1, { px: 16, wt: 700, col: INK, align: 'right', shadow: false });
      crate(g, x + w - sw - 19, y - 13, 16);
    },
    divider(g, x, y, w) { g.strokeStyle = 'rgba(29,35,43,0.35)'; g.lineWidth = 1; g.setLineDash([5, 3]); g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.stroke(); g.setLineDash([]); },
    iconBox(g, x, y, w, h) {
      castShadow(g, () => { g.beginPath(); g.rect(x - 2, y - 2, w + 4, h + 4); }, { blur: 3, a: 0.45, dx: 1.5, dy: 2 });
      g.fillStyle = '#f6f3ea'; g.fillRect(x - 2, y - 2, w + 4, h + 4); g.fillStyle = '#24272b'; g.fillRect(x, y, w, h);
      tape(g, x + w / 2, y - 2, 22, 0.08);
    },
    nudgeBox(g, x, y, w, h) {
      castShadow(g, () => { g.beginPath(); g.rect(x, y, w, h); }, { blur: 4, a: 0.4, dx: 2, dy: 3 });
      g.fillStyle = '#f7e9a8'; g.fillRect(x, y, w, h);
      g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); texture(g, TEX.grain, x, y, w, h, { op: 'overlay', a: 0.6 }); const gr = g.createLinearGradient(0, y, 0, y + 10); gr.addColorStop(0, 'rgba(0,0,0,0.12)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(x, y, w, 10); g.restore();
    },
    status(g, x, y, w, r, clock, still) {
      if (r.kind === 'saving') {
        spinner(g, x + 12, y + 18, 9, still ? 0.4 : clock, AMBER_INK);
        text(g, 'SAVING…', x + 30, y + 25, { px: 20, wt: 700, ls: 1.5, col: INK, shadow: false });
        for (let i = 0; i < 3; i++) { const yy = y + 50 + i * 20; g.fillStyle = 'rgba(29,35,43,0.12)'; g.fillRect(x, yy, [w * 0.85, w * 0.7, w * 0.55][i], 9); }
        return;
      }
      if (r.kind === 'failed') stamp(g, 'NOT FILED', x + w - 60, y + 70, 16, BLUE, -0.12, { alpha: 0.8 });
      const lines = wrap(g, r.title, w - 10, 19, 700);
      lines.forEach((ln, i) => text(g, ln, x + 2, y + 22 + i * 22, { px: 19, wt: 700, col: INK, shadow: false }));
      const hy = y + 22 + lines.length * 22 + 2;
      wrap(g, r.hint, w - 10, 15, 500).forEach((ln, i) => text(g, ln, x + 2, hy + i * 18, { px: 15, wt: 500, col: INK2, shadow: false }));
    },
    scrollCue(g, L, pos, frac) {
      const V = L.view, x = L.right.x + L.right.w - 6, h = V.h - 10, th = Math.max(20, h * frac);
      g.fillStyle = 'rgba(29,35,43,0.15)'; g.fillRect(x, V.y + 4, 1.5, h);
      g.fillStyle = 'rgba(29,35,43,0.6)'; g.fillRect(x - 0.5, V.y + 4 + (h - th) * pos, 2.5, th);
      if (pos < 0.98) { const gr = g.createLinearGradient(0, V.y + V.h - 20, 0, V.y + V.h); gr.addColorStop(0, 'rgba(233,224,198,0)'); gr.addColorStop(1, 'rgba(233,224,198,0.95)'); g.fillStyle = gr; g.fillRect(V.x - 4, V.y + V.h - 20, V.w + 4, 20); }
    },
    overlay(g, L, t, still) {
      // light through the blinds, drifting slowly as the sun rises; dust motes in it
      const sh = still ? 0 : (t * 3) % 36;
      g.save(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = look === 'dw1' ? 'rgba(255,215,160,0.45)' : 'rgba(170,195,255,0.4)';
      g.transform(1, 0, -0.9, 1, 0, 0);
      for (let x0 = -L.h + sh; x0 < L.w + L.h; x0 += 36) g.fillRect(x0, 0, 14, L.h);
      g.restore();
      if (!still) { g.save(); g.globalCompositeOperation = 'lighter'; for (let i = 0; i < 14; i++) { const ph = (t * 0.03 + i * 0.137) % 1, mx = ((i * 0.618) % 1) * L.w * 0.6 + Math.sin(t * 0.4 + i) * 10, my = ph * L.h; g.fillStyle = `rgba(255,235,200,${0.35 * Math.sin(ph * Math.PI)})`; g.beginPath(); g.arc(mx, my, 0.8, 0, TAU); g.fill(); } g.restore(); }
    },
  };
  return T;
})();
