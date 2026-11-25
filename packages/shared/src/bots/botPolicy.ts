import { EVENT_KINDS, EVENT_PHASE, NPC_STATE } from "../events/eventState";
import { weaponIds } from "../combat/weapons";
import { crateRefusal } from "../economy/shop";
import type { Balance } from "../config/balance";
import type { World } from "../core/world";
import { activeSlot } from "../combat/loadout";
import type { PlayerInput } from "../net/input";
import type { PlayerState, PlayerStatus } from "../player/player";
import { MAX_PLAYERS } from "../net/messages";
import { MUZZLE_OFFSET_M } from "../config/constants";
import { zombieTypeOf } from "../zombies/zombiePool";
import { isRushState } from "../zombies/zombieTypes";
import { bulletLineClear } from "../combat/cover";
import { bossBodyOn } from "../boss/bossState";
import { flowCellAt, flowCellCenterX, flowCellCenterY, flowEdgeClosed } from "../zombies/flowField";
import { consumableStats } from "../economy/consumables";

/**
 * A simple bot (Story 2.10, AC 5) for load tests (2.10), economy runs (3.10, 6.1) and balance
 * sweeps (10.8). Pure and deterministic: the same view gives the same input (no RNG, no clock),
 * and nothing is allocated per call. A view is built from a World (`botViewFromWorld`, headless
 * runs) or from net state (`tools/bots`, a real room).
 *
 * Decision order (the first that applies):
 * 1. a downed teammate within `reviveSearchM`: move to them, stop within `reviveStopM` (standing
 *    there revives them, Story 2.8);
 * 2. a zombie closer than `keepDistanceM`: back away from it;
 * 2b. (Story 5.6) the nearest zombie is a Spitter holding its spot just beyond my weapon's range (≤ `closeInExtraM` more): step toward it;
 * 3. farther than `regroupDistM` from the centre of the alive team: move toward it;
 * 4. (Epic 5 balance pass) the nearest zombie is one of the wave's last, marked rushers and out of my
 *    range: walk toward it (players see the marks and hunt them; a rusher wedged in a gap would
 *    otherwise never end the wave);
 * 5. otherwise stand still.
 *
 * 2c. (barricades stop bullets, designer 2026-11-23) the nearest zombie is in range but every zombie
 *    in range is behind cover: strafe sideways (90° left of it) to open a line.
 *
 * Always: aim at the nearest zombie I can hit (`shotZombie`: a clear bullet line, or any for a
 * launcher, whose lob flies over barricades) and fire while it is within the weapon's range.
 * A view that doesn't know cover (`knowsCover` false: `tools/bots` over the wire) aims at the nearest. `isMouse` is
 * false, so the bot gets aim assist like a phone player. It never swaps. Ready is tapped by the
 * client (`lobby.set_ready`), not here. Story 3.10: `shoppingList` is bought in each build phase
 * by `bots/botShop.ts` (headless `botBuildPhase`, and `tools/bots` over the wire), not here.
 */

export interface BotSelf {
  x: number;
  y: number;
  status: PlayerStatus;
  /** Range of the active weapon (m). */
  rangeM: number;
  /**
   * Story 5.5: with a launcher in hand, its lob range and shortest lob (m) and the muzzle offset
   * (body radius + muzzle): the aim's length then carries the target's distance (FR-A). 0 = not a launcher.
   */
  lobRangeM: number;
  minLobM: number;
  muzzleM: number;
  /** Story 5.12: HP now and max (the medkit rule). */
  hp: number;
  maxHp: number;
  /** Story 5.12: what my slot holds (null: empty) and a throwable's range (m; 0 = not a throwable). */
  consumableKind: "heal" | "grenade" | "molotov" | null;
  throwRangeM: number;
}

export interface BotMate {
  x: number;
  y: number;
  status: PlayerStatus;
}

export interface BotZombie {
  x: number;
  y: number;
  distM: number;
  /** Story 5.6 review M2: a stand-off zombie holding its spot (a Spitter, not rushing); false otherwise / unknown. */
  holdsSpot?: boolean;
  /** Epic 5 balance pass: one of the wave's last, marked zombies (FR30 rush); false otherwise / unknown. */
  rushing?: boolean;
  /** Story 6.5: the target is the Behemoth (measured to its body's edge). */
  boss?: boolean;
}

