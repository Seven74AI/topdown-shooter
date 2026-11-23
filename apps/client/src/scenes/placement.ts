import {
  BUILD_GRID_M,
  blockReason,
  buildingStats,
  cornerForCentre,
  createBlockReason,
  footprint,
  footprintH,
  footprintW,
  ownedCount,
  placementError,
  type Balance,
  type BuildingRotation,
  type BlockReason,
  type Box,
  type BuildingTypeStats,
  type PlaceError,
  type PlaceRequest,
  type World,
} from "@topdown/shared";
import { holdBuildingInput } from "../input/menuInput";
import type { MutablePlayerInput } from "../input/InputRouter";

/** Grid indices go on the wire as uint8. */
const MAX_GRID_INDEX = 255;
/** A move vector shorter than this leaves the carry facing as it was (the stick/keys already apply their dead zone). */
const MIN_FACING_LEN = 1e-6;
const DEG = Math.PI / 180;
const DIAGONAL_DEG = 45;
/** Story 5.18 (ux-spec §6.2): a pinned ghost whose centre leaves the view shrunk by this much (m) goes back to carry. */
export const PIN_VIEW_INSET_M = 1;
/** Story 5.18 (AC 2): the toast when the hand empties after a Place because the shown wallet can't pay another. */
export const CHAIN_MONEY_TEXT = "Not enough money for another";

/**
 * Story 5.18: what the placement step needs to know about this device's pending placements
 * (`PendingPlacements`): how many are counted, their total price, whether a box is on that ground.
 */
export interface PendingSet {
  readonly count: number;
  readonly money: number;
  overlaps(box: Readonly<Box>): boolean;
}

/**
 * Story 5.18 (AC 6, D2): a Place this device turns down without sending, because the pending boxes
 * make the server's answer certain: at the cap counting pending (`limit`), or — with a box pending —
 * a shown wallet below the price (`money`). With nothing pending a predicted refusal still sends
 * (5.15: the server judges). Cap before money, as `placementError`.
 */
export function placeGate(world: Readonly<World>, ownerId: string, price: number, pending: PendingSet | null): "limit" | "money" | null {
  const count = pending ? pending.count : 0;
  if (ownedCount(world, ownerId) + count >= world.balance.buildings.maxPerPlayer) return "limit";
  const wallet = world.players.get(ownerId)?.wallet ?? 0;
  if (count > 0 && wallet - (pending as PendingSet).money < price) return "money";
  return null;
}

/**
 * Story 5.18 (AC 3, D4): the chain jump for a footprint W × H at `rot`, as lattice steps into `out`.
 * A non-square footprint jumps along its long side by its length; a square one along the axis nearest
 * to the right of the facing (fx, fy) by its width; at least `minStepM`. The direction is the right of
 * the facing (screen y down: right of (fx, fy) is (−fy, fx)), +x / +y when the facing is square to it.
 */
export function chainOffset(w: number, h: number, fx: number, fy: number, minStepM: number, out: { dgx: number; dgy: number }): { dgx: number; dgy: number } {
  const rx = -fy;
  const ry = fx;
  let alongX: boolean;
  if (Math.abs(w - h) > 1e-9) alongX = w > h;
  else alongX = Math.abs(rx) >= Math.abs(ry);
  const proj = alongX ? rx : ry;
  const sign = proj < -1e-6 ? -1 : 1;
  const len = Math.max(alongX ? w : h, minStepM);
  const cells = Math.round(len / BUILD_GRID_M);
  out.dgx = alongX ? sign * cells : 0;
  out.dgy = alongX ? 0 : sign * cells;
  return out;
}

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
    case "not_for_sale":
      return "Not for sale yet";
    case "unknown_type":
    case "unknown_player":
      return "Can't build that";
  }
}

/** Review L4: an index the wire (uint8) can carry; an off-map ghost keeps its real index and is never sent. */
const onWireIndex = (i: number): boolean => i >= 0 && i <= MAX_GRID_INDEX;

/**
 * Story 5.15 (AC 6): the rotation that puts a non-square footprint's long side across the facing,
 * with the barricade's struts (rot 0 north, 1 east, 2 south, 3 west) on the builder's side:
 * facing north → 2, south → 0, east → 3, west → 1. `nsNow` is the current axis (true = the
 * facing counts as north/south); it switches only past the 45° diagonal by `hysteresisDeg`.
 * Returns the new axis in bit 2 (4 = north/south) and the rot in bits 0–1.
 */
