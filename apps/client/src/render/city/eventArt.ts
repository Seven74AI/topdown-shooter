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
/** Stories 6.9 / 6.10 colour rule: yellow-green = gas, white = pick-ups and people. */
export const EVENT_GAS = "#dfe878";
export const EVENT_GAS_HEX = 0xdfe878;
export const EVENT_WHITE = "#e8e6e0";
export const EVENT_WHITE_HEX = 0xe8e6e0;
/** SD2's green flare smoke. */
export const EVENT_SMOKE_RGB = "70,190,90";
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
  // Story 6.9 (GL1, SD2 + SD3)
  pinFlame: "event_pin_flame_a",
  pinGun: "event_pin_gun_a",
  arrowFlame: "event_arrow_flame_a",
  arrowGun: "event_arrow_gun_a",
  arrowTipGas: "event_arrow_tip_b",
  arrowTipWhite: "event_arrow_tip_c",
  tank: "event_tank_a",
  vapour: "event_vapour_a",
  smoke: "event_smoke_a",
  crate: "event_crate_a",
  chute: "event_chute_a",
  flare: "event_flare_a",
  shadow: "event_shadow_a",
  // Story 6.10 (SV1–SV3, white flag)
  pinPerson: "event_pin_person_a",
  pinFlag: "event_pin_flag_a",
  arrowPerson: "event_arrow_person_a",
  arrowFlag: "event_arrow_flag_a",
  npc0: "event_npc_sv1_stand",
  npc0c: "event_npc_sv1_crouch",
  npc1: "event_npc_sv2_stand",
  npc1c: "event_npc_sv2_crouch",
  npc2: "event_npc_sv3_stand",
  npc2c: "event_npc_sv3_crouch",
} as const;

/** Story 6.10: the NPC frame for look 0–2 (SV1–SV3), standing or crouched. */
export function npcFrame(look: number, crouch: boolean): string {
  const k = Math.max(0, Math.min(2, look | 0));
  const stand = [EVENT_FRAMES.npc0, EVENT_FRAMES.npc1, EVENT_FRAMES.npc2] as const;
  const low = [EVENT_FRAMES.npc0c, EVENT_FRAMES.npc1c, EVENT_FRAMES.npc2c] as const;
  return (crouch ? low : stand)[k] as string;
}
/** NPC frames are 64 × 64 px for a 0.4 m body (the drawing's radius r = 22 px). */
export const NPC_PX = 64;
export const NPC_R_PX = 22;

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
  event_pin_flame_a: [PIN_W, PIN_H],
  event_pin_gun_a: [PIN_W, PIN_H],
  event_arrow_flame_a: [64, 64],
  event_arrow_gun_a: [64, 64],
  event_arrow_tip_b: [32, 32],
  event_arrow_tip_c: [32, 32],
  event_tank_a: [96, 48],
  event_vapour_a: [64, 64],
  event_smoke_a: [64, 64],
  event_crate_a: [80, 72],
  event_chute_a: [96, 56],
  event_flare_a: [32, 16],
  event_shadow_a: [64, 48],
  event_pin_person_a: [PIN_W, PIN_H],
  event_pin_flag_a: [PIN_W, PIN_H],
  event_arrow_person_a: [64, 64],
  event_arrow_flag_a: [64, 64],
  event_npc_sv1_stand: [64, 64],
  event_npc_sv1_crouch: [64, 64],
  event_npc_sv2_stand: [64, 64],
  event_npc_sv2_crouch: [64, 64],
  event_npc_sv3_stand: [64, 64],
  event_npc_sv3_crouch: [64, 64],
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

