/**
 * Telegraphs, round 2 (designer picks 2026-11-28, `docs/art/photoreal-decisions.md` › "FX (photoreal group 5)"):
 *   TH-R "THA but the crater is bad, take inspiration from our other crater, you can do way better. Also use same
 *        clockwork as SDA".
 *   GD-R "why slam cracks and craters are so different?" → the slam cracks and the crater as ONE family.
 *   CR-R "CRA but no need to show CRASH, but we should show a stun icons." (the icon from the ST card).
 * Kept untouched: SD-A, CL-A, P1-G and every earlier take. Every look here is goal first (fx.md › FX 4).
 */
import { make, idle, clamp01, ramp, sprite, countSprite, type Look, type Stage, type ActionPlan, type FxCard } from "./kit";
import BOSS from "../../../../packages/shared/src/config/balance/boss.json";
import { BOSS_TELE_RADIUS_PX } from "../../../../apps/client/src/render/city/bossAtlas";
import { boot, boss, show, X, Y, sharedArt, shared, debris, dustRing, gdRelit, whole, thBake, thArt, clBake, clArt, laneA, rushTrail, CR_C, WALL_X } from "./telegraphs";
import { drawRing } from "./telegraphs-art";
import { craterFlat, markRelief, CRATER_SIDE_M, MARK_PXM } from "./telegraphs-r2-art";
import { stBake, stArt, drawIcon, slotX, BADGE_M, ABOVE_M, OUT_S, ST_ORDER, type StatusId } from "./telegraphs-r2-status";
import { relitSurvivor, relitZombie, relitBoss } from "./relit";
import { CHAR_EXTENT_R } from "../../../../apps/client/src/render/city/spriteArt";
import ZOMBIES from "../../../../packages/shared/src/config/balance/zombies.json";
import PLAYER from "../../../../packages/shared/src/config/balance/player.json";
import BUILDINGS from "../../../../packages/shared/src/config/balance/buildings.json";
import WEAPONS from "../../../../packages/shared/src/config/balance/weapons.json";

const SLAM_R = BOSS.slam.radiusM; // 4.5
const LIFT_S = BOSS.throw.liftS; // 1.0
const FLIGHT_S = BOSS.throw.flightS; // 0.8
const THROW_R = BOSS.throw.radiusM; // 3
const THROW_LEN = LIFT_S + FLIGHT_S; // 1.8
const STUN_S = BOSS.charge.stunS; // 2
const CHARGE_T = BOSS.charge.telegraphS; // 1.0
const RUSH_V = BOSS.charge.speedMps; // 12
const FADE = 0.3; // bossTelegraph.ts › TELEGRAPH_FADE_S
const FLASH = 0.15; // BOSS_ANIM.glow.flashS: release together
const CHUNK_M = 1.3; // BOSS_CHUNK_M
const CHUNK_ARC_M = 3; // bossTelegraph CHUNK_ARC_M
const CRACK_SIDE_M = 9; // the slam decal: 2 × 4.5 m

/* ======================================================================================
 * The shared art: the two marks of one family, and SD-A's clockwork resized to 3 m
 * ====================================================================================== */
interface R2Art {
  /** The throw crater: drawGroundDamage(CRATER_DAMAGE) + heaved slabs, relit like the slam cracks. 256 px / 6 m. */
  crater: HTMLCanvasElement;
  /** Its flat picture (before the relight), for the decomposition. */
  craterFlat: HTMLCanvasElement;
  /** SD-A's lit tick (the same picture). */
  tick: HTMLCanvasElement;
}
let A: R2Art | null = null;
async function r2Bake(): Promise<R2Art> {
  boot();
  await sharedArt();
  if (A) return A;
  // SD-A's tick, the same picture (telegraphs.ts › sdTakeA.bake)
  const tick = make(40, 10);
  const tg = tick.getContext("2d")!;
  const gr = tg.createRadialGradient(20, 5, 0, 20, 5, 20);
  gr.addColorStop(0, "rgba(255,240,226,1)");
  gr.addColorStop(0.35, "rgba(255,110,80,0.7)");
  gr.addColorStop(1, "rgba(255,40,28,0)");
  tg.fillStyle = gr;
  tg.beginPath();
  tg.ellipse(20, 5, 20, 5, 0, 0, Math.PI * 2);
  tg.fill();
  const n = Math.round(CRATER_SIDE_M * MARK_PXM); // 256
  const flat = craterFlat(n);
  await idle();
  A = { crater: markRelief(flat), craterFlat: flat, tick };
  gdRelit();
  await idle();
  return A;
}

/* ======================================================================================
 * TH-R: TH-A with SD-A's clockwork and the new crater
 * ====================================================================================== */
