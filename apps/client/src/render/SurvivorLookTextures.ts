import type * as Phaser from "phaser";
import { catalogueParts, cosmeticPart, decodeLook, type AnimatedLayerId } from "@topdown/shared";
import { addGeneratedTexture } from "./city/canvasTexture";
import type { PlayerView } from "./PlayerView";
import type { SurvivorLayerPool } from "./SurvivorLayerPool";
import { CHAR_R_PX } from "./city/spriteAtlas";
import { CHAR_EXTENT_R, drawSurvivorBody } from "./city/spriteArt";
import { resolveLook, type ResolvedLook } from "./city/survivorLook";
import { textureRegistry } from "./gfx/textureRegistry";
import { cancelBodyRelight, cpuCopy, requestBodyRelight, pumpCharacters, type BodyDone } from "./city/charactersAtlas";
import { SHEEN_STEPS, sheenSide } from "./city/charRelight";

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
/**
 * Story 9.13: texture key prefix of the per-player body sheens (B5: `SHEEN_STEPS` pictures of the pack body on the
 * first row, of the no-pack body on the second, at half size), made when the relit body lands.
 */
export const SURVIVOR_SHEEN_PREFIX = "survivorsheen_";
export const sheenTextureKey = (playerId: string): string => SURVIVOR_SHEEN_PREFIX + playerId;
const SHEEN_SIDE = sheenSide(LOOK_FRAME_SIDE);
/** The sheen frame names (built once): `[pack][step]`. */
export const LOOK_SHEEN_FRAMES: readonly (readonly string[])[] = [0, 1].map((row) => Array.from({ length: SHEEN_STEPS }, (_, k) => `${row === 0 ? LOOK_FRAME_PACK : LOOK_FRAME_NOPACK}_sheen${k}`));

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
  /** Story 9.13 (AC 5): the relit bodies (CPU-backed copies), once the bake sent them; null = the plain drawing. */
  relit: { readonly pack: HTMLCanvasElement; readonly nopack: HTMLCanvasElement } | null;
  /** The relit sheen strips (CPU-backed) and their texture, once landed. */
  sheen: { readonly canvas: HTMLCanvasElement; strips: HTMLCanvasElement; readonly tex: Phaser.Textures.CanvasTexture } | null;
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
  /**
   * Story 7.9 (AC 9, perf note; review L7): bakes allowed this frame — a new body or a repaint. A build start (D1) or
   * a (re)started scene with 4 players would otherwise paint 4 bodies in one frame; one per frame spreads the ~2 ms
   * (4× throttled: ~9 ms) over 4 frames. A survivor without its body yet keeps the default atlas picture (PlayerView's
   * 7.8 path) until its turn. The scene calls `beginFrame` once per frame.
   */
  private repaintBudget = 1;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
  ) {
    // Phaser keeps textures across a scene restart: drop a previous run's bodies (the DarknessView pattern).
    const keys = (scene.textures as { getTextureKeys?: () => string[] }).getTextureKeys?.() ?? [];
    for (const k of keys) if (k.startsWith(SURVIVOR_LOOK_PREFIX) || k.startsWith(SURVIVOR_SHEEN_PREFIX)) this.drop(k);
  }

  /**
   * The player's body texture (made on first call); repainted when `code` or `stage` changed. Returns the key, or
   * null when a NEW body has to wait for a later frame (this frame's bake is spent).
   */
  setLook(playerId: string, code: string, stage: number): string | null {
    const e = this.entries.get(playerId);
    if (e) {
      if (e.code === code && e.stage === stage) return e.key;
      if (this.repaintBudget <= 0) return e.key; // next frame (the old picture stays until then)
      this.repaintBudget--;
      e.code = code;
      e.stage = stage;
      e.look = resolveLook(decodeLook(code, DRAWABLE).look, stage);
      // Story 9.13 (B15): a relit body stays until the new one lands (no flash of the plain drawing); else plain now
      if (!e.relit) {
        paintBodies(e.canvas.getContext("2d") as CanvasRenderingContext2D, e.look, e.canvas);
        e.tex.refresh();
      }
      this.bakes++;
      this.askRelit(playerId, e);
      return e.key;
    }
    if (this.repaintBudget <= 0) return null; // review L7: next frame
    const key = lookTextureKey(playerId);
    if (this.scene.textures.exists(key)) this.drop(key); // a leftover under the same id
    const canvas = this.makeCanvas();
    canvas.width = 2 * LOOK_FRAME_SIDE;
    canvas.height = LOOK_FRAME_SIDE;
    const entry = { key, canvas, code, stage, look: resolveLook(decodeLook(code, DRAWABLE).look, stage), relit: null, sheen: null } as Entry;
    const tex = addGeneratedTexture(
      this.scene,
      key,
      canvas,
      (g) => (entry.relit ? paintRelit(g, entry.relit, canvas) : paintBodies(g, entry.look, canvas)),
      (t) => {
        t.add(LOOK_FRAME_PACK, 0, 0, 0, LOOK_FRAME_SIDE, LOOK_FRAME_SIDE);
        t.add(LOOK_FRAME_NOPACK, 0, LOOK_FRAME_SIDE, 0, LOOK_FRAME_SIDE, LOOK_FRAME_SIDE);
      },
    );
    if (!tex) return key;
    (entry as { tex: Phaser.Textures.CanvasTexture }).tex = tex;
    this.entries.set(playerId, entry);
    this.repaintBudget--;
    this.bakes++;
    this.askRelit(playerId, entry);
    return key;
  }

  /** Story 9.13 (AC 5): asks the character bake (worker) for this body relit; it lands in a later pump. */
  private askRelit(playerId: string, e: Entry): void {
    requestBodyRelight(e.key, e.look, (d) => {
      if (this.entries.get(playerId) === e) this.landRelit(playerId, e, d);
    });
  }

  private landRelit(playerId: string, e: Entry, d: BodyDone): void {
    const mk = (w: number, h: number): HTMLCanvasElement => {
      const c = this.makeCanvas();
      c.width = w;
      c.height = h;
      return c;
    };
    const copy = (src: BodyDone["pack"], w: number, h: number): HTMLCanvasElement => cpuCopy(src, w, h, mk);
    if (e.relit) {
      e.relit.pack.width = 0;
      e.relit.nopack.width = 0;
    }
    e.relit = { pack: copy(d.pack, LOOK_FRAME_SIDE, LOOK_FRAME_SIDE), nopack: copy(d.nopack, LOOK_FRAME_SIDE, LOOK_FRAME_SIDE) };
    paintRelit(e.canvas.getContext("2d") as CanvasRenderingContext2D, e.relit, e.canvas);
    e.tex.refresh();
    if (!d.sheenPack || !d.sheenNopack) return;
    const strips = this.makeCanvas();
    strips.width = SHEEN_SIDE * SHEEN_STEPS;
    strips.height = 2 * SHEEN_SIDE;
    const sg = strips.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    const sp = copy(d.sheenPack, SHEEN_SIDE * SHEEN_STEPS, SHEEN_SIDE);
    const sn = copy(d.sheenNopack, SHEEN_SIDE * SHEEN_STEPS, SHEEN_SIDE);
    sg.drawImage(sp, 0, 0);
    sg.drawImage(sn, 0, SHEEN_SIDE);
    sp.width = 0;
    sn.width = 0;
    if (e.sheen) {
      e.sheen.strips.width = 0;
      e.sheen.strips = strips;
      paintStrips(e.sheen.canvas.getContext("2d") as CanvasRenderingContext2D, strips, e.sheen.canvas);
      e.sheen.tex.refresh();
      return;
    }
    const key = sheenTextureKey(playerId);
    if (this.scene.textures.exists(key)) this.drop(key);
    const canvas = this.makeCanvas();
    canvas.width = strips.width;
    canvas.height = strips.height;
    const holder = { strips };
    const tex = addGeneratedTexture(
      this.scene,
      key,
      canvas,
      (g) => paintStrips(g, e.sheen?.strips ?? holder.strips, canvas),
      (t) => {
        for (let row = 0; row < 2; row++) for (let k = 0; k < SHEEN_STEPS; k++) t.add((LOOK_SHEEN_FRAMES[row] as readonly string[])[k] as string, 0, k * SHEEN_SIDE, row * SHEEN_SIDE, SHEEN_SIDE, SHEEN_SIDE);
      },
    );
    if (tex) e.sheen = { canvas, strips, tex };
  }

  /** Story 9.13: the player's sheen texture once their relit body landed, else null. */
  sheenOf(playerId: string): string | null {
    return this.entries.get(playerId)?.sheen ? sheenTextureKey(playerId) : null;
  }

  /** Once per frame, before the views sync: one repaint of an existing body is allowed again. */
  beginFrame(): void {
    this.repaintBudget = 1;
    pumpCharacters(undefined, undefined, (this.scene.game as { loop?: { frame?: number } } | undefined)?.loop?.frame ?? -2); // Story 9.13: bodies land here too
  }

  /** A player left: their texture goes (so 50 rejoins never keep 50 textures). */
  remove(playerId: string): void {
    const e = this.entries.get(playerId);
    if (!e || !this.entries.delete(playerId)) return;
    cancelBodyRelight(e.key);
    this.drop(lookTextureKey(playerId));
    if (e.sheen) this.drop(sheenTextureKey(playerId));
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

/** Story 9.13: the relit bodies, as `paintBodies` lays them out. */
function paintRelit(g: CanvasRenderingContext2D, r: { readonly pack: HTMLCanvasElement; readonly nopack: HTMLCanvasElement }, canvas: HTMLCanvasElement): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(r.pack, 0, 0);
  g.drawImage(r.nopack, LOOK_FRAME_SIDE, 0);
}
function paintStrips(g: CanvasRenderingContext2D, strips: HTMLCanvasElement, canvas: HTMLCanvasElement): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  g.drawImage(strips, 0, 0);
}

/**
 * Story 7.9: one frame of a view's look (GameScene's `syncLook`). The body texture from the code and the decay stage
 * (two compares when nothing changed; one repaint on a new code or stage, D1); when the code changed, the animated
 * layer from the look (AC 10), or `devLayer` (`?devlayer`, dev builds) on everyone. `pool` is made on first need.
 */
export function syncViewLook(
  view: PlayerView,
  textures: SurvivorLookTextures,
  id: string,
  code: string,
  stage: number,
  pool: () => SurvivorLayerPool,
  hasPool: boolean,
  devLayer: AnimatedLayerId | null,
): void {
  const key = textures.setLook(id, code, stage);
  if (key === null) return; // review L7: this body is baked on a later frame (the default picture until then)
  view.setBodyTexture(key);
  view.setBodySheen(textures.sheenOf(id)); // Story 9.13: the relit body's sheen, once landed
  if (view.lookCode === code) return;
  view.lookCode = code;
  const layer = devLayer ?? lookLayer(code);
  if (layer) view.setAnimatedLayer(pool(), layer);
  else if (hasPool) view.setAnimatedLayer(pool(), null);
}
