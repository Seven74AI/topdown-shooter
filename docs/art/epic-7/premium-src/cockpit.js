/* Premium round 2 — the EVAC COCKPIT, pushed further (PC1 day-break, PC2 rain + condensation, PC3 blue hour).
 * You sit in the evac helicopter at dawn. The world: a perspective ground plane of the real Downtown bake (burning,
 * far below) under the sky, banking and climbing, seen through the canopy (frame, centre post, glass with dust / rain /
 * condensation catching the sun). The cockpit: a painted, worn instrument panel with live gauges (attitude indicator
 * that tilts with the bank, altimeter climbing, torque), toggle switches, annunciator lamps; the team on a real MFD set
 * into the panel; the rewards projected on the tilted HUD combiner glass (amber, double image); the pilot's glove and
 * helmet edge; rotor-blade shadow sweeping across. Items are relit with a port of the photoreal relight renderer.
 */
function makeCockpit(V) {
  const AMB = '#ffbe55', AMB_GLOW = 'rgba(255,165,50,0.9)', PH = '#eef6ff', CY = '#8fd4ff';
  const col = { name: '#fff2da', sub: 'rgba(255,226,178,0.85)', mute: 'rgba(255,214,150,0.62)', accentText: '#ffcf6e' };
  const hash = (x, y, s = 0) => { const h = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453; return h - Math.floor(h); };

  // ---------- items: a port of the photoreal relight (photoreal-2/src/relight.ts): domes per colour region ----------
  function boxBlur(a, w, h, r) {
    const tmp = new Float32Array(w * h), rr = Math.max(1, Math.round(r));
    for (let p = 0; p < 2; p++) {
      for (let y = 0; y < h; y++) { let acc = 0; for (let x = -rr; x <= rr; x++) acc += a[y * w + clamp(x, 0, w - 1)]; for (let x = 0; x < w; x++) { tmp[y * w + x] = acc / (2 * rr + 1); acc += a[y * w + Math.min(w - 1, x + rr + 1)] - a[y * w + Math.max(0, x - rr)]; } }
      for (let x = 0; x < w; x++) { let acc = 0; for (let y = -rr; y <= rr; y++) acc += tmp[clamp(y, 0, h - 1) * w + x]; for (let y = 0; y < h; y++) { a[y * w + x] = acc / (2 * rr + 1); acc += tmp[Math.min(h - 1, y + rr + 1) * w + x] - tmp[Math.max(0, y - rr) * w + x]; } }
    }
    return a;
  }
  function relit(slot, id, s) {
    return cached(`relit-${V.code}-${slot}-${id}-${s}`, () => {
      const ss = 3, W = Math.ceil(s * DPR * ss / 2) * 2, t = tileGeom(slot, s);
      const src = document.createElement('canvas'); src.width = src.height = W;
      const sg = src.getContext('2d'); const k = W / s; sg.scale(k, k); survivorAt(sg, tileLook(slot, id), s * t.cx, s * t.cy, t.r, t.ang);
      const im = sg.getImageData(0, 0, W, W), d = im.data, n = W * W;
      const A = new Float32Array(n), lum = new Float32Array(n), E = new Float32Array(n);
      for (let i = 0; i < n; i++) { A[i] = d[i * 4 + 3] / 255; lum[i] = (d[i * 4] * 0.3 + d[i * 4 + 1] * 0.55 + d[i * 4 + 2] * 0.15) / 255; }
      for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x; if (A[i] < 0.5) continue; let e = 0;
        for (const j of [i - 1, i + 1, i - W, i + W]) e = Math.max(e, (Math.abs(d[i * 4] - d[j * 4]) + Math.abs(d[i * 4 + 1] - d[j * 4 + 1]) + Math.abs(d[i * 4 + 2] - d[j * 4 + 2])) / 255);
        E[i] = Math.min(1, Math.max(lum[i] < 0.09 ? 1 : 0, e > 0.25 ? e : 0));
      }
      const cut = new Float32Array(n); for (let i = 0; i < n; i++) cut[i] = A[i] * (1 - E[i]);
      const b1 = boxBlur(cut.slice(), W, W, 1.5 * ss * DPR / 2), b2 = boxBlur(cut.slice(), W, W, 4 * ss * DPR / 2), b3 = boxBlur(cut.slice(), W, W, 9 * ss * DPR / 2);
      const H = new Float32Array(n);
      for (let i = 0; i < n; i++) { const x = i % W, y = (i / W) | 0; H[i] = (b1[i] * 0.25 + b2[i] * 0.35 + b3[i] * 0.4) * A[i] + (hash(x >> 1, y >> 1, 3) - 0.5) * 0.035 * A[i] - E[i] * 0.08; }
      const out = sg.createImageData(W, W), o = out.data;
      const L0 = [-0.5, -0.72, 0.48], ll = Math.hypot(...L0), lx = L0[0] / ll, ly = L0[1] / ll, lz = L0[2] / ll, K = 9 * 2 / DPR;
      const tint = V.tint, amb = V.night ? 0.3 : 0.36;
      for (let y = 1; y < W - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x, a = A[i]; if (a <= 0.004) continue;
        const dx = (H[i + 1] - H[i - 1]) * K, dy = (H[i + W] - H[i - W]) * K, nl = Math.hypot(dx, dy, 1);
        const nx = -dx / nl, ny = -dy / nl, nz = 1 / nl, nd = nx * lx + ny * ly + nz * lz, diff = Math.max(0, nd);
        const r0 = d[i * 4], g0 = d[i * 4 + 1], b0 = d[i * 4 + 2], mx = Math.max(r0, g0, b0), mn = Math.min(r0, g0, b0), sat = mx > 0 ? (mx - mn) / mx : 0, l0 = lum[i];
        const gloss = Math.min(1, (l0 < 0.18 ? 0.55 : 0) + (sat > 0.55 ? 0.5 : 0) + (l0 > 0.8 ? 0.4 : 0) + 0.08);
        const rz = 2 * nd * nz - lz, sp = Math.pow(Math.max(0, rz), 22) * gloss;
        const gr = (hash(x, y, 9) - 0.5) * 14 * (1 - gloss);
        o[i * 4] = Math.min(255, (r0 + gr) * (amb + 0.9 * diff * tint[0]) + sp * 255 * tint[0]);
        o[i * 4 + 1] = Math.min(255, (g0 + gr) * (amb + 0.9 * diff * tint[1]) + sp * 245 * tint[1]);
        o[i * 4 + 2] = Math.min(255, (b0 + gr) * (amb + 0.9 * diff * tint[2]) + sp * 235 * tint[2]);
        o[i * 4 + 3] = a * 255;
      }
      sg.setTransform(1, 0, 0, 1, 0, 0); sg.clearRect(0, 0, W, W); sg.putImageData(out, 0, 0);
      const [c, g] = mk(s, s);
      g.save(); g.filter = `blur(${s * 0.04}px)`; g.globalAlpha = 0.65; g.drawImage(itemArt(slot, id, s, 'sil'), s * 0.05, s * 0.07, s, s); g.restore();
      g.imageSmoothingQuality = 'high'; g.drawImage(src, 0, 0, s, s);
      return c;
    });
  }

  // ---------- the world below ----------
  function cityCanvas() {
    return cached(`ck-city-${V.code}`, () => {
      const M = G7.map, ppm = Math.min(16, 1800 / Math.max(M.widthM, M.heightM));
      const w = Math.round(M.widthM * ppm), h = Math.round(M.heightM * ppm);
      const city = G7.render({ stage: 5, ppm, x0: 0, y0: 0, w: M.widthM, h: M.heightM, power: 'off', noLight: true });
      const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
      g.drawImage(city, 0, 0, w, h);
      const r = rng(41);
      // fires and smoke (the city burns)
      for (let i = 0; i < 14; i++) {
        const x = r() * w, y = r() * h, s = 10 + r() * 26;
        const sm = g.createRadialGradient(x + s * 0.8, y - s * 0.4, 0, x + s * 0.8, y - s * 0.4, s * 3); sm.addColorStop(0, 'rgba(20,18,18,0.55)'); sm.addColorStop(1, 'rgba(20,18,18,0)');
        g.fillStyle = sm; g.fillRect(x - s * 3, y - s * 4, s * 7, s * 7);
        g.globalCompositeOperation = 'lighter';
        const fg = g.createRadialGradient(x, y, 0, x, y, s); fg.addColorStop(0, 'rgba(255,200,110,0.95)'); fg.addColorStop(0.3, 'rgba(255,120,40,0.6)'); fg.addColorStop(1, 'rgba(120,30,0,0)');
        g.fillStyle = fg; g.fillRect(x - s, y - s, s * 2, s * 2); g.globalCompositeOperation = 'source-over';
      }
      grade(g, w, h, V.look, V.cityDim);
      return c;
    });
  }
  function cityMips() {
    return cached(`ck-mips-${V.code}`, () => {
      const c0 = cityCanvas(), m = [c0];
      for (let l = 1; l < 3; l++) { const p0 = m[l - 1], c = document.createElement('canvas'); c.width = Math.ceil(p0.width / 2); c.height = Math.ceil(p0.height / 2); const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(p0, 0, 0, c.width, c.height); m.push(c); }
      const g = document.createElement('canvas').getContext('2d');
      return [m[0], m[1], m[2], ...m.map((c) => g.createPattern(c, 'repeat'))];
    });
  }
  function bank(t, still) { return still ? V.bank0 : V.bank0 + 0.055 * Math.sin(t * 0.23) + 0.01 * Math.sin(t * 0.9); }
  function world(g, L, t, still) {
    const W = L.w, H = L.h, b = bank(t, still);
    const shake = still ? [0, 0] : [Math.sin(t * 37) * 0.35 + Math.sin(t * 13) * 0.2, Math.cos(t * 41) * 0.35];
    g.save(); g.translate(W / 2 + shake[0], H * 0.55 + shake[1]); g.rotate(b); g.translate(-W / 2, -H * 0.55);
    const hz = H * V.horizon + (still ? 0 : Math.sin(t * 0.17) * 3);
    // sky
    let gr = g.createLinearGradient(0, hz - H * 0.8, 0, hz);
    gr.addColorStop(0, V.sky[0]); gr.addColorStop(0.6, V.sky[1]); gr.addColorStop(1, V.sky[2]);
    g.fillStyle = gr; g.fillRect(-W * 0.3, hz - H * 1.2, W * 1.6, H * 1.2 + 2);
    if (V.stars) { const rr = rng(3); g.fillStyle = 'rgba(255,255,255,0.7)'; for (let i = 0; i < 60; i++) { const sx = rr() * W * 1.4 - W * 0.2, sy = hz - rr() * H; g.globalAlpha = rr() * 0.6 * clamp((hz - sy) / (H * 0.4)); g.fillRect(sx, sy, 1, 1); } g.globalAlpha = 1; }
    // ground plane: the city bake as an endless repeating pattern, drawn in perspective strips (far below)
    const M = cityMips(), cw = M[0].width, f = 260;
    const yb = H * 1.25, zNear = 0.75 * cw * f / (0.8 * W), HF = zNear * (yb - hz);
    const fwd = still ? 0 : t * 14, cx = cw * 0.5 + (still ? 0 : Math.sin(t * 0.05) * cw * 0.1);
    const N = 64;
    for (let i = 0; i < N; i++) {
      const sy0 = hz + 1 + Math.pow(i / N, 1.7) * (yb - hz), sy1 = hz + 1 + Math.pow((i + 1) / N, 1.7) * (yb - hz) + 0.7;
      const z0 = Math.min(HF / Math.max(0.5, sy0 - hz), cw * 14), z1 = Math.min(HF / Math.max(0.5, sy1 - hz), cw * 14);
      const half = W * 0.8 * ((z0 + z1) / 2) / f, sw = half * 2, sh = Math.max(0.5, z0 - z1), DW = W * 1.6, DH = sy1 - sy0;
      const lvl = sw / DW > 4 ? 2 : sw / DW > 2 ? 1 : 0, k = 1 / (1 << lvl);
      const sx = (cx - half) * k, sy = (-z0 - fwd) * k;
      g.save(); g.transform(DW / (sw * k), 0, 0, DH / (sh * k), -W * 0.3 - sx * DW / (sw * k), sy0 - sy * DH / (sh * k));
      g.fillStyle = M[3 + lvl]; g.fillRect(sx, sy, sw * k, sh * k); g.restore();
    }
    // low cloud wisps drifting under the aircraft (also hide the repeat of the city tile)
    for (let i = 0; i < 9; i++) {
      const d = ((hash(i, 5) + (still ? 0 : t * 0.02)) % 1), cy2 = hz + 4 + Math.pow(d, 1.6) * H * 0.75, sc = 0.3 + d * 1.6;
      const cxx = ((hash(i, 6) * 1.6 - 0.3) + (still ? 0 : Math.sin(t * 0.03 + i) * 0.02)) * W;
      g.save(); g.translate(cxx, cy2); g.scale(sc * 3.2, sc * 0.55);
      const cg = g.createRadialGradient(0, 0, 0, 0, 0, 40); cg.addColorStop(0, V.cloud); cg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = cg; g.globalAlpha = 0.55 + 0.45 * Math.sin(d * Math.PI); g.fillRect(-40, -40, 80, 80); g.restore();
    }
    // aerial haze toward the horizon, sun glow
    gr = g.createLinearGradient(0, hz, 0, hz + H * 0.6); gr.addColorStop(0, V.haze); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(-W * 0.3, hz - 2, W * 1.6, H * 0.5);
    if (V.sun) { const [sx, sa, sc] = V.sun; bloom(g, W * sx, hz - 4, W * 0.45, sc, sa); bloom(g, W * sx, hz - 4, W * 0.08, 'rgba(255,248,230,1)', sa); }
    g.restore();
    glassEffects(g, L, t, still);
  }
  function glassEffects(g, L, t, still) {
    const W = L.w, H = L.h;
    if (V.dust) texture(g, TEX.scratch, 0, 0, W, H, { op: 'lighter', a: 0.12, scale: 1.2 });
    if (V.rain) {
      g.drawImage(cached(`ck-beads-${W}-${H}`, () => {
        const [c, b] = mk(W, H); const r = rng(77);
        for (let i = 0; i < W * H / 260; i++) {
          const x = r() * W, y = r() * H, s = 0.6 + Math.pow(r(), 3) * 3.2;
          b.fillStyle = 'rgba(0,0,0,0.22)'; b.beginPath(); b.ellipse(x + s * 0.3, y + s * 0.4, s, s * 1.1, 0, 0, TAU); b.fill();
          const gg = b.createRadialGradient(x - s * 0.3, y - s * 0.4, 0, x, y, s); gg.addColorStop(0, 'rgba(255,240,220,0.75)'); gg.addColorStop(0.4, 'rgba(200,215,235,0.18)'); gg.addColorStop(1, 'rgba(255,255,255,0.05)');
          b.fillStyle = gg; b.beginPath(); b.ellipse(x, y, s, s * 1.1, 0, 0, TAU); b.fill();
        }
        return c;
      }), 0, 0, W, H);
      // running streaks
      g.save(); g.lineCap = 'round';
      for (let i = 0; i < 16; i++) {
        const sp = 40 + hash(i, 1) * 60, x = hash(i, 2) * W, ph = still ? hash(i, 3) : (t * sp / H + hash(i, 3)) % 1, y = ph * H * 1.2 - H * 0.1;
        const gr = g.createLinearGradient(0, y - 30, 0, y); gr.addColorStop(0, 'rgba(220,230,245,0)'); gr.addColorStop(1, 'rgba(235,240,250,0.35)');
        g.strokeStyle = gr; g.lineWidth = 1.2; g.beginPath(); g.moveTo(x + Math.sin(y * 0.05 + i) * 2, y - 30); g.quadraticCurveTo(x - 1, y - 12, x, y); g.stroke();
        g.fillStyle = 'rgba(255,245,230,0.7)'; g.beginPath(); g.arc(x, y, 1.6, 0, TAU); g.fill();
      }
      g.restore();
    }
    if (V.fog) { // condensation creeping in from the canopy edges
      g.drawImage(cached(`ck-fog-${W}-${H}`, () => { const [c, b] = mk(W, H);
        const gr = b.createRadialGradient(W / 2, H * 0.45, H * 0.35, W / 2, H * 0.5, W * 0.62); gr.addColorStop(0, 'rgba(200,210,225,0)'); gr.addColorStop(1, `rgba(200,210,225,${V.fog})`);
        b.fillStyle = gr; b.fillRect(0, 0, W, H); b.globalCompositeOperation = 'destination-in'; b.fillStyle = pat(b, TEX.fbm, 0.8); b.fillRect(0, 0, W, H); return c; }), 0, 0, W, H);
    }
  }

  // ---------- cockpit hardware ----------
  function painted(g, pathFn, x, y, w, h, seed, base = V.panel) {
    const gr = g.createLinearGradient(x, y, x + w * 0.3, y + h); gr.addColorStop(0, base[0]); gr.addColorStop(1, base[1]);
    g.fillStyle = gr; pathFn(); g.fill();
    g.save(); pathFn(); g.clip();
    texture(g, TEX.fbm, x, y, w, h, { op: 'soft-light', a: 0.75, scale: 0.7, ox: seed * 37 });
    texture(g, TEX.grain, x, y, w, h, { op: 'overlay', a: 0.6 });
    texture(g, TEX.scratch, x, y, w, h, { op: 'source-over', a: 0.22, scale: 0.6, oy: seed * 13 });
    // worn paint at the edges (bare aluminium shows through)
    const r = rng(seed);
    for (let i = 0; i < (w + h) / 9; i++) {
      const side = (r() * 4) | 0, tt = r(), cx = side === 0 ? x + tt * w : side === 1 ? x + w : side === 2 ? x + tt * w : x, cy = side === 0 ? y : side === 1 ? y + tt * h : side === 2 ? y + h : y + tt * h, rad = 0.8 + r() * 2.4;
      g.fillStyle = 'rgba(170,176,182,0.5)'; g.beginPath(); for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; g.lineTo(cx + Math.cos(a) * rad * (0.5 + r()), cy + Math.sin(a) * rad * (0.5 + r()) * 0.7); } g.closePath(); g.fill();
    }
    keyWash(g, x, y, w, h, V.night ? 0.06 : 0.14, 0.35);
    if (V.night) { const fl = g.createRadialGradient(x + w * 0.5, y + h, 0, x + w * 0.5, y + h, Math.max(w, h)); fl.addColorStop(0, 'rgba(255,170,80,0.16)'); fl.addColorStop(1, 'rgba(255,170,80,0)'); g.globalCompositeOperation = 'lighter'; g.fillStyle = fl; g.fillRect(x, y, w, h); g.globalCompositeOperation = 'source-over'; }
    g.restore();
    pathFn(); bevel(g, x, y, w, h, 0.35, 0.7, 1.2);
  }
  function dzus(g, x, y, r = 2.6) {
    const gr = g.createRadialGradient(x - r * 0.4, y - r * 0.4, 0, x, y, r); gr.addColorStop(0, '#dfe4e8'); gr.addColorStop(0.6, '#7d868f'); gr.addColorStop(1, '#2b3035');
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.beginPath(); g.arc(x + 0.6, y + 0.8, r, 0, TAU); g.fill();
    g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.strokeStyle = '#1c2024'; g.lineWidth = r * 0.35; g.beginPath(); g.moveTo(x - r * 0.6, y - r * 0.3); g.lineTo(x + r * 0.6, y + r * 0.3); g.stroke();
  }
  function stencil(g, s, x, y, px = 8, al = 0.7, align = 'center') { text(g, s, x, y, { px, wt: 600, ls: 0.8, col: `rgba(235,236,230,${al})`, align, shadow: false }); }
  function gaugeHousing(g, cx, cy, r) {
    castShadow(g, () => { g.beginPath(); g.arc(cx, cy, r + 3, 0, TAU); }, { blur: 4, a: 0.7, dx: 1, dy: 2 });
    const gr = g.createLinearGradient(cx - r, cy - r, cx + r, cy + r); gr.addColorStop(0, '#5b6168'); gr.addColorStop(0.5, '#23272b'); gr.addColorStop(1, '#0d0f11');
    g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r + 3, 0, TAU); g.fill();
    g.fillStyle = '#07080a'; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill();
    for (const a of [0.8, 2.4, 3.9, 5.5]) dzus(g, cx + Math.cos(a) * (r + 1.6), cy + Math.sin(a) * (r + 1.6), 1.3);
  }
  function gaugeFace(g, cx, cy, r, kind, t, still) {
    g.save(); g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.clip();
    if (kind === 'adi') { // attitude indicator: tilts with the bank
      const b = bank(t, still), p = still ? 0.06 : 0.06 + 0.04 * Math.sin(t * 0.17);
      g.save(); g.translate(cx, cy); g.rotate(-b); g.translate(0, p * r);
      let gr = g.createLinearGradient(0, -r, 0, 0); gr.addColorStop(0, '#244f84'); gr.addColorStop(1, '#5d8fc4'); g.fillStyle = gr; g.fillRect(-r * 1.5, -r * 1.5, r * 3, r * 1.5);
      gr = g.createLinearGradient(0, 0, 0, r); gr.addColorStop(0, '#7a5a34'); gr.addColorStop(1, '#3b2914'); g.fillStyle = gr; g.fillRect(-r * 1.5, 0, r * 3, r * 1.5);
      g.strokeStyle = '#fff'; g.lineWidth = 1; g.beginPath(); g.moveTo(-r * 1.5, 0); g.lineTo(r * 1.5, 0); for (const k of [-2, -1, 1, 2]) { const w = k % 2 ? r * 0.25 : r * 0.45; g.moveTo(-w, k * r * 0.2); g.lineTo(w, k * r * 0.2); } g.stroke();
      g.restore();
      g.strokeStyle = AMB; g.lineWidth = 2; g.beginPath(); g.moveTo(cx - r * 0.6, cy); g.lineTo(cx - r * 0.2, cy); g.lineTo(cx, cy + r * 0.12); g.lineTo(cx + r * 0.2, cy); g.lineTo(cx + r * 0.6, cy); g.stroke();
      g.fillStyle = AMB; g.beginPath(); g.moveTo(cx, cy - r + 2); g.lineTo(cx - 3, cy - r + 7); g.lineTo(cx + 3, cy - r + 7); g.fill();
    } else {
      const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, '#16191c'); gr.addColorStop(1, '#050607'); g.fillStyle = gr; g.fillRect(cx - r, cy - r, r * 2, r * 2);
      g.strokeStyle = '#e9ebe6'; g.lineWidth = 0.8;
      for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, l = i % 4 === 0 ? r * 0.2 : r * 0.1; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92); g.lineTo(cx + Math.cos(a) * (r * 0.92 - l), cy + Math.sin(a) * (r * 0.92 - l)); g.stroke(); }
      if (kind === 'trq') { g.strokeStyle = '#7fd38a'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r * 0.8, Math.PI * 0.8, Math.PI * 1.7); g.stroke(); g.strokeStyle = AMB; g.beginPath(); g.arc(cx, cy, r * 0.8, Math.PI * 1.7, Math.PI * 1.95); g.stroke(); }
      const v = kind === 'alt' ? (still ? 0.3 : t * 0.35) : (still ? 0.4 : 0.42 + 0.03 * Math.sin(t * 2.3));
      const ang = kind === 'alt' ? v * TAU - Math.PI / 2 : Math.PI * (0.8 + v * 1.1);
      g.strokeStyle = '#fff'; g.lineWidth = 1.6; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - Math.cos(ang) * r * 0.15, cy - Math.sin(ang) * r * 0.15); g.lineTo(cx + Math.cos(ang) * r * 0.78, cy + Math.sin(ang) * r * 0.78); g.stroke();
      if (kind === 'alt') { const a2 = v * TAU / 10 - Math.PI / 2; g.lineWidth = 2.6; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a2) * r * 0.5, cy + Math.sin(a2) * r * 0.5); g.stroke(); }
      g.fillStyle = '#444'; g.beginPath(); g.arc(cx, cy, 2, 0, TAU); g.fill();
      stencil(g, kind === 'alt' ? 'ALT' : 'TRQ', cx, cy + r * 0.55, Math.max(6, r * 0.32), 0.75);
    }
    // glass glare
    const gl = g.createLinearGradient(cx - r, cy - r, cx + r * 0.2, cy + r * 0.2); gl.addColorStop(0, 'rgba(255,255,255,0.28)'); gl.addColorStop(0.45, 'rgba(255,255,255,0.04)'); gl.addColorStop(0.5, 'rgba(255,255,255,0)');
    g.fillStyle = gl; g.fillRect(cx - r, cy - r, r * 2, r * 2);
    g.restore();
  }
  function toggleSw(g, x, y, up = true) {
    const gr = g.createRadialGradient(x - 1, y - 1, 0, x, y, 4); gr.addColorStop(0, '#d9dde1'); gr.addColorStop(1, '#3b4045');
    g.fillStyle = '#0b0c0e'; g.beginPath(); g.arc(x, y, 4.2, 0, TAU); g.fill(); g.fillStyle = gr; g.beginPath(); g.arc(x, y, 3.3, 0, TAU); g.fill();
    const ty = up ? -7 : 7; g.strokeStyle = '#cfd4d9'; g.lineWidth = 2.4; g.lineCap = 'round'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 1.5, y + ty); g.stroke();
    g.fillStyle = '#f2f4f6'; g.beginPath(); g.arc(x + 1.5, y + ty, 1.8, 0, TAU); g.fill();
    g.fillStyle = 'rgba(0,0,0,0.4)'; g.beginPath(); g.ellipse(x + 3, y + 2, 3, 1.4, 0.5, 0, TAU); g.fill();
  }
  function lamp(g, x, y, w, h, label, colr, on) {
    g.fillStyle = '#060708'; g.fillRect(x - 1, y - 1, w + 2, h + 2);
    const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, on ? colr : '#2a2b2c'); gr.addColorStop(1, on ? 'rgba(0,0,0,0.25)' : '#141516');
    g.fillStyle = on ? colr : '#1d1e20'; g.fillRect(x, y, w, h); g.fillStyle = gr; g.globalAlpha = 0.6; g.fillRect(x, y, w, h); g.globalAlpha = 1;
    if (on) bloom(g, x + w / 2, y + h / 2, w * 0.9, colr.replace('rgb', 'rgba').replace(')', ',0.35)'));
    text(g, label, x + w / 2, y + h / 2 + 2.6, { px: 7, wt: 700, col: on ? 'rgba(20,12,0,0.85)' : 'rgba(200,200,190,0.35)', align: 'center', shadow: false });
    g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(x, y, w, 1);
  }
  function glove(g, x, y, s) {
    // the pilot's gloved hand on the collective grip (lower right): leather fingers wrapped round the grip, rim-lit by the sun
    g.save(); g.translate(x, y); g.scale(s, s);
    const stick = g.createLinearGradient(20, 0, 52, 0); stick.addColorStop(0, '#2a2e33'); stick.addColorStop(0.4, '#5a6068'); stick.addColorStop(1, '#0e1012');
    g.fillStyle = stick; g.beginPath(); g.moveTo(24, 130); g.lineTo(28, 40); g.lineTo(50, 40); g.lineTo(54, 130); g.closePath(); g.fill();
    const head = g.createLinearGradient(18, 0, 58, 0); head.addColorStop(0, '#3d4349'); head.addColorStop(0.35, '#7b838c'); head.addColorStop(1, '#121417');
    g.fillStyle = head; rrect(g, 18, 8, 40, 30, 6); g.fill();
    g.fillStyle = '#c47a1e'; rrect(g, 24, 12, 8, 5, 1.5); g.fill(); g.fillStyle = '#1b1d20'; g.beginPath(); g.arc(46, 15, 3.5, 0, TAU); g.fill(); g.fillStyle = '#6b7178'; g.beginPath(); g.arc(45.4, 14.4, 2, 0, TAU); g.fill();
    // back of the hand + wrist
    const lth = (y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); gr.addColorStop(0, '#4a4038'); gr.addColorStop(0.5, '#2a241f'); gr.addColorStop(1, '#14110e'); return gr; };
    g.fillStyle = lth(30, 120); g.beginPath(); g.moveTo(-6, 120); g.quadraticCurveTo(-4, 70, 14, 52); g.quadraticCurveTo(20, 34, 34, 34); g.lineTo(40, 70); g.quadraticCurveTo(26, 96, 20, 124); g.closePath(); g.fill();
    // four fingers wrapped over the grip, each a rounded, lit cylinder
    for (let i = 0; i < 4; i++) {
      const fy = 36 + i * 11, fx0 = 22, fx1 = 62 - i * 1.5;
      const gr = g.createLinearGradient(0, fy - 5, 0, fy + 6); gr.addColorStop(0, '#5a4e44'); gr.addColorStop(0.45, '#2e2721'); gr.addColorStop(1, '#100d0b');
      g.fillStyle = gr; rrect(g, fx0, fy - 5, fx1 - fx0, 11, 5.5); g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.65)'; g.lineWidth = 1; g.beginPath(); g.moveTo(fx0 + 22, fy - 4); g.lineTo(fx0 + 22, fy + 5); g.moveTo(fx0 + 33, fy - 4); g.lineTo(fx0 + 33, fy + 5); g.stroke(); // knuckle creases
      g.strokeStyle = V.rim; g.lineWidth = 1.1; g.beginPath(); g.moveTo(fx0 + 6, fy - 4.6); g.lineTo(fx1 - 6, fy - 4.6); g.stroke();
    }
    // thumb over the top
    g.fillStyle = lth(18, 40); g.beginPath(); g.moveTo(16, 50); g.quadraticCurveTo(14, 26, 34, 22); g.quadraticCurveTo(46, 20, 48, 28); g.quadraticCurveTo(40, 32, 30, 38); g.quadraticCurveTo(24, 46, 22, 56); g.closePath(); g.fill();
    g.strokeStyle = V.rim; g.lineWidth = 1.3; g.beginPath(); g.moveTo(15, 46); g.quadraticCurveTo(14, 26, 34, 22); g.quadraticCurveTo(44, 20, 47, 26); g.stroke();
    // velcro strap on the wrist
    g.fillStyle = '#1e1b18'; g.beginPath(); g.moveTo(-6, 104); g.lineTo(24, 96); g.lineTo(22, 108); g.lineTo(-6, 116); g.closePath(); g.fill();
    g.save(); g.beginPath(); g.rect(-10, 0, 80, 140); g.clip(); texture(g, TEX.grain, -10, 0, 80, 140, { op: 'overlay', a: 0.7, scale: 0.35 }); g.restore();
    g.restore();
  }
  /** Seven-segment LED digit (instrument typography), unlit segments faintly visible. */
  function seg7(g, x, y, w, h, ch, onCol, offCol) {
    const SEG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abcdfg', '+': 'gp' };
    const on = SEG[ch] || '', t = Math.max(2, w * 0.17), sk = w * 0.12;
    const seg = (k) => {
      const hh = h / 2;
      const P = { a: [t * 0.6, 0, w - t * 0.6, 0, 1], d: [t * 0.6, h, w - t * 0.6, h, 1], g: [t * 0.6, hh, w - t * 0.6, hh, 1], f: [0, t * 0.6, 0, hh - t * 0.4, 0], e: [0, hh + t * 0.4, 0, h - t * 0.6, 0], b: [w, t * 0.6, w, hh - t * 0.4, 0], c: [w, hh + t * 0.4, w, h - t * 0.6, 0], p: [w / 2, hh * 0.45, w / 2, hh * 1.55, 0] }[k];
      if (!P) return;
      const [x0, y0, x1, y1, hor] = P, sx = (yy) => x + (h - yy) / h * sk;
      g.beginPath();
      if (hor) { g.moveTo(sx(y0) + x0, y + y0); g.lineTo(sx(y0) + x0 + t / 2, y + y0 - t / 2); g.lineTo(sx(y1) + x1 - t / 2, y + y1 - t / 2); g.lineTo(sx(y1) + x1, y + y1); g.lineTo(sx(y1) + x1 - t / 2, y + y1 + t / 2); g.lineTo(sx(y0) + x0 + t / 2, y + y0 + t / 2); }
      else { g.moveTo(sx(y0) + x0, y + y0); g.lineTo(sx(y0) + x0 + t / 2, y + y0 + t / 2); g.lineTo(sx(y1) + x1 + t / 2, y + y1 - t / 2); g.lineTo(sx(y1) + x1, y + y1); g.lineTo(sx(y1) + x1 - t / 2, y + y1 - t / 2); g.lineTo(sx(y0) + x0 - t / 2, y + y0 + t / 2); }
      g.closePath(); g.fill();
    };
    g.fillStyle = offCol; for (const k of 'abcdefg') if (!on.includes(k)) seg(k);
    g.save(); g.fillStyle = onCol; g.shadowColor = AMB_GLOW; g.shadowBlur = 8; for (const k of on) seg(k); g.restore();
    g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,240,210,0.45)'; for (const k of on) seg(k); g.restore();
  }
  function rubberKey(g, x, y, w, h, label, { legend = '#f4f1e8', led = null, glow = 0.5 } = {}) {
    const plate = cached(`ck-key-${V.code}-${w}-${h}-${label}-${legend}`, () => {
      const pad = 12, [c, b] = mk(w + pad * 2, h + pad * 2); b.translate(pad, pad);
      const hp = () => rrect(b, -4, -4, w + 8, h + 8, 8);
      painted(b, hp, -4, -4, w + 8, h + 8, w * 3 + h, ['#3a3f45', '#16191c']);
      dzus(b, -1, -1, 1.6); dzus(b, w + 1, -1, 1.6); dzus(b, -1, h + 1, 1.6); dzus(b, w + 1, h + 1, 1.6);
      const kp = () => rrect(b, 2, 2, w - 4, h - 4, 6);
      b.save(); b.shadowColor = 'rgba(0,0,0,0.85)'; b.shadowBlur = 4; b.shadowOffsetY = 2; b.fillStyle = '#111'; kp(); b.fill(); b.restore();
      const gr = b.createLinearGradient(0, 2, 0, h - 2); gr.addColorStop(0, '#4a4f55'); gr.addColorStop(0.5, '#25292d'); gr.addColorStop(1, '#16181b');
      b.fillStyle = gr; kp(); b.fill();
      b.save(); kp(); b.clip(); texture(b, TEX.grain, 0, 0, w, h, { op: 'overlay', a: 0.9, scale: 0.4 }); texture(b, TEX.fbm, 0, 0, w, h, { op: 'soft-light', a: 0.5 });
      const hl = b.createRadialGradient(w * 0.3, h * 0.1, 0, w * 0.3, h * 0.1, w * 0.7); hl.addColorStop(0, 'rgba(255,255,255,0.22)'); hl.addColorStop(1, 'rgba(255,255,255,0)'); b.fillStyle = hl; b.fillRect(0, 0, w, h);
      // shiny worn patch where thumbs press
      const wp = b.createRadialGradient(w * 0.5, h * 0.55, 0, w * 0.5, h * 0.55, w * 0.25); wp.addColorStop(0, 'rgba(255,255,255,0.08)'); wp.addColorStop(1, 'rgba(255,255,255,0)'); b.fillStyle = wp; b.fillRect(0, 0, w, h);
      b.restore();
      kp(); bevel(b, 2, 2, w - 4, h - 4, 0.45, 0.6, 1);
      return c;
    });
    g.drawImage(plate, x - 12, y - 12, w + 24, h + 24);
    const s = label.toUpperCase(); let px = 16, ls = 1.4; while (px > 14 && tw(g, s, px, 700, ls) > w - 22) { px -= 0.5; ls = 0.6; }
    // backlit legend, slightly worn (knocked out by grain)
    const [c, b] = mk(w, h); text(b, s, w / 2 + (led ? 5 : 0), h / 2 + 6, { px, ls, wt: 700, col: legend, align: 'center', shadow: false, glow: legend === '#f4f1e8' ? 'rgba(255,240,215,0.7)' : AMB_GLOW, blur: 6 * glow + 2 });
    b.globalCompositeOperation = 'destination-out'; b.globalAlpha = 0.28; b.fillStyle = pat(b, TEX.grain, 0.5); b.fillRect(0, 0, w, h);
    g.drawImage(c, x, y, w, h);
    if (led) { g.fillStyle = led; g.beginPath(); g.arc(x + 12, y + h / 2, 2.4, 0, TAU); g.fill(); bloom(g, x + 12, y + h / 2, 8, 'rgba(255,180,70,0.8)'); }
  }

  // ---------- layout ----------
  function adjust(L) {
    const S = L.small;
    const mfdB = S ? { x: 46, y: 4, w: 200, h: 290 } : { x: 66, y: 4, w: 322, h: 322 };
    const left = S ? { x: 58, y: 22, w: 176, h: 254 } : { x: 80, y: 22, w: 294, h: 286 };
    const hudB = S ? { x: 256, y: 4, w: 266, h: 282 } : { x: 398, y: 4, w: 350, h: 316 };
    const right = { x: hudB.x + 7, y: hudB.y + 10, w: hudB.w - 14, h: hudB.h - 18 };
    const hdr = S ? 22 : 26;
    return { ...L, left, right, mfdB, hudB, hdr, lpad: S ? 6 : 12, rowH: S ? 32 : 34, title: S ? 22 : 28, itemS: S ? 52 : 58,
      view: { x: right.x + 6, y: right.y + hdr + 6, w: right.w - 12, h: right.h - hdr - 10 } };
  }

  const T = {
    code: V.code, col, shadow: false, textGlow: null, ghost: 0.1,
    adjust,
    live(g, L, state, t, still) { world(g, L, t, still); },
    bg(w, h) { return cached(`ck-bg-${V.code}-${w}-${h}`, () => { const [c, g] = mk(w, h); world(g, adjust(layout(w, h)), 0, true); return c; }); },
    shell(g, r, side, L) {
      const W = L.w, H = L.h, S = L.small;
      if (side === 'left') {
        // canopy frame: top bow, corner pillars, the centre post between MFD and HUD
        const fr = (pathFn, x, y, w, h, seed) => painted(g, pathFn, x, y, w, h, seed, ['#2b2f34', '#0c0e10']);
        fr(() => { g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, 7); g.quadraticCurveTo(W / 2, 13, 0, 7); g.closePath(); }, 0, 0, W, 13, 3);
        const cpx = (L.mfdB.x + L.mfdB.w + L.hudB.x) / 2;
        fr(() => { g.beginPath(); g.moveTo(cpx - 4, 0); g.lineTo(cpx + 4, 0); g.lineTo(cpx + 5, H); g.lineTo(cpx - 5, H); g.closePath(); }, cpx - 5, 0, 10, H, 5);
        for (let yy = 16; yy < H; yy += 22) dzus(g, cpx, yy, 1.4);
        fr(() => { g.beginPath(); g.moveTo(0, 0); g.lineTo(S ? 30 : 46, 0); g.lineTo(S ? 6 : 10, H * 0.55); g.lineTo(0, H * 0.6); g.closePath(); }, 0, 0, 46, H * 0.6, 7);
        fr(() => { g.beginPath(); g.moveTo(W, 0); g.lineTo(W - (S ? 30 : 46), 0); g.lineTo(W - (S ? 8 : 12), H * 0.5); g.lineTo(W, H * 0.55); g.closePath(); }, W - 46, 0, 46, H * 0.55, 9);
        g.strokeStyle = V.rim; g.lineWidth = 1; g.beginPath(); g.moveTo(S ? 30 : 46, 0.5); g.lineTo(S ? 6 : 10, H * 0.55); g.moveTo(0, 7.5); g.quadraticCurveTo(W / 2, 13.5, W, 7.5); g.stroke();
        // instrument panel (left console + bottom band), glareshield lip
        const py = S ? 288 : 322;
        const panelPath = () => { g.beginPath(); g.moveTo(0, S ? 34 : 30); g.lineTo(L.mfdB.x + L.mfdB.w + 4, S ? 2 : 2); g.lineTo(L.mfdB.x + L.mfdB.w + 4, py); g.lineTo(W, py - 2); g.lineTo(W, H); g.lineTo(0, H); g.closePath(); };
        castShadow(g, panelPath, { blur: 14, a: 0.6, dx: 0, dy: -2 });
        painted(g, panelPath, 0, 0, W, H, 11);
        g.save(); panelPath(); g.clip();
        // gauges, lamps and switches in the margins (decor only: outside the safe area at 568 × 320)
        const gx = S ? 22 : 32, gr0 = S ? 15 : 22;
        for (const [k, gy] of [['adi', S ? 66 : 64], ['alt', S ? 112 : 126], ['trq', S ? 156 : 184]]) { gaugeHousing(g, gx, gy, gr0); stencil(g, k.toUpperCase(), gx, gy + gr0 + 11, 7, 0.6); }
        const ly0 = S ? 190 : 226;
        lamp(g, gx - 14, ly0, 28, 9, 'M CAUT', 'rgb(255,178,56)', false); lamp(g, gx - 14, ly0 + 13, 28, 9, 'XMSN', 'rgb(255,178,56)', false); lamp(g, gx - 14, ly0 + 26, 28, 9, 'GEN', 'rgb(120,220,140)', true);
        for (let i = 0; i < 2; i++) { toggleSw(g, gx - 7 + i * 14, ly0 + 54, i === 0); stencil(g, i ? 'LDG' : 'NAV', gx - 7 + i * 14, ly0 + 70, 7, 0.6); }
        // bottom band: a row of switches and lamps
        const by = py + (S ? 14 : 20);
        for (let i = 0; i < (S ? 9 : 13); i++) { const x = L.mfdB.x + 20 + i * (S ? 50 : 54); if (x > W - 70) break; if (i % 3 === 2) lamp(g, x - 12, by - 6, 24, 10, ['FUEL', 'HYD', 'ICE', 'DOOR'][(i / 3) | 0] || 'AUX', 'rgb(255,178,56)', i === 5); else { toggleSw(g, x, by, i % 2 === 0); } }
        for (let i = 0; i < 12; i++) dzus(g, 6 + i * (W / 12), H - 4, 1.5);
        stencil(g, 'EVAC-1 · MEDEVAC', L.mfdB.x + 4, py + 9, 7, 0.55, 'left');
        g.restore();
        // glareshield lip along the top of the panel
        g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(L.mfdB.x + L.mfdB.w + 4, py - 3, W, 3);
        // MFD bezel set into the panel
        const B = L.mfdB, bp = () => rrect(g, B.x, B.y, B.w, B.h, 9);
        castShadow(g, bp, { blur: 8, a: 0.85, dx: 2, dy: 3 });
        painted(g, bp, B.x, B.y, B.w, B.h, 21, ['#33383e', '#121417']);
        for (const [sx, sy] of [[B.x + 6, B.y + 6], [B.x + B.w - 6, B.y + 6], [B.x + 6, B.y + B.h - 6], [B.x + B.w - 6, B.y + B.h - 6]]) dzus(g, sx, sy, 2.2);
        const nb = S ? 5 : 6, bw = (r.w - 10) / nb, legT = ['TEAM', 'KILLS', 'EARN', 'TRN', 'SEED', 'PAGE'], legB = ['MAP', 'COM', 'NAV', 'SYS', 'DIM', 'BRT'];
        for (let i = 0; i < nb; i++) {
          const bx = r.x + 5 + i * bw + bw * 0.15, ww = bw * 0.7;
          for (const [yy, lg, ly] of [[B.y + 3, legT[i], r.y - 3], [B.y + B.h - 10, legB[i], r.y + r.h + 9]]) {
            castShadow(g, () => rrect(g, bx, yy, ww, 7, 2), { blur: 2, a: 0.8, dx: 0.5, dy: 1 });
            const kg = g.createLinearGradient(0, yy, 0, yy + 7); kg.addColorStop(0, '#5a6067'); kg.addColorStop(1, '#202327'); g.fillStyle = kg; rrect(g, bx, yy, ww, 7, 2); g.fill();
            stencil(g, lg, bx + ww / 2, ly, 6.5, 0.55);
          }
        }
        for (let i = 0; i < 3; i++) for (const sx of [B.x + 2, B.x + B.w - 7]) { const yy = r.y + 30 + i * (r.h - 60) / 2; const kg = g.createLinearGradient(sx, 0, sx + 5, 0); kg.addColorStop(0, '#5a6067'); kg.addColorStop(1, '#202327'); g.fillStyle = kg; rrect(g, sx, yy, 5, 16, 2); g.fill(); }
        // the screen: black glass, pixel grid, scanlines
        const sp = () => rrect(g, r.x, r.y, r.w, r.h, 3);
        g.fillStyle = '#000'; sp(); g.fill();
        const sg = g.createRadialGradient(r.x + r.w * 0.45, r.y + r.h * 0.4, 0, r.x + r.w / 2, r.y + r.h / 2, r.w); sg.addColorStop(0, V.mfdBg); sg.addColorStop(1, '#010203');
        g.fillStyle = sg; sp(); g.fill();
        g.save(); sp(); g.clip(); g.fillStyle = 'rgba(140,200,255,0.03)'; for (let yy = r.y; yy < r.y + r.h; yy += 2) g.fillRect(r.x, yy, r.w, 1); g.fillStyle = 'rgba(0,0,0,0.25)'; for (let xx = r.x; xx < r.x + r.w; xx += 2) g.fillRect(xx, r.y, 0.5, r.h); g.restore();
        innerShade(g, sp, { blur: 6, a: 0.95, lw: 5 });
        // pilot's helmet edge, out of focus in the top-left corner
        g.save(); g.filter = 'blur(3px)'; const hg = g.createRadialGradient(-20, -26, 20, -20, -26, S ? 64 : 82); hg.addColorStop(0, '#0a0b0d'); hg.addColorStop(0.85, '#16181b'); hg.addColorStop(1, 'rgba(22,24,27,0)'); g.fillStyle = hg; g.beginPath(); g.arc(-20, -26, S ? 64 : 82, 0, TAU); g.fill(); g.restore();
        g.strokeStyle = V.rim; g.lineWidth = 1.2; g.globalAlpha = 0.5; g.beginPath(); g.arc(-20, -26, S ? 58 : 76, 0.2, 1.3); g.stroke(); g.globalAlpha = 1;
      } else {
        // HUD combiner: a tilted glass plate in a frame (top edge farther away, so narrower)
        const B = L.hudB, k = 9;
        const glassP = () => { g.beginPath(); g.moveTo(B.x + k, B.y); g.lineTo(B.x + B.w - k, B.y); g.lineTo(B.x + B.w, B.y + B.h); g.lineTo(B.x, B.y + B.h); g.closePath(); };
        g.save(); glassP(); g.clip();
        let gr = g.createLinearGradient(0, B.y, 0, B.y + B.h); gr.addColorStop(0, V.hudTint[0]); gr.addColorStop(1, V.hudTint[1]);
        g.fillStyle = gr; g.fillRect(B.x, B.y, B.w, B.h);
        gr = g.createLinearGradient(B.x, B.y, B.x + B.w, B.y + B.h); gr.addColorStop(0, 'rgba(140,255,190,0.10)'); gr.addColorStop(0.35, 'rgba(140,255,190,0.02)'); gr.addColorStop(0.7, 'rgba(140,255,190,0.06)'); gr.addColorStop(1, 'rgba(140,255,190,0.0)');
        g.fillStyle = gr; g.fillRect(B.x, B.y, B.w, B.h); // the combiner's green coating
        const scr = g.createLinearGradient(B.x, 0, B.x + B.w, 0); scr.addColorStop(0, 'rgba(0,0,0,0.3)'); scr.addColorStop(0.45, 'rgba(0,0,0,0.26)'); scr.addColorStop(1, 'rgba(0,0,0,0.05)'); g.fillStyle = scr; g.fillRect(B.x, B.y + 20, B.w, B.h - 20); // a scrim so the projection reads
        gr = g.createLinearGradient(0, B.y + B.h * 0.6, 0, B.y + B.h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = gr; g.fillRect(B.x, B.y, B.w, B.h); // reflection of the dark panel
        g.strokeStyle = 'rgba(255,190,85,0.35)'; g.lineWidth = 1;
        for (let xx = B.x + 40; xx < B.x + B.w - 30; xx += 8) { const big = Math.round((xx - B.x) / 8) % 5 === 0; g.beginPath(); g.moveTo(xx, B.y + 3); g.lineTo(xx, B.y + (big ? 8 : 5)); g.stroke(); }
        g.restore();
        // glass edge: thick, catching the light along the top
        g.lineWidth = 2.2; gr = g.createLinearGradient(B.x, B.y, B.x + B.w, B.y + B.h); gr.addColorStop(0, 'rgba(255,240,215,0.85)'); gr.addColorStop(0.4, 'rgba(180,255,220,0.25)'); gr.addColorStop(1, 'rgba(255,255,255,0.15)');
        g.strokeStyle = gr; glassP(); g.stroke();
        // frame: side rails and base mount with arms down to the glareshield
        const rail = (x0, x1) => painted(g, () => { g.beginPath(); g.moveTo(x0, B.y + 6); g.lineTo(x0 + 4, B.y + 6); g.lineTo(x1 + 4, B.y + B.h); g.lineTo(x1, B.y + B.h); g.closePath(); }, Math.min(x0, x1), B.y, 6, B.h, 31, ['#3c4248', '#14171a']);
        rail(B.x + k - 3, B.x - 3); rail(B.x + B.w - k - 1, B.x + B.w - 1);
        painted(g, () => rrect(g, B.x - 4, B.y + B.h - 4, B.w + 8, 9, 3), B.x - 4, B.y + B.h - 4, B.w + 8, 9, 33, ['#454b52', '#16191c']);
        for (const mx of [B.x + 24, B.x + B.w - 34]) painted(g, () => rrect(g, mx, B.y + B.h + 4, 10, (S ? 288 : 322) - B.y - B.h - 2, 2), mx, B.y + B.h, 10, 10, 35, ['#3a4046', '#101215']);
        dzus(g, B.x + 6, B.y + B.h + 0.5, 1.8); dzus(g, B.x + B.w - 6, B.y + B.h + 0.5, 1.8);
        // the glove, lower right
        glove(g, S ? 520 : 742, S ? 214 : 252, S ? 0.88 : 1.05);
      }
    },
    header(g, x, y, w, h) {
      // reticle + legend
      g.strokeStyle = AMB; g.lineWidth = 1.2; neon(g, () => { g.beginPath(); g.arc(x + 12, y + h / 2 + 3, 7, 0, TAU); g.moveTo(x + 2, y + h / 2 + 3); g.lineTo(x + 22, y + h / 2 + 3); g.moveTo(x + 12, y + h / 2 - 7); g.lineTo(x + 12, y + h / 2 + 13); g.stroke(); }, AMB_GLOW, 5);
      text(g, 'RUN REWARDS', x + 28, y + h / 2 + 9, { px: 16, wt: 700, ls: 2.4, col: AMB, glow: AMB_GLOW, blur: 8, shadow: false });
      text(g, 'EVAC 1', x + w - 4, y + h / 2 + 9, { px: 14, wt: 600, ls: 1.5, col: 'rgba(255,190,85,0.8)', align: 'right', shadow: false });
      const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, 'rgba(255,190,85,0.75)'); gr.addColorStop(1, 'rgba(255,190,85,0.1)'); g.fillStyle = gr; g.fillRect(x, y + h + 3, w, 1);
    },
    title(g, x, y, w, t, wave, L) {
      const s = t.toUpperCase(), ww = tw(g, wave.toUpperCase(), 14, 600, 1.2) + 12;
      let px = L.title; while (px > 16 && tw(g, s, px, 700, 1.5) > w - ww - 6) px--;
      text(g, s, x, y - 4, { px, wt: 700, ls: 1.5, col: PH, glow: 'rgba(150,210,255,0.6)', blur: 10, shadow: false });
      g.strokeStyle = 'rgba(143,212,255,0.8)'; g.lineWidth = 1; chamfer(g, x + w - ww + 0.5, y - 21.5, ww - 1, 20, [4, 0, 4, 0]); g.stroke();
      text(g, wave.toUpperCase(), x + w - ww / 2, y - 6.5, { px: 14, wt: 600, ls: 1.2, col: CY, align: 'center', shadow: false });
    },
    colHead(g, x, y, w, cols) {
      const o = { px: 14, wt: 600, col: CY, ls: 1, shadow: false };
      text(g, 'PLAYER', cols.name, y + 12, o); text(g, 'KILLS', cols.kills, y + 12, { ...o, align: 'right' }); text(g, 'EARNED', cols.earned, y + 12, { ...o, align: 'right' });
      g.fillStyle = 'rgba(143,212,255,0.4)'; g.fillRect(x, y + 17, w, 1);
    },
    player(g, x, y, w, h, p, i, cols, L) {
      g.fillStyle = i % 2 ? 'rgba(143,212,255,0.035)' : 'rgba(143,212,255,0.07)'; g.fillRect(x - 2, y, w + 4, h);
      g.fillStyle = SLOT[i]; neon(g, () => { g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x + 7, y + 11); g.lineTo(x, y + 16); g.closePath(); g.fill(); }, SLOT[i], 6);
      const ny = y + (L.small ? 15 : 16), o = { glow: 'rgba(150,210,255,0.35)', blur: 5, shadow: false };
      text(g, p.name, cols.name, ny, { px: 17, wt: 600, col: PH, ...o });
      text(g, fmt(p.kills), cols.kills, ny, { px: 16, wt: 500, col: PH, align: 'right', ...o });
      text(g, '$' + fmt(p.earned), cols.earned, ny, { px: 16, wt: 600, col: PH, align: 'right', ...o });
      text(g, trLine(p.tr), cols.name, ny + 15, { px: 14, wt: 500, col: 'rgba(143,212,255,0.8)', shadow: false });
    },
    btn(g, x, y, w, h, label, kind, pulse) {
      if (kind === 'primary') { rubberKey(g, x, y, w, h, label, { led: '#ffbe55' }); return; }
      if (kind === 'steel') { rubberKey(g, x, y, w, h, label, {}); return; }
      // Wear it: an illuminated push-button (glass face, amber legend, metal housing)
      const plate = cached(`ck-pb-${V.code}-${w}-${h}`, () => {
        const pad = 10, [c, b] = mk(w + pad * 2, h + pad * 2); b.translate(pad, pad);
        const hp = () => rrect(b, 0, 0, w, h, 4);
        castShadow(b, hp, { blur: 4, a: 0.8, dx: 1.5, dy: 2.5 });
        const gr = b.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9aa2aa'); gr.addColorStop(0.5, '#4a5057'); gr.addColorStop(1, '#22262a');
        b.fillStyle = gr; hp(); b.fill(); b.save(); hp(); b.clip(); texture(b, TEX.brushed, 0, 0, w, h, { op: 'overlay', a: 0.5, scale: 0.4 }); b.restore();
        hp(); bevel(b, 0, 0, w, h, 0.7, 0.7, 1);
        b.fillStyle = '#050403'; rrect(b, 4, 4, w - 8, h - 8, 2); b.fill();
        return c;
      });
      g.drawImage(plate, x - 10, y - 10, w + 20, h + 20);
      const p = pulse || 0, fx = x + 5, fy = y + 5, fw = w - 10, fh = h - 10;
      const gr = g.createLinearGradient(0, fy, 0, fy + fh); gr.addColorStop(0, `rgba(255,${190 + 30 * p},${90 + 40 * p},${0.82 + 0.1 * p})`); gr.addColorStop(1, 'rgba(170,90,10,0.9)');
      g.fillStyle = gr; g.fillRect(fx, fy, fw, fh);
      bloom(g, x + w / 2, y + h / 2, w * 0.8, `rgba(255,170,60,${0.25 + 0.2 * p})`);
      g.fillStyle = 'rgba(0,0,0,0.25)'; for (let yy = fy; yy < fy + fh; yy += 2) g.fillRect(fx, yy, fw, 0.6); // diffuser
      const gl = g.createLinearGradient(fx, fy, fx + fw * 0.7, fy + fh); gl.addColorStop(0, 'rgba(255,255,255,0.45)'); gl.addColorStop(0.35, 'rgba(255,255,255,0.05)'); gl.addColorStop(0.4, 'rgba(255,255,255,0)'); g.fillStyle = gl; g.fillRect(fx, fy, fw, fh);
      let px = 15, ls = 1; while (px > 14 && tw(g, label.toUpperCase(), px, 700, ls) > fw - 6) { px -= 0.5; ls = 0.4; }
      text(g, label.toUpperCase(), x + w / 2, y + h / 2 + 5.5, { px, ls, wt: 700, col: '#2a1602', align: 'center', shadow: false });
    },
    well(g, x, y, s, a) {
      // dark backing so the relit item reads on the glass
      const gr = g.createRadialGradient(x + s * 0.45, y + s * 0.4, 0, x + s / 2, y + s / 2, s * 0.62); gr.addColorStop(0, V.well[0]); gr.addColorStop(0.7, V.well[1]); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(x - s * 0.15, y - s * 0.15, s * 1.3, s * 1.3);
    },
    item(g, slot, id, x, y, s, a) {
      const scan = a.lt >= 99 ? 1 : clamp((a.lt - 0.3) / 0.5);
      g.save(); g.globalAlpha *= 0.55 * a.p; g.drawImage(itemArt(slot, id, s, 'sil'), x, y, s, s); g.restore();
      if (scan > 0) {
        g.save(); g.beginPath(); g.rect(x - 4, y - 4, s + 8, (s + 8) * scan); g.clip(); g.drawImage(relit(slot, id, s), x, y, s, s); g.restore();
        if (scan < 1) { const sy = y - 4 + (s + 8) * scan; g.save(); g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,205,120,0.95)'; g.shadowColor = AMB_GLOW; g.shadowBlur = 10; g.fillRect(x - 6, sy - 0.8, s + 12, 1.6); g.restore(); }
      }
    },
    wellTop(g, x, y, s, a) {
      // HUD targeting reticle: rotating tick ring + brackets closing in, locking on the landing flash
      const cx = x + s / 2, cy = y + s / 2, R = s * 0.6, lock = a.lt >= 99 ? 1 : ease(a.lt / 0.6), rot = a.lt >= 99 ? 0.3 : a.lt * 1.8;
      g.save(); g.strokeStyle = a.isNew ? AMB : 'rgba(238,246,255,0.85)'; g.lineWidth = 1.1; g.globalAlpha *= 0.65 + 0.35 * Math.max(a.pulse, a.flash);
      neon(g, () => {
        g.beginPath(); for (let i = 0; i < 24; i++) { const an = rot + i * TAU / 24, l = i % 6 === 0 ? 5 : 2.5; g.moveTo(cx + Math.cos(an) * R, cy + Math.sin(an) * R); g.lineTo(cx + Math.cos(an) * (R - l), cy + Math.sin(an) * (R - l)); } g.stroke();
        g.lineWidth = 1.6; const gap = (1 - lock) * s * 0.5; brackets(g, x + 2, y + 2, s - 4, s - 4, 8, gap);
      }, a.isNew ? AMB_GLOW : 'rgba(170,215,255,0.7)', 4 + 10 * a.flash);
      g.restore();
      if (a.flash > 0.01) { bloom(g, cx, cy, s, `rgba(255,200,110,${0.45 * a.flash})`); text(g, 'LOCK', cx, y - 4, { px: 14, wt: 700, ls: 2, col: AMB, align: 'center', alpha: a.flash, shadow: false, glow: AMB_GLOW, blur: 6 }); }
    },
    tag(g, x, y, label, kind, a, L, slot) {
      const s = label.toUpperCase(), w0 = tw(g, s, 14, 700, 1.3) + (kind === 'slot' ? 24 : 12), h = 19;
      g.save(); if (a) g.globalAlpha *= a.tag;
      const c2 = kind === 'amber' ? AMB : kind === 'steel' ? CY : '#fff6e6';
      if (kind === 'amber') { g.fillStyle = 'rgba(255,170,50,0.18)'; chamfer(g, x, y, w0, h, [5, 0, 5, 0]); g.fill(); }
      g.strokeStyle = c2; g.lineWidth = 1.2; neon(g, () => { chamfer(g, x, y, w0, h, [5, 0, 5, 0]); g.stroke(); }, kind === 'amber' ? AMB_GLOW : 'rgba(255,255,255,0.3)', 4);
      let tx = x + 6;
      if (kind === 'slot') { g.fillStyle = SLOT[slot]; neon(g, () => { g.beginPath(); g.moveTo(x + 6, y + 5); g.lineTo(x + 13, y + 9.5); g.lineTo(x + 6, y + 14); g.closePath(); g.fill(); }, SLOT[slot], 5); tx = x + 18; }
      text(g, s, tx, y + 15, { px: 14, wt: 700, ls: 1.3, col: c2 });
      g.restore(); return w0;
    },
    number(g, x, y, v, px) {
      // a 7-segment LED counter (instrument typography), unlit segments faintly visible
      const s = ('+' + String(Math.round(v)).padStart(3, ' ')), dw = px * 0.48, dh = px * 0.84, gap = px * 0.16, top = y - dh;
      g.fillStyle = 'rgba(0,0,0,0.55)'; rrect(g, x - 4, top - 5, s.length * (dw + gap) + 6, dh + 10, 3); g.fill();
      g.strokeStyle = 'rgba(255,190,85,0.4)'; g.lineWidth = 1; g.stroke();
      for (let i = 0; i < s.length; i++) seg7(g, x + i * (dw + gap), top, dw, dh, s[i] === ' ' ? 'x' : s[i], '#ffc35a', 'rgba(255,170,60,0.07)');
      return s.length * (dw + gap) + 2;
    },
    rookie(g, xr, y, sp) {
      // a stamped, riveted warning placard
      const w = 140, h = 24, x = xr - w + 2, k = sp < 1 ? lerp(1.5, 1, backOut(sp)) : 1;
      const plate = cached(`ck-placard-${V.code}`, () => {
        const pad = 8, [c, b] = mk(w + pad * 2, h + pad * 2); b.translate(pad, pad);
        const p = () => rrect(b, 0, 0, w, h, 3);
        castShadow(b, p, { blur: 4, a: 0.75, dx: 1.5, dy: 2.5 });
        const gr = b.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffd27a'); gr.addColorStop(0.5, '#e8a333'); gr.addColorStop(1, '#a6640e');
        b.fillStyle = gr; p(); b.fill();
        b.save(); p(); b.clip(); texture(b, TEX.brushed, 0, 0, w, h, { op: 'overlay', a: 0.35, scale: 0.5 }); texture(b, TEX.scratch, 0, 0, w, h, { op: 'source-over', a: 0.3 });
        hazard(b, 0, 0, w, 3.5, '#1a1006', 3); hazard(b, 0, h - 3.5, w, 3.5, '#1a1006', 3); b.restore();
        p(); bevel(b, 0, 0, w, h, 0.8, 0.6, 1);
        for (const rx of [6, w - 6]) { const rg = b.createRadialGradient(rx - 0.6, h / 2 - 0.6, 0, rx, h / 2, 2.4); rg.addColorStop(0, '#fff'); rg.addColorStop(1, '#6b4a14'); b.fillStyle = rg; b.beginPath(); b.arc(rx, h / 2, 2.2, 0, TAU); b.fill(); }
        const o = { px: 14, wt: 700, ls: 1.2, col: '#241402', align: 'center' };
        text(b, 'ROOKIE BONUS ×2', w / 2, h / 2 + 5.5, { ...o, emboss: true }); text(b, 'ROOKIE BONUS ×2', w / 2, h / 2 + 5.5, { ...o, shadow: false });
        return c;
      });
      g.save(); g.translate(x + w / 2, y + h / 2); g.scale(k, k); g.rotate(sp < 1 ? (1 - sp) * -0.12 : -0.015); g.translate(-x - w / 2, -y - h / 2); g.globalAlpha *= clamp(sp * 3);
      g.drawImage(plate, x - 8, y - 8, w + 16, h + 16); g.restore();
      if (sp > 0 && sp < 1) bloom(g, x + w / 2, y + h / 2, w * 0.7, `rgba(255,200,110,${0.4 * (1 - sp)})`);
    },
    ledger(g, x, y, w, lab, val, a) {
      g.save(); g.globalAlpha *= a;
      text(g, lab, x, y, { px: 14, wt: 500, col: col.sub });
      const vs = '+' + val, vw = tw(g, vs, 14, 600), gx = x + tw(g, lab, 14, 500) + 8, gw = w - (gx - x) - vw - 8;
      g.strokeStyle = 'rgba(255,190,85,0.5)'; g.lineWidth = 1; g.beginPath();
      for (let xx = 0; xx < gw; xx += 4) { const big = (xx / 4) % 5 === 0; g.moveTo(gx + xx, y - 3); g.lineTo(gx + xx, y - 3 - (big ? 5 : 2.5)); } g.stroke();
      g.fillStyle = AMB; g.shadowColor = AMB_GLOW; g.shadowBlur = 5; g.fillRect(gx, y - 2, gw * a, 1.5); g.shadowBlur = 0;
      text(g, vs, x + w, y, { px: 14, wt: 600, col: AMB, align: 'right' });
      g.restore();
    },
    total(g, x, y, w, v) {
      g.fillStyle = 'rgba(255,190,85,0.5)'; g.fillRect(x, y - 16, w, 1);
      text(g, 'TOTAL', x, y, { px: 14, wt: 600, ls: 1.5, col: col.mute });
      const s = fmt(v) + ' Supplies', sw = tw(g, s, 16, 600);
      text(g, s, x + w, y + 1, { px: 16, wt: 600, col: col.name, align: 'right' });
      crate(g, x + w - sw - 19, y - 13, 16);
    },
    divider(g, x, y, w) {
      g.strokeStyle = 'rgba(255,190,85,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.42, y); g.moveTo(x + w * 0.58, y); g.lineTo(x + w, y); g.stroke();
      if (w > 30) { g.beginPath(); g.moveTo(x + w / 2 - 6, y); g.lineTo(x + w / 2, y - 4); g.lineTo(x + w / 2 + 6, y); g.stroke(); }
    },
    iconBox(g, x, y, w, h) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(x, y, w, h); g.strokeStyle = 'rgba(255,240,215,0.7)'; g.lineWidth = 1.1; brackets(g, x, y, w, h, 6, 0); },
    nudgeBox(g, x, y, w, h) { g.fillStyle = 'rgba(143,212,255,0.08)'; chamfer(g, x, y, w, h, [6, 0, 6, 0]); g.fill(); g.strokeStyle = 'rgba(143,212,255,0.55)'; g.lineWidth = 1; brackets(g, x, y, w, h, 8, 0); },
    status(g, x, y, w, r, clock, still) {
      if (r.kind === 'saving') {
        g.save(); g.translate(x + 12, y + 18); g.strokeStyle = AMB; g.lineWidth = 1.5; neon(g, () => { g.beginPath(); g.arc(0, 0, 9, 0, TAU); g.stroke(); }, AMB_GLOW, 5);
        const an = still ? 0.8 : clock * 3; g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(an) * 9, Math.sin(an) * 9); g.stroke(); g.restore();
        text(g, 'UPLINK · SAVING…', x + 30, y + 25, { px: 19, wt: 700, ls: 1.5, col: AMB, glow: AMB_GLOW, blur: 6, shadow: false });
        for (let i = 0; i < 12; i++) { const on = still ? i < 5 : i < (clock * 6) % 13; g.fillStyle = on ? 'rgba(255,190,85,0.85)' : 'rgba(255,190,85,0.15)'; g.fillRect(x + i * 14, y + 46, 10, 8); }
        return;
      }
      g.strokeStyle = '#fff2da'; g.lineWidth = 1.5;
      if (r.kind === 'practice') { g.beginPath(); g.arc(x + 12, y + 16, 9, 0, TAU); g.moveTo(x + 2, y + 16); g.lineTo(x + 22, y + 16); g.moveTo(x + 12, y + 6); g.lineTo(x + 12, y + 26); g.stroke(); }
      else cloudX(g, x, y + 4, 24, '#fff2da');
      const lines = wrap(g, r.title, w - 34, 19, 700);
      lines.forEach((ln, i) => text(g, ln, x + 32, y + 22 + i * 22, { px: 19, wt: 700, col: '#fff2da', shadow: false, glow: 'rgba(255,170,60,0.5)', blur: 6 }));
      const hy = y + 22 + lines.length * 22 + 2;
      wrap(g, r.hint, w - 34, 15, 500).forEach((ln, i) => text(g, ln, x + 32, hy + i * 18, { px: 15, wt: 500, col: col.sub, shadow: false }));
    },
    scrollCue(g, L, pos, frac) {
      const V2 = L.view, x = L.right.x + L.right.w - 4, h = V2.h - 10, th = Math.max(20, h * frac), ty = V2.y + 4 + (h - th) * pos;
      g.fillStyle = 'rgba(255,190,85,0.2)'; g.fillRect(x, V2.y + 4, 1, h);
      g.fillStyle = AMB; g.fillRect(x - 0.5, ty, 2, th); g.beginPath(); g.moveTo(x - 5, ty + th / 2); g.lineTo(x - 1, ty + th / 2 - 4); g.lineTo(x - 1, ty + th / 2 + 4); g.fill();
    },
    overlay(g, L, t, still) {
      const S = L.small, gx = S ? 22 : 32, gr0 = S ? 15 : 22;
      // live instruments
      gaugeFace(g, gx, S ? 66 : 64, gr0, 'adi', t, still); gaugeFace(g, gx, S ? 112 : 126, gr0, 'alt', t, still); gaugeFace(g, gx, S ? 156 : 184, gr0, 'trq', t, still);
      if (!still && Math.sin(t * 3.1) > 0.2) { const ly0 = S ? 190 : 226; lamp(g, gx - 14, ly0, 28, 9, 'M CAUT', 'rgb(255,178,56)', true); }
      // MFD glare + HUD sheen
      const r = L.left;
      g.save(); rrect(g, r.x, r.y, r.w, r.h, 3); g.clip();
      const gl = g.createLinearGradient(r.x, r.y, r.x + r.w * 0.8, r.y + r.h); gl.addColorStop(0, `rgba(255,225,190,${V.glare})`); gl.addColorStop(0.3, 'rgba(255,225,190,0.02)'); gl.addColorStop(0.32, 'rgba(255,225,190,0)'); g.fillStyle = gl; g.fillRect(r.x, r.y, r.w, r.h);
      g.restore();
      const B = L.hudB;
      if (!still) { g.save(); g.beginPath(); g.rect(B.x, B.y, B.w, B.h); g.clip(); sweep(g, B.x, B.y, B.w, B.h, (t * 0.09) % 1.5 - 0.25, { a: 0.05, width: 0.25, col: '200,255,225', angle: 0.7 }); g.restore(); }
      // rotor-blade shadow sweeping across the cockpit (slow, soft)
      const ra = still ? 2.3 : t * 2.2, cx = L.w * 0.55, cy = -L.h * 0.9;
      g.save(); g.translate(cx, cy);
      for (let k = 0; k < 4; k++) { const an = ra + k * Math.PI / 2; if (Math.sin(an) < 0.15) continue; g.save(); g.rotate(an); const gr = g.createLinearGradient(0, -18, 0, 18); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(0.5, `rgba(0,0,0,${still ? 0.07 : 0.11})`); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, -18, L.w * 2.2, 36); g.restore(); }
      g.restore();
      // sun flare on the canopy (PC1) / lightning-free blue hour glow (PC3)
      if (V.flare) { const fx = L.w * V.sun[0], fy = L.h * V.horizon - 4; g.save(); g.globalCompositeOperation = 'lighter'; for (const [k2, rr, al] of [[0.4, 10, 0.18], [0.75, 6, 0.14], [1.15, 16, 0.08]]) { const px = fx + (L.w * 0.5 - fx) * k2 * 2, py = fy + (L.h * 0.5 - fy) * k2 * 2; const gg = g.createRadialGradient(px, py, 0, px, py, rr); gg.addColorStop(0, `rgba(255,220,160,${al})`); gg.addColorStop(1, 'rgba(255,220,160,0)'); g.fillStyle = gg; g.fillRect(px - rr, py - rr, rr * 2, rr * 2); } g.restore(); }
    },
  };
  return T;
}