const TB = -5; // boss x (as the card)
const TT = 4; // target x
/** SD-A's dial, resized: 72 ticks round 4.5 m (0.39 m apart) → 48 round 3 m keeps the spacing; a major every 6. */
const TH_TICKS = 48;
const TH_MAJOR = 6;
const TH_COOL = 12; // a tick cools to an ember over ¼ turn (SD-A: 18 of 72)
const thP = (t: number): number => clamp01(t / THROW_LEN);
const thA = (t: number): number => (t <= THROW_LEN ? 1 : Math.max(0, 1 - (t - THROW_LEN) / FADE));
function chunkAt(t: number): { on: boolean; x: number; h: number; f: number } {
  if (t < LIFT_S || t > THROW_LEN) return { on: false, x: 0, h: 0, f: 0 };
  const f = (t - LIFT_S) / FLIGHT_S;
  return { on: true, f, x: TB + (TT - TB) * f, h: 4 * CHUNK_ARC_M * f * (1 - f) };
}
/** SD-A's lit ticks round (xm, ym) at radius R: lit one by one with progress p, the fresh ones hot, older ones ember. */
function ticks(g: CanvasRenderingContext2D, st: Stage, xm: number, ym: number, R: number, p: number, al: number, n: number, major: number, cool: number, scale: number): void {
  countSprite(true); // one Graphics / particle layer
  const lit = Math.floor(p * n);
  const k = SLAM_R / BOSS_TELE_RADIUS_PX; // SD-A's inset, in the slam texture's metres
  const tex = A!.tick;
  g.save();
  g.globalCompositeOperation = "lighter";
  for (let i = 0; i < lit; i++) {
    const a = -Math.PI / 2 + (i / n) * Math.PI * 2;
    const mj = i % major === 0;
    const r = R - (12 + (mj ? 10 : 5)) * k * scale;
    const age = clamp01((p * n - i) / cool);
    g.globalAlpha = al * (0.95 - 0.45 * age);
    g.translate(X(st, xm) + Math.cos(a) * r * st.pxm, Y(st, ym) + Math.sin(a) * r * st.pxm);
    g.rotate(a);
    const L = (mj ? 0.5 : 0.28) * scale * st.pxm;
    g.drawImage(tex, -L / 2, -L * 0.14, L, L * 0.28);
    g.setTransform(1, 0, 0, 1, 0, 0);
  }
  g.restore();
}
/** SD-A's head: a hot core riding the rim with its pool of red light on the asphalt. */
function headA(g: CanvasRenderingContext2D, st: Stage, xm: number, ym: number, R: number, p: number, al: number, scale: number): void {
  const a = -Math.PI / 2 + p * Math.PI * 2;
  const hx = X(st, xm) + Math.cos(a) * (R - 0.07) * st.pxm;
  const hy = Y(st, ym) + Math.sin(a) * (R - 0.07) * st.pxm;
  sprite(g, shared!.poolRed, hx, hy, 2.0 * scale, st.pxm, 0, 0.5 * al, true);
  sprite(g, shared!.headHot, hx, hy, 0.55 * scale, st.pxm, 0, al, true);
}
const thrPlan: ActionPlan = {
  goal: "A slab lands inside this 3 m circle at the end of the dial (1.8 s): where (the rim of light), when (SD-A's ticks lit round, then the slab and its shadow), it landed (one flare, the crater).",
  timing: "boss.json › throw: liftS 1.0, flightS 0.8, radiusM 3, damage 35; CHUNK_ARC_M 3; fade 0.3 s. The dial runs over the whole 1.8 s (lift + flight), as SD-A's over the slam's 1.2 s.",
  lengthS: 2.9,
  lanes: {
    light: [
      { t0: 0, t1: 1.8, label: "rim builds; 48 ticks light round (SD-A), head rides the rim", nw: true },
      { t0: 1.8, t1: 1.95, label: "flare: rim + 6.3 m pool (SD-A)", key: true },
      { t0: 1.95, t1: 2.1, label: "fade 0.3 s" },
    ],
    core: [
      { t0: 0, t1: 1.0, label: "lift: chunk in the hands (pose)" },
      { t0: 1.0, t1: 1.8, label: "flight on a 3 m arc" },
    ],
    matter: [
      { t0: 1.0, t1: 1.8, label: "slab + its shadow on the road" },
      { t0: 1.8, t1: 2.3, label: "debris hops out" },
    ],
    smoke: [{ t0: 1.83, t1: 2.9, label: "dust rolls out, settles" }],
    mark: [{ t0: 1.8, t1: 2.9, label: "the new crater (GD-R) stays", key: true, nw: true }],
    game: [
      { t0: 0, t1: 1.0, label: "lift (TELEGRAPH)" },
      { t0: 1.0, t1: 1.8, label: "flight (boss recovers)" },
      { t0: 1.8, t1: 1.85, label: "impact: 35 dmg", key: true },
    ],
  },
};
export const thR: Look = {
  code: "TH-R",
  title: "TH-A, with SD-A's clock and a real crater",
  note: "Starts from TH-A, as picked (\"THA but the crater is bad … Also use same clockwork as SDA\"). The clock is now SD-A's: 48 ticks light round the 3 m rim one by one over the 1.8 s (fresh ones hot, older ones cooling to embers, a major tick every 45°), a hot head with its pool of red light rides the rim, and the release is SD-A's (the rim and a red pool flare for 0.15 s). TH-A's white closing ring is cut: it was a second clock, and white means people. The crater is redrawn with the slam's own code (\"take inspiration from our other crater\"): the game's drawGroundDamage with a crater look (a dish 1.7 × as deep, 5 main fractures instead of 11, more ejecta) plus asphalt slabs heaved up round the lip and the thrown slab's pieces in the pit, relit with the same light as the slam cracks (GD-R). It is 6 m wide, twice the 3 m reach, by the slam's rule: the fractures end where the danger ended.",
  bake: async () => {
    await thBake();
    await r2Bake();
  },
  goalFirst: {
    goal: "A 1.3 m slab of road lands inside this 3 m circle 1.8 s after the lift starts (1.0 s lift + 0.8 s flight): get out or take 35 (boss.json › throw).",
    elements: [
      { name: "Rim of red light at 3 m (TH-A)", job: "WHERE: the landing zone's edge, from the first frame, building toward the impact." },
      { name: "Faint hatching (TH-A, α 0.3)", job: "INSIDE = DANGER at a glance (the zone's surface)." },
      { name: "48 lit ticks, lit round (SD-A)", job: "WHEN: how much of the 1.8 s is spent; full circle = impact. Same dial as the slam, so one language for both circle warnings." },
      { name: "Hot head + its light pool (SD-A)", job: "NOW: the point the dial has reached; it draws the eye round the rim." },
      { name: "The slab and its shadow (TH-A)", job: "WHAT and FROM WHERE: a real piece of the street on its arc from the boss; the shadow says its height." },
      { name: "Release flare (SD-A) + debris + dust", job: "IT LANDED: rim and pool flare 0.15 s, bits hop out, dust follows (secondary)." },
      { name: "The crater (GD-R)", job: "THE MARK, in the slam damage's own style: deep dish, heaved slabs, fractures to 3 m." },
      { name: "Cut: TH-A's white closing ring", job: "A second clock next to the ticks, and white means people / pick-ups." },
    ],
    composition: [
      "Light only inside the 3 m (the rim's bloom crosses by 0.3 m); the slab and its shadow come from outside and may cross.",
      "Brightness: head > fresh ticks > rim > ember ticks > hatching. Red only.",
      "One clock: the ticks and the head run on the attack's progress (start → impact tick), the slab lands on the last tick.",
      "Release together: flare, debris, crater on the impact; the dust 0.03 s after.",
      "The crater is drawn unrotated: its light is baked from the upper left (a rotated decal turns its light, see the findings).",
    ],
    plan: thrPlan,
  },
  draw(g, t, st) {
    const art = shared!;
    const p = thP(t);
    const al = thA(t);
    const since = t - THROW_LEN;
    const rel = since >= 0 ? 1 - ramp(since, 0, FLASH) : 0;
    if (since >= 0 && show(st, "mark")) sprite(g, A!.crater, X(st, TT), st.cy, CRATER_SIDE_M, st.pxm, 0, ramp(since, 0, 0.04));
    if (show(st, "dust")) dustRing(g, st, art, TT, 0, since - 0.03, 12, 0.6, THROW_R + 0.4, 1.0, 0.6, 9);
    if (show(st, "debris")) debris(g, st, art, TT, 0, since, 9, 2.4, 40);
    if (al > 0) {
      const side = (2 * THROW_R * (BOSS_TELE_RADIUS_PX + 4)) / BOSS_TELE_RADIUS_PX;
      if (show(st, "hatch")) sprite(g, whole("boss_tele_ring"), X(st, TT), st.cy, side, st.pxm, 0, al * 0.3);
      if (show(st, "rim")) drawRing(g, thArt!.rim, X(st, TT), st.cy, st.pxm, al * (0.4 + 0.6 * p) + rel * 0.6);
      if (show(st, "flash") && rel > 0) sprite(g, art.poolRed, X(st, TT), st.cy, THROW_R * 2.1, st.pxm, 0, 0.55 * rel, true);
      if (show(st, "ticks")) ticks(g, st, TT, 0, THROW_R, since >= 0 ? 1 : p, al, TH_TICKS, TH_MAJOR, TH_COOL, 1);
      if (show(st, "head") && p < 1) headA(g, st, TT, 0, THROW_R, p, al, 0.9);
    }
    const ch = chunkAt(t);
    if (ch.on) {
      if (show(st, "shadow")) sprite(g, art.shadow, X(st, ch.x + ch.h * 0.22), Y(st, ch.h * 0.28), CHUNK_M * (1 + ch.h * 0.12), st.pxm, 0, 0.55 - ch.h * 0.06);
      if (show(st, "chunk")) sprite(g, thArt!.chunk[0] as HTMLCanvasElement, X(st, ch.x), Y(st, -ch.h * 0.35), CHUNK_M * (1 + ch.h / 6), st.pxm, ch.f * 5);
    }
  },
  textures: () => [
    { name: "rim segment ×8", canvas: thArt!.rim.tex, note: "ADD (TH-A)" },
    { name: "lit tick (SD-A)", canvas: A!.tick, note: "ADD, 48 round 3 m" },
    { name: "head", canvas: shared!.headHot, note: "ADD 0.47 m" },
    { name: "light pool", canvas: shared!.poolRed, note: "ADD 1.7 m / 6.3 m flare" },
    { name: "hatched ring (today's)", canvas: whole("boss_tele_ring"), note: "normal, α 0.3" },
    { name: "road chunk", canvas: thArt!.chunk[0] as HTMLCanvasElement, note: "relit" },
    { name: "crater, flat (drawGroundDamage + slabs)", canvas: A!.craterFlat, note: "256 px, 6 m" },
    { name: "crater, relit", canvas: A!.crater, note: "256 px, 6 m (GD-R)" },
    ...shared!.bits.map((c, i) => ({ name: `bit ${i + 1}`, canvas: c })),
    ...shared!.dust.map((c, i) => ({ name: `dust ${i + 1}`, canvas: c })),
  ],
  parts: [
    { id: "hatch", label: "Hatching" },
    { id: "rim", label: "Rim light" },
    { id: "ticks", label: "Lit ticks (SD-A)" },
    { id: "head", label: "Head + pool (SD-A)" },
    { id: "flash", label: "Release flare (SD-A)" },
    { id: "chunk", label: "Chunk" },
    { id: "shadow", label: "Chunk shadow" },
    { id: "debris", label: "Debris" },
    { id: "dust", label: "Dust" },
    { id: "mark", label: "Crater (GD-R)" },
  ],
  frames: [
    { label: "lift", t: 0.5, when: "throw pose, dial ¼ (12 ticks)" },
    { label: "release", t: 1.0, when: "chunk leaves the hands, dial 55 %" },
    { label: "top", t: 1.4, when: "chunk at 3 m, dial 78 %" },
    { label: "impact", t: 1.8, when: "last tick: flare, crater" },
    { label: "settle", t: 2.1, when: "rim and ticks gone, dust" },
  ],
};