export function autoRot(fx: number, fy: number, nsNow: boolean | null, hysteresisDeg: number): number {
  const fromX = Math.atan2(Math.abs(fy), Math.abs(fx)) / DEG; // 0 = east/west, 90 = north/south
  let ns: boolean;
  if (nsNow === null) ns = fromX >= DIAGONAL_DEG;
  else if (nsNow) ns = fromX >= DIAGONAL_DEG - hysteresisDeg;
  else ns = fromX > DIAGONAL_DEG + hysteresisDeg;
  const rot = ns ? (fy < 0 ? 2 : 0) : fx > 0 ? 3 : 1;
  return rot | (ns ? 4 : 0);
}

/**
 * Story 5.15 (AC 3): the carried ghost's centre along one axis: the survivor at `me`, a unit
 * facing (fx, fy), the footprint W × H at its rot; the near edge sits `gapM` beyond the body circle
 * (`bodyM`) along the facing (the box's half extent along the facing is (|fx|·W + |fy|·H) / 2).
 */
export function carryDistance(fx: number, fy: number, w: number, h: number, bodyM: number, gapM: number): number {
  return bodyM + gapM + (Math.abs(fx) * w + Math.abs(fy) * h) / 2;
}

/**
 * Story 5.15 (AC 5): the lattice index for a continuous min-corner coordinate `cornerM`, keeping
 * `current` until the corner is more than `hysteresisM` past the half-cell boundary (`current` NaN:
 * snap fresh to the nearest point, as `cornerForCentre` does). Indices may be negative (off the map).
 */
export function snapAxis(cornerM: number, current: number, hysteresisM: number): number {
  const c = cornerM / BUILD_GRID_M;
  if (Number.isFinite(current) && Math.abs(c - current) <= 0.5 + hysteresisM / BUILD_GRID_M) return current;
  return Math.round(c);
}

/**
 * Story 3.4 placement mode on this device; Story 5.15: the ghost is **carried** (Phaser-free, so it
 * is unit-tested). The scene starts it (`startPlacement`), calls `carry` once per frame with my
 * survivor as drawn and this frame's move input, feeds ⟳ / Place / ✕, and ends it when the phase
 * leaves the build, the wave number changes (review L3), the menu or shop opens or the run ends.
 * The ghost's near edge sits `controls.build.carryGapM` beyond my body along my last move direction,
 * its min corner on the 0.5 m lattice with a small hysteresis; non-square footprints turn their long
 * side across the facing until ⟳ locks the rotation. `check` runs the shared placement rules on the
 * World this device sees, so the ghost is green exactly when the server would accept it (others'
 * positions aside). No allocation per frame.
 */
