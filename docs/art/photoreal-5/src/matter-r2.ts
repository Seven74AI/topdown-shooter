/**
 * Group 5, family "matter", round 2 (designer 2026-11-28, docs/art/photoreal-decisions.md › FX, "Picks, round 2").
 * New looks appended to their cards; every earlier look is unchanged.
 *   - AC-R: "AC are not photoreal, plz improve". AC-G's goal kept, the acid redone per pixel (matter-r2-tex.ts).
 *   - BD-R: "BDG but currently the dust seems to come from above his hands, whereas the dust come from the ground".
 *   - EV-R's arrow (the look itself lives in matter.ts next to EV-A, which it keeps as is): "EVA but with arrow for
 *     stampede, take inspiration of the boss warnings for the arrow".
 * GA-M lives in matter.ts too (it lays GA-A's fog, a matter.ts texture, over GA-G).
 * Each Look's `goalFirst` was written BEFORE its drawing (dead-city-model fx.md › FX 4).
 */
import { make, sprite, ramp, clamp01, idle, countSprite, type Look, type Stage } from "./kit";
import { litPuff, tinted, silhouette, glowTex } from "./matter-tex";
import { acidLiquid, acidGlobR, specGlint, acidBubbleR, acidEtchR, acidFilm, acidLightR, groundBillow, amberStrip, amberHead } from "./matter-r2-tex";
import { relitBoss } from "./relit";
import { WIND_X, WIND_Y } from "../../../../apps/client/src/render/city/fireParticles";
import { BOSS_DUST, dustHash } from "../../../../apps/client/src/render/bossDust";

const on = (st: Stage, part: string): boolean => !st.only || st.only === part;
function hh(i: number, ch: number, seed = 0): number {
  let h = Math.imul(i + 1 + seed * 7919, 2654435761) ^ Math.imul(ch + 7, 1597334677);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}
const WL = Math.hypot(WIND_X, WIND_Y);
const WIND: [number, number] = [WIND_X / WL, WIND_Y / WL];
type Tx = { name: string; canvas: HTMLCanvasElement; note?: string };
const tx = (name: string, canvas: HTMLCanvasElement | undefined, note?: string): Tx => ({ name, canvas: canvas ?? make(1, 1), ...(note ? { note } : {}) });

/* =====================================================================================================
 * AC-R: the Spitter's acid, photoreal.
 * ===================================================================================================== */