/** What a bot can know. Preallocated by `createBotView`; filled in place each tick. */
export interface BotView {
  readonly self: BotSelf;
  /** Teammates `[0, teammateCount)`; the array keeps MAX_PLAYERS − 1 reusable entries. */
  readonly teammates: readonly BotMate[];
  teammateCount: number;
  /** Points at `zombie` when there is one, else null. */
  nearestZombie: BotZombie | null;
  /** Storage for the nearest zombie. */
  readonly zombie: BotZombie;
  /** True when `shotZombie` is filled (a World view); false: aim at `nearestZombie` (net view). */
  knowsCover: boolean;
  /** The nearest zombie within my range with a clear bullet line (any, for a launcher), else null. */
  shotZombie: BotZombie | null;
  /** Storage for `shotZombie`. */
  readonly shot: BotZombie;
  /**
   * Story 5.12: in a wave with a throwable in my slot, the zombie (within throw range) with the most
   * zombies within the item's radius, when that is at least `throwClusterMin`; else null.
   */
  throwTarget: BotZombie | null;
  readonly cluster: BotZombie;
  /**
   * Story 6.5: the way to the Behemoth (a World view only): the step toward it along the nav grid
   * (round barriers and cover), or 0, 0 when unknown. Rule 4 walks it instead of the straight line.
   */
  huntStepX: number;
  huntStepY: number;
  /**
   * Story 6.8 (AC 14): I stand in a stampede's lane while it warns or runs: the way out (sideways, to
   * the nearer edge), or 0, 0. A World view only.
   */
  laneOutX: number;
  laneOutY: number;
  /**
   * Stories 6.9 / 6.10 (sim liveness): an event errand — the landed crate (the nearest standing bot
   * that may take it) or the survivor (the nearest bot walks to it; its leader walks to the flag).
   * The direction to walk, or 0, 0. A World view only.
   */
  errandX: number;
  errandY: number;
  /** The errand says: stand still (on the crate; waiting for the survivor to catch up). */
  errandStop: boolean;
}

export interface BotConfig {
  keepDistanceM: number;
  /** Story 5.6: close in on a nearest zombie up to this far beyond my range (0: never). */
  closeInExtraM?: number;
  regroupDistM: number;
  reviveSearchM: number;
  reviveStopM: number;
  /** Story 3.10: shop item ids bought in this order in each build phase (`bots/botShop.ts`). */
  shoppingList?: readonly string[];
  /** Story 6.8: rule 2c's strafe side flip, in input seqs (absent: 64). */
  strafeFlipSeqs?: number;
  /** Story 5.12 (absent: 0.4 / 5). */
  medkitBelowHpFrac?: number;
  throwClusterMin?: number;
}

/** The bot numbers from `config/balance/bots.json`. */
export const botConfigOf = (balance: Balance): BotConfig => balance.bots;

export function createBotView(): BotView {
  const teammates: BotMate[] = [];
  for (let i = 0; i < MAX_PLAYERS - 1; i++) teammates.push({ x: 0, y: 0, status: "alive" });
  return {
    self: { x: 0, y: 0, status: "alive", rangeM: 0, lobRangeM: 0, minLobM: 0, muzzleM: 0, hp: 1, maxHp: 1, consumableKind: null, throwRangeM: 0 },
    teammates,
    teammateCount: 0,
    nearestZombie: null,
    zombie: { x: 0, y: 0, distM: 0, holdsSpot: false, rushing: false },
    knowsCover: false,
    shotZombie: null,
    shot: { x: 0, y: 0, distM: 0, holdsSpot: false },
    throwTarget: null,
    cluster: { x: 0, y: 0, distM: 0, holdsSpot: false },
    huntStepX: 0,
    huntStepY: 0,
    laneOutX: 0,
    laneOutY: 0,
    errandX: 0,
    errandY: 0,
    errandStop: false,
  };
}

/** Writes the move (a unit vector toward (dx, dy), or still) into `out`. */
function moveToward(out: PlayerInput, dx: number, dy: number): void {
  const d = Math.hypot(dx, dy);
  if (d === 0) {
    out.moveX = 0;
    out.moveY = 0;
    return;
  }
  out.moveX = dx / d;
  out.moveY = dy / d;
}

