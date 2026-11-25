import { describe, expect, it } from "vitest";
import { ACTION_IDS, layoutActionBar, newActionBarLayout } from "./actionBar";
import { BUILD_BAR_SLOTS, layoutBuildBar, newBuildBarLayout, readyLeftX } from "./buildBar";
import { CENTRE_CLEAR_CSS_PX, layoutRightButtons, newRightButtonsLayout, rectCentreGap } from "./consumableButton";
import { layoutHandCluster, newHandLayout } from "./handCluster";
import { layoutUndoChip } from "./undoChip";
import { bossBarHidden, layoutBossBanner, layoutBossBar } from "./bossBar";
import { hudFrameCssSize } from "../render/city/hudWarnArt";
import { EVENT_ARROW_MAX_BEARING_ERR_RAD, eventArrowDrawnRect, newWaveControlRects, placeEventArrow, waveControlRects } from "../render/eventArrow";
import { LOOT_FOUND_MINE } from "../render/lootBagCue";
import { WIDEST_LOOT_LINE, layoutLootLine, layoutPingButton } from "./hudTopLayout";
import { layoutPingWheel, newPingChipRects } from "./pingWheel";
import { BANNER_TEXT_PX, LINE_HEIGHT, WIDEST_WAVE_LINE, WIDEST_WAVE_LINE_COMPACT, fitWaveText, bannerWrapWidth, layoutBanner, layoutHpBar, layoutHpBlock, layoutHpRow, layoutMoneyLine, layoutWaveLine, placeWaveText } from "./hudTopLayout";
import { waveLine } from "./hudModel";
import { EVENT_ARROW_CSS_PX } from "../render/EventView";
import { PAIR_GAP_CSS_PX, createPairHold, placeSecondEventArrow } from "../render/eventArrowPair";
import { layoutEvacVote } from "../ui/voteModel"; // its CSS twin is cross-checked in tools/checks/evacVoteCss.test.ts
import { HELD_CHIPS, leaveRect } from "../ui/connectionModel"; // its CSS twin is cross-checked in tools/checks/heldChipsCss.test.ts
import { BOSS_BAR_NAME_CSS_PX, MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX, READY_BUTTON_BOTTOM_CSS_PX, READY_BUTTON_H_CSS_PX, READY_BUTTON_W_CSS_PX } from "../ui/sizes";

/**
 * EPIC 6 BRIEF line 31 — THE ONE HUD LAYOUT TEST (created by Story 6.3). Every on-screen control, in
 * every HUD mode, at 568 × 320 and 640 × 360 with safe-area insets 44 (sides) / 21 (bottom):
 * no two pressable controls overlap, all inside the safe area, every one keeps 48 px clear of the
 * survivor at the screen centre, and none is centred in the move-stick (left) half — beyond the
 * Epic 5 as-built baseline below.
 *
 * Epic 6 stories ADD their HUD here (6.5 boss bar, 6.8 event banners and markers' edge arrows,
 * 6.11 vote panel, 8.7 pings): add a rect to the mode it shows in. Don't check layout story by story.
 *
 * Baseline (Stories 5.15–5.21 as built and approved, kept by brief 27): on these small screens Ready
 * (40 px left of centre), the build bar's first tiles, the hand cluster's ⟳ / item chip / ↶ and the
 * action bar's Move / Upgrade come within 48 px of the centre or sit in the left half. 6.3 lists
 * them exactly (`KNOWN_LIST`) and marked them OPEN FOR DESIGNER; no overlap, nothing off the safe area.
 */
interface Box {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

const SIZES: readonly [number, number][] = [
  [568, 320],
  [640, 360],
];
const INSET = { left: 44, right: 44, top: 0, bottom: 21 } as const;
const K = 1; // CSS px (the layouts scale every number by dpr alike)

/** ☰ (Story 2.11, HudScene › layoutMenuButton): top right inside the safe area. */
function menu(w: number): Box {
  const s = MENU_BUTTON_CSS_PX * K;
  return { id: "menu", x: w - (MENU_BUTTON_INSET_CSS_PX + INSET.right) * K - s, y: (MENU_BUTTON_INSET_CSS_PX + INSET.top) * K, w: s, h: s };
}

/** Story 6.5: the boss bar block (name + HP bar), HudScene › BossHud via `layoutBossBar`. */
function bossBar(w: number): Box {
  const l = layoutBossBar(w, INSET.left, INSET.top, INSET.right, K, { x: 0, y: 0, w: 0, h: 0, barY: 0, barH: 0 });
  return { id: "boss_bar", x: l.x, y: l.y, w: l.w, h: l.h };
}

/**
 * Story 8.1: the held chips' box from `connectionModel.ts › HELD_CHIPS` (review L4: its CSS twin
 * `.held-chips` / `.held-chip` in overlay.css is cross-checked in tools/checks/heldChipsCss.test.ts;
 * ≤ 3 rows: 3 teammates). Top left under the money line: the top right is full of buttons on these
 * small screens; the chips aren't pressable (pointer-events: none).
 */
function heldChipsBox(): Box {
  return { id: "held_chips", x: INSET.left + HELD_CHIPS.leftPx, y: HELD_CHIPS.topPx, w: HELD_CHIPS.maxWidthPx, h: 3 * HELD_CHIPS.rowPx };
}

/** Story 8.7 (AC 2): the ping button, left of ☰ (HudScene draws it from `layoutPingButton`). */
function pingBtn(w: number): Box {
  return { id: "ping", ...layoutPingButton(w, INSET, K, { x: 0, y: 0, w: 0, h: 0 }) };
}
/** Story 8.7 (AC 3, B5): the open wheel's four chips (HudScene draws and hit-tests them from `layoutPingWheel`). */
function pingChips(w: number): Box[] {
  return layoutPingWheel(w, INSET, K, newPingChipRects()).map((r, i) => ({ id: `ping_chip${i}`, ...r }));
}

/** Every mode's pressable controls. */
function modes(w: number, h: number): Record<string, Box[]> {
  const bar = layoutBuildBar(w, h, INSET.right, INSET.bottom, K, newBuildBarLayout());
  const tiles: Box[] = Array.from({ length: BUILD_BAR_SLOTS }, (_, s) => ({ id: `tile${s}`, x: bar.x[s] as number, y: bar.y[s] as number, w: bar.tile, h: bar.tile }));
  const wave = layoutRightButtons(w, h, INSET.right, INSET.bottom, K, false, 0, 0, newRightButtonsLayout());
  const row = layoutRightButtons(w, h, INSET.right, INSET.bottom, K, true, bar.left, bar.top, newRightButtonsLayout(), bar.countX);
  const rw = READY_BUTTON_W_CSS_PX * K;
  const rh = READY_BUTTON_H_CSS_PX * K;
  const ready: Box = { id: "ready", x: readyLeftX(w, rw, bar.left, K), y: h - (READY_BUTTON_BOTTOM_CSS_PX + INSET.bottom) * K - rh, w: rw, h: rh };
  const undoBar = layoutUndoChip(w, h, INSET.right, INSET.bottom, bar.left, bar.top, bar.countX, K, false, { x: 0, y: 0, size: 0 });
  const undoHand = layoutUndoChip(w, h, INSET.right, INSET.bottom, bar.left, bar.top, bar.countX, K, true, { x: 0, y: 0, size: 0 });
  const hand = layoutHandCluster(w, h, INSET.right, INSET.bottom, K, newHandLayout(), INSET.top);
  const act = layoutActionBar(w, h, INSET.right, INSET.bottom, K, ACTION_IDS.map(() => true), newActionBarLayout());
  const sq = (id: string, x: number, y: number, s: number): Box => ({ id, x, y, w: s, h: s });
  return {
    // Story 6.5: the boss bar (top centre, shown in a wave while the Behemoth walks).
    // Story 8.7: the ping button shows in wave, build and vote (and while downed); never holding, with a building
    // selected (the action bar: decision 8.7 B9) or reconnecting.
    wave: [menu(w), pingBtn(w), sq("swap", wave.swapX, wave.swapY, wave.size), sq("consumable", wave.consX, wave.consY, wave.size), bossBar(w)],
    build: [menu(w), pingBtn(w), ...tiles, ready, sq("consumable", row.consX, row.consY, row.size), sq("swap", row.swapX, row.swapY, row.size), sq("undo", undoBar.x, undoBar.y, undoBar.size)],
    // Story 8.7 (B5): the wheel open — the right-hand buttons under it (swap, quick-use, build bar, action bar) hide.
    ping_wheel_wave: [menu(w), pingBtn(w), ...pingChips(w), bossBar(w)],
    ping_wheel_build: [menu(w), pingBtn(w), ...pingChips(w), ready, sq("undo", undoBar.x, undoBar.y, undoBar.size)],
    ping_wheel_vote: (() => {
      const v = layoutEvacVote(w, h, INSET.bottom);
      return [menu(w), pingBtn(w), ...pingChips(w), { id: "vote_extract", ...v.extract }, { id: "vote_stay", ...v.stay }];
    })(),
    holding: [
      menu(w),
      sq("place", hand.place.x, hand.place.y, hand.place.size),
      sq("rotate", hand.rotate.x, hand.rotate.y, hand.rotate.size),
      sq("cancel", hand.cancel.x, hand.cancel.y, hand.cancel.size),
      { id: "chip", x: hand.chip.x, y: hand.chip.y, w: hand.chip.w, h: hand.chip.h },
      sq("undo", undoHand.x, undoHand.y, undoHand.size),
    ],
    // Story 8.1 (D2, D4): the reconnecting / seat-kept panel is modal (it covers the HUD): its one control, Leave.
    reconnecting: [{ id: "link_leave", ...leaveRect(w, h, INSET.right, INSET.bottom) }],
    // Story 6.11 (EX1): the evacuation vote — the HUD's ☰ and the two buttons (the chips and ring are not pressable).
    vote: (() => {
      const v = layoutEvacVote(w, h, INSET.bottom);
      return [menu(w), pingBtn(w), { id: "vote_extract", ...v.extract }, { id: "vote_stay", ...v.stay }];
    })(),
    selected: [menu(w), ...act.rects.filter((r) => r.visible).map((r, i) => ({ id: `action_${ACTION_IDS[i]}`, x: r.x, y: r.y, w: r.w, h: r.h }))],
  };
}

const overlaps = (a: Box, b: Box): boolean => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * Every rule break of a layout, keyed by size, mode, control and rule, with its measure: the gap to
 * the centre (px) for "within 48 px of the centre", how far left of the centre line its middle is
 * (px) for "in the move-stick half", 1 for an overlap or leaving the safe area.
 */
function violations(w: number, h: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const [mode, boxes] of Object.entries(modes(w, h))) {
    for (const b of boxes) {
      if (b.x < INSET.left * K - 1e-6 || b.x + b.w > w - INSET.right * K + 1e-6 || b.y < 0 || b.y + b.h > h - INSET.bottom * K + 1e-6) out.set(`${w}x${h} ${mode} ${b.id}: outside the safe area`, 1);
      const gap = rectCentreGap(b.x, b.y, b.w, b.h, w / 2, h / 2);
      if (gap < CENTRE_CLEAR_CSS_PX * K - 1e-6) out.set(`${w}x${h} ${mode} ${b.id}: within 48 px of the centre`, gap);
      if (b.x + b.w / 2 < w / 2) out.set(`${w}x${h} ${mode} ${b.id}: in the move-stick half`, w / 2 - (b.x + b.w / 2));
    }
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i] as Box;
        const b = boxes[j] as Box;
        if (overlaps(a, b)) out.set(`${w}x${h} ${mode} ${a.id} overlaps ${b.id}`, 1);
      }
    }
  }
  return out;
}

