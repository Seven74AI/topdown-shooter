/**
 * The bodies the effects play on, as the game shows them NOW (designer 2026-11-28: "why it's showing the old zombies?"):
 * the relit characters of Story 9.13 (`charactersAtlas.ts`: walk loops, the default survivor look relit, relit guns) and
 * the relit Behemoth of Story 9.15 (`bossRelit.ts`, look BH1), baked with the game's own code on the page (the same
 * calls as the asset gallery: no worker, everything at once). The plain `atlas_characters` / `boss_atlas` frames are
 * only the game's first-second fallback. Same frame sizes as the plain frames, so callers keep their metres.
 */
import { captured, fakeScene, frameCanvas } from "./textureShim";
import { make } from "./kit";
import { ensureAtlases } from "../../../../apps/client/src/render/city/spriteAtlas";
import { ensureCharacterSheets, gunSheetOf, picPixels, pumpCharacters, requestBodyRelight, walkFrames, zombieSheet } from "../../../../apps/client/src/render/city/charactersAtlas";
import { ensureBossTextures } from "../../../../apps/client/src/render/city/bossAtlas";
import { bossRelitKey, ensureBossRelit, finishBossRelitNow, requestBossLook } from "../../../../apps/client/src/render/city/bossRelit";
import { BOSS_EYES, BOSS_EYE_FRAMES, BOSS_EYE_M } from "../../../../apps/client/src/render/city/bossAtlas";
import { BOSS_POSES, BOSS_PX_PER_M } from "../../../../apps/client/src/render/city/bossFrames";
import { BH_EYE_AHEAD_R, BH_EYE_SIDE_R, BH_R_M, behemothHeadM } from "../../../../apps/client/src/render/city/behemothArt";
import { BOSS_ANIM } from "../../../../apps/client/src/render/bossAnim";
import { resolveLook } from "../../../../apps/client/src/render/city/survivorLook";
import { LOOK_FRAME_SIDE } from "../../../../apps/client/src/render/SurvivorLookTextures";
import { DEFAULT_LOOK, type ZombieTypeId } from "@topdown/shared";

let chars = false;
let bossReady = false;
let body: HTMLCanvasElement | null = null;
const cache = new Map<string, HTMLCanvasElement>();

/** Bakes the relit characters once (≈ 2.5 s): every zombie look, the guns, and the default survivor body. */
function bootChars(): void {
  if (chars) return;
  chars = true;
  ensureAtlases(fakeScene);
  ensureCharacterSheets(fakeScene, { worker: false });
  requestBodyRelight("page", resolveLook(DEFAULT_LOOK, 1), (d) => {
    const img = picPixels(d.pack, LOOK_FRAME_SIDE, LOOK_FRAME_SIDE);
    body = make(LOOK_FRAME_SIDE, LOOK_FRAME_SIDE);
    body.getContext("2d")!.putImageData(img, 0, 0);
  });
  for (let i = 0; i < 2000 && pumpCharacters(Infinity, Infinity); i++);
}
/** Bakes the relit Behemoth once (≈ 2.5 s), look BH1 (the one the pages show). */
function bootBoss(): void {
  if (bossReady) return;
  bossReady = true;
  if (!captured.has("boss_atlas")) ensureBossTextures(fakeScene);
  ensureBossRelit(fakeScene, { worker: false });
  requestBossLook(0);
  finishBossRelitNow();
}

/** A zombie as the game shows it: walk-loop picture `k` (Walker, Runner, Crawler) or the relit primary frame. */
export function relitZombie(type: ZombieTypeId, v = 0, k = 0): HTMLCanvasElement {
  bootChars();
  const id = `z/${type}/${v}/${k}`;
  let c = cache.get(id);
  if (!c) {
    const loop = walkFrames(type, v);
    const name = loop ? (loop[k % loop.length] as string) : `zombie_${type}_${String.fromCharCode(97 + v)}`;
    c = frameCanvas(zombieSheet(type, v), name);
    cache.set(id, c);
  }
  return c;
}
/** A survivor as the game shows it (PlayerView): the relit gun under the relit default body, same square, same centre. */
export function relitSurvivor(weapon: string): HTMLCanvasElement {
  bootChars();
  const id = `s/${weapon}`;
  let c = cache.get(id);
  if (!c) {
    const gunName = `survivorgun_${weapon}_a`;
    c = make(LOOK_FRAME_SIDE, LOOK_FRAME_SIDE);
    const g = c.getContext("2d")!;
    const gun = frameCanvas(gunSheetOf(gunName), gunName);
    g.drawImage(gun, 0, 0, LOOK_FRAME_SIDE, LOOK_FRAME_SIDE);
    if (body) g.drawImage(body, 0, 0);
    cache.set(id, c);
  }
  return c;
}
/**
 * The Behemoth (BH1) as the game shows it since Story 9.15: relit pose `pose` ("walk_a", "slam_b", …) WITH its eyes.
 * Since 9.15 the body is baked without eyes and the eyes are their own layer (BossView › drawLayers: two additive
 * `boss_eyes` glows at the pose's eye points, `behemothHeadM`). Without that layer the face is an empty brow ridge
 * (designer 2026-11-28: "his head is bug"). Calm eyes at BOSS_ANIM's level (dimmed in the stun, none when dead).
 */
export function relitBoss(pose: string, eyes = true): HTMLCanvasElement {
  bootBoss();
  const id = `b/${pose}/${eyes}`;
  let c = cache.get(id);
  if (!c) {
    const name = `bossr_${pose}`;
    const body = frameCanvas(bossRelitKey(name), name);
    c = make(body.width, body.height);
    const g = c.getContext("2d")!;
    g.drawImage(body, 0, 0);
    const spec = BOSS_POSES.find((p) => p.name === pose);
    if (eyes && spec && spec.pose !== "dead") {
      const level = spec.pose === "stun" ? BOSS_ANIM.eyes.stun : BOSS_ANIM.eyes.calm;
      const head = behemothHeadM(spec.pose, spec.k, { x: 0, y: 0 });
      const eye = frameCanvas(BOSS_EYES, BOSS_EYE_FRAMES[0]);
      const px = BOSS_PX_PER_M;
      const size = BOSS_EYE_M * px;
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = Math.min(1, level);
      for (const side of [-1, 1]) {
        const ex = c.width / 2 + (head.x + BH_EYE_AHEAD_R * BH_R_M) * px;
        const ey = c.height / 2 + (head.y + side * BH_EYE_SIDE_R * BH_R_M) * px;
        g.drawImage(eye, ex - size / 2, ey - size / 2, size, size);
      }
    }
    cache.set(id, c);
  }
  return c;
}
/**
 * The old names the cards used (`atlas_characters` frames) → the relit pictures: "zombie_walker_a" → the Walker's
 * loop, "survivor_shotgun_a" → the relit survivor with a shotgun.
 */
export function relitChar(name: string): HTMLCanvasElement {
  const z = /^zombie_([a-z]+)_([a-e])$/.exec(name);
  if (z) return relitZombie(z[1] as ZombieTypeId, (z[2] as string).charCodeAt(0) - 97);
  const s = /^survivor_([a-z_]+)_a$/.exec(name);
  if (s && s[1] !== "body") return relitSurvivor(s[1] as string);
  if (name === "survivor_body_a") return relitSurvivor("plain");
  return frameCanvas("atlas_characters", name);
}
