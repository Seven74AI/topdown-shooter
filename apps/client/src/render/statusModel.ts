import {
  AREA_KIND,
  BEAR_TRAP_STATE,
  BOSS_STATE,
  ZOMBIE_TYPES,
  acidSpitOf,
  buildingStats,
  circleInAcid,
  circleInFire,
  circleOverlapsBox,
  circleOverlapsSector,
  inHealReach,
  molotovZoneAt,
  shotBlockT,
  ticksFor,
  weaponIds,
  type AreaPool,
  type Balance,
  type Building,
  type PlayerState,
  type World,
} from "@topdown/shared";

/**
 * Story 9.22 (AC 3, B1): the status model — for every body, which statuses it is under right now and their time
 * left in TICKS (the view turns them into ring fractions and loop phases). Pure: no Phaser, no allocation per frame
 * (fixed records and typed arrays; the players by `forEach` with a module-level pass record).
 *
 * Two sources, one output:
 * - **local** (solo, and the host's own World): the World directly — `world.players` (status, `downedTicksLeft`,
 *   `reviveTicks`, `slowTicksLeft`, `protectTicks`), `world.boss` (STUN and `stateTicks`), the zombie pool's
 *   `igniteTicks`, `holdTicks` and `slowPct`; zones by the sim's own tests (`circleInFire`, `molotovZoneAt`,
 *   `circleInAcid`, `inHealReach`).
 * - **online** (`StatusSources.online`): the NetSimHost mirror World. Survivors' fields are the synced ones (the
 *   mirror copies them), so they read the same. What the wire does not carry is derived from what the client has:
 *   the boss's stun from the tick its state turned STUN; a zombie's ignite from the horde stream's burning bit
 *   (B3: the ring restarts when the bit appears or a flame cone the client draws covers the body); a bear-trap hold
 *   from the trap's synced HOLDING state + the zombie on its plate; spike slow from the zombie over a spike trap's
 *   footprint (buildings are mirrored); Molotov fire and acid puddles from the client's event-fed copies
 *   (`MolotovFires`, `AcidFx`: the same zone tests on the same zones).
 *
 * The importance table (B5) and the stacking rules are client presentation config, here, not the balance JSON.
 */

/** The statuses, in display priority (AC 2: downed > burning > acid > slowed > stunned > trapped > protected > healing). */
export const STATUS = {
  DOWNED: 0,
  BURNING: 1,
  ACID: 2,
  SLOWED: 3,
  STUNNED: 4,
  TRAPPED: 5,
  PROTECTED: 6,
  HEALING: 7,
} as const;
export type StatusId = (typeof STATUS)[keyof typeof STATUS];
export const STATUS_COUNT = 8;
/** AC 2 (card ST_MAX): at most this many icons stacked over one body. */
export const STATUS_MAX_SHOWN = 3;
/** `left` of a zone status (no ring: it lasts while the body is in the zone). */
export const NO_RING = -1;

/**
 * B5 (designer 2026-11-28, round 3): a zombie's importance for the icon cap — Behemoth > Brute / Bloater / Spitter >
 * Runner > Walker / Crawler (then the nearest). The Behemoth is not a pool zombie: its icons always show.
 */
export const BOSS_IMPORTANCE = 3;
const IMPORTANCE_BY_TYPE: Readonly<Record<(typeof ZOMBIE_TYPES)[number], number>> = {
  brute: 2,
  bloater: 2,
  spitter: 2,
  runner: 1,
  walker: 0,
  crawler: 0,
};
/** Importance per `ZOMBIE_TYPES` index (the pool's `type` array). */
export const ZOMBIE_IMPORTANCE: Uint8Array = Uint8Array.from(ZOMBIE_TYPES, (t) => IMPORTANCE_BY_TYPE[t]);

/**
 * Online: the held zombie's centre is on the bear trap's plate, as the horde stream rounds it (to the centimetre): this
 * margin keeps a body caught right at the plate's edge from being missed. (Spike slow uses the exact footprint.)
 */
const PLATE_MARGIN_M = 0.02;

