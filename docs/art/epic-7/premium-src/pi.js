/* Premium round 2 (interface) — PI1 Lumen, PI2 Field Ops, PI3 Arena.
 * One component set, three skins: layered panels (contact shadow · outer frame · inner bevel · recessed face · edge
 * highlight · header band · micro-typography · inlays), buttons (primary / secondary / tertiary × normal / pressed /
 * disabled), list rows (normal / hover / selected), item cards with rarity framing, tags, badges, counters with tabular
 * display numerals, fill bars, scroll indicator, modal frame. The Results + Run rewards screen is composed from them.
 */

// ---------- item renders: the game's drawSurvivor parts relit (port of photoreal-2/src/relight.ts) ----------
function relitItem(slot, id, s, tint = [1.04, 0.99, 0.92]) {
  return cached(`pi-relit-${slot}-${id}-${s}`, () => {
    const hash = (x, y, q) => { const h = Math.sin(x * 127.1 + y * 311.7 + q * 74.7) * 43758.5453; return h - Math.floor(h); };
    const blur = (a, w, h, r) => { const tmp = new Float32Array(w * h), rr = Math.max(1, Math.round(r)); for (let p = 0; p < 2; p++) { for (let y = 0; y < h; y++) { let acc = 0; for (let x = -rr; x <= rr; x++) acc += a[y * w + clamp(x, 0, w - 1)]; for (let x = 0; x < w; x++) { tmp[y * w + x] = acc / (2 * rr + 1); acc += a[y * w + Math.min(w - 1, x + rr + 1)] - a[y * w + Math.max(0, x - rr)]; } } for (let x = 0; x < w; x++) { let acc = 0; for (let y = -rr; y <= rr; y++) acc += tmp[clamp(y, 0, h - 1) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = acc / (2 * rr + 1); acc += tmp[Math.min(h - 1, y + rr + 1) * w + x] - tmp[Math.max(0, y - rr) * w + x]; } } } return a; };
    const ss = 2, W = Math.ceil(s * DPR * ss), t = tileGeom(slot, s);
    const src = document.createElement('canvas'); src.width = src.height = W;
    const sg = src.getContext('2d'); sg.scale(W / s, W / s); survivorAt(sg, tileLook(slot, id), s * t.cx, s * t.cy, t.r, t.ang);
    const d = sg.getImageData(0, 0, W, W).data, n = W * W, A = new Float32Array(n), lum = new Float32Array(n), E = new Float32Array(n);
    for (let i = 0; i < n; i++) { A[i] = d[i * 4 + 3] / 255; lum[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.55 + d[i * 4 + 2] * 0.15) / 255; }
    for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (A[i] < 0.5) continue; let e = 0; for (const j of [i - 1, i + 1, i - W, i + W]) e = Math.max(e, (Math.abs(d[i * 4] - d[j * 4]) + Math.abs(d[i * 4 + 1] - d[j * 4 + 1]) + Math.abs(d[i * 4 + 2] - d[j * 4 + 2])) / 255); E[i] = Math.min(1, Math.max(lum[i] < 0.09 ? 1 : 0, e > 0.25 ? e : 0)); }
    const cut = new Float32Array(n); for (let i = 0; i < n; i++) cut[i] = A[i] * (1 - E[i]);
    const k = W / (s * 2.2), b1 = blur(cut.slice(), W, W, 1.5 * k), b2 = blur(cut.slice(), W, W, 4 * k), b3 = blur(cut.slice(), W, W, 9 * k);
    const H = new Float32Array(n); for (let i = 0; i < n; i++) H[i] = (b1[i] * 0.25 + b2[i] * 0.35 + b3[i] * 0.4) * A[i] + (hash(i % W >> 1, (i / W | 0) >> 1, 3) - 0.5) * 0.03 * A[i] - E[i] * 0.08;
    const out = sg.createImageData(W, W), o = out.data, L0 = [-0.5, -0.72, 0.48], ll = Math.hypot(...L0), lx = L0[0] / ll, ly = L0[1] / ll, lz = L0[2] / ll, K = 9 / k * 1.1;
    for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
      const i = y * W + x, a = A[i]; if (a <= 0.004) continue;
      const dx = (H[i + 1] - H[i - 1]) * K, dy = (H[i + W] - H[i - W]) * K, nl = Math.hypot(dx, dy, 1), nx = -dx / nl, ny = -dy / nl, nz = 1 / nl, nd = nx * lx + ny * ly + nz * lz, diff = Math.max(0, nd);
      const r0 = d[i * 4], g0 = d[i * 4 + 1], b0 = d[i * 4 + 2], mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0), sat = mx > 0 ? (mx - mn) / mx : 0, l0 = lum[i];
      const gloss = Math.min(1, (l0 < 0.18 ? 0.6 : 0) + (sat > 0.55 ? 0.5 : 0) + (l0 > 0.8 ? 0.4 : 0) + 0.1), rz = 2 * nd * nz - lz, sp = Math.pow(Math.max(0, rz), 20) * gloss, gr = (hash(x, y, 9) - 0.5) * 12 * (1 - gloss);
      o[i * 4] = Math.min(255, (r0 + gr) * (0.4 + 0.92 * diff * tint[0]) + sp * 255); o[i * 4 + 1] = Math.min(255, (g0 + gr) * (0.4 + 0.92 * diff * tint[1]) + sp * 248); o[i * 4 + 2] = Math.min(255, (b0 + gr) * (0.4 + 0.92 * diff * tint[2]) + sp * 240); o[i * 4 + 3] = a * 255;
    }
    sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, W, W); sg.putImageData(out, 0, 0);
    const [c, g] = mk(s, s); g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, s, s);
    return c;
  });
}

