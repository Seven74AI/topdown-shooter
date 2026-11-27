/*
 * Story 10.5-Q1: builds the stills from `icons.js`: one sheet per option (512 / 180 / 60 px renders, iOS and Android
 * masks, the maskable 80 % crop, dark and light backgrounds; drawn at DPR 1 so 60 px is 60 real pixels) and one
 * comparison on two phone home screens (dark and light wallpaper, "Hordes" under each icon) at DPR 2.
 */
(function () {
  "use strict";
  const { OPTIONS, render, canvas } = window.HordesIcons;
  const FONT = '-apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  // ---- masks -----------------------------------------------------------------------------------------------------
  /** iOS: rounded square, corner ≈ 22.4 % of the side. */
  function iosPath(g, x, y, s) {
    g.beginPath();
    g.roundRect(x, y, s, s, s * 0.2237);
  }
  /** Android squircle: superellipse n = 4 (it contains the maskable safe circle). */
  function squirclePath(g, x, y, s) {
    const cx = x + s / 2, cy = y + s / 2, a = s / 2, n = 4;
    g.beginPath();
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * Math.PI * 2;
      const c = Math.cos(t), si = Math.sin(t);
      const px = cx + a * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
      const py = cy + a * Math.sign(si) * Math.pow(Math.abs(si), 2 / n);
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
  }
  function circlePath(g, x, y, s) {
    g.beginPath();
    g.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
  }
  const ICON_CACHE = new Map();
  function icon(opt, px) {
    const k = opt.code + ":" + px;
    if (!ICON_CACHE.has(k)) ICON_CACHE.set(k, render(opt, px));
    return ICON_CACHE.get(k);
  }
  /** Draw option `opt` at size `s` (css px) × dpr, with mask kind: "ios" (whole icon), "circle"/"squircle"
   *  (maskable: the central 80 % scaled up to fill the mask), or "square" (unmasked). */
  function drawIcon(g, opt, x, y, s, mask, dpr) {
    const px = Math.round(s * (dpr || 1));
    g.save();
    if (mask === "ios") iosPath(g, x, y, s);
    else if (mask === "circle") circlePath(g, x, y, s);
    else if (mask === "squircle") squirclePath(g, x, y, s);
    else {
      g.beginPath();
      g.rect(x, y, s, s);
    }
    g.clip();
    if (mask === "circle" || mask === "squircle") {
      // maskable: the launcher shows the central 80 %: render big enough, then crop 10 % each side
      const full = icon(opt, Math.round(px / 0.8));
      const m = full.width * 0.1;
      g.drawImage(full, m, m, full.width - 2 * m, full.height - 2 * m, x, y, s, s);
    } else {
      g.drawImage(icon(opt, px), x, y, s, s);
    }
    g.restore();
  }

  // ---- per-option sheet (DPR 1) ----------------------------------------------------------------------------------
  const BRIEF = {
    IC1: "A survivor from above in a streetlight pool on wet asphalt, rifle aimed top right. Lamp up-left: amber rim up-left, shadow down-right.",
    IC2: "Eight zombies close in at the edge of the only light; the survivor is one amber dot. Rims face the centre, shadows fall outwards.",
    IC3: "Lumen LF5 badge: bevelled gunmetal plate, charcoal glass face, amber H in a crosshair ring. No scene.",
    IC4: "The Behemoth's head and hunched shoulders from above, in shadow; its enraged red eyes are the only light.",
  };
  function label(g, t, x, y, size, col, weight, align) {
    g.font = `${weight || 500} ${size}px ${FONT}`;
    g.fillStyle = col;
    g.textAlign = align || "left";
    g.textBaseline = "alphabetic";
    g.fillText(t, x, y);
  }
  function sheet(opt) {
    const W = 1240, H = 700;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    g.fillStyle = "#2a2d31";
    g.fillRect(0, 0, W, H);
    label(g, `${opt.code}${opt.rec ? "  (recommended)" : ""}`, 24, 40, 26, "#f59a2c", 700);
    label(g, opt.name, 24 + (opt.rec ? 330 : 80), 40, 22, "#f4f1ea", 600);
    label(g, BRIEF[opt.code], 24, 68, 15, "#b8bec6", 400);
    // 512 full bleed
    const y0 = 92;
    g.drawImage(icon(opt, 512), 24, y0);
    label(g, "512 px, full bleed (as committed)", 24, y0 + 512 + 22, 14, "#b8bec6");
    // maskable guide over a second 512? keep the sheet compact: right column
    const X = 560;
    // dark and light panels, 180 + 60 for iOS, maskable circle, squircle
    const panels = [
      { bg: "#101114", fg: "#e9e9ea", t: "dark home screen" },
      { bg: "#e9e6df", fg: "#222", t: "light home screen" },
    ];
    panels.forEach((p, i) => {
      const py = y0 + i * 268, ph = 254;
      g.fillStyle = p.bg;
      g.fillRect(X, py, 656, ph);
      label(g, p.t, X + 12, py + 22, 13, p.fg, 600);
      drawIcon(g, opt, X + 16, py + 36, 180, "ios");
      label(g, "180 iOS", X + 16, py + 236, 12, p.fg);
      drawIcon(g, opt, X + 214, py + 36, 180, "circle");
      label(g, "180 maskable, circle", X + 214, py + 236, 12, p.fg);
      // 60 px trio
      const sx = X + 420;
      drawIcon(g, opt, sx, py + 46, 60, "ios");
      drawIcon(g, opt, sx + 76, py + 46, 60, "circle");
      drawIcon(g, opt, sx + 152, py + 46, 60, "squircle");
      label(g, "60 iOS · circle · squircle", sx, py + 124, 12, p.fg);
      // the 60 px unmasked "any" icon and the 32 favicon-ish
      drawIcon(g, opt, sx, py + 146, 60, "square");
      drawIcon(g, opt, sx + 76, py + 160, 32, "square");
      label(g, "60 square · 32 favicon", sx, py + 236, 12, p.fg);
    });
    // maskable guide strip under the 512: safe circle drawn over a 160 copy
    return c;
  }

  /** Maskable guide: the 512 with the 80 % safe circle and the crop outside it shaded. */
  function maskGuide(opt) {
    const c = canvas(512);
    const g = c.getContext("2d");
    g.drawImage(icon(opt, 512), 0, 0);
    g.save();
    g.beginPath();
    g.rect(0, 0, 512, 512);
    g.arc(256, 256, 204.8, 0, Math.PI * 2, true);
    g.fillStyle = "rgba(255,0,255,0.28)";
    g.fill("evenodd");
    g.restore();
    g.setLineDash([10, 8]);
    g.strokeStyle = "#ff3bff";
    g.lineWidth = 3;
    g.beginPath();
    g.arc(256, 256, 204.8, 0, Math.PI * 2);
    g.stroke();
    return c;
  }
  function sheetWithGuide(opt) {
    const base = sheet(opt);
    const W = base.width, H = base.height + 300;
    const c = canvas(W, H);
    const g = c.getContext("2d");
    g.drawImage(base, 0, 0);
    g.fillStyle = "#2a2d31";
    g.fillRect(0, base.height, W, 300);
    const guide = maskGuide(opt);
    g.drawImage(guide, 24, base.height + 10, 256, 256);
    label(g, "maskable: outside the dashed 80 % circle (magenta) is cut", 24, base.height + 288, 14, "#b8bec6");
    // crop results at 180 on dark/light
    drawIcon(g, opt, 320, base.height + 48, 180, "circle");
    label(g, "maskable crop", 320, base.height + 250, 13, "#b8bec6");
    drawIcon(g, opt, 530, base.height + 48, 180, "squircle");
    label(g, "squircle crop", 530, base.height + 250, 13, "#b8bec6");
    drawIcon(g, opt, 740, base.height + 48, 180, "ios");
    label(g, "iOS (whole icon)", 740, base.height + 250, 13, "#b8bec6");
    return c;
  }

  // ---- phone comparison (DPR 2) ----------------------------------------------------------------------------------
  function genericApp(g, x, y, s, kind) {
    // neutral system-style apps (no brand): settings, notes, photos-like
    g.save();
    iosPath(g, x, y, s);
    g.clip();
    const bg = { gear: ["#8e9399", "#5e636a"], notes: ["#f6f3ea", "#e2dccb"], sun: ["#4d8fe0", "#2a5fb8"] }[kind];
    const lg = g.createLinearGradient(x, y, x, y + s);
    lg.addColorStop(0, bg[0]);
    lg.addColorStop(1, bg[1]);
    g.fillStyle = lg;
    g.fillRect(x, y, s, s);
    const cx = x + s / 2, cy = y + s / 2;
    if (kind === "gear") {
      g.fillStyle = "#e8eaec";
      g.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, r = i % 2 ? s * 0.28 : s * 0.34;
        g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
      }
      g.closePath();
      g.fill();
      g.fillStyle = bg[1];
      g.beginPath();
      g.arc(cx, cy, s * 0.12, 0, Math.PI * 2);
      g.fill();
    } else if (kind === "notes") {
      g.strokeStyle = "#c9c2ae";
      g.lineWidth = s * 0.03;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.moveTo(x + s * 0.2, y + s * (0.38 + i * 0.13));
        g.lineTo(x + s * 0.8, y + s * (0.38 + i * 0.13));
        g.stroke();
      }
      g.fillStyle = "#e7b63f";
      g.fillRect(x, y, s, s * 0.22);
    } else {
      g.fillStyle = "#ffd65a";
      g.beginPath();
      g.arc(cx, cy, s * 0.2, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
  }

  function phone(g, x, y, w, h, dark, dpr) {
    // wallpaper
    g.save();
    g.beginPath();
    g.roundRect(x, y, w, h, 46);
    g.clip();
    const wp = g.createLinearGradient(x, y, x + w, y + h);
    if (dark) {
      wp.addColorStop(0, "#1b2438");
      wp.addColorStop(0.55, "#0c0f17");
      wp.addColorStop(1, "#05060a");
    } else {
      wp.addColorStop(0, "#f3efe6");
      wp.addColorStop(0.5, "#d9e2ea");
      wp.addColorStop(1, "#c4d2dc");
    }
    g.fillStyle = wp;
    g.fillRect(x, y, w, h);
    // soft wallpaper shapes
    for (const [fx, fy, fr, col] of dark
      ? [[0.2, 0.25, 160, "rgba(70,90,150,0.25)"], [0.85, 0.7, 200, "rgba(40,60,110,0.22)"]]
      : [[0.25, 0.3, 170, "rgba(255,255,255,0.55)"], [0.8, 0.75, 210, "rgba(150,180,205,0.35)"]]) {
      const gr = g.createRadialGradient(x + w * fx, y + h * fy, 0, x + w * fx, y + h * fy, fr);
      gr.addColorStop(0, col);
      gr.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = gr;
      g.fillRect(x, y, w, h);
    }
    const fg = dark ? "#ffffff" : "#1b1d21";
    // status bar
    label(g, "21:47", x + 34, y + 36, 15, fg, 600);
    label(g, dark ? "dark wallpaper" : "light wallpaper", x + w - 30, y + 36, 12, fg, 500, "right");
    const s = 60, colW = (w - 40) / 4;
    const rows = [
      { mask: "ios", t: "iOS (rounded square)" },
      { mask: "circle", t: "Android, circle (maskable)" },
      { mask: "squircle", t: "Android, squircle (maskable)" },
    ];
    let ry = y + 70;
    rows.forEach((row) => {
      label(g, row.t, x + 24, ry, 11, dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)", 500);
      ry += 12;
      OPTIONS.forEach((opt, i) => {
        const ix = x + 20 + colW * i + (colW - s) / 2;
        // the launcher's own soft shadow under the icon
        g.save();
        g.shadowColor = "rgba(0,0,0,0.25)";
        g.shadowBlur = 8;
        g.shadowOffsetY = 2;
        g.fillStyle = "rgba(0,0,0,0.01)";
        if (row.mask === "ios") iosPath(g, ix, ry, s);
        else if (row.mask === "circle") circlePath(g, ix, ry, s);
        else squirclePath(g, ix, ry, s);
        g.fill();
        g.restore();
        drawIcon(g, opt, ix, ry, s, row.mask, dpr);
        g.save();
        if (dark) {
          g.shadowColor = "rgba(0,0,0,0.6)";
          g.shadowBlur = 3;
        }
        label(g, "Hordes", ix + s / 2, ry + s + 17, 12, fg, 500, "center");
        g.restore();
      });
      ry += s + 40;
    });
    // a row with three neutral system apps next to IC1..IC4 again, for scale against real icons
    label(g, "next to system apps (iOS)", x + 24, ry, 11, dark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)", 500);
    ry += 12;
    ["gear", "notes", "sun"].forEach((k, i) => {
      const ix = x + 20 + colW * i + (colW - s) / 2;
      genericApp(g, ix, ry, s, k);
      label(g, ["Settings", "Notes", "Weather"][i], ix + s / 2, ry + s + 17, 12, fg, 500, "center");
    });
    // column codes under the dock area
    // dock with IC1..IC4 (the recommended one first)
    const dy = y + h - 104;
    g.fillStyle = dark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.45)";
    g.beginPath();
    g.roundRect(x + 14, dy, w - 28, 88, 30);
    g.fill();
    OPTIONS.forEach((opt, i) => {
      const ix = x + 20 + colW * i + (colW - s) / 2;
      drawIcon(g, opt, ix, dy + 14, s, "ios", dpr);
    });
    g.restore();
    // frame
    g.lineWidth = 10;
    g.strokeStyle = "#0a0a0b";
    g.beginPath();
    g.roundRect(x - 5, y - 5, w + 10, h + 10, 50);
    g.stroke();
    // column codes above the phones
    OPTIONS.forEach((opt, i) => {
      label(g, opt.code + (opt.rec ? " (rec.)" : ""), x + 20 + colW * i + colW / 2, y - 18, 14, opt.rec ? "#f59a2c" : "#e6e6e6", 700, "center");
    });
  }

  function comparison() {
    const dpr = 2, w = 390, h = 720, W = 2 * w + 120, H = h + 110;
    const c = canvas(W * dpr, H * dpr);
    const g = c.getContext("2d");
    g.scale(dpr, dpr);
    g.fillStyle = "#2a2d31";
    g.fillRect(0, 0, W, H);
    label(g, "Hordes home-screen icon, 10.5-Q1: IC1-IC4 at 60 pt (DPR 2), dark and light wallpaper", 40, 30, 16, "#f4f1ea", 600);
    phone(g, 40, 80, w, h, true, dpr);
    phone(g, 40 + w + 40, 80, w, h, false, dpr);
    return c;
  }

  window.HordesSheets = { sheet: sheetWithGuide, comparison, maskGuide };
})();
