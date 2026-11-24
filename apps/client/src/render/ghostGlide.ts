/**
 * Story 5.24 (AC 6, D8): a teammate's ghost glides to each new relayed spot instead of jumping at
 * 4 Hz. Phaser-free (tested); one state object per slot, no allocation.
 */

/** Glide time constant (ms): the drawn centre covers 1 − e^(−dt/τ) of the way per frame. */
export const GHOST_GLIDE_TAU_MS = 80;
/** A jump farther than this (m) snaps (a pin across the screen reads as a jump anyway). */
export const GHOST_SNAP_M = 6;

export interface GhostGlide {
  /** Drawn centre (m). */
  x: number;
  y: number;
  /** What it shows; −1 = hidden last frame (the next appearance snaps). */
  typeIdx: number;
  rot: number;
}

export const newGhostGlide = (): GhostGlide => ({ x: 0, y: 0, typeIdx: -1, rot: 0 });

/** Moves `g` toward the target centre (tx, ty) for a frame of `dtMs`; snaps on appear, type / rotation change or a far jump. */
export function glideGhost(g: GhostGlide, typeIdx: number, rot: number, tx: number, ty: number, dtMs: number): void {
  const far = Math.abs(tx - g.x) > GHOST_SNAP_M || Math.abs(ty - g.y) > GHOST_SNAP_M;
  if (g.typeIdx !== typeIdx || g.rot !== rot || far) {
    g.typeIdx = typeIdx;
    g.rot = rot;
    g.x = tx;
    g.y = ty;
    return;
  }
  const k = 1 - Math.exp(-Math.max(0, dtMs) / GHOST_GLIDE_TAU_MS);
  g.x += (tx - g.x) * k;
  g.y += (ty - g.y) * k;
}

/** The ghost went (hidden): its next appearance snaps. */
export function hideGhostGlide(g: GhostGlide): void {
  g.typeIdx = -1;
}

/** "Bo · Auto-turret"; "Teammate · …" when the name is empty. */
export function ghostLabel(name: string, buildingName: string): string {
  return `${name || "Teammate"} · ${buildingName}`;
}