function makePI(S) {
  const A = S.accent, AG = S.accentGlow;
  // ---------- shape language ----------
  function shape(g, x, y, w, h, c, kind = 'el') {
    if (S.shape === 'skew' && kind === 'el') { const k = Math.min(h * 0.28, 9); g.beginPath(); g.moveTo(x + k, y); g.lineTo(x + w, y); g.lineTo(x + w - k, y + h); g.lineTo(x, y + h); g.closePath(); return; }
    if (S.shape === 'skew') return chamfer(g, x, y, w, h, [0, c * 1.8, 0, c * 0.6]);
    if (S.shape === 'cut') return chamfer(g, x, y, w, h, kind === 'panel' ? [c * 1.6, 0, c * 0.7, 0] : [c, 0, 0, 0]);
    return chamfer(g, x, y, w, h, [c, 0, c, 0]);
  }
  const inset = (x, y, w, h, d) => [x + d, y + d, w - d * 2, h - d * 2];
  function micro(g, s, x, y, o = {}) { text(g, s, x, y, { px: o.px || 8.5, wt: 600, ls: o.ls != null ? o.ls : 1.4, col: o.col || S.mute, align: o.align || 'left', shadow: false }); }
  /** Tabular display numerals: each digit in a fixed cell (so counters never jitter). */
  function tnum(g, s, x, y, px, o = {}) {
    const cell = px * (o.cell || 0.56), wt = o.wt || S.numWt, sk = o.skew != null ? o.skew : S.numSkew;
    let cx = x; const w = [...s].reduce((a, ch) => a + (/\d/.test(ch) ? cell : tw(g, ch, px, wt) + px * 0.04), 0);
    if (o.align === 'right') cx = x - w; else if (o.align === 'center') cx = x - w / 2;
    g.save(); g.translate(cx, y); if (sk) g.transform(1, 0, -sk, 1, 0, 0);
    let ox = 0;
    for (const ch of s) {
      const dig = /\d/.test(ch), cw = dig ? cell : tw(g, ch, px, wt) + px * 0.04;
      if (o.dim && o.dim(ch, ox)) text(g, ch, ox + cw / 2, 0, { px, wt, col: o.dimCol || 'rgba(255,255,255,0.12)', align: 'center', shadow: false });
      else text(g, ch, ox + cw / 2, 0, { px, wt, align: 'center', shadow: false, fill: o.fill ? o.fill(g, px) : null, col: o.col || S.ink, glow: o.glow, blur: o.blur || 12 });
      ox += cw;
    }
    g.restore(); return w;
  }

  // ---------- surfaces ----------
  /** The layered panel: contact shadow, outer frame, inner bevel, recessed face, edge highlight, inlays. */
  function panel(g, x, y, w, h, o = {}) {
    const c = o.c || S.corner, fw = o.fw != null ? o.fw : S.fw, path = () => shape(g, x, y, w, h, c, 'panel');
    castShadow(g, path, { blur: 18, a: 0.55, dx: 3, dy: 8 });
    castShadow(g, path, { blur: 3, a: 0.7, dx: 1, dy: 2 }); // contact shadow
    // outer frame
    let gr = g.createLinearGradient(x, y, x + w * 0.4, y + h); gr.addColorStop(0, S.frame[0]); gr.addColorStop(0.5, S.frame[1]); gr.addColorStop(1, S.frame[2]);
    g.fillStyle = gr; path(); g.fill();
    g.save(); path(); g.clip(); texture(g, S.frameTex === 'brushed' ? TEX.brushed : TEX.fbm, x, y, w, h, { op: 'overlay', a: 0.45, scale: 0.5 }); texture(g, TEX.scratch, x, y, w, h, { op: 'source-over', a: 0.12 }); g.restore();
    // edge highlight from the upper-left key light
    g.save(); path(); gr = g.createLinearGradient(x, y, x + w * 0.5, y + h * 0.6); gr.addColorStop(0, S.edgeHi); gr.addColorStop(0.5, 'rgba(255,255,255,0.05)'); gr.addColorStop(1, 'rgba(0,0,0,0.5)'); g.strokeStyle = gr; g.lineWidth = 1.2; g.stroke(); g.restore();
    // inner bevel + recessed face
    const [fx, fy, fW, fH] = inset(x, y, w, h, fw), fp = () => shape(g, fx, fy, fW, fH, Math.max(2, c - fw * 0.6), 'panel');
    g.save(); fp(); gr = g.createLinearGradient(fx, fy, fx + fW * 0.4, fy + fH); gr.addColorStop(0, 'rgba(0,0,0,0.8)'); gr.addColorStop(0.5, 'rgba(0,0,0,0.2)'); gr.addColorStop(1, 'rgba(255,255,255,0.25)'); g.strokeStyle = gr; g.lineWidth = 2; g.stroke(); g.restore();
    gr = g.createLinearGradient(fx, fy, fx + fW * 0.25, fy + fH); gr.addColorStop(0, S.face[0]); gr.addColorStop(1, S.face[1]);
    g.fillStyle = gr; fp(); g.fill();
    g.save(); fp(); g.clip(); S.faceDetail(g, fx, fy, fW, fH); g.restore();
    innerShade(g, fp, { blur: 10, a: 0.55, lw: 8 });
    S.inlays(g, x, y, w, h, fw, c);
    return [fx, fy, fW, fH];
  }
  /** Header band inside a panel face: title, micro caption, serial, divider with end caps. */
  function header(g, fx, fy, fW, hb, title, o = {}) {
    let gr = g.createLinearGradient(fx, 0, fx + fW, 0); gr.addColorStop(0, S.band[0]); gr.addColorStop(1, S.band[1]);
    g.fillStyle = gr; g.fillRect(fx, fy, fW, hb);
    S.bandDetail(g, fx, fy, fW, hb);
    const tx = fx + (o.icon ? hb : 10);
    if (o.icon) o.icon(g, fx + 6, fy + (hb - 20) / 2, 20);
    if (o.caption) micro(g, o.caption, tx, fy + 11, { col: S.accentText });
    text(g, title, tx, fy + hb - (o.caption ? 7 : hb / 2 - 7), { px: o.px || 18, wt: 700, ls: S.titleLs, col: S.ink, glow: S.titleGlow, blur: 10, shadow: false, fill: S.titleFill ? S.titleFill(g, fy + hb - 7, o.px || 18) : null });
    if (o.serial) micro(g, o.serial, fx + fW - 8, fy + 11, { align: 'right' });
    divider(g, fx + 4, fy + hb, fW - 8, true);
  }
  function divider(g, x, y, w, strong = false) {
    const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, S.line); gr.addColorStop(0.5, strong ? S.lineStrong : S.line); gr.addColorStop(1, S.line);
    g.fillStyle = gr; g.fillRect(x, y, w, 1);
    S.endCaps(g, x, y, w, strong);
  }

  // ---------- components ----------
  function button(g, x, y, w, h, label, variant = 'primary', state = 'normal', o = {}) {
    const press = state === 'pressed' ? 1 : 0, off = state === 'disabled';
    const yy = y + press;
    const p = () => shape(g, x, yy, w, h, Math.min(10, h * 0.25));
    if (variant !== 'tertiary') {
      if (!press && !off) castShadow(g, p, { blur: 6, a: 0.55, dx: 1.5, dy: 3 });
      let gr = g.createLinearGradient(0, yy, 0, yy + h);
      const cs = off ? S.btnOff : variant === 'primary' ? S.btnPrimary : S.btnSecondary;
      gr.addColorStop(0, cs[0]); gr.addColorStop(0.5, cs[1]); gr.addColorStop(1, cs[2]);
      g.fillStyle = gr; p(); g.fill();
      g.save(); p(); g.clip();
      texture(g, variant === 'primary' && S.btnTex ? TEX.brushed : TEX.grain, x, yy, w, h, { op: 'overlay', a: 0.4, scale: 0.5 });
      if (!press) { const hl = g.createLinearGradient(0, yy, 0, yy + h * 0.5); hl.addColorStop(0, `rgba(255,255,255,${variant === 'primary' && !off ? 0.38 : 0.1})`); hl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hl; g.fillRect(x, yy, w, h * 0.5); }
      else { g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x, yy, w, h); }
      S.btnDetail(g, x, yy, w, h, variant, off);
      g.restore();
      if (press) innerShade(g, p, { blur: 5, a: 0.7, lw: 4 });
      p(); bevel(g, x, yy, w, h, press ? 0.1 : 0.6, 0.6, 1);
      if (variant === 'secondary' && !off) { g.save(); g.strokeStyle = A; g.lineWidth = 1.2; g.globalAlpha = press ? 0.6 : 1; p(); g.stroke(); g.restore(); }
      if (variant === 'primary' && !off && !press && o.glow !== false) bloom(g, x + w / 2, yy + h / 2, w * 0.55, S.btnGlow);
      if (S.shape === 'skew' && variant === 'primary' && !off) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.beginPath(); const k = Math.min(h * 0.28, 9); g.moveTo(x, yy + h); g.lineTo(x + w - k, yy + h); g.lineTo(x + w - k - 1, yy + h + 3 - press * 2); g.lineTo(x - 1, yy + h + 3 - press * 2); g.fill(); }
    }
    const s = label.toUpperCase(), tc = off ? 'rgba(200,205,212,0.35)' : variant === 'primary' ? S.btnInk : variant === 'secondary' ? S.accentText : S.accentText;
    let px = o.px || 16, ls = S.btnLs; const chev = S.shape === 'skew' && variant !== 'secondary' ? 22 : 0;
    while (px > 12 && tw(g, s, px, 700, ls) > w - (variant === 'tertiary' ? 20 : 30) - chev) { px -= 0.5; ls = Math.max(0.4, ls - 0.1); }
    const cx = x + w / 2 + (variant === 'tertiary' ? 6 : 0) - chev / 2;
    text(g, s, cx, yy + h / 2 + px * 0.36, { px, wt: 700, ls, col: tc, align: 'center', shadow: variant === 'tertiary' && !off, glow: variant !== 'primary' && !off ? 'rgba(255,170,60,0.35)' : null, blur: 6 });
    S.btnIcon(g, x, yy, w, h, variant, off, tw(g, s, px, 700, ls), cx);
  }
  function tag(g, x, y, label, kind = 'accent', o = {}) {
    const s = label.toUpperCase(), px = o.px || 10, h = o.h || 16, pad = S.shape === 'skew' ? 10 : 7, dot = kind === 'slot' ? 12 : 0, w = tw(g, s, px, 700, 1.2) + pad * 2 + dot;
    const p = () => shape(g, x, y, w, h, 4);
    const fill = kind === 'accent' ? S.tagAccent : kind === 'white' ? S.tagWhite : kind === 'slot' ? S.tagDark : S.tagDark;
    let gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, fill[0]); gr.addColorStop(1, fill[1]); g.fillStyle = gr; p(); g.fill();
    g.save(); p(); g.clip(); const hl = g.createLinearGradient(0, y, 0, y + h / 2); hl.addColorStop(0, 'rgba(255,255,255,0.3)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = hl; g.fillRect(x, y, w, h / 2); g.restore();
    if (kind === 'steel' || kind === 'slot') { g.strokeStyle = S.line2; g.lineWidth = 1; p(); g.stroke(); }
    if (kind === 'slot') slotChip(g, x + pad - 2, y + 3, 9, h - 6, o.slot || 0);
    const tc = kind === 'accent' ? S.tagAccentInk : kind === 'white' ? '#11161c' : S.ink;
    text(g, s, x + pad + dot, y + h / 2 + px * 0.37, { px, wt: 700, ls: 1.2, col: tc, shadow: false });
    return w;
  }
  function badge(g, x, y, sp = 1) {
    // the Rookie ×2 badge: a framed medal with a white-hot core on its accent, stamped on with a flash
    const w = S.badgeW, h = 30, k = sp < 1 ? lerp(1.7, 1, backOut(sp)) : 1;
    g.save(); g.translate(x + w / 2, y + h / 2); g.scale(k, k); g.translate(-x - w / 2, -y - h / 2); g.globalAlpha *= clamp(sp * 3);
    S.badge(g, x, y, w, h, shape);
    g.restore();
    if (sp > 0 && sp < 1) { bloom(g, x + w / 2, y + h / 2, w * 0.8, `rgba(255,210,130,${0.55 * (1 - sp)})`); sparks(g, x + w / 2, y + h / 2, sp, 10, w * 0.6); }
    return w;
  }
  function sparks(g, cx, cy, p, n, R) {
    g.save(); g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < n; i++) { const hh = Math.sin(i * 91.7) * 43758.5; const fr = hh - Math.floor(hh), a = fr * TAU, r = R * (0.3 + ease(p) * 0.9) * (0.6 + 0.4 * ((i * 0.37) % 1)); g.fillStyle = `rgba(255,${210 + (i % 3) * 15},150,${(1 - p) * 0.9})`; g.beginPath(); g.arc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.7, 1 + (i % 2) * 0.6, 0, TAU); g.fill(); }
    g.restore();
  }
  /** A fill bar: recessed track, gradient fill with a white-hot head, tick scale. */
  function bar(g, x, y, w, h, frac, o = {}) {
    const p = () => shape(g, x, y, w, h, Math.min(3, h * 0.4));
    g.fillStyle = S.track; p(); g.fill(); innerShade(g, p, { blur: 3, a: 0.8, lw: 2 });
    S.barTicks(g, x, y, w, h);
    if (frac > 0) {
      g.save(); p(); g.clip();
      const fwid = w * clamp(frac), gr = g.createLinearGradient(x, 0, x + fwid, 0); gr.addColorStop(0, S.fill[0]); gr.addColorStop(1, S.fill[1]);
      g.fillStyle = gr; g.fillRect(x, y, fwid, h);
      const hl = g.createLinearGradient(0, y, 0, y + h); hl.addColorStop(0, 'rgba(255,255,255,0.45)'); hl.addColorStop(0.5, 'rgba(255,255,255,0)'); g.fillStyle = hl; g.fillRect(x, y, fwid, h);
      S.barFillDetail(g, x, y, fwid, h);
      g.restore();
      if (o.head && frac < 1) { bloom(g, x + fwid, y + h / 2, 10, AG); g.fillStyle = '#fff8e8'; g.fillRect(x + fwid - 1.2, y - 1, 2.4, h + 2); }
    }
  }
  function scroll(g, x, y, h, pos, frac) {
    const th = Math.max(22, h * frac), ty = y + (h - th) * pos;
    g.fillStyle = S.track; rrect(g, x - 1.5, y, 3, h, 1.5); g.fill();
    for (const yy of [y - 6, y + h + 2]) { g.fillStyle = S.mute; g.beginPath(); g.moveTo(x - 3, yy + (yy < y ? 4 : 0)); g.lineTo(x + 3, yy + (yy < y ? 4 : 0)); g.lineTo(x, yy + (yy < y ? 0 : 4)); g.fill(); }
    const gr = g.createLinearGradient(x - 2, 0, x + 2, 0); gr.addColorStop(0, S.fill[1]); gr.addColorStop(1, S.fill[0]);
    g.fillStyle = gr; rrect(g, x - 2, ty, 4, th, 2); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.4)'; for (let i = -1; i <= 1; i++) g.fillRect(x - 1.5, ty + th / 2 + i * 3, 3, 1);
  }
  /** Player slot chip: filled slot colour, dark keyline, white number (never orange-on-orange). */
  function slotChip(g, x, y, w, h, i) {
    g.fillStyle = 'rgba(0,0,0,0.85)'; rrect(g, x - 1.5, y - 1.5, w + 3, h + 3, 4); g.fill();
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, SLOT[i]); gr.addColorStop(1, SLOT[i]); g.fillStyle = gr; rrect(g, x, y, w, h, 3); g.fill();
    const hl = g.createLinearGradient(0, y, 0, y + h); hl.addColorStop(0, 'rgba(255,255,255,0.4)'); hl.addColorStop(0.5, 'rgba(255,255,255,0)'); hl.addColorStop(1, 'rgba(0,0,0,0.25)'); g.fillStyle = hl; rrect(g, x, y, w, h, 3); g.fill();
    text(g, String(i + 1), x + w / 2, y + h / 2 + Math.min(w, h) * 0.3, { px: Math.min(w, h) * 0.78, wt: 700, col: '#ffffff', align: 'center', shadow: true });
  }
  /** List row: normal / hover / selected. */
  function listRow(g, x, y, w, h, p, i, cols, state = 'normal', small = true) {
    if (state !== 'normal') {
      const gr = g.createLinearGradient(x, 0, x + w, 0);
      if (state === 'selected') { gr.addColorStop(0, S.selA); gr.addColorStop(1, S.selB); } else { gr.addColorStop(0, 'rgba(255,255,255,0.07)'); gr.addColorStop(1, 'rgba(255,255,255,0.02)'); }
      g.fillStyle = gr; shape(g, x - 3, y, w + 6, h - 2, 4); g.fill();
      if (state === 'selected') { g.fillStyle = A; neon(g, () => g.fillRect(x - 3, y, 2, h - 2), AG, 6); }
    }
    slotChip(g, x + 1, y + 6, 13, small ? 18 : 22, i);
    const ny = y + (small ? 15 : 17);
    text(g, p.name, cols.name, ny, { px: small ? 15 : 17, wt: 600, col: S.ink, shadow: false });
    if (state === 'selected') micro(g, 'YOU', cols.name + tw(g, p.name, small ? 15 : 17, 600) + 5, ny - 1, { col: S.accentText, px: 8 });
    tnum(g, fmt(p.kills), cols.kills, ny, small ? 14 : 16, { align: 'right', wt: 500, col: S.ink2, skew: 0 });
    tnum(g, '$' + fmt(p.earned), cols.earned, ny, small ? 14 : 16, { align: 'right', wt: 600, col: S.ink, skew: 0 });
    text(g, trLine(p.tr), cols.name, ny + (small ? 13 : 15), { px: small ? 11.5 : 12.5, wt: 500, col: S.mute, shadow: false });
    if (state !== 'selected') divider(g, x, y + h - 1, w);
  }
  /** Item card with rarity framing. rarity: 'gold' | 'white' | 'steel' | 'slot'. */
  function card(g, x, y, w, h, it, a, small) {
    const R = S.rarity[it.rarity] || S.rarity.white, flip = a.p;
    g.save(); g.translate(x + w / 2, y + h); g.scale(1, lerp(0.86, 1, ease(flip))); g.translate(-x - w / 2, -y - h); g.globalAlpha *= clamp(flip * 2);
    const p = () => shape(g, x, y, w, h, S.cardCorner, 'card');
    castShadow(g, p, { blur: 8, a: 0.6, dx: 2, dy: 4 });
    // rarity frame
    let gr = g.createLinearGradient(x, y, x + w, y + h); gr.addColorStop(0, R.frame[0]); gr.addColorStop(0.5, R.frame[1]); gr.addColorStop(1, R.frame[2]);
    g.fillStyle = gr; p(); g.fill();
    const [fx, fy, fW, fH] = inset(x, y, w, h, 2), fp = () => shape(g, fx, fy, fW, fH, Math.max(1, S.cardCorner - 1), 'card');
    gr = g.createRadialGradient(fx + fW / 2, fy + fH * 0.42, 0, fx + fW / 2, fy + fH * 0.42, fH * 0.75); gr.addColorStop(0, R.bg[0]); gr.addColorStop(1, R.bg[1]);
    g.fillStyle = gr; fp(); g.fill();
    g.save(); fp(); g.clip(); S.cardPattern(g, fx, fy, fW, fH, R);
    // header strip
    const hh = small ? 15 : 18;
    gr = g.createLinearGradient(0, fy, 0, fy + hh); gr.addColorStop(0, R.head[0]); gr.addColorStop(1, R.head[1]); g.fillStyle = gr; g.fillRect(fx, fy, fW, hh);
    text(g, it.tag.toUpperCase(), fx + 6, fy + hh / 2 + 3.6, { px: small ? 9.5 : 11, wt: 700, ls: 1.1, col: R.headInk, shadow: false, maxW: fW - 12 });
    if (it.slot != null) slotChip(g, fx + fW - 14, fy + 2.5, 10, hh - 5, it.slot);
    // the item, big, on a lit floor
    const art = small ? Math.min(fW - 14, 50) : Math.min(fW - 24, 84), ax = fx + (fW - art) / 2, ay = fy + hh + (small ? 3 : 6);
    const fl = g.createRadialGradient(fx + fW / 2, ay + art * 0.92, 0, fx + fW / 2, ay + art * 0.92, art * 0.6); fl.addColorStop(0, R.floor); fl.addColorStop(1, 'rgba(0,0,0,0)');
    g.save(); g.translate(0, ay + art * 0.92); g.scale(1, 0.35); g.translate(0, -(ay + art * 0.92)); g.fillStyle = fl; g.fillRect(fx, ay, fW, art * 2); g.restore();
    bloom(g, fx + fW / 2, ay + art * 0.45, art * 0.6, R.back, 0.6 + 0.4 * a.pulse);
    if (it.bag) bagGlyph(g, ax + art * 0.15, ay + art * 0.12, art * 0.7);
    else {
      if (a.lit < 1) { g.save(); g.globalAlpha *= 1 - a.lit; g.drawImage(itemArt(it.slot0, it.id, art, 'sil'), ax, ay, art, art); g.restore(); }
      if (a.lit > 0) { g.save(); g.globalAlpha *= a.lit; g.drawImage(relitItem(it.slot0, it.id, art), ax, ay, art, art); g.restore(); }
    }
    sweep(g, fx, fy, fW, fH, a.sweep, { a: a.lt < 1.2 ? 0.55 : 0.14, width: 0.3, col: '255,246,225' });
    g.restore();
    // name + sub + action
    const ty = ay + art + (small ? 12 : 16);
    text(g, it.name, fx + fW / 2, ty, { px: small ? 13 : 15.5, wt: 600, col: S.ink, align: 'center', shadow: true, maxW: fW - 6 });
    text(g, it.sub, fx + fW / 2, ty + (small ? 12 : 15), { px: small ? 10.5 : 12, wt: 500, col: S.mute, align: 'center', shadow: false, maxW: fW - 6 });
    if (it.wear) button(g, fx + 4, fy + fH - (small ? 24 : 30), fW - 8, small ? 20 : 26, 'Wear it', 'secondary', 'normal', { px: small ? 11 : 13 });
    // rarity edge: layered glow with a white-hot core, pulses; burst on landing
    const ga = 0.35 + 0.35 * a.pulse + a.flash;
    g.save(); g.globalAlpha *= Math.min(1, ga); g.strokeStyle = R.edge; g.lineWidth = 1.4; neon(g, () => { p(); g.stroke(); }, R.glow, 6 + 14 * a.flash); g.restore();
    if (a.flash > 0.02) { g.save(); g.globalAlpha *= a.flash; g.strokeStyle = '#fffaf0'; g.lineWidth = 1; p(); g.stroke(); g.restore(); bloom(g, x + w / 2, y + h * 0.4, w * 0.9, R.glow, 0.6 * a.flash); }
    g.restore();
    if (a.lt > 0.45 && a.lt < 1.1) sparks(g, x + w / 2, y + h * 0.4, (a.lt - 0.45) / 0.65, 12, w * 0.75);
  }
  function counter(g, x, y, v, px, label, o = {}) {
    if (label) micro(g, label, x, y - px * 0.82 - 3, { col: S.accentText });
    return tnum(g, (o.plus ? '+' : '') + fmt(v), x, y, px, { fill: S.numFill, glow: S.numGlow, blur: 14, dim: S.leadZero ? null : null });
  }
  function iconBox(g, x, y, w, h) {
    const p = () => shape(g, x, y, w, h, 4);
    g.fillStyle = S.track; p(); g.fill(); innerShade(g, p, { blur: 4, a: 0.8, lw: 3 });
    g.strokeStyle = S.line2; g.lineWidth = 1; p(); g.stroke();
  }

  // ---------- the Results screen ----------
  function layoutPI(w, h) {
    const small = w < 700;
    const left = small ? { x: 50, y: 6, w: 192, h: 289 } : { x: 12, y: 12, w: 300, h: 336 };
    const right = small ? { x: 248, y: 6, w: 270, h: 289 } : { x: 322, y: 12, w: 466, h: 336 };
    const hb = small ? 40 : 46, fw = S.fw;
    const face = (r) => ({ x: r.x + fw, y: r.y + fw, w: r.w - fw * 2, h: r.h - fw * 2 });
    const rf = face(right);
    return { w, h, small, left, right, hb, lf: face(left), rf, view: { x: rf.x + 8, y: rf.y + hb + 8, w: rf.w - 22, h: rf.h - hb - 14 } };
  }
  function rowsPI(state, L) {
    const S2 = L.small, R = [];
    const add = (type, h, d = {}) => R.push({ type, h, ...d });
    const statusOf = { saving: ['Saving…', ''], failed: ["Couldn't save this run", 'Your Supplies from earlier runs are safe.'], offline: ['Not saved', 'Playing offline from your progress.'], practice: ["Practice runs don't earn rewards", 'Play online (even alone) to earn Supplies and items.'] };
    if (statusOf[state]) add('status', 130, { kind: state, title: statusOf[state][0], hint: statusOf[state][1] });
    else {
      const mate = state === 'mate';
      add('supplies', S2 ? 124 : 132, { amount: mate ? 250 : 500, base: 250, rookie: !mate, total: mate ? 1990 : 740, ledger: [['Waves 10 × 10', 100], ['Behemoth', 50], ['Extract', 100]] });
      add('div', 10);
      const H = (S2 ? 142 : 176);
      const it = (slot0, id, tag, name, sub, rarity, x = {}) => ({ slot0, id, tag, name, sub, rarity, wear: true, ...x });
      let cards;
      if (state === 'collector') cards = [it('head', 'riot', 'New item', 'Riot helmet', 'first extraction', 'gold'), { tag: 'Collector', name: 'Collector', sub: 'every surprise item', rarity: 'steel', bag: true }];
      else if (mate) cards = [it('head', 'gas', 'New item', 'Gas mask', 'Behemoth killed', 'gold'), it('head', 'cone', 'Mo found', 'Traffic cone', "Mo's surprise bag", 'slot', { wear: false, slot: 0 })];
      else cards = [it('head', 'riot', 'New item', 'Riot helmet', 'first extraction', 'gold'), it('head', 'gas', 'New item', 'Gas mask', 'Behemoth killed', 'gold'), it('head', 'cone', 'Found in wave 6', 'Traffic cone', 'surprise bag', 'white')];
      add('cards', H, { cards });
      add('div', 10);
      if (!mate) add('line', 46, { icon: 'gl', tag: 'You used', name: 'Grenade Launcher', price: 500 });
      add('line', 46, { icon: 'd2', tag: 'Unlocked', name: 'District 2', sub: 'coming soon' });
      if (!mate) { add('div', 10); add('nudge', S2 ? 56 : 50); }
    }
    let y = 0, t = 2.35;
    for (const r of R) { r.y = y; y += r.h + (r.type === 'div' ? 0 : 6); if (r.type === 'supplies' || r.type === 'status') r.at = 0.3; else if (r.type === 'cards') { r.at = t; t += 0.75 * r.cards.length; } else if (r.type === 'div') r.at = t - 0.1; else { r.at = t; t += 0.35; } }
    R.total = y; return R;
  }
  function cardAnim(lt, clock, still, isNew) {
    if (still) return { p: 1, lit: 1, sweep: -1, flash: 0, pulse: isNew ? 0.5 : 0.2, lt: 99 };
    const p = ease(lt / 0.35), lit = clamp((lt - 0.35) / 0.3), flash = Math.exp(-Math.pow((lt - 0.62) / 0.13, 2));
    const sweepP = lt < 1.25 ? (lt - 0.2) / 0.85 : ((clock * 0.18 + 0.4) % 1.7) - 0.35, pulse = (isNew ? 0.5 + 0.5 * Math.sin(clock * 2.4) : 0.2) * ease((lt - 0.6) / 0.4);
    return { p, lit, sweep: sweepP, flash, pulse, lt };
  }
  function drawRow(g, L, r, x, y, w, tt, clock, still) {
    const lt = tt - r.at, S2 = L.small;
    if (lt < 0) return;
    g.save(); g.globalAlpha *= ease(lt / 0.3);
    if (r.type === 'div') divider(g, x, y + r.h / 2, w * ease(lt / 0.5), true);
    else if (r.type === 'supplies') {
      const v = tt >= 99 ? r.amount : r.base * ease((tt - 0.45) / 0.85) + (r.rookie ? (r.amount - r.base) * ease((tt - 1.55) / 0.5) : 0);
      crate(g, x, y + 10, S2 ? 30 : 34, { glow: true });
      const nx = x + (S2 ? 38 : 44), nw = counter(g, nx, y + (S2 ? 40 : 44), v, S2 ? 36 : 42, 'Supplies earned', { plus: true });
      text(g, 'SUPPLIES', nx + nw + 6, y + (S2 ? 38 : 42), { px: S2 ? 13 : 15, wt: 600, ls: 1.5, col: S.accentText, shadow: false });
      let ly = y + (S2 ? 58 : 62);
      r.ledger.forEach(([lab, val], i) => {
        const at = [0.45, 0.75, 1.05][i], fr = tt >= 99 ? 1 : ease((tt - at) / 0.35);
        text(g, lab, x, ly + 9, { px: S2 ? 11.5 : 12.5, wt: 500, col: S.ink2, shadow: false });
        const bx = x + (S2 ? 84 : 100), bw = w - (bx - x) - (S2 ? 34 : 40);
        bar(g, bx, ly + 2, bw, S2 ? 7 : 8, fr * (val / 100), { head: fr < 1 });
        tnum(g, '+' + val, x + w, ly + 10, S2 ? 12 : 13, { align: 'right', wt: 600, col: S.accentText, skew: 0 });
        ly += S2 ? 15 : 16;
      });
      const by = ly + 3;
      if (r.rookie) badge(g, x, by, tt >= 99 ? 1 : clamp((tt - 1.5) / 0.35));
      const ta = tt >= 99 ? 1 : ease((tt - 2.05) / 0.4);
      g.save(); g.globalAlpha *= ta;
      micro(g, 'TOTAL', x + w - (S2 ? 84 : 96), by + 12, { col: S.mute });
      const totalNow = r.total - r.amount + v, tws = tnum(g, fmt(totalNow), x + w, by + 25, S2 ? 17 : 19, { align: 'right', wt: 600, col: S.ink, skew: 0 });
      crate(g, x + w - tws - 18, by + 12, 15);
      g.restore();
    } else if (r.type === 'cards') {
      const n = r.cards.length, gap = S2 ? 6 : 10, cw = n === 3 ? (w - gap * 2) / 3 : Math.min((w - gap) / 2, S2 ? 110 : 160);
      r.cards.forEach((it, i) => { const clt = lt - i * 0.75; if (clt < 0) return; card(g, x + i * (cw + gap), y, cw, r.h, it, cardAnim(clt, clock, still, it.rarity === 'gold'), S2); });
    } else if (r.type === 'line') {
      g.translate(0, (1 - ease(lt / 0.35)) * 8);
      iconBox(g, x, y + 6, 50, 34);
      if (r.icon === 'gl' && IMG.gl) { g.save(); g.shadowColor = 'rgba(0,0,0,0.7)'; g.shadowBlur = 3; g.shadowOffsetX = 1; g.shadowOffsetY = 2; g.drawImage(IMG.gl, x + 4, y + 11, 42, 24); g.restore(); }
      if (r.icon === 'd2') district2(g, x + 2, y + 8, 46, 30);
      const tx = x + 60;
      tag(g, tx, y + 4, r.tag, r.tag === 'Unlocked' ? 'white' : 'steel');
      text(g, r.name, tx, y + 34, { px: S2 ? 15 : 16, wt: 600, col: S.ink, shadow: false });
      if (r.price) { const pre = 'Unlock it for '; text(g, pre, tx, y + 47, { px: 12, wt: 500, col: S.ink2, shadow: false }); const pw = tw(g, pre, 12, 500); crate(g, tx + pw, y + 37, 12); tnum(g, fmt(r.price), tx + pw + 14, y + 47, 12, { wt: 600, col: S.accentText, skew: 0 }); }
      else text(g, r.sub, tx, y + 47, { px: 12, wt: 500, col: S.mute, shadow: false });
      if (r.price) button(g, x + w - (S2 ? 58 : 76), y + 10, S2 ? 58 : 76, 28, 'View', 'tertiary', 'normal', { px: 13 });
    } else if (r.type === 'nudge') {
      g.translate(0, (1 - ease(lt / 0.35)) * 8);
      const p = () => shape(g, x, y, w, r.h, 6);
      g.fillStyle = S.nudge; p(); g.fill(); g.strokeStyle = S.line2; g.lineWidth = 1; p(); g.stroke();
      micro(g, 'ACCOUNT', x + 9, y + 12, { col: S.accentText });
      const bw = S2 ? 116 : 160, lines = wrap(g, 'Keep your Supplies and items on any phone.', w - bw - 28, 12.5, 500);
      lines.forEach((ln, i) => text(g, ln, x + 9, y + 26 + i * 14, { px: 12.5, wt: 500, col: S.ink, shadow: false }));
      button(g, x + w - bw - 7, y + (r.h - 40) / 2, bw, 40, 'Save my progress', 'primary', 'normal', { px: 13, glow: false });
    } else if (r.type === 'status') {
      if (r.kind === 'saving') {
        spinner(g, x + 12, y + 18, 9, still ? 0.4 : clock, A);
        text(g, 'SAVING…', x + 30, y + 25, { px: 19, wt: 700, ls: 1.5, col: S.ink, shadow: false });
        micro(g, 'UPLOADING RUN REPORT', x + 30, y + 37);
        for (let i = 0; i < 3; i++) { const yy = y + 50 + i * 22, ww = [w * 0.9, w * 0.72, w * 0.55][i]; bar(g, x, yy, ww, 12, 0); g.save(); shape(g, x, yy, ww, 12, 3); g.clip(); sweep(g, x, yy, ww, 12, still ? 0.5 : ((clock * 0.6 + i * 0.12) % 1.4) - 0.2, { a: 0.18, col: '255,235,200' }); g.restore(); }
      } else {
        iconBox(g, x, y + 2, 30, 30);
        if (r.kind === 'practice') { g.strokeStyle = S.ink; g.lineWidth = 1.6; g.beginPath(); g.arc(x + 15, y + 17, 8, 0, TAU); g.moveTo(x + 19, y + 17); g.arc(x + 15, y + 17, 4, 0, TAU); g.stroke(); } else cloudX(g, x + 4, y + 6, 22, S.ink);
        tag(g, x + 40, y + 2, r.kind === 'failed' ? 'Not saved' : r.kind === 'offline' ? 'Offline' : 'Practice', 'steel');
        const lines = wrap(g, r.title, w - 40, 18, 700); lines.forEach((ln, i) => text(g, ln, x + 40, y + 38 + i * 21, { px: 18, wt: 700, col: S.ink, shadow: false }));
        wrap(g, r.hint, w - 40, 13, 500).forEach((ln, i) => text(g, ln, x + 40, y + 42 + lines.length * 21 + i * 16, { px: 13, wt: 500, col: S.ink2, shadow: false }));
      }
    }
    g.restore();
  }
  function base(L, state) {
    return cached(`pi-base-${S.code}-${L.w}-${state}`, () => {
      const [c, g] = mk(L.w, L.h);
      g.drawImage(S.bg(L.w, L.h, state), 0, 0, L.w, L.h);
      // left: team
      const [fx, fy, fW] = panel(g, L.left.x, L.left.y, L.left.w, L.left.h);
      header(g, fx, fy, fW, L.hb, 'EXTRACTED', { caption: 'RUN COMPLETE · DOWNTOWN', px: L.small ? 19 : 24 });
      micro(g, 'WAVE', fx + fW - 8, fy + 11, { align: 'right' });
      tnum(g, state === 'endless' ? '14' : '10', fx + fW - 8, fy + L.hb - 6, L.small ? 19 : 24, { align: 'right', fill: S.numFill, glow: S.numGlow, blur: 10 });
      const S2 = L.small, px = S2 ? 8 : 12, cols = { name: fx + px + 20, kills: fx + fW - (S2 ? 62 : 104), earned: fx + fW - px };
      let yy = fy + L.hb + (S2 ? 8 : 12);
      micro(g, 'PLAYER', cols.name, yy + 6); micro(g, 'KILLS', cols.kills, yy + 6, { align: 'right' }); micro(g, 'EARNED', cols.earned, yy + 6, { align: 'right' });
      yy += S2 ? 11 : 14;
      TEAM.forEach((p, i) => { listRow(g, fx + px, yy, fW - px * 2, S2 ? 34 : 40, p, i, cols, i === 0 ? 'selected' : 'normal', S2); yy += S2 ? 35 : 42; });
      const bh = 44, by = L.left.y + L.left.h - S.fw - bh - (S2 ? 8 : 12);
      button(g, fx + px, by, S2 ? 150 : 176, bh, 'Back to lobby', 'primary', 'normal', { px: 15 });
      if (!S2) { micro(g, 'RUN SEED', fx + fW - px, by + 18, { align: 'right' }); tnum(g, '2207', fx + fW - px, by + 34, 14, { align: 'right', wt: 600, col: S.ink2, skew: 0 }); }
      // right: rewards shell
      const [rx, ry, rW] = panel(g, L.right.x, L.right.y, L.right.w, L.right.h);
      header(g, rx, ry, rW, L.hb, 'RUN REWARDS', { caption: 'EVAC REPORT', serial: 'RW-07 · 2207', px: L.small ? 18 : 22, icon: (gg, x2, y2, s2) => crate(gg, x2, y2, s2) });
      return c;
    });
  }
  function scrollAt(rows, L, t) {
    const max = Math.max(0, rows.total - L.view.h); let s = 0;
    for (const r of rows) { if (r.type === 'div') continue; if (r.type === 'cards') { const need = clamp(r.y + r.h + 4 - L.view.h, 0, max); s = lerp(s, Math.max(s, need), easeIO((t - (r.at - 0.45)) / 0.45)); continue; } const need = clamp(r.y + r.h + 4 - L.view.h, 0, max); s = lerp(s, Math.max(s, need), easeIO((t - (r.at - 0.45)) / 0.45)); }
    return s;
  }
  function render(g, w, h, state, t, opt = {}) {
    const L = layoutPI(w, h), reveal = !!opt.reveal, still = !reveal && opt.idle == null, tt = reveal ? t : 99, clock = reveal ? t : opt.idle || 0;
    const rows = cached(`pi-rows-${w}-${state}`, () => rowsPI(state, L));
    g.drawImage(base(L, state), 0, 0, w, h);
    const V = L.view, sc = opt.scroll != null ? opt.scroll : reveal ? scrollAt(rows, L, tt) : 0;
    g.save(); g.beginPath(); g.rect(V.x - 6, V.y - 6, V.w + 12, V.h + 6); g.clip();
    for (const r of rows) { const yy = V.y + r.y - sc; if (yy > V.y + V.h + 4 || yy + r.h < V.y - 8) continue; drawRow(g, L, r, V.x, yy, V.w, tt, clock, still); }
    g.restore();
    const max = Math.max(0, rows.total - V.h);
    if (max > 0) { scroll(g, L.rf.x + L.rf.w - 6, V.y + 6, V.h - 12, sc / max, V.h / rows.total); const gr = g.createLinearGradient(0, V.y + V.h - 18, 0, V.y + V.h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, S.fade); g.fillStyle = gr; g.fillRect(V.x - 4, V.y + V.h - 18, V.w + 8, 18); }
    if (!still) { for (const r of [L.left, L.right]) { g.save(); shape(g, r.x, r.y, r.w, r.h, S.corner, 'panel'); g.clip(); sweep(g, r.x, r.y, r.w, r.h, ((clock * 0.12 + (r === L.right ? 0.5 : 0)) % 1.8) - 0.4, { a: 0.045, width: 0.18, col: '255,250,240', angle: 0.6 }); g.restore(); } }
    return { L, rows, max };
  }

  // ---------- the component sheet ----------
  function sheet(g, W, H, t, still) {
    g.fillStyle = S.sheetBg; g.fillRect(0, 0, W, H);
    g.drawImage(S.bg(W, H), 0, 0, W, H); g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(0, 0, W, H);
    const lab = (s, x, y) => micro(g, s, x, y, { col: 'rgba(230,235,240,0.7)', px: 9 });
    // 1 panel construction
    lab('PANEL · LAYERED CONSTRUCTION', 16, 18);
    const [fx, fy, fW] = panel(g, 16, 26, 200, 128);
    header(g, fx, fy, fW, 40, 'PANEL TITLE', { caption: 'CAPTION', serial: 'SN-0417' });
    text(g, 'Body text sits on the recessed face.', fx + 10, fy + 52, { px: 12, wt: 500, col: S.ink2, shadow: false });
    micro(g, 'MICRO LABEL · 8.5 PX', fx + 10, fy + 68);
    divider(g, fx + 8, fy + 80, fW - 16);
    bar(g, fx + 10, fy + 90, fW - 20, 8, 0.66, { head: true });
    micro(g, 'FILL 66%', fx + fW - 10, fy + 108, { align: 'right' });
    // 2 buttons
    lab('BUTTONS · NORMAL / PRESSED / DISABLED', 232, 18);
    const vs = ['primary', 'secondary', 'tertiary'], ss = ['normal', 'pressed', 'disabled'];
    vs.forEach((v, i) => { micro(g, v.toUpperCase(), 232, 36 + i * 52, { px: 8 }); ss.forEach((st, j) => button(g, 232 + j * 124, 40 + i * 52, 114, 40, v === 'primary' ? 'Back to lobby' : v === 'secondary' ? 'Wear it' : 'View', v, st, { px: 14 })); });
    // 3 list rows
    lab('LIST ROWS · NORMAL / HOVER / SELECTED', 16, 176);
    const cols = { name: 42, kills: 166, earned: 212 };
    ['normal', 'hover', 'selected'].forEach((st, i) => listRow(g, 22, 184 + i * 38, 192, 36, TEAM[i], i, cols, st, true));
    // 4 cards
    lab('ITEM CARDS · RARITY FRAMING', 232, 200);
    const ca = cardAnim(99, t, true, true);
    const cards = [{ slot0: 'head', id: 'riot', tag: 'New item', name: 'Riot helmet', sub: 'first extraction', rarity: 'gold', wear: true }, { slot0: 'head', id: 'cone', tag: 'Found in wave 6', name: 'Traffic cone', sub: 'surprise bag', rarity: 'white', wear: true }, { slot0: 'head', id: 'gas', tag: 'Mo found', name: 'Gas mask', sub: "Mo's bag", rarity: 'slot', slot: 0 }, { tag: 'Collector', name: 'Collector', sub: 'every item', rarity: 'steel', bag: true }];
    cards.forEach((c2, i) => card(g, 232 + i * 94, 208, 88, 142, c2, still ? ca : cardAnim(((t * 0.6 + i * 0.3) % 3.5), t, false, c2.rarity === 'gold'), true));
    // 5 tags, badge, counter, scroll
    lab('TAGS · BADGE · COUNTER · SCROLL', 16, 312);
    let tx = 16; for (const [s2, k] of [['New item', 'accent'], ['Unlocked', 'white']]) tx += tag(g, tx, 320, s2, k) + 6;
    tx = 16; for (const [s2, k] of [['You used', 'steel'], ['Mo found', 'slot']]) tx += tag(g, tx, 342, s2, k) + 6;
    badge(g, 16, 366, 1);
    crate(g, 16, 410, 30, { glow: true }); counter(g, 54, 444, 500, 34, 'Supplies earned', { plus: true });
    scroll(g, 200, 330, 110, 0.3, 0.4);
    // 6 modal
    lab('MODAL FRAME', 232, 366);
    const [mx, my, mW] = panel(g, 300, 372, 280, 82, { fw: S.fw + 2 });
    header(g, mx, my, mW, 26, 'SAVE MY PROGRESS?', { px: 14 });
    text(g, 'Keep your Supplies and items on any phone.', mx + 10, my + 41, { px: 11.5, wt: 500, col: S.ink2, shadow: false });
    button(g, mx + mW - 92, my + 46, 84, 22, 'Save', 'primary', 'normal', { px: 12, glow: false });
    button(g, mx + mW - 180, my + 46, 82, 22, 'Not now', 'tertiary', 'normal', { px: 12 });
  }
  return { code: S.code, render, sheet, layoutPI, C: { S, shape, panel, header, divider, button, tag, badge, bar, scroll, listRow, card, counter, iconBox, micro, tnum, sparks, cardAnim, slotChip } };
}