/** One body's statuses (survivors and the Behemoth). */
export class BodyStatus {
  /** Bit `STATUS.*` set = under that status. */
  mask = 0;
  /** Ticks left per status (`NO_RING` for a zone status). */
  readonly left = new Int32Array(STATUS_COUNT);
  /** The ring's full length per status, ticks (0 for a zone status). */
  readonly total = new Int32Array(STATUS_COUNT);
  /** DOWNED's outer revive ring: ticks of revive done and needed (0 / 0 when nobody revives). */
  reviveTicks = 0;
  reviveNeed = 0;
  /** The body (players: id; the boss: null). */
  id: string | null = null;
  x = 0;
  y = 0;
  radiusM = 0;

  clear(): void {
    this.mask = 0;
    this.reviveTicks = 0;
    this.reviveNeed = 0;
  }

  set(s: StatusId, left: number, total: number): void {
    this.mask |= 1 << s;
    this.left[s] = left;
    this.total[s] = total;
  }

  has(s: StatusId): boolean {
    return (this.mask & (1 << s)) !== 0;
  }
}

/** The ring's fill 0…1 (1 = full) of `left` over `total`, or −1 for a zone status. */
export function ringFraction(left: number, total: number): number {
  if (left === NO_RING || total <= 0) return -1;
  return Math.min(1, Math.max(0, left / total));
}

/**
 * The shown icons of a status mask, in priority order, at most `STATUS_MAX_SHOWN`: written into `out`, returns the
 * count. A status ending makes the next one move up (the row re-centres in the view).
 */
export function orderedIcons(mask: number, out: Uint8Array): number {
  let n = 0;
  for (let s = 0; s < STATUS_COUNT && n < STATUS_MAX_SHOWN && n < out.length; s++) if ((mask & (1 << s)) !== 0) out[n++] = s;
  return n;
}

/**
 * One flame cone the client draws (online B3): the flamer's slot (its per-zombie flame clocks), the cone, and its
 * weapon's pulse and ignite (ticks).
 */
export interface FlameConeRec {
  slot: number;
  pulseTicks: number;
  igniteTicks: number;
  ox: number;
  oy: number;
  dirX: number;
  dirY: number;
  reachM: number;
  cosH: number;
  sinH: number;
}

/** Most cones at once (one per player). */
export const MAX_FLAME_CONES = 4;

/**
 * The zone sources the model cannot read from a mirror World. Local: the World itself (`worldStatusSources`); online:
 * the client's event-fed copies (`ClientStatusSources`).
 */
export interface StatusSources {
  /** The World is the NetSimHost mirror (derive what the wire lacks); false = solo / host World (read it). */
  readonly online: boolean;
  /** A Molotov fire zone covers the body circle (the sim's `molotovZoneAt` rule). */
  inMolotov(world: Readonly<World>, x: number, y: number, r: number): boolean;
  /** An acid puddle covers the body circle (the sim's `circleInAcid` rule). */
  inAcid(world: Readonly<World>, x: number, y: number, r: number): boolean;
  /** Online B3: the flame cones the client draws this frame (`coneCount` valid). */
  readonly cones: readonly FlameConeRec[];
  readonly coneCount: number;
}

/** Local: the World's own zones. */
export const worldStatusSources: StatusSources = {
  online: false,
  inMolotov: (world, x, y, r) => molotovZoneAt(world, x, y, r) >= 0,
  inAcid: (world, x, y, r) => circleInAcid(world, x, y, r),
  cones: [],
  coneCount: 0,
};

/** The circle is inside an active zone of `pool` reachable from its centre (the sim's zone rule, any pool). */
export function circleInZonePool(world: Readonly<World>, pool: Readonly<AreaPool>, kind: number, x: number, y: number, r: number, faceTolM: number): boolean {
  if (pool.count === 0) return false;
  for (let i = 0; i < pool.capacity; i++) {
    if (pool.active[i] !== 1 || pool.kind[i] !== kind) continue;
    const cx = pool.x[i] as number;
    const cy = pool.y[i] as number;
    const dx = x - cx;
    const dy = y - cy;
    const rr = r + (pool.radiusM[i] as number);
    const d2 = dx * dx + dy * dy;
    if (d2 >= rr * rr) continue;
    const t = shotBlockT(world, x, y, cx, cy);
    if (t < 0 || (1 - t) * Math.sqrt(d2) <= faceTolM) return true;
  }
  return false;
}

/** The parts of `AcidFx` the model reads (live puddles: `puddleId` −1 = free). */
export interface AcidPuddles {
  readonly maxPuddles: number;
  readonly puddleId: Int32Array;
  readonly puddleX: Float64Array;
  readonly puddleY: Float64Array;
}

