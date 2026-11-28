/**
 * AC-N: the Spitter's acid, redesigned from the goal and the real material (designer 2026-11-28: "AC are not
 * photoreal" and "how is it possible ACR ressemble exactly the other AC?"; skill fx.md › FX 4 and FX 6).
 *
 * The reasoning (goal → real traits → elements → composition → timeline) is in `acN.goalFirst`, written before the
 * drawing; the textures are in `matter-ac-n-tex.ts`. Works like the game: `bake()` once, `draw()` composes sprites.
 */
import { make, sprite, ramp, clamp01, idle, type Look, type Stage } from "./kit";
import { acnZone, acnMark, acnSkid, acnGlob, acnLight, acnFoam, acnWisp, craze, SKID_W_M, SKID_H_M, GLOB_BOX_M, FOAM_M, WISP_W_M, WISP_H_M, IMPACT, ACN_R } from "./matter-ac-n-tex";
import { relitSurvivor } from "./relit";
import { CHAR_EXTENT_R } from "../../../../apps/client/src/render/city/spriteArt";
import { WIND_X, WIND_Y } from "../../../../apps/client/src/render/city/fireParticles";
import PLAYER from "../../../../packages/shared/src/config/balance/player.json";
import ZOMBIES from "../../../../packages/shared/src/config/balance/zombies.json";

const SPIT = ZOMBIES.types.spitter.spit;
const on = (st: Stage, part: string): boolean => !st.only || st.only === part;
function hh(i: number, ch: number, seed = 0): number {
  let h = Math.imul(i + 1 + seed * 7919, 2654435761) ^ Math.imul(ch + 7, 1597334677);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}
const WL = Math.hypot(WIND_X, WIND_Y);
const WIND: [number, number] = [WIND_X / WL, WIND_Y / WL];
const WIND_ROT = Math.atan2(WIND[1], WIND[0]);
type Tx = { name: string; canvas: HTMLCanvasElement; note?: string };
const tx = (name: string, canvas: HTMLCanvasElement | undefined, note?: string): Tx => ({ name, canvas: canvas ?? make(1, 1), ...(note ? { note } : {}) });

/* ---------------- the game's numbers (zombies.json › spitter.spit, spit.ts, constants.ts) ---------------- */
const FLIGHT_M = 5; // the page's throw (≤ rangeM 6)
const FLIGHT_S = FLIGHT_M / SPIT.speedMps; // 9 m/s → 0.56 s
const LIVE_S = SPIT.puddleS; // 3 s
const R = SPIT.puddleRadiusM; // 1 m
const TICK_S = SPIT.puddlePulseS; // 0.4 s: 2 HP per 0.4 s inside (5/s)
const HIT_HP = Math.round(SPIT.puddleDamagePerS * SPIT.puddlePulseS);
const LIFT_M = 0.35; // AcidView's cosmetic lob
/** The running acid reaches R at the glob's own speed: 1 m at 9 m/s ≈ 0.11 s. */
const RUN_S = R / SPIT.speedMps;
const MARK_FADE_S = 0.6;
export const AC_N_END = FLIGHT_S + LIVE_S + MARK_FADE_S;
/** A survivor standing with their body just over the edge (centre 1.25 m out, body radius 0.4: 0.15 m inside). */
const SURV_SIDE = 2 * PLAYER.radiusM * CHAR_EXTENT_R.survivor;
const SURV_AT: [number, number] = [0.35, 1.2];

const T: {
  glob: HTMLCanvasElement[];
  bloom?: HTMLCanvasElement;
  under?: HTMLCanvasElement;
  zone: HTMLCanvasElement[];
  run: HTMLCanvasElement[];
  mark: HTMLCanvasElement[];
  skid: HTMLCanvasElement[];
  skidGlow?: HTMLCanvasElement;
  foam: HTMLCanvasElement[];
  wisp: HTMLCanvasElement[];
  spots: [number, number][][];
} = { glob: [], zone: [], run: [], mark: [], skid: [], foam: [], wisp: [], spots: [] };
const SEEDS = [5, 12];

