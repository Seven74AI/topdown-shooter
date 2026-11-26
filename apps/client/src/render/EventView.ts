import type * as Phaser from "phaser";
import { EVENT_KINDS, EVENT_PHASE, type StampedeLane, type World } from "@topdown/shared";
import { EVENT_AMBER_HEX, EVENT_ATLAS, EVENT_FRAMES, PIN_H, PIN_TIP_Y, PIN_W, ensureEventTextures } from "./city/eventArt";
import { aboveDarkness } from "./darkness/aboveDark";
import { createEventMarkerLook, eventMarkerLook, type EventMarkerLook } from "./eventMarkers";
import { EventPickupsView } from "./EventPickupsView";
import { createPairHold, placeSecondEventArrow } from "./eventArrowPair";
import { layoutBossBar } from "../scenes/bossBar";
import { EVENT_ARROW_DISC_FRAC, EVENT_ARROW_TIP_FRAC, EVENT_ARROW_TIP_OFFSET, newWaveControlRects, placeEventArrow, waveControlRects, type EventArrowPlace, type Insets, type ScreenRect } from "./eventArrow";
import { carAlarmLoopPlaying, setCarAlarmPan, startCarAlarmLoop, stopCarAlarmLoop } from "../audio/placeholderSfx";

/**
 * Story 6.8 (AC 12; CA3, ST1, D10): the special events in the world. Everything above the darkness in
 * `ABOVE_DARK.marker` (brief 24: event markers always read in the dark); amber = an event you can use.
 *
 * - The marker pin (looks.html `pin`) with its pulse ring and, for the armed car, a countdown arc;
 *   off screen an edge arrow (disc + icon + tip) at the view's edge (D10).
 * - The armed / sounding car's hazard lights (4 glows at its corners, blinking).
 * - The stampede's warning: amber chevrons down the lane (≤ `events.json › fx.maxChevrons`, pooled)
 *   and dust puffs at its start edge (≤ `fx.maxDustParticles`, pooled, oldest reused).
 * - The car alarm's loop, panned to the car's side, while the state says it sounds.
 *
 * Pooled and capped; nothing is created per frame. Reads one source (`world.special.active`) in solo
 * and online, with the host's estimated server tick.
 */
const PIN_M = 1.3; // the pin's height on the map (m)
const RING_M = 1.1;
/** The edge arrow's size on screen (CSS px; disc + tip), fixed in px so the HUD layout test can check it (review M2). */
export const EVENT_ARROW_CSS_PX = 34;
const CHEVRON_M = 1.2;
const CHEVRON_GAP_M = 3;
const DUST_M = 2.2;
const DUST_LIFE_S = 1.6;
const DUST_PER_S = 24;
const GLOW_M = 0.9;
const EDGE_MARGIN_M = 1.2; // eventMarkerLook's own edge test (on / off screen)
const ARC_COLOR = EVENT_AMBER_HEX;

interface Dust {
  img: Phaser.GameObjects.Image;
  age: number;
  vx: number;
  vy: number;
}

export class EventView {
  private readonly pin: Phaser.GameObjects.Image;
  private readonly ring: Phaser.GameObjects.Image;
  private readonly arc: Phaser.GameObjects.Graphics;
  private readonly arrow: Phaser.GameObjects.Image;
  private readonly tip: Phaser.GameObjects.Image;
  private readonly glows: Phaser.GameObjects.Image[] = [];
  private readonly chevrons: Phaser.GameObjects.Image[] = [];
  private readonly dust: Dust[] = [];
  private nextDust = 0;
  private dustAcc = 0;
  private clockS = 0;
  private readonly look = createEventMarkerLook();
  /** Stories 6.9 / 6.10: tank, crate, survivor and flag. */
  private readonly pickups: EventPickupsView;
  private readonly controls = newWaveControlRects();
  /** Story 6.14 review L3: the Game scene sets it each frame — the boss bar shows, so the arrows keep off it. */
  bossBarShown = false;
  private readonly bossRect = { x: 0, y: 0, w: 0, h: 0, barY: 0, barH: 0 };
  private readonly arrowAt: EventArrowPlace = { x: 0, y: 0, angle: 0, side: 0 }; // `side`: the placement's hysteresis (re-review 2 RR1)
  private readonly flagHold = createPairHold(); // re-review RR2: the beside-side hold
  private readonly flagAt: EventArrowPlace = { x: 0, y: 0, angle: 0, side: 0 }; // Story 6.10: the flag's own placement (its own hysteresis)
  /** Deterministic jitter for the dust (no Math.random: same look on every phone). */
  private seed = 1;