/** One tick's input for a bot. `seq` is the input's sequence number (one higher per tick). */
export function botInput(view: BotView, cfg: BotConfig, seq: number, out: PlayerInput): void {
  out.seq = seq;
  out.moveX = 0;
  out.moveY = 0;
  out.aimX = 0;
  out.aimY = 0;
  out.fire = false;
  out.swap = false;
  out.consumable = false;
  out.isMouse = false;
  const me = view.self;
  if (me.status !== "alive") return; // downed or out: nothing to do

  const z = view.nearestZombie;
  // Aim at one I can hit; with none, keep facing the nearest (no fire: it's out of range or behind cover).
  const target = view.knowsCover ? (view.shotZombie ?? z) : z;
  if (target) {
    const dx = target.x - me.x;
    const dy = target.y - me.y;
    const d = Math.hypot(dx, dy);
    if (d > 0) {
      // Story 5.5: a launcher lobs to the target's distance (from the muzzle, clamped to its lob range).
      const len = me.lobRangeM > 0 ? Math.min(1, Math.max(me.minLobM / me.lobRangeM, (d - me.muzzleM) / me.lobRangeM)) : 1;
      out.aimX = (dx / d) * len;
      out.aimY = (dy / d) * len;
      out.fire = target.distM <= me.rangeM && (!view.knowsCover || target === view.shotZombie);
    }
  }

  // Story 5.12: the quick-use slot (deterministic: no randomness). A medkit below the HP share; a
  // throwable at the densest cluster (the aim length carries the distance as a fraction of the throw's range).
  if (me.consumableKind === "heal" && me.hp < me.maxHp * (cfg.medkitBelowHpFrac ?? 0.4)) out.consumable = true;
  else if (me.consumableKind !== null && me.consumableKind !== "heal" && view.throwTarget) {
    const t = view.throwTarget;
    const dx = t.x - me.x;
    const dy = t.y - me.y;
    const d = Math.hypot(dx, dy);
    const range = me.throwRangeM; // review L5: the flagged input always carries the throw's own range
    if (d > 0 && range > 0) {
      const len = Math.min(1, Math.max(1e-3, (d - me.muzzleM) / range));
      out.aimX = (dx / d) * len;
      out.aimY = (dy / d) * len;
      out.fire = false; // this tick throws (the launcher would read the same aim)
      out.consumable = true;
    }
  }

  // 1. Revive the nearest downed teammate in reach.
  let best = -1;
  let bestD2 = cfg.reviveSearchM * cfg.reviveSearchM;
  let cx = me.x;
  let cy = me.y;
  let alive = 1;
  for (let i = 0; i < view.teammateCount; i++) {
    const m = view.teammates[i] as BotMate;
    if (m.status === "alive") {
      cx += m.x;
      cy += m.y;
      alive++;
      continue;
    }
    if (m.status !== "downed") continue;
    const dx = m.x - me.x;
    const dy = m.y - me.y;
    const d2 = dx * dx + dy * dy;
    if (d2 <= bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  if (best >= 0) {
    const m = view.teammates[best] as BotMate;
    if (bestD2 > cfg.reviveStopM * cfg.reviveStopM) moveToward(out, m.x - me.x, m.y - me.y);
    return;
  }

  // 1b. Story 6.8: out of a stampede's lane (bots don't shoot the armed car: the timer sets it off).
  // Story 6.9: out of a hissing gas leak's ring too (same field).
  if (view.laneOutX !== 0 || view.laneOutY !== 0) {
    moveToward(out, view.laneOutX, view.laneOutY);
    return;
  }
  // 1c. Stories 6.9 / 6.10: an event errand (the crate, the survivor and its flag).
  if (view.errandStop || view.errandX !== 0 || view.errandY !== 0) {
    moveToward(out, view.errandStop ? 0 : view.errandX, view.errandStop ? 0 : view.errandY);
    return;
  }

  // 2. Back away from a zombie that is too close (Story 6.5: not from the Behemoth's body edge: its slam,
  // not its touch, is the danger, and backing off a boss behind cover would stall the fight).
  if (z && z.distM < cfg.keepDistanceM && z.boss !== true) {
    moveToward(out, me.x - z.x, me.y - z.y);
    return;
  }

  // 2b. Story 5.6 (review M2): the nearest zombie is a Spitter holding its spot just out of my range
  // (6 m vs the 5 m Shotgun): step toward it so I can shoot back. Never for walking zombies.
  const extra = cfg.closeInExtraM ?? 0;
  if (z && z.holdsSpot === true && extra > 0 && z.distM > me.rangeM && z.distM <= me.rangeM + extra) {
    moveToward(out, z.x - me.x, z.y - me.y);
    return;
  }

  // 2c. Every zombie in range is behind cover (a barricade stops my bullets): strafe 90° left of the
  // nearest to open a line.
  if (z && view.knowsCover && view.shotZombie === null && z.distM <= me.rangeM) {
    // Story 6.8 (found by the 10-wave sim): the side flips every `bots.json › strafeFlipSeqs` inputs, so a bot
    // pinned against the bus by its strafe (always left) gets out of the pocket and opens a line.
    const side = ((seq / (cfg.strafeFlipSeqs ?? 64)) | 0) % 2 === 0 ? 1 : -1;
    moveToward(out, -(z.y - me.y) * side, (z.x - me.x) * side);
    return;
  }

  // 3. Regroup toward the centre of the alive team (me included).
  cx /= alive;
  cy /= alive;
  const gx = cx - me.x;
  const gy = cy - me.y;
  if (gx * gx + gy * gy > cfg.regroupDistM * cfg.regroupDistM) {
    moveToward(out, gx, gy);
    return;
  }
  // 4. Hunt a marked rusher (Story 6.5: or the Behemoth, along its nav-grid way) out of my range.
  if (z && z.rushing === true && z.distM > me.rangeM) {
    if (view.huntStepX !== 0 || view.huntStepY !== 0) moveToward(out, view.huntStepX, view.huntStepY);
    else moveToward(out, z.x - me.x, z.y - me.y);
  }
  // 5. Otherwise stand still.
}

/**
 * Story 6.5 (the sims' bots only): steps from every free nav-grid cell to the Behemoth, a breadth-first
 * search from its cell over the cells not walled by the map or a building, once per World tick (shared
 * by every bot). Bot code, not the simulation: it allocates once per grid size.
 */
const hunt = { world: null as World | null, tick: -1, dist: new Int32Array(0), queue: new Int32Array(0) };

/**
 * Fix bloater-car-corner (review round 2, the six-wave sim's timeout): a survivor (0.8 m) centred on a
 * 0.5 m cell reaches into all 8 neighbours, so the hunt's cell must be free with them, as its comment
 * always said. The code checked the cell alone, so the way led through slots one cell wide that no
 * survivor fits (two bots pressed for 32 minutes into a 0.5 m slot between a car and their own
 * barricade, while the Behemoth, which can't reach them, stood and threw).
 */
function huntCellClear(nav: World["pathing"]["nav"], cx: number, cy: number): boolean {
  const { cols, rows } = nav;
  for (let dy = -1; dy <= 1; dy++) {
    const y = cy + dy;
    if (y < 0 || y >= rows) return false;
    for (let dx = -1; dx <= 1; dx++) {
      const x = cx + dx;
      if (x < 0 || x >= cols) return false;
      const n = y * cols + x;
      if (nav.wallAt[n] !== 0 || nav.buildingAt[n] !== 0) return false;
    }
  }
  return true;
}

function huntStep(world: World, x: number, y: number, out: BotView): void {
  const nav = world.pathing.nav;
  if (nav.cells <= 1) return;
  if (hunt.world !== world || hunt.tick !== world.tick) {
    hunt.world = world;
    hunt.tick = world.tick;
    if (hunt.dist.length !== nav.cells) {
      hunt.dist = new Int32Array(nav.cells);
      hunt.queue = new Int32Array(nav.cells);
    }
    const { cols, rows } = nav;
    const dist = hunt.dist;
    dist.fill(-1);
    const start = flowCellAt(nav, world.boss.x, world.boss.y);
    let head = 0;
    let tail = 0;
    hunt.queue[tail++] = start;
    dist[start] = 0;
    while (head < tail) {
      const c = hunt.queue[head++] as number;
      const cx = c % cols;
      const cy = (c - cx) / cols;
      for (let k = 0; k < 4; k++) {
        const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        const n = ny * cols + nx;
        if (dist[n] !== -1) continue;
        // The boss's own body cells are open (the search starts inside it); elsewhere a cell must keep a
        // survivor's body clear of walls and buildings (it and its 8 neighbours free).
        if ((dist[c] as number) > 8 && (!huntCellClear(nav, nx, ny) || flowEdgeClosed(nav, c, n))) continue;
        dist[n] = (dist[c] as number) + 1;
        hunt.queue[tail++] = n;
      }
    }
  }
  // Steer at a point a few cells down the way (a carrot): along a corridor, not into its wall.
  const cols = nav.cols;
  let c = flowCellAt(nav, x, y);
  if ((hunt.dist[c] as number) <= 0) return;
  for (let step = 0; step < HUNT_LOOKAHEAD_CELLS; step++) {
    const cx = c % cols;
    const cy = (c - cx) / cols;
    let best = -1;
    let bestD = hunt.dist[c] as number;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const ny = cy + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (nx < 0 || ny < 0 || nx >= cols || ny >= nav.rows) continue;
      const d = hunt.dist[ny * cols + nx] as number;
      if (d >= 0 && d < bestD) {
        bestD = d;
        best = ny * cols + nx;
      }
    }
    if (best < 0) break;
    c = best;
  }
  out.huntStepX = flowCellCenterX(nav, c) - x;
  out.huntStepY = flowCellCenterY(nav, c) - y;
}


/** Story 6.9: bots keep this far beyond the gas ring while it hisses. */
const GAS_MARGIN_M = 1.5;

/** Story 6.8 (AC 14): the way out of the active stampede's lane for a bot at (x, y), into `out.laneOut*`. */
function laneOut(world: World, x: number, y: number, out: BotView): void {
  const a = world.special.active;
  if (a.kind === GAS_KIND && a.phase === EVENT_PHASE.HISS) {
    // Story 6.9 (AC 8): out of the 6 m ring (so the sims don't wipe to it).
    const dx = x - a.x;
    const dy = y - a.y;
    const r = world.balance.events.gasLeak.radiusM + GAS_MARGIN_M;
    if (dx * dx + dy * dy < r * r) {
      out.laneOutX = dx === 0 && dy === 0 ? 1 : dx;
      out.laneOutY = dy;
    }
    return;
  }
  if (a.kind !== STAMPEDE_KIND || a.lane < 0) return;
  const l = world.map.stampedeLanes[a.lane];
  if (!l) return;
  const m = world.balance.bots.laneMarginM;
  if (x < l.minX - m || x > l.maxX + m || y < l.minY - m || y > l.maxY + m) return;
  if (l.dir === "e" || l.dir === "w") out.laneOutY = y - l.minY < l.maxY - y ? -1 : 1;
  else out.laneOutX = x - l.minX < l.maxX - x ? -1 : 1;
}
const STAMPEDE_KIND = EVENT_KINDS.indexOf("stampede");
const GAS_KIND = EVENT_KINDS.indexOf("gas_leak");
const CRATE_KIND = EVENT_KINDS.indexOf("supply_drop");
const SURVIVOR_KIND = EVENT_KINDS.indexOf("survivor");

/** True when `p` is the nearest standing player to (x, y) that passes `ok` (ties: insertion order). */
function nearestStanding(world: World, p: PlayerState, x: number, y: number, ok: (q: PlayerState) => boolean): boolean {
  let best: PlayerState | null = null;
  let bestD2 = Infinity;
  for (const q of world.players.values()) {
    if (q.status !== "alive" || !ok(q)) continue;
    const d2 = (q.x - x) ** 2 + (q.y - y) ** 2;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = q;
    }
  }
  return best === p;
}

