/**
 * Story 7.10 (AC 2, 3; E1; D2, D6): the survivor editor's two previews, on DOM canvases (not Phaser textures: no
 * `addGeneratedTexture`; Android can empty them while the page is hidden, so the editor redraws both on
 * `visibilitychange` → visible, `watchVisible`).
 *
 * - Big preview: my survivor in the in-game (night) colours, turning one turn every `TURN_S` seconds (D6), drag turns
 *   it; the propeller spins (`layerSpinAngle`). `BigPreview.frame()` draws from the look resolved by `setLook` (one
 *   resolve per draft change, never per frame: no allocation in the animation loop).
 * - Game-size preview: 35 CSS px per metre on wet asphalt, my slot ring, 3 walkers and 2 default teammates, drawn
 *   with the SAME path as the game's body bake (gun bar + `drawSurvivorBody`, stage 1, layers drawn still): E1.
 */
import { DEFAULT_LOOK, cosmeticPart, loadBalance, type AnimatedLayerId, type SurvivorLook } from "@topdown/shared";
import { CHAR, drawSurvivorBody, drawSurvivorGun, drawZombie } from "./city/spriteArt";
import { GROUND } from "./city/palette";
import { resolveLook, type ResolvedLook } from "./city/survivorLook";
import { SURVIVOR_LAYERS, drawLayerStill, layerSpinAngle } from "./city/survivorLayers";
import { SLOT_COLOR_CSS } from "./playerColors";
import { RING_ALPHA, RING_GAP_M, RING_WIDTH_M } from "./playerRing";

/** AC 2: the game-size preview's scale (CSS px per metre: the game's view on a phone). */
export const GAME_PX_PER_M = 35;
/** D6: one full turn of the big preview every this many seconds. */
export const TURN_S = 6;
/** Drag: radians per CSS px of horizontal drag. */
export const DRAG_RAD_PER_PX = 0.02;

const BALANCE = loadBalance();
/** The survivor's collision radius (m): the body is drawn at this radius in the game. */
export const PLAYER_RADIUS_M = BALANCE.player.radiusM;
const WALKER_RADIUS_M = BALANCE.zombies.types.walker?.radiusM ?? PLAYER_RADIUS_M;

/** The animated layer the look's headgear declares, or null. */
export function headLayer(look: ResolvedLook): AnimatedLayerId | null {
  return cosmeticPart("head", look.head)?.animated?.layer ?? null;
}

/**
 * One survivor exactly as the game draws it (E1): the shared gun frame (`drawSurvivorGun`), then the body bake
 * (`drawSurvivorBody`, pack on, animated layers left out), then the layer sprite (here still, at its still angle).
 */
export function drawGameSurvivor(g: CanvasRenderingContext2D, r: number, look: ResolvedLook): void {
  drawSurvivorGun(g, r);
  drawSurvivorBody(g, r, look, true, false);
  const layer = headLayer(look);
  if (layer) drawLayerStill(g, r, layer);
}