/** looks.html `IC.flame`. */
const flame: Icon = (g, s, col) => {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(0, -s * 0.65);
  g.quadraticCurveTo(s * 0.6, -s * 0.05, s * 0.35, s * 0.45);
  g.quadraticCurveTo(0, s * 0.7, -s * 0.35, s * 0.45);
  g.quadraticCurveTo(-s * 0.6, -s * 0.05, 0, -s * 0.65);
  g.fill();
};
/** looks.html `IC.gun`. */
const gun: Icon = (g, s, col) => {
  g.fillStyle = col;
  g.fillRect(-s * 0.7, -s * 0.14, s * 1.25, s * 0.24);
  g.fillRect(-s * 0.7, -s * 0.14, s * 0.32, s * 0.5);
  g.fillRect(s * 0.1, -s * 0.32, s * 0.4, s * 0.16);
  g.fillRect(-s * 0.2, s * 0.06, s * 0.14, s * 0.3);
};
/** looks.html `IC.person`. */
const person: Icon = (g, s, col) => {
  g.fillStyle = col;
  g.beginPath();
  g.arc(0, -s * 0.32, s * 0.22, 0, TAU);
  g.fill();
  g.beginPath();
  g.moveTo(-s * 0.38, s * 0.55);
  g.quadraticCurveTo(-s * 0.36, -s * 0.06, 0, -s * 0.06);
  g.quadraticCurveTo(s * 0.36, -s * 0.06, s * 0.38, s * 0.55);
  g.closePath();
  g.fill();
};
/** looks.html `IC.flag`. */
const flag: Icon = (g, s, col) => {
  g.strokeStyle = col;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(-s * 0.35, s * 0.6);
  g.lineTo(-s * 0.35, -s * 0.6);
  g.stroke();
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(-s * 0.3, -s * 0.6);
  g.lineTo(s * 0.5, -s * 0.35);
  g.lineTo(-s * 0.3, -s * 0.08);
  g.closePath();
  g.fill();
};

/** looks.html `pin` at 2.6× (disc radius 26 px): stem, rim in `col` (amber by default), dark disc, the icon. */
function drawPin(g: CanvasRenderingContext2D, f: PlacedFrame, icon: Icon, col: string = EVENT_AMBER): void {
  const cx = f.x + PIN_W / 2;
  const by = f.y + 30;
  const s = 22;
  g.fillStyle = col;
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
  icon(g, s, col);
  g.restore();
}

function drawArrowDisc(g: CanvasRenderingContext2D, f: PlacedFrame, icon: Icon, col: string = EVENT_AMBER): void {
  const cx = f.x + 32;
  const cy = f.y + 32;
  g.fillStyle = col;
  g.beginPath();
  g.arc(cx, cy, 28, 0, TAU);
  g.fill();
  g.fillStyle = DISC_BG;
  g.beginPath();
  g.arc(cx, cy, 24, 0, TAU);
  g.fill();
  g.save();
  g.translate(cx, cy);
  icon(g, 20, col);
  g.restore();
}

function drawTip(g: CanvasRenderingContext2D, f: PlacedFrame, col: string): void {
  // a triangle pointing +x (rotated to the target by the view)
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(f.x + 30, f.y + 16);
  g.lineTo(f.x + 4, f.y + 4);
  g.lineTo(f.x + 4, f.y + 28);
  g.closePath();
  g.fill();
}

/** A soft round puff in `rgb` (GL1 vapour, SD2 smoke). */
function drawPuff(g: CanvasRenderingContext2D, f: PlacedFrame, rgb: string, a: number): void {
  const cx = f.x + 32;
  const cy = f.y + 32;
  for (const [dx, dy, r] of [
    [0, 0, 26],
    [-8, -5, 16],
    [9, 6, 14],
  ] as const) {
    const grad = g.createRadialGradient(cx + dx, cy + dy, 0, cx + dx, cy + dy, r);
    grad.addColorStop(0, `rgba(${rgb},${a})`);
    grad.addColorStop(0.6, `rgba(${rgb},${a * 0.45})`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx + dx, cy + dy, r, 0, TAU);
    g.fill();
  }
}

/** looks.html GL1: two steel fill caps on the forecourt (red and yellow rims), 1 m ≈ 48 px. */
function drawTank(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const cy = f.y + 24;
  for (const [dx, rim] of [
    [-24, "#b8261c"],
    [24, "#c99a1f"],
  ] as const) {
    const cx = f.x + 48 + dx;
    const grad = g.createRadialGradient(cx - 3, cy - 3, 1, cx, cy, 11);
    grad.addColorStop(0, "#8a8e94");
    grad.addColorStop(1, "#3c3f44");
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, 11, 0, TAU);
    g.fill();
    g.strokeStyle = "#1b1c1f";
    g.lineWidth = 1.5;
    g.stroke();
    g.fillStyle = rim;
    g.beginPath();
    g.arc(cx, cy, 4, 0, TAU);
    g.fill();
  }
}

