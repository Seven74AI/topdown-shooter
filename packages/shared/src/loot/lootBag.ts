import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { boxBlocked, findBoxFreeSpot } from "../player/freeSpot";
import { emptyLootPlan, lootKillIndex, pickLootVariant, type LootPlan } from "./lootPlan";

/**
 * Story 7.12 (AC 3–5, B3, B4, B7): the surprise loot bag in the World. Server and solo run
 * `updateLootBag` (the last system of the tick: after every kill of the tick was emitted, before the
 * tick's events are delivered); the client's mirror copies the bag from the room's `lootBag*` record.
 *
 * - The drop: when wave `plan.wave` starts, `killIndex = 1 + floor(killFrac × size)`; every
 *   `zombie.killed` of that wave counts (any cause); on the `killIndex`-th the bag appears where that
 *   zombie died, moved out of solids (map boxes, cover, buildings incl. barricades, rubble; fire,
 *   acid and gas don't move it, D4). A team wipe first = no bag. One bag per run, ever.
 * - It lies `bagTicks` (400 = 20 s), also into the build phase (D6), and is gone at its last tick or
 *   when the run ends (`loot.expired`).
 * - The pick-up: each tick, the first standing player (status `alive`, in `world.players`) whose
 *   centre is within `pickRadiusM` of the bag's centre takes it; several → the lowest slot. No
 *   button. `loot.found { playerId, wave }`.
 * - Cosmetic only (B7): it blocks nothing, hurts nobody, zombies ignore it; no random draw here.
 */
export const LOOT_BAG = { NONE: 0, OUT: 1, FOUND: 2, GONE: 3 } as const;
export type LootBagStateCode = (typeof LOOT_BAG)[keyof typeof LOOT_BAG];

export interface LootState {
  /** The run's plan (server truth, never on the wire; B2). */
  readonly plan: LootPlan;
  /** The server-only salt of the `loot` stream (D3; 0 in tests, replays and practice). */
  salt: number;
  /** Kill that drops the bag (0: the planned wave hasn't started). */
  killIndex: number;
  /** Kills counted in the planned wave so far. */
  killed: number;
  /** The planned wave is running and its kills count. */
  counting: boolean;
  /** `LOOT_BAG`. */
  state: number;
  /** The bag's centre (m), set on the drop. */
  x: number;
  y: number;
  /** Tick it dropped and the tick it is gone at (it lies `untilTick − dropTick` ticks). */
  dropTick: number;
  untilTick: number;
  /** Its look (= `plan.variant`). */
  variant: number;
  /** Who took it (null: nobody yet) and in which wave the bag dropped. */
  foundBy: string | null;
  foundWave: number;
  /**
   * Review M1: seats already banked for this run (a Leave / `run.leave` banks at once). They play on if they come
   * back, but can't take the bag: their run is closed, so a find would be lost and teammates shown a phantom item.
   */
  readonly banked: Set<string>;
}

export function createLootState(): LootState {
  return { plan: emptyLootPlan(), salt: 0, killIndex: 0, killed: 0, counting: false, state: LOOT_BAG.NONE, x: 0, y: 0, dropTick: 0, untilTick: 0, variant: 0, foundBy: null, foundWave: 0, banked: new Set() };
}

/** Plain copy for `snapshotWorld` (AC 12: the replay digest covers the bag). */
export function snapshotLoot(l: Readonly<LootState>) {
  return { plan: { ...l.plan }, salt: l.salt, killIndex: l.killIndex, killed: l.killed, counting: l.counting, state: l.state, x: l.x, y: l.y, dropTick: l.dropTick, untilTick: l.untilTick, variant: l.variant, foundBy: l.foundBy, foundWave: l.foundWave, banked: [...l.banked].sort() };
}

/**
 * Dev switch (`devLoot=<wave>:<frac>`: server `DEV_LOOT`, solo `?loot=`; dev builds only): this run
 * has a bag in `wave` at kill share `frac`. Missing item roll and look are drawn from the `loot`
 * stream (dev only: the real plan made none). Call before the planned wave starts.
 */
export function forceLootPlan(world: World, wave: number, frac: number): void {
  const p = world.loot.plan;
  if (!p.has) {
    p.itemRoll = world.streams.loot.next();
    p.variant = pickLootVariant(world.streams.loot, world.balance.loot.variants, -1);
  }
  p.has = true;
  p.wave = wave;
  p.killFrac = Math.min(Math.max(frac, 0), 0.999999);
}

/** `devLoot` text `"<wave>:<frac>"` → [wave, frac], or null when invalid (wave 1–255, frac in [0, 1)). */
export function parseDevLoot(text: string | null | undefined): readonly [number, number] | null {
  if (!text) return null;
  const m = /^(\d{1,3}):(0(?:\.\d+)?|\.\d+)$/.exec(text.trim());
  if (!m) return null;
  const wave = Number(m[1]);
  const frac = Number(m[2]);
  return wave >= 1 && wave <= 255 && frac >= 0 && frac < 1 ? [wave, frac] : null;
}