/* ======================================================================================
 * GD-R: the slam cracks and the crater as ONE family
 * ====================================================================================== */
const GD_SLAM: [number, number] = [-3.0, 0];
const GD_CRATER: [number, number] = [4.3, 0.9];
const GD_CRATER_T = 0.5;
const gdrPlan: ActionPlan = {
  goal: "That hit was real and it stays: the street is broken where each attack landed, as far as it reached, in one style.",
  timing: "On boss.slammed / boss.thrown_impact; stays until the build phase (caps.maxDecals 8). Each mark lands with its attack's flash (SD-A: 0.05 s, TH-R: 0.04 s).",
  lengthS: 1.6,
  lanes: {
    mark: [
      { t0: 0, t1: 0.05, label: "slam cracks land (9 m)", key: true },
      { t0: 0.5, t1: 0.54, label: "crater lands (6 m)", key: true, nw: true },
      { t0: 0.54, t1: 1.6, label: "both stay" },
    ],
    game: [
      { t0: 0, t1: 0.05, label: "slam hit", key: true },
      { t0: 0.5, t1: 0.55, label: "throw impact", key: true },
    ],
  },
};
export const gdR: Look = {
  code: "GD-R",
  title: "One family: same code, same palette, same light",
  note: "The answer to \"why slam cracks and craters are so different?\": they were never the same drawing. The slam cracks are the approved photoreal ground damage (groundDamageArt.ts › drawGroundDamage: a lit height-field dish, tapering fractures with a lit lip, ejecta, gravel); the crater is Story 6.6's drawCrater: a flat brown disc, a black pit and 9 straight lines, at 128 px for 3.2 m. Here both come out of drawGroundDamage, each with its own look (the slam's approved one untouched; the crater's: dish ×1.7 deeper, 5 fractures, more ejecta, heaved slabs), baked at the same 43 px/m and relit by the same pass from the upper left. Each mark is sized to its attack's reach (9 m = 2 × 4.5 m, 6 m = 2 × 3 m) and drawn unrotated so the light stays upper left. Only the mark: the debris and dust belong to the attacks (SD-A, TH-R).",
  bake: async () => {
    await r2Bake();
  },
  goalFirst: {
    goal: "Read the broken street as ONE kind of damage: where each Behemoth attack landed, as far as it reached (slam 4.5 m, throw 3 m), until the build phase.",
    elements: [
      { name: "Slam cracks (approved, SLAM_DAMAGE)", job: "THE SLAM WAS HERE: a shallow dish, 11 long fractures to 4.5 m, scorch at the centre (fists, not a fall)." },
      { name: "Crater (CRATER_DAMAGE + slabs)", job: "THE THROW WAS HERE: a deep pit with heaved slabs and the slab's pieces in it (something fell), fractures to 3 m." },
      { name: "One relight for both", job: "THE SAME STREET: same light from the upper left, same depth, same palette, so they read as one family." },
    ],
    composition: [
      "Matte, darker than the street; no light, no colour.",
      "Each mark's size is its attack's reach × 2, so the damage ends where the danger ended.",
      "Both unrotated (their light is baked); variety comes from the seed.",
      "They land with their attack's flash; debris and dust are the attack's own (no second burst).",
    ],
    plan: gdrPlan,
  },
  draw(g, t, st) {
    if (show(st, "cracks")) sprite(g, gdRelit(), X(st, GD_SLAM[0]), Y(st, GD_SLAM[1]), CRACK_SIDE_M, st.pxm, 0, 0.95 * ramp(t, 0, 0.05));
    if (t >= GD_CRATER_T && show(st, "crater")) sprite(g, A!.crater, X(st, GD_CRATER[0]), Y(st, GD_CRATER[1]), CRATER_SIDE_M, st.pxm, 0, ramp(t, GD_CRATER_T, GD_CRATER_T + 0.04));
  },
  textures: () => [
    { name: "slam cracks, relit (SLAM_DAMAGE)", canvas: gdRelit(), note: "384 px, 9 m" },
    { name: "crater, flat (CRATER_DAMAGE + slabs)", canvas: A!.craterFlat, note: "256 px, 6 m" },
    { name: "crater, relit", canvas: A!.crater, note: "256 px, 6 m" },
  ],
  parts: [
    { id: "cracks", label: "Slam cracks" },
    { id: "crater", label: "Crater" },
  ],
  frames: [
    { label: "slam", t: 0.0, when: "the hit (ramps in 0.05 s)" },
    { label: "+0.05", t: 0.05, when: "cracks whole" },
    { label: "crater", t: GD_CRATER_T, when: "throw impact" },
    { label: "+0.04", t: GD_CRATER_T + 0.04, when: "crater whole" },
    { label: "later", t: 1.4, when: "both stay" },
  ],
};