/** SD2 olive military case (rivets, a pale stencil band) strapped to an SD3 wooden pallet; 1 m ≈ 80 px. */
function drawCrate(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const x = f.x;
  const y = f.y;
  // pallet
  g.fillStyle = "#8a6b45";
  g.fillRect(x + 4, y + 6, 72, 60);
  g.strokeStyle = "#4a3620";
  g.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    g.beginPath();
    g.moveTo(x + 4, y + 6 + i * 15);
    g.lineTo(x + 76, y + 6 + i * 15);
    g.stroke();
  }
  g.strokeRect(x + 4, y + 6, 72, 60);
  // case
  const grad = g.createLinearGradient(x, y + 12, x, y + 60);
  grad.addColorStop(0, "#5d6a44");
  grad.addColorStop(1, "#3c452c");
  g.fillStyle = grad;
  g.fillRect(x + 12, y + 12, 56, 48);
  g.strokeStyle = "#1b1c14";
  g.lineWidth = 2;
  g.strokeRect(x + 12, y + 12, 56, 48);
  g.fillStyle = "#d8d4c4";
  g.fillRect(x + 20, y + 32, 40, 7);
  g.fillStyle = "#8a8f80";
  for (const [rx, ry] of [
    [17, 17],
    [63, 17],
    [17, 55],
    [63, 55],
  ] as const) {
    g.beginPath();
    g.arc(x + rx, y + ry, 2, 0, TAU);
    g.fill();
  }
  // SD3 straps (orange)
  g.fillStyle = "#c9772a";
  g.fillRect(x + 28, y + 6, 5, 60);
  g.fillRect(x + 47, y + 6, 5, 60);
}

function drawChute(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const cx = f.x + 48;
  const cy = f.y + 46;
  const grad = g.createLinearGradient(cx, f.y, cx, cy);
  grad.addColorStop(0, "#7a8660");
  grad.addColorStop(1, "#4b5536");
  g.fillStyle = grad;
  g.beginPath();
  g.arc(cx, cy, 44, Math.PI, 0);
  g.closePath();
  g.fill();
  g.strokeStyle = "rgba(20,20,20,0.7)";
  g.lineWidth = 1.5;
  g.stroke();
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(Math.PI + (i * Math.PI) / 4) * 44, cy + Math.sin(Math.PI + (i * Math.PI) / 4) * 44);
    g.stroke();
  }
}

const NPC_LOOKS = [
  { coat: "#c9a21c", hood: true, tie: false, nurse: false },
  { coat: "#2f7f7a", hood: false, tie: false, nurse: true },
  { coat: "#d8d6d0", hood: false, tie: true, nurse: false },
] as const;

