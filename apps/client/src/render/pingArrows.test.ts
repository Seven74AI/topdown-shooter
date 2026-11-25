import { describe, expect, it } from "vitest";
import { CENTRE_CLEAR_CSS_PX, rectCentreGap } from "../scenes/consumableButton";
import { layoutPingButton } from "../scenes/hudTopLayout";
import { EVENT_ARROW_MAX_BEARING_ERR_RAD, eventArrowDrawnRect, newWaveControlRects, waveControlRects, type ScreenRect } from "./eventArrow";
import { PAIR_GAP_CSS_PX } from "./eventArrowPair";
import { PING_ARROW_CSS_PX, PING_CONTROL_RECTS, fillPingKeepOffs, newPingArrows, newPingKeepOffs, pingIconRect, placePingArrows, type PingArrows, type PingKeepOffMode } from "./pingArrows";
import { PingModel } from "./pingModel";

/**
 * Decision 8.7 B7 (with review M3's build keep-offs): at 568 × 320 the 3rd and 4th arrows crowded on one bearing may be ≤ 45° off.
 * Story 8.7 AC 7 (brief R3: the measurable placement rule, stateful fine sweeps): off-screen pings get the 6.8 event-arrow
 * placement — bearing error ≤ 30°, inside the safe area, off every control (the 8 keep-offs incl. the ping button),
 * 48 px clear of the survivor, never overlapping another ping arrow (≥ 4 px apart), no jump > 40 px on a small
 * move (at most one flip across each jump while oscillating), and the rules hold across a resize mid-ping.
 */
const INSET = { left: 44, right: 44, top: 0, bottom: 21 } as const;
const SIZES: readonly [number, number][] = [
  [568, 320],
  [640, 360],
  [800, 360],
  [844, 390],
];
const R = 5000; // px: far off screen
const angErr = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
const overlaps = (a: ScreenRect, b: ScreenRect, grow = 0): boolean => a.x < b.x + b.w + grow && b.x < a.x + a.w + grow && a.y < b.y + b.h + grow && b.y < a.y + a.h + grow;

/** A scene with the screen centre at world (0, 0), 1 px per metre (vx, vy = the view's top-left in m). */
function frame(model: PingModel, w: number, h: number, controls: ScreenRect[], arrows: PingArrows, ev: ScreenRect | null = null, lite: ScreenRect[] | null = null): PingArrows {
  return placePingArrows(model, -w / 2, -h / 2, 1, w, h, INSET, 1, controls, ev, arrows, lite);
}

/**
 * The bearing cap per arrow: 30° (6.8 D10). Decision 8.7 B7: at 568 × 320 a FOURTH arrow crowded onto the same
 * bearing as three others (all four players' pings off screen in one direction: mine too, so I ran > half a screen
 * from it within its 4 s) can't find a legal spot within 30° (measured worst 43.5°): it gets ≤ 45°; every other rule holds.
 */
const capFor = (slot: number, w: number): number => (slot >= 2 && w <= 568 ? (45 * Math.PI) / 180 : EVENT_ARROW_MAX_BEARING_ERR_RAD);
/** Measured worst bearing error per slot (radians) of the last checks (logged by the sweeps). */
const worstErr = [0, 0, 0, 0];