const PC1 = makeCockpit({
  code: 'PC1', look: 'dw1', cityDim: 0.04, horizon: 0.13, bank0: -0.035, tint: [1.06, 0.98, 0.88],
  sky: ['#2b3150', '#c0745a', '#ffcf94'], haze: 'rgba(255,190,140,0.7)', cloud: 'rgba(255,214,170,0.35)', sun: [0.18, 0.95, 'rgba(255,190,110,0.7)'], flare: true, dust: true,
  panel: ['#3a3f45', '#15181b'], rim: 'rgba(255,190,120,0.7)', mfdBg: '#0b1418', glare: 0.12,
  hudTint: ['rgba(10,14,13,0.4)', 'rgba(5,8,8,0.66)'], well: ['rgba(120,100,80,0.55)', 'rgba(20,18,16,0.5)'],
});
const PC2 = makeCockpit({
  code: 'PC2', look: 'dw2', cityDim: 0.12, horizon: 0.13, bank0: 0.03, tint: [0.96, 1.0, 1.06],
  sky: ['#2c3443', '#6b7486', '#c9a58a'], haze: 'rgba(170,180,195,0.8)', cloud: 'rgba(200,208,220,0.45)', sun: [0.25, 0.45, 'rgba(255,190,140,0.5)'], rain: true, fog: 0.4,
  panel: ['#363b41', '#121417'], rim: 'rgba(210,220,235,0.55)', mfdBg: '#0a1218', glare: 0.08,
  hudTint: ['rgba(8,12,14,0.4)', 'rgba(5,8,10,0.64)'], well: ['rgba(110,115,125,0.5)', 'rgba(18,20,24,0.5)'],
});
const PC3 = makeCockpit({
  code: 'PC3', look: 'dw2', cityDim: 0.36, horizon: 0.15, bank0: -0.02, tint: [0.9, 0.96, 1.1], night: true, stars: true,
  sky: ['#060a18', '#1b2a4c', '#8a5a4a'], haze: 'rgba(110,90,110,0.6)', cloud: 'rgba(120,120,150,0.3)', sun: [0.82, 0.35, 'rgba(255,150,90,0.6)'],
  panel: ['#2e3237', '#0e1012'], rim: 'rgba(150,180,230,0.6)', mfdBg: '#08121a', glare: 0.05,
  hudTint: ['rgba(4,8,10,0.3)', 'rgba(3,6,8,0.58)'], well: ['rgba(90,95,120,0.5)', 'rgba(10,12,18,0.5)'],
});