/**
 * Online: the client's copies of the zones (fed by the server's events in both modes). `molotovs` is
 * `MolotovFires.areas`, `acid` the `AcidFx`; `cones` are filled by the scene each frame (`setCone`).
 */
export class ClientStatusSources implements StatusSources {
  readonly online = true;
  readonly cones: FlameConeRec[] = Array.from({ length: MAX_FLAME_CONES }, () => ({ slot: 0, pulseTicks: 1, igniteTicks: 0, ox: 0, oy: 0, dirX: 1, dirY: 0, reachM: 0, cosH: 1, sinH: 0 }));
  coneCount = 0;
  private readonly fireTol: number;
  private readonly acidR: number;
  private readonly acidTol: number;

  constructor(
    balance: Balance,
    private readonly molotovs: Readonly<AreaPool> | null,
    private readonly acid: AcidPuddles | null,
  ) {
    this.fireTol = balance.consumables.fireFaceToleranceM;
    const spit = acidSpitOf(balance);
    this.acidR = spit?.puddleRadiusM ?? 0;
    this.acidTol = spit?.acidFaceToleranceM ?? 0;
  }

  inMolotov(world: Readonly<World>, x: number, y: number, r: number): boolean {
    return this.molotovs !== null && circleInZonePool(world, this.molotovs, AREA_KIND.FIRE, x, y, r, this.fireTol);
  }

  inAcid(world: Readonly<World>, x: number, y: number, r: number): boolean {
    const a = this.acid;
    if (a === null) return false;
    for (let i = 0; i < a.maxPuddles; i++) {
      if (a.puddleId[i] === -1) continue;
      const cx = a.puddleX[i] as number;
      const cy = a.puddleY[i] as number;
      const dx = x - cx;
      const dy = y - cy;
      const rr = r + this.acidR;
      const d2 = dx * dx + dy * dy;
      if (d2 >= rr * rr) continue;
      const t = shotBlockT(world, x, y, cx, cy);
      if (t < 0 || (1 - t) * Math.sqrt(d2) <= this.acidTol) return true;
    }
    return false;
  }

  /**
   * Sets cone `i` (0…3) for this frame — flamer slot `slot` (0…3), its muzzle point, aim, the weapon's reach, cone,
   * pulse and ignite (`flameStatsOf`); `coneCount` is how many are valid.
   */
  setCone(i: number, slot: number, ox: number, oy: number, dirX: number, dirY: number, reachM: number, coneDeg: number, pulseS: number, igniteS: number): void {
    const c = this.cones[i];
    if (!c) return;
    const half = ((coneDeg / 2) * Math.PI) / 180;
    c.slot = slot;
    c.pulseTicks = Math.max(1, ticksFor(pulseS));
    c.igniteTicks = igniteS > 0 ? ticksFor(igniteS) : 0;
    c.ox = ox;
    c.oy = oy;
    c.dirX = dirX;
    c.dirY = dirY;
    c.reachM = reachM;
    c.cosH = Math.cos(half);
    c.sinH = Math.sin(half);
  }
}

/** Most bear traps tracked at once online (more than the building cap ever places). */
const MAX_TRAPS = 64;

/** Module-level pass record of the players' `forEach` (no closure per frame). */
const pass = { model: null as StatusModel | null, world: null as Readonly<World> | null, src: null as StatusSources | null, n: 0 };

function visitPlayer(p: PlayerState): void {
  (pass.model as StatusModel).player(p, pass.world as Readonly<World>, pass.src as StatusSources);
}

export class StatusModel {
  /** Survivors this frame (`playerCount` valid), in the World's player order. */
  readonly players: BodyStatus[];
  playerCount = 0;
  /** The Behemoth (mask 0 when there is none or it is under nothing). */
  readonly boss = new BodyStatus();
  /** Per zombie pool slot: the status mask (0 = none; only alive slots are written: read with the pool's alive list). */
  readonly zMask: Uint8Array;
  /** Per slot × `STATUS_COUNT`: ticks left and the ring's length (`NO_RING` / 0 for a zone). */
  readonly zLeft: Int32Array;
  readonly zTotal: Int32Array;

