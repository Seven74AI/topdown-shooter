/* 9 · Story 7.12 the surprise loot bag in the world (rain, 5 % blackout), off-screen arrow, "Bag found!" line. */
const PPM = 35; // game scale: 35 CSS px per metre
const imgCache = new Map();
function img(url) { if (!imgCache.has(url)) { const im = new Image(); im.src = url; imgCache.set(url, im); } return imgCache.get(url); }
function pulse(t, period = 1.2) { return 0.5 - 0.5 * Math.cos((t / period) * TAU); }
function star(g, x, y, R, a) { g.save(); g.globalAlpha = a; g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = R * 1.4; g.beginPath(); for (let i = 0; i < 8; i++) { const rr = i % 2 ? R * 0.22 : R; const an = (i / 8) * TAU - Math.PI / 2; g.lineTo(x + Math.cos(an) * rr, y + Math.sin(an) * rr); } g.closePath(); g.fill(); g.restore(); }
/** The bag at (x, y), s px per metre (sack about 0.5 m), variant LB1/LB2/LB3, t seconds since it dropped. */
function drawBag(g, x, y, s, v, t) {
  const m = s / 35; // 1 at game scale
  g.save(); g.translate(x, y);
  // ground shadow
  g.fillStyle = 'rgba(0,0,0,0.45)'; g.beginPath(); g.ellipse(1.5 * m, 2.5 * m, 10 * m, 7 * m, 0, 0, TAU); g.fill();
  const p = pulse(t);
  if (v === 'LB1') { g.strokeStyle = `rgba(255,255,255,${0.18 + 0.3 * p})`; g.lineWidth = 1.4 * m; g.beginPath(); g.ellipse(0, 1 * m, (12 + 4 * p) * m, (9 + 3 * p) * m, 0, 0, TAU); g.stroke(); }
  const body = v === 'LB2' ? ['#4c5246', '#2c3029', '#6a715f'] : v === 'LB3' ? ['#6b5a44', '#3e3326', '#8c7759'] : ['#8a7350', '#54442c', '#b09669'];
  // sack (top view with a little lean: the tied neck is up-screen)
  const sack = () => { g.beginPath(); g.moveTo(-8 * m, 3 * m); g.bezierCurveTo(-10 * m, -4 * m, -5 * m, -8 * m, -2.2 * m, -7 * m); g.lineTo(2.2 * m, -7 * m); g.bezierCurveTo(5 * m, -8 * m, 10 * m, -4 * m, 8 * m, 3 * m); g.bezierCurveTo(7 * m, 8 * m, -7 * m, 8 * m, -8 * m, 3 * m); g.closePath(); };
  const gr = g.createRadialGradient(-3 * m, -3 * m, 1, 0, 0, 11 * m); gr.addColorStop(0, body[2]); gr.addColorStop(0.6, body[0]); gr.addColorStop(1, body[1]);
  sack(); g.fillStyle = gr; g.fill();
  g.save(); sack(); g.clip(); g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 0.6 * m; for (let i = -10; i < 10; i += 2) { g.beginPath(); g.moveTo(i * m, -9 * m); g.lineTo((i + 3) * m, 9 * m); g.stroke(); } g.restore();
  sack(); g.strokeStyle = '#141210'; g.lineWidth = 1.3 * m; g.stroke();
  // fold lines and the tied neck
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 0.9 * m; g.beginPath(); g.moveTo(-4 * m, -5 * m); g.quadraticCurveTo(-3 * m, 0, -5 * m, 4 * m); g.moveTo(3.5 * m, -5 * m); g.quadraticCurveTo(2 * m, 0, 4 * m, 4 * m); g.stroke();
  g.fillStyle = body[1]; g.beginPath(); g.ellipse(0, -8 * m, 3.2 * m, 2 * m, 0, 0, TAU); g.fill(); g.stroke();
  g.fillStyle = body[2]; g.beginPath(); g.moveTo(-2.5 * m, -9 * m); g.lineTo(-4.5 * m, -12.5 * m); g.lineTo(-0.5 * m, -10 * m); g.lineTo(0.5 * m, -10 * m); g.lineTo(4 * m, -13 * m); g.lineTo(2.5 * m, -9 * m); g.closePath(); g.fill(); g.stroke();
  g.strokeStyle = v === 'LB3' ? '#e8e4da' : '#c9b48a'; g.lineWidth = 1.1 * m; g.beginPath(); g.moveTo(-3 * m, -8.5 * m); g.lineTo(3 * m, -8.5 * m); g.stroke();
  if (v === 'LB1') star(g, 6 * m, -8 * m, (4 + 3.5 * p) * m, 0.45 + 0.55 * p);
  if (v === 'LB2') { g.save(); sack(); g.shadowColor = '#fff'; g.shadowBlur = (3 + 6 * p) * m; g.strokeStyle = `rgba(255,255,255,${0.45 + 0.5 * p})`; g.lineWidth = 1.6 * m; g.stroke(); g.restore(); }
  if (v === 'LB3') {
    g.fillStyle = '#f2efe6'; g.save(); g.translate(3.5 * m, -9.5 * m); g.rotate(0.5); g.fillRect(0, -1.6 * m, 5 * m, 3.2 * m); g.restore();
    for (let i = 0; i < 3; i++) { const k = ((t + i / 3) % 1); star(g, (-4 + i * 4) * m + Math.sin((t + i) * 3) * m, (-6 - k * 14) * m, 1.8 * m, (1 - k) * 0.95); }
  }
  g.restore();
}
function drawRain(g, w, h, t, a) { g.save(); g.strokeStyle = `rgba(190,205,225,${0.28 * a})`; g.lineWidth = 1; const r = rnd(42); g.beginPath(); for (let i = 0; i < 140; i++) { const x0 = r() * (w + 60), sp = 500 + r() * 300, y = ((r() * h + t * sp) % (h + 40)) - 20, x = (x0 - t * sp * 0.25) % (w + 60) - 30; g.moveTo(x, y); g.lineTo(x - 3, y + 11); } g.stroke(); g.restore(); }
function cone(dg, x, y, ang, len, half) { const gr = dg.createRadialGradient(x, y, 4, x, y, len); gr.addColorStop(0, 'rgba(0,0,0,0.82)'); gr.addColorStop(0.7, 'rgba(0,0,0,0.62)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); dg.fillStyle = gr; dg.beginPath(); dg.moveTo(x, y); dg.arc(x, y, len, ang - half, ang + half); dg.closePath(); dg.fill(); const g2 = dg.createRadialGradient(x, y, 0, x, y, 30); g2.addColorStop(0, 'rgba(0,0,0,0.6)'); g2.addColorStop(1, 'rgba(0,0,0,0)'); dg.fillStyle = g2; dg.beginPath(); dg.arc(x, y, 30, 0, TAU); dg.fill(); }
/**
 * One frame of the world. o: { mode: 'rain'|'dark', bag: 'LB1'.., bagAt: [fx, fy] (share of the screen; off screen allowed),
 * arrow: null|'OA1'|'OA2', toast: null|'BF1'|'BF2', who: 'me'|'mate', w, h, bg (Image) }
 */
function worldFrame(g, o, t) {
  const { w, h } = o;
  g.setTransform(DPR, 0, 0, DPR, 0, 0);
  if (o.bg.complete) g.drawImage(o.bg, 0, 0, w, h); else { g.fillStyle = '#111'; g.fillRect(0, 0, w, h); }
  const players = [[0.38, 0.6, -0.25, 1, 'ana'], [0.27, 0.42, -0.6, 0, 'mo'], [0.47, 0.32, 0.4, 2, 'kit']];
  const zs = [[0.83, 0.28, 3.4, 2], [0.88, 0.52, 3.1, 5], [0.76, 0.82, 3.7, 8], [0.12, 0.84, -0.6, 4]];
  const R = 0.4 * PPM;
  for (const [x, y, a, v] of zs) { g.save(); g.translate(x * w, y * h); g.rotate(a); G7.drawZombie(g, 'walker', R, v); g.restore(); }
  if (o.mode === 'rain') drawRain(g, w, h, STATIC ? 1.7 : t, 1);
  if (o.mode === 'dark') {
    const [dc, dg] = canvas(w, h); dg.fillStyle = 'rgba(3,5,9,0.95)'; dg.fillRect(0, 0, w, h);
    dg.globalCompositeOperation = 'destination-out';
    for (const [x, y, a] of players) cone(dg, x * w, y * h, a, 7 * PPM, 0.32);
    g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(dc, 0, 0); g.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawRain(g, w, h, STATIC ? 1.7 : t, 0.35);
  }
  // people above the dark (rings + survivors), then the bag (ABOVE_DARK.pickup)
  for (const [x, y, a, s, l] of players) { ring(g, x * w, y * h, R, SLOT[s]); survivorAt(g, l, x * w, y * h, R, a); }
  const [bx, by] = o.bagAt;
  const on = bx >= 0 && bx <= 1 && by >= 0 && by <= 1;
  if (on) drawBag(g, bx * w, by * h, PPM, o.bag, STATIC ? 0.6 : t);
  if (!on && o.arrow) {
    const ins = insOf(w); const cx = w / 2, cy = h / 2; const tx = bx * w, ty = by * h; const ang = Math.atan2(ty - cy, tx - cx);
    const L = ins.left + 22, Rr = w - ins.right - 22, T = 22, B = h - ins.bottom - 22;
    const k = Math.min(Math.abs((Math.cos(ang) > 0 ? Rr - cx : L - cx) / Math.cos(ang)), Math.abs((Math.sin(ang) > 0 ? B - cy : T - cy) / Math.sin(ang)));
    const ax = cx + Math.cos(ang) * k, ay = cy + Math.sin(ang) * k;
    g.save(); g.translate(ax, ay);
    if (o.arrow === 'OA1') {
      g.rotate(ang); g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 6; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(11, 0); g.lineTo(-7, -9); g.lineTo(-3, 0); g.lineTo(-7, 9); g.closePath(); g.fill();
    } else {
      const left = 1 - ((STATIC ? 6 : t % 20) / 20);
      g.fillStyle = 'rgba(10,12,16,0.78)'; g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.25)'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 15, 0, TAU); g.stroke();
      g.strokeStyle = '#fff'; g.beginPath(); g.arc(0, 0, 15, -Math.PI / 2, -Math.PI / 2 + left * TAU); g.stroke();
      g.save(); g.scale(0.55, 0.55); drawBag(g, 0, 3, PPM, o.bag, 0); g.restore();
      g.rotate(ang); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(27, 0); g.lineTo(19, -6); g.lineTo(19, 6); g.closePath(); g.fill();
    }
    g.restore();
  }
  if (o.toast) {
    g.save(); g.font = '700 18px system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    const y = 56; const mate = o.who === 'mate';
    if (o.toast === 'BF1') { const s = mate ? 'Ana found a bag!' : 'Bag found!'; g.lineWidth = 4; g.strokeStyle = '#000'; g.strokeText(s, w / 2, y); g.fillStyle = '#fff'; g.fillText(s, w / 2, y); }
    else {
      const parts = mate ? [['Ana', SLOT[1]], [' found a bag!', '#fff']] : [['Bag found!', '#fff']];
      const tw = parts.reduce((a, p) => a + g.measureText(p[0]).width, 0) + 26; let x = w / 2 - tw / 2;
      g.save(); g.translate(x + 8, y); g.scale(0.62, 0.62); drawBag(g, 0, 2, PPM, o.bag, 0); g.restore(); star(g, x + 15, y - 8, 4, 0.9); x += 26; g.textAlign = 'left';
      for (const [s, c] of parts) { g.lineWidth = 4; g.strokeStyle = '#000'; g.strokeText(s, x, y); g.fillStyle = c; g.fillText(s, x, y); x += g.measureText(s).width; }
    }
    g.restore();
  }
}
function worldPhone(o, label) {
  const w = o.w, h = o.h;
  const bg = img(cityBg(w, h, o.mode === 'dark' ? { stage: 5, power: 'off', x0: 15, y0: 13, noLight: true } : { stage: 3, x0: 15, y0: 13 }));
  const oo = { ...o, bg };
  return phone({ w, h, label, html: '<canvas class="w"></canvas>', css: 'canvas.w{position:fixed;inset:0;width:100%;height:100%}', paint: (d) => {
    const c = d.querySelector('canvas'); c.width = w * DPR; c.height = h * DPR; const g = c.getContext('2d');
    const draw = (t) => worldFrame(g, oo, t);
    if (bg.complete) draw(0.6); else bg.onload = () => draw(0.6);
    if (!STATIC) animate(draw);
  } });
}
const LB_V = {
  LB1: { name: 'Burlap sack with a white star glint', desc: 'A tan sack tied at the neck; a white four-point glint on its shoulder and a faint white ring on the ground pulse once a second. Classic "pick me up", but tan burlap is close to the stage-3 sandbags (cover).' },
  LB2: { name: 'Dark cloth sack with a white edge glow', rec: true, desc: 'A dark olive drawstring sack whose outline glows white, pulsing softly. Dark cloth can\'t be mistaken for sandbags or barricades, and the glowing edge is the whole message: white = pick-up. Reads in rain and in pitch dark (drawn above the darkness).' },
  LB3: { name: 'Sack with a white tag and rising sparkles', desc: 'A brown sack with a white luggage tag; three small white sparkles drift up from it. Most playful, but the sparkles are tiny at game size and get lost in the rain.' },
};
{
  const s = section('s-lb', '9 · The surprise loot bag', 'Story 7.12',
    'One run in five, one zombie drops a small sack; it stays 20 s, also into the build phase, and the first player standing on it gets a surprise item. Drawn at the real game scale (35 px per metre: the sack is about half a metre) on the real Downtown, in the stage-3 rain and in the wave-10 <b>5 % blackout</b> (drawn above the darkness like the supply crate). Colour rule: white = pick-ups and people, so the glint is white. The glints pulse here (add <code>?static</code> to stop).',
    '<b>Recommended: LB2 + OA2 + BF2.</b> LB2\'s dark sack with a white glowing edge is the only one that can\'t be read as cover and still pops in the dark; OA2\'s arrow shows the bag and how much of its 20 s is left; BF2 puts the finder\'s name in their slot colour.');
  const grid = el('div', 'grid'); s.appendChild(grid);
  for (const code of Object.keys(LB_V)) {
    const v = LB_V[code];
    const fr = card(grid, code, v.name, v.desc, v.rec);
    fr.appendChild(worldPhone({ w: 568, h: 320, mode: 'rain', bag: code, bagAt: [0.6, 0.58] }, `${code} · rain (stage 3)`));
    fr.appendChild(worldPhone({ w: 568, h: 320, mode: 'dark', bag: code, bagAt: [0.6, 0.58] }, `${code} · 5 % blackout`));
    const sp = el('div', 'spec', `<h4>${code} close-up (4×) and at game size</h4>`);
    const [c, g] = canvas(260, 120); asphalt(g, 260, 120, 3, '#1c1f23');
    const draw = (t) => { g.setTransform(DPR, 0, 0, DPR, 0, 0); asphalt(g, 260, 120, 3, '#1c1f23'); drawBag(g, 80, 64, PPM * 4, code, t); drawBag(g, 200, 64, PPM, code, t); };
    draw(0.6); if (!STATIC) animate(draw);
    sp.appendChild(c); fr.appendChild(sp);
  }
  pickRow(s, 'Loot bag', Object.keys(LB_V));
  const OA_V = {
    OA1: { name: 'Small white chevron + plain line', desc: 'OA1: a white arrowhead at the screen edge (inside the safe area) pointing at the bag. BF1: "Bag found!" for the finder, "Ana found a bag!" for teammates, in the HUD toast style (white, black outline).' },
    OA2: { name: 'Bag badge with a 20 s ring + name in colour', rec: true, desc: 'OA2: a small dark badge with the bag in it and a white arrowhead; a white ring around it runs down over the bag\'s 20 s. BF2: the line starts with a tiny bag, and the finder\'s name is in their slot colour.' },
  };
  const g2 = el('div', 'grid'); g2.style.marginTop = '18px'; s.appendChild(g2);
  for (const code of Object.keys(OA_V)) {
    const v = OA_V[code];
    const bf = code === 'OA1' ? 'BF1' : 'BF2';
    const fr = card(g2, `${code} + ${bf}`, v.name, v.desc, v.rec);
    fr.appendChild(worldPhone({ w: 568, h: 320, mode: 'rain', bag: 'LB2', bagAt: [1.25, 0.8], arrow: code }, `${code} · bag off screen (right)`));
    fr.appendChild(worldPhone({ w: 568, h: 320, mode: 'dark', bag: 'LB2', bagAt: [-0.3, 0.2], arrow: code }, `${code} · bag off screen, blackout`));
    fr.appendChild(worldPhone({ w: 800, h: 360, mode: 'rain', bag: 'LB2', bagAt: [9, 9], arrow: null, toast: bf, who: 'me' }, `${bf} · the finder (bag gone)`));
    fr.appendChild(worldPhone({ w: 568, h: 320, mode: 'dark', bag: 'LB2', bagAt: [9, 9], arrow: null, toast: bf, who: 'mate' }, `${bf} · a teammate`));
  }
  pickRow(s, 'Off-screen arrow', ['OA1', 'OA2']);
  pickRow(s, '"Bag found!" line', ['BF1', 'BF2']);
}
