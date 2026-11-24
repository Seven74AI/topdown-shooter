import type * as Phaser from "phaser";
import { addGeneratedTexture } from "./canvasTexture";
import { packAtlas, type FrameSpec, type PlacedFrame } from "./atlasLayout";

/**
 * Story 6.8 (T0, CA3 + ST1, brief 12 / 20): the special events' small atlas `event_atlas`
 * (`event_<name>_<variant>` frames ≤ 2048²), ported from `docs/art/epic-6/looks.html` (`pin`,
 * `IC.bell`, `IC.bang`, the ST1 chevron and dust): the marker pins (disc + icon + stem), the pulse
 * ring, the edge-arrow disc and tip, the amber chevron, three dust puffs and the hazard-light glow.
 * Colour rule (designer): amber `#ffb648` = an event you can use. Drawn in code through
 * `addGeneratedTexture` with its redraw callback (Android Chrome wipes canvases in the background).
 * 6.9 / 6.10 append their frames (gas, crate, survivor, flag) to `EVENT_FRAMES`.
 */
export const EVENT_ATLAS = "event_atlas";
export const EVENT_AMBER = "#ffb648";
export const EVENT_AMBER_HEX = 0xffb648;
const DISC_BG = "#101114";

export const EVENT_FRAMES = {
  pinBell: "event_pin_bell_a",
  pinBang: "event_pin_bang_a",
  ring: "event_ring_pulse_a",
  arrowBell: "event_arrow_bell_a",
  arrowBang: "event_arrow_bang_a",
  arrowTip: "event_arrow_tip_a",
  chevron: "event_chevron_a",
  dust0: "event_dust_a",
  dust1: "event_dust_b",
  dust2: "event_dust_c",
  glow: "event_glow_a",
} as const;

/** Frame sizes (px). The pin is 64 × 96: disc centre at (32, 30), the stem's tip at (32, 92). */
export const PIN_W = 64;
export const PIN_H = 96;
export const PIN_TIP_Y = 92;
const SIZES: Record<string, [number, number]> = {
  event_pin_bell_a: [PIN_W, PIN_H],
  event_pin_bang_a: [PIN_W, PIN_H],
  event_ring_pulse_a: [96, 96],
  event_arrow_bell_a: [64, 64],
  event_arrow_bang_a: [64, 64],
  event_arrow_tip_a: [32, 32],
  event_chevron_a: [64, 48],
  event_dust_a: [64, 64],
  event_dust_b: [64, 64],
  event_dust_c: [64, 64],
  event_glow_a: [48, 48],
};

export function eventSpecs(): FrameSpec[] {
  return Object.values(EVENT_FRAMES).map((name) => {
    const [w, h] = SIZES[name] as [number, number];
    return { name, w, h };
  });
}

type Icon = (g: CanvasRenderingContext2D, s: number, col: string) => void;
const TAU = Math.PI * 2;
/** looks.html `IC.bell`. */
const bell: Icon = (g, s, col) => {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-s * 0.55, s * 0.35);
  g.quadraticCurveTo(-s * 0.5, -s * 0.6, 0, -s * 0.62);
  g.quadraticCurveTo(s * 0.5, -s * 0.6, s * 0.55, s * 0.35);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(0, s * 0.45, s * 0.16, 0, TAU);
  g.fill();
};
/** looks.html `IC.bang`. */
const bang: Icon = (g, s, col) => {
  g.fillStyle = col;
  g.fillRect(-s * 0.11, -s * 0.6, s * 0.22, s * 0.75);
  g.beginPath();
  g.arc(0, s * 0.42, s * 0.13, 0, TAU);
  g.fill();
};

/** looks.html `pin` at 2.6× (disc radius 26 px): stem, amber rim, dark disc, the icon. */
function drawPin(g: CanvasRenderingContext2D, f: PlacedFrame, icon: Icon): void {
  const cx = f.x + PIN_W / 2;
  const by = f.y + 30;
  const s = 22;
  g.fillStyle = EVENT_AMBER;
  g.beginPath();
  g.moveTo(cx, f.y + PIN_TIP_Y);
  g.lineTo(cx - 14, by + 16);
  g.lineTo(cx + 14, by + 16);
  g.closePath();
  g.fill();
  g.beginPath();
  g.arc(cx, by, s + 4, 0, TAU);
  g.fill();
  g.fillStyle = DISC_BG;
  g.beginPath();
  g.arc(cx, by, s, 0, TAU);
  g.fill();
  g.save();
  g.translate(cx, by);
  icon(g, s, EVENT_AMBER);
  g.restore();
}

