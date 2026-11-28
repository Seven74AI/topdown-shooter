/**
 * Photoreal group 5, gunfire family, round 2 (designer 2026-11-28, `docs/art/photoreal-decisions.md` › "Picks,
 * round 2"): the new looks asked after the second review. Each is appended after its card's existing looks.
 *
 *  - ML-M: "Could we somehow mix MLA and MLG". ML-A's blade sweep and steel glint, with ML-G's reach band laid over
 *    it as its own layer, holding after the blade has passed.
 *
 * Same contract as the other takes: bake() once (gunfire-r2-art.ts), draw() only composes sprites.
 */
import { idle, make, sprite, type Look, type Stage } from "./kit";
import { bakeGlint } from "./gunfire-art";
import { MLM_P, bakeBandM, bakeSweepM, type SectorPic } from "./gunfire-r2-art";

const DEG = Math.PI / 180;
const on = (st: Stage, part: string): boolean => st.only === null || st.only === part;
type Tex = { name: string; canvas: HTMLCanvasElement; note?: string };
const tx = (name: string, canvas: HTMLCanvasElement | null | undefined, note?: string): Tex => ({ name, canvas: canvas ?? make(1, 1), note });
/** A sprite whose anchor (ax, ay metres from the picture's centre, before rotation) sits at (x, y). */
function spriteAt(g: CanvasRenderingContext2D, s: SectorPic, x: number, y: number, pxm: number, rot: number, a: number): void {
  const c = Math.cos(rot);
  const n = Math.sin(rot);
  sprite(g, s.pic, x - (s.ax * c - s.ay * n) * pxm, y - (s.ax * n + s.ay * c) * pxm, s.pic.width / MLM_P, pxm, rot, a, false);
}