export const acN: Look = {
  code: "AC-N",
  title: "Bile in the cracks: the acid runs into the crazed asphalt and eats it",
  note: "A new design, not a re-shade. Every earlier AC (A, B, G, R) is the same picture: a round splat in the middle of a glowing disc with a lit edge. AC-N has no pool, no glowing fill and no ring. In flight the glob is a wobbling lump that lights the street under it (no shadow). It does not splash: it skids forward and piles up a ridge, a thin tail behind. Its acid runs into the old asphalt's fine cracks at the glob's own speed and reaches exactly 1 m in 0.11 s: the zone is a net of glowing cracks over wet, darker asphalt, cut off where the acid stopped. Froth fizzes at the crack crossings on the 0.4 s damage tick, a pale vapour leans downwind, the skid drains into the cracks over 3 s. At 3 s the light goes out and a charred, black crazed scar is left.",
  goalFirst: {
    goal: `(1) A glob is coming: dodge it (${SPIT.damage} damage on a hit, ${SPIT.speedMps} m/s, up to ${SPIT.rangeM} m). (2) Where it lands, a ${R} m circle hurts for exactly ${LIVE_S} s: ${HIT_HP} HP for every ${TICK_S} s your body spends touching it (${SPIT.puddleDamagePerS}/s; per-body clock, spit.ts › acidTicks), then it is safe. It must read at 36 px/m in the dark, and in a blackout (the game draws a ghost copy above the darkness).<span style="display:block;font-size:0.72em;line-height:1.45;margin-top:8px"><b>The real thing, observed before drawing</b> (step 2: corrosive, viscous bile spat onto old asphalt, over 3 s): <b>T1</b> a viscous lump hitting at a low angle does not splash; it skids and piles up a ridge at its front, leaving a thin tail behind (viscosity kills the spray). <b>T2</b> on old asphalt a liquid does not stay a pool: a thin sheet wets the surface and the bulk wicks into the fine crazing (alligator cracks, plates of 15–30 cm) and collects at their crossings, the low spots; the cracks hold it longest. <b>T3</b> acid attacks the stone fines: it fizzes, with a pale froth where fresh acid meets fresh stone (in the cracks), and the heat of the reaction lifts a pale vapour that the wind draws out. <b>T4</b> thickness sets the colour: thick bile is deep and saturated (and here glows), a thin film is nearly clear and only darkens the wet asphalt and makes it glossy. <b>T5</b> it ends by soaking in and being spent: the bulk drains into the cracks, the surface goes matte, the fizz stops, and the binder along the cracks is left charred black.</span>`,
    elements: [
      { name: "Glob (T1, T4)", job: "read 1, the threat in flight: a thick, glowing lump that wobbles (surface tension: stretched along the flight, then squashed, 0.2 s per wobble). The brightest thing on screen. No strings (a lump, not a drop)." },
      { name: "The glob's light on the street", job: "read 1, where it lands: a glowing thing lights the ground under it. A small green light runs under the glob, tighter and brighter as it comes down, and lands with it. It replaces the shadow of A / G / R." },
      { name: "Skid (T1)", job: "it landed here, coming from there: the glob's body, a ridge piled up at the front, a thin tail back toward the Spitter, short tongues into the nearest cracks. Inside 0.45 m. Drains into the cracks over 3 s (T5): thinner, matte, smaller." },
      { name: "Acid in the cracks (T2, the zone)", job: "read 2, the exact circle: the crazed net of the asphalt filled with glowing acid, brightest where cracks cross. It covers the whole 1 m disc evenly and stops at R, because that is where the acid's sheet stopped. The circle is where the net ends, not a drawn line." },
      { name: "Wet sheet (T2, T4)", job: "read 2 between the cracks: inside R the asphalt is wet, darker and glossier than the dry street, its plates' rims catching the street light upper-left. Gives the disc a body so it reads at game size." },
      { name: "Froth at the crossings (T3)", job: "still active, and the damage rhythm: pale froth beads (lit, never glowing) swell and burst on a 0.4 s cycle, the damage tick; each bead has its own phase (the clock is per body), so the zone never pulses as a whole." },
      { name: "Vapour (T3)", job: "nasty and alive: thin pale strands rising off the skid and the crossings and leaning downwind (the street's wind, fireParticles.ts). The only thing allowed over R: it does not hurt." },
      { name: "Charred net (T5, the mark)", job: "after 3 s, safe: the light is out and a black crazed scar is left (the acid charred the binder along the cracks it ran in). Matte, darker than the street, never green." },
      { name: "Cut: the glowing disc, the edge ring, the pool", job: "A / B / G / R all show a lit pool inside a glowing circle with an edge line. A real acid on asphalt has none of these: it is a stain that runs into cracks." },
      { name: "Cut: the glob's shadow and its strings", job: "used by A / G / R. A glowing lump lights the ground; its light pool already tells the landing spot." },
      { name: "Cut: splash drops", job: "a viscous lump at a low angle does not throw droplets (T1); drops outside R would lie about the zone." },
    ],
    composition: [
      "Where: inside R only the skid (≤ 0.45 m), the acid in the cracks, the wet sheet and the froth (≤ 0.92 m). Outside R: nothing but the vapour. The net and the wet sheet are cut at exactly R, so the zone's edge is the end of the acid, with no stroke on it.",
      "Brightness follows thickness (T4): the glob in flight > the skid's ridge (the thickest bile) > the crack crossings where it pools > the full cracks > the damp cracks > the froth (lit, not glowing) > the wet sheet's sheen > the vapour > the charred mark.",
      `One clock, the damage tick (${TICK_S} s): every froth bead swells and bursts once per ${TICK_S} s, each on its own phase. The cracks' light is steady from ${RUN_S.toFixed(2)} s to 3.00 s: no fade while it still hurts.`,
      "One light: every highlight (the glob's, the skid's ridge, the plates' rims, the froth domes) is the street light from the upper left; every far side is darker. Only the acid glows.",
      `Release and follow: light first (the skid glow flares for 0.15 s), the acid runs out to R at the glob's speed (${RUN_S.toFixed(2)} s), the vapour bursts at once and then trails, the froth starts at 0.15 s, the binder chars over 1.2 s. At 3 s: the cracks go out in 0.08 s, the froth collapses, the skid is gone in 0.25 s, the vapour dies in 0.4 s, the black scar fades over ${MARK_FADE_S} s.`,
    ],
    plan: {
      goal: "See the lump coming and where its light lands; then a net of glowing cracks that is exactly the 1 m zone for exactly 3 s, fizzing on the 0.4 s tick; then a black scar, safe.",
      timing: `Flight ${FLIGHT_M} m at ${SPIT.speedMps} m/s = ${FLIGHT_S.toFixed(2)} s; puddle ${LIVE_S} s, ${HIT_HP} HP per ${TICK_S} s inside, per body (zombies.json › spitter.spit, spit.ts › updateAcid). 20 Hz sim: the puddle is damage-eligible for 60 ticks.`,
      lengthS: AC_N_END,
      lanes: {
        light: [
          { t0: 0, t1: FLIGHT_S, label: "glob glow + its light on the street, tightening", nw: true },
          { t0: FLIGHT_S, t1: FLIGHT_S + 0.15, label: "skid flare", key: true, nw: true },
          { t0: FLIGHT_S + RUN_S, t1: FLIGHT_S + LIVE_S, label: "acid in the cracks = the zone, steady", nw: true },
          { t0: FLIGHT_S + LIVE_S, t1: FLIGHT_S + LIVE_S + 0.08, label: "out", key: true },
        ],
        core: [
          { t0: 0, t1: FLIGHT_S, label: "lump wobbling (0.2 s)", nw: true },
          { t0: FLIGHT_S, t1: FLIGHT_S + 0.08, label: "skid + ridge", key: true, nw: true },
          { t0: FLIGHT_S, t1: FLIGHT_S + RUN_S, label: "acid runs into the cracks", nw: true },
          { t0: FLIGHT_S + 0.4, t1: FLIGHT_S + 2.8, label: "skid drains into the cracks", nw: true },
          { t0: FLIGHT_S + 0.15, t1: FLIGHT_S + LIVE_S, label: "froth: swell + burst every 0.4 s", nw: true },
        ],
        smoke: [
          { t0: FLIGHT_S, t1: FLIGHT_S + 0.6, label: "vapour burst", nw: true },
          { t0: FLIGHT_S + 0.3, t1: FLIGHT_S + LIVE_S + 0.4, label: "vapour strands, downwind (may cross R)", nw: true },
        ],
        mark: [
          { t0: FLIGHT_S, t1: FLIGHT_S + LIVE_S, label: "wet sheet; binder chars along the cracks (1.2 s)", nw: true },
          { t0: FLIGHT_S + LIVE_S, t1: AC_N_END, label: "black crazed scar, fades", nw: true },
        ],
        game: [
          { t0: 0, t1: 0.05, label: "spit", key: true },
          { t0: FLIGHT_S, t1: FLIGHT_S + 0.05, label: "splash", key: true },
          { t0: FLIGHT_S, t1: FLIGHT_S + LIVE_S, label: `${HIT_HP} HP per ${TICK_S} s inside (per body)` },
        ],
      },
    },
  },
  async bake() {
    if (T.glob.length) return;
    T.glob = [0, 1, 2, 3].map(acnGlob);
    T.bloom = acnLight(32, 32, "150,235,50", 0.55, 1.8);
    T.under = acnLight(48, 48, "120,215,40", 0.75, 1.6);
    await idle();
    for (const s of SEEDS) {
      T.zone.push(acnZone(s));
      await idle();
      T.run.push(acnZone(s, 0.5));
      await idle();
      T.mark.push(acnMark(s));
      T.spots.push(craze(s).spots);
      await idle();
    }
    T.skid = [acnSkid(0), acnSkid(1)];
    T.skidGlow = acnLight(56, 32, "140,225,40", 0.5, 1.5);
    T.foam = [acnFoam(0, 2), acnFoam(1, 2), acnFoam(2, 2)];
    T.wisp = [acnWisp(1), acnWisp(4)];
    relitSurvivor("plain");
  },
  draw(g, t, st) {
    const px = st.pxm;
    const x0 = st.cx - 3.2 * px;
    const lx = x0 + FLIGHT_M * px;
    const ly = st.cy;
    const v = st.seed % 2;
    const age = t - FLIGHT_S;
    const live = age >= 0 && age < LIVE_S;

    // the mark, under everything: the binder chars along the cracks while the acid works, then the scar fades
    if (age >= 0 && on(st, "mark")) {
      const a = live ? 0.2 + 0.8 * ramp(age, 0.05, 1.2) : 1 - clamp01((age - LIVE_S) / MARK_FADE_S);
      sprite(g, T.mark[v] as HTMLCanvasElement, lx, ly, 2 * R, px, 0, a);
    }
    // the zone: wet sheet + acid in the cracks, running out to R at the glob's speed, steady, out at 3 s
    if (age >= 0 && on(st, "zone")) {
      const outA = live ? 1 : 1 - clamp01((age - LIVE_S) / 0.08);
      if (age < RUN_S * 0.55) sprite(g, T.run[v] as HTMLCanvasElement, lx, ly, 2 * R, px, 0, Math.min(1, age / 0.02 + 0.3));
      else if (outA > 0) sprite(g, T.zone[v] as HTMLCanvasElement, lx, ly, 2 * R, px, 0, age < RUN_S ? 0.85 + 0.15 * ramp(age, RUN_S * 0.55, RUN_S) : outA);
    }
    // the skid: lands squashed and spreads in 0.08 s, drains into the cracks (fresh → soaked), gone 0.25 s after 3 s
    if (age >= 0 && on(st, "skid")) {
      const endA = live ? 1 : 1 - clamp01((age - LIVE_S) / 0.25);
      if (endA > 0) {
        const sp = 0.7 + 0.3 * ramp(age, 0, 0.08);
        const soak = ramp(age, 0.4, 2.8);
        const sx = lx + (1 - sp) * IMPACT[0] * px;
        const wM = SKID_W_M * sp;
        const hM = SKID_H_M * (0.88 + 0.12 * sp);
        if (soak > 0) sprite(g, T.skid[1] as HTMLCanvasElement, sx, ly, wM, px, 0, endA * Math.min(1, soak * 1.6), false, hM);
        sprite(g, T.skid[0] as HTMLCanvasElement, sx, ly, wM, px, 0, endA * (1 - soak), false, hM);
        // its own light (ADD, cropped): flares at the hit (light first), then the thick bile's steady glow
        const flare = 1 - ramp(age, 0.02, 0.15);
        sprite(g, T.skidGlow!, sx + 0.05 * px, ly, 0.8 * (1 + 0.5 * flare), px, 0, endA * (0.35 * (1 - 0.5 * soak) + 0.65 * flare), true, 0.46 * (1 + 0.5 * flare));
      }
    }
    // froth at the crossings: each bead swells and bursts once per damage tick (0.4 s), on its own phase
    if (age >= 0.15 && age < LIVE_S + 0.12 && on(st, "foam")) {
      const spots = T.spots[v] as [number, number][];
      const n = Math.min(spots.length, st.low ? 3 : 6);
      for (let k = 0; k < n; k++) {
        const [fx, fy] = spots[k] as [number, number];
        const size = FOAM_M * (0.85 + 0.35 * hh(k, 2, v));
        if (!live) {
          sprite(g, T.foam[2] as HTMLCanvasElement, lx + fx * px, ly + fy * px, size * 1.1, px, k * 1.7, 0.7 * (1 - (age - LIVE_S) / 0.12));
          continue;
        }
        const ph = ((age - 0.15) / TICK_S + hh(k, 1, v)) % 1;
        const fr = ph < 0.4 ? 0 : ph < 0.82 ? 1 : 2;
        const a = (fr === 2 ? 1 - (ph - 0.82) / 0.18 : 0.6 + 0.4 * Math.min(1, ph / 0.4)) * ramp(age, 0.15, 0.3);
        sprite(g, T.foam[fr] as HTMLCanvasElement, lx + fx * px, ly + fy * px, size * (fr === 0 ? 0.8 + 0.5 * ph : 1), px, k * 1.7, a);
      }
    }
    // context: a survivor standing with their body just over the edge (the game's current relit picture)
    if (on(st, "context")) sprite(g, relitSurvivor("plain"), lx + SURV_AT[0] * px, ly + SURV_AT[1] * px, SURV_SIDE, px, Math.PI * 1.1, 1);
    // vapour: a burst at the hit, then strands off the skid and the crossings, leaning downwind (may cross R)
    if (age >= 0 && on(st, "vapour")) {
      const dieA = live ? 1 : 1 - clamp01((age - LIVE_S) / 0.4);
      if (age < 0.6)
        for (let j = 0; j < 2; j++) {
          const u = age / 0.6;
          const d = (0.15 + 0.55 * u) * (j === 0 ? 1 : 0.6);
          sprite(g, T.wisp[j] as HTMLCanvasElement, lx + (IMPACT[0] + 0.15 + WIND[0] * d) * px, ly + ((j - 0.5) * 0.22 + WIND[1] * d) * px, WISP_W_M * (0.7 + 0.8 * u), px, WIND_ROT + (j - 0.5) * 0.5, 0.55 * Math.sin(Math.PI * Math.min(1, u * 1.4 + 0.15)), false, WISP_H_M * (0.8 + 1.2 * u));
        }
      if (age > 0.3 && dieA > 0) {
        const n = st.low ? 2 : 3;
        const life = 1.3;
        const spots = T.spots[v] as [number, number][];
        for (let k = 0; k < n; k++) {
          const raw = (age - 0.3) / life - k / n;
          if (raw < 0) continue;
          const ph = raw % 1;
          const cyc = Math.floor(raw);
          const src = (k + cyc) % 2 === 0 ? [0.1, 0] : (spots[(k + cyc) % spots.length] as [number, number]);
          const d = ph * 0.75;
          sprite(g, T.wisp[(k + cyc) % 2] as HTMLCanvasElement, lx + ((src[0] as number) + WIND[0] * d + WISP_W_M * 0.3) * px, ly + ((src[1] as number) + WIND[1] * d) * px, WISP_W_M * (0.6 + 0.6 * ph), px, WIND_ROT + (hh(k, 5, cyc) - 0.5) * 0.4, dieA * 0.42 * Math.sin(Math.PI * ph), false, WISP_H_M * (0.7 + 0.9 * ph));
        }
      }
    }
    // in flight: the lump (wobbling) and its light on the street under it
    if (t < FLIGHT_S) {
      const f = clamp01(t / FLIGHT_S);
      const arc = 4 * f * (1 - f);
      const hgt = LIFT_M * arc;
      const x = x0 + f * FLIGHT_M * px;
      if (on(st, "globlight")) {
        const near = 1 - hgt / LIFT_M; // 1 at the ground
        sprite(g, T.under!, x, ly, 0.42 + 0.75 * (1 - near), px, 0, 0.25 + 0.55 * near * near, true);
      }
      if (on(st, "glob")) {
        const fr = Math.floor(t / 0.05) % 4;
        const s = 1 + 0.3 * arc;
        sprite(g, T.bloom!, x, ly - hgt * px, 0.62 * s, px, 0, 0.45, true);
        sprite(g, T.glob[fr] as HTMLCanvasElement, x, ly - hgt * px, GLOB_BOX_M * s, px, 0, 1);
      }
    }
  },
  textures: () => [
    ...T.glob.map((c, i) => tx(`acn_glob_${i}`, c, i === 0 ? "wobble frame, 40²" : undefined)),
    tx("acn_glob_bloom (ADD, 32²)", T.bloom),
    tx("acn_glob_light (ADD, 48²)", T.under, "on the street under the glob"),
    tx("acn_zone_a", T.zone[0], "wet sheet + acid in the cracks, cut at R, 144²"),
    tx("acn_zone_b", T.zone[1]),
    tx("acn_run_a", T.run[0], "the acid half-way out (0.06 s)"),
    tx("acn_run_b", T.run[1]),
    tx("acn_mark_a", T.mark[0], "charred crazed scar"),
    tx("acn_mark_b", T.mark[1]),
    tx("acn_skid_fresh", T.skid[0], "86×48"),
    tx("acn_skid_soaked", T.skid[1]),
    tx("acn_skid_glow (ADD, 56×32)", T.skidGlow),
    ...T.foam.map((c, i) => tx(`acn_froth_${["rising", "full", "burst"][i]}`, c, "19²")),
    ...T.wisp.map((c, i) => tx(`acn_vapour_${i}`, c, "64×24")),
  ],
  parts: [
    { id: "glob", label: "Glob (wobbling lump) + bloom" },
    { id: "globlight", label: "Glob's light on the street" },
    { id: "skid", label: "Skid + its glow" },
    { id: "zone", label: "Acid in the cracks + wet sheet (the zone)" },
    { id: "foam", label: "Froth at the crossings" },
    { id: "vapour", label: "Vapour" },
    { id: "mark", label: "Charred net (mark)" },
    { id: "context", label: "Context: survivor at the edge" },
  ],
  frames: [
    { label: "flight", t: FLIGHT_S * 0.5, when: "top of the lob: light wide and dim" },
    { label: "landing", t: FLIGHT_S * 0.92, when: "light tight and bright under the glob" },
    { label: "run", t: FLIGHT_S + 0.04, when: "acid half-way out along the cracks, skid flare" },
    { label: "lying", t: FLIGHT_S + 1.5, when: "steady zone; froth on the tick; skid half drained" },
    { label: "last", t: FLIGHT_S + 2.95, when: "still full: it still hurts" },
    { label: "over", t: FLIGHT_S + 3.15, when: "light out: the charred net only" },
  ],
};
export { ACN_R };
