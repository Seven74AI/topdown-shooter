import type { LightSource } from "@topdown/shared";

/**
 * Story 5.10 (AC 11, D4): which floodlights get a glow pool this frame. Pure and allocation-free:
 * of the `floodlight` entries of the light list whose centre is in the view grown by `marginM`,
 * nearest the view centre first (ties: the lower building id, stable whatever the list order), at
 * most `max`, written into `out` (indexes into `lights`). A floodlight whose centre lies within
 * `mergeM` of one already picked shares that pool (it is skipped: the spot is already lit), so
 * stacking lamps can't multiply the overdraw (B13). Returns how many. Fires are `FireView`'s.
 *
 * O(n × max) with n ≤ 24 floodlights (the building cap): a selection by repeated minimum.
 */
export function pickDrawnLights(lights: readonly LightSource[], viewX: number, viewY: number, viewW: number, viewH: number, marginM: number, max: number, out: Int32Array, dist2: Float64Array, mergeM = 0): number {
  const cx = viewX + viewW / 2;
  const cy = viewY + viewH / 2;
  const x0 = viewX - marginM;
  const y0 = viewY - marginM;
  const x1 = viewX + viewW + marginM;
  const y1 = viewY + viewH + marginM;
  const cap = Math.min(max, out.length, dist2.length);
  const merge2 = mergeM * mergeM;
  let n = 0;
  // The last pick's (distance, id): the next pick is the nearest strictly after it in that order.
  let lastD = -1;
  let lastId = -1;
  while (n < cap) {
    let best = -1;
    let bestD = Infinity;
    let bestId = 0;
    for (let i = 0; i < lights.length; i++) {
      const l = lights[i] as LightSource;
      if (l.kind !== "floodlight") continue;
      if (l.x < x0 || l.x > x1 || l.y < y0 || l.y > y1) continue;
      const dx = l.x - cx;
      const dy = l.y - cy;
      const d = dx * dx + dy * dy;
      if (d < lastD || (d === lastD && l.buildingId <= lastId)) continue; // already passed
      if (d < bestD || (d === bestD && l.buildingId < bestId)) {
        best = i;
        bestD = d;
        bestId = l.buildingId;
      }
    }
    if (best < 0) break;
    lastD = bestD;
    lastId = bestId;
    const b = lights[best] as LightSource;
    let merged = false;
    for (let k = 0; k < n && !merged; k++) {
      const p = lights[out[k] as number] as LightSource;
      const ex = p.x - b.x;
      const ey = p.y - b.y;
      if (ex * ex + ey * ey < merge2) merged = true;
    }
    if (merged) continue;
    out[n] = best;
    dist2[n] = bestD;
    n++;
  }
  return n;
}
