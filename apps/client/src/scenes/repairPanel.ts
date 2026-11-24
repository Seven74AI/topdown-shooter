import { buildingAtPoint, buildingById, buildingStats, repairCost, repairError, sellError, sellRefundFor, upgradeError, upgradeStep, type RepairError, type SellError, type UpgradeError, type World } from "@topdown/shared";
import { NOT_ALIVE_TEXT } from "./placement";

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
    case "not_alive":
      return NOT_ALIVE_TEXT;
    case "unknown_player":
      return "Can't repair that";
  }
}

/** Player text for a refused (or predicted-refused) upgrade (Story 5.9). */
export function upgradeRefusalText(e: UpgradeError): string {
  switch (e) {
    case "money":
      return "Not enough money";
    case "not_owner":
      return "Only its builder can upgrade it";
    case "not_upgradable":
      return "Already the strongest";
    case "not_build_phase":
      return "Only during the build phase";
    case "gone":
      return "That building is gone";
    case "not_alive":
      return NOT_ALIVE_TEXT;
    case "unknown_player":
      return "Can't upgrade that";
  }
}

/** Player text for a refused (or predicted-refused) take back / sell (Story 5.20). */
export function sellRefusalText(e: SellError): string {
  switch (e) {
    case "not_owner":
      return "Only its builder can sell it";
    case "not_build_phase":
      return "Only during the build phase";
    case "gone":
      return "That building is gone";
    case "not_alive":
      return NOT_ALIVE_TEXT;
    case "unknown_player":
      return "Can't sell that";
  }
}

/**
 * Story 5.20 (AC 8, for 5.21's action bar too): "Take back +$40" for a building I paid for in this
 * build phase only, else "Sell +$20" (the predicted refund; the server's answer is what lands).
 */
export function sellLabel(refund: number, takeBack: boolean): string {
  return `${takeBack ? "Take back" : "Sell"} +$${refund}`;
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
  /**
   * Story 5.9: the Upgrade button, shown only on MY buildings that have a next tier (or while my
   * upgrade is pending). `upgradeLabel` "Upgrade $50"; the next tier's name and HP are the info's
   * third line ("→ Reinforced barricade · 350 HP"); `upgradeReason` why it would be refused.
   */
  upgradeShown = false;
  upgradeLabel = "";
  upgradeReason = "";
  upgradeErrorNow: UpgradeError | null = null;
  /** Story 5.9 (brief 14): the type I asked to upgrade FROM; "Upgrading…" until the World's type differs (or a refusal clears it). */
  private pendingFrom: string | null = null;
  private shownPending = false;
  private shownType = "";
  private shownUpgradeError: UpgradeError | null | undefined = undefined;
  /**
   * Story 5.20 (AC 8): the Sell button, only on MY buildings (F3: absent on a teammate's). `sellLabel`
   * "Take back +$40" (all of it paid this build phase) or "Sell +$20" (the predicted refund);
   * `sellReason` why it would be refused now ("" = it would be accepted).
   */
  sellShown = false;
  sellLabelText = "";
  sellReason = "";
  sellErrorNow: SellError | null = null;
  private shownRefund = -1;
  private shownTakeBack: boolean | null = null;
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
    this.pendingFrom = null;
  }

  close(): void {
    this.id = 0;
    this.pendingFrom = null;
  }

  /** Story 5.9: Upgrade: the id to send (0 = nothing to send: closed, pending, or not mine). The panel stays open, pending. */
  pressUpgrade(world: Readonly<World>): number {
    if (this.id === 0 || this.pendingFrom !== null || !this.upgradeShown) return 0;
    const b = buildingById(world, this.id);
    if (!b) return 0;
    this.pendingFrom = b.type;
    return this.id;
  }

  /** Story 5.9: the server refused my upgrade (or solo did): no longer pending. */
  upgradeRefused(): void {
    this.pendingFrom = null;
  }

  /** Story 5.9: an upgrade is waiting for the World to show the new tier. */
  get upgradePending(): boolean {
    return this.pendingFrom !== null;
  }

  /** Story 5.20: Sell / Take back: the id to send (0 = nothing: closed, not mine, or refused now); the panel closes when it sends. */
  pressSell(): number {
    if (this.id === 0 || !this.sellShown || this.sellErrorNow !== null) return 0;
    const id = this.id;
    this.id = 0;
    return id;
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
  update(world: Readonly<World>, playerId: string, allowed: boolean, ownerName: (ownerId: string) => string, spentOn: (id: number) => number = () => 0): boolean {
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
    if (this.pendingFrom !== null && b.type !== this.pendingFrom) this.pendingFrom = null; // the state shows the new tier
    const pending = this.pendingFrom !== null;
    const step = b.ownerId === playerId ? upgradeStep(world, b.type) : null;
    this.upgradeErrorNow = step ? upgradeError(world, playerId, b.id) : null;
    this.upgradeShown = pending || step !== null;
    this.error = repairError(world, playerId, b.id);
    // Story 5.20: Sell on my own buildings; the refund the server will give (F2: the tier price is
    // everything paid, 5.9's ladder rule; what I paid this phase comes back whole).
    const mine = b.ownerId === playerId;
    this.sellShown = mine;
    this.sellErrorNow = mine ? sellError(world, playerId, b.id) : null;
    const paid = buildingStats(world.balance, b.type)?.price ?? 0;
    const spent = mine ? Math.min(paid, spentOn(b.id)) : 0;
    const refund = sellRefundFor(world.balance.buildings.sellShare, paid, spent);
    const takeBack = spent >= paid && paid > 0;
    if (refund !== this.shownRefund || takeBack !== this.shownTakeBack) {
      this.shownRefund = refund;
      this.shownTakeBack = takeBack;
      this.sellLabelText = sellLabel(refund, takeBack);
    }
    this.sellReason = this.sellErrorNow === null ? "" : sellRefusalText(this.sellErrorNow);
    const cost = repairCost(world.balance, b.type);
    const hp = Math.ceil(b.hp);
    if (
      b.id !== this.shownId ||
      hp !== this.shownHp ||
      b.maxHp !== this.shownMaxHp ||
      cost !== this.shownCost ||
      this.error !== this.shownError ||
      b.type !== this.shownType ||
      pending !== this.shownPending ||
      this.upgradeErrorNow !== this.shownUpgradeError
    ) {
      this.shownId = b.id;
      this.shownType = b.type;
      this.shownPending = pending;
      this.shownUpgradeError = this.upgradeErrorNow;
      this.shownHp = hp;
      this.shownMaxHp = b.maxHp;
      this.shownCost = cost;
      this.shownError = this.error;
      const name = buildingStats(world.balance, b.type)?.name ?? b.type;
      this.info = `${name}${mine ? "" : ` · ${ownerName(b.ownerId)}'s`}\nHP ${hp} / ${b.maxHp}`;
      this.label = `Repair $${cost}`;
      this.reason = this.error === null ? "" : repairRefusalText(this.error);
      const next = step ? buildingStats(world.balance, step.type) : undefined;
      if (next && step && !pending) this.info += `\n→ ${next.name} · ${next.hp} HP`;
      this.upgradeLabel = pending ? "Upgrading…" : step ? `Upgrade $${step.price}` : "";
      this.upgradeReason = pending || this.upgradeErrorNow === null ? "" : upgradeRefusalText(this.upgradeErrorNow);
    }
    return true;
  }
}
