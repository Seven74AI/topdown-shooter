import { AREA_KIND, TICK_DT_S, clearAreas, consumableStatsAt, createAreaPool, molotovTicksAt, spawnArea, throwVariant, type AreaPool, type Balance, type SimEvent } from "@topdown/shared";

/**
 * Story 5.12: the client's copy of the molotov fire zones (M-A: the fire is drawn exactly where it
 * burns). Fed by events in both modes — online the server's (`molotov.ignited`, `build.started`),
 * solo the local World's, through the same `drainEvents` path:
 *
 * - `molotov.ignited` starts a zone of the item's radius for its `durationS`, back-dated by the
 *   event's `ageS` (a woken tab's backlog: one older than its life is never drawn — no ghost fire);
 * - the cap rule is the server's own (`spawnArea` with `maxLiveMolotovZones`: a 9th replaces the
 *   oldest), applied to the same events in the same order, so the client holds the server's zones;
 * - `build.started` clears every zone (the server does at every build start).
 *
 * Its zones are `ZoneLike` records (preallocated) for the view's ring and hidden-edge rule. The look
 * variant (MB1–3 spread) is `throwVariant` of the landing point, like the bottle's. Phaser-free,
 * no allocation per event or frame.
 */
export interface MolotovZoneDraw {
  x: number;
  y: number;
  radiusM: number;
  /** The server zone id (u16). */
  id: number;
  startS: number;
  endS: number;
  /** 0 MB1 even, 1 MB2 forward splash, 2 MB3 joining puddles. */
  spread: number;
  /** The throw's direction (rad; MB2 splashes along it). */
  dir: number;
}

/** looks.html `molEnv`: the fire fades over its last 0.6 s. */
export const MOLOTOV_FADE_S = 0.6;

export class MolotovFires {
  private readonly pool: AreaPool;
  /** Per slot: the draw record (only `active` ones are listed in `live`). */
  private readonly slots: MolotovZoneDraw[];
  /** The live zones in slot order (rebuilt on a change only). */
  readonly live: MolotovZoneDraw[] = [];
  /** Bumped on every change of the live set (the view re-lays hidden edges). */
  version = 0;
  private born = 0;
  /** The start point of each thrown item in flight, by its landing point (MB2's splash direction; cosmetic). */
  private readonly lastLaunch = new Map<string, { x: number; y: number }>();

  constructor(
    private readonly balance: Balance,
    readonly capacity = balance.consumables.maxLiveMolotovZones,
  ) {
    this.pool = createAreaPool(capacity);
    this.slots = Array.from({ length: capacity }, () => ({ x: 0, y: 0, radiusM: 0, id: -1, startS: 0, endS: 0, spread: 0, dir: 0 }));
  }

  handle(e: SimEvent, nowS: number): boolean {
    if (e.type === "grenade.launched" && (e.item ?? 0) > 0) {
      // the throw's start point: a forward splash runs along it (cosmetic)
      const l = this.lastLaunch.get(`${e.tx.toFixed(2)},${e.ty.toFixed(2)}`);
      if (l) {
        l.x = e.x;
        l.y = e.y;
      } else if (this.lastLaunch.size < 64) this.lastLaunch.set(`${e.tx.toFixed(2)},${e.ty.toFixed(2)}`, { x: e.x, y: e.y });
      return false;
    }
    if (e.type === "build.started") {
      this.clear();
      return false;
    }
    if (e.type !== "molotov.ignited") return false;
    const t = molotovTicksAt(this.balance, e.item);
    const durS = t.durationTicks * TICK_DT_S;
    const startS = nowS - (e.ageS ?? 0);
    const r = consumableStatsAt(this.balance, e.item)?.radiusM ?? 0;
    // The cap rule on the same events in the same order (an expired zone is freed first in `update`).
    this.update(nowS);
    const slot = spawnArea(this.pool, this.capacity, AREA_KIND.FIRE, e.zoneId, e.x, e.y, r, Math.max(1, t.durationTicks), this.born++);
    if (slot < 0) return false;
    const z = this.slots[slot] as MolotovZoneDraw;
    z.x = e.x;
    z.y = e.y;
    z.radiusM = r;
    z.id = e.zoneId;
    z.startS = startS;
    z.endS = startS + durS;
    z.spread = throwVariant(e.x, e.y);
    const key = `${e.x.toFixed(2)},${e.y.toFixed(2)}`;
    const from = this.lastLaunch.get(key);
    z.dir = from ? Math.atan2(e.y - from.y, e.x - from.x) : 0;
    this.lastLaunch.delete(key);
    if (nowS >= z.endS) {
      this.pool.active[slot] = 0; // older than its life (a woken tab): never drawn
      this.pool.count--;
      z.id = -1;
    }
    this.relist();
    return true;
  }

  /** Ends zones whose life is over (call every frame). */
  update(nowS: number): void {
    let changed = false;
    for (let i = 0; i < this.capacity; i++) {
      if (this.pool.active[i] !== 1) continue;
      if (nowS >= (this.slots[i] as MolotovZoneDraw).endS) {
        this.pool.active[i] = 0;
        this.pool.count--;
        (this.slots[i] as MolotovZoneDraw).id = -1;
        changed = true;
      }
    }
    if (changed) this.relist();
  }

  clear(): void {
    clearAreas(this.pool);
    for (const z of this.slots) z.id = -1;
    this.lastLaunch.clear();
    this.relist();
  }

  /** Live zone ids (tests: the client holds the server's zones). */
  ids(out: number[]): number[] {
    out.length = 0;
    for (const z of this.live) out.push(z.id);
    return out;
  }

  /** The drawn envelope (0–1) of a zone at `nowS` (the last 0.6 s fade). */
  static envelope(z: Readonly<MolotovZoneDraw>, nowS: number): number {
    const left = z.endS - nowS;
    return left <= 0 ? 0 : left >= MOLOTOV_FADE_S ? 1 : left / MOLOTOV_FADE_S;
  }

  private relist(): void {
    this.live.length = 0;
    for (let i = 0; i < this.capacity; i++) if (this.pool.active[i] === 1) this.live.push(this.slots[i] as MolotovZoneDraw);
    this.version++;
  }
}