function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number): number => Math.max(0, Math.min(255, Math.round(c * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** looks.html `drawNPC` (facing +x, r = 22 px): arms, coat, tie / nurse badge, head, hood or hair. No gun, no ring. */
function drawNpc(g: CanvasRenderingContext2D, f: PlacedFrame, look: number, crouch: boolean): void {
  const L = NPC_LOOKS[look] as (typeof NPC_LOOKS)[number];
  const r = NPC_R_PX;
  const outline = "#16171a";
  g.save();
  g.translate(f.x + 32, f.y + 32);
  const s = crouch ? 0.82 : 1;
  g.scale(s, s);
  g.lineJoin = "round";
  g.strokeStyle = L.coat;
  g.lineCap = "round";
  g.lineWidth = r * 0.28;
  g.beginPath();
  if (crouch) {
    g.moveTo(0, -r * 0.55);
    g.lineTo(r * 0.35, -r * 0.25);
    g.moveTo(0, r * 0.55);
    g.lineTo(r * 0.35, r * 0.25);
  } else {
    g.moveTo(-r * 0.1, -r * 0.62);
    g.lineTo(r * 0.25, -r * 0.7);
    g.moveTo(-r * 0.1, r * 0.62);
    g.lineTo(r * 0.25, r * 0.7);
  }
  g.stroke();
  g.lineCap = "butt";
  g.strokeStyle = outline;
  g.lineWidth = Math.max(1, r * 0.08);
  g.fillStyle = L.coat;
  g.beginPath();
  g.ellipse(-r * 0.05, 0, r * 0.5, r * 0.86, 0, 0, TAU);
  g.fill();
  g.stroke();
  if (L.tie) {
    g.fillStyle = "#7a1f1a";
    g.fillRect(-r * 0.1, -r * 0.05, r * 0.42, r * 0.1);
  }
  if (L.nurse) {
    g.fillStyle = "#e8e6e0";
    g.fillRect(-r * 0.3, -r * 0.06, r * 0.22, r * 0.12);
    g.fillRect(-r * 0.25, -r * 0.11, r * 0.12, r * 0.22);
  }
  g.fillStyle = "#c49a7c";
  g.beginPath();
  g.arc(r * 0.12, 0, r * 0.38, 0, TAU);
  g.fill();
  g.stroke();
  g.fillStyle = L.hood ? shade(L.coat, -0.2) : L.nurse ? "#2a2420" : "#4a3a2a";
  g.beginPath();
  g.ellipse(L.hood ? 0.02 * r : -0.02 * r, 0, r * (L.hood ? 0.42 : 0.32), r * (L.hood ? 0.44 : 0.36), 0, 0, TAU);
  g.fill();
  if (L.hood) g.stroke();
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
    case EVENT_FRAMES.arrowTip:
      return drawTip(g, f, EVENT_AMBER);
    case EVENT_FRAMES.arrowTipGas:
      return drawTip(g, f, EVENT_GAS);
    case EVENT_FRAMES.arrowTipWhite:
      return drawTip(g, f, EVENT_WHITE);
    case EVENT_FRAMES.pinFlame:
      return drawPin(g, f, flame, EVENT_GAS);
    case EVENT_FRAMES.arrowFlame:
      return drawArrowDisc(g, f, flame, EVENT_GAS);
    case EVENT_FRAMES.pinGun:
      return drawPin(g, f, gun, EVENT_WHITE);
    case EVENT_FRAMES.arrowGun:
      return drawArrowDisc(g, f, gun, EVENT_WHITE);
    case EVENT_FRAMES.pinPerson:
      return drawPin(g, f, person, EVENT_WHITE);
    case EVENT_FRAMES.arrowPerson:
      return drawArrowDisc(g, f, person, EVENT_WHITE);
    case EVENT_FRAMES.pinFlag:
      return drawPin(g, f, flag, EVENT_WHITE);
    case EVENT_FRAMES.arrowFlag:
      return drawArrowDisc(g, f, flag, EVENT_WHITE);
    case EVENT_FRAMES.tank:
      return drawTank(g, f);
    case EVENT_FRAMES.vapour:
      return drawPuff(g, f, "223,232,120", 0.5);
    case EVENT_FRAMES.smoke:
      return drawPuff(g, f, EVENT_SMOKE_RGB, 0.55);
    case EVENT_FRAMES.crate:
      return drawCrate(g, f);
    case EVENT_FRAMES.chute:
      return drawChute(g, f);
    case EVENT_FRAMES.flare: {
      g.fillStyle = "#222";
      g.fillRect(f.x + 4, f.y + 5, 20, 6);
      g.fillStyle = `rgb(${EVENT_SMOKE_RGB})`;
      g.beginPath();
      g.arc(f.x + 25, f.y + 8, 4, 0, TAU);
      g.fill();
      return;
    }
    case EVENT_FRAMES.shadow: {
      const grad = g.createRadialGradient(f.x + 32, f.y + 24, 0, f.x + 32, f.y + 24, 30);
      grad.addColorStop(0, "rgba(0,0,0,0.6)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad;
      g.fillRect(f.x, f.y, 64, 48);
      return;
    }
    case EVENT_FRAMES.npc0:
      return drawNpc(g, f, 0, false);
    case EVENT_FRAMES.npc0c:
      return drawNpc(g, f, 0, true);
    case EVENT_FRAMES.npc1:
      return drawNpc(g, f, 1, false);
    case EVENT_FRAMES.npc1c:
      return drawNpc(g, f, 1, true);
    case EVENT_FRAMES.npc2:
      return drawNpc(g, f, 2, false);
    case EVENT_FRAMES.npc2c:
      return drawNpc(g, f, 2, true);
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