const anyone = (): boolean => true;
let crateWorld: World | null = null;
const mayTakeCrate = (q: PlayerState): boolean => {
  const w = crateWorld as World;
  const d = w.special.supplyDrop;
  const weapon = weaponIds(w.balance)[d.weapon];
  return weapon !== undefined && crateRefusal(q.loadout, weapon, d.level) === null;
};

/** Stories 6.9 / 6.10 (sim liveness): the bot's errand for the active event, into `out.errand*`. */
function errand(world: World, p: PlayerState, out: BotView): void {
  out.errandX = 0;
  out.errandY = 0;
  out.errandStop = false;
  if (p.status !== "alive") return;
  const a = world.special.active;
  if (a.kind === CRATE_KIND && a.phase === EVENT_PHASE.LANDED) {
    crateWorld = world;
    if (nearestStanding(world, p, a.x, a.y, mayTakeCrate)) {
      out.errandX = a.x - p.x;
      out.errandY = a.y - p.y;
      out.errandStop = out.errandX * out.errandX + out.errandY * out.errandY < 0.09; // on it: stand still
    }
    crateWorld = null;
  } else if (a.kind === SURVIVOR_KIND) {
    const n = world.special.survivor;
    if (n.state === NPC_STATE.FOLLOWING && world.flameSlots[n.leaderSlot] === p.id) {
      // lead: to the flag, but never more than ~3 m ahead (it follows at 4.0 m/s; bots run 4.5)
      const gap = Math.hypot(p.x - n.x, p.y - n.y);
      if (gap < 3) {
        out.errandX = n.safeX - p.x;
        out.errandY = n.safeY - p.y;
      } else out.errandStop = true; // wait for it
    } else if (n.state === NPC_STATE.WAITING && nearestStanding(world, p, n.x, n.y, anyone)) {
      out.errandX = n.x - p.x;
      out.errandY = n.y - p.y;
    }
  }
}

