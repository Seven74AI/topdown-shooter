/**
 * Placeholder sounds synthesized with the Web Audio API (no files yet). Names follow the asset rule
 * (`weapon_pistol_fire` …) so Story 9.10 swaps in real recordings. iOS keeps audio locked until a
 * user gesture: call `unlockAudio()` from the first touch.
 */
export type SfxName = "weapon_pistol_fire" | "weapon_machete_swing" | "weapon_reload_start" | "weapon_reloaded" | "zombie_hit" | "building_repaired" | "turret_fire";

const MASTER_GAIN = 0.25;
const HIT_MIN_INTERVAL_S = 0.03;

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let lastHitAt = -1;
let lastTurretAt = -1;
/** Story 3.6: four turrets fire 20 shots/s together; one soft click per 80 ms at most. */
const TURRET_MIN_INTERVAL_S = 0.08;

function context(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  if (!Ctor) return null;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = MASTER_GAIN;
  master.connect(ctx.destination);
  noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
  const data = noise.getChannelData(0);
  let seed = 1; // tiny LCG: deterministic noise, no Math.random needed
  for (let i = 0; i < data.length; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    data[i] = (seed / 4294967296) * 2 - 1;
  }
  return ctx;
}

export function unlockAudio(): void {
  const c = context();
  if (c && c.state === "suspended") void c.resume();
}

function burst(c: AudioContext, at: number, durS: number, gain: number, filterHz: number): void {
  if (!noise || !master) return;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = filterHz;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + durS);
  src.connect(f).connect(g).connect(master);
  src.start(at);
  src.stop(at + durS);
}

/** Noise through a band-pass whose center sweeps from `fromHz` to `toHz` (a whoosh). */
function sweep(c: AudioContext, at: number, durS: number, gain: number, fromHz: number, toHz: number): void {
  if (!noise || !master) return;
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.Q.value = 1.5;
  f.frequency.setValueAtTime(fromHz, at);
  f.frequency.exponentialRampToValueAtTime(toHz, at + durS);
  const g = c.createGain();
  g.gain.setValueAtTime(0.001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + durS * 0.3);
  g.gain.exponentialRampToValueAtTime(0.001, at + durS);
  src.connect(f).connect(g).connect(master);
  src.start(at);
  src.stop(at + durS);
}

function click(c: AudioContext, at: number, hz: number, gain: number): void {
  if (!master) return;
  const o = c.createOscillator();
  o.frequency.value = hz;
  const g = c.createGain();
  g.gain.setValueAtTime(gain, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + 0.04);
  o.connect(g).connect(master);
  o.start(at);
  o.stop(at + 0.05);
}

export function playSfx(name: SfxName): void {
  const c = context();
  if (!c || c.state !== "running") return;
  const t = c.currentTime;
  switch (name) {
    case "weapon_pistol_fire":
      burst(c, t, 0.06, 0.9, 3500);
      click(c, t, 200, 0.5);
      break;
    case "weapon_machete_swing":
      sweep(c, t, 0.12, 0.5, 900, 3200); // whoosh: noise through a rising band-pass
      break;
    case "weapon_reload_start":
      click(c, t, 900, 0.3);
      click(c, t + 0.12, 700, 0.3);
      break;
    case "weapon_reloaded":
      click(c, t, 1200, 0.35);
      break;
    case "building_repaired": // Story 3.7: two hammer knocks
      burst(c, t, 0.05, 0.6, 1200);
      burst(c, t + 0.11, 0.05, 0.6, 1500);
      break;
    case "turret_fire": // Story 3.6: a soft, high, short tick (quieter than a gun)
      if (t - lastTurretAt < TURRET_MIN_INTERVAL_S) return;
      lastTurretAt = t;
      burst(c, t, 0.03, 0.35, 5000);
      click(c, t, 1400, 0.15);
      break;
    case "zombie_hit":
      if (t - lastHitAt < HIT_MIN_INTERVAL_S) return;
      lastHitAt = t;
      burst(c, t, 0.05, 0.4, 500);
      break;
  }
}