/* ======================================================================================
 * CR-R: CR-A without the word, the stun icon over the boss for the 2 s
 * ====================================================================================== */
/** CR_C as telegraphs.ts defines it (bx -6, len 6): copied, so module order never matters (circular import). */
const CR_STOP = CHARGE_T + 6 / RUSH_V;
const lnA = (t: number): number => (t <= CR_C.stop ? 1 : Math.max(0, 1 - (t - CR_C.stop) / FADE));
const bossX = (t: number): number => (t < CHARGE_T ? CR_C.bx : CR_C.bx + Math.min(CR_C.len, (t - CHARGE_T) * RUSH_V));
function chargePose(t: number): string {
  if (t < CHARGE_T) return "charge_a";
  if (t < CR_C.stop) return "rush_a";
  if (t < CR_C.stop + STUN_S) return "stun_a";
  return "walk_a";
}
/** The boss's icon scale, and the icon's centre above it (screen-up, top-down): 2 m + 0.45 m gap + half the badge. */
const BOSS_ICON_S = 1.5;
/** The boss's picture reaches past its 2 m body: the fists of the stun pose reach 3.0 m north (measured on the relit
 * stun_a frame). The icon goes over the whole picture, never on a fist. */
const BOSS_TOP_M = 3.0;
const bossIconY = -(BOSS_TOP_M + ABOVE_M * BOSS_ICON_S + (BADGE_M * BOSS_ICON_S) / 2);
const crrPlan: ActionPlan = {
  goal: "It crashed and is stunned for 2 s: hit it now. The crash is one release at the wall; then the stun icon over the boss says \"dazed\" and drains for exactly the 2 s.",
  timing: "boss.json › charge: stunS 2, stunDamageMult 1.5; the lane and the amber bar fade 0.3 s after the stop (today's timing); the icon pops in 0.12 s, fades the last 0.15 s.",
  lengthS: 3.9,
  lanes: {
    light: [
      { t0: 1.5, t1: 1.65, label: "amber flash at the wall (CR-A)", key: true },
      { t0: 1.5, t1: 1.8, label: "amber bar (CR-A), no word" },
      { t0: 1.5, t1: 3.5, label: "STUN icon: stars orbit 1 turn / s, ring drains 2 s", key: true, nw: true },
    ],
    matter: [{ t0: 1.5, t1: 2.0, label: "concrete bits off the wall" }],
    smoke: [{ t0: 1.53, t1: 2.9, label: "dust off the wall" }],
    game: [
      { t0: 0, t1: 1.0, label: "warning" },
      { t0: 1.0, t1: 1.5, label: "rush" },
      { t0: 1.5, t1: 3.5, label: "STUN 2 s, ×1.5 damage", key: true },
    ],
  },
};
export const crR: Look = {
  code: "CR-R",
  title: "CR-A, the stun shown by its icon",
  note: "Starts from CR-A, as picked (\"CRA but no need to show CRASH, but we should show a stun icons\"). The word CRASH is gone; the amber bar of light at the wall, the 0.15 s amber flash, the concrete bits and dust stay as CR-A. The stun is told by the ST card's stun icon over the boss (×1.5, its badge 0.45 m north of its fists): amber stars orbiting a dazed swirl once a second (the boss's 1.0 s stun breath), in an amber ring that drains over exactly the 2 s stun. It is also the window's clock: today only the HUD bar tells how long is left.",
  bake: async () => {
    await clBake();
    await stBake();
  },
  goalFirst: {
    goal: "It crashed into a wall and is stunned for 2 s (boss.json › charge.stunS): hit it now, ×1.5 damage (stunDamageMult).",
    elements: [
      { name: "The lane (CL-A), out at the stop", job: "DANGER OVER: the red goes in the game's 0.3 s." },
      { name: "Amber flash + bar of light at the wall (CR-A)", job: "IT CRASHED, HERE: the release at the impact spot (0.15 s flash, the bar fades with the lane)." },
      { name: "Concrete bits and dust off the wall (CR-A)", job: "The hit was hard (matter, secondary)." },
      { name: "Stun icon over the boss (ST)", job: "DAZED = YOUR WINDOW, and HOW LONG: amber stars orbiting, the ring drains 2 s → 0." },
      { name: "Cut: the word CRASH", job: "The designer's call; the icon names the state the same way on every body." },
    ],
    composition: [
      "The icon sits above the boss (screen-up), outside its 2 m body, never over it; drawn above everything.",
      "Amber only after the crash; the red lane is fading as the amber comes in.",
      "Brightness: icon stars > its ring > flash (gone in 0.15 s) > bar.",
      "One clock: the ring drains on stunS; the stars turn once per the stun breath (1.0 s).",
    ],
    plan: crrPlan,
  },
  draw(g, t, st) {
    const art = shared!;
    laneA(g, st, CR_C, t);
    rushTrail(g, st, CR_C, t, false);
    if (st.only === null) boss(g, st, chargePose(t), bossX(t));
    const al = lnA(t);
    const d = t - CR_C.stop;
    const rel = d >= 0 ? 1 - ramp(d, 0, FLASH) : 0;
    if (show(st, "dust")) dustRing(g, st, art, WALL_X - 0.3, 0, d - 0.03, 12, 0.5, 2.6, 1.4, 0.65, 70);
    if (show(st, "debris")) debris(g, st, art, WALL_X - 0.2, 0, d, 10, 2.2, 80);
    if (show(st, "flash") && rel > 0) sprite(g, art.poolAmber, X(st, WALL_X - 0.4), st.cy, 5, st.pxm, 0, 0.7 * rel, true);
    if (show(st, "bar") && al > 0) sprite(g, clArt!.crashBar, X(st, WALL_X - 0.1), st.cy, 0.55, st.pxm, 0, al, true, 4.8 * 0.96);
    if (d >= 0 && d < STUN_S && (st.only === null || st.only === "icon")) {
      drawIcon(g, st, "stunned", bossX(t), bossIconY, d, d, 1 - d / STUN_S, clamp01((d - (STUN_S - OUT_S)) / OUT_S), 0, BOSS_ICON_S);
    }
  },
  textures: () => [
    { name: "amber bar", canvas: clArt!.crashBar, note: "ADD 0.55 × 4.6 m" },
    { name: "amber flash", canvas: shared!.poolAmber, note: "ADD 5 m, 0.15 s" },
    ...stTextures().filter((x) => /badge|star|swirl/.test(x.name)),
  ],
  parts: [
    { id: "strip", label: "Hatching" },
    { id: "fill", label: "Sweep" },
    { id: "edges", label: "Edge light" },
    { id: "chevrons", label: "Chevrons" },
    { id: "bar", label: "Amber bar" },
    { id: "flash", label: "Amber flash" },
    { id: "debris", label: "Concrete bits" },
    { id: "dust", label: "Dust" },
    { id: "trail", label: "Rush dust" },
    { id: "icon", label: "Stun icon" },
  ],
  frames: [
    { label: "rush", t: 1.25, when: "rush pose" },
    { label: "crash", t: CR_STOP, when: "flash, bar, icon pops in" },
    { label: "+0.15", t: CR_STOP + 0.15, when: "flash over, icon full" },
    { label: "+0.3", t: CR_STOP + 0.3, when: "bar and lane gone" },
    { label: "+1.5", t: CR_STOP + 1.5, when: "ring ¼ left" },
    { label: "end", t: CR_STOP + 2.0, when: "stun over: icon gone" },
  ],
};