  // Configured lengths (ticks).
  private readonly downedT: number;
  private readonly reviveT: number;
  private readonly stunT: number;
  /** Per weapon index: its ignite (0 for a weapon that ignites nothing); and the longest (online: unknown weapon). */
  private readonly igniteByWeapon: Int32Array;
  private readonly igniteMax: number;
  /** Per zombie type index: a bear trap's hold (holdS × trapHoldPct). */
  private readonly holdByType: Int32Array;
  private readonly plateR: number;
  private readonly radiusByType: Float32Array;

  // Ring lengths learned from refreshes (a slow / protection's length is the value it was last refreshed to).
  private readonly slowPrev = new Int32Array(8);
  private readonly slowTot = new Int32Array(8);
  private readonly protPrev = new Int32Array(8);
  private readonly protTot = new Int32Array(8);

  // Online derivations.
  private bossStunStart = -1;
  /** Per slot: the tick the ignite was last (re)started (−1 = not burning) and its length. */
  private readonly burnStart: Int32Array;
  private readonly burnTot: Int32Array;
  /**
   * B3: the client's copy of the sim's per (zombie, flamer slot) flame clock (`flameClock`, FR-C: a pulse on the
   * first tick in a cone, then every `pulseS` of exposure; kept while outside; 0 on spawn and at every build start),
   * so the ignite ring restarts on the server's pulse, not on every tick in the cone. Its generation per slot, the
   * last pulse tick seen this frame, and the tick / phase the clocks were last advanced at.
   */
  private readonly flameClock: Uint8Array;
  private readonly clockGen: Int16Array;
  private readonly pulseAt: Int32Array;
  private clockTick = -1;
  private clockPhase = "";
  /** Per tracked bear trap (online): building id (−1 free), hold start tick, held slot (−1 not found yet) and generation. */
  private readonly trapId = new Int32Array(MAX_TRAPS).fill(-1);
  private readonly trapStart = new Int32Array(MAX_TRAPS);
  private readonly trapSlot = new Int32Array(MAX_TRAPS).fill(-1);
  private readonly trapGen = new Int16Array(MAX_TRAPS);
  private readonly trapSeen = new Uint8Array(MAX_TRAPS);
  private readonly heldSlotGen: Int32Array;

  constructor(balance: Balance, zombieCapacity: number) {
    this.players = Array.from({ length: 8 }, () => new BodyStatus());
    this.zMask = new Uint8Array(zombieCapacity);
    this.zLeft = new Int32Array(zombieCapacity * STATUS_COUNT);
    this.zTotal = new Int32Array(zombieCapacity * STATUS_COUNT);
    this.burnStart = new Int32Array(zombieCapacity).fill(-1);
    this.burnTot = new Int32Array(zombieCapacity);
    this.flameClock = new Uint8Array(zombieCapacity * MAX_FLAME_CONES);
    this.clockGen = new Int16Array(zombieCapacity).fill(-1);
    this.pulseAt = new Int32Array(zombieCapacity).fill(-1);
    this.heldSlotGen = new Int32Array(zombieCapacity).fill(-1);
    this.downedT = ticksFor(balance.player.downedS);
    this.reviveT = ticksFor(balance.player.reviveS);
    this.stunT = ticksFor(balance.boss.charge.stunS);
    const ids = weaponIds(balance);
    this.igniteByWeapon = new Int32Array(ids.length);
    let maxIgnite = 0;
    ids.forEach((id, i) => {
      const w = balance.weapons[id];
      const t = w && w.kind === "flame" && w.igniteS > 0 ? ticksFor(w.igniteS) : 0;
      this.igniteByWeapon[i] = t;
      if (t > maxIgnite) maxIgnite = t;
    });
    this.igniteMax = maxIgnite;
    const bt = balance.buildings.types.bear_trap?.bearTrap;
    this.plateR = bt?.plateRadiusM ?? 0;
    this.holdByType = Int32Array.from(ZOMBIE_TYPES, (t) => (bt ? ticksFor((bt.holdS * (balance.zombies.types[t]?.trapHoldPct ?? 100)) / 100) : 0));
    this.radiusByType = Float32Array.from(ZOMBIE_TYPES, (t) => balance.zombies.types[t]?.radiusM ?? 0);
  }

  /** Every body's statuses now. Call once per frame (after the host's update). */
  update(world: Readonly<World>, src: StatusSources): void {
    pass.model = this;
    pass.world = world;
    pass.src = src;
    pass.n = 0;
    world.players.forEach(visitPlayer);
    this.playerCount = pass.n;
    pass.model = null;
    pass.world = null;
    pass.src = null;
    this.updateBoss(world, src);
    this.updateZombies(world, src);
  }

