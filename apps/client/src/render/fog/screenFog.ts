import { createFogBeam, createFogRadii, flashlightOf, fogRadiiOf, fogVisibility, type FogBeam, type FogRadii, type PlayerState, type World } from "@topdown/shared";

/** The drawn pose of a survivor (PlayerView: predicted for me, interpolated for teammates). */
export interface FogPose {
  readonly x: number;
  readonly y: number;
  readonly facingX: number;
  readonly facingY: number;
}

/** Most beams that reveal through the fog (one per player slot). */
export const MAX_FOG_BEAMS = 4;

/**
 * Story 6.4 (F3, F6; D1, D2, D10): this frame's fog on MY screen. `update` once per frame (before
 * the zombie, eye and spit views) with the camera's survivor (mine, or the teammate I spectate when
 * I am out) and every STANDING survivor's beam at its drawn pose (`flashlightOf` with its gear, the
 * same cone the blackout draws); then `visibility(x, y)` is the shared `fogVisibility`: 1 within the
 * clear radius or in a beam, fading to 0 at the fog radius. `on` = false below stage 5 (and in the
 * lobby / results): everything is visible. Quality settings never reach this (F5). No allocation.
 */
export class ScreenFog {
  readonly radii: FogRadii = createFogRadii();
  private readonly beams: FogBeam[] = [];
  private beamCount = 0;
  viewerX = 0;
  viewerY = 0;
  on = false;
  private world: World | null = null;
  private drawnOf: (id: string) => FogPose | undefined = () => undefined;

  constructor() {
    for (let i = 0; i < MAX_FOG_BEAMS; i++) this.beams.push(createFogBeam());
  }

  update(world: World, viewerX: number, viewerY: number, drawnOf: (id: string) => FogPose | undefined): void {
    this.on = fogRadiiOf(world, this.radii).radiusM !== Infinity;
    this.viewerX = viewerX;
    this.viewerY = viewerY;
    this.beamCount = 0;
    if (!this.on) return;
    this.world = world;
    this.drawnOf = drawnOf;
    world.players.forEach(this.addBeam);
    this.world = null;
  }

  private readonly addBeam = (p: PlayerState, id: string): void => {
    if (p.status !== "alive" || this.beamCount >= MAX_FOG_BEAMS || !this.world) return;
    const d = this.drawnOf(id);
    const b = this.beams[this.beamCount++] as FogBeam;
    b.x = d ? d.x : p.x;
    b.y = d ? d.y : p.y;
    b.facingX = d ? d.facingX : p.facingX;
    b.facingY = d ? d.facingY : p.facingY;
    b.cone = flashlightOf(this.world.balance, p.gear);
  };

  /** How visible a zombie (or a spit glob) centred at (x, y) is on my screen: 0…1. */
  visibility(x: number, y: number): number {
    if (!this.on) return 1;
    return fogVisibility(this.radii, this.viewerX, this.viewerY, x, y, this.beams, this.beamCount);
  }

  /** Beams counted this frame (tests). */
  get beamsNow(): number {
    return this.beamCount;
  }
}