const AC_FLIGHT_M = 5;
const AC_FLIGHT_S = AC_FLIGHT_M / 9; // zombies.json › spitter.spit.speedMps 9
const AC_S = 3; // spit.puddleS
const AC_R = 1; // spit.puddleRadiusM
const AC_LIFT = 0.35; // AcidView's cosmetic lob
export const AC_R_END = AC_FLIGHT_S + AC_S + 0.6;
const acT: { glob?: HTMLCanvasElement; glint?: HTMLCanvasElement; glow?: HTMLCanvasElement; shSharp?: HTMLCanvasElement; shSoft?: HTMLCanvasElement; liquid: HTMLCanvasElement[]; etch: HTMLCanvasElement[]; film?: HTMLCanvasElement; light?: HTMLCanvasElement; flash?: HTMLCanvasElement; bub: HTMLCanvasElement[]; fume?: HTMLCanvasElement } = { liquid: [], etch: [], bub: [] };
export const acR: Look = {
  code: "AC-R",
  title: "Real acid: a viscous, glossy liquid eating the asphalt",
  note: "AC-G's goal and clock, kept whole (\"AC are not photoreal, plz improve\"): the glob's shadow closes in on it to tell where it lands, the zone holds at full strength for exactly 3 s and goes out when the damage stops. What changed is the rendering. Every acid picture is now shaded per pixel from a height field, the way the approved slam ground damage and the relit characters are: a thick liquid that is flat on top and rounded at its edge, with the street seen through its thin parts, a sharp reflection of the street light from the upper left and a dark far side. The glob is a heavy drop pulling a viscous string. Bubbles are thin domes with a highlight that pop into a small ring. Under the liquid the asphalt is eaten: the binder goes dark and wet, the stones show, a dried tide line is left. AC-G's bright neon ring is replaced by the acid itself: a thin wet film that ran out to exactly 1 m, ending in a meniscus that glows faintly, over the acid's light on the asphalt.",
  goalFirst: {
    goal: "AC-G's, unchanged: (1) a glob is coming at you: dodge it (15 damage on a hit, 9 m/s, up to 6 m); (2) where it lands, a 1 m circle hurts for exactly 3 s: 2 HP for every 0.4 s your body spends touching it (5/s, zombies.json › spitter.spit), then it is safe. Plus the designer's: it must look like real acid.",
    elements: [
      { name: "Glob", job: "read 1: the threat in flight. A heavy viscous drop pulling a string of smaller drops; deep yellow-green where thick, its own faint glow (only acid glows). The brightest thing on screen." },
      { name: "Glob's highlight", job: "read 1, and 'it is wet': a sharp reflection of the street light, its own unrotated sprite so it stays upper-left whatever the flight." },
      { name: "Glob's shadow", job: "read 1: where and when it lands (AC-G's: soft and far at the top of the lob, sharp and under the glob at the landing)." },
      { name: "Liquid", job: "read 2: this is acid, it came from that glob. A splat thrown forward, thick in the middle (impact mound, slow wrinkles), see-through at its thin edges, glossy: shaded per pixel from its thickness." },
      { name: "Wet film to R", job: "read 2: the exact zone, as matter. The acid ran out thin over the asphalt to exactly 1 m: a darker, glossy film catching the street light on its upper-left side, ending in a hair-thin meniscus (its outer edge = R)." },
      { name: "The acid's light on the asphalt (ADD)", job: "read 2: the zone, as light. Strongest at the liquid, an even floor out to R broken by the asphalt's grain, and the meniscus glowing faintly at R. This replaces AC-G's neon edge line." },
      { name: "Bubbles", job: "read 2: still active. Thin film domes with a highlight, out of step, that pop into a small settling ring; inside the liquid only." },
      { name: "Fumes", job: "'it is eating something': thin grey-green vapour off the liquid, drifting with the street's wind; not glowing; may cross the edge (they don't hurt)." },
      { name: "Eaten asphalt (the mark)", job: "after 3 s: it's over, the street keeps the scar. Binder dark and wet, stones laid bare (lit upper-left), a dried tide line, a few pits. Darkens over the first second as the acid eats in. Never green." },
      { name: "Cut: AC-G's neon edge ring", job: "a flat bright stroke is a drawn sign, not acid. The edge is now the film's meniscus and the light, still exactly at R." },
      { name: "Cut: the flat gradient splat", job: "AC-G's splat was a gradient fill with a bright rim: it read as a sticker." },
    ],
    composition: [
      "Inside the 1 m circle: liquid, bubbles, film, light, everything bright. Only the dull fumes may cross R. The circle comes from the film and the light, never from the liquid's shape.",
      "Brightness: the glob (and its highlight) > the liquid's highlights > the meniscus at R > the liquid's body > the acid light on the asphalt > fumes > the mark.",
      "One light: every highlight (glob, liquid, bubbles, film gloss, the stones in the mark) is the street light from the upper left; every far side is darker.",
      "One clock, the game's: the zone (film + light) is on from the splash's first frame and holds for 3 s; it goes out in 0.08 s at 3 s, the liquid sinks in 0.25 s, the mark stays and fades over 0.6 s.",
      "Matter follows its cause: a flash of acid light on the splash (0.15 s); the liquid spreads in 0.12 s; the asphalt darkens over the first second; fumes from 0.2 s; bubbles from 0.15 s.",
    ],
    plan: {
      goal: "See it coming and where it lands; then the exact 1 m circle for exactly 3 s, as real acid eating the street; then safe.",
      timing: "Flight 5 m at 9 m/s = 0.56 s; puddle 3 s, 5 dmg/s per body in 0.4 s steps (zombies.json › spitter.spit, spit.ts).",
      lengthS: AC_R_END,
      lanes: {
        light: [
          { t0: 0, t1: AC_FLIGHT_S, label: "glob glow + highlight" },
          { t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + 0.15, label: "splash flash", key: true, nw: true },
          { t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + AC_S, label: "acid light on the asphalt + meniscus = the zone", nw: true },
          { t0: AC_FLIGHT_S + AC_S, t1: AC_FLIGHT_S + AC_S + 0.08, label: "off", key: true },
        ],
        core: [
          { t0: 0, t1: AC_FLIGHT_S, label: "glob + string, shadow closing in" },
          { t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + 0.12, label: "splat forward", key: true },
          { t0: AC_FLIGHT_S + 0.12, t1: AC_FLIGHT_S + AC_S, label: "liquid (lit per pixel) + film to R + bubbles", nw: true },
          { t0: AC_FLIGHT_S + AC_S, t1: AC_FLIGHT_S + AC_S + 0.25, label: "sinks in" },
        ],
        smoke: [{ t0: AC_FLIGHT_S + 0.2, t1: AC_FLIGHT_S + AC_S, label: "fumes, downwind" }],
        mark: [
          { t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + 1, label: "asphalt eaten: binder darkens, stones show", nw: true },
          { t0: AC_FLIGHT_S + AC_S, t1: AC_R_END, label: "mark alone, fades" },
        ],
        game: [
          { t0: 0, t1: 0.05, label: "spit", key: true },
          { t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + 0.05, label: "splash", key: true },
          { t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + AC_S, label: "acid: 2 HP per 0.4 s inside (per body)" },
        ],
      },
    },
  },
  async bake() {
    if (acT.glob) return;
    acT.glob = acidGlobR();
    acT.glint = specGlint();
    acT.glow = glowTex(40, "170,255,70", 0.8, 0.25);
    acT.flash = glowTex(64, "170,255,80", 0.7, 0.22);
    acT.shSharp = silhouette(acT.glob, "rgba(0,0,0,0.7)", 1);
    acT.shSoft = silhouette(acT.glob, "rgba(0,0,0,0.5)", 5);
    await idle();
    acT.liquid = [acidLiquid(144, 3)];
    await idle();
    acT.liquid.push(acidLiquid(144, 8));
    await idle();
    acT.etch = [acidEtchR(144, 3), acidEtchR(144, 8)];
    await idle();
    acT.film = acidFilm(144);
    acT.light = acidLightR(144);
    acT.bub = [0, 1, 2].map((f) => acidBubbleR(f));
    acT.fume = tinted(litPuff(48, 33, { rag: 0.7, scale: 2.6, alpha: 0.5 }), [165, 178, 148]);
  },
  draw(g, t, st) {
    const px = st.pxm;
    const x0 = st.cx - 3.2 * px;
    const lx = x0 + AC_FLIGHT_M * px;
    const ly = st.cy;
    if (t < AC_FLIGHT_S) {
      const f = clamp01(t / AC_FLIGHT_S);
      const arc = 4 * f * (1 - f);
      const hgt = AC_LIFT * arc;
      const x = x0 + f * AC_FLIGHT_M * px;
      const s = 0.56 * (1 + 0.5 * arc);
      if (on(st, "shadow")) {
        const sx = x + 0.6 * hgt * 1.6 * px;
        const sy = ly + 0.8 * hgt * 1.6 * px;
        sprite(g, acT.shSoft!, sx, sy, s * 1.2, px, 0, 0.45 * arc);
        sprite(g, acT.shSharp!, sx, sy, s * 0.95, px, 0, 0.7 * (1 - arc));
      }
      const y = ly - hgt * px;
      if (on(st, "glob")) {
        sprite(g, acT.glow!, x + 0.12 * px, y, 0.7, px, 0, 0.45, true);
        sprite(g, acT.glob!, x - 0.04 * px, y, s, px, 0);
      }
      if (on(st, "glint")) sprite(g, acT.glint!, x + 0.1 * px, y - 0.06 * px, 0.11, px, 0, 0.95);
      return;
    }
    const age = t - AC_FLIGHT_S;
    const v = st.seed % 2;
    const live = age < AC_S;
    if (on(st, "mark")) {
      const a = live ? 0.3 + 0.7 * ramp(age, 0, 1) : 1 - clamp01((age - AC_S) / 0.6);
      sprite(g, acT.etch[v] as HTMLCanvasElement, lx, ly, 2 * AC_R, px, 0, a);
    }
    const zoneA = live ? Math.min(1, age / 0.04) : 1 - clamp01((age - AC_S) / 0.08);
    if (on(st, "film")) sprite(g, acT.film!, lx, ly, 2 * AC_R, px, 0, zoneA);
    if (on(st, "light")) sprite(g, acT.light!, lx, ly, 2 * AC_R, px, 0, 0.36 * zoneA, true);
    if (on(st, "light") && age < 0.15) sprite(g, acT.flash!, lx + 0.1 * px, ly, 1.7, px, 0, 0.7 * (1 - age / 0.15), true);
    const liqA = live ? 1 : 1 - clamp01((age - AC_S) / 0.25);
    if (on(st, "liquid") && liqA > 0) {
      const sp = 0.55 + 0.45 * ramp(age, 0, 0.12);
      sprite(g, acT.liquid[v] as HTMLCanvasElement, lx + (1 - sp) * 0.3 * px, ly, 2 * AC_R * sp, px, 0, liqA);
    }
    if (on(st, "bubbles") && live) {
      const nb = st.low ? 2 : 3;
      for (let k = 0; k < nb; k++) {
        const per = 0.9 + hh(k, 8) * 0.6;
        const ph = (age / per + hh(k, 3)) % 1;
        const fr = ph < 0.4 ? 0 : ph < 0.82 ? 1 : 2;
        const ang = hh(k, 4) * Math.PI * 2;
        const d = 0.06 + 0.24 * hh(k, 5);
        const a = (fr === 2 ? 1 - (ph - 0.82) / 0.18 : 1) * ramp(age, 0.15, 0.3);
        sprite(g, acT.bub[fr] as HTMLCanvasElement, lx + (0.12 + Math.cos(ang) * d) * px, ly + Math.sin(ang) * d * 0.8 * px, fr === 0 ? 0.13 : 0.18, px, 0, a);
      }
    }
    if (on(st, "fumes") && live && age > 0.2) {
      const nw = st.low ? 2 : 3;
      for (let k = 0; k < nw; k++) {
        const ph = (age * 0.45 + k / nw) % 1;
        const fx = lx + ((hh(k, 6) - 0.5) * 0.7 + WIND[0] * ph * 0.6) * px;
        const fy = ly + ((hh(k, 7) - 0.5) * 0.5 + WIND[1] * ph * 0.6 - ph * 0.3) * px;
        sprite(g, acT.fume!, fx, fy, 0.45 + 0.5 * ph, px, 0, 0.26 * Math.sin(Math.PI * ph) * ramp(age, 0.2, 0.5));
      }
    }
  },
  textures: () => [
    tx("acid_glob_r", acT.glob, "per-pixel lit, 96×44"),
    tx("acid_glint", acT.glint, "unrotated, 24×16"),
    tx("glob_glow (ADD, 40²)", acT.glow),
    tx("glob_shadow_sharp", acT.shSharp),
    tx("glob_shadow_soft", acT.shSoft),
    tx("acid_liquid_a", acT.liquid[0], "faces the flight, 144²"),
    tx("acid_liquid_b", acT.liquid[1]),
    tx("asphalt_eaten_a", acT.etch[0], "the mark"),
    tx("asphalt_eaten_b", acT.etch[1]),
    tx("acid_film", acT.film, "outer edge = R"),
    tx("acid_light (ADD)", acT.light, "ends at R"),
    tx("splash_flash (ADD, 64²)", acT.flash),
    ...acT.bub.map((b, i) => tx(`acid_bubble_r${i}`, b, "32²")),
    tx("acid_fume (shared puff)", acT.fume),
  ],
  parts: [
    { id: "glob", label: "Glob + glow" },
    { id: "glint", label: "Glob's highlight" },
    { id: "shadow", label: "Glob's shadow" },
    { id: "liquid", label: "Liquid" },
    { id: "film", label: "Wet film to R" },
    { id: "light", label: "Acid light (zone) + splash flash" },
    { id: "bubbles", label: "Bubbles" },
    { id: "fumes", label: "Fumes" },
    { id: "mark", label: "Eaten asphalt" },
  ],
  frames: [
    { label: "flight", t: AC_FLIGHT_S * 0.5, when: "top of the lob (shadow soft, far)" },
    { label: "landing", t: AC_FLIGHT_S * 0.9, when: "shadow meets the glob" },
    { label: "splat", t: AC_FLIGHT_S + 0.06, when: "zone on, splash flash" },
    { label: "lying", t: AC_FLIGHT_S + 1.5, when: "steady; asphalt eaten" },
    { label: "last", t: AC_FLIGHT_S + 2.95, when: "still full: it still hurts" },
    { label: "over", t: AC_FLIGHT_S + 3.15, when: "zone off, the mark only" },
  ],
};

