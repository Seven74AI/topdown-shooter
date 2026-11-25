import { buildingStats, footprint, segmentBoxEntryT, type Balance, type BotView, type Box } from "@topdown/shared";

/**
 * Investigation cut-test-stall-2026-11-25 (docs/investigations/cut-test-stall-2026-11-25.md): the cover a
 * bot can know over the wire. Barricades stop bullets (designer 2026-11-23) but not Spitter acid, so a
 * Spitter holds its spot behind one forever; a bot that fires at the nearest zombie through it never
 * ends the wave. `tools/bots` sees every building in the room state, so it knows the barricade lines
 * (`bulletBlockT`'s building tier) and the shared policy can aim at a clear zombie or strafe (rule 2c).
 * Map walls and cars are not modelled here: they stop acid too (`shotLineClear`), so no Spitter stands
 * off behind one, and the policy's old aim-at-the-nearest behaviour is kept for them. NOT game code.
 */

/** A placed building as the room state carries it (`BuildingStateView`'s fields used here). */
export interface WireBuilding {
  readonly type: string;
  readonly gx: number;
  readonly gy: number;
  readonly rot: number;
}

/** Refills `out` with the footprints of the buildings that stop bullets; returns how many (boxes are reused). */
export function bulletBoxes(balance: Balance, buildings: Iterable<WireBuilding>, out: Box[]): number {
  let n = 0;
  for (const b of buildings) {
    const stats = buildingStats(balance, b.type);
    if (!stats?.stopsBullets) continue;
    const box = out[n] ?? (out[n] = { minX: 0, minY: 0, maxX: 0, maxY: 0 });
    footprint(stats, b.gx, b.gy, b.rot, box);
    n++;
  }
  return n;
}

/** No bullet-stopping building between (x0, y0) and (x1, y1) (`bulletBlockT`'s building tier). */
export function wireLineClear(boxes: readonly Box[], count: number, x0: number, y0: number, x1: number, y1: number): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (let i = 0; i < count; i++) {
    const b = boxes[i] as Box;
    if (Math.max(x0, x1) < b.minX || Math.min(x0, x1) > b.maxX || Math.max(y0, y1) < b.minY || Math.min(y0, y1) > b.maxY) continue;
    if (segmentBoxEntryT(x0, y0, dx, dy, b.minX, b.minY, b.maxX, b.maxY) >= 0) return false;
  }
  return true;
}

/**
 * Fills `view.shotZombie` like `botViewFromWorld` does (the nearest zombie within my range with a clear
 * bullet line; any, for a launcher) from the horde positions, and sets `knowsCover`. `view.self` must be filled.
 */
export function fillWireShot(view: BotView, xs: ArrayLike<number>, ys: ArrayLike<number>, count: number, boxes: readonly Box[], boxCount: number): void {
  const me = view.self;
  view.knowsCover = true;
  view.shotZombie = null;
  const lobs = me.lobRangeM > 0;
  let best = me.rangeM * me.rangeM;
  for (let i = 0; i < count; i++) {
    const zx = xs[i] as number;
    const zy = ys[i] as number;
    const d2 = (zx - me.x) * (zx - me.x) + (zy - me.y) * (zy - me.y);
    if (d2 > best || (view.shotZombie !== null && d2 === best)) continue;
    if (!lobs && !wireLineClear(boxes, boxCount, me.x, me.y, zx, zy)) continue;
    best = d2;
    view.shot.x = zx;
    view.shot.y = zy;
    view.shot.distM = Math.sqrt(d2);
    view.shotZombie = view.shot;
  }
}
