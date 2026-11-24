import type * as Phaser from "phaser";
import { EVENT_KINDS, EVENT_PHASE, NPC_STATE, playerIdOfSlot, type World } from "@topdown/shared";
import { EVENT_ATLAS, EVENT_FRAMES, EVENT_GAS_HEX, EVENT_SMOKE_RGB, EVENT_WHITE, EVENT_WHITE_HEX, NPC_PX, NPC_R_PX, PIN_H, PIN_TIP_Y, PIN_W, npcFrame } from "./city/eventArt";
import { aboveDarkness } from "./darkness/aboveDark";
import { dashedCircle } from "./dashes";
import { NPC_PIN_LIFT_M, type EventMarkerLook } from "./eventMarkers";

/**
 * Stories 6.9 + 6.10 (GL1, SD2 + SD3, SV1–SV3, white flag): the parts of the gas leak, the supply
 * drop and the survivor that `EventView` (6.8's pin, pulse ring and edge arrow) does not draw:
 *
 * - Gas leak: the tank's two caps, the yellow-green vapour pouring from the fill cap (pooled,
 *   ≤ `events.json › fx.maxGasParticles`), the dashed 6 m ring and the countdown arc round the tank
 *   (drawn from the server's phase tick: it ends on the blast, G4), the label.
 * - Supply drop: the flare and its green smoke (pooled, ≤ `fx.maxFlareParticles`), the crate falling
 *   on its chute over the flare's last 1.2 s (shadow shrinking), the crate on the ground, the white
 *   fill ring while someone stands on it (G6), the weapon label (G5).
 * - Survivor: the NPC (SV1/SV2/SV3, standing or crouched; no gun, no slot ring: S1), its HP bar and
 *   label, a faint dashed 3 m circle round its leader, the white flag's pin with its 2 m ground ring
 *   and its own edge arrow.
 *
 * Above the darkness (brief 24): the crate, the NPC, its HP bar and the rings in `ABOVE_DARK.pickup`,
 * pins / arcs / labels / arrows in `ABOVE_DARK.marker`. Pooled; nothing created per frame.
 */
const PIN_M = 1.3;
const ARROW_M = 0.9;
const TANK_W_M = 2;
const CRATE_M = 1.0;
const CHUTE_M = 1.9;
const NPC_M = (NPC_PX / NPC_R_PX) * 0.4; // a 0.4 m body
const PUFF_M = 1.4;
const GAS_LIFE_S = 2.2;
const GAS_PER_S = 22;
const SMOKE_LIFE_S = 3;
const SMOKE_PER_S = 16;
const LABEL_PX = 28;
const LABEL_PX_PER_M = 40;
const NPC_SMOOTH_PER_S = 14;
const ARC_R_M = 1.3;
const FILL_R_M = 0.75;
const LEADER_RING_M = 3;
const DASH_M = 0.5;
const SLOT_IDS = [0, 1, 2, 3].map((s) => playerIdOfSlot(s) ?? "");

interface Puff {
  img: Phaser.GameObjects.Image;
  age: number;
  life: number;
  vx: number;
  vy: number;
}

const GAS_LEAK = EVENT_KINDS.indexOf("gas_leak");
const SUPPLY_DROP = EVENT_KINDS.indexOf("supply_drop");
const SURVIVOR = EVENT_KINDS.indexOf("survivor");

export class EventPickupsView {
  private readonly tank: Phaser.GameObjects.Image;
  private readonly rings: Phaser.GameObjects.Graphics;
  private readonly marks: Phaser.GameObjects.Graphics;
  private readonly label: Phaser.GameObjects.Text;
  private readonly npcLabel: Phaser.GameObjects.Text;
  private readonly gas: Puff[] = [];
  private readonly smoke: Puff[] = [];
  private nextGas = 0;
  private nextSmoke = 0;
  private gasAcc = 0;
  private smokeAcc = 0;
  private readonly flare: Phaser.GameObjects.Image;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly chute: Phaser.GameObjects.Image;
  private readonly crate: Phaser.GameObjects.Image;
  private readonly npc: Phaser.GameObjects.Image;
  private readonly flagPin: Phaser.GameObjects.Image;
  private readonly flagArrow: Phaser.GameObjects.Image;
  private readonly flagTip: Phaser.GameObjects.Image;
  private npcX = 0;
  private npcY = 0;
  private npcFace = 0;
  private npcShown = false;
  private shownLabel = "";
  private shownNpcLabel = "";
  private seed = 7;

