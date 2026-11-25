import type * as Phaser from "phaser";
import { catalogueParts, cosmeticPart, decodeLook, type AnimatedLayerId } from "@topdown/shared";
import { addGeneratedTexture } from "./city/canvasTexture";
import { CHAR_R_PX } from "./city/spriteAtlas";
import { CHAR_EXTENT_R, drawSurvivorBody } from "./city/spriteArt";
import { resolveLook, type ResolvedLook } from "./city/survivorLook";
import { textureRegistry } from "./gfx/textureRegistry";

/** Story 7.9: texture key prefix of the per-player survivor bodies (`survivorlook_<playerId>`). */
export const SURVIVOR_LOOK_PREFIX = "survivorlook_";
/** The body with its pack, and without it (a weapon with a back piece: the flamethrower's tanks). */
export const LOOK_FRAME_PACK = "pack";
export const LOOK_FRAME_NOPACK = "nopack";
/** Frame side in px: the same as the atlas survivor frames (`characterSpecs`), so the shared gun frame lines up. */
export const LOOK_FRAME_SIDE = Math.ceil(2 * CHAR_EXTENT_R.survivor * CHAR_R_PX);

/** Every catalogue part: the server already checked ownership, the client draws `state.look` as it is (L2). */
const DRAWABLE = catalogueParts();

export const lookTextureKey = (playerId: string): string => SURVIVOR_LOOK_PREFIX + playerId;

/** The animated layer (e.g. the propeller) the look's headgear declares, or null (Story 7.8 rule, AC 10). */
export function lookLayer(code: string): AnimatedLayerId | null {
  const head = decodeLook(code, DRAWABLE).look.head;
  return cosmeticPart("head", head)?.animated?.layer ?? null;
}

type Entry = {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
  readonly tex: Phaser.Textures.CanvasTexture;
  code: string;
  stage: number;
  /** What the paint callback draws; replaced (not mutated) on a repaint, so a lost context repaints the current look. */
  look: ResolvedLook;
};

/**
 * Story 7.9 (AC 7, 9; D1, D2): one canvas texture per player with that player's body drawn twice side by side
 * (`pack`, `nopack`), from `resolveLook(decodeLook(state.look), stage)` with animated layers left out. Registered once
 * through `addGeneratedTexture` (a lost context repaints the CURRENT look, brief 20). `setLook` repaints only when the
 * code or the decay stage changed (D1: a build start) — never per frame. The gun is a shared atlas frame under it.
 */
export class SurvivorLookTextures {
  private readonly entries = new Map<string, Entry>();
  /** Bakes done (tests and the perf note): one per new player, one per look or stage change. */
  bakes = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
  ) {
    // Phaser keeps textures across a scene restart: drop a previous run's bodies (the DarknessView pattern).
    const keys = (scene.textures as { getTextureKeys?: () => string[] }).getTextureKeys?.() ?? [];
    for (const k of keys) if (k.startsWith(SURVIVOR_LOOK_PREFIX)) this.drop(k);
  }

  /** The player's body texture (made on first call); repainted when `code` or `stage` changed. Returns the key. */
  setLook(playerId: string, code: string, stage: number): string {
    const e = this.entries.get(playerId);
    if (e) {
      if (e.code === code && e.stage === stage) return e.key;
      e.code = code;
      e.stage = stage;
      e.look = resolveLook(decodeLook(code, DRAWABLE).look, stage);
      paintBodies(e.canvas.getContext("2d") as CanvasRenderingContext2D, e.look, e.canvas);
      e.tex.refresh();
      this.bakes++;
      return e.key;
    }
    const key = lookTextureKey(playerId);
    if (this.scene.textures.exists(key)) this.drop(key); // a leftover under the same id
    const canvas = this.makeCanvas();
    canvas.width = 2 * LOOK_FRAME_SIDE;
    canvas.height = LOOK_FRAME_SIDE;
    const entry = { key, canvas, code, stage, look: resolveLook(decodeLook(code, DRAWABLE).look, stage) } as Entry;
    const tex = addGeneratedTexture(
      this.scene,
      key,
      canvas,
      (g) => paintBodies(g, entry.look, canvas),
      (t) => {
        t.add(LOOK_FRAME_PACK, 0, 0, 0, LOOK_FRAME_SIDE, LOOK_FRAME_SIDE);
        t.add(LOOK_FRAME_NOPACK, 0, LOOK_FRAME_SIDE, 0, LOOK_FRAME_SIDE, LOOK_FRAME_SIDE);
      },
    );
    if (!tex) return key;
    (entry as { tex: Phaser.Textures.CanvasTexture }).tex = tex;
    this.entries.set(playerId, entry);
    this.bakes++;
    return key;
  }

  /** A player left: their texture goes (so 50 rejoins never keep 50 textures). */
  remove(playerId: string): void {
    if (!this.entries.delete(playerId)) return;
    this.drop(lookTextureKey(playerId));
  }

  /** Bodies held now (tests: ≤ the players on screen). */
  get size(): number {
    return this.entries.size;
  }

  /** Scene shutdown: every body texture goes. */
  dispose(): void {
    for (const id of [...this.entries.keys()]) this.remove(id);
  }

  private drop(key: string): void {
    textureRegistry.unregister(key);
    if (this.scene.textures.exists(key)) this.scene.textures.remove(key);
  }
}

/** Both frames from a clean canvas (a repaint resets the size first, as the registry's rebuild does). */
function paintBodies(g: CanvasRenderingContext2D, look: ResolvedLook, canvas: HTMLCanvasElement): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = 0; i < 2; i++) {
    g.save();
    g.beginPath();
    g.rect(i * LOOK_FRAME_SIDE, 0, LOOK_FRAME_SIDE, LOOK_FRAME_SIDE);
    g.clip();
    g.translate(i * LOOK_FRAME_SIDE + LOOK_FRAME_SIDE / 2, LOOK_FRAME_SIDE / 2);
    drawSurvivorBody(g, CHAR_R_PX, look, i === 0, false);
    g.restore();
  }
}
