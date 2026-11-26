import type { FxCard } from "./kit";
import { make, radialTex, sprite } from "./kit";
/** Filled by the gunfire builder. Placeholder card to check the shell. */
let glow: HTMLCanvasElement | null = null;
export const cards: FxCard[] = [
  {
    id: "placeholder", code: "XX", name: "Placeholder", family: "gunfire", brief: "test", game: "test", perf: "test", lengthS: 0.3, keyT: [0, 0.05, 0.2], viewM: 4,
    looks: [{ code: "now", title: "today", note: "n", bake: async () => { glow = radialTex(64, [[0, "rgba(255,230,160,1)"], [1, "rgba(255,120,0,0)"]]); }, draw: (g, t, st) => sprite(g, glow!, st.cx, st.cy, 0.6 * (1 - t / 0.3), st.pxm, 0, 1, true), textures: () => [{ name: "glow", canvas: glow ?? make(1, 1) }], parts: [{ id: "glow", label: "Glow" }], frames: [{ label: "a", t: 0, when: "t0" }, { label: "b", t: 0, when: "same" }] }],
    plan: { goal: "g", timing: "t", lengthS: 0.3, lanes: { light: [{ t0: 0, t1: 0.05, label: "flash", key: true }] } },
  },
];