  constructor(
    scene: Phaser.Scene,
    private readonly world: Readonly<World>,
  ) {
    const fx = world.balance.events.fx;
    const style = { fontFamily: "sans-serif", fontSize: `${LABEL_PX}px`, fontStyle: "bold", color: EVENT_WHITE, stroke: "#000000", strokeThickness: 6 };
    this.tank = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.tank).setDisplaySize(TANK_W_M, TANK_W_M / 2).setVisible(false), "pickup");
    this.shadow = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.shadow).setVisible(false), "pickup");
    this.flare = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.flare).setDisplaySize(0.6, 0.3).setVisible(false), "pickup");
    this.crate = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.crate).setDisplaySize(CRATE_M * (80 / 72), CRATE_M).setVisible(false), "pickup");
    this.chute = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.chute).setDisplaySize(CHUTE_M, CHUTE_M * (56 / 96)).setOrigin(0.5, 1).setVisible(false), "pickup");
    this.npc = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, npcFrame(0, true)).setDisplaySize(NPC_M, NPC_M).setVisible(false), "pickup");
    this.rings = aboveDarkness(scene.add.graphics().setVisible(false), "pickup");
    this.marks = aboveDarkness(scene.add.graphics().setVisible(false), "marker");
    this.label = aboveDarkness(scene.add.text(0, 0, "", style).setOrigin(0.5, 1).setScale(1 / LABEL_PX_PER_M).setVisible(false), "marker");
    this.npcLabel = aboveDarkness(scene.add.text(0, 0, "", style).setOrigin(0.5, 1).setScale(1 / LABEL_PX_PER_M).setVisible(false), "marker");
    this.flagPin = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.pinFlag).setDisplaySize((PIN_M * PIN_W) / PIN_H, PIN_M).setOrigin(0.5, PIN_TIP_Y / PIN_H).setVisible(false), "marker");
    this.flagArrow = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.arrowFlag).setDisplaySize(ARROW_M, ARROW_M).setVisible(false), "marker");
    this.flagTip = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.arrowTipWhite).setDisplaySize(ARROW_M * 0.5, ARROW_M * 0.5).setVisible(false), "marker");
    for (let i = 0; i < fx.maxGasParticles; i++) this.gas.push({ img: aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.vapour).setVisible(false), "pickup"), age: 1, life: 1, vx: 0, vy: 0 });
    for (let i = 0; i < fx.maxFlareParticles; i++) this.smoke.push({ img: aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.smoke).setVisible(false), "pickup"), age: 1, life: 1, vx: 0, vy: 0 });
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1103515245) + 12345) >>> 0;
    return this.seed / 4294967296;
  }

  /** Live particle counts (tests: the caps hold). */
  liveParticles(): { gas: number; smoke: number } {
    let gas = 0;
    let smoke = 0;
    for (const p of this.gas) if (p.age < p.life) gas++;
    for (const p of this.smoke) if (p.age < p.life) smoke++;
    return { gas, smoke };
  }

  update(dtS: number, look: Readonly<EventMarkerLook>, clockS: number): void {
    const a = this.world.special.active;
    const gasOn = a.kind === GAS_LEAK && a.phase === EVENT_PHASE.HISS;
    const crateOn = a.kind === SUPPLY_DROP && (a.phase === EVENT_PHASE.FLARE || a.phase === EVENT_PHASE.LANDED);
    const npcOn = a.kind === SURVIVOR && look.visible;
    this.rings.clear();
    this.marks.clear();
    this.rings.setVisible(gasOn || crateOn || npcOn);
    this.marks.setVisible(gasOn);
    // Label (one text, set only when it changes).
    const text = gasOn || crateOn ? look.label : "";
    if (text !== this.shownLabel) {
      this.shownLabel = text;
      this.label.setText(text).setColor(gasOn ? "#dfe878" : EVENT_WHITE);
    }
    this.label.setVisible(text !== "" && look.visible);
    if (text !== "") this.label.setPosition(look.x, look.y - PIN_M - 0.15);

    // ---- gas leak (GL1)
    this.tank.setVisible(gasOn);
    if (gasOn) {
      this.tank.setPosition(a.x, a.y);
      this.rings.lineStyle(0.08, EVENT_GAS_HEX, 0.55 + 0.3 * Math.sin(clockS * 8));
      dashedCircle(this.rings, a.x, a.y, look.ringM, DASH_M);
      this.rings.strokePath();
      if (look.arc >= 0) {
        this.marks.lineStyle(0.1, EVENT_GAS_HEX, 0.9);
        this.marks.beginPath();
        this.marks.arc(a.x, a.y, ARC_R_M, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * look.arc, false);
        this.marks.strokePath();
      }
      this.gasAcc += GAS_PER_S * dtS;
      while (this.gasAcc >= 1) {
        this.gasAcc--;
        const p = this.gas[this.nextGas] as Puff;
        this.nextGas = (this.nextGas + 1) % this.gas.length;
        const ang = this.rand() * 1.2 - 0.6 - Math.PI * 0.7;
        const sp = 0.6 + this.rand();
        p.age = 0;
        p.life = GAS_LIFE_S * (0.7 + this.rand() * 0.5);
        p.vx = Math.cos(ang) * sp;
        p.vy = Math.sin(ang) * sp;
        p.img.setPosition(a.x - 0.5 + (this.rand() - 0.5) * 0.2, a.y + (this.rand() - 0.5) * 0.2).setVisible(true);
      }
    } else this.gasAcc = 0;
    stepPuffs(this.gas, dtS, PUFF_M, 0.7);

    // ---- supply drop (SD2 + SD3)
    this.flare.setVisible(crateOn);
    if (crateOn) {
      this.flare.setPosition(a.x + 0.5, a.y + 0.4);
      if (a.phase === EVENT_PHASE.FLARE) {
        this.smokeAcc += SMOKE_PER_S * dtS;
        while (this.smokeAcc >= 1) {
          this.smokeAcc--;
          const p = this.smoke[this.nextSmoke] as Puff;
          this.nextSmoke = (this.nextSmoke + 1) % this.smoke.length;
          p.age = 0;
          p.life = SMOKE_LIFE_S * (0.7 + this.rand() * 0.5);
          p.vx = 0.35 + (this.rand() - 0.5) * 0.4;
          p.vy = -0.3 + (this.rand() - 0.5) * 0.4;
          p.img.setPosition(a.x + 0.55, a.y + 0.4).setVisible(true);
        }
      }
    }
    stepPuffs(this.smoke, dtS, PUFF_M * 1.2, 0.75);
    const falling = crateOn && look.crateFall >= 0;
    const down = crateOn && look.crateDown;
    this.crate.setVisible(falling || down);
    this.chute.setVisible(falling && look.crateFall < 1);
    this.shadow.setVisible(falling || down);
    if (falling || down) {
      const z = falling ? (1 - look.crateFall) * 8 : 0; // metres up
      const s = 1 + z * 0.08;
      this.shadow.setPosition(a.x + z * 0.15 + 0.1, a.y + z * 0.2 + 0.12).setDisplaySize(1.1 * s, 0.8 * s).setAlpha(0.4 * (0.4 + (1 - z / 8) * 0.6));
      this.crate.setPosition(a.x, a.y - z * 0.2).setScale((CRATE_M / 72) * s);
      this.chute.setPosition(a.x, a.y - z * 0.2 - CRATE_M * 0.3 * s).setScale((CHUTE_M / 96) * s);
    }
    if (down && look.fill >= 0) {
      this.rings.lineStyle(0.08, EVENT_WHITE_HEX, 0.95);
      this.rings.beginPath();
      this.rings.arc(a.x, a.y, FILL_R_M, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * look.fill, false);
      this.rings.strokePath();
    }

    // ---- survivor (SV1–SV3) and the white flag
    this.updateSurvivor(dtS, look, npcOn);
  }

  private updateSurvivor(dtS: number, look: Readonly<EventMarkerLook>, on: boolean): void {
    const n = this.world.special.survivor;
    const showNpc = on && (n.state === NPC_STATE.WAITING || n.state === NPC_STATE.FOLLOWING || n.state === NPC_STATE.SAVED);
    this.npc.setVisible(showNpc);
    if (!showNpc) this.npcShown = false;
    if (showNpc) {
      // DD3: drawn from the server's position, smoothed (it is never predicted).
      if (!this.npcShown) {
        this.npcX = n.x;
        this.npcY = n.y;
        this.npcShown = true;
      }
      const k = 1 - Math.exp(-NPC_SMOOTH_PER_S * dtS);
      const dx = n.x - this.npcX;
      const dy = n.y - this.npcY;
      if (dx * dx + dy * dy > 1e-6) this.npcFace = Math.atan2(dy, dx);
      this.npcX += dx * k;
      this.npcY += dy * k;
      this.npc.setFrame(npcFrame(n.look, look.crouch)).setPosition(this.npcX, this.npcY).setRotation(this.npcFace).setDisplaySize(NPC_M, NPC_M);
      // HP bar (white), over its head
      const hpFrac = Math.max(0, Math.min(1, n.hp / this.world.balance.events.survivor.hp));
      const bw = 0.9;
      this.rings.fillStyle(0x000000, 0.6);
      this.rings.fillRect(this.npcX - bw / 2 - 0.03, this.npcY - 0.75 - 0.03, bw + 0.06, 0.16);
      this.rings.fillStyle(EVENT_WHITE_HEX, 0.95);
      this.rings.fillRect(this.npcX - bw / 2, this.npcY - 0.75, bw * hpFrac, 0.1);
      // the leader's faint dashed 3 m pick-up circle
      if (look.leaderSlot >= 0) {
        const leader = this.world.players.get(SLOT_IDS[look.leaderSlot] ?? "");
        if (leader) {
          this.rings.lineStyle(0.05, EVENT_WHITE_HEX, 0.3);
          dashedCircle(this.rings, leader.x, leader.y, LEADER_RING_M, DASH_M);
          this.rings.strokePath();
        }
      }
    }
    const npcText = showNpc ? look.label : "";
    if (npcText !== this.shownNpcLabel) {
      this.shownNpcLabel = npcText;
      this.npcLabel.setText(npcText);
    }
    this.npcLabel.setVisible(npcText !== "");
    if (npcText !== "") this.npcLabel.setPosition(this.npcX, this.npcY - NPC_PIN_LIFT_M - PIN_M - 0.1);
    // the safe flag (S1) and its 2 m ring (S5)
    const f = look.flag;
    this.flagPin.setVisible(on && f.visible);
    if (on && f.visible) {
      this.flagPin.setPosition(f.x, f.y);
      this.rings.lineStyle(0.07, EVENT_WHITE_HEX, 0.8);
      this.rings.strokeCircle(f.x, f.y, this.world.balance.events.survivor.saveRadiusM);
    }
    this.flagArrow.setVisible(on && f.edge.visible);
    this.flagTip.setVisible(on && f.edge.visible);
    if (on && f.edge.visible) {
      this.flagArrow.setPosition(f.edge.x, f.edge.y);
      this.flagTip.setPosition(f.edge.x + Math.cos(f.edge.angle) * ARROW_M * 0.65, f.edge.y + Math.sin(f.edge.angle) * ARROW_M * 0.65).setRotation(f.edge.angle);
    }
  }
}

/** Ages, drifts, grows and fades the live puffs (the dead ones hide once). */
function stepPuffs(pool: Puff[], dtS: number, sizeM: number, alpha: number): void {
  for (const p of pool) {
    if (p.age >= p.life) {
      if (p.img.visible) p.img.setVisible(false);
      continue;
    }
    p.age += dtS;
    const u = Math.min(1, p.age / p.life);
    const s = sizeM * (0.5 + u * 1.3);
    p.img.setPosition(p.img.x + p.vx * dtS, p.img.y + p.vy * dtS).setDisplaySize(s, s).setAlpha(alpha * (1 - u));
  }
}

/** SD2's smoke colour (tests / readability sheet). */
export const SUPPLY_SMOKE_RGB = EVENT_SMOKE_RGB;