/** Review M2: a baseline control may not get worse: its centre gap may not shrink, its move-half offset may not grow (px). */
const TOLERANCE_PX = 0.5;

/**
 * The Epic 5 HUD AS BUILT (designer-approved layouts, brief 27: Epic 6 doesn't move them) breaks the
 * brief-31 rules in exactly these places at these sizes (with the as-built gap or offset in px). 6.3 records them as the baseline (OPEN FOR
 * DESIGNER); the test fails on ANY other break, so a new control (boss bar, vote panel, banners,
 * arrows) must come in clean, and fixing one of these means deleting its line.
 */
const KNOWN_LIST: [string, number][] = [
  ["568x320 build tile0: within 48 px of the centre", 3],
  ["568x320 build tile1: within 48 px of the centre", 40.11],
  ["568x320 build ready: in the move-stick half", 120],
  ["568x320 holding rotate: within 48 px of the centre", 35.23],
  ["568x320 holding chip: within 48 px of the centre", 41.19],
  ["568x320 holding undo: in the move-stick half", 30],
  ["568x320 selected action_move: within 48 px of the centre", 36.06],
  ["568x320 selected action_move: in the move-stick half", 73],
  ["568x320 selected action_upgrade: within 48 px of the centre", 12],
  ["640x360 build tile0: within 48 px of the centre", 25.94],
  ["640x360 build ready: in the move-stick half", 84],
  ["640x360 holding chip: within 48 px of the centre", 45.18],
  ["640x360 selected action_move: within 48 px of the centre", 19],
  ["640x360 selected action_move: in the move-stick half", 37],
  ["640x360 selected action_upgrade: within 48 px of the centre", 21.47],
  // Story 6.11 (EX1 as picked: EXTRACT left of the ring) — designer decision 6.11 B1 "K: keep EX1". In a vote the
  // sticks are hidden, input is neutral and the server is frozen (D4); an accidental Extract is the
  // silent default and can be changed (D2).
  ["568x320 vote vote_extract: in the move-stick half", 118],
  ["640x360 vote vote_extract: in the move-stick half", 118],
  // Story 8.7: the same baseline lines in the open-wheel modes (the wheel leaves Ready and the vote buttons where they are).
  ["568x320 ping_wheel_build ready: in the move-stick half", 120],
  ["640x360 ping_wheel_build ready: in the move-stick half", 84],
  ["568x320 ping_wheel_vote vote_extract: in the move-stick half", 118],
  ["640x360 ping_wheel_vote vote_extract: in the move-stick half", 118],
];
const KNOWN_AS_BUILT = new Map<string, number>(KNOWN_LIST);