function piMicro(g, s, x, y, o = {}) { text(g, s, x, y, { px: o.px || 8.5, wt: 600, ls: o.ls != null ? o.ls : 1.4, col: o.col || 'rgba(200,205,212,0.6)', align: o.align || 'left', shadow: false }); }
// ---------- the three skins ----------
const PI_BG = (look, dim) => (w, h) => dawn(w, h, look, { dim, blur: 2.5 });
function lumenSkin(P) {
  return {
  code: P.code, shape: 'notch', corner: 10, fw: 3, cardCorner: 7,
  bg: (w, h, st) => dawn(w, h, st === 'endless' ? 'dw2' : 'dw1', { dim: 0.5, blur: 2.5 }), sheetBg: '#0b0d10', fade: 'rgba(9,12,17,0.95)',
  frame: P.frame, frameTex: 'fbm', edgeHi: 'rgba(255,255,255,0.85)',
  face: P.face,
  band: [P.tint(0.16), P.tint(0)],
  ink: '#f4f6f8', ink2: '#c2cbd5', mute: '#8693a1', line: 'rgba(190,205,225,0.14)', lineStrong: P.tint(0.75), line2: 'rgba(200,214,232,0.35)',
  accent: P.accent, accentText: P.accentText, accentGlow: P.glow, titleLs: 2.4, titleGlow: 'rgba(255,240,215,0.25)', btnLs: 2,
  numWt: 500, numSkew: 0, numFill: (g, px) => P.numFill(g, px), numGlow: P.numGlow,
  btnPrimary: P.btn, btnSecondary: ['rgba(40,50,64,0.95)', 'rgba(20,26,34,0.95)', 'rgba(12,16,22,0.95)'], btnOff: ['#3a4048', '#2a2f35', '#1e2227'], btnInk: P.ink0, btnGlow: P.tint(0.18),
  track: 'rgba(0,0,0,0.55)', fill: P.fill, selA: P.tint(0.24), selB: P.tint(0.02),
  tagAccent: P.tag, tagAccentInk: P.ink0, tagWhite: ['#ffffff', '#d5dce4'], tagDark: ['rgba(40,50,64,0.95)', 'rgba(16,20,28,0.95)'],
  nudge: 'rgba(160,190,225,0.07)', badgeW: 96,
  rarity: {
    gold: P.rNew,
    white: { frame: ['#ffffff', '#aeb8c4', '#4c5562'], bg: ['#3e4652', '#14181e'], head: ['#eef2f6', '#b9c3ce'], headInk: '#11161c', edge: '#ffffff', glow: 'rgba(220,235,255,0.8)', floor: 'rgba(220,230,245,0.45)', back: 'rgba(210,225,245,0.25)' },
    steel: { frame: ['#9fb3c6', '#4f5f70', '#222a33'], bg: ['#2a3542', '#0e1218'], head: ['#5a6b7d', '#3a4756'], headInk: '#eef3f8', edge: '#a9c0d6', glow: 'rgba(150,190,230,0.7)', floor: 'rgba(160,190,230,0.35)', back: 'rgba(150,190,230,0.2)' },
    slot: { frame: ['#9cc4ff', '#3d8bff', '#173a78'], bg: ['#1e3456', '#0b1424'], head: ['#3d8bff', '#2a62c0'], headInk: '#ffffff', edge: '#a8ccff', glow: 'rgba(80,150,255,0.8)', floor: 'rgba(110,170,255,0.4)', back: 'rgba(80,150,255,0.25)' },
  },
  faceDetail(g, x, y, w, h) {
    texture(g, TEX.grain, x, y, w, h, { op: 'overlay', a: 0.4 });
    g.strokeStyle = 'rgba(200,215,235,0.05)'; g.lineWidth = 1; for (let i = 0; i < 9; i++) { g.beginPath(); g.moveTo(x + w - 70 + i * 8, y); g.lineTo(x + w + i * 8, y + 70); g.stroke(); }
    const gr = g.createLinearGradient(0, y, 0, y + h * 0.35); gr.addColorStop(0, 'rgba(220,235,255,0.06)'); gr.addColorStop(1, 'rgba(220,235,255,0)'); g.fillStyle = gr; g.fillRect(x, y, w, h);
  },
  bandDetail(g, x, y, w, h) { g.fillStyle = P.accent; g.fillRect(x, y, 2, h); },
  endCaps(g, x, y, w, strong) { if (!strong) return; g.fillStyle = P.accent; for (const ex of [x, x + w]) { g.save(); g.translate(ex, y + 0.5); g.rotate(Math.PI / 4); g.fillRect(-2.2, -2.2, 4.4, 4.4); g.restore(); } },
  inlays(g, x, y, w, h, fw, c) { g.fillStyle = P.accent; for (const [ix, iy] of [[x + c + 6, y + 1.5], [x + w - c - 6, y + h - 1.5]]) { g.save(); g.translate(ix, iy); g.rotate(Math.PI / 4); g.fillRect(-1.6, -1.6, 3.2, 3.2); g.restore(); } g.fillStyle = 'rgba(255,255,255,0.5)'; for (let i = 0; i < 5; i++) g.fillRect(x + w - 16 - i * 4, y + 1, 2, 1); },
  btnDetail(g, x, y, w, h, v, off) { if (v === 'primary' && !off) { g.fillStyle = 'rgba(27,19,6,0.25)'; for (let i = 0; i < 3; i++) g.fillRect(x + w - 14 + i * 3, y + h / 2 - 4, 1.2, 8); } },
  btnIcon(g, x, y, w, h, v, off, tw0, cx) { if (v === 'tertiary') { g.fillStyle = off ? 'rgba(200,205,212,0.35)' : P.accent; g.save(); g.translate(cx - tw0 / 2 - 9, y + h / 2); g.rotate(Math.PI / 4); g.fillRect(-2.5, -2.5, 5, 5); g.restore(); g.fillStyle = off ? 'rgba(200,205,212,0.2)' : P.tint(0.6); g.fillRect(cx - tw0 / 2, y + h / 2 + 9, tw0, 1); } },
  barTicks(g, x, y, w, h) { g.fillStyle = 'rgba(255,255,255,0.08)'; for (let i = 1; i < 10; i++) g.fillRect(x + w * i / 10, y + 1, 1, h - 2); },
  barFillDetail() {},
  cardPattern(g, x, y, w, h) { g.strokeStyle = 'rgba(255,255,255,0.05)'; g.lineWidth = 1; for (let i = -h; i < w; i += 6) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + h, y); g.stroke(); } },
  badge(g, x, y, w, h, shape) {
    const p = () => { g.beginPath(); g.moveTo(x + 10, y); g.lineTo(x + w - 10, y); g.lineTo(x + w, y + h / 2); g.lineTo(x + w - 10, y + h); g.lineTo(x + 10, y + h); g.lineTo(x, y + h / 2); g.closePath(); };
    castShadow(g, p, { blur: 6, a: 0.6, dx: 1, dy: 3 });
    let gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#fff0c8'); gr.addColorStop(0.5, P.accent); gr.addColorStop(1, '#a8701c'); g.fillStyle = gr; p(); g.fill();
    g.fillStyle = P.badgeIn; g.beginPath(); g.moveTo(x + 13, y + 3); g.lineTo(x + w - 13, y + 3); g.lineTo(x + w - 4, y + h / 2); g.lineTo(x + w - 13, y + h - 3); g.lineTo(x + 13, y + h - 3); g.lineTo(x + 4, y + h / 2); g.closePath(); g.fill();
    text(g, 'ROOKIE', x + w / 2 - 12, y + 13, { px: 9, wt: 700, ls: 1.6, col: P.accentText, align: 'center', shadow: false });
    text(g, 'BONUS', x + w / 2 - 12, y + 23, { px: 9, wt: 700, ls: 1.6, col: P.accentText, align: 'center', shadow: false });
    text(g, '×2', x + w - 24, y + 21, { px: 17, wt: 700, col: '#fff', align: 'center', shadow: false, glow: P.glow, blur: 8 });
  },
};
}

