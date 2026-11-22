import { buildingAtPoint, buildingById, buildingStats, repairCost, repairError, type RepairError, type World } from "@topdown/shared";

/** A tap this close to a building (m, each side of its footprint) selects it: a 0.5 m barricade is thin under a finger. */
export const BUILDING_TAP_TOLERANCE_M = 0.4;

/** Player text for a refused (or predicted-refused) repair (Story 3.7). */
export function repairRefusalText(e: RepairError): string {
  switch (e) {
    case "money":
      return "Not enough money";
    case "full_hp":
      return "Nothing to repair";
    case "not_build_phase":
      return "Only during the build phase";
    case "gone":
      return "That building is gone";
    case "unknown_player":
      return "Can't repair that";
  }
}

/**
 * Story 3.7: the repair panel on this device (Phaser-free, so it is unit-tested). A tap selects the
 * building under it (or closes the panel on empty ground); `update` keeps it in step with the World
 * every frame (closed when repairs are not possible now or the building is gone) and rebuilds the
 * texts only when what they show changes; `press` returns the id to send and closes it. The Repair
 * check is the shared `repairError` on the World this device sees; the server has the last word.
 */
export class RepairPanel {
  /** The selected building's id, 0 = closed. */
  id = 0;
  /** "Wood barricade · Bo's" and "HP 100 / 200" on two lines. */
  info = "";
  /** "Repair $20". */
  label = "";
  /** Why the server would refuse it now ("" = it would accept). */
  reason = "";
  /** The predicted error behind `reason` (null = valid). */
  error: RepairError | null = null;
  /** What the texts show now (rebuilt only when one of these changes: no string per frame). */
  private shownId = 0;
  private shownHp = -1;
  private shownMaxHp = -1;
  private shownCost = -1;
  private shownError: RepairError | null | undefined = undefined;
  /** `world.waves.number` when the panel opened (a new wave closes it, even one a hidden tab slept through). */
  private openedAtWave = -1;

  get open(): boolean {
    return this.id !== 0;
  }

  /** A tap at world (x, y): selects the building there, or closes the panel when there is none. */
  tap(world: Readonly<World>, x: number, y: number): void {
    const b = Number.isFinite(x) && Number.isFinite(y) ? buildingAtPoint(world, x, y, BUILDING_TAP_TOLERANCE_M) : null;
    this.id = b ? b.id : 0;
    this.openedAtWave = world.waves.number;
  }

  close(): void {
    this.id = 0;
  }

  /** Repair: the id to send (0 when closed); the panel closes either way. */
  press(): number {
    const id = this.id;
    this.id = 0;
    return id;
  }

  /**
   * Once per frame. `allowed`: a build phase, a run on screen, no placement, shop or menu. `ownerName`
   * gives a teammate's display name (only called when the texts change). Returns whether it is open.
   */
  update(world: Readonly<World>, playerId: string, allowed: boolean, ownerName: (ownerId: string) => string): boolean {
    if (this.id === 0) return false;
    // A hidden tab can sleep through a whole wave (3.7 review): the panel belongs to one build phase.
    if (world.waves.number !== this.openedAtWave) {
      this.id = 0;
      return false;
    }
    const b = allowed ? buildingById(world, this.id) : undefined;
    if (!b) {
      this.id = 0; // repairs over for now, or destroyed meanwhile (Story 3.5)
      return false;
    }
    this.error = repairError(world, playerId, b.id);
    const cost = repairCost(world.balance, b.type);
    const hp = Math.ceil(b.hp);
    if (b.id !== this.shownId || hp !== this.shownHp || b.maxHp !== this.shownMaxHp || cost !== this.shownCost || this.error !== this.shownError) {
      this.shownId = b.id;
      this.shownHp = hp;
      this.shownMaxHp = b.maxHp;
      this.shownCost = cost;
      this.shownError = this.error;
      const mine = b.ownerId === playerId;
      const name = buildingStats(world.balance, b.type)?.name ?? b.type;
      this.info = `${name}${mine ? "" : ` · ${ownerName(b.ownerId)}'s`}\nHP ${hp} / ${b.maxHp}`;
      this.label = `Repair $${cost}`;
      this.reason = this.error === null ? "" : repairRefusalText(this.error);
    }
    return true;
  }
}
