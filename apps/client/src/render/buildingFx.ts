/**
 * Photoreal group 3 (approved 2026-11-25, `docs/art/photoreal-decisions.md`): how the relit things you build come
 * alive. Pure timing (no Phaser): the view turns these numbers into the alpha of an additive glow image and of a few
 * glint stars. Matches the approved proposal page (`docs/art/photoreal-3/compare.html`).
 */

/** none · flicker (a generator lamp: steady hum, now and then a short dip) · heartbeat (the med cross: a double beat
 * every 1.1 s) · blink (the mine's LED: a short flash every 1.2 s) · strobe (an amber warning lamp). */
export type GlowKind = "none" | "flicker" | "heartbeat" | "blink" | "strobe";

function hash(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
/** Smooth 1-D value noise, 0–1. */
function noise1(x: number): number {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return hash(i) + (hash(i + 1) - hash(i)) * u;
}

/** The glow's strength (0–1, about) at time `t` seconds; `seed` keeps neighbouring lamps out of step. */
export function glowLevel(kind: GlowKind, t: number, seed: number): number {
  switch (kind) {
    case "flicker": {
      const hum = 0.88 + 0.06 * Math.sin(t * 2 * Math.PI * 7.3) * noise1(t * 4 + seed);
      const dip = noise1(t * 1.6 + seed * 3.1);
      return hum * (dip < 0.3 ? 0.35 + (Math.sin(t * 60) > 0 ? 0.4 : 0) : 1);
    }
    case "heartbeat": {
      const p = (((t + seed * 0.37) % 1.1) + 1.1) % 1.1 / 1.1;
      const beat = Math.exp(-((p - 0.08) ** 2) / 0.002) + 0.7 * Math.exp(-((p - 0.28) ** 2) / 0.002);
      return Math.min(1, 0.4 + 0.5 * beat);
    }
    case "blink":
      return ((t + seed * 0.29) % 1.2 + 1.2) % 1.2 < 0.14 ? 1 : 0.12;
    case "strobe":
      return Math.sqrt(Math.max(0.15, Math.sin((t + seed * 0.41) * Math.PI * 2 * 0.9)));
    default:
      return 0;
  }
}

/** Share of its cycle a glint star is lit. */
export const GLINT_DUTY = 0.18;
/** A glint star's strength (0–1) at time `t`: spot `k` of a building lights briefly, in turn, about every 1.8 s. */
export function glintAlpha(t: number, k: number, seed: number): number {
  const ph = (((t * 0.55 + k * 0.618 + seed * 0.1) % 1) + 1) % 1;
  return ph < GLINT_DUTY ? Math.sin((ph / GLINT_DUTY) * Math.PI) : 0;
}