function drawArrowDisc(g: CanvasRenderingContext2D, f: PlacedFrame, icon: Icon): void {
  const cx = f.x + 32;
  const cy = f.y + 32;
  g.fillStyle = EVENT_AMBER;
  g.beginPath();
  g.arc(cx, cy, 28, 0, TAU);
  g.fill();
  g.fillStyle = DISC_BG;
  g.beginPath();
  g.arc(cx, cy, 24, 0, TAU);
  g.fill();
  g.save();
  g.translate(cx, cy);
  icon(g, 20, EVENT_AMBER);
  g.restore();
}

/** looks.html ST1 chevron (a double-stroke "V" pointing down, +y), 1 m ≈ 53 px. */
function drawChevron(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const cx = f.x + 32;
  const cy = f.y + 22;
  const k = 50;
  g.fillStyle = EVENT_AMBER;
  g.beginPath();
  g.moveTo(cx - 0.6 * k, cy - 0.35 * k);
  g.lineTo(cx, cy + 0.35 * k);
  g.lineTo(cx + 0.6 * k, cy - 0.35 * k);
  g.lineTo(cx + 0.6 * k, cy - 0.05 * k);
  g.lineTo(cx, cy + 0.65 * k);
  g.lineTo(cx - 0.6 * k, cy - 0.05 * k);
  g.closePath();
  g.fill();
}

/** A soft dust puff (looks.html `dust` palette: warm grey-brown), `v` = which of three. */
function drawDust(g: CanvasRenderingContext2D, f: PlacedFrame, v: number): void {
  const cols = ["150,128,104", "120,110,98", "100,94,86"];
  const cx = f.x + 32;
  const cy = f.y + 32;
  const lumps = [
    [0, 0, 24],
    [-9 + v * 3, -6, 15],
    [10 - v * 2, 5, 13],
    [3, 10 - v * 3, 12],
  ];
  for (const [dx, dy, r] of lumps) {
    const grad = g.createRadialGradient(cx + (dx as number), cy + (dy as number), 0, cx + (dx as number), cy + (dy as number), r as number);
    grad.addColorStop(0, `rgba(${cols[v] as string},0.55)`);
    grad.addColorStop(0.6, `rgba(${cols[v] as string},0.25)`);
    grad.addColorStop(1, `rgba(${cols[v] as string},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx + (dx as number), cy + (dy as number), r as number, 0, TAU);
    g.fill();
  }
}

function drawFrame(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  switch (f.name) {
    case EVENT_FRAMES.pinBell:
      return drawPin(g, f, bell);
    case EVENT_FRAMES.pinBang:
      return drawPin(g, f, bang);
    case EVENT_FRAMES.ring: {
      g.strokeStyle = EVENT_AMBER;
      g.lineWidth = 5;
      g.beginPath();
      g.arc(f.x + 48, f.y + 48, 44, 0, TAU);
      g.stroke();
      return;
    }
    case EVENT_FRAMES.arrowBell:
      return drawArrowDisc(g, f, bell);
    case EVENT_FRAMES.arrowBang:
      return drawArrowDisc(g, f, bang);
    case EVENT_FRAMES.arrowTip: {
      // a triangle pointing +x (rotated to the target by the view)
      g.fillStyle = EVENT_AMBER;
      g.beginPath();
      g.moveTo(f.x + 30, f.y + 16);
      g.lineTo(f.x + 4, f.y + 4);
      g.lineTo(f.x + 4, f.y + 28);
      g.closePath();
      g.fill();
      return;
    }
    case EVENT_FRAMES.chevron:
      return drawChevron(g, f);
    case EVENT_FRAMES.dust0:
      return drawDust(g, f, 0);
    case EVENT_FRAMES.dust1:
      return drawDust(g, f, 1);
    case EVENT_FRAMES.dust2:
      return drawDust(g, f, 2);
    case EVENT_FRAMES.glow: {
      const grad = g.createRadialGradient(f.x + 24, f.y + 24, 0, f.x + 24, f.y + 24, 23);
      grad.addColorStop(0, "rgba(255,230,170,1)");
      grad.addColorStop(0.25, "rgba(255,182,72,0.9)");
      grad.addColorStop(1, "rgba(255,160,40,0)");
      g.fillStyle = grad;
      g.fillRect(f.x, f.y, 48, 48);
      return;
    }
    default:
      return;
  }
}

/** Creates the event atlas once per game (idempotent; textures outlive scene restarts). */
export function ensureEventTextures(scene: Phaser.Scene, makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): void {
  if (scene.textures.exists(EVENT_ATLAS)) return;
  const layout = packAtlas(eventSpecs());
  const canvas = makeCanvas();
  canvas.width = layout.width;
  canvas.height = layout.height;
  addGeneratedTexture(
    scene,
    EVENT_ATLAS,
    canvas,
    (g) => {
      for (const f of layout.frames) {
        g.save();
        g.beginPath();
        g.rect(f.x, f.y, f.w, f.h);
        g.clip();
        drawFrame(g, f);
        g.restore();
      }
    },
    (tex) => {
      for (const f of layout.frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
    },
  );
}