export class Placement {
  active = false;
  type = "";
  /** Min corner, 0.5 m lattice indices (review L4: not clamped: past the map edge they go negative and the ghost shows there, red). */
  gx = 0;
  gy = 0;
  rot: BuildingRotation = 0;
  /** ⟳ was pressed for this held item: auto-rotate is off (🔒 on the button). */
  locked = false;
  /**
   * Story 5.18 (AC 4): the chain jump pinned the ghost: it stays put in the world while I walk, until
   * it leaves the view, I walk `chainUnpinWalkM` from where I placed, or (BX-5) the "↩ carry" chip.
   */
  pinned = false;
  /** Story 5.18: the last check failed only because it overlaps one of my pending boxes. */
  pendingOverlap = false;
  /** The unit carry facing: my last move direction (the survivor's facing at the start). */
  facingX = 1;
  facingY = 0;
  /** `world.waves.number` when placement started (review L3: a new wave or build ends it). */
  wave = 0;
  /** The shared check's answer for the current preview (null = valid), set by `check`. */
  error: PlaceError | null = null;
  /**
   * Story 5.17: why the current preview is `blocked` (the shared `blockReason`, the first cause and its
   * culprit), valid while `hasReason`; set by `explain`.
   */
  readonly reason: BlockReason = createBlockReason();
  hasReason = false;
  /**
   * Story 5.17 (AC 8, D2): what the player sees — the error and reason, held ≥ `reasonHoldMs` before
   * the look goes back to valid (a new error/reason shows at once; blocked never waits). The HUD,
   * the ghost and the culprit outline read these, never `error` directly.
   */
  shownError: PlaceError | null = null;
  readonly shownReason: BlockReason = createBlockReason();
  shownHasReason = false;
  /** Scene clock (ms) of the last frame the preview was blocked (review L1: valid needs `reasonHoldMs` of continuous clear). */
  shownSinceMs = 0;
  /** +1 whenever the shown error/reason changes (views redraw on it; no string per frame). */
  shownVersion = 0;
  /** One request object, filled by `confirm` (valid until the next call). */
  private readonly req: { type: string; gx: number; gy: number; rot: number } = { type: "", gx: 0, gy: 0, rot: 0 };
  private stats: Readonly<BuildingTypeStats> | null = null;
  private square = false;
  /** Auto-rotate's axis (true = north/south), null until the first carry of a hold. */
  private ns: boolean | null = null;
  /** False: the next snap is fresh, no hysteresis (start, rotation, a new footprint shape). */
  private snapped = false;
  private gapM = 1;
  private hysteresisM = 0.1;
  private rotHysteresisDeg = 10;
  private bodyM = 0.4;
  private lastX = 0;
  private lastY = 0;
  private holdMs = 250;
  private minStepM = 1;
  private unpinWalkM = 2;
  /** Where my survivor stood when the ghost was pinned (m). */
  private pinMeX = 0;
  private pinMeY = 0;
  private readonly step = { dgx: 0, dgy: 0 };
  private readonly corner = { gx: 0, gy: 0 };
  private readonly box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  /** Starts placing `type` during wave number `wave`'s build (an unknown type does nothing and returns false). */
  start(balance: Balance, type: string, x: number, y: number, facingX: number, facingY: number, wave = 0): boolean {
    const stats = buildingStats(balance, type);
    if (!stats) return false;
    const b = balance.controls.build;
    this.gapM = b.carryGapM;
    this.hysteresisM = b.snapHysteresisM;
    this.rotHysteresisDeg = b.autoRotateHysteresisDeg;
    this.holdMs = b.reasonHoldMs;
    this.minStepM = b.chainMinStepM;
    this.unpinWalkM = b.chainUnpinWalkM;
    this.bodyM = balance.player.radiusM;
    this.stats = stats;
    this.square = stats.widthM === stats.depthM;
    this.active = true;
    this.type = type;
    this.rot = 0;
    this.locked = false;
    this.pinned = false;
    this.pendingOverlap = false;
    this.ns = null;
    this.snapped = false;
    this.wave = wave;
    this.error = null;
    this.resetShown();
    const len = Math.sqrt(facingX * facingX + facingY * facingY);
    if (len > MIN_FACING_LEN && Number.isFinite(len)) {
      this.facingX = facingX / len;
      this.facingY = facingY / len;
    } else {
      this.facingX = 1;
      this.facingY = 0;
    }
    this.carry(x, y, 0, 0);
    return true;
  }

  /**
   * Once per frame: my survivor at (x, y) as drawn, this frame's move input (moveX, moveY). A
   * non-zero move turns the carry facing; at rest the last facing stays.
   */
  carry(x: number, y: number, moveX: number, moveY: number): void {
    const stats = this.stats;
    if (!this.active || !stats || !Number.isFinite(x) || !Number.isFinite(y)) return;
    this.lastX = x;
    this.lastY = y;
    const len = Math.sqrt(moveX * moveX + moveY * moveY);
    if (len > MIN_FACING_LEN && Number.isFinite(len)) {
      this.facingX = moveX / len;
      this.facingY = moveY / len;
    }
    if (this.pinned) {
      // Story 5.18 (AC 4, D3): walked away from the chain → back in my hands.
      const dx = x - this.pinMeX;
      const dy = y - this.pinMeY;
      if (this.unpinWalkM <= 0 || dx * dx + dy * dy <= this.unpinWalkM * this.unpinWalkM) return;
      this.unpin();
    }
    const fx = this.facingX;
    const fy = this.facingY;
    if (!this.square && !this.locked) {
      const r = autoRot(fx, fy, this.ns, this.rotHysteresisDeg);
      this.ns = (r & 4) !== 0;
      const rot = (r & 3) as BuildingRotation;
      if (rot !== this.rot) {
        if ((rot & 1) !== (this.rot & 1)) this.snapped = false; // a new footprint shape: snap fresh
        this.rot = rot;
      }
    }
    const w = footprintW(stats, this.rot);
    const h = footprintH(stats, this.rot);
    const d = carryDistance(fx, fy, w, h, this.bodyM, this.gapM);
    const cx = x + fx * d;
    const cy = y + fy * d;
    this.gx = snapAxis(cx - w / 2, this.snapped ? this.gx : Number.NaN, this.hysteresisM);
    this.gy = snapAxis(cy - h / 2, this.snapped ? this.gy : Number.NaN, this.hysteresisM);
    this.snapped = true;
  }

