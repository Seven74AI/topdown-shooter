import type { Balance } from "../config/balance";

/**
 * Story 6.3 (F3, DD5): the blackout flashlight. Every standing survivor has the free one
 * (`player.json › flashlight`, 60°, 8 m); a gear item with `coneDeg`/`rangeM` (the Tactical
 * flashlight, 80°, 12 m) replaces it while owned (the widest owned wins). Only the client draws it;
 * 6.4's fog uses `inFlashlightCone` with the same inputs, so "I see it in my beam" and "the fog
 * shows it in my beam" never disagree. Never read by the sim for gameplay (F8).
 */
export interface FlashlightCone {
  /** cos(half angle): the dot-product test's threshold. */
  readonly cosHalf: number;
  readonly rangeM: number;
  readonly halfAngleRad: number;
  /** Full cone angle (degrees; the client picks its 60° / 80° stamp by it). */
  readonly coneDeg: number;
}

interface ConeTable {
  readonly base: FlashlightCone;
  /** Per gear bit index: its cone (null: the item is no flashlight). */
  readonly byBit: readonly (FlashlightCone | null)[];
}

const tables = new WeakMap<Balance, ConeTable>();

function cone(coneDeg: number, rangeM: number): FlashlightCone {
  const halfAngleRad = (coneDeg * Math.PI) / 360;
  return Object.freeze({ cosHalf: Math.cos(halfAngleRad), rangeM, halfAngleRad, coneDeg });
}

function table(balance: Balance): ConeTable {
  let t = tables.get(balance);
  if (!t) {
    const f = balance.player.flashlight;
    const byBit: (FlashlightCone | null)[] = [];
    for (const id of Object.keys(balance.gear.items)) {
      const g = balance.gear.items[id];
      byBit.push(g && g.coneDeg !== undefined && g.rangeM !== undefined && g.coneDeg > 0 && g.rangeM > 0 ? cone(g.coneDeg, g.rangeM) : null);
    }
    t = Object.freeze({ base: cone(f.coneDeg, f.rangeM), byBit: Object.freeze(byBit) });
    tables.set(balance, t);
  }
  return t;
}

/** The flashlight of a survivor with the gear in `gearMask` (cached per balance; no allocation per call). */
export function flashlightOf(balance: Balance, gearMask: number): FlashlightCone {
  const t = table(balance);
  let best = t.base;
  for (let i = 0; i < t.byBit.length; i++) {
    const c = t.byBit[i];
    if (!c || (gearMask & (1 << i)) === 0) continue;
    if (c.coneDeg > best.coneDeg || (c.coneDeg === best.coneDeg && c.rangeM > best.rangeM)) best = c;
  }
  return best;
}

/**
 * Story 6.3: (x, y) is inside the cone from (px, py) along the facing (fx, fy) (any length > 0):
 * distance ≤ `rangeM` and the angle to the facing ≤ the half angle. Dot-product test, no trig.
 * The apex itself is inside; a zero facing sees nothing but the apex.
 */
export function inFlashlightCone(px: number, py: number, fx: number, fy: number, c: FlashlightCone, x: number, y: number): boolean {
  const dx = x - px;
  const dy = y - py;
  const d2 = dx * dx + dy * dy;
  if (d2 > c.rangeM * c.rangeM) return false;
  if (d2 === 0) return true;
  const f2 = fx * fx + fy * fy;
  if (f2 === 0) return false;
  const dot = dx * fx + dy * fy;
  const k = c.cosHalf * c.cosHalf * d2 * f2;
  if (c.cosHalf >= 0) return dot >= 0 && dot * dot >= k;
  return dot >= 0 || dot * dot <= k;
}