function checkRules(arrows: PingArrows, w: number, h: number, controls: ScreenRect[], bearings: readonly number[], tag: string): void {
  const size = PING_ARROW_CSS_PX;
  const rects: ScreenRect[] = [];
  for (let i = 0; i < 4; i++) {
    if (!arrows.shown[i]) continue;
    const at = arrows.at[i] as { x: number; y: number; angle: number };
    const r = { ...eventArrowDrawnRect(at, size, { x: 0, y: 0, w: 0, h: 0 }) };
    expect(r.x, `${tag} slot ${i}: left`).toBeGreaterThanOrEqual(INSET.left - 1e-6);
    expect(r.x + r.w, `${tag} slot ${i}: right`).toBeLessThanOrEqual(w - INSET.right + 1e-6);
    expect(r.y, `${tag} slot ${i}: top`).toBeGreaterThanOrEqual(INSET.top - 1e-6);
    expect(r.y + r.h, `${tag} slot ${i}: bottom`).toBeLessThanOrEqual(h - INSET.bottom + 1e-6);
    for (let c = 0; c < controls.length; c++) expect(overlaps(r, controls[c] as ScreenRect), `${tag} slot ${i} overlaps control ${c}`).toBe(false);
    expect(rectCentreGap(r.x, r.y, r.w, r.h, w / 2, h / 2), `${tag} slot ${i}: survivor`).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX - 1e-6);
    const err = angErr(Math.atan2(at.y - h / 2, at.x - w / 2), bearings[i] as number);
    worstErr[i] = Math.max(worstErr[i] as number, err);
    expect(err, `${tag} slot ${i}: bearing error`).toBeLessThanOrEqual(capFor(i, w) + 1e-6);
    for (const o of rects) expect(overlaps(r, o, PAIR_GAP_CSS_PX - 1e-6), `${tag} slot ${i}: closer than 4 px to another ping arrow`).toBe(false);
    rects.push(r);
  }
}