const spot = { x: 0, y: 0 };
/** 8 directions, +x first (deterministic). */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
];

/**
 * AC 3: the bag's spot for a death at (x, y): the point itself when its circle is clear of the map
 * edge, map boxes and buildings (`boxBlocked`; fire, acid and gas don't count, D4), else the nearest
 * clear point on rings `spotStepM` apart, then `findBoxFreeSpot`'s wider rings, then the first
 * standing player's position (a last resort the tests never reach). Writes `out`.
 */
export function lootSpot(world: Readonly<World>, x: number, y: number, out: { x: number; y: number }): void {
  const l = world.balance.loot;
  const r = l.bagRadiusM;
  if (!boxBlocked(world, x, y, r)) {
    out.x = x;
    out.y = y;
    return;
  }
  for (let ring = 1; ring <= l.spotRings; ring++) {
    const d = l.spotStepM * ring;
    for (let i = 0; i < DIRS.length; i++) {
      const dir = DIRS[i] as readonly [number, number];
      const cx = x + dir[0] * d;
      const cy = y + dir[1] * d;
      if (boxBlocked(world, cx, cy, r)) continue;
      out.x = cx;
      out.y = cy;
      return;
    }
  }
  if (findBoxFreeSpot(world, x, y, r, 8, out)) return;
  for (const p of world.players.values()) {
    if (p.status !== "alive") continue;
    out.x = p.x;
    out.y = p.y;
    return;
  }
  out.x = Math.min(Math.max(x, r), world.map.widthM - r);
  out.y = Math.min(Math.max(y, r), world.map.heightM - r);
}

function drop(world: World, x: number, y: number): void {
  const l = world.loot;
  lootSpot(world, x, y, spot);
  l.state = LOOT_BAG.OUT;
  l.x = spot.x;
  l.y = spot.y;
  l.dropTick = world.tick;
  l.untilTick = world.tick + world.balance.loot.bagTicks;
  l.variant = l.plan.variant;
  l.counting = false;
  world.events.emit({ type: "loot.dropped", x: l.x, y: l.y, untilTick: l.untilTick, variant: l.variant });
}

/** The player in slot `slot` of the slot table, or undefined. */
function playerInSlot(world: Readonly<World>, slot: number): PlayerState | undefined {
  const id = world.flameSlots[slot];
  return id ? world.players.get(id) : undefined;
}

/** B3: the lowest slot standing within `pickRadiusM` of the bag's centre (boundary inclusive) and not banked yet (review M1), or undefined. */
export function lootTaker(world: Readonly<World>): PlayerState | undefined {
  const l = world.loot;
  const r = world.balance.loot.pickRadiusM;
  const r2 = r * r;
  for (let s = 0; s < world.flameSlots.length; s++) {
    const p = playerInSlot(world, s);
    if (!p || p.status !== "alive" || l.banked.has(p.id)) continue;
    const dx = p.x - l.x;
    const dy = p.y - l.y;
    if (dx * dx + dy * dy <= r2) return p;
  }
  return undefined;
}

/** The loot system (last in `SYSTEM_ORDER`). No allocation per tick. */
export function updateLootBag(world: World): void {
  const l = world.loot;
  const plan = l.plan;
  if (l.state === LOOT_BAG.NONE && plan.has && !world.teamWiped) {
    // this tick's events, in emit order (they are delivered after this system)
    const ev = world.events;
    for (let i = 0; i < ev.pendingCount && l.state === LOOT_BAG.NONE; i++) {
      const e = ev.pendingAt(i);
      if (!e) break;
      if (e.type === "wave.started") {
        if (e.number === plan.wave && l.killIndex === 0) {
          l.killIndex = lootKillIndex(plan.killFrac, e.size);
          l.killed = 0;
          l.counting = true;
        }
      } else if (e.type === "wave.ended") {
        if (e.number === plan.wave) l.counting = false;
      } else if (e.type === "zombie.killed" && l.counting) {
        l.killed++;
        if (l.killed >= l.killIndex) drop(world, e.x, e.y);
      }
    }
  }
  if (l.state !== LOOT_BAG.OUT) return;
  if (world.run.phase === "results" || world.tick >= l.untilTick) {
    l.state = LOOT_BAG.GONE;
    world.events.emit({ type: "loot.expired" });
    return;
  }
  const p = lootTaker(world);
  if (!p) return;
  l.state = LOOT_BAG.FOUND;
  l.foundBy = p.id;
  l.foundWave = plan.wave;
  world.events.emit({ type: "loot.found", playerId: p.id, wave: plan.wave });
}
