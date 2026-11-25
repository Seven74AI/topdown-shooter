/* PR2 · Field case — heavy machined metal: brushed gunmetal frames with bevels, hex screws, chipped enamel and
 * grime; recessed enamel faces; players on stamped steel dog tags; Supplies on a mechanical odometer; new items
 * revealed by an iris shutter in a machined well with a glass cover and an amber enamel ring.
 */
const PR2 = (() => {
  const col = { name: C.ink, sub: C.ink2, mute: C.mute, accentText: C.amberHi };
  const BRASS = ['#f3d79a', '#c99a45', '#7b5418'];
  function screw(g, x, y, r = 3.2, rot = 0.4) {
    castShadow(g, () => { g.beginPath(); g.arc(x, y, r, 0, TAU); }, { blur: 2, a: 0.7, dx: 0.8, dy: 1.2 });
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.5, 0, x, y, r); gr.addColorStop(0, '#eef2f5'); gr.addColorStop(0.6, '#8d98a3'); gr.addColorStop(1, '#3a424b');
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.fillStyle = '#20262c'; g.beginPath(); for (let i = 0; i < 6; i++) { const a = rot + i * TAU / 6; g.lineTo(x + Math.cos(a) * r * 0.48, y + Math.sin(a) * r * 0.48); } g.closePath(); g.fill();
  }
  function chips(g, pathFn, x, y, w, h, seed, n = 14) {
    const r = rng(seed);
    g.save(); pathFn(); g.clip();
    for (let i = 0; i < n; i++) {
      const side = Math.floor(r() * 4), t = r();
      const cx = side === 0 ? x + t * w : side === 1 ? x + w : side === 2 ? x + t * w : x;
      const cy = side === 0 ? y : side === 1 ? y + t * h : side === 2 ? y + h : y + t * h;
      const rad = 1.2 + r() * 2.6;
      g.beginPath(); for (let k = 0; k < 7; k++) { const a = k / 7 * TAU, rr = rad * (0.6 + r() * 0.6); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.8); } g.closePath();
      g.fillStyle = 'rgba(190,200,210,0.55)'; g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.6; g.stroke();
    }
    g.restore();
  }
  function metal(g, pathFn, x, y, w, h, { c0 = '#5a636d', c1 = '#2c333b', c2 = '#1b2026', brushed = 0.6, seed = 1, chipN = 14, grime = 0.4 } = {}) {
    const gr = g.createLinearGradient(x, y, x + w * 0.35, y + h); gr.addColorStop(0, c0); gr.addColorStop(0.5, c1); gr.addColorStop(1, c2);
    g.fillStyle = gr; pathFn(); g.fill();
    g.save(); pathFn(); g.clip();
    texture(g, TEX.brushed, x, y, w, h, { op: 'overlay', a: brushed, scale: 0.55, oy: seed * 37 });
    texture(g, TEX.fbm, x, y, w, h, { op: 'multiply', a: grime, scale: 0.8, ox: seed * 53 });
    texture(g, TEX.scratch, x, y, w, h, { op: 'source-over', a: 0.35, scale: 0.6, ox: seed * 19 });
    keyWash(g, x, y, w, h, 0.14, 0.3);
    g.restore();
    if (chipN) chips(g, pathFn, x, y, w, h, seed, chipN);
  }
  /** Recessed enamel face: inverse bevel (dark upper-left lip, light lower-right lip). */
  function face(g, x, y, w, h, c, seed) {
    const p = () => chamfer(g, x, y, w, h, c);
    const gr = g.createLinearGradient(x, y, x, y + h); gr.addColorStop(0, '#1a2026'); gr.addColorStop(1, '#0c1014');
    g.fillStyle = gr; p(); g.fill();
    g.save(); p(); g.clip(); texture(g, TEX.fbm, x, y, w, h, { op: 'soft-light', a: 0.6, scale: 1.1, ox: seed * 41 }); texture(g, TEX.grain, x, y, w, h, { op: 'overlay', a: 0.5 }); g.restore();
    innerShade(g, p, { blur: 7, a: 0.75, lw: 6 });
    g.save(); p(); const bg = g.createLinearGradient(x, y, x + w * 0.3, y + h); bg.addColorStop(0, 'rgba(0,0,0,0.8)'); bg.addColorStop(0.6, 'rgba(0,0,0,0)'); bg.addColorStop(1, 'rgba(255,255,255,0.28)'); g.strokeStyle = bg; g.lineWidth = 1.4; g.stroke(); g.restore();
  }
  const T = {
    code: 'PR2', col,
    bg: (w, h, st) => dawn(w, h, st === 'endless' ? 'dw2' : 'dw1', { dim: 0.32 }),
    shell(g, r, side) {
      const p = () => chamfer(g, r.x, r.y, r.w, r.h, 9);
      castShadow(g, p, { blur: 16, a: 0.8, dx: 4, dy: 7 });
      metal(g, p, r.x, r.y, r.w, r.h, { seed: side === 'right' ? 3 : 7, chipN: 22 });
      g.save(); chamfer(g, r.x + 0.75, r.y + 0.75, r.w - 1.5, r.h - 1.5, 8.5); bevel(g, r.x, r.y, r.w, r.h, 0.7, 0.8, 1.5); g.restore();
      face(g, r.x + 6, r.y + 6, r.w - 12, r.h - 12, 6, side === 'right' ? 5 : 9);
      for (const [sx, sy] of [[r.x + 9, r.y + 3.3], [r.x + r.w - 9, r.y + 3.3], [r.x + 9, r.y + r.h - 3.3], [r.x + r.w - 9, r.y + r.h - 3.3]]) screw(g, sx, sy, 2.4, sx * 0.7);
      if (side === 'right') { // brass rail
        const gr = g.createLinearGradient(0, r.y + r.h - 4, 0, r.y + r.h); gr.addColorStop(0, BRASS[0]); gr.addColorStop(0.5, BRASS[1]); gr.addColorStop(1, BRASS[2]);
        g.fillStyle = gr; g.fillRect(r.x + 22, r.y + r.h - 4.5, r.w - 44, 3);
      }
    },
    header(g, x, y, w, h) {
      const px0 = x + 10, py = y + 8, ph = h - 6, pw = tw(g, 'RUN REWARDS', 16, 700, 2) + ph + 26;
      const p = () => chamfer(g, px0, py, pw, ph, 3);
      castShadow(g, p, { blur: 3, a: 0.7, dx: 1, dy: 2 });
      metal(g, p, px0, py, pw, ph, { c0: '#b6bfc8', c1: '#7f8a95', c2: '#56606b', brushed: 0.7, seed: 11, chipN: 5, grime: 0.25 });
      p(); bevel(g, px0, py, pw, ph, 0.8, 0.7, 1);
      crate(g, px0 + 6, py + 3, ph - 6);
      text(g, 'RUN REWARDS', px0 + ph + 6, py + ph / 2 + 6, { px: 16, wt: 700, ls: 2, col: '#3b2504', engrave: true });
      text(g, 'RUN REWARDS', px0 + ph + 6, py + ph / 2 + 6, { px: 16, wt: 700, ls: 2, col: '#2a1a03', shadow: false, alpha: 0.85 });
      screw(g, px0 + pw - 6, py + ph / 2, 2.2);
      // engraved groove under
      g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x + 10, y + h + 3, w - 20, 1); g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + 10, y + h + 4, w - 20, 1);
    },
    title(g, x, y, w, t, wave, L) {
      const s = t.toUpperCase();
      const tagW = tw(g, wave.toUpperCase(), 14, 700, 1) + 20;
      let px = L.title; while (px > 18 && tw(g, s, px, 700, 1.5) > w - tagW - 6) px--;
      text(g, s, x, y, { px, wt: 700, ls: 1.5, col: '#000', engrave: true });
      text(g, s, x, y, { px, wt: 700, ls: 1.5, fill: steelFill(g, y, px * 0.8), shadow: false });
      // stamped brass wave tag with a rivet
      const tx = x + w - tagW, ty = y - 20, p = () => chamfer(g, tx, ty, tagW, 22, 3);
      castShadow(g, p, { blur: 3, a: 0.7, dx: 1, dy: 2 });
      metal(g, p, tx, ty, tagW, 22, { c0: BRASS[0], c1: BRASS[1], c2: BRASS[2], brushed: 0.5, seed: 21, chipN: 3, grime: 0.3 });
      p(); bevel(g, tx, ty, tagW, 22, 0.8, 0.7, 1);
      g.fillStyle = '#3a2508'; g.beginPath(); g.arc(tx + 6, ty + 11, 2, 0, TAU); g.fill();
      text(g, wave.toUpperCase(), tx + 11, ty + 16, { px: 14, wt: 700, ls: 1, col: '#2b1a04', emboss: true });
      text(g, wave.toUpperCase(), tx + 11, ty + 16, { px: 14, wt: 700, ls: 1, col: '#2b1a04', shadow: false });
    },
    colHead(g, x, y, w, cols) {
      const o = { px: 14, wt: 600, col: '#7f8a96', ls: 1.4, engrave: true };
      text(g, 'PLAYER', cols.name, y + 12, o); text(g, 'KILLS', cols.kills, y + 12, { ...o, align: 'right' }); text(g, 'EARNED', cols.earned, y + 12, { ...o, align: 'right' });
      text(g, 'PLAYER', cols.name, y + 12, { ...o, engrave: false, shadow: false }); text(g, 'KILLS', cols.kills, y + 12, { ...o, engrave: false, shadow: false, align: 'right' }); text(g, 'EARNED', cols.earned, y + 12, { ...o, engrave: false, shadow: false, align: 'right' });
    },
    player(g, x, y, w, h, p, i, cols, L) {
      // a stamped steel dog tag with a rolled edge, slot-colour enamel and a hole
      const tx = x - 3, tw0 = w + 6, th = h - 1, rr = 8;
      const path = () => rrect(g, tx, y, tw0, th, rr);
      castShadow(g, path, { blur: 4, a: 0.75, dx: 1.5, dy: 2.5 });
      metal(g, path, tx, y, tw0, th, { c0: '#c3cbd3', c1: '#98a2ac', c2: '#6c7681', brushed: 0.55, seed: 30 + i, chipN: 0, grime: 0.45 });
      g.save(); rrect(g, tx + 2, y + 2, tw0 - 4, th - 4, rr - 2); const gr = g.createLinearGradient(tx, y, tx, y + th); gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(255,255,255,0.45)'); g.strokeStyle = gr; g.lineWidth = 1; g.stroke(); g.restore();
      path(); bevel(g, tx, y, tw0, th, 0.9, 0.6, 1);
      // enamel stripe
      g.save(); path(); g.clip(); g.fillStyle = SLOT[i]; g.fillRect(tx, y, 7, th);
      const eg = g.createLinearGradient(tx, y, tx + 7, y); eg.addColorStop(0, 'rgba(255,255,255,0.45)'); eg.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = eg; g.fillRect(tx, y, 7, th); g.restore();
      g.fillStyle = '#20262c'; g.beginPath(); g.arc(tx + 13, y + th / 2, 2.4, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 0.7; g.beginPath(); g.arc(tx + 13, y + th / 2, 3.3, 0.2, Math.PI * 1.2); g.stroke();
      const ny = y + (L.small ? 15 : 17), ink = '#141a20';
      const st = (s, xx, yy, o) => { text(g, s, xx, yy, { ...o, emboss: true }); text(g, s, xx, yy, { ...o, shadow: false }); };
      st(p.name, cols.name + 4, ny, { px: 17, wt: 700, col: ink });
      st(fmt(p.kills), cols.kills, ny, { px: 16, wt: 600, col: ink, align: 'right' });
      st('$' + fmt(p.earned), cols.earned, ny, { px: 16, wt: 700, col: ink, align: 'right' });
      text(g, trLine(p.tr), cols.name + 4, ny + 15, { px: 14, wt: 500, col: '#2a323a', shadow: false });
    },
    btn(g, x, y, w, h, label, kind, pulse) {
      const plate = cached(`pr2-btn-${kind}-${w}-${h}`, () => {
        const pad = 12, [c, b] = mk(w + pad * 2, h + pad * 2); b.translate(pad, pad);
        const p = () => rrect(b, 0, 0, w, h - 3, 5), side = () => rrect(b, 0, 3, w, h - 3, 5);
        castShadow(b, side, { blur: 5, a: 0.8, dx: 2, dy: 3 });
        const cs = kind === 'amber' ? ['#ffd277', '#e39a26', '#a5620c', '#5a3304'] : kind === 'steel' ? ['#f1f4f7', '#c2ccd5', '#8995a1', '#4a535c'] : ['#6c7681', '#434c56', '#2a3139', '#14181d'];
        b.fillStyle = cs[3]; side(); b.fill();
        metal(b, p, 0, 0, w, h - 3, { c0: cs[0], c1: cs[1], c2: cs[2], brushed: kind === 'amber' ? 0.25 : 0.55, seed: w + h, chipN: kind === 'amber' ? 6 : 3, grime: 0.3 });
        rrect(b, 0.75, 0.75, w - 1.5, h - 4.5, 4.5); bevel(b, 0, 0, w, h - 3, 0.9, 0.6, 1.4);
        if (kind === 'amber') { b.save(); p(); b.clip(); const gl = b.createLinearGradient(0, 0, 0, h * 0.5); gl.addColorStop(0, 'rgba(255,255,255,0.35)'); gl.addColorStop(1, 'rgba(255,255,255,0)'); b.fillStyle = gl; b.fillRect(0, 0, w, h * 0.45); b.restore(); }
        return c;
      });
      g.drawImage(plate, x - 12, y - 12, w + 24, h + 24);
      if (kind === 'amber' && pulse) bloom(g, x + w / 2, y + h / 2, w * 0.75, `rgba(255,170,60,${0.16 * pulse})`);
      const dark = kind !== 'primary', s = label.toUpperCase();
      let px = 16, ls = 1.2; while (px > 14 && tw(g, s, px, 700, ls) > w - 14) { px -= 0.5; ls = 0.6; }
      const o = { px, ls, wt: 700, align: 'center', col: dark ? (kind === 'amber' ? '#2e1a02' : '#151b21') : '#f4f6f8' };
      if (dark) { text(g, s, x + w / 2, y + h / 2 + 4.5, { ...o, emboss: true }); text(g, s, x + w / 2, y + h / 2 + 4.5, { ...o, shadow: false }); }
      else text(g, s, x + w / 2, y + h / 2 + 4.5, { ...o, engrave: false });
    },
    well(g, x, y, s) {
      const base = cached(`pr2-well-${s}`, () => {
        const pad = 6, [c, b] = mk(s + pad * 2, s + pad * 2); b.translate(pad, pad);
        const p = () => rrect(b, 0, 0, s, s, 8);
        metal(b, p, 0, 0, s, s, { c0: '#6b747e', c1: '#3c444d', c2: '#232930', brushed: 0.3, seed: s, chipN: 4 });
        // lathe rings
        const cx = s / 2, cy = s / 2;
        b.save(); p(); b.clip();
        for (let r = s * 0.5; r > s * 0.38; r -= 1.2) { b.strokeStyle = `rgba(${r % 2.4 < 1.2 ? '255,255,255,0.10' : '0,0,0,0.25'})`; b.lineWidth = 0.6; b.beginPath(); b.arc(cx, cy, r, 0, TAU); b.stroke(); }
        const gr = b.createRadialGradient(cx - s * 0.08, cy - s * 0.1, 0, cx, cy, s * 0.42); gr.addColorStop(0, '#34404c'); gr.addColorStop(1, '#090c10');
        b.fillStyle = gr; b.beginPath(); b.arc(cx, cy, s * 0.42, 0, TAU); b.fill();
        b.restore();
        b.save(); b.beginPath(); b.arc(cx, cy, s * 0.42, 0, TAU); const bg = b.createLinearGradient(0, 0, s, s); bg.addColorStop(0, 'rgba(0,0,0,0.85)'); bg.addColorStop(1, 'rgba(255,255,255,0.35)'); b.strokeStyle = bg; b.lineWidth = 1.4; b.stroke(); b.restore();
        p(); bevel(b, 0, 0, s, s, 0.7, 0.7, 1.2);
        return c;
      });
      g.drawImage(base, x - 6, y - 6, s + 12, s + 12);
    },
    item(g, slot, id, x, y, s, a) {
      g.save(); g.beginPath(); g.arc(x + s / 2, y + s / 2, s * 0.42, 0, TAU); g.clip();
      if (a.lit < 1) { g.save(); g.globalAlpha *= 1 - a.lit; g.drawImage(itemArt(slot, id, s, 'sil'), x, y, s, s); g.restore(); }
      if (a.lit > 0) { g.save(); g.globalAlpha *= a.lit; g.drawImage(itemArt(slot, id, s), x, y, s, s); g.restore(); }
      g.restore();
    },
    wellTop(g, x, y, s, a) {
      const cx = x + s / 2, cy = y + s / 2, R = s * 0.42;
      // iris shutter: six blades opening (0.05–0.55 s after the row lands)
      const open = a.lt >= 99 ? 1 : ease((a.lt - 0.05) / 0.5);
      if (open < 1) {
        const ap = R * open, rot = (1 - open) * 1.4;
        g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
        g.beginPath(); g.arc(cx, cy, R + 1, 0, TAU); if (ap > 0.5) g.arc(cx, cy, ap, 0, TAU, true);
        const gr = g.createLinearGradient(x, y, x + s, y + s); gr.addColorStop(0, '#5d6670'); gr.addColorStop(1, '#1e2329'); g.fillStyle = gr; g.fill('evenodd');
        g.strokeStyle = 'rgba(0,0,0,0.75)'; g.lineWidth = 0.9;
        for (let i = 0; i < 6; i++) { const ang = rot + i * TAU / 6; const sx = cx + Math.cos(ang) * Math.max(ap, 1), sy = cy + Math.sin(ang) * Math.max(ap, 1); g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(cx + Math.cos(ang + 0.7) * R * 0.8, cy + Math.sin(ang + 0.7) * R * 0.8, cx + Math.cos(ang + 1.3) * R, cy + Math.sin(ang + 1.3) * R); g.stroke(); }
        g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 0.6;
        for (let i = 0; i < 6; i++) { const ang = rot + i * TAU / 6 + 0.12; g.beginPath(); g.arc(cx, cy, Math.max(ap, 1) + 2, ang, ang + 0.6); g.stroke(); }
        g.restore();
      }
      // glass cover: reflection + travelling glint
      g.save(); g.beginPath(); g.arc(cx, cy, R, 0, TAU); g.clip();
      const gl = g.createLinearGradient(x, y, x + s * 0.7, y + s * 0.7); gl.addColorStop(0, 'rgba(255,255,255,0.22)'); gl.addColorStop(0.4, 'rgba(255,255,255,0.03)'); gl.addColorStop(0.42, 'rgba(255,255,255,0)'); g.fillStyle = gl; g.fillRect(x, y, s, s);
      sweep(g, x, y, s, s, a.sweep, { a: a.lt < 1.2 ? 0.55 : 0.18, width: 0.18, col: '255,245,225' });
      g.restore();
      // amber enamel ring (lights up on landing, then breathes)
      if (a.isNew) {
        g.save(); g.strokeStyle = C.amber; g.lineWidth = 1.6; g.globalAlpha *= 0.55 + 0.45 * Math.max(a.pulse, a.flash);
        neon(g, () => { g.beginPath(); g.arc(cx, cy, R + 1.4, 0, TAU); g.stroke(); }, C.amberGlow, 4 + 8 * a.pulse + 14 * a.flash); g.restore();
      }
      if (a.flash > 0.01) bloom(g, cx, cy, s * 0.9, `rgba(255,200,110,${0.4 * a.flash})`);
    },
    tag(g, x, y, label, kind, a, L, slot) {
      const s = label.toUpperCase(), w0 = tw(g, s, 14, 700, 1) + (kind === 'slot' ? 26 : 12), h = 19;
      const cs = kind === 'amber' ? ['#ffd277', '#e8a032', '#a8650d'] : kind === 'white' ? ['#f4f1e8', '#d9d4c6', '#a9a395'] : kind === 'steel' ? ['#c8d0d8', '#97a1ab', '#68727c'] : ['#4a535c', '#2c333a', '#1a1f24'];
      g.save(); if (a) g.globalAlpha *= a.lt < 99 ? ease((a.lt - 0.3) / 0.25) : 1;
      const p = () => chamfer(g, x, y, w0, h, 3);
      castShadow(g, p, { blur: 2, a: 0.6, dx: 1, dy: 1.5 });
      metal(g, p, x, y, w0, h, { c0: cs[0], c1: cs[1], c2: cs[2], brushed: 0.25, seed: w0, chipN: 2, grime: 0.2 });
      p(); bevel(g, x, y, w0, h, 0.8, 0.6, 1);
      let tx = x + 6;
      if (kind === 'slot') { g.fillStyle = SLOT[slot]; g.beginPath(); g.arc(x + 11, y + h / 2, 4.5, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 0.8; g.stroke(); tx = x + 20; }
      const ink = kind === 'slot' ? '#f4f6f8' : kind === 'amber' ? '#2e1a02' : '#1a1f24';
      if (kind !== 'slot') text(g, s, tx, y + 15, { px: 14, wt: 700, ls: 1, col: ink, emboss: true });
      text(g, s, tx, y + 15, { px: 14, wt: 700, ls: 1, col: ink, shadow: kind === 'slot' });
      g.restore(); return w0;
    },
    /** A mechanical odometer: digit drums roll in recessed windows behind glass. */
    number(g, x, y, v, px) {
      const n = 3, dw = Math.round(px * 0.6), dh = px + 6, top = y - px + 1, plusW = px * 0.5;
      text(g, '+', x, y - 2, { px: px * 0.8, wt: 700, fill: goldFill(g, y, px * 0.6), glow: 'rgba(255,150,30,0.4)', blur: 8 });
      const ox = x + plusW;
      for (let i = 0; i < n; i++) {
        const p = n - 1 - i, wx = ox + i * (dw + 2);
        const path = () => rrect(g, wx, top - 3, dw, dh, 3);
        g.fillStyle = '#07090c'; path(); g.fill();
        const q = v / Math.pow(10, p), base = Math.floor(q), frac = q - base;
        const roll = p === 0 ? frac : clamp((v % Math.pow(10, p)) - (Math.pow(10, p) - 1));
        const d0 = base % 10, d1 = (d0 + 1) % 10;
        g.save(); path(); g.clip();
        const dy = roll * px;
        for (const [d, off] of [[d0, 0], [d1, px]]) text(g, String(d), wx + dw / 2, y + off - dy, { px, wt: 700, align: 'center', fill: goldFill(g, y + off - dy, px * 0.75), shadow: false });
        const sh = g.createLinearGradient(0, top - 3, 0, top - 3 + dh); sh.addColorStop(0, 'rgba(0,0,0,0.85)'); sh.addColorStop(0.25, 'rgba(0,0,0,0)'); sh.addColorStop(0.75, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(0,0,0,0.85)');
        g.fillStyle = sh; g.fillRect(wx, top - 3, dw, dh);
        const gl = g.createLinearGradient(wx, top, wx + dw, top + dh); gl.addColorStop(0, 'rgba(255,255,255,0.16)'); gl.addColorStop(0.45, 'rgba(255,255,255,0.02)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)'); g.fillStyle = gl; g.fillRect(wx, top - 3, dw, dh);
        g.restore();
        path(); const bg = g.createLinearGradient(wx, top, wx, top + dh); bg.addColorStop(0, 'rgba(0,0,0,0.9)'); bg.addColorStop(1, 'rgba(255,255,255,0.3)'); g.strokeStyle = bg; g.lineWidth = 1.2; g.stroke();
      }
      return plusW + n * (dw + 2);
    },
    rookie(g, xr, y, sp, L) {
      const two = L.small, w = two ? 72 : 136, h = two ? 38 : 22, x = xr - w;
      const k = sp < 1 ? lerp(1.7, 1, backOut(sp)) : 1, rot = sp < 1 ? (1 - sp) * -0.25 : -0.04;
      g.save(); g.translate(x + w / 2, y + h / 2); g.rotate(rot); g.scale(k, k); g.translate(-x - w / 2, -y - h / 2); g.globalAlpha *= clamp(sp * 3);
      const p = () => chamfer(g, x, y, w, h, 4);
      castShadow(g, p, { blur: 4, a: 0.75, dx: 2, dy: 3 });
      metal(g, p, x, y, w, h, { c0: '#ffd277', c1: '#e39a26', c2: '#9b5a0a', brushed: 0.2, seed: 77, chipN: 8, grime: 0.35 });
      p(); bevel(g, x, y, w, h, 0.9, 0.6, 1.2);
      g.fillStyle = '#5a3304'; for (const rx of [x + 5, x + w - 5]) { g.beginPath(); g.arc(rx, y + h / 2, 1.8, 0, TAU); g.fill(); }
      const o = { px: 14, wt: 700, ls: 0.8, col: '#2e1a02', align: 'center' };
      const st = (s, yy) => { text(g, s, x + w / 2, yy, { ...o, emboss: true }); text(g, s, x + w / 2, yy, { ...o, shadow: false }); };
      if (two) { st('ROOKIE', y + 16); st('BONUS ×2', y + 32); } else st('ROOKIE BONUS ×2', y + 16);
      g.restore();
      if (sp > 0 && sp < 1) bloom(g, x + w / 2, y + h / 2, w * 0.8, `rgba(255,200,120,${0.45 * (1 - sp)})`);
    },
    ledger(g, x, y, w, lab, val, a) {
      g.save(); g.globalAlpha *= a; g.translate(0, (1 - a) * 6);
      text(g, lab, x, y, { px: 14, wt: 500, col: C.ink2 });
      const lw = tw(g, lab, 14, 500) + 6, vs = '+' + val, vw = tw(g, vs, 14, 700);
      for (let xx = x + lw; xx < x + w - vw - 6; xx += 5) { g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(xx, y - 3, 2, 1); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(xx, y - 2, 2, 1); }
      text(g, vs, x + w, y, { px: 14, wt: 700, col: C.amber, align: 'right' });
      g.restore();
    },
    total(g, x, y, w, v) {
      g.fillStyle = 'rgba(0,0,0,0.7)'; g.fillRect(x, y - 16, w, 1); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x, y - 15, w, 1);
      text(g, 'TOTAL', x, y, { px: 14, wt: 600, ls: 1.4, col: C.mute });
      const s = fmt(v) + ' Supplies', sw = tw(g, s, 16, 700);
      text(g, s, x + w, y + 1, { px: 16, wt: 700, col: C.ink, align: 'right' });
      crate(g, x + w - sw - 19, y - 13, 16);
    },
    divider(g, x, y, w) {
      g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(x + 8, y, w - 16, 1.2); g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(x + 8, y + 1.2, w - 16, 1);
      if (w > 30) { screw(g, x + 2, y + 0.5, 2, 0.2); screw(g, x + w - 2, y + 0.5, 2, 1.1); }
    },
    iconBox(g, x, y, w, h) {
      const p = () => rrect(g, x, y, w, h, 5);
      g.fillStyle = '#080b0e'; p(); g.fill();
      innerShade(g, p, { blur: 5, a: 0.9, lw: 4 });
      p(); const bg = g.createLinearGradient(x, y, x, y + h); bg.addColorStop(0, 'rgba(0,0,0,0.9)'); bg.addColorStop(1, 'rgba(255,255,255,0.28)'); g.strokeStyle = bg; g.lineWidth = 1.2; g.stroke();
    },
    nudgeBox(g, x, y, w, h) {
      const p = () => chamfer(g, x, y, w, h, 5);
      castShadow(g, p, { blur: 5, a: 0.7, dx: 2, dy: 3 });
      metal(g, p, x, y, w, h, { c0: '#3e4750', c1: '#2a3139', c2: '#1b2026', brushed: 0.5, seed: 91, chipN: 6 });
      p(); bevel(g, x, y, w, h, 0.6, 0.7, 1.2);
      screw(g, x + 5, y + 5, 2, 0.3); screw(g, x + 5, y + h - 5, 2, 0.9);
    },
    status(g, x, y, w, r, clock, still) {
      if (r.kind === 'saving') {
        spinner(g, x + 12, y + 18, 9, still ? 0.4 : clock, C.amber);
        text(g, 'SAVING…', x + 30, y + 25, { px: 20, wt: 700, ls: 1.5, col: C.ink });
        for (let i = 0; i < 3; i++) { const yy = y + 46 + i * 24, ww = [w * 0.85, w * 0.7, w * 0.55][i]; T.iconBox(g, x, yy, ww, 15); g.save(); rrect(g, x, yy, ww, 15, 5); g.clip(); sweep(g, x, yy, ww, 15, still ? 0.5 : ((clock * 0.6 + i * 0.12) % 1.4) / 1.4 * 1.4 - 0.2, { a: 0.14, col: '255,220,170' }); g.restore(); }
        return;
      }
      T.iconBox(g, x, y + 2, 28, 28);
      if (r.kind === 'practice') { g.strokeStyle = C.steelHi; g.lineWidth = 1.6; g.beginPath(); g.arc(x + 14, y + 16, 8, 0, TAU); g.moveTo(x + 18, y + 16); g.arc(x + 14, y + 16, 4, 0, TAU); g.stroke(); }
      else cloudX(g, x + 3, y + 5, 22, C.steelHi);
      const lines = wrap(g, r.title, w - 38, 19, 700);
      lines.forEach((ln, i) => text(g, ln, x + 36, y + 22 + i * 22, { px: 19, wt: 700, col: C.ink }));
      const hy = y + 22 + lines.length * 22 + 2;
      wrap(g, r.hint, w - 38, 15, 500).forEach((ln, i) => text(g, ln, x + 36, hy + i * 18, { px: 15, wt: 500, col: C.ink2 }));
    },
    scrollCue(g, L, pos, frac) {
      const V = L.view, x = L.right.x + L.right.w - 9, h = V.h - 8, th = Math.max(22, h * frac);
      g.fillStyle = 'rgba(0,0,0,0.8)'; rrect(g, x - 1.5, V.y + 3, 4, h, 2); g.fill();
      const ty = V.y + 4 + (h - th) * pos, p = () => rrect(g, x - 2, ty, 5, th, 2.5);
      metal(g, p, x - 2, ty, 5, th, { c0: '#e3e9ee', c1: '#9aa5b0', c2: '#5b6670', brushed: 0.2, seed: 5, chipN: 0, grime: 0.1 });
      if (pos < 0.98) { const gr = g.createLinearGradient(0, V.y + V.h - 22, 0, V.y + V.h); gr.addColorStop(0, 'rgba(12,16,20,0)'); gr.addColorStop(1, 'rgba(12,16,20,0.95)'); g.fillStyle = gr; g.fillRect(V.x - 4, V.y + V.h - 22, V.w + 2, 22); }
    },
    overlay(g, L, t, still) {
      if (still) return;
      // a slow specular glint travelling along the top bevel of both frames
      for (const r of [L.left, L.right]) {
        const p = ((t * 0.12 + (r === L.right ? 0.4 : 0)) % 1.4) - 0.2, gx = r.x + r.w * p;
        g.save(); g.globalCompositeOperation = 'lighter';
        const gr = g.createRadialGradient(gx, r.y + 1, 0, gx, r.y + 1, 30); gr.addColorStop(0, 'rgba(255,245,230,0.5)'); gr.addColorStop(1, 'rgba(255,245,230,0)');
        g.fillStyle = gr; g.fillRect(gx - 30, r.y - 2, 60, 6); g.restore();
      }
    },
  };
  return T;
})();
