import type * as Phaser from "phaser";
import { PING_KINDS, PING_LABELS, type PingKind } from "@topdown/shared";
import { frameName, packAtlas, type FrameSpec, type PlacedFrame } from "./city/atlasLayout";
import { addGeneratedTexture } from "./city/canvasTexture";

/**
 * Story 8.7 (AC 1, decision E8-P2): the four ping icons, drawn in code into one small atlas `atlas_ping` through
 * `addGeneratedTexture` (Android redraw, brief 12). Every frame is white (with a dark edge where it sits on the
 * world); the view tints the disc and the arrow with the sender's slot colour (`SLOT_COLORS`: blue, orange, green,
 * purple — never red: red = danger, Epic 6 colour rule). Readability sheet items 130–133.
 *
 * - Help! = a white cross on the slot-colour disc
 * - Over here = a downward pin
 * - Big one! = a heavy "!!" in a triangle (the Brute and the Behemoth)
 * - Ready = a check
 *
 * Each kind also has its word baked under it (`ping_word<kind>_a`), and the HUD button its own glyph
 * (`ping_button_a`: a pin with two signal arcs).
 */
export const ATLAS_PING = "atlas_ping";
export const PING_DISC = frameName("ping", "disc", "a");
export const PING_RING = frameName("ping", "ring", "a");
export const PING_TIP = frameName("ping", "tip", "a");
export const PING_BUTTON_GLYPH = frameName("ping", "button", "a");
export const PING_GLYPHS: readonly string[] = PING_KINDS.map((k) => frameName("ping", k, "a"));
export const PING_WORDS: readonly string[] = PING_KINDS.map((k) => frameName("ping", `word${k}`, "a"));
/** Frame sizes (texture px). */
export const PING_ICON_PX = 128;
export const PING_WORD_W_PX = 288;
export const PING_WORD_H_PX = 64;

type G = CanvasRenderingContext2D;

function specs(): FrameSpec[] {
  const out: FrameSpec[] = [];
  for (const name of [PING_DISC, PING_RING, PING_TIP, PING_BUTTON_GLYPH, ...PING_GLYPHS]) out.push({ name, w: PING_ICON_PX, h: PING_ICON_PX });
  for (const name of PING_WORDS) out.push({ name, w: PING_WORD_W_PX, h: PING_WORD_H_PX });
  return out;
}

const DARK = "rgba(10,12,16,0.85)";

function glyph(g: G, kind: PingKind, s: number): void {
  // drawn in a unit box (0..1) scaled to the frame; white with a dark outline so it reads over any slot colour
  g.lineJoin = "round";
  g.lineCap = "round";
  const stroke = (w: number): void => {
    g.strokeStyle = DARK;
    g.lineWidth = w + 0.06;
    g.stroke();
    g.strokeStyle = "#ffffff";
    g.lineWidth = w;
    g.stroke();
  };
  g.save();
  g.scale(s, s);
  if (kind === "help") {
    // a white cross (plus)
    g.beginPath();
    g.moveTo(0.5, 0.24);
    g.lineTo(0.5, 0.76);
    g.moveTo(0.24, 0.5);
    g.lineTo(0.76, 0.5);
    stroke(0.16);
  } else if (kind === "here") {
    // a downward pin: a round head and its point at the bottom
    g.beginPath();
    g.moveTo(0.5, 0.84);
    g.bezierCurveTo(0.36, 0.64, 0.26, 0.52, 0.26, 0.4);
    g.arc(0.5, 0.4, 0.24, Math.PI, 0, false);
    g.bezierCurveTo(0.74, 0.52, 0.64, 0.64, 0.5, 0.84);
    g.closePath();
    g.fillStyle = DARK;
    g.lineWidth = 0.08;
    g.strokeStyle = DARK;
    g.stroke();
    g.fillStyle = "#ffffff";
    g.fill();
    g.beginPath();
    g.arc(0.5, 0.4, 0.09, 0, Math.PI * 2);
    g.fillStyle = DARK;
    g.fill();
  } else if (kind === "big") {
    // a triangle outline with a heavy "!!"
    g.beginPath();
    g.moveTo(0.5, 0.14);
    g.lineTo(0.88, 0.82);
    g.lineTo(0.12, 0.82);
    g.closePath();
    stroke(0.08);
    for (const x of [0.43, 0.57]) {
      g.beginPath();
      g.moveTo(x, 0.38);
      g.lineTo(x, 0.6);
      stroke(0.085);
      g.beginPath();
      g.arc(x, 0.71, 0.045, 0, Math.PI * 2);
      g.fillStyle = "#ffffff";
      g.fill();
    }
  } else {
    // a check
    g.beginPath();
    g.moveTo(0.26, 0.52);
    g.lineTo(0.44, 0.7);
    g.lineTo(0.76, 0.32);
    stroke(0.13);
  }
  g.restore();
}

