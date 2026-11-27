/*
 * Story 10.5, decision 10.5-Q1: home-screen icon proposals for "Hordes", drawn in code (Canvas 2D, no Phaser).
 * Follows `.claude/skills/dead-city-model/SKILL.md`: one driving idea per option, every element derived from it,
 * one key light, no flat fills, colour meanings kept (amber = something you can use / the light; red = danger).
 *
 * Every icon is drawn full-bleed in a 512-unit square (opaque: iOS forbids transparency; Android masks it).
 * The subject stays inside the central 80 % circle (radius 0.4 × size = 204.8 units) so the maskable crop keeps it.
 *
 * IC1  "The one light you stand in." A survivor seen from above stands in a streetlight pool on wet asphalt,
 *      rifle aimed at the top right. The lamp is up-left (the game's LIGHT_DIR), so: the pool is centred up-left
 *      of the survivor, the amber rim is on the survivor's up-left edges, the shadow falls down-right, the puddle
 *      glints are the lamp's reflection. Everything outside the pool goes to the night.
 * IC2  "You are the last light; they close in." The pool is the only light source, so the horde's rims face the
 *      centre and their shadows fall outwards; the survivor is reduced to one amber dot (the event colour).
 * IC3  "The game's own badge." Lumen LF5: a bevelled gunmetal plate, matte charcoal glass face, one amber accent:
 *      an H inside a crosshair ring. No scene; reads at any size.
 * IC4  "It sees you first." The Behemoth's head and hunched shoulders from above, lit only by a faint cold sky;
 *      its enraged eyes (BH_EYE_ENRAGED_RGB) are the only light, red = boss danger.
 */
