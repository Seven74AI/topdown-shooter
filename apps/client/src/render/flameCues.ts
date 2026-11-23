import type { SimEvent } from "@topdown/shared";

/**
 * Story 5.4 (AC 6/7): who is flaming right now, for the cones the client draws. Phaser-free.
 *
 * - Remote flamers (and every flamer solo): `weapon.flame_started` / `weapon.flame_stopped` (burst
 *   edges, never one per tick); the cone points along the flamer's drawn heading.
 * - Lost or late events never leave a cone on forever (brief line 14): online, `patch` is fed the
 *   flamer's synced fuel (`ammo`) on every state patch; when it has not fallen for
 *   `FLAME_STALE_PATCHES` patches in a row, or the flamer is not alive, the cone is off.
 * - My own cone online (2.7: instant): `setLocal` from the local fire clock each step; the
 *   server's events about me are ignored then (they arrive an RTT late).
 *
 * Fixed per-slot records ("p0"–"p3" and solo's "local"): no allocation after construction.
 */
export const FLAME_STALE_PATCHES = 3;

interface Rec {
  id: string;
  on: boolean;
  weapon: string;
  lastAmmo: number;
  stale: number;
  alive: boolean;
}

const MAX_FLAMERS = 8;

export class FlameCues {
  private readonly recs: Rec[] = [];
  /** Online: my id (its events are ignored; `setLocal` drives it). "" = solo (events only). */
  private localId = "";
  private localOn = false;
  private localWeapon = "";
  readonly localDir = { x: 1, y: 0 };

  constructor() {
    for (let i = 0; i < MAX_FLAMERS; i++) this.recs.push({ id: "", on: false, weapon: "", lastAmmo: -1, stale: 0, alive: true });
  }

  /** Online: my cone comes from my fire clock (`setLocal`), not from the server's events. */
  predictLocal(localId: string): void {
    this.localId = localId;
  }

  private rec(id: string, create: boolean): Rec | null {
    let free: Rec | null = null;
    for (const r of this.recs) {
      if (r.id === id) return r;
      if (r.id === "" && !free) free = r;
    }
    if (!create || !free) return null;
    free.id = id;
    free.on = false;
    free.lastAmmo = -1;
    free.stale = 0;
    free.alive = true;
    return free;
  }

  /** One drained sim event. */
  handle(e: SimEvent): void {
    if (e.type !== "weapon.flame_started" && e.type !== "weapon.flame_stopped") return;
    if (e.playerId === this.localId) return;
    const r = this.rec(e.playerId, true);
    if (!r) return;
    if (e.type === "weapon.flame_started") {
      r.on = true;
      r.weapon = e.weapon;
    } else r.on = false;
  }

  /** Online, per state patch: the flamer's synced fuel of the active slot and whether it stands. */
  patch(id: string, ammo: number, alive: boolean): void {
    if (id === this.localId) return;
    const r = this.rec(id, true);
    if (!r) return;
    r.stale = r.lastAmmo >= 0 && ammo < r.lastAmmo ? 0 : r.stale + 1;
    r.lastAmmo = ammo;
    r.alive = alive;
  }

  /** My predicted flame on this step (online). */
  setLocal(on: boolean, weapon: string, dirX: number, dirY: number): void {
    this.localOn = on;
    if (on) {
      this.localWeapon = weapon;
      this.localDir.x = dirX;
      this.localDir.y = dirY;
    }
  }

  /** The weapon `id` is flaming with now, or "" (off). */
  flaming(id: string): string {
    if (id === this.localId && this.localId !== "") return this.localOn ? this.localWeapon : "";
    const r = this.rec(id, false);
    if (!r || !r.on || !r.alive) return "";
    // a patch-fed record: fuel stopped falling for 3 patches → the stop event was lost or is late
    if (r.lastAmmo >= 0 && r.stale >= FLAME_STALE_PATCHES) return "";
    return r.weapon;
  }

  /** A player left: forget them. */
  drop(id: string): void {
    const r = this.rec(id, false);
    if (r) r.id = "";
  }

  clear(): void {
    for (const r of this.recs) r.id = "";
    this.localOn = false;
  }
}