function drawFrame(g: G, f: PlacedFrame): void {
  g.save();
  g.translate(f.x, f.y);
  const s = f.w;
  if (f.name === PING_DISC) {
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2);
    g.fillStyle = "#ffffff";
    g.fill();
    g.lineWidth = s * 0.05;
    g.strokeStyle = "rgba(255,255,255,0.95)";
    g.stroke();
  } else if (f.name === PING_RING) {
    g.beginPath();
    g.arc(s / 2, s / 2, s * 0.44, 0, Math.PI * 2);
    g.lineWidth = s * 0.06;
    g.strokeStyle = "#ffffff";
    g.stroke();
  } else if (f.name === PING_TIP) {
    // the edge arrow's tip, pointing along +x
    g.beginPath();
    g.moveTo(s * 0.92, s / 2);
    g.lineTo(s * 0.18, s * 0.12);
    g.lineTo(s * 0.18, s * 0.88);
    g.closePath();
    g.fillStyle = "#ffffff";
    g.fill();
  } else if (f.name === PING_BUTTON_GLYPH) {
    glyph(g, "here", s * 0.8);
    g.translate(s * 0.4, s * 0.32);
    g.strokeStyle = "#ffffff";
    g.lineCap = "round";
    g.lineWidth = s * 0.06;
    for (const r of [0.3, 0.42]) {
      g.beginPath();
      g.arc(0, 0, s * r, -Math.PI * 0.32, Math.PI * 0.05);
      g.stroke();
    }
  } else {
    const gi = PING_GLYPHS.indexOf(f.name);
    if (gi >= 0) glyph(g, PING_KINDS[gi] as PingKind, s);
    const wi = PING_WORDS.indexOf(f.name);
    if (wi >= 0) {
      const label = PING_LABELS[PING_KINDS[wi] as PingKind];
      g.font = `700 ${Math.round(f.h * 0.62)}px system-ui, sans-serif`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.lineJoin = "round";
      g.lineWidth = f.h * 0.16;
      g.strokeStyle = DARK;
      g.strokeText(label, f.w / 2, f.h / 2, f.w - 8);
      g.fillStyle = "#ffffff";
      g.fillText(label, f.w / 2, f.h / 2, f.w - 8);
    }
  }
  g.restore();
}

/** Makes `atlas_ping` once (every scene shares the texture manager); repainted after a lost graphics context. */
export function ensurePingAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS_PING) || typeof document === "undefined") return;
  const layout = packAtlas(specs());
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  addGeneratedTexture(
    scene,
    ATLAS_PING,
    canvas,
    (g) => {
      g.clearRect(0, 0, canvas.width, canvas.height);
      for (const f of layout.frames) drawFrame(g, f);
    },
    (tex) => {
      for (const f of layout.frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
    },
  );
}

/** The atlas size (tests: ≤ 2048², brief 12). */
export function pingAtlasSize(): { width: number; height: number; frames: number } {
  const l = packAtlas(specs());
  return { width: l.width, height: l.height, frames: l.frames.length };
}
