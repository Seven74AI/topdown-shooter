/** Round 1 page: barrier B1–B3, slam warning S1–S3, boss effects A–C, crater K1–K2. */
import { GROUND } from "../../../../apps/client/src/render/city/palette";
import { BAR_H, BAR_W, CURRENT_TELE, S1, S2, S3, SET_A, SET_B, SET_C, asphalt, barrierConcrete, barrierFrame, barrierSawhorse, barrierScene, barrierWater, canvas, crater, ctx, fxIcon, imageFrame, night, put, slamScene, teleTexture } from "./lib";

declare const CURRENT: Record<string, string>; // the current pictures (data URLs), injected by build.mjs
async function main(): Promise<void> {
  // 1. barrier
  const nowBar = await imageFrame(CURRENT["atlas_downtown/prop_barrier_a"] as string);
  const bars: [string, HTMLCanvasElement][] = [
    ["now", nowBar],
    ["B1", barrierFrame(barrierSawhorse)],
    ["B2", barrierFrame(barrierWater)],
    ["B3", barrierFrame(barrierConcrete)],
  ];
  for (const [id, f] of bars) {
    const big = canvas(BAR_W * 2, BAR_H * 2);
    const bg = ctx(big);
    bg.imageSmoothingEnabled = false;
    bg.fillStyle = GROUND.asphalt;
    bg.fillRect(0, 0, big.width, big.height);
    bg.drawImage(f, 0, 0, big.width, big.height);
    put(`bar-${id}-frame`, big);
    put(`bar-${id}-scene`, barrierScene(f));
  }
  // 2. slam warning
  const nowDisc = await imageFrame(CURRENT["boss_tele_disc/boss_tele_disc"] as string);
  put("tele-now", slamScene(CURRENT_TELE, null, null, nowDisc));
  for (const o of [S1, S2, S3]) {
    const tex = teleTexture(o);
    put(`tele-${o.id}`, slamScene(o, null, null, tex));
    const still = canvas(256, 256);
    const sg = ctx(still);
    sg.fillStyle = "#0b0d12";
    sg.fillRect(0, 0, 256, 256);
    sg.globalCompositeOperation = "lighter";
    sg.drawImage(tex, 0, 0, 256, 256);
    put(`tele-${o.id}-tex`, still);
  }
  // 3. boss effects
  const nowKeys = ["boss_fx/boss_fx_skull_a", "boss_fx/boss_fx_disc_a", "boss_fx/boss_icon_slam_a", "boss_fx/boss_icon_charge_a", "boss_fx/boss_icon_throw_a"];
  for (const k of nowKeys) {
    const f = await imageFrame(CURRENT[k] as string);
    const big = canvas(f.width * 2, f.height * 2);
    const bg = ctx(big);
    bg.fillStyle = "#23292f";
    bg.fillRect(0, 0, big.width, big.height);
    bg.imageSmoothingEnabled = false;
    bg.drawImage(f, 0, 0, big.width, big.height);
    put("fx-now", big);
  }
  for (const set of [SET_A, SET_B, SET_C]) {
    put(`fx-${set.id}`, fxIcon(set.skull, 64, 2));
    put(`fx-${set.id}`, fxIcon(set.disc, 72, 2));
    for (const icon of [set.slam, set.charge, set.throw]) put(`fx-${set.id}`, fxIcon(icon, 48, 2));
  }
  const nowCrack = await imageFrame(CURRENT["boss_fx/boss_decal_crack_a"] as string);
  for (const [id, embers] of [
    ["now", null],
    ["K1", false],
    ["K2", true],
  ] as const) {
    const c = canvas(300, 300);
    const g = ctx(c);
    asphalt(g, 300, 300, 41);
    g.save();
    g.translate(150, 150);
    g.globalAlpha = 0.85;
    if (embers === null) g.drawImage(nowCrack, -128, -128);
    else crater(g, 128, embers);
    g.restore();
    night(g, 300, 300, 0.35, [[60, 50, 160]]);
    put(`crack-${id}`, c);
  }
  // all together: S1 + set A + K1 (the one a designer might pick), as a demo of a full set
  put("combo-1", slamScene(S1, SET_A, false, teleTexture(S1)));
  put("combo-2", slamScene(S3, SET_B, true, teleTexture(S3)));
}

void main();
