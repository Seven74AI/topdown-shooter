import {
  BUILD_GRID_M,
  buildingStats,
  placementError,
  type Balance,
  type BuildingRotation,
  type PlaceError,
  type PlaceRequest,
  type World,
} from "@topdown/shared";

/** The preview starts on the grid point this far in front of the survivor (m; presentation only). */
export const PREVIEW_AHEAD_M = 2;
/** Grid indices go on the wire as uint8. */
const MAX_GRID_INDEX = 255;

/** Player text for a refused placement (Story 3.4; Story 3.3's contract). */
export function placeRefusalText(e: PlaceError, balance: Balance): string {
  switch (e) {
    case "blocked":
      return "Can't build here";
    case "limit":
      return `Building limit reached (${balance.buildings.maxPerPlayer})`;
    case "money":
      return "Not enough money";
    case "not_build_phase":
      return "Only during the build phase";
    case "unknown_type":
    case "unknown_player":
      return "Can't build that";
  }
}

const toGrid = (m: number): number => Math.min(MAX_GRID_INDEX, Math.max(0, Math.round(m / BUILD_GRID_M)));

/**
 * Story 3.4: placement mode on this device (Phaser-free, so it is unit-tested). The scene starts it
 * (`startPlacement`), feeds taps in world metres, ⟳ / ✓ / ✕, and ends it when the phase leaves the
 * build, the menu opens or the run ends. The preview's centre snaps to the 1 m grid (the same integer
 * grid point the server stores). `check` runs the shared placement rules on the World this device
 * sees, so the preview is green exactly when the server would accept it (others' positions aside).
 */
export class Placement {
  active = false;
  type = "";
  gx = 0;
  gy = 0;
  rot: BuildingRotation = 0;
  /** The shared check's answer for the current preview (null = valid), set by `check`. */
  error: PlaceError | null = null;
  /** One request object, filled by `confirm` (valid until the next call). */
  private readonly req: { type: string; gx: number; gy: number; rot: number } = { type: "", gx: 0, gy: 0, rot: 0 };

  /** Starts placing `type` (an unknown type does nothing and returns false). */
  start(balance: Balance, type: string, x: number, y: number, facingX: number, facingY: number): boolean {
    if (!buildingStats(balance, type)) return false;
    this.active = true;
    this.type = type;
    this.rot = 0;
    this.moveTo(x + facingX * PREVIEW_AHEAD_M, y + facingY * PREVIEW_AHEAD_M);
    this.error = null;
    return true;
  }

  /** A tap or drag at world (x, y): the preview's centre snaps to the nearest grid point. */
  moveTo(x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    this.gx = toGrid(x);
    this.gy = toGrid(y);
  }

  /** ⟳: the next 90° step. */
  rotate(): void {
    this.rot = ((this.rot + 1) & 3) as BuildingRotation;
  }

  /** ✓: ends placement mode and returns the request to send (the server judges it), or null when inactive. */
  confirm(): PlaceRequest | null {
    if (!this.active) return null;
    this.active = false;
    const r = this.req;
    r.type = this.type;
    r.gx = this.gx;
    r.gy = this.gy;
    r.rot = this.rot;
    return r;
  }

  /** ✕, the wave starting, the menu opening, game over. */
  cancel(): void {
    this.active = false;
    this.error = null;
  }

  /** The shared placement check for the current preview (`error`); returns whether it is valid. */
  check(world: Readonly<World>, ownerId: string): boolean {
    const r = this.req;
    r.type = this.type;
    r.gx = this.gx;
    r.gy = this.gy;
    r.rot = this.rot;
    this.error = this.active ? placementError(world, ownerId, r) : null;
    return this.error === null;
  }
}
