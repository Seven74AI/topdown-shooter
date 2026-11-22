import {
  ZOMBIE_POOL_CAPACITY,
  buildingTypeIds,
  freeProjectile,
  isZombieAlive,
  maxZombieRadius,
  projectileHasHit,
  queryRadius,
  rebuildGrid,
  recordProjectileHit,
  segmentCircleT,
  spawnProjectile,
  weaponIds,
  zombieNetId,
  zombieTypeOf,
  type ProjectileSpawn,
  type World,
} from "@topdown/shared";

/** Called when one of MY cosmetic projectiles first crosses a mirror zombie (reversed-hit check). */
export type ApparentHitFn = (zombieNetId: number) => void;

const candidates = new Int32Array(ZOMBIE_POOL_CAPACITY);
const hitT = new Float32Array(ZOMBIE_POOL_CAPACITY);
const hitId = new Int32Array(ZOMBIE_POOL_CAPACITY);

/**
 * Cosmetic projectiles in the mirror World's projectile pool (Story 2.7, AC 2 and 3), which
 * `ProjectileView` already draws. My own shots are spawned by the local fire clock; remote
 * players' shots from the server's `weapon.fired` at the render tick.
 *
 * Each frame they move `speed × frameDtS` (frame time: they are visual only), with `prevX = x`
 * so the view's lerp is a no-op. A projectile is freed at its range, outside the map, or once its
 * segment has crossed `pierce` mirror zombies. They never damage, flash or push anything: only
 * the server's `zombie.hit` does. No allocation per frame.
 */
export class CosmeticProjectiles {
  private readonly spawnBuf: ProjectileSpawn = {
    x: 0,
    y: 0,
    dirX: 1,
    dirY: 0,
    speedMps: 0,
    rangeM: 0,
    damage: 0,
    pierce: 1,
    weaponIndex: 0,
    owner: null,
    advanceM: 0,
    building: 0,
    pushbackM: 0,
  };
  private gridFresh = false;

  constructor(
    private readonly world: World,
    private readonly localPlayerId: string,
    private readonly onApparentHit: ApparentHitFn = () => {},
  ) {}

  /** The mirror zombies changed (a new horde sample): the grid is rebuilt on next use. */
  zombiesMoved(): void {
    this.gridFresh = false;
  }

  /** Rebuilds the mirror's zombie grid at most once per horde sample (aim assist and sweeps share it). */
  ensureGrid(): void {
    if (this.gridFresh) return;
    const z = this.world.zombies;
    rebuildGrid(this.world.zombieGrid, z.aliveIds, z.aliveCount, z.x, z.y);
    this.gridFresh = true;
  }

  /** Spawns a cosmetic shot of `weapon` from (x, y) along the unit (dirX, dirY). Returns its id or -1. */
  spawn(ownerId: string, weapon: string, x: number, y: number, dirX: number, dirY: number): number {
    const stats = this.world.balance.weapons[weapon];
    if (!stats || stats.kind !== "gun") return -1;
    const s = this.spawnBuf;
    s.x = x;
    s.y = y;
    s.dirX = dirX;
    s.dirY = dirY;
    s.speedMps = stats.projectileSpeedMps;
    s.rangeM = stats.rangeM;
    s.pierce = stats.pierce;
    s.weaponIndex = Math.max(0, weaponIds(this.world.balance).indexOf(weapon));
    s.owner = ownerId;
    return spawnProjectile(this.world.projectiles, s);
  }

  /**
   * Story 3.6: a turret's cosmetic shot (from `turret.fired`): tagged with its building (drawn in the
   * turret colour), no owner (never "mine": the reversed-hit check ignores it), pierce 1.
   */
  spawnShot(buildingId: number, buildingType: string, x: number, y: number, dirX: number, dirY: number, speedMps: number, rangeM: number): number {
    const s = this.spawnBuf;
    s.x = x;
    s.y = y;
    s.dirX = dirX;
    s.dirY = dirY;
    s.speedMps = speedMps;
    s.rangeM = rangeM;
    s.pierce = 1;
    s.weaponIndex = Math.max(0, buildingTypeIds(this.world.balance).indexOf(buildingType));
    s.owner = null;
    s.building = buildingId;
    const id = spawnProjectile(this.world.projectiles, s);
    s.building = 0;
    return id;
  }

  /** Moves every cosmetic projectile by one frame. */
  update(frameDtS: number): void {
    const pool = this.world.projectiles;
    if (pool.aliveCount === 0 || frameDtS <= 0) return;
    this.ensureGrid();
    const z = this.world.zombies;
    const { widthM, heightM } = this.world.map;
    const types = this.world.balance.zombies.types;
    const maxR = maxZombieRadius(this.world.balance);
    for (let i = pool.aliveCount - 1; i >= 0; i--) {
      const id = pool.aliveIds[i] as number;
      const x0 = pool.x[id] as number;
      const y0 = pool.y[id] as number;
      const step = Math.min((pool.speedMps[id] as number) * frameDtS, pool.rangeLeftM[id] as number);
      const dx = pool.dirX[id] as number;
      const dy = pool.dirY[id] as number;
      const x1 = x0 + dx * step;
      const y1 = y0 + dy * step;
      const count = queryRadius(this.world.zombieGrid, z.x, z.y, (x0 + x1) / 2, (y0 + y1) / 2, step / 2 + maxR, candidates);
      let hits = 0;
      for (let k = 0; k < count; k++) {
        const zid = candidates[k] as number;
        if (!isZombieAlive(z, zid) || projectileHasHit(pool, id, zid)) continue;
        const r = types[zombieTypeOf(z, zid)]?.radiusM ?? 0;
        const t = segmentCircleT(x0, y0, x1, y1, z.x[zid] as number, z.y[zid] as number, r);
        if (t < 0) continue;
        let j = hits++;
        while (j > 0 && (hitT[j - 1] as number) > t) {
          hitT[j] = hitT[j - 1] as number;
          hitId[j] = hitId[j - 1] as number;
          j--;
        }
        hitT[j] = t;
        hitId[j] = zid;
      }
      const mine = pool.owner[id] === this.localPlayerId;
      let stoppedAt = -1;
      for (let k = 0; k < hits; k++) {
        const zid = hitId[k] as number;
        recordProjectileHit(pool, id, zid);
        if (mine) this.onApparentHit(zombieNetId(zid, z.generation[zid] as number));
        pool.pierceLeft[id] = (pool.pierceLeft[id] as number) - 1;
        if (pool.pierceLeft[id] === 0) {
          stoppedAt = hitT[k] as number;
          break;
        }
      }
      if (stoppedAt >= 0) {
        this.place(id, x0 + dx * step * stoppedAt, y0 + dy * step * stoppedAt);
        freeProjectile(pool, id);
        continue;
      }
      this.place(id, x1, y1);
      pool.rangeLeftM[id] = (pool.rangeLeftM[id] as number) - step;
      if ((pool.rangeLeftM[id] as number) <= 1e-6 || x1 < 0 || y1 < 0 || x1 > widthM || y1 > heightM) freeProjectile(pool, id);
    }
  }

  clear(): void {
    const pool = this.world.projectiles;
    while (pool.aliveCount > 0) freeProjectile(pool, pool.aliveIds[pool.aliveCount - 1] as number);
  }

  private place(id: number, x: number, y: number): void {
    const pool = this.world.projectiles;
    pool.x[id] = x;
    pool.y[id] = y;
    pool.prevX[id] = x;
    pool.prevY[id] = y;
  }
}
