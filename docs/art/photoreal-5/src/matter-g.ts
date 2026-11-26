/**
 * Group 5, family "matter": the goal-first takes (`${card}-G`, dead-city-model fx.md › FX 4, designer 2026-11-26:
 * "picking a goal … then think of elements needed, and then how they compose with each other to attend the goal").
 * Each Look's `goalFirst` was written BEFORE its drawing; the drawing follows it. The A / B takes stay as they were.
 *
 * Numbers from the game: zombies.json (spitter.spit, bloater.explodes), events.json (gasLeak, supplyDrop, stampede),
 * decay.json › ruins, boss.json › slam, render/bossDust.ts › BOSS_DUST (Story 9.15), the views named on each card.
 *
 * Shared choices across the seven:
 * - one wind for every drifting matter: the fire's (fireParticles.ts › WIND_X / WIND_Y, down-right), so smoke, dust
 *   and vapour on one street agree;
 * - lit matter is never rotated (its baked light would turn with it); it stretches along its motion instead;
 * - a zone's colour goes out exactly when the sim's effect ends; what stays after is a dark, matte mark;
 * - no fake damage clock: acid and gas act per body (spit.ts › acidTicks, bloater.ts › the 3.9 slow), so nothing in
 *   the zone pulses as if it ticked for everyone.
 */
import { make, sprite, ramp, clamp01, idle, type Look, type Stage } from "./kit";
import { litPuff, tinted, silhouette, gritChip, ashFlake, glowTex, acidGlob, wetHighlight, acidBubble, wetPatch, flareStick } from "./matter-tex";
import { acidSplat, acidEtch, acidZoneGlow, acidEdge, gasLayer, vapourJet, gasTank, contactShadow, rainShort, rainHit } from "./matter-g-tex";
import { WIND_X, WIND_Y } from "../../../../apps/client/src/render/city/fireParticles";
import { BOSS_DUST, dustHash } from "../../../../apps/client/src/render/bossDust";
import { EVENT_SMOKE_RGB } from "../../../../apps/client/src/render/city/eventArt";

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
/** Context the game already draws (markers, rings): thin strokes, not counted as this take's sprites. */
function ctxStroke(g: CanvasRenderingContext2D, col: string, w: number, f: () => void, dash: number[] = []): void {
  g.save();
  g.strokeStyle = col;
  g.lineWidth = w;
  g.setLineDash(dash);
  g.beginPath();
  f();
  g.stroke();
  g.restore();
}

/* =====================================================================================================
 * AC-G: the Spitter's acid.
 * ===================================================================================================== */