/* ======================================================================================
 * ST: the status icons card
 * ====================================================================================== */
const ZT = ZOMBIES.types as unknown as Record<string, { radiusM: number }>;
const IGNITE_S = (WEAPONS as unknown as Record<string, { igniteS: number }>).flamethrower!.igniteS; // 3
const HOLD_S = (BUILDINGS.types as unknown as Record<string, { bearTrap: { holdS: number } }>).bear_trap!.bearTrap.holdS; // 3
const DOWNED_S = (PLAYER as unknown as { downedS: number }).downedS; // 20
const REVIVE_S = (PLAYER as unknown as { reviveS: number }).reviveS; // 3
const PROTECT_S = (PLAYER as unknown as { returnProtectTicks: number }).returnProtectTicks / 20; // 2
const BITE_S = (ZOMBIES.types as unknown as Record<string, { biteSlowS: number }>).crawler!.biteSlowS; // 1
const ST_LEN = 3.2;
interface Who {
  pic: () => HTMLCanvasElement;
  side: number; // frame side (m)
  r: number; // body radius (m)
  x: number;
  y: number;
  label: string;
  s: number; // icon scale
  /** [status, start (s), length (s) | 0 = in a zone, the timer's full length (s), its time left at start (s)] */
  st: readonly (readonly [StatusId, number, number, number, number])[];
  revive?: [number, number]; // revive from t0 over len
  boss?: boolean;
}
const SURV_SIDE = 2 * PLAYER.radiusM * CHAR_EXTENT_R.survivor;
const zSide = (t: "walker" | "runner"): number => 2 * (ZT[t] as { radiusM: number }).radiusM * CHAR_EXTENT_R[t];
const WHO: readonly Who[] = [
  { pic: () => relitSurvivor("assault_rifle"), side: SURV_SIDE, r: PLAYER.radiusM, x: -3.1, y: -2.3, label: "fire + Crawler bite", s: 1, st: [["burning", 0.2, 2.6, 0, 0], ["slowed", 0.9, BITE_S, BITE_S, BITE_S]] },
  { pic: () => relitSurvivor("plain"), side: SURV_SIDE, r: PLAYER.radiusM, x: -1.0, y: -2.3, label: "Spitter acid", s: 1, st: [["acid", 0.3, 2.4, 0, 0]] },
  { pic: () => relitSurvivor("shotgun"), side: SURV_SIDE, r: PLAYER.radiusM, x: 1.1, y: -2.3, label: "downed, revived", s: 1, st: [["downed", 0, 0, DOWNED_S, 12.5]], revive: [0.2, REVIVE_S] },
  { pic: () => relitSurvivor("fire_axe"), side: SURV_SIDE, r: PLAYER.radiusM, x: 3.2, y: -2.3, label: "protected + med", s: 1, st: [["protected", 0, PROTECT_S, PROTECT_S, PROTECT_S], ["healing", 0.6, 2.4, 0, 0]] },
  { pic: () => relitZombie("walker"), side: zSide("walker"), r: (ZT.walker as { radiusM: number }).radiusM, x: -3.1, y: 0.2, label: "Walker: ignited + spikes", s: 1, st: [["burning", 0.1, IGNITE_S, IGNITE_S, IGNITE_S], ["slowed", 0.5, 2.4, 0, 0]] },
  { pic: () => relitZombie("runner"), side: zSide("runner"), r: (ZT.runner as { radiusM: number }).radiusM, x: -3.1, y: 2.6, label: "Runner: bear trap", s: 1, st: [["trapped", 0.2, HOLD_S, HOLD_S, HOLD_S]] },
  { pic: () => relitBossPic(), side: 7, r: BOSS_TOP_M, x: 2.0, y: 3.0, label: "Behemoth: stunned", s: BOSS_ICON_S, st: [["stunned", 0.3, STUN_S, STUN_S, STUN_S]], boss: true },
];
const relitBossPic = (): HTMLCanvasElement => relitBoss("stun_a");