/** Story 6.5: cells the hunt looks ahead along its way. */
const HUNT_LOOKAHEAD_CELLS = 4;

/** The fill in progress (synchronous, so one shared record is enough: no closure per call). */
const fill: { view: BotView | null; selfId: string } = { view: null, selfId: "" };

function visitMate(p: PlayerState): void {
  const v = fill.view;
  if (!v || p.id === fill.selfId || v.teammateCount >= v.teammates.length) return;
  const m = v.teammates[v.teammateCount++] as BotMate;
  m.x = p.x;
  m.y = p.y;
  m.status = p.status;
}

/** Fills `out` from a World (headless bots). A missing player reads as "out" with no zombie. */
export function botViewFromWorld(world: World, playerId: string, out: BotView): void {
  out.teammateCount = 0;
  out.huntStepX = 0;
  out.huntStepY = 0;
  out.laneOutX = 0;
  out.laneOutY = 0;
  out.nearestZombie = null;
  out.knowsCover = true;
  out.shotZombie = null;
  out.throwTarget = null;
  const p = world.players.get(playerId);
  const self = out.self;
  if (!p) {
    self.status = "out";
    return;
  }
  self.x = p.x;
  self.y = p.y;
  self.status = p.status;
  laneOut(world, p.x, p.y, out); // Story 6.8
  errand(world, p, out); // Stories 6.9 / 6.10
  const stats = world.balance.weapons[activeSlot(p.loadout).weapon];
  self.rangeM = stats?.rangeM ?? 0;
  self.lobRangeM = stats?.kind === "launcher" ? stats.lobRangeM : 0; // Story 5.5
  self.minLobM = stats?.kind === "launcher" ? stats.minLobM : 0;
  self.muzzleM = p.radiusM + MUZZLE_OFFSET_M;
  // Story 5.12: the slot and HP.
  self.hp = p.hp;
  self.maxHp = p.maxHp;
  const cs = p.consumableCount > 0 ? consumableStats(world.balance, p.consumable) : undefined;
  self.consumableKind = cs?.kind ?? null;
  self.throwRangeM = cs && cs.kind !== "heal" ? (cs.throwRangeM ?? 0) : 0;
  fill.view = out;
  fill.selfId = playerId;
  world.players.forEach(visitMate);
  fill.view = null;
  const zs = world.zombies;
  let bestD2 = Infinity;
  let bx = 0;
  let by = 0;
  let bid = -1;
  const lobs = self.lobRangeM > 0; // a lob flies over barricades: every target is clear
  const range2 = self.rangeM * self.rangeM;
  let shotD2 = Infinity;
  for (let i = 0; i < zs.aliveCount; i++) {
    const id = zs.aliveIds[i] as number;
    const zx = zs.x[id] as number;
    const zy = zs.y[id] as number;
    const dx = zx - p.x;
    const dy = zy - p.y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      bx = zx;
      by = zy;
      bid = id;
    }
    if (d2 < shotD2 && d2 <= range2 && (lobs || bulletLineClear(world, p.x, p.y, zx, zy))) {
      shotD2 = d2;
      out.shot.x = zx;
      out.shot.y = zy;
      out.shot.distM = Math.sqrt(d2);
      out.shotZombie = out.shot;
    }
  }
  // Story 6.5: the Behemoth is a target like a zombie (measured to its body's edge, aimed at its centre),
  // so the bots fight it and a boss wave can end (F11) in the sims.
  const boss = world.boss;
  if (bossBodyOn(boss)) {
    const dx = boss.x - p.x;
    const dy = boss.y - p.y;
    const edge = Math.max(0, Math.sqrt(dx * dx + dy * dy) - world.balance.boss.radiusM);
    const d2 = edge * edge;
    if (d2 < bestD2) {
      bestD2 = d2;
      bx = boss.x;
      by = boss.y;
      bid = -1;
    }
    huntStep(world, p.x, p.y, out);
    if (d2 < shotD2 && d2 <= range2 && (lobs || bulletLineClear(world, p.x, p.y, boss.x, boss.y))) {
      out.shot.x = boss.x;
      out.shot.y = boss.y;
      out.shot.distM = edge;
      out.shotZombie = out.shot;
    }
  }
  if (bestD2 < Infinity) {
    out.zombie.x = bx;
    out.zombie.y = by;
    out.zombie.distM = Math.sqrt(bestD2);
    // Review M2: a Spitter holds its spot unless it rushes (FR30: then it walks in between spits).
    out.zombie.holdsSpot = bid >= 0 && world.balance.zombies.types[zombieTypeOf(zs, bid)]?.spit !== undefined && !isRushState(zs.state[bid] as number);
    out.zombie.boss = bid < 0;
    out.zombie.rushing = bid < 0 || isRushState(zs.state[bid] as number); // Story 6.5: the bots hunt the Behemoth like the last rushers (out of range: walk to it)
    out.nearestZombie = out.zombie;
  }
  // Story 5.12: the densest cluster within throw range (waves only; at most CLUSTER_CANDIDATES tried).
  if (self.throwRangeM > 0 && world.run.phase === "wave" && cs && p.consumableCooldownTicks === 0) findCluster(world, p, self.muzzleM + self.throwRangeM, cs.radiusM ?? 0, world.balance.bots.throwClusterMin, out);
}