/* =====================================================================================================
 * BD-R: the Behemoth's dust, born on the ground under the fists.
 * ===================================================================================================== */
const BOSS_R = 2;
const SLAM_R = 4.5; // boss.json › slam.radiusM
const PUFF_COLOR: [number, number, number] = [0xb8, 0xad, 0xa0];
interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  t0: number;
  grit: boolean;
}
/**
 * 9.15's slam puffs (BOSS_DUST: count, speed × 0.4–1, radius × 0.6–1.2, life × 0.7–1.2, start within 0.08 s, the
 * shoulders' grit), with BD-G's geometry (the half away from the body; visible dust inside 4.2 m). New in BD-R: the
 * dust is born UNDER the fist (a little behind its front, on the street) so the fist covers its birth.
 */
const SLAM_PUFFS_R: Puff[] = ((): Puff[] => {
  const out: Puff[] = [];
  const B = BOSS_DUST.slamFists;
  let e = 0;
  for (const side of [-1, 1]) {
    const fx = BOSS_DUST.fistAhead * BOSS_R;
    const fy = side * BOSS_DUST.fistSide * BOSS_R;
    const outA = Math.atan2(fy, fx);
    for (let k = 0; k < B.n; k++, e++) {
      const a = outA + (dustHash(e, 1) - 0.5) * Math.PI;
      let s = B.speed * (0.4 + 0.6 * dustHash(e, 2));
      const r = B.r * (0.6 + 0.6 * dustHash(e, 3));
      const life = B.lifeS * (0.7 + 0.5 * dustHash(e, 4));
      const u = 0.7;
      const reach = (sp: number): number => Math.hypot(fx + Math.cos(a) * sp * life * u, fy + Math.sin(a) * sp * life * u) + r * (1 + BOSS_DUST.grow * u) * 1.3;
      while (s > 0.2 && reach(s) > SLAM_R - 0.3) s *= 0.9;
      out.push({ x: fx - 0.15, y: fy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r, life, t0: BOSS_DUST.jitterS * dustHash(e, 5), grit: false });
    }
  }
  const G = BOSS_DUST.slamGrit;
  for (const side of [-1, 1])
    for (let k = 0; k < G.n; k++, e++) {
      const out1 = G.outMin + (G.outMax - G.outMin) * dustHash(e, 6);
      out.push({ x: G.ahead * BOSS_R, y: side * G.side * BOSS_R, vx: (dustHash(e, 7) - 0.3) * 0.5, vy: side * out1, r: G.r, life: G.lifeS, t0: G.delayS + k * G.everyS, grit: true });
    }
  return out;
})();
const SKIRT_S = 0.4;
const bdT: { billow: HTMLCanvasElement[]; grit: HTMLCanvasElement[]; body?: HTMLCanvasElement } = { billow: [], grit: [] };
export const bdR: Look = {
  code: "BD-R",
  title: "Dust born on the street, under the fists",
  note: "BD-G with the dust moved to the ground (\"BDG but currently the dust seems to come from above his hands, whereas the dust come from the ground\"). Two reasons it floated: 9.15 draws the dust ABOVE the body (BossView: body depth + 0.01), so puffs sit on top of the fists; and each puff was a round, evenly lit ball. BD-R draws the dust UNDER the body (it is born on the street, so the fist covers where it starts), makes each puff low and wide across its motion, lit from above with its own soft contact shadow on the street, and adds a flat skirt of dust squeezed out from under each fist in the first 0.4 s. 9.15's timing, counts, sizes, alpha and tint are kept, and BD-G's directions (away from the body, visible dust inside 4.2 m). The grit off the shoulders stays above the body: it falls from the shoulders.",
  goalFirst: {
    goal: "BD-G's: the slam lands with weight right here, at the fists (boss.json › slam: 40 damage inside 4.5 m at the hit), and the dust is never read as the slam's edge nor hides the boss's next tell. Plus the designer's: the dust comes from the ground, where the fists hit.",
    elements: [
      { name: "Skirt (one per fist)", job: "'it hit the street here': a flat sheet of dust squeezed out from under the fist in the first 0.4 s, low and wide, half of it hidden under the fist. It is what says 'ground'." },
      { name: "Ground billows (2 × 9, 9.15's)", job: "'the dust rolls out along the ground': each puff low and wide across its motion, top-lit, its rolled front shaded, its own soft contact shadow baked under its down-right edge so it sits ON the street." },
      { name: "Under the body", job: "'it starts under the fists': drawn below the boss (depth body − 0.01, above the decals), so the fists cover the birth and the dust emerges from beneath them. 9.15 draws it above the body: that is what made it float over the hands." },
      { name: "Away from the body, inside 4.2 m (BD-G)", job: "the dust never covers the body's tell and is never read as the 4.5 m slam edge." },
      { name: "Grit off the shoulders (9.15)", job: "'the body shook': chips falling from the shoulders, so they stay above the body." },
      { name: "Cut: round evenly lit balls", job: "a ball of dust lit all round reads as a cloud in the air; dust on the ground is flat, bright on top, with a shadow under it." },
    ],
    composition: [
      "Draw order: street → skirt + billows → the boss's body → grit. Nothing of the dust is ever on top of the fists or the body.",
      "Dust only in front of and beside the fists, two clusters (BD-G), never a ring round the boss; the visible dust ends 0.3 m inside the slam's edge.",
      "Brightness: the boss and its tells > the billows' lit tops (peak alpha 0.5, 9.15's) > the skirt (0.4) > their shadows > the street. No colour: tint b8ada0.",
      "One clock: 9.15's. The skirt and the bursts start on the hit (within 0.08 s), the skirt is out by 0.4 s, puffs live 0.35–0.6 s, grow × 2.6, fade linearly; grit one every 0.07 s from 0.05 s.",
      "One light: the billows are never turned (light baked upper-left and from above); they stretch, wide across their motion (× 1.4) and short along it (× 0.85).",
    ],
    plan: {
      goal: "The slam lands with weight here: the street throws out dust from under the fists.",
      timing: "From the slam hit (boss.json slam: telegraph 1.2 s, then the hit); 9.15's BOSS_DUST unchanged in time.",
      lengthS: 0.6,
      lanes: {
        smoke: [
          { t0: 0, t1: SKIRT_S, label: "skirt from under each fist", key: true, nw: true },
          { t0: 0, t1: 0.6, label: "ground billows: away from the body, ≤ 4.2 m, under the body", nw: true },
        ],
        matter: [{ t0: 0.05, t1: 0.47, label: "grit off the shoulders (9.15), above the body" }],
        game: [{ t0: 0, t1: 0.05, label: "slam hit (BossView, 9.15)", key: true }],
      },
    },
  },
  async bake() {
    if (bdT.billow.length) return;
    for (const s of [1, 2, 3]) {
      bdT.billow.push(tinted(groundBillow(80, 40 + s), PUFF_COLOR));
      await idle();
    }
    bdT.grit = [tinted(litPuff(24, 70, { rag: 0.3, scale: 2, alpha: 0.9, shade: 1.4 }), PUFF_COLOR)];
    bdT.body = relitBoss("slamhit_a"); // the relit 9.15 Behemoth (as the card's context)
  },
  draw(g, t, st) {
    const px = st.pxm;
    if (st.only === null) {
      g.save();
      g.strokeStyle = "rgba(240,240,240,0.28)";
      g.lineWidth = 1;
      g.setLineDash([4, 4]);
      g.beginPath();
      g.arc(st.cx, st.cy, SLAM_R * px, -0.9, 0.9);
      g.stroke();
      g.restore();
    }
    // the skirt: under the body, squeezed out from under each fist
    if (on(st, "skirt") && t < SKIRT_S + BOSS_DUST.jitterS) {
      for (const side of [-1, 1]) {
        const u = clamp01(t / SKIRT_S);
        const e = 1 - Math.pow(1 - u, 3);
        const fx = st.cx + (BOSS_DUST.fistAhead * BOSS_R + 0.2 + 0.5 * e) * px;
        const fy = st.cy + side * (BOSS_DUST.fistSide * BOSS_R + 0.3 * e) * px;
        sprite(g, bdT.billow[side > 0 ? 1 : 2] as HTMLCanvasElement, fx, fy, 1.4 + 1.8 * e, px, 0, 0.55 * (1 - u * u) * Math.min(1, t / 0.03), false, 1.1 + 1.4 * e);
      }
    }
    const n = st.low ? 24 : BOSS_DUST.pool;
    const drawPuffs = (grit: boolean): void => {
      if (!on(st, grit ? "grit" : "dust")) return;
      SLAM_PUFFS_R.forEach((p, i) => {
        if (i >= n || p.grit !== grit) return;
        const age = t - p.t0;
        if (age < 0 || age >= p.life) return;
        const u = age / p.life;
        const x = st.cx + (p.x + p.vx * age) * px;
        const y = st.cy + (p.y + p.vy * age) * px;
        const d = 2 * p.r * (1 + BOSS_DUST.grow * u);
        if (grit) {
          sprite(g, bdT.grit[0] as HTMLCanvasElement, x, y, d, px, 0, BOSS_DUST.alpha * 1.6 * (1 - u));
          return;
        }
        const sp = Math.hypot(p.vx, p.vy) || 1;
        const ax = Math.abs(p.vx / sp);
        const ay = Math.abs(p.vy / sp);
        // wide across the motion, short along it
        const w = d * (0.85 * ax + 1.4 * ay);
        const h = d * (1.4 * ax + 0.85 * ay);
        sprite(g, bdT.billow[i % 3] as HTMLCanvasElement, x, y, w, px, 0, BOSS_DUST.alpha * (1 - u), false, h);
      });
    };
    drawPuffs(false);
    // the body over the dust (context: the game draws it anyway; the dust's depth goes under it)
    if (st.only === null && bdT.body) {
      const w = 7 * px;
      g.drawImage(bdT.body, st.cx - w / 2, st.cy - w / 2, w, w);
    }
    drawPuffs(true);
  },
  textures: () => [...bdT.billow.map((d, i) => tx(`ground_billow_${"abc"[i]} (tinted b8ada0)`, d, "80², contact shadow baked")), tx("grit (tinted)", bdT.grit[0], "24²")],
  parts: [
    { id: "skirt", label: "Skirt from under the fists" },
    { id: "dust", label: "Ground billows" },
    { id: "grit", label: "Grit off the shoulders" },
  ],
  frames: [
    { label: "hit", t: 0.06, when: "slam hit: skirt out from under the fists" },
    { label: "spread", t: 0.25, when: "rolling out; grit off the shoulders" },
    { label: "thin", t: 0.45, when: "fading, inside 4.2 m" },
  ],
};

