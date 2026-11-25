/* PR4 · Evac cockpit — diegetic: you read the results inside the evac helicopter at dawn. The team is on the left
 * multi-function display (a physical bezel with push buttons, black glass, sun glare); the rewards are projected on the
 * see-through HUD combiner, so the city keeps falling away and banking slowly behind them. Items are "locked on" by a
 * target-designator box and painted in by a scan line; Supplies fill a gauge.
 */
const PR4 = (() => {
  const HUD = '#ffbf52', HUD_GLOW = 'rgba(255,170,60,0.85)', PH = '#e9f3ff';
  const col = { name: '#f4f8ff', sub: 'rgba(225,236,250,0.8)', mute: 'rgba(200,214,230,0.62)', accentText: '#ffd58a' };
  let look = 'dw1';
  const cityView = (w, h, lk) => cached(`pr4-city-${w}-${h}-${lk}`, () => {
    const W = w * 1.5, H = h * 1.5;
    const city = G7.render({ stage: 5, ppm: 20 * DPR, x0: 4, y0: 3, w: W / 20, h: H / 20, power: 'off', noLight: true });
    const [c, g] = mk(W, H); g.drawImage(city, 0, 0, W, H); grade(g, W, H, lk, 0.12);
    return c;
  });
  function live(g, L, state, t, still) {
    look = state === 'endless' ? 'dw2' : 'dw1';
    const cv = cityView(L.w, L.h, look), W = L.w * 1.5, H = L.h * 1.5;
    const k = still ? 1.1 : 1.1 - 0.1 * (0.5 - 0.5 * Math.cos(t * 0.21)); // climbing away
    const rot = still ? -0.02 : -0.02 + 0.022 * Math.sin(t * 0.13); // a slow bank
    g.save(); g.translate(L.w * 0.5, L.h * 0.55); g.rotate(rot); g.scale(k, k);
    g.drawImage(cv, -W / 2 + (still ? 0 : Math.sin(t * 0.09) * 14), -H / 2 + (still ? 0 : ((t * 6) % 40) - 20), W, H);
    g.restore();
    // haze banks drifting under the helicopter (parallax)
    g.save(); g.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++) {
      const px = ((i * 0.31 + (still ? 0 : t * 0.025)) % 1.4 - 0.2) * L.w, py = L.h * (0.2 + 0.2 * i);
      const gr = g.createRadialGradient(px, py, 0, px, py, L.w * 0.3); gr.addColorStop(0, look === 'dw1' ? 'rgba(255,200,160,0.10)' : 'rgba(170,190,230,0.09)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(px - L.w * 0.3, py - L.w * 0.3, L.w * 0.6, L.w * 0.6);
    }
    g.restore();
  }
  function osb(g, x, y, w, h) {
    castShadow(g, () => rrect(g, x, y, w, h, 2), { blur: 2, a: 0.8, dx: 0.6, dy: 1 });
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#5a6068'); gr.addColorStop(1, '#2a2e33');
    g.fillStyle = gr; rrect(g, x, y, w, h, 2); g.fill(); rrect(g, x, y, w, h, 2); bevel(g, x, y, w, h, 0.5, 0.6, 0.8);
  }
  const T = {
    code: 'PR4', col, live,
    adjust(L) {
      const S = L.small, bx = S ? 7 : 9, by = S ? 11 : 13;
      const left = { x: L.left.x + bx, y: L.left.y - 2 + by, w: L.left.w - bx * 2, h: L.left.h + 2 - by * 2 };
      const right = { x: L.right.x + 4, y: L.right.y + 2, w: L.right.w - 8, h: L.right.h - 6 };
      const hdr = S ? 22 : 26;
      return { ...L, left, right, leftB: L.left, rightB: L.right, hdr, lpad: S ? 8 : 12, rowH: S ? 33 : 39, title: S ? 24 : 30,
        view: { x: right.x + 8, y: right.y + hdr + 6, w: right.w - 16, h: right.h - hdr - 12 } };
    },
    bg(w, h, st) { look = st === 'endless' ? 'dw2' : 'dw1'; return cached(`pr4-bg-${w}-${h}-${look}`, () => { const [c, g] = mk(w, h); live(g, { w, h }, st, 0, true); return c; }); },
    shell(g, r, side, L) {
      if (side === 'left') {
        // cockpit structure: canopy frame across the top, corner struts, the glareshield at the foot
        const W = L.w, H = L.h;
        g.save();
        let gr = g.createLinearGradient(0, 0, 0, 10); gr.addColorStop(0, '#0b0d10'); gr.addColorStop(1, '#262b31');
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, 5); g.quadraticCurveTo(W / 2, 11, 0, 5); g.closePath(); g.fill();
        for (const sx of [0, 1]) {
          g.beginPath(); if (!sx) { g.moveTo(0, 0); g.lineTo(42, 0); g.lineTo(0, H * 0.62); } else { g.moveTo(W, 0); g.lineTo(W - 42, 0); g.lineTo(W, H * 0.62); } g.closePath();
          gr = g.createLinearGradient(sx ? W : 0, 0, sx ? W - 40 : 40, 0); gr.addColorStop(0, '#07090b'); gr.addColorStop(1, '#2b3036'); g.fillStyle = gr; g.fill();
          g.strokeStyle = 'rgba(255,220,180,0.35)'; g.lineWidth = 1; g.beginPath(); if (!sx) { g.moveTo(42, 0); g.lineTo(0, H * 0.62); } else { g.moveTo(W - 42, 0); g.lineTo(W, H * 0.62); } g.stroke();
        }
        const gy = H - (L.small ? 18 : 14);
        gr = g.createLinearGradient(0, gy, 0, H); gr.addColorStop(0, '#2a2f35'); gr.addColorStop(0.15, '#16191d'); gr.addColorStop(1, '#08090b');
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, gy + 6); g.quadraticCurveTo(W / 2, gy - 4, W, gy + 6); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); g.fill();
        g.save(); g.clip(); texture(g, TEX.fbm, 0, gy - 6, W, H - gy + 6, { op: 'soft-light', a: 0.8, scale: 0.4 }); texture(g, TEX.grain, 0, gy - 6, W, H - gy + 6, { op: 'overlay', a: 0.6 }); g.restore();
        g.strokeStyle = 'rgba(255,230,200,0.25)'; g.beginPath(); g.moveTo(0, gy + 6); g.quadraticCurveTo(W / 2, gy - 4, W, gy + 6); g.stroke();
        g.restore();
        // the MFD: bezel, push buttons, black glass
        const B = L.leftB, bp = () => rrect(g, B.x, B.y - 2, B.w, B.h + 2, 10);
        castShadow(g, bp, { blur: 12, a: 0.8, dx: 3, dy: 5 });
        gr = g.createLinearGradient(B.x, B.y, B.x + B.w * 0.3, B.y + B.h); gr.addColorStop(0, '#3d434a'); gr.addColorStop(1, '#16191d');
        g.fillStyle = gr; bp(); g.fill();
        g.save(); bp(); g.clip(); texture(g, TEX.fbm, B.x, B.y, B.w, B.h, { op: 'soft-light', a: 0.7, scale: 0.6 }); texture(g, TEX.grain, B.x, B.y, B.w, B.h, { op: 'overlay', a: 0.7 }); texture(g, TEX.scratch, B.x, B.y, B.w, B.h, { op: 'source-over', a: 0.2 }); g.restore();
        bp(); bevel(g, B.x, B.y, B.w, B.h, 0.45, 0.7, 1.2);
        const n = L.small ? 5 : 6, bw = (r.w - 20) / n;
        for (let i = 0; i < n; i++) { osb(g, r.x + 10 + i * bw + bw * 0.18, B.y + 1, bw * 0.64, 6); osb(g, r.x + 10 + i * bw + bw * 0.18, B.y + B.h - 8, bw * 0.64, 6); }
        g.fillStyle = '#ffbf52'; g.beginPath(); g.arc(B.x + B.w - 6, B.y + 4, 1.6, 0, TAU); g.fill(); bloom(g, B.x + B.w - 6, B.y + 4, 5, 'rgba(255,190,80,0.8)');
        const sp = () => rrect(g, r.x, r.y, r.w, r.h, 4);
        gr = g.createRadialGradient(r.x + r.w * 0.4, r.y + r.h * 0.4, 0, r.x + r.w / 2, r.y + r.h / 2, r.w); gr.addColorStop(0, '#0e1418'); gr.addColorStop(1, '#030507');
        g.fillStyle = gr; sp(); g.fill();
        g.save(); sp(); g.clip();
        g.fillStyle = 'rgba(160,220,255,0.025)'; for (let yy = r.y; yy < r.y + r.h; yy += 2) g.fillRect(r.x, yy, r.w, 1);
        g.restore();
        innerShade(g, sp, { blur: 5, a: 0.9, lw: 4 });
      } else {
        // the HUD combiner: smoked see-through glass in a thin frame, mount at the foot
        const p = () => chamfer(g, r.x, r.y, r.w, r.h, [4, 4, 14, 14]);
        g.save(); p(); g.clip();
        let gr = g.createLinearGradient(r.x, r.y, r.x + r.w * 0.3, r.y + r.h); gr.addColorStop(0, 'rgba(10,14,20,0.66)'); gr.addColorStop(1, 'rgba(4,6,10,0.78)');
        g.fillStyle = gr; g.fillRect(r.x, r.y, r.w, r.h);
        gr = g.createLinearGradient(r.x, r.y, r.x + r.w, r.y + r.h); gr.addColorStop(0, 'rgba(255,215,160,0.10)'); gr.addColorStop(0.3, 'rgba(255,215,160,0)'); g.fillStyle = gr; g.fillRect(r.x, r.y, r.w, r.h);
        // heading tape ticks along the top edge
        g.strokeStyle = 'rgba(255,191,82,0.4)'; g.lineWidth = 1;
        for (let xx = r.x + 30; xx < r.x + r.w - 20; xx += 8) { const big = Math.round((xx - r.x) / 8) % 4 === 0; g.beginPath(); g.moveTo(xx, r.y + 2); g.lineTo(xx, r.y + (big ? 7 : 4)); g.stroke(); }
        g.restore();
        g.strokeStyle = 'rgba(190,200,215,0.65)'; g.lineWidth = 1.5; p(); g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.5)'; g.lineWidth = 1; chamfer(g, r.x + 1.5, r.y + 1.5, r.w - 3, r.h - 3, [3, 3, 13, 13]); g.stroke();
        // mount arms
        for (const mx of [r.x + 18, r.x + r.w - 30]) { const gr2 = g.createLinearGradient(mx, 0, mx + 12, 0); gr2.addColorStop(0, '#59616a'); gr2.addColorStop(1, '#1a1d21'); g.fillStyle = gr2; g.fillRect(mx, r.y + r.h - 3, 12, 8); }
        g.strokeStyle = HUD; g.lineWidth = 1.4; g.globalAlpha = 0.9;
        neon(g, () => brackets(g, r.x + 4, r.y + 4, r.w - 8, r.h - 8, 10, 0), HUD_GLOW, 6); g.globalAlpha = 1;
      }
    },
    header(g, x, y, w, h) {
      crate(g, x + 10, y + 7, h - 6, { glow: true });
      text(g, 'RUN REWARDS', x + h + 12, y + h / 2 + 9, { px: 16, wt: 700, ls: 2.2, col: HUD, glow: HUD_GLOW, blur: 8 });
      g.fillStyle = 'rgba(255,191,82,0.6)'; g.fillRect(x + 10, y + h + 3, w - 20, 1);
      text(g, 'EVAC 1', x + w - 12, y + h / 2 + 9, { px: 14, wt: 600, ls: 1.5, col: 'rgba(255,191,82,0.75)', align: 'right', shadow: false });
    },
    title(g, x, y, w, t, wave, L) {
      const s = t.toUpperCase(), ww = tw(g, wave.toUpperCase(), 14, 600, 1.2) + 12;
      let px = L.title; while (px > 18 && tw(g, s, px, 700, 1.5) > w - ww - 6) px--;
      text(g, s, x, y - 2, { px, wt: 700, ls: 1.5, col: PH, glow: 'rgba(150,210,255,0.6)', blur: 10 });
      g.strokeStyle = 'rgba(233,243,255,0.7)'; g.lineWidth = 1; g.strokeRect(x + w - ww + 0.5, y - 19.5, ww - 1, 20);
      text(g, wave.toUpperCase(), x + w - ww / 2, y - 4, { px: 14, wt: 600, ls: 1.2, col: PH, align: 'center', shadow: false });
    },
    colHead(g, x, y, w, cols) {
      const o = { px: 14, wt: 600, col: 'rgba(170,215,255,0.7)', ls: 1.2, shadow: false };
      text(g, 'PLAYER', cols.name, y + 12, o); text(g, 'KILLS', cols.kills, y + 12, { ...o, align: 'right' }); text(g, 'EARNED', cols.earned, y + 12, { ...o, align: 'right' });
      g.fillStyle = 'rgba(170,215,255,0.35)'; g.fillRect(x, y + 17, w, 1);
    },
    player(g, x, y, w, h, p, i, cols, L) {
      g.fillStyle = SLOT[i]; neon(g, () => { g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x + 7, y + 11); g.lineTo(x, y + 16); g.closePath(); g.fill(); }, SLOT[i], 6);
      const ny = y + (L.small ? 15 : 17);
      const o = { glow: 'rgba(150,210,255,0.35)', blur: 5, shadow: false };
      text(g, p.name, cols.name, ny, { px: 17, wt: 600, col: PH, ...o });
      text(g, fmt(p.kills), cols.kills, ny, { px: 16, wt: 500, col: PH, align: 'right', ...o });
      text(g, '$' + fmt(p.earned), cols.earned, ny, { px: 16, wt: 600, col: PH, align: 'right', ...o });
      text(g, trLine(p.tr), cols.name, ny + 16, { px: 14, wt: 500, col: 'rgba(170,215,255,0.72)', shadow: false });
      g.fillStyle = 'rgba(170,215,255,0.12)'; g.fillRect(cols.name, y + h, w - (cols.name - x), 1);
    },
    btn(g, x, y, w, h, label, kind, pulse) {
      const s = label.toUpperCase();
      if (kind === 'primary') { // a backlit rubber key on the MFD
        const plate = cached(`pr4-key-${w}-${h}`, () => { const pad = 10, [c, b] = mk(w + pad * 2, h + pad * 2); b.translate(pad, pad); const p = () => rrect(b, 0, 0, w, h, 6);
          b.save(); b.shadowColor = 'rgba(255,170,60,0.7)'; b.shadowBlur = 7; b.fillStyle = '#ffbf52'; p(); b.fill(); b.restore();
          const gr = b.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#4a5058'); gr.addColorStop(1, '#1d2024'); b.fillStyle = gr; rrect(b, 1.5, 1.5, w - 3, h - 3, 5); b.fill();
          b.save(); rrect(b, 1.5, 1.5, w - 3, h - 3, 5); b.clip(); texture(b, TEX.grain, 0, 0, w, h, { op: 'overlay', a: 0.8 }); const hl = b.createLinearGradient(0, 0, 0, h / 2); hl.addColorStop(0, 'rgba(255,255,255,0.22)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); b.fillStyle = hl; b.fillRect(0, 0, w, h / 2); b.restore();
          return c; });
        g.drawImage(plate, x - 10, y - 10, w + 20, h + 20);
        let px = 16; while (px > 14 && tw(g, s, px, 700, 1.2) > w - 16) px -= 0.5;
        text(g, s, x + w / 2, y + h / 2 + 6, { px, wt: 700, ls: 1.2, col: '#fff3dc', align: 'center', glow: 'rgba(255,190,90,0.6)', blur: 6 });
        return;
      }
      // HUD symbology buttons
      const solid = kind === 'steel';
      g.save();
      if (solid) { g.fillStyle = 'rgba(240,246,255,0.92)'; chamfer(g, x, y, w, h, 5); g.fill(); }
      else { g.fillStyle = 'rgba(40,24,4,0.55)'; chamfer(g, x, y, w, h, 5); g.fill(); g.strokeStyle = HUD; g.lineWidth = 1.4; neon(g, () => { chamfer(g, x, y, w, h, 5); g.stroke(); }, HUD_GLOW, 5 + 6 * (pulse || 0)); }
      g.restore();
      let px = 16, ls = 1.2; while (px > 14 && tw(g, s, px, 700, ls) > w - 14) { px -= 0.5; ls = 0.6; }
      text(g, s, x + w / 2, y + h / 2 + 6, { px, ls, wt: 700, align: 'center', col: solid ? '#0d1218' : HUD, shadow: false, glow: solid ? null : HUD_GLOW, blur: 6 });
    },
    well(g, x, y, s, a) {
      g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x, y, s, s);
      g.strokeStyle = 'rgba(255,191,82,0.18)'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(x + s / 2, y + 4); g.lineTo(x + s / 2, y + s - 4); g.moveTo(x + 4, y + s / 2); g.lineTo(x + s - 4, y + s / 2); g.stroke();
    },
    item(g, slot, id, x, y, s, a) {
      // painted in by a scan line (top → bottom), a dim wireframe-like silhouette first
      const scan = a.lt >= 99 ? 1 : clamp((a.lt - 0.3) / 0.45);
      g.save(); g.globalAlpha *= 0.6 * a.p; g.drawImage(itemArt(slot, id, s, 'sil'), x, y, s, s); g.restore();
      if (scan > 0) {
        g.save(); g.beginPath(); g.rect(x, y, s, s * scan); g.clip(); g.drawImage(itemArt(slot, id, s), x, y, s, s); g.restore();
        if (scan < 1) { const sy = y + s * scan; g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,200,110,0.9)'; g.shadowColor = HUD_GLOW; g.shadowBlur = 8; g.fillRect(x - 2, sy - 0.75, s + 4, 1.5); g.restore(); }
      }
    },
    wellTop(g, x, y, s, a) {
      // target designator: the box closes in and locks (ends on the landing flash)
      const lock = a.lt >= 99 ? 1 : ease(a.lt / 0.6), gap = (1 - lock) * s * 0.6;
      g.save(); g.strokeStyle = a.isNew ? HUD : 'rgba(233,243,255,0.85)'; g.lineWidth = 1.5; g.globalAlpha *= 0.7 + 0.3 * Math.max(a.pulse, a.flash);
      neon(g, () => brackets(g, x, y, s, s, 8, gap - 1), a.isNew ? HUD_GLOW : 'rgba(170,215,255,0.7)', 5 + 10 * a.flash);
      if (lock < 1) { g.globalAlpha = 0.6 * (1 - lock); g.beginPath(); g.arc(x + s / 2, y + s / 2, s * (0.75 - 0.25 * lock), 0, TAU); g.stroke(); }
      g.restore();
      if (a.flash > 0.01) { bloom(g, x + s / 2, y + s / 2, s * 0.9, `rgba(255,200,110,${0.45 * a.flash})`); text(g, 'LOCK', x + s / 2, y - 3, { px: 14, wt: 700, ls: 1.5, col: HUD, align: 'center', alpha: a.flash, shadow: false, glow: HUD_GLOW, blur: 6 }); }
    },
    tag(g, x, y, label, kind, a, L, slot) {
      const s = label.toUpperCase(); let tx = x + 5; const w0 = tw(g, s, 14, 700, 1.3) + (kind === 'slot' ? 24 : 10);
      g.save(); if (a) g.globalAlpha *= a.tag;
      const c2 = kind === 'amber' ? HUD : kind === 'steel' ? 'rgba(170,215,255,0.9)' : PH;
      g.strokeStyle = c2; g.lineWidth = 1; g.beginPath(); g.moveTo(x + 4, y); g.lineTo(x, y); g.lineTo(x, y + 19); g.lineTo(x + 4, y + 19); g.moveTo(x + w0 - 4, y); g.lineTo(x + w0, y); g.lineTo(x + w0, y + 19); g.lineTo(x + w0 - 4, y + 19); g.stroke();
      if (kind === 'slot') { g.fillStyle = SLOT[slot]; neon(g, () => { g.beginPath(); g.moveTo(x + 6, y + 5); g.lineTo(x + 13, y + 9.5); g.lineTo(x + 6, y + 14); g.closePath(); g.fill(); }, SLOT[slot], 5); tx = x + 18; }
      text(g, s, tx, y + 15, { px: 14, wt: 700, ls: 1.3, col: c2, shadow: false, glow: kind === 'amber' ? HUD_GLOW : null, blur: 5 });
      g.restore(); return w0;
    },
    number(g, x, y, v, px, tt, still, L) {
      const s = '+' + fmt(v);
      text(g, s, x, y, { px, wt: 700, col: HUD, glow: HUD_GLOW, blur: 12, shadow: false });
      g.save(); g.globalCompositeOperation = 'lighter'; text(g, s, x, y, { px, wt: 700, col: 'rgba(255,245,225,0.35)', shadow: false }); g.restore();
      return tw(g, s, px, 700);
    },
    rookie(g, xr, y, sp) {
      const w = 136, h = 22, x = xr - w, k = sp < 1 ? lerp(1.6, 1, backOut(sp)) : 1;
      g.save(); g.translate(x + w / 2, y + h / 2); g.scale(k, k); g.translate(-x - w / 2, -y - h / 2); g.globalAlpha *= clamp(sp * 3) * (sp < 1 ? (Math.sin(sp * 50) > -0.3 ? 1 : 0.3) : 1);
      g.fillStyle = HUD; neon(g, () => { chamfer(g, x, y, w, h, 5); g.fill(); }, HUD_GLOW, 8);
      text(g, 'ROOKIE BONUS ×2', x + w / 2, y + 16, { px: 14, wt: 700, ls: 1.2, col: '#1d1203', align: 'center', shadow: false });
      g.restore();
    },
    ledger(g, x, y, w, lab, val, a) {
      g.save(); g.globalAlpha *= a;
      text(g, lab, x, y, { px: 14, wt: 500, col: col.sub, shadow: false });
      const vs = '+' + val; text(g, vs, x + w, y, { px: 14, wt: 600, col: HUD, align: 'right', shadow: false, glow: HUD_GLOW, blur: 4 });
      // gauge segment that fills as the line lands
      const gx = x + tw(g, lab, 14, 500) + 8, gw = w - (gx - x) - tw(g, vs, 14, 600) - 8, n = Math.floor(gw / 5);
      for (let i = 0; i < n; i++) { g.fillStyle = i / n < a ? 'rgba(255,191,82,0.55)' : 'rgba(255,191,82,0.12)'; g.fillRect(gx + i * 5, y - 7, 3, 4); }
      g.restore();
    },
    total(g, x, y, w, v) {
      g.fillStyle = 'rgba(255,191,82,0.45)'; g.fillRect(x, y - 16, w, 1);
      text(g, 'TOTAL', x, y, { px: 14, wt: 600, ls: 1.4, col: col.mute, shadow: false });
      const s = fmt(v) + ' Supplies', sw = tw(g, s, 16, 600);
      text(g, s, x + w, y + 1, { px: 16, wt: 600, col: PH, align: 'right', shadow: false });
      crate(g, x + w - sw - 19, y - 13, 16);
    },
    divider(g, x, y, w) {
      g.strokeStyle = 'rgba(255,191,82,0.45)'; g.lineWidth = 1; g.setLineDash([2, 4]); g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y); g.stroke(); g.setLineDash([]);
    },
    iconBox(g, x, y, w, h) { g.fillStyle = 'rgba(0,0,0,0.4)'; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(233,243,255,0.55)'; g.lineWidth = 1; brackets(g, x, y, w, h, 6, 0); },
    nudgeBox(g, x, y, w, h) { g.fillStyle = 'rgba(170,215,255,0.08)'; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(170,215,255,0.6)'; g.lineWidth = 1; brackets(g, x, y, w, h, 8, 0); },
    status(g, x, y, w, r, clock, still) {
      if (r.kind === 'saving') {
        g.save(); g.translate(x + 12, y + 18); g.strokeStyle = HUD; g.lineWidth = 1.5; neon(g, () => { g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.stroke(); }, HUD_GLOW, 5);
        const a = still ? 0.8 : clock * 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 9, Math.sin(a) * 9); g.stroke(); g.restore();
        text(g, 'UPLINK · SAVING…', x + 30, y + 25, { px: 19, wt: 700, ls: 1.5, col: HUD, glow: HUD_GLOW, blur: 6, shadow: false });
        for (let i = 0; i < 12; i++) { const on = still ? i < 5 : (i < (clock * 6) % 13); g.fillStyle = on ? 'rgba(255,191,82,0.8)' : 'rgba(255,191,82,0.15)'; g.fillRect(x + i * 14, y + 46, 10, 8); }
        return;
      }
      g.strokeStyle = PH; g.lineWidth = 1.5;
      if (r.kind === 'practice') { g.beginPath(); g.arc(x + 12, y + 16, 9, 0, TAU); g.moveTo(x + 2, y + 16); g.lineTo(x + 22, y + 16); g.moveTo(x + 12, y + 6); g.lineTo(x + 12, y + 26); g.stroke(); }
      else cloudX(g, x, y + 4, 24, PH);
      const lines = wrap(g, r.title, w - 34, 19, 700);
      lines.forEach((ln, i) => text(g, ln, x + 32, y + 22 + i * 22, { px: 19, wt: 700, col: PH, shadow: false, glow: 'rgba(150,210,255,0.4)', blur: 6 }));
      const hy = y + 22 + lines.length * 22 + 2;
      wrap(g, r.hint, w - 34, 15, 500).forEach((ln, i) => text(g, ln, x + 32, hy + i * 18, { px: 15, wt: 500, col: col.sub, shadow: false }));
    },
    scrollCue(g, L, pos, frac) {
      const V = L.view, x = L.right.x + L.right.w - 6, h = V.h - 10, th = Math.max(20, h * frac);
      g.fillStyle = 'rgba(255,191,82,0.2)'; g.fillRect(x, V.y + 4, 1, h);
      g.fillStyle = HUD; g.beginPath(); const ty = V.y + 4 + (h - th) * pos; g.moveTo(x - 4, ty + th / 2); g.lineTo(x, ty + th / 2 - 4); g.lineTo(x, ty + th / 2 + 4); g.closePath(); g.fill(); g.fillRect(x - 0.5, ty, 2, th);
    },
    overlay(g, L, t, still) {
      // sun glare on the MFD glass + a slow glint along the canopy frame
      const r = L.left;
      g.save(); rrect(g, r.x, r.y, r.w, r.h, 4); g.clip();
      const gr = g.createLinearGradient(r.x, r.y, r.x + r.w * 0.7, r.y + r.h); gr.addColorStop(0, 'rgba(255,220,180,0.10)'); gr.addColorStop(0.28, 'rgba(255,220,180,0.03)'); gr.addColorStop(0.3, 'rgba(255,220,180,0)'); g.fillStyle = gr; g.fillRect(r.x, r.y, r.w, r.h);
      g.restore();
      if (!still) { const gx = ((t * 0.08) % 1.3 - 0.15) * L.w; bloom(g, gx, 4, 26, 'rgba(255,230,190,0.35)'); }
    },
  };
  return T;
})();
