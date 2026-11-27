import { layoutBossBar } from "./bossBar";
import { layoutPingButton, HUD_BAND_GAP_CSS_PX, type HudInsets, type HudRect } from "./hudTopLayout";
import { MENU_BUTTON_INSET_CSS_PX, PING_CHIP_GAP_CSS_PX, PING_CHIP_H_CSS_PX, PING_CHIP_W_CSS_PX } from "../ui/sizes";

/**
 * Story 8.7 (AC 3, decision E8-P1 as built: decision 8.7 B5): the ping wheel — tap the ping button and the four chips
 * (icon over its word, ≥ 44 px) open under it; tap one to send and close; tap the button again or anywhere else to
 * close; it closes by itself after `PING_WHEEL_OPEN_MS`. Pure: no Phaser (the layout test and the wheel test import it).
 *
 * B5: the story's quarter circle (r 76 px, 15°–75°) puts the chip centres 26 px apart (they overlap), and any radius
 * that keeps 44 px chips apart crosses the survivor's 48 px clear zone at 568 × 320; the chips are a 2 × 2 block right
 * under the top band instead (Help! · Over here / Big one! · Ready, left → right, top → bottom = keys 1–4; right-aligned with ☰), below the boss bar's row so it never
 * covers it. While the wheel is open the right-hand buttons under it (swap, quick-use, the build bar, the action bar)
 * hide (≤ 3 s; the sticks keep working), so nothing pressable is ever under a chip.
 *
 * B5 amended (designer 2026-11-25, review L8): quick-use STAYS while the wheel is open (only swap and the build bar
 * hide). Whenever quick-use shows, the chips stand in one right-hand column under the ping button instead (`column`),
 * clear of it in a wave and in a build phase; the 2 × 2 block is used when quick-use is hidden (the vote).
 */
export { PING_WHEEL_OPEN_MS, closePingWheel, markPingSent, newPingWheelState, pickPing, pingCooldownFrac, stepPingWheel, togglePingWheel, type PingWheelState } from "./pingWheelState";

/** The 4 chips' rects (canvas px), in `PING_KINDS` order. */
export type PingChipRects = [HudRect, HudRect, HudRect, HudRect];
export function newPingChipRects(): PingChipRects {
  return [0, 1, 2, 3].map(() => ({ x: 0, y: 0, w: 0, h: 0 })) as PingChipRects;
}

const bossScratch = { x: 0, y: 0, w: 0, h: 0, barY: 0, barH: 0 };
const btnScratch: HudRect = { x: 0, y: 0, w: 0, h: 0 };

/**
 * The chips: a 2 × 2 block whose right edge is ☰'s right edge, its top a band gap under the lower of the ping button
 * and the boss bar's row. Read left → right, top → bottom (keys 1–4): Help! · Over here / Big one! · Ready.
 */
export function layoutPingWheel(width: number, insets: HudInsets, k: number, out: PingChipRects, column = false, height = Infinity): PingChipRects {
  const cw = PING_CHIP_W_CSS_PX * k;
  const ch = PING_CHIP_H_CSS_PX * k;
  const gap = PING_CHIP_GAP_CSS_PX * k;
  const right = width - (MENU_BUTTON_INSET_CSS_PX + insets.right) * k;
  const btn = layoutPingButton(width, insets, k, btnScratch);
  if (column) {
    // B5 as amended (designer 2026-11-25, L8): quick-use stays up while the wheel is open, so the chips stand in one
    // column right-aligned with ☰, from just under the ping button (x ≥ the ping button's middle: right of quick-use in
    // a wave and in a build phase, right of the boss bar), top → bottom = keys 1–4.
    // Story 10.5 (AC 4): under a tall top inset (47 px at 568 × 320) four chips with the usual gap would cross the
    // bottom inset: the gaps shrink to fit (≥ 2 px); the chips keep their 44 px.
    const top = btn.y + btn.h + HUD_BAND_GAP_CSS_PX * k;
    const g = height === Infinity ? gap : Math.max(2 * k, Math.min(gap, (height - insets.bottom * k - top - 4 * ch) / 3));
    for (let i = 0; i < 4; i++) {
      const r = out[i] as HudRect;
      r.w = cw;
      r.h = ch;
      r.x = right - cw;
      r.y = top + i * (ch + g);
    }
    return out;
  }
  const boss = layoutBossBar(width, insets.left, insets.top, insets.right, k, bossScratch);
  const top = Math.max(btn.y + btn.h, boss.y + boss.h) + HUD_BAND_GAP_CSS_PX * k;
  for (let i = 0; i < 4; i++) {
    const r = out[i] as HudRect;
    const col = 1 - (i % 2); // review L9: 1 = left column, so chips 1–4 read left → right, top → bottom
    const row = i >> 1;
    r.w = cw;
    r.h = ch;
    r.x = right - cw - col * (cw + gap);
    r.y = top + row * (ch + gap);
  }
  return out;
}

/** B5 amended (L8): the wheel stands in one column while the quick-use button shows (HudScene's rule for it). */
export function pingWheelColumn(m: { consumableVisible: boolean; consumableItem: string | null; voting: boolean }): boolean {
  return m.consumableVisible && m.consumableItem !== null && !m.voting;
}

/** The chip under canvas point (x, y), or −1. */
export function pingChipAt(chips: Readonly<PingChipRects>, x: number, y: number): number {
  for (let i = 0; i < 4; i++) {
    const r = chips[i] as HudRect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return i;
  }
  return -1;
}