/* =====================================================================================================
 * EV-R's stampede arrow (the look is in matter.ts: EV-A as is + this arrow).
 * ===================================================================================================== */
export const STAMPEDE_WARN_S = 3; // events.json › stampede.warningS
const LANE_W = 8; // stampede.laneWidthM
/** On the page: the lane's start edge at x = +1.9 m, running +x (EV-A's dust). */
const EDGE_X = 2.05;
const ARROW_M = 3.75;
const HEAD_L = 1.3;
const HEAD_W = 2.6;
const arT: { bar?: HTMLCanvasElement; stem?: HTMLCanvasElement; head?: HTMLCanvasElement; front?: HTMLCanvasElement } = {};
export async function bakeArrow(): Promise<void> {
  if (arT.bar) return;
  arT.bar = amberStrip(LANE_W, 0.9, 24, 61);
  arT.stem = amberStrip(ARROW_M, 0.7, 24, 63);
  arT.head = amberHead(HEAD_L, HEAD_W, 24, 65);
  arT.front = glowTex(48, "255,200,110", 0.95, 0.3);
}
export const arrowTextures = (): Tx[] => [tx("lane_start_bar (ADD)", arT.bar, `${LANE_W} × 0.9 m, 192×22`), tx("arrow_stem (ADD)", arT.stem, "cropped to the clock"), tx("arrow_head (ADD)", arT.head, `${HEAD_L} × ${HEAD_W} m`), tx("clock_front (ADD, 48²)", arT.front)];
export const ARROW_PARTS = [
  { id: "bar", label: "Arrow: start edge (from)" },
  { id: "stem", label: "Arrow: stem = the clock" },
  { id: "head", label: "Arrow: head (to)" },
] as const;
/** Draws `tex` cropped to its first `k` (0–1) along x, as one sprite: left end at (x, y) px, `wM` × `hM` m. */
function cropX(g: CanvasRenderingContext2D, tex: HTMLCanvasElement, k: number, x: number, y: number, wM: number, hM: number, pxm: number, a: number): void {
  if (k <= 0.002 || a <= 0.003) return;
  countSprite(true);
  g.save();
  g.globalAlpha = Math.min(1, a);
  g.globalCompositeOperation = "lighter";
  g.drawImage(tex, 0, 0, Math.max(1, tex.width * k), tex.height, x, y - (hM * pxm) / 2, wM * k * pxm, hM * pxm);
  g.restore();
}
/**
 * The stampede arrow over the 3 s warning (t from the warning's start). The Behemoth's warning language (CL-A: lines
 * of light on the asphalt; SD: the lit edge is also the clock), in amber (an event):
 *   - the start bar across the 8 m lane at its entry edge: where they come FROM; brightens 55 → 100 % over the warning;
 *   - the stem from the bar along the lane: lit up to a front that reaches the head at 3 s = the clock;
 *   - the head: where they GO; faint until the clock reaches it, then full at 3 s when the herd enters;
 *   - all flare together at 3 s (the release), then fade in 0.3 s: the herd itself takes over.
 */