describe("ONE HUD LAYOUT TEST (EPIC 6 BRIEF line 31)", () => {
  for (const [w, h] of SIZES) {
    it(`${w} × ${h}: every mode's controls are listed, and nothing breaks a rule beyond the as-built baseline (which may not get worse)`, () => {
      const m = modes(w, h);
      for (const [mode, boxes] of Object.entries(m)) expect(boxes.length, mode).toBeGreaterThanOrEqual(mode === "reconnecting" ? 1 : 3); // liveness (8.1's modal panel has one control)
      const v = violations(w, h);
      expect([...v.keys()].filter((x) => !KNOWN_AS_BUILT.has(x)), "new HUD layout breaks").toEqual([]);
      for (const [k, now] of v) {
        const was = KNOWN_AS_BUILT.get(k) as number;
        if (k.endsWith("of the centre")) expect(now, `${k}: moved closer to the survivor`).toBeGreaterThanOrEqual(was - TOLERANCE_PX);
        else expect(now, `${k}: moved further into the move-stick half`).toBeLessThanOrEqual(was + TOLERANCE_PX);
      }
      expect([...KNOWN_AS_BUILT.keys()].filter((x) => x.startsWith(`${w}x${h} `) && !v.has(x)), "a baseline line no longer happens: delete it").toEqual([]);
    });
  }

  it("the baseline holds no overlap and nothing outside the safe area (only the centre gap and the move-stick half)", () => {
    for (const x of KNOWN_AS_BUILT.keys()) expect(x).toMatch(/: (within 48 px of the centre|in the move-stick half)$/);
  });

  it("Story 8.1: the held-teammate chips (CSS .held-chips: top left under the money line, ≤ 3 rows of 20 px, ≤ 170 px wide) overlap no control or HUD text block of any mode and keep 48 px clear of the survivor", () => {
    for (const [w, h] of SIZES) {
      const chips = heldChipsBox();
      for (const [mode, boxes] of Object.entries(modes(w, h))) {
        if (mode === "reconnecting") continue; // modal: covers everything
        for (const b of boxes) expect(overlaps(chips, b), `${w}x${h} ${mode} ${b.id}`).toBe(false);
      }
      const money = layoutMoneyLine(INSET, K, { x: 0, y: 0, w: 0, h: 0 });
      expect(chips.y).toBeGreaterThanOrEqual(money.y + money.h); // under the HP block and the money line
      expect(chips.x + chips.w).toBeLessThanOrEqual(w - INSET.right);
      expect(rectCentreGap(chips.x, chips.y, chips.w, chips.h, w / 2, h / 2)).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX); // clear of the survivor
    }
  });

  it("the baseline measures are recorded (no NaN)", () => {
    for (const [k, v] of KNOWN_AS_BUILT) expect(Number.isFinite(v), k).toBe(true);
  });

  it("Story 6.11 (T4, review L1): the vote row at 568×320 / 640×360 / 800×360 / 844×390 — ring between the buttons, ≥ 12 px gaps, 56 px tall, inside the safe area, clear of ☰ and the survivor", () => {
    for (const [w, h] of [...SIZES, [800, 360] as [number, number], [844, 390] as [number, number]]) {
      const v = layoutEvacVote(w, h, INSET.bottom);
      const boxes: Box[] = [
        { id: "extract", ...v.extract },
        { id: "ring", ...v.ring },
        { id: "stay", ...v.stay },
      ];
      expect(v.extract.h).toBeGreaterThanOrEqual(56);
      expect(v.stay.h).toBeGreaterThanOrEqual(56);
      // left to right with ≥ 12 px between neighbours (buttons never touch the ring or each other)
      for (let i = 1; i < boxes.length; i++) {
        const a = boxes[i - 1] as Box;
        const b = boxes[i] as Box;
        expect(b.x - (a.x + a.w), `${w}x${h} ${a.id} → ${b.id}`).toBeGreaterThanOrEqual(12);
      }
      for (const b of boxes) {
        expect(b.x).toBeGreaterThanOrEqual(INSET.left);
        expect(b.x + b.w).toBeLessThanOrEqual(w - INSET.right);
        expect(b.y + b.h).toBeLessThanOrEqual(h - INSET.bottom);
        expect(rectCentreGap(b.x, b.y, b.w, b.h, w / 2, h / 2), `${w}x${h} ${b.id}`).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX);
        expect(overlaps(b, menu(w)), `${w}x${h} ${b.id} vs ☰`).toBe(false);
      }
    }
  });

  // Story 6.14: the top band (not pressable, but read at a glance) — the HP bar, the HP row at its
  // widest, the money line, the wave line, the boss bar, ☰ and the centre banner — never overlap each
  // other and stay inside the safe area (568 × 320 had the HP bar over the wave line's start).
  for (const [w, h] of [...SIZES, [800, 360], [844, 390]] as const) {
    it(`Story 6.14: ${w} × ${h}: the HP bar, HP row, money line, wave line, boss bar, ☰ and the banners (1–3 lines, with and without the boss bar) never overlap; all inside the safe area`, () => {
      const r0 = (): Box => ({ id: "", x: 0, y: 0, w: 0, h: 0 });
      const top: Box[] = [
        menu(w),
        { ...layoutHpBar(INSET, K, r0()), id: "hp_bar" },
        { ...layoutHpRow(INSET, K, r0()), id: "hp_row" },
        { ...layoutMoneyLine(INSET, K, r0()), id: "money_line" },
        { ...layoutWaveLine(w, INSET, K, r0()), id: "wave_line" },
      ];
      const boss = bossBar(w);
      const inSafe = (b: Box): void => {
        expect(b.x, `${b.id} left`).toBeGreaterThanOrEqual(INSET.left * K - 1e-6);
        expect(b.x + b.w, `${b.id} right`).toBeLessThanOrEqual(w - INSET.right * K + 1e-6);
        expect(b.y, `${b.id} top`).toBeGreaterThanOrEqual(INSET.top * K - 1e-6);
        expect(b.y + b.h, `${b.id} bottom`).toBeLessThanOrEqual(h - INSET.bottom * K + 1e-6);
      };
      const apart = (list: Box[]): void => {
        for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) expect(overlaps(list[i]!, list[j]!), `${w}x${h}: ${list[i]!.id} overlaps ${list[j]!.id}`).toBe(false);
      };
      for (const b of [...top, boss]) inSafe(b);
      apart([...top, boss]);
      expect(boss.y + boss.h, "the boss bar stays in the upper third").toBeLessThan(h / 3);
      // The drawn wave text (a 10-wave line, an endless line, the widest one) stays inside its rect.
      const wave = top[4]!;
      // Story 8.7 (B3): beside the ping button a line that would drop under 11 px is drawn compact ("Wave 12 · 350 left").
      // Its width here: the full width × the compact/full length ratio of the widest strings (same font, same digits).
      const ratio = WIDEST_WAVE_LINE_COMPACT.length / WIDEST_WAVE_LINE.length;
      for (const textW of [150, 200, 261.5]) {
        const at = fitWaveText(w, INSET, K, textW, textW * ratio, { x: 0, scale: 1, compact: false });
        const drawnW = at.compact ? textW * ratio : textW;
        expect(at.x - (drawnW * at.scale) / 2, `wave text ${textW} px: left`).toBeGreaterThanOrEqual(wave.x - 1e-6);
        expect(at.x + (drawnW * at.scale) / 2, `wave text ${textW} px: right`).toBeLessThanOrEqual(wave.x + wave.w + 1e-6);
        expect(at.scale, "the wave line never under 11 px (16 px × 11/16)").toBeGreaterThanOrEqual(11 / 16);
        if (w >= 640) expect(at.compact, `${w} px: the full line fits`).toBe(false);
      }
      expect(placeWaveText(w, INSET, K, 150, { x: 0, scale: 1 }).scale, "a usual line needs no compact form").toBeGreaterThan(0.85);
      expect(waveLine({ wave: 10, remaining: 400, buildSecs: -1, endless: false, voting: false }).length).toBeLessThan(WIDEST_WAVE_LINE.length);
      // Banners: short / wide / the wrap width, 1–3 lines, with and without the boss bar.
      const wrap = bannerWrapWidth(w, INSET, K);
      let banners = 0;
      for (const textW of [90, 240, wrap]) {
        for (const lines of [1, 2, 3]) {
          for (const shown of [false, true]) {
            const r = layoutBanner(w, h, INSET, K, textW, lines * BANNER_TEXT_PX * LINE_HEIGHT * K, shown ? boss : null, r0());
            const b: Box = { ...r, id: `banner ${Math.round(textW)}px × ${lines}${shown ? " + boss" : ""}` };
            inSafe(b);
            apart([...top, ...(shown ? [boss] : []), b]);
            banners++;
          }
        }
      }
      expect(banners).toBe(18);
      // The boss arrival banner (P1 "THE BEHEMOTH", BossHud): under the boss bar (or, on a short screen, in its place
      // while the bar is hidden), clear of the whole top band, and ≥ 48 px from the survivor (review M2, brief 31).
      // review R7: also under a 20 px top inset (a notch or status bar on top)
      for (const insetTop of [INSET.top, 20]) {
        const ab = layoutBossBanner(w, h, INSET.left, insetTop, INSET.right, K, hudFrameCssSize("banner"), { x: 0, y: 0, w: 0, h: 0, barY: 0, barH: 0 });
        const arrival: Box = { x: ab.x, y: ab.y, w: ab.w, h: ab.h, id: `boss_arrival_banner (top inset ${insetTop})` };
        expect(arrival.y, "below the top inset").toBeGreaterThanOrEqual(insetTop * K - 1e-6);
        inSafe(arrival);
        if (insetTop === INSET.top) apart([...top, ...(ab.overBar ? [] : [boss]), arrival]);
        expect(rectCentreGap(arrival.x, arrival.y, arrival.w, arrival.h, w / 2, h / 2), `${w}x${h} inset ${insetTop}: the arrival banner keeps the survivor's 48 px`).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX * K - 1e-6);
        // the plate's words stay readable: it reads "THE BEHEMOTH" in 34 px Oswald 700 at full size, and at the floor
        // (35 % of its art) that's ≥ 11.9 px caps: at least the boss bar's own name (BOSS_BAR_NAME_CSS_PX, 11 px). The
        // tightest case is 568 × 320 under a 20 px top inset (41 %); without the inset every size keeps ≥ 60 %.
        expect(ab.w, "still readable").toBeGreaterThanOrEqual(hudFrameCssSize("banner").w * (insetTop === 0 ? 0.6 : 0.35) * K - 1e-6);
        expect(34 * (ab.w / hudFrameCssSize("banner").w)).toBeGreaterThanOrEqual(BOSS_BAR_NAME_CSS_PX);
      }
      // review R6: the bar hides only while the banner shows in its place
      expect(bossBarHidden(true, true, true)).toBe(true);
      expect(bossBarHidden(true, true, false)).toBe(false);
      expect(bossBarHidden(true, false, true)).toBe(false);
      expect(bossBarHidden(false, false, false)).toBe(true);
    });
  }

  // Story 7.12 (BF2, brief 31 / R11): the "Bag found!" / "<name> found a bag!" line with its bag icon
  // (the toast line), at its shortest, a usual name and the widest (16 × "W"), with and without the
  // boss bar: inside the safe area, off the HP block, money line, wave line, boss bar and ☰, text ≥ 11 px.
  for (const [w, h] of [...SIZES, [800, 360], [844, 390]] as const) {
    it(`Story 7.12: ${w} × ${h}: the loot line (icon + text) keeps off the top band and inside the safe area`, () => {
      const r0 = (): Box => ({ id: "", x: 0, y: 0, w: 0, h: 0 });
      const band: Box[] = [
        menu(w),
        { ...layoutHpBlock(INSET, K, r0()), id: "hp_block" },
        { ...layoutMoneyLine(INSET, K, r0()), id: "money_line" },
        { ...layoutWaveLine(w, INSET, K, r0()), id: "wave_line" },
        bossBar(w),
      ];
      // 18 px bold system-ui: ≈ 10 px per ordinary character, 17 px per "W" (Chromium measures less)
      const widths = [{ t: LOOT_FOUND_MINE, px: 95 }, { t: "Ana found a bag!", px: 150 }, { t: WIDEST_LOOT_LINE, px: 16 * 17 + 13 * 10 }];
      for (const [{ t, px }, shown] of widths.flatMap((x) => [[x, false], [x, true]] as const)) {
        const r = layoutLootLine(w, INSET, K, px * K, { x: 0, y: 0, w: 0, h: 0, scale: 1 }, shown ? band[4]! : null, h);
        const b: Box = { id: `loot line "${t}"${shown ? " (boss bar)" : ""}`, x: r.x, y: r.y, w: r.w, h: r.h };
        const others = shown ? band : band.slice(0, 4);
        expect(b.x, `${b.id} left`).toBeGreaterThanOrEqual(INSET.left * K - 1e-6);
        expect(b.x + b.w, `${b.id} right`).toBeLessThanOrEqual(w - INSET.right * K + 1e-6);
        expect(b.y + b.h, `${b.id} bottom`).toBeLessThanOrEqual(h - INSET.bottom * K + 1e-6);
        for (const o of others) expect(overlaps(b, o), `${w}x${h}: ${b.id} overlaps ${o.id}`).toBe(false);
        expect(rectCentreGap(b.x, b.y, b.w, b.h, w / 2, h / 2), `${b.id}: keeps the survivor's 48 px`).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX * K - 1e-6);
        expect(18 * r.scale, `${b.id}: text ≥ 11 px`).toBeGreaterThanOrEqual(11);
        if (px <= 150 && !shown) expect(r.scale).toBe(1);
      }
    });
  }

  it("the checks bite: a box at the centre is caught (self-check)", () => {
    expect(rectCentreGap(284 - 10, 160 - 10, 20, 20, 284, 160)).toBe(0);
    expect(overlaps({ id: "a", x: 0, y: 0, w: 10, h: 10 }, { id: "b", x: 5, y: 5, w: 10, h: 10 })).toBe(true);
  });
});