/* ======================================================================================================== ML-M */
/** The card's two weapons, placed as on the card (gunfire.ts › ML_W): weapons.json sectors, FxView end times. */
const MLM_W: readonly { range: number; arc: number; dx: number; heavy: boolean; sweepS: number; holdS: number; endS: number }[] = [
  { range: 1.8, arc: 110 * DEG, dx: -1.9, heavy: false, sweepS: 0.06, holdS: 0.09, endS: 0.12 },
  { range: 2.2, arc: 140 * DEG, dx: 1.9, heavy: true, sweepS: 0.09, holdS: 0.15, endS: 0.2 },
];
const FRACS = [0.25, 0.5, 0.75, 1] as const;
export function mlM(): Look {
  const smear: SectorPic[][] = [];
  const band: SectorPic[][] = []; // 4 sweep frames + the settled band (index 4)
  let glint: HTMLCanvasElement | null = null;
  return {
    code: "ML-M",
    title: "A's sweep + G's reach band",
    note:
      "The designer: <i>“Could we somehow mix MLA and MLG”</i>. <b>From ML-A:</b> the blade's sweep, a motion smear that crosses the sim's sector in 4 frames (60 ms machete, 90 ms axe), densest at the blade and toward the rim, and the steel glint riding the blade. <b>From ML-G:</b> the crisp light band exactly at the weapon's range (1.8 m / 2.2 m). <b>What the mix changes:</b> the band is now its own layer, so it <i>holds</i> at full strength after the blade has passed (30 ms machete, 60 ms axe) while A's smear is already fading; then it fades to today's end (120 / 200 ms). In ML-G the band faded with everything else as soon as the blade stopped. A's smear is trimmed to end at the range (it ran 2 % past it), so the band alone draws the rim, and both pictures are cropped to the sector (ML-G's finding).",
    goalFirst: {
      goal: "Read <b>which way the blade went</b> (ML-A's sweep) <b>and exactly what it could reach</b> (ML-G's band): the sim's sector (F1: machete 110° × 1.8 m, fire axe 140° × 2.2 m), ending on today's times (120 / 200 ms), at 2.5 / 1.4 swings a second.",
      elements: [
        { name: "Sweep smear (from ML-A; matter: air dragged by the steel)", job: "which way: dense at the blade, fading behind it, so the cut has a direction of travel. Read: <i>the direction of the cut</i>." },
        { name: "Steel glint (from ML-A; light)", job: "now: the edge catches the key light once, riding the blade at 0.9 of the range. Read: <i>the moment of the cut</i>." },
        { name: "Reach band (from ML-G; light on the rim)", job: "how far: a crisp band whose outer edge IS the range, written as the blade passes and held after it. Read: <i>what it could reach</i>." },
      ],
      composition: [
        "Nothing outside the sim's sector: the band's outer edge is the range (1 px edge), the smear now stops inside it.",
        "Brightness: glint (ADD) > reach band (≤ 0.9, a little whiter just behind the blade) > smear (A's ≤ 0.5), so a zombie inside the sector stays readable.",
        "One clock, the swing: the blade crosses in 60 ms (axe 90 ms); the smear fades from there to the end (A's timing); the band holds full for 30 ms (axe 60 ms), then fades to the same end (120 / 200 ms). Nothing lasts past today's end, so the swing rates never stack more than one arc per weapon.",
        "Only the glint is additive; the smear and the band are lit air, drawn normal.",
      ],
      plan: {
        goal: "Which way the blade went and exactly what it could reach; the reach stays a moment after the cut.",
        timing: "Machete 120 ms, axe 200 ms (<code>SWING_MS</code>, <code>AXE_SWING_MS</code>). Sweep 60 / 90 ms (4 frames); band holds to 90 / 150 ms, then fades to the end.",
        lengthS: 0.4,
        lanes: {
          light: [
            { t0: 0, t1: 0.09, label: "glint rides the blade (A)" },
            { t0: 0, t1: 0.09, label: "reach band written behind the blade (G)" },
            { t0: 0.06, t1: 0.15, label: "band holds (machete to 90, axe to 150 ms)", nw: true },
            { t0: 0.09, t1: 0.2, label: "band fades to the end" },
          ],
          core: [
            { t0: 0, t1: 0.06, label: "sweep smear (machete, A)", key: true },
            { t0: 0.06, t1: 0.12, label: "smear fades" },
            { t0: 0.12, t1: 0.2, label: "axe fade ends" },
          ],
          game: [{ t0: 0, t1: 0.02, label: "hits resolved on the swing", key: true }],
        },
      },
    },
    bake: async () => {
      if (smear.length) return;
      for (const m of MLM_W) {
        smear.push(FRACS.map((f) => bakeSweepM(m.range, m.arc, f, m.heavy)));
        band.push([...FRACS.map((f) => bakeBandM(m.range, m.arc, f, m.heavy)), bakeBandM(m.range, m.arc, -1, m.heavy)]);
        await idle();
      }
      glint = bakeGlint(48);
    },
    draw: (g, t, st) => {
      const rot = -Math.PI / 2;
      MLM_W.forEach((m, i) => {
        if (t >= m.endS) return;
        const x = st.cx + m.dx * st.pxm;
        const y = st.cy + 1.3 * st.pxm;
        const f = Math.min(3, Math.floor((t / m.sweepS) * 4));
        // A: the smear, swapped frames, fading from the sweep's end to the end
        const sa = t < m.sweepS ? 1 : 1 - (t - m.sweepS) / (m.endS - m.sweepS);
        if (on(st, "arc")) spriteAt(g, smear[i]![f]!, x, y, st.pxm, rot, sa);
        // G: the band, written behind the blade, then settled, held, faded
        if (on(st, "band")) {
          const b = t < m.sweepS ? band[i]![f]! : band[i]![4]!;
          const ba = t < m.holdS ? 1 : 1 - (t - m.holdS) / (m.endS - m.holdS);
          spriteAt(g, b, x, y, st.pxm, rot, ba);
        }
        // A: the glint rides the blade
        if (on(st, "glint") && t < m.sweepS + 0.03) {
          const frac = Math.min(1, t / m.sweepS);
          const ang = rot - m.arc / 2 + m.arc * frac;
          const ga = Math.sin(Math.min(1, t / (m.sweepS + 0.03)) * Math.PI);
          sprite(g, glint!, x + Math.cos(ang) * m.range * 0.9 * st.pxm, y + Math.sin(ang) * m.range * 0.9 * st.pxm, m.heavy ? 0.42 : 0.34, st.pxm, 0, ga, true);
        }
      });
    },
    textures: () => [
      ...smear.flatMap((s, i) => s.map((c, f) => tx(`sweepM_${MLM_W[i]!.heavy ? "axe" : "machete"}_${f}`, c.pic, "A's smear, cropped, ends at the range"))),
      ...band.flatMap((s, i) => s.map((c, f) => tx(`bandM_${MLM_W[i]!.heavy ? "axe" : "machete"}_${f < 4 ? f : "held"}`, c.pic, f < 4 ? "G's band, written to the blade" : "G's band, settled (the hold)"))),
      tx("glint", glint, "ADD, shared with ML-A"),
    ],
    parts: [
      { id: "arc", label: "Sweep smear (from A)" },
      { id: "band", label: "Reach band (from G)" },
      { id: "glint", label: "Steel glint (from A)" },
    ],
    frames: [
      { label: "sweep 1", t: 0.008, when: "0–15 ms" },
      { label: "sweep 2", t: 0.024, when: "15–30 ms" },
      { label: "sweep 3", t: 0.039, when: "30–45 ms" },
      { label: "sweep 4", t: 0.054, when: "45–60 ms: the whole sector" },
      { label: "hold", t: 0.08, when: "60–90 ms: smear fading, band held full (axe to 150 ms)" },
      { label: "fade", t: 0.105, when: "90–120 ms: the band fades (axe 150–200 ms)" },
    ],
  };
}
export const ML_M_PERF =
  " <b>ML-M</b>: per weapon 4 smear frames + 5 band frames, all cropped to the sector (machete 77 × 123, axe 93 × 171 each; measured on the page: 19 textures, 901 KB with the glint, as one atlas about the same as ML-A's 858 KB; the band frames are mostly empty and could be cropped to the rim to save about a third), glint shared. Per swing: 2 images (smear + band, frames swapped) + 1 glint (ADD) for ≤ 120 / 200 ms; same cap 8 (16 images at the cap). No path rebuilt per swing.";
export const ML_M_FINDINGS = [
  "<b>ML-M</b>: ML-A's smear ran 2 % past the range (to 1.02 R: 3.6 cm machete, 4.4 cm axe, ≈ 1.5 px at game size): a faint fringe outside the sim's sector. ML-M's copy stops at the range.",
  "<b>ML-M</b>: the band needs its own image to hold after the smear fades: one image more per swing than A or G (2 instead of 1).",
];