  /** ⟳: the next 90° step clockwise; auto-rotate is off for this held item; the carry gap is kept for the new footprint. */
  rotate(): void {
    const stats = this.stats;
    if (!this.active || !stats) return;
    if (this.pinned) {
      // Story 5.18 (AC 4): a pinned ghost turns around its own centre and stays pinned.
      const b = footprint(stats, this.gx, this.gy, this.rot, this.box);
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      this.rot = ((this.rot + 1) & 3) as BuildingRotation;
      this.locked = true;
      cornerForCentre(stats, this.rot, cx, cy, this.corner);
      this.gx = this.corner.gx;
      this.gy = this.corner.gy;
      return;
    }
    this.rot = ((this.rot + 1) & 3) as BuildingRotation;
    this.locked = true;
    this.snapped = false;
    this.carry(this.lastX, this.lastY, 0, 0);
  }

  /** Story 5.18: back to carry (the next `carry` puts the ghost ahead of me again, snapped fresh). */
  unpin(): void {
    if (!this.pinned) return;
    this.pinned = false;
    this.snapped = false;
  }

  /** Story 5.18 (AC 4): the ghost's centre is outside the view (m) shrunk by `PIN_VIEW_INSET_M`. NaN bounds: never. */
  outsideView(minX: number, minY: number, maxX: number, maxY: number): boolean {
    const stats = this.stats;
    if (!stats || !(maxX - minX > 2 * PIN_VIEW_INSET_M) || !(maxY - minY > 2 * PIN_VIEW_INSET_M)) return false;
    const b = footprint(stats, this.gx, this.gy, this.rot, this.box);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    return cx < minX + PIN_VIEW_INSET_M || cx > maxX - PIN_VIEW_INSET_M || cy < minY + PIN_VIEW_INSET_M || cy > maxY - PIN_VIEW_INSET_M;
  }

  /**
   * Story 5.18 (AC 3): after a Place, the next ghost jumps one footprint along (`chainOffset`) and is
   * pinned there, with my survivor at (x, y); if that spot is blocked (the pending-aware check) it
   * goes back to carry at once. Returns whether it stayed pinned.
   */
  chain(world: Readonly<World>, ownerId: string, pending: PendingSet | null, x: number, y: number): boolean {
    const stats = this.stats;
    if (!this.active || !stats) return false;
    const o = chainOffset(footprintW(stats, this.rot), footprintH(stats, this.rot), this.facingX, this.facingY, this.minStepM, this.step);
    this.gx += o.dgx;
    this.gy += o.dgy;
    this.pinned = true;
    this.pinMeX = x;
    this.pinMeY = y;
    this.lastX = x;
    this.lastY = y;
    this.check(world, ownerId, pending);
    if (this.error === "blocked") {
      this.unpin();
      this.carry(x, y, 0, 0);
      return false;
    }
    return true;
  }

  /**
   * Story 5.18: the request for the spot shown now, without ending holding (the chain keeps the item),
   * or null when inactive or off the wire (`onWire`). Valid until the next call.
   */
  request(): PlaceRequest | null {
    if (!this.active || !this.onWire()) return null;
    const r = this.req;
    r.type = this.type;
    r.gx = this.gx;
    r.gy = this.gy;
    r.rot = this.rot;
    return r;
  }

  /** The held type's price (0 when not holding). */
  get price(): number {
    return this.stats?.price ?? 0;
  }

  /** The ghost's footprint now (m), into a scratch box valid until the next call. */
  ghostBox(): Readonly<Box> | null {
    const stats = this.stats;
    return stats ? footprint(stats, this.gx, this.gy, this.rot, this.box) : null;
  }

  /** Review L4: the shown spot fits the wire's 0–255 lattice indices (an off-map ghost may not). */
  onWire(): boolean {
    return onWireIndex(this.gx) && onWireIndex(this.gy);
  }

  /**
   * Place: ends placement mode and returns the request to send for the spot shown now (the server
   * judges it), or null when inactive or when the spot can't go on the wire (off the map: `onWire`).
   */
  confirm(): PlaceRequest | null {
    if (!this.active) return null;
    this.active = false;
    if (!this.onWire()) return null;
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
    this.pinned = false;
    this.pendingOverlap = false;
    this.error = null;
    this.resetShown();
  }