function ring(g: CanvasRenderingContext2D, x: number, y: number, pxPerM: number, slot: number): void {
  g.save();
  g.globalAlpha = RING_ALPHA;
  g.strokeStyle = SLOT_COLOR_CSS[slot] ?? SLOT_COLOR_CSS[0];
  g.lineWidth = RING_WIDTH_M * pxPerM;
  g.beginPath();
  g.arc(x, y, (PLAYER_RADIUS_M + RING_GAP_M) * pxPerM, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

/**
 * Where the game-size preview puts its people, as fractions of the half-width / half-height in metres (the scale stays
 * 35 px/m: a bigger preview shows more street, never bigger people), with their facing. Me at the centre.
 */
const TEAMMATES = [
  { fx: -1, fy: 0.55, a: -0.6 },
  { fx: 1, fy: 0.6, a: -2.4 },
] as const;
const WALKERS = [
  { fx: -0.7, fy: -1, a: 1.2, v: 0 },
  { fx: 0.05, fy: -1, a: 1.9, v: 1 },
  { fx: 0.8, fy: -0.95, a: 2.6, v: 2 },
] as const;

/** The other two slots shown as default teammates (never my own slot). */
export function teammateSlots(mySlot: number): readonly [number, number] {
  const others = [0, 1, 2, 3].filter((s) => s !== mySlot);
  return [others[0] as number, others[1] as number];
}

const DEFAULT_RESOLVED = resolveLook(DEFAULT_LOOK, 1);

/**
 * The game-size preview (drawn once per change): asphalt with a wet sheen, 3 walkers, 2 default teammates and me in
 * my slot ring at the centre, all at `GAME_PX_PER_M × dpr` device px per metre, in the night colours (stage 1).
 */
export function drawGamePreview(g: CanvasRenderingContext2D, wPx: number, hPx: number, dpr: number, look: ResolvedLook, mySlot: number): void {
  const k = GAME_PX_PER_M * dpr;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.fillStyle = GROUND.asphalt;
  g.fillRect(0, 0, wPx, hPx);
  // wet asphalt: a soft lamp sheen (one gradient per redraw, not per frame)
  const sheen = g.createRadialGradient(wPx * 0.3, hPx * 0.25, 0, wPx * 0.3, hPx * 0.25, Math.max(wPx, hPx) * 0.7);
  sheen.addColorStop(0, GROUND.wetSheen);
  sheen.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sheen;
  g.fillRect(0, 0, wPx, hPx);
  const cx = wPx / 2;
  const cy = hPx * 0.55;
  const hw = wPx / 2 - PLAYER_RADIUS_M * k * 1.6; // keep each body inside the picture
  const hh = hPx / 2 - PLAYER_RADIUS_M * k * 1.6;
  for (const z of WALKERS) {
    g.save();
    g.translate(cx + z.fx * hw, hPx / 2 + z.fy * hh);
    g.rotate(z.a);
    drawZombie(g, "walker", WALKER_RADIUS_M * k, z.v);
    g.restore();
  }
  const [s1, s2] = teammateSlots(mySlot);
  TEAMMATES.forEach((t, i) => {
    const x = cx + t.fx * hw;
    const y = hPx / 2 + t.fy * hh;
    ring(g, x, y, k, i === 0 ? s1 : s2);
    g.save();
    g.translate(x, y);
    g.rotate(t.a);
    drawGameSurvivor(g, PLAYER_RADIUS_M * k, DEFAULT_RESOLVED);
    g.restore();
  });
  ring(g, cx, cy, k, mySlot);
  g.save();
  g.translate(cx, cy);
  g.rotate(-Math.PI / 2);
  drawGameSurvivor(g, PLAYER_RADIUS_M * k, look);
  g.restore();
}

/**
 * The big turning preview. `setLook` resolves the draft once (D2: night colours, stage 1); `frame(timeMs)` only draws.
 * `resolve` is injectable so a test can count resolves per frame (none).
 */
export class BigPreview {
  private look: ResolvedLook = DEFAULT_RESOLVED;
  private layer: AnimatedLayerId | null = null;
  /** Radians added by dragging. */
  dragAngle = 0;
  /** Frames drawn (tests). */
  frames = 0;

  constructor(private readonly resolve: (look: SurvivorLook, stage: number) => ResolvedLook = resolveLook) {}

  setLook(look: SurvivorLook): void {
    this.look = this.resolve(look, 1);
    this.layer = headLayer(this.look);
  }

  /** The body angle at `timeMs` (facing up at 0, one turn every TURN_S seconds, plus the drag). */
  angle(timeMs: number): number {
    return -Math.PI / 2 + ((timeMs / 1000 / TURN_S) % 1) * Math.PI * 2 + this.dragAngle;
  }

  /** Draws one frame into a `wPx × hPx` canvas (device px): ring in my slot colour, the survivor, the spinning layer. */
  frame(g: CanvasRenderingContext2D, wPx: number, hPx: number, timeMs: number, slot: number): void {
    this.frames++;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, wPx, hPx);
    const side = Math.min(wPx, hPx);
    const r = side / 5.4; // gun (2.05 r ahead) and pack fit while it turns
    const cx = wPx / 2;
    const cy = hPx / 2;
    const pxPerM = r / PLAYER_RADIUS_M;
    ring(g, cx, cy, pxPerM, slot);
    g.save();
    g.translate(cx, cy);
    g.rotate(this.angle(timeMs));
    g.translate(-r * 0.3, 0); // turn about the body, not the gun tip
    drawSurvivorGun(g, r);
    drawSurvivorBody(g, r, this.look, true, false);
    if (this.layer) {
      const L = SURVIVOR_LAYERS[this.layer];
      g.translate(r * L.anchorR[0], r * L.anchorR[1]);
      g.rotate(layerSpinAngle(this.layer, timeMs));
      L.draw(g, r);
    }
    g.restore();
  }
}

/**
 * Brief 20: calls `redraw` whenever the page becomes visible again (Android may have emptied the canvases while it
 * was hidden). Returns the unsubscribe.
 */
export function watchVisible(doc: Pick<Document, "addEventListener" | "removeEventListener" | "visibilityState">, redraw: () => void): () => void {
  const on = (): void => {
    if (doc.visibilityState === "visible") redraw();
  };
  doc.addEventListener("visibilitychange", on);
  return () => doc.removeEventListener("visibilitychange", on);
}

/** The outline colour of the drawings (kept for tests of the preview's survivor palette). */
export const OUTLINE = CHAR.outline;