/** Story 5.12: zombies tried as a cluster centre (nearest-first is not needed: the first ones in range). */
const CLUSTER_CANDIDATES = 48;

function findCluster(world: World, p: PlayerState, reachM: number, radiusM: number, min: number, out: BotView): void {
  const zs = world.zombies;
  const reach2 = reachM * reachM;
  const r2 = radiusM * radiusM;
  let best = min - 1;
  let tried = 0;
  for (let i = 0; i < zs.aliveCount && tried < CLUSTER_CANDIDATES; i++) {
    const id = zs.aliveIds[i] as number;
    const cx = zs.x[id] as number;
    const cy = zs.y[id] as number;
    const dx = cx - p.x;
    const dy = cy - p.y;
    const d2 = dx * dx + dy * dy;
    // never at my own feet (the throw's minimum plus the blast must clear me)
    if (d2 > reach2 || d2 < (radiusM + p.radiusM) * (radiusM + p.radiusM)) continue;
    tried++;
    let n = 0;
    for (let k = 0; k < zs.aliveCount; k++) {
      const o = zs.aliveIds[k] as number;
      const ex = (zs.x[o] as number) - cx;
      const ey = (zs.y[o] as number) - cy;
      if (ex * ex + ey * ey < r2) n++;
    }
    if (n > best) {
      best = n;
      out.cluster.x = cx;
      out.cluster.y = cy;
      out.cluster.distM = Math.sqrt(d2);
      out.throwTarget = out.cluster;
    }
  }
}
