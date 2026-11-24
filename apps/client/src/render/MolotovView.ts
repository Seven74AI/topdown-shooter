import type * as Phaser from "phaser";
import type { Balance, SimEvent } from "@topdown/shared";
import { FireView } from "./city/FireView";
import { FIRE_EMBERS_MAX, FIRE_FLAMES_MAX, FIRE_SMOKE_MAX } from "./city/fireParticles";
import { FIRE_RING_ALPHA, FIRE_RING_COLOR } from "./city/fireRing";
import { ATLAS_THROWFX, FX_MOLOTOV_RING, ensureThrowFxAtlas, ringDisplayM } from "./city/throwArt";
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
  /** One pooled ring image per zone slot (the 4.8 D16 ring at exactly the damage edge). */
  private readonly rings: Phaser.GameObjects.Image[] = [];
  private ringVersion = -1;
  private readonly budget: Balance["consumables"]["fx"];
  private budgetLive = -1;

  constructor(scene: Phaser.Scene, balance: Balance) {
    this.fires = new MolotovFires(balance);
    this.fx = new FireView(scene, this.fires.capacity, true);
    this.budget = balance.consumables.fx;
    ensureThrowFxAtlas(scene);
    for (let i = 0; i < this.fires.capacity; i++) this.rings.push(scene.add.image(0, 0, ATLAS_THROWFX, FX_MOLOTOV_RING).setDepth(RING_DEPTH).setTint(FIRE_RING_COLOR).setAlpha(FIRE_RING_ALPHA).setVisible(false));
  }

  handle(e: SimEvent, nowS: number): void {
    this.fires.handle(e, nowS);
  }

  /** One frame: `dtS` 0 while paused; `nowS` the events' clock; the camera view (m). */
  update(dtS: number, nowS: number, vx: number, vy: number, vw: number, vh: number): void {
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
      this.fx.setPoolBudget(share, Math.min(b.smokeShare, share), spacing, live.length <= b.maxLights);
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
    if (f.version !== this.ringVersion) {
      this.ringVersion = f.version;
      for (let i = 0; i < this.rings.length; i++) {
        const img = this.rings[i] as Phaser.GameObjects.Image;
        const z = live[i];
        if (!z) {
          if (img.visible) img.setVisible(false);
          continue;
        }
        const d = ringDisplayM(z.radiusM);
        img.setPosition(z.x, z.y).setDisplaySize(d, d).setVisible(true);
      }
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
    for (const r of this.rings) r.destroy();
    this.rings.length = 0;
  }
}