describe("Story 6.8 review M2 / re-review R1–R3: the event edge arrow (not pressable) in the one HUD layout test", () => {
  for (const [w, h] of SIZES) {
    it(`${w} × ${h}: at every angle (every 1°) the DRAWN arrow stays inside the safe area, off every wave control, the HP block and the wave line, ≥ 48 px from the survivor`, () => {
      const avoid = waveControlRects(w, h, INSET, K, newWaveControlRects());
      // the controls the wave mode lists (the arrow only shows in a wave; events never share it with the boss bar)
      const wave = modes(w, h).wave!.filter((b) => b.id !== "boss_bar");
      for (const c of avoid.slice(0, 3)) expect(wave.some((b) => Math.abs(b.x - c.x) < 1e-6 && Math.abs(b.y - c.y) < 1e-6 && Math.abs(b.w - c.w) < 1e-6), "the arrow avoids the controls the test lists").toBe(true);
      // keep-off rects (not pressable): the HP block and the wave line (re-review R1)
      const keepOff: Box[] = [
        { id: "hp_block", ...layoutHpBlock(INSET, K, { x: 0, y: 0, w: 0, h: 0 }) },
        { id: "wave_line", ...layoutWaveLine(w, INSET, K, { x: 0, y: 0, w: 0, h: 0 }) },
        { id: "money_line", ...layoutMoneyLine(INSET, K, { x: 0, y: 0, w: 0, h: 0 }) },
      ];
      const size = EVENT_ARROW_CSS_PX * K;
      const at = { x: 0, y: 0, angle: 0 };
      const drawn = { x: 0, y: 0, w: 0, h: 0 };
      let placed = 0;
      for (let deg = 0; deg < 360; deg += 1) {
        const a = (deg * Math.PI) / 180;
        expect(placeEventArrow(w / 2 + Math.cos(a) * 5000, h / 2 + Math.sin(a) * 5000, w, h, INSET, K, size, avoid, at)).toBe(true);
        placed++;
        const r = eventArrowDrawnRect(at, size, drawn); // re-review R3: the drawn disc + tip, not the 34 px box
        const box: Box = { id: `event_arrow@${deg}`, x: r.x, y: r.y, w: r.w, h: r.h };
        expect(box.x, box.id).toBeGreaterThanOrEqual(INSET.left * K - 1e-6);
        expect(box.x + box.w, box.id).toBeLessThanOrEqual(w - INSET.right * K + 1e-6);
        expect(box.y, box.id).toBeGreaterThanOrEqual(INSET.top * K - 1e-6);
        expect(box.y + box.h, box.id).toBeLessThanOrEqual(h - INSET.bottom * K + 1e-6);
        for (const c of [...wave, ...keepOff]) expect(overlaps(box, c), `${box.id} overlaps ${c.id}`).toBe(false);
        expect(rectCentreGap(box.x, box.y, box.w, box.h, w / 2, h / 2), `${box.id}: within 48 px of the survivor`).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX * K - 1e-6);
      }
      expect(placed).toBe(360);
      // on screen inside the safe rect: no arrow; inside the notch inset or under the HP block: an arrow (re-review R2)
      expect(placeEventArrow(w / 2, h / 2, w, h, INSET, K, size, avoid, at)).toBe(false);
      expect(placeEventArrow(INSET.left * K * 0.5, h / 2, w, h, INSET, K, size, avoid, at)).toBe(true);
      const hp = keepOff[0]!;
      expect(placeEventArrow(hp.x + hp.w / 2, hp.y + hp.h / 2, w, h, INSET, K, size, avoid, at)).toBe(true);
    });
  }
});

