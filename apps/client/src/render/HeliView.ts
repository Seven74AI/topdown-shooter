import * as Phaser from "phaser";
import type { DistrictMap } from "@topdown/shared";
import { aboveDarkness } from "./darkness/aboveDark";
import {
  ATLAS_HELI,
  HELI_BEACON,
  HELI_BEACON_AT_M,
  HELI_BEAM,
  HELI_BODY,
  HELI_BODY_M,
  HELI_PAD,
  HELI_PX_PER_M,
  HELI_ROTOR,
  HELI_ROTOR_M,
  PAD_FRAME_PX,
  PAD_RING_PX,
  ensureHeliAtlas,
} from "./city/heliArt";
import { BEAM_RX_M, BEAM_RY_M, BEAM_R_M, BEAM_SWEEP_HZ, ROTOR_RAD_S, evacPadOf, heliPose, type HeliPhase, type HeliPose } from "./heliPose";

/**
 * Story 6.11 (AC 9, D5): the evacuation helicopter. Visual only — no collision, nothing under it is
 * touched. On `run.vote_opened` it descends onto the pad over `DESCEND_S`, rotor spinning, the
 * searchlight sweeping; on Stay it lifts straight off over `LIFT_S`, on Extract it climbs away to
 * the north-east (the dawn plays over it). Everything is above the darkness (`ABOVE_DARK.marker`,
 * brief 24). One body, rotor, beacon, pad ring and beam image, made once (no per-frame allocation).
 *
 * The pad centre is map data: the `evac_pad` point of the map's `events` layer (Story 6.8 adds the
 * layer; MERGE POINT), else the map centre (Downtown 48 × 32 → (24, 16), the look page's (24, 15.9)).
 */
export class HeliView {
  private readonly pad: Phaser.GameObjects.Image;
  private readonly beam: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Image;
  private readonly rotor: Phaser.GameObjects.Image;
  private readonly beacon: Phaser.GameObjects.Image;
  private readonly at: { x: number; y: number };
  private openedAtS = -1;
  private leftAtS = -1;
  private extract = false;
  private readonly pose: HeliPose = { phase: "gone", dx: 0, dy: 0, scale: 1, alpha: 0 };

  constructor(scene: Phaser.Scene, map: Readonly<DistrictMap>, padRadiusM: number) {
    ensureHeliAtlas(scene);
    this.at = evacPadOf(map);
    const padSide = (padRadiusM * PAD_FRAME_PX) / PAD_RING_PX;
    this.pad = aboveDarkness(scene.add.image(this.at.x, this.at.y, ATLAS_HELI, HELI_PAD).setDisplaySize(padSide, padSide).setAlpha(0.55).setVisible(false), "marker");
    this.beam = aboveDarkness(scene.add.image(0, 0, ATLAS_HELI, HELI_BEAM).setDisplaySize(BEAM_R_M * 2, BEAM_R_M * 2).setVisible(false), "marker");
    this.beam.setBlendMode(Phaser.BlendModes.ADD); // ADD: the pool lights what's under it (no hot core: the frame is flat)
    const k = 1 / HELI_PX_PER_M;
    this.body = aboveDarkness(
      scene.add
        .image(this.at.x, this.at.y, ATLAS_HELI, HELI_BODY)
        .setOrigin(-HELI_BODY_M.x0 / (HELI_BODY_M.x1 - HELI_BODY_M.x0), -HELI_BODY_M.y0 / (HELI_BODY_M.y1 - HELI_BODY_M.y0))
        .setScale(k)
        .setVisible(false),
      "marker",
    );
    this.rotor = aboveDarkness(scene.add.image(this.at.x, this.at.y, ATLAS_HELI, HELI_ROTOR).setDisplaySize(HELI_ROTOR_M * 2, HELI_ROTOR_M * 2).setVisible(false), "marker");
    this.beacon = aboveDarkness(scene.add.image(0, 0, ATLAS_HELI, HELI_BEACON).setDisplaySize(0.18, 0.18).setVisible(false), "marker");
  }

  /** The vote opened at `nowS` (seconds of the scene's clock; `ageS` = how long ago the server opened it). */
  opened(nowS: number, ageS = 0): void {
    this.openedAtS = nowS - Math.max(0, ageS);
    this.leftAtS = -1;
  }

  /** The vote resolved: lift off (Stay) or climb away (Extract). */
  left(nowS: number, extract: boolean): void {
    if (this.openedAtS < 0) return;
    this.leftAtS = nowS;
    this.extract = extract;
  }

  /** A new run or Back to lobby: nothing on the pad. */
  reset(): void {
    this.openedAtS = -1;
    this.leftAtS = -1;
  }

  get phase(): HeliPhase {
    return this.pose.phase;
  }

  update(nowS: number): void {
    const p = heliPose(nowS, this.openedAtS, this.leftAtS, this.extract, this.pose);
    const on = p.phase !== "gone";
    this.pad.setVisible(on && (p.phase === "descending" || p.phase === "landed"));
    this.body.setVisible(on);
    this.rotor.setVisible(on);
    this.beacon.setVisible(on && Math.floor(nowS * 2) % 2 === 0);
    this.beam.setVisible(on && p.phase !== "extracting");
    if (!on) return;
    const x = this.at.x + p.dx;
    const y = this.at.y + p.dy;
    const k = 1 / HELI_PX_PER_M;
    this.body.setPosition(x, y).setScale(k * p.scale).setAlpha(p.alpha);
    this.rotor
      .setPosition(x, y)
      .setDisplaySize(HELI_ROTOR_M * 2 * p.scale, HELI_ROTOR_M * 2 * p.scale)
      .setRotation(nowS * ROTOR_RAD_S)
      .setAlpha(p.alpha);
    this.beacon.setPosition(x + HELI_BEACON_AT_M.x * p.scale, y + HELI_BEACON_AT_M.y * p.scale).setAlpha(p.alpha);
    const f = Math.sin(nowS * BEAM_SWEEP_HZ) * 0.8 + 0.4;
    this.beam.setPosition(this.at.x + Math.cos(f) * BEAM_RX_M, this.at.y + Math.sin(f) * BEAM_RY_M).setAlpha(0.35 * p.alpha);
  }

  destroy(): void {
    for (const o of [this.pad, this.beam, this.body, this.rotor, this.beacon]) o.destroy();
  }
}