const AC_FLIGHT_M = 5;
const AC_FLIGHT_S = AC_FLIGHT_M / 9; // spit.speedMps 9
const AC_S = 3; // spit.puddleS
const AC_R = 1; // spit.puddleRadiusM
const AC_LIFT = 0.35; // AcidView's cosmetic lob
export const AC_G_END = AC_FLIGHT_S + AC_S + 0.6;
const acT: { glob?: HTMLCanvasElement; hi?: HTMLCanvasElement; glow?: HTMLCanvasElement; shSharp?: HTMLCanvasElement; shSoft?: HTMLCanvasElement; splat: HTMLCanvasElement[]; etch: HTMLCanvasElement[]; zone?: HTMLCanvasElement; edge?: HTMLCanvasElement; bub: HTMLCanvasElement[]; drop?: HTMLCanvasElement; fume?: HTMLCanvasElement } = { splat: [], etch: [], bub: [] };
export const acG: Look = {
  code: "AC-G",
  title: "The splat is the acid, the light is the zone",
  note: "Rethought from the goal. In flight the glob is the brightest thing on screen and its shadow on the street closes in on it as it comes down, so you see where and when it lands. It lands as a splat thrown forward (not a disc), kept inside the circle. The circle is the acid's light on the asphalt, ending exactly at 1 m, with a thin steady edge line. The colour goes out exactly at 3 s, when the damage stops; only a dark etched mark is left. Closest to AC-A in the glob and the bubbles; the goal changed the pool's shape, the zone's source and the ending.",
  goalFirst: {
    goal: "(1) A glob is coming at you: dodge it (15 damage on a hit, 9 m/s, up to 6 m). (2) Where it lands, a 1 m circle hurts for exactly 3 s: 2 HP for every 0.4 s your body spends touching it (5/s, zombies.json › spitter.spit), then it is safe.",
    elements: [
      { name: "Glob", job: "read 1: the threat in flight. The brightest thing on screen, viscous, with the street light upper-left on it." },
      { name: "Glob's shadow", job: "read 1: where and when it lands. It runs on the street under the glob's path and closes in on the glob (sharper, darker, smaller) as the glob comes down; they meet at the landing spot." },
      { name: "Splat (the liquid)", job: "read 2: this is acid, and it came from that glob. A splash thrown forward along the flight, with fingers and drops ahead, never round, always inside the 1 m circle." },
      { name: "The acid's light on the ground (ADD)", job: "read 2: the zone. Acid glows (yellow-green), and a light pool really is round: an even, faint floor that ends exactly at R." },
      { name: "Edge line (ADD)", job: "read 2: the exact edge. Thin, steady; its outer edge is R, where your body starts to count as inside." },
      { name: "Bubbles", job: "read 2: still active. Slow, out of step with each other, inside the liquid only." },
      { name: "Fumes", job: "read 2 from the side of the eye: alive and nasty. Thin, grey-green, not glowing; they may drift over the edge (they don't hurt)." },
      { name: "Etched mark", job: "after 3 s: it's over, the street keeps the scar. Dark, matte, no green." },
      { name: "Cut: splash drops outside the liquid", job: "AC-A threw drops up to 0.95 m out with sprites crossing the edge: bright acid outside the circle would lie about the zone." },
      { name: "Cut: a damage pulse on the ring", job: "the acid clock is per body (spit.ts › acidTicks, kept while outside): a puddle-wide pulse would show ticks that are nobody's." },
    ],
    composition: [
      "The liquid, the bubbles and anything bright stay inside the 1 m circle; only the dull fumes may cross it. The circle comes from the light, never from the liquid's shape.",
      "Brightness: glob in flight > edge line > the liquid's lit meniscus > the ground light > fumes > the mark.",
      "One clock: the game's. The zone (light + edge) is on from the splash's first frame at full strength and stays steady for 3 s; it goes out in 0.08 s at 3 s. No fade while it still hurts (AC-A faded over the last 0.6 s: a dangerous zone that looked like it was going).",
      "Matter follows its cause: the liquid spreads 0.12 s after the hit, the etch darkens over the first second (the acid eats in), the fumes start at 0.2 s.",
      "The street light's reflection on the liquid is its own unrotated sprite: the splat turns with the flight, the reflection stays upper-left.",
    ],
    plan: {
      goal: "See it coming and where it lands; then the exact 1 m circle for exactly 3 s; then safe.",
      timing: "Flight 5 m at 9 m/s = 0.56 s; puddle 3 s, 5 dmg/s per body in 0.4 s steps (zombies.json › spitter.spit, spit.ts).",
      lengthS: AC_G_END,
      lanes: {
        light: [
          { t0: 0, t1: AC_FLIGHT_S, label: "glob glow" },
          { t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + AC_S, label: "ground light = the zone, steady", nw: true },
          { t0: AC_FLIGHT_S + AC_S, t1: AC_FLIGHT_S + AC_S + 0.08, label: "off", key: true, nw: true },
        ],
        core: [
          { t0: 0, t1: AC_FLIGHT_S, label: "glob + shadow closing in", nw: true },
          { t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + 0.12, label: "splat forward", key: true, nw: true },
          { t0: AC_FLIGHT_S + 0.12, t1: AC_FLIGHT_S + AC_S, label: "liquid + bubbles + edge line", nw: true },
          { t0: AC_FLIGHT_S + AC_S, t1: AC_FLIGHT_S + AC_S + 0.25, label: "liquid sinks in", nw: true },
        ],
        smoke: [{ t0: AC_FLIGHT_S + 0.2, t1: AC_FLIGHT_S + AC_S, label: "fumes (may cross the edge)", nw: true }],
        mark: [
          { t0: AC_FLIGHT_S, t1: AC_FLIGHT_S + 1, label: "etch darkens" },
          { t0: AC_FLIGHT_S + 1, t1: AC_FLIGHT_S + AC_S, label: "etch under the liquid" },
          { t0: AC_FLIGHT_S + AC_S, t1: AC_G_END, label: "etch alone, fades", nw: true },
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
    acT.glob = acidGlob();
    acT.hi = wetHighlight();
    acT.glow = glowTex(40, "170,255,70", 0.85, 0.28);
    acT.shSharp = silhouette(acT.glob, "rgba(0,0,0,0.7)", 1);
    acT.shSoft = silhouette(acT.glob, "rgba(0,0,0,0.5)", 5);
    await idle();
    acT.splat = [acidSplat(144, 3), acidSplat(144, 8)];
    acT.etch = [acidEtch(144, 3), acidEtch(144, 8)];
    await idle();
    acT.zone = acidZoneGlow(144);
    acT.edge = acidEdge(192);
    acT.bub = [0, 1, 2].map((f) => acidBubble(f, true));
    acT.fume = tinted(litPuff(48, 33, { rag: 0.7, scale: 2.6, alpha: 0.5 }), [170, 180, 150]);
  },
  draw(g, t, st) {
    const px = st.pxm;
    const x0 = st.cx - 3.2 * px;
    const lx = x0 + AC_FLIGHT_M * px;
    const ly = st.cy;
    const rot = 0; // the flight direction (here +x); the splat turns with it, the reflection doesn't
    if (t < AC_FLIGHT_S) {
      const f = clamp01(t / AC_FLIGHT_S);
      const arc = 4 * f * (1 - f);
      const hgt = AC_LIFT * arc;
      const x = x0 + f * AC_FLIGHT_M * px;
      const s = 0.45 * (1 + 0.7 * arc) * 1.25;
      if (on(st, "shadow")) {
        // the shadow on the street, away from the light (down-right) by the glob's height; soft high, sharp low
        const sx = x + 0.6 * hgt * 1.6 * px;
        const sy = ly + 0.8 * hgt * 1.6 * px;
        const lo = 1 - arc;
        sprite(g, acT.shSoft!, sx, sy, s * 1.2, px, rot, 0.45 * arc);
        sprite(g, acT.shSharp!, sx, sy, s * 0.95, px, rot, 0.7 * lo);
      }
      const y = ly - hgt * px;
      if (on(st, "glob")) {
        sprite(g, acT.glow!, x, y, 0.75, px, 0, 0.55, true);
        sprite(g, acT.glob!, x - 0.08 * px, y, s, px, rot);
        sprite(g, acT.hi!, x, y - 0.05 * px, 0.11, px, 0, 0.9);
      }
      return;
    }
    const age = t - AC_FLIGHT_S;
    const v = st.seed % 2;
    const live = age < AC_S;
    // the mark: eats in over the first second; alone after 3 s, fading over 0.6 s
    if (on(st, "mark")) {
      const a = age < AC_S ? 0.35 + 0.65 * ramp(age, 0, 1) : 1 - clamp01((age - AC_S) / 0.6);
      sprite(g, acT.etch[v] as HTMLCanvasElement, lx, ly, 2 * AC_R, px, rot, a);
    }
    // the zone: the acid's light, then the edge line; full from the first frame, off at 3 s
    const zoneA = live ? Math.min(1, age / 0.04) : 1 - clamp01((age - AC_S) / 0.08);
    if (on(st, "zone")) sprite(g, acT.zone!, lx, ly, 2 * AC_R, px, 0, 0.42 * zoneA, true);
    // the liquid: spreads forward in 0.12 s; sinks into the street in 0.25 s after 3 s
    const liqA = live ? 1 : 1 - clamp01((age - AC_S) / 0.25);
    if (on(st, "splat") && liqA > 0) {
      const sp = 0.55 + 0.45 * ramp(age, 0, 0.12);
      sprite(g, acT.splat[v] as HTMLCanvasElement, lx + (1 - sp) * 0.3 * px, ly, 2 * AC_R * sp, px, rot, liqA);
      sprite(g, acT.hi!, lx - 0.12 * px, ly - 0.12 * px, 0.26, px, 0, 0.55 * liqA * ramp(age, 0.05, 0.15));
    }
    if (on(st, "edge")) sprite(g, acT.edge!, lx, ly, 2 * AC_R, px, 0, 0.85 * zoneA, true);
    if (on(st, "bubbles") && live) {
      const nb = st.low ? 2 : 3;
      for (let k = 0; k < nb; k++) {
        const per = 0.8 + hh(k, 8) * 0.5;
        const ph = (age / per + hh(k, 3)) % 1;
        const fr = ph < 0.45 ? 0 : ph < 0.85 ? 1 : 2;
        const ang = hh(k, 4) * Math.PI * 2;
        const d = 0.08 + 0.3 * hh(k, 5);
        sprite(g, acT.bub[fr] as HTMLCanvasElement, lx + (0.1 + Math.cos(ang) * d) * px, ly + Math.sin(ang) * d * px, 0.16, px, 0, (fr === 2 ? 1 - (ph - 0.85) / 0.15 : 0.9) * ramp(age, 0.15, 0.3));
      }
    }
    if (on(st, "fumes") && live && age > 0.2) {
      const nw = st.low ? 2 : 3;
      for (let k = 0; k < nw; k++) {
        const ph = (age * 0.5 + k / nw) % 1;
        const fx = lx + ((hh(k, 6) - 0.5) * 0.8 + WIND[0] * ph * 0.5) * px;
        const fy = ly + ((hh(k, 7) - 0.5) * 0.6 + WIND[1] * ph * 0.5 - ph * 0.35) * px;
        sprite(g, acT.fume!, fx, fy, 0.45 + 0.45 * ph, px, 0, 0.3 * Math.sin(Math.PI * ph) * ramp(age, 0.2, 0.5));
      }
    }
  },
  textures: () => [
    tx("acid_glob (shared with A)", acT.glob),
    tx("glob_shadow_sharp", acT.shSharp, "low: sharp"),
    tx("glob_shadow_soft", acT.shSoft, "high: soft"),
    tx("glob_glow (ADD, 40²)", acT.glow),
    tx("wet_highlight (shared)", acT.hi, "unrotated"),
    tx("acid_splat_a", acT.splat[0], "faces the flight"),
    tx("acid_splat_b", acT.splat[1]),
    tx("acid_etch_a", acT.etch[0], "the mark"),
    tx("acid_etch_b", acT.etch[1]),
    tx("acid_zone_light (ADD)", acT.zone, "ends at R"),
    tx("acid_edge (ADD)", acT.edge, "outer edge = R"),
    ...acT.bub.map((b, i) => tx(`acid_bubble_${i} (shared)`, b)),
    tx("acid_fume (shared puff)", acT.fume),
  ],
  parts: [
    { id: "glob", label: "Glob + glow + highlight" },
    { id: "shadow", label: "Glob's shadow" },
    { id: "splat", label: "Splat (liquid) + reflection" },
    { id: "zone", label: "Ground light (the zone)" },
    { id: "edge", label: "Edge line" },
    { id: "bubbles", label: "Bubbles" },
    { id: "fumes", label: "Fumes" },
    { id: "mark", label: "Etched mark" },
  ],
  frames: [
    { label: "flight", t: AC_FLIGHT_S * 0.5, when: "top of the lob (shadow soft, far)" },
    { label: "landing", t: AC_FLIGHT_S * 0.9, when: "shadow meets the glob" },
    { label: "splat", t: AC_FLIGHT_S + 0.06, when: "zone on at full strength" },
    { label: "lying", t: AC_FLIGHT_S + 1.5, when: "steady" },
    { label: "last", t: AC_FLIGHT_S + 2.95, when: "still full: it still hurts" },
    { label: "over", t: AC_FLIGHT_S + 3.15, when: "zone off, mark only" },
  ],
};

/* =====================================================================================================
 * GA-G: the Bloater's gas.
 * ===================================================================================================== */
const GAS_R = 2.5; // bloater.explodes.gasRadiusM
const GAS_S = 4; // gasS
export const GA_G_END = GAS_S + 0.5;
const gaT: { inner: HTMLCanvasElement[]; front: HTMLCanvasElement[]; wisp?: HTMLCanvasElement } = { inner: [], front: [] };
export const gaG: Look = {
  code: "GA-G",
  title: "The gas front is the edge",
  note: "Rethought from the goal. Heavy gas spreads on the street like a spill: thin over the middle (you still see who is in it) and piled up at its front, a rolling rim whose outside face is exactly the 2.5 m slow edge. The rim is the edge, so no ring is drawn and no wisp crosses it. It is there at full size from the burst (the slow starts at once), holds, thins from the middle in the last 0.4 s, and its front breaks up exactly at 4 s, when the slow ends.",
  goalFirst: {
    goal: "Inside this 2.5 m circle you are slowed 30 % (your body touching it counts, plus 0.25 s after you leave) for exactly 4 s. It does not hurt (zombies.json › bloater.explodes).",
    elements: [
      { name: "Gas front (the rolling rim)", job: "the edge. Heavy gas piles up at its front; the rim's outside face ends at R. Real gas has a front, so the circle comes from the gas itself, not from a drawn line." },
      { name: "Thin layer inside", job: "it's gas, and it's everywhere inside. Thin enough that players and zombies in it stay readable." },
      { name: "Light on the rolls (upper left)", job: "it's heavy matter lying on the street, not light: the rim's rolls are lit on their faces toward the key light and shadowed down-right." },
      { name: "Break-up wisps", job: "the end: at 4 s the front comes apart and drifts out. Only after the slow has ended, so a wisp outside the edge never lies." },
      { name: "Cut: the stroked edge ring", job: "the front does its job (question for the designer: keep a faint ring for the blackout ghost?)." },
      { name: "Cut: rim wisps during the life", job: "GA-A's wisps sat at 0.82–0.92 R and were 1.1 m wide: they spilled about 0.3 m past the edge, so the cloud looked bigger than the slow zone." },
      { name: "Cut: glow", job: "gas is not light; yellow-green alone carries 'gas'." },
    ],
    composition: [
      "The front's outside face is at R and nothing of the gas passes it while it slows you (the textures end within 1.5 % of R). Rotation of the layers is radial, so the edge never moves.",
      "Brightness: the rim's lit faces > the rim's shadowed faces > the thin inside. The inside stays below the street's own contrast so bodies in it read.",
      "One clock, the game's: full size at the first frame (the rim fades in over 0.1 s); hold; the inside thins over 3.6–4.0 s while the rim stays full; the rim breaks at 4.0 s and is gone by 4.2 s. GA-A / today fade over the last second, which made a working slow zone look like it was over.",
      "Only after 4 s may anything of the gas cross the edge (the break-up wisps).",
    ],
    plan: {
      goal: "The exact edge of the slow zone, from the burst to the end, and an end you can trust.",
      timing: "gasS 4.0, slow 30 % per tick inside, lingering 0.25 s (zombies.json, bloater.ts); radius 2.5 m.",
      lengthS: GA_G_END,
      lanes: {
        core: [
          { t0: 0, t1: 0.1, label: "front at R", key: true, nw: true },
          { t0: 0.1, t1: 4, label: "rolling rim, layers turning (today's speeds)", nw: true },
          { t0: 4, t1: 4.2, label: "rim breaks", key: true, nw: true },
        ],
        smoke: [
          { t0: 0, t1: 0.4, label: "inside fills", nw: true },
          { t0: 0.4, t1: 3.6, label: "thin layer inside" },
          { t0: 3.6, t1: 4, label: "inside thins first", nw: true },
          { t0: 4, t1: 4.5, label: "wisps drift out", nw: true },
        ],
        game: [
          { t0: 0, t1: 0.05, label: "burst (BX)", key: true },
          { t0: 0, t1: 4, label: "30 % slow inside" },
        ],
      },
    },
  },
  async bake() {
    gaT.inner = [gasLayer(192, 5, false)];
    await idle();
    gaT.front = [gasLayer(256, 7, true)];
    await idle();
    gaT.wisp = litPuff(64, 17, { rag: 0.4, scale: 1.8, alpha: 0.75, rgb: [0.78, 0.84, 0.44], shade: 2 });
  },
  draw(g, t, st) {
    if (t >= GA_G_END) return;
    const px = st.pxm;
    const live = t < GAS_S;
    if (on(st, "inner") && live) {
      const a = ramp(t, 0, 0.4) * (1 - ramp(t, 3.6, 4.0));
      sprite(g, gaT.inner[0] as HTMLCanvasElement, st.cx, st.cy, 2 * GAS_R, px, 1.7 + t * 0.05, 0.95 * a);
      sprite(g, gaT.inner[0] as HTMLCanvasElement, st.cx, st.cy, 2 * GAS_R, px, 4.1 - t * 0.08, 0.65 * a); // the same layer again, turned the other way
    }
    if (on(st, "front")) {
      const a = Math.min(1, t / 0.1) * (live ? 1 : 1 - clamp01((t - GAS_S) / 0.2));
      // the two rims turn against each other; the front texture's lit side is baked, so the turn is slow (≤ 0.2 rad
      // over the 4 s) and the light on the rolls stays upper-left
      sprite(g, gaT.front[0] as HTMLCanvasElement, st.cx, st.cy, 2 * GAS_R, px, t * 0.05, 0.85 * a);
      sprite(g, gaT.front[0] as HTMLCanvasElement, st.cx, st.cy, 2 * GAS_R, px, 2.4 - t * 0.04, 0.6 * a); // the same rim, turned: the rolls double up unevenly
    }
    if (on(st, "wisps") && !live) {
      const u = (t - GAS_S) / 0.5;
      const n = st.low ? 4 : 8;
      for (let k = 0; k < n; k++) {
        const ang = (k / n) * Math.PI * 2 + hh(k, 1) * 0.6;
        const r = GAS_R * (0.92 + 0.25 * u);
        sprite(g, gaT.wisp!, st.cx + Math.cos(ang) * r * px + WIND[0] * u * 0.3 * px, st.cy + Math.sin(ang) * r * px + WIND[1] * u * 0.3 * px, 0.8 + 0.6 * u, px, 0, 0.5 * (1 - u));
      }
    }
  },
  textures: () => [tx("gas_inner", gaT.inner[0], "thin, drawn twice"), tx("gas_front", gaT.front[0], "outside face = R, drawn twice"), tx("gas_wisp (break-up)", gaT.wisp)],
  parts: [
    { id: "front", label: "Gas front (the edge)" },
    { id: "inner", label: "Thin layer inside" },
    { id: "wisps", label: "Break-up wisps (after 4 s)" },
  ],
  frames: [
    { label: "burst", t: 0.08, when: "front already at R" },
    { label: "full", t: 1.5, when: "steady" },
    { label: "last", t: 3.9, when: "inside thinned, edge full" },
    { label: "over", t: 4.15, when: "slow ended: front breaks" },
  ],
};

/* =====================================================================================================
 * EV-G: the events' matter (three panels: gas leak, supply flare, stampede).
 * ===================================================================================================== */
const EV_L = 4;
const SMOKE_RGB = EVENT_SMOKE_RGB.split(",").map(Number) as [number, number, number];
const evT: { jet?: HTMLCanvasElement; vap: HTMLCanvasElement[]; tank?: HTMLCanvasElement; flare?: HTMLCanvasElement; pool?: HTMLCanvasElement; head?: HTMLCanvasElement; smoke: HTMLCanvasElement[]; dust: HTMLCanvasElement[]; grit?: HTMLCanvasElement } = { vap: [], smoke: [], dust: [] };
/** The game's marker clock (EventPickupsView: the gas ring's alpha 0.55 + 0.3 sin(8 t)). */
const ringClock = (t: number): number => 0.5 + 0.5 * Math.sin(t * 8);
function emitter(t: number, L: number, rate: number, cap: number, lifeMax: number, f: (k: number, age: number, t0: number) => void): void {
  const n = Math.round(rate * L);
  let live = 0;
  for (let k = 0; k < n && live < cap; k++) {
    const t0 = k / rate;
    let age = t - t0;
    if (age < 0) age += L;
    if (age > lifeMax) continue;
    live++;
    f(k, age, t0);
  }
}
function panel(g: CanvasRenderingContext2D, st: Stage, x0M: number, x1M: number, f: () => void): void {
  g.save();
  g.beginPath();
  g.rect(st.cx + x0M * st.pxm, 0, (x1M - x0M) * st.pxm, st.h);
  g.clip();
  f();
  g.restore();
}
export const evG: Look = {
  code: "EV-G",
  title: "Each plume points at its event",
  note: "Rethought from the goal, one read per event. Gas leak: a hard jet from the tank's fill cap, spurting on the warning ring's own beat, that slows into low vapour hanging near the tank (it never reaches the 6 m ring, which stays the zone). Supply drop: a pool of green light on the landing spot and a dense signal column you can find from across the map. Stampede: a low wall of dust across the lane's start edge, pushed along the run, growing over the 3 s warning as the herd gets closer. All three drift with the street's one wind. Panels are clipped for the page.",
  goalFirst: {
    goal: "From across the map: (1) gas leak: that tank will blow in 10 s, get out of its 6 m ring (60 damage); (2) supply drop: the crate lands right here in 5 s (stand within 0.8 m for 1 s to take it); (3) stampede: in 3 s they come from this edge, along this 8 m lane (8 damage on contact) (events.json).",
    elements: [
      { name: "Leak jet", job: "read 1: the tank is under pressure, here. A narrow fast jet from the fill cap, spurting on the ring's beat (one clock with the game's marker)." },
      { name: "Hanging vapour", job: "read 1: gas, near the tank. It slows after the jet and hangs low within ~2.5 m, drifting downwind; it never draws an edge (the game's dashed 6 m ring and countdown arc do)." },
      { name: "Tank", job: "read 1: the cause. Context: the game's tank frame (drawn here as a stand-in, unchanged in the game)." },
      { name: "Flare light pool (ADD)", job: "read 2: HERE. A light pool really is round and centred: it lights the 0.8 m take spot." },
      { name: "Flare stick", job: "read 2: the cause of the light and smoke (light: a white-hot green head)." },
      { name: "Signal column", job: "read 2 from far: a dense, tight column above the flare that then bends downwind: a pointer, readable off-screen edge." },
      { name: "Dust wall", job: "read 3: from this edge. Low, wide puffs across the whole lane width at its start edge, stretched along the run." },
      { name: "Growing density", job: "read 3: in 3 s. The dust thickens over the 3 s warning (35 % → 100 %) as the herd gets closer." },
      { name: "Ground hops (grit)", job: "read 3: the weight coming. Chips at the start edge hop, faster as the warning runs out." },
      { name: "Cut: vapour sprayed up to 3 m", job: "today's and A's puffs flew 0.6–1.6 m/s for 2.6 s: a cloud reaching 3–4 m from the tank, half-way to the 6 m ring, read as a smaller zone." },
    ],
    composition: [
      "Each plume starts at its event's exact point (cap, flare head, lane edge) and points away along one wind (the fire's, down-right): one street, one wind. Today the flare smoke drifts up-right while fire smoke drifts down-right.",
      "Brightness: the game's markers (dashed ring, countdown arc, amber chevrons, pin) > the flare head > its light pool > the signal column > vapour > dust. The matter never outshines a marker.",
      "Vapour stays within 2.5 m of the tank; the dust stays within the lane's width; the column may leave the screen (that is its job).",
      "Clocks: the jet spurts on the gas ring's beat (sin 8 t); the dust and hops build over the stampede's 3 s warning; the flare flickers on its own (it is a fire).",
      "Colours keep their meanings: yellow-green vapour = gas, the approved mid-green signal smoke (70,190,90) stays distinct from it, warm grey-brown dust; amber only in the game's chevrons.",
    ],
    plan: {
      goal: "Three pointers: this tank, this spot, this edge.",
      timing: "Gas leak hiss 10 s (marker beat sin 8 t); flare 5 s; stampede warning 3 s then the run (events.json); emitter rates as today (22 / 16 / 24 per s, caps 48 / 48 / 64).",
      lengthS: EV_L,
      lanes: {
        light: [{ t0: 0, t1: EV_L, label: "flare head + green pool on the spot (flicker)", nw: true }],
        core: [{ t0: 0, t1: EV_L, label: "leak jet: spurts on the ring's beat", nw: true }],
        smoke: [
          { t0: 0, t1: EV_L, label: "vapour: hangs near the tank, downwind", nw: true },
          { t0: 0, t1: EV_L, label: "signal column: tight, then bends downwind", nw: true },
        ],
        matter: [
          { t0: 0, t1: 3, label: "dust wall builds 35 → 100 %", nw: true },
          { t0: 3, t1: EV_L, label: "run starts (dust full)", key: true },
          { t0: 0, t1: 3, label: "ground hops, faster", nw: true },
        ],
        game: [{ t0: 0, t1: EV_L, label: "markers: dashed ring + arc, pin, chevrons (unchanged)" }],
      },
    },
  },
  async bake() {
    evT.jet = vapourJet();
    evT.vap = [1, 2].map((s) => litPuff(64, 40 + s, { rag: 0.5, scale: 2.4, alpha: 0.7, rgb: [0.86, 0.9, 0.5], shade: 1.4 }));
    evT.tank = gasTank();
    await idle();
    evT.flare = flareStick();
    evT.pool = glowTex(64, "110,240,130", 0.75, 0.3);
    evT.head = glowTex(32, "210,255,210", 1, 0.4);
    const sm: [number, number, number] = [SMOKE_RGB[0] / 255 + 0.12, SMOKE_RGB[1] / 255, SMOKE_RGB[2] / 255 + 0.08];
    evT.smoke = [1, 2, 3].map((s) => litPuff(72, 50 + s, { rag: 0.55, scale: 2.3, alpha: 0.9, rgb: sm, shade: 2.0 }));
    await idle();
    evT.dust = [1, 2, 3].map((s) => litPuff(64, 60 + s, { rag: 0.5, scale: 2.6, alpha: 0.75, rgb: [0.72, 0.63, 0.52], shade: 1.6 }));
    evT.grit = tinted(gritChip(7), [170, 148, 120]);
  },
  draw(g, t, st) {
    const px = st.pxm;
    const k2 = st.low ? 0.5 : 1;
    // ---- panel 1: gas leak (tank at -4.2, 0.4)
    panel(g, st, -6, -1.9, () => {
      const tX = st.cx - 3.3 * px;
      const tY = st.cy + 0.6 * px;
      if (st.only === null) {
        g.drawImage(evT.tank!, tX - px, tY - 0.5 * px, 2 * px, px);
        ctxStroke(g, "rgba(223,232,120,0.9)", Math.max(1, 0.1 * px), () => g.arc(tX, tY, 1.3 * px, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * 0.62));
      }
      const capX = tX - 0.85 * px;
      const capY = tY - 0.05 * px;
      const jetAng = -Math.PI * 0.72; // up-left, as the game's spray
      const beat = ringClock(t);
      if (on(st, "vapour"))
        emitter(t, EV_L, 22 * k2, 48, 2.64, (k, age) => {
          const life = 2.2 * (0.7 + hh(k, 1) * 0.5);
          if (age >= life) return;
          const u = age / life;
          // born at the jet's end, already slow; hangs low, drifts downwind, spreads
          const a0 = jetAng + (hh(k, 2) - 0.5) * 0.5;
          const birth = 0.9 + hh(k, 3) * 0.5;
          const drift = 0.12 * age + 0.25 * (1 - Math.pow(1 - u, 2));
          const x = capX + (Math.cos(a0) * birth + WIND[0] * drift + (hh(k, 4) - 0.5) * 0.4 * u) * px;
          const y = capY + (Math.sin(a0) * birth + WIND[1] * drift + (hh(k, 5) - 0.5) * 0.4 * u) * px;
          sprite(g, evT.vap[k % 2] as HTMLCanvasElement, x, y, 0.8 + 1.0 * u, px, 0, 0.55 * (1 - u) * Math.min(1, u * 6));
        });
      if (on(st, "jet")) sprite(g, evT.jet!, capX + Math.cos(jetAng) * 0.62 * px, capY + Math.sin(jetAng) * 0.62 * px, 1.25 * (0.85 + 0.15 * beat), px, jetAng, 0.6 + 0.35 * beat, false, 0.5);
    });
    // ---- panel 2: supply flare (flare at 0, 0.7; the crate's spot 0.64 m up-left of it, as the game: flare at a + (0.5, 0.4))
    panel(g, st, -1.9, 2.9, () => {
      const fX = st.cx - 0.9 * px;
      const fY = st.cy + 1.4 * px;
      const sX = fX - 0.5 * px;
      const sY = fY - 0.4 * px;
      const fl = 0.85 + 0.15 * Math.sin(t * 23) * Math.sin(t * 7.3);
      if (st.only === null) ctxStroke(g, "rgba(240,240,240,0.35)", 1, () => g.arc(sX, sY, 0.8 * px, 0, Math.PI * 2), [3, 3]);
      if (on(st, "pool")) sprite(g, evT.pool!, (sX + fX) / 2, (sY + fY) / 2, 2.6, px, 0, 0.32 * fl, true);
      if (on(st, "flare")) {
        sprite(g, evT.flare!, fX, fY, 0.6, px, -0.35, 1);
        sprite(g, evT.head!, fX + 0.24 * px, fY - 0.09 * px, 0.32, px, 0, 0.85 * fl, true);
      }
      if (on(st, "column"))
        emitter(t, EV_L, 16 * k2, 48, 3.6, (k, age) => {
          const life = 3 * (0.7 + hh(k, 7) * 0.5);
          if (age >= life) return;
          const u = age / life;
          // tight for the first 0.6 s (it rises: top-down = it stays put and grows little), then bends downwind
          const rise = Math.min(1, age / 0.6);
          const along = Math.max(0, age - 0.5) * 0.4;
          const x = fX + 0.28 * px + (WIND[0] * along + (hh(k, 8) - 0.5) * 0.12 * rise) * px;
          const y = fY - 0.1 * px + (WIND[1] * along - 0.35 * rise + (hh(k, 9) - 0.5) * 0.12 * rise) * px;
          const s = 0.3 + 0.3 * rise + 1.1 * u;
          sprite(g, evT.smoke[k % 3] as HTMLCanvasElement, x, y, s, px, 0, 0.85 * (1 - u) * Math.min(1, u * 12));
        });
    });
    // ---- panel 3: stampede (lane's start edge at x = 2.2, running +x across the whole panel height)
    panel(g, st, 2.9, 6.5, () => {
      const eX = st.cx + 3.1 * px;
      const warn = clamp01(t / 3);
      if (st.only === null) {
        // the game's amber chevrons (context, unchanged): rows of 3 drifting along the lane
        for (let row = 0; row < 3; row++)
          for (let col = 0; col < 3; col++) {
            const along = ((row * 1.1 + t * 1.2) % 3.3) + 0.3;
            const cx = eX + along * px;
            const cy = st.cy + (col - 1) * 1.9 * px;
            ctxStroke(g, "rgba(240,170,60,0.8)", Math.max(1, 0.08 * px), () => {
              g.moveTo(cx - 0.22 * px, cy - 0.3 * px);
              g.lineTo(cx + 0.12 * px, cy);
              g.lineTo(cx - 0.22 * px, cy + 0.3 * px);
            });
          }
      }
      if (on(st, "dust"))
        emitter(t, EV_L, 24 * k2, 64, 1.6, (k, age, t0) => {
          // the wall thickens over the warning: an emission is kept with the density at its birth
          if (t0 > t) return; // a new warning starts clean (no dust left from the last loop)
          if (hh(k, 20) > 0.35 + 0.65 * clamp01(t0 / 3)) return;
          const u = age / 1.6;
          const lat = (hh(k, 12) - 0.5) * 6.4;
          const at = hh(k, 13) * 0.8;
          const vx = 0.4 + hh(k, 14) * 0.8;
          const x = eX + (at + vx * age + WIND[0] * 0.1 * age) * px;
          const y = st.cy + (lat + (hh(k, 15) - 0.5) * 0.2 * age) * px;
          const s = 1.5 * (0.6 + u * 0.8);
          sprite(g, evT.dust[k % 3] as HTMLCanvasElement, x, y, s * 1.5, px, 0, 0.55 * (1 - u) * Math.min(1, u * 6), false, s * 0.8);
        });
      if (on(st, "hops")) {
        const n = st.low ? 4 : 8;
        const per = 0.5 - 0.3 * warn; // faster as it comes
        for (let k = 0; k < n; k++) {
          const ph = (t / per + hh(k, 30)) % 1;
          const x = eX + (0.1 + hh(k, 31) * 0.9) * px;
          const y = st.cy + (hh(k, 32) - 0.5) * 6 * px;
          const lift = Math.sin(Math.PI * Math.min(1, ph * 3)) * 0.06 * (0.4 + 0.6 * warn);
          sprite(g, evT.grit!, x, y - lift * px, 0.08, px, 0, 0.9);
        }
      }
    });
  },
  textures: () => [tx("vapour_jet", evT.jet, "faces +x"), ...evT.vap.map((v, i) => tx(`vapour_${i}`, v)), tx("gas_tank (stand-in for the game's frame)", evT.tank), tx("flare_stick (shared)", evT.flare), tx("flare_pool (ADD)", evT.pool), tx("flare_head (ADD, 32²)", evT.head), ...evT.smoke.map((v, i) => tx(`signal_smoke_${i}`, v)), ...evT.dust.map((v, i) => tx(`stampede_dust_${i}`, v)), tx("grit (shared chip)", evT.grit)],
  parts: [
    { id: "jet", label: "Leak jet" },
    { id: "vapour", label: "Hanging vapour" },
    { id: "pool", label: "Flare light pool" },
    { id: "flare", label: "Flare + head" },
    { id: "column", label: "Signal column" },
    { id: "dust", label: "Dust wall" },
    { id: "hops", label: "Ground hops" },
  ],
  frames: [
    { label: "early", t: 0.4, when: "warning just started (dust thin)" },
    { label: "beat", t: (Math.PI / 2) / 8 + (2 * Math.PI) / 8, when: "jet at the ring's peak" },
    { label: "late", t: 2.8, when: "warning almost over (dust full)" },
  ],
};

/* =====================================================================================================
 * RD-G: the Ruins' dust, grit and ash.
 * ===================================================================================================== */
const RD_TINT: [number, number, number] = [184, 176, 160];
const ASH_TINT: [number, number, number] = [0xb8, 0xb2, 0xa8];
export const RD_G_END = 2.3;
/** The -G dust picture (shared by RD-G, PD-G and BD-G): neutral, lit from the upper left, flatter and softer than A's. */
const dustG: HTMLCanvasElement[] = [];
async function bakeDustG(): Promise<void> {
  if (dustG.length) return;
  for (const s of [1, 2, 3]) {
    dustG.push(litPuff(80, 90 + s, { rag: 0.6, scale: 2.2, alpha: 0.8, shade: 1.5 }));
    await idle();
  }
}
const WIND_ANG = Math.atan2(WIND[1], WIND[0]);
/** A falling chip: lands at (lx, ly) m at tLand; its shadow (down-right, by its height) closes in on it. */
interface Chip {
  x: number;
  y: number;
  t0: number;
  fall: number;
  big: boolean;
}
const RD_CHIPS: Chip[] = ((): Chip[] => {
  const out: Chip[] = [];
  for (let k = 0; k < 8; k++) {
    const big = k < 3;
    out.push({ x: (hh(k, 1, 4) - 0.5) * (big ? 1.4 : 1.8), y: (hh(k, 2, 4) - 0.5) * (big ? 0.8 : 1.2), t0: hh(k, 3, 4) * 0.12, fall: 0.3 + hh(k, 4, 4) * 0.1, big });
  }
  return out;
})();
const rdT: { smoke: HTMLCanvasElement[]; grit: HTMLCanvasElement[]; gsh?: HTMLCanvasElement; ash: HTMLCanvasElement[] } = { smoke: [], grit: [], ash: [] };
export const rdG: Look = {
  code: "RD-G",
  title: "Cause first, then a low drift",
  note: "Rethought from the goal: ambience that never reads as a hazard. The chips fall first, their shadows closing in on them, and land; only then does a low puff rise where each big chip hit, and it drifts downwind along the ground, stretched and faint. Nothing is round, nothing has an edge, nothing glows or flashes, and it stays in the material's own grey. The ash is RD-A's (its goal is the same). Close to RD-A in the pictures; the goal changed the order (cause before dust), the shape (a drift, not a growing disc) and the contrast (fainter).",
  goalFirst: {
    goal: "The ruins are still falling apart around you, and it never hurts: one small fall every 0.6–1.6 s at rubble in view, no damage (decay.json › ruins; DustView.ts). It must never be mistaken for acid, gas, a warning or an attack.",
    elements: [
      { name: "Chips falling", job: "the cause: bits of the building coming down. Three big, five small (today's 8 grit), each with its shadow closing in as it falls (the same top-down language as the acid glob)." },
      { name: "Bounce and rest", job: "they are solid and they stopped: one small hop, then they lie still and fade." },
      { name: "Low dust puff, after the landing", job: "secondary follows: dust rises where each big chip hit (3 puffs, today's 3), never before it." },
      { name: "Drift downwind", job: "it's air, not a zone: stretched along the street's one wind, no centre, no edge." },
      { name: "Ash (CO3)", job: "the city burned: unchanged from RD-A." },
      { name: "Cut: dust and chips at the same moment", job: "today and RD-A start the puff with the grit, so the dust appears with no cause." },
      { name: "Cut: turning the lit puffs", job: "RD-A turned each puff (seeded angle), turning its baked light away from the upper left." },
    ],
    composition: [
      "Nothing round and nothing crisp: zones in this game are circles with edges; the dust is a stretched, soft drift, and the chips are scattered, not in a ring.",
      "Brightness: lower than every hazard. Dust peak alpha 0.36 (RD-A up to 0.75), in the Ruins material's own grey; chips lit but small; no ADD, no yellow-green, no amber, no red.",
      "One clock: the fall (0–0.4 s), the landing, then the dust (from the landing, 1.8 s, today's life), drifting with the street's wind at 0.15 m/s (today: straight down the screen).",
      "Sound 'debris_fall' on the landing, not on the spawn (a question for the build: today it plays on the spawn).",
    ],
    plan: {
      goal: "Background life: something fell, it settled. Never a threat.",
      timing: "A fall every 0.6–1.6 s (decay.json › ruins); smoke 1.8 s, grit 1.1 s (DustView.ts); here the smoke starts on each landing (0.3–0.5 s).",
      lengthS: RD_G_END,
      lanes: {
        matter: [
          { t0: 0, t1: 0.45, label: "chips fall, shadows close in", nw: true },
          { t0: 0.35, t1: 0.6, label: "land + hop", key: true, nw: true },
          { t0: 0.6, t1: 1.2, label: "rest, fade" },
        ],
        smoke: [{ t0: 0.35, t1: 2.25, label: "3 low puffs from the landings, drift downwind", nw: true }],
        game: [{ t0: 0.35, t1: 0.45, label: "debris_fall on the landing (proposed)", key: true, nw: true }],
      },
    },
  },
  async bake() {
    await bakeDustG();
    rdT.smoke = dustG.map((d) => tinted(d, RD_TINT));
    rdT.grit = [3, 5, 9].map((s) => tinted(gritChip(s), RD_TINT));
    rdT.gsh = silhouette(gritChip(3), "rgba(0,0,0,0.5)", 1.5);
    rdT.ash = [tinted(ashFlake(false, 2), ASH_TINT), tinted(ashFlake(true, 2), ASH_TINT), silhouette(ashFlake(false, 2), "rgba(0,0,0,0.6)", 1)];
  },
  draw(g, t, st) {
    const px = st.pxm;
    const ox = st.cx;
    const oy = st.cy;
    const flip = st.seed % 2 ? -1 : 1;
    const n = st.low ? 4 : 8;
    for (let k = 0; k < n; k++) {
      const c = RD_CHIPS[k] as Chip;
      const age = t - c.t0;
      if (age < 0 || age >= 1.1) continue;
      const tl = c.fall;
      const f = Math.min(1, age / tl);
      const hgt = 1.2 * (1 - f * f); // accelerates down
      const hop = age > tl && age < tl + 0.18 ? Math.sin(((age - tl) / 0.18) * Math.PI) * (c.big ? 0.05 : 0.03) : 0;
      const x = ox + c.x * flip * px;
      const y = oy + c.y * px;
      const a = age < 0.75 ? 1 : 1 - (age - 0.75) / 0.35;
      const size = c.big ? 0.12 : 0.07;
      if (on(st, "shadow")) sprite(g, rdT.gsh!, x + (0.6 * hgt * 0.6 + 0.02) * px, y + (0.8 * hgt * 0.6 + 0.03) * px, size * (1 + 0.6 * hgt), px, 0, a * (0.25 + 0.5 * f));
      if (on(st, "grit")) sprite(g, rdT.grit[k % 3] as HTMLCanvasElement, x, y - (hgt * 0.25 + hop) * px, size * (1 + 0.15 * hgt), px, 0, a);
    }
    if (on(st, "smoke"))
      for (let k = 0; k < 3; k++) {
        const c = RD_CHIPS[k] as Chip;
        const age = t - (c.t0 + c.fall);
        if (age < 0 || age >= 1.8) continue;
        const u = age / 1.8;
        const d = 0.15 * age + 0.25 * (1 - Math.pow(1 - u, 2));
        const x = ox + (c.x * flip + WIND[0] * d) * px;
        const y = oy + (c.y + WIND[1] * d) * px;
        const size = 0.6 * (1 + 1.3 * u);
        const a = 0.36 * Math.sin(Math.PI * Math.min(1, u * 1.6)) * (1 - u);
        // stretched along the wind; the wind is near-horizontal, so stretching in x keeps the baked light upper-left
        sprite(g, rdT.smoke[k] as HTMLCanvasElement, x, y, size * (1.3 + 0.4 * u) * Math.abs(Math.cos(WIND_ANG)) + size * 0.2, px, 0, a, false, size * 0.75);
      }
    if (on(st, "ash")) {
      const na = st.low ? 6 : 12;
      const W = st.w / px + 2;
      const H = st.h / px + 2;
      for (let i = 0; i < na; i++) {
        const sp = (12 + hh(i, 20) * 6) * 0.08;
        const yOff = (hh(i, 21) * H + t * sp) % H;
        const xOff = (((hh(i, 22) * W + Math.sin(t * 0.8 + i) * 0.4 + t * 0.6) % W) + W) % W;
        const x = (xOff - 1) * px;
        const y = (yOff - 1) * px;
        const tumble = Math.cos(t * (1.5 + hh(i, 23)) + i);
        const fr = Math.abs(tumble) < 0.35 ? 1 : 0;
        sprite(g, rdT.ash[2] as HTMLCanvasElement, x + 0.05 * px, y + 0.08 * px, 0.07, px, i, 0.25);
        sprite(g, rdT.ash[fr] as HTMLCanvasElement, x, y, 0.08, px, i + t * 0.4, 0.75, false, 0.06 * Math.max(0.35, Math.abs(tumble)));
      }
    }
  },
  textures: () => [...dustG.map((d, i) => tx(`fx_dust_g${"abc"[i]} (neutral, lit)`, d, "tinted in the game; shared with PD-G, BD-G")), ...rdT.grit.map((d, i) => tx(`fx_grit_${"abc"[i]} (A's chips)`, d)), tx("grit_shadow", rdT.gsh), tx("fx_ash_face (A)", rdT.ash[0]), tx("fx_ash_edge (A)", rdT.ash[1]), tx("fx_ash_shadow (A)", rdT.ash[2])],
  parts: [
    { id: "grit", label: "Chips" },
    { id: "shadow", label: "Chips' shadows" },
    { id: "smoke", label: "Dust (after the landing)" },
    { id: "ash", label: "Ash (CO3)" },
  ],
  frames: [
    { label: "falling", t: 0.15, when: "chips in the air, no dust yet" },
    { label: "landing", t: 0.42, when: "hop; first dust" },
    { label: "drift", t: 1.1, when: "dust drifting downwind" },
    { label: "thin", t: 1.9, when: "fading" },
  ],
};

/* =====================================================================================================
 * PD-G: dust when a building is placed.
 * ===================================================================================================== */
const PD_COL: [number, number, number] = [0xa8, 0x9c, 0x88];
const PD_W = 2;
const PD_H = 1;
/** 8 puffs squeezed out from under the edges (today's count): 3 per long side, 1 per short side, out along the normal. */
const PD_SLOTS: readonly { x: number; y: number; nx: number; ny: number; big: number }[] = [
  ...[-0.62, 0, 0.62].map((x) => ({ x, y: -PD_H / 2, nx: 0, ny: -1, big: x === 0 ? 1 : 0.8 })),
  ...[-0.62, 0, 0.62].map((x) => ({ x, y: PD_H / 2, nx: 0, ny: 1, big: x === 0 ? 1 : 0.8 })),
  { x: -PD_W / 2, y: 0, nx: -1, ny: 0, big: 0.7 },
  { x: PD_W / 2, y: 0, nx: 1, ny: 0, big: 0.7 },
];
const pdT: { dust: HTMLCanvasElement[]; grit?: HTMLCanvasElement; shadow?: HTMLCanvasElement } = { dust: [] };
export const pdG: Look = {
  code: "PD-G",
  title: "Air squeezed out from under its edges",
  note: "Rethought from the goal. The piece drops flat, so the air under it is pushed out from under each edge, straight out, most from the middle of the long sides: the dust traces the building's own rectangle (today's 8 puffs leave by angle from the centre, like a ring). Each puff is flat and wide along its edge and grows as it thins. The street darkens under the piece for a moment (its weight), and two chips skip out. Same 8 puffs, 0.7 m/s slowing, 0.4 s.",
  goalFirst: {
    goal: "Thud: your building is down, exactly on this footprint, and solid (placeFeel.ts: 8 puffs, 0.7 m/s slowing to 0, 0.4 s; shown on a 2 × 1 m barricade).",
    elements: [
      { name: "Edge puffs", job: "'exactly here': the dust leaves from under the four edges, along each edge's outward normal, so it outlines the rectangle. Long sides 3 each, short sides 1 each (the air under a long side has the most to push)." },
      { name: "Flat, wide shape", job: "'it was pressed out': each puff is wide along its edge and thin across it, growing as it thins (dust billows; today's dots shrink)." },
      { name: "Contact shadow", job: "'solid, heavy': the street darkens under the piece at the hit and relaxes in 0.25 s." },
      { name: "Two chips", job: "'it hit hard': knocked out from the long sides' middles, skipping once." },
      { name: "Cut: angle-from-centre emission", job: "today's even angles land unevenly on a rectangle (more on the short sides than the long ones per metre) and read as a ring, the FI-A mistake." },
      { name: "Cut: any light", job: "placing is not danger or an event: no flash, no amber." },
    ],
    composition: [
      "All dust starts ON the footprint's edge and moves outward; none starts inside or at the corners' diagonals.",
      "Brightness: the building itself (not drawn by this FX) > the chips > the dust (peak alpha 0.6, the street's grey-brown) > the contact shadow.",
      "One clock: the hit at 0; the shadow peaks at once and relaxes by 0.25 s; the puffs leave fast and stop by 0.4 s (v = 0.7 (1 − t / 0.4)); the chips rest by 0.35 s.",
      "Lit dust is not turned: the puffs on the long sides stretch in x, the short sides' in y, so the light stays upper-left.",
    ],
    plan: {
      goal: "It's down, here, and solid.",
      timing: "0.4 s from building.placed (placeFeel.ts), with the place sound and haptic.",
      lengthS: 0.5,
      lanes: {
        smoke: [{ t0: 0, t1: 0.4, label: "8 edge puffs: out along the normals, grow, thin", nw: true }],
        mark: [{ t0: 0, t1: 0.25, label: "contact shadow", key: true, nw: true }],
        matter: [{ t0: 0, t1: 0.45, label: "2 chips skip out", nw: true }],
        game: [{ t0: 0, t1: 0.05, label: "place sound + haptic", key: true }],
      },
    },
  },
  async bake() {
    await bakeDustG();
    pdT.dust = dustG.map((d) => tinted(d, PD_COL));
    pdT.grit = tinted(gritChip(12), PD_COL);
    pdT.shadow = contactShadow(80, 40);
  },
  draw(g, t, st) {
    if (t >= 0.5) return;
    const px = st.pxm;
    if (on(st, "shadow") && t < 0.25) sprite(g, pdT.shadow!, st.cx + 0.03 * px, st.cy + 0.04 * px, PD_W + 0.4, px, 0, 0.28 * (1 - t / 0.25), false, PD_H + 0.4);
    if (on(st, "dust") && t < 0.4) {
      const tt = Math.min(t, 0.4);
      const d = 0.7 * (tt - (tt * tt) / 0.8);
      const u = t / 0.4;
      PD_SLOTS.forEach((s, k) => {
        if (st.low && k % 2) return;
        const along = (0.45 + 0.5 * u) * s.big;
        const across = (0.18 + 0.3 * u) * s.big;
        const w = s.nx ? across : along;
        const h = s.nx ? along : across;
        const x = st.cx + (s.x + s.nx * (d + across * 0.3)) * px;
        const y = st.cy + (s.y + s.ny * (d + across * 0.3)) * px;
        sprite(g, pdT.dust[k % 3] as HTMLCanvasElement, x, y, w, px, 0, 0.6 * (1 - u) * Math.min(1, u * 10 + 0.4), false, h);
      });
    }
    if (on(st, "grit") && !st.low)
      for (let k = 0; k < 2; k++) {
        const u = Math.min(1, t / 0.35);
        const side = k ? 1 : -1;
        const x = st.cx + (k ? 0.25 : -0.3) * px;
        const y = st.cy + side * (PD_H / 2 + 0.4 * Math.sqrt(u)) * px - Math.sin(Math.PI * Math.min(1, u * 1.3)) * 0.1 * px;
        sprite(g, pdT.grit!, x, y, 0.07, px, 0, t < 0.35 ? 1 : 1 - (t - 0.35) / 0.15);
      }
  },
  textures: () => [...pdT.dust.map((d, i) => tx(`fx_dust_g${"abc"[i]} (shared, tinted a89c88)`, d)), tx("grit (shared chip)", pdT.grit), tx("contact_shadow", pdT.shadow, "100×60")],
  parts: [
    { id: "dust", label: "Edge puffs" },
    { id: "shadow", label: "Contact shadow" },
    { id: "grit", label: "Chips" },
  ],
  frames: [
    { label: "hit", t: 0.03, when: "just placed: shadow, puffs leaving" },
    { label: "mid", t: 0.18, when: "spreading" },
    { label: "end", t: 0.36, when: "stopped, thin" },
  ],
};

/* =====================================================================================================
 * RN-G: rain.
 * ===================================================================================================== */
const RAIN_SLANT = 0.22;
const rnT: { drop?: HTMLCanvasElement; hit: HTMLCanvasElement[]; wet: HTMLCanvasElement[] } = { hit: [], wet: [] };
export const rnG: Look = {
  code: "RN-G",
  title: "The wet street carries the rain",
  note: "Rethought from the goal: 'pouring, but nothing that matters is hidden'. The wet, glossy street with the lamp's streak in it carries most of the read, so the drops can be shorter and thinner (seen from above, rain falls toward you: short streaks). The drops hit the street as a dark wet dot and a few beads, never as expanding rings: rings mean zones and feedback in this game. Close to RN-B (same wet patches); the goal changed the drops (shorter, thinner) and removed the ring splashes.",
  goalFirst: {
    goal: "It's pouring (stage 3: rain level 1, 0.4 drops / m², CityView.ts), and every hazard, warning, enemy and ring stays as readable as without rain.",
    elements: [
      { name: "Wet street", job: "'it's pouring', the main carrier: darker glossy asphalt with the lamp's streak in it (RN-B's patches). It sits under everything, so it hides nothing." },
      { name: "Drops", job: "'it's falling now': short, thin, faint streaks on one slant (0.3 m, alpha 0.3; today 0.45 m, 0.28; the -G drop is thinner, so it covers less). Seen from above, rain comes toward the camera, so streaks are short." },
      { name: "Hits", job: "'it lands on the street': a dark wet dot and 2–3 beads thrown up, for 0.3 s of each 0.625 s cycle (today's 16 × level, 1.6 per s)." },
      { name: "Cut: the expanding splash ring", job: "today's and A's splashes are growing ellipses: 16 rings blinking on the street compete with the game's rings (repair / upgrade / sell, acid and gas edges, take rings)." },
      { name: "Cut: the crown", job: "RN-A's crown frame is a ring of beads: still a ring." },
    ],
    composition: [
      "Layering: the wet street at the street's level; drops faint; a finding: the game draws rain at depth 11.8, above the acid puddles (1.55), the gas (6.6) and the Spitter's glob (11.5). Proposed: rain under the hazards (or this faint).",
      "Brightness: the lamp's streak in the wet patches > the drops' heads > the beads > the drops' tails. Nothing of the rain is brighter than a hazard's edge.",
      "One wind: the slant (0.22) is the drops' own; the hits stay where they land (no drift).",
      "No circle anywhere in the rain.",
    ],
    plan: {
      goal: "Pouring, without hiding anything.",
      timing: "Continuous; each hit cycle 0.625 s (1.6 / s), drops 12–18 m/s (CityView.ts).",
      lengthS: 1.25,
      lanes: {
        mark: [{ t0: 0, t1: 1.25, label: "wet street (static, from the stage)", nw: true }],
        matter: [{ t0: 0, t1: 1.25, label: "drops: short, faint", nw: true }],
        core: [
          { t0: 0, t1: 0.12, label: "hit: dot + beads up", key: true, nw: true },
          { t0: 0.12, t1: 0.3, label: "beads fall back", nw: true },
          { t0: 0.625, t1: 0.745, label: "hit", key: true, nw: true },
          { t0: 0.745, t1: 0.925, label: "beads fall back", nw: true },
        ],
      },
    },
  },
  async bake() {
    rnT.drop = rainShort();
    rnT.hit = [rainHit(0, 3), rainHit(1, 3)];
    rnT.wet = [wetPatch(1), wetPatch(4)];
  },
  draw(g, t, st) {
    const px = st.pxm;
    const vw = st.w / px;
    const vh = st.h / px;
    if (on(st, "wet")) {
      sprite(g, rnT.wet[0] as HTMLCanvasElement, st.w * 0.3, st.h * 0.62, 3.2, px, 0, 0.9);
      sprite(g, rnT.wet[1] as HTMLCanvasElement, st.w * 0.74, st.h * 0.32, 2.6, px, 0, 0.85);
    }
    const nHit = Math.round(16 * (st.low ? 0.5 : 1));
    if (on(st, "hits"))
      for (let i = 0; i < nHit; i++) {
        const phase = t * 1.6 + i * 0.37;
        const ph = phase - Math.floor(phase);
        const cyc = Math.floor(phase);
        if (ph > 0.48) continue;
        const x = hh(i * 13 + cyc, 1) * vw * px;
        const y = hh(i * 29 + cyc, 2) * vh * px;
        const fr = ph < 0.19 ? 0 : 1;
        sprite(g, rnT.hit[fr] as HTMLCanvasElement, x, y, 0.32, px, 0, fr ? 0.7 * (1 - (ph - 0.19) / 0.29) : 0.8);
      }
    if (on(st, "drops")) {
      const n = Math.min(128, Math.round(vw * vh * 0.4 * (st.low ? 0.5 : 1)));
      const spanY = vh + 3;
      const spanX = vw + 3;
      for (let i = 0; i < n; i++) {
        const sp = 12 + hh(i, 3) * 6;
        const yOff = (hh(i, 4) * spanY + t * sp) % spanY;
        const xOff = (((hh(i, 5) * spanX + yOff * RAIN_SLANT) % spanX) + spanX) % spanX;
        sprite(g, rnT.drop!, (xOff - 1.5) * px, (yOff - 1.5) * px, 0.032, px, -Math.atan(RAIN_SLANT), 0.3, false, 0.3);
      }
    }
  },
  textures: () => [tx("rain_short", rnT.drop, "4×28"), tx("rain_hit_0", rnT.hit[0], "32×22"), tx("rain_hit_1", rnT.hit[1]), tx("wet_patch_0 (RN-B's)", rnT.wet[0]), tx("wet_patch_1 (RN-B's)", rnT.wet[1])],
  parts: [
    { id: "wet", label: "Wet street" },
    { id: "drops", label: "Drops" },
    { id: "hits", label: "Hits (dot + beads)" },
  ],
  frames: [
    { label: "hit", t: 0.0, when: "hit frame 0 (first)" },
    { label: "beads", t: 0.15, when: "frame 1" },
    { label: "gap", t: 0.35, when: "between its hits" },
  ],
};

/* =====================================================================================================
 * BD-G: the Behemoth's dust (Story 9.15's timing kept).
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
 * The slam's puffs with 9.15's numbers (BOSS_DUST: count, speed × 0.4–1, radius × 0.6–1.2, life × 0.7–1.2, start
 * within 0.08 s, grit off the shoulders), with -G's two geometry rules: no puff goes back into the body (directions in
 * the half away from the boss centre, ± 90°), and no puff's visible part passes 4.2 m (0.3 m inside the slam's edge).
 */
const SLAM_PUFFS_G: Puff[] = ((): Puff[] => {
  const out: Puff[] = [];
  const B = BOSS_DUST.slamFists;
  let e = 0;
  for (const side of [-1, 1]) {
    const fx = BOSS_DUST.fistAhead * BOSS_R;
    const fy = side * BOSS_DUST.fistSide * BOSS_R;
    const outA = Math.atan2(fy, fx);
    for (let k = 0; k < B.n; k++, e++) {
      const a = outA + (dustHash(e, 1) - 0.5) * Math.PI; // the half away from the body
      let s = B.speed * (0.4 + 0.6 * dustHash(e, 2));
      const r = B.r * (0.6 + 0.6 * dustHash(e, 3));
      const life = B.lifeS * (0.7 + 0.5 * dustHash(e, 4));
      // the edge rule: where the puff is still visible (u ≤ 0.7, alpha ≥ 0.15) it stays inside 4.2 m
      const u = 0.7;
      const reach = (sp: number): number => Math.hypot(fx + Math.cos(a) * sp * life * u, fy + Math.sin(a) * sp * life * u) + r * (1 + BOSS_DUST.grow * u);
      while (s > 0.2 && reach(s) > SLAM_R - 0.3) s *= 0.9;
      out.push({ x: fx, y: fy, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r, life, t0: BOSS_DUST.jitterS * dustHash(e, 5), grit: false });
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
const bdT: HTMLCanvasElement[] = [];
export const bdG: Look = {
  code: "BD-G",
  title: "Dust pushed out along the ground, inside the slam",
  note: "9.15's timing, counts, sizes, alpha and tint are kept. What -G changes is where the dust goes: a fist slammed into the street pushes the dust out along the ground away from the body (none goes back into the boss), and no visible puff passes 4.2 m from the boss, so the dust can never be read as the 4.5 m slam edge. The lit puffs are not turned (their light stays upper-left); they stretch along their motion instead. In 9.15's code this is the burst's angle (half a circle round the outward direction) and a speed cap: two lines in bossDust.ts.",
  goalFirst: {
    goal: "The slam lands with weight right here, at the fists (boss.json › slam: 40 damage inside 4.5 m at the hit) — and the dust must never be read as the slam's edge, nor hide the boss's next tell.",
    elements: [
      { name: "Fist bursts (2 × 9)", job: "'it hit here': dust born at each fist on the hit frame (9.15's 0–0.08 s start), pushed out along the street." },
      { name: "Away from the body", job: "'the ground took the blow': air squeezed out from under a fist leaves on the open side; dust going back into the boss is physically wrong and covers the body's tell." },
      { name: "Kept inside 4.2 m", job: "'this is not the zone': the visible dust ends 0.3 m inside the slam's edge; the zone is the warning's job (SD)." },
      { name: "Grit off the shoulders", job: "'weight': the body shook; unchanged from 9.15." },
      { name: "Cut: a crater / scuff mark", job: "the ground damage card (GD) owns the mark: drawing one here would double it." },
    ],
    composition: [
      "Dust only in front of and beside the fists, never on the boss's body; two clusters, never a ring round the boss.",
      "Brightness: the boss and its tells > the dust (peak alpha 0.5, 9.15's) > the street. No light, no colour: the tint stays b8ada0.",
      "One clock: 9.15's. Bursts start within 0.08 s of the hit, live 0.35–0.6 s, grow × 2.6, fade linearly; grit one every 0.07 s from 0.05 s.",
      "Lit puffs are never turned; each stretches up to × 1.3 along its motion's main axis.",
    ],
    plan: {
      goal: "The slam lands with weight here, and the dust stays inside the slam.",
      timing: "From the slam hit (boss.json slam: telegraph 1.2 s, then the hit); 9.15's BOSS_DUST unchanged in time.",
      lengthS: 0.6,
      lanes: {
        smoke: [{ t0: 0, t1: 0.6, label: "fist bursts: half-circle away from the body, ≤ 4.2 m", nw: true }],
        matter: [{ t0: 0.05, t1: 0.47, label: "grit off the shoulders (9.15)" }],
        game: [{ t0: 0, t1: 0.05, label: "slam hit (BossView, 9.15)", key: true }],
      },
    },
  },
  async bake() {
    await bakeDustG();
    for (const d of dustG) bdT.push(tinted(d, PUFF_COLOR));
  },
  draw(g, t, st) {
    const px = st.pxm;
    if (st.only === null) ctxStroke(g, "rgba(240,240,240,0.28)", 1, () => g.arc(st.cx, st.cy, SLAM_R * px, -0.9, 0.9), [4, 4]);
    if (!on(st, "dust") && !on(st, "grit")) return;
    const n = st.low ? 24 : BOSS_DUST.pool;
    SLAM_PUFFS_G.forEach((p, i) => {
      if (i >= n) return;
      if (!on(st, p.grit ? "grit" : "dust")) return;
      const age = t - p.t0;
      if (age < 0 || age >= p.life) return;
      const u = age / p.life;
      const x = st.cx + (p.x + p.vx * age) * px;
      const y = st.cy + (p.y + p.vy * age) * px;
      const d = 2 * p.r * (1 + BOSS_DUST.grow * u);
      const sp = Math.hypot(p.vx, p.vy) || 1;
      const sx = 1 + 0.3 * Math.abs(p.vx / sp);
      const sy = 1 + 0.3 * Math.abs(p.vy / sp);
      sprite(g, bdT[i % 3] as HTMLCanvasElement, x, y, d * sx, px, 0, BOSS_DUST.alpha * (1 - u), false, d * sy);
    });
  },
  textures: () => bdT.map((d, i) => tx(`fx_dust_g${"abc"[i]} (tinted b8ada0)`, d, "shared with RD-G")),
  parts: [
    { id: "dust", label: "Fist bursts" },
    { id: "grit", label: "Grit off the shoulders" },
  ],
  frames: [
    { label: "hit", t: 0.06, when: "slam hit" },
    { label: "spread", t: 0.25, when: "grit off the shoulders" },
    { label: "thin", t: 0.45, when: "fading, inside 4.2 m" },
  ],
};