describe("Story 8.7: ping edge arrows (placePingArrows)", () => {
  it("the controls include the ping button (8 keep-offs)", () => {
    const c = waveControlRects(568, 320, INSET, 1, newWaveControlRects());
    expect(c).toHaveLength(8);
    expect(c[7]).toEqual(layoutPingButton(568, INSET, 1, { x: 0, y: 0, w: 0, h: 0 }));
  });

  it("an on-screen ping has no arrow; a ping under ☰ or the ping button does", () => {
    const [w, h] = [640, 360];
    const controls = waveControlRects(w, h, INSET, 1, newWaveControlRects());
    const m = new PingModel();
    m.show(0, 0, 50, 20, 0); // on screen, clear
    const ping = controls[7] as ScreenRect;
    m.show(1, 1, ping.x + ping.w / 2 - w / 2, ping.y + ping.h / 2 - h / 2, 0); // under the ping button
    const a = frame(m, w, h, controls, newPingArrows());
    expect(a.shown).toEqual([false, true, false, false]);
  });

  for (const [w, h] of SIZES) {
    it(`${w} × ${h}: one ping swept round the screen at 0.01° steps both ways with state kept — every rule each frame, jumps > 40 px only where the legal spots part (≤ 3 per turn)`, () => {
      const controls = waveControlRects(w, h, INSET, 1, newWaveControlRects());
      let frames = 0;
      for (const dir of [1, -1]) {
        const m = new PingModel();
        const arrows = newPingArrows();
        let px = Number.NaN;
        let py = Number.NaN;
        let big = 0;
        for (let i = 0; i <= 36_000; i++) {
          const a = ((dir * i) / 100) * (Math.PI / 180);
          m.show(2, 0, Math.cos(a) * R, Math.sin(a) * R, 0);
          frame(m, w, h, controls, arrows);
          expect(arrows.shown[2]).toBe(true);
          checkRules(arrows, w, h, controls, [0, 0, a, 0], `${w}x${h} @${((dir * i) / 100).toFixed(2)}°`);
          const at = arrows.at[2] as { x: number; y: number };
          if (!Number.isNaN(px) && Math.hypot(at.x - px, at.y - py) > 40) big++;
          px = at.x;
          py = at.y;
          frames++;
        }
        expect(big, `jumps > 40 px in one turn (${dir > 0 ? "clockwise" : "anticlockwise"})`).toBeLessThanOrEqual(3);
      }
      expect(frames).toBe(2 * 36_001);
    }, 120_000);

    it(`${w} × ${h}: oscillating ±0.01° … ±1° across every jump > 40 px of the sweep flips at most once (target moves < 0.5 m)`, () => {
      const controls = waveControlRects(w, h, INSET, 1, newWaveControlRects());
      // find the jumps of a fresh 0.01° sweep
      const jumps: number[] = [];
      {
        const m = new PingModel();
        const arrows = newPingArrows();
        let px = Number.NaN;
        let py = Number.NaN;
        for (let i = 0; i <= 36_000; i++) {
          const deg = i / 100;
          const a = (deg * Math.PI) / 180;
          m.show(0, 0, Math.cos(a) * R, Math.sin(a) * R, 0);
          frame(m, w, h, controls, arrows);
          const at = arrows.at[0] as { x: number; y: number };
          if (!Number.isNaN(px) && Math.hypot(at.x - px, at.y - py) > 40) jumps.push(deg);
          px = at.x;
          py = at.y;
        }
      }
      // a target 30 m away moving ±1°: ≤ 0.52 m; the 0.01°–0.5° cases are well under 0.5 m
      for (const deg of jumps) {
        for (const amp of [0.01, 0.1, 0.5]) {
          const m = new PingModel();
          const arrows = newPingArrows();
          let flips = 0;
          let px = Number.NaN;
          let py = Number.NaN;
          for (let j = 0; j < 40; j++) {
            const a = ((deg + (j % 2 === 0 ? -amp : amp)) * Math.PI) / 180;
            m.show(0, 0, Math.cos(a) * R, Math.sin(a) * R, 0);
            frame(m, w, h, controls, arrows);
            const at = arrows.at[0] as { x: number; y: number };
            if (!Number.isNaN(px) && Math.hypot(at.x - px, at.y - py) > 40) flips++;
            px = at.x;
            py = at.y;
          }
          expect(flips, `${w}x${h}: oscillating ±${amp}° round the jump at ${deg}°`).toBeLessThanOrEqual(1);
        }
      }
      console.info(`[ping arrows] ${w}×${h}: ${jumps.length} jumps in a 0.01° turn, each oscillated at 3 amplitudes`);
    }, 120_000);

    it(`${w} × ${h}: four pings at once (same bearing, 3° / 10° / 25° apart) swept at 0.01° with state kept — never closer than 4 px, every rule each`, () => {
      const controls = waveControlRects(w, h, INSET, 1, newWaveControlRects());
      let frames = 0;
      for (const spread of [0, 3, 10, 25]) {
        const m = new PingModel();
        const arrows = newPingArrows();
        const bearings = [0, 0, 0, 0];
        for (let i = 0; i <= 36_000; i += 5) {
          const base = (i / 100) * (Math.PI / 180);
          for (let s = 0; s < 4; s++) {
            const b = base + (s * spread * Math.PI) / 180;
            bearings[s] = b;
            m.show(s, s, Math.cos(b) * R, Math.sin(b) * R, 0);
          }
          frame(m, w, h, controls, arrows);
          expect(arrows.shown.every(Boolean)).toBe(true);
          checkRules(arrows, w, h, controls, bearings, `${w}x${h} spread ${spread}° @${(i / 100).toFixed(2)}°`);
          frames++;
        }
      }
      expect(frames).toBe(4 * 7201);
    }, 120_000);

    it(`${w} × ${h}: keeps off the event arrow too`, () => {
      const controls = waveControlRects(w, h, INSET, 1, newWaveControlRects());
      const m = new PingModel();
      const arrows = newPingArrows();
      for (let deg = 0; deg < 360; deg += 1) {
        const a = (deg * Math.PI) / 180;
        m.show(0, 0, Math.cos(a) * R, Math.sin(a) * R, 0);
        const fresh = newPingArrows();
        frame(m, w, h, controls, fresh); // where the ping would go alone: put the event arrow right there
        const at = fresh.at[0] as { x: number; y: number; angle: number };
        const ev = { ...eventArrowDrawnRect(at, PING_ARROW_CSS_PX, { x: 0, y: 0, w: 0, h: 0 }) };
        frame(m, w, h, controls, arrows, ev);
        const r = eventArrowDrawnRect(arrows.at[0] as { x: number; y: number; angle: number }, PING_ARROW_CSS_PX, { x: 0, y: 0, w: 0, h: 0 });
        expect(overlaps(r, ev, PAIR_GAP_CSS_PX - 1e-6), `${w}x${h} @${deg}°`).toBe(false);
      }
    });
  }

  it("review M1: at 568 × 320 a teammate 30–95 px from the top (its lifted icon off the top or under the band) gets an arrow; a ping whose whole icon is seen doesn't", () => {
    const [w, h] = [568, 320];
    const controls = waveControlRects(w, h, INSET, 1, newWaveControlRects());
    for (let top = 30; top <= 95; top += 0.5) {
      for (const x of [300, 340, 400, 470]) {
        const m = new PingModel();
        m.show(1, 0, x - w / 2, top - h / 2, 0);
        const a = frame(m, w, h, controls, newPingArrows());
        expect(a.shown[1], `teammate at (${x}, ${top})`).toBe(true);
        checkRules(a, w, h, controls, [0, Math.atan2(top - h / 2, x - w / 2), 0, 0], `M1 (${x}, ${top})`);
      }
    }
    const m = new PingModel();
    m.show(0, 0, -120, 40, 0); // left-below the centre: icon 76 px up, fully seen, under no control
    const r = pingIconRect(w / 2 - 120, h / 2 + 40, 1, { x: 0, y: 0, w: 0, h: 0 });
    expect(r.y).toBeGreaterThan(0);
    expect(frame(m, w, h, controls, newPingArrows()).shown[0]).toBe(false);
    // an arrow never lands on a seen icon's disc: my own ping at the centre + a teammate's far off, swept all round
    for (const [sw, sh] of SIZES) {
      const ctl = waveControlRects(sw, sh, INSET, 1, newWaveControlRects());
      const both = new PingModel();
      const arrows = newPingArrows();
      const icon = { x: sw / 2 - 17, y: sh / 2 - 76 - 17, w: 34, h: 34 }; // the icon's disc
      for (let deg = 0; deg < 360; deg += 0.05) {
        const b = (deg * Math.PI) / 180;
        both.show(0, 0, 0, 0, 0);
        both.show(2, 1, Math.cos(b) * R, Math.sin(b) * R, 0);
        frame(both, sw, sh, ctl, arrows);
        expect([arrows.icon[0], arrows.shown[2]]).toEqual([true, true]);
        const r = eventArrowDrawnRect(arrows.at[2] as { x: number; y: number; angle: number }, PING_ARROW_CSS_PX, { x: 0, y: 0, w: 0, h: 0 });
        expect(overlaps(r, icon, PAIR_GAP_CSS_PX - 1e-6), `${sw}x${sh} @${deg.toFixed(2)}°: the arrow on my icon`).toBe(false);
        checkRules(arrows, sw, sh, ctl, [0, 0, b, 0], `${sw}x${sh} own icon + arrow @${deg.toFixed(2)}°`);
      }
    }
    // my own ping at the screen centre stays an icon at every test size (its word may run over the HP row's reserve)
    for (const [sw, sh] of SIZES) {
      const own = new PingModel();
      own.show(0, 0, 0, 0, 0);
      expect(frame(own, sw, sh, waveControlRects(sw, sh, INSET, 1, newWaveControlRects()), newPingArrows()).shown[0], `${sw}x${sh}`).toBe(false);
    }
  });

  it("re-review L2 / B17: a teammate's ping just under the HP block draws its word under the disc (never on the HP text); elsewhere above", () => {
    const [w, h] = [568, 320];
    const controls = waveControlRects(w, h, INSET, 1, newWaveControlRects());
    let below = 0;
    for (let sx = 100; sx <= 240; sx += 5) {
      for (const sy of [140, 150, 160]) {
        const m = new PingModel();
        m.show(1, 0, sx - w / 2, sy - h / 2, 0);
        const a = frame(m, w, h, controls, newPingArrows());
        if (!a.icon[1]) continue;
        const wordAbove = { x: sx - 45, y: sy - 76 - 17 - 20, w: 90, h: 20 };
        const hpText = { x: 58, y: 16 + 16 + 2, w: 170, h: 2 + 14 * 1.3 }; // HP 100 / 100 (fallback width + 4)
        const hits = overlaps(wordAbove, hpText);
        expect(a.wordBelow[1], `(${sx}, ${sy})`).toBe(hits || a.wordBelow[1]);
        if (hits) {
          below++;
          const wordUnder = { x: sx - 45, y: sy - 76 + 17, w: 90, h: 20 };
          expect(overlaps(wordUnder, hpText), `(${sx}, ${sy}): the word under the disc`).toBe(false);
        }
      }
    }
    expect(below, "liveness: some pings sat just under the HP block").toBeGreaterThan(5);
    const m = new PingModel();
    m.show(0, 0, 120, 80, 0);
    expect(frame(m, w, h, controls, newPingArrows()).wordBelow[0]).toBe(false);
  });

  // Review M3 / L6 / L7: in a build phase and in the vote the arrows also keep off that mode's controls (build bar,
  // Ready, build-row swap / quick-use, undo; Extract / Stay), the open wheel and the loot badge / flag arrow.
  const MODES: [string, PingKeepOffMode][] = [
    ["build", { build: true, ready: true, vote: false, wheel: false, wheelColumn: false, flag: null, loot: null }],
    ["build + wheel", { build: true, ready: true, vote: false, wheel: true, wheelColumn: true, flag: null, loot: null }],
    ["vote + wheel", { build: false, ready: false, vote: true, wheel: true, wheelColumn: false, flag: null, loot: null }],
    ["wave + wheel + loot badge", { build: false, ready: false, vote: false, wheel: true, wheelColumn: true, flag: null, loot: { x: 60, y: 140, w: 32, h: 32 } }],
  ];
  for (const [w, h] of SIZES) {
    it(`${w} × ${h}: build, vote, wheel and loot-badge keep-offs — one ping swept at 0.01° both ways and three crowded pings, every rule each frame`, () => {
      const base = waveControlRects(w, h, INSET, 1, newWaveControlRects());
      let frames = 0;
      let liteFrames = 0;
      for (const [name, mode] of MODES) {
        const liteAll = newPingKeepOffs();
        const keepAll = fillPingKeepOffs(base, mode, w, h, INSET, 1, newPingKeepOffs(), liteAll);
        const full = keepAll.filter((r) => r.w > 0);
        const keep = liteAll.filter((r) => r.w > 0); // B16: never overlapped (the build-phase controls may be, counted below)
        expect(full.length, name).toBeGreaterThan(base.length); // liveness: the mode really added rects
        for (const dir of [1, -1]) {
          const m = new PingModel();
          const arrows = newPingArrows();
          for (let i = 0; i <= 36_000; i += 1) {
            const a = ((dir * i) / 100) * (Math.PI / 180);
            m.show(0, 0, Math.cos(a) * R, Math.sin(a) * R, 0);
            frame(m, w, h, full, arrows, null, keep);
            checkRules(arrows, w, h, keep, [a, 0, 0, 0], `${w}x${h} ${name} @${((dir * i) / 100).toFixed(2)}°`);
            if (arrows.lite[0]) liteFrames++;
            else checkRules(arrows, w, h, full, [a, 0, 0, 0], `${w}x${h} ${name} (full set) @${((dir * i) / 100).toFixed(2)}°`);
            frames++;
          }
        }
        const m = new PingModel();
        const arrows = newPingArrows();
        const bearings = [0, 0, 0, 0];
        for (let i = 0; i <= 36_000; i += 10) {
          const base0 = (i / 100) * (Math.PI / 180);
          for (let s = 0; s < 3; s++) {
            bearings[s] = base0 + (s * 3 * Math.PI) / 180;
            m.show(s, s, Math.cos(bearings[s] as number) * R, Math.sin(bearings[s] as number) * R, 0);
          }
          frame(m, w, h, full, arrows, null, keep);
          checkRules(arrows, w, h, keep, bearings, `${w}x${h} ${name} ×3 @${(i / 100).toFixed(2)}°`);
          frames++;
        }
      }
      expect(frames).toBe(MODES.length * (2 * 36_001 + 3601));
      // B16 measured: only a build phase on the two small screens ever needs the lite set
      if (w >= 800) expect(liteFrames, "no lite placement at 800+ px for one ping").toBe(0);
      console.info(`[ping arrows] ${w}×${h}: worst bearing error by slot ${worstErr.map((e) => ((e * 180) / Math.PI).toFixed(1)).join(" / ")}°`);
      worstErr.fill(0);
      console.info(`[ping arrows] ${w}×${h}: one-ping frames on the lite set (may lie under a build control): ${liteFrames} of ${MODES.length * 2 * 36_001}`);
    }, 240_000);
  }

  it("a resize mid-ping (568 × 320 → 844 × 390): every bearing (0.5° steps), the arrow keeps every rule on the new screen at once", () => {
    for (let deg = 0; deg < 360; deg += 0.5) {
      const a = (deg * Math.PI) / 180;
      const m = new PingModel();
      const arrows = newPingArrows();
      m.show(1, 2, Math.cos(a) * R, Math.sin(a) * R, 0);
      for (const [w, h] of [
        [568, 320],
        [568, 320],
        [844, 390],
        [844, 390],
      ] as const) {
        const controls = waveControlRects(w, h, INSET, 1, newWaveControlRects());
        frame(m, w, h, controls, arrows);
        checkRules(arrows, w, h, controls, [0, a, 0, 0], `resize ${w}x${h} @${deg}°`);
      }
    }
  });

  it("allocates nothing per frame (the same objects every frame)", () => {
    const controls = waveControlRects(640, 360, INSET, 1, newWaveControlRects());
    const m = new PingModel();
    const arrows = newPingArrows();
    m.show(0, 0, R, 0, 0);
    const at0 = arrows.at[0];
    const avoid0 = arrows.avoid[3];
    frame(m, 640, 360, controls, arrows);
    expect(arrows.at[0]).toBe(at0);
    expect(arrows.avoid[3]).toBe(avoid0);
    expect(arrows.avoid[3]?.[PING_CONTROL_RECTS]).toBe(arrows.event);
    expect(arrows.avoid[3]?.[PING_CONTROL_RECTS + 1]).toBe(arrows.drawn[0]);
  });
});