  private resetShown(): void {
    this.hasReason = false;
    if (this.shownError !== null) this.shownVersion++;
    this.shownError = null;
    this.shownHasReason = false;
  }

  /**
   * Story 5.17: after `check`, the first cause of a `blocked` preview (`blockReason` on the same World
   * and box as `placementError`), then the hold (AC 8): a new error or reason shows at once; valid is shown only after `reasonHoldMs` of continuous clear (review L1: every
   * blocked frame restarts the clock, so a one-frame clear never flashes green).
   */
  explain(world: Readonly<World>, ownerId: string, nowMs: number): void {
    const stats = this.stats;
    this.hasReason = false;
    if (this.active && stats && this.error === "blocked") {
      this.hasReason = blockReason(world, ownerId, footprint(stats, this.gx, this.gy, this.rot, this.box), 0, this.reason) !== null;
      if (!this.hasReason && this.pendingOverlap) {
        // Story 5.18 (AC 5): only one of my pending boxes is there: "Overlaps a building" (id 0: no culprit outline; the box itself shows).
        const r = this.reason;
        r.cause = "building";
        r.index = -1;
        r.id = 0;
        r.playerId = "";
        this.hasReason = true;
      }
    }
    const e = this.active ? this.error : null;
    if (e !== null) {
      if (!this.sameAsShown(e)) {
        this.shownError = e;
        this.shownHasReason = this.hasReason;
        const r = this.reason;
        const s = this.shownReason;
        s.cause = r.cause;
        s.index = r.index;
        s.id = r.id;
        s.playerId = r.playerId;
        this.shownVersion++;
      }
      this.shownSinceMs = nowMs; // review L1: every blocked frame restarts the hold
    } else if (this.shownError !== null && nowMs - this.shownSinceMs >= this.holdMs) {
      this.shownError = null;
      this.shownHasReason = false;
      this.shownVersion++;
    }
  }

  private sameAsShown(e: PlaceError): boolean {
    if (e !== this.shownError || this.hasReason !== this.shownHasReason) return false;
    if (!this.hasReason) return true;
    const r = this.reason;
    const s = this.shownReason;
    return r.cause === s.cause && r.index === s.index && r.id === s.id && r.playerId === s.playerId;
  }

  /**
   * The shared placement check for the current preview (`error`); returns whether it is valid.
   * Story 5.18 (AC 5): with `pending`, my pending boxes count as built: owned + pending against the
   * cap, the shown wallet (wallet − their prices) against the price, their ground as occupied. Same
   * order as `placementError` (… → limit → money → blocked).
   */
  check(world: Readonly<World>, ownerId: string, pending: PendingSet | null = null): boolean {
    const r = this.req;
    r.type = this.type;
    r.gx = this.gx;
    r.gy = this.gy;
    r.rot = this.rot;
    this.pendingOverlap = false;
    let e = this.active ? placementError(world, ownerId, r) : null;
    const stats = this.stats;
    if (this.active && stats && pending && pending.count > 0 && (e === null || e === "money" || e === "blocked")) {
      const cap = world.balance.buildings.maxPerPlayer;
      const wallet = world.players.get(ownerId)?.wallet ?? 0;
      if (ownedCount(world, ownerId) + pending.count >= cap) e = "limit";
      else if (e !== "money" && wallet - pending.money < stats.price) e = "money";
      else if (e === null && pending.overlaps(footprint(stats, this.gx, this.gy, this.rot, this.box))) {
        e = "blocked";
        this.pendingOverlap = true;
      }
    }
    this.error = e;
    return this.error === null;
  }
}

/** Without a pending tracker (tests): whether the World alone says another can't be placed (cap, then money). */
function placementCapOrMoney(world: Readonly<World>, ownerId: string, price: number): "limit" | "money" | null {
  if (ownedCount(world, ownerId) >= world.balance.buildings.maxPerPlayer) return "limit";
  return (world.players.get(ownerId)?.wallet ?? 0) < price ? "money" : null;
}

/** The HUD fields the placement step reads and writes (`HudModel` has them all). */
export interface PlacementHud {
  placementActive: boolean;
  placementValid: boolean;
  placementLocked: boolean;
  placementHint: string;
  rotatePressed: boolean;
  confirmPressed: boolean;
  cancelPressed: boolean;
}

