import type * as Phaser from "phaser";
import type { Balance, SimEvent } from "@topdown/shared";
import { FireView } from "./city/FireView";
import { FIRE_EMBERS_MAX, FIRE_FLAMES_MAX, FIRE_SMOKE_MAX } from "./city/fireParticles";
import { FIRE_RING_ALPHA, FIRE_RING_COLOR, fireRingWidthM } from "./city/fireRing";
import { MolotovFires } from "./molotovFx";

/** A low-quality car fire's particle caps (flames + smoke + embers at half: `halfCap`), the share's base. */
const POOL_FULL_PARTICLES = (FIRE_FLAMES_MAX + FIRE_SMOKE_MAX + FIRE_EMBERS_MAX) / 2;

/** The ring line with the car fires' (CityView) look, over the ground light. */
const RING_DEPTH = 4.34;

/**
 * Story 5.12 (AC 9, 10): the molotov fire zones drawn — the 4.12 fire-lab D particle fire (`FireView`
 * in pool mode: no car, the MB1–3 spread: even pool / forward splash / joining puddles), its soft
 * ground light, and the thin ring at EXACTLY the 3 m damage edge (balance `fx` sets each zone's particle share) (the 4.8 D16 rule: your body touches
 * the ring = you burn). Capped at `consumables.json › maxLiveMolotovZones` pooled slots (the
 * particle fires at half caps, `?fx=low`-sized, so 8 zones cost about two car fires); nothing
 * allocated per frame. Zones come from `MolotovFires` (events only).
 */
export class MolotovView {
  readonly fires: MolotovFires;
  private readonly fx: FireView;
  private readonly ring: Phaser.GameObjects.Graphics;
  private ringVersion = -1;
  private readonly budget: Balance["consumables"]["fx"];
  private budgetLive = -1;
  private ringZoom = 0;

  constructor(scene: Phaser.Scene, balance: Balance) {
    this.fires = new MolotovFires(balance);
    this.fx = new FireView(scene, this.fires.capacity, true);
    this.budget = balance.consumables.fx;
    this.ring = scene.add.graphics().setDepth(RING_DEPTH);
  }

  handle(e: SimEvent, nowS: number): void {
    this.fires.handle(e, nowS);
  }

  /** One frame: `dtS` 0 while paused; `nowS` the events' clock; the camera view (m) and zoom (px per m). */
  update(dtS: number, nowS: number, vx: number, vy: number, vw: number, vh: number, zoom: number): void {
    const f = this.fires;
    f.update(nowS);
    const live = f.live;
    if (live.length !== this.budgetLive) {
      // Brief 12 (C14): the particle and ring-flame caps hold over ALL live zones: more zones, thinner each.
      this.budgetLive = live.length;
      const b = this.budget;
      const n = Math.max(1, live.length);
      const share = Math.min(b.particleShare, b.maxParticles / (n * POOL_FULL_PARTICLES));
      const r = live[0]?.radiusM ?? 3;
      const spacing = Math.max(b.edgeSpacingM, (2 * Math.PI * r * n) / b.maxEdgeFlames);
      this.fx.setPoolBudget(share, Math.min(b.smokeShare, share), spacing);
    }
    for (let s = 0; s < this.fx.capacity; s++) {
      const z = live[s];
      if (!z) {
        this.fx.setPoolSlot(s, -1, 0, 0, 0, 0, 0, 0, 0, live, s, f.version);
        continue;
      }
      this.fx.setPoolSlot(s, z.id, z.x, z.y, z.radiusM, z.spread, z.dir, nowS - z.startS, MolotovFires.envelope(z, nowS), live, s, f.version);
    }
    this.fx.update(dtS, nowS, vx, vy, vw, vh);
    if (f.version !== this.ringVersion || zoom !== this.ringZoom) {
      this.ringVersion = f.version;
      this.ringZoom = zoom;
      const g = this.ring;
      g.clear();
      g.lineStyle(fireRingWidthM(zoom), FIRE_RING_COLOR, FIRE_RING_ALPHA);
      for (const z of live) g.strokeCircle(z.x, z.y, z.radiusM);
    }
  }

  /** Zones drawn (browser checks). */
  liveCount(): number {
    return this.fires.live.length;
  }

  particleCount(): number {
    return this.fx.particleCount();
  }

  destroy(): void {
    this.fx.destroy();
    this.ring.destroy();
  }
}