const rgbaOf = (rgb) => (a) => `rgba(${rgb},${a})`;
const LUMEN = {
  LG0: { name: 'Gold (reference)', accent: '#f2c36b', accentText: '#f7d48f', glow: 'rgba(255,190,90,0.85)', tint: rgbaOf('242,195,107'), btn: ['#fff0c8', '#f2c36b', '#b77f22'], ink0: '#1b1306', fill: ['#b77f22', '#ffe2a0'], tag: ['#ffe3a3', '#e2a94a'], badgeIn: 'rgba(20,14,4,0.9)',
    frame: ['#c3cfdb', '#5d6a78', '#252c35'], face: ['rgba(30,38,50,0.9)', 'rgba(9,12,18,0.95)'], numFill: (g, px) => goldFill(g, 0, px * 0.75), numGlow: 'rgba(255,170,60,0.55)',
    rNew: { frame: ['#fff0c8', '#e2a94a', '#8a5a14'], bg: ['#5a4320', '#1a130a'], head: ['#f2c36b', '#c48d34'], headInk: '#1b1306', edge: '#ffe2a0', glow: 'rgba(255,190,90,0.9)', floor: 'rgba(255,200,120,0.55)', back: 'rgba(255,190,100,0.35)' } },
  LC1: { name: 'Ice cyan', accent: '#6fe0ff', accentText: '#a9eeff', glow: 'rgba(90,210,255,0.85)', tint: rgbaOf('111,224,255'), btn: ['#e6fbff', '#76dcf7', '#2a8fb0'], ink0: '#04202a', fill: ['#1f86a8', '#c8f6ff'], tag: ['#c8f6ff', '#5fc6e6'], badgeIn: 'rgba(3,18,26,0.92)',
    frame: ['#d2e2ee', '#5f7486', '#222c36'], face: ['rgba(22,36,50,0.9)', 'rgba(6,11,18,0.95)'], numFill: (g, px) => { const gr = g.createLinearGradient(0, -px * 0.75, 0, 0); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.45, '#bff3ff'); gr.addColorStop(0.55, '#5fd0f2'); gr.addColorStop(1, '#1d6f8c'); return gr; }, numGlow: 'rgba(80,200,255,0.55)',
    rNew: { frame: ['#e6fbff', '#5fc6e6', '#165a73'], bg: ['#163d52', '#08141c'], head: ['#76dcf7', '#3fa8cc'], headInk: '#04202a', edge: '#c8f6ff', glow: 'rgba(90,210,255,0.9)', floor: 'rgba(120,220,255,0.5)', back: 'rgba(90,210,255,0.32)' } },
  LP2: { name: 'Platinum', accent: '#e4e9ef', accentText: '#f1e3cc', glow: 'rgba(235,240,250,0.75)', tint: rgbaOf('228,233,239'), btn: ['#ffffff', '#d9dfe6', '#8d97a3'], ink0: '#14181d', fill: ['#8d97a3', '#ffffff'], tag: ['#ffffff', '#c9d0d8'], badgeIn: 'rgba(14,16,20,0.92)',
    frame: ['#eef2f6', '#7c8794', '#2b3139'], face: ['rgba(30,33,38,0.9)', 'rgba(10,11,14,0.95)'], numFill: (g, px) => { const gr = g.createLinearGradient(0, -px * 0.75, 0, 0); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#f3ead9'); gr.addColorStop(0.56, '#b9b3a8'); gr.addColorStop(1, '#efe6d6'); return gr; }, numGlow: 'rgba(255,240,215,0.4)',
    rNew: { frame: ['#fff8ea', '#d8c3a0', '#6e5f48'], bg: ['#3d3933', '#121110'], head: ['#efe2c8', '#c9b28c'], headInk: '#1b1710', edge: '#fff5e2', glow: 'rgba(255,235,200,0.75)', floor: 'rgba(255,240,215,0.45)', back: 'rgba(255,240,215,0.25)' } },
  LT3: { name: 'Teal + brass', accent: '#3fd6c0', accentText: '#9cefe2', glow: 'rgba(60,220,200,0.8)', tint: rgbaOf('63,214,192'), btn: ['#f3dca0', '#c9a052', '#7a5a22'], ink0: '#1a1205', fill: ['#1d8f80', '#c4fff4'], tag: ['#c4fff4', '#3fbfac'], badgeIn: 'rgba(4,22,20,0.92)',
    frame: ['#e9d5a2', '#9a7a3e', '#3a2c14'], face: ['rgba(14,32,34,0.9)', 'rgba(5,12,13,0.95)'], numFill: (g, px) => { const gr = g.createLinearGradient(0, -px * 0.75, 0, 0); gr.addColorStop(0, '#fff6dc'); gr.addColorStop(0.45, '#e9cf8c'); gr.addColorStop(0.55, '#b88a3c'); gr.addColorStop(1, '#6e4f1a'); return gr; }, numGlow: 'rgba(230,190,110,0.45)',
    rNew: { frame: ['#f6e3b2', '#c9a052', '#6a4c18'], bg: ['#4a3a1c', '#15100a'], head: ['#e3c27c', '#b38a3e'], headInk: '#1a1205', edge: '#f6e3b2', glow: 'rgba(240,200,120,0.85)', floor: 'rgba(240,210,140,0.5)', back: 'rgba(240,200,120,0.3)' } },
};
LUMEN.LR4 = { name: 'Crimson + steel', accent: '#e8434f', accentText: '#ff9aa1', glow: 'rgba(240,60,70,0.8)', tint: rgbaOf('232,67,79'), btn: ['#ffb3b8', '#e8434f', '#8e1620'], ink0: '#ffffff', fill: ['#8e1620', '#ffb3b8'], tag: ['#ffb3b8', '#d8333f'], badgeIn: 'rgba(24,4,6,0.92)',
    frame: ['#dfe5eb', '#6d7782', '#262c33'], face: ['rgba(34,30,36,0.9)', 'rgba(11,9,12,0.95)'], numFill: (g, px) => { const gr = g.createLinearGradient(0, -px * 0.75, 0, 0); gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.5, '#ffd0d3'); gr.addColorStop(0.56, '#e8434f'); gr.addColorStop(1, '#7a0f18'); return gr; }, numGlow: 'rgba(240,60,70,0.5)',
    rNew: { frame: ['#ffd0d3', '#e8434f', '#6a0d15'], bg: ['#4a161c', '#14070a'], head: ['#e8434f', '#b0222e'], headInk: '#ffffff', edge: '#ffc2c6', glow: 'rgba(240,60,70,0.85)', floor: 'rgba(255,120,130,0.5)', back: 'rgba(240,60,70,0.3)' } };