export function drawArrow(g: CanvasRenderingContext2D, t: number, st: Stage): void {
  if (t >= STAMPEDE_WARN_S + 0.3) return;
  const px = st.pxm;
  const p = clamp01(t / STAMPEDE_WARN_S);
  const out = t > STAMPEDE_WARN_S ? 1 - (t - STAMPEDE_WARN_S) / 0.3 : 1;
  const rel = t >= STAMPEDE_WARN_S ? 1 - ramp(t, STAMPEDE_WARN_S, STAMPEDE_WARN_S + 0.15) : 0;
  const ex = st.cx + EDGE_X * px;
  const ey = st.cy;
  const inA = Math.min(1, t / 0.15);
  if (on(st, "bar")) sprite(g, arT.bar!, ex, ey, LANE_W, px, Math.PI / 2, inA * out * (0.4 + 0.4 * p) + rel * 0.4, true);
  const stemL = ARROW_M - 0.12; // the stem runs to the tip: the clock's front reaches the tip at 3 s
  if (on(st, "stem")) {
    cropX(g, arT.stem!, 1, ex, ey, stemL, 0.7, px, 0.22 * inA * out); // the whole stem, faint: the arrow reads at once
    cropX(g, arT.stem!, p, ex, ey, stemL, 0.7, px, 0.75 * inA * out + rel * 0.3); // lit to the clock's front
    if (t < STAMPEDE_WARN_S) sprite(g, arT.front!, ex + stemL * p * px, ey, 0.55, px, 0, 0.8 * inA, true);
  }
  if (on(st, "head")) {
    const hx = ex + (ARROW_M - HEAD_L / 2) * px;
    const lit = ramp(p, 0.85, 1);
    sprite(g, arT.head!, hx, ey, HEAD_L + 0.6, px, 0, (0.3 + 0.7 * lit) * inA * out + rel * 0.5, true);
  }
}