/**
 * Re-review M1 / M2 (R3: stateful sweeps, jumps and oscillation): with the build and vote keep-offs, at 568 × 320 and
 * 640 × 360, with zero insets and with 44 / 21 insets — one ping swept at 0.01° both ways jumps > 40 px at most 3 times a
 * turn; oscillating across each jump (±0.01°, ±0.1°, ±0.5°) flips at most once; wobbling ±0.05° round every 0.1°
 * never flickers (at most one move > 40 px); every frame keeps every rule against the set it used (B16 lite or full).
 */
describe("Story 8.7 re-review M1 / M2: no flicker with the mode keep-offs", () => {
  const ZERO = { left: 0, right: 0, top: 0, bottom: 0 } as const;
  const MODES2: [string, PingKeepOffMode][] = [
    ["build", { build: true, ready: true, vote: false, wheel: false, wheelColumn: false, flag: null, loot: null }],
    ["vote", { build: false, ready: false, vote: true, wheel: false, wheelColumn: false, flag: null, loot: null }],
  ];
  for (const [w, h] of [[568, 320], [640, 360]] as const) {
    for (const [iname, ins] of [["zero insets", ZERO], ["insets 44/21", INSET]] as const) {
      for (const [name, mode] of MODES2) {
        it(`${w} × ${h}, ${iname}, ${name}`, () => {
          const base = waveControlRects(w, h, ins, 1, newWaveControlRects());
          const liteAll = newPingKeepOffs();
          const full = fillPingKeepOffs(base, mode, w, h, ins, 1, newPingKeepOffs(), liteAll);
          const at = (m: PingModel, arrows: PingArrows, deg: number) => {
            const a = (deg * Math.PI) / 180;
            m.show(0, 0, Math.cos(a) * R, Math.sin(a) * R, 0);
            placePingArrows(m, -w / 2, -h / 2, 1, w, h, ins, 1, full, null, arrows, liteAll);
            return arrows.at[0] as { x: number; y: number; angle: number };
          };
          const rules = (arrows: PingArrows, deg: number): void => {
            const p = arrows.at[0] as { x: number; y: number; angle: number };
            const r = eventArrowDrawnRect(p, PING_ARROW_CSS_PX, { x: 0, y: 0, w: 0, h: 0 });
            expect(r.x >= ins.left - 1e-6 && r.y >= ins.top - 1e-6 && r.x + r.w <= w - ins.right + 1e-6 && r.y + r.h <= h - ins.bottom + 1e-6, `@${deg}: safe area`).toBe(true);
            for (const o of arrows.lite[0] ? liteAll : full) if (o.w > 0) expect(overlaps(r, o), `@${deg}: overlaps a keep-off (${arrows.lite[0] ? "lite" : "full"})`).toBe(false);
            expect(rectCentreGap(r.x, r.y, r.w, r.h, w / 2, h / 2), `@${deg}: survivor`).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX - 1e-6);
            expect(angErr(Math.atan2(p.y - h / 2, p.x - w / 2), (deg * Math.PI) / 180), `@${deg}: bearing`).toBeLessThanOrEqual(EVENT_ARROW_MAX_BEARING_ERR_RAD + 1e-6);
          };
          const jumps: number[] = [];
          for (const dir of [1, -1]) {
            const m = new PingModel();
            const arrows = newPingArrows();
            let px = Number.NaN;
            let py = Number.NaN;
            let big = 0;
            for (let i = 0; i <= 36_000; i++) {
              const deg = (dir * i) / 100;
              const p = at(m, arrows, deg);
              rules(arrows, deg);
              if (!Number.isNaN(px) && Math.hypot(p.x - px, p.y - py) > 40) {
                big++;
                if (dir === 1) jumps.push(deg);
              }
              px = p.x;
              py = p.y;
            }
            // B16 (measured): at 568 × 320 in a build phase the lite set's two regions add their way in and out (4 a turn)
            expect(big, `jumps > 40 px in one turn (${dir > 0 ? "clockwise" : "anticlockwise"})`).toBeLessThanOrEqual(w === 568 && name === "build" ? 4 : 3);
          }
          for (const deg of jumps) {
            for (const amp of [0.01, 0.1, 0.5]) {
              const m = new PingModel();
              const arrows = newPingArrows();
              let flips = 0;
              let px = Number.NaN;
              let py = Number.NaN;
              for (let j = 0; j < 40; j++) {
                const p = at(m, arrows, deg + (j % 2 === 0 ? -amp : amp));
                if (!Number.isNaN(px) && Math.hypot(p.x - px, p.y - py) > 40) flips++;
                px = p.x;
                py = p.y;
              }
              expect(flips, `oscillating ±${amp}° round the jump at ${deg}°`).toBeLessThanOrEqual(1);
            }
          }
          let flicker = 0;
          for (let d10 = 0; d10 < 3600; d10++) {
            const m = new PingModel();
            const arrows = newPingArrows();
            let moves = 0;
            let px = Number.NaN;
            let py = Number.NaN;
            for (let j = 0; j < 20; j++) {
              const p = at(m, arrows, d10 / 10 + (j % 2 === 0 ? -0.05 : 0.05));
              if (!Number.isNaN(px) && Math.hypot(p.x - px, p.y - py) > 40) moves++;
              px = p.x;
              py = p.y;
            }
            if (moves > 1) flicker++;
          }
          expect(flicker, "bearings that flicker when wobbled ±0.05°").toBe(0);
        }, 240_000);
      }
    }
  }
});