  constructor(
    scene: Phaser.Scene,
    private readonly world: Readonly<World>,
  ) {
    ensureEventTextures(scene);
    const fx = world.balance.events.fx;
    this.ring = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.ring).setVisible(false), "marker");
    this.pin = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.pinBell).setDisplaySize((PIN_M * PIN_W) / PIN_H, PIN_M).setOrigin(0.5, PIN_TIP_Y / PIN_H).setVisible(false), "marker");
    this.arc = aboveDarkness(scene.add.graphics().setVisible(false), "marker");
    this.arrow = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.arrowBell).setVisible(false), "marker");
    this.tip = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.arrowTip).setVisible(false), "marker");
    for (let i = 0; i < 4; i++) this.glows.push(aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.glow).setDisplaySize(GLOW_M, GLOW_M).setBlendMode(1).setVisible(false), "marker"));
    for (let i = 0; i < fx.maxChevrons; i++) this.chevrons.push(aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, EVENT_FRAMES.chevron).setDisplaySize(CHEVRON_M, CHEVRON_M * 0.75).setVisible(false), "marker"));
    const dustFrames = [EVENT_FRAMES.dust0, EVENT_FRAMES.dust1, EVENT_FRAMES.dust2];
    for (let i = 0; i < fx.maxDustParticles; i++) {
      const img = aboveDarkness(scene.add.image(0, 0, EVENT_ATLAS, dustFrames[i % 3]).setDisplaySize(DUST_M, DUST_M).setVisible(false), "marker");
      this.dust.push({ img, age: DUST_LIFE_S, vx: 0, vy: 0 });
    }
    this.pickups = new EventPickupsView(scene, world);
  }

  private rand(): number {
    this.seed = (Math.imul(this.seed, 1103515245) + 12345) >>> 0;
    return this.seed / 4294967296;
  }

  /**
   * One frame. `serverTick`: the host's estimate of the server tick now; (vx, vy, vw, vh) the camera's
   * world view in metres; (sw, sh) the canvas in px, `k` its px per CSS px, `insets` the safe area (CSS px).
   */
  update(dtS: number, serverTick: number, vx: number, vy: number, vw: number, vh: number, sw: number, sh: number, k: number, insets: Insets): void {
    this.clockS += dtS;
    const look = eventMarkerLook(this.world, serverTick, vx, vy, vw, vh, EDGE_MARGIN_M, this.look);
    const kind = look.kind >= 0 ? EVENT_KINDS[look.kind] : undefined;
    // The pin, its pulse ring and the countdown arc.
    this.pin.setVisible(look.visible);
    this.ring.setVisible(look.visible && look.pulse);
    this.arc.setVisible(look.visible && look.arc >= 0 && kind === "car_alarm"); // 6.9: the gas arc is round the tank
    if (look.visible) {
      const bob = Math.sin(this.clockS * 4) * 0.06;
      this.pin.setFrame(pinFrameOf(look)).setPosition(look.x, look.y + bob);
      if (look.pulse) {
        const u = (this.clockS * 0.9) % 1;
        this.ring.setPosition(look.x, look.y).setDisplaySize(RING_M * (0.4 + u * 1.6), RING_M * (0.4 + u * 1.6)).setAlpha(0.6 * (1 - u));
      }
      if (look.arc >= 0 && kind === "car_alarm") {
        const cy = look.y + bob - PIN_M * ((PIN_TIP_Y - 30) / PIN_H);
        const r = PIN_M * (30 / PIN_H) + 0.08;
        this.arc.clear();
        this.arc.lineStyle(0.09, ARC_COLOR, 0.95);
        this.arc.beginPath();
        this.arc.arc(look.x, cy, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * look.arc, false);
        this.arc.strokePath();
      }
    }
    // The edge arrow (D10; review M2: placed in screen px off the wave controls, inside the safe area).
    const pxPerM = vw > 0 ? sw / vw : 1;
    const arrowPx = EVENT_ARROW_CSS_PX * k;
    const boss = this.bossBarShown ? layoutBossBar(sw, insets.left, insets.top, insets.right, k, this.bossRect) : null;
    const controls = waveControlRects(sw, sh, insets, k, this.controls, boss);
    const onEdge = look.visible && placeEventArrow((look.x - vx) * pxPerM, (look.y - vy) * pxPerM, sw, sh, insets, k, arrowPx, controls, this.arrowAt);
    this.arrow.setVisible(onEdge);
    this.tip.setVisible(onEdge);
    if (onEdge) {
      const e = this.arrowAt;
      const discM = (arrowPx * EVENT_ARROW_DISC_FRAC) / pxPerM;
      const ex = vx + e.x / pxPerM;
      const ey = vy + e.y / pxPerM;
      this.arrow.setFrame(arrowFrameOf(look)).setDisplaySize(discM, discM).setPosition(ex, ey);
      this.tip
        .setFrame(look.icon === "flame" ? EVENT_FRAMES.arrowTipGas : look.icon === "gun" || look.icon === "person" ? EVENT_FRAMES.arrowTipWhite : EVENT_FRAMES.arrowTip)
        .setDisplaySize(discM * EVENT_ARROW_TIP_FRAC, discM * EVENT_ARROW_TIP_FRAC)
        .setPosition(ex + Math.cos(e.angle) * discM * EVENT_ARROW_TIP_OFFSET, ey + Math.sin(e.angle) * discM * EVENT_ARROW_TIP_OFFSET)
        .setRotation(e.angle);
    }
    this.updateCar(look.visible && kind === "car_alarm" && look.blinkOn, vx, vw);
    this.updateStampede(dtS, look.chevrons ? look.lane : -1);
    // Story 6.10 (S1): the survivor's flag gets its own edge arrow, placed by the same rule (screen
    // px, off the wave controls / HP block, inside the safe area).
    const f = look.flag;
    // Review L11: it also keeps off the NPC arrow's drawn rect (the two never overlap).
    const flagEdge = f.visible && placeSecondEventArrow((f.x - vx) * pxPerM, (f.y - vy) * pxPerM, sw, sh, insets, k, arrowPx, controls, onEdge ? this.arrowAt : null, this.flagAt, this.flagHold);
    f.edge.visible = flagEdge;
    this.flagShown = flagEdge; // Story 8.7
    if (!f.visible) {
      this.flagAt.side = 0;
      this.flagHold.side = 0;
    } // no flag: its hysteresis starts fresh next time (6.8 RR1: one placement object per arrow)
    if (flagEdge) {
      f.edge.x = vx + this.flagAt.x / pxPerM;
      f.edge.y = vy + this.flagAt.y / pxPerM;
      f.edge.angle = this.flagAt.angle;
    }
    this.pickups.update(dtS, look, this.clockS, (arrowPx * EVENT_ARROW_DISC_FRAC) / pxPerM);
  }

  /** Story 7.12: the event's edge arrow as placed this frame (null: not shown) — the bag's badge keeps off it. */
  edgeArrowAt(): Readonly<EventArrowPlace> | null {
    return this.arrow.visible ? this.arrowAt : null;
  }

  /** Story 8.7 review M3: the 6.10 flag's edge arrow (screen px) when it shows, else null (pings keep off it). */
  flagArrowAt(): Readonly<EventArrowPlace> | null {
    return this.flagShown ? this.flagAt : null;
  }
  private flagShown = false;

  /** Story 7.12: this frame's HUD keep-off rects (the wave controls, the boss bar), for the bag's badge. */
  controlRects(): readonly ScreenRect[] {
    return this.controls;
  }

  /** Stories 6.9 / 6.10 (tests): the live vapour / smoke particle counts. */
  liveParticles(): { gas: number; smoke: number } {
    return this.pickups.liveParticles();
  }

  /** Story 6.10 (P1): the city lamps this frame: −1 no power-failure flicker, 0 on, 1 out (`CityView.powerFlicker`). */
  powerFlicker(): -1 | 0 | 1 {
    const a = this.world.special.active;
    if (EVENT_KINDS[a.kind] !== "power_failure" || a.phase !== EVENT_PHASE.FLICKER) return -1;
    return this.look.flicker ? 1 : 0;
  }

  private updateCar(blink: boolean, vx: number, vw: number): void {
    const a = this.world.special.active;
    const car = this.world.special.carAlarm;
    const lit = blink && car.car !== "";
    for (let i = 0; i < 4; i++) {
      const g = this.glows[i] as Phaser.GameObjects.Image;
      g.setVisible(lit);
      if (lit) g.setPosition(i % 2 === 0 ? car.minX + 0.25 : car.maxX - 0.25, i < 2 ? car.minY + 0.25 : car.maxY - 0.25);
    }
    // The alarm loop follows the state (a woken tab or late join hears it only while it really sounds).
    const sounding = EVENT_KINDS[a.kind] === "car_alarm" && a.phase === EVENT_PHASE.ALARM;
    if (sounding) {
      const pan = vw > 0 ? Math.max(-1, Math.min(1, (a.x - (vx + vw / 2)) / (vw / 2))) : 0;
      if (!carAlarmLoopPlaying()) startCarAlarmLoop(pan);
      else setCarAlarmPan(pan);
    } else if (carAlarmLoopPlaying()) stopCarAlarmLoop();
  }

  private updateStampede(dtS: number, laneIndex: number): void {
    const lane: StampedeLane | undefined = laneIndex >= 0 ? this.world.map.stampedeLanes[laneIndex] : undefined;
    // Chevrons: rows of 3 down the lane, drifting along it (looks.html ST1).
    const n = this.chevrons.length;
    for (let i = 0; i < n; i++) {
      const c = this.chevrons[i] as Phaser.GameObjects.Image;
      if (!lane) {
        c.setVisible(false);
        continue;
      }
      const alongX = lane.dir === "e" || lane.dir === "w";
      const width = alongX ? lane.maxY - lane.minY : lane.maxX - lane.minX;
      const len = alongX ? lane.maxX - lane.minX : lane.maxY - lane.minY;
      const col = i % 3;
      const row = Math.floor(i / 3);
      // the rows spread over the whole lane (so the lane reads where you stand), drifting along it
      const gap = Math.max(CHEVRON_GAP_M, (len - 2) / Math.max(1, Math.ceil(n / 3)));
      const drift = (this.clockS * 3) % gap;
      const along = 1 + row * gap + drift;
      if (along > len - 1) {
        c.setVisible(false);
        continue;
      }
      const lat = (alongX ? lane.minY : lane.minX) + ((col + 0.5) * width) / 3;
      const x = alongX ? (lane.dir === "e" ? lane.minX + along : lane.maxX - along) : lat;
      const y = alongX ? lat : lane.dir === "s" ? lane.minY + along : lane.maxY - along;
      // the frame points +y (down): rotate to the lane's direction
      const rot = lane.dir === "s" ? 0 : lane.dir === "n" ? Math.PI : lane.dir === "e" ? -Math.PI / 2 : Math.PI / 2;
      c.setVisible(true).setPosition(x, y).setRotation(rot).setAlpha(0.55);
    }
    // Dust: puffs at the start edge while warning; the rest fade out.
    if (lane) {
      this.dustAcc += DUST_PER_S * dtS;
      while (this.dustAcc >= 1) {
        this.dustAcc--;
        const d = this.dust[this.nextDust] as Dust;
        this.nextDust = (this.nextDust + 1) % this.dust.length;
        const alongX = lane.dir === "e" || lane.dir === "w";
        const lat = (alongX ? lane.minY : lane.minX) + this.rand() * (alongX ? lane.maxY - lane.minY : lane.maxX - lane.minX);
        const at = this.rand() * 1.2;
        const x = alongX ? (lane.dir === "e" ? lane.minX + at : lane.maxX - at) : lat;
        const y = alongX ? lat : lane.dir === "s" ? lane.minY + at : lane.maxY - at;
        const sx = lane.dir === "e" ? 1 : lane.dir === "w" ? -1 : 0;
        const sy = lane.dir === "s" ? 1 : lane.dir === "n" ? -1 : 0;
        d.age = 0;
        d.vx = sx * (0.4 + this.rand() * 0.8) + (this.rand() - 0.5) * 0.4;
        d.vy = sy * (0.4 + this.rand() * 0.8) + (this.rand() - 0.5) * 0.4;
        d.img.setPosition(x, y).setVisible(true);
      }
    }
    for (const d of this.dust) {
      if (d.age >= DUST_LIFE_S) {
        if (d.img.visible) d.img.setVisible(false);
        continue;
      }
      d.age += dtS;
      const u = Math.min(1, d.age / DUST_LIFE_S);
      d.img.setPosition(d.img.x + d.vx * dtS, d.img.y + d.vy * dtS).setAlpha(0.7 * (1 - u)).setDisplaySize(DUST_M * (0.6 + u * 0.8), DUST_M * (0.6 + u * 0.8));
    }
  }

  /** The scene shuts down: the loop stops. */
  destroy(): void {
    if (carAlarmLoopPlaying()) stopCarAlarmLoop();
  }
}

/** Stories 6.9 / 6.10: the pin frame of the marker's icon (amber bell / bang, yellow-green flame, white gun / person). */
function pinFrameOf(look: Readonly<EventMarkerLook>): string {
  switch (look.icon) {
    case "bang":
      return EVENT_FRAMES.pinBang;
    case "flame":
      return EVENT_FRAMES.pinFlame;
    case "gun":
      return EVENT_FRAMES.pinGun;
    case "person":
      return EVENT_FRAMES.pinPerson;
    default:
      return EVENT_FRAMES.pinBell;
  }
}

function arrowFrameOf(look: Readonly<EventMarkerLook>): string {
  switch (look.icon) {
    case "bang":
      return EVENT_FRAMES.arrowBang;
    case "flame":
      return EVENT_FRAMES.arrowFlame;
    case "gun":
      return EVENT_FRAMES.arrowGun;
    case "person":
      return EVENT_FRAMES.arrowPerson;
    default:
      return EVENT_FRAMES.arrowBell;
  }
}