/** One frame's context for `stepPlacement` (the scene reuses one object: no allocation per frame). */
export interface PlacementFrame {
  /** Placement is possible now (build phase, run on screen, no menu/shop, my survivor standing). */
  can: boolean;
  /** `world.waves.number` now (review L3: a new wave or build ends holding). */
  wave: number;
  /** My survivor as last drawn (metres). */
  x: number;
  y: number;
  ownerId: string;
  /** "Wood barricade · $40" for the held type. */
  label: string;
  refusal: (e: PlaceError) => string;
  /** Sends the request (solo: applied at once; the server judges). */
  send: (req: PlaceRequest) => void;
  /** Shows a short message (an off-map Place that can't be sent). */
  toast: (text: string) => void;
  /** Story 5.17: the scene clock (ms) for the reason hold. */
  nowMs: number;
  /** Story 5.17: the reason line for a shown error (and its blocked reason, or null); called every blocked frame, so it caches its string by key (no allocation per frame). */
  hintText: (e: PlaceError, reason: Readonly<BlockReason> | null) => string;
  /** Story 5.18: my pending placements (null: none tracked; `send` then goes straight out). `send` adds to it. */
  pending?: PendingSet | null;
  /** Story 5.18: the camera's view (m); NaN: unknown (a pinned ghost then never leaves it). */
  viewMinX?: number;
  viewMinY?: number;
  viewMaxX?: number;
  viewMaxY?: number;
}

/**
 * Story 5.15 (review M1): placement mode for one frame, before the input goes to the host. In this
 * order: the cancel rules; while holding, `holdBuildingInput` (I keep walking: the move is kept,
 * aim and fire are not); ✕ puts it away; **Place sends the spot shown in the last frame, before
 * this frame's carry** (AC 10); ⟳ turns it; then the ghost is carried with my survivor as drawn and
 * this frame's move input, and the shared check colours it (the HUD's valid / hint / 🔒).
 */
export function stepPlacement(p: Placement, m: PlacementHud, input: MutablePlayerInput, world: Readonly<World>, f: PlacementFrame): void {
  if (p.active && (!f.can || f.wave !== p.wave)) p.cancel();
  const rotate = m.rotatePressed;
  const confirm = m.confirmPressed;
  const cancel = m.cancelPressed;
  m.rotatePressed = m.confirmPressed = m.cancelPressed = false;
  if (!p.active) {
    m.placementActive = false;
    return;
  }
  holdBuildingInput(input);
  if (cancel) {
    p.cancel();
    m.placementActive = false;
    return;
  }
  const pending = f.pending ?? null;
  if (confirm) {
    // Story 5.18: one Place = one building (AC 1); the item stays in hand while I can pay and build another (AC 2).
    const req = p.request();
    const gate = req ? placeGate(world, f.ownerId, p.price, pending) : null;
    if (!req || gate !== null) {
      // off the map: nothing the wire can carry, the shared rule says "blocked"; at the cap / short counting pending: certain refusals (D2)
      f.toast(f.refusal(req ? (gate as PlaceError) : "blocked"));
      p.cancel();
      m.placementActive = false;
      return;
    }
    f.send(req);
    const next = placeGate(world, f.ownerId, p.price, pending) ?? (pending ? null : placementCapOrMoney(world, f.ownerId, p.price));
    if (next !== null) {
      f.toast(next === "limit" ? f.refusal("limit") : CHAIN_MONEY_TEXT);
      p.cancel();
      m.placementActive = false;
      return;
    }
    p.chain(world, f.ownerId, pending, f.x, f.y); // the next ghost, pinned one footprint along (AC 3)
  }
  if (p.pinned && p.outsideView(f.viewMinX ?? Number.NaN, f.viewMinY ?? Number.NaN, f.viewMaxX ?? Number.NaN, f.viewMaxY ?? Number.NaN)) p.unpin(); // AC 4
  if (rotate) p.rotate();
  p.carry(f.x, f.y, input.moveX, input.moveY);
  p.check(world, f.ownerId, pending);
  p.explain(world, f.ownerId, f.nowMs); // Story 5.17: why it's red, held ≥ reasonHoldMs before valid
  m.placementActive = true;
  m.placementLocked = p.locked;
  const shown = p.shownError;
  m.placementValid = shown === null;
  m.placementHint = shown === null ? f.label : f.hintText(shown, p.shownHasReason ? p.shownReason : null);
}