describe("Story 6.14 review L3: the event edge arrow keeps off the boss bar while it shows", () => {
  for (const [w, h] of [...SIZES, [800, 360], [844, 390]] as const) {
    it(`${w} × ${h}: every 1°, the drawn arrow is off the boss bar and keeps every 6.8 rule; bearing error logged`, () => {
      const boss = bossBar(w);
      const avoid = waveControlRects(w, h, INSET, K, newWaveControlRects(), boss);
      expect(avoid[6]).toMatchObject({ x: boss.x, y: boss.y, w: boss.w, h: boss.h });
      const wave = modes(w, h).wave!; // with the boss bar
      const keepOff: Box[] = [
        { id: "hp_block", ...layoutHpBlock(INSET, K, { x: 0, y: 0, w: 0, h: 0 }) },
        { id: "wave_line", ...layoutWaveLine(w, INSET, K, { x: 0, y: 0, w: 0, h: 0 }) },
        { id: "money_line", ...layoutMoneyLine(INSET, K, { x: 0, y: 0, w: 0, h: 0 }) },
      ];
      const size = EVENT_ARROW_CSS_PX * K;
      const at = { x: 0, y: 0, angle: 0 };
      const drawn = { x: 0, y: 0, w: 0, h: 0 };
      let worst = 0;
      for (let deg = 0; deg < 360; deg += 1) {
        const a = (deg * Math.PI) / 180;
        expect(placeEventArrow(w / 2 + Math.cos(a) * 5000, h / 2 + Math.sin(a) * 5000, w, h, INSET, K, size, avoid, at)).toBe(true);
        const r = eventArrowDrawnRect(at, size, drawn);
        const box: Box = { id: `event_arrow@${deg}`, x: r.x, y: r.y, w: r.w, h: r.h };
        expect(box.x, box.id).toBeGreaterThanOrEqual(INSET.left * K - 1e-6);
        expect(box.x + box.w, box.id).toBeLessThanOrEqual(w - INSET.right * K + 1e-6);
        expect(box.y, box.id).toBeGreaterThanOrEqual(INSET.top * K - 1e-6);
        expect(box.y + box.h, box.id).toBeLessThanOrEqual(h - INSET.bottom * K + 1e-6);
        for (const c of [...wave, ...keepOff]) expect(overlaps(box, c), `${box.id} overlaps ${c.id}`).toBe(false);
        expect(rectCentreGap(box.x, box.y, box.w, box.h, w / 2, h / 2), `${box.id}: within 48 px of the survivor`).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX * K - 1e-6);
        const d = Math.atan2(at.y - h / 2, at.x - w / 2) - a;
        worst = Math.max(worst, Math.abs(Math.atan2(Math.sin(d), Math.cos(d))));
      }
      (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[boss keep-off] ${w}×${h}: max bearing error ${((worst * 180) / Math.PI).toFixed(1)}°`);
      // At 568 × 320 the bar (y 60–85, 300 px) leaves no legal spot within 30° of straight up: the arrow takes
      // the nearest clear ray (36.7° measured) — keeping off the bar was preferred to the 30° cap (review L3).
      expect((worst * 180) / Math.PI, "max bearing error (°)").toBeLessThanOrEqual(w === 568 ? 37 : 30 + 1e-6);
    });
  }
});

describe("Story 6.10 review L11 / re-review RR1–RR2: the survivor's two edge arrows (NPC + flag) in the one HUD layout test", () => {
  const bearingErr = (at: { x: number; y: number; angle: number }, w: number, h: number): number => {
    const d = Math.atan2(at.y - h / 2, at.x - w / 2) - at.angle;
    return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
  };
  const maxErr: number[] = [];
  for (const [w, h] of SIZES) {
    it(`${w} × ${h}: every pair of bearings (5° steps; also 1°, 3°, 10°, 15.78°, 45°, 180° apart): both drawn arrows keep every rule, never overlap, each within 30° of its bearing`, () => {
      const avoid = waveControlRects(w, h, INSET, K, newWaveControlRects());
      const wave = modes(w, h).wave!.filter((b) => b.id !== "boss_bar");
      const keepOff: Box[] = [
        { id: "hp_block", ...layoutHpBlock(INSET, K, { x: 0, y: 0, w: 0, h: 0 }) },
        { id: "wave_line", ...layoutWaveLine(w, INSET, K, { x: 0, y: 0, w: 0, h: 0 }) },
      ];
      const size = EVENT_ARROW_CSS_PX * K;
      const npc = { x: 0, y: 0, angle: 0, side: 0 };
      const flag = { x: 0, y: 0, angle: 0, side: 0 };
      const hold = createPairHold();
      const rn = { x: 0, y: 0, w: 0, h: 0 };
      const rf = { x: 0, y: 0, w: 0, h: 0 };
      let pairs = 0;
      let worst = 0;
      const check = (r: { x: number; y: number; w: number; h: number }, id: string): void => {
        const box: Box = { id, x: r.x, y: r.y, w: r.w, h: r.h };
        expect(box.x, id).toBeGreaterThanOrEqual(INSET.left * K - 1e-6);
        expect(box.x + box.w, id).toBeLessThanOrEqual(w - INSET.right * K + 1e-6);
        expect(box.y, id).toBeGreaterThanOrEqual(INSET.top * K - 1e-6);
        expect(box.y + box.h, id).toBeLessThanOrEqual(h - INSET.bottom * K + 1e-6);
        for (const c of [...wave, ...keepOff]) expect(overlaps(box, c), `${id} overlaps ${c.id}`).toBe(false);
        expect(rectCentreGap(box.x, box.y, box.w, box.h, w / 2, h / 2), `${id}: within 48 px of the survivor`).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX * K - 1e-6);
      };
      for (let da = 0; da < 360; da += 5) {
        for (const db of [da, da + 1, da + 3, da + 10, da + 15.78, da + 45, da + 180]) {
          const a = (da * Math.PI) / 180;
          const b = (db * Math.PI) / 180;
          npc.side = 0;
          flag.side = 0;
          hold.side = 0;
          expect(placeEventArrow(w / 2 + Math.cos(a) * 5000, h / 2 + Math.sin(a) * 5000, w, h, INSET, K, size, avoid, npc)).toBe(true);
          expect(placeSecondEventArrow(w / 2 + Math.cos(b) * 5000, h / 2 + Math.sin(b) * 5000, w, h, INSET, K, size, avoid, npc, flag, hold)).toBe(true);
          eventArrowDrawnRect(npc, size, rn);
          eventArrowDrawnRect(flag, size, rf);
          check(rn, `npc_arrow@${da}`);
          check(rf, `flag_arrow@${db}`);
          expect(overlaps({ id: "n", ...rn }, { id: "f", ...rf }), `npc@${da} and flag@${db} overlap`).toBe(false);
          const e = bearingErr(flag, w, h);
          worst = Math.max(worst, e);
          expect(e, `flag@${db} (npc@${da}): bearing error`).toBeLessThanOrEqual(EVENT_ARROW_MAX_BEARING_ERR_RAD + 1e-9);
          pairs++;
        }
      }
      expect(pairs).toBe(72 * 7);
      maxErr.push((worst * 180) / Math.PI);
      (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[pair arrows] ${w}×${h}: max flag bearing error ${((worst * 180) / Math.PI).toFixed(1)}°`);
    });

    it(`${w} × ${h}: story 6.14 (6.9 RR2-1) — NPC every 6°, the flag swept ±40° past it at 0.01° both ways with state kept: never > 30° off its bearing, never overlapping, every rule kept`, () => {
      const avoid = waveControlRects(w, h, INSET, K, newWaveControlRects());
      const wave = modes(w, h).wave!.filter((b) => b.id !== "boss_bar");
      const keepOff: Box[] = [
        { id: "hp_block", ...layoutHpBlock(INSET, K, { x: 0, y: 0, w: 0, h: 0 }) },
        { id: "wave_line", ...layoutWaveLine(w, INSET, K, { x: 0, y: 0, w: 0, h: 0 }) },
        { id: "money_line", ...layoutMoneyLine(INSET, K, { x: 0, y: 0, w: 0, h: 0 }) },
      ];
      const size = EVENT_ARROW_CSS_PX * K;
      const rn = { x: 0, y: 0, w: 0, h: 0 };
      const rf = { x: 0, y: 0, w: 0, h: 0 };
      let worst = 0;
      let frames = 0;
      let bad = 0;
      let firstBad = "";
      const fail = (m: string): void => {
        bad++;
        if (!firstBad) firstBad = m;
      };
      for (let da = 0; da < 360; da += 6) {
        const npc = { x: 0, y: 0, angle: 0, side: 0 };
        const flag = { x: 0, y: 0, angle: 0, side: 0 };
        const hold = createPairHold();
        const a = (da * Math.PI) / 180;
        placeEventArrow(w / 2 + Math.cos(a) * 5000, h / 2 + Math.sin(a) * 5000, w, h, INSET, K, size, avoid, npc);
        eventArrowDrawnRect(npc, size, rn);
        for (const dir of [1, -1]) {
          for (let i = 0; i <= 8000; i++) {
            const db = da + dir * (-40 + i / 100);
            const b = (db * Math.PI) / 180;
            placeEventArrow(w / 2 + Math.cos(a) * 5000, h / 2 + Math.sin(a) * 5000, w, h, INSET, K, size, avoid, npc);
            placeSecondEventArrow(w / 2 + Math.cos(b) * 5000, h / 2 + Math.sin(b) * 5000, w, h, INSET, K, size, avoid, npc, flag, hold);
            frames++;
            eventArrowDrawnRect(npc, size, rn);
            eventArrowDrawnRect(flag, size, rf);
            const tag = `npc@${da} flag@${db.toFixed(2)}`;
            const e = bearingErr(flag, w, h);
            worst = Math.max(worst, e);
            if (e > EVENT_ARROW_MAX_BEARING_ERR_RAD + 1e-6) fail(`${tag}: ${((e * 180) / Math.PI).toFixed(2)}° off`);
            if (overlaps({ id: "n", ...rn }, { id: "f", ...rf })) fail(`${tag}: overlap`);
            if (rf.x < INSET.left * K - 1e-6 || rf.x + rf.w > w - INSET.right * K + 1e-6 || rf.y < INSET.top * K - 1e-6 || rf.y + rf.h > h - INSET.bottom * K + 1e-6) fail(`${tag}: outside the safe area`);
            for (const c of [...wave, ...keepOff]) if (overlaps({ id: "f", ...rf }, c)) fail(`${tag}: overlaps ${c.id}`);
            if (rectCentreGap(rf.x, rf.y, rf.w, rf.h, w / 2, h / 2) < CENTRE_CLEAR_CSS_PX * K - 1e-6) fail(`${tag}: within 48 px`);
          }
        }
      }
      (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[pair arrows] ${w}×${h}: stateful 0.01° sweep, ${frames} frames, max flag bearing error ${((worst * 180) / Math.PI).toFixed(2)}°`);
      expect(frames).toBe(60 * 2 * 8001);
      expect(bad, firstBad).toBe(0);
    }, 60_000);

    // Story 6.14 review M1 / L4: the fan fallback, forced. A 2 × 2 px keep-off dot on each of the 8
    // beside spots makes every one illegal, so a flag that clashes with the NPC arrow must use its fan.
    const besideDots = (npc: { x: number; y: number; angle: number }, size: number, base: readonly { x: number; y: number; w: number; h: number }[]) => {
      const rn = eventArrowDrawnRect(npc, size, { x: 0, y: 0, w: 0, h: 0 });
      const gap = PAIR_GAP_CSS_PX * K;
      const out = base.map((r) => ({ ...r }));
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as const) {
        for (const mult of [1, 2]) out.push({ x: npc.x + dx * (rn.w + gap) * mult - 1, y: npc.y + dy * (rn.h + gap) * mult - 1, w: 2, h: 2 });
      }
      return { rn, avoid: out };
    };

    it(`${w} × ${h}: story 6.14 review M1 — with every beside spot blocked, the fan skips rays whose spot would touch the NPC arrow (never overlaps; ≤ 30°)`, () => {
      const base = waveControlRects(w, h, INSET, K, newWaveControlRects());
      const size = EVENT_ARROW_CSS_PX * K;
      let fanUsed = 0;
      let nearestWouldTouch = 0;
      for (let da = 0; da < 360; da += 3) {
        const npc = { x: 0, y: 0, angle: 0, side: 0 };
        const a = (da * Math.PI) / 180;
        placeEventArrow(w / 2 + Math.cos(a) * 5000, h / 2 + Math.sin(a) * 5000, w, h, INSET, K, size, base, npc);
        const { rn, avoid } = besideDots(npc, size, base);
        for (const off of [-0.3, 0.2]) {
          const b = ((da + off) * Math.PI) / 180;
          const flag = { x: 0, y: 0, angle: 0, side: 0 };
          const hold = createPairHold();
          placeSecondEventArrow(w / 2 + Math.cos(b) * 5000, h / 2 + Math.sin(b) * 5000, w, h, INSET, K, size, avoid, npc, flag, hold);
          if (hold.side !== 9) continue; // a beside spot two steps out can still be legal elsewhere: only fan cases count
          fanUsed++;
          // the nearest fan ray's spot (6.8's placement half a degree off) touches the NPC arrow: the rule must skip it
          const near = { x: 0, y: 0, angle: 0, side: 0 };
          placeEventArrow(w / 2 + Math.cos(b + (0.5 * Math.PI) / 180) * 5000, h / 2 + Math.sin(b + (0.5 * Math.PI) / 180) * 5000, w, h, INSET, K, size, avoid, near);
          const rNear = eventArrowDrawnRect({ x: near.x, y: near.y, angle: b }, size, { x: 0, y: 0, w: 0, h: 0 });
          if (overlaps({ id: "a", ...rNear }, { id: "n", x: rn.x - 4, y: rn.y - 4, w: rn.w + 8, h: rn.h + 8 })) nearestWouldTouch++;
          const rf = eventArrowDrawnRect(flag, size, { x: 0, y: 0, w: 0, h: 0 });
          const tag = `npc@${da} flag@${(da + off).toFixed(1)}`;
          expect(overlaps({ id: "f", ...rf }, { id: "n", x: rn.x - PAIR_GAP_CSS_PX * K, y: rn.y - PAIR_GAP_CSS_PX * K, w: rn.w + 2 * PAIR_GAP_CSS_PX * K, h: rn.h + 2 * PAIR_GAP_CSS_PX * K }), `${tag}: the flag touches the NPC arrow`).toBe(false);
          expect(bearingErr(flag, w, h), `${tag}: bearing error`).toBeLessThanOrEqual(EVENT_ARROW_MAX_BEARING_ERR_RAD + 1e-6);
        }
      }
      expect(fanUsed, "liveness: the fan was used").toBeGreaterThan(20);
      expect(nearestWouldTouch, "the nearest fan ray would have touched the NPC arrow").toBeGreaterThan(10);
    });

    it(`${w} × ${h}: story 6.14 review L4 — the fan in use, the flag bearing jittering ±0.01° where the fan's side would flip: held, at most one flip`, () => {
      const base = waveControlRects(w, h, INSET, K, newWaveControlRects());
      const size = EVENT_ARROW_CSS_PX * K;
      let flips = 0;
      let frames = 0;
      let cases = 0;
      for (let da = 0; da < 360; da += 6) {
        const npc = { x: 0, y: 0, angle: 0, side: 0 };
        const a = (da * Math.PI) / 180;
        placeEventArrow(w / 2 + Math.cos(a) * 5000, h / 2 + Math.sin(a) * 5000, w, h, INSET, K, size, base, npc);
        const { avoid } = besideDots(npc, size, base);
        const put = (deg: number, flag: { x: number; y: number; angle: number; side: number }, hold: ReturnType<typeof createPairHold>): void => {
          const b = (deg * Math.PI) / 180;
          placeSecondEventArrow(w / 2 + Math.cos(b) * 5000, h / 2 + Math.sin(b) * 5000, w, h, INSET, K, size, avoid, npc, flag, hold);
        };
        // find where a fresh placement's fan side flips (sweep the flag past the NPC bearing, fresh state)
        let flipAt = Number.NaN;
        let lastSign = 0;
        for (let off = -3; off <= 3; off += 0.01) {
          const f = { x: 0, y: 0, angle: 0, side: 0 };
          const hd = createPairHold();
          put(da + off, f, hd);
          const sign = hd.side === 9 ? Math.sign(hd.fanRad) : 0;
          if (sign !== 0 && lastSign !== 0 && sign !== lastSign) {
            flipAt = da + off;
            break;
          }
          if (sign !== 0) lastSign = sign;
        }
        if (Number.isNaN(flipAt)) continue;
        cases++;
        const flips0 = flips;
        const flag = { x: 0, y: 0, angle: 0, side: 0 };
        const hold = createPairHold();
        let lx = Number.NaN;
        let ly = Number.NaN;
        for (let j = 0; j < 12; j++) {
          put(flipAt + (j % 2 === 0 ? -0.01 : 0.01), flag, hold);
          if (j > 0 && Math.hypot(flag.x - lx, flag.y - ly) > 10 * K) flips++;
          lx = flag.x;
          ly = flag.y;
          frames++;
        }
        // at most one flip (6.8 RR3-1's rule): the first frame past the boundary may move once, then it holds
        expect(flips - flips0, `npc@${da}: flips while jittering round ${flipAt.toFixed(2)}°`).toBeLessThanOrEqual(1);
      }
      expect(cases, "liveness: fan side flips found").toBeGreaterThan(5);
      expect(frames).toBe(cases * 12);
    }, 60_000);

    it(`${w} × ${h}: re-review RR2 — the flag bearing jittering ±0.01° round every 0.25° of a sweep past the NPC arrow never flips its spot frame to frame`, () => {
      const avoid = waveControlRects(w, h, INSET, K, newWaveControlRects());
      const size = EVENT_ARROW_CSS_PX * K;
      let flips = 0;
      let frames = 0;
      for (let da = 0; da < 360; da += 15) {
        const npc = { x: 0, y: 0, angle: 0, side: 0 };
        const flag = { x: 0, y: 0, angle: 0, side: 0 };
        const hold = createPairHold();
        const a = (da * Math.PI) / 180;
        for (let off = -20; off <= 20; off += 0.25) {
          let lastX = Number.NaN;
          let lastY = Number.NaN;
          for (let j = 0; j < 8; j++) {
            const b = ((da + off + (j % 2 === 0 ? 0.01 : -0.01)) * Math.PI) / 180;
            placeEventArrow(w / 2 + Math.cos(a) * 5000, h / 2 + Math.sin(a) * 5000, w, h, INSET, K, size, avoid, npc);
            placeSecondEventArrow(w / 2 + Math.cos(b) * 5000, h / 2 + Math.sin(b) * 5000, w, h, INSET, K, size, avoid, npc, flag, hold);
            if (j > 0 && Math.hypot(flag.x - lastX, flag.y - lastY) > 10 * K) flips++;
            lastX = flag.x;
            lastY = flag.y;
            frames++;
          }
        }
      }
      (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[pair arrows] ${w}×${h}: ${flips} flips in ${frames} jittering frames`);
      expect(frames).toBeGreaterThan(1000);
      expect(flips).toBe(0);
    });
  }
});

describe("Story 6.8 re-review 2 RR1: the edge arrow keeps its bearing and moves smoothly", () => {
  const CASES: [number, number, number][] = [];
  for (const k of [1, 3]) for (const [w, h] of [[568, 320], [640, 360], [800, 360], [844, 390]] as const) CASES.push([w, h, k]);
  const angErr = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
  for (const [cw, ch, k] of CASES) {
    it(`${cw} × ${ch} at k ${k}: every 0.1° both ways — bearing error ≤ 30°, every keep-off held, jumps > 40 px only where the legal spots part (≤ 3 per turn), none while jittering ±0.1°`, () => {
      const w = cw * k;
      const h = ch * k;
      const avoid = waveControlRects(w, h, INSET, k, newWaveControlRects());
      const size = EVENT_ARROW_CSS_PX * k;
      const drawn = { x: 0, y: 0, w: 0, h: 0 };
      const keepOff = avoid.map((r, i) => ({ id: `avoid${i}`, x: r.x, y: r.y, w: r.w, h: r.h }));
      let maxErr = 0;
      let maxSmoothJump = 0;
      let maxJump = 0;
      const check = (at: { x: number; y: number; angle: number }, tag: string): void => {
        const r = eventArrowDrawnRect(at, size, drawn);
        const box: Box = { id: tag, x: r.x, y: r.y, w: r.w, h: r.h };
        expect(box.x, tag).toBeGreaterThanOrEqual(INSET.left * k - 1e-6);
        expect(box.x + box.w, tag).toBeLessThanOrEqual(w - INSET.right * k + 1e-6);
        expect(box.y, tag).toBeGreaterThanOrEqual(INSET.top * k - 1e-6);
        expect(box.y + box.h, tag).toBeLessThanOrEqual(h - INSET.bottom * k + 1e-6);
        for (const c of keepOff) expect(overlaps(box, c), `${tag} overlaps ${c.id}`).toBe(false);
        expect(rectCentreGap(box.x, box.y, box.w, box.h, w / 2, h / 2), `${tag}: within 48 px`).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX * k - 1e-6);
      };
      for (const dir of [1, -1]) {
        const at = { x: 0, y: 0, angle: 0, side: 0 };
        let px = NaN;
        let py = NaN;
        let bigJumps = 0;
        for (let i = 0; i <= 3600 * 2; i++) {
          const deg = (dir * i) / 10;
          const a = (deg * Math.PI) / 180;
          expect(placeEventArrow(w / 2 + Math.cos(a) * 5000 * k, h / 2 + Math.sin(a) * 5000 * k, w, h, INSET, k, size, avoid, at)).toBe(true);
          const tag = `arrow@${deg.toFixed(1)}`;
          check(at, tag);
          const err = angErr(Math.atan2(at.y - h / 2, at.x - w / 2), a);
          maxErr = Math.max(maxErr, err);
          if (!Number.isNaN(px)) {
            const jump = Math.hypot(at.x - px, at.y - py) / k;
            if (jump > 40) bigJumps++;
            else maxSmoothJump = Math.max(maxSmoothJump, jump);
            maxJump = Math.max(maxJump, jump);
          }
          px = at.x;
          py = at.y;
        }
        // Jumps > 40 px happen only where the legal spots are cut apart or at a control's corner (the arrow
        // stays on its ray): at 568 × 320 the HP row reserve (RR3) reaches past the centre column and
        // meets the quick-use button, so straight up, up-right and right each need one; wider screens
        // need one at the swap / quick-use pair. One per place per turn — the hysteresis stops a flicker.
        expect(bigJumps, `jumps > 40 px over two turns (${dir > 0 ? "clockwise" : "anticlockwise"})`).toBeLessThanOrEqual(2 * 3);
        // jitter ±0.1° round every degree (+0.37°) after settling: no jump > 40 px (hysteresis)
        for (let deg0 = 0; deg0 < 360; deg0++) {
          const deg = deg0 + 0.37; // fractional angles (re-review 3 nit)
          const j = { x: 0, y: 0, angle: 0, side: 0 };
          let qx = NaN;
          let qy = NaN;
          for (const off of [0, 0.1, -0.1, 0.1, -0.1, 0]) {
            const a = ((deg + off) * Math.PI) / 180;
            placeEventArrow(w / 2 + Math.cos(a) * 5000 * k, h / 2 + Math.sin(a) * 5000 * k, w, h, INSET, k, size, avoid, j);
            if (!Number.isNaN(qx) && off !== 0) expect(Math.hypot(j.x - qx, j.y - qy) / k, `jitter round ${deg}°`).toBeLessThanOrEqual(40);
            qx = j.x;
            qy = j.y;
          }
        }
      }
      expect((maxErr * 180) / Math.PI, "max bearing error (°)").toBeLessThanOrEqual(30 + 1e-6);
      console.info(`RR1 ${cw}×${ch} k${k}: max bearing error ${((maxErr * 180) / Math.PI).toFixed(2)}°, max smooth step ${maxSmoothJump.toFixed(2)} CSS px, max jump ${maxJump.toFixed(1)} CSS px`);
    });
  }
});

describe("Story 6.8 re-review 3 RR3-1: no strobe where the arrow must jump", () => {
  const CASES: [number, number, number][] = [];
  for (const k of [1, 3]) for (const [w, h] of [[568, 320], [640, 360], [800, 360], [844, 390], [390, 844]] as const) CASES.push([w, h, k]);
  for (const [cw, ch, k] of CASES) {
    it(`${cw} × ${ch} at k ${k}: every jump > 40 px of a 0.01° sweep, crossed back and forth (±0.01°…±1°, 40 frames) or walked slowly with ±2 px noise, flips at most once`, () => {
      const w = cw * k;
      const h = ch * k;
      const avoid = waveControlRects(w, h, INSET, k, newWaveControlRects());
      const size = EVENT_ARROW_CSS_PX * k;
      const R = Math.hypot(w, h); // the event point just beyond the corner distance: off screen at every bearing
      const put = (deg: number, at: { x: number; y: number; angle: number; side?: number }, nx = 0, ny = 0): void => {
        const a = (deg * Math.PI) / 180;
        expect(placeEventArrow(w / 2 + Math.cos(a) * R + nx * k, h / 2 + Math.sin(a) * R + ny * k, w, h, INSET, k, size, avoid, at)).toBe(true);
      };
      // 1. find every jump of the fresh (stateless) placement
      const jumps: number[] = [];
      let freshErr = 0;
      const fresh = { x: 0, y: 0, angle: 0, side: 0 };
      let px = NaN;
      let py = NaN;
      for (let i = 0; i < 36000; i++) {
        fresh.side = 0;
        put(i / 100, fresh);
        if (!Number.isNaN(px) && Math.hypot(fresh.x - px, fresh.y - py) / k > 40) jumps.push(i / 100);
        const e = Math.atan2(fresh.y - h / 2, fresh.x - w / 2) - (i / 100) * (Math.PI / 180);
        freshErr = Math.max(freshErr, (Math.abs(Math.atan2(Math.sin(e), Math.cos(e))) * 180) / Math.PI);
        px = fresh.x;
        py = fresh.y;
      }
      const flips = (track: (frame: number) => [number, number, number], frames: number): number => {
        const at = { x: 0, y: 0, angle: 0, side: 0 };
        let n = 0;
        let qx = NaN;
        let qy = NaN;
        for (let f = 0; f < frames; f++) {
          const [deg, nx, ny] = track(f);
          put(deg, at, nx, ny);
          if (!Number.isNaN(qx) && Math.hypot(at.x - qx, at.y - qy) / k > 40) n++;
          qx = at.x;
          qy = at.y;
        }
        return n;
      };
      let worst = 0;
      let seed = 7;
      const noise = (): number => {
        seed = (seed * 1103515245 + 12345) % 2147483648;
        return (seed / 2147483648) * 4 - 2; // ±2 px
      };
      for (const j of jumps) {
        for (const amp of [0.01, 0.05, 0.2, 1]) {
          const n = flips((f) => [j + (f % 2 === 0 ? -amp : amp), 0, 0], 40);
          expect(n, `oscillating ±${amp}° across the jump at ${j.toFixed(2)}°`).toBeLessThanOrEqual(1);
          worst = Math.max(worst, n);
        }
        for (const dir of [1, -1]) {
          const n = flips((f) => [j + dir * (-3 + f * 0.05), noise(), noise()], 121);
          expect(n, `walking ${dir > 0 ? "up" : "down"} through the jump at ${j.toFixed(2)}° with ±2 px noise`).toBeLessThanOrEqual(1);
          worst = Math.max(worst, n);
        }
      }
      expect(freshErr).toBeLessThanOrEqual(30 + 1e-6);
      console.info(`RR3-1 ${cw}×${ch} k${k}: fresh max bearing error ${freshErr.toFixed(2)}°, fresh-placement jumps at [${jumps.map((d) => d.toFixed(2)).join(", ")}]°, worst flips ${worst}`);
    });
  }

  // Story 6.14 (6.8 re-review 4): the hold keeps last frame's spot only while it is still legal NOW
  // (`legalAt(prev…)`): a resize / rotation mid-hold must not leave the arrow where the old layout had it.
  for (const k of [1, 3]) {
    it(`a resize mid-hold at k ${k} (844 × 390 → 800 × 360, and a rotation to 390 × 844): every bearing (0.5° steps) — the drawn arrow keeps every rule on the new screen`, () => {
      const size = EVENT_ARROW_CSS_PX * k;
      const drawn = { x: 0, y: 0, w: 0, h: 0 };
      let checked = 0;
      for (const [[w0, h0], [w1, h1]] of [
        [[844, 390], [800, 360]],
        [[844, 390], [390, 844]],
      ] as const) {
        const avoid0 = waveControlRects(w0 * k, h0 * k, INSET, k, newWaveControlRects());
        const avoid1 = waveControlRects(w1 * k, h1 * k, INSET, k, newWaveControlRects());
        const keepOff = avoid1.map((r, i) => ({ id: `avoid${i}`, x: r.x, y: r.y, w: r.w, h: r.h }));
        for (let i = 0; i < 720; i++) {
          const a = ((i / 2) * Math.PI) / 180;
          const at = { x: 0, y: 0, angle: 0, side: 0 };
          const put = (w: number, h: number, avoid: ReturnType<typeof newWaveControlRects>): void => {
            const R = Math.hypot(w, h);
            expect(placeEventArrow(w / 2 + Math.cos(a) * R, h / 2 + Math.sin(a) * R, w, h, INSET, k, size, avoid, at)).toBe(true);
          };
          put(w0 * k, h0 * k, avoid0);
          put(w0 * k, h0 * k, avoid0); // held there (side 1)
          put(w1 * k, h1 * k, avoid1); // the screen changed between two frames
          const W = w1 * k;
          const H = h1 * k;
          const r = eventArrowDrawnRect(at, size, drawn);
          const tag = `${w0}×${h0} → ${w1}×${h1} arrow@${i / 2}`;
          expect(r.x, tag).toBeGreaterThanOrEqual(INSET.left * k - 1e-6);
          expect(r.x + r.w, tag).toBeLessThanOrEqual(W - INSET.right * k + 1e-6);
          expect(r.y, tag).toBeGreaterThanOrEqual(INSET.top * k - 1e-6);
          expect(r.y + r.h, tag).toBeLessThanOrEqual(H - INSET.bottom * k + 1e-6);
          for (const c of keepOff) expect(overlaps({ id: tag, ...r }, c), `${tag} overlaps ${c.id}`).toBe(false);
          expect(rectCentreGap(r.x, r.y, r.w, r.h, W / 2, H / 2), `${tag}: within 48 px`).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX * k - 1e-6);
          checked++;
        }
      }
      expect(checked).toBe(2 * 720);
    });
  }
});

/**
 * Story 8.7 (P6): the ping button and the open wheel at all four test sizes (568 × 320, 640 × 360, 800 × 360,
 * 844 × 390) and under a 20 px top inset: inside the safe area, off every other control of the modes they show in,
 * clear of the survivor's 48 px, in the right half; the chips ≥ 44 px and apart.
 */
describe("Story 8.7: the ping button and wheel at every test size", () => {
  for (const [w, h] of [...SIZES, [800, 360], [844, 390]] as const) {
    it(`${w} × ${h}`, () => {
      const m = modes(w, h);
      let checked = 0;
      for (const [mode, boxes] of Object.entries(m)) {
        const mine = boxes.filter((b) => b.id === "ping" || b.id.startsWith("ping_chip"));
        if (mode === "holding" || mode === "reconnecting" || mode === "selected") {
          expect(mine, `${mode}: no ping button`).toEqual([]);
          continue;
        }
        expect(mine.length, mode).toBe(mode.startsWith("ping_wheel") ? 5 : 1);
        for (const b of mine) {
          expect(b.x, `${mode} ${b.id} left`).toBeGreaterThanOrEqual(INSET.left);
          expect(b.x + b.w, `${mode} ${b.id} right`).toBeLessThanOrEqual(w - INSET.right + 1e-6);
          expect(b.y + b.h, `${mode} ${b.id} bottom`).toBeLessThanOrEqual(h - INSET.bottom);
          expect(Math.min(b.w, b.h), `${b.id} ≥ 44 px`).toBeGreaterThanOrEqual(44);
          expect(rectCentreGap(b.x, b.y, b.w, b.h, w / 2, h / 2), `${mode} ${b.id}: survivor`).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX);
          expect(b.x + b.w / 2, `${mode} ${b.id}: right half`).toBeGreaterThan(w / 2);
          for (const o of boxes) if (o !== b) expect(overlaps(b, o), `${w}x${h} ${mode}: ${b.id} overlaps ${o.id}`).toBe(false);
          checked++;
        }
      }
      expect(checked).toBe(3 + 3 * 5); // liveness: wave, build, vote + the three open-wheel modes
      // the band: the ping button keeps off the wave line and the boss bar keeps its 12 px gap to it
      const r0 = { x: 0, y: 0, w: 0, h: 0 };
      const wl = layoutWaveLine(w, INSET, K, { ...r0 });
      const p = pingBtn(w);
      expect(wl.x + wl.w, "wave line ends a band gap before the ping button").toBeLessThanOrEqual(p.x - 6 + 1e-6);
      const boss = bossBar(w);
      expect(overlaps(boss, p)).toBe(false);
      // under a 20 px top inset (a notch on top) the wheel still fits and keeps off the survivor
      const top = { ...INSET, top: 20 };
      for (const c of layoutPingWheel(w, top, K, newPingChipRects())) {
        expect(c.y + c.h).toBeLessThanOrEqual(h - top.bottom);
        expect(rectCentreGap(c.x, c.y, c.w, c.h, w / 2, h / 2)).toBeGreaterThanOrEqual(CENTRE_CLEAR_CSS_PX);
      }
    });
  }
});