  /** Zombie slot `id` is under `s` (call only for an alive slot this frame). */
  zHas(id: number, s: StatusId): boolean {
    return ((this.zMask[id] as number) & (1 << s)) !== 0;
  }

  /** The ring fill of zombie `id`'s status `s` (−1 zone / none). */
  zRing(id: number, s: StatusId): number {
    const k = id * STATUS_COUNT + s;
    return ringFraction(this.zLeft[k] as number, this.zTotal[k] as number);
  }

  /** One survivor (from the `forEach`). */
  player(p: PlayerState, world: Readonly<World>, src: StatusSources): void {
    const i = pass.n;
    const rec = this.players[i];
    if (!rec) return;
    pass.n = i + 1;
    rec.clear();
    if (rec.id !== p.id) {
      // A new body in this record (a join, a leave): its learned ring lengths start over.
      this.slowPrev[i] = 0;
      this.slowTot[i] = 0;
      this.protPrev[i] = 0;
      this.protTot[i] = 0;
    }
    rec.id = p.id;
    rec.x = p.x;
    rec.y = p.y;
    rec.radiusM = p.radiusM;
    // The refresh-learned ring lengths (slow: a bite 20, the gas 5 while inside; protection: 40 after a return, 255 at the extraction).
    const sl = p.slowTicksLeft > 0 ? p.slowTicksLeft : 0;
    if (sl > (this.slowPrev[i] as number) || (this.slowTot[i] as number) <= 0) this.slowTot[i] = sl;
    this.slowPrev[i] = sl;
    const pt = p.protectTicks > 0 ? p.protectTicks : 0;
    if (pt > (this.protPrev[i] as number) || (this.protTot[i] as number) <= 0) this.protTot[i] = pt;
    this.protPrev[i] = pt;
    if (p.status === "downed") {
      // `downedTicksLeft` pauses while revived (the sim's rule; the mirror copies the field).
      rec.set(STATUS.DOWNED, p.downedTicksLeft, this.downedT);
      if (p.reviveTicks > 0) {
        rec.reviveTicks = p.reviveTicks;
        rec.reviveNeed = p.reviveNeedTicks > 0 ? p.reviveNeedTicks : this.reviveT;
      }
      return;
    }
    if (p.status !== "alive" || world.extract.boarded.has(p.id)) return; // out / aboard: no body
    if (pt > 0) rec.set(STATUS.PROTECTED, pt, this.protTot[i] as number);
    if (sl > 0) rec.set(STATUS.SLOWED, sl, this.slowTot[i] as number);
    const phase = world.run.phase;
    const hurtPhase = phase === "build" || phase === "wave";
    // Fire and acid hurt no protected body (8.1 D3): no icon while protected.
    if (pt <= 0 && hurtPhase && (circleInFire(world.decay.fires, p.x, p.y, p.radiusM) || src.inMolotov(world, p.x, p.y, p.radiusM))) rec.set(STATUS.BURNING, NO_RING, 0);
    if (pt <= 0 && src.inAcid(world, p.x, p.y, p.radiusM)) rec.set(STATUS.ACID, NO_RING, 0);
    // B6 (the probe): healing shows while the HP the player SEES (rounded up, as on the wire) is below full. The sim
    // still heals the last fraction for ≤ 4 ticks; online that fraction is invisible, so both modes end on the full bar.
    if (hurtPhase && Math.ceil(p.hp) < p.maxHp && inHealReach(world, p.x, p.y, p.radiusM)) rec.set(STATUS.HEALING, NO_RING, 0);
  }

  private updateBoss(world: Readonly<World>, src: StatusSources): void {
    const b = world.boss;
    const rec = this.boss;
    rec.clear();
    rec.id = null;
    rec.x = b.x;
    rec.y = b.y;
    rec.radiusM = world.balance.boss.radiusM;
    if (b.state !== BOSS_STATE.STUN) {
      this.bossStunStart = -1;
      return;
    }
    let left: number;
    if (src.online) {
      // The wire has the state, not its clock: the stun started on the tick it was first seen (a late join mid-stun: now).
      if (this.bossStunStart < 0) this.bossStunStart = world.tick;
      left = this.stunT - (world.tick - this.bossStunStart);
    } else left = this.stunT - b.stateTicks;
    rec.set(STATUS.STUNNED, Math.max(0, left), this.stunT);
  }

