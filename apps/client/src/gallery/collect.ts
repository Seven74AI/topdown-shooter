import * as Phaser from "phaser";
import { ensureAtlases } from "../render/city/spriteAtlas";
import { ensureBuildingsAtlas } from "../render/city/buildingsAtlas";
import { ensureBuildIcons } from "../render/city/buildIcons";
import { ensureBlastFxAtlas } from "../render/city/blastFxAtlas";
import { ensureBossTextures } from "../render/city/bossAtlas";
import { ensureConsumableIcons, CONSUMABLE_ICON_FRAMES, consumableIconUrl } from "../render/city/consumableIcons";
import { ensureFireFxAtlas } from "../render/city/fireFxAtlas";
import { ensureGearIcons, GEAR_ICON_FRAMES, gearIconUrl } from "../render/city/gearIcons";
import { ensureThrowFxAtlas } from "../render/city/throwArt";
import { ensureHudWarnTextures } from "../render/city/hudWarnArt";
import { ensureHeliAtlas } from "../render/city/heliArt";
import { SurvivorLayerPool } from "../render/SurvivorLayerPool";
import { WEAPON_ART, WEAPON_ICON_ART, tierMarkUrl, weaponIconUrl } from "../render/city/weaponArt";

/** One reviewable picture: where it lives in the game and its pixels as a PNG data URL. */
export interface Asset {
  readonly id: string; // `<texture>/<frame>` or `shop/<kind>/<name>`
  readonly group: string;
  readonly name: string;
  readonly w: number;
  readonly h: number;
  readonly url: string;
}

/** Texture keys Phaser makes itself (not game art). */
const PHASER_KEYS = new Set(["__DEFAULT", "__MISSING", "__WHITE", "__NORMAL"]);

/** Every texture the game draws in code, made the same way the game makes it, then cut into its named frames. */
export async function collectAssets(): Promise<Asset[]> {
  // the HUD plates paint their labels in the bundled face: wait for it so the export shows the real look
  await Promise.all([document.fonts.load('700 20px Oswald'), document.fonts.load('600 20px Oswald')]).catch(() => undefined);
  return new Promise((resolve, reject) => {
    class Collect extends Phaser.Scene {
      create(): void {
        try {
          ensureAtlases(this);
          ensureBuildingsAtlas(this);
          ensureBuildIcons(this);
          ensureBlastFxAtlas(this);
          ensureBossTextures(this);
          ensureConsumableIcons(this);
          ensureFireFxAtlas(this);
          ensureGearIcons(this);
          ensureThrowFxAtlas(this);
          ensureHudWarnTextures(this);
          ensureHeliAtlas(this);
          new SurvivorLayerPool(this);
          const art = textureAssets(this); // before the game (and its textures) is destroyed below
          void shopAssets().then((shop) => resolve([...art, ...shop]), reject);
        } catch (e) {
          reject(e);
        }
        this.game.destroy(false);
      }
    }
    new Phaser.Game({ type: Phaser.CANVAS, parent: "phaser", width: 8, height: 8, scene: Collect, banner: false, audio: { noAudio: true } });
  });
}

function textureAssets(scene: Phaser.Scene): Asset[] {
  const out: Asset[] = [];
  for (const key of scene.textures.getTextureKeys().sort()) {
    if (PHASER_KEYS.has(key) || /^[0-9a-f]{8}-/.test(key)) continue; // Phaser's own (uuid keys: its blank canvas)
    const tex = scene.textures.get(key);
    const src = tex.getSourceImage() as HTMLCanvasElement | HTMLImageElement;
    const names = tex.getFrameNames(false).sort();
    const frames = names.length ? names.map((n) => tex.get(n)) : [tex.get()];
    for (const f of frames) {
      const w = f.cutWidth;
      const h = f.cutHeight;
      if (w <= 0 || h <= 0) continue;
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d")?.drawImage(src, f.cutX, f.cutY, w, h, 0, 0, w, h);
      const name = names.length ? f.name : key;
      out.push({ id: `${key}/${name}`, group: key, name, w, h, url: c.toDataURL("image/png") });
    }
  }
  return out;
}

/** The pictures the HTML shop draws outside Phaser (weapon side views per level, gear, consumables, tier plates). */
async function shopAssets(): Promise<Asset[]> {
  const out: Asset[] = [];
  const seen = new Set<string>();
  const pending: Promise<void>[] = [];
  const add = (group: string, name: string, url: string | null): void => {
    if (!url || seen.has(url)) return; // levels that share a look are shown once
    seen.add(url);
    const img = new Image();
    img.src = url;
    pending.push(img.decode().then(() => void out.push({ id: `${group}/${name}`, group, name, w: img.naturalWidth, h: img.naturalHeight, url })));
  };
  const weapons = [...new Set([...Object.keys(WEAPON_ART), ...Object.keys(WEAPON_ICON_ART)])].sort();
  for (const w of weapons) for (let lv = 1; lv <= 4; lv++) add("shop_weapon_icons", `${w}_level${lv}`, weaponIconUrl(w, lv));
  for (const g of Object.keys(GEAR_ICON_FRAMES).sort()) add("shop_gear_icons", g, gearIconUrl(g));
  for (const c of Object.keys(CONSUMABLE_ICON_FRAMES).sort()) add("shop_consumable_icons", c, consumableIconUrl(c));
  for (let lv = 1; lv <= 4; lv++) add("shop_tier_plates", `level${lv}`, tierMarkUrl(lv));
  await Promise.all(pending);
  return out.sort((a, b) => a.id.localeCompare(b.id));
}