LUMEN.LF5 = { name: 'Field Ops palette', accent: '#ff9f2e', accentText: '#ffb35c', glow: 'rgba(255,150,40,0.85)', tint: rgbaOf('255,159,46'), btn: ['#ffbd6e', '#ff9f2e', '#c4680c'], ink0: '#1a0f03', fill: ['#c4680c', '#ffc27a'], tag: ['#ffbd6e', '#ff9f2e'], badgeIn: 'rgba(27,30,34,0.95)',
    frame: ['#565d66', '#2b3036', '#121417'], face: ['rgba(32,36,42,0.96)', 'rgba(18,20,24,0.97)'], numFill: () => '#eceef0', numGlow: 'rgba(255,150,40,0.4)',
    rNew: { frame: ['#ffc27a', '#ff9f2e', '#7a4308'], bg: ['#3a2a18', '#15110c'], head: ['#ff9f2e', '#d97a14'], headInk: '#1a0f03', edge: '#ffc27a', glow: 'rgba(255,150,40,0.9)', floor: 'rgba(255,170,80,0.5)', back: 'rgba(255,150,60,0.3)' } };
const LG0 = makePI(lumenSkin({ code: 'LG0', ...LUMEN.LG0 }));
const LC1 = makePI(lumenSkin({ code: 'LC1', ...LUMEN.LC1 }));
const LP2 = makePI(lumenSkin({ code: 'LP2', ...LUMEN.LP2 }));
const LT3 = makePI(lumenSkin({ code: 'LT3', ...LUMEN.LT3 }));
const PI1 = makePI(lumenSkin({ code: 'PI1', ...LUMEN.LG0 }));
const LR4 = makePI(lumenSkin({ code: 'LR4', ...LUMEN.LR4 }));
const LF5 = makePI(lumenSkin({ code: 'LF5', ...LUMEN.LF5 }));
const PI2 = makePI({
  code: 'PI2', shape: 'cut', corner: 12, fw: 4, cardCorner: 8,
  bg: PI_BG('dw1', 0.58), sheetBg: '#0c0d0e', fade: 'rgba(18,20,23,0.97)',
  frame: ['#565d66', '#2b3036', '#121417'], frameTex: 'fbm', edgeHi: 'rgba(255,255,255,0.45)',
  face: ['rgba(32,36,42,0.96)', 'rgba(18,20,24,0.97)'],
  band: ['rgba(255,159,46,0.12)', 'rgba(255,159,46,0.02)'],
  ink: '#eceef0', ink2: '#b2b8c0', mute: '#7b838d', line: 'rgba(255,255,255,0.1)', lineStrong: 'rgba(255,159,46,0.8)', line2: 'rgba(255,255,255,0.22)',
  accent: '#ff9f2e', accentText: '#ffb35c', accentGlow: 'rgba(255,150,40,0.85)', titleLs: 1.6, titleGlow: null, btnLs: 1.6,
  numWt: 600, numSkew: 0, numFill: null, numGlow: 'rgba(255,150,40,0.4)',
  btnPrimary: ['#ffbd6e', '#ff9f2e', '#c4680c'], btnSecondary: ['#2e3339', '#24282d', '#1a1d21'], btnOff: ['#33373c', '#2a2d31', '#212427'], btnInk: '#1a0f03', btnGlow: 'rgba(255,150,40,0.15)',
  track: 'rgba(0,0,0,0.6)', fill: ['#c4680c', '#ffc27a'], selA: 'rgba(255,159,46,0.2)', selB: 'rgba(255,159,46,0.02)',
  tagAccent: ['#ffbd6e', '#ff9f2e'], tagAccentInk: '#1a0f03', tagWhite: ['#f4f5f6', '#c9ced4'], tagDark: ['#33383e', '#1e2125'],
  nudge: 'rgba(255,255,255,0.04)', badgeW: 122, btnTex: false,
  rarity: {
    gold: { frame: ['#ffc27a', '#ff9f2e', '#7a4308'], bg: ['#3a2a18', '#15110c'], head: ['#ff9f2e', '#d97a14'], headInk: '#1a0f03', edge: '#ffc27a', glow: 'rgba(255,150,40,0.9)', floor: 'rgba(255,170,80,0.5)', back: 'rgba(255,150,60,0.3)' },
    white: { frame: ['#f4f5f6', '#9aa2ab', '#3e444b'], bg: ['#363b42', '#141619'], head: ['#e4e7ea', '#b3b9c0'], headInk: '#121417', edge: '#ffffff', glow: 'rgba(230,235,240,0.7)', floor: 'rgba(230,235,240,0.4)', back: 'rgba(220,225,235,0.2)' },
    steel: { frame: ['#8d97a1', '#4a525b', '#1e2226'], bg: ['#2a2f35', '#111315'], head: ['#4a525b', '#33393f'], headInk: '#eceef0', edge: '#aab3bc', glow: 'rgba(170,180,190,0.6)', floor: 'rgba(180,190,200,0.3)', back: 'rgba(170,180,190,0.15)' },
    slot: { frame: ['#9cc4ff', '#3d8bff', '#173a78'], bg: ['#1c2d48', '#0c1320'], head: ['#3d8bff', '#2a62c0'], headInk: '#ffffff', edge: '#a8ccff', glow: 'rgba(80,150,255,0.8)', floor: 'rgba(110,170,255,0.4)', back: 'rgba(80,150,255,0.22)' },
  },
  faceDetail(g, x, y, w, h) {
    texture(g, TEX.fbm, x, y, w, h, { op: 'soft-light', a: 0.4, scale: 1 }); texture(g, TEX.grain, x, y, w, h, { op: 'overlay', a: 0.5 });
    g.fillStyle = 'rgba(255,255,255,0.025)'; for (let xx = x; xx < x + w; xx += 10) g.fillRect(xx, y, 0.6, h); for (let yy = y; yy < y + h; yy += 10) g.fillRect(x, yy, w, 0.6);
    // circuit traces in the lower corner
    g.strokeStyle = 'rgba(255,159,46,0.12)'; g.lineWidth = 1; const r = rng(x + y);
    for (let i = 0; i < 5; i++) { let px = x + w - 10 - r() * 60, py = y + h - 6; g.beginPath(); g.moveTo(px, py); py -= 10 + r() * 20; g.lineTo(px, py); px -= 10 + r() * 20; g.lineTo(px - 6, py - 6); g.stroke(); g.fillStyle = 'rgba(255,159,46,0.25)'; g.fillRect(px - 8, py - 8, 3, 3); }
  },
  bandDetail(g, x, y, w, h) { hazard(g, x + w - 46, y + h - 5, 38, 3, 'rgba(255,159,46,0.5)', 3); g.fillStyle = '#ff9f2e'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 8, y); g.lineTo(x, y + 8); g.fill(); },
  endCaps(g, x, y, w) { g.fillStyle = 'rgba(255,255,255,0.45)'; g.fillRect(x, y - 2, 1, 5); g.fillRect(x + w - 1, y - 2, 1, 5); },
  inlays(g, x, y, w, h, fw) { for (const [rx, ry] of [[x + w - 7, y + 7], [x + 7, y + h - 7], [x + w - 7, y + h - 7]]) { const gr = g.createRadialGradient(rx - 0.5, ry - 0.5, 0, rx, ry, 1.8); gr.addColorStop(0, '#d9dde1'); gr.addColorStop(1, '#2b3036'); g.fillStyle = gr; g.beginPath(); g.arc(rx, ry, 1.6, 0, TAU); g.fill(); } piMicro(g, 'EVC-07', x + 22, y + h - 0.5, { px: 6.5, col: 'rgba(255,255,255,0.35)' }); },
  btnDetail(g, x, y, w, h, v, off) { if (v === 'primary' && !off) hazard(g, x + w - 18, y, 18, h, 'rgba(26,15,3,0.25)', 3); if (v === 'secondary' && !off) { g.fillStyle = '#ff9f2e'; g.fillRect(x, y, 3, h); } },
  btnIcon(g, x, y, w, h, v, off, tw0, cx) { if (v === 'tertiary') { const c2 = off ? 'rgba(200,205,212,0.35)' : '#ff9f2e'; g.strokeStyle = c2; g.lineWidth = 1.4; const l = cx - tw0 / 2 - 8, r = cx + tw0 / 2 + 8; g.beginPath(); g.moveTo(l + 4, y + h / 2 - 8); g.lineTo(l, y + h / 2 - 8); g.lineTo(l, y + h / 2 + 8); g.lineTo(l + 4, y + h / 2 + 8); g.moveTo(r - 4, y + h / 2 - 8); g.lineTo(r, y + h / 2 - 8); g.lineTo(r, y + h / 2 + 8); g.lineTo(r - 4, y + h / 2 + 8); g.stroke(); } },
  barTicks() {},
  barFillDetail(g, x, y, w, h) { g.fillStyle = 'rgba(0,0,0,0.45)'; for (let xx = x + 5; xx < x + w; xx += 6) g.fillRect(xx, y, 1.5, h); },
  cardPattern(g, x, y, w, h) { g.fillStyle = 'rgba(255,255,255,0.035)'; for (let xx = x; xx < x + w; xx += 7) g.fillRect(xx, y, 0.6, h); for (let yy = y; yy < y + h; yy += 7) g.fillRect(x, yy, w, 0.6); },
  badge(g, x, y, w, h) {
    const p = () => chamfer(g, x, y, w, h, [7, 0, 0, 0]);
    castShadow(g, p, { blur: 5, a: 0.6, dx: 1, dy: 3 });
    g.fillStyle = '#1b1e22'; p(); g.fill(); g.strokeStyle = '#ff9f2e'; g.lineWidth = 1.2; p(); g.stroke();
    hazard(g, x + 2, y + 2, 10, h - 4, '#ff9f2e', 3);
    text(g, 'ROOKIE BONUS', x + 17, y + 13, { px: 9.5, wt: 700, ls: 1.2, col: '#ffb35c', shadow: false });
    piMicro(g, 'MULTIPLIER', x + 17, y + 24, { px: 7.5 });
    text(g, '×2', x + w - 6, y + 22, { px: 18, wt: 700, col: '#fff', align: 'right', shadow: false, glow: 'rgba(255,150,40,0.9)', blur: 8 });
  },
});
const PI3 = makePI({
  code: 'PI3', shape: 'skew', corner: 12, fw: 6, cardCorner: 8,
  bg: PI_BG('dw1', 0.45), sheetBg: '#0b0c0e', fade: 'rgba(14,16,20,0.97)',
  frame: ['#c9d0d7', '#6c757f', '#22272d'], frameTex: 'brushed', edgeHi: 'rgba(255,255,255,0.9)',
  face: ['rgba(26,30,36,0.95)', 'rgba(12,14,18,0.97)'],
  band: ['rgba(255,182,39,0.22)', 'rgba(255,182,39,0)'],
  ink: '#ffffff', ink2: '#c8ced6', mute: '#8a939d', line: 'rgba(255,255,255,0.12)', lineStrong: 'rgba(255,182,39,0.85)', line2: 'rgba(255,255,255,0.3)',
  accent: '#ffb627', accentText: '#ffc95a', accentGlow: 'rgba(255,170,30,0.9)', titleLs: 1, titleGlow: null, btnLs: 1.2,
  titleFill: (g, y, px) => steelFill(g, y, px * 0.8),
  numWt: 700, numSkew: 0.18, numFill: (g, px) => goldFill(g, 0, px * 0.75), numGlow: 'rgba(255,160,30,0.5)',
  btnPrimary: ['#ffe08a', '#ffb627', '#c27a06'], btnSecondary: ['#454c55', '#2a2f35', '#1b1f23'], btnOff: ['#3a3f45', '#2c3035', '#212428'], btnInk: '#1c1102', btnGlow: 'rgba(255,170,30,0.2)', btnTex: true,
  track: 'rgba(0,0,0,0.6)', fill: ['#c27a06', '#ffe08a'], selA: 'rgba(255,182,39,0.3)', selB: 'rgba(255,182,39,0.03)',
  tagAccent: ['#ffe08a', '#ffb627'], tagAccentInk: '#1c1102', tagWhite: ['#ffffff', '#d3d9df'], tagDark: ['#3d444c', '#22262b'],
  nudge: 'rgba(255,255,255,0.05)', badgeW: 100,
  rarity: {
    gold: { frame: ['#fff2b8', '#ffb627', '#8a5300'], bg: ['#6a4a12', '#1c1407'], head: ['#ffcf55', '#e09a12'], headInk: '#1c1102', edge: '#ffe08a', glow: 'rgba(255,175,40,0.95)', floor: 'rgba(255,200,90,0.6)', back: 'rgba(255,180,60,0.4)' },
    white: { frame: ['#ffffff', '#b3bcc6', '#4a525b'], bg: ['#454e59', '#15191e'], head: ['#ffffff', '#c3cbd3'], headInk: '#121518', edge: '#ffffff', glow: 'rgba(235,242,250,0.85)', floor: 'rgba(235,242,250,0.45)', back: 'rgba(225,235,250,0.25)' },
    steel: { frame: ['#a9b4bf', '#56616c', '#20262c'], bg: ['#2e3640', '#101318'], head: ['#56616c', '#3a434c'], headInk: '#ffffff', edge: '#b9c4cf', glow: 'rgba(170,190,210,0.7)', floor: 'rgba(170,190,210,0.35)', back: 'rgba(170,190,210,0.2)' },
    slot: { frame: ['#a8ccff', '#3d8bff', '#16367a'], bg: ['#1f3a66', '#0b1426'], head: ['#5aa0ff', '#2f6fd8'], headInk: '#ffffff', edge: '#b4d4ff', glow: 'rgba(80,150,255,0.85)', floor: 'rgba(110,170,255,0.45)', back: 'rgba(80,150,255,0.3)' },
  },
  faceDetail(g, x, y, w, h) {
    texture(g, TEX.grain, x, y, w, h, { op: 'overlay', a: 0.45 });
    g.fillStyle = 'rgba(255,255,255,0.025)'; for (let i = -h; i < w; i += 22) { g.beginPath(); g.moveTo(x + i, y + h); g.lineTo(x + i + 9, y + h); g.lineTo(x + i + 9 + h * 0.5, y); g.lineTo(x + i + h * 0.5, y); g.fill(); }
    const gr = g.createLinearGradient(0, y, 0, y + 30); gr.addColorStop(0, 'rgba(255,255,255,0.07)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(x, y, w, 30);
  },
  bandDetail(g, x, y, w, h) { const k = h * 0.6; g.fillStyle = '#ffb627'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6, y); g.lineTo(x + 6 - k * 0.3, y + h); g.lineTo(x, y + h); g.fill();  },
  endCaps(g, x, y, w, strong) { if (!strong) return; g.fillStyle = '#ffb627'; g.beginPath(); g.moveTo(x, y - 2); g.lineTo(x + 10, y - 2); g.lineTo(x + 8, y + 3); g.lineTo(x - 2, y + 3); g.fill(); },
  inlays(g, x, y, w, h, fw) { for (const [rx, ry] of [[x + fw / 2 + 0.5, y + 10], [x + fw / 2 + 0.5, y + h - 10], [x + w - fw / 2 - 0.5, y + h - 10]]) { const gr = g.createRadialGradient(rx - 0.7, ry - 0.7, 0, rx, ry, 2.4); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#3a4148'); g.fillStyle = gr; g.beginPath(); g.arc(rx, ry, 2, 0, TAU); g.fill(); } g.fillStyle = '#ffb627'; g.fillRect(x, y + 22, 2.5, h - 44); },
  btnDetail(g, x, y, w, h, v, off) { if (v === 'secondary' && !off) { g.fillStyle = '#ffb627'; g.fillRect(x, y + h - 3, w, 3); } },
  btnIcon(g, x, y, w, h, v, off, tw0, cx) { if (v !== 'secondary') { const c2 = v === 'primary' ? 'rgba(28,17,2,0.6)' : off ? 'rgba(200,205,212,0.35)' : '#ffb627'; g.fillStyle = c2; for (let i = 0; i < 2; i++) { const bx = cx + tw0 / 2 + 7 + i * 6; g.beginPath(); g.moveTo(bx, y + h / 2 - 5); g.lineTo(bx + 4, y + h / 2); g.lineTo(bx, y + h / 2 + 5); g.lineTo(bx - 2, y + h / 2 + 5); g.lineTo(bx + 2, y + h / 2); g.lineTo(bx - 2, y + h / 2 - 5); g.fill(); } } },
  barTicks(g, x, y, w, h) { g.fillStyle = 'rgba(255,255,255,0.07)'; for (let i = 1; i < 8; i++) g.fillRect(x + w * i / 8, y, 1.5, h); },
  barFillDetail(g, x, y, w, h) { g.fillStyle = 'rgba(255,255,255,0.18)'; for (let xx = x - h; xx < x + w; xx += 8) { g.beginPath(); g.moveTo(xx, y + h); g.lineTo(xx + 3, y + h); g.lineTo(xx + 3 + h, y); g.lineTo(xx + h, y); g.fill(); } },
  cardPattern(g, x, y, w, h, R) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.beginPath(); g.moveTo(x, y + h * 0.75); g.lineTo(x + w, y + h * 0.35); g.lineTo(x + w, y + h * 0.5); g.lineTo(x, y + h * 0.9); g.fill(); },
  badge(g, x, y, w, h, shape) {
    const p = () => shape(g, x, y, w, h, 6);
    castShadow(g, p, { blur: 6, a: 0.6, dx: 2, dy: 4 });
    let gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, '#ffe08a'); gr.addColorStop(0.5, '#ffb627'); gr.addColorStop(1, '#a86500'); g.fillStyle = gr; p(); g.fill();
    g.save(); p(); g.clip(); texture(g, TEX.brushed, x, y, w, h, { op: 'overlay', a: 0.4, scale: 0.4 }); g.fillStyle = 'rgba(28,17,2,0.88)'; g.beginPath(); g.moveTo(x + w - 34, y); g.lineTo(x + w, y); g.lineTo(x + w - 9, y + h); g.lineTo(x + w - 43, y + h); g.fill(); g.restore();
    p(); bevel(g, x, y, w, h, 0.8, 0.6, 1);
    text(g, 'ROOKIE', x + 14, y + 13, { px: 9.5, wt: 700, ls: 1.2, col: '#1c1102', shadow: false });
    text(g, 'BONUS', x + 12, y + 24, { px: 9.5, wt: 700, ls: 1.2, col: '#1c1102', shadow: false });
    g.save(); g.translate(x + w - 22, y + 22); g.transform(1, 0, -0.18, 1, 0, 0); text(g, '×2', 0, 0, { px: 18, wt: 700, col: '#fff', align: 'center', shadow: false, glow: 'rgba(255,170,30,0.9)', blur: 8 }); g.restore();
  },
});