  private updateZombies(world: Readonly<World>, src: StatusSources): void {
    const z = world.zombies;
    const list = world.buildings.list;
    const online = src.online;
    if (online) {
      this.findHeld(world);
      this.flamePulses(world, src);
    }
    for (let k = 0; k < z.aliveCount; k++) {
      const id = z.aliveIds[k] as number;
      const base = id * STATUS_COUNT;
      let mask = 0;
      const type = z.type[id] as number;
      // BURNING (ignite).
      if ((z.igniteTicks[id] as number) > 0) {
        mask |= 1 << STATUS.BURNING;
        let left: number;
        let total: number;
        if (online) {
          // A pulse the client saw restarts it; a bit that appeared with no pulse seen (a cone the client missed,
          // a late join) starts it now. The ignite tick already burns one (`updateIgnites` runs after the flames).
          const pulse = this.pulseAt[id] as number;
          if (pulse >= 0) this.burnStart[id] = pulse; // `burnTot` set with the pulse
          else if ((this.burnStart[id] as number) < 0) {
            this.burnStart[id] = world.tick;
            this.burnTot[id] = this.igniteMax;
          }
          total = this.burnTot[id] as number;
          left = Math.max(0, total - 1 - (world.tick - (this.burnStart[id] as number)));
        } else {
          left = z.igniteTicks[id] as number;
          total = this.igniteByWeapon[z.igniteWeapon[id] as number] ?? this.igniteMax;
          if (total < left) total = left;
        }
        this.zLeft[base + STATUS.BURNING] = left;
        this.zTotal[base + STATUS.BURNING] = total;
      } else this.burnStart[id] = -1;
      // TRAPPED (bear trap hold).
      if (online) {
        const k2 = this.heldSlotGen[id] as number;
        if (k2 >= 0 && (k2 & 0xffff) === (z.generation[id] as number)) {
          const t = k2 >>> 16;
          const total = this.holdByType[type] ?? 0;
          mask |= 1 << STATUS.TRAPPED;
          this.zLeft[base + STATUS.TRAPPED] = Math.max(0, total - (world.tick - (this.trapStart[t] as number)));
          this.zTotal[base + STATUS.TRAPPED] = total;
        }
      } else if ((z.holdTicks[id] as number) > 0) {
        mask |= 1 << STATUS.TRAPPED;
        const left = z.holdTicks[id] as number;
        this.zLeft[base + STATUS.TRAPPED] = left;
        this.zTotal[base + STATUS.TRAPPED] = Math.max(left, this.holdByType[type] ?? 0);
      }
      // SLOWED (spike traps: a zone).
      if (online ? onSpikes(world, list, z.x[id] as number, z.y[id] as number, this.radiusByType[type] ?? 0) : (z.slowPct[id] as number) > 0) {
        mask |= 1 << STATUS.SLOWED;
        this.zLeft[base + STATUS.SLOWED] = NO_RING;
        this.zTotal[base + STATUS.SLOWED] = 0;
      }
      this.zMask[id] = mask;
    }
  }

  /**
   * Online B3: advance the client's flame clocks by the ticks since the last frame for every zombie in a cone, and
   * note the tick of a pulse (`pulseAt`, −1 none this frame). Build start and a new generation zero them (the sim's rule).
   */
  private flamePulses(world: Readonly<World>, src: StatusSources): void {
    const z = world.zombies;
    const phase = world.run.phase;
    if (phase !== this.clockPhase) {
      if (phase === "build") this.flameClock.fill(0);
      this.clockPhase = phase;
    }
    const steps = this.clockTick < 0 ? 1 : Math.min(MAX_CLOCK_STEPS, Math.max(0, world.tick - this.clockTick));
    this.clockTick = world.tick;
    for (let k = 0; k < z.aliveCount; k++) {
      const id = z.aliveIds[k] as number;
      this.pulseAt[id] = -1;
      const gen = z.generation[id] as number;
      if (this.clockGen[id] !== gen) {
        this.clockGen[id] = gen;
        for (let s = 0; s < MAX_FLAME_CONES; s++) this.flameClock[id * MAX_FLAME_CONES + s] = 0;
      }
      if (steps === 0 || src.coneCount === 0) continue;
      const r = this.radiusByType[z.type[id] as number] ?? 0;
      const x = z.x[id] as number;
      const y = z.y[id] as number;
      for (let i = 0; i < src.coneCount; i++) {
        const c = src.cones[i];
        if (!c || c.slot < 0 || c.slot >= MAX_FLAME_CONES || !coneCovers(world, c, x, y, r)) continue;
        const ci = id * MAX_FLAME_CONES + c.slot;
        let clock = this.flameClock[ci] as number;
        for (let t = 0; t < steps; t++) {
          if (clock === 0 && c.igniteTicks > 0) {
            this.pulseAt[id] = world.tick - (steps - 1 - t);
            this.burnTot[id] = c.igniteTicks;
          }
          clock = (clock + 1) % c.pulseTicks;
        }
        this.flameClock[ci] = clock;
      }
    }
  }

