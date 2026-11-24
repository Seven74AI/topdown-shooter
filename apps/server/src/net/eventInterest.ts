import {
  HORDE_VIEW_MARGIN_M,
  buildingById,
  buildingCentreX,
  buildingCentreY,
  encodeNetEvent,
  inRect,
  turretStats,
  viewRect,
  BLOATER_BLAST_WEAPON,
  type NetEvent,
  type NetEventContext,
  type Rect,
  type SimEvent,
  type World,
} from "@topdown/shared";

/**
 * Story 3.6 review M2: per-client interest for turret-caused events. A cap's worth of turrets
 * (24, all firing) costs every client ~3.5 KB/s of events if everything goes to everyone; most of
 * those shots are far off-screen. So two kinds are **local**:
 *
 * - `turret.fired`: interesting where the shot can be seen: the turret's centre or the end of its
 *   flight (muzzle + direction × `projectileRangeM`);
 * - a turret's non-killing `zombie.hit` (the hit flash): the zombie's position or the turret's centre.
 *
 * - Story 5.9: `mine.exploded` (the blast FX): the mine's centre. A mine's non-killing hits are
 *   turret-style building hits (above). `building.upgraded` stays global (money / HUD), as do Story 5.20's `building.sold` and Story 5.22's `building.moved`.
 *   Story 5.14: `bear_trap.snapped` (clang + snap FX) is local at the trap's centre.
 * Story 5.6 adds two more local kinds: `spitter.spat` (its mouth point or its flight's end) and
 * `acid.splashed` (the puddle's centre). Acid damage (`player.damaged`, source −3) stays global.
 * Story 6.5: `boss.hit` (the hit flash) is local at the boss's position; warning, arrival, telegraph,
 * slam and target change are global (the team cue). Story 6.8: every `event.*` is global (team cues).
 * Story 5.8: `bloater.swell_started`, `bloater.burst` and a Bloater blast's non-killing `zombie.hit`
 * are local (their point); the blast damage, kills and the gas slow stay server truth for everyone.
 *
 * A client gets a local event only if one of its two points lies in that client's horde view rect
 * (Story 2.5 `viewRect` around `viewTargetFor`, + `HORDE_VIEW_MARGIN_M`). Everything else (kills,
 * money, buildings, waves, players' shots…) stays reliable to everyone, in emit order. A killing
 * turret hit stays global too (it is the hit right before its `zombie.killed`).
 *
 * `prepare` encodes the tick once (the tuples are allocated by `encodeNetEvent`, as before; the
 * arrays here are reused). `eventsFor` fills one reused array per client in turn: send it before
 * asking for the next client (Colyseus encodes `client.send` synchronously).
 */
export class EventInterest {
  /** Every encoded event of the tick, in emit order. */
  readonly all: NetEvent[] = [];
  /** Local events in `all` this tick (0 = everyone gets `all`). */
  localCount = 0;
  private readonly filtered: NetEvent[] = [];
  /** Per index of `all`: the two interest points of a local event (NaN = global). */
  private ax = new Float64Array(256);
  private ay = new Float64Array(256);
  private bx = new Float64Array(256);
  private by = new Float64Array(256);
  private readonly rect: Rect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  prepare(world: Readonly<World>, events: readonly SimEvent[], ctx: NetEventContext): void {
    const all = this.all;
    all.length = 0;
    this.localCount = 0;
    for (let i = 0; i < events.length; i++) {
      const e = events[i] as SimEvent;
      const t = encodeNetEvent(e, ctx);
      if (!t) continue;
      const k = all.length;
      all.push(t);
      this.ensure(k + 1);
      this.ax[k] = Number.NaN;
      if (e.type === "turret.fired") {
        const b = buildingById(world, e.buildingId);
        const range = b ? (turretStats(world.balance, b.type)?.projectileRangeM ?? 0) : 0;
        this.setLocal(k, b ? buildingCentreX(b) : e.x, b ? buildingCentreY(b) : e.y, e.x + e.dirX * range, e.y + e.dirY * range);
      } else if (e.type === "mine.exploded" || e.type === "bear_trap.snapped") {
        this.setLocal(k, e.x, e.y, e.x, e.y); // Story 5.9: the blast FX is local (the removal is schema, for everyone). Story 5.14: the snap FX too (closed/open is schema)
      } else if (e.type === "spitter.spat") {
        // Story 5.6: local: the glob is seen where it starts or ends (damage is global: player.damaged).
        this.setLocal(k, e.x, e.y, e.toX, e.toY);
      } else if (e.type === "acid.splashed") {
        this.setLocal(k, e.x, e.y, e.x, e.y); // the puddle (radius ≤ the view margin)
      } else if (e.type === "bloater.swell_started" || e.type === "bloater.burst") {
        this.setLocal(k, e.x, e.y, e.x, e.y); // Story 5.8: the swell cue, the burst + gas FX (the slow and damage are global)
      } else if (e.type === "boss.hit") {
        this.setLocal(k, world.boss.x, world.boss.y, world.boss.x, world.boss.y); // Story 6.5: the hit flash (hp is schema); every other boss event is global
      } else if (e.type === "zombie.hit" && e.weapon === BLOATER_BLAST_WEAPON) {
        // Story 5.8: a blast's non-killing hits (up to ~40 per blast, 8 blasts a tick in a chain) are
        // local hit flashes; the killing one stays global (it is right before its `zombie.killed`).
        const next = events[i + 1];
        if (!(next !== undefined && next.type === "zombie.killed" && next.zombieId === e.zombieId)) this.setLocal(k, e.x, e.y, e.x, e.y);
      } else if (e.type === "zombie.hit" && e.buildingId !== undefined) {
        const next = events[i + 1];
        const kills = next !== undefined && next.type === "zombie.killed" && next.zombieId === e.zombieId;
        if (!kills) {
          const b = buildingById(world, e.buildingId);
          this.setLocal(k, e.x, e.y, b ? buildingCentreX(b) : e.x, b ? buildingCentreY(b) : e.y);
        }
      }
    }
  }

  /**
   * The events of this tick for a client whose view is centred on (x, y): `all` itself when there
   * is nothing local, else a reused filtered array (valid until the next call).
   */
  eventsFor(world: Readonly<World>, x: number, y: number): readonly NetEvent[] {
    if (this.localCount === 0) return this.all;
    const r = viewRect(world.map, x, y, HORDE_VIEW_MARGIN_M, this.rect);
    const out = this.filtered;
    out.length = 0;
    const all = this.all;
    for (let k = 0; k < all.length; k++) {
      const ax = this.ax[k] as number;
      if (Number.isNaN(ax) || inRect(r, ax, this.ay[k] as number) || inRect(r, this.bx[k] as number, this.by[k] as number)) out.push(all[k] as NetEvent);
    }
    return out;
  }

  private setLocal(k: number, ax: number, ay: number, bx: number, by: number): void {
    this.ax[k] = ax;
    this.ay[k] = ay;
    this.bx[k] = bx;
    this.by[k] = by;
    this.localCount++;
  }

  private ensure(n: number): void {
    if (n <= this.ax.length) return;
    const grow = (a: Float64Array): Float64Array<ArrayBuffer> => {
      const b = new Float64Array(a.length * 2);
      b.set(a);
      return b;
    };
    this.ax = grow(this.ax);
    this.ay = grow(this.ay);
    this.bx = grow(this.bx);
    this.by = grow(this.by);
  }
}