/** Draws the context bodies of the ST card (not counted). */
export function stUnder(g: CanvasRenderingContext2D, _t: number, st: Stage): void {
  for (const w of WHO) {
    const s = w.side * st.pxm;
    g.drawImage(w.pic(), X(st, w.x) - s / 2, Y(st, w.y) - s / 2, s, s);
    if (st.pxm >= 38) {
      g.font = `500 ${Math.round(Math.max(10, st.pxm * 0.2))}px Inter, system-ui, sans-serif`;
      g.fillStyle = "rgba(200,206,212,0.75)";
      g.textAlign = "center";
      g.textBaseline = "top";
      g.fillText(w.label, X(st, w.x + (w.boss ? -2.2 : 0)), Y(st, w.y + (w.boss ? -4.1 : w.r + 0.35)));
    }
  }
}
/** Up to ST_MAX icons per body, in ST_ORDER, stacked in a row above the head. No allocation: counts first. */
function stDraw(g: CanvasRenderingContext2D, t: number, st: Stage): void {
  for (const w of WHO) {
    let n = 0;
    for (const id of ST_ORDER) for (const s of w.st) if (s[0] === id && t >= s[1] && (s[2] === 0 || t < s[1] + s[2]) && n < 3) n++;
    let i = 0;
    const y = w.y - (w.r + ABOVE_M * w.s + (BADGE_M * w.s) / 2);
    for (const id of ST_ORDER)
      for (const s of w.st) {
        if (s[0] !== id || t < s[1] || i >= 3) continue;
        const age = t - s[1];
        const len = s[2] === 0 ? ST_LEN - s[1] : s[2];
        if (age >= len) continue;
        const out = s[2] === 0 ? 0 : clamp01((age - (len - OUT_S)) / OUT_S);
        const left = s[3] === 0 ? null : clamp01((s[4] - (id === "downed" ? 0 : age)) / s[3]);
        const rev = w.revive ? clamp01((t - w.revive[0]) / w.revive[1]) : 0;
        drawIcon(g, st, id, w.x + slotX(i, n) * w.s, y, t, age, left, out, rev, w.s);
        i++;
      }
  }
}
export function stTextures(): { name: string; canvas: HTMLCanvasElement; note?: string }[] {
  const a = stArt!;
  return [
    { name: "badge", canvas: a.badge, note: "normal, 0.56 m (20 px in game)" },
    { name: "stun: star", canvas: a.star, note: "ADD ×3" },
    { name: "stun: swirl", canvas: a.swirl, note: "ADD, turns" },
    ...a.flame.map((c, i) => ({ name: `burning: flame ${i + 1}`, canvas: c, note: "ADD, crossfaded 0.5 s" })),
    { name: "acid: drop", canvas: a.drop, note: "ADD" },
    { name: "acid: splash", canvas: a.splash, note: "ADD" },
    { name: "slowed: chevron", canvas: a.chevron, note: "ADD ×2" },
    { name: "trapped: jaw", canvas: a.jawTop, note: "ADD" },
    { name: "trapped: jaw", canvas: a.jawBot, note: "ADD" },
    { name: "downed: heart", canvas: a.heart, note: "ADD" },
    { name: "healing: cross", canvas: a.plus, note: "ADD" },
    { name: "protected: shield", canvas: a.shield, note: "ADD" },
    { name: "protected: sheen 1–6", canvas: a.sheen[2] as HTMLCanvasElement, note: "ADD, 6 frames" },
  ];
}