  /**
   * Online: which zombie each HOLDING bear trap holds. The trap's state is synced exactly (`trap`); the held zombie
   * is the lowest-slot alive zombie whose centre is on the plate (the sim's catch rule), locked once found (it stands
   * still until released). The hold started on the tick the state turned HOLDING.
   */
  private findHeld(world: Readonly<World>): void {
    const z = world.zombies;
    // Clear last frame's held marks.
    for (let t = 0; t < MAX_TRAPS; t++) {
      const s = this.trapSlot[t] as number;
      if (s >= 0) this.heldSlotGen[s] = -1;
      this.trapSeen[t] = 0;
    }
    const list = world.buildings.list;
    for (let i = 0; i < list.length; i++) {
      const b = list[i] as Building;
      if (b.trapState !== BEAR_TRAP_STATE.HOLDING) continue;
      let t = -1;
      let free = -1;
      for (let j = 0; j < MAX_TRAPS; j++) {
        if (this.trapId[j] === b.id) {
          t = j;
          break;
        }
        if (free < 0 && this.trapId[j] === -1) free = j;
      }
      if (t < 0) {
        if (free < 0) continue;
        t = free;
        this.trapId[t] = b.id;
        this.trapStart[t] = world.tick;
        this.trapSlot[t] = -1;
      }
      this.trapSeen[t] = 1;
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      let s = this.trapSlot[t] as number;
      if (s >= 0 && ((z.alivePos[s] as number) < 0 || z.generation[s] !== this.trapGen[t])) s = -1; // gone (it died held: the trap springs next patch)
      if (s < 0 && this.trapSlot[t] === -1) {
        const r = this.plateR + PLATE_MARGIN_M;
        for (let k = 0; k < z.aliveCount; k++) {
          const id = z.aliveIds[k] as number;
          if (s >= 0 && id > s) continue;
          const dx = (z.x[id] as number) - cx;
          const dy = (z.y[id] as number) - cy;
          if (dx * dx + dy * dy < r * r) s = id;
        }
        if (s >= 0) {
          this.trapSlot[t] = s;
          this.trapGen[t] = z.generation[s] as number;
        }
      }
      if (s >= 0) this.heldSlotGen[s] = (t << 16) | (this.trapGen[t] as number);
    }
    // Traps no longer holding: forget them.
    for (let t = 0; t < MAX_TRAPS; t++) {
      if (this.trapId[t] !== -1 && this.trapSeen[t] === 0) {
        this.trapId[t] = -1;
        this.trapSlot[t] = -1;
      }
    }
  }
}

/** Online B3: the cone covers the body and nothing that stops shots is between (the sim's FR-A / FR-B). */
function coneCovers(world: Readonly<World>, c: FlameConeRec, x: number, y: number, r: number): boolean {
  return circleOverlapsSector(x, y, r, c.ox, c.oy, c.dirX, c.dirY, c.reachM, c.cosH, c.sinH) && shotBlockT(world, c.ox, c.oy, x, y) < 0;
}

/** A woken tab's frame after a long gap advances the flame clocks at most this many ticks (a burst is short). */
const MAX_CLOCK_STEPS = 10;

/** Online: the body circle overlaps a standing spike trap's footprint (the sim's `updateTraps` rule). */
function onSpikes(world: Readonly<World>, list: readonly Building[], x: number, y: number, r: number): boolean {
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (b.solid || b.hp <= 0) continue;
    const t = buildingStats(world.balance, b.type)?.trap;
    if (!t || t.slowPct <= 0) continue;
    if (circleOverlapsBox(x, y, r, b.minX, b.minY, b.maxX, b.maxY)) return true;
  }
  return false;
}