(function () {
  "use strict";
  const U = 512;
  const LIGHT = { x: 0.55, y: 0.83 }; // palette.ts › LIGHT_DIR (shadow direction)
  const LAMP = "255,165,85"; // palette.ts › LAMP
  const LAMP_GLOW = "255,190,110";
  const CHAR = { jacket: "#3c5670", pack: "#26251f", cap: "#1f2326", skin: "#c49a7c", gun: "#17181a", hair: "#231f1c" };
  const LUMEN = { face: "#1e2125", frame: "#3b4048", frameHi: "#6b727c", accent: "#f59a2c", accentHi: "#ffc46b" };
  const EYE = "255,74,46"; // behemothArt.ts › BH_EYE_ENRAGED_RGB

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function canvas(w, h) {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h || w;
    return c;
  }

  // ---- shared surfaces -------------------------------------------------------------------------------------------

  /** Wet asphalt: base tone, soft aggregate mottle (no hard specks), a few soft wet patches. */
  function asphalt(g, seed, base) {
    g.fillStyle = base || "#1c1d20";
    g.fillRect(0, 0, U, U);
    const r = rng(seed);
    for (let i = 0; i < 5000; i++) {
      const x = r() * U, y = r() * U, s = 0.6 + r() * 1.6;
      const v = r() < 0.5 ? "255,255,255" : "0,0,0";
      g.fillStyle = `rgba(${v},${0.02 + r() * 0.035})`;
      g.beginPath();
      g.arc(x, y, s, 0, Math.PI * 2);
      g.fill();
    }
    for (let i = 0; i < 7; i++) {
      const x = r() * U, y = r() * U, s = 40 + r() * 90;
      const gr = g.createRadialGradient(x, y, 0, x, y, s);
      gr.addColorStop(0, "rgba(0,0,0,0.18)");
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, U, U);
    }
  }

  /** A warm pool of light (screen-like, additive) centred at (x, y). */
  function pool(g, x, y, rad, a) {
    g.save();
    g.globalCompositeOperation = "lighter";
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, `rgba(${LAMP},${a})`);
    gr.addColorStop(0.35, `rgba(${LAMP},${a * 0.62})`);
    gr.addColorStop(0.7, `rgba(${LAMP},${a * 0.18})`);
    gr.addColorStop(1, `rgba(${LAMP},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, U, U);
    g.restore();
  }

  function vignette(g, cx, cy, r0, r1, a) {
    const gr = g.createRadialGradient(cx, cy, r0, cx, cy, r1);
    gr.addColorStop(0, "rgba(0,0,0,0)");
    gr.addColorStop(1, `rgba(0,0,0,${a})`);
    g.fillStyle = gr;
    g.fillRect(0, 0, U, U);
  }

  /** A soft lamp reflection streak on a wet patch (elongated toward the viewer, i.e. away from the lamp). */
  function glint(g, x, y, len, wid, ang, a) {
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    g.globalCompositeOperation = "lighter";
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, len);
    gr.addColorStop(0, `rgba(${LAMP_GLOW},${a})`);
    gr.addColorStop(1, `rgba(${LAMP_GLOW},0)`);
    g.scale(1, wid / len);
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, len, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  /** Cloth weave: fine low-contrast cross-hatching clipped to what is already drawn (source-atop). */
  function weave(g, w, h, a) {
    g.save();
    g.globalCompositeOperation = "source-atop";
    g.strokeStyle = `rgba(0,0,0,${a})`;
    g.lineWidth = 1;
    for (let i = -h; i < w; i += 4) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i + h, h);
      g.stroke();
    }
    g.strokeStyle = `rgba(255,255,255,${a * 0.6})`;
    for (let i = 0; i < w + h; i += 5) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i - h, h);
      g.stroke();
    }
    g.restore();
  }

  /**
   * Relight a drawn figure (on its own canvas, transparent around it) for a light coming FROM (lx, ly) in canvas
   * px: a broad lit-to-dark gradient, an amber rim on the edges that face the light, a soft grey see-through
   * outline (the game's character outline). Returns a new canvas.
   */
  function relight(src, lx, ly, opts) {
    const w = src.width, h = src.height;
    const out = canvas(w, h);
    const g = out.getContext("2d");
    // outline: the silhouette dilated, grey, see-through
    const sil = canvas(w, h);
    const s = sil.getContext("2d");
    s.drawImage(src, 0, 0);
    s.globalCompositeOperation = "source-in";
    s.fillStyle = "#000";
    s.fillRect(0, 0, w, h);
    const ow = opts.outline || 2.5;
    g.globalAlpha = 0.55;
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      g.drawImage(sil, Math.cos(a) * ow, Math.sin(a) * ow);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = "source-in";
    g.fillStyle = "rgba(120,124,130,1)";
    g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = "destination-out";
    g.drawImage(sil, 0, 0);
    g.globalCompositeOperation = "source-over";
    // body
    const body = canvas(w, h);
    const b = body.getContext("2d");
    b.drawImage(src, 0, 0);
    b.globalCompositeOperation = "source-atop";
    const cx = w / 2, cy = h / 2;
    const dx = cx - lx, dy = cy - ly, dl = Math.hypot(dx, dy) || 1;
    const ux = dx / dl, uy = dy / dl;
    const R = opts.size || w * 0.3;
    const lg = b.createLinearGradient(cx - ux * R, cy - uy * R, cx + ux * R, cy + uy * R);
    lg.addColorStop(0, `rgba(255,220,180,${opts.lit || 0.18})`);
    lg.addColorStop(0.5, "rgba(0,0,0,0)");
    lg.addColorStop(1, `rgba(0,0,0,${opts.dark || 0.45})`);
    b.fillStyle = lg;
    b.fillRect(0, 0, w, h);
    // rim: silhouette minus itself shifted away from the light
    const rim = canvas(w, h);
    const r = rim.getContext("2d");
    r.drawImage(sil, 0, 0);
    r.globalCompositeOperation = "destination-out";
    const rw = opts.rimW || 5;
    r.drawImage(sil, -ux * -rw, -uy * -rw);
    r.globalCompositeOperation = "source-in";
    r.fillStyle = `rgba(${opts.rimRGB || LAMP_GLOW},1)`;
    r.fillRect(0, 0, w, h);
    b.globalCompositeOperation = "source-atop";
    b.globalAlpha = opts.rim == null ? 0.85 : opts.rim;
    b.filter = "blur(1.2px)";
    b.drawImage(rim, 0, 0);
    b.filter = "none";
    b.globalAlpha = 1;
    if (opts.shade) {
      b.globalCompositeOperation = "source-atop";
      b.fillStyle = `rgba(0,0,0,${opts.shade})`;
      b.fillRect(0, 0, w, h);
    }
    g.globalCompositeOperation = "source-over";
    g.drawImage(body, 0, 0);
    return out;
  }

  function shadowOf(src, blur, a) {
    const w = src.width, h = src.height;
    const c = canvas(w, h);
    const g = c.getContext("2d");
    g.filter = `blur(${blur}px)`;
    g.drawImage(src, 0, 0);
    g.filter = "none";
    g.globalCompositeOperation = "source-in";
    g.fillStyle = `rgba(0,0,0,${a})`;
    g.fillRect(0, 0, w, h);
    return c;
  }

  // ---- IC1 survivor ----------------------------------------------------------------------------------------------

  function limb(g, x0, y0, x1, y1, w, col) {
    g.strokeStyle = col;
    g.lineWidth = w;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x0, y0);
    g.lineTo(x1, y1);
    g.stroke();
  }
  function ell(g, x, y, rx, ry, col) {
    g.fillStyle = col;
    g.beginPath();
    g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    g.fill();
  }
  function rrect(g, x, y, w, h, r) {
    g.beginPath();
    g.roundRect(x, y, w, h, r);
  }

  /**
   * The survivor seen from above, facing +x, body radius r, on a W×W canvas centred at (W/2, W/2), then rotated.
   * Same parts as the game's default survivor (blue jacket, dark cap, pack, rifle); proportions as in play.
   * Each part follows from the pose: the rifle's stock sits in the right shoulder, so the right arm folds short
   * to the trigger and the left arm reaches long to the fore-grip; the pack straps run over the shoulders into the
   * jacket's front; the collar rings the neck under the cap.
   */
  function survivorFigure(W, r, ang) {
    const c = canvas(W);
    const g = c.getContext("2d");
    const J = CHAR.jacket, Jd = "#30465c", Jl = "#4a6784";
    g.translate(W / 2, W / 2);
    g.rotate(ang);
    // pack behind the shoulders: body, top flap, side pocket
    g.fillStyle = CHAR.pack;
    rrect(g, -1.02 * r, -0.52 * r, 0.66 * r, 1.04 * r, 0.18 * r);
    g.fill();
    g.fillStyle = "#302f27";
    rrect(g, -0.62 * r, -0.46 * r, 0.22 * r, 0.92 * r, 0.08 * r); // flap over the top
    g.fill();
    g.fillStyle = "#1d1c17";
    rrect(g, -0.98 * r, 0.2 * r, 0.3 * r, 0.26 * r, 0.06 * r); // side pocket
    g.fill();
    // far (left) arm: shoulder → elbow → fore-grip; near (right) arm: shoulder → elbow folded → trigger hand
    const arm = (pts, w) => {
      g.strokeStyle = Jd;
      g.lineWidth = w + 0.06 * r;
      g.lineCap = "round";
      g.lineJoin = "round";
      g.beginPath();
      g.moveTo(pts[0][0] * r, pts[0][1] * r);
      for (const p of pts.slice(1)) g.lineTo(p[0] * r, p[1] * r);
      g.stroke();
      g.strokeStyle = J;
      g.lineWidth = w;
      g.stroke();
    };
    arm([[0.0, -0.66], [0.62, -0.5], [1.08, -0.06]], 0.3 * r);
    arm([[0.0, 0.66], [0.38, 0.62], [0.58, 0.22]], 0.3 * r);
    // torso / shoulders, with soft seams where the sleeves join
    ell(g, 0, 0, 0.52 * r, 0.88 * r, J);
    g.save();
    g.beginPath();
    g.ellipse(0, 0, 0.52 * r, 0.88 * r, 0, 0, Math.PI * 2);
    g.clip();
    g.strokeStyle = "rgba(0,0,0,0.22)";
    g.lineWidth = 0.035 * r;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.ellipse(0.02 * r, s * 0.6 * r, 0.42 * r, 0.3 * r, 0, Math.PI * 0.6, Math.PI * 1.4);
      g.stroke();
    }
    // pack straps over the shoulders into the front
    g.strokeStyle = "#1a1a16";
    g.lineWidth = 0.1 * r;
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(-0.6 * r, s * 0.36 * r);
      g.quadraticCurveTo(0.05 * r, s * 0.5 * r, 0.5 * r, s * 0.32 * r);
      g.stroke();
    }
    g.restore();
    // rifle: stock in the right shoulder, receiver, magazine, optic, long barrel with a muzzle
    g.fillStyle = CHAR.gun;
    rrect(g, 0.2 * r, 0.08 * r, 0.6 * r, 0.2 * r, 0.06 * r); // stock + receiver
    g.fill();
    rrect(g, 0.75 * r, 0.12 * r, 0.8 * r, 0.13 * r, 0.04 * r); // handguard
    g.fill();
    rrect(g, 1.5 * r, 0.155 * r, 0.62 * r, 0.06 * r, 0.02 * r); // barrel
    g.fill();
    rrect(g, 2.08 * r, 0.135 * r, 0.12 * r, 0.1 * r, 0.02 * r); // muzzle
    g.fill();
    rrect(g, 0.68 * r, 0.24 * r, 0.16 * r, 0.2 * r, 0.03 * r); // magazine
    g.fill();
    g.fillStyle = "#222428";
    rrect(g, 0.46 * r, 0.06 * r, 0.34 * r, 0.1 * r, 0.04 * r); // optic
    g.fill();
    // hands: trigger hand on the grip, support hand on the handguard
    ell(g, 0.62 * r, 0.22 * r, 0.13 * r, 0.12 * r, CHAR.skin);
    ell(g, 1.12 * r, 0.12 * r, 0.14 * r, 0.12 * r, CHAR.skin);
    // collar round the neck, then the head: hair edge, cap dome with its seams, brim forward
    ell(g, 0.02 * r, 0, 0.42 * r, 0.42 * r, Jl);
    ell(g, 0.06 * r, 0, 0.35 * r, 0.33 * r, CHAR.hair);
    ell(g, 0.04 * r, 0, 0.31 * r, 0.3 * r, CHAR.cap);
    g.fillStyle = "#15181a";
    g.beginPath();
    g.ellipse(0.3 * r, 0, 0.2 * r, 0.27 * r, 0, -Math.PI / 2, Math.PI / 2);
    g.fill();
    g.setTransform(1, 0, 0, 1, 0, 0);
    weave(g, W, W, 0.06);
    // gloss on the dark metal: one line along the barrel's lit side
    g.save();
    g.translate(W / 2, W / 2);
    g.rotate(ang);
    g.strokeStyle = "rgba(200,210,225,0.28)";
    g.lineWidth = 0.03 * r;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(0.8 * r, 0.14 * r);
    g.lineTo(2.15 * r, 0.16 * r);
    g.stroke();
    g.restore();
    return c;
  }

  function drawIC1(g) {
    asphalt(g, 11, "#1a1b1e");
    // a worn lane marking: the vignette leaves it only where the pool reaches (it is how you read "street")
    g.save();
    g.translate(U * 0.5, U * 0.5);
    g.rotate(-0.12);
    g.fillStyle = "rgba(170,145,70,0.3)";
    for (const x of [-0.7, -0.3, 0.1]) g.fillRect(U * x, U * 0.27, U * 0.27, U * 0.026);
    g.restore();
    // the lamp is up-left of the survivor; its pool, and its reflections in two wet patches
    const lampX = U * 0.4, lampY = U * 0.38;
    pool(g, lampX, lampY, U * 0.66, 0.5);
    // wet sheen: soft cool patches catch the sky where the lamp does not reach
    for (const [x, y, rr] of [[0.2, 0.74, 80], [0.8, 0.2, 60]]) {
      const wg = g.createRadialGradient(U * x, U * y, 0, U * x, U * y, rr);
      wg.addColorStop(0, "rgba(120,132,150,0.10)");
      wg.addColorStop(1, "rgba(120,132,150,0)");
      g.fillStyle = wg;
      g.fillRect(0, 0, U, U);
    }
    // survivor: large (it must read at 60 px), body a little down-left so the rifle reaches the top right
    const W = 512, r = 92, ang = -Math.PI / 4;
    const fig = survivorFigure(W, r, ang);
    const sx = -34, sy = 34;
    g.drawImage(shadowOf(fig, 8, 0.66), sx + LIGHT.x * 30, sy + LIGHT.y * 30);
    const lit = relight(fig, lampX - sx - 140, lampY - sy - 140, { size: 150, rimW: 7, rim: 0.95, lit: 0.22, dark: 0.5, outline: 1.6 });
    g.drawImage(lit, sx, sy);
    // the night closes in beyond the pool
    vignette(g, lampX, lampY, U * 0.3, U * 0.8, 0.8);
  }

  // ---- IC2 horde around one amber dot ----------------------------------------------------------------------------

  function zombieFigure(W, r, ang, seed) {
    const c = canvas(W);
    const g = c.getContext("2d");
    const q = rng(seed);
    g.translate(W / 2, W / 2);
    g.rotate(ang);
    const skin = ["#6f7a68", "#7a7f68", "#66705e"][Math.floor(q() * 3)];
    const shirt = ["#2c3328", "#3a2e2a", "#2f3138", "#3a3329"][Math.floor(q() * 4)];
    const reachL = 0.95 + q() * 0.45, reachR = 0.95 + q() * 0.45;
    const sp = 0.3 + q() * 0.15;
    limb(g, 0.05 * r, -0.6 * r, reachL * r, -sp * r, 0.27 * r, shirt);
    limb(g, 0.05 * r, 0.6 * r, reachR * r, sp * r, 0.27 * r, shirt);
    ell(g, reachL * r + 0.06 * r, -sp * r, 0.14 * r, 0.12 * r, skin);
    ell(g, reachR * r + 0.06 * r, sp * r, 0.14 * r, 0.12 * r, skin);
    ell(g, 0, 0, 0.47 * r, 0.84 * r, shirt);
    // head pushed forward, lolling
    ell(g, 0.16 * r + q() * 0.08 * r, (q() - 0.5) * 0.16 * r, 0.32 * r, 0.3 * r, skin);
    g.setTransform(1, 0, 0, 1, 0, 0);
    weave(g, W, W, 0.06);
    return c;
  }

  function drawIC2(g) {
    asphalt(g, 23, "#131416");
    const cx = U / 2, cy = U / 2;
    pool(g, cx, cy, U * 0.44, 0.6);
    // the back of the horde: dim figures further out, barely touched by the light (the crowd goes on)
    const qb = rng(51);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + qb() * 0.5;
      const d = U * (0.42 + qb() * 0.08);
      const fx = cx + Math.cos(a) * d, fy = cy + Math.sin(a) * d;
      const fig = zombieFigure(260, 46 + qb() * 6, a + Math.PI, 300 + i);
      g.drawImage(relight(fig, cx - fx + 130, cy - fy + 130, { size: 60, rimW: 4, rim: 0.45, lit: 0, dark: 0.6, outline: 1, shade: 0.62 }), fx - 130, fy - 130);
    }
    // horde ring: 7 figures, irregular radius and spacing (a crowd closing in, not a clock face), facing the light
    const N = 7, q = rng(9);
    const W = 260;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + (q() - 0.5) * 0.3 - Math.PI / 2;
      const d = U * (0.255 + q() * 0.05);
      const fx = cx + Math.cos(a) * d, fy = cy + Math.sin(a) * d;
      const ang = a + Math.PI, fr = 50 + q() * 6;
      const fig = zombieFigure(W, fr, ang, 100 + i);
      const ox = fx - W / 2, oy = fy - W / 2;
      // shadows fall outwards, away from the centre light
      g.drawImage(shadowOf(fig, 6, 0.75), ox + Math.cos(a) * 18, oy + Math.sin(a) * 18);
      // rims face the centre; their backs (away from the light) fall into the night
      const lit = relight(fig, cx - ox, cy - oy, { size: 60, rimW: 6, rim: 1, lit: 0.1, dark: 0.85, outline: 1.1, shade: 0.12 });
      g.drawImage(lit, ox, oy);
    }
    // the survivor: one amber dot with its own small glow (the event colour: the light you protect)
    g.save();
    g.globalCompositeOperation = "lighter";
    const gl = g.createRadialGradient(cx, cy, 0, cx, cy, 90);
    gl.addColorStop(0, "rgba(255,196,107,0.9)");
    gl.addColorStop(0.3, "rgba(245,154,44,0.4)");
    gl.addColorStop(1, "rgba(245,154,44,0)");
    g.fillStyle = gl;
    g.fillRect(0, 0, U, U);
    g.restore();
    const dot = g.createRadialGradient(cx - 8, cy - 10, 2, cx, cy, 34);
    dot.addColorStop(0, "#fff1cf");
    dot.addColorStop(0.45, LUMEN.accentHi);
    dot.addColorStop(1, LUMEN.accent);
    g.fillStyle = dot;
    g.beginPath();
    g.arc(cx, cy, 32, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(20,14,8,0.6)";
    g.lineWidth = 3;
    g.stroke();
    vignette(g, cx, cy, U * 0.34, U * 0.74, 0.88);
  }

  // ---- IC3 Lumen emblem ------------------------------------------------------------------------------------------

  function brushed(g, x, y, w, h, seed, a) {
    const q = rng(seed);
    g.save();
    g.beginPath();
    g.rect(x, y, w, h);
    g.clip();
    for (let i = 0; i < 220; i++) {
      const yy = y + q() * h;
      g.strokeStyle = `rgba(${q() < 0.5 ? "255,255,255" : "0,0,0"},${0.015 + q() * 0.03})`;
      g.lineWidth = 1 + q() * 2;
      g.beginPath();
      g.moveTo(x, yy);
      g.lineTo(x + w, yy + (q() - 0.5) * 6);
      g.stroke();
    }
    g.restore();
  }

  function drawIC3(g) {
    // outer field: dark gunmetal, brushed, lit from the up-left
    const bg = g.createLinearGradient(0, 0, U, U);
    bg.addColorStop(0, "#2c3036");
    bg.addColorStop(1, "#15171a");
    g.fillStyle = bg;
    g.fillRect(0, 0, U, U);
    brushed(g, 0, 0, U, U, 31, 1);
    // plate: bevelled gunmetal frame (inside the 80 % circle: half-size 152, corner 46 → corner reach ≈ 199)
    const h = 152, cr = 46, c0 = U / 2;
    g.save();
    g.shadowColor = "rgba(0,0,0,0.6)";
    g.shadowBlur = 26;
    g.shadowOffsetX = LIGHT.x * 14;
    g.shadowOffsetY = LIGHT.y * 14;
    const fr = g.createLinearGradient(c0 - h, c0 - h, c0 + h, c0 + h);
    fr.addColorStop(0, LUMEN.frameHi);
    fr.addColorStop(0.45, LUMEN.frame);
    fr.addColorStop(1, "#22252a");
    g.fillStyle = fr;
    rrect(g, c0 - h, c0 - h, 2 * h, 2 * h, cr);
    g.fill();
    g.restore();
    // bevel highlight (up-left) and shade (down-right)
    g.lineWidth = 3;
    g.strokeStyle = "rgba(255,255,255,0.22)";
    rrect(g, c0 - h + 2, c0 - h + 2, 2 * h - 4, 2 * h - 4, cr - 2);
    g.stroke();
    // face: matte charcoal glass, inset
    const fi = h - 20;
    const face = g.createLinearGradient(c0 - fi, c0 - fi, c0 + fi, c0 + fi);
    face.addColorStop(0, "#272b30");
    face.addColorStop(1, "#16181b");
    g.fillStyle = face;
    rrect(g, c0 - fi, c0 - fi, 2 * fi, 2 * fi, cr - 16);
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = "rgba(0,0,0,0.55)";
    g.stroke();
    // glass sheen (one soft diagonal, up-left light)
    g.save();
    rrect(g, c0 - fi, c0 - fi, 2 * fi, 2 * fi, cr - 16);
    g.clip();
    const sh = g.createLinearGradient(c0 - fi, c0 - fi, c0, c0);
    sh.addColorStop(0, "rgba(255,255,255,0.07)");
    sh.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = sh;
    g.fillRect(c0 - fi, c0 - fi, 2 * fi, 2 * fi);
    // amber glow behind the glyph
    g.globalCompositeOperation = "lighter";
    const gl = g.createRadialGradient(c0, c0, 0, c0, c0, fi);
    gl.addColorStop(0, "rgba(245,154,44,0.16)");
    gl.addColorStop(1, "rgba(245,154,44,0)");
    g.fillStyle = gl;
    g.fillRect(c0 - fi, c0 - fi, 2 * fi, 2 * fi);
    g.restore();
    // glyph: crosshair ring with 4 ticks, a bold H in the middle
    const amber = g.createLinearGradient(c0 - 90, c0 - 90, c0 + 90, c0 + 90);
    amber.addColorStop(0, LUMEN.accentHi);
    amber.addColorStop(1, LUMEN.accent);
    g.save();
    g.shadowColor = "rgba(245,154,44,0.55)";
    g.shadowBlur = 14;
    g.strokeStyle = amber;
    g.fillStyle = amber;
    g.lineWidth = 9;
    g.beginPath();
    g.arc(c0, c0, 96, 0, Math.PI * 2);
    g.stroke();
    for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) {
      g.beginPath();
      g.moveTo(c0 + dx * 80, c0 + dy * 80);
      g.lineTo(c0 + dx * 118, c0 + dy * 118);
      g.lineWidth = 10;
      g.lineCap = "butt";
      g.stroke();
    }
    // H: two posts and a bar
    const pw = 30, ph = 108, gap = 34;
    rrect(g, c0 - gap - pw, c0 - ph / 2, pw, ph, 4);
    g.fill();
    rrect(g, c0 + gap, c0 - ph / 2, pw, ph, 4);
    g.fill();
    g.fillRect(c0 - gap - 2, c0 - 12, 2 * gap + 4, 24);
    g.restore();
    // white-hot top edge on the glyph (up-left light)
    g.save();
    g.globalCompositeOperation = "lighter";
    g.fillStyle = "rgba(255,240,210,0.35)";
    g.fillRect(c0 - gap - pw + 2, c0 - ph / 2 + 1, pw - 4, 4);
    g.fillRect(c0 + gap + 2, c0 - ph / 2 + 1, pw - 4, 4);
    g.restore();
  }

  // ---- IC4 Behemoth head in shadow -------------------------------------------------------------------------------

  function blob(g, x, y, rx, ry, seed, j) {
    const q = rng(seed);
    const n = 32;
    const ks = [];
    for (let i = 0; i < n; i++) ks.push(1 + (q() - 0.5) * j);
    g.beginPath();
    for (let i = 0; i <= n; i++) {
      const a = (i / n) * Math.PI * 2;
      const k = (ks[i % n] + ks[(i + 1) % n]) / 2;
      const px = x + Math.cos(a) * rx * k, py = y + Math.sin(a) * ry * k;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
  }

  /**
   * IC4: the Behemoth from above, facing the viewer (down), close: the hunched back and two shoulder masses fill the
   * top, the head hangs low and forward between them. Only a faint cold sky rims it from the up-left; its enraged
   * eyes are the one light, so they light the brow ridge from in front and throw a red pool on the asphalt ahead.
   * Damage follows the take-C idea (a body that grew too fast for its skin): dark, calm splits on the shoulder tops.
   */
  function drawIC4(g) {
    asphalt(g, 41, "#111317");
    const cx = U / 2, ey = U * 0.655, ex = 38;
    // the eyes' light on the ground ahead of the head (drawn first: the body covers what is under it)
    g.save();
    g.globalCompositeOperation = "lighter";
    const gp = g.createRadialGradient(cx, ey + 40, 0, cx, ey + 40, 170);
    gp.addColorStop(0, `rgba(${EYE},0.32)`);
    gp.addColorStop(0.5, `rgba(${EYE},0.1)`);
    gp.addColorStop(1, `rgba(${EYE},0)`);
    g.fillStyle = gp;
    g.fillRect(0, 0, U, U);
    g.restore();
    const fig = canvas(U);
    const f = fig.getContext("2d");
    const skin = "#2b3029", skinD = "#232720";
    // hunched back under the remains of a shirt
    f.fillStyle = "#1c1e19";
    blob(f, cx, U * 0.12, 230, 150, 3, 0.06);
    f.fill();
    // shoulder masses
    f.fillStyle = skin;
    blob(f, U * 0.25, U * 0.36, 120, 122, 5, 0.1);
    f.fill();
    blob(f, U * 0.75, U * 0.36, 120, 122, 6, 0.1);
    f.fill();
    // arms hanging forward from the shoulders, fists down at the front corners (they ram walls)
    f.fillStyle = skinD;
    for (const sx of [-1, 1]) {
      f.save();
      f.translate(cx + sx * U * 0.31, U * 0.62);
      f.rotate(sx * -0.18);
      blob(f, 0, 0, 58, 105, 8 + sx, 0.1);
      f.fill();
      f.restore();
    }
    // the head, wide and low, sunk between the shoulders (no neck to speak of)
    f.fillStyle = skin;
    blob(f, cx, U * 0.55, 88, 80, 12, 0.05);
    f.fill();
    // heavy brow ridge across the front of the skull, over the sockets
    f.fillStyle = "#353b32";
    blob(f, cx, ey - 18, 74, 22, 13, 0.06);
    f.fill();
    // deep sockets (the eyes sit in them)
    f.fillStyle = "#0d0e0c";
    for (const s of [-1, 1]) {
      f.beginPath();
      f.ellipse(cx + s * ex, ey - 2, 17, 11, 0, 0, Math.PI * 2);
      f.fill();
    }
    // the splits on the shoulder tops: dark, not glowing (calm skin), where the stretch is greatest
    f.strokeStyle = "rgba(48,14,10,0.85)";
    f.lineWidth = 8;
    f.lineCap = "round";
    f.lineJoin = "round";
    for (const pts of [[[0.15, 0.31], [0.2, 0.27], [0.24, 0.29], [0.3, 0.24]], [[0.85, 0.31], [0.8, 0.27], [0.76, 0.29], [0.7, 0.24]]]) {
      f.beginPath();
      pts.forEach(([x, y], i) => (i ? f.lineTo(U * x, U * y) : f.moveTo(U * x, U * y)));
      f.stroke();
    }
    // skin mottle (soft patches, no specks)
    f.globalCompositeOperation = "source-atop";
    const q = rng(77);
    for (let i = 0; i < 70; i++) {
      const x = q() * U, y = q() * U * 0.8, s = 14 + q() * 34;
      const gr = f.createRadialGradient(x, y, 0, x, y, s);
      gr.addColorStop(0, `rgba(${q() < 0.5 ? "0,0,0" : "110,120,100"},0.12)`);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      f.fillStyle = gr;
      f.fillRect(0, 0, U, U);
    }
    f.globalCompositeOperation = "source-over";
    g.drawImage(shadowOf(fig, 12, 0.75), LIGHT.x * 20, LIGHT.y * 20);
    // cold rim from the sky (up-left), dim
    g.drawImage(relight(fig, -200, -200, { size: 280, rimW: 7, rim: 0.6, rimRGB: "150,165,195", lit: 0.06, dark: 0.6, outline: 1.6 }), 0, 0);
    // red light on the brow's front and the fists' inner sides (lit by the eyes), clipped to the body
    const glow = canvas(U);
    const gg = glow.getContext("2d");
    gg.drawImage(fig, 0, 0);
    gg.globalCompositeOperation = "source-in";
    const bl = gg.createRadialGradient(cx, ey, 0, cx, ey, 120);
    bl.addColorStop(0, `rgba(${EYE},0.55)`);
    bl.addColorStop(1, `rgba(${EYE},0)`);
    gg.fillStyle = bl;
    gg.fillRect(0, 0, U, U);
    g.save();
    g.globalCompositeOperation = "lighter";
    g.drawImage(glow, 0, 0);
    // the eyes
    for (const s of [-1, 1]) {
      const x = cx + s * ex;
      const e = g.createRadialGradient(x, ey, 0, x, ey, 36);
      e.addColorStop(0, "rgba(255,238,215,1)");
      e.addColorStop(0.2, `rgba(${EYE},1)`);
      e.addColorStop(0.55, `rgba(${EYE},0.35)`);
      e.addColorStop(1, `rgba(${EYE},0)`);
      g.fillStyle = e;
      g.beginPath();
      g.arc(x, ey, 36, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    vignette(g, cx, U * 0.5, U * 0.3, U * 0.75, 0.6);
  }

  const OPTIONS = [
    { code: "IC1", name: "Survivor in the streetlight pool", draw: drawIC1, rec: true },
    { code: "IC2", name: "Horde around one amber survivor", draw: drawIC2 },
    { code: "IC3", name: "Lumen emblem (H in a crosshair)", draw: drawIC3 },
    { code: "IC4", name: "The Behemoth's head in shadow", draw: drawIC4 },
  ];

  /** The full-bleed icon at `px` (drawn at 512, then halved step by step for clean small sizes). */
  function render(opt, px) {
    const big = canvas(U);
    opt.draw(big.getContext("2d"));
    let cur = big;
    while (cur.width / 2 >= px) {
      const n = canvas(cur.width / 2);
      const g = n.getContext("2d");
      g.imageSmoothingQuality = "high";
      g.drawImage(cur, 0, 0, n.width, n.height);
      cur = n;
    }
    if (cur.width === px) return cur;
    const out = canvas(px);
    const g = out.getContext("2d");
    g.imageSmoothingQuality = "high";
    g.drawImage(cur, 0, 0, px, px);
    return out;
  }

  window.HordesIcons = { OPTIONS, render, canvas };
})();