const stPlan: ActionPlan = {
  goal: "At a glance, what is happening to this body and for how long, with the same picture on a survivor, a zombie and the boss.",
  timing: "Real times: stun 2 s (boss.json › charge.stunS), ignite 3 s (weapons.json › flamethrower.igniteS), bear trap 3 s (buildings.json › bear_trap.holdS; Brute 50 %), Crawler bite slow 1 s (zombies.json › crawler.biteSlowS), downed 20 s (player.json › downedS), revive 3 s (reviveS; 1.5 s with the kit), return protection 2 s (returnProtectTicks 40); in a zone (fire, acid, gas, spikes, med station): while inside.",
  lengthS: ST_LEN,
  lanes: {
    light: [
      { t0: 0, t1: 0.12, label: "pop in (0.6 → 1)", key: true, nw: true },
      { t0: 0.12, t1: 3.05, label: "glyph loops on its cause's clock; the ring drains", nw: true },
      { t0: 3.05, t1: 3.2, label: "fade out 0.15 s", nw: true },
    ],
    core: [
      { t0: 0, t1: 1, label: "stun: 1 orbit / s (stun breath)", nw: true },
      { t0: 1, t1: 1.5, label: "fire: 1 flame cycle / 0.5 s pulse", nw: true },
      { t0: 1.5, t1: 2.3, label: "acid: 1 drop / 0.8 s (2 pulses)", nw: true },
      { t0: 2.3, t1: 3.2, label: "downed: heartbeat 1 / s", nw: true },
    ],
    game: [{ t0: 0, t1: 3.2, label: "the status' own timer (sim ticks, 20 Hz)" }],
  },
};
export const stA: Look = {
  code: "ST-A",
  title: "A badge of light over the head",
  note: "New. One family of 8 icons for the 10 statuses the game really has that a player can act on (from the shared sim): a dark badge 0.56 m (20 px at game size), one glyph of light in its cause's or meaning's colour, looping on the cause's own clock, and a thin ring that drains over the time left. Shown over the relit 9.13 bodies and the relit 9.15 Behemoth (×1.5). Stacked in a row above the head, at most 3, danger first.",
  bake: async () => {
    boot();
    await stBake();
  },
  goalFirst: {
    goal: "At a glance, what is happening to this body and for how long, with the same picture on a survivor, a zombie and the boss: 8 icons, ≥ 20 px at the game's 36 px/m.",
    elements: [
      { name: "Badge (dark disc, 0.56 m, normal)", job: "READABLE ANYWHERE: separates the glyph from fire, a dark street or a relit body." },
      { name: "STUNNED, amber stars orbiting a swirl", job: "Boss after a crash, 2 s: YOUR WINDOW (amber). One orbit per 1.0 s stun breath." },
      { name: "TRAPPED, amber jaws clenching", job: "Zombie in a bear trap, 3 s (Brute 1.5 s): it can't move, YOUR WINDOW (amber); it still bites. Clench 2 / s." },
      { name: "BURNING, a flame (amber-orange, the fire's colour)", job: "In car fire / molotov / flame cone (zone, no ring) or a zombie ignited 3 s (ring). Flicker on the 0.5 s damage pulse." },
      { name: "ACID, a yellow-green drop", job: "Survivor in a Spitter puddle (zone): a drop per 2 puddle pulses (0.8 s)." },
      { name: "SLOWED, yellow-green chevrons dragged back", job: "Survivor bitten by a Crawler (1 s, ring) or in Bloater gas (zone + 0.25 s); zombie on spikes (zone). The infection / gas colour." },
      { name: "DOWNED, a red heart beating + white revive ring", job: "Survivor at 0 HP: DANGER, 20 s to bleed out (red ring); a teammate reviving fills a white ring outside it (3 s)." },
      { name: "HEALING, a white cross rising", job: "In med-station reach (zone, 5 HP/s): people = white." },
      { name: "PROTECTED, a white shield with a sheen", job: "Back from hold (2 s) / extraction calm (12.75 s): can't be hurt, can't fire." },
      { name: "Timer ring", job: "HOW LONG: drains clockwise from 12 o'clock over the real time left; none for zone statuses." },
      { name: "Not iconised", job: "Knockback (0.2 s: too short), the car-alarm lure (horde-wide, 15 s: clutter), enraged (permanent; the eyes and HUD show it), cooldowns." },
    ],
    composition: [
      "Above the head: screen-up (north) of the body, 0.3 m over its edge (boss ×1.5 = 0.45 m): never over the body or its gun.",
      "Stacking: a row centred on the body, 0.62 m apart, at most 3, order downed > burning > acid > slowed > stunned > trapped > protected > healing.",
      "Brightness: glyph core > ring > glyph bloom > badge. No icon brighter than the boss's warnings (no full-bright red except downed).",
      "Each loop runs on its cause's clock (fire 0.5 s, acid 0.4 s × 2, stun breath 1 s, heartbeat 1 s); the ring on the sim timer.",
      "Pop in 0.12 s (scale 0.6 → 1), fade out the last 0.15 s; a zone status ends when the body leaves (+0.15 s fade).",
    ],
    plan: stPlan,
  },
  draw: stDraw,
  textures: () => stTextures(),
  parts: [
    { id: "badge", label: "Badges" },
    { id: "glyph", label: "Glyphs" },
    { id: "timer", label: "Timer rings" },
  ],
  frames: [
    { label: "pop", t: 0.06, when: "the first icons popping in" },
    { label: "slow bitten", t: 1.0, when: "survivor 1: burning + slowed stacked" },
    { label: "mid", t: 1.6, when: "every icon on, rings ½" },
    { label: "slow over", t: 2.0, when: "the bite slow ends: the row re-centres" },
    { label: "end", t: 3.1, when: "timers ending, fading" },
  ],
};
const stNow: Look = {
  code: "now",
  title: "No icons: tints and HUD glows",
  note: "Today no body shows a status icon. A downed or slowed survivor is tinted (PlayerView), a protected one blinks, a burning one has BurnView's flames, the HUD glows orange / green for fire / acid / gas, the boss's HP bar flashes amber in the stun; a trapped or spike-slowed zombie shows nothing.",
  async bake() {
    boot();
  },
  draw() {},
  textures: () => [],
};
export const stCard: FxCard = {
  id: "status",
  code: "ST",
  name: "Status icons (survivors, zombies, the Behemoth)",
  family: "telegraphs",
  brief: `<p>New card (designer 2026-11-28: <i>"We probably should make some animated status icon for both player and monsters because they could be affected by same statuses."</i>). <b>Goal:</b> at a glance, what is happening to this body and for how long, the same picture on any body. Each icon is <b>light on matter</b>: a dark badge (matter) carries one glyph of light and a thin ring of light that drains over the time left. Colour: the cause's own colour where it has one (fire amber-orange, acid / gas yellow-green, as on the street), else its meaning (amber = your window, red = danger, white = people).</p>`,
  game: `<p>The statuses the sim really has (<code>packages/shared/src</code>; 20 Hz ticks). <b>On the entity:</b> boss STUN 2 s (<code>boss/telegraph.ts</code>, <code>charge.stunS</code>, ×1.5 damage taken); zombie IGNITE 3 s, 3 dmg/s in 0.5 s pulses (<code>combat/flame.ts</code>, the boss never ignites); zombie BEAR-TRAP hold 3 s, Brute 50 % (<code>buildings/bearTrap.ts</code>); survivor SLOW, one slot, the stronger wins (<code>player/slow.ts</code>): Crawler bite 30 % 1 s, Bloater gas 30 % while inside + 0.25 s; survivor DOWNED 20 s, paused while revived, revive 3 s (1.5 s kit) (<code>player/downed.ts</code>); survivor PROTECTED 2 s after a hold / 12.75 s at extraction (<code>player/hold.ts</code>, <code>run/extract.ts</code>). <b>While in a zone:</b> car fire 10 dmg/s, molotov 8 dmg/s, flame cone; Spitter acid 5 dmg/s (survivors only); spike trap 40 % slow (zombies only); med station +5 HP/s. Today the client shows them by tints and HUD glows only: <code>PlayerView</code> DOWNED / SLOWED tints, <code>protectBlink</code>, <code>BurnView</code>, the HUD's gas / acid / fire glow, <code>BossHud</code>'s amber stun flash, <code>FlameView</code>'s burning zombies; nothing on a trapped or slowed zombie.</p>`,
  perf: `<p><b>ST-A</b>: per icon 1 badge (normal) + 1–3 glyph sprites (ADD, 0.56 m: ≤ 0.3 m² each) + 1 Graphics ring (only with a timer); ≤ 3 icons per body → ≤ 13 game objects per body, ≈ 1 m² of ADD. Bake: 1 badge + 17 glyph pictures of 96² (≈ 36 KB each, ≈ 0.65 MB; one 512² atlas in the game). Over a horde: cap the icons (e.g. 24 zombie icons, nearest first; halved with <code>?fx=low</code>), survivors and the boss always. <b>CR-R</b>: CR-A minus the word (−1 ADD 4.5 × 1.7 m) + the stun icon (1 badge, 4 ADD, 1 Graphics) for 2 s.</p>`,
  findings: [
    `The sim has 10 statuses a player can act on; the client shows none of them as an icon, and some not at all: a <b>trapped</b> zombie and a zombie <b>slowed</b> on spikes look exactly like a free one; a <b>stunned</b> boss shows only its pose and the HUD bar's amber flash; a <b>slowed</b> survivor gets a tint (hard to read under the relit 9.13 bodies).`,
    `<b>Slow is one slot</b> (<code>player/slow.ts</code>): a Crawler bite and gas don't stack, the stronger percent wins, so one SLOWED icon is right; the chainsaw's 20 % wielder slow is the player's own choice: no icon.`,
    `<b>Possible sim gap (not tested)</b>: <code>bloater.ts › gasPlayer</code> checks only <code>status === "alive"</code>, not <code>protectTicks</code>, so a protected survivor can still be gas-slowed (fire, acid and bites respect protection). The icons would show PROTECTED and SLOWED together.`,
    `Burning on a survivor has no timer (it lasts while inside the fire; the exposure clock is kept outside so stepping out doesn't dodge a pulse), so the icon has no ring; on a zombie the ignite is a real 3 s timer, so it has one.`,
    `Not iconised on purpose: knockback (0.2 s), the car-alarm lure (15 s on a whole horde: clutter), enraged (permanent: the eyes and the HUD), cooldowns.`,
  ],
  lengthS: ST_LEN,
  gapS: 0,
  keyT: [0.06, 1.0, 1.6, 2.0, 3.1],
  viewM: 8.4,
  aspect: 1.15,
  under: stUnder,
  looks: [stNow, stA],
  plan: stPlan,
};
